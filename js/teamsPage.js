// Teams page — program list + team detail with Roster / Ratings / Schedule /
// Transfers / History tabs. Extracted from teams.html inline script during the
// v3 migration; rendering now goes through the shared primitives (ovrPill,
// posBadge, deltaChip, comparePair) and shared caches (_load, loadTrajectory,
// buildEdgePercentiles).
//
// Migration fixes worth knowing about:
//  · Roster "Traj" column used ratings.trajectory, which the pipeline exports
//    as 0.0 for every player — it rendered a flat arrow for all 15,707 rows.
//    It is now "Proj" and reads Engine D predictions (trajectory.json).
//  · Roster "OAP" showed raw EDGE, which is not comparable across positions
//    (QBs ~1,600, LBs ~65). It now shows EDGE percentile within position group,
//    same as the Players page.
//
// Load order: config.js, shell.js (top) → dataLoader.js, ui.js, playerSearch.js,
// then this file. initTeamsPage() is called from teams.html.

// ── State ──────────────────────────────────────────────────────────────────
let _allTeams = [];
let _activeConf = "ALL";
let _activeTab = "roster";
let _currentSeason = CONFIG.CURRENT_SEASON;
let _rosterPosFilter = "ALL";

// ── Init ───────────────────────────────────────────────────────────────────
async function initTeamsPage() {
  buildYearSelect();

  try {
    _allTeams = await fetchTeams(_currentSeason);
  } catch (e) {
    document.getElementById("team-list").innerHTML = errorState(`Failed to load teams: ${e.message}`);
    return;
  }
  buildConfFilter();
  renderTeamList();
  bindSidebarEvents();

  const hash = window.location.hash.replace("#", "");
  const qTeam = new URLSearchParams(window.location.search).get("team");
  if (hash) {
    const t = _allTeams.find(t => slugify(t.school) === hash);
    if (t) { showTeam(t); document.querySelector(`[data-id="${t.id}"]`)?.classList.add("active"); }
  } else if (qTeam) {
    const t = _allTeams.find(t => t.school.toLowerCase() === qTeam.toLowerCase());
    if (t) { showTeam(t); document.querySelector(`[data-id="${t.id}"]`)?.classList.add("active"); }
  }
}

function buildYearSelect() {
  const sel = document.getElementById("year-select");
  fillSeasonSelect(sel, _currentSeason);
  sel.addEventListener("change", async () => {
    _currentSeason = parseInt(sel.value);
    document.getElementById("team-list").innerHTML = skeletonRows(8);
    try { _allTeams = await fetchTeams(_currentSeason); } catch (e) { return; }
    renderTeamList();
    // Reload current team if one is selected
    const main = document.getElementById("teams-main");
    if (main.dataset.teamId) {
      const t = _allTeams.find(t => t.id === parseInt(main.dataset.teamId));
      if (t) showTeam(t);
    }
  });
}

function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-"); }

function buildConfFilter() {
  const confs = ["ALL", ...[...new Set(_allTeams.map(t => t.conference).filter(Boolean))].sort()];
  const bar = document.getElementById("conf-filter");
  bar.innerHTML = confs.map(c =>
    `<button class="pos-chip${c === "ALL" ? " active" : ""}" data-conf="${_esc(c)}">${_esc(c)}</button>`
  ).join("");
  bar.querySelectorAll(".pos-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      bar.querySelectorAll(".pos-chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _activeConf = btn.dataset.conf;
      renderTeamList();
    });
  });
}

