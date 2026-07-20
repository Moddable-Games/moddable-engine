# Deck Registry Abstraction Spec

## Problem

Deal specifications (cards per hand, player counts, community cards, layout
style) are hardcoded in `packages/component-deck/src/decks/*.js`. Each deck
file contains a `games: {}` object mapping variant keys to deal specs. This
is game knowledge baked into engine code.

Adding a new card game (e.g. cribbage three-player) requires editing engine
source. The variant files in moddable-rules already declare `engine.components`
but don't carry the deal spec — the engine ignores their frontmatter and reads
from its own registry.

## Goal

Deal specs live in moddable-rules frontmatter. The engine reads them from the
resolved cascade at runtime. No game names in engine code. A new card game
variant renders correctly with zero engine changes.

---

## Current state

### What's hardcoded (6 deck files)

| File | Deck type | Games registered |
|------|-----------|-----------------|
| `standard-52.js` | `standard-52` | big2, president, poker, blackjack, bridge, canasta, cribbage, euchre, gin-rummy, hearts, klondike, spades |
| `hanafuda-48.js` | `hanafuda-48` | koi-koi, hana-awase, oicho-kabu |
| `mahjong-136.js` | `mahjong-136` | hong-kong, riichi, taiwanese, zung-jung |
| `dominoes-28.js` | `dominoes-28` | block, all-fives, mexican-train |
| `bavarian-32.js` | `bavarian-32` | skat |
| `standard-dice.js` | `standard-dice` | yahtzee, farkle, liars-dice |

**Total: 28 deal specs across 6 deck types.**

### What each deal spec contains

```js
{
  minPlayers: 2,
  maxPlayers: 10,
  defaultPlayers: 6,
  perPlayer: 2,         // cards dealt per player ('all' = divide evenly)
  community: 5,         // shared cards dealt face-up
  remainder: 'draw',    // what happens to undealt cards: 'draw'|'boneyard'|'wall'|null
  layout: 'tableau',    // optional: 'mahjong-wall'|'tableau'|null (default: radial spread)
  tableau: { columns: 7, cascade: [1,2,3,4,5,6,7] },  // klondike-specific
  flowers: 8,           // mahjong-specific: bonus tile count
  tileSet: 'mahjong-planar',  // mahjong-specific: which tile artwork
  count: 5,             // dice-specific: number of dice
}
```

### What moddable-rules frontmatter currently declares

```yaml
engine:
  players: [player1, player2, player3, player4]
  components:
    deck:
      type: standard-52
      count: 1
      jokers: 0
```

The `players` list implies count but not min/max/default. The `deck` block
declares the deck type but NOT the deal spec (how many cards, layout, etc).

### What the play page does today

1. Looks up `entry.variant` in `deckConfig.games[variantKey]` → gets deal spec
2. Falls back to `renderDeckFromResolved()` which also searches `deckConfig.games`
3. Uses deal spec to: create deck, shuffle, deal, lay out table, render SVG

---

## Target state

### Frontmatter in moddable-rules (source of truth)

Each component game variant declares its full deal spec:

```yaml
# games/standard-52/content/games/poker/standard.md
engine:
  players: [player1, player2, player3, player4, player5, player6]
  components:
    deck:
      type: standard-52
      jokers: 0
  deal:
    minPlayers: 2
    maxPlayers: 10
    defaultPlayers: 6
    perPlayer: 2
    community: 5
    remainder: draw
```

```yaml
# games/mahjong/content/games/riichi/standard.md
engine:
  players: [east, south, west, north]
  components:
    tiles:
      type: mahjong-136
  deal:
    minPlayers: 4
    maxPlayers: 4
    defaultPlayers: 4
    perPlayer: 13
    community: 0
    remainder: wall
    layout: mahjong-wall
    tileSet: mahjong-regular
```

```yaml
# games/standard-52/content/games/klondike/standard.md
engine:
  players: [player1]
  components:
    deck:
      type: standard-52
      jokers: 0
  deal:
    minPlayers: 1
    maxPlayers: 1
    defaultPlayers: 1
    layout: tableau
    tableau:
      columns: 7
      cascade: [1, 2, 3, 4, 5, 6, 7]
    community: 0
    remainder: draw
```

```yaml
# games/standard-dice/content/games/yahtzee/standard.md
engine:
  components:
    dice:
      type: standard-dice
      count: 5
  deal:
    minPlayers: 1
    maxPlayers: 4
    defaultPlayers: 2
    perPlayer: 0
    community: 5
```

### Engine deck files (after migration)

Deck files retain ONLY:
- Card/tile/die definitions (suits, ranks, create function)
- Deck metadata (label, cardCount, pieceSet)
- NO `games: {}` block

```js
// standard-52.js — AFTER
registerDeck('standard-52', {
  label: 'Standard 52',
  cardCount: 52,
  suits: SUITS,
  ranks: RANKS,
  pieceSet: 'standard-52-cards',
  create(opts = {}) { /* unchanged */ },
})
```

### Engine consumer (play page + render-from-resolved)

Instead of `deckConfig.games[variantKey]`, the renderer receives the deal spec
from the resolved cascade object:

```js
const dealSpec = resolved.deal
```

This is already how board games work — frontmatter flows through the cascade
resolver into `resolved`, and the renderer consumes it without knowing which
game it is.

---

## diagrams-manifest.json

Component game entries already exist in the manifest with `"topology": "cards"`.
No changes needed to discovery. The deal spec comes from fetching + parsing the
variant's frontmatter at render time (same as board games).

---

## Implementation script

### Step 1: Add `deal:` block to all 40 variant files in moddable-rules

Manually author the `deal:` block in each variant file's frontmatter. The data
is transcribed 1:1 from the engine's `games: {}` objects:

