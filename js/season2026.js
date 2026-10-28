// '26 Season hub — the season in progress: the preseason projection, and the games played so far.
//
// Every number here is either a counted fact (schedule, roster size) or a
// projection that says so. Projections come from script 16's source chain:
// career-curve model → cohort carry-forward → recruiting grade.
//
// Load order: config.js, shell.js (top) → dataLoader.js, ui.js, dataTable.js,
// then this file. initSeason2026() is called from season2026.html.

const SEASON = CONFIG.CURRENT_SEASON;
const PRIOR  = CONFIG.LAST_PLAYED_SEASON;

// Entry point for season2026.html. Loads the season's games once, builds
// the masthead facts, the 25 games to circle, projected top 25, movers,
// then the per-team picker. The theme repaint is bound
// once and re-renders the pill-bearing panels from cache.
async function initSeason2026() {
  const { games, firstDate } = await fetchSeasonGames(SEASON);

  buildSeasonMasthead(games, firstDate);
  buildLiveSection();
  buildCircleTable(games);
  buildProjectedTop25();
  buildMovers();
  await buildTeamPreview();

  // Rating pills are theme-computed; repaint from cache on a theme switch.
  if (!initSeason2026._themeBound) {
    initSeason2026._themeBound = true;
    onThemeChange(() => {
      fetchSeasonGames(SEASON).then(r => buildCircleTable(r.games));
      buildProjectedTop25();
      buildMovers();
    });
  }
}

// ── Masthead + counted facts ───────────────────────────────────────────────
function buildSeasonMasthead(games, firstDate) {
  const headlineEl = document.getElementById("s26-headline");
  const factsEl = document.getElementById("s26-facts");

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = firstDate ? Math.ceil((firstDate - today) / 86400000) : null;
  if (headlineEl) {
    headlineEl.textContent = days != null && days > 0
      ? `The ${SEASON} season starts in ${days} days.`
      : `The ${SEASON} season.`;
  }

  if (factsEl) {
    const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const lastDate = games.length ? games.reduce((m, g) => (g.date > m ? g.date : m), games[0].date) : null;
    factsEl.innerHTML = `
      <span>${games.length.toLocaleString()} FBS matchups scheduled</span>
      ${firstDate ? `<span>First kickoff ${fmt(firstDate)}</span>` : ""}
      ${lastDate ? `<span>Regular season through ${fmt(lastDate)}</span>` : ""}
      <a href="index.html">This week's storylines →</a>`;
  }
}

// ── Projected top 25 ───────────────────────────────────────────────────────
async function buildProjectedTop25() {
  const el = document.getElementById("s26-top25");
  if (!el) return;
  const teams = await fetchTeams(SEASON);
  const top = (teams || []).filter(t => t.overall_rating)
    .sort((a, b) => b.overall_rating - a.overall_rating)
    .slice(0, 25);
  if (!top.length) {
    el.innerHTML = emptyState(`No projected ${SEASON} team ratings — run scripts 16 then 10 --engine projected.`);
    return;
  }
  el.innerHTML = `<div class="rank-wall stagger-children">${top.map((t, i) => `
    <a class="rank-wall-item animate-up" href="${teamHref(t.school, SEASON)}">
      <span class="rank-num ${i < 4 ? "top3" : i < 12 ? "top10" : ""}">${i + 1}</span>
      ${teamMark(t)}
      <span class="rank-wall-name">${_esc(t.school)}</span>
      ${ovrPill(t.overall_rating, { label: `Projected ${SEASON} team OVR`, season: SEASON })}
    </a>`).join("")}</div>
    <p class="table-footnote">Projected team rating is built from each roster's projected players,
      weighted by position. It is not a prediction of record — game-by-game win probabilities
      arrive with the playoff model.</p>`;
}

