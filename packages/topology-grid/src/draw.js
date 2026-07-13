/**
 * Shared drawing primitives for grid providers (issue #18).
 *
 * These are the identical loops that were copy-pasted across providers.js.
 * Extraction contract: byte-identical SVG output — every function here
 * reproduces the exact string (attribute order, spacing, grouping) of the
 * provider code it replaced. `node scripts/snapshot-boards.mjs --diff`
 * (284 variants) must pass after every change to this file.
 *
 * Deliberately NOT extracted:
 * - alquerque's dot-marker + hit-target loop (interleaved per cell —
 *   splitting it into two passes would reorder elements and break
 *   byte-identity)
 * - surakarta's nested background frame (rx precedes fill in its
 *   attribute order, unlike every other provider — not copy-pasta)
 *
 * No game knowledge lives here: no game names, no variant branches,
 * no hardcoded positions. Parameters in, SVG strings out.
 */

/** Go-style column alphabet (skips 'i'). */
export const GO_LETTERS = 'abcdefghjklmnopqrst'

/** Algebraic square id: 'a1' is bottom-left. */
export function algebraicId(r, c, rows) {
  return String.fromCharCode(97 + c) + (rows - r)
}

/** Go-style square id: same rank math, GO_LETTERS files. */
export function goId(r, c, rows) {
  return GO_LETTERS[c] + (rows - r)
}

/**
 * Background rect: x, y, width, height, fill, then optional rx.
 * (Providers whose rx precedes fill keep their rects inline.)
 */
export function drawBackground(parts, { x, y, width, height, fill, rx }) {
  parts.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"${rx != null ? ` rx="${rx}"` : ''}/>`)
}

/**
 * Grouped intersection grid lines: horizontal then vertical, stroke
 * attributes on the wrapping <g>. Used by go, surakarta, shogi, and
 * xiangqi (riverless boards).
 */
export function drawIntersectionGridLines(parts, { gx, gy, gridW, gridH, rows, cols, tileSize, color, width }) {
  parts.push(`<g stroke="${color}" stroke-width="${width}">`)
  for (let r = 0; r < rows; r++) {
    const y = gy + r * tileSize
    parts.push(`<line x1="${gx}" y1="${y}" x2="${gx + gridW}" y2="${y}"/>`)
  }
  for (let c = 0; c < cols; c++) {
    const x = gx + c * tileSize
    parts.push(`<line x1="${x}" y1="${gy}" x2="${x}" y2="${gy + gridH}"/>`)
  }
  parts.push('</g>')
}

/**
 * Ungrouped intersection grid lines: horizontal then vertical, stroke
 * attributes on each <line>. Used by alquerque.
 */
export function drawIntersectionGridLinesAttr(parts, { gx, gy, gridW, gridH, rows, cols, tileSize, color, width }) {
  for (let r = 0; r < rows; r++) parts.push(`<line x1="${gx}" y1="${gy + r * tileSize}" x2="${gx + gridW}" y2="${gy + r * tileSize}" stroke="${color}" stroke-width="${width}"/>`)
  for (let c = 0; c < cols; c++) parts.push(`<line x1="${gx + c * tileSize}" y1="${gy}" x2="${gx + c * tileSize}" y2="${gy + gridH}" stroke="${color}" stroke-width="${width}"/>`)
}

/**
 * Ungrouped tile-boundary grid lines: vertical then horizontal, inclusive
 * (rows+1 / cols+1 lines), stroke attributes on each <line>. Used by
 * mono-grid.
 */
export function drawTileGridLines(parts, { ox, oy, rows, cols, tileSize, color, width }) {
  const bw = cols * tileSize, bh = rows * tileSize
  for (let c = 0; c <= cols; c++) {
    const x = ox + c * tileSize
    parts.push(`<line x1="${x}" y1="${oy}" x2="${x}" y2="${oy + bh}" stroke="${color}" stroke-width="${width}"/>`)
  }
  for (let r = 0; r <= rows; r++) {
    const y = oy + r * tileSize
    parts.push(`<line x1="${ox}" y1="${y}" x2="${ox + bw}" y2="${y}" stroke="${color}" stroke-width="${width}"/>`)
  }
}

/**
 * Grouped transparent hit-target circles at intersections. Used by go,
 * surakarta (goId), xiangqi, shogi (algebraicId).
 */
export function drawHitTargetCircles(parts, { gx, gy, rows, cols, tileSize, radius, id }) {
  parts.push('<g fill="transparent">')
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      parts.push(`<circle cx="${gx + c * tileSize}" cy="${gy + r * tileSize}" r="${radius}" class="board-cell" data-sq="${id(r, c, rows)}"/>`)
    }
  }
  parts.push('</g>')
}

/**
 * Transparent hit-target rects over tiles (algebraic ids). Used by
 * mono-grid.
 */
export function drawHitTargetRects(parts, { ox, oy, rows, cols, tileSize }) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sq = algebraicId(r, c, rows)
      parts.push(`<rect x="${ox + c * tileSize}" y="${oy + r * tileSize}" width="${tileSize}" height="${tileSize}" fill="transparent" data-sq="${sq}" class="board-cell"/>`)
    }
  }
}
