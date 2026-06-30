export const schema = {
  type: 'standard',
  componentType: 'dice',
  required: [],
}

export function createStandardDice(config = {}) {
  const { count = 2, faces = 6, doublesMultiplier = 2 } = config

  function roll(rng) {
    const results = []
    for (let i = 0; i < count; i++) {
      results.push(rng.nextInt(1, faces))
    }
    return results
  }

  function isDoubles(results) {
    if (results.length < 2) return false
    return results.every(r => r === results[0])
  }

  function movesFromRoll(results) {
    if (isDoubles(results)) {
      const moves = []
      for (let i = 0; i < count * doublesMultiplier; i++) {
        moves.push(results[0])
      }
      return moves
    }
    return [...results]
  }

  function total(results) {
    return results.reduce((sum, r) => sum + r, 0)
  }

  function max(results) {
    return Math.max(...results)
  }

  function min(results) {
    return Math.min(...results)
  }

  return {
    count,
    faces,
    doublesMultiplier,
    roll,
    isDoubles,
    movesFromRoll,
    total,
    max,
    min,
  }
}
