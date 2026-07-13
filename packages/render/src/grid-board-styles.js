/**
 * Grid board style configs — the bridge between board styles and the single
 * grid render pipeline (#18).
 *
 * ALL game data lives here as declared config: star point positions, hoshi
 * markers, promotion zones, river text, palace geometry, arc paths, cell-type
 * decorations. The topology package's renderGridLayout() never sees any of
 * it as knowledge — only as parametric ops.
 *
 * Every entry documents exactly what frontmatter must eventually carry for
 * that family; when produce() emits these ops from YAML, this file shrinks
 * to nothing. Until then it is the single home for grid game data — the
 * per-provider render() methods are gone.
 *
 * Byte-identity contract: each style's ops reproduce the historical provider
 * output exactly (attribute order, grouping, element order). Verified by
 * scripts/snapshot-boards.mjs --diff (284 boards).
 */

import { renderGridLayout } from '../../topology-grid/src/topology-grid.js'
import { elementsToFragment } from './serialize-layout.js'

// ─── Game data (→ frontmatter) ──────────────────────────────────────────────

// Go star points by board size (frontmatter: render.decorations markers.at)
const STAR_POINTS = {
  9:  [[2,2],[2,6],[4,4],[6,2],[6,6]],
  13: [[3,3],[3,9],[6,6],[9,3],[9,9]],
  19: [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]],
}

// Shogi hoshi markers, 9×9 (frontmatter: render.decorations markers.at)
const HOSHI_9 = [[2,2],[2,6],[6,2],[6,6]]

// Xiangqi river calligraphy (frontmatter: render.decorations texts)
const RIVER_TEXTS = ['楚 河', '漢 界']

// Cell-type decorations for zone-mapped boards (frontmatter: decoration
// registry keyed by cell type — rosette: Royal Ur, castle: Tafl)
const CELL_TYPE_DECORATIONS = {
  rosette(cx, cy, ts) {
    const s = ts * 0.25
    return [
      { tag: 'circle', attrs: { cx, cy, r: s * 0.42, fill: '#8b3a3a' } },
      { tag: 'circle', attrs: { cx, cy: cy - s, r: s * 0.25, fill: '#8b3a3a' } },
      { tag: 'circle', attrs: { cx, cy: cy + s, r: s * 0.25, fill: '#8b3a3a' } },
      { tag: 'circle', attrs: { cx: cx - s, cy, r: s * 0.25, fill: '#8b3a3a' } },
      { tag: 'circle', attrs: { cx: cx + s, cy, r: s * 0.25, fill: '#8b3a3a' } },
      { tag: 'circle', attrs: { cx: cx - s * 0.7, cy: cy - s * 0.7, r: s * 0.17, fill: '#a04848' } },
      { tag: 'circle', attrs: { cx: cx + s * 0.7, cy: cy - s * 0.7, r: s * 0.17, fill: '#a04848' } },
      { tag: 'circle', attrs: { cx: cx - s * 0.7, cy: cy + s * 0.7, r: s * 0.17, fill: '#a04848' } },
      { tag: 'circle', attrs: { cx: cx + s * 0.7, cy: cy + s * 0.7, r: s * 0.17, fill: '#a04848' } },
    ]
  },
  castle(cx, cy, ts, colors) {
    const d = ts * 0.3
    const xStroke = colors.castleX || '#fff8f0'
    return [
      { tag: 'line', attrs: { x1: cx - d, y1: cy - d, x2: cx + d, y2: cy + d, stroke: xStroke, 'stroke-width': 1.5, 'stroke-linecap': 'round' } },
      { tag: 'line', attrs: { x1: cx + d, y1: cy - d, x2: cx - d, y2: cy + d, stroke: xStroke, 'stroke-width': 1.5, 'stroke-linecap': 'round' } },
    ]
  },
}

// ─── Geometry helpers (pure, game-agnostic) ─────────────────────────────────

