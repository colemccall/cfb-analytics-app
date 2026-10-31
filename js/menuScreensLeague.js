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

// The band above a schedule: the team's mark and name, record and conference, and its three ratings in boxes.
function menuScheduleBand(d, team) {
  const st = d.standings[team.id], lv = d.liveById[team.id];
  const box = (label, v) => `<div class="m-sbox"><b>${v == null ? "—" : Math.round(v)}</b><span>${label}</span></div>`;
  const rank = menuTeamRank(team, d);
  return `<div class="m-sband" style="--m-team:${_esc(team.color || "")}">
      ${teamMark(team, "m-preview-mark")}
      <div class="m-sband-name"><b>${_esc(team.school)}</b><span>${st ? recordText(st) : "No results yet"}${st && st.cw + st.cl ? ` · ${st.cw}-${st.cl} in conference` : ""} · ${_esc(team.conference || "")}${rank != null ? ` · #${rank}` : ""}</span></div>
      ${box("OVR", menuTeamOvr(team, d))}${box("OFF", menuSide(team, lv, "offense_rating"))}${box("DEF", menuSide(team, lv, "defense_rating"))}
    </div>`;
}

menuRouter.register("schedule", {
  title: ctx => (ctx.team ? ctx.team.school : "Schedule"),
  crumb: () => "TEAM › SCHEDULE",
  prompts: [{ action: "move", label: "Move" }, { action: "select", label: "Open opponent" }, { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const team = menuViewTeam(ctx, d);
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
    let postShown = false;
    const rows = games.map(g => {
      let byes = "";
      // Bowls and the playoff come after the regular season under their own heading: their "week" is an
      // index within the postseason, not a week of the season, so it is not shown as one.
      if (g.season_type === "postseason" && !postShown) { postShown = true; byes += '<div class="m-sched-div">POSTSEASON</div>'; }
      if (g.season_type === "regular" && g.week && Number.isFinite(firstWk)) {
        for (; nextWk < g.week; nextWk++) if (!haveWk.has(nextWk)) byes += byeRow(nextWk);
        nextWk = g.week + 1;
      }
      const oppId = String(g.home_team_id) === String(team.id) ? g.away_team_id : g.home_team_id;
      const opp = menuTeamById(d, oppId);
      const played = g.result === "W" || g.result === "L";
      return byes + `<button class="m-row m-row--sched${g === next ? " is-next" : ""}" type="button" data-nav data-nav-group="sched" data-gid="${g.game_id}" data-to="#/game/${g.game_id}/${team.id}">
        <span class="m-rank">${g.season_type === "postseason" ? "POST" : g.week ? `W${g.week}` : "—"}</span>
        <span class="m-pname">${g.is_home ? "vs" : "@"} ${_esc(g.opponent || "TBD")}${g.neutral_site ? " (N)" : ""}</span>
        <span class="m-pmeta">${_esc(String(g.game_date || "").slice(0, 10))}</span>
        <span class="m-rating">${opp ? menuTeamPill(opp, d, MENU.season) : '<span class="trio-na" title="Not in our team list (non-FBS)">—</span>'}</span>
        <span class="m-num">${opp && d.standings[opp.id] ? `${d.standings[opp.id].w}-${d.standings[opp.id].l}` : "—"}</span>
        <span class="m-result ${played ? (g.result === "W" ? "is-win" : "is-loss") : ""}">${played ? `${g.result} ${g.team_score}–${g.opp_score ?? 0}` : g === next ? "NEXT" : "—"}</span>
      </button>`;
    }).join("");
    return `<div class="m-split m-split--roster">
      <section class="m-panel m-list" aria-label="Schedule">
        ${team ? menuScheduleBand(d, team) : ""}
        <div class="m-rowhead m-row--sched"><span>WK</span><span>OPPONENT</span><span>DATE</span><span>OPP OVR</span><span>OPP W-L</span><span>RESULT</span></div>
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
      const side = (t, name) => t ? `<button class="m-vs-side" type="button" data-nav data-nav-group="links" data-to="${menuTeamPath(t.id)}">${teamMark(t, "m-preview-mark")}<b>${_esc(t.school)}</b></button>`
                                  : `<div class="m-vs-side"><b>${_esc(name || "TBD")}</b><span class="m-sub">not in our team list</span></div>`;
      detail.innerHTML = `
        <div class="m-vs">${side(team)}<span class="m-vs-at">${g.is_home ? "vs" : "@"}</span>${side(opp, g.opponent)}</div>
        ${menuBar(team.school, menuTeamOvr(team, d))}
        ${opp ? menuBar(opp.school, menuTeamOvr(opp, d)) : ""}
        <p class="m-note">${g.season_type === "postseason" ? "Postseason game · " : ""}${g.result ? `Final: ${g.result} ${g.team_score}–${g.opp_score ?? 0}` : "Not played yet"} · ${_esc(String(g.game_date || "").slice(0, 10))}${g.venue ? ` · ${_esc(g.venue)}` : ""}</p>`;
    });
  },
  prefer: () => ".m-row--sched.is-next",
});

