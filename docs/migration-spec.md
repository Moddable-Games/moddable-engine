# Render Data Migration Spec — boards.js → moddable-rules frontmatter

## Status: READY FOR EXECUTION
## Created: 2026-07-09
## Depends on: render-schema-spec.md (data contract), consolidation (may refine)

---

## Purpose

This document specifies exactly what rendering data moves from `boards.js` into moddable-rules frontmatter, family by family. It is written at execution-level detail so any future session can mechanically apply it without rediscovering the problem.

---

## Current State

- **moddable-rules** has 268+ variant files with `engine:` blocks containing game logic only (topology, players, graph nodes/edges)
- **boards.js** holds ~2700 lines of rendering config: provider selection, colours, terrain maps, tile sizes, piece sets, FEN positions, overlays, labels
- **render-schema-spec.md** defines the target schema (`surface:`, `render:`, `pieces:`, `content:`, `meta:`)
- **9 named surfaces** cover colour palettes for all 375 variants
- **The cascade model** (surface → family → variant) eliminates 90%+ of per-variant fields

---

## Migration Strategy

### What moves to moddable-rules

| boards.js field | Schema location | Level |
|-----------------|-----------------|-------|
| `boardStyle` | ELIMINATED (derived from topology.type + render.cellColor) | — |
| `rows` / `cols` | `engine.topology.rows/cols` | Already there |
| `tileSize` | `engine.render.cellSize` | Family default |
| `showLabels` | `engine.render.labels` | Family default |
| `colors` object | `engine.surface` (named reference) | Family default |
| `cellMap` string | `engine.render.zones.map` | Variant |
| `overlays` | `engine.render.decorations` | Variant |
| `pieceSet` | `engine.pieces.set` | Family default |
| `pieceNames` | `engine.pieces.names` | Variant |
| `pieceBorders` | `engine.pieces.borders` | Variant |
| `fen` / `setup` | `engine.setup` | Variant |
| `setupDesc` | `meta.setupDesc` | Variant |
| `variantDesc` | `meta.description` | Variant |
| `label` | `meta.label` | Variant |

### What is ELIMINATED (not migrated)

| boards.js field | Why eliminated |
|-----------------|---------------|
| `boardStyle` | Redundant — topology.type + cellColor strategy replaces provider selection |
| Builder functions (buildTaflMap, buildCrossMap, etc.) | Replaced by inline zone maps or parametric patterns |
| Colour constants (TAFL_COLORS, etc.) | Replaced by named surfaces |
| Game-specific JS logic | Replaced by declarative config |

### Provider → topology.type + cellColor mapping

| Legacy provider | topology.type | render.cellColor | Notes |
|-----------------|---------------|------------------|-------|
| checkered | grid | checkered | Default for chess/draughts |
| mono-grid | grid | uniform | Tafl, Turkish draughts |
| go | grid | uniform | layout: intersections |
| xiangqi | grid | uniform | layout: intersections, decorations: gap+diagonals |
| shogi | grid | uniform | orientation: shogi |
| hex | hex | tricolor/uniform | — |
| mancala | pit | — | Separate renderer |
| backgammon | track | — | trackStyle: triangular-points |
| morris | graph | — | structure: concentric-rings |
| stern-halma | graph | — | structure: star |
| alquerque | grid | uniform | layout: intersections, decorations: diagonals |
| surakarta | grid | uniform | layout: intersections, decorations: arcs |
| nyout | graph | — | structure: perimeter-cross |
| asalto | graph | — | structure: grid-cross |
| landlords | track | — | content-driven surface treatments |

---

## Surface Assignments (family → named surface)