// ── Biggest projected movers vs last season ────────────────────────────────
async function buildMovers() {
  const el = document.getElementById("s26-movers");
  if (!el) return;
  const [history, teams] = await Promise.all([_load("team_history.json"), fetchTeamsById()]);
  if (!history) { el.innerHTML = emptyState("Team history not available."); return; }

  const moves = [];
  for (const [tid, rows] of Object.entries(history)) {
    const now  = (rows || []).find(r => r.season === SEASON && r.overall_rating != null);
    const then = (rows || []).find(r => r.season === PRIOR  && r.overall_rating != null);
    const team = teams[tid];
    if (now && then && team) {
      moves.push({ team, now: now.overall_rating, then: then.overall_rating,
                   delta: now.overall_rating - then.overall_rating });
    }
  }
  if (!moves.length) { el.innerHTML = emptyState("No comparable seasons yet."); return; }
  moves.sort((a, b) => b.delta - a.delta);

  const row = m => ({
    school: m.team.school,
    team: m.team,
    then: m.then,
    now: m.now,
    delta: m.delta,
  });
  const rows = [...moves.slice(0, 8), ...moves.slice(-8)].map(row);

  createDataTable(el, {
    rows,
    sort: { key: "delta", asc: false },
    footnote: `Projected ${SEASON} team rating against what the team actually earned in ${PRIOR}.
      Movement is mostly roster turnover — who left, who arrived, and who is projected to develop.`,
    columns: [
      { key: "school", label: "Team", fmt: (v, r) => `
          ${teamMark(r.team)}
          ${teamLink(v, { season: SEASON })}` },
      { key: "then", label: `${PRIOR} actual`, num: true,
        fmt: v => ovrPill(v, { label: `Earned team OVR, ${PRIOR}` }) },
      { key: "now", label: `${SEASON} proj`, num: true,
        fmt: v => ovrPill(v, { label: `Projected team OVR, ${SEASON}`, season: SEASON }) },
      { key: "delta", label: "Change", num: true,
        fmt: v => deltaChip(v, { title: `Projected ${SEASON} vs actual ${PRIOR}` }) },
    ],
  });
}

