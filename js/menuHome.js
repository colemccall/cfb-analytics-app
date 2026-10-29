// menuHome.js — the home page: the whole league at a glance, and every row a link to the page you
// would want next. Top teams open a team's page, top players open a card, a game opens either team,
// a recruiting class or a transfer opens the team or the player, and each panel ends in the screen
// that holds the rest of it.
//
// It needs no team. A team you follow gets a strip at the top; without one the strip offers to follow.
// Every panel is built from files the menu already loads (teams, schedules, the to-date file) plus the
// small top-players, recruiting and transfer files, and a panel whose file failed says so instead of
// vanishing (the router also names the failed file).
//
// Must never contain: fetch calls or routing logic (links are data-to routes).
//
// Load order: after menuScreensClass.js (it uses the playoff field) and before menu start-up.

// The quick links along the top: the league screens, then the news and reference screens.
const MENU_HOME_LINKS = [
  ["Rankings", "#/rankings"], ["Standings", "#/standings"], ["Playoff", "#/playoff"], ["Players", "#/players"],
  ["All Teams", "#/team-select"], ["Recruiting", "#/recruiting"], ["Transfer Portal", "#/portal"],
  ["The Season", "#/season"], ["Research", "#/research"], ["How It Works", "#/guide"], ["Methods", "#/methods"],
];

// One panel: a heading, its rows, and (when given) a button to the screen that holds the rest.
function menuHomePanel(title, rows, more) {
  return `<section class="m-panel m-hp" aria-label="${_esc(title)}"><h3 class="m-h3">${_esc(title)}</h3>
      ${rows || '<p class="m-empty">Nothing to show for this season.</p>'}
      ${more ? `<button class="m-chip m-chip--more" type="button" data-nav data-nav-group="links" data-to="${more[1]}">${_esc(more[0])} →</button>` : ""}</section>`;
}

// A team row: rank, mark and name, record, power. The whole row opens the team's page.
function menuHomeTeamRow(t, i, d) {
  const st = d.standings[t.id];
  return `<button class="m-row m-row--mini" type="button" data-nav data-nav-group="hp-teams" data-to="${menuTeamPath(t.id)}">
      <span class="m-rank">${i}</span><span class="m-pname">${teamMark(t, "m-row-mark")} ${_esc(t.school)}</span>
      <span class="m-num">${st ? `${st.w}-${st.l}` : "—"}</span><span class="m-num">${menuPowerText(menuTeamPower(t, d))}</span></button>`;
}

// A player row: position, name, his team, rating. The whole row opens his card.
function menuHomePlayerRow(p, d) {
  const team = p.team_id != null ? d.teams.find(t => t.id === p.team_id) : d.teams.find(t => t.school === p.team);
  const pill = p.live ? livePill({ live_rating: p.rating, live_through_week: d.live && d.live.through_week, live_games: null })
                      : ovrPill(p.rating, { season: MENU.season, label: `Rating, ${MENU.season}` });
  return `<button class="m-row m-row--mini m-row--player-mini" type="button" data-nav data-nav-group="hp-players" data-to="${menuPlayerPath(p.id, team && team.id)}">
      <span class="m-pos">${posBadge(p.position_group)}</span><span class="m-pname">${_esc(p.name || "—")}</span>
      <span class="m-pmeta">${_esc(team ? team.school : p.team || "")}</span><span class="m-rating">${pill}</span></button>`;
}

// Every game in the season's schedules once, from the home side, as { id, week, date, type, home, away, hs, as,
// played } where home and away are { id, name } (id is null for a team of ours that does not exist: FCS).
function menuHomeGames(d) {
  const byId = new Map();
  const nameOf = id => (d.teams.find(t => String(t.id) === String(id)) || {}).school || null;
  for (const [tid, games] of Object.entries(d.schedules)) {
    for (const g of games) {
      if (byId.has(g.game_id) && !g.is_home) continue;
      const me = { id: Number(tid), name: nameOf(tid) };
      const opp = { id: (g.is_home ? g.away_team_id : g.home_team_id) ?? null, name: g.opponent };
      const home = g.is_home ? me : opp, away = g.is_home ? opp : me;
      byId.set(g.game_id, { id: g.game_id, week: g.week, date: g.game_date, type: g.season_type, home, away,
        hs: g.is_home ? g.team_score : g.opp_score, as: g.is_home ? g.opp_score : g.team_score, played: g.result === "W" || g.result === "L" });
    }
  }
  return [...byId.values()];
}

