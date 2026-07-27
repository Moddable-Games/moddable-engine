import { exportGameData, editHex, generate, listGames, getHexInfo } from '../src/sdk.js'

describe('hex SDK — exportGameData', () => {
  it('returns structured data for nukes (has exportForParent)', () => {
    const result = exportGameData('nukes', { size: 3, seed: '12345' })
    expect(result.game).toBe('nukes')
    expect(result.format).toBe('nukes')
    expect(result.data).toBeDefined()
    expect(result.seed).toBe('12345')
  })

  it('returns raw hex format for games without exportForParent', () => {
    const result = exportGameData('twilight', { size: 3, seed: '12345' })
    expect(result.game).toBe('twilight')
    expect(result.format).toBe('hex')
    expect(result.data.hexes).toBeDefined()
    expect(Array.isArray(result.data.hexes)).toBe(true)
  })

  it('throws for unknown game', () => {
    expect(() => exportGameData('boggle')).toThrow(/Unknown hex game/)
  })
})

describe('hex SDK — editHex', () => {
  it('cycles terrain on nukes hex', () => {
    const result = generate('nukes', { size: 3, seed: '999' })
    const hex = result.hexes[0]
    const originalType = hex.type
    const edited = editHex('nukes', result.hexes, hex.q, hex.r)
    expect(edited).not.toBeNull()
    expect(edited.q).toBe(hex.q)
    expect(edited.r).toBe(hex.r)
    expect(edited.type).not.toBe(originalType)
  })

  it('returns null for game without onHexClick', () => {
    const result = generate('twilight', { size: 3, seed: '999' })
    const hex = result.hexes[0]
    const edited = editHex('twilight', result.hexes, hex.q, hex.r)
    expect(edited).toBeNull()
  })

  it('returns null for invalid coordinates', () => {
    const result = generate('nukes', { size: 3, seed: '999' })
    const edited = editHex('nukes', result.hexes, 99, 99)
    expect(edited).toBeNull()
  })
})

describe('hex SDK — existing functions', () => {
  it('listGames returns all 6 games', () => {
    const games = listGames()
    expect(games.length).toBe(6)
    expect(games.map(g => g.key)).toContain('nukes')
    expect(games.map(g => g.key)).toContain('twilight')
  })

  it('getHexInfo returns hex and neighbours', () => {
    const result = generate('nukes', { size: 3, seed: '123' })
    const center = result.hexes.find(h => h.q === 0 && h.r === 0)
    const info = getHexInfo(result.hexes, 0, 0)
    expect(info.hex).toBe(center)
    expect(info.neighbours.length).toBeGreaterThan(0)
  })
})
