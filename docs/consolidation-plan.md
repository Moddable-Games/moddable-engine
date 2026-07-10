# Provider Consolidation Plan (Revised)

## Status: READY FOR EXECUTION (REWRITTEN 2026-07-09)
## Created: 2026-07-09
## Prerequisite for: Migration to moddable-rules (migration-spec.md)

---

## Critical Context: The Reconciliation

This plan was originally written assuming we'd build NEW renderers in `js/renderers/`.
That was wrong. We already have topology packages (`packages/topology-*/`) with the
correct architecture (self-contained, normalised interfaces, `getLayout()` methods).
Those packages produced inadequate visual output when first tested, so we built the
board studio (`js/board-diagrams.js`) to get polished results — but never fed that
work back into the packages.

**The reconciliation:** The polished rendering logic from board-diagrams.js providers
migrates INTO the corresponding topology packages. The packages become the single
source for both engine logic AND visual rendering. No new `js/renderers/` directory.

### What exists today (two disconnected systems)

| System | Location | Quality | Used by |
|--------|----------|---------|---------|
| Topology packages | `packages/topology-*/` | Correct architecture, inadequate visuals | Tests only |
| Board studio | `js/board-diagrams.js` | Polished visuals, game knowledge baked in | The actual product |
| Render package | `packages/render/` | Layer compositor, works but untested at scale | Tests only |

### What consolidation produces (one unified system)

| Component | Location | Role |
|-----------|----------|------|
| Topology packages | `packages/topology-*/` | Own geometry + polished layout (absorbed from studio) |
| Render package | `packages/render/` | Layer compositor consuming topology layouts |
| Board studio | `js/boards.js` + `boards/index.html` | Thin browser shell, imports from packages |
| board-diagrams.js | Retained as "Original" toggle baseline, eventually deleted |

---

## Goal

Upgrade 5 topology packages to produce publication-quality SVG output matching
what the board studio currently renders, then wire the studio to use the packages.

After consolidation:
- **Topology packages** contain polished rendering (no game names, no game knowledge)
- **boards.js** config objects contain ALL visual/structural options per variant
- Board studio toggle switches between "Original" (current providers) and "Packages" (topology packages via render layer)
- Every variant renders identically in both modes
- `packages/render/` serialises topology output + adds pieces on top

---

## Implementation Approach: Code Move, Not Rewrite

### Why the original packages failed

`getLayout()` returned minimal abstract data — cell centres, line coordinates,
dimensions. The render package couldn't produce quality output because it wasn't
given enough information. All the fiddly detail (exact insets, padding, stroke
widths, arc calculations, multi-layer frames) lived only in board-diagrams.js.

Adding a richer intermediate format between topology and SVG just recreates the
complexity of SVG itself. The abstraction layer adds cost without value.

### Decision: Structured SVG elements (Option A)

Each topology package gets a `renderLayout(config)` method that returns structured
SVG elements — NOT raw strings, NOT abstract layout data:

```javascript
// What the topology package returns:
[
  { tag: 'rect', attrs: { x: 5, y: 5, width: 320, height: 320, fill: '#d9b483' } },
  { tag: 'line', attrs: { x1: 5, y1: 45, x2: 325, y2: 45, stroke: '#8b6914' } },
  { tag: 'circle', attrs: { cx: 165, cy: 165, r: 3, fill: '#333' } },
  // ... all the elements that produce the polished board
]
```

This is trivially:
- Serialised to SVG string (for PNG export, MCP tools, static generation)
- Mounted to DOM (for interactivity, highlighting, animation)
- Tested (assertions on element count, attributes, structure)

### The extraction is a CODE MOVE

Provider code moves bodily from board-diagrams.js into topology packages:

```javascript
// BEFORE (in board-diagrams.js provider):
parts.push(`<rect x="${ox}" y="${oy}" width="${boardW}" height="${boardH}" fill="${monoFill}"/>`)

// AFTER (in topology package):
elements.push({ tag: 'rect', attrs: { x: ox, y: oy, width: boardW, height: boardH, fill: colors.mono } })
```

Same logic. Same pixel values. Same visual output. Structural refactor ONLY.

**What this is NOT:**
- NOT starting from the old bare `getLayout()` and iterating until it matches (weeks wasted)
- NOT writing new rendering logic from scratch
- NOT re-deriving spacing/padding/insets by trial and error

### The split rule during extraction

When moving provider code into a topology package, every line splits into one of:

| Goes INTO the topology package | Stays in CONFIG (boards.js / frontmatter) |
|-------------------------------|------------------------------------------|
| HOW to draw a gap at row N | Row 4 IS the river |
| HOW to draw arcs at radius R | R=1 for inner, R=2 for outer |
| HOW to draw star points at positions P | THESE positions get star points |
| HOW to render text at a gap | The text IS "楚河" / "漢界" |
| HOW to apply zone colours from a map | THIS map string defines zones |

