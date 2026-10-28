// playerSearch.js — the Players board (players.html) and the player modal.
//
// Two jobs in one file, because the modal is shared: every page that names a
// player (home, teams, ratings, '26 hub, research) loads this file for
// openPlayerModal(), and only players.html calls initPlayerSearch().
//
//   board   initPlayerSearch → fetchAndRender (per-position fetch, merge) →
//           applyClientFilters (text + min OVR) → renderGrid → playerRowHtml
//   modal   openPlayerModal → modalContentHtml (+ renderRatingBreakdown,
//           renderArchetypes) → renderProjectionReasoning
//
// All data comes through dataLoader.js; nothing here calls fetch() directly.
// Load order: config.js, shell.js → dataLoader.js, ui.js → this file.

// [tint, solid] pair for a position group — the modal avatar's fill and ink.
function posGroupColor(g) {
  const c = posColor(g);
  return [c + "22", c];
}

let _allPlayers = [];        // the fetched board: top N per position group
let _filteredPlayers = [];   // _allPlayers after the client-side text + min-OVR filters
let _activeFilters = { position: "ALL", conference: "", minRating: 0, query: "", season: CONFIG.CURRENT_SEASON };
let _fetchPending = false;
let _refetchQueued = false;  // a filter changed mid-fetch — run again when it lands

// Every player's transfer history, {player_id: [move, …]} — the modal's Career
// Path. Cached by _load, so only the first modal open pays for it.
async function loadPlayerTransfers() {
  return (await _load("player_transfers.json")) || {};
}

// Engine D projections, indexed by player_season_id for O(1) modal lookup.
// Goes through dataLoader's fetchTrajectory so the {_meta, predictions} shape
// is unwrapped in exactly one place.
let _trajectoryCache = null;
let _trajectoryByPlayer = null;
let _trajectoryMeta  = {};

// Index Engine D's projections for synchronous lookup: by player_season_id
// (_trajectoryCache) and by player_id (_trajectoryByPlayer), and keep the
// model's own accuracy in _trajectoryMeta. Built once per page.
async function loadTrajectory() {
  if (_trajectoryCache) return _trajectoryCache;
  const { meta, rows } = await fetchTrajectory();
  _trajectoryMeta = meta || {};
  _trajectoryCache = {};
  _trajectoryByPlayer = {};
  for (const item of rows) {
    _trajectoryCache[String(item.player_season_id)] = item;
    _trajectoryByPlayer[String(item.player_id)] = item;
  }
  return _trajectoryCache;
}

// A projection is made FROM one season FOR the next, so its player_season_id is
// the source season's — 2025 — while a 2026 modal holds the 2026 id. Looking up
// by player_season_id alone silently found nothing on exactly the season where
// the projection matters most, so fall back to player_id.
function trajectoryFor(playerSeasonId, playerId) {
  if (playerSeasonId != null && _trajectoryCache?.[String(playerSeasonId)]) {
    return _trajectoryCache[String(playerSeasonId)];
  }
  if (playerId != null) return _trajectoryByPlayer?.[String(playerId)] || null;
  return null;
}

// Comps are matched on production profile, and an unplayed season has none —
// the pipeline writes no similar_players file for it, so asking was a 404 on
// every modal opened on the default season.
async function loadSimilarPlayers(season) {
  if (isProjectedSeason(season)) return {};
  return (await _load(`similar_players_${season}.json`)) || {};
}

const OFF_POS  = ["ALL", "QB", "RB", "WR", "TE", "OL"];
const DEF_POS  = ["EDGE", "DL", "LB", "CB", "S", "DB", "K", "P"];
const EDGE_POS = ["QB","RB","WR","TE","EDGE","DL","LB","CB","S","DB"];

const CAREER_FIELDS = {
  QB:   [["passingYDS","Pass Yds"],["passingTD","TDs"],["passingINT","INTs"],["passingATT","Att"],["passingCOMPLETIONS","Comp"],["passingYPA","YPA"]],
  RB:   [["rushingYDS","Rush Yds"],["rushingTD","TDs"],["rushingCAR","Car"],["rushingYPC","YPC"],["receivingREC","Rec"],["receivingYDS","Rec Yds"]],
  WR:   [["receivingYDS","Rec Yds"],["receivingTD","TDs"],["receivingREC","Rec"],["receivingYPR","YPR"]],
  TE:   [["receivingYDS","Rec Yds"],["receivingTD","TDs"],["receivingREC","Rec"]],
  EDGE: [["defensiveTOT","Tackles"],["defensiveSACKS","Sacks"],["defensiveTFL","TFL"],["defensiveQB HUR","Hurries"],["defensivePD","PDs"]],
  DL:   [["defensiveTOT","Tackles"],["defensiveSACKS","Sacks"],["defensiveTFL","TFL"],["defensiveQB HUR","Hurries"]],
  LB:   [["defensiveTOT","Tackles"],["defensiveSACKS","Sacks"],["defensiveTFL","TFL"],["interceptionsINT","INTs"],["defensivePD","PDs"]],
  CB:   [["defensiveTOT","Tackles"],["interceptionsINT","INTs"],["defensivePD","PDs"],["defensiveTFL","TFL"],["defensiveSACKS","Sacks"]],
  S:    [["defensiveTOT","Tackles"],["interceptionsINT","INTs"],["defensivePD","PDs"],["defensiveSACKS","Sacks"],["defensiveTFL","TFL"]],
  DB:   [["defensiveTOT","Tackles"],["interceptionsINT","INTs"],["defensivePD","PDs"],["defensiveTFL","TFL"]],
  K:    [["kickingFGM","FGM"],["kickingFGA","FGA"],["kickingLNG","Long"]],
  P:    [["puntingYDS","Yds"],["puntingNO","Punts"],["puntingIn 20","In 20"]],
};

// All known conferences — populated on first load
// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

// Entry point for players.html. Builds the filters, renders the board for the
// default season, then honours a ?player=ID[&season=YYYY] deep link.
//
// That link is what playerHref() emits everywhere, and it is the fallback on
// any page without the modal and on every ctrl/cmd-click — so it has to open
// the player, not just land on the board. A valid ?season= also switches the
// board to that season first, so the player sits in the context he was linked from.
async function initPlayerSearch() {
  const params = new URLSearchParams(location.search);
  const linkedSeason = Number(params.get("season"));
  if (seasonList().includes(linkedSeason)) _activeFilters.season = linkedSeason;

  buildPosChips();
  fillSeasonSelect(document.getElementById("filter-season"), _activeFilters.season);
  renderSeasonProvenance(_activeFilters.season);
  await populateConferenceOptions();
  bindFilterEvents();
  await fetchAndRender();
  // Position chips and OVR pills are theme-computed — repaint on theme switch
  // from the already-filtered rows (no refetch).
  onThemeChange(() => { buildPosChips(); renderGrid(); });

  const linkedPlayer = Number(params.get("player"));
  if (linkedPlayer) openPlayerModal(linkedPlayer, _activeFilters.season);
}

// Per-position fetch limits — top N per position chip click
const POS_LIMITS = {
  QB: 100, RB: 100, WR: 100, TE: 100, OL: 100,
  EDGE: 100, DL: 100, LB: 100, CB: 100, S: 100, DB: 100, K: 60, P: 60,
};

