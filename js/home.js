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

// Two clocks run on this page and conflating them is how a projection gets
// narrated as a fact. PLAYED is the last season with earned ratings — every
// retrospective claim (hidden gem, class that hit, over-expectations) uses it.
// UPCOMING is the season we are heading into; its ratings are projections and
// every claim built on them says so.
const PLAYED   = CONFIG.LAST_PLAYED_SEASON;
const UPCOMING = CONFIG.CURRENT_SEASON;

const _OVR_LABEL      = `Projected ${UPCOMING} team OVR`;
const _PLAYED_LABEL   = `Final ${PLAYED} team OVR`;

function _fmtDate(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function _matchupHtml(g) {
  const side = t => `
    <span class="marquee-side">
      ${t.team.logo_url ? `<img class="entity-logo" src="${_esc(t.team.logo_url)}" alt="">` : ""}
      ${teamLink(t.team.school, { season: UPCOMING })}
      ${ovrPill(t.ovr, { label: _OVR_LABEL, season: UPCOMING })}
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
    const { games, firstDate } = await fetchSeasonGames(UPCOMING);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = firstDate ? Math.ceil((firstDate - today) / 86400000) : null;

    if (days != null && days > 0) {
      headlineEl.textContent = `Kickoff in ${days} days.`;
    } else if (days != null) {
      headlineEl.textContent = "The season is underway.";
    } else {
      headlineEl.textContent = `The ${UPCOMING} book, in full.`;
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
          <div class="marquee-note">Ratings are projected ${UPCOMING} team OVR, built from each roster's
            projected players. Nothing here has been played.</div>
        </div>`;
    }
  } catch (e) {
    if (headlineEl) headlineEl.textContent = "College football, measured.";
  }
}

// ---------------------------------------------------------------------------
// Storylines — each one is a computed claim with a named subject and a link
// ---------------------------------------------------------------------------

