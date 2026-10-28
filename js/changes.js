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
