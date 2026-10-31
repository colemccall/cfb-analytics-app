// menuWeekly.js — the week-by-week view of a season being played: a team's rating and units, a player's rating and game log, and the
// rankings as they stood after any completed week.
//
// Reads weekly_teams_{season}.json and weekly_players_{season}.json (script 17b), gamelog_{season}_{team}.json (script 12) and the
// schedule the page already holds, through dataLoader. A week with no number is a gap that says why; nothing is filled in. A chart
// (ui.js trendChart) is the shape and the table under it is the numbers, so neither is the only way to read a value.
//
// Must never contain: fetch calls or routing logic.
//
// Load order: after menuCard.js.

// A rating as a pill for the weekly tables: the same colour scale as every other rating, marked as earned-to-date.
function menuWeekPill(v, title = "") {
  if (v == null) return '<span class="trio-na">—</span>';
  const n = Math.round(v), c = ratingColor(n);
  return `<span class="ovr-badge is-live" style="background:${c};color:${ratingTextColor(c)}" title="${_esc(title)}">${n}</span>`;
}

// A change between two ratings as the pills show them (rounded): "▲ +3", "▼ -2", "→ 0", or a dash when either is missing.
function menuWeekChange(cur, prev, title = "") {
  if (cur == null || prev == null) return '<span class="trio-na">—</span>';
  return deltaChip(Math.round(cur) - Math.round(prev), { digits: 0, title });
}

// "W 24–10 @ Utah" for one game of a schedule, or "Bye" when the team has no game that week.
function menuWeekGameText(g) {
  if (!g) return "Bye";
  const where = g.is_home ? "vs" : g.neutral_site ? "n" : "@";
  return `${g.result || ""} ${g.team_score}–${g.opp_score} ${where} ${g.opponent || "TBD"}`.trim();
}

// One line above a chart: where the number started, where it is, its high and its low. `rows` are {week, value}; a week with no
// value is skipped. Empty when fewer than two weeks have one (there is no change to speak of).
function menuWeekSummary(rows, extra = "") {
  const rated = rows.filter(r => r.value != null);
  if (rated.length < 2) return "";
  const first = rated[0], last = rated[rated.length - 1];
  const peak = rated.reduce((a, b) => (b.value > a.value ? b : a)), low = rated.reduce((a, b) => (b.value < a.value ? b : a));
  return `<div class="m-facts m-weeksum"><span><b>W${first.week} ${Math.round(first.value)} → W${last.week} ${Math.round(last.value)}</b> ${menuWeekChange(last.value, first.value, `Change from week ${first.week} to week ${last.week}`)}</span>
    <span>High ${Math.round(peak.value)} (W${peak.week})</span><span>Low ${Math.round(low.value)} (W${low.week})</span>${extra}</div>`;
}

// ── Team: rating by week, then the units ─────────────────────────────────────────────────────────────────────────────

// The units a team is made of, as rows of the matrix under the table: [group, [[label, value from a weekly row]]]. Position groups are
// the roster reading's own parts (starters plus depth, on the player scale); the offensive line is not in the weekly numbers.
const MENU_UNIT_ROWS = [
  ["Team", [["Rating", r => r.head], ["Offense", r => r.off], ["Defense", r => r.def]]],
  ["Readings", [["Roster", r => r.roster], ["Stats", r => r.stats], ["Results", r => r.results]]],
  ["Position groups", ["QB", "RB", "WR", "TE", "DL", "LB", "DB", "K", "P"].map(g => [g, r => (r.groups ? r.groups[g] : null)])],
];

