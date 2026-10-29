// menuScreensClass.js — the screens that are about one team's recruits and transfers, and the
// playoff picture.
//
// "Recruiting Class" and "Transfers" are the team-scoped versions of the league-wide Recruiting
// and Transfer Portal screens: reached from the team's own menu they show that team's class and
// moves, with a map of where the players come from. The map is a tile map of the states, drawn
// from the hometown STATE in the data (no city coordinates exist), so it is honest about its
// resolution: it shows how many players come from each state, not where in the state.
//
// The playoff picture is who would be in a field of 4, 8, 12 or 24 teams by OUR team ratings, and
// how they would be seeded. It does not predict any game: no playoff model has passed a backtest,
// so no win probability is shown.
//
// Must never contain: fetch calls or routing logic.
//
// Load order: after menuScreensLeague.js.

// Where each state sits on the tile map: [column, row] on an 11 by 8 grid, laid out roughly like
// the country.
const MENU_STATE_GRID = {
  AK: [0, 0], ME: [10, 0], VT: [9, 1], NH: [10, 1],
  WA: [0, 2], ID: [1, 2], MT: [2, 2], ND: [3, 2], MN: [4, 2], IL: [5, 2], WI: [6, 2], MI: [7, 2], NY: [8, 2], RI: [9, 2], MA: [10, 2],
  OR: [0, 3], NV: [1, 3], WY: [2, 3], SD: [3, 3], IA: [4, 3], IN: [5, 3], OH: [6, 3], PA: [7, 3], NJ: [8, 3], CT: [9, 3],
  CA: [0, 4], UT: [1, 4], CO: [2, 4], NE: [3, 4], MO: [4, 4], KY: [5, 4], WV: [6, 4], VA: [7, 4], MD: [8, 4], DE: [9, 4],
  AZ: [1, 5], NM: [2, 5], KS: [3, 5], AR: [4, 5], TN: [5, 5], NC: [6, 5], SC: [7, 5], DC: [8, 5],
  OK: [3, 6], LA: [4, 6], MS: [5, 6], AL: [6, 6], GA: [7, 6],
  HI: [0, 7], TX: [3, 7], FL: [7, 7],
};

// The state tile map: a count per state drawn as a heat tile, darker for more. `counts` is
// { "TX": 4, ... }; `label` names what is counted. States with nobody are drawn faint, and a
// player with no state on file is counted in the note beneath, not placed on the map.
function menuStateMap(counts, label, unknown = 0) {
  const max = Math.max(1, ...Object.values(counts));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const tiles = Object.entries(MENU_STATE_GRID).map(([st, [c, r]]) => {
    const n = counts[st] || 0;
    const heat = n ? (0.28 + 0.72 * n / max).toFixed(2) : 0;
    return `<div class="m-state${n ? " has" : ""}" data-state="${st}" style="grid-column:${c + 1};grid-row:${r + 1};--m-heat:${heat}"
      title="${n} ${_esc(label)} from ${st}"><span>${st}</span>${n ? `<b>${n}</b>` : ""}</div>`;
  }).join("");
  return `<div class="m-statemap" aria-label="${_esc(label)} by home state">${tiles}</div>
    <p class="m-foot">${total} ${_esc(label)} mapped by home state${unknown ? `; ${unknown} with no state on file are not shown` : ""}. The map shows the state, not the town.</p>`;
}

// Lights the tile for the selected player's state, so the map answers "where is he from".
function menuStateHighlight(stage, state) {
  stage.querySelectorAll(".m-state.is-hot").forEach(el => el.classList.remove("is-hot"));
  if (state) stage.querySelector(`.m-state[data-state="${state}"]`)?.classList.add("is-hot");
}

// ── A team's recruiting class ─────────────────────────────────────────────

