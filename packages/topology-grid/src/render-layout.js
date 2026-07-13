/**
 * Grid render pipeline — ONE parametric renderer for every grid board (#18).
 *
 * The notation is an ordered list of drawing ops (GridBoardLayout.ops).
 * The pipeline walks the list once and emits structured SVG elements
 * ({tag, attrs, text?, children?}). It never branches on game, variant,
 * provider, or board style. If a new game needs a new branch here, the
 * consolidation has failed — extend the op vocabulary parametrically
 * instead.
 *
 * Op vocabulary (all game-agnostic):
 *   rect          — raw rect, attrs in given (insertion) order
 *   element       — raw element (path, text, line, ...)
 *   group         — <g attrs>children</g>, children are raw elements
 *   cells         — per-cell iteration: fill fn (+ optional interleaved
 *                   per-cell decorations fn); fill returns null (skip),
 *                   a colour string, or {fill, stroke, strokeWidth, type}
 *   cell-decorations — separate per-cell decoration pass
 *   zone-cells    — cell lists flood-clustered into bounding rects
 *   zone-ranges   — row/col range rects
 *   grid-lines    — h/v lines: tile|intersection, grouped|per-line attrs,
 *                   hv|vh order, skip/append rows, split columns
 *   diagonals     — per-cell-pair X lines from a predicate
 *   markers       — circles at positions; optionally grouped, optionally
 *                   with an interleaved hit-target circle per marker
 *   texts         — positioned text elements
 *   hit-targets   — transparent interaction targets (grouped circles,
 *                   bare rects), emitted to elements and/or cells[]
 *
 * Attribute order is insertion order and is part of the contract:
 * the studio snapshot suite (284 boards) requires byte-identical SVG.
 *
 * Game data (star point positions, promotion zones, river text, arc
 * geometry, palace lines) NEVER lives here — it arrives inside ops,
 * built by the bridge layer today and by frontmatter via produce() later.
 */

const GO_ALPHABET = 'abcdefghjklmnopqrst'

export function algebraicId(r, c, rows) {
  return String.fromCharCode(97 + c) + (rows - r)
}

export function goId(r, c, rows) {
  return GO_ALPHABET[c] + (rows - r)
}

function idFn(idStyle) {
  if (typeof idStyle === 'function') return idStyle
  if (idStyle === 'go') return goId
  return algebraicId
}

/** Generic flood-fill clustering of [r,c] cell lists (orthogonal adjacency). */
export function clusterCells(cells) {
  if (!cells.length) return []
  const key = (r, c) => `${r},${c}`
  const set = new Set(cells.map(([r, c]) => key(r, c)))
  const visited = new Set()
  const clusters = []
  for (const [r, c] of cells) {
    const k = key(r, c)
    if (visited.has(k)) continue
    const cluster = []
    const queue = [[r, c]]
    while (queue.length) {
      const [cr, cc] = queue.pop()
      const ck = key(cr, cc)
      if (visited.has(ck) || !set.has(ck)) continue
      visited.add(ck)
      cluster.push([cr, cc])
      queue.push([cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1])
    }
    if (cluster.length) clusters.push(cluster)
  }
  return clusters
}

/**
 * renderGridLayout(rows, cols, config) → { width, height, elements, cells, labels, tileSize, ox, oy }
 *
 * config:
 *   tileSize, positionType ('square'|'intersection'), inset,
 *   origin {x, y}  — top-left of the board area (frame origin),
 *   size {width, height} — optional explicit dimensions,
 *   ops []         — the ordered drawing operations,
 *   labels {}      — optional coordinate label config (legacy path).
 *
 * Legacy declarative configs (backgrounds/cellFill/lines/... without ops)
 * are normalized into an ops list with the historical fixed order.
 */
