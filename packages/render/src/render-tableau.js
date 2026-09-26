import { createDeck, shuffle, deal, getDeckConfig } from '../../component-deck/index.js'

export function renderTableauLayout(config) {
  const layout = config.layout || 'radial'
  const dealSpec = config.deal || {}
  const components = config.components || {}
  const seed = config.seed || 42
  const colors = config.colors || {}
  const render = config.render || {}
  const images = render._pieceImages || null

  const deckType = resolveDeckType(components)
  const deckConfig = deckType ? getDeckConfig(deckType) : null

  if (!deckConfig) {
    return emptyTableLayout(config)
  }

  const players = dealSpec.defaultPlayers || 4
  const activeDealSpec = { ...dealSpec, players }

  const createOpts = deckConfig.dealOpts ? deckConfig.dealOpts(dealSpec, players) : dealSpec
  const cards = createDeck(deckType, createOpts)
  const shuffled = shuffle(cards, seed)
  const dealResult = deal(shuffled, activeDealSpec)

  if (deckConfig.roll) {
    for (let i = 0; i < dealResult.hands.length; i++) {
      dealResult.hands[i] = deckConfig.roll(dealResult.hands[i], seed + i)
    }
    if (dealResult.community && dealResult.community.length > 0) {
      dealResult.community = deckConfig.roll(dealResult.community, seed + 99)
    }
  }

  if (dealResult.layout === 'tableau') {
    return renderTableauSolitaire(dealResult, deckConfig, seed, config, images)
  }

  if (layout === 'wall' || dealSpec.remainder === 'wall') {
    return renderWall(dealResult, deckConfig, seed, config, images)
  }

  return renderRadial(dealResult, deckConfig, players, seed, config, images)
}

function emptyTableLayout(config) {
  const w = 400, h = 200
  return {
    width: w, height: h,
    elements: [
      { tag: 'rect', attrs: { x: 0, y: 0, width: w, height: h, fill: '#1b5e3a', rx: 16 } },
      { tag: 'text', attrs: { x: w / 2, y: h / 2, 'text-anchor': 'middle', 'font-size': 14, fill: '#888', 'font-family': 'system-ui' }, text: config.meta?.label || 'Component game' },
    ],
    cells: [], labels: [], defs: [],
  }
}

