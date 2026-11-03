// Static JSON data loader — all data served from pre-built JSON files in data/.
// GitHub Pages serves these files directly; no backend or Supabase client required.

const _cache = {};
const _inflight = {};
const _failures = {};
const LOAD_TRIES = 3;
const LOAD_BACKOFF_MS = 400;

// The only fetch in the app. Loads data/<file> once and caches the parsed JSON in memory for
// the life of the page — every later call, including theme repaints, is served from the cache,
// and two callers asking for the same file at once share one request. Callers test for null.
//
// Null means one of two different things, and the loader keeps them apart:
//   - the file does not exist (HTTP 404): that is an answer, so it is cached;
//   - the load FAILED (network error, server error, truncated or invalid JSON): it is retried
//     (LOAD_TRIES attempts, growing pauses), recorded in _failures so a screen can say so
//     (dataFailures), and NOT cached, so the next call tries again instead of showing an empty
//     page for the rest of the visit.
async function _load(file) {
  if (_cache[file] !== undefined) return _cache[file];
  if (!_inflight[file]) _inflight[file] = _fetchJson(file).finally(() => { delete _inflight[file]; });
  return _inflight[file];
}

// One file, up to LOAD_TRIES attempts. Resolves to the parsed JSON, or null (see _load).
async function _fetchJson(file) {
  let why = "";
  for (let attempt = 0; attempt < LOAD_TRIES; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, LOAD_BACKOFF_MS * attempt * attempt));
    try {
      const res = await fetch(CONFIG.DATA_BASE + file);
      if (res.status === 404) { delete _failures[file]; return (_cache[file] = null); }
      if (!res.ok) { why = `HTTP ${res.status}`; continue; }
      const data = await res.json();
      delete _failures[file];
      return (_cache[file] = data);
    } catch (e) {
      why = e && e.message ? e.message : String(e);
    }
  }
  _failures[file] = { file, message: why, at: Date.now() };
  return null;
}

// The files whose most recent load failed, as [{ file, message, at }], optionally only those that
// failed at or after `since` (a Date.now() value). A missing file is not a failure.
function dataFailures(since = 0) {
  return Object.values(_failures).filter(f => f.at >= since);
}

// Whether the last load of one data file failed (as opposed to the file being absent).
function dataFailed(file) {
  return Boolean(_failures[file]);
}

// ---------------------------------------------------------------------------
// Projections (Engine D)
//
// trajectory.json is {_meta, predictions}: _meta carries the model's own
// accuracy (naive_mae vs model_mae, interval coverage) so the UI can state the
// error rather than imply precision it doesn't have.
//
// The per-player explanation, drivers and comparables live in a SEPARATE file
// (~5.5 MB) fetched only when the modal opens. The list file stays under 2 MB
// so the home page isn't paying for prose nobody is reading yet.
// ---------------------------------------------------------------------------
async function fetchTrajectory() {
  const d = await _load("trajectory.json");
  if (!d) return { meta: {}, rows: [] };
  // Tolerates the pre-v3.2 bare-array shape.
  if (Array.isArray(d)) return { meta: {}, rows: d };
  return { meta: d._meta || {}, rows: d.predictions || [] };
}

// { [player_season_id]: {explanation, drivers, comparables, edge_pct_path} }
async function fetchTrajectoryDetail(playerSeasonId) {
  const d = await _load("trajectory_detail.json");
  if (!d) return null;
  return d[String(playerSeasonId)] || null;
}

// The cross-era comparable players of one season, { player_season_id: [{ id, ps_id, name, season, team, ovr, similarity }] }
// (script 12), or {} for a season with none. A season not yet played has no production to match, so it is not asked for.
async function fetchSimilarPlayers(season) {
  if (isProjectedSeason(season)) return {};
  return (await _load(`similar_players_${season}.json`)) || {};
}

// teams.json as { id: team }, for a finding that names teams by id.
async function fetchTeamsById() {
  const map = {};
  for (const t of (await _load("teams.json")) || []) map[t.id] = t;
  return map;
}

// Every team's season-by-season history at once, { team_id: [{ season, wins, losses, conference, overall_rating, ... }] }, or {}.
async function fetchTeamHistories() {
  return (await _load("team_history.json")) || {};
}

// Script 13's team performance rows (SP+ against what recruiting talent predicts), or [].
async function fetchTeamPerformance() {
  return (await _load("team_performance.json")) || [];
}

// The API survey the Methods reader's availability table is drawn from (explore_api.py): { endpoints, verified_absent }, or null.
async function fetchApiAvailability() {
  return _load("api_availability.json");
}

