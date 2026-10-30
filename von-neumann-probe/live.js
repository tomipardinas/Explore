const D = __DATA__;
const { P, DRILL, FURNACE, PLATE, BUILD_Z, BEAM, HEAD_Y, POSTS, TRAVEL, FEED, HOPPER, SPOUT } = D;
const K = { iso, depthOf, cylinder, extrude, slabOf, solidSvg, lineSvg, dotsSvg, ringSeam, segment, knurl, ring, pathOf };
const drawProbe = makeProbe(K);
const stage = document.querySelector(".vn-stage");
const svg = stage.querySelector("svg");
const $ = (name) => svg.querySelector(`[data-part="${name}"]`);
const el = { drill: $("drill"), ore: $("ore"), glow: $("glow"), feed: $("feed"), filament: $("filament"), daughter: $("daughter"), head: $("head") };
const gantry = [...svg.querySelectorAll("[data-gantry]")];
const lamps = [...svg.querySelectorAll("[data-lamp]")];
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const at = (p) => iso(p, P);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => t * t * (3 - 2 * t);
const span = ([a, b], p) => clamp((p - a) / (b - a));
const bump = ([a, b], p, edge = 0.18) => { const t = span([a, b], p); return ease(clamp(t / edge)) * ease(clamp((1 - t) / edge)); };
const V = [Math.cos((P.azimuth * Math.PI) / 180), Math.sin((P.azimuth * Math.PI) / 180)];
const viewAngle = Math.atan2(V[1], V[0]);
const PH = MODEL.phases;
const TOP = PROBE.top;