// Rising / sliding programs: biggest projected team-OVR change into the new
// season. Forward-looking, so both cards are explicit that the new number is a
// projection off a roster, not a result.
async function storyRiserAndSlider() {
  const [history, teams] = await Promise.all([_load("team_history.json"), fetchTeamsById()]);
  if (!history) return [];
  const moves = [];
  for (const [tid, rows] of Object.entries(history)) {
    const a = (rows || []).find(r => r.season === UPCOMING && r.overall_rating != null);
    const b = (rows || []).find(r => r.season === PLAYED   && r.overall_rating != null);
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
  const chipTitle = `Projected ${UPCOMING} team OVR vs actual ${PLAYED}`;
  const note = `projected ${UPCOMING} vs actual ${PLAYED}`;

  return [
    storyCard({
      eyebrow: "PROJECTED TO RISE",
      headline: `${teamLink(up.team.school, { season: UPCOMING })} gains more from its ${UPCOMING} roster than anyone.`,
      evidence: `${ovrPill(up.now, { label: `Team OVR, ${UPCOMING}`, season: UPCOMING })} ${deltaChip(up.delta, { title: chipTitle })} <span class="evidence-note">${note}</span>`,
      links: `<a href="${teamHref(up.team.school, UPCOMING)}">Program page →</a>`,
    }),
    storyCard({
      eyebrow: "PROJECTED TO SLIDE",
      headline: `No program loses more going into ${UPCOMING} than ${teamLink(down.team.school, { season: UPCOMING })}.`,
      evidence: `${ovrPill(down.now, { label: `Team OVR, ${UPCOMING}`, season: UPCOMING })} ${deltaChip(down.delta, { title: chipTitle })} <span class="evidence-note">${note}</span>`,
      links: `<a href="${teamHref(down.team.school, UPCOMING)}">Program page →</a>`,
    }),
  ];
}

// Overachiever: best 2025 performance residual (script 13 — SP+ vs talent).
async function storyOverachiever() {
  const perf = await _load("team_performance.json");
  if (!perf) return [];
  const cur = PLAYED;   // retrospective: SP+ only exists for played seasons
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

// Breakout watch: the biggest projected riser *relative to his cohort*.
// Not raw delta — that just surfaces whoever rated lowest last year. vs_cohort
// asks the useful question: is he projected to beat what players like him
// normally do at this stage?
async function storyBreakout() {
  const traj = await fetchTrajectory();
  if (!traj.rows.length) return [];
  // "Established" = current OVR ≥ 60, so the call is a real riser rather than a
  // deep reserve moving off a tiny base.
  const calls = traj.rows
    .filter(r => r.trajectory_label === "breakout" && (r.current_ovr || 0) >= 60 && r.vs_cohort != null)
    .sort((a, b) => b.vs_cohort - a.vs_cohort);
  const top = calls[0];
  if (!top) return [];
  const mae = traj.meta.model_mae;
  return [storyCard({
    eyebrow: "BREAKOUT WATCH",
    headline: `The model's boldest call: ${playerLink(top.player_id, top.name, { season: UPCOMING })} (${_esc(top.position_group || "—")}).`,
    evidence: `${ovrPill(top.current_ovr, { label: `Earned OVR, ${PLAYED}` })}
      <span class="evidence-arrow">→</span>
      ${ovrPill(top.predicted_ovr, { label: `Projected ${UPCOMING} OVR`, season: UPCOMING })}
      ${projRange(top.proj_low, top.proj_high)}
      ${deltaChip(top.vs_cohort, { title: "Projected OVR vs what his cohort typically does" })}
      <div class="evidence-note">${_esc(String(top.vs_cohort > 0 ? "+" : ""))}${top.vs_cohort} against the ${_esc(top.position_group || "")}s
        who were where he is now${mae ? ` · typical error ±${mae} OVR` : ""}.</div>`,
    links: `<a href="research.html#breakout-section">All ${calls.length} breakout calls →</a>`,
  })];
}

// Hidden gem: the highest-rated player recruited at 1–2 stars.
async function storyHiddenGem() {
  // Retrospective by nature: "the tape didn't care" is a claim about what he
  // actually did, so it reads the last played season, never the projection.
  const players = await fetchAllPlayers(PLAYED);
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
    const { games } = await fetchSeasonGames(UPCOMING);
    const slate = games.filter(g => g.week === 1 && g.homeOvr && g.awayOvr)
                       .sort((a, b) => b.quality - a.quality)
                       .slice(1, 7);   // slot 0 is the masthead marquee
    if (!slate.length) { section.style.display = "none"; return; }

    const rows = slate.map(g => `
      <div class="slate-row animate-up">
        <span class="slate-date">${_esc(_fmtDate(g.date))}</span>
        <span class="slate-team">
          ${g.away.logo_url ? `<img class="entity-logo" src="${_esc(g.away.logo_url)}" alt="">` : ""}
          ${teamLink(g.away.school, { season: UPCOMING })}
          ${ovrPill(g.awayOvr, { label: _OVR_LABEL, season: UPCOMING })}
        </span>
        <span class="slate-at">${g.neutral ? "vs" : "at"}</span>
        <span class="slate-team">
          ${g.home.logo_url ? `<img class="entity-logo" src="${_esc(g.home.logo_url)}" alt="">` : ""}
          ${teamLink(g.home.school, { season: UPCOMING })}
          ${ovrPill(g.homeOvr, { label: _OVR_LABEL, season: UPCOMING })}
        </span>
      </div>`).join("");

    document.getElementById("slate").innerHTML = `
      <div class="stagger-children">${rows}</div>
      <p class="slate-footnote">Ranked by matchup quality (combined projected ${UPCOMING} team OVR, penalized for mismatch). Game-by-game win probabilities arrive with the prediction model. <a href="season2026.html">The full '26 season hub →</a></p>`;
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
    const teams = await fetchTeams(UPCOMING);
    const top = teams.filter(t => t.overall_rating)
                     .sort((a, b) => b.overall_rating - a.overall_rating)
                     .slice(0, 8);
    el.innerHTML = top.map((t, i) => `
      <a class="home-team-row" href="${teamHref(t.school, UPCOMING)}">
        <span class="home-team-rank rank-num ${i < 3 ? "top3" : ""}">${i + 1}</span>
        ${t.logo_url ? `<img class="home-team-logo" src="${_esc(t.logo_url)}" alt="" loading="lazy">` : '<span class="home-team-logo"></span>'}
        <div class="home-team-info">
          <div class="home-team-name">${_esc(t.school)}</div>
          <div class="home-team-conf">${_esc(t.conference || "")}</div>
        </div>
        ${ovrPill(t.overall_rating, { label: `Team OVR, ${UPCOMING}`, season: UPCOMING })}
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
    const traj = await fetchTrajectory();
    if (traj.rows.length) {
      const breakouts = traj.rows.filter(r => r.trajectory_label === "breakout").length;
      const m = traj.meta;
      const accuracy = m.naive_mae && m.model_mae
        ? ` Beats a naive carry-forward by ${(m.naive_mae - m.model_mae).toFixed(1)} OVR.`
        : "";
      items.push({
        tag: "Breakout Predictor",
        text: `${breakouts} players projected to beat their cohort — each with the reason in plain English.${accuracy}`,
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
    const [players, projected, teams] = await Promise.all([
      fetchAllPlayers(PLAYED),
      fetchAllPlayers(UPCOMING),
      _load("teams.json"),
    ]);
    const gems = (players || []).filter(p => (p.stars || 0) <= 2 && (p.overall_rating || 0) >= 75).length;
    el.innerHTML = `
      <span>${seasonList().length} seasons (${CONFIG.FIRST_SEASON}–${CONFIG.CURRENT_SEASON})</span>
      <span>${(players || []).length.toLocaleString()} players rated in ${PLAYED}</span>
      <span>${(projected || []).length.toLocaleString()} projected for ${UPCOMING}</span>
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

// Rating pills and delta chips are theme-computed — repaint on theme switch.
// All data comes from dataLoader's in-memory cache, so this is a re-render.
onThemeChange(initHome);
