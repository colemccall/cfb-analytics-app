// ui.js — shared render helpers for the design-system primitives.
//
// Every helper returns an HTML string built on the primitive classes in
// components.css ("DESIGN-SYSTEM PRIMITIVES" section). Pages call these instead
// of hand-writing pill/chip/table markup, so the visual rules live in exactly
// one place:
//   · no naked numbers      — big stats ship with context (statBig)
//   · movement has a number — deltaChip always renders arrow + signed value
//   · provenance is visible — projected values go through projBadge/ovrPill
//   · escape by default     — all data strings pass through _esc (config.js)
//
// Load order: config.js → dataLoader.js → ui.js → page script.

// ── Live theme switching ────────────────────────────────────────────────────
// Data colors (tier pills, position chips, chart marks) are computed in JS from
// the active theme, so they must be re-rendered when the theme changes.
// shell.js dispatches "cfb:themechange" on swatch click; pages register the
// render function that redraws from already-cached state (never a refetch —
// dataLoader._load serves from its in-memory cache).
function onThemeChange(render) {
  window.addEventListener("cfb:themechange", () => {
    try { render(); } catch (e) { /* a failed repaint must not break the page */ }
  });
}

// ── Rating pill ─────────────────────────────────────────────────────────────
// The single way an OVR appears.
//
// Provenance is derived from the season, not asked of the caller: pass `season`
// and a projected one always renders the hatch and a tooltip naming the source.
// With 2026 as the app's default season, "the caller remembered to pass
// projected: true" is not a strong enough guarantee — one missed call site
// presents model output as an earned rating.
//
// The PROJ badge on top of that is reserved for MIXED contexts. On a wholly
// projected season all 12,000 numbers are projections, and a badge on each is
// noise rather than provenance; the page says it once via
// projectedSeasonNotice(). Pass `projected: true` where a projected number sits
// beside an earned one — an evidence line comparing last season to next, or a
// table spanning played and unplayed seasons — and where a value is projected
// with no season in scope.
function ovrPill(rating, { label = "", projected = false, season = null, source = "",
                          pos = "", why = "" } = {}) {
  // A withheld rating is not a missing one, and the two must not look alike. A
  // blank reads as a bug or a data gap; "not rated" with the reason attached
  // reads as the judgement it is. Derived from the position rather than asked of
  // the caller, for the same reason provenance is derived from the season — one
  // forgotten argument would silently present a refusal as an absence.
  if (rating == null && NOT_RATED_POSITIONS[pos]) return notRatedNote(pos);
  // `why` is the reason there is no number, in the tooltip, so a blank is never unexplained.
  if (rating == null) return `<span class="text-muted"${why ? ` title="${_esc(why)}"` : ""}>—</span>`;
  const fromSeason = season != null && isProjectedSeason(season);
  const isProj = projected || fromSeason;
  const v = Math.round(rating);
  const c = ratingColor(v);
  const cls = isProj ? "ovr-badge is-projected" : "ovr-badge";
  const title = isProj
    ? `${label || "Projected rating"}${source ? ` — ${PROJECTION_SOURCE_LABELS[source] || source}` : ""}`
    : label;
  const pill = `<span class="${cls}" style="background:${c};color:${ratingTextColor(c)}"
    title="${_esc(title)}">${v}</span>`;
  // On a wholly projected season every rating is a projection, so a badge on
  // each one is noise — projectedSeasonNotice() states it once at the top of the
  // page and the hatch plus tooltip keep provenance on the number itself. The
  // badge is still rendered for an explicit `projected: true`, which is how a
  // mixed context (a history chart spanning played and unplayed seasons) marks
  // the odd row out.
  return isProj && !fromSeason ? `${pill} ${projBadge()}` : pill;
}

// How each projected number was arrived at — shown in tooltips and the modal.
const PROJECTION_SOURCE_LABELS = {
  engine_d:    "projected from his career production curve",
  carry:       "last season's rating, moved along his cohort's development curve",
  recruiting:  "recruiting grade (no college production yet)",
};

