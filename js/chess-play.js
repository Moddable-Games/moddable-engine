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
    onAnimateMove: (move, g, done) => {
      const duration = ANIM_SPEEDS[animSpeed] || 0
      if (duration === 0) { done(); return }
      const flp = ctrl?.getState()?.flipped || false
      const fromPos = getCellCenter(move.from, flp, rows, cols)
      const toPos = getCellCenter(move.to, flp, rows, cols)
      console.log('[anim]', move.from, '->', move.to, 'fromPos:', fromPos, 'toPos:', toPos, 'duration:', duration)
      if (!fromPos || !toPos) { done(); return }
      animatePiece(move.from, fromPos, toPos, duration, flp, rows, cols, done)
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

  const piecesGroup = svgEl.querySelector('g[pointer-events="none"]')
  if (!piecesGroup) { onDone(); return }

  const pieceEls = piecesGroup.querySelectorAll('image, text, g')
  let pieceEl = null
  const debugPositions = []
  for (const el of pieceEls) {
    let cx, cy, size
    if (el.tagName === 'image') {
      const ix = parseFloat(el.getAttribute('x'))
      const iy = parseFloat(el.getAttribute('y'))
      size = parseFloat(el.getAttribute('width'))
      cx = ix + size / 2
      cy = iy + size / 2
    } else if (el.tagName === 'text') {
      cx = parseFloat(el.getAttribute('x'))
      cy = parseFloat(el.getAttribute('y'))
      size = 40
    } else if (el.tagName === 'g' && el.querySelector('image, text')) {
      const inner = el.querySelector('image') || el.querySelector('text')
      if (inner.tagName === 'image') {
        const ix = parseFloat(inner.getAttribute('x'))
        const iy = parseFloat(inner.getAttribute('y'))
        size = parseFloat(inner.getAttribute('width'))
        cx = ix + size / 2
        cy = iy + size / 2
      } else {
        cx = parseFloat(inner.getAttribute('x'))
        cy = parseFloat(inner.getAttribute('y'))
        size = 40
      }
    } else continue
    debugPositions.push({ tag: el.tagName, cx, cy, size })
    if (Math.abs(cx - fromPos.x) < size * 0.4 && Math.abs(cy - fromPos.y) < size * 0.4) {
      pieceEl = el
      break
    }
  }
  if (!pieceEl) {
    console.log('[anim] NO piece found at', fromPos, 'Pieces in group:', debugPositions.slice(0, 5))
  }

  if (!pieceEl) { onDone(); return }

  const dx = toPos.x - fromPos.x
  const dy = toPos.y - fromPos.y

  if (animStyle === 'warp') {
    pieceEl.style.transition = `opacity ${duration * 0.4}ms ease-out`
    pieceEl.style.opacity = '0'
    setTimeout(() => {
      pieceEl.style.transition = 'none'
      pieceEl.style.transform = `translate(${dx}px, ${dy}px)`
      pieceEl.style.opacity = '0'
      requestAnimationFrame(() => {
        pieceEl.style.transition = `opacity ${duration * 0.4}ms ease-in`
        pieceEl.style.opacity = '1'
      })
      setTimeout(onDone, duration * 0.5)
    }, duration * 0.4)
    return
  }

  if (animStyle === 'arc') {
    const dist = Math.sqrt(dx * dx + dy * dy)
    const lift = -dist * 0.3
    pieceEl.animate([
      { transform: 'translate(0, 0)', offset: 0 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + lift}px)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px)`, offset: 1 },
    ], { duration, easing: 'ease-in-out', fill: 'forwards' })
    setTimeout(onDone, duration)
    return
  }

  let easing = 'ease-out'
  if (animStyle === 'bounce') easing = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

  pieceEl.style.transition = `transform ${duration}ms ${easing}`
  pieceEl.style.transform = `translate(${dx}px, ${dy}px)`
  setTimeout(onDone, duration)
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
