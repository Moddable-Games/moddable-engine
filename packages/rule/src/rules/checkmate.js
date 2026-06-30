export function createCheckmateRule(config = {}) {
  const stalemateMeaning = config.stalemateMeaning || 'draw'
  const playerNames = config.playerNames || { 0: 'white', 1: 'black' }

  return {
    id: 'checkmate',
    category: 'win',
    requires: ['check', 'attack-detection'],
    topologyNeeds: [],

    hooks: {
      checkWin(state, ctx) {
        const { playerIndex } = ctx
        const opponent = 1 - playerIndex
        const checkRule = ctx.rules.get('check')
        const attackDetection = ctx.rules.get('attack-detection')
        if (!checkRule || !attackDetection) return null

        const opponentHasLegalMoves = ctx.config?.hasLegalMoves
        if (!opponentHasLegalMoves) return null

        const hasMovesForOpponent = opponentHasLegalMoves(state, opponent, ctx)

        if (!hasMovesForOpponent) {
          const inCheck = checkRule.isInCheck(state.board, opponent, { ...ctx, playerIndex: opponent })
          if (inCheck) {
            return playerNames[playerIndex] || (playerIndex === 0 ? 'white' : 'black')
          }
          if (stalemateMeaning === 'win') {
            return playerNames[opponent] || (opponent === 0 ? 'white' : 'black')
          }
          if (stalemateMeaning === 'loss') {
            return playerNames[playerIndex] || (playerIndex === 0 ? 'white' : 'black')
          }
          return 'draw'
        }

        return null
      },
    },
  }
}
