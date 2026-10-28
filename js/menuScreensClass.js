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
  crumb: () => "DYNASTY › TEAM › RECRUITING",
  prompts: [{ action: "move", label: "Move" }, { action: "season", label: "Class year" }, { action: "back", label: "Back" }],
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const team = menuMyTeam(d);
    ctx.team = team; ctx.d = d;
    const c = await fetchRecruiting(MENU.season);
    if (!c) {
      return `<section class="m-panel"><p class="m-empty">No recruiting class on file for ${MENU.season}. Classes ${CONFIG.RECRUITING_SEASONS[0]}–${CONFIG.RECRUITING_SEASONS[CONFIG.RECRUITING_SEASONS.length - 1]} are available; press Y to change the year.</p></section>`;
    }
    const row = c.teams.find(t => t.team_id === MENU.teamId);
    if (!row) return `<section class="m-panel"><p class="m-empty">${_esc(team?.school || "This team")} has no matched recruits in the ${MENU.season} class.</p></section>`;
    ctx.row = row;
    const unknown = row.commits - Object.values(row.states || {}).reduce((a, b) => a + b, 0);
    const list = row.players.map((p, i) => `
      <button class="m-row m-row--prospect" type="button" data-nav data-nav-group="class" data-state="${_esc(p.state || "")}">
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
  crumb: () => "DYNASTY › TEAM › TRANSFERS",
  prompts: [{ action: "move", label: "Move" }, { action: "tabs", label: "In / Out" }, { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  tabs: ctx => ({ items: [{ id: "in", label: "Incoming" }, { id: "out", label: "Outgoing" }],
                  active: ctx.params[0] || "in", go: id => menuRouter.go(`#/team-portal/${id}`) }),
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const team = menuMyTeam(d);
    ctx.team = team; ctx.d = d;
    if (!CONFIG.TRANSFER_SEASONS.includes(MENU.season)) {
      return `<section class="m-panel"><p class="m-empty">No transfer-portal data for ${MENU.season}. It covers ${CONFIG.TRANSFER_SEASONS[0]}–${CONFIG.TRANSFER_SEASONS[CONFIG.TRANSFER_SEASONS.length - 1]}; press Y to change season.</p></section>`;
    }
    const dir = ctx.params[0] || "in";
    const all = await fetchTeamTransfers(MENU.teamId, MENU.season);
    const rows = all.filter(t => t.direction === dir)
      .sort((a, b) => (b.ovr_current ?? b.ovr_previous ?? -1) - (a.ovr_current ?? a.ovr_previous ?? -1));
    const counts = {};
    let unknown = 0;
    for (const t of rows) { if (t.hometown_state) counts[t.hometown_state] = (counts[t.hometown_state] || 0) + 1; else unknown++; }
    const list = rows.map((t, i) => `
      <button class="m-row m-row--portal" type="button" data-nav data-nav-group="tp" data-state="${_esc(t.hometown_state || "")}">
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

// The four formats. `field` is how many teams are in, `byes` how many skip the first round and
// `champs` how many places are reserved for conference leaders (0 = none). The 4-team format is
// the original top four, the 8-team a straight top eight, the 12 the current format (the five
// highest-ranked champions plus seven at-large, the top four seeds with byes, seeded straight by
// rank), and the 24 the owner's description of the coming format, which is an ASSUMPTION here:
// the top 24 with the top eight getting byes.
const MENU_PLAYOFF_FORMATS = {
  "4":  { field: 4,  byes: 0, champs: 0, note: "The original four-team format: the top four, 1 plays 4 and 2 plays 3." },
  "8":  { field: 8,  byes: 0, champs: 0, note: "A straight top eight: 1 plays 8, 2 plays 7, 3 plays 6, 4 plays 5." },
  "12": { field: 12, byes: 4, champs: 5, note: "The current twelve-team format: the five highest-ranked conference champions plus seven at-large, seeded straight by rank, the top four seeds with a first-round bye." },
  "24": { field: 24, byes: 8, champs: 0, note: "The coming format, as described to me: the top 24 with the top eight on a bye. This is an assumption; check it against the real rules." },
};

// Picks and seeds the field for a format from the teams, best rating first. Conference leaders
// (best conference record, then overall, then rating: the same order as the Standings screen) are
// the "champions" for a format that reserves places for them. Returns the seeded teams, each with
// whether it got in as a leader.
function menuPlayoffField(d, fmt) {
  const val = t => menuTeamOvr(t, d);
  const ranked = d.teams.filter(t => val(t) != null).sort((a, b) => val(b) - val(a));
  const leaders = new Map();
  for (const conf of [...new Set(d.teams.map(t => t.conference).filter(Boolean))]) {
    const rows = Object.values(d.standings).filter(r => r.team.conference === conf && r.w + r.l > 0).sort(standingsOrder);
    if (rows.length && conf !== "FBS Independents") leaders.set(rows[0].team.id, conf);
  }
  let picked;
  if (fmt.champs) {
    const champs = ranked.filter(t => leaders.has(t.id)).slice(0, fmt.champs);
    const ids = new Set(champs.map(t => t.id));
    picked = [...champs, ...ranked.filter(t => !ids.has(t.id)).slice(0, fmt.field - champs.length)];
  } else {
    picked = ranked.slice(0, fmt.field);
  }
  return picked.sort((a, b) => val(b) - val(a)).map((t, i) => ({ team: t, seed: i + 1, leader: leaders.has(t.id) }));
}

menuRouter.register("playoff", {
  title: "Playoff Picture",
  crumb: () => "DYNASTY › PLAYOFF",
  prompts: [{ action: "move", label: "Move" }, { action: "tabs", label: "Format" }, { action: "season", label: "Season" }, { action: "back", label: "Back" }],
  tabs: ctx => ({ items: Object.keys(MENU_PLAYOFF_FORMATS).map(k => ({ id: k, label: `${k} teams` })),
                  active: ctx.params[0] || "12", go: id => menuRouter.go(`#/playoff/${id}`) }),
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    ctx.team = menuMyTeam(d); ctx.d = d;
    const key = MENU_PLAYOFF_FORMATS[ctx.params[0]] ? ctx.params[0] : "12";
    const fmt = MENU_PLAYOFF_FORMATS[key];
    const field = menuPlayoffField(d, fmt);
    if (field.length < fmt.field) return '<section class="m-panel"><p class="m-empty">Not enough rated teams for this season.</p></section>';
    const mineIn = field.find(f => f.team.id === MENU.teamId);
    const seedRow = f => `
      <button class="m-row m-row--seed${f.team.id === MENU.teamId ? " is-mine" : ""}" type="button" data-nav data-nav-group="seeds">
        <span class="m-rank">${f.seed}</span>
        <span class="m-pname">${teamMark(f.team, "m-row-mark")} ${_esc(f.team.school)}${f.seed <= fmt.byes ? ' <span class="m-tag">BYE</span>' : ""}${f.leader && fmt.champs ? ' <span class="m-tag m-tag--c">CONF LEADER</span>' : ""}</span>
        <span class="m-pmeta">${_esc(f.team.conference || "")}</span>
        <span class="m-num">${d.standings[f.team.id] ? `${d.standings[f.team.id].w}-${d.standings[f.team.id].l}` : "—"}</span>
        <span class="m-rating">${menuTeamPill(f.team, d, MENU.season)}</span>
      </button>`;
    // First-round pairings: the bye seeds wait; the rest meet best against worst of what is left.
    const play = field.filter(f => f.seed > fmt.byes);
    const pairs = [];
    for (let i = 0; i < Math.floor(play.length / 2); i++) pairs.push([play[i], play[play.length - 1 - i]]);
    const pair = ([a, b]) => `<div class="m-pair"><span><b>${a.seed}</b> ${_esc(a.team.school)}</span><i>vs</i><span><b>${b.seed}</b> ${_esc(b.team.school)}</span></div>`;
    const cut = field[field.length - 1], next = d.teams.filter(t => menuTeamOvr(t, d) != null && !field.some(f => f.team.id === t.id))
      .sort((a, b) => menuTeamOvr(b, d) - menuTeamOvr(a, d))[0];
    const label = CONFIG.LIVE_SEASONS.includes(MENU.season) ? `to date, through week ${d.live?.through_week}` : isProjectedSeason(MENU.season) ? "preseason projection" : "final ratings";
    return `<div class="m-split m-split--roster">
      <section class="m-panel m-list" aria-label="Seeds">
        <div class="m-rowhead m-row--seed"><span>SEED</span><span>TEAM</span><span>CONF</span><span>REC</span><span>RATING</span></div>
        ${field.map(seedRow).join("")}
      </section>
      <aside class="m-panel m-detail">
        <h2 class="m-detail-name">${key}-team field</h2>
        <p class="m-note">${_esc(fmt.note)}</p>
        <h3 class="m-h3">${fmt.byes ? "First round" : "Opening round"}</h3>
        ${pairs.map(pair).join("")}
        ${fmt.byes ? `<p class="m-note">Byes: ${field.slice(0, fmt.byes).map(f => _esc(f.team.school)).join(", ")}.</p>` : ""}
        <p class="m-note">${mineIn ? `<b>${_esc(mineIn.team.school)}</b> is in, seed ${mineIn.seed}.` : ctx.team ? `<b>${_esc(ctx.team.school)}</b> is out.` : ""}
          Last in: ${_esc(cut.team.school)}${next ? `; first out: ${_esc(next.school)}` : ""}.</p>
      </aside>
    </div>
    <p class="m-foot">Who would be in by our team ratings (${label}), not a prediction of any game: no playoff model has been backtested, so no win probabilities are shown.
      A format that reserves places for conference champions uses the current conference leader as the champion.</p>`;
  },
});
