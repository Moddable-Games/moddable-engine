export function triangularPointOps(colors, render) {
  const frameW = render.frameW || 16
  const barW = render.barW || 24
  const pointW = render.pointW || 32
  const pointsPerSide = render.pointsPerSide || 6
  const panelW = pointW * pointsPerSide
  const setup = render._parsedSetup
  // A position from a game in progress says who is on the bar and who has
  // borne off, and the player has to be able to click both: the bar is split
  // into a half per colour and a tray for borne-off checkers is added on the
  // right. An opening position has neither, and draws exactly as it always has.
  const live = !!(setup && (setup.bar || setup.off))
  const trayW = live ? pointW + 8 : 0
  const baseW = frameW * 2 + panelW * 2 + barW
  const boardW = render.boardW || (baseW + trayW)
  const boardH = render.boardH || 320
  const panelH = boardH - frameW * 2
  const pointH = Math.round(panelH * 0.417)

  const els = []
  const el = (tag, attrs, text) => els.push({ op: 'element', tag, attrs, text })

  el('rect', { x: 0, y: 0, width: boardW, height: boardH, rx: 6, ry: 6, fill: colors['board-outer'] || colors.frame })
  el('rect', { x: frameW, y: frameW, width: panelW, height: panelH, fill: colors.felt })
  el('rect', { x: frameW + panelW + barW, y: frameW, width: panelW, height: panelH, fill: colors.felt })
  el('rect', { x: frameW + panelW, y: 0, width: barW, height: boardH, fill: colors['board-outer'] || colors.frame })
  if (live) {
    const wood = colors['board-outer'] || colors.frame
    el('rect', { x: frameW + panelW, y: 0, width: barW, height: boardH / 2, fill: wood, class: 'board-cell', 'data-sq': 'bar-0' })
    el('rect', { x: frameW + panelW, y: boardH / 2, width: barW, height: boardH / 2, fill: wood, class: 'board-cell', 'data-sq': 'bar-1' })
    el('rect', { x: baseW, y: frameW, width: trayW - frameW / 2, height: panelH, fill: colors.felt, class: 'board-cell', 'data-sq': 'off' })
  }

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
          // In play a click on a checker is a click on its point.
          const through = live ? { 'pointer-events': 'none' } : {}
          if (img) {
            el('image', { href: img, x: cx - pieceSize / 2, y: cy - pieceSize / 2, width: pieceSize, height: pieceSize, ...through })
          } else {
            el('circle', { cx, cy, r: pieceSize / 2 - 1, fill: isDarkPiece ? '#191716' : '#F8F6F2', stroke: isDarkPiece ? '#4d433a' : '#5E5854', 'stroke-width': 1.5, ...through })
          }
          if (j === 0 && overflow > 0) {
            el('text', { x: cx, y: cy + 4, 'font-family': 'sans-serif', 'font-size': 9, 'font-weight': 'bold', 'text-anchor': 'middle', fill: isDarkPiece ? '#fff' : '#333', ...through }, String(overflow))
          }
        }
      }

      const dir = isBottom ? -1 : 1
      let baseY = isBottom ? bottomBase - pieceSize / 2 - 2 : topBase + pieceSize / 2 + 2
      // A pinned checker lies at the foot of the point, under its captor.
      const pinned = setup.pinned ? setup.pinned[i] : null
      if (pinned) {
        renderStack(1, pinned === 'dark' ? darkImg : lightImg, pinned === 'dark', baseY, dir)
        baseY += dir * pieceSpacing
      }
      if (dark > 0) renderStack(dark, darkImg, true, baseY, dir)
      if (light > 0) renderStack(light, lightImg, false, baseY, dir)
    }

    if (live) {
      const barX = frameW + panelW + barW / 2
      const onBar = setup.bar || {}
      const piece = (cx, cy, dark) => {
        const img = dark ? darkImg : lightImg
        if (img) el('image', { href: img, x: cx - pieceSize / 2, y: cy - pieceSize / 2, width: pieceSize, height: pieceSize, 'pointer-events': 'none' })
        else el('circle', { cx, cy, r: pieceSize / 2 - 1, fill: dark ? '#191716' : '#F8F6F2', stroke: dark ? '#4d433a' : '#5E5854', 'stroke-width': 1.5, 'pointer-events': 'none' })
      }
      const barStack = (count, dark, fromY, dir) => {
        const show = Math.min(count, 4)
        for (let j = 0; j < show; j++) piece(barX, fromY + dir * j * pieceSpacing, dark)
        if (count > show) el('text', { x: barX, y: fromY + 4, 'font-family': 'sans-serif', 'font-size': 9, 'font-weight': 'bold', 'text-anchor': 'middle', fill: dark ? '#fff' : '#333', 'pointer-events': 'none' }, String(count))
      }
      if (onBar.light) barStack(onBar.light, false, boardH / 2 - pieceSize, -1)
      if (onBar.dark) barStack(onBar.dark, true, boardH / 2 + pieceSize, 1)

      // Borne-off checkers edge-on in the tray: light from the top, dark from
      // the bottom, with the count beside the last.
      const off = setup.off || {}
      const slabW = trayW - frameW / 2 - 6
      const slabX = baseW + 3
      const slabs = (count, dark, fromY, dir) => {
        for (let j = 0; j < count; j++) {
          el('rect', { x: slabX, y: fromY + dir * j * 6 - (dir < 0 ? 5 : 0), width: slabW, height: 5, rx: 1, fill: dark ? '#191716' : '#F8F6F2', stroke: dark ? '#4d433a' : '#5E5854', 'stroke-width': 0.5, 'pointer-events': 'none' })
        }
        if (count) el('text', { x: slabX + slabW / 2, y: fromY + dir * (count * 6 + 10), 'font-family': 'sans-serif', 'font-size': 10, 'font-weight': 'bold', 'text-anchor': 'middle', fill: '#fff', 'pointer-events': 'none' }, String(count))
      }
      slabs(off.light || 0, false, frameW + 2, 1)
      slabs(off.dark || 0, true, boardH - frameW - 2, -1)
    }
  }

  return { type: 'track', config: { style: 'points', ops: els, width: boardW, height: boardH } }
}
