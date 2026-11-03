// menuCard.js — the pieces of the menu's full player card: every stat he has, season by season,
// regular season and postseason; the career table with totals; the rating history; why the
// number is what it is; the transfer path; and the photo slot.
//
// Pure markup builders over one player's card rows (cards/NNNN.json, oldest season first). No
// fetch, no routing, no DOM access. A stat the data does not hold is left out, never shown as a
// zero, and a missing section says why (menuScreensTeam.js passes the reason in).
//
// Must never contain: fetch calls or routing logic.
//
// Load order: after ui.js, before menuScreensTeam.js.

// Every stat the data holds, grouped as a box score groups them: [stat key, label, kind]. Keys are the
// ones in the exported stat blobs (script 01's category + type names). kind "pct" is stored as a fraction.
const MENU_STAT_GROUPS = [
  { label: "Passing", rows: [["passingCOMPLETIONS", "Completions"], ["passingATT", "Attempts"], ["passingPCT", "Completion %", "pct"],
    ["passingYDS", "Yards"], ["passingYPA", "Yards / attempt"], ["passingTD", "Touchdowns"], ["passingINT", "Interceptions"]] },
  { label: "Rushing", rows: [["rushingCAR", "Carries"], ["rushingYDS", "Yards"], ["rushingYPC", "Yards / carry"], ["rushingTD", "Touchdowns"], ["rushingLONG", "Long"]] },
  { label: "Receiving", rows: [["receivingREC", "Catches"], ["receivingYDS", "Yards"], ["receivingYPR", "Yards / catch"], ["receivingTD", "Touchdowns"], ["receivingLONG", "Long"]] },
  { label: "Defense", rows: [["defensiveTOT", "Tackles"], ["defensiveSOLO", "Solo tackles"], ["defensiveTFL", "Tackles for loss"], ["defensiveSACKS", "Sacks"],
    ["defensiveQB HUR", "QB hurries"], ["defensivePD", "Passes defended"], ["defensiveTD", "Touchdowns"]] },
  { label: "Interceptions", rows: [["interceptionsINT", "Interceptions"], ["interceptionsYDS", "Return yards"], ["interceptionsAVG", "Yards / return"], ["interceptionsTD", "Touchdowns"]] },
  { label: "Fumbles", rows: [["fumblesFUM", "Fumbles"], ["fumblesLOST", "Lost"], ["fumblesREC", "Recovered"]] },
  { label: "Kicking", rows: [["kickingFGM", "Field goals made"], ["kickingFGA", "Field goals tried"], ["kickingPCT", "FG %", "pct"], ["kickingLONG", "Long"],
    ["kickingXPM", "Extra points made"], ["kickingXPA", "Extra points tried"], ["kickingPTS", "Points"]] },
  { label: "Punting", rows: [["puntingNO", "Punts"], ["puntingYDS", "Yards"], ["puntingYPP", "Yards / punt"], ["puntingLONG", "Long"], ["puntingTB", "Touchbacks"], ["puntingIn 20", "Inside the 20"]] },
  { label: "Kick returns", rows: [["kickReturnsNO", "Returns"], ["kickReturnsYDS", "Yards"], ["kickReturnsAVG", "Yards / return"], ["kickReturnsLONG", "Long"], ["kickReturnsTD", "Touchdowns"]] },
  { label: "Punt returns", rows: [["puntReturnsNO", "Returns"], ["puntReturnsYDS", "Yards"], ["puntReturnsAVG", "Yards / return"], ["puntReturnsLONG", "Long"], ["puntReturnsTD", "Touchdowns"]] },
  { label: "Usage", rows: [["snap_pct", "Share of team plays", "pct"], ["snap_pct_pass", "Share of passing plays", "pct"], ["snap_pct_rush", "Share of rushing plays", "pct"]], noTotal: true },
];

// A rate is not summed: it is recomputed from the totals it is made of, as [numerator key, denominator key].
const MENU_STAT_RATES = {
  passingPCT: ["passingCOMPLETIONS", "passingATT"], passingYPA: ["passingYDS", "passingATT"],
  rushingYPC: ["rushingYDS", "rushingCAR"], receivingYPR: ["receivingYDS", "receivingREC"],
  kickingPCT: ["kickingFGM", "kickingFGA"], puntingYPP: ["puntingYDS", "puntingNO"],
  interceptionsAVG: ["interceptionsYDS", "interceptionsINT"],
  kickReturnsAVG: ["kickReturnsYDS", "kickReturnsNO"], puntReturnsAVG: ["puntReturnsYDS", "puntReturnsNO"],
};

