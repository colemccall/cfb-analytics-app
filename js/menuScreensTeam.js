// menuScreensTeam.js — the team screens of the menu: roster, depth chart and the
// player card.
//
// On a season being played every row carries three ratings — last season earned,
// the preseason projection, and earned to date — and every one of these screens
// shows all three through the same helpers the rest of the site uses (ui.js
// ratingTrioCells / ratingTrioStrip), so a number means the same thing everywhere.
// They are never merged: where one is missing the screen says why.
//
// Reads the roster and player files the site already ships; invents nothing. There
// is no class year, development trait or official depth data in any source, so none
// is drawn. The depth chart is the order the ratings imply, and says so.
//
// Must never contain: fetch calls or routing logic.
//
// Load order: after menuScreens.js.

// The rating a player is best summarised by right now: earned to date if he has one,
// else his projection, else last season's. Used only to ORDER a list and colour a
// row's edge — it is never shown as a single number.
function menuLeadRating(p) {
  // Earned this season outranks everything: any player with a to-date rating sorts above any
  // player without one, then the projection, then last season.
  if (p.live_rating != null) return 1000 + p.live_rating;
  return p.overall_rating ?? p.rating_prev ?? null;
}

// Ways the roster can be ordered. The alt button (X / Space) cycles through them and a click on a
// column heading picks one; `col` ties a sort to its heading.
const MENU_ROSTER_SORTS = [
  { id: "lead",  col: "",      label: "Best available", key: p => menuLeadRating(p) },
  { id: "live",  col: "live",  label: "To date",        key: p => p.live_rating },
  { id: "proj",  col: "proj",  label: "Projection",     key: p => p.overall_rating },
  { id: "prev",  col: "prev",  label: "Last season",    key: p => p.rating_prev },
  { id: "stars", col: "stars", label: "Recruit stars",  key: p => p.stars },
  { id: "class", col: "class", label: "Class",          key: p => p.class_year },
  { id: "ht",    col: "ht",    label: "Height",         key: p => p.height_in },
  { id: "wt",    col: "wt",    label: "Weight",         key: p => p.weight_lbs },
  { id: "pos",   col: "pos",   label: "Position",       key: p => p.position_group, text: true },
  { id: "name",  col: "name",  label: "Name",           key: p => p.name, text: true },
];
let _menuRosterSort = 0;

// Orders players by the chosen sort: numbers high to low with the missing ones last,
// names A to Z.
function menuSortPlayers(players, sort) {
  const rows = [...players];
  if (sort.text) return rows.sort((a, b) => String(sort.key(a) || "").localeCompare(String(sort.key(b) || "")));
  return rows.sort((a, b) => (sort.key(b) ?? -1) - (sort.key(a) ?? -1));
}

// The three rating cells for a row: [last season, projection, to date] on a season
// that carries them, else the single rating. Same pills as every other table.
function menuRatingCells(p, season) {
  if (hasTrio(p)) return ratingTrioCells(p, season).map(h => `<span class="m-rating">${h}</span>`);
  return [`<span class="m-rating">${ovrPill(p.overall_rating, { label: `Overall rating, ${season}`, season, why: menuNoRatingWhy(p, season) })}</span>`];
}

// Why a player has no rating for a season, in words, for a row without the three-ratings fields
// (a season already played). Said as what is known: an offensive lineman is withheld by design,
// anyone else has too few counted games on file. Empty when he has a rating.
function menuNoRatingWhy(p, season) {
  if (p.overall_rating != null) return "";
  if (p.rating_status === "not_rated" || p.position_group === "OL") return p.not_rated_reason || "Offensive linemen are not rated: no individual blocking data exists.";
  return `No earned rating for ${season}: no counted game on file (three games give a production rating; one or two give a small, capped adjustment to a recruiting-based start).`;
}

// ── Roster ────────────────────────────────────────────────────────────────

