import { renderBoard, fenToPosition } from './board-diagrams.js'
import { getGameConfig, getAllGames, HexSvg, createSeededRng } from './hex-games/index.js'
import { getDeckConfig, getRegisteredDecks, createDeck, shuffle, deal, layoutTable } from './deck-manager/index.js'
import { renderRpgProvider } from './rpg-provider.js'
import { renderFromResolved, loadGalleryIndex as loadAdapterGallery, setDeckRenderer, setMahjongRenderer, setTableauRenderer, setMultiBoardRenderer } from './render-adapter.js'
import { reverseAdapt } from './reverse-adapter.js'
import { resolveSurface } from './surface-resolver.js'
import { resolve as cascadeResolve } from './cascade-resolver.js'
import { renderConsolidated, isGridProvider } from './render-consolidated.js'
import { renderConsolidatedHex, isHexProvider } from './render-consolidated-hex.js'
import { renderConsolidatedGraph, isGraphProvider } from './render-consolidated-graph.js'
import { renderConsolidatedPit, isPitProvider } from './render-consolidated-pit.js'
import { renderConsolidatedTrack, isTrackProvider } from './render-consolidated-track.js'

setDeckRenderer(renderDeckSvg)
setMahjongRenderer(renderMahjongSvg)
setTableauRenderer(renderTableauSvg)
setMultiBoardRenderer(renderMultiBoard)

// ─── DUNGEON CHESS CELL MAPS ───────────────────────────────────────────────
// null = void, 'floor' = standard, 'p1'/'p2' = deploy zones, 'water' = obstacle

function parseCellMap(template) {
  const CELL_TYPES = {
    '.': null, f: 'floor', w: 'water', '1': 'p1', '2': 'p2',
    r: 'rosette', c: 'castle', h: 'home',
    l: 'lake', s: 'sea', a: 'aerodrome', b: 'base', H: 'harbour',
    L: 'land', R: 'river', Q: 'hq', q: 'hq', d: 'den', t: 'trap',
  }
  return template.trim().split('\n').map(row =>
    [...row].map(c => CELL_TYPES[c] !== undefined ? CELL_TYPES[c] : null)
  )
}

const DUNGEON_2P = parseCellMap(`
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
`)

const DUNGEON_4P = parseCellMap(`
......11111111......
......11111111......
......ffffffff......
.........ff.........
.........ff.........
.........ff.........
11f...ffffffff...f11
11f...ffffffff...f11
11f...ffwwwwff...f11
11ffffffwwwwffffff11
11ffffffwwwwffffff11
11f...ffwwwwff...f11
11f...ffffffff...f11
11f...ffffffff...f11
.........ff.........
.........ff.........
.........ff.........
......ffffffff......
......11111111......
......11111111......
`)

const DUNGEON_COMPACT = parseCellMap(`
2222222222
2222222222
ffffffffff
fffwwwwfff
fffwwwwfff
fffwwwwfff
fffwwwwfff
ffffffffff
1111111111
1111111111
`)

const DUNGEON_COLORS = {
  floor: '#d4c4a8', floorStroke: '#2a2a2a',
  p1: '#f0d080', p1Stroke: '#c08820',
  p2: '#f0b0b0', p2Stroke: '#c05050',
  water: '#4a90c8', waterStroke: '#2a2a2a',
  voidFill: '#1a1a2e',
}

const ROYAL_UR_MAP = parseCellMap(`
rfff..rf
ffffrfff
rfff..rf
`)

function buildCrossMap(castles) {
  const grid = Array.from({ length: 19 }, () => Array(19).fill(null))
  for (let r = 0; r < 8; r++) for (let c = 8; c <= 10; c++) grid[r][c] = 'floor'
  for (let r = 11; r < 19; r++) for (let c = 8; c <= 10; c++) grid[r][c] = 'floor'
  for (let c = 0; c < 8; c++) for (let r = 8; r <= 10; r++) grid[r][c] = 'floor'
  for (let c = 11; c < 19; c++) for (let r = 8; r <= 10; r++) grid[r][c] = 'floor'
  for (let r = 8; r <= 10; r++) for (let c = 8; c <= 10; c++) grid[r][c] = 'home'
  for (const [r, c] of castles) grid[r][c] = 'castle'
  return grid
}

const PACHISI_CASTLES = [[0, 9], [3, 8], [3, 10], [8, 3], [8, 15], [9, 0], [9, 18], [10, 3], [10, 15], [15, 8], [15, 10], [18, 9]]
const PACHISI_MAP = buildCrossMap(PACHISI_CASTLES)

const CHAUPAR_MAP = buildCrossMap([])

const PACHISI_COLORS = {
  floor: '#f0d5a0', floorStroke: '#8b6545',
  castle: '#c0622f', castleStroke: '#8b6545', castleX: '#fff8f0',
  home: '#8b1a1a', homeStroke: '#6a1212',
  voidFill: 'transparent',
}

const CHAUPAR_COLORS = {
  floor: '#d4d8f0', floorStroke: '#2d3a8c',
  home: '#1a1a6b', homeStroke: '#12124a',
  voidFill: 'transparent',
}

const ROYAL_UR_COLORS = {
  floor: '#d4b896', floorStroke: '#8b7355',
  rosette: '#c4956a', rosetteStroke: '#8b5a3a',
  rosetteDot: '#8b3a3a', rosetteDotOuter: '#a04848',
  voidFill: 'transparent',
}

const ROYAL_UR_DECORATIONS = {
  rosette: (cx, cy, ts, colors) => {
    const s = ts * 0.25
    const fill = colors.rosetteDot || '#8b3a3a'
    const fillOuter = colors.rosetteDotOuter || '#a04848'
    return [
      { tag: 'circle', attrs: { cx, cy, r: s * 0.42, fill } },
      { tag: 'circle', attrs: { cx, cy: cy - s, r: s * 0.25, fill } },
      { tag: 'circle', attrs: { cx, cy: cy + s, r: s * 0.25, fill } },
      { tag: 'circle', attrs: { cx: cx - s, cy, r: s * 0.25, fill } },
      { tag: 'circle', attrs: { cx: cx + s, cy, r: s * 0.25, fill } },
      { tag: 'circle', attrs: { cx: cx - s * 0.7, cy: cy - s * 0.7, r: s * 0.17, fill: fillOuter } },
      { tag: 'circle', attrs: { cx: cx + s * 0.7, cy: cy - s * 0.7, r: s * 0.17, fill: fillOuter } },
      { tag: 'circle', attrs: { cx: cx - s * 0.7, cy: cy + s * 0.7, r: s * 0.17, fill: fillOuter } },
      { tag: 'circle', attrs: { cx: cx + s * 0.7, cy: cy + s * 0.7, r: s * 0.17, fill: fillOuter } },
    ]
  },
}

const PACHISI_DECORATIONS = {
  castle: (cx, cy, ts, colors) => {
    const d = ts * 0.3
    const stroke = colors.castleX || '#fff8f0'
    return [
      { tag: 'line', attrs: { x1: cx - d, y1: cy - d, x2: cx + d, y2: cy + d, stroke, 'stroke-width': 1.5, 'stroke-linecap': 'round' } },
      { tag: 'line', attrs: { x1: cx + d, y1: cy - d, x2: cx - d, y2: cy + d, stroke, 'stroke-width': 1.5, 'stroke-linecap': 'round' } },
    ]
  },
}

// ─── LAYOUT BUILDERS (shared, referenced by any family/variant that needs them) ─
// TEMPORARY: move to packages/schema/src/produce.js when frontmatter lands.
// Data (coordinates, colours) goes into frontmatter YAML.
// Dimension computation becomes a generic resolver in produce().
// See: packages/schema/__tests__/produce-purity.test.js

function buildCheckeredLayout(rows, cols, tileSize, colors) {
  return { positionType: 'square' }
}

function buildMonoGridLayout(rows, cols, tileSize, colors) {
  return {
    positionType: 'square',
    cellFill: 'none',
    backgrounds: [{ fill: colors.monoSquare || '#d9b483' }],
    lines: { color: colors.gridLine || '#8b6914', width: 1.5 },
  }
}

function buildIntersectionGridLayout(rows, cols, tileSize, colors, config = {}) {
  const inset = config.inset ?? Math.round(tileSize * 0.5)
  const diagonals = config.diagonals === 'alternating'
    ? { predicate: 'alternating', color: colors.gridLine || '#8b6914', width: 1.5 }
    : config.diagonals || null
  return {
    positionType: 'intersection',
    showLabels: config.showLabels !== false,
    inset,
    cellFill: 'none',
    backgrounds: [{ fill: colors.monoSquare || '#d9b483', rx: 4 }],
    lines: { color: colors.gridLine || '#8b6914', width: 2 },
    diagonals,
    markers: config.allDots !== false
      ? Array.from({ length: rows * cols }, (_, i) => ({ r: Math.floor(i / cols), c: i % cols, radius: 3, fill: colors.gridLine || '#8b6914' }))
      : (config.markers || []),
  }
}

// ─── TAFL BOARD MAPS ────────────────────────────────────────────────────────

function buildTaflMap(size, { corners = true } = {}) {
  const grid = Array.from({ length: size }, () => Array(size).fill('floor'))
  const mid = Math.floor(size / 2)
  grid[mid][mid] = 'throne'
  if (corners) {
    grid[0][0] = 'corner'
    grid[0][size - 1] = 'corner'
    grid[size - 1][0] = 'corner'
    grid[size - 1][size - 1] = 'corner'
  }
  return grid
}

const TAFL_COLORS = {
  floor: '#d9c5a0', floorStroke: '#8b7355',
  throne: '#8b4513', throneStroke: '#5c2d0e',
  corner: '#4a6741', cornerStroke: '#2d4028',
  voidFill: 'transparent',
}

// ─── SHAPED BOARD MAPS (diamond, cross) ────────────────────────────────────

function buildDiamondMap(rows, cols, rankWidths) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null))
  for (let r = 0; r < rows; r++) {
    const w = rankWidths[r]
    const offset = Math.floor((cols - w) / 2)
    for (let c = offset; c < offset + w; c++) {
      grid[r][c] = true
    }
  }
  return grid
}

function buildCrossShapeMap(rows, cols, armWidth) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null))
  const startR = Math.floor((rows - armWidth) / 2)
  const startC = Math.floor((cols - armWidth) / 2)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const inVertical = c >= startC && c < startC + armWidth
      const inHorizontal = r >= startR && r < startR + armWidth
      if (inVertical || inHorizontal) {
        grid[r][c] = true
      }
    }
  }
  return grid
}

const BALBO_MAP = buildDiamondMap(10, 11, [3, 5, 7, 9, 11, 11, 9, 7, 5, 3])
const HOLE_CHESS_MAP = (() => {
  const grid = buildDiamondMap(10, 7, [1, 3, 5, 7, 7, 7, 7, 5, 3, 1])
  // Two holes at D4 and D7 (col 3, rows 6 and 3 in 0-indexed top-to-bottom)
  grid[6][3] = 'hole'
  grid[3][3] = 'hole'
  return grid
})()
const FOUR_PLAYER_MAP = buildCrossShapeMap(14, 14, 8)
const LOS_ALAMOS_V_MAP = buildCrossShapeMap(10, 10, 6)
function buildCornerMap(innerSize) {
  const size = innerSize + 2
  const grid = Array.from({ length: size }, () => Array(size).fill(null))
  for (let r = 1; r <= innerSize; r++) for (let c = 1; c <= innerSize; c++) grid[r][c] = true
  grid[0][0] = true; grid[0][size - 1] = true; grid[size - 1][0] = true; grid[size - 1][size - 1] = true
  return grid
}

const OMEGA_MAP = buildCornerMap(10)
const GUSTAV_MAP = buildCornerMap(8)

// ─── L'ATTAQUE FAMILY BOARD MAPS ──────────────────────────────────────────

const LATTAQUE_STANDARD_MAP = parseCellMap(`
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
`)

const AVIATION_MAP = parseCellMap(`
fffaafff
ffffffff
ffffffff
ffffffff
ffffffff
ffffffff
ffffffff
ffffffff
ffffffff
ffffffff
fffaafff
`)

const DOVER_PATROL_MAP = parseCellMap(`
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
`)

const TRI_TACTICS_MAP = parseCellMap(`
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
`)

const LATTAQUE_COLORS = {
  floor: '#5a8a3a', floorStroke: '#3d6b28',
  lake: '#4a7ab5', lakeStroke: '#2a5a8a',
  voidFill: 'transparent',
}

const AVIATION_COLORS = {
  floor: '#8fa8bf', floorStroke: '#6b8aa5',
  aerodrome: '#d4a843', aerodromeStroke: '#a07c20',
  voidFill: 'transparent',
}

const DOVER_PATROL_COLORS = {
  sea: '#3a6e9e', seaStroke: '#2a5580',
  harbour: '#5a8ab5', harbourStroke: '#3a6a95',
  base: '#c8a832', baseStroke: '#9a8020',
  voidFill: 'transparent',
}

const TRI_TACTICS_COLORS = {
  land: '#5a8a3a', landStroke: '#3d6b28',
  sea: '#3a6e9e', seaStroke: '#2a5580',
  lake: '#3a6e9e', lakeStroke: '#2a5580',
  hq: '#c8a832', hqStroke: '#9a8020',
  voidFill: 'transparent',
}

// ─── DOU SHOU QI (JUNGLE) BOARD MAP ───────────────────────────────────────

function buildJungleMap() {
  const grid = Array.from({ length: 9 }, () => Array(7).fill('floor'))
  // River: rows 3-5, cols 1-2 and 4-5
  for (let r = 3; r <= 5; r++) {
    grid[r][1] = 'river'; grid[r][2] = 'river'
    grid[r][4] = 'river'; grid[r][5] = 'river'
  }
  // Dens: centre of back row for each player
  grid[0][3] = 'den'
  grid[8][3] = 'den'
  // Traps: adjacent to dens
  grid[0][2] = 'trap'; grid[0][4] = 'trap'; grid[1][3] = 'trap'
  grid[8][2] = 'trap'; grid[8][4] = 'trap'; grid[7][3] = 'trap'
  return grid
}

const JUNGLE_MAP = buildJungleMap()

const JUNGLE_COLORS = {
  floor: '#7cb342', floorStroke: '#558b2f',
  river: '#4a90c8', riverStroke: '#2a6a9a',
  den: '#4a3520', denStroke: '#2a1a10',
  trap: '#c8963c', trapStroke: '#8b6520',
  voidFill: 'transparent',
}

// ─── (Asalto + Nyout now use dedicated providers in board-diagrams.js) ────

// ─── HEX GRID GENERATORS (DATA FACTORIES) ──────────────────────────────────

function generateHexGrid(radius) {
  const hexes = []
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius)
    const r2 = Math.min(radius, -q + radius)
    for (let r = r1; r <= r2; r++) {
      hexes.push({ q, r })
    }
  }
  return hexes
}

function generateHexRhombus(rows, cols) {
  const hexes = []
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      hexes.push({ q, r })
    }
  }
  return hexes
}

function generateTriangularHexGrid(sideLength) {
  const hexes = []
  for (let row = 0; row < sideLength; row++) {
    for (let i = 0; i <= row; i++) {
      hexes.push({ q: -row + i, r: row })
    }
  }
  return hexes
}

// ─── HEX GAME COLOR PALETTES ───────────────────────────────────────────────

const NUKES_COLORS = {
  lightHex: '#7cb342', darkHex: '#558b2f', midHex: '#8bc34a',
  stroke: 'rgba(0,0,0,0.3)', background: '#1a2e1a',
}

const HEX_SPACE_COLORS = {
  lightHex: '#1a237e', darkHex: '#0d1442', midHex: '#283593',
  stroke: 'rgba(100,150,255,0.3)', background: '#070b1e',
}

const HEX_TERRAIN_COLORS = {
  lightHex: '#a5d6a7', darkHex: '#66bb6a', midHex: '#81c784',
  stroke: 'rgba(0,0,0,0.2)', background: '#1b2e1b',
}

// ─── HEX COLOUR FUNCTIONS ────────────────────────────────────────────────────

function glinskiColor(hex, colors) {
  const mod = (((hex.q - hex.r) % 3) + 3) % 3
  return mod === 0 ? colors.lightHex : mod === 1 ? colors.midHex : colors.darkHex
}

function agonRingColor(hex, colors) {
  const ring = Math.max(Math.abs(hex.q), Math.abs(hex.r), Math.abs(hex.q + hex.r))
  return ring % 2 === 0 ? colors.darkHex : colors.lightHex
}

function buildHexPosition(white) {
  const pos = {}
  const black = white.map(([p, q, r]) => [p.toLowerCase(), q, -r - q])
  for (const [p, q, r] of white) pos[`${q},${r}`] = p
  for (const [p, q, r] of black) pos[`${q},${r}`] = p
  return pos
}

const GLINSKI_POSITION = buildHexPosition([
  ['K', 1, 4], ['Q', -1, 5],
  ['B', 0, 5], ['B', 0, 4], ['B', 0, 3],
  ['N', -2, 5], ['N', 2, 3],
  ['R', -3, 5], ['R', 3, 2],
  ['P', -4, 5], ['P', -3, 4], ['P', -2, 3], ['P', -1, 2],
  ['P', 0, 1], ['P', 1, 1], ['P', 2, 1], ['P', 3, 1], ['P', 4, 1],
])

const MCCOOEY_POSITION = buildHexPosition([
  ['K', 1, 4], ['Q', -1, 5],
  ['B', 0, 5], ['B', 0, 4], ['B', 0, 3],
  ['N', -2, 5], ['N', 2, 3],
  ['R', -3, 5], ['R', 3, 2],
  ['P', -3, 4], ['P', -2, 3], ['P', -1, 2],
  ['P', 0, 1], ['P', 1, 1], ['P', 2, 1], ['P', 3, 1],
])

const MINI_HEXCHESS_POSITION = buildHexPosition([
  ['K', 0, 3],
  ['B', 0, 2], ['B', 0, 1],
  ['N', -1, 3], ['N', 1, 2],
  ['R', -2, 3], ['R', 2, 1],
  ['P', -2, 2], ['P', -1, 1], ['P', 0, 0], ['P', 1, 0], ['P', 2, 0],
])

function buildHexPositionExplicit(white, black) {
  const pos = {}
  for (const [p, q, r] of white) pos[`${q},${r}`] = p
  for (const [p, q, r] of black) pos[`${q},${r}`] = p
  return pos
}

// Shafran: 70-hex irregular hexagon, flat-top, 9 files (a-i), file lengths 6,7,8,9,10,9,8,7,6
// For visual symmetry with axialToPixelFlat, each file's r-midpoint must equal -q/2.
// rMid = -q/2, rStart = ceil(rMid - (len-1)/2), rEnd = rStart + len - 1.
function generateShafranGrid() {
  const fileLengths = [6, 7, 8, 9, 10, 9, 8, 7, 6]
  const hexes = []
  for (let f = 0; f < 9; f++) {
    const q = f - 4
    const len = fileLengths[f]
    const rMid = -q / 2
    const rStart = Math.round(rMid - (len - 1) / 2)
    for (let i = 0; i < len; i++) {
      hexes.push({ q, r: rStart + i })
    }
  }
  return hexes
}

const SHAFRAN_GRID = generateShafranGrid()

// White back rank = bottom of each file (max r); Black = top of each file (min r)
// Bottoms: a=5, b=5, c=5, d=5, e=5, f=4, g=3, h=2, i=1
// Tops:    a=0, b=-1, c=-2, d=-3, e=-4, f=-4, g=-4, h=-4, i=-4
const SHAFRAN_POSITION = buildHexPositionExplicit(
  [
    ['R', -4, 5], ['N', -3, 5], ['B', -2, 5], ['Q', -1, 5], ['K', 0, 5],
    ['B', 1, 4], ['B', 2, 3], ['N', 3, 2], ['R', 4, 1],
    ['P', -4, 4], ['P', -3, 4], ['P', -2, 4], ['P', -1, 4],
    ['P', 0, 4], ['P', 1, 3], ['P', 2, 2], ['P', 3, 1], ['P', 4, 0],
  ],
  [
    ['r', -4, 0], ['n', -3, -1], ['b', -2, -2], ['q', -1, -3], ['k', 0, -4],
    ['b', 1, -4], ['b', 2, -4], ['n', 3, -4], ['r', 4, -4],
    ['p', -4, 1], ['p', -3, 0], ['p', -2, -1], ['p', -1, -2],
    ['p', 0, -3], ['p', 1, -3], ['p', 2, -3], ['p', 3, -3], ['p', 4, -3],
  ]
)

// De Vasa: 81-hex rhombus 9x9, horizontal orientation
// Uses generateHexRhombus(9, 9) — q=0..8, r=0..8
const DE_VASA_POSITION = buildHexPositionExplicit(
  [
    ['R', 0, 8], ['N', 1, 8], ['B', 2, 8], ['Q', 3, 8], ['B', 4, 8],
    ['K', 5, 8], ['B', 6, 8], ['N', 7, 8], ['R', 8, 8],
    ['P', 0, 6], ['P', 1, 6], ['P', 2, 6], ['P', 3, 6], ['P', 4, 6],
    ['P', 5, 6], ['P', 6, 6], ['P', 7, 6], ['P', 8, 6],
  ],
  [
    ['r', 0, 0], ['n', 1, 0], ['b', 2, 0], ['k', 3, 0], ['b', 4, 0],
    ['q', 5, 0], ['b', 6, 0], ['n', 7, 0], ['r', 8, 0],
    ['p', 0, 2], ['p', 1, 2], ['p', 2, 2], ['p', 3, 2], ['p', 4, 2],
    ['p', 5, 2], ['p', 6, 2], ['p', 7, 2], ['p', 8, 2],
  ]
)

// Brusky: 84-hex irregular hexagon, pointy-top, 8 ranks of width 9,10,11,12,12,11,10,9
// With pointy-top axial, visual x = sqrt(3) * (q + r/2).
// For symmetric outline, each rank's visual midpoint must be at x≈0.
// qStart = -floor((w + r - 1) / 2) achieves this (half-cell alternation is natural).
function generateBruskyGrid() {
  const rankWidths = [9, 10, 11, 12, 12, 11, 10, 9]
  const hexes = []
  for (let rank = 0; rank < 8; rank++) {
    const w = rankWidths[rank]
    const qStart = -Math.floor((w + rank - 1) / 2)
    for (let i = 0; i < w; i++) {
      hexes.push({ q: qStart + i, r: rank })
    }
  }
  return hexes
}

const BRUSKY_GRID = generateBruskyGrid()

const BRUSKY_POSITION = buildHexPositionExplicit(
  [
    ['R', -7, 7], ['N', -6, 7], ['B', -5, 7], ['Q', -4, 7], ['K', -3, 7],
    ['B', -2, 7], ['B', -1, 7], ['N', 0, 7], ['R', 1, 7],
    ['P', -7, 6], ['P', -6, 6], ['P', -5, 6], ['P', -4, 6], ['P', -3, 6],
    ['P', -2, 6], ['P', -1, 6], ['P', 0, 6], ['P', 1, 6], ['P', 2, 6],
  ],
  [
    ['r', -4, 0], ['n', -3, 0], ['b', -2, 0], ['q', -1, 0], ['k', 0, 0],
    ['b', 1, 0], ['b', 2, 0], ['n', 3, 0], ['r', 4, 0],
    ['p', -5, 1], ['p', -4, 1], ['p', -3, 1], ['p', -2, 1], ['p', -1, 1],
    ['p', 0, 1], ['p', 1, 1], ['p', 2, 1], ['p', 3, 1], ['p', 4, 1],
  ]
)

// ─── GO PRESET POSITIONS ───────────────────────────────────────────────────

function buildGoPreset(name, rows) {
  const GO_LETTERS = 'abcdefghjklmnopqrst'
  const position = {}
  const place = (r, c, color) => {
    position[`${GO_LETTERS[c]}${rows - r}`] = { type: 'stone', color }
  }
  if (name === 'sunjang') {
    // 8 black + 8 white on 4-4 star points and diagonal approach points
    // Standard sunjang pattern: alternating B/W on all 9 star points + 7 extra
    const stars = [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]]
    // Black: d4, d16, p4, p16, d10, j4, j16, p10
    place(3, 3, 'black'); place(3, 15, 'black'); place(15, 3, 'black'); place(15, 15, 'black')
    place(3, 9, 'black'); place(9, 3, 'black'); place(9, 15, 'black'); place(15, 9, 'black')
    // White: j10 (tengen), plus 4-10 approach points
    place(9, 9, 'white'); place(5, 5, 'white'); place(5, 13, 'white'); place(13, 5, 'white')
    place(13, 13, 'white'); place(5, 9, 'white'); place(9, 5, 'white'); place(13, 9, 'white')
  } else if (name === 'tibetan') {
    // 6 black + 6 white on 4th-line star points of 17x17
    // Black on top half star points, White on bottom half
    place(3, 3, 'black'); place(3, 8, 'black'); place(3, 13, 'black')
    place(7, 5, 'black'); place(7, 8, 'black'); place(7, 11, 'black')
    place(13, 3, 'white'); place(13, 8, 'white'); place(13, 13, 'white')
    place(9, 5, 'white'); place(9, 8, 'white'); place(9, 11, 'white')
  }
  return position
}

// ─── SHARED HEX LAYOUT BUILDERS ─────────────────────────────────────────────
// These produce HexBoardLayout config objects consumed by topology-hex renderLayout().
// Game-specific data (colour functions, positions, frame specs) lives on the variant.

function buildHexagonalLayout(hexes, cellSize, orientation, colors, config = {}) {
  const hasFrame = !!config.hexFrame
  const colorFn = config.hexColorFn
    ? (q, r, hex) => config.hexColorFn(hex, colors)
    : (q, r) => {
        const s = q + r
        return s % 3 === 0 ? (colors.lightHex || '#f0d9b5')
          : s % 3 === 1 ? (colors.darkHex || '#b58863')
          : (colors.midHex || '#d4a96a')
      }
  return {
    hexes,
    orientation,
    cellSize,
    scale: config.hexScale || 0.95,
    background: hasFrame ? null : { fill: colors.background || '#2c2c2c', rx: 6 },
    frame: hasFrame ? {
      stroke: colors.border || '#6b4226',
      strokeWidth: 14,
      linecap: 'round',
      linejoin: 'round',
      scale: 1.05,
    } : null,
    cellFill: colorFn,
    cellStroke: { color: colors.stroke || 'rgba(0,0,0,0.2)', width: 1 },
    centreMarker: config.centreMarker
      ? { q: 0, r: 0, text: config.centreMarker, fontSize: cellSize * 0.8, fill: 'rgba(255,200,50,0.85)' }
      : null,
  }
}

function buildRhombusLayout(hexes, cellSize, orientation, colors, config = {}) {
  return {
    hexes,
    orientation,
    cellSize,
    scale: config.hexScale || 0.95,
    background: null,
    frame: {
      stroke: colors.border || '#6b4226',
      strokeWidth: 14,
      linecap: 'round',
      linejoin: 'round',
      scale: 1.05,
    },
    cellFill: config.hexColorFn || ((q, r) => {
      const s = q + r
      return s % 3 === 0 ? (colors.lightHex || '#e8e8e8')
        : s % 3 === 1 ? (colors.darkHex || '#c0c0c0')
        : (colors.midHex || '#d8d8d8')
    }),
    cellStroke: { color: colors.stroke || 'rgba(0,0,0,0.3)', width: 1 },
  }
}

function buildTriangularLayout(hexes, cellSize, orientation, colors, config = {}) {
  return {
    hexes,
    orientation,
    cellSize,
    scale: config.hexScale || 0.95,
    background: null,
    frame: {
      stroke: colors.border || '#6b4226',
      strokeWidth: 14,
      linecap: 'round',
      linejoin: 'round',
      scale: 1.05,
    },
    cellFill: config.hexColorFn || ((q, r) => {
      const s = q + r
      return s % 3 === 0 ? (colors.lightHex || '#e8e8e8')
        : s % 3 === 1 ? (colors.darkHex || '#c0c0c0')
        : (colors.midHex || '#d8d8d8')
    }),
    cellStroke: { color: colors.stroke || 'rgba(0,0,0,0.3)', width: 1 },
  }
}

// ─── AGON POSITION (Queen + 6 Guards per side on outer ring) ────────────────

function buildAgonPosition() {
  // Exact positions from Wikipedia "Agon_board_1.svg"
  // All pieces on ring 5. Queens at 3/9 o'clock, guards alternating around.
  const pos = {}
  // White queen (left, 9 o'clock)
  pos['-5,0'] = 'Q'
  // Black queen (right, 3 o'clock)
  pos['5,0'] = 'q'
  // White guards
  pos['4,-5'] = 'P'; pos['5,-2'] = 'P'; pos['3,2'] = 'P'
  pos['-1,5'] = 'P'; pos['-5,4'] = 'P'; pos['-1,-4'] = 'P'
  // Black guards
  pos['1,-5'] = 'p'; pos['5,-4'] = 'p'; pos['1,4'] = 'p'
  pos['-4,5'] = 'p'; pos['-5,2'] = 'p'; pos['-3,-2'] = 'p'
  return pos
}

// ─── DOU SHOU QI SETUP (distinct animals per FEN letter) ───────────────────
// E=Elephant(8) L=Lion(7) T=Tiger(6) P=Leopard(5) D=Dog(4) W=Wolf(3) C=Cat(2) R=Rat(1)
// White (bottom): a1=Lion, g1=Tiger, b2=Rat, f2=Elephant, a3=Dog, c3=Leopard, e3=Wolf, g3=Cat
// Black (top): mirrors on rows 7-9

const JUNGLE_SETUP = 'l5t/1d3c1/r1p1w1e/7/7/7/E1W1P1R/1C3D1/T5L'

// ─── GRAPH LAYOUT GENERATORS (DATA FACTORIES) ───────────────────────────────

function generateMorrisLayout(rings, boardSize, opts = {}) {
  const size = boardSize || 320
  const diagonals = opts.diagonals || false
  const midpoints = opts.midpoints !== false
  const pointRadius = opts.pointRadius || 7
  const colors = opts.colors || {}
  const lineColor = colors.line || '#4a3520'

  const margin = size * 0.0625, maxInset = size * 0.375
  const step = rings > 1 ? (maxInset - margin) / (rings - 1) : 0
  const cx = size / 2, cy = size / 2
  const ringRects = []
  for (let i = 0; i < rings; i++) {
    const inset = margin + i * step
    ringRects.push({ x: inset, y: inset, w: size - inset * 2, h: size - inset * 2 })
  }

  // Compute node positions (corners + midpoints of each ring)
  const nodes = []
  for (const rect of ringRects) {
    nodes.push({ id: `n${nodes.length + 1}`, x: rect.x, y: rect.y })
    nodes.push({ id: `n${nodes.length + 1}`, x: rect.x + rect.w, y: rect.y })
    nodes.push({ id: `n${nodes.length + 1}`, x: rect.x + rect.w, y: rect.y + rect.h })
    nodes.push({ id: `n${nodes.length + 1}`, x: rect.x, y: rect.y + rect.h })
    if (midpoints) {
      nodes.push({ id: `n${nodes.length + 1}`, x: cx, y: rect.y })
      nodes.push({ id: `n${nodes.length + 1}`, x: rect.x + rect.w, y: cy })
      nodes.push({ id: `n${nodes.length + 1}`, x: cx, y: rect.y + rect.h })
      nodes.push({ id: `n${nodes.length + 1}`, x: rect.x, y: cy })
    }
  }
  if (rings === 1 && midpoints) nodes.push({ id: `n${nodes.length + 1}`, x: cx, y: cy })

  // Compute edges from ring connectivity
  const edges = []
  const ppRing = midpoints ? 8 : 4
  for (let r = 0; r < rings; r++) {
    const base = r * ppRing
    for (let i = 0; i < 4; i++) {
      const curr = base + i
      const next = base + ((i + 1) % 4)
      if (midpoints) {
        const mid = base + 4 + i
        edges.push({ from: nodes[curr].id, to: nodes[mid].id })
        edges.push({ from: nodes[mid].id, to: nodes[next].id })
      } else {
        edges.push({ from: nodes[curr].id, to: nodes[next].id })
      }
    }
  }
  // Cross-lines connecting rings at midpoints
  if (midpoints && rings > 1) {
    for (let i = 0; i < 4; i++) {
      for (let r = 0; r < rings - 1; r++) {
        const a = r * ppRing + 4 + i
        const b = (r + 1) * ppRing + 4 + i
        edges.push({ from: nodes[a].id, to: nodes[b].id })
      }
    }
  }
  // Diagonal edges
  if (diagonals) {
    if (rings === 1) {
      edges.push({ from: nodes[0].id, to: nodes[2].id })
      edges.push({ from: nodes[1].id, to: nodes[3].id })
    } else {
      for (let i = 0; i < 4; i++) {
        const outer = i
        const inner = (rings - 1) * ppRing + i
        edges.push({ from: nodes[outer].id, to: nodes[inner].id })
      }
    }
  }

  // Structure: ring rects (drawn as stroke-only rectangles)
  const structures = []
  for (const rect of ringRects) {
    structures.push({ tag: 'rect', attrs: {
      x: rect.x, y: rect.y, width: rect.w, height: rect.h,
      fill: 'none', stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square',
    }})
  }
  // Midpoint cross-lines as structure (not edges — they're geometric, not connectivity)
  if (midpoints) {
    if (rings === 1) {
      const r = ringRects[0]
      structures.push({ tag: 'line', attrs: { x1: cx, y1: r.y, x2: cx, y2: r.y + r.h, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
      structures.push({ tag: 'line', attrs: { x1: r.x, y1: cy, x2: r.x + r.w, y2: cy, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
    } else {
      structures.push({ tag: 'line', attrs: { x1: cx, y1: ringRects[0].y, x2: cx, y2: ringRects[rings - 1].y, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
      const last = ringRects[rings - 1]
      structures.push({ tag: 'line', attrs: { x1: cx, y1: last.y + last.h, x2: cx, y2: ringRects[0].y + ringRects[0].h, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
      structures.push({ tag: 'line', attrs: { x1: ringRects[0].x, y1: cy, x2: ringRects[rings - 1].x, y2: cy, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
      structures.push({ tag: 'line', attrs: { x1: last.x + last.w, y1: cy, x2: ringRects[0].x + ringRects[0].w, y2: cy, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
    }
  }
  if (diagonals) {
    if (rings === 1) {
      const r = ringRects[0]
      structures.push({ tag: 'line', attrs: { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y + r.h, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
      structures.push({ tag: 'line', attrs: { x1: r.x + r.w, y1: r.y, x2: r.x, y2: r.y + r.h, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
    } else {
      const o = ringRects[0], inner = ringRects[rings - 1]
      structures.push({ tag: 'line', attrs: { x1: o.x, y1: o.y, x2: inner.x, y2: inner.y, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
      structures.push({ tag: 'line', attrs: { x1: o.x + o.w, y1: o.y, x2: inner.x + inner.w, y2: inner.y, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
      structures.push({ tag: 'line', attrs: { x1: o.x, y1: o.y + o.h, x2: inner.x, y2: inner.y + inner.h, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
      structures.push({ tag: 'line', attrs: { x1: o.x + o.w, y1: o.y + o.h, x2: inner.x + inner.w, y2: inner.y + inner.h, stroke: lineColor, 'stroke-width': 2.5, 'stroke-linecap': 'square' } })
    }
  }

  return {
    nodes, edges, width: size, height: size,
    backgrounds: [{ fill: colors.background || '#f5e6c8', rx: 4 }],
    structures,
    zones: [],
    edgeStyle: { stroke: 'none', strokeWidth: 0, linecap: 'round' },
    nodeRadius: pointRadius,
    nodeColor: colors.point || '#4a3520',
    nodeScale: {},
    nodeColorMap: {},
    labels: [],
    defs: [],
  }
}

function generateNyoutLayout(boardSize, opts = {}) {
  const size = boardSize || 320
  const pointRadius = opts.pointRadius || 7
  const colors = opts.colors || {}
  const lineColor = colors.line || '#4a3520'

  const margin = size * 0.08
  const x0 = margin, x1 = size - margin
  const y0 = margin, y1 = size - margin
  const cx = size / 2, cy = size / 2

  const corners = [
    { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }, { x: x1, y: y0 },
  ]

  const nodes = []
  const edges = []

  // Outer ring: 4 sides × 5 nodes
  for (let side = 0; side < 4; side++) {
    const from = corners[side], to = corners[(side + 1) % 4]
    nodes.push({ id: `n${nodes.length + 1}`, x: from.x, y: from.y, type: 'junction' })
    for (let i = 1; i <= 4; i++) {
      nodes.push({ id: `n${nodes.length + 1}`, x: from.x + (to.x - from.x) * i / 5, y: from.y + (to.y - from.y) * i / 5 })
    }
  }
  for (let i = 0; i < 20; i++) edges.push({ from: nodes[i].id, to: nodes[(i + 1) % 20].id })

  // Centre (index 20)
  nodes.push({ id: `n${nodes.length + 1}`, x: cx, y: cy, type: 'centre' })

  // Diagonal intermediates
  const nw = corners[2], se = corners[0], ne = corners[3], sw = corners[1]
  nodes.push({ id: `n${nodes.length + 1}`, x: nw.x + (cx - nw.x) / 3, y: nw.y + (cy - nw.y) / 3 })
  nodes.push({ id: `n${nodes.length + 1}`, x: nw.x + (cx - nw.x) * 2 / 3, y: nw.y + (cy - nw.y) * 2 / 3 })
  nodes.push({ id: `n${nodes.length + 1}`, x: cx + (se.x - cx) / 3, y: cy + (se.y - cy) / 3 })
  nodes.push({ id: `n${nodes.length + 1}`, x: cx + (se.x - cx) * 2 / 3, y: cy + (se.y - cy) * 2 / 3 })
  nodes.push({ id: `n${nodes.length + 1}`, x: ne.x + (cx - ne.x) / 3, y: ne.y + (cy - ne.y) / 3 })
  nodes.push({ id: `n${nodes.length + 1}`, x: ne.x + (cx - ne.x) * 2 / 3, y: ne.y + (cy - ne.y) * 2 / 3 })
  nodes.push({ id: `n${nodes.length + 1}`, x: cx + (sw.x - cx) / 3, y: cy + (sw.y - cy) / 3 })
  nodes.push({ id: `n${nodes.length + 1}`, x: cx + (sw.x - cx) * 2 / 3, y: cy + (sw.y - cy) * 2 / 3 })

  // Diagonal edges: NW(n11)→n22→n23→centre(n21)→n24→n25→SE(n1)
  edges.push({ from: 'n11', to: 'n22' }, { from: 'n22', to: 'n23' }, { from: 'n23', to: 'n21' })
  edges.push({ from: 'n21', to: 'n24' }, { from: 'n24', to: 'n25' }, { from: 'n25', to: 'n1' })
  // NE(n16)→n26→n27→centre(n21)→n28→n29→SW(n6)
  edges.push({ from: 'n16', to: 'n26' }, { from: 'n26', to: 'n27' }, { from: 'n27', to: 'n21' })
  edges.push({ from: 'n21', to: 'n28' }, { from: 'n28', to: 'n29' }, { from: 'n29', to: 'n6' })

  return {
    nodes, edges, width: size, height: size,
    backgrounds: [{ fill: colors.background || '#f5e6c8', rx: 4 }],
    structures: [],
    zones: [],
    edgeStyle: { stroke: lineColor, strokeWidth: 2.5, linecap: 'round' },
    nodeRadius: pointRadius,
    nodeColor: colors.point || '#4a3520',
    nodeScale: { junction: 1.2, centre: 1.4 },
    nodeColorMap: { junction: colors.junction || '#c0622f', centre: colors.centre || '#8b1a1a' },
    labels: [],
    defs: [],
  }
}

function generateAsaltoLayout(boardSize, opts = {}) {
  const size = boardSize || 320
  const pointRadius = opts.pointRadius || 6
  const colors = opts.colors || {}
  const lineColor = colors.line || '#2a2a2a'
  const gridDef = opts.asaltoGrid || {
    rows: [[2,3,4],[2,3,4],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[2,3,4],[2,3,4]],
    fortressRows: 2,
    fortressExtraRow: 2,
    fortressCols: [2, 3, 4],
  }

  const rowDefs = gridDef.rows.map((cols, y) => ({ cols, y }))
  const fortressRowCount = gridDef.fortressRows || 2
  const maxCol = Math.max(...rowDefs.flatMap(r => r.cols))
  const maxRow = rowDefs.length - 1
  const margin = size * 0.08
  const usable = size - margin * 2
  const spacing = usable / Math.max(maxCol, maxRow)
  const xOffset = (size - maxCol * spacing) / 2
  const yOffset = (size - maxRow * spacing) / 2

  const nodes = []
  const edges = []
  const nodeMap = {}
  const fortressIndices = new Set()
  const fortressExtraRow = gridDef.fortressExtraRow
  const fortressCols = gridDef.fortressCols || null

  for (const row of rowDefs) {
    for (const col of row.cols) {
      const idx = nodes.length
      nodeMap[`${row.y},${col}`] = idx
      nodes.push({ id: `n${idx + 1}`, x: xOffset + col * spacing, y: yOffset + row.y * spacing })
      if (row.y < fortressRowCount) fortressIndices.add(idx)
      else if (row.y === fortressExtraRow && fortressCols && fortressCols.includes(col)) fortressIndices.add(idx)
    }
  }

  // Horizontal edges
  for (const row of rowDefs) {
    for (let i = 0; i < row.cols.length - 1; i++) {
      if (row.cols[i + 1] - row.cols[i] === 1) {
        edges.push({ from: nodes[nodeMap[`${row.y},${row.cols[i]}`]].id, to: nodes[nodeMap[`${row.y},${row.cols[i + 1]}`]].id })
      }
    }
  }
  // Vertical edges
  for (let ri = 0; ri < rowDefs.length - 1; ri++) {
    const r1 = rowDefs[ri], r2 = rowDefs[ri + 1]
    for (const col of r1.cols) {
      if (r2.cols.includes(col)) {
        edges.push({ from: nodes[nodeMap[`${r1.y},${col}`]].id, to: nodes[nodeMap[`${r2.y},${col}`]].id })
      }
    }
  }
  // Diagonal edges
  for (let ri = 0; ri < rowDefs.length - 1; ri++) {
    const r1 = rowDefs[ri], r2 = rowDefs[ri + 1]
    for (const col of r1.cols) {
      if (r1.cols.includes(col + 1) && r2.cols.includes(col) && r2.cols.includes(col + 1)) {
        edges.push({ from: nodes[nodeMap[`${r1.y},${col}`]].id, to: nodes[nodeMap[`${r2.y},${col + 1}`]].id })
        edges.push({ from: nodes[nodeMap[`${r1.y},${col + 1}`]].id, to: nodes[nodeMap[`${r2.y},${col}`]].id })
      }
    }
  }
  // Extra nodes (fortress ears)
  if (gridDef.extraNodes) {
    for (const extra of gridDef.extraNodes) {
      const idx = nodes.length
      nodes.push({ id: `n${idx + 1}`, x: xOffset + extra.col * spacing, y: yOffset + extra.row * spacing })
      if (extra.fortress) fortressIndices.add(idx)
      for (const target of extra.connectsTo) {
        const tIdx = nodeMap[`${target[0]},${target[1]}`]
        if (tIdx !== undefined) edges.push({ from: nodes[idx].id, to: nodes[tIdx].id })
      }
    }
  }

  // Fortress zone fills
  const zones = []
  const fNodes = [...fortressIndices].map(i => nodes[i])
  if (fNodes.length > 0) {
    const hasEars = gridDef.extraNodes && gridDef.extraNodes.some(n => n.fortress)
    const bodyNodes = hasEars
      ? fNodes.slice(0, fNodes.length - gridDef.extraNodes.filter(e => e.fortress).length)
      : fNodes
    const bx = Math.min(...bodyNodes.map(n => n.x))
    const by = Math.min(...bodyNodes.map(n => n.y))
    const bw = Math.max(...bodyNodes.map(n => n.x)) - bx
    const bh = Math.max(...bodyNodes.map(n => n.y)) - by
    zones.push({ type: 'rect', attrs: { x: bx, y: by, width: bw, height: bh, fill: colors.fortress || 'rgba(40,80,180,0.15)' } })
    if (hasEars) {
      const extras = gridDef.extraNodes.filter(e => e.fortress)
      const extraStart = nodes.length - gridDef.extraNodes.length
      for (const e of extras) {
        const eIdx = gridDef.extraNodes.indexOf(e)
        const ear = nodes[extraStart + eIdx]
        const targets = e.connectsTo.map(t => nodes[nodeMap[`${t[0]},${t[1]}`]])
        if (targets.length >= 2) {
          zones.push({ type: 'polygon', attrs: { points: `${ear.x},${ear.y} ${targets[0].x},${targets[0].y} ${targets[1].x},${targets[1].y}`, fill: colors.fortress || 'rgba(40,80,180,0.15)' } })
        }
      }
    }
    zones.push({ type: 'rect', attrs: { x: bx, y: by, width: bw, height: bh, fill: 'none', stroke: colors.fortressBorder || '#3355aa', 'stroke-width': 2 } })
  }

  return {
    nodes, edges, width: size, height: size,
    backgrounds: [{ fill: colors.background || '#f5e6c8', rx: 4 }],
    zones,
    structures: [],
    edgeStyle: { stroke: lineColor, strokeWidth: 2, linecap: 'round' },
    nodeRadius: pointRadius,
    nodeColor: colors.point || '#2a2a2a',
    nodeScale: {},
    nodeColorMap: {},
    labels: [],
    defs: [],
  }
}

function generateSternHalmaLayout(holeSpacing, opts = {}) {
  const spacing = holeSpacing || 24
  const colors = opts.colors || {}
  const rowH = spacing * Math.sqrt(3) / 2
  const rim = spacing * 1.2
  const margin = spacing * 2.5
  const innerW = spacing * 16 + margin * 2
  const innerH = Math.round(rowH * 16) + margin * 2 + spacing
  const boardW = innerW + rim * 2
  const boardH = innerH + rim * 2
  const cx = rim + spacing * 8 + margin
  const topY = rim + margin + spacing * 0.5

  const rowWidths = [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1]
  const nodes = []
  const armMap = { N: [], NE: [], SE: [], S: [], SW: [], NW: [] }

  for (let row = 0; row < 17; row++) {
    const w = rowWidths[row]
    const y = topY + row * rowH
    const startX = cx - (w - 1) * spacing / 2
    for (let i = 0; i < w; i++) {
      const x = startX + i * spacing
      const idx = nodes.length
      let arm = 'centre'
      if (row < 4) arm = 'N'
      else if (row >= 13) arm = 'S'
      else if (row >= 4 && row <= 7) {
        const armWidth = 4 - (row - 4)
        if (i < armWidth) arm = 'NW'
        else if (i >= w - armWidth) arm = 'NE'
      } else if (row >= 9 && row <= 12) {
        const armWidth = row - 8
        if (i < armWidth) arm = 'SW'
        else if (i >= w - armWidth) arm = 'SE'
      }
      nodes.push({ id: `h${idx + 1}`, x, y, type: arm !== 'centre' ? `arm-${arm}` : 'centre', arm: arm !== 'centre' ? arm : undefined })
      if (arm !== 'centre') armMap[arm].push(idx)
    }
  }

  // Star geometry for zones
  const s = spacing / 24
  const midY = topY + 8 * rowH
  const polyScale = 1.04
  const hex = [[-50.5, -93], [50.5, -93], [104.3, 0], [50.5, 92.9], [-50.5, 92.9], [-104.3, 0]]
    .map(([dx, dy]) => ({ x: cx + dx * s * polyScale, y: midY + dy * s * polyScale }))
  const tips = [[0, -180.3], [158, -93], [158, 92.9], [0, 180.3], [-158, 92.9], [-158, -93]]
    .map(([dx, dy]) => ({ x: cx + dx * s * polyScale, y: midY + dy * s * polyScale }))

  const armFills = [colors.armN || '#f2e8d4', colors.armNE || '#d4e4f0', colors.armSE || '#e8d8ec', colors.armS || '#f2e8d4', colors.armSW || '#d4e4f0', colors.armNW || '#e8d8ec']
  const zones = []
  zones.push({ type: 'polygon', attrs: { points: hex.map(v => `${v.x},${v.y}`).join(' '), fill: colors.centre || '#e8dcc8' } })
  for (let i = 0; i < 6; i++) {
    zones.push({ type: 'polygon', attrs: { points: `${tips[i].x},${tips[i].y} ${hex[i].x},${hex[i].y} ${hex[(i + 1) % 6].x},${hex[(i + 1) % 6].y}`, fill: armFills[i] } })
  }

  // Star outline as structures
  const structures = []
  const outlineColor = colors.outline || '#6b5a40'
  structures.push({ tag: 'polygon', attrs: { points: `${tips[0].x},${tips[0].y} ${tips[4].x},${tips[4].y} ${tips[2].x},${tips[2].y}`, fill: 'none', stroke: outlineColor, 'stroke-width': 1.5 } })
  structures.push({ tag: 'polygon', attrs: { points: `${tips[3].x},${tips[3].y} ${tips[5].x},${tips[5].y} ${tips[1].x},${tips[1].y}`, fill: 'none', stroke: outlineColor, 'stroke-width': 1.5 } })

  // Labels
  const labelPad = spacing * 1.0
  const labels = [
    { text: 'N', x: cx, y: tips[0].y - labelPad },
    { text: 'S', x: cx, y: tips[3].y + labelPad + 5 },
    { text: 'NE', x: tips[1].x + labelPad, y: tips[1].y + 4 },
    { text: 'NW', x: tips[5].x - labelPad, y: tips[5].y + 4 },
    { text: 'SE', x: tips[2].x + labelPad, y: tips[2].y + 4 },
    { text: 'SW', x: tips[4].x - labelPad, y: tips[4].y + 4 },
  ]

  return {
    nodes, edges: [], width: boardW, height: boardH,
    backgrounds: [
      { fill: colors.boardBody || '#4a3728', rx: 18, filter: 'url(#board-shadow)' },
      { x: 3, y: 3, width: boardW - 6, height: boardH - 6, fill: colors.boardRim || '#5c4636', rx: 15 },
      { x: rim, y: rim, width: innerW, height: innerH, fill: colors.boardFelt || '#2d5c3d', rx: 6 },
    ],
    zones,
    structures,
    edgeStyle: { stroke: 'none', strokeWidth: 0 },
    nodeRadius: 2.5,
    nodeColor: colors.hole || '#3a2c1c',
    nodeScale: {},
    nodeColorMap: {},
    labels,
    defs: [
      { tag: 'filter', attrs: { id: 'board-shadow', x: '-5%', y: '-3%', width: '110%', height: '110%' }, children: [
        { tag: 'feDropShadow', attrs: { dx: 0, dy: 4, stdDeviation: 6, 'flood-color': 'rgba(0,0,0,0.35)' } },
      ]},
    ],
  }
}

// ─── PERIMETER-LOOP LAYOUT BUILDER (Landlords / Monopoly-style boards) ──────

const PERIMETER_THEMES = {
  '1904-patent': {
    board: '#f0e4c8', border: '#5a4a30', innerBg: '#f0e4c8',
    spaceStroke: '#5a4a30', cornerStroke: '#5a4a30',
    text: '#3a2a15', titleText: '#3a2a15',
    lot: '#f0e4c8', necessity: '#f0e4c8', railroad: '#f0e4c8',
    franchise: '#f0e4c8', luxury: '#f0e4c8', legacy: '#f0e4c8',
    'go-to-jail': '#e8d8b8', corner: '#e8d8b8',
  },
  '1906-egc': {
    board: '#f5edd5', border: '#6b2020', innerBg: '#f8f4e8',
    spaceStroke: '#3a3020', cornerStroke: '#3a3020',
    text: '#2a2015', titleText: '#2a2015',
    lot: '#6a9a50', necessity: '#7aaac0', railroad: '#d4889a',
    franchise: '#d4c060', chance: '#cc3030', luxury: '#d4889a',
    special: '#7aaac0', 'go-to-jail': '#d4883a', corner: '#d4c898',
    broker: '#d4c060',
  },
  '1932-prosperity': {
    board: '#f8f4ec', border: '#2a4a7a', innerBg: '#f8f4ec',
    spaceStroke: '#2a4a7a', cornerStroke: '#2a4a7a',
    text: '#1a2a40', titleText: '#6b2020',
    lot: '#ffffff', taxes: '#ffffff', franchise: '#ffffff',
    railroad: '#ffffff', luxury: '#ffffff', broker: '#ffffff',
    jail: '#ffffff', corner: '#ffffff', 'go-to-jail': '#ffffff',
    lotStripe: '#3a8a3a', taxesStripe: '#2a5a9a', franchiseStripe: '#d4a030',
    railroadStripe: '#3a8a3a',
    brokerStripe: '#c8b020', luxuryStripe: '#d4708a',
    jailStripe: '#808080', 'go-to-jailStripe': '#808080',
    cornerArc: '#8c2020',
  },
}

const PERIMETER_CATEGORIES = {
  lot: 'Land In Use', necessity: 'Absolute Necessity', taxes: 'Personal Property',
  railroad: 'Interstate Public Utility', franchise: 'Local Public Utility',
  broker: 'Real Estate', luxury: 'Luxury', jail: 'Jail',
  'go-to-jail': 'No Trespassing', chance: 'Chance', special: 'Speculation',
  legacy: 'Legacy',
}

function wrapText(text, maxChars) {
  if (text.length <= maxChars) return [text]
  const words = text.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      lines.push(current)
      current = word
    } else {
      current = current ? current + ' ' + word : word
    }
  }
  if (current) lines.push(current)
  return lines
}

function buildPerimeterLayout(rows, cols, tileSize, colors, config) {
  const variant = config.variant
  const boardData = config.boardData || null
  const board = boardData ? boardData.boards[variant] : null
  if (!board) return { style: 'perimeter', totalSpaces: 40, colors: {} }

  const theme = config.theme || PERIMETER_THEMES[variant] || {}
  const totalSpaces = board.totalSpaces || 40
  const corners = 4
  const perSide = (totalSpaces - corners) / corners
  const spaceW = 56
  const cornerSize = 80
  const boardW = cornerSize * 2 + perSide * spaceW
  const boardH = boardW

  // Sort spaces into sides
  const spaces = board.spaces
  const sideArrays = { bottom: [], left: [], top: [], right: [] }
  for (const s of spaces) {
    if (s.side !== 'corner' && sideArrays[s.side]) sideArrays[s.side].push(s)
  }

  // Build corner spaces
  const cornerOrder = getCornerOrder(variant, spaces)
  const cornerSpaces = cornerOrder.map((space, ci) => buildCornerSpace(space, ci, cornerSize, theme, variant, board))

  // Build side spaces
  const sideSpaces = {}
  const sideOrder = ['bottom', 'left', 'top', 'right']
  for (const side of sideOrder) {
    const arr = sideArrays[side]
    sideSpaces[side] = arr.map(space => buildSideSpace(space, side, theme, variant, cornerSize, boardW, boardH, arr.length))
  }

  // Build inner content
  const innerContent = buildInnerContent(board, cornerSize, boardW, boardH, theme, variant)

  return {
    style: 'perimeter',
    totalSpaces,
    cornerSize,
    spaceW,
    boardW,
    boardH,
    overflow: variant === '1904-patent',
    spaceStrokeWidth: variant === '1904-patent' ? 1.5 : 0.75,
    colors: {
      board: theme.board, border: theme.border, innerBg: theme.innerBg,
      corner: theme.corner, cornerStroke: theme.cornerStroke,
      spaceStroke: theme.spaceStroke, text: theme.text,
    },
    cornerSpaces,
    sideSpaces,
    innerContent: innerContent.elements,
    innerCells: innerContent.cells,
  }
}

function getCornerOrder(variant, spaces) {
  const corners = spaces.filter(s => s.side === 'corner')
  if (variant === '1932-prosperity') return [corners[1], corners[2], corners[3], corners[0]]
  if (variant === '1906-egc') return [corners[3], corners[0], corners[1], corners[2]]
  return [corners[0], corners[1], corners[2], corners[3]]
}

function buildCornerSpace(space, ci, cornerSize, theme, variant, board) {
  const isGoToJail = space.notes && space.notes.includes('Go to Jail')
  const fill = isGoToJail && theme['go-to-jail'] ? theme['go-to-jail'] : theme.corner
  const id = `pos-${space.pos}`
  const decorations = []
  const texts = []

  if (variant === '1904-patent') {
    const r = cornerSize * 0.72
    decorations.push({ tag: 'circle', attrs: { x: 0, y: 0, cx: cornerSize / 2, cy: cornerSize / 2, r, fill: theme.corner, stroke: theme.cornerStroke, 'stroke-width': 1.5 } })
    const fontSize = space.name.length > 12 ? 6 : space.name.length > 8 ? 7 : 9
    const maxChars = Math.floor((r * 1.2) / (fontSize * 0.55))
    const lines = wrapText(space.name, maxChars)
    const lineH = fontSize + 3
    const blockH = lines.length * lineH
    const startY = cornerSize / 2 - blockH / 2 + lineH / 2 - (space.notes ? 3 : 0)
    for (let i = 0; i < lines.length; i++) {
      texts.push({ dx: 0, dy: startY - cornerSize / 2 + i * lineH, text: lines[i], fontSize, fontWeight: 'bold', fontFamily: 'serif', fill: theme.titleText })
    }
    if (space.notes) {
      const sub = space.notes.length > 22 ? space.notes.slice(0, 21) + '.' : space.notes
      texts.push({ dx: 0, dy: startY - cornerSize / 2 + blockH + 4, text: sub, fontSize: 4.5, fontWeight: 'normal', fontFamily: 'serif', fill: theme.text })
    }
  } else if (variant === '1906-egc' && space.split) {
    return build1906SplitCorner(space, cornerSize, theme, id)
  } else if (variant === '1932-prosperity') {
    build1932CornerDecorations(space, cornerSize, theme, decorations, texts)
  } else {
    const lines = wrapText(space.name, 10)
    const lineH = cornerSize > 70 ? 11 : 9
    for (let i = 0; i < lines.length; i++) {
      texts.push({ dx: 0, dy: -8 + i * lineH - cornerSize / 2 + cornerSize / 2, text: lines[i], fontSize: cornerSize > 70 ? 8 : 7, fontWeight: 'bold', fontFamily: 'sans-serif', fill: theme.titleText })
    }
    let subtext = ''
    if (space.fare) subtext = `Fare $${space.fare}`
    else if (space.notes) subtext = space.notes.length > 24 ? space.notes.slice(0, 23) + '.' : space.notes
    if (subtext) {
      texts.push({ dx: 0, dy: lines.length * lineH / 2 + 8, text: subtext, fontSize: 5.5, fontWeight: 'normal', fontFamily: 'sans-serif', fill: theme.text })
    }
  }

  return { id, fill, decorations, texts }
}

function build1906SplitCorner(space, cornerSize, theme, id) {
  const sp = space.split
  const spColor = theme[sp.type] || theme.corner
  const mainColor = theme.corner
  const isJail = space.name === 'JAIL'
  const s = cornerSize
  const decorations = []
  const texts = []

  if (isJail) {
    decorations.push({ tag: 'polygon', attrs: { x: 0, y: 0, points: `0,0 ${s},0 ${s},${s}`, fill: spColor, 'data-sq': `${id}b`, 'data-type': sp.type } })
    decorations.push({ tag: 'polygon', attrs: { x: 0, y: 0, points: `0,0 0,${s} ${s},${s}`, fill: mainColor, 'data-sq': `${id}a`, 'data-type': 'corner' } })
    decorations.push({ tag: 'line', attrs: { x: 0, y: 0, x1: 0, y1: 0, x2: s, y2: s, stroke: theme.cornerStroke, 'stroke-width': 1 } })
    texts.push({ dx: s * 0.2, dy: s * (-0.2), text: sp.name, fontSize: 5, fontWeight: 'bold', fontFamily: 'serif', fill: theme.text })
    if (sp.tax) texts.push({ dx: s * 0.2, dy: s * (-0.2) + 8, text: `Tax $${sp.tax}`, fontSize: 3.5, fontWeight: 'normal', fontFamily: 'serif', fill: theme.text })
    texts.push({ dx: s * (-0.2), dy: s * 0.2, text: space.name, fontSize: 5, fontWeight: 'bold', fontFamily: 'serif', fill: theme.text })
  } else {
    decorations.push({ tag: 'polygon', attrs: { x: 0, y: 0, points: `0,0 ${s},0 0,${s}`, fill: spColor, 'data-sq': `${id}b`, 'data-type': sp.type } })
    decorations.push({ tag: 'polygon', attrs: { x: 0, y: 0, points: `${s},0 ${s},${s} 0,${s}`, fill: mainColor, 'data-sq': `${id}a`, 'data-type': 'corner' } })
    decorations.push({ tag: 'line', attrs: { x: 0, y: 0, x1: 0, y1: s, x2: s, y2: 0, stroke: theme.cornerStroke, 'stroke-width': 1 } })
    texts.push({ dx: s * (-0.2), dy: s * (-0.2), text: sp.name, fontSize: 5, fontWeight: 'bold', fontFamily: 'serif', fill: theme.text })
    texts.push({ dx: s * 0.2, dy: s * 0.2 - 3, text: space.name, fontSize: 5, fontWeight: 'bold', fontFamily: 'serif', fill: theme.text })
    texts.push({ dx: s * 0.2, dy: s * 0.2 + 5, text: 'Free', fontSize: 3.5, fontWeight: 'normal', fontFamily: 'serif', fill: theme.text })
  }
  decorations.push({ tag: 'rect', attrs: { x: 0, y: 0, width: s, height: s, fill: 'none', stroke: theme.cornerStroke, 'stroke-width': 1.5 } })

  return { id, fill: 'none', decorations, texts }
}

function build1932CornerDecorations(space, cornerSize, theme, decorations, texts) {
  const s = cornerSize
  const cx = s / 2, cy = s / 2
  const r = s * 0.42

  if (space.name === 'WAGES') {
    const arcColors = ['#2a5a9a', '#3a8a3a', '#c8b020', '#8c2020']
    for (let i = 0; i < 4; i++) {
      const a1 = (i * Math.PI / 2) - Math.PI / 2
      const a2 = ((i + 1) * Math.PI / 2) - Math.PI / 2
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2)
      decorations.push({ tag: 'path', attrs: { x: 0, y: 0, d: `M ${x1},${y1} A ${r},${r} 0 0,1 ${x2},${y2}`, fill: 'none', stroke: arcColors[i], 'stroke-width': 4 } })
    }
  } else if (space.fare) {
    decorations.push({ tag: 'path', attrs: { x: 0, y: 0, d: `M ${cx - r},${cy} A ${r},${r} 0 1,1 ${cx + r},${cy} A ${r},${r} 0 1,1 ${cx - r},${cy}`, fill: 'none', stroke: theme.cornerArc, 'stroke-width': 3.5 } })
  } else if (space.name === 'JAIL') {
    const bw = s * 0.85
    decorations.push({ tag: 'rect', attrs: { x: cx - bw / 2, y: cy - bw / 2, width: bw, height: bw, fill: 'none', stroke: '#4a4a4a', 'stroke-width': 2 } })
    const bars = 4, gap = bw / (bars + 1)
    for (let i = 1; i <= bars; i++) {
      decorations.push({ tag: 'line', attrs: { x: 0, y: 0, x1: cx - bw / 2 + i * gap, y1: cy - bw / 2 + 2, x2: cx - bw / 2 + i * gap, y2: cy + bw / 2 - 2, stroke: '#3a3a3a', 'stroke-width': 1.5 } })
    }
  }

  const lines = wrapText(space.name, 10)
  const lineH = s > 70 ? 11 : 9
  for (let i = 0; i < lines.length; i++) {
    texts.push({ dx: 0, dy: -8 + i * lineH, text: lines[i], fontSize: s > 70 ? 8 : 7, fontWeight: 'bold', fontFamily: 'sans-serif', fill: theme.titleText })
  }
  let subtext = ''
  if (space.fare) subtext = `Fare $${space.fare}`
  else if (space.notes) subtext = space.notes.length > 24 ? space.notes.slice(0, 23) + '.' : space.notes
  if (subtext) {
    texts.push({ dx: 0, dy: lines.length * lineH / 2 + 8, text: subtext, fontSize: 5.5, fontWeight: 'normal', fontFamily: 'sans-serif', fill: theme.text })
  }
}

function buildSideSpace(space, side, theme, variant, cornerSize, boardW, boardH, count) {
  const typeFill = theme[space.type] || '#f0f0f0'
  const id = `pos-${space.pos}`
  const decorations = []
  const texts = []

  // Compute rect dimensions for text sizing
  const spanW = boardW - cornerSize * 2
  const spanH = boardH - cornerSize * 2
  const cellW = spanW / count
  const cellH = spanH / count
  const isVertical = side === 'left' || side === 'right'
  const textW = isVertical ? cornerSize : cellW
  const textH = isVertical ? cellH : cornerSize
  const narrow = textW < textH

  // Stripes for 1932
  if (variant === '1932-prosperity') {
    const stripeKey = space.type + 'Stripe'
    const stripeColor = theme[stripeKey]
    if (stripeColor) {
      const bandRatio = 0.22
      const bh = textH * bandRatio
      // Top band
      decorations.push({ tag: 'rect', attrs: { x: 0.5, y: 0.5, width: textW - 1, height: bh, fill: stripeColor, opacity: 0.35 } })
      decorations.push({ tag: 'line', attrs: { x1: 0.5, y1: bh, x2: textW - 0.5, y2: bh, stroke: stripeColor, 'stroke-width': 1.2 } })
      // Bottom band
      decorations.push({ tag: 'rect', attrs: { x: 0.5, y: textH - bh - 0.5, width: textW - 1, height: bh, fill: stripeColor, opacity: 0.35 } })
      decorations.push({ tag: 'line', attrs: { x1: 0.5, y1: textH - bh, x2: textW - 0.5, y2: textH - bh, stroke: stripeColor, 'stroke-width': 1.2 } })
    }
  }

  // Text content
  if (variant === '1932-prosperity') {
    const category = PERIMETER_CATEGORIES[space.type] || ''
    const fontSize = narrow ? 5 : 6
    const catSize = narrow ? 3.2 : 3.8
    const detSize = narrow ? 3.5 : 4
    const maxChars = Math.floor(textW / (narrow ? 3.6 : 4.2))
    let name = space.name
    if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'
    texts.push({ dx: textW * 0.44, dy: -textH * 0.38, text: String(space.pos), fontSize: 3, fontWeight: 'normal', fontFamily: 'sans-serif', fill: theme.text, attrs: { opacity: 0.6, 'text-anchor': 'end' } })
    if (category) texts.push({ dx: 0, dy: -textH * 0.39, text: category, fontSize: catSize, fontWeight: 'normal', fontFamily: 'sans-serif', fill: theme.text })
    texts.push({ dx: 0, dy: category ? 2 : 0, text: name, fontSize, fontWeight: 'bold', fontFamily: 'sans-serif', fill: theme.text })
    let detail = ''
    if (space.rent) detail = `Land Rent $${space.rent}`
    else if (space.tax) detail = `$${space.tax}`
    else if (space.fare) detail = `Fare $${space.fare}`
    else if (space.price && space.type === 'franchise') detail = `$${space.price}`
    if (detail) texts.push({ dx: 0, dy: textH * 0.39, text: detail, fontSize: detSize, fontWeight: 'normal', fontFamily: 'sans-serif', fill: theme.text })
  } else if (variant === '1906-egc') {
    const fontSize = narrow ? 4.5 : 6
    const detSize = narrow ? 3.5 : 4.5
    const maxChars = Math.floor(textW / (narrow ? 3.4 : 4.2))
    let name = space.name
    if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'
    const textColor = space.type === 'chance' ? '#fff' : theme.text
    texts.push({ dx: 0, dy: narrow ? -2 : -4, text: name, fontSize, fontWeight: 'bold', fontFamily: 'serif', fill: textColor })
    let detail = ''
    if (space.price && space.rent) detail = `$${space.price} / Rent $${space.rent}`
    else if (space.price) detail = `$${space.price}`
    else if (space.rent) detail = `Rent $${space.rent}`
    else if (space.tax) detail = `Tax $${space.tax}`
    else if (space.fare) detail = `Fare $${space.fare}`
    else if (space.fee) detail = `Fee $${space.fee}`
    if (detail) texts.push({ dx: 0, dy: narrow ? 6 : 8, text: detail, fontSize: detSize, fontWeight: 'normal', fontFamily: 'serif', fill: textColor })
  } else {
    const fontSize = narrow ? 4.5 : 6
    const detSize = narrow ? 3.5 : 4.5
    const maxChars = Math.floor(textW / (narrow ? 3.4 : 4.5))
    let name = space.name
    if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'
    texts.push({ dx: 0, dy: narrow ? -4 : -6, text: name, fontSize, fontWeight: 'bold', fontFamily: 'serif', fill: theme.text })
    const lines = []
    if (space.rent) lines.push(`Rent $${space.rent}`)
    if (space.price) lines.push(`Sale $${space.price}`)
    if (space.tax) lines.push(`Tax $${space.tax}`)
    if (space.fare) lines.push(`Fare $${space.fare}`)
    if (space.fee) lines.push(`Fee $${space.fee}`)
    if (space.receive) lines.push(`+$${space.receive}`)
    const lineH = narrow ? 6 : 8
    for (let i = 0; i < lines.length; i++) {
      texts.push({ dx: 0, dy: (narrow ? 3 : 4) + i * lineH, text: lines[i], fontSize: detSize, fontWeight: 'normal', fontFamily: 'serif', fill: theme.text })
    }
  }

  return { id, fill: typeFill, type: space.type, decorations: decorations.length ? decorations : undefined, texts: texts.length ? texts : undefined }
}

function buildInnerContent(board, cornerSize, boardW, boardH, theme, variant) {
  const elements = []
  const cells = []
  const innerX = cornerSize, innerY = cornerSize
  const innerW = boardW - cornerSize * 2, innerH = boardH - cornerSize * 2
  const cx = boardW / 2, cy = boardH / 2

  if (variant === '1932-prosperity') {
    build1932Inner(elements, cells, innerX, innerY, innerW, innerH, cx, cy, theme)
  } else if (variant === '1906-egc') {
    build1906Inner(elements, cells, board, innerX, innerY, innerW, innerH, cx, cy, theme)
  } else {
    build1904Inner(elements, cells, innerX, innerY, innerW, innerH, cx, cy, theme)
  }

  return { elements, cells }
}

function build1932Inner(elements, cells, innerX, innerY, innerW, innerH, cx, cy, theme) {
  const r = innerW * 0.32
  const b = r / Math.SQRT2
  const c = r * (1 - 1 / Math.SQRT2)
  const pts = [
    [0, -r], [c, -b], [b, -b], [b, -c],
    [r, 0], [b, c], [b, b], [c, b],
    [0, r], [-c, b], [-b, b], [-b, c],
    [-r, 0], [-b, -c], [-b, -b], [-c, -b]
  ].map(([px, py]) => `${cx + px},${cy + py}`).join(' ')
  elements.push({ tag: 'polygon', attrs: { points: pts, fill: 'none', stroke: theme.titleText, 'stroke-width': 2.5 } })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy - 16, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, text: 'THE' })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 2, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, text: "LANDLORD'S GAME" })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 16, 'text-anchor': 'middle', 'font-size': 8, 'font-family': 'serif', fill: theme.titleText }, text: 'AND PROSPERITY' })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 36, 'text-anchor': 'middle', 'font-size': 5.5, 'font-family': 'serif', fill: theme.text }, text: 'A Magie Game — Patent No. 1,509,312' })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 46, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, text: 'Adgame Company (Inc.), Washington, D.C.' })

  const labelOff = 14
  elements.push({ tag: 'text', attrs: { x: cx, y: innerY + labelOff, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'sans-serif', fill: '#c8b020' }, text: 'Your Checker Yellow' })
  elements.push({ tag: 'text', attrs: { x: cx, y: innerY + innerH - labelOff + 4, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'sans-serif', fill: '#2a5a9a' }, text: 'Your Checker Blue' })
  elements.push({ tag: 'text', attrs: { x: innerX + labelOff, y: cy, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'sans-serif', fill: '#3a8a3a', transform: `rotate(-90,${innerX + labelOff},${cy})` }, text: 'Your Checker Green' })
  elements.push({ tag: 'text', attrs: { x: innerX + innerW - labelOff, y: cy, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'sans-serif', fill: '#8c2020', transform: `rotate(90,${innerX + innerW - labelOff},${cy})` }, text: 'Your Checker Red' })

  const starEdge = r / Math.SQRT2
  const checkerZone = labelOff + 6
  const leftEdge = innerX + checkerZone
  const rightEdge = innerX + innerW - checkerZone
  const starLeft = cx - starEdge
  const starRight = cx + starEdge

  const leftMid = (leftEdge + starLeft) / 2
  const rightMid = (rightEdge + starRight) / 2

  elements.push({ tag: 'text', attrs: { x: leftMid, y: cy, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, transform: `rotate(-90,${leftMid},${cy})` }, text: 'General Land Office' })
  elements.push({ tag: 'text', attrs: { x: rightMid, y: cy, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, transform: `rotate(90,${rightMid},${cy})` }, text: 'Public Treasury' })

  const boxW = innerW * 0.14, boxH = innerH * 0.08
  const textHalfLen = 32, arrowGap = 4
  const starTop = cy - starEdge, starBot = cy + starEdge
  const leftBoxTopY = (innerY + starTop) / 2
  const leftBoxBotY = (innerY + innerH + starBot) / 2

  // Left arrows + boxes
  const leftArrowTopStart = cy - textHalfLen - arrowGap
  const leftArrowBotStart = cy + textHalfLen + arrowGap
  elements.push({ tag: 'line', attrs: { x1: leftMid, y1: leftArrowTopStart, x2: leftMid, y2: leftBoxTopY + boxH / 2 + 2, stroke: theme.text, 'stroke-width': 0.8 } })
  elements.push({ tag: 'path', attrs: { d: `M ${leftMid - 2},${leftBoxTopY + boxH / 2 + 5} L ${leftMid},${leftBoxTopY + boxH / 2 + 2} L ${leftMid + 2},${leftBoxTopY + boxH / 2 + 5}`, fill: 'none', stroke: theme.text, 'stroke-width': 0.8 } })
  elements.push({ tag: 'rect', attrs: { x: leftMid - boxW / 2, y: leftBoxTopY - boxH / 2, width: boxW, height: boxH, fill: '#f8f4ec', stroke: theme.spaceStroke, 'stroke-width': 0.75, rx: 1, class: 'board-cell', 'data-sq': 'inner-1', 'data-type': 'land-in-use' } })
  elements.push({ tag: 'text', attrs: { x: leftMid, y: leftBoxTopY - 2, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, text: 'For Sale' })
  elements.push({ tag: 'text', attrs: { x: leftMid, y: leftBoxTopY + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, text: 'Land in Use' })
  cells.push({ id: 'inner-1', x: leftMid, y: leftBoxTopY })

  elements.push({ tag: 'line', attrs: { x1: leftMid, y1: leftArrowBotStart, x2: leftMid, y2: leftBoxBotY - boxH / 2 - 2, stroke: theme.text, 'stroke-width': 0.8 } })
  elements.push({ tag: 'path', attrs: { d: `M ${leftMid - 2},${leftBoxBotY - boxH / 2 - 5} L ${leftMid},${leftBoxBotY - boxH / 2 - 2} L ${leftMid + 2},${leftBoxBotY - boxH / 2 - 5}`, fill: 'none', stroke: theme.text, 'stroke-width': 0.8 } })
  elements.push({ tag: 'rect', attrs: { x: leftMid - boxW / 2, y: leftBoxBotY - boxH / 2, width: boxW, height: boxH, fill: '#f8f4ec', stroke: theme.spaceStroke, 'stroke-width': 0.75, rx: 1, class: 'board-cell', 'data-sq': 'inner-2', 'data-type': 'idle-land' } })
  elements.push({ tag: 'text', attrs: { x: leftMid, y: leftBoxBotY - 2, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, text: 'For Sale' })
  elements.push({ tag: 'text', attrs: { x: leftMid, y: leftBoxBotY + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, text: 'Idle Land' })
  cells.push({ id: 'inner-2', x: leftMid, y: leftBoxBotY })

  // Right arrows + boxes
  const rightBoxTopY = leftBoxTopY, rightBoxBotY = leftBoxBotY
  const rightArrowTopStart = cy - textHalfLen - arrowGap
  const rightArrowBotStart = cy + textHalfLen + arrowGap
  elements.push({ tag: 'line', attrs: { x1: rightMid, y1: rightArrowTopStart, x2: rightMid, y2: rightBoxTopY + boxH / 2 + 2, stroke: theme.text, 'stroke-width': 0.8 } })
  elements.push({ tag: 'path', attrs: { d: `M ${rightMid - 2},${rightBoxTopY + boxH / 2 + 5} L ${rightMid},${rightBoxTopY + boxH / 2 + 2} L ${rightMid + 2},${rightBoxTopY + boxH / 2 + 5}`, fill: 'none', stroke: theme.text, 'stroke-width': 0.8 } })
  elements.push({ tag: 'rect', attrs: { x: rightMid - boxW / 2, y: rightBoxTopY - boxH / 2, width: boxW, height: boxH, fill: '#f8f4ec', stroke: theme.spaceStroke, 'stroke-width': 0.75, rx: 1, class: 'board-cell', 'data-sq': 'inner-3', 'data-type': 'general-fund' } })
  elements.push({ tag: 'text', attrs: { x: rightMid, y: rightBoxTopY - 2, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, text: 'General Fund' })
  cells.push({ id: 'inner-3', x: rightMid, y: rightBoxTopY })

  elements.push({ tag: 'line', attrs: { x1: rightMid, y1: rightArrowBotStart, x2: rightMid, y2: rightBoxBotY - boxH / 2 - 2, stroke: theme.text, 'stroke-width': 0.8 } })
  elements.push({ tag: 'path', attrs: { d: `M ${rightMid - 2},${rightBoxBotY - boxH / 2 - 5} L ${rightMid},${rightBoxBotY - boxH / 2 - 2} L ${rightMid + 2},${rightBoxBotY - boxH / 2 - 5}`, fill: 'none', stroke: theme.text, 'stroke-width': 0.8 } })
  elements.push({ tag: 'rect', attrs: { x: rightMid - boxW / 2, y: rightBoxBotY - boxH / 2, width: boxW, height: boxH, fill: '#f8f4ec', stroke: theme.spaceStroke, 'stroke-width': 0.75, rx: 1, class: 'board-cell', 'data-sq': 'inner-4', 'data-type': 'rent-fund' } })
  elements.push({ tag: 'text', attrs: { x: rightMid, y: rightBoxBotY - 2, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, text: 'Prosperity Land' })
  elements.push({ tag: 'text', attrs: { x: rightMid, y: rightBoxBotY + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, text: 'Rent Fund' })
  cells.push({ id: 'inner-4', x: rightMid, y: rightBoxBotY })
}

function build1904Inner(elements, cells, innerX, innerY, innerW, innerH, cx, cy, theme) {
  const pad = 14, gap = 8
  const qw = (innerW - pad * 2 - gap) / 2
  const qh = (innerH - pad * 2 - gap) / 2
  const x0 = innerX + pad, x1 = innerX + pad + qw + gap
  const y0 = innerY + pad, y1 = innerY + pad + qh + gap

  const quads = [
    { x: x0, y: y0, label: 'R.R.', sub: '$5', sq: 'inner-1' },
    { x: x1, y: y0, label: 'WAGES', sub: null, sq: 'inner-2' },
    { x: x0, y: y1, label: 'BANK', sub: null, sq: 'inner-3' },
    { x: x1, y: y1, label: 'PUBLIC TREASURY', sub: null, sq: 'inner-4' },
  ]

  for (const q of quads) {
    elements.push({ tag: 'rect', attrs: { x: q.x, y: q.y, width: qw, height: qh, fill: theme.innerBg, stroke: theme.spaceStroke, 'stroke-width': 1.5, class: 'board-cell', 'data-sq': q.sq, 'data-type': q.label.toLowerCase() } })
    const qcx = q.x + qw / 2, qcy = q.y + qh / 2
    if (q.label === 'PUBLIC TREASURY') {
      elements.push({ tag: 'text', attrs: { x: qcx, y: qcy - 4, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, text: 'PUBLIC' })
      elements.push({ tag: 'text', attrs: { x: qcx, y: qcy + 10, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, text: 'TREASURY' })
    } else {
      elements.push({ tag: 'text', attrs: { x: qcx, y: qcy + (q.sub ? -2 : 4), 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, text: q.label })
      if (q.sub) elements.push({ tag: 'text', attrs: { x: qcx, y: qcy + 10, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, text: q.sub })
    }
    cells.push({ id: q.sq, x: qcx, y: qcy })
  }

  elements.push({ tag: 'text', attrs: { x: cx, y: innerY + innerH - 3, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, text: 'L.J. Magie, Patent No. 748,626' })
}

function build1906Inner(elements, cells, board, innerX, innerY, innerW, innerH, cx, cy, theme) {
  elements.push({ tag: 'text', attrs: { x: cx, y: cy - 20, 'text-anchor': 'middle', 'font-size': 7, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text }, text: 'MISCELLANEOUS' })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 6, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, text: 'PUBLIC TREASURY' })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 20, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, text: 'MONEY DENOMINATIONS' })

  const coinY = cy + 34
  const coins = ['$1', '$5', '$10', '$50', '$100']
  const coinColors = ['#f8f4e8', '#cc3030', '#8a9a8a', '#d4c040', '#6a9a50']
  const coinR = 7, coinGap = 20
  const coinStartX = cx - (coins.length - 1) * coinGap / 2
  for (let i = 0; i < coins.length; i++) {
    const coinX = coinStartX + i * coinGap
    const textColor = i === 0 ? theme.text : '#fff'
    elements.push({ tag: 'circle', attrs: { cx: coinX, cy: coinY, r: coinR, fill: coinColors[i], stroke: theme.spaceStroke, 'stroke-width': 0.75 } })
    elements.push({ tag: 'text', attrs: { x: coinX, y: coinY + 2, 'text-anchor': 'middle', 'font-size': 4, 'font-weight': 'bold', 'font-family': 'serif', fill: textColor }, text: coins[i] })
  }

  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 58, 'text-anchor': 'middle', 'font-size': 6, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text }, text: "The Landlord's Game" })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 69, 'text-anchor': 'middle', 'font-size': 4.5, 'font-family': 'serif', fill: theme.text }, text: 'Patented Jan. 5, 1904, No. 748626 by Lizzie J. Magie' })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 79, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, text: 'Economic Game Co., New York' })

  if (board.naturalOpportunities) {
    build1906NaturalOpportunities(elements, cells, board, innerX, innerY, innerW, innerH, theme)
  }
}

function build1906NaturalOpportunities(elements, cells, board, innerX, innerY, innerW, innerH, theme) {
  const natOps = board.naturalOpportunities
  const cellW = innerW / 9, cellH = innerH / 9
  const armLen = cellW * 2, armLenV = cellH * 2
  const thick = cellW, thickV = cellH
  const fill = '#d4c060', stroke = '#3a3020'

  const lShapes = [
    { pts: `${innerX + innerW - armLen},${innerY + innerH} ${innerX + innerW - armLen},${innerY + innerH - thickV} ${innerX + innerW - thick},${innerY + innerH - thickV} ${innerX + innerW - thick},${innerY + innerH - armLenV} ${innerX + innerW},${innerY + innerH - armLenV} ${innerX + innerW},${innerY + innerH}`,
      tx: innerX + innerW - armLen / 2, ty: innerY + innerH - thickV / 2,
      tx2: innerX + innerW - thick / 2, ty2: innerY + innerH - armLenV / 2 - thickV / 2 + thick / 2 },
    { pts: `${innerX},${innerY + innerH} ${innerX},${innerY + innerH - armLenV} ${innerX + thick},${innerY + innerH - armLenV} ${innerX + thick},${innerY + innerH - thickV} ${innerX + armLen},${innerY + innerH - thickV} ${innerX + armLen},${innerY + innerH}`,
      tx: innerX + armLen / 2, ty: innerY + innerH - thickV / 2,
      tx2: innerX + thick / 2, ty2: innerY + innerH - armLenV / 2 - thickV / 2 + thick / 2 },
    { pts: `${innerX},${innerY} ${innerX + armLen},${innerY} ${innerX + armLen},${innerY + thickV} ${innerX + thick},${innerY + thickV} ${innerX + thick},${innerY + armLenV} ${innerX},${innerY + armLenV}`,
      tx: innerX + armLen / 2, ty: innerY + thickV / 2,
      tx2: innerX + thick / 2, ty2: innerY + thickV + (armLenV - thickV) / 2 },
    { pts: `${innerX + innerW - armLen},${innerY} ${innerX + innerW},${innerY} ${innerX + innerW},${innerY + armLenV} ${innerX + innerW - thick},${innerY + armLenV} ${innerX + innerW - thick},${innerY + thickV} ${innerX + innerW - armLen},${innerY + thickV}`,
      tx: innerX + innerW - armLen / 2, ty: innerY + thickV / 2,
      tx2: innerX + innerW - thick / 2, ty2: innerY + thickV + (armLenV - thickV) / 2 },
  ]

  for (let i = 0; i < natOps.length; i++) {
    const no = natOps[i]
    const L = lShapes[i]
    elements.push({ tag: 'polygon', attrs: { points: L.pts, fill, stroke, 'stroke-width': 1.2, class: 'board-cell', 'data-sq': `inner-${i + 1}`, 'data-type': 'natural-opportunity' } })
    elements.push({ tag: 'text', attrs: { x: L.tx, y: L.ty - 4, 'text-anchor': 'middle', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text }, text: 'Natural Opportunity' })
    elements.push({ tag: 'text', attrs: { x: L.tx, y: L.ty + 3, 'text-anchor': 'middle', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text }, text: 'to Labor' })
    elements.push({ tag: 'text', attrs: { x: L.tx2, y: L.ty2 - 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text }, text: no.name })
    elements.push({ tag: 'text', attrs: { x: L.tx2, y: L.ty2 + 3, 'text-anchor': 'middle', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text }, text: `Wages $${no.wages}` })
    elements.push({ tag: 'text', attrs: { x: L.tx2, y: L.ty2 + 10, 'text-anchor': 'middle', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text }, text: `Rent $${no.rent}` })
    cells.push({ id: `inner-${i + 1}`, x: L.tx2, y: L.ty2 })
  }

  // Connector patches between L-shapes and track spaces
  const patchW = 1.5
  const cellFill = theme.lot
  const brCx = innerX + innerW - cellW / 2
  elements.push({ tag: 'rect', attrs: { x: brCx - cellW / 2, y: innerY + innerH - patchW, width: cellW, height: patchW, fill } })
  elements.push({ tag: 'rect', attrs: { x: brCx - cellW / 2, y: innerY + innerH, width: cellW, height: patchW, fill: cellFill } })
  const blCy = innerY + innerH - cellH / 2
  elements.push({ tag: 'rect', attrs: { x: innerX - patchW, y: blCy - cellH / 2, width: patchW, height: cellH, fill: cellFill } })
  elements.push({ tag: 'rect', attrs: { x: innerX, y: blCy - cellH / 2, width: patchW, height: cellH, fill } })
  const tlCx = innerX + cellW / 2
  elements.push({ tag: 'rect', attrs: { x: tlCx - cellW / 2, y: innerY, width: cellW, height: patchW, fill } })
  elements.push({ tag: 'rect', attrs: { x: tlCx - cellW / 2, y: innerY - patchW, width: cellW, height: patchW, fill: cellFill } })
  const trCy = innerY + cellH / 2
  elements.push({ tag: 'rect', attrs: { x: innerX + innerW - patchW, y: trCy - cellH / 2, width: patchW, height: cellH, fill } })
  elements.push({ tag: 'rect', attrs: { x: innerX + innerW, y: trCy - cellH / 2, width: patchW, height: cellH, fill: cellFill } })
}

// ─── GAME DEFINITIONS ───────────────────────────────────────────────────────
// Each variant specifies: boardStyle, dimensions, pieceSet, fen/position

export const GAMES = {
  'moddable-chess': {
    label: 'Chess',
    pieceSet: 'mce-fairy-complete',
    buildLayout: buildCheckeredLayout,
    variants: {
      standard: { label: 'Standard', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Standard FIDE rules.'},
      absorption: { label: 'Absorption', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Capturing piece permanently gains the victim\'s movement abilities.'},
      alice: { label: 'Alice Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 34, layers: { count: 2, layout: 'horizontal', labels: ['Board A', 'Board B'], fens: ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', '8/8/8/8/8/8/8/8'] }, variantDesc: 'Two 8x8 boards. After every move, the piece transfers to the other board.'},
      'almost-chess': { label: 'Almost Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBCKBNR', variantDesc: 'White Queen replaced by a Chancellor (Rook + Knight compound).'},
      'amazon-chess': { label: 'Amazon Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbmkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBMKBNR', variantDesc: 'Queens replaced by Amazons (Queen + Knight). The most powerful piece possible.'},
      andernach: { label: 'Andernach', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Capturing piece changes colour (becomes opponent\'s). Kings exempt.'},
      antichess: { label: 'Antichess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Captures are mandatory. First to lose all pieces wins.'},
      'anti-king-chess-2': { label: 'Anti-King Chess II', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/3A4/8/8/3a4/PPPPPPPP/RNBQKBNR', variantDesc: 'Each side adds an Anti-King (in check when NOT attacked). Win by mating either royal piece. Peter Aronson, 2002.'},
      archchess: { label: 'Archchess', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 30, fen: 'rnbckqdbNR/pppppppppp/10/10/10/10/10/10/PPPPPPPPPP/RNBDQKCBNR', variantDesc: '10x10 with Centurion (Dabbaba+Alfil+Knight) and Decurion (1 diagonal). Flexible castling. Piacenza, 1683.'},
      asean: { label: 'ASEAN Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Standardized Southeast Asian chess. Makruk-family: Bishop moves 1 diagonally, Pawns promote on rank 6 to Ferz.'},
      atomic: { label: 'Atomic', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Captures cause explosions destroying all pieces on adjacent squares.'},
      avalanche: { label: 'Avalanche Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Two-part turn: make a move, then push one opponent pawn forward. Push is obligatory.'},
      benedict: { label: 'Benedict', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'No captures. Attacked enemies convert to your colour instead.'},
      'berolina-chess': { label: 'Berolina', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Pawns move diagonally forward and capture straight forward.'},
      berserk: { label: 'Berserk', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Delivering check grants one bonus move with a different piece.'},
      'balbos-chess': { label: "Balbo's Chess", boardStyle: 'checkered', rows: 10, cols: 11, tileSize: 28, cellMap: BALBO_MAP, colors: { voidFill: 'transparent' }, fen: '4kbq4/3rnbnr3/2ppppppp2/11/11/11/11/2PPPPPPP2/3RNBNR3/4KBQ4', variantDesc: 'Diamond-shaped 70-square board (widths 3-5-7-9-11-11-9-7-5-3). Position-dependent promotion. Third-move mate available. M.G. Balbo, 1974.'},
      'blind-chess': { label: 'Banqi', boardStyle: 'checkered', rows: 8, cols: 4, tileSize: 40, fen: '????/????/????/????/????/????/????/????', variantDesc: 'Chinese hidden-piece game (Banqi). 4x8 (half Xiangqi board). 32 pieces face-down. Flip, move, or capture each turn. Rank hierarchy.'},
      'birds-chess': { label: "Bird's Chess", boardStyle: 'checkered', rows: 8, cols: 10, tileSize: 36, fen: 'rnbgqkebnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNBGQKEBNR', variantDesc: '10x8 with Guard (Rook+Knight) and Equerry (Bishop+Knight). King castles 3 squares. H. E. Bird, 1874.'},
      breakthrough: { label: 'Breakthrough', boardStyle: 'checkered', rows: 7, cols: 7, tileSize: 40, fen: 'ppppppp/ppppppp/7/7/7/PPPPPPP/PPPPPPP', variantDesc: 'Pawns only. First to reach the far side wins.'},
      brusky: { label: 'Brusky (Hex)', boardStyle: 'hex', hexGrid: BRUSKY_GRID, hexSize: 20, flat: false, hexColorFn: glinskiColor, hexPosition: BRUSKY_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }, buildLayout(rows, cols, tileSize, colors) { return buildHexagonalLayout(BRUSKY_GRID, 20, 'pointy', colors, { hexColorFn: glinskiColor }) }, variantDesc: 'Irregular 84-hex board. 10 pawns per side. Unmoved pawns may capture straight forward. Blockage rule. Yakov Brusky, 1966.'},
      capablanca: { label: 'Capablanca', boardStyle: 'checkered', rows: 8, cols: 10, tileSize: 36, fen: 'rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR', variantDesc: 'Two extra pieces: Archbishop (B+N) and Chancellor (R+N) on 10x8 board.'},
      carrera: { label: "Carrera's Chess", boardStyle: 'checkered', rows: 8, cols: 10, tileSize: 36, fen: 'rAnbqkbnCr/pppppppppp/10/10/10/10/PPPPPPPPPP/RANBQKBNCR', variantDesc: '10x8 with Champion (Rook+Knight) and Centaur (Bishop+Knight). No castling, no en passant. Pietro Carrera, 1617.'},
      'centennial-chess': { label: 'Centennial Chess', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 30, fen: 'rcnbsqksbcr/pppppppppp/10/10/10/10/10/10/PPPPPPPPPP/RCNBSQKSBCR', variantDesc: '10x10 with Steward, Camel, Murray Lion, Rotating Spearman. Two moves per turn until first capture. J. W. Brown, 1999.'},
      'chancellor-chess': { label: 'Chancellor Chess', boardStyle: 'checkered', rows: 9, cols: 9, tileSize: 36, fen: 'rnbqkcbnr/ppppppppp/9/9/9/9/9/PPPPPPPPP/RNBQKCBNR', variantDesc: '9x9 with Chancellor (Rook+Knight). Black squares in corners. Ben Foster, 1889.'},
      chak: { label: 'Chak', boardStyle: 'checkered', rows: 9, cols: 9, tileSize: 38, fen: 'sjvdaxdvs/9/1ppppppp1/9/9/9/1PPPPPPP1/9/SJVDAXDVS', variantDesc: 'Mesoamerican 9x9 chess. Win by mating Ajaw or landing promoted Ajaw on opponent temple. Pieces promote crossing the river. Corey Clark, 2020.'},
      chaturanga: { label: 'Chaturanga', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnefkenr/pppppppp/8/8/8/8/PPPPPPPP/RNEFKENR', variantDesc: 'Ancient Indian ancestor of chess, c. 600 CE. Weak counsellor and leaping elephant.'},
      checkless: { label: 'Checkless', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Cannot give check unless it is checkmate.'},
      chennis: { label: 'Chennis', boardStyle: 'checkered', rows: 7, cols: 7, tileSize: 40, fen: 'rnbkqbn/ppppppp/7/7/7/PPPPPPP/RNBKQBN', variantDesc: 'Tennis-themed 7x7 chess. Win by advancing a Pawn to the far rank. Net across rank 4 blocks most pieces. Corey Clark.'},
      chigorin: { label: 'Chigorin', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNNQKNNR', variantDesc: 'White\'s Bishops replaced by Knights. Four Knights vs standard army.'},
      'citadel-chess': { label: 'Citadel Chess', boardStyle: 'checkered', rows: 12, cols: 12, tileSize: 26, cellMap: OMEGA_MAP, colors: { voidFill: 'transparent' }, fen: '12/1dnbwqkwbnd1/1pppppppppp1/12/12/12/12/12/12/1PPPPPPPPPP1/1DNBWQKWBND1/12', variantDesc: 'Shatranj al-Husun. 10x10 + 4 corner citadels. King reaching enemy citadel draws. 2 Dabbabas + 12 Pawns per side. Historical.'},
      'hole-chess': { label: 'Hole Chess', boardStyle: 'checkered', rows: 10, cols: 7, tileSize: 36, cellMap: HOLE_CHESS_MAP, colors: { voidFill: 'transparent', hole: '#1a1a1a', holeStroke: '#333' }, fen: '3k3/2rqb2/1ppppp1/7/7/7/7/1PPPPP1/2RQB2/3K3', variantDesc: '44-square diamond board with 2 holes at D4/D7. Pieces can be sucked into holes via Two-Action Rule. Gary K. Gifford, 2003.'},
      codrus: { label: 'Codrus', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'No check exists. Win by getting your own King captured.'},
      congo: { label: 'Congo', boardStyle: 'checkered', rows: 7, cols: 7, tileSize: 40, fen: 'gmelemz/ppppppp/7/7/7/PPPPPPP/GMELEMZ', variantDesc: '7x7 with Lion, Zebra, Giraffe, Elephant, Crocodile, Monkey. River rank, drowning rule. Capture Lion wins. Demian Freeling, 1982.'},
      courier: { label: 'Courier Chess', boardStyle: 'checkered', rows: 8, cols: 12, tileSize: 32, fen: 'rnebfsksbenr/pppppppppppp/12/12/12/12/PPPPPPPPPPPP/RNEBFSKSBENR', variantDesc: 'Medieval German variant (1200s). Extra bishops and sage pieces on 12x8 board.'},
      crazyhouse: { label: 'Crazyhouse', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Captured pieces switch sides and can be dropped back onto the board.'},
      'crazy-38s': { label: "Crazy 38's", boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: '38-square board with loop connection. Shogi-style drops. King, Rook, Bishop, Knight, Silver, Gold, 4 Pawns. Dual win: checkmate or reach Home Square. Ben Good, 1998.'},
      'cylinder-chess': { label: 'Cylinder Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Files wrap. The a-file connects to the h-file.'},
      'dark-chess': { label: 'Dark Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Total fog. Only see squares occupied by your own pieces.'},
      'de-vasa': { label: 'De Vasa (Hex)', boardStyle: 'hex', hexRows: 9, hexCols: 9, hexSize: 20, flat: false, hexColorFn: glinskiColor, hexPosition: DE_VASA_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }, buildLayout(rows, cols, tileSize, colors) { return buildHexagonalLayout(generateHexRhombus(9, 9), 20, 'pointy', colors, { hexColorFn: glinskiColor }) }, variantDesc: '81-hex rhombus board. Pawns start rank 3. Kings on opposite wings. Castling permitted. Helge E. de Vasa, 1953.'},
      diana: { label: 'Diana', boardStyle: 'checkered', rows: 6, cols: 6, tileSize: 40, fen: 'rbbkr1/pppppp/6/6/PPPPPP/RBBKR1', variantDesc: '6x6 board. No queens or knights.'},
      'delirious-bughouse': { label: 'Delirious Bughouse', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 34, layers: { count: 2, layout: 'horizontal', labels: ['Board 1', 'Board 2'], fens: ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'] }, variantDesc: 'Bughouse with dice, relay capture, worst-move mechanic, and fairy pieces. Alberto Monteiro, c. 1984.'},
      'dice-chess': { label: 'Dice Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Die roll constrains which piece type must move.'},
      'displacement-chess': { label: 'Displacement', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Pieces can swap positions with adjacent friendly pieces.'},
      djambi: { label: 'Djambi', boardStyle: 'checkered', rows: 9, cols: 9, tileSize: 38, fen: 'amrcxcrma/9/9/9/4M4/9/9/9/AMRCXCRMA', variantDesc: '4-player political strategy on 9x9. Killed pieces become impassable corpses. Centre Maze grants extra turns. Jean Anesto, 1975.'},
      'dragon-chess': { label: 'Dragon Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Standard chess with two Dragons (Archbishop: Bishop+Knight) held in reserve. Gate onto back rank instead of moving. GM Miguel Illescas.'},
      'duck-chess': { label: 'Duck Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'After each move, place the duck (blocker) on any empty square.'},
      'einstein-chess': { label: 'Einstein Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Non-capturing moves demote pieces; captures promote them.'},
      empire: { label: 'Empire Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'scdtedcs/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Asymmetric: FIDE Kingdom vs Empire. Empire pieces slide like Queens but capture differently. Faceoff rule. Corey Clark, 2019.'},
      'endgame-chess': { label: 'Endgame Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3', variantDesc: 'Only Kings and pawns. Pure endgame technique from move one.'},
      extinction: { label: 'Extinction', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Lose all of any one piece type and you lose the game.'},
      'fanorona-chess': { label: 'Fanorona Chess', boardStyle: 'checkered', rows: 5, cols: 9, tileSize: 36, fen: 'ppppppppp/ppppppppp/pppp1PPPP/PPPPPPPPP/PPPPPPPPP', variantDesc: 'Chess on Alquerque/Fanorona board. Capture by approach or withdrawal, not replacement. Stalemate loses.'},
      'fischer-random': { label: 'Fischer Random', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Back rank pieces randomised (960 positions). Castling adapted.'},
      'flip-chess': { label: 'Flip Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'After each capture, the capturing piece transforms into the type of piece it captured.'},
      'five-check': { label: 'Five-Check', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Extended Three-Check. Five checks wins instead of three.'},
      'fog-of-war': { label: 'Fog of War', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Only see squares your pieces can move to. No check warnings.'},
      'four-handed-chess': { label: 'Four-Handed Chess', boardStyle: 'checkered', rows: 14, cols: 14, tileSize: 24, cellMap: FOUR_PLAYER_MAP, colors: { voidFill: 'transparent' }, fen4: '3,yR,yN,yB,yK,yQ,yB,yN,yR,3/3,yP,yP,yP,yP,yP,yP,yP,yP,3/14/bR,bP,10,gP,gR/bN,bP,10,gP,gN/bB,bP,10,gP,gB/bK,bP,10,gP,gQ/bQ,bP,10,gP,gK/bB,bP,10,gP,gB/bN,bP,10,gP,gN/bR,bP,10,gP,gR/14/3,rP,rP,rP,rP,rP,rP,rP,rP,3/3,rR,rN,rB,rQ,rK,rB,rN,rR,3', pieceSet4: 'mce-4player', variantDesc: '4-player on 14x14 cross-shaped board (160 squares). Standard armies on each wing. Teams or free-for-all. FEN4 notation.'},
      giveaway: { label: 'Giveaway', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Forced captures. King is not royal. Stalemate is a loss.'},
      glinski: { label: 'Glinski (Hex)', boardStyle: 'hex', hexRadius: 5, hexSize: 22, flat: true, hexColorFn: glinskiColor, hexPosition: GLINSKI_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }, buildLayout(rows, cols, tileSize, colors) { return buildHexagonalLayout(generateHexGrid(5), 22, 'flat', colors, { hexColorFn: glinskiColor }) }, variantDesc: 'Chess on a 91-cell hexagonal board. Three bishops per side.'},
      grand: { label: 'Grand Chess', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 34, fen: 'r8r/1nbqkcbn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCBN1/R8R', variantDesc: 'Archbishop and Chancellor on 10x10 board. Pawns start on rank 3.'},
      'grande-acedrex': { label: 'Grande Acedrex', boardStyle: 'checkered', rows: 12, cols: 12, tileSize: 26, fen: 'rnuclgkglcunr/12/12/ppppppppppppp/12/12/12/12/PPPPPPPPPPPPP/12/12/RNUCLGKGLCUNR', variantDesc: 'Medieval 12x12 (Alfonso X, 1283). Griffon, Unicorn, Lion, Giraffe, Crocodile. Pawns start rank 4. File-based promotion.'},
      grasshopper: { label: 'Grasshopper Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbgkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBGKBNR', variantDesc: 'Queens replaced by Grasshoppers (hop over any piece, land immediately beyond).'},
      'gustav-iii-chess': { label: 'Gustav III Chess', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 34, cellMap: GUSTAV_MAP, colors: { voidFill: 'transparent' }, fen: 'm8m/1rnbqkbnr1/1pppppppp1/10/10/10/10/1PPPPPPPP1/1RNBQKBNR1/M8M', variantDesc: '8x8 + 4 corner extensions with Amazons (Queen+Knight). 68 squares total. Billberg, 1839.'},
      'grid-chess': { label: 'Grid Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Moves must cross at least one 2x2 grid line.'},
      gygax: { label: 'Gygax Chess', boardStyle: 'checkered', rows: 8, cols: 12, tileSize: 24, layers: { count: 3, layout: 'vertical', labels: ['Level 3 — Air', 'Level 2 — Land', 'Level 1 — Subterranean'], fens: ['2G3R3G1/S1S1S1S1S1S1/12/12/12/12/s1s1s1s1s1s1/2g3r3g1', 'OUHTCMKPTHUO/WWWWWWWWWWWW/12/12/12/12/wwwwwwwwwwww/ouhtcmkpthuo', '2B3E3B1/1D1D1D1D1D1D/12/12/12/12/1d1d1d1d1d1d/2b3e3b1'], colors: [{ lightSquare: '#a0c8e8', darkSquare: '#6a9ec8' }, { lightSquare: '#a8c890', darkSquare: '#6d9450' }, { lightSquare: '#d4a080', darkSquare: '#a06848' }] }, variantDesc: 'D&D-inspired three-level chess by Gary Gygax. 12x8 boards. Hero, Cleric, and fantasy pieces.'},
      'half-chess': { label: 'Half Chess', boardStyle: 'checkered', rows: 4, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/PPPPPPPP/RNBQKBNR', variantDesc: '4-rank board. Armies start adjacent. Immediate contact.'},
      hexapawn: { label: 'Hexapawn', boardStyle: 'checkered', rows: 3, cols: 3, tileSize: 50, fen: 'ppp/3/PPP', variantDesc: '3x3 pawn-only game. Reach far rank or stalemate opponent wins. Solved: Black wins with perfect play. Martin Gardner, 1962.'},
      'hoppel-poppel': { label: 'Hoppel-Poppel', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Knights capture like bishops; bishops capture like knights.'},
      'hostage-chess': { label: 'Hostage Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Captured pieces go to a prison. Can be released back to your opponent in exchange for one of your prisoners. John Leslie, 1997.'},
      horde: { label: 'Horde', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP', variantDesc: 'White has full army. Black has 36 pawns. Asymmetric survival.'},
      'immunization-chess': { label: 'Immunization', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Adjacent enemy pieces become immune to capture for 2 turns after a capture.'},
      janus: { label: 'Janus Chess', boardStyle: 'checkered', rows: 8, cols: 10, tileSize: 36, fen: 'rjnbkqbnjr/pppppppppp/10/10/10/10/PPPPPPPPPP/RJNBKQBNJR', variantDesc: '10x8 with two Januses (Archbishop: Bishop+Knight). Castles to b-file or i-file.'},
      'king-of-the-hill': { label: 'King of the Hill', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Moving your king to d4/d5/e4/e5 is an instant win.'},
      'khans-chess': { label: "Khan's Chess", boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'lhakahls/ssssssss/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Asymmetric: FIDE Kingdom vs Mongol Horde cavalry. All Horde pieces move as Knights, capture as FIDE counterparts. Couch Tomato, 2023.'},
      knightmate: { label: 'Knightmate', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rkbqnbkr/pppppppp/8/8/8/8/PPPPPPPP/RKBQNBKR', variantDesc: 'Knight and King swap roles. The Knight is royal.'},
      kriegspiel: { label: 'Kriegspiel', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Blind chess with referee. Players cannot see opponent pieces. Referee announces checks and captures. Henry Michael Temple, 1899.'},
      'legan-chess': { label: 'Legan Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbkqbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBKQBNR', variantDesc: 'Berolina pawns. King and Queen swap starting squares.'},
      'los-alamos': { label: 'Los Alamos', boardStyle: 'checkered', rows: 6, cols: 6, tileSize: 40, fen: 'rnqknr/pppppp/6/6/PPPPPP/RNQKNR', variantDesc: 'First computer chess (1956). 6x6 board, no Bishops, no castling.'},
      'los-alamos-vierschach': { label: 'Los Alamos Vierschach', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 30, cellMap: LOS_ALAMOS_V_MAP, colors: { voidFill: 'transparent' }, fen4: '2,yR,yN,yQ,yK,yN,yR,2/2,yP,yP,yP,yP,yP,yP,2/bR,bP,6,gP,gR/bN,bP,6,gP,gN/bQ,bP,6,gP,gK/bK,bP,6,gP,gQ/bN,bP,6,gP,gN/bR,bP,6,gP,gR/2,rP,rP,rP,rP,rP,rP,2/2,rR,rN,rQ,rK,rN,rR,2', pieceSet4: 'mce-4player', variantDesc: '4-player Los Alamos variant on 84-square cross board. No Bishops, no castling. Allied teams. Jörg Knappen.'},
      madrasi: { label: 'Madrasi', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Same-type opposing pieces paralyse each other when they attack.'},
      maharaja: { label: 'Maharaja', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/8/4M3', variantDesc: 'One full army vs one piece that moves as Queen + Knight.'},
      makpong: { label: 'Makpong', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'King cannot move out of check. Must block or capture.'},
      makruk: { label: 'Makruk', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rngfkgnr/8/pppppppp/8/8/PPPPPPPP/8/RNGFKGNR', variantDesc: 'Thai chess. Pawns promote on rank 6. No castling or en passant.'},
      mansindam: { label: 'Mansindam', boardStyle: 'checkered', rows: 9, cols: 8, tileSize: 38, fen: 'rncakqbm/pppppppp/9/9/9/9/9/PPPPPPPP/RNCAKQBM', variantDesc: 'Shogi-style drops with compound pieces on 8x9 board. No draws. Win by checkmate, campmate, or stalemate. Couch Tomato.'},
      marseillais: { label: 'Marseillais', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Each player makes two moves per turn (except White\'s first).'},
      mccooey: { label: 'McCooey (Hex)', boardStyle: 'hex', hexRadius: 5, hexSize: 22, flat: true, hexColorFn: glinskiColor, hexPosition: MCCOOEY_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }, buildLayout(rows, cols, tileSize, colors) { return buildHexagonalLayout(generateHexGrid(5), 22, 'flat', colors, { hexColorFn: glinskiColor }) }, variantDesc: 'McCooey hex chess. 7 pawns, diagonal pawn capture. Same 91-hex board as Glinski.'},
      metamachy: { label: 'Metamachy', boardStyle: 'checkered', rows: 12, cols: 12, tileSize: 26, fen: 'rnbclqklcbnr/pppppppppppp/12/12/12/12/12/12/12/12/PPPPPPPPPPPP/RNBCLQKLCBNR', variantDesc: '12x12 with 12 piece types. Variable King/Queen/Lion/Eagle placement. Cannon, Camel, Eagle. Jean-Louis Cazaux, 2012.'},
      'medusa-chess': { label: 'Medusa Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'After queen moves, attacked enemy pieces are petrified for 2 turns.'},
      'mini-hexchess': { label: 'Mini Hexchess', boardStyle: 'hex', hexRadius: 3, hexSize: 28, flat: true, hexColorFn: glinskiColor, hexPosition: MINI_HEXCHESS_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }, buildLayout(rows, cols, tileSize, colors) { return buildHexagonalLayout(generateHexGrid(3), 28, 'flat', colors, { hexColorFn: glinskiColor }) }, variantDesc: 'Compact 37-hex board. No Queen. McCooey 1997.'},
      minichess: { label: 'Minichess', boardStyle: 'checkered', rows: 5, cols: 5, tileSize: 40, fen: 'kqbnr/ppppp/5/PPPPP/RNBQK', variantDesc: 'Gardner\'s 5x5 board. All piece types, fast tactical games.'},
      'monster-chess': { label: 'Monster Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/R3K2R', variantDesc: 'White moves twice per turn but starts with only King, Rooks, and pawns.'},
      'no-castling': { label: 'No Castling', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Standard chess with castling removed. Kings must develop naturally.'},
      nightrider: { label: 'Nightrider Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Knights replaced by Nightriders (repeat knight leap in same direction).'},
      'no-retreat': { label: 'No Retreat', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Pieces cannot move backward toward their own starting rank.'},
      'oblong-chess': { label: 'Oblong Chess', boardStyle: 'checkered', rows: 16, cols: 4, tileSize: 34, fen: 'rnbk/pppp/4/4/4/4/4/4/4/4/4/4/4/4/PPPP/KBNR', variantDesc: '4x16 historical Shatranj variant (~1000 years old). Extreme rectangle shifts piece values. Often played with dice.'},
      'omega-chess': { label: 'Omega Chess', boardStyle: 'checkered', rows: 12, cols: 12, tileSize: 26, cellMap: OMEGA_MAP, colors: { voidFill: 'transparent' }, fen: 'w10w/1crnbqkbnrc1/1pppppppppp1/12/12/12/12/12/12/1PPPPPPPPPP1/1CRNBQKBNRC1/W10W', variantDesc: '10x10 + 4 wizard squares (104 total). Champion (WAD) and Wizard (FC). Pawns advance 1-3 on first move. Daniel MacDonald, 1998.'},
      omnicide: { label: 'Omnicide', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Lose all your pieces to win. Captures NOT forced.'},
      'orda-chess': { label: 'Orda Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'lhaykahl/8/pppppppp/8/8/PPPPPPPP/8/RNBQKBNR', variantDesc: 'Asymmetric: White standard vs Black Horde (divergent movers).'},
      'orda-mirror': { label: 'Orda Mirror', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'lkfyxfkl/pppppppp/8/8/8/8/PPPPPPPP/LKFYXFKL', variantDesc: 'Both players command the Horde. Pieces move as Knights, capture as FIDE counterparts. Corey Clark, 2020.'},
      'ouk-chaktrang': { label: 'Ouk Chaktrang', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/8/pppppppp/8/8/PPPPPPPP/8/RNBQKBNR', variantDesc: 'Cambodian chess. Koul leaps diagonally; King has first-move Knight jump. Pawns promote on rank 6.'},
      patrol: { label: 'Patrol', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Pieces can only capture or give check when defended by a friendly piece.'},
      'pawns-only': { label: 'Pawns Only', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3', variantDesc: 'Kings and pawns only. First to promote wins instantly.'},
      'peasants-revolt': { label: "Peasants' Revolt", boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: '2n1k1n1/pppppppp/8/8/8/8/PPPPPPPP/4K3', variantDesc: 'White: King + 8 pawns vs Black: King + 2 Knights + 8 pawns.'},
      petty: { label: 'Petty Chess', boardStyle: 'checkered', rows: 6, cols: 5, tileSize: 40, fen: 'rnbqk/ppppp/5/5/PPPPP/RNBQK', variantDesc: 'All piece types on a compact 5x6 board. Single copies of each.'},
      'poison-chess': { label: 'Poison Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Capture squares become poisoned for 3 turns.'},
      'placement-chess': { label: 'Placement Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: '8/pppppppp/8/8/8/8/PPPPPPPP/8', variantDesc: 'Players place back-rank pieces before play begins. Bishops must be on opposite colours. David Bronstein.'},
      'pocket-knight': { label: 'Pocket Knight', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Each player has one extra Knight in pocket. Can be dropped on any empty square instead of moving.'},
      progressive: { label: 'Progressive', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Moves per turn escalate: 1, 2, 3, 4... Check ends turn early.'},
      'racing-kings': { label: 'Racing Kings', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: '8/8/8/8/8/8/krbnNBRK/qrbnNBRQ', variantDesc: 'No checks allowed. Both kings start on 1st rank. Race to the top.'},
      'recruitment-chess': { label: 'Recruitment', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Captured pieces defect to the captor on the vacated square.'},
      rifle: { label: 'Rifle Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Capturing pieces stay on their square. They shoot the target.'},
      'romanchenkos-chess': { label: "Romanchenko's Chess", boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Standard pieces on board with broken/displaced columns. Prevents rote opening memorisation. Soviet pedagogical tool.'},
      's-chess': { label: 'S-Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Hawk and Elephant enter via gating when back-rank pieces vacate. Yasser Seirawan and Jonathan Tisdall, 2007.'},
      senterej: { label: 'Senterej', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbkqbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Ethiopian chess. King and Queen positions swapped for Black. No castling, no en passant, no double pawn step.'},
      shako: { label: 'Shako', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 34, fen: 'rcebqkbecr/pppppppppp/10/10/10/10/10/10/PPPPPPPPPP/RCEBQKBECR', variantDesc: '10x10 with Cannon (screen-jump capture) and Elephant (2-diagonal leap). Jean-Louis Cazaux, 2000.'},
      shatar: { label: 'Shatar', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Mongolian chess. No check. Win by leaving opponent with only their King.'},
      shatranj: { label: 'Shatranj', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnekfenr/pppppppp/8/8/8/8/PPPPPPPP/RNEKFENR', variantDesc: 'Medieval Islamic chess. Bare king and stalemate are wins.'},
      'shatranj-kamil': { label: 'Shatranj Kamil', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 34, fen: 'rncbqkbcnr/pppppppppp/10/10/10/10/10/10/PPPPPPPPPP/RNCBQKBCNR', variantDesc: 'Perfect Shatranj. 10x10 board with Camels added. Invented by Imam Ubaydullah ibn Ali Al-Tibrizi, c. 1100s.'},
      shafran: { label: 'Shafran (Hex)', boardStyle: 'hex', hexGrid: SHAFRAN_GRID, hexSize: 22, flat: true, hexColorFn: glinskiColor, hexPosition: SHAFRAN_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }, buildLayout(rows, cols, tileSize, colors) { return buildHexagonalLayout(SHAFRAN_GRID, 22, 'flat', colors, { hexColorFn: glinskiColor }) }, variantDesc: 'Irregular 70-hex board, 9 files. Castling permitted. Pawn initial step varies by file. Isaak Shafran, 1939.'},
      'single-check': { label: 'Single-Check', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'One check wins. No checkmate needed.'},
      shinobi: { label: 'Shinobi Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'cmujtmuc/2pppp2/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Asymmetric: FIDE vs Shinobi Clan. Clan drops ninja pieces from hand, promotes in zone. Corey Clark, 2021.'},
      shinobiplus: { label: 'Shinobi+', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/4K3', variantDesc: 'Asymmetric: Black Kingdom (FIDE setup) vs White Clan (King only, drops 7 ninja pieces from hand). Extended Shinobi.'},
      shogun: { label: 'Shogun Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Zone-triggered promotion and Shogi-style drops from captured pieces. Corey Clark, 2020.'},
      sittuyin: { label: 'Sittuyin', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Burmese chess. Placement opening phase. Pawns promote on diagonal.'},
      spartan: { label: 'Spartan Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'lwgkkgwl/hhhhhhhh/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Asymmetric: Persian (FIDE) vs Spartan army with two Kings and unique pieces. Steven Streetman, 2010.'},
      'stalemate-wins': { label: 'Stalemate Wins', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Standard chess but stalemate is a win, not a draw.'},
      stupidhouse: { label: 'Stupidhouse', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 34, layers: { count: 2, layout: 'horizontal', labels: ['Board 1', 'Board 2'], fens: ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'] }, variantDesc: 'Bughouse variant where captured pieces drop on a randomly selected empty square rather than player-chosen.'},
      'suicide-chess': { label: 'Suicide Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Forced captures. Stalemate is a draw, not a loss.'},
      synochess: { label: 'Synochess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rheachhr/2n2n2/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Asymmetric: Western FIDE vs Eastern dynasty (Xiangqi pieces, Cannon, Soldier drops). Faceoff rule. Corey Clark, 2020.'},
      tamerlane: { label: 'Tamerlane Chess', boardStyle: 'checkered', rows: 10, cols: 11, tileSize: 30, fen: '11/rntzfkwztnr/ppppppppppp/e1j1d1d1j1e/11/11/E1J1D1D1J1E/PPPPPPPPPPP/RNTZFKWZTNR/11', variantDesc: 'Medieval 11x10 board with citadels. 12 piece types including Giraffe, Camel, War Engine.'},
      'tandem-chess': { label: 'Tandem Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 34, layers: { count: 2, layout: 'horizontal', labels: ['Board 1', 'Board 2'], fens: ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'] }, variantDesc: 'Bughouse chess. 4 players, 2 teams, 2 boards. Captured pieces passed to partner for drops.'},
      'teleport-chess': { label: 'Teleport Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Each side has 3 teleports per game.'},
      'three-check': { label: 'Three-Check', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'First to check the opponent three times wins.'},
      'toroidal-chess': { label: 'Toroidal Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Board wraps in both directions (files and ranks). No edges exist.'},
      'toroidal-byzantine': { label: 'Toroidal Byzantine', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Byzantine circular chess played on a torus. All four edges wrap. No corners, no edge advantage.'},
      torpedo: { label: 'Torpedo', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Pawns can move two squares forward from any rank.'},
      'turkish-great-chess-ii': { label: 'Turkish Great Chess II', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 30, fen: 'rnbpqkpbnr/pppppppppp/10/10/10/10/10/10/PPPPPPPPPP/RNBPQKPBNR', variantDesc: 'Historical 10x10 (Atranj). Prince (R+B+N), Kotwal (B+N), Urdabegini. Indian/Ottoman origin. No castling.'},
      'turkish-great-chess-iii': { label: 'Turkish Great Chess III', boardStyle: 'checkered', rows: 12, cols: 12, tileSize: 26, fen: 'rrbbnnwqknbbr/ppppppppppppp/12/12/12/12/12/12/12/12/PPPPPPPPPPPPP/RRBBNNWQKNBBR', variantDesc: 'Historical 12x12. Multiple Bishop-types, 2 Chariots + 2 Rooks per side. Wazir moves as Queen. No castling.'},
      'turkish-great-chess-iv': { label: 'Turkish Great Chess IV', boardStyle: 'checkered', rows: 14, cols: 14, tileSize: 24, fen: 'rnbbcnwqkwcnbbr/pppppppppppppp/14/14/14/14/14/14/14/14/14/14/PPPPPPPPPPPPPP/RNBBCNWQKWCNBBR', variantDesc: 'Historical 14x14. Weak Rani (1 step any direction, may be left en prise). Mixed Indian/Persian/Ottoman origin. No castling.'},
      ultima: { label: 'Ultima', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'cilwklhc/pppppppp/8/8/8/8/PPPPPPPP/CIHLKLIC', variantDesc: 'All 7 piece types use different capture mechanics. No check: win by capturing the King. Robert Abbott, 1962.'},
      'upside-down': { label: 'Upside-Down', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'RNBQKBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbqkbnr', variantDesc: 'Pieces start on the opponent\'s back rank. Instant tactical chaos.'},
      vierschach: { label: 'Vierschach', boardStyle: 'checkered', rows: 14, cols: 14, tileSize: 24, fen: '14/14/14/3rnbqkbnr3/3pppppppp3/14/14/14/14/3PPPPPPPP3/3RNBQKBNR3/14/14/14', variantDesc: '4-player chess on 14x14 cross-shaped board. Standard armies on opposing sides. Team or free-for-all.'},
      weak: { label: 'Weak!', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Weakest piece type with a legal move must move first.'},
      wildebeest: { label: 'Wildebeest Chess', boardStyle: 'checkered', rows: 10, cols: 11, tileSize: 30, fen: 'rncwqkwcnr1/ppppppppppp/11/11/11/11/11/11/PPPPPPPPPPP/RNCWQKWCNR1', variantDesc: 'Camel + Wildebeest (GNU) pieces on 11x10 board. R. Wayne Schmittberger, 1987.'},
      'xiang-fu': { label: 'Xiang Fu', boardStyle: 'checkered', rows: 9, cols: 9, tileSize: 38, fen: '2rbm4/2cwn4/9/9/9/9/9/4NWC2/4MBR2', variantDesc: 'Xiangqi/chess hybrid. 9x9. Dual Champions (royal), Crossbow (diagonal Cannon), piece drops within first 2 ranks. Eventlesstew, PyChess contest.'},
      'yalta-chess': { label: 'Yalta Chess', boardStyle: 'checkered', rows: 14, cols: 14, tileSize: 24, fen: '14/14/14/3rnbqkbnr3/3pppppppp3/14/14/14/14/3PPPPPPPP3/3RNBQKBNR3/14/14/14', variantDesc: '3-player chess on Y-shaped board. Each player controls one sector. Diplomacy and shifting alliances. Andrzej Bobrowski, 1994.'},
    },
  },
  go: {
    label: 'Go',
    pieceSet: 'playstrategy-go-classic',
    hasHandicap: true,
    // TEMPORARY: moves to packages/schema/src/produce.js when frontmatter lands.
    // The data (star points, inset, colours) goes INTO the frontmatter YAML.
    // The dimension computation (background sizing) becomes a generic resolver in produce().
    // See: packages/schema/__tests__/produce-purity.test.js (guards against game knowledge in produce)
    buildLayout(rows, cols, tileSize, colors) {
      const inset = 15
      const STAR_POINTS = { 9: [[2,2],[2,6],[4,4],[6,2],[6,6]], 13: [[3,3],[3,9],[6,6],[9,3],[9,9]], 19: [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]] }
      return {
        positionType: 'intersection',
        showLabels: true,
        inset,
        cellFill: 'none',
        backgrounds: [
          { fill: colors.woodLight || '#dcb35c' },
          { x: 24 + inset, y: 24 + inset, width: (cols - 1) * tileSize, height: (rows - 1) * tileSize, fill: colors.woodDark || '#d4a843', rx: 2 },
        ],
        lines: { color: colors.gridLine || '#3d2b1a', width: 0.8 },
        markers: (STAR_POINTS[rows] || []).map(([r, c]) => ({ r, c, fill: colors.starPoint || '#3d2b1a' })),
        labels: { alphabet: 'abcdefghjklmnopqrst'.split(''), fontFamily: 'sans-serif', color: colors.labelText || '#5a4020' },
      }
    },
    variants: {
      standard: { label: 'Standard (19×19)', boardStyle: 'go', rows: 19, cols: 19, tileSize: 20, setupDesc: 'Empty board, 361 intersections, komi 6.5', variantDesc: 'Full tournament game. Area or territory scoring.' },
      '13x13': { label: '13×13', boardStyle: 'go', rows: 13, cols: 13, tileSize: 20, setupDesc: 'Empty board, 169 intersections, komi 5.5', variantDesc: 'Intermediate board. 30-60 minute games.' },
      '9x9': { label: '9×9', boardStyle: 'go', rows: 9, cols: 9, tileSize: 20, setupDesc: 'Empty board, 81 intersections, komi 5.5', variantDesc: 'Quick games (15 min). Purely tactical.' },
      'capture-go': { label: 'Capture Go (9×9)', boardStyle: 'go', rows: 9, cols: 9, tileSize: 20, setupDesc: 'Empty 9x9 board', variantDesc: 'First player to capture any stone wins. No territory scoring. Universal teaching variant.' },
      gomoku: { label: 'Gomoku (15×15)', boardStyle: 'go', rows: 15, cols: 15, tileSize: 20, setupDesc: 'Empty board, 225 intersections', variantDesc: 'Five-in-a-row. Stones placed, never moved. No captures.' },
      'ninuki-renju': { label: 'Ninuki-Renju (15×15)', boardStyle: 'go', rows: 15, cols: 15, tileSize: 20, setupDesc: 'Empty board, 225 intersections', variantDesc: 'Japanese precursor to Pente. Custodial captures. Two win conditions.' },
      'one-colour': { label: 'One-Colour (19×19)', boardStyle: 'go', rows: 19, cols: 19, tileSize: 20, setupDesc: 'Empty board, both players use identical stones', variantDesc: 'Must remember which stones are yours. Extreme memory challenge.' },
      'phantom-go': { label: 'Phantom Go (9×9)', boardStyle: 'go', rows: 9, cols: 9, tileSize: 20, setupDesc: 'Empty 9x9 board, opponent stones hidden', variantDesc: 'Fog of war. Players cannot see opponent stones. A referee mediates all moves.' },
      rengo: { label: 'Rengo (19×19)', boardStyle: 'go', rows: 19, cols: 19, tileSize: 20, setupDesc: 'Empty board, teams of 2 or 3', variantDesc: 'Team Go. Partners alternate turns. No consultation. 2v2 or 3v3.' },
      renju: { label: 'Renju (15×15)', boardStyle: 'go', rows: 15, cols: 15, tileSize: 20, setupDesc: 'Empty board, 225 intersections', variantDesc: 'Competitive Gomoku with forbidden moves for Black. Governed by the Renju International Federation.' },
      stoical: { label: 'Stoical Go (19×19)', boardStyle: 'go', rows: 19, cols: 19, tileSize: 20, setupDesc: 'Empty board, 361 intersections', variantDesc: 'Cannot capture if opponent captured last turn. Forces restraint and patience.' },
      sunjang: { label: 'Sunjang Baduk (19×19)', boardStyle: 'go', rows: 19, cols: 19, tileSize: 20, goPreset: 'sunjang', setupDesc: '16 pre-placed stones on star points', variantDesc: 'Korean historical Go. Prisoners ignored. No komi.' },
      tibetan: { label: 'Tibetan Go (17×17)', boardStyle: 'go', rows: 17, cols: 17, tileSize: 20, goPreset: 'tibetan', setupDesc: '12 pre-placed stones, 289 intersections', variantDesc: '17x17 board. Delayed captures. Unique scoring system.' },
      'toroidal-go': { label: 'Toroidal Go (11×11)', boardStyle: 'go', rows: 11, cols: 11, tileSize: 20, setupDesc: 'Empty board, edges wrap', variantDesc: 'Edges wrap horizontally and vertically. No corners, no edges, no joseki.' },
    },
  },
  xiangqi: {
    label: 'Xiangqi',
    pieceSet: 'mce-xiangqi-trad',
    // TEMPORARY: moves to packages/schema/src/produce.js when frontmatter lands.
    buildLayout(rows, cols, tileSize, colors, config = {}) {
      const inset = 20
      const river = config.river !== false
      const riverRows = config.riverRows || [Math.floor(rows / 2) - 1, Math.floor(rows / 2)]
      const hasPalace = config.palace !== false
      const mid = Math.floor(cols / 2)
      const palaceLeft = config.palaceCols?.[0] ?? (mid - 1)
      const palaceRight = config.palaceCols?.[1] ?? (mid + 1)
      const palaceRows = config.palaceRows || 2
      const ox = inset
      const posX = (c) => ox + c * tileSize
      const posY = (r) => ox + r * tileSize

      const paths = []
      if (hasPalace) {
        const stroke = colors.palace || '#4a3520'
        const palaceBotRow = rows - 1 - palaceRows
        paths.push(
          { d: `M ${posX(palaceLeft)},${posY(0)} L ${posX(palaceRight)},${posY(palaceRows)}`, stroke, strokeWidth: 0.8, fill: 'none' },
          { d: `M ${posX(palaceRight)},${posY(0)} L ${posX(palaceLeft)},${posY(palaceRows)}`, stroke, strokeWidth: 0.8, fill: 'none' },
          { d: `M ${posX(palaceLeft)},${posY(palaceBotRow)} L ${posX(palaceRight)},${posY(palaceBotRow + palaceRows)}`, stroke, strokeWidth: 0.8, fill: 'none' },
          { d: `M ${posX(palaceRight)},${posY(palaceBotRow)} L ${posX(palaceLeft)},${posY(palaceBotRow + palaceRows)}`, stroke, strokeWidth: 0.8, fill: 'none' },
        )
      }

      const texts = []
      if (river) {
        const gridW = (cols - 1) * tileSize
        const fontSize = Math.min(tileSize * 0.45, 14)
        const y = inset + (riverRows[0] + riverRows[1]) * tileSize / 2 + fontSize * 0.35
        texts.push(
          { x: inset + gridW * 0.25, y, text: '楚 河', fontSize, fontFamily: 'serif', fill: colors.riverText || '#4a3520' },
          { x: inset + gridW * 0.75, y, text: '漢 界', fontSize, fontFamily: 'serif', fill: colors.riverText || '#4a3520' },
        )
      }

      return {
        positionType: 'intersection',
        showLabels: false,
        inset,
        cellFill: 'none',
        backgrounds: [
          { fill: colors.board || '#f5deb3' },
          { fill: 'none', stroke: colors.gridLine || '#4a3520', 'stroke-width': 2 },
        ],
        lines: { color: colors.gridLine || '#4a3520', width: 1, splitAfterRow: river ? riverRows[0] : undefined },
        paths,
        texts,
      }
    },
    variants: {
      standard: { label: 'Standard', boardStyle: 'xiangqi', rows: 10, cols: 9, tileSize: 36, river: true, fen: 'rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR', setupDesc: '16 pieces each across river', variantDesc: 'Chinese chess. Palace confines generals and advisors. River restricts elephants. Cannons screen-jump to capture.' },
      janggi: { label: 'Janggi', boardStyle: 'xiangqi', rows: 10, cols: 9, tileSize: 36, river: false, fen: 'rhea1aehr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RHEA1AEHR', setupDesc: '16 pieces each, generals in palace centre', variantDesc: 'Korean chess. No river. Elephants move wider. Generals and guards move along palace diagonals.' },
      jieqi: { label: 'Jieqi', boardStyle: 'xiangqi', rows: 10, cols: 9, tileSize: 36, river: true, pieceSetOverride: 'mce-xiangqi-fairy', fen: 'ffffkffff/9/1f5f1/f1f1f1f1f/9/9/F1F1F1F1F/1F5F1/9/FFFFKFFFF', pieceNames: { F: 'Face-down piece', f: 'Face-down piece', K: 'General', k: 'General' }, setupDesc: 'Standard positions, all pieces face-down except Generals', variantDesc: 'Hidden-information Xiangqi. All pieces except General start face-down, revealed on first move. Rank hierarchy for captures.' },
      'manchu-plus': { label: 'Manchu', boardStyle: 'xiangqi', rows: 10, cols: 9, tileSize: 36, river: true, pieceSetOverride: 'mce-xiangqi-fairy', fen: 'r1eakae1z/9/p1p1p1p1p/9/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR', pieceNames: { Z: 'Banner', z: 'Banner' }, setupDesc: 'Black: Chariot, 2 Elephants, 2 Advisors, General, Banner. Red: standard', variantDesc: 'Asymmetric: Red has standard Xiangqi army. Black has no Horses or Cannons — replaced by one Banner (combines Chariot+Cannon+Horse movement).'},
      minixiangqi: { label: 'Mini Xiangqi', boardStyle: 'xiangqi', rows: 7, cols: 7, tileSize: 40, river: false, palace: false, fen: 'rchkhcr/p1ppp1p/7/7/7/P1PPP1P/RCHKHCR', setupDesc: '12 pieces each on 7x7', variantDesc: '7x7 Xiangqi. No river, no Advisors/Elephants. Soldiers move sideways from start. No palace.'},
      'quang-trung': { label: 'Quang Trung', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 30, fen: 'rheaakaehr/10/1c6c1/p1p1pp1p1p/10/10/P1P1PP1P1P/1C6C1/10/RHEAAKAEHR', setupDesc: '18 pieces each on 10x10 checkered board', variantDesc: 'Vietnamese 10x10 chess variant. Pieces on squares (not intersections). Pawn reaching last rank wins. NEEDS VERIFIED SETUP.'},
      'xiangqi-42': { label: 'Xiangqi-42', boardStyle: 'xiangqi', rows: 6, cols: 7, tileSize: 40, river: true, fen: 'rhakahr/1c3c1/p2p2p/P2P2P/1C3C1/RHAKAHR', setupDesc: '12 pieces each on 7x6 (42 intersections)', variantDesc: 'Compact Xiangqi on 42 intersections (7x6). No Elephants. Cannons in front of Horses. Robert Price, 2001.'},
      'yang-qi': { label: 'Yang Qi', boardStyle: 'xiangqi', rows: 10, cols: 9, tileSize: 36, river: true, pieceSetOverride: 'mce-xiangqi-fairy', fen: 'rhvakavhr/1c5c1/p1p1p1p1p/1p1p1p1p1/9/9/1P1P1P1P1/P1P1P1P1P/1C5C1/RHVAKAVHR', setupDesc: '20 pieces each (9 pawns on two ranks, 2 Cannons, 9 back rank)', variantDesc: 'Western-influenced Xiangqi. Vaos (diagonal screen-capture) replace Elephants. 9 soldiers per side staggered on ranks 3-4. No river/palace restrictions.'},
    },
  },
  draughts: {
    label: 'Draughts',
    pieceSet: 'playstrategy-dameo-fabirovsky',
    buildLayout: buildCheckeredLayout,
    variants: {
      english: { label: 'English (8×8)', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, draughtsSetup: { rows: 3, dark: true }, setupDesc: '12 per side, dark squares, 3 rows', variantDesc: 'Men capture forward only. Kings move one square diagonally.' },
      brazilian: { label: 'Brazilian (8×8)', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, draughtsSetup: { rows: 3, dark: true }, setupDesc: '12 per side, dark squares, 3 rows', variantDesc: 'Flying kings, mandatory maximum capture. International rules on 8×8.' },
      czech: { label: 'Czech (8×8)', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, draughtsSetup: { rows: 3, dark: true }, setupDesc: '12 per side, dark squares, 3 rows', variantDesc: 'Flying kings, mandatory capture but no maximum rule.' },
      german: { label: 'German (8×8)', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, draughtsSetup: { rows: 3, dark: true }, setupDesc: '12 per side, dark squares, 3 rows', variantDesc: 'Flying kings, mandatory capture, king must be taken if possible.' },
      italian: { label: 'Italian (8×8)', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, draughtsSetup: { rows: 3, dark: true }, setupDesc: '12 per side, dark squares, 3 rows', variantDesc: 'Men cannot capture kings. Mandatory maximum capture. Kings move one square.' },
      pool: { label: 'Pool (8×8)', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, draughtsSetup: { rows: 3, dark: true }, setupDesc: '12 per side, dark squares, 3 rows', variantDesc: 'Men capture backward. Flying kings. No maximum capture rule.' },
      russian: { label: 'Russian (8×8)', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, draughtsSetup: { rows: 3, dark: true }, setupDesc: '12 per side, dark squares, 3 rows', variantDesc: 'Flying kings. Man promotes mid-sequence and continues as king.' },
      spanish: { label: 'Spanish (8×8)', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, draughtsSetup: { rows: 3, dark: true }, setupDesc: '12 per side, dark squares, 3 rows', variantDesc: 'Flying kings, mandatory maximum capture. Captures prioritize kings.' },
      bashni: { label: 'Bashni (8×8)', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, draughtsSetup: { rows: 3, dark: true }, setupDesc: '12 per side, dark squares, 3 rows', variantDesc: 'Column draughts: captured pieces stack under the captor.' },
      thai: { label: 'Thai (8×8)', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, draughtsSetup: { rows: 2, dark: true }, setupDesc: '8 per side, dark squares, 2 rows', variantDesc: 'Men promote on row 6 (not back rank). Flying kings. Fewer pieces.' },
      international: { label: 'International (10×10)', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 34, draughtsSetup: { rows: 4, dark: true }, setupDesc: '20 per side, dark squares, 4 rows', variantDesc: 'Flying kings, mandatory maximum capture. FIDE standard.' },
      frisian: { label: 'Frisian (10×10)', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 34, draughtsSetup: { rows: 4, dark: true }, setupDesc: '20 per side, dark squares, 4 rows', variantDesc: 'Captures allowed orthogonally and diagonally. Kings limited to 3 non-capture moves.' },
      ghanaian: { label: 'Ghanaian (10×10)', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 34, draughtsSetup: { rows: 4, dark: true }, setupDesc: '20 per side, dark squares, 4 rows', variantDesc: 'International rules. Kings captured before men when choice exists.' },
      canadian: { label: 'Canadian (12×12)', boardStyle: 'checkered', rows: 12, cols: 12, tileSize: 28, draughtsSetup: { rows: 5, dark: true }, setupDesc: '30 per side, dark squares, 5 rows', variantDesc: 'International rules on 12×12. Longest games in the draughts family.' },
      spantsiretti: { label: 'Spantsiretti (10×8)', boardStyle: 'checkered', rows: 8, cols: 10, tileSize: 36, draughtsSetup: { rows: 4, dark: true }, setupDesc: '20 per side, dark squares, 4 rows on 10-wide board', variantDesc: 'Wide board variant. Men may optionally move sideways (not just forward).' },
      'turkish-draughts': { label: 'Turkish', boardStyle: 'mono-grid', rows: 8, cols: 8, tileSize: 40, buildLayout: buildMonoGridLayout, draughtsSetup: { rows: 2, dark: false }, setupDesc: '16 per side, all squares, rows 2-3 and 6-7', variantDesc: 'Orthogonal movement only (no diagonals). All 64 squares used.' },
      lasca: { label: 'Lasca (7×7)', boardStyle: 'checkered', rows: 7, cols: 7, tileSize: 40, draughtsSetup: { rows: 3, dark: true }, setupDesc: '11 per side, dark squares, 3 rows', variantDesc: 'Column draughts: captured pieces join the column. Columns commanded by top piece.' },
      alquerque: { label: 'Alquerque (5×5)', boardStyle: 'alquerque', rows: 5, cols: 5, tileSize: 48, fanoronaSetup: true, pieceSetOverride: 'playstrategy-go-classic', buildLayout: (rows, cols, tileSize, colors) => buildIntersectionGridLayout(rows, cols, tileSize, colors, { diagonals: 'alternating' }), setupDesc: '12 per side, all intersections except center', variantDesc: 'Medieval ancestor of draughts. Move along lines, capture by jumping.' },
      dameo: { label: 'Dameo (8×8)', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, setup: 'bbbbbbbb/1bbbbbb1/2bbbb2/8/8/2wwww2/1wwwwww1/wwwwwwww', setupDesc: '18 per side, all squares, trapezoidal (8/6/4)', variantDesc: 'Phalanx movement: lines of men slide together. Orthogonal captures only.' },
      diagonal: { label: 'Diagonal (10×10)', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 34, setup: '2b1b1b1b1/3b1b1b1b/w3b1b1b1/1w3b1b1b/w1w3b1b1/1w1w3b1b/w1w1w3b1/1w1w1w3b/w1w1w1w3/1w1w1w1w2', setupDesc: '20 per side, dark squares, split along main diagonal', variantDesc: 'International rules with rotated starting position. Main diagonal empty.' },
    },
  },
  reversi: {
    label: 'Reversi',
    pieceSet: 'playstrategy-flipello-classic',
    // TEMPORARY: moves to packages/schema/src/produce.js when frontmatter lands.
    buildLayout(rows, cols, tileSize, colors) {
      return {
        positionType: 'square',
        showLabels: true,
        cellFill: 'none',
        backgrounds: [{ fill: colors.monoSquare || '#d9b483' }],
        lines: { color: colors.gridLine || '#8b6914', width: 1.5 },
      }
    },
    variants: {
      standard: { label: 'Standard (8×8)', boardStyle: 'mono-grid', rows: 8, cols: 8, tileSize: 40, setup: '8/8/8/3bw3/3wb3/8/8/8', colors: { monoSquare: '#2e7d32', gridLine: '#1b5e20' }, setupDesc: '4 discs in centre (2 each, diagonal)', variantDesc: 'Flank opponent discs to flip them. Most discs at end wins.' },
      'six-by-six': { label: '6×6', boardStyle: 'mono-grid', rows: 6, cols: 6, tileSize: 40, setup: '6/6/2bw2/2wb2/6/6', colors: { monoSquare: '#2e7d32', gridLine: '#1b5e20' }, setupDesc: '4 discs in centre (2 each, diagonal)', variantDesc: 'Standard Reversi on a smaller 6x6 board. Faster games, fewer options.' },
      'anti-reversi': { label: 'Anti-Reversi (8×8)', boardStyle: 'mono-grid', rows: 8, cols: 8, tileSize: 40, setup: '8/8/8/3bw3/3wb3/8/8/8', colors: { monoSquare: '#2e7d32', gridLine: '#1b5e20' }, setupDesc: '4 discs in centre (2 each, diagonal)', variantDesc: 'Reversed goal: player with FEWEST discs at end wins.' },
    },
  },
  shogi: {
    label: 'Shogi',
    pieceSet: 'kahu-shogi-kanji-red-wood',
    // TEMPORARY: moves to packages/schema/src/produce.js when frontmatter lands.
    buildLayout(rows, cols, tileSize, colors) {
      const inset = 20
      const HOSHI = { 9: [[2,2],[2,6],[6,2],[6,6]] }
      const zones = []
      if (rows === 9) {
        zones.push(
          { fromRow: 0, toRow: 2, fromCol: 0, toCol: cols - 1, fill: colors.promotionZone || 'rgba(180, 60, 40, 0.08)' },
          { fromRow: 6, toRow: 8, fromCol: 0, toCol: cols - 1, fill: colors.promotionZone || 'rgba(180, 60, 40, 0.08)' },
        )
      }
      const markers = (rows === 9 && cols === 9) ? HOSHI[9].map(([r, c]) => ({ r, c, fill: colors.hoshi || '#6b4e1a' })) : []
      return {
        positionType: 'intersection',
        showLabels: false,
        inset,
        cellFill: 'none',
        backgrounds: [
          { fill: colors.board || '#e8c97a' },
          { fill: 'none', stroke: colors.boardBorder || '#8b6914', 'stroke-width': 2 },
        ],
        lines: { color: colors.gridLine || '#6b4e1a', width: 0.8 },
        zones,
        markers,
      }
    },
    variants: {
      standard: { label: 'Standard (9×9)', boardStyle: 'shogi', rows: 9, cols: 9, tileSize: 36, fen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL', setupDesc: '20 pieces each on back ranks and third row', variantDesc: 'Captured pieces become your own and can be dropped back onto the board.' },
      'annan-shogi': { label: 'Annan Shogi (9×9)', boardStyle: 'shogi', rows: 9, cols: 9, tileSize: 36, fen: 'lnsgkgsnl/1r5b1/p1ppppp1p/1p5p1/9/1P5P1/P1PPPPP1P/1B5R1/LNSGKGSNL', setupDesc: 'Standard position with b/h file pawns advanced', variantDesc: 'Pieces borrow movement of the friendly piece directly behind them. Standard Shogi otherwise.' },
      'cannon-shogi': { label: 'Cannon Shogi (9×9)', boardStyle: 'shogi', rows: 9, cols: 9, tileSize: 36, pieceSetOverride: 'mce-shogi-fairy', fen: 'lnsgkgsnl/1rci1uab1/p1p1p1p1p/9/9/9/P1P1P1P1P/1BAU1ICR1/LNSGKGSNL', pieceNames: { A: 'Silver Cannon', a: 'Silver Cannon', U: 'Gold Cannon', u: 'Gold Cannon', I: 'Iron Cannon', i: 'Iron Cannon', C: 'Copper Cannon', c: 'Copper Cannon' }, setupDesc: '20 pieces each (9 back rank + 6 rank 2 + 5 Soldiers)', variantDesc: 'Shogi + 4 Cannon types from Xiangqi/Janggi. Soldiers replace Pawns. Drops permitted. Peter Michaelsen, 1998.' },
      'chu-shogi': { label: 'Chu Shogi (12×12)', boardStyle: 'shogi', rows: 12, cols: 12, tileSize: 28, pieceSetOverride: 'mce-shogi-fairy', fen: 'lfcsgekgscfl/a1b1txot1b1a/mvrhdqndhrvm/pppppppppppp/3i4i3/12/12/3I4I3/PPPPPPPPPPPP/MVRHDNQDHRVM/A1B1TOXT1B1A/LFCSGKEGSCFL', pieceNames: { E: 'Drunk Elephant', e: 'Drunk Elephant', C: 'Copper General', c: 'Copper General', F: 'Ferocious Leopard', f: 'Ferocious Leopard', A: 'Reverse Chariot', a: 'Reverse Chariot', T: 'Blind Tiger', t: 'Blind Tiger', O: 'Kirin', o: 'Kirin', X: 'Phoenix', x: 'Phoenix', M: 'Side Mover', m: 'Side Mover', V: 'Vertical Mover', v: 'Vertical Mover', H: 'Dragon Horse', h: 'Dragon Horse', D: 'Dragon King', d: 'Dragon King', N: 'Lion', n: 'Lion', Q: 'Queen', q: 'Queen', I: 'Go-Between', i: 'Go-Between' }, setupDesc: '46 pieces per side, 21 types', variantDesc: 'Historical 12x12. Lion (double-mover), Drunk Elephant promotes to Crown Prince. No drops. Extinction royalty.' },
      'dai-shogi': { label: 'Dai Shogi (15×15)', boardStyle: 'shogi', rows: 15, cols: 15, tileSize: 22, pieceSetOverride: 'mce-shogi-fairy', fen: '[ln][kn][st][ig][cg][sg][gg][ki][gg][sg][cg][ig][st][kn][ln]/[rc]1[ct]1[fl]1[bt][de][bt]1[fl]1[ct]1[rc]/1[vo]1[ab]1[ew][ph][li][kr][ew]1[ab]1[vo]1/[rk][fy][sm][vm][bi][dh][dk][fk][dk][dh][bi][vm][sm][fy][rk]/[pw][pw][pw][pw][gb][pw][pw][pw][pw][pw][gb][pw][pw][pw][pw]/15/15/15/15/15/[PW][PW][PW][PW][GB][PW][PW][PW][PW][PW][GB][PW][PW][PW][PW]/[RK][FY][SM][VM][BI][DH][DK][FK][DK][DH][BI][VM][SM][FY][RK]/1[VO]1[AB]1[EW][KR][LI][PH][EW]1[AB]1[VO]1/[RC]1[CT]1[FL]1[BT][DE][BT]1[FL]1[CT]1[RC]/[LN][KN][ST][IG][CG][SG][GG][KI][GG][SG][CG][IG][ST][KN][LN]', pieceNames: { LN: 'Lance', KN: 'Knight', ST: 'Stone General', IG: 'Iron General', CG: 'Copper General', SG: 'Silver General', GG: 'Gold General', KI: 'King', DE: 'Drunk Elephant', RC: 'Reverse Chariot', CT: 'Cat Sword', FL: 'Ferocious Leopard', BT: 'Blind Tiger', VO: 'Violent Ox', AB: 'Angry Boar', EW: 'Evil Wolf', KR: 'Kirin', LI: 'Lion', PH: 'Phoenix', RK: 'Rook', FY: 'Flying Dragon', SM: 'Side Mover', VM: 'Vertical Mover', BI: 'Bishop', DH: 'Dragon Horse', DK: 'Dragon King', FK: 'Free King', PW: 'Pawn', GB: 'Go-Between' }, setupDesc: '63 pieces per side, 29 types', variantDesc: 'Historical 15x15. Lion, Drunk Elephant promotes to Crown Prince. No drops. Precursor to standard Shogi.' },
      dobutsu: { label: 'Dobutsu Shogi (3×4)', boardStyle: 'shogi', rows: 4, cols: 3, tileSize: 50, pieceSetOverride: 'mce-shogi-fairy', fen: 'gle/1c1/1C1/ELG', pieceNames: { G: 'Giraffe', g: 'Giraffe', L: 'Lion', l: 'Lion', E: 'Elephant', e: 'Elephant', C: 'Chick', c: 'Chick', H: 'Hen', h: 'Hen' }, setupDesc: '4 animals per side', variantDesc: 'Animal Shogi for children. 3x4. Lion, Giraffe, Elephant, Chick. Drops. Solved: second player wins perfectly.' },
      'four-player-shogi': { label: 'Four-Player Shogi', boardStyle: 'checkered', rows: 15, cols: 15, tileSize: 22, cellMap: buildCrossShapeMap(15, 15, 9), colors: { voidFill: 'transparent', lightSquare: '#f0d9b5', darkSquare: '#b58863' }, fen4: '3,yR,yN,yS,yG,yK,yG,yS,yN,yR,3/3,1,yB,5,yR,1,3/3,yP,yP,yP,yP,yP,yP,yP,yP,yP,3/rR,1,rP,9,bP,1,bR/rN,rR,rP,9,bP,bB,bN/rS,1,rP,9,bP,1,bS/rG,1,rP,9,bP,1,bG/rK,1,rP,9,bP,1,bK/rG,1,rP,9,bP,1,bG/rS,1,rP,9,bP,1,bS/rN,rB,rP,9,bP,bR,bN/rR,1,rP,9,bP,1,bR/3,gP,gP,gP,gP,gP,gP,gP,gP,gP,3/3,1,gR,5,gB,1,3/3,gR,gN,gS,gG,gK,gG,gS,gN,gR,3', pieceSet4: 'mce-4player-shogi', pieceRotations: { red: 90, yellow: 180, blue: 270, green: 0 }, pieceNames: { K: 'King', G: 'Gold', S: 'Silver', N: 'Knight', L: 'Lance', R: 'Rook', B: 'Bishop', P: 'Pawn' }, setupDesc: '4 armies on 15×15 cross-shaped board', variantDesc: '4 standard Shogi armies on cross-shaped board. Team or free-for-all. Drops go to own territory only. Michael Shipley, 1999.' },
      'gorogoro-plus': { label: 'Gorogoro+ (5×6)', boardStyle: 'shogi', rows: 6, cols: 5, tileSize: 40, fen: 'sgkgs/5/1ppp1/1PPP1/5/SGKGS', setupDesc: '6 pieces on board + hand pieces', variantDesc: '5x6 Shogi. No Rook/Bishop. Knight+Lance start in hand. Promotion zone last 2 ranks.' },
      'heian-shogi': { label: 'Heian Shogi (9×8)', boardStyle: 'shogi', rows: 8, cols: 9, tileSize: 36, fen: 'lnsgkgsnl/9/ppppppppp/9/9/PPPPPPPPP/9/LNSGKGSNL', setupDesc: '16 pieces each', variantDesc: 'Earliest Japanese chess (~8th-9th century). 9x8. No drops. No Rook/Bishop. All non-King promote to Gold.' },
      'hex-shogi-91': { label: 'Hex Shogi 91', boardStyle: 'hex', hexRadius: 5, hexSize: 22, flat: false, hexColorFn: glinskiColor, pieceSetOverride: 'kahu-shogi-international', hexPosition: buildHexPositionExplicit([
        ['L', -5, 5], ['N', -4, 5], ['G', -3, 5], ['G', -2, 5], ['N', -1, 5], ['L', 0, 5],
        ['R', -4, 4], ['S', -3, 4], ['K', -2, 4], ['S', -1, 4], ['B', 0, 4],
        ['P', -5, 2], ['P', -4, 2], ['P', -3, 2], ['P', -2, 2], ['P', -1, 2], ['P', 0, 2], ['P', 1, 2], ['P', 2, 2], ['P', 3, 2],
      ], [
        ['l', 5, -5], ['n', 4, -5], ['g', 3, -5], ['g', 2, -5], ['n', 1, -5], ['l', 0, -5],
        ['r', 4, -4], ['s', 3, -4], ['k', 2, -4], ['s', 1, -4], ['b', 0, -4],
        ['p', 5, -2], ['p', 4, -2], ['p', 3, -2], ['p', 2, -2], ['p', 1, -2], ['p', 0, -2], ['p', -1, -2], ['p', -2, -2], ['p', -3, -2],
      ]), pieceNames: { K: 'King', k: 'King', G: 'Gold', g: 'Gold', S: 'Silver', s: 'Silver', N: 'Knight', n: 'Knight', L: 'Lance', l: 'Lance', R: 'Rook', r: 'Rook', B: 'Bishop', b: 'Bishop', P: 'Pawn', p: 'Pawn' }, colors: { lightHex: '#d4a76a', darkHex: '#8b6535', midHex: '#b88b50', stroke: 'rgba(0,0,0,0.2)', background: '#3a2a1a' }, buildLayout(rows, cols, tileSize, colors) { return buildHexagonalLayout(generateHexGrid(5), 22, 'pointy', colors, { hexColorFn: glinskiColor }) }, setupDesc: '20 pieces per side on 91-hex board (positions approximate)', variantDesc: 'Shogi on 91-hex Glinski board. Drops with hex-specific Pawn rules. 4-rank promotion zone. Fergus Duniho. SETUP NEEDS VERIFICATION.' },
      'judkins-shogi': { label: 'Judkins Shogi (6×6)', boardStyle: 'shogi', rows: 6, cols: 6, tileSize: 40, fen: 'rbsgkn/5p/6/6/P5/NKGSBR', setupDesc: '7 pieces per side', variantDesc: '6x6 miniature Shogi. Drops. Promotion zone last 2 ranks. Paul Judkins, 1998.' },
      'maka-dai-dai-shogi': { label: 'Maka-Dai-Dai (19×19)', boardStyle: 'shogi', rows: 19, cols: 19, tileSize: 18, pieceSetOverride: 'mce-shogi-fairy', fen: '[ln][eg][st][tg][ig][cg][sg][gg][ds][ki][dv][gg][sg][cg][ig][tg][st][eg][ln]/[rc]1[ct]1[bm]1[rd][fl][bt][de][bt][fl][co]1[cc]1[ct]1[rc]/1[or]1[ab]1[bb]1[ew][ph][li][kr][ew]1[bb]1[ab]1[or]1/[dy][kn]1[vo]1[fy]1[sd][gd][ld][wr][bv][fy]1[vo]1[kn]1[dy]/[rk][rt][sm][sf][vm][bi][dh][dk][hm][fk][cp][dk][dh][bi][vm][sf][sm][lc][rk]/[pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw]/5[gb]7[gb]5/19/19/19/19/19/5[GB]7[GB]5/[PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW]/[RK][LC][SM][SF][VM][BI][DH][DK][CP][FK][HM][DK][DH][BI][VM][SF][SM][RT][RK]/[DY]1[KN]1[VO]1[FY][BV][WR][LD][GD][SD]1[FY]1[VO]1[KN][DY]/1[OR]1[AB]1[BB]1[EW][KR][LI][PH][EW]1[BB]1[AB]1[OR]1/[RC]1[CT]1[CC]1[CO][FL][BT][DE][BT][FL][RD]1[BM]1[CT]1[RC]/[LN][EG][ST][TG][IG][CG][SG][GG][DV][KI][DS][GG][SG][CG][IG][TG][ST][EG][LN]', pieceNames: { LN: 'Lance', EG: 'Earth General', ST: 'Stone General', TG: 'Tile General', IG: 'Iron General', CG: 'Copper General', SG: 'Silver General', GG: 'Gold General', DV: 'Deva', KI: 'King', DS: 'Dark Spirit', RC: 'Reverse Chariot', CT: 'Cat Sword', CC: 'Chinese Cock', CO: 'Coiled Serpent', FL: 'Ferocious Leopard', BT: 'Blind Tiger', DE: 'Drunk Elephant', RD: 'Reclining Dragon', BM: 'Blind Monkey', OR: 'Old Rat', AB: 'Angry Boar', BB: 'Blind Bear', EW: 'Evil Wolf', KR: 'Kirin', LI: 'Lion', PH: 'Phoenix', DY: 'Donkey', KN: 'Knight', VO: 'Violent Ox', FY: 'Flying Dragon', BV: 'Buddhist Devil', WR: 'Wrestler', LD: 'Lion Dog', GD: 'Guardian of the Gods', SD: 'She-Devil', RK: 'Rook', LC: 'Left Chariot', SM: 'Side Mover', SF: 'Side Flyer', VM: 'Vertical Mover', BI: 'Bishop', DH: 'Dragon Horse', DK: 'Dragon King', CP: 'Capricorn', FK: 'Queen', HM: 'Hook Mover', RT: 'Right Chariot', PW: 'Pawn', GB: 'Go-Between' }, setupDesc: '96 pieces per side, 50 types', variantDesc: 'Historical 19x19. Contagious promotion. Emperor leaps anywhere. Largest well-documented pre-modern shogi.' },
      minishogi: { label: 'Minishogi (5×5)', boardStyle: 'shogi', rows: 5, cols: 5, tileSize: 40, fen: 'rbsgk/4p/5/P4/KGSBR', setupDesc: '6 pieces each on a 5x5 board', variantDesc: 'Standard Shogi on a 5x5 board. Single-rank promotion zone. No Knights or Lances.' },
      'mortal-shogi': { label: 'Mortal Shogi (9×9)', boardStyle: 'shogi', rows: 9, cols: 9, tileSize: 36, fen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL', setupDesc: 'Standard Shogi position', variantDesc: 'Captured pieces demote one rank down fixed chain. Pawns removed permanently. Drops use demoted type.' },
      'kyoto-shogi': { label: 'Kyoto Shogi (5×5)', boardStyle: 'shogi', rows: 5, cols: 5, tileSize: 40, fen: 'pgskl/5/5/5/LKSGP', setupDesc: '5 pieces each on back rank', variantDesc: 'Every piece except the King flips to its alternate face after each move.' },
      'hasami-shogi': { label: 'Hasami Shogi (9×9)', boardStyle: 'shogi', rows: 9, cols: 9, tileSize: 36, fen: 'ppppppppp/9/9/9/9/9/9/9/PPPPPPPPP', setupDesc: '9 pawns each on back rank', variantDesc: 'Custodial sandwich capture. No drops, no promotion. All pieces are identical.' },
      'sho-shogi': { label: 'Sho Shogi (9×9)', boardStyle: 'shogi', rows: 9, cols: 9, tileSize: 36, pieceSetOverride: 'mce-shogi-fairy', fen: 'lnsgkgsnl/1r2e2b1/ppppppppp/9/9/9/PPPPPPPPP/1B2E2R1/LNSGKGSNL', pieceNames: { E: 'Drunk Elephant', e: 'Drunk Elephant' }, setupDesc: '21 pieces each (standard + Drunk Elephant)', variantDesc: '16th-century predecessor to Shogi. Drunken Elephant promotes to Crown Prince (second royal). No drops.' },
      'tai-shogi': { label: 'Tai Shogi (25×25)', boardStyle: 'shogi', rows: 25, cols: 25, tileSize: 14, pieceSetOverride: 'mce-shogi-fairy', fen: '[ln][wt][wl][fy][lo][dw][rk][dh][dk][fk][gg][ds][em][dv][gg][fk][dk][dh][rk][dw][lo][fy][wl][ts][ln]/[rc][si][se][kn][ps][ft][bi][fe][we][fr][sg][rg][cr][lg][sg][fr][we][fe][bi][ft][ps][kn][se][si][rc]/[sc][wh][rs][vo][cs][bb][sv][gl][bm][bt][sd][gd][nk][wr][bv][bt][bm][gl][sv][bb][cs][vo][rs][wh][sc]/[sl][wb][fl][nb][su][cc][hf][om][rb][pc][go][ph][li][kr][gt][pc][ok][om][hf][cc][eb][ws][fl][wb][sl]/[rc][vs][wo][eg][st][tg][ig][cg][or][co][rd][hm][de][cp][rd][co][or][cg][ig][tg][st][eg][wo][bd][lc]/[hd][fh][en][dy][fo][sm][vm][vb][sb][pr][ab][ew][ld][ew][ab][pr][sb][vb][vm][sm][fo][dy][en][fh][hd]/[pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw]/7[gb]9[gb]7/25/25/25/25/25/25/25/25/25/7[GB]9[GB]7/[PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW]/[HD][FH][EN][DY][FO][SM][VM][VB][SB][PR][AB][EW][LD][EW][AB][PR][SB][VB][VM][SM][FO][DY][EN][FH][HD]/[LC][BD][WO][EG][ST][TG][IG][CG][OR][CO][RD][CP][DE][HM][RD][CO][OR][CG][IG][TG][ST][EG][WO][VS][RC]/[SL][WB][FL][WS][EB][CC][HF][OM][OK][PC][GT][KR][LI][PH][GO][PC][RB][OM][HF][CC][SU][NB][FL][WB][SL]/[SC][WH][RS][VO][CS][BB][SV][GL][BM][BT][BV][WR][NK][GD][SD][BT][BM][GL][SV][BB][CS][VO][RS][WH][SC]/[RC][SI][SE][KN][PS][FT][BI][FE][WE][FR][SG][LG][CR][RG][SG][FR][WE][FE][BI][FT][PS][KN][SE][SI][RC]/[LN][TS][WL][FY][LO][DW][RK][DH][DK][FK][GG][DV][EM][DS][GG][FK][DK][DH][RK][DW][LO][FY][WL][WT][LN]', pieceNames: { LN: 'Lance', TS: 'Turtle Snake', WL: 'Whale', FY: 'Flying Dragon', LO: 'Long-Nosed Goblin', DW: 'Dove', RK: 'Rook', DH: 'Dragon Horse', DK: 'Dragon King', FK: 'Queen', GG: 'Gold General', DV: 'Deva', EM: 'Emperor', DS: 'Dark Spirit', RC: 'Reverse Chariot', SI: 'Side Dragon', SE: 'Soaring Eagle', KN: 'Knight', PS: 'Poison Snake', FT: 'Free Tapir', BI: 'Bishop', FE: 'Fierce Eagle', WE: 'White Elephant', FR: 'Free Demon', SG: 'Silver General', LG: 'Left General', CR: 'Crown Prince', RG: 'Right General', SC: 'Racing Chariot', WH: 'White Horse', RS: "Ram's-Head Soldier", VO: 'Violent Ox', CS: 'Cat Sword', BB: 'Blind Bear', SV: 'Silver Hare', GL: 'Golden Deer', BM: 'Blind Monkey', BT: 'Blind Tiger', BV: 'Buddhist Devil', WR: 'Wrestler', NK: 'Neighboring King', GD: 'Guardian of the Gods', SD: 'She-Devil', SL: 'Soldier', WB: 'Water Buffalo', FL: 'Ferocious Leopard', WS: 'Western Barbarian', EB: 'Eastern Barbarian', CC: 'Chinese Cock', HF: 'Horned Falcon', OM: 'Old Monkey', OK: 'Old Kite', PC: 'Peacock', GT: 'Great Dragon', KR: 'Kirin', LI: 'Lion', PH: 'Phoenix', GO: 'Golden Bird', RB: 'Rushing Bird', NB: 'Northern Barbarian', SU: 'Southern Barbarian', LC: 'Left Chariot', BD: 'Blue Dragon', WO: 'Wood General', EG: 'Earth General', ST: 'Stone General', TG: 'Tile General', IG: 'Iron General', CG: 'Copper General', OR: 'Old Rat', CO: 'Coiled Serpent', RD: 'Reclining Dragon', CP: 'Capricorn', DE: 'Drunk Elephant', HM: 'Hook Mover', VS: 'Vermillion Sparrow', HD: 'Howling Dog', FH: 'Flying Horse', EN: 'Enchanted Badger', DY: 'Donkey', FO: 'Flying Ox', SM: 'Side Mover', VM: 'Vertical Mover', VB: 'Violent Bear', SB: 'Standard Bearer', PR: 'Prancing Stag', AB: 'Angry Boar', EW: 'Evil Wolf', LD: 'Lion Dog', PW: 'Pawn', GB: 'Go-Between', WT: 'White Tiger' }, setupDesc: '177 pieces per side, 92 types', variantDesc: 'Historical 25x25. Largest variant with fully documented movements. Games last thousands of moves.' },
      'taikyoku-shogi': { label: 'Taikyoku Shogi (36×36)', boardStyle: 'shogi', rows: 36, cols: 36, tileSize: 10, pieceSetOverride: 'mce-shogi-fairy', fen: '[ln][wt][rq][wl][fd][me][lo][bc][rh][fr][ed][dn][ft][fk][re][rg][gg][cr][ki][gg][lg][re][fk][ft][cd][ed][fr][rh][bc][lo][me][fd][wl][rq][ts][ln]/[rc][fp][md][fs][cf][ra][fm][ms][rp][rn][ss][gv][rj][ru][ns][gd][sg][de][nk][sg][wr][bv][ru][rj][gv][ss][rn][rp][ms][fm][ra][cf][fs][md][we][rc]/[gc][sd][rf][rl][bg][rr][rv][ri][bo][wn][fu][rb][ok][pc][wq][fi][cg][pm][km][cg][fi][wq][pc][ok][rb][fu][wn][bo][la][lt][rr][bg][rl][rf][sd][gc]/[sa][vb][kn][pg][ck][pu][hg][og][ct][si][sr][gl][li][ca][gs][vd][wx][vg][gr][wx][vd][gs][ca][li][gl][sr][si][ct][og][hg][pu][ck][pg][kn][vb][sa]/[tc][ce][bi][rk][sw][fa][mf][vr][sl][ll][cl][cu][rx][rs][vo][gt][go][ds][dv][go][gt][vo][rs][rx][cu][cl][ll][sl][vr][mf][fa][sw][rk][bi][ce][tc]/[wc][wh][hr][sm][pr][wb][fl][fe][fy][ps][fn][sc][bl][wg][fg][ph][hm][lu][gu][cp][ky][fg][wg][bl][sc][fn][ps][fy][fe][fl][wb][pr][sm][hl][wh][wc]/[tl][vw][sx][dy][fh][vi][ab][ew][lh][fc][om][cc][nb][su][va][vf][tf][cn][rm][tf][vf][va][eb][ws][cc][om][fc][lh][ew][ab][vi][fh][dy][sx][vw][tl]/[ec][vs][en][hn][so][cm][cs][wi][bm][bt][oc][sf][bb][or][sq][co][rd][fq][lw][rd][co][sq][or][bb][sf][oc][bt][bm][wi][cs][cm][so][hn][en][bd][ec]/[ch][sn][vt][wf][rw][mg][ff][hs][wo][os][eg][bs][st][ls][tg][ba][ig][ga][gm][ig][ba][tg][ls][st][bs][eg][os][wo][hs][ff][mg][rw][wf][vt][sn][ch]/[rt][sk][vm][fo][lb][vp][vh][bu][dh][dk][wd][hf][se][sp][vl][sv][sb][ro][ld][sb][sv][vl][sp][se][hf][wd][dk][dh][bu][vh][vp][lb][fo][vm][sk][lc]/[pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw]/5[dg]4[gb]3[dg]6[dg]3[gb]4[dg]5/36/36/36/36/36/36/36/36/36/36/36/36/5[DG]4[GB]3[DG]6[DG]3[GB]4[DG]5/[PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW]/[LC][SK][VM][FO][LB][VP][VH][BU][DH][DK][WD][HF][SE][SP][VL][SV][SB][LD][RO][SB][SV][VL][SP][SE][HF][WD][DK][DH][BU][VH][VP][LB][FO][VM][SK][RT]/[CH][SN][VT][WF][RW][MG][FF][HS][WO][OS][EG][BS][ST][LS][TG][BA][IG][GM][GA][IG][BA][TG][LS][ST][BS][EG][OS][WO][HS][FF][MG][RW][WF][VT][SN][CH]/[EC][BD][EN][HN][SO][CM][CS][WI][BM][BT][OC][SF][BB][OR][SQ][CO][RD][LW][FQ][RD][CO][SQ][OR][BB][SF][OC][BT][BM][WI][CS][CM][SO][HN][EN][VS][EC]/[TL][VW][SX][DY][FH][VI][AB][EW][LH][FC][OM][CC][WS][EB][VA][VF][TF][RM][CN][TF][VF][VA][SU][NB][CC][OM][FC][LH][EW][AB][VI][FH][DY][SX][VW][TL]/[WC][WH][HL][SM][PR][WB][FL][FE][FY][PS][FN][SC][BL][WG][FG][KY][CP][GU][LU][HM][PH][FG][WG][BL][SC][FN][PS][FY][FE][FL][WB][PR][SM][HR][WH][WC]/[TC][CE][BI][RK][SW][FA][MF][VR][SL][LL][CL][CU][RX][RS][VO][GT][GO][DV][DS][GO][GT][VO][RS][RX][CU][CL][LL][SL][VR][MF][FA][SW][RK][BI][CE][TC]/[SA][VB][KN][PG][CK][PU][HG][OG][CT][SI][SR][GL][LI][CA][GS][VD][WX][GR][VG][WX][VD][GS][CA][LI][GL][SR][SI][CT][OG][HG][PU][CK][PG][KN][VB][SA]/[GC][SD][RF][RL][BG][RR][LT][LA][BO][WN][FU][RB][OK][PC][WQ][FI][CG][KM][PM][CG][FI][WQ][PC][OK][RB][FU][WN][BO][RI][RV][RR][BG][RL][RF][SD][GC]/[RC][WE][MD][FS][CF][RA][FM][MS][RP][RN][SS][GV][RJ][RU][BV][WR][SG][NK][DE][SG][GD][NS][RU][RJ][GV][SS][RN][RP][MS][FM][RA][CF][FS][MD][FP][RC]/[LN][TS][RQ][WL][FD][ME][LO][BC][RH][FR][ED][CD][FT][FK][RE][LG][GG][KI][CR][GG][RG][RE][FK][FT][DN][ED][FR][RH][BC][LO][ME][FD][WL][RQ][WT][LN]', pieceNames: { AB: 'Angry Boar', BA: 'Bear Soldier', BC: 'Beast Cadet', BO: 'Beast Officer', BI: 'Bishop', BG: 'Bishop General', BB: 'Blind Bear', BL: 'Blind Dog', BM: 'Blind Monkey', BT: 'Blind Tiger', BD: 'Blue Dragon', BS: 'Boar Soldier', BV: 'Buddhist Devil', BU: 'Burning Soldier', CP: 'Capricorn', CA: 'Captive Cadet', CF: 'Captive Officer', CS: 'Cat Sword', CN: 'Center Master', CT: 'Center Standard', CD: 'Ceramic Dove', CH: 'Chariot Soldier', CK: 'Chicken General', CC: 'Chinese Cock', CM: 'Climbing Monkey', CL: 'Cloud Dragon', CE: 'Cloud Eagle', CO: 'Coiled Serpent', CU: 'Copper Chariot', CG: 'Copper General', CR: 'Crown Prince', DS: 'Dark Spirit', DV: 'Deva', DG: 'Dog', DY: 'Donkey', DH: 'Dragon Horse', DK: 'Dragon King', DE: 'Drunk Elephant', EC: 'Earth Chariot', ED: 'Earth Dragon', EG: 'Earth General', EB: 'Eastern Barbarian', EN: 'Enchanted Badger', EW: 'Evil Wolf', FL: 'Ferocious Leopard', FE: 'Fierce Eagle', FD: 'Fire Demon', FI: 'Fire Dragon', FG: 'Fire General', FA: 'Flying Cat', FC: 'Flying Cock', FY: 'Flying Dragon', FN: 'Flying Goose', FH: 'Flying Horse', FO: 'Flying Ox', FS: 'Flying Swallow', FM: 'Forest Demon', FP: 'Fragrant Elephant', FR: 'Free Demon', FQ: 'Free Eagle', FK: 'Free King', FU: 'Free Pup', FT: 'Free Tapir', FF: 'Front Standard', GB: 'Go-Between', GC: 'Gold Chariot', GG: 'Gold General', GO: 'Golden Bird', GL: 'Golden Deer', GV: 'Great Dove', GT: 'Great Dragon', GR: 'Great General', GM: 'Great Master', GS: 'Great Stag', GA: 'Great Standard', GU: 'Great Turtle', GD: 'Guardian of the Gods', HM: 'Hook Mover', HF: 'Horned Falcon', HG: 'Horse General', HS: 'Horse Soldier', HN: 'Horseman', HL: 'Howling Dog (Left)', HR: 'Howling Dog (Right)', IG: 'Iron General', KI: 'King', KN: 'Knight', KY: 'Kylin', KM: 'Kylin Master', LN: 'Lance', LC: 'Left Chariot', LA: 'Left Dragon', LG: 'Left General', LT: 'Left Tiger', LS: 'Leopard Soldier', LH: 'Liberated Horse', LI: 'Lion', LD: 'Lion Dog', LW: 'Lion Hawk', LL: 'Little Standard', LU: 'Little Turtle', LO: 'Long-Nosed Goblin', LB: 'Longbow Soldier', MD: 'Mountain Dove', ME: 'Mountain Eagle', MF: 'Mountain Falcon', MG: 'Mountain General', MS: 'Mountain Stag', NK: 'Neighboring King', NS: 'Night Sword', NB: 'Northern Barbarian', OK: 'Old Kite Hawk', OM: 'Old Monkey', OR: 'Old Rat', OC: 'Ox Cart', OG: 'Ox General', OS: 'Ox Soldier', PW: 'Pawn', PC: 'Peacock', PH: 'Phoenix', PM: 'Phoenix Master', PG: 'Pig General', PS: 'Poisonous Snake', PR: 'Prancing Stag', PU: 'Pup General', RA: 'Rain Dragon', RS: 'Ramshead Soldier', RE: 'Rear Standard', RD: 'Reclining Dragon', RC: 'Reverse Chariot', RT: 'Right Chariot', RI: 'Right Dragon', RG: 'Right General', RV: 'Right Tiger', RW: 'River General', RO: 'Roaring Dog', RM: 'Roc Master', RK: 'Rook', RR: 'Rook General', RU: 'Running Bear', RX: 'Running Chariot', RH: 'Running Horse', RP: 'Running Pup', RQ: 'Running Rabbit', RN: 'Running Serpent', RF: 'Running Stag', RJ: 'Running Tiger', RL: 'Running Wolf', RB: 'Rushing Bird', SV: 'Savage Tiger', SB: 'Shortbow Soldier', SI: 'Side Boar', SD: 'Side Dragon', SF: 'Side Flier', SK: 'Side Monkey', SM: 'Side Mover', SX: 'Side Ox', SS: 'Side Serpent', SN: 'Side Soldier', SW: 'Side Wolf', SA: 'Silver Chariot', SG: 'Silver General', SR: 'Silver Rabbit', SE: 'Soaring Eagle', SL: 'Soldier', SU: 'Southern Barbarian', SP: 'Spear Soldier', SQ: 'Square Mover', TC: 'Stone Chariot', ST: 'Stone General', SC: 'Strutting Crow', WI: 'Swallow\'s Wings', SO: 'Swooping Owl', WD: 'Sword Soldier', TL: 'Tile Chariot', TG: 'Tile General', TF: 'Treacherous Fox', TS: 'Turtle Snake', VS: 'Vermillion Sparrow', VB: 'Vertical Bear', VH: 'Vertical Horse', VL: 'Vertical Leopard', VM: 'Vertical Mover', VP: 'Vertical Pup', VT: 'Vertical Soldier', VR: 'Vertical Tiger', VW: 'Vertical Wolf', VG: 'Vice General', VI: 'Violent Bear', VD: 'Violent Dragon', VO: 'Violent Ox', VA: 'Violent Stag', VF: 'Violent Wolf', WB: 'Water Buffalo', WQ: 'Water Dragon', WG: 'Water General', WS: 'Western Barbarian', WL: 'Whale', WE: 'White Elephant', WH: 'White Horse', WT: 'White Tiger', WN: 'Wind Dragon', WF: 'Wind General', WC: 'Wood Chariot', WO: 'Wood General', DN: 'Wooden Dove', WX: 'Woodland Demon', WR: 'Wrestler' }, setupDesc: '402 pieces per side, 208 types', variantDesc: 'Largest chess variant ever documented. 36x36. ~10,000+ moves per game. 208 piece types. L. Lynn Smith transcription.' },
      'tenjiku-shogi': { label: 'Tenjiku Shogi (16×16)', boardStyle: 'shogi', rows: 16, cols: 16, tileSize: 20, pieceSetOverride: 'mce-shogi-fairy', fen: '[ln][kn][fl][ig][cg][sg][gg][de][ki][gg][sg][cg][ig][fl][kn][ln]/[rc]1[cs][cs]1[bt][ph][fk][li][kr][bt]1[cs][cs]1[rc]/[ss][vt][bi][dh][dk][wb][fd][fe][lw][fd][wb][dk][dh][bi][vt][ss]/[sm][vm][rk][hf][se][bg][rg][vg][gr][rg][bg][se][hf][rk][vm][sm]/[pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw][pw]/4[dg]6[dg]4/16/16/16/16/4[DG]6[DG]4/[PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW][PW]/[SM][VM][RK][HF][SE][BG][RG][GR][VG][RG][BG][SE][HF][RK][VM][SM]/[SS][VT][BI][DH][DK][WB][FD][LW][FE][FD][WB][DK][DH][BI][VT][SS]/[RC]1[CS][CS]1[BT][KR][LI][FK][PH][BT]1[CS][CS]1[RC]/[LN][KN][FL][IG][CG][SG][GG][KI][DE][GG][SG][CG][IG][FL][KN][LN]', pieceNames: { LN: 'Lance', KN: 'Knight', FL: 'Ferocious Leopard', IG: 'Iron General', CG: 'Copper General', SG: 'Silver General', GG: 'Gold General', KI: 'King', DE: 'Drunk Elephant', RC: 'Reverse Chariot', CS: 'Chariot Soldier', BT: 'Blind Tiger', KR: 'Kirin', LI: 'Lion', FK: 'Free King', PH: 'Phoenix', SS: 'Side Soldier', VT: 'Vertical Soldier', BI: 'Bishop', DH: 'Dragon Horse', DK: 'Dragon King', WB: 'Water Buffalo', FD: 'Fire Demon', LW: 'Lion Hawk', FE: 'Free Eagle', SM: 'Side Mover', VM: 'Vertical Mover', RK: 'Rook', HF: 'Horned Falcon', SE: 'Soaring Eagle', BG: 'Bishop General', RG: 'Rook General', GR: 'Great General', VG: 'Vice General', PW: 'Pawn', DG: 'Dog' }, setupDesc: '78 pieces per side, 36 types', variantDesc: 'Medieval 16x16. Fire Demons burn adjacent enemies. Jumping generals. No drops. Extinction royalty.' },
      'tori-shogi': { label: 'Tori Shogi (7×7)', boardStyle: 'shogi', rows: 7, cols: 7, tileSize: 40, pieceSetOverride: 'mce-shogi-fairy', fen: 'rpckcpl/3f3/sssssss/2s1S2/SSSSSSS/3F3/LPCKCPR', pieceNames: { C: 'Crane', c: 'Crane', F: 'Falcon', f: 'Falcon', P: 'Pheasant', p: 'Pheasant', R: 'Right Quail', r: 'Right Quail', L: 'Left Quail', l: 'Left Quail', S: 'Swallow', s: 'Swallow', K: 'Phoenix', k: 'Phoenix', G: 'Goose', g: 'Goose' }, setupDesc: '16 bird pieces per side', variantDesc: 'Bird Shogi (1799). 7x7. Drops. Only Swallow and Falcon promote. Repetition = loss for causer.' },
      'wa-shogi': { label: 'Wa Shogi (11×11)', boardStyle: 'shogi', rows: 11, cols: 11, tileSize: 30, pieceSetOverride: 'mce-shogi-fairy', fen: '[lh][cm][so][fc][vs][ck][vw][fg][sc][bd][oc]/1[ce]3[sw]3[ff]1/[sp][sp][sp][rr][sp][sp][sp][tf][sp][sp][sp]/3[sp]3[sp]3/11/11/11/3[SP]3[SP]3/[SP][SP][SP][TF][SP][SP][SP][RR][SP][SP][SP]/1[FF]3[SW]3[CE]1/[OC][BD][SC][FG][VW][CK][VS][FC][SO][CM][LH]', pieceNames: { CK: 'Crane King', OC: 'Oxcart', BD: 'Blind Dog', SC: 'Strutting Crow', FG: 'Flying Goose', VW: 'Violent Wolf', VS: 'Violent Stag', FC: 'Flying Cock', SO: 'Swooping Owl', CM: 'Climbing Monkey', LH: 'Liberated Horse', FF: 'Flying Falcon', SW: "Swallow's Wings", CE: 'Cloud Eagle', TF: 'Treacherous Fox', RR: 'Running Rabbit', SP: 'Sparrow Pawn' }, setupDesc: '23 pieces per side, 17 types', variantDesc: 'Japanese 11x11. All non-Pawn pieces unique. Capture Crane King wins. Historical (no drops) or modern (with drops).' },
      'yari-shogi': { label: 'Yari Shogi (7×9)', boardStyle: 'shogi', rows: 9, cols: 7, tileSize: 36, pieceSetOverride: 'mce-shogi-fairy', fen: 'ynnkbby/7/ppppppp/7/7/7/PPPPPPP/7/YBBKNNY', pieceNames: { Y: 'Forward Rook', y: 'Forward Rook', B: 'Yari Bishop', b: 'Yari Bishop', N: 'Yari Knight', n: 'Yari Knight', K: 'General', k: 'General' }, setupDesc: '9 pieces per side on 7×9', variantDesc: '7x9. All unpromoted pieces include forward-Lance movement. Pawn drops can checkmate (unlike standard Shogi). Christian Freeling, 1981.' },
    },
  },
  morris: {
    label: 'Morris',
    pieceSet: 'playstrategy-go-classic',
    buildLayout(rows, cols, tileSize, colors, config) {
      return generateMorrisLayout(config.rings || 3, config.boardSize || 320, { diagonals: config.diagonals, midpoints: config.midpoints, colors })
    },
    variants: {
      'nine-mens-morris': { label: "Nine Men's Morris", boardStyle: 'morris', boardSize: 320, rings: 3, setupDesc: '9 pieces each, placed alternately on intersections', variantDesc: 'Three concentric squares joined at midpoints. Flying allowed when reduced to 3 pieces.' },
      'six-mens-morris': { label: "Six Men's Morris", boardStyle: 'morris', boardSize: 260, rings: 2, setupDesc: '6 pieces each, placed alternately on intersections', variantDesc: 'Two concentric squares with connecting lines. Medieval European standard before Nine Men\'s Morris.' },
      'twelve-mens-morris': { label: "Twelve Men's Morris", boardStyle: 'morris', boardSize: 320, rings: 3, diagonals: true, setupDesc: '12 pieces each, placed alternately on intersections', variantDesc: 'Same board as Nine Men\'s Morris but with corner diagonals. 12 pieces per side. No flying rule.' },
      'three-mens-morris': { label: "Three Men's Morris", boardStyle: 'morris', boardSize: 200, rings: 1, setupDesc: '3 pieces each, placed alternately', variantDesc: 'Smallest Mill variant. No movement phase; pieces jump to any empty square.' },
      'lasker-morris': { label: 'Lasker Morris', boardStyle: 'morris', boardSize: 320, rings: 3, setupDesc: '10 pieces each, placed or moved each turn', variantDesc: 'Each turn: either place a new piece OR move an existing piece. No sequential placement phase.' },
      morabaraba: { label: 'Morabaraba', boardStyle: 'morris', boardSize: 320, rings: 3, diagonals: true, setupDesc: '12 cows each, placed alternately on intersections', variantDesc: 'South African national game. Cows instead of men. Special rules for the three-cow endgame.' },
      shax: { label: 'Shax', boardStyle: 'morris', boardSize: 320, rings: 3, setupDesc: '12 pieces each, placed alternately on intersections', variantDesc: 'Somali variant: during placement, mills do not remove opponent pieces. Captures only during movement.' },
    },
  },
  fanorona: {
    label: 'Fanorona',
    pieceSet: 'playstrategy-go-classic',
    buildLayout(rows, cols, tileSize, colors) {
      return buildIntersectionGridLayout(rows, cols, tileSize, colors, { diagonals: 'alternating' })
    },
    variants: {
      standard: { label: 'Standard (5×9)', boardStyle: 'alquerque', rows: 5, cols: 9, tileSize: 40, colors: { monoSquare: '#d4a96a', gridLine: '#7a4510', whitePieceFill: '#f0e8d0', whitePieceStroke: '#7a4510', blackPieceFill: '#1e1000', blackPieceStroke: '#c8963c' }, fanoronaSetup: true, setupDesc: '22 per side, all intersections except center', variantDesc: 'Malagasy war game. Capture by approach or withdrawal. Chain captures in one turn.' },
    },
  },
  backgammon: {
    label: 'Backgammon',
    pieceSet: 'playstrategy-draughts-plain',
    buildLayout(rows, cols, tileSize, colors, config) {
      return { style: 'points', totalPoints: 24 }
    },
    variants: {
      standard: { label: 'Standard', boardStyle: 'backgammon', setupDesc: '15 checkers each: 2 on point 24/1, 5 on 13/12, 3 on 8/17, 5 on 6/19', variantDesc: 'Standard backgammon. Move all checkers to home board and bear off. Doubling cube in use.', setup: '0:2W,5:5B,7:3B,11:5W,12:5B,16:3W,18:5W,23:2B' },
      nackgammon: { label: 'Nackgammon', boardStyle: 'backgammon', setupDesc: '15 checkers each: 2 on 24/1, 2 on 23/2, 5 on 13/12, 3 on 8/17, 3 on 6/19', variantDesc: 'Nack Ballard variant. Two extra back checkers make priming harder and increase contact.', setup: '0:2W,1:2W,5:3B,7:3B,11:5W,12:5B,16:3W,18:3W,22:2B,23:2B' },
      'acey-deucey': { label: 'Acey-Deucey', boardStyle: 'backgammon', setupDesc: 'All 15 checkers off-board. Enter from opponent home board.', variantDesc: 'Military variant. All pieces start off-board. Roll acey-deucey (1-2) for bonus turn.', setup: 'home:15W,home:15B' },
      hypergammon: { label: 'Hypergammon', boardStyle: 'backgammon', setupDesc: '3 checkers each on points 24-22/1-3', variantDesc: 'Speed variant with only 3 pieces per player. High luck factor, quick games.', setup: '0:1W,1:1W,2:1W,21:1B,22:1B,23:1B' },
      plakoto: { label: 'Plakoto', boardStyle: 'backgammon', setupDesc: 'All 15 checkers on own point 1', variantDesc: 'Greek variant. Pin opponent by landing on their single checker. No hitting, only trapping.', setup: '0:15B,23:15W' },
      fevga: { label: 'Fevga', boardStyle: 'backgammon', setupDesc: 'All 15 checkers on own point 1', variantDesc: 'Greek variant. No hitting. Cannot block all 6 points in a row unless opponent has passed.', setup: '0:15B,12:15W' },
      nardi: { label: 'Nardi', boardStyle: 'backgammon', setupDesc: 'All 15 checkers on point 24/1', variantDesc: 'Russian long backgammon. No hitting. Both move same direction. Cannot block 6 consecutive.', setup: '0:15W,23:15B' },
      chouette: { label: 'Chouette', boardStyle: 'backgammon', setupDesc: 'Standard position. 1 player (Box) vs team (2+).', variantDesc: 'Multi-player format. Box plays alone against a team who share decisions. Losers rotate in.', setup: '0:2W,5:5B,7:3B,11:5W,12:5B,16:3W,18:5W,23:2B' },
    },
  },
  mancala: {
    label: 'Mancala',
    pieceSet: 'playstrategy-oware',
    buildLayout(rows, cols, tileSize, colors, config) {
      return {
        pitRadius: config.pitRadius || 22,
        storeRx: config.storeRx || 24,
        storeRy: config.storeRy || 50,
        boardShape: config.boardShape || 'rect',
        boardRows: config.boardRows || 2,
        pitCurve: config.pitCurve || 0,
        cornerRadius: config.cornerRadius,
        markers: config.markers || [],
        seedRadius: 5,
      }
    },
    variants: {
      kalah: { label: 'Kalah', boardStyle: 'mancala', pitsPerSide: 6, seedsPerPit: 4, hasStores: true, pitRadius: 22, storeRx: 24, storeRy: 50, colors: { boardOuter: '#7A5A32', boardInner: '#9B7740', pit: '#4E3320', pitStroke: '#3A2515', seed: '#C8B898', seedStroke: '#8A7A5A' }, setupDesc: '6 pits per side, 4 seeds each, 2 stores', variantDesc: 'Landing in own store grants extra turn. Capture opposite pit when landing in own empty pit.', setup: '4,4,4,4,4,4;0;4,4,4,4,4,4;0' },
      oware: { label: 'Oware', boardStyle: 'mancala', pitsPerSide: 6, seedsPerPit: 4, hasStores: false, pitRadius: 24, colors: { boardOuter: '#7A5A32', boardInner: '#9B7740', pit: '#4E3320', pitStroke: '#3A2515', seed: '#C8B898', seedStroke: '#8A7A5A' }, setupDesc: '6 pits per side, 4 seeds each, no stores', variantDesc: 'Capture seeds from opponent side when sowing ends in pit with 2 or 3 seeds. No extra turns.', setup: '4,4,4,4,4,4;0;4,4,4,4,4,4;0' },
      bao: { label: 'Bao', boardStyle: 'mancala', pitsPerSide: 8, seedsPerPit: 2, hasStores: false, boardRows: 4, pitRadius: 20, markers: [4, 27], colors: { boardOuter: '#6B4C28', boardInner: '#8A6538', pit: '#3E2410', pitStroke: '#2A1808', seed: '#C8B898', seedStroke: '#8A7A5A', marker: '#C49040' }, cornerRadius: 18, setupDesc: '4×8 board, 2 seeds in front rows only, nyumba pits marked', variantDesc: 'Multi-phase: placement then sowing. Capture by landing in occupied front-row pit. Nyumba is special reserve.', setup: '0,0,0,0,0,0,0,0,2,2,2,2,2,2,2,2;0;2,2,2,2,2,2,2,2,0,0,0,0,0,0,0,0;0' },
      congkak: { label: 'Congkak', boardStyle: 'mancala', pitsPerSide: 7, seedsPerPit: 7, hasStores: true, boardShape: 'ellipse', pitRadius: 18, storeRx: 20, storeRy: 38, pitCurve: 4, colors: { boardOuter: '#7A5A32', boardInner: '#9B7740', pit: '#4E3320', pitStroke: '#3A2515', seed: '#C8B898', seedStroke: '#8A7A5A' }, setupDesc: '7 pits per side, 7 seeds each, 2 stores, boat-shaped board', variantDesc: 'Sow counter-clockwise. Capture when last seed lands in empty own pit with seeds opposite.', setup: '7,7,7,7,7,7,7;0;7,7,7,7,7,7,7;0' },
      ayo: { label: 'Ayo', boardStyle: 'mancala', pitsPerSide: 6, seedsPerPit: 4, hasStores: false, pitRadius: 24, colors: { boardOuter: '#5C3D1E', boardInner: '#7B5530', pit: '#3A2210', pitStroke: '#2A1808', seed: '#D4A060', seedStroke: '#A07030', border: '#4A3018' }, setupDesc: '6 pits per side, 4 seeds each, no stores', variantDesc: 'Yoruba variant. Relay sowing: if last seed makes pit 2+, pick up and continue. Capture at 1.', setup: '4,4,4,4,4,4;0;4,4,4,4,4,4;0' },
      pallanguzhi: { label: 'Pallanguzhi', boardStyle: 'mancala', pitsPerSide: 7, seedsPerPit: 12, hasStores: false, pitRadius: 22, cornerRadius: 20, colors: { boardOuter: '#5C2E1A', boardInner: '#7A4030', pit: '#3A1808', pitStroke: '#2A1008', seed: '#D4A060', seedStroke: '#A07030', border: '#4A2018', borderDash: '8,4' }, setupDesc: '7 pits per side, 12 cowrie shells each, no stores', variantDesc: 'Tamil variant. Relay sowing with 12 shells per pit. Multiple rounds with pit elimination.', setup: '12,12,12,12,12,12,12;0;12,12,12,12,12,12,12;0' },
      sungka: { label: 'Sungka', boardStyle: 'mancala', pitsPerSide: 7, seedsPerPit: 7, hasStores: true, boardShape: 'ellipse', pitRadius: 18, storeRx: 20, storeRy: 38, pitCurve: 4, colors: { boardOuter: '#A08050', boardInner: '#C4A060', pit: '#6B4C28', pitStroke: '#4A3518', seed: '#F0E8D8', seedStroke: '#C0B090' }, setupDesc: '7 pits per side, 7 shells each, 2 stores, boat-shaped board', variantDesc: 'Filipino variant. Simultaneous first move. Relay sowing. Skip opponent store.', setup: '7,7,7,7,7,7,7;0;7,7,7,7,7,7,7;0' },
      'toguz-korgool': { label: 'Toguz Korgool', boardStyle: 'mancala', pitsPerSide: 9, seedsPerPit: 9, hasStores: true, storeRx: 22, storeRy: 48, pitRadius: 20, cornerRadius: 20, colors: { boardOuter: '#6B4C28', boardInner: '#8A6538', pit: '#3E2410', pitStroke: '#2A1808', seed: '#C8B898', seedStroke: '#8A7A5A' }, setupDesc: '9 pits per side, 9 seeds each, 2 kazans', variantDesc: 'Kazakh variant. Capture pit with 3 seeds (becomes your tuzdyk). Only one tuzdyk allowed.', setup: '9,9,9,9,9,9,9,9,9;0;9,9,9,9,9,9,9,9,9;0' },
    },
  },
  halma: {
    label: 'Halma',
    pieceSet: 'playstrategy-draughts-plain',
    buildLayout: buildCheckeredLayout,
    variants: {
      'standard-2p': { label: '2-Player (16×16)', boardStyle: 'checkered', rows: 16, cols: 16, tileSize: 20, showLabels: false, colors: { lightSquare: '#f5e6c8', darkSquare: '#e8d4a8' }, setup: 'bbbbb11/bbbbb11/bbbbb11/bbb13/b15/16/16/16/16/16/16/15w/13www/11wwwww/11wwwww/11wwwww', setupDesc: '19 pieces each in opposite corner camps (5-col staircase triangle)', variantDesc: 'Move all pieces from own camp to opponent camp by stepping or jumping.' },
      'standard-4p': { label: '4-Player (16×16)', boardStyle: 'checkered', rows: 16, cols: 16, tileSize: 20, showLabels: false, colors: { lightSquare: '#f5e6c8', darkSquare: '#e8d4a8' }, setup: 'bbbb8bbbb/bbbb8bbbb/bbb10bbb/bb12bb/16/16/16/16/16/16/16/16/ww12ww/www10www/wwww8wwww/wwww8wwww', setupDesc: '13 pieces each in all 4 corner camps (4-col staircase triangle)', variantDesc: '4-player variant. Move all pieces from own camp to opposite corner camp.' },
    },
  },
  'stern-halma': {
    label: 'Stern-Halma',
    pieceSet: 'fluent-emoji',
    buildLayout(rows, cols, tileSize, colors, config) {
      return generateSternHalmaLayout(config.holeSpacing || 30, { colors })
    },
    variants: {
      '2-player': { label: '2 Player (N vs S)', boardStyle: 'stern-halma', holeSpacing: 30, filledArms: ['N', 'S'], setupDesc: '10 pieces each in opposite arms (N and S)', variantDesc: 'Race across the star board. Hop chains in any direction. No captures.' },
      '3-player': { label: '3 Player', boardStyle: 'stern-halma', holeSpacing: 30, filledArms: ['N', 'SE', 'SW'], setupDesc: '10 pieces each in alternating arms (N, SE, SW)', variantDesc: '3 players on alternating arms. Each races to the diagonally opposite arm.' },
      '4-player': { label: '4 Player', boardStyle: 'stern-halma', holeSpacing: 30, filledArms: ['NE', 'SE', 'SW', 'NW'], setupDesc: '10 pieces each in side arms (NE, SE, SW, NW)', variantDesc: '4 players skip N/S arms. Each races to the diagonally opposite arm.' },
      '6-player': { label: '6 Player', boardStyle: 'stern-halma', holeSpacing: 30, filledArms: ['N', 'NE', 'SE', 'S', 'SW', 'NW'], setupDesc: '10 pieces each, all 6 arms filled', variantDesc: 'Full game. All 6 arms occupied. Each player races to the opposite arm.' },
      'super-chinese-checkers': { label: 'Super Chinese Checkers', boardStyle: 'stern-halma', holeSpacing: 30, filledArms: ['N', 'S'], setupDesc: '10 pieces each in opposite arms', variantDesc: 'Extended hop: pieces may jump multiple empty spaces in a line before and after clearing a hurdle.' },
    },
  },
  hex: {
    label: 'Hex',
    pieceSet: 'playstrategy-go-classic',
    variants: {
      standard: { label: 'Standard (11×11)', boardStyle: 'hex', hexRows: 11, hexCols: 11, hexSize: 20, flat: false, hexFrame: 'rhombus', colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, buildLayout(rows, cols, tileSize, colors) { return buildRhombusLayout(generateHexRhombus(11, 11), 20, 'pointy', colors) }, setupDesc: 'Empty 11x11 rhombus board', variantDesc: 'Connection game. Place stones to connect your two opposite edges. No captures.' },
      '9x9': { label: 'Hex 9×9', boardStyle: 'hex', hexRows: 9, hexCols: 9, hexSize: 24, flat: false, hexFrame: 'rhombus', colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, buildLayout(rows, cols, tileSize, colors) { return buildRhombusLayout(generateHexRhombus(9, 9), 24, 'pointy', colors) }, setupDesc: 'Empty 9x9 rhombus board, 81 cells', variantDesc: 'Smaller board for faster, more tactical games. Common beginner size.' },
      '13x13': { label: 'Hex 13×13', boardStyle: 'hex', hexRows: 13, hexCols: 13, hexSize: 17, flat: false, hexFrame: 'rhombus', colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, buildLayout(rows, cols, tileSize, colors) { return buildRhombusLayout(generateHexRhombus(13, 13), 17, 'pointy', colors) }, setupDesc: 'Empty 13x13 rhombus board, 169 cells', variantDesc: 'Tournament size. More strategic depth than 11x11.' },
      '14x14': { label: 'Hex 14×14', boardStyle: 'hex', hexRows: 14, hexCols: 14, hexSize: 16, flat: false, hexFrame: 'rhombus', colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, buildLayout(rows, cols, tileSize, colors) { return buildRhombusLayout(generateHexRhombus(14, 14), 16, 'pointy', colors) }, setupDesc: 'Empty 14x14 rhombus board, 196 cells', variantDesc: 'BoardSpace standard. Slightly larger than tournament 13x13.' },
      '19x19': { label: 'Hex 19×19', boardStyle: 'hex', hexRows: 19, hexCols: 19, hexSize: 12, flat: false, hexFrame: 'rhombus', colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, buildLayout(rows, cols, tileSize, colors) { return buildRhombusLayout(generateHexRhombus(19, 19), 12, 'pointy', colors) }, setupDesc: 'Empty 19x19 rhombus board, 361 cells', variantDesc: 'Go-sized board for deep strategic play. Very long games.' },
      'y-game': { label: 'Y (side 12)', boardStyle: 'hex', hexGrid: generateTriangularHexGrid(12), hexSize: 18, flat: false, hexFrame: 'triangle', colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, buildLayout(rows, cols, tileSize, colors) { return buildTriangularLayout(generateTriangularHexGrid(12), 18, 'pointy', colors) }, setupDesc: 'Empty triangular board, 78 cells', variantDesc: 'Triangular hex board. Connect all 3 edges with a single chain. Generalises Hex. Shannon & Schensted, 1950s.' },
      'y-small': { label: 'Y (side 9)', boardStyle: 'hex', hexGrid: generateTriangularHexGrid(9), hexSize: 22, flat: false, hexFrame: 'triangle', colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, buildLayout(rows, cols, tileSize, colors) { return buildTriangularLayout(generateTriangularHexGrid(9), 22, 'pointy', colors) }, setupDesc: 'Empty triangular board, 45 cells', variantDesc: 'Smaller Y board for faster tactical games. Side-length 9.' },
      'y-large': { label: 'Y (side 15)', boardStyle: 'hex', hexGrid: generateTriangularHexGrid(15), hexSize: 14, flat: false, hexFrame: 'triangle', colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, buildLayout(rows, cols, tileSize, colors) { return buildTriangularLayout(generateTriangularHexGrid(15), 14, 'pointy', colors) }, setupDesc: 'Empty triangular board, 120 cells', variantDesc: 'Large Y board for deep strategic play. Side-length 15.' },
    },
  },
  'royal-ur': {
    label: 'Royal Ur',
    pieceSet: 'playstrategy-draughts-plain',
    buildLayout: buildCheckeredLayout,
    variants: {
      standard: { label: 'Standard', boardStyle: 'checkered', rows: 3, cols: 8, tileSize: 40, showLabels: false, cellMap: ROYAL_UR_MAP, colors: ROYAL_UR_COLORS, cellTypeDecorations: ROYAL_UR_DECORATIONS, setupDesc: '7 pieces each, race along a shared middle track', variantDesc: 'Ancient Mesopotamian race game. Roll 4 binary dice. Rosettes grant extra turns and safety.' },
    },
  },
  surakarta: {
    label: 'Surakarta',
    pieceSet: 'playstrategy-go-classic',
    // TEMPORARY: moves to packages/schema/src/produce.js when frontmatter lands.
    buildLayout(rows, cols, tileSize, colors) {
      const arcPad = tileSize * 2.3
      const gridW = (cols - 1) * tileSize
      const gridH = (rows - 1) * tileSize
      const boardW = gridW + arcPad * 2
      const boardH = gridH + arcPad * 2
      const pad = 24
      const gx = pad + arcPad
      const gy = pad + arcPad
      const ix = (i) => gx + i * tileSize
      const iy = (i) => gy + i * tileSize
      const innerR = tileSize
      const outerR = tileSize * 2

      return {
        positionType: 'intersection',
        showLabels: true,
        inset: arcPad,
        cellFill: 'none',
        backgrounds: [
          { fill: colors.frame || '#5a3e28', rx: 8 },
          { x: pad + 6, y: pad + 6, width: boardW - 12, height: boardH - 12, fill: colors.board || '#c8a872', rx: 5 },
          { x: pad + 10, y: pad + 10, width: boardW - 20, height: boardH - 20, fill: colors.boardInner || '#d4b896', rx: 3 },
        ],
        lines: { color: colors.gridLine || '#6b4a30', width: 1.5 },
        paths: [
          { d: `M ${ix(1)},${iy(0)} A ${innerR},${innerR} 0 1,0 ${ix(0)},${iy(1)}`, stroke: colors.innerArc || '#6b4a30' },
          { d: `M ${ix(cols-2)},${iy(0)} A ${innerR},${innerR} 0 1,1 ${ix(cols-1)},${iy(1)}`, stroke: colors.innerArc || '#6b4a30' },
          { d: `M ${ix(0)},${iy(rows-2)} A ${innerR},${innerR} 0 1,0 ${ix(1)},${iy(rows-1)}`, stroke: colors.innerArc || '#6b4a30' },
          { d: `M ${ix(cols-1)},${iy(rows-2)} A ${innerR},${innerR} 0 1,1 ${ix(cols-2)},${iy(rows-1)}`, stroke: colors.innerArc || '#6b4a30' },
          { d: `M ${ix(2)},${iy(0)} A ${outerR},${outerR} 0 1,0 ${ix(0)},${iy(2)}`, stroke: colors.outerArc || '#6b4a30' },
          { d: `M ${ix(cols-3)},${iy(0)} A ${outerR},${outerR} 0 1,1 ${ix(cols-1)},${iy(2)}`, stroke: colors.outerArc || '#6b4a30' },
          { d: `M ${ix(0)},${iy(rows-3)} A ${outerR},${outerR} 0 1,0 ${ix(2)},${iy(rows-1)}`, stroke: colors.outerArc || '#6b4a30' },
          { d: `M ${ix(cols-1)},${iy(rows-3)} A ${outerR},${outerR} 0 1,1 ${ix(cols-3)},${iy(rows-1)}`, stroke: colors.outerArc || '#6b4a30' },
        ],
        markers: Array.from({ length: rows * cols }, (_, i) => ({
          r: Math.floor(i / cols), c: i % cols, radius: 3.5, fill: colors.dotFill || '#4a3320',
        })),
        labels: { alphabet: 'abcdefghjklmnopqrst'.split(''), fontFamily: 'sans-serif' },
      }
    },
    variants: {
      standard: { label: 'Standard (6×6)', boardStyle: 'surakarta', rows: 6, cols: 6, tileSize: 50, setup: 'bbbbbb/bbbbbb/6/6/wwwwww/wwwwww', setupDesc: '12 pieces each on nearest two rows', variantDesc: 'Javanese capture game. Pieces move one step orthogonally. Capture by travelling along loop arcs.' },
    },
  },
  tafl: {
    label: 'Tafl',
    pieceSet: 'mce-tafl',
    buildLayout: buildCheckeredLayout,
    variants: {
      standard: { label: 'Tablut (9×9)', boardStyle: 'checkered', rows: 9, cols: 9, tileSize: 40, showLabels: false, cellMap: buildTaflMap(9), colors: TAFL_COLORS, setup: '3bbb3/4b4/4w4/b3w3b/bbwwKwwbb/b3w3b/4w4/4b4/3bbb3', setupDesc: 'King + 8 defenders vs 16 attackers', variantDesc: 'Sami tafl recorded by Linnaeus (1732). King escapes to any edge. Only tafl variant documented from living practice.' },
      brandubh: { label: 'Brandubh (7×7)', boardStyle: 'checkered', rows: 7, cols: 7, tileSize: 40, showLabels: false, cellMap: buildTaflMap(7), colors: TAFL_COLORS, setup: '3b3/3b3/3w3/bbwKwbb/3w3/3b3/3b3', setupDesc: 'King + 4 defenders vs 8 attackers', variantDesc: 'Irish tafl. King escapes to corners. Smallest standard tafl board.' },
      hnefatafl: { label: 'Hnefatafl (11×11)', boardStyle: 'checkered', rows: 11, cols: 11, tileSize: 34, showLabels: false, cellMap: buildTaflMap(11), colors: TAFL_COLORS, setup: '3bbbbb3/5b5/11/b4w4b/b3www3b/bb1wwKww1bb/b3www3b/b4w4b/11/5b5/3bbbbb3', setupDesc: 'King + 12 defenders vs 24 attackers', variantDesc: 'Norse king\'s table. King escapes to corners. The primary form of the tafl family.' },
      tawlbwrdd: { label: 'Tawlbwrdd (11×11)', boardStyle: 'checkered', rows: 11, cols: 11, tileSize: 34, showLabels: false, cellMap: buildTaflMap(11, { corners: false }), colors: TAFL_COLORS, setup: '3bbbbb3/5b5/11/b4w4b/b3www3b/bb1wwKww1bb/b3www3b/b4w4b/11/5b5/3bbbbb3', setupDesc: 'King + 12 defenders vs 24 attackers', variantDesc: 'Welsh tafl. King escapes to any edge square (not just corners). Peniarth MS 158 (1587).' },
    },
  },
  pachisi: {
    label: 'Pachisi',
    pieceSet: 'playstrategy-draughts-plain',
    buildLayout: buildCheckeredLayout,
    variants: {
      standard: { label: 'Standard', boardStyle: 'checkered', rows: 19, cols: 19, tileSize: 20, showLabels: false, cellMap: PACHISI_MAP, colors: PACHISI_COLORS, cellTypeDecorations: PACHISI_DECORATIONS, setupDesc: '4 players, 4 pieces each start at Charkoni (centre)', variantDesc: 'Indian cross-track race game for 4 players. Roll cowrie shells. Castle squares grant safety. First to return all pieces home wins.' },
      'two-player': { label: '2-Player', boardStyle: 'checkered', rows: 19, cols: 19, tileSize: 20, showLabels: false, cellMap: PACHISI_MAP, colors: PACHISI_COLORS, cellTypeDecorations: PACHISI_DECORATIONS, setupDesc: '2 players, 8 pieces each (2 colours per player)', variantDesc: 'Each player controls two opposite arms. 8 pieces total. Same board and rules as standard.' },
      'seven-shell': { label: 'Seven-Shell', boardStyle: 'checkered', rows: 19, cols: 19, tileSize: 20, showLabels: false, cellMap: PACHISI_MAP, colors: PACHISI_COLORS, cellTypeDecorations: PACHISI_DECORATIONS, setupDesc: '4 players, 7 cowrie shells', variantDesc: 'Seven shells instead of six. Different throw table with higher max (Paintees = 35). More grace throws.' },
    },
  },
  chaupar: {
    label: 'Chaupar',
    pieceSet: 'playstrategy-draughts-plain',
    buildLayout: buildCheckeredLayout,
    variants: {
      standard: { label: 'Standard', boardStyle: 'checkered', rows: 19, cols: 19, tileSize: 20, showLabels: false, cellMap: CHAUPAR_MAP, colors: CHAUPAR_COLORS, setupDesc: '4 players, 4 pieces each start at centre', variantDesc: 'Indian cross-track race game. Similar to Pachisi but with long dice (pase) and different safe squares. More aggressive captures.' },
    },
  },
  'landlords-game': {
    label: 'Landlords Game',
    pieceSet: null,
    needsBoardData: 'landlords-game-boards.json',
    buildLayout: buildPerimeterLayout,
    variants: {
      '1904-patent': { label: '1904 Patent', boardStyle: 'landlords', variant: '1904-patent', setupDesc: '40 spaces, 4 corners, 22 numbered lots', variantDesc: 'Elizabeth Magie\'s original 1904 patent. Linear rent progression (rent = lot number).' },
      '1906-egc': { label: '1906 EGC', boardStyle: 'landlords', variant: '1906-egc', setupDesc: '40 spaces, 4 corners, 4 inner Natural Opportunity spaces', variantDesc: 'First commercial edition by Economic Game Company. Named lots in price tiers. Dual-mode: standard + single tax.' },
      '1932-prosperity': { label: '1932 Prosperity', boardStyle: 'landlords', variant: '1932-prosperity', setupDesc: '36 spaces, 4 corners (3 railroads + Wages), 8 per side', variantDesc: 'Adgame Company dual-game board. Clockwise direction. Chance cube on doubles.' },
    },
  },
  'dungeon-chess': {
    label: 'Dungeon Chess',
    pieceSet: 'mce-chess',
    variants: {
      'two-player': { label: 'Two Player (20×8)', boardStyle: 'checkered', rows: 20, cols: 8, tileSize: 21, showLabels: false, cellMap: DUNGEON_2P, colors: DUNGEON_COLORS, setupDesc: 'Standard armies in dungeon corridor rooms', variantDesc: 'Asymmetric skirmish. Chess pieces in dungeon rooms connected by corridors.' },
      'four-player': { label: 'Four Player (20×20)', boardStyle: 'checkered', rows: 20, cols: 20, tileSize: 18, showLabels: false, cellMap: DUNGEON_4P, colors: DUNGEON_COLORS, setupDesc: '4 armies in corner dungeons', variantDesc: 'Four-player dungeon. Each army starts in a corner room. Free-for-all or team play.' },
      compact: { label: 'Compact Skirmish (10×10)', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 24, showLabels: false, cellMap: DUNGEON_COMPACT, colors: DUNGEON_COLORS, setupDesc: 'Reduced armies in tight dungeon', variantDesc: 'Quick skirmish variant. Smaller dungeon, faster contact.' },
    },
  },
  nukes: {
    label: 'Nukes',
    pieceSet: null,
    hexGame: 'nukes',
    variants: {
      '2-rings': { label: '2 Rings (12 hexes)', hexSize: 2 },
      '3-rings': { label: '3 Rings (18 hexes)', hexSize: 3 },
      '4-rings': { label: '4 Rings (24 hexes)', hexSize: 4 },
      '5-rings': { label: '5 Rings (30 hexes)', hexSize: 5 },
      '6-rings': { label: '6 Rings (36 hexes)', hexSize: 6 },
    },
  },
  'talisman-worlds': {
    label: 'Talisman Worlds',
    pieceSet: null,
    hexGame: 'talisman',
    variants: {
      standard: { label: 'Standard (4 rings)', hexSize: 4 },
      expansion: { label: 'Dungeon Expansion (5 rings)', hexSize: 5 },
    },
  },
  mongo: {
    label: 'Planet Mongo',
    pieceSet: null,
    hexGame: 'mongo',
    variants: {
      standard: { label: 'Standard (6 rings)', hexSize: 6 },
    },
  },
  twilight: {
    label: 'Twilight Imperium',
    pieceSet: null,
    hexGame: 'twilight',
    variants: {
      '6p': { label: '6 Players (Standard)', hexSize: 3, hexLayout: '6p' },
      '5p': { label: '5 Players', hexSize: 3, hexLayout: '5p' },
      '4p': { label: '4 Players', hexSize: 3, hexLayout: '4p' },
      '3p': { label: '3 Players', hexSize: 3, hexLayout: '3p' },
      '7p': { label: '7 Players (PoK)', hexSize: 3, hexLayout: '7p' },
      '8p': { label: '8 Players (PoK)', hexSize: 3, hexLayout: '8p' },
      hyper: { label: 'Hyper Imperium', hexSize: 3, hexLayout: 'hyper' },
    },
  },
  'endless-skies': {
    label: 'Endless Skies',
    pieceSet: null,
    hexGame: 'endless',
    variants: {
      standard: { label: 'Standard (5 rings)', hexSize: 5 },
    },
  },
  harvesters: {
    label: 'Harvesters',
    pieceSet: null,
    hexGame: 'colony',
    variants: {
      standard: { label: 'Standard (3-4 Players)', hexSize: 2, hexLayout: 'standard' },
      expanded: { label: 'Expanded (5-6 Players)', hexSize: 2, hexLayout: 'expanded' },
      'new-world': { label: 'Seafarers: New World', hexSize: 2, hexLayout: 'newWorld' },
      'new-shores': { label: 'Seafarers: New Shores', hexSize: 2, hexLayout: 'newShores' },
      'four-islands': { label: 'Seafarers: Four Islands', hexSize: 2, hexLayout: 'fourIslands' },
      desert: { label: 'Seafarers: Through the Desert', hexSize: 2, hexLayout: 'desert' },
      'fog-islands': { label: 'Seafarers: Fog Islands', hexSize: 2, hexLayout: 'fogIslands' },
    },
  },
  'standard-52': {
    label: '52 Cards',
    pieceSet: null,
    deckGame: 'standard-52',
    variants: {
      big2: { label: 'Big 2', deckVariant: 'big2', setupDesc: '13 cards each, 4 players', variantDesc: 'Climbing card game where 2 is the highest rank. Play singles, pairs, triples, or five-card poker hands.' },
      president: { label: 'President', deckVariant: 'president', setupDesc: 'Full deck dealt evenly, 4-8 players', variantDesc: 'Role-based climbing game with card trading between rounds. Positions persist. Tests multi-round state and asymmetric deals.' },
      poker: { label: 'Texas Hold\'em', deckVariant: 'poker', setupDesc: '2 hole cards + 5 community, 6 players', variantDesc: 'Community card poker. Two private cards, five shared. Four betting rounds: preflop, flop, turn, river.' },
      blackjack: { label: 'Blackjack', deckVariant: 'blackjack', setupDesc: '2 cards each, 4 players vs dealer', variantDesc: 'Beat the dealer to 21 without busting. Aces count 1 or 11. Face cards are 10.' },
      bridge: { label: 'Rubber Bridge', deckVariant: 'bridge', setupDesc: '13 cards each, 4 players', variantDesc: 'Partnership trick-taking with bidding and contract. A rubber is best of three games.' },
      hearts: { label: 'Hearts', deckVariant: 'hearts', setupDesc: '13 cards each, 4 players', variantDesc: 'Avoid hearts and the Queen of Spades. Shoot the Moon to reverse scoring.' },
      spades: { label: 'Spades', deckVariant: 'spades', setupDesc: '13 cards each, 4 players', variantDesc: 'Partnership trick-taking. Spades always trump. Bid your tricks and make your contract.' },
      'gin-rummy': { label: 'Gin Rummy', deckVariant: 'gin-rummy', setupDesc: '10 cards each, 2 players', variantDesc: 'Form melds of sets and runs. Knock when deadwood is 10 or less, or go gin for a bonus.' },
      cribbage: { label: 'Cribbage', deckVariant: 'cribbage', setupDesc: '6 cards each, 2 players', variantDesc: 'Discard to the crib, peg during play, score hands. First to 121 points wins.' },
      euchre: { label: 'Euchre', deckVariant: 'euchre', setupDesc: '5 cards each, 4 players', variantDesc: 'Partnership trick-taking with a 24-card deck. Name trump or pass. Take 3 of 5 tricks to score.' },
      canasta: { label: 'Canasta', deckVariant: 'canasta', setupDesc: '11 cards each, 4 players', variantDesc: 'Rummy-style with melds of 7 (canastas). Wild cards, frozen piles, and partnership strategy.' },
      klondike: { label: 'Klondike', deckVariant: 'klondike', setupDesc: 'Tableau of 28 cards, 1 player', variantDesc: 'The classic solitaire. Build foundations up by suit, tableau down by alternating colour.' },
    },
  },
  'flower-48': {
    label: '48 Flowers',
    pieceSet: null,
    deckGame: 'hanafuda-48',
    variants: {
      'koi-koi': { label: 'Koi-Koi', deckVariant: 'koi-koi', setupDesc: '8 cards each + 8 field, 2 players', variantDesc: 'The most popular Hanafuda game. Complete a yaku and declare win, or say Koi-Koi to keep playing for more — at the risk of losing the bonus.' },
      'hana-awase': { label: 'Hana-Awase', deckVariant: 'hana-awase', setupDesc: '48-card deck, 2-4 players', variantDesc: 'The base Hanafuda matching game. No yaku — card values only. Simplest entry point to the deck.' },
      'oicho-kabu': { label: 'Oicho-Kabu', deckVariant: 'oicho-kabu', setupDesc: '48-card deck, 2-8 players', variantDesc: 'A betting game using Hanafuda month numbers, not suit imagery. Closest to 9 wins. Similar to Baccarat.' },
    },
  },
  'standard-dice': {
    label: 'Standard Dice',
    pieceSet: null,
    deckGame: 'standard-dice',
    variants: {
      farkle: { label: 'Farkle', deckVariant: 'farkle', setupDesc: '6 dice, 2-6 players', variantDesc: 'Roll 6 dice, bank scoring combinations, press your luck. Roll nothing that scores and lose your entire turn\'s points.' },
      'liars-dice': { label: 'Liar\'s Dice', deckVariant: 'liars-dice', setupDesc: '5 dice each under cups, 2-6 players', variantDesc: 'Hidden dice under cups. Bid on what the combined dice show. Call liar to challenge — and risk a die of your own.' },
      yahtzee: { label: 'Yahtzee', deckVariant: 'yahtzee', setupDesc: '5 dice, 13 categories, 1-4 players', variantDesc: 'Five dice, 13 scoring categories, one shot at a Yahtzee. Fill every box across three rolls per turn.' },
    },
  },
  mahjong: {
    label: 'Mahjong',
    pieceSet: null,
    deckGame: 'mahjong-136',
    variants: {
      'hong-kong': { label: 'Hong Kong', deckVariant: 'hong-kong', setupDesc: '144 tiles, 4 players, 13-tile hand', variantDesc: 'The canonical Cantonese ruleset. Faan scoring with minimum 3 faan to win. Discarder pays on ron; wall win doubles from all.' },
      riichi: { label: 'Riichi (Japanese)', deckVariant: 'riichi', setupDesc: '136 tiles, 4 players, 13-tile hand', variantDesc: 'Japanese Mahjong. Yaku requirement to win. Riichi declaration locks the hand. Furiten prevents discarded-tile wins.' },
      taiwanese: { label: 'Taiwanese', deckVariant: 'taiwanese', setupDesc: '144 tiles, 4 players, 16-tile hand', variantDesc: '16-tile hands requiring five melds and one pair. Multiple players can win from a single discard.' },
      'zung-jung': { label: 'Zung Jung', deckVariant: 'zung-jung', setupDesc: '136 tiles, 4 players, 13-tile hand', variantDesc: 'Alan Kwan\'s competition system. 44 named patterns, additive scoring, 320-point limit.' },
    },
  },
  'double-six-dominoes': {
    label: 'D6 Dominoes',
    pieceSet: null,
    deckGame: 'dominoes-28',
    variants: {
      block: { label: 'Block', deckVariant: 'block', setupDesc: '7 tiles each, 2-4 players', variantDesc: 'The foundational domino game — match ends, no boneyard draws. If no one can play, lowest pip count wins.' },
      'all-fives': { label: 'All Fives', deckVariant: 'all-fives', setupDesc: '7 tiles each, 2-4 players', variantDesc: 'Score points as you play — whenever open ends total a multiple of 5, score that many. Doubles branch in four directions.' },
      'mexican-train': { label: 'Mexican Train', deckVariant: 'mexican-train', setupDesc: 'Double-12 set, 2-8 players', variantDesc: 'Hub-and-spokes layout. Each player builds their own train from the central double. The shared Mexican Train is always available.' },
    },
  },
  baristasaurus: {
    label: 'Baristasaurus',
    pieceSet: null,
    noRenderer: true,
    variants: {
      standard: { label: 'Standard', noRenderer: true, setupDesc: 'Card game, 2-4 players', variantDesc: 'A prehistoric card game about fulfilling coffeeshop orders. Original Moddable game.' },
    },
  },
  econopoly: {
    label: 'Econopoly',
    pieceSet: null,
    needsBoardData: 'landlords-game-boards.json',
    buildLayout: buildPerimeterLayout,
    variants: {
      standard: { label: 'Standard', boardStyle: 'landlords', variant: '1932-prosperity', setupDesc: 'Circuit board, 2-6 players', variantDesc: 'Euro-style resource management meets Monopoly. Uses Landlord\'s Game 1932 board. Original Moddable mod.' },
    },
  },
  'dnd-5e': {
    label: 'D&D 5e SRD',
    pieceSet: null,
    rpgGame: true,
    variants: {
      standard: { label: 'Core Rules', setupDesc: 'Tabletop RPG, 3-6 players', variantDesc: 'The open core rules for the world\'s most popular roleplaying game.' },
    },
  },
  ironsworn: {
    label: 'Ironsworn',
    pieceSet: null,
    rpgGame: true,
    variants: {
      standard: { label: 'Standard', setupDesc: 'Solo/co-op RPG, 1-4 players', variantDesc: 'A perilous quest through the Ironlands, guided by vows and oracle tables.' },
    },
  },
  agon: {
    label: 'Agon',
    pieceSet: 'mce-chess',
    variants: {
      standard: { label: 'Standard (91 hexes)', boardStyle: 'hex', hexRadius: 5, hexSize: 22, flat: false, hexColorFn: agonRingColor, colors: { lightHex: '#e6a817', darkHex: '#8b2240', stroke: 'rgba(0,0,0,0.25)', background: '#2a1a0a' }, hexPosition: buildAgonPosition(), centreMarker: '★', pieceNames: { P: 'Guard', p: 'Guard' }, buildLayout(rows, cols, tileSize, colors) { return buildHexagonalLayout(generateHexGrid(5), 22, 'pointy', colors, { hexColorFn: agonRingColor, centreMarker: '★' }) }, setupDesc: 'Queen + 6 Guards per player on outer ring', variantDesc: 'Guide your Queen to the centre hex while blocking opponent. Concentric 91-hex board. France, 1842.' },
    },
  },
  asalto: {
    label: 'Asalto',
    pieceSet: 'fluent-emoji',
    buildLayout(rows, cols, tileSize, colors, config) {
      return generateAsaltoLayout(config.boardSize || 320, { asaltoGrid: config.asaltoGrid, colors })
    },
    variants: {
      standard: { label: 'Standard', boardStyle: 'asalto', boardSize: 320, asaltoSetup: { officers: [3, 5], soldiers: Array.from({ length: 27 }, (_, i) => i + 6).filter(i => i !== 8 && i !== 9 && i !== 10) }, pieceNames: { officer: 'Officer', soldier: 'Soldier' }, setupDesc: '2 Officers in fortress vs 24 Soldiers on plain', variantDesc: 'Asymmetric siege. Officers jump-capture like draughts; Soldiers advance forward/sideways. Immobilize to win.' },
      'royal-garrison': { label: 'Royal Garrison', boardStyle: 'asalto', boardSize: 380, asaltoGrid: { rows: [[2,3,4,5,6],[2,3,4,5,6],[0,1,2,3,4,5,6,7,8],[0,1,2,3,4,5,6,7,8],[0,1,2,3,4,5,6,7,8],[0,1,2,3,4,5,6,7,8],[0,1,2,3,4,5,6,7,8],[2,3,4,5,6],[2,3,4,5,6]], fortressRows: 2, fortressCols: [2,3,4,5,6], fortressExtraRow: 2, extraNodes: [{ row: 0, col: 1, fortress: true, connectsTo: [[0,2],[1,2]] }, { row: 0, col: 7, fortress: true, connectsTo: [[0,6],[1,6]] }] }, asaltoSetup: { officers: [12, 14, 16], soldiers: Array.from({ length: 55 }, (_, i) => i + 10).filter(i => i !== 12 && i !== 13 && i !== 14 && i !== 15 && i !== 16) }, pieceNames: { officer: 'Officer', soldier: 'Soldier' }, setupDesc: '3 Officers vs 50 Soldiers on plain', variantDesc: 'Extended Asalto on 9×9 cross. Three Officers defend fortress against 50 Soldiers.' },
    },
  },
  'bavarian-32': {
    label: 'Bavarian 32',
    pieceSet: null,
    deckGame: 'bavarian-32',
    variants: {
      skat: { label: 'Skat', deckVariant: 'skat', setupDesc: '32-card deck, 3 players, 10-card hands', variantDesc: 'Germany\'s national card game. Auction bidding, solo declarer vs two defenders. Trump suit or Grand/Null contracts.' },
    },
  },
  'dou-shou-qi': {
    label: 'Jungle',
    pieceSet: 'mce-jungle',
    buildLayout: buildCheckeredLayout,
    variants: {
      standard: { label: 'Standard (7×9)', boardStyle: 'checkered', rows: 9, cols: 7, tileSize: 40, showLabels: false, cellMap: JUNGLE_MAP, colors: JUNGLE_COLORS, fen: JUNGLE_SETUP, pieceNames: { E: 'Elephant', e: 'Elephant', L: 'Lion', l: 'Lion', T: 'Tiger', t: 'Tiger', P: 'Leopard', p: 'Leopard', D: 'Dog', d: 'Dog', W: 'Wolf', w: 'Wolf', C: 'Cat', c: 'Cat', R: 'Rat', r: 'Rat' }, pieceBorders: { white: '#1565c0', black: '#c62828' }, setupDesc: '8 animals per player on 7x9 grid with river, dens, and traps', variantDesc: 'Animals battle across rivers and traps to reach the enemy den. Rank hierarchy: Elephant > Lion > ... > Rat (but Rat defeats Elephant).' },
    },
  },
  lattaque: {
    label: "L'Attaque",
    pieceSet: null,
    buildLayout: buildCheckeredLayout,
    variants: {
      standard: { label: 'Standard', boardStyle: 'checkered', rows: 10, cols: 9, tileSize: 34, showLabels: false, cellMap: LATTAQUE_STANDARD_MAP, colors: LATTAQUE_COLORS, setupDesc: '36 pieces per player, 9×10 grid with three 1×2 lakes', variantDesc: 'Hidden-rank warfare by Hermance Edan (1909). Higher rank defeats lower. Mines immovable, Scouts slide unlimited. Precursor to Stratego.' },
      aviation: { label: 'Aviation', boardStyle: 'checkered', rows: 11, cols: 8, tileSize: 34, showLabels: false, cellMap: AVIATION_MAP, colors: AVIATION_COLORS, setupDesc: '42 pieces per player, 8×11 with aerodrome zones', variantDesc: 'Aerial warfare variant. Searchlight and AAA ranging. Hidden-information. Planes, bombers, and ground forces. Troop Carriers win by landing on enemy Aerodrome.' },
      'dover-patrol': { label: 'Dover Patrol', boardStyle: 'checkered', rows: 12, cols: 8, tileSize: 34, showLabels: false, cellMap: DOVER_PATROL_MAP, colors: DOVER_PATROL_COLORS, setupDesc: '40 pieces per player, 8×12 naval grid with walled harbours', variantDesc: 'Naval Capture the Flag. Seize the enemy Flag from their Harbour Base and convey it home. Flying Boat crosses Harbour Walls.' },
      'tri-tactics': { label: 'Tri-Tactics', boardStyle: 'checkered', rows: 12, cols: 12, tileSize: 30, showLabels: false, cellMap: TRI_TACTICS_MAP, colors: TRI_TACTICS_COLORS, overlays: [{ type: 'river', path: ['f9', 'f10', 'g10', 'h10', 'i10', 'i11'], stroke: '#3a6e9e', width: 9 }, { type: 'river', path: ['f4', 'f3', 'g3', 'h3', 'i3', 'i2'], stroke: '#3a6e9e', width: 9 }], setupDesc: '56 pieces per player, 12×12 land/sea combined terrain', variantDesc: 'Combined-arms: Army, Navy, Air Force on one board with land, sea, river, lake, and HQ terrain. Pieces caught out of element are forfeit.' },
    },
  },
  nyout: {
    label: 'Nyout',
    pieceSet: null,
    buildLayout(rows, cols, tileSize, colors, config) {
      return generateNyoutLayout(config.boardSize || 320, { colors })
    },
    nodeNames: {
      n1: 'cham-meoki (start)', n2: 'nal-yut', n3: 'nal-geol', n4: 'nal-gae', n5: 'nal-do',
      n6: 'chi-mo', n7: 'chi-yut', n8: 'chi-geol', n9: 'chi-gae', n10: 'chi-do',
      n11: 'duet-mo (busan)', n12: 'duet-yut', n13: 'duet-geol', n14: 'duet-gae', n15: 'duet-mo',
      n16: 'mo', n17: 'yut', n18: 'geol', n19: 'gae', n20: 'do',
      n21: 'bang (seoul)', n22: 'duet-modo', n23: 'duet-mogae',
      n24: 'saryeo', n25: 'anchi',
      n26: 'mo-do', n27: 'mo-gae', n28: 'sok-yut', n29: 'sok-mo',
    },
    variants: {
      standard: { label: 'Standard', boardStyle: 'nyout', boardSize: 320, setupDesc: '4 tokens per player, 29-position circular track', variantDesc: 'Korean stick-throwing race. Circular track with shortcut branches. Throw 4 sticks for movement. Capture by landing on opponent.' },
    },
  },
}

// ─── FEN → pieceImages mapping ──────────────────────────────────────────────

const FEN_TO_PIECE_ID = {
  K: 'wK', Q: 'wQ', R: 'wR', B: 'wB', N: 'wN', P: 'wP',
  k: 'bK', q: 'bQ', r: 'bR', b: 'bB', n: 'bN', p: 'bP',
  A: 'wA', a: 'bA', C: 'wC', c: 'bC', D: 'wD', d: 'bD',
  E: 'wE', e: 'bE', F: 'wF', f: 'bF', G: 'wG', g: 'bG',
  H: 'wH', h: 'bH', I: 'wI', i: 'bI', J: 'wJ', j: 'bJ',
  L: 'wL', l: 'bL', M: 'wM', m: 'bM', O: 'wO', o: 'bO',
  S: 'wS', s: 'bS', T: 'wT', t: 'bT', U: 'wU', u: 'bU',
  V: 'wV', v: 'bV', W: 'wW', w: 'bW', Y: 'wY', y: 'bY',
  Z: 'wZ', z: 'bZ',
}

const GAME_FEN_OVERRIDES = {
  xiangqi: { H: 'wN', h: 'bN', R: 'wR', r: 'bR', E: 'wE', e: 'bE', A: 'wA', a: 'bA', K: 'wK', k: 'bK', C: 'wC', c: 'bC', P: 'wP', p: 'bP', V: 'wV', v: 'bV', B: 'wB', b: 'bB', I: 'wI', i: 'bI', U: 'wU', u: 'bU', Z: 'wZ', z: 'bZ' },
  'xiangqi/jieqi': { K: 'wK', k: 'bK', F: 'wFD', f: 'bFD' },
  'dou-shou-qi': {
    E: 'wElephant', e: 'bElephant', L: 'wLion', l: 'bLion',
    T: 'wTiger', t: 'bTiger', P: 'wLeopard', p: 'bLeopard',
    D: 'wDog', d: 'bDog', W: 'wWolf', w: 'bWolf',
    C: 'wCat', c: 'bCat', R: 'wRat', r: 'bRat',
  },
  asalto: { officer: 'red-circle', soldier: 'green-circle' },
  'shogi/sho-shogi': {
    K: 'wK', k: 'bK', G: 'wG', g: 'bG', S: 'wS', s: 'bS', N: 'wN', n: 'bN',
    L: 'wL', l: 'bL', R: 'wR', r: 'bR', B: 'wB', b: 'bB', P: 'wP', p: 'bP',
    E: 'wE', e: 'bE',
  },
  'shogi/dobutsu': {
    G: 'wdG', g: 'bdG', L: 'wdL', l: 'bdL', E: 'wdE', e: 'bdE', C: 'wdC', c: 'bdC', H: 'wdH', h: 'bdH',
  },
  'shogi/cannon-shogi': {
    K: 'wK', k: 'bK', G: 'wG', g: 'bG', S: 'wS', s: 'bS', N: 'wN', n: 'bN',
    L: 'wL', l: 'bL', R: 'wR', r: 'bR', B: 'wB', b: 'bB', P: 'wP', p: 'bP',
    A: 'wcA', a: 'bcA', U: 'wcU', u: 'bcU', I: 'wcI', i: 'bcI', C: 'wcC', c: 'bcC',
  },
  'shogi/tori-shogi': {
    C: 'wtC', c: 'btC', F: 'wtF', f: 'btF', P: 'wtP', p: 'btP',
    R: 'wtR', r: 'btR', L: 'wtL', l: 'btL', S: 'wtS', s: 'btS',
    K: 'wtK', k: 'btK', G: 'wtG', g: 'btG',
  },
  'shogi/yari-shogi': {
    K: 'wK', k: 'bK', B: 'wB', b: 'bB', N: 'wN', n: 'bN', P: 'wP', p: 'bP',
    Y: 'wY', y: 'bY', G: 'wG', g: 'bG', S: 'wS', s: 'bS',
  },
  'shogi/dai-shogi': {
    LN: 'wLN', ln: 'bLN', KN: 'wKN', kn: 'bKN', ST: 'wST', st: 'bST',
    IG: 'wIG', ig: 'bIG', CG: 'wCG', cg: 'bCG', SG: 'wSG', sg: 'bSG',
    GG: 'wGG', gg: 'bGG', KI: 'wKI', ki: 'bKI', DE: 'wDE', de: 'bDE',
    RC: 'wRC', rc: 'bRC', CT: 'wCT', ct: 'bCT', FL: 'wFL', fl: 'bFL',
    BT: 'wBT', bt: 'bBT', VO: 'wVO', vo: 'bVO', AB: 'wAB', ab: 'bAB',
    EW: 'wEW', ew: 'bEW', KR: 'wKR', kr: 'bKR', LI: 'wLI', li: 'bLI',
    PH: 'wPH', ph: 'bPH', RK: 'wRK', rk: 'bRK', FY: 'wFY', fy: 'bFY',
    SM: 'wSM', sm: 'bSM', VM: 'wVM', vm: 'bVM', BI: 'wBI', bi: 'bBI',
    DH: 'wDH', dh: 'bDH', DK: 'wDK', dk: 'bDK', FK: 'wFK', fk: 'bFK',
    PW: 'wPW', pw: 'bPW', GB: 'wGB', gb: 'bGB',
  },
  'shogi/tenjiku-shogi': {
    LN: 'wLN', ln: 'bLN', KN: 'wKN', kn: 'bKN', FL: 'wFL', fl: 'bFL',
    IG: 'wIG', ig: 'bIG', CG: 'wCG', cg: 'bCG', SG: 'wSG', sg: 'bSG',
    GG: 'wGG', gg: 'bGG', KI: 'wKI', ki: 'bKI', DE: 'wDE', de: 'bDE',
    RC: 'wRC', rc: 'bRC', CS: 'wCS', cs: 'bCS', BT: 'wBT', bt: 'bBT',
    KR: 'wKR', kr: 'bKR', LI: 'wLI', li: 'bLI', FK: 'wFK', fk: 'bFK',
    PH: 'wPH', ph: 'bPH', SS: 'wSS', ss: 'bSS', VT: 'wVT', vt: 'bVT',
    BI: 'wBI', bi: 'bBI', DH: 'wDH', dh: 'bDH', DK: 'wDK', dk: 'bDK',
    WB: 'wWB', wb: 'bWB', FD: 'wFD', fd: 'bFD', LW: 'wLW', lw: 'bLW',
    FE: 'wFE', fe: 'bFE', SM: 'wSM', sm: 'bSM', VM: 'wVM', vm: 'bVM',
    RK: 'wRK', rk: 'bRK', HF: 'wHF', hf: 'bHF', SE: 'wSE', se: 'bSE',
    BG: 'wBG', bg: 'bBG', RG: 'wRG', rg: 'bRG', GR: 'wGR', gr: 'bGR',
    VG: 'wVG', vg: 'bVG', PW: 'wPW', pw: 'bPW', DG: 'wDG', dg: 'bDG',
  },
  'shogi/wa-shogi': {
    CK: 'wCK', ck: 'bCK', OC: 'wOC', oc: 'bOC', BD: 'wBD', bd: 'bBD',
    SC: 'wSC', sc: 'bSC', FG: 'wFG', fg: 'bFG', VW: 'wVW', vw: 'bVW',
    VS: 'wVS', vs: 'bVS', FC: 'wFC', fc: 'bFC', SO: 'wSO', so: 'bSO',
    CM: 'wCM', cm: 'bCM', LH: 'wLH', lh: 'bLH', FF: 'wFF', ff: 'bFF',
    SW: 'wSW', sw: 'bSW', CE: 'wCE', ce: 'bCE', TF: 'wTF', tf: 'bTF',
    RR: 'wRR', rr: 'bRR', SP: 'wSP', sp: 'bSP',
  },
  'shogi/chu-shogi': {
    K: 'wK', k: 'bK', G: 'wG', g: 'bG', S: 'wS', s: 'bS', L: 'wL', l: 'bL',
    R: 'wR', r: 'bR', B: 'wB', b: 'bB', P: 'wP', p: 'bP',
    E: 'wxE', e: 'bxE', C: 'wxC', c: 'bxC', F: 'wxF', f: 'bxF',
    A: 'wxA', a: 'bxA', T: 'wxT', t: 'bxT', O: 'wxI', o: 'bxI',
    X: 'wxH', x: 'bxH', M: 'wxM', m: 'bxM', V: 'wxV', v: 'bxV',
    H: 'wxW', h: 'bxW', D: 'wxD', d: 'bxD', N: 'wxN', n: 'bxN',
    Q: 'wxQ', q: 'bxQ', I: 'wxO', i: 'bxO',
  },
  'shogi/maka-dai-dai-shogi': {
    LN: 'wLN', ln: 'bLN', EG: 'wEG', eg: 'bEG', ST: 'wST', st: 'bST',
    TG: 'wTG', tg: 'bTG', IG: 'wIG', ig: 'bIG', CG: 'wCG', cg: 'bCG',
    SG: 'wSG', sg: 'bSG', GG: 'wGG', gg: 'bGG', DV: 'wDV', dv: 'bDV',
    KI: 'wKI', ki: 'bKI', DS: 'wDS', ds: 'bDS', RC: 'wRC', rc: 'bRC',
    CT: 'wCT', ct: 'bCT', CC: 'wCC', cc: 'bCC', CO: 'wCO', co: 'bCO',
    FL: 'wFL', fl: 'bFL', BT: 'wBT', bt: 'bBT', DE: 'wDE', de: 'bDE',
    RD: 'wRD', rd: 'bRD', BM: 'wBM', bm: 'bBM', OR: 'wOR', or: 'bOR',
    AB: 'wAB', ab: 'bAB', BB: 'wBB', bb: 'bBB', EW: 'wEW', ew: 'bEW',
    KR: 'wKR', kr: 'bKR', LI: 'wLI', li: 'bLI', PH: 'wPH', ph: 'bPH',
    DY: 'wDY', dy: 'bDY', KN: 'wKN', kn: 'bKN', VO: 'wVO', vo: 'bVO',
    FY: 'wFY', fy: 'bFY', BV: 'wBV', bv: 'bBV', WR: 'wWR', wr: 'bWR',
    LD: 'wLD', ld: 'bLD', GD: 'wGD', gd: 'bGD', SD: 'wSD', sd: 'bSD',
    RK: 'wRK', rk: 'bRK', LC: 'wLC', lc: 'bLC', SM: 'wSM', sm: 'bSM',
    SF: 'wSF', sf: 'bSF', VM: 'wVM', vm: 'bVM', BI: 'wBI', bi: 'bBI',
    DH: 'wDH', dh: 'bDH', DK: 'wDK', dk: 'bDK', CP: 'wCP', cp: 'bCP',
    FK: 'wFK', fk: 'bFK', HM: 'wHM', hm: 'bHM', RT: 'wRT', rt: 'bRT',
    PW: 'wPW', pw: 'bPW', GB: 'wGB', gb: 'bGB',
  },
  'shogi/tai-shogi': {
    LN: 'wLN', ln: 'bLN', TS: 'wTS', ts: 'bTS', WL: 'wWL', wl: 'bWL',
    FY: 'wFY', fy: 'bFY', LO: 'wLO', lo: 'bLO', DW: 'wDW', dw: 'bDW',
    RK: 'wRK', rk: 'bRK', DH: 'wDH', dh: 'bDH', DK: 'wDK', dk: 'bDK',
    FK: 'wFK', fk: 'bFK', GG: 'wGG', gg: 'bGG', DV: 'wDV', dv: 'bDV',
    EM: 'wEM', em: 'bEM', DS: 'wDS', ds: 'bDS', RC: 'wRC', rc: 'bRC',
    SI: 'wSI', si: 'bSI', SE: 'wSE', se: 'bSE', KN: 'wKN', kn: 'bKN',
    PS: 'wPS', ps: 'bPS', FT: 'wFT', ft: 'bFT', BI: 'wBI', bi: 'bBI',
    FE: 'wFE', fe: 'bFE', WE: 'wWE', we: 'bWE', FR: 'wFR', fr: 'bFR',
    SG: 'wSG', sg: 'bSG', LG: 'wLG', lg: 'bLG', CR: 'wCR', cr: 'bCR',
    RG: 'wRG', rg: 'bRG', SC: 'wSC', sc: 'bSC', WH: 'wWH', wh: 'bWH',
    RS: 'wRS', rs: 'bRS', VO: 'wVO', vo: 'bVO', CS: 'wCS', cs: 'bCS',
    BB: 'wBB', bb: 'bBB', SV: 'wSV', sv: 'bSV', GL: 'wGL', gl: 'bGL',
    BM: 'wBM', bm: 'bBM', BT: 'wBT', bt: 'bBT', BV: 'wBV', bv: 'bBV',
    WR: 'wWR', wr: 'bWR', NK: 'wNK', nk: 'bNK', GD: 'wGD', gd: 'bGD',
    SD: 'wSD', sd: 'bSD', SL: 'wSL', sl: 'bSL', WB: 'wWB', wb: 'bWB',
    FL: 'wFL', fl: 'bFL', WS: 'wWS', ws: 'bWS', EB: 'wEB', eb: 'bEB',
    CC: 'wCC', cc: 'bCC', HF: 'wHF', hf: 'bHF', OM: 'wOM', om: 'bOM',
    OK: 'wOK', ok: 'bOK', PC: 'wPC', pc: 'bPC', GT: 'wGT', gt: 'bGT',
    KR: 'wKR', kr: 'bKR', LI: 'wLI', li: 'bLI', PH: 'wPH', ph: 'bPH',
    GO: 'wGO', go: 'bGO', RB: 'wRB', rb: 'bRB', NB: 'wNB', nb: 'bNB',
    SU: 'wSU', su: 'bSU', LC: 'wLC', lc: 'bLC', BD: 'wBD', bd: 'bBD',
    WO: 'wWO', wo: 'bWO', EG: 'wEG', eg: 'bEG', ST: 'wST', st: 'bST',
    TG: 'wTG', tg: 'bTG', IG: 'wIG', ig: 'bIG', CG: 'wCG', cg: 'bCG',
    OR: 'wOR', or: 'bOR', CO: 'wCO', co: 'bCO', RD: 'wRD', rd: 'bRD',
    CP: 'wCP', cp: 'bCP', DE: 'wDE', de: 'bDE', HM: 'wHM', hm: 'bHM',
    VS: 'wVS', vs: 'bVS', HD: 'wHD', hd: 'bHD', FH: 'wFH', fh: 'bFH',
    EN: 'wEN', en: 'bEN', DY: 'wDY', dy: 'bDY', FO: 'wFO', fo: 'bFO',
    SM: 'wSM', sm: 'bSM', VM: 'wVM', vm: 'bVM', VB: 'wVB', vb: 'bVB',
    SB: 'wSB', sb: 'bSB', PR: 'wPR', pr: 'bPR', AB: 'wAB', ab: 'bAB',
    EW: 'wEW', ew: 'bEW', LD: 'wLD', ld: 'bLD', PW: 'wPW', pw: 'bPW',
    GB: 'wGB', gb: 'bGB', WT: 'wWT', wt: 'bWT',
  },
  'shogi/taikyoku-shogi': {
    AB: 'wAB', ab: 'bAB', BA: 'wBA', ba: 'bBA', BC: 'wBC', bc: 'bBC', BO: 'wBO', bo: 'bBO',
    BI: 'wBI', bi: 'bBI', BG: 'wBG', bg: 'bBG', BB: 'wBB', bb: 'bBB', BL: 'wBL', bl: 'bBL',
    BM: 'wBM', bm: 'bBM', BT: 'wBT', bt: 'bBT', BD: 'wBD', bd: 'bBD', BS: 'wBS', bs: 'bBS',
    BV: 'wBV', bv: 'bBV', BU: 'wBU', bu: 'bBU', CP: 'wCP', cp: 'bCP', CA: 'wCA', ca: 'bCA',
    CF: 'wCF', cf: 'bCF', CS: 'wCS', cs: 'bCS', CN: 'wCN', cn: 'bCN', CT: 'wCT', ct: 'bCT',
    CD: 'wCD', cd: 'bCD', CH: 'wCH', ch: 'bCH', CK: 'wCK', ck: 'bCK', CC: 'wCC', cc: 'bCC',
    CM: 'wCM', cm: 'bCM', CL: 'wCL', cl: 'bCL', CE: 'wCE', ce: 'bCE', CO: 'wCO', co: 'bCO',
    CU: 'wCU', cu: 'bCU', CG: 'wCG', cg: 'bCG', CR: 'wCR', cr: 'bCR', DS: 'wDS', ds: 'bDS',
    DV: 'wDV', dv: 'bDV', DG: 'wDG', dg: 'bDG', DY: 'wDY', dy: 'bDY', DH: 'wDH', dh: 'bDH',
    DK: 'wDK', dk: 'bDK', DE: 'wDE', de: 'bDE', EC: 'wEC', ec: 'bEC', ED: 'wED', ed: 'bED',
    EG: 'wEG', eg: 'bEG', EB: 'wEB', eb: 'bEB', EN: 'wEN', en: 'bEN', EW: 'wEW', ew: 'bEW',
    FL: 'wFL', fl: 'bFL', FE: 'wFE', fe: 'bFE', FD: 'wFD', fd: 'bFD', FI: 'wFI', fi: 'bFI',
    FG: 'wFG', fg: 'bFG', FA: 'wFA', fa: 'bFA', FC: 'wFC', fc: 'bFC', FY: 'wFY', fy: 'bFY',
    FN: 'wFN', fn: 'bFN', FH: 'wFH', fh: 'bFH', FO: 'wFO', fo: 'bFO', FS: 'wFS', fs: 'bFS',
    FM: 'wFM', fm: 'bFM', FP: 'wFP', fp: 'bFP', FR: 'wFR', fr: 'bFR', FQ: 'wFQ', fq: 'bFQ',
    FK: 'wFK', fk: 'bFK', FU: 'wFU', fu: 'bFU', FT: 'wFT', ft: 'bFT', FF: 'wFF', ff: 'bFF',
    GB: 'wGB', gb: 'bGB', GC: 'wGC', gc: 'bGC', GG: 'wGG', gg: 'bGG', GO: 'wGO', go: 'bGO',
    GL: 'wGL', gl: 'bGL', GV: 'wGV', gv: 'bGV', GT: 'wGT', gt: 'bGT', GR: 'wGR', gr: 'bGR',
    GM: 'wGM', gm: 'bGM', GS: 'wGS', gs: 'bGS', GA: 'wGA', ga: 'bGA', GU: 'wGU', gu: 'bGU',
    GD: 'wGD', gd: 'bGD', HM: 'wHM', hm: 'bHM', HF: 'wHF', hf: 'bHF', HG: 'wHG', hg: 'bHG',
    HS: 'wHS', hs: 'bHS', HN: 'wHN', hn: 'bHN', HL: 'wHL', hl: 'bHL', HR: 'wHR', hr: 'bHR',
    IG: 'wIG', ig: 'bIG', KI: 'wKI', ki: 'bKI', KN: 'wKN', kn: 'bKN', KY: 'wKY', ky: 'bKY',
    KM: 'wKM', km: 'bKM', LN: 'wLN', ln: 'bLN', LC: 'wLC', lc: 'bLC', LA: 'wLA', la: 'bLA',
    LG: 'wLG', lg: 'bLG', LT: 'wLT', lt: 'bLT', LS: 'wLS', ls: 'bLS', LH: 'wLH', lh: 'bLH',
    LI: 'wLI', li: 'bLI', LD: 'wLD', ld: 'bLD', LW: 'wLW', lw: 'bLW', LL: 'wLL', ll: 'bLL',
    LU: 'wLU', lu: 'bLU', LO: 'wLO', lo: 'bLO', LB: 'wLB', lb: 'bLB', MD: 'wMD', md: 'bMD',
    ME: 'wME', me: 'bME', MF: 'wMF', mf: 'bMF', MG: 'wMG', mg: 'bMG', MS: 'wMS', ms: 'bMS',
    NK: 'wNK', nk: 'bNK', NS: 'wNS', ns: 'bNS', NB: 'wNB', nb: 'bNB', OK: 'wOK', ok: 'bOK',
    OM: 'wOM', om: 'bOM', OR: 'wOR', or: 'bOR', OC: 'wOC', oc: 'bOC', OG: 'wOG', og: 'bOG',
    OS: 'wOS', os: 'bOS', PW: 'wPW', pw: 'bPW', PC: 'wPC', pc: 'bPC', PH: 'wPH', ph: 'bPH',
    PM: 'wPM', pm: 'bPM', PG: 'wPG', pg: 'bPG', PS: 'wPS', ps: 'bPS', PR: 'wPR', pr: 'bPR',
    PU: 'wPU', pu: 'bPU', RA: 'wRA', ra: 'bRA', RS: 'wRS', rs: 'bRS', RE: 'wRE', re: 'bRE',
    RD: 'wRD', rd: 'bRD', RC: 'wRC', rc: 'bRC', RT: 'wRT', rt: 'bRT', RI: 'wRI', ri: 'bRI',
    RG: 'wRG', rg: 'bRG', RV: 'wRV', rv: 'bRV', RW: 'wRW', rw: 'bRW', RO: 'wRO', ro: 'bRO',
    RM: 'wRM', rm: 'bRM', RK: 'wRK', rk: 'bRK', RR: 'wRR', rr: 'bRR', RU: 'wRU', ru: 'bRU',
    RX: 'wRX', rx: 'bRX', RH: 'wRH', rh: 'bRH', RP: 'wRP', rp: 'bRP', RQ: 'wRQ', rq: 'bRQ',
    RN: 'wRN', rn: 'bRN', RF: 'wRF', rf: 'bRF', RJ: 'wRJ', rj: 'bRJ', RL: 'wRL', rl: 'bRL',
    RB: 'wRB', rb: 'bRB', SV: 'wSV', sv: 'bSV', SB: 'wSB', sb: 'bSB', SI: 'wSI', si: 'bSI',
    SD: 'wSD', sd: 'bSD', SF: 'wSF', sf: 'bSF', SK: 'wSK', sk: 'bSK', SM: 'wSM', sm: 'bSM',
    SX: 'wSX', sx: 'bSX', SS: 'wSS', ss: 'bSS', SN: 'wSN', sn: 'bSN', SW: 'wSW', sw: 'bSW',
    SA: 'wSA', sa: 'bSA', SG: 'wSG', sg: 'bSG', SR: 'wSR', sr: 'bSR', SE: 'wSE', se: 'bSE',
    SL: 'wSL', sl: 'bSL', SU: 'wSU', su: 'bSU', SP: 'wSP', sp: 'bSP', SQ: 'wSQ', sq: 'bSQ',
    TC: 'wTC', tc: 'bTC', ST: 'wST', st: 'bST', SC: 'wSC', sc: 'bSC', WI: 'wWI', wi: 'bWI',
    SO: 'wSO', so: 'bSO', WD: 'wWD', wd: 'bWD', TL: 'wTL', tl: 'bTL', TG: 'wTG', tg: 'bTG',
    TF: 'wTF', tf: 'bTF', TS: 'wTS', ts: 'bTS', VS: 'wVS', vs: 'bVS', VB: 'wVB', vb: 'bVB',
    VH: 'wVH', vh: 'bVH', VL: 'wVL', vl: 'bVL', VM: 'wVM', vm: 'bVM', VP: 'wVP', vp: 'bVP',
    VT: 'wVT', vt: 'bVT', VR: 'wVR', vr: 'bVR', VW: 'wVW', vw: 'bVW', VG: 'wVG', vg: 'bVG',
    VI: 'wVI', vi: 'bVI', VD: 'wVD', vd: 'bVD', VO: 'wVO', vo: 'bVO', VA: 'wVA', va: 'bVA',
    VF: 'wVF', vf: 'bVF', WB: 'wWB', wb: 'bWB', WQ: 'wWQ', wq: 'bWQ', WG: 'wWG', wg: 'bWG',
    WS: 'wWS', ws: 'bWS', WL: 'wWL', wl: 'bWL', WE: 'wWE', we: 'bWE', WH: 'wWH', wh: 'bWH',
    WT: 'wWT', wt: 'bWT', WN: 'wWN', wn: 'bWN', WF: 'wWF', wf: 'bWF', WC: 'wWC', wc: 'bWC',
    WO: 'wWO', wo: 'bWO', DN: 'wDN', dn: 'bDN', WX: 'wWX', wx: 'bWX', WR: 'wWR', wr: 'bWR',
  },
}

function resolvePieceEntry(pieceId, entry, setId) {
  if (typeof entry === 'string') {
    return `../pieces/sets/${setId}/${entry}`
  }
  if (entry.source && entry.file) {
    return `../pieces/sets/${entry.source}/${entry.file}`
  }
  return null
}

function buildPieceImages(pieceSetId, galleryIndex, gameId, variantId) {
  const empty = { images: {}, surface: null, surfaceMap: {} }
  if (!pieceSetId || !galleryIndex) return empty
  const setDef = galleryIndex.find(s => s.id === pieceSetId)
  if (!setDef) return empty
  const images = {}
  const surfaceMap = {}

  if (setDef.extends) {
    const baseDef = galleryIndex.find(s => s.id === setDef.extends)
    if (baseDef) {
      for (const [pieceId, entry] of Object.entries(baseDef.pieces || {})) {
        const path = resolvePieceEntry(pieceId, entry, baseDef.id)
        if (path) images[pieceId] = path
      }
    }
  }

  for (const [pieceId, entry] of Object.entries(setDef.pieces || {})) {
    const path = resolvePieceEntry(pieceId, entry, pieceSetId)
    if (path) images[pieceId] = path
    if (typeof entry === 'object' && entry.surface) {
      surfaceMap[pieceId] = entry.surface
    }
  }

  const fenMap = (variantId && GAME_FEN_OVERRIDES[`${gameId}/${variantId}`]) || GAME_FEN_OVERRIDES[gameId] || FEN_TO_PIECE_ID
  for (const [fenChar, pieceId] of Object.entries(fenMap)) {
    if (images[pieceId]) {
      images[fenChar] = images[pieceId]
    }
    if (surfaceMap[pieceId]) {
      surfaceMap[fenChar] = surfaceMap[pieceId]
    }
  }
  return { images, surface: setDef.surface || null, surfaceMap }
}

const DRAUGHTS_VOCABULARY = {
  w: { type: 'man', color: 'white' },
  b: { type: 'man', color: 'black' },
  W: { type: 'king', color: 'white' },
  B: { type: 'king', color: 'black' },
}

const REVERSI_VOCABULARY = {
  w: { type: 'piece', color: 'white' },
  b: { type: 'piece', color: 'black' },
}

const STONE_VOCABULARY = {
  w: { type: 'stone', color: 'white' },
  b: { type: 'stone', color: 'black' },
}

const TAFL_VOCABULARY = {
  K: { type: 'king', color: 'white' },
  w: { type: 'stone', color: 'white' },
  b: { type: 'stone', color: 'black' },
}

function parseMancalaSetup(notation, pitsPerSide, boardRows) {
  const sections = notation.split(';')
  const players = boardRows === 4 ? 2 : 2
  const pitsPerPlayer = pitsPerSide * (boardRows / 2)
  const pits = new Array(pitsPerPlayer * players).fill(0)
  const stores = [0, 0]
  let sectionIdx = 0
  for (let p = 0; p < players; p++) {
    if (sectionIdx < sections.length) {
      const vals = sections[sectionIdx].split(',').map(s => parseInt(s.trim(), 10) || 0)
      for (let i = 0; i < vals.length && i < pitsPerPlayer; i++) {
        pits[p * pitsPerPlayer + i] = vals[i]
      }
      sectionIdx++
    }
    if (sectionIdx < sections.length) {
      stores[p] = parseInt(sections[sectionIdx].trim(), 10) || 0
      sectionIdx++
    }
  }
  return { pits, stores }
}

function parseBackgammonSetup(notation) {
  const dark = new Array(24).fill(0)
  const light = new Array(24).fill(0)
  if (!notation || notation === 'empty') return { dark, light }
  const pairs = notation.split(',')
  for (const pair of pairs) {
    const [posStr, countSymbol] = pair.split(':')
    if (!countSymbol || posStr === 'home' || posStr === 'bar') continue
    const pos = parseInt(posStr, 10)
    const match = countSymbol.match(/^(\d+)([WB])$/)
    if (!match) continue
    const count = parseInt(match[1], 10)
    const owner = match[2]
    if (owner === 'W') light[pos] = count
    else dark[pos] = count
  }
  return { dark, light }
}

function buildDraughtsFenFromSetup(rows, cols, setup) {
  const setupRows = setup.rows
  const darkOnly = setup.dark !== false
  const fenRows = []
  for (let r = 0; r < rows; r++) {
    let row = ''
    let empty = 0
    for (let c = 0; c < cols; c++) {
      const isDark = (r + c) % 2 === 1
      const isBlackZone = r < setupRows
      const isWhiteZone = r >= rows - setupRows
      const playable = !darkOnly || isDark
      if (playable && isBlackZone) {
        if (empty > 0) { row += empty > 9 ? String(empty) : String(empty); empty = 0 }
        row += 'b'
      } else if (playable && isWhiteZone) {
        if (empty > 0) { row += String(empty); empty = 0 }
        row += 'w'
      } else {
        empty++
      }
    }
    if (empty > 0) row += String(empty)
    fenRows.push(row)
  }
  return fenRows.join('/')
}

function fen4ToPosition(fen4, rows, cols) {
  const position = {}
  const ranks = fen4.split('/')
  for (let r = 0; r < ranks.length && r < rows; r++) {
    let c = 0
    const cells = ranks[r].split(',')
    for (const cell of cells) {
      const trimmed = cell.trim()
      if (/^\d+$/.test(trimmed)) {
        c += parseInt(trimmed, 10)
      } else {
        const file = String.fromCharCode(97 + c)
        const rankNum = rows - r
        position[`${file}${rankNum}`] = trimmed
        c++
      }
    }
  }
  return position
}

const FEN4_OWNERS = { r: 'red', b: 'blue', y: 'yellow', g: 'green' }

function fen4GetOwner(pieceType) {
  if (pieceType.length >= 2) return FEN4_OWNERS[pieceType[0]] || 'white'
  return pieceType === pieceType.toUpperCase() ? 'white' : 'black'
}

const recolourCache = {}

async function loadRecolouredPieces(config, gallery) {
  const setDef = gallery?.find(s => s.id === (config.pieceSet4 || 'mce-4player'))
  if (!setDef || !setDef.owners || !setDef.baseSet) return

  const basePath = `../pieces/sets/${setDef.baseSet}/`
  const images = {}
  const owners = setDef.owners
  const matchColor = setDef.recolourMatch || '#fff'

  const fetches = []
  for (const [pieceId, filename] of Object.entries(setDef.pieces || {})) {
    const ownerPrefix = pieceId[0]
    const ownerName = FEN4_OWNERS[ownerPrefix]
    const ownerColors = owners[ownerName]
    if (!ownerColors) continue

    const cacheKey = `${setDef.baseSet}/${filename}:${ownerColors.fill}`
    if (recolourCache[cacheKey]) {
      images[pieceId] = recolourCache[cacheKey]
      continue
    }

    fetches.push(
      fetch(basePath + filename).then(r => r.text()).then(svg => {
        const tinted = svg.replaceAll(matchColor, ownerColors.fill)
        const dataUri = 'data:image/svg+xml,' + encodeURIComponent(tinted)
        recolourCache[cacheKey] = dataUri
        images[pieceId] = dataUri
      }).catch(() => {})
    )
  }

  await Promise.all(fetches)
  config.pieceImages = images
}

function parseDraughtsFen(fen, rows, cols, vocabulary) {
  const vocab = vocabulary || DRAUGHTS_VOCABULARY
  const position = {}
  const ranks = fen.split('/')
  for (let r = 0; r < ranks.length; r++) {
    let c = 0, i = 0
    const rank = ranks[r]
    while (i < rank.length) {
      const ch = rank[i]
      if (ch >= '0' && ch <= '9') {
        const next = rank[i + 1]
        if (next >= '0' && next <= '9') { c += parseInt(ch + next, 10); i += 2 }
        else { c += parseInt(ch, 10); i++ }
      } else {
        if (vocab[ch]) {
          const file = String.fromCharCode(97 + c)
          const rankNum = rows - r
          position[`${file}${rankNum}`] = { ...vocab[ch] }
        }
        c++; i++
      }
    }
  }
  return position
}

function getHandicapPoints(rows) {
  const off = rows <= 9 ? 2 : 3
  const mid = Math.floor((rows - 1) / 2)
  const far = rows - 1 - off
  // Standard placement order: opposing corners, remaining corners, sides, tengen
  return [
    [off, far], [far, off],
    [off, off], [far, far],
    [mid, off], [mid, far],
    [off, mid], [far, mid],
    [mid, mid],
  ]
}

function buildGoHandicap(count, rows) {
  const points = getHandicapPoints(rows).slice(0, count)
  const position = {}
  const GO_LETTERS = 'abcdefghjklmnopqrst'
  for (const [r, c] of points) {
    const file = GO_LETTERS[c]
    const rank = rows - r
    position[`${file}${rank}`] = { type: 'stone', color: 'black' }
  }
  return position
}

function buildFanoronaPosition(rows, cols) {
  const position = {}
  const midRow = Math.floor(rows / 2)
  const midCol = Math.floor(cols / 2)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const file = String.fromCharCode(97 + c)
      const rank = rows - r
      const sq = `${file}${rank}`
      if (r < midRow) {
        position[sq] = { type: 'stone', color: 'white' }
      } else if (r > midRow) {
        position[sq] = { type: 'stone', color: 'black' }
      } else if (c < midCol) {
        position[sq] = { type: 'stone', color: 'white' }
      } else if (c > midCol) {
        position[sq] = { type: 'stone', color: 'black' }
      }
    }
  }
  return position
}

// ─── APP STATE ──────────────────────────────────────────────────────────────

let state = readStateFromURL()
let galleryIndex = null
let renderMode = 'legacy'
const boardDataCache = {}

function readStateFromURL() {
  const params = new URLSearchParams(window.location.search)
  return {
    game: params.get('game') || 'moddable-chess',
    variant: params.get('variant') || 'standard',
    handicap: parseInt(params.get('handicap')) || 0,
    seed: params.get('seed') || String(Math.floor(Math.random() * 9999999999)),
    style: params.get('style') || 'classic',
    players: parseInt(params.get('players')) || 0,
  }
}

function pushState() {
  const params = new URLSearchParams({ game: state.game, variant: state.variant })
  if (state.handicap) params.set('handicap', state.handicap)
  if (state.seed) params.set('seed', state.seed)
  if (state.style && state.style !== 'classic') params.set('style', state.style)
  if (state.players) params.set('players', state.players)
  history.replaceState(null, '', '?' + params.toString())
}

async function init() {
  galleryIndex = await fetch('../pieces/gallery-index.json').then(r => r.json()).catch(e => { console.error('Gallery load failed:', e); return null })
  populateGames()
  populateVariants()
  bindControls()
  render()
}

function populateGames() {
  const select = document.getElementById('game-select')
  select.innerHTML = ''
  const sorted = Object.entries(GAMES).sort((a, b) => a[1].label.localeCompare(b[1].label))
  for (const [id, game] of sorted) {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = game.label
    select.appendChild(opt)
  }
  select.value = state.game
}

function populateVariants() {
  const select = document.getElementById('variant-select')
  select.innerHTML = ''
  const game = GAMES[state.game]
  if (!game) return
  for (const [id, v] of Object.entries(game.variants)) {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = v.static ? `${v.label} [static]` : v.label
    select.appendChild(opt)
  }
  select.value = state.variant
  updateCoverage()
}

function updateCoverage() {
  const game = GAMES[state.game]
  if (!game) return
  const variants = Object.values(game.variants)
  const dynamic = variants.filter(v => !v.static).length
  const total = variants.length
  const el = document.getElementById('coverage-info')
  if (el) el.textContent = `${dynamic}/${total} dynamic`
}

function bindControls() {
  const modeToggle = document.getElementById('render-mode-toggle')
  if (modeToggle) {
    modeToggle.addEventListener('click', e => {
      const btn = e.target.closest('.mode-btn')
      if (!btn) return
      renderMode = btn.dataset.mode
      modeToggle.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      render()
    })
  }

  document.getElementById('game-select').addEventListener('change', e => {
    state.game = e.target.value
    const game = GAMES[state.game]
    state.variant = Object.keys(game.variants)[0]
    populateVariants()
    pushState()
    render()
  })
  document.getElementById('variant-select').addEventListener('change', e => {
    state.variant = e.target.value
    pushState()
    render()
  })
  document.getElementById('handicap-select').addEventListener('change', e => {
    state.handicap = parseInt(e.target.value) || 0
    pushState()
    render()
  })
  document.getElementById('hex-style-select').addEventListener('change', e => {
    state.style = e.target.value
    pushState()
    render()
  })
  document.getElementById('hex-players-select').addEventListener('change', e => {
    state.players = parseInt(e.target.value) || 0
    pushState()
    render()
  })
  let seedTimer = null
  document.getElementById('hex-seed-input').addEventListener('input', e => {
    clearTimeout(seedTimer)
    seedTimer = setTimeout(() => {
      state.seed = e.target.value || String(Math.floor(Math.random() * 9999999999))
      pushState()
      render()
    }, 300)
  })
  document.getElementById('hex-reseed-btn').addEventListener('click', () => {
    state.seed = String(Math.floor(Math.random() * 9999999999))
    document.getElementById('hex-seed-input').value = state.seed
    pushState()
    render()
  })
  window.addEventListener('resize', () => requestAnimationFrame(fitToView))

  document.getElementById('export-svg-btn').addEventListener('click', exportSvg)
  document.getElementById('export-png-btn').addEventListener('click', exportPng)
}

function exportSvg() {
  const container = document.getElementById('board-svg')
  const svg = container.querySelector('svg')
  if (!svg) return
  const svgString = new XMLSerializer().serializeToString(svg)
  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${state.game}-${state.variant}-${renderMode}.svg`
  a.click()
  URL.revokeObjectURL(url)
}

async function exportPng() {
  const container = document.getElementById('board-svg')
  const svg = container.querySelector('svg')
  if (!svg) return

  // Get actual dimensions from viewBox (most reliable source)
  const vb = svg.getAttribute('viewBox')
  let svgW, svgH
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number)
    svgW = parts[2]
    svgH = parts[3]
  } else {
    svgW = parseInt(svg.getAttribute('width')) || svg.getBoundingClientRect().width || 400
    svgH = parseInt(svg.getAttribute('height')) || svg.getBoundingClientRect().height || 400
  }

  const scale = 2
  const width = svgW * scale
  const height = svgH * scale

  // Clone and ensure explicit width/height so Image renders at full size
  const clone = svg.cloneNode(true)
  clone.setAttribute('width', svgW)
  clone.setAttribute('height', svgH)
  clone.removeAttribute('style')
  await inlineExternalImages(clone)

  const svgString = new XMLSerializer().serializeToString(clone)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const img = new Image()
  img.onload = () => {
    ctx.drawImage(img, 0, 0, width, height)
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${state.game}-${state.variant}-${renderMode}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  img.src = URL.createObjectURL(blob)
}

async function inlineExternalImages(svgEl) {
  const images = svgEl.querySelectorAll('image[href]')
  const promises = [...images].map(async img => {
    const href = img.getAttribute('href')
    if (!href || href.startsWith('data:')) return
    try {
      const resp = await fetch(href)
      const blob = await resp.blob()
      const dataUrl = await new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
      img.setAttribute('href', dataUrl)
    } catch (e) {
      // Leave as-is if fetch fails
    }
  })
  await Promise.all(promises)
}

function getStaticSvgPath(gameId, variantId) {
  const STATIC_PATH_OVERRIDES = {
    'landlords-game/standard': 'landlords-game-board.svg',
    'halma/standard-2p': 'halma-2p-board.svg',
    'halma/standard-4p': 'halma-4p-board.svg',
    'stern-halma/standard': 'stern-halma-board.svg',
    'royal-ur/standard': 'royal-ur-board.svg',
    'surakarta/standard': 'surakarta-board.svg',
    'pachisi/standard': 'pachisi-board.svg',
    'chaupar/standard': 'chaupar-board.svg',
    'hex/standard': 'hex-board.svg',
    'landlords-game/1904-original': '1904-original-board.svg',
    'landlords-game/1906-commercial': '1906-commercial-board.svg',
  }
  const key = `${gameId}/${variantId}`
  const filename = STATIC_PATH_OVERRIDES[key] || `${variantId}-board.svg`
  return `../diagrams/static/${gameId}/${filename}`
}

export function renderMultiBoard(config, game) {
  const { layers } = config
  const { count, layout, labels, fens, colors: layerColors } = layers
  const gap = layout === 'horizontal' ? 20 : 12
  const labelH = 18

  const ts = config.tileSize || 34
  const rows = config.rows || 8
  const cols = config.cols || 8
  const innerPad = 24
  const boardW = cols * ts + innerPad * 2
  const boardH = rows * ts + innerPad * 2
  const pad = 24

  let totalW, totalH
  if (layout === 'horizontal') {
    totalW = count * boardW + (count - 1) * gap + pad * 2
    totalH = boardH + pad * 2 + labelH
  } else {
    totalW = boardW + pad * 2
    totalH = count * (boardH + labelH) + (count - 1) * gap + pad * 2
  }

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">`)
  parts.push(`<rect width="${totalW}" height="${totalH}" fill="#1a1a2e" rx="6"/>`)

  for (let i = 0; i < count; i++) {
    let ox, oy
    if (layout === 'horizontal') {
      ox = pad + i * (boardW + gap)
      oy = pad + labelH
    } else {
      ox = pad
      oy = pad + i * (boardH + labelH + gap)
    }

    // Layer label
    const labelX = ox + boardW / 2
    const labelY = oy - 4
    parts.push(`<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="11" fill="#aaa" font-family="system-ui">${labels[i] || 'Board ' + (i + 1)}</text>`)

    // Build per-layer config and render through consolidated pipeline
    const boardColors = layerColors && layerColors[i]
      ? { lightSquare: layerColors[i].lightSquare || '#f0d9b5', darkSquare: layerColors[i].darkSquare || '#b58863' }
      : config.colors || {}
    const fen = fens && fens[i]
    const position = fen ? fenToPosition(fen, rows, cols) : {}

    const layerConfig = {
      ...config,
      rows, cols, tileSize: ts,
      colors: boardColors,
      position,
      layers: undefined,
    }

    // Use consolidated grid renderer per layer
    const layerSvg = renderConsolidated(layerConfig)
    // Extract inner SVG content (strip outer <svg> and </svg> tags)
    const innerStart = layerSvg.indexOf('>') + 1
    const innerEnd = layerSvg.lastIndexOf('</svg>')
    const innerContent = layerSvg.slice(innerStart, innerEnd)

    parts.push(`<g transform="translate(${ox},${oy})">`)
    parts.push(innerContent)
    parts.push('</g>')
  }

  parts.push('</svg>')
  return parts.join('\n')
}

async function renderSchemaMode(game, variantDef) {
  // Games with separate rendering pipelines or no renderer — leave legacy in place
  if (game.hexGame || game.rpgGame || variantDef.static || game.noRenderer || variantDef.noRenderer) {
    return
  }

  // Load board data if needed (landlords, econopoly)
  if (game.needsBoardData && !boardDataCache[game.needsBoardData]) {
    try {
      const resp = await fetch(`../data/${game.needsBoardData}`)
      if (resp.ok) boardDataCache[game.needsBoardData] = await resp.json()
    } catch { /* continue without data */ }
  }
  const augmented = { ...variantDef }
  if (game.needsBoardData) augmented.boardData = boardDataCache[game.needsBoardData] || null

  // Build runtime positions (handicap, presets, fanorona, draughts)
  if (game.hasHandicap && state.handicap > 0) {
    augmented._position = buildGoHandicap(state.handicap, augmented.rows || 19)
  }
  if (augmented.goPreset) {
    augmented._position = buildGoPreset(augmented.goPreset, augmented.rows || 19)
  }
  if (augmented.fanoronaSetup) {
    augmented._position = buildFanoronaPosition(augmented.rows || 5, augmented.cols || 9)
  }
  if (augmented.draughtsSetup) {
    augmented._position = parseDraughtsFen(
      buildDraughtsFenFromSetup(augmented.rows, augmented.cols, augmented.draughtsSetup),
      augmented.rows, augmented.cols
    )
  }
  if (augmented.asaltoSetup) {
    const pos = {}
    if (augmented.asaltoSetup.officers) for (const idx of augmented.asaltoSetup.officers) pos[`n${idx + 1}`] = { type: 'officer' }
    if (augmented.asaltoSetup.soldiers) for (const idx of augmented.asaltoSetup.soldiers) pos[`n${idx + 1}`] = { type: 'soldier' }
    augmented._position = pos
  }
  if (augmented.fen4) {
    augmented._position = fen4ToPosition(augmented.fen4, augmented.rows || 14, augmented.cols || 14)
  }

  const schema = reverseAdapt(augmented, game, state.game, { players: state.players, seed: state.seed })
  const surface = resolveSurface(schema.surface)
  const { resolved, errors } = cascadeResolve({
    surface,
    family: schema.family,
    variant: schema.variant,
  })

  if (errors.length > 0) {
    showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="#1a1a2e" rx="8"/><text x="200" y="50" text-anchor="middle" font-size="12" fill="#f44" font-family="system-ui">${errors.join('; ')}</text></svg>`)
    return
  }

  const target = document.getElementById('board-svg')
  await renderFromResolved(resolved, target)
  requestAnimationFrame(fitToView)
}

async function render() {
  const game = GAMES[state.game]
  if (!game) return
  let variantDef = game.variants[state.variant]
  if (!variantDef) return


  const handicapGroup = document.getElementById('handicap-group')
  const hexStyleGroup = document.getElementById('hex-style-group')
  const hexSeedGroup = document.getElementById('hex-seed-group')

  if (game.hasHandicap) {
    handicapGroup.style.display = ''
    document.getElementById('handicap-select').value = state.handicap || 0
  } else {
    handicapGroup.style.display = 'none'
  }

  const hexPlayersGroup = document.getElementById('hex-players-group')

  if (game.hexGame) {
    hexStyleGroup.style.display = ''
    hexSeedGroup.style.display = ''
    document.getElementById('hex-style-select').value = state.style || 'classic'
    document.getElementById('hex-seed-input').value = state.seed || ''
    const gameConfig = getGameConfig(game.hexGame)
    if (gameConfig && gameConfig.styles) {
      const styleSelect = document.getElementById('hex-style-select')
      const needed = gameConfig.styles.filter(s => s !== 'realistic')
      const currentOpts = [...styleSelect.options].map(o => o.value)
      if (currentOpts.join() !== needed.join()) {
        styleSelect.innerHTML = ''
        for (const s of needed) {
          const opt = document.createElement('option')
          opt.value = s
          opt.textContent = s === 'classic' ? 'Classic (flat colour)' : s.charAt(0).toUpperCase() + s.slice(1)
          styleSelect.appendChild(opt)
        }
        if (!needed.includes(state.style)) state.style = 'classic'
        styleSelect.value = state.style || 'classic'
      }
    }
    if (gameConfig && gameConfig.playerCounts) {
      const variantDef = game.variants[state.variant]
      const size = variantDef.hexSize || gameConfig.defaultSize
      const counts = gameConfig.playerCounts(size)
      if (counts && counts.length > 1) {
        hexPlayersGroup.style.display = ''
        const playersSelect = document.getElementById('hex-players-select')
        playersSelect.innerHTML = ''
        for (const c of counts) {
          const opt = document.createElement('option')
          opt.value = c
          opt.textContent = c === 0 ? 'None (empty map)' : `${c} players`
          playersSelect.appendChild(opt)
        }
        playersSelect.value = state.players || 0
      } else {
        hexPlayersGroup.style.display = 'none'
      }
    } else {
      hexPlayersGroup.style.display = 'none'
    }
  } else if (game.deckGame) {
    hexStyleGroup.style.display = 'none'
    hexSeedGroup.style.display = ''
    document.getElementById('hex-seed-input').value = state.seed || ''
    const deckConfig = getDeckConfig(game.deckGame)
    const deckVariantKey = variantDef.deckVariant
    const dealSpec = deckConfig?.games[deckVariantKey]
    if (dealSpec && dealSpec.minPlayers < dealSpec.maxPlayers) {
      hexPlayersGroup.style.display = ''
      const playersSelect = document.getElementById('hex-players-select')
      const needed = []
      for (let p = dealSpec.minPlayers; p <= dealSpec.maxPlayers; p++) needed.push(p)
      const currentOpts = [...playersSelect.options].map(o => parseInt(o.value))
      if (currentOpts.join() !== needed.join()) {
        playersSelect.innerHTML = ''
        for (const p of needed) {
          const opt = document.createElement('option')
          opt.value = p
          opt.textContent = `${p} players`
          playersSelect.appendChild(opt)
        }
      }
      if (!state.players || state.players < dealSpec.minPlayers || state.players > dealSpec.maxPlayers) {
        state.players = dealSpec.defaultPlayers
      }
      playersSelect.value = state.players
    } else {
      hexPlayersGroup.style.display = 'none'
      if (dealSpec) state.players = dealSpec.defaultPlayers
    }
  } else {
    hexStyleGroup.style.display = 'none'
    hexSeedGroup.style.display = 'none'
    hexPlayersGroup.style.display = 'none'
  }

  if (variantDef.static) {
    loadStaticSvg(state.game, state.variant, variantDef)
    return
  }

  if (game.rpgGame) {
    renderRpgProvider(state.game)
    showInfo(variantDef)
    return
  }

  if (variantDef.noRenderer || game.noRenderer) {
    showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#1a1a2e" rx="8"/><text x="200" y="85" text-anchor="middle" font-size="16" fill="#888" font-family="system-ui">No renderer yet</text><text x="200" y="115" text-anchor="middle" font-size="12" fill="#555" font-family="system-ui">Needs table topology (issue #8)</text></svg>`)
    showInfo(variantDef)
    return
  }

  if (game.needsBoardData) {
    if (renderMode === 'consolidated' && (game.buildLayout || variantDef.buildLayout)) {
      // Fall through — boardData loaded async below, buildLayout produces layout config
      if (!boardDataCache[game.needsBoardData]) {
        try {
          const resp = await fetch(`../data/${game.needsBoardData}`)
          if (resp.ok) boardDataCache[game.needsBoardData] = await resp.json()
        } catch { /* continue */ }
      }
      variantDef = { ...variantDef, boardData: boardDataCache[game.needsBoardData] || null }
    } else if (renderMode === 'consolidated') {
      showNotImplemented(variantDef.boardStyle || 'boardData'); return
    } else {
      loadBoardDataAndRender(game, variantDef)
      return
    }
  }

  if (game.deckGame) {
    renderDeckGame(game, variantDef)
    return
  }

  if (game.hexGame) {
    if (renderMode === 'consolidated') {
      renderHexGameConsolidated(game, variantDef)
      return
    }
    renderHexGame(game, variantDef)
    return
  }

  const config = { ...variantDef }

  // Build position from FEN4 (4-player) — piece images loaded async
  if (config.fen4) {
    config.position = fen4ToPosition(config.fen4, config.rows, config.cols)
    config.getOwner = fen4GetOwner
    loadRecolouredPieces(config, galleryIndex).then(() => {
      let svg
      if (renderMode === 'consolidated' && isGridProvider(config)) {
        svg = renderConsolidated(config)
      } else if (renderMode === 'consolidated' && isHexProvider(config)) {
        svg = renderConsolidatedHex(config)
      }
      if (!svg) svg = renderBoard(config)
      showSvg(svg)
      showInfo(config)
      bindBoardHover(config)
      requestAnimationFrame(fitToView)
    })
    return
  } else if (config.fen) {
    config.position = fenToPosition(config.fen, config.rows, config.cols)
  }

  // Build position from draughts-vocabulary FEN (setup notation spec)
  // Mancala and backgammon handle pieces internally via their providers
  if (config.setup && config.boardStyle !== 'mancala' && config.boardStyle !== 'backgammon') {
    const vocab = (state.game === 'reversi') ? REVERSI_VOCABULARY
      : (state.game === 'surakarta') ? STONE_VOCABULARY
      : (state.game === 'tafl') ? TAFL_VOCABULARY
      : DRAUGHTS_VOCABULARY
    config.position = parseDraughtsFen(config.setup, config.rows, config.cols, vocab)
  }

  // Parse mancala setup into pit seed counts for the provider
  if (config.setup && config.boardStyle === 'mancala') {
    config.parsedSetup = parseMancalaSetup(config.setup, config.pitsPerSide, config.boardRows || 2)
  }

  // Parse backgammon setup into point counts for the provider
  if (config.setup && config.boardStyle === 'backgammon') {
    config.parsedSetup = parseBackgammonSetup(config.setup)
  }

  // Build draughts position (legacy — will be replaced by setup FEN)
  if (config.draughtsSetup) {
    config.position = parseDraughtsFen(
      buildDraughtsFenFromSetup(config.rows, config.cols, config.draughtsSetup),
      config.rows, config.cols
    )
  }

  // Build Go handicap position
  if (game.hasHandicap && state.handicap > 0) {
    config.position = buildGoHandicap(state.handicap, config.rows)
    config.goHandicap = state.handicap
  }

  // Build Go preset positions (sunjang, tibetan)
  if (config.goPreset) {
    config.position = buildGoPreset(config.goPreset, config.rows)
  }

  // Build fanorona position
  if (config.fanoronaSetup) {
    config.position = buildFanoronaPosition(config.rows, config.cols)
  }

  // Build Asalto position from node indices
  if (config.asaltoSetup) {
    const pos = {}
    const setup = config.asaltoSetup
    if (setup.officers) for (const idx of setup.officers) pos[`n${idx + 1}`] = { type: 'officer' }
    if (setup.soldiers) for (const idx of setup.soldiers) pos[`n${idx + 1}`] = { type: 'soldier' }
    config.position = pos
    // Generate setup notation: node-per-row, O=officer S=soldier .=empty
    const gridDef = config.asaltoGrid || { rows: [[2,3,4],[2,3,4],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[2,3,4],[2,3,4]] }
    const rowStrs = []
    let nodeIdx = 0
    for (const rowCols of gridDef.rows) {
      let row = ''
      for (let c = 0; c < rowCols.length; c++) {
        const p = pos[`n${nodeIdx + 1}`]
        row += p ? (p.type === 'officer' ? 'O' : 'S') : '.'
        nodeIdx++
      }
      rowStrs.push(row)
    }
    config.asaltoNotation = rowStrs.join('/')
  }

  // Pass node names from game definition into config for hover display
  if (game.nodeNames) config.nodeNames = game.nodeNames

  // Build piece image paths and surface map
  const effectivePieceSet = config.pieceSetOverride || game.pieceSet
  if (effectivePieceSet) {
    const built = buildPieceImages(effectivePieceSet, galleryIndex, state.game, state.variant)
    config.pieceImages = built.images
    if (built.surface) config.pieceSurface = built.surface
    if (Object.keys(built.surfaceMap).length) config.pieceSurfaceMap = built.surfaceMap
  }

  // Multi-board rendering (Alice Chess, Gygax Chess)
  if (config.layers) {
    const svg = renderMultiBoard(config, game)
    // Build per-layer positions for hover
    const layerPositions = (config.layers.fens || []).map(fen => fen ? fenToPosition(fen, config.rows, config.cols) : {})
    config.layerPositions = layerPositions
    config.position = Object.assign({}, ...layerPositions)
    showSvg(svg)
    showInfo(config)
    bindBoardHover(config)
    requestAnimationFrame(fitToView)
    return
  }

  // Build layout from variant or family declaration
  const layoutBuilder = config.buildLayout || game.buildLayout
  if (layoutBuilder && !config.layout) {
    config.layout = layoutBuilder(config.rows || 8, config.cols || 8, config.tileSize || 56, config.colors || {}, config)
  }

  // Stern-halma: build position from filledArms + layout nodes (consolidated mode only)
  if (renderMode === 'consolidated' && config.filledArms && config.layout && config.layout.nodes && !config.position) {
    const armOrder = ['N', 'NE', 'SE', 'S', 'SW', 'NW']
    const armKeys = ['red-circle', 'blue-circle', 'green-circle', 'black-circle', 'purple-circle', 'brown-circle']
    const pos = {}
    for (const armName of config.filledArms) {
      const colorIdx = armOrder.indexOf(armName)
      const key = armKeys[colorIdx]
      for (const node of config.layout.nodes) {
        if (node.arm === armName) pos[node.id] = key
      }
    }
    config.position = pos
  }

  let svg
  if (renderMode === 'consolidated') {
    if (isGridProvider(config)) {
      svg = renderConsolidated(config)
    } else if (isHexProvider(config)) {
      svg = renderConsolidatedHex(config)
    } else if (isGraphProvider(config)) {
      svg = renderConsolidatedGraph(config)
    } else if (isPitProvider(config)) {
      svg = renderConsolidatedPit(config)
    } else if (isTrackProvider(config)) {
      svg = renderConsolidatedTrack(config)
    }
    if (!svg) {
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#1a1a2e" rx="8"/><text x="200" y="80" text-anchor="middle" font-size="14" fill="#e8a030" font-family="system-ui">Final mode — not yet implemented</text><text x="200" y="110" text-anchor="middle" font-size="12" fill="#888" font-family="system-ui">Provider: ${config.boardStyle || 'unknown'}</text><text x="200" y="135" text-anchor="middle" font-size="11" fill="#555" font-family="system-ui">Switch to Original to view</text></svg>`
    }
  } else {
    svg = renderBoard(config)
  }
  showSvg(svg)
  showInfo(config)
  if (config.overlays) {
    const overlaySquares = {}
    for (const overlay of config.overlays) {
      if (overlay.path) {
        for (const sq of overlay.path) overlaySquares[sq] = overlay.type || 'overlay'
      }
    }
    config._overlaySquares = overlaySquares
  }
  bindBoardHover(config)
  requestAnimationFrame(fitToView)
}

function renderHexGame(game, variantDef) {
  const gameConfig = getGameConfig(game.hexGame)
  if (!gameConfig) {
    showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="100" y="35" text-anchor="middle" font-size="12" fill="#888">No generator: "${game.hexGame}"</text></svg>`)
    return
  }

  const size = variantDef.hexSize || gameConfig.defaultSize
  const players = state.players || gameConfig.defaultPlayers || 0
  const seed = state.seed
  const style = state.style || 'classic'
  const layout = variantDef.hexLayout || null

  const hexes = gameConfig.generate(size, players, seed, layout)
  if (!hexes || hexes.length === 0) {
    showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="100" y="35" text-anchor="middle" font-size="12" fill="#888">Empty map</text></svg>`)
    return
  }

  const colors = gameConfig.getColors ? gameConfig.getColors() : {}
  const images = gameConfig.getImages ? gameConfig.getImages(style) : null
  const rendererOpts = gameConfig.rendererOptions ? gameConfig.rendererOptions() : {}

  const hasPerHexImages = images && images._perHex
  const hasTypeImages = images && !images._perHex

  const svgOpts = {
    hexSize: rendererOpts.hexSize || 40,
    flat: rendererOpts.flat || gameConfig.orientation === 'flat',
    colors,
    images: (style !== 'classic' && hasTypeImages) ? images : null,
    imageMode: (style !== 'classic' && (hasTypeImages || hasPerHexImages)) ? 'href' : 'none',
    strokeColor: 'rgba(0,0,0,0.3)',
    strokeWidth: 1,
    padding: 15,
    scaleFactor: 0.95,
    labels: gameConfig.labels !== false,
    bgColor: null,
  }

  const svg = HexSvg.toSVG(hexes, svgOpts)
  showSvg(svg)
  showInfo({
    hexGame: game.hexGame,
    hexSize: size,
    hexCount: hexes.length,
    seed,
    style,
    label: variantDef.label,
  })
  bindHexHover(gameConfig)
  requestAnimationFrame(fitToView)
}

function renderHexGameConsolidated(game, variantDef) {
  const gameConfig = getGameConfig(game.hexGame)
  if (!gameConfig) {
    showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="100" y="35" text-anchor="middle" font-size="12" fill="#888">No generator: "${game.hexGame}"</text></svg>`)
    return
  }

  const size = variantDef.hexSize || gameConfig.defaultSize
  const players = state.players || gameConfig.defaultPlayers || 0
  const seed = state.seed
  const style = state.style || 'classic'
  const layout = variantDef.hexLayout || null

  const hexes = gameConfig.generate(size, players, seed, layout)
  if (!hexes || hexes.length === 0) {
    showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="100" y="35" text-anchor="middle" font-size="12" fill="#888">Empty map</text></svg>`)
    return
  }

  const colors = gameConfig.getColors ? gameConfig.getColors() : {}
  const images = gameConfig.getImages ? gameConfig.getImages(style) : null
  const rendererOpts = gameConfig.rendererOptions ? gameConfig.rendererOptions() : {}
  const flat = rendererOpts.flat || gameConfig.orientation === 'flat'
  const cellSize = rendererOpts.hexSize || 40

  const hasPerHexImages = images && images._perHex
  const hasTypeImages = images && !images._perHex
  const useImages = style !== 'classic' && (hasTypeImages || hasPerHexImages)

  let cellImage = null
  if (useImages) {
    if (hasPerHexImages) {
      cellImage = (q, r, hex) => hex.imagePath || null
    } else if (hasTypeImages) {
      cellImage = (q, r, hex) => images[hex.type] || null
    }
  }

  const config = {
    label: variantDef.label,
    layout: {
      hexes,
      orientation: flat ? 'flat' : 'pointy',
      cellSize,
      scale: 0.95,
      background: null,
      frame: null,
      cellFill: (q, r, hex) => colors[hex.type] || '#666',
      cellStroke: { color: 'rgba(0,0,0,0.3)', width: 1 },
      cellImage,
      cellLabel: gameConfig.labels !== false ? (q, r, hex) => hex.label || null : null,
      overlays: hexes.filter(h => h.overlay).map(h => ({
        q: h.q, r: h.r,
        color: h.overlay.color || '#C62828',
        text: h.overlay.text || null,
        radius: h.overlay.size || 0.35,
      })),
    },
  }

  const svg = renderConsolidatedHex(config)
  showSvg(svg)
  showInfo({
    hexGame: game.hexGame,
    hexSize: size,
    hexCount: hexes.length,
    seed,
    style,
    label: variantDef.label,
  })
  bindHexHover(gameConfig)
  requestAnimationFrame(fitToView)
}

function renderDeckGame(game, variantDef) {
  const deckType = game.deckGame
  const deckConfig = getDeckConfig(deckType)
  if (!deckConfig) {
    showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#1a1a2e" rx="8"/><text x="200" y="100" text-anchor="middle" font-size="14" fill="#888" font-family="system-ui">Unknown deck: "${deckType}"</text></svg>`)
    return
  }

  const gameKey = variantDef.deckVariant
  const dealSpec = deckConfig.games[gameKey]
  if (!dealSpec) {
    showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#1a1a2e" rx="8"/><text x="200" y="100" text-anchor="middle" font-size="14" fill="#888" font-family="system-ui">No deal spec: "${gameKey}"</text></svg>`)
    return
  }

  const seed = state.seed
  const players = state.players || dealSpec.defaultPlayers
  const activeDealSpec = { ...dealSpec, players }
  const createOpts = deckType === 'standard-dice'
    ? { count: (dealSpec.perPlayer || 0) * players + (dealSpec.community || 0) }
    : dealSpec
  const cards = createDeck(deckType, createOpts)
  const shuffled = shuffle(cards, seed)
  const dealResult = deal(shuffled, activeDealSpec)

  if (deckType === 'standard-dice' && deckConfig.roll) {
    for (let i = 0; i < dealResult.hands.length; i++) {
      dealResult.hands[i] = deckConfig.roll(dealResult.hands[i], seed + i)
    }
    if (dealResult.community.length > 0) {
      dealResult.community = deckConfig.roll(dealResult.community, seed + 99)
    }
  }

  if (dealResult.layout === 'tableau') {
    renderTableauSvg(dealResult, { deckType, deckConfig, variantDef, seed })
    return
  }

  if (activeDealSpec.layout === 'mahjong-wall') {
    renderMahjongSvg(dealResult, { deckType, deckConfig, variantDef, seed, tileSet: activeDealSpec.tileSet || 'mahjong-regular' })
    return
  }

  const cardW = deckType === 'dominoes-28' ? 32 : deckType === 'standard-dice' ? 48 : 44
  const cardH = deckType === 'dominoes-28' ? 60 : deckType === 'standard-dice' ? 48 : 64
  const maxHand = Math.max(...dealResult.hands.map(h => h.length), dealResult.community.length)
  const handWidth = maxHand * (cardW + 4)
  const handHalfW = handWidth / 2
  const handHalfH = cardH / 2
  const separationNeeded = handWidth + 20
  const minRingFromSeparation = separationNeeded / (2 * Math.sin(Math.PI / players))
  const communityWidth = dealResult.community.length * (cardW + 4)
  const hasDrawPile = dealResult.drawPile.length > 0
  const drawPileWidth = hasDrawPile ? cardW + 8 : 0
  const centreZoneHalfW = (communityWidth + drawPileWidth) / 2
  const minRingFromCommunity = centreZoneHalfW + handHalfW + 20
  const minRing = Math.max(minRingFromSeparation, minRingFromCommunity, 150)

  const tableW = (minRing + handHalfW) * 2 + 40
  const tableH = (minRing + handHalfH) * 2 + 60

  const tableLayout = layoutTable(dealResult, {
    players,
    tableWidth: tableW,
    tableHeight: tableH,
    cardW,
    cardH,
    handStyle: 'spread',
  })

  const svg = renderDeckSvg(tableLayout, {
    tableW, tableH, cardW, cardH,
    deckLabel: deckConfig.label,
    gameLabel: variantDef.label,
    deckType,
    seed,
  })

  const notation = encodeDeckState(dealResult, deckType, seed, players)

  showSvg(svg)
  showInfo({
    deckType,
    gameKey,
    seed,
    players,
    cardsPerHand: dealResult.hands[0]?.length || 0,
    community: dealResult.community.length,
    drawPile: dealResult.drawPile.length,
    label: variantDef.label,
    setupDesc: variantDef.setupDesc,
    variantDesc: variantDef.variantDesc,
    deckNotation: notation,
  })
  bindDeckHover()
  requestAnimationFrame(fitToView)
}

function encodeDeckState(dealResult, deckType, seed, players) {
  const parts = [`${deckType}:${seed}:${players}`]
  for (let i = 0; i < dealResult.hands.length; i++) {
    const ids = dealResult.hands[i].map(c => c.id)
    parts.push(`h${i}=${ids.join(',')}`)
  }
  if (dealResult.community.length > 0) {
    parts.push(`f=${dealResult.community.map(c => c.id).join(',')}`)
  }
  parts.push(`d=${dealResult.drawPile.length}`)
  return parts.join('|')
}

function bindDeckHover() {
  const infoBar = document.getElementById('hex-info-bar')
  const svgContainer = document.getElementById('board-svg')
  infoBar.classList.add('active')
  infoBar.textContent = 'Hover over a card or zone'

  svgContainer.addEventListener('mouseover', e => {
    const card = e.target.closest('[data-card]')
    const zone = e.target.closest('[data-zone]')
    if (card && zone) {
      infoBar.textContent = `${card.dataset.card} · ${zone.dataset.zone}`
    } else if (card) {
      infoBar.textContent = card.dataset.card
    } else if (zone) {
      infoBar.textContent = zone.dataset.zone
    }
  })

  svgContainer.addEventListener('mouseleave', () => {
    infoBar.textContent = 'Hover over a card or zone'
  })
}

export function renderDeckSvg(layout, opts) {
  const { tableW, tableH, cardW, cardH, deckLabel, gameLabel, deckType, seed } = opts
  const pad = 20
  const w = tableW + pad * 2
  const h = tableH + pad * 2
  const parts = []

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`)
  parts.push(`<style>svg text{pointer-events:none;cursor:default}[data-card],[data-zone]{cursor:pointer}</style>`)
  parts.push(`<rect width="${w}" height="${h}" fill="#1b5e3a" rx="16"/>`)
  parts.push(`<rect x="${pad}" y="${pad}" width="${tableW}" height="${tableH}" fill="#2d7a4f" rx="12" stroke="#1a4a2e" stroke-width="2"/>`)

  for (const hand of layout.hands) {
    const zoneDesc = hand.cards[0]?.faceUp ? `${hand.label} — ${hand.cards.length} cards (visible)` : `${hand.label} — ${hand.cards.length} cards (hidden)`
    parts.push(`<g class="hand" data-zone="${zoneDesc}">`)
    for (const pos of hand.cards) {
      parts.push(renderCard(pos, cardW, cardH, pad, deckType))
    }
    const midIdx = Math.floor(hand.cards.length / 2)
    const labelX = hand.cards.length > 0 ? (hand.cards[0].x + hand.cards[hand.cards.length - 1].x) / 2 + pad : tableW / 2 + pad
    const labelY = hand.cards.length > 0 ? hand.cards[0].y + pad : tableH / 2 + pad
    const isBottom = labelY > tableH / 2 + pad
    const labelOffset = isBottom ? cardH / 2 + 14 : -cardH / 2 - 6
    parts.push(`<text x="${labelX}" y="${labelY + labelOffset}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,0.6)" font-family="system-ui">${hand.label} (${hand.cards.length})</text>`)
    parts.push('</g>')
  }

  if (layout.community && layout.community.length > 0) {
    parts.push(`<g class="community" data-zone="Community / Field — ${layout.community.length} cards (face up)">`)
    for (const pos of layout.community) {
      parts.push(renderCard(pos, cardW, cardH, pad, deckType))
    }
    const cy = layout.community[0].y + pad + cardH / 2 + 14
    parts.push(`<text x="${tableW / 2 + pad}" y="${cy}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.5)" font-family="system-ui">Field (${layout.community.length})</text>`)
    parts.push('</g>')
  }

  if (layout.drawPile && layout.drawPile.length > 0) {
    const dp = layout.drawPile[0]
    const dx = dp.x + pad
    const dy = dp.y + pad
    const count = dp.count || layout.drawPile.length
    const backPath = getCardBackPath(deckType)
    parts.push(`<g data-zone="Draw pile — ${count} cards remaining (face down)">`)
    const stackDepth = Math.min(4, count)
    for (let s = stackDepth - 1; s >= 0; s--) {
      const sx = dx - s * 1.5
      const sy = dy - s * 1.5
      if (backPath) {
        parts.push(`<image href="${backPath}" x="${sx - cardW / 2}" y="${sy - cardH / 2}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/>`)
      } else {
        parts.push(`<rect x="${sx - cardW / 2}" y="${sy - cardH / 2}" width="${cardW}" height="${cardH}" fill="#2a3a6a" rx="3" stroke="#1a2a4a" stroke-width="1"/>`)
      }
    }
    parts.push(`<text x="${dx}" y="${dy + 3}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,0.85)" font-family="system-ui" font-weight="bold">${count}</text>`)
    parts.push('</g>')
  }

  parts.push(`<text x="${w / 2}" y="${h - 6}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.3)" font-family="system-ui">${deckLabel} · ${gameLabel} · seed: ${seed !== undefined ? seed : ''}</text>`)
  parts.push('</svg>')
  return parts.join('\n')
}

function getCardImagePath(card, deckType, opts) {
  if (deckType === 'standard-52') {
    if (card.suit === 'joker') return `../pieces/sets/letele-cards/J-1.svg`
    const suitLetter = { spades: 'S', hearts: 'H', clubs: 'C', diamonds: 'D' }[card.suit]
    const rank = card.rank === '10' ? '10' : card.rank
    return `../pieces/sets/letele-cards/${suitLetter}-${rank}.svg`
  }
  if (deckType === 'hanafuda-48') {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const month = monthNames[card.monthIndex]
    const type = card.type.charAt(0).toUpperCase() + card.type.slice(1)
    const name = card.name
    if (name.match(/Plain \d/)) {
      return `../pieces/sets/hanafuda-traditional/Hanafuda_${month}_${type}_${name.slice(-1)}_Alt.svg`
    }
    return `../pieces/sets/hanafuda-traditional/Hanafuda_${month}_${type}_Alt.svg`
  }
  if (deckType === 'bavarian-32') {
    const suitMap = { acorns: 'eichel', leaves: 'blatt', hearts: 'hart', bells: 'schellen' }
    const suit = suitMap[card.suit]
    const faceMap = {
      eichel: { 'U': '11_unter', 'O': '12_ober', 'K': '13_konig', 'A': '01_daus' },
      hart:   { 'U': '11_unter', 'O': '12_ober', 'K': '13_konig', 'A': '01_daus' },
      blatt:  { 'U': '11_jack', 'O': '12_queen', 'K': '13_king', 'A': '01_daus' },
      schellen: { 'U': '11_jack', 'O': '12_queen', 'K': '13_king', 'A': '01' },
    }
    const numericMap = { '7': '07', '8': '08', '9': '09', '10': '10' }
    const rank = faceMap[suit]?.[card.rank] || numericMap[card.rank] || card.rank
    return `../pieces/sets/mfrasca-skat/Playing_card-german-${suit}-${rank}.svg`
  }
  if (deckType === 'mahjong-136') {
    if (opts?.tileSet === 'mahjong-planar') {
      const suitFileMap = { bamboo: 'tiao', circles: 'bing', characters: 'wan' }
      const windFileMap = { east: 'Eastwind', south: 'Southwind', west: 'Westwind', north: 'Northwind' }
      const dragonFileMap = { red: 'Reddragon', green: 'Greendragon', white: 'Whitedragon' }
      const flowerFileMap = { 1: 'mei', 2: 'lan', 3: 'ju', 4: 'zhu' }
      const seasonFileMap = { 1: 'spring', 2: 'summer', 3: 'autumn', 4: 'winter' }
      if (card.suit === 'wind') return `../pieces/sets/mahjong-planar/MJ${windFileMap[card.rank]}.svg`
      if (card.suit === 'dragon') return `../pieces/sets/mahjong-planar/MJ${dragonFileMap[card.rank]}.svg`
      if (card.suit === 'flower') return `../pieces/sets/mahjong-planar/MJ${flowerFileMap[card.rank]}.svg`
      if (card.suit === 'season') return `../pieces/sets/mahjong-planar/MJ${seasonFileMap[card.rank]}.svg`
      if (suitFileMap[card.suit]) return `../pieces/sets/mahjong-planar/MJ${card.rank}${suitFileMap[card.suit]}.svg`
      return null
    }
    const suitFileMap = { bamboo: 'Sou', circles: 'Pin', characters: 'Man' }
    const windFileMap = { east: 'Ton', south: 'Nan', west: 'Shaa', north: 'Pei' }
    const dragonFileMap = { red: 'Chun', green: 'Hatsu', white: 'Haku' }
    if (card.suit === 'wind') return `../pieces/sets/mahjong-regular/${windFileMap[card.rank]}.svg`
    if (card.suit === 'dragon') return `../pieces/sets/mahjong-regular/${dragonFileMap[card.rank]}.svg`
    if (suitFileMap[card.suit]) return `../pieces/sets/mahjong-regular/${suitFileMap[card.suit]}${card.rank}.svg`
    return null
  }
  if (deckType === 'standard-dice') {
    const valueNames = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' }
    const name = valueNames[card.value]
    if (name) return `../pieces/sets/playstrategy-backgammon/wdice${name}.svg`
    return `../pieces/sets/playstrategy-backgammon/wdicerandom.svg`
  }
  if (deckType === 'dominoes-28') {
    const a = String(card.low).padStart(2, '0')
    const b = String(card.high).padStart(2, '0')
    return `../pieces/sets/dominoes-classic/domino-${a}-${b}.svg`
  }
  return null
}

function getCardBackPath(deckType) {
  if (deckType === 'standard-52') return `../pieces/sets/letele-cards/B-1.svg`
  if (deckType === 'mahjong-136') return `../pieces/sets/mahjong-regular/Back.svg`
  if (deckType === 'dominoes-28') return `../pieces/sets/dominoes-classic/domino-back.svg`
  return null
}

function renderCard(pos, cardW, cardH, pad, deckType) {
  const x = pos.x + pad - cardW / 2
  const y = pos.y + pad - cardH / 2
  const rot = pos.rot ? ` transform="rotate(${pos.rot.toFixed(1)} ${pos.x + pad} ${pos.y + pad})"` : ''
  const cardLabel = pos.card?.display || pos.card?.id || '?'

  const tileBgDecks = new Set(['mahjong-136', 'dominoes-28'])
  const needsTileBg = tileBgDecks.has(deckType)

  if (!pos.faceUp) {
    const backPath = getCardBackPath(deckType)
    if (backPath && needsTileBg) {
      const inset = 3
      return `<g${rot} data-card="Face down"><rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="#f0ede6" rx="4" stroke="#bbb" stroke-width="0.8"/><image href="${backPath}" x="${x + inset}" y="${y + inset}" width="${cardW - inset * 2}" height="${cardH - inset * 2}" preserveAspectRatio="xMidYMid meet"/></g>`
    }
    if (backPath) {
      return `<g${rot} data-card="Face down"><image href="${backPath}" x="${x}" y="${y}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/></g>`
    }
    return `<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="#2a3a6a" rx="3" stroke="#1a2a4a" stroke-width="1"${rot} data-card="Face down"/>`
  }

  const card = pos.card
  const imgPath = getCardImagePath(card, deckType)

  if (imgPath) {
    if (needsTileBg) {
      const inset = 3
      return `<g${rot} data-card="${cardLabel}"><rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="#f0ede6" rx="4" stroke="#bbb" stroke-width="0.8"/><image href="${imgPath}" x="${x + inset}" y="${y + inset}" width="${cardW - inset * 2}" height="${cardH - inset * 2}" preserveAspectRatio="xMidYMid meet"/></g>`
    }
    return `<g${rot} data-card="${cardLabel}"><image href="${imgPath}" x="${x}" y="${y}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/></g>`
  }

  const parts = []
  parts.push(`<g${rot} data-card="${cardLabel}">`)
  parts.push(`<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="#fff" rx="3" stroke="#ccc" stroke-width="0.5"/>`)
  const fs = Math.min(cardW * 0.3, 10)
  parts.push(`<text x="${x + cardW / 2}" y="${y + cardH / 2 + fs * 0.35}" text-anchor="middle" font-size="${fs}" fill="#333" font-family="system-ui">${card.display || '?'}</text>`)
  parts.push('</g>')
  return parts.join('')
}

export function renderMahjongSvg(dealResult, opts) {
  const { deckType, deckConfig, variantDef, seed, tileSet } = opts
  const tileW = 30
  const tileH = 40
  const tileGap = 2
  const stackOffset = 3
  const pad = 20
  const outerPad = 20

  const wallTiles = dealResult.drawPile.length
  const totalStacks = Math.ceil(wallTiles / 2)
  const stacksPerSide = Math.ceil(totalStacks / 4)
  const step = tileW + tileGap
  const wallLen = stacksPerSide * step
  const wallSquare = wallLen + 2 * tileH

  const handSize = Math.max(...dealResult.hands.map(h => h.length))
  const handLen = handSize * step
  const totalSize = Math.max(wallSquare + 140, handLen + 2 * (pad + tileH) + 40)

  const w = totalSize + outerPad * 2
  const h = w

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`)
  parts.push(`<style>svg text{pointer-events:none;cursor:default}[data-card],[data-zone]{cursor:pointer}</style>`)
  parts.push(`<rect width="${w}" height="${h}" fill="#1b5e3a" rx="16"/>`)
  parts.push(`<rect x="${outerPad}" y="${outerPad}" width="${totalSize}" height="${totalSize}" fill="#2d7a4f" rx="12" stroke="#1a4a2e" stroke-width="2"/>`)
  parts.push(`<g transform="translate(${outerPad},${outerPad})">`)

  const cx = totalSize / 2
  const cy = totalSize / 2
  const halfSquare = wallSquare / 2

  const breakPoint = (seed % totalStacks)
  const windNames = ['South', 'East', 'North', 'West']

  let stackCount = 0
  for (let side = 0; side < 4; side++) {
    const sideStacks = Math.min(stacksPerSide, totalStacks - stackCount)
    const tilesOnSide = Math.min(sideStacks * 2, wallTiles - stackCount * 2)
    const isLiveEnd = breakPoint >= stackCount && breakPoint < stackCount + sideStacks
    const startIdx = stackCount
    const zoneLabel = `Wall — ${windNames[side]} side · ${tilesOnSide} tiles (${sideStacks} stacks of 2)${isLiveEnd ? ' · draw from here' : ''}`
    parts.push(`<g data-zone="${zoneLabel}">`)

    for (let i = 0; i < sideStacks; i++) {
      const globalIdx = startIdx + i
      const remaining = wallTiles - globalIdx * 2
      const height = Math.min(2, remaining)
      let tx, ty, rw, rh

      // Four equal-length walls, each centred on its side, small corner gaps
      const half = wallLen / 2
      const inset = half + tileH
      if (side === 0) {
        tx = cx - half + i * step
        ty = cy + inset - tileH
        rw = tileW; rh = tileH
      } else if (side === 1) {
        tx = cx + inset - tileH
        ty = cy + half - (i + 1) * step
        rw = tileH; rh = tileW
      } else if (side === 2) {
        tx = cx + half - (i + 1) * step
        ty = cy - inset
        rw = tileW; rh = tileH
      } else {
        tx = cx - inset
        ty = cy - half + i * step
        rw = tileH; rh = tileW
      }

      const soX = side === 1 ? -stackOffset : side === 3 ? stackOffset : 0
      const soY = side === 0 ? -stackOffset : side === 2 ? stackOffset : 0
      parts.push(`<g data-card="Stack ${globalIdx + 1} · ${height} tile${height > 1 ? 's' : ''} high${globalIdx === breakPoint ? ' · BREAK' : ''}">`)
      if (height === 2) {
        parts.push(`<rect x="${tx + soX}" y="${ty + soY}" width="${rw}" height="${rh}" fill="#d4c9a8" rx="3" stroke="#a89060" stroke-width="0.5"/>`)
      }
      parts.push(`<rect x="${tx}" y="${ty}" width="${rw}" height="${rh}" fill="#f0ede6" rx="3" stroke="#bbb" stroke-width="0.6"/>`)
      if (globalIdx === breakPoint) {
        parts.push(`<rect x="${tx}" y="${ty}" width="${rw}" height="${rh}" fill="none" rx="3" stroke="#ffcc00" stroke-width="1.5"/>`)
      }
      parts.push('</g>')
    }
    parts.push('</g>')
    stackCount += sideStacks
  }

  const playerLabels = ['South (you)', 'East', 'North', 'West']
  for (let p = 0; p < 4; p++) {
    const hand = dealResult.hands[p]
    const faceUp = p === 0
    const label = playerLabels[p]
    const zoneDesc = faceUp ? `${label} — ${hand.length} tiles (visible)` : `${label} — ${hand.length} tiles (hidden)`
    parts.push(`<g data-zone="${zoneDesc}">`)

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i]
      const cardLabel = faceUp ? (card.display || card.id) : 'Face down'
      let tx, ty

      if (p === 0) {
        tx = cx - (hand.length * (tileW + tileGap)) / 2 + i * (tileW + tileGap)
        ty = totalSize - pad - tileH
      } else if (p === 1) {
        tx = totalSize - pad - tileH
        ty = cy + (hand.length * (tileW + tileGap)) / 2 - (i + 1) * (tileW + tileGap)
      } else if (p === 2) {
        tx = cx + (hand.length * (tileW + tileGap)) / 2 - (i + 1) * (tileW + tileGap)
        ty = pad
      } else {
        tx = pad
        ty = cy - (hand.length * (tileW + tileGap)) / 2 + i * (tileW + tileGap)
      }

      const isVertical = p === 1 || p === 3
      const rw = isVertical ? tileH : tileW
      const rh = isVertical ? tileW : tileH

      if (faceUp) {
        const imgPath = getCardImagePath(card, deckType, { tileSet })
        const inset = 2
        parts.push(`<g data-card="${cardLabel}"><rect x="${tx}" y="${ty}" width="${rw}" height="${rh}" fill="#f0ede6" rx="4" stroke="#bbb" stroke-width="0.8"/><image href="${imgPath}" x="${tx + inset}" y="${ty + inset}" width="${rw - inset * 2}" height="${rh - inset * 2}" preserveAspectRatio="xMidYMid meet"/></g>`)
      } else {
        parts.push(`<g data-card="${cardLabel}"><rect x="${tx}" y="${ty}" width="${rw}" height="${rh}" fill="#f0ede6" rx="4" stroke="#bbb" stroke-width="0.8"/><rect x="${tx + 2}" y="${ty + 2}" width="${rw - 4}" height="${rh - 4}" fill="#c8a96e" rx="2" opacity="0.4"/></g>`)
      }
    }

    const labelPositions = [
      { x: cx, y: totalSize - 4, anchor: 'middle' },
      { x: totalSize - 4, y: cy, anchor: 'middle', rotate: true },
      { x: cx, y: 12, anchor: 'middle' },
      { x: 12, y: cy, anchor: 'middle', rotate: true },
    ]
    const lp = labelPositions[p]
    const rotAttr = lp.rotate ? ` transform="rotate(-90 ${lp.x} ${lp.y})"` : ''
    parts.push(`<text x="${lp.x}" y="${lp.y}" text-anchor="${lp.anchor}" font-size="10" fill="rgba(255,255,255,0.5)" font-family="system-ui"${rotAttr}>${label} (${hand.length})</text>`)
    parts.push('</g>')
  }

  parts.push('</g>')
  parts.push(`<text x="${w / 2}" y="${h - 6}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.3)" font-family="system-ui">${deckConfig.label} · ${variantDef.label} · seed: ${seed}</text>`)
  parts.push('</svg>')

  const svg = parts.join('\n')
  if (opts._returnOnly) return svg
  showSvg(svg)
  showInfo({
    deckType,
    seed,
    players: 4,
    label: variantDef.label,
    setupDesc: variantDef.setupDesc,
    variantDesc: variantDef.variantDesc,
    wall: `${wallTiles} tiles (${totalStacks} stacks), break at stack ${breakPoint + 1}`,
    tilesPerHand: dealResult.hands[0]?.length || 0,
  })
  bindDeckHover()
  requestAnimationFrame(fitToView)
}

export function renderTableauSvg(dealResult, opts) {
  const { deckType, deckConfig, variantDef, seed } = opts
  const cardW = 44
  const cardH = 64
  const colGap = 6
  const cascadeStep = 18
  const pad = 20

  const numCols = dealResult.tableau.length
  const maxCascade = Math.max(...dealResult.tableau.map(col => col.length))
  const tableauW = numCols * (cardW + colGap) - colGap
  const tableauH = cardH + (maxCascade - 1) * cascadeStep

  const foundationY = pad
  const tableauY = foundationY + cardH + 20
  const totalW = tableauW + pad * 2
  const totalH = tableauY + tableauH + pad + 20
  const tableauX = pad

  const outerPad = 20
  const w = totalW + outerPad * 2
  const h = totalH + outerPad * 2

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`)
  parts.push(`<style>svg text{pointer-events:none;cursor:default}[data-card],[data-zone]{cursor:pointer}</style>`)
  parts.push(`<rect width="${w}" height="${h}" fill="#1b5e3a" rx="16"/>`)
  parts.push(`<rect x="${outerPad}" y="${outerPad}" width="${totalW}" height="${totalH}" fill="#2d7a4f" rx="12" stroke="#1a4a2e" stroke-width="2"/>`)
  parts.push(`<g transform="translate(${outerPad},${outerPad})">`)

  const suitNames = ['Spades', 'Hearts', 'Clubs', 'Diamonds']
  const suitSymbols = ['♠', '♥', '♣', '♦']
  const foundationX = totalW - 4 * (cardW + colGap) - pad + colGap
  for (let f = 0; f < 4; f++) {
    const fx = foundationX + f * (cardW + colGap)
    parts.push(`<g data-zone="Foundation — ${suitNames[f]} (build A→K)">`)
    parts.push(`<rect x="${fx}" y="${foundationY}" width="${cardW}" height="${cardH}" fill="rgba(0,0,0,0.01)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" rx="3" stroke-dasharray="4 2"/>`)
    parts.push(`<text x="${fx + cardW / 2}" y="${foundationY + cardH / 2 + 5}" text-anchor="middle" font-size="14" fill="rgba(255,255,255,0.2)">${suitSymbols[f]}</text>`)
    parts.push('</g>')
  }

  const drawCount = dealResult.drawPile.length
  const drawX = pad
  const backPath = getCardBackPath(deckType)
  parts.push(`<g data-zone="Stock — ${drawCount} cards (face down)">`)
  if (backPath) {
    parts.push(`<image href="${backPath}" x="${drawX}" y="${foundationY}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/>`)
  } else {
    parts.push(`<rect x="${drawX}" y="${foundationY}" width="${cardW}" height="${cardH}" fill="#2a3a6a" rx="3" stroke="#1a2a4a" stroke-width="1"/>`)
  }
  parts.push(`<text x="${drawX + cardW / 2}" y="${foundationY + cardH / 2 + 4}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,0.85)" font-weight="bold">${drawCount}</text>`)
  parts.push('</g>')

  const wasteX = drawX + cardW + colGap
  parts.push(`<g data-zone="Waste — draw cards here (empty at start)">`)
  parts.push(`<rect x="${wasteX}" y="${foundationY}" width="${cardW}" height="${cardH}" fill="rgba(0,0,0,0.01)" stroke="rgba(255,255,255,0.2)" stroke-width="1" rx="3" stroke-dasharray="3 2"/>`)
  parts.push(`<text x="${wasteX + cardW / 2}" y="${foundationY + cardH / 2 + 4}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.2)">waste</text>`)
  parts.push('</g>')

  for (let col = 0; col < numCols; col++) {
    const colCards = dealResult.tableau[col]
    const cx = tableauX + col * (cardW + colGap)
    parts.push(`<g data-zone="Column ${col + 1} — ${colCards.length} cards">`)
    for (let row = 0; row < colCards.length; row++) {
      const card = colCards[row]
      const cy = tableauY + row * cascadeStep
      const cardLabel = card.faceUp ? (card.display || card.id) : 'Face down'
      if (card.faceUp) {
        const imgPath = getCardImagePath(card, deckType)
        if (imgPath) {
          parts.push(`<g data-card="${cardLabel}"><image href="${imgPath}" x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/></g>`)
        } else {
          parts.push(`<g data-card="${cardLabel}"><rect x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" fill="#fff" rx="3" stroke="#ccc" stroke-width="0.5"/><text x="${cx + cardW / 2}" y="${cy + cardH / 2 + 4}" text-anchor="middle" font-size="10" fill="#333" font-family="system-ui">${card.display || '?'}</text></g>`)
        }
      } else {
        if (backPath) {
          parts.push(`<g data-card="${cardLabel}"><image href="${backPath}" x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/></g>`)
        } else {
          parts.push(`<rect x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" fill="#2a3a6a" rx="3" stroke="#1a2a4a" stroke-width="1" data-card="${cardLabel}"/>`)
        }
      }
    }
    parts.push('</g>')
  }

  parts.push('</g>')
  parts.push(`<text x="${w / 2}" y="${h - 6}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.3)" font-family="system-ui">${deckConfig.label} · ${variantDef.label} · seed: ${seed}</text>`)
  parts.push('</svg>')

  const svg = parts.join('\n')
  if (opts._returnOnly) return svg
  showSvg(svg)
  showInfo({
    deckType,
    seed,
    players: 1,
    label: variantDef.label,
    setupDesc: variantDef.setupDesc,
    variantDesc: variantDef.variantDesc,
    tableau: dealResult.tableau.map(col => col.length).join(', '),
    drawPile: dealResult.drawPile.length,
  })
  bindDeckHover()
  requestAnimationFrame(fitToView)
}

async function loadBoardDataAndRender(game, variantDef) {
  const dataFile = game.needsBoardData
  if (!boardDataCache[dataFile]) {
    try {
      const resp = await fetch(`../data/${dataFile}`)
      if (resp.ok) boardDataCache[dataFile] = await resp.json()
    } catch { /* falls through to error display */ }
  }
  const config = { ...variantDef, boardData: boardDataCache[dataFile] || null }
  const svg = renderBoard(config)
  showSvg(svg)
  showInfo(config)
  bindBoardHover(config)
  requestAnimationFrame(fitToView)
}

async function loadStaticSvg(gameId, variantId, variantDef) {
  const path = getStaticSvgPath(gameId, variantId)
  try {
    const resp = await fetch(path)
    if (resp.ok) {
      const svg = await resp.text()
      showSvg(svg)
      showInfo({ ...variantDef, renderMode: 'static', svgPath: path })
    } else {
      showStaticPlaceholder(variantDef, path)
    }
  } catch {
    showStaticPlaceholder(variantDef, path)
  }
  requestAnimationFrame(fitToView)
}

function showStaticPlaceholder(variantDef, path) {
  const container = document.getElementById('board-svg')
  const empty = document.getElementById('board-empty')
  container.innerHTML = `<div class="static-placeholder"><div class="static-icon">&#x1F4CB;</div><p class="static-label">${variantDef.label}</p><p class="static-note">Static SVG — not yet imported</p><p class="static-path">${path}</p></div>`
  container.classList.add('active')
  empty.style.display = 'none'
}

function showNotImplemented(provider) {
  showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#1a1a2e" rx="8"/><text x="200" y="80" text-anchor="middle" font-size="14" fill="#e8a030" font-family="system-ui">Final mode — not yet implemented</text><text x="200" y="110" text-anchor="middle" font-size="12" fill="#888" font-family="system-ui">Provider: ${provider}</text><text x="200" y="135" text-anchor="middle" font-size="11" fill="#555" font-family="system-ui">Switch to Original to view</text></svg>`)
  requestAnimationFrame(fitToView)
}

function showSvg(svg) {
  const container = document.getElementById('board-svg')
  const empty = document.getElementById('board-empty')
  container.innerHTML = svg
  container.classList.add('active')
  empty.style.display = 'none'
}

function bindBoardHover(config) {
  const infoBar = document.getElementById('hex-info-bar')
  const svgContainer = document.getElementById('board-svg')
  infoBar.classList.add('active')
  infoBar.textContent = 'Hover over a cell'

  const position = config.position || config.hexPosition || {}
  const parsedSetup = config.parsedSetup || null
  const PIECE_NAMES = {
    K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn',
    k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn',
    A: 'Archbishop', a: 'Archbishop', C: 'Chancellor', c: 'Chancellor',
    D: 'Dabbaba', d: 'Dabbaba', E: 'Elephant', e: 'Elephant',
    F: 'Ferz', f: 'Ferz', G: 'Gold', g: 'Gold',
    H: 'Horse', h: 'Horse', I: 'Immobiliser', i: 'Immobiliser',
    J: 'Giraffe', j: 'Giraffe', L: 'Lance', l: 'Lance',
    M: 'Amazon', m: 'Amazon', O: 'Ogre', o: 'Ogre',
    S: 'Silver', s: 'Silver', T: 'Tower', t: 'Tower',
    U: 'Unicorn', u: 'Unicorn', V: 'Eagle', v: 'Eagle',
    W: 'War Machine', w: 'War Machine', Y: 'Wyvern', y: 'Wyvern',
    Z: 'Zebra', z: 'Zebra',
    man: 'Man', king: 'King', stone: 'Stone', piece: 'Disc',
  }

  const pieceNameOverrides = config.pieceNames || {}
  const centreMarker = config.centreMarker || null
  const nodeNames = config.nodeNames || null

  const layerLabels = config.layers && config.layers.labels || null

  svgContainer.addEventListener('mouseover', e => {
    const cell = e.target.closest('.board-cell')
    if (!cell) return
    const sq = cell.dataset.sq
    const type = cell.dataset.type || ''
    const layer = cell.dataset.layer
    let text = sq
    if (layer !== undefined && layerLabels) {
      text += ` · ${layerLabels[parseInt(layer)]}`
    }
    const overlayInfo = config._overlaySquares?.[sq]
    if (centreMarker && sq === '0,0') text += ' [Throne]'
    else if (overlayInfo) text += ` [${overlayInfo}]`
    else if (type && type !== 'floor' && !(nodeNames && nodeNames[sq])) text += ` [${type}]`
    if (nodeNames && nodeNames[sq]) text += ` — ${nodeNames[sq]}`
    const layerPositions = config.layerPositions || null
    const piece = (layer !== undefined && layerPositions) ? layerPositions[parseInt(layer)]?.[sq] : position[sq]
    if (piece) {
      const p = typeof piece === 'object' ? piece : { type: String(piece) }
      const fen4Prefix = p.type.length === 2 && FEN4_OWNERS[p.type[0]]
      const name = pieceNameOverrides[p.type] || pieceNameOverrides[p.type.toUpperCase()] || (fen4Prefix ? PIECE_NAMES[p.type[1]] : PIECE_NAMES[p.type]) || p.type
      if (p.color) {
        text += ` — ${p.color} ${name}`
      } else if (fen4Prefix) {
        const ownerName = FEN4_OWNERS[p.type[0]]
        text += ` — ${ownerName.charAt(0).toUpperCase() + ownerName.slice(1)} ${name}`
      } else if (p.type !== p.type.toLowerCase()) {
        const upperOwner = state.game === 'xiangqi' ? 'Red' : 'White'
        text += ` — ${upperOwner} ${name}`
      } else if (p.type !== p.type.toUpperCase()) {
        const lowerOwner = state.game === 'xiangqi' ? 'Black' : 'Black'
        text += ` — ${lowerOwner} ${name}`
      } else {
        text += ` — ${name}`
      }
    }
    if (sq.startsWith('h') && type.startsWith('arm-')) {
      const arm = cell.dataset.arm || type.slice(4)
      const armNames = { N: 'North', NE: 'North-East', SE: 'South-East', S: 'South', SW: 'South-West', NW: 'North-West' }
      const armOrder = ['N', 'NE', 'SE', 'S', 'SW', 'NW']
      const armPlayerColors = ['Red', 'Blue', 'Green', 'Black', 'Purple', 'Brown']
      text = `${sq} — ${armNames[arm] || arm} arm`
      const filledArms = config.filledArms || []
      if (filledArms.includes(arm)) {
        const playerIdx = armOrder.indexOf(arm)
        text += ` — ${armPlayerColors[playerIdx]} player`
      }
    } else if (sq.startsWith('h') && type === 'centre') {
      text = `${sq} — centre (empty)`
    }
    if (parsedSetup && sq.startsWith('pit-')) {
      const idx = parseInt(sq.slice(4), 10)
      const count = parsedSetup.pits ? (parsedSetup.pits[idx] || 0) : 0
      text = `Pit ${idx + 1} — ${count} seed${count !== 1 ? 's' : ''}`
    } else if (parsedSetup && sq.startsWith('store-')) {
      const idx = parseInt(sq.slice(6), 10)
      const count = parsedSetup.stores ? (parsedSetup.stores[idx] || 0) : 0
      text = `Store ${idx + 1} — ${count} seed${count !== 1 ? 's' : ''}`
    } else if (parsedSetup && sq.startsWith('point-')) {
      const idx = parseInt(sq.slice(6), 10) - 1
      const dark = parsedSetup.dark ? (parsedSetup.dark[idx] || 0) : 0
      const light = parsedSetup.light ? (parsedSetup.light[idx] || 0) : 0
      text = `Point ${idx + 1}`
      if (dark > 0) text += ` — ${dark} dark`
      if (light > 0) text += ` — ${light} light`
      if (!dark && !light) text += ' — empty'
    } else if (sq.startsWith('pos-') && config.boardData) {
      const posStr = sq.slice(4)
      const suffix = posStr.match(/[ab]$/)
      const posNum = parseInt(posStr, 10)
      const variant = config.variant || '1904-patent'
      const board = config.boardData.boards[variant]
      if (board) {
        const space = board.spaces.find(s => s.pos === posNum)
        if (space && suffix && suffix[0] === 'b' && space.split) {
          const sp = space.split
          text = `#${space.pos}b ${sp.name} [${sp.type}]`
          if (sp.tax) text += ` — Tax $${sp.tax}`
          if (sp.rent) text += ` — Rent $${sp.rent}`
          if (sp.price) text += ` — Price $${sp.price}`
          if (sp.notes) text += ` — ${sp.notes}`
        } else if (space) {
          const id = suffix ? `${space.pos}${suffix[0]}` : `${space.pos}`
          text = `#${id} ${space.name} [${space.type}]`
          if (space.rent) text += ` — Rent $${space.rent}`
          if (space.price) text += ` — Price $${space.price}`
          if (space.tax) text += ` — Tax $${space.tax}`
          if (space.fare) text += ` — Fare $${space.fare}`
          if (space.fee) text += ` — Fee $${space.fee}`
          if (space.receive) text += ` — Receive $${space.receive}`
          if (space.notes) text += ` — ${space.notes}`
        }
      }
    } else if (sq.startsWith('inner-') && config.boardData) {
      const idx = parseInt(sq.slice(6), 10) - 1
      const variant = config.variant || '1904-patent'
      const board = config.boardData.boards[variant]
      if (board && board.naturalOpportunities && board.naturalOpportunities[idx]) {
        const no = board.naturalOpportunities[idx]
        text = `${no.name} — Wages $${no.wages}, Rent $${no.rent}, Re-entry: ${no.reentryName} (#${no.reentry})`
      } else if (board && board.innerSpaces && board.innerSpaces[idx]) {
        const is = board.innerSpaces[idx]
        text = `Inner: ${is.name} [${is.type}]`
        if (is.fare) text += ` — Fare $${is.fare}`
        if (is.notes) text += ` — ${is.notes}`
      }
    }
    if (text.length > 90) text = text.slice(0, 87) + '...'
    infoBar.textContent = text
  })

  svgContainer.addEventListener('mouseleave', () => {
    infoBar.textContent = 'Hover over a cell'
  })
}

function bindHexHover(gameConfig) {
  const infoBar = document.getElementById('hex-info-bar')
  const svgContainer = document.getElementById('board-svg')
  infoBar.classList.add('active')
  infoBar.textContent = 'Hover over a hex'

  const descs = gameConfig.getDescriptions ? gameConfig.getDescriptions() : null

  svgContainer.addEventListener('mouseover', e => {
    const poly = e.target.closest('.hex-cell')
    if (!poly) return
    const id = poly.dataset.id || ''
    const type = poly.dataset.type || ''
    const name = poly.dataset.name || ''
    const q = poly.dataset.q
    const r = poly.dataset.r

    let text = id ? `${id} (${q},${r})` : `(${q},${r})`
    if (name) {
      text += ` — ${name}`
    } else if (descs && descs[type]) {
      text += ` — ${descs[type].name}`
      if (descs[type].desc) text += `: ${descs[type].desc}`
    } else if (type) {
      text += ` — ${type}`
    }
    infoBar.textContent = text
  })

  svgContainer.addEventListener('mouseleave', () => {
    infoBar.textContent = 'Hover over a hex'
  })
}

function showInfo(cfg) {
  const info = document.getElementById('derived-info')
  const game = GAMES[state.game]
  const rows = []
  const mode = cfg.static ? 'static' : 'dynamic'
  rows.push(`<div class="info-row"><span class="info-label">Render</span><span class="info-value info-badge info-badge--${mode}">${mode}</span></div>`)
  if (cfg.hexGame) {
    rows.push(`<div class="info-row"><span class="info-label">Generator</span><span class="info-value">${cfg.hexGame}</span></div>`)
    rows.push(`<div class="info-row"><span class="info-label">Hexes</span><span class="info-value">${cfg.hexCount}</span></div>`)
  } else {
    if (cfg.boardStyle) rows.push(`<div class="info-row"><span class="info-label">Board</span><span class="info-value">${cfg.boardStyle}</span></div>`)
    if (cfg.rows) rows.push(`<div class="info-row"><span class="info-label">Size</span><span class="info-value">${cfg.rows}×${cfg.cols}</span></div>`)
    if (cfg.rings) rows.push(`<div class="info-row"><span class="info-label">Rings</span><span class="info-value">${cfg.rings}</span></div>`)
    const displayPieceSet = cfg.pieceSetOverride || cfg.pieceSet4 || (game && game.pieceSet)
    if (displayPieceSet) rows.push(`<div class="info-row"><span class="info-label">Pieces</span><span class="info-value">${displayPieceSet}</span></div>`)
    if (cfg.fen) rows.push(`<div class="info-row info-row--block"><span class="info-label">Setup</span><span class="info-value info-value--fen">${cfg.fen}</span></div>`)
    else if (cfg.setup) rows.push(`<div class="info-row info-row--block"><span class="info-label">Setup</span><span class="info-value info-value--fen">${cfg.setup}</span></div>`)
    else if (cfg.draughtsSetup) rows.push(`<div class="info-row"><span class="info-label">Setup</span><span class="info-value">${cfg.draughtsSetup.rows} rows each side</span></div>`)
    else if (cfg.fanoronaSetup) rows.push(`<div class="info-row"><span class="info-label">Setup</span><span class="info-value">Standard (22 each)</span></div>`)
    else if (cfg.goHandicap) rows.push(`<div class="info-row"><span class="info-label">Setup</span><span class="info-value">${cfg.goHandicap} handicap stones</span></div>`)
    else if (cfg.asaltoNotation) rows.push(`<div class="info-row info-row--block"><span class="info-label">Setup</span><span class="info-value info-value--fen">${cfg.asaltoNotation}</span></div>`)
    else if (cfg.svgPath) rows.push(`<div class="info-row info-row--block"><span class="info-label">Source</span><span class="info-value info-value--fen">${cfg.svgPath}</span></div>`)
    else if (!cfg.position && !cfg.static) rows.push(`<div class="info-row"><span class="info-label">Setup</span><span class="info-value">Empty board</span></div>`)
    if (cfg.fen || cfg.setup) rows.push(`<div class="info-row"><span class="info-label">Notation</span><span class="info-value">FEN</span></div>`)
    else if (cfg.asaltoNotation) rows.push(`<div class="info-row"><span class="info-label">Notation</span><span class="info-value">Node map</span></div>`)
  }
  if (cfg.deckType) {
    rows.push(`<div class="info-row"><span class="info-label">Deck</span><span class="info-value">${cfg.deckType}</span></div>`)
    rows.push(`<div class="info-row"><span class="info-label">Players</span><span class="info-value">${cfg.players}</span></div>`)
    rows.push(`<div class="info-row"><span class="info-label">Per hand</span><span class="info-value">${cfg.cardsPerHand}</span></div>`)
    if (cfg.community) rows.push(`<div class="info-row"><span class="info-label">Community</span><span class="info-value">${cfg.community}</span></div>`)
    if (cfg.drawPile) rows.push(`<div class="info-row"><span class="info-label">Draw pile</span><span class="info-value">${cfg.drawPile}</span></div>`)
    rows.push(`<div class="info-row"><span class="info-label">Seed</span><span class="info-value">${cfg.seed}</span></div>`)
    if (cfg.deckNotation) rows.push(`<div class="info-row info-row--block"><span class="info-label">State</span><span class="info-value info-value--fen">${cfg.deckNotation}</span></div>`)
  }
  if (cfg.setupDesc) rows.push(`<div class="info-row info-row--block"><span class="info-label">Position</span><span class="info-value">${cfg.setupDesc}</span></div>`)
  if (cfg.variantDesc) rows.push(`<div class="info-row info-row--block"><span class="info-label">Variant</span><span class="info-value">${cfg.variantDesc}</span></div>`)
  info.innerHTML = rows.join('')
}

function fitToView() {
  const svg = document.querySelector('#board-svg svg')
  const container = document.querySelector('.canvas-svg.active')
  if (!svg || !container) return
  const sw = parseFloat(svg.getAttribute('width'))
  const sh = parseFloat(svg.getAttribute('height'))
  const cw = container.clientWidth - 48
  const ch = container.clientHeight - 48
  if (!sw || !sh || !cw || !ch) return
  const scale = Math.min(cw / sw, ch / sh)
  svg.style.transform = `scale(${scale})`
}

if (document.getElementById('game-select')) {
  document.addEventListener('DOMContentLoaded', init)
}

export { buildDraughtsFenFromSetup, parseDraughtsFen, buildGoHandicap, buildGoPreset, buildFanoronaPosition, fen4ToPosition }
