// Central configuration — imported by all other JS files.

const CONFIG = {
  DATA_BASE:      "./data/",

  // ── Seasons ───────────────────────────────────────────────────────────────
  // Three constants, because "the current season" means two different things:
  //   CURRENT_SEASON     the season the app defaults to — 2026, in progress. Its
  //                      player ratings are still preseason projections; ratings
  //                      earned on the games so far are in live_2026.json
  //   LAST_PLAYED_SEASON the newest season with EARNED ratings. Anything
  //                      retrospective (hidden gems, research, "best of last
  //                      year") must use this or it will narrate model output
  //                      as fact.
  //   PROJECTED_SEASONS  seasons whose ratings come from the projection engine
  //
  // These mirror data/manifest.json, which the pipeline writes. config.js is
  // loaded synchronously before any fetch, so it cannot read the manifest at
  // runtime; a pipeline contract test asserts the two agree
  // (tests/test_export_contract.py::test_frontend_season_constants_agree).
  FIRST_SEASON:       2008,
  LAST_PLAYED_SEASON: 2025,
  CURRENT_SEASON:     2026,
  PROJECTED_SEASONS:  [2026],

  // Seasons with a power_games_{season}.json (script 12): every game behind each team's power
  // rating, for the Rankings screen's explanation. Guarded against the files on disk by
  // tests/test_frontend_config.py.
  POWER_GAME_SEASONS: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],

  // The shares of the headline team rating (roster, stats, results), for the Compare screen's explanation. Mirrors
  // W_ROSTER_BLEND / W_STATS_BLEND / W_RESULTS_BLEND in scripts/10_compute_team_ratings.py; guarded by
  // tests/test_frontend_config.py.
  HEADLINE_WEIGHTS: { roster: 1 / 6, stats: 1 / 6, results: 2 / 3 },

  // Player cards are served as cards/NNNN.json shards (script 12 export_player_cards): the file for a
  // player is player_id % CARD_SHARDS, zero-padded to four digits. Guarded against the script's
  // constant by tests/test_frontend_config.py.
  CARD_SHARDS: 1024,

  // Headshots on the player card: linked from ESPN's image host (never copied into the repo) for the
  // players script 19 matched to an ESPN athlete (data/headshots.json). false hides every photo and
  // the card keeps the monogram. The match rate that justified showing them is guarded by
  // tests/test_headshots.py.
  HEADSHOTS_ENABLED: true,

  // Class years with a recruiting_{year}.json (script 18; the menu's Recruiting screen).
  // Guarded against the files on disk by tests/test_frontend_config.py.
  RECRUITING_SEASONS: [2020, 2021, 2022, 2023, 2024, 2025, 2026],

  // Seasons with a live_{season}.json (script 17: ratings earned so far in a season
  // being played). Guarded against the files on disk by tests/test_frontend_config.py.
  LIVE_SEASONS:       [2026],

  // Seasons with weekly_teams_{season}.json and weekly_players_{season}.json (script 17b: the ratings as they stood after
  // each completed week). Guarded against the files on disk by tests/test_frontend_config.py.
  WEEKLY_SEASONS:     [2026],

  // Seasons with a transfers_{season}.json (the league-wide portal tab reads them).
  // Guarded against the files on disk by tests/test_frontend_config.py.
  TRANSFER_SEASONS:   [2021, 2022, 2023, 2024, 2025, 2026],

  // 12-group position system
  POSITIONS: ["QB", "RB", "WR", "TE", "OL", "EDGE", "DL", "LB", "CB", "S", "K", "P"],

  // What a position FILTER selects, which is not always one group.
  //
  // The API labels 1,397 of 2,889 secondary players with a bare "DB" — 48%, and
  // that is upstream of us, not a parsing failure. CONFIG.POSITIONS above omits
  // DB entirely, so every one of those players was invisible to every position
  // filter on the site. That was a live bug, not a grouping preference.
  //
  // One "DB" filter option now selects CB ∪ S ∪ DB. Each row still shows its own
  // badge, because a corner and a safety are different jobs and the archetype
  // weights treat them differently (SECONDARY_ARCHETYPE_WEIGHTS in script 06).
  // Grouping the filter and keeping the badge is the honest combination: it
  // admits the source data is coarse without pretending we resolved it.
  POSITION_FILTER_GROUPS: {
    DB: ["CB", "S", "DB"],
  },

  // The order filters are offered in. DB replaces the separate CB/S entries;
  // "ATH" and other stragglers fall through to exact matching.
  FILTER_POSITIONS: ["QB", "RB", "WR", "TE", "OL", "EDGE", "DL", "LB", "DB", "K", "P"],

  // ── Themes — the skin contract ──────────────────────────────────────────────
  // The ONE list of themes. shell.js builds its swatches and validates saved
  // choices from it, _activeTheme() resolves against it, and tools/theme-check.mjs
  // fails the build if any entry lacks a CSS token block or a palette key below.
  // The first entry is the default. Adding a skin (e.g. a retro NCAA 11/12 look)
  // is: one row here, one [data-theme="id"] token block in styles.css, one key in
  // POS_COLORS and RATING_RAMP — no page code. `swatch`/`edge` paint the picker
  // button; they live here because colour literals are only allowed in palettes.
  THEMES: [
    { id: "dark",  label: "Dusk",     swatch: "#1a1f27", edge: "#a80f17" },
    { id: "light", label: "Daylight", swatch: "#ffffff", edge: "#a80f17" },
  ],

  // ── Domain palettes — the SINGLE source of position/tier/rating color.
  // Theme-keyed: light mode uses deepened variants so fills and text stay
  // readable on paper. There is deliberately no CSS copy of these values.
  POS_COLORS: {
    dark: {
      QB: "#FFB300", RB: "#43A047", WR: "#1E88E5", TE: "#26C6DA",
      OL: "#757575", EDGE: "#FF5722", DL: "#E53935", LB: "#FB8C00",
      CB: "#8E24AA", S: "#5C6BC0",   K: "#039BE5",  P: "#0288D1",
      DB: "#5C6BC0", ATH: "#546E7A",
    },
    light: {
      QB: "#8a6400", RB: "#2e7d32", WR: "#1565c0", TE: "#00838f",
      OL: "#546e7a", EDGE: "#bf360c", DL: "#b71c1c", LB: "#e65100",
      CB: "#6a1b9a", S: "#3949ab",   K: "#0277bd",  P: "#01579b",
      DB: "#3949ab", ATH: "#455a64",
    },
  },

  // Rating ramp: [threshold, fill] pairs, walked top-down. Fill text color is
  // chosen by ratingTextColor()'s luminance guard. Two things were wrong here
  // and both are fixed:
  //
  //  · the ELITE gold was #FFD700 — a pure, maximally light yellow. It cleared
  //    the contrast floor as a pill fill, but ratingColor() is also used as a
  //    TEXT color (teamsPage.js conference averages), and small text in a
  //    near-white yellow is hard to read whatever the ratio says. It is now a
  //    deeper gold that still reads as gold.
  //
  //  · the 80-90 band (#FFA000) and the 40-55 band (#FF9800) differed by 8 in a
  //    single channel — an 82-rated player and a 45-rated one were the same
  //    color. The low band is now clay, so no two bands are confusable.
  RATING_RAMP: {
    dark:  [[90, "#F2C230"], [80, "#E8973C"], [70, "#90A4AE"], [55, "#A1887F"], [40, "#D9705F"], [0, "#F0574A"]],
    light: [[90, "#7d6300"], [80, "#8f5300"], [70, "#546e7a"], [55, "#6d4c41"], [40, "#a13d2d"], [0, "#b91c1c"]],
  },

  // Tier labels (colors come from RATING_RAMP at the tier threshold)
  RATING_TIERS: {
    ELITE:  { min: 90, label: "ELITE" },
    GOLD:   { min: 80, label: "GOLD" },
    SILVER: { min: 70, label: "SILVER" },
    BRONZE: { min: 55, label: "BRONZE" },
    NORMAL: { min: 0,  label: "" },
  },

  // Skill attribute display names per position group (mirrors SHAP feature names)
  SKILL_ATTRS: {
    QB:   [["comp_pct","Completion %"],["yards_per_att","Yards/Att"],["td_int_ratio","TD:INT"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    RB:   [["yards_per_carry","YPC"],["yards_total","Total Yds"],["rec_versatility","Receiving"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    WR:   [["td_score","TD Impact"],["yards_per_rec","Yds/Rec"],["yards_total","Total Yards"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    TE:   [["td_score","TD Impact"],["yards_per_rec","Yds/Rec"],["yards_total","Total Yards"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    // OL carries no earned player rating from v4.3 — see NOT_RATED_POSITIONS in
    // ui.js. These are the LINE-UNIT inputs, shown on the team page. The old
    // entries here ("Team Rush YPA", "Pass Pro", "Experience") named features
    // that either never had a value or never changed.
    OL:   [["line_yards","Line Yards"],["sack_rate_allowed_inv","Pass Pro"],["stuff_rate_inv","Stuff Rate"],["power_success","Short Yardage"],["second_level_yards","2nd Level"]],
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

// Does a row's position group satisfy a position filter?
//
// The single place the DB grouping is applied. Every filter call site routes
// through it, so adding a future group (merging DL and EDGE, say) is one edit
// here rather than a hunt through five page scripts.
function matchesPosition(rowPos, filterPos) {
  if (!filterPos) return true;
  const group = CONFIG.POSITION_FILTER_GROUPS[filterPos];
  return group ? group.includes(rowPos) : rowPos === filterPos;
}

// Is this season's rating model output rather than earned production?
// Every rating render path routes through this, so provenance is a property of
// the season rather than something each call site has to remember to pass.
function isProjectedSeason(season) {
  return CONFIG.PROJECTED_SEASONS.includes(Number(season));
}

// Active theme id. Anything not in CONFIG.THEMES degrades to the default (the
// first entry) — safe, because every theme has palette keys (theme-check.mjs).
function _activeTheme() {
  const t = document.documentElement.getAttribute("data-theme");
  return CONFIG.THEMES.some(x => x.id === t) ? t : CONFIG.THEMES[0].id;
}

// Rating tier — returns {label, color, cls}
function getRatingTier(rating) {
  const c = ratingColor(rating);
  if (rating >= 90) return { label: "ELITE",  color: c, cls: "tier-elite"  };
  if (rating >= 80) return { label: "GOLD",   color: c, cls: "tier-gold"   };
  if (rating >= 70) return { label: "SILVER", color: c, cls: "tier-silver" };
  if (rating >= 55) return { label: "BRONZE", color: c, cls: "tier-bronze" };
  return                    { label: "", color: null, cls: "tier-normal" };
}

// Rating fill color — walks the active theme's ramp.
function ratingColor(rating) {
  const ramp = CONFIG.RATING_RAMP[_activeTheme()];
  for (const [min, color] of ramp) {
    if (rating >= min) return color;
  }
  return ramp[ramp.length - 1][1];
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

// Position color helper — theme-aware
function posColor(pg) {
  const palette = CONFIG.POS_COLORS[_activeTheme()];
  return palette[pg] || palette.ATH;
}

// Stars display helper
function starsHtml(n) {
  const filled = "★".repeat(Math.max(0, Math.min(5, n || 0)));
  const empty  = "☆".repeat(Math.max(0, 5 - (n || 0)));
  return `<span class="stars">${filled}${empty}</span>`;
}

// ── Sortable helpers (shared by teams.html and playerSearch.js) ───────────

// The sort key for one rendered cell's text: null for blank or "—" (sorts
// last), height strings like 6'2" as inches, star strings by star count,
// otherwise the first number in the text, else the lowercased text.
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

// Sort `items` in place by getValFn(item). Nulls always sort to the bottom,
// whichever direction is requested.
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

// Sortable <table class="data-table">: sets aria-sort attributes; the arrows
// are rendered by the .data-table th[aria-sort] CSS, never as header text.
function makeSortable(table) {
  if (!table) return;
  const ths = table.querySelectorAll("thead th");
  ths.forEach((th, colIdx) => {
    th.setAttribute("aria-sort", "none");
    th.style.userSelect = "none";
    th.addEventListener("click", () => {
      const asc = th.getAttribute("aria-sort") !== "ascending";
      ths.forEach(h => h.setAttribute("aria-sort", "none"));
      th.setAttribute("aria-sort", asc ? "ascending" : "descending");
      const tbody = table.querySelector("tbody");
      const rows  = Array.from(tbody.querySelectorAll("tr"));
      _sortRows(rows, r => _sortVal(r.cells[colIdx]?.innerText), asc);
      rows.forEach(r => tbody.appendChild(r));
    });
  });
}

// Make a div-based board (.draft-board-header + .draft-row) sortable by
// clicking header spans. Sorts on each row's rendered text via _sortVal and
// shows ▲/▼ on the active header. Used by the Players board and team rosters,
// which are grids rather than <table>s for their responsive collapse.
function makeGridSortable(headerEl, containerEl) {
  if (!headerEl || !containerEl) return;
  const spans = Array.from(headerEl.querySelectorAll("span"));
  spans.forEach((sp, colIdx) => {
    sp.style.cursor = "pointer";
    // A clickable <span> is invisible to the keyboard: make it a focusable
    // button that Enter and Space activate, like a real <th> sort control.
    sp.tabIndex = 0;
    sp.setAttribute("role", "button");
    sp.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sp.click(); }
    });
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
// Keeps every picker in sync with the data actually on disk. Projected seasons
// say so in the option text — picking 2026 should never feel like picking a
// season that has been played.
function fillSeasonSelect(el, selected = CONFIG.CURRENT_SEASON) {
  if (!el) return;
  el.innerHTML = seasonList().map(y =>
    `<option value="${y}"${y === Number(selected) ? " selected" : ""}>${y}${isProjectedSeason(y) ? " (projected)" : ""}</option>`
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

// Renders a team as a link. Pass logo:<url> to prefix the team mark (logo, or a
// monogram if it fails to load — see teamMark in ui.js).
function teamLink(school, { season, logo, cls = "" } = {}) {
  if (!school) return '<span class="muted">—</span>';
  const img = logo && typeof teamMark === "function" ? teamMark({ school, logo_url: logo }) : "";
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

// One skin for every page: the console-menu look. Themes are only its two palettes (dusk and
// daylight); the layout (a top tab strip above ~900px) is keyed on this attribute.
document.documentElement.setAttribute("data-skin", "console");
