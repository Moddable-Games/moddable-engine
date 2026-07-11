// ─── PERIMETER-LOOP LAYOUT BUILDER (Landlords / Monopoly-style boards) ──────


const PERIMETER_THEMES = {
  '1904-patent': {
    board: '#f0e4c8', border: '#5a4a30', innerBg: '#f0e4c8',
    spaceStroke: '#5a4a30', cornerStroke: '#5a4a30',
    text: '#3a2a15', titleText: '#3a2a15',
    lot: '#f0e4c8', necessity: '#f0e4c8', railroad: '#f0e4c8',
    franchise: '#f0e4c8', luxury: '#f0e4c8', legacy: '#f0e4c8',
    'go-to-jail': '#e8d8b8', corner: '#e8d8b8',
  },
  '1906-egc': {
    board: '#f5edd5', border: '#6b2020', innerBg: '#f8f4e8',
    spaceStroke: '#3a3020', cornerStroke: '#3a3020',
    text: '#2a2015', titleText: '#2a2015',
    lot: '#6a9a50', necessity: '#7aaac0', railroad: '#d4889a',
    franchise: '#d4c060', chance: '#cc3030', luxury: '#d4889a',
    special: '#7aaac0', 'go-to-jail': '#d4883a', corner: '#d4c898',
    broker: '#d4c060',
  },
  '1932-prosperity': {
    board: '#f8f4ec', border: '#2a4a7a', innerBg: '#f8f4ec',
    spaceStroke: '#2a4a7a', cornerStroke: '#2a4a7a',
    text: '#1a2a40', titleText: '#6b2020',
    lot: '#ffffff', taxes: '#ffffff', franchise: '#ffffff',
    railroad: '#ffffff', luxury: '#ffffff', broker: '#ffffff',
    jail: '#ffffff', corner: '#ffffff', 'go-to-jail': '#ffffff',
    lotStripe: '#3a8a3a', taxesStripe: '#2a5a9a', franchiseStripe: '#d4a030',
    railroadStripe: '#3a8a3a',
    brokerStripe: '#c8b020', luxuryStripe: '#d4708a',
    jailStripe: '#808080', 'go-to-jailStripe': '#808080',
    cornerArc: '#8c2020',
  },
}

const PERIMETER_CATEGORIES = {
  lot: 'Land In Use', necessity: 'Absolute Necessity', taxes: 'Personal Property',
  railroad: 'Interstate Public Utility', franchise: 'Local Public Utility',
  broker: 'Real Estate', luxury: 'Luxury', jail: 'Jail',
  'go-to-jail': 'No Trespassing', chance: 'Chance', special: 'Speculation',
  legacy: 'Legacy',
}

