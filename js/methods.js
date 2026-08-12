// methods.js — the registry behind methods.html.
//
// This page publishes how every number on the platform is computed, what is
// wrong with it, and what we could do instead. It exists because the reasoning
// was previously only in the code and in four markdown files, which meant the
// site asserted numbers it never justified.
//
// It is deliberately technical. There is one reader.
//
// Entry contract — deliberately the same shape as findings.js, so the two can
// converge later:
//   id           registry key + anchor
//   group        which section it renders under
//   title        heading
//   summary      one paragraph: what this number is
//   formula      code block, as the code actually computes it (not as intended)
//   reality      optional — what the code does when it differs from the formula
//   evidence     [{ label, value }] measured facts, with numbers
//   alternatives [{ label, basis, status, note }] — status drives the chip
//   source       where to read more
//
// Everything here is mirrored in the pipeline's docs/: FORMULAS.md,
// ALTERNATIVES.md, HOW_PROJECTIONS_WORK.md, RESEARCH_METHODS.md. When those
// change, change this.

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
    formula: `per game:  stat_composite × opponent_multiplier      opponent_multiplier ∈ [0.55, 1.45]
season:    Σ(per-game) / √(games_played)          = edge_score
rating:    edge_score → OVR via fixed position anchors (per era bucket)`,
    evidence: [
      { label: "Era buckets", value: "modern 2018+, transition 2013–17, classic 2008–12" },
      { label: "Classic-era defensive thresholds", value: "75% of modern (no hurries or PBUs before 2015)" },
      { label: "Raw EDGE is not cross-position comparable", value: "QB ≈ 1,600 vs CB ≈ 20 — boards show percentile within position" },
    ],
    alternatives: [
      { label: "Pool-relative scaling (percentile of the season)", basis: "Would guarantee a 99 every year",
        status: "rejected", note: "Destroys cross-era comparability. This is the decision the anchor design exists to prevent." },
    ],
    source: "docs/FORMULAS.md §0–1",
  },

  {
    id: "ol",
    group: "ratings",
    title: "Offensive line — the number is a recruiting rank in costume",
    summary: `The OL formula reads two team-level inputs that are never written into the payload
      it reads them from. Both silently collapse: one to zero, one to a constant. What is left is
      recruiting, class year and an award flag. This is the clearest case on the platform of a
      number computed correctly from inputs that do not exist.`,
    formula: `composite_OL = 0.30·N(team_rush_ypa) + 0.25·N(team_sack_rate_inv)
             + 0.30·N(recruit_composite) + 0.10·N(experience) + 0.05·N(award_tier)`,
    reality: `team_rush_ypa and team_sack_rate are absent from every OL payload, so:
  N(team_rush_ypa)      = clip((0 − 3)/3)      = 0      → contributes nothing, ever
  N(team_sack_rate_inv) = clip((1 − 0.5)/0.48) = 1.0    → a flat 0.25 for every lineman

live formula = 0.25 + 0.30·N(recruiting) + 0.10·N(experience) + 0.05·N(award)`,
    evidence: [
      { label: "OL payloads containing team_rush_ypa", value: "0 of 280 (2025)" },
      { label: "Correlation with recruiting composite", value: "r = 0.877 — every other position is under 9%" },
      { label: "Rated linemen landing on exactly 80.0", value: "59 of 293 (20%)" },
      { label: "Agreement with EA CFB 27", value: "−0.274 — negative" },
      { label: "Linemen rated at all", value: "280 of 2,952 (9%) — only those who happened to record a tackle" },
      { label: "Where the “88 cap” comes from", value: "max attainable composite 0.65 → the 88 anchor. Arithmetic, not policy." },
      { label: "How class age contributes", value: "10% weight via player_seasons.year — a field constant across a career for 84% of players" },
    ],
    alternatives: [
      { label: "Withdraw the player rating; publish a line-unit rating", basis: "lineYards, stuffRate, powerSuccess, secondLevelYards from /stats/season/advanced — confirmed back to 2010",
        status: "recommended", note: "Measures the unit, which is the level the data actually supports. Replaces a fake number with a real one instead of just deleting it." },
      { label: "Draft outcome as external validation", basis: "/draft/picks, ~255/yr, matches our player ids at 94.5%",
        status: "recommended", note: "Not a rating — the only independent check on OL we will ever have." },
      { label: "EA blocking composite, 2026 only, labelled", basis: "1,278 of 1,534 linemen matched; passBlock vs runBlock correlate 0.53, so they carry independent signal",
        status: "experiment", note: "One season, not backfillable, cannot be backtested by construction." },
      { label: "Allocate the unit rating to players by snaps or starts", basis: "unit × share",
        status: "rejected", note: "Invents per-player variance that does not exist." },
      { label: "Individual blocking grades", basis: "—",
        status: "blocked", note: "No pancakes, sacks allowed or pressures allowed exist anywhere in the API. Verified by full key scan." },
    ],
    source: "docs/FORMULAS.md §2 · docs/ALTERNATIVES.md §A",
  },

  {
    id: "defense",
    group: "ratings",
    title: "Defense — the rating is mostly tackle volume",
    summary: `Every defensive position is a hand-weighted sum of six box-score counters. The
      trouble is that the biggest of them, tackles, is close to the opposite of a quality
      measure: it is driven by snaps played, by how often the opponent runs at you, and by how
      long your defence is on the field. A defence that gets off the field denies its own players
      the statistic we reward them for.`,
    formula: `CB:  coverage = INT×4.0 + PBU×2.0        LB:  tackling = TOT×0.5 + TFL×2.0
     tackling = TOT×0.3 + TFL×1.0             coverage = INT×3.0 + PBU×1.5
     instinct = (INT + PBU) / max(TOT, 1)     instinct = (INT+PBU+TFL) / max(TOT, 1)`,
    evidence: [
      { label: "Correlation of tackles with final OVR", value: "0.70–0.82 at every position; strongest single input at safety" },
      { label: "Unused and sitting on disk", value: "defensiveSOLO (402,156 rows), fumblesFUM / fumblesREC (42,328)" },
      { label: "Small-sample blowup", value: "instinct = (INT+PBU)/max(TOT,1) gives one tackle + one breakup a perfect 1.0" },
      { label: "Generic “DB” in the source data", value: "1,397 of 2,889 secondary players (48%) — upstream, not our parsing" },
    ],
    alternatives: [
      { label: "Split solo from assisted tackles", basis: "defensiveSOLO, on disk, all 18 seasons",
        status: "recommended", note: "A solo tackle is a made play; an assist is proximity. Free, universal." },
      { label: "Credit forced fumbles and recoveries", basis: "fumblesFUM / fumblesREC, on disk",
        status: "recommended", note: "A strip-sack currently scores only the sack." },
      { label: "Give tackles a denominator (defensive plays faced)", basis: "/stats/season/advanced defense.plays, confirmed 2010+",
        status: "recommended", note: "The substantive fix. Test: the correlation between team defensive quality and individual OVR must fall." },
      { label: "Havoc share — player disruption ÷ unit havoc", basis: "havoc.frontSeven / havoc.db, which map almost exactly onto our position groups",
        status: "recommended", note: "Measures share of what the unit did, rather than raw volume." },
      { label: "Shrink small-sample ratios toward the position mean", basis: "nothing new",
        status: "recommended" },
      { label: "Leverage-weight sacks, INTs and PBUs by game situation", basis: "/plays/stats carries down, distance, field position and score per event",
        status: "experiment", note: "Needs a ~2,450-call harvest; earn it first." },
      { label: "Per-snap rates", basis: "snap_pct — zero before 2013, ~2,500 players/yr after",
        status: "experiment", note: "Needs an explicit “unknown” branch, never a zero." },
      { label: "Missed tackles, coverage snaps, targets allowed", basis: "—",
        status: "blocked", note: "None exist. /plays/stats defines a Tackle type but returns zero records of it; Target is attributed to the receiver, on incompletions only." },
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
    formula: `ball_hawk   = INT×12.0 + PBU×3.5 + defTD×8.0
run_support = TOT×0.6 + TFL×4.0 + sacks×6.0 + hurries×1.5
coverage    = playing-time share × team pass-denial credit   (no box-score input)

CB 0.40 coverage / 0.40 ball hawk / 0.20 run support
S  0.20 / 0.30 / 0.50          DB 0.33 / 0.33 / 0.33`,
    evidence: [
      { label: "Cost of the archetype split vs a flat composite", value: "Spearman vs EA 0.660 → 0.655 (2025); accepted deliberately" },
      { label: "Coverage credit, tuned", value: "none 0.6386 → ×4 peak 0.6576; placebo crediting random defences 0.6293 — below crediting nobody" },
      { label: "Denial measured against the offence faced", value: "2025 .6507→.6588, 2024 .5357→.5421, 2023 .2756→.2818" },
      { label: "ARCHETYPE_SCALE re-measured after v4.2", value: "p90s 9.9 / 8.4 / 10.0 against a target of 10" },
    ],
    alternatives: [
      { label: "Resolve generic DB → CB/S using EA position", basis: "matched players only",
        status: "experiment" },
      { label: "Infer CB vs S from box-score behaviour", basis: "high INT+PBU, low tackles ⇒ corner",
        status: "rejected", note: "Circular — it assigns the archetype using the statistics the archetype then judges." },
      { label: "Group CB/S/DB behind one filter, keep three badges", basis: "UI only",
        status: "recommended", note: "CONFIG.POSITIONS currently omits DB entirely, so 1,397 players are invisible to the position filter." },
    ],
    source: "docs/FORMULAS.md §3",
  },

  {
    id: "specialists",
    group: "ratings",
    title: "Kickers and punters",
    summary: `Specialists occupy a narrow band by design — their impact range is genuinely
      smaller than a skill player's. v4.2 pulled them down hard after a punter outranked the
      receivers on his own team page.`,
    formula: `K   0.50 fg_pct + 0.25 fg_long + 0.15 xp_pct + 0.10 volume
P   0.55 avg_yards + 0.30 inside_20_pct + 0.15 volume     → ceiling 90`,
    evidence: [
      { label: "Before v4.2", value: "17 kickers and 38 punters at 85+, against EA's 5 and 1" },
      { label: "After", value: "4 and 2" },
      { label: "Known false alarm", value: "script 07's validator still expects K/P mean 55–70; the shipped mean is ~50, so specialists warn on every run. The bounds are stale, not the ratings." },
    ],
    alternatives: [
      { label: "Re-derive the K/P distribution bounds from the intended design", basis: "nothing new",
        status: "recommended", note: "Deliberately not done in the same change that shipped the ratings they judge — that is how goalposts move." },
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
      miss with the signs dropped. Ours is 8.17 for offence. The only number that makes that
      meaningful is the dumb baseline: assuming every player repeats last season scores 9.10.
      The model is worth about one rating point over guessing “no change”.`,
    formula: `1  career curve    each season → percentile within its own (season, position)
2  shape features  ~30 numbers, computed twice: raw path, and healthy seasons only
3  cohort baseline what players at the same position/class/decile actually did next
4  model           XGBoost → next OVR, then  mu + k·(pred − mu),  k = 1 + 0.5·(real_sd/pred_sd − 1)
5  interval        10th/90th percentile of validation residuals, bucketed by predicted OVR`,
    evidence: [
      { label: "Offence", value: "naive 9.10 → model 8.17, interval coverage 80.6%, spread 76% of reality" },
      { label: "Defence", value: "naive 9.63 → model 8.45, coverage 78.8%, spread 70%" },
      { label: "Consequence of half-stretching the spread", value: "decline is under-called at every level — 66% projected to decline at 90+, against 81% historically" },
      { label: "Interrupted careers are treated more generously, not less", value: "mean projected change +6.06 vs +3.55 for clean careers" },
      { label: "OL", value: "not projected at all — 2,902 rows carry EA's opinion and no rating of ours" },
    ],
    alternatives: [
      { label: "Feed the raw-minus-healthy acceleration gap explicitly", basis: "the gap is the interruption signal",
        status: "experiment" },
      { label: "Replace direction-blind consistency with a monotonicity measure", basis: "a steady climber currently scores as volatile as an oscillator",
        status: "experiment" },
      { label: "Career-context features: own-program strength, transfer flag, destination minus origin", basis: "/ratings/* and transfers.json",
        status: "experiment", note: "The model currently has no idea who a player played for, or that he moved." },
      { label: "Model NFL departure explicitly", basis: "/draft/picks, 2010–2024, 94.5% id match",
        status: "recommended", note: "Cohort curves are built only from players who stayed, which is why the top of the scale is optimistic. This fixes it rather than disclosing it." },
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
      posted a career year at the 93rd percentile. The model projects him down 11.5 points. The
      reason is arithmetic, not judgement, and it is the clearest illustration of what the
      engine can and cannot see.`,
    formula: `percentile path   10.3 → 58.2 → 15.6* → 92.8        (* 3 games — interrupted)

raw acceleration       changes +47.9, −42.6, +77.2  →  ≈ +120
healthy-only           changes +47.9, +34.6         →  ≈ −13

drivers   pct_accel −3.65 · ovr +2.34 · cohort_next +1.66 · n_seasons +0.97`,
    evidence: [
      { label: "The missed season digs a false trough", value: "climbing out of it registers as a spike, and the model has learned that spikes regress" },
      { label: "80% interval", value: "[57.6, 83.6] — excludes his own 85.2" },
      { label: "How rare that is", value: "0.6% of all projections rule out repeating last season; 29.6% of players at 90+ do" },
      { label: "What the model does not know", value: "that he transferred, who he played for, or that Boise State is where he broke out" },
      { label: "What it does know", value: "who he played against — EDGE is opponent-adjusted per game, so the 92.8 is not schedule inflation" },
    ],
    alternatives: [],
    source: "docs/HOW_PROJECTIONS_WORK.md",
  },

  // ── Team ratings ──────────────────────────────────────────────────────────
  {
    id: "team-ratings",
    group: "team",
    title: "Team ratings",
    summary: `Three signals blended, renormalised when one is absent — which is how a season
      with neither SP+ nor team stats still produces a rating.`,
    formula: `team_rating = 0.50 SP+ + 0.30 our player ratings + 0.20 team stats

pass_off = 0.45 avg_top(QB,2) + 0.35 avg_top(WR+TE,5) + 0.20 avg_top(OL,5)
run_off  = 0.40 avg_top(RB,3) + 0.40 avg_top(OL,5) + 0.10 QB + 0.10 WR/TE`,
    evidence: [
      { label: "A trap worth knowing about", value: "avg_top() returns a hard-coded 50.0 when a position has no rated players" },
      { label: "Why that matters", value: "OL is 40% of run offence — withdrawing OL ratings without renormalising makes 40% of every team's run offence an identical constant" },
    ],
    alternatives: [
      { label: "Substitute the line-unit rating for the OL term", basis: "/stats/season/advanced",
        status: "recommended", note: "More honest than averaging five recruiting ranks." },
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
      durable — but durable is not the same as coaching.`,
    formula: `SP+ ≈ β₁·talent + β₂·is_p5 + c        R² = 0.474,  residual SD = 9.82
performance_residual = actual SP+ − predicted SP+`,
    evidence: [
      { label: "Year-over-year persistence", value: "r = 0.607 at t+1, 0.280 at t+3 — so not noise" },
      { label: "But persistence does not identify coaching", value: "scheme, development pipelines, portal usage and systematic error in the talent proxy are all persistent by team" },
      { label: "The decisive test", value: "a coaching-change event study — does the residual step when the coach changes, and travel with him?" },
      { label: "Previously blocked", value: "the coaching table was 22 seeded rows" },
      { label: "No longer blocked", value: "/coaches covers 2010–2024 with tenure and per-season SP+, matching our schools at 100%" },
    ],
    alternatives: [
      { label: "Coaching-change event study", basis: "/coaches", status: "recommended" },
      { label: "Add returning production and prior-year SP+ as covariates", basis: "/player/returning, confirmed 2016+",
        status: "experiment", note: "Separates “beat your talent” from “beat your talent this year, with an experienced roster”." },
    ],
    source: "docs/RESEARCH_METHODS.md §1",
  },

  {
    id: "research-recruiting-roi",
    group: "research",
    title: "What recruiting classes actually became",
    summary: `Hit rate is the share of a class reaching peak OVR ≥ 75. The page says this
      separates programs that recruit well from programs that develop well. Measured, it does
      not — it tracks recruiting, so it is closer to a restatement of the star ratings than a
      separation from them.`,
    formula: `contributor        = peak_ovr ≥ 75
hit_rate_pct       = contributors / recruits ever rated
hit_rate_class_pct = contributors / all recruits in the class`,
    evidence: [
      { label: "Correlation of class recruiting composite with hit rate", value: "+0.266 (rated), +0.328 (all)" },
      { label: "Weak third of classes", value: "28.8% hit rate" },
      { label: "Strong third", value: "39.0% — better classes hit more often" },
      { label: "peak_ovr reads the future", value: "recent classes are censored; the maturing flag exists and the UI must respect it" },
      { label: "A hypothesis that turned out wrong", value: "I expected weak programs to look better because their recruits play sooner. The data says the opposite." },
    ],
    alternatives: [
      { label: "Residualize per recruit, then aggregate", basis: "expected peak OVR from his own composite — script 13's trick one level down",
        status: "recommended", note: "A program that turns 3-stars into 80s scores well; one that turns 5-stars into 80s does not. Every input already exists." },
      { label: "Draft picks per class as an alternative outcome", basis: "/draft/picks", status: "experiment" },
    ],
    source: "docs/RESEARCH_METHODS.md §2",
  },

  {
    id: "research-gems",
    group: "research",
    title: "Hidden gems — a list with no denominator",
    summary: `Filtered client-side to two-star-or-lower recruits rated 70+. It is selection on
      the outcome with no base rate: we show the 2★ players who succeeded and never say how many
      there were, so the reader cannot tell whether the list is remarkable or arithmetic.`,
    formula: `rows.filter(p => p.stars >= 1 && p.stars <= 2 && p.overall_rating >= 70)`,
    evidence: [
      { label: "No base rate shown", value: "if 5% of 2★ and 35% of 5★ recruits reach 70, the list is expected — and we do not say which" },
      { label: "Unrated recruits excluded", value: "stars >= 1 drops the most extreme version of the story the finding is about" },
      { label: "Single season", value: "a player who peaked in 2021 is invisible" },
    ],
    alternatives: [
      { label: "Express against expectation and show the base rate", basis: "same inputs", status: "recommended" },
    ],
    source: "docs/RESEARCH_METHODS.md §4",
  },

  {
    id: "research-uncertainty",
    group: "research",
    title: "Every finding is a ranking, and none carries uncertainty",
    summary: `This is the defect shared by all of them. Rank 2,310 noisy things and the top of
      the list is selected substantially for noise — the team at number one is disproportionately
      likely to be there because it got lucky. A platform whose pitch is “we show our work”
      should not walk into the multiple-comparisons trap.`,
    evidence: [
      { label: "Residual SD", value: "9.82 SP+ points" },
      { label: "Rows ranked", value: "2,310 team-seasons" },
    ],
    alternatives: [
      { label: "Empirical-Bayes shrinkage plus a displayed interval on every ranked finding", basis: "one shared helper",
        status: "recommended", note: "The change I would make before any other on the research page." },
    ],
    source: "docs/RESEARCH_METHODS.md",
  },
];
