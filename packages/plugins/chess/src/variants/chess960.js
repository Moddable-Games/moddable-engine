import { createRng } from '../../../../core/src/rng.js'

function randomBackRank960(rng) {
  const pieces = Array(8).fill(null)
  const empty = () => pieces.map((p, i) => p === null ? i : -1).filter(i => i >= 0)
  const darkSqs = [0, 2, 4, 6], lightSqs = [1, 3, 5, 7]
  pieces[darkSqs[rng.nextInt(0, 3)]] = 'b'
  pieces[lightSqs[rng.nextInt(0, 3)]] = 'b'
  let e = empty(); pieces[e[rng.nextInt(0, e.length - 1)]] = 'q'
  e = empty(); pieces[e[rng.nextInt(0, e.length - 1)]] = 'n'
  e = empty(); pieces[e[rng.nextInt(0, e.length - 1)]] = 'n'
  e = empty()
  pieces[e[0]] = 'r'; pieces[e[1]] = 'k'; pieces[e[2]] = 'r'
  return pieces.join('')
}

export const chess960 = {
  key: 'chess960',
  setup(rng) {
    if (!rng) rng = createRng(960)
    const rank = randomBackRank960(rng)
    return rank + '/pppppppp/8/8/8/8/PPPPPPPP/' + rank.toUpperCase()
  },
}
