// menuScreens.js — the menu's core screens: team select and the Dynasty hub, plus
// the helpers every screen shares.
//
// Each screen is registered with menuRouter.register(id, def). render(ctx) returns
// the markup, mount(stage, ctx) wires it. Screens read the data files the rest of
// the site already ships (through dataLoader.js) and never invent a number: a rating
// is drawn with the same pills as the rest of the app, and anything the data does
// not hold is shown as unavailable.
//
// Team context ("My Team") is MENU.teamId; the season being viewed is MENU.season.
//
// Must never contain: fetch calls (dataLoader.js owns those) or routing logic.
//
// Load order: after menuRouter.js and leagueData.js, before menuScreensTeam.js and
// menuScreensLeague.js.

// ── Shared data ────────────────────────────────────────────────────────────

const _menuTeamsCache = {};

// The teams for the viewed season with their ratings, schedule results and — in a
// season being played — the earned-to-date rating. Cached per season: screens call
// this freely, and dataLoader serves the files from memory after the first fetch.
async function menuTeams(season) {
  if (!_menuTeamsCache[season]) {
    const [teams, schedules, live] = await Promise.all([
      fetchTeams(season), fetchSeasonSchedules(season), fetchLive(season),
    ]);
    const standings = computeStandings(schedules, teams);
    const liveById = {};
    for (const t of live?.teams || []) liveById[t.team_id] = t;
    _menuTeamsCache[season] = { teams, schedules, standings, live, liveById };
  }
  return _menuTeamsCache[season];
}

// The rating a team is best known by right now: earned to date when the season has
// that, else its (projected or earned) overall. Used to rank and to size a bar.
function menuTeamOvr(t, d) {
  const lv = d.liveById[t.id];
  return lv?.overall_rating ?? t.overall_rating ?? null;
}

// The number teams are RANKED by: power, in points per game above an average team. It combines the
// team rating (how good its players and stats are) with a results rating (what it has done against
// its schedule), so a team cannot sit above one that has beaten it on the field. Earned to date
// when the season is being played, else the season's own (a projected season has quality only).
function menuTeamPower(t, d) {
  return d.liveById[t.id]?.power_rating ?? t.live_power_rating ?? t.power_rating ?? null;
}

// A team's national rank by menuTeamPower, 1-based, or null if it has none.
function menuTeamRank(team, d) {
  const mine = menuTeamPower(team, d);
  if (mine == null) return null;
  return 1 + d.teams.filter(t => (menuTeamPower(t, d) ?? -1e9) > mine).length;
}

// Power as shown: a signed number of points, one decimal.
function menuPowerText(v) {
  return v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;
}

// A team's offense or defense rating for the bar, or null when there is none to show. Earned
// to date has a real split. A preseason projection does not: for a season not yet played the
// offense and defense numbers are the overall rating repeated (138 of 138 teams in 2026), so
// they are withheld rather than drawn as two identical bars that look like a measurement.
function menuSide(team, live, field) {
  if (live && live[field] != null) return live[field];
  const same = team[field] != null && team[field] === team.overall_rating
    && team.offense_rating === team.defense_rating;
  return same && isProjectedSeason(MENU.season) ? null : team[field];
}

// The tooltip for an offense or defense bar that menuSide withheld, so a dash says why.
function menuSideHint(team, live) {
  const withheld = !live && team.offense_rating != null && team.offense_rating === team.defense_rating
    && isProjectedSeason(MENU.season);
  return withheld ? "A preseason projection has no separate offense and defense rating" : "";
}

// A horizontal rating bar: label, a track filled to the rating in the tier colour,
// and the number. A missing value draws an empty track and a dash, not a zero.
function menuBar(label, value, hint = "") {
  const v = value == null ? null : Math.round(value);
  return `<div class="m-bar" title="${_esc(hint)}">
    <span class="m-bar-label">${_esc(label)}</span>
    <span class="m-bar-track"><i style="width:${v == null ? 0 : v}%;background:${v == null ? "transparent" : ratingColor(v)}"></i></span>
    <b class="m-bar-val">${v == null ? "—" : v}</b>
  </div>`;
}