// Loads the board for the active season / position / conference into
// _allPlayers, then hands off to applyClientFilters() for text and min-OVR.
//
// Always fetches per position group and merges, so one deep position cannot
// crowd another out of the top N: "ALL" is every group in POS_LIMITS, and a
// grouped filter (DB = CB ∪ S ∪ DB, per CONFIG.POSITION_FILTER_GROUPS) is each
// of its members. fetchPlayers() itself matches one exact group — routing the
// DB chip straight to it showed only the bare-"DB" rows and dropped every
// corner and safety, unlike every other position filter on the site.
async function fetchAndRender() {
  // One fetch at a time, but a filter change that arrives mid-fetch is queued
  // rather than dropped — dropping it left the board showing the old filter
  // under a chip that said otherwise.
  if (_fetchPending) { _refetchQueued = true; return; }
  _fetchPending = true;
  const grid = document.getElementById("player-grid");
  const { position, conference, season } = _activeFilters;
  grid.innerHTML = '<p class="empty-state">Loading…</p>';
  // Prime the caches the row renderer reads synchronously — the PROJ and EDGE
  // columns would otherwise render dashes on first paint.
  await Promise.all([loadTrajectory(), buildEdgePercentiles(season)]);
  try {
    const positions = (position && position !== "ALL")
      ? (CONFIG.POSITION_FILTER_GROUPS[position] || [position])
      : Object.keys(POS_LIMITS);
    const batches = await Promise.all(
      positions.map(pos => fetchPlayers({ season, position: pos, conference, limit: POS_LIMITS[pos] || 150 }).catch(() => []))
    );
    // Merge and dedupe by player_season_id
    const seen = new Set();
    _allPlayers = [];
    for (const batch of batches) {
      for (const p of batch) {
        const key = p.player_season_id || p.id;
        if (!seen.has(key)) { seen.add(key); _allPlayers.push(p); }
      }
    }
    _allPlayers.sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));
  } catch (e) {
    grid.innerHTML = errorState(`Failed to load: ${e.message}`);
    _fetchPending = false;
    return;
  }
  _fetchPending = false;
  if (_refetchQueued) { _refetchQueued = false; return fetchAndRender(); }
  applyClientFilters();
}

// (Re)builds both chip rows from the current filter state. Called on init and on
// every theme switch, because chip colors come from the active theme's palette.
// It replaces the rows rather than appending — appending doubled the chips on
// each theme switch and reset the highlight to ALL while the WR filter stayed on.
function buildPosChips() {
  const paintActive = (btn, pg) => {
    btn.classList.add("active");
    if (pg !== "ALL") {
      const color = posColor(pg);
      btn.style.background = color;
      btn.style.color = ratingTextColor(color);
    }
  };
  const makeChip = (pg) => {
    const btn = document.createElement("button");
    btn.className = "pos-chip";
    btn.dataset.pos = pg;
    btn.textContent = pg;
    if (pg !== "ALL") {
      const color = posColor(pg);
      btn.style.setProperty("--chip-color", color);
      btn.style.borderColor = color + "44";
    }
    if (pg === _activeFilters.position) paintActive(btn, pg);
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pos-chip").forEach(b => {
        b.classList.remove("active");
        b.style.background = "";
        b.style.color = "";
      });
      paintActive(btn, pg);
      _activeFilters.position = pg;
      fetchAndRender();
    });
    return btn;
  };
  const offRow = document.getElementById("pos-chips-offense");
  const defRow = document.getElementById("pos-chips-defense");
  if (offRow) offRow.replaceChildren(...OFF_POS.map(makeChip));
  if (defRow) defRow.replaceChildren(...DEF_POS.map(makeChip));
}

// EDGE percentile within position group, computed once per season from the full
// season roster. Raw edge_score is position-specific by construction — QBs
// accumulate ~1,600 and linebackers ~65 — so showing raw values side by side in
// one column invites a comparison that isn't valid. Percentile is.
let _edgePctBySeason = {};

// {player_season_id: EDGE percentile within his position group} for one
// season, computed once from the full season file and cached. Percentile =
// rank among the group's EDGE scores (first index ≥ his, by binary search)
// over n − 1, so the lowest is 0 and the highest 100; a group of one is 50.
async function buildEdgePercentiles(season) {
  if (_edgePctBySeason[season]) return _edgePctBySeason[season];
  const players = await fetchAllPlayers(season).catch(() => []);
  const byPos = {};
  for (const p of players) {
    if (p.edge_score == null) continue;
    (byPos[p.position_group] ||= []).push(p.edge_score);
  }
  for (const pos in byPos) byPos[pos].sort((a, b) => a - b);

  const map = {};
  for (const p of players) {
    if (p.edge_score == null) continue;
    const arr = byPos[p.position_group];
    let lo = 0, hi = arr.length;
    while (lo < hi) {                       // first index >= edge_score
      const mid = (lo + hi) >> 1;
      if (arr[mid] < p.edge_score) lo = mid + 1; else hi = mid;
    }
    map[p.player_season_id] = arr.length > 1
      ? Math.round((lo / (arr.length - 1)) * 100)
      : 50;
  }
  _edgePctBySeason[season] = map;
  return map;
}

// Conferences are derived from the season being viewed, not from a fixed list.
// Realignment makes a static list wrong for most of the archive: the Pac-12 has
// 2 members in 2025 and 12 in 2013, and the Big East, WAC, and independents all
// come and go. Reading the season's own players is the only accurate source.
async function populateConferenceOptions(season = _activeFilters.season) {
  const confSelect = document.getElementById("filter-conference");
  if (!confSelect) return;

  const players = await fetchAllPlayers(season).catch(() => []);
  const confs = [...new Set(players.map(p => p.conference).filter(Boolean))].sort();
  const previous = _activeFilters.conference;

  confSelect.innerHTML = `<option value="">All Conferences</option>` +
    confs.map(c => `<option value="${c}">${c}</option>`).join("");

  // Keep the current filter if that conference still existed this season,
  // otherwise fall back to All rather than silently showing nothing.
  if (previous && confs.includes(previous)) {
    confSelect.value = previous;
  } else if (previous) {
    _activeFilters.conference = "";
  }
}

// ---------------------------------------------------------------------------
// Filtering — server handles position+conference+season, client handles text+minRating
// ---------------------------------------------------------------------------

// Apply the text search (name or team, case-insensitive) and the min-OVR
// slider to the fetched board, re-render, and update the "N shown" count.
// No fetch — these two filters run on rows already in memory.
function applyClientFilters() {
  const { minRating, query, position } = _activeFilters;
  const q = query.toLowerCase();
  _filteredPlayers = _allPlayers.filter(p => {
    if (minRating && (p.overall_rating || 0) < minRating) return false;
    if (q && !p.name?.toLowerCase().includes(q) && !p.team?.toLowerCase().includes(q)) return false;
    return true;
  });
  renderGrid();
  const rc = document.getElementById("result-count");
  if (rc) rc.textContent = `${_filteredPlayers.length} shown`;
}

