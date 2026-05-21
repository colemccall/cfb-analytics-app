// Supabase REST client — all data fetching goes through here.
// Uses the Supabase PostgREST API directly (no SDK needed).

function _headers() {
  return {
    "apikey":        CONFIG.SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    "Content-Type":  "application/json",
  };
}

async function _get(path, params = {}, extraHeaders = {}) {
  const url = new URL(`${CONFIG.SUPABASE_URL}/rest/v1/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url.toString(), { headers: { ..._headers(), ...extraHeaders } });
  if (!resp.ok) throw new Error(`Supabase ${path}: ${resp.status} ${resp.statusText}`);
  return resp.json();
}

// Fetch rows by paginating with offset. maxRows caps total to avoid runaway loops.
async function _getAll(path, params = {}, pageSize = 1000, maxRows = 5000) {
  let offset = 0, all = [];
  while (true) {
    const batch = await _get(path, { ...params, limit: String(pageSize), offset: String(offset) });
    all = all.concat(batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (all.length >= maxRows) break;
  }
  return all;
}

// Fetch a large set filtered by IDs, batching to avoid URL length limits
async function _getByIds(path, idField, ids, extraParams = {}, batchSize = 200) {
  if (!ids.length) return [];
  const results = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize);
    const rows = await _get(path, { ...extraParams, [idField]: `in.(${chunk.join(",")})`, limit: String(batchSize * 3) });
    results.push(...rows);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Players — full list with ratings joined (for players.html grid and scatter)
// Returns rows shaped like: { id, name, position, position_group, year,
//   height_in, weight_lbs, hometown_state, overall_rating, position_rating,
//   trajectory_score, breakout_probability, shap_values, stars, composite_score,
//   recruit_year, team, conference }
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// fetchPlayers — server-side filtered fetch, top N per call.
// options: { season, position, conference, minRating, limit }
// For the players page: call once per position chip (top 50 each).
// For the ratings page: call with position to get top 50 leaderboard.
// ---------------------------------------------------------------------------
async function fetchPlayers(options = {}) {
  const season     = options.season     || CONFIG.CURRENT_SEASON;
  const limit      = options.limit      || 200;
  const minRating  = options.minRating  || 1;

  // v2 schema: ratings.player_season_id → player_seasons.id
  // player_seasons has: players (via player_id FK), teams (via team_id FK), player_edge (via player_season_id FK)
  const params = {
    select: "player_id,overall_rating,position_rating,trajectory_score,breakout_probability,shap_values,season,player_seasons!player_season_id(id,player_id,season,team_id,position_group,year,players!player_id(id,name,position,height_in,weight_lbs,hometown_state),teams!team_id(id,school,conference,color,logo_url),player_edge!player_season_id(edge_score,stats_measured,games_played))",
    "season":         `eq.${season}`,
    "order":          "overall_rating.desc",
    "overall_rating": `gte.${minRating}`,
    "limit":          String(limit),
  };

  // PostgREST embedded resource filter — filters rows of the joined table
  if (options.position && options.position !== "ALL") {
    params["player_seasons.position_group"] = `eq.${options.position}`;
  }
  if (options.conference) {
    params["player_seasons.teams.conference"] = `eq.${options.conference}`;
  }

  let rows;
  try {
    rows = await _get("ratings", params);
  } catch (e) {
    console.error("[fetchPlayers] Supabase error:", e.message, "params:", params);
    // Fallback: try without nested filter (returns all positions, client-side filtered)
    const fallbackParams = { ...params };
    delete fallbackParams["player_seasons.position_group"];
    delete fallbackParams["player_seasons.teams.conference"];
    try {
      rows = await _get("ratings", fallbackParams);
      if (options.position && options.position !== "ALL") {
        rows = rows.filter(r => {
          const ps = Array.isArray(r.player_seasons) ? r.player_seasons[0] : r.player_seasons;
          return ps && ps.position_group === options.position;
        });
      }
    } catch (e2) {
      console.error("[fetchPlayers] Fallback also failed:", e2.message);
      return [];
    }
  }
  if (!rows || !rows.length) return [];

  const playerIds = rows.map(r => r.player_id).filter(id => id != null);
  const recRows = await _getByIds("recruiting", "player_id", playerIds, {
    select: "player_id,stars,composite_score,recruit_year",
    order:  "stars.desc",
  }, 200);
  const recMap = {};
  for (const r of recRows) {
    if (!recMap[r.player_id] || (r.stars || 0) > (recMap[r.player_id].stars || 0))
      recMap[r.player_id] = r;
  }

  return rows.map(r => _shapePlayer(r, recMap)).filter(Boolean);
}

function _shapePlayer(r, recMap = {}) {
  // v2 schema: ratings → player_seasons (with nested player, teams, player_edge)
  const ps  = Array.isArray(r.player_seasons) ? r.player_seasons[0] : (r.player_seasons || {});
  const p   = ps.players || {};
  const t   = ps.teams || (ps.season_team && ps.season_team.teams) || {};
  const rec = recMap[r.player_id] || {};
  // player_edge is one-to-many but we want the matching season row
  const edgeArr = Array.isArray(ps.player_edge) ? ps.player_edge : (ps.player_edge ? [ps.player_edge] : []);
  const edge = edgeArr[0] || {};
  // Filter out blank names
  if (!p.id || !p.name) return null;
  return {
    id:              p.id,
    player_season_id: ps.id,
    name:            p.name,
    position:        p.position,
    position_group:  ps.position_group,
    year:            ps.year,
    height_in:       p.height_in,
    weight_lbs:      p.weight_lbs,
    hometown_state:  p.hometown_state,
    team:            t.school,
    conference:      t.conference,
    team_color:      t.color,
    logo_url:        t.logo_url,
    overall_rating:  r.overall_rating,
    position_rating: r.position_rating,
    trajectory:      r.trajectory_score,
    breakout_prob:   r.breakout_probability,
    shap:            r.shap_values,
    season:          r.season,
    stars:           rec.stars,
    composite_score: rec.composite_score,
    recruit_year:    rec.recruit_year,
    edge_score:      edge.edge_score    != null ? parseFloat(edge.edge_score)    : null,
    stats_measured:  edge.stats_measured != null ? parseInt(edge.stats_measured)  : null,
    games_played:    edge.games_played   != null ? parseInt(edge.games_played)    : null,
  };
}

// Used by index page hero stats. Fetches top 1000 via v2 schema.
async function fetchAllPlayers(season = CONFIG.CURRENT_SEASON) {
  const rows = await _getAll("ratings", {
    select: "player_id,overall_rating,position_rating,trajectory_score,breakout_probability,shap_values,season,player_seasons!player_season_id(id,player_id,season,team_id,position_group,year,players!player_id(id,name,position,height_in,weight_lbs,hometown_state),teams!team_id(id,school,conference,color,logo_url),player_edge!player_season_id(edge_score,stats_measured,games_played))",
    "season":         `eq.${season}`,
    "order":          "overall_rating.desc",
    "overall_rating": "gte.50",
  }, 1000, 1000);  // single page of 1000

  if (!rows.length) return [];
  const playerIds = rows.map(r => r.player_id);
  const recRows = await _getByIds("recruiting", "player_id", playerIds, {
    select: "player_id,stars,composite_score,recruit_year",
    order:  "stars.desc",
  }, 200);
  const recMap = {};
  for (const r of recRows) {
    if (!recMap[r.player_id] || (r.stars || 0) > (recMap[r.player_id].stars || 0))
      recMap[r.player_id] = r;
  }
  return rows.map(r => _shapePlayer(r, recMap)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Teams — list with avg rating computed server-side
// ---------------------------------------------------------------------------
async function fetchTeams(season = CONFIG.CURRENT_SEASON) {
  const teams = await _get("teams", {
    select: "id,school,conference,division,color,logo_url",
    order:  "school.asc",
    limit:  "200",
  });

  // Use top 1000 rated players per season to compute team averages (sufficient for display)
  // v2 schema: ratings → player_seasons (has team_id) → players
  const ratRows = await _get("ratings", {
    select: "overall_rating,player_seasons!player_season_id(team_id)",
    "season": `eq.${season}`,
    "order": "overall_rating.desc",
    "limit": "1000",
  });

  const avgByTeam = {};
  const countByTeam = {};
  for (const r of ratRows) {
    const tid = r.player_seasons?.team_id;
    if (!tid || !r.overall_rating) continue;
    avgByTeam[tid] = (avgByTeam[tid] || 0) + r.overall_rating;
    countByTeam[tid] = (countByTeam[tid] || 0) + 1;
  }

  return teams.map(t => ({
    ...t,
    avg_rating:   countByTeam[t.id] ? avgByTeam[t.id] / countByTeam[t.id] : null,
    player_count: countByTeam[t.id] || 0,
  }));
}

// ---------------------------------------------------------------------------
// Team roster — players for one team WITH ratings for the given season.
// Queries via ratings table so the season filter is authoritative (a player
// only appears on a team for seasons where they have a rating on that roster).
// ---------------------------------------------------------------------------
async function fetchTeamRoster(teamId, season = CONFIG.CURRENT_SEASON) {
  // Query player_seasons directly so team_id filter is authoritative (PostgREST embedded
  // filters without !inner don't restrict parent rows — querying the join table directly does)
  const psRows = await _get("player_seasons", {
    select: "id,player_id,season,team_id,position_group,year,players!player_id(id,name,position,height_in,weight_lbs,hometown_state),ratings!player_season_id(overall_rating,position_rating,trajectory_score,breakout_probability,shap_values)",
    "team_id": `eq.${teamId}`,
    "season":  `eq.${season}`,
    "limit":   "150",
  });

  if (!psRows.length) return [];

  // Sort by overall_rating desc client-side (can't order by embedded resource server-side)
  psRows.sort((a, b) => {
    const ra = Array.isArray(a.ratings) ? (a.ratings[0]?.overall_rating ?? 0) : (a.ratings?.overall_rating ?? 0);
    const rb = Array.isArray(b.ratings) ? (b.ratings[0]?.overall_rating ?? 0) : (b.ratings?.overall_rating ?? 0);
    return rb - ra;
  });

  const playerIds = psRows.map(r => r.player_id).filter(id => id != null);
  const recRows = await _getByIds("recruiting", "player_id", playerIds, {
    select: "player_id,stars,composite_score",
    order:  "recruit_year.desc",
  }, 200);

  const recMap = {};
  for (const r of recRows) {
    if (!recMap[r.player_id]) recMap[r.player_id] = r;
  }

  return psRows.map(ps => {
    const p   = ps.players || {};
    const rat = Array.isArray(ps.ratings) ? (ps.ratings[0] || {}) : (ps.ratings || {});
    const rec = recMap[ps.player_id] || {};
    return {
      id:              p.id,
      name:            p.name,
      position:        p.position,
      position_group:  ps.position_group,
      year:            ps.year,
      height_in:       p.height_in,
      weight_lbs:      p.weight_lbs,
      hometown_state:  p.hometown_state,
      overall_rating:  rat.overall_rating,
      position_rating: rat.position_rating,
      trajectory:      rat.trajectory_score,
      breakout_prob:   rat.breakout_probability,
      shap:            rat.shap_values,
      stars:           rec.stars,
      composite_score: rec.composite_score,
    };
  }).filter(player => player.id && player.name);
}

// ---------------------------------------------------------------------------
// Single player full profile — used by the modal on any page.
// Returns a player object with all fields needed by modalContentHtml.
// ---------------------------------------------------------------------------
async function fetchPlayerProfile(playerId, season = CONFIG.CURRENT_SEASON) {
  // v2 schema: ratings → player_seasons → players, teams
  const rows = await _get("ratings", {
    select: "player_id,overall_rating,position_rating,trajectory_score,breakout_probability,shap_values,season,player_seasons!player_season_id(id,player_id,season,team_id,position_group,year,players!player_id(id,name,position,height_in,weight_lbs,hometown_state),teams!team_id(id,school,conference,color,logo_url),player_edge!player_season_id(edge_score,stats_measured,games_played))",
    "player_id": `eq.${playerId}`,
    "season":    `eq.${season}`,
    "limit":     "1",
  });

  if (!rows.length) return null;
  const r   = rows[0];
  const ps  = Array.isArray(r.player_seasons) ? r.player_seasons[0] : (r.player_seasons || {});
  const p   = ps.players || {};
  const t   = ps.teams || {};

  // Best recruiting record
  const recRows = await _get("recruiting", {
    select: "stars,composite_score,recruit_year",
    "player_id": `eq.${playerId}`,
    order: "stars.desc",
    limit: "1",
  });
  const rec = recRows[0] || {};

  return {
    id:              p.id,
    name:            p.name,
    position:        p.position,
    position_group:  ps.position_group,
    year:            ps.year,
    height_in:       p.height_in,
    weight_lbs:      p.weight_lbs,
    hometown_state:  p.hometown_state,
    team:            t.school,
    conference:      t.conference,
    team_color:      t.color,
    logo_url:        t.logo_url,
    overall_rating:  r.overall_rating,
    position_rating: r.position_rating,
    trajectory:      r.trajectory_score,
    breakout_prob:   r.breakout_probability,
    shap:            r.shap_values,
    season:          r.season,
    stars:           rec.stars,
    composite_score: rec.composite_score,
    recruit_year:    rec.recruit_year,
    edge_score:      (() => { const ea = Array.isArray(ps.player_edge) ? ps.player_edge : (ps.player_edge ? [ps.player_edge] : []); const e = ea[0] || {}; return e.edge_score     != null ? parseFloat(e.edge_score)    : null; })(),
    stats_measured:  (() => { const ea = Array.isArray(ps.player_edge) ? ps.player_edge : (ps.player_edge ? [ps.player_edge] : []); const e = ea[0] || {}; return e.stats_measured != null ? parseInt(e.stats_measured)  : null; })(),
    games_played:    (() => { const ea = Array.isArray(ps.player_edge) ? ps.player_edge : (ps.player_edge ? [ps.player_edge] : []); const e = ea[0] || {}; return e.games_played   != null ? parseInt(e.games_played)    : null; })(),
  };
}

// ---------------------------------------------------------------------------
// Team schedule
// ---------------------------------------------------------------------------
async function fetchTeamSchedule(teamId, season = CONFIG.CURRENT_SEASON) {
  const games = await _get("games", {
    select: "id,season,week,game_date,home_team_id,away_team_id,home_score,away_score,neutral_site,home_team:teams!home_team_id(school),away_team:teams!away_team_id(school)",
    "season": `eq.${season}`,
    "or": `(home_team_id.eq.${teamId},away_team_id.eq.${teamId})`,
    order: "week.asc",
    limit: "20",
  });
  return games.map(g => ({
    ...g,
    home_team: g.home_team?.school,
    away_team: g.away_team?.school,
  }));
}

// ---------------------------------------------------------------------------
// Team transfers (in + out)
// ---------------------------------------------------------------------------
async function fetchTeamTransfers(teamId, season = null) {
  const inParams = {
    select: "player_id,transfer_year,portal_date,players(name,position),from_team:teams!from_team_id(school)",
    "to_team_id": `eq.${teamId}`,
    order: "transfer_year.desc",
    limit: "150",
  };
  const outParams = {
    select: "player_id,transfer_year,portal_date,players(name,position),to_team:teams!to_team_id(school)",
    "from_team_id": `eq.${teamId}`,
    order: "transfer_year.desc",
    limit: "150",
  };
  if (season) {
    inParams["transfer_year"]  = `eq.${season}`;
    outParams["transfer_year"] = `eq.${season}`;
  }
  const [incoming, outgoing] = await Promise.all([
    _get("transfers", inParams),
    _get("transfers", outParams),
  ]);

  const inRows = incoming.map(r => ({
    player_name:   r.players?.name,
    position:      r.players?.position,
    direction:     "in",
    other_school:  r.from_team?.school,
    transfer_year: r.transfer_year,
    portal_date:   r.portal_date,
  }));
  const outRows = outgoing.map(r => ({
    player_name:   r.players?.name,
    position:      r.players?.position,
    direction:     "out",
    other_school:  r.to_team?.school,
    transfer_year: r.transfer_year,
    portal_date:   r.portal_date,
  }));


  return [...inRows, ...outRows].sort((a, b) => (b.transfer_year || 0) - (a.transfer_year || 0));
}

// ---------------------------------------------------------------------------
// Single player live stats (for modal)
// ---------------------------------------------------------------------------
async function fetchPlayerStats(playerId, season = CONFIG.CURRENT_SEASON) {
  // Returns both regular-season and postseason aggregates for the player card
  return _get("stats", {
    "player_id": `eq.${playerId}`,
    "season":    `eq.${season}`,
    "stat_type": `in.(season_aggregate,postseason_aggregate)`,
    limit: "2",
  });
}

// ---------------------------------------------------------------------------
// Player rating history — all seasons for a single player (year-over-year)
// ---------------------------------------------------------------------------
async function fetchPlayerRatingHistory(playerId) {
  const rows = await _get("ratings", {
    select: "season,overall_rating,position_rating,trajectory_score,breakout_probability,shap_values",
    "player_id": `eq.${playerId}`,
    order: "season.asc",
    limit: "10",
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Player full profile — stats for all seasons (for modal career tab)
// ---------------------------------------------------------------------------
async function fetchPlayerCareerStats(playerId) {
  const [rows, psRows] = await Promise.all([
    _get("stats", {
      select: "season,stat_type,data",
      "player_id": `eq.${playerId}`,
      "stat_type": `in.(season_aggregate,postseason_aggregate)`,
      order: "season.asc",
      limit: "20",
    }),
    _get("player_seasons", {
      select: "season,teams(school)",
      "player_id": `eq.${playerId}`,
      order: "season.asc",
      limit: "10",
    }),
  ]);
  // Build season → school map
  const teamBySeason = {};
  for (const ps of psRows) {
    if (ps.season && ps.teams?.school) teamBySeason[ps.season] = ps.teams.school;
  }
  // Attach team to each stats row
  const enriched = rows.map(r => ({ ...r, team: teamBySeason[r.season] || null }));
  return enriched;
}
