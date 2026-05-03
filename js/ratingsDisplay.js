// Ratings dashboard logic for ratings.html
// Renders position leaderboards and Rating vs Recruiting Stars scatter plot.
// Data: Supabase API (always current) for leaderboard; players.json for scatter plot.

let _ratingsByPosition = {};
let _allPlayers = [];        // used only for scatter plot
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
        fetchPlayers({ season: _ratingSeason, position: pg, limit: 50 })
          .then(players => ({ pg, players }))
          .catch(() => ({ pg, players: [] }))
      )
    );
    for (const { pg, players } of results) {
      if (players.length) _ratingsByPosition[pg] = players;
    }
    // For scatter plot — flatten all fetched players
    _allPlayers = results.flatMap(r => r.players);
  } catch (e) {
    document.getElementById("leaderboard").innerHTML = `<p class="empty-state">Failed to load ratings: ${e.message}</p>`;
    return;
  }

  buildPositionTabs();
  showPosition(_activePosition);
  renderScatterPlot(_allPlayers);
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
    const rating = p.overall_rating ? Math.round(p.overall_rating) : "—";
    const color  = p.overall_rating ? ratingColor(p.overall_rating) : "#666";
    const traj   = p.trajectory > 0.5  ? `<span class="traj-up">▲</span>`
                 : p.trajectory < -0.5 ? `<span class="traj-down">▼</span>` : "";
    const breakout = p.breakout_prob >= 0.35 ? "🔥" : "";
    return `
      <tr class="lb-row" data-player-id="${p.id}" style="cursor:pointer">
        <td class="rank-col">${i + 1}</td>
        <td><span class="rating-badge" style="background:${color}">${rating}</span> ${traj}</td>
        <td class="name-col">${p.name || "—"} ${breakout}</td>
        <td>${p.team || "—"}</td>
        <td class="conf-col">${p.conference || "—"}</td>
        <td>${yearLabel(p.year)}</td>
        <td>${starsHtml(p.stars)}</td>
        <td class="composite-col">${p.composite_score?.toFixed(4) || "—"}</td>
      </tr>`;
  }).join("");

  container.innerHTML = `
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th>#</th><th>Rating</th><th>Player</th><th>Team</th>
          <th>Conf</th><th>Yr</th><th>Stars</th><th>Composite</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  container.querySelectorAll(".lb-row").forEach(row => {
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

  // SVG points
  const points = data.map(p => {
    const cx = xScale(p.stars + (Math.random() - 0.5) * 0.15);  // jitter
    const cy = yScale(p.overall_rating);
    const predicted = regY(p.stars);
    const overperformer = p.overall_rating > predicted + 8;
    const color = overperformer ? "#00c853" : ratingColor(p.overall_rating);
    const r = overperformer ? 5 : 3.5;
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}"
      fill="${color}" opacity="0.75" data-name="${p.name}" data-rating="${p.overall_rating?.toFixed(1)}"
      data-stars="${p.stars}" data-team="${p.team || ""}">
      <title>${p.name} (${p.team}) — Rating: ${p.overall_rating?.toFixed(1)}, Stars: ${p.stars}</title>
    </circle>`;
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

  container.innerHTML = `
    <svg width="${W}" height="${H}" style="display:block;overflow:visible">
      ${yAxis}${regLine}${points}${xAxis}${legend}
      <text x="${W/2}" y="${H - 2}" text-anchor="middle" font-size="12" fill="var(--text-muted)">Recruiting Stars</text>
      <text x="12" y="${H/2}" text-anchor="middle" font-size="12" fill="var(--text-muted)"
        transform="rotate(-90,12,${H/2})">Rating</text>
    </svg>
    <p class="chart-caption">Players above the dashed line outperform their recruiting ranking — hidden gems our model identified.</p>`;
}
