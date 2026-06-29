# moddable-engine

Micro-kernel master engine for all Moddable Games titles.

Every game in the Moddable Games collection — from standard chess to Endless Skies — runs on this engine by composing plugins. No hand-written engine code per game. A game is a configuration file that declares which plugins to activate.

---

## Status

**Schema package in progress.** Core engine, four topologies, piece-behaviour, render layer, and schema parser are implemented and tested (362 tests across 33 suites, all passing).

Current work: **Schema package** — parses game frontmatter and produces game definition objects consumed by core/topology/render.

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
    piece-behaviour/     ← @moddable/piece-behaviour (done)
    render/              ← @moddable/render (done)
    schema/              ← @moddable/schema (in progress)
  SPEC.md                ← architecture spec — read this first
  package.json           ← workspace root
```

### Planned packages (not yet implemented)

- `@moddable/topology-graph` — arbitrary graph topologies
- `@moddable/ai` — search, evaluation protocol, Worker bridge
- `@moddable/plugin-*` — game family plugins (grid-square, grid-hex, track, pit-sow, card-deck, terrain, dice, etc.)

---

## The layers

| Layer | Package(s) | Purpose |
|---|---|---|
| 0 | `@moddable/core` | State, moves, players, history, events, RNG, timer, plugin registry |
| 1 | `@moddable/topology-*` | Coordinate systems: grid, hex, track, pit |
| 2 | `@moddable/piece-behaviour` | Movement primitives (topology-agnostic) |
| 3 | `@moddable/render` | Topology-agnostic SVG board renderer |
| 4 | `@moddable/schema` | Frontmatter → game definitions |
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

#### 2026-06-29
- Implemented @moddable/schema: frontmatter parser, validator, and game definition producer
- Proof tests for chess, mancala, backgammon, and hex game families
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