// The columns of the career table for each position: [stat key, heading]. OL has none (no individual stats).
const MENU_CAREER_COLS = {
  QB: [["passingYDS", "PASS YD"], ["passingTD", "TD"], ["passingINT", "INT"], ["passingPCT", "CMP%", "pct"], ["rushingYDS", "RUSH YD"]],
  RB: [["rushingCAR", "CAR"], ["rushingYDS", "RUSH YD"], ["rushingTD", "TD"], ["receivingREC", "REC"], ["receivingYDS", "REC YD"]],
  WR: [["receivingREC", "REC"], ["receivingYDS", "YDS"], ["receivingTD", "TD"], ["receivingYPR", "Y/R"]],
  TE: [["receivingREC", "REC"], ["receivingYDS", "YDS"], ["receivingTD", "TD"], ["receivingYPR", "Y/R"]],
  EDGE: [["defensiveTOT", "TKL"], ["defensiveTFL", "TFL"], ["defensiveSACKS", "SACK"], ["defensivePD", "PD"]],
  DL: [["defensiveTOT", "TKL"], ["defensiveTFL", "TFL"], ["defensiveSACKS", "SACK"], ["defensivePD", "PD"]],
  LB: [["defensiveTOT", "TKL"], ["defensiveTFL", "TFL"], ["defensiveSACKS", "SACK"], ["interceptionsINT", "INT"]],
  CB: [["defensiveTOT", "TKL"], ["interceptionsINT", "INT"], ["defensivePD", "PD"], ["defensiveTFL", "TFL"]],
  S: [["defensiveTOT", "TKL"], ["interceptionsINT", "INT"], ["defensivePD", "PD"], ["defensiveTFL", "TFL"]],
  DB: [["defensiveTOT", "TKL"], ["interceptionsINT", "INT"], ["defensivePD", "PD"], ["defensiveTFL", "TFL"]],
  K: [["kickingFGM", "FGM"], ["kickingFGA", "FGA"], ["kickingPCT", "FG%", "pct"], ["kickingLONG", "LONG"]],
  P: [["puntingNO", "PUNTS"], ["puntingYDS", "YDS"], ["puntingYPP", "AVG"], ["puntingLONG", "LONG"]],
};

// A stat value as a number, or null when it is absent or not numeric. The blobs store most counts as strings.
function _menuNum(v) {
  if (v == null || v === "" || typeof v === "boolean") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Two stat blobs combined into one (regular season + postseason, or season + season): counts are summed, a
// "long" is the larger, and a rate is recomputed from the combined counts it is made of. A key neither blob
// holds a number for is left out.
function menuCombineStats(a, b) {
  const out = {};
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    if (MENU_STAT_RATES[k]) continue;
    const x = _menuNum((a || {})[k]), y = _menuNum((b || {})[k]);
    if (x == null && y == null) continue;
    out[k] = /LONG$/.test(k) ? Math.max(x ?? -Infinity, y ?? -Infinity) : (x ?? 0) + (y ?? 0);
  }
  for (const [k, [num, den]] of Object.entries(MENU_STAT_RATES)) {
    if (out[num] != null && out[den]) out[k] = out[num] / out[den];
  }
  return out;
}

// A player-season's regular-season and postseason lines combined. A few players whose only game was a bowl have the
// SAME line in both (the season aggregate repeated the postseason one: 21 of 1,389 figures checked for 2025, 1.5%),
// so identical lines count once.
function menuSeasonTotals(row) {
  const reg = row && row.stats_season ? row.stats_season : {};
  const post = row && row.stats_postseason ? row.stats_postseason : {};
  const same = Object.keys(post).length > 0 && JSON.stringify(reg) === JSON.stringify(post);
  return menuCombineStats(same ? {} : reg, post);
}

