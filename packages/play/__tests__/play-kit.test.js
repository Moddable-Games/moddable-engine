import '../../plugins/go/index.js'
import '../../plugins/draughts/index.js'

import {
  registerVariant, getVariantConfig, listVariants, clearVariants, getVariantKeys,
} from '../src/variant-registry.js'
import { interactionModelFor, getInteractionModel, availableActions } from '../src/interaction.js'
import { createEmbedBridge, parseEmbedParams, buildEmbedUrl, normaliseOutcome } from '../src/embed.js'
import { hitTargetLayer, overlayLayer, renderInteractiveBoard } from '../src/board-view.js'
import { createGameForFamily } from '../src/play.js'
import { createGameController } from '../src/game-controller.js'

describe('play kit', () => {
  describe('variant registry', () => {
    afterEach(() => clearVariants('test-family'))

    it('registers and resolves a variant', () => {
      registerVariant('test-family', 'basic', { label: 'Basic', size: 9 })
      expect(getVariantConfig('test-family', 'basic').label).toBe('Basic')
    })

    it('merges parents through extends', () => {
      registerVariant('test-family', 'base', { size: 9, komi: 5.5, scoring: 'area' })
      registerVariant('test-family', 'child', { extends: 'base', komi: 7.5 })
      const child = getVariantConfig('test-family', 'child')
      expect(child.size).toBe(9)
      expect(child.komi).toBe(7.5)
      expect(child.scoring).toBe('area')
    })

    it('merges hooks rather than replacing the parent object', () => {
      const parentHook = () => 'parent'
      const childHook = () => 'child'
      registerVariant('test-family', 'base', { hooks: { moveFilter: parentHook, captureEffect: parentHook } })
      registerVariant('test-family', 'child', { extends: 'base', hooks: { moveFilter: childHook } })
      const hooks = getVariantConfig('test-family', 'child').hooks
      expect(hooks.moveFilter()).toBe('child')
      expect(hooks.captureEffect()).toBe('parent')
    })

    it('throws on circular inheritance', () => {
      registerVariant('test-family', 'a', { extends: 'b' })
      registerVariant('test-family', 'b', { extends: 'a' })
      expect(() => getVariantConfig('test-family', 'a')).toThrow(/Circular/)
    })

    it('hides variants flagged as hidden from listings', () => {
      registerVariant('test-family', 'shown', {})
      registerVariant('test-family', 'secret', { hidden: true })
      expect(listVariants('test-family').map(v => v.key)).toEqual(['shown'])
      expect(getVariantKeys('test-family')).toContain('secret')
    })

    it('scopes variants per family', () => {
      registerVariant('test-family', 'basic', {})
      expect(getVariantConfig('go', 'basic')).toBeNull()
    })
  })

  describe('interaction models', () => {
    it('routes go to placement and draughts to chains', () => {
      expect(interactionModelFor('go').name).toBe('place')
      expect(interactionModelFor('draughts').name).toBe('chain')
      expect(interactionModelFor('xiangqi').name).toBe('move')
      expect(interactionModelFor('chess').name).toBe('drop')
    })

    it('placement resolves a click straight to a move', () => {
      const model = getInteractionModel('place')
      const result = model.handleClick(40, { moves: [{ coord: 40 }, { coord: 41 }] })
      expect(result).toEqual({ type: 'move', move: { coord: 40 } })
    })

    it('placement rejects a click with no matching move', () => {
      const model = getInteractionModel('place')
      expect(model.handleClick(99, { moves: [{ coord: 40 }] }).type).toBe('reject')
    })

    it('move model selects then moves', () => {
      const model = getInteractionModel('move')
      const moves = [{ from: 10, to: 20 }]
      const select = model.handleClick(10, {
        selected: null, moves, playerIndex: 0, getOwnerAt: () => 0,
      })
      expect(select).toEqual({ type: 'select', pos: 10 })

      const move = model.handleClick(20, {
        selected: 10, moves, playerIndex: 0, getOwnerAt: () => 0,
      })
      expect(move.type).toBe('move')
    })

    it('move model raises a choice when a destination has several promotions', () => {
      const model = getInteractionModel('move')
      const moves = [
        { from: 8, to: 0, promotion: 'queen' },
        { from: 8, to: 0, promotion: 'rook' },
      ]
      const result = model.handleClick(0, {
        selected: 8, moves, playerIndex: 0, getOwnerAt: () => 0,
      })
      expect(result.type).toBe('choice')
      expect(result.choices).toEqual(['queen', 'rook'])
    })

    it('chain model refuses to abandon a capture in progress', () => {
      const model = getInteractionModel('chain')
      const result = model.handleClick(30, {
        selected: 20, chainAnchor: 20, moves: [{ from: 20, to: 40 }],
        playerIndex: 0, getOwnerAt: () => 0,
      })
      expect(result).toEqual({ type: 'reject', reason: 'must-continue-chain' })
    })

    it('chain model continues a capture on a legal follow-up', () => {
      const model = getInteractionModel('chain')
      const result = model.handleClick(40, {
        selected: 20, chainAnchor: 20, moves: [{ from: 20, to: 40 }],
        playerIndex: 0, getOwnerAt: () => 0,
      })
      expect(result.type).toBe('move')
      expect(result.continuesChain).toBe(true)
    })

    it('drop model arms a piece from hand then places it', () => {
      const model = getInteractionModel('drop')
      const moves = [{ drop: 'pawn', to: 30 }]
      expect(model.handleHandClick('pawn', { moves })).toEqual({ type: 'arm-drop', dropType: 'pawn' })
      const placed = model.handleClick(30, { dropType: 'pawn', moves })
      expect(placed.type).toBe('move')
      expect(placed.clearsDrop).toBe(true)
    })

    it('reports pass as available only when the rules offer it', () => {
      expect(availableActions([{ action: 'pass' }, { coord: 1 }])).toEqual(['pass', 'resign'])
      expect(availableActions([{ coord: 1 }])).toEqual(['resign'])
    })
  })

  describe('embed protocol', () => {
    it('parses url parameters', () => {
      const params = parseEmbedParams('?embed=1&family=go&variant=9x9&difficulty=hard')
      expect(params).toMatchObject({
        embed: true, family: 'go', variant: '9x9', difficulty: 'hard', opponent: 'ai',
      })
    })

    it('defaults opponent to human outside embed mode', () => {
      expect(parseEmbedParams('?family=go').opponent).toBe('human')
    })

    it('builds an embed url', () => {
      const url = buildEmbedUrl('https://engine.moddable.games/play/', { family: 'go', variant: '9x9' })
      expect(url).toContain('embed=1')
      expect(url).toContain('family=go')
      expect(url).toContain('variant=9x9')
    })

    it('accepts both the generic and the family namespace', () => {
      const seen = []
      const target = { addEventListener: (_type, fn) => { target.fire = fn }, removeEventListener: () => {} }
      const bridge = createEmbedBridge({
        family: 'go',
        namespace: 'game',
        legacyNamespace: 'go',
        target,
        parent: { postMessage: () => {} },
        handlers: { newGame: () => seen.push('newGame'), undo: () => seen.push('undo') },
      })
      target.fire({ data: { type: 'game:newGame' } })
      target.fire({ data: { type: 'go:undo' } })
      target.fire({ data: { type: 'chess:newGame' } })
      target.fire({ data: { type: 'game:notACommand' } })
      expect(seen).toEqual(['newGame', 'undo'])
      bridge.stop()
    })

    it('posts events under every namespace it answers to', () => {
      const posted = []
      const bridge = createEmbedBridge({
        family: 'go',
        namespace: 'game',
        legacyNamespace: 'go',
        target: { addEventListener: () => {}, removeEventListener: () => {} },
        parent: { postMessage: (msg) => posted.push(msg.type) },
      })
      bridge.post('move', {})
      expect(posted).toEqual(['game:move', 'go:move'])
    })

    it('maps outcomes onto player names', () => {
      expect(normaliseOutcome(1, ['black', 'white'])).toBe('white')
      expect(normaliseOutcome('draw', ['black', 'white'])).toBe('draw')
      expect(normaliseOutcome({ result: 'resign', loser: 'black' }, ['black', 'white'])).toBe('white')
    })
  })

  describe('board view', () => {
    const layout = {
      getCells: () => [
        { key: 0, center: { x: 10, y: 10 }, attrs: { width: 20 }, element: 'rect' },
        { key: 1, center: { x: 30, y: 10 }, attrs: { width: 20 }, element: 'rect' },
      ],
      getDimensions: () => ({ width: 40, height: 20 }),
      getLabels: () => [],
      defaults: {},
    }

    it('emits one hit target per cell', () => {
      const svg = hitTargetLayer(layout)
      expect((svg.match(/data-cell=/g) || []).length).toBe(2)
    })

    it('emits nothing when there are no marks', () => {
      expect(overlayLayer(layout, [])).toBe('')
    })

    it('ignores marks for cells that do not exist', () => {
      expect(overlayLayer(layout, [{ key: 99, type: 'target' }])).toContain('<g class="overlay"')
    })

    it('keeps the svg well formed when layers are injected', () => {
      const svg = renderInteractiveBoard(layout, { pieces: {}, marks: [{ key: 0, type: 'selected' }] })
      expect(svg.trim().endsWith('</svg>')).toBe(true)
      expect(svg).toContain('hit-targets')
      expect(svg).toContain('overlay')
    })
  })

  describe('controller across interaction models', () => {
    it('plays a placement game end to end', () => {
      const game = createGameForFamily('go', { variant: '9x9' })
      const ctrl = createGameController(game.raw, {
        family: 'go',
        players: { black: 'human', white: 'human' },
      })

      ctrl.handleClick(40)
      expect(game.getState().slice.board[40]).toBe('black')
      expect(ctrl.getState().selected).toBeNull()

      ctrl.handleClick(41)
      expect(game.getState().slice.board[41]).toBe('white')
    })

    it('offers pass and resign in a placement game', () => {
      const game = createGameForFamily('go', { variant: '9x9' })
      const ctrl = createGameController(game.raw, {
        family: 'go', players: { black: 'human', white: 'human' },
      })
      expect(ctrl.getAvailableActions()).toEqual(['pass', 'resign'])
      expect(ctrl.performAction('pass')).toBe(true)
      expect(game.getState().slice.passes).toBe(1)
    })

    it('does not offer pass in capture go', () => {
      const game = createGameForFamily('go', { variant: 'capture-go' })
      const ctrl = createGameController(game.raw, {
        family: 'go', players: { black: 'human', white: 'human' },
      })
      expect(ctrl.getAvailableActions()).toEqual(['resign'])
      expect(ctrl.performAction('pass')).toBe(false)
    })

    it('resigning ends the game and names the opponent', () => {
      const game = createGameForFamily('go', { variant: '9x9' })
      let ended = null
      const ctrl = createGameController(game.raw, {
        family: 'go',
        players: { black: 'human', white: 'human' },
        onGameEnd: (outcome) => { ended = outcome },
      })
      ctrl.performAction('resign')
      expect(ended).toEqual({ result: 'resign', loser: 'black' })
      expect(normaliseOutcome(ended, ['black', 'white'])).toBe('white')
    })

    it('selects and moves in a chain game', () => {
      const game = createGameForFamily('draughts', { variant: 'english' })
      const ctrl = createGameController(game.raw, {
        family: 'draughts',
        players: { white: 'human', black: 'human' },
      })

      const first = ctrl.getLegalMoves()[0]
      ctrl.handleClick(first.from)
      expect(ctrl.getState().selected).toBe(first.from)
      ctrl.handleClick(first.to)
      expect(game.getState().slice.board[first.to]).toBeTruthy()
    })

    it('tracks placement in lastMove without from and to', () => {
      const game = createGameForFamily('go', { variant: '9x9' })
      const ctrl = createGameController(game.raw, {
        family: 'go', players: { black: 'human', white: 'human' },
      })
      ctrl.handleClick(40)
      expect(ctrl.getState().lastMove).toEqual({ from: null, to: 40, placed: true })
    })
  })
})
