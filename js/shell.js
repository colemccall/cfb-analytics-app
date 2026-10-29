// shell.js — the shared page chrome: theme, sidebar navigation, mobile tab bar.
//
// Every page declares itself with <body data-page="…"> and loads, at the top of
// <body>:   <script src="js/config.js"></script><script src="js/shell.js"></script>
// The shell applies the saved theme immediately (before first paint) and injects
// the sidebar + mobile nav, so navigation lives in exactly one file instead of
// being copy-pasted into every page.

(function () {
  // Theme first — before any content paints. The valid themes are CONFIG.THEMES
  // (config.js), not a list written here, so a new skin needs no change to this file.
  // Order: ?theme= URL override (screenshot tests) → saved choice (legacy
  // "dynasty-dark"/"mid" migrate to dark) → OS preference.
  const THEME_IDS = CONFIG.THEMES.map(t => t.id);
  const legacy = { "dynasty-dark": "dark", "mid": "dark" };
  const saved = localStorage.getItem("cfb-theme");
  const urlOverride = new URLSearchParams(location.search).get("theme");
  let theme = urlOverride || legacy[saved] || saved;
  if (!THEME_IDS.includes(theme)) {
    const wantsLight = window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches;
    theme = wantsLight && THEME_IDS.includes("light") ? "light" : THEME_IDS[0];
  }
  document.documentElement.setAttribute("data-theme", theme);
  if (legacy[saved]) localStorage.setItem("cfb-theme", legacy[saved]);

  const VERSION = "v4.17.0";

  // `short` is the mobile tab-bar label — five labels must fit a 360px phone,
  // so anything longer than ~8 characters gets an abbreviation here.
  const PAGES = [
    { id: "menu",     href: "menu.html",       icon: "⬡",  label: "Menu" },
    { id: "season26", href: "season2026.html", icon: "🏈", label: "'26 Season", short: "'26" },
    { id: "teams",    href: "teams.html",      icon: "🏟",  label: "Teams" },
    { id: "players",  href: "players.html",    icon: "👤", label: "Players" },
    { id: "ratings",  href: "ratings.html",    icon: "📊", label: "Ratings" },
    { id: "league",   href: "league.html",     icon: "🏆", label: "League" },
    { id: "research", href: "research.html",   icon: "🔬", label: "Research" },
    { id: "methods",  href: "methods.html",    icon: "🧮", label: "Methods" },
    { id: "changes",  href: "changes.html",    icon: "🛠", label: "Build Log", short: "Log" },
    { id: "info",     href: "info.html",       icon: "ℹ",  label: "How It Works" },
  ];
  // Five slots on mobile — the core destinations.
  const MOBILE = ["menu", "season26", "teams", "players", "research"];

  const active = document.body.dataset.page || "";

  const sidebar = `
    <aside class="sidebar">
      <nav class="sidebar-nav">
        ${PAGES.map(p => `
          <a href="${p.href}" class="snav-item${p.id === active ? " active" : ""}">
            <span class="snav-icon">${p.icon}</span> ${p.label}</a>`).join("")}
      </nav>
      <div class="sidebar-bottom">
        <div>
          <div class="sidebar-theme-label">Theme</div>
          <div class="theme-swatches">
            ${CONFIG.THEMES.map(t => `
            <button class="theme-swatch" data-theme-pick="${t.id}" title="${t.label}" aria-label="${t.label} theme"
                    style="background:${t.swatch};border-color:${t.edge}"></button>`).join("")}
          </div>
        </div>
        <div class="sidebar-version">${VERSION}</div>
        <a class="sidebar-credit" href="https://collegefootballdata.com" target="_blank" rel="noopener">Data: CollegeFootballData.com</a>
      </div>
    </aside>`;

  const mobileNav = `
    <nav class="mobile-tab-bar" aria-label="Mobile navigation">
      <div class="mobile-tab-bar-inner">
        ${PAGES.filter(p => MOBILE.includes(p.id)).map(p => `
          <a href="${p.href}" class="mobile-tab-btn${p.id === active ? " active" : ""}">
            <span class="tab-icon">${p.icon}</span>${p.short || p.label}</a>`).join("")}
      </div>
    </nav>`;

  // Injected synchronously at the top of <body>, so the sidebar exists before
  // the page's own content parses — no layout shift. The mobile bar is
  // position:fixed, so its DOM position is irrelevant.
  // Skip link first in tab order; its target is the page's main column.
  const skip = '<a class="skip-link" href="#main-content">Skip to content</a>';
  document.body.insertAdjacentHTML("afterbegin", skip + sidebar + mobileNav);
  // The main column does not exist yet (this script runs at the top of <body>),
  // so it is marked once the document has parsed. tabindex -1 lets the skip
  // link's fragment move focus there.
  document.addEventListener("DOMContentLoaded", () => {
    const main = document.querySelector(".main-content");
    if (main) { main.id = "main-content"; main.tabIndex = -1; }
  });

  // Swatches: mark the active one, and re-render data-colored UI on change —
  // page scripts listen for "cfb:themechange" and re-render from cached state.
  function markActive(t) {
    document.querySelectorAll(".theme-swatch").forEach(b =>
      b.classList.toggle("active", b.dataset.themePick === t));
  }
  markActive(theme);

  document.querySelectorAll(".theme-swatch").forEach(btn => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.themePick;
      document.documentElement.setAttribute("data-theme", t);
      localStorage.setItem("cfb-theme", t);
      markActive(t);
      window.dispatchEvent(new CustomEvent("cfb:themechange", { detail: { theme: t } }));
    });
  });
})();
