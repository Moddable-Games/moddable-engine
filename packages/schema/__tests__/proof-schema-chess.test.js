import { parseGameDefinition } from '../src/schema.js'

const STANDARD_CHESS = `---
title: "Standard Chess"
slug: "standard"
parent: "moddable-chess"
players: "2"
board: "8×8"
win: "Checkmate"
special: "Standard FIDE rules"
engine:
  topology:
    type: grid
    rows: 8
    cols: 8
  players: [white, black]
  pieces:
    - name: king
      movement:
        type: step
        directions: all
      symbol: K
      count: 1
    - name: queen
      movement:
        type: slide
        directions: all
      symbol: Q
      count: 1
    - name: rook
      movement:
        type: slide
        directions: orthogonal
      symbol: R
      count: 2
      value: 5
    - name: bishop
      movement:
        type: slide
        directions: diagonal
      symbol: B
      count: 2
      value: 3
    - name: knight
      movement:
        type: leap
        offsets: [[2,1],[1,2]]
      symbol: N
      count: 2
      value: 3
    - name: pawn
      movement:
        type: pawn
        directions: forward
      symbol: P
      count: 8
      value: 1
      promotesTo: [queen, rook, bishop, knight]
  setup:
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  render:
    tileSize: 56
    alternating: true
  plugins:
    castling: {}
    en-passant: {}
    promotion: {}
---

## Standard Chess

Classic FIDE rules.
`

describe('proof: schema → chess definition', () => {
  test('parses full chess variant into game definition', () => {
    const result = parseGameDefinition(STANDARD_CHESS)
    expect(result.ok).toBe(true)
    expect(result.definition).toBeDefined()
  })

  test('definition has correct identity', () => {
    const { definition } = parseGameDefinition(STANDARD_CHESS)
    expect(definition.id).toBe('moddable-chess/standard')
    expect(definition.title).toBe('Standard Chess')
    expect(definition.family).toBe('moddable-chess')
    expect(definition.slug).toBe('standard')
  })

  test('topology is ready for createGridTopology', () => {
    const { definition } = parseGameDefinition(STANDARD_CHESS)
    expect(definition.topology.type).toBe('grid')
    expect(definition.topology.rows).toBe(8)
    expect(definition.topology.cols).toBe(8)
  })

  test('players are named', () => {
    const { definition } = parseGameDefinition(STANDARD_CHESS)
    expect(definition.players.names).toEqual(['white', 'black'])
  })

  test('pieces carry movement semantics', () => {
    const { definition } = parseGameDefinition(STANDARD_CHESS)
    expect(definition.pieces).toHaveLength(6)
    const knight = definition.pieces.find(p => p.name === 'knight')
    expect(knight.movement.type).toBe('leap')
    expect(knight.symbol).toBe('N')
    expect(knight.value).toBe(3)
  })

  test('setup contains FEN', () => {
    const { definition } = parseGameDefinition(STANDARD_CHESS)
    expect(definition.setup.fen).toContain('rnbqkbnr')
  })

  test('render config present', () => {
    const { definition } = parseGameDefinition(STANDARD_CHESS)
    expect(definition.render.tileSize).toBe(56)
    expect(definition.render.alternating).toBe(true)
  })

  test('plugin configs present', () => {
    const { definition } = parseGameDefinition(STANDARD_CHESS)
    expect(definition.plugins).toHaveProperty('castling')
    expect(definition.plugins).toHaveProperty('en-passant')
    expect(definition.plugins).toHaveProperty('promotion')
  })

  test('presentation metadata preserved in meta', () => {
    const result = parseGameDefinition(STANDARD_CHESS)
    expect(result.meta.board).toBe('8×8')
    expect(result.meta.win).toBe('Checkmate')
    expect(result.meta.special).toBe('Standard FIDE rules')
  })

  test('body contains markdown content', () => {
    const result = parseGameDefinition(STANDARD_CHESS)
    expect(result.body).toContain('## Standard Chess')
  })
})
