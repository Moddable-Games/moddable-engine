/**
 * Render Adapter — translates a resolved cascade object into the flat opts
 * shape that renderBoard() consumes. Scheduled for deletion once renderBoard
 * accepts the resolved cascade directly (topology → produceLayout → SVG).
 */

import { fenToPosition } from '../../render/src/board-diagrams.js'
import { getDeckConfig, createDeck, shuffle, deal, layoutTable } from '../../component-deck/index.js'

let _renderDeckSvg = null
let _renderMahjongSvg = null
let _renderTableauSvg = null
let _renderMultiBoard = null
export function setDeckRenderer(fn) { _renderDeckSvg = fn }
export function setMahjongRenderer(fn) { _renderMahjongSvg = fn }
export function setTableauRenderer(fn) { _renderTableauSvg = fn }
export function setMultiBoardRenderer(fn) { _renderMultiBoard = fn }

// --- FEN character → piece ID mapping (same as boards.js) ---

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


function buildPieceImages(pieceSetId, gallery, fenOverrides, skipFenMap) {
  if (!pieceSetId || !gallery) return { images: {}, surfaceMap: {}, surface: null }
  const setDef = gallery.find(s => s.id === pieceSetId)
  if (!setDef) return { images: {}, surfaceMap: {}, surface: null }
  const images = {}
  const surfaceMap = {}
  const surface = setDef.surface || null

  if (setDef.extends) {
    const baseDef = gallery.find(s => s.id === setDef.extends)
    if (baseDef) {
      for (const [pieceId, entry] of Object.entries(baseDef.pieces || {})) {
        const path = resolvePieceEntry(pieceId, entry, baseDef.id)
        if (path) images[pieceId] = path
        if (typeof entry === 'object' && entry.surface) surfaceMap[pieceId] = entry.surface
      }
    }
  }

  for (const [pieceId, entry] of Object.entries(setDef.pieces || {})) {
    const path = resolvePieceEntry(pieceId, entry, pieceSetId, setDef.baseSet || null)
    if (path) images[pieceId] = path
    if (typeof entry === 'object' && entry.surface) surfaceMap[pieceId] = entry.surface
  }

  // Map FEN characters to piece IDs so renderPieces can find them
  // Skip for sets with numeric keys (mancala seed counts, etc.)
  if (!skipFenMap) {
    const fenMap = fenOverrides || FEN_TO_PIECE_ID
    for (const [fenChar, pieceId] of Object.entries(fenMap)) {
      if (images[pieceId]) images[fenChar] = images[pieceId]
      if (surfaceMap[pieceId]) surfaceMap[fenChar] = surfaceMap[pieceId]
    }
  }

  return { images, surfaceMap, surface }
}

function resolvePieceEntry(pieceId, entry, setId, baseSetId) {
  if (typeof entry === 'string') {
    const dir = baseSetId || setId
    if (baseSetId) {
      return `../pieces/sets/${dir}/${entry}#${pieceId}`
    }
    return `../pieces/sets/${dir}/${entry}`
  }
  if (entry && entry.source && entry.file) return `../pieces/sets/${entry.source}/${entry.file}`
  return null
}

// --- Board style mapping ---

const GRID_STYLES = new Set(['checkered', 'mono-grid', 'go', 'xiangqi', 'shogi', 'surakarta', 'alquerque'])

function isStyleCompatible(style, topoType) {
  if (GRID_STYLES.has(style)) return topoType === 'grid'
  if (style === 'hex') return topoType === 'hex'
  if (style === 'backgammon' || style === 'landlords') return topoType === 'track'
  if (style === 'mancala') return topoType === 'pit'
  return topoType === 'graph'
}

