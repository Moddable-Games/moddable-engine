import { renderBoard, fenToPosition } from './board-diagrams.js'
import { getGameConfig, getAllGames, HexSvg, createSeededRng } from './hex-games/index.js'

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

// ─── ASALTO BOARD MAP ─────────────────────────────────────────────────────

function buildAsaltoMap() {
  // 9 rows x 9 cols: fortress (top 3x3 centred) connected to plain (bottom 5x5 centred)
  // Full 9x9 grid but only fortress+plain cells are playable
  const grid = Array.from({ length: 9 }, () => Array(9).fill(null))
  // Fortress: rows 0-2, cols 3-5 (3x3 centred)
  for (let r = 0; r <= 2; r++) for (let c = 3; c <= 5; c++) grid[r][c] = 'fortress'
  // Plain: rows 4-8, cols 2-6 (5x5)
  for (let r = 4; r <= 8; r++) for (let c = 2; c <= 6; c++) grid[r][c] = 'plain'
  // Connection row between fortress and plain
  grid[3][3] = 'plain'; grid[3][4] = 'plain'; grid[3][5] = 'plain'
  return grid
}

const ASALTO_MAP = buildAsaltoMap()

const ASALTO_COLORS = {
  fortress: '#8b4513', fortressStroke: '#5c2d0e',
  plain: '#d4b896', plainStroke: '#8b7355',
  voidFill: 'transparent',
}

// ─── NYOUT CIRCULAR TRACK ─────────────────────────────────────────────────

function buildNyoutMap() {
  // Nyout: 29 positions in a cross pattern with diagonal shortcuts
  // Rendered as a 9x9 grid with specific positions marked
  const grid = Array.from({ length: 9 }, () => Array(9).fill(null))
  // Outer ring: top edge
  grid[0][0] = 'corner'; grid[0][2] = 'track'; grid[0][4] = 'corner'; grid[0][6] = 'track'; grid[0][8] = 'corner'
  // Right edge
  grid[2][8] = 'track'; grid[4][8] = 'corner'; grid[6][8] = 'track'; grid[8][8] = 'corner'
  // Bottom edge
  grid[8][6] = 'track'; grid[8][4] = 'corner'; grid[8][2] = 'track'; grid[8][0] = 'corner'
  // Left edge
  grid[6][0] = 'track'; grid[4][0] = 'corner'; grid[2][0] = 'track'
  // Diagonal shortcuts (NW-SE and NE-SW through centre)
  grid[2][2] = 'track'; grid[4][4] = 'home'
  grid[6][6] = 'track'; grid[2][6] = 'track'; grid[6][2] = 'track'
  return grid
}

const NYOUT_MAP = buildNyoutMap()

const NYOUT_COLORS = {
  track: '#d4b896', trackStroke: '#8b7355',
  corner: '#c0622f', cornerStroke: '#8b4520',
  home: '#8b1a1a', homeStroke: '#6a1212',
  voidFill: 'transparent',
}

// ─── Y GAME (TRIANGULAR HEX) ───────────────────────────────────────────────

