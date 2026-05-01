// Player search and card rendering for players.html
// Data source: static JSON (players.json) for the grid; Supabase for detail modal.

let _allPlayers = [];
let _filteredPlayers = [];
let _activeFilters = { position: "ALL", team: "", conference: "", minRating: 0, query: "" };

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function initPlayerSearch() {
  const resp = await fetch(CONFIG.DATA_BASE + "players.json");
  _allPlayers = await resp.json();
  populateFilterOptions();
  applyFilters();
  bindFilterEvents();
}

function populateFilterOptions() {
  const posSelect = document.getElementById("filter-position");
  CONFIG.POSITIONS.forEach(pos => {
    const opt = document.createElement("option");
    opt.value = pos; opt.textContent = pos;
    posSelect.appendChild(opt);
  });

  const confSelect = document.getElementById("filter-conference");
  const conferences = [...new Set(_allPlayers.map(p => p.conference).filter(Boolean))].sort();
  conferences.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    confSelect.appendChild(opt);
  });
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function applyFilters() {
  const { position, team, conference, minRating, query } = _activeFilters;
  const q = query.toLowerCase();

  _filteredPlayers = _allPlayers.filter(p => {
    if (position !== "ALL" && p.position_group !== position) return false;
    if (team && p.team?.toLowerCase() !== team.toLowerCase()) return false;
    if (conference && p.conference !== conference) return false;
    if (minRating && (p.overall_rating || 0) < minRating) return false;
    if (q && !p.name?.toLowerCase().includes(q) && !p.team?.toLowerCase().includes(q)) return false;
    return true;
  });

  renderGrid();
  document.getElementById("result-count").textContent = `${_filteredPlayers.length} players`;
}

function bindFilterEvents() {
  document.getElementById("filter-position").addEventListener("change", e => {
    _activeFilters.position = e.target.value; applyFilters();
  });
  document.getElementById("filter-conference").addEventListener("change", e => {
    _activeFilters.conference = e.target.value; applyFilters();
  });
  document.getElementById("filter-min-rating").addEventListener("input", e => {
    _activeFilters.minRating = parseInt(e.target.value) || 0;
    document.getElementById("min-rating-label").textContent = e.target.value || "0";
    applyFilters();
  });

  let debounceTimer;
  document.getElementById("search-input").addEventListener("input", e => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      _activeFilters.query = e.target.value; applyFilters();
    }, 200);
  });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderGrid() {
  const grid = document.getElementById("player-grid");
  if (!_filteredPlayers.length) {
    grid.innerHTML = '<p class="empty-state">No players match your filters.</p>';
    return;
  }
  grid.innerHTML = _filteredPlayers.map(p => playerCardHtml(p)).join("");

  // Attach click handlers
  grid.querySelectorAll(".player-card").forEach(card => {
    card.addEventListener("click", () => openPlayerModal(parseInt(card.dataset.id)));
  });
}

function playerCardHtml(p) {
  const rating = p.overall_rating ? Math.round(p.overall_rating) : "—";
  const color = p.overall_rating ? ratingColor(p.overall_rating) : "#666";
  const traj = p.trajectory > 0 ? `<span class="traj-up">▲${p.trajectory.toFixed(1)}</span>`
             : p.trajectory < 0 ? `<span class="traj-down">▼${Math.abs(p.trajectory).toFixed(1)}</span>`
             : "";
  const breakout = p.breakout_prob >= 0.35
    ? `<span class="breakout-badge" title="Breakout candidate">🔥</span>` : "";

  return `
    <div class="player-card" data-id="${p.id}" data-rating="${p.overall_rating || 0}">
      <div class="card-rating" style="background:${color}">${rating}</div>
      <div class="card-body">
        <div class="card-name">${p.name || "Unknown"} ${breakout}</div>
        <div class="card-meta">${p.position_group || p.position || "—"} · ${p.team || "—"}</div>
        <div class="card-meta">${p.conference || ""} · ${yearLabel(p.year)}</div>
        <div class="card-footer">
          ${starsHtml(p.stars)} ${traj}
        </div>
      </div>
    </div>`;
}

function yearLabel(yr) {
  return { 1: "FR", 2: "SO", 3: "JR", 4: "SR", 5: "GR" }[yr] || "—";
}

// ---------------------------------------------------------------------------
// Player detail modal
// ---------------------------------------------------------------------------

async function openPlayerModal(playerId) {
  const player = _allPlayers.find(p => p.id === playerId);
  if (!player) return;

  const modal = document.getElementById("player-modal");
  modal.querySelector(".modal-inner").innerHTML = modalLoadingHtml(player);
  modal.classList.add("open");
  document.body.style.overflow = "hidden";

  // Fetch live stats from Supabase
  let statsData = null;
  try {
    const statsRows = await fetchPlayerStats(playerId);
    if (statsRows.length) statsData = statsRows[0].data;
  } catch (e) {
    console.warn("Stats fetch failed:", e);
  }

  modal.querySelector(".modal-inner").innerHTML = modalContentHtml(player, statsData);
  bindModalClose(modal);
}

