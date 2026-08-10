// shell.js — the shared page chrome: theme, sidebar navigation, mobile tab bar.
//
// Every page declares itself with <body data-page="…"> and loads, at the top of
// <body>:   <script src="js/config.js"></script><script src="js/shell.js"></script>
// The shell applies the saved theme immediately (before first paint) and injects
// the sidebar + mobile nav, so navigation lives in exactly one file instead of
// being copy-pasted into every page.

(function () {
  // Theme first — before any content paints.
  const saved = localStorage.getItem("cfb-theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);

  const VERSION = "v3.0.0";

  const PAGES = [
    { id: "home",     href: "index.html",      icon: "⬡",  label: "Home" },
    { id: "season26", href: "season2026.html", icon: "🏈", label: "'26 Season" },
    { id: "teams",    href: "teams.html",      icon: "🏟",  label: "Teams" },
    { id: "players",  href: "players.html",    icon: "👤", label: "Players" },
    { id: "ratings",  href: "ratings.html",    icon: "📊", label: "Ratings" },
    { id: "research", href: "research.html",   icon: "🔬", label: "Research" },
    { id: "info",     href: "info.html",       icon: "ℹ",  label: "How It Works" },
  ];
  // Five slots on mobile — the core destinations.
  const MOBILE = ["home", "season26", "teams", "players", "research"];

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
            <button class="theme-swatch" data-theme="dynasty-dark" title="Dark"></button>
            <button class="theme-swatch" data-theme="mid" title="Slate"></button>
            <button class="theme-swatch" data-theme="light" title="Light"></button>
          </div>
        </div>
        <div class="sidebar-version">${VERSION}</div>
      </div>
    </aside>`;

  const mobileNav = `
    <nav class="mobile-tab-bar" aria-label="Mobile navigation">
      <div class="mobile-tab-bar-inner">
        ${PAGES.filter(p => MOBILE.includes(p.id)).map(p => `
          <a href="${p.href}" class="mobile-tab-btn${p.id === active ? " active" : ""}">
            <span class="tab-icon">${p.icon}</span>${p.label}</a>`).join("")}
      </div>
    </nav>`;

  // Injected synchronously at the top of <body>, so the sidebar exists before
  // the page's own content parses — no layout shift. The mobile bar is
  // position:fixed, so its DOM position is irrelevant.
  document.body.insertAdjacentHTML("afterbegin", sidebar + mobileNav);

  document.querySelectorAll(".theme-swatch").forEach(btn => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.theme;
      document.documentElement.setAttribute("data-theme", t);
      localStorage.setItem("cfb-theme", t);
    });
  });
})();
