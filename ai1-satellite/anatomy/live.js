const D = __DATA__;
const M = makeModel();
const stage = document.querySelector(".ai-stage");
const svg = stage.querySelector("svg");
const sat = svg.querySelector(".ai-sat");
const craft = svg.querySelector(".ai-craft");
const stars = svg.querySelector(".ai-stars");
const readout = document.querySelector("[data-readout]");
const status = stage.querySelector("[data-status]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- depth-sorted items; the tray's items slide and re-sort ----------
const nodes = [...sat.querySelectorAll(":scope > .it")].map((el) => {
  const m = el.dataset.m ? el.dataset.m.split(",").map(Number) : null;
  return { el, key: Number(el.dataset.k), m, lift: m ? m[0] * D.V[0] + m[1] * D.V[1] + m[2] * D.V[2] : 0, shown: "" };
});
let order = nodes.map((_, i) => i);
const tray = { x: 0, v: 0, target: 0 };
function place() {
  const share = tray.x;
  for (const node of nodes) {
    if (!node.m) continue;
    const tx = (D.EX[0] * node.m[0] + D.EY[0] * node.m[1] + D.EZ[0] * node.m[2]) * share;
    const ty = (D.EX[1] * node.m[0] + D.EY[1] * node.m[1] + D.EZ[1] * node.m[2]) * share;
    const text = share === 0 ? "" : `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`;
    if (text !== node.shown) {
      node.shown = text;
      if (text) node.el.setAttribute("transform", text);
      else node.el.removeAttribute("transform");
    }
  }
  const next = nodes.map((_, i) => i).sort((a, b) => nodes[a].key + nodes[a].lift * share - (nodes[b].key + nodes[b].lift * share));
  if (next.some((index, i) => index !== order[i])) {
    const fragment = document.createDocumentFragment();
    for (const index of next) fragment.appendChild(nodes[index].el);
    sat.appendChild(fragment);
    order = next;
  }
}
function springTray(dt, calm) {
  if (calm) {
    tray.x = tray.target;
    tray.v = 0;
    return false;
  }
  const { stiffness, damping, substeps } = D.spring;
  const h = dt / substeps;
  for (let i = 0; i < substeps; i++) {
    tray.v += ((tray.target - tray.x) * stiffness - tray.v * damping) * h;
    tray.x += tray.v * h;
  }
  if (Math.abs(tray.target - tray.x) < 1e-3 && Math.abs(tray.v) < 1e-3) {
    tray.x = tray.target;
    tray.v = 0;
    return false;
  }
  return true;
}

// ---------- flows: pulses that run chunk by chunk along the lines ----------
const chunks = {};
for (const el of sat.querySelectorAll("[data-route]")) (chunks[el.dataset.route] ??= []).push(el);
for (const list of Object.values(chunks)) list.sort((a, b) => a.dataset.chunk - b.dataset.chunk);
const seq = (names) => names.flatMap((n) => chunks[n] ?? []);
const LOOP = seq(["pipe.supply", "tray.loop0", "tray.loop1", "tray.loop2", "tray.loop3", "tray.loop4", "tray.loop5", "tray.loop6", "pipe.hot", "pipe.radout"]);
const TRAY_SET = new Set(seq(["tray.loop0", "tray.loop1", "tray.loop2", "tray.loop3", "tray.loop4", "tray.loop5", "tray.loop6"]));
const POWER = [seq(["harness.solar"]), seq(["harness.battery"])];
const DATA_LINES = { lasers: [seq(["data.laser"])], computer: [seq(["data.fc"]), seq(["ctrl.pumps"]), seq(["ctrl.battery"])], power: [seq(["harness.battery"]), seq(["ctrl.battery"])] };
const lit = new Set();
function flows(clock, s, calm) {
  const want = new Set();
  if (!calm && s.load > 0.001) {
    // coolant: three slugs spaced round the loop, moving at a speed set by the pump flow
    const n = LOOP.length;
    const head = clock * (2 + 9 * s.pump);
    for (let p = 0; p < 3; p++) {
      const h = Math.floor(head + (p * n) / 3) % n;
      for (let j = 0; j < 3; j++) {
        const el = LOOP[(h - j + n) % n];
        if (TRAY_SET.has(el) && tray.x > 0.02) continue;
        want.add(el);
      }
    }
    // power: pulses into the shelf, closer together as the draw rises
    const pulse = (list, rate) => {
      const n2 = list.length;
      const h2 = Math.floor(clock * rate) % (n2 + 4);
      for (let j = 0; j < 2; j++) if (list[h2 - j]) want.add(list[h2 - j]);
    };
    pulse(POWER[0], 4 + 10 * s.load);
    // data and control: only for the system being looked at, so the picture stays calm
    for (const list of DATA_LINES[active] ?? []) pulse(list, 9);
  }
  for (const el of lit) if (!want.has(el)) { el.removeAttribute("data-hot"); lit.delete(el); }
  for (const el of want) if (!lit.has(el)) { el.setAttribute("data-hot", ""); lit.add(el); }
}

// ---------- chips, pumps and lamps follow the load ----------
const chips = [...sat.querySelectorAll("[data-chip]")];
const pumpA = sat.querySelector('[data-pump="a"]');
function chipsAt(s) {
  const on = s.load > 0.02;
  for (const el of chips) el.toggleAttribute("data-on", on && tray.x < 0.98);
  pumpA?.toggleAttribute("data-on", s.load > 0.001);
  sat.style.setProperty("--ai-heat", (0.25 + 0.75 * s.load).toFixed(3));
}

// ---------- systems: pick one, the rest steps back and it shows what it does ----------
const SYS = Object.fromEntries(D.systems.map((sys) => [sys.id, sys]));
const ORDER = D.systems.map((sys) => sys.id);
const bySys = {};
for (const el of sat.querySelectorAll(".it[data-sys]")) (bySys[el.dataset.sys] ??= []).push(el);
const buttons = [...document.querySelectorAll(".ai-part")];
const fxs = [...svg.querySelectorAll("[data-fx]")];
const info = { name: document.querySelector("[data-info-name]"), text: document.querySelector("[data-info-text]"), stat: document.querySelector("[data-info-stat]") };
const slider = document.getElementById("ai-load");
const loadOut = document.querySelector("[data-load-out]");
let active = "", hover = "", pinned = "", shownSys = null, statSaid = "";
const n0 = (v) => v.toFixed(0);
const STAT = {
  rack: (s) => `${n0(s.compute)} kW · ${s.perGpu.toFixed(2)} kW per GPU`,
  tray: (s) => `${(s.compute / M.trays).toFixed(1)} kW on this tray`,
  coolant: (s) => `${s.flow.toFixed(1)} kg/s · ${n0(s.cold)}→${n0(s.hot)} °C · pumps ${n0(s.pump * 100)}%`,
  radiator: (s) => `≈${n0(s.radT)} °C · ${n0(s.compute)} kW shed`,
  wings: (s) => `${n0(M.solar)} kW in · ${n0(s.margin)} kW spare`,
  power: (s) => `${n0(s.sun)} kW to the bus`,
  lasers: () => "3 optical links",
  computer: () => `${M.house} kW house load`,
  trackers: () => "2 star cameras",
  thruster: () => "argon · electric",
};
function show(id) {
  if (id === shownSys) return;
  shownSys = id;
  if (id) sat.dataset.focus = id; else delete sat.dataset.focus;
  for (const [key, list] of Object.entries(bySys)) for (const el of list) el.toggleAttribute("data-pick", key === id);
  for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.sys === (pinned || id)));
  for (const el of fxs) el.toggleAttribute("data-run", el.dataset.fx === id);
  const sys = SYS[id] ?? SYS[ORDER[0]];
  info.name.textContent = sys.name;
  info.text.textContent = sys.text;
  statSaid = "";
}
function stat(s) {
  const fn = STAT[shownSys];
  const text = fn ? fn(s) : "";
  if (text !== statSaid) { info.stat.textContent = text; statSaid = text; }
}

