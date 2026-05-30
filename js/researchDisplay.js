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
    { key: "school",                 label: "School",     fmt: v => v },
    { key: "season",                 label: "Season",     fmt: v => v },
    { key: "conference",             label: "Conf",       fmt: v => v || "—" },
    { key: "talent_normalized",      label: "Talent",     fmt: v => v != null ? v.toFixed(1) : "—" },
    { key: "sp_overall",             label: "SP+",        fmt: v => v != null ? v.toFixed(1) : "—" },
    { key: "sp_predicted",           label: "Expected",   fmt: v => v != null ? v.toFixed(1) : "—" },
    { key: "performance_residual",   label: "Residual",   fmt: v => v != null ? (v > 0 ? "+" : "") + v.toFixed(1) : "—" },
    { key: "performance_percentile", label: "Pctile",     fmt: v => v != null ? v.toFixed(0) + "%" : "—" },
    { key: "coaching_change_flag",   label: "New HC",     fmt: v => v ? "✓" : "" },
  ];

  const thHtml = cols.map(c => {
    const arrow = col === c.key ? (asc ? " ▲" : " ▼") : "";
    return `<th data-col="${c.key}" style="cursor:pointer">${c.label}${arrow}</th>`;
  }).join("");

  const trHtml = rows.slice(0, 200).map(r => {
    const res = r.performance_residual;
    const rowClass = res != null && res > 8 ? "row-over" : res != null && res < -8 ? "row-under" : "";
    const cells = cols.map(c => {
      const v = r[c.key];
      let display = c.fmt(v);
      if (c.key === "performance_residual" && v != null) {
        const color = v > 5 ? "#2ecc71" : v < -5 ? "#e74c3c" : "var(--text-muted)";
        display = `<span style="color:${color};font-weight:600">${display}</span>`;
      }
      return `<td>${display}</td>`;
    }).join("");
    return `<tr class="${rowClass}">${cells}</tr>`;
  }).join("");

  tableContainer.innerHTML = `
    <table class="research-table">
      <thead><tr>${thHtml}</tr></thead>
      <tbody>${trHtml}</tbody>
    </table>
    <p style="font-size:var(--fs-xs);color:var(--text-muted);margin-top:0.5rem">
      Showing ${Math.min(rows.length, 200)} of ${rows.length} team-seasons.
      Residual = actual SP+ minus expected SP+ from talent composite regression.
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
    { key: "school",          label: "School",      fmt: v => v },
    { key: "recruit_year",    label: "Class",       fmt: v => v },
    { key: "conference",      label: "Conf",        fmt: v => v || "—" },
    { key: "n_recruits",      label: "Recruits",    fmt: v => v ?? "—" },
    { key: "n_rated",         label: "Rated",       fmt: v => v ?? "—" },
    { key: "hit_rate_pct",    label: "Hit %",       fmt: v => v != null ? v.toFixed(1) + "%" : "—" },
    { key: "n_bluechip",      label: "Blue Chips",  fmt: v => v ?? "—" },
    { key: "bc_hit_rate_pct", label: "BC Hit %",    fmt: v => v != null ? v.toFixed(1) + "%" : "—" },
    { key: "avg_stars",       label: "Avg ★",       fmt: v => v != null ? v.toFixed(2) : "—" },
  ];

  const thHtml = cols.map(c => {
    const arrow = col === c.key ? (asc ? " ▲" : " ▼") : "";
    return `<th data-col="${c.key}" style="cursor:pointer">${c.label}${arrow}</th>`;
  }).join("");

  const trHtml = rows.slice(0, 200).map(r => {
    const cells = cols.map(c => {
      const v = r[c.key];
      let display = c.fmt(v);
      if (c.key === "hit_rate_pct" && v != null) {
        const color = v >= 50 ? "#2ecc71" : v <= 20 ? "#e74c3c" : "var(--text-primary)";
        display = `<span style="color:${color};font-weight:600">${display}</span>`;
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
      Hit % = recruits who reached peak OVR ≥ 75 as a fraction of rated players.
      Recent classes (2023–2025) will show lower rates as careers develop.
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