function renderRadial(dealResult, deckConfig, players, seed, config, images) {
  const cardW = deckConfig.cardWidth || 44
  const cardH = deckConfig.cardHeight || 64
  const maxHand = Math.max(...dealResult.hands.map(h => h.length), dealResult.community?.length || 0)
  const handWidth = maxHand * (cardW + 4)
  const handHalfW = handWidth / 2
  const handHalfH = cardH / 2
  const separationNeeded = handWidth + 20
  const minRingFromSeparation = separationNeeded / (2 * Math.sin(Math.PI / players))
  const communityWidth = (dealResult.community?.length || 0) * (cardW + 4)
  const hasDrawPile = dealResult.drawPile && dealResult.drawPile.length > 0
  const drawPileWidth = hasDrawPile ? cardW + 8 : 0
  const centreZoneHalfW = (communityWidth + drawPileWidth) / 2
  const minRingFromCommunity = centreZoneHalfW + handHalfW + 20
  const minRing = Math.max(minRingFromSeparation, minRingFromCommunity, 150)

  const tableW = (minRing + handHalfW) * 2 + 40
  const tableH = (minRing + handHalfH) * 2 + 60
  const pad = 20
  const w = tableW + pad * 2
  const h = tableH + pad * 2

  const els = []
  els.push({ tag: 'rect', attrs: { x: 0, y: 0, width: w, height: h, fill: '#1b5e3a', rx: 16 } })
  els.push({ tag: 'rect', attrs: { x: pad, y: pad, width: tableW, height: tableH, fill: '#2d7a4f', rx: 12, stroke: '#1a4a2e', 'stroke-width': 2 } })

  const positions = getPlayerPositions(players, tableW, tableH, handHalfW, handHalfH)

  for (let p = 0; p < players; p++) {
    const hand = dealResult.hands[p]
    if (!hand || hand.length === 0) continue
    const pos = positions[p]
    const faceUp = pos.faceUp
    const zoneDesc = faceUp ? `${pos.label} — ${hand.length} cards (visible)` : `${pos.label} — ${hand.length} cards (hidden)`
    els.push({ tag: 'g', attrs: { class: 'hand', 'data-zone': zoneDesc }, children: renderHandCards(hand, pos, cardW, cardH, pad, deckConfig, images, faceUp, tableW) })

    const labelX = hand.length > 0 ? pos.x + pad : tableW / 2 + pad
    const labelY = pos.y + pad
    const isBottom = labelY > tableH / 2 + pad
    const labelOffset = isBottom ? cardH / 2 + 14 : -cardH / 2 - 6
    els.push({ tag: 'text', attrs: { x: labelX, y: labelY + labelOffset, 'text-anchor': 'middle', 'font-size': 11, fill: 'rgba(255,255,255,0.6)', 'font-family': 'system-ui' }, text: `${pos.label} (${hand.length})` })
  }

  if (dealResult.community && dealResult.community.length > 0) {
    const drawOffset = hasDrawPile ? (cardW + 8) / 2 : 0
    const commX = tableW / 2 + drawOffset
    const commY = tableH / 2
    els.push({ tag: 'g', attrs: { class: 'community', 'data-zone': `Community / Field — ${dealResult.community.length} cards (face up)` }, children: renderSpreadCards(dealResult.community, commX, commY, cardW, cardH, pad, deckConfig, images, true, tableW * 0.4) })
    const cy = commY + pad + cardH / 2 + 14
    els.push({ tag: 'text', attrs: { x: tableW / 2 + pad, y: cy, 'text-anchor': 'middle', 'font-size': 10, fill: 'rgba(255,255,255,0.5)', 'font-family': 'system-ui' }, text: `Field (${dealResult.community.length})` })
  }

  if (hasDrawPile) {
    const dp = dealResult.drawPile
    const communityCards = dealResult.community || []
    let drawX
    if (communityCards.length > 0) {
      const commCenterX = tableW / 2 + ((cardW + 8) / 2)
      const commLeftEdge = commCenterX - (communityCards.length * (cardW + 4)) / 2
      drawX = commLeftEdge - cardW - 8
    } else {
      drawX = tableW / 2
    }
    const drawY = tableH / 2
    const count = dp.length
    const backPath = getCardBackPath(deckConfig, images)
    const children = []
    const stackDepth = Math.min(4, count)
    for (let s = stackDepth - 1; s >= 0; s--) {
      const sx = drawX + pad - s * 1.5
      const sy = drawY + pad - s * 1.5
      if (backPath) {
        children.push({ tag: 'image', attrs: { href: backPath, x: sx - cardW / 2, y: sy - cardH / 2, width: cardW, height: cardH, preserveAspectRatio: 'xMidYMid meet' } })
      } else {
        children.push({ tag: 'rect', attrs: { x: sx - cardW / 2, y: sy - cardH / 2, width: cardW, height: cardH, fill: '#2a3a6a', rx: 3, stroke: '#1a2a4a', 'stroke-width': 1 } })
      }
    }
    children.push({ tag: 'text', attrs: { x: drawX + pad, y: drawY + pad + 3, 'text-anchor': 'middle', 'font-size': 11, fill: 'rgba(255,255,255,0.85)', 'font-family': 'system-ui', 'font-weight': 'bold' }, text: String(count) })
    els.push({ tag: 'g', attrs: { 'data-zone': `Draw pile — ${count} cards remaining (face down)` }, children })
  }

  els.push({ tag: 'text', attrs: { x: w / 2, y: h - 6, 'text-anchor': 'middle', 'font-size': 9, fill: 'rgba(255,255,255,0.3)', 'font-family': 'system-ui' }, text: `${deckConfig.label} · seed: ${seed}` })

  return { width: w, height: h, elements: els, cells: [], labels: [], defs: [] }
}

