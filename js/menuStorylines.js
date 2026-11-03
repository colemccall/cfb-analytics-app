// menuStorylines.js — the Home page's storylines (v4.25), brought over from the classic front door: five claims, each COMPUTED from a
// file the site ships, each with its evidence beside it and a button to the research entry that holds the rest. A claim whose file is
// absent is left out; the panel says nothing rather than something it cannot back.
//
// The panel is drawn after the page (menuFillStorylines, from the home screen's mount): the player file behind the hidden-gem claim
// is large, and Home should not wait for it.
//
// Must never contain: fetch calls (dataLoader.js owns those) or routing logic (links are data-to routes).
//
// Load order: after menuScreensPages.js (menuYearOverYear) and before menuHome.js.

// The last season with earned ratings at or before the one being viewed: a claim about what players DID reads that, never a projection.
function menuPlayedSeason(season) {
  return Math.min(season, CONFIG.LAST_PLAYED_SEASON);
}

// Each builder returns { tag, head, evidence, to, more: [label, route] } (head and evidence are HTML) or null. `d` is menuTeams().
const MENU_STORIES = [
  // The team that gains most on a year, and the one that loses most, among teams on either side of 75 (so a first full FBS year is not a rise).
  async (d, season) => {
    const moves = menuYearOverYear(d, await fetchTeamHistories(), season);
    const up = moves.find(m => m.now >= 75), down = [...moves].reverse().find(m => m.then >= 75);
    // A claim of a rise or a fall needs one: a team on the other side of zero is not the answer.
    if (!up || !down || up.delta <= 0 || down.delta >= 0) return [];
    const proj = isProjectedSeason(season);
    const note = proj ? `projected ${season} vs earned ${season - 1}` : `${season} vs ${season - 1}`;
    const card = (tag, m, text) => ({ tag, head: `<b>${_esc(m.team.school)}</b> ${text}`,
      evidence: `${ovrPill(m.now, { label: `Team rating, ${season}`, season })} ${deltaChip(m.delta, { title: note })} <span class="m-note">${_esc(note)}</span>`,
      to: menuTeamPath(m.team.id), more: ["Every program's move", "#/research/team-movement"] });
    return [card(proj ? "PROJECTED TO RISE" : "BIGGEST RISE", up, `gains more in ${season} than any other team now rated 75 or higher.`),
            card(proj ? "PROJECTED TO SLIDE" : "BIGGEST FALL", down, `loses more in ${season} than any other team that was rated 75 or higher.`)];
  },
  // The best performance against what recruiting talent predicts (script 13).
  async (d, season) => {
    const played = menuPlayedSeason(season);
    const rows = (await fetchTeamPerformance()).filter(r => r.season === played && r.performance_residual != null);
    if (!rows.length) return [];
    const best = rows.reduce((a, b) => (b.performance_residual > a.performance_residual ? b : a));
    const team = d.teams.find(t => t.id === best.team_id);
    return [{ tag: "OVER EXPECTATIONS", head: `<b>${_esc(best.school)}</b> played ${best.performance_residual.toFixed(1)} points better than its recruiting said it should in ${played}.`,
      evidence: `${deltaChip(best.performance_residual, { title: "Actual SP+ minus SP+ expected from three-year recruiting talent" })} <span class="m-note">SP+ against the talent expectation${best.performance_percentile != null ? `, ${Math.round(best.performance_percentile)}th percentile` : ""}</span>`,
      to: team ? menuTeamPath(team.id) : "#/research/team-performance", more: ["Every team graded", "#/research/team-performance"] }];
  },
  // The model's boldest projection against his cohort (Engine D), for the season it projects.
  async (d, season) => {
    const traj = await fetchTrajectory();
    if (!traj.rows.length || Number(traj.meta.predicts_season ?? CONFIG.CURRENT_SEASON) !== season) return [];
    const calls = traj.rows.filter(r => r.trajectory_label === "breakout" && (r.current_ovr || 0) >= 60 && r.vs_cohort != null).sort((a, b) => b.vs_cohort - a.vs_cohort);
    const top = calls[0];
    if (!top) return [];
    return [{ tag: "BREAKOUT WATCH", head: `The model's boldest call: <b>${_esc(top.name)}</b> (${_esc(top.position_group || "—")}).`,
      evidence: `${ovrPill(top.current_ovr, { label: `Earned rating, ${top.season}`, season: top.season })} → ${ovrPill(top.predicted_ovr, { label: `Projected ${season} rating`, season, projected: true })} ${projRange(top.proj_low, top.proj_high)}
        ${deltaChip(top.vs_cohort, { title: "Projected rating against what his cohort typically does" })} <span class="m-note">against the ${_esc(top.position_group || "")}s who were where he is now${traj.meta.model_mae ? `; typical error ±${traj.meta.model_mae}` : ""}</span>`,
      to: menuPlayerPath(top.player_id, top.team_id), more: [`All ${calls.length} breakout calls`, "#/research/breakout"] }];
  },
  // The best player who was recruited at one or two stars.
  async (d, season) => {
    const played = menuPlayedSeason(season);
    const gems = (await fetchSeasonPlayers(played)).filter(p => p.stars >= 1 && p.stars <= 2 && (p.overall_rating || 0) >= 75).sort((a, b) => b.overall_rating - a.overall_rating);
    const g = gems[0];
    if (!g) return [];
    return [{ tag: "HIDDEN GEM", head: `<b>${_esc(g.name)}</b> was a ${g.stars}-star recruit. The tape didn't care.`,
      evidence: `${ovrPill(g.overall_rating, { label: `Rating, ${g.season}`, season: g.season })} <span class="m-note">${_esc(g.position_group || "")} · ${_esc(g.team || "")} · ${"★".repeat(g.stars)} recruit · ${g.season}</span>`,
      to: menuPlayerPath(g.id, g.team_id), more: [`All ${gems.length} hidden gems`, "#/research/hidden-gems"], gems: gems.length }];
  },
  // The recruiting class that did best on what its players became (script 14), ranked on the shrunk rate so a small class cannot top it by luck.
  async d => {
    const mature = (await fetchRecruitingRoi()).filter(r => !r.maturing && (r.n_recruits || 0) >= 15 && r.hit_rate_pct != null);
    if (!mature.length) return [];
    const rate = r => r.hit_rate_shrunk_pct ?? r.hit_rate_pct;
    const best = mature.reduce((a, b) => (rate(b) > rate(a) ? b : a));
    const team = d.teams.find(t => t.id === best.team_id);
    return [{ tag: "RECRUITING, GRADED", head: `<b>${_esc(best.school)}</b>'s ${best.recruit_year} class is the strongest board we have graded.`,
      evidence: `<b>${best.hit_rate_pct.toFixed(1)}%</b> <span class="m-note">of its ${best.n_recruits} recruits became real contributors (peak rating 75 or more)${best.hit_rate_shrunk_pct != null ? `; ${best.hit_rate_shrunk_pct.toFixed(1)}% once pulled toward the average for a class this size${best.hit_rate_low_pct != null && best.hit_rate_high_pct != null ? ` (${best.hit_rate_low_pct.toFixed(0)}–${best.hit_rate_high_pct.toFixed(0)}%)` : ""}` : ""}</span>`,
      to: team ? menuTeamPath(team.id, "recruiting") : "#/research/recruiting-roi", more: ["Every class since 2008", "#/research/recruiting-roi"] }];
  },
];

