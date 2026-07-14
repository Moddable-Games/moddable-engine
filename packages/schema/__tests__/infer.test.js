import { inferTopology, inferPlayers, inferEngineBlock, generateEngineFrontmatter } from '../src/infer.js'
import { schema as gridSchema } from '../../topology-grid/src/topology-grid.js'
import { schema as hexSchema } from '../../topology-hex/src/topology-hex.js'
import { schema as trackSchema } from '../../topology-track/src/topology-track.js'
import { schema as pitSchema } from '../../topology-pit/src/topology-pit.js'
import { schema as graphSchema } from '../../topology-graph/src/topology-graph.js'

const ALL_TOPOLOGIES = [pitSchema, trackSchema, hexSchema, graphSchema, gridSchema]

describe('inferTopology', () => {
  test('infers grid from NxN board string', () => {
    const result = inferTopology({ board: '8×8' }, { topologySchemas: ALL_TOPOLOGIES })
    expect(result).toEqual({ type: 'grid', rows: 8, cols: 8 })
  })

  test('infers grid from 19x19 board', () => {
    const result = inferTopology({ board: '19×19' }, { topologySchemas: ALL_TOPOLOGIES })
    expect(result).toEqual({ type: 'grid', rows: 19, cols: 19 })
  })

  test('infers pit from pits board string', () => {
    const result = inferTopology({ board: '2×6 pits' }, { topologySchemas: ALL_TOPOLOGIES })
    expect(result).toEqual({ type: 'pit', cols: 6 })
  })

  test('infers track from point board string', () => {
    const result = inferTopology({ board: '24-point board' }, { topologySchemas: ALL_TOPOLOGIES })
    expect(result).toEqual({ type: 'track', positions: 24 })
  })

  test('infers hex from hex board string', () => {
    const result = inferTopology({ board: '11×11' }, { topologySchemas: ALL_TOPOLOGIES })
    expect(result).toEqual({ type: 'grid', rows: 11, cols: 11 })
  })

  test('returns null when no inference possible', () => {
    const result = inferTopology({ board: 'Something weird' }, { topologySchemas: ALL_TOPOLOGIES })
    expect(result).toBeNull()
  })

  test('returns null with no schemas', () => {
    const result = inferTopology({ board: '8×8' })
    expect(result).toBeNull()
  })
})

describe('inferPlayers', () => {
  test('2-player game gets numbered names', () => {
    expect(inferPlayers({ players: '2' })).toEqual(['player1', 'player2'])
  })

  test('4-player game gets numbered names', () => {
    expect(inferPlayers({ players: '4' }))
      .toEqual(['player1', 'player2', 'player3', 'player4'])
  })

  test('range takes minimum', () => {
    expect(inferPlayers({ players: '2–6' }))
      .toEqual(['player1', 'player2'])
  })

  test('defaults to 2 players', () => {
    expect(inferPlayers({})).toEqual(['player1', 'player2'])
  })
})

describe('inferEngineBlock', () => {
  test('produces complete block from board string', () => {
    const block = inferEngineBlock({ board: '8×8', players: '2' }, { topologySchemas: ALL_TOPOLOGIES })
    expect(block.topology).toEqual({ type: 'grid', rows: 8, cols: 8 })
    expect(block.players).toEqual(['player1', 'player2'])
  })

  test('returns null when topology cannot be inferred', () => {
    const block = inferEngineBlock({ board: 'unknown layout', players: '2' }, { topologySchemas: ALL_TOPOLOGIES })
    expect(block).toBeNull()
  })
})

describe('generateEngineFrontmatter', () => {
  test('generates YAML from board string', () => {
    const yaml = generateEngineFrontmatter({ board: '8×8', players: '2' }, { topologySchemas: ALL_TOPOLOGIES })
    expect(yaml).toContain('engine:')
    expect(yaml).toContain('type: grid')
    expect(yaml).toContain('rows: 8')
    expect(yaml).toContain('cols: 8')
    expect(yaml).toContain('players: [player1, player2]')
  })

  test('returns null when inference fails', () => {
    const yaml = generateEngineFrontmatter({ board: 'no match', players: '2' }, { topologySchemas: ALL_TOPOLOGIES })
    expect(yaml).toBeNull()
  })
})
