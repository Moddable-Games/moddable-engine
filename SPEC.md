# moddable-engine — Phase 1 Architecture Spec

**Status:** Agreed 2026-06-26. No code until this spec is committed and stable.
**Repo:** `Moddable-Games/moddable-engine`

---
## 0. Philosophy — why we built it this way

This section exists so that future decisions — ones this spec doesn't explicitly cover — can be resolved correctly by understanding the reasoning, not just the rules.

### 0.1 The duplication problem we are solving

Before this architecture, each game was a self-contained engine. moddable-chess had its own board state, move generation, renderer, AI, and game controller. moddable-hexmaps had its own versions of most of the same things. Every new game would need to reimplement the same infrastructure again.

This produces three compounding problems over time:
1. **Bug fixes don't propagate** — fix a history replay bug in moddable-chess and moddable-hexmaps still has the old bug
2. **Quality diverges** — whichever engine gets more attention improves; others stagnate
3. **New games start from scratch** — each new game type requires rebuilding infrastructure that already exists elsewhere

The architecture solves this by ensuring shared concerns live in exactly one place. If it exists in two places, it is in the wrong place.

### 0.2 The hardcoding problem we are solving

Beyond duplication, the deeper problem is assumptions baked into infrastructure. When board size (8×8) is hardcoded into the move generator, adding a 9×9 game requires rewriting the move generator. When "player 1 and player 2" is hardcoded into the state model, adding a 4-player game requires rewriting the state model.

Every hardcoded assumption is a future rewrite. The architecture eliminates hardcoded assumptions by pushing all game-specific knowledge into plugins and configs, leaving the infrastructure genuinely generic.

The test we apply: **if you have to mention a game's name to explain what a piece of code does, that code is in the wrong layer.**

### 0.3 Why the layers are in this order

The layer order is not arbitrary. It reflects a strict dependency rule: each layer may only depend on layers below it. This rule exists for two reasons:

**Testability:** Core can be tested without any topology. Topologies can be tested without any plugins. Plugins can be tested without any game config. Breaking the dependency order breaks testability — you can no longer test a component in isolation.

**Replaceability:** If plugin-grid-square needs to be replaced or upgraded, nothing in Layers 0–4 changes. If topology-grid needs to change its internal coordinate representation, plugins adapt but core is untouched. Keeping dependencies downward-only preserves this.

When a future decision asks "should X depend on Y?" — check the layer order. If Y is above X, the answer is no. Find a way to invert the dependency through the registry or event bus.

### 0.4 Why plugins communicate through the registry, not imports

It would be simpler for plugin-terrain to directly import plugin-grid-square and call its functions. We explicitly chose not to allow this. The reason:

Direct imports create hard dependencies. If plugin-terrain imports plugin-grid-square, then plugin-terrain cannot be used in a hex game (which uses plugin-grid-hex, not plugin-grid-square). But terrain is genuinely useful in hex games — Endless Skies has asteroid fields and wormholes that behave exactly like terrain. If we hardcode the dependency, we've made terrain a chess-only concept by accident.

By communicating through the registry (`registry.request('grid.getNeighbours')`), plugin-terrain works with any topology that provides that capability. It doesn't know or care whether it's running alongside plugin-grid-square or plugin-grid-hex. This is the open/closed principle: open to new topologies, closed to modification.

**The rule:** if a plugin would break when used without another specific plugin, it has a hardcoded assumption that should be expressed through the registry instead.

### 0.5 Why state must be plain JSON

State serialisability is not a nice-to-have. It is the foundation of four critical capabilities:

- **Save/load:** if state isn't serialisable, games can't be saved
- **Replay:** if state isn't serialisable, move history can't be reconstructed
- **Multiplayer sync:** if state isn't serialisable, the server can't send authoritative state to clients
- **Debugging:** if state isn't serialisable, you can't snapshot it and inspect it

Each of these capabilities could be implemented with a custom serialiser if we allowed non-JSON state. But that means every plugin must implement serialisation logic, and every plugin's serialisation must be tested. The JSON constraint means serialisation is solved once by the constraint itself. No plugin author ever has to think about it.

When a future decision asks "can we put a class instance in state?" — the answer is no, because one of the four capabilities above will break silently in a way that's very hard to debug.

