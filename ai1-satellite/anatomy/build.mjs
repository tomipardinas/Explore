// AI1 compute satellite in orbit, wings and radiator deployed, compute bay open, one GPU tray pulled out.
// node build.mjs [--light] [--audit]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";
import * as G from "./kit/lathe.mjs";
import { tubePieces, tubeSvg } from "./kit/tube.mjs";
import * as A from "./kit/audit.mjs";
import { kitScript } from "./scripts/inline-kit.mjs";
import { makeModel } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";
const M = makeModel();

const W = 760;
const H = 470;
const AZIMUTH = 56;
const ELEVATION = 30;

// ---------- world plan (units ≈ 1 cm of a 1:13 model; only proportions matter) ----------
const DECK = { x: -150, y: -62, w: 300, d: 124, r: 4 };
const DECK_Z = [50, 62];
const HOUSE = { x0: -100, x1: 30, y0: -56, y1: 44, z0: 62, z1: 180 };
const RACK = { x0: -92, x1: 8, y0: -50, y1: 40 };
const PITCH = 3.8;
const TRAY_H = PITCH;
const SHELF_H = 5;
const PULL = 56;
const SPRING = { stagger: 0.035, stiffness: 64, damping: 14.2, substeps: 4 };
const ORDER = ["tray"];

