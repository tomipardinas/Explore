// One probe, drawn from the kit. The build uses it for the parent and the page
// uses the same source for the daughter, cut at the height printed so far.
// Heights are above the probe's own base z0.
export const PROBE = {
  pad: 20, // radius of the leg circle
  legs: [40, 160, 280],
  bus: { r: 26, z0: 22, z1: 52 },
  deck: { r: 22, z0: 52, z1: 54 },
  mast: { r: 2.2, z0: 54, z1: 64 },
  dish: [[5, 64, 65.5], [10, 65.5, 67], [14, 67, 68.5], [17, 68.5, 70]],
  horn: { r: 1, z0: 70, z1: 76, cap: 1.8, top: 77.5 },
  bell: [[10, 8, 10.5], [8, 10.5, 13], [6, 13, 16], [4, 16, 22]],
  rtg: { y: 46, r: 5, z0: 26, z1: 48 },
  top: 77.5,
};

export function radiusAt(z) {
  if (z < 22) return 20;
  if (z < 54) return 22;
  if (z < 64) return 2.2;
  if (z < 70) return 16;
  return 1;
}

export function makeProbe(k) {
  const hexRing = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => [cx + r * Math.cos((i * Math.PI) / 3), cy + r * Math.sin((i * Math.PI) / 3)]);
  return function probeSvg(cx, cy, z0, P, { cut = Infinity, tone = "mid", crease = "faint", live = false } = {}) {
    const out = [];
    const top = cut - z0;
    const cutting = (a, b) => live && top > a && top < b;
    const S = (paths, style) => k.solidSvg(paths, style);
    const cyl = (x, y, r, a, b, steps = 24, extra = {}) => {
      if (top <= a) return;
      const h = Math.min(b, top) - a;
      out.push(S(k.cylinder(x, y, r, z0 + a, h, P, steps), { tone, crease, lit: cutting(a, b), ...extra }));
    };
    const at = (deg, r) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
    const depth = ([x, y]) => k.depthOf([x, y, 0], P);
    const centre = depth([cx, cy]);
    const legs = PROBE.legs.map((deg) => at(deg, PROBE.pad)).sort((a, b) => depth(a) - depth(b));
    const leg = ([x, y]) => {
      cyl(x, y, 5, 0, 2, 24);
      cyl(x, y, 3, 2, 3.2, 20);
      cyl(x, y, 1.8, 3.2, 10, 16, { crease: "none" });
      cyl(x, y, 2.8, 10, 13, 20);
      cyl(x, y, 1.8, 13, 22, 16, { crease: "none" });
    };
    legs.filter((p) => depth(p) < centre).forEach(leg);
    for (const [r, a, b] of PROBE.bell) cyl(cx, cy, r, a, b, 32);
    legs.filter((p) => depth(p) >= centre).forEach(leg);

    const { bus } = PROBE;
    if (top > bus.z0) {
      const h = Math.min(bus.z1, top) - bus.z0;
      const ring = hexRing(cx, cy, bus.r);
      const seam = top > 37 ? k.lineSvg(k.ringSeam(ring, z0 + 37, P), { tone: "faint" }) : "";
      const zTop = z0 + bus.z0 + h;
      const panels = [30, 90, 330]
        .map((deg) => {
          const [x, y] = at(deg, bus.r * Math.cos(Math.PI / 6));
          return k.segment([x, y, z0 + bus.z0], [x, y, zTop], P);
        })
        .join("");
      out.push(S(k.extrude(ring, z0 + bus.z0, h, P, { bevel: top >= bus.z1 ? 0.8 : 0 }), { tone, crease, lit: cutting(bus.z0, bus.z1), inner: seam + k.lineSvg(panels, { tone: "faint" }) }));
      const screws = [];
      for (const deg of [0, 60, 300]) {
        const [x, y] = at(deg, bus.r - 2.6);
        if (top > 25) screws.push(k.iso([x, y, z0 + bus.z0 + 3], P));
        if (top >= bus.z1) screws.push(k.iso([x, y, z0 + bus.z1], P));
      }
      out.push(k.dotsSvg(screws, { size: 0.45, tone: "mid" }));
    }
    // RCS thruster blocks on two corners of the bus, each with two nozzle dots
    if (top > 44) for (const deg of [0, 60]) {
      const [x, y] = at(deg, bus.r - 1.4);
      const plan = { x: x - 2.2, y: y - 2.2, w: 4.4, d: 4.4, r: 0.6 };
      const h = Math.min(4, top - 44);
      out.push(S(k.slabOf(plan, z0 + 44, h, P, 2, 0.3), { tone, crease, lit: cutting(44, 48) }));
      if (top >= 48) out.push(k.dotsSvg([k.iso([x - 1, y + 2.2, z0 + 46], P), k.iso([x + 2.2, y - 1, z0 + 46], P)], { size: 0.5, tone: "hi" }));
    }
    // RTG on its bracket, on the +y face
    const { rtg } = PROBE;
    if (top > 34) {
      const plan = { x: cx - 3, y: cy + 22.6, w: 6, d: rtg.y - rtg.r - 22.6 + 0.3, r: 0.6 };
      out.push(S(k.slabOf(plan, z0 + 34, Math.min(6, top - 34), P, 2), { tone, crease, lit: cutting(34, 40) }));
    }
    if (top > rtg.z0) {
      const rx = cx, ry = cy + rtg.y;
      cyl(rx, ry, rtg.r + 1, rtg.z0, rtg.z0 + 2, 28);
      if (top > rtg.z0 + 2) {
        const b = Math.min(rtg.z1 - 2, top);
        out.push(S(k.cylinder(rx, ry, rtg.r, z0 + rtg.z0 + 2, b - rtg.z0 - 2, P, 28), { tone, crease: "none", lit: cutting(rtg.z0 + 2, rtg.z1 - 2), inner: top >= rtg.z1 - 2 ? k.lineSvg(k.knurl(rx, ry, rtg.r, z0 + rtg.z0 + 2, z0 + b, 22, P, 0), { tone: "lo" }) : "" }));
      }
      cyl(rx, ry, rtg.r + 1, rtg.z1 - 2, rtg.z1, 28);
    }
    const { deck, mast, horn } = PROBE;
    if (top > deck.z0) out.push(S(k.extrude(hexRing(cx, cy, deck.r), z0 + deck.z0, Math.min(deck.z1, top) - deck.z0, P, { bevel: 0.5 }), { tone, crease, lit: cutting(deck.z0, deck.z1) }));
    cyl(cx, cy, mast.r, mast.z0, mast.z1, 16, { crease: "none" });
    PROBE.dish.forEach(([r, a, b]) => cyl(cx, cy, r, a, b, 48));
    if (top >= 70) out.push(k.lineSvg(k.ring(cx, cy, 13, z0 + 70, P, 48) + k.ring(cx, cy, 8, z0 + 70, P, 40), { tone: "faint" }));
    cyl(cx, cy, horn.r, horn.z0, horn.z1, 12, { crease: "none" });
    cyl(cx, cy, horn.cap, horn.z1, horn.top, 16);
    return out.join("");
  };
}
