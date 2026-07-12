/**
 * Pit (mancala) SVG provider — produces SVG string fragments for pit-based boards.
 *
 * Moved verbatim from js/board-diagrams.js.
 */

export const mancala = {
  name: 'mancala',
  positionType: 'pit',
  labelStyle: 'none',
  defaultColors: {
    boardOuter: '#7A5A32', boardInner: '#9B7740',
    pit: '#4E3320', pitStroke: '#3A2515',
    seed: '#C8B898', seedStroke: '#8A7A5A',
    marker: '#C49040', border: null, borderDash: null,
  },
  computeLayout(opts) {
    const pitsPerSide = opts.pitsPerSide || 6
    const hasStores = opts.hasStores !== false
    const boardRows = opts.boardRows || 2
    const pitRadius = opts.pitRadius || 22
    const storeRx = opts.storeRx || 24
    const storeRy = opts.storeRy || 50
    const boardShape = opts.boardShape || 'rect'
    const rx = opts.cornerRadius || 22

    if (boardShape === 'ellipse') {
      const pitSpacing = pitRadius * 2.96
      const pitSpan = (pitsPerSide - 1) * pitSpacing
      const rowOffset = pitRadius * 2
      const storeGap = 2
      const storeCenterOffset = hasStores ? pitSpan / 2 + pitRadius + storeGap + storeRx : 0
      const outerRx = (hasStores ? storeCenterOffset + storeRx : pitSpan / 2 + pitRadius) + pitRadius * 2.67
      const outerRy = rowOffset + pitRadius * 2.22
      const boardW = Math.round(2 * (outerRx + pitRadius * 0.67))
      const boardH = Math.round(2 * (outerRy + pitRadius * 0.78))
      return { boardW, boardH, pitsPerSide, hasStores, boardRows, pitRadius, storeRx, storeRy, boardShape, pitSpacing, pitSpan, rowOffset, storeCenterOffset, outerRx, outerRy }
    }

    const pad = opts.padEdge || pitRadius * 1.65
    const frameInset = 16
    const interRow = pitRadius * 2.4
    const divGap = boardRows === 4 ? pitRadius * 2.7 : 0

    const contentH = boardRows === 4
      ? interRow * 2 + divGap
      : interRow * (boardRows - 1)
    const boardH = contentH + pad * 2 + frameInset * 2

    const storeWidth = hasStores ? storeRx * 2 + 16 : 0
    const pitsAreaWidth = pitsPerSide * (pitRadius * 2 + 10)
    const boardW = storeWidth * 2 + pitsAreaWidth + pad * 2 + frameInset * 2

    return { boardW, boardH, pitsPerSide, hasStores, boardRows, pitRadius, storeRx, storeRy, boardShape, storeWidth, rx, pad, frameInset, interRow, divGap }
  },
  render(ctx) {
    const { colors, opts } = ctx
    const layout = this.computeLayout(opts)
    const { pitsPerSide, hasStores, boardRows, pitRadius, storeRx, storeRy, boardShape, boardW, boardH } = layout
    const parts = []

    if (boardShape === 'ellipse') {
      return this.renderEllipse(layout, colors, opts)
    }

    const { storeWidth, rx, pad, frameInset, interRow, divGap } = layout

    const bx = frameInset / 2, by = frameInset / 2
    const bw = boardW - frameInset, bh = boardH - frameInset

    parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${rx}" ry="${rx}" fill="${colors.boardOuter}"/>`)
    parts.push(`<rect x="${bx + 6}" y="${by + 6}" width="${bw - 12}" height="${bh - 12}" rx="${rx - 4}" ry="${rx - 4}" fill="${colors.boardInner}"/>`)
    if (colors.border) {
      const dashAttr = colors.borderDash ? ` stroke-dasharray="${colors.borderDash}"` : ''
      parts.push(`<rect x="${bx + 12}" y="${by + 12}" width="${bw - 24}" height="${bh - 24}" rx="${rx - 8}" ry="${rx - 8}" fill="none" stroke="${colors.border}" stroke-width="1.5"${dashAttr}/>`)
    }

    if (hasStores) {
      const storeCy = boardH / 2
      const leftX = frameInset + storeWidth / 2
      const rightX = boardW - frameInset - storeWidth / 2
      parts.push(`<ellipse cx="${leftX}" cy="${storeCy}" rx="${storeRx}" ry="${storeRy}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="store-1"/>`)
      parts.push(`<ellipse cx="${rightX}" cy="${storeCy}" rx="${storeRx}" ry="${storeRy}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="store-0"/>`)
    }

    const pitsLeftEdge = frameInset + (hasStores ? storeWidth : 0) + pad
    const pitsRightEdge = boardW - frameInset - (hasStores ? storeWidth : 0) - pad
    const pitsAvailWidth = pitsRightEdge - pitsLeftEdge
    const pitSpacing = pitsPerSide > 1 ? pitsAvailWidth / (pitsPerSide - 1) : 0

    const seedsPerPit = opts.seedsPerPit || 4
    const seedRadius = Math.min(4.5, pitRadius * 0.2)
    const markers = opts.markers || []
    const markerSet = new Set(markers)
    const pitCurve = opts.pitCurve || 0

    const topPitCenter = frameInset + pad
    const botPitCenter = boardH - frameInset - pad
    const rowCenters = []
    if (boardRows === 2) {
      rowCenters.push(topPitCenter, botPitCenter)
    } else if (boardRows === 4) {
      rowCenters.push(
        topPitCenter,
        topPitCenter + interRow,
        botPitCenter - interRow,
        botPitCenter
      )
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

        parts.push(`<circle cx="${cx}" cy="${cy}" r="${pitRadius}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="pit-${pitIdx}"/>`)

        if (markerSet.has(pitIdx)) {
          parts.push(`<circle cx="${cx}" cy="${cy}" r="${pitRadius - 8}" fill="none" stroke="${colors.marker}" stroke-width="2" stroke-dasharray="4,3"/>`)
        }

        const seedCount = (opts.parsedSetup && opts.parsedSetup.pits) ? opts.parsedSetup.pits[pitIdx] : seedsPerPit
        if (seedCount > 0) {
          parts.push(renderMancalaPieces(cx, cy, seedCount, pitRadius, seedRadius, colors, opts.pieceImages))
        }
      }
    }

    if (boardRows === 4) {
      const divY = boardH / 2
      parts.push(`<line x1="${pitsLeftEdge - pitRadius}" y1="${divY}" x2="${pitsLeftEdge + (pitsPerSide - 1) * pitSpacing + pitRadius}" y2="${divY}" stroke="${colors.boardOuter}" stroke-width="2.5" stroke-dasharray="6,4"/>`)
    }

    return parts.join('')
  },
  renderEllipse(layout, colors, opts) {
    const { boardW, boardH, pitsPerSide, hasStores, pitRadius, storeRx, storeRy, pitSpacing, rowOffset, storeCenterOffset, outerRx, outerRy } = layout
    const parts = []
    const cx = boardW / 2, cy = boardH / 2

    parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${outerRx}" ry="${outerRy}" fill="${colors.boardOuter}"/>`)
    parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${outerRx - 8}" ry="${outerRy - 8}" fill="${colors.boardInner}"/>`)

    if (hasStores) {
      const leftX = cx - storeCenterOffset
      const rightX = cx + storeCenterOffset
      parts.push(`<ellipse cx="${leftX}" cy="${cy}" rx="${storeRx}" ry="${storeRy}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="store-1"/>`)
      parts.push(`<ellipse cx="${rightX}" cy="${cy}" rx="${storeRx}" ry="${storeRy}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="store-0"/>`)
    }

    const seedsPerPit = opts.seedsPerPit || 4
    const seedRadius = Math.min(4.5, pitRadius * 0.2)
    const markers = opts.markers || []
    const markerSet = new Set(markers)
    const pitCurve = opts.pitCurve || 0
    const topCy = cy - rowOffset
    const botCy = cy + rowOffset

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
      parts.push(`<circle cx="${px}" cy="${topY}" r="${pitRadius}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="pit-${topIdx}"/>`)
      parts.push(`<circle cx="${px}" cy="${botY}" r="${pitRadius}" fill="${colors.pit}" stroke="${colors.pitStroke}" stroke-width="1.5" class="board-cell" data-sq="pit-${pitsPerSide + botIdx}"/>`)

      if (markerSet.has(topIdx)) {
        parts.push(`<circle cx="${px}" cy="${topY}" r="${pitRadius - 8}" fill="none" stroke="${colors.marker}" stroke-width="2" stroke-dasharray="4,3"/>`)
      }
      if (markerSet.has(pitsPerSide + botIdx)) {
        parts.push(`<circle cx="${px}" cy="${botY}" r="${pitRadius - 8}" fill="none" stroke="${colors.marker}" stroke-width="2" stroke-dasharray="4,3"/>`)
      }

      const topSeedCount = (opts.parsedSetup && opts.parsedSetup.pits) ? opts.parsedSetup.pits[topIdx] : seedsPerPit
      const botSeedCount = (opts.parsedSetup && opts.parsedSetup.pits) ? opts.parsedSetup.pits[pitsPerSide + botIdx] : seedsPerPit
      if (topSeedCount > 0) parts.push(renderMancalaPieces(px, topY, topSeedCount, pitRadius, seedRadius, colors, opts.pieceImages))
      if (botSeedCount > 0) parts.push(renderMancalaPieces(px, botY, botSeedCount, pitRadius, seedRadius, colors, opts.pieceImages))
    }

    return parts.join('')
  },
}

