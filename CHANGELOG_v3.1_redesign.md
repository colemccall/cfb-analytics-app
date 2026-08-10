# v3.1 — Visual Rebuild: Readable Light/Dark Theme System

Branch: `retheme` · Commits `87d7a41` → `3f39545` (7 phases) · Baseline: `6afa19f`

## Why this happened

v3.0 rebuilt the *architecture* (shared shell, one DataTable, extracted page
modules) but kept the old skin. The result was rejected on review: "hard to
read", "murky", new editorial elements grafted onto an old costume. An audit
confirmed the complaint was mechanical, not aesthetic:

| Problem | Measured before |
|---|---|
| `--text-muted` (100+ uses, mostly 11px) | **4.1–4.5:1** on dark surfaces — fails WCAG AA |
| `--text-dim`, used on real content (`.slate-at`) | **1.6–1.9:1** — effectively invisible |
| `--border` / `--border-mid` | **1.1–1.26:1** — edges you cannot see (the "murk") |
| Palette drift | 6 ambers, 6 greens; position/tier colors defined in BOTH `js/config.js` and CSS `:root`, already diverged |
| Component duplication | 5 table styles, 3 tab systems, 5 heading conventions, 6 chip radii |
| Dead weight | ~86% of 2,177 CSS lines was legacy; ~600 lines had zero consumers |

**Binding decisions from the product owner:** two first-class themes (light AND
dark, "mid" retired); bigger readable type (16px base, nothing under 12px);
gold stays as the editorial voice on home surfaces, but **team-context surfaces
go black/white/gray so team colors and data colors provide the personality.**
These supersede earlier visual rules where they conflict — including the
blanket "badge text is always `#111`" rule, now replaced by a luminance guard.

---

## Phase 1 — Token system, theme boot, single-source palettes (`87d7a41`)

**`css/styles.css` — token blocks rewritten.** `:root` = dark,
`[data-theme="light"]` = light. The `mid` theme is deleted.

| Token | Dark | Light | Key ratio |
|---|---|---|---|
| `--bg` / `--surface` | `#0e1116` / `#161a21` | `#f2f4f7` / `#ffffff` | — |
| `--text` | `#e8ecf2` | `#171c26` | 14.7:1 / 17.1:1 on surface |
| `--text-muted` | `#9aa7b8` | `#4a5568` | **7.1:1 / 7.5:1** (was 4.1) |
| `--border` (now solid, not rgba) | `#3d4754` | `#a5afbe` | 1.85:1 / 2.2:1 (was 1.1) |
| `--border-strong` | `#5d6b7d` | `#808c9f` | 3.2:1 / 3.4:1 |
| `--voice` (editorial gold) | `#f0a830` | `#7a5200` deep ochre | 8.6:1 / 6.9:1 |
| `--positive` / `--negative` | `#43d17c` / `#ff7d78` | `#15803d` / `#b91c1c` | all ≥5:1 |
| `--stars`, `--projected`, `--info` | themed | themed | all ≥4.5:1 |

- **Deleted tokens:** `--text-dim` (banned outright), `--accent-2`,
  `--accent-glow`, `--shadow-glow`, `--hero-border`, `--table-row-alt`,
  and the duplicate `--pos-*` / `--tier-*` CSS blocks.
- **Renamed:** `--border-mid` → `--border-strong` (global, ~30 uses).
- **Fixed 3 undefined tokens** that silently dropped their properties:
  `--surface-hover` → `--surface-lift` (two dead hover states),
  `--text-primary` → `--text`, `--font-body` → `--font-ui`.

**Accent policy — one inheritance block, no component forks:**

```css
.teams-layout, .modal, .entity-scope {
  --accent: var(--text);
  --accent-dim: color-mix(in srgb, var(--text) 8%, transparent);
  --border-accent: var(--border-strong);
}
```

Custom properties inherit, so every control inside a team layout, the player
modal, or any `.entity-scope` container resolves the interaction accent to ink
automatically. The injected sidebar sits outside those scopes and keeps gold.

**`js/shell.js` — theme boot rewritten.** Order: `?theme=` URL override (for
deterministic screenshots) → saved choice, migrating legacy `dynasty-dark`/`mid`
→ `dark` and writing the migrated value back → `prefers-color-scheme`. Two
swatches (`data-theme-pick`), active state now actually marked (it never was),
and a `cfb:themechange` event on switch. `data-theme="dynasty-dark"` was removed
from all 7 `<html>` tags.

