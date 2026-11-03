// menuChrome.js — the frame every menu screen sits in: header, tab strip, the
// button-prompt bar along the bottom, and the toast.
//
// The header carries the screen title, a breadcrumb, the team banner in the team's
// colours and the season stepper. The prompt bar tells the player what each button
// does RIGHT NOW on this screen, in the labels of the device they are using
// (keyboard keys, controller buttons), and every prompt is also a clickable button,
// so a mouse user can go back, switch tabs or change season without a keyboard.
//
// Must never contain: data fetching or screen content. Screens hand it a header
// description and a list of prompts; it only draws them.
//
// Load order: after menuInput.js and menuFocus.js, before menuRouter.js.

// What each action is called on each device. The mouse shows the keyboard labels:
// those are the ones a mouse user who wants a shortcut needs.
const MENU_GLYPHS = {
  keys: { select: "Enter", back: "Esc", tabs: "Q / E", page: "PgUp / PgDn", alt: "Space", season: "Y", home: "H", mode: "M", move: "↑ ↓ ← →" },
  pad:  { select: "A",     back: "B",   tabs: "LB / RB", page: "LT / RT",   alt: "X",     season: "Y", home: "Start", mode: "Select", move: "D-pad" },
};

const menuChrome = { el: {}, prompts: [], toastTimer: null };

// Builds the frame inside `root` once: header, stage, prompt bar and toast. Returns
// the stage element, which the router fills with each screen.
menuChrome.build = function (root) {
  root.innerHTML = `
    <header class="m-header">
      <div class="m-banner" id="m-banner" aria-hidden="true"></div>
      <div class="m-titles">
        <div class="m-crumb" id="m-crumb"></div>
        <h1 class="m-title" id="m-title">Home</h1>
      </div>
      <nav class="m-nav" id="m-nav" aria-label="Sections"></nav>
      <div class="m-season" id="m-season">
        <button class="m-step" type="button" data-nav data-nav-group="season" data-step="1" aria-label="Previous season">◀</button>
        <span class="m-season-label" id="m-season-label"></span>
        <button class="m-step" type="button" data-nav data-nav-group="season" data-step="-1" aria-label="Next season">▶</button>
      </div>
    </header>
    <nav class="m-subnav" id="m-subnav" aria-label="Pages in this section" hidden></nav>
    <nav class="m-tabs" id="m-tabs" aria-label="Screen tabs" hidden></nav>
    <main class="m-stage" id="m-stage" tabindex="-1"></main>
    <footer class="m-bottom">
      <div class="m-prompts" id="m-prompts" aria-label="Controls"></div>
      <div class="m-ticker" aria-label="Top 25 teams"><span class="m-ticker-tag">TOP 25</span>
        <div class="m-ticker-run"><div class="m-ticker-track" id="m-ticker-track"></div></div><span class="m-ticker-end">CFB</span></div>
    </footer>
    <div class="m-toast" id="m-toast" role="status" aria-live="polite"></div>`;
  for (const id of ["banner", "crumb", "title", "season", "season-label", "nav", "subnav", "tabs", "stage", "prompts", "ticker-track", "toast"]) {
    this.el[id] = root.querySelector(`#m-${id}`);
  }
  window.addEventListener("menu:device", () => this.renderPrompts());
  window.addEventListener("menu:pad", e => {
    this.toast(e.detail.connected ? "Controller connected" : "Controller disconnected");
    if (e.detail.connected) menuInput._setDevice("pad");
  });
  this.el.season.querySelectorAll(".m-step").forEach(b =>
    b.addEventListener("click", () => menuRouter.stepSeason(parseInt(b.dataset.step))));
  this.root = root;
  this.setMode(menuChrome.savedMode(), false);
  menuInput.on("mode", () => { this.setMode(this.mode === "light" ? "dark" : "light", true); return true; });
  this.loadTicker();
  return this.el.stage;
};

