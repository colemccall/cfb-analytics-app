# Coding standards — cfb-analytics-app

The rules for writing code in this repo, each paired with what enforces it. Where a
rule exists because something broke, the break is named, so the rule can be argued
with on its merits rather than obeyed as folklore.

The project-wide rules — what may ship, the registries, the frozen design decisions —
are in `../CLAUDE.md` and outrank anything here. The pipeline's equivalent of this
file is `../cfb-analytics-pipeline/docs/CODING_STANDARDS.md`.

---

## 1. Shape of the code

**No build step, no framework, no runtime dependencies.** Plain `<script>` files that
share one global scope, loaded in a fixed order (README → *Script load order*). A
dependency under `tools/` is fine because nothing the site serves loads it.

**One job per file.** Each page has one module (`home.js`, `teamsPage.js`, …). Shared
logic lives in:

| File | Owns | Never contains |
|---|---|---|
| `config.js` | constants, palettes, colour helpers, entity links, `_esc` | fetches, page logic |
| `shell.js` | theme, sidebar, mobile tab bar | anything page-specific |
| `dataLoader.js` | **every** `fetch()` in the app, via `_load()` | markup |
| `ui.js` | render primitives (`ovrPill`, `deltaChip`, `prose`, …) | fetches, page state |
| `dataTable.js` | the one sortable/filterable table | page-specific columns |

**Registries hold content; `*Page.js` files hold presentation.** `METHODS`, `CHANGES`,
`FINDINGS` and `GUIDE` are data. Adding an entry is never page code — if it seems to be,
that is a design change and gets said out loud first (`CLAUDE.md` §2).

## 2. Documentation in the code

- **Every file opens with a header**: what it is for, what it must never do, its load
  order, and which page calls its entry point.
- **Every top-level function over five lines has a `//` block directly above it**
  saying what it renders or returns, what it reads, and any rule it exists to enforce.
  Enforced by `node tools/doc-check.mjs` (138/138 as of 2026-09-23; it was 71/135).
- **Comment the why, not the what.** "Bound once — the `<select>` outlives this
  function" is useful; "add a listener" is not.
- **When code fixes a bug, say what the bug was, with the number.** "A single team
  pick redrew the scatter three times" survives refactors; "fix listener" does not.
- **A comment that describes the code must match it.** If you change behaviour, change
  the comment in the same edit. A stale comment is worse than none because it is
  believed.

## 3. Data

- **Only `dataLoader.js` fetches.** Everything goes through `_load(file)`, which caches
  for the life of the page and turns every failure into `null`. Two page modules once
  called `fetch()` directly with their own caches; both now use `_load`.
- **Don't request a file that cannot exist.** Unplayed seasons have no
  `similar_players_*` or `team_stats_*`. Guard
  with `isProjectedSeason()` or the constant; the smoke test fails on any 4xx.
- **A constant that mirrors a pipeline output needs a pipeline test.** `config.js`
  cannot read the manifest at load time, so each mirrored value is guarded
  (`test_export_contract.py`, `test_frontend_config.py`).
- **Missing is not zero, and a field that is always the same value is not data.** The
  scatter tooltip showed `trajectory`, which the export carries as 0.0 on every played
  row; it rendered "→ 0.0" 22,523 times. Check a field's distribution before
  displaying it.

## 4. Rendering

- **Escape by default.** Every data string goes through `_esc()`; registry prose goes
  through `prose()`, which escapes first. Build markup from primitives in `ui.js`, not
  hand-written pills and chips.
- **Provenance is derived, never passed.** Pass `season` to `ovrPill()`; never compute
  "is this projected" at a call site.
- **Rebuild, don't append.** A render function must produce the same DOM however many
  times it runs — theme changes re-run them. Use `replaceChildren()` or `innerHTML =`.
  (`buildPosChips()` appended, and each theme switch doubled the chips.)
- **Bind listeners once to elements that outlive a render.** Guard with a flag
  (`el._bound`) or bind in the one-time init. Listeners on freshly rendered markup are
  fine. (A per-season `change` listener on the Ratings team picker stacked three deep;
  a `{ once: true }` Escape handler was consumed by the first key of any kind.)
- **A filter change during a fetch is queued, not dropped.**
- **Two clocks.** Retrospective claims read `CONFIG.LAST_PLAYED_SEASON`; forward ones
  read `CONFIG.CURRENT_SEASON` and say they are projections. A panel's title and its
  data must use the same clock. (Home's "Last Season's Standard" showed 2026
  projections.)
- **Every link a page emits, the target page must honour.** `playerHref()` and
  `teamHref()` emit `?season=`; both pages read it.

## 5. CSS

From v3.1, enforced by `tools/contrast-check.mjs` and review:

- No colour literals outside `config.js` palettes and the CSS token blocks.
- Nothing below 12px; 12px only for uppercase labels.
- `@media` blocks at the **end** of `styles.css`.
- JS-computed colours re-render through `onThemeChange()`.
- **Layout must not depend on content width.** A flex child with auto side margins
  shrink-wraps to its content; `.page-content` needs `width: 100%` or a wide table
  widens the whole page on a phone. Size charts from the content box, not
  `clientWidth` (which includes padding).

## 6. Naming

- `camelCase` functions, `UPPER_SNAKE` constants, `_leading` for file-private helpers
  and state.
- Page entry points are `init<Page>()` and are called from the page's inline script.
- `build*` / `render*` return or write markup; `load*` / `fetch*` return data; `bind*`
  attach listeners.

## 7. Before you call it done

```bash
node --check js/*.js                 # syntax, every file
node tools/doc-check.mjs             # documentation rule (§2)
node tools/prose-check.mjs           # registry prose renders without stray markup
node tools/contrast-check.mjs        # after any palette edit
node tools/theme-check.mjs           # after adding or editing a theme (CONFIG.THEMES)
cd tools/ui-smoke && npm install && npm run smoke   # every page, panel and control
```

The smoke suite (`tools/ui-smoke/smoke.mjs`) drives system Chrome against a local
static server. It fails a check on any script error, console error or failed request,
and it prints what it saw. Its exit code is the number of failures.