const P = k.fitProjection(
  [[-150, -62, 50], [150, -62, 50], [150, 62, 50], [-150, 62, 50], [-423, -66, 103], [-423, 58, 103], [440, -52, 103], [440, 72, 103], [-94, 45, 376], [24, 47, 376], [-92, 96, 152], [8, 96, 152], [166, -20, 66]],
  W,
  H,
  { pad: 26, azimuth: AZIMUTH, elevation: ELEVATION },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const Faded = (list, style) => k.fadedSvg(list, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const f2 = (v) => Math.round(v * 100) / 100;
const UP = [0, 0, 1];
const vframe = (x, y, z) => G.frameOf([x, y, z], UP, [1, 0, 0], [0, 1, 0]);

const R = A.recorder(P, { order: ORDER, spring: SPRING });
const record = R.solid;
const TRAY_MOVE = [0, -PULL, 0];
let piece = "sat";
let move = [0, 0, 0];
function onTray(fn) {
  piece = "tray";
  move = TRAY_MOVE;
  fn();
  piece = "sat";
  move = [0, 0, 0];
}
function put(name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) {
  return R.put({ name, at: ref, bias, svg, shapes, piece, move, ...rest });
}
function box(name, [x0, y0, z0], [x1, y1, z1], style = {}, { r = 0.4, steps = 2, bevel = 0, extra = "", inner = "", bias = 0, ground = false, attrs } = {}) {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r };
  const shape = record(A.slab(plan, z0, z1 - z0, { name, ...(ground ? { ground: true } : {}) }, steps));
  put(name, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], S(k.slabOf(plan, z0, z1 - z0, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias, attrs });
  return shape;
}
function turned(name, F, profile, style = {}, { extra = "", inner = "", bias = 0, smooth, steps, rims, bevel = 0, owner, attrs } = {}) {
  const opts = { bevel, ...(smooth !== undefined ? { smooth } : {}), ...(steps ? { steps } : {}), ...(rims ? { rims } : {}) };
  const paths = G.solidOf(profile, F, P, opts);
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  const shape = record(A.solid(F, profile, { name, owner, radius: smooth && smooth.radius ? smooth.radius : null }));
  put(name, G.add3(F.o, G.mul3(F.a, mid)), S(paths, { tone: "mid", ...style, inner }) + extra, [shape], { bias, attrs });
  return shape;
}
const disc = (name, F, s0, s1, r, style = {}, options = {}) => turned(name, F, [[s0, r], [s1, r]], style, options);
function ball(name, c, r, style = {}, { bias = 0, extra = "", attrs } = {}) {
  const shape = record(A.ball(c, r, { name }));
  put(name, c, S(G.sphereOf(c, r, P, { steps: 32 }), { tone: "mid", ...style }) + extra, [shape], { bias, attrs });
  return shape;
}

// Pipes and cables: tubePieces chunks, each its own depth-sorted item, with a fitting at a flanged end.
const LINES = [];
function line(name, points, r, { tone = "mid", bend, fittings = [false, false], ends = [false, false], rings, maxLength = 14, bias = 0.05, limp = false, kind = "", touch, decor } = {}) {
  const route = G.fillet(points, Math.max(bend ?? r * 2.6, r * 2.2), 10, { P, tube: r });
  const total = G.pathLength(route);
  const FIT = Math.max(1.4, r * 1.4);
  const gaps = [...(fittings[0] ? [[0, FIT]] : []), ...(fittings[1] ? [[total - FIT, total]] : [])];
  R.route(name, route, r, { gaps, limp, touch, rims: fittings.map((on) => (on ? r * 1.7 : r)), piece, move });
  LINES.push({ name, kind, route });
  tubePieces(route, r, P, { maxLength, spacing: Math.max(0.5, Math.min(1.6, r)), gaps, ...(rings ? { rings } : {}) }).forEach((pc, index) =>
    put(`${name}:${index}`, pc.mid, tubeSvg(pc, { tone }) + (decor ? decor(pc) : ""), [A.tube(pc.points, pc.radii)], { bias, attrs: ` data-route="${name}" data-chunk="${index}"${kind ? ` data-kind="${kind}"` : ""}` }),
  );
  [0, 1].forEach((index) => {
    const end = index ? route[route.length - 1] : route[0];
    if (fittings[index]) {
      const tangent = G.tangentAlong(route, index ? total : 0);
      const F = G.frameAlong(end, tangent);
      const [s0, s1] = index ? [-FIT, 0] : [0, FIT];
      const shape = record(A.disc(F, s0, s1, r * 1.7, { name: `${name}.fit${index}`, owner: name }));
      put(`${name}.fit${index}`, G.add3(end, G.mul3(tangent, (s0 + s1) / 2)), S(G.disc(s0, s1, r * 1.7, F, P, { steps: 24, bevel: 0.2 }), { tone: "mid" }), [shape], { bias: bias + 0.1 });
    } else if (ends[index]) {
      const size = Math.max(0.5, r * KS * 0.9);
      put(`${name}.end${index}`, end, Dots([at(end)], { size, tone: "hi" }), [A.ball(end, size / KS, { name: `${name}.end${index}`, owner: name })], { bias: bias + 0.15 });
    }
  });
  return route;
}

const back = [];

// ---------- bus deck ----------
box("deck", [DECK.x, DECK.y, DECK_Z[0]], [DECK.x + DECK.w, DECK.y + DECK.d, DECK_Z[1]], { tone: "mid" }, {
  r: DECK.r,
  steps: 4,
  bevel: 0.8,
  inner: Ln(k.sideSeam(DECK, 54, P, 4) + k.sideSeam(DECK, 58, P, 4), { tone: "faint" }),
  extra: Dots([...Array.from({ length: 13 }, (_, i) => at([-144 + i * 24, DECK.y + DECK.d, 56])), ...Array.from({ length: 5 }, (_, i) => at([DECK.x + DECK.w, -48 + i * 24, 56]))], { size: 0.45, tone: "mid" }),
  bias: -40,
  ground: true,
});

// ---------- compute housing: back, side walls, top, header and sill; front open ----------
const HZ = HOUSE.z1;
box("house.back", [HOUSE.x0, HOUSE.y0, HOUSE.z0], [HOUSE.x1, HOUSE.y0 + 3, HZ], { tone: "lo" }, { bias: -30 });
box("house.left", [HOUSE.x0, HOUSE.y0 + 3, HOUSE.z0], [HOUSE.x0 + 3, HOUSE.y1, HZ], { tone: "mid" }, {
  extra: Ln([100, 140].map((z) => path3([[HOUSE.x0 + 3.02, HOUSE.y0 + 3, z], [HOUSE.x0 + 3.02, HOUSE.y1, z]])).join(""), { tone: "faint" }) + Ln(path3([[HOUSE.x0 + 3, HOUSE.y1, HOUSE.z0], [HOUSE.x0 + 3, HOUSE.y1, HZ]]), { tone: "lo" }),
});
{
  const face = HOUSE.x1 + 0.02;
  const stiff = [-34, -10, 14].map((y) => path3([[face, y, HOUSE.z0], [face, y, HZ]])).join("") + [100, 146].map((z) => path3([[face, HOUSE.y0 + 3, z], [face, HOUSE.y1, z]])).join("");
  const screws = [-52, -22, 2, 26, 40].flatMap((y) => [at([face, y, 66]), at([face, y, 176])]).concat([-34, -10, 14].flatMap((y) => [100, 146].map((z) => at([face, y, z]))));
  box("house.right", [HOUSE.x1 - 3, HOUSE.y0 + 3, HOUSE.z0], [HOUSE.x1, HOUSE.y1, HZ], { tone: "mid" }, { extra: Ln(stiff, { tone: "faint" }) + Ln(path3([[HOUSE.x1, HOUSE.y1, HOUSE.z0], [HOUSE.x1, HOUSE.y1, HZ]]), { tone: "lo" }) + Dots(screws, { size: 0.45 }) });
}
box("house.top", [HOUSE.x0, HOUSE.y0, HZ], [HOUSE.x1, HOUSE.y1, HZ + 3], { tone: "mid" }, { r: 1, steps: 3, bevel: 0.5 });
box("house.header", [HOUSE.x0 + 3, 34, HZ - 3], [HOUSE.x1 - 3, HOUSE.y1, HZ], { tone: "lo" }, { extra: Dots([-90, -50, -10, 20].map((x) => at([x, HOUSE.y1, HZ - 1.5])), { size: 0.45, tone: "hi" }) });

// ---------- the rack: power shelf, 8 compute, 9 NVLink switch, 10 compute, power shelf ----------
const TRAYS = [];
{
  let z = HOUSE.z0;
  TRAYS.push({ kind: "shelf", z, h: SHELF_H });
  z += SHELF_H;
  for (let i = 0; i < 8; i++, z += PITCH) TRAYS.push({ kind: "compute", z, h: TRAY_H });
  for (let i = 0; i < 9; i++, z += PITCH) TRAYS.push({ kind: "switch", z, h: TRAY_H });
  for (let i = 0; i < 10; i++, z += PITCH) TRAYS.push({ kind: "compute", z, h: TRAY_H });
  TRAYS.push({ kind: "shelf", z, h: SHELF_H });
}
const PULLED = TRAYS.findIndex((t, i) => t.kind === "compute" && i > 18 + 4);
const PZ = TRAYS[PULLED].z;
for (const x of [RACK.x0 - 3, RACK.x1 + 1]) {
  const holes = TRAYS.map((t) => at([x + 1, RACK.y1, t.z + t.h / 2]));
  box("rack.ear", [x, RACK.y1 - 4, HOUSE.z0], [x + 2, RACK.y1, HZ - 3], { tone: "lo" }, { extra: Dots(holes, { size: 0.32, tone: "lo" }) });
}
const faceY = RACK.y1 + 0.02;
const slot = (x0, x1, z0, z1, y = faceY) => {
  const r = Math.min(0.5, (z1 - z0) / 2);
  return path3([[x0 + r, y, z0], [x1 - r, y, z0], [x1, y, z0 + r], [x1, y, z1 - r], [x1 - r, y, z1], [x0 + r, y, z1], [x0, y, z1 - r], [x0, y, z0 + r]], true);
};
TRAYS.forEach((t, index) => {
  if (index === PULLED) return;
  const z0 = t.z;
  const z1 = t.z + t.h;
  const zm = (z0 + z1) / 2;
  let extra = "";
  let tone = "mid";
  if (t.kind === "compute") {
    extra = Ln([-80, -66, -52, -38, -24].map((x) => slot(x, x + 11, zm - 0.6, zm + 0.6)).join(""), { tone: "faint" }) + Dots([at([-88, faceY, zm]), at([4, faceY, zm])], { size: 0.4, tone: "mid" }) + `<g class="ai-led">${Dots([at([-8, faceY, zm])], { size: 0.45, tone: "lo" })}</g>`;
  } else if (t.kind === "switch") {
    tone = "lo";
    extra = Ln(Array.from({ length: 9 }, (_, i) => slot(-84 + i * 8.6, -79 + i * 8.6, zm - 0.7, zm + 0.7)).join(""), { tone: "lo" }) + `<g class="ai-led">${Dots([at([2, faceY, zm])], { size: 0.45, tone: "lo" })}</g>`;
  } else {
    extra = Ln([-86, -70, -54].map((x) => slot(x, x + 13, z0 + 1.2, z1 - 1.2)).join(""), { tone: "faint" }) + Dots([-28, -20, -12].map((x) => at([x, faceY, zm])), { size: 0.55, tone: "hi" });
  }
  box(t.kind === "shelf" ? "rack.shelf" : `rack.${t.kind}`, [RACK.x0, RACK.y0, z0], [RACK.x1, RACK.y1, z1], { tone }, { r: 0.3, steps: 1, extra, attrs: ` data-tray="${t.kind}"` });
});

// ---------- coolant manifolds inside the opening: return (hot) and supply (cold) ----------
const MAN_R = 1.8;
const HOT_X = 14;
const COLD_X = 21;
const MAN_Y = 38;
const QD_Z = TRAYS.filter((t) => t.kind === "compute").map((t) => t.z + t.h / 2);
const qdOn = (x) => (pc) => {
  const zs = pc.points.filter((p) => Math.abs(p[0] - x) < 0.01 && Math.abs(p[1] - MAN_Y) < 0.01).map((p) => p[2]);
  if (zs.length < 2) return "";
  const lo = Math.min(...zs) + 0.6;
  const hi = Math.max(...zs) - 0.6;
  return Dots(QD_Z.filter((z) => z > lo && z <= hi).map((z) => at([x - MAN_R * 0.7, MAN_Y + MAN_R * 0.7, z])), { size: 0.42, tone: "hi" });
};

// ---------- radiator, deployed: a root beam on the roof and three panels standing edge-on to the Sun ----------
const HEADER_Y = HOUSE.y1 + 4;
box("rad.root", [-96, 40, HZ + 3], [26, 52, HZ + 13], { tone: "mid" }, {
  r: 0.8,
  steps: 2,
  bevel: 0.4,
  extra: Dots([-90, -60, -30, 0, 20].map((x) => at([x, 52, HZ + 8])), { size: 0.45, tone: "hi" }),
});
const RADP = { x0: -94, x1: 24, y0: 45, y1: 47, h: 60, gap: 1, n: 3 };
const radZ = (i) => HZ + 13 + i * (RADP.h + RADP.gap);
for (let i = 0; i < RADP.n; i++) {
  const z0 = radZ(i);
  const z1 = z0 + RADP.h;
  const fy = RADP.y1 + 0.02;
  const tubes = Array.from({ length: 13 }, (_, j) => path3([[RADP.x0 + 5 + j * 9, fy, z0], [RADP.x0 + 5 + j * 9, fy, z1]])).join("");
  box("rad.panel", [RADP.x0, RADP.y0, z0], [RADP.x1, RADP.y1, z1], { tone: i === RADP.n - 1 ? "hi" : "mid" }, {
    r: 0.4,
    steps: 2,
    extra: Ln(tubes, { tone: "faint" }) + Ln(path3([[RADP.x1, RADP.y1, z0], [RADP.x1, RADP.y1, z1]]), { tone: "lo" }),
    attrs: ` data-rad="${i}"`,
  });
}
for (let i = 0; i + 1 < RADP.n; i++) {
  for (const x of [-70, -10]) disc("rad.hinge", G.frameAlong([x, RADP.y1 + 1, radZ(i) + RADP.h + RADP.gap / 2], [1, 0, 0]), -4, 4, 1, { tone: "lo" });
}

// ---------- solar wings, deployed: drive, boom, yoke and four panels on each side ----------
const WING = { n: 4, w: 60, gap: 1, half: 62, z0: 101, z1: 103 };
const WINGS = [
  { side: -1, y: -4, ped: [[-126, -14, 62], [-114, 6, 93]], inner: -112 },
  { side: 1, y: 10, ped: [[136, 2, 62], [148, 18, 93]], inner: 128 },
];
const WING_TIPS = [];
for (const wg of WINGS) {
  const sx = wg.side;
  box("sada.pedestal", wg.ped[0], wg.ped[1], { tone: "lo" }, { extra: Dots([at([wg.ped[0][0] + 2, wg.ped[1][1], 66]), at([wg.ped[1][0] - 2, wg.ped[1][1], 66])], { size: 0.45, tone: "hi" }) });
  const F = G.frameAlong([wg.inner, wg.y, 102], [sx, 0, 0]);
  turned("sada.drum", F, [[0, 7], [3, 7], [3, 9], [22, 9], [22, 6], [28, 6]], { tone: "mid" }, {
    inner: Ln(G.arcOf(F, 8, 9, P) + G.arcOf(F, 12, 9, P), { tone: "faint" }),
  });
  disc("wing.boom", F, 28, 64, 3, { tone: "hi" }, { inner: Ln(G.arcOf(F, 40, 3, P) + G.arcOf(F, 52, 3, P), { tone: "faint" }) });
  const e = wg.inner + sx * 64;
  const yoke = sx < 0 ? [e - 4, e] : [e, e + 4];
  box("wing.yoke", [yoke[0], wg.y - 22, 96], [yoke[1], wg.y + 22, 108], { tone: "mid" }, { r: 0.6, steps: 2, extra: Dots([at([sx < 0 ? yoke[0] : yoke[1], wg.y - 18, 104]), at([sx < 0 ? yoke[0] : yoke[1], wg.y + 18, 104])], { size: 0.45, tone: "hi" }) });
  const root = sx < 0 ? yoke[0] : yoke[1];
  for (let i = 0; i < WING.n; i++) {
    const a = root + sx * i * (WING.w + WING.gap);
    const b = a + sx * WING.w;
    const [x0, x1] = sx < 0 ? [b, a] : [a, b];
    const y0 = wg.y - WING.half;
    const y1 = wg.y + WING.half;
    const rows = Array.from({ length: 11 }, (_, j) => k.lineOnTop([x0, y0 + (j + 1) * (2 * WING.half / 12)], [x1, y0 + (j + 1) * (2 * WING.half / 12)], WING.z1, P)).join("");
    const cols = Array.from({ length: 5 }, (_, j) => k.lineOnTop([x0 + (j + 1) * (WING.w / 6), y0], [x0 + (j + 1) * (WING.w / 6), y1], WING.z1, P)).join("");
    box("wing.panel", [x0, y0, WING.z0], [x1, y1, WING.z1], { tone: "hi" }, { r: 0.5, steps: 2, extra: Ln(rows + cols, { tone: "faint" }), attrs: ' data-part="cells"' });
    if (i === WING.n - 1) WING_TIPS.push([sx < 0 ? x0 : x1, y0], [sx < 0 ? x0 : x1, y1]);
    if (i + 1 < WING.n) {
      const xg = b + sx * WING.gap / 2;
      for (const dy of [-40, 40]) disc("wing.hinge", G.frameAlong([xg, wg.y + dy, WING.z1 + 1], [0, 1, 0]), -4, 4, 1, { tone: "lo" });
    }
  }
}

// ---------- pump package: loops A and B ----------
const PKG = { x0: 46, x1: 92, y0: -12, y1: 34, z0: 62, z1: 80 };
box("pump.package", [PKG.x0, PKG.y0, PKG.z0], [PKG.x1, PKG.y1, PKG.z1], { tone: "mid" }, {
  r: 1,
  steps: 3,
  bevel: 0.5,
  inner: Ln(k.sideSeam({ x: PKG.x0, y: PKG.y0, w: PKG.x1 - PKG.x0, d: PKG.y1 - PKG.y0, r: 1 }, 76, P, 3), { tone: "faint" }),
  extra: Dots([[48, 32], [90, 32], [48, -10], [90, -10]].map(([x, y]) => at([x, y, PKG.z1])), { size: 0.5, tone: "mid" }),
});
const PUMPS = [];
for (const [id, x] of [["a", 60], ["b", 80]]) {
  const F = vframe(x, 10, PKG.z1);
  const prof = [[0, 9], [2, 9], [2, 7.4], [14, 7.4], [14.4, 7.2, 1], [15.4, 6.2, 1], [16.2, 4.6, 1], [16.7, 2.4, 1], [16.9, 0]];
  turned(`pump.${id}`, F, prof, { tone: "hi" }, {
    extra: Faded(G.ribsOf(F, 3.6, 12.6, 7.4, 28, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }),
    attrs: ` data-pump="${id}"`,
  });
  PUMPS.push({ id, x, F });
}
ball("pump.accumulator", [86, -5, PKG.z1 + 5], 5, { tone: "mid" });

// ---------- argon tank and Hall thruster ----------
const TANK = { x0: 36, x1: 120, y: -40, z: 78, r: 12 };
{
  const L = TANK.x1 - TANK.x0;
  const dome = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * (Math.PI / 2);
    return [TANK.r * (1 - Math.cos(a)), TANK.r * Math.sin(a), 1];
  });
  const profile = [...dome, ...dome.slice(0, -1).reverse().map(([s, r]) => [L - s, r, 1])];
  profile[0] = [0, 0];
  profile[profile.length - 1] = [L, 0];
  const F = G.frameOf([TANK.x0, TANK.y, TANK.z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  turned("tank", F, profile, { tone: "hi" }, { inner: Ln(G.arcOf(F, TANK.r, TANK.r, P) + G.arcOf(F, L - TANK.r, TANK.r, P) + G.arcOf(F, L / 2, TANK.r, P), { tone: "faint" }) });
}
for (const x of [52, 104]) box("tank.saddle", [x, TANK.y - 6, 62], [x + 6, TANK.y + 6, TANK.z - TANK.r + 0.2], { tone: "lo" });
box("thruster.block", [136, -30, 62], [150, -10, 70], { tone: "lo" }, { extra: Dots([at([138, -10, 70]), at([148, -10, 70])], { size: 0.45, tone: "hi" }) });
const THR = G.frameAlong([150, -20, 66], [1, 0, 0]);
turned("thruster", THR, [[0, 8], [3, 8], [3, 9.4], [12, 9.4], [12, 8.6], [14, 8.6]], { tone: "hi" }, {
  inner: Ln(G.arcOf(THR, 6, 9.4, P), { tone: "faint" }),
  extra: `<path class="ai-void" d="${G.circleOf(THR, 14, 6.6, P, 64)}"/>` + Ln(G.circleOf(THR, 14, 6.6, P, 64) + G.circleOf(THR, 14, 3.6, P, 48), { tone: "lo" }),
});

// ---------- battery, flight computer, star trackers, laser terminals ----------
box("battery", [98, 24, 62], [134, 58, 76], { tone: "mid" }, {
  r: 1,
  steps: 3,
  bevel: 0.5,
  inner: Ln(k.sideSeam({ x: 98, y: 24, w: 36, d: 34, r: 1 }, 72, P, 3), { tone: "faint" }),
  extra: Dots(k.dotGrid(102, 28, 8, 7, 4, 76, P), { size: 0.5, tone: "lo" }),
});
box("fc", [100, -24, 62], [118, 6, 74], { tone: "mid" }, {
  r: 0.8,
  steps: 2,
  bevel: 0.4,
  extra: Ln([-20, -14, -8, -2].map((y) => path3([[100.5, y, 74], [117.5, y, 74]])).join(""), { tone: "faint" }) + `<g class="ai-led" data-led="fc">${Dots([at([116, 6, 71])], { size: 0.55, tone: "lo" })}</g>`,
});
for (const y of [-4, 16]) {
  box("tracker.base", [124, y - 4, 62], [132, y + 4, 66], { tone: "lo" }, { extra: Dots([at([125.2, y - 2.8, 66]), at([130.8, y + 2.8, 66])], { size: 0.4 }) });
  const F = vframe(128, y, 66);
  turned("tracker", F, [[0, 3.4], [6, 3.4], [6, 3.8], [12, 5.6]], { tone: "mid" }, { extra: Ln(G.circleOf(F, 12, 4.8, P, 40), { tone: "lo" }) });
}
const LASERS = [[142, 46], [142, -46], [-112, -46]];
const LASER_DIRS = [[0.6, 0.7, 0.4], [0.7, -0.5, 0.5], [-0.6, -0.6, 0.5]];
LASERS.forEach(([x, y], i) => {
  const F = vframe(x, y, 62);
  disc("laser.base", F, 0, 2, 6, { tone: "lo" }, { extra: Dots(G.dotsOf(F, 2, 5, 6, P, { all: true }), { size: 0.4 }) });
  disc("laser.drum", F, 2, 8, 4.4, { tone: "mid" }, { inner: Ln(G.arcOf(F, 5, 4.4, P), { tone: "faint" }) });
  for (const s of [-1, 1]) box("laser.fork", [x - 1, y + s * 3.4 - (s > 0 ? 0 : 1.2), 70 - 0.01], [x + 1, y + s * 3.4 + (s > 0 ? 1.2 : 0), 78], { tone: "mid" });
  ball(`laser.head`, [x, y, 76], 3.4, { tone: "hi" }, { attrs: ` data-laser="${i}"` });
  const dir = G.unit3(LASER_DIRS[i]);
  const LF = G.frameAlong([x, y, 76], dir);
  disc("laser.lens", LF, 3.0, 3.9, 1.6, { tone: "lo" }, { extra: Ln(G.circleOf(LF, 3.9, 1, P, 24), { tone: "hi" }) });
});

// ---------- the pulled compute tray: 4 GPUs and 2 CPUs under cold plates ----------
const TY0 = RACK.y0 + PULL;
const TY1 = RACK.y1 + PULL - 2;
const FLOOR = PZ + 0.6;
const PLATE_T = 1.8;
const TUBE_Z = FLOOR + 1.0;
const GPUS = [[-89, -70], [-66, -47], [-43, -24], [-20, -1]];
const GPU_Y = [70, 89];
const CPUS = [[-82, -66], [-34, -18]];
const CPU_Y = [50, 63];
onTray(() => {
  box("tray.floor", [RACK.x0, TY0, PZ], [RACK.x1, TY1, FLOOR], { tone: "lo" }, {
    r: 0.3,
    steps: 1,
    extra: Ln(k.planOutline({ x: RACK.x0 + 3, y: 46, w: 92, d: 45, r: 1 }, FLOOR, P, 2), { tone: "faint" }) + Dots([[-89, 48], [5, 48], [-89, 89], [5, 70]].map(([x, y]) => at([x, y, FLOOR])), { size: 0.4 }),
  });
  box("tray.wall", [RACK.x0, TY0, FLOOR], [RACK.x0 + 1, TY1, PZ + TRAY_H], { tone: "mid" }, { r: 0.2, steps: 1 });
  box("tray.wall", [RACK.x1 - 1, TY0, FLOOR], [RACK.x1, TY1, PZ + TRAY_H], { tone: "mid" }, { r: 0.2, steps: 1 });
  box("tray.wall", [RACK.x0 + 1, TY0, FLOOR], [RACK.x1 - 1, TY0 + 1, PZ + TRAY_H], { tone: "mid" }, { r: 0.2, steps: 1 });
  box("tray.slide", [RACK.x1, TY0 + 2, PZ + 1], [RACK.x1 + 0.6, TY1 - 2, PZ + 2.4], { tone: "lo" }, { r: 0.2, steps: 1 });
  const fz = (PZ + PZ + TRAY_H) / 2;
  const bezel = Ln([-80, -66, -52, -38].map((x) => slot(x, x + 11, fz - 0.6, fz + 0.6, TY1 + 2.02)).join(""), { tone: "faint" });
  box("tray.bezel", [RACK.x0, TY1, PZ], [RACK.x1, TY1 + 2, PZ + TRAY_H], { tone: "mid" }, { r: 0.3, steps: 1, extra: bezel + `<g class="ai-led" data-led="tray">${Dots([at([-8, TY1 + 2.02, fz])], { size: 0.45, tone: "lo" })}</g>` });
  for (const x of [-89, 1]) box("tray.handle", [x, TY1 + 2, fz - 0.7], [x + 4, TY1 + 3.4, fz + 0.7], { tone: "hi" }, { r: 0.4, steps: 2 });
  GPUS.forEach(([x0, x1], i) => {
    const screws = [[x0 + 1.6, GPU_Y[0] + 1.6], [x1 - 1.6, GPU_Y[0] + 1.6], [x0 + 1.6, GPU_Y[1] - 1.6], [x1 - 1.6, GPU_Y[1] - 1.6]].map(([x, y]) => at([x, y, FLOOR + PLATE_T]));
    box("tray.gpu", [x0, GPU_Y[0], FLOOR], [x1, GPU_Y[1], FLOOR + PLATE_T], { tone: "hi" }, {
      r: 0.6,
      steps: 2,
      bevel: 0.3,
      extra: Ln(k.planOutline({ x: x0 + 4, y: GPU_Y[0] + 4, w: x1 - x0 - 8, d: GPU_Y[1] - GPU_Y[0] - 8, r: 1 }, FLOOR + PLATE_T, P, 2), { tone: "lo" }) + Dots(screws, { size: 0.4, tone: "mid" }),
      attrs: ` data-chip="gpu" data-i="${i}"`,
    });
    if (i > 0) box("tray.vrm", [x0 + 2, 65.6, FLOOR], [x1 - 2, 67.8, FLOOR + 0.8], { tone: "lo" }, { r: 0.2, steps: 1 });
  });
  CPUS.forEach(([x0, x1], i) => {
    box("tray.cpu", [x0, CPU_Y[0], FLOOR], [x1, CPU_Y[1], FLOOR + PLATE_T], { tone: "hi" }, {
      r: 0.6,
      steps: 2,
      bevel: 0.3,
      extra: Ln(k.planOutline({ x: x0 + 3, y: CPU_Y[0] + 3, w: x1 - x0 - 6, d: CPU_Y[1] - CPU_Y[0] - 6, r: 1 }, FLOOR + PLATE_T, P, 2), { tone: "lo" }),
      attrs: ` data-chip="cpu" data-i="${i}"`,
    });
  });
  box("tray.qd", [2, 78, FLOOR], [7, 92, FLOOR + 2.2], { tone: "mid" }, { r: 0.5, steps: 2, extra: Dots([at([4.5, 92, FLOOR + 1.1])], { size: 0.4, tone: "hi" }) });
  const r = 0.55;
  const loop = [
    [[2, 91, TUBE_Z], [-10.5, 91, TUBE_Z], [-10.5, GPU_Y[1], TUBE_Z]],
    [[GPUS[3][0], 79.5, TUBE_Z], [GPUS[2][1], 79.5, TUBE_Z]],
    [[GPUS[2][0], 79.5, TUBE_Z], [GPUS[1][1], 79.5, TUBE_Z]],
    [[GPUS[1][0], 79.5, TUBE_Z], [GPUS[0][1], 79.5, TUBE_Z]],
    [[-79.5, GPU_Y[0], TUBE_Z], [-79.5, 66.5, TUBE_Z], [-74, 66.5, TUBE_Z], [-74, CPU_Y[1], TUBE_Z]],
    [[CPUS[0][1], 56.5, TUBE_Z], [CPUS[1][0], 56.5, TUBE_Z]],
    [[CPUS[1][1], 56.5, TUBE_Z], [4.5, 56.5, TUBE_Z], [4.5, 78, TUBE_Z]],
  ];
  loop.forEach((pts, i) => line(`tray.loop${i}`, pts, r, { tone: "hi", bend: 1.6, kind: "tray", maxLength: 10 }));
});

// ---------- plumbing between rack, pumps and radiator ----------
line("pipe.hot", [[HOT_X, MAN_Y, 62], [HOT_X, MAN_Y, 166], [HOT_X, HEADER_Y, 166], [HOT_X, HEADER_Y, HZ + 3]], MAN_R, { tone: "hi", bend: 5, fittings: [true, true], kind: "hot", decor: qdOn(HOT_X) });
line("pipe.radout", [[COLD_X, HEADER_Y, HZ + 3], [COLD_X, HEADER_Y, 176], [38, HEADER_Y, 176], [38, HEADER_Y, 72], [56, HEADER_Y, 72], [56, PKG.y1, 72]], MAN_R, { tone: "mid", bend: 5, fittings: [true, true], kind: "cold", rings: { pitch: 1.2, twist: 0.8, cross: true, fade: [0.1, 0.55] } });
line("pipe.supply", [[82, PKG.y1, 70], [82, 54, 70], [COLD_X, 54, 70], [COLD_X, MAN_Y, 70], [COLD_X, MAN_Y, HZ - 3]], MAN_R, { tone: "mid", bend: 5, fittings: [true, true], kind: "supply", decor: qdOn(COLD_X) });
line("tank.feed", [[TANK.x1, TANK.y, TANK.z], [128, TANK.y, TANK.z], [128, -20, TANK.z], [140, -20, TANK.z], [140, -20, 70]], 0.8, { tone: "mid", bend: 3, fittings: [false, true], kind: "feed" });

// ---------- power: solar array drive and battery to the power shelf ----------
const PS = TRAYS[0];
const PSZ = PS.z + PS.h / 2;
for (const x of [-100, -76]) {
  const F = vframe(x, 54, 62);
  disc("harness.post", F, 0, PSZ - 62 - 1.4, 0.9, { tone: "lo" });
}
line("harness.solar", [[-120, 6, PSZ], [-120, 54, PSZ], [-50, 54, PSZ], [-50, RACK.y1, PSZ]], 1.2, { tone: "mid", bend: 4, fittings: [true, true], kind: "power", limp: true, touch: ["harness.post*"], rings: { pitch: 1, twist: 0.6, cross: true, fade: [0.1, 0.55] } });
line("harness.battery", [[112, 58, PSZ], [112, 60, PSZ], [-22, 60, PSZ], [-22, RACK.y1, PSZ]], 0.9, { tone: "lo", bend: 4, fittings: [true, true], kind: "power", limp: true });

// ---------- data and control: bulkhead on the housing wall, laser and flight-computer links ----------
const BH = { x: HOUSE.x1, y0: -50, y1: -14, z0: 104, z1: 136 };
box("bulkhead", [BH.x, BH.y0, BH.z0], [BH.x + 1.6, BH.y1, BH.z1], { tone: "lo" }, {
  r: 0.6,
  steps: 2,
  extra: Dots([[BH.y0 + 2, BH.z0 + 2], [BH.y1 - 2, BH.z0 + 2], [BH.y0 + 2, BH.z1 - 2], [BH.y1 - 2, BH.z1 - 2]].map(([y, z]) => at([BH.x + 1.6, y, z])), { size: 0.45, tone: "hi" }),
});
const CONN = [[-45, 112], [-20, 122], [-33, 130]];
CONN.forEach(([y, z], i) => {
  const F = G.frameAlong([BH.x + 1.6, y, z], [1, 0, 0]);
  disc("bulkhead.conn", F, 0, 2.2, 2.4, { tone: "mid" }, { steps: 6 });
  if (i === 2) disc("bulkhead.cap", F, 2.2, 3.2, 1.8, { tone: "hi" });
});
const CX = BH.x + 1.6 + 2.2;
line("data.laser", [[137.6, -46, 66], [134, -46, 66], [134, -58, 66], [40, -58, 66], [40, -58, CONN[0][1]], [40, CONN[0][0], CONN[0][1]], [CX, CONN[0][0], CONN[0][1]]], 0.6, { tone: "lo", bend: 3, fittings: [false, true], ends: [true, false], kind: "data", limp: true });
line("data.fc", [[100, -20, 68], [42, -20, 68], [42, -20, CONN[1][1]], [CX, -20, CONN[1][1]]], 0.6, { tone: "lo", bend: 3, fittings: [true, true], kind: "data", limp: true });
line("ctrl.pumps", [[PKG.x1, -4, 70], [100, -4, 70]], 0.5, { tone: "lo", bend: 2, fittings: [true, true], kind: "ctrl", limp: true });
line("ctrl.battery", [[108, 6, 68], [108, 24, 68]], 0.5, { tone: "lo", bend: 2, fittings: [true, true], kind: "ctrl", limp: true });

A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);

