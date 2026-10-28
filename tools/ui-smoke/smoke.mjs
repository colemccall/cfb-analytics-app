// smoke.mjs — drives every page, panel and control of the site in a real browser.
//
// What it proves: each page loads without a script error or a failed request,
// every panel renders content rather than an empty/error state, and every
// control (filters, chips, tabs, sort headers, season pickers, the player modal,
// deep links, the theme switch) does what it is labelled to do. What it does NOT
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

// Section titles are uppercased by CSS, so compare on textContent, lowercased.
const sectionTitles = page => page.locator("#player-modal .modal-section-title")
  .evaluateAll(els => els.map(e => e.textContent.trim().toLowerCase()));

// Error and empty states are real UI and legitimate in some places, so this
// reports them rather than failing on them; callers assert where one is a bug.
async function errorStates(page, scope = "body") {
  return page.locator(`${scope} .error-state`).allInnerTexts();
}

async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

// ════════════════════════════════════════════════════════════════════════════
// Shell — present on every page
// ════════════════════════════════════════════════════════════════════════════

// The number of nav entries is read from shell.js (the PAGES list there), so adding a page
// cannot leave this test asserting yesterday's count.
const NAV_COUNT = (fs.readFileSync(path.join(APP_ROOT, "js", "shell.js"), "utf8").match(/{ id: "[a-z0-9]+", +href:/g) || []).length;

const PAGES = [
  "index.html?classic", "season2026.html", "teams.html", "players.html", "ratings.html",
  "research.html", "methods.html", "changes.html", "info.html", "league.html",
  "research-team-performance.html", "research-coaching-impact.html",
  "research-recruiting-roi.html", "research-breakout.html",
  "research-transfer-roi.html", "research-player-development.html",
  "research-roster-composition.html",
  "story-hidden-gems.html", "story-team-movement.html",
];

for (const p of PAGES) {
  check(`shell: ${p} loads clean, nav + active item`, async ctx => {
    const page = await openPage(ctx, p);
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    const nav = await page.locator(".sidebar .snav-item").count();
    assert(nav === NAV_COUNT, `sidebar has ${nav} links, expected ${NAV_COUNT}`);
    const active = await page.locator(".sidebar .snav-item.active").count();
    // Research sub-pages declare data-page="research" and so light Research.
    assert(active === 1, `${active} active nav items, expected 1`);
    const errs = await errorStates(page);
    assert(!errs.length, `error state rendered: ${errs.join(" | ")}`);
    return page;
  });
}

check("shell: theme switch flips data-theme, persists, repaints without errors", async ctx => {
  const page = await openPage(ctx, "index.html?classic");
  await waitCount(page, "#storylines .story-card", 1);
  const before = await page.getAttribute("html", "data-theme");
  const target = before === "dark" ? "light" : "dark";
  await page.click(`.theme-swatch[data-theme-pick="${target}"]`);
  assert(await page.getAttribute("html", "data-theme") === target, "data-theme did not change");
  const saved = await page.evaluate(() => localStorage.getItem("cfb-theme"));
  assert(saved === target, `localStorage has ${saved}`);
  await page.reload({ waitUntil: "domcontentloaded" });
  assert(await page.getAttribute("html", "data-theme") === target, "theme did not survive reload");
  return page;
});

check("shell: ?theme= URL override wins over the saved theme", async ctx => {
  const page = await openPage(ctx, "methods.html?theme=light");
  assert(await page.getAttribute("html", "data-theme") === "light", "override ignored");
  return page;
});

check("shell: mobile — tab bar shows 5 items, sidebar hidden, no horizontal scroll", async ctx => {
  const page = await openPage(ctx, "index.html?classic", { width: 375, height: 800 });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  const tabs = await page.locator(".mobile-tab-bar .mobile-tab-btn").count();
  assert(tabs === 5, `${tabs} mobile tabs`);
  assert(await page.locator(".mobile-tab-bar").isVisible(), "mobile tab bar not visible");
  assert(!(await page.locator(".sidebar").isVisible()), "sidebar visible on a phone");
  assert(await noHorizontalScroll(page), "page scrolls horizontally at 375px");
  return page;
});

for (const p of ["players.html", "teams.html", "ratings.html", "season2026.html", "methods.html",
                 "changes.html", "research-breakout.html", "info.html"]) {
  check(`shell: mobile ${p} has no horizontal scroll`, async ctx => {
    const page = await openPage(ctx, p, { width: 375, height: 800 });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(500);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert(w[0] <= w[1] + 1, `scrollWidth ${w[0]} > viewport ${w[1]}`);
    return page;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Home
// ════════════════════════════════════════════════════════════════════════════

check("home: every panel renders", async ctx => {
  const page = await openPage(ctx, "index.html?classic");
  const stories = await waitCount(page, "#storylines .story-card", 3);
  await waitCount(page, "#home-top-teams .home-team-row", 8);
  await waitCount(page, "#home-research .mini-finding", 1);
  await waitCount(page, "#storyline-index .finding-card", 1);
  await page.waitForFunction(() => document.querySelector("#coverage-strip span"));
  const headline = await text(page, "#masthead-headline");
  assert(headline.trim().length > 0, "masthead headline empty");
  const date = await text(page, "#masthead-date");
  assert(date.trim().length > 0, "masthead date empty");
  assert(stories >= 3, `${stories} storylines`);
  return page;
});

check("home: a player link in a storyline opens the modal in place", async ctx => {
  const page = await openPage(ctx, "index.html?classic");
  await waitCount(page, "#storylines a.entity-link--player", 1);
  await page.locator("#storylines a.entity-link--player").first().click();
  await page.waitForSelector("#player-modal.open .modal-body", { timeout: 60000 });
  assert(page.url().includes("index.html"), "navigated away instead of opening the modal");
  return page;
});

// ════════════════════════════════════════════════════════════════════════════
// Players
// ════════════════════════════════════════════════════════════════════════════

const ROWS = "#player-grid-rows .draft-row";

check("players: grid renders, count label matches rows", async ctx => {
  const page = await openPage(ctx, "players.html");
  const n = await waitCount(page, ROWS, 50);
  const label = await text(page, "#result-count");
  assert(label.startsWith(String(n)), `label "${label}" vs ${n} rows`);
  const notice = await page.locator("#season-provenance .projected-notice").count();
  assert(notice === 1, "projected-season notice missing on the default (projected) season");
  return page;
});

check("players: position chip QB filters to QBs only", async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  await page.click('#pos-chips-offense .pos-chip[data-pos="QB"]');
  await page.waitForFunction(r => [...document.querySelectorAll(r)].every(
    x => x.querySelector(".pos-group-badge")?.textContent === "QB"), ROWS, { timeout: 30000 });
  const n = await page.locator(ROWS).count();
  assert(n > 0 && n <= 100, `${n} QB rows`);
  const active = await page.locator(".pos-chip.active").allInnerTexts();
  assert(active.length === 1 && active[0] === "QB", `active chips: ${active}`);
  return page;
});

check("players: DB chip selects the whole secondary (CB ∪ S ∪ DB)", async ctx => {
  // CONFIG.POSITION_FILTER_GROUPS says a DB filter means CB, S and DB. Every
  // other filter on the site honours it through matchesPosition().
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  await page.click('#pos-chips-defense .pos-chip[data-pos="DB"]');
  await page.waitForTimeout(1500);
  const badges = new Set(await page.locator(`${ROWS} .pos-group-badge`).allInnerTexts());
  assert(badges.has("CB") || badges.has("S"),
    `DB filter shows only ${[...badges].join(",")} — CB and S excluded`);
  return page;
});

check("players: conference filter restricts every row", async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  const opts = await page.locator("#filter-conference option").allInnerTexts();
  assert(opts.length > 5, `${opts.length} conference options`);
  await page.selectOption("#filter-conference", "SEC");
  await page.waitForFunction(r => {
    const rows = [...document.querySelectorAll(r)];
    return rows.length && rows.every(x => x.querySelector(".draft-yr-conf").textContent.includes("SEC"));
  }, ROWS, { timeout: 30000 });
  return page;
});

check("players: min-OVR slider hides everything below it", async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  await page.locator("#filter-min-rating").fill("85");
  await page.waitForTimeout(300);
  const ratings = await page.locator(ROWS).evaluateAll(rs => rs.map(r => +r.dataset.rating));
  assert(ratings.length > 0, "slider at 85 left no rows");
  assert(ratings.every(v => v >= 85), `row below 85: ${Math.min(...ratings)}`);
  assert((await text(page, "#min-rating-label")) === "85", "label did not update");
  return page;
});

check("players: text search matches name or team", async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  await page.fill("#search-input", "Alabama");
  await page.waitForTimeout(600);
  const teams = await page.locator(`${ROWS} .draft-team`).allInnerTexts();
  const names = await page.locator(`${ROWS} .draft-name`).allInnerTexts();
  assert(teams.length > 0, "no rows for 'Alabama'");
  assert(teams.every((t, i) => /alabama/i.test(t) || /alabama/i.test(names[i])), "non-matching row");
  return page;
});