// Wire the board's controls: conference and season refetch (season also
// rebuilds the conference list, since membership changes by season, and
// the projected-season notice); the min-OVR slider and the search box
// (debounced 200 ms) filter client-side.
function bindFilterEvents() {
  document.getElementById("filter-conference")?.addEventListener("change", e => {
    _activeFilters.conference = e.target.value;
    fetchAndRender();
  });
  document.getElementById("filter-min-rating")?.addEventListener("input", e => {
    _activeFilters.minRating = parseInt(e.target.value) || 0;
    const lbl = document.getElementById("min-rating-label");
    if (lbl) lbl.textContent = e.target.value || "0";
    applyClientFilters();
  });
  let debounceTimer;
  document.getElementById("search-input")?.addEventListener("input", e => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { _activeFilters.query = e.target.value; applyClientFilters(); }, 200);
  });
  document.getElementById("filter-season")?.addEventListener("change", async e => {
    _activeFilters.season = parseInt(e.target.value);
    renderSeasonProvenance(_activeFilters.season);
    // Conference membership is season-specific, so rebuild the list before rendering.
    await populateConferenceOptions(_activeFilters.season);
    fetchAndRender();
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

// Render the filtered board as .draft-row divs with a sortable header. The
// last two columns change meaning on a projected season (projection range + source code
// instead of projected change + EDGE percentile); the column COUNT stays 11
// so the responsive CSS can keep hiding cells by position. A row click opens
// the modal, except on the team link inside it.
function renderGrid() {
  const grid = document.getElementById("player-grid");
  // Filter out unknown/blank players
  const valid = _filteredPlayers.filter(p => p.name && p.name !== "Unknown" && p.name !== "—" && p.team);
  if (!valid.length) {
    grid.innerHTML = '<p class="empty-state">No players match your filters.</p>';
    return;
  }
  // Last two columns change meaning on a projected season — see projectionRangeCell /
  // gridSourceCell. Column count stays at 11 so the responsive collapse holds.
  const proj = isProjectedSeason(_activeFilters.season);
  const trio = valid.some(hasTrio);
  // A season with earned-to-date ratings: the last three columns are the three
  // ratings (last season earned · projection · to date), same 11-column count.
  const tail = trio ? `
    <span style="text-align:center" title="Earned last season — a full season">${_activeFilters.season - 1}</span>
    <span style="text-align:center" title="Preseason projection, made before a game was played">PROJ</span>
    <span style="text-align:center" title="Earned so far this season, rescaled to full-season pace. Provisional.">LIVE</span>` : `
    <span style="text-align:center">${proj ? "PROJ" : "OVR"}</span>
    <span style="text-align:center" title="${proj
      ? "The model's 80% interval around the projection — where the rating should land four times out of five"
      : "Engine D projected change in OVR next season"}">${proj ? "Range" : "Proj"}</span>
    <span style="text-align:center" title="${proj
      ? "How this projection was built"
      : "EDGE percentile within position group — raw EDGE is not comparable across positions"}">${proj ? "From" : "EDGE %"}</span>`;
  grid.innerHTML = `<div class="draft-board-header${trio ? " trio" : ""} animate-pop">
    <span>#</span><span>POS</span><span>Player</span>
    <span>Team</span><span>Yr / Conf</span><span>Stars</span>
    <span style="text-align:center">Ht</span><span style="text-align:center">Wt</span>${tail}
  </div><div class="stagger-children" id="player-grid-rows">` + valid.map((p, i) => playerRowHtml(p, i)).join("") + `</div>`;

  // Sortable column headers
  makeGridSortable(
    grid.querySelector(".draft-board-header"),
    grid.querySelector("#player-grid-rows")
  );

  // Row opens the player modal — except when the click landed on an entity link
  // (the team cell), which should navigate to that team instead.
  grid.querySelectorAll(".draft-row").forEach(row => {
    row.addEventListener("click", ev => {
      if (ev.target.closest("a.entity-link")) return;
      openPlayerModal(parseInt(row.dataset.id), parseInt(row.dataset.season));
    });
  });
  makeActivatable(grid.querySelectorAll(".draft-row"));
}

// One board row: rank, position badge, name (🔥 for breakout probability
// ≥ 35%), team link, class year · conference, stars, height, weight, OVR pill
// (provenance derived from the season), then either projected change and
// EDGE percentile (played season) or projection range and source code (projected).
function playerRowHtml(p, rank) {
  const trio    = hasTrio(p);
  const lead    = trio ? (p.live_rating ?? p.overall_rating ?? p.rating_prev) : p.overall_rating;
  const ovr     = lead ? Math.round(lead) : null;
  const tc      = trio ? ratingTrioCells(p, p.season) : null;
  // Rows are flat surface — the tier-colored left border + OVR pill carry the
  // rating identity. (Full-row color washes were the old "murk".)
  const ovrColor = ovr ? ratingColor(ovr) : "var(--text-muted)";
  const pg       = p.position_group || p.position || "ATH";
  const posClr   = posColor(pg);
  const rankCls  = rank < 3 ? "top3" : rank < 10 ? "top10" : "";
  const edgePct  = _edgePctBySeason[p.season]?.[p.player_season_id];
  const oap      = edgePct != null
    ? `<span title="EDGE ${p.edge_score.toFixed(1)} — ${edgePct}th percentile among ${p.position_group}s in ${p.season}">${edgePct}</span>`
    : "—";
  const breakout = p.breakout_prob >= 0.35 ? ' 🔥' : "";
  const yr       = classYearCell(p.class_year, p.class_year_basis);
  const starsStr = p.stars ? "★".repeat(p.stars) + "☆".repeat(5 - p.stars) : "—";
  const ht       = p.height_in ? `${Math.floor(p.height_in/12)}'${p.height_in%12}"` : "—";
  const wt       = p.weight_lbs ? `${p.weight_lbs}` : "—";

  return `
    <div class="draft-row${trio ? " trio" : ""} animate-up" data-id="${p.id}" data-season="${p.season || ''}" data-rating="${p.overall_rating || 0}"
         style="border-left-color:${ovrColor}">
      <div class="draft-rank rank-num ${rankCls}">${rank + 1}</div>
      <div class="draft-pos">${posBadge(pg)}</div>
      <div class="draft-name" title="${_esc(p.hometown_state ? p.name + ' · ' + p.hometown_state : p.name)}">
        <span class="player-name-text">${_esc(p.name)}${breakout}</span>
      </div>
      <div class="draft-team">${teamLink(p.team, { season: p.season })}</div>
      <div class="draft-yr-conf">${yr} · ${_esc(p.conference || "—")}</div>
      <div class="draft-stars">${starsStr}</div>
      <div class="draft-ht">${ht}</div>
      <div class="draft-wt">${wt}</div>
      ${trio ? `<div class="draft-ovr">${tc[0]}</div><div class="draft-traj">${tc[1]}</div><div class="draft-edge">${tc[2]}</div>` : `
      <div class="draft-ovr">${ovrPill(p.overall_rating, { label: `Overall rating, ${p.season}`, season: p.season, source: p.projection_source })}</div>
      <div class="draft-traj">${isProjectedSeason(p.season) ? projectionRangeCell(p) : projHtml(p.player_season_id)}</div>
      <div class="draft-edge">${isProjectedSeason(p.season) ? gridSourceCell(p) : oap}</div>`}
    </div>`;
}

const _GRID_SOURCE_CODES = {
  engine_d:   ["CV", "Career curve — projected from his own production history"],
  carry:      ["CF", "Carried forward — last season's rating along his cohort's development curve"],
  recruiting: ["RC", "Recruiting grade — no college production yet"],
};

// Where a projected number came from, as a two-letter code (CV career curve,
// CF carried forward, RC recruiting) with the full reason on hover.
// Low-confidence projections are dimmed.
function gridSourceCell(p) {
  const s = _GRID_SOURCE_CODES[p.projection_source];
  if (!s) return '<span class="text-muted">—</span>';
  const dim = p.projection_confidence === "low" ? "opacity:0.65" : "";
  return `<span class="proj-source-code" style="${dim}" title="${_esc(s[1])}">${s[0]}</span>`;
}

// Projected next-season movement for the grid's PROJ column.
// Reads the Engine D cache, which initGrid() primes before the first render.
// The old column used ratings.trajectory, which script 07 never populates — it
// is 0.0 for every player, so the column rendered a flat arrow 8,437 times.
function projHtml(playerSeasonId) {
  const pred = _trajectoryCache?.[String(playerSeasonId)];
  if (!pred || pred.delta == null) return '<span class="traj-flat">—</span>';
  const d = pred.delta;
  const sign = d > 0 ? "+" : "";
  if (d >= 5)  return `<span class="traj-up2">▲ ${sign}${d.toFixed(1)}</span>`;
  if (d >= 1)  return `<span class="traj-up1">▲ ${sign}${d.toFixed(1)}</span>`;
  if (d <= -5) return `<span class="traj-down2">▼ ${d.toFixed(1)}</span>`;
  if (d <= -1) return `<span class="traj-down1">▼ ${d.toFixed(1)}</span>`;
  return '<span class="traj-flat">→</span>';
}

// ---------------------------------------------------------------------------
// Player detail modal
// ---------------------------------------------------------------------------

// Open the player modal for (playerId, season) on any page that hosts
// #player-modal. Shows a loading shell at once, then fetches profile, stats,
// rating history, career stats, comps, transfers, projections, EDGE
// percentiles in parallel and renders modalContentHtml.
//
// `season` falls back to the page's active season (Players or Ratings),
// then CURRENT_SEASON. A player absent from that season is found by scanning
// the other seasons newest-first (fetchPlayerProfile). The projection's
// reasoning (a ~5.5 MB file) is fetched only after the modal is on screen.
async function openPlayerModal(playerId, seasonOverride) {
  const season = seasonOverride
    || (typeof _activeFilters !== "undefined" ? _activeFilters.season : null)
    || (typeof _ratingSeason  !== "undefined" ? _ratingSeason          : null)
    || CONFIG.CURRENT_SEASON;

  const modal = document.getElementById("player-modal");
  if (!modal) return;

  // Show a loading shell immediately — we'll fetch the full profile
  modal.querySelector(".modal-inner").innerHTML = `
    <div class="modal-header">
      <h2 style="color:var(--text-muted)">Loading…</h2>
      <button class="modal-close" aria-label="Close player details">✕</button>
    </div>
    <div class="modal-loading">Fetching player data…</div>`;
  // Remember what had focus so closing returns the keyboard user to it. Not
  // overwritten when a similar-player click re-opens an already-open modal.
  if (!modal.classList.contains("open")) modal._returnFocus = document.activeElement;
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
  bindModalClose(modal);

  // Fetch profile + stats + history + similar + transfers + trajectory in parallel.
  // buildEdgePercentiles primes the EDGE-context cache so the modal can place
  // the player's EDGE on its position distribution.
  const [player, statsRows, ratingHistory, careerStats, similarMap, transfersMap,
         trajectoryMap, _edgePct] = await Promise.all([
    fetchPlayerProfile(playerId, season).catch(() => null),
    fetchPlayerStats(playerId, season).catch(() => []),
    fetchPlayerRatingHistory(playerId).catch(() => []),
    fetchPlayerCareerStats(playerId).catch(() => []),
    loadSimilarPlayers(season).catch(() => ({})),
    loadPlayerTransfers().catch(() => ({})),
    loadTrajectory().catch(() => ({})),
    buildEdgePercentiles(season).catch(() => ({})),
  ]);

  if (!player) {
    modal.querySelector(".modal-inner").innerHTML = `
      <div class="modal-header"><h2>Player not found</h2><button class="modal-close" aria-label="Close player details">✕</button></div>
      <div class="modal-loading">No rating data for this player in ${season}.</div>`;
    bindModalClose(modal);
    return;
  }

  const regularRow    = statsRows.find(r => r.stat_type === "season_aggregate");
  const postseasonRow = statsRows.find(r => r.stat_type === "postseason_aggregate");
  const statsData     = regularRow ? regularRow.data : null;
  const postseasonData = postseasonRow ? postseasonRow.data : null;
  // Look up similar players by player_season_id (the key in similar_players_{season}.json)
  const psId = player.player_season_id;
  const similarPlayers = psId && similarMap ? (similarMap[String(psId)] || []) : [];
  // Look up transfer history by player id (field is "id" in players JSON)
  const transferHistory = player.id && transfersMap
    ? (transfersMap[String(player.id)] || []) : [];
  // Look up Engine D trajectory prediction by player_season_id
  const trajectory = trajectoryFor(psId, player.id);

  modal.querySelector(".modal-inner").innerHTML = modalContentHtml(player, statsData, ratingHistory, careerStats, season, postseasonData, similarPlayers, transferHistory, trajectory);
  bindModalClose(modal);

  // The reasoning lives in a 5.5 MB detail file that only this view needs, so
  // it is fetched after the modal is already on screen rather than blocking it.
  // Keyed by the projection's OWN player_season_id, not the modal's.
  // Gated the same way the section is — otherwise this fetches 6 MB of prose to
  // fill a container that was never rendered.
  if (trajectory && Number(season) === Number(_trajectoryMeta.predicts_season ?? CONFIG.CURRENT_SEASON)) {
    renderProjectionReasoning(trajectory.player_season_id);
  }
}

// Why the model landed where it did: prose, signed driver bars, and the
// historical players whose careers looked like this one at the same stage.
async function renderProjectionReasoning(playerSeasonId) {
  const host = document.getElementById("proj-reasoning");
  if (!host) return;
  let d = null;
  try {
    d = await fetchTrajectoryDetail(playerSeasonId);
  } catch (_) { /* fall through to the empty state below */ }
  if (!host.isConnected) return;          // modal closed while fetching
  if (!d) { host.innerHTML = ""; return; }

  // Bars are scaled to the largest absolute effect so the comparison is visual,
  // not just numeric.
  const max = Math.max(...(d.drivers || []).map(x => Math.abs(x.effect)), 0.1);
  const drivers = (d.drivers || []).map(x => {
    const pct = Math.min(100, Math.abs(x.effect) / max * 100);
    const pos = x.effect >= 0;
    return `
      <div class="driver-row">
        <span class="driver-label">${_esc(x.label)}</span>
        <span class="driver-track">
          <span class="driver-fill ${pos ? "pos" : "neg"}"
                style="${pos ? "left:50%" : `right:50%`};width:${(pct / 2).toFixed(1)}%"></span>
        </span>
        <span class="driver-value" style="color:${pos ? "var(--positive)" : "var(--negative)"}">
          ${pos ? "+" : ""}${x.effect.toFixed(1)}
        </span>
      </div>`;
  }).join("");

  const comps = (d.comparables || []).map(c => `
    <div class="comparable-row">
      ${playerLink(c.player_id, c.name, { season: c.season })}
      <span class="text-muted">${_esc(String(c.season))} · ${c.ovr}</span>
      <span class="comparable-outcome" style="color:${c.actual_delta >= 0 ? "var(--positive)" : "var(--negative)"}">
        ${c.actual_delta >= 0 ? "+" : ""}${c.actual_delta} the next year
      </span>
    </div>`).join("");

  host.innerHTML = `
    ${d.explanation ? `<p class="proj-explanation">${_esc(d.explanation)}</p>` : ""}
    ${drivers ? `<div class="proj-drivers">
        <div class="modal-subsection-title">What moved the number</div>${drivers}
      </div>` : ""}
    ${comps ? `<div class="proj-comparables">
        <div class="modal-subsection-title">Careers that looked like his</div>${comps}
      </div>` : ""}`;
}

// The full modal body for one player-season, as HTML. Sections, in order:
// header (name, class year, team, rating-basis chip, OVR box), bio strip,
// season stats (regular / postseason / total; a "not played yet" note on a
// projected season), EDGE with its percentile strip, career stats, rating
// history chart, "Why this rating?" (played seasons only), DB archetypes,
// projection with range and reasoning host (only on the season the
// projection is FOR), career path, similar players.
// Any section without data is omitted rather than rendered empty.
function modalContentHtml(player, statsData, ratingHistory = [], careerStats = [], season, postseasonData = null, similarPlayers = [], transferHistory = [], trajectory = null) {
  const stats = statsData || {};
  const trio  = hasTrio(player);
  const ovr   = player.overall_rating ? Math.round(player.overall_rating) : null;
  const color = ovr ? ratingColor(ovr) : "var(--surface-lift)";
  const txtCol = ovr ? ratingTextColor(ovr) : "var(--text)";
  const pg    = player.position_group || "QB";
  const [pgBg, pgColor] = posGroupColor(pg);
  const initials  = (player.name || "?").split(" ").map(n => n[0]).slice(0, 2).join("");

  // ── Rating header ──
  const headerHtml = `
    <div class="modal-header">
      <div class="player-initials-avatar modal-avatar" style="background:${pgBg};border-color:${pgColor}40;color:${pgColor};width:52px;height:52px;font-size:18px;flex-shrink:0">${initials}</div>
      <div class="modal-title">
        <h2>${player.name || "Unknown"}</h2>
        <div class="modal-sub" style="color:${pgColor}">${pg} · ${classYearCell(player.class_year, player.class_year_basis)} · ${player.team || "—"}</div>
        <div class="modal-sub" style="color:var(--text-muted)">${player.conference || ""}</div>
        ${basisChip(player.rating_basis)}
      </div>
      ${trio ? "" : `<div class="modal-ovr-box${isProjectedSeason(player.season) ? " is-projected" : ""}"
           style="background:${color};color:${txtCol}"
           title="${isProjectedSeason(player.season)
             ? _esc(`Projected ${player.season} rating — ${PROJECTION_SOURCE_LABELS[player.projection_source] || "model output"}`)
             : `Earned rating, ${player.season}`}">
        <span class="modal-ovr-num">${ovr || "—"}</span>
        <span class="modal-ovr-lbl">${isProjectedSeason(player.season) ? "PROJ OVR" : "OVR"}</span>
      </div>`}
      <button class="modal-close" aria-label="Close player details">✕</button>
    </div>`;

  // ── Quick bio strip ──
  const heightStr = player.height_in ? `${Math.floor(player.height_in/12)}'${player.height_in%12}"` : "—";
  const bioHtml = `
    <div class="modal-bio-strip">
      <span>${starsHtml(player.stars)} <span style="color:var(--text-muted)">${player.composite_score ? player.composite_score.toFixed(4) : "N/A"}</span></span>
      <span class="bio-sep">·</span>
      <span title="Height">${heightStr}</span>
      <span class="bio-sep">·</span>
      <span title="Weight">${player.weight_lbs ? player.weight_lbs + " lbs" : "—"}</span>
      <span class="bio-sep">·</span>
      <span title="Hometown">${player.hometown_state || "—"}</span>
      ${player.breakout_prob >= 0.35 ? `<span class="bio-sep">·</span><span title="Breakout candidate">🔥 Breakout ${(player.breakout_prob * 100).toFixed(0)}%</span>` : ""}
    </div>`;

  // ── Season stats ──
  const postData  = postseasonData || null;
  const hasPost = postData && Object.keys(postData).length > 0;
  const totalData = hasPost ? mergeStatTotals(stats, postData, pg) : null;
  // A season that hasn't been played has no stats — a grid of em-dashes reads
  // as missing data rather than as a season that hasn't happened yet.
  const statSectionHtml = isProjectedSeason(season) && !trio ? `
    <div class="modal-section">
      <div class="modal-section-title">${_esc(String(season))} Stats</div>
      <p class="breakdown-note">No games played yet. Career production through
        ${CONFIG.LAST_PLAYED_SEASON} is below, and it is what the projection is built from.</p>
    </div>` : `
    <div class="modal-section">
      <div class="modal-section-title">Season Stats (${season || CONFIG.CURRENT_SEASON}${trio ? ` · through week ${player.live_through_week}` : ""})</div>
      ${hasPost ? '<div class="stats-sub-label">Regular Season</div>' : ""}
      <div class="stats-grid">${renderStatBlocks(stats, pg)}</div>
      ${hasPost ? `
        <div class="stats-sub-label" style="margin-top:10px">Postseason</div>
        <div class="stats-grid">${renderStatBlocks(postData, pg)}</div>
        <div class="stats-sub-label" style="margin-top:10px">Total</div>
        <div class="stats-grid">${renderStatBlocks(totalData, pg)}</div>
      ` : ""}
    </div>`;

  // ── EDGE score panel (EDGE-rated positions only) ──
  let edgeHtml = "";
  if (EDGE_POS.includes(pg) && player.edge_score != null) {
    const edgeVal = player.edge_score.toFixed(2);
    const gp      = player.games_played != null ? player.games_played : "—";
    const sm      = player.stats_measured != null ? player.stats_measured : "—";
    // Place the raw EDGE on its position distribution — raw EDGE alone is not
    // comparable across positions, the percentile is.
    const edgePct = _edgePctBySeason[player.season]?.[player.player_season_id];
    const stripHtml = edgePct != null
      ? `<div style="margin-top:8px">${contextStrip(edgePct, `${edgePct}th percentile among ${pg}s in ${player.season}`)}</div>`
      : "";
    edgeHtml = `
      <div class="modal-section">
        <div class="modal-section-title">EDGE Score</div>
        <div class="stats-grid">
          <div class="stat-block"><span class="stat-val">${edgeVal}</span><span class="stat-label">EDGE</span></div>
          <div class="stat-block"><span class="stat-val">${gp}</span><span class="stat-label">Games</span></div>
          <div class="stat-block"><span class="stat-val">${sm}</span><span class="stat-label">Stats Measured</span></div>
        </div>
        ${stripHtml}
        <p class="breakdown-note" style="margin-top:6px">Opponent-adjusted production per √games. Higher = more impactful vs stronger competition.</p>
      </div>`;
  }

  // ── Rating breakdown ──
  const shapHtml = renderRatingBreakdown(player, pg);

  // ── Year-over-year ratings chart (inline SVG sparkline) ──
  let yoyHtml = "";
  if (ratingHistory.length >= 2) {
    const W = 340, H = 80, PAD = { l: 28, r: 10, t: 10, b: 22 };
    const vals = ratingHistory.map(r => r.overall_rating || 0);
    const seasons = ratingHistory.map(r => r.season);
    const minV = Math.max(0, Math.min(...vals) - 5);
    const maxV = Math.min(100, Math.max(...vals) + 5);
    const xS = i => PAD.l + (i / (vals.length - 1)) * (W - PAD.l - PAD.r);
    const yS = v => PAD.t + (1 - (v - minV) / (maxV - minV)) * (H - PAD.t - PAD.b);
    const pts = vals.map((v, i) => `${xS(i).toFixed(1)},${yS(v).toFixed(1)}`).join(" ");
    const dots = vals.map((v, i) => {
      const col = ratingColor(v);
      return `<circle cx="${xS(i).toFixed(1)}" cy="${yS(v).toFixed(1)}" r="4" fill="${col}">
        <title>${seasons[i]}: ${Math.round(v)} OVR</title></circle>`;
    }).join("");
    const labels = seasons.map((s, i) =>
      `<text x="${xS(i).toFixed(1)}" y="${H - 3}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${s}</text>`
    ).join("");
    const ratingsLabels = vals.map((v, i) =>
      `<text x="${(xS(i) + 4).toFixed(1)}" y="${(yS(v) - 5).toFixed(1)}" font-size="10" fill="var(--text-muted)">${Math.round(v)}</text>`
    ).join("");
    yoyHtml = `
      <div class="modal-section">
        <div class="modal-section-title">Rating History (Year-over-Year)</div>
        <svg width="${W}" height="${H}" style="display:block;overflow:visible;width:100%;max-width:${W}px">
          <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"/>
          ${dots}${labels}${ratingsLabels}
        </svg>
      </div>`;
  }

  // ── Career stats table ──
  let careerHtml = "";
  if (careerStats.length >= 1) {
    const careerFields = CAREER_FIELDS[pg] || [];
    if (careerFields.length) {
      // Merge regular + postseason rows by season into one row each
      const seasonMap = {};
      for (const cs of careerStats) {
        if (!seasonMap[cs.season]) seasonMap[cs.season] = { season: cs.season, reg: null, post: null, team: cs.team || null };
        if (cs.stat_type === "postseason_aggregate") seasonMap[cs.season].post = cs.data;
        else { seasonMap[cs.season].reg = cs.data; if (cs.team) seasonMap[cs.season].team = cs.team; }
      }
      const mergedSeasons = Object.values(seasonMap).sort((a, b) => a.season - b.season);

      const getStatVal = (d, k) => { const v = d?.[k]; return v !== null && v !== undefined ? v : null; };
      const rows = mergedSeasons.map(({ season: yr, reg, post, team: rowTeam }) => {
        const combined = (reg && post) ? mergeStatTotals(reg, post, pg) : (reg || post || {});
        return `
          <tr>
            <td><strong>${yr}</strong></td>
            <td style="color:var(--text-muted);font-size:var(--fs-sm)">${rowTeam || "—"}</td>
            ${careerFields.map(([k]) => {
              const v = getStatVal(combined, k);
              const disp = v !== null ? (typeof v === "number" ? (Number.isInteger(v) ? v : parseFloat(v).toFixed(1)) : v) : "—";
              return `<td>${disp}</td>`;
            }).join("")}
          </tr>`;
      }).join("");
      careerHtml = `
        <div class="modal-section">
          <div class="modal-section-title">Career Stats</div>
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead><tr><th>Yr</th><th>Team</th>${careerFields.map(([,l]) => `<th>${l}</th>`).join("")}</tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    }
  }

  // Career Path (transfer history) section — only show entries with known schools
  let careerPathHtml = "";
  const knownTransfers = (transferHistory || []).filter(
    t => t.from_school && t.from_school !== "Unknown school" &&
         t.to_school   && t.to_school   !== "Unknown school"
  );
  if (knownTransfers.length >= 1) {
    const stops = [
      `<span class="path-stop">${knownTransfers[0].from_school} '${String(knownTransfers[0].transfer_year).slice(2)}</span>`
    ];
    for (const t of knownTransfers) {
      stops.push(`<span class="path-arrow">&#8594;</span>`);
      stops.push(`<span class="path-stop">${t.to_school} '${String(t.transfer_year).slice(2)}</span>`);
    }
    careerPathHtml = `
      <div class="modal-section">
        <div class="modal-section-title">Career Path</div>
        <div class="career-path">${stops.join("")}</div>
      </div>`;
  }

  // ── Projection: the number, its range, and WHY ──
  // A score with no reasoning is what made the old projections feel arbitrary.
  // The explanation, driver bars and historical comparables are the section;
  // the number is just the headline.
  let trajectoryHtml = "";
  // Only on the season the projection is actually about. Engine D predicts one
  // season ahead of the career it reads, so a record built from 2025 is a 2026
  // number — showing it on the 2025 page put a projection next to an earned
  // rating for a season already played, which reads as a contradiction rather
  // than a forecast. Matching on the predicted season keeps this correct once
  // earlier seasons carry projections of their own.
  const _predicts = Number(_trajectoryMeta.predicts_season ?? CONFIG.CURRENT_SEASON);
  if (trajectory && Number(season) === _predicts) {
    const pred  = trajectory.predicted_ovr;
    const label = trajectory.trajectory_label;
    const forSeason = _trajectoryMeta.predicts_season || CONFIG.CURRENT_SEASON;
    const labelColors = { breakout: "var(--positive)", bounceback: "var(--positive)",
                          decline: "var(--negative)", steady: "var(--text-muted)" };
    const color = labelColors[label] || "var(--text-muted)";
    const vs = trajectory.vs_cohort;
    const vsStr = vs > 0 ? `+${vs.toFixed(1)}` : vs.toFixed(1);
    const mae = _trajectoryMeta.model_mae;

    trajectoryHtml = `
      <div class="modal-section">
        <div class="modal-section-title">${forSeason} Projection ${projBadge()}</div>
        <div class="proj-headline">
          <div class="proj-headline-num">
            <div style="font-size:2rem;font-weight:900;color:${color}">${Math.round(pred)}</div>
            <div class="proj-headline-range">${projRange(trajectory.proj_low, trajectory.proj_high)}</div>
            <div style="font-size:var(--fs-sm);color:var(--text-muted)">projected OVR</div>
          </div>
          <div>
            <div style="font-size:1.1rem;font-weight:700;color:${color};text-transform:capitalize">${_esc(label)}</div>
            <div style="font-size:var(--fs-sm);color:var(--text-muted)">
              ${vsStr} vs a cohort expectation of ${trajectory.cohort_expected}
            </div>
            <div style="margin-top:4px">${confidenceChip(trajectory.confidence)}</div>
          </div>
        </div>
        <div id="proj-reasoning" class="proj-reasoning">
          ${skeletonRows(2)}
        </div>
        <p class="breakdown-note" style="margin-top:8px">
          ${trajectory.family === "offense"
            ? `Projected from his career production curve, his cohort's development curve, and the
               opportunity in front of him — depth-chart position on the ${forSeason} roster and how
               much production is departing ahead of him.`
            : `Projected from his career production curve against what players at the same position
               and class year historically did next. Defensive ratings rest on less complete
               production data than offensive ones, so read this as indicative.`}${mae ? ` Typical error ±${mae} OVR.` : ""}
          Players who leave for the NFL are absent from the history these curves are built on,
          so decline at the very top is somewhat overstated.
        </p>
      </div>`;
  }

  // Similar players section
  let similarHtml = "";
  if (similarPlayers && similarPlayers.length) {
    const rows = similarPlayers.map(s => {
      const pct = Math.round(s.similarity * 100);
      const ovrColor = ratingColor(Math.round(s.ovr || 50));
      return `
        <div class="similar-row" data-player-id="${s.id}" data-season="${s.season ?? ""}" style="cursor:pointer">
          <div class="similar-info">
            <span class="similar-name">${s.name}</span>
            <span class="similar-meta">${s.team || "—"} · ${s.season}</span>
          </div>
          <div class="similar-match-bar">
            <div class="similar-match-fill" style="width:${pct}%"></div>
          </div>
          <span class="similar-pct">${pct}%</span>
          <span class="similar-ovr" style="color:${ovrColor}">${Math.round(s.ovr || 0)}</span>
        </div>`;
    }).join("");
    similarHtml = `
      <div class="modal-section">
        <div class="modal-section-title">Similar Players (Cross-Era)</div>
        <p style="font-size:var(--fs-sm);color:var(--text-muted);margin-bottom:0.5rem">Players from any season with the most similar production profile at this position.</p>
        <div class="similar-list">${rows}</div>
      </div>`;
  }

  // On a season that has not been played there is no earned rating to explain,
  // so "Why this rating?" is replaced by the projection's own reasoning.
  // Keeping the breakdown would narrate model output as
  // though it were production.
  const isProj = isProjectedSeason(season ?? player.season);
  const archHtml = renderArchetypes(player, pg);

  return `
    ${headerHtml}
    ${trio ? ratingTrioStrip(player, player.season) : ""}
    <div class="modal-body">
      ${bioHtml}
      ${statSectionHtml}
      ${edgeHtml}
      ${careerHtml}
      ${yoyHtml}
      ${isProj ? "" : shapHtml}
      ${archHtml}
      ${trajectoryHtml}
      ${careerPathHtml}
      ${similarHtml}
    </div>`;
}

// ---------------------------------------------------------------------------
// Defensive-back archetypes — the three jobs behind one label
// ---------------------------------------------------------------------------
// A DB's overall IS the weighted sum of these, so showing them is not a garnish:
// it is the rating, itemised. Weights mirror SECONDARY_ARCHETYPE_WEIGHTS in
// script 06.
const ARCHETYPE_META = {
  ball_hawk:   { label: "Ball hawk",   blurb: "Interceptions, pass breakups and returns — what he does when the ball arrives." },
  coverage:    { label: "Lockdown",    blurb: "Full-time snaps on a defense that gave up little through the air. Built from playing time and what his defense allowed, not from his own box score — the whole point is that a covered receiver produces no statistic." },
  run_support: { label: "Run support", blurb: "Tackles, tackles for loss and sacks — the part of the job that happens in front of him." },
};

const ARCHETYPE_WEIGHTS = {
  CB: { coverage: 0.40, ball_hawk: 0.40, run_support: 0.20 },
  S:  { run_support: 0.50, ball_hawk: 0.30, coverage: 0.20 },
  DB: { run_support: 1 / 3, ball_hawk: 1 / 3, coverage: 1 / 3 },
};

// "What kind of defensive back": the three archetype scores (0–10) that a
// CB/S/DB overall is built from, each with its position weight, sorted
// largest first and led by a sentence naming the top one. "" for anyone else.
function renderArchetypes(player, pg) {
  const a = player.archetypes;
  if (!a || typeof a !== "object") return "";
  const weights = ARCHETYPE_WEIGHTS[pg];
  if (!weights) return "";

  const order = Object.keys(weights).sort((x, y) => (a[y] ?? 0) - (a[x] ?? 0));
  const top = order[0];
  const rows = order.map(k => {
    const v = Number(a[k] ?? 0);
    const meta = ARCHETYPE_META[k] || { label: k, blurb: "" };
    const pct = Math.max(0, Math.min(100, v * 10));
    const col = ratingColor(Math.round(30 + v * 6.5));
    return `
      <div class="attr-bar" title="${_esc(meta.blurb)}">
        <span class="attr-bar-label">${meta.label}
          <span class="arch-weight">${Math.round(weights[k] * 100)}%</span></span>
        <span class="attr-bar-track"><span class="attr-bar-fill"
          style="width:${pct.toFixed(0)}%;background:${col}"></span></span>
        <span class="attr-bar-val">${v.toFixed(1)}</span>
      </div>`;
  }).join("");

  const name = player.name?.split(" ")[0] || "He";
  return `
    <div class="modal-section">
      <div class="modal-section-title">What kind of defensive back</div>
      <p class="breakdown-summary">${name} grades out as a
        <strong>${(ARCHETYPE_META[top] || {}).label || top}</strong>.
        His overall is these three scored out of 10 and weighted by what a
        ${_esc(pg)} is paid to do.</p>
      <div class="attr-bars">${rows}</div>
      <p class="breakdown-note">Lockdown carries no box-score input at all — quarterbacks
        avoid the players who earn it, so it is built from playing time and what his defense
        allowed per pass thrown.</p>
    </div>`;
}

// ---------------------------------------------------------------------------
// Rating breakdown — plain-English explanation of what drives the rating
// ---------------------------------------------------------------------------

// "Why this rating?": the tier sentence, recruiting line, coverage-denial
// share (when > 2% of a DB's score came from what his defence allowed), last
// season's movement, breakout flag, and up to six SHAP factor bars as a share
// of total absolute influence. With no SHAP values it says the rating is
// recruiting-anchored rather than drawing empty bars.
function renderRatingBreakdown(player, pg) {
  const shap = player.shap && typeof player.shap === "object" ? player.shap : null;
  const ovr  = player.overall_rating ? Math.round(player.overall_rating) : null;
  const tier = ovr ? getRatingTier(ovr) : null;

  // Tier context sentence
  const tierSentence = tier && ovr
    ? `<p class="breakdown-summary">${player.name?.split(" ")[0]} is rated <strong style="color:${tier.color}">${ovr} (${tier.label})</strong> among ${pg}s in ${player.season || CONFIG.CURRENT_SEASON}.</p>`
    : "";

  // Recruiting context
  const recLine = player.stars
    ? `<div class="breakdown-line"><span class="breakdown-icon">${player.stars >= 4 ? "⭐" : "📋"}</span><span>Recruited as a <strong>${player.stars}-star</strong> prospect${player.composite_score ? ` (composite ${player.composite_score.toFixed(4)})` : ""}</span></div>`
    : `<div class="breakdown-line"><span class="breakdown-icon">📋</span><span>No recruiting data on record</span></div>`;

  // There is no "rating up N from last season" line: it read `trajectory`, which
  // the export carries as 0.0 for every played season, so it never rendered.
  // The rating-history chart above is where movement is shown.

  // Breakout line
  const breakoutLine = player.breakout_prob >= 0.35
    ? `<div class="breakdown-line"><span class="breakdown-icon">🔥</span><span><strong>Breakout candidate</strong> — young player with high recruiting pedigree below current production median (${(player.breakout_prob * 100).toFixed(0)}% probability)</span></div>`
    : "";

  // Coverage denial — a defensive back's best games leave no stat line, because
  // quarterbacks stop throwing at him. Part of his score is therefore credited
  // from what his defense allowed through the air rather than from his own
  // counting stats, and a rating that moves for an invisible reason has to say so.
  const covShare = shap && typeof shap.coverage_share === "number" ? shap.coverage_share : 0;
  const coverageLine = covShare > 0.02
    ? `<div class="breakdown-line"><span class="breakdown-icon">🛡️</span><span><strong>${Math.round(covShare * 100)}% of this rating is coverage denial</strong> — quarterbacks threw elsewhere, so his tackles and breakups understate him. That share comes from how few passing yards his defense gave up, weighted by how much of the secondary's workload he carried.</span></div>`
    : "";

  // SHAP factor bars — normalized to % of total absolute influence
  let factorsHtml = "";
  if (shap) {
    const entries = Object.entries(shap)
      // coverage_share is a fraction, not a model input on the same scale as the
      // rest; it gets its own sentence above instead of a misleading bar.
      .filter(([k]) => k !== "coverage_share")
      .filter(([, v]) => Math.abs(v) > 0.001)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 6);

    if (entries.length) {
      const totalAbs = entries.reduce((s, [, v]) => s + Math.abs(v), 0) || 1;
      const bars = entries.map(([feat, val]) => {
        const label     = (CONFIG.SKILL_ATTRS[pg] || []).find(([k]) => k === feat)?.[1] || feat.replace(/_/g, " ");
        const pct       = Math.round(Math.abs(val) / totalAbs * 100);
        const positive  = val > 0;
        const barColor  = positive ? "var(--positive)" : "var(--negative)";
        const arrow     = positive ? "▲" : "▼";
        const effect    = positive ? "boosted" : "reduced";
        return `
          <div class="shap-row" title="${label} ${effect} this rating by ${pct}% of total model influence">
            <span class="shap-label">${label}</span>
            <div class="shap-bar-wrap">
              <div class="shap-bar" style="width:${pct}%;background:${barColor}"></div>
            </div>
            <span class="shap-val" style="color:${barColor}">${arrow} ${pct}%</span>
          </div>`;
      }).join("");
      factorsHtml = `
        <div class="breakdown-factors">
          <div class="breakdown-factors-title">Model factors (% of rating influence)</div>
          <div class="shap-bars">${bars}</div>
          <p class="breakdown-note">Bars show each stat's share of the model's total influence on this rating. ▲ = raised the score, ▼ = lowered it.</p>
        </div>`;
    }
  }

  // If no SHAP, explain the fallback
  const fallbackNote = !shap || !Object.keys(shap).length
    ? `<div class="breakdown-line"><span class="breakdown-icon">ℹ️</span><span>This rating uses a recruiting-anchored estimate — not enough game stats to run the full model for this player.</span></div>`
    : "";

  return `
    <div class="modal-section">
      <div class="modal-section-title">Why this rating?</div>
      ${tierSentence}
      <div class="breakdown-lines">
        ${recLine}
        ${coverageLine}
        ${breakoutLine}
        ${fallbackNote}
      </div>
      ${factorsHtml}
    </div>`;
}

