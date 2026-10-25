# AI1 anatomy figure

An isometric figure of SpaceX's AI1 compute satellite on its integration stand, built with the anatomy kit (vendored in `kit/`, MIT).

- `node build.mjs --auto` writes `index.html` (follows the system theme). `--light` or no flag writes `index-light.html` / `index-dark.html`.
- `node build.mjs --audit` proves the geometry (clearances, supports, depth order); it should end `audit passed`.
- `model.mjs` is the one model behind every number on the page.
