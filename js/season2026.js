// '26 Season hub — everything we know about a season that hasn't been played.
//
// Every number here is either a counted fact (schedule, roster size) or a
// projection that says so. Projections come from script 16's source chain:
// career-curve model → cohort carry-forward → recruiting grade → EA CFB 27.
//
// Load order: config.js, shell.js (top) → dataLoader.js, ui.js, dataTable.js,
// then this file. initSeason2026() is called from season2026.html.

const SEASON = CONFIG.CURRENT_SEASON;
const PRIOR  = CONFIG.LAST_PLAYED_SEASON;

async function initSeason2026() {
  const { games, firstDate } = await fetchSeasonGames(SEASON);

  buildSeasonMasthead(games, firstDate);
  buildCircleTable(games);
  buildProjectedTop25();
  buildMovers();
  buildEaComparison();
  await buildTeamPreview();

  // Rating pills are theme-computed; repaint from cache on a theme switch.
  if (!initSeason2026._themeBound) {
    initSeason2026._themeBound = true;
    onThemeChange(() => {
      fetchSeasonGames(SEASON).then(r => buildCircleTable(r.games));
      buildProjectedTop25();
      buildMovers();
      buildEaComparison();
    });
  }
}

// ── Masthead + counted facts ───────────────────────────────────────────────
function buildSeasonMasthead(games, firstDate) {
  const headlineEl = document.getElementById("s26-headline");
  const factsEl = document.getElementById("s26-facts");

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = firstDate ? Math.ceil((firstDate - today) / 86400000) : null;
  if (headlineEl) {
    headlineEl.textContent = days != null && days > 0
      ? `The ${SEASON} season starts in ${days} days.`
      : `The ${SEASON} season.`;
  }

  if (factsEl) {
    const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const lastDate = games.length ? games.reduce((m, g) => (g.date > m ? g.date : m), games[0].date) : null;
    factsEl.innerHTML = `
      <span>${games.length.toLocaleString()} FBS matchups scheduled</span>
      ${firstDate ? `<span>First kickoff ${fmt(firstDate)}</span>` : ""}
      ${lastDate ? `<span>Regular season through ${fmt(lastDate)}</span>` : ""}
      <a href="index.html">This week's storylines →</a>`;
  }
}

// ── Projected top 25 ───────────────────────────────────────────────────────
async function buildProjectedTop25() {
  const el = document.getElementById("s26-top25");
  if (!el) return;
  const teams = await fetchTeams(SEASON);
  const top = (teams || []).filter(t => t.overall_rating)
    .sort((a, b) => b.overall_rating - a.overall_rating)
    .slice(0, 25);
  if (!top.length) {
    el.innerHTML = emptyState(`No projected ${SEASON} team ratings — run scripts 16 then 10 --engine projected.`);
    return;
  }
  el.innerHTML = `<div class="rank-wall stagger-children">${top.map((t, i) => `
    <a class="rank-wall-item animate-up" href="${teamHref(t.school, SEASON)}">
      <span class="rank-num ${i < 4 ? "top3" : i < 12 ? "top10" : ""}">${i + 1}</span>
      ${t.logo_url ? `<img class="entity-logo" src="${_esc(t.logo_url)}" alt="" loading="lazy">` : ""}
      <span class="rank-wall-name">${_esc(t.school)}</span>
      ${ovrPill(t.overall_rating, { label: `Projected ${SEASON} team OVR`, season: SEASON })}
    </a>`).join("")}</div>
    <p class="table-footnote">Projected team rating is built from each roster's projected players,
      weighted by position. It is not a prediction of record — game-by-game win probabilities
      arrive with the playoff model.</p>`;
}