// One stat value as shown: a dash for none, a percentage for a fraction, whole numbers plain, the rest to one decimal.
function menuStatText(v, kind) {
  const n = _menuNum(v);
  if (n == null) return "—";
  // A percentage is stored as a fraction (0.712), but stats rebuilt from game rows hold it as a percent (71.2):
  // both read as 71.2%. A fraction of exactly 1 (100%) stays 100.
  if (kind === "pct") return `${(n > 1 ? n : n * 100).toFixed(1)}%`;
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(1);
}

// The full season line as tables, one per box-score group he has stats in: Regular season, then Postseason
// and Total when he has postseason stats. `row` is his card row for the season. "" when the row holds no stat.
function menuStatTable(row) {
  const reg = row && row.stats_season ? row.stats_season : {};
  const post = row && row.stats_postseason ? row.stats_postseason : {};
  const total = menuSeasonTotals(row);
  const groups = MENU_STAT_GROUPS.map(g => {
    const rows = g.rows.filter(([k]) => _menuNum(reg[k]) != null || _menuNum(post[k]) != null);
    return { g, rows };
  }).filter(x => x.rows.length);
  if (!groups.length) return "";
  const hasPost = groups.some(({ g, rows }) => !g.noTotal && rows.some(([k]) => _menuNum(post[k]) != null));
  const head = g => `<tr><th scope="col">${_esc(g.label)}</th><th scope="col">Regular</th>${hasPost && !g.noTotal ? "<th scope=\"col\">Postseason</th><th scope=\"col\">Total</th>" : ""}</tr>`;
  return groups.map(({ g, rows }) => `<table class="m-stattable">
      <thead>${head(g)}</thead><tbody>${rows.map(([k, label, kind]) => `<tr><th scope="row">${_esc(label)}</th><td>${menuStatText(reg[k], kind)}</td>${
        hasPost && !g.noTotal ? `<td>${menuStatText(post[k], kind)}</td><td><b>${menuStatText(total[k] ?? reg[k], kind)}</b></td>` : ""}</tr>`).join("")}</tbody></table>`).join("");
}

// The career table: a line per season (team, games, rating, the position's own stat columns, regular season and
// postseason together) and a totals line. `rows` are his card rows oldest first; `pg` his position group. The
// rating shown for a season is the earned one; a season being played shows its projection and to-date elsewhere.
function menuCareerTable(rows, pg) {
  const cols = MENU_CAREER_COLS[pg] || [];
  const lines = rows.map(r => ({ r, s: menuSeasonTotals(r) }));
  const all = lines.reduce((acc, { s }) => menuCombineStats(acc, s), {});
  const gp = rows.reduce((n, r) => n + (_menuNum(r.games_played) || 0), 0);
  const heads = cols.map(([, h]) => `<th scope="col">${h}</th>`).join("");
  const cells = s => cols.map(([k, , kind]) => `<td>${menuStatText(s[k], kind)}</td>`).join("");
  const body = lines.map(({ r, s }) => `<tr><th scope="row">${r.season}</th><td>${r.team_id ? `<button class="m-chip m-chip--tiny" type="button" data-nav data-nav-group="career-teams" data-to="${menuTeamPath(r.team_id)}">${_esc(r.team_abbr || r.team || "—")}</button>` : _esc(r.team_abbr || r.team || "—")}</td><td>${_menuNum(r.games_played) ?? "—"}</td>
      <td>${ovrPill(r.overall_rating, { season: r.season, label: `Rating, ${r.season}`, why: menuNoRatingWhy(r, r.season) })}</td>${cells(s)}</tr>`).join("");
  return `<table class="m-stattable m-career-table"><thead><tr><th scope="col">YEAR</th><th scope="col">TEAM</th><th scope="col">GP</th><th scope="col">OVR</th>${heads}</tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><th scope="row">CAREER</th><td></td><td>${gp || "—"}</td><td></td>${cells(all)}</tr></tfoot></table>`;
}

// The few stats worth a glance for his position, as big tiles: the position's career-table columns, regular
// season and postseason together. "" when he has none (an offensive lineman, or no stat line on file).
function menuKeyTiles(p, pg) {
  const total = menuSeasonTotals(p);
  return (MENU_CAREER_COLS[pg] || []).filter(([k]) => total[k] != null)
    .map(([k, label, kind]) => `<div class="m-stat"><b>${menuStatText(total[k], kind)}</b><span>${_esc(label)}</span></div>`).join("");
}

