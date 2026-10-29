// menuRouter.js — which screen is showing, and how you get to the next one.
//
// Screens are registered by id (menuScreens.js) and reached by hash routes —
// #/hub, #/roster/QB, #/player/12345 — so the browser's back button, a bookmark and
// a link all work. Going somewhere sets the hash; the hashchange handler renders it.
//
// A screen is { title, crumb(ctx), prompts, tabs(ctx), render(ctx) → html,
// mount(stage, ctx) }. The router renders the screen into the stage, fills the
// header, tab strip and prompt bar from what the screen declares, wires LB/RB to the
// screen's tabs, resets the selection, and slides the new screen in.
//
// State the whole menu shares lives in MENU: the season being viewed and "My Team",
// both remembered in localStorage (read and written inside try/catch: the menu must
// work with storage blocked).
//
// Must never contain: any screen's content or any fetch.
//
// Load order: after menuChrome.js, before menuScreens.js.

const MENU = { season: CONFIG.CURRENT_SEASON, teamId: null };

// Reads what the menu remembers. Anything missing or malformed is ignored.
function menuLoadState() {
  try {
    const t = parseInt(localStorage.getItem("cfb-menu-team"));
    if (t > 0) MENU.teamId = t;
    const s = parseInt(localStorage.getItem("cfb-menu-season"));
    if (s >= CONFIG.FIRST_SEASON && s <= CONFIG.CURRENT_SEASON) MENU.season = s;
  } catch (e) { /* storage blocked: start fresh */ }
}

// Remembers My Team and the season across visits.
function menuSaveState() {
  try {
    if (MENU.teamId) localStorage.setItem("cfb-menu-team", String(MENU.teamId)); else localStorage.removeItem("cfb-menu-team");
    localStorage.setItem("cfb-menu-season", String(MENU.season));
  } catch (e) { /* storage blocked: nothing to do */ }
}

const menuScreens = {};
const menuRouter = { current: null, token: 0, cleanups: [] };

// Adds a screen to the registry under `id`.
menuRouter.register = function (id, def) {
  menuScreens[id] = def;
};

// The screens about one team, and how a team route names them: #/team/52 is the team's page,
// #/team/52/roster/QB its roster, and so on. Any team has a page; "My Team" is only the one the
// old short routes (#/roster) and the home page default to.
const MENU_TEAM_SUBS = { roster: "roster", depth: "depth", schedule: "schedule", recruiting: "team-recruiting", transfers: "team-portal", history: "team-history" };
const MENU_TEAM_SCREENS = new Set(["team", "roster", "depth", "schedule", "team-recruiting", "team-portal", "team-history"]);

// Splits "#/team/52/roster/QB" into { id: "roster", params: ["QB"], teamId: 52 }, and a short route
// like "#/roster/QB" into the same with teamId taken from My Team. An empty or unknown route is the
// home page. A team screen with no team to show (no team in the route, none followed) is team select.
menuRouter.parse = function (hash) {
  const parts = String(hash || "").replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  let id = parts[0] || "home", params = parts.slice(1), teamId = null;
  if (id === "team" && /^\d+$/.test(parts[1] || "")) {
    teamId = Number(parts[1]);
    id = parts[2] ? (MENU_TEAM_SUBS[parts[2]] || "team") : "team";
    params = parts.slice(3);
  } else if (id === "hub") {                       // the old Dynasty hub: My Team's page, or the home page for its League and News tabs
    id = ["league", "news"].includes(parts[1]) ? "home" : "team";
    params = [];
  }
  if (!menuScreens[id]) id = "home";
  if (MENU_TEAM_SCREENS.has(id) && !teamId) {
    teamId = MENU.teamId;
    if (!teamId) id = "team-select";
  }
  return { id, params, teamId };
};

// Goes to a route by setting the hash; the hashchange handler does the rendering. The
// same route again re-renders it (a season change uses that).
menuRouter.go = function (path) {
  const next = path.startsWith("#") ? path : `#${path}`;
  if (location.hash === next) this.render(); else location.hash = next;
};

// One step back: the browser's history if there is any, else the home page. At the top of
// the menu (the home page) there is nowhere to go back to, so back opens the quick menu
// instead of doing nothing.
menuRouter.back = function () {
  const id = this.current && this.current.id;
  if (id === "home") { menuChrome.openMenu(); return; }
  if (history.length > 1 && this.current) history.back();
  else this.go("#/home");
};

// Moves the season one step (±1) within the seasons that exist, wrapping, and
// re-renders. The step is positive for older.
menuRouter.stepSeason = function (step) {
  const all = [];
  for (let y = CONFIG.CURRENT_SEASON; y >= CONFIG.FIRST_SEASON; y--) all.push(y);
  const i = all.indexOf(MENU.season);
  MENU.season = all[(i + step + all.length) % all.length];
  menuSaveState();
  this.render();
};

// A visible, retryable error: role=alert text and a Retry button that renders the route again
// (a failed file is never cached, so the retry really asks again). `inline` is a banner above a
// screen that did render; otherwise it is the whole screen.
function menuErrorPanel(message, inline = false) {
  return `<div class="m-error${inline ? " m-error--banner" : ""}" role="alert"><span class="m-error-text">${_esc(message)}</span>
      <button class="m-retry" type="button" data-nav data-nav-group="retry" data-retry>Retry</button></div>`;
}

