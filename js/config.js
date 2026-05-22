// Central configuration — imported by all other JS files.

const CONFIG = {
  DATA_BASE:      "./data/",
  CURRENT_SEASON: 2025,

  // 12-group position system
  POSITIONS: ["QB", "RB", "WR", "TE", "OL", "EDGE", "DL", "LB", "CB", "S", "K", "P"],

  // Position identity colors
  POS_COLORS: {
    QB: "#FFB300", RB: "#43A047", WR: "#1E88E5", TE: "#00ACC1",
    OL: "#757575", EDGE: "#FF5722", DL: "#E53935", LB: "#FB8C00",
    CB: "#8E24AA", S: "#5C6BC0",   K: "#039BE5",  P: "#0288D1",
    DB: "#5C6BC0", ATH: "#546E7A",
  },

  // EA CFB 25-style rating tiers
  RATING_TIERS: {
    ELITE:   { min: 90, label: "ELITE",  color: "#FFD700" },
    GOLD:    { min: 80, label: "GOLD",   color: "#FFA000" },
    SILVER:  { min: 70, label: "SILVER", color: "#78909C" },
    BRONZE:  { min: 55, label: "BRONZE", color: "#8D6E63" },
    NORMAL:  { min: 0,  label: "",       color: null },
  },

  // Skill attribute display names per position group (mirrors SHAP feature names)
  SKILL_ATTRS: {
    QB:   [["comp_pct","Completion %"],["yards_per_att","Yards/Att"],["td_int_ratio","TD:INT"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    RB:   [["yards_per_carry","YPC"],["yards_total","Total Yds"],["rec_versatility","Receiving"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    WR:   [["td_score","TD Impact"],["yards_per_rec","Yds/Rec"],["yards_total","Total Yards"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    TE:   [["td_score","TD Impact"],["yards_per_rec","Yds/Rec"],["yards_total","Total Yards"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    OL:   [["team_rush_ypa","Team Rush YPA"],["team_sack_rate_inv","Pass Pro"],["recruit_composite","Recruiting"],["experience","Experience"],["award_tier","Awards"]],
    EDGE: [["pass_rush_score","Pass Rush"],["disruption_rate","Disruption"],["run_stop_score","Run Stop"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    DL:   [["pass_rush_score","Pass Rush"],["run_stop_score","Run Stop"],["disruption_rate","Disruption"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    LB:   [["tackling_score","Tackling"],["coverage_score","Coverage"],["pass_rush_score","Pass Rush"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    CB:   [["coverage_score","Coverage"],["instinct_score","Instincts"],["tackling_score","Tackling"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    S:    [["coverage_score","Coverage"],["tackling_score","Tackling"],["instinct_score","Instincts"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    DB:   [["coverage_score","Coverage"],["tackling_score","Tackling"],["instinct_score","Instincts"],["edge_score","EDGE"],["recruit_composite","Recruiting"]],
    K:    [["fg_pct","FG %"],["fg_long","FG Long"],["xp_pct","XP %"]],
    P:    [["avg_yards","Avg Yds"],["inside_20_pct","Inside 20 %"]],
  },
};

// Rating tier — returns {label, color, cls}
function getRatingTier(rating) {
  const c = ratingColor(rating);
  if (rating >= 90) return { label: "", color: c, cls: "tier-elite"  };
  if (rating >= 80) return { label: "", color: c, cls: "tier-gold"   };
  if (rating >= 70) return { label: "", color: c, cls: "tier-silver" };
  if (rating >= 55) return { label: "", color: c, cls: "tier-bronze" };
  return                    { label: "", color: null, cls: "tier-normal" };
}

// Rating color gradient — adapts to light vs dark theme
function ratingColor(v) {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  if (isLight) {
    // Blue-based palette for light mode (gold washes out on white)
    if (v >= 90) return "#1565C0";  // deep blue
    if (v >= 80) return "#1976D2";  // blue
    if (v >= 70) return "#0288D1";  // light blue
    if (v >= 55) return "#455A64";  // slate
    if (v >= 40) return "#8D6E63";  // warm gray
    return "#c62828";
  }
  // Dark / mid theme — gold/amber palette
  if (v >= 90) return "#FFD700";
  if (v >= 80) return "#FFA000";
  if (v >= 70) return "#78909C";
  if (v >= 55) return "#8D6E63";
  if (v >= 40) return "#ff9800";
  return "#f44336";
}

// Position color helper
function posColor(pg) {
  return CONFIG.POS_COLORS[pg] || CONFIG.POS_COLORS.ATH;
}

// Trajectory arrow helper
function trajHtml(score) {
  if (!score && score !== 0) return '<span class="traj-flat">—</span>';
  if (score >  5) return `<span class="traj-up2">↑↑ +${score.toFixed(1)}</span>`;
  if (score >  1) return `<span class="traj-up1">↑ +${score.toFixed(1)}</span>`;
  if (score < -5) return `<span class="traj-down2">↓↓ ${score.toFixed(1)}</span>`;
  if (score < -1) return `<span class="traj-down1">↓ ${score.toFixed(1)}</span>`;
  return '<span class="traj-flat">→</span>';
}

// Stars display helper
function starsHtml(n) {
  const filled = "★".repeat(Math.max(0, Math.min(5, n || 0)));
  const empty  = "☆".repeat(Math.max(0, 5 - (n || 0)));
  return `<span class="stars">${filled}${empty}</span>`;
}