// Surakarta corner arcs (frontmatter: render.decorations arcs rings/offsets)
function surakartaArcPaths(gx, gy, tileSize, rows, cols, colors) {
  const innerR = tileSize
  const outerR = tileSize * 2
  const ix = (i) => gx + i * tileSize
  const iy = (i) => gy + i * tileSize
  return [
    { tag: 'path', attrs: { d: `M ${ix(1)},${iy(0)} A ${innerR},${innerR} 0 1,0 ${ix(0)},${iy(1)}`, stroke: colors.innerArc } },
    { tag: 'path', attrs: { d: `M ${ix(cols - 2)},${iy(0)} A ${innerR},${innerR} 0 1,1 ${ix(cols - 1)},${iy(1)}`, stroke: colors.innerArc } },
    { tag: 'path', attrs: { d: `M ${ix(0)},${iy(rows - 2)} A ${innerR},${innerR} 0 1,0 ${ix(1)},${iy(rows - 1)}`, stroke: colors.innerArc } },
    { tag: 'path', attrs: { d: `M ${ix(cols - 1)},${iy(rows - 2)} A ${innerR},${innerR} 0 1,1 ${ix(cols - 2)},${iy(rows - 1)}`, stroke: colors.innerArc } },
    { tag: 'path', attrs: { d: `M ${ix(2)},${iy(0)} A ${outerR},${outerR} 0 1,0 ${ix(0)},${iy(2)}`, stroke: colors.outerArc } },
    { tag: 'path', attrs: { d: `M ${ix(cols - 3)},${iy(0)} A ${outerR},${outerR} 0 1,1 ${ix(cols - 1)},${iy(2)}`, stroke: colors.outerArc } },
    { tag: 'path', attrs: { d: `M ${ix(0)},${iy(rows - 3)} A ${outerR},${outerR} 0 1,0 ${ix(2)},${iy(rows - 1)}`, stroke: colors.outerArc } },
    { tag: 'path', attrs: { d: `M ${ix(cols - 1)},${iy(rows - 3)} A ${outerR},${outerR} 0 1,1 ${ix(cols - 3)},${iy(rows - 1)}`, stroke: colors.outerArc } },
  ]
}

// Xiangqi palace diagonals (frontmatter: render.decorations palace cols/rows)
function palaceLines(gx, gy, tileSize, rows, cols, opts) {
  const mid = Math.floor(cols / 2)
  const palaceLeft = opts.palaceCols ? opts.palaceCols[0] : mid - 1
  const palaceRight = opts.palaceCols ? opts.palaceCols[1] : mid + 1
  const palaceRows = opts.palaceRows || 2
  const palaceTopRow = 0
  const palaceBotRow = rows - 1 - palaceRows
  const pl = gx + palaceLeft * tileSize, pr = gx + palaceRight * tileSize
  return [
    { tag: 'line', attrs: { x1: pl, y1: gy + palaceTopRow * tileSize, x2: pr, y2: gy + (palaceTopRow + palaceRows) * tileSize } },
    { tag: 'line', attrs: { x1: pr, y1: gy + palaceTopRow * tileSize, x2: pl, y2: gy + (palaceTopRow + palaceRows) * tileSize } },
    { tag: 'line', attrs: { x1: pl, y1: gy + palaceBotRow * tileSize, x2: pr, y2: gy + (palaceBotRow + palaceRows) * tileSize } },
    { tag: 'line', attrs: { x1: pr, y1: gy + palaceBotRow * tileSize, x2: pl, y2: gy + (palaceBotRow + palaceRows) * tileSize } },
  ]
}

function riverRows(rows, opts) {
  const top = opts.riverRows ? opts.riverRows[0] : Math.floor(rows / 2) - 1
  const bottom = opts.riverRows ? opts.riverRows[1] : Math.floor(rows / 2)
  return [top, bottom]
}

// ─── The 7 style configs ────────────────────────────────────────────────────
//
// Each declares: geometry (positionType, inset, computeLayout, getIntersection),
// presentation metadata (labelStyle, defaultColors), and ops(ctx) — the full
// drawing program for the single pipeline.

