// changes.js — the CHANGES registry behind changes.html.
//
// methods.html explains what a number IS. research-*.html explains what a finding
// CLAIMS. This explains what happened in a working session: which alternative was
// built and abandoned, what the measurement said, which constant moved and why.
// That record used to live only in commit messages and four markdown changelogs,
// none of which are reachable from the site — so the site changed its numbers
// between visits and never said why.
//
// Entry contract (a deliberate subset of METHODS, so the two can converge):
//   id          registry key + anchor            "v4.4-foundation"
//   version     rating/release version           "v4.4"
//   date        ISO date shipped
//   title       what this pass was about
//   summary     one paragraph — the problem, not the solution
//   motivation  what prompted it: a complaint, a measurement, a bug
//   did         [{ what, why, cost }]
//   tried       [{ what, result, verdict }]   REQUIRED — the point of the page
//   measured    [{ label, before, after }]
//   gates       [{ check, result }]
//   unfixed     what this pass did NOT fix    REQUIRED — never empty
//   methods     [ids] into METHODS, rendered as links (validated at render time)
//   files       new / substantially changed
//
// Entries v3.1–v4.3 are BACKFILLED from CHANGELOG_v3.1_redesign.md,
// CHANGELOG_v3.2_projections.md, CHANGELOG_v3.3_ratings.md and
// CHANGELOG_v4.3_ratings.md. That is transcription, not authorship: where a
// changelog did not record a field, the entry says so rather than inventing one.
//
// Going forward a CHANGES entry ships in the same commit as the work it
// describes — batching at release time is how the reasoning gets lost, because
// the reasoning is freshest in the session that produced it.