function generateTriangularHexGrid(sideLength) {
  const hexes = []
  for (let r = 0; r < sideLength; r++) {
    for (let q = 0; q <= r; q++) {
      hexes.push({ q, r })
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

// ─── GLINSKI HEX CHESS COLOUR FUNCTION ──────────────────────────────────────

function glinskiColor(hex, colors) {
  const mod = (((hex.q - hex.r) % 3) + 3) % 3
  return mod === 0 ? colors.lightHex : mod === 1 ? colors.midHex : colors.darkHex
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

// Shafran: 70-hex irregular hexagon, 9 files (a-i), file lengths 6,7,8,9,10,9,8,7,6
// Flat-top, centred on origin. File e = q=0, files go a(q=-4) to i(q=4)
function generateShafranGrid() {
  const fileLengths = [6, 7, 8, 9, 10, 9, 8, 7, 6]
  const hexes = []
  for (let f = 0; f < 9; f++) {
    const q = f - 4
    const len = fileLengths[f]
    const rStart = -Math.floor(len / 2)
    for (let i = 0; i < len; i++) {
      hexes.push({ q, r: rStart + i })
    }
  }
  return hexes
}

const SHAFRAN_GRID = generateShafranGrid()

// White back rank = bottom edge of each file; Black back rank = top edge (180° rotational symmetry)
const SHAFRAN_POSITION = buildHexPositionExplicit(
  [
    ['R', -4, -3], ['N', -3, -3], ['B', -2, -4], ['Q', -1, -4], ['K', 0, -5],
    ['B', 1, -4], ['B', 2, -4], ['N', 3, -3], ['R', 4, -3],
    ['P', -4, -2], ['P', -3, -2], ['P', -2, -3], ['P', -1, -3],
    ['P', 0, -4], ['P', 1, -3], ['P', 2, -3], ['P', 3, -2], ['P', 4, -2],
  ],
  [
    ['r', -4, 2], ['n', -3, 3], ['b', -2, 3], ['q', -1, 4], ['k', 0, 4],
    ['b', 1, 4], ['b', 2, 3], ['n', 3, 3], ['r', 4, 2],
    ['p', -4, 1], ['p', -3, 2], ['p', -2, 2], ['p', -1, 3],
    ['p', 0, 3], ['p', 1, 3], ['p', 2, 2], ['p', 3, 2], ['p', 4, 1],
  ]
)

// De Vasa: 81-hex rhombus 9x9, horizontal orientation
// Uses generateHexRhombus(9, 9) — q=0..8, r=0..8
const DE_VASA_POSITION = buildHexPositionExplicit(
  [
    ['R', 0, 0], ['N', 1, 0], ['B', 2, 0], ['Q', 3, 0], ['B', 4, 0],
    ['K', 5, 0], ['B', 6, 0], ['N', 7, 0], ['R', 8, 0],
    ['P', 0, 2], ['P', 1, 2], ['P', 2, 2], ['P', 3, 2], ['P', 4, 2],
    ['P', 5, 2], ['P', 6, 2], ['P', 7, 2], ['P', 8, 2],
  ],
  [
    ['r', 0, 8], ['n', 1, 8], ['b', 2, 8], ['k', 3, 8], ['b', 4, 8],
    ['q', 5, 8], ['b', 6, 8], ['n', 7, 8], ['r', 8, 8],
    ['p', 0, 6], ['p', 1, 6], ['p', 2, 6], ['p', 3, 6], ['p', 4, 6],
    ['p', 5, 6], ['p', 6, 6], ['p', 7, 6], ['p', 8, 6],
  ]
)

// Brusky: 84-hex irregular hexagon, horizontal, 8 ranks of width 9,10,11,12,12,11,10,9
function generateBruskyGrid() {
  const rankWidths = [9, 10, 11, 12, 12, 11, 10, 9]
  const hexes = []
  for (let rank = 0; rank < 8; rank++) {
    const w = rankWidths[rank]
    const qStart = -Math.floor(w / 2)
    for (let i = 0; i < w; i++) {
      hexes.push({ q: qStart + i, r: rank })
    }
  }
  return hexes
}

const BRUSKY_GRID = generateBruskyGrid()

const BRUSKY_POSITION = buildHexPositionExplicit(
  [
    ['R', -4, 0], ['N', -3, 0], ['B', -2, 0], ['Q', -1, 0], ['B', 0, 0],
    ['K', 1, 0], ['B', 2, 0], ['N', 3, 0], ['R', 4, 0],
    ['P', -5, 1], ['P', -4, 1], ['P', -3, 1], ['P', -2, 1], ['P', -1, 1],
    ['P', 0, 1], ['P', 1, 1], ['P', 2, 1], ['P', 3, 1], ['P', 4, 1],
  ],
  [
    ['r', -4, 7], ['n', -3, 7], ['b', -2, 7], ['k', -1, 7], ['b', 0, 7],
    ['q', 1, 7], ['b', 2, 7], ['n', 3, 7], ['r', 4, 7],
    ['p', -5, 6], ['p', -4, 6], ['p', -3, 6], ['p', -2, 6], ['p', -1, 6],
    ['p', 0, 6], ['p', 1, 6], ['p', 2, 6], ['p', 3, 6], ['p', 4, 6],
  ]
)

// ─── GAME DEFINITIONS ───────────────────────────────────────────────────────
// Each variant specifies: boardStyle, dimensions, pieceSet, fen/position

const GAMES = {
  'moddable-chess': {
    label: 'Chess',
    pieceSet: 'mce-chess',
    variants: {
      standard: { label: 'Standard', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Standard FIDE rules.'},
      absorption: { label: 'Absorption', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Capturing piece permanently gains the victim\'s movement abilities.'},
      alice: { label: 'Alice Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Two 8x8 boards. After every move, the piece transfers to the other board.'},
      'almost-chess': { label: 'Almost Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBCKBNR', variantDesc: 'White Queen replaced by a Chancellor (Rook + Knight compound).'},
      'amazon-chess': { label: 'Amazon Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbmkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBMKBNR', variantDesc: 'Queens replaced by Amazons (Queen + Knight). The most powerful piece possible.'},
      andernach: { label: 'Andernach', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Capturing piece changes colour (becomes opponent\'s). Kings exempt.'},
      antichess: { label: 'Antichess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Captures are mandatory. First to lose all pieces wins.'},
      asean: { label: 'ASEAN Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Standardized Southeast Asian chess. Makruk-family: Bishop moves 1 diagonally, Pawns promote on rank 6 to Ferz.'},
      atomic: { label: 'Atomic', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Captures cause explosions destroying all pieces on adjacent squares.'},
      benedict: { label: 'Benedict', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'No captures. Attacked enemies convert to your colour instead.'},
      'berolina-chess': { label: 'Berolina', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Pawns move diagonally forward and capture straight forward.'},
      berserk: { label: 'Berserk', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Delivering check grants one bonus move with a different piece.'},
      breakthrough: { label: 'Breakthrough', boardStyle: 'checkered', rows: 7, cols: 7, tileSize: 40, fen: 'ppppppp/ppppppp/7/7/7/PPPPPPP/PPPPPPP', variantDesc: 'Pawns only. First to reach the far side wins.'},
      brusky: { label: 'Brusky (Hex)', boardStyle: 'hex', hexGrid: BRUSKY_GRID, hexSize: 20, flat: true, hexColorFn: glinskiColor, hexPosition: BRUSKY_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }, variantDesc: 'Irregular 84-hex board. 10 pawns per side. Unmoved pawns may capture straight forward. Blockage rule. Yakov Brusky, 1966.'},
      capablanca: { label: 'Capablanca', boardStyle: 'checkered', rows: 8, cols: 10, tileSize: 36, fen: 'rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR', variantDesc: 'Two extra pieces: Archbishop (B+N) and Chancellor (R+N) on 10x8 board.'},
      chak: { label: 'Chak', boardStyle: 'checkered', rows: 9, cols: 9, tileSize: 38, fen: 'sjvdaxdvs/9/1ppppppp1/9/9/9/1PPPPPPP1/9/SJVDAXDVS', variantDesc: 'Mesoamerican 9x9 chess. Win by mating Ajaw or landing promoted Ajaw on opponent temple. Pieces promote crossing the river. Corey Clark, 2020.'},
      chaturanga: { label: 'Chaturanga', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnefkenr/pppppppp/8/8/8/8/PPPPPPPP/RNEFKENR', variantDesc: 'Ancient Indian ancestor of chess, c. 600 CE. Weak counsellor and leaping elephant.'},
      checkless: { label: 'Checkless', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Cannot give check unless it is checkmate.'},
      chennis: { label: 'Chennis', boardStyle: 'checkered', rows: 7, cols: 7, tileSize: 40, fen: 'rnbkqbn/ppppppp/7/7/7/PPPPPPP/RNBKQBN', variantDesc: 'Tennis-themed 7x7 chess. Win by advancing a Pawn to the far rank. Net across rank 4 blocks most pieces. Corey Clark.'},
      chigorin: { label: 'Chigorin', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNNQKNNR', variantDesc: 'White\'s Bishops replaced by Knights. Four Knights vs standard army.'},
      codrus: { label: 'Codrus', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'No check exists. Win by getting your own King captured.'},
      courier: { label: 'Courier Chess', boardStyle: 'checkered', rows: 8, cols: 12, tileSize: 32, fen: 'rnebfsksbenr/pppppppppppp/12/12/12/12/PPPPPPPPPPPP/RNEBFSKSBENR', variantDesc: 'Medieval German variant (1200s). Extra bishops and sage pieces on 12x8 board.'},
      crazyhouse: { label: 'Crazyhouse', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Captured pieces switch sides and can be dropped back onto the board.'},
      'cylinder-chess': { label: 'Cylinder Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Files wrap. The a-file connects to the h-file.'},
      'dark-chess': { label: 'Dark Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Total fog. Only see squares occupied by your own pieces.'},
      'de-vasa': { label: 'De Vasa (Hex)', boardStyle: 'hex', hexRows: 9, hexCols: 9, hexSize: 20, flat: true, hexColorFn: glinskiColor, hexPosition: DE_VASA_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }, variantDesc: '81-hex rhombus board. Pawns start rank 3. Kings on opposite wings. Castling permitted. Helge E. de Vasa, 1953.'},
      diana: { label: 'Diana', boardStyle: 'checkered', rows: 6, cols: 6, tileSize: 40, fen: 'rbbkr1/pppppp/6/6/PPPPPP/RBBKR1', variantDesc: '6x6 board. No queens or knights.'},
      'dice-chess': { label: 'Dice Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Die roll constrains which piece type must move.'},
      'displacement-chess': { label: 'Displacement', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Pieces can swap positions with adjacent friendly pieces.'},
      'duck-chess': { label: 'Duck Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'After each move, place the duck (blocker) on any empty square.'},
      'einstein-chess': { label: 'Einstein Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Non-capturing moves demote pieces; captures promote them.'},
      empire: { label: 'Empire Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'scdtedcs/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Asymmetric: FIDE Kingdom vs Empire. Empire pieces slide like Queens but capture differently. Faceoff rule. Corey Clark, 2019.'},
      'endgame-chess': { label: 'Endgame Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3', variantDesc: 'Only Kings and pawns. Pure endgame technique from move one.'},
      extinction: { label: 'Extinction', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Lose all of any one piece type and you lose the game.'},
      'fischer-random': { label: 'Fischer Random', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Back rank pieces randomised (960 positions). Castling adapted.'},
      'five-check': { label: 'Five-Check', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Extended Three-Check. Five checks wins instead of three.'},
      'fog-of-war': { label: 'Fog of War', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Only see squares your pieces can move to. No check warnings.'},
      giveaway: { label: 'Giveaway', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Forced captures. King is not royal. Stalemate is a loss.'},
      glinski: { label: 'Glinski (Hex)', boardStyle: 'hex', hexRadius: 5, hexSize: 22, flat: true, hexColorFn: glinskiColor, hexPosition: GLINSKI_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' } , variantDesc: 'Chess on a 91-cell hexagonal board. Three bishops per side.'},
      grand: { label: 'Grand Chess', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 34, fen: 'r8r/1nbqkcbn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCBN1/R8R', variantDesc: 'Archbishop and Chancellor on 10x10 board. Pawns start on rank 3.'},
      grasshopper: { label: 'Grasshopper Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbgkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBGKBNR', variantDesc: 'Queens replaced by Grasshoppers (hop over any piece, land immediately beyond).'},
      'grid-chess': { label: 'Grid Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Moves must cross at least one 2x2 grid line.'},
      gygax: { label: 'Gygax Chess (Level 2)', boardStyle: 'checkered', rows: 8, cols: 12, tileSize: 28, fen: 'rnbhqkchbnr1/pppppppppppp/12/12/12/12/PPPPPPPPPPPP/RNBHQKCHBNR1', variantDesc: 'D&D-inspired three-level chess by Gary Gygax. 12x8 boards. Hero, Cleric, and fantasy pieces.'},
      'half-chess': { label: 'Half Chess', boardStyle: 'checkered', rows: 4, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/PPPPPPPP/RNBQKBNR', variantDesc: '4-rank board. Armies start adjacent. Immediate contact.'},
      'hoppel-poppel': { label: 'Hoppel-Poppel', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Knights capture like bishops; bishops capture like knights.'},
      horde: { label: 'Horde', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP', variantDesc: 'White has full army. Black has 36 pawns. Asymmetric survival.'},
      'immunization-chess': { label: 'Immunization', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Adjacent enemy pieces become immune to capture for 2 turns after a capture.'},
      'king-of-the-hill': { label: 'King of the Hill', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Moving your king to d4/d5/e4/e5 is an instant win.'},
      'khans-chess': { label: "Khan's Chess", boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'lhakahls/ssssssss/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Asymmetric: FIDE Kingdom vs Mongol Horde cavalry. All Horde pieces move as Knights, capture as FIDE counterparts. Couch Tomato, 2023.'},
      knightmate: { label: 'Knightmate', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rkbqnbkr/pppppppp/8/8/8/8/PPPPPPPP/RKBQNBKR', variantDesc: 'Knight and King swap roles. The Knight is royal.'},
      'legan-chess': { label: 'Legan Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbkqbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBKQBNR', variantDesc: 'Berolina pawns. King and Queen swap starting squares.'},
      'los-alamos': { label: 'Los Alamos', boardStyle: 'checkered', rows: 6, cols: 6, tileSize: 40, fen: 'rnqknr/pppppp/6/6/PPPPPP/RNQKNR', variantDesc: 'First computer chess (1956). 6x6 board, no Bishops, no castling.'},
      madrasi: { label: 'Madrasi', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Same-type opposing pieces paralyse each other when they attack.'},
      maharaja: { label: 'Maharaja', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/8/4M3', variantDesc: 'One full army vs one piece that moves as Queen + Knight.'},
      makpong: { label: 'Makpong', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'King cannot move out of check. Must block or capture.'},
      makruk: { label: 'Makruk', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rngfkgnr/8/pppppppp/8/8/PPPPPPPP/8/RNGFKGNR', variantDesc: 'Thai chess. Pawns promote on rank 6. No castling or en passant.'},
      mansindam: { label: 'Mansindam', boardStyle: 'checkered', rows: 9, cols: 8, tileSize: 38, fen: 'rncakqbm/pppppppp/9/9/9/9/9/PPPPPPPP/RNCAKQBM', variantDesc: 'Shogi-style drops with compound pieces on 8x9 board. No draws. Win by checkmate, campmate, or stalemate. Couch Tomato.'},
      marseillais: { label: 'Marseillais', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Each player makes two moves per turn (except White\'s first).'},
      mccooey: { label: 'McCooey (Hex)', boardStyle: 'hex', hexRadius: 5, hexSize: 22, flat: true, hexColorFn: glinskiColor, hexPosition: MCCOOEY_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }, variantDesc: 'McCooey hex chess. 7 pawns, diagonal pawn capture. Same 91-hex board as Glinski.'},
      'medusa-chess': { label: 'Medusa Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'After queen moves, attacked enemy pieces are petrified for 2 turns.'},
      'mini-hexchess': { label: 'Mini Hexchess', boardStyle: 'hex', hexRadius: 3, hexSize: 28, flat: true, hexColorFn: glinskiColor, hexPosition: MINI_HEXCHESS_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }, variantDesc: 'Compact 37-hex board. No Queen. McCooey 1997.'},
      minichess: { label: 'Minichess', boardStyle: 'checkered', rows: 5, cols: 5, tileSize: 40, fen: 'kqbnr/ppppp/5/PPPPP/RNBQK', variantDesc: 'Gardner\'s 5x5 board. All piece types, fast tactical games.'},
      'monster-chess': { label: 'Monster Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/R3K2R', variantDesc: 'White moves twice per turn but starts with only King, Rooks, and pawns.'},
      'no-castling': { label: 'No Castling', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Standard chess with castling removed. Kings must develop naturally.'},
      nightrider: { label: 'Nightrider Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Knights replaced by Nightriders (repeat knight leap in same direction).'},
      'no-retreat': { label: 'No Retreat', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Pieces cannot move backward toward their own starting rank.'},
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
      progressive: { label: 'Progressive', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Moves per turn escalate: 1, 2, 3, 4... Check ends turn early.'},
      'racing-kings': { label: 'Racing Kings', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: '8/8/8/8/8/8/krbnNBRK/qrbnNBRQ', variantDesc: 'No checks allowed. Both kings start on 1st rank. Race to the top.'},
      'recruitment-chess': { label: 'Recruitment', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Captured pieces defect to the captor on the vacated square.'},
      rifle: { label: 'Rifle Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Capturing pieces stay on their square. They shoot the target.'},
      's-chess': { label: 'S-Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Hawk and Elephant enter via gating when back-rank pieces vacate. Yasser Seirawan and Jonathan Tisdall, 2007.'},
      shako: { label: 'Shako', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 34, fen: 'rcebqkbecr/pppppppppp/10/10/10/10/10/10/PPPPPPPPPP/RCEBQKBECR', variantDesc: '10x10 with Cannon (screen-jump capture) and Elephant (2-diagonal leap). Jean-Louis Cazaux, 2000.'},
      shatar: { label: 'Shatar', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Mongolian chess. No check. Win by leaving opponent with only their King.'},
      shatranj: { label: 'Shatranj', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnekfenr/pppppppp/8/8/8/8/PPPPPPPP/RNEKFENR', variantDesc: 'Medieval Islamic chess. Bare king and stalemate are wins.'},
      shafran: { label: 'Shafran (Hex)', boardStyle: 'hex', hexGrid: SHAFRAN_GRID, hexSize: 20, flat: true, hexColorFn: glinskiColor, hexPosition: SHAFRAN_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' }, variantDesc: 'Irregular 70-hex board, 9 files. Castling permitted. Pawn initial step varies by file. Isaak Shafran, 1939.'},
      'single-check': { label: 'Single-Check', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'One check wins. No checkmate needed.'},
      shinobi: { label: 'Shinobi Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'cmujtmuc/2pppp2/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Asymmetric: FIDE vs Shinobi Clan. Clan drops ninja pieces from hand, promotes in zone. Corey Clark, 2021.'},
      shogun: { label: 'Shogun Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Zone-triggered promotion and Shogi-style drops from captured pieces. Corey Clark, 2020.'},
      sittuyin: { label: 'Sittuyin', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Burmese chess. Placement opening phase. Pawns promote on diagonal.'},
      spartan: { label: 'Spartan Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'lwgkkgwl/hhhhhhhh/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Asymmetric: Persian (FIDE) vs Spartan army with two Kings and unique pieces. Steven Streetman, 2010.'},
      'stalemate-wins': { label: 'Stalemate Wins', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Standard chess but stalemate is a win, not a draw.'},
      'suicide-chess': { label: 'Suicide Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Forced captures. Stalemate is a draw, not a loss.'},
      synochess: { label: 'Synochess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rheachhr/2n2n2/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Asymmetric: Western FIDE vs Eastern dynasty (Xiangqi pieces, Cannon, Soldier drops). Faceoff rule. Corey Clark, 2020.'},
      tamerlane: { label: 'Tamerlane Chess', boardStyle: 'checkered', rows: 10, cols: 11, tileSize: 30, fen: '11/rntzfkwztnr/ppppppppppp/e1j1d1d1j1e/11/11/E1J1D1D1J1E/PPPPPPPPPPP/RNTZFKWZTNR/11', variantDesc: 'Medieval 11x10 board with citadels. 12 piece types including Giraffe, Camel, War Engine.'},
      'teleport-chess': { label: 'Teleport Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Each side has 3 teleports per game.'},
      'three-check': { label: 'Three-Check', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'First to check the opponent three times wins.'},
      'toroidal-chess': { label: 'Toroidal Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Board wraps in both directions (files and ranks). No edges exist.'},
      torpedo: { label: 'Torpedo', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Pawns can move two squares forward from any rank.'},
      ultima: { label: 'Ultima', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'cilwklhc/pppppppp/8/8/8/8/PPPPPPPP/CIHLKLIC', variantDesc: 'All 7 piece types use different capture mechanics. No check: win by capturing the King. Robert Abbott, 1962.'},
      'upside-down': { label: 'Upside-Down', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'RNBQKBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbqkbnr', variantDesc: 'Pieces start on the opponent\'s back rank. Instant tactical chaos.'},
      weak: { label: 'Weak!', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', variantDesc: 'Weakest piece type with a legal move must move first.'},
      wildebeest: { label: 'Wildebeest Chess', boardStyle: 'checkered', rows: 10, cols: 11, tileSize: 30, fen: 'rncwqkwcnr1/ppppppppppp/11/11/11/11/11/11/PPPPPPPPPPP/RNCWQKWCNR1', variantDesc: 'Camel + Wildebeest (GNU) pieces on 11x10 board. R. Wayne Schmittberger, 1987.'},
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
      sunjang: { label: 'Sunjang Baduk (19×19)', boardStyle: 'go', rows: 19, cols: 19, tileSize: 20, setupDesc: '16 pre-placed stones on star points', variantDesc: 'Korean historical Go. Prisoners ignored. No komi.' },
      tibetan: { label: 'Tibetan Go (17×17)', boardStyle: 'go', rows: 17, cols: 17, tileSize: 20, setupDesc: '12 pre-placed stones, 289 intersections', variantDesc: '17x17 board. Delayed captures. Unique scoring system.' },
      'toroidal-go': { label: 'Toroidal Go (11×11)', boardStyle: 'go', rows: 11, cols: 11, tileSize: 20, setupDesc: 'Empty board, edges wrap', variantDesc: 'Edges wrap horizontally and vertically. No corners, no edges, no joseki.' },
    },
  },
  xiangqi: {
    label: 'Xiangqi',
    pieceSet: 'mce-xiangqi-trad',
    variants: {
      standard: { label: 'Standard', boardStyle: 'xiangqi', rows: 10, cols: 9, tileSize: 36, river: true, fen: 'rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR', setupDesc: '16 pieces each across river', variantDesc: 'Chinese chess. Palace confines generals and advisors. River restricts elephants. Cannons screen-jump to capture.' },
      janggi: { label: 'Janggi', boardStyle: 'xiangqi', rows: 10, cols: 9, tileSize: 36, river: false, fen: 'rhea1aehr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RHEA1AEHR', setupDesc: '16 pieces each, generals in palace centre', variantDesc: 'Korean chess. No river. Elephants move wider. Generals and guards move along palace diagonals.' },
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
      minishogi: { label: 'Minishogi (5×5)', boardStyle: 'shogi', rows: 5, cols: 5, tileSize: 40, fen: 'rbsgk/4p/5/P4/KGSBR', setupDesc: '6 pieces each on a 5x5 board', variantDesc: 'Standard Shogi on a 5x5 board. Single-rank promotion zone. No Knights or Lances.' },
      'kyoto-shogi': { label: 'Kyoto Shogi (5×5)', boardStyle: 'shogi', rows: 5, cols: 5, tileSize: 40, fen: 'pgskl/5/5/5/LKSGP', setupDesc: '5 pieces each on back rank', variantDesc: 'Every piece except the King flips to its alternate face after each move.' },
      'hasami-shogi': { label: 'Hasami Shogi (9×9)', boardStyle: 'shogi', rows: 9, cols: 9, tileSize: 36, fen: 'ppppppppp/9/9/9/9/9/9/9/PPPPPPPPP', setupDesc: '9 pawns each on back rank', variantDesc: 'Custodial sandwich capture. No drops, no promotion. All pieces are identical.' },
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
      standard: { label: 'Standard (11×11)', boardStyle: 'hex', hexRows: 11, hexCols: 11, hexSize: 20, flat: false, colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, setupDesc: 'Empty 11x11 rhombus board', variantDesc: 'Connection game. Place stones to connect your two opposite edges. No captures.' },
      'y-game': { label: 'Y (side 12)', boardStyle: 'hex', hexGrid: generateTriangularHexGrid(12), hexSize: 18, flat: false, colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' }, setupDesc: 'Empty triangular board, 78 cells', variantDesc: 'Triangular hex board. Connect all 3 edges with a single chain. Generalises Hex. Shannon & Schensted, 1950s.' },
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
    noRenderer: true,
    variants: {
      big2: { label: 'Big 2', noRenderer: true, setupDesc: '13 cards each, 4 players', variantDesc: 'Climbing card game where 2 is the highest rank. Play singles, pairs, triples, or five-card poker hands.' },
      president: { label: 'President', noRenderer: true, setupDesc: 'Full deck dealt evenly, 4-8 players', variantDesc: 'Role-based climbing game with card trading between rounds. Positions persist. Tests multi-round state and asymmetric deals.' },
    },
  },
  'flower-48': {
    label: '48 Flowers',
    pieceSet: null,
    noRenderer: true,
    variants: {
      'koi-koi': { label: 'Koi-Koi', noRenderer: true, setupDesc: '8 cards each + 8 field, 2 players', variantDesc: 'The most popular Hanafuda game. Complete a yaku and declare win, or say Koi-Koi to keep playing for more — at the risk of losing the bonus.' },
      'hana-awase': { label: 'Hana-Awase', noRenderer: true, setupDesc: '48-card deck, 2-4 players', variantDesc: 'The base Hanafuda matching game. No yaku — card values only. Simplest entry point to the deck.' },
      'oicho-kabu': { label: 'Oicho-Kabu', noRenderer: true, setupDesc: '48-card deck, 2-8 players', variantDesc: 'A betting game using Hanafuda month numbers, not suit imagery. Closest to 9 wins. Similar to Baccarat.' },
    },
  },
  'standard-dice': {
    label: 'Standard Dice',
    pieceSet: null,
    noRenderer: true,
    variants: {
      farkle: { label: 'Farkle', noRenderer: true, setupDesc: '6 dice, 2-6 players', variantDesc: 'Roll 6 dice, bank scoring combinations, press your luck. Roll nothing that scores and lose your entire turn\'s points.' },
      'liars-dice': { label: 'Liar\'s Dice', noRenderer: true, setupDesc: '5 dice each under cups, 2-6 players', variantDesc: 'Hidden dice under cups. Bid on what the combined dice show. Call liar to challenge — and risk a die of your own.' },
      yahtzee: { label: 'Yahtzee', noRenderer: true, setupDesc: '5 dice, 13 categories, 1-4 players', variantDesc: 'Five dice, 13 scoring categories, one shot at a Yahtzee. Fill every box across three rolls per turn.' },
    },
  },
  mahjong: {
    label: 'Mahjong',
    pieceSet: null,
    noRenderer: true,
    variants: {
      'hong-kong': { label: 'Hong Kong', noRenderer: true, setupDesc: '144 tiles, 4 players, 13-tile hand', variantDesc: 'The canonical Cantonese ruleset. Faan scoring with minimum 3 faan to win. Discarder pays on ron; wall win doubles from all.' },
      riichi: { label: 'Riichi (Japanese)', noRenderer: true, setupDesc: '136 tiles, 4 players, 13-tile hand', variantDesc: 'Japanese Mahjong. Yaku requirement to win. Riichi declaration locks the hand. Furiten prevents discarded-tile wins.' },
      taiwanese: { label: 'Taiwanese', noRenderer: true, setupDesc: '144 tiles, 4 players, 16-tile hand', variantDesc: '16-tile hands requiring five melds and one pair. Multiple players can win from a single discard.' },
      'zung-jung': { label: 'Zung Jung', noRenderer: true, setupDesc: '136 tiles, 4 players, 13-tile hand', variantDesc: 'Alan Kwan\'s competition system. 44 named patterns, additive scoring, 320-point limit.' },
    },
  },
  'double-six-dominoes': {
    label: 'D6 Dominoes',
    pieceSet: null,
    noRenderer: true,
    variants: {
      block: { label: 'Block', noRenderer: true, setupDesc: '7 tiles each, 2-4 players', variantDesc: 'The foundational domino game — match ends, no boneyard draws. If no one can play, lowest pip count wins.' },
      'all-fives': { label: 'All Fives', noRenderer: true, setupDesc: '7 tiles each, 2-4 players', variantDesc: 'Score points as you play — whenever open ends total a multiple of 5, score that many. Doubles branch in four directions.' },
      'mexican-train': { label: 'Mexican Train', noRenderer: true, setupDesc: 'Double-12 set, 2-8 players', variantDesc: 'Hub-and-spokes layout. Each player builds their own train from the central double. The shared Mexican Train is always available.' },
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
    noRenderer: true,
    variants: {
      standard: { label: 'Standard', noRenderer: true, setupDesc: 'Board game, 2-6 players', variantDesc: 'Euro-style resource management meets Monopoly. Original Moddable mod.' },
    },
  },
  'hyper-imperium': {
    label: 'Hyper Imperium',
    pieceSet: null,
    noRenderer: true,
    variants: {
      standard: { label: 'Standard', noRenderer: true, setupDesc: 'Hex map, 3-6 players', variantDesc: '3D exploration and mercenary factions for Twilight Imperium. Original Moddable mod.' },
    },
  },
  'dnd-5e': {
    label: 'D&D 5e SRD',
    pieceSet: null,
    noRenderer: true,
    variants: {
      standard: { label: 'Core Rules', noRenderer: true, setupDesc: 'Tabletop RPG, 3-6 players', variantDesc: 'The open core rules for the world\'s most popular roleplaying game.' },
    },
  },
  ironsworn: {
    label: 'Ironsworn',
    pieceSet: null,
    noRenderer: true,
    variants: {
      standard: { label: 'Standard', noRenderer: true, setupDesc: 'Solo/co-op RPG, 1-4 players', variantDesc: 'A perilous quest through the Ironlands, guided by vows and oracle tables.' },
    },
  },
  agon: {
    label: 'Agon',
    pieceSet: 'playstrategy-go-classic',
    variants: {
      standard: { label: 'Standard (91 hexes)', boardStyle: 'hex', hexRadius: 5, hexSize: 22, flat: false, colors: { lightHex: '#f5e6c8', darkHex: '#e8d4a8', midHex: '#f0ddb8', stroke: 'rgba(0,0,0,0.2)', background: '#3a2a1a' }, setupDesc: 'Queen + 6 Guards per player on concentric hex rings', variantDesc: 'Guide your Queen to the centre hex while blocking opponent. Concentric 91-hex board. France, 1842.' },
    },
  },
  asalto: {
    label: 'Asalto',
    pieceSet: 'playstrategy-draughts-plain',
    variants: {
      standard: { label: 'Standard', boardStyle: 'checkered', rows: 9, cols: 9, tileSize: 36, showLabels: false, cellMap: ASALTO_MAP, colors: ASALTO_COLORS, setupDesc: '2 Officers in fortress vs 24 Soldiers on plain', variantDesc: 'Asymmetric siege. Officers jump-capture like draughts; Soldiers advance forward/sideways. Immobilize to win.' },
      'royal-garrison': { label: 'Royal Garrison', boardStyle: 'checkered', rows: 9, cols: 9, tileSize: 36, showLabels: false, cellMap: ASALTO_MAP, colors: ASALTO_COLORS, setupDesc: '3 Officers in larger fortress vs 50 Soldiers', variantDesc: 'Extended Asalto. Three Officers defend a larger fortress against 50 Soldiers.' },
    },
  },
  'bavarian-32': {
    label: 'Bavarian 32',
    pieceSet: null,
    noRenderer: true,
    variants: {
      skat: { label: 'Skat', noRenderer: true, setupDesc: '32-card deck, 3 players, 10-card hands', variantDesc: 'Germany\'s national card game. Auction bidding, solo declarer vs two defenders. Trump suit or Grand/Null contracts.' },
    },
  },
  'dou-shou-qi': {
    label: 'Jungle',
    pieceSet: null,
    variants: {
      standard: { label: 'Standard (7×9)', boardStyle: 'checkered', rows: 9, cols: 7, tileSize: 40, showLabels: false, cellMap: JUNGLE_MAP, colors: JUNGLE_COLORS, setupDesc: '8 animals per player on 7x9 grid with river, dens, and traps', variantDesc: 'Animals battle across rivers and traps to reach the enemy den. Rank hierarchy: Elephant > Lion > ... > Rat (but Rat defeats Elephant).' },
    },
  },
  lattaque: {
    label: "L'Attaque",
    pieceSet: null,
    variants: {
      standard: { label: 'Standard', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 34, showLabels: false, cellMap: LATTAQUE_MAP, colors: LATTAQUE_COLORS, setupDesc: '30 pieces per player, 10x10 grid with lakes', variantDesc: 'Hidden-rank warfare. Higher rank defeats lower. Bombs immovable, Scouts slide unlimited. Precursor to Stratego.' },
      'dover-patrol': { label: 'Dover Patrol', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 34, showLabels: false, cellMap: LATTAQUE_MAP, colors: LATTAQUE_COLORS, setupDesc: 'Naval grid with minefields', variantDesc: 'Naval warfare variant. Ships replace soldiers; Mine Sweepers defuse Mines; Submarines defeat Battleships on attack.' },
      'tri-tactics': { label: 'Tri-Tactics', boardStyle: 'checkered', rows: 12, cols: 12, tileSize: 30, showLabels: false, colors: LATTAQUE_COLORS, setupDesc: 'Larger board, Army/Navy/Air Force units', variantDesc: 'Three-service variant: Army, Navy, Air Force with unique movement. Air units overfly impassable squares.' },
    },
  },
  nyout: {
    label: 'Nyout',
    pieceSet: 'playstrategy-draughts-plain',
    variants: {
      standard: { label: 'Standard', boardStyle: 'checkered', rows: 9, cols: 9, tileSize: 36, showLabels: false, cellMap: NYOUT_MAP, colors: NYOUT_COLORS, setupDesc: '4 tokens per player, 29-position circular track', variantDesc: 'Korean stick-throwing race. Circular track with shortcut branches. Throw 4 sticks for movement. Capture by landing on opponent.' },
    },
  },
}

// ─── FEN → pieceImages mapping ──────────────────────────────────────────────

const FEN_TO_PIECE_ID = {
  K: 'wK', Q: 'wQ', R: 'wR', B: 'wB', N: 'wN', P: 'wP',
  k: 'bK', q: 'bQ', r: 'bR', b: 'bB', n: 'bN', p: 'bP',
  A: 'wA', a: 'bA', C: 'wC', c: 'bC', E: 'wE', e: 'bE',
  F: 'wF', f: 'bF', S: 'wS', s: 'bS', G: 'wG', g: 'bG',
  H: 'wH', h: 'bH', I: 'wI', i: 'bI', L: 'wL', l: 'bL',
  M: 'wM', m: 'bM', W: 'wW', w: 'bW', Y: 'wY', y: 'bY',
}

const GAME_FEN_OVERRIDES = {
  xiangqi: { H: 'wN', h: 'bN', R: 'wR', r: 'bR', E: 'wE', e: 'bE', A: 'wA', a: 'bA', K: 'wK', k: 'bK', C: 'wC', c: 'bC', P: 'wP', p: 'bP' },
}

function buildPieceImages(pieceSetId, galleryIndex, gameId) {
  if (!pieceSetId || !galleryIndex) return {}
  const setDef = galleryIndex.find(s => s.id === pieceSetId)
  if (!setDef) return {}
  const basePath = `../pieces/sets/${pieceSetId}/`
  const images = {}
  // Map all gallery piece IDs directly (covers bS, wS, bM, wM, bK, wK etc.)
  for (const [pieceId, filename] of Object.entries(setDef.pieces)) {
    images[pieceId] = basePath + filename
  }
  // Also map FEN characters for chess-style games
  const fenMap = GAME_FEN_OVERRIDES[gameId] || FEN_TO_PIECE_ID
  for (const [fenChar, pieceId] of Object.entries(fenMap)) {
    if (setDef.pieces[pieceId]) {
      images[fenChar] = basePath + setDef.pieces[pieceId]
    }
  }
  return images
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
  galleryIndex = await fetch('../pieces/gallery-index.json').then(r => r.json()).catch(() => null)
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
  } else {
    hexStyleGroup.style.display = 'none'
    hexSeedGroup.style.display = 'none'
    hexPlayersGroup.style.display = 'none'
  }

  if (variantDef.static) {
    loadStaticSvg(state.game, state.variant, variantDef)
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

  if (game.hexGame) {
    renderHexGame(game, variantDef)
    return
  }

  const config = { ...variantDef }

  // Build position from FEN
  if (config.fen) {
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

  // Build fanorona position
  if (config.fanoronaSetup) {
    config.position = buildFanoronaPosition(config.rows, config.cols)
  }

  // Build piece image paths
  if (game.pieceSet && (config.position || config.hexPosition || config.parsedSetup || config.filledArms)) {
    config.pieceImages = buildPieceImages(game.pieceSet, galleryIndex, state.game)
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
    M: 'Amazon', m: 'Amazon', E: 'Elephant', e: 'Elephant',
    F: 'Ferz', f: 'Ferz', S: 'Silver', s: 'Silver', G: 'Gold', g: 'Gold',
    L: 'Lance', l: 'Lance', H: 'Horse', h: 'Horse',
    man: 'Man', king: 'King', stone: 'Stone', piece: 'Disc',
  }

  svgContainer.addEventListener('mouseover', e => {
    const cell = e.target.closest('.board-cell')
    if (!cell) return
    const sq = cell.dataset.sq
    const type = cell.dataset.type || ''
    let text = sq
    if (type && type !== 'floor') text += ` [${type}]`
    const piece = position[sq]
    if (piece) {
      const p = typeof piece === 'object' ? piece : { type: String(piece) }
      const color = p.color ? p.color : (p.type === p.type.toUpperCase() ? 'White' : 'Black')
      const name = PIECE_NAMES[p.type] || p.type
      text += ` — ${color} ${name}`
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
    else if (cfg.svgPath) rows.push(`<div class="info-row info-row--block"><span class="info-label">Source</span><span class="info-value info-value--fen">${cfg.svgPath}</span></div>`)
    else if (!cfg.position && !cfg.static) rows.push(`<div class="info-row"><span class="info-label">Setup</span><span class="info-value">Empty board</span></div>`)
    if (cfg.fen || cfg.setup) rows.push(`<div class="info-row"><span class="info-label">Notation</span><span class="info-value">FEN</span></div>`)
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

document.addEventListener('DOMContentLoaded', init)