The provider code moves. The game knowledge embedded in it does NOT move with it.

### What packages/render/ becomes

THIN. It does NOT reinterpret or re-layout anything the topology produced:
- Wrap structured elements in SVG document (viewBox, xmlns)
- Add piece images/surfaces on top of topology output at cell positions
- Serialise structured elements to SVG string
- Optionally mount to DOM for interactivity

---

## Guiding Principle: Diagrams Are Game Surfaces

These renderers produce **playable game boards**, not static illustrations.
Every position where a piece/token can exist must be an addressable cell.
The setup notation references exact position IDs. The renderer must update
individual cells at runtime. Decorations are separate from positions.

---

## Safety Mechanism: Dual-Mode Toggle

### How it works

1. Rename current toggle from "Legacy/Schema" to "Original/Packages"
2. "Original" mode uses existing board-diagrams.js providers unchanged (the baseline)
3. "Packages" mode uses topology packages via render package (the target)
4. Both render switchable per-variant
5. Visual diff: export SVG from both, compare

### Pipeline: Original mode (current, stays working throughout)

```
boards.js GAMES config → board-diagrams.js provider → SVG
```

### Pipeline: Packages mode (target, built incrementally)

```
boards.js GAMES config
    ↓
reverse-adapter.js (temporary bridge)
    ↓
Schema format (topology + surface + render + content + pieces)
    ↓
Topology package getLayout() — UPGRADED with polished rendering
    ↓
packages/render/ layer compositor
    ↓
SVG output
```

### Acceptance criteria

A provider can be deleted ONLY when:
- Every variant that used it renders identically under the Packages mode
- Verified via SVG comparison or visual overlay
- Toggle tested by switching between modes on every variant in the family

---

## Architecture: Where Everything Lives

### NEVER put in topology packages:
- Game names, variant names
- `if (variant ===` or `if (game ===` branches
- Hardcoded piece types, space names, cultural text
- Piece rendering logic (that's the piece-theme + render layer)
- Game-specific fallbacks ("if no image, draw a stone")

### ALWAYS put in topology packages:
- Geometry computation for that topology type
- Layout positioning (cell centres, dimensions, line positions)
- Coordinate transforms (axial to pixel for hex, row/col to pixel for grid)
- Structure generation (concentric rings, star points, perimeter layout)
- Topology-specific decoration vocabulary (arcs, diagonals, gaps, zones)
- Named colouring strategies (checkered, tricolor, bicolor, uniform)

### Lives in config data (boards.js now, frontmatter later):
- Which star points to render (positions array)
- Which rows form the river (row indices)
- Which cells form the palace (col/row ranges)
- Zone maps (cellMap strings)
- Cultural text content (river text, space names, prices)
- Colour palettes (via named surfaces)

### Lives in packages/render/:
- Layer compositing (board → topology → pieces → highlights)
- SVG document assembly (viewBox, xmlns, groups)
- Theme application (cellType → fill/stroke from theme)
- Piece rendering (images, surface discs, fallback shapes)
- Label rendering (text at positions from topology)

---

## The 15 Providers → 5 Topology Packages

### Target mapping

| Topology Package | Absorbs providers | Layout modes |
|-----------------|-------------------|--------------|
| `topology-grid` | checkered, mono-grid, go, xiangqi, shogi, surakarta, alquerque | tiles, intersections |
| `topology-hex` | hex (all shapes) | pointy, flat |
| `topology-track` | backgammon, landlords | triangular-points, perimeter-loop |
| `topology-pit` | mancala | rect, ellipse |
| `topology-graph` | morris, nyout, asalto, stern-halma | concentric-rings, perimeter-cross, grid-cross, star |

### What "absorbs" means

The polished SVG generation from each board-diagrams.js provider gets extracted
into the topology package's `getLayout()` method. Game knowledge (colours,
positions, text content) stays in config. The topology package receives
parametric options and produces publication-quality layout data.

---

## Execution Order

### Pre-work: Verify render pipeline (DONE)

Pipeline proven: topology-grid `renderLayout()` → render `serializeLayout()` → valid SVG.
13 tests passing. Structured elements ({tag, attrs}) work as the intermediate format.

### MANDATORY before each phase: All-providers-at-once analysis + master notation design

**Do NOT start writing consolidated code until BOTH steps are complete.**

#### Step 1: Extract universal drawing primitives

Read ALL providers being absorbed SIMULTANEOUSLY. Not one at a time.
Extract what ALL boards of this topology consist of as drawing operations.

The consolidated renderer is ONE straight pipeline that processes a list of primitives.
It never branches on which game/provider/mode it's serving. If it needs a new branch
to support a new game, the consolidation has FAILED — all we did was reorganize.

**The test:** "If I add a new game using this topology tomorrow, does this code need
ANY new branches?" If yes → not consolidated. Back to the drawing board.

#### Step 2: Design the master topology notation

