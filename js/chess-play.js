import { renderFromEngine, attachPieceImages } from '../packages/render/src/render-engine.js'
import { algebraicId, algebraicToIndex } from '../packages/topologies/grid/index.js'
import MCE, { createGameController, aiPickMove } from '../packages/plugins/chess/src/mce/index.js'

let ctrl = null
let currentVariant = 'standard'
let currentPieceSet = localStorage.getItem('mce-piece-set') || 'mce-fairy-complete'
let galleryIndex = null
let boardSvgContainer = null
let embedMode = false
let fullscreenMode = false
let animating = false

const ANIM_SPEEDS = { instant: 0, fast: 120, normal: 220, slow: 400 }
const ANIM_STYLES = { slide: 'Slide', arc: 'Arc', bounce: 'Bounce', warp: 'Warp' }
let animSpeed = localStorage.getItem('mce-anim-speed') || 'normal'
let animStyle = localStorage.getItem('mce-anim-style') || 'slide'

export async function initChessPlay(container) {
  const params = new URLSearchParams(location.search)
  currentVariant = params.get('variant') || 'standard'
  const savedColor = params.get('color') || 'white'
  const savedOpponent = params.get('opponent') || 'human'
  const savedFlipped = params.get('flipped') === '1'
  embedMode = params.get('embed') === '1'
  fullscreenMode = params.get('fullscreen') === '1'
  if (params.get('pieces')) currentPieceSet = params.get('pieces')

  if (embedMode) {
    document.body.classList.add('chess-embed-mode')
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
  }
  if (fullscreenMode) document.body.classList.add('chess-fullscreen-mode')
  initEmbedMessageListener()

  galleryIndex = await fetch('../pieces/gallery-index.json').then(r => r.json()).catch(() => null)

  container.innerHTML = buildUI()
  boardSvgContainer = container.querySelector('#chess-board-svg')

  const colorSelect = container.querySelector('#chess-color-select')
  const opponentSelect = container.querySelector('#chess-opponent-select')
  if (colorSelect) colorSelect.value = savedColor
  if (opponentSelect) opponentSelect.value = savedOpponent

  populateVariantPicker(container)
  if (!embedMode) populatePieceSetPicker(container)
  const animStyleSelect = container.querySelector('#chess-anim-style-select')
  if (animStyleSelect) animStyleSelect.value = animStyle
  const animSpeedSelect = container.querySelector('#chess-anim-speed-select')
  if (animSpeedSelect) animSpeedSelect.value = animSpeed
  startGame()
  if (savedFlipped && ctrl) ctrl.setFlipped(true)
  bindEvents(container)
}

