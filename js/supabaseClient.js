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
  const limit      = options.limit      || 50;
  const minRating  = options.minRating  || 1;

  const params = {
    select: [
      "player_id,overall_rating,position_rating,trajectory_score,breakout_probability,shap_values,season",
      "players!inner(id,name,position,position_group,year,height_in,weight_lbs,hometown_state)",
      "season_team:teams!team_id(school,conference,color,logo_url)",
    ].join(","),
    "season":          `eq.${season}`,
    "order":           "overall_rating.desc",
    "overall_rating":  `gte.${minRating}`,
    "limit":           String(limit),
  };

  // Server-side position filter via embedded table column
  if (options.position && options.position !== "ALL") {
    params["players.position_group"] = `eq.${options.position}`;
  }
  // Server-side conference filter
  if (options.conference) {
    params["players.teams.conference"] = `eq.${options.conference}`;
  }

  const rows = await _get("ratings", params);
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

  return rows.map(r => _shapePlayer(r, recMap));
}

function _shapePlayer(r, recMap = {}) {
  const p   = r.players || {};
  // season_team comes from ratings.team_id join — season-correct for transfers
  // fall back to p.teams (players.team_id) only if ratings.team_id is null
  const t   = r.season_team || p.teams || {};
  const rec = recMap[r.player_id] || {};
  return {
    id:              p.id,
    name:            p.name,
    position:        p.position,
    position_group:  p.position_group,
    year:            p.year,
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
  };
}

// Legacy — used by scatter plot and index page hero stats. Fetches top 1000.
async function fetchAllPlayers(season = CONFIG.CURRENT_SEASON) {
  const rows = await _getAll("ratings", {
    select: [
      "player_id,overall_rating,position_rating,trajectory_score,breakout_probability,shap_values,season",
      "players!inner(id,name,position,position_group,year,height_in,weight_lbs,hometown_state)",
      "season_team:teams!team_id(school,conference,color,logo_url)",
    ].join(","),
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
  return rows.map(r => _shapePlayer(r, recMap));
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
  const ratRows = await _get("ratings", {
    select: "overall_rating,players(team_id)",
    "season": `eq.${season}`,
    "order": "overall_rating.desc",
    "limit": "1000",
  });

  const avgByTeam = {};
  const countByTeam = {};
  for (const r of ratRows) {
    const tid = r.players?.team_id;
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
  // Join: ratings → players (→ teams) for players whose current team_id matches
  // We filter players by team_id and ratings by season in one round-trip.
  const rows = await _get("ratings", {
    select: [
      "player_id,overall_rating,position_rating,trajectory_score,breakout_probability,shap_values",
      "players!inner(id,name,position,position_group,year,height_in,weight_lbs,hometown_state)",
      "season_team:teams!team_id(school,conference,color,logo_url)",
    ].join(","),
    "season":    `eq.${season}`,
    "team_id":   `eq.${teamId}`,
    "order":     "overall_rating.desc",
    "limit":     "300",
  });

  if (!rows.length) return [];

  const playerIds = rows.map(r => r.player_id);
  const recRows = await _getByIds("recruiting", "player_id", playerIds, {
    select: "player_id,stars,composite_score",
    order:  "recruit_year.desc",
  }, 200);

  const recMap = {};
  for (const r of recRows) {
    if (!recMap[r.player_id]) recMap[r.player_id] = r;
  }

  return rows.map(r => {
    const p   = r.players || {};
    const rec = recMap[r.player_id] || {};
    return {
      id:              p.id,
      name:            p.name,
      position:        p.position,
      position_group:  p.position_group,
      year:            p.year,
      height_in:       p.height_in,
      weight_lbs:      p.weight_lbs,
      hometown_state:  p.hometown_state,
      overall_rating:  r.overall_rating,
      position_rating: r.position_rating,
      trajectory:      r.trajectory_score,
      breakout_prob:   r.breakout_probability,
      shap:            r.shap_values,
      stars:           rec.stars,
      composite_score: rec.composite_score,
    };
  });
}

// ---------------------------------------------------------------------------
// Single player full profile — used by the modal on any page.
// Returns a player object with all fields needed by modalContentHtml.
// ---------------------------------------------------------------------------
async function fetchPlayerProfile(playerId, season = CONFIG.CURRENT_SEASON) {
  const rows = await _get("ratings", {
    select: [
      "player_id,overall_rating,position_rating,trajectory_score,breakout_probability,shap_values,season",
      "players!inner(id,name,position,position_group,year,height_in,weight_lbs,hometown_state)",
      "season_team:teams!team_id(school,conference,color,logo_url)",
    ].join(","),
    "player_id": `eq.${playerId}`,
    "season":    `eq.${season}`,
    "limit":     "1",
  });

  if (!rows.length) return null;
  const r   = rows[0];
  const p   = r.players || {};
  const t   = r.season_team || {};

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
    position_group:  p.position_group,
    year:            p.year,
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
  const rows = await _get("stats", {
    select: "season,stat_type,data",
    "player_id": `eq.${playerId}`,
    "stat_type": `in.(season_aggregate,postseason_aggregate)`,
    order: "season.asc",
    limit: "20",
  });
  return rows;
}