function renderTableauSolitaire(dealResult, deckConfig, seed, config, images) {
  const cardW = 44, cardH = 64, colGap = 6, cascadeStep = 18, pad = 20
  const numCols = dealResult.tableau.length
  const maxCascade = Math.max(...dealResult.tableau.map(col => col.length))
  const tableauW = numCols * (cardW + colGap) - colGap
  const tableauH = cardH + (maxCascade - 1) * cascadeStep
  const foundationY = pad
  const tableauY = foundationY + cardH + 20
  const totalW = tableauW + pad * 2
  const totalH = tableauY + tableauH + pad + 20
  const outerPad = 20
  const w = totalW + outerPad * 2
  const h = totalH + outerPad * 2

  const els = []
  els.push({ tag: 'rect', attrs: { x: 0, y: 0, width: w, height: h, fill: '#1b5e3a', rx: 16 } })
  els.push({ tag: 'rect', attrs: { x: outerPad, y: outerPad, width: totalW, height: totalH, fill: '#2d7a4f', rx: 12, stroke: '#1a4a2e', 'stroke-width': 2 } })

  const suitSymbols = ['♠', '♥', '♣', '♦']
  const suitNames = ['Spades', 'Hearts', 'Clubs', 'Diamonds']
  const foundationX = totalW - 4 * (cardW + colGap) - pad + colGap

  for (let f = 0; f < 4; f++) {
    const fx = outerPad + foundationX + f * (cardW + colGap)
    const children = [
      { tag: 'rect', attrs: { x: fx, y: outerPad + foundationY, width: cardW, height: cardH, fill: 'rgba(0,0,0,0.01)', stroke: 'rgba(255,255,255,0.3)', 'stroke-width': 1.5, rx: 3, 'stroke-dasharray': '4 2' } },
      { tag: 'text', attrs: { x: fx + cardW / 2, y: outerPad + foundationY + cardH / 2 + 5, 'text-anchor': 'middle', 'font-size': 14, fill: 'rgba(255,255,255,0.2)' }, text: suitSymbols[f] },
    ]
    els.push({ tag: 'g', attrs: { 'data-zone': `Foundation — ${suitNames[f]} (build A→K)` }, children })
  }

  const drawCount = dealResult.drawPile.length
  const drawX = outerPad + pad
  const backPath = getCardBackPath(deckConfig, images)
  const drawChildren = []
  if (backPath) {
    drawChildren.push({ tag: 'image', attrs: { href: backPath, x: drawX, y: outerPad + foundationY, width: cardW, height: cardH, preserveAspectRatio: 'xMidYMid meet' } })
  } else {
    drawChildren.push({ tag: 'rect', attrs: { x: drawX, y: outerPad + foundationY, width: cardW, height: cardH, fill: '#2a3a6a', rx: 3, stroke: '#1a2a4a', 'stroke-width': 1 } })
  }
  drawChildren.push({ tag: 'text', attrs: { x: drawX + cardW / 2, y: outerPad + foundationY + cardH / 2 + 4, 'text-anchor': 'middle', 'font-size': 11, fill: 'rgba(255,255,255,0.85)', 'font-weight': 'bold' }, text: String(drawCount) })
  els.push({ tag: 'g', attrs: { 'data-zone': `Stock — ${drawCount} cards (face down)` }, children: drawChildren })

  const wasteX = drawX + cardW + colGap
  els.push({ tag: 'g', attrs: { 'data-zone': 'Waste — draw cards here (empty at start)' }, children: [
    { tag: 'rect', attrs: { x: wasteX, y: outerPad + foundationY, width: cardW, height: cardH, fill: 'rgba(0,0,0,0.01)', stroke: 'rgba(255,255,255,0.2)', 'stroke-width': 1, rx: 3, 'stroke-dasharray': '3 2' } },
    { tag: 'text', attrs: { x: wasteX + cardW / 2, y: outerPad + foundationY + cardH / 2 + 4, 'text-anchor': 'middle', 'font-size': 9, fill: 'rgba(255,255,255,0.2)' }, text: 'waste' },
  ] })

  for (let col = 0; col < numCols; col++) {
    const colCards = dealResult.tableau[col]
    const cx = outerPad + pad + col * (cardW + colGap)
    const children = []
    for (let row = 0; row < colCards.length; row++) {
      const card = colCards[row]
      const cy = outerPad + tableauY + row * cascadeStep
      const cardLabel = card.faceUp ? (card.display || card.id) : 'Face down'
      if (card.faceUp) {
        const imgPath = getCardImagePath(card, images)
        if (imgPath) {
          children.push({ tag: 'g', attrs: { 'data-card': cardLabel }, children: [{ tag: 'image', attrs: { href: imgPath, x: cx, y: cy, width: cardW, height: cardH, preserveAspectRatio: 'xMidYMid meet' } }] })
        } else {
          children.push({ tag: 'g', attrs: { 'data-card': cardLabel }, children: [
            { tag: 'rect', attrs: { x: cx, y: cy, width: cardW, height: cardH, fill: '#fff', rx: 3, stroke: '#ccc', 'stroke-width': 0.5 } },
            { tag: 'text', attrs: { x: cx + cardW / 2, y: cy + cardH / 2 + 4, 'text-anchor': 'middle', 'font-size': 10, fill: '#333', 'font-family': 'system-ui' }, text: card.display || '?' },
          ] })
        }
      } else {
        if (backPath) {
          children.push({ tag: 'g', attrs: { 'data-card': cardLabel }, children: [{ tag: 'image', attrs: { href: backPath, x: cx, y: cy, width: cardW, height: cardH, preserveAspectRatio: 'xMidYMid meet' } }] })
        } else {
          children.push({ tag: 'rect', attrs: { x: cx, y: cy, width: cardW, height: cardH, fill: '#2a3a6a', rx: 3, stroke: '#1a2a4a', 'stroke-width': 1, 'data-card': cardLabel } })
        }
      }
    }
    els.push({ tag: 'g', attrs: { 'data-zone': `Column ${col + 1} — ${colCards.length} cards` }, children })
  }

  els.push({ tag: 'text', attrs: { x: w / 2, y: h - 6, 'text-anchor': 'middle', 'font-size': 9, fill: 'rgba(255,255,255,0.3)', 'font-family': 'system-ui' }, text: `${deckConfig.label} · seed: ${seed}` })

  return { width: w, height: h, elements: els, cells: [], labels: [], defs: [] }
}

