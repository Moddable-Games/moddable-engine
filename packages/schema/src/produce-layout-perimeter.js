function perimeterWrapText(text, maxChars) {
  if (text.length <= maxChars) return [text]
  const words = text.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      lines.push(current)
      current = word
    } else {
      current = current ? current + ' ' + word : word
    }
  }
  if (current) lines.push(current)
  return lines
}

function perimeterCornerOrder(board, spaces) {
  const corners = spaces.filter(s => s.side === 'corner')
  const order = board.cornerOrder || [0, 1, 2, 3]
  return order.map(i => corners[i])
}

function perimeterSpaceRect(side, idx, count, cornerSize, boardW, boardH) {
  const spanW = boardW - cornerSize * 2
  const spanH = boardH - cornerSize * 2
  const cellW = spanW / count
  const cellH = spanH / count
  if (side === 'bottom') return { x: boardW - cornerSize - (idx + 1) * cellW, y: boardH - cornerSize, w: cellW, h: cornerSize }
  if (side === 'left') return { x: 0, y: boardH - cornerSize - (idx + 1) * cellH, w: cornerSize, h: cellH }
  if (side === 'top') return { x: cornerSize + idx * cellW, y: 0, w: cellW, h: cornerSize }
  if (side === 'right') return { x: boardW - cornerSize, y: cornerSize + idx * cellH, w: cornerSize, h: cellH }
  return { x: 0, y: 0, w: cellW, h: cellH }
}

// Each historical edition of the game was printed differently: the patent
// drawing puts its corners in circular medallions, the 1906 board splits its
// corner squares diagonally, the 1932 board uses pie wedges and coloured
// stripes. Those are three drawing styles, and they used to be selected by
// twelve `style === 'medallion'` tests inside this file - a layout
// producer that is not supposed to know one game from another, holding the
// slugs of three specific editions.
//
// The style is now a property of the board, declared alongside the spaces it
// applies to, so a new edition picks one without touching this file. Boards
// that declare nothing get the plain style, which is what a board with no
// special printing should look like.
const PERIMETER_STYLES = new Set(['medallion', 'split-corner', 'stripe', 'plain'])

function perimeterStyle(board) {
  const declared = board && board.style
  return PERIMETER_STYLES.has(declared) ? declared : 'plain'
}


// Players standing on the track. The perimeter layout drew its spaces and
// nothing else - it had no concept of a token at all - so a landlords game
// rendered a board with both players invisible and no way to see the game
// being played. Every space already carries `data-sq="pos-N"` with its
// rectangle, so the positions come from what has just been drawn.
const TOKEN_COLOURS = ['#c0392b', '#2471a3', '#1e8449', '#b7950b', '#6c3483', '#117864']

function tokenElements(els, tokens) {
  if (!tokens || !tokens.length) return []
  const rects = new Map()
  for (const entry of els) {
    const attrs = entry?.attrs
    const square = attrs?.['data-sq']
    if (!square || attrs.x === undefined || attrs.width === undefined) continue
    if (!rects.has(square)) rects.set(square, attrs)
  }
  const out = []
  const perSquare = new Map()
  for (const token of tokens) {
    const attrs = rects.get(token.square)
    if (!attrs) continue
    // Two players on one space must not sit exactly on top of each other.
    const seen = perSquare.get(token.square) || 0
    perSquare.set(token.square, seen + 1)
    const w = Number(attrs.width) || 0
    const h = Number(attrs.height) || w
    const r = Math.max(3, Math.min(w, h) * 0.22)
    const cx = Number(attrs.x) + w / 2 + (seen - 0.5) * r * 1.2
    const cy = Number(attrs.y) + h / 2
    out.push({
      op: 'element',
      tag: 'circle',
      attrs: {
        cx: cx.toFixed(1), cy: cy.toFixed(1), r: r.toFixed(1),
        fill: TOKEN_COLOURS[token.seat % TOKEN_COLOURS.length],
        stroke: '#1a1a1a', 'stroke-width': 1.2, 'pointer-events': 'none',
      },
    })
  }
  return out
}