function renderTeamList() {
  const query = document.getElementById("team-search").value.toLowerCase();
  const filtered = _allTeams.filter(t => {
    if (_activeConf !== "ALL" && t.conference !== _activeConf) return false;
    if (query && !t.school.toLowerCase().includes(query)) return false;
    return true;
  }).sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0));

  const list = document.getElementById("team-list");
  if (!filtered.length) { list.innerHTML = emptyState("No teams match."); return; }
  list.innerHTML = filtered.map(t => `
    <div class="team-list-item" data-id="${t.id}">
      ${t.logo_url ? `<img src="${_esc(t.logo_url)}" class="team-list-logo" alt="" onerror="this.style.display='none'">` : `<span class="team-list-logo-placeholder"></span>`}
      <div class="team-list-info">
        <span class="team-list-name">${_esc(t.school)}</span>
        <span class="team-list-conf">${_esc(t.conference || "Ind")}</span>
      </div>
      ${ovrPill(t.overall_rating || t.avg_rating, { label: `Team OVR, ${_currentSeason}` })}
    </div>`).join("");

  list.querySelectorAll(".team-list-item").forEach(el => {
    el.addEventListener("click", () => {
      list.querySelectorAll(".team-list-item").forEach(x => x.classList.remove("active"));
      el.classList.add("active");
      const team = _allTeams.find(t => t.id === parseInt(el.dataset.id));
      if (team) showTeam(team);
    });
  });
}

function bindSidebarEvents() {
  let debounce;
  document.getElementById("team-search").addEventListener("input", () => {
    clearTimeout(debounce); debounce = setTimeout(renderTeamList, 150);
  });
}

// ── Conference standing widget ─────────────────────────────────────────────
function confStandingHTML(team) {
  if (!team.conference) return "";
  const confTeams = _allTeams
    .filter(t => t.conference === team.conference)
    .sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0));
  const rank  = confTeams.findIndex(t => t.id === team.id) + 1;
  const total = confTeams.length;
  const top5  = confTeams.slice(0, 5);
  const listHTML = top5.map((ct, i) => {
    const v = ct.avg_rating ? Math.round(ct.avg_rating) : "—";
    return `<div class="d-conf-standing-row${ct.id === team.id ? " active" : ""}">
      <span class="d-conf-rank">${i + 1}</span>
      <span class="d-conf-team-name">${_esc(ct.school)}</span>
      <span class="d-conf-ovr" style="color:${ct.avg_rating ? ratingColor(ct.avg_rating) : "#666"}">${v}</span>
    </div>`;
  }).join("");
  return `<div class="d-conf-standing-chip" onclick="this.classList.toggle('expanded')">
    <span class="d-conf-standing-summary">#${rank} of ${total} in ${_esc(team.conference)} ▾</span>
    <div class="d-conf-standing-list">${listHTML}</div>
  </div>`;
}

// ── Team detail view ───────────────────────────────────────────────────────
const TEAM_TABS = ["roster", "ratings", "schedule", "transfers", "history"];

