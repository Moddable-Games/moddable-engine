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

const CHAUPAR_CASTLES = [[0, 9], [3, 8], [3, 10], [8, 3], [8, 15], [9, 0], [9, 18], [10, 3], [10, 15], [15, 8], [15, 10], [18, 9]]
const CHAUPAR_MAP = buildCrossMap(CHAUPAR_CASTLES)

const PACHISI_COLORS = {
  floor: '#f0d5a0', floorStroke: '#8b6545',
  castle: '#c0622f', castleStroke: '#8b6545', castleX: '#fff8f0',
  home: '#8b1a1a', homeStroke: '#6a1212',
  voidFill: 'transparent',
}

const CHAUPAR_COLORS = {
  floor: '#d4d8f0', floorStroke: '#2d3a8c',
  castle: '#4a5ab8', castleStroke: '#2d3a8c', castleX: '#e8ecff',
  home: '#1a1a6b', homeStroke: '#12124a',
  voidFill: 'transparent',
}

const ROYAL_UR_COLORS = {
  floor: '#d4b896', floorStroke: '#8b7355',
  rosette: '#c4956a', rosetteStroke: '#8b5a3a',
  voidFill: 'transparent',
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

const GLINSKI_POSITION = (() => {
  const pos = {}
  // Axial coords (q, r) for flat-top radius-5 hex board.
  // Formula: r = 6 - rank - max(0, q). Center f6 = (0,0).
  // Rooks c1/i1, Knights d1/h1, Bishops f1/f2/f3 (one per hex colour).
  // Pawns arc: ranks 1,2,3,4,5,4,3,2,1 on files b-k.
  const white = [
    ['K', 1, 4], ['Q', -1, 5],
    ['B', 0, 5], ['B', 0, 4], ['B', 0, 3],
    ['N', -2, 5], ['N', 2, 3],
    ['R', -3, 5], ['R', 3, 2],
    ['P', -4, 5], ['P', -3, 4], ['P', -2, 3], ['P', -1, 2],
    ['P', 0, 1], ['P', 1, 1], ['P', 2, 1], ['P', 3, 1], ['P', 4, 1],
  ]
  // Black mirror: same file, opposite back rank. Transform: (q, r) → (q, -r-q)
  const black = white.map(([p, q, r]) => [p.toLowerCase(), q, -r - q])
  for (const [p, q, r] of white) pos[`${q},${r}`] = p
  for (const [p, q, r] of black) pos[`${q},${r}`] = p
  return pos
})()

// ─── GAME DEFINITIONS ───────────────────────────────────────────────────────
// Each variant specifies: boardStyle, dimensions, pieceSet, fen/position

const GAMES = {
  'moddable-chess': {
    label: 'Chess',
    pieceSet: 'mce-chess',
    variants: {
      standard: { label: 'Standard', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      absorption: { label: 'Absorption', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'almost-chess': { label: 'Almost Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBCKBNR' },
      'amazon-chess': { label: 'Amazon Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbmkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBMKBNR' },
      andernach: { label: 'Andernach', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      antichess: { label: 'Antichess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      atomic: { label: 'Atomic', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      benedict: { label: 'Benedict', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'berolina-chess': { label: 'Berolina', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      berserk: { label: 'Berserk', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      breakthrough: { label: 'Breakthrough', boardStyle: 'checkered', rows: 7, cols: 7, tileSize: 40, fen: 'ppppppp/ppppppp/7/7/7/PPPPPPP/PPPPPPP' },
      capablanca: { label: 'Capablanca', boardStyle: 'checkered', rows: 8, cols: 10, tileSize: 36, fen: 'rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR' },
      chaturanga: { label: 'Chaturanga', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnefkenr/pppppppp/8/8/8/8/PPPPPPPP/RNEFKENR' },
      checkless: { label: 'Checkless', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      chigorin: { label: 'Chigorin', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNNQKNNR' },
      codrus: { label: 'Codrus', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      courier: { label: 'Courier Chess', boardStyle: 'checkered', rows: 8, cols: 12, tileSize: 32, fen: 'rnebfsksbenr/pppppppppppp/12/12/12/12/PPPPPPPPPPPP/RNEBFSKSBENR' },
      crazyhouse: { label: 'Crazyhouse', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'cylinder-chess': { label: 'Cylinder Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'dark-chess': { label: 'Dark Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      diana: { label: 'Diana', boardStyle: 'checkered', rows: 6, cols: 6, tileSize: 40, fen: 'rbbkr1/pppppp/6/6/PPPPPP/RBBKR1' },
      'dice-chess': { label: 'Dice Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'displacement-chess': { label: 'Displacement', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'duck-chess': { label: 'Duck Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'einstein-chess': { label: 'Einstein Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'endgame-chess': { label: 'Endgame Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3' },
      extinction: { label: 'Extinction', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'fischer-random': { label: 'Fischer Random', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'five-check': { label: 'Five-Check', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'fog-of-war': { label: 'Fog of War', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      giveaway: { label: 'Giveaway', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      glinski: { label: 'Glinski (Hex)', boardStyle: 'hex', hexRadius: 5, hexSize: 22, flat: true, hexColorFn: glinskiColor, hexPosition: GLINSKI_POSITION, colors: { lightHex: '#ffce9e', darkHex: '#d18b47', midHex: '#e8ab6f', stroke: 'rgba(0,0,0,0.15)', background: '#2c2c2c' } },
      grand: { label: 'Grand Chess', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 34, fen: 'r8r/1nbqkcbn1/pppppppppp/10/10/10/10/PPPPPPPPPP/1NBQKCBN1/R8R' },
      'grid-chess': { label: 'Grid Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'half-chess': { label: 'Half Chess', boardStyle: 'checkered', rows: 4, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/PPPPPPPP/RNBQKBNR' },
      'hoppel-poppel': { label: 'Hoppel-Poppel', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      horde: { label: 'Horde', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP' },
      'immunization-chess': { label: 'Immunization', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'king-of-the-hill': { label: 'King of the Hill', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      knightmate: { label: 'Knightmate', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rkbqnbkr/pppppppp/8/8/8/8/PPPPPPPP/RKBQNBKR' },
      'legan-chess': { label: 'Legan Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbkqbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBKQBNR' },
      'los-alamos': { label: 'Los Alamos', boardStyle: 'checkered', rows: 6, cols: 6, tileSize: 40, fen: 'rnqknr/pppppp/6/6/PPPPPP/RNQKNR' },
      madrasi: { label: 'Madrasi', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      maharaja: { label: 'Maharaja', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/8/4M3' },
      makpong: { label: 'Makpong', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      makruk: { label: 'Makruk', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rngfkgnr/8/pppppppp/8/8/PPPPPPPP/8/RNGFKGNR' },
      marseillais: { label: 'Marseillais', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'medusa-chess': { label: 'Medusa Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      minichess: { label: 'Minichess', boardStyle: 'checkered', rows: 5, cols: 5, tileSize: 40, fen: 'kqbnr/ppppp/5/PPPPP/RNBQK' },
      'monster-chess': { label: 'Monster Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/R3K2R' },
      'no-castling': { label: 'No Castling', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'no-retreat': { label: 'No Retreat', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      omnicide: { label: 'Omnicide', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'orda-chess': { label: 'Orda Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'lhaykahl/8/pppppppp/8/8/PPPPPPPP/8/RNBQKBNR' },
      patrol: { label: 'Patrol', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'pawns-only': { label: 'Pawns Only', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: '4k3/pppppppp/8/8/8/8/PPPPPPPP/4K3' },
      'peasants-revolt': { label: "Peasants' Revolt", boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: '2n1k1n1/pppppppp/8/8/8/8/PPPPPPPP/4K3' },
      petty: { label: 'Petty Chess', boardStyle: 'checkered', rows: 6, cols: 5, tileSize: 40, fen: 'rnbqk/ppppp/5/5/PPPPP/RNBQK' },
      'poison-chess': { label: 'Poison Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      progressive: { label: 'Progressive', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'racing-kings': { label: 'Racing Kings', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: '8/8/8/8/8/8/krbnNBRK/qrbnNBRQ' },
      'recruitment-chess': { label: 'Recruitment', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      rifle: { label: 'Rifle Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      shatar: { label: 'Shatar', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      shatranj: { label: 'Shatranj', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnekfenr/pppppppp/8/8/8/8/PPPPPPPP/RNEKFENR' },
      'single-check': { label: 'Single-Check', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      sittuyin: { label: 'Sittuyin', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'stalemate-wins': { label: 'Stalemate Wins', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'suicide-chess': { label: 'Suicide Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'teleport-chess': { label: 'Teleport Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'three-check': { label: 'Three-Check', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'toroidal-chess': { label: 'Toroidal Chess', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      torpedo: { label: 'Torpedo', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      'upside-down': { label: 'Upside-Down', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'RNBQKBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbqkbnr' },
      weak: { label: 'Weak!', boardStyle: 'checkered', rows: 8, cols: 8, tileSize: 40, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
    },
  },
  go: {
    label: 'Go',
    pieceSet: 'playstrategy-go-classic',
    hasHandicap: true,
    variants: {
      standard: { label: 'Standard (19×19)', boardStyle: 'go', rows: 19, cols: 19, tileSize: 20 },
      '13x13': { label: '13×13', boardStyle: 'go', rows: 13, cols: 13, tileSize: 20 },
      '9x9': { label: '9×9', boardStyle: 'go', rows: 9, cols: 9, tileSize: 20 },
      'capture-go': { label: 'Capture Go (9×9)', boardStyle: 'go', rows: 9, cols: 9, tileSize: 20 },
      gomoku: { label: 'Gomoku (15×15)', boardStyle: 'go', rows: 15, cols: 15, tileSize: 20 },
      'ninuki-renju': { label: 'Ninuki-Renju (15×15)', boardStyle: 'go', rows: 15, cols: 15, tileSize: 20 },
      'one-colour': { label: 'One-Colour (19×19)', boardStyle: 'go', rows: 19, cols: 19, tileSize: 20 },
      'phantom-go': { label: 'Phantom Go (9×9)', boardStyle: 'go', rows: 9, cols: 9, tileSize: 20 },
      rengo: { label: 'Rengo (19×19)', boardStyle: 'go', rows: 19, cols: 19, tileSize: 20 },
      renju: { label: 'Renju (15×15)', boardStyle: 'go', rows: 15, cols: 15, tileSize: 20 },
      stoical: { label: 'Stoical Go (19×19)', boardStyle: 'go', rows: 19, cols: 19, tileSize: 20 },
      sunjang: { label: 'Sunjang Baduk (19×19)', boardStyle: 'go', rows: 19, cols: 19, tileSize: 20 },
      tibetan: { label: 'Tibetan Go (17×17)', boardStyle: 'go', rows: 17, cols: 17, tileSize: 20 },
      'toroidal-go': { label: 'Toroidal Go (11×11)', boardStyle: 'go', rows: 11, cols: 11, tileSize: 20 },
    },
  },
  xiangqi: {
    label: 'Xiangqi',
    pieceSet: 'mce-xiangqi-trad',
    variants: {
      standard: { label: 'Standard', boardStyle: 'xiangqi', rows: 10, cols: 9, tileSize: 36, river: true, fen: 'rheakaehr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RHEAKAEHR' },
      janggi: { label: 'Janggi', boardStyle: 'xiangqi', rows: 10, cols: 9, tileSize: 36, river: false, fen: 'rhea1aehr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RHEA1AEHR' },
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
      standard: { label: 'Standard (8×8)', boardStyle: 'mono-grid', rows: 8, cols: 8, tileSize: 40, setup: '8/8/8/3bw3/3wb3/8/8/8', colors: { monoSquare: '#2e7d32', gridLine: '#1b5e20' } },
      'six-by-six': { label: '6×6', boardStyle: 'mono-grid', rows: 6, cols: 6, tileSize: 40, setup: '6/6/2bw2/2wb2/6/6', colors: { monoSquare: '#2e7d32', gridLine: '#1b5e20' } },
      'anti-reversi': { label: 'Anti-Reversi (8×8)', boardStyle: 'mono-grid', rows: 8, cols: 8, tileSize: 40, setup: '8/8/8/3bw3/3wb3/8/8/8', colors: { monoSquare: '#2e7d32', gridLine: '#1b5e20' } },
    },
  },
  shogi: {
    label: 'Shogi',
    pieceSet: 'kahu-shogi-kanji-red-wood',
    variants: {
      standard: { label: 'Standard (9×9)', boardStyle: 'shogi', rows: 9, cols: 9, tileSize: 36, fen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL' },
      minishogi: { label: 'Minishogi (5×5)', boardStyle: 'shogi', rows: 5, cols: 5, tileSize: 40, fen: 'rbsgk/4p/5/P4/KGSBR' },
      'kyoto-shogi': { label: 'Kyoto Shogi (5×5)', boardStyle: 'shogi', rows: 5, cols: 5, tileSize: 40, fen: 'pgskl/5/5/5/LKSGP' },
      'hasami-shogi': { label: 'Hasami Shogi (9×9)', boardStyle: 'shogi', rows: 9, cols: 9, tileSize: 36, fen: 'ppppppppp/9/9/9/9/9/9/9/PPPPPPPPP' },
    },
  },
  morris: {
    label: 'Morris',
    pieceSet: 'playstrategy-go-classic',
    variants: {
      'nine-mens-morris': { label: "Nine Men's Morris", boardStyle: 'morris', boardSize: 320, rings: 3 },
      'six-mens-morris': { label: "Six Men's Morris", boardStyle: 'morris', boardSize: 260, rings: 2 },
      'twelve-mens-morris': { label: "Twelve Men's Morris", boardStyle: 'morris', boardSize: 320, rings: 3, diagonals: true },
      'three-mens-morris': { label: "Three Men's Morris", boardStyle: 'morris', boardSize: 200, rings: 1 },
      'lasker-morris': { label: 'Lasker Morris', boardStyle: 'morris', boardSize: 320, rings: 3 },
      morabaraba: { label: 'Morabaraba', boardStyle: 'morris', boardSize: 320, rings: 3, diagonals: true },
      shax: { label: 'Shax', boardStyle: 'morris', boardSize: 320, rings: 3 },
    },
  },
  fanorona: {
    label: 'Fanorona',
    pieceSet: 'playstrategy-dameo-fabirovsky',
    variants: {
      standard: { label: 'Standard (5×9)', boardStyle: 'alquerque', rows: 5, cols: 9, tileSize: 40, colors: { monoSquare: '#d4a96a', gridLine: '#7a4510', whitePieceFill: '#f0e8d0', whitePieceStroke: '#7a4510', blackPieceFill: '#1e1000', blackPieceStroke: '#c8963c' }, fanoronaSetup: true },
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
    pieceSet: 'playstrategy-draughts-plain',
    variants: {
      standard: { label: 'Chinese Checkers', static: true },
    },
  },
  hex: {
    label: 'Hex',
    pieceSet: 'playstrategy-go-classic',
    variants: {
      standard: { label: 'Standard (11×11)', boardStyle: 'hex', hexRows: 11, hexCols: 11, hexSize: 20, flat: false, colors: { lightHex: '#e8e8e8', darkHex: '#c0c0c0', midHex: '#d8d8d8', stroke: 'rgba(0,0,0,0.3)', background: '#f5f5f5' } },
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
  pachisi: {
    label: 'Pachisi',
    pieceSet: 'playstrategy-draughts-plain',
    variants: {
      standard: { label: 'Standard', boardStyle: 'checkered', rows: 19, cols: 19, tileSize: 20, showLabels: false, cellMap: PACHISI_MAP, colors: PACHISI_COLORS, setupDesc: '4 players, 4 pieces each start at Charkoni (centre)', variantDesc: 'Indian cross-track race game for 4 players. Roll cowrie shells. Castle squares grant safety. First to return all pieces home wins.' },
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
    variants: {
      standard: { label: 'Standard', static: true },
      '1904-original': { label: '1904 Original', static: true },
      '1906-commercial': { label: '1906 Commercial', static: true },
    },
  },
  'dungeon-chess': {
    label: 'Dungeon Chess',
    pieceSet: 'mce-chess',
    variants: {
      'two-player': { label: 'Two Player (20×8)', boardStyle: 'checkered', rows: 20, cols: 8, tileSize: 21, showLabels: false, cellMap: DUNGEON_2P, colors: DUNGEON_COLORS },
      'four-player': { label: 'Four Player (20×20)', boardStyle: 'checkered', rows: 20, cols: 20, tileSize: 18, showLabels: false, cellMap: DUNGEON_4P, colors: DUNGEON_COLORS },
      compact: { label: 'Compact Skirmish (10×10)', boardStyle: 'checkered', rows: 10, cols: 10, tileSize: 24, showLabels: false, cellMap: DUNGEON_COMPACT, colors: DUNGEON_COLORS },
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
  'planet-mongo': {
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
  if (game.pieceSet && (config.position || config.hexPosition || config.parsedSetup)) {
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
  const PIECE_NAMES = {
    K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn',
    k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn',
    A: 'Archbishop', a: 'Archbishop', C: 'Chancellor', c: 'Chancellor',
    M: 'Amazon', m: 'Amazon', E: 'Elephant', e: 'Elephant',
    F: 'Ferz', f: 'Ferz', S: 'Silver', s: 'Silver', G: 'Gold', g: 'Gold',
    L: 'Lance', l: 'Lance', H: 'Horse', h: 'Horse',
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
