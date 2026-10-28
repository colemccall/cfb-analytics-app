// menuFocus.js — which item is selected, and where a direction takes it.
//
// A menu has exactly one highlighted item at a time. Every element a screen wants
// reachable is marked data-nav; this module keeps the one that is selected, moves it
// when an action says "down" or "left", and lets the mouse move it too (hover
// selects, click activates) so mouse-first and controller feel the same.
//
// Moving is geometric, not DOM order: from the selected item, the next one in a
// direction is the nearest item whose rectangle lies beyond the edge in that
// direction, with a penalty for how far off-axis it is. That is what makes a grid of
// team tiles, a list beside a panel and a row of tabs all navigable with the same
// four buttons and no per-screen wiring. data-nav-group narrows up/down to the same
// list first, so a long roster scrolls row by row instead of jumping to a tab.
//
// Must never contain: any knowledge of a particular screen, or markup.
//
// Load order: after menuInput.js, before menuChrome.js and menuRouter.js.

const menuFocus = { root: null, current: null };

// Items must be this far past an edge to count as "in that direction" — it forgives
// the 1-2px by which neighbouring rows overlap.
const MENU_FOCUS_TOLERANCE = 6;
// How hard being off-axis is penalised against being far along the axis.
const MENU_FOCUS_CROSS_WEIGHT = 2.2;

// Binds the focus layer to the element that holds the screens, and wires pointer
// hover (selection follows the mouse) and activation. Call once at start-up.
menuFocus.attach = function (root) {
  this.root = root;
  root.addEventListener("pointermove", e => {
    const el = e.target.closest?.("[data-nav]");
    if (el && el !== this.current && this._usable(el)) this.set(el, { scroll: false });
  });
  menuInput.on("select", () => this.activate());
  for (const dir of ["up", "down", "left", "right"]) menuInput.on(dir, () => this.move(dir));
  menuInput.on("pageUp", () => this.page(-1));
  menuInput.on("pageDown", () => this.page(1));
};

// An item can take the selection when it is on screen and not disabled.
menuFocus._usable = function (el) {
  return el.isConnected && !el.hidden && el.getAttribute("aria-disabled") !== "true"
    && !!(el.offsetWidth || el.offsetHeight);
};

// Every selectable item currently on screen, in DOM order.
menuFocus.items = function () {
  if (!this.root) return [];
  // While the quick menu is open the selection is confined to it.
  return [...(this.scope || this.root).querySelectorAll("[data-nav]")].filter(el => this._usable(el));
};

// Selects `el`: moves the highlight, gives it real focus (so screen readers and
// :focus-visible agree) and, unless told not to, scrolls it into view. Announces the
// change on the element so a screen can show a detail panel for the selected item.
menuFocus.set = function (el, { scroll = true } = {}) {
  if (!el) return;
  if (this.current && this.current !== el) this.current.classList.remove("is-selected");
  this.current = el;
  el.classList.add("is-selected");
  try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable: the class still marks it */ }
  if (scroll) el.scrollIntoView({ block: "nearest", inline: "nearest" });
  el.dispatchEvent(new CustomEvent("menu:select", { bubbles: true }));
};

// After a screen renders: select its preferred item — the one `prefer` (a selector)
// names, else one marked data-nav-default, else the first item IN THE STAGE (the
// header's season stepper and the tab strip are reachable, but a screen should open
// on its own content). Keeps nothing selected if there is nothing usable.
menuFocus.reset = function (prefer = null) {
  this.current = null;
  const items = this.items();
  const stage = this.root.querySelector("#m-stage");
  const inStage = items.find(el => stage && stage.contains(el));
  const named = (sel) => { const el = sel && this.root.querySelector(sel); return el && this._usable(el) ? el : null; };
  const pick = named(prefer) || named("[data-nav-default]") || inStage || items[0];
  if (pick && this._usable(pick)) this.set(pick, { scroll: false });
};

// The geometric core. Returns the best item in `dir` from `from`, or null. For each
// candidate, `along` is the gap beyond the edge in the direction of travel and
// `cross` is how far its centre is off that axis; the lowest along + cross*weight wins.
menuFocus._best = function (from, dir, pool) {
  const a = from.getBoundingClientRect();
  const ac = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  let best = null, bestScore = Infinity;
  for (const el of pool) {
    if (el === from) continue;
    const r = el.getBoundingClientRect();
    const rc = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    let along, cross;
    if (dir === "down")  { along = r.top - a.bottom; cross = Math.abs(rc.x - ac.x); if (rc.y <= ac.y) continue; }
    if (dir === "up")    { along = a.top - r.bottom;  cross = Math.abs(rc.x - ac.x); if (rc.y >= ac.y) continue; }
    if (dir === "right") { along = r.left - a.right;  cross = Math.abs(rc.y - ac.y); if (rc.x <= ac.x) continue; }
    if (dir === "left")  { along = a.left - r.right;  cross = Math.abs(rc.y - ac.y); if (rc.x >= ac.x) continue; }
    if (along < -MENU_FOCUS_TOLERANCE) along = Math.abs(along) * 3;   // overlapping: allowed, but a long way second
    const score = Math.max(0, along) + cross * MENU_FOCUS_CROSS_WEIGHT;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
};

// Moves the selection one step in `dir`. Up and down prefer the current item's own
// list (data-nav-group), falling back to anything in that direction. Returns true if
// the selection moved, which tells the input layer the press was used.
menuFocus.move = function (dir) {
  const items = this.items();
  if (!items.length) return false;
  if (!this.current || !this._usable(this.current)) { this.set(items[0]); return true; }
  const group = this.current.dataset.navGroup;
  let next = null;
  if (group && (dir === "up" || dir === "down")) {
    next = this._best(this.current, dir, items.filter(el => el.dataset.navGroup === group));
  }
  next = next || this._best(this.current, dir, items);
  if (next) { this.set(next); return true; }
  return false;
};

// Jumps a page (8 items) along the current item's list, clamped at the ends.
menuFocus.page = function (step) {
  if (!this.current) return false;
  const group = this.current.dataset.navGroup;
  const list = this.items().filter(el => group ? el.dataset.navGroup === group : true);
  const i = list.indexOf(this.current);
  if (i < 0) return false;
  this.set(list[Math.max(0, Math.min(list.length - 1, i + step * 8))]);
  return true;
};

// Activates the selected item — the same as clicking it. A disabled item does nothing.
menuFocus.activate = function () {
  const el = this.current;
  if (!el || !this._usable(el)) return false;
  el.click();
  return true;
};