// ── Earned to date ─────────────────────────────────────────────────────────
// The season's own games, rated so far. Everything else on this page is the
// preseason projection; this is the one section that is neither a projection nor
// a finished season, and it says which in its first line. Data is live_{season}.json
// (script 17), which is exported separately from players_{season}.json on purpose:
// a part-season rating must never share a file with an earned or a projected one.
async function buildLiveSection() {
  const el = document.getElementById("s26-live");
  if (!el) return;
  const [live, teamsById] = await Promise.all([fetchLive(SEASON), fetchTeamsById()]);
  const section = el.closest("section");
  if (!live) { if (section) section.style.display = "none"; return; }

  const v = live.validation?.by_position || [];
  const rho = v.map(r => r.spearman);
  const unscaled = live.validation?.summary?.median_ratio_unscaled;
  const paced = live.validation?.summary?.median_ratio_paced;
  const backtest = v.length ? `Back-test: in 2025, cut after week ${live.validation.summary.through_week}, an unscaled
      part-season EDGE ran ${Math.round((unscaled - 1) * 100)}% below its final value; rescaled to full-season pace it ran
      ${Math.round((1 - paced) * 100)}% above it at the median, and the week-${live.validation.summary.through_week} ranking agreed with the final one at
      Spearman ${Math.min(...rho).toFixed(2)} to ${Math.max(...rho).toFixed(2)} by position.` : "";

  el.innerHTML = `
    <div class="projected-notice">
      <span class="badge-live">TO DATE</span>
      <span>Through week ${live.through_week}: ${live.games_completed.toLocaleString()} of ${live.games_scheduled.toLocaleString()}
      regular-season games played. These ratings come from this season's games so far, rescaled to full-season pace, and they are
      <strong>provisional</strong>. ${live.players_rated.toLocaleString()} of ${live.players_on_rosters.toLocaleString()} rostered players
      have played enough to be rated yet; the rest are not shown here and keep their preseason projection below.
      <a href="methods.html#live-season">How these are built →</a></span>
    </div>
    <h3 class="live-sub">Teams</h3>
    <div id="s26-live-teams"></div>
    <h3 class="live-sub">Players</h3>
    <div class="pos-chips" id="s26-live-pos"></div>
    <div id="s26-live-players"></div>
    <p class="table-footnote">${backtest} Team ratings blend this season's SP+ with each roster's ratings, so a team can
      move on its schedule as well as its players. <em>Preseason</em> is the projection made before a game was played;
      <em>Change</em> is the difference, which includes the scale of the correction above.</p>`;

  createDataTable(document.getElementById("s26-live-teams"), {
    rows: live.teams.slice(0, 25).map((t, i) => ({ ...t, rank: i + 1 })),
    sort: { key: "rank", asc: true },
    columns: [
      { key: "rank", label: "#", num: true },
      { key: "school", label: "Team", fmt: (val, r) => `${teamMark(teamsById[r.team_id] || { school: val })}${teamLink(val, { season: SEASON })}` },
      { key: "wins", label: "Record", num: true, sortVal: (val, r) => r.wins / Math.max(1, r.wins + r.losses), fmt: (val, r) => `${r.wins}-${r.losses}` },
      { key: "overall_rating", label: "To date", num: true, fmt: val => ovrPill(val, { label: `Team OVR earned through week ${live.through_week}` }) },
      { key: "preseason_overall", label: "Preseason", num: true, fmt: val => val == null ? "—" : ovrPill(val, { label: "Preseason projected team OVR", season: SEASON }) },
      { key: "change", label: "Change", num: true, fmt: val => deltaChip(val, { title: "To date minus preseason" }) },
    ],
  });

  const groups = ["ALL", ...CONFIG.FILTER_POSITIONS];
  let pos = "ALL";
  const playerTable = createDataTable(document.getElementById("s26-live-players"), {
    rows: [], maxRows: 100, sort: { key: "overall_rating", asc: false }, empty: "No rated players for that position yet.",
    columns: [
      { key: "name", label: "Player", fmt: (val, r) => playerLink(r.player_id, val, { season: SEASON }) },
      { key: "position_group", label: "Pos", fmt: val => posBadge(val) },
      { key: "team", label: "Team", fmt: val => val ? teamLink(val, { season: SEASON }) : "—" },
      { key: "games_played", label: "Games", num: true },
      { key: "overall_rating", label: "To date", num: true, fmt: val => ovrPill(val, { label: `Rating earned through week ${live.through_week}` }) },
      { key: "preseason_overall", label: "Preseason", num: true, fmt: val => val == null ? "—" : ovrPill(val, { label: "Preseason projected rating", season: SEASON }) },
      { key: "change", label: "Change", num: true, fmt: val => deltaChip(val, { title: "To date minus preseason" }) },
    ],
  });
  const show = () => playerTable.update(live.players.filter(p => pos === "ALL" || matchesPosition(p.position_group, pos)));
  const bar = document.getElementById("s26-live-pos");
  bar.innerHTML = groups.map(g => `<span class="pos-chip${g === pos ? " active" : ""}" data-pos="${g}">${g}</span>`).join("");
  bar.querySelectorAll(".pos-chip").forEach(chip => chip.addEventListener("click", () => {
    pos = chip.dataset.pos;
    bar.querySelectorAll(".pos-chip").forEach(c => c.classList.toggle("active", c === chip));
    show();
  }));
  show();
}

