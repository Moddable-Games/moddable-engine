# Setup Notation Specification

Universal position notation for all game families in the Moddable Engine.

---

## 1. Architecture

Every game variant declares its starting position as a **setup string** in frontmatter:

```yaml
engine:
  topology:
    type: grid
    rows: 8
    cols: 8
  setup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
  players: [white, black]
```

The pipeline:

1. **Frontmatter** declares `setup:` (a string)
2. **`produce()`** passes it through to the game definition
3. **Plugin `init()`** receives setup via `pluginConfig.setup`
4. **Plugin calls** `topology.parsePosition(setup, vocabulary)`
5. **Topology** parses the format-specific string using the plugin's vocabulary
6. **Result:** topology-native cell/node/position state array

The plugin never parses notation directly. The topology owns the format.
The plugin owns the vocabulary (symbol ↔ piece type + owner mapping).

---

## 2. Notation Formats by Topology

### 2.1 Grid (FEN)

**Standard:** Forsyth-Edwards Notation (FEN), the global standard for grid-based games.

**Format:** Rows separated by `/`, scanned top-to-bottom (rank 8 → rank 1 for chess). Numbers represent consecutive empty cells. Letters represent pieces via vocabulary lookup.

**Applies to:** Chess, Draughts, Go, Xiangqi, Shogi, Reversi, Halma, Fanorona, Dungeon Chess.

```
rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR
```

**Already implemented:** `topology-grid.parsePosition()` and `serializePosition()`.

#### Multi-digit empty counts

For boards wider than 9 (e.g. 10×10 International Draughts, 12×12 Canadian, 16×16 Halma), numbers like `10`, `12`, `16` represent that many consecutive empty cells. The parser already handles this.

#### All-squares vs dark-squares-only

FEN encodes ALL cells in the grid regardless of whether the game uses them all. For draughts on dark squares only, the light squares are simply empty in the notation. This is correct — the topology is a grid; which cells are "playable" is a rule concern, not a notation concern.

### 2.2 Hex (Adapted FEN)

**Standard:** No universal hex notation exists. We adapt FEN conventions.

**Rhombus shape:** `/`-separated rows (q-axis per row), numbers = empty cells. Identical to grid FEN but indexed by (q, r) rather than (row, col).

**Hexagonal shape:** Sorted cell keys, flat sequence. Numbers = consecutive empty cells in the sorted key order.

```
# Glinski (hexagonal, radius 5) — 91 cells, sorted by key
# Example: 36 empty, then pieces, then gaps...
```

**Already implemented:** `topology-hex.parsePosition()` and `serializePosition()`.

### 2.3 Graph (Node-Value Pairs)

**Standard:** No standard exists for arbitrary graph positions.

**Format:** Comma-separated `node=symbol` pairs. Only occupied nodes listed. Empty nodes are implicit.

```
a1=W,d7=B,g4=W
```

**Applies to:** Morris (all variants), Surakarta.

**Already implemented:** `topology-graph.parsePosition()` and `serializePosition()`.

**Note:** For games that start empty (Morris placement phase), setup is simply omitted or set to `empty`.

### 2.4 Track (Position-Count Notation) — NEW

**Standard:** No universal standard exists. GNU Backgammon uses a proprietary format. PDN records moves only.

**Format:** Comma-separated `position:countSymbol` pairs. Position is the 0-indexed point number. Count is the number of pieces. Symbol identifies the owner.

```
0:2W,5:5B,7:3B,11:5W,12:5B,16:3W,18:5W,23:2B
```

**Reading:** "Point 0 has 2 White checkers, point 5 has 5 Black checkers..."

**Applies to:** Backgammon (all variants), Pachisi, Chaupar, Race games.

**Special positions:**
- `bar:1W` — piece on the bar (backgammon)
- `home` — pieces not yet entered (pachisi/race: all start at home)

**Empty track:** When all pieces start off-board (race games), setup is `home:4W,home:4B` or similar, indicating pieces-per-player in the home/reserve area.

**Design rationale:**
- Sparse: only occupied positions listed (tracks are mostly empty)
- Count-first: backgammon points hold multiple checkers
- Symbol after count: consistent with vocabulary (`W`/`B` from `checker: { symbols: { 0: 'W', 1: 'B', count: true } }`)

**Needs implementation:** `topology-track.serializePosition()` and `parsePosition()`.

### 2.5 Pit (Seed-Count Notation) — NEW

**Standard:** No universal standard exists.

**Format:** Semicolons separate the four regions: south pits, south store, north pits, north store. Commas separate individual pit seed counts.

```
4,4,4,4,4,4;0;4,4,4,4,4,4;0
```

**Reading:** "South has 6 pits each containing 4 seeds, south store has 0; north has 6 pits each containing 4 seeds, north store has 0."

**Applies to:** All mancala variants (Kalah, Oware, Bao, Congkak, etc.)