### 0.6 Why visual themes are not plugins

A plugin has a state slice, an init function, and participates in the move pipeline. Themes have none of these. A theme is a CSS variable map and a background asset. It has no effect on what moves are legal, what winning means, or what happens when a piece lands somewhere.

Making themes into plugins would create the illusion that visual presentation is on the same level as game logic. It isn't. The dungeon aesthetic does not affect whether a move is legal. If it did, it would be terrain logic — which is a plugin (plugin-terrain) precisely because it does affect game logic.

The line between theme and plugin is: **does it affect what is true about the game state?** If yes, it's a plugin. If no, it's a theme.

### 0.7 Why terrain is a plugin, not a theme

Because terrain does affect what is true about the game state. A wall square means certain moves are illegal. A portal square means a piece that lands there teleports. A chest square means landing there yields an item. These are not visual facts — they are game facts.

Had we made terrain a theme (pure visual), we would have needed to reimplement the movement-blocking and landing-effect logic in every game that uses terrain. DC would have its own terrain system. Endless Skies would have its own asteroid-field system. Tafl would have its own throne-square system. All three are the same concept expressed differently — and they should share one implementation.

### 0.8 Why the "easiest route" is often wrong

Many of the decisions in this spec required more initial work than the obvious alternative. Putting terrain in a plugin is more work than hardcoding "portal squares teleport" into the DC variant file. Making themes render-layer config is more work than making them plugins. Separating topology from piece-behaviour is more work than keeping them together.

In each case, the easier route produces a system that works for today's games but resists tomorrow's. The harder route produces a system where tomorrow's games are configurations, not rewrites.

**When facing a new decision, always ask: does this approach work for a game we haven't built yet? Does it require changes to shared infrastructure to accommodate the next game, or does the next game simply compose what already exists?** If the answer requires infrastructure changes for every new game, the abstraction is at the wrong level.

### 0.9 Topologies are the universal adapter layer

This principle was discovered during implementation and is now load-bearing:

**Every package above Layer 2 (topologies) defines a contract. Topologies implement that contract. The higher package never knows which topology it's consuming.**

- piece-behaviour defines: "I need `rays()`, `leapTargets()`, `jumpPairs()`"
- render defines: "I need `getLayout()` returning cells with centers and shapes"
- AI will define: "I need evaluation context"
- Rules-gen will define: "I need diagram specs"

Each topology implements whichever contracts make sense for it. `topology-track` has no `rays()` because tracks don't slide. `topology-pit` has no `leapTargets()` because pits don't leap. That's fine — the game plugin for mancala simply doesn't call `slide()`.

**The consequence:** new packages never modify existing topologies. They define what they need, and topologies grow a new method. New topologies never modify existing packages. They implement the contracts and everything works.

**The development rule:** build all topologies first, then layer capabilities horizontally. Never build one game end-to-end before another — that creates vertical silos instead of horizontal composability.

### 0.10 Why Dungeon Chess is the north star test

DC is the most complex, most feature-rich consumer of the engine. It uses terrain, multi-floor movement, spell effects, asymmetric factions, campaign progression, and audio. If the architecture can express DC entirely in frontmatter config — with no hand-written plugin code specific to DC — then the architecture is general enough for everything simpler.

DC is not the goal. DC is the test. The goal is a system where any game we design is a configuration of existing components, not a new codebase.

---

## 1. The principle

Every reusable concern lives at the lowest layer that needs no game-specific knowledge.
Every game-specific concern lives in a plugin.
Nothing is duplicated between plugins.

**Test for correct placement:**
- If you have to mention a game's name to explain what it does → plugin
- If three completely different game families could use it → shared infrastructure
- If it has no knowledge of any specific game → core or render

---

## 2. The layers

```
Layer 0  @moddable/core            Pure game mechanics primitives
Layer 1  @moddable/render          Pure visual primitives
Layer 2  @moddable/topology-*      Coordinate systems and geometry
Layer 3  @moddable/piece-behaviour Piece logic and asset resolution
Layer 4  @moddable/ai              Search and evaluation infrastructure
Layer 5  Plugins                   Game families and utility systems
Layer 6  Game configs              Frontmatter only — no code
```

Each layer only depends on layers below it. Plugins never import other plugins directly — they communicate through core's event bus and registry.

