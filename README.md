# moddable-engine

Micro-kernel master engine for all Moddable Games titles.

Every game in the Moddable Games collection — from standard chess to Endless Skies — runs on this engine by composing plugins. No hand-written engine code per game. A game is a configuration file that declares which plugins to activate.

---

## Status

**Six families playable today** — chess (135 variants), shogi (13), draughts (13), go (10), xiangqi (3), reversi (3). 177 playable variants total. A further seven plugins exist for mancala, backgammon, morris, hex, halma, big 2, and race games, with playable variants to follow.

Rules are implemented as plugin hooks — move filters, win conditions, turn logic, post-move effects. Chess has all eight extension points; shogi gained three this session (moveFilter, afterMove, winCondition); go has moveFilter and winCondition. Lifting these into a shared, composable rule layer is the next architectural step (#88).

The play surface (interaction, embed protocol, variant registry, SDK) is family-agnostic and lives in `packages/play`. All six playable families share the same kit: embed, play page, simulator, and headless SDK.

Read [`SPEC.md`](./SPEC.md) before contributing anything.

---

## The proof

Draughts has 13 playable variants (English, International, Turkish, Russian, Canadian, Brazilian, Italian, Spanish, Czech, German, Ghanaian, Pool, Spantsiretti). There is no variant code directory. Each variant is a set of declarative keys in a `.md` file. The same is true for shogi (13 variants including chu-shogi with 21 piece types) and xiangqi (3 variants).

Chess has 135 variants. All share piece definitions through `fromConfig` in `piece-behaviour`. Shogi and xiangqi were refactored this session to consume the same primitives, eliminating hand-rolled movement code.

---

## Structure

```
moddable-engine/
  packages/
    core/                ← state, moves, players, history, events, RNG, traversal
    topology-grid/       ← rectangular grids + position notation
    topology-hex/        ← hex (hexagonal + rhombus) + position notation
    topology-track/      ← linear/circuit paths
    topology-pit/        ← mancala pit-sow layouts
    topology-graph/      ← arbitrary node-edge + position notation
    topology-tableau/    ← card table layouts (radial, tableau, wall, linear)
    piece-behaviour/     ← movement primitives + composable definitions (rider, leaper, compose, divergent)
    rule/                ← rule registry, composition engine (test-proven, not yet consumed by plugins)
    render/              ← topology-agnostic SVG board renderer
    surface/             ← board as resource type (frame, surface, divider, generators, filters)
    schema/              ← frontmatter → game definitions
    game/                ← factory, topology registry, component registry, rule registry
    play/                ← universal game factory, interaction models, embed protocol, variant registry, SDK
    board-theme/         ← board visual treatment (resolver, builtins)
    piece-theme/         ← piece visual treatment (resolver, recolour)
    component-deck/      ← standard 52-card deck
    component-dice/      ← standard dice (roll, doubles, movesFromRoll, expression parser, odds)
    hex-generators/      ← hex map generation (Catan, Twilight, Colony, etc.)
    rpg/                 ← RPG entity search, oracle rolls, card data, manifest loader
    plugin-chess/        ← 135 variants (topology-agnostic, hook-composed)
    plugin-draughts/     ← 13 variants (all frontmatter-only, no variant code)
    plugin-go/           ← 10 variants (capture-go, gomoku, renju, stoical have JS hooks)
    plugin-shogi/        ← 13 variants (fromConfig-driven, rule hooks for hasami/custodian)
    plugin-xiangqi/      ← 3 variants (fromConfig-driven, no variant code)
    plugin-reversi/      ← 3 variants (flanking capture, anti-reversi)
    plugin-mancala/      ← plugin only
    plugin-backgammon/   ← plugin only
    plugin-morris/       ← plugin only
    plugin-hex/          ← plugin only
    plugin-halma/        ← plugin only
    plugin-big2/         ← plugin only
    plugin-race/         ← plugin only
  SPEC.md                ← architecture spec — read this first
  package.json           ← workspace root
```

---

## The layers

| Layer | Package(s) | Purpose |
|---|---|---|
| 0 | `@moddable/core` | State, moves, players, history, events, RNG, timer, plugin registry |
| 1 | `@moddable/topology-*` | Coordinate systems: grid, hex, track, pit, graph, tableau (6 types) |
| 2 | `@moddable/piece-behaviour` | Movement primitives + composable piece definitions |
| 2 | `@moddable/rule` | Rule registry and composition engine (proven in tests, not yet consumed by plugins — see #88) |
| 3 | `@moddable/render` | Topology-agnostic SVG board renderer |
| 4 | `@moddable/schema` | Frontmatter → game definitions (done) |
| 5 | `@moddable/component-*` | Non-spatial structure: deck, dice, timer |
| 6 | `@moddable/plugin-*` | Game families — 6 playable (chess, draughts, go, shogi, xiangqi, reversi) + 7 in progress |
| 7 | Game configs | Frontmatter only — no code |

---

## Key principles

- If you have to mention a game's name to explain what a piece of code does, that code is in the wrong layer.
- Topologies are the universal adapter layer for geometry. Rules will be the universal adapter layer for behaviour (#88).
- Plugin hooks (moveFilter, winCondition, turnLogic, afterMove) implement rules per family today.
- No if/else for topology type anywhere in the codebase.
- Five independent axes compose freely: topology × pieces × rules × components × themes.

See `SPEC.md` section 0 (Philosophy) for the full reasoning behind every architectural decision.

---

## Running tests

```bash
NODE_OPTIONS='--experimental-vm-modules' npx jest
```

---

## Related repos

- [`moddable-hexmaps`](https://github.com/Moddable-Games/moddable-hexmaps) — migrating to plugin-grid-hex
- [`moddable-rules`](https://github.com/Moddable-Games/moddable-rules) — migrating build system to plugin-rules
- [`dungeon-chess`](https://github.com/Moddable-Games/dungeon-chess) — north star proof of concept
- [`moddable-ops`](https://github.com/Moddable-Games/moddable-ops) — coordination and planning

---

## Changelog

#### 2026-08-14
- Shogi 6 to 13: sho, yari, tori, cannon, hasami, chu (12x12, 21 types), four-player declared playable
- Go 9 to 10: renju with forbidden-move filter (double-three, double-four, overline)
- piece-behaviour: lame leapers (orthogonal/half blocking), hopper moveSlide option
- Shogi plugin refactored to consume fromConfig; gains rule hooks (moveFilter, afterMove, winCondition), custodian capture, royal-less variants
- Xiangqi plugin refactored to consume fromConfig; unmapped-symbol throws added
- Chess en passant crash fixed for 4-player (seats 2/3); multiplayer opponent guards
- Create page: WYSIWYG board editor with piece definition, live move preview, Try in Play, two-sidebar layout, hover feedback, 15 contract tests
- Synochess: lame leapers declared correctly (approximation notes retired)
- Issues closed: #59 (N-player framework), #110 (Create page Phase 1)
- Issue opened: #115 (Create page Phase 2)
- Total: 177 playable variants across 6 families

#### 2026-08-10
- Issue triage: closed 17 issues (47, 48, 51, 54, 56, 60, 64, 66, 72, 73, 74, 76, 77, 80, 94, 96, 104)
- build-discovery.mjs: patches all homepage stats from data (test count, topology cards, family chips, hero lede, docs coverage)
- Fixed: absorption chess typeForAbilities returned queen for all compound types; now correctly maps archbishop/chancellor/amazon
- Fixed: game-play.js fenMap and getVariantPieceKeys read from resolved frontmatter instead of JS registry
- Compound piece definitions (archbishop, chancellor, amazon) added to absorption.md frontmatter in moddable-rules

#### 2026-08-16
- Fixed: play page board invisible on iOS Safari (SVG collapsed to 0 height without explicit width attribute; embeds worked because their CSS set width:100%)

#### 2026-08-15
- Create page Phase 2: named drafts (localStorage), per-family rules panel, intersection grids, template loading, SVG/PNG export with inlined pieces, "Players & sides" with per-player advancement directions
- Fixed: four-player-shogi now fully playable (shogi plugin was two-player throughout: hands, checkWin, isInCheck, promotion, drops all generalised for N players)
- Shogi plugin: per-player directional rotation via advancement vectors (red/blue advance laterally on cross-boards)
- Fixed: move animation on rotated pieces (animate the rotation group, not the child image)
- Fixed: FEN parser disagreement on boards wider than 9 files (unified multi-digit empty-count parsing across all four readers)
- Fixed: rules content caching (no-cache revalidation on all moddable-rules fetches)
- Fixed: create page "Try in Play" crash (engine.pieces.map not a function)
- AI evaluator: fixed oppHand crash for >2 player games
- "Edit in Create" link on play page for any grid variant
- Honest piece-set list (marks 45 sets whose naming convention the editor cannot yet map)
- Version 1.0.18

#### 2026-08-06
- CI pipeline fully green for the first time (PR #92 merged): unit-tests (3021), playability-standard, Playwright e2e (50 tests)
- Fixed: opening books inert since conformance migration (PR #97). Parser now strips quote chars from YAML keys; variantOpeningBook reads from definition object (browser-safe), not resolveFromDisk (Node-only)
- Fixed: jest/@jest/globals removed by knip cleanup restored to root devDependencies
- Fixed: Playwright CI serves engine + rules as siblings so RULES_BASE resolves correctly
- Fixed: AI NPS floor lowered to 150 for CI (catches catastrophic regressions, survives runner variance)
- Fixed: sittuyin piece set filtering regression (placementPieces read from resolved frontmatter)
- moddable-rules dev merged to main (22 commits: playable:true, engine plugin blocks)

#### 2026-08-05
- Split chess variant files: every variant now in its own kebab-case file (53 files, no multi-variant bundles)
- Deleted standard.js (key-only no-op, now frontmatter-only like all other data-only variants)
- Corrected conformance: chess is 99/100 (only breakthrough carries data), not 95/100. Total: 129/130 frontmatter-only
- Fixed 5 test suites that were silently providing zero coverage (play-kit, simulator-helper, render-helper, go-variants, go-playout-policy) by adding the missing setup-rules-reader import
- Removed UNSUPPORTED doc objects from draughts test (documentation lives in moddable-rules frontmatter)
- Documentation overhaul (#91): corrected rules claim, family/variant counts, homepage stats, SPEC status header. Families section now distinguishes playable (5) from plugin-only (8)

#### 2026-07-27
- Family-agnostic play kit in `packages/play`: interaction models (move, place, chain, drop), generic `game:*` embed protocol with per-family aliases, family-scoped variant registry with `extends` inheritance, and a headless SDK covering every family
- Game controller now drives interaction through the models rather than assuming from/to moves, and gained `performAction` (pass, resign), `handleHandClick`, and chain anchoring for multi-jump turns
- Go brought to playable parity: 9 hub variants registered, territory and area scoring with dead-stone marking, positional superko, capture annotation, MCTS opponent
- Draughts brought to playable parity: 13 hub variants registered, capture-priority and king-preference rules, `loseOnSinglePiece`, hooks on the plugin
- Fixed the AI simulator scoring every terminal position for player 0 when winners are named by colour rather than by index
- Added `docs/go.html` and `docs/draughts.html`
- Chess play parity: hand/drop UI, 7 board themes, 5 piece colour presets, SAN notation, multi-move indicator (closes #40)
- Hex SDK: FOV computation, BFS pathfinding, exportGameData, editHex, PNG export, terrain editor (closes #41)
- 26 new tests (hex-fov, hex-pathfind, hex SDK extensions)
- Hex docs updated with FOV, pathfinding, and new embed commands
- Chess docs updated with setTheme command

#### 2026-07-26
- Universal game factory: `createGameForFamily()` in `packages/play` — single import for all 13 families with uniform interface (getLegalMoves, applyMove, checkWin, getState, loadState)
- Added `./play` to package.json exports map
- Closed issue #42: unblocks 5 moddable-tools play commands

#### 2026-07-25
- Added static API page (`/api/`) with JSON endpoint documentation
- Added llms.txt and .well-known/mcp.json for AI agent discoverability
- New packages: `rpg` (entity search, oracle rolls, card data) and `hex-generators` (map generation)
- Added `calculateOdds()` to component-dice for probability calculations
- SDK-style exports map in package.json for programmatic consumers
- API link added to site-wide navigation and footer across all pages

#### 2026-07-22
- Added `--sync` mode to export-boards.mjs for incremental diagram export (hash-based staleness detection)
- RPG character sheet renderer: Create, Blank, and Random modes with sidebar editing and import/export
- Headless character sheet SVG generation via export-chargen.mjs
- Closed issues #16 (cross-repo sync) and #33 (RPG manifest v2)

#### 2026-08-09
- Added build-discovery.mjs: generates api/stats.json, api/index.json, mcp.json, llms.txt, sitemap.xml from data
- CI gate enforces discovery surface freshness (--check mode)
- Fixed stale counts: puzzles 1,557→1,876, tiles 7→8, puzzle meta synced
- Sitemap now auto-generated from docs/ and playable families
- Agent discovery: added server-card.json, api-catalog (RFC 9727), auth.md, link rel tags
- Fixed AI difficulty ladder: medium/hard no longer share depth (now 5/7)
- Fixed large board viewport overflow (max-width constraint)
- Removed stale docs/effects.md
- Closed 11 issues (#65, #70, #71, #83, #87, #90, #91, #95, #103, #105, #106)
- Updated global CLAUDE.md: branch sync automatic at session start/end

#### 2026-07-21
- Implemented topology-tableau: card/dice/domino table layouts as a proper topology (issue #25)
- 40 component game variants now render through the standard pipeline (no bespoke renderers)
- Deal specs moved from hardcoded engine source to frontmatter in moddable-rules
- Deleted renderers.js, render-from-resolved.js, layout.js, games:{} objects from all 6 deck files
- Play page routes component games through frontmatter (same path as board games)
- 40 self-contained SVGs added to boards gallery with embedded piece artwork
- Snapshot pipeline expanded to cover content/games/ directory structure
- 1367 tests across 104 suites, 332 snapshots byte-identical
- Closed issue #25

#### 2026-07-20
- Board gallery sync: 284 → 293 boards (10 new chess topology variants: circular, byzantine, cylindrical, spherical, mobius, klein-bottle, toroidal, toroidal-byzantine, raumschach, rollerball)
- Added Starforged RPG with 12 oracle categories
- RPG provider fully abstracted to manifest-driven architecture (issue #29): engine reads rpg-manifest.json from moddable-rules, no game knowledge in engine code
- New modules: rpg-manifest-loader.js, rpg-card-renderer.js, rpg-link-resolver.js
- Wrote topology-tableau + deal spec unified plan (issue #25, merging former #8)
- Closed issues #1, #8, #29

#### 2026-07-15
- Production readiness: dev/main branch strategy, CNAME (engine.moddable.games)
- Added version system (version.txt + bump.sh) with cache-busting on all CSS/JS refs
- Added OG images and full meta tags (og: + twitter:card) for all 13 pages
- Added sitemap.xml, robots.txt, favicon.svg, .nojekyll
- Blueprint-aesthetic OG image generator (scripts/gen-og.py) matching moddable-rules style

#### 2026-07-08
- RPG provider: DOM-based search + card table for D&D 5e and Ironsworn
- Colour-coded categories, universal cross-category search, rules.moddable.games links
- Removed Hyper Imperium (now a Twilight variant); Econopoly uses Landlord's 1932 board
- Created moddable-rules#167 for anchor-based deep linking

#### 2026-07-07
- Fixed Y game board — renders as centred equilateral triangle (was skewed parallelogram)
- Added Hex size variants: 9x9, 13x13, 14x14, 19x19 alongside standard 11x11
- Added Y size variants: side-9 (small), side-12 (standard), side-15 (large)
- Hex/Y boards get shaped frames (outer hex-edge border) instead of square backgrounds
- Added Korean station names to Nyout board hover (all 29 nodes from reference SVG)
- Generic `nodeNames` support in hover system for any node-based game
- Asalto/Royal Garrison fortress rendering fixes (ear nodes, hull stroke cleanup)

#### 2026-07-04
- Built Landlord's Game board renderer — all 3 editions (1904, 1906, 1932) from JSON data
- 1932: type-driven stripe bands, 16-point star, inner track boxes with hover
- 1906: L-shaped Natural Opportunity corners with doorway connectors, split diagonal corners
- 1904: oversized medallion circles (SVG overflow visible), 4-quadrant inner track
- Added inner track data and hover info for all editions (multi-track notation groundwork)

#### 2026-07-03
- Transcribed all 3 Landlord's Game boards to structured JSON (1904, 1906, 1932)
- Added board data loading infrastructure to board studio

#### 2026-06-30
- Refactored plugin-chess to be fully topology-agnostic (board via getCell/setCell, pawn via topology.step + pawnConfig)
- Added topology.step(from, direction) to grid and hex — universal single-step advancement
- Added getAllCells()/getCellCount() to grid topology (matching hex contract)
- Proved Glinski hexagonal chess: full game on hex topology (init, moves, check, checkmate)
- Refactored all 8 rule implementations to be topology-agnostic (support arrays + objects)
- Wired plugin-chess to use composed rules via game factory (opt-in, backwards-compatible)
- wrapPluginWithRules replaces plugin hooks with composed versions (init, getLegalMoves, applyMove, checkWin)
- Implemented rule registry: rules as first-class resource type with composition engine
- Per-hook composition strategies: AND (validate), CHAIN (apply), PIPELINE (filter), UNION (moves)
- Dependency resolution via topological sort with cycle detection
- 8 parametric chess rules: attack-detection, capture-replacement, castling, check, checkmate, draw-50-move, en-passant, promotion
- Composable piece definitions: rider(), leaper(), compose(), divergent(), fromConfig()
- Rewrote plugin-chess: topology-agnostic via piece-behaviour, parametric config for all assumptions
- Chess960-safe castling (dynamically scans rook positions from board state)
- 11 variant proof tests (no-castling, custom promotion, 10x8, fairy pieces, wrap/toroidal, etc.)
- Game factory gains rule resolution (backwards-compatible, opt-in)
- Audited all 76 MCE variants to verify rule parametricity
- Implemented complete plugin library: 7 game families (go, hex, mancala, morris, backgammon, big2, chess)
- Created component layer: deck (standard-52) and dice consumed via registry like topologies
- Created theming layer: board-theme (3 builtins), piece-theme (resolver, recolour, composition)
- Added traversal algorithms to core (floodFill, getGroup, hasPath, findPatterns)
- Added position notation to grid/hex/graph topologies (serialize/parse with any vocabulary)
- Added unified direction API: topology.rays(from, 'orthogonal') works on both grid and hex
- Proved cross-topology: same movement functions work on grid AND hex without code changes
- Plugin vocabulary system: each plugin declares piece type ↔ symbol mapping
- Component registry in game factory: components provided via request() like topologies
- Every plugin proven with unit tests, vertical proof, and complete-game proof
- Implemented @moddable/game: factory, topology registry, definition wiring
- Eliminated all hidden knowledge: DEFAULT_FAMILY_MAP, hardcoded topology imports, shape dispatch
- Enriched all 154 moddable-rules variants with engine: blocks
- Separated topology geometry from visual style (cellType + defaults + theme resolver pattern)

#### 2026-06-29
- Implemented @moddable/topology-graph: arbitrary node-edge structures (morris proof)
- Implemented @moddable/schema: full pipeline (parse, validate, produce, load, infer, enrich)
- Proved all 7 games playable from schema-driven definitions
- Made schema fully topology-agnostic (topologies self-describe via exported schema objects)
- Updated README to reflect actual project state

#### 2026-06-28
- Implemented render layer with topology-provided layouts
- Made piece-behaviour fully topology-agnostic

#### 2026-06-27
- Implemented topology-track and topology-pit
- Implemented topology-hex (axial coordinates)
- Implemented topology-grid and piece-behaviour
- Added continueTurn to move pipeline

#### 2026-06-26
- Implemented @moddable/core — 9 modules + 7 proof game tests
- Rewrote Phase 2 PRD with 7 proof games

#### 2026-06-25
- Added SPEC.md — architecture spec with philosophy and decisions log
- Initial repo setup