check(`players: switching to ${PLAYED} relabels columns and drops the projected notice`, async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  await page.selectOption("#filter-season", String(PLAYED));
  await page.waitForFunction(() =>
    document.querySelector(".draft-board-header")?.textContent.includes("EDGE %"), null, { timeout: 60000 });
  assert(await page.locator("#season-provenance .projected-notice").count() === 0, "stale projected notice");
  const seasons = await page.locator(ROWS).evaluateAll(rs => [...new Set(rs.map(r => r.dataset.season))]);
  assert(seasons.length === 1 && seasons[0] === String(PLAYED), `row seasons: ${seasons}`);
  return page;
});

check("players: Yr column shows a class year, not a dash on every row", async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  const yrs = await page.locator(`${ROWS} .draft-yr-conf`).allInnerTexts();
  const dashed = yrs.filter(y => y.trim().startsWith("—")).length;
  assert(dashed < yrs.length * 0.2, `${dashed}/${yrs.length} rows show no class year`);
  return page;
});

check("players: clicking a sort header reorders the grid", async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  const header = page.locator(".draft-board-header span", { hasText: "Wt" });
  await header.click();
  const wts = await page.locator(`${ROWS} .draft-wt`).allInnerTexts();
  const nums = wts.map(Number).filter(n => !isNaN(n) && n > 0);
  const sorted = [...nums].sort((a, b) => a - b);
  assert(JSON.stringify(nums) === JSON.stringify(sorted), "weights not ascending after one click");
  assert((await header.innerText()).includes("▲"), "no sort arrow");
  return page;
});

check("players: row click opens the modal; ✕, backdrop and Escape all close it", async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  const open = async () => {
    await page.locator(`${ROWS} .draft-name`).first().click();
    await page.waitForSelector("#player-modal.open .modal-body", { timeout: 90000 });
  };
  await open();
  const name = await text(page, "#player-modal .modal-title h2");
  assert(name && name !== "Unknown" && name !== "Player not found", `modal title "${name}"`);
  await page.click("#player-modal .modal-header .modal-close");
  assert(!(await page.locator("#player-modal.open").count()), "✕ did not close");
  await open();
  await page.mouse.click(5, 450);  // the backdrop, left of the modal
  assert(!(await page.locator("#player-modal.open").count()), "backdrop click did not close");
  await open();
  await page.keyboard.press("Escape");
  assert(!(await page.locator("#player-modal.open").count()), "Escape did not close");
  return page;
});

check("players: Escape still closes the modal after another key was pressed", async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  await page.locator(`${ROWS} .draft-name`).first().click();
  await page.waitForSelector("#player-modal.open .modal-body", { timeout: 90000 });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  assert(!(await page.locator("#player-modal.open").count()), "Escape ignored after a Tab keypress");
  return page;
});

check(`players: ${PLAYED} modal renders stats, EDGE, rating breakdown and history`, async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  await page.selectOption("#filter-season", String(PLAYED));
  await page.click('#pos-chips-offense .pos-chip[data-pos="QB"]');
  await page.waitForFunction(([r, s]) => [...document.querySelectorAll(r)].every(
    x => x.querySelector(".pos-group-badge")?.textContent === "QB" && x.dataset.season === s),
    [ROWS, String(PLAYED)], { timeout: 60000 });
  await page.locator(`${ROWS} .draft-name`).first().click();
  await page.waitForSelector("#player-modal.open .modal-body", { timeout: 90000 });
  const titles = await sectionTitles(page);
  for (const want of ["Season Stats", "EDGE Score", "Why this rating?", "Career Stats"]) {
    assert(titles.some(t => t.includes(want.toLowerCase())), `missing section "${want}" — have: ${titles.join(" / ")}`);
  }
  const statVals = await page.locator("#player-modal .stats-grid .stat-val").allInnerTexts();
  assert(statVals.some(v => v !== "—"), "every season stat is a dash");
  return page;
});

check(`players: ${CURRENT} modal shows the projection and its reasoning`, async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  await page.click('#pos-chips-offense .pos-chip[data-pos="QB"]');
  await page.waitForTimeout(1500);
  await page.locator(`${ROWS} .draft-name`).first().click();
  await page.waitForSelector("#player-modal.open .modal-body", { timeout: 90000 });
  const titles = await sectionTitles(page);
  assert(titles.some(t => t.includes("projection")), `no projection section — have: ${titles.join(" / ")}`);
  assert(!titles.some(t => t.includes("why this rating?")), "earned-rating breakdown shown on a projected season");
  await page.waitForFunction(() => {
    const h = document.getElementById("proj-reasoning");
    return h && !h.querySelector(".skeleton");
  }, null, { timeout: 90000 });
  return page;
});