export function renderGridLayout(rows, cols, config = {}) {
  const norm = config.ops ? config : normalizeLegacyConfig(rows, cols, config)
  const {
    tileSize = 56,
    positionType = 'square',
    ops = [],
  } = norm

  const isIntersection = positionType === 'intersection'
  const inset = norm.inset != null ? norm.inset : (isIntersection ? Math.round(tileSize * 0.5) : 0)
  const origin = norm.origin || { x: 0, y: 0 }

  // Grid geometry: gx/gy is the origin of the grid itself (inside any inset).
  const gridW = isIntersection ? (cols - 1) * tileSize : cols * tileSize
  const gridH = isIntersection ? (rows - 1) * tileSize : rows * tileSize
  const gx = origin.x + (isIntersection ? inset : 0)
  const gy = origin.y + (isIntersection ? inset : 0)
  const halfCell = isIntersection ? 0 : tileSize / 2

  const posX = (c) => gx + c * tileSize + halfCell
  const posY = (r) => gy + r * tileSize + halfCell

  const geom = { rows, cols, tileSize, isIntersection, inset, origin, gridW, gridH, gx, gy, posX, posY }

  const elements = []
  const cells = []

  for (const op of ops) {
    OP_HANDLERS[op.op](op, geom, elements, cells)
  }

  // Dimensions: explicit, or derived (legacy formula).
  const boardW = gridW + (isIntersection ? inset * 2 : 0)
  const boardH = gridH + (isIntersection ? inset * 2 : 0)
  const width = norm.size ? norm.size.width : boardW + origin.x * 2
  const height = norm.size ? norm.size.height : boardH + origin.y * 2

  // Coordinate labels (legacy path — the studio shell draws its own).
  const labels = []
  if (norm.labels && norm.labels.show) {
    const lc = norm.labels
    const bottomY = origin.y + boardH + origin.y * 0.65
    const leftX = origin.x * 0.5
    for (let c = 0; c < cols; c++) {
      const text = lc.alphabet ? lc.alphabet[c] : String.fromCharCode(97 + c)
      labels.push({ tag: 'text', attrs: { x: posX(c), y: bottomY, 'text-anchor': 'middle', 'font-size': lc.fontSize, fill: lc.color, 'font-family': lc.fontFamily }, text })
    }
    for (let r = 0; r < rows; r++) {
      labels.push({ tag: 'text', attrs: { x: leftX, y: posY(r), 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': lc.fontSize, fill: lc.color, 'font-family': lc.fontFamily }, text: String(rows - r) })
    }
  }

  return { width, height, elements, cells, labels, tileSize, ox: gx, oy: gy }
}

// ─── Op handlers — each is a pure drawing primitive ─────────────────────────

const OP_HANDLERS = {

  rect(op, geom, elements) {
    elements.push({ tag: 'rect', attrs: op.attrs })
  },

  element(op, geom, elements) {
    elements.push({ tag: op.tag, attrs: op.attrs, text: op.text, children: op.children })
  },

  group(op, geom, elements) {
    if (op.skipEmpty && (!op.children || op.children.length === 0)) return
    elements.push({ tag: 'g', attrs: op.attrs, children: op.children })
  },

  cells(op, geom, elements, cells) {
    const { rows, cols, tileSize, origin } = geom
    const id = idFn(op.idStyle)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = op.fill(r, c)
        if (cell == null) continue
        const x = origin.x + c * tileSize
        const y = origin.y + r * tileSize
        const attrs = { x, y, width: tileSize, height: tileSize }
        if (typeof cell === 'string') {
          attrs.fill = cell
        } else {
          attrs.fill = cell.fill
          if (cell.stroke !== undefined) {
            attrs.stroke = cell.stroke
            attrs['stroke-width'] = cell.strokeWidth
          }
        }
        if (op.interactive) {
          attrs['data-sq'] = id(r, c, rows)
          if (typeof cell === 'object' && cell.type !== undefined) attrs['data-type'] = cell.type
          attrs.class = 'board-cell'
        }
        elements.push({ tag: 'rect', attrs })
        if (op.interactive) cells.push({ id: attrs['data-sq'], x: geom.posX(c), y: geom.posY(r) })
        if (op.decorations) {
          const decs = op.decorations(r, c, geom.posX(c), geom.posY(r), tileSize)
          if (decs) for (const d of decs) elements.push(d)
        }
      }
    }
  },

  'cell-decorations'(op, geom, elements) {
    const { rows, cols, tileSize } = geom
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const decs = op.fn(r, c, geom.posX(c), geom.posY(r), tileSize)
        if (decs) for (const d of decs) elements.push(d)
      }
    }
  },

  'zone-cells'(op, geom, elements) {
    const { tileSize, gx, gy } = geom
    for (const zone of op.zones) {
      if (!zone || !zone.cells || !zone.cells.length) continue
      const fill = zone.fill
      const opacity = zone.opacity
      for (const cluster of clusterCells(zone.cells)) {
        const rs = cluster.map(c => c[0])
        const cs = cluster.map(c => c[1])
        const minR = Math.min(...rs), maxR = Math.max(...rs)
        const minC = Math.min(...cs), maxC = Math.max(...cs)
        elements.push({ tag: 'rect', attrs: {
          x: gx + minC * tileSize,
          y: gy + minR * tileSize,
          width: Math.max((maxC - minC) * tileSize, tileSize),
          height: Math.max((maxR - minR) * tileSize, tileSize),
          fill, opacity,
        } })
      }
    }
  },

  'zone-ranges'(op, geom, elements) {
    const { rows, cols, tileSize, posX, posY } = geom
    for (const zone of op.zones) {
      elements.push({ tag: 'rect', attrs: {
        x: posX(zone.fromCol || 0),
        y: posY(zone.fromRow || 0),
        width: ((zone.toCol || cols - 1) - (zone.fromCol || 0)) * tileSize,
        height: ((zone.toRow || rows - 1) - (zone.fromRow || 0)) * tileSize,
        fill: zone.fill,
      } })
    }
  },

  'grid-lines'(op, geom, elements) {
    const { rows, cols, tileSize, isIntersection, gx, gy, gridW, gridH, posX, posY } = geom
    const stroke = op.color
    const width = op.width
    const grouped = op.grouped === true
    const out = grouped ? [] : elements
    const line = (x1, y1, x2, y2) => {
      const attrs = { x1, y1, x2, y2 }
      if (!grouped) { attrs.stroke = stroke; attrs['stroke-width'] = width }
      out.push({ tag: 'line', attrs })
    }

    const horizontals = () => {
      const skip = new Set(op.skipRows || [])
      const rMax = isIntersection ? rows : rows + 1
      for (let r = 0; r < rMax; r++) {
        if (skip.has(r)) continue
        const y = isIntersection ? posY(r) : gy + r * tileSize
        line(gx, y, gx + gridW, y)
      }
      for (const r of op.appendRows || []) {
        const y = isIntersection ? posY(r) : gy + r * tileSize
        line(gx, y, gx + gridW, y)
      }
    }

    const verticals = () => {
      const cMax = isIntersection ? cols : cols + 1
      for (let c = 0; c < cMax; c++) {
        const x = isIntersection ? posX(c) : gx + c * tileSize
        if (op.split && isIntersection) {
          const isEdge = op.split.edgeCols ? op.split.edgeCols.includes(c) : (c === 0 || c === cols - 1)
          if (isEdge) {
            line(x, gy, x, gy + gridH)
          } else {
            line(x, gy, x, posY(op.split.topRow))
            line(x, posY(op.split.bottomRow), x, gy + gridH)
          }
        } else {
          line(x, gy, x, gy + gridH)
        }
      }
    }

    if (op.order === 'vh') { verticals(); horizontals() } else { horizontals(); verticals() }

    if (grouped) {
      elements.push({ tag: 'g', attrs: { stroke, 'stroke-width': width }, children: out })
    }
  },

  diagonals(op, geom, elements) {
    const { rows, cols, posX, posY } = geom
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        if (!op.predicate(r, c)) continue
        const x1 = posX(c), y1 = posY(r)
        const x2 = posX(c + 1), y2 = posY(r + 1)
        if (op.forward !== false) elements.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: op.color, 'stroke-width': op.width } })
        if (op.backward !== false) elements.push({ tag: 'line', attrs: { x1: x2, y1, x2: x1, y2, stroke: op.color, 'stroke-width': op.width } })
      }
    }
  },

  markers(op, geom, elements, cells) {
    const { rows, cols, posX, posY } = geom
    let items = op.items
    if (op.allCells) {
      items = []
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) items.push([r, c])
    }
    if (!items || items.length === 0) return

    const emit = (list) => {
      const id = op.hits ? idFn(op.hits.idStyle) : null
      for (const marker of items) {
        const [r, c] = Array.isArray(marker) ? marker : [marker.r, marker.c]
        const cx = posX(c), cy = posY(r)
        const attrs = { cx, cy, r: (Array.isArray(marker) ? undefined : marker.radius) || op.radius }
        if (op.itemFill !== undefined) attrs.fill = (Array.isArray(marker) ? undefined : marker.fill) || op.itemFill
        list.push({ tag: 'circle', attrs })
        if (op.hits) {
          const sq = id(r, c, rows)
          list.push({ tag: 'circle', attrs: { cx, cy, r: op.hits.radius, fill: 'transparent', class: 'board-cell', 'data-sq': sq } })
          cells.push({ id: sq, x: cx, y: cy })
        }
      }
    }

    if (op.grouped) {
      const children = []
      emit(children)
      elements.push({ tag: 'g', attrs: { fill: op.groupFill }, children })
    } else {
      emit(elements)
    }
  },

  texts(op, geom, elements) {
    for (const t of op.items) {
      elements.push({ tag: 'text', attrs: t.attrs, text: t.text })
    }
  },

  'hit-targets'(op, geom, elements, cells) {
    const { rows, cols, tileSize, origin, posX, posY } = geom
    const id = idFn(op.idStyle)
    const emitTo = op.emitTo || 'elements'
    const children = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sq = id(r, c, rows)
        const cx = posX(c), cy = posY(r)
        let element
        if (op.shape === 'rect') {
          element = { tag: 'rect', attrs: { x: origin.x + c * tileSize, y: origin.y + r * tileSize, width: tileSize, height: tileSize, fill: 'transparent', 'data-sq': sq, class: 'board-cell', ...(op.cellAttrs ? op.cellAttrs(r, c) : {}) } }
        } else if (op.grouped) {
          element = { tag: 'circle', attrs: { cx, cy, r: op.radius, class: 'board-cell', 'data-sq': sq, ...(op.cellAttrs ? op.cellAttrs(r, c) : {}) } }
        } else {
          element = { tag: 'circle', attrs: { cx, cy, r: op.radius, fill: 'transparent', 'data-sq': sq, class: 'board-cell', ...(op.cellAttrs ? op.cellAttrs(r, c) : {}) } }
        }
        cells.push({ id: sq, x: cx, y: cy, element })
        if (emitTo !== 'cells') children.push(element)
      }
    }
    if (emitTo === 'cells') return
    if (op.grouped) {
      elements.push({ tag: 'g', attrs: { fill: 'transparent' }, children })
    } else {
      for (const el of children) elements.push(el)
    }
  },
}