// The team's next unplayed game from its schedule, or null: the first game with no
// result, in date order. The opponent is named; an FCS opponent has no team row.
function menuNextGame(games) {
  const open = (games || []).filter(g => g.result == null)
    .sort((a, b) => String(a.game_date || "9").localeCompare(String(b.game_date || "9")));
  return open[0] || null;
}

// The currently chosen team's row, or null.
function menuMyTeam(d) {
  return d.teams.find(t => t.id === MENU.teamId) || null;
}

// ── Team select ────────────────────────────────────────────────────────────

// Conferences present in the viewed season, in a stable order, for the tab strip.
function _menuConferences(teams) {
  const set = [...new Set(teams.map(t => t.conference).filter(Boolean))].sort((a, b) =>
    a === "FBS Independents" ? 1 : b === "FBS Independents" ? -1 : a.localeCompare(b));
  return ["All", ...set];
}

menuRouter.register("team-select", {
  title: "Select Team",
  crumb: () => "DYNASTY › TEAM SELECT",
  banner: false,
  prompts: [{ action: "move", label: "Move" }, { action: "select", label: "Choose team" },
            { action: "tabs", label: "Conference" }, { action: "season", label: "Season" }],
  tabs: ctx => {
    const conf = decodeURIComponent(ctx.params[0] || "All");
    const d = _menuTeamsCache[MENU.season];
    return d ? { items: _menuConferences(d.teams).map(c => ({ id: c, label: c === "FBS Independents" ? "Indep." : c })),
                 active: conf, go: id => menuRouter.go(`#/team-select/${encodeURIComponent(id)}`) } : null;
  },
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const conf = decodeURIComponent(ctx.params[0] || "All");
    const list = d.teams.filter(t => conf === "All" || t.conference === conf)
      .sort((a, b) => (menuTeamOvr(b, d) ?? 0) - (menuTeamOvr(a, d) ?? 0));
    ctx.list = list; ctx.d = d;
    const tiles = list.map(t => {
      const ovr = menuTeamOvr(t, d);
      return `<button class="m-tile${t.id === MENU.teamId ? " is-mine" : ""}" type="button" data-nav data-nav-group="tiles"
          style="--m-team:${_esc(t.color || "")}" data-team="${t.id}" aria-label="${_esc(t.school)}">
        ${teamMark(t, "m-tile-mark")}
        <span class="m-tile-name">${_esc(t.school)}</span>
        <span class="m-tile-ovr">${ovr == null ? "—" : Math.round(ovr)}</span>
      </button>`;
    }).join("");
    return `<div class="m-split">
      <section class="m-panel m-tilegrid" aria-label="Teams">${tiles || '<p class="m-empty">No teams.</p>'}</section>
      <aside class="m-panel m-preview" id="m-preview" aria-live="polite"></aside>
    </div>`;
  },
  mount(stage, ctx) {
    const d = ctx.d;
    const preview = stage.querySelector("#m-preview");
    // The preview follows the selection — hover, arrow keys or stick alike.
    const show = el => {
      const t = d.teams.find(x => x.id === parseInt(el?.dataset.team));
      if (!t) { preview.innerHTML = ""; return; }
      const lv = d.liveById[t.id];
      const st = d.standings[t.id];
      preview.innerHTML = `
        <div class="m-preview-head" style="--m-team:${_esc(t.color || "")}">
          ${teamMark(t, "m-preview-mark")}
          <div><h2>${_esc(t.school)}</h2><div class="m-sub">${_esc(t.conference || "")}</div></div>
        </div>
        ${menuBar("Overall", menuTeamOvr(t, d), lv ? "Earned to date" : "Team rating")}
        ${menuBar("Offense", menuSide(t, lv, "offense_rating"), menuSideHint(t, lv))}
        ${menuBar("Defense", menuSide(t, lv, "defense_rating"), menuSideHint(t, lv))}
        <div class="m-facts">
          <span>${st ? `Record ${recordText(st)}` : "No results yet"}</span>
          <span>Rank #${menuTeamRank(t, d) ?? "—"}</span>
          ${lv ? `<span class="m-live">TO DATE · WK ${d.live.through_week}</span>` : isProjectedSeason(MENU.season) ? '<span class="m-proj">PROJECTED</span>' : ""}
        </div>`;
    };
    stage.addEventListener("menu:select", e => show(e.target.closest?.("[data-team]")));
    stage.querySelectorAll("[data-team]").forEach(b => b.addEventListener("click", () => {
      MENU.teamId = parseInt(b.dataset.team);
      menuSaveState();
      menuChrome.toast(`${d.teams.find(t => t.id === MENU.teamId)?.school} is now your team`);
      menuRouter.go("#/hub");
    }));
  },
  prefer: () => `[data-team="${MENU.teamId}"]`,
});

