// Research page — live data tables for Team Performance and Recruiting ROI
// Data source: data/team_performance.json, data/recruiting_roi.json

// ── Team Performance Evaluator ─────────────────────────────────────────────

let _teamPerfData = null;
let _teamPerfSort = { col: "performance_residual", asc: false };
let _teamPerfSeasonFilter = "ALL";
let _teamPerfConfFilter   = "ALL";

async function initTeamPerformance() {
  const section = document.getElementById("team-perf-section");
  if (!section) return;

  try {
    const res = await fetch("data/team_performance.json");
    if (!res.ok) throw new Error("not found");
    _teamPerfData = await res.json();
  } catch {
    section.innerHTML = '<p class="empty-state">Team performance data not available yet.</p>';
    return;
  }

  _buildTeamPerfFilters(section);
  _renderTeamPerfTable(section);
}

function _buildTeamPerfFilters(section) {
  const seasons = [...new Set(_teamPerfData.map(r => r.season))].sort((a, b) => b - a);
  const confs   = [...new Set(_teamPerfData.map(r => r.conference).filter(Boolean))].sort();

  const bar = section.querySelector(".research-filter-bar");
  if (!bar) return;

  bar.innerHTML = `
    <select id="tp-season-select">
      <option value="ALL">All Seasons</option>
      ${seasons.map(s => `<option value="${s}">${s}</option>`).join("")}
    </select>
    <select id="tp-conf-select">
      <option value="ALL">All Conferences</option>
      ${confs.map(c => `<option value="${c}">${c}</option>`).join("")}
    </select>`;

  bar.querySelector("#tp-season-select").addEventListener("change", e => {
    _teamPerfSeasonFilter = e.target.value;
    _renderTeamPerfTable(section);
  });
  bar.querySelector("#tp-conf-select").addEventListener("change", e => {
    _teamPerfConfFilter = e.target.value;
    _renderTeamPerfTable(section);
  });
}

function _renderTeamPerfTable(section) {
  let rows = _teamPerfData.filter(r =>
    (_teamPerfSeasonFilter === "ALL" || String(r.season) === _teamPerfSeasonFilter) &&
    (_teamPerfConfFilter   === "ALL" || r.conference === _teamPerfConfFilter)
  );

  const { col, asc } = _teamPerfSort;
  rows = rows.slice().sort((a, b) => {
    const av = a[col] ?? -Infinity;
    const bv = b[col] ?? -Infinity;
    return asc ? av - bv : bv - av;
  });

  const tableContainer = section.querySelector(".research-table-wrap");
  if (!tableContainer) return;

  const cols = [
    { key: "school",                 label: "School",    fmt: (v, r) => {
        const link = teamLink(v, { season: r.season });
        return r.talent_imputed
          ? `${link} <span class="badge-imputed" title="Talent estimated from conference median">est</span>`
          : link;
      } },
    { key: "season",                 label: "Season",    fmt: v => v },
    { key: "conference",             label: "Conf",      fmt: v => v || "—" },
    { key: "talent_normalized",      label: "Talent",    fmt: v => v != null ? v.toFixed(1) : "—" },
    { key: "sp_overall",             label: "SP+",       fmt: v => v != null ? v.toFixed(1) : "—" },
    { key: "sp_predicted",           label: "Expected",  fmt: v => v != null ? v.toFixed(1) : "—" },
    { key: "performance_residual",   label: "Residual",  fmt: v => v != null ? (v > 0 ? "+" : "") + v.toFixed(1) : "—" },
    { key: "performance_percentile", label: "Pctile",    fmt: v => v != null ? v.toFixed(0) + "%" : "—" },
    { key: "coaching_change_flag",   label: "New HC",    fmt: v => v ? "&#10003;" : "" },
  ];

  const thHtml = cols.map(c => {
    const arrow = col === c.key ? (asc ? " &#9650;" : " &#9660;") : "";
    return `<th data-col="${c.key}" style="cursor:pointer">${c.label}${arrow}</th>`;
  }).join("");

  const trHtml = rows.slice(0, 200).map(r => {
    const res = r.performance_residual;
    const rowClass = res != null && res > 8 ? "row-over" : res != null && res < -8 ? "row-under" : "";
    const cells = cols.map(c => {
      const v = r[c.key];
      let display = c.fmt(v, r);
      if (c.key === "performance_residual" && v != null) {
        const color = v > 5 ? "#2ecc71" : v < -5 ? "#e74c3c" : "var(--text-muted)";
        display = `<span style="color:${color};font-weight:600">${display}</span>`;
      }
      return `<td>${display}</td>`;
    }).join("");
    return `<tr class="${rowClass}">${cells}</tr>`;
  }).join("");

  // R² from first row that has it (same for all rows from same regression run)
  const r2 = rows.find(r => r.regression_r2 != null)?.regression_r2;
  const r2text = r2 != null ? ` Model R&#178; = ${r2.toFixed(3)} (talent + conference tier).` : "";
  const impText = rows.some(r => r.talent_imputed)
    ? ' <span class="badge-imputed" title="Talent estimated from conference median">est</span> = talent estimated from conference median.' : "";

  tableContainer.innerHTML = `
    <table class="research-table">
      <thead><tr>${thHtml}</tr></thead>
      <tbody>${trHtml}</tbody>
    </table>
    <p style="font-size:var(--fs-xs);color:var(--text-muted);margin-top:0.5rem">
      Showing ${Math.min(rows.length, 200)} of ${rows.length} team-seasons.
      Residual = actual SP+ minus expected SP+ from 3-year recruiting composite.${r2text}${impText}
    </p>`;

  tableContainer.querySelectorAll("th[data-col]").forEach(th => {
    th.addEventListener("click", () => {
      const c = th.dataset.col;
      if (_teamPerfSort.col === c) {
        _teamPerfSort.asc = !_teamPerfSort.asc;
      } else {
        _teamPerfSort = { col: c, asc: false };
      }
      _renderTeamPerfTable(section);
    });
  });
}