check("players: similar-player row opens that player", async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  await page.selectOption("#filter-season", String(PLAYED));
  await page.waitForFunction(([r, s]) => document.querySelector(r)?.dataset.season === s,
    [ROWS, String(PLAYED)], { timeout: 60000 });
  await page.locator(`${ROWS} .draft-name`).first().click();
  await page.waitForSelector("#player-modal.open .modal-body", { timeout: 90000 });
  const sims = page.locator("#player-modal .similar-row");
  if (!(await sims.count())) return page;  // not every player has comps
  const target = (await sims.first().locator(".similar-name").innerText()).trim();
  await sims.first().click();
  await page.waitForFunction(t => document.querySelector("#player-modal .modal-title h2")?.textContent.trim() === t,
    target, { timeout: 90000 });
  return page;
});

check("players: ?player=ID deep link opens that player", async ctx => {
  // playerHref() builds these links and they are the fallback on every page
  // that does not host the modal, and on any ctrl/cmd-click.
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  const id = await page.locator(ROWS).first().getAttribute("data-id");
  await page.goto(`${BASE}players.html?player=${id}&season=${CURRENT}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#player-modal.open .modal-body", { timeout: 30000 })
    .catch(() => { throw new Fail("deep link landed on the board with no player open"); });
  return page;
});

check("players: theme switch does not duplicate position chips", async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  const before = await page.locator(".pos-chip").count();
  const cur = await page.getAttribute("html", "data-theme");
  await page.click(`.theme-swatch[data-theme-pick="${cur === "dark" ? "light" : "dark"}"]`);
  await page.waitForTimeout(300);
  const after = await page.locator(".pos-chip").count();
  assert(after === before, `${before} chips before the theme switch, ${after} after`);
  return page;
});

check("players: a filter survives a theme switch", async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  await page.click('#pos-chips-offense .pos-chip[data-pos="WR"]');
  await page.waitForTimeout(1500);
  const cur = await page.getAttribute("html", "data-theme");
  await page.click(`.theme-swatch[data-theme-pick="${cur === "dark" ? "light" : "dark"}"]`);
  await page.waitForTimeout(300);
  const active = await page.locator(".pos-chip.active").allInnerTexts();
  assert(active.length === 1 && active[0] === "WR", `active chip after theme switch: ${active.join(",")}`);
  return page;
});

// ════════════════════════════════════════════════════════════════════════════
// Teams
// ════════════════════════════════════════════════════════════════════════════

async function openTeam(ctx, query = "") {
  const page = await openPage(ctx, `teams.html${query}`);
  await waitCount(page, "#team-list .team-tile", 100);
  if (!query) await page.locator("#team-list .team-tile").first().click();
  await page.waitForSelector(".d-team-hero", { timeout: 30000 });
  return page;
}

check("teams: tile wall renders, click opens a team with its roster", async ctx => {
  const page = await openTeam(ctx);
  await waitCount(page, "#roster-cards .draft-row", 20);
  assert(page.url().includes("#"), "hash not set for the selected team");
  return page;
});

for (const tab of ["roster", "ratings", "schedule", "transfers", "history"]) {
  for (const season of [CURRENT, PLAYED]) {
    check(`teams: ${tab} tab renders (${season})`, async ctx => {
      const page = await openTeam(ctx, `?team=Georgia&season=${season}`);
      if (season !== CURRENT) {
        await page.selectOption("#year-select", String(season));
        await page.waitForFunction(s => document.querySelector(".hero-stat-sm")?.textContent.includes(s),
          String(season), { timeout: 30000 });
      }
      await page.click(`#team-subnav .tab[data-tab="${tab}"]`);
      await page.waitForFunction(() => !document.querySelector("#team-tab-content .skeleton"), null, { timeout: 60000 });
      const errs = await errorStates(page, "#team-tab-content");
      assert(!errs.length, errs.join(" | "));
      const body = (await text(page, "#team-tab-content")).trim();
      assert(body.length > 20, `tab body nearly empty: "${body}"`);
      return page;
    });
  }
}

check("teams: ?team= deep link and #slug deep link both open the team", async ctx => {
  const page = await openTeam(ctx, "?team=Boise%20State");
  assert((await text(page, ".d-hero-name")) === "Boise State", "?team= opened the wrong team");
  await page.goto(`${BASE}teams.html#ohio-state`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".d-team-hero", { timeout: 30000 });
  assert((await text(page, ".d-hero-name")) === "Ohio State", "#slug opened the wrong team");
  return page;
});

check("teams: conference chip and search narrow the tile wall", async ctx => {
  const page = await openPage(ctx, "teams.html");
  const all = await waitCount(page, "#team-list .team-tile", 100);
  await page.click('#conf-filter .pos-chip[data-conf="SEC"]');
  const sec = await page.locator("#team-list .team-tile").count();
  assert(sec > 10 && sec < all, `SEC chip: ${sec} of ${all}`);
  await page.click('#conf-filter .pos-chip[data-conf="ALL"]');
  await page.fill("#team-search", "state");
  await page.waitForTimeout(400);
  const titles = await page.locator("#team-list .team-tile").evaluateAll(ts => ts.map(t => t.title));
  assert(titles.length > 0 && titles.every(t => /state/i.test(t)), "search let a non-match through");
  return page;
});

check("teams: conference chips follow the season picker", async ctx => {
  // Realignment: the Pac-12 had 12 members in 2013 and 2 in 2025. A chip list
  // built once for the default season is wrong for most of the archive.
  const page = await openPage(ctx, "teams.html");
  await waitCount(page, "#team-list .team-tile", 100);
  await page.selectOption("#year-select", "2013");
  await page.waitForTimeout(1500);
  const chips = await page.locator("#conf-filter .pos-chip").allInnerTexts();
  const tileConfs = await page.locator("#team-list .team-tile").evaluateAll(ts =>
    [...new Set(ts.map(t => t.title.split(" · ")[1]).filter(Boolean))]);
  const missing = tileConfs.filter(c => !chips.includes(c));
  assert(!missing.length, `2013 conferences with no chip: ${missing.join(", ")}`);
  return page;
});

// ═══════════════════════════════════════════════════════════════
// v4.6 — school marks, keyboard access, skin contract
// ═══════════════════════════════════════════════════════════════

check("shell: swatches come from CONFIG.THEMES; version, skip link and CFBD credit present", async ctx => {
  const page = await openPage(ctx, "index.html?classic");
  const n = await page.locator(".theme-swatch").count();
  const want = await page.evaluate(() => CONFIG.THEMES.length);
  assert(n === want, `${n} swatches for ${want} themes`);
  const v = await text(page, ".sidebar-version");
  assert(!/^v3\./.test(v), `sidebar still says ${v}`);
  const credit = await page.getAttribute(".sidebar-credit", "href");
  assert(/collegefootballdata\.com/.test(credit || ""), "CFBD attribution link missing");
  await page.keyboard.press("Tab");
  assert(await page.evaluate(() => document.activeElement.className) === "skip-link", "first Tab stop is not the skip link");
  await page.keyboard.press("Enter");
  assert(await page.evaluate(() => location.hash) === "#main-content", "skip link did not navigate");
  assert(await page.evaluate(() => document.activeElement.id) === "main-content", "focus did not reach the main column");
  return page;
});