// ── Dynasty hub: the home page ────────────────────────────────────────────

// What each hub tab lists. A row with `route` opens a menu screen; one with `href` opens a page.
// `team` rows need a team chosen. The Team tab is the drill-down into one team, the League tab is
// everything across teams, and the News tab is what is going on and how to read it.
function menuHubItems(tab, team) {
  if (tab === "league") return [
    { label: "Rankings",          route: "rankings",    hint: "The top 25 by power, with how each number is made." },
    { label: "Standings",         route: "standings",   hint: "Conference records, derived from the results." },
    { label: "All Teams",         route: "team-select", hint: "Every team: pick one to follow." },
    { label: "Players & Leaders", route: "players",     hint: "Every rated player, by position, with the full card." },
    { label: "Recruiting",        route: "recruiting",  hint: "Class rankings and the prospect board for the whole league." },
    { label: "Transfer Portal",   route: "portal",      hint: "Every move in the league, with the rating before and after." },
  ];
  if (tab === "news") return [
    { label: "Playoff Picture", route: "playoff",  hint: "Who would be in a 4, 8, 12 or 24-team playoff, as a bracket." },
    { label: "The Season",      route: "season",   hint: "The season in progress: movers and the best players to date." },
    { label: "Research",        route: "research", hint: "Findings, each with the table behind it." },
    { label: "How It Works",    route: "guide",    hint: "The guide to reading the app." },
    { label: "Methods",         route: "methods",  hint: "How every number is computed and what it cannot support." },
    { label: "Build Log",       route: "changes",  hint: "What changed, why, and what it cost." },
  ];
  return [
    { label: "Roster",          route: "roster",          hint: "Every player on the team, with last season, projection and to-date ratings." },
    { label: "Depth Chart",     route: "depth",           hint: "Position groups ordered by the to-date rating. Not an official chart." },
    { label: "Schedule",        route: "schedule",        hint: "Every game, byes, the result so far, and what is next." },
    { label: "Recruiting",      route: "team-recruiting", hint: "This team's recruiting class, with a map of where the players come from." },
    { label: "Transfers",       route: "team-portal",     hint: "Players coming in and going out, with the rating before and after." },
    { label: "Team History",    route: "team-history",    hint: "Every season: record, conference and ratings." },
    { label: "Switch Team",     route: "team-select",     hint: "Pick a different team to follow." },
  ];
}

menuRouter.register("hub", {
  title: ctx => ({ league: "League", news: "News" }[ctx.params[0]] || "Dynasty"),
  crumb: ctx => `DYNASTY › ${(ctx.params[0] || "team").toUpperCase()}`,
  prompts: [{ action: "move", label: "Move" }, { action: "select", label: "Select" }, { action: "tabs", label: "Team / League / News" },
            { action: "season", label: "Season" }],
  tabs: ctx => ({ items: [{ id: "team", label: "Team" }, { id: "league", label: "League" }, { id: "news", label: "News" }],
                  active: ctx.params[0] || "team", go: id => menuRouter.go(`#/hub/${id}`) }),
  async render(ctx) {
    const tab = ["league", "news"].includes(ctx.params[0]) ? ctx.params[0] : "team";
    const d = await menuTeams(MENU.season);
    const team = menuMyTeam(d);
    ctx.team = team; ctx.d = d; ctx.tab = tab;
    const items = menuHubItems(tab, team).map(it => `
      <button class="m-item" type="button" data-nav data-nav-group="hub" data-route="${it.route}" data-hint="${_esc(it.hint)}">
        <span class="m-item-label">${_esc(it.label)}</span></button>`).join("");
    return `<div class="m-split m-split--hub">
      <nav class="m-panel m-menu" aria-label="Dynasty menu">${items}</nav>
      ${tab === "league" ? menuHubLeaguePanel(d) : tab === "news" ? menuHubNewsPanel(d) : menuHubTeamPanel(d, team)}
    </div>
    <div class="m-hint" id="m-hint"></div>`;
  },
  mount: menuMountRouteItems,
  prefer: () => ".m-item",
});