// ── Biggest projected movers vs last season ────────────────────────────────
async function buildMovers() {
  const el = document.getElementById("s26-movers");
  if (!el) return;
  const [history, teams] = await Promise.all([_load("team_history.json"), fetchTeamsById()]);
  if (!history) { el.innerHTML = emptyState("Team history not available."); return; }

  const moves = [];
  for (const [tid, rows] of Object.entries(history)) {
    const now  = (rows || []).find(r => r.season === SEASON && r.overall_rating != null);
    const then = (rows || []).find(r => r.season === PRIOR  && r.overall_rating != null);
    const team = teams[tid];
    if (now && then && team) {
      moves.push({ team, now: now.overall_rating, then: then.overall_rating,
                   delta: now.overall_rating - then.overall_rating });
    }
  }
  if (!moves.length) { el.innerHTML = emptyState("No comparable seasons yet."); return; }
  moves.sort((a, b) => b.delta - a.delta);

  const row = m => ({
    school: m.team.school,
    logo: m.team.logo_url,
    then: m.then,
    now: m.now,
    delta: m.delta,
  });
  const rows = [...moves.slice(0, 8), ...moves.slice(-8)].map(row);

  createDataTable(el, {
    rows,
    sort: { key: "delta", asc: false },
    footnote: `Projected ${SEASON} team rating against what the team actually earned in ${PRIOR}.
      Movement is mostly roster turnover — who left, who arrived, and who is projected to develop.`,
    columns: [
      { key: "school", label: "Team", fmt: (v, r) => `
          ${r.logo ? `<img class="entity-logo" src="${_esc(r.logo)}" alt="" loading="lazy">` : ""}
          ${teamLink(v, { season: SEASON })}` },
      { key: "then", label: `${PRIOR} actual`, num: true,
        fmt: v => ovrPill(v, { label: `Earned team OVR, ${PRIOR}` }) },
      { key: "now", label: `${SEASON} proj`, num: true,
        fmt: v => ovrPill(v, { label: `Projected team OVR, ${SEASON}`, season: SEASON }) },
      { key: "delta", label: "Change", num: true,
        fmt: v => deltaChip(v, { title: `Projected ${SEASON} vs actual ${PRIOR}` }) },
    ],
  });
}