**Variants with different seed counts:**
```
# Oware (4 seeds per pit, no stores used in counting)
4,4,4,4,4,4;0;4,4,4,4,4,4;0

# Bao (initial setup: 2 seeds in specific pits, rest in hand)
0,0,0,0,2,2;0;0,0,0,0,2,2;0

# Toguz Korgool (9 pits, 9 seeds each)
9,9,9,9,9,9,9,9,9;0;9,9,9,9,9,9,9,9,9;0
```

**Store-less games:** Some mancala variants (Oware) don't use stores for scoring. The stores are still present in notation (as `0`) but unused by the rules.

**Design rationale:**
- Sequential: pits are naturally ordered (counter-clockwise from south-left)
- Semicolons separate regions (not commas — commas separate pits within a region)
- Stores always present even if unused (consistent structure)
- Seed counts only (no owner symbol needed — south pits belong to south, north to north)

**Needs implementation:** `topology-pit.serializePosition()` and `parsePosition()`.

---

## 3. Vocabulary Declaration

Every plugin exports a `vocabulary` object mapping piece types to per-owner symbols:

```js
vocabulary: {
  man:  { symbols: { 0: 'w', 1: 'b' } },
  king: { symbols: { 0: 'W', 1: 'B' } },
}
```

For stacking/counting games (multiple pieces per cell), add `count: true`:

```js
vocabulary: {
  checker: { symbols: { 0: 'W', 1: 'B', count: true } },
}
```

When `count: true`, the notation format includes a number prefix before the symbol: `2W` means "2 white checkers". Without count, each symbol represents exactly one piece.

### Existing vocabularies

| Plugin | Vocabulary |
|---|---|
| Chess | `K/k Q/q R/r B/b N/n P/p` |
| Draughts | `w/b` (man), `W/B` (king) |
| Shogi | `K/k R/r B/b G/g S/s N/n L/l P/p` |
| Xiangqi | `K/k A/a E/e H/h R/r C/c S/s` |
| Morris | `W/B` (piece) |
| Halma | `W/B` (piece) |
| Reversi | `B/W` (disc) |
| Backgammon | `W/B` (checker, count: true) |
| Mancala | seed (count: true, no symbol — just numbers) |
| Race | pawn (count: true) |

---

## 4. Empty and Placement-Phase Games

Some games start with an empty board (pieces enter during play):

- **Go** — empty board (unless handicap setup)
- **Morris** — placement phase, pieces enter from reserve
- **Reversi** — 4 center pieces pre-placed

Convention:
- **Omit `setup:`** or set `setup: empty` → plugin uses its default init (usually empty board)
- **Handicap/pre-placed:** provide the setup string with only those pieces

```yaml
# Go with 9-stone handicap
setup: "19/19/19/3X11X3/19/19/3X5X5X3/19/19/9X9/19/19/3X5X5X3/19/19/3X11X3/19/19/19"

# Reversi standard (4 center pieces)
setup: "8/8/8/3BW3/3WB3/8/8/8"
```

---

## 5. Setup Strings for Every Game Family

### Chess (grid, FEN)

```yaml
# Standard
setup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"

# Capablanca (10-wide)
setup: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR"

# Glinski (hex, hexagonal shape)
# Uses hex topology parsePosition — flat sorted key sequence
```

### Draughts (grid, FEN)

```yaml
# English 8×8 (12 per side, dark squares only)
setup: "1b1b1b1b/b1b1b1b1/1b1b1b1b/8/8/w1w1w1w1/1w1w1w1w/w1w1w1w1"

# International 10×10 (20 per side)
setup: "1b1b1b1b1b/b1b1b1b1b1/1b1b1b1b1b/b1b1b1b1b1/10/10/w1w1w1w1w1/1w1w1w1w1w/w1w1w1w1w1/1w1w1w1w1w"

# Dameo 8×8 (18 per side, ALL squares, trapezoidal)
setup: "bbbbbbbb/1bbbbbb1/2bbbb2/8/8/2wwww2/1wwwwww1/wwwwwwww"

# Diagonal 10×10 (20 per side, dark squares, diagonal split along main diagonal)
setup: "2b1b1b1b1/3b1b1b1b/w3b1b1b1/1w3b1b1b/w1w3b1b1/1w1w3b1b/w1w1w3b1/1w1w1w3b/w1w1w1w3/1w1w1w1w2"

# Turkish 8×8 (16 per side, ALL squares, 2 rows each)
setup: "8/bbbbbbbb/bbbbbbbb/8/8/wwwwwwww/wwwwwwww/8"
```

### Go (grid, FEN)

```yaml
# Standard (empty board)
setup: empty

# 9-stone handicap on 19×19 — positions specified
setup: "19/19/19/3X11X3/19/19/3X5X5X3/19/19/9X9/19/19/3X5X5X3/19/19/3X11X3/19/19/19"
```

### Xiangqi (grid, FEN)

```yaml
# Standard
setup: "RHEAKAEHR/9/1C5C1/S1S1S1S1S/9/9/s1s1s1s1s/1c5c1/9/rheakaehr"
```

### Shogi (grid, FEN)

```yaml
# Standard 9×9
setup: "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL"

# Minishogi 5×5
setup: "rbsgk/4p/5/P4/KGSBR"
```

### Backgammon (track, position-count)