// a helical auger flight on a vertical bit: only the half that faces the viewer, ending on the limbs
function flight(cx, cy, r, z0, z1, pitch, phase) {
  const runs = [];
  let run = [];
  for (let z = z0; z <= z1; z += 0.35) {
    const a = ((z - z0) / pitch) * Math.PI * 2 + phase;
    const facing = Math.cos(a - viewAngle);
    if (facing > 0.02) run.push(at([cx + r * Math.cos(a), cy + r * Math.sin(a), z]));
    else if (run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  return runs.filter((r) => r.length > 1).map((r) => pathOf(r)).join("");
}

function drawDrill(p, t) {
  const down = bump(PH.mine, p, 0.3);
  const hz = 40 - down * 24;
  const [bx, by] = DRILL.bit;
  const spin = -t * 9 * (0.15 + 0.85 * bump(PH.mine, p, 0.12));
  const bit = solidSvg(cylinder(bx, by, 2.2, 5, hz - 5, P, 18), { tone: "mid", crease: "none", inner: lineSvg(flight(bx, by, 2.2, 5.4, hz - 0.4, 4.2, spin), { tone: "lo" }) });
  const h = DRILL.head;
  const head = solidSvg(slabOf(h, hz, 10, P, 2, 0.4), { tone: "mid" });
  const dots = dotsSvg([at([h.x + 2, h.y + h.d - 2, hz + 10]), at([h.x + h.w - 2, h.y + h.d - 2, hz + 10])], { size: 0.4 });
  const motor = solidSvg(cylinder(bx, by + 0.5, 3.6, hz + 10, 5, P, 24, 0.3), { tone: "mid", inner: lineSvg(knurl(bx, by + 0.5, 3.6, hz + 10.6, hz + 14.4, 18, P, 0.2), { tone: "faint" }) });
  el.drill.innerHTML = bit + head + dots + motor;
  // ore pellets falling from the spout into the hopper while the drill runs
  const flow = bump(PH.mine, p, 0.2);
  const [ox, oy] = SPOUT;
  const pellets = [];
  if (flow > 0.02) for (let i = 0; i < 3; i++) {
    const f = (t * 1.6 + i / 3) % 1;
    pellets.push([...at([ox + (i - 1) * 0.6, oy, 75.6 - f * 9]), flow * Math.sin(Math.PI * f)]);
  }
  el.ore.innerHTML = pellets.length ? dotsSvg(pellets, { size: 0.9, tone: "hi" }) : "";
  return down;
}

function drawGantry(p, t) {
  const out = span(PH.back, p);
  const home = 1 - span(PH.roll, p);
  const dy = -TRAVEL * ease(p >= PH.back[0] ? out : p < PH.roll[1] ? home : 0);
  const tr = translateAlong(P, [0, dy, 0]);
  for (const g of gantry) g.setAttribute("transform", tr);
  const printing = p >= PH.print[0] && p < PH.print[1];
  const done = span(PH.print, p);
  const cut = printing ? done * TOP : p >= PH.print[1] ? TOP : 0;
  const amp = Math.max(0.6, radiusAt(cut) - 3);
  const hx = PLATE.c[0] + (printing ? amp * Math.sin(t * 5.2) * bump(PH.print, p, 0.04) : -30 * (1 - bump(PH.print, p, 0.04)));
  const hy = HEAD_Y + 0.6;
  const tipZ = printing ? BUILD_Z + cut + 0.4 : 82;
  const car = { x: hx - 7, y: BEAM.y + BEAM.d + 1.2, w: 14, d: 7.2, r: 1 };
  let s = solidSvg(slabOf(car, 90, BEAM.z1 - 90, P, 2, 0.4), { tone: "mid" });
  s += dotsSvg([at([car.x + 2, car.y + 4, BEAM.z1]), at([car.x + car.w - 2, car.y + 4, BEAM.z1])], { size: 0.4 });
  s += solidSvg(cylinder(hx, hy, 3, BEAM.z1, 5, P, 24, 0.3), { tone: "mid" });
  s += solidSvg(cylinder(hx, hy, 2.2, 83, 7, P, 20), { tone: "mid" });
  const heat = printing ? 1 : 0;
  s += solidSvg(cylinder(hx, hy, 0.9, tipZ, 83 - tipZ, P, 12), { tone: "hi", crease: "none", lit: printing });
  if (heat) s += `<circle class="vn-tip" cx="${at([hx, hy, tipZ])[0].toFixed(1)}" cy="${at([hx, hy, tipZ])[1].toFixed(1)}" r="1.3" opacity="${(0.6 + 0.4 * Math.sin(t * 20)).toFixed(2)}"/>`;
  el.head.innerHTML = s;
  // filament along the beam top, from the inlet over the back post to the head motor
  const z = BEAM.z1;
  const by = BEAM.y + BEAM.d / 2, inlet = POSTS[0][0];
  el.filament.innerHTML = lineSvg(pathOf([at([inlet, by, z]), at([hx, by, z]), at([hx, hy - 2.9, z])]), { tone: "hi" }) + dotsSvg([at([inlet, by, z])], { size: 0.9, tone: "hi" });
  // feed line from the furnace tap to the feed box, which rides the back carriage
  const to = [FEED.to[0], FEED.to[1] + dy, FEED.to[2]];
  const mid = [FEED.to[0] - 14, FEED.from[1] + dy * 0.5, 26];
  const drop = [to[0], to[1], to[2] + 6];
  const flowing = p > PH.smelt[0] && p < PH.print[1];
  el.feed.innerHTML = `<g class="iso-wire" data-tone="mid">${lineSvg(pathOf([at(FEED.from), at(mid), at(drop), at(to)]), { tone: "mid", flow: flowing && !still.matches })}<circle class="iso-wire-end" cx="${at(FEED.from)[0].toFixed(1)}" cy="${at(FEED.from)[1].toFixed(1)}" r="1"/><circle class="iso-wire-end" cx="${at(to)[0].toFixed(1)}" cy="${at(to)[1].toFixed(1)}" r="1"/></g>`;
  return { cut, dy };
}

// once it lifts off, the daughter is nearer than the rolled-back gantry: paint it last
const slot = el.daughter.parentNode, slotNext = slot.nextSibling, scene = slot.parentNode;
let raised = false;
function raise(on) {
  if (on === raised) return;
  raised = on;
  if (on) scene.appendChild(slot);
  else scene.insertBefore(slot, slotNext);
}
function drawDaughter(p, cut) {
  const rise = ease(span(PH.launch, p));
  raise(rise > 0);
  const lift = rise * 120;
  const fade = 1 - ease(clamp((rise - 0.45) / 0.55));
  const [cx, cy] = PLATE.c;
  if (cut <= 0) { el.daughter.innerHTML = ""; return; }
  let s = "";
  if (rise > 0) {
    const burn = bump(PH.launch, p, 0.08) * fade;
    const z = BUILD_Z + lift + 8;
    const len = 14 + 22 * burn;
    const a = at([cx - 9, cy, z]), b = at([cx + 9, cy, z]), c = at([cx, cy, z - len]);
    s += `<path class="vn-plume" opacity="${(0.85 * burn).toFixed(2)}" d="M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${((a[0] + c[0]) / 2 - 2).toFixed(1)} ${((a[1] + c[1]) / 2).toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}Q${((b[0] + c[0]) / 2 + 2).toFixed(1)} ${((b[1] + c[1]) / 2).toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}Z"/>`;
  }
  s += drawProbe(cx, cy, BUILD_Z + lift, P, { cut: BUILD_Z + lift + cut, tone: "hi", crease: "lo", live: p >= PH.print[0] && p < PH.print[1] });
  el.daughter.innerHTML = s;
  el.daughter.setAttribute("opacity", fade.toFixed(3));
}

let gen = 0;
function phaseText(p) {
  if (p >= PH.launch[0]) return "launch";
  if (p >= PH.back[0]) return "gantry back";
  if (p >= PH.print[0]) return `printing ${Math.round(span(PH.print, p) * 100)}%`;
  if (p >= PH.smelt[0] + 0.06) return "smelting";
  return "mining";
}
function draw(p, t) {
  drawDrill(p, t);
  el.glow.style.opacity = (0.95 * bump(PH.smelt, p, 0.25) + 0.25 * bump(PH.print, p, 0.1)).toFixed(3);
  const { cut } = drawGantry(p, t);
  drawDaughter(p, cut);
  lamps.forEach((lamp, i) => lamp.toggleAttribute("data-on", i < gen));
  const years = (gen * yearsPerGen()).toLocaleString("en-US");
  const text = gen >= doublingsToFill() ? `gen ${gen} · ${probesText(gen)} probes · galaxy full` : `gen ${gen} · ${probesText(gen)} probe${gen ? "s" : ""} · ${years} yr · ${phaseText(p)}`;
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(p * 100)));
  stage.setAttribute("aria-valuetext", text);
}

