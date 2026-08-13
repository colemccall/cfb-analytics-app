// methods.js — the registry behind methods.html.
//
// This page publishes how every number on the platform is computed, what is
// wrong with it, and what we could do instead. It exists because the reasoning
// was previously only in the code and in four markdown files, which meant the
// site asserted numbers it never justified.
//
// It is deliberately technical and deliberately long. There is one reader, and
// the point is that a claim here can be checked rather than believed.
//
// Entry contract — a superset of findings.js, so the two can still converge:
//   id           registry key + anchor
//   group        which section it renders under
//   title        heading
//   summary      one paragraph: what this number is
//   inputs       [{ name, source, coverage }] — what goes in, and from where
//   formula      code block, as the code actually computes it (not as intended)
//   reality      optional — what the code does when it differs from the formula
//   why          the reasoning: why this shape and not another
//   evidence     [{ label, value }] measured facts, with numbers
//   limits       what this number cannot support, stated plainly
//   alternatives [{ label, basis, status, note }] — status drives the chip
//   changelog    [{ version, change }] — what moved and when
//   source       where to read more
//
// Everything here is mirrored in the pipeline's docs/: FORMULAS.md,
// ALTERNATIVES.md, HOW_PROJECTIONS_WORK.md, RESEARCH_METHODS.md. When those
// change, change this.
//
// Rating version v4.3 (Aug 2026). What moved:
//   · the OL player rating was withdrawn and replaced by a line-UNIT rating
//   · defence got a solo/assist split, fumble recoveries, and an opportunity
//     denominator; havoc share was built, failed its ablation, and is published
//     without being scored
//   · small-sample rate features are shrunk toward the position mean
//   · recruiting ROI is residualized, so it stops measuring recruiting
//   · the coaching event study exists, because /coaches was never blocked

const METHOD_GROUPS = [
  { id: "ratings",     label: "Player ratings" },
  { id: "projections", label: "Projections" },
  { id: "team",        label: "Team ratings" },
  { id: "research",    label: "Research findings" },
  { id: "data",        label: "What data exists" },
];

const STATUS_LABEL = {
  recommended: "Recommended",
  experiment:  "Worth an experiment",
  rejected:    "Rejected",
  blocked:     "Blocked on data",
  shipped:     "Shipped",
  withdrawn:   "Withdrawn",
};