function renderWall(dealResult, deckConfig, seed, config, images) {
  const tileW = 30, tileH = 40, tileGap = 2, stackOffset = 3, pad = 20, outerPad = 20
  const wallTiles = dealResult.drawPile.length
  const totalStacks = Math.ceil(wallTiles / 2)
  const stacksPerSide = Math.ceil(totalStacks / 4)
  const step = tileW + tileGap
  const wallLen = stacksPerSide * step
  const wallSquare = wallLen + 2 * tileH

  const handSize = Math.max(...dealResult.hands.map(h => h.length))
  const handLen = handSize * step
  const wallSpan = (stacksPerSide - 1) * step + tileW
  const wallSquareActual = wallSpan + 2 * tileH
  const halfSquare = wallSquareActual / 2
  const inset = halfSquare
  const minForWallClearance = 2 * (inset + tileH + pad + 10)
  const minForHands = handLen + 2 * (pad + tileH) + 40
  const totalSize = Math.max(minForWallClearance, minForHands)
  const w = totalSize + outerPad * 2
  const h = w

  const els = []
  els.push({ tag: 'rect', attrs: { x: 0, y: 0, width: w, height: h, fill: '#1b5e3a', rx: 16 } })
  els.push({ tag: 'rect', attrs: { x: outerPad, y: outerPad, width: totalSize, height: totalSize, fill: '#2d7a4f', rx: 12, stroke: '#1a4a2e', 'stroke-width': 2 } })

  const cx = totalSize / 2, cy = totalSize / 2
  const breakPoint = seed % totalStacks
  const windNames = ['South', 'East', 'North', 'West']

  const wallGroup = []
  let stackCount = 0
  for (let side = 0; side < 4; side++) {
    const sideStacks = Math.min(stacksPerSide, totalStacks - stackCount)
    const tilesOnSide = Math.min(sideStacks * 2, wallTiles - stackCount * 2)
    const isLiveEnd = breakPoint >= stackCount && breakPoint < stackCount + sideStacks
    const startIdx = stackCount
    const zoneLabel = `Wall — ${windNames[side]} side · ${tilesOnSide} tiles (${sideStacks} stacks of 2)${isLiveEnd ? ' · draw from here' : ''}`
    const sideChildren = []

    for (let i = 0; i < sideStacks; i++) {
      const globalIdx = startIdx + i
      const remaining = wallTiles - globalIdx * 2
      const height = Math.min(2, remaining)
      let tx, ty, rw, rh
      const halfSpan = wallSpan / 2
      if (side === 0) { tx = cx - halfSpan + i * step; ty = cy + halfSpan; rw = tileW; rh = tileH }
      else if (side === 1) { tx = cx + halfSpan; ty = cy + halfSpan - tileW - i * step; rw = tileH; rh = tileW }
      else if (side === 2) { tx = cx + halfSpan - tileW - i * step; ty = cy - halfSpan - tileH; rw = tileW; rh = tileH }
      else { tx = cx - halfSpan - tileH; ty = cy - halfSpan + i * step; rw = tileH; rh = tileW }

      const soX = side === 1 ? -3 : side === 3 ? 3 : 0
      const soY = side === 0 ? -3 : side === 2 ? 3 : 0
      const stackChildren = []
      if (height === 2) {
        stackChildren.push({ tag: 'rect', attrs: { x: outerPad + tx + soX, y: outerPad + ty + soY, width: rw, height: rh, fill: '#d4c9a8', rx: 3, stroke: '#a89060', 'stroke-width': 0.5 } })
      }
      stackChildren.push({ tag: 'rect', attrs: { x: outerPad + tx, y: outerPad + ty, width: rw, height: rh, fill: '#f0ede6', rx: 3, stroke: '#bbb', 'stroke-width': 0.6 } })
      if (globalIdx === breakPoint) {
        stackChildren.push({ tag: 'rect', attrs: { x: outerPad + tx, y: outerPad + ty, width: rw, height: rh, fill: 'none', rx: 3, stroke: '#ffcc00', 'stroke-width': 1.5 } })
      }
      sideChildren.push({ tag: 'g', attrs: { 'data-card': `Stack ${globalIdx + 1} · ${height} tile${height > 1 ? 's' : ''} high${globalIdx === breakPoint ? ' · BREAK' : ''}` }, children: stackChildren })
    }
    els.push({ tag: 'g', attrs: { 'data-zone': zoneLabel }, children: sideChildren })
    stackCount += sideStacks
  }

  const playerLabels = ['South (you)', 'East', 'North', 'West']
  const numPlayers = Math.min(4, dealResult.hands.length)
  for (let p = 0; p < numPlayers; p++) {
    const hand = dealResult.hands[p]
    if (!hand) continue
    const faceUp = p === 0
    const label = playerLabels[p]
    const zoneDesc = faceUp ? `${label} — ${hand.length} tiles (visible)` : `${label} — ${hand.length} tiles (hidden)`
    const children = []

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i]
      const cardLabel = faceUp ? (card.display || card.id) : 'Face down'
      let tx, ty
      if (p === 0) { tx = cx - (hand.length * step) / 2 + i * step; ty = totalSize - pad - tileH }
      else if (p === 1) { tx = totalSize - pad - tileH; ty = cy + (hand.length * step) / 2 - (i + 1) * step }
      else if (p === 2) { tx = cx + (hand.length * step) / 2 - (i + 1) * step; ty = pad }
      else { tx = pad; ty = cy - (hand.length * step) / 2 + i * step }
      const isVertical = p === 1 || p === 3
      const rw = isVertical ? tileH : tileW
      const rh = isVertical ? tileW : tileH

      if (faceUp) {
        const imgPath = getCardImagePath(card, images)
        const inset = 2
        children.push({ tag: 'g', attrs: { 'data-card': cardLabel }, children: [
          { tag: 'rect', attrs: { x: outerPad + tx, y: outerPad + ty, width: rw, height: rh, fill: '#f0ede6', rx: 4, stroke: '#bbb', 'stroke-width': 0.8 } },
          ...(imgPath ? [{ tag: 'image', attrs: { href: imgPath, x: outerPad + tx + inset, y: outerPad + ty + inset, width: rw - inset * 2, height: rh - inset * 2, preserveAspectRatio: 'xMidYMid meet' } }] : []),
        ] })
      } else {
        children.push({ tag: 'g', attrs: { 'data-card': cardLabel }, children: [
          { tag: 'rect', attrs: { x: outerPad + tx, y: outerPad + ty, width: rw, height: rh, fill: '#f0ede6', rx: 4, stroke: '#bbb', 'stroke-width': 0.8 } },
          { tag: 'rect', attrs: { x: outerPad + tx + 2, y: outerPad + ty + 2, width: rw - 4, height: rh - 4, fill: '#c8a96e', rx: 2, opacity: 0.4 } },
        ] })
      }
    }

    const labelPositions = [
      { x: cx, y: totalSize - 4, anchor: 'middle' },
      { x: totalSize - 4, y: cy, anchor: 'middle', rotate: true },
      { x: cx, y: 12, anchor: 'middle' },
      { x: 12, y: cy, anchor: 'middle', rotate: true },
    ]
    const lp = labelPositions[p]
    const rotAttr = lp.rotate ? { transform: `rotate(-90 ${outerPad + lp.x} ${outerPad + lp.y})` } : {}
    children.push({ tag: 'text', attrs: { x: outerPad + lp.x, y: outerPad + lp.y, 'text-anchor': lp.anchor, 'font-size': 10, fill: 'rgba(255,255,255,0.5)', 'font-family': 'system-ui', ...rotAttr }, text: `${label} (${hand.length})` })
    els.push({ tag: 'g', attrs: { 'data-zone': zoneDesc }, children })
  }

  els.push({ tag: 'text', attrs: { x: w / 2, y: h - 6, 'text-anchor': 'middle', 'font-size': 9, fill: 'rgba(255,255,255,0.3)', 'font-family': 'system-ui' }, text: `${deckConfig.label} · seed: ${seed}` })

  return { width: w, height: h, elements: els, cells: [], labels: [], defs: [] }
}

