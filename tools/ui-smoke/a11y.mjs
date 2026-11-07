// a11y.mjs — measures what the menu actually renders against the readability rules: WCAG 2.2 AA text contrast, the
// project's 12px floor, target size, and controls or images with no name. Dev-only and report-only (exit 0): it is a
// measurement to fix from, not a gate (a gate would ship in its own release, CLAUDE.md §3).
//
// Why a second contrast tool: tools/contrast-check.mjs checks the token PAIRS the stylesheets name. That cannot see what a
// page composes: a token over a translucent panel over a gradient, text faded by opacity, a team colour behind a label, a
// muted token used on a surface it was never paired with. This one reads the computed style of every visible text element
// in a real browser, composites its background layers (alpha, opacity, a gradient's stops), and scores the result.
//
//   cd tools/ui-smoke && node a11y.mjs                     every route, dark and light, 1280px and 375px
//   node a11y.mjs --only=#/home                           one route
//   node a11y.mjs --out=a11y-before.json                  where the full report goes (default a11y-report.json)
//
// What it cannot see: text over a photograph (listed for review, not scored), focus indicators, colour used as the only
// carrier of meaning, and anything a screen reader announces. Contrast over a gradient is scored at the gradient's worst
// stop, which can flag text that sits on the gradient's lighter part.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { chromium } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, "..", "..");
const ARGS = process.argv.slice(2);
const ONLY = (ARGS.find(a => a.startsWith("--only=")) || "").slice(7);
const OUT = (ARGS.find(a => a.startsWith("--out=")) || "--out=a11y-report.json").slice(6);

const ROUTES = ["#/home", "#/team-select", "#/team/52", "#/team/52/ratings", "#/team/52/roster", "#/team/52/depth", "#/team/52/schedule",
  "#/team/52/recruiting", "#/team/52/transfers", "#/team/52/history", "#/standings", "#/rankings", "#/compare", "#/season", "#/playoff",
  "#/players", "#/player/105817/81", "#/player/105817/81/games", "#/player/105817/81/stats", "#/player/105817/81/career", "#/recruiting",
  "#/recruiting/prospects", "#/portal", "#/scatter", "#/methods/power-rating", "#/changes", "#/guide/numbers", "#/research/team-performance"]
  .filter(r => !ONLY || r === ONLY);
const MODES = ["dark", "light"];
const WIDTHS = [[1280, 800], [375, 740]];

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };

// A plain static server, as GitHub Pages is.
function startServer() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(APP_ROOT, rel);
    if (!file.startsWith(APP_ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// Runs inside the page: every finding on the current screen, grouped by component signature so that a hundred rows of
// one class count as one problem with a count.
function auditPage() {
  // rgb()/rgba() and the color(srgb r g b / a) form that color-mix() computes to
  const parse = s => {
    if (!s) return null;
    let m = s.match(/color\(srgb ([^)]+)\)/);
    if (m) {
      const [rgb, alpha] = m[1].split("/");
      const p = rgb.trim().split(/\s+/).map(Number);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: alpha === undefined ? 1 : Number(alpha) };
    }
    m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const ratio = (x, y) => { const a = lum(x), b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const hex = c => "#" + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
  const sig = el => {
    const cls = [...el.classList].filter(c => !/^is-|^animate/.test(c)).slice(0, 3).join(".");
    const par = el.parentElement ? [...el.parentElement.classList].filter(c => !/^is-|^animate/.test(c)).slice(0, 2).join(".") : "";
    return `${par ? "." + par + " > " : ""}${el.tagName.toLowerCase()}${cls ? "." + cls : ""}`;
  };
  const visible = (el, cs) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const opacity = el => { let o = 1; for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o; };
  // What is painted behind an element's text, walked the way the browser paints: from the root down to the element, each
  // element's background colour over what is below it, then its gradient's stops over that. Only the lightest and darkest
  // results are kept, so a gradient is scored at its worst real stop. A photograph (a url() background) makes the ground
  // unknown until an opaque layer above it covers it again.
  const extremes = cs => { const byL = cs.slice().sort((x, y) => lum(x) - lum(y)); return byL.length > 1 ? [byL[0], byL[byL.length - 1]] : byL; };
  // split a background-image list at its top-level commas (commas inside a gradient's parentheses stay)
  const layersOf = bi => {
    const out = []; let depth = 0, cur = "";
    for (const ch of bi) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const ground = el => {
    const chain = [];
    for (let n = el; n; n = n.parentElement) chain.unshift(n);
    let colors = [{ r: 255, g: 255, b: 255, a: 1 }], kind = "solid", owner = null;
    for (const n of chain) {
      const cs = getComputedStyle(n);
      const bgc = parse(cs.backgroundColor);
      if (bgc && bgc.a > 0) {
        colors = colors.map(c => over(bgc, c));
        if (bgc.a >= 0.999) { kind = "solid"; owner = n; }
      }
      const bi = cs.backgroundImage;
      if (bi && bi !== "none") {
        // background layers are listed top first: paint the bottom one first
        for (const layer of layersOf(bi).reverse()) {
          if (layer.includes("url(")) { kind = "image"; continue; }
          const stops = [...layer.matchAll(/(?:rgba?\(|color\(srgb )[^)]+\)/g)].map(m => parse(m[0])).filter(Boolean);
          if (!stops.length) continue;
          const next = [];
          for (const st of stops) for (const c of colors) next.push(over(st, c));
          colors = extremes(next);
          if (kind !== "image" || stops.every(st => st.a >= 0.999)) kind = "gradient";
          if (stops.every(st => st.a >= 0.999)) owner = n;
        }
      }
    }
    return { kind, colors, owner };
  };
  // Photographs (the backdrop slides are divs with a url() background; an <img> counts too): large, visible image layers. Text whose last opaque ground CONTAINS such an image that
  // overlaps it has the photo painted between the ground and the text, so its contrast cannot be scored from styles.
  const photos = [...document.querySelectorAll("#menu-root *")].filter(im => {
    const r = im.getBoundingClientRect();
    if (r.width * r.height < 40000) return false;
    const cs = getComputedStyle(im);
    return (im.tagName === "IMG" || cs.backgroundImage.includes("url(")) && Number(cs.opacity) > 0.05 && cs.display !== "none";
  });
  const overPhoto = (el, owner) => {
    const r = el.getBoundingClientRect();
    return photos.some(im => {
      const q = im.getBoundingClientRect();
      const hit = r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top;
      return hit && (!owner || owner.contains(im)) && !im.contains(el);
    });
  };

  const found = { contrast: {}, review: {}, small: {}, twelve: {}, target: {}, unnamed: {}, noalt: {} };
  const add = (bucket, key, row) => { const b = found[bucket]; if (b[key]) b[key].n += 1; else b[key] = { ...row, n: 1 }; };
  const white = { r: 255, g: 255, b: 255, a: 1 };

  for (const el of document.querySelectorAll("#menu-root *")) {
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (own) {
      const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(" ").slice(0, 40);
      const px = parseFloat(cs.fontSize), wt = parseInt(cs.fontWeight, 10) || 400;
      const large = px >= 24 || (px >= 18.66 && wt >= 700);
      const need = large ? 3 : 4.5;
      const op = opacity(el);
      const fg0 = parse(cs.color);
      const bd = ground(el);
      const key = sig(el);
      if (px < 12) add("small", key, { px, text });
      else if (px < 12.5 && /[a-z]/.test(cs.textTransform === "uppercase" ? text.toUpperCase() : text)) add("twelve", key, { px, text });
      if (fg0 && op > 0.01) {
        if (bd.kind === "image" || overPhoto(el, bd.owner)) {
          const pkey = `${key} | ${hex(fg0)}`;   // one colour per group: a selected row's white rank is not a grey rank
          add("review", pkey, { text, why: "text over a photograph", fg: hex(fg0), px, wt, need });
          el.setAttribute("data-a11y-photo", pkey);
        }
        else {
          const grounds = bd.colors;
          let worst = null;
          for (const g of grounds) {
            const fg = over({ ...fg0, a: fg0.a * op }, g);
            const r = ratio(fg, g);
            if (!worst || r < worst.r) worst = { r, fg: hex(fg), bg: hex(g) };
          }
          if (worst && worst.r < need) add("contrast", `${key} | ${worst.fg} on ${worst.bg}`, { ratio: +worst.r.toFixed(2), need, px, wt, fg: worst.fg, bg: worst.bg, ground: bd.kind, text, opacity: +op.toFixed(2) });
        }
      }
    }
    if (el.matches('a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])')) {
      const r = el.getBoundingClientRect();
      const inline = el.tagName === "A" && cs.display === "inline";
      if (!inline && (r.width < 24 || r.height < 24)) add("target", sig(el), { w: Math.round(r.width), h: Math.round(r.height), text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30) });
      const name = (el.innerText || "").trim() || el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("aria-labelledby")
        || el.querySelector("img[alt]:not([alt=''])") || (el.tagName === "INPUT" && (el.labels?.length || el.placeholder));
      if (!name) add("unnamed", sig(el), { text: el.outerHTML.slice(0, 80) });
    }
    if (el.tagName === "IMG" && !el.hasAttribute("alt")) add("noalt", sig(el), { src: (el.getAttribute("src") || "").slice(-40) });
  }
  return found;
}

// A minimal PNG decoder (8-bit RGB or RGBA, not interlaced: what Chrome's screenshots are), so the photo pass needs no package.
function decodePNG(buf) {
  let pos = 8, width = 0, height = 0, type = 6;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), tag = buf.toString("ascii", pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (tag === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); type = data[9]; }
    else if (tag === "IDAT") idat.push(data);
    else if (tag === "IEND") break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = type === 6 ? 4 : 3, stride = width * bpp, out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], row = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      let v = raw[row + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { width, height, bpp, data: out };
}
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lumOf = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const hexLum = h => lumOf(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));
// Text over a photograph: hide that text, screenshot, and score its colour against the pixels behind its box. The score is the
// contrast against the worst tenth of those pixels (the lightest tenth for light text, the darkest for dark text).
async function measurePhotoText(page) {
  // The pixels behind the text itself: each direct text node's line boxes (a DOM Range), 1px in, so a cell's padding, a row's
  // border or a selected row's inset highlight beside the text is not counted as its ground.
  const boxes = await page.evaluate(() => [...document.querySelectorAll("[data-a11y-photo]")].flatMap(el => {
    const out = [];
    for (const node of el.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.width < 3 || r.height < 3) continue;
        // only text actually on screen there: a row scrolled out of its list is clipped, and whatever is drawn at its
        // coordinates (another panel, the bottom bar) is not its ground
        // (the top, middle and bottom of the line must all be the text's own element: a row cut by a panel's edge is skipped)
        const cx = r.left + r.width / 2;
        const onIt = y => { if (cx < 0 || y < 0 || cx >= innerWidth || y >= innerHeight) return false; const hit = document.elementFromPoint(cx, y); return !!hit && (hit === el || el.contains(hit)); };
        if (!onIt(r.top + 2) || !onIt(r.top + r.height / 2) || !onIt(r.bottom - 2)) continue;
        out.push({ key: el.getAttribute("data-a11y-photo"), x: Math.max(0, Math.floor(r.left) + 1), y: Math.max(0, Math.floor(r.top) + 1),
                   w: Math.ceil(r.width) - 2, h: Math.ceil(r.height) - 2 });
      }
    }
    return out;
  }));
  if (!boxes.length) return {};
  await page.addStyleTag({ content: "#menu-root *{color:transparent!important;text-shadow:none!important;-webkit-text-stroke:0!important}" });
  const png = decodePNG(await page.screenshot());
  const out = {};
  for (const bx of boxes) {
    const lums = [];
    for (let y = bx.y; y < Math.min(png.height, bx.y + bx.h); y++)
      for (let x = bx.x; x < Math.min(png.width, bx.x + bx.w); x++) {
        const i = (y * png.width + x) * png.bpp;
        lums.push(lumOf(png.data[i], png.data[i + 1], png.data[i + 2]));
      }
    if (!lums.length) continue;
    lums.sort((a, b) => a - b);
    const q = f => lums[Math.min(lums.length - 1, Math.floor(f * lums.length))];
    if (!out[bx.key]) out[bx.key] = [];
    out[bx.key].push({ p10: q(0.1), p50: q(0.5), p90: q(0.9) });
  }
  return out;
}

