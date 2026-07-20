# Deck Registry Abstraction Spec

## Problem

Component games (cards, dice, dominoes, mahjong) bypass the engine's standard
rendering path. Board games flow through: frontmatter → cascade → topology →
compositor → SVG. Component games use a completely separate pipeline:
hardcoded registry → bespoke renderers (`renderDeckSvg`, `renderMahjongSvg`,
`renderTableauSvg`) → SVG.

This means:
1. Deal specs are hardcoded in engine source (`games: {}` in deck files)
2. A separate code path in play.js (`renderComponentGame`) handles them
3. Three bespoke SVG renderers exist outside the layer compositor
4. Card positions aren't addressable cells (can't be targeted by moves/highlights)
5. Adding a new card game requires engine code changes

The architecture says: ONE path. Surface → topology → pieces. No exceptions.

## Goal

Component games render through the same pipeline as board games. Table layout
is a topology (`topology-tableau`). Deal specs live in frontmatter. The bespoke
renderers are deleted. A new card game variant renders with zero engine changes.

---

## Current state

### Hardcoded deal specs (6 deck files, 28 entries)

| File | Deck type | Games |
|------|-----------|-------|
| `standard-52.js` | `standard-52` | big2, president, poker, blackjack, bridge, canasta, cribbage, euchre, gin-rummy, hearts, klondike, spades |
| `hanafuda-48.js` | `hanafuda-48` | koi-koi, hana-awase, oicho-kabu |
| `mahjong-136.js` | `mahjong-136` | hong-kong, riichi, taiwanese, zung-jung |
| `dominoes-28.js` | `dominoes-28` | block, all-fives, mexican-train |
| `bavarian-32.js` | `bavarian-32` | skat |
| `standard-dice.js` | `standard-dice` | yahtzee, farkle, liars-dice |

### Bespoke renderers (3 files, separate from compositor)

| Renderer | Used by |
|----------|---------|
| `renderDeckSvg()` | Standard cards, hanafuda, bavarian, dominoes, dice (radial table) |
| `renderMahjongSvg()` | Mahjong variants (wall layout) |
| `renderTableauSvg()` | Klondike, freecell, spider (column layout) |

### Separate code path in play.js

`renderComponentGame()` → detects deck type → looks up deal spec from registry
→ calls bespoke renderer. This is ~80 lines of special-case logic that doesn't
exist for board games.

---

## Target state

### topology-tableau: card table as a topology

A new topology package that describes table positions:

```
packages/topology-tableau/
├── src/
│   └── index.js
├── __tests__/
│   └── topology-tableau.test.js
└── package.json
```

The topology provides the same contract as grid/hex/track/pit/graph:

```js
export const schema = {
  type: 'tableau',
  required: ['layout'],
  parseBoard(boardString) { /* ... */ },
  matchBoard(boardString) { /* ... */ },
}

// getLayout() returns cells with positions
export function getLayout(config) {
  // Returns: { getCells(), getDimensions(), getLines() }
  // Cells are: hand-slots, draw-pile, discard, community, tableau-columns
}
```

### Cell types in topology-tableau

| Cell type | Position meaning | Examples |
|-----------|-----------------|----------|
| `hand` | Player's card zone | 4 hands in poker, 4 hands in bridge |
| `community` | Shared face-up zone | 5 cards in poker, 8 in koi-koi |
| `draw` | Face-down draw pile | stock in klondike, boneyard in dominoes |
| `discard` | Face-up discard pile | cribbage crib, hearts trick pile |
| `column` | Tableau column (cascaded) | 7 columns in klondike, 8 in freecell |
| `foundation` | Sorted output pile | 4 foundations in klondike |
| `wall` | Mahjong wall segment | 4 wall sections |

### Layout modes

| Mode | Description | Games |
|------|-------------|-------|
| `radial` | Players around a circular table | poker, hearts, big2, blackjack |
| `tableau` | Columns + foundations + stock | klondike, freecell, spider |
| `mahjong-wall` | 4-wall square with hands | riichi, hong-kong |
| `linear` | Single row (solitaire variants) | war |

### Frontmatter (source of truth)