// ---------- loop, tour, input ----------
const load = { x: 0.8, target: 0.8 };
let frame = 0, last = 0, clock = 0, tourClock = 0, touring = !still.matches, visible = false, idle = 0, said = "", trayHeld = false;
const STEP = 5;
const TOUR = (t) => {
  const c = t % 18;
  const l = c < 6 ? 0.35 + 0.65 * (c / 6) : c < 12 ? 1 : 1 - 0.55 * ((c - 12) / 6);
  return { load: l, sys: ORDER[Math.floor(t / STEP) % ORDER.length] };
};
function say(s) {
  const text = `${s.compute.toFixed(0)} kW · ${s.flow.toFixed(1)} kg/s · ${s.cold.toFixed(0)}→${s.hot.toFixed(0)} °C`;
  if (text !== said) { readout.textContent = text; said = text; }
}
function syncSlider() {
  const v = Math.round(load.target * 100);
  if (Number(slider.value) !== v) slider.value = String(v);
  loadOut.textContent = `${v}%`;
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  clock += dt;
  if (touring) {
    tourClock += dt;
    const t = TOUR(tourClock);
    load.target = t.load;
    active = t.sys;
    syncSlider();
  } else active = hover || pinned;
  // the rack view slides the tray home; everything else shows it pulled out, unless the reader chose
  if (!trayHeld) tray.target = active === "rack" ? 1 : 0;
  show(active);
  load.x = calm ? load.target : load.x + (load.target - load.x) * (1 - Math.exp(-dt / 0.35));
  if (Math.abs(load.x - load.target) < 1e-4) load.x = load.target;
  const moving = springTray(dt, calm);
  place();
  const s = M.state(load.x);
  chipsAt(s);
  flows(clock, s, calm);
  say(s);
  stat(s);
  if (!calm) {
    // floating: a slow bob and the stars sliding past as the orbit carries it along
    craft.setAttribute("transform", `translate(0 ${(2.5 * Math.sin((clock * Math.PI * 2) / 7)).toFixed(2)})`);
    stars.setAttribute("transform", `translate(${(-((clock * 5) % D.W)).toFixed(1)} 0)`);
  }
  const settled = calm && !moving && load.x === load.target;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
function steer() {
  touring = false;
  clearTimeout(idle);
  if (!pinned && !hover) idle = setTimeout(resume, 4000);
  describe();
  run();
}
function resume() {
  if (pinned || hover || still.matches) return;
  touring = true;
  trayHeld = false;
  tourClock = Math.max(0, ORDER.indexOf(active)) * STEP;
  run();
}
function describe() {
  const s = M.state(load.target);
  status.textContent = `${SYS[pinned || hover]?.name ?? "Overview"}. ${s.compute.toFixed(0)} kilowatts, coolant ${s.flow.toFixed(1)} kilograms per second, tray ${tray.target > 0.5 ? "in" : "out"}.`;
}
function pin(id) {
  pinned = pinned === id ? "" : id;
  hover = "";
  if (pinned !== "tray") trayHeld = false;
  steer();
}
function toggleTray() {
  trayHeld = true;
  tray.target = tray.target > 0.5 ? 0 : 1;
  steer();
  status.textContent = tray.target > 0.5 ? "GPU tray sliding into the rack" : "GPU tray sliding out";
}
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
stage.addEventListener("pointerover", (event) => {
  if (event.pointerType === "touch") return;
  const el = event.target.closest(".it[data-sys]");
  const id = el ? el.dataset.sys : "";
  if (id === hover) return;
  hover = id;
  if (id) steer(); else { clearTimeout(idle); idle = setTimeout(resume, 4000); run(); }
});
stage.addEventListener("pointerleave", () => { hover = ""; clearTimeout(idle); idle = setTimeout(resume, 2500); run(); });
stage.addEventListener("click", (event) => {
  const el = event.target.closest(".it[data-sys]");
  if (!el) { if (pinned) pin(pinned); return; }
  const id = el.dataset.sys;
  if (id === "tray") { if (pinned !== "tray") pin("tray"); toggleTray(); return; }
  pin(id);
});
for (const b of buttons) b.addEventListener("click", () => pin(b.dataset.sys));
slider.addEventListener("input", () => { load.target = Number(slider.value) / 100; loadOut.textContent = `${slider.value}%`; steer(); });
stage.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 0.25 : 0.1;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") load.target = clamp(load.target + step, 0, 1);
  else if (event.key === "ArrowLeft" || event.key === "ArrowDown") load.target = clamp(load.target - step, 0, 1);
  else if (event.key === "Home") load.target = 0;
  else if (event.key === "End") load.target = 1;
  else if (event.key === " " || event.key === "t" || event.key === "T" || event.key === "Enter") { event.preventDefault(); toggleTray(); return; }
  else if (event.key === "Escape") { pinned = ""; }
  else return;
  event.preventDefault();
  syncSlider();
  steer();
});
stage.addEventListener("focus", describe);
if (still.matches) { pinned = ""; active = ""; }
place();
show(touring ? ORDER[0] : "");
chipsAt(M.state(load.x));
say(M.state(load.x));
stat(M.state(load.x));
syncSlider();
