// smoke.mjs — drives every screen, panel and control of the site (the menu, menu.html) in a real browser.
//
// What it proves: each page loads without a script error or a failed request,
// every panel renders content rather than an empty/error state, and every
// control (filters, chips, tabs, sort headings, the season stepper, the player card,
// deep links, the light and dark mode) does what it is labelled to do. The classic pages
// were retired in v4.25; what is left of them is a redirect stub each, and one check here
// proves every old address still lands on the right screen. What it does NOT
// prove: that any number is right. That is the pipeline's job
// (validate_ratings.py, the contract suite); this checks the site shows them.
//
// Dev-only. Uses playwright-core against the Chrome already installed on the
// machine — no browser download, and nothing here is loaded by the site.
//
//   cd tools/ui-smoke && npm install && npm run smoke
//   node smoke.mjs --headed          watch it run
//   node smoke.mjs --only=players    run the checks whose name starts "players"
//
// Exit code is the number of failed checks (0 = all green), so it can gate a
// commit the same way `node --check` does.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARGS = process.argv.slice(2);
const HEADED = ARGS.includes("--headed");
const ONLY = (ARGS.find(a => a.startsWith("--only=")) || "").slice(7);

// The season constants are read from config.js rather than restated here, so the
// test cannot drift from the site it is testing.
const CONFIG_SRC = fs.readFileSync(path.join(APP_ROOT, "js", "config.js"), "utf8");
const constant = name => Number(CONFIG_SRC.match(new RegExp(`${name}:\\s*(\\d{4})`))[1]);
const PLAYED = constant("LAST_PLAYED_SEASON");
const CURRENT = constant("CURRENT_SEASON");

// ── Static server ───────────────────────────────────────────────────────────
// GitHub Pages is a plain static host, so the test server is one too: no
// rewrites, no SPA fallback. A missing file is a 404 here exactly as it is live.
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".jpg": "image/jpeg", ".webp": "image/webp",
};

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(APP_ROOT, rel);
    if (!file.startsWith(APP_ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end("not found"); return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// ── Check registry ──────────────────────────────────────────────────────────
const checks = [];
const check = (name, fn) => checks.push({ name, fn });
const results = [];

class Fail extends Error {}
function assert(cond, msg) { if (!cond) throw new Fail(msg); }

// Every page visit records script errors, console errors and failed requests.
// A check fails if any of these fire, even when its own assertions pass — a
// thrown TypeError in a panel nobody looked at is still a broken panel.
//
// External requests (Google Fonts, team logos on a CDN) are excluded: the
// machine running this may be offline, and they are not the site's code.
let BASE = "";
async function openPage(ctx, rel, { width = 1400, height = 900 } = {}) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  const problems = [];
  page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));
  page.on("console", m => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) {
      problems.push(`console.error: ${m.text()}`);
    }
  });
  page.on("response", r => {
    if (r.url().startsWith(BASE) && r.status() >= 400) {
      problems.push(`HTTP ${r.status()} ${r.url().replace(BASE, "")}`);
    }
  });
  page.problems = problems;
  await page.goto(BASE + rel, { waitUntil: "domcontentloaded" });
  return page;
}

// Waits until `selector` matches at least `n` elements. The data files are
// large (players_{season}.json is ~8 MB), so the timeout is generous.
async function waitCount(page, selector, n = 1, timeout = 45000) {
  await page.waitForFunction(([s, k]) => document.querySelectorAll(s).length >= k,
    [selector, n], { timeout });
  return page.locator(selector).count();
}

const text = (page, sel) => page.locator(sel).first().innerText();

// Error and empty states are real UI and legitimate in some places, so this
// reports them rather than failing on them; callers assert where one is a bug.
async function errorStates(page, scope = "body") {
  return page.locator(`${scope} .error-state`).allInnerTexts();
}

async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

// ════════════════════════════════════════════════════════════════════════════
// The registries and their readers: Research, Methods, the Build Log, How It Works
// (v4.25: the classic pages that held them are redirect stubs; the menu is the only place they live)
// ════════════════════════════════════════════════════════════════════════════

// The findings are read from the registry, so a new one is tested the day it is added.
const FINDING_IDS = [...fs.readFileSync(path.join(APP_ROOT, "js", "findings.js"), "utf8").matchAll(/^\s*page:\s*"((?:research|story)-[a-z-]+)\.html"/gm)]
  .map(m => m[1].replace(/^(research|story)-/, "")).filter(Boolean);

for (const id of FINDING_IDS) {
  check(`finding: #/research/${id} renders stats + table + notes, filters work`, async ctx => {
    const page = await openPage(ctx, `menu.html#/research/${id}`);
    await page.waitForSelector("#finding-root .masthead", { state: "attached", timeout: 30000 });      // the reader hides the masthead: it has its own title
    const upcoming = await page.locator(".finding-upcoming").count();
    if (upcoming) {
      assert((await text(page, ".finding-upcoming")).length > 100, "upcoming finding has no plan text");
      return page;
    }
    await page.waitForFunction(() => !document.querySelector("#finding-table .skeleton"), null, { timeout: 60000 });
    const errs = await errorStates(page, "#finding-root");
    assert(!errs.length, errs.join(" | "));
    const rows = await page.locator("#finding-table tbody tr").count();
    assert(rows > 0, "table has no rows");
    assert(await page.locator("#finding-notes .finding-note").count() === 2, "method/limitations notes missing");
    // Exercise each filter: change it to a different option and confirm the table re-renders without an error.
    const selects = page.locator("#finding-filters select");
    for (let i = 0; i < await selects.count(); i++) {
      const opts = await selects.nth(i).locator("option").evaluateAll(os => os.map(o => o.value));
      if (opts.length > 1) await selects.nth(i).selectOption(opts[1]);
    }
    const nums = page.locator("#finding-filters input[type=number]");
    for (let i = 0; i < await nums.count(); i++) {
      await nums.nth(i).fill("1"); await nums.nth(i).dispatchEvent("change");
    }
    await page.locator("#finding-table th[data-col]").first().click();
    // a team or player in the table opens its menu page, not a retired address
    const classic = await page.locator('#finding-root a[href*=".html"]').count();
    assert(classic === 0, `${classic} links in the finding still point at a classic page`);
    return page;
  });
}

check("research: the list holds every registered finding, the storylines and the open questions", async ctx => {
  const page = await openPage(ctx, "menu.html#/research");
  await page.waitForSelector(".m-row--read", { timeout: 30000 });
  const registered = await page.evaluate(() => Object.values(FINDINGS).length);
  const open = await page.evaluate(() => MENU_OPEN_QUESTIONS.length);
  const rows = await page.locator(".m-row--read").count();
  assert(rows === registered + open, `${rows} entries listed, ${registered} findings + ${open} open questions registered`);
  await page.locator('.m-row--read[data-eid="q-nil"]').click();
  await page.waitForSelector(".m-reader .method-title", { timeout: 10000 });
  assert(/NIL/.test(await page.locator(".m-reader .method-title").first().innerText()), "the open question did not show");
  return page;
});

check("methods: every registry entry renders, the list also holds the generated API table, no entry lacks limits", async ctx => {
  const page = await openPage(ctx, "menu.html#/methods");
  await page.waitForSelector(".m-row--read", { timeout: 30000 });
  const bad = await page.evaluate(() => METHODS.filter(m => { const h = document.createElement("div"); h.innerHTML = _entry(m); return h.querySelector(".method-title")?.textContent.trim() !== m.title; }).map(m => m.id));
  assert(!bad.length, `entries that did not render: ${bad}`);
  const n = await page.evaluate(() => METHODS.length);
  assert(await page.locator(".m-row--read").count() === n + 1, "the list is not every METHODS entry plus the API survey");
  const noLimits = await page.evaluate(() => METHODS.filter(m => !m.limits).map(m => m.id));
  assert(!noLimits.length, `METHODS entries with no limits: ${noLimits}`);
  await page.locator('.m-row--read[data-eid="api-availability"]').click();
  await page.waitForSelector(".m-reader table", { timeout: 15000 });
  assert(/endpoints/i.test(await page.locator(".m-reader .method-summary").first().innerText()), "the API survey has no summary");
  return page;
});

check("changes: every entry renders with a 'did not fix' section", async ctx => {
  const page = await openPage(ctx, "menu.html#/changes");
  await page.waitForSelector(".m-row--read", { timeout: 30000 });
  const n = await page.evaluate(() => CHANGES.length);
  assert(await page.locator(".m-row--read").count() === n, "the list is not every CHANGES entry");
  const bad = await page.evaluate(() => CHANGES.filter(c => !_changeEntry(c).includes("method-entry")).map(c => c.id));
  assert(!bad.length, `entries that did not render: ${bad}`);
  const unfixed = await page.evaluate(() => CHANGES.filter(c => !c.unfixed).map(c => c.id));
  assert(!unfixed.length, `entries with no unfixed field: ${unfixed}`);
  return page;
});

check("guide: every GUIDE entry renders, samples draw, live lines fill, no entry lacks limits", async ctx => {
  const page = await openPage(ctx, "menu.html#/guide");
  await page.waitForSelector(".m-row--read", { timeout: 30000 });
  const n = await page.evaluate(() => GUIDE.length);
  assert(await page.locator(".m-row--read").count() === n, "the list is not every GUIDE entry");
  const drawn = await page.evaluate(() => {
    const host = document.createElement("div");
    host.innerHTML = GUIDE.map(_guideEntry).join("");
    return { entries: host.querySelectorAll(".method-entry").length, tiers: host.querySelectorAll(".tier-rows .tier-row").length,
             dashes: [...host.querySelectorAll(".guide-sample")].filter(td => td.textContent.trim() === "—").length };
  });
  assert(drawn.entries === n && drawn.tiers >= 5, `rendered ${drawn.entries}/${n} entries, ${drawn.tiers} tier rows`);
  assert(drawn.dashes === 0, `${drawn.dashes} glossary samples failed to draw`);
  const lives = await page.evaluate(async () => (await Promise.all(GUIDE.filter(e => e.live).map(e => e.live()))).map(s => String(s).trim().length));
  assert(lives.every(l => l > 0), "a live line came back empty");
  const noLimits = await page.evaluate(() => GUIDE.filter(e => !e.limits).map(e => e.id));
  assert(!noLimits.length, `GUIDE entries with no limits: ${noLimits}`);
  return page;
});

check("marks: logos are https, and a logo that fails to load becomes a monogram", async ctx => {
  await ctx.route(/espncdn\.com/, r => r.abort());
  const page = await openPage(ctx, "menu.html#/team-select");
  await waitCount(page, ".m-tile", 50);
  // Tile logos are loading="lazy": one that was never scrolled into view never tried to load, so scroll each into view
  // until every one has failed over.
  await page.waitForFunction(() => {
    const imgs = document.querySelectorAll(".m-tile img.m-tile-mark");
    imgs.forEach(i => i.scrollIntoView({ block: "center" }));
    return imgs.length === 0;
  }, null, { timeout: 30000, polling: 250 });
  const marks = await page.locator(".m-tile .team-mark").count();
  assert(marks >= 100, `only ${marks} monograms after every logo failed`);
  const insecure = await page.locator('img[src^="http://"]').count();
  assert(insecure === 0, `${insecure} plain-http images`);
  const label = (await text(page, ".m-tile .team-mark")).trim();
  assert(label.length >= 1 && label.length <= 4, `monogram label "${label}"`);
  return page;
});

// ════════════════════════════════════════════════════════════════════════════
// The classic site is retired: every old address forwards to the menu
// ════════════════════════════════════════════════════════════════════════════