| Family | Surface | Override notes |
|--------|---------|---------------|
| moddable-chess | wood-classic | — |
| draughts | wood-classic | alquerque/turkish → parchment |
| halma | wood-classic | — |
| go | wood-light | — |
| xiangqi | wood-light | — |
| shogi | wood-light | — |
| reversi | felt-green | — |
| tafl | parchment | + throne/corner zone colours |
| royal-ur | parchment | + rosette zone colour |
| backgammon | parchment | — |
| pachisi | parchment | + castle/home zone colours |
| chaupar | parchment | override cell-light to blue |
| surakarta | parchment | — |
| morris | slate | — |
| hex | slate | — |
| stern-halma | slate | — |
| mancala | earth | — |
| fanorona | jungle | — |
| dou-shou-qi | jungle | + river/den/trap zone colours |
| lattaque | military | standard uses jungle override |
| dungeon-chess | military | + p1/p2/water zone colours |
| nukes | cosmic | — |
| talisman-worlds | cosmic | — |
| mongo | cosmic | — |
| twilight | cosmic | — |
| endless-skies | cosmic | — |
| harvesters | cosmic | — |
| standard-52 | felt-green | — |
| flower-48 | felt-green | — |
| mahjong | felt-green | — |
| dominoes | felt-green | — |
| standard-dice | felt-green | — |
| econopoly | parchment | — |
| landlords-game | parchment | — |
| dnd-5e | — | topology: none (RPG) |
| ironsworn | — | topology: none (RPG) |
| agon | slate | bicolor cellColor |

---

## Piece Set Assignments

| Family | pieces.set | Notes |
|--------|-----------|-------|
| moddable-chess | mce-fairy-complete | Covers all fairy + standard |
| go | playstrategy-go-classic | — |
| xiangqi | mce-xiangqi-trad | fairy variants: mce-xiangqi-fairy |
| draughts | playstrategy-dameo-fabirovsky | plain variants: playstrategy-draughts-plain |
| reversi | playstrategy-flipello-classic | — |
| shogi | kahu-shogi-kanji-red-wood | — |
| morris | playstrategy-go-classic | Uses go stones |
| halma | playstrategy-draughts-plain | — |
| stern-halma | playstrategy-draughts-plain | — |
| hex | playstrategy-go-classic | — |
| mancala | playstrategy-oware | — |
| pachisi | playstrategy-draughts-plain | — |
| chaupar | playstrategy-draughts-plain | — |
| fanorona | playstrategy-go-classic | — |
| dungeon-chess | mce-chess | — |
| dou-shou-qi | mce-jungle | — |
| agon | fluent-emoji | — |
| asalto | fluent-emoji | — |
| tafl | playstrategy-go-classic | — |
| royal-ur | playstrategy-draughts-plain | — |
| backgammon | playstrategy-draughts-plain | — |
| bavarian-32 | — | Card game |
| baristasaurus | — | Card game |

---

## Per-Family Frontmatter Examples

### Chess (family default — rulebook.md)

```yaml
engine:
  topology:
    type: grid
    rows: 8
    cols: 8
  surface: wood-classic
  render:
    cellSize: 56
    cellColor: checkered
    labels: true
  pieces:
    set: mce-fairy-complete
  players: [white, black]
```

### Chess variant (capablanca.md — only overrides)

```yaml
engine:
  topology:
    rows: 10
    cols: 8
  setup: "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR"
  pieces:
    names:
      A: Archbishop
      C: Chancellor
```

### Tafl (family default)

```yaml
engine:
  topology:
    type: grid
    rows: 9
    cols: 9
  surface:
    base: parchment
    colors:
      throne: "#8b4513"
      corner: "#4a6741"
  render:
    cellSize: 40
    cellColor: uniform
    labels: false
    zones:
      pattern: symmetric-points
      params:
        centre: true
        corners: true
  pieces:
    set: playstrategy-go-classic
  players: [attacker, defender]
```

### Tafl variant (hnefatafl.md — overrides)

```yaml
engine:
  topology:
    rows: 11
    cols: 11
  setup: "3bbbbb3/5b5/11/b4w4b/b3www3b/bb1wwKww1bb/b3www3b/b4w4b/11/5b5/3bbbbb3"
```

### L'Attaque Standard

```yaml
engine:
  topology:
    type: grid
    rows: 10
    cols: 9
  surface:
    base: jungle
    colors:
      lake: "#4a7ab5"
  render:
    cellSize: 34
    cellColor: uniform
    labels: false
    zones:
      map: |
        fffffffff
        fffffffff
        fffffffff
        fffffffff
        fflflflff
        fflflflff
        fffffffff
        fffffffff
        fffffffff
        fffffffff
  players: [player1, player2]
```

### L'Attaque Tri-Tactics