// The matrix of units by week: a row per unit, a pill per week and the change from its first week to its last, so "how the team
// changed as a unit" reads left to right. A unit with no value in any week (a team with no rated kicker) has no row.
function menuWeeklyUnitsHtml(rows) {
  const head = `<tr><th scope="col">UNIT</th>${rows.map(r => `<th scope="col">W${r.week}</th>`).join("")}<th scope="col" title="First week to last week">CHANGE</th></tr>`;
  const body = MENU_UNIT_ROWS.map(([group, units]) => {
    const lines = units.map(([label, get]) => {
      const vals = rows.map(get);
      const have = vals.filter(v => v != null);
      if (!have.length) return "";
      return `<tr><th scope="row">${_esc(label)}</th>${vals.map((v, i) => `<td>${menuWeekPill(v, `${label}, after week ${rows[i].week}`)}</td>`).join("")}<td>${menuWeekChange(have[have.length - 1], have[0], `${label}: first to last week`)}</td></tr>`;
    }).join("");
    return lines ? `<tr class="m-unit-group"><th colspan="${rows.length + 2}" scope="colgroup">${_esc(group)}</th></tr>${lines}` : "";
  }).join("");
  return `<h3 class="m-h3">How the units changed</h3>
    <div class="m-twrap"><table class="m-ptable m-ptable--units"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <p class="m-note">Offense and defense are the team's two halves of the rating. Roster, stats and results are the three readings the rating is made of. Each position group is its starters plus depth on the player scale: a group changes when its players play better or worse, when the depth chart moves, or when a player is hurt or leaves. The first weeks of the roster reading are held down by the low-game rule (a player with one or two games is capped at 72), so part of an early rise is that cap lifting as games accumulate. The offensive line is not here (the line unit has no weekly version).</p>`;
}

// The weekly section for a team: the summary, a chart with the rating on it, a table of the weeks and the units matrix. `rows` are the
// team's weekly rows (week, w, l, head, power, rk_head, rk_power, gid, grade, off, def, roster, stats, results, groups); `sched` is its schedule.
function menuWeeklyTeamHtml(team, rows, sched) {
  const byGame = new Map((sched || []).map(g => [g.game_id, g]));
  const points = rows.map(r => ({
    week: r.week, value: r.head, grade: r.grade ?? null,
    tip: `Week ${r.week}: rating ${r.head == null ? "none" : Math.round(r.head)}, #${r.rk_head}${r.gid != null ? `; ${menuWeekGameText(byGame.get(r.gid))}, game grade ${Math.round(r.grade)}` : "; no game"}`,
  }));
  const body = rows.map((r, i) => {
    const g = r.gid != null ? byGame.get(r.gid) : null;
    const prev = i ? rows[i - 1] : null;
    return `<tr><td>W${r.week}</td><td>${r.w}-${r.l}</td><td>${menuWeekPill(r.head, `Rating after week ${r.week}`)}</td>
      <td>${prev ? menuWeekChange(r.head, prev.head, `Change from week ${prev.week}`) : '<span class="trio-na">—</span>'}</td>
      <td>#${r.rk_head}</td><td class="m-wk-power">#${r.rk_power}</td><td class="m-wk-game">${_esc(r.gid != null ? menuWeekGameText(g) : "Bye")}</td>
      <td>${r.grade != null ? menuWeekPill(r.grade, `Game grade, week ${r.week}`) : '<span class="trio-na">—</span>'}</td></tr>`;
  }).join("");
  const graded = rows.filter(r => r.grade != null);
  const best = graded.length ? graded.reduce((a, b) => (b.grade > a.grade ? b : a)) : null;
  const worst = graded.length ? graded.reduce((a, b) => (b.grade < a.grade ? b : a)) : null;
  const first = rows[0], last = rows[rows.length - 1];
  const rankMove = first && last && first !== last ? `<span>Rank #${first.rk_head} → #${last.rk_head}</span>` : "";
  return `${menuWeekSummary(rows.map(r => ({ week: r.week, value: r.head })), rankMove)}
    ${trendChart(points, { label: `${team.school} rating after each week of ${MENU.season}`, labels: true })}
    ${best && worst && best !== worst ? `<div class="m-facts"><span>Best game: W${best.week}, grade ${Math.round(best.grade)}</span><span>Weakest game: W${worst.week}, grade ${Math.round(worst.grade)}</span></div>` : ""}
    <div class="m-twrap"><table class="m-ptable m-ptable--weeks"><thead><tr><th>WK</th><th>REC</th><th title="The team rating after that week's games">RATING</th>
      <th title="Change from the week before">CHANGE</th><th title="Rank by rating among all FBS teams that week">RANK</th><th class="m-wk-power" title="Rank by power that week">POWER</th><th class="m-wk-game">GAME</th><th title="That one game, on the rating scale">GRADE</th></tr></thead>
      <tbody>${body}</tbody></table></div>
    ${menuWeeklyUnitsHtml(rows)}
    <p class="m-note">Rating is the team rating (roster, stats and results) as it stood after that week, built from the games through it and nothing later. Grade is that one game as a team: its margin (capped at 28, the home edge taken off) plus the opponent's strength that week (every FCS opponent is one pooled team, so a win over one grades low), on the same scale. The offensive-line unit is not in these numbers, so the latest week can differ from the team's current rating by up to about one point.</p>`;
}