// A game row: the two teams as buttons to their pages (a team we do not rate is plain text) around the score
// or the date. A played game bolds the winner.
function menuHomeGameRow(g, d) {
  const side = (s, won) => {
    const t = s.id != null ? d.teams.find(x => x.id === s.id) : null;
    const label = t ? `${teamMark(t, "m-row-mark")} ${_esc(t.school)}` : _esc(s.name || "TBD");
    return t ? `<button class="m-gteam${won ? " is-won" : ""}" type="button" data-nav data-nav-group="hp-games" data-to="${menuTeamPath(t.id)}">${label}</button>`
             : `<span class="m-gteam${won ? " is-won" : ""}">${label}</span>`;
  };
  const mid = g.played ? `${g.as}–${g.hs}` : _esc(String(g.date || "").slice(5, 10));
  return `<div class="m-game">${side(g.away, g.played && g.as > g.hs)}<span class="m-gscore">${mid}</span>${side(g.home, g.played && g.hs > g.as)}</div>`;
}

// The two game panels: for a season in progress, last week's results and the coming week's games, the ones
// involving the best-ranked teams first; for a played season, its bowls and the playoff; before a season, its first week.
function menuHomeGamePanels(d) {
  const rank = new Map(d.teams.filter(t => menuTeamPower(t, d) != null).sort((a, b) => menuTeamPower(b, d) - menuTeamPower(a, d)).map((t, i) => [t.id, i + 1]));
  const best = g => Math.min(rank.get(g.home.id) ?? 999, rank.get(g.away.id) ?? 999);
  const pick = (list, n) => list.sort((a, b) => best(a) - best(b)).slice(0, n).map(g => menuHomeGameRow(g, d)).join("");
  const all = menuHomeGames(d);
  if (d.live) {
    const wk = d.live.through_week;
    return [menuHomePanel(`Week ${wk} results`, pick(all.filter(g => g.type === "regular" && g.week === wk && g.played), 7), null),
            menuHomePanel(`Up next · week ${wk + 1}`, pick(all.filter(g => g.type === "regular" && g.week === wk + 1 && !g.played), 7))];
  }
  const post = all.filter(g => g.type === "postseason" && g.played);
  if (post.length) return [menuHomePanel("Bowls and the playoff", pick(post, 10), ["Playoff picture", "#/playoff"])];
  return [menuHomePanel("Opening week", pick(all.filter(g => g.type === "regular" && g.week === 1), 8))];
}