// The storylines panel and the coverage line under it, drawn into `el`. Each builder runs on its own: a missing file drops that one claim.
async function menuFillStorylines(el, d, season) {
  const results = await Promise.allSettled(MENU_STORIES.map(fn => fn(d, season)));
  if (!el.isConnected) return;
  const cards = results.flatMap(r => (r.status === "fulfilled" ? r.value : []));
  const gems = cards.find(c => c.gems);
  const rows = cards.map(c => `<div class="m-story">
      <button class="m-row m-row--story" type="button" data-nav data-nav-group="stories" data-to="${c.to}">
        <span class="m-story-tag">${_esc(c.tag)}</span><span class="m-story-head">${c.head}</span><span class="m-story-evidence">${c.evidence}</span></button>
      <button class="m-chip m-chip--tiny" type="button" data-nav data-nav-group="stories" data-to="${c.more[1]}">${_esc(c.more[0])} →</button></div>`).join("");
  el.innerHTML = `<h3 class="m-h3">Storylines · what the numbers are saying</h3>
    ${rows || '<p class="m-empty">The files behind the storylines are not on this page.</p>'}
    <p class="m-note">${seasonList().length} seasons (${CONFIG.FIRST_SEASON}–${CONFIG.CURRENT_SEASON}) · ${d.teams.length} programs${gems ? ` · ${gems.gems} hidden gems found in ${menuPlayedSeason(season)}` : ""}.
      <button class="m-chip m-chip--tiny" type="button" data-nav data-nav-group="stories" data-to="#/guide">How the numbers work →</button></p>`;
}
