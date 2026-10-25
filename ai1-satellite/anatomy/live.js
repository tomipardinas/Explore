const D = __DATA__;
const M = makeModel();
const stage = document.querySelector(".ai-stage");
const svg = stage.querySelector("svg");
const sat = svg.querySelector(".ai-sat");
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
    POWER.forEach((list, li) => {
      if (li === 1) return;
      const n2 = list.length;
      const h2 = Math.floor(clock * (4 + 10 * s.load)) % (n2 + 4);
      for (let j = 0; j < 2; j++) if (list[h2 - j]) want.add(list[h2 - j]);
    });
  }
  for (const el of lit) if (!want.has(el)) { el.removeAttribute("data-hot"); lit.delete(el); }
  for (const el of want) if (!lit.has(el)) { el.setAttribute("data-hot", ""); lit.add(el); }
}

// ---------- chips, pumps and lamps follow the load ----------
const chips = [...sat.querySelectorAll("[data-chip]")];
const pumpA = sat.querySelector('[data-pump="a"]');
const leds = [...sat.querySelectorAll(".ai-led")];
function chipsAt(s) {
  const on = s.load > 0.02;
  for (const el of chips) el.toggleAttribute("data-on", on && tray.x < 0.98);
  pumpA?.toggleAttribute("data-on", s.load > 0.001);
  sat.style.setProperty("--ai-heat", (0.25 + 0.75 * s.load).toFixed(3));
}

// ---------- loop, tour, input ----------
const load = { x: 0.8, target: 0.8 };
let frame = 0, last = 0, clock = 0, tourClock = 0, touring = !still.matches, visible = false, idle = 0, said = "";
const TOUR = (t) => {
  const c = t % 18;
  const l = c < 6 ? 0.35 + 0.65 * (c / 6) : c < 12 ? 1 : 1 - 0.55 * ((c - 12) / 6);
  return { load: l, tray: c > 13.2 && c < 15.8 ? 1 : 0 };
};
function say(s) {
  const text = `${s.compute.toFixed(0)} kW · ${s.flow.toFixed(1)} kg/s · ${s.cold.toFixed(0)}→${s.hot.toFixed(0)} °C`;
  if (text !== said) { readout.textContent = text; said = text; }
}
function describe() {
  const s = M.state(load.target);
  stage.setAttribute("aria-valuenow", String(Math.round(load.target * 100)));
  stage.setAttribute("aria-valuetext", `${s.compute.toFixed(0)} kilowatts, coolant ${s.flow.toFixed(1)} kilograms per second, tray ${tray.target > 0.5 ? "in" : "out"}`);
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
    tray.target = t.tray;
  }
  load.x = calm ? load.target : load.x + (load.target - load.x) * (1 - Math.exp(-dt / 0.35));
  if (Math.abs(load.x - load.target) < 1e-4) load.x = load.target;
  const moving = springTray(dt, calm);
  place();
  const s = M.state(load.x);
  chipsAt(s);
  flows(clock, s, calm);
  say(s);
  const settled = calm && !moving && load.x === load.target;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
function steer() {
  touring = false;
  clearTimeout(idle);
  idle = setTimeout(() => { touring = !still.matches; tourClock = 0; run(); }, 3600);
  describe();
  run();
}
function toggleTray() {
  tray.target = tray.target > 0.5 ? 0 : 1;
  status.textContent = tray.target > 0.5 ? "GPU tray sliding into the rack" : "GPU tray sliding out";
  steer();
}
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
stage.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  const box = svg.getBoundingClientRect();
  load.target = clamp(((event.clientX - box.left) / box.width - 0.15) / 0.7, 0, 1);
  steer();
});
stage.addEventListener("click", (event) => {
  if (event.target.closest('[data-name^="tray."], [data-tray]')) toggleTray();
  else if (event.pointerType === "touch" || event.detail === 0) return;
});
stage.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 0.25 : 0.1;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") load.target = clamp(load.target + step, 0, 1);
  else if (event.key === "ArrowLeft" || event.key === "ArrowDown") load.target = clamp(load.target - step, 0, 1);
  else if (event.key === "Home") load.target = 0;
  else if (event.key === "End") load.target = 1;
  else if (event.key === " " || event.key === "t" || event.key === "T" || event.key === "Enter") { event.preventDefault(); toggleTray(); return; }
  else if (event.key === "Escape") { load.target = 0; }
  else return;
  event.preventDefault();
  steer();
});
stage.addEventListener("focus", () => { describe(); status.textContent = `${Math.round(load.target * 100)}% load, tray ${tray.target > 0.5 ? "in" : "out"}`; });
place();
chipsAt(M.state(load.x));
say(M.state(load.x));
describe();