function resolveBoardStyle(resolved) {
  const topo = resolved.topology || {}
  const render = resolved.render || {}
  const cellColor = render.cellColor || 'checkered'
  const layout = topo.layout || 'cells'

  switch (topo.type) {
    case 'grid': {
      if (render.boardStyle && isStyleCompatible(render.boardStyle, 'grid') && (
        (layout === 'intersections' && render.boardStyle !== 'checkered' && render.boardStyle !== 'mono-grid') ||
        (layout !== 'intersections' && (render.boardStyle === 'checkered' || render.boardStyle === 'mono-grid'))
      )) return render.boardStyle
      if (layout === 'intersections') {
        if (cellColor === 'xiangqi' || render.decorations?.some(d => d.type === 'gap')) return 'xiangqi'
        if (render.decorations?.some(d => d.type === 'markers' && (d.auto === 'shogi-hoshi' || (d.at && render.boardStyle === 'shogi')))) return 'shogi'
        if (render.decorations?.some(d => d.type === 'arcs')) return 'surakarta'
        if (render.decorations?.some(d => d.type === 'diagonals' && d.pattern === 'alternating')) return 'alquerque'
        return 'go'
      }
      if (render.decorations?.some(d => d.type === 'diagonals' && d.pattern === 'alternating')) return 'alquerque'
      if (cellColor === 'uniform' || cellColor === 'none') return 'mono-grid'
      return 'checkered'
    }
    case 'hex':
      return 'hex'
    case 'track': {
      if (render.trackStyle === 'triangular-points') return 'backgammon'
      return 'landlords'
    }
    case 'pit':
      return 'mancala'
    case 'graph': {
      const structure = topo.structure || 'concentric-rings'
      if (structure === 'star') return 'stern-halma'
      if (structure === 'perimeter-cross') return 'nyout'
      if (structure === 'grid-cross') return 'asalto'
      return 'morris'
    }
    default:
      return null
  }
}


// --- Build opts from resolved object ---