menuRouter.register("team-recruiting", {
  title: ctx => (ctx.team ? `${ctx.team.school} Class` : "Recruiting Class"),
  crumb: () => "TEAM › RECRUITING",
  prompts: [{ action: "move", label: "Move" }, { action: "season", label: "Class year" }, { action: "back", label: "Back" }],
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const team = menuViewTeam(ctx, d);
    ctx.team = team; ctx.d = d;
    const c = await fetchRecruiting(MENU.season);
    if (!c) {
      return `<section class="m-panel"><p class="m-empty">No recruiting class on file for ${MENU.season}. Classes ${CONFIG.RECRUITING_SEASONS[0]}–${CONFIG.RECRUITING_SEASONS[CONFIG.RECRUITING_SEASONS.length - 1]} are available; press Y to change the year.</p></section>`;
    }
    const row = team && c.teams.find(t => t.team_id === team.id);
    if (!row) return `<section class="m-panel"><p class="m-empty">${_esc(team?.school || "This team")} has no matched recruits in the ${MENU.season} class.</p></section>`;
    ctx.row = row;
    const unknown = row.commits - Object.values(row.states || {}).reduce((a, b) => a + b, 0);
    const list = row.players.map((p, i) => `
      <button class="m-row m-row--prospect" type="button" data-nav data-nav-group="class" data-state="${_esc(p.state || "")}"${p.player_id ? ` data-to="${menuPlayerPath(p.player_id, team.id)}"` : ""}>
        <span class="m-rank">${p.national_rank ?? "—"}</span>
        <span class="m-pname">${_esc(p.name)}</span>
        <span class="m-pos">${p.position ? posBadge(p.position) : "—"}</span>
        <span class="m-num">${p.stars ? "★".repeat(p.stars) : "—"}</span>
        <span class="m-num">${p.composite == null ? "—" : p.composite.toFixed(4)}</span>
        <span class="m-pmeta">${_esc(p.state || "—")}</span>
        <span class="m-pmeta">#${i + 1} in class</span>
      </button>`).join("");
    return `<div class="m-split m-split--roster">
      <section class="m-panel m-list" aria-label="Class">
        <div class="m-rowhead m-row--prospect"><span>NAT</span><span>PLAYER</span><span>POS</span><span>STARS</span><span>COMP</span><span>ST</span><span>IN CLASS</span></div>
        ${list}
      </section>
      <aside class="m-panel m-detail">
        <h2 class="m-detail-name">${_esc(team.school)} · ${MENU.season} class</h2>
        <div class="m-facts"><span>${row.class_rank ? `Class rank #${row.class_rank}` : "Unranked"}</span><span>${row.commits} commits</span><span>${row.five_stars}/${row.four_stars} 5★/4★</span></div>
        ${menuStateMap(row.states || {}, "recruits", unknown)}
      </aside>
    </div>
    <p class="m-foot">${row.players.length} of ${row.commits} matched commits listed, best composite first. See the recruiting entry in Methods for what the class rank is.</p>`;
  },
  mount(stage) {
    stage.addEventListener("menu:select", e => menuStateHighlight(stage, e.target.closest?.("[data-state]")?.dataset.state));
  },
});

// ── A team's transfers ────────────────────────────────────────────────────

menuRouter.register("team-portal", {
  title: ctx => (ctx.team ? `${ctx.team.school} Transfers` : "Transfers"),
  crumb: () => "TEAM › TRANSFERS",
  prompts: [{ action: "move", label: "Move" }, { action: "tabs", label: "In / Out" }, { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  tabs: ctx => ({ items: [{ id: "in", label: "Incoming" }, { id: "out", label: "Outgoing" }],
                  active: ctx.params[0] || "in", go: id => menuRouter.go(menuTeamPath(ctx.route.teamId ?? MENU.teamId, "transfers", id)) }),
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const team = menuViewTeam(ctx, d);
    ctx.team = team; ctx.d = d;
    if (!CONFIG.TRANSFER_SEASONS.includes(MENU.season)) {
      return `<section class="m-panel"><p class="m-empty">No transfer-portal data for ${MENU.season}. It covers ${CONFIG.TRANSFER_SEASONS[0]}–${CONFIG.TRANSFER_SEASONS[CONFIG.TRANSFER_SEASONS.length - 1]}; press Y to change season.</p></section>`;
    }
    const dir = ctx.params[0] || "in";
    const all = team ? await fetchTeamTransfers(team.id, MENU.season) : [];
    const rows = all.filter(t => t.direction === dir)
      .sort((a, b) => (b.ovr_current ?? b.ovr_previous ?? -1) - (a.ovr_current ?? a.ovr_previous ?? -1));
    const counts = {};
    let unknown = 0;
    for (const t of rows) { if (t.hometown_state) counts[t.hometown_state] = (counts[t.hometown_state] || 0) + 1; else unknown++; }
    const list = rows.map((t, i) => `
      <button class="m-row m-row--portal" type="button" data-nav data-nav-group="tp" data-state="${_esc(t.hometown_state || "")}"${t.player_id ? ` data-to="${menuPlayerPath(t.player_id)}"` : ""}>
        <span class="m-rank">${i + 1}</span>
        <span class="m-pname">${_esc(t.name || "—")}</span>
        <span class="m-pos">${t.position_group ? posBadge(t.position_group) : "—"}</span>
        <span class="m-pmeta">${_esc(dir === "in" ? t.from_school || "—" : t.to_school || "—")}</span>
        <span class="m-rating">${t.ovr_previous == null ? "—" : ovrPill(t.ovr_previous, { label: "Rating before the move" })}</span>
        <span class="m-rating">${t.ovr_current == null ? "—" : ovrPill(t.ovr_current, { season: MENU.season })}</span>
        <span class="m-pmeta">${_esc(t.hometown_state || "—")}</span>
      </button>`).join("");
    return `<div class="m-split m-split--roster">
      <section class="m-panel m-list" aria-label="Transfers">
        <div class="m-rowhead m-row--portal"><span>#</span><span>PLAYER</span><span>POS</span><span>${dir === "in" ? "FROM" : "TO"}</span><span>BEFORE</span><span>NOW</span><span>HOME</span></div>
        ${list || `<p class="m-empty">No ${dir === "in" ? "incoming" : "outgoing"} transfers on file.</p>`}
      </section>
      <aside class="m-panel m-detail">
        <h2 class="m-detail-name">${_esc(team.school)} · ${dir === "in" ? "incoming" : "outgoing"}</h2>
        <div class="m-facts"><span>${rows.length} player${rows.length === 1 ? "" : "s"}</span></div>
        ${menuStateMap(counts, "transfers", unknown)}
      </aside>
    </div>
    <p class="m-foot">The map is the player's home state, not the school he left. <b>Before</b> is his rating the season before the move; <b>Now</b> is his earned rating at the new school and does not exist yet for a season in progress.</p>`;
  },
  mount(stage) {
    stage.addEventListener("menu:select", e => menuStateHighlight(stage, e.target.closest?.("[data-state]")?.dataset.state));
  },
});

