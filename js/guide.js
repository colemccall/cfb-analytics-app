// guide.js — the GUIDE registry behind info.html ("How It Works").
//
// methods.html explains how every number is MADE. changes.html explains what
// happened to it. This explains how to USE the site: what each page answers,
// what every panel and control does, and what every mark on a number means.
//
// It replaced a hand-written info.html that restated the formulas and had drifted
// from the code in at least six places by September 2026 (the opponent
// multiplier range, three of five defensive weight cards, the team-rating blend,
// "team ratings exist for 2025 only", three different version numbers). The rule
// that keeps this from happening again:
//
//   THIS REGISTRY RESTATES NO FORMULA AND NO CONSTANT.
//
// Anything computed is either linked to its METHODS entry (`methods: [ids]`),
// read live from data/ (`live`), or rendered by the same helper the site uses
// (`glossary[].sample`), so the example cannot disagree with the real thing. It
// is therefore not mirrored in the pipeline's docs/ — there is nothing in it for
// a markdown copy to drift from.
//
// Entry contract:
//   id        registry key + anchor. "projections" and "ol" are linked from
//             elsewhere (ui.js, older pages) and must keep existing.
//   group     which section it renders under (GUIDE_GROUPS)
//   title     heading
//   summary   registry prose (ui.js prose()): **bold** — may wrap a line, not a
//             paragraph — `code` on one line, blank line = new paragraph
//   page      optional — the page this entry documents, rendered as a link
//   panels    optional [{ name, what }]   — what you see, top to bottom
//   controls  optional [{ name, what }]   — what you can do
//   glossary  optional [{ term, sample() → html, meaning }]
//   tips      optional [string]           — deep links, shortcuts, gotchas
//   live      optional async () → html    — a sentence computed from data/
//   render    optional () → html          — a block drawn from CONFIG (the tier legend)
//   methods   optional [METHODS ids]      — "how this is computed" links
//   limits    what this page or mark cannot tell you. Required, as in METHODS.
//
// Adding an entry is content, never page code. guidePage.js renders all of it.

const GUIDE_GROUPS = [
  { id: "start",   label: "Start here" },
  { id: "reading", label: "Reading a number" },
  { id: "pages",   label: "Page by page" },
  { id: "numbers", label: "Where the numbers come from" },
];

