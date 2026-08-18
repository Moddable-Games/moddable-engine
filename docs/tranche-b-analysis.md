# moddable-engine #130 — Tranche B

**Verdict up front: the issue's premise for tranche B is wrong on all three cases,
and correcting it means tranche B changes no rendered output at all.**

The issue says "for graph the opposite is true — `topology-graph.js` parameterises
these boards correctly and `produce-layout.js` re-hardcodes them." I was asked to
verify that before relying on it. It does not hold. `topology-graph.js`'s
`computeStructure` family is **dead code**, exactly like the track and pit
providers that tranche A deleted, and on all three boards it is a strictly
*worse* implementation than the live one. Every divergence the issue measures is
the dead provider being wrong, not `produce-layout.js` being wrong.

So the correct direction on all three is the option the task explicitly allowed:
**parameterise `produce-layout.js` identically** and delete the dead second
generator. Output-neutral for the corpus, because every value the corpus declares
is exactly the value that was hardcoded.

## Files changed

| file | change |
|---|---|
| `packages/schema/src/produce-layout.js` | +123 / −63; star and perimeter-cross parameterised, game-named helpers renamed to structure names |
| `packages/topologies/graph/src/topology-graph.js` | +15 / −290; dead `computeStructure` + `computeConcentricRings` + `computePerimeterCross` + `computeGridCross` + `computeStar` deleted, plus the `structure`/`params` branch of `renderLayout` they served (735 → 460 lines) |

Net −215 lines. Patch: `tranche-b.patch` (apply with `git apply` at engine root).

---

## Proof that the provider is dead

`createGraphTopology(...).renderLayout` is never invoked anywhere in the repo —
not in `packages/`, not in `js/`, not in `scripts/`, not in any test.
`packages/render/src/render-engine.js:13` imports only the standalone
`renderGraphLayout` (the ops pipeline); `packages/play/src/play.js` uses
`createGraphTopology` for `isValid`/`neighbours`/`distance` and never renders.
`computeStructure` is reachable only from the `structure && !inputNodes` branch of
that never-called `renderLayout`.

Instrumented `computeStructure` with a counter + stack dump and ran:

- all 334 renderable corpus variants through the real `export-boards` pipeline → **0 hits**
- `packages/schema` + `packages/render` + `packages/topologies` + `packages/plugins`,
  39 suites / 1693 tests → **0 hits**

Same instrumentation, same conditions, is what tranche A used to condemn the
track and pit providers. The graph provider is in the same category.

---

## Case 1 — star (stern-halma / super-chinese-checkers)

### What the numbers actually say

| | live (`produce-layout`) | dead provider (`computeStar`) |
|---|---|---|
| holes | 121 | 121 |
| viewBox | 561.6 × 534.6 | 504 × 477 |
| `h1` | 280.8, 100.8 | 252, 72 |
| elements emitted | defs, 3 rects, hexagon, 6 arm polygons, 2 outline polygons, hole group, piece group, label group | 121 bare circles |

Measured: the provider's 121 holes are the live 121 holes **translated by exactly
`(-28.8, -28.8)` in the same order**, and `28.8 = spacing * 1.2 = rim`. The
viewBox delta is exactly `2 * rim = 57.6` on each axis. So the "divergence" is
one thing: `computeStar` has no rim, because it has no board at all — no body,
no felt, no hexagon, no coloured arms, no star outline, no arm labels, no pieces.
It emits dot circles floating in space.

The issue itself notes "`computeStar` has no `rim` and emits circles with no board
furniture". That is not the live renderer diverging from a reference; that is a
stub. Making `produce-layout` "match the provider" would delete the stern-halma
board.

**Direction taken: parameterise `produce-layout`.** `params.armSize` and
`params.spacing` now drive the geometry:

- `rowWidths` → `starRowWidths(n)`, deriving `n` arm rows, `2n+1` body rows
  (central hexagon row + two side arms), `n` arm rows. `n = 4` reproduces
  `[1,2,3,4,13,12,11,10,9,10,11,12,13,4,3,2,1]` exactly.
- `for (row = 0; row < 17)` → `rowCount = 4 * armSize + 1`
- `4 - (row - 4)` → `armSize - (row - armSize)`; `row - 8` → `row - 2 * armSize`;
  `row < 4` → `row < armSize`; `row >= 13` → `row > 3 * armSize`
- `spacing * 16`, `spacing * 8`, `8 * rowH` → `spacing * (rowCount - 1)`,
  `spacing * 2 * armSize`, `2 * armSize * rowH`
