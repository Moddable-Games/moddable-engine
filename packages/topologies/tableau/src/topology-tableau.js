export const schema = {
  type: 'tableau',
  required: ['layout'],
  parseBoard(board) {
    if (/tableau|column|cascade/i.test(board)) {
      return { type: 'tableau', layout: 'tableau' }
    }
    if (/wall|mahjong/i.test(board)) {
      return { type: 'tableau', layout: 'wall' }
    }
    if (/radial|table|hand/i.test(board)) {
      return { type: 'tableau', layout: 'radial' }
    }
    return null
  },
  matchBoard(board) {
    return /tableau|radial|wall|card\s*table|hand|column/i.test(board)
  },
}

export function createTableauTopology(config) {
  const {
    layout = 'radial',
    players = 4,
    columns,
    cascade,
    foundations = 0,
    wallSegments = 4,
  } = config

  const cells = buildCells(config)

  function getCellCount() {
    return cells.length
  }

  function getAllCells() {
    return cells.map(c => c.key)
  }

  function getCell(key) {
    return cells.find(c => c.key === key) || null
  }

  function getCellsByType(type) {
    return cells.filter(c => c.cellType === type)
  }

  function neighbours(key) {
    const cell = getCell(key)
    if (!cell) return []
    return cells
      .filter(c => c.cellType === cell.cellType && c.key !== key)
      .map(c => c.key)
  }

  function isValid(key) {
    return cells.some(c => c.key === key)
  }

  function toJSON(key) {
    return key
  }

  function fromJSON(str) {
    return str
  }

  function getLayout(opts = {}) {
    if (layout === 'radial') return radialLayout(config, opts)
    if (layout === 'tableau') return tableauLayout(config, opts)
    if (layout === 'wall') return wallLayout(config, opts)
    if (layout === 'linear') return linearLayout(config, opts)
    return radialLayout(config, opts)
  }

  function serializePosition(cellStates) {
    if (!cellStates) return ''
    return cells.map(c => {
      const val = cellStates[c.key]
      return val !== undefined ? `${c.key}:${val}` : null
    }).filter(Boolean).join(',')
  }

  function parsePosition(notation) {
    if (!notation || notation === 'empty') return {}
    const state = {}
    for (const part of notation.split(',')) {
      const [key, val] = part.split(':')
      if (key && val !== undefined) state[key] = parseInt(val, 10) || val
    }
    return state
  }

  return {
    layout,
    players,
    getCellCount,
    getAllCells,
    getCell,
    getCellsByType,
    neighbours,
    isValid,
    toJSON,
    fromJSON,
    getLayout,
    serializePosition,
    parsePosition,
  }
}

function buildCells(config) {
  const { layout = 'radial', players = 4, columns, cascade, foundations = 0, wallSegments = 4 } = config
  const cells = []

  if (layout === 'radial') {
    for (let p = 0; p < players; p++) {
      cells.push({ key: `hand-${p}`, cellType: 'hand', player: p })
    }
    cells.push({ key: 'community', cellType: 'community' })
    cells.push({ key: 'draw', cellType: 'draw' })
    cells.push({ key: 'discard', cellType: 'discard' })
  } else if (layout === 'tableau') {
    const cols = columns || 7
    const cascadeArr = cascade || Array.from({ length: cols }, (_, i) => i + 1)
    for (let c = 0; c < cols; c++) {
      const depth = cascadeArr[c] || 1
      for (let r = 0; r < depth; r++) {
        cells.push({ key: `col-${c}-${r}`, cellType: 'column', column: c, row: r })
      }
    }
    for (let f = 0; f < (foundations || 4); f++) {
      cells.push({ key: `foundation-${f}`, cellType: 'foundation', index: f })
    }
    cells.push({ key: 'draw', cellType: 'draw' })
    cells.push({ key: 'waste', cellType: 'discard' })
  } else if (layout === 'wall') {
    for (let p = 0; p < players; p++) {
      cells.push({ key: `hand-${p}`, cellType: 'hand', player: p })
    }
    for (let s = 0; s < wallSegments; s++) {
      cells.push({ key: `wall-${s}`, cellType: 'wall', segment: s })
    }
  } else if (layout === 'linear') {
    for (let p = 0; p < players; p++) {
      cells.push({ key: `hand-${p}`, cellType: 'hand', player: p })
    }
    cells.push({ key: 'draw', cellType: 'draw' })
  }

  return cells
}

