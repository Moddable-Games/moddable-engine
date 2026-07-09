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
- `packages/render/` composites topology + surface + pieces into final SVG

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

### Pre-work: Verify render package can composite

Before upgrading any topology, confirm the render pipeline works end-to-end:
1. Take one simple case (mono-grid, e.g. Hnefatafl)
2. Feed its schema through reverse-adapter → topology-grid.getLayout() → render
3. Compare output to Original mode
4. Identify gaps in render package (piece rendering, label positioning)
5. Fix render package gaps FIRST — shared infrastructure

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

### Phase 2: topology-graph (4 providers, ~15 variants)

1. **morris** — concentric rings structure generator
2. **nyout** — perimeter-cross structure generator
3. **asalto** — grid-cross + fortress zone computation
4. **stern-halma** — star structure + arm zone assignment

### Phase 3: topology-pit (1 provider, ~10 variants)

Upgrade getLayout() to produce publication-quality pit positioning, seed
layout, store sizing matching what the mancala provider currently renders.

### Phase 4: topology-track (2 providers, ~8 variants)

1. **backgammon** — triangular-points layout
2. **landlords** — perimeter-loop with addressable positions

### Phase 5: topology-hex (1 provider, ~40 variants)

- Colour strategy as parameter (tricolor, bicolor, uniform, typed)
- Custom grids as explicit hex arrays
- Frame/border as structured output
- Polished hex polygon generation matching studio quality

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