- `spacing = params.spacing || render.cellSize || 24` (the declared param now wins;
  both are 24 in the corpus)
- `armPieceKeys` / `armColors` / `armOrder` / the `{N:[],NE:[],…}` literal / the
  `armFills` literal / the two `6`s → one `STAR_ARMS` constant plus two
  documented fallback tables.

The hand-drawn star outline (`[-50.5,-93]` … `[158,-93]`) is now a named table
scaled by `(spacing / 24) * (armSize / 4)`. At `armSize = 4` that factor is
exactly `1`, so the float arithmetic is bit-identical. Verified that the scaling
is geometrically right rather than merely convenient:

```
n=3: holes half-extent 108.00x124.71   star tips 123.24x140.63   ratio 1.1411 / 1.1277
n=4: holes half-extent 144.00x166.28   star tips 164.32x187.51   ratio 1.1411 / 1.1277
n=5: holes half-extent 180.00x207.85   star tips 205.40x234.39   ratio 1.1411 / 1.1277
```

The painted star tracks the hole lattice identically at every arm size.

Hole counts at other arm sizes match the closed form `6·n(n+1)/2 + (3n²+3n+1)`:

```
armSize=2  37 (expected 37)    369.6 x 367.6
armSize=3  73 (expected 73)    465.6 x 450.6
armSize=4 121 (expected 121)   561.6 x 534.6   <- corpus, unchanged
armSize=5 181 (expected 181)   657.6 x 617.6
armSize=6 253 (expected 253)   753.6 x 700.6
```

`params.spacing: 36` with `render.cellSize: 24` now yields width 842.4 instead of
561.6 — the declared param is genuinely honoured.

**Rendered output for the 5 corpus variants: byte-identical.** All five declare
`armSize: 4, spacing: 24`, and the family declares `cellSize: 24`.

## Case 2 — nyout (perimeter-cross)

The issue is right that `produceGraphLayout:1559` called `nyoutOps(...)` without
`params`, so nyout's four declared params were dead letters. It is wrong that the
provider is the reference.

Measured, same params both sides:

| | live | dead provider |
|---|---|---|
| nodes | 29 | 29 |
| viewBox | 320 × 320 | 320 × 320 |
| coordinate **set** | — | **identical** |
| edge set (compared as coordinate pairs) | 32 | 32, **identical** |
| `n22` | 70.4, 70.4 | 249.6, 249.6 |
| ids at a different coordinate | `n22 n23 n24 n25 n26 n27 n28 n29` (8 of 29) | |

The two implementations produce the *same board*. The only difference is the
order in which the eight diagonal stations are numbered: `produce-layout` walks
each full diagonal as a path (NW → centre → SE, then NE → centre → SW), the
provider emits four independent corner→centre spokes. There is no geometric
argument for either; there is a compatibility argument for one. `n1…n29` is
nyout's public position notation, consumed by `parseGraphSetup` and by the
`data-sq` attributes in the shipped SVG. Renumbering 8 of 29 squares to match an
unreachable function would be a gratuitous notation break.

**Direction taken: parameterise `produce-layout`, preserving its numbering.**
`nyoutStations`/`nyoutOps` → `perimeterCrossStations`/`perimeterCrossOps`, now
driven by `params.nodesPerSide`, `params.sides`, `params.diagonals`,
`params.intermediatesPerDiagonal`. Literal `20`s → `perimeterCount`; literal
index `20` → `centreIdx`; `new Set([0,5,10,15,20])` → corner indices +
`centreIdx`; the two hand-written 6-edge diagonal chains → a loop over
`floor(sides/2)` diagonals.

Float arithmetic preserved deliberately: the general form is written
`* i / (intermediates + 1)`, i.e. `(x * i) / 3`, matching the original
`* 1 / 3` and `* 2 / 3`. The provider's form (`const t = i / (n+1)` then `* t`)
is a different float path and would have shifted the last digits.

Parameter sweep (expected = `sides·nodesPerSide + 1 + 2·intermediates·floor(sides/2)`):

```
{sides:4, nodesPerSide:5, intermediates:2}                   29  (was 29, corpus)
{sides:4, nodesPerSide:6, intermediates:2}                   33
{sides:4, nodesPerSide:5, intermediates:3}                   33
{sides:3, nodesPerSide:5, intermediates:2}                   20
{sides:4, nodesPerSide:5, intermediates:2, diagonals:false}  21
```

