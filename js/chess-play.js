import { renderFromEngine, attachPieceImages } from '../packages/render/src/render-engine.js'
import { algebraicId, algebraicToIndex } from '../packages/topologies/grid/index.js'
import MCE, { legalMoves, makeMove, unmakeMove, getStatus, aiPickMove, AI_DIFFICULTIES } from '../packages/plugins/chess/src/mce/index.js'

const RULES_BASE = location.hostname === 'engine.moddable.games'
  ? 'https://rules.moddable.games/'
  : '../../moddable-rules/'

let controller = null
let currentVariant = 'standard'
let currentPieceSet = localStorage.getItem('mce-piece-set') || 'mce-fairy-complete'
let galleryIndex = null
let boardSvgContainer = null
let embedMode = false
let fullscreenMode = false

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
  await startGame()
  if (savedFlipped && controller) controller.setFlipped(true)
  bindEvents(container)
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
  if (chessRelevant.length === 0 && Array.isArray(sets)) {
    for (const s of sets) {
      const opt = document.createElement('option')
      opt.value = s.id || s.name
      opt.textContent = s.label || s.name || s.id
      if ((s.id || s.name) === currentPieceSet) opt.selected = true
      select.appendChild(opt)
    }
  } else {
    for (const s of chessRelevant) {
      const opt = document.createElement('option')
      opt.value = s.id || s.name
      opt.textContent = s.label || s.name || s.id
      if ((s.id || s.name) === currentPieceSet) opt.selected = true
      select.appendChild(opt)
    }
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
        const v = e.data.variant
        if (v && MCE.variantRegistry[v]) {
          currentVariant = v
          startGame()
        }
        break
      }
      case 'chess:newGame': {
        startGame()
        break
      }
      case 'chess:setDifficulty': {
        if (e.data.difficulty && controller) {
          startGame()
        }
        break
      }
      case 'chess:setPieces': {
        if (e.data.set) {
          currentPieceSet = e.data.set
          startGame()
        }
        break
      }
      case 'chess:flip': {
        if (controller) controller.setFlipped(!controller.getState().flipped)
        break
      }
      case 'chess:undo': {
        if (controller) controller.undo()
        break
      }
    }
  })
}

function sqToAlgebraic(idx, rows, cols) {
  return algebraicId(Math.floor(idx / cols), idx % cols, rows)
}

function algebraicToSq(alg, rows, cols) {
  return algebraicToIndex(alg, rows, cols)
}

async function startGame() {
  if (controller) controller.destroy()

  const vc = MCE.getVariantConfig(currentVariant)
  const rows = (vc && vc.rows) || 8
  const cols = (vc && vc.cols) || 8

  const game = MCE.createGame(currentVariant)

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
    players[humanColor] = 'human'
    players[humanColor === 'white' ? 'black' : 'white'] = 'ai'
  } else {
    players.white = 'human'
    players.black = 'human'
  }

  controller = createMCEController(game, {
    rows, cols, players, difficulty, opponent,
    onRender: (state) => renderBoard(game, state, rows, cols),
    onMove: (move, player) => {
      postEmbedMessage('move', { from: move.from, to: move.to, player, fen: MCE.toFEN(game), variant: currentVariant })
    },
    onGameEnd: (status) => {
      updateStatus(status)
      postEmbedMessage('status', { text: status, gameOver: true, variant: currentVariant })
    },
    onChoiceNeeded: (choices, resolve) => showPromotionDialog(choices, resolve),
  })

  postEmbedMessage('ready', { variant: currentVariant, fen: MCE.toFEN(game) })

  const statusEl = document.getElementById('chess-status')
  if (statusEl) statusEl.textContent = 'white to move'
  const movesEl = document.getElementById('chess-moves')
  if (movesEl) movesEl.innerHTML = ''
  updateURL()
}

const ANIM_SPEEDS = { instant: 0, fast: 120, normal: 220, slow: 400 }
const ANIM_STYLES = { slide: 'Slide', arc: 'Arc', bounce: 'Bounce', warp: 'Warp' }
let animSpeed = localStorage.getItem('mce-anim-speed') || 'normal'
let animStyle = localStorage.getItem('mce-anim-style') || 'slide'