function modalLoadingHtml(player) {
  return `
    <div class="modal-header">
      <h2>${player.name}</h2>
      <button class="modal-close">✕</button>
    </div>
    <div class="modal-loading">Loading stats…</div>`;
}

function modalContentHtml(player, statsData) {
  const stats = statsData || {};
  const rating = player.overall_rating ? Math.round(player.overall_rating) : "—";
  const color = player.overall_rating ? ratingColor(player.overall_rating) : "#666";
  const pg = player.position_group || "QB";
  const skillAttrs = CONFIG.SKILL_ATTRS[pg] || [];

  const shapBars = player.shap
    ? Object.entries(player.shap)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 6)
        .map(([feat, val]) => {
          const label = (CONFIG.SKILL_ATTRS[pg] || []).find(([k]) => k === feat)?.[1] || feat;
          const barWidth = Math.min(100, Math.abs(val) * 200);
          const barColor = val > 0 ? "var(--positive)" : "var(--negative)";
          return `
            <div class="shap-row">
              <span class="shap-label">${label}</span>
              <div class="shap-bar-wrap">
                <div class="shap-bar" style="width:${barWidth}%;background:${barColor}"></div>
              </div>
              <span class="shap-val">${val > 0 ? "+" : ""}${val.toFixed(3)}</span>
            </div>`;
        }).join("")
    : '<p class="text-muted">No SHAP data available</p>';

  return `
    <div class="modal-header">
      <div class="modal-rating" style="background:${color}">${rating}</div>
      <div class="modal-title">
        <h2>${player.name}</h2>
        <p>${pg} · ${player.team || "—"} · ${yearLabel(player.year)}</p>
        <p>${player.conference || ""}</p>
      </div>
      <button class="modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-section">
        <h3>Rating Breakdown</h3>
        <p class="section-sub">Why is this player rated ${rating}? (SHAP values — positive = helped rating)</p>
        <div class="shap-bars">${shapBars}</div>
      </div>
      <div class="modal-section">
        <h3>Player Info</h3>
        <div class="info-grid">
          <div><span class="info-label">Recruiting</span> ${starsHtml(player.stars)} (${player.composite_score?.toFixed(4) || "N/A"})</div>
          <div><span class="info-label">Recruit Year</span> ${player.recruit_year || "—"}</div>
          <div><span class="info-label">Height</span> ${player.height_in ? `${Math.floor(player.height_in/12)}'${player.height_in%12}"` : "—"}</div>
          <div><span class="info-label">Weight</span> ${player.weight_lbs ? player.weight_lbs + " lbs" : "—"}</div>
          <div><span class="info-label">Hometown</span> ${player.hometown_state || "—"}</div>
          <div><span class="info-label">Trajectory</span> ${player.trajectory > 0 ? "▲ +" : player.trajectory < 0 ? "▼ " : "—"}${player.trajectory?.toFixed(1) || ""}</div>
        </div>
      </div>
      ${statsData ? `
      <div class="modal-section">
        <h3>Season Stats (${player.season})</h3>
        <div class="stats-grid">${renderStatBlocks(stats, pg)}</div>
      </div>` : ""}
    </div>`;
}

function renderStatBlocks(stats, pg) {
  const fields = {
    QB: [["passingYds","Pass Yds"],["passingTd","TDs"],["passingInt","INTs"],["passingComp","Comp"],["passingAtt","Att"]],
    RB: [["rushingYds","Rush Yds"],["rushingTd","TDs"],["rushingCar","Carries"],["receivingYds","Rec Yds"]],
    WR: [["receivingYds","Rec Yds"],["receivingTd","TDs"],["receivingRec","Rec"],["receivingYar","YAC"]],
    TE: [["receivingYds","Rec Yds"],["receivingTd","TDs"],["receivingRec","Rec"]],
    DL: [["defensiveTot","Tackles"],["defensiveSacks","Sacks"],["defensiveTfl","TFL"]],
    LB: [["defensiveTot","Tackles"],["defensiveSacks","Sacks"],["defensiveTfl","TFL"],["defensiveInt","INTs"]],
    DB: [["defensiveTot","Tackles"],["defensiveInt","INTs"],["defensivePd","PDs"]],
    K:  [["kickingFGM","FGM"],["kickingFGA","FGA"],["kickingLng","Long"]],
    P:  [["puntingYds","Yds"],["puntingPunts","Punts"],["puntingIn20","In 20"]],
  };
  const cols = fields[pg] || [];
  return cols.map(([key, label]) => {
    const val = stats[key];
    return `<div class="stat-block"><span class="stat-val">${val ?? "—"}</span><span class="stat-label">${label}</span></div>`;
  }).join("");
}

function bindModalClose(modal) {
  modal.querySelector(".modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); }, { once: true });
}

function closeModal() {
  document.getElementById("player-modal").classList.remove("open");
  document.body.style.overflow = "";
}
