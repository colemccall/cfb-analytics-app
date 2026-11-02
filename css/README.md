# css/

Three stylesheets, loaded in this order by every page: `styles.css`, `components.css`, and on `menu.html` also
`menu.css`.

| File | What it holds |
|---|---|
| `styles.css` | **The token blocks** (`:root` for dark, `[data-theme="light"]` for light): every colour, size and font the classic components use, then the base layout. Its responsive `@media` blocks are at the end of the file. |
| `components.css` | The shared components: rating pills and badges, tables, method / finding / guide entries, empty and error states, skeletons. Loaded after `styles.css`, so at equal specificity it wins. |
| `menu.css` | The menu app's skin: its own token block (`.menu-app` for dusk, `.menu-app[data-mode="light"]` for daylight) and every `.m-*` component. |

## Rules (root `CLAUDE.md` §3, checked by `tools/`)

- **Colours live in token blocks only.** A component reads `var(--…)`; a literal `#hex` / `rgb()` outside a token
  block is a bug. `tools/contrast-check.mjs` holds every token pair to the WCAG floors in both modes.
- **Nothing below 12px**, and 12px only for uppercase labels.
- **`@media` blocks go at the end of a file.** A media rule placed before a later desktop rule of equal specificity
  silently loses to it — and `components.css` loads after `styles.css`, so a desktop rule there beats a mobile rule
  in `styles.css` the same way.
- `--voice` is the editorial gold, `--accent` the interaction accent. An entity scope re-points `--accent`; a
  component is never forked to change its colour.
- Badge and pill text colour comes from the luminance guard in `js/ui.js`, never a fixed value.