// Positions we deliberately do not project, and why. An unexplained blank reads
// as a bug; a stated refusal reads as a judgement.
const UNPROJECTED_POSITIONS = {
  OL: "No individual blocking data exists in any public source, so an OL rating is " +
      "mostly a recruiting ranking. We don't project what we can't measure.",
};

function unprojectedNote(pg) {
  const why = UNPROJECTED_POSITIONS[pg];
  return why ? `<span class="unprojected" title="${_esc(why)}">not projected</span>` : "";
}

// Positions with no EARNED rating either — a stronger statement than "not
// projected", and new in rating v4.3. The offensive line used to carry a number
// that was recruiting rank plus a constant: it correlated 0.877 with the
// recruiting composite, 20% of rated linemen landed on exactly 80.0, and it
// disagreed with external scouting (Spearman −0.274 against EA CFB 27). It is
// withdrawn. The line is now rated as a unit on the team page, from metrics that
// exist.
const NOT_RATED_POSITIONS = {
  OL: "No individual offensive-line production exists in any available source — no " +
      "pancakes, no sacks allowed, no pressures allowed. The number that used to be " +
      "here was a recruiting ranking in costume. The line is rated as a unit on the " +
      "team page instead.",
};

// The "not rated" marker for a position we deliberately do not rate, with
// the reason on hover (NOT_RATED_POSITIONS). Any other position gets a plain
// dash — a refusal and a gap must not look alike.
function notRatedNote(pg) {
  const why = NOT_RATED_POSITIONS[pg];
  return why
    ? `<span class="unprojected" title="${_esc(why)}">not rated</span>`
    : '<span class="text-muted">—</span>';
}

// The line-unit rating, rendered like an OVR pill but labelled as a team number.
// It must never be mistaken for a player's rating — that confusion is the exact
// thing withdrawing the OL number was meant to end.
function lineUnitPill(rating) {
  if (rating == null) return '<span class="text-muted">—</span>';
  const v = Math.round(rating);
  const c = ratingColor(v);
  return `<span class="ovr-badge" style="background:${c};color:${ratingTextColor(c)}"
    title="Offensive line, rated as a unit: line yards, stuff rate, power success, second-level yards and sack rate allowed. Not a per-player rating.">${v}</span>`;
}

// Confidence is a property of the position family as much as the player: an
// offensive skill player has counting stats and a depth chart behind his
// number; a linebacker has neither.
function confidenceChip(level) {
  if (!level) return "";
  const label = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" }[level] || level;
  const why = {
    high: "Offensive skill: real per-player production and a knowable depth chart behind this number.",
    medium: "Carried forward along a development curve rather than modelled from a full career.",
    low: "Defensive and special-teams ratings rest on less complete production data. Treat as indicative.",
  }[level] || "";
  return `<span class="conf-chip conf-${_esc(level)}" title="${_esc(why)}">${_esc(label)}</span>`;
}

// ── What a rating is built from ─────────────────────────────────────────────
// Two thirds of any roster has no production to measure, and for those players
// the rating IS `position average + recruiting stars delta` — a six-valued step
// function. It has always been published as the same kind of object as a
// starter's production rating, and nothing on the page said otherwise.
//
// Derived in the pipeline from the playing-time tier that already existed, so
// this adds a name for something rather than a new computation. Same idiom as
// confidenceChip: small, uppercase, bordered, explains itself on hover.
//
// `production` is deliberately NOT chipped. It is the default a reader assumes,
// and a chip on all 12,000 of them is noise — the same rule projBadge follows.
const RATING_BASIS_LABEL = {
  blended:     "Part recruiting",
  recruiting:  "Recruiting only",
  withheld:    "Not rated",
};

const RATING_BASIS_WHY = {
  blended:     "He played, but below this position's starter threshold, so the rating mixes " +
               "his production with his recruiting grade rather than trusting a small sample.",
  recruiting:  "No meaningful production to measure. This number is the position average " +
               "shifted by his recruiting stars — it says what was expected of him, not what he did.",
  withheld:    "No individual production exists for this position in any available source, " +
               "so no rating is published.",
};

