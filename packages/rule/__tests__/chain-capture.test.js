import { createChainCaptureRule } from '../src/rules/chain-capture.js'

describe('chain-capture rule', () => {
  it('continues turn when move has captures and state flag is set', () => {
    const rule = createChainCaptureRule()
    const move = { from: 0, to: 4, captures: [2] }
    const state = { _chainActive: true }
    expect(rule.hooks.continueTurn(move, state, {})).toBe(true)
  })

  it('does not continue when move has no captures', () => {
    const rule = createChainCaptureRule()
    const move = { from: 0, to: 1 }
    const state = { _chainActive: true }
    expect(rule.hooks.continueTurn(move, state, {})).toBe(false)
  })

  it('does not continue when captures present but state flag is false', () => {
    const rule = createChainCaptureRule()
    const move = { from: 0, to: 4, captures: [2] }
    const state = { _chainActive: false }
    expect(rule.hooks.continueTurn(move, state, {})).toBe(false)
  })

  it('supports custom chain detector', () => {
    const rule = createChainCaptureRule({
      chainDetector: (move, state) => state.furtherJumps > 0,
    })
    const move = { from: 0, to: 4, captures: [2] }
    expect(rule.hooks.continueTurn(move, { furtherJumps: 2 }, {})).toBe(true)
    expect(rule.hooks.continueTurn(move, { furtherJumps: 0 }, {})).toBe(false)
  })

  it('does not continue when captures is empty array', () => {
    const rule = createChainCaptureRule()
    const move = { from: 0, to: 1, captures: [] }
    expect(rule.hooks.continueTurn(move, { _chainActive: true }, {})).toBe(false)
  })

  it('has correct metadata', () => {
    const rule = createChainCaptureRule()
    expect(rule.id).toBe('chain-capture')
    expect(rule.category).toBe('turn')
  })
})
