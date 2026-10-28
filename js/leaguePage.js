// leaguePage.js — the League hub: conference standings and the league-wide
// transfer portal.
//
// Both tabs are built in the browser from files the app already loads:
//   standings  schedules_{season}.json (every team's results) + the season's
//              conference membership (fetchTeams) — no standings file exists
//   portal     transfers_{season}.json, flattened to one row per transfer
//
// Must never contain: a fetch (dataLoader.js owns those), a formula for a rating
// (this page only displays ratings other scripts computed), or markup written by
// hand where ui.js has a primitive.
//
// Load order: config.js, shell.js (top) → dataLoader.js, ui.js, dataTable.js,
// then this file. initLeague() is called from league.html.

const LEAGUE_TABS = [
  { id: "standings", label: "Standings" },
  { id: "portal",    label: "Transfer Portal" },
];

// Seasons with a transfers_{season}.json; mirrored in CONFIG.TRANSFER_SEASONS and
// guarded by tests/test_frontend_config.py in the pipeline.
const _league = {
  tab: "standings",
  season: CONFIG.LAST_PLAYED_SEASON,
  pos: "ALL",
  query: "",
};

// Entry point for league.html. Reads ?tab= and ?season= (so every link the app
// emits lands where it says), draws the tab strip and renders the active tab.
// The theme repaint is bound once and re-renders from cache.
async function initLeague() {
  const params = new URLSearchParams(location.search);
  if (LEAGUE_TABS.some(t => t.id === params.get("tab"))) _league.tab = params.get("tab");
  const s = parseInt(params.get("season"));
  if (s >= CONFIG.FIRST_SEASON && s <= CONFIG.CURRENT_SEASON) _league.season = s;

  buildLeagueTabs();
  await renderLeagueTab();

  if (!initLeague._themeBound) {
    initLeague._themeBound = true;
    onThemeChange(() => renderLeagueTab());
  }
}

// Draws the tab strip and the season control that sits beside it. Season choices
// depend on the tab: the portal only has seasons with a transfers file.
function buildLeagueTabs() {
  const bar = document.getElementById("league-tabs");
  bar.innerHTML = LEAGUE_TABS.map(t =>
    `<button class="tab${t.id === _league.tab ? " active" : ""}" data-tab="${t.id}" type="button">${_esc(t.label)}</button>`
  ).join("");
  bar.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
    _league.tab = btn.dataset.tab;
    _clampLeagueSeason();
    buildLeagueTabs();
    renderLeagueTab();
  }));
}

// A season that the active tab has no file for falls back to the newest one it has.
function _clampLeagueSeason() {
  if (_league.tab === "portal" && !CONFIG.TRANSFER_SEASONS.includes(_league.season)) {
    _league.season = CONFIG.TRANSFER_SEASONS[CONFIG.TRANSFER_SEASONS.length - 1];
  }
}

// Renders whichever tab is active into #league-body. Rebuilt from scratch each
// time, so a theme change or a control change can call it freely.
async function renderLeagueTab() {
  const body = document.getElementById("league-body");
  body.innerHTML = skeletonRows(6);
  if (_league.tab === "portal") await renderPortal(body);
  else await renderStandings(body);
}

// The season picker shared by both tabs. `seasons` is the list that tab can show.
// `tag(y)` is the suffix for a season: standings call a live season "in progress"
// (it has results), the portal calls it "projected" (its ratings are).
function _leagueSeasonSelect(seasons, tag = y => (isProjectedSeason(y) ? " (projected)" : "")) {
  const opts = seasons.map(y =>
    `<option value="${y}"${y === _league.season ? " selected" : ""}>${y}${tag(y)}</option>`).join("");
  return `<select id="league-season" title="Season">${opts}</select>`;
}

// ── Standings ────────────────────────────────────────────────────────────────

// Builds one standings row per team from its schedule. A game counts once it has
// a result and is not postseason. It is a CONFERENCE game when the opponent is an
// FBS team in the same conference that season; the schedule carries no conference
// flag, so this is derived, and independents get no conference record.
// Returns { team, w, l, cw, cl, pf, pa } keyed by team id.
function computeStandings(schedules, teams) {
  const byId = {};
  for (const t of teams) byId[t.id] = t;
  const out = {};
  for (const [tid, games] of Object.entries(schedules || {})) {
    const team = byId[tid];
    if (!team) continue;
    const r = out[tid] = { team, w: 0, l: 0, cw: 0, cl: 0, pf: 0, pa: 0 };
    for (const g of games) {
      if (g.season_type === "postseason" || (g.result !== "W" && g.result !== "L")) continue;
      const win = g.result === "W";
      r.w += win ? 1 : 0;  r.l += win ? 0 : 1;
      r.pf += g.team_score || 0;  r.pa += g.opp_score || 0;
      const oppId = String(g.home_team_id) === String(tid) ? g.away_team_id : g.home_team_id;
      const opp = byId[oppId];
      if (g.opp_is_fbs && opp && opp.conference && opp.conference === team.conference
          && team.conference !== "FBS Independents") {
        r.cw += win ? 1 : 0;  r.cl += win ? 0 : 1;
      }
    }
  }
  return out;
}

