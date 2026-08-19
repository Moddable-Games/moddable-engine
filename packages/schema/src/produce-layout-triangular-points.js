export function triangularPointOps(colors, render) {
  const frameW = render.frameW || 16
  const barW = render.barW || 24
  const pointW = render.pointW || 32
  const pointsPerSide = render.pointsPerSide || 6
  const panelW = pointW * pointsPerSide
  const boardW = render.boardW || (frameW * 2 + panelW * 2 + barW)
  const boardH = render.boardH || 320
  const panelH = boardH - frameW * 2
  const pointH = Math.round(panelH * 0.417)

  const els = []
  const el = (tag, attrs, text) => els.push({ op: 'element', tag, attrs, text })

  el('rect', { x: 0, y: 0, width: boardW, height: boardH, rx: 6, ry: 6, fill: colors['board-outer'] || colors.frame })
  el('rect', { x: frameW, y: frameW, width: panelW, height: panelH, fill: colors.felt })
  el('rect', { x: frameW + panelW + barW, y: frameW, width: panelW, height: panelH, fill: colors.felt })
  el('rect', { x: frameW + panelW, y: 0, width: barW, height: boardH, fill: colors['board-outer'] || colors.frame })

  const bottomBase = boardH - frameW
  const topBase = frameW

  const totalPoints = pointsPerSide * 4
  const pointX = (i) => {
    const quadrant = Math.floor(i / pointsPerSide)
    const posInQuad = i % pointsPerSide
    const isBottom = quadrant === 0 || quadrant === 1
    const isRight = quadrant === 0 || quadrant === 3
    const panelX = isRight ? frameW + panelW + barW : frameW
    return isBottom ? panelX + panelW - (posInQuad + 1) * pointW : panelX + posInQuad * pointW
  }

  for (let i = 0; i < totalPoints; i++) {
    const quadrant = Math.floor(i / pointsPerSide)
    const posInQuad = i % pointsPerSide
    const isBottom = quadrant === 0 || quadrant === 1
    const ptColor = ((posInQuad % 2 === 0) === isBottom) ? colors['point-a'] : colors['point-b']
    const lx = pointX(i)
    const x1 = lx, x2 = lx + pointW, tipX = lx + pointW / 2
    if (isBottom) {
      el('polygon', { points: `${x1},${bottomBase} ${x2},${bottomBase} ${tipX},${bottomBase - pointH}`, fill: ptColor, class: 'board-cell', 'data-sq': `point-${i + 1}`, cx: tipX, cy: bottomBase - pointH / 2 })
    } else {
      el('polygon', { points: `${x1},${topBase} ${x2},${topBase} ${tipX},${topBase + pointH}`, fill: ptColor, class: 'board-cell', 'data-sq': `point-${i + 1}`, cx: tipX, cy: topBase + pointH / 2 })
    }
  }

  const setup = render._parsedSetup
  if (setup) {
    const pieceSize = 22
    const pieceSpacing = 22
    const pieceImages = render._pieceImages || {}
    const darkImg = pieceImages.bM || pieceImages.b || null
    const lightImg = pieceImages.wM || pieceImages.w || null

    for (let i = 0; i < totalPoints; i++) {
      const dark = setup.dark ? (setup.dark[i] || 0) : 0
      const light = setup.light ? (setup.light[i] || 0) : 0
      if (!dark && !light) continue

      const quadrant = Math.floor(i / pointsPerSide)
      const isBottom = quadrant === 0 || quadrant === 1
      const cx = pointX(i) + pointW / 2

      const renderStack = (count, img, isDarkPiece, startY, dir) => {
        const maxShow = 5
        const show = Math.min(count, maxShow)
        const overflow = count > maxShow ? count - (maxShow - 1) : 0
        for (let j = 0; j < show; j++) {
          const cy = startY + dir * j * pieceSpacing
          if (img) {
            el('image', { href: img, x: cx - pieceSize / 2, y: cy - pieceSize / 2, width: pieceSize, height: pieceSize })
          } else {
            el('circle', { cx, cy, r: pieceSize / 2 - 1, fill: isDarkPiece ? '#191716' : '#F8F6F2', stroke: isDarkPiece ? '#4d433a' : '#5E5854', 'stroke-width': 1.5 })
          }
          if (j === 0 && overflow > 0) {
            el('text', { x: cx, y: cy + 4, 'font-family': 'sans-serif', 'font-size': 9, 'font-weight': 'bold', 'text-anchor': 'middle', fill: isDarkPiece ? '#fff' : '#333' }, String(overflow))
          }
        }
      }

      if (dark > 0) {
        renderStack(dark, darkImg, true, isBottom ? bottomBase - pieceSize / 2 - 2 : topBase + pieceSize / 2 + 2, isBottom ? -1 : 1)
      }
      if (light > 0) {
        renderStack(light, lightImg, false, isBottom ? bottomBase - pieceSize / 2 - 2 : topBase + pieceSize / 2 + 2, isBottom ? -1 : 1)
      }
    }
  }

  return { type: 'track', config: { style: 'points', ops: els, width: boardW, height: boardH } }
}