// The strip for the team you follow (its page, roster and schedule), or an offer to follow one.
function menuHomeMyTeam(d) {
  const team = menuMyTeam(d);
  if (!team) {
    return `<section class="m-panel m-mystrip"><span class="m-note">Follow a team to keep it here.</span>
      <button class="m-chip" type="button" data-nav data-nav-group="links" data-to="#/team-select">Pick a team →</button></section>`;
  }
  const st = d.standings[team.id], rank = menuTeamRank(team, d);
  const next = menuNextGame(d.schedules[String(team.id)]);
  return `<section class="m-panel m-mystrip" style="--m-team:${_esc(team.color || "")}">
      <button class="m-chip m-chip--lead" type="button" data-nav data-nav-group="links" data-to="${menuTeamPath(team.id)}">${teamMark(team, "m-row-mark")} <b>${_esc(team.school)}</b></button>
      <span>${st ? recordText(st) : "No results yet"}</span><span>${rank != null ? `Rank #${rank}` : ""}</span>
      <span>${next ? `Next: ${next.is_home ? "vs" : "@"} ${_esc(next.opponent || "TBD")}` : ""}</span>
      <button class="m-chip" type="button" data-nav data-nav-group="links" data-to="${menuTeamPath(team.id, "roster")}">Roster</button>
      <button class="m-chip" type="button" data-nav data-nav-group="links" data-to="${menuTeamPath(team.id, "schedule")}">Schedule</button></section>`;
}

menuRouter.register("home", {
  title: "Home",
  crumb: () => "HOME",
  banner: false,
  prompts: [{ action: "move", label: "Move" }, { action: "select", label: "Open" }, { action: "season", label: "Season" }],
  async render(ctx) {
    const season = MENU.season;
    const d = await menuTeams(season);
    const [players, recruiting, transfers] = await Promise.all([fetchTopPlayers(season), fetchRecruiting(season), fetchLeagueTransfers(season)]);
    ctx.d = d; ctx.team = null;
    const ranked = d.teams.filter(t => menuTeamPower(t, d) != null).sort((a, b) => menuTeamPower(b, d) - menuTeamPower(a, d));
    const topTeams = menuHomePanel(`Top 10 · ${season}`, ranked.slice(0, 10).map((t, i) => menuHomeTeamRow(t, i + 1, d)).join(""), ["Full rankings", "#/rankings"]);
    const topPlayers = menuHomePanel("Top players", [...players].sort((a, b) => b.rating - a.rating).slice(0, 10).map(p => menuHomePlayerRow(p, d)).join(""), ["All players", "#/players"]);
    const field = menuPlayoffField(d, "12");
    const playoff = menuHomePanel("Playoff picture · 12 teams", field.slice(0, 8).map(f => `
      <button class="m-row m-row--mini" type="button" data-nav data-nav-group="hp-po" data-to="${menuTeamPath(f.team.id)}">
        <span class="m-rank">${f.seed}</span><span class="m-pname">${teamMark(f.team, "m-row-mark")} ${_esc(f.team.school)}${f.why ? ` <span class="m-tag m-tag--c">${_esc(f.why.toUpperCase())}</span>` : ""}</span>
        <span class="m-num">${menuPowerText(menuTeamPower(f.team, d))}</span></button>`).join(""), ["Full bracket", "#/playoff"]);
    const movers = d.live ? [...d.live.teams].filter(t => t.change != null).sort((a, b) => b.change - a.change) : [];
    const moverRow = t => {
      const team = d.teams.find(x => x.id === t.team_id);
      return team ? `<button class="m-row m-row--mini" type="button" data-nav data-nav-group="hp-movers" data-to="${menuTeamPath(team.id)}">
        <span class="m-pname">${teamMark(team, "m-row-mark")} ${_esc(team.school)}</span><span class="m-num">${deltaChip(t.change)}</span></button>` : "";
    };
    const moversPanel = movers.length ? menuHomePanel("Rating movers · to date vs preseason", [...movers.slice(0, 4), ...movers.slice(-4).reverse()].map(moverRow).join(""), ["Rankings", "#/rankings"]) : "";
    const classes = recruiting ? recruiting.teams.filter(t => t.class_rank != null).sort((a, b) => a.class_rank - b.class_rank).slice(0, 5) : [];
    const recruitPanel = menuHomePanel(`Recruiting classes · ${season}`, classes.map(c => {
      const team = d.teams.find(x => x.id === c.team_id);
      return `<button class="m-row m-row--mini" type="button" data-nav data-nav-group="hp-rec" data-to="${menuTeamPath(c.team_id, "recruiting")}">
        <span class="m-rank">${c.class_rank}</span><span class="m-pname">${team ? teamMark(team, "m-row-mark") + " " : ""}${_esc(c.team)}</span>
        <span class="m-num">${c.five_stars}/${c.four_stars} 5★/4★</span></button>`;
    }).join(""), ["All classes", "#/recruiting"]);
    const moves = leagueTransferRows(transfers).sort((a, b) => ((b.ovr_current ?? b.ovr_previous ?? -1) - (a.ovr_current ?? a.ovr_previous ?? -1))).slice(0, 5);
    const portalPanel = menuHomePanel(`Transfer portal · ${season}`, moves.map(m => `
      <button class="m-row m-row--mini" type="button" data-nav data-nav-group="hp-portal"${m.player_id ? ` data-to="${menuPlayerPath(m.player_id)}"` : ""}>
        <span class="m-pos">${m.position_group ? posBadge(m.position_group) : ""}</span><span class="m-pname">${_esc(m.name || "—")}</span>
        <span class="m-pmeta">${_esc(m.from_school || "—")} → ${_esc(m.to_school || "—")}</span></button>`).join(""), ["Transfer portal", "#/portal"]);
    return `<div class="m-home">
      <div class="m-quick" role="navigation" aria-label="Screens">${MENU_HOME_LINKS.map(([label, to]) =>
        `<button class="m-item m-item--sm m-qbtn" type="button" data-nav data-nav-group="quick" data-to="${to}"><span class="m-item-label">${_esc(label)}</span></button>`).join("")}</div>
      ${menuHomeMyTeam(d)}
      <div class="m-home-grid">${topTeams}${topPlayers}${menuHomeGamePanels(d).join("")}${playoff}${moversPanel}${recruitPanel}${portalPanel}</div>
    </div>`;
  },
  prefer: () => ".m-hp .m-row",
});
