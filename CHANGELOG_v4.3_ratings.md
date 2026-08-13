# v4.3 — the recommendations, built

*2026-08-12. Rating version v4.3, EDGE model `v4.3-local`.*

Every option marked "recommended" in `docs/ALTERNATIVES.md` has been implemented. Most worked.
Two did not survive contact with their own tests, and this document leads with those, because
the tests are the point.

---

## The two that failed

### Havoc share does nothing, and is published anyway

The idea: a tackle for loss on a defence that recorded eighty of them is a different claim from
the same tackle for loss on a defence that recorded twenty. So credit a front-seven player for
his share of his unit's havoc, using `defense.havoc.frontSeven` — a published, standard
definition that maps almost exactly onto our position groups.

The ablation, measured as mean within-position Spearman against EA CFB 27 across the six
defensive groups, against a baseline with neither new team-context signal:

| variant | gain |
|---|---:|
| opportunity index | **+0.0085** |
| opportunity index, values shuffled across teams | **−0.0025** |
| havoc share | +0.0011 |
| havoc share, **one shared constant denominator** | **+0.0019** |

The last line is the verdict. A denominator that performs *worse* than a constant is not a
denominator: the credit was re-weighting tackles for loss, passes defensed and fumble
recoveries, all of which the composite already counts. Paying for them again is double-counting
with extra steps.

Contrast the opportunity index directly above it, which passes the same test the coverage credit
passed in v4.2 — real signal helps, shuffled signal actively hurts. That asymmetry is what
distinguishes information from magnitude.

`HAVOC_CREDIT = {}`. The share is still computed, stored on `player_edge` and exported, because
"this player accounted for 18% of his unit's disruption" is a real fact about him. It is simply
not part of his number.

**A note on how nearly this was missed.** The first placebo shuffled the values but preserved
*which* players got a bonus, and scored the same as the real signal — which looked like the real
signal failing. The finer ablation, holding one variable at a time and testing the denominator
specifically, is what separated them. A placebo that preserves the selection tests nothing.

### Modelling NFL departure does not improve accuracy

`/draft/picks` finally supplied the data for §4d survivorship: cohort curves are built only from
players who had a next season, which silently means players who did not leave for the NFL.

Measured, it is exactly the shape the disclosure predicted: **22.1% of top-production-decile
players depart, against 0.7% in the bottom half**, 3.8% overall.

And it does not help. MAE 8.19 → 8.22 on offence, 8.45 → 8.44 on defence — both inside the
noise. It shipped anyway, because a disclosed limitation with a number beside it is a different
thing from one without, and the model can now see how selected its own training population is.

**A trap worth recording.** The feature returned exactly 0.0% for every cohort cell on its first
run. It was built from the same `train_mask` every other cohort statistic uses — and that mask
requires a next season, which a departing player does not have. It was measuring departure among
the players who did not depart. Cohort statistics and departure statistics need different
denominators, and their resemblance is the trap.

---

## The offensive line: a number removed, a number added

**No lineman carries an earned rating.** The one that used to be there read two team keys that
were never written into the payload it read them from, so 55% of the formula silently collapsed:
one term to zero, the other to a constant. What shipped was
`0.25 + 0.30·recruiting + 0.10·class + 0.05·award`.

| | |
|---|---|
| OL payloads containing `team_rush_ypa` | **0 of 280** |
| Correlation with the recruiting composite | **0.877** (every other position is under 9%) |
| Rated linemen landing on exactly 80.0 | **59 of 293** (20%) |
| Agreement with EA CFB 27 | **−0.274** — negative |
| Linemen rated at all | 280 of 2,952 (9%) — only those who happened to record a tackle |

Withdrawing a number is a real cost, so it needed to be worth it. Those five rows are why.

**What replaced it** (`utils/line_unit.py`): a rating of the LINE, from five standard metrics
that exist — line yards, stuff rate, power success, second-level yards, and sack rate allowed
per dropback. Attached to the team-season, never allocated back to individuals.

Validated against the only external check available, `scripts/validate_vs_draft.py`:

- Spearman(line rating, linemen drafted off that season) = **+0.179**
- Mean line rating by picks: **65.2** with none, **70.8** with one, **77.1** with two

Weak, real, and pointing the right way — against a withdrawn rating that pointed the wrong way.

### A bug this shipped with for exactly one run

Bounds pooled across all eighteen seasons produced a median line rating of **52 in 2008 rising
to 77 in 2023**. That is not improvement. Median line yards jump 2.885 → 3.095 between 2020 and
2021 and stuff rate drops 0.199 → 0.165 in the same step — a 7% jump and a 17% drop between two
consecutive seasons is a provider changing a definition, not 130 teams simultaneously learning
to block.

