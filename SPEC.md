# moddable-engine — Phase 1 Architecture Spec

**Status:** Agreed 2026-06-26. Implementation complete for core, topologies, schema, play, and plugins. The rule composition layer (section 0.6) is built and tested but not yet consumed by plugins (#88). The phase model described in moddable-ops#28 was retired; current state is tracked in moddable-ops#87.

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

**Replaceability:** If plugin-chess needs to be replaced or upgraded, nothing in Layers 0–2 changes. If topology-grid needs to change its internal coordinate representation, plugins adapt but core is untouched. Keeping dependencies downward-only preserves this.

When a future decision asks "should X depend on Y?" — check the layer order. If Y is above X, the answer is no. Find a way to invert the dependency through the registry or event bus.

### 0.4 Why plugins communicate through the registry, not imports

It would be simpler for plugin-chess to directly import topology-grid and call its functions. We explicitly chose not to allow this. The reason:

Direct imports create hard dependencies. If plugin-chess imports topology-grid, then its piece movement code cannot work with hex boards (which use topology-hex). But the same knight leap is valid on both grid and hex boards — Glinski hex chess proves this. If we hardcode the topology dependency, we've made piece movement a grid-only concept by accident.

By communicating through the registry (`registry.request('topology.getNeighbours')`), piece-behaviour works with any topology that provides that capability. It doesn't know or care whether it's running on topology-grid or topology-hex.

**The rule:** if a plugin would break when used without a specific topology, it has a hardcoded assumption that should be expressed through the registry instead.

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

Making themes into plugins would create the illusion that visual presentation is on the same level as game logic. It isn't. A wood-grain board theme does not affect whether a move is legal. The line between theme and plugin is: **does it affect what is true about the game state?** If yes, it's a plugin. If no, it's a theme.

### 0.7 Why special squares are game logic, not themes

Because special squares affect what is true about the game state. In Tafl, the throne square has occupancy rules. In Surakarta, the loops enable special captures. In morris games, mills trigger removal. These are not visual facts — they are game facts.

Had we made special squares a theme (pure visual), we would have needed to reimplement movement-blocking and landing-effect logic in every game that uses them. Tafl would have its own throne system. Surakarta would have its own loop system. Both are the same concept — a position with special rules — and should share one implementation.

### 0.8 Why the "easiest route" is often wrong

Many of the decisions in this spec required more initial work than the obvious alternative. Making special squares a shared concept is more work than hardcoding "throne blocks movement" into a single Tafl variant file. Making themes render-layer config is more work than making them plugins. Separating topology from piece-behaviour is more work than keeping them together.

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

### 0.10 The complexity tests

The architecture is validated by its hardest consumers. Four-player shogi requires N-player rotation and per-player directional vectors. Djambi requires accumulating corpses, forced placement phases, and control transfer between players. Taikyoku shogi has 36×36 boards and 208 piece types. Glinski hex chess proves topology-agnostic piece movement.

If the architecture can express these games entirely in frontmatter config — with minimal hand-written plugin code — then it is general enough for everything simpler. The goal is a system where any game we design is a configuration of existing components, not a new codebase.

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

### Phase convention
A plugin with a setup/placement phase exposes `phase` on its state slice.
The game controller skips game-end checks when `slice.phase` is present and
not `'play'`. When placement completes, the plugin sets `phase: 'play'`
(or removes it) and normal play begins.

```js
// In plugin init:
state.phase = 'placement'

// In action apply (when placement completes):
return { board, sliceKeys: { phase: 'play' } }
```

This is the single home for phase state. The controller reads it generically
from `game.getState(plugin.sliceName).phase`. Do not use `_phase`,
`_setupStage`, or any other field name — the controller will not find it.

### Optional: positionKey
A plugin may expose `positionKey(sliceState, playerIndex) → string` for AI
transposition table efficiency. Without it, the search hashes the full JSON
state (~1000+ chars). With it, chess returns a 64-char FEN derivative.

### Phase lifecycle (future)
Core-owned phase sequences for multi-phase games. Not yet implemented.
```yaml
phases: [play]                          # standard chess
phases: [placement, play]               # sittuyin (place pieces, then play)
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
themeRegistry.register('wood', {
  cssVars: { '--board-bg': '#8b4513', '--light-square': '#deb887', '--dark-square': '#a0522d' },
})
```

Selected via frontmatter `surface.theme: wood`. **Themes are not plugins** — no slice, no init, no applyMove.

### Annotation protocol
Shared interface all topology renderers implement — ensures visual consistency across all games:
```js
{ highlight(coord, colour, opacity), arrow(from, to, colour), label(coord, text, style), marker(coord, type) }
```

### Worker boundary
All game logic (Layers 0–4) runs in a Web Worker. All rendering (Layer 1) runs in the main thread. Enforced at build time — any Layer 0–4 file referencing `window` or `document` fails the build.

---

## 5. Layer 2 — Topologies

Coordinate systems and geometry. Each implements the core coordinate protocol. None knows what game it is for.

```
packages/topologies/grid/
  ← integer index (row * cols + col), FEN, terrain mask, wrap flags
  Used by: chess, draughts, go, reversi, shogi, xiangqi, halma

packages/topologies/hex/
  ← axial {q,r}, neighbours, distance, rings, line-of-sight
  Used by: hex chess (Glinski, etc.), connection games (Hex, Y)

packages/topologies/track/
  ← named positions, adjacency, circuit detection, direction
  Used by: backgammon, pachisi, chaupar, landlord's game

packages/topologies/pit/
  ← pit identifiers, sequence order, store positions, sowing direction
  Used by: all mancala variants (oware, kalah, etc.)

packages/topologies/graph/
  ← arbitrary node/edge declarations, adjacency by name
  Used by: morris games (nine/six/three men's)

packages/topologies/tableau/
  ← card table layouts: radial, tableau, wall, linear
  Used by: big 2, mahjong, hanafuda, dominoes
```

---

## 6. Layer 3 — Piece Behaviour

Piece logic and asset resolution. Topology-agnostic — all movement primitives are parameterised by topology.

```
packages/piece-behaviour/
  rider.js    ← slides in a direction until blocked (rook, bishop, queen)
  leaper.js   ← jumps to specific offset (knight, zebra, camel)
  hopper.js   ← jumps over exactly one piece (cannon, grasshopper)
  locust.js   ← captures by jumping over victim (draughts)
  compose.js  ← combines primitives (amazon = queen + knight)
  divergent.js ← different move vs capture (pawn, vao)
  lame.js     ← blockable leaps (elephant, horse in xiangqi)
```

---

## 7. Layer 4 — AI

Search and evaluation infrastructure. Zero game knowledge — calls hooks provided by the game plugin.

```
packages/ai/
  minimax.js        ← negamax with alpha-beta pruning, transposition table
  mcts.js           ← Monte Carlo tree search for games without good evaluators
  quiescence.js     ← extends search through tactical sequences
  evaluators.js     ← material, mobility, position — game provides weights
  opening-book.js   ← configurable opening database
  difficulty.js     ← skill levels via search depth + random blunders
```

Any game that provides an evaluator function gets AI for free. Currently supports chess (all variants), go, draughts, reversi.

---

## 8. Layer 5 — Plugins

Game family plugins assemble shared infrastructure. No plugin reimplements anything in Layers 0–4.

```
packages/plugins/
  chess/      ← 75+ variants: standard, hex, 4-player, fairy, xiangqi-family
  go/         ← standard go, atari-go
  draughts/   ← 20 variants: international, brazilian, turkish, frisian
  reversi/    ← standard, anti-reversi
  mancala/    ← kalah, oware
  morris/     ← nine/six/three men's morris
  backgammon/ ← standard, nackgammon
  hex/        ← Hex connection game, Y
  halma/      ← chinese checkers, stern-halma
  shogi/      ← standard, mini, 4-player, large variants
  xiangqi/    ← standard, banqi
  race/       ← pachisi, chaupar, landlord's game
  big2/       ← big 2, president
```

### Components (non-spatial game elements)

```
packages/component-deck/   ← standard-52 card operations, deal, shuffle
packages/component-dice/   ← roll, doubles detection, expression parser ("2d6+3")
```

---

## 9. Layer 6 — Game configs (frontmatter only, no code)

A variant is one markdown file in [moddable-rules](https://github.com/Moddable-Games/moddable-rules)
at `games/<family>/content/variants/<slug>.md`, or `games/<family>/content/rulebook.md`
for the family hub. The filename is the slug. Everything the engine reads lives under
`engine:`; everything outside it is metadata for the site.

See [docs/authoring.html](docs/authoring.html) for the full authoring guide.

### A variant

```yaml
---
title: Oware
slug: oware
parent: mancala
board: "2×6 pits"
players: "2"
win: Capture more than 24 seeds
engine:
  topology:
    type: pit
    cols: 6
    stores: false
  players: [south, north]
  render:
    cellSize: 24
  setup: "4,4,4,4,4,4;0;4,4,4,4,4,4;0"
---

## Oware

Sow seeds anticlockwise and capture from the opponent's row.
```

### A family hub

The hub carries the defaults every variant in the family inherits. A variant declaring
the same key overrides it.

```yaml
---
title: "Backgammon — Official Rulebook"
slug: "backgammon"
mechanics: [dice, race, capture, track, push-your-luck, betting]
engine:
  topology:
    type: track
    shape: linear
    positions: 24
  surface:
    colors:
      board-outer: "#3a2416"
      felt: "#1f4d3a"
      point-a: "#d9c5a0"
      point-b: "#8c3b2f"
---
```

### A variant with new pieces

Movement definitions live under `engine.plugins.<family>.pieces`, and the symbols that
represent them under `engine.vocabulary`, keyed by owner index. Note that `engine.pieces`
is a different key: it selects the artwork set.

```yaml
---
title: Zebra Chess
slug: zebra-chess
parent: chess
playable: true
engine:
  topology: { type: grid, rows: 8, cols: 8 }
  players: [white, black]
  setup: "rzbqkbzr/pppppppp/8/8/8/8/PPPPPPPP/RZBQKBZR"
  pieces:
    set: wikimedia-standard
  vocabulary:
    zebra:
      symbols: { 0: Z, 1: z }
  plugins:
    chess:
      castling: false
      pieces:
        zebra:
          type: leaper
          offsets: [[2,3],[3,2],[-2,3],[-3,2],[2,-3],[3,-2],[-2,-3],[-3,-2]]
---
```

### Structural versus rule keys

Keys under `engine:` divide in two, and the split decides where a value is consumed.

**Structural** — `topology`, `players`, `surface`, `render`, `pieces`, `components`,
`meta`, `plugins`. Read by the topology and render layers.

**Rule** — everything under `engine.plugins.<family>`. Passed to that family's plugin as
its config. Each family page documents its own set.

A non-structural key written at the top of `engine:` is folded into the plugin config and
**overrides** the same key inside the plugin block. Prefer to write rule keys in the
plugin block only.

---

## 10. Repo structure

See CLAUDE.md for the full current structure. Key directories:

```
packages/
  core/               ← Layer 0: event-bus, rng, timer, state-store, history, move-pipeline
  render/             ← Layer 1: layer compositor, SVG builder
  topologies/         ← Layer 2: grid, hex, track, pit, graph, tableau
  piece-behaviour/    ← Layer 3: movement primitives (rider, leaper, hopper, etc.)
  ai/                 ← Layer 4: minimax, MCTS, evaluators
  plugins/            ← Layer 5: chess, go, draughts, mancala, etc. (13 families)
  schema/             ← frontmatter parser, validator, producer
  play/               ← universal game factory (single import for all families)
  component-deck/     ← card operations
  component-dice/     ← dice operations
```

---

## 11. Related repos

| Repo | Relationship |
|---|---|
| moddable-rules | Source of truth for variant frontmatter. Engine reads from it. |
| moddable-chess | Being deprecated. Engine's chess plugin supersedes it. |
| moddable-hexmaps | Being deprecated. Engine's hex topology supersedes it. |

---

## 14. Decisions log

Every significant decision recorded with alternatives considered and why they were rejected. Exists so future decisions can be made consistently with the same philosophy.

---

### Shared state store with owned slices — 2026-06-25

**Chosen:** One central state object. Each plugin owns a named slice. Any plugin may read any slice. Only the owning plugin writes its slice. Always plain JSON.

**Rejected alternatives:**
- *Event bus only* — hard to trace, difficult to reason about ordering, replay is complex, async events create subtle bugs in turn-based games.
- *Direct plugin-to-plugin API calls* — creates hard inter-plugin dependencies. A plugin calling topology-grid directly means it can never work with topology-hex.
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
- *theme-as-plugin* — fails the three-game test. A plugin used by only one game is a hardcoded assumption in disguise.
- *plugin-presentation with registered themes* — no state slice, no effect on game logic. Plugin in name only.

**Why:** The line between theme and plugin is whether it affects game state. Themes don't. Making them plugins creates false equivalence between visual decoration and game logic.

---

### Special squares as game logic, not themes — 2026-06-26

**Chosen:** Special squares (throne, corner, loops) are game logic. They participate in move validation.

**Rejected alternatives:**
- *Hardcode per game* — same concept implemented separately in Tafl (throne), Surakarta (loops), morris (mills). Bug fixes must be made multiple times.
- *As a theme layer* — special squares affect legal moves. That is game logic. Game logic in the render layer violates the Worker boundary.

**Why:** Special squares are the same concept across many games — a position type that affects movement and triggers effects. Implementing once means every future game gets the full system for free.

---

### Six layers, not two — 2026-06-26

**Chosen:** Core / Render / Topology / Piece-behaviour / AI / Plugins.

**Rejected alternatives:**
- *grid-square = moddable-chess, grid-hex = moddable-hexmaps* — both repos contain multiple separable concerns. moddable-chess alone contains board state, move generation, piece definitions, rendering, AI, session management, and website UI — eight different things. One plugin bundles all eight.
- *Three layers: core / plugins / configs* — without topology and piece-behaviour layers, either core hardcodes grid assumptions or every plugin reimplicates them.

**Why:** Layer count determined by concerns that exist. Each layer has exactly one reason to change. No ripple effects up or down.

---

### moddable-engine develops in isolation — 2026-06-26

**Chosen:** moddable-engine is built in a completely isolated monorepo. Existing repos (moddable-chess, moddable-hexmaps) continue unchanged until moddable-engine demonstrably replaces each concern.

**Rejected alternatives:**
- *Migrate in-place* — refactor moddable-chess directly into the new architecture. Rejected: breaks the nightly pipeline during migration.
- *Feature-flag migration* — keep old and new code in the same repo behind flags. Rejected: doubles the code surface during transition.
- *Big-bang cutover* — build everything, then switch all repos at once. Rejected: the highest-risk approach.

**Why:** Isolation is the only approach where a failed phase does not block other work, existing users are never affected, and each phase can be independently proven before being adopted.

---

### Canonical variant patterns — 2026-08-03

Two shapes exist. Copy the correct one.

**Pure-config variant (no functions):** `packages/plugins/chess/src/variants/capablanca.js`

- One export, named for the variant
- Contains only: `key`, `rows`, `cols`, `setup`, `pieces`, `vocabulary`, `promotionChoices`, flags (`castling`, `enPassant`, etc.)
- No functions of any kind
- **Target state:** this data moves to the `.md` frontmatter in moddable-rules; the JS file is deleted. The playability manifest registers it. No engine file.

**Function variant (needs JS):** `packages/plugins/chess/src/variants/king-of-the-hill.js`

- One export, named for the variant
- One file per variant — never bundle multiple variants in one file
- Contains a `winCondition`, `moveFilter`, `afterMove`, or other hook function that cannot be expressed as data
- Returns player indices (0, 1) or `'draw'`, never colour strings

**Anti-patterns (do not copy):**
- `custom-pieces.js` — bundles 9 unrelated variants in one file
- `win-condition.js` — same: 6 variants in one file
- `filter-variants.js` — same: 8 variants in one file
- Any variant returning `'white'`/`'black'`/`'player1'` from a win check
