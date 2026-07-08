# Render Schema Spec (v6 — Content Layer + 5 Topologies)

## Purpose

Define the full data contract between moddable-rules frontmatter and the board studio, eliminating all hardcoded config from `boards.js`. Covers all 41 game families and 315+ variants: board games, card games, dice games, tile games, and RPG references.

## Design Principles

1. **Topology-agnostic naming.** No field name references a specific topology.
2. **Concepts over implementations.** Fields describe WHAT not HOW.
3. **Minimal per-variant config.** Family defaults + named surfaces cover 95%+ of fields.
4. **Surfaces are reusable.** ~9 named surfaces serve all 315 variants.
5. **Four concerns, cleanly separated:**
   - **Topology** — where things are (structure, geometry)
   - **Surface** — how the board looks (colours, texture, material)
   - **Render** — how to draw it (sizing, layout, features)
   - **Meta** — what the UI shows humans (labels, descriptions, tags)

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
  topology: { ... }       # spatial structure (board games)
  setup: "..."            # position notation
  players: [...]          # player identifiers
  surface: "wood-classic" # named surface (or inline override)
  render: { ... }         # layout + sizing + features
  pieces: { ... }         # piece set + vocabulary
  content: { ... }        # external structured data (complex boards, RPG)
  components: { ... }     # deck/dice/tiles (non-spatial games)
  plugins: { ... }        # behavioural rules (existing)

meta:                       # presentation metadata (sibling to engine:)
  label: "Capablanca"
  description: "..."
  tags: [...]
```

---

## topology: block

Defines spatial structure. Unified field names across all types.

### Universal fields

| Field | Type | Meaning |
|-------|------|---------|
| `type` | string | `grid` / `hex` / `track` / `pit` / `graph` / `none` |
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

Covers ALL node-based games: morris, nyout, asalto, stern-halma (star), and any future node-edge board.

```yaml
topology:
  type: graph
  # Explicit node/edge definition (custom boards):
  nodes: [a1, a4, a7, ...]
  edges:
    - [a1, d1]
    - [d1, g1]

  # OR parametric structure (eliminates game-named generators):
  structure: concentric-rings | perimeter-cross | grid-cross | star | custom
  params:
    # concentric-rings (morris family):
    rings: 3
    midpoints: true
    diagonals: false
    # perimeter-cross (nyout family):
    sides: 4
    nodesPerSide: 5
    diagonals: true
    intermediatesPerDiagonal: 2
    # grid-cross (asalto/fox-and-geese family):
    rows: [[2,3,4], [2,3,4], [0,1,2,3,4,5,6], [0,1,2,3,4,5,6], [0,1,2,3,4,5,6], [2,3,4], [2,3,4]]
    fortressRows: 2
    diagonals: true
    # star (stern-halma/chinese-checkers family):
    arms: 6
    armSize: 4          # nodes per arm
    spacing: 24         # inter-node distance
```

When `structure` is provided, the renderer computes nodes/edges from params. When explicit `nodes`/`edges` are provided, they are used directly. Both produce the same data shape.

Star boards are graph nodes with hex-spaced positions and zone-coloured arm regions. The "star-ness" is visual (arm polygon fills, frame shape) — handled by decorations and zones, not topology.

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

### Treatments (visual recipes for content types)

When `content:` provides per-position type data, `surface.treatments` maps those types to visual recipes. The renderer applies the recipe without knowing what game it's drawing.

```yaml
surface:
  base: parchment
  colors:
    lot: "#6a9a50"
    railroad: "#d4889a"
    franchise: "#d4c060"
    corner: "#d4c898"
  treatments:
    lot: stripe              # colour band at cell edge
    railroad: stripe
    franchise: stripe
    corner: medallion        # circular frame
    jail: bars               # vertical bar lines
    'go-to-jail': split      # diagonal split cell