// ── Per-team preview: schedule + projected roster strength ─────────────────
async function buildTeamPreview() {
  const select = document.getElementById("s26-team-select");
  const out = document.getElementById("s26-team-preview");
  if (!select || !out) return;

  const [schedules, teams, rosters] = await Promise.all([
    _load(`schedules_${SEASON}.json`),
    fetchTeamsById(),
    _load(`rosters_${SEASON}.json`),
  ]);
  if (!schedules) { out.innerHTML = emptyState(`No ${SEASON} schedule data.`); return; }

  const withSchedules = Object.keys(schedules)
    .map(tid => teams[tid])
    .filter(Boolean)
    .sort((a, b) => a.school.localeCompare(b.school));

  select.innerHTML = `<option value="">Pick a team…</option>` +
    withSchedules.map(t => `<option value="${t.id}">${_esc(t.school)}</option>`).join("");

  select.addEventListener("change", () => {
    const tid = select.value;
    if (!tid) { out.innerHTML = ""; return; }
    const team = teams[tid];
    const games = [...(schedules[tid] || [])].sort((a, b) =>
      (a.game_date || "9999") < (b.game_date || "9999") ? -1 : 1);
    const roster = (rosters?.[tid] || []).filter(p => p.overall_rating != null)
      .sort((a, b) => b.overall_rating - a.overall_rating);

    const scheduleRows = games.map(g => `
      <tr>
        <td class="text-muted">${g.week ? `Wk ${g.week}` : "—"}</td>
        <td class="text-muted">${g.game_date ? g.game_date.slice(5, 10) : "TBD"}</td>
        <td>${g.is_home ? "vs" : "@"}
          ${g.opponent
            // FCS opponents have no team page, so they are named but not linked
            // — previously they rendered as "TBD", which read as undecided.
            ? (g.opp_is_fbs
                ? teamLink(g.opponent, { season: SEASON })
                : `<span class="opp-nonfbs" title="Not an FBS team — no rating of ours">${_esc(g.opponent)}</span>`)
            : "TBD"}${g.neutral_site ? " <small>(N)</small>" : ""}</td>
      </tr>`).join("");

    const topRoster = roster.slice(0, 10).map(p => `
      <div class="preview-player">
        ${posBadge(p.position_group)}
        ${playerLink(p.player_id, p.name, { season: SEASON })}
        ${ovrPill(p.overall_rating, { label: `Projected ${SEASON} OVR`, season: SEASON })}
      </div>`).join("");

    out.innerHTML = `
      <div class="preview-grid">
        <div>
          <div class="modal-subsection-title">${_esc(team?.school || "")} — ${SEASON} schedule</div>
          <table class="data-table"><tbody>${scheduleRows}</tbody></table>
        </div>
        <div>
          <div class="modal-subsection-title">Projected roster — top 10 of ${roster.length}</div>
          <div class="stagger-children">${topRoster || emptyState("No projected players.")}</div>
          <p class="table-footnote">
            <a href="${teamHref(team?.school, SEASON)}">Full ${SEASON} roster, ratings and history →</a>
          </p>
        </div>
      </div>`;
  });
}

// ── The games to circle — ranked on projected ratings ──────────────────────
function buildCircleTable(games) {
  const container = document.getElementById("s26-circle");
  if (!container) return;

  const rows = games
    .filter(g => g.homeOvr && g.awayOvr)
    .sort((a, b) => b.quality - a.quality)
    .slice(0, 25)
    .map((g, i) => ({
      rank: i + 1,
      week: g.week,
      dateStr: g.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      dateVal: +g.date,
      matchup: `${teamLink(g.away.school, { season: SEASON })}
        <span class="slate-at">${g.neutral ? "vs" : "at"}</span>
        ${teamLink(g.home.school, { season: SEASON })}`,
      awayOvr: g.awayOvr,
      homeOvr: g.homeOvr,
      quality: g.quality,
    }));

  createDataTable(container, {
    rows,
    sort: { key: "rank", asc: true },
    footnote: `Quality = combined projected ${SEASON} team OVR, penalized for rating mismatch —
      an even heavyweight matchup outranks a lopsided one. Win probabilities and playoff
      leverage arrive with the prediction model.`,
    empty: `No ${SEASON} schedule data — run pipeline script 01 --year ${SEASON}, then 12.`,
    columns: [
      { key: "rank", label: "#", num: true,
        fmt: v => `<span class="rank-num ${v <= 3 ? "top3" : v <= 10 ? "top10" : ""}">${v}</span>` },
      { key: "week", label: "Wk", num: true },
      { key: "dateStr", label: "Date", sortVal: (v, r) => r.dateVal },
      { key: "matchup", label: "Matchup", fmt: v => v },
      { key: "awayOvr", label: "Away", num: true,
        fmt: v => ovrPill(v, { label: `Projected ${SEASON} team OVR`, season: SEASON }) },
      { key: "homeOvr", label: "Home", num: true,
        fmt: v => ovrPill(v, { label: `Projected ${SEASON} team OVR`, season: SEASON }) },
      { key: "quality", label: "Quality", num: true, title: "Combined OVR minus twice the rating gap",
        fmt: v => v.toFixed(1) },
    ],
  });
}