function getPlayerPositions(count, w, h, handHalfW, handHalfH) {
  const rx = w / 2 - handHalfW - 20
  const ry = h / 2 - handHalfH - 30
  const positions = []
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2
    positions.push({
      x: w / 2 + Math.cos(angle) * rx,
      y: h / 2 + Math.sin(angle) * ry,
      label: `Player ${i + 1}`,
      faceUp: i === 0,
    })
  }
  return positions
}

function renderHandCards(hand, pos, cardW, cardH, pad, deckConfig, images, faceUp, tableW) {
  const n = hand.length
  if (n === 0) return []
  const step = cardW + 4
  const totalW = step * (n - 1) + cardW
  const startX = pos.x - totalW / 2 + cardW / 2
  const children = []
  for (let i = 0; i < n; i++) {
    const x = startX + i * step + pad - cardW / 2
    const y = pos.y + pad - cardH / 2
    children.push(renderSingleCard(hand[i], x, y, cardW, cardH, deckConfig, images, faceUp))
  }
  return children
}

function renderSpreadCards(cards, centerX, centerY, cardW, cardH, pad, deckConfig, images, faceUp, maxWidth) {
  const n = cards.length
  if (n === 0) return []
  const step = cardW + 4
  const totalW = step * (n - 1) + cardW
  const startX = centerX - totalW / 2 + cardW / 2
  const children = []
  for (let i = 0; i < n; i++) {
    const x = startX + i * step + pad - cardW / 2
    const y = centerY + pad - cardH / 2
    children.push(renderSingleCard(cards[i], x, y, cardW, cardH, deckConfig, images, faceUp))
  }
  return children
}