let p = 0.02, target = p, clock = 0, last = 0, frame = 0, visible = false, touring = !still.matches, idle = 0;
const STOPS = [0.12, 0.25, 0.58, 0.95];
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  clock += dt;
  if (touring) {
    const next = p + dt / MODEL.cycle;
    if (next >= 1) { gen = gen >= doublingsToFill() ? 0 : gen + 1; p = next - 1; } else p = next;
    target = p;
  } else p += (target - p) * (1 - Math.exp(-dt / 0.3));
  draw(p, clock);
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (next) => {
  touring = false;
  target = clamp(next, 0, 0.999);
  if (still.matches) { p = target; draw(p, 0); }
  clearTimeout(idle);
  idle = setTimeout(() => { touring = !still.matches; run(); }, 3600);
  run();
};
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (e) => {
  const box = svg.getBoundingClientRect();
  steer(clamp(((e.clientX - box.left) / box.width - 0.1) / 0.8));
});
stage.addEventListener("keydown", (e) => {
  const here = STOPS.reduce((best, s, i) => (Math.abs(s - target) < Math.abs(STOPS[best] - target) ? i : best), 0);
  let to = null;
  if (e.key === "ArrowRight" || e.key === "ArrowUp") to = Math.min(STOPS.length - 1, here + 1);
  if (e.key === "ArrowLeft" || e.key === "ArrowDown") to = Math.max(0, here - 1);
  if (e.key === "Home") to = 0;
  if (e.key === "End") to = STOPS.length - 1;
  if (to === null) return;
  e.preventDefault();
  steer(STOPS[to]);
});
if (still.matches) { p = 0.58; gen = 3; }
draw(p, 0);