// Wires a menu list: the hint line follows the selection and a click opens the item's route.
function menuMountRouteItems(stage) {
  const hint = stage.querySelector("#m-hint");
  stage.addEventListener("menu:select", e => {
    const it = e.target.closest?.("[data-route],[data-href]");
    if (it && hint) hint.textContent = it.dataset.hint || "";
  });
  stage.querySelectorAll("[data-route]").forEach(b => b.addEventListener("click", () => menuRouter.go(`#/${b.dataset.route}`)));
}

// ── Landing page: the whole league and the news, no team needed ─────────────

// The landing page's three menu groups. League and News are the hub's lists; Dynasty is the
// way into the team drill-down, one entry before a team is followed and two after.
function menuHomeGroups(team) {
  const dynasty = team
    ? [{ label: "My Team", route: "hub", hint: `${team.school}: roster, depth chart, schedule, recruiting, transfers and history.` },
       { label: "Switch Team", route: "team-select", hint: "Pick a different team to follow." }]
    : [{ label: "Follow a Team", route: "team-select", hint: "Pick a team to follow: its roster, depth chart, schedule, recruiting, transfers and history." }];
  return [
    { id: "league", title: "League", items: menuHubItems("league", team) },
    { id: "news", title: "News", items: menuHubItems("news", team) },
    { id: "dynasty", title: "Dynasty", items: dynasty },
  ];
}

// The Dynasty card's lead line: the followed team's record, rank and next game, or a note that
// following a team is optional.
function menuHomeTeamLine(d, team) {
  if (!team) return '<p class="m-note">Optional. Follow a team to get its own roster, depth chart, schedule and recruiting.</p>';
  const st = d.standings[team.id];
  const next = menuNextGame(d.schedules[String(team.id)]);
  const opp = next ? `${next.is_home ? "vs" : "@"} ${next.opponent || "TBD"}` : "No game scheduled";
  return `<div class="m-homeline" style="--m-team:${_esc(team.color || "")}">${teamMark(team, "m-row-mark")}
      <div><b>${_esc(team.school)}</b><small>${st ? recordText(st) : "No results yet"} · Rank #${menuTeamRank(team, d) ?? "—"}</small><small>Next: ${_esc(opp)}</small></div></div>`;
}

menuRouter.register("home", {
  title: "Home",
  crumb: () => "HOME",
  banner: false,
  prompts: [{ action: "move", label: "Move" }, { action: "select", label: "Select" }, { action: "season", label: "Season" }],
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const team = menuMyTeam(d);
    ctx.d = d; ctx.team = null;
    const card = g => `<nav class="m-panel m-group" aria-label="${_esc(g.title)}"><h3 class="m-h3">${_esc(g.title)}</h3>
        ${g.id === "dynasty" ? menuHomeTeamLine(d, team) : ""}
        ${g.items.map(it => `<button class="m-item m-item--sm" type="button" data-nav data-nav-group="home" data-route="${it.route}" data-hint="${_esc(it.hint)}">
          <span class="m-item-label">${_esc(it.label)}</span></button>`).join("")}</nav>`;
    return `<div class="m-home">
      <div class="m-home-groups">${menuHomeGroups(team).map(card).join("")}</div>
      <div class="m-home-live">${menuHubLeaguePanel(d, 8)}${menuHubNewsPanel(d)}</div>
    </div>
    <div class="m-hint" id="m-hint"></div>`;
  },
  mount: menuMountRouteItems,
  prefer: () => ".m-item",
});

