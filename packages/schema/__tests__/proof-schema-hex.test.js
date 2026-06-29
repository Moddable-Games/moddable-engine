import { parseGameDefinition } from '../src/schema.js'

const HEX_GAME = `---
title: "Hex"
slug: "standard"
parent: "hex"
players: "2"
board: "11×11 rhombus"
win: "Connect your two sides with a chain"
special: "Swap rule available on first move"
engine:
  topology:
    type: hex
    radius: 5
    orientation: pointy
  players: [black, white]
  plugins:
    connection:
      sides:
        black: [north, south]
        white: [east, west]
    swap:
      availableOn: 1
  render:
    hexSize: 30
    style: flat-top
---

## Hex

Connection game on a rhombus of hexagons.
`

describe('proof: schema → hex definition', () => {
  test('parses hex variant into game definition', () => {
    const result = parseGameDefinition(HEX_GAME)
    expect(result.ok).toBe(true)
  })

  test('topology is ready for createHexTopology', () => {
    const { definition } = parseGameDefinition(HEX_GAME)
    expect(definition.topology.type).toBe('hex')
    expect(definition.topology.radius).toBe(5)
    expect(definition.topology.orientation).toBe('pointy')
  })

  test('players named for hex tradition', () => {
    const { definition } = parseGameDefinition(HEX_GAME)
    expect(definition.players.names).toEqual(['black', 'white'])
  })

  test('connection plugin configured with sides', () => {
    const { definition } = parseGameDefinition(HEX_GAME)
    expect(definition.plugins.connection).toBeDefined()
    expect(definition.plugins.connection.sides).toBeDefined()
  })

  test('swap rule plugin configured', () => {
    const { definition } = parseGameDefinition(HEX_GAME)
    expect(definition.plugins.swap.availableOn).toBe(1)
  })

  test('render config present', () => {
    const { definition } = parseGameDefinition(HEX_GAME)
    expect(definition.render.hexSize).toBe(30)
  })
})