const GUIDE = [
  // ── Start here ────────────────────────────────────────────────────────────
  {
    id: "what-this-is",
    group: "start",
    title: "What this site measures",
    summary: `Recruiting rankings measure what scouts expected of a player before he played a
      college snap. The ratings here measure what he **did**: box-score production, game by game,
      adjusted for the strength of the opponent, on a fixed 30–99 scale.

      The scale is absolute, not a ranking. The same production earns the same rating in 2012 and
      in 2025, and if nobody reaches the top of the scale in a season, nobody rates 99 that season.
      That is what lets a number on one page be compared with a number on any other.

      Three things to know before reading anything else:
      **${CONFIG.CURRENT_SEASON} has not been played**, so every ${CONFIG.CURRENT_SEASON} number
      is a projection and says so; **offensive linemen carry no individual rating**, because
      no individual blocking data exists anywhere; and **every number links to how it was made** —
      the Methods page — including what it cannot support.`,
    live: async () => {
      const m = await _load("manifest.json");
      if (!m) return "";
      return `Seasons on file: <strong>${_esc(m.first_season)}–${_esc(m.current_season)}</strong>.
        Earned ratings run through <strong>${_esc(m.last_played_season)}</strong>;
        ${(m.projected_seasons || []).map(_esc).join(", ")} ${m.projected_seasons?.length === 1 ? "is" : "are"} projected.`;
    },
    methods: ["edge-core"],
    limits: `Box scores are the only per-player signal college football publishes, so everything a
      box score cannot see — blocking, route running, coverage that produced no statistic, gap
      discipline — is invisible or estimated. The Methods page says which, position by position.`,
  },
  {
    id: "getting-around",
    group: "start",
    title: "Getting around",
    summary: `Every page has the same sidebar (a five-item tab bar on a phone). Almost every team
      and player name anywhere on the site is a link: a **team** opens its team page in the season
      you were looking at; a **player** opens his card in place, without leaving the page.

      Links carry their season, so they can be shared or bookmarked:
      \`players.html?player=ID&season=2025\` opens that player's 2025 card, and
      \`teams.html?team=Boise%20State&season=2013\` opens that team in 2013. Ctrl- or cmd-click
      any player or team link to open it in a new tab.`,
    controls: [
      { name: "Theme swatches (sidebar, bottom)", what: "Dark or light. Remembered on this device; every coloured number repaints in the new theme's palette." },
      { name: "Player card", what: "Close with ✕, Esc, or a click outside it. A similar player inside a card opens his own card." },
      { name: "Sortable tables", what: "Click a column header to sort; click again to reverse. Blank values always sort to the bottom." },
    ],
    tips: [
      "Filters and pickers are per page and reset on reload — a shared link carries the player, team and season, not the filters.",
      "Opening the first player card on a page is the slow one: it reads every season's file to draw the career. Later cards are instant.",
    ],
    limits: `The site is static files with no accounts or server, so nothing you do on it is saved
      beyond the theme choice on this device.`,
  },

  // ── Reading a number ──────────────────────────────────────────────────────
  {
    id: "tiers",
    group: "reading",
    title: "The rating scale and its colours",
    summary: `Ratings run 30–99. The colour of a rating pill is its tier, from the same palette in
      every table, card and chart, in both themes.`,
    render: () => {
      const TIERS = [
        ["ELITE",  "90–99", "All-American production for the position"],
        ["GOLD",   "80–89", "Clear starter, above-average production"],
        ["SILVER", "70–79", "Contributing starter"],
        ["BRONZE", "55–69", "Rotation player, or a small sample"],
      ];
      const rows = TIERS.map(([name, range, desc]) => {
        const color = ratingColor(CONFIG.RATING_TIERS[name].min);
        return `<div class="tier-row">
          <div class="tier-dot" style="background:${color}"></div>
          <div class="tier-range" style="color:${color}">${range}</div>
          <div><strong>${name}</strong> — <span class="tier-desc">${desc}</span></div>
        </div>`;
      }).join("");
      return `<div class="tier-rows">${rows}<div class="tier-row">
          <div class="tier-dot" style="background:var(--border-strong)"></div>
          <div class="tier-range" style="color:var(--text-muted)">&lt;55</div>
          <div><strong>BELOW</strong> — <span class="tier-desc">little production, or a rating built mostly from recruiting (see "What a rating is built from")</span></div>
        </div></div>`;
    },
    methods: ["edge-core"],
    limits: `A tier is a band on one position's scale. An 85 quarterback and an 85 corner are each
      85th-grade at their own job; the scale says nothing about which job matters more.`,
  },
  {
    id: "marks",
    group: "reading",
    title: "Every mark on a number, and what it means",
    summary: `Each example below is drawn by the same code that draws it everywhere else on the
      site, so it looks exactly as it will on a real page. Hover any of them there for the full
      explanation.`,
    glossary: [
      { term: "Rating pill",
        sample: () => `${ovrPill(92, { label: "Example" })} ${ovrPill(76, { label: "Example" })} ${ovrPill(58, { label: "Example" })}`,
        meaning: "An earned rating for a season that has been played. Colour is the tier." },
      { term: "Projected rating",
        sample: () => ovrPill(84, { label: "Example", season: CONFIG.CURRENT_SEASON, source: "engine_d" }),
        meaning: `The hatched fill means model output, not something earned on the field. Every ${CONFIG.CURRENT_SEASON} rating looks like this; the tooltip names how it was built.` },
      { term: "PROJ badge",
        sample: () => projBadge(),
        meaning: "Marks the odd one out where projected and earned numbers sit side by side — a career chart, a transfer table. On a wholly projected season the page says it once at the top instead of badging every number." },
      { term: "To-date rating",
        sample: () => livePill({ live_rating: 88, live_games: 6, live_through_week: 8 }),
        meaning: "What a player has earned so far in a season being played, rescaled to full-season pace. The solid underline is what tells it from a plain earned pill and a hatched projection. It is provisional: it needs three games, and it will move as the season does. Never averaged with the projection." },
      { term: "The three ratings",
        sample: () => ratingTrioCells({ rating_prev: 80, overall_rating: 84, projection_low: 78, projection_high: 90, live_rating: 88, live_games: 6, live_through_week: 8, live_status: "rated", rating_prev_status: "rated", position_group: "WR" }, CONFIG.CURRENT_SEASON).join(" "),
        meaning: `On a ${CONFIG.CURRENT_SEASON} player: last season earned, the preseason projection, and earned so far. Three different questions with three different numbers. A missing one is a dash with the reason on hover: a player with 1 or 2 games shows "(2 gm)", an offensive lineman is not rated, a newcomer has no last season.` },
      { term: "Projected-season banner",
        sample: () => `<span class="badge-proj">PROJ</span> <span class="text-muted">Every rating for ${CONFIG.CURRENT_SEASON} is a projection…</span>`,
        meaning: "Appears at the top of any page showing an unplayed season, and disappears when you switch to a played one." },
      { term: "80% range",
        sample: () => projRange(78, 90),
        meaning: "Where a projection should land four times in five. The range is the honest part of a projection: the single number implies more precision than any model has." },
      { term: "Projection source",
        sample: () => ["CV", "CF", "RC"].map(c => `<span class="proj-source-code">${c}</span>`).join(" "),
        meaning: "Where a projected number came from, best evidence first: CV his own career curve; CF last season carried forward along players like him; RC his recruiting grade (true freshmen). A player with none of these gets no projection. Dimmed means low confidence." },
      { term: "Confidence",
        sample: () => `${confidenceChip("high")} ${confidenceChip("low")}`,
        meaning: "On a projection. Offensive skill players have real per-player stats and a depth chart behind them; defenders and specialists have less, and are labelled accordingly." },
      { term: "What a rating is built from",
        sample: () => `${basisChip("blended")} ${basisChip("recruiting")}`,
        meaning: "A player who barely played has too little production to trust alone. \"Part recruiting\" mixes his production with his recruiting grade; \"Recruiting only\" is his position's average moved by his stars — what was expected of him, not what he did. No chip means the rating is his production." },
      { term: "Not rated",
        sample: () => notRatedNote("OL"),
        meaning: "A deliberate refusal, not missing data: no individual production exists for this position in any source. Offensive linemen are rated as a unit on the team page instead." },
      { term: "Offensive line unit",
        sample: () => lineUnitPill(78),
        meaning: "On a team's Ratings tab: the whole line, rated from five team-level measurements. It is a team number and is never shown as any one lineman's." },
      { term: "EDGE %",
        sample: () => contextStrip(92, "92nd percentile among WRs"),
        meaning: "Where a player's raw production score sits among his position that season. The raw score is not comparable across positions (a quarterback's is in the thousands), so tables show the percentile." },
      { term: "🔥 Breakout candidate",
        sample: () => "🔥",
        meaning: `Beside a name on a played season: the rating model's breakout probability for him is 35% or more — a young, highly recruited player producing below his position's median. It is not the projection model's breakout call, and ${CONFIG.CURRENT_SEASON} rows carry no such probability, so the mark does not appear there.` },
      { term: "Movement",
        sample: () => `${deltaChip(4.2)} ${deltaChip(-3.1)}`,
        meaning: "A change always ships with its number: team rating year over year, a transfer's rating at the old school versus the new, a projection against what players like him usually do." },
      { term: "Class year",
        sample: () => `${classYearCell(2, "recruiting")} ${classYearCell(3, "first_fbs")}`,
        meaning: "Full strength when dated from his recruiting class. Dimmed when estimated from his first FBS season — a floor, so a player who started at a junior college or FCS school reads younger than he is. A dash means it cannot be dated." },
      { term: "Position",
        sample: () => ["QB", "WR", "EDGE", "CB", "S"].map(posBadge).join(" "),
        meaning: "Position group. The DB filter selects corners, safeties and players the data source labels only \"DB\" together; each row keeps its own badge." },
      { term: "Method status",
        sample: () => ["shipped", "rejected", "experiment", "blocked"].map(statusChip).join(" "),
        meaning: "On Methods and the Build Log: what happened to each alternative that was considered. Rejected ideas stay published with the measurement that killed them." },
    ],
    limits: `Tooltips carry the detail and do not exist on a touchscreen. On a phone, the same
      explanations are here and on the Methods page.`,
  },
  {
    id: "projections",
    group: "reading",
    title: `How to read a ${CONFIG.CURRENT_SEASON} number`,
    summary: `${CONFIG.CURRENT_SEASON} has not been played, and the site defaults to it. Every
      ${CONFIG.CURRENT_SEASON} player rating is a projection, built from the best evidence available
      for that player and labelled with which evidence that was (see "Projection source" above).
      Team ratings for ${CONFIG.CURRENT_SEASON} are built from those projected rosters.

      A player card on ${CONFIG.CURRENT_SEASON} replaces "Why this rating?" with the projection's own
      reasoning: the number and its 80% range, a breakout / steady / decline call measured against
      what players at the same position, class year and production level usually do next, the
      factors that moved the number, and past careers that looked like his.

      To see what a player actually earned, switch the season picker to
      ${CONFIG.LAST_PLAYED_SEASON} — the columns change from projection sources to production.`,
    live: async () => {
      const { meta } = await fetchTrajectory();
      const f = meta.families || {};
      const line = (name, m) => m && m.model_mae != null
        ? `<li><strong>${name}</strong>: typical error ±${m.model_mae} rating points, against ±${m.naive_mae} for assuming a player simply repeats last season; the 80% range caught ${m.coverage}% of outcomes.</li>`
        : "";
      const rows = line("Offensive skill", f.offense) + line("Defense", f.defense);
      if (!rows) return "";
      return `Measured on ${(meta.test_seasons || []).map(_esc).join("–") || "held-out"} seasons the model never trained on:<ul>${rows}</ul>
        The model earns roughly one rating point over doing nothing. Real, and modest — which is why every projection ships with its range.`;
    },
    methods: ["projection", "mickey"],
    limits: `Projections are built from players who played again the next season, and the best
      players leave for the NFL, so the history overstates how often elite players decline. Offensive
      linemen are not projected at all.`,
  },
  {
    id: "ol",
    group: "reading",
    title: "Why offensive linemen have no rating",
    summary: `No public source records what an individual lineman does: no blocking grades, no
      sacks or pressures allowed per player. Until v4.3 the site published a lineman rating anyway,
      and measured, it turned out to be his recruiting ranking plus a constant.

      So every lineman keeps his card, roster spot and recruiting profile, and his rating says
      **not rated** with the reason. What the data does support is a rating of the **line as a unit**,
      on each team's Ratings tab, from five team-level measurements that exist.`,
    methods: ["ol"],
    limits: `The unit rating cannot say which lineman is good. Splitting it across five players by
      snap count was considered and rejected: it would invent per-player differences that nothing
      measured.`,
  },

  // ── Page by page ──────────────────────────────────────────────────────────
  {
    id: "page-menu",
    group: "pages",
    title: "The Dynasty menu",
    summary: `The home page is a landing page laid out like the franchise menus of an early-2010s console football
      game: three cards (League, News, Dynasty) over the current top teams and the season's playoff picture. It needs
      no team. League is everything across teams (rankings, standings, players, recruiting, the portal); News is the
      playoff bracket, the season page, research and how the app works; Dynasty is the optional way to follow one team
      and drill into it through the hub, with Team, League and News tabs (roster, depth chart, schedule, recruiting,
      transfers, history). Every other page wears the same look. It reads the same data as the rest of
      the site, so a number here is the same number there. The look is original; the layout is from the
      author's memory of that style and may not match it exactly.

      A 2026 roster row and player card show three ratings side by side: last season, the preseason
      projection, and earned to date. They are never combined.`,
    controls: [
      { name: "Mouse", what: "Hover moves the highlight, click selects. Tabs along the top are clickable." },
      { name: "Keyboard", what: "Arrow keys or WASD move; Enter selects; Esc or Backspace goes back; Q and E (or [ and ]) switch tabs; Space sorts or cycles; Y changes season; H opens the quick menu (every screen, the year, light and dark); M switches light and dark. Esc on the landing page opens the quick menu too; Esc on the Dynasty hub returns to the landing page." },
      { name: "Game controller", what: "Plug one in and press any button. D-pad or left stick moves; A selects; B goes back; X sorts; Y changes season; LB and RB switch tabs; Start opens the quick menu; Select switches light and dark. The prompt bar at the bottom switches to controller labels." },
    ],
    tips: [
      "The bar along the bottom always lists what the buttons do on the current screen.",
      "Your team and season are remembered on this device.",
    ],
    limits: `Controller support follows the browser's standard gamepad layout and has been tested here with a
      simulated pad only; an unusual controller may map differently. The depth chart is the order the ratings
      imply, not an official chart. Polls are not shown (none are on disk), and the recruiting class rank is
      our own summary: see the recruiting entry in Methods.`,
  },

  {
    id: "page-home",
    group: "pages",
    page: "index.html?classic",
    title: "Home",
    summary: `The front door: a handful of claims the data supports this week, each linking to the
      full list behind it. Every number on it is computed from the data files when the page loads;
      none is typed in.`,
    panels: [
      { name: "Masthead", what: `Days to kickoff, and the opener to circle: the week-1 game with the best matchup-quality score (combined projected team rating, penalised for a mismatch).` },
      { name: "Storylines", what: `Computed claims — projected risers and sliders, the team that most beat its recruiting, the model's boldest breakout call, a hidden gem, the recruiting class that hit hardest. Each card links to its full list.` },
      { name: "The opening slate", what: "The next six week-1 games by the same matchup-quality score." },
      { name: "Last Season's Standard", what: `The eight best teams by earned ${CONFIG.LAST_PLAYED_SEASON} team rating, each linking to that season's team page.` },
      { name: "From the Research Desk", what: "One computed headline from each live research finding." },
      { name: "Open the full lists", what: "Every storyline as a full, sortable page." },
    ],
    limits: `Storylines are picked by rule (largest move, best residual, …), not by judgement, so
      one can be the product of a thin sample. Its full list shows the context.`,
  },
  {
    id: "page-season26",
    group: "pages",
    page: "season2026.html",
    title: `'${String(CONFIG.CURRENT_SEASON).slice(2)} Season`,
    summary: `Everything known about a season that has not been played: the schedule, which is fact,
      and projected ratings, which are labelled as projections.`,
    panels: [
      { name: "Projected top 25", what: "Teams by projected team rating — built from rosters, not a prediction of record." },
      { name: "Biggest movers", what: `Projected ${CONFIG.CURRENT_SEASON} team rating against what the team earned in ${CONFIG.LAST_PLAYED_SEASON}. Movement is mostly roster turnover.` },
      { name: "25 games to circle", what: "The whole season ranked by matchup quality. Sortable by week, date, either team, or quality." },
      { name: "Team preview", what: "Pick any team for its schedule (non-FBS opponents are named but not linked — we have no page for them) and its ten highest-projected players." },
    ],
    controls: [
      { name: "Team preview picker", what: "Choose a team; choose \"Pick a team…\" to clear." },
    ],
    methods: ["projection", "team-ratings"],
    limits: `There are no win probabilities or playoff odds yet. Those arrive with the prediction
      model, which ships only alongside its backtest.`,
  },
  {
    id: "page-teams",
    group: "pages",
    page: "teams.html",
    title: "Teams",
    summary: `Every FBS program, in any season since ${CONFIG.FIRST_SEASON}. Pick a team from the wall of
      logos (a "Choose a team" button on a phone), then read it tab by tab.`,
    controls: [
      { name: "Search", what: "Filters the logo wall by school name as you type." },
      { name: "Season", what: "Switches every tab, and the conference chips, to that season — conferences are rebuilt per season because realignment changed them." },
      { name: "Conference chips", what: "Narrow the wall to one conference." },
      { name: "Conference standing chip", what: "Under the team name: click to expand the conference's top five." },
    ],
    panels: [
      { name: "Roster", what: "Every player on the roster, rated or not, ranked by rating. Position chips filter it; any row opens the player card. On a projected season the last two columns show the projection's 80% range and its source instead of projected change and EDGE percentile." },
      { name: "Ratings", what: "Team rating, offence, defence and POWER (the raw schedule-adjusted SP+ margin, comparable across seasons); five sub-ratings; the offensive line as a unit with its five inputs; per-game team stats (played seasons); top five players." },
      { name: "Schedule", what: "Every game with the result. Opponent names link to their team page in the same season." },
      { name: "Transfers", what: `Players in and out through the portal (${2021} onward), with each player's earned rating at the old school the season before and at the new school, and the change. A projected season has no earned new-school rating yet, so that side is blank.` },
      { name: "History", what: "The program season by season: record, conference, SP+ and team rating." },
    ],
    methods: ["team-ratings", "ol"],
    limits: `A team rating blends schedule-adjusted results, our ratings of the roster and the
      team's own statistics; it is not a prediction of who would win, and says nothing about who
      was healthy.`,
  },
  {
    id: "page-players",
    group: "pages",
    page: "players.html",
    title: "Players",
    summary: `A draft-board view of every rated player in a season: the top players at each position,
      merged and ranked by rating. Click any row for his card.`,
    controls: [
      { name: "Season", what: `Any season from ${CONFIG.FIRST_SEASON}. On ${CONFIG.CURRENT_SEASON} the last two columns become the projection range and its source; on a played season they are projected change and EDGE percentile.` },
      { name: "Conference", what: "Listed from the conferences that existed that season." },
      { name: "Min OVR slider", what: "Hides everyone below the rating you set." },
      { name: "Search", what: "Matches player or team name." },
      { name: "Position chips", what: "One position group at a time. DB includes corners, safeties and generically-labelled defensive backs." },
      { name: "Column headers", what: "Click to sort by that column." },
    ],
    panels: [
      { name: "Player card", what: `Header with rating (or projected rating); recruiting and bio; season stats (regular season, postseason, total); EDGE score and its percentile; career stats; rating history; "Why this rating?" — what raised and lowered the number; for defensive backs, the three jobs the rating is built from; on ${CONFIG.CURRENT_SEASON}, the projection with its range and reasoning; transfer path; similar players from any era.` },
    ],
    tips: [
      "The board shows the top 100 per position (60 for kickers and punters). Use the position chips or search to go deeper.",
      `players.html?player=ID&season=${CONFIG.LAST_PLAYED_SEASON} opens a card directly — it is what every shared player link uses.`,
    ],
    methods: ["edge-core", "defense", "secondary", "specialists", "rating-basis"],
    limits: `A player is only as rateable as his position's box score. Read the rating-basis chip
      and the Methods entry for his position before comparing across positions.`,
  },
  {
    id: "page-ratings",
    group: "pages",
    page: "ratings.html",
    title: "Ratings",
    summary: `Where production and recruiting disagree. The scatter puts every player's rating
      against his recruiting stars; the leaderboards are the top 50 at each position.`,
    controls: [
      { name: "Season and team pickers", what: "Redraw both panels for that season, optionally one team." },
      { name: "Position chips", what: "Narrow the scatter to one position group." },
      { name: "Leaderboard tabs", what: "One position at a time; headers sort." },
    ],
    panels: [
      { name: "Scatter", what: "Each dot is a player: stars across (jittered so they don't stack), rating up. The dashed line is a straight-line fit of rating on stars. Larger green dots are more than 8 points above it — production the recruiting grade missed. Hover for the player; click to open his card." },
      { name: "Position leaderboards", what: "Top 50 per position group for the season. 🔥 marks a breakout candidate (played seasons only)." },
    ],
    limits: `Players with no recruiting stars are not on the scatter, and walk-ons are a large
      share of the genuinely overlooked, so the chart understates how often production beats
      recruiting.`,
  },
  {
    id: "page-research",
    group: "pages",
    page: "research.html",
    title: "Research and storylines",
    summary: `Each finding is a claim with its full table behind it. The index lists the live
      analyses, the storylines the home page draws from, and open questions with nothing behind them
      yet — listed so the unfinished work is visible.

      Every finding page has the same shape: headline figures, filters, a sortable table (the first
      few hundred rows; filter to narrow), then **How it's computed** and **What it can't see**.`,
    tips: [
      "Filters apply as soon as you change them, and a filter's default (often the last played season) is already applied when the page opens.",
      "Player and team names in any table open the card or team page.",
    ],
    methods: ["research-team-performance", "research-recruiting-roi", "research-coaching", "research-gems"],
    limits: `A finding is as strong as its sample. Several shrink small samples toward the average
      and publish an interval; read the interval before the ranking.`,
  },
  {
    id: "page-methods",
    group: "pages",
    page: "methods.html",
    title: "Methods and the Build Log",
    summary: `**Methods** is how every number is made: the inputs and their coverage, the formula as
      the code actually computes it (and, where they ever differed, what the code really did), why it
      is built that way, what has been measured about it, what it cannot support, and every
      alternative considered — including the rejected ones and the measurement that rejected them. At
      the bottom, a generated table of what the data source does and does not contain.

      The **Build Log** is what happened to those numbers, pass by pass: what prompted the work,
      what changed and what it cost, what was tried and dropped, the checks that were run, and what
      each pass deliberately left unfixed.`,
    live: async () => {
      if (typeof CHANGES === "undefined" || !CHANGES.length) return "";
      const latest = [...CHANGES].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      return `Latest entry: <a href="changes.html#${_esc(latest.id)}"><strong>${_esc(latest.version)}</strong>
        — ${_esc(latest.title)}</a> (${_esc(latest.date)}).`;
    },
    limits: `Both pages are written for someone who wants to check a claim, and they are long on
      purpose. This guide is the short version.`,
  },

  // ── Where the numbers come from ───────────────────────────────────────────
  {
    id: "numbers",
    group: "numbers",
    title: "The short version, with links to the long one",
    summary: `**Player ratings.** Each game's box score is scored with weights for that position,
      scaled up against a strong opponent and down against a weak one, summed over the season and
      divided by the square root of games played. That score maps to 30–99 through fixed anchors per
      position and era. Players below a playing-time threshold are blended with their recruiting
      grade.

      **Defensive backs** are rated on three jobs — ball hawk, run support and coverage — where
      coverage is credited from what his defence allowed through the air, because a covered receiver
      produces no statistic.

      **Team ratings** blend schedule-adjusted results (SP+) with our own ratings of the roster
      and the team's per-game statistics; an unplayed season has only the roster, and the blend
      renormalises rather than counting the missing signals as zero.

      **Projections** follow a player's career curve and what players like him did next, with an
      opportunity model for offensive skill players (who is ahead of him on the depth chart, and
      whether they are leaving).

      The weights, anchors, thresholds and their measured accuracy are on the Methods page and nowhere
      else, so there is one version of each.`,
    methods: ["edge-core", "defense", "secondary", "specialists", "rating-basis", "team-ratings", "projection", "reliability"],
    limits: `No individual data exists for offensive linemen, targets allowed, coverage snaps or
      missed tackles, and individual defensive statistics before 2016 are largely absent — so those
      ratings lean on recruiting. The Methods entries give the size of each gap.`,
  },
];