function startGame() {
  if (ctrl) ctrl.destroy()

  const game = MCE.createGame(currentVariant)
  const vc = MCE.getVariantConfig(currentVariant)
  const rows = game.rows
  const cols = game.cols

  const colorSelect = document.getElementById('chess-color-select')
  const opponentSelect = document.getElementById('chess-opponent-select')
  const difficultySelect = document.getElementById('chess-difficulty-select')
  const difficultyGroup = document.getElementById('chess-difficulty-group')
  const humanColor = colorSelect?.value || 'white'
  const opponent = opponentSelect?.value || 'human'
  const difficulty = difficultySelect?.value || 'medium'

  if (difficultyGroup) difficultyGroup.style.display = opponent === 'ai' ? '' : 'none'

  const players = {}
  if (opponent === 'ai') {
    players[MCE.WHITE] = humanColor === 'white' ? 'human' : 'ai'
    players[MCE.BLACK] = humanColor === 'black' ? 'human' : 'ai'
  } else {
    players[MCE.WHITE] = 'human'
    players[MCE.BLACK] = 'human'
  }

  const moveLog = []

  ctrl = createGameController(null, game, {
    players,
    aiDifficulty: difficulty,
    renderOpts: {
      animate: ANIM_SPEEDS[animSpeed] > 0,
      animDuration: ANIM_SPEEDS[animSpeed],
    },
    customRender: (g, state) => {
      renderBoard(g, state, rows, cols)
    },
    onMove: (move, undo, captured, side) => {
      moveLog.push({ move, side })
      updateMoveList(moveLog, cols, rows)
      postEmbedMessage('move', { from: move.from, to: move.to, fen: MCE.toFEN(game), variant: currentVariant })
    },
    onGameEnd: (status) => {
      updateStatus(status)
      postEmbedMessage('status', { text: status, gameOver: true, variant: currentVariant })
    },
    onTurnChange: (turn) => {
      const statusEl = document.getElementById('chess-status')
      if (statusEl) {
        const color = turn === MCE.WHITE ? 'White' : 'Black'
        statusEl.textContent = `${color} to move`
        statusEl.classList.remove('chess-status--over')
      }
    },
    onPromotionNeeded: (candidates, turn, resolve) => {
      const choices = [...new Set(candidates.map(m => m.promo))]
      showPromotionDialog(choices, resolve)
    },
    onCaptureEffect: (sq) => {
      const game = ctrl?.getGame()
      if (!game) return
      const flp = ctrl?.getState()?.flipped || false
      const pos = getCellCenter(sq, flp, game.rows, game.cols)
      if (pos) captureBurst(pos.x, pos.y, pos.w)
    },
    onAnimateMove: (move, g, done) => {
      const duration = ANIM_SPEEDS[animSpeed] || 0
      if (duration === 0) { done(); return }
      const flp = ctrl?.getState()?.flipped || false
      const fromPos = getCellCenter(move.from, flp, rows, cols)
      const toPos = getCellCenter(move.to, flp, rows, cols)
      if (!fromPos || !toPos) { done(); return }
      animating = true
      animatePiece(move.from, fromPos, toPos, duration, flp, rows, cols, () => {
        animating = false
        done()
      })
    },
  })

  const statusEl = document.getElementById('chess-status')
  if (statusEl) statusEl.textContent = 'White to move'
  const movesEl = document.getElementById('chess-moves')
  if (movesEl) movesEl.innerHTML = ''
  postEmbedMessage('ready', { variant: currentVariant, fen: MCE.toFEN(game) })
  updateURL()
}

