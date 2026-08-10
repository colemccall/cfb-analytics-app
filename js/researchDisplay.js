// Research page — live analyses rendered through the shared DataTable.
// Each section is a config (fetch → filters → columns → footnote), not a
// bespoke table implementation. Data: team_performance.json,
// recruiting_roi.json, trajectory.json — produced by pipeline scripts 13–15.
//
// Load order: config.js, dataLoader.js, ui.js, dataTable.js, then this file.

// ── Team Performance Evaluator (script 13) ─────────────────────────────────

async function initTeamPerformance() {
  const section = document.getElementById("team-perf-section");
  if (!section) return;
  const data = await _load("team_performance.json");
  if (!data) {
    section.innerHTML = emptyState("Team performance data not available yet — run script 13.");
    return;
  }

  const seasons = [...new Set(data.map(r => r.season))].sort((a, b) => b - a);
  const confs   = [...new Set(data.map(r => r.conference).filter(Boolean))].sort();

  const r2 = data.find(r => r.regression_r2 != null)?.regression_r2;
  const r2text = r2 != null ? ` Model R² = ${r2.toFixed(3)} (talent + conference tier).` : "";
  const impText = data.some(r => r.talent_imputed)
    ? ' <span class="badge-imputed" title="Talent estimated from conference median">est</span> = talent estimated from conference median.' : "";

  const table = createDataTable(section.querySelector(".research-table-wrap"), {
    rows: data,
    sort: { key: "performance_residual", asc: false },
    maxRows: 200,
    rowClass: r => {
      const res = r.performance_residual;
      return res != null && res > 8 ? "row-over" : res != null && res < -8 ? "row-under" : "";
    },
    footnote: `Residual = actual SP+ minus expected SP+ from 3-year recruiting composite.${r2text}${impText}`,
    columns: [
      { key: "school", label: "School", fmt: (v, r) => {
          const link = teamLink(v, { season: r.season });
          return r.talent_imputed
            ? `${link} <span class="badge-imputed" title="Talent estimated from conference median">est</span>`
            : link;
        } },
      { key: "season",     label: "Season", num: true },
      { key: "conference", label: "Conf",   fmt: v => _esc(v || "—") },
      { key: "talent_normalized", label: "Talent", num: true, fmt: v => v != null ? v.toFixed(1) : "—" },
      { key: "sp_overall",   label: "SP+",      num: true, fmt: v => v != null ? v.toFixed(1) : "—" },
      { key: "sp_predicted", label: "Expected", num: true, fmt: v => v != null ? v.toFixed(1) : "—" },
      { key: "performance_residual", label: "Residual", num: true,
        title: "Actual SP+ minus expected SP+ from recruiting talent",
        fmt: v => v != null ? deltaChip(v, { title: "SP+ vs talent expectation" }) : "—" },
      { key: "performance_percentile", label: "Pctile", num: true, fmt: v => v != null ? v.toFixed(0) + "%" : "—" },
      { key: "coaching_change_flag",   label: "New HC", fmt: v => v ? "✓" : "" },
    ],
  });

  createFilterBar(section.querySelector(".research-filter-bar"), [
    { id: "season", type: "select", value: "ALL",
      options: [{ value: "ALL", label: "All Seasons" }, ...seasons.map(s => ({ value: s, label: s }))] },
    { id: "conf", type: "select", value: "ALL",
      options: [{ value: "ALL", label: "All Conferences" }, ...confs.map(c => ({ value: c, label: c }))] },
  ], v => {
    table.update(data.filter(r =>
      (v.season === "ALL" || String(r.season) === v.season) &&
      (v.conf === "ALL" || r.conference === v.conf)));
  });

  onThemeChange(() => table.refresh());
}

// ── Breakout Candidates — Engine D (script 15) ─────────────────────────────

const _BREAKOUT_COLORS = { breakout: "var(--positive)", decline: "var(--negative)", steady: "var(--text-muted)" };

