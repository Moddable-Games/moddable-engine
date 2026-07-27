import { createGameForFamily } from '../packages/play/src/play.js'
import { createGameController } from '../packages/play/src/game-controller.js'
import { listVariants, getVariantConfig } from '../packages/play/src/variant-registry.js'
import { createAI } from '../packages/play/src/sdk.js'
import { interactionModelFor, FAMILY_INTERACTION } from '../packages/play/src/interaction.js'
import { createEmbedBridge, parseEmbedParams, normaliseOutcome } from '../packages/play/src/embed.js'
import { renderFromEngine, attachPieceImages } from '../packages/render/src/render-engine.js'
import { resolveSurface } from '../packages/schema/src/surfaces.js'
import { resolve as cascadeResolve } from '../packages/schema/src/cascade-resolver.js'
import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'

import '../packages/plugins/go/index.js'
import '../packages/plugins/draughts/index.js'

const BOARD_THEMES = {
  classic: { label: 'Classic' },
  cosmic: { label: 'Cosmic Dark' },
  wood: { label: 'Classic Wood' },
  marble: { label: 'Marble' },
  neon: { label: 'Neon' },
  minimal: { label: 'Minimal' },
}

const DIFFICULTIES = ['beginner', 'easy', 'medium', 'hard', 'expert']

const RULES_BASE = location.hostname === 'engine.moddable.games'
  ? 'https://rules.moddable.games/'
  : '../../moddable-rules/'

let galleryIndex = null
async function loadGalleryIndex() {
  if (galleryIndex) return galleryIndex
  try { galleryIndex = await fetch('../pieces/gallery-index.json').then(r => r.json()) }
  catch { galleryIndex = [] }
  return galleryIndex
}

async function loadFamilyConfig(family) {
  const basePath = RULES_BASE + 'games/'
  const familyMd = await fetch(basePath + family + '/content/rulebook.md').then(r => r.text())
  const familyFm = parseFrontmatter(familyMd).meta || {}
  return familyFm
}

async function resolveBoard(family, variantConfig) {
  const familyFm = await loadFamilyConfig(family)
  const familyEngine = familyFm.engine || {}
  const size = variantConfig.size || variantConfig.rows || familyEngine.topology?.rows || 19
  const cols = variantConfig.cols || variantConfig.size || familyEngine.topology?.cols || size
  const variantEngine = {
    topology: { ...familyEngine.topology, rows: size, cols },
  }
  const surfaceRef = familyEngine.surface
  const surface = resolveSurface(surfaceRef)
  const { resolved } = cascadeResolve({
    surface,
    family: { engine: familyEngine, meta: { label: familyFm.title || '' } },
    variant: { engine: variantEngine, meta: { label: variantConfig.label || '' } },
  })
  return resolved
}

