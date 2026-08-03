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

import { BOARD_THEMES, RULES_BASE, ANIM_THEME, CAPTURE_BURST_THEME, loadGalleryIndex, getGalleryIndex, loadVariantManifest, getManifestVariants } from './play-shared.js'
import { createCellAddressing } from './play-cells.js'
import { paintHighlight, paintIndicator, paintFog, paintEffect, createOverlay } from './play-overlays.js'
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

  const PLAY_ONLY_KEYS = new Set(['key', 'label', 'title', 'group', 'description', 'rule', 'board', 'extends', 'hidden', 'render', 'playerNames', 'definition', 'topology', 'rows', 'cols', 'size', 'players'])
  const pluginConfig = {}
  if (setup) pluginConfig.setup = setup
  for (const [k, v] of Object.entries(registryCfg)) {
    if (PLAY_ONLY_KEYS.has(k)) continue
    pluginConfig[k] = v
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
    capturedContainer = null,
    opponent = 'human',
    difficulty = 'medium',
    theme = 'classic',
    colour = '0',
    pieceSet = 'auto',
    embed = null,
    onStatus = null,
    onCapture = null,
  } = options

  let game = null
  let ctrl = null
  let ai = null
  let scoring = null
  let deadStones = []
  let currentTheme = theme
  let currentPieceSet = pieceSet
  let captured = { 0: [], 1: [] }
  let flipped = false
  let currentAnimStyle = options.animStyle || ANIM_THEME.defaultStyle
  let currentAnimSpeed = options.animSpeed || ANIM_THEME.defaultSpeed
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
        const isCapture = move.capture || (move.captures && move.captures.length > 0) || move.enPassant
        if (isCapture && onCapture) onCapture(move)
        if (isCapture && move.to !== undefined) captureBurst(move.to)
        if (onStatus) onStatus({ text: `${game.currentPlayer()} to move`, gameOver: false, lastMove: moveToNotation(move) })
        if (embed) embed.post('move', { move, state: summarise() })
      },
      onAnimateMove: (move, state, done) => {
        const variantCfg = getVariantConfig(family, variant) || {}
        if (variantCfg.visibility) { done(); return }
        const duration = ANIM_THEME.speeds[currentAnimSpeed] || 0
        if (duration <= 0) { done(); return }
        animateMove(move, duration, done)
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
    if (currentPieceSet !== 'auto') {
      rendered.pieces = { ...rendered.pieces, set: currentPieceSet }
    }
    const variantCfg = getVariantConfig(family, variant) || {}
    if (variantCfg.render?.fenMap) {
      rendered.pieces = { ...rendered.pieces, fenMap: variantCfg.render.fenMap }
    }
    const gallery = getGalleryIndex() || []
    const pieceResult = attachPieceImages(rendered, gallery)
    const pieceImages = pieceResult.images || {}
    if (variantCfg.render?.imagePaths) {
      for (const [fenChar, path] of Object.entries(variantCfg.render.imagePaths)) {
        pieceImages[fenChar] = path
      }
    }
    const svg = renderFromEngine(rendered, {
      pieceImages,
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

      if (slice.effects && slice.effects.length > 0) {
        for (const effect of slice.effects) {
          const bbox = cells.bbox(effect.sq, container)
          if (bbox) paintEffect(overlay, bbox, effect)
        }
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
    if (!handContainer) return
    const hasHands = slice.hands && slice.hands.some(h => h && h.length > 0)
    const hasPlacement = slice._phase === 'placement' && slice._toPlace
    if (!hasHands && !hasPlacement) return
    const names = playerNames()
    const currentIdx = names.indexOf(game.currentPlayer())
    const plugin = pluginFor()
    const vocab = plugin?.vocabulary || {}
    const gallery = getGalleryIndex() || []
    const rendered = { ...resolvedBoard, pieces: { ...resolvedBoard.pieces } }
    if (currentPieceSet !== 'auto') rendered.pieces.set = currentPieceSet
    const pieceResult = attachPieceImages(rendered, gallery)
    const pieceImages = pieceResult.images || {}

    const sides = names.map((name, idx) => {
      const source = hasPlacement ? (slice._toPlace[idx] || []) : (slice.hands?.[idx] || [])
      const counted = {}
      for (const t of source) counted[t] = (counted[t] || 0) + 1
      const pieces = Object.entries(counted).map(([type, count]) => {
        const entry = vocab[type]
        const symbol = entry?.symbols?.[idx]
        const pieceId = symbol ? (idx === 0 ? 'w' : 'b') + symbol.toUpperCase() : null
        const image = pieceImages[pieceId] || pieceImages[symbol] || null
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

  function animateMove(move, duration, done) {
    if (!container || !cells || duration <= 0) { done(); return }
    const fromPos = cells.centre(move.from, container)
    const toPos = cells.centre(move.to, container)
    if (!fromPos || !toPos) { done(); return }
    if (!Number.isFinite(fromPos.x) || !Number.isFinite(fromPos.y) ||
        !Number.isFinite(toPos.x) || !Number.isFinite(toPos.y)) {
      console.warn('[game-play] animateMove: NaN coordinates, skipping', { from: move.from, to: move.to, fromPos, toPos })
      done(); return
    }

    const svgEl = container.querySelector('svg')
    if (!svgEl) { done(); return }

    const pieceEls = svgEl.querySelectorAll('image')
    let pieceEl = null
    for (const el of pieceEls) {
      const ix = parseFloat(el.getAttribute('x'))
      const iy = parseFloat(el.getAttribute('y'))
      const size = parseFloat(el.getAttribute('width'))
      const cx = ix + size / 2
      const cy = iy + size / 2
      if (Math.abs(cx - fromPos.x) < size * 0.5 && Math.abs(cy - fromPos.y) < size * 0.5) {
        pieceEl = el
        break
      }
    }
    if (!pieceEl) { done(); return }

    const dx = toPos.x - fromPos.x
    const dy = toPos.y - fromPos.y
    const style = currentAnimStyle || ANIM_THEME.defaultStyle

    if (style === 'warp') {
      const fadeOut = duration * 0.35
      const fadeIn = duration * 0.35
      const start = performance.now()
      function warpFrame(now) {
        const elapsed = now - start
        if (elapsed < fadeOut) {
          pieceEl.setAttribute('opacity', 1 - elapsed / fadeOut)
          requestAnimationFrame(warpFrame)
        } else if (elapsed < fadeOut + 50) {
          pieceEl.setAttribute('opacity', '0')
          pieceEl.setAttribute('transform', `translate(${dx}, ${dy})`)
          requestAnimationFrame(warpFrame)
        } else if (elapsed < fadeOut + 50 + fadeIn) {
          const tp = (elapsed - fadeOut - 50) / fadeIn
          pieceEl.setAttribute('opacity', tp)
          requestAnimationFrame(warpFrame)
        } else {
          pieceEl.setAttribute('opacity', '1')
          done()
        }
      }
      requestAnimationFrame(warpFrame)
      return
    }

    if (style === 'arc') {
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
        else done()
      }
      requestAnimationFrame(arcFrame)
      return
    }

    const easeOut = t => 1 - Math.pow(1 - t, 3)
    const bounceEase = t => {
      const n = 7.5625, d = 2.75
      let tl = t
      if (tl < 1/d) return n*tl*tl
      if (tl < 2/d) return n*(tl-=1.5/d)*tl+0.75
      if (tl < 2.5/d) return n*(tl-=2.25/d)*tl+0.9375
      return n*(tl-=2.625/d)*tl+0.984375
    }
    const easeFn = style === 'bounce' ? bounceEase : easeOut

    const start = performance.now()
    function frame(now) {
      const t = Math.min((now - start) / duration, 1)
      const p = easeFn(t)
      pieceEl.setAttribute('transform', `translate(${dx * p}, ${dy * p})`)
      if (t < 1) requestAnimationFrame(frame)
      else done()
    }
    requestAnimationFrame(frame)
  }

  function captureBurst(pos) {
    if (!container || !cells) return
    const c = cells.centre(pos, container)
    if (!c) return
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) {
      console.warn('[game-play] captureBurst: NaN coordinates, skipping', { pos, centre: c })
      return
    }
    const svgEl = container.querySelector('svg')
    if (!svgEl) return
    const ns = 'http://www.w3.org/2000/svg'
    const bt = CAPTURE_BURST_THEME
    const g = document.createElementNS(ns, 'g')
    g.setAttribute('pointer-events', 'none')
    for (let i = 0; i < bt.particles; i++) {
      const angle = (Math.PI * 2 * i) / bt.particles
      const particle = document.createElementNS(ns, 'circle')
      particle.setAttribute('cx', c.x)
      particle.setAttribute('cy', c.y)
      particle.setAttribute('r', bt.radius)
      particle.setAttribute('fill', bt.colors[i % bt.colors.length])
      particle.setAttribute('opacity', '1')
      g.appendChild(particle)
      const dist = c.w * bt.spread
      const tx = Math.cos(angle) * dist
      const ty = Math.sin(angle) * dist
      particle.animate([
        { transform: 'translate(0,0)', opacity: 1 },
        { transform: `translate(${tx}px,${ty}px)`, opacity: 0 },
      ], { duration: bt.duration, easing: bt.easing, fill: 'forwards' })
    }
    svgEl.appendChild(g)
    setTimeout(() => g.remove(), bt.duration + 50)
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
    setPieceSet(next) {
      currentPieceSet = next; draw()
    },
    setAnimStyle(next) {
      if (ANIM_THEME.styles.includes(next)) currentAnimStyle = next
    },
    setAnimSpeed(next) {
      if (ANIM_THEME.speeds[next] !== undefined) currentAnimSpeed = next
    },
    flip() {
      flipped = !flipped
      if (ctrl) ctrl.setFlipped(flipped)
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

  const galleryEntries = (getGalleryIndex() || [])
    .filter(s => s.id && s.label)
    .map(s => ({ value: s.id, label: s.label || s.id }))
  const pieceSetOptions = [{ value: 'auto', label: 'Auto (from rules)' }, ...galleryEntries]
  const pieceSetSelect = buildSelect(sidebar, 'Pieces', pieceSetOptions, params.pieces || 'auto')
  const animStyleSelect = buildSelect(sidebar, 'Animation', ANIM_THEME.styles.map(s => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), params.animStyle || ANIM_THEME.defaultStyle)
  const animSpeedSelect = buildSelect(sidebar, 'Speed', Object.keys(ANIM_THEME.speeds).map(s => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), params.animSpeed || ANIM_THEME.defaultSpeed)

  let engineSelect = null
  if (family === 'chess') {
    engineSelect = buildSelect(sidebar, 'Engine', [
      { value: 'generic', label: 'Generic' },
      { value: 'mce', label: 'MCE' },
    ], 'generic')
  }

  const controlsEl = document.createElement('div')
  controlsEl.className = 'game-play-controls'
  const flipBtn = document.createElement('button')
  flipBtn.className = 'btn'
  flipBtn.textContent = 'Flip'
  const fullscreenBtn = document.createElement('button')
  fullscreenBtn.className = 'btn'
  fullscreenBtn.textContent = 'Fullscreen'
  controlsEl.appendChild(flipBtn)
  controlsEl.appendChild(fullscreenBtn)
  sidebar.appendChild(controlsEl)

  const capturedEl = document.createElement('div')
  capturedEl.className = 'game-play-captured'
  sidebar.appendChild(capturedEl)

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
    capturedContainer: capturedEl,
    pieceSet: pieceSetSelect.value,
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
  pieceSetSelect.addEventListener('change', () => restart({ pieceSet: pieceSetSelect.value }))
  animStyleSelect.addEventListener('change', () => { if (session) session.setAnimStyle(animStyleSelect.value) })
  animSpeedSelect.addEventListener('change', () => { if (session) session.setAnimSpeed(animSpeedSelect.value) })
  flipBtn.addEventListener('click', () => { if (session) { session.flip(); } })
  fullscreenBtn.addEventListener('click', () => {
    if (boardArea.requestFullscreen) boardArea.requestFullscreen()
    else if (boardArea.webkitRequestFullscreen) boardArea.webkitRequestFullscreen()
  })
  if (engineSelect) {
    engineSelect.addEventListener('change', (e) => {
      if (e.target.value === 'mce') {
        const p = new URLSearchParams(location.search)
        p.set('mode', 'play')
        p.set('family', 'chess')
        p.set('variant', config.variant || 'standard')
        p.delete('engine')
        location.search = p.toString()
      }
    })
  }

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
