// menuScreens.js — the menu's core screens: all teams and the team page, plus
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
  title: "All Teams",
  crumb: () => "LEAGUE › ALL TEAMS",
  banner: false,
  prompts: [{ action: "move", label: "Move" }, { action: "select", label: "Open team" },
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
      return `<button class="m-tile${t.id === MENU.teamId ? " is-mine" : ""}" type="button" data-nav data-nav-group="tiles" data-to="${menuTeamPath(t.id)}"
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
  },
  prefer: () => `[data-team="${MENU.teamId}"]`,
});

// ── Links: how one screen names another ─────────────────────────────────────
// Every team, player and ranking on every screen opens the page you would want next. A destination is
// written as a route in data-to (menuRouter turns an activation into a navigation), built by these.

// The team a team screen is about: the one in its route (#/team/52/...), else My Team, else null.
function menuViewTeam(ctx, d) {
  const id = ctx.route && ctx.route.teamId != null ? ctx.route.teamId : MENU.teamId;
  return d.teams.find(t => t.id === id) || null;
}

// A route to a team's page (no `sub`) or to one of its screens: roster, depth, schedule, recruiting,
// transfers, history. `rest` adds a tab, e.g. menuTeamPath(52, "roster", "QB").
function menuTeamPath(teamId, sub = "", ...rest) {
  return `#/team/${teamId}${sub ? "/" + sub : ""}${rest.length ? "/" + rest.map(encodeURIComponent).join("/") : ""}`;
}

// A route to a player's card. The team is only the roster the card falls back to for a player who has no
// ratings row, so it may be left out.
function menuPlayerPath(playerId, teamId = null) {
  return `#/player/${playerId}${teamId ? "/" + teamId : ""}`;
}

// A team named inside a panel, as a small button: its mark and name, opening its page.
function menuTeamChip(t) {
  return `<button class="m-chip" type="button" data-nav data-nav-group="links" data-to="${menuTeamPath(t.id)}">${teamMark(t, "m-row-mark")} ${_esc(t.school)}</button>`;
}

// ── Team page: any team ─────────────────────────────────────────────────────

