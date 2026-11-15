/* MarsWalk 3D terrain view (Three.js r128).
   Needs: MarsMap (map.js), MARS_DEM (dem-grid.js), MARS_IMAGES (images-data.js).
   World units are km: +X = east, -Z = north, +Y = up. */
(function () {
  const box = document.getElementById("mars-3d");
  const mapEl = document.getElementById("mars-map");
  const btn2 = document.getElementById("view2d");
  const btn3 = document.getElementById("view3d");
  const exagBox = document.getElementById("exagBox");
  const exagInput = document.getElementById("exag");
  const exagVal = document.getElementById("exagVal");
  if (!box || !mapEl || !btn2 || !btn3) return;

  const msg = document.createElement("div");
  msg.className = "mw-3d-msg";
  box.appendChild(msg);

  const E0 = -2600;                 // reference elevation (m) = height 0
  let ex = 2;                       // vertical exaggeration
  let ready = false, failed = false, active = false, fitted = false;
  let renderer, scene, camera, controls, mesh, geo, texBase, texHaz, dem;
  let baseMarker, siteMarkers = [], routesGroup, lastRoutes = [], badges = [];
  const D = window.MARS_DEM;
  const reg = () => window.MarsMap.region;

  window.addEventListener("marswalk:routes", e => { lastRoutes = e.detail || []; if (ready) buildRoutes(); });
  window.addEventListener("marswalk:base", () => { if (ready) placeAll(); });

  /* ---------- height + coordinate helpers ---------- */
  function elevM(u, v) {            // u: 0 west -> 1 east, v: 0 north -> 1 south (bilinear)
    const fx = Math.min(D.cols - 1, Math.max(0, u * (D.cols - 1)));
    const fy = Math.min(D.rows - 1, Math.max(0, v * (D.rows - 1)));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(D.cols - 1, x0 + 1), y1 = Math.min(D.rows - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const a = dem[y0 * D.cols + x0], b = dem[y0 * D.cols + x1];
    const c = dem[y1 * D.cols + x0], d = dem[y1 * D.cols + x1];
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }
  const hKm = m => (m - E0) / 1000 * ex;
  function worldPos(x, y, lift) {   // map pixel -> 3D position on the terrain
    const r = reg(), u = x / r.widthPx, v = y / r.heightPx;
    return new THREE.Vector3((u - 0.5) * r.widthKm, hKm(elevM(u, v)) + (lift || 0), (v - 0.5) * r.heightKm);
  }

  /* ---------- textures ---------- */
  const loadImg = src => new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("image failed: " + String(src).slice(0, 30))); i.src = src;
  });
  async function makeTextures() {
    const imgs = window.MARS_IMAGES || {};
    const base = await loadImg(imgs.base || reg().image);
    let slope = null;
    try { slope = await loadImg(imgs.slope || "slope-overlay.png"); } catch (e) { /* hazard texture optional */ }
    const S = 2048, aniso = renderer.capabilities.getMaxAnisotropy();
    const make = withHazard => {
      const c = document.createElement("canvas"); c.width = c.height = S;
      const g = c.getContext("2d");
      g.drawImage(base, 0, 0, S, S);
      if (withHazard && slope) g.drawImage(slope, 0, 0, S, S);
      const t = new THREE.CanvasTexture(c); t.anisotropy = aniso; return t;
    };
    texBase = make(false);
    texHaz = slope ? make(true) : texBase;
  }

  /* ---------- markers ---------- */
  function label(text, y, color) {  // small round badge (B, 1, 2), same as the 2D pins; names are in the legend
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d");
    g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2);
    g.fillStyle = color; g.fill();
    g.lineWidth = 6; g.strokeStyle = "#ffffff"; g.stroke();
    g.font = "bold 64px Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#101827";
    g.fillText(text, 64, 68);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    sp.scale.set(1.4, 1.4, 1); sp.position.y = y; sp.renderOrder = 10;
    return sp;
  }
  function makeMarker(color, hex, text, level) {
    const lift = 1.0 + level * 0.6;
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, lift, 8), new THREE.MeshBasicMaterial({ color: hex }));
    pole.position.y = lift / 2; g.add(pole);
    const sp = label(text, lift + 0.7, color);
    g.add(sp);
    badges.push({ sp, g });
    scene.add(g);
    return g;
  }
  function buildMarkers() {
    baseMarker = makeMarker("#39c5bb", 0x39c5bb, "B", 0);
    siteMarkers = reg().sites.map((s, i) => ({ site: s, group: makeMarker("#ff844b", 0xff844b, String(i + 1), i + 1) }));
    // legend with the names
    const legend = document.createElement("div");
    legend.style.cssText = "position:absolute;left:12px;top:12px;background:rgba(16,24,39,.85);border:1px solid #45546a;" +
      "border-radius:10px;padding:8px 12px;font:12px/1.7 Arial,sans-serif;color:#e5e7eb;text-align:left;pointer-events:none";
    const row = (badge, color, name) => {
      const d = document.createElement("div"), b = document.createElement("b");
      b.textContent = badge; b.style.cssText = "display:inline-block;width:18px;color:" + color;
      d.appendChild(b); d.appendChild(document.createTextNode(name)); legend.appendChild(d);
    };
    row("B", "#39c5bb", "Base");
    reg().sites.forEach((s, i) => row(String(i + 1), "#ff844b", s.name));
    box.appendChild(legend);
  }
  function placeAll() {
    const b = window.MarsMap.getBase();
    baseMarker.position.copy(worldPos(b.x, b.y));
    siteMarkers.forEach(m => m.group.position.copy(worldPos(m.site.x, m.site.y)));
  }

  /* ---------- routes ---------- */
  function buildRoutes() {
    while (routesGroup.children.length) {
      const o = routesGroup.children.pop(); o.geometry.dispose(); o.material.dispose();
    }
    lastRoutes.forEach(r => {
      const pts = [];
      for (let i = 0; i < r.points.length - 1; i++) {
        const a = r.points[i], b = r.points[i + 1];
        const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 12));
        for (let k = 0; k < n; k++) pts.push(worldPos(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, 0.08));
      }
      const last = r.points[r.points.length - 1];
      if (last) pts.push(worldPos(last[0], last[1], 0.08));
      if (pts.length < 2) return;
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.06, 6, false),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(r.color || "#ff844b") }));
      routesGroup.add(tube);
    });
  }

  /* ---------- terrain mesh ---------- */
  function applyHeights() {
    const pos = geo.attributes.position;
    for (let i = 0; i < dem.length; i++) pos.setY(i, hKm(dem[i]));
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    placeAll();
    buildRoutes();
  }
  function applyToggles() {
    const on = id => { const c = document.getElementById(id); return !c || c.checked; };
    siteMarkers.forEach(m => { m.group.visible = on("tSites"); });
    routesGroup.visible = on("tRoutes");
    mesh.material.map = on("tHaz") ? texHaz : texBase;
    mesh.material.needsUpdate = true;
  }
  function resize() {
    if (!renderer) return;
    const w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function orbit(deg) {            // turn the camera around the terrain (left/right)
    const t = controls.target, a = deg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    const ox = camera.position.x - t.x, oz = camera.position.z - t.z;
    camera.position.set(t.x + ox * c - oz * sn, camera.position.y, t.z + ox * sn + oz * c);
    controls.update();
  }
  function buildControlsBar() {
    const bar = document.createElement("div");
    bar.style.cssText = "position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:flex;flex-wrap:wrap;justify-content:center;gap:8px;";
    const off = "rgba(16,24,39,.88)";
    const mk = (txt, title, fn) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = txt; b.title = title;
      b.style.cssText = "background:" + off + ";color:#e5e7eb;border:1px solid #45546a;border-radius:8px;padding:8px 14px;cursor:pointer;font:14px Arial,sans-serif";
      b.addEventListener("click", fn); bar.appendChild(b); return b;
    };
    mk("Rotate ⟲", "Rotate the view left", () => orbit(-20));
    mk("Rotate ⟳", "Rotate the view right", () => orbit(20));
    const auto = mk("Auto-rotate", "Slowly spin the terrain", () => {
      controls.autoRotate = !controls.autoRotate;
      auto.style.background = controls.autoRotate ? "#ff844b" : off;
      auto.style.color = controls.autoRotate ? "#101827" : "#e5e7eb";
    });
    mk("Reset view", "Back to the starting view", () => { controls.autoRotate = false; auto.style.background = off; auto.style.color = "#e5e7eb"; fitCamera(); });
    box.appendChild(bar);
    controls.autoRotateSpeed = 1.5;
    // touchpad: a sideways two-finger swipe also turns the view
    renderer.domElement.addEventListener("wheel", e => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); orbit(e.deltaX * 0.15); }
    }, { passive: false });
  }

  function fitCamera() {            // start far enough to see the whole terrain, even on narrow screens
    const dist = 46 / Math.min(1, camera.aspect / 1.5);
    camera.position.set(0, dist * 0.5, dist * 0.87);
    controls.target.set(0, 0.5, 0);
    controls.update();
  }

  /* ---------- init (runs the first time 3D is opened) ---------- */
  async function init() {
    if (!window.THREE || !THREE.OrbitControls) throw new Error("Three.js did not load. Check your internet connection.");
    if (!D) throw new Error("dem-grid.js is missing.");
    const raw = Uint8Array.from(atob(D.b64), c => c.charCodeAt(0));
    dem = new Int16Array(raw.buffer, 0, raw.length / 2);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    box.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    camera.position.set(0, 22, 38);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.5, 0);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 1.5;
    controls.maxDistance = 120;
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 0.35);
    sun.position.set(-20, 30, 10);
    scene.add(sun);

    await makeTextures();

    const r = reg();
    geo = new THREE.PlaneGeometry(r.widthKm, r.heightKm, D.cols - 1, D.rows - 1);
    geo.rotateX(-Math.PI / 2);        // plane now lies flat; vertex order = DEM order (row 0 = north)
    mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: texBase }));
    scene.add(mesh);

    routesGroup = new THREE.Group();
    scene.add(routesGroup);
    buildMarkers();
    applyHeights();
    applyToggles();

    ["tSites", "tRoutes", "tHaz"].forEach(id => {
      const c = document.getElementById(id);
      if (c) c.addEventListener("change", applyToggles);
    });
    buildControlsBar();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(box);
    window.addEventListener("resize", resize);
    ready = true;
  }

  /* ---------- view switching ---------- */
  function loop() {
    if (!active) return;
    requestAnimationFrame(loop);
    controls.update();
    badges.forEach(b => {          // keep the badges a steady size on screen (not huge when zoomed in)
      const d = Math.hypot(camera.position.x - b.g.position.x, camera.position.y - (b.g.position.y + b.sp.position.y), camera.position.z - b.g.position.z);
      const k = Math.min(3, Math.max(0.5, d * 0.035));
      b.sp.scale.set(k, k, 1);
    });
    renderer.render(scene, camera);
  }
  async function show3D() {
    mapEl.hidden = true; box.hidden = false;
    btn3.classList.add("active"); btn2.classList.remove("active");
    exagBox.hidden = false;
    if (!ready && !failed) {
      msg.hidden = false; msg.textContent = "Loading 3D terrain…";
      try { await init(); }
      catch (e) { failed = true; console.error("MarsWalk 3D:", e); msg.textContent = "3D view unavailable: " + e.message; return; }
    }
    if (failed) { msg.hidden = false; return; }
    msg.hidden = true;
    resize();
    if (!fitted) { fitCamera(); fitted = true; }
    active = true;
    loop();
  }
  function show2D() {
    active = false;
    box.hidden = true; mapEl.hidden = false;
    btn2.classList.add("active"); btn3.classList.remove("active");
    exagBox.hidden = true;
    if (window.MarsMap) window.MarsMap.map.invalidateSize();
  }
  btn2.addEventListener("click", show2D);
  btn3.addEventListener("click", show3D);
  exagInput.addEventListener("input", () => {
    ex = Number(exagInput.value);
    exagVal.textContent = "×" + ex;
    if (ready) applyHeights();
  });
})();
