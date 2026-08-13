// methodsPage.js — renders methods.html from the METHODS registry.
//
// Same split as findings.js / findingPage.js: the registry holds content, this
// holds presentation. Adding a method entry needs no page code.
//
// The data-availability table at the bottom is rendered from
// data/api_availability.json, written by the pipeline's scripts/explore_api.py,
// rather than hand-copied — a hand-copied inventory is one that goes stale the
// first time the API changes.

function _mEsc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function _statusChip(status) {
  const label = STATUS_LABEL[status] || status;
  return `<span class="method-chip method-chip-${_mEsc(status)}">${_mEsc(label)}</span>`;
}

function _alternatives(alts) {
  if (!alts || !alts.length) return "";
  return `
    <div class="method-block">
      <div class="modal-subsection-title">Alternatives considered</div>
      <ul class="method-alts">
        ${alts.map(a => `
          <li class="method-alt">
            <div class="method-alt-head">
              <span class="method-alt-label">${_mEsc(a.label)}</span>
              ${_statusChip(a.status)}
            </div>
            ${a.basis ? `<div class="method-alt-basis">Needs: ${_mEsc(a.basis)}</div>` : ""}
            ${a.note ? `<div class="method-alt-note">${_mEsc(a.note)}</div>` : ""}
          </li>`).join("")}
      </ul>
    </div>`;
}

function _evidence(rows) {
  if (!rows || !rows.length) return "";
  return `
    <div class="method-block">
      <div class="modal-subsection-title">Measured</div>
      <table class="data-table method-evidence">
        <tbody>
          ${rows.map(e => `
            <tr><th scope="row">${_mEsc(e.label)}</th><td>${_mEsc(e.value)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

// Inputs table: what goes in, from which endpoint, and over what seasons.
// Coverage is the column that matters — "the endpoint exists" and "the endpoint
// has 2009 data" are different claims and conflating them has cost us twice.
function _inputs(rows) {
  if (!rows || !rows.length) return "";
  return `
    <div class="method-block">
      <div class="modal-subsection-title">What goes in</div>
      <div class="method-table-scroll">
        <table class="data-table">
          <thead><tr><th>Input</th><th>Source</th><th>Coverage</th></tr></thead>
          <tbody>
            ${rows.map(i => `
              <tr>
                <td>${_mEsc(i.name)}</td>
                <td><code>${_mEsc(i.source)}</code></td>
                <td>${_mEsc(i.coverage || "—")}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

// Light markdown: **bold** and `code`, on already-escaped text. The `why` and
// `limits` fields are long-form prose and unreadable as one undifferentiated
// block without at least emphasis.
function _prose(s) {
  return _mEsc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .split(/\n\s*\n/).map(p => `<p>${p.replace(/\n/g, " ")}</p>`).join("");
}

function _changelog(rows) {
  if (!rows || !rows.length) return "";
  return `
    <div class="method-block">
      <div class="modal-subsection-title">What changed</div>
      <table class="data-table method-evidence">
        <tbody>
          ${rows.map(c => `
            <tr><th scope="row">${_mEsc(c.version)}</th><td>${_mEsc(c.change)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function _entry(m) {
  return `
    <article class="method-entry animate-up" id="${_mEsc(m.id)}">
      <h3 class="method-title">${_mEsc(m.title)}</h3>
      <p class="method-summary">${_mEsc(m.summary)}</p>
      ${_inputs(m.inputs)}
      ${m.formula ? `
        <div class="method-block">
          <div class="modal-subsection-title">As computed</div>
          <pre class="method-code"><code>${_mEsc(m.formula)}</code></pre>
        </div>` : ""}
      ${m.reality ? `
        <div class="method-block">
          <div class="modal-subsection-title">What the code actually does</div>
          <pre class="method-code method-code-warn"><code>${_mEsc(m.reality)}</code></pre>
        </div>` : ""}
      ${m.why ? `
        <div class="method-block">
          <div class="modal-subsection-title">Why it is built this way</div>
          <div class="method-prose">${_prose(m.why)}</div>
        </div>` : ""}
      ${_evidence(m.evidence)}
      ${m.limits ? `
        <div class="method-block">
          <div class="modal-subsection-title">What this cannot support</div>
          <div class="method-prose method-limits">${_prose(m.limits)}</div>
        </div>` : ""}
      ${_alternatives(m.alternatives)}
      ${_changelog(m.changelog)}
      ${m.source ? `<p class="method-source">Written up in <code>${_mEsc(m.source)}</code></p>` : ""}
    </article>`;
}

async function _availability() {
  let d = null;
  try { d = await _load("api_availability.json"); } catch (_) { d = null; }
  if (!d || !d.endpoints) {
    return `<p class="empty-state">No API survey on file — run
      <code>python scripts/explore_api.py</code> in the pipeline.</p>`;
  }

  const used = d.endpoints.filter(e => e.in_pipeline).length;
  const absent = (d.verified_absent || []).map(a => `
    <tr><th scope="row">${_mEsc(a.what)}</th><td>${_mEsc(a.evidence)}</td></tr>`).join("");

  const rows = d.endpoints.map(e => `
    <tr>
      <td><code>${_mEsc(e.path)}</code></td>
      <td class="num">${e.records ?? "—"}</td>
      <td>${e.in_pipeline ? "in use" : "<span class='text-muted'>unused</span>"}</td>
      <td>${e.capped ? "capped — needs slicing" : ""}</td>
    </tr>`).join("");

  return `
    <p class="method-summary">
      The API exposes ${d.endpoints.length} endpoints that answer. We call ${used} of them.
      This table is generated by the pipeline's API survey, not maintained by hand, so it
      cannot quietly go stale.
    </p>
    <div class="method-block">
      <div class="modal-subsection-title">What does not exist, and how we know</div>
      <table class="data-table method-evidence"><tbody>${absent}</tbody></table>
    </div>
    <div class="method-block">
      <div class="modal-subsection-title">Every endpoint that answered</div>
      <div class="method-table-scroll">
        <table class="data-table">
          <thead><tr><th>Endpoint</th><th class="num">Records</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

async function initMethods() {
  const root = document.getElementById("methods-root");
  if (!root) return;

  const groups = METHOD_GROUPS.map(g => {
    const entries = METHODS.filter(m => m.group === g.id);
    if (!entries.length && g.id !== "data") return "";
    return `
      <section class="method-group" id="group-${_mEsc(g.id)}">
        <h2 class="section-heading">${_mEsc(g.label)}</h2>
        ${g.id === "data" ? '<div id="method-availability"></div>'
                          : `<div class="stagger-children">${entries.map(_entry).join("")}</div>`}
      </section>`;
  }).join("");

  root.innerHTML = `
    <header class="masthead masthead--page animate-pop">
      <div class="eyebrow">METHODS</div>
      <h1>How every number here is made</h1>
      <p class="masthead-sub">
        Each rating, projection and finding on this platform, with the formula as the code
        actually computes it, what has been measured about it, and the alternatives considered —
        including the ones rejected and why. Where a number is built on inputs that do not
        exist, it says so.
      </p>
      <nav class="method-toc">
        ${METHOD_GROUPS.map(g =>
          `<a href="#group-${_mEsc(g.id)}">${_mEsc(g.label)}</a>`).join("")}
      </nav>
    </header>
    ${groups}`;

  const avail = document.getElementById("method-availability");
  if (avail) avail.innerHTML = await _availability();
}