**`js/config.js` — palettes become the single source.** `POS_COLORS` and the new
`RATING_RAMP` are theme-keyed (`{dark, light}`); light gets deepened variants.
`ratingColor()` / `posColor()` read the active theme; `getRatingTier()` now
draws its color from the same ramp, so tier and rating colors cannot drift.
`ratingTextColor()`'s luminance guard is kept verbatim. TE dark was nudged
`#00ACC1` → `#26C6DA` to clear the 3:1 fill floor.

**New: `tools/contrast-check.mjs`** — parses the token blocks, evaluates the
config palettes in `node:vm`, and asserts every floor (text ≥7, muted ≥4.5,
border ≥1.8, border-strong ≥3, voice ≥4.5, data colors ≥4.5, every ramp/position
fill ≥3:1 against its guarded text color). Exits 1 with a failure table.
**Run it after any palette edit: `node tools/contrast-check.mjs`.**

## Phase 2 — Dead CSS purge (`53c088b`)

**656 lines removed**, every selector verified to have zero HTML/JS consumers
first: the entire EA-card system, the tabbed modal-hero system, `.page-header`,
`.hero`/`.feature-*`, `.player-card` family, `.team-hero` v1, `.rating-card`,
`.depth-*` / `.d-depth-*`, `.tab-btn` glow pills, `.ovr-hero`, `.tier-label`,
`.draft-ovr-pill`, `.team-rating-card`, `.stat-bar-*`, `.hover-lift`, the dead
`.research-table` rules, skeleton v1 (which fought skeleton v2 via `!important`),
the `mid` theme block, hardcoded theme-swatch gradients, and 6 unused keyframes.

## Phase 3 — Type scale (`bceec96`)

`html` 16px (was 15px), `body` 15px (was 13px). New scale:
`--fs-label 12px` (**uppercase labels only**), `--fs-sm 14px`,
`--fs-base 15px`, `--fs-md 16px`, `--fs-lg 18px`, `--fs-xl 22px`,
`--fs-2xl 28px`, `--fs-3xl 40px`, `--fs-num-lg 34px`.

Swept 99 rule bodies by heuristic — a rule with `text-transform: uppercase`
takes `--fs-label`, everything else takes `--fs-sm`. **Every 8–11.5px font size
is gone** (verified by grep), including the 9px recruiting stars and 10px board
headers. `--fs-xs` was retired entirely. Draft grid columns and
`--sidebar-width` (220→240px) widened to hold the larger text.

## Phase 4 — Component consolidation (`ec845d3`)

- **One table.** `.data-table` absorbed `.leaderboard-table`, `.history-table`,
  `.weight-table`, and the bare `table/th/td` element rules — the last of which
  was leaking `position: sticky` and `cursor: pointer` onto every table in the
  app. Call sites updated in `playerSearch.js`, `teamsPage.js`, `season2026.js`,
  `info.html`. **Zebra striping deleted** — that is what was overriding
  `.row-over`/`.row-under` on even rows (specificity 0-2-2 vs 0-1-0), so
  research over/under-performers now highlight on every row.
- **One heading system.** New `.masthead--page` variant (eyebrow → ink h1 →
  sub) replaced `.page-hero` on players / ratings / research / info. The
  duplicate `.section-heading` (defined in both stylesheets, cascading into a
  hybrid neither author intended) is now a single ink-with-voice-tick rule.
- **`makeSortable()`** rewritten to set `aria-sort` attributes instead of
  appending ▲/▼ to header text — no more double arrows, and sort arrows no
  longer pollute the text used for sorting.
- Radius scale reduced to `--radius 8px` / `--radius-sm 4px` / pill; the 3/4/6/
  8/10px literals were swept.
- Status pills moved onto semantic tokens via `color-mix`; `.btn-primary`'s
  amber glow and every `--shadow-glow` hover replaced with flat `--shadow`; the
  sidebar's per-item slide-in animation removed (chrome shouldn't animate on
  every navigation). **The one sanctioned wash survives:** the team-color
  gradient on `.d-team-hero`.

## Phase 5 — Entity neutralization (`833bcea`)

Gold now appears on team surfaces only in the nav rail.

- `.team-list-item.active`: gold wash → `--surface-lift` + inset ink bar;
  divider `rgba(255,255,255,0.03)` → `var(--border)`.
- `.d-hero-conf-badge`: gold pill → neutral outline chip.
- `.record-val`, `.hist-season`, `.tr-power`, `.tr-stat-era`, `.tr-ovr-circle`
  border, `.d-team-hero` default top border: gold → ink / `--border-strong`.
- `.stars` → `--stars` token (was `--accent`).
- Transfers `<h3>` inline gold styling → `.section-heading` class.
- **Row tints deleted** (`playerSearch.js:309`, `teamsPage.js:411`): rows were
  painted `${ovrColor}10` across their full width — the literal "murk". The
  tier-colored left border and the OVR pill carry rating identity; rows are flat.
