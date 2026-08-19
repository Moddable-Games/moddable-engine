import { createBoardRenderer } from '../../render/index.js'
import { createGameForFamily } from './play.js'

export function renderStateAsSvg(family, state, opts = {}) {
  const game = createGameForFamily(family, {
    variant: opts.variant,
    definition: opts.definition,
    rngSeed: opts.rngSeed || 42,
  })

  if (state) {
    game.loadState(state)
  }

  const rawGame = game.raw
  const layout = rawGame.getLayout(opts.render || {})
  if (!layout) {
    throw new Error(`Family "${family}" has no topology layout (card games cannot be rendered as boards)`)
  }

  const gameState = rawGame.getState(family)
  const pieces = buildPieceMap(gameState, rawGame.definition.players.names)

  const renderer = createBoardRenderer({ padding: opts.padding || 20 })
  return renderer.render(layout, {
    pieces,
    highlights: opts.highlights || [],
    labels: opts.labels !== false,
    colors: opts.colors || {},
    theme: opts.theme || null,
    board: opts.board || null,
  })
}

function buildPieceMap(gameState, playerNames) {
  if (!gameState || !gameState.board) return {}

  const pieces = {}
  const board = gameState.board

  if (Array.isArray(board)) {
    for (let i = 0; i < board.length; i++) {
      if (board[i]) {
        pieces[String(i)] = mapPiece(board[i], playerNames)
      }
    }
  } else {
    for (const [key, piece] of Object.entries(board)) {
      if (piece) {
        pieces[key] = mapPiece(piece, playerNames)
      }
    }
  }
  return pieces
}

function mapPiece(piece, playerNames) {
  const ownerIndex = typeof piece.owner === 'number'
    ? piece.owner
    : playerNames.indexOf(piece.owner)
  return {
    color: ownerIndex === 0 ? 'white' : 'black',
    label: piece.type ? piece.type[0].toUpperCase() : null,
    type: piece.type || null,
    owner: piece.owner,
  }
}
