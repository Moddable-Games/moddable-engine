# Render Schema Spec (v2 — Normalized)

## Purpose

Define the full data contract between moddable-rules frontmatter and the board studio renderer, eliminating all hardcoded config from `boards.js`. Every field needed to render any of the 41 game families and 315+ variants must be expressible in frontmatter alone.

## Design Principles

1. **Topology-agnostic naming.** No field name references a specific topology. `cellSize` not `hexSize`/`tileSize`. `rows`/`cols` not `hexRows`/`hexCols`.
2. **Concepts over implementations.** Fields describe WHAT (shape, colouring, orientation) not HOW (which JS function to call).
3. **Minimal per-variant config.** Family defaults cover 80%+ of fields. Variants only declare what differs.
4. **Extensible colour maps.** Colours are a flat key:value object. Any cell type name maps to any colour. No predefined colour key vocabulary.

## Cascade Model

```
family defaults (rulebook.md engine: block)
  └─ variant overrides (variant.md engine: block)
```

Deep-merge: variant wins on conflict at any depth. A variant can override topology type, dimensions, piece set, colours — anything.

---

## Top-Level Schema

```yaml
engine:
  topology: { ... }       # spatial structure
  setup: "..."            # position notation
  players: [...]          # player identifiers
  render: { ... }         # visual presentation
  pieces: { ... }         # piece set + vocabulary
  plugins: { ... }        # behavioural rules (existing)
  components: { ... }     # deck/dice (existing)
```

---

## topology: block

Defines spatial structure. Unified field names across all types.

### Universal fields (available on any topology type)

| Field | Type | Meaning |
|-------|------|---------|
| `type` | string | `grid` / `hex` / `track` / `pit` / `graph` / `star` / `none` |
| `rows` | int | row count |
| `cols` | int | column count |
| `radius` | int | concentric ring count from centre |
| `positions` | int | total position count (track) |
| `sideLength` | int | edge length (triangular shapes) |
| `shape` | string | board outline (see below) |
| `ranks` | int[] | per-rank cell counts for irregular boards |

### type: grid

```yaml
topology:
  type: grid
  rows: 8
  cols: 8
  layout: cells | intersections | cross   # default: cells
  wrap: none | horizontal | vertical | both
  zones:                    # named regions (palace, river, fortress)
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
  # Sizing (use ONE):
  radius: 5              # hexagonal shape
  rows: 9                # rhombus shape
  cols: 9
  sideLength: 12         # triangular shape
  ranks: [9,10,11,12,12,11,10,9]  # irregular shape
  orientation: flat | pointy       # default: flat
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
  cols: 6                # pits per side
  rows: 2 | 4           # board rows (2=standard, 4=Bao)
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

## setup: field

Position notation. Format is topology-native.

```yaml
# Grid — FEN (rank-separated):
setup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"

# Grid — multi-board (array of FENs):
setup:
  - "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
  - "8/8/8/8/8/8/8/8"

# Hex — axial coordinate map:
setup:
  "1,4": K
  "-1,5": Q

# Track — position:count+colour:
setup: "0:2W,5:5B,7:3B,11:5W,12:5B,16:3W,18:5W,23:2B"

# Pit — seeds per pit (semicolons = rows + stores):
setup: "4,4,4,4,4,4;0;4,4,4,4,4,4;0"

# Graph — node:piece map:
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

## render: block

Visual presentation. Fully topology-agnostic field names.

### Universal fields

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `cellSize` | int | 40 | pixel size of one cell/tile/hex/pit |
| `canvasSize` | int | auto | total SVG canvas size (non-tiled renderers) |
| `labels` | bool | true | show coordinate labels |
| `cellColor` | string | checkered | colouring strategy (see below) |
| `orientation` | string | — | `flat` / `pointy` (hex); could extend to rotated grids |
| `frame` | string | auto | outer boundary: `rectangle` / `rhombus` / `triangle` / `star` / `ellipse` / `none` |
| `background` | string | "#2c2c2c" | SVG background fill |

### cellColor strategies