For this topology type, define the canonical cell state format that:
- Describes EVERY cell completely (position, type, fill, decoration, piece, state)
- Is what the renderer CONSUMES (no further interpretation needed)
- Is what FEN/SFEN/setup strings translate INTO (not the other way around)
- Uses generic shape/decoration names (never game names)

The notation design comes FROM the primitives analysis — once you know what all
boards consist of, the notation is just the structured format to express that.

**Example (grid topology):**
```
Cell { id: 'e4', fill: '#f0d9b5', decoration: null, piece: { image: 'wP' } }
Cell { id: 'a1', fill: '#c0622f', decoration: { shape: 'diagonal-cross', stroke: '#fff' }, piece: null }
```

The renderer iterates cells, draws fill, draws decoration, draws piece. One path.
The bridge layer (render-consolidated.js) builds these cell descriptions from
GAMES config now, and from frontmatter later. The renderer never changes.

See memories: `feedback_consolidate-not-reorganize.md`, `project_master-topology-notation.md`

---

## Grid Master Notation (Phase 1 complete design)

### Status: DESIGNED (2026-07-09)

This is the canonical board description format for ALL grid-topology games.
The renderer consumes this. Nothing else. No game names, no branching.

### Source analysis (all 7 grid providers read simultaneously)

| Provider | Position type | Unique features |
|----------|--------------|-----------------|
| checkered | tile (square) | cellMap zones (rosette/castle decorations), void cells |
| mono-grid | tile (square) | uniform fill + grid lines only |
| go | intersection | star points, wood layers, Go-alphabet labels |
| xiangqi | intersection | river split (skip rows + gap columns), palace diagonals, CJK text |
| shogi | intersection | promotion zone highlights, hoshi markers, border frame |
| alquerque | intersection | all-cell dot markers, alternating diagonal lines |
| surakarta | intersection | nested frame layers, corner arc paths, all-cell dots |

### The 10 universal drawing primitives

Every grid board is composed exclusively of these operations, drawn in this order:

1. **Backgrounds** — rectangular fills (board surface, inner frame, nested borders)
2. **Zones** — tinted rectangles over row/col ranges (promotion areas)
3. **Cell fills** — per-cell colour from (r,c) → fill (checkered, zone-mapped, void)
4. **Cell decorations** — per-cell ornamental SVG elements (rosette pattern, X-mark)
5. **Grid lines** — horizontal + vertical strokes (with optional river-split, skip-rows)
6. **Diagonal lines** — per-cell-pair predicate determines which squares get X-crosses (alquerque/fanorona style — both `\` and `/` per cell). NOT for palace diagonals (those are paths).
7. **Paths** — SVG path/line elements (surakarta arcs, xiangqi palace diagonals, river overlays)
8. **Point markers** — small circles at specific (r,c) positions (star points, hoshi, dots)
9. **Texts** — positioned text elements (river calligraphy, annotations)
10. **Hit targets** — transparent interactive regions (rects for tiles, circles for intersections)

The renderer iterates 1-10 in order. One pass. No branching on game or provider.

### The notation format

A grid board description is a single object — `GridBoardLayout`:

```js
{
  // Geometry
  rows: 8,
  cols: 8,
  tileSize: 56,
  positionType: 'tile' | 'intersection',
  inset: 0,              // padding between board edge and first grid line (intersection mode)

  // 1. Backgrounds — drawn first, in order (frame → surface → inner surface)
  backgrounds: [
    { fill, rx?, stroke?, 'stroke-width'?, x?, y?, width?, height? }
  ],

  // 2. Zones — tinted rectangles over row/col ranges
  zones: [
    { fromRow, toRow, fromCol, toCol, fill }
  ],

  // 3. Cell fills — function or map: (r, c) → fill colour | null (null = void/skip)
  //    Optional .stroke(r,c) and .strokeWidth(r,c) sub-functions
  cellFill: (r, c) => '#f0d9b5' | null,

  // 4. Cell decorations — function: (r, c, cx, cy, tileSize) → [{tag, attrs}] | null
  cellDecorations: (r, c, cx, cy, ts) => [...elements] | null,

  // 5. Grid lines — config object (NOT individual line elements)
  lines: {
    color: '#333',
    width: 1.5,
    horizontal: true,         // false to suppress entirely (checkered uses fills only)
    skipRows: [],             // row indices to skip drawing
    splitAfterRow: null,      // river: columns break at this row (non-edge cols)
    edgeCols: [0, cols-1],    // which cols get full-height lines when split
  },

  // 6. Diagonals — predicate-based (game-agnostic: "which cell-pairs get X-lines?")
  diagonals: {
    predicate: (r, c) => boolean,   // true = draw both diagonals in cell (r,c)→(r+1,c+1)
    forward: true,                  // draw \ diagonal
    backward: true,                 // draw / diagonal
    color: '#333',
    width: 1.5,
  },

  // 7. Paths — pre-computed SVG path strings (arcs, curves, any shape)
  paths: [
    { d: 'M ... A ...', stroke, strokeWidth?, fill?, linecap? }
  ],

  // 8. Point markers — circles at specific grid positions
  markers: [
    { r, c, radius?, fill? }     // or [r, c] shorthand
  ],

  // 9. Texts — positioned text elements
  texts: [
    { x, y, text, fontSize?, fontFamily?, fill?, anchor?, baseline?, attrs? }
  ],

  // 10. Labels — coordinate labels config (not individual elements)
  labels: {
    show: true,
    alphabet: null,             // null = a-z; array = custom (Go uses 'ABCDEFGHJK...')
    color: '#555',
    fontSize: 10,
    fontFamily: 'monospace',
  },

  // Per-cell attrs for hit targets (optional metadata on interactive regions)
  cellAttrs: (r, c) => { 'data-type'?: string },
}
```

### What the renderer does (one straight pipeline)

```
renderLayout(config) → { width, height, elements[], cells[], labels[] }
```

1. Compute geometry (gridW/gridH from rows × cols × tileSize, pad for labels)
2. Draw backgrounds[] as rect elements
3. Draw zones[] as tinted rect elements
4. Iterate (r,c): call cellFill(r,c) → rect element per non-null fill
5. Iterate (r,c): call cellDecorations(r,c,...) → append decoration elements
6. Draw grid lines from lines config (respecting skipRows, splitAfterRow)
7. Iterate (r,c) pairs: if diagonals.predicate(r,c) → draw diagonal line pair
8. Draw paths[] as SVG path elements
9. Draw markers[] as circle elements at grid positions
10. Draw texts[] as text elements
11. Build cells[] — one hit-target element per (r,c) position, with id
12. Build labels[] — coordinate text elements along edges

This is ALREADY what `renderLayout()` does today. The notation IS the config format.

### What changed (2026-07-10 refactor)

The bridge layer (`render-consolidated.js`) was completely rewritten. All game-specific
builder functions (`buildGo`, `buildXiangqi`, etc.) were removed. The bridge is now a
generic pass-through: it reads `config.layout` and feeds primitives to `renderLayout()`.

**Game data now lives on game configs** via `buildLayout(rows, cols, tileSize, colors, config)`
functions on each family or variant in boards.js. These are TEMPORARY — they document
exactly what `produce()` will need to support when frontmatter arrives.

**Shared layout builders** (e.g. `buildIntersectionGridLayout`) are defined before the
GAMES object and referenced by any family/variant that needs them. A variant can override
its family's builder (e.g. alquerque under draughts uses the fanorona-style builder).

**Decoration registry pattern**: cell-type decorations (rosettes, X-marks) are declared
as `cellTypeDecorations` maps on the variant config — keyed by cell type name, valued
as drawing functions. The bridge passes these through without knowing what they mean.

**Guard test**: `packages/schema/__tests__/produce-purity.test.js` permanently prevents
game names, topology names, hardcoded coordinates, or game-specific text from entering
`produce.js`. This enforces the contract at CI level.

### Remaining mechanical work (non-blocking)

- Chess/Draughts/Tafl/Pachisi families use a 2-line checkered/mono-grid fallback
  instead of explicit `buildLayout`. Works correctly, but implicit.
- `isGridProvider` still checks `boardStyle` names as fallback (disappears when above done)
- `resolvePieceImageKey` — 15 lines of vocabulary→key mapping, moves to game config later

None of these block hex consolidation or any other phase.

### How buildLayout becomes frontmatter

1. The data inside each `buildLayout` (coordinates, colours, parameters) becomes YAML
2. The dimension computation (background sizing from rows×cols×tileSize) becomes a
   generic resolver in `produce()` — e.g. `sizing: grid-area` → pixel rect
3. The `buildLayout` function is deleted
4. `produce()` NEVER learns game names (purity test enforces this)
5. `isGridProvider` becomes `config.layout != null` and is eventually deleted too

### Validation: the "new game tomorrow" test

Q: "If someone adds Jungle Chess (9×7 grid, intersection-mode, river squares, dens, traps), does the renderer need new code?"

A: No. The variant declares its layout via `buildLayout` (today) or frontmatter (future).
The bridge and renderer never change.

Q: "If someone adds Brandubh (7×7 tile grid with central throne + corner castles)?"

A: No. Declares `cellTypeDecorations: { throne: drawFn }` on the variant config.
The bridge passes it through, the renderer draws whatever it's told.

---

### Phase 1: topology-grid (7 providers, ~300 variants)

Grid topology already has tiles + intersections. Upgrade to match studio quality:

1. **mono-grid** — uniform fill + grid lines (simplest, proves pipeline)
2. **checkered** — add cellMap zone colouring to getCells() output
3. **alquerque** — intersections + alternating diagonal line generation
4. **go** — intersections + star point annotations + Go-style labels
5. **shogi** — intersections + promotion zone highlights + hoshi markers
6. **xiangqi** — intersections + river gap + palace diagonals + split columns
7. **surakarta** — intersections + corner arc decorations

Each step: upgrade topology package → verify via toggle → next provider.

---

## Hex Master Notation (Phase 5 complete design)

### Status: DESIGNED (2026-07-10)

This is the canonical board description format for ALL hex-topology games.
The renderer consumes this. Nothing else. No game names, no branching.

### Source analysis (both hex pipelines read simultaneously)

| Pipeline | Games served | Unique features |
|----------|-------------|-----------------|
| hex provider (board-diagrams.js) | hex chess (Glinski, McCooey, Shafran, Brusky, De Vasa), Hex connection, Y-game, Agon | tricolor fill, ring-color fill, frame borders, centre marker, piece images |
| HexSvg (hex-games/hex-svg.js) | Catan/Colony, Talisman, Twilight, Nukes, Mongo, Endless | terrain-type fill, tile images clipped to hex, overlays (circle+text), labels, tokens, arrows, legend |

### The 8 universal drawing primitives

Every hex board is composed exclusively of these operations, drawn in this order:

1. **Background** — optional rectangular fill behind the board (when no frame)
2. **Border frame** — thick line segments along the board perimeter (computed from exposed hex edges). Distinct from background: frame replaces it, they're mutually exclusive.
3. **Cell polygons** — one 6-sided polygon per hex, filled by a colour strategy function `(q, r, hex) → fill`
4. **Cell images** — artwork clipped to hex polygon shape (terrain tiles)
5. **Cell labels** — text centred in cell (terrain abbreviations, coordinates)
6. **Overlays** — circles + optional text at specific cells (number tokens, markers)
7. **Centre marker** — single text element at a specific cell (decorative)
8. **Hit targets** — transparent polygons for interaction (same shape as cell polygons)

The renderer iterates 1-8 in order. One pass. No branching on game or pipeline.

### The notation format

A hex board description is a single object — `HexBoardLayout`:

```js
{
  // Geometry — how to generate the cell list
  hexes: [{q, r, ...}],     // explicit array of hex cells (pre-generated)
  // OR generated by the bridge from one of:
  //   hexRadius → generateHexGrid(radius)
  //   hexRows + hexCols → generateHexRhombus(rows, cols)
  //   custom generator → array

  // Orientation + sizing
  orientation: 'pointy' | 'flat',    // default: 'pointy'
  cellSize: 30,                      // pixel size of hex (centre to vertex)
  scale: 0.95,                       // gap factor between adjacent hexes

  // 1. Background — optional rect behind the board
  background: { fill, rx? } | null,  // null = no background (frame mode)

  // 2. Border frame — edge segments along exposed perimeter
  frame: {
    stroke: '#6b4226',
    strokeWidth: 14,
    linecap: 'round',
    linejoin: 'round',
    scale: 1.05,           // how much larger than cell size for frame computation
  } | null,                // null = use background instead

  // 3. Cell fill — function: (q, r, hex) → colour string
  //    Hex object carries any metadata (type, ring distance, etc.)
  //    The function is parametric — defined on game config, passed through
  cellFill: (q, r, hex) => '#f0d9b5',

  // Cell stroke (applied to every cell polygon)
  cellStroke: { color: 'rgba(0,0,0,0.2)', width: 1 },

  // 4. Cell images — per-cell artwork clipped to polygon
  //    Function: (q, r, hex) → image href string | null
  cellImage: (q, r, hex) => '/tiles/forest.png' | null,
  imageScale: 1.0,         // image size relative to cell size (default covers full hex)

  // 5. Cell labels — per-cell text
  //    Function: (q, r, hex) → string | null
  cellLabel: (q, r, hex) => hex.label || null,
  labelStyle: { fontSize: 0.4, fill: '#fff', fontFamily: 'sans-serif' },
  // fontSize is relative to cellSize

  // 6. Overlays — circles + text at specific cells
  overlays: [
    { q, r, radius?, color?, stroke?, text?, textFill?, textSize? }
  ],

  // 7. Centre marker — single decorative text at a specified cell
  centreMarker: { q: 0, r: 0, text: '★', fontSize?, fill? } | null,

  // 8. Hit targets — automatically generated (same polygon as cell)
  //    Cell ID format: "q,r" (axial coordinates as string)
}
```

### What the renderer does (one straight pipeline)

```
renderLayout(config) → { width, height, elements[], cells[], labels[] }
```

1. Compute positions: for each hex in `hexes[]`, convert (q,r) → pixel (cx,cy)
   using orientation (pointy/flat), apply cellSize
2. Compute bounding box + padding → width/height
3. If `background` → emit background rect element
4. If `frame` → compute border edges (exposed edges of hex set), emit line elements
5. For each hex: compute corners at `cellSize * scale`, emit polygon with `cellFill(q, r, hex)`
6. For each hex with `cellImage(q, r, hex)` → emit clipPath + image element
7. For each hex with `cellLabel(q, r, hex)` → emit text element at centre
8. For each overlay → emit circle + optional text element
9. If `centreMarker` → emit text element at specified position
10. Build cells[] — one transparent polygon per hex, with `data-sq="q,r"` and class `board-cell`

### What changed vs the existing hex provider

The existing hex provider in board-diagrams.js does ALL of this inline as string
concatenation. The consolidated version:
- Returns structured elements (same `{tag, attrs}` format as grid)
- Receives all game data as config (colour function, positions, frame spec)
- Never references game names or variants
- Shares the `serializeLayout()` path for SVG output

### Colour strategy functions (live on game config, NOT in topology)

```js
// Tricolor modular (Glinski family) — lives on chess hex variants
(q, r, hex) => {
  const mod = (((q - r) % 3) + 3) % 3
  return mod === 0 ? colors.light : mod === 1 ? colors.mid : colors.dark
}

// Ring-based alternating (Agon) — lives on agon config
(q, r, hex) => {
  const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))
  return ring % 2 === 0 ? colors.dark : colors.light
}