function radialLayout(config, opts = {}) {
  const {
    tableWidth = 800,
    tableHeight = 600,
    cardW = 56,
    cardH = 80,
  } = opts
  const players = config.players || 4

  const cells = []
  const rx = tableWidth / 2 - cardW * 3 - 20
  const ry = tableHeight / 2 - cardH - 30

  for (let i = 0; i < players; i++) {
    const angle = (i / players) * Math.PI * 2 - Math.PI / 2
    const x = tableWidth / 2 + Math.cos(angle) * rx
    const y = tableHeight / 2 + Math.sin(angle) * ry
    cells.push({
      key: `hand-${i}`,
      cellType: 'hand',
      player: i,
      center: { x, y },
      element: 'rect',
      attrs: { x: x - cardW * 2, y: y - cardH / 2, width: cardW * 4, height: cardH },
    })
  }

  cells.push({
    key: 'community',
    cellType: 'community',
    center: { x: tableWidth / 2, y: tableHeight / 2 },
    element: 'rect',
    attrs: { x: tableWidth / 2 - cardW * 3, y: tableHeight / 2 - cardH / 2, width: cardW * 6, height: cardH },
  })

  cells.push({
    key: 'draw',
    cellType: 'draw',
    center: { x: tableWidth / 2 - cardW * 4, y: tableHeight / 2 },
    element: 'rect',
    attrs: { x: tableWidth / 2 - cardW * 4 - cardW / 2, y: tableHeight / 2 - cardH / 2, width: cardW, height: cardH },
  })

  cells.push({
    key: 'discard',
    cellType: 'discard',
    center: { x: tableWidth / 2 + cardW * 4, y: tableHeight / 2 },
    element: 'rect',
    attrs: { x: tableWidth / 2 + cardW * 4 - cardW / 2, y: tableHeight / 2 - cardH / 2, width: cardW, height: cardH },
  })

  return {
    getCells() { return cells },
    getDimensions() { return { width: tableWidth, height: tableHeight } },
    getLines() { return [] },
    defaults: {
      cells: {
        hand: { fill: 'none', stroke: 'rgba(255,255,255,0.2)', 'stroke-width': 1, 'stroke-dasharray': '4 2' },
        community: { fill: 'none', stroke: 'rgba(255,255,255,0.3)', 'stroke-width': 1 },
        draw: { fill: '#2a3a6a', stroke: '#1a2a4a', 'stroke-width': 1 },
        discard: { fill: 'none', stroke: 'rgba(255,255,255,0.2)', 'stroke-width': 1, 'stroke-dasharray': '3 2' },
      },
    },
  }
}

function tableauLayout(config, opts = {}) {
  const {
    cardW = 44,
    cardH = 64,
    colGap = 6,
    cascadeStep = 18,
    pad = 20,
  } = opts
  const columns = config.columns || 7
  const cascadeArr = config.cascade || [1, 2, 3, 4, 5, 6, 7]
  const foundationCount = config.foundations || 4

  const maxCascade = Math.max(...cascadeArr)
  const tableauW = columns * (cardW + colGap) - colGap
  const tableauH = cardH + (maxCascade - 1) * cascadeStep

  const foundationY = pad
  const tableauY = foundationY + cardH + 20
  const totalW = tableauW + pad * 2
  const totalH = tableauY + tableauH + pad + 20

  const cells = []

  for (let f = 0; f < foundationCount; f++) {
    const fx = totalW - foundationCount * (cardW + colGap) - pad + colGap + f * (cardW + colGap)
    cells.push({
      key: `foundation-${f}`,
      cellType: 'foundation',
      index: f,
      center: { x: fx + cardW / 2, y: foundationY + cardH / 2 },
      element: 'rect',
      attrs: { x: fx, y: foundationY, width: cardW, height: cardH },
    })
  }

  cells.push({
    key: 'draw',
    cellType: 'draw',
    center: { x: pad + cardW / 2, y: foundationY + cardH / 2 },
    element: 'rect',
    attrs: { x: pad, y: foundationY, width: cardW, height: cardH },
  })

  cells.push({
    key: 'waste',
    cellType: 'discard',
    center: { x: pad + cardW + colGap + cardW / 2, y: foundationY + cardH / 2 },
    element: 'rect',
    attrs: { x: pad + cardW + colGap, y: foundationY, width: cardW, height: cardH },
  })

  for (let col = 0; col < columns; col++) {
    const depth = cascadeArr[col] || 1
    const cx = pad + col * (cardW + colGap)
    for (let row = 0; row < depth; row++) {
      const cy = tableauY + row * cascadeStep
      cells.push({
        key: `col-${col}-${row}`,
        cellType: 'column',
        column: col,
        row,
        center: { x: cx + cardW / 2, y: cy + cardH / 2 },
        element: 'rect',
        attrs: { x: cx, y: cy, width: cardW, height: cardH },
      })
    }
  }

  return {
    getCells() { return cells },
    getDimensions() { return { width: totalW, height: totalH } },
    getLines() { return [] },
    defaults: {
      cells: {
        foundation: { fill: 'none', stroke: 'rgba(255,255,255,0.3)', 'stroke-width': 1.5, 'stroke-dasharray': '4 2' },
        draw: { fill: '#2a3a6a', stroke: '#1a2a4a', 'stroke-width': 1 },
        discard: { fill: 'none', stroke: 'rgba(255,255,255,0.2)', 'stroke-width': 1, 'stroke-dasharray': '3 2' },
        column: { fill: 'none', stroke: 'none' },
      },
    },
  }
}

