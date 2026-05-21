// Ratings dashboard logic for ratings.html
// Renders position leaderboards and Rating vs Recruiting Stars scatter plot.
// Data: Supabase API (always current) for leaderboard; players.json for scatter plot.

let _ratingsByPosition = {};
let _ratingsAllPlayers = [];        // used only for scatter plot
let _activePosition = "QB";
let _ratingSeason = CONFIG.CURRENT_SEASON;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function initRatings(season) {
  if (season) _ratingSeason = season;
  _ratingsByPosition = {};
  document.getElementById("leaderboard").innerHTML = '<p class="empty-state">Loading ratings…</p>';

  // Fetch top-50 per position in parallel — fast, server-side filtered
  try {
    const results = await Promise.all(
      CONFIG.POSITIONS.map(pg =>
        fetchPlayers({ season: _ratingSeason, position: pg, limit: 100 })
          .then(players => { console.log(`[ratings] ${pg}: ${players.length} players`); return { pg, players }; })
          .catch(e => { console.error(`[ratings] ${pg} fetch failed:`, e.message); return { pg, players: [] }; })
      )
    );
    for (const { pg, players } of results) {
      if (players.length) _ratingsByPosition[pg] = players;
    }
    // For scatter plot — flatten all fetched players
    _ratingsAllPlayers = results.flatMap(r => r.players);

    const totalLoaded = _ratingsAllPlayers.length;
    console.log(`[ratings] Total loaded: ${totalLoaded} players across ${Object.keys(_ratingsByPosition).length} positions`);
    if (totalLoaded === 0) {
      document.getElementById("leaderboard").innerHTML =
        '<p class="empty-state">No ratings data found for this season. Make sure scripts 06 and 07 have been run.</p>';
      document.getElementById("position-tabs").innerHTML = "";
      return;
    }
  } catch (e) {
    console.error("[ratings] initRatings failed:", e);
    document.getElementById("leaderboard").innerHTML = `<p class="empty-state">Failed to load ratings: ${e.message}</p>`;
    return;
  }

  buildPositionTabs();
  showPosition(_activePosition);
  renderScatterPlot(_ratingsAllPlayers);
}

// ---------------------------------------------------------------------------
// Position tabs
// ---------------------------------------------------------------------------

function buildPositionTabs() {
  const tabBar = document.getElementById("position-tabs");
  CONFIG.POSITIONS.forEach(pos => {
    if (!_ratingsByPosition[pos]) return;
    const btn = document.createElement("button");
    btn.className = "tab-btn" + (pos === _activePosition ? " active" : "");
    btn.textContent = pos;
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      showPosition(pos);
    });
    tabBar.appendChild(btn);
  });
}

function showPosition(pos) {
  _activePosition = pos;
  const players = _ratingsByPosition[pos] || [];
  renderLeaderboard(players, pos);
}

// ---------------------------------------------------------------------------
// Leaderboard table
// ---------------------------------------------------------------------------

