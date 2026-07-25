import { renderFromEngine, attachPieceImages } from '../packages/render/src/render-engine.js'
import { resolveSurface } from '../packages/schema/src/surfaces.js'
import { resolve as cascadeResolve } from '../packages/schema/src/cascade-resolver.js'
import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'
import { createChessPlugin } from '../packages/plugins/chess/index.js'
import { createGameFromDefinition } from '../packages/game/index.js'
import { createGridTopology } from '../packages/topologies/grid/index.js'
import { createGameController } from '../packages/play/index.js'
import { registerVariant, getVariantConfig, getVariantGroups } from '../packages/plugins/chess/index.js'
import { standard, noCastling, torpedo, threeCheck, fiveCheck, kingOfTheHill, antichess, racingKings } from '../packages/plugins/chess/src/variants/index.js'

registerVariant('standard', standard)
registerVariant('noCastling', noCastling)
registerVariant('torpedo', torpedo)
registerVariant('threeCheck', threeCheck)
registerVariant('fiveCheck', fiveCheck)
registerVariant('kingOfTheHill', kingOfTheHill)
registerVariant('antichess', antichess)
registerVariant('racingKings', racingKings)

const RULES_BASE = location.hostname === 'engine.moddable.games'
  ? 'https://rules.moddable.games/'
  : '../../moddable-rules/'

let controller = null
let currentVariant = 'standard'
let galleryIndex = null
let boardSvgContainer = null

export async function initChessPlay(container) {
  const params = new URLSearchParams(location.search)
  currentVariant = params.get('variant') || 'standard'

  galleryIndex = await fetch('../pieces/gallery-index.json').then(r => r.json()).catch(() => null)

  container.innerHTML = buildUI()
  boardSvgContainer = container.querySelector('#chess-board-svg')
  populateVariantPicker(container)
  await startGame()
  bindEvents(container)
}