// Why a roster list is empty, in words: the file did not load, the team has no roster on file
// for the season, or only this filter matched nobody. `filtered` is the message for the last.
function menuEmptyRosterWhy(all, team, filtered) {
  if (all.length) return filtered;
  if (dataFailed(`rosters_${MENU.season}.json`)) return "The roster file did not load. Use Retry.";
  return `No roster is on file for ${team ? team.school : "this team"} in ${MENU.season}.`;
}

// The position tabs: everyone, then each position group the site filters by.
function _menuPositionTabs() {
  return ["ALL", ...CONFIG.FILTER_POSITIONS].map(p => ({ id: p, label: p }));
}

// A height in inches as 6'2", or a dash.
function menuHeight(inches) {
  return inches ? `${Math.floor(inches / 12)}'${inches % 12}"` : "—";
}

// The strip above the roster table, in the manner of a roster editor's header: the selected
// player's position, name, class, hometown, size and stars on the left, and on the right the
// rating he is best known by now in a large box, with all three ratings small beneath it. The
// player card uses the same strip, larger: `opts.photo` puts his photo first and `opts.team`
// adds a button to his team's page under his name.
function menuRosterHead(p, season, opts = {}) {
  if (!p) return '<p class="m-empty">No players at this position.</p>';
  const lead = menuLeadRating(p);
  const leadVal = p.live_rating ?? p.overall_rating ?? p.rating_prev;
  const leadCap = p.live_rating != null ? "TO DATE" : p.overall_rating != null ? (isProjectedSeason(season) ? "PROJ" : "OVR") : p.rating_prev != null ? String(season - 1) : "";
  const teamBtn = opts.team ? `<button class="m-chip" type="button" data-nav data-nav-group="links" data-to="${menuTeamPath(opts.team.id)}">${teamMark(opts.team, "m-row-mark")} ${_esc(opts.team.school)}</button>` : "";
  return `<div class="m-rhead${opts.photo ? " m-rhead--card" : ""}">
      ${opts.photo || ""}
      <div class="m-rhead-pos">${posBadge(p.position_group)}</div>
      <div class="m-rhead-name"><b>${opts.hs ? menuAvatar(p.player_id ?? p.id, p.name, opts.hs) : ""}${_esc(p.name || "—")}</b><span>${p.stars ? "★".repeat(p.stars) + " recruit" : "unranked recruit"}</span>${teamBtn}</div>
      <dl class="m-rhead-facts">
        <div><dt>CLASS</dt><dd>${classYearLabel(p.class_year)}</dd></div>
        <div><dt>HEIGHT</dt><dd>${menuHeight(p.height_in)}</dd></div>
        <div><dt>WEIGHT</dt><dd>${p.weight_lbs ? p.weight_lbs + " lb" : "—"}</dd></div>
        <div><dt>FROM</dt><dd>${_esc(p.hometown_state || "—")}</dd></div>
      </dl>
      <div class="m-rhead-ovr" title="${_esc(lead == null ? "No rating yet" : "")}">
        <span class="m-rhead-cap">${leadCap}</span><b>${leadVal == null ? "—" : Math.round(leadVal)}</b>
        ${hasTrio(p) ? `<span class="m-rhead-trio">${ratingTrioCells(p, season).join("")}</span>` : ""}
      </div>
    </div>`;
}

