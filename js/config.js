// Central configuration — imported by all other JS files.
// Update SUPABASE_URL and SUPABASE_ANON_KEY before deploying.

const CONFIG = {
  SUPABASE_URL:      "https://YOUR_PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_ANON_KEY",

  DATA_BASE:      "./data/",
  CURRENT_SEASON: 2025,

  POSITIONS: ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K", "P"],

  RATING_TIERS: {
    ELITE:   { min: 85, label: "Elite",   color: "#00c853" },
    GREAT:   { min: 70, label: "Great",   color: "#4caf50" },
    SOLID:   { min: 55, label: "Solid",   color: "#8bc34a" },
    AVERAGE: { min: 45, label: "Average", color: "#ffc107" },
    BELOW:   { min: 0,  label: "Below",   color: "#f44336" },
  },

  // Skill attribute display names per position group (mirrors SHAP feature names)
  SKILL_ATTRS: {
    QB:  [["comp_pct","Completion %"],["yards_per_att","Yards/Att"],["td_int_ratio","TD:INT"],["ppa","PPA"],["recruit_composite","Recruiting"]],
    RB:  [["yards_per_carry","YPC"],["yards_per_game","Yds/Gm"],["rec_per_game","Rec/Gm"],["ppa","PPA"],["recruit_composite","Recruiting"]],
    WR:  [["yards_per_rec","Yds/Rec"],["catch_rate","Catch %"],["rec_per_game","Rec/Gm"],["ppa","PPA"],["recruit_composite","Recruiting"]],
    TE:  [["yards_per_rec","Yds/Rec"],["catch_rate","Catch %"],["rec_per_game","Rec/Gm"],["ppa","PPA"],["recruit_composite","Recruiting"]],
    OL:  [["team_rush_ypa","Team Rush YPA"],["team_sack_rate","Sack Rate"],["award_tier","Awards"],["recruit_composite","Recruiting"]],
    DL:  [["tackles_per_game","Tkl/Gm"],["sacks_per_game","Sacks/Gm"],["tfl_per_game","TFL/Gm"],["ppa","PPA"],["recruit_composite","Recruiting"]],
    LB:  [["tackles_per_game","Tkl/Gm"],["tfl_per_game","TFL/Gm"],["ints_per_game","INT/Gm"],["ppa","PPA"],["recruit_composite","Recruiting"]],
    DB:  [["ints_per_game","INT/Gm"],["pbu_per_game","PBU/Gm"],["tackles_per_game","Tkl/Gm"],["ppa","PPA"],["recruit_composite","Recruiting"]],
    K:   [["fg_pct","FG %"],["fg_long","FG Long"],["xp_pct","XP %"]],
    P:   [["avg_yards","Avg Yds"],["inside_20_pct","Inside 20 %"]],
  },
};

// Rating tier helper
function getRatingTier(rating) {
  for (const [, tier] of Object.entries(CONFIG.RATING_TIERS)) {
    if (rating >= tier.min) return tier;
  }
  return CONFIG.RATING_TIERS.BELOW;
}

// Rating color gradient (adapted from v1)
function ratingColor(v) {
  if (v >= 90) return "#00c853";
  if (v >= 80) return "#4caf50";
  if (v >= 70) return "#8bc34a";
  if (v >= 60) return "#cddc39";
  if (v >= 50) return "#ffc107";
  if (v >= 40) return "#ff9800";
  return "#f44336";
}

// Stars display helper
function starsHtml(n) {
  const filled = "★".repeat(Math.max(0, Math.min(5, n || 0)));
  const empty  = "☆".repeat(Math.max(0, 5 - (n || 0)));
  return `<span class="stars">${filled}${empty}</span>`;
}
