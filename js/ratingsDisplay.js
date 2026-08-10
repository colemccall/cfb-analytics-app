// Ratings page — the talent-vs-production scatter plus per-position
// leaderboards (top 50 per group, from ratings_by_position_{season}.json).

let _ratingsAllPlayers = [];
let _ratingSeason = CONFIG.CURRENT_SEASON;
let _filterPos  = "ALL";
let _filterTeam = "ALL";

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function initRatings(season) {
  if (season !== undefined) _ratingSeason = season;
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
}

// ---------------------------------------------------------------------------
// Filter controls
// ---------------------------------------------------------------------------

function buildFilters() {
  const posBar = document.getElementById("pos-filter-bar");
  const teamSel = document.getElementById("team-filter-select");
  if (!posBar || !teamSel) return;

  // Position chips
  const positions = ["ALL", ...CONFIG.POSITIONS];
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
  teamSel.addEventListener("change", () => {
    _filterTeam = teamSel.value;
    applyFilters();
  });
}

function applyFilters() {
  let players = _ratingsAllPlayers;
  if (_filterPos !== "ALL") {
    players = players.filter(p => p.position_group === _filterPos);
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

function renderScatterPlot(players) {
  const container = document.getElementById("scatter-chart");
  if (!container) return;

  const data = players.filter(p => p.overall_rating && p.stars > 0);
  if (data.length < 5) {
    container.innerHTML = '<p class="empty-state" style="padding:2rem">Not enough data to render (need 5+ players with stars).</p>';
    return;
  }

  const W = container.clientWidth || 680;
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
    const color = over ? "#00c853" : posColor(p.position_group || p.position || "ATH");
    const r = over ? 6 : 4;
    const stroke = over ? "rgba(255,255,255,0.5)" : "none";
    const name = (p.name || "").replace(/"/g, "&quot;");
    const team = (p.team || "").replace(/"/g, "&quot;");
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}"
      fill="${color}" opacity="0.82" stroke="${stroke}" stroke-width="1.2"
      class="scatter-dot" data-id="${p.id}"
      data-name="${name}" data-ovr="${Math.round(p.overall_rating)}"
      data-pg="${p.position_group || ""}" data-team="${team}"
      data-traj="${(p.trajectory || 0).toFixed(1)}" data-stars="${p.stars}"/>`;
  }).join("");

  // Regression line
  const rx1 = xScale(xMin + 0.3), ry1 = yScale(Math.max(yMin, Math.min(yMax, regY(xMin + 0.3))));
  const rx2 = xScale(xMax - 0.3), ry2 = yScale(Math.max(yMin, Math.min(yMax, regY(xMax - 0.3))));
  const regLine = `<line x1="${rx1}" y1="${ry1}" x2="${rx2}" y2="${ry2}"
    stroke="rgba(255,255,255,0.22)" stroke-width="1.5" stroke-dasharray="5,4"/>`;

  // Axes
  const xAxis = [1,2,3,4,5].map(s => `
    <text x="${xScale(s).toFixed(1)}" y="${PAD.top + PH + 22}" text-anchor="middle"
      font-size="13" fill="var(--text-muted)">${"★".repeat(s)}</text>`).join("");

  const yAxis = [40,50,60,70,80,90].map(r => `
    <line x1="${PAD.left - 4}" y1="${yScale(r).toFixed(1)}" x2="${PAD.left + PW}" y2="${yScale(r).toFixed(1)}"
      stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
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
    <div id="scatter-tooltip" style="display:none;position:fixed;background:var(--surface);border:1px solid var(--border);
      border-radius:8px;padding:0.6rem 0.9rem;font-size:0.82rem;pointer-events:none;z-index:100;box-shadow:0 4px 16px rgba(0,0,0,0.4)">
      <div class="tooltip-name" style="font-weight:700;margin-bottom:2px"></div>
      <div class="tooltip-meta" style="color:var(--text-muted)"></div>
      <div class="tooltip-ovr" style="color:var(--accent);margin-top:2px;font-weight:600"></div>
    </div>
    <svg id="scatter-svg" width="${W}" height="${H}" style="display:block;overflow:visible">
      ${yAxis}${regLine}${points}${annotations}${xAxis}
      <text x="${W / 2}" y="${H - 4}" text-anchor="middle" font-size="12" fill="var(--text-muted)">Recruiting Stars</text>
      <text x="13" y="${H / 2}" text-anchor="middle" font-size="12" fill="var(--text-muted)"
        transform="rotate(-90,13,${H/2})">Rating (OVR)</text>
    </svg>
    <p style="font-size:0.78rem;color:var(--text-muted);margin-top:0.5rem">
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

  const positions = CONFIG.POSITIONS.filter(p => (_boardData[p] || []).length);
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

function _renderPositionBoard(container) {
  const rows = (_boardData[_boardPos] || []).map((r, i) => ({ ...r, rank: i + 1 }));
  const yearLabels = { 1: "FR", 2: "SO", 3: "JR", 4: "SR", 5: "GR" };

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
      { key: "year", label: "Yr", fmt: v => yearLabels[v] || "—" },
      { key: "stars", label: "Recruit", fmt: v => v ? starsHtml(v) : "—" },
      { key: "overall", label: "OVR", num: true,
        fmt: v => ovrPill(v, { label: `Overall rating, ${_boardSeason}` }) },
    ],
  });
}

function _bindScatterDots(container, tt) {
  container.querySelectorAll(".scatter-dot").forEach(dot => {
    dot.style.cursor = "pointer";
    dot.addEventListener("mouseenter", e => {
      const d = e.target.dataset;
      tt.querySelector(".tooltip-name").textContent = d.name;
      tt.querySelector(".tooltip-meta").textContent = `${d.pg} · ${d.team} · ${d.stars}★`;
      tt.querySelector(".tooltip-ovr").textContent  =
        `OVR ${d.ovr}  ${+d.traj > 0 ? "↑" : +d.traj < 0 ? "↓" : "→"} ${Math.abs(+d.traj).toFixed(1)}`;
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
