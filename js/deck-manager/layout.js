export function layoutHand(cards, opts = {}) {
  const {
    style = 'fan',
    x = 0, y = 0,
    width = 400,
    maxWidth,
    cardW = 56, cardH = 80,
    faceUp = true,
    maxSpread = 0.6,
  } = opts

  if (style === 'fan') {
    return layoutFan(cards, { x, y, cardW, cardH, faceUp, maxSpread, width })
  }
  if (style === 'stack') {
    return layoutStack(cards, { x, y, cardW, cardH, faceUp })
  }
  if (style === 'spread') {
    return layoutSpread(cards, { x, y, cardW, cardH, faceUp, maxWidth })
  }
  return layoutSpread(cards, { x, y, cardW, cardH, faceUp, maxWidth })
}

function layoutFan(cards, opts) {
  const { x, y, cardW, cardH, faceUp, width } = opts
  const n = cards.length
  if (n === 0) return []

  const maxArc = Math.min(120, n * 8)
  const arcRad = (maxArc * Math.PI) / 180
  const radius = width * 0.8

  return cards.map((card, i) => {
    const t = n === 1 ? 0 : (i / (n - 1)) - 0.5
    const angle = t * arcRad
    return {
      card,
      x: x + Math.sin(angle) * radius,
      y: y - Math.cos(angle) * radius + radius,
      rot: (angle * 180) / Math.PI,
      faceUp,
      z: i,
    }
  })
}

function layoutStack(cards, opts) {
  const { x, y, cardW, cardH, faceUp } = opts
  return cards.map((card, i) => ({
    card,
    x: x + i * 0.3,
    y: y - i * 0.3,
    rot: 0,
    faceUp: i === cards.length - 1 ? faceUp : false,
    z: i,
  }))
}

function layoutSpread(cards, opts) {
  const { x, y, cardW, cardH, faceUp } = opts
  const n = cards.length
  if (n === 0) return []

  const step = cardW + 4
  const totalW = step * (n - 1) + cardW
  const startX = x - totalW / 2 + cardW / 2

  return cards.map((card, i) => ({
    card,
    x: startX + i * step,
    y,
    rot: 0,
    faceUp,
    z: i,
  }))
}

export function layoutTable(dealResult, tableSpec) {
  const {
    players,
    tableWidth = 800,
    tableHeight = 600,
    cardW = 56,
    cardH = 80,
    handStyle = 'spread',
    communityStyle = 'spread',
  } = tableSpec

  const maxHand = Math.max(...dealResult.hands.map(h => h.length))
  const handHalfW = (maxHand * (cardW + 4)) / 2
  const handHalfH = cardH / 2
  const positions = getPlayerPositions(players, tableWidth, tableHeight, handHalfW, handHalfH)
  const layout = { hands: [], community: null, drawPile: null }

  dealResult.hands.forEach((hand, i) => {
    if (hand.length === 0) return
    const pos = positions[i]
    layout.hands.push({
      player: i,
      label: pos.label,
      cards: layoutHand(hand, {
        style: handStyle,
        x: pos.x,
        y: pos.y,
        width: tableWidth * 0.25,
        cardW,
        cardH,
        faceUp: pos.faceUp !== undefined ? pos.faceUp : true,
      }),
    })
  })

  const hasDrawPile = dealResult.drawPile.length > 0
  const drawOffset = hasDrawPile ? (cardW + 8) / 2 : 0

  if (dealResult.community.length > 0) {
    layout.community = layoutHand(dealResult.community, {
      style: communityStyle,
      x: tableWidth / 2 + drawOffset,
      y: tableHeight / 2,
      width: tableWidth * 0.4,
      cardW,
      cardH,
      faceUp: true,
    })
  }

  if (hasDrawPile) {
    let drawX
    if (layout.community && layout.community.length > 0) {
      const communityLeft = Math.min(...layout.community.map(c => c.x))
      drawX = communityLeft - cardW - 8
    } else {
      drawX = tableWidth / 2
    }
    layout.drawPile = [{
      card: { id: 'draw', display: `${dealResult.drawPile.length} cards` },
      x: drawX,
      y: tableHeight / 2,
      rot: 0,
      faceUp: false,
      z: 0,
      count: dealResult.drawPile.length,
    }]
  }

  return layout
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
