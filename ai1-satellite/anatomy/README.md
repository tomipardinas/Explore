# AI1 anatomy figure

An isometric figure of SpaceX's AI1 compute satellite floating in orbit with its wings and radiator deployed, built with the anatomy kit (vendored in `kit/`, MIT).

- `node build.mjs --auto` writes `index.html` (follows the system theme). `--light` or no flag writes `index-light.html` / `index-dark.html`.
- `node build.mjs --audit` proves the geometry (clearances, supports, depth order); it should end `audit passed`.
- `model.mjs` is the one model behind every number on the page.
- `live.js` runs the page: hover or tap a part (or its button) to step the rest back and see what it does, the slider or arrows set compute load, T slides the GPU tray. Left alone it tours the systems.
