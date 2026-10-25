// One model for every number the figure shows: power in, heat out, coolant flow.
// Public AI1 figures: 150 kW peak, 120 kW sustained, 110 m² radiator, ~70 m of wings.
export function makeModel() {
  const solarWm2 = 250, wingSpan = 32.5, wingH = 13, wings = 2;
  const arrayArea = wings * wingSpan * wingH;               // m²
  const solar = (arrayArea * solarWm2) / 1000;              // kW at the wings
  const peak = 150, sustained = 120, idle = 0.15, house = 5; // kW
  const radArea = 110, eps = 0.9, sigma = 5.670e-8;         // m² of panel, both faces radiate
  const gpus = 72, cpus = 36, trays = 18, switches = 9;
  const cp = 3.6, rise = 12, minPump = 0.3;                 // kJ/kg·K water-glycol, K design rise
  const fullFlow = peak / (cp * rise);                      // kg/s at peak
  function state(load) {
    const compute = peak * (idle + (1 - idle) * load);      // kW drawn by the rack, all of it becomes heat
    const flow = Math.max(minPump * fullFlow, compute / (cp * rise));
    const dT = compute / (cp * flow);
    const perFace = (compute * 1000) / (2 * radArea);       // W/m² leaving each face
    const radT = Math.pow(perFace / (eps * sigma), 0.25) - 273.15;
    const hot = radT + 4 + dT / 2;
    return { load, compute, flow, dT, radT, hot, cold: hot - dT, perGpu: compute / gpus, margin: solar - compute - house, pump: flow / fullFlow, sun: compute + house };
  }
  return { solar, arrayArea, peak, sustained, idle, house, radArea, gpus, cpus, trays, switches, fullFlow, state };
}