// Renders the route in the hash: fetch the screen's markup, fill the frame, wire its
// tabs, reset the selection, run its mount(). A newer render supersedes an older one
// still waiting on data (the token check), so quick navigation never paints a stale
// screen over a fresh one.
menuRouter.render = async function () {
  const route = this.parse(location.hash);
  const def = menuScreens[route.id];
  const ctx = { params: route.params, state: MENU, route };
  const token = ++this.token;
  const stage = menuChrome.el.stage;
  const startedAt = Date.now();
  stage.classList.add("is-loading");

  let html, renderFailed = false;
  try { html = await def.render(ctx); }
  catch (e) {
    renderFailed = true;
    const files = dataFailures(startedAt).map(f => `${f.file} (${f.message})`);
    html = menuErrorPanel(`That screen failed to load: ${e && e.message ? e.message : e}${files.length ? `. Data that did not load: ${files.join(", ")}` : ""}`);
  }
  if (token !== this.token) return;

  // The screen we are leaving lets go of anything it subscribed to (input handlers).
  // A screen's mount() pushes its own unsubscribe functions onto ctx.cleanups.
  for (const fn of this.cleanups) { try { fn(); } catch (e) { /* ignore */ } }
  this.cleanups = ctx.cleanups = [];
  this.current = { id: route.id, ctx };
  const team = (ctx.team !== undefined ? ctx.team : null);
  // The header, tabs and prompts read what the screen's render() left in ctx, which a screen
  // that failed part-way did not finish: a throw there must not take the frame down with it.
  const safe = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };
  const title = safe(() => (typeof def.title === "function" ? def.title(ctx) : def.title), "Menu");
  menuChrome.setHeader({
    title,
    crumb: safe(() => (typeof def.crumb === "function" ? def.crumb(ctx) : def.crumb), ""),
    team: def.banner === false ? null : team || ctx.bannerTeam || null,
    season: def.season === false ? null : MENU.season,
    section: route.id,
  });
  const tabs = safe(() => (def.tabs ? def.tabs(ctx) : null), null);
  this.tabs = tabs;
  menuChrome.setTabs(tabs);
  menuChrome.setPrompts(safe(() => (typeof def.prompts === "function" ? def.prompts(ctx) : (def.prompts || [])), []));

  stage.innerHTML = html;
  stage.classList.remove("is-loading");
  stage.classList.remove("is-entering");
  void stage.offsetWidth;              // restart the enter animation
  stage.classList.add("is-entering");
  stage.scrollTop = 0;
  // A file that failed to load while this screen was being built is said so at the top of it,
  // with a Retry, instead of leaving what looks like an empty or partial screen.
  const failed = renderFailed ? [] : dataFailures(startedAt);
  if (failed.length) stage.insertAdjacentHTML("afterbegin", menuErrorPanel(`Some data did not load: ${failed.map(f => `${f.file} (${f.message})`).join(", ")}.`, true));
  // A screen whose mount() throws still gets its frame and focus; the failure is shown, not swallowed.
  if (def.mount && !renderFailed) {
    try { await def.mount(stage, ctx); }
    catch (e) { stage.insertAdjacentHTML("afterbegin", menuErrorPanel(`Part of this screen failed to start: ${e && e.message ? e.message : e}`, true)); }
  }
  stage.querySelectorAll("[data-retry]").forEach(b => b.addEventListener("click", () => menuRouter.render()));
  menuFocus.reset(def.prefer ? def.prefer(ctx) : null);
  // The slideshow behind the screen (home: famous stadiums; a team's screens: that team). Never waits on or blocks the screen.
  fetchBackdrops().then(b => menuBackdrop.apply(route, b, ctx.team)).catch(() => menuBackdrop.show({ kind: "none" }));
  document.title = `${title} — CFB Analytics`;
};

// Starts the router: load what the menu remembers, wire back/home/season/tab actions
// and the hash, and render the first route.
menuRouter.start = function () {
  menuLoadState();
  menuInput.on("back", () => { this.back(); return true; });
  menuInput.on("home", () => { menuChrome.openMenu(); return true; });
  menuInput.on("season", () => { this.stepSeason(1); return true; });
  const shift = delta => {
    const t = this.tabs;
    if (!t || !t.items?.length) return false;
    const i = t.items.findIndex(x => x.id === t.active);
    const next = t.items[(i + delta + t.items.length) % t.items.length];
    t.go(next.id);
    return true;
  };
  menuInput.on("tabPrev", () => shift(-1));
  menuInput.on("tabNext", () => shift(1));
  // Anything on a screen that names a destination (data-to="#/team/52") opens it when activated, by
  // mouse, key or pad alike: one rule, so every team, player and ranking row can link without a handler.
  menuChrome.el.stage.addEventListener("click", e => {
    const el = e.target.closest && e.target.closest("[data-to]");
    if (el && el.dataset.to) { e.preventDefault(); this.go(el.dataset.to); }
  });
  window.addEventListener("hashchange", () => this.render());
  this.render();
};
