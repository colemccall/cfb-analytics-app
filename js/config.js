// Central configuration — imported by all other JS files.

const CONFIG = {
  DATA_BASE:      "./data/",
  CURRENT_SEASON: 2025,
  // Full range of seasons exported by the pipeline (data/players_YYYY.json).
  // Season pickers build their options from this — don't hardcode year lists.
  FIRST_SEASON:   2008,

  // 12-group position system
  POSITIONS: ["QB", "RB", "WR", "TE", "OL", "EDGE", "DL", "LB", "CB", "S", "K", "P"],

  // Position identity colors
  POS_COLORS: {
    QB: "#FFB300", RB: "#43A047", WR: "#1E88E5", TE: "#00ACC1",
    OL: "#757575", EDGE: "#FF5722", DL: "#E53935", LB: "#FB8C00",
    CB: "#8E24AA", S: "#5C6BC0",   K: "#039BE5",  P: "#0288D1",
    DB: "#5C6BC0", ATH: "#546E7A",
  },

  // EA CFB 25-style rating tiers
  RATING_TIERS: {
    ELITE:   { min: 90, label: "ELITE",  color: "#FFD700" },
    GOLD:    { min: 80, label: "GOLD",   color: "#FFA000" },
    SILVER:  { min: 70, label: "SILVER", color: "#78909C" },
    BRONZE:  { min: 55, label: "BRONZE", color: "#8D6E63" },
    NORMAL:  { min: 0,  label: "",       color: null },
  },

  // Skill attribute display names per position group (mirrors SHAP feature names)
  SKILL_ATTRS: {
    QB:   [["comp_pct","Completion %"],["yards_per_att","Yards/Att"],["td_int_ratio","TD:INT"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    RB:   [["yards_per_carry","YPC"],["yards_total","Total Yds"],["rec_versatility","Receiving"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    WR:   [["td_score","TD Impact"],["yards_per_rec","Yds/Rec"],["yards_total","Total Yards"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    TE:   [["td_score","TD Impact"],["yards_per_rec","Yds/Rec"],["yards_total","Total Yards"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    OL:   [["team_rush_ypa","Team Rush YPA"],["team_sack_rate_inv","Pass Pro"],["recruit_composite","Recruiting"],["experience","Experience"],["award_tier","Awards"]],
    EDGE: [["pass_rush_score","Pass Rush"],["disruption_rate","Disruption"],["run_stop_score","Run Stop"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    DL:   [["pass_rush_score","Pass Rush"],["run_stop_score","Run Stop"],["disruption_rate","Disruption"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    LB:   [["tackling_score","Tackling"],["coverage_score","Coverage"],["pass_rush_score","Pass Rush"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    CB:   [["coverage_score","Coverage"],["instinct_score","Instincts"],["tackling_score","Tackling"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    S:    [["coverage_score","Coverage"],["tackling_score","Tackling"],["instinct_score","Instincts"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    DB:   [["coverage_score","Coverage"],["tackling_score","Tackling"],["instinct_score","Instincts"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    K:    [["fg_pct","FG %"],["fg_long","FG Long"],["xp_pct","XP %"]],
    P:    [["avg_yards","Avg Yds"],["inside_20_pct","Inside 20 %"]],
  },
};

// Rating tier — returns {label, color, cls}
function getRatingTier(rating) {
  const c = ratingColor(rating);
  if (rating >= 90) return { label: "", color: c, cls: "tier-elite"  };
  if (rating >= 80) return { label: "", color: c, cls: "tier-gold"   };
  if (rating >= 70) return { label: "", color: c, cls: "tier-silver" };
  if (rating >= 55) return { label: "", color: c, cls: "tier-bronze" };
  return                    { label: "", color: null, cls: "tier-normal" };
}

// Rating color gradient — adapts to light vs dark theme
function ratingColor(rating) {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  if (isLight) {
    if (rating >= 90) return "#1565C0";
    if (rating >= 80) return "#1976D2";
    if (rating >= 70) return "#0288D1";
    if (rating >= 55) return "#455A64";
    if (rating >= 40) return "#8D6E63";
    return "#c62828";
  }
  // Dark / mid theme — gold/amber palette
  if (rating >= 90) return "#FFD700";
  if (rating >= 80) return "#FFA000";
  if (rating >= 70) return "#90A4AE";  // lighter slate — readable with dark text
  if (rating >= 55) return "#A1887F";  // lighter brown — readable with dark text
  if (rating >= 40) return "#ff9800";
  return "#f44336";
}

// Returns #111 or #fff depending on whether the hex background is light enough
function ratingTextColor(hexOrRating) {
  let hex = typeof hexOrRating === "number" ? ratingColor(hexOrRating) : hexOrRating;
  if (!hex || !hex.startsWith("#")) return "#111";
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  // Perceived luminance
  const lum = 0.299*r + 0.587*g + 0.114*b;
  return lum > 140 ? "#111" : "#fff";
}

// Position color helper
function posColor(pg) {
  return CONFIG.POS_COLORS[pg] || CONFIG.POS_COLORS.ATH;
}

// Trajectory arrow helper
function trajHtml(score) {
  if (!score && score !== 0) return '<span class="traj-flat">—</span>';
  if (score >  5) return `<span class="traj-up2">↑↑ +${score.toFixed(1)}</span>`;
  if (score >  1) return `<span class="traj-up1">↑ +${score.toFixed(1)}</span>`;
  if (score < -5) return `<span class="traj-down2">↓↓ ${score.toFixed(1)}</span>`;
  if (score < -1) return `<span class="traj-down1">↓ ${score.toFixed(1)}</span>`;
  return '<span class="traj-flat">→</span>';
}

// Stars display helper
function starsHtml(n) {
  const filled = "★".repeat(Math.max(0, Math.min(5, n || 0)));
  const empty  = "☆".repeat(Math.max(0, 5 - (n || 0)));
  return `<span class="stars">${filled}${empty}</span>`;
}

// ── Sortable helpers (shared by teams.html and playerSearch.js) ───────────

function _sortVal(text) {
  const t = (text || "").trim();
  if (!t || t === "—") return null;
  const htMatch = t.match(/^(\d+)'(\d+)"?$/);
  if (htMatch) return parseInt(htMatch[1]) * 12 + parseInt(htMatch[2]);
  const stars = (t.match(/★/g) || []).length;
  if (stars > 0) return stars;
  const num = parseFloat(t.replace(/[^0-9.\-]/g, ""));
  return isNaN(num) ? t.toLowerCase() : num;
}

function _sortRows(items, getValFn, asc) {
  items.sort((a, b) => {
    const av = getValFn(a), bv = getValFn(b);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av < bv) return asc ? -1 : 1;
    if (av > bv) return asc ?  1 : -1;
    return 0;
  });
}

function makeSortable(table) {
  if (!table) return;
  const ths = table.querySelectorAll("thead th");
  ths.forEach((th, colIdx) => {
    th.style.cursor = "pointer";
    th.style.userSelect = "none";
    let asc = null;
    th.addEventListener("click", () => {
      asc = asc === true ? false : true;
      ths.forEach(h => { h.textContent = h.textContent.replace(/ [▲▼]$/, ""); });
      th.textContent = th.textContent + (asc ? " ▲" : " ▼");
      const tbody = table.querySelector("tbody");
      const rows  = Array.from(tbody.querySelectorAll("tr"));
      _sortRows(rows, r => _sortVal(r.cells[colIdx]?.innerText), asc);
      rows.forEach(r => tbody.appendChild(r));
    });
  });
}

function makeGridSortable(headerEl, containerEl) {
  if (!headerEl || !containerEl) return;
  const spans = Array.from(headerEl.querySelectorAll("span"));
  spans.forEach((sp, colIdx) => {
    sp.style.cursor = "pointer";
    let asc = null;
    sp.addEventListener("click", () => {
      asc = asc === true ? false : true;
      spans.forEach(s => { s.textContent = s.textContent.replace(/ [▲▼]$/, ""); });
      sp.textContent = sp.textContent + (asc ? " ▲" : " ▼");
      const rows = Array.from(containerEl.querySelectorAll(".draft-row"));
      _sortRows(rows, r => _sortVal(r.children[colIdx]?.innerText), asc);
      rows.forEach(r => containerEl.appendChild(r));
    });
  });
}


// ---------------------------------------------------------------------------
// Season pickers
// ---------------------------------------------------------------------------

// All exported seasons, newest first.
function seasonList() {
  const out = [];
  for (let y = CONFIG.CURRENT_SEASON; y >= CONFIG.FIRST_SEASON; y--) out.push(y);
  return out;
}

// Fill a <select> with the full season range and select `selected`.
// Keeps every picker in sync with the data actually on disk.
function fillSeasonSelect(el, selected = CONFIG.CURRENT_SEASON) {
  if (!el) return;
  el.innerHTML = seasonList().map(y =>
    `<option value="${y}"${y === Number(selected) ? " selected" : ""}>${y}</option>`
  ).join("");
}

// ---------------------------------------------------------------------------
// Entity links — every team and player reference in the app routes through
// these, so a team name means the same thing (and is clickable) everywhere it
// appears: grids, modals, research tables, schedules, transfers, rosters.
// ---------------------------------------------------------------------------

function _esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function teamHref(school, season) {
  const q = new URLSearchParams({ team: school ?? "" });
  if (season) q.set("season", season);
  return `teams.html?${q}`;
}

// Renders a team as a link. Pass logo:true to prefix the team mark.
function teamLink(school, { season, logo, cls = "" } = {}) {
  if (!school) return '<span class="muted">—</span>';
  const img = logo ? `<img class="entity-logo" src="${_esc(logo)}" alt="" loading="lazy">` : "";
  return `<a class="entity-link entity-link--team ${cls}" href="${teamHref(school, season)}"
             title="View ${_esc(school)}">${img}${_esc(school)}</a>`;
}

function playerHref(playerId, season) {
  const q = new URLSearchParams({ player: playerId });
  if (season) q.set("season", season);
  return `players.html?${q}`;
}

// Renders a player as a link. On pages that host the modal the delegated
// handler below opens it in place; elsewhere the href navigates, so the link
// works either way.
function playerLink(playerId, name, { season, cls = "" } = {}) {
  if (!playerId) return _esc(name || "—");
  return `<a class="entity-link entity-link--player ${cls}" href="${playerHref(playerId, season)}"
             data-player-id="${_esc(playerId)}" data-player-season="${_esc(season ?? "")}"
             >${_esc(name || "Player")}</a>`;
}

// One delegated listener per page, installed automatically below. Intercepts
// player links only when this page can actually show the modal; otherwise the
// plain href navigation stands.
function initEntityLinks() {
  if (window._entityLinksBound) return;
  window._entityLinksBound = true;
  document.addEventListener("click", ev => {
    const a = ev.target.closest("a.entity-link--player[data-player-id]");
    if (!a) return;
    if (typeof openPlayerModal !== "function" || !document.getElementById("player-modal")) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;  // let new-tab through
    ev.preventDefault();
    const season = a.dataset.playerSeason ? Number(a.dataset.playerSeason) : undefined;
    openPlayerModal(Number(a.dataset.playerId), season);
  });
}

// Delegated entity-link handling is page-agnostic, so install it once here
// rather than requiring every page to remember the call.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initEntityLinks);
} else {
  initEntityLinks();
}