async function initBreakoutCandidates() {
  const section = document.getElementById("breakout-section");
  if (!section) return;
  const data = await _load("trajectory.json");
  if (!data) {
    section.innerHTML = emptyState("Trajectory data not available yet — run script 15 first.");
    return;
  }

  const positions = [...new Set(data.map(r => r.position_group).filter(Boolean))].sort();

  const table = createDataTable(section.querySelector(".research-table-wrap"), {
    rows: data,
    sort: { key: "delta", asc: false },
    maxRows: 200,
    footnote: "Predictions are model output, not earned ratings. Key Factor = SHAP feature with largest influence on this prediction.",
    columns: [
      { key: "name", label: "Player", fmt: (v, r) => playerLink(r.player_id, v, { season: r.season }) },
      { key: "position_group", label: "Pos", fmt: v => posBadge(v) },
      { key: "current_ovr",   label: "Curr OVR", num: true, fmt: v => ovrPill(v, { label: "Current OVR" }) },
      { key: "predicted_ovr", label: "Pred OVR", num: true,
        fmt: v => ovrPill(v, { label: "Predicted next-season OVR (Engine D)", projected: true }) },
      { key: "delta", label: "Delta", num: true,
        fmt: (v, r) => v != null ? deltaChip(v, { title: "Predicted OVR change next season" }) : "—" },
      { key: "trajectory_label", label: "Label",
        fmt: v => `<span style="color:${_BREAKOUT_COLORS[v] || "var(--text)"};font-weight:600;text-transform:capitalize">${_esc(v || "—")}</span>` },
      { key: "shap_top_feature", label: "Key Factor", fmt: v => _esc(v || "—") },
    ],
  });

  createFilterBar(section.querySelector(".research-filter-bar"), [
    { id: "pos", type: "select", value: "ALL",
      options: [{ value: "ALL", label: "All Positions" }, ...positions.map(p => ({ value: p, label: p }))] },
    { id: "label", type: "select", value: "ALL",
      options: [
        { value: "ALL", label: "All Labels" },
        { value: "breakout", label: "Breakout" },
        { value: "steady", label: "Steady" },
        { value: "decline", label: "Decline" },
      ] },
  ], v => {
    table.update(data.filter(r =>
      (v.pos === "ALL" || r.position_group === v.pos) &&
      (v.label === "ALL" || r.trajectory_label === v.label)));
  });

  onThemeChange(() => table.refresh());
}

// ── Recruiting Class ROI (script 14) ───────────────────────────────────────

async function initRecruitingRoi() {
  const section = document.getElementById("rec-roi-section");
  if (!section) return;
  const data = await _load("recruiting_roi.json");
  if (!data) {
    section.innerHTML = emptyState("Recruiting ROI data not available yet — run script 14.");
    return;
  }

  const confs = [...new Set(data.map(r => r.conference).filter(Boolean))].sort();
  const DEFAULT_MIN_CLASS = 10;

  const hitColor = v => v >= 50 ? "var(--positive)" : v <= 20 ? "var(--negative)" : "var(--text)";

  const table = createDataTable(section.querySelector(".research-table-wrap"), {
    rows: data.filter(r => r.n_recruits >= DEFAULT_MIN_CLASS),
    sort: { key: "recruit_year", asc: false },
    maxRows: 200,
    footnote: `Hit%/Rated = contributors (peak OVR ≥ 75) as a fraction of players with any rating.
      Hit%/Class = contributors as a fraction of all recruits (includes unrated players).
      <span class="badge-maturing">dev</span> = class has fewer than 3 development seasons.`,
    columns: [
      { key: "school", label: "School", fmt: (v, r) => teamLink(v, { season: r.recruit_year }) },
      { key: "recruit_year", label: "Class", num: true, fmt: (v, r) => r.maturing
          ? `${v} <span class="badge-maturing" title="Class still developing (< 3 seasons)">dev</span>`
          : String(v) },
      { key: "conference", label: "Conf", fmt: v => _esc(v || "—") },
      { key: "n_recruits", label: "Recruits", num: true },
      { key: "hit_rate_pct", label: "Hit%/Rated", num: true,
        fmt: v => v != null ? `<span style="color:${hitColor(v)};font-weight:600">${v.toFixed(1)}%</span>` : "—" },
      { key: "hit_rate_class_pct", label: "Hit%/Class", num: true,
        fmt: v => v != null ? `<span style="color:${hitColor(v)};font-weight:600">${v.toFixed(1)}%</span>` : "—" },
      { key: "avg_peak_ovr", label: "Avg OVR", num: true,
        fmt: v => v != null ? `<span style="color:${v >= 80 ? "var(--positive)" : v <= 65 ? "var(--negative)" : "var(--text)"}">${v.toFixed(1)}</span>` : "—" },
      { key: "n_bluechip",      label: "BC",      num: true, title: "4★+ recruits in the class" },
      { key: "bc_hit_rate_pct", label: "BC Hit%", num: true, fmt: v => v != null ? v.toFixed(1) + "%" : "—" },
      { key: "avg_stars",       label: "Avg ★",   num: true, fmt: v => v != null ? v.toFixed(2) : "—" },
    ],
  });

  createFilterBar(section.querySelector(".research-filter-bar"), [
    { id: "conf", type: "select", value: "ALL",
      options: [{ value: "ALL", label: "All Conferences" }, ...confs.map(c => ({ value: c, label: c }))] },
    { id: "minClass", type: "number", label: "Min class size:", value: DEFAULT_MIN_CLASS, min: 1, max: 50 },
  ], v => {
    table.update(data.filter(r =>
      (v.conf === "ALL" || r.conference === v.conf) &&
      r.n_recruits >= (v.minClass || 1)));
  });

  onThemeChange(() => table.refresh());
}