menuRouter.register("roster", {
  title: ctx => (ctx.team ? ctx.team.school : "Roster"),
  crumb: () => "TEAM › ROSTER",
  prompts: () => [{ action: "move", label: "Move" }, { action: "select", label: "Player card" },
                  { action: "tabs", label: "Position" }, { action: "alt", label: `Sort: ${MENU_ROSTER_SORTS[_menuRosterSort].label}` },
                  { action: "back", label: "Back" }],
  tabs: ctx => ({ items: _menuPositionTabs(), active: ctx.params[0] || "ALL",
                  go: id => menuRouter.go(menuTeamPath(ctx.route.teamId, "roster", id)) }),
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const team = menuViewTeam(ctx, d);
    ctx.team = team; ctx.d = d;
    const pos = ctx.params[0] || "ALL";
    const all = team ? await fetchTeamRoster(team.id, MENU.season) : [];
    const none = menuEmptyRosterWhy(all, team, "No players at this position.");
    ctx.hs = await fetchHeadshots();
    const list = all.filter(p => pos === "ALL" || matchesPosition(p.position_group, pos));
    const sort = MENU_ROSTER_SORTS[_menuRosterSort];
    const sorted = menuSortPlayers(list, sort);
    ctx.players = sorted;
    const trio = all.some(hasTrio);
    const head = (col, label, cls = "") => `<button class="m-th${cls}${sort.col === col ? " is-sorted" : ""}" type="button" tabindex="-1" data-col="${col}">${label}${sort.col === col ? " ▾" : ""}</button>`;
    const ratingHeads = trio
      ? [head("prev", MENU.season - 1, " m-th--c"), head("proj", "PROJ", " m-th--c"), head("live", "LIVE", " m-th--c")].join("")
      : head("proj", "OVR", " m-th--c");
    const rows = sorted.map((p, i) => `
      <button class="m-row m-row--roster${trio ? " is-trio" : ""}" type="button" data-nav data-nav-group="roster" data-pid="${p.player_id}" data-to="${menuPlayerPath(p.player_id, team && team.id)}">
        <span class="m-rank">${i + 1}</span>
        <span class="m-pname">${menuAvatar(p.player_id, p.name, ctx.hs)}${_esc(p.name || "—")}</span>
        <span class="m-pos">${posBadge(p.position_group)}</span>
        <span class="m-num">${classYearLabel(p.class_year)}</span>
        <span class="m-num">${menuHeight(p.height_in)}</span>
        <span class="m-num">${p.weight_lbs || "—"}</span>
        <span class="m-num">${_esc(p.hometown_state || "—")}</span>
        <span class="m-pmeta">${p.stars ? "★".repeat(p.stars) : ""}</span>
        ${menuRatingCells(p, MENU.season).join("")}
      </button>`).join("");
    return `<section class="m-panel m-list m-roster" aria-label="Roster">
        <div id="m-rhead">${menuRosterHead(sorted[0], MENU.season, { hs: ctx.hs })}</div>
        <div class="m-rowhead m-row--roster${trio ? " is-trio" : ""}"><span>#</span>${head("name", "PLAYER")}${head("pos", "POS")}${head("class", "CL")}${head("ht", "HT")}${head("wt", "WT")}<span>ST</span>${head("stars", "★")}${ratingHeads}</div>
        <div class="m-rbody">${rows || `<p class="m-empty">${_esc(none)}</p>`}</div>
      </section>
    <p class="m-foot">${sorted.length} player${sorted.length === 1 ? "" : "s"} · sorted by ${sort.label.toLowerCase()} · ${trio
      ? `${MENU.season - 1} is earned, PROJ is the preseason projection, LIVE is earned so far (provisional). Click a heading to sort.`
      : "Ratings shown are for the season viewed. Click a heading to sort."}</p>`;
  },
  mount(stage, ctx) {
    menuWirePhoto(stage);
    const head = stage.querySelector("#m-rhead");
    const byId = new Map(ctx.players.map(p => [String(p.player_id), p]));
    // The strip follows the selection, whether it moves by mouse, key or stick.
    stage.addEventListener("menu:select", e => {
      const p = byId.get(e.target.closest?.("[data-pid]")?.dataset.pid);
      if (p) { head.innerHTML = menuRosterHead(p, MENU.season, { hs: ctx.hs }); menuWirePhoto(head); }
    });
    stage.querySelectorAll(".m-th[data-col]").forEach(b => b.addEventListener("click", () => {
      const i = MENU_ROSTER_SORTS.findIndex(x => x.col === b.dataset.col);
      if (i >= 0) { _menuRosterSort = i; menuRouter.render(); }
    }));
    ctx.cleanups.push(menuInput.on("alt", () => {
      _menuRosterSort = (_menuRosterSort + 1) % MENU_ROSTER_SORTS.length;
      menuRouter.render();
      return true;
    }));
  },
});

