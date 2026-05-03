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

let _allPlayers = [];        // current page of results (from server)
let _filteredPlayers = [];   // client-side text/minRating filter applied to _allPlayers
let _activeFilters = { position: "ALL", conference: "", minRating: 0, query: "", season: CONFIG.CURRENT_SEASON };
let _fetchPending = false;

const OFF_POS = ["ALL", "QB", "RB", "WR", "TE", "OL"];
const DEF_POS = ["DL", "LB", "DB", "K", "P"];

// All known conferences — populated on first load
const _CONFERENCES = [
  "ACC","American Athletic","Big 12","Big Ten","Conference USA",
  "FBS Independents","Mid-American","Mountain West","Pac-12","SEC","Sun Belt",
];

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function initPlayerSearch() {
  buildPosChips();
  populateConferenceOptions();
  bindFilterEvents();
  await fetchAndRender();
}

async function fetchAndRender() {
  if (_fetchPending) return;
  _fetchPending = true;
  const grid = document.getElementById("player-grid");
  const { position, conference, season } = _activeFilters;
  grid.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    _allPlayers = await fetchPlayers({ season, position, conference, limit: 50 });
  } catch (e) {
    grid.innerHTML = `<p class="empty-state">Failed to load: ${e.message}</p>`;
    _fetchPending = false;
    return;
  }
  _fetchPending = false;
  applyClientFilters();
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
      fetchAndRender();
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
  _CONFERENCES.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    confSelect.appendChild(opt);
  });
}

// ---------------------------------------------------------------------------
// Filtering — server handles position+conference+season, client handles text+minRating
// ---------------------------------------------------------------------------

function applyClientFilters() {
  const { minRating, query } = _activeFilters;
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
  document.getElementById("filter-season")?.addEventListener("change", e => {
    _activeFilters.season = parseInt(e.target.value);
    fetchAndRender();
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
      <button class="modal-close">✕</button>
    </div>
    <div class="modal-loading">Fetching player data…</div>`;
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
  bindModalClose(modal);

  // Fetch profile + stats + history in parallel
  const [player, statsRows, ratingHistory, careerStats] = await Promise.all([
    fetchPlayerProfile(playerId, season).catch(() => null),
    fetchPlayerStats(playerId, season).catch(() => []),
    fetchPlayerRatingHistory(playerId).catch(() => []),
    fetchPlayerCareerStats(playerId).catch(() => []),
  ]);

  if (!player) {
    modal.querySelector(".modal-inner").innerHTML = `
      <div class="modal-header"><h2>Player not found</h2><button class="modal-close">✕</button></div>
      <div class="modal-loading">No rating data for this player in ${season}.</div>`;
    bindModalClose(modal);
    return;
  }

  const statsData = statsRows.length ? statsRows[0].data : null;
  modal.querySelector(".modal-inner").innerHTML = modalContentHtml(player, statsData, ratingHistory, careerStats, season);
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

function modalContentHtml(player, statsData, ratingHistory = [], careerStats = [], season) {
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
      <div class="modal-section-title">Season Stats (${season || CONFIG.CURRENT_SEASON})</div>
      <div class="stats-grid">${renderStatBlocks(stats, pg)}</div>
    </div>`;

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
}

// ---------------------------------------------------------------------------
// Rating breakdown — plain-English explanation of what drives the rating
// ---------------------------------------------------------------------------

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

  // Trajectory line
  const trajLine = player.trajectory && Math.abs(player.trajectory) > 0.5
    ? `<div class="breakdown-line"><span class="breakdown-icon">${player.trajectory > 0 ? "📈" : "📉"}</span><span>Rating ${player.trajectory > 0 ? "up" : "down"} <strong>${Math.abs(player.trajectory).toFixed(1)} points</strong> from last season</span></div>`
    : "";

  // Breakout line
  const breakoutLine = player.breakout_prob >= 0.35
    ? `<div class="breakdown-line"><span class="breakdown-icon">🔥</span><span><strong>Breakout candidate</strong> — young player with high recruiting pedigree below current production median (${(player.breakout_prob * 100).toFixed(0)}% probability)</span></div>`
    : "";

  // SHAP factor bars — normalized to % of total absolute influence
  let factorsHtml = "";
  if (shap) {
    const entries = Object.entries(shap)
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
        ${trajLine}
        ${breakoutLine}
        ${fallbackNote}
      </div>
      ${factorsHtml}
    </div>`;
}

function renderStatBlocks(stats, pg) {
  // Key names match what script 01 stores in the JSONB blob
  const fields = {
    QB: [["passingYDS","Pass Yds"],["passingTD","TDs"],["passingINT","INTs"],["passingCOMPLETIONS","Comp"],["passingATT","Att"],["passingYPA","YPA"],["rushingYDS","Rush Yds"]],
    RB: [["rushingYDS","Rush Yds"],["rushingTD","TDs"],["rushingCAR","Car"],["rushingYPC","YPC"],["receivingREC","Rec"],["receivingYDS","Rec Yds"]],
    WR: [["receivingYDS","Rec Yds"],["receivingTD","TDs"],["receivingREC","Rec"],["receivingYPR","YPR"],["rushingYDS","Rush Yds"]],
    TE: [["receivingYDS","Rec Yds"],["receivingTD","TDs"],["receivingREC","Rec"],["receivingYPR","YPR"]],
    OL: [],
    DL: [["defensiveTOT","Tackles"],["defensiveSACKS","Sacks"],["defensiveTFL","TFL"],["defensiveQB HUR","QB Hur"],["defensivePD","PDs"]],
    LB: [["defensiveTOT","Tackles"],["defensiveSACKS","Sacks"],["defensiveTFL","TFL"],["interceptionsINT","INTs"],["defensivePD","PDs"]],
    DB: [["defensiveTOT","Tackles"],["interceptionsINT","INTs"],["defensivePD","PDs"],["defensiveTFL","TFL"]],
    K:  [["kickingFGM","FGM"],["kickingFGA","FGA"],["kickingLNG","Long"],["kickingXPM","XPM"]],
    P:  [["puntingYDS","Yds"],["puntingNO","Punts"],["puntingIn 20","In 20"],["puntingYPP","Avg"]],
  };
  const cols = fields[pg] || [];
  if (!cols.length) return '<p class="text-muted" style="font-size:var(--fs-xs)">No individual stats tracked for this position.</p>';
  const blocks = cols.map(([key, label]) => {
    const val = stats[key];
    const display = val !== null && val !== undefined ? (typeof val === "number" ? (Number.isInteger(val) ? val : parseFloat(val).toFixed(1)) : val) : "—";
    return `<div class="stat-block"><span class="stat-val">${display}</span><span class="stat-label">${label}</span></div>`;
  }).join("");
  return blocks;
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
