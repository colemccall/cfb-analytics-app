// guidePage.js — renders info.html ("How It Works") from the GUIDE registry.
//
// Same split as methods.js / methodsPage.js and changes.js / changesPage.js: the
// registry holds content, this holds presentation, and it composes only existing
// primitives — .method-entry, .method-block, .data-table, .method-toc, the tier
// legend, and the ui.js helpers the glossary samples call. No new component.
//
// Two things are asynchronous and fill in after first paint: each entry's `live`
// sentence (read from data/) and nothing else. Everything else renders at once,
// so the page reads correctly with the data files missing.
//
// Load order: config.js, shell.js → dataLoader.js, ui.js, methods.js,
// changes.js, guide.js → this file. METHODS supplies link titles and CHANGES
// the latest-version line; both are optional and degrade to plain text.

// A METHODS id as a link to its entry, titled from the registry. An id that no
// longer exists renders as muted text rather than a dead anchor — the same rule
// changesPage.js follows.
function _guideMethodLink(id) {
  const m = (typeof METHODS !== "undefined") ? METHODS.find(x => x.id === id) : null;
  return m
    ? `<a href="methods.html#${_esc(id)}">${_esc(m.title)}</a>`
    : `<span class="text-muted">${_esc(id)}</span>`;
}

// A two-column name → description table, shared by `panels` and `controls`.
function _guideTable(title, rows, head) {
  if (!rows || !rows.length) return "";
  return `
    <div class="method-block">
      <div class="modal-subsection-title">${_esc(title)}</div>
      <div class="method-table-scroll">
        <table class="data-table method-evidence">
          <thead><tr><th>${_esc(head)}</th><th>What it does</th></tr></thead>
          <tbody>${rows.map(r => `
            <tr><th scope="row">${_esc(r.name)}</th><td>${_esc(r.what)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

// The glossary: each mark drawn by its real helper beside what it means. A
// sample that throws (a helper renamed, say) shows a dash instead of taking the
// page down — and the smoke test catches the dash.
function _guideGlossary(items) {
  if (!items || !items.length) return "";
  const sample = g => { try { return g.sample(); } catch (_) { return "—"; } };
  return `
    <div class="method-block">
      <div class="method-table-scroll">
        <table class="data-table method-evidence guide-glossary">
          <thead><tr><th>Mark</th><th>Looks like</th><th>Means</th></tr></thead>
          <tbody>${items.map(g => `
            <tr>
              <th scope="row">${_esc(g.term)}</th>
              <td class="guide-sample">${sample(g)}</td>
              <td>${_esc(g.meaning)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

// One GUIDE entry as an <article> anchored by its id: summary, live line, the
// render block, glossary, panels, controls, tips, what it cannot tell you, and
// the METHODS entries that explain the numbers behind it.
function _guideEntry(e) {
  return `
    <article class="method-entry animate-up" id="${_esc(e.id)}">
      <h3 class="method-title">${_esc(e.title)}
        ${e.page ? `<a class="guide-page-link" href="${_esc(e.page)}">Open →</a>` : ""}</h3>
      <div class="method-prose">${prose(e.summary)}</div>
      ${e.live ? `<div class="method-prose guide-live" data-live="${_esc(e.id)}"></div>` : ""}
      ${e.render ? `<div class="method-block">${e.render()}</div>` : ""}
      ${_guideGlossary(e.glossary)}
      ${_guideTable("On the page", e.panels, "Panel")}
      ${_guideTable("Controls", e.controls, "Control")}
      ${e.tips && e.tips.length ? `
        <div class="method-block">
          <div class="modal-subsection-title">Tips</div>
          <ul class="guide-tips">${e.tips.map(t => `<li>${_esc(t)}</li>`).join("")}</ul>
        </div>` : ""}
      <div class="method-block">
        <div class="modal-subsection-title">What this cannot tell you</div>
        <div class="method-prose method-limits">${prose(e.limits || "Not recorded.")}</div>
      </div>
      ${e.methods && e.methods.length ? `
        <div class="method-block">
          <div class="modal-subsection-title">How the numbers are made</div>
          <p class="method-source">${e.methods.map(_guideMethodLink).join(" · ")}</p>
        </div>` : ""}
    </article>`;
}

// Fill each entry's `live` sentence. Each one fails independently and leaves
// its slot empty — a missing data file costs one sentence, not the page.
async function _guideFillLive() {
  await Promise.all(GUIDE.filter(e => e.live).map(async e => {
    const el = document.querySelector(`[data-live="${CSS.escape(e.id)}"]`);
    if (!el) return;
    try { el.innerHTML = await e.live(); } catch (_) { el.innerHTML = ""; }
  }));
}

// Entry point for info.html. Renders the masthead, a TOC of GUIDE_GROUPS and
// every entry, fills the live lines, and repaints on a theme change (the
// glossary samples and tier legend are theme-coloured). Re-scrolls to a #hash
// after rendering, because the anchor did not exist when the browser first
// looked for it — that is what makes info.html#projections land correctly.
function initGuide() {
  const root = document.getElementById("guide-root");
  if (!root) return;

  const render = () => {
    root.innerHTML = `
      <header class="masthead masthead--page animate-pop">
        <div class="eyebrow">HOW IT WORKS</div>
        <h1>How to read this site</h1>
        <p class="masthead-sub">
          What every page answers, what each panel and control does, and what every mark on a
          number means. For how the numbers themselves are computed — formulas, evidence, and
          what was tried and rejected — see <a href="methods.html">Methods</a>.
        </p>
        <nav class="method-toc">
          ${GUIDE_GROUPS.map(g => `<a href="#guide-${_esc(g.id)}">${_esc(g.label)}</a>`).join("")}
        </nav>
      </header>
      ${GUIDE_GROUPS.map(g => {
        const entries = GUIDE.filter(e => e.group === g.id);
        if (!entries.length) return "";
        return `
          <section class="method-group" id="guide-${_esc(g.id)}">
            <h2 class="section-heading">${_esc(g.label)}</h2>
            <div class="stagger-children">${entries.map(_guideEntry).join("")}</div>
          </section>`;
      }).join("")}`;
    return _guideFillLive();
  };

  // Instant, not the site's smooth scroll: a deep link should land, not travel
  // 4,000px. Repeated once the live lines above the target have filled in.
  const land = () => location.hash &&
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "instant" });
  render().then(land);
  land();
  onThemeChange(render);
}