function renderBoard(game, state, rows, cols) {
  if (!boardSvgContainer) return
  if (animating) return

  const { selected, lastMove, flipped, getLegalMoves } = state
  const legal = (selected !== null && getLegalMoves) ? getLegalMoves().filter(m => m.from === selected) : []
  const board = game.board

  const fen = boardToFEN(board, rows, cols, flipped)
  const resolved = buildResolved(fen, rows, cols)
  const pieceResult = galleryIndex ? attachPieceImages(resolved, galleryIndex) : { images: {}, surfaceMap: {}, surface: null }
  const svg = renderFromEngine(resolved, {
    pieceImages: pieceResult.images || {},
    pieceSurfaceMap: pieceResult.surfaceMap || {},
    pieceSurface: pieceResult.surface || null,
  })

  if (!svg) return
  boardSvgContainer.innerHTML = svg

  const svgEl = boardSvgContainer.querySelector('svg')
  if (svgEl) {
    svgEl.style.width = '100%'
    svgEl.style.height = 'auto'
    svgEl.style.maxHeight = embedMode ? 'none' : 'calc(100vh - 180px)'
    svgEl.style.display = 'block'
  }

  if (svgEl) {
    const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    overlay.setAttribute('class', 'play-overlay')
    overlay.setAttribute('pointer-events', 'none')
    const piecesLayer = svgEl.querySelector('g[pointer-events="none"]')
    const insertBefore = piecesLayer || svgEl.lastChild

    if (lastMove) {
      addHighlight(overlay, lastMove.from, rows, cols, 'rgba(205, 210, 106, 0.45)', flipped)
      addHighlight(overlay, lastMove.to, rows, cols, 'rgba(205, 210, 106, 0.45)', flipped)
    }

    if (selected !== null) {
      addHighlight(overlay, selected, rows, cols, 'rgba(127, 179, 62, 0.55)', flipped)
    }

    const seenTargets = new Set()
    for (const m of (legal || [])) {
      if (seenTargets.has(m.to)) continue
      seenTargets.add(m.to)
      const hasPiece = board[m.to] !== null
      let visualIdx = m.to
      if (flipped) {
        const r = Math.floor(m.to / cols)
        const c = m.to % cols
        visualIdx = (rows - 1 - r) * cols + (cols - 1 - c)
      }
      const alg = sqToAlgebraic(visualIdx, rows, cols)
      const cell = boardSvgContainer.querySelector(`[data-sq="${alg}"]`)
      if (!cell) continue
      const bbox = cell.getBBox ? cell.getBBox() : null
      if (!bbox) continue
      if (hasPiece) {
        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        ring.setAttribute('x', bbox.x)
        ring.setAttribute('y', bbox.y)
        ring.setAttribute('width', bbox.width)
        ring.setAttribute('height', bbox.height)
        ring.setAttribute('fill', 'rgba(224, 64, 64, 0.35)')
        overlay.appendChild(ring)
      } else {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        dot.setAttribute('cx', bbox.x + bbox.width / 2)
        dot.setAttribute('cy', bbox.y + bbox.height / 2)
        dot.setAttribute('r', bbox.width * 0.16)
        dot.setAttribute('fill', 'rgba(0, 0, 0, 0.22)')
        overlay.appendChild(dot)
      }
    }

    // Effect overlays (poison, immune, petrify)
    if (game.effects && game.effects.length > 0) {
      for (const effect of game.effects) {
        if (effect.sq === undefined) continue
        let vIdx = effect.sq
        if (flipped) {
          const er = Math.floor(effect.sq / cols)
          const ec = effect.sq % cols
          vIdx = (rows - 1 - er) * cols + (cols - 1 - ec)
        }
        const ealg = sqToAlgebraic(vIdx, rows, cols)
        const ecell = boardSvgContainer.querySelector(`[data-sq="${ealg}"]`)
        if (!ecell || !ecell.getBBox) continue
        const ebb = ecell.getBBox()
        const effectEl = renderEffectOverlay(effect, ebb.x, ebb.y, ebb.width)
        if (effectEl) overlay.appendChild(effectEl)
      }
    }

    svgEl.insertBefore(overlay, insertBefore)
  }

  boardSvgContainer.onclick = (e) => {
    let el = e.target
    while (el && el !== boardSvgContainer) {
      if (el.getAttribute && el.getAttribute('data-sq')) {
        const alg = el.getAttribute('data-sq')
        let idx = algebraicToSq(alg, rows, cols)
        if (flipped) {
          const r = Math.floor(idx / cols)
          const c = idx % cols
          idx = (rows - 1 - r) * cols + (cols - 1 - c)
        }
        ctrl.handleClick(idx)
        return
      }
      el = el.parentNode
    }
  }
}

function buildUI() {
  if (embedMode) {
    return `
<div class="chess-play chess-play--embed">
  <div class="chess-board-area">
    <div id="chess-board-svg" class="chess-board-svg"></div>
    <div id="chess-promotion-dialog" class="chess-promotion" style="display:none"></div>
  </div>
</div>`
  }
  return `
<div class="chess-play${fullscreenMode ? ' chess-play--fullscreen' : ''}">
  <div class="chess-sidebar">
    <div class="control-group">
      <label class="control-label">Variant</label>
      <select id="chess-variant-select"></select>
    </div>
    <div class="control-group">
      <label class="control-label">Play as</label>
      <select id="chess-color-select">
        <option value="white">White</option>
        <option value="black">Black</option>
      </select>
    </div>
    <div class="control-group">
      <label class="control-label">Opponent</label>
      <select id="chess-opponent-select">
        <option value="human">Human</option>
        <option value="ai">AI</option>
      </select>
    </div>
    <div class="control-group" id="chess-difficulty-group" style="display:none">
      <label class="control-label">Difficulty</label>
      <select id="chess-difficulty-select">
        <option value="beginner">Beginner</option>
        <option value="easy">Easy</option>
        <option value="medium" selected>Medium</option>
        <option value="hard">Hard</option>
        <option value="expert">Expert</option>
      </select>
    </div>
    <div class="control-group">
      <label class="control-label">Pieces</label>
      <select id="chess-pieceset-select"></select>
    </div>
    <div class="control-group">
      <label class="control-label">Animation</label>
      <select id="chess-anim-style-select">
        <option value="slide">Slide</option>
        <option value="arc">Arc</option>
        <option value="bounce">Bounce</option>
        <option value="warp">Warp</option>
      </select>
    </div>
    <div class="control-group">
      <label class="control-label">Speed</label>
      <select id="chess-anim-speed-select">
        <option value="instant">Instant</option>
        <option value="fast">Fast</option>
        <option value="normal" selected>Normal</option>
        <option value="slow">Slow</option>
      </select>
    </div>
    <div class="chess-controls">
      <button id="chess-new-btn" class="btn btn-primary">New Game</button>
      <button id="chess-undo-btn" class="btn btn-outline">Undo</button>
      <button id="chess-flip-btn" class="btn btn-outline">Flip</button>
      <button id="chess-fullscreen-btn" class="btn btn-outline">Fullscreen</button>
    </div>
    <div id="chess-status" class="chess-status"></div>
    <div id="chess-moves" class="chess-moves"></div>
  </div>
  <div class="chess-board-area">
    <div id="chess-board-svg" class="chess-board-svg"></div>
    <div id="chess-promotion-dialog" class="chess-promotion" style="display:none"></div>
  </div>
</div>`
}