Two honest limits, both documented in the code:

- `sides` above 4 collapses to 4. A perimeter-cross is a *square* circuit; both
  the old code and the provider index a 4-entry corner array, so the provider
  would have thrown on `sides: 5`. Building a real `n`-gon would require
  `cos/sin`, which cannot reproduce `294.4` exactly and would have broken byte
  identity at `sides: 4`. I chose byte identity and said so rather than inventing
  a polygon.
- `intermediatesPerDiagonal` uses `?? 2` rather than `|| 2`, so an explicit `0`
  now means "diagonals with no intermediate stations" instead of silently
  becoming 2. Cannot affect the corpus (value is 2).

**Rendered output for `nyout/standard`: byte-identical.**

## Case 3 — asalto (grid-cross)

**This case has nothing to fix in `produce-layout.js`. The issue has it backwards.**

The issue says "`computeGridCross` lacks `extraNodes` and
`fortressExtraRow/Cols`" — correct, and that is the *provider*.
`produce-layout.js` already supports all three, and has done all along.
Measured on `asalto/royal-garrison`:

| | live | dead provider | delta |
|---|---|---|---|
| nodes | 67 | 65 | the 2 declared `extraNodes` (fortress ears) at `70.3,30.4` and `309.7,30.4` |
| edges | 212 | 208 | 2 ears × 2 `connectsTo` each |
| fortress body | `x 110.2, y 30.4, w 159.6, h 79.8` | `x 110.2, y 30.4, w 159.6, h 39.9` | the declared `fortressExtraRow: 2` |

The provider's 65 nodes are a **coordinate-identical prefix** of the live 67.
Every one of the three deltas is exactly a frontmatter param the provider ignores
and the live code honours. There is no divergence to reconcile: the live code is
right and the dead code is incomplete.

**Direction taken: delete the dead `computeGridCross`; no behavioural change to
`produce-layout`.** The only edits are naming — `asaltoNodes` /
`asaltoFortressElements` / `asaltoOps` / `DEFAULT_ASALTO_GRID` →
`gridCrossNodes` / `gridCrossFortressElements` / `gridCrossOps` /
`DEFAULT_GRID_CROSS`, so the file stops naming a game in a module whose own
header says "No game names".

**Rendered output for `asalto/royal-garrison` and `asalto/standard`:
byte-identical.**

---

## Verification

### Corpus render, before and after

Rendered all corpus variants through the real pipeline (`dom-stubs` →
`resolveSurface` → `cascadeResolve` → `attachPieceImages` → `renderFromEngine` →
`embedPieceImages`, i.e. `scripts/export-boards.mjs` verbatim with the write
target redirected), on `origin/dev` and on the patched tree:

```
before: exported=334 skipped=2 errors=0
after:  exported=334 skipped=2 errors=0
diff -rq /tmp/base /tmp/after  ->  no differences
```

**Variants whose output changes: none. 0 of 334.**

That is not the "7 changed" the issue predicted, and it is the correct result:
the corpus declares exactly the values that were hardcoded, so honouring the
params is a no-op on this corpus. The change is real — the params now drive the
geometry, proven by the sweeps above — it just does not move any board the corpus
currently ships.

Independent cross-check against the artefacts committed in `moddable-rules`
(`games/<family>/diagrams/svg/<slug>-board.svg`), which the patched engine must
reproduce:

```
IDENTICAL  asalto/royal-garrison
IDENTICAL  asalto/standard
IDENTICAL  nyout/standard
IDENTICAL  stern-halma/standard-2p
IDENTICAL  stern-halma/standard-3p
IDENTICAL  stern-halma/standard-4p
IDENTICAL  stern-halma/standard-6p
IDENTICAL  stern-halma/super-chinese-checkers
```

### `diagram-hashes.json`

**Entries that need regenerating: none. 0 of 296.**

`diagram-hashes.json` is not a hash of rendered SVGs. `moddable-rules/scripts/check-diagram-freshness.mjs`
hashes each variant's `engine:` **frontmatter block** and nothing else. It never
loads the engine. No engine-side change can move an entry; only a corpus
frontmatter edit can, and this patch touches no corpus file. The issue's "at most
7 of 296" estimate is based on a misreading of what that file records.

