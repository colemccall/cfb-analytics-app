// menuScreensLeague.js — the league-wide screens of the menu: schedule, standings,
// rankings and the transfer portal.
//
// Standings and the portal are built by the SAME functions as the site's League page
// (leagueData.js computeStandings / standingsOrder / leagueTransferRows), so a record
// or a move is identical wherever it is drawn. Rankings are our own team ratings:
// earned to date and preseason. Polls are not shown because no poll data is on disk;
// the tab says so rather than pretending.
//
// Must never contain: fetch calls or routing logic.
//
// Load order: after menuScreensTeam.js.

// A team's rating as the pill the rest of the site uses: earned to date when the
// season has that (drawn with the live pill), else the plain or projected overall.
function menuTeamPill(t, d, season) {
  const lv = d.liveById[t.id];
  if (lv?.overall_rating != null) {
    return livePill({ live_rating: lv.overall_rating, live_through_week: d.live.through_week });
  }
  return ovrPill(t.overall_rating, { label: `Team rating, ${season}`, season });
}

// Looks a team up by id in the viewed season's list.
function menuTeamById(d, id) {
  return d.teams.find(t => String(t.id) === String(id)) || null;
}

// ── Schedule ──────────────────────────────────────────────────────────────

menuRouter.register("schedule", {
  title: ctx => (ctx.team ? ctx.team.school : "Schedule"),
  crumb: () => "DYNASTY › SCHEDULE",
  prompts: [{ action: "move", label: "Move" }, { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const team = menuMyTeam(d);
    ctx.team = team; ctx.d = d;
    const games = [...(team ? d.schedules[String(team.id)] || [] : [])]
      .sort((a, b) => String(a.game_date || "9").localeCompare(String(b.game_date || "9")));
    ctx.games = games;
    const next = menuNextGame(games);
    // A week with no game between a team's first and last regular-season week is a bye, shown as
    // its own row so the schedule reads week by week.
    const regWeeks = games.filter(g => g.season_type === "regular" && g.week).map(g => g.week);
    const firstWk = Math.min(...regWeeks), lastWk = Math.max(...regWeeks);
    const haveWk = new Set(regWeeks);
    const byeRow = wk => `<div class="m-row m-row--sched is-bye"><span class="m-rank">W${wk}</span><span class="m-pname">BYE WEEK</span><span class="m-pmeta"></span><span></span><span class="m-result">—</span></div>`;
    let nextWk = firstWk;
    const rows = games.map(g => {
      let byes = "";
      if (g.season_type === "regular" && g.week && Number.isFinite(firstWk)) {
        for (; nextWk < g.week; nextWk++) if (!haveWk.has(nextWk)) byes += byeRow(nextWk);
        nextWk = g.week + 1;
      }
      const oppId = String(g.home_team_id) === String(team.id) ? g.away_team_id : g.home_team_id;
      const opp = menuTeamById(d, oppId);
      const played = g.result === "W" || g.result === "L";
      return byes + `<button class="m-row m-row--sched${g === next ? " is-next" : ""}" type="button" data-nav data-nav-group="sched" data-gid="${g.game_id}">
        <span class="m-rank">${g.week ? `W${g.week}` : "Bowl"}</span>
        <span class="m-pname">${g.is_home ? "vs" : "@"} ${_esc(g.opponent || "TBD")}${g.neutral_site ? " (N)" : ""}</span>
        <span class="m-pmeta">${_esc(String(g.game_date || "").slice(0, 10))}</span>
        <span class="m-rating">${opp ? menuTeamPill(opp, d, MENU.season) : '<span class="trio-na" title="Not in our team list (non-FBS)">—</span>'}</span>
        <span class="m-result ${played ? (g.result === "W" ? "is-win" : "is-loss") : ""}">${played ? `${g.result} ${g.team_score}–${g.opp_score ?? 0}` : g === next ? "NEXT" : "—"}</span>
      </button>`;
    }).join("");
    return `<div class="m-split m-split--roster">
      <section class="m-panel m-list" aria-label="Schedule">
        <div class="m-rowhead m-row--sched"><span>WK</span><span>OPPONENT</span><span>DATE</span><span>OPP OVR</span><span>RESULT</span></div>
        ${rows || '<p class="m-empty">No schedule for this season.</p>'}
      </section>
      <aside class="m-panel m-detail" id="m-detail" aria-live="polite"></aside>
    </div>`;
  },
  mount(stage, ctx) {
    const d = ctx.d, team = ctx.team;
    const detail = stage.querySelector("#m-detail");
    const byId = new Map(ctx.games.map(g => [String(g.game_id), g]));
    stage.addEventListener("menu:select", e => {
      const g = byId.get(e.target.closest?.("[data-gid]")?.dataset.gid);
      if (!g || !team) return;
      const oppId = String(g.home_team_id) === String(team.id) ? g.away_team_id : g.home_team_id;
      const opp = menuTeamById(d, oppId);
      const side = (t, name) => t ? `<div class="m-vs-side">${teamMark(t, "m-preview-mark")}<b>${_esc(t.school)}</b></div>`
                                  : `<div class="m-vs-side"><b>${_esc(name || "TBD")}</b><span class="m-sub">not in our team list</span></div>`;
      detail.innerHTML = `
        <div class="m-vs">${side(team)}<span class="m-vs-at">${g.is_home ? "vs" : "@"}</span>${side(opp, g.opponent)}</div>
        ${menuBar(team.school, menuTeamOvr(team, d))}
        ${opp ? menuBar(opp.school, menuTeamOvr(opp, d)) : ""}
        <p class="m-note">${g.result ? `Final: ${g.result} ${g.team_score}–${g.opp_score ?? 0}` : "Not played yet"} · ${_esc(String(g.game_date || "").slice(0, 10))}</p>`;
    });
  },
  prefer: () => ".m-row--sched.is-next",
});

// ── Standings ─────────────────────────────────────────────────────────────

menuRouter.register("standings", {
  title: "Standings",
  crumb: () => "DYNASTY › STANDINGS",
  prompts: [{ action: "move", label: "Move" }, { action: "tabs", label: "Conference" },
            { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  tabs: ctx => {
    const d = ctx.d;
    if (!d) return null;
    const confs = [...new Set(d.teams.map(t => t.conference).filter(Boolean))].sort();
    const active = ctx.conf;
    return { items: confs.map(c => ({ id: c, label: c === "FBS Independents" ? "Indep." : c })), active,
             go: id => menuRouter.go(`#/standings/${encodeURIComponent(id)}`) };
  },
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const mine = menuMyTeam(d);
    ctx.d = d; ctx.team = mine;
    ctx.conf = decodeURIComponent(ctx.params[0] || mine?.conference || "ACC");
    const rows = Object.values(d.standings).filter(r => r.team.conference === ctx.conf).sort(standingsOrder);
    const played = Object.values(d.standings).reduce((n, r) => n + r.w + r.l, 0);
    if (!played) return `<div class="m-panel"><p class="m-empty">No results for ${MENU.season} yet — standings appear once games are played.</p></div>`;
    const indep = ctx.conf === "FBS Independents";
    const body = rows.map((r, i) => `
      <button class="m-row m-row--stand${r.team.id === MENU.teamId ? " is-mine" : ""}" type="button" data-nav data-nav-group="stand">
        <span class="m-rank">${i + 1}</span>
        <span class="m-pname">${teamMark(r.team, "m-row-mark")} ${_esc(r.team.school)}</span>
        <span class="m-num">${indep ? "—" : `${r.cw}-${r.cl}`}</span><span class="m-num">${r.w}-${r.l}</span>
        <span class="m-num">${r.pf}</span><span class="m-num">${r.pa}</span>
        <span class="m-rating">${menuTeamPill(r.team, d, MENU.season)}</span>
      </button>`).join("");
    return `<section class="m-panel m-list" aria-label="${_esc(ctx.conf)} standings">
        <div class="m-rowhead m-row--stand"><span>#</span><span>TEAM</span><span>CONF</span><span>ALL</span><span>PF</span><span>PA</span><span>OVR</span></div>
        ${body}
      </section>
      <p class="m-foot">Regular season only. A conference game is one against an FBS team in the same conference; derived from the schedule.
        A game with no score for the opponent (almost always a non-FBS team) is not counted, so a few records can be a game short.</p>`;
  },
  mount(stage) {
    stage.querySelectorAll(".m-row--stand").forEach(b => b.addEventListener("click", () => menuChrome.toast("Team pages are on the main site")));
  },
});

// ── Rankings ──────────────────────────────────────────────────────────────

menuRouter.register("rankings", {
  title: "Rankings",
  crumb: () => "DYNASTY › RANKINGS",
  prompts: [{ action: "move", label: "Move" }, { action: "tabs", label: "List" },
            { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  tabs: ctx => {
    const d = ctx.d;
    if (!d) return null;
    const items = [];
    if (d.live) items.push({ id: "live", label: `To date · wk ${d.live.through_week}` });
    items.push({ id: "pre", label: isProjectedSeason(MENU.season) ? "Preseason" : "Final" });
    items.push({ id: "polls", label: "Polls" });
    return { items, active: ctx.list, go: id => menuRouter.go(`#/rankings/${id}`) };
  },
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    ctx.d = d; ctx.team = menuMyTeam(d);
    ctx.list = ctx.params[0] || (d.live ? "live" : "pre");
    if (ctx.list === "polls") {
      return `<section class="m-panel"><p class="m-empty">Polls (AP, Coaches, CFP) are not shown: no poll data is on disk, and fetching it
        needs a CollegeFootballData /rankings harvest. The lists beside this one are our own team ratings.</p></section>`;
    }
    const val = t => ctx.list === "live" ? d.liveById[t.id]?.overall_rating : t.overall_rating;
    const ranked = d.teams.filter(t => val(t) != null).sort((a, b) => val(b) - val(a));
    const mineIdx = ranked.findIndex(t => t.id === MENU.teamId);
    const row = (t, i) => `
      <button class="m-row m-row--rank${t.id === MENU.teamId ? " is-mine" : ""}" type="button" data-nav data-nav-group="rank">
        <span class="m-rank">${i + 1}</span>
        <span class="m-pname">${teamMark(t, "m-row-mark")} ${_esc(t.school)}</span>
        <span class="m-pmeta">${_esc(t.conference || "")}</span>
        <span class="m-num">${d.standings[t.id] ? `${d.standings[t.id].w}-${d.standings[t.id].l}` : "—"}</span>
        <span class="m-rating">${ctx.list === "live" ? livePill({ live_rating: val(t), live_through_week: d.live.through_week }) : ovrPill(val(t), { season: MENU.season, label: "Team rating" })}</span>
        <span class="m-rating">${ctx.list === "live" && t.overall_rating != null && d.liveById[t.id]
          ? deltaChip(d.liveById[t.id].overall_rating - t.overall_rating, { title: "To date minus preseason" }) : ""}</span>
      </button>`;
    const top = ranked.slice(0, 25).map(row).join("");
    const mineRow = mineIdx >= 25 ? `<div class="m-gap">· · ·</div>${row(ranked[mineIdx], mineIdx)}` : "";
    return `<section class="m-panel m-list" aria-label="Top 25">
        <div class="m-rowhead m-row--rank"><span>#</span><span>TEAM</span><span>CONF</span><span>REC</span><span>OVR</span><span>VS PRESEASON</span></div>
        ${top}${mineRow}
      </section>
      <p class="m-foot">Our own team ratings, not a poll. ${ctx.list === "live"
        ? "To date is earned through the games played, blended with this season's SP+; provisional."
        : isProjectedSeason(MENU.season) ? "Preseason is the projection made before a game was played." : "Final ratings for a played season."}</p>`;
  },
});

// ── Transfer portal ───────────────────────────────────────────────────────

menuRouter.register("portal", {
  title: "Transfer Portal",
  crumb: () => "DYNASTY › TRANSFER PORTAL",
  prompts: [{ action: "move", label: "Move" }, { action: "tabs", label: "Position" },
            { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  tabs: ctx => ({ items: ["ALL", ...CONFIG.FILTER_POSITIONS].map(p => ({ id: p, label: p })),
                  active: ctx.params[0] || "ALL", go: id => menuRouter.go(`#/portal/${id}`) }),
  async render(ctx) {
    ctx.team = menuMyTeam((await menuTeams(MENU.season)));
    const season = MENU.season;
    if (!CONFIG.TRANSFER_SEASONS.includes(season)) {
      return `<section class="m-panel"><p class="m-empty">No transfer-portal data for ${season}. It covers ${CONFIG.TRANSFER_SEASONS[0]}–${CONFIG.TRANSFER_SEASONS[CONFIG.TRANSFER_SEASONS.length - 1]}; press Y to change season.</p></section>`;
    }
    const pos = ctx.params[0] || "ALL";
    const all = leagueTransferRows(await fetchLeagueTransfers(season))
      .filter(r => pos === "ALL" || matchesPosition(r.position_group, pos))
      .sort((a, b) => ((b.ovr_current ?? b.ovr_previous ?? -1) - (a.ovr_current ?? a.ovr_previous ?? -1)));
    const shown = all.slice(0, 150);
    const rows = shown.map((r, i) => `
      <button class="m-row m-row--portal" type="button" data-nav data-nav-group="portal">
        <span class="m-rank">${i + 1}</span>
        <span class="m-pname">${_esc(r.name)}</span>
        <span class="m-pos">${posBadge(r.position_group)}</span>
        <span class="m-pmeta">${_esc(r.from_school || "—")} → ${_esc(r.to_school || "—")}</span>
        <span class="m-rating">${r.ovr_previous == null ? "—" : ovrPill(r.ovr_previous, { label: "Rating before the move" })}</span>
        <span class="m-rating">${r.ovr_current == null ? "—" : ovrPill(r.ovr_current, { label: `Rating, ${season}`, season })}</span>
        <span class="m-rating">${r.ovr_current != null && r.ovr_previous != null ? deltaChip(r.ovr_current - r.ovr_previous) : ""}</span>
      </button>`).join("");
    return `<section class="m-panel m-list" aria-label="Transfer portal">
        <div class="m-rowhead m-row--portal"><span>#</span><span>PLAYER</span><span>POS</span><span>FROM → TO</span><span>BEFORE</span><span>NOW</span><span>CHANGE</span></div>
        ${rows || '<p class="m-empty">No moves match.</p>'}
      </section>
      <p class="m-foot">${shown.length.toLocaleString()} of ${all.length.toLocaleString()} moves, best rating first. <b>Before</b> is the rating the season before he moved
        (blank if he had none); <b>Now</b> is his earned rating at the new school${isProjectedSeason(season)
          ? `, which does not exist yet for ${season} — see his team's roster for the projection and the to-date rating` : ""}. Entries with no landing school are not listed.</p>`;
  },
});

// ── Recruiting ────────────────────────────────────────────────────────────

menuRouter.register("recruiting", {
  title: "Recruiting",
  crumb: () => "DYNASTY › RECRUITING",
  prompts: [{ action: "move", label: "Move" }, { action: "tabs", label: "View" },
            { action: "season", label: "Class year" }, { action: "back", label: "Back" }],
  tabs: ctx => ({ items: [{ id: "classes", label: "Class rankings" }, { id: "prospects", label: "Prospect board" }],
                  active: ctx.params[0] || "classes", go: id => menuRouter.go(`#/recruiting/${id}`) }),
  async render(ctx) {
    ctx.team = menuMyTeam(await menuTeams(MENU.season));
    const year = MENU.season, view = ctx.params[0] || "classes";
    const c = await fetchRecruiting(year);
    if (!c) {
      const ys = CONFIG.RECRUITING_SEASONS;
      return `<section class="m-panel"><p class="m-empty">No recruiting class on file for ${year}. Classes ${ys[0]}–${ys[ys.length - 1]} are available; press Y to change the year. The class after the latest season is not in the data.</p></section>`;
    }
    const note = `<p class="m-foot">Only recruits matched to a player record are listed (${c.matched_recruits.toLocaleString()} for ${year}); the rest are absent, not zero.
      <b>Class rank</b> is the average composite of a team's best ${c.top_n} recruits; a team with fewer than ${c.top_n} matched commits is unranked.
      It is a summary of the data we hold, not a published recruiting ranking.</p>`;
    if (view === "prospects") {
      const rows = c.prospects.slice(0, 150).map(p => `
        <button class="m-row m-row--prospect" type="button" data-nav data-nav-group="prospect">
          <span class="m-rank">${p.national_rank ?? "—"}</span>
          <span class="m-pname">${_esc(p.name)}</span>
          <span class="m-pos">${p.position ? posBadge(p.position) : "—"}</span>
          <span class="m-num">${p.stars ? "★".repeat(p.stars) : "—"}</span>
          <span class="m-num">${p.composite == null ? "—" : p.composite.toFixed(4)}</span>
          <span class="m-pmeta">${_esc(p.state || "—")}</span>
          <span class="m-pmeta">${_esc(p.team || "Uncommitted")}</span>
        </button>`).join("");
      return `<section class="m-panel m-list" aria-label="Prospect board">
          <div class="m-rowhead m-row--prospect"><span>NAT</span><span>PLAYER</span><span>POS</span><span>STARS</span><span>COMP</span><span>ST</span><span>COMMITTED TO</span></div>
          ${rows}
        </section>${note}`;
    }
    const ranked = c.teams.filter(t => t.class_rank != null);
    const mine = c.teams.find(t => t.team_id === MENU.teamId);
    const row = t => `
      <button class="m-row m-row--class${t.team_id === MENU.teamId ? " is-mine" : ""}" type="button" data-nav data-nav-group="class">
        <span class="m-rank">${t.class_rank ?? "—"}</span>
        <span class="m-pname">${_esc(t.team || "—")}</span>
        <span class="m-num">${t.commits}</span>
        <span class="m-num">${t.five_stars}/${t.four_stars}</span>
        <span class="m-num">${t.avg_composite == null ? "—" : t.avg_composite.toFixed(4)}</span>
        <span class="m-num">${t.top_avg == null ? "—" : t.top_avg.toFixed(4)}</span>
      </button>`;
    const mineRow = mine && (mine.class_rank == null || mine.class_rank > 25)
      ? `<div class="m-gap">· · ·</div>${row(mine)}` : "";
    return `<section class="m-panel m-list" aria-label="Class rankings">
        <div class="m-rowhead m-row--class"><span>#</span><span>TEAM</span><span>COMMITS</span><span>5★/4★</span><span>AVG</span><span>TOP ${c.top_n}</span></div>
        ${ranked.slice(0, 25).map(row).join("")}${mineRow}
      </section>${note}`;
  },
});
