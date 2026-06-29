# PRD — Phase 2: @moddable/core (revised)

**Status:** Draft — awaiting Mark's review
**Repo:** `Moddable-Games/moddable-engine`
**Output path:** `packages/core/`
**Depends on:** Phase 1 (SPEC.md agreed)
**Unblocks:** All other phases — every plugin, topology, and piece-behaviour package imports from core
**Spec reference:** SPEC.md sections 1, 3, 11a

---

## Why this PRD was rewritten

The original PRD was validated only against chess. Core must prove it works for
ALL game types before a single line of implementation code is written. This
revision adds 7 proof games spanning every topology and turn model in the engine.
If core cannot express all 7, the interfaces are wrong.

---

## What this phase delivers

A single npm package — `@moddable/core` — containing nine game-agnostic
primitives. No game-specific knowledge anywhere. No board concepts. No piece
concepts. No rendering.

The test for correct scope: you should be able to describe every file in this
package without mentioning chess, hexmaps, draughts, or any other game.

---

## Critical interface decisions

### 1. Moves are opaque

Core never inspects move contents. A move is whatever the plugin says it is.

- Chess: `{ from: 0, to: 16 }`
- Mancala: `{ pit: 3 }`
- Go: `{ coord: { q: 4, r: 7 }, action: 'place' }`
- Backgammon: `{ actions: [{ from: 12, to: 7 }, { from: 7, to: 2 }] }`
- Big 2: `{ cards: ['S-A', 'H-A'], action: 'play' }`
- Morris: `{ phase: 'place', coord: 'a1' }`

Core passes moves to plugins. Core never parses, validates structure, or assumes
fields. This is what makes one move pipeline work for every game.

### 2. Topology is an interface, not part of core

Core defines the coordinate protocol (5 methods). Implementations live in
topology-* packages. Plugins call topology via the registry. Core has zero
knowledge of grids, hexes, tracks, pits, or graphs.

### 3. State store with owned slices

Each plugin owns a named slice. Any plugin reads any slice. Only the owner
writes. Always JSON-serialisable. This solves save/load, replay, multiplayer
sync, and debugging with one constraint.

### 4. Turn structure is plugin-configured

The player system supports:
- **Sequential** — chess, Go, Morris (alternating turns)
- **Multi-action** — backgammon (multiple moves per turn from dice)
- **Forced-chain** — mancala, draughts (must continue capturing)
- **Phase-based** — Morris (placement phase then movement phase)
- **Pass-to-end** — Go (both pass = game over)
- **Simultaneous** — Big 2 style (play or pass in rotation)

Core provides the primitives. Plugins compose them.

### 5. Undo via full state snapshots

Every history entry stores `stateBefore` and `stateAfter`. Undo restores
`stateBefore` directly. Correct for all games including irreversible moves
(Draughts captures, Atomic explosions, mancala sowing). No game-specific undo
logic needed.

### 6. Effects are NOT in core

Effects (timed board modifiers, spell durations, terrain activations) are plugin
state. Core provides the event bus for signalling. Plugins manage their own
effect lifecycles in their own state slices.

---

## The 7 proof games

Phase 2 is complete when mock plugins for all 7 games run correctly against
core. Each game proves a different capability that chess alone cannot validate.

### Game 1: Chess (grid-square topology)

**What it proves:** From-to displacement moves, piece capture, check/checkmate
win condition, promotion as a move modifier. Variant: 4-player (proves N-player
turn advancement).

**Mock plugin sketch:**
```js
export default {
  sliceName: 'chess',
  init(config, registry) {
    const topology = registry.request('topology.grid')
    return { board: parseFEN(config.startFen), captured: [] }
  },
  applyMove(move, slice, full) {
    // move = { from: 0, to: 16, promotion?: 'q' }
    const newBoard = [...slice.board]
    newBoard[move.to] = newBoard[move.from]
    newBoard[move.from] = null
    return { ...slice, board: newBoard }
  },
  getLegalMoves(slice, full) {
    // Returns all { from, to } pairs for current player's pieces
  },
  checkWin(slice, full) {
    // Returns winner if opponent king has no escape
    return null
  }
}
```

**Core capabilities exercised:** move-pipeline (full cycle), state-store (board
array in slice), player-system (2 or 4 player sequential), history (undo a
capture restores piece), event-bus (`move.applied`).

---

### Game 2: Go (grid-square topology, placement-only)

**What it proves:** Placement moves (no from-to), group capture (removing
multiple stones after a single move), territory scoring as win condition,
pass-to-end turn model, ko rule (requires history awareness).

