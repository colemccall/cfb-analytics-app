# js/

Plain scripts, no build step, no modules: each file defines globals and the HTML loads them in order. **The order
matters** — a file may use anything defined above it. `menu.html` is the app and the only page that loads scripts: the old
`*.html` pages were retired in v4.25 and are redirect stubs (see the app README, "Old addresses").

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
| 7 | `menuScreens.js`, `menuCard.js`, `menuWeekly.js`, `menuScreensTeam.js`, `menuScreensLeague.js`, `menuScreensRatings.js`, `menuScreensClass.js`, `menuScreensPages.js`, `menuGame.js`, `menuStorylines.js`, `menuHome.js` | The screens. Each calls `menuRouter.register(id, { … })`. `menuCard.js` holds the pure builders of the player card (stats, career, why the rating is what it is, the projection's reasoning, similar players, a defensive back's three jobs). `menuScreensRatings.js` is a team's Ratings page and the talent-vs-production scatter. `menuStorylines.js` is the home page's computed claims. |

## What was retired

`shell.js`, `home.js`, `teamsPage.js`, `playerSearch.js`, `ratingsDisplay.js`, `season2026.js` and `leaguePage.js` (the classic pages'
scripts) were deleted in v4.25 after every feature they held was brought into the menu or recorded as dropped with its reason (the Build
Log, entry `v4.25-classic-retired`). The shared helpers only they used (`makeSortable`, `comparePair`, `storyCard`, the player-modal
loaders in `dataLoader.js`, the entity-link delegation in `config.js`) went with them.

## Rules the checks enforce

- No colour literals outside `config.js` palettes and the CSS token blocks (`tools/contrast-check.mjs`).
- Every function over five lines has a comment saying what it is for (`tools/doc-check.mjs`).
- Registry prose renders clean (`tools/prose-check.mjs`).
- `node --check js/*.js` must pass.