Bounds are now bucketed into three eras (2008–13, 2014–20, 2021+), each calibrated on its own
p10/p90. Season medians now run 61–73 with no trend. Within an era they are still fixed absolute
constants, so the `AUDIT_FINDINGS.md` §9 guarantee holds.

`tests/test_export_contract.py::TestLineUnitRating::test_line_rating_does_not_drift_across_eras`
is what stops it being pooled again.

### Consequences handled

`avg_top()` in script 10 returned a hard-coded **50.0** for a position with nobody rated. OL is
40% of run offence, so withdrawing the ratings without changing it would have made 40% of every
team's run offence an identical constant, silently. It now returns `None` and the weights
renormalise — and the rule is universal, so a team with no rated kicker no longer gets a
fabricated 50 for special teams either.

Script 07 emits OL rows with `overall_rating = None`, `rating_status = "not_rated"` and a
reason. A missing row would make a lineman vanish from his own roster; a withheld one keeps him
there and says why.

---

## Defence: three changes that worked

| change | what it does | evidence |
|---|---|---|
| **Solo/assist split** | `SOLO × 1.25 + ASSISTED × 0.65` | Aggregate-neutral by construction: solos are 56.4% of tackles, so 0.564×1.25 + 0.436×0.65 = 0.988. 2013+ only — zero rows carry `defensiveSOLO` before it. |
| **Fumble recoveries** | a takeaway the composite did not count | `fumblesREC`, 8,495 nonzero rows |
| **Opportunity index** | counting stats ÷ plays faced, clipped to [0.85, 1.20] | +0.0085 vs EA; shuffled placebo −0.0025 |
| **Rate shrinkage** | `(events + 12·prior) / (tackles + 12)` | CB instinct p90 **2.000 → 0.315** |

### `fumblesFUM` is not a forced fumble

The original recommendation said "forced fumbles and recoveries". Measured before implementing:
`fumblesFUM` on a defensive row is a fumble the player **committed**. Only 974 defensive game
rows carry one, 84% of them in a game where the player also had a return, an interception or a
recovery — the ball was in his hands — and 455 of the 974 also carry `fumblesLOST`. Crediting it
would have paid a corner for coughing up an interception return.

Forced fumbles are not published per player anywhere in the API.

### The shrinkage was overdue by more than it looked

`instinct = (INT + PBU) / max(TOT, 1)` gave a player with one tackle and one breakup a perfect
1.0. Thirty percent of rated defenders have five or fewer tackles, so this was not an edge case:
**5,848 player-seasons posted a ratio of 1.0 or better against a normalisation ceiling of 0.3**.
Nine corners in ten were clipping to maximum — the feature was a constant for most of the pool
rather than a measurement. `FEATURE_BOUNDS` were re-derived afterwards, because leaving the old
ones would have kept it saturated.

### Net effect, EA agreement 2025

| position | v4.2 | v4.3 |
|---|---|---|
| EDGE | 0.5699 | **0.5822** |
| DL | 0.4766 | **0.4849** |
| LB | 0.6380 | **0.6400** |
| CB | 0.5654 | **0.5711** |
| S | 0.7219 | 0.7202 |
| DB | 0.5901 | **0.6132** |

Offence is unchanged, as expected — nothing offensive moved. `ARCHETYPE_SCALE` was re-measured
as the rules require: ball hawk 12.9 → 13.4 after fumble recoveries entered it; run support
unmoved at 14.8, which independently confirms the tackle changes really were aggregate-neutral.

---

## Research: three findings that now say what they claim

### Recruiting ROI measured recruiting

The page said hit rate separated programs that recruit well from programs that develop well.
Measured, it correlated **+0.266** with the class's own recruiting composite. It was close to a
restatement of the star ratings.

Expected peak OVR is now fitted per **recruit** from his own composite
(`54.60 × composite + 21.32`, n = 37,462, R² = 0.063) and the class is scored on the average
residual. Expected hit rate comes from observed rates within composite bands: 27.9% below 0.80
rising to 61.9% above 0.97.

**Correlation with class recruiting strength: +0.254 → −0.028.** The metric no longer measures
recruiting, which was the entire point.

Caveat stated on the page: peak rating on composite explains only 6% of the variance between
recruits, so the residual is mostly the player, not the program.

### The coaching event study was never blocked

It was recorded as blocked for months because the local coaching table held 20 hand-seeded rows.
`/coaches` carries full tenure back to 2008 — **2,584 coach-seasons** — and nobody had asked.

- 303 coaching changes with at least two rated seasons on each side
- Median step **−1.89** SP+ points; only **40.6%** improved the residual at all
- Step SD 9.15, against a residual SD of 9.82 — at the level of one hire this cannot tell you much
- **Coach carry-over r = +0.343** across 101 coaches with two measurable stints

