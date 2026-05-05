// Central configuration — imported by all other JS files.
// Update SUPABASE_URL and SUPABASE_ANON_KEY before deploying.

const CONFIG = {
  SUPABASE_URL:      "https://rdtdgfejqfxtorzrfdbe.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkdGRnZmVqcWZ4dG9yenJmZGJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4OTg2ODcsImV4cCI6MjA5MjQ3NDY4N30.sKf6SCGmpPFZ6U_eeNVmdqk_MXiZGGDRuVzy-fV1rXY",

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
    WR:  [["td_score","TD Impact"],["yards_per_rec","Yds/Rec"],["yards_total","Total Yards"],["rec_volume","Volume"],["recruit_composite","Recruiting"]],
    TE:  [["td_score","TD Impact"],["yards_per_rec","Yds/Rec"],["yards_total","Total Yards"],["rec_volume","Volume"],["recruit_composite","Recruiting"]],
    OL:  [["team_rush_ypa","Team Rush YPA"],["team_sack_rate_inv","Pass Pro"],["recruit_composite","Recruiting"],["experience","Experience"],["award_tier","Awards"]],
    DL:  [["pass_rush_score","Pass Rush"],["run_stop_score","Run Stop"],["disruption_rate","Disruption"],["volume_score","Volume"],["recruit_composite","Recruiting"]],
    LB:  [["tackling_score","Tackling"],["pass_rush_score","Pass Rush"],["coverage_score","Coverage"],["instinct_score","Instincts"],["recruit_composite","Recruiting"]],
    DB:  [["coverage_score","Coverage"],["tackling_score","Tackling"],["instinct_score","Instincts"],["pass_rush_score","Pass Rush"],["recruit_composite","Recruiting"]],
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

