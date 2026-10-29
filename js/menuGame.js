// menuGame.js — one game: its result (or preview) and the two teams side by side, in the manner of a console
// game's matchup screen: ratings, scoring, total offense, rush and pass, total defense, rush and pass, turnovers,
// each with the team's national rank and an arrow to the better side. Reached by selecting a game on a team's
// schedule: #/game/<game id>/<team id>, the team being the one whose schedule it was opened from.
//
// What it shows is the two teams' SEASON, not this game's box score: the data holds season team statistics and a
// per-game score, not per-game team statistics. A played game shows its final score, date and venue above the
// season comparison and says so. Nothing is invented: a figure the data lacks is a dash.
//
// Must never contain: fetch calls (menuTeams and the loader own those).
//
// Load order: after menuScreensLeague.js.

// The rows of the comparison: [label, how to read a team's value, higher is better, how to show it].
const MENU_GAME_ROWS = [
  ["Overall rating", (t, d) => menuTeamOvr(t, d), true, v => Math.round(v)],
  ["Offense rating", (t, d) => menuSide(t, d.liveById[t.id], "offense_rating"), true, v => Math.round(v)],
  ["Defense rating", (t, d) => menuSide(t, d.liveById[t.id], "defense_rating"), true, v => Math.round(v)],
  ["Points per game", (t, d) => menuGamePer(d, t, "pf"), true, v => v.toFixed(1)],
  ["Points allowed", (t, d) => menuGamePer(d, t, "pa"), false, v => v.toFixed(1)],
  ["Total offense", (t, d) => d.stats[t.id]?.yards_pg, true, v => v.toFixed(1)],
  ["Rush offense", (t, d) => d.stats[t.id]?.rush_yards_pg, true, v => v.toFixed(1)],
  ["Pass offense", (t, d) => d.stats[t.id]?.pass_yards_pg, true, v => v.toFixed(1)],
  ["Total defense", (t, d) => d.stats[t.id]?.yards_allowed_pg, false, v => v.toFixed(1)],
  ["Rush defense", (t, d) => d.stats[t.id]?.rush_allowed_pg, false, v => v.toFixed(1)],
  ["Pass defense", (t, d) => d.stats[t.id]?.pass_allowed_pg, false, v => v.toFixed(1)],
  ["Sacks per game", (t, d) => d.stats[t.id]?.sacks_pg, true, v => v.toFixed(1)],
  ["3rd down offense", (t, d) => d.stats[t.id]?.third_down_pct, true, v => `${v.toFixed(1)}%`],
  ["3rd down defense", (t, d) => d.stats[t.id]?.third_down_def_pct, false, v => `${v.toFixed(1)}%`],
  ["Turnover margin", (t, d) => d.stats[t.id]?.turnover_margin, true, v => (v > 0 ? "+" : "") + Math.round(v)],
];

// A team's points scored (pf) or allowed (pa) per game from its regular-season results, or null with none.
function menuGamePer(d, t, key) {
  const s = d.standings[t.id];
  return s && s.w + s.l ? s[key] / (s.w + s.l) : null;
}

// A team's rank on a row, 1 = best, among the teams that have a value; null when it has none.
function menuGameRank(d, row, t) {
  const [, read, high] = row;
  const mine = read(t, d);
  if (mine == null || Number.isNaN(mine)) return null;
  let better = 0;
  for (const o of d.teams) {
    const v = read(o, d);
    if (v != null && !Number.isNaN(v) && (high ? v > mine : v < mine)) better++;
  }
  return better + 1;
}

// One side of a team header: mark, name (a button to its page), record with conference record, and our rank.
function menuGameTeam(d, t, name) {
  if (!t) return `<div class="m-gm-team"><b>${_esc(name || "TBD")}</b><small>not in our team list</small></div>`;
  const st = d.standings[t.id];
  const rank = menuTeamRank(t, d);
  return `<button class="m-gm-team" type="button" data-nav data-nav-group="links" data-to="${menuTeamPath(t.id)}" style="--m-team:${_esc(t.color || "")}">
      ${teamMark(t, "m-preview-mark")}<b>${_esc(t.school)}</b>
      <small>${st ? `${st.w}-${st.l}${st.cw + st.cl ? ` (${st.cw}-${st.cl})` : ""}` : "no results yet"}${rank != null ? ` · #${rank}` : ""}</small></button>`;
}