// The right-hand panel of the Team tab: the followed team's rating, offense and defense, record,
// national rank and next game; or a prompt to pick a team.
function menuHubTeamPanel(d, team) {
  if (!team) return `<section class="m-panel m-teamcard"><p class="m-empty">No team chosen yet. Pick <b>Switch Team</b> to follow one.</p></section>`;
  const lv = d.liveById[team.id];
  const st = d.standings[team.id];
  const next = menuNextGame(d.schedules[String(team.id)]);
  const opp = next ? `${next.is_home ? "vs" : "@"} ${next.opponent || "TBD"}` : "";
  return `<section class="m-panel m-teamcard" aria-label="Your team">
      <div class="m-preview-head" style="--m-team:${_esc(team.color || "")}">
        ${teamMark(team, "m-preview-mark")}
        <div><h2>${_esc(team.school)}</h2><div class="m-sub">${_esc(team.conference || "")}</div></div>
      </div>
      <div class="m-facts">
        <span>${st ? `Record ${recordText(st)}` : "No results yet"}</span>
        <span>Rank #${menuTeamRank(team, d) ?? "—"}</span>
        ${lv ? `<span class="m-live">TO DATE · WK ${d.live.through_week}</span>` : ""}
      </div>
      ${menuBar("Overall", menuTeamOvr(team, d), lv ? "Earned to date" : "Team rating")}
      ${menuBar("Offense", menuSide(team, lv, "offense_rating"), menuSideHint(team, lv))}
      ${menuBar("Defense", menuSide(team, lv, "defense_rating"), menuSideHint(team, lv))}
      ${lv && team.overall_rating != null ? `<div class="m-note">Preseason projection ${Math.round(team.overall_rating)} → ${Math.round(lv.overall_rating)} so far</div>` : ""}
      <div class="m-next"><span class="m-next-label">NEXT GAME</span>
        <span class="m-next-game">${next ? `${_esc(opp)} <small>${_esc(String(next.game_date || "").slice(0, 10))}</small>` : "No game scheduled"}</span></div>
    </section>`;
}

// The League tab's panel: the ten highest-ranked teams by power, with record and rating
// (the landing page shows fewer, so it fits above the fold).
function menuHubLeaguePanel(d, n = 10) {
  const top = d.teams.filter(t => menuTeamPower(t, d) != null).sort((a, b) => menuTeamPower(b, d) - menuTeamPower(a, d)).slice(0, n);
  const rows = top.map((t, i) => `<div class="m-hrow"><span class="m-rank">${i + 1}</span><span class="m-pname">${teamMark(t, "m-row-mark")} ${_esc(t.school)}</span>
      <span class="m-num">${d.standings[t.id] ? `${d.standings[t.id].w}-${d.standings[t.id].l}` : "—"}</span><span class="m-num">${menuPowerText(menuTeamPower(t, d))}</span></div>`).join("");
  return `<section class="m-panel m-teamcard" aria-label="Top ten">
      <h2 class="m-detail-name">Top ${n === 10 ? "ten" : n} · ${MENU.season}</h2>
      <div class="m-hrow m-hrow--head"><span>#</span><span>TEAM</span><span>REC</span><span>POWER</span></div>
      ${rows || '<p class="m-empty">No ranked teams.</p>'}
      <p class="m-note">Ranked by power: team rating plus results, in points per game above an average team.</p>
    </section>`;
}

// The News tab's panel: where the season stands and the top of the playoff field.
function menuHubNewsPanel(d) {
  const field = menuPlayoffField(d, "12");
  const status = d.live ? `Through week ${d.live.through_week}: ${d.live.games_completed.toLocaleString()} of ${d.live.games_scheduled.toLocaleString()} regular-season games played.`
    : isProjectedSeason(MENU.season) ? "A season not yet played: every rating is a projection." : "A finished season.";
  return `<section class="m-panel m-teamcard" aria-label="News">
      <h2 class="m-detail-name">${MENU.season} season</h2>
      <p class="m-note">${_esc(status)}</p>
      <h3 class="m-h3">12-team field, top four seeds</h3>
      ${field.slice(0, 4).map(f => `<div class="m-hrow"><span class="m-rank">${f.seed}</span><span class="m-pname">${teamMark(f.team, "m-row-mark")} ${_esc(f.team.school)}</span><span class="m-num">${d.standings[f.team.id] ? `${d.standings[f.team.id].w}-${d.standings[f.team.id].l}` : "—"}</span><span class="m-num">${menuPowerText(menuTeamPower(f.team, d))}</span></div>`).join("")}
      <p class="m-note">Open the Playoff Picture for the whole bracket.</p>
    </section>`;
}
