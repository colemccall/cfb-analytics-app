// Supabase REST client — all data fetching goes through here.
// Uses the Supabase PostgREST API directly (no SDK needed).

function _headers() {
  return {
    "apikey":        CONFIG.SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    "Content-Type":  "application/json",
  };
}

async function _get(path, params = {}) {
  const url = new URL(`${CONFIG.SUPABASE_URL}/rest/v1/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url.toString(), { headers: _headers() });
  if (!resp.ok) throw new Error(`Supabase ${path}: ${resp.status} ${resp.statusText}`);
  return resp.json();
}

// ---------------------------------------------------------------------------
// Players — full list with ratings joined (for players.html grid and scatter)
// Returns rows shaped like: { id, name, position, position_group, year,
//   height_in, weight_lbs, hometown_state, overall_rating, position_rating,
//   trajectory_score, breakout_probability, shap_values, stars, composite_score,
//   recruit_year, team, conference }
// ---------------------------------------------------------------------------
async function fetchAllPlayers(season = CONFIG.CURRENT_SEASON) {
  // Fetch ratings with player and team info
  const rows = await _get("ratings", {
    select: [
      "player_id,overall_rating,position_rating,trajectory_score,breakout_probability,shap_values,season",
      "players(id,name,position,position_group,year,height_in,weight_lbs,hometown_state,teams(school,conference,color,logo_url))",
    ].join(","),
    "season": `eq.${season}`,
    "order": "overall_rating.desc",
    "limit": "2000",
  });

  if (!rows.length) return [];

  // Fetch best recruiting record per player (most recent, highest stars)
  const playerIds = rows.map(r => r.player_id).join(",");
  const recRows = await _get("recruiting", {
    select: "player_id,stars,composite_score,recruit_year",
    "player_id": `in.(${playerIds})`,
    order: "recruit_year.desc",
    limit: "5000",
  });
  const recMap = {};
  for (const r of recRows) {
    if (!recMap[r.player_id] || (r.stars || 0) > (recMap[r.player_id].stars || 0)) {
      recMap[r.player_id] = r;
    }
  }

  return rows.map(r => {
    const p = r.players || {};
    const t = p.teams || {};
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
  });
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

  // Pull per-team avg rating from ratings table via players join
  const ratRows = await _get("ratings", {
    select: "overall_rating,players(team_id)",
    "season": `eq.${season}`,
    limit: "10000",
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
// Team roster — players for one team with their ratings
// ---------------------------------------------------------------------------
async function fetchTeamRoster(teamId, season = CONFIG.CURRENT_SEASON) {
  const players = await _get("players", {
    select: "id,name,position,position_group,year,height_in,weight_lbs,hometown_state",
    "team_id": `eq.${teamId}`,
    order: "name.asc",
    limit: "300",
  });

  if (!players.length) return [];

  const ids = players.map(p => p.id).join(",");
  const ratings = await _get("ratings", {
    select: "player_id,overall_rating,shap_values",
    "season": `eq.${season}`,
    "player_id": `in.(${ids})`,
    limit: "300",
  });

  const recRows = await _get("recruiting", {
    select: "player_id,stars,composite_score",
    "player_id": `in.(${ids})`,
    order: "recruit_year.desc",
    limit: "300",
  });

  const ratMap = Object.fromEntries(ratings.map(r => [r.player_id, r]));
  const recMap = {};
  for (const r of recRows) {
    if (!recMap[r.player_id]) recMap[r.player_id] = r;
  }

  return players.map(p => ({
    ...p,
    overall_rating: ratMap[p.id]?.overall_rating,
    shap:           ratMap[p.id]?.shap_values,
    stars:          recMap[p.id]?.stars,
    composite_score: recMap[p.id]?.composite_score,
  }));
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
  return _get("stats", {
    "player_id": `eq.${playerId}`,
    "season":    `eq.${season}`,
    "stat_type": `eq.season_aggregate`,
    limit: "1",
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
    "stat_type": `eq.season_aggregate`,
    order: "season.asc",
    limit: "10",
  });
  return rows;
}