const METHODS = [
  // ── Player ratings ────────────────────────────────────────────────────────
  {
    id: "edge-core",
    group: "ratings",
    title: "The EDGE score, and why anchors are absolute",
    summary: `Every rated position runs the same two stages: a per-game box-score composite
      multiplied by an opponent adjustment, summed across the season and divided by the square
      root of games played; then a fixed piecewise-linear map from that score to a 30–99 rating.
      The anchors are frozen. If nobody reaches the top anchor in a season, nobody gets a 99 —
      which is what makes a 2012 rating comparable to a 2025 one.`,
    inputs: [
      { name: "Per-game box scores", source: "/games/players via data/raw/stats.json", coverage: "2008–2026" },
      { name: "Opponent SP+ (offense and defense split)", source: "/ratings/sp", coverage: "2008–2026" },
      { name: "Games played", source: "derived from game rows", coverage: "2008–2026" },
    ],
    formula: `per game:  stat_composite × opponent_multiplier      opponent_multiplier ∈ [0.55, 1.45]
season:    Σ(per-game) / √(games_played)          = edge_score
rating:    edge_score → OVR via fixed position anchors (per era bucket)`,
    why: `Two decisions do most of the work here.

√games rather than ÷games: a player who dominated four games has shown something a full-season
average would erase, but he has not shown as much as someone who did it for twelve. The square
root sits between "total" and "per game" and is the standard way to say that.

Absolute anchors rather than percentiles of the season: percentile scaling guarantees somebody
rates 99 every year regardless of whether anyone deserved it, and destroys cross-era
comparability. This is the single most important structural decision in the ratings and it is
the one most often proposed to be reversed.`,
    evidence: [
      { label: "Era buckets", value: "modern 2018+, transition 2013–17, classic 2008–12" },
      { label: "Classic-era defensive thresholds", value: "75% of modern (no hurries or PBUs before 2015)" },
      { label: "Raw EDGE is not cross-position comparable", value: "QB ≈ 1,600 vs CB ≈ 20 — boards show percentile within position" },
      { label: "External check, added v4.3", value: "drafted players average a peak rating of 82.8 against 62.8 for undrafted — a 20-point gap over 42,453 players" },
    ],
    limits: `Box-score production is the only per-player signal college football publishes, so
      everything a box score cannot see is invisible here: blocking, route running, gap
      discipline, communication. The opponent adjustment is schedule quality, not matchup
      quality — it knows a corner faced Ohio State, not that he was on the field for the
      touchdown.`,
    alternatives: [
      { label: "Pool-relative scaling (percentile of the season)", basis: "Would guarantee a 99 every year",
        status: "rejected", note: "Destroys cross-era comparability. This is the decision the anchor design exists to prevent." },
    ],
    source: "docs/FORMULAS.md §0–1",
  },

  {
    id: "ol",
    group: "ratings",
    title: "Offensive line — the player rating is withdrawn",
    summary: `There is no individual offensive-line data anywhere in the API: no pancakes, no
      sacks allowed per player, no pressures allowed. The rating that used to appear here was
      computed correctly from inputs that did not exist — two of its five terms read keys that
      were never written into the payload it read them from. What actually shipped was a
      recruiting rank plus a constant. It is gone. In its place is a rating of the LINE, from
      five standard metrics that do exist.`,
    inputs: [
      { name: "lineYards, stuffRate, powerSuccess, secondLevelYards", source: "/stats/season/advanced", coverage: "2008–2025, all 2,295 FBS team-seasons" },
      { name: "Sacks allowed per dropback", source: "/stats/season `sacksOpponent`", coverage: "2016–2025" },
    ],
    formula: `WITHDRAWN (v4.3):
  composite_OL = 0.30·N(team_rush_ypa) + 0.25·N(team_sack_rate_inv)
               + 0.30·N(recruit_composite) + 0.10·N(experience) + 0.05·N(award_tier)

REPLACED BY a unit rating, attached to the team-season:
  composite = 0.30·N(line_yards)     + 0.25·N(sack_rate_allowed, inverted)
            + 0.20·N(stuff_rate, inverted) + 0.15·N(power_success)
            + 0.10·N(second_level_yards)
  rating    = interp(composite, [(0,30) (0.15,42) (0.30,52) (0.45,62)
                                 (0.55,70) (0.70,80) (0.85,89) (1.00,95)])

Bounds are per ERA (classic 2008–13, transition 2014–20, modern 2021+).
Missing inputs renormalise the remaining weights — never contribute a zero.`,
    reality: `Why the old one had to go. team_rush_ypa and team_sack_rate are absent from every
OL payload, so:
  N(team_rush_ypa)      = clip((0 − 3)/3)      = 0      → contributed nothing, ever
  N(team_sack_rate_inv) = clip((1 − 0.5)/0.48) = 1.0    → a flat 0.25 for every lineman

live formula = 0.25 + 0.30·N(recruiting) + 0.10·N(experience) + 0.05·N(award)
max attainable = 0.65 → exactly the 88 anchor. The "88 cap" was arithmetic, not policy.`,
    why: `Withdrawing a number is a real cost — a lineman's page now has a blank where his
teammates have a rating — so it needs to be worth it. Three measurements say it was.

The old rating correlated 0.877 with the recruiting composite, when every other position sits
under 9%. Twenty percent of rated linemen landed on exactly 80.0, because the only varying term
saturated. And its rank agreement with EA CFB 27 was NEGATIVE: −0.274, meaning it ordered
linemen slightly worse than random against an independent scouting opinion.

The replacement is not a smaller version of the same claim. It is a different claim, at the
level the data supports: this is how well the line blocked, not which lineman was good.
Allocating it back to individuals by snaps was considered and rejected — that would invent
per-player variance that does not exist and would look exactly like a measurement.

The era bucketing is a fix for a bug this rating shipped with for one run. Pooling all eighteen
seasons produced a median line rating of 52 in 2008 rising to 77 in 2023, which is not
improvement — median line yards jump from 2.885 to 3.095 between 2020 and 2021 and stuff rate
drops from 0.199 to 0.165 in the same step. That is a provider changing a formula, not 130
teams simultaneously learning to block.`,
    evidence: [
      { label: "OL payloads containing team_rush_ypa", value: "0 of 280 (2025)" },
      { label: "Old rating's correlation with recruiting", value: "r = 0.877 — every other position is under 9%" },
      { label: "Rated linemen landing on exactly 80.0", value: "59 of 293 (20%)" },
      { label: "Old rating's agreement with EA CFB 27", value: "−0.274 — negative" },
      { label: "Linemen rated at all, before", value: "280 of 2,952 (9%) — only those who happened to record a tackle" },
      { label: "New: line rating vs linemen drafted", value: "+0.179 Spearman; mean rating 65.2 with none drafted, 70.8 with one, 77.1 with two" },
      { label: "Era drift, before and after bucketing", value: "median 52 (2008) → 77 (2023) pooled; 61–73 with no trend after" },
      { label: "Coverage", value: "2,295 team-seasons, every FBS team 2008–2025" },
    ],
    limits: `This is a team number and must never be read as a player one — that confusion is
      exactly what withdrawing the player rating was meant to end. It also cannot separate the
      line from what happens around it: a sack is a quarterback holding the ball as often as it
      is a lineman losing a rep, and line yards depend on the back. Pass protection is 25% of
      the composite and only exists from 2016. An unplayed season gets no line rating at all,
      because these are measurements of games that have not happened.`,
    alternatives: [
      { label: "Line-unit rating from advanced stats", basis: "lineYards, stuffRate, powerSuccess, secondLevelYards, sack rate allowed",
        status: "shipped", note: "v4.3. Validated against draft outcomes at +0.179, replacing a rating that scored −0.274 against EA." },
      { label: "Draft outcome as external validation", basis: "/draft/picks, 4,010 players matched at 83.7%",
        status: "shipped", note: "v4.3. Not a rating — the only independent check on OL that will ever exist." },
      { label: "EA blocking composite, 2026 only, labelled", basis: "1,278 of 1,534 linemen matched; passBlock vs runBlock correlate 0.53",
        status: "experiment", note: "One season, not backfillable, cannot be backtested by construction. EA's OL overalls are exported alongside as a cross-check column." },
      { label: "Allocate the unit rating to players by snaps or starts", basis: "unit × share",
        status: "rejected", note: "Invents per-player variance that does not exist." },
      { label: "Keep one OL overall with the team stats joined properly", basis: "team_season_stats.json",
        status: "rejected", note: "It would still be unit quality × recruiting wearing a player's name." },
      { label: "Individual blocking grades", basis: "—",
        status: "blocked", note: "No pancakes, sacks allowed or pressures allowed exist anywhere in the API. Verified by full key scan." },
    ],
    changelog: [
      { version: "v4.3", change: "Player rating withdrawn; line-unit rating shipped; era-bucketed bounds after a 25-point drift was found in the first run." },
      { version: "v4.2", change: "Recalibrated against EA; the collapse was documented but the rating still shipped." },
    ],
    source: "docs/FORMULAS.md §2 · docs/ALTERNATIVES.md §A · utils/line_unit.py",
  },

  {
    id: "defense",
    group: "ratings",
    title: "Defense — giving a tackle a denominator",
    summary: `Every defensive position is a hand-weighted sum of box-score counters, and the
      biggest of them, tackles, is close to the opposite of a quality measure: it is driven by
      snaps played, by how often the opponent runs at you, and by how long your defence is on
      the field. A defence that gets off the field denies its own players the statistic we
      reward them for. v4.3 attacks that from three directions and rejects a fourth.`,
    inputs: [
      { name: "defensiveTOT / SOLO / TFL / SACKS / PD / QB HUR", source: "data/raw/stats.json", coverage: "SOLO from 2013; hurries and PBUs from 2015" },
      { name: "fumblesREC", source: "data/raw/stats.json", coverage: "8,495 nonzero defensive game rows" },
      { name: "Defensive plays faced", source: "/stats/season/advanced `defense.plays`", coverage: "2008–2025" },
      { name: "Unit havoc, front seven vs DB", source: "/stats/season/advanced `defense.havoc`", coverage: "2008–2025" },
    ],
    formula: `tackle credit  = (SOLO × 1.25 + ASSISTED × 0.65) × position_weight     [2013+]
                 = TOT × position_weight                              [pre-2013]

composite      = tackle_credit + sacks·w + TFL·w + hurries·w + PBU·w
                 + INT·w + fumble_recoveries·w
                 all × opportunity_index

opportunity_index = clip(median_plays_per_game / this_defence's, 0.85, 1.20)

CB:  coverage = INT×4.0 + PBU×2.0        LB:  tackling = TOT×0.5 + TFL×2.0
     instinct = shrunk_rate(INT+PBU, TOT)     instinct = shrunk_rate(INT+PBU+TFL, TOT)

shrunk_rate(events, tackles) = (events + 12·position_prior) / (tackles + 12)`,
    why: `**Solo versus assisted.** A solo tackle is a play the defender made; an assist is a
play he was near. The multipliers are calibrated to be near-neutral in aggregate — solo tackles
are 56.4% of all recorded tackles, so 0.564 × 1.25 + 0.436 × 0.65 = 0.988 and the average
defender's credit does not move, only the mix. The split cannot be applied before 2013 because
defensiveSOLO does not exist there; the code asks the data rather than hardcoding a year, so a
season that stops publishing it degrades to plain totals instead of silently reading every
tackle as an assist.

**Fumble recoveries, and a trap.** A recovery is a takeaway and was simply not counted. But
\`fumblesFUM\` is NOT the forced fumble it looks like — on a defensive row it is a fumble the
player COMMITTED. Only 974 defensive game rows carry one, 84% of them in a game where the player
also had a return, an interception or a recovery, and 455 of the 974 also carry \`fumblesLOST\`.
Crediting it would have paid a corner for coughing up an interception return. Forced fumbles are
not published per player anywhere.

**The opportunity denominator.** Counting stats accrued against fewer plays represent more per
snap. It is deliberately a gentle clipped correction rather than a straight rate: dividing
outright would make snaps-faced the dominant term, and plays faced is not purely a defensive
virtue — a fast-tempo offence puts its own defence back on the field.

**Small-sample shrinkage.** \`instinct = (INT + PBU) / max(TOT, 1)\` gave a player with one
tackle and one breakup a perfect 1.0. Thirty percent of rated defenders have five or fewer
tackles, so this was not an edge case: 5,848 player-seasons posted a ratio of 1.0 or better
against a normalisation ceiling of 0.3, which means the feature was a constant for most of the
pool rather than a measurement.`,
    evidence: [
      { label: "Correlation of tackles with final OVR", value: "0.70–0.82 at every position before v4.3" },
      { label: "Solo split, aggregate neutrality", value: "0.564 × 1.25 + 0.436 × 0.65 = 0.988" },
      { label: "Solo coverage", value: "80.6% of tackle rows from 2013; zero before it. 8,359 of 8,590 games have some players with solos and some without, so a zero means 'all assisted', not 'not recorded'." },
      { label: "fumblesFUM is not forced fumbles", value: "974 rows, 84% in games where the player also had a return/INT/recovery, 455 also carrying fumblesLOST" },
      { label: "Shrinkage, CB instinct before → after", value: "p90 2.000 → 0.315, p99 5.000 → 0.546, max 11.0 → 1.01" },
      { label: "Players who had a 'perfect' ratio", value: "5,848 player-seasons at 1.0 or above, against a ceiling of 0.3" },
      { label: "Opportunity index: real vs placebo", value: "+0.0085 mean Spearman gain vs EA; the same values shuffled across teams score −0.0025 — below doing nothing" },
      { label: "Net effect on EA agreement, 2025", value: "EDGE 0.570→0.582, DL 0.477→0.485, LB 0.638→0.640, CB 0.565→0.571, DB 0.590→0.613, S 0.722→0.720" },
    ],
    limits: `Even with a denominator, a tackle count is still mostly opportunity, and none of
      this reaches the things that would actually settle it. Missed tackles are not published
      anywhere. Per-play tackle attribution does not exist — /plays/stats defines a Tackle type
      and returns zero records of it across 2014, 2019 and 2024. Coverage snaps and targets
      allowed do not exist; Target is attributed to the receiver and only on incompletions. The
      corner rating is therefore bounded no matter what we do, and coverage denial is a team
      proxy standing in for an individual measurement.`,
    alternatives: [
      { label: "Split solo from assisted tackles", basis: "defensiveSOLO, on disk, 2013+",
        status: "shipped", note: "v4.3. Calibrated to be aggregate-neutral so it re-weights rather than inflates." },
      { label: "Credit fumble recoveries", basis: "fumblesREC",
        status: "shipped", note: "v4.3. fumblesFUM deliberately excluded — it is a fumble the defender committed." },
      { label: "Opportunity denominator (defensive plays faced)", basis: "/stats/season/advanced defense.plays, 2008+",
        status: "shipped", note: "v4.3. Passes the placebo test: shuffled values score below not doing it at all." },
      { label: "Shrink small-sample rate features", basis: "12 pseudo-tackles at the position's pooled rate",
        status: "shipped", note: "v4.3. Bounds re-derived afterwards; the old ones had stopped discriminating." },
      { label: "Havoc share — player disruption ÷ unit havoc", basis: "havoc.frontSeven / havoc.db",
        status: "rejected", note: "Built, measured, and rejected on its own evidence. Replacing each unit's havoc with one shared constant scored BETTER (+0.0019) than the real denominator (+0.0011), which means the credit was re-weighting tackles for loss and passes defensed — stats the composite already counts — not measuring share of a unit. It is computed and published as a descriptive field, and scored at zero." },
      { label: "Leverage-weight sacks, INTs and PBUs by game situation", basis: "/plays/stats carries down, distance, field position and score per event",
        status: "experiment", note: "Needs a ~2,450-call harvest. Earn it first." },
      { label: "Per-snap rates", basis: "snap_pct — zero before 2013, ~2,500 players/yr after",
        status: "experiment", note: "The next phase. Needs an explicit 'unknown' branch, never a zero." },
      { label: "Missed tackles, coverage snaps, targets allowed", basis: "—",
        status: "blocked", note: "None exist. Verified across three eras." },
    ],
    changelog: [
      { version: "v4.3", change: "Solo/assist split, fumble recoveries, opportunity denominator, rate shrinkage. Havoc share built and rejected." },
      { version: "v4.2", change: "Coverage denial measured against the offence actually faced; secondary archetypes." },
    ],
    source: "docs/FORMULAS.md §3 · docs/ALTERNATIVES.md §B",
  },

  {
    id: "secondary",
    group: "ratings",
    title: "The secondary — the overall is the three archetypes",
    summary: `A defensive back's rating is literally the three sub-scores printed beside it,
      weighted by position. That costs a little accuracy against EA and buys a number that
      explains itself. Coverage denial is credited additively, because the multiplicative
      context modifier that preceded it could not survive the suppression it was correcting.`,
    inputs: [
      { name: "INT, PBU, defensive TD, fumble recoveries", source: "box scores", coverage: "PBU from 2015" },
      { name: "Team pass-denial credit", source: "derived: shortfall vs each offence's own season rate", coverage: "2008–2025" },
      { name: "Playing-time rank within the secondary", source: "derived from tackle volume", coverage: "2008–2025" },
    ],
    formula: `ball_hawk   = INT×12.0 + PBU×3.5 + defTD×8.0 + fumble_rec×6.0
run_support = tackle_credit(0.6) + TFL×4.0 + sacks×6.0 + hurries×1.5
coverage    = playing-time share × team pass-denial credit   (no box-score input)

CB 0.40 coverage / 0.40 ball hawk / 0.20 run support
S  0.20 / 0.30 / 0.50          DB 0.33 / 0.33 / 0.33

ARCHETYPE_SCALE = { ball_hawk 13.4, coverage 8.5, run_support 14.8 }`,
    why: `A shutdown corner's counting stats are low BECAUSE he covers — quarterbacks throw
elsewhere. The context modifier that preceded this knew which defences were good but multiplied,
and 1.1 × a suppressed composite is still suppressed. Credit has to be additive to survive the
suppression it is correcting.

Making the overall equal the three archetypes costs about 0.005 Spearman against EA versus a
flat composite. That was bought deliberately: the number on the card equals the bars beneath it,
so a lockdown corner is not read as a failed ball hawk.

ARCHETYPE_SCALE puts the three on one 0–10 axis and must be re-measured whenever their inputs
change. It was re-measured for v4.3 after fumble recoveries entered ball hawk: 12.9 → 13.4.
Stale constants once left coverage capped at 7.1 while run support reached 20, so coverage could
not win a comparison it was designed to be able to win.`,
    evidence: [
      { label: "Cost of the archetype split vs a flat composite", value: "Spearman vs EA 0.660 → 0.655 (2025); accepted deliberately" },
      { label: "Coverage credit, tuned", value: "none 0.6386 → ×4 peak 0.6576; placebo crediting random defences 0.6293 — below crediting nobody" },
      { label: "Denial measured against the offence faced", value: "2025 .6507→.6588, 2024 .5357→.5421, 2023 .2756→.2818" },
      { label: "ARCHETYPE_SCALE re-measured for v4.3", value: "ball hawk 12.9 → 13.4 after fumble recoveries; run support unmoved at 14.8, confirming the tackle changes were aggregate-neutral" },
      { label: "Generic 'DB' in the source data", value: "1,397 of 2,889 secondary players (48%) — upstream, not our parsing" },
    ],
    limits: `Coverage is the one archetype with no box-score input at all — it is playing time
      multiplied by a team-level denial signal, which means two corners on the same defence with
      the same playing time get the same coverage score. There is no defender-side coverage data
      to do better with. And 48% of the secondary is labelled only "DB" by the source, so nearly
      half of these players get the even-thirds weighting rather than the one their actual job
      deserves.`,
    alternatives: [
      { label: "Group CB/S/DB behind one filter, keep three badges", basis: "UI only",
        status: "shipped", note: "v4.3. CONFIG.POSITIONS omitted DB entirely, so 1,397 players were invisible to every position filter — a live bug, not a grouping preference." },
      { label: "Resolve generic DB → CB/S using EA position", basis: "matched players only",
        status: "experiment", note: "Exact where it applies, but 2026 only." },
      { label: "Infer CB vs S from box-score behaviour", basis: "high INT+PBU, low tackles ⇒ corner",
        status: "rejected", note: "Circular — it assigns the archetype using the statistics the archetype then judges." },
    ],
    source: "docs/FORMULAS.md §3",
  },

  {
    id: "specialists",
    group: "ratings",
    title: "Kickers and punters",
    summary: `Specialists occupy a narrow band by design — their impact range is genuinely
      smaller than a skill player's. v4.2 pulled them down hard after a punter outranked the
      receivers on his own team page. v4.3 finally fixed the gate that had been crying wolf
      about it ever since.`,
    formula: `K   0.50 fg_pct + 0.25 fg_long + 0.15 xp_pct + 0.10 volume
P   0.55 avg_yards + 0.30 inside_20_pct + 0.15 volume     → ceiling 90`,
    why: `The distribution gate for K and P was inherited from the pre-v4.2 distribution it was
supposed to judge — mean 55–70, p90 65–79. v4.2 deliberately pulled specialists down, so the gate
warned on every single run, which is the same as not having a gate at all.

It was deliberately NOT fixed in the same change that shipped the ratings it judges; that is how
goalposts move. v4.3 is that separate change. The new bounds are derived from the stated design —
a specialist's band is narrower than a skill player's and the ceiling is ~88–90 — and the old
failure still fails: 24% of punters at 85+ puts p90 near 88, well outside the new ceiling of 82.`,
    evidence: [
      { label: "Before v4.2", value: "17 kickers and 38 punters at 85+, against EA's 5 and 1" },
      { label: "After", value: "4 and 2" },
      { label: "Old gate", value: "mean 55–70, p90 65–79, p99 70–79 — warned on every run" },
      { label: "New gate", value: "mean 46–64, p90 70–82, p99 78–90. 2025 K: mean 51.1, p90 74.6, p99 85.2 — passes" },
    ],
    limits: `Field goal percentage is heavily confounded by attempt distance and by which kicks
      a coach chooses to attempt, and we have neither. A kicker on a bad team attempts longer
      field goals and rates worse for it.`,
    alternatives: [
      { label: "Re-derive the K/P distribution bounds from the intended design", basis: "nothing new",
        status: "shipped", note: "v4.3, as its own change rather than alongside the ratings they judge." },
      { label: "Weight field goals by attempt distance", basis: "/plays or per-kick data",
        status: "experiment", note: "The real fix for the biggest confound. Needs a play-level harvest." },
    ],
    source: "docs/FORMULAS.md §5",
  },

  // ── Projections ───────────────────────────────────────────────────────────
  {
    id: "projection",
    group: "projections",
    title: "How a projection is built, and what MAE means",
    summary: `Five stages: a career becomes a curve of percentiles, the curve becomes ~30 shape
      numbers, a cohort baseline says what similar players did next, a model predicts, and its
      spread is stretched halfway back toward reality. MAE — mean absolute error — is the average
      miss with the signs dropped. Ours is 8.22 for offence. The only number that makes that
      meaningful is the dumb baseline: assuming every player repeats last season scores 9.10.
      The model is worth about one rating point over guessing "no change".`,
    inputs: [
      { name: "Career EDGE percentile path", source: "computed from ratings history", coverage: "2008–2025" },
      { name: "Cohort development curves", source: "position × class year × production decile", coverage: "2008–2022 training window" },
      { name: "NFL departure rate per cohort", source: "/draft/picks, 4,010 players matched", coverage: "2008–2026" },
      { name: "Opportunity features (offensive skill only)", source: "depth chart, vacated production", coverage: "2014+" },
    ],
    formula: `1  career curve    each season → percentile within its own (season, position)
2  shape features  ~30 numbers, computed twice: raw path, and healthy seasons only
3  cohort baseline what players at the same position/class/decile actually did next
4  model           XGBoost → next OVR, then  mu + k·(pred − mu),  k = 1 + 0.5·(real_sd/pred_sd − 1)
5  interval        10th/90th percentile of validation residuals, bucketed by predicted OVR`,
    why: `**What MAE is, plainly.** Take every prediction, subtract what actually happened, drop
the minus signs, average them. "MAE 8.22" means the typical projection misses by about eight
rating points. That number is meaningless on its own — it is only informative against a dumb
baseline, and assuming every player simply repeats last season scores 9.10. So the model is
worth about one point over guessing "no change". Say that out loud, because 8.22 looks precise
and ±8 OVR is not.

**Why the spread is stretched.** A model trained to minimise error naturally under-predicts
extremes — it hedges toward the mean, because hedging is how you minimise average error. That
makes the projected distribution too narrow: it was 70–78% of the real spread. VARIANCE_LAMBDA
= 0.5 stretches it halfway back. Halfway rather than all the way is a deliberate compromise:
going further would calibrate the distribution and make the point estimates worse.

**Survivorship, now measured.** The cohort curves are built only from players who had a next
season, which silently means players who did not leave for the NFL. v4.3 measures that with
draft data and feeds it as a feature: 22.1% of top-production-decile players depart, against
0.7% in the bottom half. It does not improve MAE — 8.19 to 8.22 on offence, 8.45 to 8.44 on
defence, both inside the noise — but it replaces a disclosed limitation with a measured one, and
it lets the model see how selected its own training population is.`,
    evidence: [
      { label: "Offence", value: "naive 9.10 → model 8.22, interval coverage 80.5%, spread 77% of reality" },
      { label: "Defence", value: "naive 9.62 → model 8.44, coverage 79.4%, spread 70%" },
      { label: "NFL departure by production decile", value: "22.1% in the top decile against 0.7% in the bottom half; 3.8% overall" },
      { label: "Departure feature's effect on accuracy", value: "MAE 8.19 → 8.22 offence, 8.45 → 8.44 defence — no improvement, kept for honesty about survivorship" },
      { label: "Consequence of half-stretching the spread", value: "decline is under-called at every level — 66% projected to decline at 90+, against 81% historically" },
      { label: "Interrupted careers are treated more generously, not less", value: "mean projected change +6.06 vs +3.55 for clean careers" },
      { label: "OL", value: "not projected at all — 2,902 rows carry EA's opinion and no rating of ours" },
    ],
    limits: `The model does not know who a player played FOR, that he transferred, or where he
      transferred to. It knows who he played AGAINST, because EDGE is opponent-adjusted per game.
      Projections overstate stability at the very top: 60% of 90+ players are projected to
      decline and 86% actually do. Defensive projections ship marked low confidence and that
      label is doing real work.`,
    alternatives: [
      { label: "Model NFL departure explicitly", basis: "/draft/picks, 2008–2026, 83.7% id match",
        status: "shipped", note: "v4.3. Measured at last: 22.1% of top-decile players leave. Does not improve MAE; kept because a disclosed limitation with a number beside it is a different thing from one without." },
      { label: "Feed the raw-minus-healthy acceleration gap explicitly", basis: "the gap is the interruption signal",
        status: "experiment", note: "Would target the Jaden Mickey case directly." },
      { label: "Replace direction-blind consistency with a monotonicity measure", basis: "a steady climber currently scores as volatile as an oscillator",
        status: "experiment" },
      { label: "Career-context features: own-program strength, transfer flag, destination minus origin", basis: "/ratings/* and transfers.json",
        status: "experiment", note: "The model currently has no idea who a player played for, or that he moved." },
      { label: "Raise VARIANCE_LAMBDA toward 1.0", basis: "would match the real spread",
        status: "experiment", note: "A genuine trade: calibration improves, MAE worsens, intervals need re-deriving." },
    ],
    source: "docs/HOW_PROJECTIONS_WORK.md",
  },

  {
    id: "mickey",
    group: "projections",
    title: "Worked example — why an 85 senior projects to 74",
    summary: `Jaden Mickey played three seasons at Notre Dame and one at Boise State, where he
      posted a career year at the 93rd percentile. The model projects him down. The reason is
      arithmetic, not judgement, and it is the clearest illustration of what the engine can and
      cannot see.`,
    formula: `percentile path   10.3 → 58.2 → 15.6* → 92.8        (* 3 games — interrupted)

raw acceleration       changes +47.9, −42.6, +77.2  →  ≈ +120
healthy-only           changes +47.9, +34.6         →  ≈ −13

drivers   pct_accel −3.65 · ovr +2.34 · cohort_next +1.66 · n_seasons +0.97`,
    why: `Acceleration is a second difference, so a single missing season poisons it twice. The
2024 injury digs a false trough; climbing out of it registers as a violent spike; and the model
has learned, correctly in general, that spikes regress.

Script 15 already flags interrupted seasons and computes every shape feature twice — raw and
healthy-only — precisely so the model can learn which to trust. Both are fed rather than the
healthy one replacing the raw one, because the GAP between them is itself the signal. For Mickey
that gap is enormous (+120 against −13) and the model still leans on the raw path.

This has not been fixed, deliberately. There are two problems pulling in opposite directions:
this individual artifact, and a systemic one where the predicted spread is compressed to 70–77%
of reality so decline is under-called everywhere. Anything that makes Mickey look better by
making the engine more optimistic makes the larger problem worse.`,
    evidence: [
      { label: "The missed season digs a false trough", value: "climbing out of it registers as a spike, and the model has learned that spikes regress" },
      { label: "How rare his interval is", value: "0.6% of all projections rule out repeating last season; 29.6% of players at 90+ do" },
      { label: "What the model does not know", value: "that he transferred, who he played for, or that Boise State is where he broke out" },
      { label: "What it does know", value: "who he played against — EDGE is opponent-adjusted per game, so the 92.8 is not schedule inflation" },
      { label: "He is a tail case, not the rule", value: "interrupted careers average +6.06 projected change against +3.55 for clean ones" },
    ],
    limits: `One player is an anecdote. The reason this one is published is that it is a clean
      illustration of a mechanism, not evidence that the engine is biased against injured
      players — measured across all 658 interrupted careers, it is measurably generous to them.`,
    alternatives: [],
    source: "docs/HOW_PROJECTIONS_WORK.md",
  },

  // ── Team ratings ──────────────────────────────────────────────────────────
  {
    id: "team-ratings",
    group: "team",
    title: "Team ratings",
    summary: `Three signals blended, renormalised when one is absent — which is how a season
      with neither SP+ nor team stats still produces a rating. v4.3 made that renormalisation
      universal, because the OL withdrawal exposed a trap in it.`,
    formula: `team_rating = 0.50 SP+ + 0.30 our player ratings + 0.20 team stats

pass_off = 0.45 avg_top(QB,2) + 0.35 avg_top(WR+TE,5) + 0.20 line_unit
run_off  = 0.40 avg_top(RB,3) + 0.40 line_unit + 0.10 QB + 0.10 WR/TE

Every term renormalises out when absent. avg_top() returns None, never 50.`,
    why: `\`avg_top()\` used to return a hard-coded 50.0 for a position with nobody rated. That
was a trap rather than a default: an empty position became an average position. With OL
withdrawn it would have made 40% of every team's run offence an identical constant — the
rating would have silently stopped varying with the thing it claimed to measure.

So avg_top returns None and the weights renormalise across whatever is present. That rule now
applies to every position, not just OL: a team with no rated kicker no longer gets a fabricated
50 for special teams either. And the OL term is not simply deleted — it is replaced by the
line-unit rating, which is a more honest input than the average of five recruiting ranks ever
was.`,
    evidence: [
      { label: "The trap", value: "avg_top() returned a hard-coded 50.0 when a position had no rated players" },
      { label: "Why it mattered", value: "OL is 40% of run offence — withdrawing OL ratings without renormalising makes 40% of every team's run offence an identical constant" },
      { label: "Line ratings computed", value: "2,295 team-seasons, 2008–2025, median 61–73 per season with no era trend" },
      { label: "Unplayed seasons", value: "no line rating at all — the metrics measure games that have not happened, so the term renormalises out" },
    ],
    limits: `SP+ is half the rating and is itself a model we did not build. The roster component
      is only as good as the player ratings feeding it, which means it is weakest exactly where
      the player ratings are — the defensive front seven and, until v4.3, the offensive line.`,
    alternatives: [
      { label: "Substitute the line-unit rating for the OL term", basis: "/stats/season/advanced",
        status: "shipped", note: "v4.3. More honest than averaging five recruiting ranks." },
      { label: "Renormalise instead of defaulting to 50", basis: "nothing new",
        status: "shipped", note: "v4.3, and now universal rather than an OL special case." },
    ],
    source: "docs/FORMULAS.md §6",
  },

  // ── Research ──────────────────────────────────────────────────────────────
  {
    id: "research-team-performance",
    group: "research",
    title: "Who beats the roster they recruited",
    summary: `A two-variable least-squares fit of SP+ on recruiting talent and conference tier;
      the residual is what the page calls beating your recruiting. The residual is real and
      durable — but durable is not the same as coaching, and v4.3 finally tests that directly.`,
    formula: `SP+ ≈ β₁·talent + β₂·is_p5 + c        R² = 0.474,  residual SD = 9.91
performance_residual = actual SP+ − predicted SP+

Each residual is then shrunk toward the population mean with n = 1, and ships
with an 80% interval — one season of SP+ is one noisy observation.`,
    why: `The residual persists year over year at r = 0.607, which proves it is real and proves
nothing about what causes it. Scheme, development pipelines, portal usage and systematic error
in the talent proxy are all persistent by team too.

The decisive test is a coaching-change event study, and it was recorded as blocked for months
because the local coaching table held 20 hand-seeded rows. It was never blocked — /coaches
carries full tenure back to 2008 and nobody had asked. That is now its own finding.`,
    evidence: [
      { label: "Year-over-year persistence", value: "r = 0.607 at t+1, 0.280 at t+3 — so not noise" },
      { label: "But persistence does not identify coaching", value: "scheme, development pipelines, portal usage and systematic error in the talent proxy are all persistent by team" },
      { label: "Residual SD", value: "9.91 SP+ points over 2,310 team-seasons — the top of a single-season ranking is substantially noise" },
      { label: "Previously blocked", value: "the coaching table was 20 seeded rows" },
      { label: "No longer blocked", value: "/coaches covers 2008–2026 with 2,584 coach-seasons, matching our schools at 100%" },
    ],
    limits: `SP+ already contains the result, so this measures over-performance, not its cause.
      With a residual SD of 9.9 points, the difference between rank 1 and rank 20 in a single
      season is mostly noise — which is why every row now ships with an interval.`,
    alternatives: [
      { label: "Coaching-change event study", basis: "/coaches", status: "shipped", note: "v4.3 — see the next entry." },
      { label: "Empirical-Bayes shrinkage plus a displayed interval", basis: "utils/shrinkage.py",
        status: "shipped", note: "v4.3, applied to every ranked finding." },
      { label: "Add returning production and prior-year SP+ as covariates", basis: "/player/returning, confirmed 2016+, now harvested",
        status: "experiment", note: "Separates 'beat your talent' from 'beat your talent this year, with an experienced roster'." },
    ],
    source: "docs/RESEARCH_METHODS.md §1",
  },

  {
    id: "research-coaching",
    group: "research",
    title: "Does the coach move the needle, or the program?",
    summary: `The test the finding above has needed since it shipped. If beating your recruiting
      is coaching, the number should step when the coach changes and travel with him to his next
      job. It does travel — about a third of it.`,
    inputs: [
      { name: "Head coach of record per team-season", source: "/coaches, plurality of games", coverage: "2,584 coach-seasons, 2008–2026" },
      { name: "Performance residual", source: "script 13", coverage: "2,310 team-seasons" },
    ],
    formula: `head coach of record = whoever coached the most games that season
stint                = consecutive seasons, same coach, same school
step                 = mean residual under the new coach − mean under the old
carry-over           = corr(a coach's first stint residual, his second)

Both stints need >= 2 rated seasons.`,
    why: `A coaching change is the closest thing to a natural experiment available. Persistence
tells you the residual is a property of something; only a change tells you of what.

Plurality of games decides the coach of record so a two-game interim does not displace the man
who coached the other ten. A gap in the record breaks a stint, because a coach who returns to a
school after ten years away is two stints and averaging across the gap would blur the very
transition being measured. And the first season on record is never a change, or every team in
2008 gets flagged.`,
    evidence: [
      { label: "Coaching changes measured", value: "303, each with at least two rated seasons on both sides" },
      { label: "Median step", value: "−1.89 SP+ points. Only 40.6% of changes improved the residual at all." },
      { label: "Spread of the steps", value: "SD 9.15, against a residual SD of 9.82 — at the level of one hire this cannot tell you much" },
      { label: "Coach carry-over", value: "r = +0.343 across 101 coaches with two measurable stints at different schools" },
    ],
    limits: `Not a causal estimate for any single hire. Programs fire coaches after bad seasons,
      so the "before" is selected for being low and mean reversion alone predicts improvement —
      which makes the negative median genuinely surprising and a reason for caution, not a proof
      that firing coaches backfires. A new coach also inherits the previous staff's roster for
      two or three years, so his early residual is not really his. Interim coaches who never
      coached a plurality are invisible.`,
    alternatives: [
      { label: "Coordinator-level changes", basis: "/coaches is head coaches only",
        status: "blocked", note: "The seed CSV had OC/DC rows; the API does not." },
      { label: "Control for inherited roster with returning production", basis: "/player/returning, harvested 2014+",
        status: "experiment", note: "Would separate 'the new coach is better' from 'the new coach inherited more'." },
    ],
    source: "docs/RESEARCH_METHODS.md §1 · scripts/13_team_performance_evaluator.py",
  },

  {
    id: "research-recruiting-roi",
    group: "research",
    title: "What recruiting classes actually became",
    summary: `The page claimed hit rate separated programs that recruit well from programs that
      develop well. Measured, it did not — it tracked recruiting. v4.3 residualizes it per
      recruit, which is script 13's trick one level down, and the link to recruiting drops from
      +0.25 to −0.03.`,
    inputs: [
      { name: "247Sports composite per recruit", source: "/recruiting/players", coverage: "64,906 graded recruits" },
      { name: "Peak earned OVR per player", source: "our ratings, engine=edge", coverage: "37,462 recruits who were both graded and rated" },
    ],
    formula: `expected peak OVR = 54.60 × composite + 21.32     (n = 37,462, R² = 0.063)
development       = mean(actual peak − expected peak) over the class's rated recruits

expected hit rate: observed rate within composite bands
  < 0.80  27.9%     0.85–0.89  34.6%     0.93–0.97  51.1%
  0.80–0.85  30.8%  0.89–0.93  39.6%     > 0.97     61.9%

Both shrunk toward the population with a prior worth 25 recruits.`,
    why: `A raw hit rate answers "did this class produce contributors", which is mostly a
question about who signed the best players. Expected peak OVR is therefore fitted per RECRUIT
from his own composite, and the class is scored on the average residual: a program that turns
three-stars into 80s scores well, one that turns five-stars into 80s does not.

Banding rather than a logistic fit for the hit rate, deliberately: the bands are wide enough to
be stable at thousands of recruits each, and a table can be printed and argued with, which a
fitted coefficient cannot.

Shrinkage matters more here than anywhere else on the site. Classes are small, so one player
moves a raw rate by several points, and there are 2,700 of them ranked.`,
    evidence: [
      { label: "The problem, measured", value: "raw hit rate correlates +0.266 with the class's own recruiting composite (+0.328 on the all-recruits denominator)" },
      { label: "Weak third of classes vs strong third", value: "28.8% vs 39.0% hit rate — better classes hit more often" },
      { label: "After residualizing", value: "correlation with class recruiting strength falls from +0.254 to −0.028" },
      { label: "Population hit rate", value: "34.0% of rated recruits reach a peak OVR of 75" },
      { label: "Classes graded", value: "2,700, each with an 80% interval on its development score" },
      { label: "A hypothesis that turned out wrong", value: "I expected weak programs to look better because their recruits play sooner. The data says the opposite." },
    ],
    limits: `"Development" is the residual of a weak model — peak rating on composite explains
      only 6% of the variance between recruits, so most of what is left is the player, not the
      program. Peak OVR ≥ 75 is a threshold, not a truth: a 74 and a 76 are not different
      players. Transfers out still count toward the class that signed them, so this measures the
      board, not the roster. peak_ovr reads the future, so recent classes are censored and
      flagged. And offensive linemen have no rating at all from v4.3, so they are absent from
      every denominator here.`,
    alternatives: [
      { label: "Residualize per recruit, then aggregate", basis: "expected peak OVR from his own composite",
        status: "shipped", note: "v4.3. Decorrelated from recruiting, which was the whole point." },
      { label: "Empirical-Bayes shrinkage with intervals", basis: "utils/shrinkage.py, prior worth 25 recruits",
        status: "shipped", note: "v4.3." },
      { label: "Draft picks per class as an alternative outcome", basis: "/draft/picks, now harvested",
        status: "experiment", note: "An outcome nobody in this pipeline chose, which is its appeal." },
    ],
    source: "docs/RESEARCH_METHODS.md §2",
  },

  {
    id: "research-draft",
    group: "research",
    title: "Do the players we rate highly get drafted?",
    summary: `The first independent, historical, backtestable check these ratings have ever had.
      Eighteen years deep, decided by people spending real money, and made without seeing our
      numbers. It is the answer to the fair objection that EA CFB 27 is one season and therefore
      never a backtest.`,
    inputs: [
      { name: "NFL draft picks with college athlete id", source: "/draft/picks", coverage: "4,858 picks 2008–2026; 4,010 join to our players (83.7%)" },
      { name: "Peak earned OVR per player", source: "our ratings, engine=edge", coverage: "42,453 rated players" },
    ],
    formula: `calibration     P(drafted | peak OVR band)
discrimination  Spearman(peak OVR, −draft position) within each position
gap             mean peak OVR drafted − mean peak OVR undrafted`,
    why: `Every other check on these ratings is either internal (distribution shape) or a
cross-section against a single season of EA. The draft is neither. It is also the only check
available for the line-unit rating, whose entire justification is that no individual measurement
exists — so "does a better-rated line put more linemen in the draft" is the one external
question it can be asked.`,
    evidence: [
      { label: "Drafted vs undrafted", value: "mean peak OVR 82.8 against 62.8 — a 20-point gap" },
      { label: "Calibration is monotone", value: "90+ → 66.4% drafted · 85–89 → 31.3% · 80–84 → 13.5% · 75–79 → 5.2% · 70–74 → 3.9% · under 70 → 1.8%" },
      { label: "Agreement with draft order, offence", value: "QB 0.47 · RB 0.49 · WR 0.42 · TE 0.42" },
      { label: "Agreement with draft order, defence", value: "DB 0.25 · CB 0.24 · S 0.18 · EDGE 0.18 · LB 0.18 · DL 0.13 — markedly weaker, consistent with everything else we know about the defensive ratings" },
      { label: "Line-unit rating vs linemen drafted", value: "+0.179; mean line rating 65.2 with none drafted, 70.8 with one, 77.1 with two" },
    ],
    limits: `The draft is not ground truth. It is another opinion, with its own biases —
      measurables, position scarcity, injury history, the combine — and a receiver we rate 92
      who goes undrafted may be right about the player. Draft position is also heavily
      influenced by things a college box score cannot contain. The defensive numbers being
      weaker than the offensive ones is consistent with a real weakness in our defensive
      ratings, but it is also consistent with the draft being harder to predict on defence.`,
    alternatives: [
      { label: "Validate ratings against NFL draft outcomes", basis: "/draft/picks",
        status: "shipped", note: "v4.3. Backtestable across eighteen seasons, unlike anything EA-based." },
      { label: "Use preDraftGrade rather than draft position", basis: "/draft/picks carries it",
        status: "experiment", note: "Grade is a scouting opinion formed before the draft-day noise of team need and trades." },
    ],
    source: "scripts/validate_vs_draft.py",
  },

  {
    id: "research-gems",
    group: "research",
    title: "Hidden gems — now with a denominator",
    summary: `Filtered to two-star-or-lower recruits rated 70+. It was selection on the outcome
      with no base rate: we showed the 2★ players who succeeded and never said how many there
      were, so a reader could not tell whether the list was remarkable or arithmetic. It now
      ships the base rates beside it.`,
    formula: `rows = players with stars ∈ [1,2] and overall_rating >= 70
base rates = share of ALL recruits at each star level reaching 70+,
             computed over the same season and the same rated population`,
    why: `A long list of successful two-stars proves nothing if two-stars succeed at the same
rate as everyone else. The gap between the rates, not the length of the list, is the finding.
Publishing the list without the denominator was the single most misleading thing on the research
page — and the cheapest to fix.`,
    evidence: [
      { label: "The defect", value: "no base rate shown — if 5% of 2★ and 35% of 5★ recruits reach 70, the list is expected" },
      { label: "Unrated recruits excluded", value: "stars >= 1 drops walk-ons and JUCO arrivals — the most extreme version of the story the finding is about" },
      { label: "Single season", value: "a player who peaked in 2021 is invisible" },
    ],
    limits: `Still selection on the outcome — the base rates make it readable, not causal. Some
      two-star ratings are thin coverage of a player nobody evaluated rather than a scouting
      miss, and there is no way to tell those apart from here.`,
    alternatives: [
      { label: "Express against expectation and show the base rate", basis: "same inputs",
        status: "shipped", note: "v4.3." },
    ],
    source: "docs/RESEARCH_METHODS.md §4",
  },

  {
    id: "research-uncertainty",
    group: "research",
    title: "Every finding is a ranking, and now they carry uncertainty",
    summary: `This was the defect shared by all of them. Rank 2,310 noisy things and the top of
      the list is selected substantially for noise — the team at number one is disproportionately
      likely to be there because it got lucky. One shared helper now shrinks every ranked
      finding toward its population and ships an 80% interval.`,
    formula: `continuous:  w = τ² / (τ² + σ²/n),   value = w·observed + (1−w)·population_mean
proportion:  Beta-binomial with a prior worth 25 trials
interval:    ±1.2816 × posterior SE  (80%, matched to the projection bands)`,
    why: `The weight is the textbook one: how much a team's own number counts depends on how
much genuinely varies between teams (τ) against how noisy one observation is (σ). When a team
has one season of evidence and seasons are noisy, the estimate barely moves off the population
mean — which is the honest statement, not a defect.

Matching the interval to the projection engine's 80% bands was deliberate. Two different
confidence levels in the same product mean the reader has to remember which is which.`,
    evidence: [
      { label: "Residual SD", value: "9.91 SP+ points" },
      { label: "Rows ranked", value: "2,310 team-seasons and 2,700 recruiting classes" },
      { label: "Applied to", value: "team performance residuals, recruiting-ROI hit rates, and class development scores" },
    ],
    limits: `Shrinkage makes a leaderboard honest, not right. It cannot recover information that
      was never there — a five-recruit class simply does not support a ranking, and the correct
      output for it is "indistinguishable from average", which is what it now gets.`,
    alternatives: [
      { label: "Empirical-Bayes shrinkage plus a displayed interval on every ranked finding", basis: "one shared helper",
        status: "shipped", note: "v4.3, utils/shrinkage.py." },
    ],
    source: "docs/RESEARCH_METHODS.md · utils/shrinkage.py",
  },
];