// Type-mapped (terrain games) — lives on hex-game configs
(q, r, hex) => colors[hex.type] || '#666'
```

### Grid generators (live in boards.js, NOT in topology)

```js
// These are DATA FACTORIES. They produce the hexes[] array for the config.
// They become YAML or produce() parameters when frontmatter arrives.
generateHexGrid(radius)             // hexagonal shape
generateHexRhombus(rows, cols)      // rectangular shape
generateTriangularHexGrid(side)     // Y-game shape
generateShafranGrid()               // irregular 70-hex
generateBruskyGrid()                // irregular 84-hex
```

### Shared layout builders (defined before GAMES, referenced by families)

```js
// buildHexagonalLayout — for hexagonal-radius games (Glinski, Agon, hex-shogi)
function buildHexagonalLayout(hexes, cellSize, orientation, colors, config) {
  return {
    hexes, orientation, cellSize,
    scale: config.hexScale || 0.95,
    background: config.hexFrame ? null : { fill: colors.background, rx: 6 },
    frame: config.hexFrame ? { stroke: colors.border || '#6b4226', strokeWidth: 14, ... } : null,
    cellFill: config.hexColorFn || defaultTricolor(colors),
    cellStroke: { color: colors.stroke, width: 1 },
    centreMarker: config.centreMarker ? { q: 0, r: 0, text: config.centreMarker, ... } : null,
  }
}