export function perimeterOps(colors, render) {
  const variant = render._board || '1904-patent'
  const boardData = render._boardData || null
  const board = boardData ? boardData.boards[variant] : null
  const style = perimeterStyle(board)

  const els = []
  const el = (tag, attrs, text) => els.push({ op: 'element', tag, attrs, text })
  const group = (attrs, children) => els.push({ op: 'element', tag: 'g', attrs, children })

  if (!board) {
    el('rect', { x: 0, y: 0, width: 400, height: 60, fill: '#f5e6c8' })
    el('text', { x: 200, y: 35, 'text-anchor': 'middle', 'font-size': 12, fill: '#888' }, `No board data for "${variant}"`)
    return { type: 'track', config: { style: 'perimeter', ops: els, width: 400, height: 60 } }
  }

  // The palette is the board's surface colours, declared in frontmatter.
  const theme = colors || {}
  const totalSpaces = board.totalSpaces
  const corners = 4
  const perSide = (totalSpaces - corners) / 4
  const spaceW = render.spaceWidth || 56
  const cornerSize = render.cornerSize || 80
  const boardW = cornerSize * 2 + perSide * spaceW
  const boardH = boardW

  el('rect', { x: 0, y: 0, width: boardW, height: boardH, fill: theme.board })
  el('rect', { x: 2, y: 2, width: boardW - 4, height: boardH - 4, fill: 'none', stroke: theme.border, 'stroke-width': 2.5 })

  const spaces = board.spaces
  const sideSpaces = { bottom: [], left: [], top: [], right: [] }
  for (const s of spaces) {
    if (s.side !== 'corner' && sideSpaces[s.side]) sideSpaces[s.side].push(s)
  }

  const cornerOrder = perimeterCornerOrder(board, spaces)
  const cornerPositions = [
    { x: boardW - cornerSize, y: boardH - cornerSize },
    { x: 0, y: boardH - cornerSize },
    { x: 0, y: 0 },
    { x: boardW - cornerSize, y: 0 },
  ]

  const renderCorner = (space, x, y, size) => {
    // The role is declared in the board data, not inferred from the English in
    // `notes`. Reading prose to pick a fill made the renderer depend on the
    // exact wording of a transcription, and put a game's vocabulary inside a
    // layout producer that is not supposed to know one game from another.
    const isGoToJail = space.role === 'go-to-jail' || space.type === 'go-to-jail'
    const cornerFill = isGoToJail && theme['go-to-jail'] ? theme['go-to-jail'] : theme.corner
    el('rect', { x, y, width: size, height: size, fill: cornerFill, stroke: theme['corner-stroke'], 'stroke-width': 1.5, class: 'board-cell', 'data-sq': `pos-${space.pos}`, 'data-type': 'corner' })

    if (style === 'medallion') {
      // medallion rendered in second pass (after track cells) so it overlaps
    } else if (style === 'split-corner' && space.split) {
      const sp = space.split
      const spColor = theme[sp.type] || theme.corner
      const mainColor = theme.corner
      const isJail = space.name === 'JAIL'
      if (isJail) {
        el('polygon', { points: `${x},${y} ${x + size},${y} ${x + size},${y + size}`, fill: spColor, stroke: 'none', class: 'board-cell', 'data-sq': `pos-${space.pos}b`, 'data-type': sp.type })
        el('polygon', { points: `${x},${y} ${x},${y + size} ${x + size},${y + size}`, fill: mainColor, stroke: 'none', class: 'board-cell', 'data-sq': `pos-${space.pos}a`, 'data-type': 'corner' })
        el('line', { x1: x, y1: y, x2: x + size, y2: y + size, stroke: theme['corner-stroke'], 'stroke-width': 1 })
        const q1x = x + size * 0.7, q1y = y + size * 0.3
        const q2x = x + size * 0.3, q2y = y + size * 0.7
        el('text', { x: q1x, y: q1y - 3, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, 'dominant-baseline': 'central' }, sp.name)
        if (sp.tax) el('text', { x: q1x, y: q1y + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'serif', fill: theme.text, 'dominant-baseline': 'central' }, `Tax $${sp.tax}`)
        el('text', { x: q2x, y: q2y, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, 'dominant-baseline': 'central' }, space.name)
      } else {
        el('polygon', { points: `${x},${y} ${x + size},${y} ${x},${y + size}`, fill: spColor, stroke: 'none', class: 'board-cell', 'data-sq': `pos-${space.pos}b`, 'data-type': sp.type })
        el('polygon', { points: `${x + size},${y} ${x + size},${y + size} ${x},${y + size}`, fill: mainColor, stroke: 'none', class: 'board-cell', 'data-sq': `pos-${space.pos}a`, 'data-type': 'corner' })
        el('line', { x1: x, y1: y + size, x2: x + size, y2: y, stroke: theme['corner-stroke'], 'stroke-width': 1 })
        const q1x = x + size * 0.3, q1y = y + size * 0.3
        const q2x = x + size * 0.7, q2y = y + size * 0.7
        el('text', { x: q1x, y: q1y, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, 'dominant-baseline': 'central' }, sp.name)
        el('text', { x: q2x, y: q2y - 3, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, 'dominant-baseline': 'central' }, space.name)
        el('text', { x: q2x, y: q2y + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'serif', fill: theme.text, 'dominant-baseline': 'central' }, 'Free')
      }
      el('rect', { x, y, width: size, height: size, fill: 'none', stroke: theme['corner-stroke'], 'stroke-width': 1.5 })
      return
    } else if (style === 'stripe') {
      const cx = x + size / 2, cy = y + size / 2
      const r = size * 0.42
      if (space.name === 'WAGES') {
        const wagesColors = ['#2a5a9a', '#3a8a3a', '#c8b020', '#8c2020']
        for (let i = 0; i < 4; i++) {
          const a1 = (i * Math.PI / 2) - Math.PI / 2
          const a2 = ((i + 1) * Math.PI / 2) - Math.PI / 2
          const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
          const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2)
          el('path', { d: `M ${x1},${y1} A ${r},${r} 0 0,1 ${x2},${y2}`, fill: 'none', stroke: wagesColors[i], 'stroke-width': 4 })
        }
      } else if (space.fare) {
        el('path', { d: `M ${cx - r},${cy} A ${r},${r} 0 1,1 ${cx + r},${cy} A ${r},${r} 0 1,1 ${cx - r},${cy}`, fill: 'none', stroke: theme['corner-arc'], 'stroke-width': 3.5 })
      } else if (space.name === 'JAIL') {
        const bw = size * 0.85
        el('rect', { x: cx - bw / 2, y: cy - bw / 2, width: bw, height: bw, fill: 'none', stroke: '#4a4a4a', 'stroke-width': 2 })
        const bars = 4
        const gap = bw / (bars + 1)
        for (let i = 1; i <= bars; i++) {
          el('line', { x1: cx - bw / 2 + i * gap, y1: cy - bw / 2 + 2, x2: cx - bw / 2 + i * gap, y2: cy + bw / 2 - 2, stroke: '#3a3a3a', 'stroke-width': 1.5 })
        }
      }
    }

    const cx = x + size / 2, cy = y + size / 2
    if (style === 'medallion') {
      // text rendered in medallion second pass
    } else {
      const lines = perimeterWrapText(space.name, 10)
      const lineH = size > 70 ? 11 : 9
      const nameY = cy - 8
      for (let i = 0; i < lines.length; i++) {
        el('text', { x: cx, y: nameY + i * lineH, 'text-anchor': 'middle', 'font-size': size > 70 ? 8 : 7, 'font-weight': 'bold', 'font-family': 'sans-serif', fill: theme['title-text'], 'dominant-baseline': 'central' }, lines[i])
      }
      let subtext = ''
      if (space.fare) subtext = `Fare $${space.fare}`
      else if (space.notes) subtext = space.notes.length > 24 ? space.notes.slice(0, 23) + '.' : space.notes
      if (subtext) {
        el('text', { x: cx, y: cy + lines.length * lineH / 2 + 8, 'text-anchor': 'middle', 'font-size': 5.5, 'font-family': 'sans-serif', fill: theme.text, 'dominant-baseline': 'central' }, subtext)
      }
    }
  }

  for (let ci = 0; ci < 4; ci++) {
    renderCorner(cornerOrder[ci], cornerPositions[ci].x, cornerPositions[ci].y, cornerSize)
  }

  if (style === 'medallion') {
    for (let ci = 0; ci < 4; ci++) {
      const pos = cornerPositions[ci]
      const cx = pos.x + cornerSize / 2, cy = pos.y + cornerSize / 2
      el('circle', { cx, cy, r: cornerSize * 0.72, fill: theme.corner, stroke: theme['corner-stroke'], 'stroke-width': 1.5 })
    }
  }

  const renderSpaceTexts = (space, textW, textH) => {
    const children = []
    const t = (attrs, content) => children.push({ tag: 'text', attrs, text: content })
    if (style === 'stripe') {
      const category = board.categories?.[space.type] || ''
      const narrow = textW < textH
      const fontSize = narrow ? 5 : 6
      const catSize = narrow ? 3.2 : 3.8
      const detSize = narrow ? 3.5 : 4
      const maxChars = Math.floor(textW / (narrow ? 3.6 : 4.2))
      let name = space.name
      if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'
      t({ 'text-anchor': 'end', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text, opacity: 0.6, x: textW * 0.44, y: -textH * 0.38 }, String(space.pos))
      if (category) {
        t({ 'text-anchor': 'middle', 'font-size': catSize, 'font-family': 'sans-serif', fill: theme.text, x: 0, y: -textH * 0.39 }, category)
      }
      t({ 'text-anchor': 'middle', 'font-size': fontSize, 'font-weight': 'bold', 'font-family': 'sans-serif', fill: theme.text, x: 0, y: category ? 2 : 0 }, name)
      let detail = ''
      if (space.rent) detail = `Land Rent $${space.rent}`
      else if (space.tax) detail = `$${space.tax}`
      else if (space.fare) detail = `Fare $${space.fare}`
      else if (space.price && space.type === 'franchise') detail = `$${space.price}`
      if (detail) {
        t({ 'text-anchor': 'middle', 'font-size': detSize, 'font-family': 'sans-serif', fill: theme.text, x: 0, y: textH * 0.39 }, detail)
      }
    } else if (style === 'split-corner') {
      const narrow = textW < textH
      const fontSize = narrow ? 4.5 : 6
      const detSize = narrow ? 3.5 : 4.5
      const maxChars = Math.floor(textW / (narrow ? 3.4 : 4.2))
      let name = space.name
      if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'
      const textColor = space.type === 'chance' ? '#fff' : theme.text
      t({ 'text-anchor': 'middle', 'font-size': fontSize, 'font-weight': 'bold', 'font-family': 'serif', fill: textColor, x: 0, y: narrow ? -2 : -4 }, name)
      let detail = ''
      if (space.price && space.rent) detail = `$${space.price} / Rent $${space.rent}`
      else if (space.price) detail = `$${space.price}`
      else if (space.rent) detail = `Rent $${space.rent}`
      else if (space.tax) detail = `Tax $${space.tax}`
      else if (space.fare) detail = `Fare $${space.fare}`
      else if (space.fee) detail = `Fee $${space.fee}`
      if (detail) {
        t({ 'text-anchor': 'middle', 'font-size': detSize, 'font-family': 'serif', fill: textColor, x: 0, y: narrow ? 6 : 8 }, detail)
      }
    } else {
      const narrow = textW < textH
      const fontSize = narrow ? 4.5 : 6
      const detSize = narrow ? 3.5 : 4.5
      const maxChars = Math.floor(textW / (narrow ? 3.4 : 4.5))
      let name = space.name
      if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'
      t({ 'text-anchor': 'middle', 'font-size': fontSize, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, x: 0, y: narrow ? -4 : -6 }, name)
      const lines = []
      if (space.rent) lines.push(`Rent $${space.rent}`)
      if (space.price) lines.push(`Sale $${space.price}`)
      if (space.tax) lines.push(`Tax $${space.tax}`)
      if (space.fare) lines.push(`Fare $${space.fare}`)
      if (space.fee) lines.push(`Fee $${space.fee}`)
      if (space.receive) lines.push(`+$${space.receive}`)
      const lineH = narrow ? 6 : 8
      for (let i = 0; i < lines.length; i++) {
        t({ 'text-anchor': 'middle', 'font-size': detSize, 'font-family': 'serif', fill: theme.text, x: 0, y: (narrow ? 3 : 4) + i * lineH }, lines[i])
      }
    }
    return children
  }

  const sideOrder = ['bottom', 'left', 'top', 'right']
  for (let si = 0; si < 4; si++) {
    const side = sideOrder[si]
    const sideArr = sideSpaces[side]
    if (!sideArr.length) continue
    for (let i = 0; i < sideArr.length; i++) {
      const space = sideArr[i]
      const { x, y, w, h } = perimeterSpaceRect(side, i, sideArr.length, cornerSize, boardW, boardH)
      const typeFill = theme[space.type] || '#f0f0f0'
      const strokeW = style === 'medallion' ? 1.5 : 0.75
      el('rect', { x, y, width: w, height: h, fill: typeFill, stroke: theme['space-stroke'], 'stroke-width': strokeW, class: 'board-cell', 'data-sq': `pos-${space.pos}`, 'data-type': space.type })

      if (style === 'stripe') {
        const stripeColor = theme[space.type + '-stripe']
        if (stripeColor) {
          const bandRatio = 0.22
          const lineW = 1.2
          const bh = h * bandRatio
          el('rect', { x: x + 0.5, y: y + 0.5, width: w - 1, height: bh, fill: stripeColor, opacity: 0.35 })
          el('line', { x1: x + 0.5, y1: y + bh, x2: x + w - 0.5, y2: y + bh, stroke: stripeColor, 'stroke-width': lineW })
          el('rect', { x: x + 0.5, y: y + h - bh - 0.5, width: w - 1, height: bh, fill: stripeColor, opacity: 0.35 })
          el('line', { x1: x + 0.5, y1: y + h - bh, x2: x + w - 0.5, y2: y + h - bh, stroke: stripeColor, 'stroke-width': lineW })
        }
      }

      group({ transform: `translate(${x + w / 2},${y + h / 2}) rotate(0)` }, renderSpaceTexts(space, w, h))
    }
  }

  if (style === 'medallion') {
    for (let ci = 0; ci < 4; ci++) {
      const space = cornerOrder[ci]
      const pos = cornerPositions[ci]
      const cx = pos.x + cornerSize / 2, cy = pos.y + cornerSize / 2
      const r = cornerSize * 0.72
      const fontSize = space.name.length > 12 ? 6 : space.name.length > 8 ? 7 : 9
      const maxChars = Math.floor((r * 1.2) / (fontSize * 0.55))
      const lines = perimeterWrapText(space.name, maxChars)
      const lineH = fontSize + 3
      const blockH = lines.length * lineH
      const startY = cy - blockH / 2 + lineH / 2 - (space.notes ? 3 : 0)
      for (let i = 0; i < lines.length; i++) {
        el('text', { x: cx, y: startY + i * lineH, 'text-anchor': 'middle', 'font-size': fontSize, 'font-weight': 'bold', 'font-family': 'serif', fill: theme['title-text'], 'dominant-baseline': 'central' }, lines[i])
      }
      if (space.notes) {
        const sub = space.notes.length > 22 ? space.notes.slice(0, 21) + '.' : space.notes
        el('text', { x: cx, y: startY + blockH + 4, 'text-anchor': 'middle', 'font-size': 4.5, 'font-family': 'serif', fill: theme.text, 'dominant-baseline': 'central' }, sub)
      }
    }
  }

  perimeterInner(el, board, cornerSize, boardW, boardH, theme, style)

  els.push(...tokenElements(els, render._tokens))

  return { type: 'track', config: { style: 'perimeter', ops: els, width: boardW, height: boardH } }
}