Recomputed all 296 keys against `moddable-rules` HEAD (using the engine's
`parseFrontmatter`, since `gray-matter` is not installed in that checkout):
0 added, 0 removed, 14 stale — `chess/djambi`, `chess/four-handed-chess`,
`chess/half-chess`, `chess/los-alamos-vierschach`, `chess/upside-down`,
`chess/vierschach`, `go/one-colour`, and 7 `shogi/*`. All 14 are in families
touched by moddable-rules' own last two commits (`Add 4-owner vocabulary to FEN4
variants`, `Set djambi playable:false…`). Pre-existing, unrelated, and none of
them is a graph board.

**Side finding, worth its own issue in moddable-rules:** that script computes
`JSON.stringify(data.engine, Object.keys(data.engine).sort())`. The second
argument to `JSON.stringify` is a *replacer allowlist*, not a sort — and it
applies at every nesting level. So `{topology:{…}, players:[…], setup:{arms:[…]}}`
hashes as `{"players":[…],"setup":{},"topology":{}}`. Topology, structure and
params are erased before hashing. That is why all five stern-halma variants share
the hash `c8ed674cce44` despite different `setup.arms`. The freshness gate is
structurally blind to the exact category of drift this issue is about.

### Tests

Required set, patched tree:

```
packages/schema + packages/render + packages/plugins/__tests__/visual-loop.test.js
  Test Suites: 21 passed, 21 total
  Tests:     1379 passed, 1379 total
```

Identical to the `origin/dev` baseline (21 / 1379). Widened, patched tree:

```
packages/schema + packages/render + packages/topologies + packages/plugins
  Test Suites: 67 passed, 67 total
  Tests:     2371 passed, 2371 total
```

Repo guards:

```
node scripts/check-duplication.mjs   OK (409 files scanned)
node scripts/check-purity.mjs        1 violation, byte-identical output before and after
                                     (packages/schema/src/validate.js:121, pre-existing)
```

`packages/play` does not complete within a 400s timeout — confirmed identical on
a stashed clean `origin/dev` tree, so it is pre-existing and not caused by this
patch. `packages/ai` likewise not run for time.

---

## What I could not make work, plainly

1. **I could not make tranche B change any rendered output, and I do not think it
   should.** The task framed tranche B as "the part that changes rendered output",
   and the expected set was 7 variants. The correct fix changes 0. The three
   measured divergences are all real, all reproduced exactly, and all point the
   other way: `produce-layout` is the live and superior implementation in every
   case. Forcing produce-layout to match the provider would strip the stern-halma
   board down to 121 loose dots, delete asalto's two fortress ears and half its
   fortress zone, and renumber 8 of nyout's 29 squares. I did not do it.

2. **`sides > 4` on perimeter-cross is not truly parameterised** — it collapses to
   4. See case 2 for why (the alternative breaks byte identity at `sides: 4` for
   a configuration nothing declares). If a real `n`-gon perimeter is wanted, it
   needs its own issue and its own snapshot regeneration.

3. **The star outline table is still hand-drawn.** `[-50.5,-93]…[158,-93]` is a
   freehand Star of David, ~1.14× the hole lattice, not derivable from the
   lattice by any clean formula (it is not quite regular: y is 93 at the top and
   92.9 at the bottom). I made it scale correctly with `spacing` and `armSize`
   and verified the ratio holds, but the shape itself remains a calibrated
   constant rather than computed geometry. Replacing it with a computed hexagram
   would shift every stern-halma pixel.

4. **`STAR_ARM_PIECE_KEYS` / `STAR_ARM_COLORS` are still hardcoded.** The issue
   flags them. `stern-halma` declares `players: [red, blue, green, black, purple,
   brown]`, which matches them one-for-one, so they *look* derivable — but
   `render-engine.js` never injects `players` into `render`, and nothing in the
   resolved engine maps a colour name to a hex value. Deriving them needs a new
   injection point and a colour-name table; out of scope here. Moved to named
   constants with a comment stating why they are not derived.

5. **`render.labels: false` is ignored by the star renderer** (pre-existing, not
   touched). `stern-halma`'s rulebook declares it and the board still draws its
   N/NE/SE/S/SW/NW labels. Separate bug; fixing it *would* change 5 SVGs, so it
   belongs in a tranche with a snapshot regeneration, not here.

6. **`concentric-rings` / morris was not renamed.** `morrisOps` / `morrisRings` /
   `morrisPoints` still carry a game name in `produce-layout.js`. Its dead
   provider twin `computeConcentricRings` is deleted along with the rest (it was
   part of the same dispatcher), but the naming cleanup is out of tranche B's
   three cases and I left it alone rather than widening the diff.
