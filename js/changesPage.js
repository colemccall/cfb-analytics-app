// changesPage.js — renders one CHANGES entry (the Build Log reader in menuScreensPages.js draws them one at a time).
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

// A METHODS id rendered as a link to its entry in the Methods reader, but only when the entry
// really exists. A dead anchor is worse than plain text: it promises an
// explanation and delivers a scroll to nowhere.
function _methodLink(id) {
  const entry = (typeof METHODS !== "undefined")
    ? METHODS.find(m => m.id === id) : null;
  if (!entry) return `<span class="text-muted">${_esc(id)}</span>`;
  return `<a href="#/methods/${_esc(id)}">${_esc(entry.title)}</a>`;
}

// The "What changed" block: one row per `did` item with its reason and, when
// recorded, its cost. Empty when the entry has no `did` array.
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

// The "What was run to prove it" block — each check command beside its result.
// Wrapped in .method-table-scroll because the commands are long code strings
// that overflowed a phone viewport.
function _gates(rows) {
  if (!rows || !rows.length) return "";
  return `
    <div class="method-block">
      <div class="modal-subsection-title">What was run to prove it</div>
      <div class="method-table-scroll">
        <table class="data-table method-evidence">
          <tbody>
            ${rows.map(g => `
              <tr><th scope="row"><code>${_esc(g.check)}</code></th><td>${_esc(g.result)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

// The "Files" line: every new or substantially changed file, as code.
function _files(list) {
  if (!list || !list.length) return "";
  return `
    <div class="method-block">
      <div class="modal-subsection-title">Files</div>
      <p class="method-source">${list.map(f => `<code>${_esc(f)}</code>`).join(" · ")}</p>
    </div>`;
}

// v4.26: work Claude did that the owner did not ask for carries origin "claude-initiative" and an
// `initiative` block (docs/BUILD_LOG_SPEC.md). Everything else was requested.
function _isInitiative(c) {
  return c && c.origin === "claude-initiative";
}

// The initiative panel: what was done unasked, why, how (steps and files), the evidence or "untested",
// how to reverse it and the open questions, in a frame of its own so it cannot be read as requested work.
function _initiative(c) {
  if (!_isInitiative(c)) return "";
  const i = c.initiative || {};
  const how = i.how || {};
  const evidence = i.evidence && i.evidence !== "untested" ? prose(i.evidence) : '<p class="text-muted">Untested.</p>';
  return `
    <section class="method-block change-initiative" aria-label="Done on Claude's initiative">
      <div class="modal-subsection-title">Done on Claude's initiative: not requested</div>
      <dl class="change-initiative-list">
        <dt>What</dt><dd>${prose(i.what || "Not recorded.")}</dd>
        <dt>Why</dt><dd>${prose(i.why || "Not recorded.")}</dd>
        <dt>How</dt><dd>${how.steps && how.steps.length ? `<ol>${how.steps.map(st => `<li>${_esc(st)}</li>`).join("")}</ol>` : ""}
          ${how.files && how.files.length ? `<p class="method-source">${how.files.map(f => `<code>${_esc(f)}</code>`).join(" · ")}</p>` : ""}</dd>
        <dt>Evidence</dt><dd>${evidence}</dd>
        <dt>How to reverse it</dt><dd>${prose(i.reverse || "Not recorded.")}</dd>
        <dt>Open questions</dt><dd>${i.questions && i.questions.length ? `<ul>${i.questions.map(q => `<li>${_esc(q)}</li>`).join("")}</ul>` : "None recorded."}</dd>
      </dl>
    </section>`;
}

// One CHANGES entry as an <article>, in the order the build-log spec fixes:
// summary → (initiative panel) → motivation → did → tried → measured → gates → did-not-fix →
// linked METHODS entries → files. "Did not fix" always renders, even when
// the entry is missing it, because an absent answer is itself the finding.
function _changeEntry(c) {
  return `
    <article class="method-entry animate-up${_isInitiative(c) ? " change-entry--initiative" : ""}" id="${_esc(c.id)}">
      <div class="eyebrow">${_esc(c.version)} · ${_esc(c.date)}${_isInitiative(c) ? ' <span class="origin-chip">Claude initiative</span>' : ""}</div>
      <h3 class="method-title">${_esc(c.title)}</h3>
      <p class="method-summary">${_esc(c.summary)}</p>
      ${_initiative(c)}
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