const STYLES = {

  checkered: {
    name: 'checkered',
    positionType: 'square',
    labelStyle: 'algebraic',
    defaultColors: { lightSquare: '#f0d9b5', darkSquare: '#b58863', voidFill: 'transparent' },
    inset: () => 0,
    computeLayout(opts) {
      const ts = opts.tileSize || 56
      return { boardW: opts.cols * ts, boardH: opts.rows * ts }
    },
    ops(ctx) {
      const { rows, cols, tileSize, ox, oy, colors, opts } = ctx
      const cellMap = opts.cellMap || null
      const ops = []
      if (cellMap) {
        ops.push({ op: 'rect', attrs: { x: ox, y: oy, width: cols * tileSize, height: rows * tileSize, fill: colors.voidFill } })
        ops.push({
          op: 'cells',
          interactive: true,
          fill(r, c) {
            const cell = cellMap[r] && cellMap[r][c]
            if (!cell) return null
            const fill = (typeof cell === 'string' && colors[cell]) ? colors[cell] : (r + c) % 2 === 0 ? colors.lightSquare : colors.darkSquare
            const stroke = (typeof cell === 'string' && colors[cell + 'Stroke']) ? colors[cell + 'Stroke'] : null
            return { fill, stroke: stroke || 'rgba(0,0,0,0.15)', strokeWidth: stroke ? 2 : 1, type: cell }
          },
          decorations(r, c, cx, cy, ts) {
            const cell = cellMap[r] && cellMap[r][c]
            const draw = CELL_TYPE_DECORATIONS[cell]
            return draw ? draw(cx, cy, ts, colors) : null
          },
        })
      } else {
        ops.push({
          op: 'cells',
          interactive: true,
          fill: (r, c) => (r + c) % 2 === 0 ? colors.lightSquare : colors.darkSquare,
        })
      }
      return ops
    },
  },

  'mono-grid': {
    name: 'mono-grid',
    positionType: 'square',
    labelStyle: 'algebraic',
    defaultColors: { monoSquare: '#d9b483', gridLine: '#8b6914' },
    inset: () => 0,
    computeLayout(opts) {
      const ts = opts.tileSize || 56
      return { boardW: opts.cols * ts, boardH: opts.rows * ts }
    },
    ops(ctx) {
      const { rows, cols, tileSize, ox, oy, colors } = ctx
      return [
        { op: 'rect', attrs: { x: ox, y: oy, width: cols * tileSize, height: rows * tileSize, fill: colors.monoSquare } },
        { op: 'grid-lines', grouped: false, order: 'vh', color: colors.gridLine, width: 1.5 },
        { op: 'hit-targets', shape: 'rect', idStyle: 'algebraic' },
      ]
    },
  },

  go: {
    name: 'go',
    positionType: 'intersection',
    labelStyle: 'go',
    defaultColors: {
      woodLight: '#dcb35c', woodDark: '#d4a843', gridLine: '#3d2b1a',
      labelText: '#5a4020', starPoint: '#3d2b1a',
      whitePieceFill: '#ffffff', whitePieceStroke: '#333333',
      blackPieceFill: '#1c1c1c', blackPieceStroke: '#888888',
    },
    inset: () => 15,
    computeLayout(opts) {
      const ts = opts.tileSize || 20
      return { boardW: (opts.cols - 1) * ts + 30, boardH: (opts.rows - 1) * ts + 30 }
    },
    getIntersection(r, c, ctx) {
      return { x: ctx.ox + 15 + c * ctx.tileSize, y: ctx.oy + 15 + r * ctx.tileSize }
    },
    ops(ctx) {
      const { rows, cols, tileSize, ox, oy, colors } = ctx
      const inset = 15
      const gridW = (cols - 1) * tileSize, gridH = (rows - 1) * tileSize
      const gx = ox + inset, gy = oy + inset
      return [
        { op: 'rect', attrs: { x: ox, y: oy, width: gridW + inset * 2, height: gridH + inset * 2, fill: colors.woodLight } },
        { op: 'rect', attrs: { x: gx, y: gy, width: gridW, height: gridH, fill: colors.woodDark, rx: 2 } },
        { op: 'grid-lines', grouped: true, order: 'hv', color: colors.gridLine, width: 0.8 },
        { op: 'markers', grouped: true, groupFill: colors.starPoint, items: STAR_POINTS[rows] || [], radius: 3 },
        { op: 'hit-targets', grouped: true, radius: tileSize * 0.45, idStyle: 'go' },
      ]
    },
  },

  surakarta: {
    name: 'surakarta',
    positionType: 'intersection',
    labelStyle: 'algebraic',
    defaultColors: {
      frame: '#5a3e28', board: '#c8a872', boardInner: '#d4b896',
      gridLine: '#6b4a30', dotFill: '#4a3320',
      innerArc: '#6b4a30', outerArc: '#6b4a30',
    },
    inset: (ts) => ts * 2.3,
    computeLayout(opts) {
      const ts = opts.tileSize || 50
      const arcPad = ts * 2.3
      return { boardW: (opts.cols - 1) * ts + arcPad * 2, boardH: (opts.rows - 1) * ts + arcPad * 2 }
    },
    getIntersection(r, c, ctx) {
      const arcPad = ctx.tileSize * 2.3
      return { x: ctx.ox + arcPad + c * ctx.tileSize, y: ctx.oy + arcPad + r * ctx.tileSize }
    },
    ops(ctx) {
      const { rows, cols, tileSize, ox, oy, colors } = ctx
      const arcPad = tileSize * 2.3
      const gridW = (cols - 1) * tileSize, gridH = (rows - 1) * tileSize
      const boardW = gridW + arcPad * 2, boardH = gridH + arcPad * 2
      const gx = ox + arcPad, gy = oy + arcPad
      return [
        { op: 'rect', attrs: { x: ox, y: oy, width: boardW, height: boardH, rx: 8, fill: colors.frame } },
        { op: 'rect', attrs: { x: ox + 6, y: oy + 6, width: boardW - 12, height: boardH - 12, rx: 5, fill: colors.board } },
        { op: 'rect', attrs: { x: ox + 10, y: oy + 10, width: boardW - 20, height: boardH - 20, rx: 3, fill: colors.boardInner } },
        { op: 'grid-lines', grouped: true, order: 'hv', color: colors.gridLine, width: 1.5 },
        { op: 'group', attrs: { fill: 'none', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, children: surakartaArcPaths(gx, gy, tileSize, rows, cols, colors) },
        { op: 'markers', grouped: true, groupFill: colors.dotFill, allCells: true, radius: 3.5 },
        { op: 'hit-targets', grouped: true, radius: tileSize * 0.45, idStyle: 'go' },
      ]
    },
  },

  xiangqi: {
    name: 'xiangqi',
    positionType: 'intersection',
    labelStyle: 'none',
    defaultColors: {
      board: '#f5deb3', gridLine: '#4a3520', river: '#f5deb3',
      riverText: '#4a3520', palace: '#4a3520', labelText: '#4a3520',
    },
    inset: () => 20,
    computeLayout(opts) {
      const ts = opts.tileSize || 40, inset = 20
      return { boardW: (opts.cols - 1) * ts + inset * 2, boardH: (opts.rows - 1) * ts + inset * 2 }
    },
    getIntersection(r, c, ctx) {
      return { x: ctx.ox + 20 + c * ctx.tileSize, y: ctx.oy + 20 + r * ctx.tileSize }
    },
    ops(ctx) {
      const { rows, cols, tileSize, ox, oy, colors, opts } = ctx
      const river = opts.river === true, inset = 20
      const gridW = (cols - 1) * tileSize, gridH = (rows - 1) * tileSize
      const gx = ox + inset, gy = oy + inset
      const ops = []

      ops.push({ op: 'rect', attrs: { x: ox, y: oy, width: gridW + inset * 2, height: gridH + inset * 2, fill: colors.board } })

      if (opts.zones) {
        ops.push({ op: 'zone-cells', zones: Object.entries(opts.zones).map(([, zone]) => zone && zone.cells ? { cells: zone.cells, fill: zone.fill || '#6b9fd4', opacity: zone.opacity || 0.4 } : null).filter(Boolean) })
      }

      ops.push({ op: 'rect', attrs: { x: ox, y: oy, width: gridW + inset * 2, height: gridH + inset * 2, fill: 'none', stroke: colors.gridLine, 'stroke-width': 2 } })

      if (river) {
        const [rt, rb] = riverRows(rows, opts)
        ops.push({ op: 'grid-lines', grouped: true, order: 'hv', color: colors.gridLine, width: 1, skipRows: [rt, rb], appendRows: [rt, rb], split: { topRow: rt, bottomRow: rb, edgeCols: [0, cols - 1] } })
      } else {
        ops.push({ op: 'grid-lines', grouped: true, order: 'hv', color: colors.gridLine, width: 1 })
      }

      if (opts.palace !== false) {
        ops.push({ op: 'group', attrs: { stroke: colors.palace, 'stroke-width': 0.8, 'stroke-dasharray': '4,3' }, children: palaceLines(gx, gy, tileSize, rows, cols, opts) })
      }

      if (river) {
        const [rt, rb] = riverRows(rows, opts)
        const rty1 = gy + rt * tileSize, rty2 = gy + rb * tileSize
        const rmid = (rty1 + rty2) / 2
        const fs = Math.min(tileSize * 0.45, 14)
        ops.push({ op: 'texts', items: [
          { attrs: { x: gx + gridW * 0.25, y: rmid + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs, 'font-family': 'serif', 'pointer-events': 'none', fill: colors.riverText }, text: RIVER_TEXTS[0] },
          { attrs: { x: gx + gridW * 0.75, y: rmid + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs, 'font-family': 'serif', 'pointer-events': 'none', fill: colors.riverText }, text: RIVER_TEXTS[1] },
        ] })
      }

      ops.push({ op: 'hit-targets', grouped: true, radius: tileSize * 0.4, idStyle: 'algebraic' })
      return ops
    },
  },

  shogi: {
    name: 'shogi',
    positionType: 'intersection',
    labelStyle: 'none',
    defaultColors: {
      board: '#e8c97a', boardBorder: '#8b6914', gridLine: '#6b4e1a',
      hoshi: '#6b4e1a', promotionZone: 'rgba(180, 60, 40, 0.08)', labelText: '#5a4020',
    },
    inset: () => 20,
    computeLayout(opts) {
      const ts = opts.tileSize || 40, inset = 20
      return { boardW: (opts.cols - 1) * ts + inset * 2, boardH: (opts.rows - 1) * ts + inset * 2 }
    },
    getIntersection(r, c, ctx) {
      return { x: ctx.ox + 20 + c * ctx.tileSize, y: ctx.oy + 20 + r * ctx.tileSize }
    },
    ops(ctx) {
      const { rows, cols, tileSize, ox, oy, colors } = ctx
      const inset = 20
      const gridW = (cols - 1) * tileSize, gridH = (rows - 1) * tileSize
      const gx = ox + inset, gy = oy + inset
      const ops = []
      ops.push({ op: 'rect', attrs: { x: ox, y: oy, width: gridW + inset * 2, height: gridH + inset * 2, fill: colors.board } })
      ops.push({ op: 'rect', attrs: { x: ox, y: oy, width: gridW + inset * 2, height: gridH + inset * 2, fill: 'none', stroke: colors.boardBorder, 'stroke-width': 2 } })
      if (rows === 9) {
        ops.push({ op: 'rect', attrs: { x: gx, y: gy, width: gridW, height: 2 * tileSize, fill: colors.promotionZone } })
        ops.push({ op: 'rect', attrs: { x: gx, y: gy + 6 * tileSize, width: gridW, height: 2 * tileSize, fill: colors.promotionZone } })
      }
      ops.push({ op: 'grid-lines', grouped: true, order: 'hv', color: colors.gridLine, width: 0.8 })
      ops.push({ op: 'markers', grouped: true, groupFill: colors.hoshi, items: (rows === 9 && cols === 9) ? HOSHI_9 : [], radius: 3 })
      ops.push({ op: 'hit-targets', grouped: true, radius: tileSize * 0.4, idStyle: 'algebraic' })
      return ops
    },
  },

  alquerque: {
    name: 'alquerque',
    positionType: 'intersection',
    labelStyle: 'algebraic',
    defaultColors: { monoSquare: '#d9b483', gridLine: '#8b6914' },
    inset: (ts) => Math.round(ts * 0.5),
    computeLayout(opts) {
      const ts = opts.tileSize || 56
      const inset = Math.round(ts * 0.5)
      return { boardW: (opts.cols - 1) * ts + inset * 2, boardH: (opts.rows - 1) * ts + inset * 2 }
    },
    getIntersection(r, c, ctx) {
      const inset = Math.round(ctx.tileSize * 0.5)
      return { x: ctx.ox + inset + c * ctx.tileSize, y: ctx.oy + inset + r * ctx.tileSize }
    },
    ops(ctx) {
      const { rows, cols, tileSize, ox, oy, colors } = ctx
      const inset = Math.round(tileSize * 0.5)
      const gridW = (cols - 1) * tileSize, gridH = (rows - 1) * tileSize
      return [
        { op: 'rect', attrs: { x: ox, y: oy, width: gridW + inset * 2, height: gridH + inset * 2, fill: colors.monoSquare, rx: 4 } },
        { op: 'grid-lines', grouped: false, order: 'hv', color: colors.gridLine, width: 2 },
        { op: 'diagonals', predicate: (r, c) => (r + c) % 2 === 0, color: colors.gridLine, width: 1.5 },
        { op: 'markers', allCells: true, radius: 3, itemFill: colors.gridLine, hits: { radius: tileSize * 0.4, idStyle: 'algebraic' } },
      ]
    },
  },
}

// ─── Provider-shaped wrappers around the single pipeline ────────────────────
//
// renderBoard() consumes { positionType, labelStyle, defaultColors,
// computeLayout, getIntersection?, render }. render() is the ONLY drawing
// entry and always goes through renderGridLayout — one pipeline, no
// per-style rendering code.

function makeGridStyle(style) {
  return {
    name: style.name,
    positionType: style.positionType,
    labelStyle: style.labelStyle,
    defaultColors: style.defaultColors,
    computeLayout: style.computeLayout,
    getIntersection: style.getIntersection,
    render(ctx) {
      const layout = renderGridLayout(ctx.rows, ctx.cols, {
        tileSize: ctx.tileSize,
        positionType: style.positionType,
        inset: style.inset(ctx.tileSize),
        origin: { x: ctx.ox, y: ctx.oy },
        size: { width: 0, height: 0 },
        ops: style.ops(ctx),
      })
      return elementsToFragment(layout.elements)
    },
  }
}

export const gridStyles = Object.fromEntries(
  Object.entries(STYLES).map(([key, style]) => [key, makeGridStyle(style)])
)