function perimeterInner(el, board, cornerSize, boardW, boardH, theme, style) {
  const innerX = cornerSize, innerY = cornerSize
  const innerW = boardW - cornerSize * 2, innerH = boardH - cornerSize * 2
  el('rect', { x: innerX, y: innerY, width: innerW, height: innerH, fill: theme['inner-bg'] })

  const cx = boardW / 2, cy = boardH / 2

  if (style === 'stripe') {
    const r = innerW * 0.32
    const b = r / Math.SQRT2
    const c = r * (1 - 1 / Math.SQRT2)
    const pts = [
      [0, -r], [c, -b], [b, -b], [b, -c],
      [r, 0], [b, c], [b, b], [c, b],
      [0, r], [-c, b], [-b, b], [-b, c],
      [-r, 0], [-b, -c], [-b, -b], [-c, -b],
    ].map(([px, py]) => `${cx + px},${cy + py}`).join(' ')
    el('polygon', { points: pts, fill: 'none', stroke: theme['title-text'], 'stroke-width': 2.5 })
    el('text', { x: cx, y: cy - 16, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 'bold', 'font-family': 'serif', fill: theme['title-text'] }, 'THE')
    el('text', { x: cx, y: cy + 2, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 'bold', 'font-family': 'serif', fill: theme['title-text'] }, "LANDLORD'S GAME")
    el('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', 'font-size': 8, 'font-family': 'serif', fill: theme['title-text'] }, 'AND PROSPERITY')
    el('text', { x: cx, y: cy + 36, 'text-anchor': 'middle', 'font-size': 5.5, 'font-family': 'serif', fill: theme.text }, 'A Magie Game — Patent No. 1,509,312')
    el('text', { x: cx, y: cy + 46, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, 'Adgame Company (Inc.), Washington, D.C.')

    const labelOff = 14
    el('text', { x: cx, y: innerY + labelOff, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'sans-serif', fill: '#c8b020' }, 'Your Checker Yellow')
    el('text', { x: cx, y: innerY + innerH - labelOff + 4, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'sans-serif', fill: '#2a5a9a' }, 'Your Checker Blue')
    el('text', { x: innerX + labelOff, y: cy, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'sans-serif', fill: '#3a8a3a', transform: `rotate(-90,${innerX + labelOff},${cy})` }, 'Your Checker Green')
    el('text', { x: innerX + innerW - labelOff, y: cy, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'sans-serif', fill: '#8c2020', transform: `rotate(90,${innerX + innerW - labelOff},${cy})` }, 'Your Checker Red')

    const starEdge = r / Math.SQRT2
    const checkerZone = labelOff + 6
    const leftEdge = innerX + checkerZone
    const rightEdge = innerX + innerW - checkerZone
    const starLeft = cx - starEdge
    const starRight = cx + starEdge
    const starTop = cy - starEdge
    const starBot = cy + starEdge

    const leftMid = (leftEdge + starLeft) / 2
    const rightMid = (rightEdge + starRight) / 2

    el('text', { x: leftMid, y: cy, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, transform: `rotate(-90,${leftMid},${cy})` }, 'General Land Office')
    el('text', { x: rightMid, y: cy, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, transform: `rotate(90,${rightMid},${cy})` }, 'Public Treasury')

    const boxW = innerW * 0.14
    const boxH = innerH * 0.08
    const textHalfLen = 32
    const arrowGap = 4

    const leftBoxTopY = (innerY + starTop) / 2
    const leftBoxBotY = (innerY + innerH + starBot) / 2
    const leftArrowTopStart = cy - textHalfLen - arrowGap
    const leftArrowBotStart = cy + textHalfLen + arrowGap

    el('line', { x1: leftMid, y1: leftArrowTopStart, x2: leftMid, y2: leftBoxTopY + boxH / 2 + 2, stroke: theme.text, 'stroke-width': 0.8 })
    el('path', { d: `M ${leftMid - 2},${leftBoxTopY + boxH / 2 + 5} L ${leftMid},${leftBoxTopY + boxH / 2 + 2} L ${leftMid + 2},${leftBoxTopY + boxH / 2 + 5}`, fill: 'none', stroke: theme.text, 'stroke-width': 0.8 })
    el('rect', { x: leftMid - boxW / 2, y: leftBoxTopY - boxH / 2, width: boxW, height: boxH, fill: '#f8f4ec', stroke: theme['space-stroke'], 'stroke-width': 0.75, rx: 1, class: 'board-cell', 'data-sq': 'inner-1', 'data-type': 'land-in-use' })
    el('text', { x: leftMid, y: leftBoxTopY - 2, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, 'For Sale')
    el('text', { x: leftMid, y: leftBoxTopY + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, 'Land in Use')

    el('line', { x1: leftMid, y1: leftArrowBotStart, x2: leftMid, y2: leftBoxBotY - boxH / 2 - 2, stroke: theme.text, 'stroke-width': 0.8 })
    el('path', { d: `M ${leftMid - 2},${leftBoxBotY - boxH / 2 - 5} L ${leftMid},${leftBoxBotY - boxH / 2 - 2} L ${leftMid + 2},${leftBoxBotY - boxH / 2 - 5}`, fill: 'none', stroke: theme.text, 'stroke-width': 0.8 })
    el('rect', { x: leftMid - boxW / 2, y: leftBoxBotY - boxH / 2, width: boxW, height: boxH, fill: '#f8f4ec', stroke: theme['space-stroke'], 'stroke-width': 0.75, rx: 1, class: 'board-cell', 'data-sq': 'inner-2', 'data-type': 'idle-land' })
    el('text', { x: leftMid, y: leftBoxBotY - 2, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, 'For Sale')
    el('text', { x: leftMid, y: leftBoxBotY + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, 'Idle Land')

    const rightBoxTopY = leftBoxTopY
    const rightBoxBotY = leftBoxBotY
    const rightArrowTopStart = cy - textHalfLen - arrowGap
    const rightArrowBotStart = cy + textHalfLen + arrowGap

    el('line', { x1: rightMid, y1: rightArrowTopStart, x2: rightMid, y2: rightBoxTopY + boxH / 2 + 2, stroke: theme.text, 'stroke-width': 0.8 })
    el('path', { d: `M ${rightMid - 2},${rightBoxTopY + boxH / 2 + 5} L ${rightMid},${rightBoxTopY + boxH / 2 + 2} L ${rightMid + 2},${rightBoxTopY + boxH / 2 + 5}`, fill: 'none', stroke: theme.text, 'stroke-width': 0.8 })
    el('rect', { x: rightMid - boxW / 2, y: rightBoxTopY - boxH / 2, width: boxW, height: boxH, fill: '#f8f4ec', stroke: theme['space-stroke'], 'stroke-width': 0.75, rx: 1, class: 'board-cell', 'data-sq': 'inner-3', 'data-type': 'general-fund' })
    el('text', { x: rightMid, y: rightBoxTopY - 2, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, 'General Fund')
    el('text', { x: rightMid, y: rightBoxTopY + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, '')

    el('line', { x1: rightMid, y1: rightArrowBotStart, x2: rightMid, y2: rightBoxBotY - boxH / 2 - 2, stroke: theme.text, 'stroke-width': 0.8 })
    el('path', { d: `M ${rightMid - 2},${rightBoxBotY - boxH / 2 - 5} L ${rightMid},${rightBoxBotY - boxH / 2 - 2} L ${rightMid + 2},${rightBoxBotY - boxH / 2 - 5}`, fill: 'none', stroke: theme.text, 'stroke-width': 0.8 })
    el('rect', { x: rightMid - boxW / 2, y: rightBoxBotY - boxH / 2, width: boxW, height: boxH, fill: '#f8f4ec', stroke: theme['space-stroke'], 'stroke-width': 0.75, rx: 1, class: 'board-cell', 'data-sq': 'inner-4', 'data-type': 'rent-fund' })
    el('text', { x: rightMid, y: rightBoxBotY - 2, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, 'Prosperity Land')
    el('text', { x: rightMid, y: rightBoxBotY + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, 'Rent Fund')
  } else if (style === 'split-corner') {
    el('text', { x: cx, y: cy - 20, 'text-anchor': 'middle', 'font-size': 7, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text }, 'MISCELLANEOUS')
    el('text', { x: cx, y: cy + 6, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 'bold', 'font-family': 'serif', fill: theme['title-text'] }, 'PUBLIC TREASURY')
    el('text', { x: cx, y: cy + 20, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, 'MONEY DENOMINATIONS')

    const coinY = cy + 34
    const coins = ['$1', '$5', '$10', '$50', '$100']
    const coinColors = ['#f8f4e8', '#cc3030', '#8a9a8a', '#d4c040', '#6a9a50']
    const coinR = 7
    const coinGap = 20
    const coinStartX = cx - (coins.length - 1) * coinGap / 2
    for (let i = 0; i < coins.length; i++) {
      const coinX = coinStartX + i * coinGap
      const textColor = i === 0 ? theme.text : '#fff'
      el('circle', { cx: coinX, cy: coinY, r: coinR, fill: coinColors[i], stroke: theme['space-stroke'], 'stroke-width': 0.75 })
      el('text', { x: coinX, y: coinY + 2, 'text-anchor': 'middle', 'font-size': 4, 'font-weight': 'bold', 'font-family': 'serif', fill: textColor }, coins[i])
    }

    el('text', { x: cx, y: cy + 58, 'text-anchor': 'middle', 'font-size': 6, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text }, "The Landlord's Game")
    el('text', { x: cx, y: cy + 69, 'text-anchor': 'middle', 'font-size': 4.5, 'font-family': 'serif', fill: theme.text }, 'Patented Jan. 5, 1904, No. 748626 by Lizzie J. Magie')
    el('text', { x: cx, y: cy + 79, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, 'Economic Game Co., New York')

    if (board.naturalOpportunities) {
      const natOps = board.naturalOpportunities
      const cellW = innerW / 9
      const cellH = innerH / 9
      const armLen = cellW * 2
      const armLenV = cellH * 2
      const thick = cellW
      const thickV = cellH
      const fill = '#d4c060'
      const stroke = '#3a3020'

      const lShapes = [
        { corner: 'br',
          pts: `${innerX + innerW - armLen},${innerY + innerH} ${innerX + innerW - armLen},${innerY + innerH - thickV} ${innerX + innerW - thick},${innerY + innerH - thickV} ${innerX + innerW - thick},${innerY + innerH - armLenV} ${innerX + innerW},${innerY + innerH - armLenV} ${innerX + innerW},${innerY + innerH}`,
          tx: innerX + innerW - armLen / 2, ty: innerY + innerH - thickV / 2,
          tx2: innerX + innerW - thick / 2, ty2: innerY + innerH - armLenV / 2 - thickV / 2 + thick / 2 },
        { corner: 'bl',
          pts: `${innerX},${innerY + innerH} ${innerX},${innerY + innerH - armLenV} ${innerX + thick},${innerY + innerH - armLenV} ${innerX + thick},${innerY + innerH - thickV} ${innerX + armLen},${innerY + innerH - thickV} ${innerX + armLen},${innerY + innerH}`,
          tx: innerX + armLen / 2, ty: innerY + innerH - thickV / 2,
          tx2: innerX + thick / 2, ty2: innerY + innerH - armLenV / 2 - thickV / 2 + thick / 2 },
        { corner: 'tl',
          pts: `${innerX},${innerY} ${innerX + armLen},${innerY} ${innerX + armLen},${innerY + thickV} ${innerX + thick},${innerY + thickV} ${innerX + thick},${innerY + armLenV} ${innerX},${innerY + armLenV}`,
          tx: innerX + armLen / 2, ty: innerY + thickV / 2,
          tx2: innerX + thick / 2, ty2: innerY + thickV + (armLenV - thickV) / 2 },
        { corner: 'tr',
          pts: `${innerX + innerW - armLen},${innerY} ${innerX + innerW},${innerY} ${innerX + innerW},${innerY + armLenV} ${innerX + innerW - thick},${innerY + armLenV} ${innerX + innerW - thick},${innerY + thickV} ${innerX + innerW - armLen},${innerY + thickV}`,
          tx: innerX + innerW - armLen / 2, ty: innerY + thickV / 2,
          tx2: innerX + innerW - thick / 2, ty2: innerY + thickV + (armLenV - thickV) / 2 },
      ]

      for (let i = 0; i < natOps.length; i++) {
        const no = natOps[i]
        const L = lShapes[i]
        el('polygon', { points: L.pts, fill, stroke, 'stroke-width': 1.2, class: 'board-cell', 'data-sq': `inner-${i + 1}`, 'data-type': 'natural-opportunity' })
        el('text', { x: L.tx, y: L.ty - 4, 'text-anchor': 'middle', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text }, 'Natural Opportunity')
        el('text', { x: L.tx, y: L.ty + 3, 'text-anchor': 'middle', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text }, 'to Labor')
        el('text', { x: L.tx2, y: L.ty2 - 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text }, no.name)
        el('text', { x: L.tx2, y: L.ty2 + 3, 'text-anchor': 'middle', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text }, `Wages $${no.wages}`)
        el('text', { x: L.tx2, y: L.ty2 + 10, 'text-anchor': 'middle', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text }, `Rent $${no.rent}`)
      }

      const cellFill = theme.lot
      const patchW = 1.5
      const fill2 = '#d4c060'
      // TIMBERLAND (BR) → WAYBACK pos 1, bottom side idx 0 (rightmost on bottom)
      const br_cx = innerX + innerW - cellW / 2
      el('rect', { x: br_cx - cellW / 2, y: innerY + innerH - patchW, width: cellW, height: patchW, fill: fill2 })
      el('rect', { x: br_cx - cellW / 2, y: innerY + innerH, width: cellW, height: patchW, fill: cellFill })
      // FARMLANDS (BL) → BOOMTOWN pos 11, left side idx 0 (lowest on left)
      const bl_cy = innerY + innerH - cellH / 2
      el('rect', { x: innerX - patchW, y: bl_cy - cellH / 2, width: patchW, height: cellH, fill: cellFill })
      el('rect', { x: innerX, y: bl_cy - cellH / 2, width: patchW, height: cellH, fill: fill2 })
      // COAL MINES (TL) → EASY STREET pos 21, top side idx 0 (leftmost on top)
      const tl_cx = innerX + cellW / 2
      el('rect', { x: tl_cx - cellW / 2, y: innerY, width: cellW, height: patchW, fill: fill2 })
      el('rect', { x: tl_cx - cellW / 2, y: innerY - patchW, width: cellW, height: patchW, fill: cellFill })
      // OIL FIELDS (TR) → BROADWAY pos 31, right side idx 0 (topmost on right)
      const tr_cy = innerY + cellH / 2
      el('rect', { x: innerX + innerW - patchW, y: tr_cy - cellH / 2, width: patchW, height: cellH, fill: fill2 })
      el('rect', { x: innerX + innerW, y: tr_cy - cellH / 2, width: patchW, height: cellH, fill: cellFill })
    }
  } else {
    const pad = 14
    const gap = 8
    const qw = (innerW - pad * 2 - gap) / 2
    const qh = (innerH - pad * 2 - gap) / 2
    const x0 = innerX + pad, x1 = innerX + pad + qw + gap
    const y0 = innerY + pad, y1 = innerY + pad + qh + gap
    const sw = 1.5

    const quads = [
      { x: x0, y: y0, label: 'R.R.', sub: '$5', sq: 'inner-1' },
      { x: x1, y: y0, label: 'WAGES', sub: null, sq: 'inner-2' },
      { x: x0, y: y1, label: 'BANK', sub: null, sq: 'inner-3' },
      { x: x1, y: y1, label: 'PUBLIC TREASURY', sub: null, sq: 'inner-4' },
    ]

    for (const q of quads) {
      el('rect', { x: q.x, y: q.y, width: qw, height: qh, fill: theme['inner-bg'], stroke: theme['space-stroke'], 'stroke-width': sw, class: 'board-cell', 'data-sq': q.sq, 'data-type': q.label.toLowerCase() })
      const qcx = q.x + qw / 2, qcy = q.y + qh / 2
      if (q.label === 'PUBLIC TREASURY') {
        el('text', { x: qcx, y: qcy - 4, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 'bold', 'font-family': 'serif', fill: theme['title-text'] }, 'PUBLIC')
        el('text', { x: qcx, y: qcy + 10, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 'bold', 'font-family': 'serif', fill: theme['title-text'] }, 'TREASURY')
      } else {
        el('text', { x: qcx, y: qcy + (q.sub ? -2 : 4), 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 'bold', 'font-family': 'serif', fill: theme['title-text'] }, q.label)
        if (q.sub) el('text', { x: qcx, y: qcy + 10, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, q.sub)
      }
    }

    el('text', { x: cx, y: innerY + innerH - 3, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, 'L.J. Magie, Patent No. 748,626')
  }
}
