# v3.2 — 2026 as a real season, projections that explain themselves

Shipped 2026-08-10. Companion to `CHANGELOG_v3.1_redesign.md` (the visual rebuild).

Three user-reported problems drove this pass, plus two data bugs found along the way.

---

## 1. The projections were bad, and the method was the reason

**The complaint:** "the projections for players are pretty awful. nearly every starter is
predicted to be worse. why?"

**Measured, before touching anything:**

| Current OVR | n | Old model said "worse" | Actually worse (2023–24) |
|---:|---:|---:|---:|
| 90+ | 54 | **100%** | 88% |
| 85–90 | 193 | **98%** | 71% |
| 80–85 | 400 | **92%** | 66% |
| 40–45 | 57 | **0%** (mean +12.8) | 6% |

Three separate defects:

- **Variance collapse.** Predicted OVR had SD 8.5; actual next-season OVR has SD ~11.2.
  The model erased a quarter of the spread that reality preserves, so nobody could be
  projected above 90 (predicted max 90.1 vs actual max 97.8).
- **It read one number.** `current OVR` was the top SHAP feature for **69%** of
  predictions and `class year` for another 17% — EDGE, usage and opponent features
  contributed almost nothing. Minimising squared error against weak features means
  predicting the conditional mean, which means shrinking toward the average.
- **Labels re-encoded the current rating.** `breakout = delta ≥ 5` correlated **−0.87**
  with current OVR. "Breakout" effectively meant "was bad last year".

And it barely earned its keep: naive `next = current` scored MAE 9.3; the old model ~9.

### What replaced it

`scripts/15_predict_trajectories.py`, rebuilt:

1. **Career curves, not snapshots.** Every season a player has played becomes a
   percentile *within its own season and position group* (raw EDGE is not comparable
   across either). Features are the curve's shape — recency-weighted slope,
   acceleration, distance from peak, consistency, availability, opponent strength faced.
2. **Cohort development curves.** For each (position, class year, production decile),
   what players like that historically did next. Strongest single feature, and the
   backbone of the explanation.
3. **Calibrated spread.** 50% variance inflation toward the realised distribution.
   Chosen by measurement, not taste — full quantile mapping was tested and rejected
   because it scored worse on *both* axes (MAE 9.4 and 24.9pts of decline-rate error,
   vs 8.4 and 12.8 for 50% inflation).
4. **Labels against the cohort.** "Breakout" now means beating what players like him
   normally do. Label driver correlation with current OVR: **−0.87 → −0.03**.
5. **Position ceilings hold.** Projections respect the same absolute anchors earned
   ratings do, read from script 07 rather than restated. OL had been projecting to 93
   against a documented cap of 88.

**Result on the untouched 2023–24 holdout:** MAE **8.24** vs naive **9.32**; published
80% intervals cover **79.8%** of outcomes; coverage of rated players up 51% (3,740 →
5,595). Two hard gates now fail the build: MAE must beat naive carry-forward, and
projected spread must stay within 60% of realised.

Decline rates now track reality far more closely (was 100%/98%/92% at the top three
bands, now 60%/49%/43% against an actual 86%/71%/66%). The residual optimism at the very
top is stated in the UI, along with its cause: these curves only include players who
*have* a next season, and the best leave for the NFL.

### Every projection explains itself

Each one ships signed driver contributions, a generated explanation, and historical
comparables:

> **Projected 84 (+3).** A junior EDGE whose production percentile has climbed three
> straight years (58 → 71 → 83) against a strengthening schedule. Juniors at this level
> historically add 2.5. Closest historical career shapes: *three named players* — they
> averaged +3.1.

Split across two files so the home page doesn't pay for prose it never shows:
`trajectory.json` (1.9 MB, list rows + model accuracy in `_meta`) and
`trajectory_detail.json` (5.5 MB, fetched only when the modal opens).

---

## 2. 2026 is now a real season, everywhere

- **Harvested** 2026 rosters (15,171 player-seasons, 138 teams), the 2026 signing class
  (2,778) and the 2026 portal (3,764). Before this, `player_seasons` stopped at 2025 and
  every downstream 2026 export was empty — `ratings_by_position_2026.json` was literally `{}`.
- **`scripts/16_project_ratings.py`** writes `engine="projected"` ratings via a four-step
  source chain — career curve → cohort carry-forward → recruiting grade → EA CFB 27 —
  with every row carrying its source, confidence and interval. 11,583 projected players.
  Source mix: 3,820 career-curve, 5,155 recruiting, 1,970 carry, 638 EA.