// ── Our projection vs EA CFB 27 ────────────────────────────────────────────
// The disagreements are the interesting part. Two systems looking at the same
// player and landing 15 points apart says something real about both.
async function buildEaComparison() {
  const el = document.getElementById("s26-ea");
  if (!el) return;
  const [players, ea] = await Promise.all([fetchAllPlayers(SEASON), fetchEaRatings(SEASON)]);
  if (!players?.length || !Object.keys(ea).length) {
    el.innerHTML = emptyState("EA CFB 27 ratings not exported — run script 12.");
    return;
  }

  const rows = [];
  for (const p of players) {
    const e = ea[p.id];
    if (!e || e.ovr == null || p.overall_rating == null) continue;
    // Where EA's number IS our number there is nothing to compare.
    if (p.projection_source === "ea_cfb27") continue;
    rows.push({
      name: p.name, player_id: p.id, team: p.team,
      position_group: p.position_group,
      ours: Math.round(p.overall_rating),
      ea: Math.round(e.ovr),
      gap: Math.round(p.overall_rating) - Math.round(e.ovr),
      source: p.projection_source,
    });
  }
  if (!rows.length) { el.innerHTML = emptyState("No overlapping players to compare."); return; }

  const agree = rows.filter(r => Math.abs(r.gap) <= 3).length;
  const sorted = [...rows].sort((a, b) => b.gap - a.gap);
  const shown = [...sorted.slice(0, 10), ...sorted.slice(-10)];

  // Where the two systems disagree is patterned, not random, and saying so is
  // more useful than a mysterious table. One pattern dominates: players whose
  // last season was mostly bench time, because our rating measures production
  // and a backup rates low no matter how highly he is thought of.
  //
  // Offensive linemen used to be the other half of this and are now absent
  // entirely — from v4.3 we do not rate them, so they have nothing to compare.
  // olShare should be 0; a nonzero value would mean OL ratings came back without
  // anyone revisiting this copy, so the footnote below says so out loud.
  const olShare = Math.round(shown.filter(r => r.position_group === "OL").length / shown.length * 100);

  const table = createDataTable(el.querySelector(".ea-table-wrap") || el, {
    rows: shown,
    sort: { key: "gap", asc: false },
    footnote: `${rows.length.toLocaleString()} players carry both a projection of ours and an EA CFB 27
      overall, and the two agree within 3 points on ${Math.round(agree / rows.length * 100)}% of them.
      EA is never an input to our number here — these are independent opinions, which is what makes
      the disagreements worth reading. Positive gap = we are higher.
      <strong>The disagreements are patterned.</strong> Most of them are players who barely played
      in ${PRIOR}: our rating measures production, so a backup rates low however highly he is
      regarded. Offensive linemen used to dominate the other direction — we graded them through
      team proxies while EA grades the individual — but we no longer rate linemen at all, so they
      cannot appear here${olShare ? ` (they are ${olShare}% of this table, which should not happen)` : ""}.
      The <em>From</em> column says which of those you are looking at.`,
    columns: [
      { key: "name", label: "Player", fmt: (v, r) => playerLink(r.player_id, v, { season: SEASON }) },
      { key: "position_group", label: "Pos", fmt: v => posBadge(v) },
      { key: "team", label: "Team", fmt: v => teamLink(v, { season: SEASON }) },
      { key: "ours", label: "Ours", num: true,
        fmt: v => ovrPill(v, { label: `Our projected ${SEASON} OVR`, season: SEASON }) },
      { key: "ea", label: "EA 27", num: true,
        fmt: v => `<span class="ea-ovr">${v}</span>` },
      { key: "gap", label: "Gap", num: true,
        fmt: v => deltaChip(v, { title: "Our projection minus EA's overall" }) },
      { key: "source", label: "From", title: "How our number was built",
        fmt: v => {
          const s = EA_SOURCE_LABELS[v];
          return s ? `<span class="proj-source-code" title="${_esc(s[1])}">${s[0]}</span>`
                   : '<span class="text-muted">—</span>';
        } },
    ],
  });
  return table;
}

const EA_SOURCE_LABELS = {
  engine_d:   ["CV", "Career curve — projected from his own production history"],
  carry:      ["CF", "Carried forward — last season's rating along his cohort's development curve"],
  recruiting: ["RC", "Recruiting grade — no college production yet"],
  ea_cfb27:   ["EA", "EA CFB 27's overall"],
};