function wrapText(text, maxChars) {
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

function buildPerimeterLayout(rows, cols, tileSize, colors, config) {
  const variant = config.variant
  const boardData = config.boardData || null
  const board = boardData ? boardData.boards[variant] : null
  if (!board) return { style: 'perimeter', totalSpaces: 40, colors: {} }

  const theme = config.theme || PERIMETER_THEMES[variant] || {}
  const totalSpaces = board.totalSpaces || 40
  const corners = 4
  const perSide = (totalSpaces - corners) / corners
  const spaceW = 56
  const cornerSize = 80
  const boardW = cornerSize * 2 + perSide * spaceW
  const boardH = boardW

  // Sort spaces into sides
  const spaces = board.spaces
  const sideArrays = { bottom: [], left: [], top: [], right: [] }
  for (const s of spaces) {
    if (s.side !== 'corner' && sideArrays[s.side]) sideArrays[s.side].push(s)
  }

  // Build corner spaces
  const cornerOrder = getCornerOrder(variant, spaces)
  const cornerSpaces = cornerOrder.map((space, ci) => buildCornerSpace(space, ci, cornerSize, theme, variant, board))

  // Build side spaces
  const sideSpaces = {}
  const sideOrder = ['bottom', 'left', 'top', 'right']
  for (const side of sideOrder) {
    const arr = sideArrays[side]
    sideSpaces[side] = arr.map(space => buildSideSpace(space, side, theme, variant, cornerSize, boardW, boardH, arr.length))
  }

  // Build inner content
  const innerContent = buildInnerContent(board, cornerSize, boardW, boardH, theme, variant)

  return {
    style: 'perimeter',
    totalSpaces,
    cornerSize,
    spaceW,
    boardW,
    boardH,
    overflow: variant === '1904-patent',
    spaceStrokeWidth: variant === '1904-patent' ? 1.5 : 0.75,
    colors: {
      board: theme.board, border: theme.border, innerBg: theme.innerBg,
      corner: theme.corner, cornerStroke: theme.cornerStroke,
      spaceStroke: theme.spaceStroke, text: theme.text,
    },
    cornerSpaces,
    sideSpaces,
    innerContent: innerContent.elements,
    innerCells: innerContent.cells,
  }
}

function getCornerOrder(variant, spaces) {
  const corners = spaces.filter(s => s.side === 'corner')
  if (variant === '1932-prosperity') return [corners[1], corners[2], corners[3], corners[0]]
  if (variant === '1906-egc') return [corners[3], corners[0], corners[1], corners[2]]
  return [corners[0], corners[1], corners[2], corners[3]]
}

function buildCornerSpace(space, ci, cornerSize, theme, variant, board) {
  const isGoToJail = space.notes && space.notes.includes('Go to Jail')
  const fill = isGoToJail && theme['go-to-jail'] ? theme['go-to-jail'] : theme.corner
  const id = `pos-${space.pos}`
  const decorations = []
  const texts = []

  if (variant === '1904-patent') {
    const r = cornerSize * 0.72
    decorations.push({ tag: 'circle', attrs: { x: 0, y: 0, cx: cornerSize / 2, cy: cornerSize / 2, r, fill: theme.corner, stroke: theme.cornerStroke, 'stroke-width': 1.5 } })
    const fontSize = space.name.length > 12 ? 6 : space.name.length > 8 ? 7 : 9
    const maxChars = Math.floor((r * 1.2) / (fontSize * 0.55))
    const lines = wrapText(space.name, maxChars)
    const lineH = fontSize + 3
    const blockH = lines.length * lineH
    const startY = cornerSize / 2 - blockH / 2 + lineH / 2 - (space.notes ? 3 : 0)
    for (let i = 0; i < lines.length; i++) {
      texts.push({ dx: 0, dy: startY - cornerSize / 2 + i * lineH, text: lines[i], fontSize, fontWeight: 'bold', fontFamily: 'serif', fill: theme.titleText })
    }
    if (space.notes) {
      const sub = space.notes.length > 22 ? space.notes.slice(0, 21) + '.' : space.notes
      texts.push({ dx: 0, dy: startY - cornerSize / 2 + blockH + 4, text: sub, fontSize: 4.5, fontWeight: 'normal', fontFamily: 'serif', fill: theme.text })
    }
  } else if (variant === '1906-egc' && space.split) {
    return build1906SplitCorner(space, cornerSize, theme, id)
  } else if (variant === '1932-prosperity') {
    build1932CornerDecorations(space, cornerSize, theme, decorations, texts)
  } else {
    const lines = wrapText(space.name, 10)
    const lineH = cornerSize > 70 ? 11 : 9
    for (let i = 0; i < lines.length; i++) {
      texts.push({ dx: 0, dy: -8 + i * lineH - cornerSize / 2 + cornerSize / 2, text: lines[i], fontSize: cornerSize > 70 ? 8 : 7, fontWeight: 'bold', fontFamily: 'sans-serif', fill: theme.titleText })
    }
    let subtext = ''
    if (space.fare) subtext = `Fare $${space.fare}`
    else if (space.notes) subtext = space.notes.length > 24 ? space.notes.slice(0, 23) + '.' : space.notes
    if (subtext) {
      texts.push({ dx: 0, dy: lines.length * lineH / 2 + 8, text: subtext, fontSize: 5.5, fontWeight: 'normal', fontFamily: 'sans-serif', fill: theme.text })
    }
  }

  return { id, fill, decorations, texts }
}

function build1906SplitCorner(space, cornerSize, theme, id) {
  const sp = space.split
  const spColor = theme[sp.type] || theme.corner
  const mainColor = theme.corner
  const isJail = space.name === 'JAIL'
  const s = cornerSize
  const decorations = []
  const texts = []

  if (isJail) {
    decorations.push({ tag: 'polygon', attrs: { x: 0, y: 0, points: `0,0 ${s},0 ${s},${s}`, fill: spColor, 'data-sq': `${id}b`, 'data-type': sp.type } })
    decorations.push({ tag: 'polygon', attrs: { x: 0, y: 0, points: `0,0 0,${s} ${s},${s}`, fill: mainColor, 'data-sq': `${id}a`, 'data-type': 'corner' } })
    decorations.push({ tag: 'line', attrs: { x: 0, y: 0, x1: 0, y1: 0, x2: s, y2: s, stroke: theme.cornerStroke, 'stroke-width': 1 } })
    texts.push({ dx: s * 0.2, dy: s * (-0.2), text: sp.name, fontSize: 5, fontWeight: 'bold', fontFamily: 'serif', fill: theme.text })
    if (sp.tax) texts.push({ dx: s * 0.2, dy: s * (-0.2) + 8, text: `Tax $${sp.tax}`, fontSize: 3.5, fontWeight: 'normal', fontFamily: 'serif', fill: theme.text })
    texts.push({ dx: s * (-0.2), dy: s * 0.2, text: space.name, fontSize: 5, fontWeight: 'bold', fontFamily: 'serif', fill: theme.text })
  } else {
    decorations.push({ tag: 'polygon', attrs: { x: 0, y: 0, points: `0,0 ${s},0 0,${s}`, fill: spColor, 'data-sq': `${id}b`, 'data-type': sp.type } })
    decorations.push({ tag: 'polygon', attrs: { x: 0, y: 0, points: `${s},0 ${s},${s} 0,${s}`, fill: mainColor, 'data-sq': `${id}a`, 'data-type': 'corner' } })
    decorations.push({ tag: 'line', attrs: { x: 0, y: 0, x1: 0, y1: s, x2: s, y2: 0, stroke: theme.cornerStroke, 'stroke-width': 1 } })
    texts.push({ dx: s * (-0.2), dy: s * (-0.2), text: sp.name, fontSize: 5, fontWeight: 'bold', fontFamily: 'serif', fill: theme.text })
    texts.push({ dx: s * 0.2, dy: s * 0.2 - 3, text: space.name, fontSize: 5, fontWeight: 'bold', fontFamily: 'serif', fill: theme.text })
    texts.push({ dx: s * 0.2, dy: s * 0.2 + 5, text: 'Free', fontSize: 3.5, fontWeight: 'normal', fontFamily: 'serif', fill: theme.text })
  }
  decorations.push({ tag: 'rect', attrs: { x: 0, y: 0, width: s, height: s, fill: 'none', stroke: theme.cornerStroke, 'stroke-width': 1.5 } })

  return { id, fill: 'none', decorations, texts }
}

function build1932CornerDecorations(space, cornerSize, theme, decorations, texts) {
  const s = cornerSize
  const cx = s / 2, cy = s / 2
  const r = s * 0.42

  if (space.name === 'WAGES') {
    const arcColors = ['#2a5a9a', '#3a8a3a', '#c8b020', '#8c2020']
    for (let i = 0; i < 4; i++) {
      const a1 = (i * Math.PI / 2) - Math.PI / 2
      const a2 = ((i + 1) * Math.PI / 2) - Math.PI / 2
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2)
      decorations.push({ tag: 'path', attrs: { x: 0, y: 0, d: `M ${x1},${y1} A ${r},${r} 0 0,1 ${x2},${y2}`, fill: 'none', stroke: arcColors[i], 'stroke-width': 4 } })
    }
  } else if (space.fare) {
    decorations.push({ tag: 'path', attrs: { x: 0, y: 0, d: `M ${cx - r},${cy} A ${r},${r} 0 1,1 ${cx + r},${cy} A ${r},${r} 0 1,1 ${cx - r},${cy}`, fill: 'none', stroke: theme.cornerArc, 'stroke-width': 3.5 } })
  } else if (space.name === 'JAIL') {
    const bw = s * 0.85
    decorations.push({ tag: 'rect', attrs: { x: cx - bw / 2, y: cy - bw / 2, width: bw, height: bw, fill: 'none', stroke: '#4a4a4a', 'stroke-width': 2 } })
    const bars = 4, gap = bw / (bars + 1)
    for (let i = 1; i <= bars; i++) {
      decorations.push({ tag: 'line', attrs: { x: 0, y: 0, x1: cx - bw / 2 + i * gap, y1: cy - bw / 2 + 2, x2: cx - bw / 2 + i * gap, y2: cy + bw / 2 - 2, stroke: '#3a3a3a', 'stroke-width': 1.5 } })
    }
  }

  const lines = wrapText(space.name, 10)
  const lineH = s > 70 ? 11 : 9
  for (let i = 0; i < lines.length; i++) {
    texts.push({ dx: 0, dy: -8 + i * lineH, text: lines[i], fontSize: s > 70 ? 8 : 7, fontWeight: 'bold', fontFamily: 'sans-serif', fill: theme.titleText })
  }
  let subtext = ''
  if (space.fare) subtext = `Fare $${space.fare}`
  else if (space.notes) subtext = space.notes.length > 24 ? space.notes.slice(0, 23) + '.' : space.notes
  if (subtext) {
    texts.push({ dx: 0, dy: lines.length * lineH / 2 + 8, text: subtext, fontSize: 5.5, fontWeight: 'normal', fontFamily: 'sans-serif', fill: theme.text })
  }
}