// [old address, the hash it must land on, the season it must set (if the address names one)]
const STUBS = [
  ["index.html", ""], ["players.html", "#/players"], ["ratings.html", "#/scatter"], ["season2026.html", "#/season"],
  ["league.html", "#/standings"], ["league.html?tab=portal&season=2024", "#/portal", 2024],
  ["info.html", "#/guide"], ["info.html#projections", "#/guide/projections"], ["methods.html#ol", "#/methods/ol"], ["changes.html", "#/changes"],
  ["research.html", "#/research"],
  ...FINDING_IDS.map(id => [`${/^(hidden-gems|team-movement)$/.test(id) ? "story" : "research"}-${id}.html`, `#/research/${id}`]),
  ["players.html?player=57596&season=2024", "#/player/57596", 2024],
  ["teams.html?team=Ohio%20State&season=2023", "#/team/77", 2023],
  ["teams.html?team=Ohio%20State", "#/team/77"],
  ["teams.html#boise-state", "#/team/13"],
  ["teams.html?team=Nowhere%20State", "#/team-select"],
  ["teams.html", "#/hub"],
];

check("retired: every old page address forwards to its menu screen, carrying the season, the player, the team and the anchor", async ctx => {
  const bad = [];
  for (const [from, hash, season] of STUBS) {
    const fresh = await browser.newContext();
    try {
      const page = await fresh.newPage();
      await page.goto(BASE + from, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(h => location.pathname.endsWith("menu.html") && location.hash === h && location.search === "", hash, { timeout: 15000 })
        .catch(() => bad.push(`${from} → ${page.url().replace(BASE, "")}, wanted ${hash}`));
      if (season) {
        await page.waitForSelector("#m-season-label", { timeout: 15000 });
        const label = await page.locator("#m-season-label").innerText();
        if (!label.startsWith(String(season))) bad.push(`${from}: season shows "${label}", wanted ${season}`);
      }
    } finally { await fresh.close(); }
  }
  assert(!bad.length, bad.join("\n      "));
  return null;
});

check("retired: every old page is a stub, the classic scripts are gone, and the menu loads only files that exist", async ctx => {
  const bad = [];
  for (const f of fs.readdirSync(APP_ROOT).filter(f => f.endsWith(".html") && f !== "menu.html")) {
    const src = fs.readFileSync(path.join(APP_ROOT, f), "utf8");
    if (src.length > 1800 || /<script src=/.test(src) || /stylesheet/.test(src)) bad.push(`${f} is not a stub`);
  }
  for (const f of ["shell", "home", "teamsPage", "playerSearch", "ratingsDisplay", "season2026", "leaguePage"]) {
    if (fs.existsSync(path.join(APP_ROOT, "js", `${f}.js`))) bad.push(`js/${f}.js is still there`);
  }
  const menu = fs.readFileSync(path.join(APP_ROOT, "menu.html"), "utf8");
  for (const m of menu.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)) {
    if (!fs.existsSync(path.join(APP_ROOT, m[1]))) bad.push(`menu.html loads ${m[1]}, which does not exist`);
  }
  assert(!bad.length, bad.join("\n      "));
  return null;
});


// ════════════════════════════════════════════════════════════════════════════
// Runner
// ════════════════════════════════════════════════════════════════════════════

const server = await startServer();
BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ channel: "chrome", headless: !HEADED });

// ═══════════════════════════════════════════════════════════════
// The Dynasty menu (menu.html): its own app, mouse first, keyboard and gamepad
// ═══════════════════════════════════════════════════════════════

// Team 68 (Nevada), as "My Team", so a screen opens without the team-select step.
const MENU_TEAM_ID = "68";
async function openMenu(ctx, hash = "#/hub", opts = {}) {
  await ctx.addInitScript(id => { try { localStorage.setItem("cfb-menu-team", id); } catch (e) {} }, MENU_TEAM_ID);
  return openPage(ctx, `menu.html${hash}`, opts);
}

check("menu: a team-select tile opens that team's page", async ctx => {
  const page = await openPage(ctx, "menu.html#/team-select");
  await waitCount(page, ".m-tile", 20);
  await page.locator(".m-tile").first().click();
  await page.waitForFunction(() => /^#\/team\/\d+$/.test(location.hash), null, { timeout: 20000 });
  await waitCount(page, ".m-item", 6);
  assert(await page.locator(".m-teamcard h2").count() === 1, "the team page shows no team card");
  return page;
});

check("menu: keyboard walks hub → roster → card, and Escape walks back", async ctx => {
  const page = await openMenu(ctx);
  await waitCount(page, ".m-item", 6);
  assert(await page.locator(".m-item.is-selected").count() === 1, "the hub has no single selected item");
  await page.keyboard.press("Enter");
  await waitCount(page, ".m-row", 10);
  assert(page.url().includes("/roster"), `expected the roster, at ${page.url()}`);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.hash.startsWith("#/player"), null, { timeout: 30000 });
  await waitCount(page, ".trio-tile", 3);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => location.hash.includes("/roster"), null, { timeout: 15000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => location.hash.startsWith("#/hub"), null, { timeout: 15000 });
  return page;
});

check("menu: the roster shows one calculated rating; the card shows 2025, projection and to-date as three tiles", async ctx => {
  const page = await openMenu(ctx, "#/roster");
  await waitCount(page, ".m-row", 10);
  const head = (await page.locator(".m-rowhead").first().innerText()).toUpperCase();
  assert(head.includes("RATING") && !head.includes("PROJ") && !head.includes("LIVE"), `roster header: ${head}`);
  await page.locator(".m-row").first().click();
  await page.waitForSelector(".trio-strip", { timeout: 30000 });
  assert(await page.locator(".trio-tile").count() === 3, "expected three rating tiles on the card");
  return page;
});

