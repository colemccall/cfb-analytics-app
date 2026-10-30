// menuWeekly.js — the week-by-week progression of a season being played: a team's rating and a player's rating as they stood
// after each completed week, with that week's single game graded beside the running number.
//
// Reads weekly_teams_{season}.json and weekly_players_{season}.json (script 17b) through dataLoader and the schedule the page
// already holds for the opponent and the score. A week with no number is a gap that says why; nothing is filled in. The chart
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

// "W 24–10 @ Utah" for one game of a schedule, or "Bye" when the team has no game that week.
function menuWeekGameText(g) {
  if (!g) return "Bye";
  const where = g.is_home ? "vs" : g.neutral_site ? "n" : "@";
  return `${g.result || ""} ${g.team_score}–${g.opp_score} ${where} ${g.opponent || "TBD"}`.trim();
}

// The weekly section for a team: its chart, a table of the weeks and what the numbers are. `rows` are the team's weekly
// rows (week, w, l, head, power, rk_head, rk_power, gid, grade); `sched` is its schedule.
function menuWeeklyTeamHtml(team, rows, sched) {
  const byGame = new Map((sched || []).map(g => [g.game_id, g]));
  const points = rows.map(r => ({
    week: r.week, value: r.head, grade: r.grade ?? null,
    tip: `Week ${r.week}: rating ${r.head == null ? "none" : Math.round(r.head)}, #${r.rk_head}${r.gid != null ? `; ${menuWeekGameText(byGame.get(r.gid))}, game grade ${Math.round(r.grade)}` : "; no game"}`,
  }));
  const body = rows.map(r => {
    const g = r.gid != null ? byGame.get(r.gid) : null;
    return `<tr><td>W${r.week}</td><td>${r.w}-${r.l}</td><td>${menuWeekPill(r.head, `Rating after week ${r.week}`)}</td>
      <td>#${r.rk_head}</td><td class="m-wk-power">#${r.rk_power}</td><td class="m-wk-game">${_esc(r.gid != null ? menuWeekGameText(g) : "Bye")}</td>
      <td>${r.grade != null ? menuWeekPill(r.grade, `Game grade, week ${r.week}`) : '<span class="trio-na">—</span>'}</td></tr>`;
  }).join("");
  const graded = rows.filter(r => r.grade != null);
  const best = graded.length ? graded.reduce((a, b) => (b.grade > a.grade ? b : a)) : null;
  const worst = graded.length ? graded.reduce((a, b) => (b.grade < a.grade ? b : a)) : null;
  return `${trendChart(points, { label: `${team.school} rating after each week of ${MENU.season}` })}
    ${best && worst && best !== worst ? `<div class="m-facts"><span>Best game: W${best.week}, grade ${Math.round(best.grade)}</span><span>Weakest game: W${worst.week}, grade ${Math.round(worst.grade)}</span></div>` : ""}
    <div class="m-twrap"><table class="m-ptable m-ptable--weeks"><thead><tr><th>WK</th><th>REC</th><th title="The team rating after that week's games">RATING</th>
      <th title="Rank by rating among all FBS teams that week">RANK</th><th class="m-wk-power" title="Rank by power that week">POWER</th><th class="m-wk-game">GAME</th><th title="That one game, on the rating scale">GRADE</th></tr></thead>
      <tbody>${body}</tbody></table></div>
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

// The weekly section for a player: `rows` are [week, rating, games, basis, game_id, grade] in week order; `sched` is his team's schedule.
function menuWeeklyPlayerHtml(p, rows, sched) {
  const byGame = new Map((sched || []).map(g => [g.game_id, g]));
  const points = rows.map(([week, rating, games, , gid, grade]) => ({
    week, value: rating, grade,
    tip: `Week ${week}: rating ${Math.round(rating)} after ${games} games${gid != null ? `; ${menuWeekGameText(byGame.get(gid))}, game grade ${Math.round(grade)}` : "; no game"}`,
  }));
  const body = rows.map(([week, rating, games, basis, gid, grade]) => `<tr><td>W${week}</td><td>${menuWeekPill(rating, `Rating after week ${week}`)}</td><td>${games ?? "—"}</td>
      <td>${_esc(basis === "P" ? "Production" : "Blended")}</td><td class="m-wk-game">${_esc(gid != null ? menuWeekGameText(byGame.get(gid)) : "Did not play")}</td>
      <td>${grade != null ? menuWeekPill(grade, `Game grade, week ${week}`) : '<span class="trio-na">—</span>'}</td></tr>`).join("");
  return `${trendChart(points, { label: `${p.name} rating after each week of ${MENU.season}` })}
    <div class="m-twrap"><table class="m-ptable m-ptable--weeks"><thead><tr><th>WK</th><th title="His rating after that week's games">RATING</th><th>GAMES</th>
      <th title="Production: from his stats alone. Blended: stats with his recruiting profile, while the sample is small.">BASIS</th><th class="m-wk-game">GAME</th><th title="That one game, on the rating scale">GRADE</th></tr></thead>
      <tbody>${body}</tbody></table></div>
    <p class="m-note">Rating is his earned rating to date after that week, rescaled to full-season pace: a scale, not a shrink. A week he held no rating (fewer than three games with a counted stat, or no game) is missing from the table. Grade is that one game's adjusted score read as if every game of a 12-game season looked like it, so a single game swings far more than the running rating does.</p>`;
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
