// Browser consumers: packages/render/src/render-engine.js, packages/schema/src/produce-layout.js
export function buildCrossMap(rows, cols, castles) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null))
  const midR = Math.floor(rows / 2), midC = Math.floor(cols / 2), half = 1
  for (let r = 0; r < midR - half; r++) for (let c = midC - half; c <= midC + half; c++) grid[r][c] = 'floor'
  for (let r = midR + half + 1; r < rows; r++) for (let c = midC - half; c <= midC + half; c++) grid[r][c] = 'floor'
  for (let c = 0; c < midC - half; c++) for (let r = midR - half; r <= midR + half; r++) grid[r][c] = 'floor'
  for (let c = midC + half + 1; c < cols; c++) for (let r = midR - half; r <= midR + half; r++) grid[r][c] = 'floor'
  for (let r = midR - half; r <= midR + half; r++) for (let c = midC - half; c <= midC + half; c++) grid[r][c] = 'home'
  for (const [r, c] of castles) {
    if (r >= 0 && r < rows && c >= 0 && c < cols) grid[r][c] = 'castle'
  }
  return grid
}