// Regular season + postseason → combined totals for the modal's "Total" row.
// Counting stats are summed; YPA, YPC, YPR and yards per punt are recomputed
// from the summed parts rather than averaged; FG long is the max of the two.
function mergeStatTotals(reg, post, pg) {
  // Additive keys — summed directly
  const addKeys = [
    "passingYDS","passingTD","passingINT","passingCOMPLETIONS","passingATT",
    "rushingYDS","rushingTD","rushingCAR",
    "receivingYDS","receivingTD","receivingREC",
    "defensiveTOT","defensiveSACKS","defensiveTFL","defensiveQB HUR","defensivePD",
    "interceptionsINT",
    "kickingFGM","kickingFGA","kickingXPM","kickingXPA",
    "puntingYDS","puntingNO","puntingIn 20",
  ];
  const out = {};
  for (const k of addKeys) {
    const rv = parseFloat(reg[k] || 0);
    const pv = parseFloat(post[k] || 0);
    if (rv || pv) out[k] = rv + pv;
  }
  // Recompute rate stats
  if (out.passingATT)    out.passingYPA  = parseFloat((out.passingYDS  / out.passingATT).toFixed(1));
  if (out.rushingCAR)    out.rushingYPC  = parseFloat((out.rushingYDS  / out.rushingCAR).toFixed(1));
  if (out.receivingREC)  out.receivingYPR = parseFloat((out.receivingYDS / out.receivingREC).toFixed(1));
  if (out.puntingNO)     out.puntingYPP  = parseFloat((out.puntingYDS  / out.puntingNO).toFixed(1));
  if (out.kickingFGA)    out.kickingLNG  = Math.max(parseFloat(reg.kickingLNG || 0), parseFloat(post.kickingLNG || 0)) || undefined;
  return out;
}