// ── Engine D Breakout Candidates ──────────────────────────────────────────

let _breakoutData = null;
let _breakoutSort = { col: "delta", asc: false };
let _breakoutPosFilter   = "ALL";
let _breakoutLabelFilter = "ALL";

async function initBreakoutCandidates() {
  const section = document.getElementById("breakout-section");
  if (!section) return;

  try {
    const res = await fetch("data/trajectory.json");
    if (!res.ok) throw new Error("not found");
    _breakoutData = await res.json();
  } catch {
    section.innerHTML = '<p class="empty-state">Trajectory data not available yet — run script 15 first.</p>';
    return;
  }

  _buildBreakoutFilters(section);
  _renderBreakoutTable(section);
}

function _buildBreakoutFilters(section) {
  const positions = [...new Set(_breakoutData.map(r => r.position_group).filter(Boolean))].sort();
  const bar = section.querySelector(".research-filter-bar");
  if (!bar) return;

  bar.innerHTML = `
    <select id="bo-pos-select">
      <option value="ALL">All Positions</option>
      ${positions.map(p => `<option value="${p}">${p}</option>`).join("")}
    </select>
    <select id="bo-label-select">
      <option value="ALL">All Labels</option>
      <option value="breakout">Breakout</option>
      <option value="steady">Steady</option>
      <option value="decline">Decline</option>
    </select>`;

  bar.querySelector("#bo-pos-select").addEventListener("change", e => {
    _breakoutPosFilter = e.target.value;
    _renderBreakoutTable(section);
  });
  bar.querySelector("#bo-label-select").addEventListener("change", e => {
    _breakoutLabelFilter = e.target.value;
    _renderBreakoutTable(section);
  });
}

