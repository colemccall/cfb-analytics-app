// menuScreensTeam.js — the team screens of the menu: roster, depth chart and the
// player card.
//
// On a season being played every row carries three ratings — last season earned,
// the preseason projection, and earned to date — and every one of these screens
// shows all three through the same helpers the rest of the site uses (ui.js
// ratingTrioCells / ratingTrioStrip), so a number means the same thing everywhere.
// They are never merged: where one is missing the screen says why.
//
// Reads the roster and player files the site already ships; invents nothing. There
// is no class year, development trait or official depth data in any source, so none
// is drawn. The depth chart is the order the ratings imply, and says so.
//
// Must never contain: fetch calls or routing logic.
//
// Load order: after menuScreens.js.

// The rating a player is best summarised by right now: earned to date if he has one,
// else his projection, else last season's. Used only to ORDER a list and colour a
// row's edge — it is never shown as a single number.
function menuLeadRating(p) {
  return p.live_rating ?? p.overall_rating ?? p.rating_prev ?? null;
}

// Ways the roster can be ordered; the alt button (X / Space) cycles through them.
const MENU_ROSTER_SORTS = [
  { id: "lead",  label: "Best available", key: p => menuLeadRating(p) },
  { id: "live",  label: "To date",        key: p => p.live_rating },
  { id: "proj",  label: "Projection",     key: p => p.overall_rating },
  { id: "prev",  label: "Last season",    key: p => p.rating_prev },
  { id: "stars", label: "Recruit stars",  key: p => p.stars },
  { id: "name",  label: "Name",           key: p => p.name, text: true },
];
let _menuRosterSort = 0;

// Orders players by the chosen sort: numbers high to low with the missing ones last,
// names A to Z.
function menuSortPlayers(players, sort) {
  const rows = [...players];
  if (sort.text) return rows.sort((a, b) => String(sort.key(a) || "").localeCompare(String(sort.key(b) || "")));
  return rows.sort((a, b) => (sort.key(b) ?? -1) - (sort.key(a) ?? -1));
}

// The three rating cells for a row: [last season, projection, to date] on a season
// that carries them, else the single rating. Same pills as every other table.
function menuRatingCells(p, season) {
  if (hasTrio(p)) return ratingTrioCells(p, season).map(h => `<span class="m-rating">${h}</span>`);
  return [`<span class="m-rating">${ovrPill(p.overall_rating, { label: `Overall rating, ${season}`, season })}</span>`];
}

// Column heading labels matching menuRatingCells.
function menuRatingHeads(trio, season) {
  return trio ? [`<span>${season - 1}</span>`, "<span>PROJ</span>", "<span>LIVE</span>"] : ["<span>OVR</span>"];
}

// ── Roster ────────────────────────────────────────────────────────────────

// The position tabs: everyone, then each position group the site filters by.
function _menuPositionTabs() {
  return ["ALL", ...CONFIG.FILTER_POSITIONS].map(p => ({ id: p, label: p }));
}

