export const schema = {
  type: 'pit',
  required: [],
  parseBoard(board) {
    const match = board.match(/(\d+)\s*[×x]\s*(\d+)/)
    if (!match) return null
    return { type: 'pit', cols: parseInt(match[2], 10) }
  },
  matchBoard(board) {
    return /\d+\s*[×x]\s*\d+\s*pits?/i.test(board)
  },
}

export function createPitTopology(config) {
  const { pitsPerSide = config.cols || 6, players = 2, hasStores = true } = config
  const totalPits = pitsPerSide * players
  const stores = hasStores ? players : 0

  function pitIndex(player, pit) {
    return player * pitsPerSide + pit
  }

  function storeIndex(player) {
    if (!hasStores) return -1
    return totalPits + player
  }

  function getOwner(index) {
    if (index >= totalPits) return index - totalPits
    return Math.floor(index / pitsPerSide)
  }

  function isStore(index) {
    return index >= totalPits
  }

  function isPit(index) {
    return index >= 0 && index < totalPits
  }

  function isValid(index) {
    return index >= 0 && index < totalPits + stores
  }

  function sowSequence(fromPit, player, opts = {}) {
    const { skipOpponentStore = true, skipOwnPit = true } = opts
    const sequence = []

    const boardPath = buildBoardPath()
    const startIdx = boardPath.indexOf(fromPit)

    for (let i = 1; i < boardPath.length; i++) {
      const pos = boardPath[(startIdx + i) % boardPath.length]

      if (skipOwnPit && pos === fromPit) continue

      if (isStore(pos)) {
        const storeOwner = pos - totalPits
        if (skipOpponentStore && storeOwner !== player) continue
      }

      sequence.push(pos)
    }
    return sequence
  }

  function buildBoardPath() {
    const path = []
    for (let i = 0; i < pitsPerSide; i++) path.push(i)
    if (hasStores) path.push(storeIndex(0))
    for (let i = pitsPerSide; i < totalPits; i++) path.push(i)
    if (hasStores) path.push(storeIndex(1))
    return path
  }

  function getOpposite(pitIdx) {
    if (!isPit(pitIdx)) return -1
    return totalPits - 1 - pitIdx
  }

  function getPlayerPits(player) {
    const start = player * pitsPerSide
    return Array.from({ length: pitsPerSide }, (_, i) => start + i)
  }

  function neighbours(index) {
    const result = []
    const prev = (index - 1 + totalPits) % totalPits
    const next = (index + 1) % totalPits
    if (isPit(index)) {
      result.push(prev, next)
    }
    return result
  }

  function distance(a, b) {
    if (!isPit(a) || !isPit(b)) return -1
    const forward = ((b - a) + totalPits) % totalPits
    const backward = ((a - b) + totalPits) % totalPits
    return Math.min(forward, backward)
  }

  function toJSON(index) {
    return String(index)
  }

  function fromJSON(str) {
    return parseInt(str, 10)
  }

  function getCount() {
    return totalPits + stores
  }

  function getPitsPerSide() {
    return pitsPerSide
  }

  function getTotalPits() {
    return totalPits
  }

  function getLayout(opts = {}) {
    const { pitRadius = 25, storeRadius = 35, spacing = 15 } = opts
    const pitDiameter = pitRadius * 2
    const storeWidth = storeRadius * 2
    const pitsStartX = storeWidth + spacing * 2

    return {
      getDimensions() {
        const width = storeWidth + spacing * 2 + pitsPerSide * (pitDiameter + spacing) + spacing
        const height = pitDiameter * 2 + spacing * 3 + storeRadius
        return { width, height }
      },
      getCells() {
        const cells = []
        const dims = this.getDimensions()
        for (let i = 0; i < pitsPerSide; i++) {
          const x = pitsStartX + i * (pitDiameter + spacing) + pitRadius
          const cy1 = pitRadius + spacing
          cells.push({ key: pitIndex(1, pitsPerSide - 1 - i), center: { x, y: cy1 }, cellType: 'pit', element: 'ellipse', attrs: { cx: x, cy: cy1, rx: pitRadius, ry: pitRadius * 0.8 } })
        }
        for (let i = 0; i < pitsPerSide; i++) {
          const x = pitsStartX + i * (pitDiameter + spacing) + pitRadius
          const cy2 = dims.height - pitRadius - spacing
          cells.push({ key: pitIndex(0, i), center: { x, y: cy2 }, cellType: 'pit', element: 'ellipse', attrs: { cx: x, cy: cy2, rx: pitRadius, ry: pitRadius * 0.8 } })
        }
        if (stores > 0) {
          const sx0 = dims.width - storeRadius - spacing / 2
          const sy = dims.height / 2
          const sx1 = storeRadius + spacing / 2
          cells.push({ key: storeIndex(0), center: { x: sx0, y: sy }, cellType: 'store', element: 'ellipse', attrs: { cx: sx0, cy: sy, rx: storeRadius, ry: storeRadius * 0.8 } })
          cells.push({ key: storeIndex(1), center: { x: sx1, y: sy }, cellType: 'store', element: 'ellipse', attrs: { cx: sx1, cy: sy, rx: storeRadius, ry: storeRadius * 0.8 } })
        }
        return cells
      },
      defaults: {
        cells: { pit: { fill: '#8B4513', stroke: '#5C3010', 'stroke-width': 2 }, store: { fill: '#8B4513', stroke: '#5C3010', 'stroke-width': 2 } },
      },
    }
  }

  function serializePosition(cellStates) {
    const parts = []
    for (let p = 0; p < players; p++) {
      const pitCounts = []
      for (let i = 0; i < pitsPerSide; i++) {
        const idx = pitIndex(p, i)
        const val = Array.isArray(cellStates) ? cellStates[idx] : (cellStates[idx] ?? 0)
        pitCounts.push(String(val))
      }
      parts.push(pitCounts.join(','))
      if (hasStores) {
        const sIdx = storeIndex(p)
        const storeVal = Array.isArray(cellStates) ? cellStates[sIdx] : (cellStates[sIdx] ?? 0)
        parts.push(String(storeVal))
      }
    }
    return parts.join(';')
  }

  function parsePosition(notation) {
    if (!notation || notation === 'empty') {
      return { pits: new Array(totalPits).fill(0), stores: new Array(players).fill(0) }
    }

    const sections = notation.split(';')
    const pits = new Array(totalPits).fill(0)
    const storesArr = new Array(players).fill(0)

    let sectionIdx = 0
    for (let p = 0; p < players; p++) {
      if (sectionIdx < sections.length) {
        const pitValues = sections[sectionIdx].split(',').map(s => parseInt(s.trim(), 10) || 0)
        for (let i = 0; i < pitsPerSide && i < pitValues.length; i++) {
          pits[pitIndex(p, i)] = pitValues[i]
        }
        sectionIdx++
      }
      if (hasStores && sectionIdx < sections.length) {
        storesArr[p] = parseInt(sections[sectionIdx].trim(), 10) || 0
        sectionIdx++
      }
    }

    return { pits, stores: storesArr }
  }

  function renderLayout(opts = {}) {
    const colors = opts.colors || {}
    const pitRadius = opts.pitRadius || 22
    const storeRx = opts.storeRx || 24
    const storeRy = opts.storeRy || 50
    const boardShape = opts.boardShape || 'rect'
    const boardRows = opts.boardRows || 2
    const rx = opts.cornerRadius || 22
    const pitCurve = opts.pitCurve || 0
    const markerSet = new Set(opts.markers || [])
    const seedsPerPit = opts.seedsPerPit || 4
    const seedRadius = Math.min(4.5, pitRadius * 0.2)
    const parsedSetup = opts.parsedSetup || null
    const pieceImages = opts.pieceImages || null

    if (boardShape === 'ellipse') {
      return renderEllipseLayout(opts)
    }

    const pad = opts.padEdge || pitRadius * 1.65
    const frameInset = opts.frameInset || 16
    const interRow = opts.interRow || pitRadius * 2.4
    const divGap = boardRows === 4 ? (opts.divGap || pitRadius * 2.7) : 0
    const contentH = boardRows === 4 ? interRow * 2 + divGap : interRow * (boardRows - 1)
    const boardH = contentH + pad * 2 + frameInset * 2
    const storeWidth = hasStores ? storeRx * 2 + 16 : 0
    const pitsAreaWidth = pitsPerSide * (pitRadius * 2 + 10)
    const boardW = storeWidth * 2 + pitsAreaWidth + pad * 2 + frameInset * 2

    const elements = []
    const cells = []

    // Board frame — exact match of original
    const bx = frameInset / 2, by = frameInset / 2
    const bw = boardW - frameInset, bh = boardH - frameInset
    elements.push({ tag: 'rect', attrs: { x: bx, y: by, width: bw, height: bh, rx, ry: rx, fill: colors.boardOuter || '#7A5A32' } })
    elements.push({ tag: 'rect', attrs: { x: bx + 6, y: by + 6, width: bw - 12, height: bh - 12, rx: rx - 4, ry: rx - 4, fill: colors.boardInner || '#9B7740' } })
    if (colors.border) {
      const attrs = { x: bx + 12, y: by + 12, width: bw - 24, height: bh - 24, rx: rx - 8, ry: rx - 8, fill: 'none', stroke: colors.border, 'stroke-width': 1.5 }
      if (colors.borderDash) attrs['stroke-dasharray'] = colors.borderDash
      elements.push({ tag: 'rect', attrs })
    }

    // Stores — exact match: left=store-1, right=store-0
    if (hasStores) {
      const storeCy = boardH / 2
      const leftX = frameInset + storeWidth / 2
      const rightX = boardW - frameInset - storeWidth / 2
      elements.push({ tag: 'ellipse', attrs: { cx: leftX, cy: storeCy, rx: storeRx, ry: storeRy, fill: colors.pit || '#4E3320', stroke: colors.pitStroke || '#3A2515', 'stroke-width': 1.5 } })
      elements.push({ tag: 'ellipse', attrs: { cx: rightX, cy: storeCy, rx: storeRx, ry: storeRy, fill: colors.pit || '#4E3320', stroke: colors.pitStroke || '#3A2515', 'stroke-width': 1.5 } })
      cells.push({ id: 'store-1', x: leftX, y: storeCy, element: { tag: 'ellipse', attrs: { cx: leftX, cy: storeCy, rx: storeRx, ry: storeRy, fill: 'transparent', 'data-sq': 'store-1', class: 'board-cell' } } })
      cells.push({ id: 'store-0', x: rightX, y: storeCy, element: { tag: 'ellipse', attrs: { cx: rightX, cy: storeCy, rx: storeRx, ry: storeRy, fill: 'transparent', 'data-sq': 'store-0', class: 'board-cell' } } })
    }

    // Pit positions — exact match of original
    const pitsLeftEdge = frameInset + (hasStores ? storeWidth : 0) + pad
    const pitsRightEdge = boardW - frameInset - (hasStores ? storeWidth : 0) - pad
    const pitsAvailWidth = pitsRightEdge - pitsLeftEdge
    const pitSpacing = pitsPerSide > 1 ? pitsAvailWidth / (pitsPerSide - 1) : 0

    const topPitCenter = frameInset + pad
    const botPitCenter = boardH - frameInset - pad
    const rowCenters = []
    if (boardRows === 2) {
      rowCenters.push(topPitCenter, botPitCenter)
    } else if (boardRows === 4) {
      rowCenters.push(topPitCenter, topPitCenter + interRow, botPitCenter - interRow, botPitCenter)
    }

    for (let row = 0; row < boardRows; row++) {
      const isTopHalf = row < boardRows / 2
      const baseCy = rowCenters[row]
      for (let i = 0; i < pitsPerSide; i++) {
        const displayIdx = isTopHalf ? (pitsPerSide - 1 - i) : i
        const pitIdx = row * pitsPerSide + displayIdx
        const cx = pitsLeftEdge + i * pitSpacing

        let cy = baseCy
        if (pitCurve) {
          const t = (i - (pitsPerSide - 1) / 2) / ((pitsPerSide - 1) / 2)
          const curveOffset = pitCurve * t * t
          cy += isTopHalf ? curveOffset : -curveOffset
        }

        elements.push({ tag: 'circle', attrs: { cx, cy, r: pitRadius, fill: colors.pit || '#4E3320', stroke: colors.pitStroke || '#3A2515', 'stroke-width': 1.5 } })

        if (markerSet.has(pitIdx)) {
          elements.push({ tag: 'circle', attrs: { cx, cy, r: pitRadius - 8, fill: 'none', stroke: colors.marker || '#C49040', 'stroke-width': 2, 'stroke-dasharray': '4,3' } })
        }

        const seedCount = parsedSetup && parsedSetup.pits ? parsedSetup.pits[pitIdx] : seedsPerPit
        if (seedCount > 0) {
          if (pieceImages && pieceImages[String(seedCount)]) {
            const size = pitRadius * 1.6
            elements.push({ tag: 'image', attrs: { href: pieceImages[String(seedCount)], x: cx - size / 2, y: cy - size / 2, width: size, height: size, 'pointer-events': 'none' } })
          } else {
            const positions = seedLayout(seedCount, seedRadius)
            for (const [sx, sy] of positions) {
              elements.push({ tag: 'circle', attrs: { cx: cx + sx, cy: cy + sy, r: seedRadius, fill: colors.seed || '#C8B898', stroke: colors.seedStroke || '#8A7A5A', 'stroke-width': 0.5 } })
            }
          }
        }

        cells.push({ id: `pit-${pitIdx}`, x: cx, y: cy, element: { tag: 'circle', attrs: { cx, cy, r: pitRadius, fill: 'transparent', 'data-sq': `pit-${pitIdx}`, class: 'board-cell' } } })
      }
    }

    // 4-row divider
    if (boardRows === 4) {
      const divY = boardH / 2
      elements.push({ tag: 'line', attrs: { x1: pitsLeftEdge - pitRadius, y1: divY, x2: pitsLeftEdge + (pitsPerSide - 1) * pitSpacing + pitRadius, y2: divY, stroke: colors.boardOuter || '#7A5A32', 'stroke-width': 2.5, 'stroke-dasharray': '6,4' } })
    }

    return { width: boardW, height: boardH, elements, cells, labels: [], defs: [], tileSize: pitRadius * 1.6 }
  }

  function renderEllipseLayout(opts) {
    const colors = opts.colors || {}
    const pitRadius = opts.pitRadius || 18
    const storeRx = opts.storeRx || 20
    const storeRy = opts.storeRy || 38
    const pitCurve = opts.pitCurve || 0
    const seedsPerPit = opts.seedsPerPit || 4
    const seedRadius = Math.min(4.5, pitRadius * 0.2)
    const parsedSetup = opts.parsedSetup || null
    const pieceImages = opts.pieceImages || null
    const markerSet = new Set(opts.markers || [])

    const pitSpacing = opts.pitSpacing || pitRadius * 2.96
    const pitSpan = (pitsPerSide - 1) * pitSpacing
    const rowOffset = opts.rowOffset || pitRadius * 2
    const storeGap = opts.storeGap || 2
    const storeCenterOffset = hasStores ? pitSpan / 2 + pitRadius + storeGap + storeRx : 0
    const outerRx = (hasStores ? storeCenterOffset + storeRx : pitSpan / 2 + pitRadius) + (opts.ellipsePadX || pitRadius * 2.67)
    const outerRy = rowOffset + (opts.ellipsePadY || pitRadius * 2.22)
    const boardW = Math.round(2 * (outerRx + (opts.ellipseMarginX || pitRadius * 0.67)))
    const boardH = Math.round(2 * (outerRy + (opts.ellipseMarginY || pitRadius * 0.78)))
    const cx = boardW / 2, cy = boardH / 2

    const elements = []
    const cells = []

    // Board ellipses
    elements.push({ tag: 'ellipse', attrs: { cx, cy, rx: outerRx, ry: outerRy, fill: colors.boardOuter || '#7A5A32' } })
    elements.push({ tag: 'ellipse', attrs: { cx, cy, rx: outerRx - 8, ry: outerRy - 8, fill: colors.boardInner || '#9B7740' } })

    // Stores
    if (hasStores) {
      const leftX = cx - storeCenterOffset
      const rightX = cx + storeCenterOffset
      elements.push({ tag: 'ellipse', attrs: { cx: leftX, cy, rx: storeRx, ry: storeRy, fill: colors.pit || '#4E3320', stroke: colors.pitStroke || '#3A2515', 'stroke-width': 1.5 } })
      elements.push({ tag: 'ellipse', attrs: { cx: rightX, cy, rx: storeRx, ry: storeRy, fill: colors.pit || '#4E3320', stroke: colors.pitStroke || '#3A2515', 'stroke-width': 1.5 } })
      cells.push({ id: 'store-1', x: leftX, y: cy, element: { tag: 'ellipse', attrs: { cx: leftX, cy, rx: storeRx, ry: storeRy, fill: 'transparent', 'data-sq': 'store-1', class: 'board-cell' } } })
      cells.push({ id: 'store-0', x: rightX, y: cy, element: { tag: 'ellipse', attrs: { cx: rightX, cy, rx: storeRx, ry: storeRy, fill: 'transparent', 'data-sq': 'store-0', class: 'board-cell' } } })
    }

    // Pits — exact match of original renderEllipse
    const topCy = cy - rowOffset, botCy = cy + rowOffset
    for (let i = 0; i < pitsPerSide; i++) {
      const px = cx + (i - (pitsPerSide - 1) / 2) * pitSpacing

      let topY = topCy, botY = botCy
      if (pitCurve) {
        const t = (i - (pitsPerSide - 1) / 2) / ((pitsPerSide - 1) / 2)
        const curveOffset = pitCurve * t * t
        topY += curveOffset
        botY -= curveOffset
      }

      const topIdx = pitsPerSide - 1 - i
      const botIdx = i
      elements.push({ tag: 'circle', attrs: { cx: px, cy: topY, r: pitRadius, fill: colors.pit || '#4E3320', stroke: colors.pitStroke || '#3A2515', 'stroke-width': 1.5 } })
      elements.push({ tag: 'circle', attrs: { cx: px, cy: botY, r: pitRadius, fill: colors.pit || '#4E3320', stroke: colors.pitStroke || '#3A2515', 'stroke-width': 1.5 } })

      if (markerSet.has(topIdx)) {
        elements.push({ tag: 'circle', attrs: { cx: px, cy: topY, r: pitRadius - 8, fill: 'none', stroke: colors.marker || '#C49040', 'stroke-width': 2, 'stroke-dasharray': '4,3' } })
      }
      if (markerSet.has(pitsPerSide + botIdx)) {
        elements.push({ tag: 'circle', attrs: { cx: px, cy: botY, r: pitRadius - 8, fill: 'none', stroke: colors.marker || '#C49040', 'stroke-width': 2, 'stroke-dasharray': '4,3' } })
      }

      const topSeedCount = parsedSetup && parsedSetup.pits ? parsedSetup.pits[topIdx] : seedsPerPit
      const botSeedCount = parsedSetup && parsedSetup.pits ? parsedSetup.pits[pitsPerSide + botIdx] : seedsPerPit
      if (topSeedCount > 0) {
        if (pieceImages && pieceImages[String(topSeedCount)]) {
          const size = pitRadius * 1.6
          elements.push({ tag: 'image', attrs: { href: pieceImages[String(topSeedCount)], x: px - size / 2, y: topY - size / 2, width: size, height: size, 'pointer-events': 'none' } })
        } else {
          for (const [sx, sy] of seedLayout(topSeedCount, seedRadius)) {
            elements.push({ tag: 'circle', attrs: { cx: px + sx, cy: topY + sy, r: seedRadius, fill: colors.seed || '#C8B898', stroke: colors.seedStroke || '#8A7A5A', 'stroke-width': 0.5 } })
          }
        }
      }
      if (botSeedCount > 0) {
        if (pieceImages && pieceImages[String(botSeedCount)]) {
          const size = pitRadius * 1.6
          elements.push({ tag: 'image', attrs: { href: pieceImages[String(botSeedCount)], x: px - size / 2, y: botY - size / 2, width: size, height: size, 'pointer-events': 'none' } })
        } else {
          for (const [sx, sy] of seedLayout(botSeedCount, seedRadius)) {
            elements.push({ tag: 'circle', attrs: { cx: px + sx, cy: botY + sy, r: seedRadius, fill: colors.seed || '#C8B898', stroke: colors.seedStroke || '#8A7A5A', 'stroke-width': 0.5 } })
          }
        }
      }

      cells.push({ id: `pit-${topIdx}`, x: px, y: topY, element: { tag: 'circle', attrs: { cx: px, cy: topY, r: pitRadius, fill: 'transparent', 'data-sq': `pit-${topIdx}`, class: 'board-cell' } } })
      cells.push({ id: `pit-${pitsPerSide + botIdx}`, x: px, y: botY, element: { tag: 'circle', attrs: { cx: px, cy: botY, r: pitRadius, fill: 'transparent', 'data-sq': `pit-${pitsPerSide + botIdx}`, class: 'board-cell' } } })
    }

    return { width: boardW, height: boardH, elements, cells, labels: [], defs: [], tileSize: pitRadius * 1.6 }
  }

  function seedLayout(count, r) {
    const gap = r * 2.5
    if (count === 1) return [[0, 0]]
    if (count === 2) return [[-gap / 2, 0], [gap / 2, 0]]
    if (count === 3) return [[0, -gap / 2], [-gap / 2, gap / 2], [gap / 2, gap / 2]]
    if (count === 4) return [[-gap / 2, -gap / 2], [gap / 2, -gap / 2], [-gap / 2, gap / 2], [gap / 2, gap / 2]]
    if (count <= 6) {
      const top = Math.ceil(count / 2), bot = Math.floor(count / 2)
      const positions = []
      for (let i = 0; i < top; i++) positions.push([(i - (top - 1) / 2) * gap, -gap / 2])
      for (let i = 0; i < bot; i++) positions.push([(i - (bot - 1) / 2) * gap, gap / 2])
      return positions
    }
    if (count <= 9) {
      const rows = 3
      const perRow = [Math.ceil(count / 3), Math.ceil((count - Math.ceil(count / 3)) / 2), count - Math.ceil(count / 3) - Math.ceil((count - Math.ceil(count / 3)) / 2)]
      const positions = []
      for (let row = 0; row < rows; row++) {
        const n = perRow[row]
        for (let i = 0; i < n; i++) positions.push([(i - (n - 1) / 2) * gap, (row - 1) * gap])
      }
      return positions
    }
    const side = Math.ceil(Math.sqrt(count))
    const smallGap = gap * 0.8
    const positions = []
    for (let i = 0; i < count; i++) {
      const col = i % side, row = Math.floor(i / side)
      positions.push([(col - (side - 1) / 2) * smallGap, (row - (Math.ceil(count / side) - 1) / 2) * smallGap])
    }
    return positions
  }

  return {
    pitIndex,
    storeIndex,
    getOwner,
    isStore,
    isPit,
    isValid,
    sowSequence,
    getOpposite,
    getPlayerPits,
    neighbours,
    distance,
    toJSON,
    fromJSON,
    getCount,
    getPitsPerSide,
    getTotalPits,
    getLayout,
    renderLayout,
    serializePosition,
    parsePosition,
    pitsPerSide,
    totalPits,
    stores,
    players,
  }
}