const groups = R.items.map((item, index) => {
  const [mx, my, mz] = item.move;
  const moving = item.piece === "tray";
  return `<g class="it"${moving ? ` data-k="${item.key.toFixed(3)}" data-m="${mx},${my},${mz}"` : ` data-k="${item.key.toFixed(3)}"`} data-name="${item.name}"${item.attrs ?? ""}>${item.svg}</g>`;
});

const LABEL_TEXT =
  "SpaceX's AI1 compute satellite in orbit with both solar wings and its radiator deployed (wings and radiator shortened to fit). The compute bay's front is open: a rack of 18 GPU trays, 9 NVLink switch trays and two power shelves, with one GPU tray slid out to show four GPU and two CPU cold plates joined by a coolant loop. Manifolds carry coolant to the pumps on the deck and up to the radiator standing on the roof; a harness brings power from the left wing's solar array drive. Laser terminals, star trackers, an argon tank, a Hall thruster and a battery sit on the deck.";
const svg = k.figureSvg({ width: W, height: H, label: LABEL_TEXT, body: [...back, `<g class="ai-sat">${groups.join("")}</g>`] });

const AX = (v) => at(v).map((c, i) => c - at([0, 0, 0])[i]);
const DATA = {
  V,
  EX: AX([1, 0, 0]),
  EY: AX([0, 1, 0]),
  EZ: AX([0, 0, 1]),
  spring: SPRING,
  lines: LINES.map(({ name, kind }) => ({ name, kind })),
};

