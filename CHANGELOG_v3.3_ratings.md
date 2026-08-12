# v3.3 — the ratings themselves, and the players they were dropping

Shipped 2026-08-12. Companion to `CHANGELOG_v3.2_projections.md` (2026 as a real season) and
`CHANGELOG_v3.1_redesign.md` (the visual rebuild).

v3.2 rebuilt how the platform *projects*. This pass rebuilt what it projects *from*. Seven
complaints came in about the ratings, position by position. All seven reproduced against the
data. Fixing them turned up two bugs nobody had complained about, because both were invisible
from the outside: a defense's schedule was being read as its coverage ability, and several
thousand players who took the field were being dropped from the ratings entirely.

Every number below was measured. Where a change cost accuracy, the cost is stated.

---

## 1. The instrument that made this checkable

EA Sports CFB 27 — 9,013 players, the same 136 FBS teams, an independent scouting consensus.

**EA is a reference, not a target.** It never supplies a number. It answers exactly one
question: *are we too generous, too stingy, is the ceiling in the right place.* Our own EDGE
distribution supplies the scale. Rank-matching to EA every season would reintroduce precisely
the pool-relative scaling the project forbids — the kind that guarantees somebody rates 99
every year and destroys comparability between 2012 and 2025.

The reason to trust it as a reference is that it independently reproduced the one position
judged already correct. Tight end was called "amazing" with no knowledge of EA's numbers; EA
rates 17 tight ends at 85+ and 3 at 90+, and so did we. **TE was therefore left untouched**,
as was OL.

| Position | EA 85+ / 90+ | Ours, before | Diagnosis |
|---|---|---|---|
| QB | 27 / 9 | 38 / 5 | ceiling flat, else fine |
| RB | 70 / 15 | 24 / 7 | ceiling flat, else fine |
| WR | 83 / 15 | 45 / 9 | **middle far too low** |
| TE | 17 / 3 | 17 / 4 | correct — untouched |
| EDGE | 32 / 12 | 18 / 7, max 99 | thin at the top, tip too high |
| DL | 33 / 7 | **45 / 14** | too generous |
| LB | 45 / 10 | 54 / 16 | mildly generous |
| CB+S+DB | **113 / 24** | **53 / 15** | less than half what it should be |
| K | 5 / 0 | **17 / 7** | too generous |
| P | **1 / 0** | **38 / 9** | 38× too generous |

---

## 2. The secondary: a corner's best game leaves no trace

Quarterbacks stop throwing at a corner who covers. So for this one position group, the
counting stats every rating is built from measure **the opposite of what we want** — volume
accrues to the defensive backs who get picked on. Caleb Downs, a player no credible top-five
safety list omits, rated 22nd among safeties.

The machinery to know which defenses were good already existed. It was multiplicative, and
**1.1 × a suppressed number is still suppressed**. That is the entire bug in one line.

**Coverage denial is now credited additively.** A defensive back who is one of his secondary's
regulars is credited for how few passing yards his defense allowed, whether or not the ball
came near him — the same reasoning offensive line ratings already ran on, carrying the same
humility about what a team proxy can tell you.

| Coverage credit | Spearman vs EA (2025 DBs, n=954) |
|---|---|
| none | 0.6386 |
| ×3 | 0.6570 |
| ×4 (peak; shipped at ×3.5) | **0.6576** |
| ×8 | 0.6521 |
| ×4, **randomly chosen** defenses credited | **0.6293** |

The placebo row is the load-bearing one: crediting the same magnitude to random defenses
scores *below crediting nobody*, so the gain is the denial signal and not the extra points.

### The bug inside the fix: a soft schedule looked like good coverage

Raw yards-per-attempt allowed cannot tell a defense that shut down good passing offenses from
one that never faced any. Denial is now measured **against the offense actually faced**: each
game is compared to what that offense does in its *other* games, and the shortfalls are
attempt-weighted across the season. Per game only for the comparison — the credit itself stays
a season figure, because one game's passing line is mostly noise and a season of them is the
defense.

| Season | Before | After |
|---|---|---|
| 2025 | 0.6507 | **0.6588** |
| 2024 | 0.5357 | **0.5421** |
| 2023 | 0.2756 | **0.2818** |

