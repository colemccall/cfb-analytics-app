# tools/

Checks run before a change ships (root `CLAUDE.md` §4). All are Node scripts with no install step except
`ui-smoke/`, which needs Chrome via `npm install` in that folder.

| Command | Checks |
|---|---|
| `node tools/contrast-check.mjs` | Every token pair in `css/styles.css` and `css/menu.css`, both modes, and the palettes in `js/config.js`, against the WCAG floors. Run after any palette or token edit. |
| `node tools/theme-check.mjs` | Every theme has a token block, palette keys and a swatch. |
| `node tools/doc-check.mjs` | Every JS function over five lines has a comment saying what it is for. |
| `node tools/prose-check.mjs` | Registry prose (METHODS, CHANGES, FINDINGS, GUIDE) renders clean. |
| `cd tools/ui-smoke && node smoke.mjs` | Headless Chrome: pages load, no console errors, no sideways scroll at phone and desktop widths. Headless Chrome clamps the layout viewport near 500px, so a 390px screenshot shows a false clip. |

`ui-smoke/shots/` and the `*.log` files are output from past runs; `last-run.json` is the latest result.