// Draws the header from a description: { title, crumb, team, season }. `team` is a
// team row with a colour; its banner is the block in the top-left corner.
menuChrome.setHeader = function ({ title, crumb, team, season, route }) {
  this.drawNav(route, team);
  this.el.title.textContent = title;
  this.el.crumb.textContent = crumb || "";
  this.el.season.hidden = season == null;
  this.el["season-label"].textContent = season == null ? "" :
    `${season}${CONFIG.LIVE_SEASONS.includes(season) ? " · IN PROGRESS" : isProjectedSeason(season) ? " · PROJECTED" : ""}`;
  this.el.banner.style.setProperty("--m-team", team?.color || "");
  this.el.banner.innerHTML = team ? teamMark(team, "m-banner-mark") : "";
  this.el.banner.classList.toggle("has-team", !!team);
};

// â”€â”€ The seven sections â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Every screen belongs to one section; the section bar names all seven on every screen, and a second bar under it lists
// that section's pages (v4.24). A row of the tree is [label, route, test(route)]: the test says which routes the page is.
//   Home Â· My Team Â· Season Â· Teams Â· Players Â· Recruiting Â· About
// My Team is the team you follow; Teams is any other team's pages and the picker. A team's pages are the same list in both.
const MENU_TEAM_PAGES = [["Overview", "", ["team"]], ["Roster", "roster", ["roster"]], ["Depth Chart", "depth", ["depth"]], ["Ratings", "ratings", ["team-ratings"]],
  ["Schedule", "schedule", ["schedule", "game"]], ["Recruiting", "recruiting", ["team-recruiting"]], ["Transfers", "transfers", ["team-portal"]],
  ["History", "history", ["team-history"]]];
const MENU_TEAM_ROUTES = new Set(MENU_TEAM_PAGES.flatMap(p => p[2]));
const MENU_SECTIONS = [
  { id: "home", label: "Home", to: "#/home", screens: ["home"] },
  { id: "myteam", label: "My Team", screens: [] },
  { id: "season", label: "Season", to: "#/rankings", screens: ["rankings", "standings", "season", "playoff", "compare"],
    pages: [["Rankings", "#/rankings", ["rankings"]], ["Standings", "#/standings", ["standings"]], ["The Season", "#/season", ["season"]],
            ["Playoff", "#/playoff", ["playoff"]], ["Compare", "#/compare", ["compare"]]] },
  { id: "teams", label: "Teams", to: "#/team-select", screens: ["team-select"] },
  { id: "players", label: "Players", to: "#/players", screens: ["players", "player", "scatter"],
    pages: [["Leaders", "#/players", ["players"]], ["Talent vs Production", "#/scatter", ["scatter"]]] },
  { id: "recruiting", label: "Recruiting", to: "#/recruiting", screens: ["recruiting", "portal"],
    pages: [["Classes", "#/recruiting", ["recruiting"], r => r.params[0] !== "prospects"], ["Prospects", "#/recruiting/prospects", ["recruiting"], r => r.params[0] === "prospects"],
            ["Transfer Portal", "#/portal", ["portal"]]] },
  { id: "about", label: "About", to: "#/guide", screens: ["guide", "methods", "research", "changes"],
    pages: [["How It Works", "#/guide", ["guide"]], ["Methods", "#/methods", ["methods"]], ["Research", "#/research", ["research"]], ["Build Log", "#/changes", ["changes"]]] },
];

// Which section a route is in, and which team its pages belong to. A team's own screens are My Team when the team is the one
// followed, else Teams; a game is Teams. `team` is the team the screen is showing (the router's banner team).
menuChrome.locate = function (route, team) {
  const id = route.id;
  const teamScreen = MENU_TEAM_ROUTES.has(id);
  if (teamScreen) {
    const teamId = route.teamId || (team && team.id) || MENU.teamId;
    const mine = id !== "game" && teamId && teamId === MENU.teamId;
    return { section: mine ? "myteam" : "teams", teamId };
  }
  const s = MENU_SECTIONS.find(x => x.screens.includes(id));
  return { section: s ? s.id : null, teamId: null };
};

// The pages of a section as { label, to, here }: the section's own list, or for a team's pages the team's seven (and, under
// Teams, the picker first).
menuChrome.pagesOf = function (section, route, teamId) {
  if (section === "myteam" || (section === "teams" && teamId)) {
    const own = MENU_TEAM_PAGES.map(([label, sub, ids]) => ({ label, to: menuTeamPath(teamId, sub), here: ids.includes(route.id) }));
    return section === "teams" ? [{ label: "All Teams", to: "#/team-select", here: false }, ...own] : own;
  }
  const s = MENU_SECTIONS.find(x => x.id === section);
  return (s && s.pages ? s.pages : []).map(([label, to, ids, test]) => ({ label, to, here: ids.includes(route.id) && (!test || test(route)) }));
};

