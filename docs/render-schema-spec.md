# Render Schema Spec (v3 — Surface Abstraction)

## Purpose

Define the full data contract between moddable-rules frontmatter and the board studio renderer, eliminating all hardcoded config from `boards.js`. Every field needed to render any of the 41 game families and 315+ variants must be expressible in frontmatter alone.

## Design Principles

1. **Topology-agnostic naming.** No field name references a specific topology.
2. **Concepts over implementations.** Fields describe WHAT not HOW.
3. **Minimal per-variant config.** Family defaults + named surfaces cover 95%+ of fields.
4. **Surfaces are reusable.** ~9 named surfaces serve all 315 variants. Per-game colour definitions are eliminated.
5. **Three concerns, cleanly separated:**
   - **Topology** — where things are (structure, geometry)
   - **Surface** — how the board looks (colours, texture, material)
   - **Render** — how to draw it (sizing, layout, features)

## Cascade Model

```
surface definition (named, shared across families)
  └─ family defaults (rulebook.md engine: block)
       └─ variant overrides (variant.md engine: block)
```

Deep-merge at every level. Variant wins over family wins over surface defaults.

---

## Top-Level Schema

```yaml
engine:
  topology: { ... }       # spatial structure
  setup: "..."            # position notation
  players: [...]          # player identifiers
  surface: "wood-classic" # named surface (or inline override)
  render: { ... }         # layout + sizing + features
  pieces: { ... }         # piece set + vocabulary
  plugins: { ... }        # behavioural rules (existing)
  components: { ... }     # deck/dice (existing)
```

---

## topology: block

Defines spatial structure. Unified field names across all types.

### Universal fields

| Field | Type | Meaning |
|-------|------|---------|
| `type` | string | `grid` / `hex` / `track` / `pit` / `graph` / `star` / `none` |
| `rows` | int | row count |
| `cols` | int | column count |
| `radius` | int | concentric ring count from centre |
| `positions` | int | total position count (track) |
| `sideLength` | int | edge length (triangular shapes) |
| `shape` | string | board outline |
| `ranks` | int[] | per-rank cell counts (irregular boards) |

### type: grid

```yaml
topology:
  type: grid
  rows: 8
  cols: 8
  layout: cells | intersections | cross
  wrap: none | horizontal | vertical | both
  zones:
    - type: river
      rows: [4, 5]
    - type: palace
      rows: [0, 2]
      cols: [3, 5]
```

### type: hex

```yaml
topology:
  type: hex
  shape: hexagonal | rhombus | triangular | irregular
  radius: 5              # hexagonal
  rows: 9                # rhombus
  cols: 9
  sideLength: 12         # triangular
  ranks: [9,10,11,12,12,11,10,9]  # irregular
  orientation: flat | pointy
```

### type: track

```yaml
topology:
  type: track
  positions: 24
  shape: linear | circuit | cross
```

### type: pit

```yaml
topology:
  type: pit
  cols: 6
  rows: 2 | 4
  stores: true | false
```

### type: graph

```yaml
topology:
  type: graph
  nodes: [a1, a4, a7, ...]
  edges:
    - [a1, d1]
    - [d1, g1]
```

### type: star

```yaml
topology:
  type: star
  arms: 6
  armSize: 10
```

### type: none

```yaml
topology:
  type: none
```

---

## surface: field

A named reference to a shared surface definition OR an inline override object.

### As reference (95% of cases):

```yaml
surface: wood-classic
```

### As reference + overrides:

```yaml
surface:
  base: wood-classic
  colors:
    throne: "#8b4513"    # add game-specific zone colour
```

### As full inline (rare — only for truly unique boards):

```yaml
surface:
  colors:
    cell-light: "#e6a817"
    cell-dark: "#8b2240"
    stroke: "rgba(0,0,0,0.25)"
    background: "#2a1a0a"
  texture: none
```

---

## Built-in Surfaces (9)

### wood-classic

Warm chessboard tones. The default for any checkered board.

```yaml
name: wood-classic
colors:
  cell-light: "#f0d9b5"
  cell-dark: "#b58863"
  cell-mid: "#d4a76a"
  stroke: "rgba(0,0,0,0.1)"
  background: "#2c2c2c"
texture: grain
gridLine: thin
```

**Used by:** chess (102), draughts (18), halma (2), hex-chess variants

### wood-light

Pale warm board. Traditional East Asian and Go aesthetic.

```yaml
name: wood-light
colors:
  cell-light: "#dcb35c"
  cell-dark: "#c8a43c"
  stroke: "#2a2a2a"
  background: "#3a2a1a"
texture: grain
gridLine: medium
```

