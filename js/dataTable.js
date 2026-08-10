// dataTable.js — the shared sortable/filterable table.
//
// One implementation for every analytical table in the app (research tables,
// leaderboards, slates). Renders the canonical .data-table with aria-sort
// headers; callers describe columns and rows, they never hand-write <table>.
//
//   const table = createDataTable(containerEl, {
//     columns: [{ key, label, num?, title?, fmt?(value, row), sortVal?(value, row) }],
//     rows:    [...],
//     sort:    { key: "delta", asc: false },
//     maxRows: 200,
//     footnote: "html shown under the table",
//     empty:   "message when rows is empty",
//   });
//   table.update(newRows);   // re-render (e.g. after a filter change)
//
// Column contract:
//   fmt      — cell HTML (defaults to escaped value or "—"); links/pills welcome
//   sortVal  — value used for ordering (defaults to the raw value)
//   num      — right-aligned tabular numerals
//
// createFilterBar(barEl, defs, onChange) renders <select>/<input> filters and
// reports {id: value} on every change — filtering logic stays with the caller.

function createDataTable(container, opts) {
  const columns = opts.columns || [];
  const state = {
    rows: opts.rows || [],
    sort: opts.sort || null,           // {key, asc}
  };
  const maxRows = opts.maxRows || 500;

  function _cellValue(col, row) {
    return row[col.key];
  }

  function _sortValue(col, row) {
    const v = _cellValue(col, row);
    return col.sortVal ? col.sortVal(v, row) : v;
  }

  function _sorted() {
    if (!state.sort) return state.rows;
    const col = columns.find(c => c.key === state.sort.key);
    if (!col) return state.rows;
    const asc = state.sort.asc;
    return [...state.rows].sort((a, b) => {
      const av = _sortValue(col, a), bv = _sortValue(col, b);
      // Missing values always sort to the bottom, regardless of direction.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" || typeof bv === "string") {
        return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      }
      return asc ? av - bv : bv - av;
    });
  }

  function render() {
    if (!state.rows.length) {
      container.innerHTML = emptyState(opts.empty || "No rows match.");
      return;
    }
    const rows = _sorted();
    const shown = rows.slice(0, maxRows);

    const thead = columns.map(c => {
      const sorted = state.sort && state.sort.key === c.key;
      const aria = sorted ? ` aria-sort="${state.sort.asc ? "ascending" : "descending"}"` : ' aria-sort="none"';
      return `<th data-col="${_esc(c.key)}"${aria} class="${c.num ? "num" : ""}"
        ${c.title ? `title="${_esc(c.title)}"` : ""}>${_esc(c.label)}</th>`;
    }).join("");

    const tbody = shown.map(row => {
      const tds = columns.map(c => {
        const v = _cellValue(c, row);
        const html = c.fmt ? c.fmt(v, row) : (v == null ? "—" : _esc(String(v)));
        return `<td class="${c.num ? "num" : ""}">${html}</td>`;
      }).join("");
      const cls = opts.rowClass ? (opts.rowClass(row) || "") : "";
      return `<tr${cls ? ` class="${cls}"` : ""}>${tds}</tr>`;
    }).join("");

    const countNote = rows.length > shown.length
      ? `Showing ${shown.length} of ${rows.length} rows. ` : "";

    container.innerHTML = `
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead><tr>${thead}</tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
      ${(countNote || opts.footnote) ? `<p class="table-footnote">${countNote}${opts.footnote || ""}</p>` : ""}`;

    container.querySelectorAll("th[data-col]").forEach(th => {
      th.addEventListener("click", () => {
        const key = th.dataset.col;
        state.sort = (state.sort && state.sort.key === key)
          ? { key, asc: !state.sort.asc }
          : { key, asc: false };
        render();
      });
    });
  }

  render();
  return {
    update(rows) { state.rows = rows || []; render(); },
    // Re-render the current rows and sort — used after a theme switch, where
    // cell formatters (pills, chips) resolve different colors.
    refresh() { render(); },
    rows() { return state.rows; },
  };
}

// ── Filter bar ──────────────────────────────────────────────────────────────
// defs: [{ id, label?, type: "select", options: [{value,label}], value }]
//       [{ id, label,  type: "number", value, min?, max?, width? }]
// onChange receives { id: value } for all filters on every change.
function createFilterBar(barEl, defs, onChange) {
  const values = {};
  for (const d of defs) values[d.id] = d.value;

  barEl.innerHTML = defs.map(d => {
    if (d.type === "select") {
      return `<select data-filter="${_esc(d.id)}" ${d.label ? `title="${_esc(d.label)}"` : ""}>
        ${d.options.map(o => `<option value="${_esc(String(o.value))}"${String(o.value) === String(d.value) ? " selected" : ""}>${_esc(o.label)}</option>`).join("")}
      </select>`;
    }
    if (d.type === "number") {
      return `<label class="filter-inline-label">${_esc(d.label)}
        <input data-filter="${_esc(d.id)}" type="number" value="${_esc(String(d.value))}"
          ${d.min != null ? `min="${d.min}"` : ""} ${d.max != null ? `max="${d.max}"` : ""}
          style="width:${d.width || 56}px">
      </label>`;
    }
    return "";
  }).join("");

  barEl.querySelectorAll("[data-filter]").forEach(el => {
    el.addEventListener("change", () => {
      values[el.dataset.filter] = el.type === "number" ? (parseInt(el.value) || 0) : el.value;
      onChange({ ...values });
    });
  });

  return { values: () => ({ ...values }) };
}