// Draws the section bar and the bar of that section's pages. `route` is the parsed route; `team` the team on the screen.
// A section that has one page (Players) or none (Home) shows no second bar.
menuChrome.drawNav = function (route, team) {
  route = route || { id: "home", params: [] };
  const { section, teamId } = this.locate(route, team);
  const bar = MENU_SECTIONS.map(s => {
    const to = s.id === "myteam" ? (MENU.teamId ? menuTeamPath(MENU.teamId) : "#/team-select") : s.to;
    const here = s.id === section;
    return `<button class="m-navbtn${here ? " is-here" : ""}" type="button" data-nav data-nav-group="nav" data-to="${to}"${here ? ' aria-current="page"' : ""}>${s.label}</button>`;
  }).join("") + `<button class="m-navbtn m-navbtn--menu" type="button" data-nav data-nav-group="nav" data-nav-more aria-label="Open the menu">Menu</button>`;
  this.el.nav.innerHTML = bar;
  this.el.nav.querySelector("[data-nav-more]").addEventListener("click", () => this.openMenu());
  const pages = section ? this.pagesOf(section, route, teamId) : [];
  const sub = this.el.subnav;
  sub.hidden = pages.length < 2;
  sub.innerHTML = pages.length < 2 ? "" : pages.map(p =>
    `<button class="m-subbtn${p.here ? " is-here" : ""}" type="button" data-nav data-nav-group="subnav" data-to="${p.to}"${p.here ? ' aria-current="page"' : ""}>${_esc(p.label)}</button>`).join("");
  for (const el of [this.el.nav, sub]) el.querySelectorAll("[data-to]").forEach(b => b.addEventListener("click", () => menuRouter.go(b.dataset.to)));
  const here = sub.querySelector(".is-here");              // a narrow screen scrolls the bar: the current page must be in view
  if (here && sub.scrollWidth > sub.clientWidth) sub.scrollLeft = Math.max(0, here.offsetLeft - 16);
};

// Draws the tab strip for a screen: { items: [{id,label}], active, go(id) }, or hides
// it. The strip has LB / RB markers at its ends, which are also clickable.
menuChrome.setTabs = function (tabs) {
  const el = this.el.tabs;
  if (!tabs || !tabs.items?.length) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  const label = (side) => `<button class="m-bumper" type="button" data-prompt="${side}" tabindex="-1" aria-label="${side === "tabPrev" ? "Previous tab" : "Next tab"}"></button>`;
  el.innerHTML = label("tabPrev") + tabs.items.map(t =>
    `<button class="m-tab${t.id === tabs.active ? " is-active" : ""}" type="button" data-nav data-nav-group="tabs" data-tab="${_esc(t.id)}">${_esc(t.label)}</button>`
  ).join("") + label("tabNext");
  el.querySelectorAll(".m-tab").forEach(b => b.addEventListener("click", () => tabs.go(b.dataset.tab)));
  el.querySelectorAll(".m-bumper").forEach(b => b.addEventListener("click", () => menuInput.dispatch(b.dataset.prompt)));
  this.renderPrompts();
};

// Sets the prompts a screen offers: a list of { action, label } where action is one
// of "select" "back" "tabs" "page" "alt" "season" "home" "move". Redrawn in the
// labels of the current device.
menuChrome.setPrompts = function (prompts) {
  this.prompts = prompts || [];
  this.renderPrompts();
};

