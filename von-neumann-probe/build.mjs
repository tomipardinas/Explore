import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";
import * as G from "./kit/lathe.mjs";
import * as A from "./kit/audit.mjs";
import { kitScript } from "./scripts/inline-kit.mjs";
import { PROBE, makeProbe } from "./probe.mjs";
import { MODEL } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";

const W = 600;
const H = 400;

// World layout, about 1 unit per px of the model. z up. The viewer sits toward +x +y.
const ROCK = [[-172, 14], [-162, -34], [-128, -70], [-72, -92], [0, -100], [78, -94], [138, -74], [184, -34], [196, 22], [182, 70], [136, 102], [60, 112], [-20, 108], [-92, 106], [-146, 92], [-170, 58]];
const ROCK_H = 18;
const DECK = { x: -34, y: -46, w: 192, d: 108, r: 6 };
const DECK_Z = 4;
const DECK_TOP = 10;
const PARENT = [-114, 62];
const DRILL = { col: [-54, -2], head: { x: -61, y: 1.5, w: 14, d: 10, r: 1.2 }, bit: [-54, 6.5], lift: [-54, -15.6], top: 84 };
const FURNACE = { c: [-6, 2], r: 14, z0: 13, z1: 46 };
const HOPPER = { z0: 50, z1: 66, r0: 5, r1: 16 };
const SPOUT = [-8, -1];
const PLATE = { c: [100, 14], r: 34, z0: DECK_TOP, z1: DECK_TOP + 3 };
const BUILD_Z = PLATE.z1;
const POSTS = [[56, 6], [144, 6]];
const RAIL = { y: -40, d: 80, w: 6, z1: DECK_TOP + 3 };
const CAR_Z = RAIL.z1 + 6;
const TRAVEL = 38;
const BEAM = { x: 50, y: 2, w: 100, d: 8, r: 1.5, z0: 98, z1: 104 };
const HEAD_Y = 14;
const FEED_BOX = { x: 52, y: -9, w: 8, d: 7, r: 1 };

const P = k.fitProjection(
  [...ROCK.map(([x, y]) => [x, y, -ROCK_H - 12]), ...ROCK.map(([x, y]) => [x, y, 0]), [PARENT[0], PARENT[1], PROBE.top], [DRILL.col[0], DRILL.col[1], DRILL.top + 8], [BEAM.x, BEAM.y, BEAM.z1 + 6], [BEAM.x + BEAM.w, BEAM.y + BEAM.d, BEAM.z1 + 6]],
  W,
  H,
  { pad: 26, azimuth: 40 },
);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const probeSvg = makeProbe(k);

