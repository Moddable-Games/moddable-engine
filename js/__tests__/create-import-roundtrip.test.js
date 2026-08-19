import { defaultState, buildResolvedFromState, stateFromResolved, resolveImported } from '../create-state.js'
import { parseFrontmatter } from '../../packages/schema/index.js'
import { toPluginConfig, defaultRuleValues } from '../create-rules.js'

describe('import YAML round-trip', () => {
  test('a chess variant survives export → import → export', () => {
    const yaml = `---
title: Test Chess
slug: test-chess
win: Checkmate the opponent king
special: Pawns can promote on any rank
engine:
  topology:
    type: grid
    rows: 8
    cols: 8
  surface: wood-classic
  render:
    cellColor: checkered
    labels: true
  pieces:
    set: mce-standard
  setup: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
  plugins:
    chess:
      castling: false
      torpedo: true
---`

    const parsed = parseFrontmatter(yaml)
    const state = resolveImported(parsed)

    expect(state.title).toBe('Test Chess')
    expect(state.slug).toBe('test-chess')
    expect(state.win).toBe('Checkmate the opponent king')
    expect(state.special).toBe('Pawns can promote on any rank')
    expect(state.family).toBe('chess')
    expect(state.topology.rows).toBe(8)
    expect(state.topology.cols).toBe(8)
    expect(state.rules.castling).toBe(false)
    expect(state.rules.torpedo).toBe(true)
    expect(Object.keys(state.placement).length).toBeGreaterThan(0)
  })

  test('a draughts variant with Tier A keys round-trips', () => {
    const yaml = `---
title: International Draughts
slug: international
engine:
  topology:
    type: grid
    rows: 10
    cols: 10
  surface: wood-classic
  render:
    cellColor: checkered
    labels: true
  plugins:
    draughts:
      piecesPerPlayer: 20
      directions: diagonal
      manCapture: all
      flyingKings: true
      forcedCapture: true
      maximalCapture: true
---`

    const parsed = parseFrontmatter(yaml)
    const state = resolveImported(parsed)

    expect(state.family).toBe('draughts')
    expect(state.topology.rows).toBe(10)
    expect(state.topology.cols).toBe(10)
    expect(state.rules.piecesPerPlayer).toBe(20)
    expect(state.rules.directions).toBe('diagonal')
    expect(state.rules.manCapture).toBe('all')
    expect(state.rules.flyingKings).toBe(true)
    expect(state.rules.maximalCapture).toBe(true)
  })

  test('a shogi variant with list keys round-trips', () => {
    const yaml = `---
title: Tori Shogi
slug: tori-shogi
engine:
  topology:
    type: grid
    rows: 7
    cols: 7
  surface: wood-classic
  render:
    cellColor: uniform
    labels: true
  plugins:
    shogi:
      dropCheckmateLimit: true
      noDropLastRank:
        - swallow
      nifuType: swallow
      nifuLimit: 2
---`

    const parsed = parseFrontmatter(yaml)
    const state = resolveImported(parsed)

    expect(state.family).toBe('shogi')
    expect(state.rules.dropCheckmateLimit).toBe(true)
    expect(state.rules.noDropLastRank).toEqual(['swallow'])
    expect(state.rules.nifuType).toBe('swallow')
    expect(state.rules.nifuLimit).toBe(2)
  })

  test('state → resolved → state is idempotent for simple chess', () => {
    const state1 = defaultState('chess')
    state1.title = 'Round Trip'
    state1.topology.rows = 8
    state1.topology.cols = 8
    state1.rules.castling = false
    state1.placement = { '0,4': 'K', '7,4': 'k' }

    const resolved1 = buildResolvedFromState(state1)
    const state2 = stateFromResolved(resolved1, 'chess', { title: state1.title })
    const resolved2 = buildResolvedFromState(state2)

    expect(resolved2.topology).toEqual(resolved1.topology)
    expect(resolved2.plugins).toEqual(resolved1.plugins)
    expect(resolved2.setup).toEqual(resolved1.setup)
  })

  test('reversi with winBy imports correctly', () => {
    const yaml = `---
title: Anti-Reversi
slug: anti-reversi
engine:
  topology:
    type: grid
    rows: 8
    cols: 8
    layout: cells
  surface: felt-green
  render:
    cellColor: uniform
    labels: true
  plugins:
    reversi:
      winBy: fewest
      directions: all
---`

    const parsed = parseFrontmatter(yaml)
    const state = resolveImported(parsed)

    expect(state.family).toBe('reversi')
    expect(state.rules.winBy).toBe('fewest')
    expect(state.rules.directions).toBe('all')
  })
})