// ── Per-team preview: schedule + projected roster strength ─────────────────
async function buildTeamPreview() {
  const select = document.getElementById("s26-team-select");
  const out = document.getElementById("s26-team-preview");
  if (!select || !out) return;

  const [schedules, teams, rosters] = await Promise.all([
    _load(`schedules_${SEASON}.json`),
    fetchTeamsById(),
    _load(`rosters_${SEASON}.json`),
  ]);
  if (!schedules) { out.innerHTML = emptyState(`No ${SEASON} schedule data.`); return; }

  const withSchedules = Object.keys(schedules)
    .map(tid => teams[tid])
    .filter(Boolean)
    .sort((a, b) => a.school.localeCompare(b.school));

  select.innerHTML = `<option value="">Pick a team…</option>` +
    withSchedules.map(t => `<option value="${t.id}">${_esc(t.school)}</option>`).join("");

  select.addEventListener("change", () => {
    const tid = select.value;
    if (!tid) { out.innerHTML = ""; return; }
    const team = teams[tid];
    const games = [...(schedules[tid] || [])].sort((a, b) =>
      (a.game_date || "9999") < (b.game_date || "9999") ? -1 : 1);
    const roster = (rosters?.[tid] || []).filter(p => p.overall_rating != null)
      .sort((a, b) => b.overall_rating - a.overall_rating);

    const scheduleRows = games.map(g => `
      <tr>
        <td class="text-muted">${g.week ? `Wk ${g.week}` : "—"}</td>
        <td class="text-muted">${g.game_date ? g.game_date.slice(5, 10) : "TBD"}</td>
        <td>${g.is_home ? "vs" : "@"}
          ${g.opponent
            // FCS opponents have no team page, so they are named but not linked
            // — previously they rendered as "TBD", which read as undecided.
            ? (g.opp_is_fbs
                ? teamLink(g.opponent, { season: SEASON })
                : `<span class="opp-nonfbs" title="Not an FBS team — no rating of ours">${_esc(g.opponent)}</span>`)
            : "TBD"}${g.neutral_site ? " <small>(N)</small>" : ""}</td>
      </tr>`).join("");

    const topRoster = roster.slice(0, 10).map(p => `
      <div class="preview-player">
        ${posBadge(p.position_group)}
        ${playerLink(p.player_id, p.name, { season: SEASON })}
        ${ovrPill(p.overall_rating, { label: `Projected ${SEASON} OVR`, season: SEASON })}
      </div>`).join("");

    out.innerHTML = `
      <div class="preview-grid">
        <div>
          <div class="modal-subsection-title">${_esc(team?.school || "")} — ${SEASON} schedule</div>
          <table class="data-table"><tbody>${scheduleRows}</tbody></table>
        </div>
        <div>
          <div class="modal-subsection-title">Projected roster — top 10 of ${roster.length}</div>
          <div class="stagger-children">${topRoster || emptyState("No projected players.")}</div>
          <p class="table-footnote">
            <a href="${teamHref(team?.school, SEASON)}">Full ${SEASON} roster, ratings and history →</a>
          </p>
        </div>
      </div>`;
  });
}

// ── The games to circle — ranked on projected ratings ──────────────────────
function buildCircleTable(games) {
  const container = document.getElementById("s26-circle");
  if (!container) return;

  const rows = games
    .filter(g => g.homeOvr && g.awayOvr)
    .sort((a, b) => b.quality - a.quality)
    .slice(0, 25)
    .map((g, i) => ({
      rank: i + 1,
      week: g.week,
      dateStr: g.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      dateVal: +g.date,
      matchup: `${teamLink(g.away.school, { season: SEASON })}
        <span class="slate-at">${g.neutral ? "vs" : "at"}</span>
        ${teamLink(g.home.school, { season: SEASON })}`,
      awayOvr: g.awayOvr,
      homeOvr: g.homeOvr,
      quality: g.quality,
    }));

  createDataTable(container, {
    rows,
    sort: { key: "rank", asc: true },
    footnote: `Quality = combined projected ${SEASON} team OVR, penalized for rating mismatch —
      an even heavyweight matchup outranks a lopsided one. Win probabilities and playoff
      leverage arrive with the prediction model.`,
    empty: `No ${SEASON} schedule data — run pipeline script 01 --year ${SEASON}, then 12.`,
    columns: [
      { key: "rank", label: "#", num: true,
        fmt: v => `<span class="rank-num ${v <= 3 ? "top3" : v <= 10 ? "top10" : ""}">${v}</span>` },
      { key: "week", label: "Wk", num: true },
      { key: "dateStr", label: "Date", sortVal: (v, r) => r.dateVal },
      { key: "matchup", label: "Matchup", fmt: v => v },
      { key: "awayOvr", label: "Away", num: true,
        fmt: v => ovrPill(v, { label: `Projected ${SEASON} team OVR`, season: SEASON }) },
      { key: "homeOvr", label: "Home", num: true,
        fmt: v => ovrPill(v, { label: `Projected ${SEASON} team OVR`, season: SEASON }) },
      { key: "quality", label: "Quality", num: true, title: "Combined OVR minus twice the rating gap",
        fmt: v => v.toFixed(1) },
    ],
  });
}
