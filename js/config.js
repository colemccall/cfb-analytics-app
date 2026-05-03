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

// Archetype label derived from SHAP values and overall rating
function computeArchetype(posGroup, overall, shap) {
  const s = shap || {};
  const g = k => s[k] || 0;
  const r = overall || 0;

  switch (posGroup) {
    case 'QB': {
      if (g('comp_pct') > 0.1 && g('yards_per_att') > 0.1 && r >= 78) return 'Dual Threat';
      if (g('yards_per_att') > 0.08 && r >= 75) return 'Big Arm';
      if (g('comp_pct') > 0.1 && r >= 72) return 'Precision Passer';
      if (r >= 65) return 'Pocket Passer';
      return 'Game Manager';
    }
    case 'RB': {
      if (g('rec_per_game') > 0.05 && g('yards_per_carry') > 0.05) return 'All-Purpose Back';
      if (g('rec_per_game') > 0.08) return 'Receiving Back';
      if (g('yards_per_carry') > 0.1 && r >= 75) return 'Speed Back';
      if (r >= 68) return 'Power Back';
      return 'Backup Back';
    }
    case 'WR': {
      if (g('yards_per_rec') > 0.08 && g('catch_rate') > 0.05) return 'No. 1 Receiver';
      if (g('catch_rate') > 0.1) return 'Route Runner';
      if (g('yards_per_rec') > 0.1) return 'YAC Monster';
      if (r >= 60) return 'Slot Receiver';
      return 'Role Player';
    }
    case 'TE': {
      if (g('yards_per_rec') > 0.06 && g('rec_per_game') > 0.05) return 'Complete TE';
      if (g('yards_per_rec') > 0.06) return 'Pass Catcher';
      return 'Blocking TE';
    }
    case 'OL': {
      if (g('team_rush_ypa') > 0.08 && g('team_sack_rate') < -0.05) return 'Complete Lineman';
      if (g('team_sack_rate') < -0.06) return 'Pass Blocker';
      if (g('team_rush_ypa') > 0.1) return 'Run Blocker';
      return 'Lineman';
    }
    case 'DL': {
      if (g('sacks_per_game') > 0.08 && g('tackles_per_game') > 0.05) return 'Complete D-Lineman';
      if (g('sacks_per_game') > 0.08) return 'Pass Rusher';
      if (g('tackles_per_game') > 0.1) return 'Run Stuffer';
      return 'Rotational';
    }
    case 'LB': {
      if (g('sacks_per_game') > 0.06 && g('ints_per_game') > 0.03) return 'Hybrid LB';
      if (g('sacks_per_game') > 0.07) return 'Edge Rusher';
      if (g('ints_per_game') > 0.05) return 'Coverage LB';
      if (g('tackles_per_game') > 0.1) return 'Run Stopper';
      return 'Linebacker';
    }
    case 'DB': {
      if (g('ints_per_game') > 0.06 && r >= 75) return 'Ball Hawk';
      if (g('tackles_per_game') > 0.1) return 'Hit Man';
      if (r >= 70) return 'Shutdown Corner';
      return 'Cover DB';
    }
    case 'K':  return r >= 72 ? 'Reliable Kicker' : 'Kicker';
    case 'P':  return r >= 68 ? 'Coffin Corner Punter' : 'Punter';
    default:   return '';
  }
}