// Draws the prompt bar in the labels of whichever device was used last. The LB/RB
// markers on the tab strip pick up the same labels.
menuChrome.renderPrompts = function () {
  const g = MENU_GLYPHS[menuInput.device === "pad" ? "pad" : "keys"];
  const run = { select: "select", back: "back", home: "home", season: "season", alt: "alt", mode: "mode" };
  // Back, Year and Menu are on every screen, whatever the screen lists, so the way out and the
  // way to change season are never a guess on a controller.
  const have = new Set(this.prompts.map(p => p.action));
  const fixed = [];
  if (!have.has("back")) fixed.push({ action: "back", label: "Back" });
  if (!have.has("season")) fixed.push({ action: "season", label: "Year" });
  if (!have.has("home")) fixed.push({ action: "home", label: "Menu" });
  const pad = menuInput.device === "pad";
  // With a controller the bar lists its buttons, moving and tabs included. With the mouse it is a row of
  // on-screen buttons only (Back, Year, Menu, the sort, light and dark): moving is pointing, tabs are the
  // strip above, and no key labels are drawn.
  const shown = pad ? this.prompts : this.prompts.filter(p => run[p.action] && p.action !== "select");
  const all = [...shown, ...fixed, { action: "mode", label: this.mode === "light" ? "Dark mode" : "Light mode" }];
  this.el.prompts.innerHTML = all.map(p => {
    const act = run[p.action];
    const glyph = pad ? `<span class="m-glyph m-glyph--pad">${_esc(g[p.action] || "")}</span>` : "";
    return act
      ? `<button class="m-prompt" type="button" data-prompt="${act}">${glyph}<span>${_esc(p.label)}</span></button>`
      : `<span class="m-prompt is-static">${glyph}<span>${_esc(p.label)}</span></span>`;
  }).join("");
  this.el.prompts.querySelectorAll("[data-prompt]").forEach(b =>
    b.addEventListener("click", () => menuInput.dispatch(b.dataset.prompt)));
  const bumpers = this.el.tabs.querySelectorAll(".m-bumper");
  bumpers.forEach(b => { b.hidden = !pad; });
  if (bumpers.length === 2) { bumpers[0].textContent = "LB"; bumpers[1].textContent = "RB"; }
};

// A short message, bottom-centre, that fades by itself.
menuChrome.toast = function (msg) {
  const el = this.el.toast;
  el.textContent = msg;
  el.classList.add("is-on");
  clearTimeout(this.toastTimer);
  this.toastTimer = setTimeout(() => el.classList.remove("is-on"), 2400);
};

// The saved colour mode ("dark" or "light"), or "dark" when nothing is saved or storage is
// blocked.
menuChrome.savedMode = function () {
  try { return localStorage.getItem("cfb-menu-mode") === "light" ? "light" : "dark"; } catch (e) { return "dark"; }
};

// Switches the menu between its dark (dusk) and light (daylight) look. The rating pills take
// their colours from the site theme, so the page theme follows the mode, and the current
// screen is drawn again so its JS-computed colours are not left stale. `redraw` is false
// on the first call, before the router has drawn anything.
menuChrome.setMode = function (mode, redraw) {
  this.mode = mode;
  this.root.dataset.mode = mode;
  document.documentElement.setAttribute("data-theme", mode === "light" ? "light" : "dark");
  try { localStorage.setItem("cfb-menu-mode", mode); } catch (e) { /* the mode still applies */ }
  this.renderPrompts();
  if (redraw) { menuRouter.render(); this.toast(mode === "light" ? "Light mode" : "Dark mode"); }
};

// Fills the scores ticker with the top 25 by our team rating (earned to date when the season
// has it, else the projection), each with its record. The text is written twice so the
// marquee can loop without a gap. A failed load leaves the ticker empty, which is harmless.
menuChrome.loadTicker = async function () {
  const season = MENU.season;
  this.tickerSeason = season;          // the router redraws the ticker when the season it shows is not the season being viewed
  try {
    const d = await menuTeams(season);
    const top = d.teams.filter(t => menuTeamPower(t, d) != null).sort((a, b) => menuTeamPower(b, d) - menuTeamPower(a, d)).slice(0, 25);
    const one = top.map((t, i) => {
      const s = d.standings[t.id];
      return `<a href="${menuTeamPath(t.id)}">#${i + 1} <b>${_esc(t.school)}</b>${s ? ` (${s.w}-${s.l})` : ""}</a>`;
    }).join("");
    if (season === MENU.season) this.el["ticker-track"].innerHTML = one + one;     // a slower, older request must not overwrite a newer one
  } catch (e) { /* no ticker */ }
};