// ── Standings ─────────────────────────────────────────────────────────────

menuRouter.register("standings", {
  title: "Standings",
  crumb: () => "LEAGUE › STANDINGS",
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
      <button class="m-row m-row--stand${r.team.id === MENU.teamId ? " is-mine" : ""}" type="button" data-nav data-nav-group="stand" data-to="${menuTeamPath(r.team.id)}">
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
});

// ── Rankings ──────────────────────────────────────────────────────────────

menuRouter.register("rankings", {
  title: "Rankings",
  crumb: () => "LEAGUE › RANKINGS",
  prompts: [{ action: "move", label: "Move" }, { action: "tabs", label: "List" },
            { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  tabs: ctx => {
    const d = ctx.d;
    if (!d) return null;
    const items = [];
    if (d.live) items.push({ id: "live", label: `To date · wk ${d.live.through_week}` });
    items.push({ id: "pre", label: isProjectedSeason(MENU.season) ? "Preseason" : "Final" });
    items.push({ id: "polls", label: "Polls" });
    return { items, active: ctx.list, go: id => menuRouter.go(`#/rankings/${id}/${ctx.view || "top"}`) };
  },
  // The first team row starts selected (so its power panel is open), not the view chips above the list.
  prefer: () => "button.m-row--rank",
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    ctx.d = d; ctx.team = menuMyTeam(d);
    ctx.list = ctx.params[0] || (d.live ? "live" : "pre");
    ctx.view = ctx.params[1] === "all" ? "all" : "top";
    if (ctx.list === "polls") {
      return `<section class="m-panel"><p class="m-empty">Polls (AP, Coaches, CFP) are not shown: no poll data is on disk, and fetching it
        needs a CollegeFootballData /rankings harvest. The lists beside this one are our own team ratings.</p></section>`;
    }
    // The list, by one of the methods the chips offer (menuRankMethods): power from the games alone, power with a rating part added, or the rating.
    // A season being played can also be read as it stood after any completed week. The rating is shown beside the ranking either way, and the
    // detail panel explains the number.
    const live = ctx.list === "live";
    const wk = live ? await fetchWeeklyTeams(MENU.season) : null;
    ctx.method = menuRankMethod(ctx.list, ctx.params[2]);
    ctx.week = live ? menuRankWeek(ctx.params[3], wk, d.live.through_week) : null;
    const snap = live ? menuRankSnapshot(d, wk, ctx.week) : null;
    const prev = live ? menuRankPrev(d, wk, ctx.week, ctx.method) : null;
    ctx.snap = snap;
    const val = t => live ? snap.get(t.id)?.head : t.overall_rating;
    const sortKey = t => live ? menuRankKey(ctx.method, snap.get(t.id)) : ctx.method === "rating" ? t.overall_rating : t.power_rating;
    const pw = t => live ? (ctx.method === "blend" ? snap.get(t.id)?.blend : snap.get(t.id)?.games) : t.power_rating;
    const ranked = d.teams.filter(t => sortKey(t) != null).sort((a, b) => sortKey(b) - sortKey(a));
    ctx.ranked = ranked; ctx.pw = pw; ctx.val = val;
    const mineIdx = ranked.findIndex(t => t.id === MENU.teamId);
    const recordOf = t => {
      const e = live && ctx.week != null ? snap.get(t.id) : null;
      return e && e.w != null ? `${e.w}-${e.l}` : d.standings[t.id] ? `${d.standings[t.id].w}-${d.standings[t.id].l}` : "—";
    };
    const lastHead = live && ctx.method === "blend" ? "BLEND" : "POWER";
    const lastTitle = ctx.method === "blend" && live ? "Points per game above an average team: the rating part plus the results part" : "Points per game above an average team";
    const row = (t, i) => `
      <button class="m-row m-row--rank${t.id === MENU.teamId ? " is-mine" : ""}" type="button" data-nav data-nav-group="rank" data-team="${t.id}" data-to="${menuTeamPath(t.id)}">
        <span class="m-rank">${i + 1}${live ? menuRankMove(i + 1, prev ? prev.get(t.id) ?? null : null) : ""}</span>
        <span class="m-pname">${teamMark(t, "m-row-mark")} ${_esc(t.school)}</span>
        <span class="m-pmeta">${_esc(t.conference || "")}</span>
        <span class="m-num">${recordOf(t)}</span>
        <span class="m-rating">${live ? livePill({ live_rating: val(t), live_through_week: ctx.week ?? d.live.through_week }) : ovrPill(val(t), { season: MENU.season, label: "Team rating" })}</span>
        <span class="m-num" title="${lastTitle}">${menuPowerText(pw(t))}</span>
      </button>`;
    // Two views of the same list: the top 25 (with your team's row below it when it is lower) or every ranked team.
    const all = ctx.view === "all";
    const top = (all ? ranked : ranked.slice(0, 25)).map(row).join("");
    const mineRow = !all && mineIdx >= 25 ? `<div class="m-gap">· · ·</div>${row(ranked[mineIdx], mineIdx)}` : "";
    const href = (view, method, week) => `#/rankings/${ctx.list}/${view}/${method}${week != null ? `/w${week}` : ""}`;
    const chip = (to, text, on, title = "") => `<button class="m-chip${on ? " is-view" : ""}" type="button" data-nav data-nav-group="links" data-to="${to}"${on ? ' aria-current="true"' : ""}${title ? ` title="${_esc(title)}"` : ""}>${text}</button>`;
    const methods = menuRankMethods(ctx.list);
    const latest = live ? d.live.through_week : null;
    const weekChips = live && wk ? wk.weeks.map(w => chip(href(ctx.view, ctx.method, w === latest ? null : w), `W${w}`, (ctx.week ?? latest) === w, w === latest ? "The current numbers, through the latest completed week" : `As it stood after week ${w}`)).join("") : "";
    const how = methods.find(m => m[0] === ctx.method);
    const status = live
      ? (ctx.week != null ? `This is the ranking as it stood after week ${ctx.week}, from the games through it; the arrows are movement since week ${ctx.week - 1}.`
        : "To date is built from this season's games so far; provisional. The arrows are movement since the week before.")
      : isProjectedSeason(MENU.season) ? "Preseason has no results yet, so power is the projection alone." : "Final for a played season.";
    return `<div class="m-facts m-viewbar">${chip(href("top", ctx.method, ctx.week), "Top 25", ctx.view === "top")}${chip(href("all", ctx.method, ctx.week), `All FBS · ${ranked.length}`, ctx.view === "all")}
        <button class="m-chip" type="button" data-nav data-nav-group="links" data-to="#/compare/power/${ctx.list}">Compare the readings →</button></div>
      <div class="m-facts m-viewbar" role="group" aria-label="Rank by"><span class="m-viewlabel">RANK BY</span>${methods.map(([id, label, what]) => chip(href(ctx.view, id, ctx.week), label, ctx.method === id, what)).join("")}</div>
      ${weekChips ? `<div class="m-facts m-viewbar" role="group" aria-label="Week"><span class="m-viewlabel">WEEK</span>${weekChips}</div>` : ""}
    <div class="m-split m-split--roster">
      <section class="m-panel m-list" aria-label="${all ? `All ${ranked.length} ranked teams` : "Top 25"}">
        <div class="m-rowhead m-row--rank"><span>#</span><span>TEAM</span><span>CONF</span><span title="Regular season; the postseason is on the team's panel">REC</span><span>RATING</span><span>${lastHead}</span></div>
        ${top}${mineRow}
      </section>
      <aside class="m-panel m-detail" id="m-detail" aria-live="polite"><p class="m-empty">Select a team to see how its number is made.</p></aside>
    </div>
    <p class="m-foot">Ranked by <b>${_esc(how[1])}</b>: ${_esc(how[2])} Our own numbers, not a poll, and nothing external: no SP+, strength of schedule or strength of record. ${status}</p>`;
  },
  mount(stage, ctx) {
    const detail = stage.querySelector("#m-detail");
    if (!detail) return;
    const byId = new Map((ctx.ranked || []).map((t, i) => [String(t.id), { t, rank: i + 1 }]));
    let token = 0;
    // The panel follows the selection: the team's power in its two parts and the games behind the results part.
    stage.addEventListener("menu:select", async e => {
      const hit = byId.get(e.target.closest?.("[data-team]")?.dataset.team);
      if (!hit) return;
      const mine = ++token;
      try {
        // Another week has no per-game table (it is built from today's games), and the rating method has none by design.
        if (ctx.week != null) { detail.innerHTML = menuWeekRankPanel(hit.t, hit.rank, ctx.snap.get(hit.t.id), ctx.week, ctx); return; }
        if (ctx.method === "rating") { detail.innerHTML = menuRatingPanel(hit.t, hit.rank, ctx); return; }
        const games = (await fetchPowerGames(MENU.season))[String(hit.t.id)] || [];
        if (mine !== token) return;
        detail.innerHTML = menuPowerPanel(hit.t, hit.rank, ctx, games);
        // The games behind the results part come from their own file; if it failed, say so rather
        // than let an empty table read as "no games".
        if (dataFailed(`power_games_${MENU.season}.json`)) detail.insertAdjacentHTML("beforeend", '<p class="m-foot m-foot--warn" role="alert">The games behind this number did not load. Select the team again to retry.</p>');
      } catch (err) {
        if (mine === token) detail.innerHTML = `<p class="m-empty" role="alert">This explanation could not be drawn: ${_esc(err && err.message ? err.message : err)}</p>`;
      }
    });
  },
});

// The explanation of one team's power for the Rankings screen: the two parts that add up to it
// (rating, results), each with where it comes from, then every game that fed the results part with
// what it was worth, what the ratings expected, and the difference.
function menuPowerPanel(t, rank, ctx, games) {
  const d = ctx.d, live = ctx.list === "live";
  const lv = d.liveById[t.id];
  const power = ctx.pw(t), rating = ctx.val(t);
  const blend = live && ctx.method === "blend";
  const ratingPart = live ? (blend ? lv?.rating_part_blend : lv?.rating_part) : t.rating_part;
  const resultsPart = live ? (blend ? lv?.results_blend : lv?.results_rating) : t.results_rating;
  const n = live ? lv?.results_games : t.results_games;
  const expectedOf = g => (blend && g.expected_blend != null ? g.expected_blend : g.expected);
  const overOf = g => (blend && g.over_blend != null ? g.over_blend : g.over);
  const st = d.standings[t.id];
  const gameRow = g => `<tr class="${g.margin > 0 ? "is-win" : g.margin < 0 ? "is-loss" : ""}">
      <td>${g.post ? "POST" : `W${g.week ?? "—"}`}</td><td>${g.home ? "vs" : g.neutral ? "n" : "@"} ${g.opp_id != null && d.teams.some(x => x.id === g.opp_id) ? `<button class="m-chip m-chip--tiny" type="button" data-nav data-nav-group="links" data-to="${menuTeamPath(g.opp_id)}">${_esc(g.opp || "—")}</button>` : _esc(g.opp || "—")}</td>
      <td>${g.margin > 0 ? "W" : g.margin < 0 ? "L" : "T"} ${g.score}–${g.opp_score}</td>
      <td>${menuPowerText(g.value)}</td><td>${menuPowerText(expectedOf(g))}</td><td><b>${menuPowerText(overOf(g))}</b></td></tr>`;
  const rows = games.filter(g => !g.post).map(gameRow).join("");
  // Bowls and the playoff are listed apart: power does not count them yet, so they must not sit in the
  // table that adds up to the results part.
  const postRows = games.filter(g => g.post).map(gameRow).join("");
  return `<h2 class="m-detail-name">${_esc(t.school)} · #${rank}</h2>
    <div class="m-facts"><span title="Regular season, then the postseason">${recordText(st)}</span><span>${_esc(t.conference || "")}</span>
      <button class="m-chip" type="button" data-nav data-nav-group="links" data-to="${menuTeamPath(t.id)}">Open team page →</button></div>
    <div class="m-pparts">
      <div><span>RATING PART</span><b>${menuPowerText(ratingPart)}</b><small>${blend ? (lv?.play_rating == null ? "" : `play rating ${lv.play_rating.toFixed(1)} (roster and stats), against the league average`) : live ? "not used by this method: power is the games alone" : rating == null ? "" : `team rating ${rating.toFixed(1)}, against the league average`}</small></div>
      <i>+</i>
      <div><span>RESULTS PART</span><b>${menuPowerText(resultsPart)}</b><small>${n ? `from ${n} game${n === 1 ? "" : "s"}, below` : "no games yet"}</small></div>
      <i>=</i>
      <div class="is-total"><span>POWER</span><b>${menuPowerText(power)}</b><small>points a game above an average team</small></div>
    </div>
    ${rows ? `<table class="m-ptable"><thead><tr><th>WK</th><th>OPPONENT</th><th>RESULT</th><th title="Margin (capped at 28) plus 8 for a win or minus 8 for a loss">VALUE</th><th title="What the two teams' ratings expected the game to be worth">EXPECTED</th><th title="Value minus expected: the game's contribution to the results part">OVER</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="m-note">Value is the margin (capped at 28) plus 8 for a win or minus 8 for a loss. Expected comes from the two ratings and the home edge. The results part is about the average of OVER, pulled toward 0 for a team with few games. A loss costs its 8 and its margin; a win over a team the ratings call weak earns little.</p>`
      : '<p class="m-note">No game-by-game table for this list.</p>'}
    ${postRows ? `<h3 class="m-h3">Postseason: shown, not counted</h3>
      <table class="m-ptable"><tbody>${postRows}</tbody></table>
      <p class="m-note">Bowls and the playoff are not in the results part above. How much they should weigh is still being measured, so they are listed with the same value and expected columns and left out of the sum.</p>` : ""}`;
}

// The detail panel when the rankings are by the rating itself: the three readings it is made of, their shares and the numbers.
function menuRatingPanel(t, rank, ctx) {
  const d = ctx.d, live = ctx.list === "live";
  const lv = d.liveById[t.id], sr = t.sub_ratings || {};
  const w = CONFIG.HEADLINE_WEIGHTS || {};
  const read = key => (live ? lv?.[`${key}_half`] : sr[`${key}_half`]);
  const rows = [["roster", "Roster", "its players' ratings, by starters and depth in every position group"], ["stats", "Stats", "yards, third downs, sacks and tackles for loss, adjusted for the schedule"],
                ["results", "Results", "points scored and allowed against the opponents played, adjusted for their strength"]]
    .map(([k, label, what]) => `<tr><th scope="row">${label}</th><td>${read(k) == null ? "—" : read(k).toFixed(1)}</td><td>${w[k] == null ? "" : `${Math.round(w[k] * 100)}%`}</td><td>${_esc(what)}</td></tr>`).join("");
  const st = d.standings[t.id];
  return `<h2 class="m-detail-name">${_esc(t.school)} · #${rank}</h2>
    <div class="m-facts"><span title="Regular season, then the postseason">${recordText(st)}</span><span>${_esc(t.conference || "")}</span>
      <button class="m-chip" type="button" data-nav data-nav-group="links" data-to="${menuTeamPath(t.id)}">Open team page →</button></div>
    <div class="m-pparts"><div class="is-total"><span>RATING</span><b>${ctx.val(t) == null ? "—" : Math.round(ctx.val(t))}</b><small>${live ? "earned to date" : "team rating"}</small></div></div>
    <table class="m-ptable m-cmp-table"><thead><tr><th>READING</th><th>VALUE</th><th>SHARE</th><th>WHAT IT IS</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="m-note">The rating is these three readings blended at the shares shown. The results reading looks at the scoreboard, so the rating is not blind to results; power is what adds margin and the win bonus on top. ${isProjectedSeason(MENU.season) && !live ? "A preseason list has no stats or results reading of its own." : ""}</p>`;
}

// ── Compare the readings ──────────────────────────────────────────────────

// The columns of the Compare screen: key, label, what it is. Power is our ranking (the Rankings screen sorts by it);
// the others are the number the team is rated at and the three readings that number is made of.
const MENU_CMP = [
  ["power", "Power", "Our ranking: how the team has played, margin and result against the opponents it met, in points per game above an average team. A finished season adds the team rating; a season being played uses the games alone."],
  ["head", "Headline", "The team rating: roster, stats and results blended (the shares are below)."],
  ["results", "Results", "The points the team has scored and allowed against the opponents it played, adjusted for their strength."],
  ["roster", "Roster", "Its players' ratings, scored by starters and depth in every position group."],
  ["stats", "Stats", "Yards, third downs, sacks and tackles for loss, adjusted for the schedule. The same games as the roster's player stats."],
];

// How many places a reading's rank may sit from power's rank before its cell says so.
const MENU_CMP_GAP = 20;

// One team's five numbers for a list: "live" is earned to date (the live file), anything else the season's own
// team ratings. A reading that is not on file is null, never a default.
function menuCmpValues(t, d, list) {
  const n = v => (v == null ? null : v);
  if (list === "live") {
    const lv = d.liveById[t.id] || {};
    return { power: n(lv.power_rating), head: n(lv.overall_rating), roster: n(lv.roster_half), stats: n(lv.stats_half), results: n(lv.results_half) };
  }
  const sr = t.sub_ratings || {};
  // A preseason list of a season not yet played has no stats or results of its own: only the rating and power, as on the Rankings screen.
  const none = isProjectedSeason(MENU.season);
  return { power: n(t.power_rating), head: n(t.overall_rating), roster: none ? null : n(sr.roster_half), stats: none ? null : n(sr.stats_half), results: none ? null : n(sr.results_half) };
}

// Every team that has a power number, each with its five values and its rank on each (1 is best; a missing value has no rank).
function menuCmpRows(d, list) {
  const rows = d.teams.map(t => ({ t, v: menuCmpValues(t, d, list), rank: {} })).filter(r => r.v.power != null);
  for (const [key] of MENU_CMP) {
    const vals = rows.map(r => r.v[key]).filter(x => x != null);
    for (const r of rows) r.rank[key] = r.v[key] == null ? null : 1 + vals.filter(x => x > r.v[key]).length;
  }
  return rows;
}

// Why a reading is blank, for the tooltip: a dash is never unexplained.
function menuCmpWhy(key, list) {
  if (list !== "live" && isProjectedSeason(MENU.season)) return "A preseason list has no stats, results or roster reading of its own: only the rating and power";
  return `No ${key} reading on file for this team`;
}

// A reading as a rating pill: the to-date pill for a live list, the plain pill for a played season, the projected pill for a
// preseason list (ovrPill derives that from the season).
function menuCmpPill(v, d, list, label) {
  if (list === "live") return livePill({ live_rating: v, live_through_week: d.live.through_week });
  return ovrPill(v, { label, season: MENU.season });
}

// One cell of a row: the value and, under it, its rank. A reading ranked MENU_CMP_GAP or more places away from power's is
// marked with an arrow (up: the reading likes the team more than our ranking does) and says how far in its tooltip.
function menuCmpCell(r, key, d, list) {
  const v = r.v[key];
  if (v == null) return `<span class="m-cmp"><span class="trio-na" title="${_esc(menuCmpWhy(key, list))}">—</span></span>`;
  const gap = key === "power" ? 0 : r.rank.power - r.rank[key];
  const flagged = Math.abs(gap) >= MENU_CMP_GAP;
  const mark = flagged ? (gap > 0 ? " ▲" : " ▼") : "";
  const title = flagged ? ` title="${_esc(`Ranks ${Math.abs(gap)} places ${gap > 0 ? "higher" : "lower"} than our ranking`)}"` : "";
  const label = MENU_CMP.find(c => c[0] === key)[1];
  const body = key === "power" ? `<b class="m-cmp-pw">${menuPowerText(v)}</b>` : menuCmpPill(v, d, list, `${label} reading`);
  return `<span class="m-cmp">${body}<small class="m-cmp-rank${flagged ? " is-gap" : ""}"${title}>#${r.rank[key]}${mark}</small></span>`;
}

// The detail panel for the selected team: its five numbers with ranks, what each is, the headline's shares, and the
// readings that disagree with our ranking by MENU_CMP_GAP places or more.
function menuCmpPanel(r, ctx) {
  const w = CONFIG.HEADLINE_WEIGHTS || {};
  const pct = x => (x == null ? "" : `${Math.round(x * 100)}% of the headline`);
  const share = { roster: pct(w.roster), stats: pct(w.stats), results: pct(w.results) };
  const rows = MENU_CMP.map(([key, label, what]) => `<tr><th scope="row">${label}</th>
      <td>${r.v[key] == null ? "—" : key === "power" ? menuPowerText(r.v[key]) : r.v[key].toFixed(1)}</td>
      <td>${r.rank[key] == null ? "—" : `#${r.rank[key]}`}</td>
      <td>${_esc(what)}${share[key] ? ` <b>${share[key]}.</b>` : ""}</td></tr>`).join("");
  const off = MENU_CMP.filter(([key]) => key !== "power" && r.rank[key] != null && Math.abs(r.rank.power - r.rank[key]) >= MENU_CMP_GAP)
    .map(([key, label]) => { const g = r.rank.power - r.rank[key]; return `${label} ranks ${Math.abs(g)} places ${g > 0 ? "higher" : "lower"}`; });
  const st = ctx.d.standings[r.t.id];
  return `<h2 class="m-detail-name">${_esc(r.t.school)} · #${r.rank.power ?? "—"}</h2>
    <div class="m-facts"><span title="Regular season, then the postseason">${recordText(st)}</span><span>${_esc(r.t.conference || "")}</span>
      <button class="m-chip" type="button" data-nav data-nav-group="links" data-to="${menuTeamPath(r.t.id)}">Open team page →</button></div>
    <table class="m-ptable m-cmp-table"><thead><tr><th>READING</th><th>VALUE</th><th>RANK</th><th>WHAT IT IS</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="m-note">${off.length ? `Against our ranking (power, #${r.rank.power}): ${off.join("; ")}.` : "No reading is 20 or more places from our ranking."}</p>`;
}

menuRouter.register("compare", {
  title: "Compare",
  crumb: () => "LEAGUE › RANKINGS › COMPARE",
  prompts: [{ action: "move", label: "Move" }, { action: "tabs", label: "Sort by" },
            { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  tabs: ctx => ({ items: MENU_CMP.map(([id, label]) => ({ id, label })), active: ctx.key,
                  go: id => menuRouter.go(`#/compare/${id}/${ctx.list}`) }),
  prefer: () => "button.m-row--cmp",
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    ctx.d = d; ctx.team = menuMyTeam(d);
    ctx.key = MENU_CMP.some(c => c[0] === ctx.params[0]) ? ctx.params[0] : "power";
    ctx.list = ctx.params[1] === "pre" || !d.live ? "pre" : "live";
    const rows = menuCmpRows(d, ctx.list).sort((a, b) => (b.v[ctx.key] ?? -1e9) - (a.v[ctx.key] ?? -1e9));
    ctx.rows = rows;
    const body = rows.map((r, i) => `
      <button class="m-row m-row--cmp${r.t.id === MENU.teamId ? " is-mine" : ""}" type="button" data-nav data-nav-group="cmp" data-team="${r.t.id}" data-to="${menuTeamPath(r.t.id)}">
        <span class="m-rank">${r.v[ctx.key] == null ? "—" : i + 1}</span>
        <span class="m-pname">${teamMark(r.t, "m-row-mark")} ${_esc(r.t.school)}</span>
        ${["power", "head", "results", "roster", "stats"].map(k => menuCmpCell(r, k, d, ctx.list)).join("")}
      </button>`).join("");
    const srcChip = (id, text) => `<button class="m-chip${ctx.list === id ? " is-view" : ""}" type="button" data-nav data-nav-group="links" data-to="#/compare/${ctx.key}/${id}"${ctx.list === id ? ' aria-current="true"' : ""}>${text}</button>`;
    const w = CONFIG.HEADLINE_WEIGHTS || {};
    const preNote = ctx.list !== "live" && isProjectedSeason(MENU.season)
      ? '<p class="m-note">A preseason list has only the rating and power: the roster, stats and results readings are blank because the games have not been played.</p>' : "";
    return `<div class="m-facts m-viewbar">${d.live ? srcChip("live", `To date · wk ${d.live.through_week}`) : ""}${srcChip("pre", isProjectedSeason(MENU.season) ? "Preseason" : "Final")}
        <button class="m-chip" type="button" data-nav data-nav-group="links" data-to="#/rankings/${ctx.list}/all">All FBS ranking →</button></div>
      ${preNote}
      <div class="m-split m-split--roster">
        <section class="m-panel m-list" aria-label="All ${rows.length} teams, five readings">
          <div class="m-rowhead m-row--cmp"><span>#</span><span>TEAM</span><span title="Our ranking">POWER</span><span>HEADLINE</span><span>RESULTS</span><span>ROSTER</span><span>STATS</span></div>
          ${body}
        </section>
        <aside class="m-panel m-detail" id="m-detail" aria-live="polite"><p class="m-empty">Select a team to see its five numbers side by side.</p></aside>
      </div>
      <p class="m-foot">Sorted by <b>${MENU_CMP.find(c => c[0] === ctx.key)[1]}</b>; the small number under each is that reading's own rank among the ${rows.length} teams. An arrow marks a reading that
        sits ${MENU_CMP_GAP} or more places from our ranking, which is power: ▲ the reading likes the team more, ▼ less. The headline is ${w.roster != null ? `${Math.round(w.roster * 100)}% roster, ${Math.round(w.stats * 100)}% stats and ${Math.round(w.results * 100)}% results` : "the three readings blended"}.
        Roster and stats are built from the same box scores, so they usually agree; results are the scoreboard. ${ctx.list === "live" ? "To date is provisional." : ""}</p>`;
  },
  mount(stage, ctx) {
    const detail = stage.querySelector("#m-detail");
    if (!detail) return;
    const byId = new Map((ctx.rows || []).map(r => [String(r.t.id), r]));
    stage.addEventListener("menu:select", e => {
      const hit = byId.get(e.target.closest?.("[data-team]")?.dataset.team);
      if (hit) detail.innerHTML = menuCmpPanel(hit, ctx);
    });
  },
});

// ── Transfer portal ───────────────────────────────────────────────────────

menuRouter.register("portal", {
  title: "Transfer Portal",
  crumb: () => "LEAGUE › TRANSFER PORTAL",
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
      <button class="m-row m-row--portal" type="button" data-nav data-nav-group="portal"${r.player_id ? ` data-to="${menuPlayerPath(r.player_id)}"` : ""}>
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
  crumb: () => "LEAGUE › RECRUITING",
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
        <button class="m-row m-row--prospect" type="button" data-nav data-nav-group="prospect"${p.player_id ? ` data-to="${menuPlayerPath(p.player_id)}"` : ""}>
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
      <button class="m-row m-row--class${t.team_id === MENU.teamId ? " is-mine" : ""}" type="button" data-nav data-nav-group="class" data-to="${menuTeamPath(t.team_id, "recruiting")}">
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