**Used by:** go (14), shogi (22), xiangqi (7)

### parchment

Aged leather/vellum. Historical and abstract games.

```yaml
name: parchment
colors:
  cell-light: "#d9c5a0"
  cell-dark: "#c4b088"
  stroke: "#8b7355"
  background: "#f5f0e8"
  floor: "#d9c5a0"
  floor-stroke: "#8b7355"
texture: grain
gridLine: thin
```

**Used by:** tafl (4), royal-ur (1), backgammon (8), pachisi (3), chaupar (1), surakarta (1)

### earth

Deep carved wood. Mancala boards and warm pit games.

```yaml
name: earth
colors:
  cell-light: "#9B7740"
  cell-dark: "#7A5A32"
  stroke: "#3A2515"
  background: "#4E3320"
  board-outer: "#7A5A32"
  board-inner: "#9B7740"
  pit: "#4E3320"
  pit-stroke: "#3A2515"
  seed: "#C8B898"
  seed-stroke: "#8A7A5A"
texture: carved
gridLine: none
```

**Used by:** mancala (8)

### felt-green

Casino/game table felt.

```yaml
name: felt-green
colors:
  cell-light: "#2e7d32"
  cell-dark: "#1b5e20"
  stroke: "#1b5e20"
  background: "#1a3a1a"
texture: felt
gridLine: thin
```

**Used by:** reversi (3), card table layouts

### slate

Neutral grey. Clean abstract games.

```yaml
name: slate
colors:
  cell-light: "#e8e8e8"
  cell-dark: "#c0c0c0"
  cell-mid: "#d8d8d8"
  stroke: "rgba(0,0,0,0.3)"
  background: "#f5f5f5"
texture: smooth
gridLine: thin
```

**Used by:** hex game (9), Y, morris (7)

### jungle

Natural green/brown. Terrain-based games.

```yaml
name: jungle
colors:
  cell-light: "#7cb342"
  cell-dark: "#558b2f"
  stroke: "#3d6b1f"
  background: "#1a2e1a"
  floor: "#7cb342"
  floor-stroke: "#558b2f"
  river: "#4a90c8"
  river-stroke: "#2a6a9a"
  den: "#4a3520"
  trap: "#c8963c"
texture: none
gridLine: thin
```

**Used by:** dou-shou-qi (1), fanorona (1)

### military

Khaki/field uniform. Hidden information and war games.

```yaml
name: military
colors:
  cell-light: "#c8b896"
  cell-dark: "#a09070"
  stroke: "#7a6545"
  background: "#3a3020"
  floor: "#c8b896"
  floor-stroke: "#7a6545"
  lake: "#4a7ab5"
  lake-stroke: "#2a5a8a"
texture: canvas
gridLine: thin
```

**Used by:** l'attaque (4), dungeon-chess (3)

### cosmic

Dark space/night theme. Hex exploration games.

```yaml
name: cosmic
colors:
  cell-light: "#1a237e"
  cell-dark: "#0d1442"
  cell-mid: "#283593"
  stroke: "rgba(100,150,255,0.3)"
  background: "#070b1e"
texture: none
gridLine: glow
```

**Used by:** nukes (5), talisman (2), mongo (1), twilight (7), endless-skies (1), harvesters (7)

---

## render: block

Layout, sizing, and feature flags. NO colours (those live in surface).

```yaml
render:
  cellSize: 40              # pixel size of one cell
  cellColor: checkered      # colouring strategy
  labels: true              # coordinate labels
  orientation: flat | pointy  # hex orientation
  frame: rectangle | rhombus | triangle | star | ellipse | none
  canvasSize: 320           # override auto-calculated canvas
```

### cellColor strategies

| Name | Effect | Used by |
|------|--------|---------|
| `checkered` | alternating cell-light/cell-dark | chess, draughts, halma |
| `tricolor` | 3-colour mod (cell-light/mid/dark) | hex-chess (Glinski) |
| `bicolor` | alternating by ring | Agon |
| `uniform` | all cells same (cell-light) | go, hex, shogi, morris, tafl |
| `none` | no cell fill | intersection-only layouts |

### zones (terrain definition)

Defines WHICH cells are which type. Surface defines HOW they look.

```yaml
render:
  zones:
    # Parametric generator:
    generator: tafl
    params: { size: 9, corners: true }

    # OR inline string grid:
    map: |
      rfff..rf
      ffffrfff
      rfff..rf

    # OR declarative positions:
    cells:
      - type: throne
        at: [4,4]
      - type: corner
        at: [[0,0], [0,8], [8,0], [8,8]]
```