check("marks: logos are https, and a logo that fails to load becomes a monogram", async ctx => {
  await ctx.route(/espncdn\.com/, r => r.abort());
  const page = await openPage(ctx, "teams.html");
  await waitCount(page, ".team-tile", 50);
  // Tile logos are loading="lazy": one that was never scrolled into view never
  // tried to load, so scroll each into view until every one has failed over.
  await page.waitForFunction(() => {
    const imgs = document.querySelectorAll(".team-tile img.team-tile-logo");
    imgs.forEach(i => i.scrollIntoView({ block: "center" }));
    return imgs.length === 0;
  }, null, { timeout: 30000, polling: 250 });
  const marks = await page.locator(".team-tile .team-mark").count();
  assert(marks >= 100, `only ${marks} monograms after every logo failed`);
  const insecure = await page.locator('img[src^="http://"]').count();
  assert(insecure === 0, `${insecure} plain-http images`);
  const label = (await text(page, ".team-tile .team-mark")).trim();
  assert(label.length >= 1 && label.length <= 4, `monogram label "${label}"`);
  return page;
});

check("players: a row opens from the keyboard; the modal traps Tab and returns focus", async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  const row = page.locator(ROWS).first();
  const id = await row.getAttribute("data-id");
  await row.focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector("#player-modal.open .modal-body", { timeout: 90000 });
  assert(await page.getAttribute("#player-modal", "role") === "dialog", "modal has no role=dialog");
  assert(await page.getAttribute("#player-modal", "aria-modal") === "true", "modal has no aria-modal");
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => document.getElementById("player-modal").contains(document.activeElement));
    assert(inside, `focus left the modal after ${i + 1} Tabs`);
  }
  await page.keyboard.press("Escape");
  const back = await page.evaluate(() => document.activeElement?.getAttribute?.("data-id") ?? null);
  assert(back === id, `focus returned to ${back}, expected the row ${id}`);
  return page;
});

check("teams: roster header sorts from the keyboard", async ctx => {
  const page = await openTeam(ctx, "?team=Georgia");
  await waitCount(page, "#roster-cards .draft-row", 20);
  const header = page.locator("#roster-cards .draft-board-header span", { hasText: "Wt" }).first();
  await header.focus();
  await page.keyboard.press("Enter");
  assert((await header.innerText()).includes("▲"), "no sort arrow after Enter");
  const wts = (await page.locator("#roster-cards .draft-wt").allInnerTexts()).map(Number).filter(Number.isFinite);
  assert(wts.length > 5 && wts.every((w, i) => i === 0 || w >= wts[i - 1]), "weights not ascending after Enter");
  return page;
});

check("teams: roster position chip filters, row opens modal", async ctx => {
  const page = await openTeam(ctx, "?team=Georgia");
  await waitCount(page, "#roster-cards .draft-row", 20);
  await page.click('[data-posfilter="WR"]');
  const badges = await page.locator("#roster-cards .draft-row .pos-group-badge").allInnerTexts();
  assert(badges.length && badges.every(b => b === "WR"), `WR filter shows ${[...new Set(badges)]}`);
  await page.click('[data-posfilter="DB"]');
  const db = new Set(await page.locator("#roster-cards .draft-row .pos-group-badge").allInnerTexts());
  assert([...db].every(b => ["CB", "S", "DB"].includes(b)), `DB filter shows ${[...db]}`);
  await page.locator("#roster-cards .draft-row").first().click();
  await page.waitForSelector("#player-modal.open .modal-body", { timeout: 90000 });
  return page;
});

check("teams: ratings tab top performer opens modal", async ctx => {
  const page = await openTeam(ctx, "?team=Georgia");
  await page.click('#team-subnav .tab[data-tab="ratings"]');
  await waitCount(page, ".tperf-row", 1, 60000);
  await page.locator(".tperf-row").first().click();
  await page.waitForSelector("#player-modal.open .modal-body", { timeout: 90000 });
  return page;
});

check("teams: schedule table sorts, opponent link navigates", async ctx => {
  const page = await openTeam(ctx, `?team=Georgia`);
  await page.selectOption("#year-select", String(PLAYED));
  await page.waitForTimeout(1500);
  await page.click('#team-subnav .tab[data-tab="schedule"]');
  await waitCount(page, "#team-tab-content tbody tr", 10);
  await page.click("#team-tab-content th:has-text('Opponent')");
  assert(await page.getAttribute("#team-tab-content th:has-text('Opponent')", "aria-sort") === "ascending",
    "sort did not mark ascending");
  await page.locator("#team-tab-content a.entity-link--team").first().click();
  await page.waitForSelector(".d-team-hero", { timeout: 30000 });
  assert((await text(page, ".d-hero-name")) !== "Georgia", "opponent link did not change team");
  return page;
});

check("teams: conference-standing chip expands", async ctx => {
  const page = await openTeam(ctx, "?team=Georgia");
  await page.click(".d-conf-standing-chip");
  assert(await page.locator(".d-conf-standing-chip.expanded").count() === 1, "did not expand");
  return page;
});

check("teams: phone picker toggle opens and a tile choice closes it", async ctx => {
  const page = await openPage(ctx, "teams.html", { width: 390, height: 800 });
  await waitCount(page, "#team-list .team-tile", 100);
  await page.click(".picker-toggle");
  assert(await page.locator(".teams-layout.picker-open").count() === 1, "picker did not open");
  await page.locator("#team-list .team-tile").first().click();
  await page.waitForSelector(".d-team-hero");
  assert(await page.locator(".teams-layout.picker-open").count() === 0, "picker stayed open");
  return page;
});

// ════════════════════════════════════════════════════════════════════════════
// Ratings
// ════════════════════════════════════════════════════════════════════════════

check("ratings: scatter, position filter, team filter", async ctx => {
  const page = await openPage(ctx, "ratings.html");
  const dots = await waitCount(page, "#scatter-chart .scatter-dot", 100);
  await page.click('#pos-filter-bar .pos-chip[data-pos="QB"]');
  const qb = await page.locator("#scatter-chart .scatter-dot").count();
  assert(qb > 5 && qb < dots, `QB filter: ${qb} of ${dots}`);
  assert((await text(page, "#scatter-count")).includes("players"), "count label missing");
  await page.click('#pos-filter-bar .pos-chip[data-pos="ALL"]');
  await page.selectOption("#team-filter-select", "Alabama");
  const bama = await page.locator("#scatter-chart .scatter-dot").evaluateAll(ds => ds.map(d => d.dataset.team));
  assert(bama.length && bama.every(t => t === "Alabama"), "team filter let other teams through");
  return page;
});

check("ratings: dot hover shows tooltip, click opens modal", async ctx => {
  const page = await openPage(ctx, "ratings.html");
  await waitCount(page, "#scatter-chart .scatter-dot", 100);
  const dot = page.locator("#scatter-chart .scatter-dot").first();
  await dot.hover({ force: true });
  assert(await page.locator("#scatter-tooltip").isVisible(), "tooltip not shown");
  await dot.click({ force: true });
  await page.waitForSelector("#player-modal.open .modal-body", { timeout: 90000 });
  return page;
});