function wallLayout(config, opts = {}) {
  const {
    tileW = 30,
    tileH = 40,
    tileGap = 2,
    pad = 20,
  } = opts
  const players = config.players || 4
  const wallSegments = config.wallSegments || 4
  const tilesPerHand = config.perPlayer || 13
  const stacksPerSide = config.stacksPerSide || 17

  const step = tileW + tileGap
  const wallLen = stacksPerSide * step
  const wallSquare = wallLen + 2 * tileH

  const handLen = tilesPerHand * step
  const totalSize = Math.max(wallSquare + 140, handLen + 2 * (pad + tileH) + 40)

  const cx = totalSize / 2
  const cy = totalSize / 2
  const halfSquare = wallSquare / 2
  const cells = []

  for (let p = 0; p < players; p++) {
    const angle = (p / players) * Math.PI * 2
    const dist = halfSquare + tileH + 30
    const x = cx + Math.sin(angle) * dist
    const y = cy - Math.cos(angle) * dist
    cells.push({
      key: `hand-${p}`,
      cellType: 'hand',
      player: p,
      center: { x, y },
      element: 'rect',
      attrs: { x: x - handLen / 2, y: y - tileH / 2, width: handLen, height: tileH },
    })
  }

  for (let s = 0; s < wallSegments; s++) {
    const inset = halfSquare + tileH
    let x, y, w, h
    if (s === 0) { x = cx; y = cy + inset - tileH / 2; w = wallLen; h = tileH }
    else if (s === 1) { x = cx + inset - tileH / 2; y = cy; w = tileH; h = wallLen }
    else if (s === 2) { x = cx; y = cy - inset + tileH / 2; w = wallLen; h = tileH }
    else { x = cx - inset + tileH / 2; y = cy; w = tileH; h = wallLen }
    cells.push({
      key: `wall-${s}`,
      cellType: 'wall',
      segment: s,
      center: { x, y },
      element: 'rect',
      attrs: { x: x - w / 2, y: y - h / 2, width: w, height: h },
    })
  }

  return {
    getCells() { return cells },
    getDimensions() { return { width: totalSize, height: totalSize } },
    getLines() { return [] },
    defaults: {
      cells: {
        hand: { fill: 'none', stroke: 'rgba(255,255,255,0.2)', 'stroke-width': 1 },
        wall: { fill: '#d4c9a8', stroke: '#a89060', 'stroke-width': 0.8 },
      },
    },
  }
}

function linearLayout(config, opts = {}) {
  const {
    tableWidth = 600,
    tableHeight = 200,
    cardW = 56,
    cardH = 80,
  } = opts
  const players = config.players || 2

  const cells = []
  const step = tableWidth / (players + 1)
  for (let i = 0; i < players; i++) {
    const x = step * (i + 1)
    cells.push({
      key: `hand-${i}`,
      cellType: 'hand',
      player: i,
      center: { x, y: tableHeight / 2 },
      element: 'rect',
      attrs: { x: x - cardW * 2, y: tableHeight / 2 - cardH / 2, width: cardW * 4, height: cardH },
    })
  }

  cells.push({
    key: 'draw',
    cellType: 'draw',
    center: { x: tableWidth / 2, y: tableHeight - cardH },
    element: 'rect',
    attrs: { x: tableWidth / 2 - cardW / 2, y: tableHeight - cardH - 10, width: cardW, height: cardH },
  })

  return {
    getCells() { return cells },
    getDimensions() { return { width: tableWidth, height: tableHeight } },
    getLines() { return [] },
    defaults: {
      cells: {
        hand: { fill: 'none', stroke: 'rgba(255,255,255,0.2)', 'stroke-width': 1 },
        draw: { fill: '#2a3a6a', stroke: '#1a2a4a', 'stroke-width': 1 },
      },
    },
  }
}