```

Treatment types are a fixed vocabulary (the renderer must implement each):

| Treatment | Visual effect | Used by |
|-----------|---------------|---------|
| `stripe` | Colour band at cell edge (top/side depending on orientation) | Landlords lots, Monopoly properties |
| `medallion` | Circular frame with inner text | Landlords 1904 corners |
| `split` | Diagonal split with two fills | Landlords 1906 jail/chance combo |
| `bars` | Vertical lines over cell | Jail corners |
| `arc` | Circular arc within cell | Landlords 1932 Wages/fare corners |
| `tint` | Background fill from surface.colors | Zone highlights (general) |
| `none` | Default rendering | Most cells |

This is extensible — new treatment types can be added without modifying topology or content logic. A treatment is a pure function: (cell geometry, surface colours, content data) → SVG elements.

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

**No game-named generators.** Every zone definition is either an inline map, declarative positions, or a parametric pattern with universal parameters. The renderer never needs to know the game name to draw zones.

```yaml
render:
  zones:
    # String grid — each char is a zone type key (surface maps key → colour):
    map: |
      ...t...
      .......
      .......
      t..T..t
      .......
      .......
      ...t...

    # OR declarative positions:
    cells:
      - type: throne
        at: [4,4]
      - type: corner
        at: [[0,0], [0,8], [8,0], [8,8]]
      - type: rosette
        at: [[0,3], [0,7], [2,3], [4,3], [4,7]]

    # OR parametric pattern (no game names):
    pattern: symmetric-points
    params:
      centre: true
      corners: true
      edgeMidpoints: false
```

Zone type keys are single chars (in map) or strings (in cells). Surface definition maps them to colours:

```yaml
surface:
  base: parchment
  colors:
    throne: "#8b4513"
    corner: "#2e7d32"
    rosette: "#c49040"
```

### decorations (visual overlays)

Structural visual elements rendered on top of the base board. Not interactable cells — purely visual. Separated from zones because they describe rendering behaviour, not cell types.

```yaml
render:
  decorations:
    # Star points (go, shogi, xiangqi):
    - type: markers
      style: dot            # dot | cross | ring
      size: 3               # radius in px
      at: [[2,2], [6,6], [2,6], [6,2]]  # explicit positions
      # OR parametric:
      auto: star-points     # auto-calculate for board size (9→4, 13→5, 19→9)

    # Promotion zones (shogi):
    - type: tint
      region: { rows: [0,2] }     # all cols
      color: promotion            # key into surface.colors

    # River (xiangqi):
    - type: gap
      between: [4, 5]             # gap between row 4 and row 5

    # Palace diagonals (xiangqi):
    - type: diagonals
      region: { rows: [0,2], cols: [3,5] }

    # Orbital arcs (surakarta):
    - type: arcs
      rings: 2                    # concentric orbital track count
      cornerOffset: 2             # distance from corner

    # Frame border (shaped boards):
    - type: border
      style: shaped               # follows board edge geometry
      width: 14
      color: border               # key into surface.colors
```

### trackStyle (visual rendering of track topology)

```yaml
render:
  trackStyle: triangular-points | dots | numbered | bar
  # triangular-points: backgammon triangle shape
  # dots: simple circles at positions
  # numbered: positions with number labels
  # bar: central bar divider
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

# Graph (star structure) — filled arms:
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

## content: block

External structured data that the renderer needs to populate complex surfaces — per-position labels, card text, oracle tables, space properties. Separates content from structure (topology) and appearance (surface).

This is the bridge between "what's on the board" (structural) and "what does the user see/read" (presentational).

### Schema