// ── Depth chart ──────────────────────────────────────────────────────────

menuRouter.register("depth", {
  title: ctx => (ctx.team ? ctx.team.school : "Depth Chart"),
  crumb: () => "TEAM › DEPTH CHART",
  prompts: [{ action: "move", label: "Move" }, { action: "select", label: "Player card" },
            { action: "tabs", label: "Unit" }, { action: "back", label: "Back" }],
  tabs: ctx => ({ items: Object.keys(DEPTH_SLOTS).map(u => ({ id: u, label: u })),
                  active: ctx.params[0] || "Offense", go: id => menuRouter.go(menuTeamPath(ctx.route.teamId, "depth", id)) }),
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const team = menuViewTeam(ctx, d);
    ctx.team = team; ctx.d = d;
    const unit = decodeURIComponent(ctx.params[0] || "Offense");
    const players = team ? await fetchTeamRoster(team.id, MENU.season) : [];
    const none = menuEmptyRosterWhy(players, team, "No players in this unit.");
    ctx.hs = await fetchHeadshots();
    const trio = players.some(hasTrio);
    const groups = (DEPTH_SLOTS[unit] || []).filter(([g]) => players.some(p => (p.position_group || p.position) === g));
    const cards = groups.map(([g, n]) => {
      const rows = players.filter(p => (p.position_group || p.position) === g).sort(_depthOrder);
      const unrated = rows.length && rows.every(p => menuLeadRating(p) == null);
      const list = rows.slice(0, n).map((p, i) => `
        <button class="m-drow${trio ? " is-trio" : ""}" type="button" data-nav data-nav-group="depth-${g}" data-pid="${p.player_id}" data-to="${menuPlayerPath(p.player_id, team && team.id)}">
          <span class="m-slot">${i + 1}</span><span class="m-pname">${menuAvatar(p.player_id, p.name, ctx.hs)}${_esc(p.name || "—")}</span>
          ${menuRatingCells(p, MENU.season).join("")}
        </button>`).join("");
      return `<section class="m-panel m-group"><div class="m-group-head">${posBadge(g)}<span>${rows.length} on roster${unrated ? " · not rated" : ""}</span></div>${list}</section>`;
    }).join("");
    return `<div class="m-groups">${cards || `<p class="m-empty">${_esc(none)}</p>`}</div>
      <p class="m-foot"><b>Not an official depth chart.</b> No source we hold has depth data, so each group is in the order of its
      ratings (best available first). Offensive linemen are not rated, so they are ordered by recruiting grade.</p>`;
  },
  mount(stage) { menuWirePhoto(stage); },
});

// ── Player card ──────────────────────────────────────────────────────────

// Why a card has no stat tables, in words: a stated reason rather than a bare empty box. A career
// file that failed to load is said first: otherwise the reason would claim no stats exist.
function menuNoStatsWhy(p) {
  if (dataFailed(playerCardFile(p.id ?? p.player_id))) return "His career file did not load, so his stats cannot be shown. Use Retry.";
  if (p.rating_status === "not_rated") return p.not_rated_reason || "Offensive linemen are not rated and have no box-score stats.";
  if (p.live_status === "no_games") return "No game is recorded for him this season yet.";
  if (p.live_status === "too_few_games") return `Only ${p.live_games ?? "a few"} game(s) recorded so far: not enough for a rating, and no stat line is on file.`;
  return "No stats are recorded for him in this season's data.";
}

// The three sections of a player card, switched with the tab strip (LB / RB).
const MENU_CARD_TABS = [{ id: "overview", label: "Overview" }, { id: "stats", label: "Stats" }, { id: "career", label: "Career" }];