// The right-hand panel of a team page: rating, offense and defense bars, record, national rank,
// conference and next game. The rank, conference and opponent are buttons to where they lead.
function menuTeamPanel(d, team) {
  const lv = d.liveById[team.id];
  const st = d.standings[team.id];
  const rank = menuTeamRank(team, d);
  const next = menuNextGame(d.schedules[String(team.id)]);
  const oppId = next ? (String(next.home_team_id) === String(team.id) ? next.away_team_id : next.home_team_id) : null;
  const opp = oppId != null ? d.teams.find(t => String(t.id) === String(oppId)) : null;
  const nextText = next ? `${next.is_home ? "vs" : "@"} ${next.opponent || "TBD"}` : "No game scheduled";
  const chip = (to, text) => `<button class="m-chip" type="button" data-nav data-nav-group="links" data-to="${to}">${text}</button>`;
  return `<section class="m-panel m-teamcard" aria-label="${_esc(team.school)}">
      <div class="m-preview-head" style="--m-team:${_esc(team.color || "")}">
        ${teamMark(team, "m-preview-mark")}
        <div><h2>${_esc(team.school)}</h2><div class="m-sub">${team.conference ? chip(`#/standings/${encodeURIComponent(team.conference)}`, _esc(team.conference)) : ""}</div></div>
      </div>
      <div class="m-facts">
        <span title="Regular season, then the postseason">${st ? `Record ${recordText(st)}` : "No results yet"}</span>
        ${rank != null ? chip("#/rankings", `Rank #${rank}`) : "<span>Unranked</span>"}
        ${lv ? `<span class="m-live">TO DATE · WK ${d.live.through_week}</span>` : isProjectedSeason(MENU.season) ? '<span class="m-proj">PROJECTED</span>' : ""}
      </div>
      ${menuBar("Overall", menuTeamOvr(team, d), lv ? "Earned to date" : "Team rating")}
      ${menuBar("Offense", menuSide(team, lv, "offense_rating"), menuSideHint(team, lv))}
      ${menuBar("Defense", menuSide(team, lv, "defense_rating"), menuSideHint(team, lv))}
      ${lv && team.overall_rating != null ? `<div class="m-note">Preseason projection ${Math.round(team.overall_rating)} → ${Math.round(lv.overall_rating)} so far</div>` : ""}
      <div class="m-next"><span class="m-next-label">NEXT GAME</span>
        ${opp ? chip(menuTeamPath(opp.id), `${_esc(nextText)} <small>${_esc(String(next.game_date || "").slice(0, 10))}</small>`)
              : `<span class="m-next-game">${_esc(nextText)}${next ? ` <small>${_esc(String(next.game_date || "").slice(0, 10))}</small>` : ""}</span>`}</div>
    </section>`;
}

// The rating a player is best summarised by right now, as a pill: earned to date if he has one, else his
// projection (a season being played) or his rating (a season played).
function menuLeadPill(p, season) {
  if (p.live_rating != null) return livePill(p);
  if (hasTrio(p) && p.overall_rating != null) return projPill(p, season);
  return ovrPill(p.overall_rating ?? p.rating_prev, { season, label: `Rating, ${season}` });
}

// Fills a team page's Top players panel from the roster file, after the page is already drawn: the six
// best by rating, each a button to his card. The roster is the heavy file, so the page does not wait for
// it, and a failure is said in the panel instead of leaving it on "Loading".
async function menuFillTopPlayers(el, team) {
  try {
    const roster = await fetchTeamRoster(team.id, MENU.season);
    const hs = await fetchHeadshots();
    if (!el.isConnected) return;
    const top = [...roster].filter(p => menuLeadRating(p) != null).sort((a, b) => menuLeadRating(b) - menuLeadRating(a)).slice(0, 6);
    if (!top.length) {
      el.innerHTML = `<h3 class="m-h3">Top players</h3><p class="m-empty">${_esc(menuEmptyRosterWhy(roster, team, "No rated players on this roster."))}</p>`;
      return;
    }
    el.innerHTML = `<h3 class="m-h3">Top players</h3>${top.map(p => `
      <button class="m-row m-row--pl" type="button" data-nav data-nav-group="top" data-to="${menuPlayerPath(p.player_id, team.id)}">
        <span class="m-pos">${posBadge(p.position_group)}</span><span class="m-pname">${menuAvatar(p.player_id, p.name, hs)}${_esc(p.name || "—")}</span>
        <span class="m-rating">${menuLeadPill(p, MENU.season)}</span></button>`).join("")}
      <button class="m-chip" type="button" data-nav data-nav-group="links" data-to="${menuTeamPath(team.id, "roster")}">Full roster →</button>`;
    menuWirePhoto(el);
  } catch (e) {
    if (el.isConnected) el.innerHTML = `<h3 class="m-h3">Top players</h3><p class="m-empty" role="alert">The roster did not load: ${_esc(e && e.message ? e.message : e)}. Open Roster to retry.</p>`;
  }
}

menuRouter.register("team", {
  title: ctx => (ctx.team ? ctx.team.school : "Team"),
  crumb: () => "TEAM",
  prompts: [{ action: "move", label: "Move" }, { action: "select", label: "Open" }, { action: "season", label: "Season" }],
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const team = menuViewTeam(ctx, d);
    ctx.team = team; ctx.d = d;
    if (!team) return menuErrorPanel(`That team is not in the ${MENU.season} list.`, true);
    const to = (label, route, hint) => `<button class="m-item" type="button" data-nav data-nav-group="team" data-to="${route}" data-hint="${_esc(hint)}"><span class="m-item-label">${label}</span></button>`;
    const mine = team.id === MENU.teamId;
    return `<div class="m-split m-split--hub">
      <nav class="m-panel m-menu" aria-label="${_esc(team.school)}">
        ${to("Roster", menuTeamPath(team.id, "roster"), "Every player, with last season, projection and to-date ratings.")}
        ${to("Depth Chart", menuTeamPath(team.id, "depth"), "Position groups ordered by the to-date rating. Not an official chart.")}
        ${to("Schedule", menuTeamPath(team.id, "schedule"), "Every game, byes, bowls, the result so far and what is next.")}
        ${to("Recruiting", menuTeamPath(team.id, "recruiting"), "The recruiting class, with a map of where the players come from.")}
        ${to("Transfers", menuTeamPath(team.id, "transfers"), "Players coming in and going out, with the rating before and after.")}
        ${to("History", menuTeamPath(team.id, "history"), "Every season: record, conference and ratings.")}
        <button class="m-item" type="button" data-nav data-nav-group="team" data-follow data-hint="${_esc(mine ? "Stop following this team." : "Follow this team: the home page shows it and the short menu entries open it.")}">
          <span class="m-item-label">${mine ? "Following ✓" : "Follow this team"}</span></button>
      </nav>
      <div class="m-stack">${menuTeamPanel(d, team)}
        <section class="m-panel" id="m-top"><h3 class="m-h3">Top players</h3><p class="m-empty">Loading…</p></section>
        ${CONFIG.WEEKLY_SEASONS.includes(MENU.season) ? '<section class="m-panel" id="m-weekly"><h3 class="m-h3">Week by week</h3><p class="m-empty">Loading…</p></section>' : ""}</div>
    </div>
    <div class="m-hint" id="m-hint"></div>`;
  },
  mount(stage, ctx) {
    menuMountHints(stage);
    const team = ctx.team;
    stage.querySelector("[data-follow]")?.addEventListener("click", () => {
      MENU.teamId = team.id === MENU.teamId ? null : team.id;
      menuSaveState();
      menuChrome.toast(MENU.teamId ? `${team.school} is now your team` : `No longer following ${team.school}`);
      menuRouter.render();
    });
    const top = stage.querySelector("#m-top");
    if (top) menuFillTopPlayers(top, team);       // not awaited: the roster is large
    const weekly = stage.querySelector("#m-weekly");
    if (weekly) menuFillWeeklyTeam(weekly, team, ctx.d);
  },
  prefer: () => ".m-item",
});

// Makes the hint line under a menu list follow the selection: each item carries its own data-hint.
function menuMountHints(stage) {
  const hint = stage.querySelector("#m-hint");
  stage.addEventListener("menu:select", e => {
    const it = e.target.closest && e.target.closest("[data-hint]");
    if (it && hint) hint.textContent = it.dataset.hint || "";
  });
}