function populateVariantPicker(container) {
  const select = container.querySelector('#chess-variant-select')
  if (!select) return
  const registry = MCE.variantRegistry
  const groups = new Map()

  for (const [key, vc] of Object.entries(registry)) {
    if (key === 'piece-test') continue
    const group = vc.group || 'Other'
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push({ key, label: vc.label || vc.name || key.replace(/([A-Z])/g, ' $1').trim() })
  }

  const GROUP_ORDER = ['Classic', 'Tactical', 'Alternate Rules', 'Small Boards', 'Large Boards', 'Asymmetric', 'Historical', 'Dev', 'Other']
  for (const groupName of GROUP_ORDER) {
    const variants = groups.get(groupName)
    if (!variants) continue
    const optgroup = document.createElement('optgroup')
    optgroup.label = groupName
    for (const v of variants.sort((a, b) => a.label.localeCompare(b.label))) {
      const opt = document.createElement('option')
      opt.value = v.key
      opt.textContent = v.label
      if (v.key === currentVariant) opt.selected = true
      optgroup.appendChild(opt)
    }
    select.appendChild(optgroup)
  }
}

function populatePieceSetPicker(container) {
  const select = container.querySelector('#chess-pieceset-select')
  if (!select || !galleryIndex) return
  const sets = galleryIndex.sets || galleryIndex
  const chessRelevant = Array.isArray(sets)
    ? sets.filter(s => s.tags?.includes('chess') || s.id?.startsWith('mce-'))
    : []
  const list = chessRelevant.length > 0 ? chessRelevant : (Array.isArray(sets) ? sets : [])
  for (const s of list) {
    const opt = document.createElement('option')
    opt.value = s.id || s.name
    opt.textContent = s.label || s.name || s.id
    if ((s.id || s.name) === currentPieceSet) opt.selected = true
    select.appendChild(opt)
  }
}

function toggleFullscreen() {
  fullscreenMode = !fullscreenMode
  document.body.classList.toggle('chess-fullscreen-mode', fullscreenMode)
  const playEl = document.querySelector('.chess-play')
  if (playEl) playEl.classList.toggle('chess-play--fullscreen', fullscreenMode)
  updateURL()
}

function postEmbedMessage(type, data) {
  if (embedMode && window.parent !== window) {
    window.parent.postMessage({ type: `chess:${type}`, ...data }, '*')
  }
}

function initEmbedMessageListener() {
  if (!embedMode) return
  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data.type !== 'string') return
    switch (e.data.type) {
      case 'chess:setVariant': {
        if (e.data.variant && MCE.variantRegistry[e.data.variant]) {
          currentVariant = e.data.variant
          startGame()
        }
        break
      }
      case 'chess:newGame': startGame(); break
      case 'chess:setDifficulty': {
        if (e.data.difficulty && ctrl) ctrl.setDifficulty(e.data.difficulty)
        break
      }
      case 'chess:setPieces': {
        if (e.data.set) { currentPieceSet = e.data.set; startGame() }
        break
      }
      case 'chess:flip': {
        if (ctrl) { const s = ctrl.getState(); ctrl.setFlipped(!s.flipped) }
        break
      }
      case 'chess:undo': { if (ctrl) ctrl.undo(); break }
    }
  })
}