### layers (multi-board)

```yaml
render:
  layers:
    count: 2
    layout: horizontal | vertical
    labels: [Board A, Board B]
    surfaces:              # per-layer surface overrides
      - { base: wood-classic, colors: { cell-light: "#a0c8e8" } }
      - { base: wood-classic, colors: { cell-light: "#d4a080" } }
```

### Pit-specific layout

```yaml
render:
  storeSize: [24, 50]     # [rx, ry] oval store dimensions
  cornerRadius: 18
  markers: [4, 27]        # special pit indices
```

### Graph-specific layout

```yaml
render:
  rings: 3                # concentric rings (morris)
  diagonals: true
```

### Feature flags

```yaml
render:
  centreMarker: "★"
  seed: 12345             # procedural layout RNG
  layout: "6p"            # named layout variant
```

---

## setup: field

Position notation. Format is topology-native.

```yaml
# Grid — FEN:
setup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"

# Grid — multi-board (array):
setup:
  - "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
  - "8/8/8/8/8/8/8/8"

# Hex — axial map:
setup:
  "1,4": K
  "-1,5": Q

# Track — position:count+colour:
setup: "0:2W,5:5B,7:3B,11:5W"

# Pit — seeds (semicolons = rows + stores):
setup: "4,4,4,4,4,4;0;4,4,4,4,4,4;0"

# Graph — node:piece:
setup:
  a1: K
  d7: null

# Star — filled arms:
setup:
  arms: [N, S]

# None — deal config:
setup:
  deal: 13
  players: 4
```

---

## pieces: block

```yaml
pieces:
  set: mce-fairy-complete
  vocabulary:
    K: { type: king, color: white }
    k: { type: king, color: black }
  fenMap:
    E: wElephant
    L: wLion
  names:
    K: King
    A: Archbishop
  borders:
    white: "#1565c0"
    black: "#c62828"
```

---

## Cascade Resolution Algorithm

```
1. Resolve surface:
   - If string → load named surface definition
   - If object with base → load base, merge overrides
   - If object without base → use as-is
2. Load family engine: block from rulebook.md
3. Load variant engine: block from variant.md
4. Deep-merge: surface → family → variant (rightmost wins)
5. Derive defaults for missing fields:
   - render.cellColor: grid → checkered, hex → uniform, others → none
   - render.frame: from topology.shape if absent
   - render.labels: true for grid, false for others
6. Validate: topology.type + setup present for board games
```

---

## Family Examples (after surface abstraction)

### Chess — family default

```yaml
engine:
  topology:
    type: grid
    rows: 8
    cols: 8
  surface: wood-classic
  render:
    cellSize: 40
    cellColor: checkered
  pieces:
    set: mce-fairy-complete
    vocabulary:
      K: { type: king, color: white }
      Q: { type: queen, color: white }
      R: { type: rook, color: white }
      B: { type: bishop, color: white }
      N: { type: knight, color: white }
      P: { type: pawn, color: white }
      k: { type: king, color: black }
      q: { type: queen, color: black }
      r: { type: rook, color: black }
      b: { type: bishop, color: black }
      n: { type: knight, color: black }
      p: { type: pawn, color: black }
  players: [white, black]
```

### Go — family default

```yaml
engine:
  topology:
    type: grid
    rows: 19
    cols: 19
    layout: intersections
  surface: wood-light
  render:
    cellSize: 20
    cellColor: uniform
  pieces:
    set: playstrategy-go-classic
    vocabulary:
      w: { type: stone, color: white }
      b: { type: stone, color: black }
  players: [black, white]
```

### Mancala — family default

```yaml
engine:
  topology:
    type: pit
    cols: 6
    rows: 2
    stores: true
  surface: earth
  render:
    cellSize: 22
  pieces:
    set: playstrategy-oware
  players: [south, north]
```

### Hex — family default

```yaml
engine:
  topology:
    type: hex
    shape: rhombus
    orientation: pointy
  surface: slate
  render:
    cellSize: 20
    cellColor: uniform
    frame: rhombus
  pieces:
    set: playstrategy-go-classic
    vocabulary:
      w: { type: stone, color: white }
      b: { type: stone, color: black }
  players: [black, white]
```

### Tafl — family default

```yaml
engine:
  topology:
    type: grid
    rows: 9
    cols: 9
  surface: parchment
  render:
    cellSize: 40
    cellColor: uniform
    labels: false
  pieces:
    set: playstrategy-go-classic
    vocabulary:
      K: { type: king, color: white }
      w: { type: stone, color: white }
      b: { type: stone, color: black }
  players: [white, black]
```