menuRouter.register("game", {
  title: ctx => (ctx.gameTitle || "Game"),
  crumb: () => "TEAM › SCHEDULE › GAME",
  prompts: [{ action: "move", label: "Move" }, { action: "select", label: "Open" }, { action: "season", label: "Season" }, { action: "back", label: "Schedule" }],
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    d.stats = d.stats || (await fetchTeamStats(MENU.season));
    const gid = ctx.params[0], tid = parseInt(ctx.params[1]);
    const mine = d.teams.find(t => t.id === tid) || null;
    const g = ((d.schedules[String(tid)] || []).find(x => String(x.game_id) === String(gid)));
    ctx.d = d; ctx.team = mine;
    if (!g || !mine) return menuErrorPanel("That game is not on the schedule for this season.", true);
    const oppId = String(g.home_team_id) === String(tid) ? g.away_team_id : g.home_team_id;
    const opp = d.teams.find(t => String(t.id) === String(oppId)) || null;
    const home = g.is_home ? mine : opp, away = g.is_home ? opp : mine;
    const homeName = g.is_home ? mine.school : g.opponent, awayName = g.is_home ? g.opponent : mine.school;
    ctx.gameTitle = `${awayName} at ${homeName}`;
    const played = g.result === "W" || g.result === "L";
    const hs = g.is_home ? g.team_score : g.opp_score, as = g.is_home ? g.opp_score : g.team_score;
    const status = played
      ? `<span class="m-gm-final">FINAL</span><span class="m-gm-score">${_esc(awayName)} ${as ?? 0} <i>–</i> ${hs ?? 0} ${_esc(homeName)}</span>`
      : `<span class="m-gm-final is-pre">PREVIEW</span><span class="m-gm-score">${_esc(String(g.game_date || "").slice(0, 10))}</span>`;
    const where = [g.season_type === "postseason" ? "Postseason" : g.week ? `Week ${g.week}` : "", String(g.game_date || "").slice(0, 10), g.neutral_site ? "Neutral site" : "", g.venue || ""].filter(Boolean).join(" · ");
    const rows = MENU_GAME_ROWS.map(row => {
      const cell = t => {
        if (!t) return { text: "—", rank: null, v: null };
        const v = row[1](t, d);
        return v == null || Number.isNaN(v) ? { text: "—", rank: null, v: null } : { text: row[3](v), rank: menuGameRank(d, row, t), v };
      };
      const a = cell(away), b = cell(home);
      const lead = a.v != null && b.v != null && a.v !== b.v ? ((row[2] ? a.v > b.v : a.v < b.v) ? "a" : "b") : "";
      const side = (c, who) => `<span class="m-gm-val${lead === who ? " is-lead" : ""}">${lead === who ? "<i>▶</i>" : ""}${_esc(c.text)}${c.rank != null ? ` <small>(#${c.rank})</small>` : ""}</span>`;
      return `<div class="m-gm-row"><span class="m-gm-label">${_esc(row[0])}</span>${side(a, "a")}${side(b, "b")}</div>`;
    }).join("");
    return `<section class="m-panel m-gm">
        <div class="m-gm-top">${menuGameTeam(d, away, awayName)}<span class="m-gm-vs">VS</span>${menuGameTeam(d, home, homeName)}</div>
        <div class="m-gm-status">${status}</div>
        <p class="m-note">${_esc(where)}</p>
        <h3 class="m-h3">Rankings · ${MENU.season} season</h3>
        <div class="m-gm-table">${rows}</div>
        <p class="m-foot">Season figures with national rank among ${d.teams.length} teams (1 is best); an arrow marks the better side. ${played ? "This game's own box score is not in the data: the final score is, the team statistics are for the season." : ""}
          Points per game and turnover margin are from regular-season results${d.live ? ` through week ${d.live.through_week}` : ""}.</p>
        <div class="m-linkrow"><button class="m-chip" type="button" data-nav data-nav-group="links" data-to="${menuTeamPath(tid, "schedule")}">← ${_esc(mine.school)} schedule</button></div>
      </section>`;
  },
  prefer: () => ".m-gm-team",
});