// ─── Legacy declarative config → ops (fixed historical order) ───────────────
//
// produce-layout.js (frontmatter path) and existing tests use the declarative
// shape. This mapping preserves its exact semantics and element order until
// produce() emits ops directly.

function normalizeLegacyConfig(rows, cols, config) {
  const {
    tileSize = 56,
    colors = {},
    showLabels = true,
    inset = 0,
    backgrounds = [],
    lines: lineConfig = {},
    cellFill,
    diagonals,
    markers = [],
    zones = [],
    paths = [],
    texts = [],
    labels: labelConfig = {},
    positionType = 'square',
  } = config

  const isIntersection = positionType === 'intersection'
  const effInset = isIntersection ? (inset || Math.round(tileSize * 0.5)) : 0
  const pad = showLabels ? 24 : 0
  const gridW = isIntersection ? (cols - 1) * tileSize : cols * tileSize
  const gridH = isIntersection ? (rows - 1) * tileSize : rows * tileSize
  const boardW = gridW + effInset * 2
  const boardH = gridH + effInset * 2

  const ops = []

  for (const bg of backgrounds) {
    const attrs = { ...bg }
    if (attrs.x === undefined) attrs.x = pad
    if (attrs.y === undefined) attrs.y = pad
    if (attrs.width === undefined) attrs.width = boardW
    if (attrs.height === undefined) attrs.height = boardH
    ops.push({ op: 'rect', attrs })
  }

  if (cellFill) {
    ops.push({ op: 'cells', fill: (r, c) => {
      const fill = cellFill(r, c)
      if (fill === null) return null
      if (cellFill.stroke || cellFill.strokeWidth) {
        return { fill, stroke: cellFill.stroke ? cellFill.stroke(r, c) : undefined, strokeWidth: cellFill.strokeWidth ? cellFill.strokeWidth(r, c) : undefined }
      }
      return fill
    } })
  }

  if (config.cellDecorations) ops.push({ op: 'cell-decorations', fn: config.cellDecorations })

  if (zones.length) ops.push({ op: 'zone-ranges', zones })

  if (lineConfig.horizontal !== false) {
    const split = lineConfig.splitAfterRow != null
      ? { topRow: lineConfig.splitAfterRow, bottomRow: lineConfig.splitAfterRow + 1, edgeCols: lineConfig.edgeCols }
      : null
    ops.push({ op: 'grid-lines', color: lineConfig.color || colors.gridLine || '#333', width: lineConfig.width || 1.5, skipRows: lineConfig.skipRows, split, order: 'hv', grouped: false })
  }

  if (diagonals) {
    ops.push({ op: 'diagonals', predicate: diagonals.predicate, forward: diagonals.forward, backward: diagonals.backward, color: diagonals.color || lineConfig.color || colors.gridLine || '#333', width: diagonals.width || 1.5 })
  }

  for (const p of paths) {
    ops.push({ op: 'element', tag: 'path', attrs: { d: p.d, fill: p.fill || 'none', stroke: p.stroke, 'stroke-width': p.strokeWidth || 2.5, 'stroke-linecap': p.linecap || 'round' } })
  }

  if (markers.length) {
    ops.push({ op: 'markers', items: markers, radius: 3, itemFill: lineConfig.color || colors.gridLine || '#333' })
  }

  if (texts.length) {
    ops.push({ op: 'texts', items: texts.map(t => ({ attrs: { x: t.x, y: t.y, 'text-anchor': t.anchor || 'middle', 'dominant-baseline': t.baseline || 'central', 'font-size': t.fontSize, 'font-family': t.fontFamily || 'serif', fill: t.fill || '#333', ...(t.attrs || {}) }, text: t.text })) })
  }

  ops.push({ op: 'hit-targets', shape: isIntersection ? 'circle' : 'rect', radius: tileSize * 0.45, idStyle: labelConfig.alphabet ? (r, c, rws) => labelConfig.alphabet[c] + (rws - r) : 'algebraic', emitTo: 'cells', cellAttrs: config.cellAttrs })

  return {
    tileSize,
    positionType,
    inset: effInset,
    origin: { x: pad, y: pad },
    size: { width: boardW + pad * 2, height: boardH + pad * 2 },
    ops,
    labels: showLabels ? {
      show: true,
      color: labelConfig.color || colors.labelText || colors.gridLine || '#555',
      fontSize: labelConfig.fontSize || 10,
      fontFamily: labelConfig.fontFamily || 'monospace',
      alphabet: labelConfig.alphabet || null,
    } : null,
  }
}