export function createPlaySession(options = {}) {
  const {
    family,
    variant,
    container,
    opponent = 'human',
    difficulty = 'medium',
    theme = 'classic',
    embed = null,
    onStatus = null,
  } = options

  let game = null
  let ctrl = null
  let ai = null
  let scoring = null
  let deadStones = []
  let currentTheme = theme
  let resolvedBoard = null

  function playerNames() {
    return game.raw.definition.players.names || []
  }

  function pluginFor() {
    return game.raw.registry.getPlugins().find(p => p.sliceName === family) || null
  }

  async function start() {
    game = createGameForFamily(family, { variant })
    scoring = null
    deadStones = []

    const variantCfg = getVariantConfig(family, variant) || {}
    resolvedBoard = await resolveBoard(family, variantCfg)
    await loadGalleryIndex()

    ai = opponent === 'ai'
      ? createAI(family, variant, { difficulty })
      : null

    const names = playerNames()
    const players = {}
    for (let i = 0; i < names.length; i++) {
      players[names[i]] = (ai && i === 1) ? 'ai' : 'human'
    }

    ctrl = createGameController(game.raw, {
      family,
      players,
      aiDifficulty: difficulty,
      aiPickMove: ai
        ? () => ai.pickMove(game.getState().slice, currentPlayerIndex())
        : null,
      onRender: draw,
      onGameEnd: handleGameEnd,
      onMove: (move) => {
        if (embed) embed.post('move', { move, state: summarise() })
      },
    })

    if (embed) embed.post('ready', { family, variant, state: summarise() })
    draw()
    return session
  }

  function currentPlayerIndex() {
    return playerNames().indexOf(game.currentPlayer())
  }

  function handleGameEnd(outcome) {
    const result = normaliseOutcome(outcome, playerNames())
    if (result === 'scoring') {
      enterScoringPhase()
      return
    }
    report(result, true)
  }

  function enterScoringPhase() {
    const plugin = pluginFor()
    if (!plugin || typeof plugin.score !== 'function') {
      report('scoring', false)
      return
    }
    scoring = plugin.score({ ...game.getState().slice, deadStones })
    report(`${scoring.winner} by ${scoring.margin}`, true)
    draw()
  }

  function toggleDead(cell) {
    const idx = deadStones.indexOf(cell)
    if (idx === -1) deadStones.push(cell)
    else deadStones.splice(idx, 1)
    enterScoringPhase()
  }

  function report(text, gameOver) {
    if (onStatus) onStatus({ text, gameOver, scoring })
    if (embed) embed.post('status', { text, gameOver, family, variant })
  }

  function summarise() {
    const state = game.getState()
    return {
      family,
      variant,
      currentPlayer: state.currentPlayer,
      slice: state.slice,
    }
  }

  function draw() {
    if (!container || !ctrl || !resolvedBoard) return

    const slice = game.getState().slice
    const rendered = { ...resolvedBoard, setup: boardToFen(slice, resolvedBoard.topology) }
    const gallery = galleryIndex || []
    const pieceResult = attachPieceImages(rendered, gallery)
    const svg = renderFromEngine(rendered, {
      pieceImages: pieceResult.images || {},
      pieceSurfaceMap: pieceResult.surfaceMap || {},
      pieceSurface: pieceResult.surface || null,
    })

    if (!svg) return
    container.innerHTML = svg

    for (const cell of container.querySelectorAll('.board-cell')) {
      cell.style.cursor = 'pointer'
      cell.addEventListener('click', () => {
        const sq = cell.getAttribute('data-sq')
        const key = coerceKey(sq)
        if (scoring) toggleDead(key)
        else ctrl.handleClick(key)
      })
    }
  }

  function coerceKey(raw) {
    const asNumber = Number(raw)
    if (!Number.isNaN(asNumber)) return asNumber
    if (!raw || raw.length < 2) return raw
    return algebraicToIndex(raw, resolvedBoard.topology)
  }

  function algebraicToIndex(sq, topo) {
    const cols = topo.cols || 19
    const rows = topo.rows || 19
    const idStyle = topo.layout === 'intersections' ? 'go' : 'algebraic'
    const alpha = idStyle === 'go' ? 'abcdefghjklmnopqrst' : 'abcdefghijklmnopqrstuvwxyz'
    const c = alpha.indexOf(sq[0])
    const r = rows - parseInt(sq.slice(1), 10)
    if (c < 0 || r < 0 || r >= rows) return sq
    return r * cols + c
  }

  function boardToFen(slice, topo) {
    const board = slice.board || []
    if (!Array.isArray(board)) return ''
    const cols = topo.cols || Math.round(Math.sqrt(board.length))
    const rows = topo.rows || Math.round(board.length / cols)
    const fenRows = []
    for (let r = 0; r < rows; r++) {
      let row = ''
      let empty = 0
      for (let c = 0; c < cols; c++) {
        const cell = board[r * cols + c]
        if (!cell) { empty++; continue }
        if (empty > 0) { row += empty; empty = 0 }
        row += cellToFenChar(cell)
      }
      if (empty > 0) row += empty
      fenRows.push(row)
    }
    return fenRows.join('/')
  }

  function cellToFenChar(cell) {
    if (typeof cell === 'string') {
      return cell === 'black' ? 'b' : 'w'
    }
    if (cell.type === 'king') {
      return cell.owner === 0 ? 'W' : 'B'
    }
    return cell.owner === 0 ? 'w' : 'b'
  }

  const session = {
    get controller() { return ctrl },
    get game() { return game },
    get scoring() { return scoring },
    start,
    draw,
    summarise,
    pass: () => ctrl.performAction('pass'),
    resign: () => ctrl.performAction('resign'),
    undo: () => ctrl.undo(),
    actions: () => ctrl.getAvailableActions(),
    setTheme(next) {
      if (BOARD_THEMES[next]) { currentTheme = next; draw() }
    },
    markDead: toggleDead,
  }

  return session
}

