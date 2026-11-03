// menuScreensRatings.js — two screens brought into the menu from the classic site (v4.25): a team's Ratings page (the breakdown, the
// offensive line rated as a unit, the team's per-game numbers) and the talent-versus-production scatter.
//
// Both read files the site already ships (team_ratings.json through fetchTeams, team_stats_{season}.json, the season's player file)
// and invent nothing: a number the data does not hold is a dash, never a zero, and a withheld one says why.
//
// Must never contain: fetch calls (dataLoader.js owns those) or routing logic.
//
// Load order: after menuScreensLeague.js (it uses menuScheduleBand) and before menuHome.js.

// ── A team's Ratings ──────────────────────────────────────────────────────

// The five sub-ratings a team's overall is blended from, as [label, key in the team's sub_ratings].
const MENU_SUBRATINGS = [["Pass offense", "pass_off"], ["Run offense", "run_off"], ["Pass defense", "pass_def"], ["Run defense", "run_def"], ["Special teams", "special_teams"]];

// The five line metrics, as [label, what it measures]. Each is drawn as its position in the range the unit rating was calibrated over.
const MENU_LINE_INPUTS = {
  line_yards:            ["Line yards", "Rushing yards credited to the line rather than the back"],
  sack_rate_allowed_inv: ["Pass protection", "Sacks allowed per dropback, inverted"],
  stuff_rate_inv:        ["Stuff rate", "Runs stopped at or behind the line, inverted"],
  power_success:         ["Short yardage", "Conversion rate on 3rd and 4th and 2 or less"],
  second_level_yards:    ["Second level", "Yards earned 5 to 10 past the line"],
};

// A bar at `pct` (0 to 100) in `color`, with the number beside it. For values that are not ratings themselves (the line metrics).
function menuPctBar(label, pct, color, hint = "") {
  return `<div class="m-bar m-bar--wide" title="${_esc(hint)}"><span class="m-bar-label">${_esc(label)}</span>
    <span class="m-bar-track"><i style="width:${pct}%;background:${color}"></i></span><b class="m-bar-val">${pct}</b></div>`;
}

// The offensive line as a unit: its rating and the five measurements behind it. This is the constructive half of withdrawing the
// per-lineman rating (no individual blocking data exists in any public source), so it says explicitly when it has no number.
function menuLineUnit(sub, season) {
  const why = `<p class="m-note">A <b>unit</b> rating, not a player one. No individual blocking data exists in any public source, so linemen are not rated one by one. <button class="m-chip m-chip--tiny" type="button" data-nav data-nav-group="links" data-to="#/methods/ol">Why, and what we do instead →</button></p>`;
  if (sub.line_unit == null) {
    return `<h3 class="m-h3">Offensive line</h3><p class="m-empty">${isProjectedSeason(season)
      ? "Not rated for a season in progress: the line metrics measure games, and the games are still being played."
      : "No line metrics are on file for this season."}</p>${why}`;
  }
  const inputs = sub.line_unit_inputs || {};
  const bars = Object.entries(MENU_LINE_INPUTS).filter(([k]) => inputs[k] != null).map(([k, [label, hint]]) => {
    const pct = Math.round(Math.max(0, Math.min(1, inputs[k])) * 100);
    return menuPctBar(label, pct, ratingColor(Math.round(30 + inputs[k] * 65)), hint);
  }).join("");
  return `<h3 class="m-h3">Offensive line ${lineUnitPill(sub.line_unit)}</h3>${bars}${why}
    <p class="m-note">Each bar is that measurement's position in the range the unit rating was calibrated over (Methods gives the sample).</p>`;
}

// The team's per-game numbers as three groups of tiles, or "" for a season with none (a season not yet played).
function menuTeamStatTiles(s) {
  if (!s) return "";
  const v = (x, suffix = "") => (x == null ? "—" : `${x}${suffix}`);
  const tile = (label, x) => `<div class="m-stat"><b>${x}</b><span>${_esc(label)}</span></div>`;
  const group = (title, tiles) => `<h4 class="m-h4">${_esc(title)}</h4><div class="m-stats">${tiles.join("")}</div>`;
  return group("Offense", [tile("Yards / game", v(s.yards_pg)), tile("Pass / game", v(s.pass_yards_pg)), tile("Rush / game", v(s.rush_yards_pg)), tile("3rd down", v(s.third_down_pct, "%"))])
    + group("Defense", [tile("Allowed / game", v(s.yards_allowed_pg)), tile("Pass allowed", v(s.pass_allowed_pg)), tile("Rush allowed", v(s.rush_allowed_pg)), tile("3rd down def.", v(s.third_down_def_pct, "%"))])
    + group("Disruption and ball security", [tile("Sacks / game", v(s.sacks_pg)), tile("TFL / game", v(s.tfl_pg)), tile("Takeaways", v(s.takeaways)),
        tile("Turnover margin", s.turnover_margin == null ? "—" : (s.turnover_margin > 0 ? "+" : "") + s.turnover_margin)]);
}

