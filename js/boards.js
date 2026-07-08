import { renderBoard, fenToPosition } from './board-diagrams.js'
import { renderSurfaceSVG } from './piece-surface.js'
import { getGameConfig, getAllGames, HexSvg, createSeededRng } from './hex-games/index.js'
import { getDeckConfig, getRegisteredDecks, createDeck, shuffle, deal, layoutTable } from './deck-manager/index.js'
import { renderRpgProvider } from './rpg-provider.js'
import { renderFromResolved, loadGalleryIndex as loadAdapterGallery, setDeckRenderer, setMahjongRenderer, setTableauRenderer, setMultiBoardRenderer } from './render-adapter.js'
import { reverseAdapt } from './reverse-adapter.js'
import { resolveSurface } from './surface-resolver.js'
import { resolve as cascadeResolve } from './cascade-resolver.js'

setDeckRenderer(renderDeckSvg)
setMahjongRenderer(renderMahjongSvg)
setTableauRenderer(renderTableauSvg)
setMultiBoardRenderer(renderMultiBoard)

// ─── DUNGEON CHESS CELL MAPS ───────────────────────────────────────────────
// null = void, 'floor' = standard, 'p1'/'p2' = deploy zones, 'water' = obstacle

function parseCellMap(template) {
  return template.trim().split('\n').map(row =>
    [...row].map(c => c === '.' ? null : c === 'f' ? 'floor' : c === 'w' ? 'water' : c === '1' ? 'p1' : c === '2' ? 'p2' : c === 'r' ? 'rosette' : c === 'c' ? 'castle' : c === 'h' ? 'home' : null)
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
  voidFill: 'transparent',
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

// ─── L'ATTAQUE / STRATEGO BOARD MAP ────────────────────────────────────────

function buildLatttaqueMap(rows, cols) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill('floor'))
  // Two 2x2 lakes in the centre (rows 4-5, cols 2-3 and cols 6-7)
  grid[4][2] = 'lake'; grid[4][3] = 'lake'
  grid[5][2] = 'lake'; grid[5][3] = 'lake'
  grid[4][6] = 'lake'; grid[4][7] = 'lake'
  grid[5][6] = 'lake'; grid[5][7] = 'lake'
  return grid
}

const LATTAQUE_MAP = buildLatttaqueMap(10, 10)

