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
        <h1 class="m-title" id="m-title">Dynasty</h1>
      </div>
      <div class="m-season" id="m-season">
        <button class="m-step" type="button" data-nav data-nav-group="season" data-step="1" aria-label="Previous season">◀</button>
        <span class="m-season-label" id="m-season-label"></span>
        <button class="m-step" type="button" data-nav data-nav-group="season" data-step="-1" aria-label="Next season">▶</button>
      </div>
    </header>
    <nav class="m-tabs" id="m-tabs" aria-label="Screen tabs" hidden></nav>
    <main class="m-stage" id="m-stage" tabindex="-1"></main>
    <footer class="m-bottom">
      <div class="m-prompts" id="m-prompts" aria-label="Controls"></div>
      <div class="m-ticker" aria-label="Top 25 teams"><span class="m-ticker-tag">TOP 25</span>
        <div class="m-ticker-run"><div class="m-ticker-track" id="m-ticker-track"></div></div><span class="m-ticker-end">CFB</span></div>
    </footer>
    <div class="m-toast" id="m-toast" role="status" aria-live="polite"></div>`;
  for (const id of ["banner", "crumb", "title", "season", "season-label", "tabs", "stage", "prompts", "ticker-track", "toast"]) {
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
menuChrome.setHeader = function ({ title, crumb, team, season }) {
  this.el.title.textContent = title;
  this.el.crumb.textContent = crumb || "";
  this.el.season.hidden = season == null;
  this.el["season-label"].textContent = season == null ? "" :
    `${season}${CONFIG.LIVE_SEASONS.includes(season) ? " · IN PROGRESS" : isProjectedSeason(season) ? " · PROJECTED" : ""}`;
  this.el.banner.style.setProperty("--m-team", team?.color || "");
  this.el.banner.innerHTML = team ? teamMark(team, "m-banner-mark") : "";
  this.el.banner.classList.toggle("has-team", !!team);
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
  const all = [...this.prompts, { action: "mode", label: this.mode === "light" ? "Dark mode" : "Light mode" }];
  this.el.prompts.innerHTML = all.map(p => {
    const act = run[p.action];
    const glyph = `<span class="m-glyph m-glyph--${menuInput.device === "pad" ? "pad" : "key"}">${_esc(g[p.action] || "")}</span>`;
    return act
      ? `<button class="m-prompt" type="button" data-prompt="${act}">${glyph}<span>${_esc(p.label)}</span></button>`
      : `<span class="m-prompt is-static">${glyph}<span>${_esc(p.label)}</span></span>`;
  }).join("");
  this.el.prompts.querySelectorAll("[data-prompt]").forEach(b =>
    b.addEventListener("click", () => menuInput.dispatch(b.dataset.prompt)));
  const bump = menuInput.device === "pad" ? ["LB", "RB"] : ["Q", "E"];
  const bumpers = this.el.tabs.querySelectorAll(".m-bumper");
  if (bumpers.length === 2) { bumpers[0].textContent = bump[0]; bumpers[1].textContent = bump[1]; }
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
  document.documentElement.setAttribute("data-theme", mode === "light" ? "light" : "retro");
  try { localStorage.setItem("cfb-menu-mode", mode); } catch (e) { /* the mode still applies */ }
  this.renderPrompts();
  if (redraw) { menuRouter.render(); this.toast(mode === "light" ? "Light mode" : "Dark mode"); }
};

// Fills the scores ticker with the top 25 by our team rating (earned to date when the season
// has it, else the projection), each with its record. The text is written twice so the
// marquee can loop without a gap. A failed load leaves the ticker empty, which is harmless.
menuChrome.loadTicker = async function () {
  try {
    const d = await menuTeams(MENU.season);
    const val = t => d.liveById[t.id]?.overall_rating ?? t.overall_rating;
    const top = d.teams.filter(t => val(t) != null).sort((a, b) => val(b) - val(a)).slice(0, 25);
    const one = top.map((t, i) => {
      const s = d.standings[t.id];
      return `<span>#${i + 1} <b>${_esc(t.school)}</b>${s ? ` (${s.w}-${s.l})` : ""}</span>`;
    }).join("");
    this.el["ticker-track"].innerHTML = one + one;
  } catch (e) { /* no ticker */ }
};