async function showTeam(team) {
  window.location.hash = slugify(team.school);
  const main = document.getElementById("teams-main");
  main.dataset.teamId = team.id;
  const teamColor = team.color || "var(--accent)";
  const avgR = team.avg_rating ? Math.round(team.avg_rating) : "—";
  const rCol = team.avg_rating ? ratingColor(team.avg_rating) : "#666";

  main.innerHTML = `
    <div class="d-team-hero" style="--d-team-color:${_esc(teamColor)};border-top-color:${_esc(teamColor)}">
      ${team.logo_url ? `<img class="d-hero-logo" src="${_esc(team.logo_url)}" alt="${_esc(team.school)}" onerror="this.style.display='none'">` : "<div style='width:84px'></div>"}
      <div class="d-hero-info">
        <div class="d-hero-name">${_esc(team.school)}</div>
        ${team.conference ? `<span class="d-hero-conf-badge">${_esc(team.conference)}</span>` : ""}
        ${confStandingHTML(team)}
      </div>
      <div class="d-hero-right">
        <div class="d-hero-ovr-box">
          <span class="d-hero-ovr-num" style="color:${rCol}">${avgR}</span>
          <span class="d-hero-ovr-label">TEAM OVR</span>
        </div>
        <div class="hero-stat-row">
          <span class="hero-stat-sm">${team.player_count || "—"} players · ${_currentSeason} season</span>
        </div>
      </div>
    </div>
    <nav class="tabs" id="team-subnav">
      ${TEAM_TABS.map(tab =>
        `<button class="tab${_activeTab === tab ? " active" : ""}" data-tab="${tab}">${tab.charAt(0).toUpperCase() + tab.slice(1)}</button>`
      ).join("")}
    </nav>
    <div id="team-tab-content" class="team-tab-content">
      ${skeletonRows(6)}
    </div>`;

  main.querySelectorAll("#team-subnav .tab").forEach(btn => {
    btn.addEventListener("click", () => {
      main.querySelectorAll("#team-subnav .tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _activeTab = btn.dataset.tab;
      _rosterPosFilter = "ALL";
      loadTab(team, _activeTab);
    });
  });

  loadTab(team, _activeTab);
}

async function loadTab(team, tab) {
  const content = document.getElementById("team-tab-content");
  content.innerHTML = skeletonRows(6);
  try {
    if (tab === "roster")         content.innerHTML = await buildRosterHTML(team);
    else if (tab === "ratings")   content.innerHTML = await buildTeamRatingsHTML(team);
    else if (tab === "schedule")  content.innerHTML = await buildScheduleHTML(team);
    else if (tab === "transfers") content.innerHTML = await buildTransfersHTML(team);
    else if (tab === "history")   content.innerHTML = await buildTeamHistoryHTML(team);
  } catch (e) {
    content.innerHTML = errorState(`Failed to load: ${e.message}`);
  }
  // Make all tables in the tab content sortable by clicking column headers
  content.querySelectorAll("table").forEach(makeSortable);
  bindRosterEvents(team);
  // Top-performer rows (Ratings tab) open the player modal
  content.querySelectorAll(".tperf-row[data-player-id]").forEach(row => {
    row.addEventListener("click", () =>
      openPlayerModal(parseInt(row.dataset.playerId), _currentSeason));
  });
}

// ── Team Ratings ──────────────────────────────────────────────────────────
async function buildTeamRatingsHTML(team) {
  const all = await _load("team_ratings.json") || [];
  const tr = all.find(r => r.team_id === team.id && r.season === _currentSeason)
          || all.find(r => r.team_id === team.id);

  if (!tr) {
    return `<div class="team-ratings-card">
      ${emptyState(`No team ratings data for ${team.school} (${_currentSeason}). ` +
        `Run pipeline scripts 10 then 12 (12_export_frontend_json.py).`)}
    </div>`;
  }

  const sub = [
    { label: "Pass Offense",  key: "pass_off",      icon: "🏈" },
    { label: "Run Offense",   key: "run_off",       icon: "💨" },
    { label: "Pass Defense",  key: "pass_def",      icon: "🛡️" },
    { label: "Run Defense",   key: "run_def",       icon: "🧱" },
    { label: "Special Teams", key: "special_teams", icon: "⚡" },
  ];

  const subBars = sub.map(s => {
    const v = tr[s.key] != null ? Math.round(tr[s.key]) : null;
    const pct = v != null ? Math.round((v - 30) / 69 * 100) : 0;
    const color = v != null ? ratingColor(v) : "#444";
    return `
      <div class="tr-sub-row">
        <span class="tr-sub-label">${s.icon} ${s.label}</span>
        <div class="tr-bar-wrap">
          <div class="tr-bar" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="tr-sub-val" style="color:${color}">${v ?? "—"}</span>
      </div>`;
  }).join("");

  const ovr = tr.overall_rating != null ? Math.round(tr.overall_rating) : "—";
  const ovrColor = tr.overall_rating ? ratingColor(tr.overall_rating) : "#666";
  const off = tr.offense_rating != null ? Math.round(tr.offense_rating) : "—";
  const def = tr.defense_rating != null ? Math.round(tr.defense_rating) : "—";
  const offCol = tr.offense_rating ? ratingColor(tr.offense_rating) : "#666";
  const defCol = tr.defense_rating ? ratingColor(tr.defense_rating) : "#666";
  // POWER index = raw SP+ margin — the cross-season "team EDGE" (absolute, year-agnostic)
  const powStr = tr.sp_overall != null ? `${tr.sp_overall > 0 ? "+" : ""}${parseFloat(tr.sp_overall).toFixed(1)}` : "—";
  const rcStr = tr.recruiting_score != null ? `Recruiting ${Math.round(tr.recruiting_score)}` : "";

  // Ensure roster is loaded so Top Performers renders even if Ratings is opened first
  if (!team._rosterCache) {
    try { team._rosterCache = await fetchTeamRoster(team.id, _currentSeason); } catch (_) {}
  }
  const statsPanel = await buildTeamStatsPanel(team);
  const performers = buildTopPerformers(team);

  return `
    <div class="team-ratings-card">
      <div class="tr-hero">
        <div class="tr-ovr-circle" style="border-color:${ovrColor};color:${ovrColor}">
          <span class="tr-ovr-num">${ovr}</span>
          <span class="tr-ovr-lbl">OVR</span>
        </div>
        <div class="tr-hero-meta">
          <div class="tr-hero-name">${_esc(team.school)} ${tr.season || _currentSeason}</div>
          <div class="tr-od-row">
            <span class="tr-od-chip" style="color:${offCol}">OFF <b>${off}</b></span>
            <span class="tr-od-chip" style="color:${defCol}">DEF <b>${def}</b></span>
            <span class="tr-od-chip tr-power" title="Schedule-adjusted SP+ margin — compare across any season">POWER <b>${powStr}</b></span>
          </div>
          ${rcStr ? `<div class="tr-hero-sub">${rcStr}</div>` : ""}
        </div>
      </div>
      <div class="tr-sub-section">
        <div class="tr-sub-heading">Rating Breakdown</div>
        ${subBars}
      </div>
      ${statsPanel}
      ${performers}
      <p style="font-size:var(--fs-xs);color:var(--text-muted);margin-top:1rem">
        OVR is anchored to SP+ (schedule-adjusted scoring margin) blended with roster talent,
        so a 2019 LSU compares directly to any other season. POWER is the raw SP+ margin.
      </p>
    </div>`;
}

// ── Team stats panel (per-game metrics from team_stats_{season}.json) ───────
async function buildTeamStatsPanel(team) {
  const all = await _load(`team_stats_${_currentSeason}.json`);
  const s = all?.[String(team.id)];
  if (!s) return "";

  const fmt = (v, suffix = "") => (v == null ? "—" : `${v}${suffix}`);
  const top = (label, val) => `
    <div class="tstat"><span class="tstat-val">${val}</span><span class="tstat-lbl">${label}</span></div>`;

  const offGrid = [
    top("Yards/G", fmt(s.yards_pg)),
    top("Pass/G", fmt(s.pass_yards_pg)),
    top("Rush/G", fmt(s.rush_yards_pg)),
    top("3rd Down", fmt(s.third_down_pct, "%")),
  ].join("");
  const defGrid = [
    top("Yds Allowed/G", fmt(s.yards_allowed_pg)),
    top("Pass All/G", fmt(s.pass_allowed_pg)),
    top("Rush All/G", fmt(s.rush_allowed_pg)),
    top("3rd Down Def", fmt(s.third_down_def_pct, "%")),
  ].join("");
  const advGrid = [
    top("Sacks/G", fmt(s.sacks_pg)),
    top("TFL/G", fmt(s.tfl_pg)),
    top("Takeaways", fmt(s.takeaways)),
    top("TO Margin", s.turnover_margin == null ? "—" : (s.turnover_margin > 0 ? "+" : "") + s.turnover_margin),
  ].join("");

  return `
    <div class="tr-stats-section">
      <div class="tr-sub-heading">Team Stats <span class="tr-stat-era">${_currentSeason}</span></div>
      <div class="tstat-block"><div class="tstat-block-lbl">Offense</div><div class="tstat-grid">${offGrid}</div></div>
      <div class="tstat-block"><div class="tstat-block-lbl">Defense</div><div class="tstat-grid">${defGrid}</div></div>
      <div class="tstat-block"><div class="tstat-block-lbl">Disruption & Ball Security</div><div class="tstat-grid">${advGrid}</div></div>
    </div>`;
}

function buildTopPerformers(team) {
  const roster = team._rosterCache;
  if (!roster || !roster.length) return "";
  const top = [...roster]
    .filter(p => p.overall_rating != null)
    .sort((a, b) => b.overall_rating - a.overall_rating)
    .slice(0, 5);
  if (!top.length) return "";
  const rows = top.map(p => `
    <div class="tperf-row" data-player-id="${p.player_id ?? p.id}">
      ${posBadge(p.position_group || p.position)}
      <span class="tperf-name">${_esc(p.name || "—")}</span>
      ${ovrPill(p.overall_rating, { label: `Overall rating, ${_currentSeason}` })}
    </div>`).join("");
  return `
    <div class="tr-perf-section">
      <div class="tr-sub-heading">Top Performers</div>
      <div class="tperf-list">${rows}</div>
    </div>`;
}

// ── Roster ─────────────────────────────────────────────────────────────────
const OFF_FILTERS = ["ALL", "QB", "RB", "WR", "TE", "OL"];
const DEF_FILTERS = ["EDGE", "DL", "LB", "CB", "S", "DB", "K", "P"];

async function buildRosterHTML(team) {
  // Prime the caches the row renderer reads synchronously: Engine D projections
  // (Proj column) and EDGE percentiles (EDGE % column).
  const [players] = await Promise.all([
    fetchTeamRoster(team.id, _currentSeason),
    loadTrajectory(),
    buildEdgePercentiles(_currentSeason),
  ]);
  if (!players.length) return emptyState("No roster data for this season.");

  team._rosterCache = players;

  // Update hero player count with actual roster size
  const heroStat = document.querySelector(".hero-stat-sm");
  if (heroStat) heroStat.textContent = `${players.length} players · ${_currentSeason} season`;

  return renderRosterCards(players);
}

function renderRosterCards(players) {
  const yearLabels = { 1: "FR", 2: "SO", 3: "JR", 4: "SR", 5: "GR" };
  const filtered = _rosterPosFilter === "ALL"
    ? players
    : players.filter(p => p.position_group === _rosterPosFilter || p.position === _rosterPosFilter);

  filtered.sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));

  const makeChip = pg =>
    `<span class="pos-chip${_rosterPosFilter === pg ? " active" : ""}" data-posfilter="${pg}">${pg}</span>`;

  const filterBar = `
    <div class="d-roster-filter-rows">
      <div class="d-roster-filter-row">${OFF_FILTERS.map(makeChip).join("")}</div>
      <div class="d-roster-filter-row">${DEF_FILTERS.map(makeChip).join("")}</div>
    </div>`;

  const header = `<div class="draft-board-header">
    <span>#</span><span>POS</span><span>Player</span>
    <span style="text-align:center">Yr</span><span style="text-align:center">Stars</span>
    <span style="text-align:center">Ht</span><span style="text-align:center">Wt</span>
    <span>Hometown</span>
    <span style="text-align:center">OVR</span><span style="text-align:center" title="Engine D projected change in OVR next season">Proj</span><span style="text-align:center" title="EDGE percentile within position group — raw EDGE is not comparable across positions">EDGE %</span>
  </div>`;

  const pctMap = _edgePctBySeason[_currentSeason] || {};
  const cards = filtered.map((p, i) => {
    const ovr      = p.overall_rating ? Math.round(p.overall_rating) : null;
    const ovrColor = ovr ? ratingColor(ovr) : "var(--text-muted)";
    const rowTint  = ovr ? `${ovrColor}10` : "transparent";
    const yr       = yearLabels[p.year] || "—";
    const starsStr = p.stars ? "★".repeat(p.stars) + "☆".repeat(5 - p.stars) : "—";
    const edgePct  = pctMap[p.player_season_id];
    const oap      = edgePct != null
      ? `<span title="EDGE ${parseFloat(p.edge_score).toFixed(1)} — ${edgePct}th percentile among ${_esc(p.position_group || "")}s">${edgePct}</span>`
      : "—";
    const ht       = p.height_in ? `${Math.floor(p.height_in / 12)}'${p.height_in % 12}"` : "—";
    const wt       = p.weight_lbs ? `${p.weight_lbs}` : "—";
    const hometown = p.hometown_state || "—";
    return `
      <div class="draft-row" data-player-id="${p.player_id ?? p.id}" style="background:${rowTint};border-left-color:${ovrColor}">
        <div class="draft-rank">${i + 1}</div>
        <div class="draft-pos">${posBadge(p.position_group || p.position)}</div>
        <div class="draft-name"><span class="player-name-text">${_esc(p.name || "—")}</span></div>
        <div class="draft-yr-conf" style="text-align:center">${yr}</div>
        <div class="draft-stars">${starsStr}</div>
        <div class="draft-ht">${ht}</div>
        <div class="draft-wt">${wt}</div>
        <div class="draft-team" style="font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(hometown)}</div>
        <div class="draft-ovr">${ovrPill(p.overall_rating, { label: `Overall rating, ${_currentSeason}` })}</div>
        <div class="draft-traj">${projHtml(p.player_season_id)}</div>
        <div class="draft-edge">${oap}</div>
      </div>`;
  }).join("");

  return `${filterBar}
    <div class="roster-table" id="roster-cards">
      ${header}${cards || emptyState("No players for this filter.")}
    </div>
    <div class="roster-footer">${filtered.length} shown · ${players.length} total</div>`;
}