function renderLeaderboard(players, position) {
  const container = document.getElementById("leaderboard");
  if (!players.length) {
    container.innerHTML = `<p class="empty-state">No ratings data for ${position}</p>`;
    return;
  }

  const rows = players.map((p, i) => {
    const ovr    = p.overall_rating ? Math.round(p.overall_rating) : null;
    const tier   = getRatingTier(ovr || 0);
    const pg     = p.position_group || p.position || "—";
    const color  = posColor(pg);
    const rankCls = i < 3 ? "top3" : i < 10 ? "top10" : "";
    const edgeVal = p.edge_score != null ? parseFloat(p.edge_score).toFixed(2) : null;
    const breakout = p.breakout_prob >= 0.35 ? " 🔥" : "";
    return `
      <div class="draft-row animate-up ${tier.cls}" data-player-id="${p.id}"
           style="--tier-color:${tier.color || "transparent"}">
        <div class="draft-rank ${rankCls}">#${i + 1}</div>
        <div class="draft-info">
          <div class="draft-name">
            <span class="pos-badge-color" style="background:${color};font-size:9px;padding:1px 5px;margin-right:4px">${pg}</span>${p.name || "—"}${breakout}
          </div>
          <div class="draft-meta">${p.team || "—"} · ${yearLabel(p.year)} · ${p.conference || "—"} · ${starsHtml(p.stars)}</div>
        </div>
        <div class="draft-ovr" style="--tier-color:${tier.color || "var(--text)"}">${ovr || "—"}</div>
        <div class="draft-edge">${edgeVal != null ? edgeVal : "—"}</div>
        <div class="draft-traj">${trajHtml(p.trajectory)}</div>
        <div style="font-size:var(--fs-xs);color:var(--text-muted);text-align:right">${p.composite_score?.toFixed(4) || "—"}</div>
      </div>`;
  }).join("");

  container.innerHTML = `
    <div class="draft-board-header animate-pop">
      <span>#</span><span>Player</span>
      <span>OVR</span><span>OAP</span><span>Traj</span><span style="text-align:right">Recruit</span>
    </div>
    <div class="draft-board-rows stagger-children">${rows}</div>`;

  container.querySelectorAll(".draft-row").forEach(row => {
    row.addEventListener("click", () => {
      const id = parseInt(row.dataset.playerId);
      if (id) openPlayerModal(id, _ratingSeason);
    });
  });
}

function yearLabel(yr) {
  return { 1: "FR", 2: "SO", 3: "JR", 4: "SR", 5: "GR" }[yr] || "—";
}

// ---------------------------------------------------------------------------
// Rating vs Recruiting Stars scatter plot (vanilla SVG)
// The core value-prop visualization: players above the line are "hidden gems"
// ---------------------------------------------------------------------------