// Fills a team page's Week by week panel after the page is drawn. A failure is said in the panel.
async function menuFillWeeklyTeam(el, team, d) {
  const head = '<h3 class="m-h3">Week by week</h3>';
  try {
    const wk = await fetchWeeklyTeams(MENU.season);
    if (!el.isConnected) return;
    if (!wk) { el.innerHTML = `${head}<p class="m-empty">${dataFailed(`weekly_teams_${MENU.season}.json`) ? "The weekly file did not load. Use Retry." : "No week-by-week file for this season."}</p>`; return; }
    const rows = wk.teams[String(team.id)]?.weeks || [];
    if (!rows.length) { el.innerHTML = `${head}<p class="m-empty">No rating for this team after any completed week: a team needs a roster or stats reading to be rated.</p>`; return; }
    el.innerHTML = head + menuWeeklyTeamHtml(team, rows, d.schedules[String(team.id)]);
  } catch (e) {
    if (el.isConnected) el.innerHTML = `${head}<p class="m-empty" role="alert">The weekly view did not draw: ${_esc(e && e.message ? e.message : e)}.</p>`;
  }
}

// ── Player: rating by week ────────────────────────────────────────────────────────────────────────────────────────────

// The weekly section for a player: `rows` are [week, rating, games, basis, game_id, grade] in week order; `sched` is his team's schedule.
function menuWeeklyPlayerHtml(p, rows, sched) {
  const byGame = new Map((sched || []).map(g => [g.game_id, g]));
  const objs = rows.map(([week, rating, games, basis, gid, grade]) => ({ week, rating, games, basis, gid, grade }));
  const points = objs.map(r => ({
    week: r.week, value: r.rating, grade: r.grade,
    tip: `Week ${r.week}: rating ${Math.round(r.rating)} after ${r.games} games${r.gid != null ? `; ${menuWeekGameText(byGame.get(r.gid))}, game grade ${Math.round(r.grade)}` : "; no game"}`,
  }));
  const body = objs.map((r, i) => `<tr><td>W${r.week}</td><td>${menuWeekPill(r.rating, `Rating after week ${r.week}`)}</td>
      <td>${i ? menuWeekChange(r.rating, objs[i - 1].rating, `Change from week ${objs[i - 1].week}`) : '<span class="trio-na">—</span>'}</td><td>${r.games ?? "—"}</td>
      <td>${_esc(r.basis === "P" ? "Production" : "Blended")}</td><td class="m-wk-game">${_esc(r.gid != null ? menuWeekGameText(byGame.get(r.gid)) : "Did not play")}</td>
      <td>${r.grade != null ? menuWeekPill(r.grade, `Game grade, week ${r.week}`) : '<span class="trio-na">—</span>'}</td></tr>`).join("");
  return `${menuWeekSummary(objs.map(r => ({ week: r.week, value: r.rating })))}
    ${trendChart(points, { label: `${p.name} rating after each week of ${MENU.season}`, labels: true })}
    <div class="m-twrap"><table class="m-ptable m-ptable--weeks"><thead><tr><th>WK</th><th title="His rating after that week's games">RATING</th><th title="Change from the week before">CHANGE</th><th>GAMES</th>
      <th title="Production: from his stats alone. Blended: stats with his recruiting profile, while the sample is small.">BASIS</th><th class="m-wk-game">GAME</th><th title="That one game, on the rating scale">GRADE</th></tr></thead>
      <tbody>${body}</tbody></table></div>
    <p class="m-note">Rating is his earned rating to date after that week, rescaled to full-season pace: a scale, not a shrink. A week he held no rating (fewer than three games with a counted stat, or no game) is missing from the table. Grade is that one game's adjusted score read as if every game of a 12-game season looked like it, so a single game swings far more than the running rating does. His box score for each game is on the Games tab.</p>`;
}