// The stat tiles for one position group's season line. Keys are the API's
// category+type names as script 01 stores them. OL has no individual stats
// and says so.
function renderStatBlocks(stats, pg) {
  // Key names match what script 01 stores in the JSONB blob
  const fields = {
    QB: [["passingYDS","Pass Yds"],["passingTD","TDs"],["passingINT","INTs"],["passingCOMPLETIONS","Comp"],["passingATT","Att"],["passingYPA","YPA"],["rushingYDS","Rush Yds"]],
    RB: [["rushingYDS","Rush Yds"],["rushingTD","TDs"],["rushingCAR","Car"],["rushingYPC","YPC"],["receivingREC","Rec"],["receivingYDS","Rec Yds"]],
    WR: [["receivingYDS","Rec Yds"],["receivingTD","TDs"],["receivingREC","Rec"],["receivingYPR","YPR"],["rushingYDS","Rush Yds"]],
    TE: [["receivingYDS","Rec Yds"],["receivingTD","TDs"],["receivingREC","Rec"],["receivingYPR","YPR"]],
    OL: [],
    EDGE: [["defensiveTOT","Tackles"],["defensiveSACKS","Sacks"],["defensiveTFL","TFL"],["defensiveQB HUR","QB Hur"],["defensivePD","PDs"]],
    DL:   [["defensiveTOT","Tackles"],["defensiveSACKS","Sacks"],["defensiveTFL","TFL"],["defensiveQB HUR","QB Hur"],["defensivePD","PDs"]],
    LB:   [["defensiveTOT","Tackles"],["defensiveSACKS","Sacks"],["defensiveTFL","TFL"],["interceptionsINT","INTs"],["defensivePD","PDs"]],
    CB:   [["defensiveTOT","Tackles"],["interceptionsINT","INTs"],["defensivePD","PDs"],["defensiveTFL","TFL"],["defensiveSACKS","Sacks"]],
    S:    [["defensiveTOT","Tackles"],["interceptionsINT","INTs"],["defensivePD","PDs"],["defensiveSACKS","Sacks"],["defensiveTFL","TFL"]],
    DB:   [["defensiveTOT","Tackles"],["interceptionsINT","INTs"],["defensivePD","PDs"],["defensiveTFL","TFL"]],
    K:  [["kickingFGM","FGM"],["kickingFGA","FGA"],["kickingLNG","Long"],["kickingXPM","XPM"]],
    P:  [["puntingYDS","Yds"],["puntingNO","Punts"],["puntingIn 20","In 20"],["puntingYPP","Avg"]],
  };
  const cols = fields[pg] || [];
  if (!cols.length) return '<p class="text-muted" style="font-size:var(--fs-sm)">No individual stats tracked for this position.</p>';
  const blocks = cols.map(([key, label]) => {
    const val = stats[key];
    const display = val !== null && val !== undefined ? (typeof val === "number" ? (Number.isInteger(val) ? val : parseFloat(val).toFixed(1)) : val) : "—";
    return `<div class="stat-block"><span class="stat-val">${display}</span><span class="stat-label">${label}</span></div>`;
  }).join("");
  return blocks;
}