check("ratings: leaderboard tabs switch, DB board merges CB/S/DB, header sorts", async ctx => {
  const page = await openPage(ctx, "ratings.html");
  await waitCount(page, "#position-board tbody tr", 10);
  await page.click('#board-pos-tabs .tab[data-pos="WR"]');
  await page.waitForTimeout(200);
  const foot = await text(page, "#position-board .table-footnote");
  assert(foot.includes("WR"), `footnote after WR tab: ${foot}`);
  await page.click('#board-pos-tabs .tab[data-pos="DB"]');
  const dbRows = await page.locator("#position-board tbody tr").count();
  assert(dbRows > 50, `DB board has ${dbRows} rows — expected CB+S+DB merged`);
  await page.click("#position-board th[data-col='name']");
  assert(await page.getAttribute("#position-board th[data-col='name']", "aria-sort") !== "none", "no sort state");
  await page.locator("#position-board a.entity-link--player").first().click();
  await page.waitForSelector("#player-modal.open .modal-body", { timeout: 90000 });
  return page;
});

check(`ratings: season switch to ${PLAYED} reloads both panels, filter binds once`, async ctx => {
  const page = await openPage(ctx, "ratings.html");
  await waitCount(page, "#scatter-chart .scatter-dot", 100);
  await page.selectOption("#ratings-season-select", String(PLAYED));
  await page.waitForTimeout(2500);
  await page.selectOption("#ratings-season-select", "2024");
  await page.waitForTimeout(2500);
  // Count applyFilters runs caused by one team change: one listener → one render.
  await page.evaluate(() => {
    window.__renders = 0;
    const orig = window.renderScatterPlot;
    window.renderScatterPlot = (...a) => { window.__renders++; return orig(...a); };
  });
  await page.selectOption("#team-filter-select", "Alabama");
  const renders = await page.evaluate(() => window.__renders);
  assert(renders === 1, `one team change rendered the scatter ${renders} times`);
  assert(await page.locator("#season-provenance .projected-notice").count() === 0, "stale projected notice");
  return page;
});

// ════════════════════════════════════════════════════════════════════════════
// '26 season hub
// ════════════════════════════════════════════════════════════════════════════

check("season2026: every panel renders", async ctx => {
  const page = await openPage(ctx, "season2026.html");
  await waitCount(page, "#s26-circle tbody tr", 25);
  await waitCount(page, "#s26-top25 .rank-wall-item", 25);
  await waitCount(page, "#s26-movers tbody tr", 10);
  assert(!(await page.locator("#s26-ea").count()), "the removed EA panel is back");
  assert((await text(page, "#s26-headline")).trim().length > 0, "headline empty");
  return page;
});

check("players: a projected season shows the model's range on the card, and no EA column", async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, ROWS, 50);
  const header = (await page.locator(".draft-board-header").first().innerText()).toUpperCase();
  assert(header.includes("PROJ"), `no projection column in: ${header}`);
  assert(!/\bEA\b/.test(header), "an EA column is back");
  // The range moved from its own grid column into the projection tile on the card.
  await page.locator(`${ROWS}.trio .draft-name`).first().click();
  await page.waitForSelector("#player-modal.open .trio-strip", { timeout: 90000 });
  const proj = await page.locator("#player-modal .trio-tile").nth(1).innerText();
  assert(/range\s+\d+–\d+/i.test(proj), `no range in the projection tile: ${proj.split(String.fromCharCode(10)).join(" | ")}`);
  return page;
});

// ═══════════════════════════════════════════════════════════════
// v4.8 — the League hub; v4.12 — one skin for every page
// ═══════════════════════════════════════════════════════════════

check("league: standings list every conference, best record first", async ctx => {
  const page = await openPage(ctx, "league.html?tab=standings&season=2024");
  await waitCount(page, ".league-conf .data-table", 10);
  const rows = await page.locator(".league-conf .data-table tbody tr").count();
  assert(rows >= 120 && rows <= 140, `${rows} team rows for 2024`);
  // within a conference the rank column must read 1, 2, 3 ...
  const ranks = (await page.locator("#standings-0 tbody tr td:first-child").allInnerTexts()).map(Number);
  assert(ranks.length > 5 && ranks.every((r, i) => r === i + 1), `ranks ${ranks.slice(0, 6)}`);
  return page;
});

check("league: the portal filters by position and by search text", async ctx => {
  const page = await openPage(ctx, "league.html?tab=portal&season=2025");
  await waitCount(page, "#portal-table tbody tr", 100);
  await page.click('#league-pos .pos-chip[data-pos="QB"]');
  const badges = await page.locator("#portal-table tbody tr .pos-group-badge").allInnerTexts();
  assert(badges.length && badges.every(b => b === "QB"), `QB filter shows ${[...new Set(badges)]}`);
  await page.click('#league-pos .pos-chip[data-pos="ALL"]');
  await page.fill("#league-query", "Miami");
  const texts = await page.locator("#portal-table tbody tr").allInnerTexts();
  assert(texts.length > 0 && texts.every(t => /miami/i.test(t)), "search text did not narrow the rows to Miami");
  return page;
});

check("league: a tab and a season arrive from the URL, and the portal clamps to its seasons", async ctx => {
  const page = await openPage(ctx, "league.html?tab=portal&season=2025");
  assert(await page.getAttribute('.tab[data-tab="portal"]', "class") === "tab active", "portal tab not active from ?tab=");
  assert(await page.inputValue("#league-season") === "2025", "season not taken from ?season=");
  await page.click('.tab[data-tab="standings"]');
  await page.selectOption("#league-season", "2012");
  await page.click('.tab[data-tab="portal"]');
  const season = await page.inputValue("#league-season");
  assert(season === "2026", `portal gave season ${season}; a season with no transfers file should fall back to the newest one that has one`);
  return page;
});

check("shell: every page is the console skin: a top tab strip with Menu first", async ctx => {
  const page = await openPage(ctx, "index.html?classic", { width: 1400, height: 900 });
  await waitCount(page, "#storylines .story-card", 1);
  const box = await page.locator(".sidebar").boundingBox();
  assert(box.y === 0 && box.width >= 1390 && box.height < 80, `sidebar is ${Math.round(box.width)}x${Math.round(box.height)} at y=${box.y}`);
  const ml = await page.evaluate(() => getComputedStyle(document.querySelector(".main-content")).marginLeft);
  assert(ml === "0px", `main content still offset by ${ml}`);
  const items = await page.locator(".snav-item").evaluateAll(els => els.map(e => e.getBoundingClientRect().top));
  assert(new Set(items.map(Math.round)).size === 1, "tabs are not on one row");
  const first = await page.locator(".snav-item").first().getAttribute("href");
  assert(first === "menu.html", `the first tab is ${first}, not the menu`);
  assert(await page.getAttribute("html", "data-skin") === "console", "the console skin is not on");
  return page;
});