const s120 = M.state((M.sustained / M.peak - M.idle) / (1 - M.idle));
const CSS = readFileSync(join(HERE, "figure.css"), "utf8");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const MODEL_SRC = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const body =
  `<style>${CSS}</style>` +
  k.plateHtml({
    fig: "Fig 1",
    title: "AI1, deployed, bay open",
    hint: "Move to set load · T slides the tray",
    readout: `${s120.compute.toFixed(0)} kW · ${s120.flow.toFixed(1)} kg/s`,
    keys: [
      { mark: "lit", label: "The work: GPU cold plates on the pulled tray, and power or coolant moving through the lines" },
      { mark: "raised", label: "Rack: 18 GPU trays (72 GPUs, 36 CPUs), 9 NVLink switch trays, 2 power shelves" },
      { mark: "edge", label: "Coolant: rack manifolds, two pumps, braided line up to the radiator" },
      { mark: "flat", label: "Power: two solar wings on rotating drives, battery, harness into the bottom power shelf" },
    ],
    caption: `SpaceX's AI1 in its dawn-dusk orbit, with both solar wings turned to the Sun and its ${M.radArea} m² liquid radiator standing edge-on to it. The wings really span about 70 m and the radiator stands about 20 m tall, so both are drawn far shorter here to keep the compute bay readable. The rack draws ${M.peak} kW at peak and ${M.sustained} kW sustained, and every watt of it becomes heat: cold plates on each GPU and CPU pass it into water-glycol, the pumps move it at about ${s120.flow.toFixed(1)} kg/s at ${M.sustained} kW (a ${s120.dT.toFixed(0)} K rise), and the deployed radiator, held edge-on to the Sun, sheds it from both faces at around ${s120.radT.toFixed(0)} °C. Numbers come from one model: ${M.arrayArea.toFixed(0)} m² of array at 250 W/m², emissivity 0.9, a 12 K design rise. SpaceX has published the outline and named NVIDIA Rubin GPUs and Vera CPUs; the rack layout follows NVIDIA's NVL72, and the rest of the interior is an informed illustration, not SpaceX's drawing.`,
    body: `<div class="iso-stage ai-stage" tabindex="0" role="slider" aria-label="AI1 compute satellite. Left and right arrows set the compute load; T or Space slides the GPU tray in or out." aria-valuemin="0" aria-valuemax="100" aria-valuenow="80">${svg}<span class="ai-sr" role="status" aria-live="polite" data-status></span></div>`,
  });

