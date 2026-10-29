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
    id: "v4.20-live-adjustment-fcs-qb-and-results",
    version: "v4.20",
    date: "2026-10-29",
    title: "Live player ratings get their opponent adjustment back, FCS games count at 0.85, quarterbacks are scored on efficiency as well as volume, the roster is scored by starters and depth, and the team headline reads results",
    summary: `The owner said the 2026 team ratings were still off (Kansas State 11th and Nebraska 7th too high, Kentucky 40th and 7-1 too low), asked that mid-season grades be a scale for the games played and not a shrink,
      named four quarterbacks (Atkinson, Mensah, Madsen, Minchey) as rated below their efficiency and impact, set FCS games at a flat 0.85, and asked for a new roster formula (named starters and depth, light kickers) and a new overall formula.
      Looking for the cause turned up a defect: the live 2026 player ratings had no opponent adjustment at all. That is fixed first; everything else is measured on top of it.`,
    motivation: `Kansas State is 4-3 with a points strength of 40th and Kentucky is 7-1 and 20th, yet the headline had them 11th and 40th. The headline used no result at all, and the player ratings it was built on were adjusted for nobody. The owner also did not want preseason numbers
      to drive any live rating, because the point is to show how wrong preseason is: nothing here reads a preseason or last-season rating (the live overall regressed on points strength and preseason gives 0.394 per point of strength and -0.035 for preseason).`,
    did: [
      { what: "The live opponent map is no longer empty (scripts/06_compute_edge_scores.py build_opponent_map, current_conferences)",
        why: `team_records is harvested after a season, so it has no 2026 rows; build_opponent_map(2026) therefore returned {} and opponent_multiplier returned 1.0 for every game: no credit for a hard schedule, full credit for an FCS opponent, for every live player.
          Proof: Kenny Minchey recomputed with a multiplier of 1.0 gives 80.2, identical to the live file; with our own opponent strengths his games against Alabama, LSU, Oklahoma and Texas A&M count 1.53 to 1.63 and he rates 84.8. Script 10 had always fallen back to current conferences; script 06 now does too, but only when the season has no records at all,
          so a finished season (where a team that was FCS then is correctly not an FBS opponent) is untouched. Alone this moved 2026 team ratings by 0.9 on average (Kentucky 40th to 32nd, Kansas State 11th to 14th, Nebraska 7th to 10th, Boise State 23rd to 33rd).`,
        cost: "Finished seasons are unchanged by this step (the fallback is used only with no records). The 2026 numbers published through v4.19 were built without it." },
      { what: "FCS games count at a flat 0.85 for every position and both sides of the ball (OPP_FCS_MULT; scripts/validate_fcs_weight.py)",
        why: `The owner's setting. It replaces the pooled FCS team's strength read through the FBS curve (about 0.76 in a finished season, 1.0 live). Measured on 157,491 offensive player-games 2016-2025, the same players against FCS and FBS opponents: per-game production against FCS is 1.13 times that against FBS (QB 1.10, RB 1.24, WR 1.10, TE 1.07), so the multiplier that equalises them is 0.88; a placebo that relabels the same number of each player's games as FCS gives 1.003.
          Once the FBS games carry their own strength multiplier the equalising value is 0.95, so 0.85 is more severe than the data ask for; the old 0.76 was more severe still (adjusted FCS/FBS ratio 0.808, now 0.892, 1.050 at 1.0).`,
        cost: "Changes finished seasons (0.76 to 0.85): 49-75% of non-QB player-seasons move, the median by 0.02 rating points, the 95th percentile by at most 0.28, the largest by 1.65. Defense is not measured separately; the constant is applied to it on the offensive evidence." },
      { what: "Quarterbacks are scored on half volume, half efficiency (QB_EFFICIENCY_BLEND, QB_ATT_REF, QB_ATT_FLOOR; scripts/validate_qb_composite.py)",
        why: `A QB's game score was yards plus 25 per touchdown minus 20 per interception, so a 400-yard game from 55 attempts beat a 280-yard game from 25. The score is now half that and half the same score restated at the median 28 attempts (attempts floored at 10).
          Judged on held-out data only: 824 QB-seasons 2017-2025, features from the games through week 8, outcome his offense's points over expectation after week 8, last season's team offense as the control, leave-one-season-out. R2 0.3766 today, 0.3905 at a quarter efficiency, 0.3970 at half, 0.3916 at three quarters, 0.3776 all efficiency; a placebo that shuffles attempts across games 0.3608 (worse than today). Efficiency alone 0.2015 against volume alone 0.1813.
          Doubling the interception weight moves nothing (0.3985). Points scored while he played (the impact term) predicts best of all (0.4687 alone) but is the team's offense, so it was rejected as a player input.`,
        cost: "Changes every QB in every season: 98% of QB player-seasons move (mean +0.65, 5th percentile -2.25, 95th +4.56, range -8.8 to +14.9). High-volume passers lose: QBs rated 90+ went 12 to 6 in 2022 and 6 to 4 in 2025 (7 to 7 in 2019). The gain in held-out R2 is 0.020, real against the placebo and small." },
      { what: "A games SCALE for the mid-season grade, not a shrink (06 pace_factor_for, 07 apply_games_confidence)",
        why: `The pace step is now sqrt(scheduled / completed) times a calibration by the share of his team's games he played (four constants, refit 0.893 / 0.954 / 0.990 / 1.006), with the pull toward the position mean removed. Fitted on 2021-2025 cut after weeks 4, 6, 8 and 10, 86,707 player-cuts, leave-one-season-out, error in rating points: MAE 4.789 against 4.866 for the v4.19 rule and 4.838 for sqrt(r) alone; average miss +1.31 against +1.93.
          Position family and cut week add under 0.02 of MAE and are not in the scale. Script 07 had a second games step, a pull toward the position average of max(0.25, games/8) with a cliff at 8 games; in a season in progress it now reads the share of his team's games he played, on the 12-game scale it was written on, so a quarterback who started all 7 of his team's games is a full-timer at week 8 (before: damped to 0.875) and a bye does not cost a team. Finished seasons are unchanged.
          Result: the live rating distribution now looks like a final one. QB: 85+ is 16.6% of rated players against 13.2% in the 2025 final (it was 3.0%), 90+ is 2.1% against 1.3% (0.0%), spread 11.9 against 11.5 (8.9). WR 85+ 10.9% against 9.9% (3.8%), EDGE 10.4% against 10.4% (5.4%).`,
        cost: `Without the pull toward the mean, a 7-game player rated 85 or more finishes on average 1.60 rating points lower than the scale says (0.59 with the pull), because the best part-season performers regress; below a rating of 60 the scale is 4.65 too low (4.21). The live spread is a little wider than a final one (CB 14.7 against 12.8, DL 12.1 against 10.5).` },
      { what: "The roster is scored by named starters and depth, kickers light (script 10 SLOT_STARTERS, SLOT_DEPTH, STARTER_SHARE, SLOT_WEIGHTS, group_scores, slot_score)",
        why: `Starters QB 1, RB 2, WR 5, TE 1, DL 4 (DL and EDGE pooled by rating), LB 4, DB 6 (CB, S and DB pooled), the offensive line as the line unit, one K and one P; depth QB 2, RB 3-4, WR 6-8, TE 2-4, DL 5-7, LB 5-7, DB 7-10. A group scores 0.85 x its starters + 0.15 x its depth (0.80 and 0.90 give the same fit, 0.880 / 0.881 / 0.881), and every rated player counts, not only those at 55 or more (0.881 at floors 0 and 40, 0.880 at 55).
          The position-weighted half is dropped from the roster reading: the line unit is now a group of its own, so the half counted it again, and the slot score alone scores 0.834 against 0.815 for the 60/40 mix (same-season Spearman with points strength; 0.623 against 0.607 on the next season).
          Group weights (sum 1): QB .139, RB .091, WR .087, TE .029, OL .101, DL .131, LB .144, DB .252, K .012, P .015, which is half the weights fitted by non-negative least squares and half one weight per starter slot. Measured, same-season / next-season Spearman with points strength: weights and layout through v4.19 0.876 / 0.646; v4.20 layout fitted 0.881 / 0.657 (0.878 leaving each season out); football prior 0.745 / 0.554; equal per starter 0.742 / 0.560; fitted + equal 0.834 / 0.623; fitted + prior 0.834 / 0.617.
          Why the fit looks odd: it gives the defensive backs 0.296 and the receivers 0 because a DB rating carries the most team-quality information per point and a WR rating overlaps the QB's, which is not how much a position matters.`,
        cost: "The explainable half-and-half mix scores 0.047 below the pure fit in the same season and 0.034 on the next. The football prior and equal-per-starter weights cost 0.14 and are rejected. The fit is information about team quality, not football value." },
      { what: "The headline reads three things: roster 0.30, team stats 0.20, results 0.50 (script 10 W_ROSTER_BLEND, W_STATS_BLEND, W_RESULTS_BLEND; scripts/validate_team_overall.py)",
        why: `Results are the opponent-adjusted points a team has scored and allowed (utils/opponent_strength.team_strength) through the absolute SP_OVERALL_ANCHORS, with offense and defense read the same way. Each reading's Spearman with the NEXT season's points strength, 1,306 team-seasons: roster 0.623, stats 0.686, results 0.731; the old 60/40 blend 0.670. In a season in progress the points so far predict the games after the cut at R2 0.50 / 0.53 / 0.51 / 0.49 (cuts after weeks 4 / 6 / 8 / 10) against 0.37 / 0.34 / 0.31 / 0.29 for last season's roster, and carry 0.52 to 0.64 of the weight of [results so far, last season's roster, last season's strength].
          The best blend on a grid is nearly all results (0.731), which would stop saying what the roster and the box score show, so the rule is stated: every reading keeps at least a fifth, results get the most, the blend stays within 0.02 of the best. 0.30 / 0.20 / 0.50 scores 0.716 (0.046 above the old blend). Power keeps its meaning: its rating part is the old roster-and-stats "play" rating, so the results are not counted twice.
          A team with games but no roster rating and no team stats still gets no row (results alone do not rate a team).`,
        cost: `A rating that leans on results describes what a team has done more than what it is made of, and the stats half is 0.94 correlated with the results reading. The headline moves for history: 2,309 finished team-seasons change by -3.80 on average (standard deviation 3.61, 5th percentile -9.9, 95th +2.3, range -19.4 to +14.0), the 2025 mean falls from 78.6 to 75.0 because an average team is 72.7 on the results anchors and 79.0 on the roster ones, and the within-season order keeps a Spearman of 0.887 with the old one (lowest season 0.715).` },
      { what: "Where the cases land, reported and not tuned to (live, through week 8 of 2026, overall rating and rank, before -> after)",
        why: `Kansas State 84.5 (11th) -> 82.6 (27th): roster 87.3 (6th), stats 85.5 (11th), results 78.6 (40th); power 58th. Nebraska 85.3 (7th) -> 84.7 (17th): roster 86.4 (9th), stats 86.8 (8th), results 82.7 (26th); power 19th. Kentucky 80.2 (40th) -> 83.0 (24th): roster 86.3 (10th), stats 76.7 (55th), results 83.6 (20th); power 14th. Boise State 82.0 (23rd) -> 79.0 (44th). LSU 90.2 -> 92.6, still 1st.
          Players: Atkinson 86.8 -> 87.5, Mensah 85.2 -> 91.0, Madsen 78.2 -> 82.2, Minchey 80.2 -> 86.2. QBs at 90+ went 0 to 5 and at 85+ 7 to 39 of 369. Only Notre Dame from outside the SEC, Big Ten, Big 12 and ACC is in the top 25 or the top 40. The headline correlates 0.987 with points strength and 0.933 with power. 66 of 138 teams move 10 or more places, the mean falls 76.8 to 74.8.`,
        cost: "Kansas State is still 27th, not about 50th: its roster reading is 6th, because its players are rated well, and its stats are 11th. Nebraska (17th) is still above Kentucky (24th), against the owner's read. Neither was tuned for." },
    ],
    tried: [
      { what: "Delete the games damp in script 07 outright",
        result: "For 19,364 player-seasons of 3-7 games in finished seasons the damp moves ratings +6.2 on average and predicts the next full season better than no damp (MAE 13.3 against 17.4). It helps below a rating of 55 (bias +13.7 against +24.6) and hurts at 70 and above (70-80: MAE 9.74 against 7.12, bias +6.9 against +2.6; 80+: 7.73 against 6.19, +3.7 against -1.3). So it stays for finished seasons and reads the share of team games in a season in progress.",
        verdict: "rejected" },
      { what: "Refit the pace calibration by position family and cut week",
        result: "MAE 4.827 (family), 4.786 (family x share), 4.775 (family x share x cut) against 4.789 for share alone: under 0.02, and the top tier gets no better.",
        verdict: "rejected" },
      { what: "Keep the v4.16 shrink toward the position mean with the owner's scale",
        result: "Better at the top tier (85+ miss -0.59 against -1.60) but worse overall (MAE 4.866 against 4.789) and a shrink, which the owner did not want.",
        verdict: "rejected" },
      { what: "A uniform games ramp toward the league mean for the team stats half (0.78 to 0.58 or 0.47 at 7 games)",
        result: "Lowers every rating and leaves the order unchanged (Kansas State 11th to 10th, Nebraska 7th to 7th, Kentucky 40th to 34th). A scale toward the mean cannot reorder teams.",
        verdict: "rejected" },
      { what: "Shrink toward a team's or player's preseason or last-season rating",
        result: "Would have been a more accurate prior but makes the live rating depend on preseason numbers, which the owner is testing; nothing reads one.",
        verdict: "rejected" },
      { what: "Points scored while a QB played (impact) as a QB rating input",
        result: "Held-out R2 0.4687 alone, 0.4979 with the control, but it is his offense's points, not his own; it would turn QB ratings into team ratings and make the roster reading partly a result.",
        verdict: "rejected" },
      { what: "The position-weighted composite as 40% of the roster reading",
        result: "0.815 against 0.834 for the slot score alone (the line unit is now in the slot score and was counted twice).",
        verdict: "rejected" },
      { what: "Football-prior or equal-per-starter group weights alone",
        result: "0.745 and 0.742 against 0.881 for the fitted weights, same season.",
        verdict: "rejected" },
      { what: "A headline that is results alone",
        result: "Best next-season Spearman (0.731), but it would drop the roster and the box score from the rating and duplicate power.",
        verdict: "rejected" },
    ],
    measured: [
      { label: "Kenny Minchey, live rating", before: "80.2 (multiplier 1.0 for every game)", after: "84.8 with the opponent map alone, 86.2 with everything" },
      { label: "Live QBs rated 90+ / 85+ of 369", before: "0 / 7", after: "5 / 39" },
      { label: "Live QB 85+ share (2025 final: 13.2%) and spread (11.5)", before: "3.0% and 8.9", after: "16.6% and 11.9" },
      { label: "Pace scale, rating points: MAE / average miss / miss for a model rating of 85+", before: "4.866 / +1.93 / -0.59", after: "4.789 / +1.31 / -1.60" },
      { label: "QB blend, held-out R2 of his offense's later points over expectation", before: "0.3766", after: "0.3970 (placebo 0.3608)" },
      { label: "FCS adjusted production, FCS games over FBS games (1.0 is even)", before: "0.808 finished / 1.050 live", after: "0.892" },
      { label: "Roster reading, Spearman with the same / next season's points strength", before: "0.876 / 0.646 (v4.19 layout and weights)", after: "0.834 / 0.624 (v4.20, half fitted, half per slot)" },
      { label: "Headline, Spearman with the next season's points strength", before: "0.670", after: "0.716" },
      { label: "Finished team-seasons, headline change", before: "-", after: "mean -3.80, sd 3.61, range -19.4 to +14.0; order kept at Spearman 0.887" },
      { label: "Finished player-seasons changed (149,657)", before: "-", after: "QB 98% (mean +0.65), other positions 49-75% (median 0.02, max 1.65); 0 basis changes" },
      { label: "Defensive-back archetype scores 2023-2025 after the FCS change (ARCHETYPE_SCALE inputs; ball hawk / coverage / run support)", before: "means 3.854 / 2.485 / 4.426; at the 20 cap 80 / 49 / 25 of 5,932", after: "means 3.873 / 2.494 / 4.446; at the cap 82 / 50 / 26: the scale is left as it is" },
      { label: "Power backtest (validate_rankings.py): winner / margin error", before: "71.3% / 13.27", after: "71.5% / 13.24" },
      { label: "Rating alone, last season (same backtest)", before: "63.2% / 15.11", after: "64.5% / 14.81" },
      { label: "Projection gates: offense / defense model error against naive, interval coverage", before: "8.18 vs 9.08, 79.0% / 8.39 vs 9.58, 76.8%", after: "8.06 vs 9.01, 78.6% / 8.42 vs 9.59, 78.0%" },
      { label: "Kansas State / Nebraska / Kentucky, rank by rating", before: "11 / 7 / 40", after: "27 / 17 / 24" },
      { label: "Pipeline tests", before: "494 passed, 1 failed", after: "534 passed, 1 failed (see unfixed)" },
    ],
    gates: [
      { check: "pytest tests -q", result: "534 passed, 1 failed: the export-contract check that recruiting-basis rows are at least 5% of rated rows (392 of 8,369 rated 2025 rows are recruiting-based, 4.7%, against a floor of 5%), the same failure as v4.19, deliberately not edited" },
      { check: "python scripts/validate_ratings.py --season 2025", result: "exit 0; QB 438 rated, mean 64.8, 90+ 4; EDGE 13 at 90+, DB 21" },
      { check: "python scripts/validate_rankings.py", result: "power 71.5% / 13.24; rating alone 64.5% / 14.81; placebo 59.8% / 15.99; rating slope 1.034 against BETA 0.98 (5.5% drift)" },
      { check: "python scripts/validate_reliability.py / validate_vs_draft.py", result: "gate pass at every position (QB 0.607 of the ceiling, EDGE 0.742, DB 0.720); draft bands monotone 66.8% / 31.8% / 13.6% / 5.1% / 3.8% / 1.8%" },
      { check: "projection gates (script 15 --retrain)", result: "both families beat naive; coverage 78.6% / 78.0% of an 80% target; distribution gate passed" },
      { check: "validate_fcs_weight.py, validate_qb_composite.py, validate_pace_scale.py (numbers in this entry), validate_team_roster.py, validate_team_overall.py, validate_low_game_weights.py", result: "all exit 0; the v4.19 low-game weights are within 0.006 of a refit on the new ratings" },
      { check: "recompute 06 and 07 for 2008-2025, then 10 --all-seasons, 15 --retrain, 16, 10 --engine projected, 13, 14, 17 (offline), 12", result: "0 requests (no GET line in any log; the live chain ran with a dead proxy so a cache miss could not reach the API)" },
      { check: "UI smoke / node --check / doc, prose and theme checks", result: "148 of 148 / clean / 194 of 194, clean, pass" },
    ],
    unfixed: `**One contract test still fails and was not edited:** the check that recruiting-basis rows are at least 5% of rated rows (4.7% against 5%); the fix, counting recruiting and low-game blended rows together, needs the owner's go-ahead.
      **Kansas State is 27th and Nebraska is above Kentucky.** Their roster readings are 6th, 9th and 10th because their players are rated well; the results reading puts them 40th, 26th and 20th. Fixing the order further means changing a reading, not a weight, and was not done for three teams.
      **The headline level moved:** the 2025 mean falls from 78.6 to 75.0 (an average team is 72.7 on the results anchors) and the Spearman with the old order is 0.887, lowest 0.715. Re-centring the results anchors would keep the old level; it was not done because the anchors are absolute.
      **The conference gap widened:** SEC, Big Ten, Big 12 and ACC minus the rest is 11.6 headline points in 2026 (roster 6.7, stats 12.5, results 14.2); the earlier measure of what games imply was 7.5, so the headline may over-separate.
      **The pace scale over-rates the best 7-game players by 1.6 points on average** (the cost of no shrink), and under-rates those below 60.
      **The games damp over-penalises finished-season part-timers rated 70 and above** (bias +6.9 at 70-80 against +2.6 without it); finished seasons were left alone, and that is a separate pass.
      **FCS 0.85 is harsher than the data** (0.88 raw, 0.95 once FBS games are adjusted) and defense is not measured on its own. **Per-game yards are not on file,** so the stats half cannot be backtested at the week-8 cut. **The 2026 team numbers are provisional** (7 or 8 games), the roster reading at week 8 cannot be backtested (no historical cut ratings), and the weights come from finished seasons.
      **Script 11 was not rerun** (recruiting only, unchanged inputs). **Everything is uncommitted** in both repositories.`,
    methods: ["team-ratings", "opponent-strength", "live-season", "qb-composite", "power-rating"],
    files: ["scripts/06_compute_edge_scores.py", "scripts/07_compute_player_ratings.py", "scripts/10_compute_team_ratings.py", "utils/opponent_strength.py", "scripts/validate_fcs_weight.py", "scripts/validate_qb_composite.py", "scripts/validate_pace_scale.py", "scripts/validate_team_roster.py", "scripts/validate_team_overall.py", "tests/test_player_inputs_v420.py", "tests/test_slots_and_pace.py", "tests/test_team_ratings.py", "js/methods.js", "js/changes.js"],
  },

  {
    id: "v4.19-low-game-players-and-why-kansas-state-rates-high",
    version: "v4.19",
    date: "2026-10-29",
    title: "Players with one or two games get a small, capped rating; and a written account of why Kansas State and Nebraska rate high",
    summary: `Two requests. First: a player who shone in a few moments (a rotation player, or one who was hurt) should count, without being overrated and with a ceiling.
      Players under the 3-game line were rated from their recruiting grade alone. They are now rated from the recruiting grade plus what they did, weighted by games and counted events, capped at 72,
      and the card says how many games the number is built on. Second: an explanation, with no change to any team rating, of why Kansas State and Nebraska rate so highly; it is recorded below because the site should be able to say it.`,
    motivation: `v4.18 left Kansas State in 11th and Nebraska in 7th by rating, and the owner asked how, given the rosters and results. The owner also asked for low-snap players to be involved.
      The evidence on the second was weak (a short stretch predicts the next season only a little), so the rule is small by design.`,
    did: [
      { what: "Low-game players are rated (script 06 keeps edge_all; script 07 low_game_rating; LOW_GAME_WEIGHT, LOW_GAME_CEILING)",
        why: `rating = recruiting prior + w x (R_edge - the mean R_edge of low-game players at his position and games), between 30 and 72. R_edge is the full-season anchors on sum / sqrt(games), so the game count is already in the number;
          w is 0.115 / 0.175 (one game, quiet / busy) and 0.173 / 0.209 (two games), busy meaning 4 or more counted events. The weights are the slope of the player's earned rating the next season on his R_edge, from 5,621 low-game player-seasons 2016-2025
          who earned one (scripts/validate_low_game_weights.py): 0.139 with one game, 0.197 with two, 0.085 to 0.194 from the quietest to the busiest quartile; a shuffled-R_edge placebo gives 0.011. Cross-validated, one weight of 0.167 and the four cells score
          the same (8.444 and 8.443 against 8.550 with no stretch information), so the cells are a monotone summary of games and volume, not extra precision. Recruiting stars add nothing once the stretch is known (coefficient -0.056) but stay as the level,
          so a typical low-game player does not move. 20,055 player-seasons 2008-2025 changed, every one a low-game player (median -0.4, 95th percentile +2.8, largest +9.6); the other 132,504 did not move.
          In 2026 through week 8, 2,115 players are newly rated (1,326 on one game, 789 on two; mean 47.9, highest 69.4, 529 at 55 or more), 118 already rated on one or two games moved by up to 5.3.`,
        cost: `A short stretch is weak evidence, so the effect is small: 20 points above his peers is worth 2.3 to 4.2 rating points, and the cap rarely binds. The weights come from the third of low-game players who later earned a rating.
          The tier blend that used to follow (a bench-tier player returned to recruiting alone) is skipped for these players. Team ratings moved little: 111 of 138 teams in 2026, mean +0.05, largest 1.27.` },
      { what: "The player card states the game count (js/menuCard.js menuLowGameLine)",
        why: "A card for a player rated on one or two games says so: how many games, that his stretch moves a recruiting-based start only a few points, and that a rating from so few games is capped well below a star's. The old to-date line, which described a scaled full-season production score, would have been wrong for him. A smoke check opens such a card. Nothing says provisional in that line; the to-date pill on every live number still says so, as it did.",
        cost: "No new markup: one line in the existing why block." },
      { what: "Explained, with no change: why Kansas State (84.5, 11th) and Nebraska (85.2, 7th) rate highly through week 8 of 2026",
        why: `Headline = 0.60 roster + 0.40 stats. Kansas State: roster 84.1 (6th) and stats 85.3 (11th); against the league mean of 76.7 the stats half is worth 4.7 points, the starters' slot score 1.1, the position-weighted half 1.7 (line unit 0.7, special teams 0.3). Their starters rank 21st (slot score 74.25, league 71.9, sd 2.2; the roster scale turns one player point into 1.33 team points: 83.0). The position-weighted half ranks 3rd: a line unit of 87 (raw; 82.7 after the part-season shrink) from five short-sample line measures,
          special teams of 84.8 (a punter at 87.1 and a kicker at 82.4, 2nd of 138) and four edge rushers rated 88, 80, 78 and 70 filling the front-four slots (8th). The stats half grades 54.5% third-down offense over 7 games at 93, 9.7 sacks plus tackles for loss at 95, 305 yards allowed at 88.7, on full-season anchors; the schedule adjustment adds 0.8 and 2.0, the part-season shrink takes it to 82.9 and 87.7.
          Results: 4-3, losses to Cincinnati (by 5), Houston (19) and Arizona State (11); wins by 68 over an FCS team and 27 over a 1-7 Washington State. Their own points strength is +8.1 per game (40th of 138; z +0.65) against a rating of z +1.48; power puts them 60th.
          Nebraska: roster 84.2 (5th) and stats 86.6 (8th). The slot score ranks 5th on the secondary alone: five defensive backs rated 86, 85, 80, 80 and 79 against a league mean of 72.3, in the group weighted most (0.286), is worth 1.75 of their 3.6 slot points; the offensive line unit (77.7 raw, 41st) and special teams (67.0, 66th) are middling.
          The stats half grades 271 yards allowed at 95, an opponent third-down rate of 19.3% over 7 games at 95 and 9.4 sacks plus tackles for loss at 94. Results: 5-2, losses by 3 to Indiana (9th) and by 3 to Oregon (24th), and five wins over teams ranked 106th, 135th, FCS, 59th and 63rd. Points strength +12.8 (26th; z +1.03) against a rating of z +1.62; power puts them 17th.
          The players are not the bug: among rated players of the same position, rating percentile minus per-game production percentile is 0.0 league-wide (Spearman 0.49 with per-game production, 0.55 with the season total), and +4.8 and +5.2 for these two teams; a 77 is a top-12% player because the rated pool averages 68.5.`,
        cost: "None; nothing was changed. The finding is that the stats half is about 60% of each team's lead over the league mean, and that it and the position-weighted half rest on thin samples of third-down, havoc and line readings graded on fixed anchors." },
    ],
    tried: [
      { what: "Rating a one- or two-game player by the full-season formula alone",
        result: "R_edge averages 39.6 for these players against a recruiting prior of 48.2: the square root of games in the score already counts a short stretch as small, and the formula alone is a worse level than the prior.",
        verdict: "rejected" },
      { what: "Publishing the next-season prediction itself as the rating",
        result: "Players who later earn a rating average 64; it would hand a typical bench player a starter's number.",
        verdict: "rejected" },
      { what: "Labelling the rating provisional",
        result: "The owner asked that it not be; the card states the game count instead.",
        verdict: "rejected" },
    ],
    measured: [
      { label: "Players rated, 2026 through week 8", before: "5,468", after: "7,583 (2,115 newly rated, 529 of them at 55 or more)" },
      { label: "Player-seasons changed, 2008-2025", before: "-", after: "20,055, all low-game; 132,504 unchanged" },
      { label: "Low-game rating, change: median / 95th percentile / largest", before: "-", after: "-0.4 / +2.8 / +9.6 (cap 72)" },
      { label: "Next-season margin error for low-game players, leave-one-season-out", before: "8.550 (no stretch information)", after: "8.444 (one weight) / 8.443 (four cells)" },
      { label: "2026 team ratings", before: "Kansas State 84.51 (11th), Nebraska 85.23 (7th)", after: "84.46 (11th), 85.30 (7th); 111 teams moved, largest 1.27" },
      { label: "Power backtest (validate_rankings.py): winner / margin error", before: "71.3% / 13.27", after: "71.3% / 13.27" },
      { label: "Projection gates: offense / defense model error against naive", before: "8.18 vs 9.08 / 8.39 vs 9.58", after: "8.18 vs 9.08 / 8.39 vs 9.58; coverage 79.0% / 76.8%" },
      { label: "Pipeline tests", before: "482 passed", after: "494 passed, 1 failed (see unfixed)" },
    ],
    gates: [
      { check: "pytest tests -q", result: "494 passed, 1 failed: the check that recruiting-based rows are over 5% of rated rows (only 392 of 8,369 rated 2025 rows are recruiting-based, 4.7%, against a floor of 5%)" },
      { check: "python scripts/validate_low_game_weights.py", result: "shipped weights equal the fitted cells; placebo 0.011 against 0.167; exit 0" },
      { check: "python scripts/validate_rankings.py", result: "power 71.3% / 13.27; rating alone 63.2% / 15.11; placebo 58.2%" },
      { check: "python scripts/validate_ratings.py --season 2025", result: "exit 0; distributions unchanged" },
      { check: "recompute: 06 and 07 for 2008-2025, 10 --all-seasons, 15 --retrain, 16, 10 --engine projected, 13, 14, 17 --season 2026, 12", result: "0 requests (no GET line in any log); projection distribution gate passed" },
      { check: "UI smoke / node --check / doc, prose and theme checks", result: "148 of 148 UI checks pass (147 before, plus the low-game card check; two checks that used a 2-game player as their no-data example now use a player with no games); node --check on every js file clean; doc-check 194 of 194, prose-check and theme-check clean" },
    ],
    unfixed: `**One contract test fails, by design of this change, and was not edited:** the export-contract check on the rating basis expects more than 5% of rated rows to be recruiting-based, a guard that the tier derivation had not silently broken.
      About 19,000 low-game players moved from a recruiting basis to a blended one, so the share is 4.7%. The project rule is never to change a gate in the same commit as the output it judges; the fix is to count recruiting and low-game blended rows together, and it needs the owner's decision.
      **Kansas State and Nebraska are unchanged by this and still rate highly;** the explanation above is the finding, and the next measurements are the thin third-down, havoc and line readings on fixed anchors and the line unit's and special teams' scale (15 and 7.5 points of spread against 2-5 for player terms), not a tuning of either team.
      **The weights come from players who later earned a rating,** a third of the group. **A rating from one or two games is the same small adjustment in a season in progress;** it is not rescaled to a full-season pace. **The to-date pill still says provisional on every live number, low-game players included,** as before.
      **Players with no productive game are still rated from recruiting alone.** **Everything is uncommitted** in both repositories.`,
    methods: ["low-game-players", "player-rating", "team-ratings"],
    files: ["scripts/06_compute_edge_scores.py", "scripts/07_compute_player_ratings.py", "scripts/validate_low_game_weights.py", "scripts/explore_low_game_players.py", "tests/test_low_game_ratings.py", "js/menuCard.js", "js/menuScreensTeam.js", "js/guide.js", "js/methods.js", "tools/ui-smoke/smoke.mjs"],
  },
  {
    id: "v4.18-schedule-adjusted-stats-half",
    version: "v4.18",
    date: "2026-10-29",
    title: "The team rating's stats half is adjusted for the schedule and part-season readings are shrunk, so Group-of-6 teams stop rating like Power-4 teams",
    summary: `The owner looked at the 2026 ratings and said they were off: Nebraska, Kansas State and Boise State too high, Kentucky too low, too many Group-of-6 teams high.
      Taking the rating apart (0.60 roster + 0.40 team stats) put the main cause in the stats half: yards, third downs, sacks and turnovers per game, with no opponent in them.
      A team that piles up yards against weak defenses looked as strong as one that did it against strong ones. The half is now adjusted for the schedule the team faced, from our own opponent strengths.
      A second pass, after the owner pointed at Kansas State's roster and results, shrinks the part-season readings (stats half, line unit) toward the league mean by games played, by the measured slope.
      Kansas State and Nebraska are still in the top 11 after both; that is stated below, not tuned away.`,
    motivation: `v4.17 moved the Power-4 over Group-of-6 gap in the player ratings only from 3.68 to 4.37 of the 7.8 rating points the games imply, and a harsher weak-opponent penalty lowered the next-season fit.
      Nobody had split the team rating into its halves and asked which one carried the compression. This pass does that first and changes only what the numbers point at.`,
    did: [
      { what: "Measured where the Group-of-6 inflation lives, before changing anything",
        why: `Power-4 minus Group-of-6 over the 2015-2025 final seasons, in standard deviations of the season's spread: roster half 0.85, headline 0.64, stats half 0.40, our own points strength 1.26.
          The stats half is the most compressed and carries 40% of the headline. Regressing it on a team's own points strength and on the schedule it faced (both ours, z-scored within the season, 1,310 team-seasons):
          the schedule coefficient is -0.51 on offense (t = -32) and -0.52 on defense (t = -29), so with its own strength held fixed a team that faced one standard deviation tougher schedule (3.3 points per game) looked half a standard deviation worse.
          A Power-4 team faced defenses 5.6 points per game tougher than a Group-of-6 team. Through week 8 of 2026 it matters more: the roster half is shrunk for part-season samples (spread 3.6 against 5.1 in the 2025 finals) and the stats half is not (8.5 against 8.1),
          so the stats half supplies about 71% of the headline's variance instead of 53% (covariance ignored).`,
        cost: "Measurement only." },
      { what: "The stats half moves 1.57 OVR points per point per game of schedule faced (scripts/10_compute_team_ratings.py SCHED_COEF; utils/opponent_strength.schedule_faced)",
        why: `The offense half is moved by the mean defense of the opponents faced and the defense half by the mean offense of the offenses faced, in points per game against an average schedule, from the same strengths that adjust the player ratings.
          A non-FBS opponent is the pooled FCS team. A team with no scored game is not adjusted. The coefficient is the regression's own: offense 1.56, defense 1.68, leaving each season out 1.52-1.71, pooled 1.62; 1.57 ships for both (3% below the pooled value).
          Prior-season quality predicting every later game (week 9 on), 2016-2025, leave-one-season-out (scripts/validate_stats_schedule.py): winner 62.7% with the raw half and with the adjusted half, margin error 15.13 -> 15.02; through power 71.6% / 13.24 -> 71.5% / 13.22.
          The placebo, which deals the schedules to the wrong teams, scores 62.5% / 15.22 and is worse than the real adjustment, so the schedule carries signal. Power-4 minus Group-of-6 in the headline: 3.63 -> 7.09 rating points (1.06 sd); the games imply 7.55.`,
        cost: `Accuracy is unchanged, not improved: winner picks equal, margin error better by 0.11 in the like-for-like test; the shipped power backtest reads 71.3% / 13.27 against 71.7% / 13.29 before (0.4 points fewer winners, inside the noise of 2,858 games).
          The top SEC teams rise (LSU 89.0 -> 92.0, Alabama 80.8 -> 85.9, Texas 81.0 -> 86.1) because their raw yards understated a hard schedule; the headline's spread across teams grows from 5.3 to 6.1. The strengths are made from points, so the stats half now leans on results a little.` },
      { what: "Part-season readings keep only part of their distance from the league mean (partial_weight in script 10): 0.78 at 7 games, 1.0 from 12",
        why: `The owner looked at Kansas State's roster (no offensive starter above 79, one defender above 80, three losses) and asked how it rates so high. The starters alone rank them 21st (slot score 74.3 against a league 71.9, sd 2.2).
          The position-weighted half ranks them 2nd, on a line-unit rating of 87.1 and special teams of 84.8 (a punter at 87), and the stats half grades a 54.5% third-down rate over 7 games at 93 and 9.7 sacks plus tackles for loss at 95, on fixed full-season anchors.
          The player ratings are shrunk for part seasons; these readings were not, so in a season in progress they sat twice as far from the mean as the evidence allows: the first 7 games' mean predicts the rest of the season with a slope of 0.47 for
          success rate, PPA and line yards (0.39-0.53 by measure) and 0.50 for points (scripts/validate_early_reliability.py, 2016-2025). A reading from g games keeps [g/(g+8)] / [12/(12+8)] of its distance from the league mean: 0.78 at 7 games, 0.56 at 4, 1.0 from 12.
          It applies to the stats half and the line unit, only to a season still being played (unscored games dated after the last scored one: 2026 has 1,144, no finished season has any), so every finished season keeps the rating it was validated at (checked: 0 of the finished team-seasons moved).
          The weighted half itself is kept: on the finals it improves the fit to scoring margin (0.806 with the slot score alone, 0.817 with the weighted half and the line unit; 0.782 with the weighted half dealt to the wrong teams), and the line unit is what earns it (0.801 without).`,
        cost: `Through week 8 the shrink also pulls the Power-4 over Group-of-6 gap from 7.13 to 5.98 rating points, because a team's level is part of what an early reading overstates; real outliers are pulled in by about a fifth.
          Kansas State moves 86.0 -> 84.5 (11th) and Nebraska 86.7 -> 85.2 (7th), so it does not settle them.` },
      { what: "The rating publishes its parts: sub_ratings.roster_half, stats_half, stats_half_raw, sched_faced and partial_weight",
        why: "A rating that moved by up to 21 points for a lopsided schedule has to show the schedule. The roster reading, the stats reading as shipped, the same stats unadjusted and the schedule (defenses faced, offenses faced) are exported with every team-season. No screen reads them yet.",
        cost: "A few bytes per team-season; no page code." },
      { what: "The depth chart shows 7 corners, 6 safeties and 6 other defensive backs (it showed 5, 4 and 4)",
        why: "The owner asked for at least 5 defensive backs, preferably 6-8. The three groups are the source's own labels (48% of the secondary is labelled only DB), so each shows its own bench. A smoke check asserts 5 to 8 rows in each group that has players.",
        cost: "A longer Defense tab." },
      { what: "The opponent-strength registry entry gave the cross-conference weight as 1.0; the code has 1.5",
        why: "Found while checking constants. The grid scored 1.0 best (70.0% against 69.6%, inside noise) but 1.5 is what ran for the player ratings in v4.17 and still does. The METHODS formula, FORMULAS.md and the ROADMAP now say 1.5.",
        cost: "Not changed: moving it changes every player rating and needs its own recompute and gates." },
    ],
    tried: [
      { what: "First draft of the schedule measure skipped every game against a non-FBS opponent",
        result: "Those games have a missing team id in the games table, so the opponent was dropped instead of being the pooled FCS team; the coefficient read 1.51 and the gap table 7.01. Counting them as FCS: 1.57 and 7.09.",
        verdict: "fixed" },
      { what: "Replace the stats half with our own points strength",
        result: "Best accuracy (63.5% / 14.89) and gap 6.46, but it puts results into the rating that power then adds again, and the rating stops describing how the team plays.",
        verdict: "rejected" },
      { what: "Weight the adjusted stats half 0.5 or 0.6 instead of 0.4",
        result: "62.8% / 14.98 and 63.3% / 14.97, gaps 7.87 and 8.65: a gain inside noise. The 60/40 weights are not tuned to the outcome used to judge them.",
        verdict: "rejected" },
      { what: "Rate players with only 1-2 productive games (the owner's idea: someone who shone in a few snaps), explored and not built (scripts/explore_low_game_players.py)",
        result: `About 1,650 rostered players a season are under the 3-game line (1,026 with one game, 620 with two) against about 5,400 above it; per game they average 0.7 sd BELOW position peers and only 5% beat the regulars' 75th percentile.
          Does a good short stretch mean anything? Per-game production z against the next season's rating z: slope 0.15 for 1-2 games, 0.26 for 3-5, 0.38 for 6+; only 48% of the 1-2-game players have a rating the next year at all.
          The 426 who were above the regulars' 75th percentile rated +0.11 sd next year against -0.24 for the other low-game players: a real edge of about 0.35 sd, small. Among regulars, the first 1-2 games predict the rest with slope 0.46-0.56 on offense and 0.27-0.36 on defense,
          which overstates it for a bench player. Shrunk by the next-season slope, even a 2.5 sd stretch lands near z -0.2, below an average regular, so the hard ceiling the owner suggested would rarely bind.`,
        verdict: "not built" },
      { what: "Dealing the schedules to the wrong teams (placebo)",
        result: "62.5% / 15.22 against 62.7% / 15.02 for the real schedules, and a gap of 3.70 against 7.09.",
        verdict: "placebo" },
    ],
    measured: [
      { label: "Power-4 minus Group-of-6, headline rating, 2015-2025 finals (points / sd)", before: "3.63 / 0.64", after: "7.09 / 1.06 (the games imply 7.55)" },
      { label: "Prior-season rating predicting later games, like-for-like test: winner / margin error", before: "62.7% / 15.13", after: "62.7% / 15.02" },
      { label: "Power backtest (validate_rankings.py): winner / margin error", before: "71.7% / 13.29", after: "71.3% / 13.27" },
      { label: "2026 through week 8: Group-of-6 and independent teams in the top 25 / top 40 by rating", before: "7 / 10", after: "1 / 4 (1 / 3 before the shrink)" },
      { label: "2026: Power-4 minus the rest, mean rating", before: "3.68", after: "5.98 (7.13 before the shrink)" },
      { label: "2026 rating rank: Kentucky / Liberty / Boise State / Nebraska / Kansas State", before: "62 / 20 / 10 / 3 / 7", after: "38 / 50 / 24 / 7 / 11" },
      { label: "2026 power rank: the same five", before: "23 / 21 / 10 / 14 / 59", after: "18 / 24 / 13 / 17 / 60" },
      { label: "2026 headline: top rating / spread (sd)", before: "89.0 / 5.29", after: "90.1 / 5.23 (92.0 / 6.11 before the shrink)" },
      { label: "Finished-season team ratings changed by the shrink", before: "-", after: "0 (a first version shrank the 2020 season, 110 teams, up to 4.8 points; it now applies only to a season in progress)" },
      { label: "Live player ratings changed by the recompute", before: "-", after: "15 of 5,468, none by more than 0.1 (a rerun with identical inputs; defenders)" },
      { label: "Pipeline tests", before: "456", after: "482 passed" },
    ],
    gates: [
      { check: "pytest tests -q", result: "482 passed (26 new in tests/test_schedule_adjust.py)" },
      { check: "python scripts/validate_early_reliability.py", result: "slope of the rest of the season on the first 7 games: 0.47 mean for efficiency and line measures, 0.50 for points" },
      { check: "python scripts/validate_stats_schedule.py", result: "schedule coefficient -0.51 / -0.52; SCHED_COEF drift 3.1%; placebo worse than the real adjustment; exit 0" },
      { check: "python scripts/validate_rankings.py", result: "power 71.3% / 13.27; rating alone 63.1% / 15.09; placebo 58.2%; slope 1.029 against 0.98 (drift 5.0%)" },
      { check: "python scripts/validate_ratings.py --season 2025", result: "exit 0; player distributions unchanged" },
      { check: "recompute: 10 --all-seasons, 10 --engine projected, 13, 17 --season 2026, 12", result: "0 requests (no GET line in any log); app data changed only in team_ratings, power_games, team_performance, team_history, manifest and the 2026 live, players and rosters files" },
      { check: "UI smoke / node --check / doc, prose and theme checks", result: "147 of 147 UI checks pass; node --check on every js file clean; doc-check 194 of 194, prose-check and theme-check clean" },
    ],
    unfixed: `**Kansas State and Nebraska are still in the top 11 by rating** (11th and 7th; power puts them 60th and 17th). Kansas State's starters rank 21st, but its position-weighted half ranks 2nd on a line unit of 87 and special teams of 85, and its stats half is
      still high on third downs and sacks plus tackles for loss. Their own points strengths rank 40th and 26th. The shrink is calibrated on efficiency, line-yard and points data because per-game yards and third downs are not on file, so it is not backtested on the published stats half.
      **The line unit has a spread of 15 points where every player term has 2-5, and special teams 7.5;** whether they should enter the weighted half at their current scale in a part season is the next measurement, not a tuning of one team. **The top SEC teams went up**, LSU to 92.0, which the owner had called inflated at 91.9 in an earlier pass; it follows from the schedule they play and was not tuned.
      **One coefficient serves offense (1.56) and defense (1.68).** **The adjustment is linear and moves a lopsided schedule by up to 21 points.** **The cross-conference weight is 1.5 in the code and 1.0 scored best;** moving it is a player-rating recompute and is held back.
      **Low-game players are not rated yet:** the evidence supports a labelled provisional rating on cards and rosters only (about the low-game mean plus 0.35 sd for a top-quartile stretch, never in the team roster half); it is not built and waits on the owner's call. **Scripts 11, 14, 15 and 16 were not rerun:** none reads the headline rating (16 reads sp_overall, unchanged). **The team page does not show the schedule faced yet.** **Everything is uncommitted** in both repositories.`,
    methods: ["team-ratings", "opponent-strength", "power-rating"],
    files: ["scripts/10_compute_team_ratings.py", "utils/opponent_strength.py", "scripts/validate_stats_schedule.py", "scripts/validate_early_reliability.py", "tests/test_schedule_adjust.py", "js/leagueData.js", "js/methods.js", "tools/ui-smoke/smoke.mjs"],
  },
  {
    id: "v4.17-own-opponent-strength-shutouts-and-ui",
    version: "v4.17",
    date: "2026-10-29",
    title: "Our own opponent strength replaces SP+ in the player ratings; shutouts stop vanishing; a section bar, game screen and slideshow",
    summary: `The owner asked for postseason and cross-conference weight and an opponent adjustment that is our own, then a recompute; and, along the way, for deeper depth charts,
      a header that brings the screens together, a game screen from the schedule, and a changing background. Checking stats, recruiting and transfers against the raw tables
      turned up a data defect that had been dropping shut-out losses from every record.`,
    motivation: `The player ratings' opponent adjustment used SP+ (an outside number, soft on weak opponents, FCS opponents counted as average), which the owner ruled out and which is the
      known cause of Group-of-6 players rating too close to Power-4 players. The owner also wanted the app to feel less team-centric and the schedule to open the game.`,
    did: [
      { what: "Opponent strength from our own results (utils/opponent_strength.py), used by script 06 in place of SP+",
        why: `An offense and a defense rating per team, solved together from every game of the season by a ridge regression with a conference level underneath (cross-conference games weigh CROSS_WEIGHT,
          the postseason POST_WEIGHT, every non-FBS opponent is one pooled FCS team estimated from the FBS-vs-FCS games), put on the z-score scale the multiplier already read (1 + 0.35 z above average, 1 + 0.12 z below, z clipped to +-2) so the frozen anchors still apply.
          Settings from scripts/validate_opponent_strength.py (weeks 1-8 strengths predicting every later game, 2016-2025, leave-one-season-out): winner picks 69.5-70.0% across 36 settings (team ridge 3, conference ridge 0.5-3 equal within noise);
          cross-conference weight above 1 did not help (70.0% at 1.0, 69.6% at 1.5, 68.8% at 2.5); a postseason weight of 1-2 predicted the next season slightly better (66.5-66.6% against 66.3%), so it is 1.0.
          The k values were compared by rerunning 06 and 07 for 2022-2025: next-season Spearman of the team roster 0.440 for 0.35/0.12 against 0.441 with SP+, and 0.424, 0.418, 0.401 for harsher weak-opponent penalties, so 0.35/0.12 stays.
          CFB_OPP_SOURCE=sp restores SP+ for comparison. Recomputed 2008-2025 end to end (06, 07, 10, 15 retrained, 16, 10 projected, 13, 14, 17, 12): 0 requests.`,
        cost: "Predictive accuracy equals SP+'s (0.440 vs 0.441): the gain is that nothing outside is used and an FCS opponent is no longer average. Power-4 minus Group-of-6 in top-22 roster rating rose 3.68 to 4.37 points in 2025 (the games imply about 7.8), so most of the level gap is still not in the player ratings." },
      { what: "A shut-out team's score was a gap, and the game had no result for it",
        why: `The harvest stores 0 points as missing. A game with one score and one gap therefore had no result for the team that was shut out: it was absent from its record, schedule result, standings and every rating built on results.
          725 FBS games 2008-2025 (about 40 a season); in 2025, 20 of 136 teams had a team-stat games count that disagreed with their schedule (Ball State's 31-0 loss to Purdue was missing). The betting-lines table records 0 for the gap in all 741 games it also holds.
          utils/store.fill_shutouts now reads a single missing score as 0 (a game with neither score is unplayed and untouched). After the recompute and export, 0 of 136 teams disagree, and the power backtest reads 71.7% / 13.29 (was 70.6% / 13.12, on games that lacked the shutouts).`,
        cost: "Every rating built on results moved slightly; the old numbers were wrong for the shut-out team." },
      { what: "Verification of stats, recruiting and transfers against the raw tables",
        why: `Recruiting: 1,600 prospects (2020, 2023, 2025, 2026) against raw stars, committed team and composite, 0 differences; class ranks dense and ordered; no team has more commits than the raw table.
          Transfers: every exported move found in the raw table by (player, from, to), every 'in' has its 'out', ovr_previous and ovr_current equal the player's card rating for 0 of 300 sampled in each year;
          157 raw 'transfers' that ended at the same school (2021-2026) are now dropped from the export. Stats: for 2025 the season line equals the regular-season game rows in 1,368 of 1,389 figures; in the other 21 (1.5%) the season line repeats the postseason line for a player whose only game was a bowl, so the card counts identical lines once.
          About 3% of stat lines held a completion percentage as 58.2 instead of 0.582 (rebuilt from game rows); the card reads either.`,
        cost: "None; found and fixed, not previously caught by any test." },
      { what: "UI: a section bar on every screen, a game screen, a deeper depth chart, a slideshow backdrop, a fuller card",
        why: `A bar of sections (Home, My Team, Teams, Rankings, Standings, Players, Playoff, Recruiting, Portal, More) is part of the header on every screen and marks where you are; the home page lost its separate links row. A schedule row opens a game screen: both teams
          with record, conference record and our rank, the final score, date and venue, and a comparison of ratings, scoring, offense, defense, third downs and turnovers with national ranks and an arrow to the better side (season figures: the data has no per-game team statistics). The schedule has a team band with OVR, OFF, DEF and an opponent record column.
          The depth chart lists 10 linemen, 7 receivers and so on. The home page shows famous stadiums and a team's screens show that team's, as a slideshow of freely licensed Commons photos linked with credit (script 20; 92 of 139 teams have photos, 284 in all, 23 for the home page; uniforms, locker rooms and cities are not freely licensed).
          The player card gained career statistics by season with a total column.`,
        cost: "Slideshow photos are linked from an outside host; a team with none uses its colours." },
    ],
    tried: [
      { what: "Harsher weak-opponent penalties (0.35/0.25, 0.30/0.30, 0.45/0.35)",
        result: "They widen the Power-4 over Group-of-6 gap (4.40, 4.56, 5.51 points) but lower the next-season fit (0.424, 0.418, 0.401 against 0.440).",
        verdict: "rejected" },
      { what: "A larger weight on cross-conference games in the strength fit",
        result: "No gain: 70.0% at 1.0, 69.6% at 1.5, 68.8% at 2.5 (weeks 1-8 strengths, later games).",
        verdict: "rejected" },
    ],
    measured: [
      { label: "Power-4 minus Group-of-6, top-22 roster rating, 2025", before: "3.68", after: "4.37" },
      { label: "2026 live team rating: LSU / Kansas State", before: "91.9 / 87.6 at the start of this work", after: "89.0 / 85.4" },
      { label: "Liberty, 2026: rating rank / power rank", before: "34 / 22", after: "20 / 21" },
      { label: "Power backtest: winner / margin error", before: "70.6% / 13.12", after: "71.7% / 13.29 (shutouts restored; baselines moved with the games)" },
      { label: "Teams whose team-stat games disagree with their schedule, 2025", before: "20 of 136", after: "0" },
      { label: "Projection gates: offense / defense model MAE vs naive", before: "8.19 / 8.39", after: "8.18 / 8.39 (naive 9.08 / 9.58); interval coverage 79.0% / 76.8%" },
      { label: "2025 player position means moved by", before: "-", after: "at most 0.24 rating points" },
      { label: "Pipeline tests", before: "452", after: "456 passed" },
      { label: "UI smoke checks", before: "144", after: "146 (and a 28-screen style audit)" },
    ],
    gates: [
      { check: "pytest tests -q", result: "456 passed" },
      { check: "python scripts/validate_opponent_strength.py", result: "69.5-70.0% across the grid; postseason weight table printed" },
      { check: "python scripts/validate_rankings.py", result: "power 71.7% / 13.29; rating alone 62.9%; placebo 58.1%" },
      { check: "python scripts/validate_ratings.py --season 2025", result: "distributions inside the bounds" },
      { check: "re-export", result: "0 API requests; player ratings changed only through the opponent adjustment (position means within 0.24)" },
    ],
    unfixed: `**The level gap is still about half of what the games show** (4.4 of about 7.8 rating points): Liberty is 20th by rating and 21st by power. A harsher weak-opponent penalty costs predictive fit, so the answer is probably not a bigger multiplier
      but a different input (the rating of the competition level itself); that needs its own measured pass. **The slideshow is mostly stadiums** and 47 teams have none. **The game screen shows season figures, not that game's box score.**
      **The Methods, Research and Build Log readers keep their document tables** (dark and consistent with the theme, not console rows). **Player cards still have no awards or trophies** (the data has none). **Everything is uncommitted** in both repositories.`,
    methods: ["opponent-strength", "player-rating", "team-ratings", "power-rating"],
    files: ["utils/opponent_strength.py", "utils/store.py", "scripts/06_compute_edge_scores.py", "scripts/12_export_frontend_json.py", "scripts/20_harvest_backdrops.py", "scripts/validate_opponent_strength.py",
            "tests/test_store_shutouts.py", "js/menuChrome.js", "js/menuGame.js", "js/menuBackdrop.js", "js/menuCard.js", "js/menuScreensLeague.js", "js/leagueData.js", "css/menu.css", "tools/ui-smoke/smoke.mjs"],
  },
  {
    id: "v4.16-slot-team-rating-and-pace",
    version: "v4.16",
    date: "2026-10-29",
    title: "Team ratings from every position group with depth; a calibrated in-season pace correction; the menu for mouse and controller only",
    summary: `The owner said 2026 in-season team ratings were inflated (LSU, Kansas State), that the team rating should draw on every position with
      mostly starters and some depth rather than the top 22, that the in-season pace scaling of player ratings runs high, and that the menu does not need arrow-key or WASD
      movement. This pass replaces the flat top-22 half of the roster rating with a fitted slot score, replaces the pace rule with a calibrated one, recomputes, and removes the keyboard movement.`,
    motivation: `LSU 91.9 and Kansas State 87.6 against 2025 finals of 80.5 and 79.6; the owner expected live player ratings to be lower and thought the pace scaling was a bit high.`,
    did: [
      { what: "The roster half of a team rating is a slot score",
        why: `Each position group (QB, RB, WR, TE, DL with EDGE, LB, DB with CB and S, K and P) is scored from its starters (1, 2, 3, 1, 4, 3, 5, 2) with the next three as depth (80% starters, 20% depth) and the groups are weighted .194 / .189 / .036 / .016 / .150 / .123 / .286 / .008. A group nobody is rated in drops out and the weights renormalise. The weights are 0.75 x non-negative least squares of season scoring margin on the group scores (2016-2025, leave-one-season-out, 1,261 team-seasons) + 0.25 x a football prior, because the pure fit gives wide receivers and tight ends zero. Roster alone: Spearman with scoring margin 0.764 against 0.735 for the top-22 mean (pure fit 0.771, hand-picked weights 0.710). Blended with team stats: 0.879 against 0.872. The offensive line is untouched (the line unit still sits inside the position-weighted half).`,
        cost: "A small gain: depth added 0.001 in the fit, and the fit is as good as it is because team stats carry most of the same-season signal. Football weights were pulled back toward a prior at a cost of 0.003 in rank fit." },
      { what: "The in-season pace correction is calibrated",
        why: `A part-season EDGE was multiplied by sqrt(games scheduled / games completed). Collected for 2022-2025 at cuts after weeks 4, 6, 8 and 10 (69,948 player-seasons): the final EDGE was 6% below the paced figure at weeks 6-10 (0.94), 14% below for players who had played under half of their team's games (0.866), and about 9% below for the top fifth of raters. The new rule: shrink toward the position's mean final EDGE of last season with weight g/(g+0.5), then multiply by 0.707 / 0.849 / 0.953 / 0.979 by the share of the team's completed games he played (<=0.5, <=0.75, <=0.9, above). Median error against the final EDGE at the four cuts: 6.02 / 4.46 / 3.36 / 2.43 before, 5.48 / 4.07 / 2.96 / 2.10 after, unbiased in every share bucket. 2025 week-8 final/paced: 0.933 before, 0.983 after.`,
        cost: "In rating points the effect on a starter is small (a starter has played nearly every game, so his factor is 0.98): the 2026 mean live player rating moved 67.8 to 67.3, LSU 91.9 to 90.7 and Kansas State 87.6 to 85.7 together with the slot score." },
      { what: "Recomputed",
        why: `Script 10 for 2008-2026 and the projected 2026 rating, script 17 for 2026 (real key, cache only: 0 requests), scripts 13 and 14, then the export. Only team ratings and what derives from them moved: player ratings of every played season are identical, and in 2026 only the live fields moved. The power backtest is unchanged (70.6% winner picks, 13.12 margin error; rating alone 62.0%).`,
        cost: "Every team rating moved a little: the slot score replaces the top-22 mean for all seasons." },
      { what: "The menu is for the mouse and a controller; the keyboard moves nothing",
        why: `Arrow keys, WASD, Q/E, brackets, paging and the space bar are gone. Escape or Backspace goes back and Enter opens the highlighted item; everything else is a button on screen. With a mouse the bottom bar is a row of buttons (Back, Season, Menu, Sort where a list has one, Light or Dark) with no key labels and the Q/E tab markers are hidden; a controller shows its own button labels and the markers again once a pad is in use. Controller movement is unchanged. Every classic page still redirects to its menu screen (checked: every HTML file except menu.html), so the whole app is the console menu.`,
        cost: "No keyboard-only navigation beyond Tab, Enter and Escape." },
    ],
    tried: [
      { what: "Hand-picked slot weights and a deeper-rotation score",
        result: "Worse than the top-22 mean: 0.710 against 0.735 (roster alone); a half-and-half starter and depth mix 0.694.",
        verdict: "rejected" },
      { what: "Slot weights fitted without a prior",
        result: "0.771 roster alone, but wide receivers and tight ends get zero weight and running backs 0.23; shrunk 25% toward the prior for a 0.003 loss.",
        verdict: "shrunk" },
      { what: "Pace: shrink toward last season's EDGE; per-position constants",
        result: "Last season adds nothing over the position mean (equal to a shuffled placebo); per-position constants 2.97 against 2.99.",
        verdict: "rejected" },
    ],
    measured: [
      { label: "Roster alone vs scoring margin (Spearman)", before: "0.735 (top-22)", after: "0.764 (slot)" },
      { label: "Blended with team stats (Spearman)", before: "0.872", after: "0.879" },
      { label: "Pace: median error at weeks 4/6/8/10 (EDGE points)", before: "6.02 / 4.46 / 3.36 / 2.43", after: "5.48 / 4.07 / 2.96 / 2.10" },
      { label: "2025 week 8 final/paced EDGE", before: "0.933", after: "0.983" },
      { label: "2026 live: LSU / Kansas State team rating", before: "91.9 / 87.6", after: "90.7 / 85.7" },
      { label: "Pipeline tests", before: "440", after: "452 passed" },
      { label: "UI smoke checks", before: "143", after: "144" },
    ],
    gates: [
      { check: "pytest tests -q", result: "452 passed" },
      { check: "python scripts/validate_rankings.py", result: "power 70.6% / 13.12, rating alone 62.0% (unchanged within 0.5)" },
      { check: "python scripts/validate_pace.py", result: "2025 week 8: final/paced 0.983" },
      { check: "node tools/ui-smoke/smoke.mjs", result: "144 / 144" },
    ],
    unfixed: `**The 2026 jump is mostly real in the data.** LSU's live roster really rates high (Leavitt 79 -> 92, Ross 73 -> 91); the pace and slot changes took 1 to 2 points, not 10. The remaining causes are the soft opponent adjustment in the player ratings (the Liberty finding) and team stats that are opponent-blind. **Depth did not matter in the fit** and an unrated-slot fill-in from projections was not built. **The offensive line was left alone on request.** **The pace fit is four seasons** and part of the first season's prior means is its own. **The mean live player rating hardly moved** because a starter's factor is 0.98. **Everything is uncommitted** in both repositories.`,
    methods: ["team-ratings", "live-season"],
    files: ["scripts/10_compute_team_ratings.py", "scripts/06_compute_edge_scores.py", "tests/test_slots_and_pace.py", "js/menuInput.js", "js/menuChrome.js", "js/guide.js", "css/menu.css", "tools/ui-smoke/smoke.mjs"],
  },
  {
    id: "v4.15-home-team-pages-and-console-card",
    version: "v4.15",
    date: "2026-10-28",
    title: "A real home page, a page for every team, links everywhere, and the player card back in the console frame",
    summary: `The menu still opened inside Dynasty: a three-card list over a few panels, with team screens that only worked for the one team
      you followed. This pass makes the home page the league at a glance, gives every team a page of its own, makes every team, player and
      ranking a link to where you would want to go next, and rebuilds the player card in the console frame it had lost.`,
    motivation: `The owner said the player cards had completely lost the console style, that the app still started in Dynasty (which they do not
      like), and that everything should be linked: a true home page where every team, player, ranking and so on links to the pages of interest.
      Ratings and rankings work was set aside for a later pass; this one is the interface.`,
    did: [
      { what: "The home page is the league, not a menu of Dynasty",
        why: `Quick links to every screen along the top, a strip for the team you follow (or an offer to follow one), and panels: the top ten, the best
          players, last week's results and the coming week's games (a played season shows its bowls and the playoff; a season not yet played its opening
          week), the 12-team playoff picture, the biggest rating movers, the best recruiting classes and the biggest transfers. Every row opens something:
          a team row its page, a player row his card, a game either team, a class its team's recruiting page, a transfer the player. The word Dynasty is gone from
          the titles and breadcrumbs (they read HOME, TEAM, LEAGUE, NEWS); the old hub address opens the team page, or the home page for its League and News tabs.`,
        cost: "A design change: one new screen and the panel, row and game-row markup. The home page loads the top-players, recruiting and transfer files beside the team files; a failed one is named in a banner and its panel says so." },
      { what: "Any team has a page, and every team screen follows the team in the route",
        why: `#/team/52 is a team's page (rating, offense and defense, record, rank, conference, next game, top players, and Roster, Depth Chart, Schedule,
          Recruiting, Transfers and History); #/team/52/roster/QB and the rest are its screens. The older short routes (#/roster) still work and mean My Team.
          Following a team is a button on its page and is optional: the home page and the quick menu use it, nothing needs it. The quick menu's team column
          is the team you are looking at ("this team"), else the one you follow.`,
        cost: "A team's page reads the roster file for its top players after the page is drawn (8-11 MB on first use); the file is shared with the roster screen." },
      { what: "Links everywhere",
        why: `One rule in the router: an element with data-to opens that route when activated by mouse, key or pad. Rankings, standings, schedule rows (the opponent),
          playoff seeds and bracket boxes, recruiting classes and prospects, transfer rows, The Season's movers and best players, roster and depth-chart rows, the home panels and
          the scores ticker (plain links) all open their team or player. A ranking's side panel, a game's side panel and a card have buttons onward (team page, position leaders, full stats).`,
        cost: "A row opens its main entity; the second entity in a row (a game's other team) is a button in the side panel or its own button. A team we do not rate (FCS) is plain text." },
      { what: "The player card is in the console frame again, with Overview, Stats and Career",
        why: `The header is the roster screen's strip made large (photo, name, position, team button, class, height, weight, home state, the lead rating in a box with all three beneath it).
          Overview: the three ratings in tiles, the position's key stats as big tiles, how each rating is built, the rating history, links to the team page and to the position's leaders, the transfer path.
          Stats: every stat as ruled tables in columns. Career: the season-by-season table with a team button per season, and totals. LB and RB (Q and E) switch sections.`,
        cost: "The card's team button and tabs add focus targets; nothing about the data changed." },
      { what: "Photos on every top-player row, and the last unlinked names linked",
        why: `A small photo (his ESPN image over his initials, in a fixed frame) now leads the player rows on the home page, a team's Top players, The Season's best players, the Players list and the roster header strip.
          Schools in a transfer path, the opponents in a ranking's game table and the conference on Team History are buttons to their pages.`,
        cost: "Same ESPN dependency as the card photo; an unmatched player shows initials." },
    ],
    tried: [
      { what: "Links inside a row (the team and the player each a button in one row)",
        result: "Not built: nested interactive elements in a row, and two focus targets per row, make the controller layout worse. A row opens its main entity.",
        verdict: "rejected" },
      { what: "Keeping the Dynasty hub with its Team, League and News tabs as the team page",
        result: "The League and News tabs only repeated the home page; the team page is now the Team tab on its own.",
        verdict: "replaced" },
    ],
    measured: [
      { label: "Rows on the home page, and how many have a destination", before: "about 20 rows, none a link", after: "20 or more, 0 without a destination (a test)" },
      { label: "Screens that work for any team, not only My Team", before: "0 of 7", after: "7 of 7 (team, roster, depth, schedule, recruiting, transfers, history)" },
      { label: "UI smoke checks", before: "140", after: "142" },
      { label: "Pipeline tests", before: "440", after: "440 passed (no pipeline change)" },
    ],
    gates: [
      { check: "node tools/ui-smoke/smoke.mjs", result: "142 / 142, including the crawl of 1,757 cards and 240 roster tabs and a no-sideways-scroll check of the home page, a team page and every card section at 375 px" },
      { check: "pytest tests -q; node --check js/*.js; doc-check 188/188; prose, theme and contrast checks", result: "440 passed; all clean" },
    ],
    unfixed: `**Ratings and rankings are not changed in this pass.** The strength model, how margin and the rating weigh in power, and the postseason question (Build Log v4.14) are the next work.
      **A team's Top players waits for the roster file,** which is large; a past season's team page does the same. **Team History rows are not links.**
      **No game log and no similar players on the card.** **The roster header strip has no photo.** **A real controller is still untested.** **Everything is uncommitted** in both repositories.`,
    methods: [],
    files: ["js/menuHome.js", "js/menuRouter.js", "js/menuScreens.js", "js/menuScreensTeam.js", "js/menuScreensLeague.js", "js/menuScreensClass.js", "js/menuScreensPages.js",
            "js/menuCard.js", "js/menuChrome.js", "js/dataLoader.js", "css/menu.css", "menu.html", "tools/ui-smoke/smoke.mjs"],
  },
  {
    id: "v4.14-landing-page-and-robust-cards",
    version: "v4.14",
    date: "2026-10-28",
    title: "A landing page that needs no team; cards that load small and fail visibly; the postseason in schedules and records; a full player card with photos",
    summary: `The menu opened on team select, so seeing the league or the news meant picking a team first. Player cards and
      rosters sometimes failed to load or came up blank. Past-season schedules showed bowls as week numbers. A card
      carried only a few stat tiles. This pass adds a landing page, makes every data failure visible and retryable,
      cuts what a card downloads by about twelve times, labels the postseason, and builds the full card with photos.`,
    motivation: `The owner likes the menu but wants the whole league and the news without going in through a team, said
      cards and rosters "dont always load or miss things" and asked for error handling that is tested fully, asked that
      schedules and stats include the postseason, and asked for the most robust card with full stats and head shots.`,
    did: [
      { what: "A landing page (#/home) is the front door; it needs no team",
        why: `Three cards (League, News, Dynasty) over the top teams by power and the season's playoff picture. League and News
          list the same screens as the hub's tabs. Dynasty shows the followed team's record, rank and next game with My Team and
          Switch Team, or a single Follow a Team entry before one is chosen. An empty or unknown route is the landing page, never
          team select. The Dynasty hub is one step below it: Back at the hub returns to the landing page, and Back at the landing
          page opens the quick menu, which gains a Home entry. Screens about one team still ask for a team.`,
        cost: "A design change: one new screen and the group-card markup. The landing page lists the top eight, where the hub's League tab lists ten, so it fits on one screen." },
      { what: "The data loader tells a failed load from an absent file, retries, and never caches a failure",
        why: `Measured first: the loader cached every failure as null for the life of the page, so one dropped request left a roster or
          a card empty until a reload, and an empty page read the same as "no data". Two callers asking for the same file at once each
          downloaded it (teams.json, live_2026.json, team_history.json, schedules_2026.json and team_ratings.json were each fetched twice on one card).
          Now a 404 is an answer and is cached; anything else (network error, server error, truncated JSON) is tried three times with growing
          pauses, recorded, and not cached; concurrent callers share one request. The router names any file that failed while a screen was built, in
          a banner with a Retry; a screen that throws shows an error panel with Retry instead of a blank stage; the header, tabs and prompts cannot take the frame down; a roster or card says
          whether its file failed, is absent, or was filtered empty.`,
        cost: "A failing file now costs about two seconds of retries before it is reported." },
      { what: "A card reads one small file per player instead of every season's file",
        why: `Measured first: opening one card downloaded 92.6 MB over 16 requests (81.5 MB over 15 for a 2025 card); the classic modal read 19 files, about
          200 MB. Script 12 now writes cards/NNNN.json (player id modulo 1,024): each player's whole career, the grid's rows unchanged, oldest season first,
          about 0.2 MB a shard. A card now downloads 7.4 MB over 7 requests, almost all of it files the whole menu shares; the card's own data is the shard and the transfer file.
          The shards are read back from the files just written and a contract test compares them to the grid row for row.`,
        cost: "194 MB added to data/ (395 MB to about 589 MB, 1,024 files). Dropping three rarely used fields (not_rated_reason, class_year_basis, projection_confidence) would save about 10%; not done." },
      { what: "Rosters and cards always say why a number or a table is missing",
        why: `Measured: no roster row lacks an id, name or position, none is duplicated, none is on two teams and no ratings row is orphaned (170,805 rows, 2016-2026), but
          76,519 of the 153,923 roster rows for 2016-2025 (49.7%) had no rating and no stated reason, and in a crawl 305 of 1,054 past-season non-lineman cards showed a bare dash. A missing rating now
          carries its reason in the tooltip and a note on the card (offensive linemen are withheld by design; anyone else has too few counted games on file).`,
        cost: "The reason for a past-season blank is general (not enough counted games), not measured per player; the export does not say which of fewer than three games or no stat line it was." },
      { what: "The postseason in schedules, records and power's listing",
        why: `Schedules already held the bowls and the playoff, shown as 'W1' and 'W2'; they now sit under a Postseason heading, labelled POST, with the venue. A team's record shows the regular season
          with the postseason beside it ("12-1 · post 1-1"); Standings stay regular-season; Team History counts every game and says so. Team stats already include the postseason
          (2025: 74 of 74 teams that played one have a games count equal to all their games). Power's per-game table lists postseason games apart, "shown, not counted".`,
        cost: "Power does not count the postseason yet: how a bowl should weigh (opt-outs, motivation) is for the strength model to measure. games.json has no bowl names, so a game is labelled Postseason with its venue." },
      { what: "The full player card",
        why: `Every stat the data holds, grouped as a box score, as Regular season, Postseason and Total for the season shown; a career table with a row per season and career totals (counts summed, longs taken as the maximum, rates recomputed);
          the rating history; how each rating is built (production score and games, the three jobs of a defensive back, where the projection came from, the to-date games); the transfer path; usage shares.`,
        cost: "No game log and no similar players on the card yet." },
      { what: "Headshots, linked from ESPN, matched strictly",
        why: `scripts/19_harvest_headshots.py read ESPN's public team list and 138 rosters (140 requests, no key, no CFBD spend), matched each athlete to our player by school and normalised name (a duplicate name needs a compatible position; a conflict drops both) and
          wrote a mapping of ids. 13,170 of 16,882 players on a 2026 roster (78.0%) and 8,409 of the 10,460 the app rates (80.4%) are matched; ESPN lists 13,800 athletes, 13,269 with a photo, of which 99.3% matched. Power 4 81.7%, Group of 6 and independents 74.7%.
          Height agrees within an inch and weight within 15 lb for all 13,139 and 13,141 comparable pairs. The image is linked, never copied, drawn over the monogram in a fixed frame, and removed if it fails to load.`,
        cost: "An outside dependency (photos vanish if the host changes), visitors' browsers request images from ESPN, the images are ESPN's, and a player who has left has none. A switch (CONFIG.HEADSHOTS_ENABLED) turns every photo off. The agreement check is a consistency check, not independent proof: both sources carry school-provided sizes." },
    ],
    tried: [
      { what: "Keeping the hub as the front door and making its League tab the default",
        result: "It would have opened on one tab of a team-centred screen, with the Dynasty group missing for anyone who does not follow a team.",
        verdict: "rejected" },
      { what: "Reading the card from every season's players file, as before",
        result: "92.6 MB over 16 requests to open one card.",
        verdict: "replaced" },
      { what: "Counting postseason games in power: does a season's strength predict the next season better with its bowls and playoff?",
        result: "No measurable gain. Season s's power predicting every regular-season game of s+1 (2016-2024, 4,971 games, leave-one-season-out): winner 66.3% without the postseason, 65.8% with it; margin error 14.06 and 14.03. The postseason is 5.2% of FBS-vs-FBS games and 16.7% of cross-conference ones (388 of 2,318 in 2016-2025); the regular season has about five times as many cross-conference games. A conference level learned from cross-conference games (full-season data, lambda 5) is worth 0.4 points of winner accuracy and 0.13 of margin error, with or without the postseason.",
        verdict: "measured, not counted" },
      { what: "Does regular-season performance predict the postseason games themselves?",
        result: "No better than the rating. On 485 FBS-vs-FBS bowl and playoff games, 2016-2024: the season's rating alone picks 66.0% (margin error 12.82); power (rating plus regular-season results) 59.8% (13.11); always the average margin 13.48. Margins of victory in the regular season did not carry into bowls; opt-outs and portal departures are the likely reason, and this is not yet tested.",
        verdict: "measured, reported" },
      { what: "A sweep of the margin cap, the win bonus and the prior's weight (60 settings), after the owner said power rewards margins and ranks LSU too high against Kentucky",
        result: "Winner accuracy 67.6-70.7% and margin error 13.12-13.69 across the whole grid; the shipped setting (cap 28, bonus 8, prior ridge 2) is best on both. A results-leaning setting (cap 7, bonus 16, ridge 2) scores 69.3% / 13.51 and puts Kentucky 6th above LSU 11th. In 2026 through week 8 LSU is 3rd (rating part +12.7, results part +9.3) and Kentucky 23rd (rating part +1.1, results part +12.3): Kentucky's results part is already above LSU's; LSU leads on the rating part alone (rating 91.9, 1st, against 80.1, 61st). LSU's rank moves between 2nd and 12th across the grid.",
        verdict: "measured, constants not changed" },
    ],
    measured: [
      { label: "First visit with no team chosen opens on", before: "Team select", after: "The landing page" },
      { label: "Data one card downloads (local, uncompressed)", before: "92.6 MB / 16 requests", after: "7.4 MB / 7 requests" },
      { label: "Roster rows 2016-2025 with no rating and no stated reason", before: "76,519 of 153,923 (49.7%)", after: "0 (each has a reason in its tooltip)" },
      { label: "Crawl: every rostered player's card and every position tab, 5 seasons x 4 teams", before: "305 of 1,054 past-season cards with a bare dash", after: "1,757 cards, 240 roster tabs, 0 problems" },
      { label: "Players on a 2026 roster with a photo", before: "none", after: "13,170 of 16,882 (78.0%)" },
      { label: "Margin sweep: range of winner accuracy / margin error over 60 settings", before: "shipped 70.7% / 13.12", after: "67.6-70.7% / 13.12-13.69" },
      { label: "Postseason as evidence for the next season: winner / margin error", before: "66.3% / 14.06 (regular season only)", after: "65.8% / 14.03 (with bowls and playoff)" },
      { label: "UI smoke checks", before: "127", after: "140 passed" },
      { label: "Pipeline tests", before: "353 passed", after: "440 passed" },
    ],
    gates: [
      { check: "node tools/ui-smoke/smoke.mjs", result: "140 / 140 (one earlier run had a 45-second timeout in a classic-page check that passed alone and on rerun)" },
      { check: "pytest tests -q; node --check js/*.js; doc-check 185/185; prose, theme and contrast checks", result: "440 passed; all clean" },
      { check: "re-export against the app's data", result: "only schedules_*, power_games_*, manifest and the new cards/ differ; every rating, roster, player and team file is byte-identical" },
    ],
    unfixed: `**The strength model is not started.** Strength of schedule and conference measured by us, fitted to ten years of results with the postseason, is the next piece
      of work (explore first, report before building); the Liberty finding from v4.13 stands. **Power does not count the postseason.**
      **No game log and no similar players on the card;** the roster header strip has no photo. **Photos exist only for the 2026 roster,** and depend on ESPN.
      **A blank past-season rating gets a general reason,** not a per-player one. **The classic modal still reads every season's file** (it is reachable only with ?classic).
      **bowl names are not in the data.** **card shards added 194 MB** to data/. **A real controller is still untested.** **Everything is uncommitted** in both repositories.`,
    methods: ["power-rating", "team-ratings"],
    files: ["js/menuRouter.js", "js/menuScreens.js", "js/menuScreensTeam.js", "js/menuScreensLeague.js", "js/menuScreensPages.js", "js/menuCard.js", "js/menuChrome.js",
            "js/dataLoader.js", "js/leagueData.js", "js/ui.js", "js/config.js", "css/menu.css", "menu.html", "tools/ui-smoke/smoke.mjs",
            "scripts/12_export_frontend_json.py", "scripts/19_harvest_headshots.py", "tests/test_export_contract.py", "tests/test_headshots.py", "tests/test_frontend_config.py"],
  },
  {
    id: "v4.13-explainable-power-and-console-pages",
    version: "v4.13",
    date: "2026-10-28",
    title: "An explainable power ranking built on our own numbers; every page is now a console screen",
    summary: `The owner asked for a power ranking on our own metrics that can be explained, with losses that stand for
      something, strength of schedule that matters to some degree but nothing outside (no SP+, SOS or SOR), and a hard
      look at why a team like Liberty rates so highly. Power is rebuilt as a rating part plus a results part, each game
      behind it shown on the Rankings screen. The same pass turned the site's classic pages into menu screens, so the
      whole app is one product.`,
    motivation: `The owner said the ranking should be explainable, that unbeaten teams should not rank higher just for
      winning, that losses must stand for something, that SP+, strength of schedule and strength of record are suspected
      of inflating the SEC and Big Ten, that Liberty is rated far too highly, and that the classic pages break the
      immersion and make testing hard.`,
    did: [
      { what: "Power rebuilt: the rating as a prior, results as the update, a win bonus, no outside numbers",
        why: `power = rating part + results part. A game is worth its margin (capped at 28) plus 8 for a win or minus 8 for a
          loss, read against what the two teams' ratings expected, so the schedule enters only through our own ratings.
          Backtested on 2,781 later games (2016-2025, leave-one-season-out): 70.7% of winners picked against 62.5% for the
          rating alone and 56.8% for the home team; shuffling the results parts across teams drops it to 57.7%, below the
          rating alone. The Rankings screen now shows, for the selected team, the two parts, and every game with what it was
          worth, what the ratings expected and the difference. Recomputed for 2008-2025 from cache with no API call; no team
          rating, offense, defense or SP+ value changed.`,
        cost: "The win bonus buys 0.7 points of winner accuracy for 0.09 points of margin error. Power still credits margin, so it is not a resume." },
      { what: "A conference level was measured, and left switched off",
        why: `Out-of-conference results can measure how a conference has really played against its ratings. Scored, it moves
          accuracy by 0.1 point, and on eight weeks of data it would add 9.7 points to every SEC team and take 6.5 off every MAC
          team. It stays in the code at zero. The measured levels are in the Methods entry rather than in the ranking.`,
        cost: "None; it is not used." },
      { what: "Why teams like Liberty rate highly: the finding",
        why: `Not SP+ inflating the SEC. Our own player ratings under-separate levels: Power-4 roster ratings average 87.2 and
          Group-of-6 83.4, a gap that implies 3.7 points a game, while the games say 7.7. The player ratings' opponent adjustment
          (script 06) is too soft for weak opponents, so Liberty's production against Conference USA and the Sun Belt is credited
          too generously (rating 83.3, 34th; power 22nd).`,
        cost: "Reported, not fixed: it needs a change to the player ratings' opponent adjustment, with its own back-test, and a full recompute." },
      { what: "Every classic page is now a menu screen; the old pages redirect",
        why: `Players & Leaders (position tabs, sorts, the player card), The Season, Team History, Methods, Build Log, How It Works
          and Research are screens in the menu frame. The four readers draw the registries with the same entry renderers the classic
          pages used and rewrite their links to stay inside the menu. Every classic page now redirects to its screen (?classic keeps
          the old page, which is how the checks still reach it). The hub's League and News tabs list the screens; the quick menu lists
          them all.`,
        cost: "The classic team page's tabs and the Players page's text search are not ported: the Team tab drills into a team through its own screens, and Players & Leaders has no search box yet." },
    ],
    tried: [
      { what: "A conference level from out-of-conference results",
        result: "Measured and kept at zero: a 0.1-point gain and a large, noisy effect on eight weeks of data.",
        verdict: "rejected" },
      { what: "Starting the results from zero instead of from the rating",
        result: "70.4% and 13.37 margin error, against 70.7% and 13.12; and it credits a weak conference's wins as if its opponents were average.",
        verdict: "rejected" },
      { what: "Explaining Liberty by the team-stats half of the rating being opponent-blind",
        result: "Checked and ruled out: across 2016-2025 the team-stat rating sits 12 to 13 points below the roster rating for every group of teams alike (Power 4 13.0, Group of 6 12.2). The roster rating is the part that rates Group-of-6 teams too highly.",
        verdict: "rejected" },
    ],
    measured: [
      { label: "Winner picked correctly on later games: rating alone / power", before: "62.5%", after: "70.7%" },
      { label: "Margin error, points: rating alone / power", before: "14.80", after: "13.12" },
      { label: "Power-4 minus Group-of-6: rating gap implied vs results gap, points a game", before: "3.7 implied", after: "7.7 actual" },
      { label: "Liberty, 2026 through week 8: rank by rating / by power", before: "34", after: "22" },
      { label: "Pipeline tests", before: "347 passed", after: "353 passed" },
      { label: "UI smoke checks", before: "123", after: "127 / 127" },
    ],
    gates: [
      { check: "python scripts/validate_rankings.py", result: "rating slope fitted 1.000 against the constant 0.98 (drift 2.1%)" },
      { check: "re-export against the app's data", result: "only the power fields and the new power_games files differ" },
      { check: "pytest tests -q (pipeline)", result: "353 passed" },
    ],
    unfixed: `**Liberty is still 22nd.** The cause is in the player ratings, not in power: their opponent adjustment is too soft
      for weak opponents and still uses SP+. The measurement that would settle it is an ablation of that adjustment (several
      floors, then a recompute and the same backtest); it is the next pass, and it is the real answer to the SEC and Big Ten
      concern because it removes SP+ from the player ratings.

      **LSU is still third.** Its rating part is the largest in the country and its results part is positive; its two losses
      (by 8 and 1) cost it, but not enough to drop it behind Miami and Notre Dame.

      **Power is not a resume,** and an unbeaten team is not guaranteed to rank above a team with losses.

      **The classic team page and the Players text search are not ported.**

      **A real controller is still untested.**

      **Everything is uncommitted** in both repositories.`,
    methods: ["power-rating", "team-ratings"],
    files: ["utils/results_rating.py", "scripts/validate_rankings.py", "scripts/10_compute_team_ratings.py", "scripts/12_export_frontend_json.py",
            "scripts/17_live_season.py", "tests/test_results_rating.py", "js/menuScreensPages.js", "js/menuScreensLeague.js", "js/menuScreens.js",
            "js/menuChrome.js", "js/menuRouter.js", "js/dataLoader.js", "js/config.js", "css/menu.css", "menu.html", "tools/ui-smoke/smoke.mjs"],
  },
  {
    id: "v4.12-menu-home-one-skin-power-rankings",
    version: "v4.12",
    date: "2026-10-28",
    title: "The menu is the home page; one skin on every page; rankings by power; a playoff bracket",
    summary: `The owner found the app out of order: the menu was hard to reach, the other pages looked like a
      different product, and the rankings put LSU first with two losses and Kansas State eighth at 3-3. The
      cause of the last was plain: the team rating never reads a scoreboard. Rankings now use power (team rating
      plus an opponent-adjusted results rating), the menu is the home page with Team, League and News tabs, every
      page wears the menu's look, and the playoff picture is a bracket.`,
    motivation: `The owner said the menu should be the home page with tabs for team (a dynasty-style drill-down),
      league and news, that every page should be connected and wear the new skin, and asked how LSU and Kansas
      State could rank where they did. They also gave the field rules for a 12 and a 24-team playoff and two bracket
      pictures to follow.`,
    did: [
      { what: "Power rating for rankings (new: utils/results_rating.py, validate_rankings.py)",
        why: `A results rating (opponent-adjusted scoring margin, margins capped at 28, ridge-shrunk) is combined with
          the team rating as power, in points per game above an average team. The weights were fitted and scored on
          2,781 later games from 2016-2025, leave-one-season-out: results predict the winner 70.5% of the time against
          62.5% for last season's rating and 56.8% for the home team; a placebo that deals results to the wrong teams
          drops back to 62.2%. 2026 through week 8: LSU is rating 1, power 2 (its results rank 5th: big wins over Clemson,
          Texas A&M and Auburn, and losses by 8 and 1); Kansas State drops from 8 to 54. Rankings, the ticker, the hub
          and the playoff all use it; the team rating is still shown. Recomputed for 2008-2025 from cache with no API call
          and checked: no team rating, offense, defense or SP+ value changed.`,
        cost: "Power credits margin, so it is a predictive ranking, not a resume. LSU is still second: the data says its results are strong. A wins-first ranking would be a different, untested rule." },
      { what: "The menu is the home page, with Team, League and News tabs",
        why: `index.html opens the menu. Team is the drill-down (roster, depth chart, schedule, recruiting, transfers, the
          team page); League is everything across teams (rankings, standings, all teams, players, stats, recruiting,
          transfer portal, conferences); News is the playoff picture, the season page, research, how it works, methods and
          the build log. Each page that is not a menu screen is marked PAGE. The league screens open without a team.`,
        cost: "The old home page content is no longer linked (it is still at index.html?classic)." },
      { what: "One skin on every page",
        why: `Dusk and Daylight, the menu's two looks, are now the site's only two themes. Retro is deleted. Every page gets the
          black glossy top bar with the red active tab, the dusk background and the same tokens; the first tab is
          Menu. Both themes are held to the contrast floors.`,
        cost: "Page layouts are the old ones in the new colours and bar; only the menu screens are laid out like the console menus." },
      { what: "Playoff bracket and your field rules",
        why: `A bracket drawn like the two pictures: top half left, bottom half right, byes already in round two, no winners
          picked. The 12-team field is the four Power-4 conference champions, the top Group-of-6 team, Notre Dame if it is
          in the top 12 by power, then the best remaining; the 24-team field is the top Group-of-6 team and the 23 best others.`,
        cost: "Champions are the current conference leaders; the 24-team bye count (8) is an assumption." },
    ],
    tried: [
      { what: "Ranking by the team rating and adding a note that it ignores results",
        result: "Rejected: a ranking that ignores results is the defect, not something to caption.",
        verdict: "rejected" },
      { what: "A near win/loss ranking (margin cap 7)",
        result: "Measured: 69.1% winners and 13.44 margin error against 70.0% and 13.18 at a cap of 28. A little worse, so margins stay in.",
        verdict: "rejected" },
      { what: "Rebuilding every classic page as a menu screen",
        result: "Not done: re-skinning them is the part that makes the app one product; rebuilding them is a much larger piece of work.",
        verdict: "rejected" },
    ],
    measured: [
      { label: "Winner picked correctly on later games (n = 2,781): rating only / rating + results", before: "62.5%", after: "70.0%" },
      { label: "Margin error, points: rating only / rating + results", before: "14.80", after: "13.18" },
      { label: "LSU's rank, 2026 through week 8: rating / power", before: "1", after: "2" },
      { label: "Kansas State's rank: rating / power", before: "8", after: "54" },
      { label: "Pipeline tests", before: "336 passed", after: "347 passed" },
      { label: "UI smoke checks", before: "123", after: "123 / 123" },
    ],
    gates: [
      { check: "python scripts/validate_rankings.py", result: "fitted weights 0.408 / 1.303 equal the constants (drift 0.0%)" },
      { check: "re-export against the app's data", result: "only the new power and results fields differ" },
      { check: "node tools/contrast-check.mjs and theme-check.mjs", result: "dark and light themes and the menu in both modes, green" },
    ],
    unfixed: `**LSU is still second.** Power says its results are strong. If you want a ranking that puts wins first, that is
      a different rule and needs its own backtest.

      **The weights are from one back-test** whose quality input (last season's rating) is not the one used in a season in
      progress, so the quality term is partly counted twice there.

      **The other pages still use their old layouts** in the new colours. Players, Teams, Ratings, Research, Methods, the
      Build Log and the rest are not laid out as console screens.

      **The classic home page is unlinked, not deleted.**

      **A real controller is still untested.**

      **Everything is uncommitted** in both repositories.`,
    methods: ["power-rating", "team-ratings"],
    files: ["utils/results_rating.py", "scripts/validate_rankings.py", "scripts/10_compute_team_ratings.py", "scripts/12_export_frontend_json.py",
            "scripts/17_live_season.py", "js/menuScreens.js", "js/menuScreensClass.js", "js/menuScreensLeague.js", "js/menuRouter.js",
            "js/menuChrome.js", "js/shell.js", "js/config.js", "js/dataLoader.js", "css/styles.css", "css/menu.css", "index.html", "menu.html"],
  },
  {
    id: "v4.11-team-ratings-and-team-screens",
    version: "v4.11",
    date: "2026-10-28",
    title: "Team ratings from each season's own players and stats; conferences by year; team recruiting, transfers and a map; a playoff picture",
    summary: `The owner's rule: every season's team rating should come from that year's player ratings and stats,
      and a season in progress should be built the same way and move with results. That removed SP+ from the
      team rating, at a measured cost. The same review found conferences were wrong in every season but the
      current one, player cards that took too long to open, and a roster screen that ordered by the
      projection in a season with earned ratings. Team-scoped recruiting and transfers (with a state map),
      a playoff picture, bye weeks and a quick menu were added.`,
    motivation: `The owner asked that team ratings follow the player ratings and stats of the same year, said
      Boise State showed as Pac-12 in every season, that player cards were not loading from the roster or
      depth chart, that the roster and depth chart should sort by the 2026 to-date rating, that bye weeks were
      missing, that controller back and year changes were awkward, that recruiting and transfers should be
      scoped to a team from inside a team, and asked about one quarterback's rating.`,
    did: [
      { what: "Team rating without SP+ (script 10)",
        why: `Overall is 0.60 roster plus 0.40 the team's own stats; offense and defense are the same two readings
          split into halves. SP+ stays as a reference column. The cost was measured on 2016 to 2025 before the
          change and is on the Methods page: same-season fit to scoring margin 0.884 to 0.880, next-season
          prediction 0.545 to 0.518 (below carrying last year's margin forward, 0.529), offense 0.847 to 0.806,
          defense 0.857 to 0.827. A placebo that shuffles the roster ratings across teams drops the fit from 0.880
          to 0.659, so the roster signal is real. Every played season from 2008 to 2025 was recomputed from the
          local cache with no API call; 2026 was recomputed and re-exported.`,
        cost: "Forward prediction is weaker. 2,309 team-seasons moved by +1.5 on average (sd 4.1, largest 11.9) and 2 lost their row. Team ratings stopped using SP+; the player ratings still use it for opponent adjustment." },
      { what: "Team stats are refreshed before they are read",
        why: "The order was reversed, so a season's first run blended no per-game stats. Checked on the 2,309 stored team-seasons: identical before and after.",
        cost: "None measured." },
      { what: "Conferences by season",
        why: `teams.json only has a team's current conference, so every season showed it: Boise State was a Pac-12
          team in 2008. Script 12 now reads each season's conference from the harvested season records (Western
          Athletic 2008 to 2010, Mountain West 2011 to 2025, Pac-12 in 2026). 733 of 2,447 team-seasons changed.
          A contract test checks every team-season against its record.`,
        cost: "The 2026 season has no record yet and falls back to the current conference, which is correct for it." },
      { what: "Player cards open at once",
        why: `The card read the whole career, which is every season's file, before it drew. It now draws
          immediately and fills a career strip from the last four seasons behind it. A rostered player with no
          ratings row opens from the roster row with a stated reason.`,
        cost: "The strip shows four seasons, not the whole career; the Players page has the full history." },
      { what: "Roster and depth chart ordered by the to-date rating",
        why: `A player with a 2026 to-date rating sorts above one without; then the projection; then last season.
          The roster screen is redesigned around a header strip for the selected player (class, size, home state,
          the three ratings) over a table with sortable columns: class, height, weight, state, stars and the three ratings.`,
        cost: "A starter with too few games for a to-date rating sorts below a rated backup. That follows the rule as asked." },
      { what: "Bye weeks, a quick menu, and controller prompts",
        why: `A week with no game shows as a BYE row in the schedule. Back at the top of the menu, Start or H, and a
          Menu prompt open a quick menu listing every screen. Back, Year and Menu are on every prompt bar so the
          way out and the year change are never a guess.`,
        cost: "H now opens the quick menu instead of jumping to the hub (the hub is its first item)." },
      { what: "Team recruiting class, team transfers and a state map; the league screens stay league-wide",
        why: `From a team's menu, Recruiting and Transfers show that team's class and moves. From the quick menu,
          Recruiting and Transfer Portal show the whole league. Each team screen has a tile map of the states
          lit by home state, and selecting a player lights his state. Script 18 now exports each team's class
          list and its state counts; script 12 adds the home state to every transfer row.`,
        cost: "The data has the home STATE only, so this is a state map, not a map of towns." },
      { what: "Playoff picture",
        why: `Who would be in a 4, 8, 12 or 24-team field by our ratings, seeded, with byes and the first-round
          pairings. The 12 reserves five places for conference leaders and seeds straight by rating; the 24 is the
          owner's description (top 24, top 8 on a bye) and is marked as an assumption.`,
        cost: "No game is predicted and no win probability is shown: no playoff model has been backtested." },
    ],
    tried: [
      { what: "Keeping SP+ at a smaller weight",
        result: "Not built: any SP+ weight is an outside number in the headline, which the owner's rule excludes. The full cost of removing it is measured and published instead.",
        verdict: "rejected" },
      { what: "Changing the quarterback interception weight to fit one player",
        result: "Not done. A single player is a reason to look at the data, not at a weight. The review is below.",
        verdict: "rejected" },
      { what: "Running the live chain with a placeholder API key to avoid any call",
        result: "It silently dropped SP+ from the player opponent adjustment (the subprocess output is hidden) and moved 3,726 to-date player ratings by 1.2 on average. Caught by comparing the two runs; reran with the real key, which reads the cache and makes no call.",
        verdict: "rejected" },
    ],
    measured: [
      { label: "Fit to same-season scoring margin, old / new team rating", before: "0.884", after: "0.880" },
      { label: "Prediction of next-season margin, old / new (last season's margin: 0.529)", before: "0.545", after: "0.518" },
      { label: "Team-seasons whose conference changed", before: "wrong in every season but the current", after: "733 of 2,447 corrected" },
      { label: "2026 preseason teams with offense = defense = overall", before: "138", after: "0" },
      { label: "Pipeline tests", before: "331 passed", after: "336 passed" },
      { label: "UI smoke checks", before: "118", after: "123 / 123" },
    ],
    gates: [
      { check: "pytest tests -q (pipeline)", result: "336 passed" },
      { check: "isolation of the re-export against the app's data", result: "player and roster files identical; team_ratings and team_history differ by the rating change; conference by season; transfers gain hometown_state" },
      { check: "cd tools/ui-smoke && npm run smoke", result: "123/123" },
    ],
    unfixed: `**Sam Leavitt (LSU QB), reviewed, not changed.** He has thrown 8 interceptions in 8 games (3.1% of 256
      attempts; the median rated QB is 2.1%, the 90th percentile 3.6%; 10 is the most). The rating charges each
      interception 20 yards-equivalent against 25 for a touchdown: 160 of his 2,823 raw composite points
      (5.7%). The rest of the line is strong: 70.3% completions, 8.5 yards an attempt, 2,171 passing yards,
      17 passing and 8 rushing touchdowns. His strongest games came against the best defenses (Clemson 1.36,
      Auburn 1.29, Texas A&M 1.27, Kentucky 1.19 opponent multipliers), which lifts his composite from 2,823 to
      3,284 (+16%). On the raw per-game composite he is 9th of 134 QBs and 7th after the schedule adjustment, but he
      is rated 2nd (91.9). My replay of his games gives an EDGE near 1,422, about 89.6 on the QB anchors, so
      2.3 points of his published rating are not explained and the gap is open. Whether 20 is the right
      interception cost is a calibration question that needs a backtest, not a one-player change.

      **The home page content is not redone.** The menu is the front door; the classic home still holds the old
      storylines. The playoff picture is the first new front-door content.

      **The old pages are not yet in the new look.** Players, Teams, Ratings, Research, Methods, Build Log and the
      rest still use the classic styling, and the theme switch is still there. Folding them into the menu's look is the next large piece of work.

      **The preseason team rating is still roster-only** and still ranks teams worse than last year's rating did.

      **Players' ratings still use SP+ for the opponent adjustment** (script 06).

      **A real controller is still untested.**

      **Everything is uncommitted** in both repositories.`,
    methods: ["team-ratings", "three-ratings", "live-season", "recruiting-class-rank"],
    files: ["scripts/10_compute_team_ratings.py", "scripts/12_export_frontend_json.py", "scripts/18_export_recruiting.py",
            "tests/test_team_ratings.py", "tests/test_export_contract.py", "js/menuScreensClass.js", "js/menuScreensTeam.js",
            "js/menuScreensLeague.js", "js/menuScreens.js", "js/menuChrome.js", "js/menuRouter.js", "js/menuFocus.js",
            "js/leagueData.js", "css/menu.css", "menu.html", "tools/ui-smoke/smoke.mjs"],
  },
  {
    id: "v4.10-menu-primary-and-rating-audit",
    version: "v4.10",
    date: "2026-10-28",
    title: "The Dynasty menu becomes the front door; player cards fixed; a rating audit",
    summary: `Three complaints after v4.9: the menu looked like a theme rather than the app, player cards
      had no 2026 data and did not connect to anything, and some ratings looked wrong, LSU's most of all.
      The menu is restyled to the early-2010s console football menu look from the owner's reference
      screenshots and is now what the site opens to. The cards were failing for 3,528 rostered players.
      The audit found a real defect in preseason team offense and defense, and measured that the
      preseason team rating ranks teams worse than last year's rating did. That second finding is
      reported here and not yet acted on.`,
    motivation: `The owner supplied six reference screenshots and asked for that look as the primary way to
      view the app, with light and dark modes; said cards had no 2026 data or connections; and asked why LSU
      is rated so high for 2026.`,
    did: [
      { what: "The menu restyled to the reference look, and made the front door",
        why: `Dusk-stadium background; a black glossy title bar with a red selector pill for the season;
          brushed-silver menu buttons that go black with red end caps when selected; team-coloured glossy tiles on
          team select; a black prompt bar with a round badge over a top-25 scores ticker. Dark (dusk) and light
          (daylight) modes on the M key and the Select button, remembered on the device; the page theme follows
          the mode so the rating pills repaint. index.html now redirects to menu.html; the old home is at
          index.html?classic and the sidebar's Home link points there. A new Analytics screen lists the
          existing pages (Players, Teams, Ratings, Research, Methods, Build Log and the rest).`,
        cost: "Design changes, stated: new chrome, a ticker, two modes, and a redirect. The pages behind Analytics keep their old look; restyling them is not done." },
      { what: "Player cards for every rostered player, with a career strip",
        why: `The card read only players_2026.json, which lacks 3,528 of the 16,882 rostered players (no
          projection and fewer than three games, or offensive line), so those cards said there was no data. It now
          falls back to the team roster row, states why there are no stat tiles, and adds a Career ratings strip
          (every earlier season, then the projection and to-date number).`,
        cost: "Roster rows carry no box-score stats, so those players still show none, now with the reason." },
      { what: "Preseason offense and defense withheld in the menu",
        why: `For an unplayed season every team's offense, defense and overall rating are the same number
          (138 of 138 in 2026, against 0 of 136 for 2025), so two identical bars read as a measurement. The menu
          now shows a dash with a tooltip. Earned-to-date offense and defense are real and still shown.`,
        cost: "The classic site's team pages still draw the identical bars. Not changed there." },
    ],
    tried: [
      { what: "Rebuilding preseason offense and defense from the position sub-ratings",
        result: `Measured against points scored and allowed per game, weeks 1 to 8, 137 teams: offense Spearman 0.360 (overall repeated) against 0.364 (sub-ratings); defense 0.338 against 0.329. The split carries no usable information (the offense minus defense gap has a standard deviation of 2.0 points), so it was withheld rather than redrawn.`,
        verdict: "rejected" },
      { what: "Restyling every classic page in the same pass",
        result: "Not done: the menu, cards and rating audit were the complaints. Deferred, and said so below.",
        verdict: "rejected" },
      { what: "A second browser theme for light mode",
        result: "Rejected in favour of a mode inside the menu's own token block, held to the contrast floors by contrast-check. The page theme follows it only so rating pills pick the right ramp.",
        verdict: "shipped" },
    ],
    measured: [
      { label: "Preseason team offense = defense = overall, 2026", before: "138 of 138 teams", after: "withheld in the menu" },
      { label: "Team rating vs average scoring margin against FBS opponents, weeks 1 to 8 (Spearman, 135 teams)", before: "2025 earned 0.486; 2025 SP+ 0.487", after: "2026 preseason 0.411; 2026 to date 0.809" },
      { label: "Player projections, mean change for players with a 2025 rating", before: "+3.0 (2023 to 24, n 5,099), +3.9 (2024 to 25, n 4,940)", after: "+4.1 (2025 to 26, n 5,805): in line, not a bias" },
      { label: "LSU", before: "2025 earned 80.4 (offense 71.8, defense 87.2, SP+ 10.3)", after: "2026 preseason 91.9 (+11.5, fifth); to date 92.4, first, while ranking 10th of 137 by margin (+18.8)" },
      { label: "Rostered 2026 players whose card had no data", before: "3,528 of 16,882", after: "0 (card opens, reason stated)" },
      { label: "UI smoke checks", before: "115", after: "118 / 118" },
    ],
    gates: [
      { check: "cd tools/ui-smoke && npm run smoke", result: "118/118" },
      { check: "node tools/contrast-check.mjs", result: "all floors green: dark, light, retro, and the menu in both of its modes" },
      { check: "node tools/doc-check.mjs, prose-check, theme-check, node --check js/*.js", result: "PASS" },
    ],
    unfixed: `**Why LSU is rated so high, answered, not fixed.** The 2026 preseason team rating comes only from the
      roster: the mean of a team's top 22 projected players blended with a position-weighted composite. It has no
      SP+, no offensive line and no schedule, and it does not look at what the team did last year. LSU's roster
      projects high (several 85 to 97 projections; 19 of its 71 rated players are new with no 2025 rating) so it
      lands at 91.9 against 80.4 earned in 2025. Player projections are not biased (above), but the team rollup
      ranks teams worse than last year's team rating did (0.411 against 0.486 on eight weeks), so the roster-only
      shape is the weak part. Blending the prior team rating in would likely help; it needs a back-test on past
      seasons and a placebo before it ships, and has not been built.

      **To-date LSU, 92.4,** is first by rating but tenth by scoring margin, and Indiana (92.3) is twentieth.
      Margin is only one view, with eight games of unequal schedules.

      **The pages behind Analytics keep their old look.** Making the whole site look like the menu is the next
      large piece of work.

      **A real controller is still untested,** and the look is from memory of screenshots, not the game.

      **The classic team pages still show identical preseason offense and defense bars.**

      **Everything is uncommitted** in both repositories.`,
    methods: ["three-ratings", "live-season"],
    files: ["css/menu.css", "js/menuChrome.js", "js/menuInput.js", "js/menuScreens.js", "js/menuScreensTeam.js",
            "js/dataLoader.js", "index.html", "js/shell.js", "tools/contrast-check.mjs", "tools/ui-smoke/smoke.mjs"],
  },
  {
    id: "v4.9-three-ratings-and-menu",
    version: "v4.9",
    date: "2026-10-28",
    title: "Three ratings on every 2026 player, fresh 2026 data, and a separate Dynasty menu",
    summary: `The 2026 data in the app was the August export: one number per player (the preseason projection),
      1,711 rostered players missing, and no sign that eight weeks had been played. This pass brings the whole
      season in and shows three ratings side by side on every 2026 roster row and player card (last season,
      the projection, and earned to date), then builds a second front-end that follows the layout of the
      early-2010s console football franchise menus.`,
    motivation: `The owner called the three ratings critical: 2025, the 2026 projection and the 2026
      in-progress calculation on every card and roster, with a missing one saying why. The menu was a separate
      request: not a skin but a screen-to-screen menu, mouse first, with game-controller support.`,
    did: [
      { what: "2026 re-exported from fresh data, with the three ratings per player",
        why: `Script 17 now writes a status for every rostered player (rated 5,468; too few games 2,115; no
          games 6,108; offensive line, not rated, 3,191; total 16,882) and script 12 joins 2025 earned, the
          projection and to-date into one row. players_2026.json grew by 1,199 rows to 13,354 and
          rosters_2026.json to 16,882. The class year landed in the same export (year removed, class_year added),
          which turned the three failing class-year contract tests green. An isolation diff against an export
          from the last commit's code showed no existing rating value changed: 65 files identical, the 38 player
          and roster files differ only by the added fields and rows.`,
        cost: "The grid gives up its Range and From columns to make room; the range moved into the card's projection tile. A design change, stated here." },
      { what: "Three-rating presentation: plain, hatched and accent-underlined pills",
        why: `Earned is a plain pill, the projection is hatched, to-date carries an accent underline, each with its
          own caption on the card and a stated reason when absent. The two change chips are labelled with what
          they are gaps between. Roster, grid, team hero and card all use the same helpers in ui.js.`,
        cost: "New markup and CSS (a trio strip and trio columns): a design change, stated here. The rating-history chart still shows only the projection point for 2026." },
      { what: "The Dynasty menu: menu.html and eight screens",
        why: `A separate app beside the site, not a replacement. Team select and a hub; roster, depth chart and
          player card; schedule, standings, rankings and the transfer portal; recruiting. One input layer turns
          mouse, keyboard and the Gamepad API into the same actions, with spatial focus, a prompt bar that
          switches between key and pad labels, and a connect toast. Standings, the portal and the depth order
          use the same functions as the existing pages (leagueData.js), so a record or a move is the same
          wherever it is drawn. Reachable from the sidebar and back from the hub.`,
        cost: "A large amount of new code. The layout is from memory of the style it follows, with original art and no assets, fonts or copy from any game." },
      { what: "Recruiting export and class rank (script 18)",
        why: `recruiting_{2020..2026}.json from data already on disk: the top 400 prospects per class and a class
          rank per team. 2026: 3,279 matched recruits, 139 teams, 115 ranked. A roster position-group fallback took
          null positions in the 2024 and 2026 boards from 392 of 400 to 0. A NaN that would have broken the
          browser's JSON parse was caught by the contract suite and fixed.`,
        cost: "About 20% of a class is unmatched and absent, and the rank is our own average, not a published ranking." },
      { what: "Team colours and logos held at their committed values",
        why: `The fresh team harvest returned the data provider's own colours and logo host: 95 teams' primary
          colour changed (Arizona navy to red, Arizona State maroon to gold, Army gold to black) and every logo
          moved from the ESPN host to the provider's. That would have recoloured the site unasked and moved the
          images, so the raw teams file was restored to the committed colour and logo for every team and the
          export re-run. Compared with the files in the app afterwards, 123 JSON files agree, and teams.json
          no longer differs from the last commit.`,
        cost: "The provider's current colours are not adopted; that is a separate, visible decision." },
    ],
    tried: [
      { what: "One blended 2026 number",
        result: "Rejected unbuilt: it would hide the disagreement the owner asked to see, and no backtest of a blend over half a season exists.",
        verdict: "rejected" },
      { what: "Leaving players with under three games out of the to-date file",
        result: "A blank cannot say whether a player has not played, has played twice, or is unrated by design; the status field can.",
        verdict: "rejected" },
      { what: "Running scripts 07, 15 and 16 to land the class year with the rest of the export",
        result: "Not run. Their class-year edits can move ratings, which is its own measured pass; script 12 derives the class year without touching a rating.",
        verdict: "rejected" },
      { what: "A phone rule written at the end of styles.css for the three-rating columns",
        result: "It lost silently: components.css loads after styles.css, so the desktop grid won at equal specificity and the players page scrolled 537px wide on a 375px phone. Found by the smoke suite, fixed by prefixing the selectors, kept.",
        verdict: "shipped" },
    ],
    measured: [
      { label: "2026 roster player-seasons in the app", before: "15,171", after: "16,882" },
      { label: "2026 players with any rating shown", before: "projection only", after: "13,354 rows, three ratings where they exist" },
      { label: "Rostered players with a stated to-date status", before: "5,468 (rated only)", after: "16,882" },
      { label: "Pipeline tests", before: "317 passed, 3 failed", after: "331 passed, 0 failed" },
      { label: "UI smoke checks", before: "105 / 106", after: "114 / 115 on the full run; the one failure was fixed and the shell (34/34) and menu (6/6) checks rerun green" },
      { label: "App functions documented", before: "148 / 148", after: "158 / 158" },
      { label: "Teams whose colour or logo differs from the committed site", before: "95 colour, 138 logo (fresh harvest)", after: "0" },
    ],
    gates: [
      { check: "pytest tests -q (pipeline)", result: "331 passed" },
      { check: "python scripts/validate_ratings.py --season 2025", result: "runs and prints the 2025 position distributions; ratings were not recomputed in this pass, and the isolation diff shows none moved" },
      { check: "cd tools/ui-smoke && npm run smoke", result: "114 of 115 on the full run; the one failure (a sidebar link inserted ahead of the data credit) was fixed and the shell and menu checks rerun green" },
      { check: "node tools/contrast-check.mjs", result: "all floors green: dark, light, retro and the menu's own token block" },
      { check: "node tools/theme-check.mjs, doc-check, prose-check, node --check js/*.js", result: "PASS, 158/158, clean, clean" },
      { check: "isolation diff of the export against the last commit's code", result: "no existing rating value changed" },
    ],
    unfixed: `**The menu's look is from memory.** I have not seen the game it follows; layout and interaction are my
      recollection and need your eye. Art, fonts and copy are original.

      **A real controller is untested.** The gamepad path is verified with a simulated pad that drives the whole
      menu and switches the prompt glyphs. Button layouts and stick drift on real hardware are for you to check.

      **Polls are not shown.** No poll data is on disk and fetching it needs a harvest that has not been approved.

      **The to-date number is provisional.** It runs about 7% high in the one back-test, needs three games, and is
      absent for offensive linemen, who have none of the three ratings.

      **The 2026 transfer portal has no "Now" rating:** that column reads the earned frame, which does not exist for
      2026 yet. The screen says so and points to the roster.

      **The rating-history chart** shows only the projection point for 2026, with no to-date marker.

      **Scripts 07, 15 and 16's class-year edits are still not run.** The exported class year is derived in script 12.

      **Team colours and logos stay at their committed values;** the provider's current ones were not adopted.

      **Everything is uncommitted** in both repositories.`,
    methods: ["three-ratings", "live-season", "recruiting-class-rank"],
    files: ["scripts/17_live_season.py", "scripts/12_export_frontend_json.py", "scripts/18_export_recruiting.py",
            "tests/test_export_contract.py", "tests/test_frontend_config.py", "menu.html", "css/menu.css",
            "js/menuInput.js", "js/menuFocus.js", "js/menuChrome.js", "js/menuRouter.js", "js/menuScreens.js",
            "js/menuScreensTeam.js", "js/menuScreensLeague.js", "js/leagueData.js", "js/ui.js", "js/teamsPage.js",
            "js/playerSearch.js", "js/dataLoader.js", "js/config.js", "js/guide.js", "css/components.css",
            "css/styles.css", "tools/ui-smoke/smoke.mjs", "tools/contrast-check.mjs",
            "data/recruiting_2026.json", "data/players_2026.json", "data/rosters_2026.json"],
  },
  {
    id: "v4.8-live-and-retro",
    version: "v4.8",
    date: "2026-10-27",
    title: "The 2026 season in progress, a retro skin, and the League screens",
    summary: `Three requests in one pass: pull this season's games and rate players and teams on them, build the
      roadmap's menu patterns with a retro skin, and finish the EA and Supabase cleanup. Rating a half-played
      season turned out to need a correction nobody had measured, because EDGE divides by the square root of
      games played and so a part-season scores low for the same play. The correction was back-tested on 2025
      cut at week 8 before it was used, and the whole live chain runs in a private data copy so a provisional
      row cannot reach anything that trains on history.`,
    motivation: `The owner asked for three things: implement the roadmap, especially the menu patterns and the
      retro skin; clean up EA and Supabase; and grab 2026 data and calculate ratings. The CFBD cache had no
      expiry, so a re-harvest would have silently returned August's preseason responses.`,
    did: [
      { what: "2026 harvested and rated to date, in isolation (script 17)",
        why: `Weeks 1 to 8: 2,321 of 3,681 regular-season games with a result, 35,182 per-game rows for 8,076
          players, rosters refreshed from 15,171 to 16,882 player-seasons. 442 of 30,000 monthly API calls used.
          Script 17 copies the data, points the store at the copy (CFB_DATA_DIR), runs 06 --in-progress, 07 and 10
          there, and exports live_2026.json: 138 teams and 5,468 rated players beside their preseason projections.
          Nothing was written to ratings.json, team_ratings.json or player_edge.json (checked afterwards: no 2026
          engine=edge player rows, 2026 team ratings still projected only).`,
        cost: "Players with under 3 games have no earned rating yet and are absent; more players sit on a recruiting basis than at season's end (TE 43% vs 31%)." },
      { what: "The pace correction, measured before use",
        why: `Final EDGE is 1.277x the week-8 EDGE at the median, so an unscaled part-season makes everyone look about
          28% worse. Multiplying by sqrt(games scheduled / games completed) brings the median to 0.933, about 7%
          above where players end up. Week-8 rank agrees with final rank at Spearman 0.857 (CB) to 0.949 (QB).
          scripts/validate_pace.py reproduces this on a private copy in 80 seconds.`,
        cost: "The overshoot is disclosed, not tuned away: one back-tested season is too few to fit a constant." },
      { what: "CFB_REFRESH_YEARS and CFB_DATA_DIR",
        why: `Two small switches with tests. CFB_REFRESH_YEARS=2026 makes the API client skip its cache for that
          year's requests, which the no-expiry cache could not do. CFB_DATA_DIR points the whole store at another
          folder, which is what makes provisional runs safe.` },
      { what: "The retro skin: a third theme, in the manner of the early-2010s console football menus",
        why: `One CONFIG.THEMES row, one token block (deep navy field, steel panels, white condensed type, one orange
          for the selected item, square corners), two palette keys, and a desktop-only layout block that turns the
          side rail into a top tab strip with banded boards. No page code. The contrast gate now iterates
          CONFIG.THEMES, so the new skin is held to the same floors. The 11 colour literals left outside the token
          blocks were moved to tokens (the roadmap's estimate of 35 was wrong) and a dead rule removed.`,
        cost: "A new --on-accent token replaces a fixed #000 on accent fills, which also improves the light theme. Design changes, stated here: a third theme, a top-strip layout, and square corners." },
      { what: "League: standings and the league-wide transfer portal (one nav entry, two tabs)",
        why: `Standings are derived from every team's schedule results and the season's conference membership,
          so they work for every season back to 2008 and for 2026 as it is played. The portal flattens the
          existing per-team transfer files to one row per move with the rating before and after. One hub rather
          than a page per screen, because a top tab strip holds about ten tabs.`,
        cost: "A new page and module: a design change, stated here." },
      { what: "Depth tab on the team page",
        why: `Position groups in the layout of a game-day depth chart, ordered by rating, empty groups omitted.
          It says it is not an official depth chart, because no source we hold has depth data.` },
      { what: "The '26 Season page rates the games played, and the copy that said otherwise is corrected",
        why: `A new Earned to date section (teams, players, the back-test numbers, a provisional notice). The home
          page and the global notice had said the season had not been played; they now say the ratings shown are
          preseason projections and point to the live section.` },
      { what: "Cleanup finished",
        why: "The five dead Supabase and database keys are out of the pipeline .env, which now holds only the CFBD key. The EA data stays removed; the archived copies are in archive/removed-ea." },
    ],
    tried: [
      { what: "Writing the part-season ratings into the normal edge engine",
        result: `Rejected before it was built. Script 15 trains on engine=edge, so a 2026 row built from eight
          games would have been read as a finished season. The private data copy makes that impossible by
          construction.`,
        verdict: "rejected" },
      { what: "No pace correction",
        result: "Measured, not assumed: 28% low at the median on the 2025 week-8 cut.",
        verdict: "rejected" },
      { what: "Re-running the whole export (script 12) to refresh 2026",
        result: `It would also have exported the half-landed class year and a roster that grew by 1,711 players,
          neither measured. Only the schedule file was regenerated, from the last commit's code, to carry the
          results.`,
        verdict: "rejected" },
      { what: "A nav entry per screen (Standings, Portal, Recruiting, Rankings)",
        result: "Four more tabs would not fit the retro top strip. One League hub with tabs instead.",
        verdict: "rejected" },
    ],
    measured: [
      { label: "Final EDGE / unscaled week-8 EDGE, 2025, median", before: "—", after: "1.277" },
      { label: "Final EDGE / rescaled week-8 EDGE, 2025, median", before: "1.277 unscaled", after: "0.933" },
      { label: "Live 2026 players rated of rostered", before: "0 earned", after: "5,468 of 16,882" },
      { label: "Live 2026 teams rated", before: "projection only", after: "138, through week 8" },
      { label: "Colour literals outside the CSS token blocks", before: "11", after: "0" },
      { label: "Themes held to the contrast floors", before: "2", after: "3" },
      { label: "API calls used (monthly limit 30,000)", before: "0", after: "442" },
      { label: "Pipeline tests", before: "309 passed, 3 failed", after: "317 passed, 3 failed (the same class-year three)" },
      { label: "UI smoke checks", before: "96 / 97", after: "105 / 106 (the class year)" },
      { label: "App functions documented", before: "138 / 138", after: "148 / 148" },
    ],
    gates: [
      { check: "pytest tests -q (pipeline)", result: "317 passed, 3 failed: the TestClassYear three, unchanged" },
      { check: "cd tools/ui-smoke && npm run smoke", result: "105/106; the failure is the un-exported class year" },
      { check: "node tools/contrast-check.mjs", result: "all floors green, dark + light + retro" },
      { check: "node tools/theme-check.mjs, doc-check, prose-check, node --check js/*.js", result: "PASS, 148/148, clean, clean" },
      { check: "production data untouched by the live run", result: "no 2026 engine=edge player rows; 2026 team ratings still engine=projected only" },
      { check: "python scripts/validate_pace.py", result: "reproduces the back-test: 1.277 unscaled, 0.933 rescaled" },
    ],
    unfixed: `**The reference for the retro skin is from memory.** It is my reading of the early-2010s console
      football menus (navy, steel, top tab strip, orange selection), not something I have seen. It needs your
      eye. It has been checked on five pages and the team, depth and League screens, not on every component.

      **The class year is still not exported** (3 contract tests, 1 UI check). Landing it now would have meant
      moving ratings with no measurement.

      **The app's 2026 players and rosters are still the August export**, while the harvested rosters have 1,711
      more player-seasons. Only the schedule file was refreshed. Re-exporting is blocked on the class year.

      **Not re-harvested:** the 2026 transfer portal, the 2026 recruiting class, and the supplemental datasets
      other than team_advanced_season.

      **Not built from the roadmap:** the recruiting board (needs an export), prestige, the development-trait
      and redshirt analogues, M0.7 (the 186 MB first player card), and rankings from polls, which need an API
      call and your approval.

      **The pace correction runs about 7% high** and has been back-tested on one season.

      **30 FBS-team games** have no opponent score and count as neither a win nor a loss.

      **The retro layout applies above 900px only;** phones get the normal mobile layout in retro colours.`,
    methods: ["live-season", "ea-removed"],
    files: ["scripts/17_live_season.py", "scripts/validate_pace.py", "scripts/06_compute_edge_scores.py",
            "utils/store.py", "utils/api_client.py", "tests/test_api_cache.py", "tests/test_store_data_dir.py",
            "tests/test_frontend_config.py", "js/leaguePage.js", "league.html", "js/season2026.js", "js/teamsPage.js",
            "js/config.js", "js/shell.js", "js/dataLoader.js", "js/ui.js", "js/home.js", "css/styles.css",
            "css/components.css", "tools/contrast-check.mjs", "tools/ui-smoke/smoke.mjs",
            "data/live_2026.json", "data/schedules_2026.json"],
  },
  {
    id: "v4.7-ea-removed",
    version: "v4.7",
    date: "2026-10-27",
    title: "EA CFB 27 removed from the project, and Supabase moved out of the repos",
    summary: `Two removals, both at the owner's request. The EA Sports CFB 27 ratings (9,013 players,
      54 attributes each, one scraped season) are gone from the data, the pipeline and every screen. The
      retired Supabase files left the working repos. Removing EA turned up a dependency nobody had
      listed: for 273 players it had been the last-resort source of a projection, and those projections
      fed 93 teams' ratings.`,
    motivation: `The owner asked for the EA ratings to be removed and for the Supabase project to be
      archived and taken out of the main repos. The project is personal and shared with friends. The
      facts that bear on the EA decision: it was scraped rather than licensed, and was published whole in
      a public repo.`,
    did: [
      { what: "Measured before changing anything: the chain reproduced the committed export",
        why: `The pipeline had uncommitted class-year edits in scripts 07, 12, 15 and 16, and re-running
          16 would have landed them silently along with the EA removal. So the data run used an unmodified
          copy of the last commit. Control run first: 124 of 125 exported files reproduced exactly, the
          other being a timestamp. Only then was EA removed and the chain re-run, so the EA effect is
          the whole of the data diff.`,
        cost: "The class-year change is still not landed, and the 3 contract tests and 1 UI check for it still fail." },
      { what: "EA removed from the pipeline",
        why: `Script 16 loses its fourth source (ea_cfb27) and every ea_ovr field. Script 12 stops
          reading, slimming and exporting EA, and the ea_ovr column leaves every player and roster row.
          validate_ratings.py loses its EA agreement section. Script 08, the harvester, is gone. The
          test that checked EA_SEASONS against files on disk became a guard that fails if EA data is ever
          exported again.`,
        cost: "The only per-position cross-section the ratings had is gone. What remains outside is the draft backtest, reliability and the distribution report." },
      { what: "EA removed from the app, and its slot in the projected board filled with data we own",
        why: `The published ea_ratings_2026.json, the EA comparison on the '26 page, the whole
          "Where we disagree with EA" story, the EA block on the player card and the EA column are gone.
          On a projected season that column now shows the model's own 80% interval (projectionRangeCell),
          which already existed in the data and was shown nowhere. The attribute-bar CSS had been named
          for EA and is shared with our own archetype bars, so it was renamed.`,
        cost: "Players with no projection and no EA now show a dash in that column." },
      { what: "EA data archived outside the repos, not destroyed",
        why: "The raw harvest, the published file and the harvest script are in archive/removed-ea with byte-verified copies. The owner can delete them." },
      { what: "Supabase moved out",
        why: `The nine retired SQL files and the one-time dump script moved to the portfolio
          archive/supabase (copies verified before removal). Two README references repointed.`,
        cost: "The five dead connection keys in the pipeline .env were NOT removed: that file is not in git, an edit cannot be undone, and the automatic safety check declined it. They are listed under unfixed." },
    ],
    tried: [
      { what: "Re-running the chain in the working tree, class-year edits and all",
        result: `Rejected. Script 16 uses the derived class year to pick cohort deltas, so the
          projections would have moved for two reasons at once and neither could be measured.`,
        verdict: "rejected" },
      { what: "A first control run from a scratch copy of the pipeline",
        result: `It silently read no trajectory file, because script 16 finds it by a path relative
          to its own location, and wrote a degraded set of projected rows into the shared ratings file:
          engine_d 0 instead of 3,987. Caught from the printed source mix and restored byte-identical
          from a backup taken beforehand. The folder layout was then corrected and the control re-run.`,
        verdict: "rejected" },
      { what: "Keeping EA as a last-resort projection source, but hidden from the UI",
        result: "It would keep feeding team ratings with a number the rule says EA never supplies, so it was removed.",
        verdict: "rejected" },
      { what: "Deleting the raw EA file and the harvester outright",
        result: "Irreversible for a one-season, not-backfillable dataset. Archived and then removed from the repos instead.",
        verdict: "rejected" },
    ],
    measured: [
      { label: "Control run vs the committed export", before: "—", after: "124 of 125 files identical (manifest timestamp only)" },
      { label: "Player and roster files, 2008 to 2026", before: "carry ea_ovr", after: "identical except the ea_ovr field removed; 2026 also loses 273 rows' projections" },
      { label: "2026 projected rows", before: "12,428", after: "12,155" },
      { label: "2026 projection source mix", before: "engine_d 3,987 / carry 1,818 / recruiting 3,448 / ea_cfb27 273 / no signal 2,743", after: "engine_d 3,987 / carry 1,818 / recruiting 3,448 / ea_cfb27 0 / no signal 3,016" },
      { label: "2026 projected team rating", before: "—", after: "93 of 138 teams changed; mean −0.91, largest −4.17" },
      { label: "2026 projected Top 25", before: "—", after: "Colorado out, Vanderbilt in; Oregon and Texas A&M swap 8th and 9th" },
      { label: "Projected spread vs last season's earned spread", before: "75–77%", after: "77% (gate band 60–140%)" },
      { label: "Pipeline tests", before: "309 passed, 3 failed", after: "309 passed, 3 failed (the same class-year three)" },
      { label: "UI smoke checks", before: "97 / 98", after: "96 / 97 (one EA check removed, one range check added; the failure is the class year)" },
      { label: "App functions documented", before: "143 / 143", after: "138 / 138 (five EA functions deleted)" },
    ],
    gates: [
      { check: "pytest tests -q (pipeline)", result: "309 passed, 3 failed: the TestClassYear three, unchanged" },
      { check: "cd tools/ui-smoke && npm run smoke", result: "96/97; the failure is the un-exported class year" },
      { check: "projection distribution gate (script 16)", result: "passed, spread 77% of last season's earned" },
      { check: "node tools/doc-check.mjs, prose-check, contrast-check, theme-check", result: "138/138, clean, green, PASS" },
      { check: "node --check js/*.js", result: "clean" },
      { check: "a scan of every changed file for stray control characters", result: "none (an escaping slip had planted backspace characters in one test and was caught and fixed)" },
    ],
    unfixed: `**The five dead Supabase connection keys are still in cfb-analytics-pipeline/.env**, and the
      Supabase project itself still exists. Archiving it is a dashboard action. The project URL and a
      public anon-role key remain in the app repo's git history, which was not rewritten.

      **The class-year change is still half-landed**, and this pass deliberately did not touch it.

      **Per-position outside validation is gone.** Nothing now says whether a position is rated too high
      or low against any opinion but our own. A replacement would need a new outside source.

      **Historical figures that quote EA remain in METHODS, the pipeline docs and the older Build Log
      entries.** They were true when measured and cannot be reproduced; the ea-removed entry says so
      rather than editing history.

      **273 players now have no 2026 projection**, mostly JUCO arrivals and reserves with no production.

      **The raw EA files are still on disk** in archive/removed-ea until the owner deletes them.`,
    methods: ["ea-removed"],
    files: ["scripts/12_export_frontend_json.py", "scripts/16_project_ratings.py", "scripts/validate_ratings.py",
            "tests/test_frontend_config.py", "tests/test_export_contract.py", "js/ui.js", "js/playerSearch.js",
            "js/teamsPage.js", "js/season2026.js", "js/findings.js", "js/dataLoader.js", "js/config.js",
            "js/guide.js", "js/methods.js", "css/components.css", "season2026.html", "js/shell.js",
            "tools/ui-smoke/smoke.mjs", "data/ (43 exports regenerated, ea_ratings_2026.json removed)"],
  },
  {
    id: "v4.6-foundations",
    version: "v4.6",
    date: "2026-10-27",
    title: "Foundations for an EA-style shell: school marks, keyboard access, and a skin contract",
    summary: `No rating or projection moved. The product roadmap (docs/ROADMAP.md at the portfolio
      root) puts four things ahead of any EA-style screen: a logo system that survives missing marks,
      a site a keyboard can operate, a theme list that is data instead of a hard-coded pair, and
      stale claims removed. This pass does those four, offline, and nothing that needs new data.`,
    motivation: `A read-only evaluation found 139 of 139 team logos are plain http:// ESPN URLs with
      no handling for a failed load, player rows that are clickable divs a keyboard cannot reach,
      a theme switcher that accepted exactly "dark" or "light" in four places, a sidebar that said
      v3.2.0 against a v4.5 registry, and no attribution to CollegeFootballData.com anywhere.`,
    did: [
      { what: "teamMark() in ui.js: the logo, or a monogram, at every call site",
        why: `All twelve places that drew a logo now call one helper. It upgrades http to https,
          renders the abbreviation on the team colour with text colour from the luminance guard
          when there is no logo, and a capture-phase error listener swaps the monogram in place when
          a logo fails to load. School marks are trademarks, so the app has to look complete with
          every logo switched off; the logo is now the optional upgrade.`,
        cost: "Four-letter abbreviations widen the 28px tile mark to fit. A design change, stated here: one new component class (team-mark) on existing tokens." },
      { what: "Keyboard access: makeActivatable(), dialog semantics, focus trap and return, skip link, focus ring",
        why: `Player rows on the Players board, the team roster, the Ratings top-performer rows and
          the similar-player rows were divs with click handlers, so no player could be opened without a
          mouse. They are now focusable buttons (Enter and Space; a key pressed on a link inside the row
          still follows the link). The player modal has role=dialog, aria-modal, a Tab trap and returns focus
          to the row that opened it. Roster and board sort headers are focusable and sortable from the
          keyboard. A skip link leads the tab order, and :focus-visible draws one ring on every control.`,
        cost: "A visible focus ring now appears for keyboard users on every control. A design change, stated here." },
      { what: "The skin contract: CONFIG.THEMES, and tools/theme-check.mjs",
        why: `The theme list lived as a dark/light pair in shell.js, _activeTheme() and two CSS
          swatch rules with colour literals. It is now one array in config.js; shell.js builds its
          swatches and validates saved choices from it, and the swatch colours moved out of CSS into the
          palette file where literals are allowed. theme-check.mjs fails if a listed theme lacks a CSS
          token block (and the colour core of it), a POS_COLORS or RATING_RAMP entry, or hex swatch
          colours. Adding a skin is now one row, one CSS block and two palette keys.`,
        cost: "None visually. It proves the seam for what is tokenised; see unfixed for what is not." },
      { what: "Sidebar version v3.2.0 to v4.6.0, and a CollegeFootballData.com credit",
        why: `The version was three releases stale. The credit is attribution, not a licensing
          decision: whether the site may republish CFBD-derived data is still unresolved.` },
      { what: "Four new smoke checks (94 to 98)",
        why: "Skin contract and credit, logo failover to monogram, keyboard open with focus trap and return, keyboard sort." },
    ],
    tried: [
      { what: "Roadmap item M2 as first written: add sortable roster headers",
        result: `They already existed (makeGridSortable, May 2026). The roadmap said the roster was
          sorted by OVR only because an exploration report said so and it was not checked against the
          code. The real gap was that the headers were click-only, so that is what was fixed. The
          roadmap was corrected in the same pass.`,
        verdict: "shipped" },
      { what: "Marking the main column as the skip-link target from shell.js at injection time",
        result: `The shell runs at the top of body, before the main column exists, so the query
          returned null and the link navigated to nothing. Caught by the new smoke check; the marking
          now waits for DOMContentLoaded.`,
        verdict: "rejected" },
      { what: "A 14px colour dot with the letters hidden, as the monogram for inline marks",
        result: "Needs font-size 0 or text under 12px, which the type floor forbids. The inline monogram is a 12px uppercase label instead, slightly wider than the logo it replaces.",
        verdict: "rejected" },
      { what: "Making each player row a real button or link",
        result: "The row is a grid with a team link inside it, and a link inside a button is invalid. A focusable row that ignores keys pressed on its inner links does the job without changing the markup.",
        verdict: "rejected" },
      { what: "Re-running scripts 07 to 12 to land the class year in this pass",
        result: `Not done. It is local compute but it moves ratings and projections under a change that
          still has no measurement and no entry. The one failing UI check is left failing on purpose.`,
        verdict: "blocked" },
    ],
    measured: [
      { label: "Team logo URLs that are plain http", before: "139 of 139", after: "0 rendered (upgraded to https in teamMark)" },
      { label: "Player entry points reachable by keyboard (board, roster, top performers, similar rows)", before: "0", after: "all four" },
      { label: "Places that hard-code the theme pair", before: "4 (shell.js, _activeTheme, two CSS swatch rules)", after: "1 (CONFIG.THEMES)" },
      { label: "UI smoke checks passing", before: "93 / 94", after: "97 / 98 - the class-year export" },
      { label: "App functions documented (doc-check)", before: "138 / 138", after: "143 / 143" },
      { label: "Sidebar version", before: "v3.2.0", after: "v4.6.0" },
    ],
    gates: [
      { check: "cd tools/ui-smoke && npm run smoke", result: "97/98; the failure is the un-exported class year (see tried)" },
      { check: "node tools/theme-check.mjs", result: "PASS - dark and light have token blocks, palette keys and swatches" },
      { check: "node tools/contrast-check.mjs", result: "all floors green, dark + light" },
      { check: "node tools/doc-check.mjs", result: "143/143" },
      { check: "node tools/prose-check.mjs", result: "all registry prose renders clean" },
      { check: "node --check js/*.js", result: "clean" },
      { check: "pytest (pipeline)", result: "not run for this pass; the pipeline was not touched" },
    ],
    unfixed: `**The class year is still not exported.** Every Yr cell still shows a dash and the one
      failing UI check and three pipeline contract tests are the same defect. It needs a measurement,
      its own entry, then a rerun of 07 to 12.

      **A retro skin is not yet only a token block.** theme-check proves the contract for what is
      tokenised. Still outside it: about 35 colour literals left in styles.css and components.css, the
      Google Fonts link in every HTML file, emoji icons in the navigation, and layout markup baked into
      template strings in shell.js and teamsPage.js. A skin that changes only colour works today; one
      that changes layout or type needs those moved first.

      **Keyboard access is partial.** Rows, sort headers and the modal are covered. Arrow-key
      movement within lists, hotkeys for switching tabs, and several other click-only elements (the
      conference-standing chip, for one) are not.

      **The first player card still downloads every season's player file, 186 MB.** The per-player
      history index is a pipeline export change and was not attempted here.

      **No depth chart, redshirt flag, development trait, league-wide standings table or poll
      rankings exist.** The roadmap sequences them; each needs a derived definition with its own
      backtest or, for the polls, an API call that this phase excludes.

      **No licensing position.** The EA ratings file is still published whole and CFBD terms are
      unchecked; the new credit does not settle either. Both repos still hold uncommitted work,
      including the untracked guide files that info.html needs.`,
    methods: [],
    files: ["js/ui.js", "js/config.js", "js/shell.js", "js/playerSearch.js", "js/teamsPage.js",
            "js/home.js", "js/season2026.js", "js/findings.js", "css/components.css", "css/styles.css",
            "tools/theme-check.mjs", "tools/ui-smoke/smoke.mjs"],
  },
  {
    id: "v4.5.1-site",
    version: "v4.5.1",
    date: "2026-09-23",
    title: "Documenting the code, writing the site's own guide, and testing every control",
    summary: `No rating moved in this pass. It measured three things nobody had measured: how much of
      the code explains itself, whether the site's own explanation page still matched the code, and
      whether every panel and control on every page actually works. The answers were 60%, no, and
      no — 21 of the first 90 automated UI checks failed: three on bugs in the test, eighteen on
      real defects with twelve distinct causes. More turned up while writing the guide.`,
    motivation: `A request to bring the in-code documentation and coding standard up, write
      documentation into the app, and confirm every UI panel and action works. Measured first: 167
      of 383 pipeline functions and 86 of 213 app functions had no docstring or comment; no coding
      standard existed in either repo; there was no browser test of any kind. Reading info.html
      against the code found it wrong in at least six places.`,
    did: [
      { what: "A headless UI suite: every page, panel and control (tools/ui-smoke/smoke.mjs)",
        why: `94 checks driving system Chrome against a static server that 404s exactly as GitHub
          Pages does. A check fails on its own assertion, or on ANY script error, console error or
          failed request during it — so a broken panel nobody looked at still fails. Covers the shell
          (nav, theme, 375px layout on 9 pages), every filter, chip, tab, sort, picker, modal close
          path and deep link, every registry page, and every internal link and #anchor.`,
        cost: "A dev-only package.json under tools/; nothing the site serves loads it." },
      { what: "Fifteen UI defects fixed",
        why: `Theme switch doubled the Players position chips and reset the active one (14 → 28).
          Escape stopped closing the player card after any other keypress. players.html?player=ID —
          the link every page emits — did not open the player; teams.html?season= was ignored. The DB
          chip showed only bare-"DB" rows, dropping every corner and safety. Teams conference chips
          never followed the season picker. The Ratings team picker stacked one listener per season
          visited. The phone layout scrolled sideways on Ratings (616px) and the Build Log (409px).
          Three kinds of file were requested for seasons that have none (similar_players, team_stats,
          ea_ratings) — a 404 on every card or Ratings tab opened on those seasons. A dead #anchor. Home's "Last Season's
          Standard" showed 2026 projections. A filter click during a fetch was dropped.`,
        cost: "None to any number; the Players DB board now lists up to 300 rows (100 per member group)." },
      { what: "Two displays withdrawn rather than fixed",
        why: `The scatter tooltip's movement and the card's "rating up N from last season" line both
          read \`trajectory\`, which the export carries as exactly 0.0 on all 22,523 played-season rows
          and null on 2026. The tooltip said "→ 0.0" for every player; the card line could never
          appear. A number that cannot show its evidence does not ship.`,
        cost: "The tooltip no longer shows movement. Real movement is the card's rating-history chart." },
      { what: "info.html rebuilt as a registry-driven user guide (GUIDE, js/guide.js)",
        why: `The old page restated formulas and had drifted: a symmetric [0.55, 1.45] opponent
          multiplier (the code is 0.76–1.70), defensive weights wrong in three of five cards (CB
          interceptions ×8 against ×12 in the code) and blind to fumble recoveries and the secondary's
          archetype scoring, a 45/35/15/5 team blend (live: 50/30/20, no recruiting term), "team
          ratings for 2025 only", and three different version numbers. The guide restates no formula:
          it links every number to its METHODS entry, reads accuracy live from trajectory.json, and
          draws its glossary of every mark with the same helpers the site uses, so the example cannot
          disagree with the page. It documents each page's panels and controls, deep links, and what
          each page cannot tell you. #projections and #ol still resolve.`,
        cost: "A design change, stated here: a new registry, renderer and six CSS rules on existing tokens. The per-position weight cards are gone from the site; they live on in docs/FORMULAS.md and the code." },
      { what: "prose() lets **bold** wrap a line",
        why: `Registry prose is hard-wrapped, and a bold span that wrapped rendered as literal
          asterisks. Three fields in two live Build Log entries did (v4.5-basis, v4.3-ratings). tools/prose-check.mjs
          now runs every registry field through prose() and fails on leftover markup.` },
      { what: "Inline documentation to 100% under a written rule, with the rule enforced",
        why: `Pipeline: 282/282 functions over five lines (and every main) now have docstrings, from
          180/282, enforced by tests/test_docstrings.py. App: 138/138 from 71/135, enforced by
          tools/doc-check.mjs. Each docstring was written from the code, and where the code differs
          from what its name suggests the docstring says so — which is how the script 10, 02, 13 and 14
          items in "did not fix" were found.`,
        cost: "Comment and docstring lines only; the insertion tool adds lines and never edits one." },
      { what: "CODING_STANDARDS.md in both repos",
        why: "Every rule paired with its enforcement, and every rule that exists because something broke names the break." },
      { what: "Dead code removed",
        why: `Script 10's W_SP / W_ROSTER / W_RAW (0.45/0.30/0.25), declared, never read, and
          disagreeing with the live 0.50/0.30/0.20 blend; an unused modalLoadingHtml(); two direct
          fetch() calls with private caches, now through _load().` },
    ],
    tried: [
      { what: "Correcting the six stale facts in info.html and keeping it hand-written",
        result: `Rejected. It drifted because it was a second copy of the formulas; correcting it
          restores the copy and the drift. The guide links to the one copy instead.`,
        verdict: "rejected" },
      { what: "Routing the DB chip through matchesPosition() inside fetchPlayers()",
        result: `Rejected. The ALL board also fetches the "DB" group, and with group matching its
          top-100 batch fills with corners and safeties already counted, dropping the bare-DB players
          it exists to include. The group is expanded at the call site instead.`,
        verdict: "rejected" },
      { what: "Rewrapping the three broken Build Log entries onto single lines",
        result: `Rejected in favour of fixing prose(): rewrapping fixes three entries and leaves the
          trap for the next one.`,
        verdict: "rejected" },
      { what: "Reading EA seasons from manifest.json instead of a new CONFIG.EA_SEASONS",
        result: `Blocked. The manifest carries no EA field; adding one needs an export change and a
          re-export. CONFIG.EA_SEASONS is guarded against the files on disk by
          tests/test_frontend_config.py in the meantime.`,
        verdict: "blocked" },
      { what: "Finishing the class-year change by re-running 07 → 12",
        result: `Not done. The code for a derived class year has sat uncommitted since 2026-08-18
          (scripts 07/12/15/16, utils/class_year.py, four app files); the app reads class_year but the
          export was never re-run, so every Yr cell on the site shows "—" (1,120/1,120 on the default
          board) and three contract tests fail. Re-running would move ratings and projections under a
          change with no CHANGES entry and no measurement. The UI check that catches it is left failing.`,
        verdict: "blocked" },
    ],
    measured: [
      { label: "Pipeline functions documented (module-level, > 5 lines or main)", before: "180 / 282", after: "282 / 282" },
      { label: "App functions documented (top-level, > 5 lines)", before: "71 / 135", after: "138 / 138" },
      { label: "UI smoke checks passing", before: "69 / 90 (first run)", after: "93 / 94 — the class-year export" },
      { label: "Failed requests per player card, default season", before: "1 (similar_players_2026)", after: "0" },
      { label: "Page width at 375px, Ratings / Build Log", before: "616px / 409px", after: "375px / 375px" },
      { label: "Registry prose fields rendering literal **", before: "3", after: "0" },
      { label: "Factual contradictions of the code on info.html", before: "≥ 6", after: "0 — it states no formula" },
    ],
    gates: [
      { check: "cd tools/ui-smoke && npm run smoke", result: "93/94; the failure is the un-exported class year (see tried)" },
      { check: "node tools/doc-check.mjs", result: "138/138" },
      { check: "node tools/prose-check.mjs", result: "all registry prose renders clean" },
      { check: "node --check js/*.js", result: "clean" },
      { check: "node tools/contrast-check.mjs", result: "all floors green, dark + light" },
      { check: "pytest tests/ -q (pipeline)", result: "the 3 TestClassYear failures only — pre-existing, same cause" },
    ],
    unfixed: `**The class-year change is half-landed** and the site shows "—" for every class year until
      someone owns it: measure it, write its CHANGES entry, and run 07 → 12.

      **Script 10 blends the previous run's team stats.** \`run_season\` reads team_season_stats
      before refreshing it for the season, so each run uses the last run's numbers and a season's
      first run uses none. Fixing it moves team ratings and needs its own measured pass.

      **The first player card on any page downloads every season's player file** — 186 MB over 19
      files — to draw one career. The slim/detail export split on the backlog is the fix.

      Recorded in docstrings, not changed: script 02's name matcher guesses on an ambiguous exact
      name where 03's refuses; script 13's P5 flag reads each team's current conference for every
      season; script 14's \`maturing\` flag depends on the date it runs. modalContentHtml() is still
      one 300-line function. The sidebar still says v3.2.0. 🔥 cannot appear on 2026, which carries
      no breakout probability.`,
    methods: [],
    files: ["tools/ui-smoke/smoke.mjs", "tools/doc-check.mjs", "tools/prose-check.mjs",
            "js/guide.js", "js/guidePage.js", "info.html", "CODING_STANDARDS.md",
            "js/playerSearch.js", "js/teamsPage.js", "js/ratingsDisplay.js", "js/home.js",
            "js/ui.js", "js/config.js", "js/dataLoader.js", "css/styles.css",
            "pipeline: docs/CODING_STANDARDS.md", "pipeline: tests/test_docstrings.py",
            "pipeline: tests/test_frontend_config.py", "pipeline: scripts/*.py docstrings"],
  },
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