// The quick menu: an overlay reachable from anywhere (Back at the top of the menu, Start or H,
// or the Menu prompt) listing every screen, split into the team being looked at (else the one you
// follow) and the league and the news, plus the season and the light/dark switch. It takes over the
// selection while it is open, and Back, Menu or choosing an item closes it. Opening it twice does nothing.
menuChrome.openMenu = function () {
  if (this.overlay) return;
  const here = menuRouter.current && menuRouter.current.ctx && menuRouter.current.ctx.route ? menuRouter.current.ctx.route.teamId : null;
  const teamId = here != null ? here : MENU.teamId;
  const item = (route, label) => `<button class="m-item" type="button" data-nav data-nav-group="ovl" data-go="${route}"><span class="m-item-label">${_esc(label)}</span></button>`;
  const teamCol = teamId
    ? `<h3 class="m-ovl-h">${here != null && here !== MENU.teamId ? "THIS TEAM" : "MY TEAM"}</h3>${item(menuTeamPath(teamId), "Team Page")}${item(menuTeamPath(teamId, "roster"), "Roster")}${item(menuTeamPath(teamId, "depth"), "Depth Chart")}${item(menuTeamPath(teamId, "ratings"), "Ratings")}${item(menuTeamPath(teamId, "schedule"), "Schedule")}${item(menuTeamPath(teamId, "recruiting"), "Recruiting Class")}${item(menuTeamPath(teamId, "transfers"), "Transfers")}${item(menuTeamPath(teamId, "history"), "Team History")}`
    : `<h3 class="m-ovl-h">TEAM</h3>${item("#/team-select", "Pick a Team")}`;
  const el = document.createElement("div");
  el.className = "m-overlay";
  el.innerHTML = `<div class="m-ovl-panel m-panel" role="dialog" aria-label="Menu">
      <h2 class="m-ovl-title">MENU</h2>
      <div class="m-ovl-cols">
        <div>${teamCol}</div>
        <div><h3 class="m-ovl-h">SEASON</h3>${item("#/home", "Home")}${item("#/rankings", "Rankings")}${item("#/standings", "Standings")}${item("#/season", "The Season")}${item("#/playoff", "Playoff Picture")}${item("#/compare", "Compare ratings")}${item("#/team-select", "All Teams")}</div>
        <div><h3 class="m-ovl-h">PLAYERS · RECRUITING</h3>${item("#/players", "Players & Leaders")}${item("#/scatter", "Talent vs Production")}${item("#/recruiting", "Recruiting Classes")}${item("#/recruiting/prospects", "Prospect Board")}${item("#/portal", "Transfer Portal")}</div>
        <div><h3 class="m-ovl-h">ABOUT</h3>${item("#/guide", "How It Works")}${item("#/methods", "Methods")}${item("#/research", "Research")}${item("#/changes", "Build Log")}</div>
      </div>
      <div class="m-ovl-opts">
          <button class="m-item" type="button" data-nav data-nav-group="ovl" data-act="season"><span class="m-item-label">Change Year</span></button>
          <button class="m-item" type="button" data-nav data-nav-group="ovl" data-act="mode"><span class="m-item-label">${this.mode === "light" ? "Dark Mode" : "Light Mode"}</span></button>
          <button class="m-item" type="button" data-nav data-nav-group="ovl" data-act="close"><span class="m-item-label">Close</span></button>
      </div>
      <p class="m-ovl-credit">CFB Analytics ${CONFIG.VERSION} · Data: <a href="https://collegefootballdata.com" target="_blank" rel="noopener">CollegeFootballData.com</a></p></div>`;
  this.root.appendChild(el);
  this.overlay = el;
  const prev = menuFocus.current;
  menuFocus.scope = el;
  const close = () => {
    for (const off of offs) off();
    el.remove(); this.overlay = null; menuFocus.scope = null;
    if (prev && prev.isConnected) menuFocus.set(prev, { scroll: false });
    return true;
  };
  const offs = [menuInput.on("back", close), menuInput.on("home", close)];
  el.addEventListener("click", e => { if (e.target === el) close(); });
  el.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => { close(); menuRouter.go(b.dataset.go); }));
  el.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => {
    const act = b.dataset.act;
    close();
    if (act === "mode") menuInput.dispatch("mode"); else if (act === "season") menuRouter.stepSeason(1);
  }));
  menuFocus.set(el.querySelector("[data-go]"), { scroll: false });
};