```yaml
engine:
  topology:
    type: grid
    rows: 12
    cols: 12
  surface:
    base: jungle
    colors:
      sea: "#3a6e9e"
      lake: "#3a6e9e"
      hq: "#c8a832"
  render:
    cellSize: 30
    cellColor: uniform
    labels: false
    zones:
      map: |
        LLLLLqLLLLLL
        LLLLLLLLlLLL
        LLLLLLLLLLLL
        ssssssLLLLLL
        ssssssssLLLL
        ssssssssLLLL
        ssssssssLLLL
        ssssssssLLLL
        ssssssLLLLLL
        LLLLLLLLLLLL
        LLLLLLLLlLLL
        LLLLLQLLLLLL
    decorations:
      - type: path
        path: [f9, f10, g10, h10, i10, i11]
        stroke: sea
        width: 9
      - type: path
        path: [f4, f3, g3, h3, i3, i2]
        stroke: sea
        width: 9
  players: [player1, player2]
```

### Dover Patrol

```yaml
engine:
  topology:
    type: grid
    rows: 12
    cols: 8
  surface:
    colors:
      sea: "#3a6e9e"
      harbour: "#5a8ab5"
      base: "#c8a832"
  render:
    cellSize: 34
    cellColor: uniform
    labels: false
    zones:
      map: |
        sssssbHH
        sssssHHH
        sssssHHH
        ssssssss
        ssssssss
        ssssssss
        ssssssss
        ssssssss
        ssssssss
        HHHsssss
        HHHsssss
        HHbsssss
  players: [player1, player2]
```

### Go (family default)

```yaml
engine:
  topology:
    type: grid
    rows: 19
    cols: 19
    layout: intersections
  surface: wood-light
  render:
    cellSize: 28
    cellColor: uniform
    labels: true
    decorations:
      - type: markers
        style: dot
        size: 4
        auto: star-points
  pieces:
    set: playstrategy-go-classic
  players: [black, white]
```

### Xiangqi (family default)

```yaml
engine:
  topology:
    type: grid
    rows: 9
    cols: 10
    layout: intersections
  surface: wood-light
  render:
    cellSize: 40
    cellColor: uniform
    labels: true
    decorations:
      - type: gap
        between: [4, 5]
      - type: diagonals
        region: { rows: [0, 2], cols: [3, 5] }
      - type: diagonals
        region: { rows: [7, 9], cols: [3, 5] }
  pieces:
    set: mce-xiangqi-trad
  players: [red, black]
```

### Backgammon (family default)

```yaml
engine:
  topology:
    type: track
    positions: 24
    shape: linear
  surface: parchment
  render:
    cellSize: 34
    trackStyle: triangular-points
    labels: false
  pieces:
    set: playstrategy-draughts-plain
  players: [white, black]
  components:
    dice:
      count: 2
      sides: 6
      doubling: true
```

### Mancala (family default)

```yaml
engine:
  topology:
    type: pit
    cols: 6
    rows: 2
    stores: true
  surface: earth
  render:
    cellSize: 40
  pieces:
    set: playstrategy-oware
  players: [south, north]
```

### Morris (family default)

```yaml
engine:
  topology:
    type: graph
    structure: concentric-rings
    params:
      rings: 3
      midpoints: true
      diagonals: false
  surface: slate
  render:
    cellSize: 40
  pieces:
    set: playstrategy-go-classic
  players: [white, black]
```

### Dungeon Chess

```yaml
engine:
  topology:
    type: grid
    rows: 20
    cols: 8
  surface:
    base: military
    colors:
      p1: "#f0d080"
      p2: "#f0b0b0"
      water: "#4a90c8"
  render:
    cellSize: 21
    cellColor: uniform
    labels: false
    zones:
      map: |
        22222222
        22222222
        ffffffff
        ...ff...
        ...ff...
        ...ff...
        ffffffff
        ffffffff
        ffwwwwff
        ffwwwwff
        ffwwwwff
        ffwwwwff
        ffffffff
        ffffffff
        ...ff...
        ...ff...
        ...ff...
        ffffffff
        11111111
        11111111
  pieces:
    set: mce-chess
  players: [white, black]
```