// ── The playoff picture ───────────────────────────────────────────────────

// The four formats. `byes` is how many top seeds skip the first round. How the field is picked is
// in menuPlayoffField. The 4-team format is the original top four and the 8-team a straight top
// eight. The 12-team format is the current one as the owner described it: the four Power-4
// conference champions and the top Group-of-6 team get in, Notre Dame gets in if it is ranked in the
// top 12, and the best of the rest fill the field; seeded straight by rank with the top four on a
// bye. The 24-team format is the coming one as described: the top Group-of-6 team plus the 23 best
// others, with the top eight on a bye (the bye count is an assumption).
const MENU_PLAYOFF_FORMATS = {
  "4":  { field: 4,  byes: 0, note: "The original four-team format: the top four, 1 plays 4 and 2 plays 3." },
  "8":  { field: 8,  byes: 0, note: "A straight top eight: 1 plays 8, 2 plays 7, 3 plays 6, 4 plays 5." },
  "12": { field: 12, byes: 4, note: "The four Power-4 conference champions and the top Group-of-6 team, Notre Dame if it is in the top 12, then the best remaining teams. Seeded straight by rank; the top four seeds get a first-round bye." },
  "24": { field: 24, byes: 8, note: "The top Group-of-6 team and the 23 best other teams. Seeded straight by rank; the top eight seeds get a first-round bye (an assumption: check it against the real rules)." },
};
const MENU_POWER4 = ["ACC", "Big 12", "Big Ten", "SEC"];