```yaml
engine:
  content:
    source: path/to/data.json           # external file (relative to variant dir)
    # OR inline for small datasets:
    data: [...]

    # How to interpret the data — rendering contract:
    schema:
      type: position-list | category-list | oracle-tables
      fields:
        name: { display: true }
        type: { mapTo: surface }         # type field maps to surface colours
        rent: { display: true, prefix: "Rent $" }
        price: { display: true, prefix: "$" }
      # Category rendering (RPG, card databases):
      categories:
        - id: spells
          label: Spells
          file: spells.json              # relative to source dir
          search: [name, school.name]
          tag: { field: level, prefix: "Lvl " }
        - id: monsters
          label: Monsters
          file: monsters.json
          search: [name, type]
          tag: { field: challenge_rating, prefix: "CR " }
      # Card display template (how to render each item):
      card:
        title: name
        meta: [level, school.name]       # fields shown as subtitle
        body: desc[0]                    # truncated description
      # Link pattern:
      links:
        base: https://rules.moddable.games/dnd-5e
        pattern: "{category}/{group}/"   # interpolated per item
```

### Use cases

#### Property track (Landlords, Econopoly)

```yaml
engine:
  topology:
    type: track
    positions: 40
    shape: circuit
  surface: parchment
  content:
    source: board-data.json
    schema:
      type: position-list
      fields:
        name: { display: true }
        type: { mapTo: surface }
        rent: { display: true, prefix: "Rent $" }
        price: { display: true, prefix: "$" }
        side: { layout: true }
```

The surface then maps content.type values to visual treatments:

```yaml
surface:
  base: parchment
  colors:
    lot: "#6a9a50"
    railroad: "#d4889a"
    franchise: "#d4c060"
  treatments:
    lot: stripe            # draw colour band at cell edge
    railroad: stripe
    corner: medallion      # draw circular frame
    jail: bars             # draw bar lines
```

#### RPG reference (D&D 5e, Ironsworn)

```yaml
engine:
  topology:
    type: none
  content:
    source: data/
    schema:
      type: category-list
      categories:
        - id: spells
          label: Spells
          file: spells.json
          search: [name, school.name]
          tag: { field: level, prefix: "Lvl " }
          color: { accent: "#7b5ea7" }
        - id: monsters
          label: Monsters
          file: monsters.json
          search: [name, type]
          tag: { field: challenge_rating, prefix: "CR " }
          color: { accent: "#c0392b" }
      card:
        title: name
        meta: [level, school.name, casting_time, range]
        body: desc[0]
      links:
        base: https://rules.moddable.games/dnd-5e
        pattern: "{category}/"

meta:
  label: "D&D 5e SRD"
  category: rpg
```

#### Board games with space effects (Royal Ur, Pachisi)

```yaml
engine:
  content:
    data:
      - { pos: 4, type: rosette, effect: "Extra roll" }
      - { pos: 8, type: rosette, effect: "Safe square + extra roll" }
      - { pos: 14, type: rosette, effect: "Safe square + extra roll" }
    schema:
      type: position-list
      fields:
        type: { mapTo: surface }
        effect: { display: true }
```

### How content flows through the pipeline

```
1. Loader resolves content.source → fetch JSON
2. Schema.type tells renderer how to iterate the data:
   - position-list: array of objects keyed by position
   - category-list: grouped items with search + card display
   - oracle-tables: roll tables with min/max ranges
3. fields.mapTo: surface → content.type values map to surface.colors keys
4. fields.display: true → values rendered as text in the cell/card
5. surface.treatments → visual recipe applied per content.type
6. card template → how to compose item display (RPG, complex cards)
```

### What content replaces in current code

| Current | Becomes |
|---------|---------|
| `js/landlords-data.json` loaded as `opts.boardData` | `content.source: landlords-1906.json` |
| `RPG_CONFIGS.dnd-5e.categories` | `content.schema.categories` |
| `RPG_CONFIGS.dnd-5e.dataPath` | `content.source: data/` |
| `renderDndCard()` / `renderIronswornCard()` | `content.schema.card` template |
| `CAT_COLORS` | `content.schema.categories[].color` |
| `getItemLink()` | `content.schema.links` |
| Pachisi "safe square" tooltips | `content.data[].effect` |

### Key constraint

Content data is NEVER hardcoded in JS. It lives in:
- JSON files alongside the variant markdown (same directory)
- OR inline in frontmatter for tiny datasets (< 10 items)