function renderScatterPlot(players) {
  const container = document.getElementById("scatter-chart");
  if (!container) return;

  // Only plot players with both a rating and star data
  const data = players.filter(p => p.overall_rating && p.stars > 0);
  if (data.length < 10) {
    container.innerHTML = '<p class="empty-state">Not enough data to render scatter plot.</p>';
    return;
  }

  const W = container.clientWidth || 600;
  const H = 360;
  const PAD = { top: 20, right: 20, bottom: 48, left: 52 };
  const PW = W - PAD.left - PAD.right;
  const PH = H - PAD.top - PAD.bottom;

  // Scales
  const xMin = 0.5, xMax = 5.5;  // stars
  const yMin = 25, yMax = 100;    // rating
  const xScale = v => PAD.left + ((v - xMin) / (xMax - xMin)) * PW;
  const yScale = v => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * PH;

  // Regression line (simple linear regression)
  const n = data.length;
  const xMean = data.reduce((s, p) => s + p.stars, 0) / n;
  const yMean = data.reduce((s, p) => s + p.overall_rating, 0) / n;
  const slope = data.reduce((s, p) => s + (p.stars - xMean) * (p.overall_rating - yMean), 0)
              / data.reduce((s, p) => s + (p.stars - xMean) ** 2, 0);
  const intercept = yMean - slope * xMean;
  const regY = x => slope * x + intercept;

  // SVG points — colored by position group, larger if overperformer
  const points = data.map(p => {
    const cx = xScale(p.stars + (Math.random() - 0.5) * 0.15);  // jitter
    const cy = yScale(p.overall_rating);
    const predicted = regY(p.stars);
    const overperformer = p.overall_rating > predicted + 8;
    const color = posColor(p.position_group || p.position || "ATH");
    const r = overperformer ? 5.5 : 3.5;
    const stroke = overperformer ? "rgba(255,255,255,0.6)" : "none";
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}"
      fill="${color}" opacity="0.80" stroke="${stroke}" stroke-width="1"
      class="scatter-dot" data-id="${p.id}"
      data-name="${(p.name||"").replace(/"/g,"")}" data-ovr="${Math.round(p.overall_rating)}"
      data-pg="${p.position_group||""}" data-team="${(p.team||"").replace(/"/g,"")}"
      data-traj="${(p.trajectory||0).toFixed(1)}" data-stars="${p.stars}"/>`;
  }).join("");

  // Regression line path
  const x1 = xScale(xMin + 0.3), y1 = yScale(Math.max(yMin, Math.min(yMax, regY(xMin + 0.3))));
  const x2 = xScale(xMax - 0.3), y2 = yScale(Math.max(yMin, Math.min(yMax, regY(xMax - 0.3))));
  const regLine = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
    stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="5,4"/>`;

  // X-axis star labels
  const xAxis = [1,2,3,4,5].map(s => `
    <text x="${xScale(s).toFixed(1)}" y="${PAD.top + PH + 20}" text-anchor="middle"
      font-size="12" fill="var(--text-muted)">${"★".repeat(s)}</text>`).join("");

  // Y-axis rating labels
  const yAxis = [40,50,60,70,80,90].map(r => `
    <line x1="${PAD.left - 4}" y1="${yScale(r).toFixed(1)}" x2="${PAD.left + PW}" y2="${yScale(r).toFixed(1)}"
      stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
    <text x="${PAD.left - 8}" y="${(yScale(r) + 4).toFixed(1)}" text-anchor="end"
      font-size="11" fill="var(--text-muted)">${r}</text>`).join("");

  // Legend
  const legend = `
    <circle cx="${PAD.left + 10}" cy="${PAD.top + PH + 38}" r="4" fill="#00c853"/>
    <text x="${PAD.left + 18}" y="${PAD.top + PH + 43}" font-size="11" fill="var(--text-muted)">Overperformer (8+ pts above trend)</text>`;

  // Quadrant annotations
  const annotations = `
    <text x="${xScale(1.2).toFixed(1)}" y="${yScale(88).toFixed(1)}" font-size="10"
      fill="var(--positive)" opacity="0.6" font-style="italic">Hidden Gems</text>
    <text x="${xScale(4.2).toFixed(1)}" y="${yScale(91).toFixed(1)}" font-size="10"
      fill="var(--text-muted)" opacity="0.6" font-style="italic">Stars Deliver</text>
    <text x="${xScale(3.8).toFixed(1)}" y="${yScale(38).toFixed(1)}" font-size="10"
      fill="var(--negative)" opacity="0.5" font-style="italic">Underperforming</text>`;

  container.innerHTML = `
    <div id="scatter-tooltip">
      <div class="tt-name"></div>
      <div class="tt-meta"></div>
      <div class="tt-ovr"></div>
    </div>
    <svg id="scatter-svg" width="${W}" height="${H}" style="display:block;overflow:visible">
      ${yAxis}${regLine}${points}${annotations}${xAxis}
      <text x="${W/2}" y="${H - 2}" text-anchor="middle" font-size="12" fill="var(--text-muted)">Recruiting Stars</text>
      <text x="12" y="${H/2}" text-anchor="middle" font-size="12" fill="var(--text-muted)"
        transform="rotate(-90,12,${H/2})">Rating</text>
    </svg>
    <p class="chart-caption">Players above the dashed line outperform their recruiting ranking. Dots colored by position group.</p>`;

  // Hover tooltip
  const tt = container.querySelector("#scatter-tooltip");
  container.querySelectorAll(".scatter-dot").forEach(dot => {
    dot.style.cursor = "pointer";
    dot.addEventListener("mouseenter", e => {
      const d = e.target.dataset;
      tt.querySelector(".tt-name").textContent = d.name;
      tt.querySelector(".tt-meta").textContent = `${d.pg} · ${d.team} · ${d.stars}★`;
      tt.querySelector(".tt-ovr").textContent  = `OVR ${d.ovr}  ${parseFloat(d.traj) > 0 ? "↑" : parseFloat(d.traj) < 0 ? "↓" : "→"} ${Math.abs(parseFloat(d.traj)).toFixed(1)}`;
      tt.style.display = "block";
    });
    dot.addEventListener("mousemove", e => {
      tt.style.left = (e.clientX + 12) + "px";
      tt.style.top  = (e.clientY - 40) + "px";
    });
    dot.addEventListener("mouseleave", () => { tt.style.display = "none"; });
    dot.addEventListener("click", () => {
      const id = parseInt(dot.dataset.id);
      if (id) openPlayerModal(id, _ratingSeason);
    });
  });
}