function renderSingleCard(card, x, y, cardW, cardH, deckConfig, images, faceUp) {
  const cardLabel = faceUp ? (card.display || card.id || '?') : 'Face down'
  const needsTileBg = !!deckConfig?.tileBackground

  if (!faceUp) {
    const backPath = getCardBackPath(deckConfig, images)
    if (backPath && needsTileBg) {
      return { tag: 'g', attrs: { 'data-card': cardLabel }, children: [
        { tag: 'rect', attrs: { x, y, width: cardW, height: cardH, fill: '#f0ede6', rx: 4, stroke: '#bbb', 'stroke-width': 0.8 } },
        { tag: 'image', attrs: { href: backPath, x: x + 3, y: y + 3, width: cardW - 6, height: cardH - 6, preserveAspectRatio: 'xMidYMid meet' } },
      ] }
    }
    if (backPath) {
      return { tag: 'g', attrs: { 'data-card': cardLabel }, children: [
        { tag: 'image', attrs: { href: backPath, x, y, width: cardW, height: cardH, preserveAspectRatio: 'xMidYMid meet' } },
      ] }
    }
    return { tag: 'rect', attrs: { x, y, width: cardW, height: cardH, fill: '#2a3a6a', rx: 3, stroke: '#1a2a4a', 'stroke-width': 1, 'data-card': cardLabel } }
  }

  const imgPath = getCardImagePath(card, images)
  if (imgPath) {
    if (needsTileBg) {
      return { tag: 'g', attrs: { 'data-card': cardLabel }, children: [
        { tag: 'rect', attrs: { x, y, width: cardW, height: cardH, fill: '#f0ede6', rx: 4, stroke: '#bbb', 'stroke-width': 0.8 } },
        { tag: 'image', attrs: { href: imgPath, x: x + 3, y: y + 3, width: cardW - 6, height: cardH - 6, preserveAspectRatio: 'xMidYMid meet' } },
      ] }
    }
    return { tag: 'g', attrs: { 'data-card': cardLabel }, children: [
      { tag: 'image', attrs: { href: imgPath, x, y, width: cardW, height: cardH, preserveAspectRatio: 'xMidYMid meet' } },
    ] }
  }

  return { tag: 'g', attrs: { 'data-card': cardLabel }, children: [
    { tag: 'rect', attrs: { x, y, width: cardW, height: cardH, fill: '#fff', rx: 3, stroke: '#ccc', 'stroke-width': 0.5 } },
    { tag: 'text', attrs: { x: x + cardW / 2, y: y + cardH / 2 + 4, 'text-anchor': 'middle', 'font-size': Math.min(cardW * 0.3, 10), fill: '#333', 'font-family': 'system-ui' }, text: card.display || '?' },
  ] }
}

// A card knows the gallery key its picture is filed under (`card.art`); the
// piece set is chosen in frontmatter (engine.pieces.set) and arrives here
// already resolved to paths as render._pieceImages. Neither the deck nor the
// artwork naming is knowledge this renderer holds.
function getCardImagePath(card, images) {
  if (!card?.art || !images) return null
  return images[card.art] || null
}

function getCardBackPath(deckConfig, images) {
  if (!deckConfig?.backArt || !images) return null
  return images[deckConfig.backArt] || null
}

function resolveTilesType(tiles) {
  return tiles?.type || null
}

function resolveDeckType(components) {
  if (components.deck?.type) return components.deck.type
  if (components.cards?.deck) return components.cards.deck
  if (components.dice) return 'standard-dice'
  return resolveTilesType(components.tiles)
}