function renderMancalaPieces(cx, cy, count, pitRadius, seedRadius, colors, pieceImages) {
  if (pieceImages && pieceImages[String(count)]) {
    const size = pitRadius * 1.6
    return `<image href="${pieceImages[String(count)]}" x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" pointer-events="none"/>`
  }
  return renderSeeds(cx, cy, count, seedRadius, colors)
}

function renderSeeds(cx, cy, count, r, colors) {
  const parts = []
  const positions = seedLayout(count, r)
  for (const [sx, sy] of positions) {
    parts.push(`<circle cx="${cx + sx}" cy="${cy + sy}" r="${r}" fill="${colors.seed}" stroke="${colors.seedStroke}" stroke-width="0.5"/>`)
  }
  return parts.join('')
}

function seedLayout(count, r) {
  if (count <= 0) return []
  const gap = r * 2.5
  if (count === 1) return [[0, 0]]
  if (count === 2) return [[-gap / 2, 0], [gap / 2, 0]]
  if (count === 3) return [[0, -gap / 2], [-gap / 2, gap / 2], [gap / 2, gap / 2]]
  if (count === 4) return [[-gap / 2, -gap / 2], [gap / 2, -gap / 2], [-gap / 2, gap / 2], [gap / 2, gap / 2]]
  if (count <= 6) {
    const top = Math.ceil(count / 2)
    const bot = count - top
    const result = []
    for (let i = 0; i < top; i++) result.push([(i - (top - 1) / 2) * gap, -gap / 2])
    for (let i = 0; i < bot; i++) result.push([(i - (bot - 1) / 2) * gap, gap / 2])
    return result
  }
  if (count <= 9) {
    const rows = [Math.ceil(count / 3), Math.ceil((count - Math.ceil(count / 3)) / 2), count - Math.ceil(count / 3) - Math.ceil((count - Math.ceil(count / 3)) / 2)]
    const result = []
    for (let ri = 0; ri < 3; ri++) {
      const n = rows[ri]
      for (let i = 0; i < n; i++) result.push([(i - (n - 1) / 2) * gap, (ri - 1) * gap])
    }
    return result
  }
  const result = []
  const side = Math.ceil(Math.sqrt(count))
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / side)
    const col = i % side
    const rowCount = (row < Math.floor(count / side)) ? side : count % side || side
    result.push([(col - (rowCount - 1) / 2) * gap * 0.8, (row - (Math.ceil(count / side) - 1) / 2) * gap * 0.8])
  }
  return result
}

