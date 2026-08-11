// findings.js — the registry every research page and storyline page is built from.
//
// A "finding" is a claim with evidence behind it. Research findings are
// analyses the pipeline computes; storylines are slices of existing data that
// the home page surfaces one row of. Both are the same shape, so both get a
// real page for free and neither needs bespoke HTML.
//
// Adding a finding = one entry here + one ~30-line HTML shell that calls
// initFinding("<id>"). No new table, chip, heading or filter code.
//
// Entry contract
// ──────────────
//   id          registry key, matches the shell's initFinding() argument
//   kind        "research" | "storyline"   — which index it appears in
//   status      "live" | "upcoming"        — upcoming renders the prose only
//   page        the HTML file that hosts it (used by the indexes to link out)
//   eyebrow     short uppercase label
//   title       the page's h1
//   claim       the standfirst — a claim, not a description
//   question    what the finding actually answers, one line, for the index card
//   load()      → { rows, meta }            — rows drive the table
//   headline(rows, meta) → string|null      — computed stat for the index card
//   stats(rows, meta)    → [{value,label}]  — hero tiles above the table
//   filters, columns, sort, rowClass, maxRows — passed to the shared table
//   method      how it is computed, shown under the table
//   limitations what it cannot see — required; every finding has some
//
// Load order: config.js, shell.js → dataLoader.js, ui.js, dataTable.js,
// playerSearch.js (for the modal), findings.js, findingPage.js.

const PLAYED_SEASON = CONFIG.LAST_PLAYED_SEASON;
const PROJ_SEASON   = CONFIG.CURRENT_SEASON;

const _pct = v => (v == null ? "—" : `${v.toFixed(1)}%`);
const _fx  = (v, n = 1) => (v == null ? "—" : v.toFixed(n));