// Script 14's recruiting-class return on investment rows, or [].
async function fetchRecruitingRoi() {
  return (await _load("recruiting_roi.json")) || [];
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
async function fetchTeams(season = CONFIG.CURRENT_SEASON) {
  const [teams, teamRatings, history] = await Promise.all([
    _load("teams.json"),
    _load("team_ratings.json"),
    _load("team_history.json"),
  ]);
  if (!teams) return [];

  // teams.json carries only the CURRENT conference, so viewing an older season
  // would label every team with its 2025 home — Texas in the SEC in 2013, a
  // 12-team Pac-12 that no longer exists. team_history has the per-season value.
  const confBySeason = {};
  if (history) {
    for (const [teamId, seasons] of Object.entries(history)) {
      const row = (seasons || []).find(s => s.season == season);
      if (row?.conference) confBySeason[teamId] = row.conference;
    }
  }

  const teamRatingsMap = {};
  if (teamRatings) {
    const rows = Array.isArray(teamRatings) ? teamRatings : Object.values(teamRatings);
    for (const teamRating of rows) {
      if (!season || teamRating.season == season) {
        const subRatings = typeof teamRating.sub_ratings === "string"
          ? JSON.parse(teamRating.sub_ratings)
          : (teamRating.sub_ratings || {});
        teamRatingsMap[teamRating.team_id] = { sp: teamRating.sp_overall, recruit: teamRating.recruiting_score, live: teamRating.live_overall_rating, liveWeek: teamRating.live_through_week, ratingPart: teamRating.rating_part, resultsGames: teamRating.results_games, power: teamRating.power_rating, livePower: teamRating.live_power_rating, results: teamRating.results_rating, ovr: teamRating.overall_rating, off: teamRating.offense_rating, def: teamRating.defense_rating, sub: subRatings };
      }
    }
  }

  // A team colour is used as a CSS value (--m-team, banners, monograms). The harvest wrote "#null" for a team the
  // API gave no colour (Idaho), which is invalid CSS; anything that is not a hex colour is no colour (null), and
  // every screen already falls back to its neutral token for that.
  const hexOrNull = c => (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(c || "") ? c : null);

  return teams.map(t => {
    const teamRating = teamRatingsMap[t.id] || {};
    return {
      ...t,
      color:          hexOrNull(t.color),
      alt_color:      hexOrNull(t.alt_color),
      conference:     confBySeason[String(t.id)] || t.conference,
      overall_rating: teamRating.ovr || null,
      live_overall_rating: teamRating.live ?? null,   // earned so far, in a season being played
      live_through_week:   teamRating.liveWeek ?? null,
      sp_overall:          teamRating.sp ?? null,          // the SP+ margin, a reference column only (never an input to a rating's shape)
      recruiting_score:    teamRating.recruit ?? null,
      power_rating:        teamRating.power ?? null,       // ranks teams: quality plus results, points per game above average
      live_power_rating:   teamRating.livePower ?? null,
      results_rating:      teamRating.results ?? null,
      rating_part:         teamRating.ratingPart ?? null,
      results_games:       teamRating.resultsGames ?? null,
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

// The games behind every team's power rating for a season: { team_id: [{ week, opp, home, score,
// opp_score, margin, value, expected, over }] }, or {} for a season with no file, without a request.
async function fetchPowerGames(season) {
  if (!CONFIG.POWER_GAME_SEASONS.includes(Number(season))) return {};
  return (await _load(`power_games_${season}.json`)) || {};
}

// One recruiting class: { year, prospects: [...], teams: [...] } from script 18, or
// null for a class year with no file (CONFIG.RECRUITING_SEASONS), without a request.
async function fetchRecruiting(year) {
  if (!CONFIG.RECRUITING_SEASONS.includes(Number(year))) return null;
  return _load(`recruiting_${year}.json`);
}

// The season-in-progress file written by script 17: teams and players rated on the
// games played so far, beside their preseason projections. null for a season with
// no live file (CONFIG.LIVE_SEASONS), without a request.
async function fetchLive(season = CONFIG.CURRENT_SEASON) {
  if (!CONFIG.LIVE_SEASONS.includes(Number(season))) return null;
  return _load(`live_${season}.json`);
}

// The week-by-week files written by script 17b for a season being played: weekly_teams_{season}.json
// ({ weeks, teams: { team_id: { school, weeks: [...] } } }) and weekly_players_{season}.json
// ({ weeks, fields, players: { player_id: [[week, rating, games, basis, game_id, grade], ...] } }).
// null for a season with no file (CONFIG.WEEKLY_SEASONS), without a request.
async function fetchWeeklyTeams(season = CONFIG.CURRENT_SEASON) {
  if (!CONFIG.WEEKLY_SEASONS.includes(Number(season))) return null;
  return _load(`weekly_teams_${season}.json`);
}
async function fetchWeeklyPlayers(season = CONFIG.CURRENT_SEASON) {
  if (!CONFIG.WEEKLY_SEASONS.includes(Number(season))) return null;
  return _load(`weekly_players_${season}.json`);
}

// One team's per-game box scores for a season being played (script 12): { season, players: { player_id: [[game_id, { stat: value }], ...] } }.
// null for a season with no game logs (CONFIG.GAMELOG_SEASONS) or no team, without a request.
async function fetchGameLog(teamId, season = CONFIG.CURRENT_SEASON) {
  if (teamId == null || !CONFIG.GAMELOG_SEASONS.includes(Number(season))) return null;
  return _load(`gamelog_${season}_${teamId}.json`);
}

// Every team's schedule for one season, keyed by team id — the League
// standings are computed from these results. {} when the season has no file.
async function fetchSeasonSchedules(season = CONFIG.CURRENT_SEASON) {
  return (await _load(`schedules_${season}.json`)) || {};
}

// One season's transfers for every team, keyed by team id, each list holding
// both the moves in and the moves out. {} for a season with no file.
async function fetchLeagueTransfers(season = CONFIG.CURRENT_SEASON) {
  return (await _load(`transfers_${season}.json`)) || {};
}

// ---------------------------------------------------------------------------
// Team transfers (in + out)
// ---------------------------------------------------------------------------
async function fetchTeamTransfers(teamId, season = CONFIG.CURRENT_SEASON) {
  const transfers = await _load(`transfers_${season}.json`);
  if (!transfers) return [];
  return transfers[String(teamId)] || [];
}

// The data file that holds one player's career card: cards/NNNN.json, NNNN = player_id % CARD_SHARDS.
function playerCardFile(playerId) {
  return `cards/${String(Number(playerId) % CONFIG.CARD_SHARDS).padStart(4, "0")}.json`;
}

// One player's card data: a row per season he has a ratings row in, oldest first, read from his
// ~150 KB shard instead of every season's file (opening a card used to download 82-93 MB). [] when
// he has no ratings row in any season; null when the shard failed to load (dataFailed(playerCardFile)
// says so), so a caller can tell "no data" from "did not load".
async function fetchPlayerCard(playerId) {
  const shard = await _load(playerCardFile(playerId));
  if (!shard) return dataFailed(playerCardFile(playerId)) ? null : [];
  return shard[String(playerId)] || [];
}

// The slideshow photos, { home: [photo], teams: { team id: [photo] } } with each photo's url, credit, licence and
// page (script 20), or null when the file is absent. Fetched once; a failure is not fatal (no photos, team colours).
async function fetchBackdrops() {
  return _load("backdrops.json");
}

// One season's per-game team statistics, {team_id: {yards_pg, rush_yards_pg, ...}} from team_stats_{season}.json, or {}
// for a season with none (an unplayed one).
async function fetchTeamStats(season = CONFIG.CURRENT_SEASON) {
  return (await _load(`team_stats_${season}.json`)) || {};
}

// The best-rated players of a season, for the home page: a season being played from the to-date file, any other
// season from its ratings_by_position file (the top 50 of each position group). Rows are { id, name, team, team_id,
// position_group, rating, live }; team_id is null for a played season (that file names the school only). [] when
// the season has neither file.
async function fetchTopPlayers(season = CONFIG.CURRENT_SEASON) {
  const live = await fetchLive(season);
  if (live && live.players) {
    return live.players.filter(p => p.overall_rating != null).map(p => ({
      id: p.player_id, name: p.name, team: p.team, team_id: p.team_id, position_group: p.position_group, rating: p.overall_rating, live: true }));
  }
  const byPos = await _load(`ratings_by_position_${season}.json`);
  if (!byPos) return [];
  const out = [];
  for (const [pos, list] of Object.entries(byPos)) {
    for (const p of list) out.push({ id: p.id, name: p.name, team: p.team, team_id: null, position_group: pos, rating: p.overall, live: false });
  }
  return out;
}

// The photo mapping from script 19: { source, season, image: url pattern with {id}, players: { our player id:
// ESPN athlete id } }, or null when the file is absent or CONFIG.HEADSHOTS_ENABLED is off (no request then).
async function fetchHeadshots() {
  if (!CONFIG.HEADSHOTS_ENABLED) return null;
  return _load("headshots.json");
}

// Every player's transfer history, {player_id: [move, ...]}, or {} when the file is absent. The one
// file is cached, so only the first card to ask pays for it.
async function fetchPlayerTransfers() {
  return (await _load("player_transfers.json")) || {};
}

// Every player row of one season's ratings file, or [] when that season has none.
async function fetchSeasonPlayers(season = CONFIG.CURRENT_SEASON) {
  return (await _load(`players_${season}.json`)) || [];
}

// One team's season-by-season history (newest first): record, conference and ratings, or [].
async function fetchTeamHistory(teamId) {
  const all = await _load("team_history.json");
  return (all && all[String(teamId)]) || [];
}