function buildRenderOpts(resolved) {
  const topo = resolved.topology || {}
  const render = resolved.render || {}
  const surface = resolved.surface || {}

  const boardStyle = resolveBoardStyle(resolved)
  if (!boardStyle) return null

  const colors = surface?.colors || {}

  const opts = {
    boardStyle,
    colors,
    showLabels: render.labels !== false,
  }

  // Pass ops + render params through when present
  if (render.ops) {
    opts.ops = render.ops
    opts.inset = render.inset
    opts.insetFactor = render.insetFactor
    opts.idStyle = render.idStyle
    opts.layout = topo.layout
  }

  if (render.decorations) opts.decorations = render.decorations

  // Grid-based
  if (topo.type === 'grid') {
    opts.rows = topo.rows || 8
    opts.cols = topo.cols || 8
    opts.tileSize = render.cellSize || 40

    // Zone map (cellMap) — built from zones/cross layout for the ops pipeline
    if (render.zones) {
      opts.cellMap = buildCellMap(render.zones, opts.rows, opts.cols)
    } else if (topo.layout === 'cross') {
      opts.cellMap = buildCrossMap(opts.rows, opts.cols, render.castles || [])
    }

    // Provider-specific flags derived from decorations/options
    if (boardStyle === 'xiangqi') {
      if (render.river !== undefined) {
        opts.river = render.river
      } else {
        opts.river = render.decorations?.some(d => d.type === 'gap') || false
      }
      if (render.palace !== undefined) {
        opts.palace = render.palace
      }
      if (render.zones) {
        opts.zones = render.zones
      }
    }
  }

  // Hex
  if (topo.type === 'hex') {
    opts.flat = topo.orientation === 'flat'
    opts.hexSize = render.cellSize || 20
    opts.hexFrame = render.frame || topo.shape || null
    if (topo.grid) {
      opts.hexGrid = topo.grid.map(c => ({ q: c[0], r: c[1] }))
    } else if (topo.shape === 'triangular' && topo.sideLength) {
      opts.hexGrid = generateTriangularHexGrid(topo.sideLength)
    } else if (topo.shape === 'hexagonal' && topo.radius) {
      opts.hexRadius = topo.radius
    } else if (topo.rows && topo.cols) {
      opts.hexRows = topo.rows
      opts.hexCols = topo.cols
    }
    if (render.cellColor) opts.hexCellColor = render.cellColor
    // Hex position (map of "q,r" → piece)
    if (resolved.setup && typeof resolved.setup === 'object' && !Array.isArray(resolved.setup)) {
      opts.hexPosition = resolved.setup
    } else if (resolved.setup && typeof resolved.setup === 'string' && resolved.setup.includes(',') && resolved.setup.includes(':')) {
      opts.hexPosition = parseHexPositionString(resolved.setup)
    }
    if (render.centreMarker) opts.centreMarker = render.centreMarker

    if (render.cellColor === 'terrain' && opts.hexPosition) {
      opts.hexGrid = Object.entries(opts.hexPosition).map(([key, val]) => {
        const [q, r] = key.split(',').map(Number)
        const type = typeof val === 'string' ? val : val?.type || val?.piece || null
        return { q, r, type }
      })
    }
  }

  // Track
  if (topo.type === 'track') {
    opts.positions = topo.positions || 24
    if (render.overflow) opts.overflow = render.overflow
    if (boardStyle === 'landlords') {
      if (resolved.content?.data) opts.boardData = resolved.content.data
      if (resolved.content?.board) opts.variant = resolved.content.board
    }
    if (boardStyle === 'backgammon' && resolved.setup && typeof resolved.setup === 'string') {
      opts.parsedSetup = parseBackgammonSetup(resolved.setup)
    }
  }

  // Pit
  if (topo.type === 'pit') {
    opts.pitsPerSide = topo.cols || 6
    opts.boardRows = topo.rows || 2
    opts.hasStores = topo.stores !== false
    opts.pitRadius = render.cellSize || 22
    if (render.boardShape) opts.boardShape = render.boardShape
    if (render.cornerRadius) opts.cornerRadius = render.cornerRadius
    if (render.markers) opts.markers = render.markers
    if (render.pitCurve) opts.pitCurve = render.pitCurve
    if (render.storeSize) {
      opts.storeRx = render.storeSize[0]
      opts.storeRy = render.storeSize[1]
    }
    // Parse pit setup string
    if (resolved.setup && typeof resolved.setup === 'string') {
      opts.parsedSetup = parsePitSetup(resolved.setup)
      opts.seedsPerPit = opts.parsedSetup.pits[0] || 4
    }
  }

  // Graph
  if (topo.type === 'graph') {
    if (render.canvasSize) opts.boardSize = render.canvasSize
    if (topo.params) {
      if (topo.params.rings) opts.rings = topo.params.rings
      if (topo.params.midpoints !== undefined) opts.midpoints = topo.params.midpoints
      if (topo.params.diagonals !== undefined) opts.diagonals = topo.params.diagonals
    }
    if (topo.nodes) opts.nodes = topo.nodes
    if (topo.edges) opts.edges = topo.edges
    if (boardStyle === 'stern-halma') {
      opts.holeSpacing = render.cellSize || 30
      // Setup.arms → filledArms
      if (resolved.setup?.arms) opts.filledArms = resolved.setup.arms
    }
    if (boardStyle === 'asalto') {
      if (topo.params?.rows) {
        opts.asaltoGrid = {
          rows: topo.params.rows,
          fortressRows: topo.params.fortressRows || 2,
          ...(topo.params.fortressCols && { fortressCols: topo.params.fortressCols }),
          ...(topo.params.fortressExtraRow !== undefined && { fortressExtraRow: topo.params.fortressExtraRow }),
          ...(topo.params.extraNodes && { extraNodes: topo.params.extraNodes }),
        }
      }
    }
    if (boardStyle === 'morris') {
      opts.boardSize = render.canvasSize || 320
    }
  }

  // Layers (multi-board)
  if (render.layers) {
    opts.layers = render.layers
  } else if ((topo.layers || topo.boards) && Array.isArray(resolved.setup)) {
    const count = topo.layers || topo.boards
    opts.layers = {
      count,
      layout: count <= 2 ? 'horizontal' : 'vertical',
      labels: topo.layer_labels || [],
      fens: resolved.setup,
      ...(render.layerColors && { colors: render.layerColors }),
    }
  }

  // Overlays (rivers, borders, paths drawn over the board)
  if (render.overlays) {
    opts.overlays = render.overlays
  }

  // Position/setup
  if (Array.isArray(resolved.setup)) {
    // Multi-board array-FEN — render first board only for diagrams
    const firstBoard = resolved.setup[0]
    if (firstBoard && typeof firstBoard === 'string' && firstBoard.includes('/')) {
      const rows = opts.rows || topo.rows || 8
      const cols = opts.cols || topo.cols || 8
      if (resolved.pieces?.vocabulary) {
        opts.position = parseVocabularyFen(firstBoard, rows, cols, resolved.pieces.vocabulary)
      } else {
        opts.position = fenToPosition(firstBoard, rows, cols)
      }
    }
  } else if (resolved.setup && typeof resolved.setup === 'string' && resolved.setup.includes('/')) {
    const rows = opts.rows || topo.rows || 8
    const cols = opts.cols || topo.cols || 8
    // FEN4 (4-player: comma-separated, colour-prefixed pieces)
    if (resolved.setup.includes(',') && resolved.setup.match(/[yrgb][A-Z]/)) {
      opts.position = parseFen4(resolved.setup, rows, cols)
      opts.getOwner = fen4GetOwner
    // Multi-char SFEN (large shogi: [xx] bracket notation)
    } else if (resolved.setup.includes('[')) {
      opts.position = parseSfenToPosition(resolved.setup, rows, cols)
    } else if (resolved.pieces?.vocabulary) {
      opts.position = parseVocabularyFen(resolved.setup, rows, cols, resolved.pieces.vocabulary)
    } else {
      opts.position = fenToPosition(resolved.setup, rows, cols)
    }
  } else if (topo.type === 'graph' && resolved.setup && typeof resolved.setup === 'string' && resolved.setup.includes(':')) {
    opts.position = parseGraphSetup(resolved.setup)
  }

  // Piece rendering
  if (resolved.pieces) {
    if (resolved.pieces.borders) opts.pieceBorders = resolved.pieces.borders
  }
  if (resolved.pieceRotations) {
    opts.pieceRotations = resolved.pieceRotations
  }

  return opts
}