// Career statistics the way a console game lays them out: for each box-score group he has stats in, a table with a
// column per season and a TOTAL column (regular season and postseason together; counts summed, longs maxed, rates
// recomputed). Seasons without the group are dashes. "" when he has no stats at all.
function menuCareerGrid(rows) {
  const per = rows.map(r => ({ season: r.season, s: menuSeasonTotals(r) }));
  const total = per.reduce((acc, x) => menuCombineStats(acc, x.s), {});
  const tables = MENU_STAT_GROUPS.filter(g => !g.noTotal).map(g => {
    const lines = g.rows.filter(([k]) => per.some(x => x.s[k] != null));
    if (!lines.length) return "";
    return `<table class="m-stattable m-careergrid"><thead><tr><th scope="col">${_esc(g.label)}</th>${per.map(x => `<th scope="col">${x.season}</th>`).join("")}<th scope="col">TOTAL</th></tr></thead>
      <tbody>${lines.map(([k, label, kind]) => `<tr><th scope="row">${_esc(label)}</th>${per.map(x => `<td>${menuStatText(x.s[k], kind)}</td>`).join("")}<td><b>${menuStatText(total[k], kind)}</b></td></tr>`).join("")}</tbody></table>`;
  }).join("");
  return tables ? `<div class="m-stats">${tables}</div>` : "";
}

// The rating history strip: one cell per season he is rated in, oldest first, then (for a season being
// played) this season's projection and to-date cells, which are never merged with the earned ones.
function menuRatingHistory(rows, p, season) {
  const cell = (cap, pill) => `<div class="m-career-cell"><span class="m-career-yr">${cap}</span>${pill}</div>`;
  const cells = rows.filter(r => r.season !== season || !hasTrio(p)).filter(r => r.overall_rating != null)
    .map(r => cell(r.season, ovrPill(r.overall_rating, { season: r.season, label: `Rating, ${r.season}` })));
  if (hasTrio(p)) {
    cells.push(cell(`${season} PROJ`, projPill(p, season)));
    cells.push(cell(`${season} TO DATE`, livePill(p)));
  }
  return cells.length ? `<div class="m-career-row">${cells.join("")}</div>` : '<p class="m-empty">No rated seasons on file for him.</p>';
}

// The line a rating built on one or two games carries: how many games, and what that is worth. "" for anyone else.
function menuLowGameLine(games) {
  const n = _menuNum(games);
  if (n == null || n < 1 || n > 2) return "";
  return `<li><b>${n} game${n === 1 ? "" : "s"}:</b> rated on ${n === 1 ? "the one game" : "the two games"} he has played. What he did moves a recruiting-based starting point only a few rating points, more for a second game and for a busier one, and a rating from this few games is capped well below a star's.</li>`;
}

