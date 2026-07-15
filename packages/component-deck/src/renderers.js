/**
 * Card/deck SVG renderers — produce SVG strings for card game table layouts.
 *
 * Pure logic, no DOM. Moved from js/boards.js.
 */

export function renderDeckSvg(layout, opts) {
  const { tableW, tableH, cardW, cardH, deckLabel, gameLabel, deckType, seed } = opts
  const pad = 20
  const w = tableW + pad * 2
  const h = tableH + pad * 2
  const parts = []

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`)
  parts.push(`<style>svg text{pointer-events:none;cursor:default}[data-card],[data-zone]{cursor:pointer}</style>`)
  parts.push(`<rect width="${w}" height="${h}" fill="#1b5e3a" rx="16"/>`)
  parts.push(`<rect x="${pad}" y="${pad}" width="${tableW}" height="${tableH}" fill="#2d7a4f" rx="12" stroke="#1a4a2e" stroke-width="2"/>`)

  for (const hand of layout.hands) {
    const zoneDesc = hand.cards[0]?.faceUp ? `${hand.label} — ${hand.cards.length} cards (visible)` : `${hand.label} — ${hand.cards.length} cards (hidden)`
    parts.push(`<g class="hand" data-zone="${zoneDesc}">`)
    for (const pos of hand.cards) {
      parts.push(renderCard(pos, cardW, cardH, pad, deckType))
    }
    const midIdx = Math.floor(hand.cards.length / 2)
    const labelX = hand.cards.length > 0 ? (hand.cards[0].x + hand.cards[hand.cards.length - 1].x) / 2 + pad : tableW / 2 + pad
    const labelY = hand.cards.length > 0 ? hand.cards[0].y + pad : tableH / 2 + pad
    const isBottom = labelY > tableH / 2 + pad
    const labelOffset = isBottom ? cardH / 2 + 14 : -cardH / 2 - 6
    parts.push(`<text x="${labelX}" y="${labelY + labelOffset}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,0.6)" font-family="system-ui">${hand.label} (${hand.cards.length})</text>`)
    parts.push('</g>')
  }

  if (layout.community && layout.community.length > 0) {
    parts.push(`<g class="community" data-zone="Community / Field — ${layout.community.length} cards (face up)">`)
    for (const pos of layout.community) {
      parts.push(renderCard(pos, cardW, cardH, pad, deckType))
    }
    const cy = layout.community[0].y + pad + cardH / 2 + 14
    parts.push(`<text x="${tableW / 2 + pad}" y="${cy}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.5)" font-family="system-ui">Field (${layout.community.length})</text>`)
    parts.push('</g>')
  }

  if (layout.drawPile && layout.drawPile.length > 0) {
    const dp = layout.drawPile[0]
    const dx = dp.x + pad
    const dy = dp.y + pad
    const count = dp.count || layout.drawPile.length
    const backPath = getCardBackPath(deckType)
    parts.push(`<g data-zone="Draw pile — ${count} cards remaining (face down)">`)
    const stackDepth = Math.min(4, count)
    for (let s = stackDepth - 1; s >= 0; s--) {
      const sx = dx - s * 1.5
      const sy = dy - s * 1.5
      if (backPath) {
        parts.push(`<image href="${backPath}" x="${sx - cardW / 2}" y="${sy - cardH / 2}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/>`)
      } else {
        parts.push(`<rect x="${sx - cardW / 2}" y="${sy - cardH / 2}" width="${cardW}" height="${cardH}" fill="#2a3a6a" rx="3" stroke="#1a2a4a" stroke-width="1"/>`)
      }
    }
    parts.push(`<text x="${dx}" y="${dy + 3}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,0.85)" font-family="system-ui" font-weight="bold">${count}</text>`)
    parts.push('</g>')
  }

  parts.push(`<text x="${w / 2}" y="${h - 6}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.3)" font-family="system-ui">${deckLabel} · ${gameLabel} · seed: ${seed !== undefined ? seed : ''}</text>`)
  parts.push('</svg>')
  return parts.join('\n')
}