check("shell: there are two looks, Dusk and Daylight, and the old retro one is gone", async ctx => {
  const page = await openPage(ctx, "methods.html");
  assert(await page.locator(".theme-swatch").count() === 2, "expected two theme swatches");
  assert(await page.locator('.theme-swatch[data-theme-pick="retro"]').count() === 0, "the retro swatch is still there");
  await page.click('.theme-swatch[data-theme-pick="light"]');
  assert(await page.getAttribute("html", "data-theme") === "light", "swatch did not switch to daylight");
  await page.reload({ waitUntil: "domcontentloaded" });
  assert(await page.getAttribute("html", "data-theme") === "light", "daylight did not survive a reload");
  return page;
});

check("shell: the skin does not scroll sideways at 1280px or on a phone", async ctx => {
  for (const [w, h] of [[1280, 800], [375, 800]]) {
    for (const rel of ["index.html?classic", "players.html", "teams.html", "league.html", "methods.html"]) {
      const page = await openPage(ctx, `${rel}${rel.includes("?") ? "&" : "?"}theme=dark`, { width: w, height: h });
      await page.waitForTimeout(1500);
      assert(await noHorizontalScroll(page), `${rel} scrolls sideways at ${w}px in the skin`);
      await page.close();
    }
  }
  return null;
});

check("teams: the Depth tab lists groups in rating order and says it is not an official chart", async ctx => {
  const page = await openTeam(ctx, "?team=Georgia&season=2025");
  await page.click('.tab[data-tab="depth"]');
  await waitCount(page, ".depth-group", 6);
  assert(/not an official depth chart/i.test(await text(page, ".table-footnote")), "the not-official note is missing");
  // inside each rated group the OVR pills must read best to worst
  const bad = await page.locator(".depth-group").evaluateAll(groups => groups.map(g => {
    const v = [...g.querySelectorAll(".depth-row .ovr-badge")].map(e => parseFloat(e.textContent)).filter(Number.isFinite);
    return v.every((x, i) => i === 0 || v[i - 1] >= x) ? null : v.join(",");
  }).filter(Boolean));
  assert(!bad.length, `groups out of order: ${bad.slice(0, 2).join(" | ")}`);
  await page.locator(".depth-row").first().click();
  await page.waitForSelector("#player-modal.open .modal-body", { timeout: 90000 });
  return page;
});

check("season2026: the earned-to-date section rates teams and players and says it is provisional", async ctx => {
  const page = await openPage(ctx, "season2026.html");
  await waitCount(page, "#s26-live-teams tbody tr", 25);
  const notice = await text(page, "#s26-live .projected-notice");
  assert(/through week \d+/i.test(notice), `no week in the notice: ${notice.slice(0, 80)}`);
  assert(/provisional/i.test(notice), "the notice does not say the ratings are provisional");
  await waitCount(page, "#s26-live-players tbody tr", 50);
  await page.click('#s26-live-pos .pos-chip[data-pos="QB"]');
  const pos = await page.locator("#s26-live-players tbody tr .pos-group-badge").allInnerTexts();
  assert(pos.length > 5 && pos.every(b => b === "QB"), `QB filter shows ${[...new Set(pos)]}`);
  const teamRows = await page.locator("#s26-live-teams tbody tr").count();
  assert(teamRows === 25, `${teamRows} team rows, expected the top 25`);
  return page;
});

check("season2026: team picker shows schedule and projected roster", async ctx => {
  const page = await openPage(ctx, "season2026.html");
  await waitCount(page, "#s26-team-select option", 50);
  const val = await page.locator("#s26-team-select option", { hasText: "Georgia" }).first().getAttribute("value");
  await page.selectOption("#s26-team-select", val);
  await waitCount(page, "#s26-team-preview tbody tr", 10);
  await waitCount(page, "#s26-team-preview .preview-player", 5);
  await page.selectOption("#s26-team-select", "");
  assert((await text(page, "#s26-team-preview")).trim() === "", "clearing the picker left the preview");
  return page;
});

check("season2026: circle table sorts by date and quality", async ctx => {
  const page = await openPage(ctx, "season2026.html");
  await waitCount(page, "#s26-circle tbody tr", 25);
  await page.click("#s26-circle th[data-col='quality']");
  const q = await page.locator("#s26-circle tbody tr td:last-child").allInnerTexts();
  const nums = q.map(Number);
  assert(nums.every((v, i) => i === 0 || nums[i - 1] >= v), "quality not descending");
  return page;
});

// ════════════════════════════════════════════════════════════════════════════
// Research + storylines (registry-driven)
// ════════════════════════════════════════════════════════════════════════════

check("research: index lists every registered finding", async ctx => {
  const page = await openPage(ctx, "research.html");
  const registered = await page.evaluate(() => Object.values(FINDINGS).length);
  await page.waitForFunction(n => document.querySelectorAll(".finding-card").length >= n, registered, { timeout: 60000 });
  return page;
});

const FINDING_PAGES = PAGES.filter(p => /^(research|story)-/.test(p));
for (const p of FINDING_PAGES) {
  check(`finding: ${p} renders stats + table + notes, filters work`, async ctx => {
    const page = await openPage(ctx, p);
    await page.waitForSelector("#finding-root .masthead", { timeout: 30000 });
    const upcoming = await page.locator(".finding-upcoming").count();
    if (upcoming) {
      assert((await text(page, ".finding-upcoming")).length > 100, "upcoming page has no plan text");
      return page;
    }
    await page.waitForFunction(() => !document.querySelector("#finding-table .skeleton"), null, { timeout: 60000 });
    const errs = await errorStates(page, "#finding-root");
    assert(!errs.length, errs.join(" | "));
    const rows = await page.locator("#finding-table tbody tr").count();
    assert(rows > 0, "table has no rows");
    assert(await page.locator("#finding-notes .finding-note").count() === 2, "method/limitations notes missing");
    // Exercise each filter: change it to a different option and confirm the
    // table re-renders without an error.
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
    return page;
  });
}

// ════════════════════════════════════════════════════════════════════════════
// Methods, Build Log, How It Works
// ════════════════════════════════════════════════════════════════════════════

check("methods: every registry entry renders, TOC anchors resolve, availability table", async ctx => {
  const page = await openPage(ctx, "methods.html");
  const n = await page.evaluate(() => METHODS.length);
  await waitCount(page, ".method-entry", n);
  await waitCount(page, "#method-availability table", 1);
  const dead = await page.evaluate(() => [...document.querySelectorAll(".method-toc a")]
    .map(a => a.getAttribute("href")).filter(h => !document.querySelector(h)));
  assert(!dead.length, `dead TOC anchors: ${dead}`);
  const noLimits = await page.evaluate(() => METHODS.filter(m => !m.limits).map(m => m.id));
  assert(!noLimits.length, `METHODS entries with no limits: ${noLimits}`);
  return page;
});

check("changes: every entry renders with a 'did not fix' section", async ctx => {
  const page = await openPage(ctx, "changes.html");
  const n = await page.evaluate(() => CHANGES.length);
  await waitCount(page, ".method-entry", n);
  const unfixed = await page.evaluate(() => CHANGES.filter(c => !c.unfixed).map(c => c.id));
  assert(!unfixed.length, `entries with no unfixed field: ${unfixed}`);
  return page;
});