function _renderBreakoutTable(section) {
  let rows = _breakoutData.filter(r =>
    (_breakoutPosFilter   === "ALL" || r.position_group === _breakoutPosFilter) &&
    (_breakoutLabelFilter === "ALL" || r.trajectory_label === _breakoutLabelFilter)
  );

  const { col, asc } = _breakoutSort;
  rows = rows.slice().sort((a, b) => {
    const av = a[col] ?? (typeof a[col] === "string" ? "zzz" : -Infinity);
    const bv = b[col] ?? (typeof b[col] === "string" ? "zzz" : -Infinity);
    if (typeof av === "string") return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    return asc ? av - bv : bv - av;
  });

  const tableContainer = section.querySelector(".research-table-wrap");
  if (!tableContainer) return;

  const labelColors = { breakout: "#2ecc71", decline: "#e74c3c", steady: "var(--text-muted)" };

  const cols = [
    { key: "name",              label: "Player",      fmt: (v, r) => playerLink(r.player_id, v, { season: r.season }) },
    { key: "position_group",    label: "Pos",         fmt: v => v || "—" },
    { key: "current_ovr",       label: "Curr OVR",    fmt: v => v != null ? v.toFixed(1) : "—" },
    { key: "predicted_ovr",     label: "Pred OVR",    fmt: v => v != null ? v.toFixed(1) : "—" },
    { key: "delta",             label: "Delta",       fmt: v => v != null ? (v > 0 ? "+" : "") + v.toFixed(1) : "—" },
    { key: "trajectory_label",  label: "Label",       fmt: v => v || "—" },
    { key: "shap_top_feature",  label: "Key Factor",  fmt: v => v || "—" },
  ];

  const thHtml = cols.map(c => {
    const arrow = col === c.key ? (asc ? " &#9650;" : " &#9660;") : "";
    return `<th data-col="${c.key}" style="cursor:pointer">${c.label}${arrow}</th>`;
  }).join("");

  const trHtml = rows.slice(0, 200).map(r => {
    const color = labelColors[r.trajectory_label] || "var(--text-primary)";
    const cells = cols.map(c => {
      const v = r[c.key];
      let display = c.fmt(v, r);
      if (c.key === "delta" && v != null) {
        display = `<span style="color:${color};font-weight:700">${display}</span>`;
      }
      if (c.key === "trajectory_label") {
        display = `<span style="color:${color};font-weight:600;text-transform:capitalize">${display}</span>`;
      }
      return `<td>${display}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  tableContainer.innerHTML = `
    <table class="research-table">
      <thead><tr>${thHtml}</tr></thead>
      <tbody>${trHtml}</tbody>
    </table>
    <p style="font-size:var(--fs-xs);color:var(--text-muted);margin-top:0.5rem">
      Showing ${Math.min(rows.length, 200)} of ${rows.length} players (2025 season, skill positions only).
      Key Factor = SHAP feature with largest influence on this prediction.
    </p>`;

  tableContainer.querySelectorAll("th[data-col]").forEach(th => {
    th.addEventListener("click", () => {
      const c = th.dataset.col;
      if (_breakoutSort.col === c) {
        _breakoutSort.asc = !_breakoutSort.asc;
      } else {
        _breakoutSort = { col: c, asc: false };
      }
      _renderBreakoutTable(section);
    });
  });
}


// ── Recruiting Class ROI ───────────────────────────────────────────────────

let _recRoiData = null;
let _recRoiSort = { col: "recruit_year", asc: false };
let _recRoiConfFilter   = "ALL";
let _recRoiMinClass     = 10;

async function initRecruitingRoi() {
  const section = document.getElementById("rec-roi-section");
  if (!section) return;

  try {
    const res = await fetch("data/recruiting_roi.json");
    if (!res.ok) throw new Error("not found");
    _recRoiData = await res.json();
  } catch {
    section.innerHTML = '<p class="empty-state">Recruiting ROI data not available yet.</p>';
    return;
  }

  _buildRecRoiFilters(section);
  _renderRecRoiTable(section);
}

function _buildRecRoiFilters(section) {
  const confs = [...new Set(_recRoiData.map(r => r.conference).filter(Boolean))].sort();
  const bar   = section.querySelector(".research-filter-bar");
  if (!bar) return;

  bar.innerHTML = `
    <select id="roi-conf-select">
      <option value="ALL">All Conferences</option>
      ${confs.map(c => `<option value="${c}">${c}</option>`).join("")}
    </select>
    <label style="display:flex;align-items:center;gap:6px;font-size:var(--fs-sm);color:var(--text-muted)">
      Min class size:
      <input id="roi-min-class" type="number" value="${_recRoiMinClass}" min="1" max="50"
             style="width:52px;padding:2px 4px;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text-primary)">
    </label>`;

  bar.querySelector("#roi-conf-select").addEventListener("change", e => {
    _recRoiConfFilter = e.target.value;
    _renderRecRoiTable(section);
  });
  bar.querySelector("#roi-min-class").addEventListener("change", e => {
    _recRoiMinClass = parseInt(e.target.value) || 5;
    _renderRecRoiTable(section);
  });
}

function _renderRecRoiTable(section) {
  let rows = _recRoiData.filter(r =>
    (_recRoiConfFilter === "ALL" || r.conference === _recRoiConfFilter) &&
    r.n_recruits >= _recRoiMinClass
  );

  const { col, asc } = _recRoiSort;
  rows = rows.slice().sort((a, b) => {
    const av = a[col] ?? (typeof b[col] === "string" ? "zzz" : -Infinity);
    const bv = b[col] ?? (typeof a[col] === "string" ? "zzz" : -Infinity);
    if (typeof av === "string") return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    return asc ? av - bv : bv - av;
  });

  const tableContainer = section.querySelector(".research-table-wrap");
  if (!tableContainer) return;

  const cols = [
    { key: "school",              label: "School",       fmt: (v, r) => teamLink(v, { season: r.recruit_year }) },
    { key: "recruit_year",        label: "Class",        fmt: (v, r) => r.maturing
        ? `${v} <span class="badge-maturing" title="Class still developing (< 3 seasons)">dev</span>`
        : String(v) },
    { key: "conference",          label: "Conf",         fmt: v => v || "—" },
    { key: "n_recruits",          label: "Recruits",     fmt: v => v ?? "—" },
    { key: "hit_rate_pct",        label: "Hit%/Rated",   fmt: v => v != null ? v.toFixed(1) + "%" : "—" },
    { key: "hit_rate_class_pct",  label: "Hit%/Class",   fmt: v => v != null ? v.toFixed(1) + "%" : "—" },
    { key: "avg_peak_ovr",        label: "Avg OVR",      fmt: v => v != null ? v.toFixed(1) : "—" },
    { key: "n_bluechip",          label: "BC",           fmt: v => v ?? "—" },
    { key: "bc_hit_rate_pct",     label: "BC Hit%",      fmt: v => v != null ? v.toFixed(1) + "%" : "—" },
    { key: "avg_stars",           label: "Avg &#9733;",  fmt: v => v != null ? v.toFixed(2) : "—" },
  ];

  const thHtml = cols.map(c => {
    const arrow = col === c.key ? (asc ? " &#9650;" : " &#9660;") : "";
    return `<th data-col="${c.key}" style="cursor:pointer">${c.label}${arrow}</th>`;
  }).join("");

  const trHtml = rows.slice(0, 200).map(r => {
    const cells = cols.map(c => {
      const v = r[c.key];
      let display = c.fmt(v, r);
      if ((c.key === "hit_rate_pct" || c.key === "hit_rate_class_pct") && v != null) {
        const color = v >= 50 ? "#2ecc71" : v <= 20 ? "#e74c3c" : "var(--text-primary)";
        display = `<span style="color:${color};font-weight:600">${display}</span>`;
      }
      if (c.key === "avg_peak_ovr" && v != null) {
        const color = v >= 80 ? "#2ecc71" : v <= 65 ? "#e74c3c" : "var(--text-primary)";
        display = `<span style="color:${color}">${display}</span>`;
      }
      return `<td>${display}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  tableContainer.innerHTML = `
    <table class="research-table">
      <thead><tr>${thHtml}</tr></thead>
      <tbody>${trHtml}</tbody>
    </table>
    <p style="font-size:var(--fs-xs);color:var(--text-muted);margin-top:0.5rem">
      Showing ${Math.min(rows.length, 200)} of ${rows.length} classes.
      Hit%/Rated = contributors (peak OVR &#8805; 75) as a fraction of players with any rating.
      Hit%/Class = contributors as a fraction of all recruits (includes unrated players).
      <span class="badge-maturing">dev</span> = class has fewer than 3 development seasons.
    </p>`;

  tableContainer.querySelectorAll("th[data-col]").forEach(th => {
    th.addEventListener("click", () => {
      const c = th.dataset.col;
      if (_recRoiSort.col === c) {
        _recRoiSort.asc = !_recRoiSort.asc;
      } else {
        _recRoiSort = { col: c, asc: false };
      }
      _renderRecRoiTable(section);
    });
  });
}