function buildSideSpace(space, side, theme, variant, cornerSize, boardW, boardH, count) {
  const typeFill = theme[space.type] || '#f0f0f0'
  const id = `pos-${space.pos}`
  const decorations = []
  const texts = []

  // Compute rect dimensions for text sizing
  const spanW = boardW - cornerSize * 2
  const spanH = boardH - cornerSize * 2
  const cellW = spanW / count
  const cellH = spanH / count
  const isVertical = side === 'left' || side === 'right'
  const textW = isVertical ? cornerSize : cellW
  const textH = isVertical ? cellH : cornerSize
  const narrow = textW < textH

  // Stripes for 1932
  if (variant === '1932-prosperity') {
    const stripeKey = space.type + 'Stripe'
    const stripeColor = theme[stripeKey]
    if (stripeColor) {
      const bandRatio = 0.22
      const bh = textH * bandRatio
      // Top band
      decorations.push({ tag: 'rect', attrs: { x: 0.5, y: 0.5, width: textW - 1, height: bh, fill: stripeColor, opacity: 0.35 } })
      decorations.push({ tag: 'line', attrs: { x1: 0.5, y1: bh, x2: textW - 0.5, y2: bh, stroke: stripeColor, 'stroke-width': 1.2 } })
      // Bottom band
      decorations.push({ tag: 'rect', attrs: { x: 0.5, y: textH - bh - 0.5, width: textW - 1, height: bh, fill: stripeColor, opacity: 0.35 } })
      decorations.push({ tag: 'line', attrs: { x1: 0.5, y1: textH - bh, x2: textW - 0.5, y2: textH - bh, stroke: stripeColor, 'stroke-width': 1.2 } })
    }
  }

  // Text content
  if (variant === '1932-prosperity') {
    const category = PERIMETER_CATEGORIES[space.type] || ''
    const fontSize = narrow ? 5 : 6
    const catSize = narrow ? 3.2 : 3.8
    const detSize = narrow ? 3.5 : 4
    const maxChars = Math.floor(textW / (narrow ? 3.6 : 4.2))
    let name = space.name
    if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'
    texts.push({ dx: textW * 0.44, dy: -textH * 0.38, text: String(space.pos), fontSize: 3, fontWeight: 'normal', fontFamily: 'sans-serif', fill: theme.text, attrs: { opacity: 0.6, 'text-anchor': 'end' } })
    if (category) texts.push({ dx: 0, dy: -textH * 0.39, text: category, fontSize: catSize, fontWeight: 'normal', fontFamily: 'sans-serif', fill: theme.text })
    texts.push({ dx: 0, dy: category ? 2 : 0, text: name, fontSize, fontWeight: 'bold', fontFamily: 'sans-serif', fill: theme.text })
    let detail = ''
    if (space.rent) detail = `Land Rent $${space.rent}`
    else if (space.tax) detail = `$${space.tax}`
    else if (space.fare) detail = `Fare $${space.fare}`
    else if (space.price && space.type === 'franchise') detail = `$${space.price}`
    if (detail) texts.push({ dx: 0, dy: textH * 0.39, text: detail, fontSize: detSize, fontWeight: 'normal', fontFamily: 'sans-serif', fill: theme.text })
  } else if (variant === '1906-egc') {
    const fontSize = narrow ? 4.5 : 6
    const detSize = narrow ? 3.5 : 4.5
    const maxChars = Math.floor(textW / (narrow ? 3.4 : 4.2))
    let name = space.name
    if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'
    const textColor = space.type === 'chance' ? '#fff' : theme.text
    texts.push({ dx: 0, dy: narrow ? -2 : -4, text: name, fontSize, fontWeight: 'bold', fontFamily: 'serif', fill: textColor })
    let detail = ''
    if (space.price && space.rent) detail = `$${space.price} / Rent $${space.rent}`
    else if (space.price) detail = `$${space.price}`
    else if (space.rent) detail = `Rent $${space.rent}`
    else if (space.tax) detail = `Tax $${space.tax}`
    else if (space.fare) detail = `Fare $${space.fare}`
    else if (space.fee) detail = `Fee $${space.fee}`
    if (detail) texts.push({ dx: 0, dy: narrow ? 6 : 8, text: detail, fontSize: detSize, fontWeight: 'normal', fontFamily: 'serif', fill: textColor })
  } else {
    const fontSize = narrow ? 4.5 : 6
    const detSize = narrow ? 3.5 : 4.5
    const maxChars = Math.floor(textW / (narrow ? 3.4 : 4.5))
    let name = space.name
    if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'
    texts.push({ dx: 0, dy: narrow ? -4 : -6, text: name, fontSize, fontWeight: 'bold', fontFamily: 'serif', fill: theme.text })
    const lines = []
    if (space.rent) lines.push(`Rent $${space.rent}`)
    if (space.price) lines.push(`Sale $${space.price}`)
    if (space.tax) lines.push(`Tax $${space.tax}`)
    if (space.fare) lines.push(`Fare $${space.fare}`)
    if (space.fee) lines.push(`Fee $${space.fee}`)
    if (space.receive) lines.push(`+$${space.receive}`)
    const lineH = narrow ? 6 : 8
    for (let i = 0; i < lines.length; i++) {
      texts.push({ dx: 0, dy: (narrow ? 3 : 4) + i * lineH, text: lines[i], fontSize: detSize, fontWeight: 'normal', fontFamily: 'serif', fill: theme.text })
    }
  }

  return { id, fill: typeFill, type: space.type, decorations: decorations.length ? decorations : undefined, texts: texts.length ? texts : undefined }
}