function attachPieceImages(opts, resolved, gallery) {
  if (!resolved.pieces?.set || !gallery) return
  // Build custom FEN map from vocabulary if provided
  let fenOverrides = null
  if (resolved.pieces.fenMap) {
    fenOverrides = resolved.pieces.fenMap
  }
  // Sets with numeric keys (mancala seeds) don't need FEN mapping
  const topo = resolved.topology || {}
  const skipFenMap = topo.type === 'pit'
  const { images, surfaceMap, surface } = buildPieceImages(resolved.pieces.set, gallery, fenOverrides, skipFenMap)
  if (Object.keys(images).length > 0) {
    opts.pieceImages = images
  }
  if (Object.keys(surfaceMap).length > 0) {
    opts.pieceSurfaceMap = surfaceMap
  }
  if (surface) {
    opts.pieceSurface = surface
  }
}

// --- Zone map builder (for checkered/mono-grid cellMap) ---

function buildCellMap(zones, rows, cols) {
  if (!zones) return null

  // Generator-based maps (pachisi cross, chaupar, etc.)
  if (zones.generator === 'cross') {
    return buildCrossMap(rows, cols, zones.castles || [])
  }

  const fill = zones.fill || true
  const map = Array.from({ length: rows }, () => Array(cols).fill(fill))

  if (zones.voids) {
    for (const [r, c] of zones.voids) {
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        map[r][c] = null
      }
    }
  }

  if (zones.cells) {
    for (const def of zones.cells) {
      const positions = Array.isArray(def.at[0]) ? def.at : [def.at]
      for (const [r, c] of positions) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          map[r][c] = def.type
        }
      }
    }
  }

  if (zones.map) {
    const lines = zones.map.trim().split('\n')
    for (let r = 0; r < lines.length && r < rows; r++) {
      for (let c = 0; c < lines[r].length && c < cols; c++) {
        const ch = lines[r][c]
        if (ch !== '.') map[r][c] = ch
      }
    }
  }

  return map
}

