import { createForcedCaptureRule } from '../src/rules/forced-capture.js'

describe('forced-capture rule', () => {
  it('returns only captures when captures are available', () => {
    const rule = createForcedCaptureRule()
    const moves = [
      { from: 0, to: 1 },
      { from: 2, to: 4, captures: [3] },
      { from: 5, to: 6 },
    ]
    const filtered = rule.hooks.moveFilter(moves, {}, {})
    expect(filtered.length).toBe(1)
    expect(filtered[0].captures).toEqual([3])
  })

  it('returns all moves when no captures available', () => {
    const rule = createForcedCaptureRule()
    const moves = [
      { from: 0, to: 1 },
      { from: 5, to: 6 },
    ]
    const filtered = rule.hooks.moveFilter(moves, {}, {})
    expect(filtered.length).toBe(2)
  })

  it('maximal capture selects longest chains only', () => {
    const rule = createForcedCaptureRule({ maximalCapture: true })
    const moves = [
      { from: 0, to: 4, captures: [2], captureCount: 1 },
      { from: 0, to: 8, captures: [2, 6], captureCount: 2 },
      { from: 5, to: 9, captures: [7], captureCount: 1 },
    ]
    const filtered = rule.hooks.moveFilter(moves, {}, {})
    expect(filtered.length).toBe(1)
    expect(filtered[0].captureCount).toBe(2)
  })

  it('supports custom capture detector', () => {
    const rule = createForcedCaptureRule({
      captureDetector: (m) => m.isJump,
    })
    const moves = [
      { from: 0, to: 1 },
      { from: 2, to: 4, isJump: true },
    ]
    const filtered = rule.hooks.moveFilter(moves, {}, {})
    expect(filtered.length).toBe(1)
    expect(filtered[0].isJump).toBe(true)
  })

  it('has correct metadata', () => {
    const rule = createForcedCaptureRule()
    expect(rule.id).toBe('forced-capture')
    expect(rule.category).toBe('constraint')
  })
})