The renderer has zero knowledge of what the data means — it only knows the schema contract (position-list, category-list, oracle-tables) and renders accordingly.

---

## meta: block

Presentation metadata for the board studio UI. Lives as a sibling to `engine:` in frontmatter (not nested inside it). Subject to the same cascade: family sets defaults, variant overrides.

### Family-level meta (rulebook.md)

```yaml
meta:
  label: "Chess"                 # family display name
  category: board | card | dice | tile | rpg
  players: "2"                   # player range string
  duration: "10-120 min"         # time range
  surface: felt-green            # table surface for card/dice (shared with engine)
  tags: [abstract, combinatorial, perfect-information]
```

### Variant-level meta (variant.md)

```yaml
meta:
  label: "Capablanca"            # variant display name
  description: "Two extra compound pieces on a 10×8 board."
  setupDesc: "Archbishop and Chancellor flank the Bishops."
  players: "2"                   # override if different from family
  duration: "30-60 min"          # override if different
  tags: [large-board, fairy, compound-pieces]
  author: "José Raúl Capablanca"
  year: 1920
  features:                      # UI feature flags
    handicap: true               # show handicap selector
    randomStart: true            # show randomize button
    hidden: true                 # hidden-information game
```

### Complete field reference

| Field | Level | Derivable? | Purpose |
|-------|-------|------------|---------|
| `label` | both | from H2 heading | display name in dropdown/sidebar |
| `description` | variant | from first paragraph | hover tooltip / sidebar text |
| `setupDesc` | variant | from Setup section | setup summary |
| `category` | family | from topology.type | UI routing: board/card/dice/tile/rpg |
| `players` | both | from engine.players | player count string |
| `duration` | both | no | estimated play time |
| `tags` | both | no | filtering, search, categorization |
| `author` | variant | no | game designer attribution |
| `year` | variant | no | year of invention/publication |
| `features.*` | both | partial | UI feature toggles |
| `nodeNames` | variant | no | position labels for graph games (nyout) |
| `pieceNames` | variant | no | piece tooltips (merge with pieces.names) |

### Tag vocabulary (standardized, extensible)

**Topology tags:** `large-board`, `small-board`, `hex`, `3d`, `multi-board`, `circular`, `irregular`

**Mechanic tags:** `fairy`, `compound-pieces`, `drops`, `hidden-info`, `asymmetric`, `racing`, `territory`, `connection`, `capture`, `climbing`, `trick-taking`, `sowing`, `custodian`, `flanking`

**Era tags:** `historical`, `modern`, `ancient`, `medieval`

**Origin tags:** `european`, `asian`, `african`, `american`, `indian`

---

## components: block

For non-spatial games (cards, dice, tiles) and games that use components alongside a board (backgammon dice, shogi hand). Replaces the `deckGame`, `rpgGame`, and component-specific routing flags.

### Deck (cards)

```yaml
components:
  deck:
    type: standard-52 | flower-48 | bavarian-32 | mahjong-136 | dominoes-28 | custom
    # Standard-52 config:
    suits: [spades, hearts, diamonds, clubs]
    ranks: [A, 2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K]
    jokers: 0 | 1 | 2
    # Hanafuda config:
    months: 12
    cardsPerMonth: 4
    # Dominoes config:
    maxPips: 6 | 9 | 12
    # Mahjong config:
    sets: [bamboo, circles, characters]
    honors: [winds, dragons]
    flowers: true
    # Custom deck:
    cards: [...]           # explicit card list
```

### Dice

```yaml
components:
  dice:
    count: 2
    sides: 6
    type: standard | binary | long    # standard d6, backgammon binary, pachisi long
    doubling: false                   # backgammon doubling cube
```

### Hand / reserve

For games with pieces held off-board (shogi drops, crazyhouse):

```yaml
components:
  hand:
    enabled: true
    source: captured | reserve | dealt
    maxSize: null | 7
```

### Table layout (card/dice display)

Replaces `deckGame`/`rpgGame` routing. Defines how non-board components are visually arranged:

```yaml
components:
  layout:
    type: fan | grid | pile | pool | wall | tableau | none
    # Fan: cards held in arc (hand games)
    # Grid: cards in rows/cols (tableau games like Klondike)
    # Pile: stacked (discard, draw pile)
    # Pool: scattered (dice games)
    # Wall: linear row (mahjong, dominoes)
    # Tableau: multi-zone (solitaire)
    # None: no visual layout (RPG rules references)
    zones:                 # named areas on the table
      - name: hand
        type: fan
        per: player
      - name: community
        type: grid
        rows: 1
        cols: 5
      - name: pot
        type: pile
        position: center
```

### Component hub examples

#### Standard 52 — family default

```yaml
engine:
  topology:
    type: none
  surface: felt-green
  components:
    deck:
      type: standard-52
      suits: [spades, hearts, diamonds, clubs]
      ranks: [A, 2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K]
    layout:
      type: fan

meta:
  label: "52 Cards"
  category: card
  players: "2-8"
  tags: [cards, classic]
```

Surface here controls the table background, card-back colour, and felt texture — the same `felt-green` surface serves reversi boards AND card table backgrounds. A poker variant could override:

```yaml
engine:
  surface:
    base: felt-green
    colors:
      background: "#0a2e0a"    # darker table
      card-back: "#1a237e"     # navy card backs
```

#### Texas Hold'em — variant

```yaml
engine:
  components:
    layout:
      zones:
        - name: hand
          type: fan
          per: player
        - name: community
          type: grid
          rows: 1
          cols: 5
        - name: pot
          type: pile
          position: center
  setup:
    deal: 2
    community: 5
    players: 6

meta:
  label: "Texas Hold'em"
  description: "Community card poker. Two private, five shared."
  setupDesc: "2 hole cards + 5 community, 6 players"
  players: "2-10"
  duration: "30-120 min"
  tags: [betting, community-cards, bluffing]
```

#### Hanafuda Koi-Koi — variant

```yaml
engine:
  components:
    deck:
      type: flower-48
    layout:
      zones:
        - name: hand
          type: fan
          per: player
          count: 8
        - name: field
          type: grid
          rows: 2
          cols: 4
        - name: draw
          type: pile
  setup:
    deal: 8
    field: 8
    players: 2

meta:
  label: "Koi-Koi"
  description: "Complete a yaku and declare win, or keep playing for more."
  setupDesc: "8 cards each + 8 field, 2 players"
  players: "2"
  tags: [matching, press-your-luck, japanese]
```

#### Yahtzee — variant

```yaml
engine:
  components:
    dice:
      count: 5
      sides: 6
      type: standard
    layout:
      type: pool
      zones:
        - name: active
          type: pool
          count: 5
        - name: kept
          type: grid
          rows: 1
          cols: 5
  setup:
    players: 4
    rounds: 13

meta:
  label: "Yahtzee"
  description: "Five dice, 13 scoring categories, three rolls per turn."
  setupDesc: "5 dice, 13 categories, 1-4 players"
  players: "1-4"
  duration: "20-40 min"
  tags: [dice, press-your-luck, scoring]
```

#### Mahjong Riichi — variant

```yaml
engine:
  components:
    deck:
      type: mahjong-136
      sets: [bamboo, circles, characters]
      honors: [winds, dragons]
      flowers: false
    layout:
      type: wall
      zones:
        - name: hand
          type: fan
          per: player
          count: 13
        - name: wall
          type: wall
        - name: discard
          type: grid
          per: player
  setup:
    deal: 13
    players: 4

meta:
  label: "Riichi"
  description: "Japanese Mahjong. Yaku requirement to win."
  setupDesc: "136 tiles, 4 players, 13-tile hand"
  players: "4"
  duration: "60-120 min"
  tags: [tiles, japanese, yaku, riichi]
```

#### D&D 5e SRD — RPG reference

