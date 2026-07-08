# Render Schema Spec

## Purpose

Define the full data contract between moddable-rules frontmatter and the board studio renderer, eliminating all hardcoded config from `boards.js`. Every field needed to render any of the 41 game families and 315+ variants must be expressible in frontmatter alone.

## Cascade Model

```
family defaults (rulebook.md engine: block)
  └─ variant overrides (variant.md engine: block)
```

Any field set at family level applies to all variants. Any variant can override any field, including topology type, dimensions, piece set, colours, and board style.

## Top-Level Schema

```yaml
engine:
  topology: { ... }       # spatial structure (required for board games)
  setup: "..."            # position notation (FEN, axial, pit, track, graph)
  players: [...]          # player identifiers
  render: { ... }         # visual config (style, size, colours, layers)
  pieces: { ... }         # piece set + vocabulary + FEN mapping
  plugins: { ... }        # behavioural rules (existing, unchanged)
  components: { ... }     # deck/dice (existing, unchanged)
```

---

## topology: block

Defines the spatial structure. Each type has its own required/optional fields.

### type: grid

```yaml
topology:
  type: grid
  rows: 8
  cols: 8
  # Optional overrides (variant can change any):
  layout: tiles | intersections | cross | points
  river: true          # xiangqi-style river between rows
  palace: true         # xiangqi-style palace zones
  diagonals: true      # diagonal connections (alquerque, tafl)
  wrap: none | horizontal | vertical | both  # toroidal
```

### type: hex

```yaml
topology:
  type: hex
  # Shape (one of):
  radius: 5            # hexagonal (Glinski, Agon)
  shape: hexagonal | rhombus | triangular | irregular
  # For rhombus/rectangular:
  hexRows: 9
  hexCols: 9
  # For triangular:
  sideLength: 12
  # For irregular:
  grid: [...ranks]     # rank widths array e.g. [9,10,11,12,12,11,10,9]
  fileLengths: [...]   # alternative: per-file lengths
  # Orientation:
  flat: true | false   # flat-top vs pointy-top
```

### type: track

```yaml
topology:
  type: track
  positions: 24        # total positions
  style: linear | circuit | cross | points
```

### type: pit

```yaml
topology:
  type: pit
  pitsPerSide: 6
  boardRows: 2 | 4    # 2-row (Kalah) or 4-row (Bao)
  hasStores: true
```

### type: graph

```yaml
topology:
  type: graph
  nodes: [a1, a4, ...]
  edges:
    - [a1, d1]
    - [d1, g1]
```

### type: hex-star

```yaml
topology:
  type: hex-star
  arms: 6
  armSize: 10
  centreSize: 61
```

### type: none

For non-spatial games (card games, dice games, RPGs).

```yaml
topology:
  type: none
```

---

## setup: field

Position notation. Format depends on topology type.

```yaml
# Grid (FEN): ranks separated by /
setup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"

# Grid (draughts): w/b/W/B on dark squares
setup: "bbbbbbbb/1bbbbbb1/2bbbb2/8/8/2wwww2/1wwwwww1/wwwwwwww"

# Grid (reversi): simple placement
setup: "8/8/8/3bw3/3wb3/8/8/8"

# Hex (axial position map):
setup:
  "1,4": K
  "-1,5": Q
  "0,5": B

# Track (backgammon point notation):
setup: "0:2W,5:5B,7:3B,11:5W,12:5B,16:3W,18:5W,23:2B"

# Pit (seeds per pit, semicolons separate rows + stores):
setup: "4,4,4,4,4,4;0;4,4,4,4,4,4;0"

# Graph (node → piece):
setup:
  a1: null
  d7: K

# hex-star (filled arms):
setup:
  filledArms: [N, S]

# none (deck game — hands):
setup:
  deal: 13
  players: 4
```

---

## render: block

Visual configuration. Everything the renderer needs beyond spatial structure.

```yaml
render:
  style: checkered | go | hex | mancala | backgammon | morris
         | shogi | xiangqi | stern-halma | alquerque | surakarta
         | nyout | asalto | landlords | mono-grid
  tileSize: 40
  boardSize: 320         # for non-grid renderers (morris, nyout)
  showLabels: true       # rank/file labels

  # Multi-board (Alice, Gygax, bughouse):
  layers:
    count: 2
    layout: horizontal | vertical
    labels: ["Board A", "Board B"]

  # Colours (any/all overridable):
  colors:
    lightSquare: "#f0d9b5"
    darkSquare: "#b58863"
    # Hex:
    lightHex: "#ffce9e"
    darkHex: "#d18b47"
    midHex: "#e8ab6f"
    stroke: "rgba(0,0,0,0.15)"
    background: "#2c2c2c"
    # Mono-grid (reversi):
    monoSquare: "#2e7d32"
    gridLine: "#1b5e20"
    # Mancala:
    boardOuter: "#7A5A32"
    boardInner: "#9B7740"
    pit: "#4E3320"
    seed: "#C8B898"
    # Cell-map specific:
    floor: "#d4c4a8"
    water: "#4a90c8"
    throne: "#8b4513"
    # (extensible — any key:colour pair)

  # Hex-specific:
  hexSize: 22
  hexColorFn: glinski | ring | uniform
  hexFrame: rhombus | triangle | none

  # Cell map (terrain zones):
  cellMap: inline | reference
  # Inline:
  cellMap:
    type: generated
    generator: tafl | jungle | lattaque | royal-ur | pachisi | chaupar
    params: { size: 9, corners: true }
  # Or explicit (small boards):
  cellMap: |
    rfff..rf
    ffffrfff
    rfff..rf

  # Mancala-specific:
  boardShape: rectangle | ellipse
  pitRadius: 22
  storeRx: 24
  storeRy: 50
  cornerRadius: 18
  markers: [4, 27]      # special pit indices

  # Morris-specific:
  rings: 3
  diagonals: true

  # Stern-halma-specific:
  holeSpacing: 30

  # Backgammon: (no extra fields — setup string is sufficient)

  # Feature flags:
  centreMarker: "★"     # agon centre hex
```