const FINDINGS = {

  // ── Research: team performance vs recruiting talent (script 13) ──────────
  "team-performance": {
    id: "team-performance",
    kind: "research",
    status: "live",
    page: "research-team-performance.html",
    eyebrow: "TEAM ANALYSIS",
    title: "Who beats the roster they recruited",
    claim: "Recruiting sets a floor, not a ceiling. The gap between what a program signs and " +
           "what it does on the field is the closest thing we have to a coaching measurement.",
    question: "Which programs consistently outperform the talent they sign?",

    async load() {
      const rows = await _load("team_performance.json");
      return { rows: rows || [], meta: {} };
    },
    headline(rows) {
      const r2 = rows.find(r => r.regression_r2 != null)?.regression_r2;
      return r2 != null
        ? `Recruiting talent explains ${Math.round(r2 * 100)}% of team performance. The rest is what we grade.`
        : null;
    },
    stats(rows) {
      const cur = rows.filter(r => r.season === PLAYED_SEASON && r.performance_residual != null);
      if (!cur.length) return [];
      const best = cur.reduce((a, b) => (b.performance_residual > a.performance_residual ? b : a));
      const worst = cur.reduce((a, b) => (b.performance_residual < a.performance_residual ? b : a));
      const r2 = rows.find(r => r.regression_r2 != null)?.regression_r2;
      return [
        { value: `+${_fx(best.performance_residual)}`, label: `${best.school} — most above expectation, ${PLAYED_SEASON}` },
        { value: _fx(worst.performance_residual), label: `${worst.school} — furthest below` },
        { value: r2 != null ? `${Math.round(r2 * 100)}%` : "—", label: "of performance explained by talent alone" },
        { value: rows.length.toLocaleString(), label: "team-seasons graded" },
      ];
    },
    sort: { key: "performance_residual", asc: false },
    maxRows: 300,
    rowClass: r => {
      const v = r.performance_residual;
      return v != null && v > 8 ? "row-over" : v != null && v < -8 ? "row-under" : "";
    },
    filters(rows) {
      const seasons = [...new Set(rows.map(r => r.season))].sort((a, b) => b - a);
      const confs = [...new Set(rows.map(r => r.conference).filter(Boolean))].sort();
      return [
        { id: "season", type: "select", value: String(PLAYED_SEASON),
          options: [{ value: "ALL", label: "All Seasons" }, ...seasons.map(s => ({ value: s, label: s }))] },
        { id: "conf", type: "select", value: "ALL",
          options: [{ value: "ALL", label: "All Conferences" }, ...confs.map(c => ({ value: c, label: c }))] },
      ];
    },
    apply: (rows, v) => rows.filter(r =>
      (v.season === "ALL" || String(r.season) === String(v.season)) &&
      (v.conf === "ALL" || r.conference === v.conf)),
    columns: [
      { key: "school", label: "School", fmt: (v, r) => {
          const link = teamLink(v, { season: r.season });
          return r.talent_imputed
            ? `${link} <span class="badge-imputed" title="Talent estimated from conference median">est</span>`
            : link;
        } },
      { key: "season", label: "Season", num: true },
      { key: "conference", label: "Conf", fmt: v => _esc(v || "—") },
      { key: "talent_normalized", label: "Talent", num: true, fmt: v => _fx(v) },
      { key: "sp_overall", label: "SP+", num: true, fmt: v => _fx(v) },
      { key: "sp_predicted", label: "Expected", num: true, fmt: v => _fx(v) },
      { key: "performance_residual", label: "Residual", num: true,
        title: "Actual SP+ minus expected SP+ from recruiting talent",
        fmt: v => v != null ? deltaChip(v, { title: "SP+ vs talent expectation" }) : "—" },
      { key: "performance_percentile", label: "Pctile", num: true, fmt: v => v != null ? `${v.toFixed(0)}%` : "—" },
      { key: "coaching_change_flag", label: "New HC", fmt: v => v ? "✓" : "" },
    ],
    method: `Actual SP+ is regressed on a 3-year rolling recruiting-talent composite plus a
      conference tier. The residual — actual minus expected — is what the table ranks.
      A positive residual means the program played better than the roster it signed.`,
    limitations: `SP+ already contains the result, so this measures over-performance, not its
      cause. Coaching, development, scheme, health and luck all land in the same residual and
      we cannot separate them. Teams marked <span class="badge-imputed">est</span> had their
      talent estimated from the conference median because we lack their recruiting data.`,
  },

  // ── Research: recruiting class ROI (script 14) ───────────────────────────
  "recruiting-roi": {
    id: "recruiting-roi",
    kind: "research",
    status: "live",
    page: "research-recruiting-roi.html",
    eyebrow: "RECRUITING",
    title: "What recruiting classes actually became",
    claim: "A signing-day ranking is a prediction. This is the result — the share of each class " +
           "that turned into a real contributor, which separates programs that recruit well " +
           "from programs that develop well.",
    question: "Which programs turn recruits into contributors, and which just sign them?",

    async load() {
      const rows = await _load("recruiting_roi.json");
      return { rows: rows || [], meta: {} };
    },
    headline(rows) {
      return rows.length
        ? `${rows.length.toLocaleString()} recruiting classes graded on what their players actually became.`
        : null;
    },
    stats(rows) {
      const mature = rows.filter(r => !r.maturing && (r.n_recruits || 0) >= 15 && r.hit_rate_pct != null);
      if (!mature.length) return [];
      const best = mature.reduce((a, b) => (b.hit_rate_pct > a.hit_rate_pct ? b : a));
      const avg = mature.reduce((s, r) => s + r.hit_rate_pct, 0) / mature.length;
      return [
        { value: _pct(best.hit_rate_pct), label: `${best.school} ${best.recruit_year} — best class graded` },
        { value: _pct(avg), label: "average hit rate across mature classes" },
        { value: mature.length.toLocaleString(), label: "classes with 3+ development seasons" },
        { value: rows.length.toLocaleString(), label: "classes graded in total" },
      ];
    },
    sort: { key: "hit_rate_pct", asc: false },
    maxRows: 300,
    filters(rows) {
      const confs = [...new Set(rows.map(r => r.conference).filter(Boolean))].sort();
      const years = [...new Set(rows.map(r => r.recruit_year))].sort((a, b) => b - a);
      return [
        { id: "conf", type: "select", value: "ALL",
          options: [{ value: "ALL", label: "All Conferences" }, ...confs.map(c => ({ value: c, label: c }))] },
        { id: "year", type: "select", value: "ALL",
          options: [{ value: "ALL", label: "All Classes" }, ...years.map(y => ({ value: y, label: y }))] },
        { id: "minClass", type: "number", label: "Min class size:", value: 10, min: 1, max: 50 },
      ];
    },
    apply: (rows, v) => rows.filter(r =>
      (v.conf === "ALL" || r.conference === v.conf) &&
      (v.year === "ALL" || String(r.recruit_year) === String(v.year)) &&
      (r.n_recruits || 0) >= (v.minClass || 1)),
    columns: [
      { key: "school", label: "School", fmt: (v, r) => teamLink(v, { season: r.recruit_year }) },
      { key: "recruit_year", label: "Class", num: true, fmt: (v, r) => r.maturing
          ? `${v} <span class="badge-maturing" title="Class still developing (< 3 seasons)">dev</span>` : String(v) },
      { key: "conference", label: "Conf", fmt: v => _esc(v || "—") },
      { key: "n_recruits", label: "Recruits", num: true },
      { key: "hit_rate_pct", label: "Hit%/Rated", num: true,
        title: "Contributors as a share of recruits who ever got a rating",
        fmt: v => _hitCell(v) },
      { key: "hit_rate_class_pct", label: "Hit%/Class", num: true,
        title: "Contributors as a share of ALL recruits, including those who never rated",
        fmt: v => _hitCell(v) },
      { key: "avg_peak_ovr", label: "Avg Peak", num: true, fmt: v => _fx(v) },
      { key: "n_bluechip", label: "BC", num: true, title: "4★+ recruits in the class" },
      { key: "bc_hit_rate_pct", label: "BC Hit%", num: true, fmt: v => v != null ? _pct(v) : "—" },
      { key: "avg_stars", label: "Avg ★", num: true, fmt: v => _fx(v, 2) },
    ],
    method: `A "hit" is a recruit who reached a peak overall rating of 75 or better in any
      season. Hit%/Rated counts them against recruits who ever received a rating; Hit%/Class
      counts them against every signee, which exposes classes where large numbers never
      played. Classes with fewer than three development seasons are marked
      <span class="badge-maturing">dev</span> — they are not finished.`,
    limitations: `Peak OVR ≥ 75 is a threshold, not a truth: a 74 and a 76 are not different
      players. Transfers out still count toward the class that signed them, so this measures
      the board, not the roster. Blue-chip hit rate is suppressed below three such recruits
      because it is meaningless at that sample size.`,
  },

  // ── Research: the projection model itself (script 15) ────────────────────
  "breakout": {
    id: "breakout",
    kind: "research",
    status: "live",
    page: "research-breakout.html",
    eyebrow: "PROJECTION MODEL",
    title: "Who beats their cohort next season",
    claim: "Every player is projected against what players like him — same position, same " +
           "class year, same production level — historically did next. Beating that baseline " +
           "is a real claim. Beating your own last season is mostly just being bad last season.",
    question: "Which players are projected to outperform their development cohort?",

    async load() {
      const { rows, meta } = await fetchTrajectory();
      return { rows, meta };
    },
    headline(rows, meta) {
      if (!rows.length) return null;
      const n = rows.filter(r => r.trajectory_label === "breakout").length;
      const gain = meta.naive_mae && meta.model_mae
        ? ` The model beats a naive carry-forward by ${(meta.naive_mae - meta.model_mae).toFixed(1)} OVR.` : "";
      return `${n} players projected to beat their cohort, each with the reason in plain English.${gain}`;
    },
    stats(rows, meta) {
      if (!rows.length) return [];
      const c = rows.reduce((a, r) => (a[r.trajectory_label] = (a[r.trajectory_label] || 0) + 1, a), {});
      return [
        { value: String(c.breakout || 0), label: "projected to beat their cohort" },
        { value: String(c.decline || 0), label: "projected to fall short of it" },
        { value: meta.model_mae ? `±${meta.model_mae}` : "—", label: `typical error, vs ±${meta.naive_mae ?? "—"} for assuming no change` },
        { value: meta.interval_coverage_pct ? `${meta.interval_coverage_pct}%` : "—", label: "of outcomes inside the published 80% range" },
      ];
    },
    sort: { key: "vs_cohort", asc: false },
    maxRows: 300,
    filters(rows) {
      const pos = [...new Set(rows.map(r => r.position_group).filter(Boolean))].sort();
      return [
        // Defaults to offensive skill on purpose. Sorted by vs-cohort across all
        // positions, the top of this table fills with low-confidence defensive
        // calls whose underlying ratings we already know need rework — which
        // makes the whole list look unreliable. The filter is right there for
        // anyone who wants them.
        { id: "family", type: "select", value: "offense",
          options: [{ value: "offense", label: "Offensive skill (modelled on opportunity)" },
                    { value: "defense", label: "Defense (low confidence)" },
                    { value: "ALL", label: "Every position" }] },
        { id: "pos", type: "select", value: "ALL",
          options: [{ value: "ALL", label: "All Positions" }, ...pos.map(p => ({ value: p, label: p }))] },
        { id: "label", type: "select", value: "ALL",
          options: [{ value: "ALL", label: "All Calls" }, { value: "breakout", label: "Breakout" },
                    { value: "steady", label: "Steady" }, { value: "decline", label: "Decline" }] },
        { id: "minOvr", type: "number", label: `Min ${PLAYED_SEASON} OVR:`, value: 0, min: 0, max: 99 },
      ];
    },
    apply: (rows, v) => rows.filter(r =>
      (v.family === "ALL" || r.family === v.family) &&
      (v.pos === "ALL" || r.position_group === v.pos) &&
      (v.label === "ALL" || r.trajectory_label === v.label) &&
      (r.current_ovr || 0) >= (v.minOvr || 0)),
    columns: [
      { key: "name", label: "Player", fmt: (v, r) => playerLink(r.player_id, v, { season: PROJ_SEASON }) },
      { key: "position_group", label: "Pos", fmt: v => posBadge(v) },
      { key: "class_year", label: "Yr", num: true, fmt: v => v != null ? String(v) : "—" },
      { key: "current_ovr", label: `${PLAYED_SEASON}`, num: true,
        title: "Earned rating last season",
        fmt: v => ovrPill(v, { label: `Earned OVR, ${PLAYED_SEASON}` }) },
      { key: "predicted_ovr", label: `${PROJ_SEASON} Proj`, num: true,
        fmt: v => ovrPill(v, { label: `Projected ${PROJ_SEASON} OVR`, projected: true }) },
      { key: "proj_low", label: "Range", num: true, sortVal: (v, r) => r.proj_high - r.proj_low,
        title: "80% of outcomes land in this range", fmt: (v, r) => projRange(v, r.proj_high) },
      { key: "cohort_expected", label: "Cohort", num: true,
        title: "What players at his position, class year and production level typically reach",
        fmt: v => _fx(v) },
      { key: "vs_cohort", label: "vs Cohort", num: true,
        title: "Projection minus cohort expectation — the actual claim",
        fmt: v => v != null ? deltaChip(v, { title: "Projected OVR vs cohort expectation" }) : "—" },
      { key: "trajectory_label", label: "Call", fmt: v => _callCell(v) },
      { key: "confidence", label: "Confidence", fmt: v => confidenceChip(v) },
      { key: "shap_top_feature", label: "Top Driver", fmt: v => _esc(v || "—") },
    ],
    method: `Two models, because two position families have very different evidence behind them.
      <strong>Offensive skill</strong> (QB/RB/WR/TE) gets the full treatment: a career curve built
      from EDGE percentiles within each season and position, cohort development curves, and —
      the part that actually moves a projection — the <em>opportunity</em> in front of him:
      depth-chart rank on next season's roster, his share of his position room's production, and
      how much production is departing ahead of him. <strong>Defense</strong> gets the career
      curve and cohort only; there is no meaningful notion of touches or depth chart, so those
      projections are marked low confidence. Both are variance-inflated 50% toward the realised
      distribution. Click any player for drivers, reasoning and historical comparables.`,
    limitations: `<strong>Offensive linemen are not projected at all.</strong> No individual
      blocking data exists in any public source, so an OL rating is 77% recruiting composite and
      anti-correlates with the one independent assessment available — carrying that forward would
      publish a recruiting ranking wearing the word "projection". Defensive and special-teams
      projections are published but marked low confidence: their underlying ratings need reworking
      before the projections can be trusted. These curves are also built only from players who
      <em>have</em> a next season — the best leave for the NFL, so the record overstates elite
      decline and the top of the scale reads slightly optimistic. Injuries are invisible to us.`,
  },

  // ── Storyline: hidden gems ───────────────────────────────────────────────
  "hidden-gems": {
    id: "hidden-gems",
    kind: "storyline",
    status: "live",
    page: "story-hidden-gems.html",
    eyebrow: "HIDDEN GEMS",
    title: "The recruits nobody wanted",
    claim: "Two stars or fewer coming out of high school, and a rating that says starter. " +
           "This is the list the whole platform exists to produce.",
    question: "Which lightly-recruited players turned into real contributors?",

    async load() {
      const rows = await fetchAllPlayers(PLAYED_SEASON);
      return {
        rows: (rows || []).filter(p => (p.stars || 0) >= 1 && p.stars <= 2 && (p.overall_rating || 0) >= 70),
        meta: { season: PLAYED_SEASON },
      };
    },
    headline(rows) {
      return rows.length
        ? `${rows.length} players rated 70+ in ${PLAYED_SEASON} came out of two-star-or-lower classes.`
        : null;
    },
    stats(rows) {
      if (!rows.length) return [];
      const elite = rows.filter(r => r.overall_rating >= 85).length;
      const top = rows.reduce((a, b) => (b.overall_rating > a.overall_rating ? b : a));
      const byPos = rows.reduce((a, r) => (a[r.position_group] = (a[r.position_group] || 0) + 1, a), {});
      const commonest = Object.entries(byPos).sort((a, b) => b[1] - a[1])[0];
      return [
        { value: String(rows.length), label: `rated 70+ from 2★-or-lower classes, ${PLAYED_SEASON}` },
        { value: String(elite), label: "of those rated 85 or better" },
        { value: `${Math.round(top.overall_rating)}`, label: `${top.name} — highest-rated of them` },
        { value: commonest ? commonest[0] : "—", label: `most common position (${commonest ? commonest[1] : 0} players)` },
      ];
    },
    sort: { key: "overall_rating", asc: false },
    maxRows: 300,
    filters(rows) {
      const pos = [...new Set(rows.map(r => r.position_group).filter(Boolean))].sort();
      const confs = [...new Set(rows.map(r => r.conference).filter(Boolean))].sort();
      return [
        { id: "pos", type: "select", value: "ALL",
          options: [{ value: "ALL", label: "All Positions" }, ...pos.map(p => ({ value: p, label: p }))] },
        { id: "conf", type: "select", value: "ALL",
          options: [{ value: "ALL", label: "All Conferences" }, ...confs.map(c => ({ value: c, label: c }))] },
        { id: "minOvr", type: "number", label: "Min OVR:", value: 70, min: 40, max: 99 },
      ];
    },
    apply: (rows, v) => rows.filter(r =>
      (v.pos === "ALL" || r.position_group === v.pos) &&
      (v.conf === "ALL" || r.conference === v.conf) &&
      (r.overall_rating || 0) >= (v.minOvr || 0)),
    columns: [
      { key: "name", label: "Player", fmt: (v, r) => playerLink(r.id, v, { season: r.season }) },
      { key: "position_group", label: "Pos", fmt: v => posBadge(v) },
      { key: "team", label: "Team", fmt: (v, r) => teamLink(v, { season: r.season }) },
      { key: "conference", label: "Conf", fmt: v => _esc(v || "—") },
      { key: "stars", label: "Recruit", fmt: v => starsHtml(v) },
      { key: "composite_score", label: "Composite", num: true, fmt: v => v != null ? v.toFixed(4) : "—" },
      { key: "overall_rating", label: "OVR", num: true,
        fmt: (v, r) => ovrPill(v, { label: `Overall rating, ${r.season}`, season: r.season }) },
      // Deliberately not raw EDGE: it is position-scaled by construction (a QB
      // accumulates ~1,500 where a safety accumulates ~25), so showing it in a
      // mixed-position table invites a comparison that is not valid.
      { key: "recruit_year", label: "Class", num: true, fmt: v => v != null ? String(v) : "—" },
      { key: "year", label: "Yr", num: true, fmt: v => v != null ? String(v) : "—" },
    ],
    method: `Every rated player from the ${PLAYED_SEASON} season whose recruiting profile was
      one or two stars, ranked by what they actually produced. Recruiting stars come from the
      247Sports composite; the rating comes from opponent-adjusted per-game production.`,
    limitations: `Unrated recruits — walk-ons, JUCO arrivals, international players — have no
      star rating at all and are excluded rather than counted as zero-star. Some two-star
      ratings are simply thin coverage of a player nobody evaluated, not a scouting miss.`,
  },

  // ── Storyline: team movement ─────────────────────────────────────────────
  "team-movement": {
    id: "team-movement",
    kind: "storyline",
    status: "live",
    page: "story-team-movement.html",
    eyebrow: "RISING AND SLIDING",
    title: `Every program's move into ${PROJ_SEASON}`,
    claim: `Projected ${PROJ_SEASON} team rating against what each program actually earned in ` +
           `${PLAYED_SEASON}. Movement here is roster turnover made visible — who left, who ` +
           `arrived, and who is projected to develop.`,
    question: "Which programs gain and lose the most from roster turnover?",

    async load() {
      const [history, teams] = await Promise.all([_load("team_history.json"), fetchTeamsById()]);
      const rows = [];
      for (const [tid, seasons] of Object.entries(history || {})) {
        const now  = (seasons || []).find(r => r.season === PROJ_SEASON && r.overall_rating != null);
        const then = (seasons || []).find(r => r.season === PLAYED_SEASON && r.overall_rating != null);
        const team = teams[tid];
        if (now && then && team) {
          rows.push({
            school: team.school, logo_url: team.logo_url, team_id: team.id,
            conference: now.conference || then.conference || team.conference,
            then: then.overall_rating, now: now.overall_rating,
            delta: now.overall_rating - then.overall_rating,
          });
        }
      }
      return { rows, meta: {} };
    },
    headline(rows) {
      if (!rows.length) return null;
      const up = rows.reduce((a, b) => (b.delta > a.delta ? b : a));
      return `${up.school} gains the most going into ${PROJ_SEASON} — ${up.delta > 0 ? "+" : ""}${up.delta.toFixed(1)} team OVR.`;
    },
    stats(rows) {
      if (!rows.length) return [];
      const up = rows.reduce((a, b) => (b.delta > a.delta ? b : a));
      const down = rows.reduce((a, b) => (b.delta < a.delta ? b : a));
      const risers = rows.filter(r => r.delta > 0).length;
      return [
        { value: `+${_fx(up.delta)}`, label: `${up.school} — biggest projected gain` },
        { value: _fx(down.delta), label: `${down.school} — biggest projected drop` },
        { value: String(risers), label: `programs projected up of ${rows.length}` },
        { value: _fx(rows.reduce((s, r) => s + Math.abs(r.delta), 0) / rows.length), label: "average absolute move" },
      ];
    },
    sort: { key: "delta", asc: false },
    maxRows: 200,
    filters(rows) {
      const confs = [...new Set(rows.map(r => r.conference).filter(Boolean))].sort();
      return [
        { id: "conf", type: "select", value: "ALL",
          options: [{ value: "ALL", label: "All Conferences" }, ...confs.map(c => ({ value: c, label: c }))] },
        { id: "dir", type: "select", value: "ALL",
          options: [{ value: "ALL", label: "Up and down" }, { value: "up", label: "Rising only" },
                    { value: "down", label: "Sliding only" }] },
      ];
    },
    apply: (rows, v) => rows.filter(r =>
      (v.conf === "ALL" || r.conference === v.conf) &&
      (v.dir === "ALL" || (v.dir === "up" ? r.delta > 0 : r.delta < 0))),
    rowClass: r => (r.delta >= 8 ? "row-over" : r.delta <= -8 ? "row-under" : ""),
    columns: [
      { key: "school", label: "Team", fmt: (v, r) => `
          ${r.logo_url ? `<img class="entity-logo" src="${_esc(r.logo_url)}" alt="" loading="lazy">` : ""}
          ${teamLink(v, { season: PROJ_SEASON })}` },
      { key: "conference", label: "Conf", fmt: v => _esc(v || "—") },
      { key: "then", label: `${PLAYED_SEASON} actual`, num: true,
        fmt: v => ovrPill(v, { label: `Earned team OVR, ${PLAYED_SEASON}` }) },
      { key: "now", label: `${PROJ_SEASON} proj`, num: true,
        fmt: v => ovrPill(v, { label: `Projected team OVR, ${PROJ_SEASON}`, season: PROJ_SEASON }) },
      { key: "delta", label: "Change", num: true,
        fmt: v => deltaChip(v, { title: `Projected ${PROJ_SEASON} vs actual ${PLAYED_SEASON}` }) },
    ],
    method: `Projected team rating is built from each roster's projected players weighted by
      position, then compared to the rating the program earned last season. Because the
      projected number has no results in it, this is a statement about the roster, not a
      prediction of record.`,
    limitations: `A team rating built from a roster cannot see coaching changes, scheme fit,
      or a transfer portal cycle that is still moving. Large swings often reflect a graduating
      class rather than anything about the program.`,
  },

  // ── Storyline: our projections vs EA CFB 27 ──────────────────────────────
  "ea-disagreement": {
    id: "ea-disagreement",
    kind: "storyline",
    status: "live",
    page: "story-ea-disagreement.html",
    eyebrow: "SECOND OPINION",
    title: "Where we disagree with EA CFB 27",
    claim: "Two systems looking at the same player and landing twenty points apart says " +
           "something about both of them. EA is never an input to our number — that is what " +
           "makes the disagreements worth reading.",
    question: "Where do our projections and EA's ratings diverge, and why?",

    async load() {
      const [players, ea] = await Promise.all([fetchAllPlayers(PROJ_SEASON), fetchEaRatings(PROJ_SEASON)]);
      const rows = [];
      for (const p of players || []) {
        const e = ea[p.id];
        if (!e || e.ovr == null || p.overall_rating == null) continue;
        if (p.projection_source === "ea_cfb27") continue;   // nothing to compare
        rows.push({
          name: p.name, player_id: p.id, team: p.team, conference: p.conference,
          position_group: p.position_group,
          ours: Math.round(p.overall_rating), ea: Math.round(e.ovr),
          gap: Math.round(p.overall_rating) - Math.round(e.ovr),
          source: p.projection_source,
        });
      }
      return { rows, meta: {} };
    },
    headline(rows) {
      if (!rows.length) return null;
      const agree = rows.filter(r => Math.abs(r.gap) <= 3).length;
      return `${rows.length.toLocaleString()} players carry both ratings; the two agree within 3 points on ${Math.round(agree / rows.length * 100)}% of them.`;
    },
    stats(rows) {
      if (!rows.length) return [];
      const agree = rows.filter(r => Math.abs(r.gap) <= 3).length;
      const high = rows.reduce((a, b) => (b.gap > a.gap ? b : a));
      const low = rows.reduce((a, b) => (b.gap < a.gap ? b : a));
      const mean = rows.reduce((s, r) => s + r.gap, 0) / rows.length;
      return [
        { value: `${Math.round(agree / rows.length * 100)}%`, label: "agree within 3 points" },
        { value: `${high.gap > 0 ? "+" : ""}${high.gap}`, label: `${high.name} — we are highest above EA` },
        { value: String(low.gap), label: `${low.name} — EA is highest above us` },
        { value: `${mean > 0 ? "+" : ""}${_fx(mean)}`, label: "average gap (positive = we rate higher)" },
      ];
    },
    sort: { key: "gap", asc: false },
    maxRows: 300,
    filters(rows) {
      const pos = [...new Set(rows.map(r => r.position_group).filter(Boolean))].sort();
      return [
        { id: "pos", type: "select", value: "ALL",
          options: [{ value: "ALL", label: "All Positions" }, ...pos.map(p => ({ value: p, label: p }))] },
        { id: "source", type: "select", value: "ALL",
          options: [{ value: "ALL", label: "Any of our sources" },
                    { value: "engine_d", label: "Career curve only" },
                    { value: "carry", label: "Carried forward only" },
                    { value: "recruiting", label: "Recruiting grade only" }] },
        { id: "minGap", type: "number", label: "Min |gap|:", value: 0, min: 0, max: 60 },
      ];
    },
    apply: (rows, v) => rows.filter(r =>
      (v.pos === "ALL" || r.position_group === v.pos) &&
      (v.source === "ALL" || r.source === v.source) &&
      Math.abs(r.gap) >= (v.minGap || 0)),
    columns: [
      { key: "name", label: "Player", fmt: (v, r) => playerLink(r.player_id, v, { season: PROJ_SEASON }) },
      { key: "position_group", label: "Pos", fmt: v => posBadge(v) },
      { key: "team", label: "Team", fmt: v => teamLink(v, { season: PROJ_SEASON }) },
      { key: "ours", label: "Ours", num: true,
        fmt: v => ovrPill(v, { label: `Our projected ${PROJ_SEASON} OVR`, season: PROJ_SEASON }) },
      { key: "ea", label: "EA 27", num: true, fmt: v => `<span class="ea-ovr">${v}</span>` },
      { key: "gap", label: "Gap", num: true,
        fmt: v => deltaChip(v, { title: "Our projection minus EA's overall" }) },
      { key: "source", label: "From", title: "How our number was built", fmt: v => _sourceCell(v) },
    ],
    method: `Every ${PROJ_SEASON} player who has both a projection of ours and an EA CFB 27
      overall. Players whose projection <em>came from</em> EA are excluded — there is nothing
      to compare. The <em>From</em> column says how our side of the comparison was built.`,
    limitations: `The extremes are dominated by two known patterns rather than genuine
      disagreement. Offensive linemen, because we grade them through team proxies — team rush
      yards and sack rate allowed — while EA grades the individual; this is also why we cap OL
      at 88. And players who barely played last season, because our rating measures production,
      so a highly-regarded backup rates low. EA is a game's rating system with its own goals;
      neither side is ground truth.`,
  },

  // ── Upcoming — framework in place, analysis not built yet ────────────────
  "transfer-roi": {
    id: "transfer-roi",
    kind: "research",
    status: "upcoming",
    page: "research-transfer-roi.html",
    eyebrow: "TRANSFER PORTAL",
    title: "What the portal actually returns",
    claim: "The same hit-rate method we apply to recruiting classes, pointed at the portal: " +
           "which transfers become contributors, and which programs are good at picking them.",
    question: "Which transfers work out, and which programs pick well?",
    plan: `Mirrors the recruiting-ROI method onto <code>player_transfers.json</code>: for every
      portal move, compare the player's rating before and after, and aggregate by destination
      program, conference jump, and position. The data is already exported — this needs the
      analysis script (<code>transfer_roi.py</code>), not new harvesting.`,
    limitations: `Portal data only reaches back to 2021, so there is far less history than the
      recruiting analysis has. Players who transfer and never play again leave no rating at all,
      which will bias hit rates upward unless they are counted as misses.`,
  },

  "player-development": {
    id: "player-development",
    kind: "research",
    status: "upcoming",
    page: "research-player-development.html",
    eyebrow: "DEVELOPMENT",
    title: "Who develops players",
    claim: "Expected outcome from a player's entry profile against what he actually became — " +
           "aggregated by program, this is development separated from acquisition.",
    question: "Which programs make players better than their recruiting profile predicted?",
    plan: `The cohort development curves built for the projection model already answer this at
      the player level. Aggregating each player's actual-minus-cohort residual by program gives
      a development score that is independent of who they signed. Boise State 2010–2011 is the
      calibration case.`,
    limitations: `Development and opportunity are hard to separate: a player at a weaker program
      may post better numbers because he plays more, not because he improved more. Any honest
      version has to adjust for snap share and opponent quality.`,
  },

  "roster-composition": {
    id: "roster-composition",
    kind: "research",
    status: "upcoming",
    page: "research-roster-composition.html",
    eyebrow: "ROSTER BUILDING",
    title: "Recruit, buy, or develop",
    claim: "Winning rosters get built three ways. This measures which mix actually correlates " +
           "with beating your talent expectation.",
    question: "Does how you build a roster predict whether you beat expectations?",
    plan: `Regress the team-performance residual (already computed) on each roster's acquisition
      mix — share of production from high-school recruits, portal additions, and in-house
      development. Needs <code>roster_composition.py</code>; all three inputs already exist.`,
    limitations: `Acquisition mix is endogenous — programs that cannot recruit turn to the
      portal, so mix partly reflects the constraint rather than a strategy. Correlation here
      will not be causation and the write-up must say so.`,
  },
};