- **Freshman anchors calibrated from data**, not assumed: a .94+ recruit averages **62.9**
  as a true freshman, where the career recruiting anchors would have said ~90. Position
  adjustments only where n ≥ 50. Schedule strength is included as asked, at its measured
  effect size (+0.26 OVR per SD of tougher slate — real but small, and capped so it can't
  masquerade as more).
- **Projected team ratings** via `10_compute_team_ratings.py --engine projected`, which
  reuses the existing roster-only path rather than forking the math (SP+ cannot exist for
  an unplayed season).
- **EA CFB 27 exported** (`ea_ratings_2026.json`, 9,013 rows) and shown beside our own on
  rosters, the players grid, and a dedicated comparison on the '26 hub.

### Provenance is now structural, not a convention

`ovrPill()` takes a `season` and derives the PROJ treatment itself. With 2026 as the
default season, "the caller remembered to pass `projected: true`" was not a strong enough
guarantee — and indeed the players grid was rendering 1,220 unbadged projections until a
scripted sweep caught it. Verified across all seven pages: every rating pill on a
projected season now carries the badge.

Season constants split three ways, because "current season" meant two things:

```js
FIRST_SEASON: 2008, LAST_PLAYED_SEASON: 2025,
CURRENT_SEASON: 2026, PROJECTED_SEASONS: [2026]
```

Retrospective claims (hidden gems, research, "best class we've graded") use
`LAST_PLAYED_SEASON`; forward-looking ones use `CURRENT_SEASON` and say so.

---

## 3. Two data bugs, both user-reported

**Players on two teams in one season.** Chris Marshall appeared at Boise State *and*
Texas A&M in 2022. Root cause: the harvest upsert is keyed `(player, season, team)` and
only ever added, so when the API later corrected a team the wrong row survived forever.
**7,206 (player, season) pairs across 4,121 players** were affected — all 6,999 rows from
one early harvest run. This silently double-counted rosters and corrupted any career
trajectory built across them, which the new projection method depends on entirely.
Fixed in `_dedupe_player_seasons()` (a season's harvest is now authoritative), repaired
across `player_seasons`, `player_edge`, `stats` and `ratings`, and guarded by a contract
test.

**FCS opponents showing as "TBD".** `save_games` discarded the opponent name whenever the
team wasn't in our FBS table, and the `_build_fcs_name_map()` helper meant to compensate
looked up our internal id — which never existed for an FCS side. It had never worked, and
scanned the entire 2 GB cache directory on every export. Names are now stored at harvest
(backfilled for all 37,979 games); 3,166 FCS fixtures name their opponent, and
`opp_is_fbs` tells the UI not to link one.

---

## 4. The team selector

`.teams-layout` was `height: 100vh; overflow: hidden` around a 285px rail holding 136
full-width rows — roughly 6,000px of internal scroll to choose one team. Worse, **no
collapse rule existed between 641px and 900px**, so a tablet inherited the desktop
two-pane inside a locked-height container.

- **Desktop:** a grid of team marks (logo + abbreviation + rating) instead of a list.
  ~40 teams visible where 13 were.
- **641–900px:** the dead zone now collapses — detail is the page, picker is summoned.
- **Phone:** picker is an overlay behind a "Choose a team" button, closing on selection.
- The conference chips had **no CSS rule at all**, so twelve buttons stacked into ~330px
  above the grid. Now a wrapping row (4 lines).

---

## Verification

- `pytest tests/ -q` — **104 passed** (79 existing + 25 new contract and model tests).
- New `tests/test_export_contract.py` guards the seam between the repos: strict parse, no
  `NaN` token, no orphan exports, provenance on every projected row, intervals bracketing
  their estimate, no player on two rosters, opponents named — and **config.js season
  constants must match `manifest.json`**, which caught the 2025/2026 split-brain
  immediately.
- `node tools/contrast-check.mjs` — green in both themes.
- `node --check` on all JS.
- Scripted CDP sweep of all seven pages: console errors, pill/provenance counts, roster
  columns, and the mobile picker driven open.

## Known gaps carried forward

- Projections still overstate stability at the very top (60% projected to decline at 90+,
  actual 86%) — a consequence of variance inflation, and stated in the UI.
- Our OL projections and EA's disagree systematically, because we grade linemen through
  team proxies and EA grades individuals. Now explained in the comparison's footnote
  rather than left as a mystery.
- `players_{season}.json` is still ~8 MB; the slim-grid split remains deferred.
- Research pages, storyline drill-downs, the playoff model, NIL and headshots are all
  deferred to later sessions by explicit decision.
