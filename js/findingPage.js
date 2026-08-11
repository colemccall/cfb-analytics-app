// findingPage.js — renders any entry in the findings registry as a full page,
// and renders the index cards that link to them.
//
// This is the whole "adding an analysis is cheap" guarantee: a new finding is a
// registry entry plus a ~30-line HTML shell. No page here owns markup rules —
// everything composes the existing primitives (masthead, statBig, createFilterBar,
// createDataTable, entity links, the player modal).
//
// Shell contract:
//   <div id="finding-root"></div>  and  <script>initFinding("some-id")</script>

async function initFinding(id) {
  const root = document.getElementById("finding-root");
  if (!root) return;
  const f = FINDINGS[id];
  if (!f) {
    root.innerHTML = errorState(`No finding registered as "${id}".`);
    return;
  }

  document.title = `${f.title} — CFB Analytics`;

  // Prose first, so the page reads as a claim even before data arrives.
  root.innerHTML = `
    ${_findingMasthead(f)}
    <div class="page-content">
      ${f.status === "upcoming" ? _upcomingBody(f) : `
        <div id="finding-stats" class="finding-stats">${skeletonCards(4)}</div>
        <div id="finding-filters" class="filter-bar"></div>
        <div id="finding-table">${skeletonRows(8)}</div>
        <div id="finding-notes"></div>`}
    </div>`;

  if (f.status === "upcoming") return;

  let rows, meta;
  try {
    ({ rows, meta } = await f.load());
  } catch (e) {
    document.getElementById("finding-table").innerHTML =
      errorState("This finding's data could not be loaded.");
    document.getElementById("finding-stats").innerHTML = "";
    return;
  }

  if (!rows || !rows.length) {
    document.getElementById("finding-stats").innerHTML = "";
    document.getElementById("finding-table").innerHTML = emptyState(
      "No data for this finding yet — run the pipeline scripts that produce it.");
    document.getElementById("finding-notes").innerHTML = _notes(f);
    return;
  }

  const render = () => {
    _renderStats(f, rows, meta);
    const table = createDataTable(document.getElementById("finding-table"), {
      rows,
      columns: f.columns,
      sort: f.sort,
      maxRows: f.maxRows || 250,
      rowClass: f.rowClass,
      footnote: `Showing the full set — use the filters to narrow it.`,
    });

    const defs = typeof f.filters === "function" ? f.filters(rows) : (f.filters || []);
    if (defs.length) {
      const bar = createFilterBar(document.getElementById("finding-filters"), defs, v => {
        table.update(f.apply ? f.apply(rows, v) : rows);
      });
      // Apply the declared defaults immediately — a filter that says "2025" but
      // shows every season is lying about what you are looking at.
      table.update(f.apply ? f.apply(rows, bar.values()) : rows);
    }

    document.getElementById("finding-notes").innerHTML = _notes(f);
    return table;
  };

  const table = render();
  // Pills and chips are theme-computed; repaint from cached rows on a switch.
  onThemeChange(() => table && table.refresh());
}

function _findingMasthead(f) {
  return `
    <header class="masthead masthead--page animate-pop">
      <div class="eyebrow">${_esc(f.eyebrow)}</div>
      <h1>${_esc(f.title)}</h1>
      <p class="masthead-sub">${_esc(f.claim)}</p>
      <p class="finding-breadcrumb">
        <a href="${f.kind === "research" ? "research.html" : "index.html"}">
          ${f.kind === "research" ? "← All research" : "← All storylines"}</a>
        ${f.status === "upcoming" ? '<span class="badge-upcoming">Not built yet</span>' : ""}
      </p>
    </header>`;
}

function _renderStats(f, rows, meta) {
  const el = document.getElementById("finding-stats");
  if (!el) return;
  let stats = [];
  try { stats = f.stats ? f.stats(rows, meta) : []; } catch (_) { stats = []; }
  el.innerHTML = stats.length
    ? `<div class="stagger-children">${stats.map(s =>
        `<div class="finding-stat-tile animate-up">${statBig(s.value, s.label)}</div>`).join("")}</div>`
    : "";
}

// Method and limitations are not optional. A finding that cannot say what it
// misses is a claim without a confidence interval.
function _notes(f) {
  return `
    <div class="finding-notes">
      <div class="finding-note">
        <div class="modal-subsection-title">How it's computed</div>
        <p>${f.method}</p>
      </div>
      <div class="finding-note">
        <div class="modal-subsection-title">What it can't see</div>
        <p>${f.limitations}</p>
      </div>
    </div>`;
}

function _upcomingBody(f) {
  return `
    <div class="finding-upcoming">
      <p class="finding-upcoming-lead">${_esc(f.question)}</p>
      <div class="finding-notes">
        <div class="finding-note">
          <div class="modal-subsection-title">The plan</div>
          <p>${f.plan}</p>
        </div>
        <div class="finding-note">
          <div class="modal-subsection-title">Known difficulties</div>
          <p>${f.limitations}</p>
        </div>
      </div>
      <p class="breakdown-note">
        This page exists so the finding has a home before it has an answer. Nothing here is
        computed yet — when the analysis lands it renders in place, from the same registry
        entry, with no new page code.
      </p>
    </div>`;
}

// ── Index rendering ────────────────────────────────────────────────────────
// research.html and the home page both list findings. Same cards, same source.

async function renderFindingIndex(containerId, kind) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const items = findingsOfKind(kind);
  if (!items.length) { el.innerHTML = ""; return; }

  // Live findings load their own headline stat so the card states a fact, not a
  // description. Each one fails independently.
  const cards = await Promise.all(items.map(async f => {
    let headline = null;
    if (f.status === "live" && f.headline) {
      try {
        const { rows, meta } = await f.load();
        headline = f.headline(rows, meta);
      } catch (_) { /* card renders without its stat */ }
    }
    return `
      <a class="finding-card animate-up ${f.status === "upcoming" ? "is-upcoming" : ""}" href="${f.page}">
        <span class="research-tag">${_esc(f.eyebrow)}</span>
        <h3>${_esc(f.title)}</h3>
        <p>${_esc(f.question)}</p>
        ${headline ? `<div class="finding-stat">${_esc(headline)}</div>` : ""}
        ${f.status === "upcoming" ? '<div class="finding-stat finding-stat--warning">Framework in place — analysis next</div>' : ""}
      </a>`;
  }));

  el.innerHTML = `<div class="research-grid stagger-children">${cards.join("")}</div>`;
}
