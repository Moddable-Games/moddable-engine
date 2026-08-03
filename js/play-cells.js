const STANDARD_ALPHA = 'abcdefghijklmnopqrstuvwxyz'
const GO_ALPHA = 'abcdefghjklmnopqrst'

export function createCellAddressing({ rows, cols, idStyle, flipped = false }) {
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

  return { toId, toIndex, find, bbox, centre, setFlipped, get flipped() { return flipped } }
}