**Mock plugin sketch:**
```js
export default {
  sliceName: 'go',
  init(config, registry) {
    return { intersections: new Array(config.size * config.size).fill(null), passes: 0, ko: null }
  },
  applyMove(move, slice, full) {
    // move = { coord: 45, action: 'place' } or { action: 'pass' }
    if (move.action === 'pass') return { ...slice, passes: slice.passes + 1 }
    const newState = { ...slice, passes: 0, intersections: [...slice.intersections] }
    newState.intersections[move.coord] = full.players.current
    // Remove captured groups, update ko
    return newState
  },
  getLegalMoves(slice, full) {
    // All empty intersections minus ko point and suicide
  },
  checkWin(slice, full) {
    if (slice.passes >= 2) return scoreTerritory(slice)
    return null
  }
}
```

**Core capabilities exercised:** player-system (`pass()` — both pass ends game),
state-store (large flat array), history (ko detection via previous state
comparison), move-pipeline (placement move with no `from` field).

---

### Game 3: Backgammon (track topology, dice-driven multi-action)

**What it proves:** Dice rolls determining available moves, multiple actions per
turn (2-4 moves from one roll), track-based topology (linear positions, no grid),
race win condition (all pieces borne off), direction-of-travel per player.

**Mock plugin sketch:**
```js
export default {
  sliceName: 'backgammon',
  init(config, registry) {
    const rng = registry.request('core.rng')
    return { points: initialPosition(), bar: [0, 0], borneOff: [0, 0], dice: [], movesRemaining: [] }
  },
  applyMove(move, slice, full) {
    // move = { from: 12, to: 7 } (single action within a turn)
    // After each action, decrement movesRemaining
    const newSlice = { ...slice, points: [...slice.points] }
    // Move checker, handle hitting opponent
    newSlice.movesRemaining = slice.movesRemaining.filter((_, i) => i !== move.dieIndex)
    return newSlice
  },
  getLegalMoves(slice, full) {
    // For each remaining die value, all legal from-to pairs
  },
  checkWin(slice, full) {
    if (slice.borneOff[0] === 15) return full.players.list[0]
    if (slice.borneOff[1] === 15) return full.players.list[1]
    return null
  }
}
```

**Core capabilities exercised:** rng (seeded dice), player-system (multi-action
turn — advance only when movesRemaining is empty), state-store (bar, points,
borneOff as separate arrays), event-bus (`dice.rolled` custom event for
renderer).

---

### Game 4: Mancala/Oware (pit topology, sowing, chaining)

**What it proves:** Sowing mechanic (distributing seeds around pits), no pieces
(seeds are counts, not individual entities), forced chaining (if last seed lands
in non-empty pit, continue sowing), count-based capture (capture when final pit
reaches specific count), pit topology (circular sequence, not a grid).

**Mock plugin sketch:**
```js
export default {
  sliceName: 'mancala',
  init(config, registry) {
    // config = { pits: 6, seeds: 4, stores: 2 }
    const pits = new Array(config.pits * 2).fill(config.seeds)
    return { pits, stores: [0, 0], sowingFrom: null }
  },
  applyMove(move, slice, full) {
    // move = { pit: 3 }
    const newSlice = { ...slice, pits: [...slice.pits], stores: [...slice.stores] }
    let seeds = newSlice.pits[move.pit]
    newSlice.pits[move.pit] = 0
    let pos = move.pit
    while (seeds > 0) {
      pos = (pos + 1) % newSlice.pits.length
      newSlice.pits[pos]++
      seeds--
    }
    // Capture logic: if last seed makes count 2 or 3 in opponent row
    return newSlice
  },
  getLegalMoves(slice, full) {
    // All non-empty pits on current player's side
    // If opponent's side is empty, must feed if possible
  },
  checkWin(slice, full) {
    // Game ends when one side is empty; most seeds in store wins
    return null
  }
}
```

**Core capabilities exercised:** state-store (counts, not piece objects),
player-system (sequential but with forced-feed rule), move-pipeline (single
field move `{ pit: 3 }`), history (sowing is irreversible without snapshots —
proves snapshot undo works).

---

### Game 5: Nine Men's Morris (graph topology, phase transitions)

**What it proves:** Phase-based gameplay (placement phase then movement phase),
graph topology (24 named nodes with explicit adjacency, not a grid), mill
detection as a triggered effect (forming a line of 3 grants a removal action),
compound moves (place/move + optional remove), isolation win condition (opponent
has no legal moves OR fewer than 3 pieces).

