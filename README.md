# moddable-engine

Micro-kernel master engine for all Moddable Games titles.

Every game in the Moddable Games collection — from standard chess to Endless Skies — runs on this engine by composing plugins. No hand-written engine code per game. A game is a configuration file that declares which plugins to activate.

---

## Status

**Engine foundation complete.** Five topologies, piece-behaviour, render layer, schema package, and game factory are implemented and proven (468 tests across 42 suites, all passing). All 7 proof games (Chess, Go, Backgammon, Mancala, Morris, Hex, Big 2) play moves from schema-driven definitions. All 154 moddable-rules variants have engine blocks and validate.

Next milestone: **Plugin library** — extract proof game logic into reusable hook-based plugins with board and piece theming. See the approved plan in progress.

Read [`SPEC.md`](./SPEC.md) before contributing anything.

---

## Structure

```
moddable-engine/
  packages/
    core/                ← @moddable/core (done)
    topology-grid/       ← @moddable/topology-grid (done)
    topology-hex/        ← @moddable/topology-hex (done)
    topology-track/      ← @moddable/topology-track (done)
    topology-pit/        ← @moddable/topology-pit (done)
    topology-graph/      ← @moddable/topology-graph (done)
    piece-behaviour/     ← @moddable/piece-behaviour (done)
    render/              ← @moddable/render (done, theme-ready)
    schema/              ← @moddable/schema (done)
    game/                ← @moddable/game (done)
  SPEC.md                ← architecture spec — read this first
  package.json           ← workspace root
```

### Planned packages (in design / Phase 1)

- `@moddable/board-theme` — board visual treatment (manifests, palettes, patterns)
- `@moddable/piece-theme` — piece visual treatment (manifests, resolver, recolour, composition)
- `@moddable/plugin-*` — game family plugins (go, hex, mancala, morris, backgammon, cards, chess)

---

## The layers

| Layer | Package(s) | Purpose |
|---|---|---|
| 0 | `@moddable/core` | State, moves, players, history, events, RNG, timer, plugin registry |
| 1 | `@moddable/topology-*` | Coordinate systems: grid, hex, track, pit, graph |
| 2 | `@moddable/piece-behaviour` | Movement primitives (topology-agnostic) |
| 3 | `@moddable/render` | Topology-agnostic SVG board renderer |
| 4 | `@moddable/schema` | Frontmatter → game definitions (done) |
| 5 | `@moddable/plugin-*` | Game families and utility systems (planned) |
| 6 | Game configs | Frontmatter only — no code |

---

## Key principles

- If you have to mention a game's name to explain what a piece of code does, that code is in the wrong layer.
- Topologies are the universal adapter layer. Higher packages define contracts; topologies implement them.
- No if/else for topology type anywhere in the codebase.

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

#### 2026-06-30
- Implemented @moddable/game: factory, topology registry, definition wiring
- Eliminated all hidden knowledge: DEFAULT_FAMILY_MAP, hardcoded topology imports, shape dispatch
- Enriched all 154 moddable-rules variants with engine: blocks (morris graph data, nukes radius, pachisi positions)
- Separated topology geometry from visual style (cellType + defaults + theme resolver pattern)
- Designed plugin library architecture (11 universal hooks, board/piece theming, MCE variant pattern)

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