function getCardImagePath(card, deckType, opts) {
  if (deckType === 'standard-52') {
    if (card.suit === 'joker') return `../pieces/sets/letele-cards/J-1.svg`
    const suitLetter = { spades: 'S', hearts: 'H', clubs: 'C', diamonds: 'D' }[card.suit]
    const rank = card.rank === '10' ? '10' : card.rank
    return `../pieces/sets/letele-cards/${suitLetter}-${rank}.svg`
  }
  if (deckType === 'hanafuda-48') {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const month = monthNames[card.monthIndex]
    const type = card.type.charAt(0).toUpperCase() + card.type.slice(1)
    const name = card.name
    if (name.match(/Plain \d/)) {
      return `../pieces/sets/hanafuda-traditional/Hanafuda_${month}_${type}_${name.slice(-1)}_Alt.svg`
    }
    return `../pieces/sets/hanafuda-traditional/Hanafuda_${month}_${type}_Alt.svg`
  }
  if (deckType === 'bavarian-32') {
    const suitMap = { acorns: 'eichel', leaves: 'blatt', hearts: 'hart', bells: 'schellen' }
    const suit = suitMap[card.suit]
    const faceMap = {
      eichel: { 'U': '11_unter', 'O': '12_ober', 'K': '13_konig', 'A': '01_daus' },
      hart:   { 'U': '11_unter', 'O': '12_ober', 'K': '13_konig', 'A': '01_daus' },
      blatt:  { 'U': '11_jack', 'O': '12_queen', 'K': '13_king', 'A': '01_daus' },
      schellen: { 'U': '11_jack', 'O': '12_queen', 'K': '13_king', 'A': '01' },
    }
    const numericMap = { '7': '07', '8': '08', '9': '09', '10': '10' }
    const rank = faceMap[suit]?.[card.rank] || numericMap[card.rank] || card.rank
    return `../pieces/sets/mfrasca-skat/Playing_card-german-${suit}-${rank}.svg`
  }
  if (deckType === 'mahjong-136') {
    if (opts?.tileSet === 'mahjong-planar') {
      const suitFileMap = { bamboo: 'tiao', circles: 'bing', characters: 'wan' }
      const windFileMap = { east: 'Eastwind', south: 'Southwind', west: 'Westwind', north: 'Northwind' }
      const dragonFileMap = { red: 'Reddragon', green: 'Greendragon', white: 'Whitedragon' }
      const flowerFileMap = { 1: 'mei', 2: 'lan', 3: 'ju', 4: 'zhu' }
      const seasonFileMap = { 1: 'spring', 2: 'summer', 3: 'autumn', 4: 'winter' }
      if (card.suit === 'wind') return `../pieces/sets/mahjong-planar/MJ${windFileMap[card.rank]}.svg`
      if (card.suit === 'dragon') return `../pieces/sets/mahjong-planar/MJ${dragonFileMap[card.rank]}.svg`
      if (card.suit === 'flower') return `../pieces/sets/mahjong-planar/MJ${flowerFileMap[card.rank]}.svg`
      if (card.suit === 'season') return `../pieces/sets/mahjong-planar/MJ${seasonFileMap[card.rank]}.svg`
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

function renderCard(pos, cardW, cardH, pad, deckType) {
  const x = pos.x + pad - cardW / 2
  const y = pos.y + pad - cardH / 2
  const rot = pos.rot ? ` transform="rotate(${pos.rot.toFixed(1)} ${pos.x + pad} ${pos.y + pad})"` : ''
  const cardLabel = pos.card?.display || pos.card?.id || '?'

  const tileBgDecks = new Set(['mahjong-136', 'dominoes-28'])
  const needsTileBg = tileBgDecks.has(deckType)

  if (!pos.faceUp) {
    const backPath = getCardBackPath(deckType)
    if (backPath && needsTileBg) {
      const inset = 3
      return `<g${rot} data-card="Face down"><rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="#f0ede6" rx="4" stroke="#bbb" stroke-width="0.8"/><image href="${backPath}" x="${x + inset}" y="${y + inset}" width="${cardW - inset * 2}" height="${cardH - inset * 2}" preserveAspectRatio="xMidYMid meet"/></g>`
    }
    if (backPath) {
      return `<g${rot} data-card="Face down"><image href="${backPath}" x="${x}" y="${y}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/></g>`
    }
    return `<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="#2a3a6a" rx="3" stroke="#1a2a4a" stroke-width="1"${rot} data-card="Face down"/>`
  }

  const card = pos.card
  const imgPath = getCardImagePath(card, deckType)

  if (imgPath) {
    if (needsTileBg) {
      const inset = 3
      return `<g${rot} data-card="${cardLabel}"><rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="#f0ede6" rx="4" stroke="#bbb" stroke-width="0.8"/><image href="${imgPath}" x="${x + inset}" y="${y + inset}" width="${cardW - inset * 2}" height="${cardH - inset * 2}" preserveAspectRatio="xMidYMid meet"/></g>`
    }
    return `<g${rot} data-card="${cardLabel}"><image href="${imgPath}" x="${x}" y="${y}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/></g>`
  }

  const parts = []
  parts.push(`<g${rot} data-card="${cardLabel}">`)
  parts.push(`<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="#fff" rx="3" stroke="#ccc" stroke-width="0.5"/>`)
  const fs = Math.min(cardW * 0.3, 10)
  parts.push(`<text x="${x + cardW / 2}" y="${y + cardH / 2 + fs * 0.35}" text-anchor="middle" font-size="${fs}" fill="#333" font-family="system-ui">${card.display || '?'}</text>`)
  parts.push('</g>')
  return parts.join('')
}

export function renderMahjongSvg(dealResult, opts) {
  const { deckType, deckConfig, variantDef, seed, tileSet } = opts
  const tileW = 30
  const tileH = 40
  const tileGap = 2
  const stackOffset = 3
  const pad = 20
  const outerPad = 20

  const wallTiles = dealResult.drawPile.length
  const totalStacks = Math.ceil(wallTiles / 2)
  const stacksPerSide = Math.ceil(totalStacks / 4)
  const step = tileW + tileGap
  const wallLen = stacksPerSide * step
  const wallSquare = wallLen + 2 * tileH

  const handSize = Math.max(...dealResult.hands.map(h => h.length))
  const handLen = handSize * step
  const totalSize = Math.max(wallSquare + 140, handLen + 2 * (pad + tileH) + 40)

  const w = totalSize + outerPad * 2
  const h = w

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`)
  parts.push(`<style>svg text{pointer-events:none;cursor:default}[data-card],[data-zone]{cursor:pointer}</style>`)
  parts.push(`<rect width="${w}" height="${h}" fill="#1b5e3a" rx="16"/>`)
  parts.push(`<rect x="${outerPad}" y="${outerPad}" width="${totalSize}" height="${totalSize}" fill="#2d7a4f" rx="12" stroke="#1a4a2e" stroke-width="2"/>`)
  parts.push(`<g transform="translate(${outerPad},${outerPad})">`)

  const cx = totalSize / 2
  const cy = totalSize / 2
  const halfSquare = wallSquare / 2

  const breakPoint = (seed % totalStacks)
  const windNames = ['South', 'East', 'North', 'West']

  let stackCount = 0
  for (let side = 0; side < 4; side++) {
    const sideStacks = Math.min(stacksPerSide, totalStacks - stackCount)
    const tilesOnSide = Math.min(sideStacks * 2, wallTiles - stackCount * 2)
    const isLiveEnd = breakPoint >= stackCount && breakPoint < stackCount + sideStacks
    const startIdx = stackCount
    const zoneLabel = `Wall — ${windNames[side]} side · ${tilesOnSide} tiles (${sideStacks} stacks of 2)${isLiveEnd ? ' · draw from here' : ''}`
    parts.push(`<g data-zone="${zoneLabel}">`)

    for (let i = 0; i < sideStacks; i++) {
      const globalIdx = startIdx + i
      const remaining = wallTiles - globalIdx * 2
      const height = Math.min(2, remaining)
      let tx, ty, rw, rh

      // Four equal-length walls, each centred on its side, small corner gaps
      const half = wallLen / 2
      const inset = half + tileH
      if (side === 0) {
        tx = cx - half + i * step
        ty = cy + inset - tileH
        rw = tileW; rh = tileH
      } else if (side === 1) {
        tx = cx + inset - tileH
        ty = cy + half - (i + 1) * step
        rw = tileH; rh = tileW
      } else if (side === 2) {
        tx = cx + half - (i + 1) * step
        ty = cy - inset
        rw = tileW; rh = tileH
      } else {
        tx = cx - inset
        ty = cy - half + i * step
        rw = tileH; rh = tileW
      }

      const soX = side === 1 ? -stackOffset : side === 3 ? stackOffset : 0
      const soY = side === 0 ? -stackOffset : side === 2 ? stackOffset : 0
      parts.push(`<g data-card="Stack ${globalIdx + 1} · ${height} tile${height > 1 ? 's' : ''} high${globalIdx === breakPoint ? ' · BREAK' : ''}">`)
      if (height === 2) {
        parts.push(`<rect x="${tx + soX}" y="${ty + soY}" width="${rw}" height="${rh}" fill="#d4c9a8" rx="3" stroke="#a89060" stroke-width="0.5"/>`)
      }
      parts.push(`<rect x="${tx}" y="${ty}" width="${rw}" height="${rh}" fill="#f0ede6" rx="3" stroke="#bbb" stroke-width="0.6"/>`)
      if (globalIdx === breakPoint) {
        parts.push(`<rect x="${tx}" y="${ty}" width="${rw}" height="${rh}" fill="none" rx="3" stroke="#ffcc00" stroke-width="1.5"/>`)
      }
      parts.push('</g>')
    }
    parts.push('</g>')
    stackCount += sideStacks
  }

  const playerLabels = ['South (you)', 'East', 'North', 'West']
  for (let p = 0; p < 4; p++) {
    const hand = dealResult.hands[p]
    const faceUp = p === 0
    const label = playerLabels[p]
    const zoneDesc = faceUp ? `${label} — ${hand.length} tiles (visible)` : `${label} — ${hand.length} tiles (hidden)`
    parts.push(`<g data-zone="${zoneDesc}">`)

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i]
      const cardLabel = faceUp ? (card.display || card.id) : 'Face down'
      let tx, ty

      if (p === 0) {
        tx = cx - (hand.length * (tileW + tileGap)) / 2 + i * (tileW + tileGap)
        ty = totalSize - pad - tileH
      } else if (p === 1) {
        tx = totalSize - pad - tileH
        ty = cy + (hand.length * (tileW + tileGap)) / 2 - (i + 1) * (tileW + tileGap)
      } else if (p === 2) {
        tx = cx + (hand.length * (tileW + tileGap)) / 2 - (i + 1) * (tileW + tileGap)
        ty = pad
      } else {
        tx = pad
        ty = cy - (hand.length * (tileW + tileGap)) / 2 + i * (tileW + tileGap)
      }

      const isVertical = p === 1 || p === 3
      const rw = isVertical ? tileH : tileW
      const rh = isVertical ? tileW : tileH

      if (faceUp) {
        const imgPath = getCardImagePath(card, deckType, { tileSet })
        const inset = 2
        parts.push(`<g data-card="${cardLabel}"><rect x="${tx}" y="${ty}" width="${rw}" height="${rh}" fill="#f0ede6" rx="4" stroke="#bbb" stroke-width="0.8"/><image href="${imgPath}" x="${tx + inset}" y="${ty + inset}" width="${rw - inset * 2}" height="${rh - inset * 2}" preserveAspectRatio="xMidYMid meet"/></g>`)
      } else {
        parts.push(`<g data-card="${cardLabel}"><rect x="${tx}" y="${ty}" width="${rw}" height="${rh}" fill="#f0ede6" rx="4" stroke="#bbb" stroke-width="0.8"/><rect x="${tx + 2}" y="${ty + 2}" width="${rw - 4}" height="${rh - 4}" fill="#c8a96e" rx="2" opacity="0.4"/></g>`)
      }
    }

    const labelPositions = [
      { x: cx, y: totalSize - 4, anchor: 'middle' },
      { x: totalSize - 4, y: cy, anchor: 'middle', rotate: true },
      { x: cx, y: 12, anchor: 'middle' },
      { x: 12, y: cy, anchor: 'middle', rotate: true },
    ]
    const lp = labelPositions[p]
    const rotAttr = lp.rotate ? ` transform="rotate(-90 ${lp.x} ${lp.y})"` : ''
    parts.push(`<text x="${lp.x}" y="${lp.y}" text-anchor="${lp.anchor}" font-size="10" fill="rgba(255,255,255,0.5)" font-family="system-ui"${rotAttr}>${label} (${hand.length})</text>`)
    parts.push('</g>')
  }

  parts.push('</g>')
  parts.push(`<text x="${w / 2}" y="${h - 6}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.3)" font-family="system-ui">${deckConfig.label} · ${variantDef.label} · seed: ${seed}</text>`)
  parts.push('</svg>')

  return parts.join('\n')
}

export function renderTableauSvg(dealResult, opts) {
  const { deckType, deckConfig, variantDef, seed } = opts
  const cardW = 44
  const cardH = 64
  const colGap = 6
  const cascadeStep = 18
  const pad = 20

  const numCols = dealResult.tableau.length
  const maxCascade = Math.max(...dealResult.tableau.map(col => col.length))
  const tableauW = numCols * (cardW + colGap) - colGap
  const tableauH = cardH + (maxCascade - 1) * cascadeStep

  const foundationY = pad
  const tableauY = foundationY + cardH + 20
  const totalW = tableauW + pad * 2
  const totalH = tableauY + tableauH + pad + 20
  const tableauX = pad

  const outerPad = 20
  const w = totalW + outerPad * 2
  const h = totalH + outerPad * 2

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`)
  parts.push(`<style>svg text{pointer-events:none;cursor:default}[data-card],[data-zone]{cursor:pointer}</style>`)
  parts.push(`<rect width="${w}" height="${h}" fill="#1b5e3a" rx="16"/>`)
  parts.push(`<rect x="${outerPad}" y="${outerPad}" width="${totalW}" height="${totalH}" fill="#2d7a4f" rx="12" stroke="#1a4a2e" stroke-width="2"/>`)
  parts.push(`<g transform="translate(${outerPad},${outerPad})">`)

  const suitNames = ['Spades', 'Hearts', 'Clubs', 'Diamonds']
  const suitSymbols = ['♠', '♥', '♣', '♦']
  const foundationX = totalW - 4 * (cardW + colGap) - pad + colGap
  for (let f = 0; f < 4; f++) {
    const fx = foundationX + f * (cardW + colGap)
    parts.push(`<g data-zone="Foundation — ${suitNames[f]} (build A→K)">`)
    parts.push(`<rect x="${fx}" y="${foundationY}" width="${cardW}" height="${cardH}" fill="rgba(0,0,0,0.01)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" rx="3" stroke-dasharray="4 2"/>`)
    parts.push(`<text x="${fx + cardW / 2}" y="${foundationY + cardH / 2 + 5}" text-anchor="middle" font-size="14" fill="rgba(255,255,255,0.2)">${suitSymbols[f]}</text>`)
    parts.push('</g>')
  }

  const drawCount = dealResult.drawPile.length
  const drawX = pad
  const backPath = getCardBackPath(deckType)
  parts.push(`<g data-zone="Stock — ${drawCount} cards (face down)">`)
  if (backPath) {
    parts.push(`<image href="${backPath}" x="${drawX}" y="${foundationY}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/>`)
  } else {
    parts.push(`<rect x="${drawX}" y="${foundationY}" width="${cardW}" height="${cardH}" fill="#2a3a6a" rx="3" stroke="#1a2a4a" stroke-width="1"/>`)
  }
  parts.push(`<text x="${drawX + cardW / 2}" y="${foundationY + cardH / 2 + 4}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,0.85)" font-weight="bold">${drawCount}</text>`)
  parts.push('</g>')

  const wasteX = drawX + cardW + colGap
  parts.push(`<g data-zone="Waste — draw cards here (empty at start)">`)
  parts.push(`<rect x="${wasteX}" y="${foundationY}" width="${cardW}" height="${cardH}" fill="rgba(0,0,0,0.01)" stroke="rgba(255,255,255,0.2)" stroke-width="1" rx="3" stroke-dasharray="3 2"/>`)
  parts.push(`<text x="${wasteX + cardW / 2}" y="${foundationY + cardH / 2 + 4}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.2)">waste</text>`)
  parts.push('</g>')

  for (let col = 0; col < numCols; col++) {
    const colCards = dealResult.tableau[col]
    const cx = tableauX + col * (cardW + colGap)
    parts.push(`<g data-zone="Column ${col + 1} — ${colCards.length} cards">`)
    for (let row = 0; row < colCards.length; row++) {
      const card = colCards[row]
      const cy = tableauY + row * cascadeStep
      const cardLabel = card.faceUp ? (card.display || card.id) : 'Face down'
      if (card.faceUp) {
        const imgPath = getCardImagePath(card, deckType)
        if (imgPath) {
          parts.push(`<g data-card="${cardLabel}"><image href="${imgPath}" x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/></g>`)
        } else {
          parts.push(`<g data-card="${cardLabel}"><rect x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" fill="#fff" rx="3" stroke="#ccc" stroke-width="0.5"/><text x="${cx + cardW / 2}" y="${cy + cardH / 2 + 4}" text-anchor="middle" font-size="10" fill="#333" font-family="system-ui">${card.display || '?'}</text></g>`)
        }
      } else {
        if (backPath) {
          parts.push(`<g data-card="${cardLabel}"><image href="${backPath}" x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/></g>`)
        } else {
          parts.push(`<rect x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" fill="#2a3a6a" rx="3" stroke="#1a2a4a" stroke-width="1" data-card="${cardLabel}"/>`)
        }
      }
    }
    parts.push('</g>')
  }

  parts.push('</g>')
  parts.push(`<text x="${w / 2}" y="${h - 6}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.3)" font-family="system-ui">${deckConfig.label} · ${variantDef.label} · seed: ${seed}</text>`)
  parts.push('</svg>')

  return parts.join('\n')
}