// Wires the controls inside freshly rendered modal content. Called after every
// render (loading shell, not-found, full profile), because each render replaces
// the ✕ button and the similar-player rows.
//
// The backdrop and Escape listeners live on long-lived elements, so they are
// bound ONCE. Escape used to be `{ once: true }` and re-added per render — the
// first keypress of ANY key consumed it, so after a Tab, Escape did nothing.
function bindModalClose(modal) {
  modal.querySelector(".modal-close")?.addEventListener("click", closeModal);
  if (!modal._closeBound) {
    modal._closeBound = true;
    modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", e => {
      if (!modal.classList.contains("open")) return;
      if (e.key === "Escape") closeModal();
      else if (e.key === "Tab") _trapTab(e, modal);
    });
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Player details");
  }
  // Every render replaces the content, so focus would otherwise fall to <body>.
  if (!modal.contains(document.activeElement)) modal.querySelector(".modal-close")?.focus();
  // Similar player rows open that player, in the season the comp is from —
  // comps are cross-era, so the modal's own season is the wrong default.
  makeActivatable(modal.querySelectorAll(".similar-row[data-player-id]"));
  modal.querySelectorAll(".similar-row[data-player-id]").forEach(el => {
    el.addEventListener("click", () => {
      const id = parseInt(el.dataset.playerId);
      if (id) openPlayerModal(id, parseInt(el.dataset.season) || undefined);
    });
  });
}

// Keeps Tab inside the open modal: from the last control it wraps to the first
// and back, and focus that has escaped to the page behind is pulled in.
function _trapTab(e, modal) {
  const items = [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && el.offsetParent !== null);
  if (!items.length) { e.preventDefault(); return; }
  const first = items[0], last = items[items.length - 1];
  if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// Closes the modal and returns focus to whatever opened it.
function closeModal() {
  const modal = document.getElementById("player-modal");
  modal.classList.remove("open");
  document.body.style.overflow = "";
  const back = modal._returnFocus;
  modal._returnFocus = null;
  if (back && back.isConnected && typeof back.focus === "function") back.focus();
}