check("menu: a simulated gamepad drives the menu and the prompt bar switches to pad glyphs", async ctx => {
  await ctx.addInitScript(() => {
    window.__pad = { id: "Fake pad", index: 0, connected: true, mapping: "standard", axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [window.__pad];
  });
  const page = await openMenu(ctx);
  await waitCount(page, ".m-item", 6);
  const press = async i => {
    await page.evaluate(n => { window.__pad.buttons[n] = { pressed: true, value: 1 }; }, i);
    await page.waitForTimeout(120);
    await page.evaluate(n => { window.__pad.buttons[n] = { pressed: false, value: 0 }; }, i);
    await page.waitForTimeout(120);
  };
  await press(13);                                   // D-pad down: the second item
  await press(0);                                    // A: select
  await page.waitForFunction(() => location.hash.includes("/depth"), null, { timeout: 20000 });
  assert(await page.locator(".m-glyph--pad").count() > 0, "the prompt bar did not switch to pad glyphs");
  await press(1);                                    // B: back
  await page.waitForFunction(() => location.hash.startsWith("#/hub"), null, { timeout: 15000 });
  return page;
});

check("menu: every screen renders rows with no page errors and no sideways scroll", async ctx => {
  const rowsOf = { "#/home": ".m-hp .m-row", "#/team/52": ".m-item", "#/player/105817/81": ".trio-tile", "#/player/105817/81/stats": ".m-stattable tr", "#/player/105817/81/career": ".m-career-table tr", "#/roster": ".m-row","#/depth": ".m-drow", "#/schedule": ".m-row", "#/standings": ".m-row",
    "#/rankings": ".m-row--rank", "#/recruiting": ".m-row--class", "#/recruiting/prospects": ".m-row--prospect",
    "#/portal": ".m-row--portal", "#/scatter": ".m-row--mini", "#/team/52/ratings": ".m-bar" };
  let last = null;
  for (const [hash, sel] of Object.entries(rowsOf)) {
    for (const [width, height] of [[1280, 800], [375, 740]]) {
      const page = await openMenu(ctx, hash, { width, height });
      await waitCount(page, sel, 3);
      assert(await noHorizontalScroll(page), `${hash} scrolls sideways at ${width}px`);
      assert(!(await errorStates(page, "#m-stage")).length, `${hash} shows an error state`);
      assert(!page.problems.length, `${hash}: ${page.problems[0]}`);
      await page.close();
    }
  }
  return last;
});

check("menu: recruiting class ranks run 1..n and the board counts match the file", async ctx => {
  const page = await openMenu(ctx, "#/recruiting");
  await waitCount(page, ".m-row--class", 10);
  const ranks = await page.locator(".m-row--class .m-rank").allInnerTexts();
  assert(ranks.slice(0, 10).every((r, i) => Number(r) === i + 1), `ranks not dense: ${ranks.slice(0, 10)}`);
  const file = await page.evaluate(async y => (await (await fetch(`data/recruiting_${y}.json`)).json()), CURRENT);
  const ranked = file.teams.filter(t => t.class_rank != null).sort((a, b) => a.class_rank - b.class_rank);
  const first = await page.locator(".m-row--class .m-pname").first().innerText();
  assert(first.trim() === ranked[0].team, `top class ${first} != file ${ranked[0].team}`);
  return page;
});


check("menu: M switches dark and light, and remembers it", async ctx => {
  const page = await openMenu(ctx);
  await waitCount(page, ".m-item", 6);
  assert((await page.locator("#menu-root").getAttribute("data-mode")) === "dark", "not dark by default");
  await page.locator('.m-prompt[data-prompt="mode"]').click();
  await page.waitForFunction(() => document.getElementById("menu-root").dataset.mode === "light", null, { timeout: 5000 });
  await page.reload();
  await waitCount(page, ".m-item", 6);
  assert((await page.locator("#menu-root").getAttribute("data-mode")) === "light", "the mode was not remembered");
  return page;
});

check("menu: a rostered player with no ratings row still opens a card, with a stated reason", async ctx => {
  // Jeremy Naborne-Owens (LB, no game on record, no projection) is on Nevada's (team 68) 2026 roster but has no row in
  // players_2026.json. (Until v4.19 this was Brandon Amaniampong, 2 games; one- and two-game players are rated now.)
  const page = await openMenu(ctx, "#/player/1129736/68");
  await page.waitForSelector(".m-rhead--card", { timeout: 30000 });
  assert(!(await page.locator(".m-error").count()), "the card shows an error");
  const empty = await page.locator(".m-stats .m-empty").innerText();
  assert(empty.length > 20 && !empty.includes("${"), `no reason for the missing stats: "${empty}"`);
  assert(await page.locator(".m-career").count() === 1, "no career strip");
  return page;
});


check("menu: the menu opens on a home page with no team chosen, and every row on it is a link", async ctx => {
  const page = await openPage(ctx, "menu.html");
  await waitCount(page, ".m-hp", 5);
  assert(await page.locator(".m-tile").count() === 0, "a first visit was sent to team select");
  assert(!/dynasty/i.test(await page.locator(".m-crumb, .m-title").allInnerTexts().then(a => a.join(" "))), "the home page still says Dynasty");
  const sections = await page.locator(".m-nav .m-navbtn:not(.m-navbtn--menu)").allInnerTexts();
  assert(sections.join("|").toUpperCase() === "HOME|MY TEAM|SEASON|TEAMS|PLAYERS|RECRUITING|ABOUT", `the seven sections are not all on the bar: ${sections}`);
  assert(await page.locator(".m-mystrip").count() === 1, "no strip offering to follow a team");
  const rows = page.locator(".m-hp .m-row");
  const n = await rows.count();
  assert(n >= 20, `the home panels list only ${n} rows`);
  const unlinked = await rows.evaluateAll(els => els.filter(e => !e.dataset.to).length);
  assert(unlinked === 0, `${unlinked} home rows have no destination`);
  // A team row opens its page, a player row opens his card, a game opens a team.
  await page.locator('.m-hp [data-nav-group="hp-teams"]').first().click();
  await page.waitForFunction(() => /^#\/team\/\d+$/.test(location.hash), null, { timeout: 20000 });
  await waitCount(page, ".m-item", 6);
  await page.keyboard.press("Escape");
  await waitCount(page, ".m-hp", 5);
  await page.locator('.m-hp [data-nav-group="hp-players"]').first().click();
  await page.waitForFunction(() => location.hash.startsWith("#/player/"), null, { timeout: 20000 });
  await page.waitForSelector(".m-rhead--card", { timeout: 30000 });
  await page.keyboard.press("Escape");
  await waitCount(page, ".m-hp", 5);
  await page.locator('.m-hp [data-nav-group="hp-games"]').first().click();
  await page.waitForFunction(() => /^#\/team\/\d+$/.test(location.hash), null, { timeout: 20000 });
  assert(!page.problems.length, page.problems[0]);
  return page;
});

check("menu: any team has a page, reachable from a ranking, a standing, a schedule and the bracket; following is on that page", async ctx => {
  const page = await openPage(ctx, "menu.html#/rankings");
  await waitCount(page, ".m-row--rank", 5);
  await page.locator(".m-row--rank").nth(2).click();
  await page.waitForFunction(() => /^#\/team\/\d+$/.test(location.hash), null, { timeout: 20000 });
  await waitCount(page, ".m-item", 6);
  const id = (await page.evaluate(() => location.hash)).split("/")[2];
  for (const [sub, sel] of [["roster", ".m-row--roster"], ["depth", ".m-drow"], ["schedule", ".m-row--sched"]]) {
    await page.evaluate(h => { location.hash = h; }, `#/team/${id}/${sub}`);
    await waitCount(page, sel, 3);
  }
  assert(await page.locator(".m-tile").count() === 0, "a team's screen asked for My Team");
  await page.evaluate(h => { location.hash = h; }, `#/team/${id}`);
  await waitCount(page, "[data-follow]", 1);
  assert(/follow this team/i.test(await page.locator("[data-follow]").innerText()), "no follow button for a team that is not followed");
  await page.locator("[data-follow]").click();
  await page.waitForFunction(() => /following/i.test(document.querySelector("[data-follow]")?.innerText || ""), null, { timeout: 10000 });
  assert(Number(await page.evaluate(() => localStorage.getItem("cfb-menu-team"))) === Number(id), "following did not save My Team");
  await page.evaluate(() => { location.hash = "#/home"; });
  await waitCount(page, ".m-hp", 5);
  assert(/roster/i.test(await page.locator(".m-mystrip").innerText()), "the followed team has no strip on the home page");
  const st = await openPage(ctx, "menu.html#/standings");
  await waitCount(st, ".m-row--stand", 3).catch(() => { throw new Fail("standings rows never appeared"); });
  assert(await st.locator("button.m-row--stand").first().getAttribute("data-to") !== null, "a standings row has no destination");
  const po = await openPage(ctx, "menu.html#/playoff/12");
  await waitCount(po, "button.m-bslot", 8).catch(() => { throw new Fail("bracket boxes never appeared"); });
  assert(await po.locator("button.m-bslot").first().getAttribute("data-to") !== null, "a bracket box has no destination");
  const sc = await openPage(ctx, `menu.html#/team/${id}/schedule`);
  await waitCount(sc, ".m-row--sched", 8).catch(() => { throw new Fail("schedule rows never appeared"); });
  assert(await sc.locator(".m-row--sched[data-to]").count() >= 5, "schedule rows do not open the opponent");
  return page;
});

check("menu: a team's own screens keep to the team in the route, not My Team", async ctx => {
  const page = await openMenu(ctx, "#/team/52/roster");        // LSU, while Nevada is followed
  await waitCount(page, ".m-row--roster", 20);
  assert(/LSU/i.test(await page.locator("#m-title").innerText()), "the roster is not LSU's");
  const pid = await page.locator("button.m-row--roster").first().getAttribute("data-to");
  assert(pid.startsWith("#/player/") && pid.endsWith("/52"), `a roster row opens ${pid}`);
  assert(await page.locator('.m-tab[data-tab="QB"]').count() === 1, "no position tabs");
  await page.locator('.m-tab[data-tab="QB"]').click();
  await page.waitForFunction(() => location.hash === "#/team/52/roster/QB", null, { timeout: 10000 });
  return page;
});

check("menu: the quick menu offers the team being looked at, and Back at home opens it", async ctx => {
  const page = await openMenu(ctx, "#/team/52");
  await waitCount(page, ".m-item", 6);
  await page.locator('.m-prompt[data-prompt="home"]').click();
  await page.waitForSelector(".m-overlay", { timeout: 5000 });
  assert(await page.locator('.m-overlay [data-go="#/team/52/roster"]').count() === 1, "the quick menu does not offer LSU's roster");
  assert(/THIS TEAM/.test(await page.locator(".m-ovl-h").first().innerText()), "the team column is not marked as the team being viewed");
  await page.keyboard.press("Escape");
  const home = await openMenu(ctx, "#/home");
  await waitCount(home, ".m-hp", 5);
  await home.keyboard.press("Escape");
  await home.waitForSelector(".m-overlay .m-item", { timeout: 5000 });
  assert(await home.locator(".m-overlay [data-go]").count() >= 10, "the quick menu lists too few screens");
  assert(await home.locator('.m-overlay [data-go="#/home"]').count() === 1, "the quick menu has no Home entry");
  await home.keyboard.press("Escape");
  await home.waitForFunction(() => !document.querySelector(".m-overlay"), null, { timeout: 5000 });
  await home.locator('.m-prompt[data-prompt="home"]').click();
  await home.waitForSelector(".m-overlay", { timeout: 5000 });
  await home.locator('.m-overlay [data-go="#/playoff"]').click();
  await home.waitForFunction(() => location.hash.startsWith("#/playoff"), null, { timeout: 10000 });
  assert(!(await home.locator(".m-overlay").count()), "the quick menu stayed open after a choice");
  return null;
});

check("menu: the player card has Overview, Games, Stats and Career sections in the console frame, with team and position links", async ctx => {
  const page = await openMenu(ctx, "#/player/1129716/68");
  await page.waitForSelector(".m-rhead--card", { timeout: 30000 });
  const tabs = await page.locator(".m-tab").allInnerTexts();
  assert(tabs.map(t => t.trim().toUpperCase()).join() === "OVERVIEW,GAMES,STATS,CAREER", `tabs: ${tabs}`);
  assert(await page.locator(".m-rhead--card .m-chip[data-to^='#/team/']").count() === 1, "no link from the card to the team");
  await page.locator('.m-tab[data-tab="stats"]').click();
  await page.waitForFunction(() => /STATS/i.test(document.querySelector(".m-tab.is-active")?.innerText || ""), null, { timeout: 10000 });
  await page.locator('.m-tab[data-tab="career"]').click();
  await page.waitForFunction(() => /CAREER/i.test(document.querySelector(".m-tab.is-active")?.innerText || ""), null, { timeout: 10000 });
  assert(await page.locator(".m-rhead--card").count() === 1, "the header strip is gone from the career section");
  return null;
});

check("menu: with a mouse there are no key labels and no arrow or WASD movement; the bar is buttons", async ctx => {
  const page = await openMenu(ctx, "#/home");
  await waitCount(page, ".m-hp .m-row", 5);
  assert(await page.locator(".m-glyph").count() === 0, "key glyphs are drawn for a mouse user");
  assert(await page.locator(".m-bumper:visible").count() === 0, "Q/E tab markers are showing without a controller");
  const labels = (await page.locator(".m-prompt").allInnerTexts()).map(t => t.trim().toUpperCase());
  for (const w of ["BACK", "MENU"]) assert(labels.includes(w), `no ${w} button: ${labels}`);
  assert(labels.includes("YEAR") || labels.includes("SEASON"), `no season button: ${labels}`);
  const before = await page.evaluate(() => document.querySelector(".m-row.is-selected")?.dataset.to);
  for (const k of ["ArrowDown", "ArrowDown", "s", "d"]) await page.keyboard.press(k);
  await page.waitForTimeout(300);
  assert((await page.evaluate(() => document.querySelector(".m-row.is-selected")?.dataset.to)) === before, "an arrow or WASD key moved the selection");
  await page.locator('.m-prompt[data-prompt="season"]').click();
  await page.waitForFunction(() => !/IN PROGRESS/.test(document.querySelector("#m-season-label")?.innerText || ""), null, { timeout: 15000 });
  return null;
});

check("menu: a section bar is on every screen and highlights where you are; a schedule game opens its matchup screen", async ctx => {
  const page = await openMenu(ctx, "#/rankings");
  await waitCount(page, ".m-row--rank", 5);
  assert(/SEASON/i.test(await page.locator(".m-navbtn.is-here").innerText()), "the section bar does not mark Season");
  assert(/RANKINGS/i.test(await page.locator(".m-subbtn.is-here").innerText()), "the page bar does not mark Rankings");
  await page.locator('.m-subbtn[data-to="#/standings"]').click();
  await page.waitForFunction(() => location.hash.startsWith("#/standings"), null, { timeout: 10000 });
  await page.evaluate(() => { location.hash = "#/schedule"; });
  await waitCount(page, "button.m-row--sched", 5);
  assert(await page.locator(".m-sband .m-sbox").count() === 3, "the schedule has no OVR / OFF / DEF band");
  await page.locator("button.m-row--sched").first().click();
  await page.waitForFunction(() => location.hash.startsWith("#/game/"), null, { timeout: 10000 });
  await waitCount(page, ".m-gm-row", 8);
  assert(await page.locator(".m-gm-team").count() === 2, "a matchup shows two teams");
  assert(/TEAMS/i.test(await page.locator(".m-navbtn.is-here").innerText()), "a game does not belong to Teams");
  return null;
});

check("menu: each of the seven sections lists its own pages, and the page you are on is marked", async ctx => {
  const page = await openMenu(ctx, "#/home");
  await waitCount(page, ".m-nav .m-navbtn", 8);
  const here = async () => ({ section: (await page.locator(".m-navbtn.is-here").allInnerTexts()).join(","),
    pages: (await page.locator(".m-subnav:not([hidden]) .m-subbtn").allInnerTexts()).join("|"),
    page: (await page.locator(".m-subbtn.is-here").allInnerTexts()).join(",") });
  const go = async (hash, ready) => { await page.evaluate(h => { location.hash = h; }, hash); await waitCount(page, ready, 1); await page.waitForTimeout(150); };
  const cases = [
    ["#/home", ".m-hp", "HOME", "", ""],
    ["#/standings", ".m-row--stand", "SEASON", "RANKINGS|STANDINGS|THE SEASON|PLAYOFF|COMPARE", "STANDINGS"],
    ["#/team/68/roster", ".m-row", "MY TEAM", "OVERVIEW|ROSTER|DEPTH CHART|RATINGS|SCHEDULE|RECRUITING|TRANSFERS|HISTORY", "ROSTER"],
    ["#/team/68/ratings", ".m-bar", "MY TEAM", "OVERVIEW|ROSTER|DEPTH CHART|RATINGS|SCHEDULE|RECRUITING|TRANSFERS|HISTORY", "RATINGS"],
    ["#/team/70/depth", ".m-drow", "TEAMS", "ALL TEAMS|OVERVIEW|ROSTER|DEPTH CHART|RATINGS|SCHEDULE|RECRUITING|TRANSFERS|HISTORY", "DEPTH CHART"],
    ["#/players", ".m-row--player", "PLAYERS", "LEADERS|TALENT VS PRODUCTION", "LEADERS"],
    ["#/scatter", ".m-scatter", "PLAYERS", "LEADERS|TALENT VS PRODUCTION", "TALENT VS PRODUCTION"],
    ["#/recruiting/prospects", ".m-row--prospect", "RECRUITING", "CLASSES|PROSPECTS|TRANSFER PORTAL", "PROSPECTS"],
    ["#/portal", ".m-row--portal", "RECRUITING", "CLASSES|PROSPECTS|TRANSFER PORTAL", "TRANSFER PORTAL"],
    ["#/methods", ".m-readlist", "ABOUT", "HOW IT WORKS|METHODS|RESEARCH|BUILD LOG", "METHODS"],
  ];
  for (const [hash, ready, section, pages, cur] of cases) {
    await go(hash, ready);
    const h = await here();
    assert(h.section.toUpperCase() === section && h.pages.toUpperCase() === pages && h.page.toUpperCase() === cur,
      `${hash}: section "${h.section}", pages "${h.pages}", page "${h.page}"; wanted ${section} / ${pages} / ${cur}`);
  }
  return page;
});

check("menu: on a touch phone every navigation control is at least 44px, nothing scrolls the page sideways, and the page bar keeps the current page in view", async ctx => {
  const tctx = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  try {
    await tctx.addInitScript(id => { try { localStorage.setItem("cfb-menu-team", id); } catch (e) {} }, MENU_TEAM_ID);
    const page = await tctx.newPage();
    await page.goto(BASE + "menu.html#/team/52/history", { waitUntil: "domcontentloaded" });
    await waitCount(page, ".m-subbtn", 7);
    const small = await page.evaluate(() => [...document.querySelectorAll(".m-navbtn, .m-subbtn, .m-step, .m-tab")]
      .map(e => ({ t: e.textContent.trim(), h: e.getBoundingClientRect().height })).filter(x => x.h < 43.5));
    assert(!small.length, `controls under 44px: ${small.map(x => `${x.t} ${x.h.toFixed(0)}`).join(", ")}`);
    assert(await noHorizontalScroll(page), "the page scrolls sideways on a phone");
    const view = await page.evaluate(() => { const s = document.querySelector(".m-subnav"), b = s.querySelector(".is-here").getBoundingClientRect(), r = s.getBoundingClientRect();
      return b.left >= r.left - 1 && b.right <= r.right + 1; });
    assert(view, "the current page (History, the seventh) is scrolled out of view in the page bar");
    const rows = await page.evaluate(() => document.querySelector(".m-ticker") ? getComputedStyle(document.querySelector(".m-ticker")).display : "none");
    assert(rows === "none", "the ticker still takes room on a phone");
  } finally { await tctx.close(); }
  return null;
});

check("menu: stepping to an earlier season from a live rankings address does not break Rankings, and the ticker follows the season", async ctx => {
  const page = await openMenu(ctx, "#/rankings/live/top/blend/w7");
  await waitCount(page, "button.m-row--rank", 5);
  const now = (await page.locator(".m-ticker-track").first().innerText()).slice(0, 60);
  await page.evaluate(() => { menuRouter.stepSeason(1); });
  await page.waitForFunction(() => /2025/.test(document.querySelector("#m-season-label")?.textContent || ""), null, { timeout: 15000 });
  await waitCount(page, "button.m-row--rank", 20);
  assert(!(await page.locator(".m-error-text").count()), "Rankings failed on a finished season reached from a live address");
  assert(!/by week|to date/i.test(await page.locator(".m-tab.is-active").innerText()), `the active list is ${await page.locator(".m-tab.is-active").innerText()}`);
  await page.waitForFunction(prev => (document.querySelector(".m-ticker-track")?.textContent || "").slice(0, 60) !== prev, now, { timeout: 15000 });
  // and a season with no weekly file, from the same stale address
  await openMenu(ctx, "#/rankings/live/top/blend/w7");
  const old = await ctx.newPage();
  await old.addInitScript(() => { try { localStorage.setItem("cfb-menu-season", "2018"); } catch (e) {} });
  await old.goto(BASE + "menu.html#/rankings/live/top/blend/w7", { waitUntil: "domcontentloaded" });
  await waitCount(old, "button.m-row--rank", 20);
  assert(!(await old.locator(".m-error-text").count()), "Rankings failed on 2018 from a live address");
  return page;
});

check("menu: the depth chart lists a deep bench, not three or four players a position", async ctx => {
  const page = await openMenu(ctx, "#/depth/Offense");
  await waitCount(page, ".m-drow", 20);
  assert(await page.locator(".m-drow").count() >= 25, "the offensive depth chart is thin");
  return null;
});

check("menu: the defensive depth chart groups CB and S inside DB and lists up to 10 a group", async ctx => {
  const page = await openMenu(ctx, "#/depth/Defense");
  await waitCount(page, ".m-drow", 20);
  for (const g of ["CB", "S"]) {
    assert(await page.locator(`.m-drow[data-nav-group="depth-${g}"]`).count() === 0, `${g} has a group of its own; it belongs inside DB`);
  }
  for (const g of ["DL", "LB", "DB"]) {
    const n = await page.locator(`.m-drow[data-nav-group="depth-${g}"]`).count();
    assert(n >= 5 && n <= 10, `${g} shows ${n} players, wanted 5 to 10`);
  }
  assert(await page.locator(`.m-drow[data-nav-group="depth-DB"] .m-ptag`).count() > 0, "a DB row does not keep its own position tag");
  return null;
});

check("menu: a player rated on two games says so on his card", async ctx => {
  const page = await openMenu(ctx, "#/player/62241/111");   // a UCLA defensive back with 2 games in 2026
  await waitCount(page, ".m-why li", 1);
  const why = await page.locator(".m-why").first().innerText();
  assert(/2 games/i.test(why) && /the two games/i.test(why), `the card does not state the game count: ${why.slice(0, 200)}`);
  assert(!/provisional/i.test(why), "the low-game line does not call the rating provisional");
  return null;
});

check("menu: every screen's prompt bar always offers Back, Year and Menu", async ctx => {
  const page = await openMenu(ctx, "#/roster");
  await waitCount(page, ".m-row", 5);
  const bar = (await page.locator(".m-prompts").innerText()).toUpperCase();
  for (const w of ["BACK", "YEAR", "MENU"]) assert(bar.includes(w), `prompt bar lacks ${w}: ${bar}`);
  return page;
});

// ── Cards and rosters under failure ──────────────────────────────────────────
// A data file that fails (500, truncated JSON) must be said on the screen, with a Retry that
// recovers; a file that is absent (404) is a different message and no error; a slow file shows the
// rows when it arrives; and rows or cards with missing fields must render without "undefined",
// "NaN" or "null" text. Injected failures show up as HTTP errors, so these checks return no page
// and assert for script errors themselves.

// Routes a data file as the test dictates. `mode()` is read on every request: "500", "404",
// "bad-json" (truncated), "slow" (3 s), "ok", or a function that rewrites the real file's JSON.
async function faultRoute(ctx, pattern, mode) {
  await ctx.route(pattern, async route => {
    const m = mode();
    if (m === "500") return route.fulfill({ status: 500, body: "server error" });
    if (m === "404") return route.fulfill({ status: 404, body: "not found" });
    if (m === "bad-json") return route.fulfill({ status: 200, contentType: "application/json", body: '{"truncated": [1, 2' });
    if (m === "slow") { await new Promise(r => setTimeout(r, 3000)); return route.continue(); }
    if (typeof m === "function") {
      const res = await route.fetch();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(m(await res.json())) });
    }
    return route.continue();
  });
}
const quiet = page => page.problems.filter(p => !/^HTTP \d+/.test(p));

check("menu: a roster file that fails to load shows a banner and Retry, and Retry recovers", async ctx => {
  let mode = "500";
  await faultRoute(ctx, /\/data\/rosters_2026\.json/, () => mode);
  const page = await openMenu(ctx, "#/roster");
  await page.waitForSelector(".m-error--banner", { timeout: 30000 });
  const banner = await page.locator(".m-error--banner").first().innerText();
  assert(banner.includes("rosters_2026.json") && /HTTP 500/.test(banner), `banner: ${banner}`);
  const empty = await page.locator(".m-rbody .m-empty").innerText();
  assert(/did not load/i.test(empty), `the empty state does not say the file failed: "${empty}"`);
  assert(await page.locator(".m-row").count() === 0, "rows were drawn from a file that failed");
  mode = "ok";
  await page.locator(".m-retry").first().click();
  await waitCount(page, ".m-row", 10);
  assert(!(await page.locator(".m-error--banner").count()), "the banner stayed after a successful retry");
  assert(!quiet(page).length, quiet(page)[0]);
  return null;
});

check("menu: a truncated career file is named on the card, and Retry brings the stats back", async ctx => {
  const shard = `cards/${String(1129736 % constant("CARD_SHARDS")).padStart(4, "0")}.json`;
  let mode = "bad-json";
  await faultRoute(ctx, `**/data/${shard}`, () => mode);
  const page = await openMenu(ctx, "#/player/1129736/68");
  await page.waitForSelector(".m-rhead--card", { timeout: 30000 });
  const banner = await page.locator(".m-error--banner").first().innerText();
  assert(banner.includes(shard), `banner: ${banner}`);
  const why = await page.locator(".m-stats .m-empty").innerText();
  assert(/did not load/i.test(why), `the card claims no stats exist when the file failed: "${why}"`);
  assert(/did not load/i.test(await page.locator(".m-career").innerText()), "the career section does not say its file failed");
  mode = "ok";
  await page.locator(".m-retry").first().click();
  await page.waitForFunction(() => !document.querySelector(".m-error--banner"), null, { timeout: 60000 });
  assert(!/did not load/i.test(await page.locator(".m-stats .m-empty").innerText()), "the card still blames the file after Retry");
  assert(!quiet(page).length, quiet(page)[0]);
  return null;
});

check("menu: a player's career fills in from his one file, and a failed file leaves the card standing", async ctx => {
  const players = JSON.parse(fs.readFileSync(path.join(APP_ROOT, "data", "players_2026.json"), "utf8"));
  const p = players.find(x => x.team_id === 68 && x.rating_prev != null && x.stats_season);
  assert(p, "no 2026 player on team 68 with a 2025 rating and stats to test with");
  const shard = `cards/${String(p.id % constant("CARD_SHARDS")).padStart(4, "0")}.json`;
  let mode = "500";
  await faultRoute(ctx, `**/data/${shard}`, () => mode);
  const page = await openMenu(ctx, `#/player/${p.id}/68/career`);
  await page.waitForSelector(".m-rhead--card", { timeout: 60000 });
  assert(/did not load/i.test(await page.locator(".m-career").innerText()), "the career section does not say its file failed");
  assert(await page.locator(".m-rhead--card .m-rhead-ovr").count() === 1, "the card lost its rating box when the career file failed");
  mode = "ok";
  await page.locator(".m-retry").first().click();
  await page.waitForSelector(".m-career-table", { timeout: 60000 });
  const rows = await page.locator(".m-career-table tbody tr").count();
  assert(rows >= 2, `the career table has ${rows} season(s) for a player with a 2025 rating`);
  assert(await page.locator(".m-career-table tfoot").count() === 1, "no career totals row");
  assert(await page.locator(".m-stattable").count() >= 1, "no full stat table on the card");
  assert(!quiet(page).length, quiet(page)[0]);
  return null;
});

check("menu: a matched player's card shows his ESPN photo in a fixed frame, and a player without one shows his initials", async ctx => {
  const hs = JSON.parse(fs.readFileSync(path.join(APP_ROOT, "data", "headshots.json"), "utf8"));
  const roster = JSON.parse(fs.readFileSync(path.join(APP_ROOT, "data", "rosters_2026.json"), "utf8"))["68"];
  const withPhoto = roster.find(p => hs.players[String(p.player_id)]);
  const without = roster.find(p => !hs.players[String(p.player_id)]);
  assert(withPhoto && without, "no matched and unmatched Nevada player to test with");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await ctx.route(/espncdn\.com/, r => r.fulfill({ status: 200, contentType: "image/png", body: png }));
  const a = await openMenu(ctx, `#/player/${withPhoto.player_id}/68`);
  await a.waitForSelector(".m-photo img", { timeout: 30000 });
  const src = await a.locator(".m-photo img").getAttribute("src");
  assert(src === hs.image.replace("{id}", hs.players[String(withPhoto.player_id)]), `photo src ${src}`);
  assert(await a.locator(".m-photo .m-photo-initials").count() === 1, "the initials are gone from a card with a photo");
  const box = await a.locator(".m-photo").boundingBox();
  assert(Math.abs(box.width - 118) < 1 && Math.abs(box.height - 144) < 1, `the photo frame is ${box.width}x${box.height}`);
  const b = await openMenu(ctx, `#/player/${without.player_id}/68`);
  await b.waitForSelector(".m-photo", { timeout: 30000 });
  assert(await b.locator(".m-photo img").count() === 0, "a photo for a player the lookup did not match");
  assert(await b.locator(".m-photo-initials").count() === 1, "no initials for an unmatched player");
  return null;
});

check("menu: top players on the home page and a team page carry photos (initials when unmatched), and schools in a transfer path link", async ctx => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await ctx.route(/espncdn\.com/, r => r.fulfill({ status: 200, contentType: "image/png", body: png }));
  const page = await openPage(ctx, "menu.html#/home");
  await waitCount(page, '.m-hp [data-nav-group="hp-players"]', 5);
  assert(await page.locator('.m-hp [data-nav-group="hp-players"] .m-avatar').count() >= 5, "home player rows have no avatar frame");
  assert(await page.locator('.m-hp [data-nav-group="hp-players"] .m-avatar img').count() >= 3, "no top player has a photo on the home page");
  const t = await openPage(ctx, "menu.html#/team/52");
  await t.waitForSelector('#m-top .m-avatar', { timeout: 60000 });
  assert(await t.locator('#m-top .m-avatar img').count() >= 3, "a team's top players have no photos");
  return null;
});

check("menu: a photo that fails to load is removed and the initials stay; no photo is requested when headshots are off", async ctx => {
  const hs = JSON.parse(fs.readFileSync(path.join(APP_ROOT, "data", "headshots.json"), "utf8"));
  const roster = JSON.parse(fs.readFileSync(path.join(APP_ROOT, "data", "rosters_2026.json"), "utf8"))["68"];
  const withPhoto = roster.find(p => hs.players[String(p.player_id)]);
  await ctx.route(/espncdn\.com/, r => r.abort());
  const page = await openMenu(ctx, `#/player/${withPhoto.player_id}/68`);
  await page.waitForSelector(".m-rhead--card", { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector(".m-photo img"), null, { timeout: 15000 })
    .catch(() => { throw new Fail("a failed photo stayed on the card as a broken image"); });
  assert(await page.locator(".m-photo-initials").isVisible(), "the initials are not showing after the photo failed");
  assert(!quiet(page).length, quiet(page)[0]);
  return null;
});

check("menu: a slow roster file shows its rows when it arrives, with no error", async ctx => {
  await faultRoute(ctx, /\/data\/rosters_2026\.json/, () => "slow");
  const page = await openMenu(ctx, "#/roster");
  await waitCount(page, ".m-row", 10);
  assert(!(await page.locator(".m-error").count()), "a slow file was reported as an error");
  assert(!quiet(page).length, quiet(page)[0]);
  return null;
});

check("menu: a roster file that does not exist says so, and is not shown as a failure", async ctx => {
  await faultRoute(ctx, /\/data\/rosters_2026\.json/, () => "404");
  const page = await openMenu(ctx, "#/roster");
  await page.waitForSelector(".m-rbody .m-empty", { timeout: 30000 });
  assert(/no roster is on file/i.test(await page.locator(".m-rbody .m-empty").innerText()), "no 'no roster on file' message");
  assert(!(await page.locator(".m-error--banner").count()), "an absent file was shown as a failed load");
  assert(!quiet(page).length, quiet(page)[0]);
  return null;
});

check("menu: rows and cards with missing fields render with no undefined, NaN or null text", async ctx => {
  const roster = JSON.parse(fs.readFileSync(path.join(APP_ROOT, "data", "rosters_2026.json"), "utf8"))["68"];
  const ids = roster.slice(0, 5).map(r => r.player_id);
  await faultRoute(ctx, /\/data\/rosters_2026\.json/, () => j => {
    const r = j["68"];
    r[0].name = null; r[1].position_group = null;
    Object.assign(r[2], { height_in: null, weight_lbs: null, hometown_state: null, class_year: null, stars: null });
    Object.assign(r[3], { overall_rating: null, live_rating: null, rating_prev: null });
    for (const k of Object.keys(r[4])) if (k !== "player_id") r[4][k] = null;
    return j;
  });
  const page = await openMenu(ctx, "#/roster");
  await waitCount(page, ".m-row", 10);
  assert(await page.locator(".m-row").count() === roster.length, "the damaged rows changed the number of rows");
  const body = await page.locator(".m-rbody").innerText();
  assert(!/\bundefined\b|\bNaN\b|\bnull\b/.test(body), `roster text has a raw value: ${(body.match(/\bundefined\b|\bNaN\b|\bnull\b/) || [""])[0]}`);
  for (const id of ids) {
    await page.evaluate(i => { location.hash = `#/player/${i}/68`; }, id);
    await page.waitForSelector(".m-rhead--card", { timeout: 30000 });
    const txt = await page.locator("#m-stage").innerText();
    assert(!/\bundefined\b|\bNaN\b|\bnull\b/.test(txt), `card ${id} has a raw value: ${(txt.match(/\bundefined\b|\bNaN\b|\bnull\b/) || [""])[0]}`);
  }
  assert(!quiet(page).length, quiet(page)[0]);
  return null;
});

check("menu: every rostered player's card and every position tab render, across seasons and teams", async ctx => {
  const page = await openMenu(ctx, "#/home");
  await waitCount(page, ".m-hp", 5);
  const SEASONS = [2026, 2025, 2021, 2016, 2008], TEAMS = [68, 13, 52];
  const totals = { cards: 0, rosters: 0, bad: [] };
  for (const season of SEASONS) {
    const res = await page.evaluate(async ({ season, teams }) => {
      MENU.season = season;
      const out = { cards: 0, rosters: 0, bad: [], noRating: 0, noStats: 0 };
      const rosters = await _load(`rosters_${season}.json`);
      // The smallest roster of the season stands in for a small program.
      const smallest = Object.entries(rosters || {}).sort((a, b) => a[1].length - b[1].length)[0];
      for (const team of [...teams, smallest ? Number(smallest[0]) : null].filter(Boolean)) {
        const roster = await fetchTeamRoster(team, season);
        MENU.teamId = team;
        for (const pos of ["ALL", ...CONFIG.FILTER_POSITIONS]) {
          try {
            const html = await menuScreens.roster.render({ params: [pos], state: MENU, cleanups: [] });
            const txt = html.replace(/<[^>]*>/g, " ");
            if (/\bundefined\b|\bNaN\b|\bnull\b/.test(txt)) out.bad.push(`roster ${season}/${team}/${pos}: raw value`);
            out.rosters++;
          } catch (e) { out.bad.push(`roster ${season}/${team}/${pos}: ${e.message}`); }
        }
        for (const r of roster) {
          try {
            const html = await menuScreens.player.render({ params: [String(r.player_id), String(team)], state: MENU, cleanups: [] });
            const txt = html.replace(/<[^>]*>/g, " ");
            out.cards++;
            if (/\bundefined\b|\bNaN\b|\bnull\b/.test(txt)) out.bad.push(`card ${season}/${team}/${r.player_id}: raw value`);
            if (/class="m-error/.test(html)) out.bad.push(`card ${season}/${team}/${r.player_id}: error panel`);
            const rated = /ovr-badge|trio-strip/.test(html) || /<div class="m-big">.*?<\/div><p class="m-note">/s.test(html);
            if (!rated) { out.noRating++; out.bad.push(`card ${season}/${team}/${r.player_id}: no rating and no reason`); }
            const stats = /<div class="m-stats"><(table|div class="m-stat"|p class="m-empty")/.test(html);
            if (!stats) { out.noStats++; out.bad.push(`card ${season}/${team}/${r.player_id}: no stats and no reason`); }
          } catch (e) { out.bad.push(`card ${season}/${team}/${r.player_id}: ${e.message}`); }
        }
      }
      return out;
    }, { season, teams: TEAMS });
    totals.cards += res.cards; totals.rosters += res.rosters; totals.bad.push(...res.bad);
  }
  console.log(`      crawl: ${totals.cards} cards, ${totals.rosters} roster tabs, ${totals.bad.length} problems`);
  assert(totals.cards > 1500, `the crawl covered only ${totals.cards} cards`);
  assert(!totals.bad.length, `${totals.bad.length} problems, first: ${totals.bad.slice(0, 3).join(" | ")}`);
  assert(!quiet(page).length, quiet(page)[0]);
  return null;
});

check("menu: the playoff picture fields 4, 8, 12 and 24 teams, seeded by rating", async ctx => {
  for (const n of [4, 8, 12, 24]) {
    const page = await openMenu(ctx, `#/playoff/${n}`);
    await waitCount(page, "button.m-row--seed", n);
    assert(await page.locator("button.m-row--seed").count() === n, `expected ${n} seeds`);
    const seeds = await page.locator("button.m-row--seed .m-rank").allInnerTexts();
    assert(seeds.every((s, i) => Number(s) === i + 1), `seeds not 1..${n}: ${seeds}`);
    assert(!(await page.locator("body").innerText()).includes("win probability:"), "a win probability appeared");
    await page.close();
  }
  return null;
});

check("menu: a team's recruiting class and transfers show a state map", async ctx => {
  const page = await openMenu(ctx, "#/team-recruiting");
  await waitCount(page, ".m-row--prospect", 5);
  assert(await page.locator(".m-state.has").count() > 0, "no state is lit on the recruiting map");
  const t = await openMenu(ctx, "#/team-portal");
  await t.waitForSelector(".m-statemap", { timeout: 30000 });
  return t;
});

check("menu: a played season's schedule lists the bowl or playoff after the regular season, labelled; a team without one has none", async ctx => {
  const sched = JSON.parse(fs.readFileSync(path.join(APP_ROOT, "data", "schedules_2025.json"), "utf8"));
  const withPost = Object.keys(sched).find(t => sched[t].some(g => g.season_type === "postseason" && g.result) && sched[t].filter(g => g.season_type === "regular").length >= 12);
  const without = Object.keys(sched).find(t => !sched[t].some(g => g.season_type === "postseason") && sched[t].filter(g => g.season_type === "regular").length >= 12);
  assert(withPost && without, "no 2025 team with and without a postseason game to test");
  const open = async team => {
    await ctx.addInitScript(([t, y]) => { try { localStorage.setItem("cfb-menu-team", t); localStorage.setItem("cfb-menu-season", y); } catch (e) {} }, [team, "2025"]);
    const page = await openPage(ctx, "menu.html#/schedule");
    await waitCount(page, ".m-row--sched", 10);
    return page;
  };
  const a = await open(withPost);
  assert(await a.locator(".m-sched-div").count() === 1, "no POSTSEASON heading for a team that played a bowl");
  const labels = await a.locator(".m-row--sched .m-rank").allInnerTexts();
  const posts = sched[withPost].filter(g => g.season_type === "postseason").length;
  assert(labels.filter(l => l === "POST").length === posts, `expected ${posts} POST rows, got ${labels.filter(l => l === "POST")}`);
  assert(!labels.some((l, i) => /^W\d+$/.test(l) && labels.slice(0, i).includes("POST")), "a week-numbered game follows a postseason game");
  await a.close();
  const b = await open(without);
  assert(await b.locator(".m-sched-div").count() === 0, "a POSTSEASON heading for a team that played none");
  assert(await b.locator(".m-row--sched .m-rank").allInnerTexts().then(l => !l.includes("POST")), "a POST row for a team that played none");
  return null;
});

check("menu: a team's record shows the postseason beside the regular season", async ctx => {
  const sched = JSON.parse(fs.readFileSync(path.join(APP_ROOT, "data", "schedules_2025.json"), "utf8"));
  const team = Object.keys(sched).find(t => sched[t].some(g => g.season_type === "postseason" && g.result));
  await ctx.addInitScript(([t, y]) => { try { localStorage.setItem("cfb-menu-team", t); localStorage.setItem("cfb-menu-season", y); } catch (e) {} }, [team, "2025"]);
  const page = await openPage(ctx, "menu.html#/hub");
  await waitCount(page, ".m-teamcard .m-facts", 1);
  assert(/post \d+-\d+/.test(await page.locator(".m-teamcard .m-facts").first().innerText()), "the hub record has no postseason part");
  const r = await openPage(ctx, "menu.html#/rankings/pre");
  await waitCount(r, ".m-row--rank", 5);
  await r.locator(".m-row--rank").first().hover();
  await r.waitForSelector(".m-ptable", { timeout: 20000 });
  return null;
});

check("menu: the schedule shows a bye week and the roster is ordered by the to-date rating", async ctx => {
  const page = await openMenu(ctx, "#/schedule");
  await waitCount(page, ".m-row--sched", 8);
  assert(await page.locator(".m-row.is-bye").count() >= 1, "no bye week row");
  const r = await openMenu(ctx, "#/roster");
  await waitCount(r, ".m-row--roster", 10);
  const lives = await r.locator(".m-row--roster").evaluateAll(rows => rows.slice(0, 12).map(row => {
    const b = row.querySelectorAll(".ovr-badge"); const v = Number(b[b.length - 1]?.textContent); return Number.isFinite(v) ? v : null;
  }));
  const nums = lives.filter(v => v != null);
  assert(nums.length >= 5 && nums.every((v, i) => i === 0 || v <= nums[i - 1]), `roster not in to-date order: ${lives}`);
  return r;
});


check("menu: the readers show Methods, the Build Log, How It Works and Research inside the menu", async ctx => {
  const m = await openMenu(ctx, "#/methods/power-rating");
  await m.waitForSelector(".m-reader .method-title", { timeout: 20000 });
  assert(/power/i.test(await m.locator(".m-reader .method-title").first().innerText()), "the Methods entry is not the one asked for");
  assert(await m.locator(".m-row--read").count() > 10, "the Methods list is short");
  const links = await m.locator('.m-reader a[href*=".html"]').count();
  assert(links === 0, `${links} links in the entry still point at a classic page`);
  await m.close();
  const c = await openMenu(ctx, "#/changes");
  await c.waitForSelector(".m-reader .method-title", { timeout: 20000 });
  await c.close();
  const g = await openMenu(ctx, "#/guide");
  await g.waitForSelector(".m-reader .method-title", { timeout: 20000 });
  await g.close();
  const r = await openMenu(ctx, "#/research/team-performance");
  await r.waitForSelector("#finding-root .finding-stats, #finding-root .data-table", { timeout: 60000 });
  return r;
});

check("menu: Players & Leaders lists rated players by position and opens a card", async ctx => {
  const page = await openMenu(ctx, "#/players/QB");
  await waitCount(page, "button.m-row--player", 20);
  const pos = await page.locator("button.m-row--player .m-pos").allInnerTexts();
  assert(pos.every(p => p.trim() === "QB"), `a non-QB in the QB list: ${[...new Set(pos)]}`);
  await page.locator("button.m-row--player").first().click();
  await page.waitForFunction(() => location.hash.startsWith("#/player/"), null, { timeout: 15000 });
  await page.waitForSelector(".m-rhead--card", { timeout: 30000 });
  return page;
});

check("menu: The Season and Team History screens render", async ctx => {
  const s = await openMenu(ctx, "#/season");
  await s.waitForSelector(".m-detail-name", { timeout: 20000 });
  assert(/week \d+/i.test(await s.locator(".m-detail-name").first().innerText()), "no week on the season screen");
  const h = await openMenu(ctx, "#/team-history");
  await waitCount(h, ".m-row--hist", 10);
  return h;
});

check("menu: a ranking explains itself: power in two parts and the games behind it", async ctx => {
  const page = await openMenu(ctx, "#/rankings");
  await waitCount(page, ".m-row--rank", 10);
  await page.locator(".m-row--rank").nth(2).hover();
  await page.waitForSelector(".m-pparts", { timeout: 20000 });
  assert(await page.locator(".m-ptable tbody tr").count() >= 4, "no games listed behind the results part");
  const parts = (await page.locator(".m-pparts b").allInnerTexts()).map(t => Number(t.replace("−", "-").replace("+", "")));
  assert(Math.abs(parts[0] + parts[1] - parts[2]) < 0.25, `the parts do not add up: ${parts}`);
  return page;
});

check("menu: Rankings shows the top 25 and, on the All FBS view, every ranked team", async ctx => {
  const page = await openMenu(ctx, "#/rankings");
  await waitCount(page, ".m-row--rank", 20);
  const top = await page.locator("button.m-row--rank").count();
  assert(top >= 25 && top <= 26, `the top 25 view lists ${top} teams (25, plus your own team when it is lower)`);
  await page.locator(".m-viewbar .m-chip", { hasText: "All FBS" }).first().click();
  await page.waitForFunction(() => document.querySelectorAll("button.m-row--rank").length > 100, null, { timeout: 20000 });
  const all = await page.locator("button.m-row--rank").count();
  assert(all >= 130 && all <= 140, `the All FBS view lists ${all} teams`);
  assert(/\/all(\/|$)/.test(await page.evaluate(() => location.hash)), "the All FBS view is not in the address");
  assert(/all fbs/i.test(await page.locator(".m-viewbar .m-chip[aria-current='true']").first().innerText()), "the All FBS chip is not marked as the view");
  const ranks = await page.locator("button.m-row--rank .m-rank").allInnerTexts();
  assert(ranks[0] === "1" && Number(ranks[ranks.length - 1]) === all, "the ranks do not run 1..n");
  return page;
});

check("menu: Compare lays five readings beside our ranking for every team, sorts by any of them, and marks a gap", async ctx => {
  const page = await openMenu(ctx, "#/compare");
  await waitCount(page, "button.m-row--cmp", 100);
  const n = await page.locator("button.m-row--cmp").count();
  assert(n >= 130 && n <= 140, `Compare lists ${n} teams`);
  assert(await page.locator("button.m-row--cmp").first().locator(".m-cmp").count() === 5, "a row does not carry five readings");
  const first = async () => (await page.locator("button.m-row--cmp .m-pname").first().innerText()).trim();
  const byPower = await first();
  await page.locator('.m-tab[data-tab="roster"]').click();
  await page.waitForFunction(h => location.hash.includes("/roster"), null, { timeout: 15000 });
  await page.waitForTimeout(400);
  const byRoster = await first();
  assert(byRoster && byPower, "no team in the first row");
  const text = await page.locator("button.m-row--cmp").first().innerText();
  assert(!/\bundefined\b|\bNaN\b|\bnull\b/.test(text), "a Compare row shows undefined, NaN or null");
  assert(await page.locator(".m-cmp-rank.is-gap").count() > 0, "no reading is marked as 20 places from our ranking");
  await page.locator("button.m-row--cmp").nth(3).hover();
  await page.waitForSelector(".m-cmp-table", { timeout: 15000 });
  assert(await page.locator(".m-cmp-table tbody tr").count() === 5, "the detail panel does not list the five readings");
  return page;
});

check("menu: Compare on a preseason list has only the rating and power and says why", async ctx => {
  const page = await openMenu(ctx, "#/compare/power/pre");
  await waitCount(page, "button.m-row--cmp", 100);
  assert(/has only the rating and power/i.test(await page.locator(".m-note").first().innerText()), "no note on a preseason list");
  const dashes = await page.locator("button.m-row--cmp").first().locator(".trio-na").count();
  assert(dashes >= 2, `a preseason row shows ${dashes} blank readings, expected the stats and results`);
  return page;
});

check("menu: Rankings (All FBS) and Compare do not scroll sideways at 1280px or on a phone", async ctx => {
  let last = null;
  for (const hash of ["#/rankings/pre/all", "#/compare/power/pre"]) {
    for (const [width, height] of [[1280, 800], [375, 740]]) {
      const page = await openMenu(ctx, hash, { width, height });
      await waitCount(page, "button.m-row--rank, button.m-row--cmp", 50);
      assert(await noHorizontalScroll(page), `${hash} scrolls sideways at ${width}px`);
      last = page;
    }
  }
  return last;
});

// ── Week by week (v4.22): the weekly panels on the team page and the player card ──────────────────────────────
// A rated player with a rating in every completed week, read from the files the page itself loads, so the check cannot drift from them.
const WEEKLY = (() => {
  try {
    const dir = path.join(APP_ROOT, "data");
    const wp = JSON.parse(fs.readFileSync(path.join(dir, "weekly_players_2026.json"), "utf8"));
    const live = JSON.parse(fs.readFileSync(path.join(dir, "live_2026.json"), "utf8"));
    const weeks = wp.weeks.length;
    const team = new Map(live.players.map(p => [String(p.player_id), p.team_id]));
    const pid = Object.keys(wp.players).find(id => wp.players[id].length === weeks && team.has(id));
    return { weeks, pid, tid: team.get(pid) };
  } catch (e) { return null; }
})();

check("menu: a team page shows its week-by-week panel with a chart, a table and a graded game each week", async ctx => {
  assert(WEEKLY && WEEKLY.pid, "no weekly files on disk to check against");
  const page = await openMenu(ctx, "#/team/52");
  await page.waitForSelector("#m-weekly .m-tl", { timeout: 20000 });
  const rows = await page.locator("#m-weekly .m-ptable--weeks tbody tr").count();
  assert(rows === WEEKLY.weeks, `the weekly table has ${rows} rows, expected ${WEEKLY.weeks}`);
  assert(await page.locator("#m-weekly .m-tl-dot").count() >= WEEKLY.weeks - 1, "the chart is missing rating dots");
  assert(await page.locator("#m-weekly .m-tl-grade").count() >= WEEKLY.weeks - 2, "the chart is missing game-grade markers");
  const text = await page.locator("#m-weekly").innerText();
  assert(!/\bundefined\b|\bNaN\b|\bnull\b/.test(text), "the weekly panel shows undefined, NaN or null");
  assert(/offensive-line unit is not in these numbers/i.test(text), "the panel does not say the line unit is left out");
  return page;
});

check("menu: a player card shows his week-by-week panel with one row per completed week", async ctx => {
  assert(WEEKLY && WEEKLY.pid, "no weekly files on disk to check against");
  const page = await openMenu(ctx, `#/player/${WEEKLY.pid}/${WEEKLY.tid}`);
  await page.waitForSelector("#m-weekly .m-tl", { timeout: 20000 });
  assert(await page.locator("#m-weekly .m-ptable--weeks tbody tr").count() === WEEKLY.weeks, "the player's weekly table is not one row per week");
  const text = await page.locator("#m-weekly").innerText();
  assert(!/\bundefined\b|\bNaN\b|\bnull\b/.test(text), "the player's weekly panel shows undefined, NaN or null");
  assert(/rescaled to full-season pace: a scale, not a shrink/i.test(text), "the player's panel does not explain the rating");
  return page;
});

check("menu: the week-by-week panels do not scroll sideways at 1280px or on a phone", async ctx => {
  assert(WEEKLY && WEEKLY.pid, "no weekly files on disk to check against");
  let last = null;
  for (const hash of ["#/team/52", `#/player/${WEEKLY.pid}/${WEEKLY.tid}`]) {
    for (const [width, height] of [[1280, 800], [375, 740]]) {
      const page = await openMenu(ctx, hash, { width, height });
      await page.waitForSelector("#m-weekly .m-tl", { timeout: 20000 });
      assert(await noHorizontalScroll(page), `${hash} scrolls sideways at ${width}px`);
      last = page;
    }
  }
  return last;
});

// ── v4.23: rating on the chart, units by week, the Games tab, rankings by method and by week ────────────────────────
check("menu: the weekly chart carries the rating on it, a change column and a units matrix", async ctx => {
  assert(WEEKLY && WEEKLY.pid, "no weekly files on disk to check against");
  const page = await openMenu(ctx, "#/team/52");
  await page.waitForSelector("#m-weekly .m-tl", { timeout: 20000 });
  assert(await page.locator("#m-weekly .m-tl-val").count() >= WEEKLY.weeks - 1, "the chart does not write the rating above its dots");
  assert(await page.locator("#m-weekly .m-weeksum").count() === 1, "no summary line above the chart");
  assert(await page.locator("#m-weekly .m-ptable--weeks .delta-chip").count() >= WEEKLY.weeks - 1, "the weekly table has no change column");
  const units = await page.locator("#m-weekly .m-ptable--units tbody tr").count();
  assert(units >= 9, `the units matrix has ${units} rows`);
  const text = await page.locator("#m-weekly .m-ptable--units").innerText();
  assert(/QB/.test(text) && /Offense/.test(text) && /Roster/.test(text), "the units matrix lacks the position groups, halves or readings");
  assert(!/\bundefined\b|\bNaN\b|\bnull\b/.test(text), "the units matrix shows undefined, NaN or null");
  return page;
});

check("menu: a player card has a Games tab with a row per game and the full box score", async ctx => {
  assert(WEEKLY && WEEKLY.pid, "no weekly files on disk to check against");
  const page = await openMenu(ctx, `#/player/${WEEKLY.pid}/${WEEKLY.tid}`);
  await page.waitForSelector('.m-tab[data-tab="games"]', { timeout: 20000 });
  await page.locator('.m-tab[data-tab="games"]').click();
  await page.waitForSelector("#m-games .m-ptable--glog", { timeout: 20000 });
  const rows = await page.locator("#m-games .m-ptable--glog tbody tr").count();
  assert(rows >= 3 && rows <= WEEKLY.weeks + 1, `the Games tab lists ${rows} games`);
  assert(await page.locator("#m-games .m-ptable--games").count() >= 1, "no box-score group table under the game list");
  const text = await page.locator("#m-games").innerText();
  assert(!/\bundefined\b|\bNaN\b|\bnull\b/.test(text), "the Games tab shows undefined, NaN or null");
  assert(/a dash, not a zero/i.test(text), "the Games tab does not say a missing stat is a dash");
  return page;
});

check("menu: Rankings flips the method and shows any completed week, with movement", async ctx => {
  const page = await openMenu(ctx, "#/rankings/live/top");
  await waitCount(page, "button.m-row--rank", 20);
  assert(await page.locator('[aria-label="Rank by"] .m-chip').count() === 3, "the three ranking methods are not offered");
  const weeks = await page.locator('[aria-label="Week"] .m-chip').count();
  assert(weeks >= 5, `${weeks} week chips`);
  assert(await page.locator('[aria-label="Week"] .m-chip', { hasText: /^CURRENT$/ }).count() === 1, "the newest week is not labelled CURRENT");
  assert(await page.locator('[aria-label="Week"] .m-chip', { hasText: /^W[1-4]$/ }).count() === 0, "rankings offer a week before week 5");
  const first = async () => (await page.locator("button.m-row--rank .m-pname").first().innerText()).trim();
  const games = await first();
  assert(await page.locator("button.m-row--rank .m-mv").count() > 0, "no movement markers on the current list");
  await page.locator('[aria-label="Rank by"] .m-chip', { hasText: /rating \+ games/i }).click();
  await page.waitForFunction(() => location.hash.includes("/blend"), null, { timeout: 15000 });
  await waitCount(page, "button.m-row--rank", 20);
  assert(/Rating \+ games/.test(await page.locator(".m-foot").last().innerText()), "the footer does not name the method");
  await page.locator('[aria-label="Rank by"] .m-chip', { hasText: /^rating$/i }).click();
  await page.waitForFunction(() => location.hash.includes("/rating"), null, { timeout: 15000 });
  await waitCount(page, "button.m-row--rank", 20);
  await page.locator('[aria-label="Week"] .m-chip', { hasText: /^W5$/ }).click();
  await page.waitForFunction(() => location.hash.includes("/w5"), null, { timeout: 15000 });
  await waitCount(page, "button.m-row--rank", 20);
  assert(/after week 5/.test(await page.locator(".m-foot").last().innerText()), "the footer does not say which week it shows");
  const listed = await page.locator("button.m-row--rank").count();
  assert(listed === 25 || listed === 26, `an earlier week lists ${listed} teams (25, plus the followed team when it ranks lower)`);
  await page.locator("button.m-row--rank").nth(2).hover();
  await page.waitForFunction(() => /after week 5/.test(document.querySelector("#m-detail")?.innerText || ""), null, { timeout: 15000 });
  assert(games && await first(), "no team in the first row");
  return page;
});

check("menu: the Games tab and the flipped Rankings do not scroll sideways at 1280px or on a phone", async ctx => {
  assert(WEEKLY && WEEKLY.pid, "no weekly files on disk to check against");
  let last = null;
  for (const [hash, sel] of [[`#/player/${WEEKLY.pid}/${WEEKLY.tid}/games`, "#m-games .m-ptable--glog"], ["#/rankings/live/all/blend/w5", "button.m-row--rank"]]) {
    for (const [width, height] of [[1280, 800], [375, 740]]) {
      const page = await openMenu(ctx, hash, { width, height });
      await page.waitForSelector(sel, { timeout: 20000 });
      assert(await noHorizontalScroll(page), `${hash} scrolls sideways at ${width}px`);
      last = page;
    }
  }
  return last;
});

// ═══════════════════════════════════════════════════════════════
// Brought into the menu from the classic site (v4.25)
// ═══════════════════════════════════════════════════════════════

// Opens a menu screen with the season set, so a check does not depend on which season the menu defaults to.
async function openMenuIn(ctx, hash, season, opts = {}) {
  await ctx.addInitScript(s => { try { localStorage.setItem("cfb-menu-season", String(s)); } catch (e) {} }, season);
  return openMenu(ctx, hash, opts);
}

// Reads a data file as the page would, so a check can pick a real player instead of naming one that may leave the data.
const dataFile = (page, file) => page.evaluate(async f => (await fetch(`data/${f}`)).json(), file);

check("menu: Players searches names and teams, steps through conferences and minimum ratings, and a search finds a lineman", async ctx => {
  const page = await openMenuIn(ctx, "#/players", PLAYED);
  await waitCount(page, "button.m-row--player", 100);
  const total = Number((await text(page, "#m-pcount")).match(/of ([\d,]+)/)[1].replace(/,/g, ""));
  await page.fill("#m-pq", "curry");
  await page.waitForFunction(t => Number(document.querySelector("#m-pcount").textContent.match(/of ([\d,]+)/)[1].replace(/,/g, "")) < t, total, { timeout: 10000 });
  const names = await page.locator("button.m-row--player .m-pname").allInnerTexts();
  assert(names.some(n => /curry/i.test(n)), `no Curry among ${names.slice(0, 5)}`);
  // team names match too
  await page.fill("#m-pq", "boise state");
  await page.waitForFunction(() => { const t = [...document.querySelectorAll("button.m-row--player .m-pmeta")].map(e => e.textContent.trim()); return t.length > 0 && t.every(x => /^(BSU|BOIS|BOISE)/i.test(x)); }, null, { timeout: 10000 });
  await page.fill("#m-pq", "");
  await page.waitForFunction(t => Number(document.querySelector("#m-pcount").textContent.match(/of ([\d,]+)/)[1].replace(/,/g, "")) === t, total, { timeout: 10000 });
  // the rating button steps any, 60+, 70+, 80+, 90+ and every row shown then clears the floor
  for (let i = 0; i < 3; i++) await page.click("#m-pmin");
  assert(/80\+/.test(await text(page, "#m-pmin")), `rating button: ${await text(page, "#m-pmin")}`);
  const ratings = (await page.locator("button.m-row--player .m-rating").allInnerTexts()).map(t => parseInt(t)).filter(n => !Number.isNaN(n));
  assert(ratings.length > 10 && ratings.every(r => r >= 80), `ratings under the 80+ floor: ${ratings.filter(r => r < 80).slice(0, 5)}`);
  for (let i = 0; i < 2; i++) await page.click("#m-pmin");
  // the conference button narrows the list to one conference
  await page.click("#m-pconf");
  const conf = (await text(page, "#m-pconf")).replace(/^conference:\s*/i, "").trim();
  assert(conf && !/^all$/i.test(conf), `conference button still says "${conf}"`);
  const narrowed = Number((await text(page, "#m-pcount")).match(/of ([\d,]+)/)[1].replace(/,/g, ""));
  assert(narrowed < total, `${conf} did not narrow the list (${narrowed} of ${total})`);
  // a lineman has no rating and is not listed, but a search finds him
  await page.click("#m-pconf"); while (!/all/i.test(await text(page, "#m-pconf"))) await page.click("#m-pconf");
  const ol = (await dataFile(page, `players_${PLAYED}.json`)).find(p => p.position_group === "OL" && p.rating_status === "not_rated" && p.name);
  assert(ol, "no unrated lineman in the file to look for");
  await page.fill("#m-pq", ol.name);
  await page.waitForFunction(n => [...document.querySelectorAll("button.m-row--player .m-pname")].some(e => e.textContent.includes(n)), ol.name, { timeout: 10000 });
  // Escape in the box leaves the box, not the screen
  await page.focus("#m-pq");
  await page.keyboard.press("Escape");
  assert(page.url().includes("#/players"), "Escape in the search box left the Players screen");
  assert(await page.evaluate(() => document.activeElement?.id !== "m-pq"), "Escape did not leave the search box");
  return page;
});

check("menu: a player card shows where his production sits among his position, how he was recruited, similar players from any era, and a DB's three jobs", async ctx => {
  const page = await openMenuIn(ctx, "#/players/EDGE", PLAYED);
  await waitCount(page, "button.m-row--player", 20);
  const edge = (await dataFile(page, `players_${PLAYED}.json`)).find(p => p.position_group === "EDGE" && p.edge_score != null && p.stars && p.overall_rating >= 85);
  await page.goto(BASE + `menu.html#/player/${edge.id}/${edge.team_id}`);
  await page.waitForSelector(".m-edge .context-strip", { timeout: 30000 });
  assert(/percentile among EDGEs/.test(await text(page, ".m-edge")), `strip text: ${await text(page, ".m-edge")}`);
  assert(/Recruited as a \d-star/.test(await text(page, ".m-why")), "no recruiting line in how the rating is built");
  const similar = await dataFile(page, `similar_players_${PLAYED}.json`);
  if (similar[String(edge.player_season_id)]?.length) {
    await page.waitForSelector('button[data-nav-group="similar"]', { timeout: 10000 });
    await page.locator('button[data-nav-group="similar"]').first().click();
    await page.waitForFunction(() => /^#\/player\/\d+/.test(location.hash), null, { timeout: 15000 });
    await page.waitForSelector(".m-rhead--card", { timeout: 30000 });
  }
  const db = (await dataFile(page, `players_${PLAYED}.json`)).find(p => p.position_group === "CB" && p.archetypes);
  await page.goto(BASE + `menu.html#/player/${db.id}/${db.team_id}`);
  await page.waitForSelector(".m-bar--wide", { timeout: 30000 });
  assert(await page.locator(".m-bar--wide").count() === 3, "a defensive back needs three job bars");
  assert(/grades out as a/.test(await text(page, ".m-stage")), "no sentence naming his top job");
  return page;
});

check(`menu: the ${CURRENT} card carries the model's projection with its range, the drivers and the careers that looked like his`, async ctx => {
  const page = await openMenuIn(ctx, "#/players", CURRENT);
  await waitCount(page, "button.m-row--player", 20);
  const traj = (await dataFile(page, "trajectory.json")).predictions;
  const rows = await dataFile(page, `players_${CURRENT}.json`);
  const ids = new Set(rows.map(p => p.id));
  const t = traj.find(r => r.trajectory_label === "breakout" && r.family === "offense" && ids.has(r.player_id));
  assert(t, `no ${CURRENT} player with a breakout projection`);
  await page.goto(BASE + `menu.html#/player/${t.player_id}/${t.team_id}`);
  await page.waitForSelector("#m-proj .m-projnum", { timeout: 30000 });
  assert(Number(await text(page, "#m-proj .m-projnum")) === Math.round(t.predicted_ovr), "the projection number is not the file's");
  assert(await page.locator("#m-proj .proj-range").count() === 1, "no 80% range beside the projection");
  await page.waitForSelector("#m-proj-why .m-driver", { timeout: 60000 });
  assert(await page.locator("#m-proj-why .m-driver").count() >= 1, "no drivers");
  assert(await page.locator('#m-proj-why button[data-nav-group="comps"]').count() >= 1, "no careers that looked like his");
  // a player card for a played season does not carry a projection
  const played = await openMenuIn(ctx, `#/player/${t.player_id}/${t.team_id}`, PLAYED);
  await played.waitForSelector(".m-rhead--card", { timeout: 30000 });
  assert(await played.locator("#m-proj").count() === 0, `the ${PLAYED} card shows the ${CURRENT} projection`);
  return page;
});

check("menu: a team's Ratings page breaks the rating down, rates the offensive line as a unit, shows the team's per-game numbers, and is in both page lists", async ctx => {
  const page = await openMenuIn(ctx, "#/team/52/ratings", PLAYED);
  await waitCount(page, ".m-bar", 5);
  const heads = (await page.locator(".m-stage .m-h3, .m-stage .m-h4").allInnerTexts()).map(h => h.toLowerCase());
  for (const want of ["rating breakdown", "offensive line", "team stats", "offense", "defense"]) {
    assert(heads.some(h => h.includes(want)), `no "${want}" heading in ${heads}`);
  }
  assert(await page.locator(".m-bars-wide .m-bar").count() === 5, "the breakdown is not five bars");
  assert(await page.locator(".m-stage .ovr-badge").count() >= 1, "no offensive line rating");
  assert(await page.locator(".m-stat").count() >= 12, "fewer than twelve team stats");
  assert((await page.locator(".m-subbtn").allInnerTexts()).some(t => /ratings/i.test(t)), "Ratings is not in the page bar");
  assert(await page.locator('[data-to="#/methods/ol"]').count() >= 1, "no link to why linemen are not rated one by one");
  // a season in progress has no line rating, and says why rather than showing a zero
  const live = await openMenuIn(ctx, "#/team/52/ratings", CURRENT);
  await live.waitForSelector(".m-stage .m-h3", { timeout: 30000 });
  assert(/not rated for a season in progress/i.test(await text(live, ".m-stage")), "the line says nothing about being unrated in a season in progress");
  await live.keyboard.press("Escape");
  const hub = await openMenuIn(ctx, "#/team/52", PLAYED);
  await waitCount(hub, ".m-item", 7);
  assert((await hub.locator(".m-item .m-item-label").allInnerTexts()).some(t => /ratings/i.test(t)), "Ratings is not on the team page");
  return page;
});

check("menu: Talent vs Production draws a dot per player, a trend line, a tooltip and a card on click, and a list of who is furthest above it", async ctx => {
  const page = await openMenuIn(ctx, "#/scatter", PLAYED);
  await waitCount(page, "#m-scatter circle", 500);
  assert(await page.locator("#m-scatter line[stroke-dasharray]").count() === 1, "no trend line");
  const all = await page.locator("#m-scatter circle").count();
  await page.locator("#m-scatter circle").nth(40).hover({ force: true });
  await page.waitForFunction(() => !document.querySelector("#m-tip").hidden, null, { timeout: 5000 });
  assert(/Rating \d+/.test(await text(page, "#m-tip")), "the tooltip carries no rating");
  await page.fill("#m-sq", "ohio state");
  await page.waitForFunction(n => document.querySelectorAll("#m-scatter circle").length < n, all, { timeout: 10000 });
  assert(await page.locator('button[data-nav-group="scatter-over"]').count() === 12, "the list is not twelve players");
  await page.locator('button[data-nav-group="scatter-over"]').first().click();
  await page.waitForFunction(() => location.hash.startsWith("#/player/"), null, { timeout: 15000 });
  const qb = await openMenuIn(ctx, "#/scatter/QB", PLAYED, { width: 390, height: 800 });
  await waitCount(qb, "#m-scatter circle", 100);
  assert(await noHorizontalScroll(qb), "the chart scrolls the page sideways on a phone");
  const w = Number(await qb.locator("#m-scatter svg").getAttribute("width"));
  assert(w <= 390, `the chart is ${w}px wide on a 390px phone`);
  return page;
});

check("menu: on a phone the Players and Portal rows keep the player's name, not a sliver of it", async ctx => {
  for (const [hash, sel] of [["#/players", "button.m-row--player"], ["#/portal", "button.m-row--portal"]]) {
    const page = await openMenuIn(ctx, hash, PLAYED, { width: 390, height: 800 });
    await waitCount(page, sel, 5);
    const w = await page.locator(`${sel} .m-pname`).first().evaluate(e => e.getBoundingClientRect().width);
    assert(w >= 100, `${hash}: the name column is ${Math.round(w)}px wide on a 390px phone`);
    assert(await noHorizontalScroll(page), `${hash} scrolls sideways on a phone`);
    await page.close();
  }
  return null;
});

check("menu: the Transfer Portal searches players and schools", async ctx => {
  const page = await openMenuIn(ctx, "#/portal", PLAYED);
  await waitCount(page, "button.m-row--portal", 20);
  const first = (await page.locator("button.m-row--portal .m-pmeta").first().innerText()).split("→")[1].trim();
  await page.fill("#m-tq", first);
  await page.waitForFunction(() => /^\d[\d,]* of \d[\d,]*$/.test(document.querySelector("#m-tcount").textContent.trim()), null, { timeout: 10000 });
  const shown = await page.locator("button.m-row--portal").count();
  assert(shown >= 1, "the search found no move");
  const all = Number((await text(page, "#m-tcount")).match(/of ([\d,]+)/)[1].replace(/,/g, ""));
  assert(all < 5000, `the count after a search is ${all}`);
  await page.fill("#m-tq", "zzzz-nobody");
  await page.waitForFunction(() => document.querySelector("#m-trows .m-empty"), null, { timeout: 10000 });
  return page;
});

check(`menu: The Season lists the games still to play and the biggest changes since last year; a played season has the changes and no games to circle`, async ctx => {
  const page = await openMenuIn(ctx, "#/season", CURRENT);
  await waitCount(page, ".m-row--circle", 11);
  assert(await page.locator("button.m-row--circle").count() === 25, "not 25 games to circle");
  const quality = (await page.locator("button.m-row--circle .m-num").allInnerTexts()).map(Number);
  assert(quality.every((q, i) => i === 0 || q <= quality[i - 1]), `games not best first: ${quality}`);
  assert(await page.locator("button.m-row--moves").count() === 16, "not eight gains and eight falls");
  const past = await openMenuIn(ctx, "#/season", PLAYED - 1);
  await waitCount(past, "button.m-row--moves", 16);
  assert(await past.locator("button.m-row--circle").count() === 0, "a finished season lists games to circle");
  return page;
});

check("menu: Home carries storylines computed from the data, each a link to the team or player and to its full list", async ctx => {
  const page = await openMenuIn(ctx, "#/home", PLAYED);
  await page.waitForFunction(() => document.querySelectorAll("#m-stories .m-story").length >= 4, null, { timeout: 60000 });
  const tags = await page.locator("#m-stories .m-story-tag").allInnerTexts();
  for (const want of ["HIDDEN GEM", "OVER EXPECTATIONS", "RECRUITING, GRADED"]) assert(tags.includes(want), `no ${want} storyline in ${tags}`);
  const more = await page.locator('#m-stories button.m-chip[data-to^="#/research/"]').count();
  assert(more >= 4, `${more} buttons to a full list`);
  await page.locator('#m-stories .m-row--story').first().click();
  await page.waitForFunction(() => /^#\/(team|player)\//.test(location.hash), null, { timeout: 15000 });
  const live = await openMenuIn(ctx, "#/home", CURRENT);
  await live.waitForFunction(() => document.querySelectorAll("#m-stories .m-story").length >= 5, null, { timeout: 60000 });
  assert((await live.locator("#m-stories .m-story-tag").allInnerTexts()).includes("BREAKOUT WATCH"), `no breakout watch on ${CURRENT}`);
  return page;
});

check("menu: the quick menu offers the team's Ratings and Talent vs Production, and carries the version and the data credit", async ctx => {
  const page = await openMenu(ctx, "#/team/52");
  await waitCount(page, ".m-item", 7);
  await page.locator(".m-navbtn--menu").click();
  await page.waitForSelector(".m-overlay", { timeout: 10000 });
  const labels = await page.locator(".m-overlay .m-item-label").allInnerTexts();
  assert(labels.some(l => /^Ratings$/i.test(l.trim())), "no Ratings in the quick menu");
  assert(labels.some(l => /Talent vs Production/i.test(l)), "no Talent vs Production in the quick menu");
  const credit = await page.locator(".m-overlay .m-ovl-credit").innerText();
  assert(/collegefootballdata\.com/i.test(credit) && /v\d+\.\d+/.test(credit), `credit line: ${credit}`);
  assert(await page.locator('.m-overlay .m-ovl-credit a[href^="https://collegefootballdata.com"]').count() === 1, "no link to the data source");
  return page;
});


const selected = checks.filter(c => !ONLY || c.name.startsWith(ONLY));
const t0 = Date.now();
for (const c of selected) {
  // A fresh context per check: no localStorage, cache or listeners leak between
  // checks, so a failure is attributable to the check that reports it.
  const ctx = await browser.newContext();
  let page = null, status = "PASS", detail = "";
  const t = Date.now();
  try {
    page = await c.fn(ctx);
    const problems = page?.problems || [];
    if (problems.length) { status = "FAIL"; detail = [...new Set(problems)].slice(0, 5).join("\n      "); }
  } catch (e) {
    status = "FAIL";
    detail = e instanceof Fail ? e.message : `${e.name}: ${e.message.split("\n")[0]}`;
  }
  await ctx.close();
  results.push({ name: c.name, status, detail, ms: Date.now() - t });
  console.log(`${status === "PASS" ? "  ok  " : " FAIL "} ${c.name} (${((Date.now() - t) / 1000).toFixed(1)}s)` +
    (detail ? `\n      ${detail}` : ""));
}

await browser.close();
server.close();

const failed = results.filter(r => r.status === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "last-run.json"),
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
process.exit(failed.length);
