// menuBackdrop.js — the slideshow behind the menu: famous stadiums on the home page, the team's own photos on a team's
// screens. Photos are freely licensed images from Wikimedia Commons, linked (never copied), found by
// scripts/20_harvest_backdrops.py with their author and licence, which the corner credit shows and links. A team with
// no photo gets its colours. The panels over it turn translucent while it is on so the picture shows around and
// through them; a screen of dense tables dims it instead of hiding it. Pure presentation: it fetches nothing itself
// (dataLoader's fetchBackdrops does) and never blocks the screen: a photo that fails to load is skipped.
//
// Must never contain: any screen's content.
//
// Load order: after menuChrome.js, before menuRouter.js starts.

const MENU_BACKDROP_MS = 9000;       // how long each photo stays
const MENU_BACKDROP_FADE_MS = 1600;

const menuBackdrop = { el: null, set: [], i: 0, timer: null, key: null, token: 0 };

// Builds the layer once, as the first child of the menu root, under the header and stage.
menuBackdrop.build = function (root) {
  const el = document.createElement("div");
  el.className = "m-backdrop";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = '<div class="m-bd-img" data-slot="0"></div><div class="m-bd-img" data-slot="1"></div><div class="m-bd-shade"></div><a class="m-bd-credit" target="_blank" rel="noopener" hidden></a>';
  root.prepend(el);
  this.el = el;
  this.root = root;
};

// Chooses what is behind the screen: { kind: "home" | "team" | "none", photos, color }. The same set again does nothing
// (a tab change must not restart the slideshow). Dense screens dim it; "none" fades it out.
menuBackdrop.show = function ({ kind, photos = [], color = "", key = kind }) {
  if (!this.el) return;
  this.root.dataset.bd = kind;
  this.el.style.setProperty("--m-bd-team", color || "");
  if (key === this.key) return;
  this.key = key;
  clearTimeout(this.timer);
  this.set = photos.slice();
  this.i = -1;
  this.token++;
  this.el.querySelectorAll(".m-bd-img").forEach(s => { s.classList.remove("is-on"); });
  if (kind === "none" || !this.set.length) { this.credit(null); return; }
  // Start at a different photo each visit so the same one is not always first.
  this.i = Math.floor(Math.random() * this.set.length) - 1;
  this.next(this.token);
};

// Shows the next photo that loads, crossfading, and schedules the one after. A photo that fails is skipped.
menuBackdrop.next = function (token) {
  if (token !== this.token || !this.set.length) return;
  for (let tries = 0; tries < this.set.length; tries++) {
    this.i = (this.i + 1) % this.set.length;
    const photo = this.set[this.i];
    const img = new Image();
    img.onload = () => {
      if (token !== this.token) return;
      const slots = [...this.el.querySelectorAll(".m-bd-img")];
      const on = slots.find(s => s.classList.contains("is-on"));
      const slot = slots.find(s => s !== on) || slots[0];
      slot.style.backgroundImage = `url("${photo.url.replace(/"/g, "%22")}")`;
      slot.classList.add("is-on");
      if (on) on.classList.remove("is-on");
      this.credit(photo);
      if (this.set.length > 1) this.timer = setTimeout(() => this.next(token), MENU_BACKDROP_MS);
    };
    img.onerror = () => { if (token === this.token) { this.set.splice(this.i, 1); this.i--; this.next(token); } };
    img.src = photo.url;
    return;
  }
};

// The corner credit for the photo showing: who took it and under what licence, linking to its page. Hidden for none.
menuBackdrop.credit = function (photo) {
  const a = this.el.querySelector(".m-bd-credit");
  if (!photo) { a.hidden = true; return; }
  a.hidden = false;
  a.href = photo.page;
  a.textContent = `Photo: ${photo.credit} · ${photo.license}`;
};

// Called by the router after each screen is drawn: the home page shows the famous stadiums, a team's screens show that
// team's photos, everything else shows none. `route` is { id, teamId }; `backdrops` is the harvested file or null.
menuBackdrop.apply = function (route, backdrops, team) {
  if (!backdrops) { this.show({ kind: "none" }); return; }
  if (route.id === "home") { this.show({ kind: "home", photos: backdrops.home || [], key: "home" }); return; }
  if (route.teamId != null && ["team", "roster", "depth", "schedule", "team-recruiting", "team-portal", "team-history"].includes(route.id)) {
    this.show({ kind: "team", photos: (backdrops.teams || {})[String(route.teamId)] || [], color: team && team.color || "", key: `team-${route.teamId}` });
    return;
  }
  this.show({ kind: "none" });
};