---

## 3. Layer 0 — @moddable/core

The smallest possible set of game-agnostic primitives. Nine concerns, nothing more.

```
@moddable/core
  coordinate-protocol.js   ← interface only: neighbours(), isValid(), toJSON()
  state-store.js           ← keyed slices, owned namespaces, JSON constraint enforced
  move-pipeline.js         ← validate → apply → record → check-win → advance-turn
  player-system.js         ← ordered players, turn advancement, pass/skip/forced
  history.js               ← append-only move log, undo, replay, multiplayer sync
  event-bus.js             ← typed synchronous event dispatch, zero game knowledge
  rng.js                   ← seeded random number generator (xorshift), deterministic
  timer.js                 ← monotonic, pauseable, snapshotable
  plugin-registry.js       ← register, request, version-check
```

**What core knows:** state exists, moves change state, players take turns, events happen, things are random, time passes, plugins exist.

**What core does not know:** what a board is, what a piece is, what a legal move looks like, what winning means, what any coordinate system looks like, what any game is called.

### State ownership rule
Each plugin declares a `sliceName`. Only the owning plugin writes to its slice. Any plugin may read any slice. State is always plain JSON — no functions, no class instances. Enforced by `JSON.stringify` check after every state transition in development. Build fails if violated.

### Move pipeline
```
applyMove(state, move)
  → plugin.validateMove(move, state)     // returns true/false
  → plugin.applyMove(move, state)        // returns new slice state
  → history.record(move, before, after)
  → plugin.checkWin(state)              // returns winner or null
  → playerSystem.advance(state)
  → eventBus.emit('move.applied', { move, state })
```

### Plugin interface (every plugin must implement)
```js
export default {
  sliceName: string,
  init(config, registry) → sliceState,
  applyMove(move, sliceState, fullState) → sliceState,
  getLegalMoves(sliceState, fullState) → move[],
  checkWin(sliceState, fullState) → winner | null,
  // optional
  onPhaseStart(phase, sliceState, fullState),
  onPhaseEnd(phase, sliceState, fullState),
  onGameEnd(result, sliceState, fullState),
}
```

### Phase lifecycle
Core owns the phase sequence. Plugins register handlers. Phases declared in game config frontmatter.
```yaml
phases: [play]                          # chess
phases: [diplomatic, action, event]     # endless-skies
```

### Inter-plugin communication
Through the registry only. Plugins never import each other.
```js
registry.provide('terrain.getType', (coord) => getType(sliceState, coord))
const getType = registry.request('terrain.getType')  // null if not registered
```

---

## 4. Layer 1 — @moddable/render

Pure visual primitives. No game state. No game logic. Zero knowledge of any specific game.

```
@moddable/render
  layer-compositor.js      ← z-ordered layers, composites all plugin render outputs
  annotation-protocol.js   ← shared interface: highlights, arrows, labels, markers
  svg-builder.js           ← SVG construction utilities: shapes, paths, text, transforms
  dom-interaction.js       ← pointer events, drag/drop, keyboard, touch
  asset-resolver.js        ← loads named assets with fallback chain
  theme-registry.js        ← registers visual themes (CSS vars + background assets)
```

### Visual themes
Pure CSS variables and background assets. Zero game logic. Zero game state.

```js
themeRegistry.register('dungeon', {
  cssVars: { '--board-bg': '#1a1a2e', ... },
  backgroundAsset: 'dungeon-surround.svg',
})
```

Selected via frontmatter `theme: dungeon`. **Themes are not plugins** — no slice, no init, no applyMove.

### Annotation protocol
Shared interface all topology renderers implement — ensures visual consistency across all games:
```js
{ highlight(coord, colour, opacity), arrow(from, to, colour), label(coord, text, style), marker(coord, type) }
```

### Worker boundary
All game logic (Layers 0–4) runs in a Web Worker. All rendering (Layer 1) runs in the main thread. Enforced at build time — any Layer 0–4 file referencing `window` or `document` fails the build.

---

## 5. Layer 2 — @moddable/topology-*

Coordinate systems and geometry. Each implements the core coordinate protocol. None knows what game it is for.