// Fills a player card's Week by week panel after the card is drawn.
async function menuFillWeeklyPlayer(el, p, team, pid) {
  const head = '<h3 class="m-h3">Week by week</h3>';
  try {
    const [wk, sched] = await Promise.all([fetchWeeklyPlayers(MENU.season), team ? fetchTeamSchedule(team.id, MENU.season) : []]);
    if (!el.isConnected) return;
    if (!wk) { el.innerHTML = `${head}<p class="m-empty">${dataFailed(`weekly_players_${MENU.season}.json`) ? "The weekly file did not load. Use Retry." : "No week-by-week file for this season."}</p>`; return; }
    const rows = wk.players[String(pid)] || [];
    if (!rows.length) { el.innerHTML = `${head}<p class="m-empty">He has not held a rating after any completed week: he needs three games with a counted stat. Offensive linemen are not rated.</p>`; return; }
    el.innerHTML = head + menuWeeklyPlayerHtml(p, rows, sched);
  } catch (e) {
    if (el.isConnected) el.innerHTML = `${head}<p class="m-empty" role="alert">The weekly view did not draw: ${_esc(e && e.message ? e.message : e)}.</p>`;
  }
}

// ── Player: game by game ──────────────────────────────────────────────────────────────────────────────────────────────

// The columns of a player's per-game box score, by group: [stat key, heading]. The per-game keys are not the season totals' (the game rows
// carry "passingC/ATT" and "kickingFG" where the season carries completions and attempts apart), so they have their own list.
const MENU_GAME_GROUPS = [
  { label: "Passing", cols: [["passingC/ATT", "C/ATT"], ["passingYDS", "YDS"], ["passingAVG", "AVG"], ["passingTD", "TD"], ["passingINT", "INT"], ["passingQBR", "QBR"]] },
  { label: "Rushing", cols: [["rushingCAR", "CAR"], ["rushingYDS", "YDS"], ["rushingAVG", "AVG"], ["rushingTD", "TD"], ["rushingLONG", "LONG"]] },
  { label: "Receiving", cols: [["receivingREC", "REC"], ["receivingYDS", "YDS"], ["receivingAVG", "AVG"], ["receivingTD", "TD"], ["receivingLONG", "LONG"]] },
  { label: "Defense", cols: [["defensiveTOT", "TKL"], ["defensiveSOLO", "SOLO"], ["defensiveTFL", "TFL"], ["defensiveSACKS", "SACK"], ["defensiveQB HUR", "HUR"], ["defensivePD", "PD"], ["defensiveTD", "TD"]] },
  { label: "Interceptions", cols: [["interceptionsINT", "INT"], ["interceptionsYDS", "YDS"], ["interceptionsTD", "TD"]] },
  { label: "Fumbles", cols: [["fumblesFUM", "FUM"], ["fumblesLOST", "LOST"], ["fumblesREC", "REC"]] },
  { label: "Kicking", cols: [["kickingFG", "FG"], ["kickingPCT", "FG%"], ["kickingLONG", "LONG"], ["kickingXP", "XP"], ["kickingPTS", "PTS"]] },
  { label: "Punting", cols: [["puntingNO", "PUNTS"], ["puntingYDS", "YDS"], ["puntingAVG", "AVG"], ["puntingTB", "TB"], ["puntingIn 20", "IN 20"], ["puntingLONG", "LONG"]] },
  { label: "Kick returns", cols: [["kickReturnsNO", "RET"], ["kickReturnsYDS", "YDS"], ["kickReturnsAVG", "AVG"], ["kickReturnsLONG", "LONG"], ["kickReturnsTD", "TD"]] },
  { label: "Punt returns", cols: [["puntReturnsNO", "RET"], ["puntReturnsYDS", "YDS"], ["puntReturnsAVG", "AVG"], ["puntReturnsLONG", "LONG"], ["puntReturnsTD", "TD"]] },
];

