# moddable-engine

Micro-kernel master engine for all Moddable Games titles.

Every game in the Moddable Games collection — from standard chess to Endless Skies — runs on this engine by composing plugins. No hand-written engine code per game. A game is a configuration file that declares which plugins to activate.

---

## Status

**Ten families playable today** — chess (135+ variants incl. 6 hex), draughts (13), shogi (13), go (10), hex (8), mancala (6), morris (7), xiangqi (3), reversi (3), landlords-game (1). 198 playable variants total. Non-grid families remaining: backgammon (track), big 2 (tableau), halma (grid), race (track) — topologies registered but no plugins yet (#62).

Rules are implemented as plugin hooks — move filters, win conditions, turn logic, post-move effects. A composable rule layer exists in `packages/rule` (registry, dependency resolution, 8 parametric rules). The play surface (interaction, embed protocol, variant registry, SDK) is family-agnostic and lives in `packages/play`.

Read [`SPEC.md`](./SPEC.md) before contributing anything.

---

## The proof

Draughts has 13 playable variants (English, International, Turkish, Russian, Canadian, Brazilian, Italian, Spanish, Czech, German, Ghanaian, Pool, Spantsiretti). There is no variant code directory. Each variant is a set of declarative keys in a `.md` file. The same is true for shogi (13 variants including chu-shogi with 21 piece types) and xiangqi (3 variants).

Chess has 135 variants. All share piece definitions through `fromConfig` in `piece-behaviour`. Shogi and xiangqi were refactored this session to consume the same primitives, eliminating hand-rolled movement code.

---

## Structure

```
moddable-engine/
  packages/
    core/                ← state, moves, players, history, events, RNG, traversal
    topologies/
      grid/              ← rectangular grids + position notation
      hex/               ← hex (hexagonal + rhombus) + position notation
      track/             ← linear/circuit paths
      pit/               ← mancala pit-sow layouts
      graph/             ← arbitrary node-edge + position notation
      tableau/           ← card table layouts (radial, tableau, wall, linear)
    piece-behaviour/     ← movement primitives + composable definitions
    rule/                ← rule registry, composition engine, dependency resolution
    render/              ← layer-compositing SVG board renderer
    schema/              ← frontmatter → game definitions
    game/                ← factory, topology + component registries
    play/                ← universal game factory, interaction, embed, variant registry, SDK
    plugins/
      chess/             ← 135+ variants (topology-agnostic, grid + hex)
      draughts/          ← 13 variants (all frontmatter-only)
      go/                ← 10 variants (capture-go, gomoku, renju)
      hex/               ← 8 variants (standard + Y, bridge rollout policy)
      landlords-game/    ← 1 variant (1904 patent, dice roll, circuit win)
      mancala/           ← 6 variants (kalah, oware, congkak, sungka)
      morris/            ← 7 variants (concentric-rings graph, mill removal)
      shogi/             ← 13 variants (fromConfig-driven, rule hooks)
      xiangqi/           ← 3 variants (fromConfig-driven)
      reversi/           ← 3 variants (flanking capture, anti-reversi)
    component-deck/      ← standard 52-card deck
    component-dice/      ← standard dice (roll, doubles, expression parser, odds)
    hex-generators/      ← hex map generation (Catan, Twilight, Colony, etc.)
    rpg/                 ← RPG entity search, oracle rolls, card data, manifest loader
    ai/                  ← minimax+TT+quiescence, MCTS, evaluators, opening book
  SPEC.md                ← architecture spec — read this first
  package.json           ← workspace root
```

---

## The layers

| Layer | Package(s) | Purpose |
|---|---|---|
| 0 | `core` | State, moves, players, history, events, RNG, timer, plugin registry |
| 1 | `topologies/*` | Coordinate systems: grid, hex, track, pit, graph, tableau (6 types) |
| 2 | `piece-behaviour` | Movement primitives + composable piece definitions |
| 2 | `rule` | Rule registry, composition engine, dependency resolution |
| 3 | `render` | Layer-compositing SVG board renderer |
| 4 | `schema` | Frontmatter → game definitions |
| 5 | `component-*` | Non-spatial structure: deck, dice |
| 6 | `plugins/*` | Game families — 10 playable (chess, draughts, go, hex, landlords-game, mancala, morris, shogi, xiangqi, reversi) |
| 7 | Game configs | Frontmatter only — no code |

---

## Key principles

- If you have to mention a game's name to explain what a piece of code does, that code is in the wrong layer.
- Topologies are the universal adapter layer for geometry. Rules will be the universal adapter layer for behaviour (#88).
- Plugin hooks (moveFilter, winCondition, turnLogic, afterMove) implement rules per family today.
- No if/else for topology type anywhere in the codebase.
- Five independent axes compose freely: topology × pieces × rules × components × themes.

See `SPEC.md` section 0 (Philosophy) for the full reasoning behind every architectural decision.

---

## Getting started

The engine does not ship any games. Every board, variant and starting position lives in
[moddable-rules](https://github.com/Moddable-Games/moddable-rules). Clone both as siblings:

```bash
git clone https://github.com/Moddable-Games/moddable-engine.git
git clone https://github.com/Moddable-Games/moddable-rules.git
cd moddable-engine && npm ci
```

The browser resolves rules at `../../moddable-rules/` relative to the engine, so the two
checkouts must sit under a common parent. Node tooling reads `MODDABLE_RULES_DIR` instead:

```bash
MODDABLE_RULES_DIR=../moddable-rules/games npm test
```

**Without that variable the test suite fails wholesale**, because the corpus it tests against
is not present. That is expected on a fresh clone, not a broken checkout.

### Using the engine as a dependency

```js
import { setRulesReader, createGameForFamily } from '@moddable/engine/play'
import { readFileSync, readdirSync } from 'fs'

const DIR = '/path/to/moddable-rules/games'

setRulesReader(
  // `rulebook` is a reserved slug: it resolves to the family hub, not a variant.
  (family, slug) => slug === 'rulebook'
    ? readFileSync(`${DIR}/${family}/content/rulebook.md`, 'utf8')
    : readFileSync(`${DIR}/${family}/content/variants/${slug}.md`, 'utf8'),
  (family) => readdirSync(`${DIR}/${family}/content/variants`)
    .filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)),
)

const game = createGameForFamily('chess', { variant: 'standard', rngSeed: 1 })
console.log(game.getLegalMoves().length)   // 20
```

A reader that does not special-case `rulebook` will fail with
`Unknown variant "standard" for family "chess"`, which names the wrong problem.

### Adding a variant

See [docs/authoring.html](docs/authoring.html). A variant is one markdown file and usually
no JavaScript at all. After adding one, regenerate the manifest the play page reads:

```bash
MODDABLE_RULES_DIR=../moddable-rules/games node scripts/gen-playability-manifest.mjs
```

---

## Running tests

```bash
NODE_OPTIONS='--experimental-vm-modules' npx jest
```

---

## Related repos

- [`moddable-hexmaps`](https://github.com/Moddable-Games/moddable-hexmaps) — migrating to plugin-grid-hex
- [`moddable-rules`](https://github.com/Moddable-Games/moddable-rules) — migrating build system to plugin-rules
- [`dungeon-chess`](https://github.com/Moddable-Games/dungeon-chess) — north star proof of concept
- [`moddable-ops`](https://github.com/Moddable-Games/moddable-ops) — coordination and planning

---

## Changelog

#### 2026-09-06
- Hasami Shogi plays its own game. `captureRule: custodian` was wired into applying a move and not into generating one, so the sandwich worked and moving straight onto an enemy piece worked too: twelve captures by displacement against three by sandwich, which is ordinary shogi with an unusual piece set
- Alquerque plays. Its lines run corner to corner and midpoint to midpoint, so half its points carry all four diagonals and half carry none, and a piece may only move along a line that is drawn. The topology answers whether a line exists and the plugin asks; on every other draughts board the answer is always yes, which is why nothing else moved
- The alternating-diagonal board was drawn wrong: an X in every other square gives every point exactly two diagonals, where Alquerque and Fanorona alternate between points with four and points with none. Sixteen segments either way, half of them in the wrong places. Both boards are redrawn, and a test asserts the lines the engine draws and the lines a piece may walk are the same set, in both directions
- Alquerque, Fanorona and Surakarta each shipped twenty-four black stones on a board that starts twelve against twelve. All three declared their pieces as `w: {type: stone, color: white}` where the renderer wants `w: wS`, so every piece fell to one key. Fanorona and Surakarta were overriding a correct declaration in their own rulebooks
- All three also drew their stones a full cell wide on a board of points, so the stones met edge to edge and covered the lines they stand on. `pieceScale` is declared per board and leaves the other 331 exactly as they were
- Two variants played on a board with holes in it and used the holes. Vierschach castled queenside onto a corner outside its own board, and four-player shogi dropped into them: 324 such moves in 150 plies, three pieces left standing there. Both were the same mistake made twice, because a void is stored as an empty square and neither the castling path check nor the drop generator asked the topology
- Every variant in the corpus that declares `topology.voids` is now played and checked, discovered by shape rather than named, so a variant added tomorrow is covered without editing the test. Romanchenko's Chess, which prompted the sweep, turned out to be correct already
- Go can open from a position. `setup` was in the plugin's config keys and read nowhere, so every go variant started from an empty board however its frontmatter opened - which is why Sunjang Baduk's sixteen pre-placed stones and Tibetan Go's twelve went in and were discarded, invisibly, because an empty go board looks like an empty go board. The stones now go in as an ordinary position string parsed by the topology, the path every other family already used
- A captured Xiang Fu Champion returns as a Pupil. `demotionMap` is now read by the chess plugin, the key the shogi plugin already used for the same idea, so a side can no longer drop a third royal piece onto a board that starts with two
- The realistic tile style is back for nukes, talisman and colony. The artwork existed all along in `moddable-hexmaps` as remapped Screaming Brain Studios CC0 tiles; it had never been copied across, so the style could only ever have requested files that were not there
- Colony's seafarers layouts render their sea: half a Seafarers board was flat blue against illustrated land. Realistic now covers five of the seven layouts completely, leaving gold (2 hexes) and the deliberately face-down fog
- Colony advertised a `kenney` style and served the artistic set under that name. There is no colony-kenney artwork anywhere; the style is now called what it is
- Endless Skies asked for every one of its tiles under `img/tiles/`, a path that exists in `moddable-hexmaps` and not here, so all 91 hexes were broken image requests
- A requested tile style is clamped to one the generator actually offers. It survives a game switch, arrives by URL and arrives by postMessage, and `getImages()` answered an unknown style with its first folder, rendering one game's artwork under another game's label
- Tile artwork is now guarded: every style a generator advertises must resolve to files on disk, every per-hex `imagePath` must exist, and `tiles/tile-index.json` must cover every set and be mirrored by the published API copy. The three realistic sets and twilight are indexed, so the gallery and the generators finally agree on what exists
- Two bishops with two free squares of the same colour left a player stranded in placement chess: `leavesRestPlaceable` counted admissible squares without noticing that a distinct-colour type needs distinct colours. The phase never ended and the game carried on as ordinary chess with a piece still in hand. One random placement in thirty hit it
- The playability gate is reproducible. Every variant drew from one shared stream, so its result depended on how many numbers the variants before it had consumed, and the game's own generator was seeded from the clock. Each variant now has its own stream and its own game seed, and four variants assert that two runs play the same game

#### 2026-09-02
- Hex tile styles now reach the renderer. `getImages(style)` was defined on every generator and called by nothing, so artistic, kenney and realistic all fell back to the flat colour fill that classic already gave. Twilight was the inverse, assigning `imagePath` regardless of style so it could never render flat
- `hexImageOpts()` resolves both artwork sources for the embed and interactive paths, and treats classic as the style that suppresses artwork however a generator assigns it
- Tile style select is populated from `gameConfig.styles` instead of fixed markup, which offered every game the same three options and left one unreachable
- `generate()`'s fourth argument is the layout, not an RNG; both call sites passed a freshly built RNG, so the layout parameter was parsed and discarded
- Dropped the realistic style from nukes, talisman and colony: no tile set exists for it. Colony's absent sea, gold and fog tiles now fall back to the colour fill rather than requesting missing files

#### 2026-09-01
- Piece-file resolution ratcheted: a manifest naming a file whose case does not match disk fails outright (it renders on macOS and silently drops artwork on Linux), while the 32 entries naming files absent everywhere are a shrink-only baseline
- Dobutsu Shogi and two mahjong boards were blank cards in the gallery, board and all: their artwork is an editor export carrying `sodipodi:` and `osb:` attributes whose namespace declarations live on the source file's own root, which is discarded when the piece is inlined as a `<symbol>`. The prefix was then undeclared and the browser refused the whole document
- Editor namespace attributes are stripped when embedding, and a test parses all 334 gallery SVGs, because a malformed SVG is still a file of the right name and size and only a parser can tell
- The board gallery had no freshness gate at all, so it drifted silently: it served 180 of 334 boards, kept the superseded Dai Shogi position and inverted seat artwork, and drew Dobutsu with 4 of its 8 pieces from the wrong piece set in a 1.1MB file
- `build-board-index.mjs --check` added and gated in CI, so the gallery can no longer disagree with the snapshots it is built from
- 153 orphaned `moddable-chess--*` gallery SVGs deleted, left from the chess hub rename and referenced by nothing; the published board count was counting them, reporting 487 boards against 334 real ones
- Six separate walks over a FEN rank collapsed onto one, `readPosition` in `packages/core`: the grid topology, three parsers inside the renderer, the play serialiser and the Create page. Three of the six carried their own tokeniser, which is how they drifted far enough for one to read the wrong seat
- `check-duplication.mjs` gains two checks written by shape rather than by name, so a seventh rank tokeniser or a second place deriving a seat from symbol case is caught without anyone predicting it first
- Proven behaviour-preserving: all 334 board snapshots byte-identical across the refactor
- A fourth position parser, `parseSfenToPosition`, reached only by setups containing a bracket, called an uppercase symbol gote. Uppercase is sente, and every other path maps it to the seat-0 artwork, so the six large shogi boards drew each camp in the other's pieces while every single-character board was correct
- `check-duplication.mjs` is a blocklist of nine specific past consolidations, not a duplicate detector: it cannot see a new duplicate of anything not already named in it, which is how four position parsers accumulated
- Three separate writers serialised a board position and each wrote multi-character piece symbols raw, so Dai Shogi's `PW` read back as a pawn and a silver and `GB` as a gold and a bishop: every row served to the play page was twice too long and the pieces shown were never on the board
- `topology-grid.serializePosition`, `play/src/fen.js` and `play/src/serialise.js` now all bracket a symbol longer than one character; the reader, `parseRankRuns`, had handled brackets all along
- The Create page tokenised a setup one character at a time, so importing any variant with multi-character codes lost the board entirely
- Dai Shogi playable, taking shogi to 13 and the corpus to 204
- `api/stats.json` carries a datestamp and `build-discovery.mjs --check` compares byte for byte, so the file went stale at midnight on its own and any push on a later day than the last regeneration turned CI red with no commit behind it
- The date is carried forward when every other figure matches, and moves when a figure moves, so it keeps meaning when the numbers were measured rather than when the script last ran

#### 2026-08-31
- `kingLandsBehindCapture` (#161): a Thai king still flies to reach a capture but comes to rest on the square immediately beyond it, which needed a condition on the landing loop rather than turning flying kings off
- diagonal draughts was a stale unplayable entry, not a gap: its anti-diagonal setup was already declared and correct, now asserted in a test
- Draughts 13 to 15 playable, 201 to 203 across the corpus
- CI pairs the moddable-rules branch with the branch being built (#164), so a rules push can no longer turn engine main red on its own
- Four rebuilt plugin workspaces added to the lockfile: npm ci had aborted every CI run on both branches since 2026-08-29, before any job reached its own logic
- board-corpus honours MODDABLE_RULES_DIR, and the puzzle normalisation step is told where the corpus is; neither gate had ever executed on a runner
- `dropZone` (#158): a captured piece re-enters only within its owner's declared ranks, which is xiang-fu's drop rule
- Wrap seams on the grid topology (#159): klein-bottle and mobius-strip chess join the wrapped edge with a twist
- romanchenkos-chess needed no engine change: voids were already honoured, its setup FEN was misaligned with them
- Board snapshots recaptured for romanchenkos-chess and ultima after their corrected setups
- Chess 135 to 138 playable, 198 to 201 across the corpus

#### 2026-08-29
- Unsupported coverage gate (#109): every unplayable variant now says why, CI ratchet at zero silent variants
- `_family` key for shared unsupported reasons (write the common part once, not per variant)
- Rule registry gap measurement (#88): 4 of 23 declared rule ids have factories, 19 do not; shrink-only ratchet
- `win.threshold` rule: three-check variants migrated to shared registry, three JS modules replaced by one frontmatter value
- Fixed: checkCount never initialised (three-check variants never worked), composeRules returned stale state, AI never saw composed win conditions
- 4 family landing pages: hex, mancala, morris, landlords-game (all 10 families now have pages)
- 4 family doc pages with embed, variants, mechanics, and SDK sections
- Homepage: 10 family chips, hero lede lists all families, OG/meta descriptions auto-patched by build-discovery
- build-discovery.mjs: OG/meta descriptions now data-driven (was manual), family chip counts driven from playability manifest
- All 19 doc page sidebars updated to list all 10 playable families
- 43 unplayable variants declared across 17 families in moddable-rules (silent gap is zero)
- Version 1.0.26, 180 suites, 6390 passing

#### 2026-08-27
- Fixed five gameplay bugs: Morris unplayable past move 18 (falsy-zero + fixed interaction model), mill removal auto-picked without asking, Kalah bonus turn never fired (continuesTurn implemented but uncalled), Landlords invisible (CSS nowrap hid long turns, history never scrolled, no wealth display)
- Hex 2x performance: single flood fill per ply (only the player who moved), cached adjacency lookups, one-pass getLegalMoves
- Hex bridge rollout policy (#148): teaches MCTS playouts to defend bridges (MoHex pattern), 74k to 151k simulated moves
- Hex and Landlords seat objectives (#149): describeSeat hook shows each player's goal and holdings
- Djambi four-player readability: move log groups by seat count, algebraic notation gated to two-player chess only
- Test-count reporter guard: opt-in publishing via MODDABLE_PUBLISH_TEST_COUNTS env var (partial tiers can no longer overwrite the project's figure)
- Rewrote e2e every-family-clickable test: uses move log as witness, finds targets by what appeared since rest
- Seeded playability-standard and go-playout-policy tests (four unseeded statistical tests in one day)
- Declared 11 unsupported chess variants with measured failure modes in moddable-rules
- 176 suites, 6363 passing, 67 Playwright e2e tests

#### 2026-08-20
- Create page #118 steps 1–4: Tier A rule keys (15 new config keys across draughts/reversi/shogi/chess), piece-set filtering, metadata block (title/slug/win/special), YAML import with round-trip
- Corpus round-trip test: 179 tests covering all 176 playable variants from moddable-rules
- Extracted `serialize-frontmatter.js` as shared browser-safe YAML serializer; deleted hand-rolled export code
- Fixed YAML export silently corrupting arrays (topology.voids, render.zones)
- Fixed family detection in import for variants without explicit plugins block (uses meta.parent fallback)

#### 2026-08-19
- Fixed fairy-piece case mismatch: renamed wdE→wDE, bdE→bDE, wdH→wDH, bdH→bDH in mce-shogi-fairy (resolved recurring sync:boards collision with moddable-rules)
- Removed `dist/` prefix from all rules.moddable.games links in topology/family HTML pages
- Closed #133: removed all Tier 1 game-knowledge hardcodings from non-plugin packages (FEN4 owners, Go alphabet, shogi branching in fen.js, chess references in variant-flags.js, landlords naming in produce-layout)
- Added `no-game-knowledge.test.js` purity gate: scans 124 non-plugin source files for game-family name references
- Closed #129: kirin + dobutsu artwork resolved; djambi tracked separately on #131
- Closed #58: hex already plays (chess plugin has hexPawnConfig + hex-knight)
- Updated #62 with current provider playability state
- README and CLAUDE.md updated to reflect actual package structure (topologies/, plugins/ subdirectories; deleted stub plugins removed from docs)

#### 2026-08-14
- Shogi 6 to 13: sho, yari, tori, cannon, hasami, chu (12x12, 21 types), four-player declared playable
- Go 9 to 10: renju with forbidden-move filter (double-three, double-four, overline)
- piece-behaviour: lame leapers (orthogonal/half blocking), hopper moveSlide option
- Shogi plugin refactored to consume fromConfig; gains rule hooks (moveFilter, afterMove, winCondition), custodian capture, royal-less variants
- Xiangqi plugin refactored to consume fromConfig; unmapped-symbol throws added
- Chess en passant crash fixed for 4-player (seats 2/3); multiplayer opponent guards
- Create page: WYSIWYG board editor with piece definition, live move preview, Try in Play, two-sidebar layout, hover feedback, 15 contract tests
- Synochess: lame leapers declared correctly (approximation notes retired)
- Issues closed: #59 (N-player framework), #110 (Create page Phase 1)
- Issue opened: #115 (Create page Phase 2)
- Total: 177 playable variants across 6 families

#### 2026-08-10
- Issue triage: closed 17 issues (47, 48, 51, 54, 56, 60, 64, 66, 72, 73, 74, 76, 77, 80, 94, 96, 104)
- build-discovery.mjs: patches all homepage stats from data (test count, topology cards, family chips, hero lede, docs coverage)
- Fixed: absorption chess typeForAbilities returned queen for all compound types; now correctly maps archbishop/chancellor/amazon
- Fixed: game-play.js fenMap and getVariantPieceKeys read from resolved frontmatter instead of JS registry
- Compound piece definitions (archbishop, chancellor, amazon) added to absorption.md frontmatter in moddable-rules

#### 2026-08-16
- Fixed: play page board invisible on iOS Safari (SVG collapsed to 0 height without explicit width attribute; embeds worked because their CSS set width:100%)

#### 2026-08-15
- Create page Phase 2: named drafts (localStorage), per-family rules panel, intersection grids, template loading, SVG/PNG export with inlined pieces, "Players & sides" with per-player advancement directions
- Fixed: four-player-shogi now fully playable (shogi plugin was two-player throughout: hands, checkWin, isInCheck, promotion, drops all generalised for N players)
- Shogi plugin: per-player directional rotation via advancement vectors (red/blue advance laterally on cross-boards)
- Fixed: move animation on rotated pieces (animate the rotation group, not the child image)
- Fixed: FEN parser disagreement on boards wider than 9 files (unified multi-digit empty-count parsing across all four readers)
- Fixed: rules content caching (no-cache revalidation on all moddable-rules fetches)
- Fixed: create page "Try in Play" crash (engine.pieces.map not a function)
- AI evaluator: fixed oppHand crash for >2 player games
- "Edit in Create" link on play page for any grid variant
- Honest piece-set list (marks 45 sets whose naming convention the editor cannot yet map)
- Version 1.0.18

#### 2026-08-17
- Consolidation sprint (#128): collapsed 3 resolver copies into resolveFromFetch, unified recolour into recolourSvgText, routed RPG getField through packages/rpg/src/card-data.js, eliminated bare returns in visual-loop, fixed FEN4/coord setups
- Fixed gallery-index.json cache-busting: all 3 loaders (play-shared, gallery, create) now use versioned fetch URLs
- Closed #129: all 6 shogi variants now resolve artwork via `pieces.set` + `fenMap` in moddable-rules; kirin=wKI, dobutsu=wikimedia-dobutsu
- Rewrote visual-loop and start-position-canon tests to respect per-variant piece set overrides (was hardcoding hub set)
- Added `validatePieceVocabulary()` to render-engine — throws on vocabulary/set mismatches at resolve time
- #130 tranche A: fixed produceHexLegacy 0x0 viewBox, added cx/cy to track point polygons, deleted 529 lines of dead parameterised renderers, lifted backgammon constants to render.*
- Fixed FEN4 regression: boardToSetup now receives players arg so 4-player positions serialise with owner prefixes; 532/533 visual-loop tests pass (djambi only failure)

#### 2026-08-06
- CI pipeline fully green for the first time (PR #92 merged): unit-tests (3021), playability-standard, Playwright e2e (50 tests)
- Fixed: opening books inert since conformance migration (PR #97). Parser now strips quote chars from YAML keys; variantOpeningBook reads from definition object (browser-safe), not resolveFromDisk (Node-only)
- Fixed: jest/@jest/globals removed by knip cleanup restored to root devDependencies
- Fixed: Playwright CI serves engine + rules as siblings so RULES_BASE resolves correctly
- Fixed: AI NPS floor lowered to 150 for CI (catches catastrophic regressions, survives runner variance)
- Fixed: sittuyin piece set filtering regression (placementPieces read from resolved frontmatter)
- moddable-rules dev merged to main (22 commits: playable:true, engine plugin blocks)

#### 2026-08-05
- Split chess variant files: every variant now in its own kebab-case file (53 files, no multi-variant bundles)
- Deleted standard.js (key-only no-op, now frontmatter-only like all other data-only variants)
- Corrected conformance: chess is 99/100 (only breakthrough carries data), not 95/100. Total: 129/130 frontmatter-only
- Fixed 5 test suites that were silently providing zero coverage (play-kit, simulator-helper, render-helper, go-variants, go-playout-policy) by adding the missing setup-rules-reader import
- Removed UNSUPPORTED doc objects from draughts test (documentation lives in moddable-rules frontmatter)
- Documentation overhaul (#91): corrected rules claim, family/variant counts, homepage stats, SPEC status header. Families section now distinguishes playable (5) from plugin-only (8)

#### 2026-07-27
- Family-agnostic play kit in `packages/play`: interaction models (move, place, chain, drop), generic `game:*` embed protocol with per-family aliases, family-scoped variant registry with `extends` inheritance, and a headless SDK covering every family
- Game controller now drives interaction through the models rather than assuming from/to moves, and gained `performAction` (pass, resign), `handleHandClick`, and chain anchoring for multi-jump turns
- Go brought to playable parity: 9 hub variants registered, territory and area scoring with dead-stone marking, positional superko, capture annotation, MCTS opponent
- Draughts brought to playable parity: 13 hub variants registered, capture-priority and king-preference rules, `loseOnSinglePiece`, hooks on the plugin
- Fixed the AI simulator scoring every terminal position for player 0 when winners are named by colour rather than by index
- Added `docs/go.html` and `docs/draughts.html`
- Chess play parity: hand/drop UI, 7 board themes, 5 piece colour presets, SAN notation, multi-move indicator (closes #40)
- Hex SDK: FOV computation, BFS pathfinding, exportGameData, editHex, PNG export, terrain editor (closes #41)
- 26 new tests (hex-fov, hex-pathfind, hex SDK extensions)
- Hex docs updated with FOV, pathfinding, and new embed commands
- Chess docs updated with setTheme command

#### 2026-07-26
- Universal game factory: `createGameForFamily()` in `packages/play` — single import for all 13 families with uniform interface (getLegalMoves, applyMove, checkWin, getState, loadState)
- Added `./play` to package.json exports map
- Closed issue #42: unblocks 5 moddable-tools play commands

#### 2026-07-25
- Added static API page (`/api/`) with JSON endpoint documentation
- Added llms.txt and .well-known/mcp.json for AI agent discoverability
- New packages: `rpg` (entity search, oracle rolls, card data) and `hex-generators` (map generation)
- Added `calculateOdds()` to component-dice for probability calculations
- SDK-style exports map in package.json for programmatic consumers
- API link added to site-wide navigation and footer across all pages

#### 2026-07-22
- Added `--sync` mode to export-boards.mjs for incremental diagram export (hash-based staleness detection)
- RPG character sheet renderer: Create, Blank, and Random modes with sidebar editing and import/export
- Headless character sheet SVG generation via export-chargen.mjs
- Closed issues #16 (cross-repo sync) and #33 (RPG manifest v2)

#### 2026-08-16
- Added 6 topology landing pages (/topologies/grid, hex, track, pit, graph, tableau) with showcase examples and embedded play surfaces
- Added 6 family landing pages (/families/chess, draughts, go, shogi, xiangqi, reversi) with variant showcases and dynamic stats
- Homepage topology cards and family chips now link to their landing pages
- Each showcase example links to the corresponding rules page on rules.moddable.games
- Discovery pipeline generates sitemap entries and per-family variant/frontmatter-only stats
- Shared families.css and families.js for consistent layout across all landing pages

#### 2026-08-09
- Added build-discovery.mjs: generates api/stats.json, api/index.json, mcp.json, llms.txt, sitemap.xml from data
- CI gate enforces discovery surface freshness (--check mode)
- Fixed stale counts: puzzles 1,557→1,876, tiles 7→8, puzzle meta synced
- Sitemap now auto-generated from docs/ and playable families
- Agent discovery: added server-card.json, api-catalog (RFC 9727), auth.md, link rel tags
- Fixed AI difficulty ladder: medium/hard no longer share depth (now 5/7)
- Fixed large board viewport overflow (max-width constraint)
- Removed stale docs/effects.md
- Closed 11 issues (#65, #70, #71, #83, #87, #90, #91, #95, #103, #105, #106)
- Updated global CLAUDE.md: branch sync automatic at session start/end

#### 2026-07-21
- Implemented topology-tableau: card/dice/domino table layouts as a proper topology (issue #25)
- 40 component game variants now render through the standard pipeline (no bespoke renderers)
- Deal specs moved from hardcoded engine source to frontmatter in moddable-rules
- Deleted renderers.js, render-from-resolved.js, layout.js, games:{} objects from all 6 deck files
- Play page routes component games through frontmatter (same path as board games)
- 40 self-contained SVGs added to boards gallery with embedded piece artwork
- Snapshot pipeline expanded to cover content/games/ directory structure
- 1367 tests across 104 suites, 332 snapshots byte-identical
- Closed issue #25

#### 2026-07-20
- Board gallery sync: 284 → 293 boards (10 new chess topology variants: circular, byzantine, cylindrical, spherical, mobius, klein-bottle, toroidal, toroidal-byzantine, raumschach, rollerball)
- Added Starforged RPG with 12 oracle categories
- RPG provider fully abstracted to manifest-driven architecture (issue #29): engine reads rpg-manifest.json from moddable-rules, no game knowledge in engine code
- New modules: rpg-manifest-loader.js, rpg-card-renderer.js, rpg-link-resolver.js
- Wrote topology-tableau + deal spec unified plan (issue #25, merging former #8)
- Closed issues #1, #8, #29

#### 2026-07-15
- Production readiness: dev/main branch strategy, CNAME (engine.moddable.games)
- Added version system (version.txt + bump.sh) with cache-busting on all CSS/JS refs
- Added OG images and full meta tags (og: + twitter:card) for all 13 pages
- Added sitemap.xml, robots.txt, favicon.svg, .nojekyll
- Blueprint-aesthetic OG image generator (scripts/gen-og.py) matching moddable-rules style

#### 2026-07-08
- RPG provider: DOM-based search + card table for D&D 5e and Ironsworn
- Colour-coded categories, universal cross-category search, rules.moddable.games links
- Removed Hyper Imperium (now a Twilight variant); Econopoly uses Landlord's 1932 board
- Created moddable-rules#167 for anchor-based deep linking

#### 2026-07-07
- Fixed Y game board — renders as centred equilateral triangle (was skewed parallelogram)
- Added Hex size variants: 9x9, 13x13, 14x14, 19x19 alongside standard 11x11
- Added Y size variants: side-9 (small), side-12 (standard), side-15 (large)
- Hex/Y boards get shaped frames (outer hex-edge border) instead of square backgrounds
- Added Korean station names to Nyout board hover (all 29 nodes from reference SVG)
- Generic `nodeNames` support in hover system for any node-based game
- Asalto/Royal Garrison fortress rendering fixes (ear nodes, hull stroke cleanup)

#### 2026-07-04
- Built Landlord's Game board renderer — all 3 editions (1904, 1906, 1932) from JSON data
- 1932: type-driven stripe bands, 16-point star, inner track boxes with hover
- 1906: L-shaped Natural Opportunity corners with doorway connectors, split diagonal corners
- 1904: oversized medallion circles (SVG overflow visible), 4-quadrant inner track
- Added inner track data and hover info for all editions (multi-track notation groundwork)

#### 2026-07-03
- Transcribed all 3 Landlord's Game boards to structured JSON (1904, 1906, 1932)
- Added board data loading infrastructure to board studio

#### 2026-06-30
- Refactored plugin-chess to be fully topology-agnostic (board via getCell/setCell, pawn via topology.step + pawnConfig)
- Added topology.step(from, direction) to grid and hex — universal single-step advancement
- Added getAllCells()/getCellCount() to grid topology (matching hex contract)
- Proved Glinski hexagonal chess: full game on hex topology (init, moves, check, checkmate)
- Refactored all 8 rule implementations to be topology-agnostic (support arrays + objects)
- Wired plugin-chess to use composed rules via game factory (opt-in, backwards-compatible)
- wrapPluginWithRules replaces plugin hooks with composed versions (init, getLegalMoves, applyMove, checkWin)
- Implemented rule registry: rules as first-class resource type with composition engine
- Per-hook composition strategies: AND (validate), CHAIN (apply), PIPELINE (filter), UNION (moves)
- Dependency resolution via topological sort with cycle detection
- 8 parametric chess rules: attack-detection, capture-replacement, castling, check, checkmate, draw-50-move, en-passant, promotion
- Composable piece definitions: rider(), leaper(), compose(), divergent(), fromConfig()
- Rewrote plugin-chess: topology-agnostic via piece-behaviour, parametric config for all assumptions
- Chess960-safe castling (dynamically scans rook positions from board state)
- 11 variant proof tests (no-castling, custom promotion, 10x8, fairy pieces, wrap/toroidal, etc.)
- Game factory gains rule resolution (backwards-compatible, opt-in)
- Audited all 76 MCE variants to verify rule parametricity
- Implemented complete plugin library: 7 game families (go, hex, mancala, morris, backgammon, big2, chess)
- Created component layer: deck (standard-52) and dice consumed via registry like topologies
- Created theming layer: board-theme (3 builtins), piece-theme (resolver, recolour, composition)
- Added traversal algorithms to core (floodFill, getGroup, hasPath, findPatterns)
- Added position notation to grid/hex/graph topologies (serialize/parse with any vocabulary)
- Added unified direction API: topology.rays(from, 'orthogonal') works on both grid and hex
- Proved cross-topology: same movement functions work on grid AND hex without code changes
- Plugin vocabulary system: each plugin declares piece type ↔ symbol mapping
- Component registry in game factory: components provided via request() like topologies
- Every plugin proven with unit tests, vertical proof, and complete-game proof
- Implemented @moddable/game: factory, topology registry, definition wiring
- Eliminated all hidden knowledge: DEFAULT_FAMILY_MAP, hardcoded topology imports, shape dispatch
- Enriched all 154 moddable-rules variants with engine: blocks
- Separated topology geometry from visual style (cellType + defaults + theme resolver pattern)

#### 2026-06-29
- Implemented @moddable/topology-graph: arbitrary node-edge structures (morris proof)
- Implemented @moddable/schema: full pipeline (parse, validate, produce, load, infer, enrich)
- Proved all 7 games playable from schema-driven definitions
- Made schema fully topology-agnostic (topologies self-describe via exported schema objects)
- Updated README to reflect actual project state

#### 2026-06-28
- Implemented render layer with topology-provided layouts
- Made piece-behaviour fully topology-agnostic

#### 2026-06-27
- Implemented topology-track and topology-pit
- Implemented topology-hex (axial coordinates)
- Implemented topology-grid and piece-behaviour
- Added continueTurn to move pipeline

#### 2026-06-26
- Implemented @moddable/core — 9 modules + 7 proof game tests
- Rewrote Phase 2 PRD with 7 proof games

#### 2026-06-25
- Added SPEC.md — architecture spec with philosophy and decisions log
- Initial repo setup
