/**
 * Track SVG providers — produces SVG string fragments for track-based boards.
 *
 * Providers: backgammon, landlords
 *
 * Moved verbatim from js/board-diagrams.js.
 */

function esc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }

export const backgammon = {
  name: 'backgammon',
  positionType: 'point',
  labelStyle: 'none',
  defaultColors: {
    frame: '#3d2b1f', felt: '#1a5c3a',
    pointA: '#c47e3b', pointB: '#8b2500',
    dark: '#333', darkStroke: '#111', darkRing: '#555',
    light: '#eee', lightStroke: '#999', lightRing: '#ccc',
  },
  computeLayout(opts) {
    const frameW = 16
    const barW = 24
    const pointW = 32
    const panelW = pointW * 6
    const boardW = frameW * 2 + panelW * 2 + barW
    const boardH = 320
    const panelH = boardH - frameW * 2
    const pointH = Math.round(panelH * 0.417)
    return { boardW, boardH, frameW, barW, pointW, panelW, panelH, pointH }
  },
  render(ctx) {
    const { colors, opts } = ctx
    const layout = this.computeLayout(opts)
    const { boardW, boardH, frameW, barW, pointW, panelW, panelH, pointH } = layout
    const parts = []

    parts.push(`<rect x="0" y="0" width="${boardW}" height="${boardH}" rx="6" ry="6" fill="${colors.frame}"/>`)
    parts.push(`<rect x="${frameW}" y="${frameW}" width="${panelW}" height="${panelH}" fill="${colors.felt}"/>`)
    parts.push(`<rect x="${frameW + panelW + barW}" y="${frameW}" width="${panelW}" height="${panelH}" fill="${colors.felt}"/>`)
    parts.push(`<rect x="${frameW + panelW}" y="0" width="${barW}" height="${boardH}" fill="${colors.frame}"/>`)

    const bottomBase = boardH - frameW
    const topBase = frameW

    for (let i = 0; i < 24; i++) {
      const quadrant = Math.floor(i / 6)
      const posInQuad = i % 6
      const isBottom = quadrant === 0 || quadrant === 1
      const isRight = quadrant === 0 || quadrant === 3
      const panelX = isRight ? frameW + panelW + barW : frameW
      const ptColor = ((posInQuad % 2 === 0) === isBottom) ? colors.pointA : colors.pointB

      let lx
      if (isBottom) {
        lx = isRight
          ? panelX + panelW - (posInQuad + 1) * pointW
          : panelX + panelW - (posInQuad + 1) * pointW
      } else {
        lx = isRight
          ? panelX + posInQuad * pointW
          : panelX + posInQuad * pointW
      }

      const x1 = lx, x2 = lx + pointW, tipX = lx + pointW / 2

      if (isBottom) {
        const baseY = bottomBase
        const tipY = bottomBase - pointH
        parts.push(`<polygon points="${x1},${baseY} ${x2},${baseY} ${tipX},${tipY}" fill="${ptColor}" class="board-cell" data-sq="point-${i + 1}"/>`)
      } else {
        const baseY = topBase
        const tipY = topBase + pointH
        parts.push(`<polygon points="${x1},${baseY} ${x2},${baseY} ${tipX},${tipY}" fill="${ptColor}" class="board-cell" data-sq="point-${i + 1}"/>`)
      }
    }

    const setup = opts.parsedSetup || opts.setup
    if (setup) {
      parts.push(this.renderCheckers(setup, layout, opts))
    }

    return parts.join('')
  },
  renderCheckers(setup, layout, opts) {
    const { boardW, boardH, frameW, barW, pointW, panelW, pointH } = layout
    const parts = []
    const pieceSize = 22
    const pieceSpacing = 22
    const bottomBase = boardH - frameW
    const topBase = frameW
    const pieceImages = opts.pieceImages || {}
    const darkImg = pieceImages.bM || pieceImages.b || null
    const lightImg = pieceImages.wM || pieceImages.w || null

    for (let i = 0; i < 24; i++) {
      const dark = setup.dark ? (setup.dark[i] || 0) : 0
      const light = setup.light ? (setup.light[i] || 0) : 0
      if (!dark && !light) continue

      const quadrant = Math.floor(i / 6)
      const posInQuad = i % 6
      const isBottom = quadrant === 0 || quadrant === 1
      const isRight = quadrant === 0 || quadrant === 3
      const panelX = isRight ? frameW + panelW + barW : frameW

      let lx
      if (isBottom) {
        lx = isRight
          ? panelX + panelW - (posInQuad + 1) * pointW
          : panelX + panelW - (posInQuad + 1) * pointW
      } else {
        lx = isRight
          ? panelX + posInQuad * pointW
          : panelX + posInQuad * pointW
      }
      const cx = lx + pointW / 2

      const renderStack = (count, img, isDarkPiece, startY, dir) => {
        const maxShow = 5
        const show = Math.min(count, maxShow)
        const overflow = count > maxShow ? count - (maxShow - 1) : 0
        for (let j = 0; j < show; j++) {
          const cy = startY + dir * j * pieceSpacing
          if (img) {
            parts.push(`<image href="${img}" x="${cx - pieceSize / 2}" y="${cy - pieceSize / 2}" width="${pieceSize}" height="${pieceSize}"/>`)
          } else {
            parts.push(`<circle cx="${cx}" cy="${cy}" r="${pieceSize / 2 - 1}" fill="${isDarkPiece ? '#191716' : '#F8F6F2'}" stroke="${isDarkPiece ? '#4d433a' : '#5E5854'}" stroke-width="1.5"/>`)
          }
          if (j === 0 && overflow > 0) {
            const textFill = isDarkPiece ? '#fff' : '#333'
            parts.push(`<text x="${cx}" y="${cy + 4}" font-family="sans-serif" font-size="9" font-weight="bold" text-anchor="middle" fill="${textFill}">${overflow}</text>`)
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

    return parts.join('')
  },
}

// ─── LANDLORDS PROVIDER ─────────────────────────────────────────────────────

export const LANDLORDS_THEMES = {
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

export const LANDLORDS_CATEGORIES = {
  lot: 'Land In Use', necessity: 'Absolute Necessity', taxes: 'Personal Property',
  railroad: 'Interstate Public Utility', franchise: 'Local Public Utility',
  broker: 'Real Estate', luxury: 'Luxury', jail: 'Jail',
  'go-to-jail': 'No Trespassing', chance: 'Chance', special: 'Speculation',
  legacy: 'Legacy',
}

export const landlords = {
  name: 'landlords',
  positionType: 'track',
  labelStyle: 'none',
  defaultColors: {},
  computeLayout(opts) {
    const variant = opts.variant || '1904-patent'
    const boardData = opts.boardData || null
    const board = boardData ? boardData.boards[variant] : null
    const totalSpaces = board ? board.totalSpaces : (variant === '1932-prosperity' ? 36 : 40)
    const corners = 4
    const perSide = (totalSpaces - corners) / 4
    const spaceW = opts.spaceWidth || 56
    const cornerSize = opts.cornerSize || 80
    const boardW = cornerSize * 2 + perSide * spaceW
    const boardH = boardW
    return { boardW, boardH, spaceW, cornerSize, perSide, totalSpaces }
  },
  render(ctx) {
    const { opts } = ctx
    const variant = opts.variant || '1904-patent'
    const boardData = opts.boardData || null
    const board = boardData ? boardData.boards[variant] : null
    if (!board) {
      return `<rect x="0" y="0" width="400" height="60" fill="#f5e6c8"/><text x="200" y="35" text-anchor="middle" font-size="12" fill="#888">No board data for "${variant}"</text>`
    }

    const theme = LANDLORDS_THEMES[variant] || LANDLORDS_THEMES['1904-patent']
    const layout = this.computeLayout(opts)
    const { boardW, boardH, cornerSize } = layout
    const parts = []

    parts.push(`<rect x="0" y="0" width="${boardW}" height="${boardH}" fill="${theme.board}"/>`)
    parts.push(`<rect x="2" y="2" width="${boardW - 4}" height="${boardH - 4}" fill="none" stroke="${theme.border}" stroke-width="2.5"/>`)

    const spaces = board.spaces
    const sideSpaces = { bottom: [], left: [], top: [], right: [] }
    for (const s of spaces) {
      if (s.side !== 'corner' && sideSpaces[s.side]) {
        sideSpaces[s.side].push(s)
      }
    }

    const cornerOrder = this._getCornerOrder(variant, spaces)
    const cornerPositions = [
      { x: boardW - cornerSize, y: boardH - cornerSize },
      { x: 0, y: boardH - cornerSize },
      { x: 0, y: 0 },
      { x: boardW - cornerSize, y: 0 },
    ]
    for (let ci = 0; ci < 4; ci++) {
      const corner = cornerOrder[ci]
      const pos = cornerPositions[ci]
      parts.push(this._renderCorner(corner, pos.x, pos.y, cornerSize, theme, variant))
    }

    if (variant === '1904-patent') {
      for (let ci = 0; ci < 4; ci++) {
        const corner = cornerOrder[ci]
        const pos = cornerPositions[ci]
        parts.push(this._render1904Medallion(corner, pos.x, pos.y, cornerSize, theme))
      }
    }

    const sideOrder = ['bottom', 'left', 'top', 'right']
    for (let si = 0; si < 4; si++) {
      const side = sideOrder[si]
      const sideArr = sideSpaces[side]
      if (!sideArr.length) continue
      for (let i = 0; i < sideArr.length; i++) {
        const space = sideArr[i]
        const rect = this._getSpaceRect(side, i, sideArr.length, cornerSize, boardW, boardH)
        parts.push(this._renderSpace(space, rect, side, theme, variant))
      }
    }

    if (variant === '1904-patent') {
      for (let ci = 0; ci < 4; ci++) {
        const corner = cornerOrder[ci]
        const pos = cornerPositions[ci]
        parts.push(this._render1904MedallionText(corner, pos.x, pos.y, cornerSize, theme))
      }
    }

    parts.push(this._renderInner(board, cornerSize, boardW, boardH, theme, variant))

    return parts.join('')
  },
  _getCornerOrder(variant, spaces) {
    const corners = spaces.filter(s => s.side === 'corner')
    if (variant === '1932-prosperity') return [corners[1], corners[2], corners[3], corners[0]]
    if (variant === '1906-egc') return [corners[3], corners[0], corners[1], corners[2]]
    return [corners[0], corners[1], corners[2], corners[3]]
  },
  _getSpaceRect(side, idx, count, cornerSize, boardW, boardH) {
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
  },
  _renderCorner(space, x, y, size, theme, variant) {
    const parts = []
    const isGoToJail = space.notes && space.notes.includes('Go to Jail')
    const cornerFill = isGoToJail && theme['go-to-jail'] ? theme['go-to-jail'] : theme.corner
    parts.push(`<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${cornerFill}" stroke="${theme.cornerStroke}" stroke-width="1.5" class="board-cell" data-sq="pos-${space.pos}" data-type="corner"/>`)

    if (variant === '1904-patent') {
      // medallion rendered in second pass (after track cells) so it overlaps
    } else if (variant === '1906-egc' && space.split) {
      const sp = space.split
      const spColor = theme[sp.type] || theme.corner
      const mainColor = theme.corner
      const isJail = space.name === 'JAIL'

      if (isJail) {
        parts.push(`<polygon points="${x},${y} ${x + size},${y} ${x + size},${y + size}" fill="${spColor}" stroke="none" class="board-cell" data-sq="pos-${space.pos}b" data-type="${sp.type}"/>`)
        parts.push(`<polygon points="${x},${y} ${x},${y + size} ${x + size},${y + size}" fill="${mainColor}" stroke="none" class="board-cell" data-sq="pos-${space.pos}a" data-type="corner"/>`)
        parts.push(`<line x1="${x}" y1="${y}" x2="${x + size}" y2="${y + size}" stroke="${theme.cornerStroke}" stroke-width="1"/>`)
        const q1x = x + size * 0.7, q1y = y + size * 0.3
        const q2x = x + size * 0.3, q2y = y + size * 0.7
        parts.push(`<text x="${q1x}" y="${q1y - 3}" text-anchor="middle" font-size="5" font-weight="bold" font-family="serif" fill="${theme.text}" dominant-baseline="central">${esc(sp.name)}</text>`)
        if (sp.tax) parts.push(`<text x="${q1x}" y="${q1y + 5}" text-anchor="middle" font-size="3.5" font-family="serif" fill="${theme.text}" dominant-baseline="central">Tax $${sp.tax}</text>`)
        parts.push(`<text x="${q2x}" y="${q2y}" text-anchor="middle" font-size="5" font-weight="bold" font-family="serif" fill="${theme.text}" dominant-baseline="central">${esc(space.name)}</text>`)
      } else {
        parts.push(`<polygon points="${x},${y} ${x + size},${y} ${x},${y + size}" fill="${spColor}" stroke="none" class="board-cell" data-sq="pos-${space.pos}b" data-type="${sp.type}"/>`)
        parts.push(`<polygon points="${x + size},${y} ${x + size},${y + size} ${x},${y + size}" fill="${mainColor}" stroke="none" class="board-cell" data-sq="pos-${space.pos}a" data-type="corner"/>`)
        parts.push(`<line x1="${x}" y1="${y + size}" x2="${x + size}" y2="${y}" stroke="${theme.cornerStroke}" stroke-width="1"/>`)
        const q1x = x + size * 0.3, q1y = y + size * 0.3
        const q2x = x + size * 0.7, q2y = y + size * 0.7
        parts.push(`<text x="${q1x}" y="${q1y}" text-anchor="middle" font-size="5" font-weight="bold" font-family="serif" fill="${theme.text}" dominant-baseline="central">${esc(sp.name)}</text>`)
        parts.push(`<text x="${q2x}" y="${q2y - 3}" text-anchor="middle" font-size="5" font-weight="bold" font-family="serif" fill="${theme.text}" dominant-baseline="central">${esc(space.name)}</text>`)
        parts.push(`<text x="${q2x}" y="${q2y + 5}" text-anchor="middle" font-size="3.5" font-family="serif" fill="${theme.text}" dominant-baseline="central">Free</text>`)
      }
      parts.push(`<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="none" stroke="${theme.cornerStroke}" stroke-width="1.5"/>`)
      return parts.join('')
    } else if (variant === '1932-prosperity') {
      const cx = x + size / 2, cy = y + size / 2
      const r = size * 0.42
      if (space.name === 'WAGES') {
        const colors = ['#2a5a9a', '#3a8a3a', '#c8b020', '#8c2020']
        for (let i = 0; i < 4; i++) {
          const a1 = (i * Math.PI / 2) - Math.PI / 2
          const a2 = ((i + 1) * Math.PI / 2) - Math.PI / 2
          const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
          const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2)
          parts.push(`<path d="M ${x1},${y1} A ${r},${r} 0 0,1 ${x2},${y2}" fill="none" stroke="${colors[i]}" stroke-width="4"/>`)
        }
      } else if (space.fare) {
        parts.push(`<path d="M ${cx - r},${cy} A ${r},${r} 0 1,1 ${cx + r},${cy} A ${r},${r} 0 1,1 ${cx - r},${cy}" fill="none" stroke="${theme.cornerArc}" stroke-width="3.5"/>`)
      } else if (space.name === 'JAIL') {
        const bw = size * 0.85
        parts.push(`<rect x="${cx - bw/2}" y="${cy - bw/2}" width="${bw}" height="${bw}" fill="none" stroke="#4a4a4a" stroke-width="2"/>`)
        const bars = 4
        const gap = bw / (bars + 1)
        for (let i = 1; i <= bars; i++) {
          parts.push(`<line x1="${cx - bw/2 + i * gap}" y1="${cy - bw/2 + 2}" x2="${cx - bw/2 + i * gap}" y2="${cy + bw/2 - 2}" stroke="#3a3a3a" stroke-width="1.5"/>`)
        }
      }
    }

    const cx = x + size / 2, cy = y + size / 2
    if (variant === '1904-patent') {
      // text rendered in _render1904Medallion (second pass)
    } else {
      const lines = this._wrapText(space.name, 10)
      const lineH = size > 70 ? 11 : 9
      const nameY = cy - 8
      for (let i = 0; i < lines.length; i++) {
        parts.push(`<text x="${cx}" y="${nameY + i * lineH}" text-anchor="middle" font-size="${size > 70 ? 8 : 7}" font-weight="bold" font-family="sans-serif" fill="${theme.titleText}" dominant-baseline="central">${esc(lines[i])}</text>`)
      }
      let subtext = ''
      if (space.fare) subtext = `Fare $${space.fare}`
      else if (space.notes) subtext = space.notes.length > 24 ? space.notes.slice(0, 23) + '.' : space.notes
      if (subtext) {
        parts.push(`<text x="${cx}" y="${cy + lines.length * lineH / 2 + 8}" text-anchor="middle" font-size="5.5" font-family="sans-serif" fill="${theme.text}" dominant-baseline="central">${esc(subtext)}</text>`)
      }
    }
    return parts.join('')
  },
  _render1904Medallion(space, x, y, size, theme) {
    const parts = []
    const cx = x + size / 2, cy = y + size / 2
    const r = size * 0.72
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${theme.corner}" stroke="${theme.cornerStroke}" stroke-width="1.5"/>`)
    return parts.join('')
  },
  _render1904MedallionText(space, x, y, size, theme) {
    const parts = []
    const cx = x + size / 2, cy = y + size / 2
    const r = size * 0.72

    const fontSize = space.name.length > 12 ? 6 : space.name.length > 8 ? 7 : 9
    const maxChars = Math.floor((r * 1.2) / (fontSize * 0.55))
    const lines = this._wrapText(space.name, maxChars)
    const lineH = fontSize + 3
    const blockH = lines.length * lineH
    const startY = cy - blockH / 2 + lineH / 2 - (space.notes ? 3 : 0)
    for (let i = 0; i < lines.length; i++) {
      parts.push(`<text x="${cx}" y="${startY + i * lineH}" text-anchor="middle" font-size="${fontSize}" font-weight="bold" font-family="serif" fill="${theme.titleText}" dominant-baseline="central">${esc(lines[i])}</text>`)
    }
    if (space.notes) {
      const sub = space.notes.length > 22 ? space.notes.slice(0, 21) + '.' : space.notes
      parts.push(`<text x="${cx}" y="${startY + blockH + 4}" text-anchor="middle" font-size="4.5" font-family="serif" fill="${theme.text}" dominant-baseline="central">${esc(sub)}</text>`)
    }
    return parts.join('')
  },
  _renderSpace(space, rect, side, theme, variant) {
    const parts = []
    const { x, y, w, h } = rect
    const typeFill = theme[space.type] || '#f0f0f0'
    const strokeW = variant === '1904-patent' ? 1.5 : 0.75
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${typeFill}" stroke="${theme.spaceStroke}" stroke-width="${strokeW}" class="board-cell" data-sq="pos-${space.pos}" data-type="${space.type}"/>`)

    if (variant === '1932-prosperity') {
      this._render1932Stripes(parts, space, x, y, w, h, side, theme)
    }

    const cx = x + w / 2, cy = y + h / 2
    const rotate = 0
    const textW = w
    const textH = h

    const textParts = []
    if (variant === '1932-prosperity') {
      this._render1932Text(textParts, space, textW, textH, theme)
    } else if (variant === '1906-egc') {
      this._render1906Text(textParts, space, textW, textH, theme)
    } else {
      this._render1904Text(textParts, space, textW, textH, theme)
    }

    parts.push(`<g transform="translate(${cx},${cy}) rotate(${rotate})">${textParts.join('')}</g>`)
    return parts.join('')
  },
  _render1932Stripes(parts, space, x, y, w, h, side, theme) {
    const stripeKey = space.type + 'Stripe'
    const stripeColor = theme[stripeKey]
    if (!stripeColor) return

    const bandRatio = 0.22
    const lineW = 1.2

    if (side === 'bottom') {
      const bh = h * bandRatio
      parts.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${bh}" fill="${stripeColor}" opacity="0.35"/>`)
      parts.push(`<line x1="${x + 0.5}" y1="${y + bh}" x2="${x + w - 0.5}" y2="${y + bh}" stroke="${stripeColor}" stroke-width="${lineW}"/>`)
      parts.push(`<rect x="${x + 0.5}" y="${y + h - bh - 0.5}" width="${w - 1}" height="${bh}" fill="${stripeColor}" opacity="0.35"/>`)
      parts.push(`<line x1="${x + 0.5}" y1="${y + h - bh}" x2="${x + w - 0.5}" y2="${y + h - bh}" stroke="${stripeColor}" stroke-width="${lineW}"/>`)
    } else if (side === 'top') {
      const bh = h * bandRatio
      parts.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${bh}" fill="${stripeColor}" opacity="0.35"/>`)
      parts.push(`<line x1="${x + 0.5}" y1="${y + bh}" x2="${x + w - 0.5}" y2="${y + bh}" stroke="${stripeColor}" stroke-width="${lineW}"/>`)
      parts.push(`<rect x="${x + 0.5}" y="${y + h - bh - 0.5}" width="${w - 1}" height="${bh}" fill="${stripeColor}" opacity="0.35"/>`)
      parts.push(`<line x1="${x + 0.5}" y1="${y + h - bh}" x2="${x + w - 0.5}" y2="${y + h - bh}" stroke="${stripeColor}" stroke-width="${lineW}"/>`)
    } else if (side === 'right' || side === 'left') {
      const bh = h * bandRatio
      parts.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${bh}" fill="${stripeColor}" opacity="0.35"/>`)
      parts.push(`<line x1="${x + 0.5}" y1="${y + bh}" x2="${x + w - 0.5}" y2="${y + bh}" stroke="${stripeColor}" stroke-width="${lineW}"/>`)
      parts.push(`<rect x="${x + 0.5}" y="${y + h - bh - 0.5}" width="${w - 1}" height="${bh}" fill="${stripeColor}" opacity="0.35"/>`)
      parts.push(`<line x1="${x + 0.5}" y1="${y + h - bh}" x2="${x + w - 0.5}" y2="${y + h - bh}" stroke="${stripeColor}" stroke-width="${lineW}"/>`)
    }
  },
  _render1932Text(textParts, space, textW, textH, theme) {
    const category = LANDLORDS_CATEGORIES[space.type] || ''
    const narrow = textW < textH
    const fontSize = narrow ? 5 : 6
    const catSize = narrow ? 3.2 : 3.8
    const detSize = narrow ? 3.5 : 4
    const maxChars = Math.floor(textW / (narrow ? 3.6 : 4.2))
    let name = space.name
    if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'

    textParts.push(`<text text-anchor="end" font-size="3" font-family="sans-serif" fill="${theme.text}" opacity="0.6" x="${textW * 0.44}" y="${-textH * 0.38}">${space.pos}</text>`)

    if (category) {
      textParts.push(`<text text-anchor="middle" font-size="${catSize}" font-family="sans-serif" fill="${theme.text}" x="0" y="${-textH * 0.39}">${esc(category)}</text>`)
    }
    textParts.push(`<text text-anchor="middle" font-size="${fontSize}" font-weight="bold" font-family="sans-serif" fill="${theme.text}" x="0" y="${category ? 2 : 0}">${esc(name)}</text>`)

    let detail = ''
    if (space.rent) detail = `Land Rent $${space.rent}`
    else if (space.tax) detail = `$${space.tax}`
    else if (space.fare) detail = `Fare $${space.fare}`
    else if (space.price && space.type === 'franchise') detail = `$${space.price}`
    if (detail) {
      textParts.push(`<text text-anchor="middle" font-size="${detSize}" font-family="sans-serif" fill="${theme.text}" x="0" y="${textH * 0.39}">${esc(detail)}</text>`)
    }
  },
  _render1906Text(textParts, space, textW, textH, theme) {
    const narrow = textW < textH
    const fontSize = narrow ? 4.5 : 6
    const detSize = narrow ? 3.5 : 4.5
    const maxChars = Math.floor(textW / (narrow ? 3.4 : 4.2))
    let name = space.name
    if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'
    const textColor = space.type === 'chance' ? '#fff' : theme.text

    textParts.push(`<text text-anchor="middle" font-size="${fontSize}" font-weight="bold" font-family="serif" fill="${textColor}" x="0" y="${narrow ? -2 : -4}">${esc(name)}</text>`)

    let detail = ''
    if (space.price && space.rent) detail = `$${space.price} / Rent $${space.rent}`
    else if (space.price) detail = `$${space.price}`
    else if (space.rent) detail = `Rent $${space.rent}`
    else if (space.tax) detail = `Tax $${space.tax}`
    else if (space.fare) detail = `Fare $${space.fare}`
    else if (space.fee) detail = `Fee $${space.fee}`
    if (detail) {
      textParts.push(`<text text-anchor="middle" font-size="${detSize}" font-family="serif" fill="${textColor}" x="0" y="${narrow ? 6 : 8}">${esc(detail)}</text>`)
    }
  },
  _render1904Text(textParts, space, textW, textH, theme) {
    const narrow = textW < textH
    const fontSize = narrow ? 4.5 : 6
    const detSize = narrow ? 3.5 : 4.5
    const maxChars = Math.floor(textW / (narrow ? 3.4 : 4.5))
    let name = space.name
    if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '.'

    textParts.push(`<text text-anchor="middle" font-size="${fontSize}" font-weight="bold" font-family="serif" fill="${theme.text}" x="0" y="${narrow ? -4 : -6}">${esc(name)}</text>`)

    const lines = []
    if (space.rent) lines.push(`Rent $${space.rent}`)
    if (space.price) lines.push(`Sale $${space.price}`)
    if (space.tax) lines.push(`Tax $${space.tax}`)
    if (space.fare) lines.push(`Fare $${space.fare}`)
    if (space.fee) lines.push(`Fee $${space.fee}`)
    if (space.receive) lines.push(`+$${space.receive}`)
    const lineH = narrow ? 6 : 8
    for (let i = 0; i < lines.length; i++) {
      textParts.push(`<text text-anchor="middle" font-size="${detSize}" font-family="serif" fill="${theme.text}" x="0" y="${(narrow ? 3 : 4) + i * lineH}">${esc(lines[i])}</text>`)
    }
  },
  _renderInner(board, cornerSize, boardW, boardH, theme, variant) {
    const parts = []
    const innerX = cornerSize, innerY = cornerSize
    const innerW = boardW - cornerSize * 2, innerH = boardH - cornerSize * 2
    parts.push(`<rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" fill="${theme.innerBg}"/>`)

    const cx = boardW / 2, cy = boardH / 2

    if (variant === '1932-prosperity') {
      const r = innerW * 0.32
      const b = r / Math.SQRT2
      const c = r * (1 - 1 / Math.SQRT2)
      const pts = [
        [0,-r],[c,-b],[b,-b],[b,-c],
        [r,0],[b,c],[b,b],[c,b],
        [0,r],[-c,b],[-b,b],[-b,c],
        [-r,0],[-b,-c],[-b,-b],[-c,-b]
      ].map(([px,py]) => `${cx+px},${cy+py}`).join(' ')
      parts.push(`<polygon points="${pts}" fill="none" stroke="${theme.titleText}" stroke-width="2.5"/>`)
      parts.push(`<text x="${cx}" y="${cy - 16}" text-anchor="middle" font-size="10" font-weight="bold" font-family="serif" fill="${theme.titleText}">THE</text>`)
      parts.push(`<text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="12" font-weight="bold" font-family="serif" fill="${theme.titleText}">LANDLORD'S GAME</text>`)
      parts.push(`<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="8" font-family="serif" fill="${theme.titleText}">AND PROSPERITY</text>`)
      parts.push(`<text x="${cx}" y="${cy + 36}" text-anchor="middle" font-size="5.5" font-family="serif" fill="${theme.text}">A Magie Game — Patent No. 1,509,312</text>`)
      parts.push(`<text x="${cx}" y="${cy + 46}" text-anchor="middle" font-size="5" font-family="serif" fill="${theme.text}">Adgame Company (Inc.), Washington, D.C.</text>`)

      const labelOff = 14
      parts.push(`<text x="${cx}" y="${innerY + labelOff}" text-anchor="middle" font-size="5" font-family="sans-serif" fill="#c8b020">Your Checker Yellow</text>`)
      parts.push(`<text x="${cx}" y="${innerY + innerH - labelOff + 4}" text-anchor="middle" font-size="5" font-family="sans-serif" fill="#2a5a9a">Your Checker Blue</text>`)
      parts.push(`<text x="${innerX + labelOff}" y="${cy}" text-anchor="middle" font-size="5" font-family="sans-serif" fill="#3a8a3a" transform="rotate(-90,${innerX + labelOff},${cy})">Your Checker Green</text>`)
      parts.push(`<text x="${innerX + innerW - labelOff}" y="${cy}" text-anchor="middle" font-size="5" font-family="sans-serif" fill="#8c2020" transform="rotate(90,${innerX + innerW - labelOff},${cy})">Your Checker Red</text>`)

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

      parts.push(`<text x="${leftMid}" y="${cy}" text-anchor="middle" font-size="5" font-weight="bold" font-family="serif" fill="${theme.text}" transform="rotate(-90,${leftMid},${cy})">General Land Office</text>`)
      parts.push(`<text x="${rightMid}" y="${cy}" text-anchor="middle" font-size="5" font-weight="bold" font-family="serif" fill="${theme.text}" transform="rotate(90,${rightMid},${cy})">Public Treasury</text>`)

      const boxW = innerW * 0.14
      const boxH = innerH * 0.08
      const textHalfLen = 32
      const arrowGap = 4

      const leftBoxTopY = (innerY + starTop) / 2
      const leftBoxBotY = (innerY + innerH + starBot) / 2
      const leftArrowTopStart = cy - textHalfLen - arrowGap
      const leftArrowBotStart = cy + textHalfLen + arrowGap

      parts.push(`<line x1="${leftMid}" y1="${leftArrowTopStart}" x2="${leftMid}" y2="${leftBoxTopY + boxH/2 + 2}" stroke="${theme.text}" stroke-width="0.8"/>`)
      parts.push(`<path d="M ${leftMid - 2},${leftBoxTopY + boxH/2 + 5} L ${leftMid},${leftBoxTopY + boxH/2 + 2} L ${leftMid + 2},${leftBoxTopY + boxH/2 + 5}" fill="none" stroke="${theme.text}" stroke-width="0.8"/>`)
      parts.push(`<rect x="${leftMid - boxW/2}" y="${leftBoxTopY - boxH/2}" width="${boxW}" height="${boxH}" fill="#f8f4ec" stroke="${theme.spaceStroke}" stroke-width="0.75" rx="1" class="board-cell" data-sq="inner-1" data-type="land-in-use"/>`)
      parts.push(`<text x="${leftMid}" y="${leftBoxTopY - 2}" text-anchor="middle" font-size="3.5" font-family="sans-serif" fill="${theme.text}">For Sale</text>`)
      parts.push(`<text x="${leftMid}" y="${leftBoxTopY + 5}" text-anchor="middle" font-size="3.5" font-family="sans-serif" fill="${theme.text}">Land in Use</text>`)

      parts.push(`<line x1="${leftMid}" y1="${leftArrowBotStart}" x2="${leftMid}" y2="${leftBoxBotY - boxH/2 - 2}" stroke="${theme.text}" stroke-width="0.8"/>`)
      parts.push(`<path d="M ${leftMid - 2},${leftBoxBotY - boxH/2 - 5} L ${leftMid},${leftBoxBotY - boxH/2 - 2} L ${leftMid + 2},${leftBoxBotY - boxH/2 - 5}" fill="none" stroke="${theme.text}" stroke-width="0.8"/>`)
      parts.push(`<rect x="${leftMid - boxW/2}" y="${leftBoxBotY - boxH/2}" width="${boxW}" height="${boxH}" fill="#f8f4ec" stroke="${theme.spaceStroke}" stroke-width="0.75" rx="1" class="board-cell" data-sq="inner-2" data-type="idle-land"/>`)
      parts.push(`<text x="${leftMid}" y="${leftBoxBotY - 2}" text-anchor="middle" font-size="3.5" font-family="sans-serif" fill="${theme.text}">For Sale</text>`)
      parts.push(`<text x="${leftMid}" y="${leftBoxBotY + 5}" text-anchor="middle" font-size="3.5" font-family="sans-serif" fill="${theme.text}">Idle Land</text>`)

      const rightBoxTopY = leftBoxTopY
      const rightBoxBotY = leftBoxBotY
      const rightArrowTopStart = cy - textHalfLen - arrowGap
      const rightArrowBotStart = cy + textHalfLen + arrowGap

      parts.push(`<line x1="${rightMid}" y1="${rightArrowTopStart}" x2="${rightMid}" y2="${rightBoxTopY + boxH/2 + 2}" stroke="${theme.text}" stroke-width="0.8"/>`)
      parts.push(`<path d="M ${rightMid - 2},${rightBoxTopY + boxH/2 + 5} L ${rightMid},${rightBoxTopY + boxH/2 + 2} L ${rightMid + 2},${rightBoxTopY + boxH/2 + 5}" fill="none" stroke="${theme.text}" stroke-width="0.8"/>`)
      parts.push(`<rect x="${rightMid - boxW/2}" y="${rightBoxTopY - boxH/2}" width="${boxW}" height="${boxH}" fill="#f8f4ec" stroke="${theme.spaceStroke}" stroke-width="0.75" rx="1" class="board-cell" data-sq="inner-3" data-type="general-fund"/>`)
      parts.push(`<text x="${rightMid}" y="${rightBoxTopY - 2}" text-anchor="middle" font-size="3.5" font-family="sans-serif" fill="${theme.text}">General Fund</text>`)
      parts.push(`<text x="${rightMid}" y="${rightBoxTopY + 5}" text-anchor="middle" font-size="3.5" font-family="sans-serif" fill="${theme.text}"></text>`)

      parts.push(`<line x1="${rightMid}" y1="${rightArrowBotStart}" x2="${rightMid}" y2="${rightBoxBotY - boxH/2 - 2}" stroke="${theme.text}" stroke-width="0.8"/>`)
      parts.push(`<path d="M ${rightMid - 2},${rightBoxBotY - boxH/2 - 5} L ${rightMid},${rightBoxBotY - boxH/2 - 2} L ${rightMid + 2},${rightBoxBotY - boxH/2 - 5}" fill="none" stroke="${theme.text}" stroke-width="0.8"/>`)
      parts.push(`<rect x="${rightMid - boxW/2}" y="${rightBoxBotY - boxH/2}" width="${boxW}" height="${boxH}" fill="#f8f4ec" stroke="${theme.spaceStroke}" stroke-width="0.75" rx="1" class="board-cell" data-sq="inner-4" data-type="rent-fund"/>`)
      parts.push(`<text x="${rightMid}" y="${rightBoxBotY - 2}" text-anchor="middle" font-size="3.5" font-family="sans-serif" fill="${theme.text}">Prosperity Land</text>`)
      parts.push(`<text x="${rightMid}" y="${rightBoxBotY + 5}" text-anchor="middle" font-size="3.5" font-family="sans-serif" fill="${theme.text}">Rent Fund</text>`)
    } else if (variant === '1906-egc') {
      parts.push(`<text x="${cx}" y="${cy - 20}" text-anchor="middle" font-size="7" font-weight="bold" font-family="serif" fill="${theme.text}">MISCELLANEOUS</text>`)
      parts.push(`<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="9" font-weight="bold" font-family="serif" fill="${theme.titleText}">PUBLIC TREASURY</text>`)
      parts.push(`<text x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="5" font-family="serif" fill="${theme.text}">MONEY DENOMINATIONS</text>`)

      const coinY = cy + 34
      const coins = ['$1', '$5', '$10', '$50', '$100']
      const coinColors = ['#f8f4e8', '#cc3030', '#8a9a8a', '#d4c040', '#6a9a50']
      const coinR = 7
      const coinGap = 20
      const coinStartX = cx - (coins.length - 1) * coinGap / 2
      for (let i = 0; i < coins.length; i++) {
        const coinX = coinStartX + i * coinGap
        const textColor = i === 0 ? theme.text : '#fff'
        parts.push(`<circle cx="${coinX}" cy="${coinY}" r="${coinR}" fill="${coinColors[i]}" stroke="${theme.spaceStroke}" stroke-width="0.75"/>`)
        parts.push(`<text x="${coinX}" y="${coinY + 2}" text-anchor="middle" font-size="4" font-weight="bold" font-family="serif" fill="${textColor}">${coins[i]}</text>`)
      }

      parts.push(`<text x="${cx}" y="${cy + 58}" text-anchor="middle" font-size="6" font-weight="bold" font-family="serif" fill="${theme.text}">The Landlord's Game</text>`)
      parts.push(`<text x="${cx}" y="${cy + 69}" text-anchor="middle" font-size="4.5" font-family="serif" fill="${theme.text}">Patented Jan. 5, 1904, No. 748626 by Lizzie J. Magie</text>`)
      parts.push(`<text x="${cx}" y="${cy + 79}" text-anchor="middle" font-size="5" font-family="serif" fill="${theme.text}">Economic Game Co., New York</text>`)

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
          parts.push(`<polygon points="${L.pts}" fill="${fill}" stroke="${stroke}" stroke-width="1.2" class="board-cell" data-sq="inner-${i + 1}" data-type="natural-opportunity"/>`)
          parts.push(`<text x="${L.tx}" y="${L.ty - 4}" text-anchor="middle" font-size="3" font-family="sans-serif" fill="${theme.text}">Natural Opportunity</text>`)
          parts.push(`<text x="${L.tx}" y="${L.ty + 3}" text-anchor="middle" font-size="3" font-family="sans-serif" fill="${theme.text}">to Labor</text>`)
          parts.push(`<text x="${L.tx2}" y="${L.ty2 - 5}" text-anchor="middle" font-size="3.5" font-weight="bold" font-family="serif" fill="${theme.text}">${esc(no.name)}</text>`)
          parts.push(`<text x="${L.tx2}" y="${L.ty2 + 3}" text-anchor="middle" font-size="3" font-family="sans-serif" fill="${theme.text}">Wages $${no.wages}</text>`)
          parts.push(`<text x="${L.tx2}" y="${L.ty2 + 10}" text-anchor="middle" font-size="3" font-family="sans-serif" fill="${theme.text}">Rent $${no.rent}</text>`)
        }

        const cellFill = theme.lot
        const patchW = 1.5
        // TIMBERLAND (BR) → WAYBACK pos 1, bottom side idx 0 (rightmost on bottom)
        const br_cx = innerX + innerW - cellW / 2
        parts.push(`<rect x="${br_cx - cellW / 2}" y="${innerY + innerH - patchW}" width="${cellW}" height="${patchW}" fill="${fill}"/>`)
        parts.push(`<rect x="${br_cx - cellW / 2}" y="${innerY + innerH}" width="${cellW}" height="${patchW}" fill="${cellFill}"/>`)
        // FARMLANDS (BL) → BOOMTOWN pos 11, left side idx 0 (lowest on left)
        const bl_cy = innerY + innerH - cellH / 2
        parts.push(`<rect x="${innerX - patchW}" y="${bl_cy - cellH / 2}" width="${patchW}" height="${cellH}" fill="${cellFill}"/>`)
        parts.push(`<rect x="${innerX}" y="${bl_cy - cellH / 2}" width="${patchW}" height="${cellH}" fill="${fill}"/>`)
        // COAL MINES (TL) → EASY STREET pos 21, top side idx 0 (leftmost on top)
        const tl_cx = innerX + cellW / 2
        parts.push(`<rect x="${tl_cx - cellW / 2}" y="${innerY}" width="${cellW}" height="${patchW}" fill="${fill}"/>`)
        parts.push(`<rect x="${tl_cx - cellW / 2}" y="${innerY - patchW}" width="${cellW}" height="${patchW}" fill="${cellFill}"/>`)
        // OIL FIELDS (TR) → BROADWAY pos 31, right side idx 0 (topmost on right)
        const tr_cy = innerY + cellH / 2
        parts.push(`<rect x="${innerX + innerW - patchW}" y="${tr_cy - cellH / 2}" width="${patchW}" height="${cellH}" fill="${fill}"/>`)
        parts.push(`<rect x="${innerX + innerW}" y="${tr_cy - cellH / 2}" width="${patchW}" height="${cellH}" fill="${cellFill}"/>`)
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
        parts.push(`<rect x="${q.x}" y="${q.y}" width="${qw}" height="${qh}" fill="${theme.innerBg}" stroke="${theme.spaceStroke}" stroke-width="${sw}" class="board-cell" data-sq="${q.sq}" data-type="${q.label.toLowerCase()}"/>`)
        const qcx = q.x + qw / 2, qcy = q.y + qh / 2
        if (q.label === 'PUBLIC TREASURY') {
          parts.push(`<text x="${qcx}" y="${qcy - 4}" text-anchor="middle" font-size="9" font-weight="bold" font-family="serif" fill="${theme.titleText}">PUBLIC</text>`)
          parts.push(`<text x="${qcx}" y="${qcy + 10}" text-anchor="middle" font-size="9" font-weight="bold" font-family="serif" fill="${theme.titleText}">TREASURY</text>`)
        } else {
          parts.push(`<text x="${qcx}" y="${qcy + (q.sub ? -2 : 4)}" text-anchor="middle" font-size="11" font-weight="bold" font-family="serif" fill="${theme.titleText}">${q.label}</text>`)
          if (q.sub) parts.push(`<text x="${qcx}" y="${qcy + 10}" text-anchor="middle" font-size="5" font-family="serif" fill="${theme.text}">${q.sub}</text>`)
        }
      }

      parts.push(`<text x="${cx}" y="${innerY + innerH - 3}" text-anchor="middle" font-size="5" font-family="serif" fill="${theme.text}">L.J. Magie, Patent No. 748,626</text>`)
    }

    return parts.join('')
  },
  _wrapText(text, maxChars) {
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
  },
}