// A game's one-line summary for a position, from its stat blob: the numbers a fan reads first. Entries that are false are dropped by the caller.
const MENU_GAME_LINE = {
  QB: s => [s["passingC/ATT"] && `${s["passingC/ATT"]}`, s.passingYDS != null && `${s.passingYDS} yds`, s.passingTD != null && `${s.passingTD} TD`, s.passingINT != null && `${s.passingINT} INT`,
            s.rushingYDS != null && `${s.rushingCAR ?? "?"} car, ${s.rushingYDS} rush yds`],
  RB: s => [s.rushingCAR != null && `${s.rushingCAR} car, ${s.rushingYDS} yds`, s.rushingTD != null && `${s.rushingTD} TD`, s.receivingREC != null && `${s.receivingREC} rec, ${s.receivingYDS} yds`],
  REC: s => [s.receivingREC != null && `${s.receivingREC} rec, ${s.receivingYDS} yds`, s.receivingTD != null && `${s.receivingTD} TD`, s.rushingYDS != null && `${s.rushingYDS} rush yds`],
  DEF: s => [s.defensiveTOT != null && `${s.defensiveTOT} tkl`, s.defensiveTFL != null && Number(s.defensiveTFL) > 0 && `${s.defensiveTFL} TFL`, s.defensiveSACKS != null && Number(s.defensiveSACKS) > 0 && `${s.defensiveSACKS} sk`,
            s.defensivePD != null && Number(s.defensivePD) > 0 && `${s.defensivePD} PD`, s.interceptionsINT != null && `${s.interceptionsINT} INT`],
  K: s => [s.kickingFG && `FG ${s.kickingFG}`, s.kickingXP && `XP ${s.kickingXP}`, s.kickingLONG != null && `long ${s.kickingLONG}`],
  P: s => [s.puntingNO != null && `${s.puntingNO} punts`, s.puntingAVG != null && `${s.puntingAVG} avg`, s.puntingLONG != null && `long ${s.puntingLONG}`],
};

// Which one-line summary a position group uses.
function menuGameLineFor(pg) {
  return pg === "QB" ? "QB" : pg === "RB" ? "RB" : pg === "WR" || pg === "TE" ? "REC" : pg === "K" ? "K" : pg === "P" ? "P" : "DEF";
}

// A stat value from a per-game blob for a cell: the text as stored, a dash when the game row does not hold it (never a zero).
function menuGameCell(v) {
  return v == null || v === "" ? '<span class="trio-na">—</span>' : _esc(String(v));
}

