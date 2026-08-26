// Hex board shapes, and the edges a connection game has to join.
//
// The rhombus generator existed but keyed on `size`, while every hex variant in
// the corpus declares `rows` and `cols`, so the board came out with zero cells.
// The triangular generator did not exist here at all - it lived in
// render-engine.js as `generateTriangularHexGrid`, six lines that could draw a Y
// board but not play on one. Both are geometry, so both belong with the
// topology, and the renderer now imports rather than repeats.

export function rhombusCells(size) {
  const cells = []
  for (let q = 0; q < size; q++) for (let r = 0; r < size; r++) cells.push({ q, r })
  return cells
}

// Row 0 is the apex, one cell; row n has n + 1 cells. Side length s gives
// s(s + 1) / 2 cells: 45, 78 and 120 for the three Y boards in the corpus.
export function triangularCells(sideLength) {
  const cells = []
  for (let row = 0; row < sideLength; row++) {
    for (let i = 0; i <= row; i++) cells.push({ q: -row + i, r: row })
  }
  return cells
}

// The edges a connection game joins, by name. A rhombus has two opposing pairs,
// and which pair belongs to which player is the plugin's business, not the
// board's. A triangle has three, and Y asks for all of them at once.
export function shapeEdges(shape, dims) {
  if (shape === 'rhombus') {
    const size = dims.size
    return {
      north: rhombusCells(size).filter(c => c.r === 0),
      south: rhombusCells(size).filter(c => c.r === size - 1),
      west: rhombusCells(size).filter(c => c.q === 0),
      east: rhombusCells(size).filter(c => c.q === size - 1),
    }
  }
  if (shape === 'triangular') {
    const s = dims.sideLength
    const all = triangularCells(s)
    return {
      // The apex sits in both slanted edges, which is correct: a stone there
      // touches two sides at once.
      left: all.filter(c => c.q === -c.r),
      right: all.filter(c => c.q === 0),
      base: all.filter(c => c.r === s - 1),
    }
  }
  return {}
}
