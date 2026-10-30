// The numbers behind the figure. One cycle of the drawing is one generation.
export const MODEL = {
  cycle: 11, // seconds per generation in the drawing
  phases: { roll: [0, 0.06], mine: [0, 0.24], smelt: [0.14, 0.36], print: [0.3, 0.86], back: [0.86, 0.9], launch: [0.9, 1] },
  lamps: 10,
  stars: 4e11, // upper estimate for the Milky Way
  hopLy: 5, // typical distance to the next unvisited star
  speed: 0.1, // cruise speed, fraction of c
  buildYears: 500, // assumed time to mine, smelt and print one copy
  discLy: 100000,
  caption:
    "A parent probe lands on an asteroid and copies itself from the rock: the drill mines ore, the furnace smelts it, and the print head builds a daughter layer by layer, legs and engine first, then bus, RTG and dish. The gantry rolls back and the daughter leaves for the next star, about 5 light years off at a tenth of light speed, while the parent starts again. Both probes do the same, so the count doubles every generation: 39 doublings (2³⁹ ≈ 5.5 × 10¹¹) make one probe for each of the galaxy's 100–400 billion stars. The count is not what sets the time. The front can only advance one 5-light-year hop per 50-year flight plus an assumed 500-year build, about 0.009 c, so crossing the 100,000-light-year disc takes about 11 million years, well under a thousandth of the galaxy's age.",
};

export const yearsPerGen = (m = MODEL) => m.hopLy / m.speed + m.buildYears;
export const doublingsToFill = (m = MODEL) => Math.ceil(Math.log2(m.stars));
export const crossingYears = (m = MODEL) => (m.discLy / m.hopLy) * yearsPerGen(m);
export function probesText(gen) {
  const n = 2 ** gen;
  if (n < 1e6) return n.toLocaleString("en-US");
  const e = Math.floor(Math.log10(n));
  return `${(n / 10 ** e).toFixed(1)}e${e}`;
}
