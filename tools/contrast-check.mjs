// tools/contrast-check.mjs — enforces the v3.1 readability floors.
//
//   node tools/contrast-check.mjs
//
// Parses the token blocks in css/styles.css (dark :root + [data-theme="light"])
// and the domain palettes in js/config.js, computes WCAG 2.x contrast ratios,
// and exits 1 with a failure table if any floor is broken:
//
//   text        ≥ 7.0 on every surface
//   text-muted  ≥ 4.5 on every surface
//   border      ≥ 1.8 vs surface and bg
//   border-strong ≥ 3.0 vs surface and bg
//   voice       ≥ 4.5 on bg and surface
//   data colors (positive/negative/info/projected) ≥ 4.5 on surface
//   rating-ramp fills: ≥ 3.0 vs their luminance-guarded text color,
//                      and ≥ 4.5 as text on surface (they're used both ways)
//   position colors:   ≥ 3.0 vs their luminance-guarded text color (fill use)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── Color math ──────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
}
function channelLum(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(channelLum);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
// Mirrors ratingTextColor() in config.js (perceived-luminance guard)
function guardText(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#111111" : "#ffffff";
}

// ── Parse CSS token blocks ──────────────────────────────────────────────────
const css = readFileSync(join(root, "css", "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function collectTokens(selectorRe) {
  const tokens = {};
  const blockRe = new RegExp(`${selectorRe}\\s*\\{([^}]*)\\}`, "g");
  for (const m of css.matchAll(blockRe)) {
    for (const decl of m[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      tokens[decl[1]] = decl[2].trim();
    }
  }
  return tokens;
}

const darkRaw = collectTokens(":root");
const lightRaw = { ...darkRaw, ...collectTokens(`\\[data-theme="light"\\]`) };

// Resolve var() references (two passes is plenty for our depth-1 aliases)
function resolve(tokens) {
  const out = { ...tokens };
  for (let pass = 0; pass < 2; pass++) {
    for (const [k, v] of Object.entries(out)) {
      out[k] = v.replace(/var\(--([\w-]+)\)/g, (_, name) => out[name] ?? `var(--${name})`);
    }
  }
  return out;
}
const themes = { dark: resolve(darkRaw), light: resolve(lightRaw) };

// ── Load config palettes via vm ─────────────────────────────────────────────
const configSrc = readFileSync(join(root, "js", "config.js"), "utf8") +
  "\n; globalThis.__CFG = CONFIG;";
const sandbox = {
  document: {
    readyState: "complete",
    addEventListener() {},
    documentElement: { getAttribute: () => null, setAttribute() {} },
  },
  window: {},
  console,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(configSrc, sandbox);
const CFG = sandbox.__CFG;

// ── Checks ──────────────────────────────────────────────────────────────────
const failures = [];
function check(theme, label, fg, bg, floor) {
  if (!/^#[0-9a-fA-F]{3,6}$/.test(fg) || !/^#[0-9a-fA-F]{3,6}$/.test(bg)) {
    failures.push([theme, label, `non-hex pair (${fg} / ${bg})`, `≥${floor}`]);
    return;
  }
  const ratio = contrast(fg, bg);
  if (ratio < floor) {
    failures.push([theme, label, ratio.toFixed(2), `≥${floor}`]);
  }
}

for (const [themeName, t] of Object.entries(themes)) {
  const surfaces = ["bg", "surface", "surface-deep", "surface-lift"];
  for (const s of surfaces) {
    check(themeName, `text on --${s}`, t["text"], t[s], 7.0);
    check(themeName, `text-muted on --${s}`, t["text-muted"], t[s], 4.5);
  }
  for (const s of ["surface", "bg"]) {
    check(themeName, `border vs --${s}`, t["border"], t[s], 1.8);
    check(themeName, `border-strong vs --${s}`, t["border-strong"], t[s], 3.0);
  }
  check(themeName, "voice on --bg", t["voice"], t["bg"], 4.5);
  check(themeName, "voice on --surface", t["voice"], t["surface"], 4.5);
  for (const dc of ["positive", "negative", "info", "projected"]) {
    check(themeName, `${dc} on --surface`, t[dc], t["surface"], 4.5);
  }

  // Domain palettes from config.js
  for (const [min, fill] of CFG.RATING_RAMP[themeName]) {
    check(themeName, `ramp[${min}] fill vs guarded text`, guardText(fill), fill, 3.0);
    check(themeName, `ramp[${min}] as text on --surface`, fill, t["surface"], 4.5);
  }
  for (const [pos, fill] of Object.entries(CFG.POS_COLORS[themeName])) {
    check(themeName, `pos ${pos} fill vs guarded text`, guardText(fill), fill, 3.0);
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error("CONTRAST FLOOR FAILURES\n");
  console.error("theme  | pair                                | ratio | floor");
  console.error("-------|-------------------------------------|-------|------");
  for (const [theme, label, ratio, floor] of failures) {
    console.error(`${theme.padEnd(6)} | ${label.padEnd(35)} | ${String(ratio).padEnd(5)} | ${floor}`);
  }
  console.error(`\n${failures.length} failure(s).`);
  process.exit(1);
}
console.log("contrast-check: all floors green (dark + light, tokens + domain palettes).");