function sqToAlgebraic(idx, rows, cols) {
  return algebraicId(Math.floor(idx / cols), idx % cols, rows)
}

function algebraicToSq(alg, rows, cols) {
  return algebraicToIndex(alg, rows, cols)
}

function boardToFEN(board, rows, cols, flipped) {
  const fenRows = []
  for (let vr = 0; vr < rows; vr++) {
    const r = flipped ? rows - 1 - vr : vr
    let row = ''
    let empty = 0
    for (let vc = 0; vc < cols; vc++) {
      const c = flipped ? cols - 1 - vc : vc
      const piece = board[r * cols + c]
      if (piece) {
        if (empty > 0) { row += empty; empty = 0 }
        row += piece
      } else {
        empty++
      }
    }
    if (empty > 0) row += empty
    fenRows.push(row)
  }
  return fenRows.join('/')
}

function getCellCenter(idx, flipped, rows, cols) {
  if (!boardSvgContainer) return null
  const game = ctrl?.getGame()
  if (!game) return null
  let visualIdx = idx
  if (flipped) {
    const r = Math.floor(idx / cols)
    const c = idx % cols
    visualIdx = (rows - 1 - r) * cols + (cols - 1 - c)
  }
  const alg = sqToAlgebraic(visualIdx, rows, cols)
  const cell = boardSvgContainer.querySelector(`[data-sq="${alg}"]`)
  if (!cell || !cell.getBBox) return null
  const bbox = cell.getBBox()
  return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2, w: bbox.width, h: bbox.height }
}

