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
import { boardToSetup as serialiseBoard } from '../packages/play/src/serialise.js'

import '../packages/plugins/go/index.js'
import '../packages/plugins/draughts/index.js'
import '../packages/plugins/xiangqi/index.js'
import '../packages/plugins/shogi/index.js'

import { BOARD_THEMES, RULES_BASE, loadGalleryIndex, getGalleryIndex } from './play-shared.js'
import { createCellAddressing } from './play-cells.js'

const DIFFICULTIES = ['beginner', 'easy', 'medium', 'hard', 'expert']

async function resolveBoard(family, variantConfig) {
  const basePath = RULES_BASE + 'games/'
  const variantSlug = variantConfig.key || 'standard'
  const familyPath = family + '/content/rulebook.md'
  const variantPath = family + '/content/variants/' + variantSlug + '.md'

  const [familyMd, variantMd] = await Promise.all([
    fetch(basePath + familyPath).then(r => r.text()),
    fetch(basePath + variantPath).then(r => r.text()).catch(() => ''),
  ])

  const familyFm = parseFrontmatter(familyMd).meta || {}
  const variantFm = variantMd ? (parseFrontmatter(variantMd).meta || {}) : {}
  const surfaceRef = variantFm.engine?.surface || familyFm.engine?.surface
  const surface = resolveSurface(surfaceRef)
  const { resolved } = cascadeResolve({
    surface,
    family: { engine: familyFm.engine || {}, meta: { label: familyFm.title || '' } },
    variant: { engine: variantFm.engine || {}, meta: { label: variantFm.title || variantConfig.label || '' } },
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
  let cells = null
  let moveHistory = []

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
    moveHistory = []

    const variantCfg = getVariantConfig(family, variant) || {}
    resolvedBoard = await resolveBoard(family, variantCfg)
    const topo = resolvedBoard.topology
    cells = createCellAddressing({
      rows: topo.rows || 19,
      cols: topo.cols || 19,
      idStyle: resolvedBoard.render?.idStyle || 'algebraic',
    })
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
      onRender: (game, state) => draw(state),
      onTurnChange: (player) => {
        if (onStatus) onStatus({ text: `${player} to move`, gameOver: false })
      },
      onGameEnd: handleGameEnd,
      onMove: (move, player) => {
        moveHistory.push({ move, player, notation: moveToNotation(move) })
        if (onStatus) onStatus({ text: `${game.currentPlayer()} to move`, gameOver: false, lastMove: moveToNotation(move) })
        if (embed) embed.post('move', { move, state: summarise() })
      },
    })

    if (onStatus) onStatus({ text: `${game.currentPlayer()} to move`, gameOver: false })

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
    const names = playerNames()
    const text = result === 'draw' ? 'Draw'
      : names.includes(result) ? `${result} wins!`
      : result
    report(text, true)
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

  function draw(state = {}) {
    if (!container || !ctrl || !resolvedBoard) return

    const { selected, lastMove, legalMoves = [] } = state
    const slice = game.getState().slice
    const rendered = { ...resolvedBoard, setup: boardToSetup(slice, resolvedBoard.topology) }
    const gallery = getGalleryIndex() || []
    const pieceResult = attachPieceImages(rendered, gallery)
    const svg = renderFromEngine(rendered, {
      pieceImages: pieceResult.images || {},
      pieceSurfaceMap: pieceResult.surfaceMap || {},
      pieceSurface: pieceResult.surface || null,
    })

    if (!svg) return
    container.innerHTML = svg

    const svgEl = container.querySelector('svg')
    if (svgEl) {
      const theme = BOARD_THEMES[currentTheme] || BOARD_THEMES.classic
      const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      overlay.setAttribute('class', 'highlights')
      overlay.setAttribute('pointer-events', 'none')

      if (lastMove) {
        if (lastMove.from !== null && lastMove.from !== undefined) highlightCell(overlay, lastMove.from, theme.lastMove)
        if (lastMove.to !== null && lastMove.to !== undefined) highlightCell(overlay, lastMove.to, theme.lastMove)
      }

      if (selected !== null && selected !== undefined) {
        highlightCell(overlay, selected, theme.highlight)
      }

      const board = slice.board || []
      const topo = resolvedBoard.topology
      const seenTargets = new Set()
      for (const m of legalMoves) {
        const target = m.to !== undefined ? m.to : m.coord
        if (target === undefined || target < 0 || target >= (topo.rows * topo.cols)) continue
        if (seenTargets.has(target)) continue
        seenTargets.add(target)
        const hasPiece = !!board[target]
        addMoveIndicator(overlay, target, hasPiece ? theme.ring : theme.dot, hasPiece)
      }

      const piecesGroup = svgEl.querySelector('g[pointer-events="none"]')
      if (piecesGroup) svgEl.insertBefore(overlay, piecesGroup)
      else svgEl.appendChild(overlay)
    }

    let hoverEl = null
    for (const cell of container.querySelectorAll('.board-cell')) {
      cell.style.cursor = 'pointer'
      cell.addEventListener('click', () => {
        const sq = cell.getAttribute('data-sq')
        const key = coerceKey(sq)
        if (scoring) toggleDead(key)
        else ctrl.handleClick(key)
      })
      cell.addEventListener('mouseenter', () => {
        if (hoverEl) { hoverEl.remove(); hoverEl = null }
        const bbox = cell.getBBox ? cell.getBBox() : null
        if (!bbox) return
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        el.setAttribute('x', bbox.x)
        el.setAttribute('y', bbox.y)
        el.setAttribute('width', bbox.width)
        el.setAttribute('height', bbox.height)
        el.setAttribute('fill', 'rgba(100, 180, 255, 0.15)')
        el.setAttribute('pointer-events', 'none')
        el.setAttribute('class', 'board-cell-hover')
        cell.parentNode.insertBefore(el, cell.nextSibling)
        hoverEl = el
      })
      cell.addEventListener('mouseleave', () => {
        if (hoverEl) { hoverEl.remove(); hoverEl = null }
      })
    }
  }

  function findCell(idx) {
    return cells.find(idx, container)
  }

  function highlightCell(overlay, idx, color) {
    const cell = findCell(idx)
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

  function addMoveIndicator(overlay, idx, color, isCapture) {
    const cell = findCell(idx)
    if (!cell) return
    const bbox = cell.getBBox ? cell.getBBox() : null
    if (!bbox) return
    const cx = bbox.x + bbox.width / 2
    const cy = bbox.y + bbox.height / 2
    if (isCapture) {
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      ring.setAttribute('x', bbox.x)
      ring.setAttribute('y', bbox.y)
      ring.setAttribute('width', bbox.width)
      ring.setAttribute('height', bbox.height)
      ring.setAttribute('fill', color)
      overlay.appendChild(ring)
    } else {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      dot.setAttribute('cx', cx)
      dot.setAttribute('cy', cy)
      dot.setAttribute('r', bbox.width * 0.16)
      dot.setAttribute('fill', color)
      overlay.appendChild(dot)
    }
  }

  function coerceKey(raw) {
    const asNumber = Number(raw)
    if (!Number.isNaN(asNumber)) return asNumber
    if (!raw || raw.length < 2) return raw
    const idx = cells.toIndex(raw)
    return idx >= 0 ? idx : raw
  }

  // Driven by the vocabulary the plugin declares rather than by a family branch.
  // When this was inline, draughts men serialised to symbols that resolved to
  // chess artwork and nothing caught it.
  function boardToSetup(slice, topo) {
    return serialiseBoard(slice, topo, (pluginFor() || {}).vocabulary || {})
  }

  function moveToNotation(move) {
    if (move.action) return move.action
    if (move.coord !== undefined) {
      return cells.toId(move.coord) || String(move.coord)
    }
    const from = cells.toId(move.from) || String(move.from)
    const to = cells.toId(move.to) || String(move.to)
    const sep = move.captures && move.captures.length > 0 ? 'x' : '-'
    return `${from}${sep}${to}`
  }

  function getFEN() {
    if (!game || !resolvedBoard) return ''
    return boardToSetup(game.getState().slice, resolvedBoard.topology)
  }

  const session = {
    get controller() { return ctrl },
    get game() { return game },
    get scoring() { return scoring },
    get history() { return moveHistory },
    get fen() { return getFEN() },
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

  const rulesEl = document.createElement('div')
  rulesEl.className = 'game-play-rules'
  sidebar.appendChild(rulesEl)

  const statusEl = document.createElement('div')
  statusEl.className = 'game-play-status'
  sidebar.appendChild(statusEl)

  const actionsEl = document.createElement('div')
  actionsEl.className = 'game-play-actions'
  sidebar.appendChild(actionsEl)

  const historyEl = document.createElement('div')
  historyEl.className = 'game-play-history'
  sidebar.appendChild(historyEl)

  const exportEl = document.createElement('div')
  exportEl.className = 'game-play-export'
  const fenBtn = document.createElement('button')
  fenBtn.className = 'btn'
  fenBtn.textContent = 'Copy FEN'
  fenBtn.addEventListener('click', () => {
    if (session) navigator.clipboard.writeText(session.fen).then(() => { fenBtn.textContent = 'Copied'; setTimeout(() => { fenBtn.textContent = 'Copy FEN' }, 1500) })
  })
  exportEl.appendChild(fenBtn)
  sidebar.appendChild(exportEl)

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

  function updateRules(variantKey) {
    const vConfig = getVariantConfig(family, variantKey)
    if (!vConfig) { rulesEl.innerHTML = ''; return }
    const parts = []
    if (vConfig.rule) parts.push(`<span class="rules-badge">${vConfig.rule}</span>`)
    if (vConfig.description) parts.push(`<p class="rules-desc">${vConfig.description}</p>`)
    rulesEl.innerHTML = parts.join('')
  }

  function updateStatus(info) {
    statusEl.textContent = info.text || ''
    statusEl.classList.toggle('game-over', !!info.gameOver)
    renderActions()
    renderHistory()
  }

  function renderHistory() {
    if (!session) { historyEl.innerHTML = ''; return }
    const moves = session.history
    if (moves.length === 0) { historyEl.innerHTML = ''; return }
    const pairs = []
    for (let i = 0; i < moves.length; i += 2) {
      const num = Math.floor(i / 2) + 1
      const w = moves[i]?.notation || ''
      const b = moves[i + 1]?.notation || ''
      pairs.push(`<span class="move-pair">${num}. ${w} ${b}</span>`)
    }
    historyEl.innerHTML = pairs.join(' ')
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

  function updateURL() {
    const params = new URLSearchParams(location.search)
    params.set('family', family)
    if (config.variant) params.set('variant', config.variant)
    else params.delete('variant')
    if (config.opponent === 'ai') params.set('opponent', 'ai')
    else params.delete('opponent')
    if (config.difficulty && config.difficulty !== 'medium') params.set('difficulty', config.difficulty)
    else params.delete('difficulty')
    if (config.theme && config.theme !== 'classic') params.set('theme', config.theme)
    else params.delete('theme')
    history.replaceState(null, '', '?' + params.toString())
  }

  async function restart(changes) {
    config = { ...config, ...changes }
    updateRules(config.variant)
    updateURL()
    session = createPlaySession(config)
    await session.start()
    renderActions()
  }

  variantSelect.addEventListener('change', () => restart({ variant: variantSelect.value }))
  opponentSelect.addEventListener('change', () => restart({ opponent: opponentSelect.value }))
  difficultySelect.addEventListener('change', () => restart({ difficulty: difficultySelect.value }))
  themeSelect.addEventListener('change', () => { config.theme = themeSelect.value; session.setTheme(themeSelect.value); updateURL() })

  await restart({})
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