menuRouter.register("roster", {
  title: ctx => (ctx.team ? ctx.team.school : "Roster"),
  crumb: () => "DYNASTY › ROSTER",
  prompts: () => [{ action: "move", label: "Move" }, { action: "select", label: "Player card" },
                  { action: "tabs", label: "Position" }, { action: "alt", label: `Sort: ${MENU_ROSTER_SORTS[_menuRosterSort].label}` },
                  { action: "back", label: "Back" }],
  tabs: ctx => ({ items: _menuPositionTabs(), active: ctx.params[0] || "ALL",
                  go: id => menuRouter.go(`#/roster/${id}`) }),
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const team = menuMyTeam(d);
    ctx.team = team; ctx.d = d;
    const pos = ctx.params[0] || "ALL";
    const all = team ? await fetchTeamRoster(team.id, MENU.season) : [];
    const list = all.filter(p => pos === "ALL" || matchesPosition(p.position_group, pos));
    const sorted = menuSortPlayers(list, MENU_ROSTER_SORTS[_menuRosterSort]);
    ctx.players = sorted;
    const trio = all.some(hasTrio);
    const heads = menuRatingHeads(trio, MENU.season).join("");
    const rows = sorted.map((p, i) => `
      <button class="m-row${trio ? " is-trio" : ""}" type="button" data-nav data-nav-group="roster" data-pid="${p.player_id}">
        <span class="m-rank">${i + 1}</span>
        <span class="m-pos">${posBadge(p.position_group)}</span>
        <span class="m-pname">${_esc(p.name || "—")}</span>
        <span class="m-pmeta">${p.stars ? "★".repeat(p.stars) : ""}</span>
        ${menuRatingCells(p, MENU.season).join("")}
      </button>`).join("");
    return `<div class="m-split m-split--roster">
      <section class="m-panel m-list" aria-label="Roster">
        <div class="m-rowhead${trio ? " is-trio" : ""}"><span>#</span><span>POS</span><span>PLAYER</span><span></span>${heads}</div>
        ${rows || '<p class="m-empty">No players at this position.</p>'}
      </section>
      <aside class="m-panel m-detail" id="m-detail" aria-live="polite"></aside>
    </div>
    <p class="m-foot">${sorted.length} player${sorted.length === 1 ? "" : "s"} · ${trio
      ? `${MENU.season - 1} is earned, PROJ is the preseason projection, LIVE is earned so far (provisional).`
      : "Ratings shown are for the season viewed."}</p>`;
  },
  mount(stage, ctx) {
    const detail = stage.querySelector("#m-detail");
    const byId = new Map(ctx.players.map(p => [String(p.player_id), p]));
    // The detail panel follows the selection: the three ratings, bio, and what the number is built from.
    stage.addEventListener("menu:select", e => {
      const p = byId.get(e.target.closest?.("[data-pid]")?.dataset.pid);
      if (!p) return;
      const ht = p.height_in ? `${Math.floor(p.height_in / 12)}'${p.height_in % 12}"` : "—";
      detail.innerHTML = `
        <h2 class="m-detail-name">${_esc(p.name)}</h2>
        <div class="m-sub">${posBadge(p.position_group)} ${p.stars ? "★".repeat(p.stars) : "unranked recruit"} · ${ht} ${p.weight_lbs ? p.weight_lbs + " lb" : ""} · ${_esc(p.hometown_state || "—")}</div>
        ${hasTrio(p) ? ratingTrioStrip(p, MENU.season) : `<div class="m-big">${ovrPill(p.overall_rating, { season: MENU.season })}</div>`}
        <div>${basisChip(p.rating_basis)}</div>
        <p class="m-note">Press <b>${menuInput.device === "pad" ? "A" : "Enter"}</b> for the full card.</p>`;
    });
    stage.querySelectorAll("[data-pid]").forEach(b => b.addEventListener("click", () =>
      menuRouter.go(`#/player/${b.dataset.pid}/${MENU.teamId}`)));
    ctx.cleanups.push(menuInput.on("alt", () => {
      _menuRosterSort = (_menuRosterSort + 1) % MENU_ROSTER_SORTS.length;
      menuRouter.render();
      return true;
    }));
  },
});

// ── Depth chart ──────────────────────────────────────────────────────────

menuRouter.register("depth", {
  title: ctx => (ctx.team ? ctx.team.school : "Depth Chart"),
  crumb: () => "DYNASTY › DEPTH CHART",
  prompts: [{ action: "move", label: "Move" }, { action: "select", label: "Player card" },
            { action: "tabs", label: "Unit" }, { action: "back", label: "Back" }],
  tabs: ctx => ({ items: Object.keys(DEPTH_SLOTS).map(u => ({ id: u, label: u })),
                  active: ctx.params[0] || "Offense", go: id => menuRouter.go(`#/depth/${encodeURIComponent(id)}`) }),
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const team = menuMyTeam(d);
    ctx.team = team; ctx.d = d;
    const unit = decodeURIComponent(ctx.params[0] || "Offense");
    const players = team ? await fetchTeamRoster(team.id, MENU.season) : [];
    const trio = players.some(hasTrio);
    const groups = (DEPTH_SLOTS[unit] || []).filter(([g]) => players.some(p => (p.position_group || p.position) === g));
    const cards = groups.map(([g, n]) => {
      const rows = players.filter(p => (p.position_group || p.position) === g).sort(_depthOrder);
      const unrated = rows.length && rows.every(p => menuLeadRating(p) == null);
      const list = rows.slice(0, n).map((p, i) => `
        <button class="m-drow${trio ? " is-trio" : ""}" type="button" data-nav data-nav-group="depth-${g}" data-pid="${p.player_id}">
          <span class="m-slot">${i + 1}</span><span class="m-pname">${_esc(p.name || "—")}</span>
          ${menuRatingCells(p, MENU.season).join("")}
        </button>`).join("");
      return `<section class="m-panel m-group"><div class="m-group-head">${posBadge(g)}<span>${rows.length} on roster${unrated ? " · not rated" : ""}</span></div>${list}</section>`;
    }).join("");
    return `<div class="m-groups">${cards || '<p class="m-empty">No players in this unit.</p>'}</div>
      <p class="m-foot"><b>Not an official depth chart.</b> No source we hold has depth data, so each group is in the order of its
      ratings (best available first). Offensive linemen are not rated, so they are ordered by recruiting grade.</p>`;
  },
  mount(stage) {
    stage.querySelectorAll("[data-pid]").forEach(b => b.addEventListener("click", () =>
      menuRouter.go(`#/player/${b.dataset.pid}/${MENU.teamId}`)));
  },
});

