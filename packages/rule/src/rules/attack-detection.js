import { fromConfig } from '../../../piece-behaviour/index.js'

export function createAttackDetectionRule(config = {}) {
  const builtPieces = new Map()

  function getPrimitive(pieceName, pieceConfigs) {
    if (builtPieces.has(pieceName)) return builtPieces.get(pieceName)
    const pConfig = pieceConfigs[pieceName]
    if (!pConfig || pConfig.movement === 'pawn') {
      builtPieces.set(pieceName, null)
      return null
    }
    const primitive = fromConfig(pConfig)
    builtPieces.set(pieceName, primitive)
    return primitive
  }

  function allPositions(board, topology) {
    if (topology && topology.getAllCells) return topology.getAllCells()
    if (Array.isArray(board)) {
      const result = []
      for (let i = 0; i < board.length; i++) result.push(i)
      return result
    }
    return Object.keys(board)
  }

  function getCell(board, pos) {
    if (Array.isArray(board)) return board[pos]
    return board[pos] || null
  }

  function isAttacked(target, state, ctx) {
    const { topology, playerIndex } = ctx
    const pieceConfigs = ctx.config.pieceConfigs || {}
    const board = state.board
    const attacker = 1 - playerIndex

    for (const pos of allPositions(board, topology)) {
      const piece = getCell(board, pos)
      if (!piece || piece.owner !== attacker) continue
      if (pieceAttacks(pos, target, piece, board, pieceConfigs, ctx, topology)) {
        return true
      }
    }
    return false
  }

  function pieceAttacks(from, target, piece, board, pieceConfigs, ctx, topology) {
    const pConfig = pieceConfigs[piece.type]
    if (!pConfig) return false

    if (pConfig.movement === 'pawn') {
      return pawnAttacks(from, target, piece.owner, ctx, topology)
    }

    const primitive = getPrimitive(piece.type, pieceConfigs)
    if (!primitive) return false

    const viewBoard = buildViewBoard(board, piece.owner, topology)
    return primitive.attacks(topology, from, target, viewBoard)
  }

  function pawnAttacks(from, target, owner, ctx, topology) {
    if (ctx.config.pawnConfig && topology && topology.step) {
      const capDirs = ctx.config.pawnConfig.captureDirections[owner]
      for (const capDir of capDirs) {
        const t = topology.step(from, capDir)
        if (t === target) return true
      }
      return false
    }

    const advancement = ctx.config.advancement || { 0: -1, 1: 1 }
    const dir = typeof advancement === 'function' ? advancement(owner) : advancement[owner]
    const cols = topology ? topology.cols : 8
    const fromCol = from % cols
    const captureOffsets = [dir * cols - 1, dir * cols + 1]
    for (const offset of captureOffsets) {
      const t = from + offset
      if (t === target) {
        const tCol = t % cols
        if (Math.abs(tCol - fromCol) === 1) return true
      }
    }
    return false
  }

  function buildViewBoard(board, ownerIdx, topology) {
    if (Array.isArray(board)) {
      return board.map(cell => {
        if (cell === null) return null
        return { friendly: cell.owner === ownerIdx, enemy: cell.owner !== ownerIdx, ...cell }
      })
    }
    const view = {}
    const positions = topology ? topology.getAllCells() : Object.keys(board)
    for (const pos of positions) {
      const cell = board[pos] || null
      if (cell === null) {
        view[pos] = null
      } else {
        view[pos] = { friendly: cell.owner === ownerIdx, enemy: cell.owner !== ownerIdx, ...cell }
      }
    }
    return view
  }

  return {
    id: 'attack-detection',
    category: 'constraint',
    requires: [],
    topologyNeeds: ['rays', 'leapTargets'],

    provides: { isAttacked },

    hooks: {},
  }
}
