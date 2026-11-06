// registry-check.mjs — the registries' own contract, checked: every CHANGES, METHODS, GUIDE and FINDINGS entry holds what its
// contract says it must, so "every entry names something that did not work and what it cannot support" is enforced, not hoped.
//
// FAILURES (exit code = their number):
//   CHANGES   unique id; a version and an ISO date; a summary; `tried` and `unfixed` non-empty (the contract's two REQUIRED
//             fields); each `tried` item has a verdict; each `did` item has what and why; each `measured` item has a label and
//             both values; each `gates` item has a check and a result; `methods` ids exist in METHODS.
//   METHODS   unique id; a group that exists; a title, a summary and a non-empty `limits` ("an entry with an empty limits field
//             is not finished"); every alternative has a label and a status; every evidence row has a label and a value.
//   GUIDE     unique id; a title, a summary and `limits`; `methods` ids exist.
//   FINDINGS  unique id; a title, a claim and a page.
//   ALL       CONFIG.VERSION equals the newest CHANGES version (a pipeline test says the same).
//
// WARNINGS (listed, never fail): a verdict or status that is not one of the six the chip system styles (it still renders, as a
// plain chip; the history is not rewritten to fit); a CHANGES entry from v4.18 on with no `measured` or no `gates`; a measured value or evidence row
// with no digit in it ("evidence carries numbers, not adjectives"); a word of 60 or more characters with no break in it (the
// reader wraps them, but a path that long is a sign the sentence should be rewritten); two entries with the same title.
//
//   node tools/registry-check.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = vm.createContext({
  document: { readyState: "complete", addEventListener() {}, documentElement: { getAttribute: () => "dark", setAttribute() {} } },
  window: { addEventListener() {} }, console,
});
const src = ["config.js", "ui.js", "methods.js", "changes.js", "findings.js", "guide.js"]
  .map(f => fs.readFileSync(path.join(ROOT, "js", f), "utf8")).join("\n;\n")
  + "\n;globalThis.__R = { CONFIG, METHODS, METHOD_GROUPS, CHANGES, GUIDE, FINDINGS, STATUS_CHIP_LABEL };";
vm.runInContext(src, ctx);
const { CONFIG, METHODS, METHOD_GROUPS, CHANGES, GUIDE, STATUS_CHIP_LABEL } = ctx.__R;
const FINDINGS = Object.values(ctx.__R.FINDINGS);

const fails = [], warns = [];
const fail = (where, msg) => fails.push(`${where}: ${msg}`);
const warn = (where, msg) => warns.push(`${where}: ${msg}`);
const text = v => typeof v === "string" && v.trim().length > 0;
const methodIds = new Set(METHODS.map(m => m.id));
const statuses = new Set(Object.keys(STATUS_CHIP_LABEL));
const versionKey = v => (String(v).match(/\d+/g) || []).map(Number);

function unique(list, label) {
  const seen = new Set();
  for (const e of list) { if (seen.has(e.id)) fail(label, `duplicate id ${e.id}`); seen.add(e.id); }
}

// A word of 60+ characters with no break, in any string of an entry (walks the object).
function longWords(where, v, depth = 0) {
  if (depth > 6 || v == null) return;
  if (typeof v === "string") {
    for (const w of v.split(/\s+/)) if (w.length >= 60 && !/^https?:/.test(w)) warn(where, `a ${w.length}-character word: ${w.slice(0, 40)}…`);
  } else if (Array.isArray(v)) v.forEach((x, i) => longWords(`${where}[${i}]`, x, depth + 1));
  else if (typeof v === "object") for (const [k, x] of Object.entries(v)) if (typeof x !== "function") longWords(`${where}.${k}`, x, depth + 1);
}

