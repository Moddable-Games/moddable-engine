import { parseGameDefinition } from '../src/schema.js'

const OWARE = `---
title: "Oware"
slug: "oware"
parent: "mancala"
players: "2"
board: "2×6 pits"
win: "Most seeds captured"
special: "Grand slam rule — cannot capture all opponent seeds"
engine:
  topology:
    type: pit
    pitsPerSide: 6
    hasStores: false
  players: [south, north]
  setup:
    seedsPerPit: 4
  plugins:
    sowing:
      laps: single
      direction: counter-clockwise
      skipOrigin: true
    capture:
      type: last-pit-count
      counts: [2, 3]
      side: opponent
    grandSlam:
      rule: forbidden
  render:
    pitRadius: 28
    spacing: 12
---

## Oware

West African two-row mancala.
`

describe('proof: schema → mancala definition', () => {
  test('parses mancala variant into game definition', () => {
    const result = parseGameDefinition(OWARE)
    expect(result.ok).toBe(true)
  })

  test('topology is ready for createPitTopology', () => {
    const { definition } = parseGameDefinition(OWARE)
    expect(definition.topology.type).toBe('pit')
    expect(definition.topology.pitsPerSide).toBe(6)
    expect(definition.topology.hasStores).toBe(false)
  })

  test('players use directional names', () => {
    const { definition } = parseGameDefinition(OWARE)
    expect(definition.players.names).toEqual(['south', 'north'])
  })

  test('plugin configs carry sowing rules', () => {
    const { definition } = parseGameDefinition(OWARE)
    expect(definition.plugins.sowing.laps).toBe('single')
    expect(definition.plugins.sowing.direction).toBe('counter-clockwise')
  })

  test('plugin configs carry capture rules', () => {
    const { definition } = parseGameDefinition(OWARE)
    expect(definition.plugins.capture.type).toBe('last-pit-count')
    expect(definition.plugins.capture.side).toBe('opponent')
  })

  test('setup carries initial seeds config', () => {
    const { definition } = parseGameDefinition(OWARE)
    expect(definition.setup.seedsPerPit).toBe(4)
  })

  test('render config present', () => {
    const { definition } = parseGameDefinition(OWARE)
    expect(definition.render.pitRadius).toBe(28)
  })
})