// Win percentage, 0 for a team with no games, so sorting never sees a NaN.
function _pct(w, l) { return w + l ? w / (w + l) : 0; }

// Draws every conference as its own banner and table, best record first. Teams
// are ordered by conference record, then overall record, then team rating.
async function renderStandings(body) {
  const season = _league.season;
  const [teams, schedules] = await Promise.all([fetchTeams(season), fetchSeasonSchedules(season)]);
  const standings = computeStandings(schedules, teams);
  const played = Object.values(standings).reduce((n, r) => n + r.w + r.l, 0);

  const seasons = [];
  for (let y = CONFIG.CURRENT_SEASON; y >= CONFIG.FIRST_SEASON; y--) seasons.push(y);
  const inProgress = y => (CONFIG.LIVE_SEASONS.includes(y) ? " (in progress)" : isProjectedSeason(y) ? " (projected)" : "");
  const controls = `<div class="filter-bar league-controls">${_leagueSeasonSelect(seasons, inProgress)}
    <span class="league-count">${played ? `${Math.round(played / 2).toLocaleString()} games with a result` : ""}</span></div>`;

  if (!played) {
    body.innerHTML = controls + emptyState(isProjectedSeason(season)
      ? `${season} has no results yet — standings appear once games are played.`
      : `No schedule results for ${season}.`);
    _bindLeagueSeason();
    return;
  }

  const byConf = {};
  for (const r of Object.values(standings)) (byConf[r.team.conference || "Other"] ||= []).push(r);
  const confs = Object.keys(byConf).sort((a, b) => a === "FBS Independents" ? 1 : b === "FBS Independents" ? -1 : a.localeCompare(b));

  body.innerHTML = controls + confs.map((c, i) => `
    <section class="league-conf">
      <div class="section-rule"><span class="eyebrow">${_esc(c.toUpperCase())}</span>
        <span class="section-rule-sub">${byConf[c].length} teams</span></div>
      <div id="standings-${i}"></div>
    </section>`).join("") + `<p class="table-footnote">Regular-season results only. A conference game is
      one against an FBS team in the same conference that season — derived from the schedule, which carries
      no conference flag, so a few late-realignment games may be filed as non-conference.
      Teams are ordered by conference record, then overall, then team rating. FBS independents have no conference record.
      A game with no score for the opponent (almost always a non-FBS opponent) is not counted, so a few records can be a game short.
      ${CONFIG.LIVE_SEASONS.includes(season) ? `For ${season}, <em>Team OVR</em> is the preseason projection; ratings earned on the games played are on the '26 Season page.` : ""}</p>`;
  _bindLeagueSeason();

  confs.forEach((c, i) => {
    const rows = byConf[c].slice().sort((a, b) =>
      _pct(b.cw, b.cl) - _pct(a.cw, a.cl) || _pct(b.w, b.l) - _pct(a.w, a.l)
      || (b.team.overall_rating || 0) - (a.team.overall_rating || 0));
    rows.forEach((r, k) => { r.rank = k + 1; });
    createDataTable(document.getElementById(`standings-${i}`), {
      rows,
      sort: { key: "rank", asc: true },
      columns: [
        { key: "rank", label: "#", num: true },
        { key: "team", label: "Team", sortVal: v => v.school,
          fmt: v => `${teamMark(v)}${teamLink(v.school, { season })}` },
        { key: "cw", label: "Conf", num: true, sortVal: (v, r) => _pct(r.cw, r.cl),
          fmt: (v, r) => c === "FBS Independents" ? "—" : `${r.cw}-${r.cl}` },
        { key: "w", label: "Overall", num: true, sortVal: (v, r) => _pct(r.w, r.l), fmt: (v, r) => `${r.w}-${r.l}` },
        { key: "pf", label: "PF", num: true },
        { key: "pa", label: "PA", num: true },
        { key: "ovr", label: "Team OVR", num: true, sortVal: (v, r) => r.team.overall_rating,
          fmt: (v, r) => ovrPill(r.team.overall_rating, { label: `Team OVR, ${season}`, season }) },
      ],
    });
  });
}