**Mock plugin sketch:**
```js
export default {
  sliceName: 'morris',
  init(config, registry) {
    // 24 nodes, explicit adjacency graph
    return { nodes: Object.fromEntries(POSITIONS.map(p => [p, null])), phase: 'place', piecesInHand: [9, 9] }
  },
  applyMove(move, slice, full) {
    // Placement: move = { action: 'place', coord: 'a1' }
    // Movement: move = { action: 'move', from: 'a1', to: 'd1' }
    // Mill removal: move = { action: 'remove', coord: 'g7' }
    const newSlice = { ...slice, nodes: { ...slice.nodes } }
    if (move.action === 'place') {
      newSlice.nodes[move.coord] = full.players.current
      newSlice.piecesInHand[currentIdx]--
      if (newSlice.piecesInHand.every(n => n === 0)) newSlice.phase = 'move'
    }
    return newSlice
  },
  getLegalMoves(slice, full) {
    // Depends on phase: empty nodes (place) or adjacent empty (move) or fly (<=3 pieces)
  },
  checkWin(slice, full) {
    // Opponent has < 3 pieces OR no legal moves
    return null
  }
}
```

**Core capabilities exercised:** state-store (phase field driving different move
sets), player-system (compound turn: place/move then conditional remove),
move-pipeline (3 different move shapes from one plugin), event-bus
(`mill.formed` triggers removal sub-turn).

---

### Game 6: Hex (hex topology, connection win)

**What it proves:** Hex coordinate system (axial {q, r}), placement-only (like
Go but different topology), connection-based win condition (path from one side
to the opposite side), no draws possible (every game has a winner), topology
providing neighbours in 6 directions.

**Mock plugin sketch:**
```js
export default {
  sliceName: 'hex',
  init(config, registry) {
    const topology = registry.request('topology.hex')
    // config = { size: 11 }
    return { cells: {}, size: config.size }
  },
  applyMove(move, slice, full) {
    // move = { q: 3, r: 5 }
    const key = `${move.q},${move.r}`
    return { ...slice, cells: { ...slice.cells, [key]: full.players.current } }
  },
  getLegalMoves(slice, full) {
    // All empty hex cells
  },
  checkWin(slice, full) {
    // BFS/DFS: does current player have a connected path from their start edge to end edge?
    return hasWinningPath(slice, full.players.current) ? full.players.current : null
  }
}
```

**Core capabilities exercised:** coordinate-protocol (hex topology via registry),
state-store (sparse object map keyed by coordinate string), player-system
(simple 2-player alternation), move-pipeline (single-field placement),
history (simple but proves hex coords serialise cleanly via toJSON/fromJSON).

---

### Game 7: Big 2 / Dai Di (no topology, cards, 4-player)

**What it proves:** No spatial topology at all (hand-only card game), 4-player
rotation, combination comparison (poker hands ranked by game-specific rules),
passing mechanic (pass until all others pass, then reset), non-spatial state
(hands, discard pile, last played combination), variable-size moves (1, 2, 3,
or 5 cards per play).

**Mock plugin sketch:**
```js
export default {
  sliceName: 'big2',
  init(config, registry) {
    const rng = registry.request('core.rng')
    const deck = shuffle(STANDARD_52, rng)
    return {
      hands: [deck.slice(0,13), deck.slice(13,26), deck.slice(26,39), deck.slice(39,52)],
      lastPlay: null,
      lastPlayer: null,
      consecutivePasses: 0
    }
  },
  applyMove(move, slice, full) {
    // move = { cards: ['S-A', 'H-A'], action: 'play' } or { action: 'pass' }
    if (move.action === 'pass') {
      const newSlice = { ...slice, consecutivePasses: slice.consecutivePasses + 1 }
      if (newSlice.consecutivePasses >= 3) {
        newSlice.lastPlay = null  // Reset — next player plays freely
        newSlice.consecutivePasses = 0
      }
      return newSlice
    }
    const playerIdx = full.players.currentIndex
    const newHands = slice.hands.map((h, i) => i === playerIdx ? h.filter(c => !move.cards.includes(c)) : h)
    return { ...slice, hands: newHands, lastPlay: move.cards, lastPlayer: playerIdx, consecutivePasses: 0 }
  },
  getLegalMoves(slice, full) {
    // All combinations from hand that beat lastPlay (or any if lastPlay is null)
    // Plus { action: 'pass' } unless you won the last round
  },
  checkWin(slice, full) {
    const empty = slice.hands.findIndex(h => h.length === 0)
    return empty >= 0 ? full.players.list[empty] : null
  }
}
```

**Core capabilities exercised:** player-system (4-player sequential, pass
tracking), state-store (arrays of card strings, no spatial data), rng (seeded
shuffle for deterministic replay), move-pipeline (variable-shape moves — 1 to 5
cards), history (full snapshot needed because cards leave hands permanently),
NO topology (proves core has zero spatial assumptions).

