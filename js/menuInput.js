// menuInput.js — one input layer for the menu: mouse, keyboard and game controller.
//
// Every device is turned into the same small vocabulary of ACTIONS, so a screen is
// written once and works with all three:
//
//   up down left right   move the selection
//   select               activate the selected item          (A / Enter / click)
//   back                 leave the screen                    (B / Esc / Backspace)
//   tabPrev tabNext      switch tabs                         (LB RB / Q E / [ ])
//   pageUp pageDown      jump a page in a long list          (LT RT / PgUp PgDn)
//   alt                  a screen's secondary action         (X / Space)
//   season               step the season                     (Y button / Y key)
//   home                 go to the hub                       (Start / H)
//
// The layer also tracks which device was used last ("mouse" | "keys" | "pad"), so
// the button-prompt bar can show the labels of the device in the player's hands.
//
// Gamepad: the Gamepad API has no events for button presses, only a state to poll,
// so a requestAnimationFrame loop reads the first connected pad. Buttons act on the
// press edge, never while held. The D-pad and the left stick both move; the stick
// has a dead zone and the same initial-delay-then-repeat as a held key, so a lightly
// resting thumb does nothing and a held direction scrolls a long list at a steady pace.
// Standard mapping only (the layout browsers expose for Xbox, PlayStation and most
// others): 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 9 Start, 12-15 D-pad.
//
// Must never contain: knowledge of any screen. It emits actions; menuFocus.js and the
// router decide what they mean.
//
// Load order: after config.js, before menuFocus.js / menuChrome.js / menuRouter.js.

const MENU_ACTIONS = ["up", "down", "left", "right", "select", "back", "tabPrev", "tabNext",
                      "pageUp", "pageDown", "alt", "season", "home"];

// Keyboard → action. Arrow keys and WASD both move; Tab is left alone so ordinary
// keyboard navigation of the page still works as a fallback.
const MENU_KEYS = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right", y: "season",
  Enter: "select", Escape: "back", Backspace: "back",
  q: "tabPrev", e: "tabNext", "[": "tabPrev", "]": "tabNext",
  PageUp: "pageUp", PageDown: "pageDown", " ": "alt", h: "home",
};

// Standard-mapping gamepad buttons → action.
const MENU_PAD_BUTTONS = {
  0: "select", 1: "back", 2: "alt", 3: "season", 4: "tabPrev", 5: "tabNext",
  6: "pageUp", 7: "pageDown", 9: "home", 12: "up", 13: "down", 14: "left", 15: "right",
};

const MENU_STICK_DEADZONE = 0.55;   // how far the stick must lean before it counts
const MENU_REPEAT_FIRST_MS = 360;   // a held direction: wait this long…
const MENU_REPEAT_MS = 110;         // …then repeat at this interval

const menuInput = {
  device: "mouse",
  _handlers: {},
  _held: {},          // action → { next: timestamp } for held directions
  _padDown: {},       // button index → true while down (edge detection)
  _started: false,
};

// Registers `fn` to run for `action`. Returns an unsubscribe function, so a screen
// can listen while it is mounted and let go when it leaves.
menuInput.on = function (action, fn) {
  (this._handlers[action] ||= new Set()).add(fn);
  return () => this._handlers[action].delete(fn);
};

// Runs every handler for `action`, newest registration first so the screen on top
// sees it before the frame beneath it. A handler returning true consumes the action.
// Also the entry point for tests, which drive the menu through it.
menuInput.dispatch = function (action, source = null) {
  if (source) this._setDevice(source);
  const hs = [...(this._handlers[action] || [])].reverse();
  for (const h of hs) {
    try { if (h(action) === true) return true; } catch (e) { /* a broken handler must not stop input */ }
  }
  return false;
};

// Records the device that produced the last input and tells anything listening (the
// prompt bar) when it changes. Does nothing while the device is unchanged.
menuInput._setDevice = function (device) {
  if (this.device === device) return;
  this.device = device;
  window.dispatchEvent(new CustomEvent("menu:device", { detail: { device } }));
};

// A held direction repeats, a button does not. `held` maps an action to the time its
// next repeat is due; calling this each frame with the set of actions currently
// pressed fires new presses immediately and repeats the held ones on schedule.
menuInput._pump = function (pressedDirs, now) {
  for (const a of Object.keys(this._held)) {
    if (!pressedDirs.has(a)) delete this._held[a];
  }
  for (const a of pressedDirs) {
    const h = this._held[a];
    if (!h) {
      this._held[a] = { next: now + MENU_REPEAT_FIRST_MS };
      this.dispatch(a, "pad");
    } else if (now >= h.next) {
      h.next = now + MENU_REPEAT_MS;
      this.dispatch(a, "pad");
    }
  }
};

// One frame of gamepad polling: read the first connected pad, fire button presses on
// their edge, and feed the D-pad and stick directions to the repeat logic.
menuInput._poll = function (now) {
  const pads = (navigator.getGamepads && navigator.getGamepads()) || [];
  const pad = [...pads].find(p => p && p.connected);
  if (!pad) { this._padDown = {}; this._pump(new Set(), now); return; }

  const dirs = new Set();
  const dpad = { 12: "up", 13: "down", 14: "left", 15: "right" };
  pad.buttons.forEach((b, i) => {
    const down = !!(b && (b.pressed || b.value > 0.6));
    const action = MENU_PAD_BUTTONS[i];
    if (!action) return;
    if (dpad[i]) { if (down) dirs.add(action); return; }
    if (down && !this._padDown[i]) this.dispatch(action, "pad");
    this._padDown[i] = down;
  });
  const x = pad.axes[0] || 0, y = pad.axes[1] || 0;
  if (Math.abs(x) > MENU_STICK_DEADZONE && Math.abs(x) >= Math.abs(y)) dirs.add(x > 0 ? "right" : "left");
  else if (Math.abs(y) > MENU_STICK_DEADZONE) dirs.add(y > 0 ? "down" : "up");
  this._pump(dirs, now);
};

// Starts listening: keyboard, pointer (to know the mouse is in use) and the gamepad
// loop. Safe to call more than once. Gamepad connect/disconnect are announced on
// window as "menu:pad" so the chrome can toast them.
menuInput.start = function () {
  if (this._started) return;
  this._started = true;

  document.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
      if (e.key !== "Escape") return;          // let a text field keep its keys
    }
    const action = MENU_KEYS[e.key] || MENU_KEYS[e.key.toLowerCase?.()];
    if (!action) return;
    this._setDevice("keys");
    if (this.dispatch(action)) e.preventDefault();
  });
  window.addEventListener("pointermove", () => this._setDevice("mouse"), { passive: true });
  window.addEventListener("pointerdown", () => this._setDevice("mouse"), { passive: true });
  window.addEventListener("gamepadconnected", e => {
    window.dispatchEvent(new CustomEvent("menu:pad", { detail: { connected: true, id: e.gamepad.id } }));
  });
  window.addEventListener("gamepaddisconnected", e => {
    window.dispatchEvent(new CustomEvent("menu:pad", { detail: { connected: false, id: e.gamepad.id } }));
  });

  const frame = now => { this._poll(now); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
};
