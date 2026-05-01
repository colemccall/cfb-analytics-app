// Thin Supabase REST client for live/current data queries.
// Uses the auto-generated REST API (no SDK needed — just fetch + headers).

const SUPABASE_HEADERS = {
  "apikey":        CONFIG.SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
  "Content-Type":  "application/json",
};

async function supabaseSelect(table, params = {}) {
  const url = new URL(`${CONFIG.SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set("select", params.select || "*");
  if (params.filters) {
    for (const [col, val] of Object.entries(params.filters)) {
      url.searchParams.set(col, `eq.${val}`);
    }
  }
  if (params.order) url.searchParams.set("order", params.order);
  if (params.limit) url.searchParams.set("limit", params.limit);

  const resp = await fetch(url.toString(), { headers: SUPABASE_HEADERS });
  if (!resp.ok) throw new Error(`Supabase ${table}: ${resp.status}`);
  return resp.json();
}

// Convenience wrappers used by page JS

async function fetchCurrentRatings(season = CONFIG.CURRENT_SEASON, limit = 500) {
  return supabaseSelect("ratings", {
    select: "player_id,overall_rating,position_rating,trajectory_score,breakout_probability,shap_values,players(name,position_group,year,teams(school,abbreviation,conference,color))",
    filters: { season },
    order: "overall_rating.desc",
    limit,
  });
}

async function fetchPlayerStats(playerId, season = CONFIG.CURRENT_SEASON) {
  return supabaseSelect("stats", {
    filters: { player_id: playerId, season, stat_type: "season_aggregate" },
  });
}

async function fetchTopRatingsByPosition(position_group, season = CONFIG.CURRENT_SEASON, limit = 50) {
  const url = new URL(`${CONFIG.SUPABASE_URL}/rest/v1/ratings`);
  url.searchParams.set("select", "player_id,overall_rating,position_rating,trajectory_score,shap_values,players(name,position_group,year,teams(school,abbreviation,conference))");
  url.searchParams.set("season", `eq.${season}`);
  url.searchParams.set("players.position_group", `eq.${position_group}`);
  url.searchParams.set("order", "overall_rating.desc");
  url.searchParams.set("limit", limit);

  const resp = await fetch(url.toString(), { headers: SUPABASE_HEADERS });
  if (!resp.ok) throw new Error(`Supabase ratings: ${resp.status}`);
  return resp.json();
}