---

## Variant Override Examples

### Standard chess (just adds setup)

```yaml
engine:
  setup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
```

### Capablanca (wider board, smaller cells)

```yaml
engine:
  topology:
    cols: 10
  render:
    cellSize: 36
  setup: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR"
  pieces:
    names:
      A: Archbishop
      C: Chancellor
```

### Glinski (entirely different topology + surface)

```yaml
engine:
  topology:
    type: hex
    shape: hexagonal
    radius: 5
    orientation: flat
  surface:
    base: wood-classic
    colors:
      cell-mid: "#e8ab6f"
  render:
    cellSize: 22
    cellColor: tricolor
  setup:
    "1,4": K
    "-1,5": Q
    "0,5": B
    "0,4": B
    "0,3": B
```

### Tablut (adds zone map)

```yaml
engine:
  topology:
    rows: 9
    cols: 9
  render:
    zones:
      generator: tafl
      params: { size: 9, corners: true }
  setup: "3bbb3/4b4/4w4/b3w3b/bbwwKwwbb/b3w3b/4w4/4b4/3bbb3"
```

### Hnefatafl (bigger, same surface + zones)

```yaml
engine:
  topology:
    rows: 11
    cols: 11
  render:
    cellSize: 34
    zones:
      generator: tafl
      params: { size: 11, corners: true }
  setup: "3bbbbb3/5b5/11/b4w4b/b3www3b/bb1wwKww1bb/b3www3b/b4w4b/11/5b5/3bbbbb3"
```

### 9x9 Go (just overrides dimensions)

```yaml
engine:
  topology:
    rows: 9
    cols: 9
  setup: ""
```

### Bao (overrides pit layout)

```yaml
engine:
  topology:
    cols: 8
    rows: 4
    stores: false
  render:
    cellSize: 20
    markers: [4, 27]
    cornerRadius: 18
  surface:
    base: earth
    colors:
      board-outer: "#6B4C28"
      board-inner: "#8A6538"
  setup: "0,0,0,0,0,0,0,0,2,2,2,2,2,2,2,2;0;2,2,2,2,2,2,2,2,0,0,0,0,0,0,0,0;0"
```

### Alice Chess (multi-board)

```yaml
engine:
  render:
    cellSize: 34
    layers:
      count: 2
      layout: horizontal
      labels: [Board A, Board B]
  setup:
    - "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
    - "8/8/8/8/8/8/8/8"
```

### Dou Shou Qi (jungle surface + zones)

```yaml
engine:
  topology:
    type: grid
    rows: 9
    cols: 7
  surface: jungle
  render:
    cellSize: 40
    cellColor: uniform
    labels: false
    zones:
      generator: jungle
  pieces:
    set: mce-jungle
    vocabulary:
      E: { type: elephant, color: white }
      L: { type: lion, color: white }
      T: { type: tiger, color: white }
      P: { type: leopard, color: white }
      D: { type: dog, color: white }
      W: { type: wolf, color: white }
      C: { type: cat, color: white }
      R: { type: rat, color: white }
    borders:
      white: "#1565c0"
      black: "#c62828"
  setup: "l5t/1d3c1/r1p1w1e/7/7/7/E1W1P1R/1C3D1/T5L"
  players: [white, black]
```

### Twilight Imperium 6p (seeded hex)

```yaml
engine:
  topology:
    type: hex
    shape: hexagonal
    radius: 3
  surface: cosmic
  render:
    cellSize: 40
    cellColor: uniform
    seed: 42
    layout: "6p"
```

---

## Unified Field Reference

| Field | Replaces | Scope |
|-------|----------|-------|
| `topology.rows` | rows, hexRows, boardRows | structure |
| `topology.cols` | cols, hexCols, pitsPerSide | structure |
| `topology.radius` | radius, hexRadius | structure |
| `topology.sideLength` | sideLength | structure |
| `topology.ranks` | grid, fileLengths, rankWidths | structure |
| `topology.shape` | shape, boardShape | structure |
| `topology.orientation` | flat (bool) | structure |
| `topology.positions` | positions | structure |
| `topology.layout` | layout (cells/intersections) | structure |
| `surface` | all per-game colour blocks | appearance |
| `render.cellSize` | tileSize, hexSize, pitRadius, holeSpacing | layout |
| `render.canvasSize` | boardSize | layout |
| `render.cellColor` | style, hexColorFn | layout |
| `render.frame` | hexFrame | layout |
| `render.labels` | showLabels | layout |
| `render.zones` | cellMap, all JS cellMap functions | layout |