---

## What the 7 games prove collectively

| Core module | Games that exercise it |
|---|---|
| coordinate-protocol | Chess, Go, Hex, Morris (4 different topologies) |
| state-store | All 7 (every game owns a slice) |
| move-pipeline | All 7 (every game validates/applies/checks) |
| player-system | Chess-4P, Big 2 (4-player), Backgammon (multi-action), Go (pass), Morris (compound) |
| history | All 7 (snapshot undo), Go (ko detection), Backgammon (mid-turn undo) |
| event-bus | Morris (mill.formed), Backgammon (dice.rolled), all (move.applied) |
| rng | Backgammon (dice), Big 2 (shuffle) |
| timer | Chess (clock), Backgammon (move timer) |
| plugin-registry | All 7 (register + provide/request) |

If any module is unused by any game, the module is either wrong or unnecessary.
If any game cannot be expressed, the interfaces need revision before implementation.

---

## Package structure

```
packages/core/
  src/
    coordinate-protocol.js
    state-store.js
    move-pipeline.js
    player-system.js
    history.js
    event-bus.js
    rng.js
    timer.js
    plugin-registry.js
  index.js
  package.json
  __tests__/
    coordinate-protocol.test.js
    state-store.test.js
    move-pipeline.test.js
    player-system.test.js
    history.test.js
    event-bus.test.js
    rng.test.js
    timer.test.js
    plugin-registry.test.js
    proof-chess.test.js
    proof-go.test.js
    proof-backgammon.test.js
    proof-mancala.test.js
    proof-morris.test.js
    proof-hex.test.js
    proof-big2.test.js
```

The 7 `proof-*.test.js` files ARE the acceptance tests. Each instantiates core,
registers its mock plugin, and plays through a short game scenario proving the
core interfaces work for that game type.

---

## File-by-file specification

### coordinate-protocol.js

An interface definition (not an implementation). Defines the contract every
topology must satisfy.

```js
export const CoordinateProtocol = {
  neighbours(coord, state) -> coord[],
  isValid(coord, state) -> boolean,
  toJSON(coord) -> string,
  fromJSON(str) -> coord,
  distance(a, b, state) -> number,
}

export function assertImplements(topology) -> void  // throws if missing methods
```

Does not contain any implementation, board-size assumptions, or coordinate format.

### state-store.js

Central state container with owned slices per plugin.

```js
export function createStore(initialSlices = {}) -> store

store = {
  get(sliceName) -> sliceState,
  set(sliceName, newSliceState) -> void,
  getAll() -> fullState,
  fromSnapshot(snapshot) -> void,
  subscribe(sliceName, fn) -> unsubscribe,
  claimSlice(sliceName, owner) -> void,
  assertOwner(sliceName, caller) -> void,
}
```

JSON constraint: after every `set()` in development, runs `JSON.stringify`. If
it throws, `set()` throws identifying the plugin and non-serialisable value.
Stripped in production.

### move-pipeline.js

The sequence every move goes through, regardless of game.

```js
export function createPipeline(registry, store, history, playerSystem, eventBus) -> pipeline

pipeline = {
  execute(move) -> { ok: true, winner } | { ok: false, reason },
  getLegalMoves() -> move[],
}
```

Steps: validate -> apply -> record -> check-win -> advance-turn -> emit event.

### player-system.js

```js
export function createPlayerSystem(config) -> playerSystem

// config = { players: ['white', 'black'], turnMode: 'sequential' | 'custom' }

playerSystem = {
  current(store) -> playerId,
  advance(store) -> void,
  pass(store) -> void,
  forceTurn(playerId, store) -> void,
  isCurrentPlayer(playerId, store) -> boolean,
  getAll(store) -> playerId[],
  getPlayerCount() -> number,
  getCurrentIndex(store) -> number,
}
```

### history.js

```js
export function createHistory() -> history

history = {
  record(move, stateBefore, stateAfter) -> entry,
  undo(store) -> move | null,
  redo(store) -> move | null,
  replay(entries, store) -> void,
  getEntries() -> entry[],
  toJSON() -> string,
  fromJSON(str, store) -> void,
  getCurrent() -> entry | null,
  length() -> number,
}

// entry = { move, stateBefore, stateAfter, timestamp, moveNumber }
```

### event-bus.js

```js
export function createEventBus() -> bus

bus = {
  emit(eventType, payload) -> void,
  on(eventType, handler) -> unsubscribe,
  off(eventType, handler) -> void,
  once(eventType, handler) -> void,
  clear(eventType?) -> void,
}
```

