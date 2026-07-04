# moddable-engine

Micro-kernel master engine for all Moddable Games titles.

Every game in the Moddable Games collection — from standard chess to Endless Skies — runs on this engine by composing plugins. No hand-written engine code per game. A game is a configuration file that declares which plugins to activate.

---

## Status

**All classic game families implemented.** 13 plugins covering 154 variants across chess, go, draughts, reversi, mancala, backgammon, morris, hex, big 2, halma, shogi, xiangqi, and race games. Rules are a first-class resource type: parametric, composable, topology-agnostic. Shared rules (capture, promotion, repetition, turn-continuation) work across all families. 1095 tests across 87 suites, all passing.

Current milestone: **Full pipeline proof + AI adapter** — factory instantiates every variant from frontmatter config alone, then generic minimax/MCTS for pass-and-play and AI opponents.

Read [`SPEC.md`](./SPEC.md) before contributing anything.

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
    piece-behaviour/     ← movement primitives + composable definitions (rider, leaper, compose, divergent)
    rule/                ← rule registry, composition engine, parametric rule implementations
    render/              ← topology-agnostic SVG board renderer
    schema/              ← frontmatter → game definitions
    game/                ← factory, topology registry, component registry, rule registry
    board-theme/         ← board visual treatment (resolver, builtins)
    piece-theme/         ← piece visual treatment (resolver, recolour)
    component-deck/      ← standard 52-card deck
    component-dice/      ← standard dice (roll, doubles, movesFromRoll)
    plugin-go/           ← Go + atari-go
    plugin-hex/          ← Hex + swap rule
    plugin-mancala/      ← Kalah + Oware
    plugin-morris/       ← Nine Men's + Six Men's
    plugin-backgammon/   ← Standard + nackgammon
    plugin-big2/         ← Big 2 + President
    plugin-chess/        ← Standard chess + Glinski hex (topology-agnostic, rule-composed)
    plugin-draughts/     ← 20 variants (English, International, Turkish, Lasca...)
    plugin-reversi/      ← 3 variants (standard, anti-reversi, mini)
    plugin-halma/        ← 2 variants (standard, 4-player)
    plugin-shogi/        ← 4 variants (standard, minishogi, chu-shogi, kyoto)
    plugin-xiangqi/      ← 2 variants (xiangqi, janggi)
    plugin-race/         ← 9 variants (pachisi, chaupar, landlords-game)
  SPEC.md                ← architecture spec — read this first
  package.json           ← workspace root
```

---

## The layers

| Layer | Package(s) | Purpose |
|---|---|---|
| 0 | `@moddable/core` | State, moves, players, history, events, RNG, timer, plugin registry |
| 1 | `@moddable/topology-*` | Coordinate systems: grid, hex, track, pit, graph |
| 2 | `@moddable/piece-behaviour` | Movement primitives + composable piece definitions |
| 2 | `@moddable/rule` | Rule registry, composition engine, parametric rules |
| 3 | `@moddable/render` | Topology-agnostic SVG board renderer |
| 4 | `@moddable/schema` | Frontmatter → game definitions (done) |
| 5 | `@moddable/component-*` | Non-spatial structure: deck, dice, timer |
| 6 | `@moddable/plugin-*` | Game families (go, hex, mancala, morris, backgammon, big2, chess) |
| 7 | Game configs | Frontmatter only — no code |

---

## Key principles

- If you have to mention a game's name to explain what a piece of code does, that code is in the wrong layer.
- Topologies are the universal adapter layer for geometry. Rules are the universal adapter layer for behaviour.
- Rules must be parametric containers that assume nothing — never hardcode "standard" as baseline.
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

- [`moddable-chess`](https://github.com/Moddable-Games/moddable-chess) — migrating to plugin-grid-square
- [`moddable-hexmaps`](https://github.com/Moddable-Games/moddable-hexmaps) — migrating to plugin-grid-hex
- [`moddable-rules`](https://github.com/Moddable-Games/moddable-rules) — migrating build system to plugin-rules
- [`dungeon-chess`](https://github.com/Moddable-Games/dungeon-chess) — north star proof of concept
- [`moddable-ops`](https://github.com/Moddable-Games/moddable-ops) — coordination and planning

---

## Changelog

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
