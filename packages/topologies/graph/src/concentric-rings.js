// Build the playable graph for a concentric-rings board: the points, which
// points are joined, and which triples form a mill.
//
// `structure: concentric-rings` already existed, but only as a rendering
// generator - `concentricRingOps` in produce-layout emits SVG for the squares,
// the spokes and the dots. Nothing derived a board you could play on, which is
// why every morris variant carried a complete engine block and still threw
// "Unknown game family".
//
// The node order here is not a free choice. It mirrors `concentricRingPoints`
// exactly, because the renderer labels its hit targets `n1..nN` by array
// position, so a different order would put the pieces somewhere other than
// where the board was drawn. Per ring, outermost first:
//
//     0 top-left      4 top-middle
//     1 top-right     5 right-middle
//     2 bottom-right  6 bottom-middle
//     3 bottom-left   7 left-middle
//
// and, for a single-ring board with midpoints, one centre point appended last,
// which is what makes three men's morris a 3x3 grid rather than a ring of 8.

const TL = 0, TR = 1, BR = 2, BL = 3, TOP = 4, RIGHT = 5, BOTTOM = 6, LEFT = 7
const PER_RING = 8

// The four sides of a ring, each as (corner, midpoint, corner). Each is a mill.
const SIDES = [
  [TL, TOP, TR],
  [TR, RIGHT, BR],
  [BR, BOTTOM, BL],
  [BL, LEFT, TL],
]

export function concentricRings(params = {}) {
  const rings = params.rings || 3
  const midpoints = params.midpoints !== false
  const diagonals = params.diagonals || false

  const id = (ring, slot) => `n${ring * PER_RING + slot + 1}`
  const centre = `n${rings * PER_RING + 1}`
  const hasCentre = rings === 1 && midpoints

  const nodes = []
  for (let ring = 0; ring < rings; ring++) {
    for (let slot = 0; slot < (midpoints ? 8 : 4); slot++) nodes.push(id(ring, slot))
  }
  if (hasCentre) nodes.push(centre)

  const edges = []
  const mills = []
  const edge = (a, b) => { if (a && b) edges.push([a, b]) }

  for (let ring = 0; ring < rings; ring++) {
    if (midpoints) {
      for (const [a, m, b] of SIDES) {
        edge(id(ring, a), id(ring, m))
        edge(id(ring, m), id(ring, b))
        mills.push([id(ring, a), id(ring, m), id(ring, b)])
      }
    } else {
      // Without midpoints a ring is a bare square: joined, but too short to
      // hold a three-in-a-row, so it contributes edges and no mills.
      edge(id(ring, TL), id(ring, TR))
      edge(id(ring, TR), id(ring, BR))
      edge(id(ring, BR), id(ring, BL))
      edge(id(ring, BL), id(ring, TL))
    }
  }

  // Spokes join the midpoint of each side to the same midpoint on the
  // neighbouring rings. With three rings those four runs are mills too.
  if (midpoints && rings > 1) {
    for (const slot of [TOP, RIGHT, BOTTOM, LEFT]) {
      for (let ring = 0; ring < rings - 1; ring++) edge(id(ring, slot), id(ring + 1, slot))
      if (rings === 3) mills.push([id(0, slot), id(1, slot), id(2, slot)])
    }
  }

  // Diagonals join the corners outward to inward, the twelve men's morris and
  // morabaraba board.
  if (diagonals && rings > 1) {
    for (const slot of [TL, TR, BR, BL]) {
      for (let ring = 0; ring < rings - 1; ring++) edge(id(ring, slot), id(ring + 1, slot))
      if (rings === 3) mills.push([id(0, slot), id(1, slot), id(2, slot)])
    }
  }

  // A single ring with midpoints is a 3x3 grid once the centre is added: the
  // centre joins the four midpoints, giving the middle row and column.
  if (hasCentre) {
    for (const slot of [TOP, RIGHT, BOTTOM, LEFT]) edge(id(0, slot), centre)
    mills.push([id(0, LEFT), centre, id(0, RIGHT)])
    mills.push([id(0, TOP), centre, id(0, BOTTOM)])
    if (diagonals) {
      edge(id(0, TL), centre); edge(id(0, BR), centre)
      edge(id(0, TR), centre); edge(id(0, BL), centre)
      mills.push([id(0, TL), centre, id(0, BR)])
      mills.push([id(0, TR), centre, id(0, BL)])
    }
  }

  return { nodes, edges, mills }
}