const server = await startServer();
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = { generated_at: new Date().toISOString(), routes: ROUTES.length, views: [], totals: {} };
const merged = {};
for (const mode of MODES) {
  for (const [width, height] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height } });
    await ctx.addInitScript(m => { try { localStorage.setItem("cfb-menu-mode", m); } catch (e) { /* default mode */ } }, mode);
    for (const route of ROUTES) {
      const page = await ctx.newPage();
      try {
        await page.goto(`${BASE}/menu.html${route}`, { waitUntil: "networkidle", timeout: 60000 });
        await page.waitForFunction(() => document.querySelector("#m-stage")?.children.length > 0, null, { timeout: 30000 });
        await page.waitForTimeout(700);
        await page.evaluate(() => document.getAnimations().forEach(a => { try { a.finish(); } catch (e) { /* infinite */ } }));
        const found = await page.evaluate(auditPage);
        const photo = await measurePhotoText(page);
        for (const [key, row] of Object.entries(found.review)) {
          const m = photo[key];
          if (!m) continue;
          const fl = hexLum(row.fg), light = fl > 0.18;
          const worstBg = light ? Math.max(...m.map(v => v.p90)) : Math.min(...m.map(v => v.p10));
          const midBg = m.map(v => v.p50).reduce((s2, v) => s2 + v, 0) / m.length;
          const rat = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          row.ratio = +rat(fl, worstBg).toFixed(2);
          row.median_ratio = +rat(fl, midBg).toFixed(2);
        }
        const counts = Object.fromEntries(Object.entries(found).map(([k, v]) => [k, Object.keys(v).length]));
        report.views.push({ route, mode, width, counts });
        for (const [bucket, rows] of Object.entries(found)) {
          for (const [key, row] of Object.entries(rows)) {
            const k = `${bucket} || ${key}`;
            if (!merged[k]) merged[k] = { bucket, key, ...row, n: 0, where: [] };
            merged[k].n += row.n;
            if (merged[k].where.length < 6) merged[k].where.push(`${route} ${mode} ${width}`);
          }
        }
      } catch (err) {
        report.views.push({ route, mode, width, error: String(err).slice(0, 160) });
      }
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
server.close();

const rows = Object.values(merged);
for (const b of ["contrast", "review", "small", "twelve", "target", "unnamed", "noalt"]) {
  const r = rows.filter(x => x.bucket === b);
  report.totals[b] = { distinct: r.length, elements: r.reduce((s, x) => s + x.n, 0) };
}
report.findings = rows.sort((a, b) => (a.bucket > b.bucket ? 1 : a.bucket < b.bucket ? -1 : (a.ratio ?? 99) - (b.ratio ?? 99) || b.n - a.n));
fs.writeFileSync(path.join(HERE, OUT), JSON.stringify(report, null, 1));

const LABEL = { contrast: "text below WCAG AA contrast", review: "text over a photograph (not scored)", small: "text under 12px",
  twelve: "12px text with lowercase letters", target: "targets under 24 x 24 px", unnamed: "controls with no name", noalt: "images with no alt" };
console.log(`a11y: ${ROUTES.length} routes x ${MODES.length} modes x ${WIDTHS.length} widths; errors in ${report.views.filter(v => v.error).length} views`);
for (const [b, t] of Object.entries(report.totals)) console.log(`  ${LABEL[b].padEnd(44)} ${String(t.distinct).padStart(4)} distinct, ${t.elements} elements`);
console.log(`\nworst contrast (distinct component + colours):`);
for (const f of report.findings.filter(x => x.bucket === "contrast").slice(0, 25))
  console.log(`  ${String(f.ratio).padStart(5)} < ${f.need}  ${f.fg} on ${f.bg} (${f.ground}, ${f.px}px/${f.wt}${f.opacity < 1 ? `, opacity ${f.opacity}` : ""})  x${f.n}  ${f.key.split(" | ")[0]}  "${f.text}"  [${f.where[0]}]`);
console.log(`\ntext over the photograph (scored from pixels: worst tenth / median; - = outside the screenshot):`);
for (const f of report.findings.filter(x => x.bucket === "review").sort((a, b) => (a.ratio ?? 99) - (b.ratio ?? 99)).slice(0, 15))
  console.log(`  ${String(f.ratio ?? "-").padStart(5)} / ${String(f.median_ratio ?? "-").padStart(5)} need ${f.need}  ${f.fg} ${f.px}px/${f.wt}  x${f.n}  ${f.key}  "${f.text}"  [${f.where[0]}]`);
console.log(`\nfull report: tools/ui-smoke/${OUT}`);