// ── CHANGES ──
unique(CHANGES, "CHANGES");
for (const c of CHANGES) {
  const w = `CHANGES ${c.id}`;
  if (!text(c.version)) fail(w, "no version");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || "")) fail(w, `date "${c.date}" is not ISO`);
  if (!text(c.summary)) fail(w, "no summary");
  if (!Array.isArray(c.tried) || !c.tried.length) fail(w, "`tried` is empty: every entry names something that did not work (REQUIRED)");
  if (!text(c.unfixed)) fail(w, "`unfixed` is empty (REQUIRED, never empty)");
  (c.did || []).forEach((d, i) => { if (!text(d.what) || !text(d.why)) fail(`${w}.did[${i}]`, "needs what and why"); });
  (c.tried || []).forEach((t, i) => {
    if (!text(t.what) || !text(t.result)) fail(`${w}.tried[${i}]`, "needs what and result");
    if (!text(t.verdict)) fail(`${w}.tried[${i}]`, "no verdict");
    else if (!statuses.has(t.verdict)) warn(`${w}.tried[${i}]`, `verdict "${t.verdict}" is not one of the chip statuses (${[...statuses].join(", ")}): it shows as a plain chip`);
  });
  (c.measured || []).forEach((m, i) => {
    if (!text(m.label) || !text(m.before) || !text(m.after)) fail(`${w}.measured[${i}]`, "needs a label and both values");
    else if (!/\d/.test(m.before + m.after)) warn(`${w}.measured[${i}]`, `no number in "${m.label}"`);
  });
  (c.gates || []).forEach((g, i) => { if (!text(g.check) || !text(g.result)) fail(`${w}.gates[${i}]`, "needs a check and a result"); });
  for (const id of c.methods || []) if (!methodIds.has(id)) fail(w, `methods id "${id}" is not in METHODS`);
  const [maj, min] = versionKey(c.version);
  if (maj > 4 || (maj === 4 && min >= 18)) {
    if (!(c.measured || []).length) warn(w, "no `measured` (from v4.18 on every entry should carry a number)");
    if (!(c.gates || []).length) warn(w, "no `gates`");
  }
  longWords(w, c);
}
const titles = new Map();
for (const c of CHANGES) { if (titles.has(c.title)) warn(`CHANGES ${c.id}`, `same title as ${titles.get(c.title)}`); titles.set(c.title, c.id); }

// ── METHODS ──
unique(METHODS, "METHODS");
const groups = new Set(METHOD_GROUPS.map(g => g.id));
for (const m of METHODS) {
  const w = `METHODS ${m.id}`;
  if (!groups.has(m.group)) fail(w, `group "${m.group}" does not exist`);
  if (!text(m.title)) fail(w, "no title");
  if (!text(m.summary)) fail(w, "no summary");
  if (!text(m.limits)) fail(w, "`limits` is empty: an entry that says nothing about what it cannot support is not finished");
  (m.alternatives || []).forEach((a, i) => {
    if (!text(a.label)) fail(`${w}.alternatives[${i}]`, "no label");
    if (!text(a.status)) fail(`${w}.alternatives[${i}]`, "no status");
    else if (!statuses.has(a.status)) warn(`${w}.alternatives[${i}]`, `status "${a.status}" is not one of the chip statuses: it shows as a plain chip`);
  });
  (m.evidence || []).forEach((e, i) => {
    if (!text(e.label) || !text(e.value)) fail(`${w}.evidence[${i}]`, "needs a label and a value");
    else if (!/\d/.test(e.value)) warn(`${w}.evidence[${i}]`, `no number in "${e.label}"`);
  });
  longWords(w, m);
}

// ── GUIDE and FINDINGS ──
unique(GUIDE, "GUIDE");
for (const g of GUIDE) {
  const w = `GUIDE ${g.id}`;
  if (!text(g.title)) fail(w, "no title");
  if (!text(g.summary) && typeof g.render !== "function") fail(w, "no summary");
  if (!text(g.limits)) fail(w, "no limits");
  for (const id of g.methods || []) if (!methodIds.has(id)) fail(w, `methods id "${id}" is not in METHODS`);
  longWords(w, g);
}
unique(FINDINGS, "FINDINGS");
for (const f of FINDINGS) {
  const w = `FINDINGS ${f.id}`;
  if (!text(f.title) || !text(f.claim) || !text(f.page)) fail(w, "needs a title, a claim and a page");
  else if (!fs.existsSync(path.join(ROOT, f.page))) fail(w, `its old address ${f.page} is not a file (old links to it break)`);
}

// ── the version ──
const newest = [...CHANGES].sort((a, b) => String(b.date).localeCompare(String(a.date)) || (versionKey(b.version) < versionKey(a.version) ? -1 : 1))[0];
if (CONFIG.VERSION !== newest.version) fail("CONFIG.VERSION", `${CONFIG.VERSION} is not the newest Build Log version ${newest.version}`);

const counts = `${CHANGES.length} CHANGES, ${METHODS.length} METHODS, ${GUIDE.length} GUIDE, ${FINDINGS.length} FINDINGS`;
if (warns.length) console.log(`warnings (${warns.length}):\n  ${warns.join("\n  ")}\n`);
console.log(fails.length ? `${fails.length} failure(s) in ${counts}:\n  ${fails.join("\n  ")}` : `registries hold their contracts: ${counts}; ${warns.length} warning(s)`);
process.exit(fails.length);