```yaml
# games/standard-52/content/games/poker/standard.md
engine:
  components:
    deck:
      type: standard-52
      jokers: 0
  topology:
    type: tableau
    layout: radial
  deal:
    minPlayers: 2
    maxPlayers: 10
    defaultPlayers: 6
    perPlayer: 2
    community: 5
    remainder: draw
```

```yaml
# games/standard-52/content/games/klondike/standard.md
engine:
  components:
    deck:
      type: standard-52
      jokers: 0
  topology:
    type: tableau
    layout: tableau
    columns: 7
    cascade: [1, 2, 3, 4, 5, 6, 7]
    foundations: 4
  deal:
    minPlayers: 1
    maxPlayers: 1
    defaultPlayers: 1
    perPlayer: 0
    community: 0
    remainder: draw
```

```yaml
# games/mahjong/content/games/riichi/standard.md
engine:
  components:
    tiles:
      type: mahjong-136
  topology:
    type: tableau
    layout: mahjong-wall
  deal:
    minPlayers: 4
    maxPlayers: 4
    defaultPlayers: 4
    perPlayer: 13
    community: 0
    remainder: wall
    tileSet: mahjong-regular
```

### Rendering through the standard compositor

The layer compositor already does: surface → topology → pieces.

For card games:
- **Surface**: green felt table (declared via `engine.surface`)
- **Topology**: `topology-tableau` provides cell positions (hand zones, piles)
- **Pieces**: cards/tiles/dice placed at topology positions

The render-engine receives the resolved object (which now includes topology
type `tableau`) and routes to the tableau topology's `getLayout()` just as it
routes to grid's `getLayout()` for chess. Same code path. No special cases.

---

## Implementation script

### Step 1: Create topology-tableau package

New package: `packages/topology-tableau/`

Implements the topology contract:
- `schema` object with type, required, parseBoard, matchBoard
- `getLayout(config)` → returns positioned cells for the table
- Layout algorithms: radial, tableau, mahjong-wall (extracted from existing
  `layout.js` and `renderers.js`)

This is NOT new logic — it's relocating existing layout code from
`packages/component-deck/src/layout.js` into a proper topology package.
The radial player positioning, tableau column cascading, and mahjong wall
construction all already exist.

### Step 2: Register topology-tableau in the game factory

Add `topology-tableau` to `packages/game/src/topology-registry.js` so the
game factory and render engine can resolve it.

### Step 3: Add `deal:` and `topology.type: tableau` to all 40 variant files

Manually author the frontmatter in each variant file in moddable-rules.
The deal spec data is transcribed 1:1 from the engine's `games: {}` objects.
The topology block declares `type: tableau` with the appropriate layout mode.

**40 files. Each needs ~10 lines of YAML. This is transcription, not generation.**

Full mapping:

| Engine source | Rules target | Layout |
|---------------|-------------|--------|
| `standard-52.js` → `games.poker` | `standard-52/games/poker/standard.md` | radial |
| `standard-52.js` → `games.big2` | `standard-52/games/big2/standard.md` | radial |
| `standard-52.js` → `games.klondike` | `standard-52/games/klondike/standard.md` | tableau |
| `mahjong-136.js` → `games.riichi` | `mahjong/games/riichi/standard.md` | mahjong-wall |
| (all 28 existing + 12 new) | (all 40 variant files) | (per game) |

Variants not currently in the engine registry (12 total — crazy-eights, war,
freecell, spider-solitaire, rummy, whist, bunco, craps, chickenfoot, go-stop,
schafkopf, american-classic) need deal specs researched from their rules text.

### Step 4: Wire render-engine to handle topology-tableau

In `packages/render/src/render-engine.js`, the `renderFromEngine` function
dispatches on topology type. Add the `tableau` case that:
1. Reads layout mode from resolved topology config
2. Calls `topology-tableau`'s `getLayout()` to get cell positions
3. Creates deck from `resolved.components`
4. Shuffles + deals using `resolved.deal`
5. Places cards/tiles/dice at topology positions as "pieces"
6. Returns SVG through the standard compositor

### Step 5: Update cascade-resolver to pass `deal` through