function buildCrossMap(rows, cols, castles) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null))
  const midR = Math.floor(rows / 2)
  const midC = Math.floor(cols / 2)
  const armWidth = 3
  const half = Math.floor(armWidth / 2)
  // Top arm
  for (let r = 0; r < midR - half; r++) for (let c = midC - half; c <= midC + half; c++) grid[r][c] = 'floor'
  // Bottom arm
  for (let r = midR + half + 1; r < rows; r++) for (let c = midC - half; c <= midC + half; c++) grid[r][c] = 'floor'
  // Left arm
  for (let c = 0; c < midC - half; c++) for (let r = midR - half; r <= midR + half; r++) grid[r][c] = 'floor'
  // Right arm
  for (let c = midC + half + 1; c < cols; c++) for (let r = midR - half; r <= midR + half; r++) grid[r][c] = 'floor'
  // Centre (charkoni)
  for (let r = midR - half; r <= midR + half; r++) for (let c = midC - half; c <= midC + half; c++) grid[r][c] = 'home'
  // Castle squares
  for (const [r, c] of castles) {
    if (r >= 0 && r < rows && c >= 0 && c < cols) grid[r][c] = 'castle'
  }
  return grid
}

// --- Deck/dice game rendering ---

function renderDeckFromResolved(resolved) {
  const components = resolved.components || {}
  const setup = resolved.setup || {}
  const meta = resolved.meta || {}

  const deckType = components.deck?.type || (components.dice ? 'standard-dice' : null)
  if (!deckType) return null

  const deckConfig = getDeckConfig(deckType)
  if (!deckConfig) return null

  const players = setup.players || 2
  const seed = setup.seed || 42

  let dealSpec = null
  const gameKeys = Object.keys(deckConfig.games || {})
  for (const key of gameKeys) {
    const spec = deckConfig.games[key]
    if (spec.perPlayer === setup.deal || spec.defaultPlayers === players) {
      dealSpec = spec
      break
    }
  }
  if (!dealSpec && gameKeys.length > 0) {
    dealSpec = deckConfig.games[gameKeys[0]]
  }
  if (!dealSpec) return null

  const activeDealSpec = { ...dealSpec, players }
  const createOpts = deckType === 'standard-dice'
    ? { count: (dealSpec.perPlayer || 0) * players + (dealSpec.community || 0) }
    : dealSpec
  const cards = createDeck(deckType, createOpts)
  const shuffled = shuffle(cards, seed)
  const dealResult = deal(shuffled, activeDealSpec)

  // Dice roll handling
  if (deckType === 'standard-dice' && deckConfig.roll) {
    for (let i = 0; i < dealResult.hands.length; i++) {
      dealResult.hands[i] = deckConfig.roll(dealResult.hands[i], seed + i)
    }
    if (dealResult.community.length > 0) {
      dealResult.community = deckConfig.roll(dealResult.community, seed + 99)
    }
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

  // Route to correct renderer based on deal spec layout
  if (dealResult.layout === 'tableau' && _renderTableauSvg) {
    return _renderTableauSvg(dealResult, {
      deckType, deckConfig, variantDef: { label: meta.label || '' }, seed,
      tileSet: dealSpec.tileSet || 'mahjong-regular',
      _returnOnly: true,
    })
  }

  if (dealSpec.layout === 'mahjong-wall' && _renderMahjongSvg) {
    return _renderMahjongSvg(dealResult, {
      deckType, deckConfig, variantDef: { label: meta.label || '' }, seed,
      tileSet: dealSpec.tileSet || 'mahjong-regular',
      _returnOnly: true,
    })
  }

  if (!_renderDeckSvg) return null
  return _renderDeckSvg(tableLayout, {
    tableW, tableH, cardW, cardH,
    deckLabel: deckConfig.label || deckType,
    gameLabel: meta.label || '',
    deckType,
    seed,
  })
}

// --- Vocabulary-based FEN parser (tafl, draughts, go, reversi) ---

function parseVocabularyFen(fen, rows, cols, vocabulary) {
  const position = {}
  const ranks = fen.split('/')
  for (let r = 0; r < ranks.length && r < rows; r++) {
    let c = 0, i = 0
    const rank = ranks[r]
    while (i < rank.length && c < cols) {
      const ch = rank[i]
      if (ch >= '1' && ch <= '9') {
        const next = rank[i + 1]
        if (next >= '0' && next <= '9') { c += parseInt(ch + next); i += 2 }
        else { c += parseInt(ch); i++ }
      } else {
        const file = String.fromCharCode(97 + c)
        const rankNum = rows - r
        const vocabEntry = vocabulary[ch]
        if (vocabEntry) {
          if (typeof vocabEntry === 'string') {
            position[`${file}${rankNum}`] = vocabEntry
          } else {
            position[`${file}${rankNum}`] = { ...vocabEntry }
          }
        } else {
          position[`${file}${rankNum}`] = ch
        }
        c++; i++
      }
    }
  }
  return position
}

// --- Backgammon setup parser ---

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

// --- Pit setup parser ---

function parsePitSetup(setup) {
  // Format: "4,4,4,4,4,4;0;4,4,4,4,4,4;0"
  const parts = setup.split(';')
  const pits = []
  const stores = []
  for (const part of parts) {
    if (part.includes(',')) {
      pits.push(...part.split(',').map(Number))
    } else {
      stores.push(Number(part))
    }
  }
  return { pits, stores }
}


function parseFen4(fen4, rows, cols) {
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

function generateTriangularHexGrid(sideLength) {
  const hexes = []
  for (let row = 0; row < sideLength; row++) {
    for (let i = 0; i <= row; i++) {
      hexes.push({ q: -row + i, r: row })
    }
  }
  return hexes
}

// --- Hex position string parser ---
// Parses "q,r:piece,q,r:piece,..." into { "q,r": { type: "piece" }, ... }

function parseHexPositionString(setup) {
  const position = {}
  const entries = setup.match(/-?\d+,-?\d+:[A-Za-z+]+/g)
  if (!entries) return position
  for (const entry of entries) {
    const colonIdx = entry.lastIndexOf(':')
    const coord = entry.substring(0, colonIdx)
    const piece = entry.substring(colonIdx + 1)
    position[coord] = { type: piece }
  }
  return position
}

// --- Multi-char SFEN parser (large shogi: [xx] bracketed notation) ---
// Parses "[ln][kn]..../[xx][yy].../..." into position map
// Convention: all-lowercase [xy] = sente (w prefix), all-uppercase [XY] = gote (b prefix)

function parseSfenToPosition(fen, rows, cols) {
  const position = {}
  const positionPart = fen.split(' ')[0]
  const ranks = positionPart.split('/')
  for (let r = 0; r < ranks.length && r < rows; r++) {
    let c = 0, i = 0
    const rank = ranks[r]
    while (i < rank.length && c < cols) {
      if (rank[i] === '[') {
        const close = rank.indexOf(']', i)
        if (close === -1) { i++; continue }
        const code = rank.substring(i + 1, close)
        const file = String.fromCharCode(97 + c)
        const rankNum = rows - r
        const isGote = code === code.toUpperCase()
        const prefix = isGote ? 'b' : 'w'
        position[`${file}${rankNum}`] = prefix + code.toUpperCase()
        c++
        i = close + 1
      } else if (rank[i] >= '1' && rank[i] <= '9') {
        const next = rank[i + 1]
        if (next >= '0' && next <= '9') { c += parseInt(rank[i] + next); i += 2 }
        else { c += parseInt(rank[i]); i++ }
      } else if (rank[i] === '+' && i + 1 < rank.length) {
        const file = String.fromCharCode(97 + c)
        const rankNum = rows - r
        const ch = rank[i + 1]
        const isGote = ch === ch.toUpperCase()
        const prefix = isGote ? 'b' : 'w'
        position[`${file}${rankNum}`] = prefix + '+' + ch.toUpperCase()
        c++
        i += 2
      } else {
        const file = String.fromCharCode(97 + c)
        const rankNum = rows - r
        const ch = rank[i]
        const isGote = ch === ch.toUpperCase()
        const prefix = isGote ? 'b' : 'w'
        position[`${file}${rankNum}`] = prefix + ch.toUpperCase()
        c++
        i++
      }
    }
  }
  return position
}

// --- Graph node setup parser ---
// Parses "n4:O,n6:O,n7:S,..." into position map

function parseGraphSetup(setup) {
  const position = {}
  const entries = setup.split(',')
  for (const entry of entries) {
    const [node, piece] = entry.trim().split(':')
    if (node && piece) {
      position[node] = piece
    }
  }
  return position
}

export function getMultiBoardRenderer() { return _renderMultiBoard }

export { buildRenderOpts, attachPieceImages, buildPieceImages, renderDeckFromResolved }
