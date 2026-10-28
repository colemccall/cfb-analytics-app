// leagueData.js — the league rules both the League page and the menu app read.
//
// Pure functions and constants over data the loader already fetched: how a standings
// row is built from schedule results, how a season's transfer files become one row per
// move, and the order a depth chart lists players in. They live here, once, so the
// two front-ends cannot drift apart: a record or a depth order must be the same
// wherever it is drawn.
//
// Must never contain: a fetch, DOM access, or markup.
//
// Load order: config.js → dataLoader.js → ui.js, then this file, before leaguePage.js,
// teamsPage.js or the menu.

// Builds one standings row per team from its schedule. A game counts once it has
// a result and is not postseason. It is a CONFERENCE game when the opponent is an
// FBS team in the same conference that season; the schedule carries no conference
// flag, so this is derived, and independents get no conference record.
// Returns { team, w, l, cw, cl, pf, pa } keyed by team id.
function computeStandings(schedules, teams) {
  const byId = {};
  for (const t of teams) byId[t.id] = t;
  const out = {};
  for (const [tid, games] of Object.entries(schedules || {})) {
    const team = byId[tid];
    if (!team) continue;
    const r = out[tid] = { team, w: 0, l: 0, cw: 0, cl: 0, pf: 0, pa: 0 };
    for (const g of games) {
      if (g.season_type === "postseason" || (g.result !== "W" && g.result !== "L")) continue;
      const win = g.result === "W";
      r.w += win ? 1 : 0;  r.l += win ? 0 : 1;
      r.pf += g.team_score || 0;  r.pa += g.opp_score || 0;
      const oppId = String(g.home_team_id) === String(tid) ? g.away_team_id : g.home_team_id;
      const opp = byId[oppId];
      if (g.opp_is_fbs && opp && opp.conference && opp.conference === team.conference
          && team.conference !== "FBS Independents") {
        r.cw += win ? 1 : 0;  r.cl += win ? 0 : 1;
      }
    }
  }
  return out;
}

// Win percentage, 0 for a team with no games, so sorting never sees a NaN.
function _pct(w, l) { return w + l ? w / (w + l) : 0; }

// Flattens a season's per-team transfer lists to one row per transfer. Every
// move appears once as "in" for its destination and once as "out" for its origin,
// so keeping only "in" counts each exactly once. Players leaving for no listed
// school (to_school null) appear on the out side only and are dropped here.
function leagueTransferRows(byTeam) {
  const rows = [];
  for (const list of Object.values(byTeam || {})) {
    for (const t of list) if (t.direction === "in") rows.push(t);
  }
  return rows;
}

// Slots shown per position group, in the order a game-day depth chart lists
// them: the starters plus the first reserves. A count, not a roster rule.
const DEPTH_SLOTS = {
  Offense:        [["QB", 2], ["RB", 3], ["WR", 5], ["TE", 3], ["OL", 7]],
  Defense:        [["EDGE", 3], ["DL", 4], ["LB", 4], ["CB", 4], ["S", 3], ["DB", 3]],
  "Special teams": [["K", 1], ["P", 1]],
};

// The order players are listed in within a group. Rated players go by rating;
// a position we do not rate (OL) goes by recruiting grade, which is all there is,
// and the group says so. Unrated players always come last.
function _depthOrder(a, b) {
  // A season in progress orders by what has been earned so far (live_rating), then the
  // projection, then last season: a starter is whoever is playing best now.
  const la = a.live_rating, lb = b.live_rating;
  if (la != null || lb != null) return (lb ?? -1) - (la ?? -1);
  const ra = a.overall_rating, rb = b.overall_rating;
  if (ra != null || rb != null) return (rb ?? -1) - (ra ?? -1);
  if (a.rating_prev != null || b.rating_prev != null) return (b.rating_prev ?? -1) - (a.rating_prev ?? -1);
  return (b.stars || 0) - (a.stars || 0) || (b.composite_score || 0) - (a.composite_score || 0);
}

// The order a conference's standings are listed in: conference record, then overall
// record, then team rating. One comparator, so the League page and the menu agree.
function standingsOrder(a, b) {
  return _pct(b.cw, b.cl) - _pct(a.cw, a.cl) || _pct(b.w, b.l) - _pct(a.w, a.l)
    || (b.team.overall_rating || 0) - (a.team.overall_rating || 0);
}