---

## Migration Strategy

### Phase 1: Define surfaces
Create 9 named surface definitions in `packages/surface/builtins/`.

### Phase 2: Add family defaults (41 families)
Add `engine:` block to each `rulebook.md`. Covers: topology, surface ref, render, pieces, players.

### Phase 3: Add variant setup + overrides (315 variants)
Add `setup:` + any override fields. Most variants are just a setup string.

### Phase 4: Board studio reads dynamically
Replace GAMES object: load surface → load family → merge variant → render.

### Phase 5: Retire boards.js
Delete the 2642-line file.

---

## Complete Family Coverage

| Family | Topology | Surface | cellColor | Variants |
|--------|----------|---------|-----------|----------|
| moddable-chess | grid | wood-classic | checkered | 102 |
| go | grid (intersections) | wood-light | uniform | 14 |
| xiangqi | grid (intersections) | wood-light | uniform | 7 |
| draughts | grid | wood-classic | checkered | 20 |
| reversi | grid | felt-green | uniform | 3 |
| shogi | grid | wood-light | uniform | 22 |
| morris | graph | slate | uniform | 7 |
| fanorona | grid | jungle | uniform | 1 |
| backgammon | track | parchment | — | 8 |
| mancala | pit | earth | — | 8 |
| halma | grid | wood-classic | checkered | 2 |
| stern-halma | star | slate | — | 5 |
| hex | hex | slate | uniform | 9 |
| royal-ur | grid + zones | parchment | uniform | 1 |
| surakarta | grid | parchment | uniform | 1 |
| tafl | grid + zones | parchment | uniform | 4 |
| pachisi | grid + zones | parchment | uniform | 3 |
| chaupar | grid + zones | parchment | uniform | 1 |
| landlords-game | track | parchment | — | 3 |
| dungeon-chess | grid + zones | military | uniform | 3 |
| nukes | hex | cosmic | uniform | 5 |
| talisman-worlds | hex | cosmic | uniform | 2 |
| mongo | hex | cosmic | uniform | 1 |
| twilight | hex | cosmic | uniform | 7 |
| endless-skies | hex | cosmic | uniform | 1 |
| harvesters | hex | cosmic | uniform | 7 |
| standard-52 | none | felt-green | — | 12 |
| flower-48 | none | felt-green | — | 3 |
| standard-dice | none | felt-green | — | 3 |
| mahjong | none | felt-green | — | 4 |
| double-six-dominoes | none | felt-green | — | 3 |
| bavarian-32 | none | felt-green | — | 1 |
| baristasaurus | none | felt-green | — | 1 |
| econopoly | track | parchment | — | 1 |
| dnd-5e | none | — | — | 1 |
| ironsworn | none | — | — | 1 |
| agon | hex | cosmic | bicolor | 1 |
| asalto | graph | parchment | uniform | 2 |
| dou-shou-qi | grid + zones | jungle | uniform | 1 |
| lattaque | grid + zones | military | uniform | 4 |
| nyout | graph | parchment | uniform | 1 |

---

## Non-Standard Topology Variants (deferred — 11)

circular-chess, chess-in-the-round, byzantine-chess, cylindrical-chess, klein-bottle-chess, mobius-strip-chess, rollerball, raumschach, spherical-chess, san-kwo-ki, sankaku-shogi

---

## Key Design Decisions

1. **Surface separates appearance from structure.** 9 named surfaces cover 315 variants. Per-game colour blocks eliminated.

2. **Surface is a cascade layer.** Surface provides colour defaults → family can override → variant can override. Three-level deep merge.

3. **render block has NO colours.** It handles sizing, strategy selection, and structural layout only. All visual treatment flows from surface.

4. **Zone maps define structure, surfaces define appearance.** `render.zones` says "this cell is a throne". Surface says "thrones are #8b4513". Complete separation.

5. **cellColor is a strategy name, not a style.** It tells the renderer which algorithm to use for distributing surface colours across cells. The actual colours come from the surface.

6. **topology.layout replaces the go/chess/xiangqi distinction.** `intersections` vs `cells` is structural (where pieces sit). The visual treatment (line weight, star points) comes from surface.

7. **Surfaces are extensible.** Users can define custom surfaces for custom games. The 9 built-ins cover all existing games.

8. **Most variants are just a setup string.** With family defaults + named surface, a typical variant override is 1-3 lines.
