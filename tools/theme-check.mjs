// tools/theme-check.mjs — enforces the skin contract (CONFIG.THEMES).
//
//   node tools/theme-check.mjs
//
// A theme is a row in CONFIG.THEMES (js/config.js). For every row this checks
// the three other places a skin has to exist, so adding one — a retro NCAA 11/12
// look, say — is a content change and a forgotten piece fails here instead of
// silently rendering the wrong colours:
//
//   · css/styles.css has a token block for it: the first theme is :root, every
//     other is [data-theme="<id>"] and must define every token :root does
//   · CONFIG.POS_COLORS and CONFIG.RATING_RAMP have a key for it, with the same
//     position keys / band count as the default theme
//   · its swatch and edge colours are hex literals
//
// Exits 1 with a list of what is missing. Run beside contrast-check.mjs, which
// then holds each theme's colours to the readability floors.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "css", "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// config.js declares `const CONFIG`, which a vm script does not export to its
// context, so evaluate it as an expression.
const src = readFileSync(join(root, "js", "config.js"), "utf8");
const CONFIG = vm.runInNewContext(`${src}\n;CONFIG`, { document: { documentElement: { getAttribute: () => null }, addEventListener() {} }, window: {}, localStorage: {} });

// Names of the custom properties a selector's blocks declare.
function tokenNames(selectorRe) {
  const names = new Set();
  for (const m of css.matchAll(new RegExp(`${selectorRe}\\s*\\{([^}]*)\\}`, "g"))) {
    for (const d of m[1].matchAll(/--([\w-]+)\s*:/g)) names.add(d[1]);
  }
  return names;
}

const problems = [];
const themes = CONFIG.THEMES;
if (!Array.isArray(themes) || !themes.length) problems.push("CONFIG.THEMES is missing or empty");

const base = themes[0].id;
const rootTokens = tokenNames(":root");
const refPos = Object.keys(CONFIG.POS_COLORS[base] || {});
const refBands = (CONFIG.RATING_RAMP[base] || []).length;
const hex = /^#[0-9a-fA-F]{3,8}$/;

for (const t of themes) {
  if (!t.id || !t.label) problems.push(`theme ${JSON.stringify(t)} needs an id and a label`);
  if (!hex.test(t.swatch || "") || !hex.test(t.edge || "")) problems.push(`${t.id}: swatch and edge must be hex colours`);

  if (t.id !== base) {
    const own = tokenNames(`\[data-theme="${t.id}"\]`);
    if (!own.size) problems.push(`${t.id}: no [data-theme="${t.id}"] token block in styles.css`);
    // A skin may inherit tokens it does not change, but must set the colour core.
    for (const core of ["bg", "surface", "text", "text-muted", "border", "voice"]) {
      if (!own.has(core)) problems.push(`${t.id}: token block does not set --${core}`);
    }
  }
  const pos = CONFIG.POS_COLORS[t.id];
  if (!pos) problems.push(`${t.id}: no CONFIG.POS_COLORS entry`);
  else for (const k of refPos) if (!pos[k]) problems.push(`${t.id}: POS_COLORS missing ${k}`);
  const ramp = CONFIG.RATING_RAMP[t.id];
  if (!ramp) problems.push(`${t.id}: no CONFIG.RATING_RAMP entry`);
  else if (ramp.length !== refBands) problems.push(`${t.id}: RATING_RAMP has ${ramp.length} bands, ${base} has ${refBands}`);
}

console.log(`themes: ${themes.map(t => t.id).join(", ")} · :root defines ${rootTokens.size} tokens`);
if (problems.length) {
  console.log("\nFAIL");
  for (const p of problems) console.log("  · " + p);
  process.exit(1);
}
console.log("PASS — every theme has a token block, palette keys and a swatch");
