// guide.js — the GUIDE registry behind the How It Works reader (About › How It Works).
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
    summary: `The whole site is one menu. Seven sections run along the top (Home, My Team, Season, Teams, Players,
      Recruiting, About); under them a second bar lists the pages of the section you are in, with the current one
      marked. Use the mouse, the keyboard (Enter opens, Esc goes back) or a game controller. Almost every team and
      player name is a button to its page: a **team** opens its team page, a **player** opens his card.

      Addresses carry their place, so a page can be shared or bookmarked: \`menu.html#/team/13\` is a team, \`menu.html#/player/57596\`
      a card, and \`menu.html?player=57596&season=2024\` or \`menu.html?team=Boise%20State&season=2013\` opens that player or
      team in that season. The old page addresses (players.html?player=…, teams.html?team=…, methods.html#ol and the rest)
      still work: each forwards here.`,
    controls: [
      { name: "Season stepper (◀ ▶, Y)", what: "Sets the season the whole menu shows: every page, the ticker and the rankings follow it. Remembered on this device." },
      { name: "Menu (Start, H)", what: "The quick menu: every screen in one list, plus Change Year and Light or Dark mode. Back or Menu closes it." },
      { name: "Light / Dark mode", what: "Remembered on this device; every coloured number repaints in the new mode's palette." },
      { name: "Search boxes", what: "Players, the Transfer Portal and Talent vs Production each have one. Type to narrow; Esc or Enter leaves the box without leaving the page. What you typed is kept while you change position or season." },
      { name: "Column headings", what: "On a roster, click a heading to sort by it. The Sort button in the bar below cycles through the sorts for Players and rosters." },
      { name: "My Team", what: "Follow a team from its page. Home shows it, My Team opens it, and the short menu entries default to it." },
    ],
    tips: [
      "A first player card on a page can be slow: it reads one small file for his whole career. Later cards are instant.",
      "The filters on Players and the Portal are kept while you move around and reset when the page reloads.",
    ],
    limits: `The site is static files with no accounts or server, so nothing you do on it is saved
      beyond My Team, the season and the colour mode on this device.`,
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
        meaning: "What a player has earned so far in a season being played, rescaled to full-season pace. The solid underline is what tells it from a plain earned pill and a hatched projection. It is provisional: on one or two games it moves only a little from a recruiting-based start, and it will move as the season does. Never averaged with the projection." },
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
    title: "The menu: home, teams and players",
    summary: `The app is one menu laid out like the franchise menus of an early-2010s console football game. It opens on the
      home page: the top ten teams, the best players, last week's results and the coming week's games, the playoff picture, the
      biggest rating movers, the best recruiting classes and the biggest transfers, with quick links to every screen along the top.
      Every row on it is a link: a team opens its page, a player opens his card, a game opens either team. Any team has a page
      (roster, depth chart, schedule, recruiting, transfers, history, and its top players); a team's page, a ranking, a standing,
      a schedule opponent, a bracket box, a recruiting class and the scores ticker all lead to it. You can follow one team (on its
      page) to keep it on the home page; nothing requires it. A player card opens on an Overview (his three ratings, his key
      stats, how the rating is built), with Stats (every stat, regular season, postseason and total) and Career (every season,
      with totals) one tab away. It reads the same data as the rest of the site, so a number here is the same number there.
      The look is original; the layout is from the author's memory of that style and may not match it exactly.

      A 2026 roster row and player card show three ratings side by side: last season, the preseason
      projection, and earned to date. They are never combined.`,
    controls: [
      { name: "Mouse", what: "The bar along the bottom is a row of buttons: Back, Year, Menu (every screen), Sort where a list has one, and Light or Dark mode. Hover moves the highlight, click opens. A team, player, game or ranking row opens its page. Tabs along the top are clickable." },
      { name: "Keyboard", what: "There are no arrow-key or WASD controls: the menu is for the mouse and a controller. Esc or Backspace goes back and Enter opens the highlighted item; Esc on the home page opens the quick menu. Everything else is a button on screen." },
      { name: "Game controller", what: "Plug one in and press any button. Controller movement turns on when a pad is plugged in and you press a button: D-pad or left stick moves; A selects; B goes back; X sorts; Y changes season; LB and RB switch tabs; Start opens the quick menu; Select switches light and dark. The bar at the bottom then shows the controller buttons." },
    ],
    tips: [
      "The bar along the bottom always lists what the buttons do on the current screen.",
      "Your followed team and season are remembered on this device.",
      "Any team name or player row is a link; the ticker along the bottom links to the top 25.",
    ],
    limits: `Controller support follows the browser's standard gamepad layout and has been tested here with a
      simulated pad only; an unusual controller may map differently. The depth chart is the order the ratings
      imply, not an official chart. Polls are not shown (none are on disk), and the recruiting class rank is
      our own summary: see the recruiting entry in Methods.`,
  },

  {
    id: "page-rankings",
    group: "pages",
    title: "Rankings and Compare: the top 25, every FBS team, and the readings side by side",
    summary: `**Rankings** lists teams by power, our own measure of quality plus results, in points per game above an average team. It
      opens on the **Top 25**; the **All FBS** chip beside it lists every ranked team, with the same row, the same panel and your own
      team highlighted. The tabs choose the list: to date for a season being played, the preseason projection or the final for a
      played one. Select a team to see how its power is made and every game behind it.

      **Compare** puts the numbers a team is rated from beside the ranking: power (our ranking), the headline team rating, and the
      results, roster and stats readings it is made of, each with its own rank. The tabs sort the list by any of the five. An arrow
      marks a reading that sits 20 or more places from our ranking: up means that reading likes the team more than our ranking does,
      down means less. It is how you see a team whose box score and roster look better than its results, or the other way round.
      Select a team for its five numbers with what each one is and how much of the headline it carries.`,
    controls: [
      { name: "Top 25 / All FBS", what: "Two chips above the Rankings list. The address keeps the view, so a link to the full list opens on it." },
      { name: "Compare the readings", what: "A chip on Rankings, and Compare in the League list of the quick menu, open the Compare screen for the same list (to date, preseason or final)." },
      { name: "Sort by (Compare tabs)", what: "Power, Headline, Results, Roster or Stats. The number at the left is the rank under the chosen sort; the small number under each reading is that reading's own rank." },
      { name: "Arrow on a reading", what: "▲ or ▼: the reading ranks the team 20 or more places higher or lower than power does. The tooltip says how many." },
    ],
    tips: [
      "A blank reading has a reason in its tooltip: a preseason list has no stats or results yet, and a team with no games has no results.",
      "Roster and stats are built from the same box scores, so they usually move together; results are the scoreboard.",
    ],
    methods: ["power-rating", "team-ratings"],
    limits: `Compare shows numbers the pipeline already publishes; it adds none. The rank of a reading is among the teams that have it.
      A season in progress is provisional and the readings are built from the games played so far. The gap marker is a fixed 20 places,
      not a statistical test, so a marked team is a team to look at, not a team that is wrong.`,
  },

  {
    id: "page-home",
    group: "pages",
    page: "#/home",
    title: "Home",
    summary: `The league at a glance, and every row a link to the page you would want next. Every number on it is
      computed from the data files when the page loads; none is typed in.`,
    panels: [
      { name: "My Team strip", what: "The team you follow: record, rank, next game, and buttons to its roster and schedule. Without one it offers to follow a team." },
      { name: "Storylines", what: `Computed claims: the projected risers and sliders (or, for a played season, the biggest rise and fall), the team that most beat its recruiting, the model's boldest breakout call, a hidden gem, the recruiting class that did best. Each row opens the team or player, and its button opens the full list in Research. A claim whose data file is absent is left out.` },
      { name: "Top 10, Top players", what: "The ten best teams by power and the ten best players, from the to-date file in a season being played." },
      { name: "Results and what is next", what: "In a season being played, last week's results and the coming week's games, the best-ranked teams first; for a played season its bowls and playoff; before a season its first week." },
      { name: "Playoff picture, Rating movers, Recruiting classes, Transfer portal", what: "A short list of each, ending in the screen that holds the rest." },
    ],
    limits: `Storylines are picked by rule (largest move, best residual, …), not by judgement, so
      one can be the product of a thin sample. Its full list in Research shows the context. The recruiting class is
      ranked on the shrunk hit rate, so a small class cannot top the list by luck.`,
  },
  {
    id: "page-season26",
    group: "pages",
    page: "#/season",
    title: "The Season",
    summary: `What the season has done so far and what is left of it. In a season being played: the biggest team risers and fallers against the
      preseason projection, the best players to date, the games still to play ranked by matchup quality, and the biggest changes in team
      rating since last year. For a played season: the changes since the year before.`,
    panels: [
      { name: "Risers and fallers", what: "Teams by earned-to-date rating minus preseason projection. The earned number is provisional and rescaled to full-season pace." },
      { name: "Best players to date", what: "The ten best earned-to-date ratings, each opening his card." },
      { name: "Games to circle", what: "The games still to play, best first. Quality is the two teams' combined rating minus twice the gap between them, so an even heavyweight game outranks a lopsided one. Each opens the game." },
      { name: "Biggest changes since last year", what: `Team rating against the year before: the eight biggest gains and falls. For a season not yet played the new number is the preseason projection, which is labelled.` },
    ],
    methods: ["live-season", "projection", "team-ratings"],
    limits: `Quality is not a win probability: win probabilities and playoff odds ship only alongside their backtest. A finished season has no
      games to circle, so that panel is absent.`,
  },
  {
    id: "page-teams",
    group: "pages",
    page: "#/team-select",
    title: "Teams",
    summary: `Every FBS program in any season since ${CONFIG.FIRST_SEASON}. All Teams is the wall of logos (conference tabs narrow it, and the season
      stepper changes which year's membership); My Team is the one you follow. A team has the same eight pages wherever you reach it from.`,
    controls: [
      { name: "Conference tabs", what: "Narrow the wall to one conference. Conferences are rebuilt per season because realignment changed them." },
      { name: "Follow this team", what: "On a team's page: Home, My Team and the short menu entries then open it." },
    ],
    panels: [
      { name: "Overview", what: "Rating, offense and defense, record, national rank and next game; the six best players; the week-by-week panel in a season with one." },
      { name: "Ratings", what: "The rating broken into pass and run, offense and defense and special teams; the offensive line as a unit with its five measurements (not a per-player rating); per-game team stats for a played season; the SP+ margin and recruiting score as references." },
      { name: "Roster", what: "Every player on the roster, rated or not. Position tabs filter it; click a heading to sort; the strip above follows the selection; any row opens the card." },
      { name: "Depth Chart", what: "Position groups in the order of their ratings. Not an official chart: no source we hold has depth data." },
      { name: "Schedule", what: "Every game with byes and the postseason, the opponent's rating and record, and the result; select a game for the two teams side by side." },
      { name: "Recruiting, Transfers, History", what: `The class with a map of where it comes from; players in and out through the portal (${CONFIG.TRANSFER_SEASONS[0]} onward) with the rating before and after; the program season by season.` },
    ],
    methods: ["team-ratings", "ol"],
    limits: `A team rating blends schedule-adjusted results, our ratings of the roster and the
      team's own statistics; it is not a prediction of who would win, and says nothing about who
      was healthy. A season not yet played has no offense and defense split, and no line rating.`,
  },
  {
    id: "page-players",
    group: "pages",
    page: "#/players",
    title: "Players",
    summary: `Leaders: every rated player in a season, ranked. Click any row for his card.`,
    controls: [
      { name: "Search", what: "Matches a player's name or his team. A search also finds offensive linemen, who are not otherwise listed because they have no rating." },
      { name: "Conference, Rating", what: "Buttons that step through the conferences that existed that season, and through the minimum ratings (any, 60+, 70+, 80+, 90+)." },
      { name: "Position tabs", what: "One position group at a time. DB includes corners, safeties and generically-labelled defensive backs." },
      { name: "Sort", what: "Best available first (to date, then the projection, then last season), or by any column." },
    ],
    panels: [
      { name: "Overview", what: `The ratings (earned last season, projection, earned to date in a season being played); the season at a glance; how the rating is built: the production score and the games behind it, where it sits among his position, his recruiting grade and any breakout flag; for a defensive back, the three jobs the rating is made of with their weights; week by week; on ${CONFIG.CURRENT_SEASON} the projection with its 80% range, the reasoning (drivers, careers that looked like his); rating history; transfer path; similar players from any era.` },
      { name: "Games, Stats, Career", what: "The game-by-game box score (a season with game logs), every stat for the season (regular season, postseason, total), and the career by season with totals." },
    ],
    tips: [
      "The list shows the first 200 matches. Use the position tabs, the conference button or the search to go deeper.",
      `menu.html?player=ID&season=${CONFIG.LAST_PLAYED_SEASON} opens a card directly; it is what a shared player link uses.`,
    ],
    methods: ["edge-core", "defense", "secondary", "specialists", "rating-basis"],
    limits: `A player is only as rateable as his position's box score. Read the rating-basis chip
      and the Methods entry for his position before comparing across positions. The percentile
      is within his position and season only.`,
  },
  {
    id: "page-ratings",
    group: "pages",
    page: "#/scatter",
    title: "Talent vs Production",
    summary: `Where production and recruiting disagree: every player's rating against his recruiting stars, with the players furthest above the trend listed below.`,
    controls: [
      { name: "Position tabs", what: "Narrow the chart to one position group." },
      { name: "Search", what: "Shows only the players or teams that match. The trend line stays fitted to everyone." },
    ],
    panels: [
      { name: "The chart", what: "Each dot is a player: stars across (nudged so they don't stack), rating up. The dashed line is a straight-line fit of rating on stars. Larger green dots are 8 or more points above it: production the recruiting grade missed. Hover for the player; click to open his card." },
      { name: "Furthest above the trend", what: "The twelve players with the largest gap above the line, each opening his card." },
    ],
    limits: `Players with no recruiting stars are not on the chart, and walk-ons are a large
      share of the genuinely overlooked, so it understates how often production beats
      recruiting. In a season being played the ratings are earned so far and provisional.`,
  },
  {
    id: "page-research",
    group: "pages",
    page: "#/research",
    title: "Research and storylines",
    summary: `Each finding is a claim with its full table behind it. The list on the left holds the live
      analyses, the storylines Home draws from, and open questions with nothing behind them
      yet, listed so the unfinished work is visible.

      Every finding has the same shape: headline figures, filters, a sortable table (the first
      few hundred rows; filter to narrow), then **How it's computed** and **What it can't see**.`,
    tips: [
      "Filters apply as soon as you change them, and a filter's default (often the last played season) is already applied when the finding opens.",
      "Player and team names in any table open the card or team page.",
    ],
    methods: ["research-team-performance", "research-recruiting-roi", "research-coaching", "research-gems"],
    limits: `A finding is as strong as its sample. Several shrink small samples toward the average
      and publish an interval; read the interval before the ranking.`,
  },
  {
    id: "page-methods",
    group: "pages",
    page: "#/methods",
    title: "Methods and the Build Log",
    summary: `**Methods** is how every number is made: the inputs and their coverage, the formula as
      the code actually computes it (and, where they ever differed, what the code really did), why it
      is built that way, what has been measured about it, what it cannot support, and every
      alternative considered, including the rejected ones and the measurement that rejected them. At
      the end of the data group, a generated table of what the data source does and does not contain.

      The **Build Log** is what happened to those numbers, pass by pass: what prompted the work,
      what changed and what it cost, what was tried and dropped, the checks that were run, and what
      each pass deliberately left unfixed.`,
    live: async () => {
      if (typeof CHANGES === "undefined" || !CHANGES.length) return "";
      const latest = [...CHANGES].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      return `Latest entry: <a href="#/changes/${_esc(latest.id)}"><strong>${_esc(latest.version)}</strong>
        — ${_esc(latest.title)}</a> (${_esc(latest.date)}).`;
    },
    limits: `Both are written for someone who wants to check a claim, and they are long on
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
