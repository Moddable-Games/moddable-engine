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

  function isAttacked(target, state, ctx) {
    const { topology, playerIndex } = ctx
    const pieceConfigs = ctx.config.pieceConfigs || {}
    const advancement = ctx.config.advancement || { 0: -1, 1: 1 }
    const board = state.board
    const attacker = 1 - playerIndex

    for (let i = 0; i < board.length; i++) {
      const piece = board[i]
      if (!piece || piece.owner !== attacker) continue

      if (pieceAttacks(i, target, piece, board, pieceConfigs, advancement, topology)) {
        return true
      }
    }
    return false
  }

  function pieceAttacks(from, target, piece, board, pieceConfigs, advancement, topology) {
    const pConfig = pieceConfigs[piece.type]
    if (!pConfig) return false

    if (pConfig.movement === 'pawn') {
      return pawnAttacks(from, target, piece.owner, advancement, topology)
    }

    const primitive = getPrimitive(piece.type, pieceConfigs)
    if (!primitive) return false

    const viewBoard = board.map(cell => {
      if (cell === null) return null
      return { friendly: cell.owner === piece.owner, enemy: cell.owner !== piece.owner, ...cell }
    })
    return primitive.attacks(topology, from, target, viewBoard)
  }

  function pawnAttacks(from, target, owner, advancement, topology) {
    const dir = advancement[owner]
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

  return {
    id: 'attack-detection',
    category: 'constraint',
    requires: [],
    topologyNeeds: ['rays', 'leapTargets'],

    provides: { isAttacked },

    hooks: {},
  }
}
