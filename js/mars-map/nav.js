/* MarsWalk navigation engine (JavaScript port of the Java classes by the navigation teammate).
   RoutePlanner      -> astar()  + route profiles   (was Dijkstra on a demo graph; now A* on the real slope grid)
   SafeReturn        -> requiredTime()              (outbound + exploration + return + safety buffer <= available time)
   ScientificEvaluator -> siteScore()               (same weights: 0.5 / 0.3 / 0.2)
   MissionPlanner -> evaluate();  DecisionExplanation -> explainDecision() (same three cases and wording)
   Needs map.js first (MarsMap.terrainGrid). Runs when the page fires "marswalk:plan".
   Every number in CFG is a project assumption: edit here, nowhere else. */
(function () {
  const CFG = {
    walkSpeedMS: 0.6,            // EVA pace (same as the helmet)
    slopePenalty: 40,            // walking speed x (1 - slope/40): half speed at 20 degrees
    explorationMin: 20,          // time spent at the science site (demo value from SafeReturn.java)
    bufferFraction: 0.20,        // safety buffer = 20% of the mission time...
    bufferMinMin: 15,            // ...but never less than 15 minutes (SafeReturn.java value)
    weights: { importance: 0.5, accessibility: 0.3, timeSuitability: 0.2 },   // ScientificEvaluator.java
    preference: ["safest", "balanced", "fastest"],   // first one that fits the time budget is chosen
    profiles: {                  // cost of a step = length x (1 + slopeK x slope + hazardK x hazardLevel)
      fastest:  { label: "Fastest",  color: "#ff844b", slopeK: 0.04, hazardK: 0 },
      balanced: { label: "Balanced", color: "#8ab4ff", slopeK: 0.06, hazardK: 0.5 },
      safest:   { label: "Safest",   color: "#39c5bb", slopeK: 0.10, hazardK: 3 }
    }
  };

  let G = null, GS, PAR, CLOSED;          // grid + reusable search buffers
  const out = { last: null };

  function setupGrid() {
    if (G) return true;
    const MM = window.MarsMap, T = MM && MM.terrainGrid;
    if (!T) return false;
    const r = MM.region;
    G = { slope: T.slope, cols: T.cols, rows: T.rows, scale: T.scale, t: T.thresholds,
          W: r.widthPx, H: r.heightPx,
          dxM: r.widthKm * 1000 / T.cols, dyM: r.heightKm * 1000 / T.rows, widthM: r.widthKm * 1000, heightM: r.heightKm * 1000 };
    const N = G.cols * G.rows;
    GS = new Float32Array(N); PAR = new Int32Array(N); CLOSED = new Uint8Array(N);
    return true;
  }
  const slopeAt = i => G.slope[i] / G.scale;
  const cellOf = p => {
    const c = Math.min(G.cols - 1, Math.max(0, Math.floor(p.x / G.W * G.cols)));
    const r = Math.min(G.rows - 1, Math.max(0, Math.floor(p.y / G.H * G.rows)));
    return r * G.cols + c;
  };
  const centerPx = i => ({ x: ((i % G.cols) + 0.5) / G.cols * G.W, y: (Math.floor(i / G.cols) + 0.5) / G.rows * G.H });
  function factor(i, prof) {                 // Infinity = not passable
    const s = slopeAt(i);
    if (s >= G.t[2]) return Infinity;
    const h = s >= G.t[1] ? 2 : s >= G.t[0] ? 1 : 0;
    return 1 + prof.slopeK * s + prof.hazardK * h;
  }

  /* ---------- A* (8 directions, binary heap) ---------- */
  function search(si, gi, prof, r0, r1, c0, c1) {
    const cols = G.cols, N = cols * G.rows;
    GS.fill(Infinity); PAR.fill(-1); CLOSED.fill(0);
    const hk = [], hv = [];
    const push = (k, v) => {
      let i = hk.length; hk.push(k); hv.push(v);
      while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; }
      hk[i] = k; hv[i] = v;
    };
    const pop = () => {
      const rv = hv[0], lk = hk.pop(), lv = hv.pop(), n = hk.length;
      if (n > 0) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1; if (c >= n) break;
          if (c + 1 < n && hk[c + 1] < hk[c]) c++;
          if (hk[c] >= lk) break;
          hk[i] = hk[c]; hv[i] = hv[c]; i = c;
        }
        hk[i] = lk; hv[i] = lv;
      }
      return rv;
    };
    const gr = Math.floor(gi / cols), gc = gi % cols;
    const heur = i => Math.hypot(((i % cols) - gc) * G.dxM, (Math.floor(i / cols) - gr) * G.dyM);
    const fCache = new Float32Array(N).fill(-1);
    const fac = i => (fCache[i] >= 0 || fCache[i] === Infinity) ? fCache[i] : (fCache[i] = factor(i, prof));
    GS[si] = 0; push(heur(si), si);
    while (hk.length) {
      const cur = pop();
      if (CLOSED[cur]) continue;
      CLOSED[cur] = 1;
      if (cur === gi) {
        const path = []; for (let n = gi; n !== -1; n = PAR[n]) path.push(n);
        return path.reverse();
      }
      const cr = Math.floor(cur / cols), cc = cur % cols, fc = fac(cur);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = cr + dr, nc = cc + dc;
        if (nr < r0 || nr > r1 || nc < c0 || nc > c1) continue;
        const ni = nr * cols + nc;
        if (CLOSED[ni]) continue;
        const fn = fac(ni);
        if (fn === Infinity) continue;
        const ng = GS[cur] + Math.hypot(dc * G.dxM, dr * G.dyM) * (fc + fn) / 2;
        if (ng < GS[ni]) { GS[ni] = ng; PAR[ni] = cur; push(ng + heur(ni), ni); }
      }
    }
    return null;
  }
  function astar(startPx, goalPx, prof) {
    const si = cellOf(startPx), gi = cellOf(goalPx), cols = G.cols;
    if (factor(si, prof) === Infinity || factor(gi, prof) === Infinity) return null;
    const m = 80;                                  // search window first (fast), whole grid as fallback
    const sr = Math.floor(si / cols), sc = si % cols, gr = Math.floor(gi / cols), gc = gi % cols;
    let path = search(si, gi, prof, Math.max(0, Math.min(sr, gr) - m), Math.min(G.rows - 1, Math.max(sr, gr) + m),
                      Math.max(0, Math.min(sc, gc) - m), Math.min(cols - 1, Math.max(sc, gc) + m));
    if (!path) path = search(si, gi, prof, 0, G.rows - 1, 0, cols - 1);
    return path;
  }

  /* ---------- route numbers ---------- */
  function measure(path, startPx, goalPx) {
    let dist = 0, sec = 0, maxS = 0, sum = 0, med = 0;
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k];
      const len = Math.hypot(((b % G.cols) - (a % G.cols)) * G.dxM, (Math.floor(b / G.cols) - Math.floor(a / G.cols)) * G.dyM);
      const sa = slopeAt(a), sb = slopeAt(b), s = (sa + sb) / 2;
      dist += len;
      sec += len / (CFG.walkSpeedMS * Math.max(0.2, 1 - s / CFG.slopePenalty));
      maxS = Math.max(maxS, sa, sb); sum += s;
      if (s >= G.t[0]) med++;
    }
    const n = Math.max(1, path.length - 1);
    const points = path.map(i => { const p = centerPx(i); return [p.x, p.y]; });
    points[0] = [startPx.x, startPx.y]; points[points.length - 1] = [goalPx.x, goalPx.y];
    return {
      points, distanceKm: dist / 1000, timeMin: sec / 60, maxSlope: maxS, meanSlope: sum / n, shareMediumPlus: med / n,
      risk: maxS < G.t[0] ? "LOW" : maxS < G.t[1] ? "MEDIUM" : "HIGH"
    };
  }
  function routeFor(startPx, goalPx, name) {
    const path = astar(startPx, goalPx, CFG.profiles[name]);
    if (!path) return null;
    return Object.assign({ id: name, label: CFG.profiles[name].label, color: CFG.profiles[name].color }, measure(path, startPx, goalPx));
  }

  /* ---------- SafeReturn ---------- */
  function requiredTime(oneWayMin) {
    const core = 2 * oneWayMin + CFG.explorationMin;          // outbound + exploration + return (same path back)
    const buffer = Math.max(CFG.bufferMinMin, CFG.bufferFraction * core);
    return { core, buffer, total: core + buffer };
  }

  /* ---------- ScientificEvaluator ---------- */
  function siteScore(site, route, availableMin, requiredMin) {
    const w = CFG.weights;
    const importance = site.science != null ? site.science / (site.scienceMax || 10) * 10 : 5;
    const accessibility = Math.max(0, Math.min(10, 10 * (1 - route.maxSlope / G.t[2])));
    const timeSuitability = Math.max(0, Math.min(10, 10 * (1 - requiredMin / availableMin)));
    const total = w.importance * importance + w.accessibility * accessibility + w.timeSuitability * timeSuitability;
    return { importance, accessibility, timeSuitability, total };
  }

  /* ---------- MissionPlanner ---------- */
  function evaluateSite(site, base, availableMin) {
    const goal = { x: site.x, y: site.y }, routes = {};
    CFG.preference.forEach(n => { routes[n] = routeFor(base, goal, n); });
    Object.values(routes).forEach(r => { if (r) r.required = requiredTime(r.timeMin); });
    const fits = n => routes[n] && routes[n].required.total <= availableMin;
    const chosenName = CFG.preference.find(fits) || null;
    const quickest = Object.values(routes).filter(Boolean).sort((a, b) =>      // when nothing fits: report the quickest option (ties -> Fastest)
      Math.abs(a.required.total - b.required.total) < 0.5 ? (a.id === "fastest" ? -1 : b.id === "fastest" ? 1 : 0) : a.required.total - b.required.total)[0] || null;
    const ref = routes[chosenName] || quickest;
    const out2 = { site, routes, chosen: chosenName, feasible: !!chosenName, ref };
    if (ref) out2.score = siteScore(site, ref, availableMin, ref.required.total);
    return out2;
  }

  /* ---------- DecisionExplanation ---------- */
  const f1 = v => v.toFixed(1), f0 = v => Math.round(v);
  function explainChoice(ev, availableMin) {
    const r = ev.routes, c = ev.routes[ev.chosen];
    if (!ev.feasible) {
      const ref = ev.ref;
      if (!ref) return `No passable route to ${ev.site.name}: every path crosses terrain steeper than ${G.t[2]}°.`;
      const best = ref;
      return `NOT APPROVED for ${ev.site.name}: even the quickest option (${best.label}) needs ${f0(best.required.total)} min ` +
        `(${f0(best.timeMin)} min each way + ${CFG.explorationMin} min at the site + ${f0(best.required.buffer)} min safety buffer), but only ${f0(availableMin)} min are available.`;
    }
    let s = `${c.label} route chosen to ${ev.site.name}: ${f1(c.distanceKm)} km, ${f0(c.timeMin)} min each way, steepest section ${f1(c.maxSlope)}°. ` +
      `Total mission ${f0(c.required.total)} of ${f0(availableMin)} min, including the return and a ${f0(c.required.buffer)} min safety buffer.`;
    if (ev.chosen === "safest" && r.fastest && r.fastest.maxSlope > c.maxSlope + 0.5)
      s += ` The fastest route saves ${f0(c.timeMin - r.fastest.timeMin)} min but reaches ${f1(r.fastest.maxSlope)}° slopes.`;
    if (ev.chosen !== "safest" && r.safest)
      s += ` The safest route (max ${f1(r.safest.maxSlope)}°) would need ${f0(r.safest.required.total)} min, more than the time available.`;
    return s;
  }

  /* DecisionExplanation.java: explainDecision(), same three cases and wording */
  function explainDecision(site, score, requiredTime, availableTime, recommendedSite, recommendedScore) {
    if (requiredTime > availableTime)                                   // case 1: exceeds the time
      return `Site ${site} was not selected because it exceeds the available mission time by ${(requiredTime - availableTime).toFixed(1)} minutes.`;
    if (site === recommendedSite)                                       // case 2: the recommended site
      return `Site ${site} was selected because it has the highest scientific score (${score.toFixed(1)}) among time-feasible sites.`;
    return `Site ${site} is time-feasible, but its scientific score (${score.toFixed(1)}) is lower than Site ${recommendedSite} (${recommendedScore.toFixed(1)}).`;   // case 3
  }

  function evaluate(detail) {
    const base = detail.base, available = detail.minutes;
    const sites = window.MarsMap.region.sites;
    const evals = sites.map(s => evaluateSite(s, base, available));
    const sel = evals.find(e => e.site === detail.site || e.site.id === detail.site.id) || evals[0];
    const feasibleSites = evals.filter(e => e.feasible && e.score).sort((a, b) => b.score.total - a.score.total);
    const best = feasibleSites[0] || null;
    const approved = sel.feasible;
    const lines = [explainChoice(sel, available)];
    if (!best) lines.push("No site meets the mission time constraints.");
    evals.forEach(e => {                                               // MissionPlanner: one explanation per site
      lines.push(!e.ref
        ? `Site ${e.site.name} was not selected because no route is available.`
        : explainDecision(e.site.name, e.score.total, e.ref.required.total, available,
                          best ? best.site.name : "", best ? best.score.total : 0));
    });
    const route = sel.routes[sel.chosen] || null;
    return { status: approved ? "APPROVED" : "NOT APPROVED", selected: sel, recommended: best, evals, route, lines, availableMin: available, base };
  }

  /* ---------- helmet payload (helmet expects x = east, y = NORTH, in metres) ---------- */
  function toHelmet(res) {
    const r = res.route;
    if (!r) return { distanceMeters: 0, routePoints: [], missionStatus: "NO-GO" };
    const b = res.base;
    return {
      distanceMeters: Math.round(r.distanceKm * 1000),
      routePoints: r.points.map(p => ({ x: (p[0] - b.x) / G.W * G.widthM, y: (b.y - p[1]) / G.H * G.heightM })),
      missionStatus: res.status === "APPROVED" ? "GO" : "NO-GO"
    };
  }

  /* ---------- page wiring ---------- */
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
  function render(res) {
    const r = res.route, ref = res.selected.ref;
    const show = r || ref;
    if ($("distance")) $("distance").textContent = show ? f1(show.distanceKm) + " km" : "--";
    if ($("travel-time")) $("travel-time").textContent = show ? f0(show.timeMin) + " min each way" : "--";
    if ($("risk-level")) $("risk-level").textContent = show ? show.risk + " (max " + f1(show.maxSlope) + "°)" : "--";
    if ($("mission-status")) $("mission-status").textContent = res.status;
    if ($("result")) $("result").innerHTML = res.lines.map(esc).join("<br>");
    if ($("helmet-alert") && res.status !== "APPROVED") $("helmet-alert").textContent = "MISSION NOT APPROVED";
  }
  function drawRoutes(res) {
    const sel = res.selected, list = [];
    CFG.preference.slice().reverse().forEach(n => {        // draw the chosen one last, on top
      const r = sel.routes[n]; if (!r) return;
      list.push({ id: n, label: (n === sel.chosen ? "★ " : "") + r.label + (n === sel.chosen ? " (recommended)" : ""), color: r.color, points: r.points, distance: r.distanceKm });
    });
    if (sel.chosen) { const i = list.findIndex(x => x.id === sel.chosen); list.push(list.splice(i, 1)[0]); }
    window.MarsMap.setRoutes(list);
    window.MarsMap.fitPoints(res.base, { x: sel.site.x, y: sel.site.y });
  }

  window.addEventListener("marswalk:plan", e => {
    if (!setupGrid()) { if ($("result")) $("result").textContent = "Terrain data not loaded (terrain-grid.js)."; return; }
    const t0 = performance.now();
    const res = evaluate(e.detail);
    res.computeMs = Math.round(performance.now() - t0);
    out.last = res;
    drawRoutes(res);
    render(res);
    const hp = toHelmet(res);
    if (typeof window.updateHelmet === "function") window.updateHelmet(hp);
    window.dispatchEvent(new CustomEvent("marswalk:nav", { detail: { result: res, helmet: hp } }));
  });

  /* public API (helmet / emergency return / other code) */
  window.MarsNav = {
    config: CFG,
    get last() { return out.last; },
    evaluate: d => { setupGrid(); return evaluate(d); },
    toHelmet: res => { setupGrid(); return toHelmet(res); },
    returnRoute: fromPx => { setupGrid(); return routeFor(fromPx, window.MarsMap.getBase(), "safest"); }   // emergency return to base
  };
})();