// A game in progress, as one seat sees it (engine#176). The static renderer
// above deals a sample hand from a seed to show what a game looks like; this
// draws the state a game is actually in, projected for the seat at the bottom
// of the table, so a card that seat may not see arrives here as `null` and is
// drawn as a back. What is on the table between the hands - a trick, a battle -
// the plugin names in groups, so nothing here knows one game from another.
//
//     view      the projected slice: { hands: [[id | null]], ... }
//     seat      the seat at the bottom, whose hand is laid out to be picked from
//     names     one display name per seat
//     current   the seat to move, marked
//     table     [{ label, cards: [id], selectable?, layout?, slots? }] - what lies
//               face up between the hands; a selectable group is picked from
//               like a hand. A group is a labelled row unless its layout says
//               otherwise: `pile` groups share one row side by side, each
//               showing outlines for `slots` it has room for (a free cell, a
//               foundation), and `column` groups stand side by side as
//               cascades, a patience tableau, where a null is a face-down card
//     card      id -> card, for the faces
//     deckType  the deck, for its size and its back
//     selected  ids raised out of the bottom hand
export function renderTableState(opts) {
  const { view, seat = 0, names = [], current = null, table = [], card, deckType, images = null, selected = [] } = opts
  const deckConfig = getDeckConfig(deckType) || {}
  const cardW = deckConfig.cardWidth || 44
  const cardH = deckConfig.cardHeight || 64
  const hands = view.hands || []
  const seats = hands.length
  const raised = new Set(selected)

  const w = 760
  const pad = 20
  const lift = 14
  // A game nobody holds anything in - patience, dice rolled on the table -
  // gives the table the room the hands would have taken.
  const handless = hands.every(h => !h.length)
  const ownRow = handless ? 0 : cardH + lift + 30
  const rows = table.filter(g => !g.layout || g.layout === 'row')
  const piles = table.filter(g => g.layout === 'pile')
  const columns = table.filter(g => g.layout === 'column')
  // A cascade overlaps its cards: a face-down card shows a sliver, a face-up
  // card enough to read, and a tall column is squeezed to fit.
  const COLUMN_MAX = cardH * 5
  const cascade = (cards) => {
    const steps = cards.slice(0, -1).map(id => (id === null ? 7 : 18))
    const total = steps.reduce((n, v) => n + v, 0)
    const squeeze = total > COLUMN_MAX ? COLUMN_MAX / total : 1
    return steps.map(v => v * squeeze)
  }
  const columnsH = columns.length
    ? cardH + Math.max(0, ...columns.map(g => cascade(g.cards || []).reduce((n, v) => n + v, 0))) + 30
    : 0
  const tableH = rows.length * (cardH + 22) + (piles.length ? cardH + 26 : 0) + columnsH
  const centreH = Math.max(cardH + 40, tableH + 10)
  const oppRow = handless ? 0 : cardH + 34
  const margin = handless ? 12 : 0
  const h = pad * 2 + oppRow + centreH + ownRow + (seats > 2 ? 40 : 0) + margin * 2

  const els = []
  els.push({ tag: 'rect', attrs: { x: 0, y: 0, width: w, height: h, fill: '#1b5e3a', rx: 16 } })
  els.push({ tag: 'rect', attrs: { x: pad / 2, y: pad / 2, width: w - pad, height: h - pad, fill: '#2d7a4f', rx: 12, stroke: '#1a4a2e', 'stroke-width': 2 } })

  const text = (x, y, value, extra = {}) => ({ tag: 'text', attrs: { x, y, 'text-anchor': 'middle', 'font-size': 12, fill: 'rgba(255,255,255,0.8)', 'font-family': 'system-ui', ...extra }, text: value })
  const face = (id, x, y, up) => renderSingleCard(up && id ? { id, ...(card(id) || {}) } : {}, x, y, cardW, cardH, deckConfig, images, !!(up && id))
  // A card the seat may pick. Its artwork opts out of clicks like all
  // decoration, and a group has no area of its own to click, so the card
  // carries a hit rectangle the size of the face: without one, every hand
  // drew correctly and no card in it could be picked.
  const pickable = (id, x, y, up) => ({
    tag: 'g',
    attrs: { class: up ? 'hand-card selected' : 'hand-card', 'data-card-id': id },
    children: [
      face(id, x, y, true),
      { tag: 'rect', attrs: { class: 'card-hit', x, y, width: cardW, height: cardH, fill: 'transparent', 'pointer-events': 'all' } },
    ],
  })
  const seatLabel = (s) => `${names[s] || `Player ${s + 1}`}${s === current ? ' ◀' : ''}`

  // The others round the top of the table, clockwise from the left of the
  // bottom seat, each a fan of backs with a count.
  // With no hands to draw, the seats are the page's to list.
  const others = []
  if (!handless) for (let i = 1; i < seats; i++) others.push((seat + i) % seats)
  others.forEach((s, i) => {
    const hand = hands[s] || []
    const cx = pad + ((i + 0.5) / others.length) * (w - 2 * pad)
    const cy = pad + 18
    const shown = Math.min(hand.length, 8)
    const step = 7
    const x0 = cx - (cardW + step * Math.max(0, shown - 1)) / 2
    const children = []
    for (let k = 0; k < shown; k++) children.push(face(hand[k], x0 + k * step, cy, hand[k] !== null))
    els.push({ tag: 'g', attrs: { class: 'seat', 'data-seat': s, 'data-zone': `${names[s] || s} — ${hand.length} cards` }, children })
    els.push(text(cx, cy + cardH + 14, `${seatLabel(s)} · ${hand.length}`, s === current ? { fill: '#ffd966', 'font-weight': 'bold' } : {}))
  })

  // The table: each group a labelled row, face up.
  const centreTop = pad + oppRow + (seats > 2 ? 20 : 0) + margin
  const cardAt = (group, id, x, y) => {
    if (!group.selectable || id === null) return face(id, x, y, id !== null)
    const up = raised.has(id)
    return pickable(id, x, y - (up ? lift : 0), up)
  }
  const outline = (x, y) => ({ tag: 'rect', attrs: { x, y, width: cardW, height: cardH, rx: 4, fill: 'none', stroke: 'rgba(255,255,255,0.35)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' } })
  rows.forEach((group, i) => {
    const y = centreTop + i * (cardH + 22)
    const cards = group.cards || []
    const step = Math.min(cardW + 4, (w - 3 * pad) / Math.max(1, cards.length))
    const x0 = w / 2 - (step * Math.max(0, cards.length - 1) + cardW) / 2
    // A group the seat picks from - dice to keep - is laid out like a hand.
    const children = cards.map((id, k) => {
      if (!group.selectable) return face(id, x0 + k * step, y, true)
      const up = raised.has(id)
      return pickable(id, x0 + k * step, y - (up ? lift : 0), up)
    })
    els.push({ tag: 'g', attrs: { class: 'table', 'data-zone': group.label }, children })
    if (group.label) els.push(text(w / 2, y + cardH + 14, group.label, { 'font-size': 11, fill: 'rgba(255,255,255,0.6)' }))
  })

  // Piles in one row: stock, waste, free cells, foundations.
  if (piles.length) {
    const y = centreTop + rows.length * (cardH + 22)
    const fan = 12
    const widthOf = (g) => {
      const n = Math.max((g.cards || []).length, g.slots || 1)
      return g.slots ? n * (cardW + 6) - 6 : cardW + fan * Math.max(0, n - 1)
    }
    const gap = 22
    const total = piles.reduce((n, g) => n + widthOf(g), 0) + gap * (piles.length - 1)
    let x = w / 2 - total / 2
    for (const group of piles) {
      const cards = group.cards || []
      const children = []
      if (group.slots) {
        for (let k = 0; k < group.slots; k++) {
          const cx = x + k * (cardW + 6)
          children.push(k < cards.length && cards[k] !== undefined ? cardAt(group, cards[k], cx, y) : outline(cx, y))
        }
      } else if (!cards.length) {
        children.push(outline(x, y))
      } else {
        cards.forEach((id, k) => children.push(cardAt(group, id, x + k * fan, y)))
      }
      els.push({ tag: 'g', attrs: { class: 'table pile', 'data-zone': group.label }, children })
      if (group.label) els.push(text(x + widthOf(group) / 2, y + cardH + 14, group.label, { 'font-size': 11, fill: 'rgba(255,255,255,0.6)' }))
      x += widthOf(group) + gap
    }
  }

  // Columns side by side, each a cascade read from the top down.
  if (columns.length) {
    const y0 = centreTop + rows.length * (cardH + 22) + (piles.length ? cardH + 26 : 0)
    const colW = Math.min(cardW + 14, (w - 2 * pad) / columns.length)
    const x0 = w / 2 - (colW * columns.length) / 2 + (colW - cardW) / 2
    columns.forEach((group, i) => {
      const cards = group.cards || []
      const x = x0 + i * colW
      const steps = cascade(cards)
      const children = [outline(x, y0)]
      let y = y0
      cards.forEach((id, k) => {
        children.push(cardAt(group, id, x, y))
        y += steps[k] || 0
      })
      els.push({ tag: 'g', attrs: { class: 'table column', 'data-zone': group.label }, children })
    })
  }
  if (!table.length) els.push(text(w / 2, centreTop + cardH / 2, '—', { fill: 'rgba(255,255,255,0.35)' }))

  // The bottom seat's own hand. Cards it can see are laid out to be picked;
  // a pile it may not look at is a stack with a count.
  const own = hands[seat] || []
  const ownY = h - pad - cardH - 26
  const children = []
  const visible = own.filter(id => id !== null)
  if (visible.length) {
    const step = Math.min(cardW + 4, (w - 2 * pad - cardW) / Math.max(1, own.length - 1))
    const x0 = w / 2 - (step * Math.max(0, own.length - 1) + cardW) / 2
    own.forEach((id, k) => {
      const up = raised.has(id)
      children.push(pickable(id, x0 + k * step, ownY - (up ? lift : 0), up))
    })
  } else if (own.length) {
    const shown = Math.min(own.length, 8)
    const x0 = w / 2 - (cardW + 3 * (shown - 1)) / 2
    for (let k = 0; k < shown; k++) children.push(face(null, x0 + k * 3, ownY, false))
  }
  els.push({ tag: 'g', attrs: { class: 'own-hand', 'data-seat': seat, 'data-zone': `${names[seat] || seat} — ${own.length} cards` }, children })
  if (!handless) els.push(text(w / 2, h - pad + 2, `${seatLabel(seat)} · ${own.length}`, seat === current ? { fill: '#ffd966', 'font-weight': 'bold' } : {}))

  return { width: w, height: h, elements: els, cells: [], labels: [], defs: [] }
}
