import { parseGameDefinition } from '../src/schema.js'

const BACKGAMMON = `---
title: "Standard Backgammon"
slug: "standard"
parent: "backgammon"
players: "2"
board: "24-point board"
win: "Bear off all 15 pieces before opponent"
special: "Doubling cube, hitting and re-entering from bar"
engine:
  topology:
    type: track
    positions: 24
    circuit: false
  players: [white, black]
  setup:
    initialPosition:
      white: [[0, 2], [11, 5], [16, 3], [18, 5]]
      black: [[5, 5], [7, 3], [12, 5], [23, 2]]
    piecesPerPlayer: 15
  plugins:
    dice:
      count: 2
      sides: 6
    doublingCube:
      initial: 1
      max: 64
    bearing:
      direction: forward
      requirement: all-in-home
  render:
    style: backgammon
    pointHeight: 200
---

## Standard Backgammon

Classic tables race game.
`

describe('proof: schema → backgammon definition', () => {
  test('parses backgammon variant into game definition', () => {
    const result = parseGameDefinition(BACKGAMMON)
    expect(result.ok).toBe(true)
  })

  test('topology is track with 24 positions', () => {
    const { definition } = parseGameDefinition(BACKGAMMON)
    expect(definition.topology.type).toBe('track')
    expect(definition.topology.positions).toBe(24)
    expect(definition.topology.circuit).toBe(false)
  })

  test('players named white and black', () => {
    const { definition } = parseGameDefinition(BACKGAMMON)
    expect(definition.players.names).toEqual(['white', 'black'])
  })

  test('setup carries initial position data', () => {
    const { definition } = parseGameDefinition(BACKGAMMON)
    expect(definition.setup.piecesPerPlayer).toBe(15)
    expect(definition.setup.initialPosition).toBeDefined()
  })

  test('dice plugin configured', () => {
    const { definition } = parseGameDefinition(BACKGAMMON)
    expect(definition.plugins.dice.count).toBe(2)
    expect(definition.plugins.dice.sides).toBe(6)
  })

  test('doubling cube plugin configured', () => {
    const { definition } = parseGameDefinition(BACKGAMMON)
    expect(definition.plugins.doublingCube.initial).toBe(1)
    expect(definition.plugins.doublingCube.max).toBe(64)
  })
})