The negative median is genuinely surprising and is flagged as such rather than presented as a
finding: programs fire coaches after bad seasons, so the "before" is selected for being low and
mean reversion alone predicts improvement.

### Everything ranked now carries an interval

`utils/shrinkage.py`, applied to 2,310 team-seasons and 2,700 recruiting classes. Rank 2,310
noisy things and the top of the list is selected substantially for noise. 80% intervals,
deliberately matched to the projection engine's bands so two confidence levels do not coexist in
one product.

### Hidden gems has a denominator

It was selection on the outcome with no base rate. It now leads with the share of every recruit
at each star level who reached 70+, so a reader can tell whether the list is remarkable or
arithmetic.

---

## The first real backtest

`scripts/validate_vs_draft.py`. Every other check on these ratings is either internal
(distribution shape) or a cross-section against one season of EA. The draft is eighteen years
deep, decided by people spending real money, without seeing our numbers.

- Drafted players average a peak rating of **82.8** against **62.8** for undrafted — a 20-point gap
- Calibration is **monotone**: 90+ → 66.4% drafted · 85–89 → 31.3% · 80–84 → 13.5% · 75–79 → 5.2% · 70–74 → 3.9% · under 70 → 1.8%
- Agreement with draft order, offence: QB 0.47 · RB 0.49 · WR 0.42 · TE 0.42
- Agreement with draft order, defence: DB 0.25 · CB 0.24 · S 0.18 · EDGE 0.18 · LB 0.18 · DL 0.13

**That last line is the most useful number in this release.** Our offensive ratings order draft
picks roughly twice as well as our defensive ones. It is consistent with everything else known
about the defensive ratings, it is measured against something external and historical, and it is
the clearest single argument for the next phase.

---

## The harvest

`scripts/09_harvest_supplemental.py` — **17 datasets, 210,287 rows**, held whether or not
anything consumes them yet.

| dataset | rows | what it is for |
|---|---:|---|
| `coaches` | 2,584 | the event study above |
| `draft_picks` | 4,858 | external validation, departure modelling |
| `team_advanced_season` | 2,295 | the line rating, the defensive denominator |
| `team_advanced_games` | 35,422 | per-game opponent context |
| `team_havoc_games` | 22,876 | per-game havoc |
| `betting_lines` | 43,489 | the market baseline a playoff model must beat |
| `pregame_wp` | 10,126 | an independent win-probability benchmark |
| `cfp_participants` | 24 | structured playoff ground truth |
| `player_success` | 32,080 | per-player play counts (offence only) |
| `player_wepa` | 9,044 | opponent-adjusted EPA — a benchmark, never an input |
| `returning_production` | 1,691 | projection and playoff features |
| `team_ratings_external` | 10,409 | Elo, FPI, SRS, core |
| `game_weather` | 24,001 | playoff-model context |
| `team_records` | 6,773 | home/away/neutral splits |
| `team_ats` | 1,493 | cover margin |
| `team_talent` | 2,278 | composite talent |
| `venues` | 844 | capacity, dome, elevation |

The playoff model now has its features, its ground truth and two independent benchmarks on disk
before the model exists. `play_stats` is deliberately excluded from `--all`: the endpoint caps
at 2,000 records so it must be sliced by team, which is ~130 requests per season.

The survey said `/stats/season/advanced` began in 2010. The harvest found **2008**. Probing four
years and interpolating is not the same as asking.

---

## Verification

- `pytest tests/ -q` — **275 passed** (was 201; 74 new across `test_line_unit.py`,
  `test_shrinkage.py`, `test_coaching.py`, `test_defense_v43.py` and the contract suite)
- `python scripts/validate_ratings.py --season 2025` — every position within bounds; OL reports
  `withheld` rather than a bare NaN
- `node tools/contrast-check.mjs` — all floors green, dark and light
- Full recompute 2008–2026: scripts 06 → 07 → 10 → 11 → 15 → 16 → 10 (projected) → 13 → 14 → 12

## Files

**New:** `utils/line_unit.py`, `utils/shrinkage.py`, `utils/coaching.py`, `utils/draft.py`,
`scripts/09_harvest_supplemental.py`, `scripts/validate_vs_draft.py`,
`cfb-analytics-app/research-coaching-impact.html`, four test modules.

**Substantially changed:** scripts 06, 07, 10, 12, 13, 14, 15; `utils/api_client.py` (19 new
fetchers), `utils/store.py` (`write_raw`), `utils/json_utils.py` (`flatten_keys`);
`js/methods.js` (rewritten and expanded), `js/methodsPage.js`, `js/findings.js`, `js/config.js`,
`js/ui.js`, `js/teamsPage.js`, `js/ratingsDisplay.js`.
