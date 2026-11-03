// menuScreensPages.js — Players and leaders, the season in progress, a team's rating history, and the readers for Methods, the
// Build Log, How It Works and Research. (They replaced the classic pages, which were retired in v4.25.)
//
// The readers do not write their own copy. Each lists the entries of its registry (METHODS,
// CHANGES, GUIDE, FINDINGS) down the left and draws the selected one on the right with the registry's
// own entry renderer (methodsPage.js _entry, changesPage.js _changeEntry, guidePage.js _guideEntry,
// findingPage.js initFinding), so the words, tables and links cannot drift from the registries.
// A link written as an old classic address (methods.html#ol, teams.html?team=Ohio%20State) is
// rewritten to stay inside the menu.
//
// Must never contain: fetch calls (dataLoader.js owns those) or routing logic.
//
// Load order: after menuScreensClass.js, and after the registry and page scripts it reads.

// ── Links that stay inside the menu ──────────────────────────────────────

// Rewrites the links in `host` that point at a classic page to the menu screen that replaced it:
// methods, the build log, the guide, a finding, a player card or a team page. Other links are left
// alone. A team link names the school (teams.html?team=Boise%20State) while the menu route takes
// the id, so `teamIds` maps one to the other; a school it does not know keeps its link.
function menuRewriteLinks(host, teamIds = {}) {
  const findingByPage = {};
  for (const f of Object.values(FINDINGS)) if (f.page) findingByPage[f.page] = f.id;
  host.querySelectorAll("a[href]").forEach(a => {
    const href = a.getAttribute("href");
    let m;
    if ((m = href.match(/^methods\.html(?:#(.+))?$/))) a.setAttribute("href", `#/methods${m[1] ? "/" + m[1] : ""}`);
    else if ((m = href.match(/^changes\.html(?:#(.+))?$/))) a.setAttribute("href", `#/changes${m[1] ? "/" + m[1] : ""}`);
    else if ((m = href.match(/^info\.html(?:#(.+))?$/))) a.setAttribute("href", `#/guide${m[1] ? "/" + m[1] : ""}`);
    else if (findingByPage[href.replace(/#.*$/, "")]) a.setAttribute("href", `#/research/${findingByPage[href.replace(/#.*$/, "")]}`);
    else if ((m = href.match(/^players\.html\?(?:.*&)?player=(\d+)/))) a.setAttribute("href", `#/player/${m[1]}`);
    else if (href.startsWith("teams.html?")) {
      const id = teamIds[new URLSearchParams(href.slice("teams.html?".length).replace(/#.*$/, "")).get("team")];
      if (id != null) a.setAttribute("href", menuTeamPath(id));
    }
    else if (href === "season2026.html") a.setAttribute("href", "#/season");
    else if (href === "ratings.html") a.setAttribute("href", "#/scatter");
    else if (href === "players.html") a.setAttribute("href", "#/players");
    else if (href === "teams.html") a.setAttribute("href", "#/team-select");
    else if (href === "league.html") a.setAttribute("href", "#/standings");
    else if (href === "research.html") a.setAttribute("href", "#/research");
    else if (href === "index.html" || href === "index.html?classic") a.setAttribute("href", "#/home");
  });
}

// ── The readers ───────────────────────────────────────────────────────────

// Registers a reader screen. `def.groups()` returns [{ label, items: [{ id, label, sub }] }] for
// the left list, and `def.show(id, host)` draws the entry into the element on the right (it may
// return a promise). The entry in the route, or the first, is shown at once; moving the selection
// down the list shows each in turn. LT / RT (or PgUp / PgDn) scroll the entry.
function menuRegisterReader(id, def) {
  menuRouter.register(id, {
    title: def.title,
    crumb: () => def.crumb,
    prompts: [{ action: "move", label: "Entries" }, { action: "page", label: "Scroll" }, { action: "back", label: "Back" }],
    async render(ctx) {
      ctx.team = menuMyTeam(await menuTeams(MENU.season));
      const groups = def.groups();
      ctx.first = ctx.params[0] || groups.flatMap(g => g.items)[0]?.id;
      const list = groups.map(g => `<div class="m-readgroup">${_esc(g.label)}</div>${g.items.map(it => `
        <button class="m-row m-row--read${it.id === ctx.first ? " is-open" : ""}" type="button" data-nav data-nav-group="read" data-eid="${_esc(it.id)}">
          <span class="m-pname">${_esc(it.label)}</span>${it.sub ? `<span class="m-pmeta">${_esc(it.sub)}</span>` : ""}</button>`).join("")}`).join("");
      return `<div class="m-split m-split--read">
        <section class="m-panel m-list m-readlist" aria-label="${_esc(def.title)} entries">${list}</section>
        <section class="m-panel m-reader" id="m-reader" tabindex="-1" aria-live="polite"></section>
      </div>`;
    },
    async mount(stage, ctx) {
      const host = stage.querySelector("#m-reader");
      const teamIds = Object.fromEntries((await menuTeams(MENU.season)).teams.map(t => [t.school, t.id]));
      // A finding's table redraws its rows when it is sorted or filtered, and the redrawn rows carry
      // the classic links again, so the links are rewritten whenever the entry's content changes.
      // (Rewriting changes attributes only, which this observer does not watch, so it cannot loop.)
      const relink = new MutationObserver(() => menuRewriteLinks(host, teamIds));
      relink.observe(host, { childList: true, subtree: true });
      ctx.cleanups.push(() => relink.disconnect());
      let token = 0;
      const show = async eid => {
        const mine = ++token;
        host.scrollTop = 0;
        stage.querySelectorAll(".m-row--read").forEach(b => b.classList.toggle("is-open", b.dataset.eid === eid));
        await def.show(eid, host);
        if (mine !== token) return;
        menuRewriteLinks(host, teamIds);
      };
      stage.addEventListener("menu:select", e => {
        const eid = e.target.closest?.("[data-eid]")?.dataset.eid;
        if (eid) show(eid);
      });
      stage.querySelectorAll("[data-eid]").forEach(b => b.addEventListener("click", () => show(b.dataset.eid)));
      ctx.cleanups.push(menuInput.on("pageDown", () => { host.scrollBy({ top: host.clientHeight * 0.85 }); return true; }));
      ctx.cleanups.push(menuInput.on("pageUp", () => { host.scrollBy({ top: -host.clientHeight * 0.85 }); return true; }));
      if (ctx.first) await show(ctx.first);
    },
    prefer: () => ".m-row--read.is-open",
  });
}

// The data group also holds a table generated from the pipeline's API survey (explore_api.py): how many endpoints answer, what is
// verified absent and how we know, every endpoint's record count. It is not a registry entry, so it is listed beside them.
const MENU_AVAILABILITY_ID = "api-availability";

menuRegisterReader("methods", {
  title: "Methods", crumb: "ABOUT › METHODS",
  groups: () => METHOD_GROUPS.map(g => ({ label: g.label, items: [
    ...METHODS.filter(m => m.group === g.id).map(m => ({ id: m.id, label: m.title })),
    ...(g.id === "data" ? [{ id: MENU_AVAILABILITY_ID, label: "What the API provides (generated survey)" }] : []),
  ] })).filter(g => g.items.length),
  show: async (id, host) => {
    if (id === MENU_AVAILABILITY_ID) {
      host.innerHTML = `<article class="method-entry"><h3 class="method-title">What the API provides</h3>${await _availability()}</article>`;
      return;
    }
    const m = METHODS.find(x => x.id === id);
    host.innerHTML = m ? _entry(m) : '<p class="m-empty">No such entry.</p>';
  },
});

menuRegisterReader("changes", {
  title: "Build Log", crumb: "ABOUT › BUILD LOG",
  groups: () => [{ label: "Newest first", items: [...CHANGES].sort(_byDateDesc).map(c => ({ id: c.id, label: `${c.version} · ${c.title}`, sub: c.date })) }],
  show: (id, host) => { const c = CHANGES.find(x => x.id === id); host.innerHTML = c ? _changeEntry(c) : '<p class="m-empty">No such entry.</p>'; },
});

menuRegisterReader("guide", {
  title: "How It Works", crumb: "ABOUT › HOW IT WORKS",
  groups: () => GUIDE_GROUPS.map(g => ({ label: g.label, items: GUIDE.filter(e => e.group === g.id).map(e => ({ id: e.id, label: e.title })) })).filter(g => g.items.length),
  show: async (id, host) => {
    const e = GUIDE.find(x => x.id === id);
    host.innerHTML = e ? _guideEntry(e) : '<p class="m-empty">No such entry.</p>';
    if (e && e.live) { try { host.querySelector(`[data-live="${CSS.escape(e.id)}"]`).innerHTML = await e.live(); } catch (err) { /* the live line is optional */ } }
  },
});

// Questions the site has no analysis for yet, carried over from the classic Research index (v4.25). They are listed because a research
// list that shows only finished work hides how much is unfinished. Not findings: no claim, no evidence, so not registry entries.
const MENU_OPEN_QUESTIONS = [
  { id: "q-g5-p4", tag: "Transfer Portal", title: "G5 → P4 transfer success", text: "Which production profiles survive a jump in competition? Does EDGE trajectory predict it better than raw totals?" },
  { id: "q-year-two", tag: "Transfer Portal", title: "Year 1 vs Year 2 transfers", text: "Do transfers dip in year one and peak in year two if retained? How does that vary by position and conference jump?" },
  { id: "q-nil", tag: "NIL", title: "NIL efficiency", text: "Which positions and program types return the most production per NIL dollar? Blocked: no working data source." },
  { id: "q-coordinators", tag: "Scheme", title: "Portable coordinators", text: "Do some coordinators produce elite players everywhere they go, or are they talent-dependent?" },
  { id: "q-realignment", tag: "Conference", title: "Realignment impact", text: "How did the 2024–25 realignment change recruiting footprints and talent composites for the programs that moved?" },
  { id: "q-cross-era", tag: "Historical", title: "Cross-era leaderboards", text: "Era-adjusted anchors are live in the ratings engine; the leaderboard view that would use them is not built." },
];

menuRegisterReader("research", {
  title: "Research", crumb: "ABOUT › RESEARCH",
  groups: () => [
    { label: "Research", items: findingsOfKind("research").map(f => ({ id: f.id, label: f.title, sub: f.status === "upcoming" ? "planned" : "" })) },
    { label: "Storylines", items: findingsOfKind("storyline").map(f => ({ id: f.id, label: f.title, sub: f.status === "upcoming" ? "planned" : "" })) },
    { label: "Questions we haven't answered", items: MENU_OPEN_QUESTIONS.map(q => ({ id: q.id, label: q.title, sub: "open" })) },
  ].filter(g => g.items.length),
  show: async (id, host) => {
    const q = MENU_OPEN_QUESTIONS.find(x => x.id === id);
    if (q) {
      host.innerHTML = `<article class="method-entry"><span class="research-tag">${_esc(q.tag)}</span><h3 class="method-title">${_esc(q.title)}</h3>
        <p class="method-summary">${_esc(q.text)}</p><p class="m-note">An open question: no analysis stands behind it yet.</p></article>`;
      document.title = "Research — CFB Analytics";
      return;
    }
    host.innerHTML = '<div id="finding-root"></div>';
    await initFinding(id);
    document.title = "Research — CFB Analytics";
  },
});

// ── Players and leaders ───────────────────────────────────────────────────

// Orders a list of player rows by the roster's sorts (menuSortPlayers), reusing the same
// choices: best available first (to-date, then projection, then last season), and the columns.
let _menuPlayersSort = 0;

// What narrows the list besides the position tab (v4.25, from the classic Players board): a search of names and teams, a
// conference, a minimum rating. Kept while you move between positions and seasons.
const _menuPlayersFilter = { q: "", conf: "", min: 0 };
const MENU_MIN_RATINGS = [0, 60, 70, 80, 90];
const MENU_PLAYERS_SHOWN = 200;

// The next value after `cur` in `list`, wrapping: how a filter button steps through its choices.
function menuCycle(list, cur, step = 1) {
  return list[(Math.max(0, list.indexOf(cur)) + step + list.length) % list.length];
}

// The rating a row shows in a season being played (earned to date) or any other (its rating), for the minimum-rating filter.
function menuShownRating(p) {
  return hasTrio(p) ? p.live_rating : p.overall_rating;
}

// The players that pass the position tab and the filters. A lineman has no rating by design, so he is listed only when searched
// for: the list is of rated players, but a search has to be able to find anyone.
function menuPlayersMatching(all, pos, f) {
  const q = f.q.trim().toLowerCase();
  return all.filter(p => {
    if (p.rating_status === "not_rated" && !q) return false;
    if (pos !== "ALL" && !matchesPosition(p.position_group, pos)) return false;
    if (f.conf && p.conference !== f.conf) return false;
    if (f.min && !((menuShownRating(p) ?? -1) >= f.min)) return false;
    return !q || `${p.name || ""} ${p.team || ""}`.toLowerCase().includes(q);
  });
}

// The rows, the count and the footnote for the list as filtered and sorted now. Drawn by render() and again by every change to a
// filter, which replaces only the rows so the search box keeps its focus.
function menuPlayersView(ctx) {
  const list = menuPlayersMatching(ctx.all, ctx.pos, _menuPlayersFilter);
  const sort = MENU_ROSTER_SORTS[_menuPlayersSort];
  const sorted = menuSortPlayers(list, sort).slice(0, MENU_PLAYERS_SHOWN);
  ctx.players = sorted;
  const rows = sorted.map((p, i) => `
      <button class="m-row m-row--player" type="button" data-nav data-nav-group="players" data-pid="${p.id}" data-tid="${p.team_id}" data-to="${menuPlayerPath(p.id, p.team_id)}">
        <span class="m-rank">${i + 1}</span>
        <span class="m-pname">${menuAvatar(p.id, p.name, ctx.hs)}${_esc(p.name || "—")}</span>
        <span class="m-pos">${posBadge(p.position_group)}</span>
        <span class="m-pmeta">${_esc(p.team_abbr || p.team || "")}</span>
        <span class="m-num">${classYearLabel(p.class_year)}</span>
        ${menuRatingCells(p, MENU.season).join("")}
      </button>`).join("");
  const f = _menuPlayersFilter;
  const on = [f.q.trim() && `search "${f.q.trim()}"`, f.conf && `conference ${f.conf}`, f.min && `rating ${f.min}+`].filter(Boolean);
  return {
    rows: rows || `<p class="m-empty">No players match${on.length ? ` (${_esc(on.join(", "))}; press the buttons above or clear the box to change it)` : ""}${f.min && hasTrio(ctx.all[0] || {}) ? ". In a season being played only an earned-to-date rating counts toward the floor" : ""}.</p>`,
    count: `${sorted.length.toLocaleString()} of ${list.length.toLocaleString()}`,
    foot: `The top ${sorted.length.toLocaleString()} of ${list.length.toLocaleString()} matching players, sorted by ${sort.label.toLowerCase()}. Use the Sort button in the bar below${menuInput.device === "pad" ? " (X)" : ""} to change the sort. Offensive linemen are not rated, so they are listed only when you search for one.`,
  };
}

menuRouter.register("players", {
  title: "Players & Leaders",
  crumb: () => "LEAGUE › PLAYERS",
  prompts: () => [{ action: "move", label: "Move" }, { action: "select", label: "Player card" }, { action: "tabs", label: "Position" },
                  { action: "alt", label: `Sort: ${MENU_ROSTER_SORTS[_menuPlayersSort].label}` }, { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  tabs: ctx => ({ items: _menuPositionTabs(), active: ctx.params[0] || "ALL", go: id => menuRouter.go(`#/players/${id}`) }),
  async render(ctx) {
    ctx.team = menuMyTeam(await menuTeams(MENU.season));
    ctx.pos = ctx.params[0] || "ALL";
    ctx.all = await fetchSeasonPlayers(MENU.season);
    ctx.hs = await fetchHeadshots();
    const f = _menuPlayersFilter;
    ctx.confs = [...new Set(ctx.all.map(p => p.conference).filter(Boolean))].sort();
    if (f.conf && !ctx.confs.includes(f.conf)) f.conf = "";          // a conference that did not exist that season
    const view = menuPlayersView(ctx);
    const head = ctx.all.some(hasTrio) ? "<span>RATING</span>" : "<span>OVR</span>";
    return `<section class="m-panel m-list" aria-label="Players">
        <div class="m-filterbar">
          <input class="m-input" id="m-pq" type="search" placeholder="Search a player or a team" aria-label="Search players and teams" autocomplete="off" value="${_esc(f.q)}" data-nav data-nav-group="filters">
          <button class="m-chip" id="m-pconf" type="button" data-nav data-nav-group="filters" title="Press to step through the conferences">Conference: ${_esc(f.conf || "all")}</button>
          <button class="m-chip" id="m-pmin" type="button" data-nav data-nav-group="filters" title="Press to step through the minimum ratings">Rating: ${f.min ? f.min + "+" : "any"}</button>
          <span class="m-count" id="m-pcount" aria-live="polite">${view.count}</span>
        </div>
        <div class="m-rowhead m-row--player"><span>#</span><span>PLAYER</span><span>POS</span><span>TEAM</span><span>CL</span>${head}</div>
        <div id="m-prows">${view.rows}</div>
      </section>
      <p class="m-foot" id="m-pfoot">${view.foot}</p>`;
  },
  mount(stage, ctx) {
    menuWirePhoto(stage);
    const f = _menuPlayersFilter;
    const q = stage.querySelector("#m-pq"), conf = stage.querySelector("#m-pconf"), min = stage.querySelector("#m-pmin");
    const repaint = () => {
      const view = menuPlayersView(ctx);
      stage.querySelector("#m-prows").innerHTML = view.rows;
      stage.querySelector("#m-pcount").textContent = view.count;
      stage.querySelector("#m-pfoot").textContent = view.foot;
      menuWirePhoto(stage.querySelector("#m-prows"));
    };
    let timer;
    q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { f.q = q.value; repaint(); }, 120); });
    q.addEventListener("keydown", e => { if (e.key === "Enter") q.blur(); });
    conf.addEventListener("click", () => { f.conf = menuCycle(["", ...ctx.confs], f.conf); conf.textContent = `Conference: ${f.conf || "all"}`; repaint(); });
    min.addEventListener("click", () => { f.min = menuCycle(MENU_MIN_RATINGS, f.min); min.textContent = `Rating: ${f.min ? f.min + "+" : "any"}`; repaint(); });
    // Escape in the search box leaves the box (and keeps what was typed) instead of leaving the screen.
    ctx.cleanups.push(menuInput.on("back", () => { if (document.activeElement === q) { q.blur(); return true; } return false; }));
    ctx.cleanups.push(menuInput.on("alt", () => { _menuPlayersSort = (_menuPlayersSort + 1) % MENU_ROSTER_SORTS.length; menuRouter.render(); return true; }));
  },
  prefer: () => ".m-row--player",
});

// ── The season in progress ────────────────────────────────────────────────

// Each team's rating this season against the year before (team_history.json), biggest gain first, as { team, then, now, delta }.
// For a season not yet played the "now" is the preseason projection, which is why the panel says so.
function menuYearOverYear(d, histories, season) {
  const moves = [];
  for (const t of d.teams) {
    const rows = histories[String(t.id)] || [];
    const now = rows.find(r => r.season === season && r.overall_rating != null);
    const then = rows.find(r => r.season === season - 1 && r.overall_rating != null);
    if (now && then) moves.push({ team: t, then: then.overall_rating, now: now.overall_rating, delta: now.overall_rating - then.overall_rating });
  }
  return moves.sort((a, b) => b.delta - a.delta);
}

// The games still to play between two rated teams, best first: combined rating minus twice the gap between them, so an even
// heavyweight game outranks a lopsided one. Ratings are the ones the rankings use (earned to date in a season being played).
function menuCircleGames(d) {
  const seen = new Set(), out = [];
  for (const games of Object.values(d.schedules)) {
    for (const g of games) {
      if (g.result != null || seen.has(g.game_id)) continue;
      seen.add(g.game_id);
      const home = menuTeamById(d, g.home_team_id), away = menuTeamById(d, g.away_team_id);
      if (!home || !away) continue;
      const a = menuTeamOvr(away, d), h = menuTeamOvr(home, d);
      if (a == null || h == null) continue;
      out.push({ g, home, away, a, h, q: a + h - 2 * Math.abs(a - h) });
    }
  }
  return out.sort((x, y) => y.q - x.q).slice(0, 25);
}

menuRouter.register("season", {
  title: "The Season",
  crumb: () => "NEWS › SEASON",
  prompts: [{ action: "move", label: "Move" }, { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    ctx.team = menuMyTeam(d); ctx.d = d;
    const live = d.live;
    const hs = await fetchHeadshots();
    const histories = await fetchTeamHistories();
    const moves = menuYearOverYear(d, histories, MENU.season);
    const projected = isProjectedSeason(MENU.season);
    // Games to circle are the ones still to play: only a season in progress or not yet played has any (a finished season's unplayed
    // rows are games that were never scored, not games to circle).
    const circle = live || projected ? menuCircleGames(d) : [];
    const moveRow = m => `<button class="m-row m-row--moves" type="button" data-nav data-nav-group="season-moves" data-to="${menuTeamPath(m.team.id)}">
        <span class="m-rank"></span><span class="m-pname">${teamMark(m.team, "m-row-mark")} ${_esc(m.team.school)}</span>
        <span class="m-rating">${ovrPill(m.then, { label: `Team rating, ${MENU.season - 1}`, season: MENU.season - 1 })}</span>
        <span class="m-rating">${ovrPill(m.now, { label: `Team rating, ${MENU.season}`, season: MENU.season })}</span>
        <span class="m-rating">${deltaChip(m.delta, { title: `${MENU.season} rating minus ${MENU.season - 1} rating` })}</span></button>`;
    const movesPanel = moves.length >= 16 ? `<section class="m-panel m-list" aria-label="Biggest changes since ${MENU.season - 1}">
        <div class="m-rowhead m-row--moves"><span></span><span>BIGGEST CHANGES SINCE ${MENU.season - 1}</span><span>${MENU.season - 1}</span><span>${MENU.season}${projected ? " PROJ" : ""}</span><span>CHANGE</span></div>
        ${[...moves.slice(0, 8), ...moves.slice(-8)].map(moveRow).join("")}
      </section><p class="m-foot">${projected ? `The ${MENU.season} column is the preseason projection, built from each roster's projected players, against what the team earned in ${MENU.season - 1}.` : `Team rating in ${MENU.season} against ${MENU.season - 1}, both earned.`} Movement is mostly roster turnover: who left, who arrived, and who developed.</p>` : "";
    const circleRow = c => `<button class="m-row m-row--circle" type="button" data-nav data-nav-group="season-circle" data-to="#/game/${c.g.game_id}/${c.home.id}">
        <span class="m-rank">W${c.g.week ?? "—"}</span><span class="m-pmeta">${_esc(String(c.g.game_date || "").slice(5, 10))}</span>
        <span class="m-pname">${_esc(c.away.school)} <small>${c.g.neutral_site ? "vs" : "at"}</small> ${_esc(c.home.school)}</span>
        <span class="m-rating">${ovrPill(c.a, { label: `${c.away.school}, team rating`, season: MENU.season })}</span>
        <span class="m-rating">${ovrPill(c.h, { label: `${c.home.school}, team rating`, season: MENU.season })}</span>
        <span class="m-num" title="Combined rating minus twice the gap between the two">${c.q.toFixed(0)}</span></button>`;
    const circlePanel = circle.length ? `<section class="m-panel m-list" aria-label="Games to circle">
        <div class="m-rowhead m-row--circle"><span>WK</span><span>DATE</span><span>${live ? "GAMES STILL TO PLAY, BEST FIRST" : "GAMES TO CIRCLE"}</span><span>AWAY</span><span>HOME</span><span>QUALITY</span></div>
        ${circle.map(circleRow).join("")}
      </section><p class="m-foot">Quality is the two teams' combined rating minus twice the gap between them, so an even heavyweight game outranks a lopsided one. It is not a win probability: those arrive only with their backtest.</p>` : "";
    if (!live) {
      return `<section class="m-panel"><p class="m-empty">${MENU.season} ${projected ? "has not been played: every rating is a projection." : "is a finished season; see Rankings for the final order."}</p></section>${movesPanel}${circlePanel}`;
    }
    const movers = [...live.teams].filter(t => t.change != null).sort((a, b) => b.change - a.change);
    const mv = t => `<button class="m-row m-row--mini" type="button" data-nav data-nav-group="season-teams" data-to="${menuTeamPath(t.team_id)}"><span class="m-rank"></span><span class="m-pname">${_esc(t.school)}</span><span class="m-num">${t.wins}-${t.losses}</span><span class="m-num">${t.change > 0 ? "▲" : "▼"} ${Math.abs(t.change).toFixed(1)}</span></button>`;
    const bestP = [...live.players].sort((a, b) => b.overall_rating - a.overall_rating).slice(0, 10);
    const val = live.validation?.summary;
    return `<div class="m-split m-split--roster">
      <section class="m-panel">
        <h2 class="m-detail-name">${MENU.season} · through week ${live.through_week}</h2>
        <div class="m-facts"><span>${live.games_completed.toLocaleString()} of ${live.games_scheduled.toLocaleString()} regular-season games played</span><span>${live.players_rated.toLocaleString()} of ${live.players_on_rosters.toLocaleString()} players rated so far</span></div>
        <h3 class="m-h3">Biggest team risers (rating to date vs preseason)</h3>${movers.slice(0, 8).map(mv).join("")}
        <h3 class="m-h3">Biggest fallers</h3>${movers.slice(-8).reverse().map(mv).join("")}
      </section>
      <aside class="m-panel m-detail">
        <h3 class="m-h3">Best players to date</h3>
        ${bestP.map((p, i) => `<button class="m-row m-row--mini" type="button" data-nav data-nav-group="season-players" data-to="${menuPlayerPath(p.player_id, p.team_id)}"><span class="m-rank">${i + 1}</span><span class="m-pname">${menuAvatar(p.player_id, p.name, hs)}${_esc(p.name)} <small>${_esc(p.position_group)} · ${_esc(p.team)}</small></span><span class="m-num">${Math.round(p.overall_rating)}</span><span class="m-num">${p.change == null ? "" : (p.change > 0 ? "▲" : "▼") + Math.abs(p.change).toFixed(0)}</span></button>`).join("")}
        <p class="m-note">To-date ratings are earned so far, rescaled to full-season pace, and provisional. ${val ? `Back-tested on ${val.through_week ? "2025 cut at week " + val.through_week : "2025"}: the rescaled number ran about ${Math.round((1 - val.median_ratio_paced) * -100)}% above where players ended up (median ratio ${val.median_ratio_paced}).` : ""}</p>
      </aside>
    </div>${circlePanel}${movesPanel}`;
  },
  mount(stage) { menuWirePhoto(stage); },
});

// ── A team's rating history ───────────────────────────────────────────────

menuRouter.register("team-history", {
  title: ctx => (ctx.team ? `${ctx.team.school} History` : "History"),
  crumb: () => "TEAM › HISTORY",
  prompts: [{ action: "move", label: "Move" }, { action: "back", label: "Back" }],
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const team = menuViewTeam(ctx, d);
    ctx.team = team;
    const hist = team ? await fetchTeamHistory(team.id) : [];
    if (!hist.length) return '<section class="m-panel"><p class="m-empty">No history on file for this team.</p></section>';
    const rows = hist.map(h => `<div class="m-row m-row--hist" role="row">
        <span class="m-rank">${h.season}</span><span class="m-pmeta">${h.conference ? `<button class="m-chip m-chip--tiny" type="button" data-nav data-nav-group="links" data-to="#/standings/${encodeURIComponent(h.conference)}">${_esc(h.conference)}</button>` : ""}</span>
        <span class="m-num">${h.wins == null ? "—" : `${h.wins}-${h.losses}`}</span>
        <span class="m-rating">${h.overall_rating == null ? "—" : ovrPill(h.overall_rating, { season: h.season, label: `Team rating, ${h.season}` })}</span>
        <span class="m-num">${h.offense_rating == null ? "—" : Math.round(h.offense_rating)}</span>
        <span class="m-num">${h.defense_rating == null ? "—" : Math.round(h.defense_rating)}</span></div>`).join("");
    return `<section class="m-panel m-list" aria-label="History">
        <div class="m-rowhead m-row--hist"><span>YEAR</span><span>CONFERENCE</span><span title="Every game, the postseason included">RECORD</span><span>RATING</span><span>OFF</span><span>DEF</span></div>
        ${rows}
      </section>
      <p class="m-foot">Each season's team rating, built from that season's own players and stats. RECORD counts every game, bowls and the playoff included (the Standings screen is regular season only). The conference is the one the team was in that year. A projected season has no record and no separate offense or defense from results.</p>`;
  },
});
