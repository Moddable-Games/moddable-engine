// The cross-shaped point board (Asalto, Fox and Geese) as a board you can play
// on: its points, the lines joining them, which points are the fortress, and
// where each lies on the grid, so a jump can be told to go straight.
//
// The renderer draws the same points from this and names its hit targets
// `n1..nN` in the same order, so the two cannot disagree about which point is
// which.

// The frame used when no `rows` are declared: the 33-point cross.
export const DEFAULT_GRID_CROSS = {
  rows: [[2,3,4],[2,3,4],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[0,1,2,3,4,5,6],[2,3,4],[2,3,4]],
  fortressRows: 2, fortressExtraRow: 2, fortressCols: [2,3,4],
}

// Points as `{ name, x, y, fortress }`, where `x` is the column and `y` the
// row, and the lines between them as index pairs.
export function gridCrossPoints(params = {}) {
  const gridDef = params.rows ? params : DEFAULT_GRID_CROSS
  const points = [], edges = []
  const rowDefs = gridDef.rows.map((cols, y) => ({ cols, y }))
  const fortressRowCount = gridDef.fortressRows || 2
  const fortressExtraRow = gridDef.fortressExtraRow
  const fortressCols = gridDef.fortressCols || null
  const at = {}
  for (const row of rowDefs) {
    for (const col of row.cols) {
      const idx = points.length
      at[`${row.y},${col}`] = idx
      const fortress = row.y < fortressRowCount || (row.y === fortressExtraRow && Boolean(fortressCols && fortressCols.includes(col)))
      points.push({ name: `n${idx + 1}`, x: col, y: row.y, fortress })
    }
  }
  for (const row of rowDefs) {
    for (let i = 0; i < row.cols.length - 1; i++) {
      if (row.cols[i + 1] - row.cols[i] === 1) edges.push([at[`${row.y},${row.cols[i]}`], at[`${row.y},${row.cols[i + 1]}`]])
    }
  }
  for (let ri = 0; ri < rowDefs.length - 1; ri++) {
    const r1 = rowDefs[ri], r2 = rowDefs[ri + 1]
    for (const col of r1.cols) { if (r2.cols.includes(col)) edges.push([at[`${r1.y},${col}`], at[`${r2.y},${col}`]]) }
  }
  for (let ri = 0; ri < rowDefs.length - 1; ri++) {
    const r1 = rowDefs[ri], r2 = rowDefs[ri + 1]
    for (const col of r1.cols) {
      if (r1.cols.includes(col + 1) && r2.cols.includes(col) && r2.cols.includes(col + 1)) {
        edges.push([at[`${r1.y},${col}`], at[`${r2.y},${col + 1}`]])
        edges.push([at[`${r1.y},${col + 1}`], at[`${r2.y},${col}`]])
      }
    }
  }
  for (const extra of gridDef.extraNodes || []) {
    const idx = points.length
    points.push({ name: `n${idx + 1}`, x: extra.col, y: extra.row, fortress: Boolean(extra.fortress) })
    for (const target of extra.connectsTo) {
      const tIdx = at[`${target[0]},${target[1]}`]
      if (tIdx !== undefined) edges.push([idx, tIdx])
    }
  }
  return { points, edges, at }
}

// The same board as a graph: named nodes and named edges.
export function gridCrossGraph(params = {}) {
  const { points, edges } = gridCrossPoints(params)
  return { nodes: points, edges: edges.map(([a, b]) => [points[a].name, points[b].name]) }
}
