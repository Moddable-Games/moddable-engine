export function randomBackRank(rng, opts = {}) {
  const width = opts.width || 8
  const castling = opts.castling !== false
  const pieceList = opts.pieces || extractPieceList(width)

  const pieces = Array(width).fill(null)
  const empty = () => pieces.map((p, i) => p === null ? i : -1).filter(i => i >= 0)

  const bishops = pieceList.filter(p => p === 'b')
  if (bishops.length >= 2) {
    const darkSqs = Array.from({ length: width }, (_, i) => i).filter(i => i % 2 === 0)
    const lightSqs = Array.from({ length: width }, (_, i) => i).filter(i => i % 2 === 1)
    pieces[darkSqs[rng.nextInt(0, darkSqs.length - 1)]] = 'b'
    pieces[lightSqs[rng.nextInt(0, lightSqs.length - 1)]] = 'b'
  } else {
    for (const b of bishops) {
      const e = empty()
      pieces[e[rng.nextInt(0, e.length - 1)]] = b
    }
  }

  const remaining = pieceList.filter(p => p !== 'b' && p !== 'k' && p !== 'r')
  for (const piece of remaining) {
    const e = empty()
    pieces[e[rng.nextInt(0, e.length - 1)]] = piece
  }

  const rooks = pieceList.filter(p => p === 'r')
  const king = pieceList.includes('k') ? 'k' : null

  if (castling && king && rooks.length >= 2) {
    const e = empty()
    pieces[e[0]] = 'r'
    pieces[e[1]] = 'k'
    pieces[e[2]] = 'r'
    for (let i = 3; i < rooks.length; i++) {
      if (e[i + 1] !== undefined) pieces[e[i + 1]] = 'r'
    }
  } else {
    if (king) {
      const e = empty()
      pieces[e[rng.nextInt(0, e.length - 1)]] = 'k'
    }
    for (const r of rooks) {
      const e = empty()
      if (e.length) pieces[e[rng.nextInt(0, e.length - 1)]] = r
    }
  }

  return pieces.join('')
}

function extractPieceList(width) {
  if (width === 8) return ['r', 'n', 'b', 'q', 'b', 'n', 'r', 'k']
  if (width === 10) return ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r', 'a', 'c']
  const list = ['r', 'k', 'r']
  for (let i = 3; i < width; i++) list.push('n')
  return list
}

export const chess960 = {
  key: 'chess960',
  setup(rng) {
    const rank = randomBackRank(rng)
    return rank + '/pppppppp/8/8/8/8/PPPPPPPP/' + rank.toUpperCase()
  },
}