function animatePiece(fromIdx, fromPos, toPos, duration, flipped, rows, cols, onDone) {
  const svgEl = boardSvgContainer.querySelector('svg')
  if (!svgEl) { onDone(); return }

  const game = ctrl?.getGame()
  if (!game) { onDone(); return }
  let visualIdx = fromIdx
  if (flipped) {
    const r = Math.floor(fromIdx / game.cols)
    const c = fromIdx % game.cols
    visualIdx = (game.rows - 1 - r) * game.cols + (game.cols - 1 - c)
  }

  const pieceEls = svgEl.querySelectorAll('image, text')
  let pieceEl = null
  for (const el of pieceEls) {
    let cx, cy, size
    const tag = el.tagName.toLowerCase()
    if (tag === 'image') {
      const ix = parseFloat(el.getAttribute('x'))
      const iy = parseFloat(el.getAttribute('y'))
      size = parseFloat(el.getAttribute('width'))
      cx = ix + size / 2
      cy = iy + size / 2
    } else if (tag === 'text') {
      cx = parseFloat(el.getAttribute('x'))
      cy = parseFloat(el.getAttribute('y'))
      size = 40
    } else continue
    if (Math.abs(cx - fromPos.x) < size * 0.5 && Math.abs(cy - fromPos.y) < size * 0.5) {
      pieceEl = el
      break
    }
  }
  if (!pieceEl) { onDone(); return }

  // Hide captured piece at destination so slide looks clean
  for (const el of pieceEls) {
    if (el === pieceEl) continue
    const tag = el.tagName.toLowerCase()
    let cx, cy, size
    if (tag === 'image') {
      const ix = parseFloat(el.getAttribute('x'))
      const iy = parseFloat(el.getAttribute('y'))
      size = parseFloat(el.getAttribute('width'))
      cx = ix + size / 2
      cy = iy + size / 2
    } else if (tag === 'text') {
      cx = parseFloat(el.getAttribute('x'))
      cy = parseFloat(el.getAttribute('y'))
      size = 40
    } else continue
    if (Math.abs(cx - toPos.x) < size * 0.5 && Math.abs(cy - toPos.y) < size * 0.5) {
      el.setAttribute('opacity', '0')
      break
    }
  }

  if (!pieceEl) { onDone(); return }

  const dx = toPos.x - fromPos.x
  const dy = toPos.y - fromPos.y

  if (animStyle === 'warp') {
    const fadeOut = duration * 0.35
    const fadeIn = duration * 0.35
    const startTime = performance.now()
    function warpFrame(now) {
      const elapsed = now - startTime
      if (elapsed < fadeOut) {
        pieceEl.setAttribute('opacity', 1 - elapsed / fadeOut)
        requestAnimationFrame(warpFrame)
      } else if (elapsed < fadeOut + 50) {
        pieceEl.setAttribute('opacity', '0')
        pieceEl.setAttribute('transform', `translate(${dx}, ${dy})`)
        requestAnimationFrame(warpFrame)
      } else if (elapsed < fadeOut + 50 + fadeIn) {
        const t = (elapsed - fadeOut - 50) / fadeIn
        pieceEl.setAttribute('opacity', t)
        requestAnimationFrame(warpFrame)
      } else {
        pieceEl.setAttribute('opacity', '1')
        onDone()
      }
    }
    requestAnimationFrame(warpFrame)
    return
  }

  if (animStyle === 'arc') {
    const dist = Math.sqrt(dx * dx + dy * dy)
    const lift = -dist * 0.3
    const start = performance.now()
    function arcFrame(now) {
      const t = Math.min((now - start) / duration, 1)
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      const cx = dx * ease
      const cy = dy * ease + lift * Math.sin(ease * Math.PI)
      pieceEl.setAttribute('transform', `translate(${cx}, ${cy})`)
      if (t < 1) requestAnimationFrame(arcFrame)
      else onDone()
    }
    requestAnimationFrame(arcFrame)
    return
  }

  const start = performance.now()
  const easeOut = t => 1 - Math.pow(1 - t, 3)
  const bounceEase = t => {
    const n = 7.5625, d = 2.75
    let tl = t
    if (tl < 1/d) return n*tl*tl
    if (tl < 2/d) return n*(tl-=1.5/d)*tl+0.75
    if (tl < 2.5/d) return n*(tl-=2.25/d)*tl+0.9375
    return n*(tl-=2.625/d)*tl+0.984375
  }
  const easeFn = animStyle === 'bounce' ? bounceEase : easeOut

  function frame(now) {
    const t = Math.min((now - start) / duration, 1)
    const p = easeFn(t)
    pieceEl.setAttribute('transform', `translate(${dx * p}, ${dy * p})`)
    if (t < 1) requestAnimationFrame(frame)
    else onDone()
  }
  requestAnimationFrame(frame)
}

function renderEffectOverlay(effect, x, y, tileSize) {
  const ns = 'http://www.w3.org/2000/svg'
  if (effect.type === 'immune') {
    const shield = document.createElementNS(ns, 'rect')
    shield.setAttribute('x', x + 2)
    shield.setAttribute('y', y + 2)
    shield.setAttribute('width', tileSize - 4)
    shield.setAttribute('height', tileSize - 4)
    shield.setAttribute('rx', '4')
    shield.setAttribute('fill', 'none')
    shield.setAttribute('stroke', '#00e676')
    shield.setAttribute('stroke-width', '2.5')
    shield.setAttribute('opacity', '0.7')
    return shield
  }
  if (effect.type === 'poison') {
    const dot = document.createElementNS(ns, 'circle')
    dot.setAttribute('cx', x + tileSize - 8)
    dot.setAttribute('cy', y + 8)
    dot.setAttribute('r', '4')
    dot.setAttribute('fill', '#ab47bc')
    dot.setAttribute('opacity', '0.8')
    return dot
  }
  if (effect.type === 'petrify') {
    const dot = document.createElementNS(ns, 'circle')
    dot.setAttribute('cx', x + tileSize - 8)
    dot.setAttribute('cy', y + 8)
    dot.setAttribute('r', '4')
    dot.setAttribute('fill', '#78909c')
    dot.setAttribute('opacity', '0.8')
    return dot
  }
  return null
}

