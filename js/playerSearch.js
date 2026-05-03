// Player search and card rendering for players.html
// Data source: Supabase for both grid and detail modal.

function posGroupColor(g) {
  switch (g) {
    case "QB":             return ["rgba(200,146,42,0.18)", "#c8922a"];
    case "RB": case "WR":
    case "TE":             return ["rgba(56,139,253,0.15)", "#4fa3f7"];
    case "DL": case "LB": return ["rgba(216,72,72,0.15)",  "#d84848"];
    case "DB":             return ["rgba(48,168,87,0.15)",  "#30a857"];
    case "OL":             return ["rgba(140,100,220,0.15)","#9b6fda"];
    case "K":  case "P":  return ["rgba(128,128,160,0.15)","#8080a0"];
    default:               return ["var(--surface)", "var(--text-muted)"];
  }
}
function ratingTextColor(v) { return (v >= 95 || (v >= 60 && v < 70)) ? "#111" : "#fff"; }

let _allPlayers = [];
let _filteredPlayers = [];
let _activeFilters = { position: "ALL", conference: "", minRating: 0, query: "", season: CONFIG.CURRENT_SEASON };

const OFF_POS = ["ALL", "QB", "RB", "WR", "TE", "OL"];
const DEF_POS = ["DL", "LB", "DB", "K", "P"];

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function initPlayerSearch() {
  buildPosChips();
  document.getElementById("player-grid").innerHTML = '<p class="empty-state">Loading players from database…</p>';
  try {
    _allPlayers = await fetchAllPlayers(_activeFilters.season);
  } catch (e) {
    document.getElementById("player-grid").innerHTML = `<p class="empty-state">Failed to load players: ${e.message}</p>`;
    return;
  }
  populateConferenceOptions();
  applyFilters();
  bindFilterEvents();
}

function buildPosChips() {
  const makeChip = (pg) => {
    const btn = document.createElement("button");
    btn.className = "pos-chip" + (pg === "ALL" ? " active" : "");
    btn.dataset.pos = pg;
    btn.textContent = pg;
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pos-chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      _activeFilters.position = pg;
      applyFilters();
    });
    return btn;
  };
  const offRow = document.getElementById("pos-chips-offense");
  const defRow = document.getElementById("pos-chips-defense");
  if (offRow) OFF_POS.forEach(p => offRow.appendChild(makeChip(p)));
  if (defRow) DEF_POS.forEach(p => defRow.appendChild(makeChip(p)));
}

