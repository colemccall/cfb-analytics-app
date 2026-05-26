// Static JSON data loader — all data served from pre-built JSON files in data/.
// GitHub Pages serves these files directly; no backend or Supabase client required.

const _cache = {};
async function _load(file) {
  if (_cache[file] === undefined) {
    try {
      const res = await fetch(CONFIG.DATA_BASE + file);
      _cache[file] = res.ok ? await res.json() : null;
    } catch (_) {
      _cache[file] = null;
    }
  }
  return _cache[file];
}

// ---------------------------------------------------------------------------
// Players — full list with ratings joined (for players.html grid and scatter)
// Returns rows shaped like: { id, name, position, position_group, year,
//   height_in, weight_lbs, hometown_state, overall_rating, position_rating,
//   trajectory, breakout_prob, shap, stars, composite_score,
//   recruit_year, team, conference, edge_score, stats_measured, games_played }
// ---------------------------------------------------------------------------

async function fetchAllPlayers(season = CONFIG.CURRENT_SEASON) {
  const players = await _load(`players_${season}.json`);
  return players || [];
}

// options: { season, position, conference, minRating, limit }
async function fetchPlayers(options = {}) {
  const season    = options.season    || CONFIG.CURRENT_SEASON;
  const limit     = options.limit     || 100;
  const minRating = options.minRating || 1;

  const players = await _load(`players_${season}.json`);
  if (!players) return [];

  let filtered = players.filter(p => {
    if ((p.overall_rating || 0) < minRating) return false;
    if (options.position && options.position !== "ALL" && p.position_group !== options.position) return false;
    if (options.conference && p.conference !== options.conference) return false;
    return true;
  });

  filtered.sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));
  return filtered.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
async function fetchTeams(season = CONFIG.CURRENT_SEASON) {
  const [teams, teamRatings] = await Promise.all([
    _load("teams.json"),
    _load("team_ratings.json"),
  ]);
  if (!teams) return [];

  const teamRatingsMap = {};
  if (teamRatings) {
    const rows = Array.isArray(teamRatings) ? teamRatings : Object.values(teamRatings);
    for (const teamRating of rows) {
      if (!season || teamRating.season == season) {
        const subRatings = typeof teamRating.sub_ratings === "string"
          ? JSON.parse(teamRating.sub_ratings)
          : (teamRating.sub_ratings || {});
        teamRatingsMap[teamRating.team_id] = { ovr: teamRating.overall_rating, off: teamRating.offense_rating, def: teamRating.defense_rating, sub: subRatings };
      }
    }
  }

  return teams.map(t => {
    const teamRating = teamRatingsMap[t.id] || {};
    return {
      ...t,
      overall_rating: teamRating.ovr || null,
      offense_rating: teamRating.off || null,
      defense_rating: teamRating.def || null,
      sub_ratings:    teamRating.sub || {},
      avg_rating:     teamRating.ovr || null,
      player_count:   0,
    };
  });
}

// ---------------------------------------------------------------------------
// Team roster
// ---------------------------------------------------------------------------
async function fetchTeamRoster(teamId, season = CONFIG.CURRENT_SEASON) {
  const rosters = await _load(`rosters_${season}.json`);
  if (!rosters) return [];
  return rosters[String(teamId)] || [];
}

// ---------------------------------------------------------------------------
// Team schedule
// ---------------------------------------------------------------------------
async function fetchTeamSchedule(teamId, season = CONFIG.CURRENT_SEASON) {
  const schedules = await _load(`schedules_${season}.json`);
  if (!schedules) return [];
  return schedules[String(teamId)] || [];
}

// ---------------------------------------------------------------------------
// Team transfers (in + out)
// ---------------------------------------------------------------------------
async function fetchTeamTransfers(teamId, season = CONFIG.CURRENT_SEASON) {
  const transfers = await _load(`transfers_${season}.json`);
  if (!transfers) return [];
  return transfers[String(teamId)] || [];
}

// ---------------------------------------------------------------------------
// Single player full profile — used by the modal on any page.
// ---------------------------------------------------------------------------
async function fetchPlayerProfile(playerId, season = CONFIG.CURRENT_SEASON) {
  // Try the requested season first, then scan all seasons
  const preferred = await _load(`players_${season}.json`);
  if (preferred) {
    const found = preferred.find(p => p.id == playerId);
    if (found) return found;
  }
  // Fall back: check all seasons in reverse order (most recent first)
  for (let y = CONFIG.CURRENT_SEASON; y >= 2008; y--) {
    if (y === season) continue;
    const arr = await _load(`players_${y}.json`);
    const found = arr?.find(p => p.id == playerId);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Single player live stats — included in players.json, no extra fetch needed.
// Returns array shaped like old stats rows: [{season, stat_type, data, team}]
// ---------------------------------------------------------------------------
async function fetchPlayerStats(playerId, season = CONFIG.CURRENT_SEASON) {
  const players = await _load(`players_${season}.json`);
  if (!players) return [];
  const p = players.find(pl => pl.id == playerId);
  if (!p) return [];
  const out = [];
  if (p.stats_season)     out.push({ season, stat_type: "season_aggregate",     data: p.stats_season,     team: p.team });
  if (p.stats_postseason) out.push({ season, stat_type: "postseason_aggregate", data: p.stats_postseason, team: p.team });
  return out;
}

// ---------------------------------------------------------------------------
// Player rating history — all seasons (year-over-year chart)
// ---------------------------------------------------------------------------
// Load a player's data across all available seasons (for rating history / career stats)
async function _loadPlayerAllSeasons(playerId) {
  const seasons = [];
  for (let y = 2008; y <= CONFIG.CURRENT_SEASON; y++) seasons.push(y);
  const results = await Promise.all(
    seasons.map(y => _load(`players_${y}.json`).then(arr => (arr || []).find(p => p.id == playerId)).catch(() => null))
  );
  return results.filter(Boolean).sort((a, b) => a.season - b.season);
}

async function fetchPlayerRatingHistory(playerId) {
  const history = await _loadPlayerAllSeasons(playerId);
  return history.map(p => ({
    season:               p.season,
    overall_rating:       p.overall_rating,
    position_rating:      p.position_rating,
    trajectory_score:     p.trajectory,
    breakout_probability: p.breakout_prob,
    shap_values:          p.shap,
  }));
}

// ---------------------------------------------------------------------------
// Player career stats — all seasons (modal career tab)
// ---------------------------------------------------------------------------
async function fetchPlayerCareerStats(playerId) {
  const history = await _loadPlayerAllSeasons(playerId);
  const rows = [];
  for (const p of history) {
    if (p.stats_season)     rows.push({ player_season_id: p.player_season_id, season: p.season, stat_type: "season_aggregate",     data: p.stats_season,     team: p.team });
    if (p.stats_postseason) rows.push({ player_season_id: p.player_season_id, season: p.season, stat_type: "postseason_aggregate", data: p.stats_postseason, team: p.team });
  }
  return rows;
}