function captureBurst(cx, cy, tileSize) {
  const svgEl = boardSvgContainer.querySelector('svg')
  if (!svgEl) return
  const ns = 'http://www.w3.org/2000/svg'
  const flash = document.createElementNS(ns, 'g')
  flash.setAttribute('style', 'pointer-events:none')

  const ring = document.createElementNS(ns, 'circle')
  ring.setAttribute('cx', cx)
  ring.setAttribute('cy', cy)
  ring.setAttribute('r', tileSize * 0.15)
  ring.setAttribute('fill', 'none')
  ring.setAttribute('stroke', 'rgba(255,100,40,0.95)')
  ring.setAttribute('stroke-width', '3')
  flash.appendChild(ring)

  const particleCount = 8
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2
    const p = document.createElementNS(ns, 'circle')
    p.setAttribute('cx', cx + Math.cos(angle) * tileSize * 0.1)
    p.setAttribute('cy', cy + Math.sin(angle) * tileSize * 0.1)
    p.setAttribute('r', '2.5')
    p.setAttribute('fill', 'rgba(255,220,60,0.95)')
    flash.appendChild(p)
  }

  const innerFlash = document.createElementNS(ns, 'circle')
  innerFlash.setAttribute('cx', cx)
  innerFlash.setAttribute('cy', cy)
  innerFlash.setAttribute('r', tileSize * 0.3)
  innerFlash.setAttribute('fill', 'rgba(255,200,80,0.4)')
  flash.appendChild(innerFlash)

  svgEl.appendChild(flash)

  const start = performance.now()
  const DURATION = 400
  function frame(now) {
    const t = Math.min((now - start) / DURATION, 1)
    const ease = 1 - Math.pow(1 - t, 3)

    ring.setAttribute('r', tileSize * 0.15 + ease * tileSize * 0.6)
    ring.setAttribute('stroke-opacity', 1 - ease)
    ring.setAttribute('stroke-width', 3 * (1 - ease * 0.7))

    innerFlash.setAttribute('r', tileSize * 0.3 * (1 - ease))
    innerFlash.setAttribute('opacity', 1 - ease)

    const particles = flash.querySelectorAll('circle:not(:first-child):not(:last-child)')
    particles.forEach((p, i) => {
      const angle = (i / particleCount) * Math.PI * 2
      const dist = tileSize * 0.1 + ease * tileSize * 0.55
      p.setAttribute('cx', cx + Math.cos(angle) * dist)
      p.setAttribute('cy', cy + Math.sin(angle) * dist)
      p.setAttribute('opacity', 1 - ease * ease)
      p.setAttribute('r', 2.5 * (1 - ease * 0.5))
    })

    if (t < 1) requestAnimationFrame(frame)
    else flash.remove()
  }
  requestAnimationFrame(frame)
}

function addHighlight(overlay, idx, rows, cols, color, flipped) {
  let visualIdx = idx
  if (flipped) {
    const r = Math.floor(idx / cols)
    const c = idx % cols
    visualIdx = (rows - 1 - r) * cols + (cols - 1 - c)
  }
  const alg = sqToAlgebraic(visualIdx, rows, cols)
  const cell = boardSvgContainer.querySelector(`[data-sq="${alg}"]`)
  if (!cell) return
  const bbox = cell.getBBox ? cell.getBBox() : null
  if (!bbox) return
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  rect.setAttribute('x', bbox.x)
  rect.setAttribute('y', bbox.y)
  rect.setAttribute('width', bbox.width)
  rect.setAttribute('height', bbox.height)
  rect.setAttribute('fill', color)
  overlay.appendChild(rect)
}

function buildResolved(fen, rows, cols) {
  return {
    topology: { type: 'grid', rows, cols, tileMode: 'tiles' },
    render: {
      cellColor: 'checkered',
      alternating: true,
      labels: !embedMode,
      interactive: true,
    },
    setup: fen,
    pieces: { set: currentPieceSet },
    meta: { label: '' },
  }
}

function showPromotionDialog(choices, resolve) {
  const dialog = document.getElementById('chess-promotion-dialog')
  if (!dialog) { resolve(choices[0]); return }
  const SYMBOLS = { q: '♕', r: '♖', b: '♗', n: '♘', Q: '♕', R: '♖', B: '♗', N: '♘' }
  dialog.style.display = 'flex'
  dialog.innerHTML = choices.map(c => {
    const sym = SYMBOLS[c] || c[0].toUpperCase()
    return `<button class="promo-btn" data-choice="${c}">${sym}</button>`
  }).join('')
  dialog.onclick = (e) => {
    const btn = e.target.closest('[data-choice]')
    if (btn) {
      dialog.style.display = 'none'
      resolve(btn.dataset.choice)
    }
  }
}