// buildRhombusLayout — for rhombus games (Hex connection, De Vasa)
function buildRhombusLayout(hexes, cellSize, orientation, colors, config) { ... }

// buildTriangularLayout — for Y-game
function buildTriangularLayout(hexes, cellSize, orientation, colors, config) { ... }
```

### Validation: the "new game tomorrow" test

Q: "If someone adds Havannah (hexagonal radius-8 with 3-color cells), does the renderer need new code?"

A: No. Declares `hexes: generateHexGrid(8)`, `cellFill: tricolorFn`, `cellSize: 18`. Done.

Q: "If someone adds a custom hex terrain game with tile images?"

A: No. Declares `hexes: [...]`, `cellFill: typeFn`, `cellImage: imageFn`. The renderer draws polygons, clips images, places labels — no new code.

Q: "If someone adds a hex game with a non-standard shape (star, L-shape, holes)?"

A: No. Passes explicit `hexes[]` array with whatever cells they want. The renderer draws what it's given.

### How buildLayout becomes frontmatter

1. The grid generator call (e.g. `hexRadius: 5`) becomes a YAML key
2. The colour function params become colour palette + strategy name
3. The frame config becomes frame: { type: rhombus, ... } in YAML
4. `produce()` constructs the `HexBoardLayout` object from YAML params
5. `produce()` NEVER learns game names (purity test enforces this)

---

### Phase 2: topology-graph (4 providers, ~15 variants)

Master notation designed (see below). Execution steps:

1. **Add `renderLayout(config)` to topology-graph** — receives `GraphBoardLayout` config,
   returns `{ width, height, elements[], cells[], labels[], defs[] }`.
   Code MOVED from the 4 providers: same pixel math, structured output.

2. **Write `render-consolidated-graph.js` bridge** — thin pass-through (same pattern).
   Reads `config.layout` from graph variants, calls topology-graph `renderLayout()`.

3. **Add `buildLayout` to graph families in boards.js** — morris, nyout, asalto,
   stern-halma each get explicit builders using shared structure generators.

4. **Wire toggle** — "Original" = board-diagrams providers, "Final" = new pipeline.
   Verify all ~15 variants.

---

## Graph Master Notation (Phase 2 complete design)

### Status: DESIGNED (2026-07-10)

This is the canonical board description format for ALL graph-topology games.
The renderer consumes this. Nothing else. No game names, no branching.

### Source analysis (all 4 providers read simultaneously)

| Provider | Games served | Unique features |
|----------|-------------|-----------------|
| morris | 7 variants (3/6/9/12-mens, lasker, morabaraba, shax) | Concentric ring rects, midpoint cross-lines, diagonal lines, uniform node dots |
| nyout | 1 variant | Square perimeter + diagonal cross, junction nodes (larger), centre node (largest) |
| asalto | 2 variants (standard, royal garrison) | Grid-cross node layout, fortress zone highlight (rect + ear polygons), diagonal edges, pieces |
| stern-halma | 5 variants (2-6 player Chinese Checkers) | Star geometry, nested board frame (body/rim/felt), arm fill polygons, hole dots, arm labels, pieces |

### The 8 universal drawing primitives

Every graph board is composed exclusively of these operations, drawn in this order:

1. **Backgrounds** — rect fills, potentially nested (body → rim → felt for stern-halma style)
2. **Zone fills** — coloured polygons/rects marking regions (fortress area, arm triangles, centre hex)
3. **Structure shapes** — geometric structure that IS NOT edges (concentric ring rects for morris, star outline polygons)
4. **Edges** — lines between connected nodes
5. **Node dots** — filled circles at each playable position (radius may vary by node type)
6. **Hit targets** — transparent circles for interaction (larger radius than visible dots)
7. **Pieces** — images or coloured circles at occupied positions
8. **Labels** — text elements (direction labels, position names)

The renderer iterates 1-8 in order. One pass. No branching on game or provider.

### The notation format

A graph board description is a single object — `GraphBoardLayout`:

```js
{
  // Geometry — absolute positions for all nodes
  nodes: [
    { id: 'n1', x: 20, y: 20, type?: 'junction' | 'centre' | 'arm-N' | ... }
  ],

  // Connectivity — which nodes connect (for edge drawing)
  edges: [
    { from: 'n1', to: 'n2' }    // or [fromIdx, toIdx] shorthand
  ],

  // Board dimensions
  width: 320,
  height: 320,

  // 1. Backgrounds — rects drawn in order (outer → inner for layered frames)
  backgrounds: [
    { fill, rx?, stroke?, 'stroke-width'?, x?, y?, width?, height?, filter? }
  ],

  // 2. Zone fills — polygons/rects highlighting regions
  zones: [
    { type: 'rect', attrs: { x, y, width, height, fill, rx? } }
    | { type: 'polygon', attrs: { points, fill } }
  ],

  // 3. Structure shapes — geometric structure that isn't edges
  //    (ring rects, star outlines, fortress borders)
  structures: [
    { tag: 'rect' | 'polygon' | 'line', attrs: { ... } }
  ],

  // 4. Edge style
  edgeStyle: { stroke: '#333', strokeWidth: 2.5, linecap: 'round' },

  // 5. Node dots — how to render visible node markers
  nodeRadius: 7,                    // base radius
  nodeColor: '#333',                // default fill
  nodeScale: { junction: 1.2, centre: 1.4 },  // type → scale multiplier
  nodeColorMap: { centre: '#gold' },           // type → fill override

  // 6. Hit targets — automatically generated (transparent circles at node positions)
  //    Radius = nodeRadius * 2 for comfortable click targets
  //    Attrs: data-sq, data-type, class="board-cell"

  // 7. Pieces — not part of topology, handled by serializeLayout (same as grid/hex)

  // 8. Labels — text elements at absolute positions
  labels: [
    { x, y, text, fontSize?, fill?, anchor? }
  ],

  // Optional: SVG filter definitions (drop-shadow for stern-halma frame)
  defs: [
    { tag: 'filter', attrs: { id: 'board-shadow', ... }, children: [...] }
  ],
}
```

### What the renderer does (one straight pipeline)

```
renderLayout(config) → { width, height, elements[], cells[], labels[], defs[] }
```

1. Emit background rects from `backgrounds[]`
2. Emit zone fills from `zones[]` (rects and polygons)
3. Emit structure shapes from `structures[]`
4. For each edge: look up node positions, emit line element
5. For each node: emit filled circle (radius scaled by type)
6. Build cells[] — transparent circle per node for hit targets
7. Emit labels from `labels[]`
8. Pass through `defs[]` for filter definitions

### Structure generators (live in boards.js as data factories)

```js
// Morris — concentric ring positions + edges
function generateMorrisLayout(rings, size, opts) → { nodes, edges, structures }