check("guide: every GUIDE entry renders, samples draw, live lines fill", async ctx => {
  const page = await openPage(ctx, "info.html");
  const n = await page.evaluate(() => GUIDE.length);
  await waitCount(page, "#guide-root .method-entry", n);
  await waitCount(page, ".tier-rows .tier-row", 5);
  const dashes = await page.locator(".guide-sample").evaluateAll(
    tds => tds.filter(td => td.textContent.trim() === "—").length);
  assert(dashes === 0, `${dashes} glossary samples failed to draw`);
  await page.waitForFunction(() => [...document.querySelectorAll("[data-live]")]
    .every(el => el.textContent.trim().length > 0), null, { timeout: 30000 });
  const noLimits = await page.evaluate(() => GUIDE.filter(e => !e.limits).map(e => e.id));
  assert(!noLimits.length, `GUIDE entries with no limits: ${noLimits}`);
  return page;
});

check("guide: inbound anchors #projections and #ol land on their entries", async ctx => {
  const page = await openPage(ctx, "info.html#projections");
  await page.waitForSelector("#projections", { timeout: 30000 });
  assert(await page.locator("#ol").count() === 1, "#ol anchor missing");
  const top = await page.locator("#projections").evaluate(e => e.getBoundingClientRect().top);
  assert(top < 400, `#projections is ${Math.round(top)}px down — the page did not scroll to it`);
  return page;
});

check("teams: ?season= deep link opens the team in that season", async ctx => {
  const page = await openTeam(ctx, "?team=Georgia&season=2013");
  assert(await page.inputValue("#year-select") === "2013", "season picker ignored ?season=");
  await page.waitForFunction(() => document.querySelector(".hero-stat-sm")?.textContent.includes("2013"),
    null, { timeout: 30000 });
  return page;
});

check("home: 'Last Season's Standard' shows the last played season", async ctx => {
  const page = await openPage(ctx, "index.html?classic");
  await waitCount(page, "#home-top-teams .home-team-row", 8);
  const hrefs = await page.locator("#home-top-teams .home-team-row").evaluateAll(a => a.map(x => x.href));
  assert(hrefs.every(h => h.includes(`season=${PLAYED}`)), `panel links: ${hrefs[0]}`);
  return page;
});

check("ratings: scatter tooltip carries no constant-zero movement", async ctx => {
  const page = await openPage(ctx, "ratings.html");
  await waitCount(page, "#scatter-chart .scatter-dot", 100);
  await page.locator("#scatter-chart .scatter-dot").first().hover({ force: true });
  const t = await text(page, "#scatter-tooltip .tooltip-ovr");
  assert(/^OVR \d+$/.test(t.trim()), `tooltip reads "${t}"`);
  return page;
});

// ════════════════════════════════════════════════════════════════════════════
// Links — every internal href on every page resolves
// ════════════════════════════════════════════════════════════════════════════

check("links: every internal page link and #anchor resolves", async ctx => {
  const page = await openPage(ctx, "index.html?classic");
  const bad = [];
  const anchorsByPage = {};
  for (const p of PAGES) {
    await page.goto(BASE + p, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(300);
    anchorsByPage[p] = new Set(await page.evaluate(() => [...document.querySelectorAll("[id]")].map(e => e.id)));
    const hrefs = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href")));
    for (const h of new Set(hrefs)) {
      if (/^(https?:|mailto:)/.test(h)) continue;
      const [file, hash] = h.split("#");
      const target = (file || p).split("?")[0];
      if (target && !fs.existsSync(path.join(APP_ROOT, target))) bad.push(`${p} → ${h} (no file)`);
      else if (hash) (anchorsByPage[`__want:${target}`] ||= []).push({ from: p, hash });
    }
  }
  // Anchors are checked after rendering, since most ids are written by JS.
  // teams.html#<slug> is a route, not an element id, so it is excluded.
  for (const [k, wants] of Object.entries(anchorsByPage)) {
    if (!k.startsWith("__want:")) continue;
    const target = k.slice(7);
    if (target === "teams.html") continue;
    const ids = anchorsByPage[target];
    if (!ids) continue;
    for (const w of wants) if (!ids.has(w.hash)) bad.push(`${w.from} → ${target}#${w.hash} (no anchor)`);
  }
  assert(!bad.length, [...new Set(bad)].join("\n      "));
  return page;
});

// ════════════════════════════════════════════════════════════════════════════
// Runner
// ════════════════════════════════════════════════════════════════════════════

const server = await startServer();
BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ channel: "chrome", headless: !HEADED });

// ═══════════════════════════════════════════════════════════════
// Three ratings on a season being played: last season earned, projection, to date
// ═══════════════════════════════════════════════════════════════

check("teams: a 2026 roster shows last season, projection and to-date, with the reason when one is missing", async ctx => {
  const page = await openTeam(ctx, "?team=Georgia");
  await waitCount(page, "#roster-cards .draft-row.trio", 40);
  const header = (await text(page, "#roster-cards .draft-board-header")).toUpperCase();
  assert(header.includes(String(CURRENT - 1)) && header.includes("PROJ") && header.includes("LIVE"), `header: ${header}`);
  assert(await page.locator("#roster-cards .ovr-badge.is-live").count() > 5, "no to-date pill on any row");
  assert(await page.locator("#roster-cards .ovr-badge.is-projected").count() > 5, "no hatched projection pill");
  // a row without a number says why on hover
  const reasons = await page.locator("#roster-cards .trio-na").evaluateAll(els => els.map(e => e.title).filter(Boolean));
  assert(reasons.length > 0 && reasons.every(r => r.length > 3), "a missing rating has no stated reason");
  return page;
});

check("players: the 2026 grid shows the three ratings and a played season does not", async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, `${ROWS}.trio`, 50);
  const h = (await text(page, ".draft-board-header")).toUpperCase();
  assert(h.includes("LIVE") && h.includes("PROJ"), `2026 header: ${h}`);
  await page.selectOption("#filter-season", String(PLAYED));
  await page.waitForFunction(() => !document.querySelector(".draft-row.trio") && document.querySelectorAll(".draft-row").length > 20, null, { timeout: 60000 });
  const h2 = (await text(page, ".draft-board-header")).toUpperCase();
  assert(!h2.includes("LIVE"), `a played season grew a LIVE column: ${h2}`);
  return page;
});

check("players: the 2026 card shows three tiles, never one merged number", async ctx => {
  const page = await openPage(ctx, "players.html");
  await waitCount(page, `${ROWS}.trio`, 50);
  await page.locator(`${ROWS}.trio .draft-name`).first().click();
  await page.waitForSelector("#player-modal.open .trio-strip", { timeout: 90000 });
  assert(await page.locator("#player-modal .trio-tile").count() === 3, "expected three rating tiles");
  const caps = (await page.locator("#player-modal .trio-cap").allInnerTexts()).join(" | ").toUpperCase();
  assert(/EARNED/.test(caps) && /PROJECTION/.test(caps) && /TO DATE/.test(caps), `captions: ${caps}`);
  assert(await page.locator("#player-modal .modal-ovr-box").count() === 0, "a single OVR box is back beside the three tiles");
  return page;
});