function updateStatus(status) {
  const statusEl = document.getElementById('chess-status')
  if (!statusEl) return
  if (status === 'forfeit') statusEl.textContent = 'Game forfeited'
  else if (status === 'checkmate') statusEl.textContent = 'Checkmate'
  else if (status === 'stalemate') statusEl.textContent = 'Stalemate'
  else if (status === 'draw' || (typeof status === 'string' && status.startsWith('draw'))) statusEl.textContent = 'Draw'
  else if (status === MCE.WHITE || status === 'white') statusEl.textContent = 'White wins!'
  else if (status === MCE.BLACK || status === 'black') statusEl.textContent = 'Black wins!'
  else statusEl.textContent = status
  statusEl.classList.add('chess-status--over')
}

function updateMoveList(moveLog, cols, rows) {
  const movesEl = document.getElementById('chess-moves')
  if (!movesEl) return
  const entries = moveLog.map((entry, i) => {
    const m = entry.move
    const from = sqToAlgebraic(m.from, rows, cols)
    const to = sqToAlgebraic(m.to, rows, cols)
    const num = Math.floor(i / 2) + 1
    const prefix = i % 2 === 0 ? `${num}. ` : ''
    return `<span class="move-entry">${prefix}${from}${to}</span>`
  })
  movesEl.innerHTML = entries.join(' ')
  movesEl.scrollTop = movesEl.scrollHeight
}

function bindEvents(container) {
  container.querySelector('#chess-variant-select')?.addEventListener('change', (e) => {
    currentVariant = e.target.value
    startGame()
  })
  container.querySelector('#chess-new-btn')?.addEventListener('click', () => startGame())
  container.querySelector('#chess-undo-btn')?.addEventListener('click', () => ctrl?.undo())
  container.querySelector('#chess-flip-btn')?.addEventListener('click', () => {
    const state = ctrl?.getState()
    ctrl?.setFlipped(!state?.flipped)
    updateURL()
  })
  container.querySelector('#chess-fullscreen-btn')?.addEventListener('click', toggleFullscreen)
  container.querySelector('#chess-pieceset-select')?.addEventListener('change', (e) => {
    currentPieceSet = e.target.value
    localStorage.setItem('mce-piece-set', currentPieceSet)
    startGame()
  })
  container.querySelector('#chess-anim-style-select')?.addEventListener('change', (e) => {
    animStyle = e.target.value
    localStorage.setItem('mce-anim-style', animStyle)
  })
  container.querySelector('#chess-anim-speed-select')?.addEventListener('change', (e) => {
    animSpeed = e.target.value
    localStorage.setItem('mce-anim-speed', animSpeed)
    if (ctrl) ctrl.setRenderOpts({ animate: ANIM_SPEEDS[animSpeed] > 0, animDuration: ANIM_SPEEDS[animSpeed] })
  })
  container.querySelector('#chess-color-select')?.addEventListener('change', () => startGame())
  container.querySelector('#chess-opponent-select')?.addEventListener('change', () => startGame())
  container.querySelector('#chess-difficulty-select')?.addEventListener('change', () => startGame())
}

function updateURL() {
  const params = new URLSearchParams(location.search)
  params.set('mode', 'play')
  params.set('variant', currentVariant)
  const color = document.getElementById('chess-color-select')?.value
  const opponent = document.getElementById('chess-opponent-select')?.value
  if (color && color !== 'white') params.set('color', color)
  else params.delete('color')
  if (opponent && opponent !== 'human') params.set('opponent', opponent)
  else params.delete('opponent')
  const flipped = ctrl?.getState()?.flipped
  if (flipped) params.set('flipped', '1')
  else params.delete('flipped')
  if (embedMode) params.set('embed', '1')
  history.replaceState(null, '', '?' + params.toString())
}