| Source (engine) | Target (frontmatter) |
|-----------------|---------------------|
| `standard-52.js` → `games.poker` | `games/standard-52/content/games/poker/standard.md` → `engine.deal` |
| `standard-52.js` → `games.big2` | `games/standard-52/content/games/big2/standard.md` → `engine.deal` |
| `mahjong-136.js` → `games.riichi` | `games/mahjong/content/games/riichi/standard.md` → `engine.deal` |
| etc. | etc. |

**40 files. Each is a 5–8 line YAML block. This is transcription, not generation.**

Variants not currently in the engine registry (e.g. `crazy-eights`, `war`,
`freecell`, `spider-solitaire`, `rummy`, `whist`, `bunco`, `craps`,
`chickenfoot`, `go-stop`, `schafkopf`, `american-classic`) will need deal
specs researched from their own rules text and authored fresh. These are the
games that currently show "No deal spec" in the play page.

### Step 2: Update cascade-resolver to pass `deal` through

The cascade resolver in `packages/schema/src/cascade-resolver.js` already
passes `components` through. Verify that `deal` at variant level also flows
into the resolved output. If not, add it to the merge list (one line).

### Step 3: Update render-from-resolved.js

Replace:
```js
const gameKeys = Object.keys(deckConfig.games || {})
for (const key of gameKeys) {
  const spec = deckConfig.games[key]
  if (spec.perPlayer === setup.deal || spec.defaultPlayers === players) {
    dealSpec = spec
    break
  }
}
```

With:
```js
const dealSpec = resolved.deal
```

The entire lookup-by-guessing logic is deleted. The resolved object carries
the deal spec directly.

### Step 4: Update play.js renderComponentGame

Replace:
```js
const dealSpec = deckConfig.games?.[entry.variant]
```

With reading the deal spec from the fetched + resolved frontmatter (same path
as board game rendering — fetch family rulebook.md + variant.md, resolve
cascade, consume `resolved.deal`).

This means component games go through the SAME code path as board games in
the play page: fetch frontmatter → resolve cascade → render from resolved.
The special-case `renderComponentGame` function is eliminated.

### Step 5: Update snapshot-boards.mjs

The snapshot script currently skips component games (no topology). Once deal
specs are in frontmatter and the renderer reads from resolved, component games
can generate SVG snapshots showing a dealt table state (with a fixed seed).

Add component game rendering to the snapshot script using the same
`renderDeckFromResolved()` path.

### Step 6: Delete `games: {}` from all 6 deck files

Remove the `games` objects from:
- `standard-52.js`
- `hanafuda-48.js`
- `mahjong-136.js`
- `dominoes-28.js`
- `bavarian-32.js`
- `standard-dice.js`

### Step 7: Delete renderComponentGame from play.js

The separate code path for component games is eliminated. All games
(board, component, hex-generator) go through the unified
fetch-frontmatter → resolve → render path.

### Step 8: Verify parity

For each of the 28 currently-working component games:
- Select in play page dropdown
- Verify table renders with correct number of players
- Verify correct card/tile count per hand
- Verify community cards appear
- Verify draw pile / boneyard / wall shows when expected
- Verify player count selector works (min/max range)
- Compare screenshot to pre-migration output

---

## What lives where after this

| Concern | Location |
|---------|----------|
| Card/tile/die definitions (suits, ranks, create) | `packages/component-deck/src/decks/*.js` |
| Deal specs (perPlayer, community, layout) | `games/{family}/content/games/{variant}/standard.md` → `engine.deal` |
| Table layout algorithm | `packages/component-deck/src/layout.js` |
| SVG renderers (radial, mahjong-wall, tableau) | `packages/component-deck/src/renderers.js` |
| Cascade resolution | `packages/schema/src/cascade-resolver.js` |
| Render orchestration | `packages/component-deck/src/render-from-resolved.js` |

---

## What does NOT happen

- No auto-generation of deal specs from variant prose. Each is authored by hand.
- No new abstraction layer between deck registry and renderer. The registry
  still provides card definitions; the frontmatter provides deal specs; the
  renderer combines them. That's it.
- No changes to the deck create/shuffle/deal/layout pipeline. Only the SOURCE
  of the deal spec changes (from hardcoded registry to resolved frontmatter).
- No changes to the SVG renderers themselves. Same output, different input path.
- No "deal spec inference" from player counts or card text. Explicit declaration only.

---

## Variants needing fresh deal specs (not currently in engine registry)

These 12 variants exist in moddable-rules but have no corresponding entry in
the engine's `games: {}` objects. Their deal specs must be researched from
the variant's own rules text:

| Family | Variant | Notes |
|--------|---------|-------|
| standard-52 | crazy-eights | 5-7 cards per player depending on count |
| standard-52 | freecell | tableau: 8 columns, all face-up |
| standard-52 | rummy | 7-10 cards depending on variant |
| standard-52 | spider-solitaire | tableau: 10 columns, specific cascade |
| standard-52 | war | perPlayer: all (split deck) |
| standard-52 | whist | perPlayer: 13 |
| standard-dice | bunco | 3 dice, teams |
| standard-dice | craps | 2 dice |
| double-six-dominoes | chickenfoot | perPlayer varies by player count |
| flower-48 | go-stop | perPlayer: 7, community: 6 |
| bavarian-32 | schafkopf | perPlayer: 8 |
| mahjong | american-classic | perPlayer: 13, flowers: 8 |

---

## Unlocks (from issue #25)

Once complete:
1. SVG export for component games (snapshot script covers them)
2. moddable-rules gets board diagrams for all 40 component games
3. PDF rulebooks get card table diagrams
4. New card games added to moddable-rules render with zero engine changes
