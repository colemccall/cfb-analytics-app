// changesPage.js — renders changes.html from the CHANGES registry.
//
// Same split as methods.js / methodsPage.js and findings.js / findingPage.js:
// the registry holds content, this holds presentation. Adding a build-log entry
// needs no page code, and if it appears to, that is a design change and should
// be said out loud rather than written.
//
// Escaping (`_esc`), prose and the status chip come from config.js / ui.js and
// are shared with methodsPage.js. There is deliberately no second chip system:
// `tried` rows reuse the METHODS statuses.

// Reverse chronological. Sorting on the date rather than trusting array order
// means a backfilled entry can be written anywhere in the file and still land in
// the right place.
function _byDateDesc(a, b) {
  return String(b.date || "").localeCompare(String(a.date || ""));
}

// A METHODS id rendered as a link to methods.html#<id>, but only when the anchor
// really exists. A dead anchor is worse than plain text: it promises an
// explanation and delivers a scroll to nowhere.
function _methodLink(id) {
  const entry = (typeof METHODS !== "undefined")
    ? METHODS.find(m => m.id === id) : null;
  if (!entry) return `<span class="text-muted">${_esc(id)}</span>`;
  return `<a href="methods.html#${_esc(id)}">${_esc(entry.title)}</a>`;
}

function _did(rows) {
  if (!rows || !rows.length) return "";
  return `
    <div class="method-block">
      <div class="modal-subsection-title">What changed</div>
      <ul class="method-alts">
        ${rows.map(d => `
          <li class="method-alt">
            <div class="method-alt-head">
              <span class="method-alt-label">${_esc(d.what)}</span>
            </div>
            ${d.why ? `<div class="method-alt-note">${prose(d.why)}</div>` : ""}
            ${d.cost ? `<div class="method-alt-basis">Cost: ${_esc(d.cost)}</div>` : ""}
          </li>`).join("")}
      </ul>
    </div>`;
}

// The point of the whole page. An entry with nothing here means either nothing
// was explored or the exploration was not recorded, and the empty state says so
// rather than rendering nothing and looking tidy.
function _tried(rows) {
  if (!rows || !rows.length) {
    return `
      <div class="method-block">
        <div class="modal-subsection-title">What was tried and dropped</div>
        <p class="empty-state">Nothing recorded for this pass — which means either nothing
          was explored or the exploration was not written down.</p>
      </div>`;
  }
  return `
    <div class="method-block">
      <div class="modal-subsection-title">What was tried and dropped</div>
      <ul class="method-alts">
        ${rows.map(t => `
          <li class="method-alt">
            <div class="method-alt-head">
              <span class="method-alt-label">${_esc(t.what)}</span>
              ${statusChip(t.verdict)}
            </div>
            ${t.result ? `<div class="method-alt-note">${prose(t.result)}</div>` : ""}
          </li>`).join("")}
      </ul>
    </div>`;
}

// before/after, on the same table primitive methods.html uses for evidence.
function _measured(rows) {
  if (!rows || !rows.length) return "";
  return `
    <div class="method-block">
      <div class="modal-subsection-title">Measured</div>
      <div class="method-table-scroll">
        <table class="data-table method-evidence">
          <thead><tr><th></th><th>Before</th><th>After</th></tr></thead>
          <tbody>
            ${rows.map(m => `
              <tr>
                <th scope="row">${_esc(m.label)}</th>
                <td>${_esc(m.before ?? "—")}</td>
                <td>${_esc(m.after ?? "—")}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

function _gates(rows) {
  if (!rows || !rows.length) return "";
  return `
    <div class="method-block">
      <div class="modal-subsection-title">What was run to prove it</div>
      <table class="data-table method-evidence">
        <tbody>
          ${rows.map(g => `
            <tr><th scope="row"><code>${_esc(g.check)}</code></th><td>${_esc(g.result)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function _files(list) {
  if (!list || !list.length) return "";
  return `
    <div class="method-block">
      <div class="modal-subsection-title">Files</div>
      <p class="method-source">${list.map(f => `<code>${_esc(f)}</code>`).join(" · ")}</p>
    </div>`;
}

function _changeEntry(c) {
  return `
    <article class="method-entry animate-up" id="${_esc(c.id)}">
      <div class="eyebrow">${_esc(c.version)} · ${_esc(c.date)}</div>
      <h3 class="method-title">${_esc(c.title)}</h3>
      <p class="method-summary">${_esc(c.summary)}</p>
      ${c.motivation ? `
        <div class="method-block">
          <div class="modal-subsection-title">What prompted it</div>
          <div class="method-prose">${prose(c.motivation)}</div>
        </div>` : ""}
      ${_did(c.did)}
      ${_tried(c.tried)}
      ${_measured(c.measured)}
      ${_gates(c.gates)}
      <div class="method-block">
        <div class="modal-subsection-title">What this pass did not fix</div>
        <div class="method-prose method-limits">${prose(c.unfixed || "Not recorded.")}</div>
      </div>
      ${c.methods && c.methods.length ? `
        <div class="method-block">
          <div class="modal-subsection-title">Methods entries this changed</div>
          <p class="method-source">${c.methods.map(_methodLink).join(" · ")}</p>
        </div>` : ""}
      ${_files(c.files)}
    </article>`;
}

function initChanges() {
  const root = document.getElementById("changes-root");
  if (!root) return;

  const entries = [...CHANGES].sort(_byDateDesc);

  root.innerHTML = `
    <header class="masthead masthead--page animate-pop">
      <div class="eyebrow">BUILD LOG</div>
      <h1>What changed, and what it cost</h1>
      <p class="masthead-sub">
        Methods explains what a number is. This explains what happened to it: which
        alternative was tried and abandoned, what the measurement said, and what each pass
        deliberately left unfixed. Every entry names something that did not work — that is
        the part usually missing, and it is the part worth reading.
      </p>
      <nav class="method-toc">
        ${entries.map(c => `<a href="#${_esc(c.id)}">${_esc(c.version)}</a>`).join("")}
      </nav>
    </header>
    <section class="method-group">
      <div class="stagger-children">${entries.map(_changeEntry).join("")}</div>
    </section>`;
}