Named colouring algorithms. The renderer has these built in; frontmatter references by name.

| Name | Effect | Used by |
|------|--------|---------|
| `checkered` | alternating 2 colours | chess, draughts, halma |
| `tricolor` | 3-colour mod pattern | Glinski hex, McCooey |
| `bicolor` | alternating 2 colours (rings) | Agon |
| `uniform` | single colour all cells | go, hex, shogi, morris |
| `none` | transparent / no fill | intersection-layout boards |

### colors: object

Flat key:value map. Keys are semantic role names, values are CSS colour strings. No predefined vocabulary — any cell type or role can map to any colour.

```yaml
render:
  colors:
    cell-light: "#f0d9b5"      # primary cell fill
    cell-dark: "#b58863"       # secondary cell fill
    cell-mid: "#e8ab6f"        # tertiary (tricolor)
    stroke: "rgba(0,0,0,0.15)" # cell borders
    background: "#2c2c2c"      # canvas background
    # Zone colours (cell map roles):
    floor: "#d4c4a8"
    water: "#4a90c8"
    throne: "#8b4513"
    corner: "#4a6741"
    river: "#4a90c8"
    den: "#4a3520"
    trap: "#c8963c"
    rosette: "#c4956a"
    castle: "#c0622f"
    home: "#8b1a1a"
    lake: "#4a7ab5"
    # Mancala/pit:
    board-outer: "#7A5A32"
    board-inner: "#9B7740"
    pit: "#4E3320"
    seed: "#C8B898"
    # Stroke variants:
    stroke-floor: "#2a2a2a"
    stroke-pit: "#3A2515"
```

### zones: block (terrain / cell maps)

Replaces hardcoded cellMap functions. Declarative zone definitions.

```yaml
render:
  zones:
    # Generator-based (parametric):
    generator: tafl
    params: { size: 9, corners: true }

    # OR explicit string grid (small boards):
    map: |
      rfff..rf
      ffffrfff
      rfff..rf

    # OR inline zone list (for topology.zones):
    # (already declared in topology block)
```

### layers: block (multi-board)

```yaml
render:
  layers:
    count: 2
    layout: horizontal | vertical
    labels: ["Board A", "Board B"]
    # Per-layer colour overrides:
    colors:
      - { cell-light: "#a0c8e8", cell-dark: "#6a9ec8" }
      - { cell-light: "#d4a080", cell-dark: "#a06848" }
```

### Pit/mancala-specific

```yaml
render:
  shape: rectangle | ellipse        # board outline
  cornerRadius: 18
  markers: [4, 27]                  # special pit indices (nyumba)
  storeSize: [24, 50]               # [rx, ry] for oval stores
```

### Graph-specific

```yaml
render:
  rings: 3                # concentric ring count (morris)
  diagonals: true         # corner diagonals
```

### Star-specific

```yaml
render:
  holeSpacing: 30         # distance between positions
```

### Feature flags

```yaml
render:
  centreMarker: "★"       # special marker on centre cell
  seed: 12345             # RNG seed for procedural layouts
  layout: "6p"            # named layout variant (Twilight player counts)
```

---

## pieces: block

```yaml
pieces:
  set: mce-fairy-complete
  vocabulary:
    K: { type: king, color: white }
    k: { type: king, color: black }
    # ...
  fenMap:                  # override FEN char → piece ID mapping
    E: wElephant
    L: wLion
  names:                   # display names for UI
    K: King
    A: Archbishop
  borders:                 # per-player piece border colours
    white: "#1565c0"
    black: "#c62828"
```

---

## Cascade Resolution Algorithm

```
1. Load family engine: block from rulebook.md
2. Load variant engine: block from variant.md
3. Deep-merge: variant over family (variant wins at every depth)
4. Derive defaults for missing fields:
   - render.cellColor: derive from topology.type if absent
     grid → checkered, hex → tricolor, pit/track/graph/star → uniform
   - render.frame: derive from topology.shape if absent
     rhombus → rhombus, triangular → triangle, hexagonal → none, star → star
   - render.labels: true for grid, false for others
5. Validate: topology.type + setup present for all board games
```