const CHANGES = [
  {
    id: "v4.5-basis",
    version: "v4.5",
    date: "2026-08-13",
    title: "Spending the measurement: what a rating is built from, and one position that was never tiered",
    summary: `v4.4 measured the foundation and deliberately changed no rating. This pass spends
      that measurement — and starts by correcting it twice, because the reliability figure it
      published was computed on the production composite and then used to draw conclusions about
      the published number, which is a different quantity.`,
    motivation: `Phase 0 of the architecture review: make the foundation legible before building
      anything on it. Two corrections to the measurement had to land first, and looking for the
      second one turned up a defect nobody was looking for — the playing-time tier table had no
      entry for DB, so every defensive back in the archive had been rated as a starter.`,
    did: [
      { what: "Reliability is now measured on BOTH the composite and the shipped OVR",
        why: "The v4.4 number was the composite's. Feeding that into interval widths would have over-widened exactly the positions the tiers already shrink most, and using it as a ceiling for persistence overstated how close defensive backs are to their limit. The gap between the two is itself the measurement of how much work the tiers and the recruiting blend do: +0.126 at S, +0.115 at DB, +0.108 at CB, against +0.044 at QB.",
        cost: "The headline headroom claim weakens. Against the right ceiling the spread is 58–73%, not 63–88%. The ordering survives; the size of the gap does not." },
      { what: "DB added to PLAYTIME_TIERS",
        why: "It was missing entirely, the lookup returned None, and the code read that as 'no thresholds, treat as starter'. All 23,353 DB player-seasons were rated on the full production formula with no recruiting anchor. The 2025 split was 919 starters and nothing else, against CB's 245/70/123.",
        cost: "7,138 DB ratings moved, mean −5.19. This is the one rating change in the pass and it is the point of it." },
      { what: "rating_basis on every rating row: production / blended / recruiting / withheld",
        why: "Two thirds of a roster has no production to measure and for those players the rating IS position average plus a stars delta — a six-valued step function. FORMULAS.md §7 always said so; the site published both kinds of number identically.",
        cost: "None to any number. A chip on the rows that need it; production is unchipped because it is the default a reader assumes." },
      { what: "A defender's zero tackles no longer reads as one",
        why: "Defensive features divide by tackles so volume_score is max(TOT, 1), and the tier lookup read that floored value against a reserve threshold of exactly 1. The bench tier was unreachable at CB, DL and EDGE — zero bench rows at all three in 2025." },
      { what: "The no-EDGE fallback maps through fixed anchors instead of pool percentiles",
        why: "It was the one surviving path with pool-relative scaling, which AUDIT_FINDINGS §9 forbids: the bottom of the pool became 30 and the top 78 every season regardless of absolute quality.",
        cost: "3,468 rows moved by ≤0.02 OVR — interpolation error, which is what 'calibrated to reproduce today's output' should look like." },
      { what: "Intervals are per position rather than per family",
        why: "One band per family gave a corner and a linebacker the same interval. Coverage ran 72.8% (CB) to 84.6% (DL) against an 80% target that held only in aggregate.",
        cost: "Defence mean |coverage − 80| falls 4.2 → 2.3 points; offence is unchanged at 1.7, which is correct — it was already calibrated." },
      { what: "rate_position() computes each position's cross-season pool once",
        why: "It rated every season of a position to return one, and main() looped seasons outside that — 228 rebuilds of a frame assembled by a Python loop over a quarter of a million rows, plus 19 rewrites of a 112 MB file.",
        cost: "None to output; the ratings diff is the check that says so." },
    ],
    tried: [
      { what: "Scaling interval width per position by sqrt(1 − reliability)",
        result: `The brief's own proposal, and the obvious way to make a corner's interval
          wider than a quarterback's. It failed its gate: CB 72.8% → 80.1% and DB 76.1% → 80.8%,
          but S 75.5% → 68.8%, LB 84.0% → 72.6%, TE 83.1% → 93.5%, QB 77.1% → 73.7%. Mean
          |coverage − 80| went **3.2 → 5.9 points**. Reliability bounds what a rating can *know*;
          it does not describe how a projection of it *errs*. Replaced by residual quantiles
          measured per position, which ask the data the question directly and pass.`,
        verdict: "rejected" },
      { what: "Explaining the reliability spread by how often each position is observed",
        result: `The brief's third hypothesis: a corner records 3.6 countable events a game
          against a running back's 8.4, so some of the spread should be observation count rather
          than a property of the position. Measured, it is not. Reliability against event-count
          decile is **U-shaped** — the least-observed decile is the *most* repeatable, because a
          player with 1.4 events a game reliably produces nothing — and across positions the
          correlation is only +0.44, with TE the least-observed position and the fourth most
          reliable. The original framing survives, which is worth as much as the correction
          would have been.`,
        verdict: "rejected" },
      { what: "Tiering pre-2016 defenders on production, once the tackle floor was removed",
        result: `Removing the floor moved every pre-2016 CB, DL and EDGE with no recorded tackle
          from reserve to bench, which replaced the CLASSIC interceptions-and-recruiting rating
          with a pure recruiting grade. Tiering them properly instead revealed the real defect —
          **the CLASSIC rating is largely inoperative**, discarded or diluted by the tier blend
          for every pre-2016 defender — and moves 3,900 ratings by a mean of +9.0 (EDGE) to
          +16.5 (LB). Held at the pre-v4.5 behaviour on purpose: that is a rating change for an
          era with no external check, and this is a labelling pass.`,
        verdict: "experiment" },
      { what: "The career blend, re-run on the composite instead of the OVR",
        result: `v4.4 measured the benefit at **−0.67** against reliability — the opposite of the
          theory — and left it inconclusive. It was run on the shipped OVR, which the tiers have
          already shrunk toward a recruiting prior, so it was blending a number toward a prior it
          partly contains. On the unshrunk composite the sign flips to **+0.385** and it helps at
          every position, most where reliability is lowest: CB −0.0264 MAE, DB −0.0263,
          S −0.0228, against RB −0.0055. Alive, and belongs in Phase 1.`,
        verdict: "experiment" },
    ],
    measured: [
      { label: "DB agreement with EA CFB 27", before: "0.6132", after: "0.6497" },
      { label: "Pooled agreement, all positions", before: "0.6137", after: "0.6185" },
      { label: "Mean DB rating, 2025", before: "65.7 (above CB and S)", after: "63.9 (between them)" },
      { label: "DB tier split, 2025", before: "919 starters, 0 anything else", after: "tiered like every other position" },
      { label: "Rated rows whose OVR moved", before: "—", after: "7,138 DB (61% of DBs) + 13 others; 3,468 more by ≤0.02" },
      { label: "Reliability of the shipped OVR, CB", before: "never measured (composite 0.591)", after: "0.700" },
      { label: "Reliability of the shipped OVR, QB", before: "never measured (composite 0.876)", after: "0.919" },
      { label: "Share of ceiling reached, DB", before: "88% (wrong ceiling)", after: "71%" },
      { label: "Share of ceiling reached, QB", before: "63% (wrong ceiling)", after: "60%" },
      { label: "Defence interval coverage spread", before: "72.8%–84.6%, mean 4.2 pts off target", after: "75.9%–82.7%, mean 2.3 pts off" },
      { label: "--all-seasons rating computation", before: "405s, plus 19 rewrites of a 112 MB file (~100s)", after: "57s including one write" },
      { label: "Tests", before: "283 passing", after: "300 passing" },
    ],
    gates: [
      { check: "pytest tests/ -q", result: "300 passed" },
      { check: "python scripts/validate_ratings.py --season 2025", result: "every position within bounds; OL withheld; DB mean 65.7 → 63.9" },
      { check: "python scripts/validate_reliability.py --decompose", result: "GATE PASS — ovr_reliability ≥ composite reliability at all 10 positions" },
      { check: "projection gates", result: "offence 8.18 vs naive 9.09, defence 8.38 vs naive 9.56; coverage 78.7% / 79.4%" },
      { check: "ratings diff, before vs after", result: "attributable in full: 7,138 DB rows to the tier fix, 13 to the un-floored zero, 3,468 at ≤0.02 to the anchor swap" },
      { check: "node --check js/*.js · contrast-check", result: "pass · green both themes" },
      { check: "full recompute", result: "07 → 10 → 15 → 16 → 10 (projected) → 13 → 14 → 12" },
    ],
    unfixed: `**The CLASSIC pre-2016 defensive rating is still largely inoperative.** The tier
      blend discards or dilutes it for every pre-2016 defender because they are tiered on a
      tackle count that does not exist for them. Measured at a mean +9.0 to +16.5 across 3,900
      ratings if fixed. Held constant deliberately; it needs its own pass and an argument about
      what a pre-2016 defender's rating should even be.

      **The career blend is measured and not implemented.** It belongs in the engine and is not
      in it — this pass established the sign, not the fitted weights.

      **A recruiting-based rating is still published, still ranked, and still feeds team
      ratings.** The chip stops it being misread; it does not stop it being counted. Whether
      those rows should be capped, hidden from boards, or split into Production and Talent is a
      ranking decision and was deliberately not made here.

      **EDGE_OVR_ANCHORS has no era buckets**, despite FORMULAS.md describing three, and
      get_rating_era() is dead code with no call sites. Found while proving the pool cache safe;
      not touched, because changing anchors moves every rating at once.

      Nothing was done about the two-histories problem, the slim/detail export split, or
      player_seasons.year still being exported as a class year it is not.`,
    methods: ["rating-basis", "db-tiers", "reliability", "headroom", "projection", "edge-core"],
    files: ["scripts/07_compute_player_ratings.py", "scripts/12_export_frontend_json.py",
            "scripts/15_predict_trajectories.py", "scripts/validate_reliability.py",
            "tests/test_playtime_tier.py", "tests/test_export_contract.py",
            "js/ui.js", "js/playerSearch.js", "css/components.css",
            "docs/FORMULAS.md", "docs/ALTERNATIVES.md", "CLAUDE.md"],
  },

  {
    id: "v4.4-build-log",
    version: "v4.4",
    date: "2026-08-13",
    title: "This page",
    summary: `The site could explain what every number is and what every finding claims,
      and could not explain what had happened to either. A rating changed between two visits
      and nothing forward-facing said why — which is precisely the failure mode this project
      exists to avoid.`,
    motivation: `Written up in \`docs/BUILD_LOG_SPEC.md\`. The reasoning behind a change was
      reachable in commit messages, in four markdown changelogs and in code comments, none of
      which a reader of the site can see. methods.html had already solved this shape of problem
      for formulas, so this gets the same solution rather than a new one: a registry, a shell,
      and no page code.`,
    did: [
      { what: "js/changes.js — the CHANGES registry, seeded with six entries",
        why: "Content only. Adding a build-log entry is a registry entry, never page code — the same guarantee METHODS and FINDINGS give.",
        cost: "A third registry to keep current. The contract is a subset of METHODS so the two can merge later." },
      { what: "js/changesPage.js — rendering only",
        why: "Mirrors methodsPage.js exactly rather than inventing a second pattern." },
      { what: "prose() and statusChip() extracted into js/ui.js",
        why: "changesPage needed the escaper, the light-markdown renderer and the chip. Two copies of an escaper is how one of them ends up not escaping, so methodsPage.js now uses the shared ones and its local _mEsc/_prose/_statusChip are gone.",
        cost: "methodsPage.js call sites all changed in one mechanical pass." },
      { what: "METHODS ids in an entry render as links to methods.html#<id>, validated at render time",
        why: "A reader goes from 'what changed' to 'what it is' in one click. An id with no matching METHODS entry renders as plain text — a dead anchor promises an explanation and delivers a scroll to nowhere." },
      { what: "The methods page's `data` group now renders its entries as well as the generated availability table",
        why: "It previously rendered only the table, so any entry filed under that group was silently discarded. A registry that drops content is worse than no registry." },
    ],
    tried: [
      { what: "Import _mEsc / _prose from methodsPage.js instead of extracting them",
        result: "Allowed by the spec, and it would have left the definitions in the page that happened to need them first. Extraction to ui.js keeps one copy where both pages already look.",
        verdict: "rejected" },
      { what: "A separate chip vocabulary for build-log outcomes (kept / dropped / parked)",
        result: "The METHODS statuses already say rejected / experiment / shipped, and a second chip system is a design change wearing a content change's clothes.",
        verdict: "rejected" },
      { what: "Backfilling the four changelogs verbatim, including their tables",
        result: "The entry contract wants before/after pairs, and the older changelogs mix those with prose. Transcribed the measurements that were recorded as pairs and left the rest in the source documents, which the entries name.",
        verdict: "shipped" },
    ],
    measured: [
      { label: "Registries on the site", before: "2 (METHODS, FINDINGS)", after: "3 (+ CHANGES)" },
      { label: "Escaping helpers defined in js/", before: "2 (_esc, _mEsc)", after: "1 (_esc)" },
      { label: "Sessions with a reachable record of what was tried and dropped", before: "0", after: "6 backfilled" },
    ],
    gates: [
      { check: "node --check js/changes.js js/changesPage.js js/ui.js js/methods.js js/methodsPage.js", result: "pass" },
      { check: "node tools/contrast-check.mjs", result: "green, both themes" },
    ],
    unfixed: `The four markdown changelogs still exist alongside these entries, so the same
      history is now in two places and can drift. They should become the source this page is
      generated from, or be retired once the entries are trusted.

      The seeded entries are only as good as the changelogs they came from: v3.1 recorded
      almost no *rejected* alternatives, so its \`tried\` array is thin, and v4.3 never wrote a
      "what this pass did not fix" section — its \`unfixed\` here is assembled from what the
      roadmap listed as open at the time, and it says so.

      There is no CHANGES entry for anything before v3.1.`,
    methods: ["reliability", "edge-core"],
    files: ["js/changes.js", "js/changesPage.js", "changes.html", "js/ui.js",
            "js/methodsPage.js", "js/shell.js", "docs/BUILD_LOG_SPEC.md"],
  },

  {
    id: "v4.4-foundation",
    version: "v4.4",
    date: "2026-08-13",
    title: "How much of a rating is signal — the measurement that reorders the backlog",
    summary: `Every argument about improving the ratings, including the roadmap's, had been
      conducted without knowing how much of a rating is signal. Split-half reliability now
      answers it: a corner's own two half-seasons agree at 0.42. Not with EA, not with the
      draft — with himself. Three candidate improvements were built and measured against that
      ceiling in the same pass, and three of them failed.`,
    motivation: `A review of the whole platform, asked for on the grounds that the foundation
      was not solid enough to carry playoff prediction and roster analysis. The premise was
      right and the diagnosis was not: the formulas are not obviously wrong, but nothing
      downstream of them could be prioritised without knowing which positions are measurable at
      all.`,
    did: [
      { what: "scripts/validate_reliability.py — split-half reliability, Spearman-Brown corrected, per position",
        why: "Read-only, run beside validate_ratings.py and validate_vs_draft.py, exporting data/reliability.json. Odd weeks against even weeks, using script 06's own per-game weights, so it measures the composite we actually ship.",
        cost: "It measures the production composite, not the published OVR — the OVR is additionally shrunk by anchors, playing-time tiers and the recruiting blend, so it is steadier than its inputs." },
      { what: "The noise ceiling published per position: √reliability",
        why: "No comparison against any external truth can exceed it. Our CB agreement with EA is 0.571 against a ceiling of 0.769; DL is 0.485 against 0.792. Room, but far less than the raw gap suggests." },
      { what: "Persistence measured against that ceiling",
        why: "Defensive backs already extract 83–88% of the year-over-year signal their measurement allows; quarterbacks extract 63%. The position assumed broken is close to done and the position assumed solved has the most headroom." },
      { what: "docs/ARCHITECTURE_REVIEW_2026-08.md and docs/SUPPLEMENTAL_DATA.md",
        why: "The review carries the defect list and the phased plan; the data inventory gives each of the 17 harvested datasets either a use with a test attached or a stated reason it stays unread. Three of 17 are currently read by anything." },
      { what: "Four METHODS entries under a new `foundation` group",
        why: "Reliability, headroom, and the two rejected candidates. A rejected experiment that is not published gets re-proposed in six months." },
      { what: "Corrected the opponent multiplier in methods.js, FORMULAS.md and RATING_AND_PROJECTION_MODEL.md",
        why: "All three documented a symmetric [0.55, 1.45]. The code has always been asymmetric — up to 1.70 for a hard opponent, down to 0.76 for a weak one. The methods page's whole premise is 'as the code actually computes it'.",
        cost: "No number changed; the code was always right. Only the description was wrong, on the most-read explanation of it." },
    ],
    tried: [
      { what: "A per-game defensive opportunity denominator, replacing the season-level index",
        result: `team_advanced_games.json carries defense_plays for all 35,422 team-games back
          to 2008, and **78% of the variance in plays faced is within a team-season** — invisible
          to the index we ship. Scored the way v4.3 scored the season index: no denominator
          0.5339, season index **0.5448**, per-game index 0.5417, placebo 0.5355. The finer
          measurement is worse than the coarser one it would replace. Game-to-game play count is
          mostly tempo and game script.`,
        verdict: "rejected" },
      { what: "Fitting the defensive weights to NFL draft outcomes instead of hand-setting them",
        result: `Logistic fit on the identical inputs, trained on seasons ≤2018 and scored on
          2019–2025: mean AUC **0.785** against the shipped rating's **0.829** and the raw
          edge_score's **0.836**. The hand-set weights win at every position. The weights are not
          the problem; the inputs are — which is what the reliability measurement says
          independently. \`games\` was the strongest fitted feature almost everywhere.`,
        verdict: "rejected" },
      { what: "Snap share as the defensive opportunity signal — the roadmap's headline item",
        result: `Measured over *rated* player-seasons rather than all stat rows: snap_pct reaches
          88–99% of offensive skill players and **15 defenders out of 43,008 since 2016**. Usage
          and PPA are offence-only. On offensive projections snap share is worth 0.002 MAE; the
          per-snap efficiency built on top of it is worth 0.05 (8.851 → 8.800) and +0.013
          Spearman, concentrated in QB and WR.`,
        verdict: "rejected" },
      { what: "Reliability-weighted blending of a player's season with his own career prior",
        result: `If one defensive season is 0.59 reliable, blending should help most where
          reliability is lowest. The correlation between a position's reliability and the blend's
          benefit is **−0.67** — it helps QB, RB, WR and DL and hurts DB and S. A noisy
          position's career prior is itself built from noisy seasons. Not dead, but not a result:
          it needs the weight fitted per position rather than assumed.`,
        verdict: "experiment" },
      { what: "Our team rating as the basis for the playoff model",
        result: `Preseason game prediction with everything lagged one season, held out on
          2021–2025: prior-season SP+ alone scores Brier **0.2136**, our team rating **0.2154**,
          both together 0.2137 with a coefficient of +0.0065 on ours against +0.0595 on SP+. Our
          rating adds nothing to SP+ — unsurprising, since it is 50% SP+ by construction. The
          market's closing spread scores 0.1816 and knows injuries, so it is a ceiling rather
          than a competitor.`,
        verdict: "experiment" },
    ],
    measured: [
      { label: "Split-half reliability, QB", before: "never measured", after: "0.876 (ceiling 0.936)" },
      { label: "Split-half reliability, CB", before: "never measured", after: "0.591 (ceiling 0.769)" },
      { label: "Share of achievable persistence reached, DB", before: "never measured", after: "88%" },
      { label: "Share of achievable persistence reached, QB", before: "never measured", after: "63%" },
      { label: "snap_pct coverage among rated defenders since 2016", before: "recorded as ~30% of all rows", after: "15 of 43,008 (0.03%)" },
      { label: "Defensive rating vs draft, separation (AUC)", before: "not measured — only rank-among-drafted was", after: "0.829 shipped OVR, 0.836 raw edge_score" },
      { label: "Supplemental datasets read by any script", before: "3 of 17", after: "3 of 17 — plus one that settled a question and was then rejected" },
      { label: "Opponent multiplier, as documented", before: "[0.55, 1.45] symmetric", after: "[0.76, 1.70] asymmetric — the code was never changed" },
    ],
    gates: [
      { check: "pytest tests/ -q", result: "283 passed" },
      { check: "python scripts/validate_ratings.py --season 2025", result: "every position within bounds; OL reports withheld" },
      { check: "python scripts/validate_vs_draft.py", result: "calibration monotone across all six bands; drafted 82.8 vs undrafted 62.8" },
      { check: "python scripts/validate_reliability.py", result: "37,226 player-seasons, 2016–2025; wrote data/reliability.json" },
      { check: "node --check js/*.js", result: "pass" },
    ],
    unfixed: `**No rating changed in this pass, deliberately.** The measurements say what to
      build next; building it in the same pass as the measurement that justifies it is how
      goalposts move.

      The defect list in the architecture review is untouched apart from the multiplier
      documentation: \`STAT_FALLBACK_TARGETS\` still maps the no-EDGE pool by percentile, which
      is the pool-relative scaling AUDIT_FINDINGS §9 forbids (bounded at 78, so small);
      \`rate_position()\` still re-rates every season of a position to return one, so a
      --all-seasons run rebuilds the full frame 228 times and rewrites a 112 MB file 19 times;
      \`classify_playtime_tier\` still falls back to \`volume_score\`, a different quantity on a
      different scale, when a position's canonical stat key is missing.

      \`player_wepa.json\` still holds 1,734 kicking rows whose \`wepa\` is null in every one,
      and \`venues.json\` still has season=0 and team_id=null, so it joins to nothing.

      The two thirds of every roster whose rating is \`pos_avg + stars_delta\` — a six-valued
      step function — is still published as if it were the same kind of number as a starter's.`,
    methods: ["reliability", "headroom", "denominator-pergame", "fitted-defense", "usage-coverage",
              "supplemental-data", "edge-core"],
    files: ["scripts/validate_reliability.py", "docs/ARCHITECTURE_REVIEW_2026-08.md",
            "docs/SUPPLEMENTAL_DATA.md", "docs/PIPELINE_INVARIANTS.md", "js/methods.js",
            "js/methodsPage.js", "data/reliability.json"],
  },

  {
    id: "v4.3-ratings",
    version: "v4.3",
    date: "2026-08-12",
    title: "The recommendations, built — and the two that failed their own tests",
    summary: `Every option marked "recommended" in docs/ALTERNATIVES.md was implemented. Most
      worked. The offensive line's player rating was withdrawn entirely and replaced by a
      line-unit rating; defence gained a solo/assist split, fumble recoveries, an opportunity
      denominator and small-sample shrinkage; and two ideas that were obviously right did
      nothing when measured.`,
    motivation: `A systematic API survey found that three items recorded as blocked were not:
      /coaches covers 2010–2024 with full tenure, /draft/picks joins to our players at 94.5%,
      and /stats/season/advanced carries line metrics back to 2008. The lesson recorded at the
      time: do not infer an absence from our own ignorance.`,
    did: [
      { what: "The OL player rating withdrawn; the LINE rated as a unit instead",
        why: "The old formula read team_rush_ypa and team_sack_rate from the player's own payload, where they are never written — 0 of 280 OL payloads in 2025 contained the key. 55% of the formula silently collapsed and what shipped was 0.25 + 0.30·recruiting + 0.10·class + 0.05·award.",
        cost: "No lineman carries an earned rating. Rows are still emitted with rating_status='not_rated' and a reason, so a lineman does not vanish from his own roster." },
      { what: "avg_top() returns None instead of a fabricated 50.0",
        why: "OL is 40% of run offence; withdrawing the ratings without this would have made 40% of every team's run offence an identical constant, silently. Made universal, so a team with no rated kicker no longer gets a fabricated special-teams number either." },
      { what: "Solo/assist tackle split, fumble recoveries, opportunity index, rate shrinkage",
        why: "Four attacks on the same complaint — the rating was mostly tackle volume and tackle volume is mostly opportunity.",
        cost: "The solo split is 2013+ only; zero rows carry defensiveSOLO before it, so the classic era degrades to plain totals." },
      { what: "Line-unit bounds bucketed into three eras",
        why: "Pooled bounds made the median line rating climb from 52 in 2008 to 77 in 2023. Median line yards jump 2.885 → 3.095 between 2020 and 2021 — a provider changing a definition, not 130 teams learning to block." },
      { what: "Recruiting ROI residualized; coaching event study built; shrinkage and intervals on every ranked finding",
        why: "The ROI metric correlated +0.266 with the class's own recruiting composite, so it restated the star ratings rather than measuring development." },
      { what: "scripts/validate_vs_draft.py — the first external, historical backtest these ratings have had",
        why: "Every other check is internal or a cross-section against one season of EA. The draft is eighteen years deep and was decided without seeing our numbers." },
      { what: "17 supplemental datasets harvested (210,287 rows)",
        why: "Held whether or not anything consumes them yet, so the next question does not start with a week of 'can we even get that'." },
    ],
    tried: [
      { what: "Havoc share — crediting a defender for his share of his unit's disruption",
        result: `Real denominator +0.0011; replacing every unit's havoc with **one shared
          constant** scored +0.0019. A denominator that performs worse than a constant is not a
          denominator — the credit was re-weighting TFLs, PBUs and recoveries the composite
          already counts. Computed, stored and displayed; HAVOC_CREDIT = {}.`,
        verdict: "rejected" },
      { what: "Crediting fumblesFUM as a forced fumble",
        result: `Measured before implementing: on a defensive row fumblesFUM is a fumble the
          player COMMITTED. 974 rows carry one, 84% in a game where he also had a return, an
          interception or a recovery, and 455 also carry fumblesLOST. Crediting it would have
          paid a corner for coughing up an interception return. Shipped as recoveries only.`,
        verdict: "rejected" },
      { what: "Modelling NFL departure to fix survivorship in the cohort curves",
        result: `Exactly the shape the disclosure predicted — 22.1% of top-production-decile
          players depart against 0.7% in the bottom half — and it does not help: MAE 8.19 → 8.22
          offence, 8.45 → 8.44 defence, both inside the noise. Shipped anyway, because a
          disclosed limitation with a number beside it is a different thing from one without.`,
        verdict: "shipped" },
      { what: "A placebo that shuffled havoc values but preserved which players got a bonus",
        result: `Scored the same as the real signal, which looked like the real signal failing.
          A placebo must break the selection, not just the values — the finer ablation, holding
          one variable at a time, is what separated them.`,
        verdict: "rejected" },
      { what: "Allocating the line-unit rating back to individual linemen by snaps or starts",
        result: "Would invent per-player variance that does not exist: a team rating with noise on top, wearing a player's name.",
        verdict: "rejected" },
    ],
    measured: [
      { label: "OL agreement with EA CFB 27", before: "−0.274 (negative)", after: "withheld — no per-player rating" },
      { label: "Line unit vs linemen drafted (Spearman)", before: "no such rating", after: "+0.179" },
      { label: "Mean line rating by linemen drafted", before: "—", after: "65.2 none · 70.8 one · 77.1 two" },
      { label: "EA agreement, EDGE", before: "0.5699", after: "0.5822" },
      { label: "EA agreement, DL", before: "0.4766", after: "0.4849" },
      { label: "EA agreement, DB", before: "0.5901", after: "0.6132" },
      { label: "EA agreement, S", before: "0.7219", after: "0.7202 (the one that went down)" },
      { label: "CB instinct p90 (rate saturation)", before: "2.000 against a ceiling of 0.3", after: "0.315" },
      { label: "Recruiting ROI vs class recruiting strength", before: "+0.254", after: "−0.028" },
      { label: "Tests", before: "201 passed", after: "275 passed" },
    ],
    gates: [
      { check: "pytest tests/ -q", result: "275 passed (74 new)" },
      { check: "python scripts/validate_ratings.py --season 2025", result: "every position within bounds; OL reports withheld rather than a bare NaN" },
      { check: "node tools/contrast-check.mjs", result: "all floors green, dark and light" },
      { check: "full recompute 2008–2026", result: "06 → 07 → 10 → 11 → 15 → 16 → 10 (projected) → 13 → 14 → 12" },
    ],
    unfixed: `**Transcription note: v4.3's changelog has no "what this pass did not fix"
      section.** What follows is assembled from what docs/ROADMAP.md listed as open on the same
      date, not from the changelog itself.

      Usage and the defensive rating were left as the headline next phase — our defensive
      ratings order draft picks at 0.13–0.25 against 0.42–0.49 for offence, and the v4.3
      defensive work was described as a floor rather than a fix. research_cache was empty, so
      Published Findings showed its empty state permanently. team_advanced_games.json was
      harvested at 107 MB and read by nothing. player_seasons.year was still exported as a class
      year by script 12 despite not being one. Projections still overstated stability at the
      very top: 60% of 90+ players projected to decline against 86% who actually do.`,
    methods: ["ol", "defense", "secondary", "specialists", "research-draft", "research-coaching",
              "research-recruiting-roi", "research-uncertainty", "team-ratings"],
    files: ["utils/line_unit.py", "utils/shrinkage.py", "utils/coaching.py", "utils/draft.py",
            "scripts/09_harvest_supplemental.py", "scripts/validate_vs_draft.py",
            "scripts 06, 07, 10, 12, 13, 14, 15", "js/methods.js", "js/findings.js"],
  },

  {
    id: "v3.3-ratings",
    version: "v3.3",
    date: "2026-08-12",
    title: "The ratings themselves, and the players they were dropping",
    summary: `A position-by-position recalibration against EA CFB 27 as an external reference,
      an additive coverage credit for the secondary, projections split by position family with
      the offensive line no longer projected at all, and the recovery of players whose season
      aggregate the API never wrote.`,
    motivation: `EA CFB 27 gave the first external cross-section the ratings had ever had, and
      it showed the distribution was wrong in different directions at different positions:
      receivers far too low in the middle, the secondary at less than half the number of high
      ratings it should have, and punters 38× too generous.`,
    did: [
      { what: "Coverage denial credited additively for CB/S/DB",
        why: "A corner's best games leave no trace because quarterbacks stop throwing at him. def_context_modifier already knew which defences were good, but it multiplies, and 1.1 × a suppressed composite is still suppressed.",
        cost: "It is a team proxy standing in for an individual measurement, and will stay one — targets allowed do not exist in any source." },
      { what: "Pass denial measured against the offence actually faced",
        why: "Raw YPA allowed cannot separate a defence that shut down good passing teams from one that drew a soft schedule. Each game is compared to what that offence does in its other games, attempt-weighted across the season." },
      { what: "A defensive back's overall IS his three archetypes",
        why: "So the number equals the sub-ratings printed beside it.",
        cost: "Stated in the same breath: this costs accuracy. Spearman against EA goes 0.660 → 0.655 in 2025 and 0.555 → 0.540 in 2024. Bought deliberately for interpretability." },
      { what: "Opportunity modelling for offensive skill projections",
        why: "What a player did only predicts what he'll do once you know he'll get the ball. Players with the job wide open (>35% of production departing ahead of them) went 599 → 820 yards and +1.7 OVR; players with nothing ahead of them went 1,080 → 1,022 and −2.6." },
      { what: "2,902 offensive line projections deleted rather than shown",
        why: "We do not project what we cannot measure." },
      { what: "utils/stat_agg.py — rebuild a season aggregate from game rows when the API never wrote one",
        why: "~350–465 player-seasons a year had a full set of game rows and no aggregate, and rating inner-joined on that row. Jayden Virgin-Morgan played four seasons at Boise State with 12–14 game rows each and was rated in none of them." },
    ],
    tried: [
      { what: "A multiplicative coverage credit, and several credit magnitudes",
        result: "Tuned against EA: none 0.6386, ×3 0.6570, ×4 0.6576 (peak), ×8 0.6521 — shipped at ×3.5. The placebo, crediting randomly chosen defences the same amount, scored 0.6293, below not crediting at all.",
        verdict: "shipped" },
      { what: "Judging coverage by raw YPA allowed",
        result: "It could not separate shutting down good passing offences from drawing a soft schedule. Replaced by shortfall against what each offence does in its other games; within-position agreement with EA rose in every season tested (2025 .6507 → .6588, 2024 .5357 → .5421, 2023 .2756 → .2818).",
        verdict: "rejected" },
      { what: "Keeping a flat composite for the secondary instead of the archetype weighting",
        result: "Scores 0.005–0.015 Spearman better. The archetype version was shipped anyway and the cost published, because the overall now equals the sub-ratings shown beside it.",
        verdict: "rejected" },
    ],
    measured: [
      { label: "Punters rated 85+", before: "38", after: "2 (EA has 1)" },
      { label: "Kickers rated 85+", before: "17", after: "4 (EA has 5)" },
      { label: "Secondary rated 85+/90+", before: "53 / 15", after: "closer to EA's 113 / 24" },
      { label: "Offensive skill projections, holdout MAE", before: "9.10 naive", after: "8.17 model, 80.6% interval coverage" },
      { label: "Defensive projections, holdout MAE", before: "9.63 naive", after: "8.45 model, 78.8% coverage, shipped marked low confidence" },
      { label: "Secondary Spearman vs EA, cost of the archetype split", before: "0.660", after: "0.655" },
    ],
    gates: [
      { check: "pytest tests/ -q", result: "recorded in the changelog as passing; count not stated" },
      { check: "hard projection gates", result: "each family beats naive carry-forward; 80% intervals cover 78.8–80.6%" },
    ],
    unfixed: `The earned OL rating is still 77% recruiting — only the projection was withdrawn
      (v4.3 withdrew the rating itself). Defence has no opportunity signal: there are no touches
      to count. Projections still overstate stability at the very top — 60% of 90+ players are
      projected to decline and 86% actually do, because cohort curves condition on "stayed in
      college". We hold one season of EA data, so nothing EA-based can be backtested until
      CFB 28 exists. Pre-2016 defensive ratings remain recruiting-caliber estimates: no hurries
      or pass breakups exist before 2015.`,
    methods: ["secondary", "specialists", "projection"],
    files: ["scripts 06, 07, 12, 15, 16", "utils/stat_agg.py", "js/playerSearch.js", "js/ui.js"],
  },

  {
    id: "v3.2-projections",
    version: "v3.2",
    date: "2026-08-10",
    title: "2026 as a real season, and projections that explain themselves",
    summary: `The projection engine was rebuilt on career EDGE curves plus cohort development,
      2026 became a real projected season across the whole app, and every projection began
      shipping with drivers, a plain-English explanation and historical comparables.`,
    motivation: `The old model said 100% of 90+ players would get worse, against an actual 88%,
      and 0% of players in the 40–45 band would decline, against an actual 6%. It barely earned
      its keep either: naive next = current scored MAE 9.3 and the old model about 9.`,
    did: [
      { what: "Engine D rebuilt on career EDGE curves + cohort development, variance-calibrated",
        why: "MAE 8.24 against naive carry-forward at 9.32 on an untouched 2023–24 holdout, with 80% intervals covering 79.8%.",
        cost: "Two hard gates now fail the build: MAE must beat naive carry-forward, and interval coverage must hold." },
      { what: "Every projection ships drivers, an explanation and comparables",
        why: "A projection nobody can interrogate is an assertion." },
      { what: "Provenance made structural — ovrPill() derives the projected treatment from the season",
        why: "With 2026 as the app's default season, 'the caller remembered to pass projected: true' is not a strong enough guarantee. One missed call site presents model output as an earned rating." },
    ],
    tried: [
      { what: "An alternative projection formulation scoring MAE 9.4",
        result: "Worse on both axes — MAE 9.4 and 24.9 points of decline-rate error — so it was dropped in favour of the career-curve model.",
        verdict: "rejected" },
    ],
    measured: [
      { label: "Holdout MAE", before: "9.3 naive / ~9.0 old model", after: "8.24" },
      { label: "90+ players projected to decline", before: "100% (actual 88%)", after: "closer to base rate, still overstated" },
      { label: "40–45 players projected to decline", before: "0%, mean +12.8 (actual 6%)", after: "corrected" },
      { label: "Tests", before: "79 passed", after: "104 passed" },
    ],
    gates: [
      { check: "pytest tests/ -q", result: "104 passed (79 existing + 25 new contract and model tests)" },
    ],
    unfixed: `Projections still overstate stability at the very top — 60% projected to decline at
      90+ against an actual 86% — a consequence of variance inflation, and stated in the UI. Our
      OL projections and EA's disagree systematically, because we grade linemen through team
      proxies and EA grades individuals. players_{season}.json is still ~8 MB and the slim-grid
      split remains deferred. Research pages, storyline drill-downs, the playoff model, NIL and
      headshots are all deferred by explicit decision.`,
    methods: ["projection", "mickey"],
    files: ["scripts/15_predict_trajectories.py", "scripts/16_project_ratings.py",
            "js/config.js", "js/ui.js", "season2026.html"],
  },

  {
    id: "v3.1-redesign",
    version: "v3.1",
    date: "2026-08-10",
    title: "The visual rebuild — a readable light/dark theme system",
    summary: `A token system with two themes, a dead-CSS purge, component consolidation, and a
      contrast checker that fails the build. The starting point was measured, not asserted:
      muted text sat at 4.1–4.5:1 on dark surfaces, borders at 1.1–1.26:1, and position colors
      were defined in both js/config.js and CSS :root, already diverged.`,
    motivation: `Contrast failures on real content — --text-dim was rendering at 1.6–1.9:1,
      effectively invisible — plus palette drift (six ambers, six greens) and component
      duplication (five table styles, three tab systems, six chip radii).`,
    did: [
      { what: "Token system with dark and light themes, applied before first paint by shell.js",
        why: "--text-muted went from 4.1:1 to 7.1:1 dark and 7.5:1 light; --border from 1.1:1 to 1.85:1." },
      { what: "Domain palettes live only in js/config.js",
        why: "They had been defined in two places and had already diverged. Any JS that computes a color repaints through onThemeChange() or it goes stale on switch." },
      { what: "tools/contrast-check.mjs, exiting non-zero on failure",
        why: "Text ≥7:1, muted ≥4.5:1, borders ≥1.8:1, --border-strong ≥3:1, every rating and position fill ≥3:1 against its guarded text." },
      { what: "Dead CSS purged and components consolidated",
        why: "About 86% of 2,177 CSS lines was legacy and ~600 lines had no consumers at all.",
        cost: "CSS 2,177 → 1,446 lines (−34%)." },
    ],
    tried: [
      { what: "Transcription note: v3.1's changelog records phases and fixes, not rejected alternatives",
        result: "Seven phases each landed. The only recorded reversals are the six screenshot defects found during acceptance and fixed in Phase 7; no alternative approach is documented as having been built and dropped.",
        verdict: "shipped" },
    ],
    measured: [
      { label: "--text-muted contrast", before: "4.1–4.5:1 (fails WCAG AA)", after: "7.1:1 dark / 7.5:1 light" },
      { label: "--border contrast", before: "1.1–1.26:1", after: "1.85:1 dark / 2.2:1 light" },
      { label: "CSS lines", before: "2,177", after: "1,446" },
      { label: "Sub-12px font sizes", before: "many, mostly --text-muted at 11px", after: "0" },
      { label: "Color literals in js/ outside config.js", before: "several", after: "0" },
    ],
    gates: [
      { check: "node tools/contrast-check.mjs", result: "green, both themes, tokens + palettes" },
      { check: "node --check on all 11 JS files", result: "pass" },
      { check: "screenshots, 7 pages × 2 themes @1440", result: "inspected; 6 defects found and fixed" },
      { check: "pytest tests/ -q", result: "79 passed (pipeline untouched by this work)" },
    ],
    unfixed: `players_{season}.json is still 8.3 MB and loaded by home, players and ratings — the
      slim grid export is pipeline work. info.html prose still predates Engine D, EDGE
      percentiles and the '26 hub. Research aggregates still do not drill down to named rows,
      which needs per-recruit exports. rosters.json (59 MB) and schedules.json (14 MB) remain in
      the repo, unfetched by any code.`,
    methods: [],
    files: ["css/styles.css", "css/components.css", "js/config.js", "js/shell.js", "js/ui.js",
            "tools/contrast-check.mjs"],
  },
];
