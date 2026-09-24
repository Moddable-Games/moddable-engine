// Deliberately imports nothing but the package's own entry point. The test
// helper loads the plugins' composition root itself, which is how every other
// suite passed while the SDK - and every script built on it - created variants
// without their modules: Gomoku could never be won, and the puzzle generator
// proved chess variants' puzzles under the standard rules.
import { getVariantConfig, getRegisteredFamilies } from '../src/variant-registry.js'
import '../index.js'

test('the package entry registers every family and its variant modules', () => {
  expect(getRegisteredFamilies().length).toBeGreaterThanOrEqual(10)
  expect(typeof getVariantConfig('chess', 'atomic')?.moveApply).toBe('function')
  expect(typeof getVariantConfig('go', 'gomoku')?.winCondition).toBe('function')
})
