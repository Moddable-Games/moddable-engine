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

import '../packages/plugins/chess/index.js'
import '../packages/plugins/go/index.js'
import '../packages/plugins/draughts/index.js'
import '../packages/plugins/xiangqi/index.js'
import '../packages/plugins/shogi/index.js'

import { BOARD_THEMES, RULES_BASE, loadGalleryIndex, getGalleryIndex, loadVariantManifest, getManifestVariants } from './play-shared.js'
import { createCellAddressing } from './play-cells.js'
import { paintHighlight, paintIndicator, paintFog, createOverlay } from './play-overlays.js'
import { bindBoardInteraction } from './play-interaction.js'
import { renderHandPanel } from './play-hand.js'
import { renderRulesPanel } from './play-rules.js'
import { moveToSAN } from '../packages/plugins/chess/src/san.js'

const DIFFICULTIES = ['beginner', 'easy', 'medium', 'hard', 'expert']

function buildDefinitionFromResolved(family, variant, resolved, registryCfg) {
  const topo = resolved.topology || {}
  const topology = topo.type ? { type: topo.type, rows: topo.rows, cols: topo.cols } : undefined
  const players = resolved.players || ['white', 'black']
  const setup = resolved.setup || undefined

  const pluginConfig = {}
  if (setup) pluginConfig.setup = setup
  for (const [k, v] of Object.entries(registryCfg)) {
    if (typeof v === 'function') pluginConfig[k] = v
    else if (k === 'openingBook') pluginConfig[k] = v
  }

  const def = { title: resolved.meta?.label || variant, slug: variant, parent: family, engine: { players, plugins: { [family]: pluginConfig } } }
  if (topology) def.engine.topology = topology
  return def
}

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
    handContainer = null,
    opponent = 'human',
    difficulty = 'medium',
    theme = 'classic',
    colour = '0',
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
  const fogViewSide = parseInt(colour, 10) || 0

  function playerNames() {
    return game.raw.definition.players.names || []
  }

  function pluginFor() {
    return game.raw.registry.getPlugins().find(p => p.sliceName === family) || null
  }

  async function start() {
    scoring = null
    deadStones = []
    moveHistory = []

    const variantCfg = getVariantConfig(family, variant) || {}
    resolvedBoard = await resolveBoard(family, variantCfg)

    const frontmatterDef = buildDefinitionFromResolved(family, variant, resolvedBoard, variantCfg)
    game = createGameForFamily(family, { variant, definition: frontmatterDef })
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
      onChoiceNeeded: showChoiceDialog,
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
    const visibility = game.getVisibility(fogViewSide)
    let visibleSlice = slice
    if (visibility) {
      const board = slice.board.map((cell, i) => {
        if (!cell) return null
        const k = visibility.get(i)
        if (k === 'unknown') return null
        return cell
      })
      visibleSlice = { ...slice, board }
    }
    const rendered = { ...resolvedBoard, setup: boardToSetup(visibleSlice, resolvedBoard.topology) }
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
      const overlay = createOverlay()

      if (lastMove) {
        if (lastMove.from !== null && lastMove.from !== undefined) paintHighlight(overlay, cells.bbox(lastMove.from, container), theme.lastMove)
        if (lastMove.to !== null && lastMove.to !== undefined) paintHighlight(overlay, cells.bbox(lastMove.to, container), theme.lastMove)
      }

      if (selected !== null && selected !== undefined) {
        paintHighlight(overlay, cells.bbox(selected, container), theme.highlight)
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
        paintIndicator(overlay, cells.bbox(target, container), hasPiece ? theme.ring : theme.dot, hasPiece)
      }

      if (visibility) {
        for (const [pos, knowledge] of visibility) {
          if (knowledge === 'unknown') {
            const bbox = cells.bbox(pos, container)
            if (bbox) paintFog(overlay, bbox)
          }
        }
      }

      const piecesGroup = svgEl.querySelector('g[pointer-events="none"]')
      if (piecesGroup) svgEl.insertBefore(overlay, piecesGroup)
      else svgEl.appendChild(overlay)
    }

    bindBoardInteraction(container, cells, {
      onCellClick: (key) => {
        if (scoring) toggleDead(key)
        else ctrl.handleClick(key)
      },
    })

    renderHand(slice, state)
  }

  function renderHand(slice, state) {
    if (!handContainer || !slice.hands) return
    const names = playerNames()
    const currentIdx = names.indexOf(game.currentPlayer())
    const plugin = pluginFor()
    const vocab = plugin?.vocabulary || {}
    const gallery = getGalleryIndex() || []
    const pieceSet = resolvedBoard.pieces?.set

    const sides = names.map((name, idx) => {
      const hand = slice.hands[idx] || []
      const counted = {}
      for (const t of hand) counted[t] = (counted[t] || 0) + 1
      const pieces = Object.entries(counted).map(([type, count]) => {
        const entry = vocab[type]
        const symbol = entry?.symbols?.[idx]
        let image = null
        if (pieceSet && gallery && symbol) {
          const sets = Array.isArray(gallery) ? gallery : (gallery.sets || [])
          const set = sets.find(s => s.id === pieceSet || s.slug === pieceSet)
          if (set && set.path) {
            image = `../pieces/sets/${set.path}/${symbol}.svg`
          }
        }
        return { id: type, label: symbol || type, image, count }
      })
      return { id: name, label: name, pieces }
    })

    const dropType = state.dropType || null
    const isHuman = !state.aiThinking
    renderHandPanel(handContainer, {
      sides,
      armed: dropType,
      enabledFor: isHuman ? names[currentIdx] : null,
      onArm: (pieceType) => ctrl.handleHandClick(pieceType),
    })
  }

  function showChoiceDialog(choices, player, resolve) {
    const dialog = document.createElement('div')
    dialog.className = 'game-play-choice-dialog'
    for (const choice of choices) {
      const btn = document.createElement('button')
      btn.className = 'choice-btn'
      btn.textContent = choice[0].toUpperCase() + choice.slice(1)
      btn.addEventListener('click', () => {
        dialog.remove()
        resolve(choice)
      })
      dialog.appendChild(btn)
    }
    container.appendChild(dialog)
  }

  function findCell(idx) {
    return cells.find(idx, container)
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
    if (family === 'chess') {
      const slice = game.getState().slice
      const topo = resolvedBoard?.topology
      return moveToSAN(move, slice.board, topo)
    }
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
  await loadVariantManifest()
  const registryVariants = listVariants(family)
  const registeredKeys = new Set(registryVariants.map(v => v.key))
  const manifestVariants = getManifestVariants(family, registeredKeys)
  const variants = [...registryVariants, ...manifestVariants.filter(v => !registeredKeys.has(v.key))]
  const variant = variants.some(v => v.key === params.variant)
    ? params.variant
    : (variants[0] && variants[0].key)

  const sidebar = document.createElement('aside')
  sidebar.className = 'game-play-sidebar'

  const boardArea = document.createElement('div')
  boardArea.className = 'game-play-board'

  const handEl = document.createElement('div')
  handEl.className = 'game-play-hand'

  container.appendChild(sidebar)
  container.appendChild(boardArea)
  container.appendChild(handEl)

  const variantSelect = buildSelect(sidebar, 'Variant', variants.map(v => ({ value: v.key, label: v.label })), variant)
  const opponentSelect = buildSelect(sidebar, 'Opponent', [
    { value: 'human', label: 'Human vs Human' },
    { value: 'ai', label: 'vs AI' },
  ], params.opponent === 'ai' ? 'ai' : 'human')
  const difficultySelect = buildSelect(sidebar, 'Difficulty', DIFFICULTIES.map(d => ({ value: d, label: d[0].toUpperCase() + d.slice(1) })), params.difficulty || 'medium')
  const colourSelect = buildSelect(sidebar, 'Play as', [
    { value: '0', label: 'White' },
    { value: '1', label: 'Black' },
  ], params.colour || '0')
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
    handContainer: handEl,
    opponent: opponentSelect.value === 'ai' ? 'ai' : 'human',
    difficulty: difficultySelect.value,
    theme: themeSelect.value,
    embed: params.embed ? bridge : null,
    onStatus: updateStatus,
  }

  function updateRules(variantKey) {
    const vConfig = getVariantConfig(family, variantKey)
    renderRulesPanel(rulesEl, vConfig || {})
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
  colourSelect.addEventListener('change', () => restart({ colour: colourSelect.value }))
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
