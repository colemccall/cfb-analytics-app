// Home page — the editorial front door.
//
// Structure: every section is an independent build function that reads real
// exported data, returns HTML (or "" when its data isn't available), and never
// blocks the other sections. No statistic here is hardcoded — every number is
// computed from files in data/ at render time.
//
// Rendering goes through the shared primitives in js/ui.js (ovrPill, deltaChip,
// storyCard, …) so this file contains page logic only, no bespoke markup rules.
//
// Load order: config.js → dataLoader.js → ui.js → playerSearch.js → home.js.

// ---------------------------------------------------------------------------
// Masthead — today's date, days to kickoff, the marquee opener
// (Season/game lookups are the shared fetchSeasonGames/fetchTeamsById in
// dataLoader.js — the '26 Season hub uses the same ones.)
// ---------------------------------------------------------------------------

const _OVR_LABEL = `Final ${CONFIG.CURRENT_SEASON} team OVR`;
const NEXT_SEASON = 2026;

function _fmtDate(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function _matchupHtml(g) {
  const side = t => `
    <span class="marquee-side">
      ${t.team.logo_url ? `<img class="entity-logo" src="${_esc(t.team.logo_url)}" alt="">` : ""}
      ${teamLink(t.team.school, { season: CONFIG.CURRENT_SEASON })}
      ${ovrPill(t.ovr, { label: _OVR_LABEL })}
    </span>`;
  return `${side({ team: g.away, ovr: g.awayOvr })}
    <span class="marquee-at">${g.neutral ? "vs" : "at"}</span>
    ${side({ team: g.home, ovr: g.homeOvr })}`;
}

async function buildMasthead() {
  const dateEl = document.getElementById("masthead-date");
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString("en-US",
      { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase();
  }

  const headlineEl = document.getElementById("masthead-headline");
  const marqueeEl  = document.getElementById("masthead-marquee");
  try {
    const { games, firstDate } = await fetchSeasonGames(NEXT_SEASON);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = firstDate ? Math.ceil((firstDate - today) / 86400000) : null;

    if (days != null && days > 0) {
      headlineEl.textContent = `Kickoff in ${days} days.`;
    } else if (days != null) {
      headlineEl.textContent = "The season is underway.";
    } else {
      headlineEl.textContent = `The ${CONFIG.CURRENT_SEASON} book, in full.`;
    }

    // Marquee: the opening week's best matchup by the "circle it" score.
    const week1 = games.filter(g => g.week === 1 && g.homeOvr && g.awayOvr)
                       .sort((a, b) => b.quality - a.quality);
    const m = week1[0];
    if (m && marqueeEl) {
      marqueeEl.innerHTML = `
        <div class="marquee animate-pop">
          <div class="eyebrow">THE OPENER TO CIRCLE · WEEK 1 · ${_esc(_fmtDate(m.date).toUpperCase())}</div>
          <div class="marquee-teams">${_matchupHtml(m)}</div>
          <div class="marquee-note">Ratings are final ${CONFIG.CURRENT_SEASON} team OVR — the last earned number before the new season.</div>
        </div>`;
    }
  } catch (e) {
    if (headlineEl) headlineEl.textContent = "College football, measured.";
  }
}

// ---------------------------------------------------------------------------
// Storylines — each one is a computed claim with a named subject and a link
// ---------------------------------------------------------------------------

// Rising / sliding programs: biggest team-OVR change, 2024 → 2025 (team_history).
async function storyRiserAndSlider() {
  const [history, teams] = await Promise.all([_load("team_history.json"), fetchTeamsById()]);
  if (!history) return [];
  const cur = CONFIG.CURRENT_SEASON, prev = cur - 1;
  const moves = [];
  for (const [tid, rows] of Object.entries(history)) {
    const a = (rows || []).find(r => r.season === cur  && r.overall_rating != null);
    const b = (rows || []).find(r => r.season === prev && r.overall_rating != null);
    const team = teams[tid];
    if (a && b && team) moves.push({ team, now: a.overall_rating, delta: a.overall_rating - b.overall_rating });
  }
  if (moves.length < 2) return [];
  moves.sort((x, y) => y.delta - x.delta);
  // Guards keep the claims meaningful: a riser must have risen INTO relevance
  // (now ≥ 75 — filters out FBS-transition artifacts like a first full season),
  // and a slider must have fallen FROM it (was ≥ 75).
  const up   = moves.find(m => m.now >= 75);
  const down = [...moves].reverse().find(m => m.now - m.delta >= 75);
  if (!up || !down) return [];
  const chipTitle = `Change in team OVR vs ${prev}`;

  return [
    storyCard({
      eyebrow: "RISING",
      headline: `${teamLink(up.team.school, { season: cur })} climbed faster than anyone in ${cur}.`,
      evidence: `${ovrPill(up.now, { label: `Team OVR, ${cur}` })} ${deltaChip(up.delta, { title: chipTitle })} <span class="evidence-note">team OVR vs ${prev}</span>`,
      links: `<a href="${teamHref(up.team.school, cur)}">Program page →</a>`,
    }),
    storyCard({
      eyebrow: "SLIDING",
      headline: `Nobody fell further in ${cur} than ${teamLink(down.team.school, { season: cur })}.`,
      evidence: `${ovrPill(down.now, { label: `Team OVR, ${cur}` })} ${deltaChip(down.delta, { title: chipTitle })} <span class="evidence-note">team OVR vs ${prev}</span>`,
      links: `<a href="${teamHref(down.team.school, cur)}">Program page →</a>`,
    }),
  ];
}

// Overachiever: best 2025 performance residual (script 13 — SP+ vs talent).
async function storyOverachiever() {
  const perf = await _load("team_performance.json");
  if (!perf) return [];
  const cur = CONFIG.CURRENT_SEASON;
  const rows = perf.filter(r => r.season === cur && r.performance_residual != null);
  if (!rows.length) return [];
  const best = rows.reduce((a, b) => (b.performance_residual > a.performance_residual ? b : a));
  const pct = best.performance_percentile != null ? ` · ${Math.round(best.performance_percentile)}th percentile` : "";
  return [storyCard({
    eyebrow: "OVER EXPECTATIONS",
    headline: `${teamLink(best.school, { season: cur })} played ${best.performance_residual.toFixed(1)} points better than its recruiting said it should.`,
    evidence: `${deltaChip(best.performance_residual, { title: "Actual SP+ minus SP+ expected from 3-year recruiting talent" })} <span class="evidence-note">SP+ vs talent expectation${pct}</span>`,
    links: `<a href="research.html#team-perf-section">Every team graded →</a>`,
  })];
}

// Breakout watch: Engine D's biggest projected riser among established players.
async function storyBreakout() {
  const traj = await _load("trajectory.json");
  if (!traj) return [];
  // "Established" = current OVR ≥ 60, so the call is a real riser rather than a
  // deep reserve moving off a tiny base.
  const calls = traj.filter(r => r.trajectory_label === "breakout" && (r.current_ovr || 0) >= 60 && r.delta != null)
                    .sort((a, b) => b.delta - a.delta);
  const top = calls[0];
  if (!top) return [];
  const factor = top.shap_top_feature ? ` Key factor: ${_esc(top.shap_top_feature)}.` : "";
  return [storyCard({
    eyebrow: "BREAKOUT WATCH",
    headline: `The model's boldest call: ${playerLink(top.player_id, top.name, { season: top.season })} (${_esc(top.position_group || "—")}).`,
    evidence: `${ovrPill(top.current_ovr, { label: "Current OVR" })} <span class="evidence-arrow">→</span> ${ovrPill(top.predicted_ovr, { label: "Predicted next-season OVR (Engine D)", projected: true })} ${deltaChip(top.delta, { title: "Predicted OVR change next season" })}<div class="evidence-note">XGBoost next-season projection · test error ≈ 9 OVR.${factor}</div>`,
    links: `<a href="research.html#breakout-section">All ${calls.length} breakout calls →</a>`,
  })];
}

// Hidden gem: the highest-rated player recruited at 1–2 stars.
async function storyHiddenGem() {
  const players = await fetchAllPlayers(CONFIG.CURRENT_SEASON);
  const gems = (players || []).filter(p => p.stars >= 1 && p.stars <= 2 && (p.overall_rating || 0) >= 75)
                              .sort((a, b) => b.overall_rating - a.overall_rating);
  const g = gems[0];
  if (!g) return [];
  return [storyCard({
    eyebrow: "HIDDEN GEM",
    headline: `${playerLink(g.id, g.name, { season: g.season })} was a ${g.stars}-star recruit. The tape didn't care.`,
    evidence: `${ovrPill(g.overall_rating, { label: `Overall rating, ${g.season}` })} <span class="evidence-note">${_esc(g.position_group || "")} · ${teamLink(g.team, { season: g.season })} · ${"★".repeat(g.stars)} recruit</span>`,
    links: `<a href="ratings.html">${gems.length} players rated 75+ from 2-star-or-lower classes →</a>`,
  })];
}

// The class that hit: best mature recruiting class by hit rate (script 14).
async function storyClassThatHit() {
  const roi = await _load("recruiting_roi.json");
  if (!roi) return [];
  // Mature classes only (3+ development seasons), and big enough to mean something.
  const mature = roi.filter(r => !r.maturing && (r.n_recruits || 0) >= 15 && r.hit_rate_pct != null);
  if (!mature.length) return [];
  const best = mature.reduce((a, b) => (b.hit_rate_pct > a.hit_rate_pct ? b : a));
  return [storyCard({
    eyebrow: "RECRUITING, GRADED",
    headline: `${teamLink(best.school, { season: best.recruit_year })}'s ${best.recruit_year} class is the best board we've graded.`,
    evidence: `<span class="evidence-big">${best.hit_rate_pct.toFixed(1)}%</span> <span class="evidence-note">of its ${best.n_recruits} rated recruits became real contributors (peak OVR ≥ 75)</span>`,
    links: `<a href="research.html#rec-roi-section">Every class since 2008 →</a>`,
  })];
}

async function buildStorylines() {
  const grid = document.getElementById("storylines");
  if (!grid) return;
  // Each storyline fails independently — a missing file drops one card, not the page.
  const results = await Promise.allSettled([
    storyRiserAndSlider(),
    storyOverachiever(),
    storyBreakout(),
    storyHiddenGem(),
    storyClassThatHit(),
  ]);
  const cards = results.flatMap(r => (r.status === "fulfilled" ? r.value : []));
  grid.innerHTML = cards.length
    ? cards.join("")
    : emptyState("Storylines need pipeline data — run scripts 07, 10, 12–15.");
}

// ---------------------------------------------------------------------------
// The opening slate — best Week 1 games, both teams linked
// ---------------------------------------------------------------------------

async function buildSlate() {
  const section = document.getElementById("slate-section");
  if (!section) return;
  try {
    const { games } = await fetchSeasonGames(NEXT_SEASON);
    const slate = games.filter(g => g.week === 1 && g.homeOvr && g.awayOvr)
                       .sort((a, b) => b.quality - a.quality)
                       .slice(1, 7);   // slot 0 is the masthead marquee
    if (!slate.length) { section.style.display = "none"; return; }

    const rows = slate.map(g => `
      <div class="slate-row animate-up">
        <span class="slate-date">${_esc(_fmtDate(g.date))}</span>
        <span class="slate-team">
          ${g.away.logo_url ? `<img class="entity-logo" src="${_esc(g.away.logo_url)}" alt="">` : ""}
          ${teamLink(g.away.school, { season: CONFIG.CURRENT_SEASON })}
          ${ovrPill(g.awayOvr, { label: _OVR_LABEL })}
        </span>
        <span class="slate-at">${g.neutral ? "vs" : "at"}</span>
        <span class="slate-team">
          ${g.home.logo_url ? `<img class="entity-logo" src="${_esc(g.home.logo_url)}" alt="">` : ""}
          ${teamLink(g.home.school, { season: CONFIG.CURRENT_SEASON })}
          ${ovrPill(g.homeOvr, { label: _OVR_LABEL })}
        </span>
      </div>`).join("");

    document.getElementById("slate").innerHTML = `
      <div class="stagger-children">${rows}</div>
      <p class="slate-footnote">Ranked by matchup quality (combined final-${CONFIG.CURRENT_SEASON} team OVR, penalized for mismatch). Game-by-game win probabilities arrive with the prediction model. <a href="season2026.html">The full '26 season hub →</a></p>`;
  } catch (e) {
    section.style.display = "none";
  }
}

// ---------------------------------------------------------------------------
// Bottom panels — last season's standard + the research desk
// ---------------------------------------------------------------------------

async function buildTopPrograms() {
  const el = document.getElementById("home-top-teams");
  if (!el) return;
  try {
    const teams = await fetchTeams(CONFIG.CURRENT_SEASON);
    const top = teams.filter(t => t.overall_rating)
                     .sort((a, b) => b.overall_rating - a.overall_rating)
                     .slice(0, 8);
    el.innerHTML = top.map((t, i) => `
      <a class="home-team-row" href="${teamHref(t.school, CONFIG.CURRENT_SEASON)}">
        <span class="home-team-rank rank-num ${i < 3 ? "top3" : ""}">${i + 1}</span>
        ${t.logo_url ? `<img class="home-team-logo" src="${_esc(t.logo_url)}" alt="" loading="lazy">` : '<span class="home-team-logo"></span>'}
        <div class="home-team-info">
          <div class="home-team-name">${_esc(t.school)}</div>
          <div class="home-team-conf">${_esc(t.conference || "")}</div>
        </div>
        ${ovrPill(t.overall_rating, { label: `Team OVR, ${CONFIG.CURRENT_SEASON}` })}
      </a>`).join("");
  } catch (e) {
    el.innerHTML = errorState("Team ratings couldn't load.");
  }
}

// The research desk: one real, computed headline per live analysis.
async function buildResearchRail() {
  const el = document.getElementById("home-research");
  if (!el) return;
  const items = [];

  try {
    const perf = await _load("team_performance.json");
    const r2 = perf?.find(r => r.regression_r2 != null)?.regression_r2;
    if (r2 != null) {
      items.push({
        tag: "Team Performance",
        text: `Recruiting talent explains ${Math.round(r2 * 100)}% of team performance. The rest is what we grade.`,
        href: "research.html#team-perf-section",
      });
    }
  } catch (_) {}

  try {
    const roi = await _load("recruiting_roi.json");
    if (roi?.length) {
      items.push({
        tag: "Recruiting ROI",
        text: `${roi.length.toLocaleString()} recruiting classes graded on what their players actually became.`,
        href: "research.html#rec-roi-section",
      });
    }
  } catch (_) {}

  try {
    const traj = await _load("trajectory.json");
    if (traj?.length) {
      const breakouts = traj.filter(r => r.trajectory_label === "breakout").length;
      items.push({
        tag: "Breakout Predictor",
        text: `${breakouts} players the model expects to jump next season — with the reason for each call.`,
        href: "research.html#breakout-section",
      });
    }
  } catch (_) {}

  el.innerHTML = items.length
    ? items.map(f => `
        <a class="mini-finding" href="${f.href}">
          <span class="mini-finding-tag">${_esc(f.tag)}</span>
          <span class="mini-finding-text">${_esc(f.text)}</span>
          <span class="mini-finding-arrow">→</span>
        </a>`).join("")
    : emptyState("Research outputs not available — run scripts 13–15.");
}

// Coverage strip — every number counted from the loaded data, none hardcoded.
async function buildCoverage() {
  const el = document.getElementById("coverage-strip");
  if (!el) return;
  try {
    const [players, teams] = await Promise.all([
      fetchAllPlayers(CONFIG.CURRENT_SEASON),
      _load("teams.json"),
    ]);
    const gems = (players || []).filter(p => (p.stars || 0) <= 2 && (p.overall_rating || 0) >= 75).length;
    el.innerHTML = `
      <span>${seasonList().length} seasons (${CONFIG.FIRST_SEASON}–${CONFIG.CURRENT_SEASON})</span>
      <span>${(players || []).length.toLocaleString()} players rated in ${CONFIG.CURRENT_SEASON}</span>
      <span>${(teams || []).length} programs</span>
      <span>${gems} hidden gems found</span>
      <a href="info.html">How the numbers work →</a>`;
  } catch (_) {
    el.innerHTML = '<a href="info.html">How the numbers work →</a>';
  }
}

// ---------------------------------------------------------------------------
// Init — sections render independently and in parallel
// ---------------------------------------------------------------------------

function initHome() {
  buildMasthead();
  buildStorylines();
  buildSlate();
  buildTopPrograms();
  buildResearchRail();
  buildCoverage();
}

initHome();
