# moddable-engine

Micro-kernel master engine for all Moddable Games titles.

Every game in the Moddable Games collection — from standard chess to Endless Skies — runs on this engine by composing plugins. No hand-written engine code per game. A game is a configuration file that declares which plugins to activate.

---

## Status

Phase 1 — Architecture spec. No production code yet.

Read [`SPEC.md`](./SPEC.md) before contributing anything.

---

## Structure

```
moddable-engine/
  packages/
    core/                    ← @moddable/core
    render/                  ← @moddable/render
    topology-grid/           ← @moddable/topology-grid
    topology-hex/            ← @moddable/topology-hex
    topology-track/          ← @moddable/topology-track
    topology-pit/            ← @moddable/topology-pit
    topology-graph/          ← @moddable/topology-graph
    piece-behaviour/         ← @moddable/piece-behaviour
    ai/                      ← @moddable/ai
    plugin-grid-square/      ← @moddable/plugin-grid-square
    plugin-grid-hex/         ← @moddable/plugin-grid-hex
    plugin-track/            ← @moddable/plugin-track
    plugin-pit-sow/          ← @moddable/plugin-pit-sow
    plugin-card-deck/        ← @moddable/plugin-card-deck
    plugin-terrain/          ← @moddable/plugin-terrain
    plugin-dice/             ← @moddable/plugin-dice
    plugin-resource-track/   ← @moddable/plugin-resource-track
    plugin-worker-placement/ ← @moddable/plugin-worker-placement
    plugin-ai/               ← @moddable/plugin-ai
    plugin-multiplayer/      ← @moddable/plugin-multiplayer
    plugin-audio/            ← @moddable/plugin-audio
    plugin-character/        ← @moddable/plugin-character
    plugin-rules/            ← @moddable/plugin-rules
  SPEC.md                    ← architecture spec — read this first
  package.json               ← workspace root
```

---

## The layers

| Layer | Package(s) | Purpose |
|---|---|---|
| 0 | `@moddable/core` | State, moves, players, history, events, RNG, timer, plugin registry |
| 1 | `@moddable/render` | Layer compositor, annotations, SVG builder, DOM interaction, asset resolver, theme registry |
| 2 | `@moddable/topology-*` | Coordinate systems: grid, hex, track, pit, graph |
| 3 | `@moddable/piece-behaviour` | Movement primitives, piece registry, piece set resolver |
| 4 | `@moddable/ai` | Search, evaluation protocol, Worker bridge |
| 5 | `@moddable/plugin-*` | Game families and utility systems |
| 6 | Game configs | Frontmatter only — no code |

---

## Key principle

If you have to mention a game's name to explain what a piece of code does, that code is in the wrong layer.

See `SPEC.md` section 0 (Philosophy) for the full reasoning behind every architectural decision.

---

## Related repos

- [`moddable-chess`](https://github.com/Moddable-Games/moddable-chess) — migrating to `plugin-grid-square`
- [`moddable-hexmaps`](https://github.com/Moddable-Games/moddable-hexmaps) — migrating to `plugin-grid-hex`
- [`moddable-rules`](https://github.com/Moddable-Games/moddable-rules) — migrating build system to `plugin-rules`
- [`dungeon-chess`](https://github.com/Moddable-Games/dungeon-chess) — north star proof of concept
- [`moddable-ops`](https://github.com/Moddable-Games/moddable-ops) — coordination, issue #28 is the master tracking issue