// The tabs for the season on screen: a season with game logs (CONFIG.GAMELOG_SEASONS) adds Games, between Overview and Stats.
function menuCardTabs() {
  return CONFIG.GAMELOG_SEASONS.includes(MENU.season)
    ? [MENU_CARD_TABS[0], { id: "games", label: "Games" }, ...MENU_CARD_TABS.slice(1)] : MENU_CARD_TABS;
}

menuRouter.register("player", {
  title: ctx => ctx.player?.name || "Player",
  crumb: () => "PLAYER",
  prompts: [{ action: "move", label: "Move" }, { action: "select", label: "Open" }, { action: "tabs", label: "Section" }, { action: "back", label: "Back" }],
  tabs: ctx => ({ items: menuCardTabs(), active: menuCardTabs().some(t => t.id === ctx.params[2]) ? ctx.params[2] : "overview",
                  go: id => menuRouter.go(`#/player/${ctx.params[0]}/${ctx.params[1] || 0}/${id}`) }),
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const pid = parseInt(ctx.params[0]);
    const tab = menuCardTabs().some(t => t.id === ctx.params[2]) ? ctx.params[2] : "overview";
    // His whole career is one small shard (cards/NNNN.json). null means that file failed, which is
    // not the same as "he has no ratings row": the card says which.
    const career = await fetchPlayerCard(pid);
    const rows = career || [];
    let p = rows.find(r => r.season === MENU.season) || null;
    // A rostered player with no ratings row this season (offensive line, or no projection and no
    // games) is read from the team roster so his card still opens, with the fields that row has and a
    // stated reason for the rest.
    if (!p) {
      const roster = await fetchTeamRoster(parseInt(ctx.params[1]) || MENU.teamId, MENU.season);
      const r = roster.find(x => x.player_id === pid);
      const t = r && d.teams.find(x => x.id === (parseInt(ctx.params[1]) || MENU.teamId));
      if (r) p = { ...r, id: r.player_id, team_id: t?.id, team: t?.school, conference: t?.conference, stats_season: null };
    }
    if (!p && rows.length) p = rows[rows.length - 1];     // a link to a season he has no row in: his latest season
    ctx.d = d;
    if (!p) {
      const failed = dataFailures().filter(f => f.file === playerCardFile(pid) || f.file === `rosters_${MENU.season}.json`);
      return menuErrorPanel(failed.length
        ? `His data did not load (${failed.map(f => `${f.file}: ${f.message}`).join(", ")}).`
        : `He is not on the ${MENU.season} roster and has no ratings row in any season.`, true);
    }
    ctx.player = p;
    const team = d.teams.find(t => t.id === p.team_id) || null;
    ctx.team = team;
    const season = p.season ?? MENU.season;
    const pg = p.position_group || "ATH";
    const trio = hasTrio(p);
    const moves = (await fetchPlayerTransfers())[String(pid)] || [];
    const hs = await fetchHeadshots();
    const careerFailed = career === null;
    const head = menuRosterHead(p, season, { photo: menuPhotoHtml(p, hs), team });
    const none = `<p class="m-empty">${_esc(menuNoStatsWhy(p))}</p>`;
    const failedNote = '<p class="m-empty">His career file did not load. Use Retry.</p>';
    let body;
    if (tab === "games") {
      body = `<section class="m-panel"><h3 class="m-h3">${season} game by game</h3>${season === MENU.season
        ? '<div id="m-games"><p class="m-empty">Loading…</p></div>' : `<p class="m-empty">Game-by-game stats are on file for ${MENU.season} only.</p>`}</section>`;
    } else if (tab === "stats") {
      const tables = menuStatTable(p);
      body = `<section class="m-panel"><h3 class="m-h3">${season} stats${trio && p.live_through_week ? ` · through week ${p.live_through_week}` : ""}</h3>
          <div class="m-stats">${tables || none}</div></section>`;
    } else if (tab === "career") {
      body = `<section class="m-panel m-career"><h3 class="m-h3">Career</h3>
          ${careerFailed ? failedNote : rows.length ? `${menuCareerTable(rows, pg)}${menuCareerGrid(rows) ? `<h3 class="m-h3">Career statistics by season</h3>${menuCareerGrid(rows)}` : ""}<p class="m-foot">Each season counts the regular season and the postseason together. Career totals sum the counts and recompute the rates.</p>` : '<p class="m-empty">No rated seasons on file for him.</p>'}</section>
        <section class="m-panel"><h3 class="m-h3">Rating history</h3>${careerFailed ? failedNote : menuRatingHistory(rows, p, season)}</section>`;
    } else {
      const tiles = menuKeyTiles(p, pg);
      body = `${trio ? ratingTrioStrip(p, season) : `<section class="m-panel"><div class="m-big">${ovrPill(p.overall_rating, { season, source: p.projection_source, why: menuNoRatingWhy(p, season) })}</div>${p.overall_rating == null ? `<p class="m-note">${_esc(menuNoRatingWhy(p, season))}</p>` : ""}</section>`}
        <div class="m-split m-split--card">
          <section class="m-panel"><h3 class="m-h3">${season} at a glance</h3><div class="m-stats">${tiles || none}</div>
            <button class="m-chip m-chip--more" type="button" data-nav data-nav-group="links" data-to="#/player/${pid}/${ctx.params[1] || 0}/stats">Every stat →</button></section>
          <section class="m-panel"><h3 class="m-h3">How this rating is built</h3>
            ${menuWhyBlock(p, rows)}
            <p class="m-note">${trio
              ? `<b>${season - 1}</b> is what he earned over a full season. <b>Projection</b> is a model's guess made before a game was played${p.projection_low != null ? `, with an 80% range of ${Math.round(p.projection_low)}–${Math.round(p.projection_high)}` : ""}. <b>To date</b> is what he has earned so far, scaled to a full season; it is provisional, and on one or two games it moves only a little from a recruiting-based start.`
              : "The rating is an earned one for the season shown: production, not talent."}</p></section>
        </div>
        ${CONFIG.WEEKLY_SEASONS.includes(season) && season === MENU.season ? '<section class="m-panel" id="m-weekly"><h3 class="m-h3">Week by week</h3><p class="m-empty">Loading…</p></section>' : ""}
        <section class="m-panel m-career"><h3 class="m-h3">Rating history</h3>${careerFailed ? failedNote : menuRatingHistory(rows, p, season)}
          <div class="m-linkrow">${team ? `<button class="m-chip" type="button" data-nav data-nav-group="links" data-to="${menuTeamPath(team.id)}">${teamMark(team, "m-row-mark")} ${_esc(team.school)} →</button>` : ""}
            <button class="m-chip" type="button" data-nav data-nav-group="links" data-to="#/players/${encodeURIComponent(pg)}">Best ${_esc(pg)} →</button></div></section>
        ${moves.length ? `<section class="m-panel"><h3 class="m-h3">Transfer path</h3>${menuTransferPath(moves, d.teams)}</section>`
          : dataFailed("player_transfers.json") ? '<section class="m-panel"><h3 class="m-h3">Transfer path</h3><p class="m-empty">The transfer file did not load. Use Retry.</p></section>' : ""}`;
    }
    return `<div class="m-card">${head}${body}</div>`;
  },
  mount(stage, ctx) {
    menuWirePhoto(stage);
    const weekly = stage.querySelector("#m-weekly");
    if (weekly) menuFillWeeklyPlayer(weekly, ctx.player, ctx.team, parseInt(ctx.params[0]));
    const games = stage.querySelector("#m-games");
    if (games) menuFillGames(games, ctx.player, ctx.team, parseInt(ctx.params[0]), ctx.player.position_group || "ATH");
  },
  prefer: () => ".m-chip",
});
