import { createChessPlugin } from '../index.js'
import { createGameFromDefinition } from '../../game/index.js'
import { createGridTopology } from '../../topology-grid/index.js'
import { createAttackDetectionRule } from '../../rule/src/rules/attack-detection.js'
import { createCheckRule } from '../../rule/src/rules/check.js'
import { createCheckmateRule } from '../../rule/src/rules/checkmate.js'
import { createCaptureReplacementRule } from '../../rule/src/rules/capture-replacement.js'
import { createCastlingRule } from '../../rule/src/rules/castling.js'
import { createEnPassantRule } from '../../rule/src/rules/en-passant.js'
import { createPromotionRule } from '../../rule/src/rules/promotion.js'
import { createDraw50MoveRule } from '../../rule/src/rules/draw-50-move.js'

const STANDARD_PIECES = {
  king:   { type: 'rider', dirs: 'all', maxSteps: 1, royal: true },
  queen:  { type: 'rider', dirs: 'all' },
  rook:   { type: 'rider', dirs: 'orthogonal' },
  bishop: { type: 'rider', dirs: 'diagonal' },
  knight: { type: 'leaper', offsets: 'knight' },
  pawn:   { movement: 'pawn' },
}

function createChessGameWithRules(pluginConfig = {}, variantConfig = {}) {
  const ruleFactories = {
    'attack-detection': (cfg) => createAttackDetectionRule(cfg),
    'check': (cfg) => createCheckRule(cfg),
    'checkmate': (cfg) => createCheckmateRule(cfg),
    'capture.replacement': (cfg) => createCaptureReplacementRule(cfg),
    'castling': (cfg) => createCastlingRule(cfg),
    'en-passant': (cfg) => createEnPassantRule(cfg),
    'promotion': (cfg) => createPromotionRule(cfg),
    'draw.50-move': (cfg) => createDraw50MoveRule(cfg),
  }

  return createGameFromDefinition(
    {
      topology: { type: 'grid', rows: 8, cols: 8 },
      players: { names: ['white', 'black'], count: 2 },
      plugins: { chess: pluginConfig },
      render: { alternating: true },
    },
    {
      topologies: { grid: (config) => createGridTopology(config) },
      pluginFactories: {
        chess: (cfg, ctx) => {
          const plugin = createChessPlugin({ ...cfg, ...variantConfig }, ctx)
          plugin.rules = [
            'attack-detection',
            'capture.replacement',
            'castling',
            'en-passant',
            'promotion',
            'check',
            'checkmate',
            'draw.50-move',
          ]
          plugin.ruleDefaults = {
            'attack-detection': {
              pieceConfigs: plugin.pieceConfigs,
              advancement: variantConfig.advancement || { 0: -1, 1: 1 },
            },
            'check': { royalType: variantConfig.royalType || 'king' },
            'castling': {
              royalType: variantConfig.royalType || 'king',
              rookType: variantConfig.rookType || 'rook',
            },
            'promotion': {
              choices: variantConfig.promotionChoices || ['queen', 'rook', 'bishop', 'knight'],
              advancement: variantConfig.advancement || { 0: -1, 1: 1 },
            },
            'en-passant': {
              advancement: variantConfig.advancement || { 0: -1, 1: 1 },
            },
          }
          return plugin
        },
      },
      rules: ruleFactories,
    }
  )
}

describe('chess with composed rules', () => {
  it('creates game and plugin has _composedRules', () => {
    const game = createChessGameWithRules()
    const plugins = game.registry.getPlugins()
    const chess = plugins.find(p => p.sliceName === 'chess')
    expect(chess._composedRules).toBeDefined()
    expect(chess._rules.length).toBe(8)
  })

  it('standard opening position unchanged', () => {
    const game = createChessGameWithRules()
    const state = game.getState('chess')
    expect(state.board).toHaveLength(64)
    expect(state.board[0]).toEqual({ type: 'rook', owner: 1 })
    expect(state.board[60]).toEqual({ type: 'king', owner: 0 })
  })

  it('generates 20 legal moves at start', () => {
    const game = createChessGameWithRules()
    const moves = game.getLegalMoves()
    expect(moves.length).toBe(20)
  })

  it('pawn moves work', () => {
    const game = createChessGameWithRules()
    const result = game.execute({ from: 52, to: 36 })
    expect(result.ok).toBe(true)
    expect(game.getState('chess').board[36]).toEqual({ type: 'pawn', owner: 0 })
  })

  it('turns alternate', () => {
    const game = createChessGameWithRules()
    game.execute({ from: 52, to: 44 })
    expect(game.currentPlayer()).toBe('black')
    game.execute({ from: 12, to: 20 })
    expect(game.currentPlayer()).toBe('white')
  })

  it('scholar\'s mate works', () => {
    const game = createChessGameWithRules()
    game.execute({ from: 52, to: 36 })
    game.execute({ from: 12, to: 28 })
    game.execute({ from: 61, to: 34 })
    game.execute({ from: 1, to: 18 })
    game.execute({ from: 59, to: 31 })
    game.execute({ from: 9, to: 17 })
    const result = game.execute({ from: 31, to: 13 })
    expect(result.ok).toBe(true)
    expect(result.winner).toBe('white')
  })

  it('disabling castling via rule override removes castling moves', () => {
    const game = createGameFromDefinition(
      {
        topology: { type: 'grid', rows: 8, cols: 8 },
        players: { names: ['white', 'black'], count: 2 },
        plugins: { chess: { setup: 'r3k2r/8/8/8/8/8/8/R3K2R' } },
        rules: [{ castling: { enabled: false } }],
        render: { alternating: true },
      },
      {
        topologies: { grid: (config) => createGridTopology(config) },
        pluginFactories: {
          chess: (cfg, ctx) => {
            const plugin = createChessPlugin({ ...cfg, castling: false }, ctx)
            plugin.rules = [
              'attack-detection', 'capture.replacement', 'castling',
              'en-passant', 'promotion', 'check', 'checkmate', 'draw.50-move',
            ]
            plugin.ruleDefaults = {
              'attack-detection': { pieceConfigs: STANDARD_PIECES, advancement: { 0: -1, 1: 1 } },
              'check': { royalType: 'king' },
              'castling': { royalType: 'king', rookType: 'rook' },
              'promotion': { choices: ['queen', 'rook', 'bishop', 'knight'], advancement: { 0: -1, 1: 1 } },
              'en-passant': { advancement: { 0: -1, 1: 1 } },
            }
            return plugin
          },
        },
        rules: {
          'attack-detection': (cfg) => createAttackDetectionRule(cfg),
          'check': (cfg) => createCheckRule(cfg),
          'checkmate': (cfg) => createCheckmateRule(cfg),
          'capture.replacement': (cfg) => createCaptureReplacementRule(cfg),
          'castling': (cfg) => createCastlingRule(cfg),
          'en-passant': (cfg) => createEnPassantRule(cfg),
          'promotion': (cfg) => createPromotionRule(cfg),
          'draw.50-move': (cfg) => createDraw50MoveRule(cfg),
        },
      }
    )
    const moves = game.getLegalMoves()
    const kingMoves = moves.filter(m => m.from === 60)
    expect(kingMoves.find(m => m.castle)).toBeUndefined()
  })
})