Built-in events emitted by core: `move.applied`, `game.started`, `game.ended`,
`phase.started`, `phase.ended`, `turn.started`.

### rng.js

```js
export function createRng(seed?) -> rng

rng = {
  next() -> number,           // [0, 1)
  nextInt(min, max) -> number, // [min, max] inclusive
  nextChoice(arr) -> item,
  shuffle(arr) -> arr,
  getSeed() -> number,
  fromSeed(seed) -> void,
}
```

Algorithm: xorshift128+. Deterministic from seed.

### timer.js

```js
export function createTimer() -> timer

timer = { start, pause, resume, elapsed, snapshot, restore, reset, onExpiry }
```

No chess clock logic. No per-player timing. Plugins compose multiple timers.

### plugin-registry.js

```js
export function createRegistry() -> registry

registry = {
  register(plugin) -> void,
  provide(capabilityName, fn) -> void,
  request(capabilityName) -> fn | null,
  initAll(config, store) -> void,
  call(methodName, ...args) -> results[],
  requireVersion(packageName, semver) -> void,
}
```

`request()` returns null (never throws) for unregistered capabilities. Plugins
degrade gracefully.

---

## index.js — the public API

```js
export { CoordinateProtocol, assertImplements } from './src/coordinate-protocol.js'
export { createStore }         from './src/state-store.js'
export { createPipeline }      from './src/move-pipeline.js'
export { createPlayerSystem }  from './src/player-system.js'
export { createHistory }       from './src/history.js'
export { createEventBus }      from './src/event-bus.js'
export { createRng }           from './src/rng.js'
export { createTimer }         from './src/timer.js'
export { createRegistry }      from './src/registry.js'
```

No default export. Named factory functions only.

---

## package.json

```json
{
  "name": "@moddable/core",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "exports": { ".": "./index.js" },
  "scripts": { "test": "node --experimental-vm-modules node_modules/.bin/jest" },
  "devDependencies": { "jest": "^29.0.0" }
}
```

No runtime dependencies.

---

## Acceptance criteria

Phase 2 is complete when ALL of the following pass:

- [ ] `packages/core/` exists in moddable-engine
- [ ] All nine source files implemented
- [ ] All unit tests pass
- [ ] All 7 proof game tests pass (proof-chess through proof-big2)
- [ ] JSON constraint enforced and tested (class instance in state throws)
- [ ] `assertImplements` throws for incomplete topology objects
- [ ] `registry.request()` returns null (not throws) for unregistered capabilities
- [ ] `history.fromJSON(history.toJSON())` round-trip test passes
- [ ] `rng.fromSeed(rng.getSeed())` produces identical sequence
- [ ] No file references `document`, `window`, or any DOM API
- [ ] No file references any game name (chess, go, hex, etc.)
- [ ] `npm pack` succeeds with no missing dependencies
- [ ] 4-player turn advancement works (proof-chess 4P variant, proof-big2)
- [ ] Multi-action turn works (proof-backgammon: 2-4 moves per turn)
- [ ] Pass-to-end works (proof-go: both pass ends game)
- [ ] Phase transition works (proof-morris: place phase then move phase)
- [ ] Compound turn works (proof-morris: move + conditional remove)
- [ ] No-topology game works (proof-big2: zero spatial assumptions)

---

## What this phase does NOT do

- Does not modify any existing repo
- Does not implement any real game logic (mock plugins only)
- Does not make any game playable on moddable-engine
- Does not break any existing pipelines
- Does not add rendering, AI, or topology implementations

---

## Implementation order

Each file depends only on what precedes it:

1. `event-bus.js` (no dependencies)
2. `rng.js` (no dependencies)
3. `timer.js` (no dependencies)
4. `coordinate-protocol.js` (no dependencies)
5. `state-store.js` (no dependencies)
6. `player-system.js` (depends on state-store)
7. `history.js` (depends on state-store)
8. `plugin-registry.js` (depends on state-store)
9. `move-pipeline.js` (depends on all of the above)

Write tests alongside each file. The JSON constraint test in state-store is
critical: test that putting a class instance in state throws in dev mode.

After all 9 modules pass their unit tests, write the 7 proof-game tests.
Each proof test instantiates core from scratch, registers the mock plugin,
and plays through a short scenario (5-10 moves minimum) proving the interfaces
work for that game type.

---

## Relationship to existing MCE

Core does not depend on MCE. MCE does not depend on core. They coexist in
isolation until Phase 5, when plugin-grid-square wraps MCE and MCE's implicit
state management is replaced by core primitives.

No migration in this phase. Phase 2 produces a clean standalone package.
Nothing in moddable-chess changes.