function createMCEController(game, opts) {
  const { rows, cols, players, difficulty, opponent } = opts
  const onRender = opts.onRender
  const onMove = opts.onMove
  const onGameEnd = opts.onGameEnd
  const onChoiceNeeded = opts.onChoiceNeeded

  let selected = null
  let lastMove = null
  let undoStack = []
  let flipped = false
  let aiThinking = false
  let gameOver = false
  let destroyed = false
  let animating = false
  const moveLog = []

  function currentPlayerColor() {
    return game.turn === MCE.WHITE ? 'white' : 'black'
  }

  function isHumanTurn() {
    return players[currentPlayerColor()] !== 'ai'
  }

  function render() {
    if (destroyed) return
    const legal = selected !== null ? legalMoves(game).filter(m => m.from === selected) : []
    onRender({ selected, lastMove, flipped, aiThinking, gameOver, legalMoves: legal, board: game.board })
  }

  function handleClick(pos) {
    if (destroyed || gameOver || aiThinking) return
    if (!isHumanTurn()) return

    const allMoves = legalMoves(game)

    if (selected !== null) {
      const candidates = allMoves.filter(m => m.from === selected && m.to === pos)

      if (candidates.length > 1 && candidates.some(m => m.promo)) {
        if (onChoiceNeeded) {
          const choices = [...new Set(candidates.map(m => m.promo))]
          onChoiceNeeded(choices, (chosen) => {
            const move = candidates.find(m => m.promo === chosen)
            if (move) executeMove(move)
          })
        } else {
          executeMove(candidates[0])
        }
        return
      }

      if (candidates.length > 0) {
        executeMove(candidates[0])
        return
      }
    }

    const piece = game.board[pos]
    const isOwn = piece && MCE.pieceColor(piece) === game.turn
    if (isOwn) {
      selected = pos
    } else {
      selected = null
    }
    render()
  }

  function executeMove(move) {
    if (animating) return false
    const player = currentPlayerColor()
    const duration = ANIM_SPEEDS[animSpeed] || 0

    const fromPos = getCellCenter(move.from, flipped, rows, cols)
    const toPos = getCellCenter(move.to, flipped, rows, cols)

    const undo = makeMove(game, move)
    if (!undo) return false

    undoStack.push(undo)
    lastMove = { from: move.from, to: move.to }
    selected = null
    moveLog.push({ move, player })
    updateMoveList(moveLog, cols, rows)
    if (onMove) onMove(move, player)

    const finishMove = () => {
      const status = getStatus(game)
      if (status === 'checkmate' || status === 'stalemate' || status.startsWith('draw')) {
        gameOver = true
        let winner
        if (status === 'checkmate') {
          winner = game.turn === MCE.WHITE ? 'black' : 'white'
        } else {
          winner = 'draw'
        }
        if (onGameEnd) onGameEnd(winner)
        render()
        return
      }

      const statusEl = document.getElementById('chess-status')
      if (statusEl) {
        const inCheck = status === 'check'
        statusEl.textContent = `${currentPlayerColor()} to move${inCheck ? ' (check)' : ''}`
      }

      render()

      if (!gameOver && !isHumanTurn()) {
        scheduleAIMove()
      }
    }

    if (duration > 0 && fromPos && toPos && boardSvgContainer) {
      animating = true
      animatePiece(move.from, fromPos, toPos, duration, flipped, rows, cols, () => {
        animating = false
        finishMove()
      })
    } else {
      finishMove()
    }

    return true
  }

  function scheduleAIMove() {
    aiThinking = true
    render()
    setTimeout(doAIMove, 150)
  }

  function doAIMove() {
    if (destroyed || gameOver) { aiThinking = false; render(); return }

    const move = aiPickMove(game, { difficulty })
    if (!move) { aiThinking = false; render(); return }

    aiThinking = false
    executeMove(move)
  }

  function undo() {
    if (undoStack.length === 0 || aiThinking) return false
    unmakeMove(game, undoStack.pop())
    moveLog.pop()

    if (opponent === 'ai' && undoStack.length > 0 && !isHumanTurn()) {
      unmakeMove(game, undoStack.pop())
      moveLog.pop()
    }

    selected = null
    gameOver = false
    lastMove = undoStack.length > 0
      ? { from: undoStack[undoStack.length - 1].from, to: undoStack[undoStack.length - 1].to }
      : null

    const statusEl = document.getElementById('chess-status')
    if (statusEl) statusEl.textContent = `${currentPlayerColor()} to move`
    statusEl?.classList.remove('chess-status--over')
    updateMoveList(moveLog, cols, rows)
    render()
    return true
  }

  function setFlipped(val) { flipped = val; render() }
  function getState() { return { flipped, gameOver, aiThinking, selected } }
  function destroy() { destroyed = true }

  render()
  if (!isHumanTurn()) scheduleAIMove()

  return { handleClick, undo, setFlipped, getState, destroy }
}