function buildInnerContent(board, cornerSize, boardW, boardH, theme, variant) {
  const elements = []
  const cells = []
  const innerX = cornerSize, innerY = cornerSize
  const innerW = boardW - cornerSize * 2, innerH = boardH - cornerSize * 2
  const cx = boardW / 2, cy = boardH / 2

  if (variant === '1932-prosperity') {
    build1932Inner(elements, cells, innerX, innerY, innerW, innerH, cx, cy, theme)
  } else if (variant === '1906-egc') {
    build1906Inner(elements, cells, board, innerX, innerY, innerW, innerH, cx, cy, theme)
  } else {
    build1904Inner(elements, cells, innerX, innerY, innerW, innerH, cx, cy, theme)
  }

  return { elements, cells }
}

function build1932Inner(elements, cells, innerX, innerY, innerW, innerH, cx, cy, theme) {
  const r = innerW * 0.32
  const b = r / Math.SQRT2
  const c = r * (1 - 1 / Math.SQRT2)
  const pts = [
    [0, -r], [c, -b], [b, -b], [b, -c],
    [r, 0], [b, c], [b, b], [c, b],
    [0, r], [-c, b], [-b, b], [-b, c],
    [-r, 0], [-b, -c], [-b, -b], [-c, -b]
  ].map(([px, py]) => `${cx + px},${cy + py}`).join(' ')
  elements.push({ tag: 'polygon', attrs: { points: pts, fill: 'none', stroke: theme.titleText, 'stroke-width': 2.5 } })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy - 16, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, text: 'THE' })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 2, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, text: "LANDLORD'S GAME" })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 16, 'text-anchor': 'middle', 'font-size': 8, 'font-family': 'serif', fill: theme.titleText }, text: 'AND PROSPERITY' })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 36, 'text-anchor': 'middle', 'font-size': 5.5, 'font-family': 'serif', fill: theme.text }, text: 'A Magie Game — Patent No. 1,509,312' })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 46, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, text: 'Adgame Company (Inc.), Washington, D.C.' })

  const labelOff = 14
  elements.push({ tag: 'text', attrs: { x: cx, y: innerY + labelOff, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'sans-serif', fill: '#c8b020' }, text: 'Your Checker Yellow' })
  elements.push({ tag: 'text', attrs: { x: cx, y: innerY + innerH - labelOff + 4, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'sans-serif', fill: '#2a5a9a' }, text: 'Your Checker Blue' })
  elements.push({ tag: 'text', attrs: { x: innerX + labelOff, y: cy, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'sans-serif', fill: '#3a8a3a', transform: `rotate(-90,${innerX + labelOff},${cy})` }, text: 'Your Checker Green' })
  elements.push({ tag: 'text', attrs: { x: innerX + innerW - labelOff, y: cy, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'sans-serif', fill: '#8c2020', transform: `rotate(90,${innerX + innerW - labelOff},${cy})` }, text: 'Your Checker Red' })

  const starEdge = r / Math.SQRT2
  const checkerZone = labelOff + 6
  const leftEdge = innerX + checkerZone
  const rightEdge = innerX + innerW - checkerZone
  const starLeft = cx - starEdge
  const starRight = cx + starEdge

  const leftMid = (leftEdge + starLeft) / 2
  const rightMid = (rightEdge + starRight) / 2

  elements.push({ tag: 'text', attrs: { x: leftMid, y: cy, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, transform: `rotate(-90,${leftMid},${cy})` }, text: 'General Land Office' })
  elements.push({ tag: 'text', attrs: { x: rightMid, y: cy, 'text-anchor': 'middle', 'font-size': 5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text, transform: `rotate(90,${rightMid},${cy})` }, text: 'Public Treasury' })

  const boxW = innerW * 0.14, boxH = innerH * 0.08
  const textHalfLen = 32, arrowGap = 4
  const starTop = cy - starEdge, starBot = cy + starEdge
  const leftBoxTopY = (innerY + starTop) / 2
  const leftBoxBotY = (innerY + innerH + starBot) / 2

  // Left arrows + boxes
  const leftArrowTopStart = cy - textHalfLen - arrowGap
  const leftArrowBotStart = cy + textHalfLen + arrowGap
  elements.push({ tag: 'line', attrs: { x1: leftMid, y1: leftArrowTopStart, x2: leftMid, y2: leftBoxTopY + boxH / 2 + 2, stroke: theme.text, 'stroke-width': 0.8 } })
  elements.push({ tag: 'path', attrs: { d: `M ${leftMid - 2},${leftBoxTopY + boxH / 2 + 5} L ${leftMid},${leftBoxTopY + boxH / 2 + 2} L ${leftMid + 2},${leftBoxTopY + boxH / 2 + 5}`, fill: 'none', stroke: theme.text, 'stroke-width': 0.8 } })
  elements.push({ tag: 'rect', attrs: { x: leftMid - boxW / 2, y: leftBoxTopY - boxH / 2, width: boxW, height: boxH, fill: '#f8f4ec', stroke: theme.spaceStroke, 'stroke-width': 0.75, rx: 1, class: 'board-cell', 'data-sq': 'inner-1', 'data-type': 'land-in-use' } })
  elements.push({ tag: 'text', attrs: { x: leftMid, y: leftBoxTopY - 2, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, text: 'For Sale' })
  elements.push({ tag: 'text', attrs: { x: leftMid, y: leftBoxTopY + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, text: 'Land in Use' })
  cells.push({ id: 'inner-1', x: leftMid, y: leftBoxTopY })

  elements.push({ tag: 'line', attrs: { x1: leftMid, y1: leftArrowBotStart, x2: leftMid, y2: leftBoxBotY - boxH / 2 - 2, stroke: theme.text, 'stroke-width': 0.8 } })
  elements.push({ tag: 'path', attrs: { d: `M ${leftMid - 2},${leftBoxBotY - boxH / 2 - 5} L ${leftMid},${leftBoxBotY - boxH / 2 - 2} L ${leftMid + 2},${leftBoxBotY - boxH / 2 - 5}`, fill: 'none', stroke: theme.text, 'stroke-width': 0.8 } })
  elements.push({ tag: 'rect', attrs: { x: leftMid - boxW / 2, y: leftBoxBotY - boxH / 2, width: boxW, height: boxH, fill: '#f8f4ec', stroke: theme.spaceStroke, 'stroke-width': 0.75, rx: 1, class: 'board-cell', 'data-sq': 'inner-2', 'data-type': 'idle-land' } })
  elements.push({ tag: 'text', attrs: { x: leftMid, y: leftBoxBotY - 2, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, text: 'For Sale' })
  elements.push({ tag: 'text', attrs: { x: leftMid, y: leftBoxBotY + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, text: 'Idle Land' })
  cells.push({ id: 'inner-2', x: leftMid, y: leftBoxBotY })

  // Right arrows + boxes
  const rightBoxTopY = leftBoxTopY, rightBoxBotY = leftBoxBotY
  const rightArrowTopStart = cy - textHalfLen - arrowGap
  const rightArrowBotStart = cy + textHalfLen + arrowGap
  elements.push({ tag: 'line', attrs: { x1: rightMid, y1: rightArrowTopStart, x2: rightMid, y2: rightBoxTopY + boxH / 2 + 2, stroke: theme.text, 'stroke-width': 0.8 } })
  elements.push({ tag: 'path', attrs: { d: `M ${rightMid - 2},${rightBoxTopY + boxH / 2 + 5} L ${rightMid},${rightBoxTopY + boxH / 2 + 2} L ${rightMid + 2},${rightBoxTopY + boxH / 2 + 5}`, fill: 'none', stroke: theme.text, 'stroke-width': 0.8 } })
  elements.push({ tag: 'rect', attrs: { x: rightMid - boxW / 2, y: rightBoxTopY - boxH / 2, width: boxW, height: boxH, fill: '#f8f4ec', stroke: theme.spaceStroke, 'stroke-width': 0.75, rx: 1, class: 'board-cell', 'data-sq': 'inner-3', 'data-type': 'general-fund' } })
  elements.push({ tag: 'text', attrs: { x: rightMid, y: rightBoxTopY - 2, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, text: 'General Fund' })
  cells.push({ id: 'inner-3', x: rightMid, y: rightBoxTopY })

  elements.push({ tag: 'line', attrs: { x1: rightMid, y1: rightArrowBotStart, x2: rightMid, y2: rightBoxBotY - boxH / 2 - 2, stroke: theme.text, 'stroke-width': 0.8 } })
  elements.push({ tag: 'path', attrs: { d: `M ${rightMid - 2},${rightBoxBotY - boxH / 2 - 5} L ${rightMid},${rightBoxBotY - boxH / 2 - 2} L ${rightMid + 2},${rightBoxBotY - boxH / 2 - 5}`, fill: 'none', stroke: theme.text, 'stroke-width': 0.8 } })
  elements.push({ tag: 'rect', attrs: { x: rightMid - boxW / 2, y: rightBoxBotY - boxH / 2, width: boxW, height: boxH, fill: '#f8f4ec', stroke: theme.spaceStroke, 'stroke-width': 0.75, rx: 1, class: 'board-cell', 'data-sq': 'inner-4', 'data-type': 'rent-fund' } })
  elements.push({ tag: 'text', attrs: { x: rightMid, y: rightBoxBotY - 2, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, text: 'Prosperity Land' })
  elements.push({ tag: 'text', attrs: { x: rightMid, y: rightBoxBotY + 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-family': 'sans-serif', fill: theme.text }, text: 'Rent Fund' })
  cells.push({ id: 'inner-4', x: rightMid, y: rightBoxBotY })
}

function build1904Inner(elements, cells, innerX, innerY, innerW, innerH, cx, cy, theme) {
  const pad = 14, gap = 8
  const qw = (innerW - pad * 2 - gap) / 2
  const qh = (innerH - pad * 2 - gap) / 2
  const x0 = innerX + pad, x1 = innerX + pad + qw + gap
  const y0 = innerY + pad, y1 = innerY + pad + qh + gap

  const quads = [
    { x: x0, y: y0, label: 'R.R.', sub: '$5', sq: 'inner-1' },
    { x: x1, y: y0, label: 'WAGES', sub: null, sq: 'inner-2' },
    { x: x0, y: y1, label: 'BANK', sub: null, sq: 'inner-3' },
    { x: x1, y: y1, label: 'PUBLIC TREASURY', sub: null, sq: 'inner-4' },
  ]

  for (const q of quads) {
    elements.push({ tag: 'rect', attrs: { x: q.x, y: q.y, width: qw, height: qh, fill: theme.innerBg, stroke: theme.spaceStroke, 'stroke-width': 1.5, class: 'board-cell', 'data-sq': q.sq, 'data-type': q.label.toLowerCase() } })
    const qcx = q.x + qw / 2, qcy = q.y + qh / 2
    if (q.label === 'PUBLIC TREASURY') {
      elements.push({ tag: 'text', attrs: { x: qcx, y: qcy - 4, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, text: 'PUBLIC' })
      elements.push({ tag: 'text', attrs: { x: qcx, y: qcy + 10, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, text: 'TREASURY' })
    } else {
      elements.push({ tag: 'text', attrs: { x: qcx, y: qcy + (q.sub ? -2 : 4), 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, text: q.label })
      if (q.sub) elements.push({ tag: 'text', attrs: { x: qcx, y: qcy + 10, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, text: q.sub })
    }
    cells.push({ id: q.sq, x: qcx, y: qcy })
  }

  elements.push({ tag: 'text', attrs: { x: cx, y: innerY + innerH - 3, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, text: 'L.J. Magie, Patent No. 748,626' })
}

function build1906Inner(elements, cells, board, innerX, innerY, innerW, innerH, cx, cy, theme) {
  elements.push({ tag: 'text', attrs: { x: cx, y: cy - 20, 'text-anchor': 'middle', 'font-size': 7, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text }, text: 'MISCELLANEOUS' })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 6, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.titleText }, text: 'PUBLIC TREASURY' })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 20, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, text: 'MONEY DENOMINATIONS' })

  const coinY = cy + 34
  const coins = ['$1', '$5', '$10', '$50', '$100']
  const coinColors = ['#f8f4e8', '#cc3030', '#8a9a8a', '#d4c040', '#6a9a50']
  const coinR = 7, coinGap = 20
  const coinStartX = cx - (coins.length - 1) * coinGap / 2
  for (let i = 0; i < coins.length; i++) {
    const coinX = coinStartX + i * coinGap
    const textColor = i === 0 ? theme.text : '#fff'
    elements.push({ tag: 'circle', attrs: { cx: coinX, cy: coinY, r: coinR, fill: coinColors[i], stroke: theme.spaceStroke, 'stroke-width': 0.75 } })
    elements.push({ tag: 'text', attrs: { x: coinX, y: coinY + 2, 'text-anchor': 'middle', 'font-size': 4, 'font-weight': 'bold', 'font-family': 'serif', fill: textColor }, text: coins[i] })
  }

  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 58, 'text-anchor': 'middle', 'font-size': 6, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text }, text: "The Landlord's Game" })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 69, 'text-anchor': 'middle', 'font-size': 4.5, 'font-family': 'serif', fill: theme.text }, text: 'Patented Jan. 5, 1904, No. 748626 by Lizzie J. Magie' })
  elements.push({ tag: 'text', attrs: { x: cx, y: cy + 79, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'serif', fill: theme.text }, text: 'Economic Game Co., New York' })

  if (board.naturalOpportunities) {
    build1906NaturalOpportunities(elements, cells, board, innerX, innerY, innerW, innerH, theme)
  }
}

function build1906NaturalOpportunities(elements, cells, board, innerX, innerY, innerW, innerH, theme) {
  const natOps = board.naturalOpportunities
  const cellW = innerW / 9, cellH = innerH / 9
  const armLen = cellW * 2, armLenV = cellH * 2
  const thick = cellW, thickV = cellH
  const fill = '#d4c060', stroke = '#3a3020'

  const lShapes = [
    { pts: `${innerX + innerW - armLen},${innerY + innerH} ${innerX + innerW - armLen},${innerY + innerH - thickV} ${innerX + innerW - thick},${innerY + innerH - thickV} ${innerX + innerW - thick},${innerY + innerH - armLenV} ${innerX + innerW},${innerY + innerH - armLenV} ${innerX + innerW},${innerY + innerH}`,
      tx: innerX + innerW - armLen / 2, ty: innerY + innerH - thickV / 2,
      tx2: innerX + innerW - thick / 2, ty2: innerY + innerH - armLenV / 2 - thickV / 2 + thick / 2 },
    { pts: `${innerX},${innerY + innerH} ${innerX},${innerY + innerH - armLenV} ${innerX + thick},${innerY + innerH - armLenV} ${innerX + thick},${innerY + innerH - thickV} ${innerX + armLen},${innerY + innerH - thickV} ${innerX + armLen},${innerY + innerH}`,
      tx: innerX + armLen / 2, ty: innerY + innerH - thickV / 2,
      tx2: innerX + thick / 2, ty2: innerY + innerH - armLenV / 2 - thickV / 2 + thick / 2 },
    { pts: `${innerX},${innerY} ${innerX + armLen},${innerY} ${innerX + armLen},${innerY + thickV} ${innerX + thick},${innerY + thickV} ${innerX + thick},${innerY + armLenV} ${innerX},${innerY + armLenV}`,
      tx: innerX + armLen / 2, ty: innerY + thickV / 2,
      tx2: innerX + thick / 2, ty2: innerY + thickV + (armLenV - thickV) / 2 },
    { pts: `${innerX + innerW - armLen},${innerY} ${innerX + innerW},${innerY} ${innerX + innerW},${innerY + armLenV} ${innerX + innerW - thick},${innerY + armLenV} ${innerX + innerW - thick},${innerY + thickV} ${innerX + innerW - armLen},${innerY + thickV}`,
      tx: innerX + innerW - armLen / 2, ty: innerY + thickV / 2,
      tx2: innerX + innerW - thick / 2, ty2: innerY + thickV + (armLenV - thickV) / 2 },
  ]

  for (let i = 0; i < natOps.length; i++) {
    const no = natOps[i]
    const L = lShapes[i]
    elements.push({ tag: 'polygon', attrs: { points: L.pts, fill, stroke, 'stroke-width': 1.2, class: 'board-cell', 'data-sq': `inner-${i + 1}`, 'data-type': 'natural-opportunity' } })
    elements.push({ tag: 'text', attrs: { x: L.tx, y: L.ty - 4, 'text-anchor': 'middle', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text }, text: 'Natural Opportunity' })
    elements.push({ tag: 'text', attrs: { x: L.tx, y: L.ty + 3, 'text-anchor': 'middle', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text }, text: 'to Labor' })
    elements.push({ tag: 'text', attrs: { x: L.tx2, y: L.ty2 - 5, 'text-anchor': 'middle', 'font-size': 3.5, 'font-weight': 'bold', 'font-family': 'serif', fill: theme.text }, text: no.name })
    elements.push({ tag: 'text', attrs: { x: L.tx2, y: L.ty2 + 3, 'text-anchor': 'middle', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text }, text: `Wages $${no.wages}` })
    elements.push({ tag: 'text', attrs: { x: L.tx2, y: L.ty2 + 10, 'text-anchor': 'middle', 'font-size': 3, 'font-family': 'sans-serif', fill: theme.text }, text: `Rent $${no.rent}` })
    cells.push({ id: `inner-${i + 1}`, x: L.tx2, y: L.ty2 })
  }

  // Connector patches between L-shapes and track spaces
  const patchW = 1.5
  const cellFill = theme.lot
  const brCx = innerX + innerW - cellW / 2
  elements.push({ tag: 'rect', attrs: { x: brCx - cellW / 2, y: innerY + innerH - patchW, width: cellW, height: patchW, fill } })
  elements.push({ tag: 'rect', attrs: { x: brCx - cellW / 2, y: innerY + innerH, width: cellW, height: patchW, fill: cellFill } })
  const blCy = innerY + innerH - cellH / 2
  elements.push({ tag: 'rect', attrs: { x: innerX - patchW, y: blCy - cellH / 2, width: patchW, height: cellH, fill: cellFill } })
  elements.push({ tag: 'rect', attrs: { x: innerX, y: blCy - cellH / 2, width: patchW, height: cellH, fill } })
  const tlCx = innerX + cellW / 2
  elements.push({ tag: 'rect', attrs: { x: tlCx - cellW / 2, y: innerY, width: cellW, height: patchW, fill } })
  elements.push({ tag: 'rect', attrs: { x: tlCx - cellW / 2, y: innerY - patchW, width: cellW, height: patchW, fill: cellFill } })
  const trCy = innerY + cellH / 2
  elements.push({ tag: 'rect', attrs: { x: innerX + innerW - patchW, y: trCy - cellH / 2, width: patchW, height: cellH, fill } })
  elements.push({ tag: 'rect', attrs: { x: innerX + innerW, y: trCy - cellH / 2, width: patchW, height: cellH, fill: cellFill } })
}


export { buildPerimeterLayout, PERIMETER_THEMES }
