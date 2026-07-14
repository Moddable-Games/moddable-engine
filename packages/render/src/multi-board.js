/**
 * Multi-board SVG compositor — renders multiple FEN positions side by side.
 *
 * Pure logic, no DOM. Moved from js/boards.js.
 */

import { renderBoard, fenToPosition } from './board-diagrams.js'

export function renderMultiBoard(config, game) {
  const { layers } = config
  const { count, layout, labels, fens, colors: layerColors } = layers
  const gap = layout === 'horizontal' ? 20 : 12
  const labelH = 18

  const ts = config.tileSize || 34
  const rows = config.rows || 8
  const cols = config.cols || 8
  const innerPad = 24
  const boardW = cols * ts + innerPad * 2
  const boardH = rows * ts + innerPad * 2
  const pad = 4

  let totalW, totalH
  if (layout === 'horizontal') {
    totalW = count * boardW + (count - 1) * gap + pad * 2
    totalH = boardH + pad * 2 + labelH
  } else {
    totalW = boardW + pad * 2
    totalH = count * (boardH + labelH) + (count - 1) * gap + pad * 2
  }

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">`)
  const bgColor = config.background || 'transparent'
  if (bgColor !== 'transparent') {
    parts.push(`<rect width="${totalW}" height="${totalH}" fill="${bgColor}" rx="6"/>`)
  }

  for (let i = 0; i < count; i++) {
    let ox, oy
    if (layout === 'horizontal') {
      ox = pad + i * (boardW + gap)
      oy = pad + labelH
    } else {
      ox = pad
      oy = pad + i * (boardH + labelH + gap)
    }

    // Layer label
    const labelX = ox + boardW / 2
    const labelY = oy - 4
    const labelColor = bgColor === 'transparent' ? '#333' : '#aaa'
    parts.push(`<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="11" fill="${labelColor}" font-family="system-ui">${labels[i] || 'Board ' + (i + 1)}</text>`)

    // Build per-layer config and render through consolidated pipeline
    const lc = layerColors && layerColors[i]
    const boardColors = lc
      ? { 'cell-light': lc['cell-light'] || lc.lightSquare || '#f0d9b5', 'cell-dark': lc['cell-dark'] || lc.darkSquare || '#b58863' }
      : config.colors || {}
    const fen = fens && fens[i]
    const position = fen ? fenToPosition(fen, rows, cols) : {}

    // Rewrite ops with per-layer colors (checkered light/dark substitution)
    let layerOps = config.ops
    if (layerOps && lc) {
      layerOps = layerOps.map(op => {
        if (op.op === 'cells' && op.pattern === 'checkered') {
          return { ...op, light: boardColors['cell-light'], dark: boardColors['cell-dark'] }
        }
        return op
      })
    }

    const layerConfig = {
      ...config,
      rows, cols, tileSize: ts,
      colors: boardColors,
      position,
      layers: undefined,
      ops: layerOps,
    }

    // Use consolidated grid renderer per layer
    const layerSvg = renderBoard(layerConfig)
    // Extract inner SVG content (strip outer <svg> and </svg> tags)
    const innerStart = layerSvg.indexOf('>') + 1
    const innerEnd = layerSvg.lastIndexOf('</svg>')
    const innerContent = layerSvg.slice(innerStart, innerEnd)

    parts.push(`<g transform="translate(${ox},${oy})" data-layer="${i}">`)
    parts.push(innerContent)
    parts.push('</g>')
  }

  parts.push('</svg>')
  return parts.join('\n')
}

async function render() {
  if (!state.game || !state.variant) return
  const basePath = '../../moddable-rules/games/'
  const familyPath = state.game + '/content/rulebook.md'
  const variantPath = state.game + '/content/variants/' + state.variant + '.md'

  try {
    const { resolved, errors } = await loadVariant({ familyPath, variantPath, basePath })
    if (errors && errors.length > 0) {
      showSvg('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><text x="200" y="40" text-anchor="middle" font-size="12" fill="#f44">' + errors.join('; ') + '</text></svg>')
      return
    }
    const target = document.getElementById('board-svg')
    if (resolved.players && resolved.players.length > 2 && resolved.pieces?.set) {
      const recolourConfig = { pieceSet4: resolved.pieces.set }
      await loadRecolouredPieces(recolourConfig, galleryIndex)
      if (recolourConfig.pieceImages) {
        resolved._recolouredPieceImages = recolourConfig.pieceImages
      }
    }
    const opts = await renderFromResolved(resolved, target)
    target.classList.add('active')
    document.getElementById('board-empty').style.display = 'none'
    if (opts) {
      if (opts.layers && opts.layers.fens) {
        opts.layerPositions = opts.layers.fens.map(fen =>
          fenToPosition(fen, opts.rows || 8, opts.cols || 8)
        )
      }
      bindBoardHover(opts)
    }
    const topo = resolved.topology || {}
    const render = resolved.render || {}
    showInfo({
      boardStyle: render.cellColor || topo.type,
      rows: topo.rows, cols: topo.cols, rings: topo.radius,
      pieceSet: resolved.pieces?.set,
      setup: resolved.setup,
      variantDesc: resolved.meta?.label,
    })
    requestAnimationFrame(fitToView)
  } catch (e) {
    showSvg('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><text x="200" y="40" text-anchor="middle" font-size="12" fill="#f44">' + e.message + '</text></svg>')
  }
}