- `#666`/`#444` JS fallbacks → `var(--text-muted)`.

## Phase 6 — JS color sweep + live theme switching (`4e19949`)

**Every color literal in `js/` is now confined to `config.js`** (the two
palettes and the guard's `#111`/`#fff`) — verified by grep.

- `ratingsDisplay.js`: `#00c853` → `var(--positive)`; the three
  `rgba(255,255,255,…)` SVG strokes (invisible in light theme) →
  `var(--text)` / `var(--border-strong)` / `var(--border)`; the inline tooltip
  style block deleted in favour of the existing `#scatter-tooltip` CSS; footnote
  → `.chart-caption`.
- `playerSearch.js`: active chip text → `ratingTextColor()`; breakout label
  colors → `var(--positive)`/`var(--negative)`; `#555`/`#fff` → tokens.
- **`onThemeChange(render)` added to `js/ui.js`**; `createDataTable` gained
  `refresh()` and `rows()`. Home, players, teams, ratings, research (×3 tables)
  and the '26 hub all re-render from the in-memory cache on theme switch — no
  refetch. Without this, JS-computed pills kept the previous theme's colors.
- `info.html`'s hardcoded gold tier legend is now rendered from
  `CONFIG.RATING_TIERS` + `ratingColor()`, so it can never go stale.

## Phase 7 — Acceptance fixes (`3f39545`)

Found by inspecting 14 screenshots (7 pages × 2 themes):

1. **PROJ column wrapped** — `▼ -15.0` broke onto two lines, reading as two
   numbers. Widened the column and added `white-space: nowrap`.
2. **POS badge overflowed its column** and `SR · Mid-American` spilled into the
   stars column. Widened POS (50→58px) and Yr/Conf (86→104px), added ellipsis.
3. **`.pos-group-badge` hardcoded `color:#111`** — light-theme position colors
   are deep, so this was black-on-dark. `posBadge()` now sets the text color
   through the luminance guard.
4. **All `@media` blocks moved to the end of `styles.css`.** They sat *before*
   the desktop rules they were meant to override and shared specificity with
   them, so source order silently disabled them — the phone board never
   collapsed. The file now carries a comment saying they must stay last.
5. **Mobile board** collapses to rank · pos · name · OVR · proj, hiding cells
   4–8 and 11 by position (both grids emit 11 cells in that order).
6. **Mobile tab bar** overflowed with five items: `flex: 1 1 0; min-width: 0`
   (without `min-width:0` flex items refuse to shrink below their label) plus a
   `short` label field in `shell.js` so `'26 Season` renders as `'26`.

> Note: screenshots at 390px show clipping that is a **headless artifact** —
> Chrome clamps its layout viewport near 500px. Verified correct at 500px.
> Use ≥500px widths when checking mobile this way.

---

## Verification performed

| Check | Result |
|---|---|
| `node tools/contrast-check.mjs` | green (both themes, tokens + palettes) |
| `node --check` on all 11 JS files | pass |
| Screenshots, 7 pages × 2 themes @1440 | inspected; 6 defects found and fixed |
| Mobile @500px | 5-column board, tab bar fits, no overflow |
| Pipeline `pytest tests/ -q` | **79 passed** (untouched by this work) |
| Sub-12px font sizes remaining | 0 |
| Color literals in `js/` outside `config.js` | 0 |
| CSS total | 2,177 → **1,446 lines** (−34%) |

## Rules this establishes

1. **Contrast floors are enforced by a tool, not by eye.** Any palette change
   must keep `node tools/contrast-check.mjs` green.
2. **No color literals outside `js/config.js`** (palettes) and the token blocks.
3. **Nothing below 12px**, and 12px is for uppercase labels only.
4. **`--voice` is editorial gold; `--accent` is the interaction accent.** Entity
   scopes re-point `--accent` to ink — never fork a component to do this.
5. **Badge/pill text color comes from the luminance guard**, not a fixed value.
   (This supersedes the older "always `#111`" rule.)
6. **Responsive blocks stay at the end of `styles.css`.**
7. **JS-computed colors need a `cfb:themechange` hook**, or they go stale on
   theme switch.

## Known gaps (not addressed here — pipeline-side or scoped out)

- `players_{season}.json` is still 8.3 MB and loaded by home/players/ratings;
  the slim grid export is pipeline work.
- `info.html` prose still predates Engine D, EDGE percentiles and the '26 hub.
- Research aggregates still don't drill down to named rows (needs per-recruit
  exports).
- `rosters.json` (59 MB) and `schedules.json` (14 MB) remain in the repo,
  unfetched by any code.
