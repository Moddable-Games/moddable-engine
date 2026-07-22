import { createStandardDice } from './standard-dice.js'

export function parseDiceExpression(expr) {
  if (typeof expr === 'number') return { type: 'constant', value: expr }
  const str = String(expr).trim()
  if (!str) return null
  const num = Number(str)
  if (!isNaN(num)) return { type: 'constant', value: num }

  const match = str.match(/^(\d+)d(\d+)(?:kh(\d+)|kl(\d+))?\s*([+-]\s*\d+)?$/)
  if (!match) return null

  return {
    type: 'dice',
    count: parseInt(match[1]),
    faces: parseInt(match[2]),
    keepHigh: match[3] ? parseInt(match[3]) : null,
    keepLow: match[4] ? parseInt(match[4]) : null,
    modifier: match[5] ? parseInt(match[5].replace(/\s/g, '')) : 0,
  }
}

export function rollDiceExpression(expr, rng) {
  const parsed = parseDiceExpression(expr)
  if (!parsed) return 0
  if (parsed.type === 'constant') return parsed.value

  const dice = createStandardDice({ count: parsed.count, faces: parsed.faces })
  const results = dice.roll(rng)

  let kept = results
  if (parsed.keepHigh) {
    kept = [...results].sort((a, b) => b - a).slice(0, parsed.keepHigh)
  } else if (parsed.keepLow) {
    kept = [...results].sort((a, b) => a - b).slice(0, parsed.keepLow)
  }

  return kept.reduce((sum, v) => sum + v, 0) + parsed.modifier
}
