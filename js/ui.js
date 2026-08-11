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
// Provenance is derived from the season, not asked of the caller: pass
// `season` and any projected season automatically renders the hatch + PROJ
// badge. With 2026 as the app's default season, "the caller remembered to pass
// projected: true" is not a strong enough guarantee — one missed call site
// presents model output as an earned rating.
//
// `projected` remains as an explicit override for the rare case where the value
// is projected but no season is in scope.
function ovrPill(rating, { label = "", projected = false, season = null, source = "" } = {}) {
  if (rating == null) return '<span class="text-muted">—</span>';
  const isProj = projected || (season != null && isProjectedSeason(season));
  const v = Math.round(rating);
  const c = ratingColor(v);
  const cls = isProj ? "ovr-badge is-projected" : "ovr-badge";
  const title = isProj
    ? `${label || "Projected rating"}${source ? ` — ${PROJECTION_SOURCE_LABELS[source] || source}` : ""}`
    : label;
  const pill = `<span class="${cls}" style="background:${c};color:${ratingTextColor(c)}"
    title="${_esc(title)}">${v}</span>`;
  return isProj ? `${pill} ${projBadge()}` : pill;
}

// How each projected number was arrived at — shown in tooltips and the modal.
const PROJECTION_SOURCE_LABELS = {
  engine_d:    "projected from his career production curve",
  carry:       "last season's rating, moved along his cohort's development curve",
  recruiting:  "recruiting grade (no college production yet)",
  ea_cfb27:    "EA CFB 27's overall — we had no signal of our own",
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
      <span>Every rating for ${_esc(season)} is a projection — the season has not been played.
      <a href="info.html#projections">How these are built →</a></span>
    </div>`;
}

// Keeps the page-level banner in step with a season picker. Pages call this on
// load and whenever their season changes, so switching from 2026 back to 2025
// removes the notice instead of leaving a stale one behind.
function renderSeasonProvenance(season, id = "season-provenance") {
  const el = document.getElementById(id);
  if (el) el.innerHTML = projectedSeasonNotice(season);
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
