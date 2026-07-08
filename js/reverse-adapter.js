/**
 * Reverse Adapter — converts a GAMES variant entry into schema format.
 *
 * Takes the existing boards.js config object for a variant and produces
 * the equivalent { surface, family: { engine, meta }, variant: { engine, meta } }
 * that the cascade resolver expects.
 *
 * This proves the schema can express what the legacy GAMES object already expresses.
 */

// --- Board style → topology mapping ---

function toTopology(config, game) {
  const style = config.boardStyle

  switch (style) {
    case 'checkered':
    case 'mono-grid':
      return {
        type: 'grid',
        rows: config.rows || 8,
        cols: config.cols || 8,
        layout: 'cells',
      }
    case 'go':
    case 'xiangqi':
    case 'shogi':
    case 'surakarta':
    case 'alquerque':
      return {
        type: 'grid',
        rows: config.rows || (style === 'xiangqi' ? 10 : style === 'surakarta' ? 6 : 9),
        cols: config.cols || (style === 'xiangqi' ? 9 : style === 'surakarta' ? 6 : 9),
        layout: 'intersections',
      }
    case 'hex':
      return buildHexTopology(config)
    case 'backgammon':
      return { type: 'track', positions: 24, shape: 'linear' }
    case 'mancala':
      return {
        type: 'pit',
        cols: config.pitsPerSide || 6,
        rows: config.boardRows || 2,
        stores: config.hasStores !== false,
      }
    case 'morris':
      return {
        type: 'graph',
        structure: 'concentric-rings',
        params: {
          rings: config.rings || 3,
          midpoints: config.midpoints !== false,
          diagonals: config.diagonals || false,
        },
      }
    case 'stern-halma':
      return { type: 'graph', structure: 'star', params: { arms: 6, armSize: 4 } }
    case 'nyout':
      return { type: 'graph', structure: 'perimeter-cross' }
    case 'asalto':
      return { type: 'graph', structure: 'grid-cross' }
    case 'landlords':
      return { type: 'track', positions: 40, shape: 'circuit' }
    default:
      return { type: 'grid', rows: config.rows || 8, cols: config.cols || 8 }
  }
}

function buildHexTopology(config) {
  const topo = { type: 'hex', orientation: config.flat ? 'flat' : 'pointy' }
  if (config.hexRadius) {
    topo.shape = 'hexagonal'
    topo.radius = config.hexRadius
  } else if (config.hexRows && config.hexCols) {
    topo.shape = 'rhombus'
    topo.rows = config.hexRows
    topo.cols = config.hexCols
  } else if (config.hexGrid) {
    topo.shape = 'irregular'
  }
  return topo
}

// --- Board style → surface name ---

function toSurfaceName(config, gameId) {
  const style = config.boardStyle
  const colors = config.colors || {}

  if (colors.lightSquare === '#f0d9b5' || style === 'checkered') return 'wood-classic'
  if (style === 'go' || style === 'shogi' || style === 'xiangqi') return 'wood-light'
  if (style === 'mancala') return 'earth'
  if (style === 'morris' || style === 'hex') return 'slate'
  if (style === 'backgammon' || style === 'landlords' || style === 'surakarta' || style === 'alquerque') return 'parchment'
  if (style === 'mono-grid' && colors.monoSquare === '#2e7d32') return 'felt-green'

  // Check hex colour families
  if (colors.lightHex === '#e8e8e8') return 'slate'
  if (colors.lightHex === '#ffce9e') return 'wood-classic'
  if (colors.background === '#070b1e') return 'cosmic'

  return 'wood-classic'
}

// --- Board style → render block ---

function toRender(config) {
  const style = config.boardStyle
  const render = {}

  render.cellSize = config.tileSize || config.hexSize || config.pitRadius || 40

  if (style === 'checkered' && !config.cellMap) render.cellColor = 'checkered'
  else if (style === 'checkered' && config.cellMap) render.cellColor = 'uniform'
  else if (style === 'mono-grid') render.cellColor = 'uniform'
  else if (style === 'go' || style === 'xiangqi' || style === 'shogi') render.cellColor = 'uniform'

  if (config.hexColorFn) render.cellColor = 'tricolor'
  if (config.hexFrame) render.frame = config.hexFrame

  if (style === 'backgammon') render.trackStyle = 'triangular-points'

  if (config.showLabels === false) render.labels = false

  // Decorations
  if (style === 'xiangqi') {
    render.decorations = [{ type: 'gap', between: [4, 5] }]
  }

  if (config.cornerRadius) render.cornerRadius = config.cornerRadius
  if (config.markers) render.markers = config.markers

  // Layers
  if (config.layers) render.layers = config.layers

  // Canvas size
  if (config.boardSize) render.canvasSize = config.boardSize

  return render
}

// --- Colours → surface override ---

function toSurfaceOverride(config) {
  const colors = config.colors
  if (!colors || Object.keys(colors).length === 0) {
    // No explicit colours — signal adapter to use provider defaults
    return { _useProviderDefaults: true }
  }
  // Pass raw colours through unchanged
  return { _rawColors: colors }
}