// ── Class year ──────────────────────────────────────────────────────────────
// The single place a class year becomes a label.
//
// It is DERIVED (utils/class_year.py), not `player_seasons.year` — that field is
// constant across the whole career for 84.0% of multi-season players and says
// "year 4" for 65% of the rated rows carrying a plausible value, so the site was
// calling true freshmen seniors. It is also allowed to be unknown: 1.7% of rated
// player-seasons are left-censored at the start of the archive with no
// recruiting anchor, and an unknown class year renders as unknown rather than
// being defaulted to FR.
const CLASS_YEAR_LABEL = { 1: "FR", 2: "SO", 3: "JR", 4: "SR", 5: "GR", 6: "GR+" };

function classYearLabel(cy) {
  return CLASS_YEAR_LABEL[cy] || "—";
}

// The tooltip that says where the number came from, so a floor is not read as a
// fact. `recruiting` is a real enrolment date; `first_fbs` is the first season we
// observe him and is too YOUNG 23.9% of the time it is checkable.
const CLASS_YEAR_BASIS_WHY = {
  recruiting: "Class year from his recruiting-class enrolment year.",
  first_fbs:  "Class year estimated from his first FBS season — a floor. " +
              "A career that began in junior college or at an FCS school looks younger than it was.",
  unknown:    "Class year unknown: his career starts at the edge of the archive " +
              "and he has no recruiting-class year to date him by.",
};

// A class-year label with its provenance on hover. Years estimated from the
// first FBS season (a floor) or undeterminable are dimmed so they are not
// read as facts; recruiting-anchored years render at full strength.
function classYearCell(cy, basis) {
  const label = classYearLabel(cy);
  const why = CLASS_YEAR_BASIS_WHY[basis];
  if (!why) return label;
  const dim = basis === "recruiting" ? "" : ' style="opacity:0.75"';
  return `<span${dim} title="${_esc(why)}">${label}</span>`;
}

function basisChip(basis) {
  const label = RATING_BASIS_LABEL[basis];
  if (!label) return "";           // production, or absent → no chip
  return `<span class="basis-chip basis-${_esc(basis)}" title="${_esc(RATING_BASIS_WHY[basis] || "")}">${_esc(label)}</span>`;
}

// A projected value with its range. The interval is the honest part: the point
// estimate alone implies a precision the model does not have.
function projRange(low, high) {
  if (low == null || high == null) return "";
  return `<span class="proj-range" title="80% of outcomes land in this range">${Math.round(low)}–${Math.round(high)}</span>`;
}

// Page-level banner for a projected season. Stated once, at the top, so no
// individual number has to carry the whole explanation.
function projectedSeasonNotice(season) {
  if (!isProjectedSeason(season)) return "";
  return `<div class="projected-notice">
      <span class="badge-proj">PROJ</span>
      <span>Every rating shown for ${_esc(season)} is a preseason projection — it does not include any game played this season.
      Ratings earned so far are on the <a href="season2026.html">'26 Season</a> page.
      <a href="info.html#projections">How projections are built →</a></span>
    </div>`;
}

// Keeps the page-level banner in step with a season picker. Pages call this on
// load and whenever their season changes, so switching from 2026 back to 2025
// removes the notice instead of leaving a stale one behind.
function renderSeasonProvenance(season, id = "season-provenance") {
  const el = document.getElementById(id);
  if (el) el.innerHTML = projectedSeasonNotice(season);
}