const AUTO = process.argv.includes("--auto");
const themeScript = AUTO ? `if (matchMedia("(prefers-color-scheme: light)").matches) document.body.dataset.theme = "light";\n` : "";
const page = k.pageHtml({ title: "AI1 anatomy", theme: AUTO ? "dark" : THEME, body, script: themeScript + kitScript() + MODEL_SRC + LIVE, width: 680 });
const name = AUTO ? "index.html" : THEME === "light" ? "index-light.html" : "index-dark.html";
writeFileSync(join(HERE, name), page);
if (process.argv.includes("--artifact")) {
  const light = (k.ISO_CSS.match(/\.iso\[data-theme="light"\]\{[^}]*\}/) || [""])[0].replace('.iso[data-theme="light"]', "");
  const css = `:root{--ai-bg:#0b0b0b;color-scheme:dark}@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--ai-bg:#f2f2ef;color-scheme:light}:root:not([data-theme="dark"]) .iso${light}}:root[data-theme="light"]{--ai-bg:#f2f2ef;color-scheme:light}:root[data-theme="light"] .iso${light}:root[data-theme="dark"]{--ai-bg:#0b0b0b;color-scheme:dark}body{background:var(--ai-bg);margin:0}.ai-page{box-sizing:border-box;width:100%;max-width:712px;margin:0 auto;padding-block:40px 64px;padding-left:max(16px, env(safe-area-inset-left, 0px));padding-right:max(16px, env(safe-area-inset-right, 0px));background:var(--anatomy-page);color:var(--anatomy-text);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}`;
  const frag = `<title>AI1 Satellite Anatomy</title><meta name="claude:viewport-fit-sides" content="cover"><style>${k.ISO_CSS}${css}</style><div class="iso ai-page">${body}</div><script type="module">${(kitScript() + MODEL_SRC + LIVE).replace(/<\/(script)/gi, "<\\/$1")}</script>`;
  writeFileSync(join(HERE, "artifact.html"), frag);
}
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `${R.solids.length} solids`, `scale ${KS.toFixed(3)}`, `${LINES.length} lines`);

A.auditOrExit(R, P, {});
