// Ratings page — the talent-vs-production scatter plus per-position
// leaderboards (top 50 per group, from ratings_by_position_{season}.json).

let _ratingsAllPlayers = [];
let _ratingSeason = CONFIG.CURRENT_SEASON;
let _filterPos  = "ALL";
let _filterTeam = "ALL";

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

// Load a season (or the current one) into the scatter: reset state, show the
// provenance notice, fetch the season's players, build the position chips
// and team list, and draw. The theme repaint is bound once, however many
// times the season changes.
async function initRatings(season) {
  if (season !== undefined) _ratingSeason = season;
  renderSeasonProvenance(_ratingSeason);
  _ratingsAllPlayers = [];

  document.getElementById("scatter-chart").innerHTML =
    '<p class="empty-state" style="padding:2rem">Loading…</p>';

  try {
    const players = await fetchAllPlayers(_ratingSeason);
    _ratingsAllPlayers = players || [];
  } catch (e) {
    document.getElementById("scatter-chart").innerHTML =
      `<p class="empty-state">Failed to load players: ${e.message}</p>`;
    return;
  }

  if (!_ratingsAllPlayers.length) {
    document.getElementById("scatter-chart").innerHTML =
      '<p class="empty-state">No ratings data for this season. Run scripts 07 → 10 → 12.</p>';
    return;
  }

  buildFilters();
  applyFilters();

  // Scatter dots and leaderboard pills are theme-computed — repaint on switch.
  if (!initRatings._themeBound) {
    initRatings._themeBound = true;
    onThemeChange(() => {
      applyFilters();
      const board = document.getElementById("position-board");
      if (board && _boardData) _renderPositionBoard(board);
    });
  }
}

// ---------------------------------------------------------------------------
// Filter controls
// ---------------------------------------------------------------------------

// Position chips (FILTER_POSITIONS, so DB covers CB ∪ S ∪ DB) and the team
// dropdown for the loaded season. Chips are rebuilt each time; the dropdown's
// change listener is bound once — see the note inline.
function buildFilters() {
  const posBar = document.getElementById("pos-filter-bar");
  const teamSel = document.getElementById("team-filter-select");
  if (!posBar || !teamSel) return;

  // Position chips
  // FILTER_POSITIONS, not POSITIONS: one "DB" option covers CB/S/DB, the 48%
  // of the secondary the API labels generically included.
  const positions = ["ALL", ...CONFIG.FILTER_POSITIONS];
  posBar.innerHTML = positions.map(p =>
    `<button class="pos-chip${p === _filterPos ? " active" : ""}" data-pos="${p}">${p}</button>`
  ).join("");
  posBar.querySelectorAll(".pos-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      posBar.querySelectorAll(".pos-chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _filterPos = btn.dataset.pos;
      applyFilters();
    });
  });

  // Team dropdown — sorted alphabetically
  const teams = [...new Set(_ratingsAllPlayers.map(p => p.team).filter(Boolean))].sort();
  teamSel.innerHTML = `<option value="ALL">All Teams</option>` +
    teams.map(t => `<option value="${t}">${t}</option>`).join("");
  teamSel.value = _filterTeam;
  // buildFilters() runs on every season change; the <select> outlives it. Binding
  // here unguarded stacked one listener per season visited, so after two season
  // changes a single team pick redrew the scatter three times.
  if (!teamSel._bound) {
    teamSel._bound = true;
    teamSel.addEventListener("change", () => {
      _filterTeam = teamSel.value;
      applyFilters();
    });
  }
}

// Filter the season's players by the active position chip and team, update
// the "N players" label, and redraw the scatter.
function applyFilters() {
  let players = _ratingsAllPlayers;
  if (_filterPos !== "ALL") {
    players = players.filter(p => matchesPosition(p.position_group, _filterPos));
  }
  if (_filterTeam !== "ALL") {
    players = players.filter(p => p.team === _filterTeam);
  }

  const countEl = document.getElementById("scatter-count");
  if (countEl) countEl.textContent = `${players.length} players`;

  renderScatterPlot(players);
}

