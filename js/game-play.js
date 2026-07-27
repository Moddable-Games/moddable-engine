import { createGameForFamily } from '../packages/play/src/play.js'
import { createGameController } from '../packages/play/src/game-controller.js'
import { renderInteractiveBoard, marksForState } from '../packages/play/src/board-view.js'
import { listVariants, getVariantConfig } from '../packages/play/src/variant-registry.js'
import { createAI } from '../packages/play/src/sdk.js'
import { interactionModelFor, FAMILY_INTERACTION } from '../packages/play/src/interaction.js'
import { createEmbedBridge, parseEmbedParams, normaliseOutcome } from '../packages/play/src/embed.js'

import '../packages/plugins/go/index.js'
import '../packages/plugins/draughts/index.js'

const BOARD_THEMES = {
  classic: { light: '#f0d9b5', dark: '#b58863', label: 'Classic' },
  cosmic: { light: '#2d3760', dark: '#141c37', label: 'Cosmic Dark' },
  wood: { light: '#deb887', dark: '#8b5e3c', label: 'Classic Wood' },
  marble: { light: '#f2f0ec', dark: '#b8b5af', label: 'Marble' },
  neon: { light: '#1a1a2e', dark: '#0f0f1a', label: 'Neon' },
  minimal: { light: '#fafafa', dark: '#e8e8e8', label: 'Minimal' },
}

const DIFFICULTIES = ['beginner', 'easy', 'medium', 'hard', 'expert']

const LAYOUT_OPTS = {
  go: { mode: 'intersections' },
  hex: { mode: 'intersections' },
}

function layoutOptsFor(family) {
  return LAYOUT_OPTS[family] || {}
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

  function playerNames() {
    return game.raw.definition.players.names || []
  }

  function pluginFor() {
    return game.raw.registry.getPlugins().find(p => p.sliceName === family) || null
  }

  function start() {
    game = createGameForFamily(family, { variant })
    scoring = null
    deadStones = []

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

  function legalTargets() {
    const state = ctrl.getState()
    if (state.selected === null || state.selected === undefined) return []
    const model = interactionModelFor(family)
    return model.targetsFor(state.selected, ctrl.getLegalMoves()).map(m => m.to)
  }

  function draw() {
    if (!container || !ctrl) return
    const layout = game.raw.getLayout(layoutOptsFor(family))
    if (!layout) return

    const state = ctrl.getState()
    const slice = game.getState().slice
    const marks = marksForState(state, legalTargets())

    for (const cell of deadStones) marks.push({ key: cell, type: 'dead' })

    container.innerHTML = renderInteractiveBoard(layout, {
      pieces: piecesFrom(slice),
      marks,
      colors: {
        lightCell: BOARD_THEMES[currentTheme].light,
        darkCell: BOARD_THEMES[currentTheme].dark,
      },
    })

    for (const target of container.querySelectorAll('.hit-target')) {
      target.addEventListener('click', () => {
        const key = coerceKey(target.getAttribute('data-cell'))
        if (scoring) toggleDead(key)
        else ctrl.handleClick(key)
      })
    }
  }

  function coerceKey(raw) {
    const asNumber = Number(raw)
    return Number.isNaN(asNumber) ? raw : asNumber
  }

  function piecesFrom(slice) {
    const pieces = {}
    const board = slice.board || []
    const names = playerNames()

    if (Array.isArray(board)) {
      for (let i = 0; i < board.length; i++) {
        const cell = board[i]
        if (!cell) continue
        pieces[String(i)] = describePiece(cell, names)
      }
    } else {
      for (const [key, cell] of Object.entries(board)) {
        if (cell) pieces[key] = describePiece(cell, names)
      }
    }
    return pieces
  }

  function describePiece(cell, names) {
    if (typeof cell === 'string') {
      return { color: cell === 'black' ? 'black' : 'white', type: 'stone' }
    }
    const ownerIndex = typeof cell.owner === 'number' ? cell.owner : names.indexOf(cell.owner)
    return {
      color: ownerIndex === 0 ? 'white' : 'black',
      type: cell.type || null,
      label: cell.type === 'king' ? 'K' : null,
    }
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