### Dou Shou Qi (Jungle)

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
      map: |
        fffdtdf
        fffffff
        fffffff
        frr.rrf
        frr.rrf
        frr.rrf
        fffffff
        fffffff
        ftdfdff
  pieces:
    set: mce-jungle
    names:
      E: Elephant
      L: Lion
      T: Tiger
      P: Leopard
      D: Dog
      W: Wolf
      C: Cat
      R: Rat
    borders:
      white: "#1565c0"
      black: "#c62828"
  setup: "l5t/1d3c1/r1p1w1e/7/7/7/E1W1P1R/1C3D1/T5L"
  players: [player1, player2]
```

### Shaped boards (chess variants with voids)

Diamond (Balbo's Chess):
```yaml
engine:
  render:
    zones:
      pattern: diamond
      params:
        rankWidths: [3, 5, 7, 9, 11, 11, 9, 7, 5, 3]
```

Cross-shaped (Four-Handed Chess):
```yaml
engine:
  render:
    zones:
      pattern: cross
      params:
        armWidth: 8
```

Corner extensions (Omega Chess):
```yaml
engine:
  render:
    zones:
      pattern: corners
      params:
        innerSize: 10
```

---

## Zone Map Character Vocabulary

Single characters in `render.zones.map` strings. Surface maps key → colour.

| Char | Key | Used by |
|------|-----|---------|
| `.` | (void/null) | Shaped boards |
| `f` | floor | Most terrain games |
| `w` | water | Dungeon, Jungle |
| `1` | p1 | Deploy zones |
| `2` | p2 | Deploy zones |
| `r` | rosette | Royal Ur |
| `c` | castle | Pachisi |
| `h` | home | Pachisi/Chaupar |
| `l` | lake | L'Attaque, Tri-Tactics |
| `s` | sea | Dover Patrol, Tri-Tactics |
| `a` | aerodrome | Aviation |
| `b` | base | Dover Patrol |
| `H` | harbour | Dover Patrol |
| `L` | land | Tri-Tactics |
| `R` | river | Tri-Tactics |
| `Q`/`q` | hq | Tri-Tactics |
| `d` | den | Dou Shou Qi |
| `t` | trap | Dou Shou Qi |
| `T` | throne | Tafl |

New zone types can be added by:
1. Adding a character to the vocabulary
2. Adding a colour key to the relevant surface

---

## Execution Plan

### Phase A: Author family defaults in rulebook.md

For each family in moddable-rules, add the rendering fields to the existing `engine:` block (or create one). This covers: surface, render (cellSize, cellColor, labels), pieces.set.

**Families needing engine: blocks created from scratch:** tafl (4), lattaque (4), asalto (2), agon (1), bavarian-32 (1)

### Phase B: Author variant overrides

For each variant that differs from family defaults: setup (FEN/position), zones.map (terrain), decorations, dimension overrides, piece name overrides.

### Phase C: Wire live pipeline

schema-loader.js fetches from moddable-rules filesystem (or served JSON). Cascade-resolver merges surface → family → variant. Render-adapter produces renderBoard() opts from resolved schema.

### Phase D: Validate dual-mode parity

Toggle Legacy/Schema (or Original/Consolidated) in board studio. Every variant must render identically.

### Phase E: Delete legacy

Remove GAMES object, reverse-adapter, all colour constants, builder functions, cellMap data from boards.js. Studio reads exclusively from schema pipeline.

---

## Consolidation Impact

Provider consolidation (step 2 in master plan) changes HOW the renderer consumes the schema data internally, but does NOT change the frontmatter contract. The fields above remain stable regardless of whether 15 legacy providers or 5 topology renderers do the actual drawing.

If consolidation reveals a concept the schema can't express, update THIS spec (add the field, add a surface, add a zone type). The cascade model and named surfaces are stable by design.

---

## Open Questions (resolve during execution)

1. **Shaped boards:** Are parametric patterns (diamond, cross, corners) sufficient, or do some need inline zone maps? Current: both are valid in the spec.
2. **Hex position data:** Large hex chess variants (Glinski etc.) have axial coordinate position maps. These are setup data, not zones. Confirm they fit `engine.setup` as axial map format.
3. **Multi-board games:** Alice Chess and Gygax use `render.layers`. Confirm layer config + per-layer surface overrides work.
4. **4-player FEN:** FEN4 format (comma-separated, colour-prefixed) needs to work with setup field.

---

## Known bugs (noted for separate fix)

- Piece gallery: "MCE 4-Player Chess" and "MCE 4-Player Shogi" sets show empty frames (render fine in board studio)