// ── Player card ──────────────────────────────────────────────────────────

// The few season stats worth a glance per position: [stat key, label]. Keys are the
// ones in the exported stats payload. Anything the payload lacks is left out rather
// than shown as a zero.
const MENU_STAT_FIELDS = {
  QB: [["passingYDS", "Pass yds"], ["passingTD", "Pass TD"], ["passingINT", "INT"], ["rushingYDS", "Rush yds"]],
  RB: [["rushingYDS", "Rush yds"], ["rushingTD", "Rush TD"], ["rushingCAR", "Carries"], ["receivingREC", "Catches"]],
  WR: [["receivingREC", "Catches"], ["receivingYDS", "Rec yds"], ["receivingTD", "Rec TD"]],
  TE: [["receivingREC", "Catches"], ["receivingYDS", "Rec yds"], ["receivingTD", "Rec TD"]],
  EDGE: [["defensiveTOT", "Tackles"], ["defensiveSACKS", "Sacks"], ["defensiveTFL", "TFL"]],
  DL: [["defensiveTOT", "Tackles"], ["defensiveSACKS", "Sacks"], ["defensiveTFL", "TFL"]],
  LB: [["defensiveTOT", "Tackles"], ["defensiveTFL", "TFL"], ["defensiveSACKS", "Sacks"], ["defensivePD", "PD"]],
  CB: [["defensiveTOT", "Tackles"], ["interceptionsINT", "INT"], ["defensivePD", "PD"]],
  S:  [["defensiveTOT", "Tackles"], ["interceptionsINT", "INT"], ["defensivePD", "PD"]],
  DB: [["defensiveTOT", "Tackles"], ["interceptionsINT", "INT"], ["defensivePD", "PD"]],
  K:  [["kickingFGM", "FG made"], ["kickingFGA", "FG tried"], ["kickingLONG", "Long"]],
  P:  [["puntingNO", "Punts"], ["puntingYDS", "Yards"], ["puntingYPP", "Avg"]],
};

// Why a card has no stat tiles, in words: a stated reason rather than a bare empty box.
function menuNoStatsWhy(p) {
  if (p.rating_status === "not_rated") return p.not_rated_reason || "Offensive linemen are not rated and have no box-score stats.";
  if (p.live_status === "no_games") return "No game is recorded for him this season yet.";
  if (p.live_status === "too_few_games") return `Only ${p.live_games ?? "a few"} game(s) recorded so far: not enough for a rating, and no stat line is on file.`;
  return "No stats are recorded for him in this season's data.";
}

// The career strip on a player card: one cell per season he has a rating, oldest first,
// then this season's projection and to-date number when it is a season in progress. The
// seasons come from the per-season files, so a transfer's earlier seasons at other schools
// are included.
async function menuCareerRows(pid, p) {
  const hist = (await fetchPlayerRatingHistory(pid)).filter(h => h.overall_rating != null && h.season < MENU.season)
    .sort((a, b) => a.season - b.season);
  const cells = hist.map(h => `<div class="m-career-cell"><span class="m-career-yr">${h.season}</span>${ovrPill(h.overall_rating, { season: h.season, label: `Rating, ${h.season}` })}</div>`);
  if (hasTrio(p)) {
    cells.push(`<div class="m-career-cell"><span class="m-career-yr">${MENU.season} PROJ</span>${projPill(p, MENU.season)}</div>`);
    cells.push(`<div class="m-career-cell"><span class="m-career-yr">${MENU.season} TO DATE</span>${livePill(p)}</div>`);
  } else if (p.overall_rating != null) {
    cells.push(`<div class="m-career-cell"><span class="m-career-yr">${MENU.season}</span>${ovrPill(p.overall_rating, { season: MENU.season })}</div>`);
  }
  return cells.length ? `<div class="m-career-row">${cells.join("")}</div>`
    : '<p class="m-empty">No rated seasons on file for him.</p>';
}