function renderBoard(game, state, rows, cols) {
  if (!boardSvgContainer) return

  const { selected, lastMove, legalMoves: legal, flipped } = state
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
    svgEl.style.maxHeight = 'calc(100vh - 180px)'
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
        controller.handleClick(idx)
        return
      }
      el = el.parentNode
    }
  }
}

function getCellCenter(idx, flipped, rows, cols) {
  if (!boardSvgContainer) return null
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

  let visualIdx = fromIdx
  if (flipped) {
    const r = Math.floor(fromIdx / cols)
    const c = fromIdx % cols
    visualIdx = (rows - 1 - r) * cols + (cols - 1 - c)
  }
  const alg = sqToAlgebraic(visualIdx, rows, cols)
  const cell = boardSvgContainer.querySelector(`[data-sq="${alg}"]`)
  if (!cell) { onDone(); return }

  const piecesGroup = svgEl.querySelector('g[pointer-events="none"]')
  if (!piecesGroup) { onDone(); return }

  const pieceImgs = piecesGroup.querySelectorAll('image')
  let pieceEl = null
  for (const img of pieceImgs) {
    const ix = parseFloat(img.getAttribute('x'))
    const iy = parseFloat(img.getAttribute('y'))
    const iw = parseFloat(img.getAttribute('width'))
    if (Math.abs((ix + iw / 2) - fromPos.x) < iw * 0.3 && Math.abs((iy + iw / 2) - fromPos.y) < iw * 0.3) {
      pieceEl = img
      break
    }
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

  let easing = 'ease-out'
  let transformEnd = `translate(${dx}px, ${dy}px)`

  if (animStyle === 'arc') {
    const dist = Math.sqrt(dx * dx + dy * dy)
    const lift = -dist * 0.3
    pieceEl.animate([
      { transform: 'translate(0, 0)', offset: 0 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + lift}px)`, offset: 0.5 },
      { transform: transformEnd, offset: 1 },
    ], { duration, easing: 'ease-in-out', fill: 'forwards' })
    setTimeout(onDone, duration)
    return
  }

  if (animStyle === 'bounce') {
    easing = 'cubic-bezier(0.34, 1.56, 0.64, 1)'
  }

  pieceEl.style.transition = `transform ${duration}ms ${easing}`
  pieceEl.style.transform = transformEnd

  setTimeout(onDone, duration)
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
  const SYMBOLS = { q: '♕', r: '♖', b: '♗', n: '♘', queen: '♕', rook: '♖', bishop: '♗', knight: '♘' }
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
  else if (status === 'draw') statusEl.textContent = 'Draw'
  else if (status === 'white' || status === 'black') statusEl.textContent = `${status.charAt(0).toUpperCase() + status.slice(1)} wins!`
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
  container.querySelector('#chess-undo-btn')?.addEventListener('click', () => controller?.undo())
  container.querySelector('#chess-flip-btn')?.addEventListener('click', () => {
    const state = controller?.getState()
    controller?.setFlipped(!state?.flipped)
    updateURL()
  })
  container.querySelector('#chess-fullscreen-btn')?.addEventListener('click', toggleFullscreen)
  container.querySelector('#chess-pieceset-select')?.addEventListener('change', (e) => {
    currentPieceSet = e.target.value
    localStorage.setItem('mce-piece-set', currentPieceSet)
    controller?.render?.()
    startGame()
  })
  container.querySelector('#chess-anim-style-select')?.addEventListener('change', (e) => {
    animStyle = e.target.value
    localStorage.setItem('mce-anim-style', animStyle)
  })
  container.querySelector('#chess-anim-speed-select')?.addEventListener('change', (e) => {
    animSpeed = e.target.value
    localStorage.setItem('mce-anim-speed', animSpeed)
  })
  container.querySelector('#chess-color-select')?.addEventListener('change', () => startGame())
  container.querySelector('#chess-opponent-select')?.addEventListener('change', () => startGame())
  container.querySelector('#chess-difficulty-select')?.addEventListener('change', () => startGame())
}

function updateURL() {
  const params = new URLSearchParams(location.search)
  params.set('mode', 'play')
  params.set('game', 'moddable-chess')
  params.set('variant', currentVariant)
  const color = document.getElementById('chess-color-select')?.value
  const opponent = document.getElementById('chess-opponent-select')?.value
  if (color && color !== 'white') params.set('color', color)
  else params.delete('color')
  if (opponent && opponent !== 'human') params.set('opponent', opponent)
  else params.delete('opponent')
  const flipped = controller?.getState()?.flipped
  if (flipped) params.set('flipped', '1')
  else params.delete('flipped')
  history.replaceState(null, '', '?' + params.toString())
}
