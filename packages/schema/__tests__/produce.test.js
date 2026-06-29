import { produce } from '../src/produce.js'

describe('produce', () => {
  test('produces grid game definition', () => {
    const meta = {
      title: 'Standard Chess',
      slug: 'standard',
      parent: 'moddable-chess',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        players: ['white', 'black'],
      },
    }
    const def = produce(meta)
    expect(def.id).toBe('moddable-chess/standard')
    expect(def.title).toBe('Standard Chess')
    expect(def.family).toBe('moddable-chess')
    expect(def.topology).toEqual({ type: 'grid', rows: 8, cols: 8 })
    expect(def.players.names).toEqual(['white', 'black'])
  })

  test('produces hex game definition', () => {
    const meta = {
      title: 'Hex',
      slug: 'standard',
      parent: 'hex',
      players: '2',
      engine: {
        topology: { type: 'hex', radius: 5, orientation: 'pointy' },
      },
    }
    const def = produce(meta)
    expect(def.topology).toEqual({ type: 'hex', radius: 5, orientation: 'pointy' })
  })

  test('produces track game definition', () => {
    const positions = Array.from({ length: 24 }, (_, i) => `point-${i}`)
    const meta = {
      title: 'Standard Backgammon',
      slug: 'standard',
      parent: 'backgammon',
      players: '2',
      engine: {
        topology: { type: 'track', positions, circuit: false },
        players: ['white', 'black'],
      },
    }
    const def = produce(meta)
    expect(def.topology.type).toBe('track')
    expect(def.topology.positions).toHaveLength(24)
    expect(def.topology.circuit).toBe(false)
  })

  test('produces pit game definition', () => {
    const meta = {
      title: 'Oware',
      slug: 'oware',
      parent: 'mancala',
      players: '2',
      engine: {
        topology: { type: 'pit', pitsPerSide: 6, hasStores: false },
        players: ['south', 'north'],
      },
    }
    const def = produce(meta)
    expect(def.topology).toEqual({ type: 'pit', pitsPerSide: 6, hasStores: false })
    expect(def.players.names).toEqual(['south', 'north'])
  })

  test('includes piece definitions when provided', () => {
    const meta = {
      title: 'Standard Chess',
      slug: 'standard',
      parent: 'moddable-chess',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        pieces: [
          { name: 'rook', movement: { type: 'slide', directions: 'orthogonal' }, symbol: 'R', value: 5 },
          { name: 'knight', movement: { type: 'leap', offsets: [[2, 1], [1, 2]] }, symbol: 'N', value: 3 },
        ],
      },
    }
    const def = produce(meta)
    expect(def.pieces).toHaveLength(2)
    expect(def.pieces[0].name).toBe('rook')
    expect(def.pieces[0].movement.type).toBe('slide')
    expect(def.pieces[0].symbol).toBe('R')
    expect(def.pieces[1].name).toBe('knight')
  })

  test('includes plugin configs', () => {
    const meta = {
      title: 'Standard Backgammon',
      slug: 'standard',
      parent: 'backgammon',
      players: '2',
      engine: {
        topology: { type: 'track', positions: 24 },
        plugins: { dice: { count: 2, sides: 6 }, doubling: { initial: 1 } },
      },
    }
    const def = produce(meta)
    expect(def.plugins.dice).toEqual({ count: 2, sides: 6 })
    expect(def.plugins.doubling).toEqual({ initial: 1 })
  })

  test('includes render config', () => {
    const meta = {
      title: 'Standard Chess',
      slug: 'standard',
      parent: 'moddable-chess',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        render: { tileSize: 60, alternating: true, colors: { light: '#eee', dark: '#333' } },
      },
    }
    const def = produce(meta)
    expect(def.render.tileSize).toBe(60)
    expect(def.render.colors.light).toBe('#eee')
  })

  test('derives player names from count when engine.players not specified', () => {
    const meta = {
      title: 'Four Player Chess',
      slug: 'four-player',
      parent: 'moddable-chess',
      players: '4',
      engine: {
        topology: { type: 'grid', rows: 14, cols: 14 },
      },
    }
    const def = produce(meta)
    expect(def.players.names).toEqual(['player1', 'player2', 'player3', 'player4'])
  })

  test('includes setup when provided', () => {
    const meta = {
      title: 'Standard Chess',
      slug: 'standard',
      parent: 'moddable-chess',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        setup: { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
      },
    }
    const def = produce(meta)
    expect(def.setup.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
  })

  test('grid topology with wrap', () => {
    const meta = {
      title: 'Cylinder Chess',
      slug: 'cylinder',
      parent: 'moddable-chess',
      players: '2',
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8, wrap: true },
      },
    }
    const def = produce(meta)
    expect(def.topology.wrap).toBe(true)
  })
})