// ─── Pit render pipeline — ONE parametric renderer for every pit board (#18) ───
//
// The notation is an ordered list of drawing ops (raw elements — pit boards
// are fully data-driven: producePitLayout computes all geometry from resolved
// frontmatter). The pipeline walks the list once, emits structured SVG
// elements, and collects interactive cells from data-sq attributes. It never
// branches on game or variant. Attribute order is insertion order — part of
// the byte-identity contract (snapshot suite must stay byte-identical).
// Game data (pit counts, store sizes, seed setups, colours) NEVER lives
// here — it arrives inside ops from produce-layout / frontmatter.

export function renderPitLayout(config = {}) {
  const elements = []
  const cells = []
  for (const op of config.ops || []) {
    PIT_OP_HANDLERS[op.op](op, elements, cells)
  }
  return { width: config.width || 0, height: config.height || 0, elements, cells, labels: [], defs: [] }
}

const PIT_OP_HANDLERS = {

  element(op, elements, cells) {
    elements.push({ tag: op.tag, attrs: op.attrs, text: op.text, children: op.children })
    if (op.attrs && op.attrs['data-sq'] !== undefined) {
      cells.push({ id: op.attrs['data-sq'], x: op.attrs.cx, y: op.attrs.cy })
    }
  },

  elements(op, elements, cells) {
    for (const item of op.items) {
      elements.push(item)
      if (item.attrs && item.attrs['data-sq'] !== undefined) {
        cells.push({ id: item.attrs['data-sq'], x: item.attrs.cx, y: item.attrs.cy })
      }
    }
  },

  group(op, elements) {
    elements.push({ tag: 'g', attrs: op.attrs, children: op.children })
  },
}
