# js/

Plain scripts, no build step, no modules: each file defines globals and the HTML loads them in order. **The order
matters** — a file may use anything defined above it. `menu.html` is the app; the classic `*.html` pages redirect to
it unless the URL has `?classic` (kept for the UI smoke tests).

The data these files read comes from `../data/`, written by the pipeline (see
`cfb-analytics-pipeline/docs/DATA_FLOW.md`). **`dataLoader.js` is the only file that fetches.**

## Load order in `menu.html`

| # | File | What it provides |
|---|---|---|
| 1 | `config.js` | Constants (seasons, palettes, position groups), `_esc`, `teamHref` / `playerHref` / `teamLink`. Every colour a script uses comes from a palette here. |
| 2 | `dataLoader.js` | Every `fetch*` the app makes, cached per URL. A missing file is an empty state, never an exception. |
| 3 | `ui.js` | Shared render helpers: rating pills (`ovrPill`, `livePill`), `emptyState` / `errorState` / skeletons, `trendChart`, team marks. Pill text colour comes from the luminance guard, never a fixed value. |
| 4 | `leagueData.js`, `dataTable.js` | League rules (records, standings) and the one sortable/filterable table. |
| 5 | `methods.js` + `methodsPage.js`, `changes.js` + `changesPage.js`, `guide.js` + `guidePage.js`, `findings.js` + `findingPage.js` | **The registries** and their renderers: how a number is computed (METHODS), what happened in a working session (CHANGES), How It Works (GUIDE), research claims (FINDINGS). Adding an entry is content, never page code. |
| 6 | `menuInput.js`, `menuFocus.js`, `menuChrome.js`, `menuBackdrop.js`, `menuRouter.js` | The menu's frame: mouse / keyboard / gamepad input, selection, header, the section bar and the bar of that section's pages (the `MENU_SECTIONS` table in `menuChrome.js`: every screen is in exactly one of the seven sections, so a new screen is a row there), tabs, the backdrop slideshow, hash routes (`#/team/52/roster`). |
| 7 | `menuScreens.js`, `menuCard.js`, `menuWeekly.js`, `menuScreensTeam.js`, `menuScreensLeague.js`, `menuScreensClass.js`, `menuScreensPages.js`, `menuGame.js`, `menuHome.js` | The screens. Each calls `menuRouter.register(id, { … })`. |

## Classic pages only

`shell.js` (sidebar navigation and theme for the classic pages), `home.js`, `teamsPage.js`, `playerSearch.js`,
`ratingsDisplay.js`, `season2026.js`, `leaguePage.js`. They are reachable only with `?classic`. Retiring them is a
proposal on the build log (v4.24), not done; `ratingsDisplay.js`'s scatter and position boards have no menu screen yet.

## Rules the checks enforce

- No colour literals outside `config.js` palettes and the CSS token blocks (`tools/contrast-check.mjs`).
- Every function over five lines has a comment saying what it is for (`tools/doc-check.mjs`).
- Registry prose renders clean (`tools/prose-check.mjs`).
- `node --check js/*.js` must pass.