// What each rating on the card is built from, in words: for a season being played, the earned rating of the season
// before (from his card rows), where the projection came from, and the to-date rating's games; for any season, the
// production score and the games it is over, the three jobs of a defensive back, and the basis. Nothing is inferred
// beyond what the rows hold.
function menuWhyBlock(p, rows = []) {
  if (!p) return "";
  const lines = [];
  if (hasTrio(p)) {
    const prev = rows.find(r => r.season === (p.season ?? MENU.season) - 1);
    if (prev && _menuNum(prev.edge_score) != null) {
      lines.push(`<li><b>${prev.season}, earned:</b> production score ${_menuNum(prev.edge_score).toFixed(1)}${_menuNum(prev.games_played) ? ` over ${prev.games_played} games` : ""}, turned into the rating by fixed position anchors.</li>`);
    }
    if (p.overall_rating != null) {
      lines.push(`<li><b>Projection:</b> ${_esc(PROJECTION_SOURCE_LABELS[p.projection_source] || "a model's estimate made before a game was played")}.</li>`);
    }
    if (p.live_rating != null) {
      const low = p.live_basis === "blended" ? menuLowGameLine(p.live_games) : "";
      lines.push(low || `<li><b>To date:</b> the same production score over his ${p.live_games ?? "counted"} games so far this season, scaled to a full-season pace.</li>`);
    }
  }
  const edge = _menuNum(p.edge_score);
  if (edge != null) {
    lines.push(`<li>Production score <b>${edge.toFixed(1)}</b>${_menuNum(p.games_played) ? ` over ${p.games_played} games` : ""}: his counted game scores, each adjusted for the opponent, added up and divided by the square root of games played. Fixed position anchors turn that score into the rating, the same for every season.</li>`);
  }
  if (p.rating_basis === "recruiting") lines.push("<li>No game production was on file, so this rating comes from his recruiting grade alone.</li>");
  else if (p.rating_basis === "blended") lines.push(menuLowGameLine(p.games_played) || "<li>Blended: part production, part recruiting grade, because he has few counted games.</li>");
  if (p.stars) lines.push(`<li>Recruited as a <b>${p.stars}-star</b> prospect${_menuNum(p.composite_score) != null ? ` (composite ${p.composite_score.toFixed(4)})` : ""}.</li>`);
  else if (p.rating_status !== "not_rated") lines.push("<li>No recruiting grade on record.</li>");
  if (_menuNum(p.breakout_prob) >= 0.35) lines.push(`<li><b>Breakout candidate:</b> a young player with a high recruiting grade who is producing below the median for it (${Math.round(p.breakout_prob * 100)}% probability from the model).</li>`);
  if (!lines.length) lines.push(`<li>${_esc(menuNoRatingWhy(p, p.season ?? MENU.season) || "No production detail is on file for this season.")}</li>`);
  return `<ul class="m-why">${lines.join("")}</ul>`;
}

// His transfer moves, oldest first, as lines: year, from, to. "" when he has none.
function menuTransferPath(moves, teams = []) {
  if (!moves || !moves.length) return "";
  return `<ul class="m-why">${[...moves].sort((a, b) => (a.transfer_year || 0) - (b.transfer_year || 0))
    .map(m => `<li><b>${_esc(String(m.transfer_year ?? "—"))}</b> ${menuSchoolLink(m.from_school, teams)} → ${menuSchoolLink(m.to_school, teams) || "no listed school"}</li>`).join("")}</ul>`;
}

// A school named in text: a button to its team page when it is one of ours, else plain text; "" for no school.
function menuSchoolLink(name, teams) {
  if (!name) return "—";
  const t = teams.find(x => x.school === name);
  return t ? `<button class="m-chip m-chip--tiny" type="button" data-nav data-nav-group="links" data-to="${menuTeamPath(t.id)}">${_esc(name)}</button>` : _esc(name);
}

// ── Brought in from the classic player modal (v4.25) ───────────────────────────────────────────────

// The three jobs behind a defensive back's overall, and the weight each carries (script 06 SECONDARY_ARCHETYPE_WEIGHTS).
const MENU_ARCHETYPES = {
  ball_hawk:   ["Ball hawk",   "Interceptions, pass breakups and returns: what he does when the ball arrives."],
  coverage:    ["Lockdown",    "Playing time on a defense that gave up little through the air. It carries no box-score input: a covered receiver produces no statistic."],
  run_support: ["Run support", "Tackles, tackles for loss and sacks: the part of the job that happens in front of him."],
};
const MENU_ARCHETYPE_WEIGHTS = {
  CB: { coverage: 0.40, ball_hawk: 0.40, run_support: 0.20 },
  S:  { run_support: 0.50, ball_hawk: 0.30, coverage: 0.20 },
  DB: { run_support: 1 / 3, ball_hawk: 1 / 3, coverage: 1 / 3 },
};