export async function initGamePlay(container, defaults = {}) {
  const params = parseEmbedParams(location.search, { family: 'go', ...defaults })
  const family = params.family
  const variants = listVariants(family)
  const variant = variants.some(v => v.key === params.variant)
    ? params.variant
    : (variants[0] && variants[0].key)

  const sidebar = document.createElement('aside')
  sidebar.className = 'game-play-sidebar'

  const boardArea = document.createElement('div')
  boardArea.className = 'game-play-board'

  container.appendChild(sidebar)
  container.appendChild(boardArea)

  const variantSelect = buildSelect(sidebar, 'Variant', variants.map(v => ({ value: v.key, label: v.label })), variant)
  const opponentSelect = buildSelect(sidebar, 'Opponent', [
    { value: 'human', label: 'Human vs Human' },
    { value: 'ai', label: 'vs AI' },
  ], params.opponent === 'ai' ? 'ai' : 'human')
  const difficultySelect = buildSelect(sidebar, 'Difficulty', DIFFICULTIES.map(d => ({ value: d, label: d[0].toUpperCase() + d.slice(1) })), params.difficulty || 'medium')
  const themeSelect = buildSelect(sidebar, 'Theme', Object.entries(BOARD_THEMES).map(([k, v]) => ({ value: k, label: v.label })), params.theme || 'classic')

  const statusEl = document.createElement('div')
  statusEl.className = 'game-play-status'
  sidebar.appendChild(statusEl)

  const actionsEl = document.createElement('div')
  actionsEl.className = 'game-play-actions'
  sidebar.appendChild(actionsEl)

  let session = null

  const bridge = createEmbedBridge({
    family,
    enabled: params.embed,
    namespace: 'game',
    legacyNamespace: family,
    handlers: {
      newGame: () => session.start(),
      setVariant: (data) => { if (data.variant) restart({ variant: data.variant }) },
      setDifficulty: (data) => restart({ difficulty: data.difficulty, opponent: 'ai' }),
      setOpponent: (data) => restart({ opponent: data.opponent }),
      setTheme: (data) => session.setTheme(data.theme),
      undo: () => session.undo(),
      pass: () => session.pass(),
      resign: () => session.resign(),
      requestState: () => bridge.post('state', { state: session.summarise() }),
    },
  })

  let config = {
    family,
    variant,
    container: boardArea,
    opponent: opponentSelect.value === 'ai' ? 'ai' : 'human',
    difficulty: difficultySelect.value,
    theme: themeSelect.value,
    embed: params.embed ? bridge : null,
    onStatus: updateStatus,
  }

  function updateStatus(info) {
    statusEl.textContent = info.text || ''
    statusEl.classList.toggle('game-over', !!info.gameOver)
    renderActions()
  }

  function renderActions() {
    actionsEl.innerHTML = ''
    if (!session) return
    const actions = session.actions()
    for (const action of actions) {
      const btn = document.createElement('button')
      btn.className = 'btn'
      btn.textContent = action[0].toUpperCase() + action.slice(1)
      btn.addEventListener('click', () => session.controller.performAction(action))
      actionsEl.appendChild(btn)
    }
    const undoBtn = document.createElement('button')
    undoBtn.className = 'btn'
    undoBtn.textContent = 'Undo'
    undoBtn.addEventListener('click', () => session.undo())
    actionsEl.appendChild(undoBtn)

    const newBtn = document.createElement('button')
    newBtn.className = 'btn'
    newBtn.textContent = 'New Game'
    newBtn.addEventListener('click', () => restart({}))
    actionsEl.appendChild(newBtn)
  }

  function restart(changes) {
    config = { ...config, ...changes }
    session = createPlaySession(config)
    session.start()
    renderActions()
  }

  variantSelect.addEventListener('change', () => restart({ variant: variantSelect.value }))
  opponentSelect.addEventListener('change', () => restart({ opponent: opponentSelect.value }))
  difficultySelect.addEventListener('change', () => restart({ difficulty: difficultySelect.value }))
  themeSelect.addEventListener('change', () => session.setTheme(themeSelect.value))

  restart({})
  return session
}

function buildSelect(parent, label, options, selected) {
  const group = document.createElement('div')
  group.className = 'control-group'
  const lbl = document.createElement('label')
  lbl.className = 'control-label'
  lbl.textContent = label
  const sel = document.createElement('select')
  for (const opt of options) {
    const o = document.createElement('option')
    o.value = opt.value
    o.textContent = opt.label
    if (opt.value === selected) o.selected = true
    sel.appendChild(o)
  }
  group.appendChild(lbl)
  group.appendChild(sel)
  parent.appendChild(group)
  return sel
}

export { BOARD_THEMES, DIFFICULTIES, FAMILY_INTERACTION, getVariantConfig }