```yaml
engine:
  topology:
    type: none
  components:
    layout:
      type: none

meta:
  label: "D&D 5e SRD"
  category: rpg
  description: "The open core rules for the world's most popular roleplaying game."
  setupDesc: "Tabletop RPG, 3-6 players"
  players: "3-6"
  tags: [rpg, fantasy, d20]
```

---

## Cascade Resolution Algorithm

```
1. Resolve surface:
   - If string → load named surface definition
   - If object with base → load base, merge overrides
   - If object without base → use as-is
   - Component games use surface for table/background appearance
2. Load family engine: + meta: blocks from rulebook.md
3. Load variant engine: + meta: blocks from variant.md
4. Deep-merge: surface → family → variant (rightmost wins)
   - engine: and meta: merge independently at each level
   - meta.tags: concatenate (variant tags ADD to family tags, not replace)
5. Derive defaults for missing fields:
   - render.cellColor: grid → checkered, hex → uniform, others → none
   - render.frame: from topology.shape if absent
   - render.labels: true for grid, false for others
   - meta.category: from topology.type (grid/hex/graph/star/track/pit → board,
     none + deck → card, none + dice → dice, none + tiles → tile, none alone → rpg)
   - meta.label: from markdown H2 heading if absent
   - meta.description: from first paragraph after H2 if absent
   - meta.players: from engine.players array length if absent
6. Validate:
   - Board games: topology.type + setup required
   - Component games: components.deck or components.dice required
   - All: meta.label must resolve (explicit or derived)
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
      pattern: symmetric-points
      params: { centre: true, corners: true }
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
      pattern: symmetric-points
      params: { centre: true, corners: true }
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
      cells:
        - type: river
          at: [[3,1], [3,2], [4,1], [4,2], [5,1], [5,2], [3,4], [3,5], [4,4], [4,5], [5,4], [5,5]]
        - type: den
          at: [[0,3], [8,3]]
        - type: trap
          at: [[0,2], [0,4], [1,3], [8,2], [8,4], [7,3]]
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
Add `engine:` + `meta:` blocks to each `rulebook.md`:
- engine: topology, surface ref, render, pieces, players, components (card/dice/tile families)
- meta: label, category, players, duration, tags

### Phase 3: Add variant overrides (315 variants)
Each variant gets:
- engine: `setup` + any topology/render/component overrides
- meta: `label`, `description`, `setupDesc`, variant-specific tags

### Phase 4: Board studio reads dynamically
Replace GAMES object: load surface → load family → merge variant → render.
Board studio sidebar populates from resolved meta block.
Component games route through `components.layout` instead of hardcoded flags.

### Phase 5: Retire boards.js
Delete the 2642-line file. All data lives in moddable-rules frontmatter.

---

## Complete Family Coverage

| Family | Category | Topology | Surface | cellColor | Variants |
|--------|----------|----------|---------|-----------|----------|
| moddable-chess | board | grid | wood-classic | checkered | 102 |
| go | board | grid (intersections) | wood-light | uniform | 14 |
| xiangqi | board | grid (intersections) | wood-light | uniform | 7 |
| draughts | board | grid | wood-classic | checkered | 20 |
| reversi | board | grid | felt-green | uniform | 3 |
| shogi | board | grid | wood-light | uniform | 22 |
| morris | board | graph | slate | uniform | 7 |
| fanorona | board | grid | jungle | uniform | 1 |
| backgammon | board | track | parchment | — | 8 |
| mancala | board | pit | earth | — | 8 |
| halma | board | grid | wood-classic | checkered | 2 |
| stern-halma | board | graph (star) | slate | — | 5 |
| hex | board | hex | slate | uniform | 9 |
| royal-ur | board | grid + zones | parchment | uniform | 1 |
| surakarta | board | grid | parchment | uniform | 1 |
| tafl | board | grid + zones | parchment | uniform | 4 |
| pachisi | board | grid + zones | parchment | uniform | 3 |
| chaupar | board | grid + zones | parchment | uniform | 1 |
| landlords-game | board | track | parchment | — | 3 |
| dungeon-chess | board | grid + zones | military | uniform | 3 |
| nukes | board | hex | cosmic | uniform | 5 |
| talisman-worlds | board | hex | cosmic | uniform | 2 |
| mongo | board | hex | cosmic | uniform | 1 |
| twilight | board | hex | cosmic | uniform | 7 |
| endless-skies | board | hex | cosmic | uniform | 1 |
| harvesters | board | hex | cosmic | uniform | 7 |
| standard-52 | card | none | felt-green | — | 12 |
| flower-48 | card | none | felt-green | — | 3 |
| bavarian-32 | card | none | felt-green | — | 1 |
| standard-dice | dice | none | felt-green | — | 3 |
| mahjong | tile | none | felt-green | — | 4 |
| double-six-dominoes | tile | none | felt-green | — | 3 |
| baristasaurus | card | none | felt-green | — | 1 |
| econopoly | board | track | parchment | — | 1 |
| dnd-5e | rpg | none | — | — | 1 |
| ironsworn | rpg | none | — | — | 1 |
| agon | board | hex | cosmic | bicolor | 1 |
| asalto | board | graph | parchment | uniform | 2 |
| dou-shou-qi | board | grid + zones | jungle | uniform | 1 |
| lattaque | board | grid + zones | military | uniform | 4 |
| nyout | board | graph | parchment | uniform | 1 |

---

## Non-Standard Topology Variants (deferred — 11)

circular-chess, chess-in-the-round, byzantine-chess, cylindrical-chess, klein-bottle-chess, mobius-strip-chess, rollerball, raumschach, spherical-chess, san-kwo-ki, sankaku-shogi

---

## Key Design Decisions

1. **Surface separates appearance from structure.** 9 named surfaces cover all 315 variants — board games AND component games. `felt-green` serves both reversi boards and poker tables.

2. **Surface is a cascade layer.** Surface provides colour defaults → family can override → variant can override. Three-level deep merge.

3. **render block has NO colours.** It handles sizing, strategy selection, and structural layout only. All visual treatment flows from surface.

4. **Zone maps define structure, surfaces define appearance.** `render.zones` says "this cell is a throne". Surface says "thrones are #8b4513". Complete separation.

5. **cellColor is a strategy name, not a style.** It tells the renderer which algorithm to use for distributing surface colours across cells. The actual colours come from the surface.

6. **topology.layout replaces the go/chess/xiangqi distinction.** `intersections` vs `cells` is structural (where pieces sit). The visual treatment (line weight, star points) comes from surface.

7. **meta is a sibling block, not nested in engine.** Presentation concerns (labels, descriptions, tags) are for humans/UI. Engine block is for machines/renderers. They cascade independently.

8. **components: replaces all routing flags.** No more `deckGame`, `rpgGame`, `hexGame` booleans. The presence of `components.deck`, `components.dice`, or `topology.type: none` determines the renderer route.

9. **components.layout defines table zones.** Card/dice/tile games need spatial layout too — just not topological. Zones (hand, community, pot, wall, discard) are the component equivalent of board cells.

10. **meta.tags concatenate, not replace.** A variant inherits family tags AND adds its own. `[cards, classic]` + `[betting, bluffing]` = `[cards, classic, betting, bluffing]`.

11. **Surfaces are extensible.** Users can define custom surfaces for custom games. The 9 built-ins cover all existing games.

12. **Most variants are just setup + meta.** With family defaults + named surface, a typical variant override is:
    ```yaml
    engine:
      setup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
    meta:
      label: "Standard"
      description: "Standard FIDE rules."
    ```

13. **No game-named generators.** Zones use `pattern:` with universal params, or explicit `cells:`/`map:` definitions. The renderer never needs game knowledge to produce zone highlights.

14. **Decorations separate visual overlays from structure.** Star points, promotion tints, orbital arcs, river gaps, palace diagonals — all described declaratively in `render.decorations`, not baked into provider logic.

15. **Providers collapse into topology dispatch.** The 14 named providers in board-diagrams.js become 5 topology renderers (grid, hex, track, pit, graph). All game-specific visual behaviour is expressible through zones + decorations + surface treatments without provider branching.

16. **5 spatial topologies + 1 non-spatial.** Grid (covers chess, go, xiangqi, shogi, draughts, alquerque, surakarta — cells or intersections), Hex (all hex-cell games), Track (backgammon, landlords, pachisi), Pit (mancala family), Graph (morris, nyout, asalto, stern-halma/star). Star is not its own topology — it's a graph with `structure: star` and zone decorations for arm regions.

17. **content: provides external structured data.** Complex boards (landlords space properties, RPG card databases, oracle tables) reference external JSON files. The renderer never hardcodes data — it reads a schema contract and renders accordingly. Three schema types: position-list, category-list, oracle-tables.

---

## Provider Elimination Map

How each current board-diagrams.js provider becomes schema-driven:

| Provider | Becomes | Schema expression |
|----------|---------|-------------------|
| `checkered` | grid + cellColor:checkered | topology.type:grid, render.cellColor:checkered, zones for special cells |
| `mono-grid` | grid + cellColor:uniform | topology.type:grid, render.cellColor:uniform |
| `go` | grid + intersections + decorations | topology.layout:intersections, decorations:[{type:markers, auto:star-points}] |
| `surakarta` | grid + intersections + decorations | topology.layout:intersections, decorations:[{type:arcs, rings:2, cornerOffset:2}] |
| `xiangqi` | grid + intersections + decorations | topology.layout:intersections, decorations:[{type:gap, between:[4,5]}, {type:diagonals, region:{rows:[0,2],cols:[3,5]}}] |
| `shogi` | grid + intersections + decorations | topology.layout:intersections, decorations:[{type:markers, at:shogi-hoshi}, {type:tint, region:{rows:[0,2]}, color:promotion}] |
| `nyout` | graph + perimeter-cross | topology.type:graph, structure:perimeter-cross, params:{sides:4, nodesPerSide:5, diagonals:true} |
| `morris` | graph + concentric-rings | topology.type:graph, structure:concentric-rings, params:{rings:3, midpoints:true} |
| `asalto` | graph + grid-cross | topology.type:graph, structure:grid-cross, params:{rows:[[2,3,4],...], fortressRows:2} |
| `alquerque` | grid + intersections + decorations | topology.layout:intersections, decorations:[{type:diagonals, pattern:alternating}] |
| `hex` | hex (already parametric) | topology.type:hex, shape/radius/orientation |
| `mancala` | pit (already parametric) | topology.type:pit, cols/rows/stores |
| `backgammon` | track + trackStyle | topology.type:track, render.trackStyle:triangular-points |
| `stern-halma` | graph + star structure | topology.type:graph, structure:star, params:{arms:6, armSize:4} + zone decorations |
| `landlords` | track + content + surface treatments | topology.type:track, content.source:board-data.json, surface.treatments per type |

### What remains in code

The renderer still needs drawing logic — it isn't eliminated. What changes:

- **Before:** 14 named providers, each with hardcoded game knowledge, colour defaults, and structural assumptions
- **After:** 5 topology renderers (grid, hex, track, pit, graph) + 1 non-spatial (none) that read all visual parameters from the resolved schema object. Zero game knowledge.

Decorations are a composable overlay system — each decoration type (markers, tint, gap, diagonals, arcs, border) is a small pure function that receives position data and surface colours. No decoration knows which game it's drawing for.

### Files eliminated by full migration

| File | Lines | Status |
|------|-------|--------|
| `js/boards.js` | 2642 | **Fully replaced** by frontmatter |
| `js/board-diagrams.js` | 2325 | **Refactored** into 7 topology renderers + decoration system |
| `js/hex-games/*.js` | 2372 | **Already registry-based** — configs move to frontmatter |

Total: ~7300 lines of hardcoded game config → frontmatter + ~800 lines of topology-agnostic rendering code.
