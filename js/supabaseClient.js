// Static JSON data loader — replaces Supabase REST client.
// All data comes from pre-built JSON files in data/ served by GitHub Pages.
// Function signatures are identical to the old Supabase version so callers need no changes.

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
  const players = await _load("players.json");
  if (!players) return [];
  return players.filter(p => !season || p.season == season);
}

// options: { season, position, conference, minRating, limit }
async function fetchPlayers(options = {}) {
  const season    = options.season    || CONFIG.CURRENT_SEASON;
  const limit     = options.limit     || 100;
  const minRating = options.minRating || 1;

  const players = await _load("players.json");
  if (!players) return [];

  let filtered = players.filter(p => {
    if (p.season != season) return false;
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

  const ratMap = {};
  if (teamRatings) {
    const rows = Array.isArray(teamRatings) ? teamRatings : Object.values(teamRatings);
    for (const tr of rows) {
      if (!season || tr.season == season) {
        const sub = typeof tr.sub_ratings === "string"
          ? JSON.parse(tr.sub_ratings)
          : (tr.sub_ratings || {});
        ratMap[tr.team_id] = { ovr: tr.overall_rating, off: tr.offense_rating, def: tr.defense_rating, sub };
      }
    }
  }

  return teams.map(t => {
    const tr = ratMap[t.id] || {};
    return {
      ...t,
      overall_rating: tr.ovr || null,
      offense_rating: tr.off || null,
      defense_rating: tr.def || null,
      sub_ratings:    tr.sub || {},
      avg_rating:     tr.ovr || null,
      player_count:   0,
    };
  });
}

// ---------------------------------------------------------------------------
// Team roster
// ---------------------------------------------------------------------------
async function fetchTeamRoster(teamId, season = CONFIG.CURRENT_SEASON) {
  const rosters = await _load("rosters.json");
  if (!rosters) return [];
  const byTeam = rosters[String(teamId)];
  if (!byTeam) return [];
  return byTeam[String(season)] || [];
}

// ---------------------------------------------------------------------------
// Team schedule
// ---------------------------------------------------------------------------
async function fetchTeamSchedule(teamId, season = CONFIG.CURRENT_SEASON) {
  const schedules = await _load("schedules.json");
  if (!schedules) return [];
  const byTeam = schedules[String(teamId)];
  if (!byTeam) return [];
  return byTeam[String(season)] || [];
}

// ---------------------------------------------------------------------------
// Team transfers (in + out)
// ---------------------------------------------------------------------------
async function fetchTeamTransfers(teamId, season = null) {
  const transfers = await _load("transfers.json");
  if (!transfers) return [];
  let rows = transfers[String(teamId)] || [];
  if (season) rows = rows.filter(t => t.transfer_year == season);
  return rows.sort((a, b) => (b.transfer_year || 0) - (a.transfer_year || 0));
}

// ---------------------------------------------------------------------------
// Single player full profile — used by the modal on any page.
// ---------------------------------------------------------------------------
async function fetchPlayerProfile(playerId, season = CONFIG.CURRENT_SEASON) {
  const players = await _load("players.json");
  if (!players) return null;
  // Prefer exact season match; fall back to most recent season for this player
  const matches = players.filter(p => p.id == playerId);
  if (!matches.length) return null;
  return matches.find(p => p.season == season) || matches[matches.length - 1];
}

// ---------------------------------------------------------------------------
// Single player live stats — included in players.json, no extra fetch needed.
// Returns array shaped like old stats rows: [{season, stat_type, data, team}]
// ---------------------------------------------------------------------------
async function fetchPlayerStats(playerId, season = CONFIG.CURRENT_SEASON) {
  const players = await _load("players.json");
  if (!players) return [];
  const p = players.find(pl => pl.id == playerId && pl.season == season);
  if (!p) return [];
  const out = [];
  if (p.stats_season)     out.push({ season, stat_type: "season_aggregate",     data: p.stats_season,     team: p.team });
  if (p.stats_postseason) out.push({ season, stat_type: "postseason_aggregate", data: p.stats_postseason, team: p.team });
  return out;
}

// ---------------------------------------------------------------------------
// Player rating history — all seasons (year-over-year chart)
// ---------------------------------------------------------------------------
async function fetchPlayerRatingHistory(playerId) {
  const players = await _load("players.json");
  if (!players) return [];
  return players
    .filter(p => p.id == playerId)
    .sort((a, b) => a.season - b.season)
    .map(p => ({
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
  const players = await _load("players.json");
  if (!players) return [];
  const rows = [];
  for (const p of players.filter(pl => pl.id == playerId).sort((a, b) => a.season - b.season)) {
    if (p.stats_season)     rows.push({ player_season_id: p.player_season_id, season: p.season, stat_type: "season_aggregate",     data: p.stats_season,     team: p.team });
    if (p.stats_postseason) rows.push({ player_season_id: p.player_season_id, season: p.season, stat_type: "postseason_aggregate", data: p.stats_postseason, team: p.team });
  }
  return rows;
}