---

## Family-Level Defaults — Examples

### Chess

```yaml
engine:
  topology:
    type: grid
    rows: 8
    cols: 8
  render:
    cellSize: 40
    cellColor: checkered
    colors:
      cell-light: "#f0d9b5"
      cell-dark: "#b58863"
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

### Go

```yaml
engine:
  topology:
    type: grid
    rows: 19
    cols: 19
    layout: intersections
  render:
    cellSize: 20
    cellColor: uniform
    labels: true
    colors:
      cell-light: "#dcb35c"
      stroke: "#2a2a2a"
  pieces:
    set: playstrategy-go-classic
    vocabulary:
      w: { type: stone, color: white }
      b: { type: stone, color: black }
  players: [black, white]
```

### Mancala

```yaml
engine:
  topology:
    type: pit
    cols: 6
    rows: 2
    stores: true
  render:
    cellSize: 22
    shape: rectangle
    colors:
      board-outer: "#7A5A32"
      board-inner: "#9B7740"
      pit: "#4E3320"
      seed: "#C8B898"
  pieces:
    set: playstrategy-oware
  players: [south, north]
```

---

## Variant Override Examples

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

### Glinski (overrides topology type entirely)

```yaml
engine:
  topology:
    type: hex
    shape: hexagonal
    radius: 5
    orientation: flat
  render:
    cellSize: 22
    cellColor: tricolor
    colors:
      cell-light: "#ffce9e"
      cell-dark: "#d18b47"
      cell-mid: "#e8ab6f"
      stroke: "rgba(0,0,0,0.15)"
      background: "#2c2c2c"
  setup:
    "1,4": K
    "-1,5": Q
    "0,5": B
    "0,4": B
    "0,3": B
```

### Brusky (irregular hex board)

```yaml
engine:
  topology:
    type: hex
    shape: irregular
    ranks: [9, 10, 11, 12, 12, 11, 10, 9]
    orientation: pointy
  render:
    cellSize: 20
    cellColor: tricolor
```

### Bao (4-row mancala with markers)

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

### Tablut (grid + zones)

```yaml
engine:
  topology:
    type: grid
    rows: 9
    cols: 9
  render:
    cellSize: 40
    cellColor: uniform
    labels: false
    zones:
      generator: tafl
      params: { size: 9, corners: true }
    colors:
      floor: "#d9c5a0"
      throne: "#8b4513"
      corner: "#4a6741"
      stroke: "#8b7355"
  setup: "3bbb3/4b4/4w4/b3w3b/bbwwKwwbb/b3w3b/4w4/4b4/3bbb3"
  pieces:
    vocabulary:
      K: { type: king, color: white }
      w: { type: stone, color: white }
      b: { type: stone, color: black }
```

### Twilight Imperium (seeded hex)

```yaml
engine:
  topology:
    type: hex
    shape: hexagonal
    radius: 3
  render:
    cellSize: 40
    seed: 42
    layout: "6p"
    cellColor: uniform
