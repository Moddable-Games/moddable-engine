import { renderFromEngine, attachPieceImages } from '../packages/render/src/render-engine.js'
import { resolveSurface } from '../packages/schema/src/surfaces.js'
import { resolve as cascadeResolve } from '../packages/schema/src/cascade-resolver.js'
import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'
import { createChessPlugin } from '../packages/plugins/chess/index.js'
import { createGameFromDefinition } from '../packages/game/index.js'
import { createGridTopology, algebraicId, algebraicToIndex } from '../packages/topologies/grid/index.js'
import { createGameController } from '../packages/play/index.js'
import { createSimulator } from '../packages/ai/src/simulator.js'
import { createMinimax, DIFFICULTIES } from '../packages/ai/src/minimax.js'
import { chessEvaluate } from '../packages/ai/src/evaluators.js'
import { registerVariant, getVariantConfig, getVariantGroups } from '../packages/plugins/chess/index.js'
import { standard, noCastling, torpedo, threeCheck, fiveCheck, kingOfTheHill, antichess, racingKings, capablanca, losAlamos, horde } from '../packages/plugins/chess/src/variants/index.js'

registerVariant('standard', standard)
registerVariant('noCastling', noCastling)
registerVariant('torpedo', torpedo)
registerVariant('threeCheck', threeCheck)
registerVariant('fiveCheck', fiveCheck)
registerVariant('kingOfTheHill', kingOfTheHill)
registerVariant('antichess', antichess)
registerVariant('racingKings', racingKings)
registerVariant('capablanca', capablanca)
registerVariant('losAlamos', losAlamos)
registerVariant('horde', horde)

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
  const savedColor = params.get('color') || 'white'
  const savedOpponent = params.get('opponent') || 'human'
  const savedFlipped = params.get('flipped') === '1'

  galleryIndex = await fetch('../pieces/gallery-index.json').then(r => r.json()).catch(() => null)

  container.innerHTML = buildUI()
  boardSvgContainer = container.querySelector('#chess-board-svg')

  const colorSelect = container.querySelector('#chess-color-select')
  const opponentSelect = container.querySelector('#chess-opponent-select')
  if (colorSelect) colorSelect.value = savedColor
  if (opponentSelect) opponentSelect.value = savedOpponent

  populateVariantPicker(container)
  await startGame()
  if (savedFlipped) controller.setFlipped(true)
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
  const GROUP_ORDER = ['Classic', 'Tactical', 'Alternate Rules', 'Small Boards', 'Large Boards', 'Asymmetric', 'Other']

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
  return algebraicId(Math.floor(idx / cols), idx % cols, rows)
}

function algebraicToSq(alg, rows, cols) {
  return algebraicToIndex(alg, rows, cols)
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

  let aiPickMove = null
  if (opponent === 'ai') {
    const plugins = game.registry.getPlugins()
    const chessPlugin = plugins.find(p => p.sliceName === 'chess')
    if (chessPlugin) {
      const evaluate = variantConfig.evaluate
        ? (state, playerIdx) => {
            const base = chessEvaluate(state, playerIdx)
            return base + variantConfig.evaluate(state, { currentPlayer: playerIdx })
          }
        : chessEvaluate
      const simulator = createSimulator(chessPlugin, { playerCount: 2, evaluate })
      const minimax = createMinimax(simulator, { difficulty })
      aiPickMove = (g) => {
        const chessState = g.getState('chess')
        const playerIdx = g.playerSystem.getAll().indexOf(g.currentPlayer())
        return minimax.search(chessState, playerIdx)
      }
    }
  }

  const moveLog = []

  controller = createGameController(game, {
    players,
    aiPickMove,
    onRender: (g, state) => renderBoard(g, state, rows, cols, variantConfig),
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

function renderBoard(game, state, rows, cols, variantConfig) {
  if (!boardSvgContainer) return
  const chessState = game.getState('chess')
  if (!chessState) return

  const board = chessState.board
  const plugins = game.registry?.getPlugins ? game.registry.getPlugins() : []
  const chessPlugin = plugins.find(p => p.sliceName === 'chess')
  const vocabulary = chessPlugin?.vocabulary || {}
  const selected = state.selected
  const lastMove = state.lastMove
  const legalMoves = state.legalMoves || []

  const flipped = state.flipped
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
        const sym = pieceToFen(piece, vocabulary)
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
    for (const targetIdx of legalMoves.map(m => m.to)) {
      if (seenTargets.has(targetIdx)) continue
      seenTargets.add(targetIdx)
      const hasPiece = board[targetIdx] !== null
      let visualIdx = targetIdx
      if (flipped) {
        const r = Math.floor(targetIdx / cols)
        const c = targetIdx % cols
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
      labels: true,
      interactive: true,
    },
    setup: fen,
    pieces: { set: 'mce-fairy-complete' },
    meta: { label: '' },
  }
}

function pieceToFen(piece, vocabulary) {
  if (vocabulary && vocabulary[piece.type]) {
    return vocabulary[piece.type].symbols[piece.owner] || piece.type[0]
  }
  return piece.owner === 0 ? piece.type[0].toUpperCase() : piece.type[0].toLowerCase()
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
    updateURL()
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
