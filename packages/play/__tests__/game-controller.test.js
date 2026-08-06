import { createGameController } from '../index.js'
import { createChessPlugin } from '../../plugins/chess/index.js'
import { createGameFromDefinition } from '../../game/index.js'
import { createGridTopology } from '../../topologies/grid/index.js'

function createChessGame(pluginConfig = {}) {
  return createGameFromDefinition(
    {
      topology: { type: 'grid', rows: 8, cols: 8 },
      players: { names: ['white', 'black'], count: 2 },
      plugins: { chess: pluginConfig },
      render: { alternating: true },
    },
    {
      topologies: { grid: (config) => createGridTopology(config) },
      pluginFactories: { chess: (cfg, ctx) => createChessPlugin(cfg, ctx) },
    }
  )
}

describe('game-controller', () => {
  describe('creation', () => {
    it('creates a controller for a chess game', () => {
      const game = createChessGame()
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'human' },
      })
      expect(ctrl).toBeDefined()
      expect(ctrl.currentPlayer()).toBe('white')
    })

    it('initial state reflects no selection', () => {
      const game = createChessGame()
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'human' },
      })
      const state = ctrl.getState()
      expect(state.selected).toBeNull()
      expect(state.lastMove).toBeNull()
      expect(state.gameOver).toBe(false)
      expect(state.aiThinking).toBe(false)
    })
  })

  describe('click interaction', () => {
    it('selects a friendly piece on click', () => {
      const game = createChessGame()
      const selections = []
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'human' },
        onSelect: (pos, piece, moves) => selections.push({ pos, piece, moves }),
      })
      ctrl.handleClick(52)
      expect(ctrl.getState().selected).toBe(52)
      expect(selections.length).toBe(1)
      expect(selections[0].piece.type).toBe('pawn')
    })

    it('executes move on second click (from-to)', () => {
      const game = createChessGame()
      const moves = []
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'human' },
        onMove: (move, player) => moves.push({ move, player }),
      })
      ctrl.handleClick(52)
      ctrl.handleClick(44)
      expect(moves.length).toBe(1)
      expect(moves[0].move.from).toBe(52)
      expect(moves[0].move.to).toBe(44)
      expect(moves[0].player).toBe('white')
      expect(ctrl.currentPlayer()).toBe('black')
    })

    it('deselects when clicking empty square with no move', () => {
      const game = createChessGame()
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'human' },
      })
      ctrl.handleClick(52)
      expect(ctrl.getState().selected).toBe(52)
      ctrl.handleClick(20)
      expect(ctrl.getState().selected).toBeNull()
    })

    it('ignores clicks when it is AI turn', () => {
      const game = createChessGame()
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'ai' },
      })
      ctrl.handleClick(52)
      ctrl.handleClick(44)
      expect(ctrl.currentPlayer()).toBe('black')
      ctrl.handleClick(12)
      expect(ctrl.getState().selected).toBeNull()
    })
  })

  describe('undo', () => {
    it('undoes a move', () => {
      const game = createChessGame()
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'human' },
      })
      ctrl.handleClick(52)
      ctrl.handleClick(44)
      expect(ctrl.currentPlayer()).toBe('black')
      ctrl.undo()
      expect(ctrl.currentPlayer()).toBe('white')
    })

    it('returns false when nothing to undo', () => {
      const game = createChessGame()
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'human' },
      })
      expect(ctrl.undo()).toBe(false)
    })

    it('undoes both AI and human move when playing vs AI', () => {
      const game = createChessGame()
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'ai' },
        aiPickMove: (g) => g.getLegalMoves()[0],
      })
      ctrl.handleClick(52)
      ctrl.handleClick(44)
      // Wait for AI
      return new Promise(resolve => setTimeout(() => {
        expect(ctrl.currentPlayer()).toBe('white')
        expect(ctrl.getState().undoCount).toBe(2)
        ctrl.undo()
        expect(ctrl.currentPlayer()).toBe('white')
        expect(ctrl.getState().undoCount).toBe(0)
        resolve()
      }, 300))
    })
  })

  describe('legal moves', () => {
    it('returns all legal moves for current position', () => {
      const game = createChessGame()
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'human' },
      })
      const moves = ctrl.getLegalMoves()
      expect(moves.length).toBe(20)
    })
  })

  describe('promotion', () => {
    it('triggers onChoiceNeeded for pawn promotion', () => {
      const game = createChessGame({ setup: '4k3/P7/8/8/8/8/8/4K3' })
      const choices = []
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'human' },
        onChoiceNeeded: (options, player, resolve) => {
          choices.push(options)
          resolve('queen')
        },
      })
      ctrl.handleClick(8)
      ctrl.handleClick(0)
      expect(choices.length).toBe(1)
      expect(choices[0]).toContain('queen')
    })
  })

  describe('forfeit', () => {
    it('ends game immediately', () => {
      const game = createChessGame()
      const endings = []
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'human' },
        onGameEnd: (status) => endings.push(status),
      })
      ctrl.forfeit()
      expect(ctrl.getState().gameOver).toBe(true)
      expect(endings).toEqual(['forfeit'])
    })
  })

  describe('flip board', () => {
    it('toggles flipped state', () => {
      const game = createChessGame()
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'human' },
      })
      expect(ctrl.getState().flipped).toBe(false)
      ctrl.setFlipped(true)
      expect(ctrl.getState().flipped).toBe(true)
    })
  })

  describe('render callback', () => {
    it('calls onRender on creation and after moves', () => {
      const game = createChessGame()
      const renders = []
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'human' },
        onRender: (g, state) => renders.push(state),
      })
      expect(renders.length).toBe(1)
      ctrl.handleClick(52)
      ctrl.handleClick(44)
      expect(renders.length).toBeGreaterThan(1)
    })
  })

  describe('destroy', () => {
    it('stops responding after destroy', () => {
      const game = createChessGame()
      const renders = []
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'human' },
        onRender: () => renders.push(1),
      })
      const countBefore = renders.length
      ctrl.destroy()
      ctrl.handleClick(52)
      expect(renders.length).toBe(countBefore)
    })
  })

  describe('onAnimateMove', () => {
    it('invokes onAnimateMove before re-render when a from-to move is executed', () => {
      const game = createChessGame()
      const animCalls = []
      const renders = []
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'human' },
        onRender: () => renders.push(renders.length),
        onAnimateMove: (move, state, done) => {
          animCalls.push({ move, renderCountAtCall: renders.length })
          done()
        },
      })
      const rendersBefore = renders.length
      ctrl.handleClick(52)
      ctrl.handleClick(44)
      expect(animCalls.length).toBe(1)
      expect(animCalls[0].move.from).toBe(52)
      expect(animCalls[0].move.to).toBe(44)
      expect(animCalls[0].renderCountAtCall).toBe(rendersBefore + 1)
      expect(renders.length).toBeGreaterThan(animCalls[0].renderCountAtCall)
    })
  })

  describe('teleport interaction', () => {
    it('selecting a piece includes its teleport targets in legal moves', () => {
      const game = createChessGame({ initState: (state) => {
        const tokens = new Array(state.board.length).fill(false)
        for (let i = 0; i < state.board.length; i++) {
          const p = state.board[i]
          if (p && p.type !== 'pawn' && p.type !== 'king') tokens[i] = true
        }
        state._teleportTokens = tokens
      }, actions: {
        teleport: {
          skipsCheckFilter: false,
          generate(slice, playerIdx, { allPositions, getCell, normalMoves }) {
            const tokens = slice._teleportTokens
            if (!tokens) return []
            const existing = new Set()
            if (normalMoves) {
              for (const m of normalMoves) existing.add(m.from + ':' + m.to)
            }
            const moves = []
            const empty = []
            for (const pos of allPositions()) {
              if (getCell(slice.board, pos) === null) empty.push(pos)
            }
            for (const pos of allPositions()) {
              if (!tokens[pos]) continue
              const piece = getCell(slice.board, pos)
              if (!piece || piece.owner !== playerIdx) continue
              for (const target of empty) {
                if (existing.has(pos + ':' + target)) continue
                moves.push({ action: 'teleport', from: pos, to: target })
              }
            }
            return moves
          },
          apply(move, { board, slice }) {
            const piece = board[move.from]
            board[move.from] = null
            board[move.to] = piece
            const tokens = [...slice._teleportTokens]
            tokens[move.from] = false
            tokens[move.to] = false
            return { board, halfmoveClock: 0, sliceKeys: { _teleportTokens: tokens } }
          },
        },
      } })
      const selections = []
      const ctrl = createGameController(game, {
        players: { white: 'human', black: 'human' },
        onSelect: (pos, piece, targets) => selections.push({ pos, targets }),
      })
      ctrl.handleClick(59)
      expect(selections.length).toBe(1)
      const targets = selections[0].targets
      const teleportTargets = targets.filter(m => m.action === 'teleport')
      expect(teleportTargets.length).toBeGreaterThan(0)
      expect(teleportTargets.every(m => m.from === 59)).toBe(true)
    })
  })
})