```

---

## Unified Field Reference

| Field | Replaces | Available on |
|-------|----------|--------------|
| `topology.rows` | rows, hexRows, boardRows | grid, hex, pit |
| `topology.cols` | cols, hexCols, pitsPerSide | grid, hex, pit |
| `topology.radius` | radius, hexRadius | hex, star |
| `topology.sideLength` | sideLength | hex (triangular) |
| `topology.ranks` | grid, fileLengths, rankWidths | hex (irregular) |
| `topology.shape` | shape, boardShape | hex, pit, render |
| `topology.orientation` | flat (bool) | hex |
| `topology.positions` | positions | track |
| `topology.layout` | layout (cells/intersections) | grid |
| `render.cellSize` | tileSize, hexSize, pitRadius, holeSpacing | all |
| `render.canvasSize` | boardSize | graph, star |
| `render.cellColor` | style (partially), hexColorFn | all |
| `render.frame` | hexFrame | hex, star |
| `render.labels` | showLabels | all |
| `render.colors.*` | all specific colour keys | all |

---

## Migration Strategy

### Phase 1: Add family defaults (41 families)
Add `engine:` block to each `rulebook.md`. Covers: topology, render, pieces, players.

### Phase 2: Add variant setup + overrides (315 variants)
Add `setup:` + any override fields to each variant `.md`.

### Phase 3: Board studio reads dynamically
Replace GAMES object with: load family → merge variant → pass to renderer.

### Phase 4: Retire boards.js
Delete the 2642-line file once all variants render from frontmatter.

---

## Complete Family Coverage (41 families)

| Family | Topology | cellColor | Variants |
|--------|----------|-----------|----------|
| moddable-chess | grid | checkered | 102 |
| go | grid (intersections) | uniform | 14 |
| xiangqi | grid (intersections) | uniform | 7 |
| draughts | grid | checkered / uniform | 20 |
| reversi | grid | uniform | 3 |
| shogi | grid | uniform | 22 |
| morris | graph | uniform | 7 |
| fanorona | grid | uniform | 1 |
| backgammon | track | — | 8 |
| mancala | pit | — | 8 |
| halma | grid | checkered | 2 |
| stern-halma | star | — | 5 |
| hex | hex | uniform | 9 |
| royal-ur | grid + zones | uniform | 1 |
| surakarta | grid | uniform | 1 |
| tafl | grid + zones | uniform | 4 |
| pachisi | grid + zones | uniform | 3 |
| chaupar | grid + zones | uniform | 1 |
| landlords-game | track | — | 3 |
| dungeon-chess | grid + zones | uniform | 3 |
| nukes | hex | uniform (seeded) | 5 |
| talisman-worlds | hex | uniform (seeded) | 2 |
| mongo | hex | uniform (seeded) | 1 |
| twilight | hex | uniform (seeded) | 7 |
| endless-skies | hex | uniform (seeded) | 1 |
| harvesters | hex | uniform (seeded) | 7 |
| standard-52 | none | — | 12 |
| flower-48 | none | — | 3 |
| standard-dice | none | — | 3 |
| mahjong | none | — | 4 |
| double-six-dominoes | none | — | 3 |
| bavarian-32 | none | — | 1 |
| baristasaurus | none | — | 1 |
| econopoly | track | — | 1 |
| dnd-5e | none | — | 1 |
| ironsworn | none | — | 1 |
| agon | hex | bicolor | 1 |
| asalto | graph | uniform | 2 |
| dou-shou-qi | grid + zones | uniform | 1 |
| lattaque | grid + zones | uniform | 4 |
| nyout | graph | uniform | 1 |

---

## Non-Standard Topology Variants (deferred — 11)

circular-chess, chess-in-the-round, byzantine-chess, cylindrical-chess, klein-bottle-chess, mobius-strip-chess, rollerball, raumschach, spherical-chess, san-kwo-ki, sankaku-shogi

---

## Key Design Decisions

1. **No topology-specific field names.** `cellSize` serves hex, grid, pit, star equally. `rows`/`cols` works for grid AND pit AND hex-rhombus.

2. **cellColor replaces render.style.** The old `style: checkered | go | shogi` was really just "what colour pattern do cells get?" The actual renderer is selected by topology.type, not a style string.

3. **Colours are a flat semantic map.** No predefined vocabulary. If your board has "lava" zones, add `lava: "#ff4500"` to colors. The renderer matches zone type names to colour keys.

4. **Zones replace cellMaps.** Either a generator reference (parametric) or an inline string grid. No JS functions in config.

5. **Irregular hex boards use ranks array.** `[9,10,11,12,12,11,10,9]` is simpler and more portable than a custom grid-generation function.

6. **orientation replaces flat: bool.** More semantic, extensible to grid rotation later.

7. **topology.layout replaces render.style for grid sub-types.** `intersections` (go/xiangqi) vs `cells` (chess) is a topology concern (where pieces sit), not a render concern.

8. **Human-readable fields stay in markdown body.** Engine block is machine-only.