// --- Setup ---

function toSetup(config) {
  if (config.fen) return config.fen
  if (config.setup) return config.setup
  if (config.filledArms) return { arms: config.filledArms }
  return null
}

// --- Pieces ---

function toPieces(config, game, gameId) {
  if (!game.pieceSet) return null
  const pieces = { set: game.pieceSet }
  // Carry vocabulary for games that use non-chess FEN (typed piece objects)
  const vocab = getVocabulary(gameId)
  if (vocab) pieces.vocabulary = vocab
  // Carry fenMap for games with non-standard FEN→pieceID mapping
  const fenMap = getFenMap(gameId)
  if (fenMap) pieces.fenMap = fenMap
  // Carry piece borders
  if (config.pieceBorders) pieces.borders = config.pieceBorders
  return pieces
}

function getVocabulary(gameId) {
  const VOCABULARIES = {
    tafl: { K: { type: 'king', color: 'white' }, w: { type: 'stone', color: 'white' }, b: { type: 'stone', color: 'black' } },
    draughts: { w: { type: 'man', color: 'white' }, b: { type: 'man', color: 'black' }, W: { type: 'king', color: 'white' }, B: { type: 'king', color: 'black' } },
    reversi: { w: { type: 'piece', color: 'white' }, b: { type: 'piece', color: 'black' } },
    go: { w: { type: 'stone', color: 'white' }, b: { type: 'stone', color: 'black' } },
    surakarta: { w: { type: 'stone', color: 'white' }, b: { type: 'stone', color: 'black' } },
    halma: { w: { type: 'man', color: 'white' }, b: { type: 'man', color: 'black' }, W: { type: 'king', color: 'white' }, B: { type: 'king', color: 'black' } },
  }
  return VOCABULARIES[gameId] || null
}

function getFenMap(gameId) {
  const OVERRIDES = {
    xiangqi: { H: 'wN', h: 'bN', R: 'wR', r: 'bR', E: 'wE', e: 'bE', A: 'wA', a: 'bA', K: 'wK', k: 'bK', C: 'wC', c: 'bC', P: 'wP', p: 'bP' },
    'dou-shou-qi': {
      E: 'wElephant', e: 'bElephant', L: 'wLion', l: 'bLion',
      T: 'wTiger', t: 'bTiger', P: 'wLeopard', p: 'bLeopard',
      D: 'wDog', d: 'bDog', W: 'wWolf', w: 'bWolf',
      C: 'wCat', c: 'bCat', R: 'wRat', r: 'bRat',
    },
    draughts: { w: 'wM', b: 'bM', W: 'wK', B: 'bK' },
    halma: { w: 'wM', b: 'bM', W: 'wK', B: 'bK' },
    asalto: { officer: 'red-circle', soldier: 'green-circle' },
  }
  return OVERRIDES[gameId] || null
}

// --- Components (deck/dice) ---

function toComponents(game) {
  if (!game.deckGame) return null
  return { deck: { type: game.deckGame } }
}

// --- Main conversion ---

export function reverseAdapt(config, game, gameId, runtimeState) {
  const topology = game.deckGame
    ? { type: 'none' }
    : toTopology(config, game)

  const surfaceName = game.deckGame ? 'felt-green' : toSurfaceName(config, gameId)
  const surfaceOverride = toSurfaceOverride(config)
  const render = toRender(config)
  const setup = toSetup(config)
  const pieces = toPieces(config, game, gameId)
  const components = toComponents(game)

  const variantEngine = { topology }
  if (surfaceOverride) variantEngine.surface = surfaceOverride
  if (Object.keys(render).length > 0) variantEngine.render = render
  if (setup !== null) variantEngine.setup = setup
  if (pieces) variantEngine.pieces = pieces
  if (components) variantEngine.components = components
  // Pass through legacy fields for round-trip proof (not part of final schema)
  if (config.cellMap) variantEngine._cellMap = config.cellMap
  if (config.boardStyle) variantEngine._boardStyle = config.boardStyle
  if (config.deckVariant) variantEngine._deckVariant = config.deckVariant
  if (config.boardData) variantEngine._boardData = config.boardData
  if (config.variant) variantEngine._variant = config.variant
  if (config._position) variantEngine._position = config._position
  if (config.hexColorFn) variantEngine._hexColorFn = config.hexColorFn
  if (config.hexPosition) variantEngine._hexPosition = config.hexPosition
  if (config.hexGrid) variantEngine._hexGrid = config.hexGrid
  if (config.centreMarker) variantEngine._centreMarker = config.centreMarker
  if (config.layers) variantEngine._layers = config.layers
  if (runtimeState) variantEngine._runtimeState = runtimeState

  return {
    surface: surfaceName,
    family: {
      engine: {},
      meta: { label: game.label || gameId },
    },
    variant: {
      engine: variantEngine,
      meta: { label: config.label || '' },
    },
  }
}
