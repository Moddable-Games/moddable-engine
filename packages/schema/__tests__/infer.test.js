import { inferTopology, inferPlayers, inferEngineBlock, generateEngineFrontmatter } from '../src/infer.js'

describe('inferTopology', () => {
  test('infers grid from chess family', () => {
    const result = inferTopology({ parent: 'moddable-chess', board: '8×8' })
    expect(result).toEqual({ type: 'grid', rows: 8, cols: 8 })
  })

  test('infers grid from go family', () => {
    const result = inferTopology({ parent: 'go', board: '19×19' })
    expect(result).toEqual({ type: 'grid', rows: 19, cols: 19 })
  })

  test('infers grid from draughts with 10x10', () => {
    const result = inferTopology({ parent: 'draughts', board: '10×10' })
    expect(result).toEqual({ type: 'grid', rows: 10, cols: 10 })
  })

  test('infers pit from mancala family', () => {
    const result = inferTopology({ parent: 'mancala', board: '2×6 pits' })
    expect(result).toEqual({ type: 'pit', pitsPerSide: 6 })
  })

  test('infers pit from 2x7 board', () => {
    const result = inferTopology({ parent: 'mancala', board: '2×7 pits' })
    expect(result).toEqual({ type: 'pit', pitsPerSide: 7 })
  })

  test('infers track from backgammon family', () => {
    const result = inferTopology({ parent: 'backgammon', board: '24-point board' })
    expect(result).toEqual({ type: 'track', positions: 24 })
  })

  test('infers track from pachisi family', () => {
    const result = inferTopology({ parent: 'pachisi', board: 'Cross-shaped cloth board' })
    expect(result).toEqual({ type: 'track' })
  })

  test('infers hex from hex family', () => {
    const result = inferTopology({ parent: 'hex', board: '11×11' })
    expect(result).toEqual({ type: 'hex', radius: 5 })
  })

  test('infers hex from nukes family', () => {
    const result = inferTopology({ parent: 'nukes' })
    expect(result.type).toBe('hex')
  })

  test('falls back to board pattern for unknown family', () => {
    const result = inferTopology({ parent: 'unknown', board: '8×8' })
    expect(result).toEqual({ type: 'grid', rows: 8, cols: 8 })
  })

  test('returns null when no inference possible', () => {
    const result = inferTopology({ parent: 'unknown', board: 'Something weird' })
    expect(result).toBeNull()
  })
})

describe('inferPlayers', () => {
  test('chess gets white/black', () => {
    expect(inferPlayers({ parent: 'moddable-chess', players: '2' })).toEqual(['white', 'black'])
  })

  test('go gets black/white', () => {
    expect(inferPlayers({ parent: 'go', players: '2' })).toEqual(['black', 'white'])
  })

  test('mancala gets south/north', () => {
    expect(inferPlayers({ parent: 'mancala', players: '2' })).toEqual(['south', 'north'])
  })

  test('4-player game gets numbered names', () => {
    expect(inferPlayers({ parent: 'moddable-chess', players: '4' }))
      .toEqual(['player1', 'player2', 'player3', 'player4'])
  })

  test('range takes minimum', () => {
    expect(inferPlayers({ parent: 'landlords-game', players: '2–6' }))
      .toEqual(['player1', 'player2'])
  })
})

describe('inferEngineBlock', () => {
  test('produces complete block for chess variant', () => {
    const block = inferEngineBlock({ parent: 'moddable-chess', board: '8×8', players: '2' })
    expect(block.topology).toEqual({ type: 'grid', rows: 8, cols: 8 })
    expect(block.players).toEqual(['white', 'black'])
  })

  test('produces complete block for mancala variant', () => {
    const block = inferEngineBlock({ parent: 'mancala', board: '2×6 pits', players: '2' })
    expect(block.topology).toEqual({ type: 'pit', pitsPerSide: 6 })
    expect(block.players).toEqual(['south', 'north'])
  })
})

describe('generateEngineFrontmatter', () => {
  test('generates YAML for chess variant', () => {
    const yaml = generateEngineFrontmatter({ parent: 'moddable-chess', board: '8×8', players: '2' })
    expect(yaml).toContain('engine:')
    expect(yaml).toContain('type: grid')
    expect(yaml).toContain('rows: 8')
    expect(yaml).toContain('cols: 8')
    expect(yaml).toContain('players: [white, black]')
  })

  test('generates YAML for mancala variant', () => {
    const yaml = generateEngineFrontmatter({ parent: 'mancala', board: '2×6 pits', players: '2' })
    expect(yaml).toContain('type: pit')
    expect(yaml).toContain('pitsPerSide: 6')
    expect(yaml).toContain('players: [south, north]')
  })
})
