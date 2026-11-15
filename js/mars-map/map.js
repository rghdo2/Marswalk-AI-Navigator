/* MarsWalk: interactive Jezero map (Leaflet, image coordinates).
   Coordinates are IMAGE PIXELS: x right, y down, origin top-left.
   Public API: window.MarsMap  (see bottom of file). */

const REGION = {
  id: "jezero",
  name: "Jezero Crater",
  image: "jezero.jpg",                       // keep next to index.html
  widthPx: 1803, heightPx: 1800,
  // Extent read from the GeoTIFF: JEZ_ctx_B_soc_008_orthoMosaic_6m (MRO CTX, USGS)
  geo: { west: 77.1605, east: 77.6992, south: 18.2110, north: 18.7212 },
  widthKm: 30.29, heightKm: 30.24,
  base: null,                                // set below from lat/lon
  studyArea: { north: 18.435, south: 18.355, west: 77.410, east: 77.520 },  // analysed area (data team, Mars_Data.pdf)
  sites: [                                   // from the data team (Mars_Data.pdf): lat/lon, converted to pixels below
    { id: "hawksbill", name: "Hawksbill Gap", lat: 18.388, lon: 77.452, science: 5, scienceMax: 5,
      note: "Where Perseverance took its first delta samples (Delta Front campaign): fine-grained, clay-bearing mudstones, good candidates for preserving organics, and coarser sandstones that help date past lake activity." },
    { id: "seitah", name: "Séítah", lat: 18.362, lon: 77.478, science: 4, scienceMax: 5,
      note: "Crater-floor formation dominated by coarse-grained olivine, likely a cumulate from a thick magma body; gives access to the ancient floor units under the delta." }
  ],
  hazards: []                              // replaced by the terrain grid layer (terrain-data.js)
};

/* lat/lon -> image pixels (the image is equirectangular, so this is linear) */
const geoToPx = (lat, lon) => ({
  x: (lon - REGION.geo.west) / (REGION.geo.east - REGION.geo.west) * REGION.widthPx,
  y: (REGION.geo.north - lat) / (REGION.geo.north - REGION.geo.south) * REGION.heightPx
});
REGION.sites.forEach(s => { if (s.lat != null) Object.assign(s, geoToPx(s.lat, s.lon)); });
/* Base: just inside the analysed area, ~0.9 km south of the Octavia E. Butler landing site (18.4447N, 77.4508E) */
REGION.base = geoToPx(18.430, 77.4508);

const COLORS = { orange: "#ff844b", teal: "#39c5bb", blue: "#8ab4ff", red: "#ff5d5d", sun: "#ffd166", ink: "#101827" };

(function () {
  const el = document.getElementById("mars-map");
  if (!el || !window.L) { console.error("MarsMap: #mars-map or Leaflet missing"); return; }

  const H = REGION.heightPx, W = REGION.widthPx, g = REGION.geo;
  const kmPerPx = REGION.widthKm / W;
  const toLL = (x, y) => [H - y, x];
  const fromLL = ll => ({ x: ll.lng, y: H - ll.lat });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * kmPerPx;
  const pathKm = pts => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);
  const pxToGeo = p => ({ lon: g.west + p.x / W * (g.east - g.west), lat: g.north - p.y / H * (g.north - g.south) });

  const bounds = [[0, 0], [H, W]];
  const map = L.map(el, { crs: L.CRS.Simple, minZoom: -2, maxZoom: 3, zoomSnap: 0.25 });
  L.imageOverlay((window.MARS_IMAGES && MARS_IMAGES.base) || REGION.image, bounds).addTo(map);
  map.fitBounds(bounds);
map.zoomIn(1);
  map.setMaxBounds([[-H * .1, -W * .1], [H * 1.1, W * 1.1]]);
  map.attributionControl.addAttribution("Data: NASA/JPL Mars Trek · MRO CTX 6 m orthomosaic and CTX DTM 20 m (USGS Astrogeology)");
  L.control.scale({ metric: true, imperial: false, maxWidth: 140 }).addTo(map);

  const layers = { hazards: L.layerGroup().addTo(map), sites: L.layerGroup().addTo(map), routes: L.layerGroup().addTo(map), study: L.layerGroup(), terrain: L.layerGroup().addTo(map), grid: L.layerGroup() };
  const pin = (txt, bg) => L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 14],
    html: `<div class="mw-pin" style="background:${bg}">${txt}</div>` });

  REGION.hazards.forEach(h => L.polygon(h.polygon.map(p => toLL(p[0], p[1])),
    { color: COLORS.red, weight: 2, fillOpacity: .3, dashArray: "5 4" })
    .bindPopup(`<b>Hazard zone</b><br>Slope: ${h.slope}°<br>Avoid or cross with caution.`).addTo(layers.hazards));

(function studyRect() {                     // analysed area outline
  const a = REGION.studyArea, nw = geoToPx(a.north, a.west), se = geoToPx(a.south, a.east);
  L.rectangle([toLL(nw.x, nw.y), toLL(se.x, se.y)], { color: COLORS.teal, weight: 2, fill: false, dashArray: "8 6" })
    .bindTooltip("Data team study area", { sticky: true }).addTo(layers.study);
})();
const inStudy = p => { const g2 = pxToGeo(p), a = REGION.studyArea;
  return g2.lat <= a.north && g2.lat >= a.south && g2.lon >= a.west && g2.lon <= a.east; };

