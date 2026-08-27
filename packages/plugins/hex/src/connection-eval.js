// How close a connection game is to being won.
//
// A connection game has no material and nothing to count, so an evaluator
// built from piece values scores every position at exactly zero. Hex got
// precisely that: no evaluator was registered for the family, the generic
// fallback reads `state.board` as an array and a hex board is an object, so
// every position evaluated to 0 and the search chose whichever move came first
// out of `getLegalMoves`. That is not a weak opponent, it is no opponent.
//
// The obvious replacement - shortest path between the two edges, counting the
// empty cells that would have to be filled - is also no opponent. On an empty
// 11x11 board every cell lies on some shortest path, so every one of the 121
// openings shortens it by exactly one and they all score the same. Measured:
// one distinct score across the whole board.
//
// What separates them is not the length of the best route but how many routes
// there are. A cell with a single way through is a cell the opponent can take;
// a cell with two independent ways through is already as good as connected.
// The two-distance field, from Anshelevich's Hex work, is the cheapest way to
// say that: a cell's distance is its cost plus the SECOND smallest of its
// neighbours' distances, not the smallest, so a route that depends on one
// fragile link is scored as the liability it is. That is what makes the middle
// of the board worth more than the edge, and it is why the same board now
// produces a spread of opening scores instead of one repeated number.
//
// The evaluation is the difference between the two players' fields: how much
// further the opponent has to go than we do.

const UNREACHABLE = Number.POSITIVE_INFINITY
const EMPTY = []

// What it costs to pass through a cell: nothing if we already own it, one
// stone if it is empty, and impossible if the opponent is standing there.
function costOf(board, cell, player) {
  const occupant = board[cell]
  if (occupant === null || occupant === undefined) return 1
  return occupant === player ? 0 : UNREACHABLE
}

// `neighbours` is a Map of cell to its neighbouring cells, built once by the
// caller: this runs tens of thousands of times per move and rebuilding an
// adjacency array per cell per sweep dominated the cost.
//
// The two-distance field from one edge, relaxed to a fixed point. Cells
// touching the source edge take their own cost directly: an edge is wide, so
// reaching it is not the fragile single link the second-smallest rule is there
// to punish.
function twoDistanceField(board, player, cells, sourceEdge, neighbours) {
  const cost = new Map()
  const dist = new Map()
  for (const cell of cells) {
    const c = costOf(board, cell, player)
    cost.set(cell, c)
    dist.set(cell, UNREACHABLE)
  }
  for (const cell of sourceEdge) {
    const c = cost.get(cell)
    if (c !== undefined && c !== UNREACHABLE) dist.set(cell, c)
  }

  // Relaxation rather than a queue: the second-smallest rule is not a metric,
  // so a cell can improve after a neighbour it already fed. Bounded by the
  // board size, and it settles long before that on every board here.
  const limit = cells.length
  for (let sweep = 0; sweep < limit; sweep++) {
    let changed = false
    for (const cell of cells) {
      const c = cost.get(cell)
      if (c === UNREACHABLE) continue
      let best = UNREACHABLE
      let second = UNREACHABLE
      for (const next of neighbours.get(cell) || EMPTY) {
        const d = dist.get(next)
        if (d === undefined || d === UNREACHABLE) continue
        if (d < best) { second = best; best = d }
        else if (d < second) { second = d }
      }
      if (second === UNREACHABLE) continue
      const candidate = second + c
      if (candidate < dist.get(cell)) { dist.set(cell, candidate); changed = true }
    }
    if (!changed) break
  }
  return { dist, cost }
}

// What a player still needs: the cheapest cell to route everything through,
// measured from each edge they have to join. Two edges is a path through that
// cell; three edges, which is what Y asks for, is a tree meeting at it. The
// cell's own cost is counted once, not once per field.
export function stonesNeeded(board, player, needEdges, edgeCells, neighbours, cells) {
  if (!needEdges || needEdges.length < 2) return UNREACHABLE
  const sets = needEdges.map(name => edgeCells[name]).filter(Boolean)
  if (sets.length < 2) return UNREACHABLE

  const fields = sets.map(edge => twoDistanceField(board, player, cells, edge, neighbours))
  const potentials = []
  let best = UNREACHABLE
  for (const cell of cells) {
    const own = fields[0].cost.get(cell)
    if (own === undefined || own === UNREACHABLE) continue
    let total = 0
    let reachable = true
    for (const field of fields) {
      const d = field.dist.get(cell)
      if (d === UNREACHABLE) { reachable = false; break }
      total += d
    }
    if (!reachable) continue
    total -= own * (fields.length - 1)
    potentials.push(total)
    if (total < best) best = total
  }
  if (best === UNREACHABLE) return UNREACHABLE

  // Taking only the cheapest meeting cell throws away everything that makes
  // one position better than another. Two-distances are whole numbers, so the
  // cheapest route costs the same integer for most of a board and the score
  // does not move until a stone lands on exactly the right cell - measured as
  // two distinct values across 121 openings, which is no more use than one.
  //
  // What matters alongside the length is how many ways there are to achieve
  // it: a connection with six near-optimal routes cannot be cut, one with a
  // single route can. Summing exp(-excess) counts those routes, weighting a
  // route by how much worse than the best it is, and a position with more of
  // them needs correspondingly fewer stones.
  let width = 0
  for (const total of potentials) width += Math.exp(-(total - best))
  return best - ROUTE_WEIGHT * Math.log(width)
}

// How much a second route is worth against a shorter one. Small enough that
// length still decides when the two disagree.
const ROUTE_WEIGHT = 0.5

// The score the search sees, in [-1, 1]. The ends of the range are left for
// the win check: a position that is merely very good must never evaluate the
// same as a position that is won.
export function connectionScore(board, playerIndex, targets, edgeCells, neighbours, cells) {
  const list = cells || Object.keys(board)
  const mine = stonesNeeded(board, playerIndex, targets[playerIndex], edgeCells, neighbours, list)
  const theirs = stonesNeeded(board, 1 - playerIndex, targets[1 - playerIndex], edgeCells, neighbours, list)

  if (mine === UNREACHABLE && theirs === UNREACHABLE) return 0
  if (mine === UNREACHABLE) return -0.95
  if (theirs === UNREACHABLE) return 0.95

  const scale = Math.max(4, Math.sqrt(list.length))
  const raw = (theirs - mine) / scale
  return Math.max(-0.9, Math.min(0.9, raw))
}
