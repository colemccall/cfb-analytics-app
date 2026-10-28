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
    if (MENU.teamId) localStorage.setItem("cfb-menu-team", String(MENU.teamId));
    localStorage.setItem("cfb-menu-season", String(MENU.season));
  } catch (e) { /* storage blocked: nothing to do */ }
}

const menuScreens = {};
const menuRouter = { current: null, token: 0, cleanups: [] };

// Adds a screen to the registry under `id`.
menuRouter.register = function (id, def) {
  menuScreens[id] = def;
};

// Splits "#/roster/QB" into { id: "roster", params: ["QB"] }. An empty or unknown
// route is the hub, or team select if no team has been chosen yet.
menuRouter.parse = function (hash) {
  const parts = String(hash || "").replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  let id = parts[0] || "hub";
  if (!menuScreens[id]) id = "hub";
  if (id !== "team-select" && !MENU.teamId && id !== "hub") id = "hub";
  if (id === "hub" && !MENU.teamId) id = "team-select";
  return { id, params: parts.slice(1) };
};

// Goes to a route by setting the hash; the hashchange handler does the rendering. The
// same route again re-renders it (a season change uses that).
menuRouter.go = function (path) {
  const next = path.startsWith("#") ? path : `#${path}`;
  if (location.hash === next) this.render(); else location.hash = next;
};

// One step back: the browser's history if there is any. At the top of the menu (the hub, or
// team select with a team already chosen) there is nowhere to go back to, so back opens the
// quick menu instead of doing nothing.
menuRouter.back = function () {
  const id = this.current && this.current.id;
  if (id === "hub") { menuChrome.openMenu(); return; }
  if (id === "team-select") { if (MENU.teamId) this.go("#/hub"); return; }
  if (history.length > 1 && this.current) history.back();
  else this.go("#/hub");
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
  stage.classList.add("is-loading");

  let html;
  try { html = await def.render(ctx); }
  catch (e) { html = `<div class="m-error">That screen failed to load: ${_esc(e.message)}</div>`; }
  if (token !== this.token) return;

  // The screen we are leaving lets go of anything it subscribed to (input handlers).
  // A screen's mount() pushes its own unsubscribe functions onto ctx.cleanups.
  for (const fn of this.cleanups) { try { fn(); } catch (e) { /* ignore */ } }
  this.cleanups = ctx.cleanups = [];
  this.current = { id: route.id, ctx };
  const team = (ctx.team !== undefined ? ctx.team : null);
  menuChrome.setHeader({
    title: typeof def.title === "function" ? def.title(ctx) : def.title,
    crumb: typeof def.crumb === "function" ? def.crumb(ctx) : def.crumb,
    team: def.banner === false ? null : team || ctx.bannerTeam || null,
    season: def.season === false ? null : MENU.season,
  });
  const tabs = def.tabs ? def.tabs(ctx) : null;
  this.tabs = tabs;
  menuChrome.setTabs(tabs);
  menuChrome.setPrompts(typeof def.prompts === "function" ? def.prompts(ctx) : (def.prompts || []));

  stage.innerHTML = html;
  stage.classList.remove("is-loading");
  stage.classList.remove("is-entering");
  void stage.offsetWidth;              // restart the enter animation
  stage.classList.add("is-entering");
  stage.scrollTop = 0;
  if (def.mount) await def.mount(stage, ctx);
  menuFocus.reset(def.prefer ? def.prefer(ctx) : null);
  document.title = `${typeof def.title === "function" ? def.title(ctx) : def.title} — CFB Dynasty Menu`;
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
  window.addEventListener("hashchange", () => this.render());
  this.render();
};
