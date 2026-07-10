export const schema = {
  type: 'track',
  required: ['positions'],
  parseBoard(board) {
    const match = board.match(/(\d+)/)
    if (!match) return null
    return { type: 'track', positions: parseInt(match[1], 10) }
  },
  matchBoard(board) {
    return /\d+[- ]point/i.test(board)
  },
}

export function createTrackTopology(config) {
  const { positions, circuit = false, branches = {} } = config
  const posMap = new Map()

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]
    const name = typeof pos === 'string' ? pos : pos.name
    const meta = typeof pos === 'string' ? {} : pos
    posMap.set(name, { index: i, name, ...meta })
  }

  function isValid(name) {
    return posMap.has(name)
  }

  function getIndex(name) {
    const pos = posMap.get(name)
    return pos ? pos.index : -1
  }

  function getName(index) {
    if (index < 0 || index >= positions.length) return null
    const pos = positions[index]
    return typeof pos === 'string' ? pos : pos.name
  }

  function next(name, steps = 1, opts = {}) {
    const { direction = 1, player } = opts
    let idx = getIndex(name)
    if (idx === -1) return null

    for (let i = 0; i < steps; i++) {
      const branchKey = player ? `${getName(idx)}:${player}` : null
      if (branchKey && branches[branchKey]) {
        idx = getIndex(branches[branchKey])
        if (idx === -1) return null
        continue
      }

      idx += direction
      if (circuit) {
        idx = ((idx % positions.length) + positions.length) % positions.length
      } else if (idx < 0 || idx >= positions.length) {
        return null
      }
    }
    return getName(idx)
  }

  function previous(name, steps = 1, opts = {}) {
    return next(name, steps, { ...opts, direction: -1 })
  }

  function distance(from, to) {
    const fromIdx = getIndex(from)
    const toIdx = getIndex(to)
    if (fromIdx === -1 || toIdx === -1) return -1

    if (!circuit) return Math.abs(toIdx - fromIdx)

    const forward = ((toIdx - fromIdx) + positions.length) % positions.length
    const backward = ((fromIdx - toIdx) + positions.length) % positions.length
    return Math.min(forward, backward)
  }

  function forwardDistance(from, to) {
    const fromIdx = getIndex(from)
    const toIdx = getIndex(to)
    if (fromIdx === -1 || toIdx === -1) return -1
    if (circuit) return ((toIdx - fromIdx) + positions.length) % positions.length
    return toIdx - fromIdx
  }

  function neighbours(name) {
    const idx = getIndex(name)
    if (idx === -1) return []
    const result = []
    if (idx > 0 || circuit) {
      const prevIdx = circuit ? (idx - 1 + positions.length) % positions.length : idx - 1
      result.push(getName(prevIdx))
    }
    if (idx < positions.length - 1 || circuit) {
      const nextIdx = circuit ? (idx + 1) % positions.length : idx + 1
      result.push(getName(nextIdx))
    }
    return result
  }

  function getRange(from, steps, direction = 1) {
    const results = []
    let current = from
    for (let i = 0; i < steps; i++) {
      current = next(current, 1, { direction })
      if (current === null) break
      results.push(current)
    }
    return results
  }

  function getMeta(name) {
    return posMap.get(name) || null
  }

  function getAll() {
    return positions.map(p => typeof p === 'string' ? p : p.name)
  }

  function getCount() {
    return positions.length
  }

  function toJSON(name) {
    return name
  }

  function fromJSON(str) {
    return str
  }

  function isCircuit() {
    return circuit
  }

  function getLayout(opts = {}) {
    const { cellSize = 40, style = 'linear' } = opts
    const all = getAll()

    if (style === 'points') return pointsLayout(all, opts)
    if (style === 'cross') return crossLayout(all, opts)

    return {
      getDimensions() {
        if (circuit && style === 'circuit') {
          const side = Math.ceil(all.length / 4)
          const dim = (side + 1) * cellSize
          return { width: dim, height: dim }
        }
        return { width: all.length * cellSize, height: cellSize * 2 }
      },
      getCells() {
        const cells = []
        const s = cellSize * 0.85
        function makeCell(key, cx, cy) {
          return { key, center: { x: cx, y: cy }, cellType: 'default', element: 'rect', attrs: { x: cx - s / 2, y: cy - s / 2, width: s, height: s } }
        }
        if (circuit && style === 'circuit') {
          const side = Math.ceil(all.length / 4)
          const dim = (side + 1) * cellSize
          let idx = 0
          for (let i = 0; i < Math.min(side, all.length - idx); i++)
            cells.push(makeCell(all[idx++], i * cellSize + cellSize / 2, cellSize / 2))
          for (let i = 0; i < Math.min(side, all.length - idx); i++)
            cells.push(makeCell(all[idx++], dim - cellSize / 2, i * cellSize + cellSize / 2))
          for (let i = 0; i < Math.min(side, all.length - idx); i++)
            cells.push(makeCell(all[idx++], dim - i * cellSize - cellSize / 2, dim - cellSize / 2))
          for (let i = 0; i < Math.min(side, all.length - idx); i++)
            cells.push(makeCell(all[idx++], cellSize / 2, dim - i * cellSize - cellSize / 2))
        } else {
          for (let i = 0; i < all.length; i++)
            cells.push(makeCell(all[i], i * cellSize + cellSize / 2, cellSize))
        }
        return cells
      },
      getLines() {
        const cells = this.getCells()
        const lines = []
        for (let i = 0; i < cells.length - 1; i++)
          lines.push({ x1: cells[i].center.x, y1: cells[i].center.y, x2: cells[i + 1].center.x, y2: cells[i + 1].center.y })
        if (circuit && cells.length > 1)
          lines.push({ x1: cells[cells.length - 1].center.x, y1: cells[cells.length - 1].center.y, x2: cells[0].center.x, y2: cells[0].center.y })
        return lines
      },
      defaults: {
        cells: { default: { fill: 'none', stroke: '#333', 'stroke-width': 1 } },
        lines: { stroke: '#333', 'stroke-width': 1.5 },
      },
    }
  }

  function pointsLayout(all, opts) {
    const {
      pointsPerSide = all.length / 2,
      pointWidth = 32,
      pointHeight = 120,
      boardHeight = 288,
      halves = true,
      gapBetweenHalves = 0,
    } = opts

    const perHalf = halves ? Math.ceil(pointsPerSide / 2) : pointsPerSide
    const totalW = halves
      ? perHalf * pointWidth * 2 + gapBetweenHalves
      : pointsPerSide * pointWidth

    return {
      getDimensions() {
        return { width: totalW, height: boardHeight }
      },
      getCells() {
        const cells = []
        const halfCount = halves ? perHalf : pointsPerSide

        for (let i = 0; i < all.length; i++) {
          const isBottom = i < pointsPerSide
          const sideIdx = isBottom ? (pointsPerSide - 1 - i) : (i - pointsPerSide)
          let x
          if (halves) {
            const half = sideIdx < halfCount ? 1 : 0
            const posInHalf = sideIdx < halfCount ? sideIdx : sideIdx - halfCount
            x = half * (halfCount * pointWidth + gapBetweenHalves) + posInHalf * pointWidth
          } else {
            x = sideIdx * pointWidth
          }
          const cx = x + pointWidth / 2
          const baseY = isBottom ? boardHeight : 0
          const tipY = isBottom ? boardHeight - pointHeight : pointHeight
          const cy = isBottom ? boardHeight - pointHeight / 3 : pointHeight / 3
          const cellType = i % 2 === 0 ? 'point-light' : 'point-dark'

          const x1 = x, x2 = x + pointWidth
          const pts = isBottom
            ? `${x1},${baseY} ${x2},${baseY} ${cx},${tipY}`
            : `${x1},${baseY} ${x2},${baseY} ${cx},${tipY}`

          cells.push({
            key: all[i],
            center: { x: cx, y: cy },
            cellType,
            element: 'polygon',
            attrs: { points: pts },
          })
        }
        return cells
      },
      defaults: {
        cells: {
          'point-light': { fill: '#c47e3b' },
          'point-dark': { fill: '#8b2500' },
        },
      },
    }
  }

  function crossLayout(all, opts) {
    const {
      cellSize = 20,
      armWidth = 3,
      armLength = 8,
      castles = [],
    } = opts

    const totalCells = armWidth * armLength * 4 + armWidth * armWidth
    const gridSize = armLength * 2 + armWidth
    const dim = gridSize * cellSize
    const armStart = armLength
    const armEnd = armLength + armWidth

    const castleSet = new Set(castles)

    function isInCross(r, c) {
      const inVertArm = c >= armStart && c < armEnd
      const inHorizArm = r >= armStart && r < armEnd
      return inVertArm || inHorizArm
    }

    function isCentre(r, c) {
      return r >= armStart && r < armEnd && c >= armStart && c < armEnd
    }

    return {
      getDimensions() {
        return { width: dim, height: dim }
      },
      getCells() {
        const cells = []
        let idx = 0
        for (let r = 0; r < gridSize; r++) {
          for (let c = 0; c < gridSize; c++) {
            if (!isInCross(r, c)) continue
            const key = idx < all.length ? all[idx] : `cell-${idx}`
            const x = c * cellSize
            const y = r * cellSize
            let cellType = 'default'
            if (isCentre(r, c)) cellType = 'centre'
            else if (castleSet.has(idx)) cellType = 'castle'

            cells.push({
              key,
              center: { x: x + cellSize / 2, y: y + cellSize / 2 },
              cellType,
              element: 'rect',
              attrs: { x, y, width: cellSize, height: cellSize },
            })
            idx++
          }
        }
        return cells
      },
      defaults: {
        cells: {
          default: { fill: '#f0d5a0', stroke: '#8b6545', 'stroke-width': 1 },
          castle: { fill: '#c0622f', stroke: '#8b6545', 'stroke-width': 1 },
          centre: { fill: '#8b1a1a', stroke: '#8b6545', 'stroke-width': 1.5 },
        },
      },
    }
  }

  function serializePosition(cellStates, vocabulary) {
    const symbolMap = buildTrackSymbolMap(vocabulary)
    const parts = []

    for (const name of getAll()) {
      const cell = cellStates[name] || (cellStates.get ? cellStates.get(name) : null)
      if (cell === null || cell === undefined) continue
      const idx = getIndex(name)
      if (Array.isArray(cell)) {
        for (const piece of cell) {
          const existing = parts.find(p => p.idx === idx && p.symbol === symbolMap.toSymbol(piece))
          if (existing) existing.count++
          else parts.push({ idx, symbol: symbolMap.toSymbol(piece), count: 1 })
        }
      } else if (cell.count !== undefined) {
        parts.push({ idx, symbol: symbolMap.toSymbol(cell), count: cell.count })
      } else {
        parts.push({ idx, symbol: symbolMap.toSymbol(cell), count: 1 })
      }
    }

    const specials = cellStates.bar || cellStates.home || null
    if (cellStates.bar) {
      for (const piece of (Array.isArray(cellStates.bar) ? cellStates.bar : [cellStates.bar])) {
        const sym = symbolMap.toSymbol(piece)
        const existing = parts.find(p => p.idx === 'bar' && p.symbol === sym)
        if (existing) existing.count++
        else parts.push({ idx: 'bar', symbol: sym, count: 1 })
      }
    }
    if (cellStates.home) {
      for (const piece of (Array.isArray(cellStates.home) ? cellStates.home : [cellStates.home])) {
        const sym = symbolMap.toSymbol(piece)
        const existing = parts.find(p => p.idx === 'home' && p.symbol === sym)
        if (existing) existing.count++
        else parts.push({ idx: 'home', symbol: sym, count: 1 })
      }
    }

    return parts.map(p => `${p.idx}:${p.count}${p.symbol}`).join(',')
  }

  function parsePosition(notation, vocabulary) {
    const symbolMap = buildTrackSymbolMap(vocabulary)
    const cellStates = {}

    if (!notation || notation === 'empty') return cellStates

    for (const part of notation.split(',')) {
      const match = part.trim().match(/^([^:]+):(\d+)([A-Za-z]+)$/)
      if (!match) continue
      const [, posKey, countStr, symbol] = match
      const count = parseInt(countStr, 10)
      const piece = symbolMap.fromSymbol(symbol)
      if (!piece) continue

      const key = (posKey === 'bar' || posKey === 'home') ? posKey : parseInt(posKey, 10)

      if (typeof key === 'number') {
        const name = getName(key)
        if (!name) continue
        if (!cellStates[name]) cellStates[name] = []
        for (let i = 0; i < count; i++) cellStates[name].push({ ...piece })
      } else {
        if (!cellStates[key]) cellStates[key] = []
        for (let i = 0; i < count; i++) cellStates[key].push({ ...piece })
      }
    }

    return cellStates
  }

  function buildTrackSymbolMap(vocabulary) {
    const toSym = new Map()
    const fromSym = new Map()

    if (!vocabulary) {
      return {
        toSymbol: (cell) => cell.symbol || '?',
        fromSymbol: (ch) => ({ symbol: ch }),
      }
    }

    for (const [type, def] of Object.entries(vocabulary)) {
      if (def.symbols) {
        for (const [owner, symbol] of Object.entries(def.symbols)) {
          if (owner === 'count') continue
          const ownerKey = /^\d+$/.test(owner) ? parseInt(owner, 10) : owner
          toSym.set(`${type}.${ownerKey}`, symbol)
          fromSym.set(symbol, { type, owner: ownerKey })
        }
      }
    }

    return {
      toSymbol(cell) {
        if (typeof cell === 'string') return cell
        const key = `${cell.type}.${cell.owner}`
        return toSym.get(key) || '?'
      },
      fromSymbol(ch) {
        return fromSym.get(ch) || null
      },
    }
  }

  function renderLayout(opts = {}) {
    const style = opts.style || 'points'
    if (style === 'points') return renderPointsLayout(opts)
    if (style === 'perimeter') return renderPerimeterLayout(opts)
    return { width: 0, height: 0, elements: [], cells: [], labels: [], defs: [] }
  }

  function renderPerimeterLayout(opts) {
    const totalSpaces = opts.totalSpaces || 40
    const corners = opts.corners || 4
    const perSide = (totalSpaces - corners) / corners
    const spaceW = opts.spaceW || 56
    const cornerSize = opts.cornerSize || 80
    const boardW = opts.boardW || (cornerSize * 2 + perSide * spaceW)
    const boardH = opts.boardH || boardW
    const colors = opts.colors || {}

    const elements = []
    const cells = []

    // Board background
    elements.push({ tag: 'rect', attrs: { x: 0, y: 0, width: boardW, height: boardH, fill: colors.board || '#f0e4c8' } })
    // Border
    elements.push({ tag: 'rect', attrs: { x: 2, y: 2, width: boardW - 4, height: boardH - 4, fill: 'none', stroke: colors.border || '#5a4a30', 'stroke-width': 2.5 } })

    // Corner positions (clockwise from bottom-right: BR, BL, TL, TR)
    const cornerPositions = [
      { x: boardW - cornerSize, y: boardH - cornerSize },
      { x: 0, y: boardH - cornerSize },
      { x: 0, y: 0 },
      { x: boardW - cornerSize, y: 0 },
    ]

    // Render corners
    const cornerSpaces = opts.cornerSpaces || []
    for (let ci = 0; ci < corners; ci++) {
      const pos = cornerPositions[ci]
      const space = cornerSpaces[ci] || {}
      const fill = space.fill || colors.corner || '#e8d8b8'
      const id = space.id || `corner-${ci}`

      elements.push({ tag: 'rect', attrs: {
        x: pos.x, y: pos.y, width: cornerSize, height: cornerSize,
        fill, stroke: colors.cornerStroke || '#5a4a30', 'stroke-width': 1.5,
        class: 'board-cell', 'data-sq': id, 'data-type': 'corner',
      } })

      // Corner decorations — coordinates relative to corner origin
      if (space.decorations) {
        const decEls = space.decorations.map(dec => {
          const a = { ...dec.attrs }
          delete a.x
          delete a.y
          return { ...dec, attrs: a }
        })
        elements.push({ tag: 'g', attrs: { transform: `translate(${pos.x},${pos.y})` }, children: decEls })
      }

      // Corner texts from config
      if (space.texts) {
        for (const t of space.texts) {
          elements.push({ tag: 'text', attrs: {
            x: pos.x + cornerSize / 2 + (t.dx || 0),
            y: pos.y + cornerSize / 2 + (t.dy || 0),
            'text-anchor': 'middle', 'dominant-baseline': 'central',
            'font-size': t.fontSize || 8, 'font-weight': t.fontWeight || 'bold',
            'font-family': t.fontFamily || 'sans-serif', fill: t.fill || colors.text || '#333',
            ...(t.attrs || {}),
          }, text: t.text })
        }
      }

      cells.push({ id, x: pos.x + cornerSize / 2, y: pos.y + cornerSize / 2 })
    }

    // Side spaces (4 sides: bottom, left, top, right)
    const sides = ['bottom', 'left', 'top', 'right']
    const sideSpaces = opts.sideSpaces || { bottom: [], left: [], top: [], right: [] }

    for (const side of sides) {
      const arr = sideSpaces[side] || []
      const count = arr.length || perSide
      for (let i = 0; i < count; i++) {
        const space = arr[i] || {}
        const rect = getPerimeterRect(side, i, count, cornerSize, boardW, boardH)
        const fill = space.fill || '#f0f0f0'
        const id = space.id || `${side}-${i}`

        elements.push({ tag: 'rect', attrs: {
          x: rect.x, y: rect.y, width: rect.w, height: rect.h,
          fill, stroke: colors.spaceStroke || '#5a4a30',
          'stroke-width': opts.spaceStrokeWidth || 0.75,
          class: 'board-cell', 'data-sq': id, 'data-type': space.type || 'space',
        } })

        // Space decorations (stripes, patterns) — coordinates relative to space rect origin
        if (space.decorations) {
          const decEls = space.decorations.map(dec => ({ ...dec, attrs: { ...dec.attrs } }))
          elements.push({ tag: 'g', attrs: { transform: `translate(${rect.x},${rect.y})` }, children: decEls })
        }

        // Space text (rendered centred within the cell via transform group)
        if (space.texts) {
          const cx = rect.x + rect.w / 2
          const cy = rect.y + rect.h / 2
          const textEls = space.texts.map(t => ({
            tag: 'text', attrs: {
              x: t.dx || 0, y: t.dy || 0,
              'text-anchor': 'middle', 'dominant-baseline': 'central',
              'font-size': t.fontSize || 6, 'font-weight': t.fontWeight || 'normal',
              'font-family': t.fontFamily || 'serif', fill: t.fill || colors.text || '#333',
              ...(t.attrs || {}),
            }, text: t.text,
          }))
          elements.push({ tag: 'g', attrs: { transform: `translate(${cx},${cy})` }, children: textEls })
        }

        cells.push({ id, x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 })
      }
    }

    // Inner area
    const innerX = cornerSize, innerY = cornerSize
    const innerW = boardW - cornerSize * 2, innerH = boardH - cornerSize * 2
    elements.push({ tag: 'rect', attrs: {
      x: innerX, y: innerY, width: innerW, height: innerH,
      fill: colors.innerBg || '#f0e4c8',
    } })

    // Inner content from config (arbitrary elements)
    if (opts.innerContent) {
      for (const el of opts.innerContent) {
        elements.push(el)
      }
    }

    // Inner cells (addressable positions inside the board)
    if (opts.innerCells) {
      for (const ic of opts.innerCells) {
        cells.push({ id: ic.id, x: ic.x, y: ic.y })
        if (ic.element) elements.push(ic.element)
      }
    }

    return { width: boardW, height: boardH, elements, cells, labels: [], defs: [] }
  }

  function getPerimeterRect(side, idx, count, cornerSize, boardW, boardH) {
    const spanW = boardW - cornerSize * 2
    const spanH = boardH - cornerSize * 2
    const cellW = spanW / count
    const cellH = spanH / count

    if (side === 'bottom') {
      return { x: boardW - cornerSize - (idx + 1) * cellW, y: boardH - cornerSize, w: cellW, h: cornerSize }
    }
    if (side === 'left') {
      return { x: 0, y: boardH - cornerSize - (idx + 1) * cellH, w: cornerSize, h: cellH }
    }
    if (side === 'top') {
      return { x: cornerSize + idx * cellW, y: 0, w: cellW, h: cornerSize }
    }
    if (side === 'right') {
      return { x: boardW - cornerSize, y: cornerSize + idx * cellH, w: cornerSize, h: cellH }
    }
    return { x: 0, y: 0, w: cellW, h: cellH }
  }

  function renderPointsLayout(opts) {
    const colors = opts.colors || {}
    const frameW = opts.frameW || 16
    const barW = opts.barW || 24
    const pointW = opts.pointW || 32
    const pointsPerSide = opts.pointsPerSide || 6
    const panelW = pointW * pointsPerSide
    const boardW = opts.boardW || (frameW * 2 + panelW * 2 + barW)
    const boardH = opts.boardH || 320
    const panelH = boardH - frameW * 2
    const pointH = opts.pointH || Math.round(panelH * 0.417)
    const pieceSize = opts.pieceSize || 22
    const pieceSpacing = opts.pieceSpacing || 22
    const maxStack = opts.maxStack || 5

    const elements = []
    const cells = []

    // Board frame
    elements.push({ tag: 'rect', attrs: { x: 0, y: 0, width: boardW, height: boardH, rx: 6, ry: 6, fill: colors.frame || '#3d2b1f' } })
    // Left felt panel
    elements.push({ tag: 'rect', attrs: { x: frameW, y: frameW, width: panelW, height: panelH, fill: colors.felt || '#1a5c3a' } })
    // Right felt panel
    elements.push({ tag: 'rect', attrs: { x: frameW + panelW + barW, y: frameW, width: panelW, height: panelH, fill: colors.felt || '#1a5c3a' } })
    // Centre bar
    elements.push({ tag: 'rect', attrs: { x: frameW + panelW, y: 0, width: barW, height: boardH, fill: colors.frame || '#3d2b1f' } })

    const bottomBase = boardH - frameW
    const topBase = frameW
    const totalPoints = pointsPerSide * 4

    // 24 triangular points
    for (let i = 0; i < totalPoints; i++) {
      const quadrant = Math.floor(i / pointsPerSide)
      const posInQuad = i % pointsPerSide
      const isBottom = quadrant === 0 || quadrant === 1
      const isRight = quadrant === 0 || quadrant === 3
      const panelX = isRight ? frameW + panelW + barW : frameW
      const ptColor = ((posInQuad % 2 === 0) === isBottom) ? (colors.pointA || '#c47e3b') : (colors.pointB || '#8b2500')

      let lx
      if (isBottom) {
        lx = panelX + panelW - (posInQuad + 1) * pointW
      } else {
        lx = panelX + posInQuad * pointW
      }

      const x1 = lx, x2 = lx + pointW, tipX = lx + pointW / 2

      if (isBottom) {
        const baseY = bottomBase, tipY = bottomBase - pointH
        elements.push({ tag: 'polygon', attrs: { points: `${x1},${baseY} ${x2},${baseY} ${tipX},${tipY}`, fill: ptColor } })
      } else {
        const baseY = topBase, tipY = topBase + pointH
        elements.push({ tag: 'polygon', attrs: { points: `${x1},${baseY} ${x2},${baseY} ${tipX},${tipY}`, fill: ptColor } })
      }

      cells.push({ id: `point-${i + 1}`, x: tipX, y: isBottom ? bottomBase - pointH / 2 : topBase + pointH / 2,
        element: { tag: 'polygon', attrs: { points: isBottom ? `${x1},${bottomBase} ${x2},${bottomBase} ${tipX},${bottomBase - pointH}` : `${x1},${topBase} ${x2},${topBase} ${tipX},${topBase + pointH}`, fill: 'transparent', 'data-sq': `point-${i + 1}`, class: 'board-cell' } } })
    }

    // Checkers from parsedSetup
    const setup = opts.parsedSetup || null
    if (setup) {
      const pieceImages = opts.pieceImages || {}
      const darkImg = pieceImages.bM || pieceImages.b || null
      const lightImg = pieceImages.wM || pieceImages.w || null

      for (let i = 0; i < totalPoints; i++) {
        const dark = setup.dark ? (setup.dark[i] || 0) : 0
        const light = setup.light ? (setup.light[i] || 0) : 0
        if (!dark && !light) continue

        const quadrant = Math.floor(i / pointsPerSide)
        const posInQuad = i % pointsPerSide
        const isBottom = quadrant === 0 || quadrant === 1
        const isRight = quadrant === 0 || quadrant === 3
        const panelX = isRight ? frameW + panelW + barW : frameW

        let lx
        if (isBottom) {
          lx = panelX + panelW - (posInQuad + 1) * pointW
        } else {
          lx = panelX + posInQuad * pointW
        }
        const cx = lx + pointW / 2

        const renderStack = (count, img, isDark, startY, dir) => {
          const show = Math.min(count, maxStack)
          const overflow = count > maxStack ? count - (maxStack - 1) : 0
          for (let j = 0; j < show; j++) {
            const cy = startY + dir * j * pieceSpacing
            if (img) {
              elements.push({ tag: 'image', attrs: { href: img, x: cx - pieceSize / 2, y: cy - pieceSize / 2, width: pieceSize, height: pieceSize } })
            } else {
              elements.push({ tag: 'circle', attrs: { cx, cy, r: pieceSize / 2 - 1, fill: isDark ? '#191716' : '#F8F6F2', stroke: isDark ? '#4d433a' : '#5E5854', 'stroke-width': 1.5 } })
            }
            if (j === 0 && overflow > 0) {
              elements.push({ tag: 'text', attrs: { x: cx, y: cy + 4, 'font-family': 'sans-serif', 'font-size': 9, 'font-weight': 'bold', 'text-anchor': 'middle', fill: isDark ? '#fff' : '#333' }, text: String(overflow) })
            }
          }
        }

        if (dark > 0) {
          const startY = isBottom ? bottomBase - pieceSize / 2 - 2 : topBase + pieceSize / 2 + 2
          const dir = isBottom ? -1 : 1
          renderStack(dark, darkImg, true, startY, dir)
        }
        if (light > 0) {
          const startY = isBottom ? bottomBase - pieceSize / 2 - 2 : topBase + pieceSize / 2 + 2
          const dir = isBottom ? -1 : 1
          renderStack(light, lightImg, false, startY, dir)
        }
      }
    }

    return { width: boardW, height: boardH, elements, cells, labels: [], defs: [], tileSize: pieceSize }
  }

  return {
    isValid,
    getIndex,
    getName,
    next,
    previous,
    distance,
    forwardDistance,
    neighbours,
    getRange,
    getMeta,
    getAll,
    getCount,
    toJSON,
    fromJSON,
    isCircuit,
    getLayout,
    renderLayout,
    serializePosition,
    parsePosition,
  }
}
