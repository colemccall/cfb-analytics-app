// doc-check.mjs — the app half of the documentation rule (CODING_STANDARDS.md §2).
//
// Every top-level function in js/ longer than five lines carries a comment block
// directly above it: what it renders or returns, what it reads, and any rule it
// exists to enforce. Nested helpers are exempt. Registries (methods.js,
// changes.js, findings.js) are content, not code, and are checked only for
// their functions.
//
//   node tools/doc-check.mjs          exit code = number of undocumented functions
//
// Deliberately a regex scan, not a parser: the codebase has no build step and
// this must run on a bare `node` like `node --check` does.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAX_UNDOCUMENTED_LINES = 5;
const missing = [];
let total = 0;

for (const f of fs.readdirSync(path.join(ROOT, "js")).filter(n => n.endsWith(".js")).sort()) {
  const lines = fs.readFileSync(path.join(ROOT, "js", f), "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = line.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (!m) return;
    // Brace-count to the function's end. Template-literal ${} pairs balance, so
    // this is exact for this codebase's style without a parser.
    let depth = 0, end = i, opened = false;
    for (; end < lines.length; end++) {
      for (const ch of lines[end]) {
        if (ch === "{") { depth++; opened = true; } else if (ch === "}") depth--;
      }
      if (opened && depth <= 0) break;
    }
    if (end - i + 1 <= MAX_UNDOCUMENTED_LINES) return;
    total++;
    const prev = (lines[i - 1] || "").trim();
    if (!/^(\/\/|\*|\/\*)/.test(prev)) missing.push(`js/${f}:${i + 1} ${m[1]} (${end - i + 1} lines)`);
  });
}

console.log(`${total - missing.length}/${total} functions over ${MAX_UNDOCUMENTED_LINES} lines documented`);
if (missing.length) console.log("undocumented:\n  " + missing.join("\n  "));
process.exit(missing.length);