// Picks and seeds the field for a format, best power first. Conference champions are the current
// conference leaders (the Standings screen's order). Returns [{ team, seed, why }] where `why` is
// how the team got in: "champion", "top G6", "Notre Dame" or "" for an at-large place.
function menuPlayoffField(d, key) {
  const fmt = MENU_PLAYOFF_FORMATS[key];
  const val = t => menuTeamPower(t, d);
  const ranked = d.teams.filter(t => val(t) != null).sort((a, b) => val(b) - val(a));
  const rankOf = new Map(ranked.map((t, i) => [t.id, i + 1]));
  const isG6 = t => t.conference && !MENU_POWER4.includes(t.conference) && t.conference !== "FBS Independents";
  const picked = new Map();
  const take = (t, why) => { if (t && !picked.has(t.id)) picked.set(t.id, why); };
  if (key === "12") {
    for (const conf of MENU_POWER4) {
      const rows = Object.values(d.standings).filter(r => r.team.conference === conf && r.w + r.l > 0).sort(standingsOrder);
      take(rows[0]?.team, "champion");
    }
    take(ranked.find(isG6), "top G6");
    const nd = ranked.find(t => t.school === "Notre Dame");
    if (nd && rankOf.get(nd.id) <= 12) take(nd, "Notre Dame");
    for (const t of ranked) if (picked.size < fmt.field) take(t, "");
  } else if (key === "24") {
    take(ranked.find(isG6), "top G6");
    for (const t of ranked) if (picked.size < fmt.field) take(t, "");
  } else {
    for (const t of ranked.slice(0, fmt.field)) take(t, "");
  }
  return ranked.filter(t => picked.has(t.id)).map((t, i) => ({ team: t, seed: i + 1, why: picked.get(t.id) }));
}

// The seed order of a single-elimination bracket of `size` (a power of two), top to bottom, so
// that adjacent pairs meet in round one and 1 and 2 can only meet in the final: [1,16,8,9,5,12,...].
function _bracketOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap(s => [s, n + 1 - s]);
  }
  return order;
}

// One team in a bracket box: seed, mark and name; or an empty box for a game not yet played.
function _bracketSlot(entry, label = "") {
  if (!entry) return `<div class="m-bslot is-empty" title="${_esc(label)}"><span>${_esc(label)}</span></div>`;
  const mine = entry.team.id === MENU.teamId;
  return `<button class="m-bslot${mine ? " is-mine" : ""}" type="button" data-nav data-nav-group="bracket" data-to="${menuTeamPath(entry.team.id)}"><i>${entry.seed}</i>${teamMark(entry.team, "m-bmark")}<b>${_esc(entry.team.school)}</b></button>`;
}

// Lays the field out as a bracket in the manner of the printed ones: the top half of the bracket on
// the left, the bottom half on the right, each round a column closing in on the champion in the
// middle. A seed with a bye is drawn already in the second round, opposite an empty box that stands
// for the winner of the first-round game it is waiting on. No winner is chosen: this is the field
// and its pairings, not a forecast.
function menuBracketHtml(field) {
  const n = field.length;
  let size = 1;
  while (size < n) size *= 2;
  const bySeed = new Map(field.map(f => [f.seed, f]));
  const order = _bracketOrder(size);
  // Level 0: one node per first-round pair, a game when both seeds exist, else a bye for the one that does.
  let nodes = [];
  for (let i = 0; i < order.length; i += 2) {
    const a = bySeed.get(order[i]), b = bySeed.get(order[i + 1]);
    nodes.push(a && b ? { game: [a, b] } : { team: a || b });
  }
  const levels = [nodes];
  while (nodes.length > 1) {
    const next = [];
    for (let i = 0; i < nodes.length; i += 2) next.push({ match: [nodes[i], nodes[i + 1]] });
    levels.push(next);
    nodes = next;
  }
  const slot = node => {
    if (node.team) return _bracketSlot(node.team);
    if (node.game) return _bracketSlot(null, `W ${node.game[0].seed}/${node.game[1].seed}`);
    return _bracketSlot(null, "Winner");
  };
  const gameBox = g => `<div class="m-bmatch">${_bracketSlot(g[0])}${_bracketSlot(g[1])}</div>`;
  const matchBox = m => `<div class="m-bmatch">${slot(m[0])}${slot(m[1])}</div>`;
  const total = levels[0].length;
  // Columns for one half, from the outside in: its first-round games, then each later round.
  const columns = (side) => {
    const cols = [];
    const lo = side === "L" ? 0 : total / 2, hi = side === "L" ? total / 2 : total;
    const r1 = levels[0].slice(lo, hi).filter(x => x.game).map(x => gameBox(x.game));
    if (r1.length) cols.push(r1);
    for (let L = 1; L < levels.length - 1; L++) {
      const half = levels[L].length / 2;
      const part = levels[L].slice(side === "L" ? 0 : half, side === "L" ? half : levels[L].length);
      cols.push(part.map(m => matchBox(m.match)));
    }
    return cols;
  };
  const col = (items, cls) => `<div class="m-bcol ${cls}">${items.join("")}</div>`;
  const final = levels[levels.length - 1][0].match;
  const mid = `<div class="m-bcol m-bcol--final"><div class="m-bchamp">NATIONAL<br>CHAMPION</div><div class="m-bmatch m-bmatch--final">${slot(final[0])}${slot(final[1])}</div></div>`;
  return `<div class="m-bracket" role="group" aria-label="${n}-team playoff bracket">
      ${columns("L").map(c => col(c, "m-bcol--l")).join("")}${mid}${columns("R").reverse().map(c => col(c, "m-bcol--r")).join("")}
    </div>`;
}

