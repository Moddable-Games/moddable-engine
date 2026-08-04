const STANDARD_ALPHA = 'abcdefghijklmnopqrstuvwxyz'
const GO_ALPHA = 'abcdefghjklmnopqrst'

/**
 * Cell addressing for grid-based topologies (chess, go, draughts, etc.)
 * Converts between integer board indices and algebraic notation (e.g. "a1", "e4").
 */
export function createCellAddressing({ rows, cols, idStyle, flipped = false }) {
  if (!rows || !cols) {
    throw new Error(
      `createCellAddressing requires rows and cols for grid mode. ` +
      `Received rows=${rows}, cols=${cols}. ` +
      `For non-grid topologies (hex, graph), use createDirectAddressing instead.`
    )
  }

  const alpha = idStyle === 'go' ? GO_ALPHA : STANDARD_ALPHA

  function visualIndex(logicalIdx) {
    if (!flipped) return logicalIdx
    const r = Math.floor(logicalIdx / cols)
    const c = logicalIdx % cols
    return (rows - 1 - r) * cols + (cols - 1 - c)
  }

  function logicalFromVisual(visualIdx) {
    if (!flipped) return visualIdx
    const r = Math.floor(visualIdx / cols)
    const c = visualIdx % cols
    return (rows - 1 - r) * cols + (cols - 1 - c)
  }

  function toId(logicalIdx) {
    const vi = visualIndex(logicalIdx)
    const r = Math.floor(vi / cols)
    const c = vi % cols
    if (c < 0 || c >= cols || r < 0 || r >= rows) return null
    return `${alpha[c]}${rows - r}`
  }

  function toIndex(id) {
    if (id == null || id.length < 2) return -1
    const c = alpha.indexOf(id[0])
    if (c < 0) return -1
    const r = rows - parseInt(id.slice(1), 10)
    if (r < 0 || r >= rows) return -1
    const vi = r * cols + c
    return logicalFromVisual(vi)
  }

  function find(logicalIdx, container) {
    const id = toId(logicalIdx)
    if (!id) return null
    return container.querySelector(`[data-sq="${id}"]`)
  }

  function bbox(logicalIdx, container) {
    const el = find(logicalIdx, container)
    if (!el || !el.getBBox) return null
    return el.getBBox()
  }

  function centre(logicalIdx, container) {
    const b = bbox(logicalIdx, container)
    if (!b) return null
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height }
  }

  function setFlipped(f) {
    flipped = f
  }

  return {
    mode: 'grid',
    toId,
    toIndex,
    find,
    bbox,
    centre,
    setFlipped,
    get flipped() { return flipped },
  }
}

/**
 * Cell addressing for non-grid topologies (hex, graph, etc.)
 * Uses string keys directly — the SVG data-sq attribute IS the cell identifier,
 * matching the keys used by plugin moves (e.g. "0,1" for hex axial coordinates).
 * No coordinate computation; just direct DOM lookup by key.
 */
export function createDirectAddressing({ flipped = false } = {}) {

  // In direct mode, the "id" IS the key (e.g. "0,1" for hex)
  function toId(key) {
    return typeof key === 'number' ? null : key
  }

  // In direct mode, the "index" IS the key string
  function toIndex(id) {
    return id
  }

  function find(key, container) {
    if (key == null) return null
    return container.querySelector(`[data-sq="${key}"]`)
  }

  function bbox(key, container) {
    const el = find(key, container)
    if (!el || !el.getBBox) return null
    return el.getBBox()
  }

  function centre(key, container) {
    const b = bbox(key, container)
    if (!b) return null
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height }
  }

  function setFlipped(f) {
    flipped = f
  }

  return {
    mode: 'direct',
    toId,
    toIndex,
    find,
    bbox,
    centre,
    setFlipped,
    get flipped() { return flipped },
  }
}
