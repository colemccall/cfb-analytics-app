// '26 Season hub — everything we actually know about the season that hasn't
// been played yet. Data: schedules_2026.json (real, harvested schedule) and
// final-2025 team ratings for matchup context. No projected numbers appear
// here until the projection engine ships — the "coming" panel says exactly
// what will arrive and how it will be labeled.
//
// Load order: config.js, shell.js (top) → dataLoader.js, ui.js, dataTable.js,
// then this file. initSeason2026() is called from season2026.html.

const SEASON = 2026;

async function initSeason2026() {
  const { games, firstDate } = await fetchSeasonGames(SEASON);

  buildSeasonMasthead(games, firstDate);
  buildCircleTable(games);
  await buildTeamScheduleLookup();
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
    // Counted from the schedule file — includes FCS games we can't rate.
    const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const lastDate = games.length ? games.reduce((m, g) => (g.date > m ? g.date : m), games[0].date) : null;
    factsEl.innerHTML = `
      <span>${games.length.toLocaleString()} FBS matchups scheduled</span>
      ${firstDate ? `<span>First kickoff ${fmt(firstDate)}</span>` : ""}
      ${lastDate ? `<span>Regular season through ${fmt(lastDate)}</span>` : ""}
      <a href="index.html">This week's storylines →</a>`;
  }
}

// ── The games to circle — full-season, ranked by matchup quality ───────────
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
      matchup: `${teamLink(g.away.school, { season: CONFIG.CURRENT_SEASON })}
        <span class="slate-at">${g.neutral ? "vs" : "at"}</span>
        ${teamLink(g.home.school, { season: CONFIG.CURRENT_SEASON })}`,
      awayOvr: g.awayOvr,
      homeOvr: g.homeOvr,
      quality: g.quality,
    }));

  createDataTable(container, {
    rows,
    sort: { key: "rank", asc: true },
    footnote: `Quality = combined final-${CONFIG.CURRENT_SEASON} team OVR, penalized for rating mismatch —
      an even heavyweight matchup outranks a lopsided one. Win probabilities and playoff
      leverage arrive with the prediction model.`,
    empty: "No 2026 schedule data — run pipeline script 01 for 2026, then 12.",
    columns: [
      { key: "rank", label: "#", num: true,
        fmt: v => `<span class="rank-num ${v <= 3 ? "top3" : v <= 10 ? "top10" : ""}">${v}</span>` },
      { key: "week", label: "Wk", num: true },
      { key: "dateStr", label: "Date", sortVal: (v, r) => r.dateVal },
      { key: "matchup", label: "Matchup", fmt: v => v },
      { key: "awayOvr", label: "Away '25", num: true,
        fmt: v => ovrPill(v, { label: `Final ${CONFIG.CURRENT_SEASON} team OVR` }) },
      { key: "homeOvr", label: "Home '25", num: true,
        fmt: v => ovrPill(v, { label: `Final ${CONFIG.CURRENT_SEASON} team OVR` }) },
      { key: "quality", label: "Quality", num: true, title: "Combined OVR minus twice the rating gap",
        fmt: v => v.toFixed(1) },
    ],
  });
}

// ── Per-team 2026 schedule lookup ──────────────────────────────────────────
async function buildTeamScheduleLookup() {
  const select = document.getElementById("s26-team-select");
  const out = document.getElementById("s26-team-schedule");
  if (!select || !out) return;

  const [schedules, teams] = await Promise.all([
    _load(`schedules_${SEASON}.json`),
    fetchTeamsById(),
  ]);
  if (!schedules) { out.innerHTML = emptyState("No 2026 schedule data."); return; }

  const withSchedules = Object.keys(schedules)
    .map(tid => teams[tid])
    .filter(Boolean)
    .sort((a, b) => a.school.localeCompare(b.school));

  select.innerHTML = `<option value="">Pick a team…</option>` +
    withSchedules.map(t => `<option value="${t.id}">${_esc(t.school)}</option>`).join("");

  select.addEventListener("change", () => {
    const tid = select.value;
    if (!tid) { out.innerHTML = ""; return; }
    const games = [...(schedules[tid] || [])].sort((a, b) =>
      (a.game_date || "9999") < (b.game_date || "9999") ? -1 : 1);
    const team = teams[tid];

    const rows = games.map(g => `
      <tr>
        <td style="color:var(--text-muted)">${g.week ? `Wk ${g.week}` : "—"}</td>
        <td style="color:var(--text-muted)">${g.game_date ? g.game_date.slice(0, 10) : "TBD"}</td>
        <td>${g.is_home ? "vs" : "@"} <strong>${g.opponent ? teamLink(g.opponent, { season: CONFIG.CURRENT_SEASON }) : "TBD"}</strong>${g.neutral_site ? " <small>(N)</small>" : ""}</td>
      </tr>`).join("");

    out.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Wk</th><th>Date</th><th>${_esc(team?.school || "")} — ${SEASON} opponents</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  });
}