menuRouter.register("player", {
  title: ctx => ctx.player?.name || "Player",
  crumb: () => "DYNASTY › PLAYER",
  prompts: [{ action: "back", label: "Back" }, { action: "home", label: "Hub" }],
  async render(ctx) {
    const d = await menuTeams(MENU.season);
    const pid = parseInt(ctx.params[0]);
    // The ratings file first; a rostered player with no ratings row there (offensive line, or no
    // projection and no games) is read from the team roster so his card still opens, with the
    // fields that row has and a stated reason for the rest.
    let p = await fetchSeasonPlayer(pid, MENU.season);
    if (!p) {
      const roster = await fetchTeamRoster(parseInt(ctx.params[1]) || MENU.teamId, MENU.season);
      const r = roster.find(x => x.player_id === pid);
      const t = r && d.teams.find(x => x.id === (parseInt(ctx.params[1]) || MENU.teamId));
      if (r) p = { ...r, id: r.player_id, team_id: t?.id, team: t?.school, conference: t?.conference, stats_season: null };
    }
    ctx.d = d;
    if (!p) return '<div class="m-error">This player is not on the roster file for this season.</div>';
    ctx.player = p;
    ctx.team = d.teams.find(t => t.id === p.team_id) || null;
    const pg = p.position_group || "ATH";
    const stats = p.stats_season || {};
    const tiles = (MENU_STAT_FIELDS[pg] || []).filter(([k]) => stats[k] != null)
      .map(([k, label]) => `<div class="m-stat"><b>${_esc(String(stats[k]))}</b><span>${_esc(label)}</span></div>`).join("");
    const ht = p.height_in ? `${Math.floor(p.height_in / 12)}'${p.height_in % 12}"` : "—";
    const trio = hasTrio(p);
    const career = await menuCareerRows(pid, p);
    return `<section class="m-panel m-hero">
        <div class="m-hero-main">
          <div class="m-sub">${posBadge(pg)} ${_esc(p.team || "")} · ${_esc(p.conference || "")}</div>
          <div class="m-bio">${p.stars ? "★".repeat(p.stars) + " recruit" : "unranked recruit"} · ${ht} ${p.weight_lbs ? p.weight_lbs + " lb" : ""} · ${_esc(p.hometown_state || "—")}</div>
          <div>${basisChip(p.rating_basis)}</div>
        </div>
      </section>
      ${trio ? ratingTrioStrip(p, MENU.season) : `<section class="m-panel"><div class="m-big">${ovrPill(p.overall_rating, { season: MENU.season, source: p.projection_source })}</div></section>`}
      <div class="m-split m-split--card">
        <section class="m-panel"><h3 class="m-h3">${MENU.season} stats${trio && p.live_through_week ? ` · through week ${p.live_through_week}` : ""}</h3>
          <div class="m-stats">${tiles || `<p class="m-empty">${_esc(menuNoStatsWhy(p))}</p>`}</div></section>
        <section class="m-panel"><h3 class="m-h3">What these numbers are</h3>
          <p class="m-note">${trio
            ? `<b>${MENU.season - 1}</b> is what he earned over a full season. <b>Projection</b> is a model's guess made before a game was played${p.projection_low != null ? `, with an 80% range of ${Math.round(p.projection_low)}–${Math.round(p.projection_high)}` : ""}. <b>To date</b> is what he has earned so far, scaled to a full season; it is provisional and needs three games.`
            : "The rating is for the season viewed."}</p>
          <a class="m-link" href="players.html?player=${p.id}&season=${MENU.season}" data-nav data-nav-group="links">Full analysis on the main site →</a>
        </section>
      </div>
      <section class="m-panel m-career"><h3 class="m-h3">Career ratings</h3>${career}</section>`;
  },
  mount(stage) {
    stage.querySelectorAll("[data-nav-group=links]").forEach(a => a.addEventListener("click", e => e.stopPropagation()));
  },
});