Verify `deal` at variant level flows into the resolved output. Add to the
merge list if needed (one line).

### Step 6: Update play.js — delete renderComponentGame

Remove the `renderComponentGame` function and the `if (entry.topology === 'cards')`
special case. Component games now route through the same `render()` path as
board games: fetch frontmatter → resolve cascade → renderFromResolved.

The player-count selector reads from `resolved.deal.minPlayers` /
`resolved.deal.maxPlayers` (same as hex generators read player counts).

### Step 7: Delete bespoke renderers

Remove:
- `packages/component-deck/src/renderers.js`
- `packages/component-deck/src/render-from-resolved.js`
- `packages/component-deck/src/layout.js`

The layout logic now lives in `topology-tableau`. The rendering goes through
the standard compositor.

### Step 8: Delete `games: {}` from all 6 deck files

Deck files retain ONLY card/tile/die definitions:
```js
registerDeck('standard-52', {
  label: 'Standard 52',
  cardCount: 52,
  suits: SUITS,
  ranks: RANKS,
  pieceSet: 'standard-52-cards',
  create(opts = {}) { /* unchanged */ },
})
```

### Step 9: Add component games to snapshot pipeline

Update `scripts/snapshot-boards.mjs` to render component games through the
standard path. They now have topologies and produce SVGs like any board game.

### Step 10: Verify parity

For each of the 28 currently-working component games:
- Select in play page dropdown
- Verify table renders with correct player count and card distribution
- Verify community cards, draw pile, tableau columns appear correctly
- Compare visual output to pre-migration screenshots
- Verify SVG/PNG export works

---

## What lives where after this

| Concern | Location |
|---------|----------|
| Card/tile/die definitions (suits, ranks, create) | `packages/component-deck/src/decks/*.js` |
| Shuffle, deal, deck operations | `packages/component-deck/src/deck-ops.js` |
| Table layout as topology (positions, cell types) | `packages/topology-tableau/` |
| Deal specs (perPlayer, community, layout mode) | frontmatter `engine.deal` in moddable-rules |
| Surface (green felt, wood table) | frontmatter `engine.surface` in moddable-rules |
| Rendering | standard compositor in `packages/render/` |

---

## What does NOT happen

- No auto-generation of deal specs from variant prose. Each is authored by hand.
- No new rendering code. The existing layout algorithms (radial, tableau,
  mahjong-wall) are moved into topology-tableau, not rewritten.
- No changes to shuffle/deal/deck-ops. Only the SOURCE of the deal spec and
  the CONSUMER of the layout change.
- No "card game special mode" in the compositor. The compositor already renders
  pieces at positions. Cards are pieces. Table positions are cells. Done.
- No intermediate steps where both paths coexist. The old renderers are deleted
  once parity is confirmed.

---

## Relationship to other issues

| Issue | Relationship |
|-------|-------------|
| #8 (closed) | Merged into this. topology-tableau IS the spatial topology for cards. |
| #16 | Once component games produce snapshots, the sync pipeline covers them. |
| #29 | Same pattern: game knowledge moves from engine code to provider manifests. |

---

## Variants needing fresh deal specs (12 not in engine registry)

| Family | Variant | Research needed |
|--------|---------|----------------|
| standard-52 | crazy-eights | perPlayer varies (5 for 2p, 7 for 3-4p) |
| standard-52 | freecell | tableau: 8 columns, all 52 dealt face-up |
| standard-52 | rummy | perPlayer: 7 (2-4p) or 10 (2p) |
| standard-52 | spider-solitaire | tableau: 10 columns, cascade [6,5,5,6,5,5,6,5,5,6] |
| standard-52 | war | perPlayer: all (split deck evenly) |
| standard-52 | whist | perPlayer: 13 |
| standard-dice | bunco | 3 dice, teams of 2, radial |
| standard-dice | craps | 2 dice, radial |
| double-six-dominoes | chickenfoot | perPlayer varies by count (15/11/9/7) |
| flower-48 | go-stop | perPlayer: 7, community: 6 |
| bavarian-32 | schafkopf | perPlayer: 8 |
| mahjong | american-classic | perPlayer: 13, flowers: 8, layout: mahjong-wall |
