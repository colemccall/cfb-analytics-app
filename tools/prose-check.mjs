// prose-check.mjs — every registry prose field must render without stray markup.
//
// prose() (ui.js) supports **bold** and `code` only within ONE line; a span split
// across a line break renders as literal asterisks on the live page. This runs
// each registry's long-form fields through the real prose() and fails on any
// leftover ** or unpaired backtick.
//
//   node tools/prose-check.mjs        exit code = number of bad fields
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = vm.createContext({
  document: { readyState: "complete", addEventListener() {}, documentElement: { getAttribute: () => "dark", setAttribute() {} } },
  window: { addEventListener() {} }, console,
});
// Registries are loaded as the browser loads them: script files sharing one scope.
const src = ["config.js", "ui.js", "methods.js", "changes.js", "findings.js", "guide.js"]
  .map(f => fs.readFileSync(path.join(ROOT, "js", f), "utf8")).join("\n;\n")
  + "\n;globalThis.__R = { prose, METHODS, CHANGES, GUIDE, FINDINGS };";
vm.runInContext(src, ctx);
const { prose, METHODS, CHANGES, GUIDE, FINDINGS } = ctx.__R;

const bad = [];
const check = (where, text) => {
  if (typeof text !== "string") return;
  const html = prose(text);
  if (html.includes("**") || (html.match(/`/g) || []).length % 2) bad.push(where);
};
for (const m of METHODS) for (const k of ["summary", "why", "limits"]) check(`METHODS ${m.id}.${k}`, m[k]);
for (const c of CHANGES) {
  for (const k of ["summary", "motivation", "unfixed"]) check(`CHANGES ${c.id}.${k}`, c[k]);
  (c.did || []).forEach((d, i) => check(`CHANGES ${c.id}.did[${i}].why`, d.why));
  (c.tried || []).forEach((t, i) => check(`CHANGES ${c.id}.tried[${i}].result`, t.result));
}
for (const g of GUIDE) for (const k of ["summary", "limits"]) check(`GUIDE ${g.id}.${k}`, g[k]);

console.log(bad.length ? `stray markup in:\n  ${bad.join("\n  ")}` : "all registry prose renders clean");
process.exit(bad.length);
