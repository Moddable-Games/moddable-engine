import { createRng } from '../../../core/index.js'

// The one piece of knowledge a Hex rollout is given, and no more.
//
// A Hex rollout that fills the board at random is a surprisingly good estimator,
// because the board always resolves to exactly one winner. It is also blind to
// the single most common shape in the game: the bridge.
//
// Two stones of the same colour a diagonal apart are joined by two empty cells,
// either of which completes the link. They are already connected in every sense
// that matters, because if the opponent takes one the owner takes the other. A
// random rollout does not know that, so it spends its simulations discovering
// by accident what every Hex player knows on sight.
//
// MoHex, the reference MCTS Hex player, adds exactly this and nothing else to
// its playouts: "if a player probes any opponent bridge, then the opponent
// always replies so as to maintain the connection".
//   Monte Carlo Tree Search in Hex, Arneson, Hayward and Henderson
//   https://webdocs.cs.ualberta.ca/~hayward/papers/mcts-hex.pdf
//
// It rules nothing out. Every legal move stays reachable; the policy only
// changes which one a rollout reaches for first. That distinction matters:
// pruning by "looks unpromising" is a search declining to look, and the same
// paper is careful to prune only cells that are PROVABLY useless. This is not
// pruning at all.

// Which cells carry a bridge, worked out once per board from the board itself.
//
// Derived from the cell keys rather than handed in from the plugin instance.
// The first version reached the map across through a module-level variable set
// by whichever board was built last, which is precisely the hidden coupling
// this codebase keeps removing: a policy that silently depends on construction
// order and breaks the moment two boards exist at once.
//
// Hex cells are axial "q,r". Neighbours are the six unit steps; a bridge spans
// one of the six diagonals, and its two carriers are the cells adjacent to both
// ends.
const STEPS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
const DIAGONALS = [[2, -1], [1, -2], [-1, -1], [-2, 1], [-1, 2], [1, 1]]

function parseKey(key) {
  const comma = key.indexOf(',')
  if (comma < 0) return null
  const q = Number(key.slice(0, comma))
  const r = Number(key.slice(comma + 1))
  return Number.isFinite(q) && Number.isFinite(r) ? [q, r] : null
}

export function buildBridgeMap(cellKeys) {
  const present = new Set(cellKeys)
  const carriers = new Map()

  for (const key of cellKeys) {
    const axial = parseKey(key)
    if (!axial) continue
    const [q, r] = axial
    for (const [dq, dr] of DIAGONALS) {
      const far = `${q + dq},${r + dr}`
      if (!present.has(far)) continue
      // The two cells adjacent to both ends. On a hex grid a diagonal always
      // has exactly two, unless the board edge removes one.
      const shared = []
      for (const [sq, sr] of STEPS) {
        const mid = `${q + sq},${r + sr}`
        if (!present.has(mid)) continue
        const [mq, mr] = parseKey(mid)
        for (const [tq, tr] of STEPS) {
          if (`${mq + tq},${mr + tr}` === far) { shared.push(mid); break }
        }
      }
      if (shared.length !== 2) continue
      const link = { a: key, b: far }
      if (!carriers.has(shared[0])) carriers.set(shared[0], [])
      if (!carriers.has(shared[1])) carriers.set(shared[1], [])
      carriers.get(shared[0]).push({ ...link, other: shared[1] })
      carriers.get(shared[1]).push({ ...link, other: shared[0] })
    }
  }
  return carriers
}

// `random` is injected so a rollout is reproducible from a seed, the same rule
// the purity guard holds the rest of the engine to.
//
// The first version fell back to the ambient generator when nothing was
// injected, inside a function whose own comment claimed to follow that rule.
// `no-ambient-random.test.js` caught it, which is the guard doing exactly its
// job. With nothing supplied it now seeds its own, so a policy stays
// reproducible within an instance instead of drawing from global state - the
// same shape `createGoPlayoutPolicy` already uses.
export function createBridgePolicy(random) {
  const pick = random || (() => { const r = createRng(1); return () => r.next() })()
  let bridgeMap = null
  let builtFor = 0

  return function bridgeRolloutPolicy(slice, playerIndex, legalMoves) {
    if (!legalMoves || legalMoves.length === 0) return null
    const board = slice && slice.board
    if (!board) return legalMoves[Math.floor(pick() * legalMoves.length)]

    const keys = Object.keys(board)
    if (!bridgeMap || builtFor !== keys.length) {
      bridgeMap = buildBridgeMap(keys)
      builtFor = keys.length
    }

    const probed = slice.lastPlaced
    if (probed !== undefined && probed !== null) {
      const through = bridgeMap.get(probed)
      if (through) {
        for (let i = 0; i < through.length; i++) {
          const link = through[i]
          // Mine at both ends, and the other way through still open.
          if (board[link.a] !== playerIndex) continue
          if (board[link.b] !== playerIndex) continue
          const other = board[link.other]
          if (other !== null && other !== undefined) continue
          for (let m = 0; m < legalMoves.length; m++) {
            if (legalMoves[m].to === link.other) return legalMoves[m]
          }
        }
      }
    }

    return legalMoves[Math.floor(pick() * legalMoves.length)]
  }
}
