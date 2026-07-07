/**
 * Piece surface renderer — single source of truth for disc/container rendering.
 * Consumed by gallery, board-diagrams, and multi-board renderers.
 */

const DISC_RATIO = { disc: 0.92, image: 0.60 }

export function getSurfaceRatios(type = 'disc') {
  return DISC_RATIO
}

export function renderSurfaceSVG(type, cx, cy, tileSize, ownerColors, imageHref) {
  if (type !== 'disc') return `<image href="${imageHref}" x="${cx - tileSize / 2}" y="${cy - tileSize / 2}" width="${tileSize}" height="${tileSize}" pointer-events="none"/>`
  const r = DISC_RATIO
  const discR = tileSize * r.disc / 2
  const imgSize = tileSize * r.image
  const fill = ownerColors.fill || '#ccc'
  const stroke = ownerColors.stroke || '#888'
  return `<circle cx="${cx}" cy="${cy}" r="${discR}" fill="${fill}" stroke="${stroke}" stroke-width="2" pointer-events="none"/>` +
    `<image href="${imageHref}" x="${cx - imgSize / 2}" y="${cy - imgSize / 2}" width="${imgSize}" height="${imgSize}" pointer-events="none"/>`
}

export function createSurfaceDOM(type, size, ownerColors) {
  if (type !== 'disc') return null
  const r = DISC_RATIO
  const wrap = document.createElement('div')
  wrap.className = 'piece-surface-wrap'
  wrap.style.width = `${size}px`
  wrap.style.height = `${size}px`

  const disc = document.createElement('div')
  disc.className = 'piece-surface-disc'
  disc.style.backgroundColor = ownerColors.fill || '#ccc'
  disc.style.borderColor = ownerColors.stroke || '#888'
  wrap.appendChild(disc)
  return { wrap, imgScale: r.image / r.disc }
}