(function terrainLayer() {                // slope hazard raster computed from the USGS CTX DTM (20 m)
  L.imageOverlay((window.MARS_IMAGES && MARS_IMAGES.slope) || "slope-overlay.png", bounds, { interactive: false }).addTo(layers.terrain);
  const col = { medium: COLORS.sun, high: COLORS.orange, impassable: COLORS.red };
  const legend = L.control({ position: "bottomleft" });
  legend.onAdd = () => {
    const d = L.DomUtil.create("div", "mw-legend");
    d.style.maxWidth = "250px";            // keep the key compact on any theme
    d.innerHTML = `<b>Slope hazard</b> (USGS CTX DTM, 20 m)` +
      [["medium", "8–15°"], ["high", "15–20°"], ["impassable", "≥ 20°"]]
        .map(([k, v]) => `<div><i style="background:${col[k]}"></i>${k} ${v}</div>`).join("") +
      `<small>No tint = below 8°. Project thresholds, not NASA/JPL limits. Rocks smaller than 20 m are not visible.</small>`;
    return d;
  };
  legend.addTo(map);
})();

/* Terrain lookup (slope, hazard class, elevation) from the compact grids in terrain-grid.js */
const TG = (function () {
  const T = window.MARS_TERRAIN;
  if (!T) return null;
  const bytes = b64 => Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
  const eb = bytes(T.elevation.b64);
  return { T, slope: bytes(T.slope.b64), elev: new Int16Array(eb.buffer, 0, eb.length / 2) };
})();
function terrainAt(p) {
  if (!TG) return null;
  const S = TG.T.slope, E = TG.T.elevation, t = TG.T.thresholds;
  const cl = (v, n) => Math.min(n - 1, Math.max(0, Math.floor(v)));
  const s = TG.slope[cl(p.y / H * S.rows, S.rows) * S.cols + cl(p.x / W * S.cols, S.cols)] / S.scale;
  const el = TG.elev[cl(p.y / H * E.rows, E.rows) * E.cols + cl(p.x / W * E.cols, E.cols)];
  return { slope: s, hazard: s < t[0] ? "low" : s < t[1] ? "medium" : s < t[2] ? "high" : "impassable", elevation: el };
}


  REGION.sites.forEach((s, i) => L.marker(toLL(s.x, s.y), { icon: pin(i + 1, COLORS.orange), title: s.name })
    .bindPopup(`<b>${s.name}</b><br>${s.science != null ? "Scientific value: " + s.science + "/" + (s.scienceMax || 10) + "<br>" : ""}${s.note}`).addTo(layers.sites));

  let base = { ...REGION.base };
  const baseMarker = L.marker(toLL(base.x, base.y), { draggable: true, icon: pin("B", COLORS.teal), zIndexOffset: 1000, title: "Base" })
    .bindTooltip("Base", { direction: "top", offset: [0, -12] }).addTo(map);

  function setBase(p) {
    base = { x: Math.max(0, Math.min(W, p.x)), y: Math.max(0, Math.min(H, p.y)) };
    window.dispatchEvent(new CustomEvent("marswalk:base", { detail: { ...base, ...pxToGeo(base), inStudyArea: inStudy(base), terrain: terrainAt(base) } }));
  }
  baseMarker.on("drag", e => setBase(fromLL(e.target.getLatLng())));
  map.on("click", e => {
    const pick = document.getElementById("tPick");
    if (pick && pick.checked) { baseMarker.setLatLng(e.latlng); setBase(fromLL(e.latlng)); }
  });

  (function grid() {                       // 5 km scale grid
    const step = 5 / kmPerPx;
    for (let x = 0; x <= W; x += step) L.polyline([[0, x], [H, x]], { color: "#fff", weight: 1, opacity: .25 }).addTo(layers.grid);
    for (let y = 0; y <= H; y += step) L.polyline([[y, 0], [y, W]], { color: "#fff", weight: 1, opacity: .25 }).addTo(layers.grid);
  })();

  /* Routes. route = { id, label, color, points: [[x,y], ...] } in pixels */
  function setRoutes(list) {
    layers.routes.clearLayers();
    list.forEach(r => {
      r.distance = r.distance ?? pathKm(r.points.map(p => ({ x: p[0], y: p[1] })));
      L.polyline(r.points.map(p => toLL(p[0], p[1])), { color: r.color, weight: 4, opacity: .95 })
        .bindTooltip(`${r.label || r.id}: ${r.distance.toFixed(2)} km`, { sticky: true }).addTo(layers.routes);
    });
    window.dispatchEvent(new CustomEvent("marswalk:routes", { detail: list }));
  }

  const bind = (id, grp) => { const c = document.getElementById(id); if (c) c.onchange = () => c.checked ? layers[grp].addTo(map) : map.removeLayer(layers[grp]); };
  bind("tHaz", "terrain"); bind("tSites", "sites"); bind("tRoutes", "routes"); bind("tGrid", "grid"); bind("tStudy", "study");

  window.MarsMap = {
    region: REGION, map, kmPerPx,
    getBase: () => ({ ...base }),
    getBaseGeo: () => ({ ...pxToGeo(base), inStudyArea: inStudy(base), terrain: terrainAt(base) }),
    terrainAt,                        // terrainAt({x,y}) -> { slope (deg), hazard, elevation (m) }
    terrainGrid: TG && { slope: TG.slope, cols: TG.T.slope.cols, rows: TG.T.slope.rows, cellM: TG.T.slope.cellM, scale: TG.T.slope.scale, thresholds: TG.T.thresholds },
    setRoutes, kmBetween: dist, pathKm,
    toLatLng: toLL, fromLatLng: fromLL, pxToGeo, geoToPx,
    fitPoints: (a, b) => map.fitBounds(L.latLngBounds([toLL(a.x, a.y), toLL(b.x, b.y)]).pad(0.5))
  };
  window.dispatchEvent(new CustomEvent("marswalk:ready"));
  setBase(base);
})();