function populateConferenceOptions() {
  const confSelect = document.getElementById("filter-conference");
  if (!confSelect) return;
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
  document.getElementById("filter-conference")?.addEventListener("change", e => {
    _activeFilters.conference = e.target.value; applyFilters();
  });
  document.getElementById("filter-min-rating")?.addEventListener("input", e => {
    _activeFilters.minRating = parseInt(e.target.value) || 0;
    document.getElementById("min-rating-label").textContent = e.target.value || "0";
    applyFilters();
  });

  let debounceTimer;
  document.getElementById("search-input")?.addEventListener("input", e => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { _activeFilters.query = e.target.value; applyFilters(); }, 200);
  });

  document.getElementById("filter-season")?.addEventListener("change", async e => {
    _activeFilters.season = parseInt(e.target.value);
    document.getElementById("player-grid").innerHTML = '<p class="empty-state">Loading…</p>';
    try {
      _allPlayers = await fetchAllPlayers(_activeFilters.season);
    } catch (err) {
      document.getElementById("player-grid").innerHTML = `<p class="empty-state">Failed: ${err.message}</p>`;
      return;
    }
    applyFilters();
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
  const ovr    = p.overall_rating ? Math.round(p.overall_rating) : null;
  const ovrBg  = ovr ? ratingColor(ovr) : "var(--surface-deep)";
  const ovrTxt = ovr ? ratingTextColor(ovr) : "var(--text-muted)";
  const pg = p.position_group || p.position || "—";
  const [pgBg, pgColor] = posGroupColor(pg);
  const traj = p.trajectory > 0 ? `<span class="traj-up">▲${p.trajectory.toFixed(1)}</span>`
             : p.trajectory < 0 ? `<span class="traj-down">▼${Math.abs(p.trajectory).toFixed(1)}</span>`
             : "";
  const breakout  = p.breakout_prob >= 0.35 ? `<span class="breakout-badge" title="Breakout candidate">🔥</span>` : "";
  const archetype = ovr ? computeArchetype(pg, ovr, p.shap) : "";
  const initials  = (p.name || "?").split(" ").map(n => n[0]).slice(0, 2).join("");

  return `
    <div class="player-card" data-id="${p.id}" data-rating="${p.overall_rating || 0}">
      <div class="card-avatar" style="background:${pgBg};border-color:${pgColor}40;color:${pgColor}">${initials}</div>
      <div class="card-body">
        <div class="card-header-row">
          <span class="card-name">${p.name || "Unknown"} ${breakout}</span>
          <span class="ovr" style="background:${ovrBg};color:${ovrTxt}">${ovr || "—"}</span>
        </div>
        <div class="card-pos-tag" style="color:${pgColor}">${pg} · ${yearLabel(p.year)}</div>
        <div class="card-meta">${p.team || "—"} · ${p.conference || "—"}</div>
        <div class="card-footer">
          ${starsHtml(p.stars)} ${traj}
          ${archetype ? `<span class="archetype-label">${archetype}</span>` : ""}
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

  // Fetch stats, rating history, and career stats in parallel
  const [statsRows, ratingHistory, careerStats] = await Promise.all([
    fetchPlayerStats(playerId, _activeFilters.season || CONFIG.CURRENT_SEASON).catch(() => []),
    fetchPlayerRatingHistory(playerId).catch(() => []),
    fetchPlayerCareerStats(playerId).catch(() => []),
  ]);

  const statsData = statsRows.length ? statsRows[0].data : null;
  modal.querySelector(".modal-inner").innerHTML = modalContentHtml(player, statsData, ratingHistory, careerStats);
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

function modalContentHtml(player, statsData, ratingHistory = [], careerStats = []) {
  const stats = statsData || {};
  const ovr   = player.overall_rating ? Math.round(player.overall_rating) : null;
  const color = ovr ? ratingColor(ovr) : "#555";
  const txtCol = ovr ? ratingTextColor(ovr) : "#fff";
  const pg    = player.position_group || "QB";
  const [pgBg, pgColor] = posGroupColor(pg);
  const archetype = ovr ? computeArchetype(pg, ovr, player.shap) : "";
  const initials  = (player.name || "?").split(" ").map(n => n[0]).slice(0, 2).join("");

  // ── Rating header ──
  const headerHtml = `
    <div class="modal-header">
      <div class="d-depth-avatar modal-avatar" style="background:${pgBg};border-color:${pgColor}40;color:${pgColor};width:52px;height:52px;font-size:18px;flex-shrink:0">${initials}</div>
      <div class="modal-title">
        <h2>${player.name || "Unknown"}</h2>
        <div class="modal-sub" style="color:${pgColor}">${pg} · ${yearLabel(player.year)} · ${player.team || "—"}</div>
        <div class="modal-sub" style="color:var(--text-muted)">${player.conference || ""}</div>
        ${archetype ? `<span class="archetype-label">${archetype}</span>` : ""}
      </div>
      <div class="modal-ovr-box" style="background:${color};color:${txtCol}">
        <span class="modal-ovr-num">${ovr || "—"}</span>
        <span class="modal-ovr-lbl">OVR</span>
      </div>
      <button class="modal-close">✕</button>
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
      ${player.trajectory ? `<span class="bio-sep">·</span><span class="${player.trajectory > 0 ? 'traj-up' : 'traj-down'}">${player.trajectory > 0 ? "▲" : "▼"} ${Math.abs(player.trajectory).toFixed(1)} traj</span>` : ""}
      ${player.breakout_prob >= 0.35 ? `<span class="bio-sep">·</span><span title="Breakout candidate">🔥 Breakout ${(player.breakout_prob * 100).toFixed(0)}%</span>` : ""}
    </div>`;

  // ── Season stats ──
  const statSectionHtml = `
    <div class="modal-section">
      <div class="modal-section-title">Season Stats (${_activeFilters.season || CONFIG.CURRENT_SEASON})</div>
      <div class="stats-grid">${renderStatBlocks(stats, pg)}</div>
    </div>`;

  // ── SHAP breakdown ──
  const shapEntries = player.shap && typeof player.shap === "object" ? Object.entries(player.shap) : [];
  const shapBars = shapEntries.length
    ? shapEntries
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 8)
        .map(([feat, val]) => {
          const label = (CONFIG.SKILL_ATTRS[pg] || []).find(([k]) => k === feat)?.[1] || feat.replace(/_/g, " ");
          const pct   = Math.min(100, Math.abs(val) * 300);
          const bar   = val > 0 ? "var(--positive)" : "var(--negative)";
          return `
            <div class="shap-row">
              <span class="shap-label">${label}</span>
              <div class="shap-bar-wrap">
                <div class="shap-bar" style="width:${pct}%;background:${bar}"></div>
              </div>
              <span class="shap-val" style="color:${bar}">${val > 0 ? "+" : ""}${val.toFixed(3)}</span>
            </div>`;
        }).join("")
    : '<p class="text-muted" style="font-size:var(--fs-xs);padding:4px 0">SHAP data not yet available for this player.</p>';

  const shapHtml = `
    <div class="modal-section">
      <div class="modal-section-title">Rating Breakdown <span class="section-note">(SHAP — why this rating?)</span></div>
      <div class="shap-bars">${shapBars}</div>
    </div>`;

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
    const ratings_labels = vals.map((v, i) =>
      `<text x="${(xS(i) + 4).toFixed(1)}" y="${(yS(v) - 5).toFixed(1)}" font-size="10" fill="var(--text-muted)">${Math.round(v)}</text>`
    ).join("");
    yoyHtml = `
      <div class="modal-section">
        <div class="modal-section-title">Rating History (Year-over-Year)</div>
        <svg width="${W}" height="${H}" style="display:block;overflow:visible;width:100%;max-width:${W}px">
          <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"/>
          ${dots}${labels}${ratings_labels}
        </svg>
      </div>`;
  }

  // ── Career stats table ──
  let careerHtml = "";
  if (careerStats.length > 1) {
    const CAREER_FIELDS = {
      QB: [["passingYDS","Pass Yds"],["passingTD","TDs"],["passingINT","INTs"],["passingATT","Att"],["passingCOMPLETIONS","Comp"],["passingYPA","YPA"]],
      RB: [["rushingYDS","Rush Yds"],["rushingTD","TDs"],["rushingCAR","Car"],["rushingYPC","YPC"],["receivingREC","Rec"],["receivingYDS","Rec Yds"]],
      WR: [["receivingYDS","Rec Yds"],["receivingTD","TDs"],["receivingREC","Rec"],["receivingYPR","YPR"]],
      TE: [["receivingYDS","Rec Yds"],["receivingTD","TDs"],["receivingREC","Rec"]],
      DL: [["defensiveTOT","Tackles"],["defensiveSACKS","Sacks"],["defensiveTFL","TFL"]],
      LB: [["defensiveTOT","Tackles"],["defensiveSACKS","Sacks"],["defensiveTFL","TFL"],["interceptionsINT","INTs"]],
      DB: [["defensiveTOT","Tackles"],["interceptionsINT","INTs"],["defensivePD","PDs"]],
      K:  [["kickingFGM","FGM"],["kickingFGA","FGA"],["kickingLNG","Long"]],
      P:  [["puntingYDS","Yds"],["puntingNO","Punts"],["puntingIn 20","In 20"]],
    };
    const fields = CAREER_FIELDS[pg] || [];
    if (fields.length) {
      const def = (d, k) => { const v = d?.[k]; return v !== null && v !== undefined ? v : "—"; };
      const rows = careerStats.map(cs => `
        <tr>
          <td><strong>${cs.season}</strong></td>
          ${fields.map(([k]) => `<td>${def(cs.data, k)}</td>`).join("")}
        </tr>`).join("");
      careerHtml = `
        <div class="modal-section">
          <div class="modal-section-title">Career Stats</div>
          <div style="overflow-x:auto">
            <table class="leaderboard-table">
              <thead><tr><th>Yr</th>${fields.map(([,l]) => `<th>${l}</th>`).join("")}</tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    }
  }

  return `
    ${headerHtml}
    <div class="modal-body">
      ${bioHtml}
      ${statSectionHtml}
      ${careerHtml}
      ${yoyHtml}
      ${shapHtml}
    </div>`;
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