const LATTAQUE_COLORS = {
  floor: '#c8b896', floorStroke: '#7a6545',
  lake: '#4a7ab5', lakeStroke: '#2a5a8a',
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

// ─── Y GAME (TRIANGULAR HEX) ───────────────────────────────────────────────

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

// ─── GAME DEFINITIONS ───────────────────────────────────────────────────────
// Each variant specifies: boardStyle, dimensions, pieceSet, fen/position

const GAMES = {
  'moddable-chess': {
    label: 'Chess',
    pieceSet: 'mce-fairy-complete',
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
      brusky: { label: 'Brusky (Hex)', boardStyle: 'hex', hexGrid: BRUSKY_GRID, hexSize: 20, flat: false, hexColorFn: glinskiColor, hexPosition: BRUSKY_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }, variantDesc: 'Irregular 84-hex board. 10 pawns per side. Unmoved pawns may capture straight forward. Blockage rule. Yakov Brusky, 1966.'},
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
      'de-vasa': { label: 'De Vasa (Hex)', boardStyle: 'hex', hexRows: 9, hexCols: 9, hexSize: 20, flat: false, hexColorFn: glinskiColor, hexPosition: DE_VASA_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }, variantDesc: '81-hex rhombus board. Pawns start rank 3. Kings on opposite wings. Castling permitted. Helge E. de Vasa, 1953.'},
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
      glinski: { label: 'Glinski (Hex)', boardStyle: 'hex', hexRadius: 5, hexSize: 22, flat: true, hexColorFn: glinskiColor, hexPosition: GLINSKI_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' } , variantDesc: 'Chess on a 91-cell hexagonal board. Three bishops per side.'},
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
      mccooey: { label: 'McCooey (Hex)', boardStyle: 'hex', hexRadius: 5, hexSize: 22, flat: true, hexColorFn: glinskiColor, hexPosition: MCCOOEY_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }, variantDesc: 'McCooey hex chess. 7 pawns, diagonal pawn capture. Same 91-hex board as Glinski.'},
      metamachy: { label: 'Metamachy', boardStyle: 'checkered', rows: 12, cols: 12, tileSize: 26, fen: 'rnbclqklcbnr/pppppppppppp/12/12/12/12/12/12/12/12/PPPPPPPPPPPP/RNBCLQKLCBNR', variantDesc: '12x12 with 12 piece types. Variable King/Queen/Lion/Eagle placement. Cannon, Camel, Eagle. Jean-Louis Cazaux, 2012.'},
      'medusa-chess': { label: 'Medusa Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'After queen moves, attacked enemy pieces are petrified for 2 turns.'},
      'mini-hexchess': { label: 'Mini Hexchess', boardStyle: 'hex', hexRadius: 3, hexSize: 28, flat: true, hexColorFn: glinskiColor, hexPosition: MINI_HEXCHESS_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }, variantDesc: 'Compact 37-hex board. No Queen. McCooey 1997.'},
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
      shafran: { label: 'Shafran (Hex)', boardStyle: 'hex', hexGrid: SHAFRAN_GRID, hexSize: 22, flat: true, hexColorFn: glinskiColor, hexPosition: SHAFRAN_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }, variantDesc: 'Irregular 70-hex board, 9 files. Castling permitted. Pawn initial step varies by file. Isaak Shafran, 1939.'},
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
    variants: {
      standard: { label: 'Standard', boardStyle: 'xiangqi', rows: 10, cols: 9, tileSize: 36, river: true, fen: 'rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR', setupDesc: '16 pieces each across river', variantDesc: 'Chinese chess. Palace confines generals and advisors. River restricts elephants. Cannons screen-jump to capture.' },
      janggi: { label: 'Janggi', boardStyle: 'xiangqi', rows: 10, cols: 9, tileSize: 36, river: false, fen: 'rhea1aehr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RHEA1AEHR', setupDesc: '16 pieces each, generals in palace centre', variantDesc: 'Korean chess. No river. Elephants move wider. Generals and guards move along palace diagonals.' },
      jieqi: { label: 'Jieqi', boardStyle: 'xiangqi', rows: 10, cols: 9, tileSize: 36, river: true, fen: 'rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR', setupDesc: 'Standard position, pieces face-down', variantDesc: 'Hidden-information Xiangqi. All pieces except General start face-down, revealed on first move. Rank hierarchy for captures.' },
      'manchu-plus': { label: 'Manchu', boardStyle: 'xiangqi', rows: 10, cols: 9, tileSize: 36, river: true, fen: 'r1eakae1b/9/9/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR', setupDesc: 'Red standard army vs Black with Banner (R+C+H combined)', variantDesc: 'Asymmetric: Red standard Xiangqi vs Black with one Banner piece (combines Chariot+Cannon+Horse). Extreme imbalance.'},
      minixiangqi: { label: 'Mini Xiangqi', boardStyle: 'xiangqi', rows: 7, cols: 7, tileSize: 40, river: false, fen: 'rcnkncr/p1ppp1p/7/7/7/P1PPP1P/RCNKNCR', setupDesc: '10 pieces each on 7x7', variantDesc: '7x7 Xiangqi. No river, no Advisors/Elephants. Soldiers move sideways from start. No palace.'},
      'quang-trung': { label: 'Quang Trung', boardStyle: 'xiangqi', rows: 10, cols: 10, tileSize: 32, river: false, fen: 'rnecakecnr/10/2pppppp2/10/10/10/10/2PPPPPP2/10/RNECAKECNR', setupDesc: '18 pieces each on 10x10 (squares, not intersections)', variantDesc: 'Vietnamese 10x10 variant. General/Pawns restricted to files c-h. Pawn reaching last rank wins. Named for Vietnamese emperor.'},
      'xiangqi-42': { label: 'Xiangqi-42', boardStyle: 'xiangqi', rows: 6, cols: 7, tileSize: 40, river: false, fen: 'rnakanr/1c3c1/p2p2p/P2P2P/1C3C1/RNAKANR', setupDesc: '12 pieces each on 7x6 (42 intersections)', variantDesc: 'Compact Xiangqi on 42 intersections (7x6). No river. Guards replace Advisors. Robert Price, 2001.'},
      'yang-qi': { label: 'Yang Qi', boardStyle: 'xiangqi', rows: 10, cols: 9, tileSize: 36, river: true, fen: 'rnbvkvbnr/9/1c5c1/p1p1p1p1p/1p1p1p1p1/1P1P1P1P1/P1P1P1P1P/1C5C1/9/RNBVKVBNR', setupDesc: '20 pieces each with Vaos (9 pawns on ranks 3-4)', variantDesc: 'Western-influenced Xiangqi. FIDE-style pieces plus Vaos (diagonal screen-capture). King swap ability.'},
    },
  },
  draughts: {
    label: 'Draughts',
    pieceSet: 'playstrategy-dameo-fabirovsky',
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
      'turkish-draughts': { label: 'Turkish', boardStyle: 'mono-grid', rows: 8, cols: 8, tileSize: 40, draughtsSetup: { rows: 2, dark: false }, setupDesc: '16 per side, all squares, rows 2-3 and 6-7', variantDesc: 'Orthogonal movement only (no diagonals). All 64 squares used.' },
      lasca: { label: 'Lasca (7×7)', boardStyle: 'checkered', rows: 7, cols: 7, tileSize: 40, draughtsSetup: { rows: 3, dark: true }, setupDesc: '11 per side, dark squares, 3 rows', variantDesc: 'Column draughts: captured pieces join the column. Columns commanded by top piece.' },
      alquerque: { label: 'Alquerque (5×5)', boardStyle: 'alquerque', rows: 5, cols: 5, tileSize: 48, fanoronaSetup: true, setupDesc: '12 per side, all intersections except center', variantDesc: 'Medieval ancestor of draughts. Move along lines, capture by jumping.' },
      dameo: { label: 'Dameo (8×8)', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, setup: 'bbbbbbbb/1bbbbbb1/2bbbb2/8/8/2wwww2/1wwwwww1/wwwwwwww', setupDesc: '18 per side, all squares, trapezoidal (8/6/4)', variantDesc: 'Phalanx movement: lines of men slide together. Orthogonal captures only.' },
      diagonal: { label: 'Diagonal (10×10)', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 34, setup: '2b1b1b1b1/3b1b1b1b/w3b1b1b1/1w3b1b1b/w1w3b1b1/1w1w3b1b/w1w1w3b1/1w1w1w3b/w1w1w1w3/1w1w1w1w2', setupDesc: '20 per side, dark squares, split along main diagonal', variantDesc: 'International rules with rotated starting position. Main diagonal empty.' },
    },
  },
  reversi: {
    label: 'Reversi',
    pieceSet: 'playstrategy-flipello-classic',
    variants: {
      standard: { label: 'Standard (8×8)', boardStyle: 'mono-grid', rows: 8, cols: 8, tileSize: 40, setup: '8/8/8/3bw3/3wb3/8/8/8', colors: { monoSquare: '#2e7d32', gridLine: '#1b5e20' }, setupDesc: '4 discs in centre (2 each, diagonal)', variantDesc: 'Flank opponent discs to flip them. Most discs at end wins.' },
      'six-by-six': { label: '6×6', boardStyle: 'mono-grid', rows: 6, cols: 6, tileSize: 40, setup: '6/6/2bw2/2wb2/6/6', colors: { monoSquare: '#2e7d32', gridLine: '#1b5e20' }, setupDesc: '4 discs in centre (2 each, diagonal)', variantDesc: 'Standard Reversi on a smaller 6x6 board. Faster games, fewer options.' },
      'anti-reversi': { label: 'Anti-Reversi (8×8)', boardStyle: 'mono-grid', rows: 8, cols: 8, tileSize: 40, setup: '8/8/8/3bw3/3wb3/8/8/8', colors: { monoSquare: '#2e7d32', gridLine: '#1b5e20' }, setupDesc: '4 discs in centre (2 each, diagonal)', variantDesc: 'Reversed goal: player with FEWEST discs at end wins.' },
    },
  },
  shogi: {
    label: 'Shogi',
    pieceSet: 'kahu-shogi-kanji-red-wood',
    variants: {
      standard: { label: 'Standard (9×9)', boardStyle: 'shogi', rows: 9, cols: 9, tileSize: 36, fen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL', setupDesc: '20 pieces each on back ranks and third row', variantDesc: 'Captured pieces become your own and can be dropped back onto the board.' },
      'annan-shogi': { label: 'Annan Shogi (9×9)', boardStyle: 'shogi', rows: 9, cols: 9, tileSize: 36, fen: 'lnsgkgsnl/1r5b1/p1ppppp1p/1p5p1/9/1P5P1/P1PPPPP1P/1B5R1/LNSGKGSNL', setupDesc: 'Standard position with b/h file pawns advanced', variantDesc: 'Pieces borrow movement of the friendly piece directly behind them. Standard Shogi otherwise.' },
      'cannon-shogi': { label: 'Cannon Shogi (9×9)', boardStyle: 'shogi', rows: 9, cols: 9, tileSize: 36, fen: 'lnsgkgsnl/1rci1uab1/p1p1p1p1p/9/9/9/P1P1P1P1P/1BAU1ICR1/LNSGKGSNL', setupDesc: '22 pieces each with 4 Cannon types', variantDesc: 'Shogi + 4 Cannon types from Xiangqi/Janggi. Soldiers replace Pawns. Drops permitted. Peter Michaelsen, 1998.' },
      'chu-shogi': { label: 'Chu Shogi (12×12)', boardStyle: 'shogi', rows: 12, cols: 12, tileSize: 28, fen: 'lnfcsgkgscfnl/a1i1h1h1i1a/p1o1o1o1o1p/ppppppppppppp/12/12/12/12/PPPPPPPPPPPPP/P1O1O1O1O1P/A1I1H1H1I1A/LNFCSGKGSCFNL', setupDesc: '46 pieces per side, 21 types', variantDesc: 'Historical 12x12. Lion (double-mover), Drunk Elephant promotes to Crown Prince. No drops. Extinction royalty.' },
      'dai-shogi': { label: 'Dai Shogi (15×15)', boardStyle: 'shogi', rows: 15, cols: 15, tileSize: 22, fen: 'lnifcmsgkgsmcfinl/15/a1b1t1h1h1t1b1a/p1o1o1o1o1o1o1p/ppppppppppppppp/15/15/15/15/15/PPPPPPPPPPPPPPP/P1O1O1O1O1O1O1P/A1B1T1H1H1T1B1A/15/LNIFCMSGKGSMCFINL', setupDesc: '65 pieces per side', variantDesc: 'Historical 15x15. Lion, Drunk Elephant promotes to Crown Prince. No drops. Precursor to standard Shogi.' },
      dobutsu: { label: 'Dobutsu Shogi (3×4)', boardStyle: 'shogi', rows: 4, cols: 3, tileSize: 50, fen: 'gle/1c1/1C1/ELG', setupDesc: '4 animals per side', variantDesc: 'Animal Shogi for children. 3x4. Lion, Giraffe, Elephant, Chick. Drops. Solved: second player wins perfectly.' },
      'four-player-shogi': { label: 'Four-Player Shogi', boardStyle: 'shogi', rows: 9, cols: 9, tileSize: 36, fen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL', setupDesc: '4 armies on cross-shaped board', variantDesc: '4 standard Shogi armies on cross-shaped extension board. Team or free-for-all. Drops go to own territory only.' },
      'gorogoro-plus': { label: 'Gorogoro+ (5×6)', boardStyle: 'shogi', rows: 6, cols: 5, tileSize: 40, fen: 'sgkgs/5/1ppp1/1PPP1/5/SGKGS', setupDesc: '6 pieces on board + hand pieces', variantDesc: '5x6 Shogi. No Rook/Bishop. Knight+Lance start in hand. Promotion zone last 2 ranks.' },
      'heian-shogi': { label: 'Heian Shogi (9×8)', boardStyle: 'shogi', rows: 8, cols: 9, tileSize: 36, fen: 'lnsgkgsnl/9/ppppppppp/9/9/PPPPPPPPP/9/LNSGKGSNL', setupDesc: '16 pieces each', variantDesc: 'Earliest Japanese chess (~8th-9th century). 9x8. No drops. No Rook/Bishop. All non-King promote to Gold.' },
      'hex-shogi-91': { label: 'Hex Shogi 91', boardStyle: 'hex', hexRadius: 5, hexSize: 22, flat: true, hexColorFn: glinskiColor, colors: { lightHex: '#d4a76a', darkHex: '#8b6535', midHex: '#b88b50', stroke: 'rgba(0,0,0,0.2)', background: '#3a2a1a' }, variantDesc: 'Shogi on 91-hex Glinski board. Drops with hex-specific Pawn rules. 4-rank promotion zone. Fergus Duniho.' },
      'judkins-shogi': { label: 'Judkins Shogi (6×6)', boardStyle: 'shogi', rows: 6, cols: 6, tileSize: 40, fen: 'rbsgkn/5p/6/6/P5/NKGSBR', setupDesc: '7 pieces per side', variantDesc: '6x6 miniature Shogi. Drops. Promotion zone last 2 ranks. Paul Judkins, 1998.' },
      'maka-dai-dai-shogi': { label: 'Maka-Dai-Dai (19×19)', boardStyle: 'shogi', rows: 19, cols: 19, tileSize: 18, fen: '19/19/19/19/19/19/19/19/19/19/19/19/19/19/19/19/19/19/19', setupDesc: '96 pieces per side, 50 types', variantDesc: 'Historical 19x19. Contagious promotion. Emperor leaps anywhere. Largest well-documented pre-modern shogi.' },
      minishogi: { label: 'Minishogi (5×5)', boardStyle: 'shogi', rows: 5, cols: 5, tileSize: 40, fen: 'rbsgk/4p/5/P4/KGSBR', setupDesc: '6 pieces each on a 5x5 board', variantDesc: 'Standard Shogi on a 5x5 board. Single-rank promotion zone. No Knights or Lances.' },
      'mortal-shogi': { label: 'Mortal Shogi (9×9)', boardStyle: 'shogi', rows: 9, cols: 9, tileSize: 36, fen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL', setupDesc: 'Standard Shogi position', variantDesc: 'Captured pieces demote one rank down fixed chain. Pawns removed permanently. Drops use demoted type.' },
      'kyoto-shogi': { label: 'Kyoto Shogi (5×5)', boardStyle: 'shogi', rows: 5, cols: 5, tileSize: 40, fen: 'pgskl/5/5/5/LKSGP', setupDesc: '5 pieces each on back rank', variantDesc: 'Every piece except the King flips to its alternate face after each move.' },
      'hasami-shogi': { label: 'Hasami Shogi (9×9)', boardStyle: 'shogi', rows: 9, cols: 9, tileSize: 36, fen: 'ppppppppp/9/9/9/9/9/9/9/PPPPPPPPP', setupDesc: '9 pawns each on back rank', variantDesc: 'Custodial sandwich capture. No drops, no promotion. All pieces are identical.' },
      'sho-shogi': { label: 'Sho Shogi (9×9)', boardStyle: 'shogi', rows: 9, cols: 9, tileSize: 36, fen: 'lnsgkgsnl/1r2e2b1/ppppppppp/9/9/9/PPPPPPPPP/1B2E2R1/LNSGKGSNL', setupDesc: '22 pieces each with Drunk Elephant', variantDesc: '16th-century predecessor to Shogi. Drunken Elephant promotes to Crown Prince. No drops.' },
      'tai-shogi': { label: 'Tai Shogi (25×25)', boardStyle: 'shogi', rows: 25, cols: 25, tileSize: 14, fen: '25/25/25/25/25/25/25/25/25/25/25/25/25/25/25/25/25/25/25/25/25/25/25/25/25', setupDesc: '~177 piece types per side', variantDesc: 'Historical 25x25. Largest variant with fully documented movements. Games last thousands of moves.' },
      'taikyoku-shogi': { label: 'Taikyoku Shogi (36×36)', boardStyle: 'shogi', rows: 36, cols: 36, tileSize: 10, fen: '36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36/36', setupDesc: '402 pieces per side', variantDesc: 'Largest chess variant ever documented. 36x36. ~10,000+ moves per game. 209 piece types.' },
      'tenjiku-shogi': { label: 'Tenjiku Shogi (16×16)', boardStyle: 'shogi', rows: 16, cols: 16, tileSize: 20, fen: '16/16/16/16/16/16/16/16/16/16/16/16/16/16/16/16', setupDesc: '78 pieces per side', variantDesc: 'Medieval 16x16. Fire Demons burn adjacent enemies. Jumping generals. No drops. ~100 piece types total.' },
      'tori-shogi': { label: 'Tori Shogi (7×7)', boardStyle: 'shogi', rows: 7, cols: 7, tileSize: 40, fen: 'rpckcpl/3f3/sssssss/2s1S2/SSSSSSS/3F3/LPCKCPR', setupDesc: '16 bird pieces per side', variantDesc: 'Bird Shogi (1799). 7x7. Drops. Only Swallow and Falcon promote. Repetition = loss for causer.' },
      'wa-shogi': { label: 'Wa Shogi (11×11)', boardStyle: 'shogi', rows: 11, cols: 11, tileSize: 30, fen: '11/11/11/11/11/11/11/11/11/11/11', setupDesc: '23 pieces per side, 14 types', variantDesc: 'Japanese 11x11. All non-Pawn pieces unique. Capture Crane King wins. No drops.' },
      'yari-shogi': { label: 'Yari Shogi (7×9)', boardStyle: 'shogi', rows: 9, cols: 7, tileSize: 36, fen: 'lllklll/1r3b1/ppppppp/9/9/9/PPPPPPP/1B3R1/LLLKLLL', setupDesc: '18 pieces per side', variantDesc: '7x9. All pieces include forward-Lance movement. Pawn drops can checkmate (unlike standard Shogi).' },
    },
  },
  morris: {
    label: 'Morris',
    pieceSet: 'playstrategy-go-classic',
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
    pieceSet: 'playstrategy-dameo-fabirovsky',
    variants: {
      standard: { label: 'Standard (5×9)', boardStyle: 'alquerque', rows: 5, cols: 9, tileSize: 40, colors: { monoSquare: '#d4a96a', gridLine: '#7a4510', whitePieceFill: '#f0e8d0', whitePieceStroke: '#7a4510', blackPieceFill: '#1e1000', blackPieceStroke: '#c8963c' }, fanoronaSetup: true, setupDesc: '22 per side, all intersections except center', variantDesc: 'Malagasy war game. Capture by approach or withdrawal. Chain captures in one turn.' },
    },
  },
  backgammon: {
    label: 'Backgammon',
    pieceSet: 'playstrategy-draughts-plain',
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
    variants: {
      'standard-2p': { label: '2-Player (16×16)', boardStyle: 'checkered', rows: 16, cols: 16, tileSize: 20, showLabels: false, colors: { lightSquare: '#f5e6c8', darkSquare: '#e8d4a8' }, setup: 'bbbbb11/bbbbb11/bbbbb11/bbb13/b15/16/16/16/16/16/16/15w/13www/11wwwww/11wwwww/11wwwww', setupDesc: '19 pieces each in opposite corner camps (5-col staircase triangle)', variantDesc: 'Move all pieces from own camp to opponent camp by stepping or jumping.' },
      'standard-4p': { label: '4-Player (16×16)', boardStyle: 'checkered', rows: 16, cols: 16, tileSize: 20, showLabels: false, colors: { lightSquare: '#f5e6c8', darkSquare: '#e8d4a8' }, setup: 'bbbb8bbbb/bbbb8bbbb/bbb10bbb/bb12bb/16/16/16/16/16/16/16/16/ww12ww/www10www/wwww8wwww/wwww8wwww', setupDesc: '13 pieces each in all 4 corner camps (4-col staircase triangle)', variantDesc: '4-player variant. Move all pieces from own camp to opposite corner camp.' },
    },
  },
  'stern-halma': {
    label: 'Stern-Halma',
    pieceSet: 'fluent-emoji',
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
      standard: { label: 'Standard (11×11)', boardStyle: 'hex', hexRows: 11, hexCols: 11, hexSize: 20, flat: false, hexFrame: 'rhombus', colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, setupDesc: 'Empty 11x11 rhombus board', variantDesc: 'Connection game. Place stones to connect your two opposite edges. No captures.' },
      '9x9': { label: 'Hex 9×9', boardStyle: 'hex', hexRows: 9, hexCols: 9, hexSize: 24, flat: false, hexFrame: 'rhombus', colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, setupDesc: 'Empty 9x9 rhombus board, 81 cells', variantDesc: 'Smaller board for faster, more tactical games. Common beginner size.' },
      '13x13': { label: 'Hex 13×13', boardStyle: 'hex', hexRows: 13, hexCols: 13, hexSize: 17, flat: false, hexFrame: 'rhombus', colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, setupDesc: 'Empty 13x13 rhombus board, 169 cells', variantDesc: 'Tournament size. More strategic depth than 11x11.' },
      '14x14': { label: 'Hex 14×14', boardStyle: 'hex', hexRows: 14, hexCols: 14, hexSize: 16, flat: false, hexFrame: 'rhombus', colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, setupDesc: 'Empty 14x14 rhombus board, 196 cells', variantDesc: 'BoardSpace standard. Slightly larger than tournament 13x13.' },
      '19x19': { label: 'Hex 19×19', boardStyle: 'hex', hexRows: 19, hexCols: 19, hexSize: 12, flat: false, hexFrame: 'rhombus', colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, setupDesc: 'Empty 19x19 rhombus board, 361 cells', variantDesc: 'Go-sized board for deep strategic play. Very long games.' },
      'y-game': { label: 'Y (side 12)', boardStyle: 'hex', hexGrid: generateTriangularHexGrid(12), hexSize: 18, flat: false, hexFrame: 'triangle', colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, setupDesc: 'Empty triangular board, 78 cells', variantDesc: 'Triangular hex board. Connect all 3 edges with a single chain. Generalises Hex. Shannon & Schensted, 1950s.' },
      'y-small': { label: 'Y (side 9)', boardStyle: 'hex', hexGrid: generateTriangularHexGrid(9), hexSize: 22, flat: false, hexFrame: 'triangle', colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, setupDesc: 'Empty triangular board, 45 cells', variantDesc: 'Smaller Y board for faster tactical games. Side-length 9.' },
      'y-large': { label: 'Y (side 15)', boardStyle: 'hex', hexGrid: generateTriangularHexGrid(15), hexSize: 14, flat: false, hexFrame: 'triangle', colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, setupDesc: 'Empty triangular board, 120 cells', variantDesc: 'Large Y board for deep strategic play. Side-length 15.' },
    },
  },
  'royal-ur': {
    label: 'Royal Ur',
    pieceSet: 'playstrategy-draughts-plain',
    variants: {
      standard: { label: 'Standard', boardStyle: 'checkered', rows: 3, cols: 8, tileSize: 40, showLabels: false, cellMap: ROYAL_UR_MAP, colors: ROYAL_UR_COLORS, setupDesc: '7 pieces each, race along a shared middle track', variantDesc: 'Ancient Mesopotamian race game. Roll 4 binary dice. Rosettes grant extra turns and safety.' },
    },
  },
  surakarta: {
    label: 'Surakarta',
    pieceSet: 'playstrategy-go-classic',
    variants: {
      standard: { label: 'Standard (6×6)', boardStyle: 'surakarta', rows: 6, cols: 6, tileSize: 50, setup: 'bbbbbb/bbbbbb/6/6/wwwwww/wwwwww', setupDesc: '12 pieces each on nearest two rows', variantDesc: 'Javanese capture game. Pieces move one step orthogonally. Capture by travelling along loop arcs.' },
    },
  },
  tafl: {
    label: 'Tafl',
    pieceSet: 'playstrategy-go-classic',
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
    variants: {
      standard: { label: 'Standard', boardStyle: 'checkered', rows: 19, cols: 19, tileSize: 20, showLabels: false, cellMap: PACHISI_MAP, colors: PACHISI_COLORS, setupDesc: '4 players, 4 pieces each start at Charkoni (centre)', variantDesc: 'Indian cross-track race game for 4 players. Roll cowrie shells. Castle squares grant safety. First to return all pieces home wins.' },
      'two-player': { label: '2-Player', boardStyle: 'checkered', rows: 19, cols: 19, tileSize: 20, showLabels: false, cellMap: PACHISI_MAP, colors: PACHISI_COLORS, setupDesc: '2 players, 8 pieces each (2 colours per player)', variantDesc: 'Each player controls two opposite arms. 8 pieces total. Same board and rules as standard.' },
      'seven-shell': { label: 'Seven-Shell', boardStyle: 'checkered', rows: 19, cols: 19, tileSize: 20, showLabels: false, cellMap: PACHISI_MAP, colors: PACHISI_COLORS, setupDesc: '4 players, 7 cowrie shells', variantDesc: 'Seven shells instead of six. Different throw table with higher max (Paintees = 35). More grace throws.' },
    },
  },
  chaupar: {
    label: 'Chaupar',
    pieceSet: 'playstrategy-draughts-plain',
    variants: {
      standard: { label: 'Standard', boardStyle: 'checkered', rows: 19, cols: 19, tileSize: 20, showLabels: false, cellMap: CHAUPAR_MAP, colors: CHAUPAR_COLORS, setupDesc: '4 players, 4 pieces each start at centre', variantDesc: 'Indian cross-track race game. Similar to Pachisi but with long dice (pase) and different safe squares. More aggressive captures.' },
    },
  },
  'landlords-game': {
    label: 'Landlords Game',
    pieceSet: null,
    needsBoardData: 'landlords-game-boards.json',
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
      standard: { label: 'Standard (91 hexes)', boardStyle: 'hex', hexRadius: 5, hexSize: 22, flat: false, hexColorFn: agonRingColor, colors: { lightHex: '#e6a817', darkHex: '#8b2240', stroke: 'rgba(0,0,0,0.25)', background: '#2a1a0a' }, hexPosition: buildAgonPosition(), centreMarker: '★', pieceNames: { P: 'Guard', p: 'Guard' }, setupDesc: 'Queen + 6 Guards per player on outer ring', variantDesc: 'Guide your Queen to the centre hex while blocking opponent. Concentric 91-hex board. France, 1842.' },
    },
  },
  asalto: {
    label: 'Asalto',
    pieceSet: 'fluent-emoji',
    variants: {
      standard: { label: 'Standard', boardStyle: 'asalto', boardSize: 320, asaltoSetup: { officers: [3, 5], soldiers: Array.from({ length: 27 }, (_, i) => i + 6) }, pieceNames: { officer: 'Officer', soldier: 'Soldier' }, setupDesc: '2 Officers in fortress vs 27 Soldiers on plain', variantDesc: 'Asymmetric siege. Officers jump-capture like draughts; Soldiers advance forward/sideways. Immobilize to win.' },
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
    variants: {
      standard: { label: 'Standard (7×9)', boardStyle: 'checkered', rows: 9, cols: 7, tileSize: 40, showLabels: false, cellMap: JUNGLE_MAP, colors: JUNGLE_COLORS, fen: JUNGLE_SETUP, pieceNames: { E: 'Elephant', e: 'Elephant', L: 'Lion', l: 'Lion', T: 'Tiger', t: 'Tiger', P: 'Leopard', p: 'Leopard', D: 'Dog', d: 'Dog', W: 'Wolf', w: 'Wolf', C: 'Cat', c: 'Cat', R: 'Rat', r: 'Rat' }, pieceBorders: { white: '#1565c0', black: '#c62828' }, setupDesc: '8 animals per player on 7x9 grid with river, dens, and traps', variantDesc: 'Animals battle across rivers and traps to reach the enemy den. Rank hierarchy: Elephant > Lion > ... > Rat (but Rat defeats Elephant).' },
    },
  },
  lattaque: {
    label: "L'Attaque",
    pieceSet: null,
    variants: {
      standard: { label: 'Standard', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 34, showLabels: false, cellMap: LATTAQUE_MAP, colors: LATTAQUE_COLORS, setupDesc: '30 pieces per player, 10x10 grid with lakes', variantDesc: 'Hidden-rank warfare. Higher rank defeats lower. Bombs immovable, Scouts slide unlimited. Precursor to Stratego.' },
      aviation: { label: 'Aviation', boardStyle: 'checkered', rows: 11, cols: 8, tileSize: 34, showLabels: false, colors: LATTAQUE_COLORS, setupDesc: '42 pieces per player, 8x11 with aerodrome zones', variantDesc: 'Aerial warfare variant. Searchlight and AAA ranging. Hidden-information. Planes, bombers, and ground forces.' },
      'dover-patrol': { label: 'Dover Patrol', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 34, showLabels: false, cellMap: LATTAQUE_MAP, colors: LATTAQUE_COLORS, setupDesc: 'Naval grid with minefields', variantDesc: 'Naval warfare variant. Ships replace soldiers; Mine Sweepers defuse Mines; Submarines defeat Battleships on attack.' },
      'tri-tactics': { label: 'Tri-Tactics', boardStyle: 'checkered', rows: 12, cols: 12, tileSize: 30, showLabels: false, colors: LATTAQUE_COLORS, setupDesc: 'Larger board, Army/Navy/Air Force units', variantDesc: 'Three-service variant: Army, Navy, Air Force with unique movement. Air units overfly impassable squares.' },
    },
  },
  nyout: {
    label: 'Nyout',
    pieceSet: null,
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
  xiangqi: { H: 'wN', h: 'bN', R: 'wR', r: 'bR', E: 'wE', e: 'bE', A: 'wA', a: 'bA', K: 'wK', k: 'bK', C: 'wC', c: 'bC', P: 'wP', p: 'bP' },
  'dou-shou-qi': {
    E: 'wElephant', e: 'bElephant', L: 'wLion', l: 'bLion',
    T: 'wTiger', t: 'bTiger', P: 'wLeopard', p: 'bLeopard',
    D: 'wDog', d: 'bDog', W: 'wWolf', w: 'bWolf',
    C: 'wCat', c: 'bCat', R: 'wRat', r: 'bRat',
  },
  asalto: { officer: 'red-circle', soldier: 'green-circle' },
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

function buildPieceImages(pieceSetId, galleryIndex, gameId) {
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

  const fenMap = GAME_FEN_OVERRIDES[gameId] || FEN_TO_PIECE_ID
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

  const fetches = []
  for (const [pieceId, filename] of Object.entries(setDef.pieces || {})) {
    const ownerPrefix = pieceId[0]
    const ownerName = FEN4_OWNERS[ownerPrefix]
    const ownerColors = owners[ownerName]
    if (!ownerColors) continue

    const cacheKey = `${filename}:${ownerColors.fill}`
    if (recolourCache[cacheKey]) {
      images[pieceId] = recolourCache[cacheKey]
      continue
    }

    fetches.push(
      fetch(basePath + filename).then(r => r.text()).then(svg => {
        const tinted = svg.replace(/fill:#fff/gi, `fill:${ownerColors.fill}`)
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

  // Compute individual board dimensions
  const ts = config.tileSize || 34
  const boardW = config.cols * ts
  const boardH = config.rows * ts
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

    // Render board squares
    const boardColors = layerColors && layerColors[i]
      ? { lightSquare: layerColors[i].lightSquare || '#f0d9b5', darkSquare: layerColors[i].darkSquare || '#b58863' }
      : { lightSquare: '#f0d9b5', darkSquare: '#b58863' }

    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        const fill = (r + c) % 2 === 0 ? boardColors.lightSquare : boardColors.darkSquare
        const file = String.fromCharCode(97 + c)
        const rankNum = config.rows - r
        const sq = `${file}${rankNum}`
        parts.push(`<rect class="board-cell" data-sq="${sq}" data-layer="${i}" x="${ox + c * ts}" y="${oy + r * ts}" width="${ts}" height="${ts}" fill="${fill}"/>`)
      }
    }

    // Render pieces from layer FEN
    const fen = fens && fens[i]
    if (fen && fen !== '8/8/8/8/8/8/8/8') {
      const position = fenToPosition(fen, config.rows, config.cols)
      const pieceImages = config.pieceImages || {}
      const surfaceMap = config.pieceSurfaceMap || {}
      const surface = config.pieceSurface || null
      for (const [sq, piece] of Object.entries(position)) {
        const file = sq.charCodeAt(0) - 97
        const rank = config.rows - parseInt(sq.slice(1))
        const cx = ox + file * ts + ts / 2
        const cy = oy + rank * ts + ts / 2
        if (pieceImages[piece]) {
          if (surfaceMap[piece]) {
            const isUpper = piece === piece.toUpperCase()
            const owner = isUpper ? 'white' : 'black'
            const ownerSurface = surface && surface.owners && surface.owners[owner]
            const ownerColors = ownerSurface || { fill: '#ccc', stroke: '#888' }
            parts.push(renderSurfaceSVG('disc', cx, cy, ts, ownerColors, pieceImages[piece]))
          } else {
            const imgSize = ts * 0.85
            parts.push(`<image href="${pieceImages[piece]}" x="${cx - imgSize / 2}" y="${cy - imgSize / 2}" width="${imgSize}" height="${imgSize}" pointer-events="none"/>`)
          }
        } else {
          const fontSize = ts * 0.55
          const isWhite = piece === piece.toUpperCase()
          const fill = isWhite ? '#fff' : '#111'
          const stroke = isWhite ? '#333' : '#888'
          parts.push(`<text x="${cx}" y="${cy + fontSize * 0.35}" text-anchor="middle" font-size="${fontSize}" font-family="system-ui" font-weight="bold" fill="${fill}" stroke="${stroke}" stroke-width="0.5">${piece}</text>`)
        }
      }
    }
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

function render() {
  const game = GAMES[state.game]
  if (!game) return
  const variantDef = game.variants[state.variant]
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
    loadBoardDataAndRender(game, variantDef)
    return
  }

  if (game.deckGame) {
    renderDeckGame(game, variantDef)
    return
  }

  if (game.hexGame) {
    renderHexGame(game, variantDef)
    return
  }

  const config = { ...variantDef }

  // Build position from FEN4 (4-player) — piece images loaded async
  if (config.fen4) {
    config.position = fen4ToPosition(config.fen4, config.rows, config.cols)
    config.getOwner = fen4GetOwner
    loadRecolouredPieces(config, galleryIndex).then(() => {
      const svg = renderBoard(config)
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
  if (game.pieceSet) {
    const built = buildPieceImages(game.pieceSet, galleryIndex, state.game)
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

  const svg = renderBoard(config)
  showSvg(svg)
  showInfo(config)
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

function showSvg(svg) {
  const container = document.getElementById('board-svg')
  const empty = document.getElementById('board-empty')
  container.innerHTML = svg
  container.classList.add('active')
  empty.style.display = 'none'

  if (renderMode === 'schema') {
    const game = GAMES[state.game]
    const variantDef = game?.variants[state.variant]
    if (game && variantDef) {
      renderSchemaMode(game, variantDef)
    }
  }
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
    if (centreMarker && sq === '0,0') text += ' [Throne]'
    else if (type && type !== 'floor' && !(nodeNames && nodeNames[sq])) text += ` [${type}]`
    if (nodeNames && nodeNames[sq]) text += ` — ${nodeNames[sq]}`
    const layerPositions = config.layerPositions || null
    const piece = (layer !== undefined && layerPositions) ? layerPositions[parseInt(layer)]?.[sq] : position[sq]
    if (piece) {
      const p = typeof piece === 'object' ? piece : { type: String(piece) }
      const fen4Prefix = p.type.length === 2 && FEN4_OWNERS[p.type[0]]
      const name = pieceNameOverrides[p.type] || (fen4Prefix ? PIECE_NAMES[p.type[1]] : PIECE_NAMES[p.type]) || p.type
      if (p.color) {
        text += ` — ${p.color} ${name}`
      } else if (fen4Prefix) {
        const ownerName = FEN4_OWNERS[p.type[0]]
        text += ` — ${ownerName.charAt(0).toUpperCase() + ownerName.slice(1)} ${name}`
      } else if (p.type !== p.type.toLowerCase()) {
        text += ` — White ${name}`
      } else if (PIECE_NAMES[p.type] && !pieceNameOverrides[p.type]) {
        text += ` — Black ${name}`
      } else {
        text += ` — ${name}`
      }
    }
    if (sq.startsWith('h') && type.startsWith('arm-')) {
      const arm = cell.dataset.arm || type.slice(4)
      const armNames = { N: 'North', NE: 'North-East', SE: 'South-East', S: 'South', SW: 'South-West', NW: 'North-West' }
      const armOrder = ['N', 'NE', 'SE', 'S', 'SW', 'NW']
      const armPlayerColors = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange']
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
    if (game && game.pieceSet) rows.push(`<div class="info-row"><span class="info-label">Pieces</span><span class="info-value">${game.pieceSet}</span></div>`)
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
