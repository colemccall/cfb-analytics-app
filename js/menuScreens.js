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

// A team's national rank by menuTeamOvr, 1-based, or null if it has no rating.
function menuTeamRank(team, d) {
  const mine = menuTeamOvr(team, d);
  if (mine == null) return null;
  return 1 + d.teams.filter(t => (menuTeamOvr(t, d) ?? -1) > mine).length;
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
          data-team="${t.id}" aria-label="${_esc(t.school)}">
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
        ${menuBar("Offense", lv?.offense_rating ?? t.offense_rating)}
        ${menuBar("Defense", lv?.defense_rating ?? t.defense_rating)}
        <div class="m-facts">
          <span>${st ? `Record ${st.w}-${st.l}` : "No results yet"}</span>
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

// ── Dynasty hub ────────────────────────────────────────────────────────────

// The hub's options, in menu order. `route` is where each goes; an option whose
// screen is not registered yet shows as disabled with "Soon", so nothing on the hub
// is a dead link.
const MENU_HUB_ITEMS = [
  { id: "roster",     label: "Roster",          hint: "Every player on the team, with last season, projection and to-date ratings." },
  { id: "depth",      label: "Depth Chart",     hint: "Position groups in the order their ratings imply. Not an official chart." },
  { id: "schedule",   label: "Schedule",        hint: "Every game, the result so far, and what is next." },
  { id: "standings",  label: "Standings",       hint: "Conference records, derived from the results." },
  { id: "rankings",   label: "Rankings",        hint: "The top 25 by our team rating — earned to date and preseason." },
  { id: "recruiting", label: "Recruiting",      hint: "Class rankings and the prospect board." },
  { id: "portal",     label: "Transfer Portal", hint: "Every move, with the rating before and after." },
  { id: "team-select", label: "Switch Team",    hint: "Pick a different team to follow." },
  { id: "site",       label: "Main Site",       hint: "Leave the menu for the full analytics site: teams, players, ratings, methods.", href: "index.html" },
];

menuRouter.register("hub", {
  title: "Dynasty",
  crumb: () => "DYNASTY › HUB",
  prompts: [{ action: "move", label: "Move" }, { action: "select", label: "Select" },
            { action: "season", label: "Season" }],
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const team = menuMyTeam(d);
    ctx.team = team; ctx.d = d;
    const items = MENU_HUB_ITEMS.map(it => {
      const ready = !!menuScreens[it.id] || !!it.href;
      return `<button class="m-item" type="button" data-nav data-nav-group="hub" data-route="${it.id}" data-hint="${_esc(it.hint)}"${it.href ? ` data-href="${_esc(it.href)}"` : ""}
          ${ready ? "" : 'aria-disabled="true"'}>
        <span class="m-item-label">${_esc(it.label)}</span>${ready ? "" : '<span class="m-soon">Soon</span>'}
      </button>`;
    }).join("");
    const lv = team ? d.liveById[team.id] : null;
    const st = team ? d.standings[team.id] : null;
    const next = team ? menuNextGame(d.schedules[String(team.id)]) : null;
    const opp = next ? `${next.is_home ? "vs" : "@"} ${next.opponent || "TBD"}` : "";
    const movers = (d.live?.teams || []).filter(t => t.change != null)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5)
      .map(t => `<span class="m-tick">${_esc(t.school)} ${t.change > 0 ? "▲" : "▼"} ${Math.abs(t.change).toFixed(1)}</span>`).join("");
    return `<div class="m-split m-split--hub">
      <nav class="m-panel m-menu" aria-label="Dynasty menu">${items}</nav>
      <section class="m-panel m-teamcard" aria-label="Your team">
        ${team ? `
        <div class="m-preview-head" style="--m-team:${_esc(team.color || "")}">
          ${teamMark(team, "m-preview-mark")}
          <div><h2>${_esc(team.school)}</h2><div class="m-sub">${_esc(team.conference || "")}</div></div>
        </div>
        <div class="m-facts">
          <span>${st ? `Record ${st.w}-${st.l}` : "No results yet"}</span>
          <span>Rank #${menuTeamRank(team, d) ?? "—"}</span>
          ${lv ? `<span class="m-live">TO DATE · WK ${d.live.through_week}</span>` : ""}
        </div>
        ${menuBar("Overall", menuTeamOvr(team, d), lv ? "Earned to date" : "Team rating")}
        ${menuBar("Offense", lv?.offense_rating ?? team.offense_rating)}
        ${menuBar("Defense", lv?.defense_rating ?? team.defense_rating)}
        ${lv && team.overall_rating != null ? `<div class="m-note">Preseason projection ${Math.round(team.overall_rating)} → ${Math.round(lv.overall_rating)} so far</div>` : ""}
        <div class="m-next"><span class="m-next-label">NEXT GAME</span>
          <span class="m-next-game">${next ? `${_esc(opp)} <small>${_esc(String(next.game_date || "").slice(0, 10))}</small>` : "No game scheduled"}</span></div>` : ""}
      </section>
    </div>
    <div class="m-hint" id="m-hint"></div>
    ${movers ? `<div class="m-ticker" aria-label="Around the league"><span class="m-ticker-label">AROUND THE LEAGUE</span>${movers}</div>` : ""}`;
  },
  mount(stage) {
    const hint = stage.querySelector("#m-hint");
    stage.addEventListener("menu:select", e => {
      const it = e.target.closest?.("[data-route]");
      if (it) hint.textContent = it.dataset.hint || "";
    });
    stage.querySelectorAll("[data-route]").forEach(b => b.addEventListener("click", () => {
      if (b.getAttribute("aria-disabled") === "true") { menuChrome.toast("Coming soon"); return; }
      if (b.dataset.href) { window.location.href = b.dataset.href; return; }
      menuRouter.go(`#/${b.dataset.route}`);
    }));
  },
  prefer: () => '[data-route="roster"]',
});