```
@moddable/topology-grid
  ← integer index (row * cols + col), FEN, terrain mask, wrap flags
  Used by: grid-square plugin, any rectangular-grid game

@moddable/topology-hex
  ← axial {q,r}, neighbours, distance, rings, line-of-sight
  Used by: grid-hex plugin, any hex game

@moddable/topology-track
  ← named positions, adjacency, circuit detection, direction
  Used by: track plugin, backgammon, pachisi, landlord's game

@moddable/topology-pit
  ← pit identifiers, sequence order, store positions, sowing direction
  Used by: pit-sow plugin, all mancala variants

@moddable/topology-graph
  ← arbitrary node/edge declarations, adjacency by name
  Used by: future adventure/narrative games
```

---

## 6. Layer 3 — @moddable/piece-behaviour

Piece logic and asset resolution. Topology-agnostic — all movement primitives are parameterised by topology.

```
@moddable/piece-behaviour
  movement-primitives.js
    ← slide, leap, jump (draughts), custodian (sandwich), gapCapture (cannon), sow (mancala)
    ← all parameterised by topology — no board-size assumptions

  piece-registry.js
    ← register: { name, category, genMoves(), attacks() } — pure logic, no graphics
    ← in progress in moddable-chess CC session

  piece-set-resolver.js
    ← SVG asset resolution: active set → fallback set → text letter
    ← sets.json manifest: coverage, licence, fallback
    ← blocked on external piece set sourcing (see section 13)
```

---

## 7. Layer 4 — @moddable/ai

Search and evaluation infrastructure. Zero game knowledge — calls hooks provided by the game plugin.

```
@moddable/ai
  search.js         ← negamax, alpha-beta, iterative deepening
  evaluate.js       ← evaluation protocol: plugins register an evaluator
  worker-bridge.js  ← postMessage wrapper, runs search in Web Worker
```

Any game that registers an evaluator via `registry.provide('ai.evaluate', fn)` gets AI for free.

---

## 8. Layer 5 — Plugins

Assemble shared infrastructure. No plugin reimplements anything in Layers 0–4.

### Game family plugins

```
@moddable/plugin-grid-square
  ← topology-grid + piece-behaviour + board-renderer-svg + board-renderer-dom
  ← chess, draughts, go, morris, shogi, xiangqi, reversi, halma, fanorona, surakarta, tafl, royal ur
  ← migrated from moddable-chess (engine only)

@moddable/plugin-grid-hex
  ← topology-hex + hex-renderer-svg + hex-renderer-dom
  ← nukes, harvesters, hyper-imperium, endless-skies galaxy
  ← migrated from moddable-hexmaps (engine only)

@moddable/plugin-track
  ← topology-track + track-renderer-svg + track-renderer-dom
  ← backgammon, pachisi, chaupar, landlord's game, econopoly

@moddable/plugin-pit-sow
  ← topology-pit + pit-renderer-svg + pit-renderer-dom
  ← all mancala variants

@moddable/plugin-card-deck
  ← core state-store + card-renderer-dom
  ← endless-skies, talisman worlds, baristasaurus
```

### Terrain plugin (game logic, not a skin)

```
@moddable/plugin-terrain
  ← state slice: what each position IS (wall, water, portal, door, chest, exit, wormhole)
  ← movement filter: walls block, water modifies, portals transfer
  ← landing effects: emits 'terrain.activated' on core event-bus
  ← dungeon-chess (portals, doors, chests), endless-skies (asteroids, wormholes),
    tafl (throne, corner squares), any game with meaningful position states
  ← visual representation: render layer reads terrain state and maps to tile graphics
```

### Utility plugins

```
@moddable/plugin-dice         ← core rng. Any die type. Result hooks.
@moddable/plugin-resource-track ← numeric resources per player. Credits, VP, commodities.
@moddable/plugin-worker-placement ← named slots, capacity limits, reservation logic.
@moddable/plugin-ai           ← ai package + core move-pipeline. Any game with an evaluator.
@moddable/plugin-multiplayer  ← core history + Durable Objects transport.
@moddable/plugin-audio        ← listens to event-bus, maps event types to audio cues.
@moddable/plugin-character    ← core state-store. Stats, progression, inventory.
@moddable/plugin-rules        ← render + topology renderers. Docs build, PDF, OG images.
                                 Replaces generate-rules-boards.js permanently.
```