function buildUI() {
  return `
<div class="chess-play">
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
        <option value="ai">AI (Random)</option>
      </select>
    </div>
    <div class="chess-controls">
      <button id="chess-new-btn" class="btn btn-primary">New Game</button>
      <button id="chess-undo-btn" class="btn btn-outline">Undo</button>
      <button id="chess-flip-btn" class="btn btn-outline">Flip</button>
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
  const groups = getVariantGroups()
  const GROUP_ORDER = ['Classic', 'Tactical', 'Alternate Rules', 'Other']

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

function sqToAlgebraic(idx, rows, cols) {
  const r = Math.floor(idx / cols)
  const c = idx % cols
  return String.fromCharCode(97 + c) + (rows - r)
}

function algebraicToSq(alg, rows, cols) {
  const c = alg.charCodeAt(0) - 97
  const r = rows - parseInt(alg.slice(1))
  return r * cols + c
}

async function startGame() {
  if (controller) controller.destroy()

  const variantConfig = getVariantConfig(currentVariant) || {}
  const rows = variantConfig.rows || 8
  const cols = variantConfig.cols || 8

  const pluginConfig = {}
  if (variantConfig.setup) pluginConfig.setup = variantConfig.setup
  if (variantConfig.castling === false) pluginConfig.castling = false
  if (variantConfig.enPassant === false) pluginConfig.enPassant = false

  const game = createGameFromDefinition(
    {
      topology: { type: 'grid', rows, cols },
      players: { names: ['white', 'black'], count: 2 },
      plugins: { chess: pluginConfig },
      render: { alternating: true },
    },
    {
      topologies: { grid: (config) => createGridTopology(config) },
      pluginFactories: { chess: (cfg, ctx) => createChessPlugin({ ...cfg, ...variantConfig }, ctx) },
    }
  )

  const colorSelect = document.getElementById('chess-color-select')
  const opponentSelect = document.getElementById('chess-opponent-select')
  const humanColor = colorSelect?.value || 'white'
  const opponent = opponentSelect?.value || 'human'

  const players = {}
  if (opponent === 'ai') {
    players[humanColor] = 'human'
    players[humanColor === 'white' ? 'black' : 'white'] = 'ai'
  } else {
    players.white = 'human'
    players.black = 'human'
  }

  const moveLog = []

  controller = createGameController(game, {
    players,
    onRender: (g, state) => renderBoard(g, state, rows, cols),
    onMove: (move, player) => {
      moveLog.push({ move, player })
      updateMoveList(moveLog, cols, rows)
    },
    onGameEnd: (status) => updateStatus(status),
    onChoiceNeeded: (choices, player, resolve) => showPromotionDialog(choices, resolve),
    onTurnChange: (player) => {
      const statusEl = document.getElementById('chess-status')
      if (statusEl) statusEl.textContent = `${player} to move`
    },
  })

  const statusEl = document.getElementById('chess-status')
  if (statusEl) statusEl.textContent = 'white to move'
  const movesEl = document.getElementById('chess-moves')
  if (movesEl) movesEl.innerHTML = ''
  updateURL()
}

function renderBoard(game, state, rows, cols) {
  if (!boardSvgContainer) return
  const chessState = game.getState('chess')
  if (!chessState) return

  const board = chessState.board
  const selected = state.selected
  const lastMove = state.lastMove
  const legalMoves = state.legalMoves || []
  const legalTargets = new Set(legalMoves.map(m => sqToAlgebraic(m.to, rows, cols)))

  const fenRows = []
  for (let r = 0; r < rows; r++) {
    let row = ''
    let empty = 0
    for (let c = 0; c < cols; c++) {
      const piece = board[r * cols + c]
      if (piece) {
        if (empty > 0) { row += empty; empty = 0 }
        const sym = pieceToFen(piece)
        row += sym
      } else {
        empty++
      }
    }
    if (empty > 0) row += empty
    fenRows.push(row)
  }
  const fen = fenRows.join('/')

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

  if (selected !== null) {
    const selAlg = sqToAlgebraic(selected, rows, cols)
    const cell = boardSvgContainer.querySelector(`[data-sq="${selAlg}"]`)
    if (cell) cell.style.fill = 'rgba(127, 179, 62, 0.6)'
  }

  if (lastMove) {
    const fromAlg = sqToAlgebraic(lastMove.from, rows, cols)
    const toAlg = sqToAlgebraic(lastMove.to, rows, cols)
    const fromCell = boardSvgContainer.querySelector(`[data-sq="${fromAlg}"]`)
    const toCell = boardSvgContainer.querySelector(`[data-sq="${toAlg}"]`)
    if (fromCell) fromCell.style.fill = 'rgba(205, 210, 106, 0.5)'
    if (toCell) toCell.style.fill = 'rgba(205, 210, 106, 0.5)'
  }

  for (const alg of legalTargets) {
    const cell = boardSvgContainer.querySelector(`[data-sq="${alg}"]`)
    if (cell) {
      const idx = algebraicToSq(alg, rows, cols)
      const hasPiece = board[idx] !== null
      if (hasPiece) {
        cell.style.fill = 'rgba(224, 64, 64, 0.4)'
      } else {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        const bbox = cell.getBBox ? cell.getBBox() : null
        if (bbox) {
          dot.setAttribute('cx', bbox.x + bbox.width / 2)
          dot.setAttribute('cy', bbox.y + bbox.height / 2)
          dot.setAttribute('r', bbox.width * 0.15)
          dot.setAttribute('fill', 'rgba(0, 0, 0, 0.25)')
          dot.setAttribute('class', 'legal-dot')
          dot.setAttribute('pointer-events', 'none')
          cell.parentNode.appendChild(dot)
        }
      }
    }
  }

  boardSvgContainer.onclick = (e) => {
    let el = e.target
    while (el && el !== boardSvgContainer) {
      if (el.getAttribute && el.getAttribute('data-sq')) {
        const alg = el.getAttribute('data-sq')
        const idx = algebraicToSq(alg, rows, cols)
        console.log('CLICK:', alg, '→ idx', idx, '| piece:', game.getState('chess')?.board[idx])
        controller.handleClick(idx)
        return
      }
      el = el.parentNode
    }
    console.log('CLICK: no data-sq found, target:', e.target.tagName, e.target.className)
  }
}

function buildResolved(fen, rows, cols) {
  return {
    topology: { type: 'grid', rows, cols, tileMode: 'tiles' },
    render: {
      cellColor: 'checkered',
      alternating: true,
      labels: true,
      interactive: true,
    },
    setup: fen,
    pieces: { set: 'mce-fairy-complete' },
    meta: { label: '' },
  }
}

function pieceToFen(piece) {
  const map = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' }
  const ch = map[piece.type] || piece.type[0]
  return piece.owner === 0 ? ch.toUpperCase() : ch.toLowerCase()
}

function showPromotionDialog(choices, resolve) {
  const dialog = document.getElementById('chess-promotion-dialog')
  if (!dialog) { resolve(choices[0]); return }
  const SYMBOLS = { queen: '♕', rook: '♖', bishop: '♗', knight: '♘' }
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
  })
  container.querySelector('#chess-color-select')?.addEventListener('change', () => startGame())
  container.querySelector('#chess-opponent-select')?.addEventListener('change', () => startGame())
}

function updateURL() {
  const params = new URLSearchParams(location.search)
  params.set('mode', 'play')
  params.set('game', 'moddable-chess')
  params.set('variant', currentVariant)
  history.replaceState(null, '', '?' + params.toString())
}