menuRouter.register("playoff", {
  title: "Playoff Picture",
  crumb: () => "NEWS › PLAYOFF",
  prompts: [{ action: "move", label: "Move" }, { action: "tabs", label: "Format" }, { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  tabs: ctx => ({ items: Object.keys(MENU_PLAYOFF_FORMATS).map(k => ({ id: k, label: `${k} teams` })),
                  active: ctx.params[0] || "12", go: id => menuRouter.go(`#/playoff/${id}`) }),
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    ctx.team = menuMyTeam(d); ctx.d = d;
    const key = MENU_PLAYOFF_FORMATS[ctx.params[0]] ? ctx.params[0] : "12";
    const fmt = MENU_PLAYOFF_FORMATS[key];
    const field = menuPlayoffField(d, key);
    if (field.length < fmt.field) return '<section class="m-panel"><p class="m-empty">Not enough ranked teams for this season.</p></section>';
    const mineIn = field.find(f => f.team.id === MENU.teamId);
    const next = d.teams.filter(t => menuTeamPower(t, d) != null && !field.some(f => f.team.id === t.id))
      .sort((a, b) => menuTeamPower(b, d) - menuTeamPower(a, d))[0];
    const seedRow = f => `
      <button class="m-row m-row--seed${f.team.id === MENU.teamId ? " is-mine" : ""}" type="button" data-nav data-nav-group="seeds" data-to="${menuTeamPath(f.team.id)}">
        <span class="m-rank">${f.seed}</span>
        <span class="m-pname">${teamMark(f.team, "m-row-mark")} ${_esc(f.team.school)}${f.seed <= fmt.byes ? ' <span class="m-tag">BYE</span>' : ""}${f.why ? ` <span class="m-tag m-tag--c">${_esc(f.why.toUpperCase())}</span>` : ""}</span>
        <span class="m-pmeta">${_esc(f.team.conference || "")}</span>
        <span class="m-num">${d.standings[f.team.id] ? `${d.standings[f.team.id].w}-${d.standings[f.team.id].l}` : "—"}</span>
        <span class="m-num">${menuPowerText(menuTeamPower(f.team, d))}</span>
      </button>`;
    const label = CONFIG.LIVE_SEASONS.includes(MENU.season) ? `to date, through week ${d.live?.through_week}` : isProjectedSeason(MENU.season) ? "preseason projection" : "final";
    return `<section class="m-panel m-bracketpanel" aria-label="Bracket">${menuBracketHtml(field)}</section>
      <p class="m-note m-bnote">${_esc(fmt.note)} ${mineIn ? `<b>${_esc(mineIn.team.school)}</b> is in, seed ${mineIn.seed}.` : ctx.team ? `<b>${_esc(ctx.team.school)}</b> is out.` : ""}
        ${next ? `First team out: ${_esc(next.school)}.` : ""}</p>
      <section class="m-panel m-list" aria-label="Seeds">
        <div class="m-rowhead m-row--seed"><span>SEED</span><span>TEAM</span><span>CONF</span><span>REC</span><span>POWER</span></div>
        ${field.map(seedRow).join("")}
      </section>
      <p class="m-foot">Who would be in by our power ranking (${label}), not a prediction of any game: no playoff model has been backtested, so no winners or win probabilities are shown.
        Conference champions are the current conference leaders.</p>`;
  },
});
