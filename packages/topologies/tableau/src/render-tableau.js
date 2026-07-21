import { createDeck, shuffle, deal } from '../../../component-deck/src/deck-ops.js'
import { getDeckConfig } from '../../../component-deck/src/deck-registry.js'
import '../../../component-deck/src/decks/standard-52.js'
import '../../../component-deck/src/decks/bavarian-32.js'
import '../../../component-deck/src/decks/hanafuda-48.js'
import '../../../component-deck/src/decks/mahjong-136.js'
import '../../../component-deck/src/decks/dominoes-28.js'
import '../../../component-deck/src/decks/standard-dice.js'

export function renderTableauLayout(config) {
  const layout = config.layout || 'radial'
  const dealSpec = config.deal || {}
  const components = config.components || {}
  const seed = config.seed || 42
  const colors = config.colors || {}
  const render = config.render || {}

  const deckType = resolveDeckType(components)
  const deckConfig = deckType ? getDeckConfig(deckType) : null

  if (!deckConfig) {
    return emptyTableLayout(config)
  }

  const players = dealSpec.defaultPlayers || 4
  const activeDealSpec = { ...dealSpec, players }

  const createOpts = deckType === 'standard-dice'
    ? { count: (dealSpec.perPlayer || 0) * players + (dealSpec.community || 0) }
    : dealSpec
  const cards = createDeck(deckType, createOpts)
  const shuffled = shuffle(cards, seed)
  const dealResult = deal(shuffled, activeDealSpec)

  if (deckConfig.roll && deckType === 'standard-dice') {
    for (let i = 0; i < dealResult.hands.length; i++) {
      dealResult.hands[i] = deckConfig.roll(dealResult.hands[i], seed + i)
    }
    if (dealResult.community && dealResult.community.length > 0) {
      dealResult.community = deckConfig.roll(dealResult.community, seed + 99)
    }
  }

  if (dealResult.layout === 'tableau') {
    return renderTableauSolitaire(dealResult, deckType, deckConfig, seed, config)
  }

  if (layout === 'wall' || dealSpec.remainder === 'wall') {
    return renderWall(dealResult, deckType, deckConfig, seed, config)
  }

  return renderRadial(dealResult, deckType, deckConfig, players, seed, config)
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

function renderRadial(dealResult, deckType, deckConfig, players, seed, config) {
  const cardW = deckType === 'dominoes-28' ? 32 : deckType === 'standard-dice' ? 48 : 44
  const cardH = deckType === 'dominoes-28' ? 60 : deckType === 'standard-dice' ? 48 : 64
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
    els.push({ tag: 'g', attrs: { class: 'hand', 'data-zone': zoneDesc }, children: renderHandCards(hand, pos, cardW, cardH, pad, deckType, faceUp, tableW) })

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
    els.push({ tag: 'g', attrs: { class: 'community', 'data-zone': `Community / Field — ${dealResult.community.length} cards (face up)` }, children: renderSpreadCards(dealResult.community, commX, commY, cardW, cardH, pad, deckType, true, tableW * 0.4) })
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
    const backPath = getCardBackPath(deckType)
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

function renderTableauSolitaire(dealResult, deckType, deckConfig, seed, config) {
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
  const backPath = getCardBackPath(deckType)
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
        const imgPath = getCardImagePath(card, deckType)
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

function renderWall(dealResult, deckType, deckConfig, seed, config) {
  const tileW = 30, tileH = 40, tileGap = 2, stackOffset = 3, pad = 20, outerPad = 20
  const tileSet = config.deal?.tileSet || 'mahjong-regular'
  const wallTiles = dealResult.drawPile.length
  const totalStacks = Math.ceil(wallTiles / 2)
  const stacksPerSide = Math.ceil(totalStacks / 4)
  const step = tileW + tileGap
  const wallLen = stacksPerSide * step
  const wallSquare = wallLen + 2 * tileH

  const handSize = Math.max(...dealResult.hands.map(h => h.length))
  const handLen = handSize * step
  const halfSquare = wallSquare / 2
  const inset = halfSquare + tileH
  const minForWallClearance = 2 * (pad + tileH + inset + 10)
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
      if (side === 0) { tx = cx - wallLen / 2 + i * step; ty = cy + inset - tileH; rw = tileW; rh = tileH }
      else if (side === 1) { tx = cx + inset - tileH; ty = cy + wallLen / 2 - (i + 1) * step; rw = tileH; rh = tileW }
      else if (side === 2) { tx = cx + wallLen / 2 - (i + 1) * step; ty = cy - inset; rw = tileW; rh = tileH }
      else { tx = cx - inset; ty = cy - wallLen / 2 + i * step; rw = tileH; rh = tileW }

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
        const imgPath = getCardImagePath(card, deckType, { tileSet })
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

function renderHandCards(hand, pos, cardW, cardH, pad, deckType, faceUp, tableW) {
  const n = hand.length
  if (n === 0) return []
  const step = cardW + 4
  const totalW = step * (n - 1) + cardW
  const startX = pos.x - totalW / 2 + cardW / 2
  const children = []
  for (let i = 0; i < n; i++) {
    const x = startX + i * step + pad - cardW / 2
    const y = pos.y + pad - cardH / 2
    children.push(renderSingleCard(hand[i], x, y, cardW, cardH, deckType, faceUp))
  }
  return children
}

function renderSpreadCards(cards, centerX, centerY, cardW, cardH, pad, deckType, faceUp, maxWidth) {
  const n = cards.length
  if (n === 0) return []
  const step = cardW + 4
  const totalW = step * (n - 1) + cardW
  const startX = centerX - totalW / 2 + cardW / 2
  const children = []
  for (let i = 0; i < n; i++) {
    const x = startX + i * step + pad - cardW / 2
    const y = centerY + pad - cardH / 2
    children.push(renderSingleCard(cards[i], x, y, cardW, cardH, deckType, faceUp))
  }
  return children
}

function renderSingleCard(card, x, y, cardW, cardH, deckType, faceUp) {
  const cardLabel = faceUp ? (card.display || card.id || '?') : 'Face down'
  const tileBgDecks = new Set(['mahjong-136', 'dominoes-28'])
  const needsTileBg = tileBgDecks.has(deckType)

  if (!faceUp) {
    const backPath = getCardBackPath(deckType)
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

  const imgPath = getCardImagePath(card, deckType)
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

function getCardImagePath(card, deckType, opts) {
  if (deckType === 'standard-52') {
    if (card.suit === 'joker') return `../pieces/sets/letele-cards/J-1.svg`
    const suitLetter = { spades: 'S', hearts: 'H', clubs: 'C', diamonds: 'D' }[card.suit]
    return `../pieces/sets/letele-cards/${suitLetter}-${card.rank}.svg`
  }
  if (deckType === 'hanafuda-48') {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const month = monthNames[card.monthIndex]
    const type = card.type.charAt(0).toUpperCase() + card.type.slice(1)
    if (card.name.match(/Plain \d/)) return `../pieces/sets/hanafuda-traditional/Hanafuda_${month}_${type}_${card.name.slice(-1)}_Alt.svg`
    return `../pieces/sets/hanafuda-traditional/Hanafuda_${month}_${type}_Alt.svg`
  }
  if (deckType === 'bavarian-32') {
    const suitMap = { acorns: 'eichel', leaves: 'blatt', hearts: 'hart', bells: 'schellen' }
    const suit = suitMap[card.suit]
    const faceMap = {
      eichel: { U: '11_unter', O: '12_ober', K: '13_konig', A: '01_daus' },
      hart: { U: '11_unter', O: '12_ober', K: '13_konig', A: '01_daus' },
      blatt: { U: '11_jack', O: '12_queen', K: '13_king', A: '01_daus' },
      schellen: { U: '11_jack', O: '12_queen', K: '13_king', A: '01' },
    }
    const numericMap = { 7: '07', 8: '08', 9: '09', 10: '10' }
    const rank = faceMap[suit]?.[card.rank] || numericMap[card.rank] || card.rank
    return `../pieces/sets/mfrasca-skat/Playing_card-german-${suit}-${rank}.svg`
  }
  if (deckType === 'mahjong-136') {
    const tileSet = opts?.tileSet || 'mahjong-regular'
    if (tileSet === 'mahjong-planar') {
      const suitFileMap = { bamboo: 'tiao', circles: 'bing', characters: 'wan' }
      const windFileMap = { east: 'Eastwind', south: 'Southwind', west: 'Westwind', north: 'Northwind' }
      const dragonFileMap = { red: 'Reddragon', green: 'Greendragon', white: 'Whitedragon' }
      if (card.suit === 'wind') return `../pieces/sets/mahjong-planar/MJ${windFileMap[card.rank]}.svg`
      if (card.suit === 'dragon') return `../pieces/sets/mahjong-planar/MJ${dragonFileMap[card.rank]}.svg`
      if (suitFileMap[card.suit]) return `../pieces/sets/mahjong-planar/MJ${card.rank}${suitFileMap[card.suit]}.svg`
      return null
    }
    const suitFileMap = { bamboo: 'Sou', circles: 'Pin', characters: 'Man' }
    const windFileMap = { east: 'Ton', south: 'Nan', west: 'Shaa', north: 'Pei' }
    const dragonFileMap = { red: 'Chun', green: 'Hatsu', white: 'Haku' }
    if (card.suit === 'wind') return `../pieces/sets/mahjong-regular/${windFileMap[card.rank]}.svg`
    if (card.suit === 'dragon') return `../pieces/sets/mahjong-regular/${dragonFileMap[card.rank]}.svg`
    if (suitFileMap[card.suit]) return `../pieces/sets/mahjong-regular/${suitFileMap[card.suit]}${card.rank}.svg`
    return null
  }
  if (deckType === 'standard-dice') {
    const valueNames = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' }
    const name = valueNames[card.value]
    if (name) return `../pieces/sets/playstrategy-backgammon/wdice${name}.svg`
    return `../pieces/sets/playstrategy-backgammon/wdicerandom.svg`
  }
  if (deckType === 'dominoes-28') {
    const a = String(card.low).padStart(2, '0')
    const b = String(card.high).padStart(2, '0')
    return `../pieces/sets/dominoes-classic/domino-${a}-${b}.svg`
  }
  return null
}

function getCardBackPath(deckType) {
  if (deckType === 'standard-52') return `../pieces/sets/letele-cards/B-1.svg`
  if (deckType === 'mahjong-136') return `../pieces/sets/mahjong-regular/Back.svg`
  if (deckType === 'dominoes-28') return `../pieces/sets/dominoes-classic/domino-back.svg`
  return null
}

function resolveTilesType(tiles) {
  if (!tiles) return null
  if (tiles.type) return tiles.type
  if (tiles.total === 136 || tiles.total === 144 || tiles.total === 152) return 'mahjong-136'
  return null
}

function resolveDeckType(components) {
  if (components.deck?.type) return components.deck.type
  if (components.cards?.deck) return components.cards.deck
  if (components.dice) return 'standard-dice'
  return resolveTilesType(components.tiles)
}