---

## pieces: block

Piece set selection, vocabulary, and FEN-to-image mapping.

```yaml
pieces:
  set: mce-fairy-complete     # piece set ID from gallery-index
  # Vocabulary (FEN char → semantic meaning):
  vocabulary:
    K: { type: king, color: white }
    k: { type: king, color: black }
    P: { type: pawn, color: white }
    # etc.
  # FEN overrides (when same char means different things per game):
  fenMap:
    E: wElephant
    L: wLion
  # Display names (for UI tooltips):
  names:
    K: King
    Q: Queen
    A: Archbishop
  # Colour borders (dou-shou-qi style):
  borders:
    white: "#1565c0"
    black: "#c62828"
```

---

## Family-Level Defaults

Added to `rulebook.md` frontmatter as an `engine:` block. Sets defaults for ALL variants in that family.

### Example: Chess family

```yaml
engine:
  topology:
    type: grid
    rows: 8
    cols: 8
  render:
    style: checkered
    tileSize: 40
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

### Example: Mancala family

```yaml
engine:
  topology:
    type: pit
    pitsPerSide: 6
  render:
    style: mancala
    pitRadius: 22
    colors:
      boardOuter: "#7A5A32"
      boardInner: "#9B7740"
      pit: "#4E3320"
      seed: "#C8B898"
  pieces:
    set: playstrategy-oware
  players: [south, north]
```

### Example: Hex family

```yaml
engine:
  topology:
    type: hex
    shape: rhombus
  render:
    style: hex
    hexSize: 20
    hexFrame: rhombus
    hexColorFn: uniform
    colors:
      lightHex: "#e8e8e8"
      darkHex: "#c0c0c0"
      midHex: "#d8d8d8"
      stroke: "rgba(0,0,0,0.3)"
      background: "#f5f5f5"
  pieces:
    set: playstrategy-go-classic
  players: [black, white]
```

---

## Variant Override Examples

### Capablanca (overrides rows/cols from chess family default)

```yaml
engine:
  topology:
    cols: 10             # override: 10-file board
  render:
    tileSize: 36         # override: smaller tiles for wider board
  setup: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR"
  pieces:
    names:
      A: Archbishop
      C: Chancellor
```

### Bao (overrides pitsPerSide, adds 4-row, markers)

```yaml
engine:
  topology:
    pitsPerSide: 8
    boardRows: 4
  render:
    pitRadius: 20
    markers: [4, 27]
    cornerRadius: 18
    colors:
      boardOuter: "#6B4C28"
      boardInner: "#8A6538"
  setup: "0,0,0,0,0,0,0,0,2,2,2,2,2,2,2,2;0;2,2,2,2,2,2,2,2,0,0,0,0,0,0,0,0;0"
```

### Glinski (overrides topology + render from chess family)

```yaml
engine:
  topology:
    type: hex            # override: hex instead of grid
    radius: 5
    shape: hexagonal
  render:
    style: hex           # override: hex renderer
    hexSize: 22
    flat: true
    hexColorFn: glinski
    colors:
      lightHex: "#ffce9e"
      darkHex: "#d18b47"
      midHex: "#e8ab6f"
      stroke: "rgba(0,0,0,0.15)"
      background: "#2c2c2c"
  setup:
    "1,4": K
    "-1,5": Q
    "0,5": B
    "0,4": B
    "0,3": B
    # ... (full position map)
```

### Alice Chess (adds layers)

```yaml
engine:
  render:
    tileSize: 34
    layers:
      count: 2
      layout: horizontal
      labels: [Board A, Board B]
  setup:
    - "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
    - "8/8/8/8/8/8/8/8"
```

---

## Cascade Resolution Algorithm

```
1. Load family engine: block from rulebook.md
2. Load variant engine: block from variant.md
3. Deep-merge variant over family (variant wins on conflict)
4. Resolve render.style:
   - If explicit: use it
   - If absent: derive from topology.type
     grid → checkered (default), go, shogi, xiangqi (by family)
     hex → hex
     track → backgammon
     pit → mancala
     graph → morris
     hex-star → stern-halma
     none → deck/dice/rpg renderer