// "What kind of defensive back": the three archetype scores (0-10) his overall is built from, each as a bar with its weight, the
// largest first, led by a sentence naming the top one. "" for anyone else.
function menuArchetypeBars(p) {
  const a = p && p.archetypes, w = p && MENU_ARCHETYPE_WEIGHTS[p.position_group];
  if (!a || typeof a !== "object" || !w) return "";
  const order = Object.keys(w).sort((x, y) => (_menuNum(a[y]) ?? 0) - (_menuNum(a[x]) ?? 0));
  const bars = order.map(k => {
    const v = _menuNum(a[k]) ?? 0, meta = MENU_ARCHETYPES[k];
    return `<div class="m-bar m-bar--wide" title="${_esc(`${meta[0]}, ${Math.round(w[k] * 100)}% of a ${p.position_group}'s overall. ${meta[1]}`)}">
      <span class="m-bar-label">${_esc(meta[0])}</span>
      <span class="m-bar-track"><i style="width:${Math.max(0, Math.min(100, v * 10))}%;background:${ratingColor(Math.round(30 + v * 6.5))}"></i></span>
      <b class="m-bar-val">${v.toFixed(1)}</b></div>`;
  }).join("");
  return `<h3 class="m-h3">What kind of defensive back</h3>
    <p class="m-note">${_esc((p.name || "He").split(" ")[0])} grades out as a <b>${_esc(MENU_ARCHETYPES[order[0]][0].toLowerCase())}</b>. His overall is these three jobs scored 0 to 10 and weighted by what a ${_esc(p.position_group)} is paid to do (${order.map(k => `${MENU_ARCHETYPES[k][0].toLowerCase()} ${Math.round(w[k] * 100)}%`).join(", ")}).</p>
    ${bars}
    <p class="m-note">Lockdown has no box-score input at all: quarterbacks avoid the players who earn it, so it is built from playing time and what his defense allowed per pass thrown.</p>`;
}

// Where his production score sits among the players of his position that season, as a strip with the words beside it. A raw score
// is not comparable across positions (a quarterback's runs to 1,600, a linebacker's to 65); the percentile is. "" without one.
function menuEdgeStrip(pct, p, season) {
  if (pct == null) return "";
  return `<div class="m-edge">${contextStrip(pct, `${pct}th percentile among ${p.position_group}s in ${season}`)}</div>`;
}

// The Engine D projection for the season it is FOR: the number, its 80% range, the label, how far above or below his cohort it is and
// how confident the model is. The reasoning (prose, drivers, comparable careers) is a 5.5 MB file fetched after the card is on screen
// and drawn into #m-proj-why by menuProjectionWhy. `t` is his row of trajectory.json, `meta` its _meta.
function menuProjectionPanel(t, meta) {
  const label = String(t.trajectory_label || "");
  const tone = label === "breakout" || label === "bounceback" ? " is-pos" : label === "decline" ? " is-neg" : "";
  const vs = _menuNum(t.vs_cohort);
  const forSeason = meta.predicts_season || CONFIG.CURRENT_SEASON;
  const how = t.family === "offense"
    ? `Projected from his career production curve, his cohort's development curve, and the opportunity in front of him: depth-chart position on the ${forSeason} roster and how much production is departing ahead of him.`
    : "Projected from his career production curve against what players at the same position and class year historically did next. Defensive ratings rest on less complete production data than offensive ones, so read this as indicative.";
  return `<section class="m-panel" id="m-proj"><h3 class="m-h3">${forSeason} projection ${projBadge()}</h3>
      <div class="m-projhead">
        <div><span class="m-projnum">${Math.round(t.predicted_ovr)}</span> ${projRange(t.proj_low, t.proj_high)}<div class="m-note">projected rating</div></div>
        <div><b class="m-projlabel${tone}">${_esc(label)}</b>
          <div class="m-note">${vs == null ? "" : `${vs > 0 ? "+" : ""}${vs.toFixed(1)} against a cohort expectation of ${_esc(String(t.cohort_expected))}`}</div>${confidenceChip(t.confidence)}</div>
      </div>
      <div id="m-proj-why"><p class="m-empty">Loading the reasoning…</p></div>
      <p class="m-foot">${how}${_menuNum(meta.model_mae) != null ? ` Typical error ±${meta.model_mae} rating points.` : ""} Players who leave for the NFL are absent from the history these curves are built on, so decline at the very top is somewhat overstated.</p></section>`;
}

// The reasoning behind one projection from trajectory_detail.json: a sentence, the signed drivers as centred bars (scaled to the
// largest), and the historical players whose careers looked like his at the same stage with what each did the next year. "" with none.
function menuProjectionWhy(d) {
  if (!d) return "";
  const drivers = d.drivers || [];
  const max = Math.max(...drivers.map(x => Math.abs(x.effect)), 0.1);
  const bars = drivers.map(x => {
    const pos = x.effect >= 0, w = Math.min(100, Math.abs(x.effect) / max * 100) / 2;
    return `<div class="m-driver"><span class="m-driver-label">${_esc(x.label)}</span>
      <span class="m-driver-track"><i class="${pos ? "is-pos" : "is-neg"}" style="width:${w.toFixed(1)}%"></i></span>
      <b class="m-driver-val ${pos ? "is-pos" : "is-neg"}">${pos ? "+" : ""}${x.effect.toFixed(1)}</b></div>`;
  }).join("");
  const comps = (d.comparables || []).map(c => `<button class="m-row m-row--mini" type="button" data-nav data-nav-group="comps" data-to="${menuPlayerPath(c.player_id)}">
      <span class="m-rank"></span><span class="m-pname">${_esc(c.name)} <small>${_esc(String(c.season))} · rated ${_esc(String(c.ovr))}</small></span>
      <span class="m-num ${c.actual_delta >= 0 ? "is-pos" : "is-neg"}">${c.actual_delta >= 0 ? "+" : ""}${c.actual_delta} next year</span></button>`).join("");
  return `${d.explanation ? `<p class="m-note m-explain">${_esc(d.explanation)}</p>` : ""}
    ${bars ? `<h4 class="m-h4">What moved the number</h4>${bars}` : ""}
    ${comps ? `<h4 class="m-h4">Careers that looked like his</h4>${comps}` : ""}`;
}

// Players from any season with the most similar production profile at his position, each with how alike (%), his team and season,
// and his rating then. Each row opens that player's card. "" with none.
function menuSimilarPanel(list) {
  if (!list || !list.length) return "";
  return `<section class="m-panel"><h3 class="m-h3">Similar players, across eras</h3>
      <p class="m-note">Players from any season with the most similar production profile at this position.</p>
      ${list.map(s => `<button class="m-row m-row--mini" type="button" data-nav data-nav-group="similar" data-to="${menuPlayerPath(s.id)}">
        <span class="m-rank">${Math.round(s.similarity * 100)}%</span><span class="m-pname">${_esc(s.name)} <small>${_esc(s.team || "—")} · ${_esc(String(s.season))}</small></span>
        <span class="m-rating">${s.ovr == null ? "—" : ovrPill(s.ovr, { season: s.season, label: `Rating, ${s.season}` })}</span></button>`).join("")}
    </section>`;
}

// The photo slot at the head of the card: a fixed-size frame so nothing moves when a photo arrives. It always
// holds his initials; when the photo mapping (data/headshots.json) has him, his ESPN image is drawn over them
// and removed again if it fails to load (menuWirePhoto), so a miss is never a broken-image icon.
function menuPhotoHtml(p, hs) {
  const initials = String(p.name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const espnId = hs && hs.players ? hs.players[String(p.id ?? p.player_id)] : null;
  const img = espnId ? `<img src="${_esc(String(hs.image).replace("{id}", espnId))}" alt="${_esc(p.name || "Player")}" loading="lazy" referrerpolicy="no-referrer">` : "";
  return `<div class="m-photo"${img ? "" : ' aria-hidden="true"'}><span class="m-photo-initials">${_esc(initials)}</span>${img}</div>`;
}

// A small photo for a player inside a row: his ESPN image over his initials in a fixed frame, so rows do not
// shift. Without a match (or with headshots off) it is the initials alone. menuWirePhoto drops a failed image.
function menuAvatar(playerId, name, hs) {
  const initials = String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const espnId = hs && hs.players ? hs.players[String(playerId)] : null;
  const img = espnId ? `<img src="${_esc(String(hs.image).replace("{id}", espnId))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "";
  return `<span class="m-avatar" aria-hidden="true"><span>${_esc(initials)}</span>${img}</span>`;
}

// Drops a photo that failed to load, so the initials show instead of a broken-image icon. Called after the
// card is in the page; an image that already failed before this ran is caught by the complete check.
function menuWirePhoto(root) {
  root.querySelectorAll(".m-photo img, .m-avatar img").forEach(img => {
    const drop = () => img.remove();
    img.addEventListener("error", drop);
    if (img.complete && img.naturalWidth === 0) drop();
  });
}