Small, in the same direction every season, and the shuffled-team placebo again scores below
crediting nobody.

### A defensive back's overall *is* his three archetypes

"Defensive back" is three jobs wearing one label. Each player-season now carries three
sub-scores on one 0–10 axis: **ball hawk** (interceptions, breakups, defensive TDs),
**lockdown** (playing time × how little his defense allowed per pass — no box-score input at
all), and **run support** (tackles, TFLs, sacks — the only place tackles count as production).
Weighted CB 40/40/20, S 20/30/50, DB even thirds.

This *costs* accuracy: Spearman against EA goes 0.660 → 0.655 (2025) and 0.555 → 0.540 (2024)
versus the flat composite. Bought deliberately, so that the number on a defensive back's card
is literally the three numbers printed beside it. Reverting is one line.

Two combinations were rejected on measurement. Best-skill-plus-partial-credit scored 0.643 —
taking a maximum discards the information that a player is good at two things. And the first
scale constants, carried over from a prototype with a different denial signal, left coverage
topping out at 7.1 on a 0–10 axis while run support reached 20: coverage could not win a
comparison it existed to win, and only 25 of 2,026 defensive backs typed as coverage players.

---

## 3. Receivers, specialists, and the ceiling

- **The WR middle was a category error, not a mis-estimate.** A team rotates three to five
  receivers through real snaps; the anchors priced the WR3 nationally as a reserve. The 72 and
  77 anchors are now the last man in a 3.5-deep rotation and the rank-286 receiver. The same
  mistake sat in the projection gate, where a receiver third on his depth chart was treated as
  buried — `PATH_TOP_DEPTH_BY_POS` now reads WR 4, RB 3, TE 2, QB 1.
- **Specialists occupy a narrow band by design.** The tell that this was wrong was a punter
  outranking the receivers on his own team page. K and P now top out near 90, and an average
  specialist is an average player. Their impact range is genuinely smaller than a skill
  player's, and the rating should say so.
- **QB and RB ceilings were flat**; DL and LB were generous. Anchors adjusted, distributions
  re-checked.

---

## 4. Projections split by position family

One model over all positions was averaging good inputs with bad ones.

| Family | Method | Holdout (naive → model) | Interval coverage | Confidence |
|---|---|---|---|---|
| Offensive skill (QB/RB/WR/TE) | career curve + cohort + **opportunity** | 9.10 → **8.17** | 80.6% | high |
| Defense (EDGE/DL/LB/CB/S/DB) | career curve + cohort | 9.63 → **8.45** | 78.8% | **low**, said so in the UI |
| Specialists (K/P) | carried forward | — | — | low |
| **OL** | **not projected** | — | — | — |

Both models beat naive carry-forward, and each carries its own calibration and interval
quantiles — their error distributions are different shapes, and sharing them mis-covered both.
Those are the numbers after retraining on the recomputed ratings; the 80% intervals cover
80.6% and 78.8%, which is the second gate, and the model refuses to ship if either family
fails to beat its own naive baseline.

### Opportunity: what a player did only predicts what he'll do once you know he'll get the ball

Three new feature families for offensive skill players — his share of his position room's
production, his depth-chart rank on **next** season's roster (computed from who is actually
returning), and how much production is departing **ahead of him**. Measured on 2023–24:

| Production ahead of him that departs | n | Yards | OVR |
|---|---:|---|---:|
| Nothing (<2%) | 4,283 | 1,080 → 1,022 | −2.6 |
| Some (2–15%) | 1,196 | 891 → 822 | −2.5 |
| A lot (15–35%) | 1,329 | 743 → 752 | −1.4 |
| **The job is wide open (>35%)** | **1,561** | **599 → 820** | **+1.7** |

A 280-yard swing driven purely by opportunity, invisible to a career curve. It improves yards
prediction ~9% and OVR ~1.8% — and that gap is itself informative, since OVR is per-game and
volume-normalised by construction, so it deliberately strips out most of what opportunity
drives.