---

## 9. Layer 6 — Game configs (frontmatter only, no code)

```yaml
# dungeon-chess.yml
game: dungeon-chess
plugins: [grid-square, terrain, ai, audio, multiplayer]
theme: dungeon
phases: [play]
grid-square: { rows: 8, cols: 8, startFen: rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR }
terrain: { tokens: [door, chest, portal, exit] }
board: { style: checkered, tileSize: 60 }
```

```yaml
# endless-skies.yml
game: endless-skies
plugins: [grid-hex, worker-placement, card-deck, dice, resource-track, terrain, audio]
theme: cosmic
phases: [diplomatic, action, event]
grid-hex: { tiles: 113, factions: 8 }
terrain: { types: [asteroid-belt, wormhole, space-port, habitable, empty] }
card-deck: { decks: [blueprints, contracts, events, discoveries, missions] }
dice: { type: d10 }
resource-track: { resources: [credits] }
board: { style: hex, tileSize: 80 }
```

```yaml
# oware.yml
game: oware
plugins: [pit-sow]
theme: classical
pit-sow: { pits: 6, seeds: 4, stores: 2 }
board: { style: mancala }
```

```yaml
# backgammon.yml
game: backgammon
plugins: [track, dice]
theme: classical
track: { positions: 24, circuit: false, direction: clockwise }
dice: { count: 2, type: d6 }
board: { style: backgammon }
```

---

## 10. Monorepo structure

```
moddable-engine/
  packages/
    core/ render/
    topology-grid/ topology-hex/ topology-track/ topology-pit/ topology-graph/
    piece-behaviour/ ai/
    plugin-grid-square/ plugin-grid-hex/ plugin-track/ plugin-pit-sow/
    plugin-card-deck/ plugin-terrain/ plugin-dice/ plugin-resource-track/
    plugin-worker-placement/ plugin-ai/ plugin-multiplayer/
    plugin-audio/ plugin-character/ plugin-rules/
  SPEC.md  README.md  package.json
```

---

## 11. What stays in existing repos

| Repo | What stays | What migrates |
|---|---|---|
| moddable-chess | UI, website shell, variant content | chess-engine → plugin-grid-square; chess-moves → piece-behaviour; chess-ai → ai; svg-renderer → render |
| moddable-hexmaps | UI, website shell, game content | hex-math → topology-hex; hex-renderer → render |
| moddable-rules | Game content, markdown, PDFs | Build system → plugin-rules |
| dungeon-chess | DC assets, maps, faction data | dc-variant.js → game config frontmatter |

Migration complete when: (1) file lives in moddable-engine, (2) existing repo imports from there, (3) all tests pass, (4) no URLs change.

---

## 11a. Isolation and parallel development — CRITICAL

**moddable-engine develops in complete isolation from all existing repos until each migration phase is proven.**

This means:

- moddable-chess, moddable-hexmaps, moddable-rules, moddable-website, and dungeon-chess continue operating exactly as they do today throughout the entire moddable-engine build
- The nightly variant pipeline keeps running. New chess variants keep shipping. Rulebook content keeps being added. DC keeps being worked on. None of this stops.
- **No existing repo is modified to depend on moddable-engine until the relevant phase is complete and proven.** Phase 5 (plugin-grid-square) must pass all 73+ chess variants before moddable-chess imports from it. Phase 7 (plugin-rules) must regenerate all existing rulebook content correctly before moddable-rules uses it.
- **No existing repo is deprecated or frozen at any point during the migration.** Work continues in existing repos until moddable-engine demonstrably replaces each concern.

### The cutover test for each phase

A phase is complete — and only then should the corresponding existing repo be updated to use it — when all four of these are true:

1. The concern lives in moddable-engine and is importable as a package
2. The existing repo imports from moddable-engine instead of its own code
3. All existing tests pass without modification
4. No user-facing URL, behaviour, or output changes

If any of these four fail, the migration for that phase is not complete. The existing code stays in place.

### Why this matters

Attempting to migrate and develop new content simultaneously in the same repo creates conflicts, breaks the nightly pipeline, and risks shipping regressions. The isolation approach means:

- Existing users and content are never affected by moddable-engine development
- Each phase can be developed, tested, and proven independently
- A failed or stalled phase does not block any other work
- The existing repos serve as the acceptance test suite — if they don't work identically after migration, the migration has failed

### The one exception

If a major refactor in an existing repo would need to be immediately undone when its moddable-engine migration phase lands — for example, a large chess engine rewrite in moddable-chess that duplicates Phase 2 work already underway in moddable-engine — then at that point it makes sense to pause new engine work in the existing repo and direct it into moddable-engine instead. This is a judgement call made at the time, not a policy. It will be obvious when it arises.

---

## 12. Migration phases

| Phase | Work | Unblocks |
|---|---|---|
| 1 | This spec. Create repo. ✔ | Everything |
| 2 | Extract core package | All plugins |
| 3 | topology-grid + piece-behaviour (blocked on piece set sourcing) | plugin-grid-square |
| 4 | render layer | All renderers |
| 5 | plugin-grid-square. 73+ chess variants pass. | chess#117, rules#71 |
| 6 | topology-hex + plugin-grid-hex | Hex games |
| 7 | plugin-rules. Frontmatter → auto SVG. | rules#112 |
| 8 | plugin-terrain | DC portals, Tafl squares, Endless Skies terrain |
| 9 | plugin-track + topology-track. Proof: Backgammon. | Track games |
| 10 | plugin-pit-sow + topology-pit. Proof: Oware. | All Mancala |
| 11 | Dungeon Chess as frontmatter config | DC#47 |
| 12 | Endless Skies as frontmatter config | Full composition proof |

---

## 13. Immediate blockers

### Piece set sourcing (blocks Phase 3)
1. Download pychess fairy piece SVGs — verify licence
2. Download lichess standard piece SVGs — verify MIT licence
3. Confirm coverage of all 18 piece chars from at least one source
4. Store in assets/pieces/sets/ with licence files

Claude Code task. Track in moddable-ops.

### Repo creation ✔
moddable-engine repo created at github.com/Moddable-Games/moddable-engine.

---

## 14. Decisions log

Every significant decision recorded with alternatives considered and why they were rejected. Exists so future decisions can be made consistently with the same philosophy.

---

### Shared state store with owned slices — 2026-06-25

**Chosen:** One central state object. Each plugin owns a named slice. Any plugin may read any slice. Only the owning plugin writes its slice. Always plain JSON.

**Rejected alternatives:**
- *Event bus only* — hard to trace, difficult to reason about ordering, replay is complex, async events create subtle bugs in turn-based games.
- *Direct plugin-to-plugin API calls* — creates hard inter-plugin dependencies. plugin-terrain calling plugin-grid-square directly means terrain can never work with plugin-grid-hex.
- *Immutable state / Redux pattern* — not rejected; compatible with this approach. JSON constraint implies immutability in practice. Revisit if performance demands structural sharing.

**Why:** The shared store is the only model where save/load, replay, multiplayer sync, undo/redo, and debugging are all solved by the same constraint rather than separate implementations.

---

### Core owns phases, plugins register handlers — 2026-06-25

**Chosen:** Phase sequence in game config frontmatter. Core runs phases. Plugins register handlers.

**Rejected alternatives:**
- *One plugin owns the phase loop* — reintroduces per-game code. Every game needs a controller plugin. Games should be configs, not code.
- *Plugins declare their own phases* — phase ordering becomes ambiguous when multiple plugins declare phases.

**Why:** Phase sequence is game-level knowledge. It belongs in config. Core executing it keeps logic in one place.

---

### Z-layer compositing for rendering — 2026-06-25

**Chosen:** Each plugin renderer declares layers with z-order. Core compositor renders in z-order.

**Rejected alternatives:**
- *Single render plugin owns the canvas* — must know about all possible plugin outputs. Adding a new plugin requires modifying the renderer.
- *Plugins render directly in turn order* — no coordination, no transparency compositing.

**Why:** How every serious rendering system works (CSS, Unity, Godot, Photoshop). Enforces Worker boundary: logic determines what to render, render layer determines how.

---

### JSON constraint on all state — 2026-06-25

**Chosen:** All state slices must be JSON-serialisable. Enforced by `JSON.stringify` check in development.