// ── Shared cell formatters ─────────────────────────────────────────────────

function _hitCell(v) {
  if (v == null) return "—";
  const c = v >= 50 ? "var(--positive)" : v <= 20 ? "var(--negative)" : "var(--text)";
  return `<span style="color:${c};font-weight:600">${v.toFixed(1)}%</span>`;
}

function _callCell(v) {
  const colors = { breakout: "var(--positive)", decline: "var(--negative)", steady: "var(--text-muted)" };
  return `<span style="color:${colors[v] || "var(--text)"};font-weight:600;text-transform:capitalize">${_esc(v || "—")}</span>`;
}

const _FINDING_SOURCE_CODES = {
  engine_d:   ["CV", "Career curve — projected from his own production history"],
  carry:      ["CF", "Carried forward — last season's rating along his cohort's development curve"],
  recruiting: ["RC", "Recruiting grade — no college production yet"],
  ea_cfb27:   ["EA", "EA CFB 27's overall"],
};

function _sourceCell(v) {
  const s = _FINDING_SOURCE_CODES[v];
  return s ? `<span class="proj-source-code" title="${_esc(s[1])}">${s[0]}</span>`
           : '<span class="text-muted">—</span>';
}

// Findings of one kind, in registry order.
function findingsOfKind(kind) {
  return Object.values(FINDINGS).filter(f => f.kind === kind);
}