// The Games tab of a player card: a row per game with the opponent, result, his summary line, the game grade and the rating after
// the week, then his full box score by group. `games` is [[game_id, stat blob]] from the team's game log, `sched` the team schedule,
// `weeks` his weekly rows ([week, rating, games, basis, game_id, grade]) or [] when he has none, `pg` his position group.
function menuGamesTabHtml(p, games, sched, weeks, pg) {
  const byGame = new Map((sched || []).map(g => [g.game_id, g]));
  const wk = new Map(weeks.map(r => [r[4], r]));
  const byWeek = new Map(weeks.map(r => [r[0], r]));
  const rows = games.map(([gid, s]) => ({ gid, s, g: byGame.get(gid) })).filter(r => r.g).sort((a, b) => (a.g.week ?? 0) - (b.g.week ?? 0));
  if (!rows.length) return '<p class="m-empty">No game-by-game stats are on file for him this season.</p>';
  const line = MENU_GAME_LINE[menuGameLineFor(pg)];
  const summary = rows.map(({ gid, s, g }) => {
    const w = wk.get(gid), after = byWeek.get(g.week);
    return `<tr><td>W${g.week ?? "—"}</td><td class="m-wk-game">${_esc(menuWeekGameText(g))}</td><td class="m-gl-line">${_esc(line(s).filter(Boolean).join(" · ") || "—")}</td>
      <td>${w && w[5] != null ? menuWeekPill(w[5], `Game grade, week ${g.week}`) : '<span class="trio-na">—</span>'}</td>
      <td>${after ? menuWeekPill(after[1], `Rating after week ${g.week}`) : '<span class="trio-na" title="No rating after this week">—</span>'}</td></tr>`;
  }).join("");
  const groups = MENU_GAME_GROUPS.map(grp => {
    const cols = grp.cols.filter(([k]) => rows.some(r => r.s[k] != null && r.s[k] !== ""));
    if (!cols.length) return "";
    return `<h3 class="m-h3">${_esc(grp.label)}</h3><div class="m-twrap"><table class="m-ptable m-ptable--games"><thead><tr><th>WK</th><th class="m-wk-game">GAME</th>${cols.map(([, h]) => `<th>${_esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(({ s, g }) => `<tr><td>W${g.week ?? "—"}</td><td class="m-wk-game">${_esc(menuWeekGameText(g))}</td>${cols.map(([k]) => `<td>${menuGameCell(s[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }).join("");
  return `<div class="m-twrap"><table class="m-ptable m-ptable--glog"><thead><tr><th>WK</th><th class="m-wk-game">GAME</th><th>LINE</th><th title="That one game, on the rating scale">GRADE</th><th title="His rating after that week's games">RATING</th></tr></thead><tbody>${summary}</tbody></table></div>
    ${groups}
    <p class="m-foot">Every game he is on record in this season, from the box scores: a stat the box score does not list for him is a dash, not a zero. Grade is that game read as a 12-game season; rating is his earned rating to date after the week. A game with no rating beside it came before he had three games with a counted stat.</p>`;
}

// Fills a player card's Games tab: the team's game log, the schedule and his weekly rows, then the tables.
async function menuFillGames(el, p, team, pid, pg) {
  try {
    const [log, sched, wk] = await Promise.all([fetchGameLog(team ? team.id : null, MENU.season), team ? fetchTeamSchedule(team.id, MENU.season) : [], fetchWeeklyPlayers(MENU.season)]);
    if (!el.isConnected) return;
    if (!log) { el.innerHTML = dataFailed(`gamelog_${MENU.season}_${team ? team.id : 0}.json`) ? '<p class="m-empty" role="alert">The game log did not load. Use Retry.</p>' : '<p class="m-empty">No game log is on file for this team.</p>'; return; }
    const games = (log.players || {})[String(pid)] || [];
    const weeks = wk && wk.players ? (wk.players[String(pid)] || []) : [];
    el.innerHTML = menuGamesTabHtml(p, games, sched, weeks, pg);
  } catch (e) {
    if (el.isConnected) el.innerHTML = `<p class="m-empty" role="alert">The game log did not draw: ${_esc(e && e.message ? e.message : e)}.</p>`;
  }
}

// ── Rankings at any week, by method ─────────────────────────────────────────────────────────────────────────────────

// The ways to rank, in the order the chips show them: [id, label, what it is]. A season being played offers all three; a played season
// has the games-only version only inside its power (rating part plus results part), so it offers power and the rating.
const MENU_RANK_LIVE = [
  ["games", "Games only", "Power from the results alone: margin (capped at 28) and win or loss against the opponents played, in points per game above an average team. The default while a season is played."],
  ["blend", "Rating + games", "Power with a rating part added: the roster-and-stats rating in points, plus the results part solved against it. The roster and stats come from the same games, so this counts them twice."],
  ["rating", "Rating", "The team rating: roster 1/6, stats 1/6 and results 2/3. It does look at the results, once, inside the headline."],
];
const MENU_RANK_PLAYED = [
  ["blend", "Power", "The rating part (what the team's players and stats say) plus the results part (how it played against that)."],
  ["rating", "Rating", "The team rating: roster 1/6, stats 1/6 and results 2/3."],
];

// The methods for a list ("live" is the season being played), and a method id made valid: an unknown or missing one is the list's first.
function menuRankMethods(list) { return list === "live" ? MENU_RANK_LIVE : MENU_RANK_PLAYED; }
function menuRankMethod(list, id) { const ms = menuRankMethods(list); return (ms.find(m => m[0] === id) || ms[0])[0]; }

// The week a route asks for ("w5"): a number among the weeks on file, or null for the current numbers (no week, the latest week, or one
// the file does not have).
function menuRankWeek(param, wk, latest) {
  const n = /^w(\d+)$/.test(param || "") ? parseInt(param.slice(1)) : null;
  return n != null && wk && wk.weeks.includes(n) && n !== latest ? n : null;
}

// Every team's three numbers as they stood after `week` of the season being played: Map(team_id -> { head, games, blend }). A null week
// is the current numbers, read from the live file the rest of the site shows; otherwise the weekly file's row for that week. A team with
// no row that week is absent.
function menuRankSnapshot(d, wk, week) {
  const out = new Map();
  if (week == null) {
    for (const t of d.teams) {
      const lv = d.liveById[t.id];
      if (lv && lv.power_rating != null) out.set(t.id, { head: lv.overall_rating, games: lv.power_rating, blend: lv.power_blend ?? null });
    }
    return out;
  }
  for (const [tid, doc] of Object.entries((wk && wk.teams) || {})) {
    const r = doc.weeks.find(x => x.week === week);
    if (r && r.power != null) out.set(Number(tid), { head: r.head, games: r.power, blend: r.blend ?? null, w: r.w, l: r.l });
  }
  return out;
}

// The number a method sorts by, from a snapshot entry.
function menuRankKey(method, e) { return e == null ? null : method === "rating" ? e.head : method === "games" ? e.games : e.blend; }

// Team ids in order, best first, by one method; a team with no number for it is left out.
function menuRankOrder(snap, method) {
  return [...snap.entries()].filter(([, e]) => menuRankKey(method, e) != null).sort((a, b) => menuRankKey(method, b[1]) - menuRankKey(method, a[1])).map(([id]) => id);
}

// Where each team ranked the week before: Map(team_id -> rank), or null when there is no earlier week on file to compare with.
function menuRankPrev(d, wk, week, method) {
  const latest = d.live ? d.live.through_week : null;
  const prevWeek = (week ?? latest) - 1;
  if (!wk || !(prevWeek >= 1) || !wk.weeks.includes(prevWeek)) return null;
  return new Map(menuRankOrder(menuRankSnapshot(d, wk, prevWeek), method).map((id, i) => [id, i + 1]));
}

// "▲3" / "▼2" / "" for a team's movement since the week before; a team new to the list has none.
function menuRankMove(rank, prevRank) {
  if (prevRank == null) return "";
  const m = prevRank - rank;
  return m > 0 ? `<small class="m-mv" title="Up ${m} since the week before">▲${m}</small>` : m < 0 ? `<small class="m-mv" title="Down ${-m} since the week before">▼${-m}</small>` : "";
}

// The detail panel for a team in a past week of the rankings: its numbers then, by each method. (The per-game table behind power is
// computed from today's data, so it is not drawn for an earlier week.)
function menuWeekRankPanel(t, rank, row, week, ctx) {
  const nums = MENU_RANK_LIVE.map(([id, label]) => `<tr><th scope="row">${_esc(label)}</th><td>${menuRankKey(id, row) == null ? "—" : id === "rating" ? Math.round(menuRankKey(id, row)) : menuPowerText(menuRankKey(id, row))}</td></tr>`).join("");
  return `<h2 class="m-detail-name">${_esc(t.school)} · #${rank} <small>after week ${week}</small></h2>
    <div class="m-facts"><span>${_esc(t.conference || "")}</span><button class="m-chip" type="button" data-nav data-nav-group="links" data-to="${menuTeamPath(t.id)}">Open team page →</button></div>
    <table class="m-ptable m-cmp-table"><thead><tr><th>METHOD</th><th>VALUE</th></tr></thead><tbody>${nums}</tbody></table>
    <p class="m-note">These are the numbers as they stood after week ${week}, from the games through it. The team page's Week by week panel has the record, the game that week and its grade, and the units. The game-by-game table behind power is only drawn for the current week.</p>`;
}
