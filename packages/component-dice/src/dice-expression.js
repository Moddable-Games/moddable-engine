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

export function calculateOdds(expr, target, comparison = '>=') {
  const parsed = parseDiceExpression(expr)
  if (!parsed) return 0
  if (parsed.type === 'constant') {
    const val = parsed.value
    if (comparison === '>=') return val >= target ? 1 : 0
    if (comparison === '<=') return val <= target ? 1 : 0
    if (comparison === '=') return val === target ? 1 : 0
    return 0
  }

  if (parsed.keepHigh || parsed.keepLow) {
    return simulateOdds(parsed, target, comparison, 10000)
  }

  const dist = buildDistribution(parsed.count, parsed.faces)
  let favorable = 0
  const total = Math.pow(parsed.faces, parsed.count)

  for (const [sum, ways] of dist.entries()) {
    const adjusted = sum + parsed.modifier
    const matches = comparison === '>=' ? adjusted >= target
      : comparison === '<=' ? adjusted <= target
      : adjusted === target
    if (matches) favorable += ways
  }

  return favorable / total
}

function buildDistribution(count, faces) {
  let dist = new Map()
  for (let f = 1; f <= faces; f++) dist.set(f, 1)

  for (let d = 1; d < count; d++) {
    const next = new Map()
    for (const [sum, ways] of dist.entries()) {
      for (let f = 1; f <= faces; f++) {
        const key = sum + f
        next.set(key, (next.get(key) || 0) + ways)
      }
    }
    dist = next
  }
  return dist
}

function simulateOdds(parsed, target, comparison, trials) {
  let hits = 0
  let seed = 12345
  for (let t = 0; t < trials; t++) {
    const rolls = []
    for (let i = 0; i < parsed.count; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      rolls.push((seed % parsed.faces) + 1)
    }
    let kept = rolls
    if (parsed.keepHigh) {
      kept = [...rolls].sort((a, b) => b - a).slice(0, parsed.keepHigh)
    } else if (parsed.keepLow) {
      kept = [...rolls].sort((a, b) => a - b).slice(0, parsed.keepLow)
    }
    const val = kept.reduce((a, b) => a + b, 0) + parsed.modifier
    const matches = comparison === '>=' ? val >= target
      : comparison === '<=' ? val <= target
      : val === target
    if (matches) hits++
  }
  return hits / trials
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