```yaml
# Standard
setup: "0:2W,5:5B,7:3B,11:5W,12:5B,16:3W,18:5W,23:2B"

# Nackgammon
setup: "0:2W,1:2W,5:4B,7:3B,11:4W,12:4B,16:3W,18:4W,22:2B,23:2B"

# Hypergammon (3 checkers each)
setup: "0:1W,1:1W,2:1W,21:1B,22:1B,23:1B"

# Plakoto
setup: "0:15W,23:15B"

# Fevga
setup: "0:15W,12:15B"

# Acey-Deucey (all off-board)
setup: "home:15W,home:15B"
```

### Mancala (pit, seed-count)

```yaml
# Kalah (6 pits, 4 seeds each)
setup: "4,4,4,4,4,4;0;4,4,4,4,4,4;0"

# Oware (same layout)
setup: "4,4,4,4,4,4;0;4,4,4,4,4,4;0"

# Congkak (7 pits, 7 seeds)
setup: "7,7,7,7,7,7,7;0;7,7,7,7,7,7,7;0"

# Toguz Korgool (9 pits, 9 seeds)
setup: "9,9,9,9,9,9,9,9,9;0;9,9,9,9,9,9,9,9,9;0"

# Bao (specific initial placement)
setup: "0,0,0,0,6,2,2,0;0;0,0,0,0,6,2,2,0;0"
```

### Morris (graph, node-value pairs)

```yaml
# All Morris variants start empty (placement phase)
setup: empty
```

### Halma (grid, FEN)

```yaml
# 2-player 16×16 (19 pieces in corner camps)
setup: "W1W1W1W1W8/1W1W1W1W18/W1W1W1W110/1W1W1W1210/W1W1W112/1W1W214/W1W314/1W414/16/16/16/16/14b1/12b1b1/10b1b1b1/8b1b1b1b1"
```

### Reversi (grid, FEN)

```yaml
# Standard 8×8 (4 center pieces)
setup: "8/8/8/3BW3/3WB3/8/8/8"

# 6×6
setup: "6/6/2BW2/2WB2/6/6"
```

### Hex (hex, rhombus)

```yaml
# All Hex variants start empty
setup: empty
```

### Pachisi / Chaupar (track, position-count)

```yaml
# All pieces start at home
setup: "home:4W,home:4Y,home:4G,home:4B"
```

### Race games (track, position-count)

```yaml
# Ludo — all at home
setup: "home:4W,home:4Y,home:4G,home:4B"
```

### Royal Game of Ur (track, position-count)

```yaml
# All pieces start off-board
setup: "home:7W,home:7B"
```

### Stern-Halma / Chinese Checkers (hex, star)

```yaml
# 6-player star — 10 pieces per player in each point of the star
# Hex topology with star shape — needs hex parsePosition
setup: "..."  # TBD: requires star-hex topology notation
```

### Surakarta (grid, FEN)

```yaml
# Standard 6×6 (12 per side, top/bottom 2 rows)
setup: "WWWWWW/WWWWWW/6/6/bbbbbb/bbbbbb"
```

### Landlords Game (track, position-count)

```yaml
# All players start at GO
setup: "0:1W,0:1B"
```

### Fanorona (grid, FEN)

```yaml
# Standard 5×9 (all intersections occupied except center)
setup: "WWWWWWWWW/WWWWWWWWW/WWWW1BBBB/BBBBBBBBB/BBBBBBBBB"
```

---

## 6. Migration Plan

### Phase 1: Add `setup:` to frontmatter (moddable-rules)

Add `setup:` strings to all 157 variant engine blocks. For grid-based games this is immediate (FEN is well-understood). For track/pit games this follows topology implementation.

### Phase 2: Implement track/pit serialize/parse

Add `serializePosition()` and `parsePosition()` to:
- `topology-track` — position-count notation
- `topology-pit` — seed-count notation

### Phase 3: Update plugins to use topology.parsePosition

Change each plugin's `init()` to accept a setup string and call `topology.parsePosition(setup, vocabulary)` instead of using bespoke `buildSetupBoard()` functions. The chess plugin already does this — it's the reference pattern.

### Phase 4: Update board studio

Replace all bespoke position functions (`buildDraughtsPosition`, `buildFanoronaPosition`, `buildGoHandicap`, `fenToPosition`) with a single path: parse the setup string using the topology's parser and the game's vocabulary.

---

## 7. Design Principles

1. **Topology owns format** — the notation format is determined by topology type, never by game family
2. **Plugin owns vocabulary** — the symbol mapping is determined by the plugin, never hardcoded in topology
3. **Use global standards where they exist** — FEN for grids (chess/draughts/go all use FEN)
4. **Invent only when no standard exists** — track and pit formats are our own because nothing universal exists
5. **Setup is a string** — always serializable, always parseable, always storable in YAML frontmatter
6. **Round-trip guarantee** — `serialize(parse(s)) === s` for all valid setup strings
7. **Empty is explicit** — `setup: empty` or omission means "plugin decides its own default init"
8. **Notation is topology-complete** — encodes ALL cells/positions, not just "playable" ones