const R = A.recorder(P);
const rec = R.solid;
const put = (name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) => R.put({ name, at: ref, bias, svg, shapes, piece: "all", ...rest });
function slab(name, plan, z, h, style = {}, { steps = 3, bevel = 0, extra = "", inner = "", bias = 0, ground = false, meta = {} } = {}) {
  const shape = rec(A.slab(plan, z, h, { name, ground, ...meta }, steps));
  put(name, [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2], S(k.slabOf(plan, z, h, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
}
function cyl(name, [x, y], r, z, h, style = {}, { steps = 28, bevel = 0, extra = "", inner = "", bias = 0, ground = false } = {}) {
  const shape = rec(A.cylinder(x, y, r, z, h, { name, ground }));
  put(name, [x, y, z + h / 2], S(k.cylinder(x, y, r, z, h, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
function turned(name, F, profile, style = {}, { extra = "", inner = "", bias = 0, smooth, meta = {} } = {}) {
  const shape = rec(A.solid(F, profile, { name, ...meta }));
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  put(name, G.add3(F.o, G.mul3(F.a, mid)), S(G.solidOf(profile, F, P, smooth !== undefined ? { smooth } : {}), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
}

// ---------- the asteroid ----------
const back = [];
{
  const lower = ROCK.map(([x, y]) => [x * 0.9 + 4, y * 0.86 - 2]);
  back.push(`<path class="iso-halo" d="${k.extrude(lower, -ROCK_H - 12, ROCK_H + 12, P).fill}"/>`);
  back.push(S(k.extrude(lower, -ROCK_H - 12, 12, P), { tone: "lo" }));
  const strata = k.lineSvg(k.ringSeam(ROCK, -ROCK_H + 7, P), { tone: "faint" });
  back.push(S(k.extrude(ROCK, -ROCK_H, ROCK_H, P, { bevel: 1.2 }), { tone: "lo", inner: strata }));
  rec(A.extruded(ROCK, -ROCK_H, ROCK_H, { name: "stand.rock", ground: true }));
  // craters: a rim, a floor and a faint inner ring, all flat on the surface
  for (const [x, y, r] of [[-128, -30, 13], [40, -80, 9], [176, 34, 8], [-88, -66, 7], [20, 92, 9], [-152, 34, 6], [112, 92, 6], [-40, 96, 6], [150, -56, 5]]) {
    back.push(Ln(k.ring(x, y, r + 1.6, 0, P, 40), { tone: "faint" }), Ln(k.ring(x, y, r, 0, P, 40), { tone: "lo" }), Ln(k.ring(x + r * 0.12, y + r * 0.12, r * 0.55, 0, P, 32), { tone: "faint" }));
  }
  // grit: a sparse scatter of pebbles
  const pebbles = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) {
    const x = -170 + rand() * 345, y = -108 + rand() * 216;
    const inside = ROCK.every(([ax, ay], j) => {
      const [bx, by] = ROCK[(j + 1) % ROCK.length];
      return (bx - ax) * (y - ay) - (by - ay) * (x - ax) <= -40;
    });
    const onDeck = x > DECK.x - 4 && x < DECK.x + DECK.w + 4 && y > DECK.y - 4 && y < DECK.y + DECK.d + 4;
    if (inside && !onDeck) pebbles.push(at([x, y, 0]));
  }
  back.push(Dots(pebbles, { size: 0.45, tone: "lo" }));
}
// boulders: small irregular blocks resting on the surface
[[-150, -6, 7, 4], [150, 86, 6, 5], [-20, -84, 5, 3.4], [176, -14, 6, 4.4], [-62, 94, 4, 3], [76, 96, 4.5, 3], [-104, -44, 5, 3.6], [104, -78, 4, 3], [-150, 72, 4, 2.6]].forEach(([x, y, r, h], i) => {
  const ring = Array.from({ length: 7 }, (_, j) => {
    const a = (j / 7) * Math.PI * 2 + i;
    const rr = r * (0.75 + 0.25 * Math.sin(j * 2.3 + i));
    return [x + rr * Math.cos(a), y + rr * Math.sin(a) * 0.8];
  });
  const shape = rec(A.extruded(ring, 0, h, { name: `boulder${i}` }));
  put(`boulder${i}`, [x, y, h / 2], S(k.extrude(ring, 0, h, P, { bevel: 0.5 }), { tone: "lo" }), [shape]);
});

// ---------- the parent probe ----------
{
  const [x, y] = PARENT;
  const shapes = [
    ...PROBE.legs.map((deg) => rec(A.cylinder(x + PROBE.pad * Math.cos((deg * Math.PI) / 180), y + PROBE.pad * Math.sin((deg * Math.PI) / 180), 3, 0, 22, { name: "parent.leg" }))),
    rec(A.cylinder(x, y, 10, 8, 14, { name: "parent.bell" })),
    rec(A.extruded(Array.from({ length: 6 }, (_, i) => [x + PROBE.bus.r * Math.cos((i * Math.PI) / 3), y + PROBE.bus.r * Math.sin((i * Math.PI) / 3)]), PROBE.bus.z0, PROBE.deck.z1 - PROBE.bus.z0, { name: "parent.bus" })),
    rec(A.slab({ x: x - 3, y: y + 22.6, w: 6, d: PROBE.rtg.y - PROBE.rtg.r - 22.6, r: 0.6 }, 34, 6, { name: "parent.bracket" }, 2)),
    rec(A.cylinder(x, y + PROBE.rtg.y, PROBE.rtg.r, PROBE.rtg.z0, PROBE.rtg.z1 - PROBE.rtg.z0, { name: "parent.rtg" })),
    rec(A.cylinder(x, y, 17, PROBE.mast.z0, PROBE.top - PROBE.mast.z0, { name: "parent.top" })),
  ];
  const halo = `<path class="iso-halo" d="${k.haloOf({ x: x - 26, y: y - 26, w: 52, d: 52, r: 26 }, 0, 0.1, P)}" style="filter:blur(5px)"/>`;
  put("parent", [x, y, 30], halo + probeSvg(x, y, 0, P, { tone: "mid" }), shapes);
}

// ---------- power: RTG cable down to a junction box, box to the deck ----------
{
  const box = { x: -74, y: 48, w: 12, d: 12, r: 1.2 };
  slab("junction", box, 0, 8, {}, { bevel: 0.4, extra: Dots([at([box.x + 2, box.y + 2, 8]), at([box.x + box.w - 2, box.y + box.d - 2, 8])], { size: 0.4, tone: "mid" }) });
  const [px, py] = PARENT;
  const ry = py + PROBE.rtg.y + PROBE.rtg.r;
  const cable = (name, legs, bias) => {
    const route = G.fillet(legs, 3, 7);
    R.route(name, route, 0.4, { limp: true, piece: "all" });
    const ends = Dots([at(legs[0]), at(legs[legs.length - 1])], { size: 1, tone: "hi" });
    put(name, route[Math.floor(route.length / 2)], `<g class="iso-wire" data-tone="lo">${Ln(k.pathOf(route.map(at)), { tone: "lo" })}<circle class="iso-wire-end" cx="${at(legs[0])[0].toFixed(1)}" cy="${at(legs[0])[1].toFixed(1)}" r="1"/><circle class="iso-wire-end" cx="${at(legs[legs.length - 1])[0].toFixed(1)}" cy="${at(legs[legs.length - 1])[1].toFixed(1)}" r="1"/></g>`, [A.tube(route, 0.4, { name })], { bias });
  };
  cable("cable.rtg", [[px, ry, 32], [px, ry + 7, 32], [px, ry + 7, 0.7], [box.x - 6, ry + 7, 0.7], [box.x - 6, box.y + box.d + 5, 0.7], [box.x + 3, box.y + box.d + 5, 0.7], [box.x + 3, box.y + box.d + 5, 4], [box.x + 3, box.y + box.d, 4]], 2);
  cable("cable.deck", [[box.x + box.w - 3, box.y + 6, 8], [box.x + box.w - 3, box.y + 6, 13], [DECK.x + 6, box.y + 6, 13], [DECK.x + 6, box.y + 6, DECK_TOP]], 3);
}

// ---------- the factory deck ----------
{
  for (const [x, y] of k.corners(DECK, 12)) {
    cyl(`deck.anchor`, [x, y], 6.5, 0, 1.6, { tone: "lo" }, { ground: true });
    cyl(`deck.foot`, [x, y], 4.4, 1.6, DECK_Z - 1.6, {});
  }
  const screws = k.corners(DECK, 9);
  const groove = Ln(k.planOutline(k.insetPlan(DECK, 5), DECK_TOP, P), { tone: "faint" });
  const rings = Ln(screws.map(([x, y]) => k.ring(x, y, 2.2, DECK_TOP, P, 16)).join(""), { tone: "lo" });
  slab("deck", DECK, DECK_Z, DECK_TOP - DECK_Z, {}, { steps: 6, bevel: 1.2, extra: groove + rings + Dots(screws.map(([x, y]) => at([x, y, DECK_TOP])), { size: 0.5 }) });
  // ruler strip along the front edge, under the build plate
  const strip = { x: 44, y: DECK.y + DECK.d - 10, w: 96, d: 5, r: 1 };
  const ticks = k.topTicks(strip.x + 3, strip.x + strip.w - 3, 4, 5, strip.y + 0.6, DECK_TOP + 0.6, [1.8, 3.4], P);
  slab("deck.ruler", strip, DECK_TOP, 0.6, { tone: "lo", crease: "none" }, { extra: Ln(ticks.minor, { tone: "lo" }) + Ln(ticks.major, { tone: "mid" }), bias: 0.2 });
  // generation lamps on a label plate
  const lamps = { x: -24, y: DECK.y + DECK.d - 18, w: 58, d: 10, r: 1.2 };
  const rules = [0, 1].map((i) => Ln(k.lineOnTop([lamps.x + 4, lamps.y + 7 + i * 1.6], [lamps.x + 4 + (i ? 14 : 22), lamps.y + 7 + i * 1.6], DECK_TOP + 0.8, P), { tone: "lo", free: true })).join("");
  const caps = MODEL.lamps;
  const lampSvg = Array.from({ length: caps }, (_, i) => {
    const x = lamps.x + 6 + i * 5.2, y = lamps.y + 3.4;
    return `<g class="vn-lamp" data-lamp="${i}">${S(k.cylinder(x, y, 1.5, DECK_TOP + 0.8, 0.8, P, 14), { tone: "lo" })}</g>`;
  }).join("");
  slab("deck.lamps", lamps, DECK_TOP, 0.8, { tone: "lo" }, { extra: Ln(k.planOutline(k.insetPlan(lamps, 1.2), DECK_TOP + 0.8, P, 3), { tone: "faint" }) + rules + lampSvg + Dots([at([lamps.x + lamps.w - 3, lamps.y + 7.6, DECK_TOP + 0.8]), at([lamps.x + lamps.w - 8, lamps.y + 7.6, DECK_TOP + 0.8])], { size: 0.4 }), bias: 0.2 });
}

// ---------- the drill: column, sliding head, auger bit, lift tube, arm and spout ----------
{
  const [cx, cy] = DRILL.col;
  const base = { x: cx - 8, y: cy - 8, w: 16, d: DRILL.bit[1] + 6 - (cy - 8), r: 2 };
  slab("drill.base", base, 0, 3, {}, { steps: 4, bevel: 0.5, extra: Dots(k.corners(base, 2.4).map(([x, y]) => at([x, y, 3])), { size: 0.45 }) });
  cyl("drill.column", [cx, cy], 3.5, 3, DRILL.top - 3, { crease: "none" }, { inner: Ln([30, 60].map((z) => k.sideArc(cx, cy, 3.5, z, P, 16)).join(""), { tone: "faint" }) });
  const [lx, ly] = DRILL.lift;
  cyl("drill.scoop", [lx, ly], 5, 0, 5, {}, { bevel: 0.4 });
  cyl("drill.lift", [lx, ly], 2.4, 5, DRILL.top - 5, { crease: "none" }, { inner: Ln([24, 48, 72].map((z) => k.sideArc(lx, ly, 2.4, z, P, 14)).join(""), { tone: "lo" }) });
  const [bx, by] = DRILL.bit;
  cyl("drill.collar", [bx, by], 3.6, 3, 2, { tone: "mid" }, { steps: 20, bevel: 0.3 });
  const arm = { x: cx - 6, y: ly - 4, w: SPOUT[0] + 4 - (cx - 6), d: cy + 5 - (ly - 4), r: 1.5 };
  slab("drill.arm", arm, DRILL.top, 6, {}, { bevel: 0.5, extra: Dots([at([arm.x + 3, arm.y + 3, DRILL.top + 6]), at([arm.x + arm.w - 3, arm.y + 3, DRILL.top + 6]), at([arm.x + 3, arm.y + arm.d - 3, DRILL.top + 6]), at([arm.x + arm.w - 3, arm.y + arm.d - 3, DRILL.top + 6])], { size: 0.45 }) });
  cyl("drill.spout", SPOUT, 2.8, 76, DRILL.top - 76, {}, { steps: 18 });
  // live: head and bit, drawn in this slot
  put("drill.head", [cx, cy + 9, 30], `<g data-part="drill"></g>`, [rec(A.slab(DRILL.head, 14, 36, { name: "drill.head" }))], { bias: 0.5 });
  put("ore", [SPOUT[0], SPOUT[1], 71], `<g data-part="ore"></g>`, [rec(A.cylinder(SPOUT[0], SPOUT[1], 1.6, 66, 10, { name: "ore" }))], { bias: 0.4 });
}

// ---------- smelter: plinth, furnace, door and window, tap, hopper ----------
{
  const [cx, cy] = FURNACE.c;
  cyl("furnace.plinth", [cx, cy], FURNACE.r + 3, DECK_TOP, 3, {}, { steps: 40, bevel: 0.6 });
  const bands = Ln([20, 40].map((z) => k.sideArc(cx, cy, FURNACE.r, z, P, 40)).join(""), { tone: "lo" });
  const knurls = Ln(k.knurl(cx, cy, FURNACE.r, 41.5, FURNACE.z1, 40, P, 0.3), { tone: "faint" });
  const body = cyl("furnace", [cx, cy], FURNACE.r, FURNACE.z0, FURNACE.z1 - FURNACE.z0, { tone: "mid" }, { steps: 48, inner: bands + knurls });
  cyl("furnace.cap", [cx, cy], FURNACE.r - 2, FURNACE.z1, 2, {}, { steps: 40, bevel: 0.4 });
  cyl("hopper.neck", [cx, cy], 4.2, FURNACE.z1 + 2, HOPPER.z0 - FURNACE.z1 - 2, {}, { steps: 20 });
  const HF = G.frameOf([cx, cy, HOPPER.z0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const slope = (HOPPER.r1 - HOPPER.r0) / (HOPPER.z1 - HOPPER.z0);
  turned("hopper", HF, [[0, HOPPER.r0], [HOPPER.z1 - HOPPER.z0 - 2, HOPPER.r1 - 2 * slope], [HOPPER.z1 - HOPPER.z0 - 2, HOPPER.r1 + 1], [HOPPER.z1 - HOPPER.z0, HOPPER.r1 + 1]], { tone: "mid" }, {
    extra: `<path class="vn-mouth" d="${G.circleOf(HF, HOPPER.z1 - HOPPER.z0, HOPPER.r1 - 1.2, P, 48)}"/>` + Ln(k.ring(cx, cy, HOPPER.r1 - 1.2, HOPPER.z1, P, 48), { tone: "lo" }),
  });
  // door on the +y face, with a window that glows while smelting
  const door = { x: cx - 6, y: cy + FURNACE.r - 1.2, w: 12, d: 3.6, r: 0.6 };
  const fy = door.y + door.d;
  const win = [[cx - 4, fy, 24], [cx + 4, fy, 24], [cx + 4, fy, 31], [cx - 4, fy, 31]];
  const hinge = Dots([at([cx - 4.8, fy, 22.4]), at([cx - 4.8, fy, 32.6]), at([cx + 4.8, fy, 22.4]), at([cx + 4.8, fy, 32.6])], { size: 0.4 });
  slab("furnace.door", door, 21, 13, {}, { steps: 2, bevel: 0.3, meta: { seated: true, cut: [body] }, extra: `<path class="vn-window" d="${path3(win, true)}"/><path class="vn-glow" data-part="glow" d="${path3(win, true)}"/>` + Ln(path3(win, true), { tone: "lo" }) + hinge, bias: 0.3 });
  // tap: a short spout along +x that feeds the line to the gantry
  const TF = G.frameAlong([cx + FURNACE.r - 0.6, cy, 26], [1, 0, 0]);
  turned("furnace.tap", TF, [[0, 2.6], [4, 2.6], [4, 3.4], [5.4, 3.4]], {}, { bias: 0.2, meta: { seated: true, cut: [body] } });
}

// ---------- gantry: plate, rails, carriages, posts, beam, feed box ----------
const gantry = [];
{
  const [px, py] = PLATE.c;
  const ticks = k.radialTicks(px, py, PLATE.r - 1, 72, 6, PLATE.z1, [1.2, 2.6], P);
  cyl("plate", [px, py], PLATE.r, PLATE.z0, PLATE.z1 - PLATE.z0, { tone: "mid" }, { steps: 72, bevel: 0.6, extra: Ln(ticks.minor, { tone: "lo" }) + Ln(ticks.major, { tone: "mid" }) + Ln(k.ring(px, py, PLATE.r - 5, PLATE.z1, P, 64), { tone: "faint" }) });
  POSTS.forEach(([x, y], i) => {
    const rail = { x: x - RAIL.w / 2, y: RAIL.y, w: RAIL.w, d: RAIL.d, r: 1 };
    const railTicks = Ln([0, 1].map((j) => k.lineOnTop([x + (j ? 1.4 : -1.4), rail.y], [x + (j ? 1.4 : -1.4), rail.y + rail.d], RAIL.z1, P)).join(""), { tone: "faint" });
    slab(`rail${i}`, rail, DECK_TOP, RAIL.z1 - DECK_TOP, {}, { steps: 2, extra: railTicks + Dots([rail.y + 3, rail.y + rail.d - 3].map((ry) => at([x - 2.4, ry, RAIL.z1])), { size: 0.4 }) });
    for (const sy of [RAIL.y - 4, RAIL.y + RAIL.d]) slab(`stop${i}`, { x: x - 5, y: sy, w: 10, d: 4, r: 0.8 }, DECK_TOP, 8, {}, { steps: 2, extra: Dots([at([x - 2.6, sy + 2, DECK_TOP + 8]), at([x + 2.6, sy + 2, DECK_TOP + 8])], { size: 0.4 }) });
    const car = { x: x - 5, y: y - 7, w: 10, d: 14, r: 1.2 };
    gantry.push(`post${i}.car`, `post${i}.collar`, `post${i}`);
    slab(`post${i}.car`, car, RAIL.z1, CAR_Z - RAIL.z1, {}, { steps: 2, bevel: 0.4, extra: Dots(k.corners(car, 2).map(([cx, cy]) => at([cx, cy, CAR_Z])), { size: 0.4 }) });
    cyl(`post${i}.collar`, [x, y], 5, CAR_Z, 3, {}, { bevel: 0.3 });
    cyl(`post${i}`, [x, y], 3.5, CAR_Z + 3, BEAM.z0 - CAR_Z - 3, { crease: "none" }, { inner: Ln([40, 70].map((z) => k.sideArc(x, y, 3.5, z, P, 16)).join(""), { tone: "faint" }) });
  });
  const beamDots = Dots(POSTS.flatMap(([x]) => [at([x - 3, BEAM.y + 2, BEAM.z1]), at([x + 3, BEAM.y + 2, BEAM.z1])]), { size: 0.45 });
  gantry.push("beam", "feedbox", "head");
  slab("beam", BEAM, BEAM.z0, BEAM.z1 - BEAM.z0, {}, { steps: 3, bevel: 0.5, extra: beamDots + `<g data-part="filament"></g>` });
  const rail = { x: BEAM.x + 6, y: BEAM.y + BEAM.d, w: BEAM.w - 12, d: 1.2, r: 0.3 };
  gantry.push("beam.rail");
  slab("beam.rail", rail, BEAM.z0 + 1.5, 3, {}, { steps: 1, extra: Dots([0, 1, 2, 3, 4, 5, 6].map((i) => at([rail.x + 4 + i * ((rail.w - 8) / 6), rail.y + 1.2, BEAM.z0 + 3])), { size: 0.4, tone: "lo" }) });
  slab("feedbox", FEED_BOX, RAIL.z1, 8, {}, { steps: 2, bevel: 0.4, extra: Dots([at([FEED_BOX.x + 2, FEED_BOX.y + 2, RAIL.z1 + 8]), at([FEED_BOX.x + FEED_BOX.w - 2, FEED_BOX.y + 2, RAIL.z1 + 8])], { size: 0.4 }) });
  // the daughter and the head, drawn live in their own slots
  put("daughter", [px, py, 40], `<g data-part="daughter"></g>`, [rec(A.cylinder(px, py, 24, BUILD_Z, PROBE.top, { name: "daughter" }))]);
  put("head", [px, HEAD_Y, 92], `<g data-part="head"></g>`, [rec(A.slab({ x: px - 7, y: BEAM.y + BEAM.d + 1.2, w: 14, d: 8, r: 1 }, 92, 12, { name: "head" }))], { bias: 0.4 });
}
// feed line: furnace tap to the feed box on the back carriage, redrawn live as the gantry rolls
const FEED = { from: [FURNACE.c[0] + FURNACE.r + 4.8, FURNACE.c[1], 26], to: [FEED_BOX.x + 2, FEED_BOX.y + FEED_BOX.d / 2, RAIL.z1 + 8] };
put("feed", [30, -4, 20], `<g data-part="feed"></g>`, [rec(A.tube([FEED.from, [FEED.to[0] - 14, FEED.to[1], 26], FEED.to], 0.5, { name: "feed" }))], { bias: 1 });

A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
const groups = R.items.map((item) => `<g data-name="${item.name}"${gantry.includes(item.name) ? " data-gantry" : ""}>${item.svg}</g>`);

const svg = k.figureSvg({
  width: W,
  height: H,
  label:
    "A self-replicating probe on an asteroid. The parent probe, a hexagonal bus on three legs with an engine bell, an RTG and a dish antenna, has deployed a small factory deck beside it. A drill mines the rock and lifts the ore along an arm into a hopper; a furnace smelts it and feeds a print head on a gantry, which builds a copy of the probe layer by layer on a build plate. When the copy is finished it lifts off and the generation lamps on the deck count one more doubling.",
  body: [...back, `<g class="vn-scene">${groups.join("")}</g>`],
});

const DATA = { P, DRILL, FURNACE, PLATE, BUILD_Z, BEAM, HEAD_Y, POSTS, TRAVEL, FEED, HOPPER, SPOUT };
const probeScript = readFileSync(join(HERE, "probe.mjs"), "utf8").replace(/^export /gm, "");
const modelScript = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const CSS = readFileSync(join(HERE, "probe.css"), "utf8");

const body =
  `<style>${CSS}</style>` +
  k.plateHtml({
    fig: "Fig 1",
    title: "Von Neumann probe",
    hint: "Hover to scrub one replication",
    readout: "gen 0 · 1 probe · mining",
    keys: [
      { mark: "lit", label: "The daughter: printed from the asteroid, layer by layer" },
      { mark: "raised", label: "Mine, smelt, print: drill, furnace and gantry" },
      { mark: "dim", label: "Generation lamps: one per doubling" },
    ],
    caption: MODEL.caption,
    body: `<div class="iso-stage vn-stage" tabindex="0" role="slider" aria-label="Von Neumann probe: arrow keys step through mining, smelting, printing and launch" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${svg}</div>`,
  });

const page = k.pageHtml({ title: "Von Neumann probe", theme: THEME, body, script: kitScript() + modelScript + probeScript + LIVE, width: 680 });
const name = THEME === "light" ? "von-neumann-probe-light.html" : "von-neumann-probe.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `scale ${KS.toFixed(3)}`);
A.auditOrExit(R, P, {});