function bindRosterEvents(team) {
  // Sortable column headers for the div-based roster grid
  const rosterContainer = document.getElementById("roster-cards");
  if (rosterContainer) {
    const headerEl = rosterContainer.querySelector(".draft-board-header");
    makeGridSortable(headerEl, rosterContainer);
  }

  document.querySelectorAll("[data-posfilter]").forEach(btn => {
    btn.addEventListener("click", () => {
      _rosterPosFilter = btn.dataset.posfilter;
      const content = document.getElementById("team-tab-content");
      if (team._rosterCache) {
        content.innerHTML = renderRosterCards(team._rosterCache);
        bindRosterEvents(team);
      }
    });
  });

  document.querySelectorAll("#roster-cards .draft-row[data-player-id]").forEach(card => {
    card.addEventListener("click", () => {
      openPlayerModal(parseInt(card.dataset.playerId), _currentSeason);
    });
  });
}

// ── Schedule ───────────────────────────────────────────────────────────────
async function buildScheduleHTML(team) {
  const games = await fetchTeamSchedule(team.id, _currentSeason);
  if (!games.length) return emptyState("No schedule data for this season.");

  // Sort by game_date ascending (handles bowl games at end correctly)
  games.sort((a, b) => {
    const da = a.game_date || "9999", db = b.game_date || "9999";
    return da < db ? -1 : da > db ? 1 : (a.week || 99) - (b.week || 99);
  });

  const rows = games.map(g => {
    const site = g.is_home ? "vs" : "@";
    let result = `<span style="color:var(--text-muted)">—</span>`;
    if (g.result) {
      const won = g.result === "W";
      result = `<span class="status-pill ${won ? "in" : "out"}">${g.result} ${g.team_score}–${g.opp_score ?? 0}</span>`;
    }
    const wkLabel = g.week ? `Wk ${g.week}` : "Bowl";
    const dateStr = g.game_date ? g.game_date.slice(0, 10) : "—";
    return `
      <tr>
        <td style="color:var(--text-muted)">${wkLabel}</td>
        <td style="color:var(--text-muted)">${dateStr}</td>
        <td>${site} <strong>${g.opponent ? teamLink(g.opponent, { season: _currentSeason }) : "TBD"}</strong>${g.neutral_site ? " <small>(N)</small>" : ""}</td>
        <td>${result}</td>
      </tr>`;
  }).join("");

  const wins   = games.filter(g => g.result === "W").length;
  const losses = games.filter(g => g.result === "L").length;
  const played = wins + losses;

  return `
    ${played ? `<div class="schedule-record"><span class="record-val">${wins}–${losses}</span> <span class="record-lbl">Record (${_currentSeason})</span></div>` : ""}
    <table class="leaderboard-table">
      <thead><tr><th>Wk</th><th>Date</th><th>Opponent</th><th>Result</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Transfers ──────────────────────────────────────────────────────────────
async function buildTransfersHTML(team) {
  const transfers = await fetchTeamTransfers(team.id, _currentSeason);
  if (!transfers.length) return emptyState(`No transfer portal data for ${_currentSeason} — portal data begins in 2021.`);

  const incoming = transfers.filter(t => t.direction === "in");
  const outgoing = transfers.filter(t => t.direction === "out");

  const makeRows = (arr, direction) => arr.map(t => {
    const otherSchool = direction === "in" ? t.from_school : t.to_school;
    const prev = t.ovr_previous, curr = t.ovr_current;
    let ovrCell = "—";
    if (prev || curr) {
      ovrCell = comparePair(
        prev ? ovrPill(prev, { label: "OVR at previous school (previous season)" }) : "<span style='color:var(--text-muted)'>—</span>",
        curr ? ovrPill(curr, { label: "OVR at this school (transfer season)" }) : "<span style='color:var(--text-muted)'>—</span>",
        { title: "Previous-school OVR → new-school OVR" });
      if (prev && curr) ovrCell += ` ${deltaChip(curr - prev, { title: "OVR change across the transfer" })}`;
    }
    return `<tr>
      <td class="name-col">${t.player_id ? playerLink(t.player_id, t.name, { season: _currentSeason }) : _esc(t.name || "—")}</td>
      <td>${t.position_group ? posBadge(t.position_group) : "—"}</td>
      <td>${otherSchool ? teamLink(otherSchool, { season: _currentSeason }) : "—"}</td>
      <td>${ovrCell}</td>
      <td style="color:var(--text-muted);font-size:0.8rem">${_esc(t.portal_date || "—")}</td>
    </tr>`;
  }).join("");

  const section = (title, arr, pillClass) => {
    if (!arr.length) return "";
    return `
      <h3 style="font-family:var(--font-display);font-size:var(--fs-lg);color:var(--accent);margin:1.5rem 0 0.5rem;padding-left:4px;border-left:3px solid var(--accent)">
        <span class="status-pill ${pillClass}">${pillClass === "in" ? "IN" : "OUT"}</span> ${title} (${arr.length})
      </h3>
      <table class="leaderboard-table">
        <thead><tr><th>Player</th><th>Pos</th><th>${pillClass === "in" ? "From" : "To"}</th><th>Prev → New OVR</th><th>Portal Date</th></tr></thead>
        <tbody>${makeRows(arr, pillClass)}</tbody>
      </table>`;
  };

  return section("Transfers In", incoming, "in") + section("Transfers Out", outgoing, "out");
}

// ── Team History ───────────────────────────────────────────────────────────
async function buildTeamHistoryHTML(team) {
  const history = await _load("team_history.json");
  const rows = history?.[String(team.id)] ?? [];
  if (!rows.length) return emptyState("No historical data yet. Run pipeline scripts 10 then 12.");

  const tableRows = rows.map(r => {
    const rec = (r.wins != null) ? `${r.wins}–${r.losses ?? 0}` : "—";
    return `<tr>
      <td class="hist-season">${r.season}</td>
      <td class="hist-record">${rec}</td>
      <td>${_esc(r.conference ?? "—")}</td>
      <td class="hist-sp">${r.sp_overall != null ? parseFloat(r.sp_overall).toFixed(1) : "—"}</td>
      <td>${ovrPill(r.overall_rating, { label: `Team OVR, ${r.season}` })}</td>
    </tr>`;
  }).join("");

  return `<div class="team-history-wrap">
    <table class="history-table">
      <thead><tr>
        <th>Season</th><th>Record</th><th>Conference</th><th>SP+</th><th>OVR</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>`;
}
