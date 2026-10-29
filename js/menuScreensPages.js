// menuScreensPages.js — the screens that replace the site's classic pages: Players and leaders,
// the season in progress, a team's rating history, and the readers for Methods, the Build Log,
// How It Works and Research.
//
// The readers do not write their own copy. Each lists the entries of its registry (METHODS,
// CHANGES, GUIDE, FINDINGS) down the left and draws the selected one on the right with the SAME
// entry renderer the classic page used (methodsPage.js _entry, changesPage.js _changeEntry,
// guidePage.js _guideEntry, findingPage.js initFinding), so the words, tables and links cannot
// drift from the registries. Links between entries are rewritten to stay inside the menu.
//
// Must never contain: fetch calls (dataLoader.js owns those) or routing logic.
//
// Load order: after menuScreensClass.js, and after the registry and page scripts it reads.

// ── Links that stay inside the menu ──────────────────────────────────────

// Rewrites the links in `host` that point at a classic page to the menu screen that replaced it:
// methods, the build log, the guide, a finding, or a player card. Other links are left alone.
function menuRewriteLinks(host) {
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
    else if (href === "season2026.html") a.setAttribute("href", "#/season");
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
      let token = 0;
      const show = async eid => {
        const mine = ++token;
        host.scrollTop = 0;
        stage.querySelectorAll(".m-row--read").forEach(b => b.classList.toggle("is-open", b.dataset.eid === eid));
        await def.show(eid, host);
        if (mine !== token) return;
        menuRewriteLinks(host);
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

menuRegisterReader("methods", {
  title: "Methods", crumb: "NEWS › METHODS",
  groups: () => METHOD_GROUPS.map(g => ({ label: g.label, items: METHODS.filter(m => m.group === g.id).map(m => ({ id: m.id, label: m.title })) })).filter(g => g.items.length),
  show: (id, host) => { const m = METHODS.find(x => x.id === id); host.innerHTML = m ? _entry(m) : '<p class="m-empty">No such entry.</p>'; },
});

menuRegisterReader("changes", {
  title: "Build Log", crumb: "NEWS › BUILD LOG",
  groups: () => [{ label: "Newest first", items: [...CHANGES].sort(_byDateDesc).map(c => ({ id: c.id, label: `${c.version} · ${c.title}`, sub: c.date })) }],
  show: (id, host) => { const c = CHANGES.find(x => x.id === id); host.innerHTML = c ? _changeEntry(c) : '<p class="m-empty">No such entry.</p>'; },
});

menuRegisterReader("guide", {
  title: "How It Works", crumb: "NEWS › HOW IT WORKS",
  groups: () => GUIDE_GROUPS.map(g => ({ label: g.label, items: GUIDE.filter(e => e.group === g.id).map(e => ({ id: e.id, label: e.title })) })).filter(g => g.items.length),
  show: async (id, host) => {
    const e = GUIDE.find(x => x.id === id);
    host.innerHTML = e ? _guideEntry(e) : '<p class="m-empty">No such entry.</p>';
    if (e && e.live) { try { host.querySelector(`[data-live="${CSS.escape(e.id)}"]`).innerHTML = await e.live(); } catch (err) { /* the live line is optional */ } }
  },
});

menuRegisterReader("research", {
  title: "Research", crumb: "NEWS › RESEARCH",
  groups: () => [
    { label: "Research", items: findingsOfKind("research").map(f => ({ id: f.id, label: f.title, sub: f.status === "upcoming" ? "planned" : "" })) },
    { label: "Storylines", items: findingsOfKind("storyline").map(f => ({ id: f.id, label: f.title, sub: f.status === "upcoming" ? "planned" : "" })) },
  ].filter(g => g.items.length),
  show: async (id, host) => {
    host.innerHTML = '<div id="finding-root"></div>';
    await initFinding(id);
    document.title = "Research — CFB Analytics";
  },
});

// ── Players and leaders ───────────────────────────────────────────────────

// Orders a list of player rows by the roster's sorts (menuSortPlayers), reusing the same
// choices: best available first (to-date, then projection, then last season), and the columns.
let _menuPlayersSort = 0;

menuRouter.register("players", {
  title: "Players & Leaders",
  crumb: () => "LEAGUE › PLAYERS",
  prompts: () => [{ action: "move", label: "Move" }, { action: "select", label: "Player card" }, { action: "tabs", label: "Position" },
                  { action: "alt", label: `Sort: ${MENU_ROSTER_SORTS[_menuPlayersSort].label}` }, { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  tabs: ctx => ({ items: _menuPositionTabs(), active: ctx.params[0] || "ALL", go: id => menuRouter.go(`#/players/${id}`) }),
  async render(ctx) {
    ctx.team = menuMyTeam(await menuTeams(MENU.season));
    const pos = ctx.params[0] || "ALL";
    const all = await fetchSeasonPlayers(MENU.season);
    const list = all.filter(p => (pos === "ALL" || matchesPosition(p.position_group, pos)) && p.rating_status !== "not_rated");
    const sort = MENU_ROSTER_SORTS[_menuPlayersSort];
    const sorted = menuSortPlayers(list, sort).slice(0, 200);
    ctx.players = sorted;
    const trio = sorted.some(hasTrio);
    const head = trio ? `<span>${MENU.season - 1}</span><span>PROJ</span><span>LIVE</span>` : "<span>OVR</span>";
    const rows = sorted.map((p, i) => `
      <button class="m-row m-row--player${trio ? " is-trio" : ""}" type="button" data-nav data-nav-group="players" data-pid="${p.id}" data-tid="${p.team_id}">
        <span class="m-rank">${i + 1}</span>
        <span class="m-pname">${_esc(p.name || "—")}</span>
        <span class="m-pos">${posBadge(p.position_group)}</span>
        <span class="m-pmeta">${_esc(p.team_abbr || p.team || "")}</span>
        <span class="m-num">${classYearLabel(p.class_year)}</span>
        ${menuRatingCells(p, MENU.season).join("")}
      </button>`).join("");
    return `<section class="m-panel m-list" aria-label="Players">
        <div class="m-rowhead m-row--player${trio ? " is-trio" : ""}"><span>#</span><span>PLAYER</span><span>POS</span><span>TEAM</span><span>CL</span>${head}</div>
        ${rows || '<p class="m-empty">No players match.</p>'}
      </section>
      <p class="m-foot">The top ${sorted.length} of ${list.length.toLocaleString()} rated players, sorted by ${sort.label.toLowerCase()}. Press ${menuInput.device === "pad" ? "X" : "Space"} to change the sort. Offensive linemen are not rated and are not listed.</p>`;
  },
  mount(stage, ctx) {
    stage.querySelectorAll("[data-pid]").forEach(b => b.addEventListener("click", () => menuRouter.go(`#/player/${b.dataset.pid}/${b.dataset.tid}`)));
    ctx.cleanups.push(menuInput.on("alt", () => { _menuPlayersSort = (_menuPlayersSort + 1) % MENU_ROSTER_SORTS.length; menuRouter.render(); return true; }));
  },
});

// ── The season in progress ────────────────────────────────────────────────

menuRouter.register("season", {
  title: "The Season",
  crumb: () => "NEWS › SEASON",
  prompts: [{ action: "move", label: "Move" }, { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    ctx.team = menuMyTeam(d); ctx.d = d;
    const live = d.live;
    if (!live) {
      return `<section class="m-panel"><p class="m-empty">${MENU.season} ${isProjectedSeason(MENU.season) ? "has not been played: every rating is a projection." : "is a finished season; see Rankings for the final order."}</p></section>`;
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
        ${bestP.map((p, i) => `<button class="m-row m-row--mini" type="button" data-nav data-nav-group="season-players" data-to="${menuPlayerPath(p.player_id, p.team_id)}"><span class="m-rank">${i + 1}</span><span class="m-pname">${_esc(p.name)} <small>${_esc(p.position_group)} · ${_esc(p.team)}</small></span><span class="m-num">${Math.round(p.overall_rating)}</span><span class="m-num">${p.change == null ? "" : (p.change > 0 ? "▲" : "▼") + Math.abs(p.change).toFixed(0)}</span></button>`).join("")}
        <p class="m-note">To-date ratings are earned so far, rescaled to full-season pace, and provisional. ${val ? `Back-tested on ${val.through_week ? "2025 cut at week " + val.through_week : "2025"}: the rescaled number ran about ${Math.round((1 - val.median_ratio_paced) * -100)}% above where players ended up (median ratio ${val.median_ratio_paced}).` : ""}</p>
      </aside>
    </div>`;
  },
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
        <span class="m-rank">${h.season}</span><span class="m-pmeta">${_esc(h.conference || "")}</span>
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
