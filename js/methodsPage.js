// methodsPage.js — renders methods.html from the METHODS registry.
//
// Same split as findings.js / findingPage.js: the registry holds content, this
// holds presentation. Adding a method entry needs no page code.
//
// The data-availability table at the bottom is rendered from
// data/api_availability.json, written by the pipeline's scripts/explore_api.py,
// rather than hand-copied — a hand-copied inventory is one that goes stale the
// first time the API changes.
//
// Escaping (`_esc`, config.js), registry prose (`prose`) and the status chip
// (`statusChip`) are shared with changesPage.js and live in ui.js. They used to
// be defined here as _mEsc/_prose/_statusChip; the changes page needed all three
// and two copies of an escaper is how one of them ends up not escaping.

const _statusChip = statusChip;

function _alternatives(alts) {
  if (!alts || !alts.length) return "";
  return `
    <div class="method-block">
      <div class="modal-subsection-title">Alternatives considered</div>
      <ul class="method-alts">
        ${alts.map(a => `
          <li class="method-alt">
            <div class="method-alt-head">
              <span class="method-alt-label">${_esc(a.label)}</span>
              ${_statusChip(a.status)}
            </div>
            ${a.basis ? `<div class="method-alt-basis">Needs: ${_esc(a.basis)}</div>` : ""}
            ${a.note ? `<div class="method-alt-note">${_esc(a.note)}</div>` : ""}
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
            <tr><th scope="row">${_esc(e.label)}</th><td>${_esc(e.value)}</td></tr>`).join("")}
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
                <td>${_esc(i.name)}</td>
                <td><code>${_esc(i.source)}</code></td>
                <td>${_esc(i.coverage || "—")}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

function _changelog(rows) {
  if (!rows || !rows.length) return "";
  return `
    <div class="method-block">
      <div class="modal-subsection-title">What changed</div>
      <table class="data-table method-evidence">
        <tbody>
          ${rows.map(c => `
            <tr><th scope="row">${_esc(c.version)}</th><td>${_esc(c.change)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function _entry(m) {
  return `
    <article class="method-entry animate-up" id="${_esc(m.id)}">
      <h3 class="method-title">${_esc(m.title)}</h3>
      <p class="method-summary">${_esc(m.summary)}</p>
      ${_inputs(m.inputs)}
      ${m.formula ? `
        <div class="method-block">
          <div class="modal-subsection-title">As computed</div>
          <pre class="method-code"><code>${_esc(m.formula)}</code></pre>
        </div>` : ""}
      ${m.reality ? `
        <div class="method-block">
          <div class="modal-subsection-title">What the code actually does</div>
          <pre class="method-code method-code-warn"><code>${_esc(m.reality)}</code></pre>
        </div>` : ""}
      ${m.why ? `
        <div class="method-block">
          <div class="modal-subsection-title">Why it is built this way</div>
          <div class="method-prose">${prose(m.why)}</div>
        </div>` : ""}
      ${_evidence(m.evidence)}
      ${m.limits ? `
        <div class="method-block">
          <div class="modal-subsection-title">What this cannot support</div>
          <div class="method-prose method-limits">${prose(m.limits)}</div>
        </div>` : ""}
      ${_alternatives(m.alternatives)}
      ${_changelog(m.changelog)}
      ${m.source ? `<p class="method-source">Written up in <code>${_esc(m.source)}</code></p>` : ""}
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
    <tr><th scope="row">${_esc(a.what)}</th><td>${_esc(a.evidence)}</td></tr>`).join("");

  const rows = d.endpoints.map(e => `
    <tr>
      <td><code>${_esc(e.path)}</code></td>
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
    // The data group renders its entries AND the generated availability table.
    // It used to render only the table, which silently dropped any entry filed
    // under it — a registry that discards content is worse than no registry.
    return `
      <section class="method-group" id="group-${_esc(g.id)}">
        <h2 class="section-heading">${_esc(g.label)}</h2>
        ${entries.length ? `<div class="stagger-children">${entries.map(_entry).join("")}</div>` : ""}
        ${g.id === "data" ? '<div id="method-availability"></div>' : ""}
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
          `<a href="#group-${_esc(g.id)}">${_esc(g.label)}</a>`).join("")}
      </nav>
    </header>
    ${groups}`;

  const avail = document.getElementById("method-availability");
  if (avail) avail.innerHTML = await _availability();
}