// ── Registry prose ──────────────────────────────────────────────────────────
// The long-form fields in the METHODS and CHANGES registries (`why`, `limits`,
// `summary`, `motivation`) are paragraphs, not labels, and are unreadable as one
// undifferentiated block. This is the whole markdown vocabulary they get:
// **bold**, `code`, and a blank line for a paragraph break — applied to text that
// has already been escaped, so a registry entry can never inject markup.
//
// Lives here rather than in methodsPage.js because two registries render prose
// and two copies would drift. Escaping itself is `_esc` from config.js.
//
// A **bold** span may wrap onto the next source line — registry prose is
// hard-wrapped, and until 2026-09-23 a wrapped span rendered as literal
// asterisks (three live Build Log entries did). It may not cross a blank line,
// which would put the tags in different paragraphs. tools/prose-check.mjs runs
// every registry field through this and fails on any leftover markup.
function prose(s) {
  return _esc(s)
    .replace(/\*\*((?:(?!\n\s*\n)[^*])+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g, " ")}</p>`).join("");
}

// The status chip shared by the METHODS `alternatives` array and the CHANGES
// `tried` array. One chip system, per the build-log spec — a second one would be
// a design change wearing a content change's clothes.
const STATUS_CHIP_LABEL = {
  recommended: "Recommended",
  experiment:  "Worth an experiment",
  rejected:    "Rejected",
  blocked:     "Blocked on data",
  shipped:     "Shipped",
  withdrawn:   "Withdrawn",
};

function statusChip(status) {
  const label = STATUS_CHIP_LABEL[status] || status;
  return `<span class="method-chip method-chip-${_esc(status)}">${_esc(label)}</span>`;
}

// ── Position badge ──────────────────────────────────────────────────────────
// Text color comes from the luminance guard, not a fixed value: light-theme
// position colors are deep (readable with white), dark-theme ones are bright
// (readable with near-black).
function posBadge(pg) {
  const g = pg || "ATH";
  const c = posColor(g);
  return `<span class="pos-group-badge" style="background:${c};color:${ratingTextColor(c)}">${_esc(g)}</span>`;
}

// ── Delta chip — movement always ships with its number ──────────────────────
function deltaChip(delta, { title = "" } = {}) {
  if (delta == null) return '<span class="delta-chip" title="Not measured">—</span>';
  const d = Number(delta);
  const cls = d > 0 ? "up" : d < 0 ? "down" : "";
  const arrow = d > 0 ? "▲" : d < 0 ? "▼" : "→";
  const sign = d > 0 ? "+" : "";
  return `<span class="delta-chip ${cls}" title="${_esc(title)}">${arrow} ${sign}${d.toFixed(1)}</span>`;
}

// ── Provenance badge ────────────────────────────────────────────────────────
function projBadge(text = "PROJ") {
  return `<span class="badge-proj" title="Model projection — not an earned rating">${_esc(text)}</span>`;
}

// ── Context strip — a value placed on its distribution ──────────────────────
// pct: 0–100 position of the marker. label: what that position means, in words
// ("top 4% of CBs since 2008"). This is the primitive that keeps numbers from
// being naked.
function contextStrip(pct, label, { color = "var(--accent)" } = {}) {
  if (pct == null) return "";
  const p = Math.max(0, Math.min(100, pct));
  return `
    <span class="context-strip">
      <span class="context-strip-track">
        <span class="context-strip-marker" style="left:calc(${p.toFixed(0)}% - 1px);background:${color}"></span>
      </span>
      <span class="context-strip-label">${_esc(label || "")}</span>
    </span>`;
}

// ── Comparison pair: prev → new (transfers, projections, week-over-week) ────
function comparePair(prevHtml, nextHtml, { title = "" } = {}) {
  return `<span class="compare-pair" title="${_esc(title)}">${prevHtml}
    <span class="compare-pair-arrow">→</span>${nextHtml}</span>`;
}

// ── Big stat with mandatory context (the only sanctioned large numeral) ─────
function statBig(value, context, { color = "var(--text)" } = {}) {
  return `
    <div>
      <div class="stat-big" style="color:${color}">${_esc(String(value))}</div>
      <div class="stat-context">${_esc(context)}</div>
    </div>`;
}

// ── Storyline card: claim headline → evidence → destination ─────────────────
// headline/evidence/links accept pre-built HTML (entity links, pills, chips);
// eyebrow is plain text.
function storyCard({ eyebrow, headline, evidence, links }) {
  return `
    <article class="story-card animate-up">
      <div class="eyebrow">${_esc(eyebrow)}</div>
      <h3 class="story-headline">${headline}</h3>
      <div class="story-evidence">${evidence}</div>
      <div class="story-links">${links}</div>
    </article>`;
}

// ── Sparkline — inline SVG mini-trend (values in chronological order) ───────
function sparkline(values, { w = 90, h = 24, stroke = "var(--accent)" } = {}) {
  const vals = (values || []).filter(v => v != null);
  if (vals.length < 2) return "";
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) =>
    `${(i / (vals.length - 1) * (w - 2) + 1).toFixed(1)},${((1 - (v - min) / span) * (h - 4) + 2).toFixed(1)}`
  ).join(" ");
  return `<svg width="${w}" height="${h}" aria-hidden="true" style="vertical-align:middle">
    <polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="1.5"/>
  </svg>`;
}

// ── States: loading / empty / error ─────────────────────────────────────────
// Skeletons are shaped like the content they replace. Spinners never.
function skeletonRows(n = 5) {
  return Array.from({ length: n }, () => '<div class="skeleton skeleton-row"></div>').join("");
}

function skeletonCards(n = 3) {
  return Array.from({ length: n }, () => '<div class="skeleton skeleton-card"></div>').join("");
}

// Empty says what would be here and why it isn't.
function emptyState(message) {
  return `<p class="empty-state">${_esc(message)}</p>`;
}

// Error is small, inline, and honest. Pass retryHtml (e.g. a link) if there is
// a meaningful retry action.
function errorState(message, retryHtml = "") {
  return `<div class="error-state">${_esc(message)}${retryHtml ? " " + retryHtml : ""}</div>`;
}

// ── School marks ─────────────────────────────────────────────────────────────
// A school's logo, or a monogram when the logo is absent or fails to load.
//
// Why this exists: all 139 logo URLs in teams.json are plain http:// ESPN links
// (mixed content on an https site) and nothing handled a failed load — a call
// site either hid the image or left a broken-image icon. School marks are also
// trademarks, so the app must look complete with every logo switched off; the
// monogram (abbreviation on the team colour, text colour from the luminance
// guard) is the default, and the logo is the optional upgrade.
//
// `cls` is the call site's own sizing class (entity-logo, team-tile-logo, …) so
// the monogram occupies the same box the image would have.

// Upgrades an http:// logo URL to https://. ESPN's CDN serves both.
function _https(url) {
  return String(url || "").replace(/^http:\/\//i, "https://");
}

// Fallback label when a team has no abbreviation: up to three word initials,
// or the first three letters of a one-word name.
function _initials(school) {
  const words = String(school || "").split(/[\s\-&]+/).filter(w => w && !/^(of|the|at)$/i.test(w));
  if (words.length <= 1) return (words[0] || "?").slice(0, 3).toUpperCase();
  return words.slice(0, 3).map(w => w.replace(/[^A-Za-z0-9]/g, "")[0] || "").join("").toUpperCase();
}

// The monogram itself. Team colour is data, so it is set inline; the text colour
// comes from ratingTextColor() (config.js), never a fixed value. Without a
// colour the CSS defaults (surface + text tokens) apply.
function _monogramHtml(team, cls) {
  const label = team.abbreviation || _initials(team.school);
  const bg = team.color && String(team.color).startsWith("#") ? team.color : "";
  const style = bg ? ` style="background:${_esc(bg)};color:${ratingTextColor(bg)};border-color:${_esc(bg)}"` : "";
  return `<span class="team-mark ${_esc(cls)}"${style} role="img" aria-label="${_esc(team.school || "")}">${_esc(label)}</span>`;
}

// Returns the mark for a team object ({ school, abbreviation, color, logo_url }).
// The <img> carries what the monogram needs so the capture-phase error handler
// below can swap it in place after a failed load.
function teamMark(team, cls = "entity-logo") {
  const t = team || {};
  if (!t.logo_url) return _monogramHtml(t, cls);
  return `<img class="${_esc(cls)}" src="${_esc(_https(t.logo_url))}" alt="" loading="lazy"
    data-mark-school="${_esc(t.school || "")}" data-mark-abbr="${_esc(t.abbreviation || "")}"
    data-mark-color="${_esc(t.color || "")}">`;
}

// A failed logo is replaced by its monogram. `error` does not bubble, so this
// listens in the capture phase on document — one handler for every page.
document.addEventListener("error", e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || img.dataset.markSchool === undefined) return;
  const holder = document.createElement("span");
  holder.innerHTML = _monogramHtml(
    { school: img.dataset.markSchool, abbreviation: img.dataset.markAbbr, color: img.dataset.markColor },
    img.className);
  img.replaceWith(holder.firstElementChild);
}, true);

// ── Keyboard access for click-only elements ──────────────────────────────────
// Player rows, roster rows and similar-player rows are <div>s with click
// handlers, which a keyboard user cannot reach or operate: on the Players board
// no player could be opened without a mouse. This makes each element a focusable
// button that Enter and Space activate. Only a key pressed ON the element counts
// — Enter on a link inside the row (the team cell) must still follow the link.
function makeActivatable(els) {
  els.forEach(el => {
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.addEventListener("keydown", e => {
      if (e.target !== el || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      el.click();
    });
  });
}

// ── Projection interval cell ────────────────────────────────────────────────
// On a projected season the "Proj" column (projected change) has nothing to say:
// the OVR already IS the projection. That slot carries the model's own interval
// instead — the range its calibration says the rating lands in about four times
// out of five (measured 78.7% offence, 79.4% defence on held-out seasons).
// Shared by the Players board and the team roster so the two read identically.
// Rows with no interval (a position we decline to project) show a dash.
function projectionRangeCell(p) {
  if (p.projection_low == null || p.projection_high == null) return '<span class="text-muted">—</span>';
  return `<span title="The model's 80% interval around this projection">${Math.round(p.projection_low)}–${Math.round(p.projection_high)}</span>`;
}

// ── The three ratings of a season being played ──────────────────────────────
// A player in a season that is under way has three numbers, and they answer three
// different questions: what he EARNED last season (a full season, final), what the
// model PROJECTED before a game was played, and what he has earned SO FAR this
// season (part of a season, rescaled to full-season pace, provisional). They are
// never averaged, merged or substituted for one another — a missing one is shown as
// missing, with the reason, rather than quietly filled from another.
//
// The fields come from script 12, which writes them only for a season that has an
// earned-to-date file (script 17): rating_prev(+_basis, _status), overall_rating
// (the projection, unchanged), live_rating(+_basis, _games, _status,
// _through_week). A season without them renders exactly as it always did.

const PREV_STATUS_TEXT = {
  not_rated: "not rated — offensive line",
  unrated:   "no rating last season",
  no_season: "not on an FBS roster last season",
};

// True for a roster or player row that carries the three-ratings fields.
function hasTrio(p) {
  return !!p && p.live_status !== undefined;
}

// Why a live rating is absent, in a phrase a reader can act on.
function _liveWhy(p) {
  if (p.live_status === "too_few_games") {
    const g = p.live_games;
    return `${g} game${g === 1 ? "" : "s"} so far — needs 3 for a rating`;
  }
  if (p.live_status === "no_games") return "no game on record yet this season";
  if (p.live_status === "not_rated") return "not rated — offensive line";
  return "not rated yet";
}

// The earned rating from the season before. Plain (an earned number has no hatch);
// a dash with the reason in the tooltip when there is none.
function prevPill(p, season) {
  const y = (season ?? CONFIG.CURRENT_SEASON) - 1;
  if (p.rating_prev != null) {
    return ovrPill(p.rating_prev, { label: `Earned ${y} rating — a full season` });
  }
  return `<span class="trio-na" title="${_esc(PREV_STATUS_TEXT[p.rating_prev_status] || "no rating")}">—</span>`;
}

// The preseason projection. Hatched by ovrPill (provenance is derived from the
// season), with the model's 80% range in the tooltip.
function projPill(p, season) {
  if (p.overall_rating == null) {
    const why = p.position_group === "OL" ? "not projected — no individual blocking data exists" : "no projection";
    return `<span class="trio-na" title="${_esc(why)}">—</span>`;
  }
  const range = p.projection_low != null && p.projection_high != null
    ? `; 80% range ${Math.round(p.projection_low)}–${Math.round(p.projection_high)}` : "";
  return ovrPill(p.overall_rating, { label: `Preseason projection, ${season}${range}`, season, source: p.projection_source });
}

// What he has earned so far this season. A distinct pill (accent underline) so the
// three kinds are told apart by shape, not by colour alone. A player with 1–2
// games shows "(2 gm)" — in parentheses so a sort never reads it as a rating.
function livePill(p) {
  const wk = p.live_through_week;
  if (p.live_rating != null) {
    const v = Math.round(p.live_rating);
    const c = ratingColor(v);
    const g = p.live_games != null ? ` · ${p.live_games} games` : "";
    return `<span class="ovr-badge is-live" style="background:${c};color:${ratingTextColor(c)}"
      title="${_esc(`Earned so far, through week ${wk}${g} — rescaled to full-season pace. Provisional.`)}">${v}</span>`;
  }
  if (p.live_status === "too_few_games") {
    return `<span class="trio-na" title="${_esc(_liveWhy(p))}">(${p.live_games} gm)</span>`;
  }
  return `<span class="trio-na" title="${_esc(_liveWhy(p))}">—</span>`;
}

// The three pills as table cells, in column order: [2025, PROJ, LIVE].
function ratingTrioCells(p, season) {
  return [prevPill(p, season), projPill(p, season), livePill(p)];
}

// Movement between the three, each with its number: projection against last
// season, and to-date against projection. Null where either side is missing.
function trioDeltas(p) {
  const d = (a, b) => (a != null && b != null ? a - b : null);
  return { proj: d(p.overall_rating, p.rating_prev), live: d(p.live_rating, p.overall_rating) };
}

// The big three-tile strip for a player card: 2025 earned → projection → to date,
// each captioned with what it is, the movement from the one before, and the one
// fact that qualifies it (a range, a games count).
function ratingTrioStrip(p, season) {
  const y = (season ?? CONFIG.CURRENT_SEASON);
  const d = trioDeltas(p);
  const wk = p.live_through_week;
  const range = p.projection_low != null && p.projection_high != null
    ? `range ${Math.round(p.projection_low)}–${Math.round(p.projection_high)}` : "no range";
  const liveSub = p.live_rating != null
    ? `wk ${wk ?? "?"}${p.live_games != null ? ` · ${p.live_games} games` : ""} · provisional`
    : _liveWhy(p);
  const tile = (cls, cap, pill, chip, sub) => `
    <div class="trio-tile ${cls}">
      <div class="trio-cap">${cap}</div>
      <div class="trio-num">${pill}</div>
      <div class="trio-chip">${chip}</div>
      <div class="trio-sub">${_esc(sub)}</div>
    </div>`;
  return `<div class="trio-strip" role="group" aria-label="Three ratings">
    ${tile("is-prev", `${y - 1} · EARNED`, prevPill(p, y), "", p.rating_prev != null ? "a full season" : (PREV_STATUS_TEXT[p.rating_prev_status] || ""))}
    <span class="trio-arrow" aria-hidden="true">→</span>
    ${tile("is-proj", `${y} · PROJECTION`, projPill(p, y), d.proj != null ? deltaChip(d.proj, { title: `Projection minus ${y - 1} earned` }) : "", range)}
    <span class="trio-arrow" aria-hidden="true">→</span>
    ${tile("is-live", `${y} · TO DATE`, livePill(p), d.live != null ? deltaChip(d.live, { title: "To date minus projection" }) : "", liveSub)}
  </div>`;
}