5. Resolve setup:
   - Required for all board games
   - Format must match topology type
6. Resolve pieces.set:
   - Required for games with pieces on board
   - Gallery-index lookup
7. Validate: all required fields present for the resolved render.style
```

---

## Migration Strategy

### Phase 1: Add family defaults
Add `engine:` block to each `rulebook.md` (41 families). Fields:
- topology (type + default dimensions)
- render (style, default colours, tileSize)
- pieces (set, vocabulary)
- players

### Phase 2: Add variant setup + overrides
For each of 315 variants, add:
- `setup:` — position notation (most critical missing field)
- Any overrides vs family default (different dimensions, colours, etc.)

### Phase 3: Board studio reads dynamically
Replace hardcoded GAMES object in boards.js with:
1. Load family defaults from rules
2. Merge variant overrides
3. Pass resolved config to renderer

### Phase 4: Retire boards.js
Once all variants render correctly from frontmatter alone, delete the 2642-line hardcoded file.

---

## Complete Family Coverage (41 families)

| Family | Topology | Render Style | Variants |
|--------|----------|--------------|----------|
| moddable-chess | grid | checkered | 102 |
| go | grid | go | 14 |
| xiangqi | grid | xiangqi | 7 |
| draughts | grid | checkered/mono-grid | 20 |
| reversi | grid | mono-grid | 3 |
| shogi | grid | shogi | 22 |
| morris | graph | morris | 7 |
| fanorona | grid | alquerque | 1 |
| backgammon | track | backgammon | 8 |
| mancala | pit | mancala | 8 |
| halma | grid | checkered | 2 |
| stern-halma | hex-star | stern-halma | 5 |
| hex | hex | hex | 9 |
| royal-ur | grid | checkered+cellMap | 1 |
| surakarta | grid | surakarta | 1 |
| tafl | grid | checkered+cellMap | 4 |
| pachisi | grid | checkered+cellMap | 3 |
| chaupar | grid | checkered+cellMap | 1 |
| landlords-game | track | landlords | 3 |
| dungeon-chess | grid | checkered+cellMap | 3 |
| nukes | hex | hex (seeded) | 5 |
| talisman-worlds | hex | hex (seeded) | 2 |
| mongo | hex | hex (seeded) | 1 |
| twilight | hex | hex (seeded) | 7 |
| endless-skies | hex | hex (seeded) | 1 |
| harvesters | hex | hex (seeded) | 7 |
| standard-52 | none | deck | 12 |
| flower-48 | none | deck | 3 |
| standard-dice | none | dice | 3 |
| mahjong | none | deck | 4 |
| double-six-dominoes | none | deck | 3 |
| bavarian-32 | none | deck | 1 |
| baristasaurus | none | deck | 1 |
| econopoly | track | landlords | 1 |
| dnd-5e | none | rpg | 1 |
| ironsworn | none | rpg | 1 |
| agon | hex | hex | 1 |
| asalto | graph | asalto | 2 |
| dou-shou-qi | grid | checkered+cellMap | 1 |
| lattaque | grid | checkered+cellMap | 4 |
| nyout | graph | nyout | 1 |

---

## Non-Standard Topology Variants (deferred)

These 11 chess variants need topology extensions before they fit this schema:
- circular-chess, chess-in-the-round, byzantine-chess (circular grid)
- cylindrical-chess, klein-bottle-chess, mobius-strip-chess (wrap topologies)
- rollerball (ring board)
- raumschach (3D 5x5x5)
- spherical-chess (sphere projection)
- san-kwo-ki, sankaku-shogi (triangular grid)

---

## Key Design Decisions

1. **Render style is NOT topology type.** Grid topology can render as checkered, go, shogi, xiangqi, mono-grid, or alquerque. The mapping is usually by family but overridable per variant.

2. **cellMap is declarative, not code.** Terrain zones (dungeon rooms, rivers, rosettes) are expressed as string grids or generator references, not JS functions.

3. **Hex colour functions are named, not code.** `glinski` (3-colour mod), `ring` (alternating rings), `uniform` (single colour). New functions added to renderer, referenced by name.

4. **Hex grids for irregular boards use rank-width arrays.** Brusky `[9,10,11,12,12,11,10,9]`, Shafran `[6,7,8,9,10,9,8,7,6]`. The renderer generates coordinates from these.

5. **Multi-board is a render layer concern.** `layers.count` + per-layer FENs. The renderer composites multiple boards into one SVG.

6. **Seeded hex games (Nukes, Harvesters, etc.) use topology + seed.** The specific tile layout comes from a seeded RNG, not a static position.

7. **Piece vocabulary is per-family with per-variant override.** Standard chess vocabulary covers 90% of chess variants. Asymmetric variants (Empire, Orda, Shinobi) add their own chars.

8. **Human-readable fields (label, variantDesc, setupDesc) stay in the markdown body**, not in the engine block. The engine block is machine-readable only.