// ---------------------------------------------------------------------------
// Scatter plot: Rating vs Recruiting Stars
// ---------------------------------------------------------------------------

// The talent-vs-production scatter as inline SVG: recruiting stars (jittered)
// on x, OVR on y, with an OLS trend line of OVR on stars. A dot more than 8
// OVR above the line is drawn larger in the positive colour; the rest are
// coloured by position. Needs at least 5 players with stars. Dot data
// attributes feed the tooltip and click-through.
function renderScatterPlot(players) {
  const container = document.getElementById("scatter-chart");
  if (!container) return;

  const data = players.filter(p => p.overall_rating && p.stars > 0);
  if (data.length < 5) {
    container.innerHTML = '<p class="empty-state" style="padding:2rem">Not enough data to render (need 5+ players with stars).</p>';
    return;
  }

  // clientWidth includes the container's padding; the svg lives in the content
  // box, so sizing it to clientWidth overflowed a phone viewport by the padding.
  const cs = getComputedStyle(container);
  const W = (container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) || 680;
  const H = 420;
  const PAD = { top: 24, right: 24, bottom: 56, left: 56 };
  const PW = W - PAD.left - PAD.right;
  const PH = H - PAD.top - PAD.bottom;

  const xMin = 0.5, xMax = 5.5;
  const yMin = 25, yMax = 100;
  const xScale = v => PAD.left + ((v - xMin) / (xMax - xMin)) * PW;
  const yScale = v => PAD.top  + (1 - (v - yMin) / (yMax - yMin)) * PH;

  // Linear regression
  const n = data.length;
  const xMean = data.reduce((s, p) => s + p.stars, 0) / n;
  const yMean = data.reduce((s, p) => s + p.overall_rating, 0) / n;
  const ssXY  = data.reduce((s, p) => s + (p.stars - xMean) * (p.overall_rating - yMean), 0);
  const ssXX  = data.reduce((s, p) => s + (p.stars - xMean) ** 2, 0);
  const slope = ssXX ? ssXY / ssXX : 0;
  const intercept = yMean - slope * xMean;
  const regY = x => slope * x + intercept;

  // Scatter dots
  const points = data.map(p => {
    const jitter = (Math.random() - 0.5) * 0.18;
    const cx = xScale(p.stars + jitter);
    const cy = yScale(Math.min(yMax, Math.max(yMin, p.overall_rating)));
    const predicted = regY(p.stars);
    const over = p.overall_rating > predicted + 8;
    const color = over ? "var(--positive)" : posColor(p.position_group || p.position || "ATH");
    const r = over ? 6 : 4;
    const stroke = over ? "var(--text)" : "none";
    const name = (p.name || "").replace(/"/g, "&quot;");
    const team = (p.team || "").replace(/"/g, "&quot;");
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}"
      fill="${color}" opacity="0.82" stroke="${stroke}" stroke-width="1.2"
      class="scatter-dot" data-id="${p.id}"
      data-name="${name}" data-ovr="${Math.round(p.overall_rating)}"
      data-pg="${p.position_group || ""}" data-team="${team}" data-stars="${p.stars}"/>`;
  }).join("");

  // Regression line
  const rx1 = xScale(xMin + 0.3), ry1 = yScale(Math.max(yMin, Math.min(yMax, regY(xMin + 0.3))));
  const rx2 = xScale(xMax - 0.3), ry2 = yScale(Math.max(yMin, Math.min(yMax, regY(xMax - 0.3))));
  const regLine = `<line x1="${rx1}" y1="${ry1}" x2="${rx2}" y2="${ry2}"
    stroke="var(--border-strong)" stroke-width="1.5" stroke-dasharray="5,4"/>`;

  // Axes
  const xAxis = [1,2,3,4,5].map(s => `
    <text x="${xScale(s).toFixed(1)}" y="${PAD.top + PH + 22}" text-anchor="middle"
      font-size="13" fill="var(--text-muted)">${"★".repeat(s)}</text>`).join("");

  const yAxis = [40,50,60,70,80,90].map(r => `
    <line x1="${PAD.left - 4}" y1="${yScale(r).toFixed(1)}" x2="${PAD.left + PW}" y2="${yScale(r).toFixed(1)}"
      stroke="var(--border)" stroke-width="1"/>
    <text x="${PAD.left - 10}" y="${(yScale(r) + 4).toFixed(1)}" text-anchor="end"
      font-size="11" fill="var(--text-muted)">${r}</text>`).join("");

  // Quadrant labels
  const annotations = `
    <text x="${xScale(1.2).toFixed(1)}" y="${yScale(90).toFixed(1)}" font-size="10"
      fill="var(--positive)" opacity="0.65" font-style="italic">Hidden Gems</text>
    <text x="${xScale(4.1).toFixed(1)}" y="${yScale(93).toFixed(1)}" font-size="10"
      fill="var(--text-muted)" opacity="0.6" font-style="italic">Stars Deliver</text>
    <text x="${xScale(3.6).toFixed(1)}" y="${yScale(36).toFixed(1)}" font-size="10"
      fill="var(--negative)" opacity="0.5" font-style="italic">Underperforming</text>`;

  container.innerHTML = `
    <div id="scatter-tooltip">
      <div class="tooltip-name"></div>
      <div class="tooltip-meta"></div>
      <div class="tooltip-ovr"></div>
    </div>
    <svg id="scatter-svg" width="${W}" height="${H}" style="display:block;overflow:visible">
      ${yAxis}${regLine}${points}${annotations}${xAxis}
      <text x="${W / 2}" y="${H - 4}" text-anchor="middle" font-size="12" fill="var(--text-muted)">Recruiting Stars</text>
      <text x="13" y="${H / 2}" text-anchor="middle" font-size="12" fill="var(--text-muted)"
        transform="rotate(-90,13,${H/2})">Rating (OVR)</text>
    </svg>
    <p class="chart-caption">
      Green = 8+ pts above trend line (overperformer). Dots colored by position group.
    </p>`;

  // Tooltip + click
  const tt = container.querySelector("#scatter-tooltip");
  _bindScatterDots(container, tt);
}

// ---------------------------------------------------------------------------
// Position leaderboards — top 50 per position group, straight from the
// pipeline's ratings_by_position export. This is the "Full Leaderboard" the
// home page links to.
// ---------------------------------------------------------------------------

let _boardPos = "QB";
let _boardSeason = CONFIG.CURRENT_SEASON;
let _boardData = null;

// Load ratings_by_position_{season}.json and render one tab per filter
// position that has rows (DB merges CB, S and DB — see _boardRows), keeping
// the current tab when it still exists.
async function initPositionBoard(season) {
  if (season !== undefined) _boardSeason = season;
  const container = document.getElementById("position-board");
  const tabsEl = document.getElementById("board-pos-tabs");
  if (!container || !tabsEl) return;

  container.innerHTML = skeletonRows(8);
  _boardData = await _load(`ratings_by_position_${_boardSeason}.json`);
  if (!_boardData || !Object.keys(_boardData).length) {
    tabsEl.innerHTML = "";
    container.innerHTML = emptyState(`No position leaderboard for ${_boardSeason} — run pipeline script 12.`);
    return;
  }

  const positions = CONFIG.FILTER_POSITIONS.filter(p => _boardRows(p).length);
  if (!positions.includes(_boardPos)) _boardPos = positions[0];

  tabsEl.innerHTML = positions.map(p =>
    `<button class="tab${p === _boardPos ? " active" : ""}" data-pos="${p}">${p}</button>`).join("");
  tabsEl.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      tabsEl.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _boardPos = btn.dataset.pos;
      _renderPositionBoard(container);
    });
  });

  _renderPositionBoard(container);
}

// The export is keyed by position GROUP; a filter option can span several of
// them. Merging here (rather than in the export) keeps one row per player in the
// data and lets the board re-rank the merged pool, which is what a "DB" board
// should show — corners, safeties and the generically-labelled together.
function _boardRows(pos) {
  const group = CONFIG.POSITION_FILTER_GROUPS[pos];
  if (!group) return _boardData[pos] || [];
  const merged = group.flatMap(g => _boardData[g] || []);
  return merged.sort((a, b) => (b.overall_rating ?? 0) - (a.overall_rating ?? 0));
}

// The active tab's leaderboard: rank, player link (🔥 for breakout ≥ 35%),
// team, conference, class year, stars and OVR pill, through the shared
// sortable table.
function _renderPositionBoard(container) {
  const rows = _boardRows(_boardPos).map((r, i) => ({ ...r, rank: i + 1 }));

  createDataTable(container, {
    rows,
    sort: { key: "rank", asc: true },
    footnote: `Top ${rows.length} ${_esc(_boardPos)}s of ${_boardSeason} by overall rating. 🔥 = breakout candidate (Engine D probability ≥ 35%).`,
    empty: "No rated players at this position for this season.",
    columns: [
      { key: "rank", label: "#", num: true,
        fmt: (v) => `<span class="rank-num ${v <= 3 ? "top3" : v <= 10 ? "top10" : ""}">${v}</span>` },
      { key: "name", label: "Player",
        fmt: (v, r) => `${playerLink(r.id, v, { season: _boardSeason })}${r.breakout_prob >= 0.35 ? " 🔥" : ""}` },
      { key: "team", label: "Team", fmt: (v) => v ? teamLink(v, { season: _boardSeason }) : "—" },
      { key: "conference", label: "Conf", fmt: v => _esc(v || "—") },
      { key: "class_year", label: "Yr", fmt: v => classYearLabel(v) },
      { key: "stars", label: "Recruit", fmt: v => v ? starsHtml(v) : "—" },
      { key: "overall", label: "OVR", num: true,
        fmt: (v, r) => ovrPill(v, { label: `Overall rating, ${_boardSeason}`, season: _boardSeason, source: r.projection_source }) },
    ],
  });
}

// Scatter interactions: hover shows the tooltip (name, position, team, stars,
// OVR) following the cursor; click opens the player modal for the ratings
// page's season.
function _bindScatterDots(container, tt) {
  container.querySelectorAll(".scatter-dot").forEach(dot => {
    dot.style.cursor = "pointer";
    dot.addEventListener("mouseenter", e => {
      const d = e.target.dataset;
      tt.querySelector(".tooltip-name").textContent = d.name;
      tt.querySelector(".tooltip-meta").textContent = `${d.pg} · ${d.team} · ${d.stars}★`;
      // OVR only. The tooltip used to add "→ 0.0" movement from `trajectory`,
      // which the export carries as exactly 0.0 for every played-season row
      // (22,523 of 22,523 in 2024–25) and null for 2026 — a number with no
      // evidence behind it, so it is withdrawn rather than shown. Real movement
      // is the modal's rating-history chart.
      tt.querySelector(".tooltip-ovr").textContent  = `OVR ${d.ovr}`;
      tt.style.display = "block";
    });
    dot.addEventListener("mousemove", e => {
      tt.style.left = (e.clientX + 14) + "px";
      tt.style.top  = (e.clientY - 44) + "px";
    });
    dot.addEventListener("mouseleave", () => { tt.style.display = "none"; });
    dot.addEventListener("click", () => {
      if (+dot.dataset.id) openPlayerModal(+dot.dataset.id, _ratingSeason);
    });
  });
}