**A breakout now requires a path to the ball.** Regression toward the mean makes any model
optimistic about players near the rating floor, and without a gate the breakout list filled
with fourth-stringers — one 58-yard receiver sat third on his depth chart behind players who
were all returning and still scored +18.9 against his cohort. A breakout call now additionally
requires top-2 on the new depth chart, ≥25% of the work ahead departing, or ≥300 yards of his
own. **67 calls were demoted to steady.**

### 2,902 offensive line projections were deleted rather than shown

The OL rating is built from team proxies plus recruiting; it is 77% recruiting and capped at
88 because the composite saturates. Projecting it forward would be forecasting a recruiting
ranking in costume. Rosters now show *"not projected"* with the reason on hover. Team ratings
absorb the absence uniformly — every team loses the same OL contribution — so relative
ordering holds.

This does **not** fix the earned OL rating. That needs per-player blocking data we do not
have, and it is the top item in `docs/ROADMAP.md`'s EA section.

---

## 5. The players the ratings were dropping

Rating inner-joined on the API's season-aggregate stats row. Two kinds of player therefore
had no rating at all, and neither was visible from the outside:

- **No aggregate was ever written** — ~350–465 player-seasons a year, most of them with a
  complete EDGE score already computed from their game rows.
- **An aggregate exists but holds no production.** The harvest writes one whenever usage *or*
  PPA *or* a box score came back, so a row can carry nothing but a snap share. Counted as
  present, those players read as zero production — which also drags down their whole position
  room's shares. 176 offensive skill players in 2025 alone.

Jayden Virgin-Morgan played four seasons at Boise State with 12–14 game rows each and was
rated in none of them. To a reader he had no history at all.

`utils/stat_agg.py` now owns one shared rule for all three consumers (rating, export,
projection). Summing is only correct for counts: `LONG` is a maximum, rates are recomputed
from totals rather than averaged over per-game averages, and the game shape's paired strings
(`"25/38"`, `"2/3"`) have to be split first — reading `passingATT` straight off a game row
returns nothing, which is how rebuilt quarterbacks were showing zero attempts in the
projection features. Rebuilt payloads are marked `rebuilt_from_games` and carry no usage or
PPA, because game rows never had them.

The full recompute rebuilt **6,711 season aggregates** from game rows and recovered
**2,989 player-seasons** that had no rating at all. Recovery is a 2016-and-later phenomenon —
before then the season aggregate is a superset of the players with game rows, so those seasons
came back byte-for-byte identical — and it grows every year from +91 in 2016 to +446 in 2024,
which means the bug had been getting quietly worse as the API's game-level coverage outpaced
its season-aggregate coverage.

---

## 6. Provenance, restated

v3.2 established that a projection must never be mistakable for an earned rating, and
enforced it structurally: `ovrPill()` takes the season and derives the badge itself, so no
call site can forget. That was right, and it produced a page where 12,000 numbers each wore
the same badge — which is noise, not provenance.

The rule is now: **say it once where everything is projected, mark the exception where they
mix.** A wholly projected season states it in a notice at the top of the page; every projected
pill still carries its hatched fill and a tooltip naming the source. The badge is reserved for
mixed contexts — an earned 2025 rating beside a projected 2026 one, or a team-history table
spanning played and unplayed seasons.

The projection section on a player card is now gated to the season the projection is actually
*about*. Engine D predicts one season ahead of the career it reads, so a record built from
2025 is a 2026 number; showing it on the 2025 page put a forecast next to an earned rating for
a season already played, which reads as a contradiction. It also stopped the card fetching
6 MB of reasoning prose to fill a container that was never rendered.

---

## 7. What this pass did not fix

- **The earned OL rating is still 77% recruiting.** Only the projection was withdrawn.
- **Defense has no opportunity signal.** There are no touches to count. Snap share is the
  input that would fix it, it is already harvested, and it is the next phase — see
  `docs/ROADMAP.md`.
- **Projections still overstate stability at the very top.** 60% of 90+ players are projected
  to decline; 86% actually do. Cohort curves condition on "stayed in college", so the players
  who leave for the NFL are missing from exactly the top of the distribution.
- **We hold one season of EA data.** Nothing EA-based can be backtested until CFB 28 exists.
  That constraint, not preference, is why usage comes before every EA idea.
- **Pre-2016 defensive ratings** remain recruiting-caliber estimates: no hurries or pass
  breakups exist before 2015.