// ═══════════════════════════════════════════════════════════════
// The Dynasty menu (menu.html): its own app, mouse first, keyboard and gamepad
// ═══════════════════════════════════════════════════════════════

// Boise State, as "My Team", so a screen opens without the team-select step.
const MENU_TEAM_ID = "68";
async function openMenu(ctx, hash = "#/hub", opts = {}) {
  await ctx.addInitScript(id => { try { localStorage.setItem("cfb-menu-team", id); } catch (e) {} }, MENU_TEAM_ID);
  return openPage(ctx, `menu.html${hash}`, opts);
}

check("menu: team select sets My Team, persists it, and the hub shows it", async ctx => {
  const page = await openPage(ctx, "menu.html#/team-select");
  await waitCount(page, ".m-tile", 20);
  await page.locator(".m-tile").first().click();
  await page.waitForFunction(() => location.hash.startsWith("#/hub"), null, { timeout: 20000 });
  const saved = await page.evaluate(() => localStorage.getItem("cfb-menu-team"));
  assert(saved && Number(saved) > 0, `My Team not saved: ${saved}`);
  await page.reload();
  await waitCount(page, ".m-item", 6);
  assert(await page.locator(".m-teamcard h2").count() === 1, "the hub shows no team card after a reload");
  return page;
});

check("menu: keyboard walks hub → roster → card, and Escape walks back", async ctx => {
  const page = await openMenu(ctx);
  await waitCount(page, ".m-item", 6);
  assert(await page.locator(".m-item.is-selected").count() === 1, "the hub has no single selected item");
  await page.keyboard.press("Enter");
  await waitCount(page, ".m-row", 10);
  assert(page.url().includes("#/roster"), `expected the roster, at ${page.url()}`);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.hash.startsWith("#/player"), null, { timeout: 30000 });
  await waitCount(page, ".trio-tile", 3);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => location.hash.startsWith("#/roster"), null, { timeout: 15000 });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => location.hash.startsWith("#/hub"), null, { timeout: 15000 });
  return page;
});

check("menu: the roster and the card show 2025, projection and to-date, three tiles on the card", async ctx => {
  const page = await openMenu(ctx, "#/roster");
  await waitCount(page, ".m-row", 10);
  const head = (await page.locator(".m-rowhead").first().innerText()).toUpperCase();
  assert(head.includes(String(CURRENT - 1)) && head.includes("PROJ") && head.includes("LIVE"), `roster header: ${head}`);
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
  await page.waitForFunction(() => location.hash.startsWith("#/depth"), null, { timeout: 20000 });
  assert(await page.locator(".m-glyph--pad").count() > 0, "the prompt bar did not switch to pad glyphs");
  await press(1);                                    // B: back
  await page.waitForFunction(() => location.hash.startsWith("#/hub"), null, { timeout: 15000 });
  return page;
});

check("menu: every screen renders rows with no page errors and no sideways scroll", async ctx => {
  const rowsOf = { "#/roster": ".m-row", "#/depth": ".m-drow", "#/schedule": ".m-row", "#/standings": ".m-row",
    "#/rankings": ".m-row--rank", "#/recruiting": ".m-row--class", "#/recruiting/prospects": ".m-row--prospect",
    "#/portal": ".m-row--portal" };
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


check("menu: the front door redirects to the menu, ?classic keeps the old home, and the library links out", async ctx => {
  const page = await openPage(ctx, "index.html");
  await page.waitForURL(u => u.pathname.endsWith("menu.html"), { timeout: 20000 });
  const classic = await ctx.newPage();
  await classic.goto(BASE + "index.html?classic", { waitUntil: "domcontentloaded" });
  await classic.waitForTimeout(800);
  assert(classic.url().includes("index.html"), "?classic was redirected away");
  await classic.close();
  const lib = await openMenu(ctx, "#/library");
  await waitCount(lib, ".m-item[data-href]", 8);
  const hrefs = await lib.locator(".m-item[data-href]").evaluateAll(els => els.map(e => e.dataset.href));
  assert(hrefs.includes("players.html") && hrefs.includes("methods.html"), `library links: ${hrefs}`);
  return lib;
});

check("menu: M switches dark and light, and remembers it", async ctx => {
  const page = await openMenu(ctx);
  await waitCount(page, ".m-item", 6);
  assert((await page.locator("#menu-root").getAttribute("data-mode")) === "dark", "not dark by default");
  await page.keyboard.press("m");
  await page.waitForFunction(() => document.getElementById("menu-root").dataset.mode === "light", null, { timeout: 5000 });
  await page.reload();
  await waitCount(page, ".m-item", 6);
  assert((await page.locator("#menu-root").getAttribute("data-mode")) === "light", "the mode was not remembered");
  return page;
});

check("menu: a rostered player with no ratings row still opens a card, with a stated reason", async ctx => {
  // Brandon Amaniampong (EDGE, 2 games, no projection) is on Boise State's 2026 roster but has no
  // row in players_2026.json.
  const page = await openMenu(ctx, "#/player/1129716/68");
  await page.waitForSelector(".m-hero", { timeout: 30000 });
  assert(!(await page.locator(".m-error").count()), "the card shows an error");
  const empty = await page.locator(".m-stats .m-empty").innerText();
  assert(empty.length > 20 && !empty.includes("${"), `no reason for the missing stats: "${empty}"`);
  assert(await page.locator(".m-career").count() === 1, "no career strip");
  return page;
});


check("menu: Back at the hub and the H key open the quick menu, which Back closes", async ctx => {
  const page = await openMenu(ctx);
  await waitCount(page, ".m-item", 6);
  await page.keyboard.press("Escape");
  await page.waitForSelector(".m-overlay .m-item", { timeout: 5000 });
  assert(await page.locator(".m-overlay [data-go]").count() >= 10, "the quick menu lists too few screens");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".m-overlay"), null, { timeout: 5000 });
  await page.keyboard.press("h");
  await page.waitForSelector(".m-overlay", { timeout: 5000 });
  await page.locator('.m-overlay [data-go="playoff"]').click();
  await page.waitForFunction(() => location.hash.startsWith("#/playoff"), null, { timeout: 10000 });
  assert(!(await page.locator(".m-overlay").count()), "the quick menu stayed open after a choice");
  return page;
});

check("menu: every screen's prompt bar always offers Back, Year and Menu", async ctx => {
  const page = await openMenu(ctx, "#/roster");
  await waitCount(page, ".m-row", 5);
  const bar = (await page.locator(".m-prompts").innerText()).toUpperCase();
  for (const w of ["BACK", "YEAR", "MENU"]) assert(bar.includes(w), `prompt bar lacks ${w}: ${bar}`);
  return page;
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