**Rejected alternatives:**
- *Plugins declare serialise/deserialise pairs* — every plugin author must think about serialisation. Bugs are subtle and inconsistent.
- *No constraint, document best practices* — will be violated within weeks.

**Why:** One constraint replaces all serialisation logic everywhere. Save/load, replay, multiplayer, debugging — all solved by the same rule.

---

### Plugin-namespaced frontmatter config — 2026-06-25

**Chosen:** Each plugin reads only its own config block, keyed by sliceName. Core routes at init time.

**Rejected alternatives:**
- *Single flat config* — plugins must know each other's keys to avoid collisions.
- *Plugins receive full config* — semantically wrong; plugins should not read other plugins' config.

**Why:** Plugin isolation. A plugin author writes config without knowing other plugins exist.

---

### Mandatory logic/renderer split — 2026-06-25

**Chosen:** Every plugin ships `logic.js` (no DOM) and `renderer.js` (may use DOM). Enforced at build time.

**Rejected alternatives:**
- *Soft convention* — will be violated. Bugs caused are hard to trace.
- *Separate packages per plugin* — considered seriously (Codemirror 6 pattern). Not rejected outright. Revisit if two-file approach proves insufficient.

**Why:** Server-side validation and off-thread AI require logic without a browser. Build-time enforcement catches violations immediately.

---

### Visual themes in render layer, not plugins — 2026-06-26

**Chosen:** Themes are CSS variable maps and background assets in the render layer. No slice, no init, no move pipeline participation.

**Rejected alternatives:**
- *plugin-dungeon-skin* — fails the three-game test. Only one game uses it. A plugin used by only one game is a hardcoded assumption in disguise.
- *plugin-presentation with registered themes* — no state slice, no effect on game logic. Plugin in name only.

**Why:** The line between theme and plugin is whether it affects game state. Themes don't. Making them plugins creates false equivalence between visual decoration and game logic.

---

### Terrain as plugin-terrain, not a theme — 2026-06-26

**Chosen:** Terrain is a state slice. Participates in move pipeline and event bus.

**Rejected alternatives:**
- *Hardcode terrain per game* — same concept implemented three times (DC portals, Endless Skies wormholes, Tafl throne). Bug fixes must be made three times.
- *Terrain as a theme layer* — terrain affects legal moves. That is game logic. Game logic in the render layer violates the Worker boundary.

**Why:** Terrain is the same concept across many games — a position type that affects movement and triggers effects. Implementing once means every future game gets the full system for free.

---

### Six layers, not two — 2026-06-26

**Chosen:** Core / Render / Topology / Piece-behaviour / AI / Plugins.

**Rejected alternatives:**
- *grid-square = moddable-chess, grid-hex = moddable-hexmaps* — both repos contain multiple separable concerns. moddable-chess alone contains board state, move generation, piece definitions, rendering, AI, session management, and website UI — eight different things. One plugin bundles all eight.
- *Three layers: core / plugins / configs* — without topology and piece-behaviour layers, either core hardcodes grid assumptions or every plugin reimplicates them.

**Why:** Layer count determined by concerns that exist. Each layer has exactly one reason to change. No ripple effects up or down.

---

### moddable-engine develops in isolation — 2026-06-26

**Chosen:** moddable-engine is built in a completely isolated monorepo. Existing repos (moddable-chess, moddable-hexmaps, moddable-rules, dungeon-chess) continue unchanged until each migration phase is proven. Existing repos are not deprecated, frozen, or modified until moddable-engine demonstrably replaces each concern. See section 11a for the full cutover test.

**Rejected alternatives:**
- *Migrate in-place* — refactor moddable-chess directly into the new architecture. Rejected: breaks the nightly pipeline during migration. Any regression ships immediately to production. There is no safe fallback.
- *Feature-flag migration* — keep old and new code in the same repo behind flags. Rejected: doubles the code surface during transition. Flags accumulate and are never cleaned up. Testing both paths simultaneously is error-prone.
- *Big-bang cutover* — build everything, then switch all repos at once. Rejected: the highest-risk approach. If any phase fails, everything fails together. No incremental validation.

**Why:** Isolation is the only approach where a failed or stalled phase does not block any other work, existing users are never affected, and each phase can be independently proven before being adopted. The existing repos become the acceptance test suite — identical output after migration means migration succeeded.