// Nyout — perimeter square + diagonals
function generateNyoutLayout(size) → { nodes, edges }

// Asalto — grid-cross + fortress
function generateAsaltoLayout(gridDef, size) → { nodes, edges, zones }

// Stern-Halma — 6-pointed star holes
function generateSternHalmaLayout(spacing) → { nodes, edges, zones, structures, backgrounds }
```

### Validation: the "new game tomorrow" test

Q: "If someone adds Twelve Men's Morris with diagonals, does the renderer need new code?"

A: No. Passes `rings: 3, diagonals: true` to generator. Generator produces extra diagonal
edges. Renderer draws lines between connected nodes. Done.

Q: "If someone adds Fox & Geese (asymmetric piece game on a cross grid)?"

A: No. Same cross-grid generator as Asalto with different `asaltoGrid` params.
Pieces declared via position map. Renderer draws whatever it's given.

Q: "If someone adds a custom abstract on a pentagonal star layout?"

A: No. Passes explicit `nodes[]` with absolute positions + `edges[]` connections.
Renderer draws nodes and edges. Zero new code.

---

### Phase 3: topology-pit (1 provider, ~10 variants)

Upgrade getLayout() to produce publication-quality pit positioning, seed
layout, store sizing matching what the mancala provider currently renders.

### Phase 4: topology-track (2 providers, ~8 variants)

1. **backgammon** — triangular-points layout
2. **landlords** — perimeter-loop with addressable positions

### Phase 5: topology-hex (2 pipelines, ~40 variants)

Master notation designed (see above). Execution steps:

1. **Add `renderLayout(config)` to topology-hex** — same pattern as grid.
   Receives `HexBoardLayout` config, returns `{ width, height, elements[], cells[] }`.
   Code is a MOVE from board-diagrams.js hex provider: same pixel math, structured output.

2. **Add hex serialization to `packages/render/`** — `serializeLayout()` already handles
   grid elements; hex elements use the same `{tag, attrs}` format. May need clipPath support
   for cell images (terrain tiles).

3. **Write `render-consolidated-hex.js` bridge** — thin pass-through (same pattern as grid).
   Reads `config.layout` from hex variants, calls topology-hex `renderLayout()`.
   No game names, no switch statements.

4. **Add `buildLayout` to hex families in boards.js** — Glinski/McCooey/Shafran/Brusky/
   De Vasa/Hex/Y/Agon each get explicit builders using shared `buildHexagonalLayout`,
   `buildRhombusLayout`, `buildTriangularLayout` functions.

5. **Wire toggle** — "Original" = board-diagrams.js hex provider, "Packages" = new pipeline.
   Verify pixel-identical output for all ~20 hex-provider variants.

6. **HexSvg games** — these use the second pipeline (hex-games/hex-svg.js).
   They already produce standalone SVGs. Consolidation means their generators produce
   `HexBoardLayout` configs that flow through the same `renderLayout()`. Lower priority
   since they're terrain maps, not playable boards in the engine sense.

---

## Verification Strategy

### Automated SVG comparison

```javascript
function verifyConsolidation(familyKey, variantKey) {
  const originalSvg = renderOriginal(config)    // board-diagrams.js path
  const packagesSvg = renderViaPackages(config)  // topology package path
  return originalSvg === packagesSvg
}
```

### Manual verification checklist (per family)

- [ ] All variants render in "Packages" mode
- [ ] Toggle between Original/Packages shows no visual difference
- [ ] Hover/interaction still works (data-sq attributes preserved)
- [ ] Labels render correctly
- [ ] Pieces render correctly
- [ ] Zone colours show correctly
- [ ] Decorations render correctly
- [ ] Frame/border renders correctly

---

## Estimated Effort

| Phase | Work | Variants affected |
|-------|------|-------------------|
| Pre-work | Render package gaps + pipeline proof | 1 variant |
| Phase 1 (grid) | Upgrade topology-grid getLayout() | ~300 |
| Phase 2 (graph) | Upgrade topology-graph getLayout() | ~15 |
| Phase 3 (pit) | Upgrade topology-pit getLayout() | ~10 |
| Phase 4 (track) | Upgrade topology-track getLayout() | ~8 |
| Phase 5 (hex) | Upgrade topology-hex getLayout() | ~40 |

---

## Post-Consolidation State

- `packages/topology-grid/` — polished grid rendering (tiles + intersections + all decorations)
- `packages/topology-hex/` — polished hex rendering (all shapes + colour strategies)
- `packages/topology-track/` — polished track rendering (points + perimeter-loop)
- `packages/topology-pit/` — polished pit rendering (rect + ellipse)
- `packages/topology-graph/` — polished graph rendering (all structures)
- `packages/render/` — layer compositor producing publication-quality SVG
- `board-diagrams.js` — retained as "Original" toggle baseline, eventually deleted
- All game knowledge in boards.js config (intermediate before frontmatter)
- Toggle confirms visual parity for all 375 variants
- Ready for migration-spec.md (wire live pipeline from moddable-rules)

---

## Key Rule: No Game Knowledge in Topology Packages

This has been violated repeatedly and is the #1 recurring architectural failure.

**Before writing ANY code in a topology package, ask:**
"Does this require knowing what game is being rendered?"

If yes → it belongs in config data or theme, not the package.

Topology packages are MECHANICAL. They receive parameters, compute geometry,
return layout data. They never ask "what game is this?" They never draw pieces.
They never infer meaning from dimensions.

See memory: `feedback_no-hidden-game-knowledge.md`
