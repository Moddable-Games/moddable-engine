import { fileLabel, fileIndex, intersectionLabel, intersectionIndex, splitCellId } from '../packages/core/index.js'

// A file past the twenty-sixth needs two letters, and this file used to index a
// 26-character string and read one character back. On Taikyoku Shogi, 36 files
// wide, every column past `z` produced the id "undefined11" and the lookup for
// "aa11" read the file as `a` and the rank as NaN - so the board drew pieces on
// squares the page said were empty and would not let anyone select. The
// labelling lives in packages/core, which counts in bijective base-26 in both
// directions; this now asks it rather than keeping a second opinion.

/**
 * Cell addressing for grid-based topologies (chess, go, draughts, etc.)
 * Converts between integer board indices and algebraic notation (e.g. "a1", "e4").
 */
export function createCellAddressing({ rows, cols, idStyle, flipped = false, layers = 1 }) {
  if (!rows || !cols) {
    throw new Error(
      `createCellAddressing requires rows and cols for grid mode. ` +
      `Received rows=${rows}, cols=${cols}. ` +
      `For non-grid topologies (hex, graph), use createDirectAddressing instead.`
    )
  }

  const toFile = idStyle === 'go' ? intersectionLabel : fileLabel
  const fromFile = idStyle === 'go' ? intersectionIndex : fileIndex

  // A layered board draws one grid per layer side by side, and each carries the
  // layer in its id: `a8` on the first board, `a8-2` on the second. Without it
  // both boards would answer to the same id and a click on either would land on
  // the first.
  const plane = rows * cols

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
    const layer = layers > 1 ? Math.floor(logicalIdx / plane) : 0
    const withinPlane = layers > 1 ? logicalIdx % plane : logicalIdx
    const vi = visualIndex(withinPlane)
    const r = Math.floor(vi / cols)
    const c = vi % cols
    if (c < 0 || c >= cols || r < 0 || r >= rows) return null
    const base = `${toFile(c)}${rows - r}`
    return layer > 0 ? `${base}-${layer + 1}` : base
  }

  function toIndex(id) {
    if (id == null || String(id).length < 2) return -1
    const suffix = /^(.*)-(\d+)$/.exec(String(id))
    const layer = suffix ? Number(suffix[2]) - 1 : 0
    const parts = splitCellId(suffix ? suffix[1] : id)
    if (!parts) return -1
    const c = fromFile(parts.file)
    if (c < 0 || c >= cols) return -1
    const r = rows - parts.rank
    if (r < 0 || r >= rows) return -1
    if (layer < 0 || layer >= layers) return -1
    const vi = r * cols + c
    return layer * plane + logicalFromVisual(vi)
  }

  function find(logicalIdx, container) {
    const id = toId(logicalIdx)
    if (!id) return null
    return container.querySelector(`[data-sq="${id}"]`)
  }

  // getBBox reports a cell's own coordinates, which ignore any transform on an
  // ancestor. Every board of a multi-board render sits in a translated group,
  // so board B's squares report board A's positions and anything drawn from
  // them - selection, legal-move dots, fog - lands on the wrong board.
  function layerOffset(el) {
    let node = el
    while (node && node.getAttribute) {
      const t = node.getAttribute('transform')
      if (t) {
        const m = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(t)
        if (m) return { dx: Number(m[1]), dy: Number(m[2]) }
      }
      node = node.parentNode
    }
    return { dx: 0, dy: 0 }
  }

  function bbox(logicalIdx, container) {
    const el = find(logicalIdx, container)
    if (!el || !el.getBBox) return null
    const b = el.getBBox()
    const { dx, dy } = layerOffset(el)
    return (dx || dy) ? { x: b.x + dx, y: b.y + dy, width: b.width, height: b.height } : b
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