menuRouter.register("team-ratings", {
  title: ctx => (ctx.team ? ctx.team.school : "Ratings"),
  crumb: () => "TEAM › RATINGS",
  prompts: [{ action: "move", label: "Move" }, { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const team = menuViewTeam(ctx, d);
    ctx.team = team; ctx.d = d;
    if (!team) return menuErrorPanel(`That team is not in the ${MENU.season} list.`, true);
    const sub = team.sub_ratings || {};
    const stats = (await fetchTeamStats(MENU.season))[String(team.id)];
    const bars = MENU_SUBRATINGS.map(([label, key]) => menuBar(label, sub[key])).join("");
    const refs = [team.sp_overall != null ? `SP+ margin ${team.sp_overall > 0 ? "+" : ""}${Number(team.sp_overall).toFixed(1)} (a reference, not an input)` : "",
                  team.recruiting_score != null ? `Recruiting ${Math.round(team.recruiting_score)}` : ""].filter(Boolean);
    return `${menuScheduleBand(d, team)}
      <div class="m-split m-split--roster">
        <section class="m-panel m-bars-wide"><h3 class="m-h3">Rating breakdown</h3>${bars}
          ${refs.length ? `<p class="m-note">${refs.map(_esc).join(" · ")}</p>` : ""}
          <p class="m-note">${isProjectedSeason(MENU.season) ? `The ${MENU.season} breakdown is the preseason projection, built from the roster. ` : ""}The overall blends the roster's ratings with the team's stats and results (How It Works explains the blend); each bar is one slice of it.</p></section>
        <section class="m-panel">${menuLineUnit(sub, MENU.season)}</section>
      </div>
      <section class="m-panel"><h3 class="m-h3">Team stats ${MENU.season}</h3>${menuTeamStatTiles(stats) || `<p class="m-empty">${isProjectedSeason(MENU.season) ? "No games played yet, so no per-game numbers." : "No per-game team stats are on file for this season."}</p>`}</section>`;
  },
});

// ── Talent versus production ──────────────────────────────────────────────

const MENU_SCATTER_POS = ["ALL", "QB", "RB", "WR", "TE", "EDGE", "DL", "LB", "DB"];
const MENU_SCATTER_OVER = 8;            // a dot this many points above the trend line is an overperformer
let _menuScatterQuery = "";

// The rating a dot is drawn at: earned (to date in a season being played). A player with none is not drawn, never drawn at zero.
function menuScatterRating(p) {
  return hasTrio(p) ? p.live_rating : p.overall_rating;
}

// The least-squares line of rating on recruiting stars over `pts`, as { slope, intercept }. Flat with fewer than two stars levels.
function menuTrendLine(pts) {
  const n = pts.length;
  const xm = pts.reduce((s, p) => s + p.stars, 0) / n, ym = pts.reduce((s, p) => s + menuScatterRating(p), 0) / n;
  const sxy = pts.reduce((s, p) => s + (p.stars - xm) * (menuScatterRating(p) - ym), 0);
  const sxx = pts.reduce((s, p) => s + (p.stars - xm) ** 2, 0);
  const slope = sxx ? sxy / sxx : 0;
  return { slope, intercept: ym - slope * xm };
}

// The chart as SVG at width W: recruiting stars (a small fixed jitter by player id, so a redraw does not move the dots) across,
// rating up, the trend line dashed, and a dot 8 or more above the line larger and in the positive colour. `shown` is the subset
// to draw (the search); the line is always fitted to `all`.
function menuScatterSvg(all, shown, W) {
  const H = W < 560 ? 340 : 420, PAD = { top: 24, right: 20, bottom: 52, left: 48 };
  const PW = W - PAD.left - PAD.right, PH = H - PAD.top - PAD.bottom;
  const xMin = 0.5, xMax = 5.5, yMin = 25, yMax = 100;
  const xs = v => PAD.left + ((v - xMin) / (xMax - xMin)) * PW;
  const ys = v => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * PH;
  const { slope, intercept } = menuTrendLine(all);
  const reg = x => slope * x + intercept;
  const dots = shown.map((p, i) => {
    const r = menuScatterRating(p);
    const jitter = (((Math.imul(p.id | 0, 2654435761) >>> 0) % 1000) / 1000 - 0.5) * 0.18;
    const over = r > reg(p.stars) + MENU_SCATTER_OVER;
    return `<circle cx="${xs(p.stars + jitter).toFixed(1)}" cy="${ys(Math.max(yMin, Math.min(yMax, r))).toFixed(1)}" r="${over ? 6 : 4}"
      fill="${over ? "var(--positive)" : posColor(p.position_group || "ATH")}" opacity="0.82" stroke="${over ? "var(--m-text)" : "none"}" stroke-width="1.2" data-i="${i}"/>`;
  }).join("");
  const yTicks = [40, 50, 60, 70, 80, 90].map(v => `<line x1="${PAD.left - 4}" y1="${ys(v).toFixed(1)}" x2="${PAD.left + PW}" y2="${ys(v).toFixed(1)}" stroke="var(--m-line)" stroke-width="1" opacity="0.6"/>
    <text x="${PAD.left - 8}" y="${(ys(v) + 4).toFixed(1)}" text-anchor="end" font-size="13" fill="var(--m-muted)">${v}</text>`).join("");
  const xTicks = [1, 2, 3, 4, 5].map(s => `<text x="${xs(s).toFixed(1)}" y="${PAD.top + PH + 20}" text-anchor="middle" font-size="13" fill="var(--m-muted)">${"★".repeat(s)}</text>`).join("");
  const line = `<line x1="${xs(xMin + 0.3).toFixed(1)}" y1="${ys(Math.max(yMin, Math.min(yMax, reg(xMin + 0.3)))).toFixed(1)}" x2="${xs(xMax - 0.3).toFixed(1)}" y2="${ys(Math.max(yMin, Math.min(yMax, reg(xMax - 0.3)))).toFixed(1)}" stroke="var(--m-muted)" stroke-width="1.5" stroke-dasharray="5,4"/>`;
  const label = (x, y, text, fill) => `<text x="${xs(x).toFixed(1)}" y="${ys(y).toFixed(1)}" font-size="12" letter-spacing="1" fill="${fill}" font-style="italic">${text}</text>`;
  return `<svg width="${W}" height="${H}" role="img" aria-label="Rating against recruiting stars, one dot per player" style="display:block;overflow:visible">
      ${yTicks}${line}${dots}${label(1.1, 91, "HIDDEN GEMS", "var(--positive)")}${label(3.7, 36, "UNDERPERFORMING", "var(--negative)")}${xTicks}
      <text x="${W / 2}" y="${H - 4}" text-anchor="middle" font-size="12" letter-spacing="1" fill="var(--m-muted)">RECRUITING STARS</text>
      <text x="12" y="${H / 2}" text-anchor="middle" font-size="12" fill="var(--m-muted)" letter-spacing="1" transform="rotate(-90,12,${H / 2})">RATING</text></svg>`;
}

menuRouter.register("scatter", {
  title: "Talent vs Production",
  crumb: () => "PLAYERS › TALENT VS PRODUCTION",
  prompts: [{ action: "move", label: "Move" }, { action: "tabs", label: "Position" }, { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  tabs: ctx => ({ items: MENU_SCATTER_POS.map(p => ({ id: p, label: p })), active: ctx.params[0] || "ALL", go: id => menuRouter.go(`#/scatter/${id}`) }),
  async render(ctx) {
    ctx.team = menuMyTeam(await menuTeams(MENU.season));
    const pos = ctx.params[0] || "ALL";
    ctx.pts = (await fetchSeasonPlayers(MENU.season)).filter(p => p.stars > 0 && menuScatterRating(p) != null && (pos === "ALL" || matchesPosition(p.position_group, pos)));
    ctx.hs = await fetchHeadshots();
    if (ctx.pts.length < 5) return `<section class="m-panel"><p class="m-empty">Not enough players with a recruiting grade and a rating to draw this (${MENU.season}, ${pos}): it needs at least five.</p></section>`;
    const { slope, intercept } = menuTrendLine(ctx.pts);
    ctx.over = ctx.pts.map(p => ({ p, gap: menuScatterRating(p) - (slope * p.stars + intercept) })).sort((a, b) => b.gap - a.gap).slice(0, 12);
    const row = ({ p, gap }, i) => `<button class="m-row m-row--mini" type="button" data-nav data-nav-group="scatter-over" data-to="${menuPlayerPath(p.id, p.team_id)}">
        <span class="m-rank">${i + 1}</span><span class="m-pname">${menuAvatar(p.id, p.name, ctx.hs)}${_esc(p.name)} <small>${_esc(p.position_group)} · ${_esc(p.team_abbr || p.team || "")} · ${"★".repeat(p.stars)}</small></span>
        <span class="m-rating">${hasTrio(p) ? livePill(p) : ovrPill(p.overall_rating, { season: MENU.season, label: `Rating, ${MENU.season}` })}</span><span class="m-num">${deltaChip(gap, { title: "Points above the trend line for his recruiting stars" })}</span></button>`;
    return `<section class="m-panel m-scatter-panel">
        <div class="m-filterbar">
          <input class="m-input" id="m-sq" type="search" placeholder="Show only a player or a team" aria-label="Show only a player or a team" autocomplete="off" value="${_esc(_menuScatterQuery)}" data-nav data-nav-group="filters">
          <span class="m-count" id="m-scount" aria-live="polite"></span>
        </div>
        <div class="m-scatter" id="m-scatter"></div>
        <p class="m-note">Players above the dashed trend line outperform their recruiting grade: the hidden gems the model finds. The larger green dots are ${MENU_SCATTER_OVER} or more rating points above the line. Hover a dot for the name; click it for the card.${hasTrio(ctx.pts[0]) ? ` ${MENU.season} ratings are earned so far and provisional.` : ""}</p>
      </section>
      <section class="m-panel m-list" aria-label="Furthest above the trend">
        <div class="m-rowhead m-row--mini"><span>#</span><span>FURTHEST ABOVE THE TREND</span><span>RATING</span><span>ABOVE</span></div>
        ${ctx.over.map(row).join("")}
      </section>
      <p class="m-foot">The line is fitted to ${ctx.pts.length.toLocaleString()} ${pos === "ALL" ? "players" : pos + "s"} in ${MENU.season} who have both a recruiting grade and a rating. A player with no grade or no rating is left out, not plotted at zero.</p>
      <div class="m-tip" id="m-tip" hidden></div>`;
  },
  mount(stage, ctx) {
    menuWirePhoto(stage);
    const host = stage.querySelector("#m-scatter");
    if (!host) return;
    const q = stage.querySelector("#m-sq"), count = stage.querySelector("#m-scount"), tip = stage.querySelector("#m-tip");
    let shown = ctx.pts;
    const draw = () => {
      const needle = _menuScatterQuery.trim().toLowerCase();
      shown = needle ? ctx.pts.filter(p => `${p.name || ""} ${p.team || ""}`.toLowerCase().includes(needle)) : ctx.pts;
      count.textContent = `${shown.length.toLocaleString()} of ${ctx.pts.length.toLocaleString()} players`;
      host.innerHTML = shown.length ? menuScatterSvg(ctx.pts, shown, Math.max(240, Math.floor(host.clientWidth))) : '<p class="m-empty">No player or team matches.</p>';
    };
    draw();
    host.addEventListener("pointermove", e => {
      const c = e.target.closest?.("circle[data-i]");
      if (!c) { tip.hidden = true; return; }
      const p = shown[Number(c.dataset.i)];
      tip.innerHTML = `<b>${_esc(p.name)}</b><br>${_esc(p.position_group)} · ${_esc(p.team || "")} · ${p.stars}★<br>Rating ${Math.round(menuScatterRating(p))}`;
      tip.hidden = false;
      tip.style.left = `${e.clientX + 14}px`; tip.style.top = `${e.clientY - 48}px`;
    });
    host.addEventListener("pointerleave", () => { tip.hidden = true; });
    host.addEventListener("click", e => {
      const c = e.target.closest?.("circle[data-i]");
      const p = c && shown[Number(c.dataset.i)];
      if (p) menuRouter.go(menuPlayerPath(p.id, p.team_id));
    });
    let timer;
    q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { _menuScatterQuery = q.value; draw(); }, 120); });
    q.addEventListener("keydown", e => { if (e.key === "Enter") q.blur(); });
    let resizing;
    const onResize = () => { clearTimeout(resizing); resizing = setTimeout(draw, 150); };
    window.addEventListener("resize", onResize);
    ctx.cleanups.push(() => window.removeEventListener("resize", onResize));
    ctx.cleanups.push(menuInput.on("back", () => { if (document.activeElement === q) { q.blur(); return true; } return false; }));
  },
  prefer: () => ".m-row--mini",
});