// ── Transfer portal ─────────────────────────────────────────────────────────

// Flattens a season's per-team transfer lists to one row per transfer. Every
// move appears once as "in" for its destination and once as "out" for its origin,
// so keeping only "in" counts each exactly once. Players leaving for no listed
// school (to_school null) appear on the out side only and are dropped here.
function leagueTransferRows(byTeam) {
  const rows = [];
  for (const list of Object.values(byTeam || {})) {
    for (const t of list) if (t.direction === "in") rows.push(t);
  }
  return rows;
}

// Draws the league-wide portal: a position filter, a name/school search and one
// sortable table of every move, with the rating before and after.
async function renderPortal(body) {
  _clampLeagueSeason();
  const season = _league.season;
  const rows = leagueTransferRows(await fetchLeagueTransfers(season));

  const posChips = ["ALL", ...CONFIG.FILTER_POSITIONS].map(p =>
    `<span class="pos-chip${_league.pos === p ? " active" : ""}" data-pos="${p}">${p}</span>`).join("");
  body.innerHTML = `<div class="filter-bar league-controls">${_leagueSeasonSelect(CONFIG.TRANSFER_SEASONS.slice().reverse())}
      <input id="league-query" type="search" placeholder="Search player or school…" value="${_esc(_league.query)}" aria-label="Search the portal">
      <span class="league-count" id="league-count"></span></div>
    <div class="pos-chips" id="league-pos">${posChips}</div>
    <div id="portal-table"></div>`;
  _bindLeagueSeason();

  const table = createDataTable(document.getElementById("portal-table"), {
    rows: [],
    sort: { key: "ovr_current", asc: false },
    maxRows: 300,
    empty: "No transfers match.",
    footnote: `One row per move, from the destination's side. <em>Before</em> is his rating the season before he moved
      and is blank for a player who had none; <em>Now</em> is his rating in ${season}${isProjectedSeason(season) ? " (a projection)" : ""}.
      Portal entries with no landing school are not listed.`,
    columns: [
      { key: "name", label: "Player", fmt: (v, r) => playerLink(r.player_id, v, { season }) },
      { key: "position_group", label: "Pos", fmt: v => posBadge(v) },
      { key: "from_school", label: "From", fmt: v => v ? teamLink(v, { season }) : '<span class="muted">—</span>' },
      { key: "to_school", label: "To", fmt: v => v ? teamLink(v, { season }) : '<span class="muted">—</span>' },
      { key: "ovr_previous", label: "Before", num: true,
        fmt: v => v == null ? "—" : ovrPill(v, { label: "Rating before the move" }) },
      { key: "ovr_current", label: "Now", num: true,
        fmt: v => v == null ? "—" : ovrPill(v, { label: `Rating, ${season}`, season }) },
      { key: "change", label: "Change", num: true, sortVal: (v, r) => r.change,
        fmt: v => deltaChip(v, { title: "Rating now minus rating before the move" }) },
      { key: "portal_date", label: "Entered", sortVal: v => v || "" , fmt: v => _esc(v || "—") },
    ],
  });

  // Filters re-run against the loaded rows; nothing refetches.
  const apply = () => {
    const q = _league.query.trim().toLowerCase();
    const shown = rows
      .filter(r => _league.pos === "ALL" || matchesPosition(r.position_group, _league.pos))
      .filter(r => !q || `${r.name} ${r.from_school || ""} ${r.to_school || ""}`.toLowerCase().includes(q))
      .map(r => ({ ...r, change: r.ovr_current != null && r.ovr_previous != null ? r.ovr_current - r.ovr_previous : null }));
    table.update(shown);
    document.getElementById("league-count").textContent = `${shown.length.toLocaleString()} of ${rows.length.toLocaleString()} moves`;
  };
  document.getElementById("league-pos").querySelectorAll(".pos-chip").forEach(chip => chip.addEventListener("click", () => {
    _league.pos = chip.dataset.pos;
    document.querySelectorAll("#league-pos .pos-chip").forEach(c => c.classList.toggle("active", c === chip));
    apply();
  }));
  document.getElementById("league-query").addEventListener("input", e => { _league.query = e.target.value; apply(); });
  apply();
}

// Wires the season picker to re-render the active tab. Bound after every render
// because each render replaces the <select>.
function _bindLeagueSeason() {
  const sel = document.getElementById("league-season");
  if (!sel) return;
  sel.addEventListener("change", () => {
    _league.season = parseInt(sel.value);
    renderLeagueTab();
  });
}
