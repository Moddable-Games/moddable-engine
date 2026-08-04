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

import { BOARD_THEMES, RULES_BASE, ANIM_THEME, CAPTURE_BURST_THEME, PIECE_STYLES, loadGalleryIndex, getGalleryIndex, loadVariantManifest, getManifestVariants, loadPlayabilityManifest, getPlayableVariants, getAllManifestVariants, PLAYABLE_FAMILIES, FAMILY_LABELS } from './play-shared.js'
import { createCellAddressing, createDirectAddressing } from './play-cells.js'
import { paintHighlight, paintIndicator, paintFog, paintEffect, createOverlay } from './play-overlays.js'
import { bindBoardInteraction } from './play-interaction.js'
import { renderHandPanel } from './play-hand.js'
import { renderRulesPanel } from './play-rules.js'
import { moveToSAN } from '../packages/plugins/chess/src/san.js'

const DIFFICULTIES = ['beginner', 'easy', 'medium', 'hard', 'expert']

const FAMILY_AI_OPTIONS = {
  chess: [
    { value: 'beginner', label: 'Beginner — random captures' },
    { value: 'easy', label: 'Easy — shallow tactics' },
    { value: 'medium', label: 'Medium — 5-ply search' },
    { value: 'hard', label: 'Hard — deep search' },
    { value: 'expert', label: 'Expert — full strength' },
  ],
  go: [
    { value: 'beginner', label: 'Beginner — random' },
    { value: 'easy', label: 'Easy — random' },
    { value: 'medium', label: 'Medium — weak MCTS' },
    { value: 'hard', label: 'Hard — MCTS 2k iter' },
    { value: 'expert', label: 'Expert — MCTS 5k iter' },
  ],
  draughts: [
    { value: 'beginner', label: 'Beginner — random captures' },
    { value: 'easy', label: 'Easy — material count' },
    { value: 'medium', label: 'Medium — material count' },
    { value: 'hard', label: 'Hard — deeper search' },
    { value: 'expert', label: 'Expert — deepest search' },
  ],
  shogi: [
    { value: 'beginner', label: 'Beginner — random captures' },
    { value: 'easy', label: 'Easy — material count' },
    { value: 'medium', label: 'Medium — material count' },
    { value: 'hard', label: 'Hard — deeper search' },
    { value: 'expert', label: 'Expert — deepest search' },
  ],
  xiangqi: [
    { value: 'beginner', label: 'Beginner — random captures' },
    { value: 'easy', label: 'Easy — material count' },
    { value: 'medium', label: 'Medium — material count' },
    { value: 'hard', label: 'Hard — deeper search' },
    { value: 'expert', label: 'Expert — deepest search' },
  ],
}

const STRUCTURAL_KEYS = new Set(['topology', 'players', 'meta', 'surface', 'render', 'components', 'pieces', 'plugins'])
const REGISTRY_PRESENTATION_KEYS = new Set(['key', 'label', 'title', 'group', 'description', 'rule', 'board', 'extends', 'hidden', 'playerNames', 'definition', 'rows', 'cols', 'size', 'notation', 'topology', 'players'])

function buildDefinitionFromResolved(family, variant, resolved, registryCfg) {
  const registryTopo = registryCfg.topology || {}
  const topo = resolved.topology || {}
  const topology = topo.type ? { ...registryTopo, ...topo } : undefined
  const players = resolved.players || ['white', 'black']

  const pluginConfig = {}
  for (const [k, v] of Object.entries(registryCfg)) {
    if (REGISTRY_PRESENTATION_KEYS.has(k)) continue
    pluginConfig[k] = v
  }
  for (const [k, v] of Object.entries(resolved)) {
    if (STRUCTURAL_KEYS.has(k)) continue
    if (v !== undefined) pluginConfig[k] = v
  }
  const pluginBlock = resolved.plugins?.[family]
  if (pluginBlock) {
    for (const [k, v] of Object.entries(pluginBlock)) {
      if (v !== undefined) pluginConfig[k] = v
    }
  }

  const def = { title: resolved.meta?.label || variant, slug: variant, parent: family, engine: { players, plugins: { [family]: pluginConfig } } }
  if (topology) def.engine.topology = topology
  return def
}

async function resolveBoard(family, variantConfig, variantKey, slugOverride) {
  const basePath = RULES_BASE + 'games/'
  const variantSlug = slugOverride || variantConfig.slug || variantKey || 'standard'
  const familyPath = family + '/content/rulebook.md'
  const variantPath = family + '/content/variants/' + variantSlug + '.md'

  const [familyMd, variantMd] = await Promise.all([
    fetch(basePath + familyPath).then(r => r.text()),
    fetch(basePath + variantPath).then(r => r.ok ? r.text() : '').then(md => {
      if (!md && variantSlug !== 'standard') {
        console.error(`[resolveBoard] No rulebook found for ${family}/${variantSlug} — check that ${variantSlug}.md exists`)
      }
      return md
    }),
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
    seat = '0',
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
  let currentPieceStyle = options.pieceStyle || 'auto'
  let resolvedBoard = null
  let cells = null
  let moveHistory = []
  let boardSnapshot = null
  let captureHistory = []
  const fogViewSide = parseInt(seat, 10) || 0

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
    captured = { 0: [], 1: [] }
    boardSnapshot = null
    captureHistory = []

    const variantCfg = getVariantConfig(family, variant) || {}
    const playable = getPlayableVariants(family)
    const variantEntry = playable.find(e => e.variant === variant)
    const slug = variantEntry?.slug || variant
    resolvedBoard = await resolveBoard(family, variantCfg, variant, slug)

    const frontmatterDef = buildDefinitionFromResolved(family, variant, resolvedBoard, variantCfg)
    game = createGameForFamily(family, { variant, definition: frontmatterDef })
    const topo = resolvedBoard.topology
    if (topo.type === 'grid' && topo.rows && topo.cols) {
      cells = createCellAddressing({
        rows: topo.rows,
        cols: topo.cols,
        idStyle: resolvedBoard.render?.idStyle || 'algebraic',
      })
    } else if (topo.type === 'grid' && !topo.rows && !topo.cols) {
      // Irregular grids (cells-only, e.g. crazy-38s) — use direct addressing
      cells = createDirectAddressing()
    } else {
      // Non-grid topologies (hex, graph, track, etc.) — use direct addressing
      // Their SVG data-sq values match the move identifiers directly
      cells = createDirectAddressing()
    }
    await loadGalleryIndex()

    ai = opponent === 'ai'
      ? createAI(family, variant, { difficulty })
      : null

    const names = playerNames()
    const humanIdx = resolveHumanIndex(seat, names)
    const players = {}
    for (let i = 0; i < names.length; i++) {
      players[names[i]] = (ai && i !== humanIdx) ? 'ai' : 'human'
    }

    ctrl = createGameController(game.raw, {
      family,
      players,
      aiDifficulty: difficulty,
      aiPickMove: ai
        ? () => {
            const slice = game.getState().slice
            const idx = currentPlayerIndex()
            const move = ai.pickMove(slice, idx)
            if (!move) return null
            const legalMoves = game.getLegalMoves()
            const isLegal = legalMoves.some(m =>
              m.from === move.from && m.to === move.to &&
              (!m.promotion || m.promotion === move.promotion))
            if (!isLegal) {
              console.warn(`[AI] move rejected (illegal), falling back to random legal`)
              return null
            }
            return move
          }
        : null,
      onRender: (game, state) => draw(state),
      onTurnChange: (player) => {
        if (onStatus) onStatus({ text: `${capitalize(player)} to move`, gameOver: false })
      },
      onGameEnd: handleGameEnd,
      onChoiceNeeded: showChoiceDialog,
      onBeforeMove: (move, player) => {
        const slice = game.getState().slice
        boardSnapshot = slice.board
          ? (Array.isArray(slice.board) ? [...slice.board] : { ...slice.board })
          : null
        if (boardSnapshot) boardSnapshot._legalMoves = ctrl ? ctrl.getLegalMoves() : null
      },
      onMove: (move, player) => {
        moveHistory.push({ move, player, notation: moveToNotation(move) })
        const isCapture = move.capture || (move.captures && move.captures.length > 0) || move.enPassant
        if (isCapture && boardSnapshot) {
          detectCaptures(move, player, boardSnapshot)
        } else {
          captureHistory.push({ side: playerNames().indexOf(player), pieces: [] })
        }
        boardSnapshot = null
        if (isCapture && onCapture) onCapture(move)
        if (isCapture && move.to !== undefined) captureBurst(move.to)
        if (onStatus) onStatus({ text: `${capitalize(game.currentPlayer())} to move`, gameOver: false, lastMove: moveToNotation(move) })
        if (embed) embed.post('move', { move, state: summarise() })
      },
      onAnimateMove: (move, state, done) => {
        const variantCfg = getVariantConfig(family, variant) || {}
        if (variantCfg.visibility) { done(); return }
        const duration = ANIM_THEME.speeds[currentAnimSpeed] || 0
        if (duration <= 0) { done(); return }
        animateMove(move, duration, done)
      },
      onUndo: () => {
        // Controller undoes 1 or 2 moves; sync our histories to match
        // The controller's undoStack length after undo tells us the move count
        const undoCount = ctrl.getState().undoCount
        while (moveHistory.length > undoCount) moveHistory.pop()
        while (captureHistory.length > undoCount) captureHistory.pop()
        // Rebuild captured state from remaining history
        captured = { 0: [], 1: [] }
        for (const entry of captureHistory) {
          for (const piece of entry.pieces) {
            const capturer = piece._capturer !== undefined ? piece._capturer : entry.side
            const clean = { ...piece }
            delete clean._capturer
            captured[capturer].push(clean)
          }
        }
        renderCaptured()
      },
    })

    if (onStatus) onStatus({ text: `${capitalize(game.currentPlayer())} to move`, gameOver: false })

    if (embed) embed.post('ready', { family, variant, state: summarise() })
    draw()
    if (capturedContainer) capturedContainer.innerHTML = ''
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
    const text = result === 'draw' ? 'Draw'
      : `${capitalize(result)} wins!`
    report(text, true)
  }

  function enterScoringPhase() {
    const plugin = pluginFor()
    if (!plugin || typeof plugin.score !== 'function') {
      report('scoring', false)
      return
    }
    scoring = plugin.score({ ...game.getState().slice, deadStones })
    const winnerName = normaliseOutcome(scoring.winner, playerNames())
    report(`${capitalize(winnerName)} by ${scoring.margin}`, true)
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
    const setup = boardToSetup(visibleSlice, resolvedBoard.topology)
    const rendered = { ...resolvedBoard, setup }
    if (currentPieceSet !== 'auto') {
      rendered.pieces = { ...rendered.pieces, set: currentPieceSet }
    }
    const variantCfg = getVariantConfig(family, variant) || {}
    if (variantCfg.render?.fenMap) {
      rendered.pieces = { ...rendered.pieces, fenMap: variantCfg.render.fenMap }
    }
    const boardTheme = BOARD_THEMES[currentTheme] || BOARD_THEMES.classic
    rendered.surface = {
      ...(rendered.surface || {}),
      colors: { ...(rendered.surface?.colors || {}), 'cell-light': boardTheme.light, 'cell-dark': boardTheme.dark },
    }
    if (rendered.render?.ops) {
      rendered.render = { ...rendered.render, ops: rendered.render.ops.map(op =>
        op.op === 'cells' && op.pattern === 'checkered'
          ? { ...op, light: boardTheme.light, dark: boardTheme.dark }
          : op
      ) }
    }
    const gallery = getGalleryIndex() || []
    const pieceResult = attachPieceImages(rendered, gallery)
    const pieceImages = pieceResult.images || {}
    const svg = renderFromEngine(rendered, {
      pieceImages,
      pieceSurfaceMap: pieceResult.surfaceMap || {},
      pieceSurface: pieceResult.surface || null,
      flipped,
    })

    if (!svg) return
    container.innerHTML = svg

    const svgEl = container.querySelector('svg')
    if (svgEl) {
      svgEl.removeAttribute('width')
      svgEl.removeAttribute('height')

      const style = PIECE_STYLES[currentPieceStyle]
      if (style && style.light) {
        applyPieceRecolour(svgEl, style)
      }
      const overlay = createOverlay()

      if (lastMove) {
        if (lastMove.from !== null && lastMove.from !== undefined) paintHighlight(overlay, cells.bbox(lastMove.from, container), boardTheme.lastMove)
        if (lastMove.to !== null && lastMove.to !== undefined) paintHighlight(overlay, cells.bbox(lastMove.to, container), boardTheme.lastMove)
      }

      if (selected !== null && selected !== undefined) {
        paintHighlight(overlay, cells.bbox(selected, container), boardTheme.highlight)
      }

      const board = slice.board || []
      const seenTargets = new Set()
      for (const m of legalMoves) {
        const target = m.to !== undefined ? m.to : m.coord
        if (target === undefined || target === null) continue
        // For grid mode, validate numeric bounds; for direct mode, accept any non-null key
        if (typeof target === 'number' && (target < 0 || target >= board.length)) continue
        if (seenTargets.has(target)) continue
        seenTargets.add(target)
        const hasPiece = !!board[target]
        paintIndicator(overlay, cells.bbox(target, container), hasPiece ? boardTheme.ring : boardTheme.dot, hasPiece)
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

      const allGroups = svgEl.querySelectorAll('g[pointer-events="none"]')
      const piecesGroup = allGroups.length > 0 ? allGroups[allGroups.length - 1] : null
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
    const hasPlacement = slice.phase === 'placement' && slice._toPlace && slice._toPlace.some(a => a && a.length > 0)
    if (!hasHands && !hasPlacement) { handContainer.innerHTML = ''; return }
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
        const image = pieceImages[pieceId]
          || pieceImages[symbol]
          || (symbol && pieceImages[symbol.toUpperCase()])
          || null
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

  function detectCaptures(move, player, prevBoard) {
    const names = playerNames()
    const playerIdx = names.indexOf(player)
    const entry = { side: playerIdx, pieces: [] }

    if (move.enPassant && move.captured !== undefined) {
      const piece = prevBoard[move.captured]
      if (piece) {
        entry.pieces.push(piece)
        captured[playerIdx].push(piece)
      }
    } else if (move.captures && move.captures.length > 0) {
      for (const pos of move.captures) {
        const piece = prevBoard[pos]
        if (piece) {
          const capturer = typeof piece.owner === 'number'
            ? (piece.owner === 0 ? 1 : 0)
            : playerIdx
          entry.pieces.push({ ...piece, _capturer: capturer })
          captured[capturer].push(piece)
        }
      }
    } else if (move.to !== undefined) {
      const piece = prevBoard[move.to]
      if (piece) {
        entry.pieces.push(piece)
        captured[playerIdx].push(piece)
      }
    }

    captureHistory.push(entry)
    renderCaptured()
  }

  function renderCaptured() {
    if (!capturedContainer) return
    capturedContainer.innerHTML = ''

    const names = playerNames()
    const plugin = pluginFor()
    const vocab = plugin?.vocabulary || {}
    const gallery = getGalleryIndex() || []
    const rendered = { ...resolvedBoard, pieces: { ...resolvedBoard.pieces } }
    if (currentPieceSet !== 'auto') rendered.pieces.set = currentPieceSet
    const pieceResult = attachPieceImages(rendered, gallery)
    const pieceImages = pieceResult.images || {}

    const hasPieces = captured[0].length > 0 || captured[1].length > 0
    if (!hasPieces) return

    for (let side = 0; side < 2; side++) {
      const pieces = captured[side]
      if (pieces.length === 0) continue

      const row = document.createElement('div')
      row.className = 'captured-row'

      const label = document.createElement('span')
      label.className = 'captured-label'
      label.textContent = (names[side] || `Player ${side + 1}`) + ':'
      row.appendChild(label)

      const counted = {}
      for (const piece of pieces) {
        const entry = vocab[piece.type]
        const opOwner = typeof piece.owner === 'number' ? piece.owner : (side === 0 ? 1 : 0)
        const symbol = entry?.symbols?.[opOwner]
        const key = symbol || piece.type
        if (!counted[key]) counted[key] = { symbol, owner: opOwner, type: piece.type, count: 0 }
        counted[key].count++
      }

      for (const [key, info] of Object.entries(counted)) {
        const el = document.createElement('span')
        el.className = 'captured-piece'

        const pieceId = info.symbol
          ? (info.owner === 0 ? 'w' : 'b') + info.symbol.toUpperCase()
          : null
        const imgSrc = pieceImages[pieceId] || pieceImages[info.symbol] || null

        if (imgSrc) {
          const img = document.createElement('img')
          img.src = imgSrc
          img.alt = info.symbol || info.type
          img.className = 'captured-piece-img'
          el.appendChild(img)
        } else {
          const txt = document.createElement('span')
          txt.className = 'captured-piece-text'
          txt.textContent = info.symbol || info.type
          el.appendChild(txt)
        }

        if (info.count > 1) {
          const badge = document.createElement('span')
          badge.className = 'captured-count'
          badge.textContent = info.count
          el.appendChild(badge)
        }

        row.appendChild(el)
      }

      capturedContainer.appendChild(row)
    }
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

  function applyPieceRecolour(svgEl, style) {
    const ns = 'http://www.w3.org/2000/svg'
    let defs = svgEl.querySelector('defs')
    if (!defs) { defs = document.createElementNS(ns, 'defs'); svgEl.prepend(defs) }

    for (const side of ['light', 'dark']) {
      const colors = style[side]
      if (!colors) continue
      const filterId = `recolor-${side}`
      const filter = document.createElementNS(ns, 'filter')
      filter.setAttribute('id', filterId)
      filter.setAttribute('color-interpolation-filters', 'sRGB')

      const [r, g, b] = hexToRgb(colors.fill)
      const [sr, sg, sb] = hexToRgb(colors.stroke)
      const matrix = document.createElementNS(ns, 'feColorMatrix')
      matrix.setAttribute('type', 'matrix')
      matrix.setAttribute('values', [
        `${(r - sr) / 255} 0 0 0 ${sr / 255}`,
        `0 ${(g - sg) / 255} 0 0 ${sg / 255}`,
        `0 0 ${(b - sb) / 255} 0 ${sb / 255}`,
        `0 0 0 1 0`,
      ].join(' '))
      filter.appendChild(matrix)
      defs.appendChild(filter)
    }

    const images = svgEl.querySelectorAll('image[href]')
    for (const img of images) {
      const href = img.getAttribute('href') || ''
      const isDark = /\/b[A-Z]/.test(href) || /\bb[A-Z]/.test(href)
      img.setAttribute('filter', `url(#recolor-${isDark ? 'dark' : 'light'})`)
    }
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '')
    const n = h.length === 3
      ? parseInt(h[0]+h[0]+h[1]+h[1]+h[2]+h[2], 16)
      : parseInt(h, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }

  function resolveHumanIndex(seat, names) {
    if (/^\d+$/.test(seat)) return parseInt(seat, 10)
    const idx = names.indexOf(seat)
    if (idx !== -1) return idx
    return 0
  }

  function boardToSetup(slice, topo) {
    return serialiseBoard(slice, topo, (pluginFor() || {}).vocabulary || {})
  }

  function moveToNotation(move) {
    if (family === 'chess') {
      const board = boardSnapshot || game.getState().slice?.board
      const topo = resolvedBoard?.topology
      const legal = boardSnapshot?._legalMoves || null
      return moveToSAN(move, board, topo, legal)
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
    setPieceStyle(next) {
      if (PIECE_STYLES[next]) { currentPieceStyle = next; draw() }
    },
    setAnimStyle(next) {
      if (ANIM_THEME.styles.includes(next)) currentAnimStyle = next
    },
    setAnimSpeed(next) {
      if (ANIM_THEME.speeds[next] !== undefined) currentAnimSpeed = next
    },
    flip() {
      flipped = !flipped
      cells.setFlipped(flipped)
      if (ctrl) ctrl.setFlipped(flipped)
    },
    markDead: toggleDead,
  }

  return session
}

export async function initGamePlay(container, defaults = {}) {
  const params = parseEmbedParams(location.search, { family: 'chess', ...defaults })
  let family = params.family
  await Promise.all([loadVariantManifest(), loadPlayabilityManifest(), loadGalleryIndex()])

  const FAMILY_PLAYER_NAMES = {
    chess: ['White', 'Black'],
    go: ['Black', 'White'],
    draughts: ['White', 'Black'],
    xiangqi: ['Red', 'Black'],
    shogi: ['Sente', 'Gote'],
  }

  function seatOptionsForFamily(f) {
    const names = FAMILY_PLAYER_NAMES[f] || ['Player 1', 'Player 2']
    return names.map((name, i) => ({ value: String(i), label: name }))
  }

  function rebuildSeatSelect(f) {
    const opts = seatOptionsForFamily(f)
    seatSelect.innerHTML = ''
    for (const opt of opts) {
      const o = document.createElement('option')
      o.value = opt.value
      o.textContent = opt.label
      seatSelect.appendChild(o)
    }
  }

  function variantsForFamily(f) {
    const playable = getPlayableVariants(f)
    if (playable.length > 0) return playable.map(e => ({ key: e.variant, slug: e.slug || e.variant, label: e.label, group: e.group, playable: true }))
    const registry = listVariants(f)
    return registry.map(v => ({ key: v.key, slug: v.slug || v.key, label: v.label, group: v.group, playable: true }))
  }

  function pickVariant(f, requested) {
    const vs = variantsForFamily(f)
    if (requested && vs.some(v => v.key === requested)) return requested
    const std = vs.find(v => v.key === 'standard')
    return std ? std.key : (vs[0] && vs[0].key)
  }

  let variant = pickVariant(family, params.variant)

  const leftSidebar = document.createElement('aside')
  leftSidebar.className = 'game-play-sidebar game-play-sidebar--left'

  const boardArea = document.createElement('div')
  boardArea.className = 'game-play-board'

  const rightSidebar = document.createElement('aside')
  rightSidebar.className = 'game-play-sidebar game-play-sidebar--right'

  const handEl = document.createElement('div')
  handEl.className = 'game-play-hand'

  container.appendChild(leftSidebar)
  container.appendChild(boardArea)
  container.appendChild(rightSidebar)

  const familySelect = buildSelect(leftSidebar, 'Game', PLAYABLE_FAMILIES.map(f => ({ value: f, label: FAMILY_LABELS[f] })), family)
  const variantSelect = buildGroupedSelect(leftSidebar, 'Variant', variantsForFamily(family), variant)
  const opponentSelect = buildSelect(leftSidebar, 'Opponent', [
    { value: 'human', label: 'Human vs Human' },
    { value: 'ai', label: 'vs AI' },
  ], params.opponent === 'ai' ? 'ai' : 'human')
  function difficultyOptionsFor(f) {
    return FAMILY_AI_OPTIONS[f] || DIFFICULTIES.map(d => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))
  }
  const difficultySelect = buildSelect(leftSidebar, 'Difficulty', difficultyOptionsFor(family), params.difficulty || 'medium')
  const seatSelect = buildSelect(leftSidebar, 'Play as', seatOptionsForFamily(family), params.color || '0')
  const themeSelect = buildSelect(leftSidebar, 'Theme', Object.entries(BOARD_THEMES).map(([k, v]) => ({ value: k, label: v.label })), params.theme || 'classic')

  const pieceSetSelect = buildSelect(leftSidebar, 'Pieces', [{ value: 'auto', label: 'Auto (from rules)' }], params.pieces || 'auto')
  const pieceStyleSelect = buildSelect(leftSidebar, 'Piece Colours', Object.entries(PIECE_STYLES).map(([k, v]) => ({ value: k, label: v.label })), params.pieceStyle || 'auto')
  const animStyleSelect = buildSelect(leftSidebar, 'Animation', ANIM_THEME.styles.map(s => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), params.animStyle || ANIM_THEME.defaultStyle)
  const animSpeedSelect = buildSelect(leftSidebar, 'Speed', Object.keys(ANIM_THEME.speeds).map(s => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), params.animSpeed || ANIM_THEME.defaultSpeed)

  function rebuildVariantSelect(f) {
    const vs = variantsForFamily(f)
    const grouped = groupByField(vs, 'group')
    variantSelect.innerHTML = ''
    for (const [group, items] of grouped) {
      if (grouped.size > 1) {
        const optgroup = document.createElement('optgroup')
        optgroup.label = group
        for (const v of items) {
          const o = document.createElement('option')
          o.value = v.key
          o.textContent = v.label
          optgroup.appendChild(o)
        }
        variantSelect.appendChild(optgroup)
      } else {
        for (const v of items) {
          const o = document.createElement('option')
          o.value = v.key
          o.textContent = v.label
          variantSelect.appendChild(o)
        }
      }
    }
  }


  const statusEl = document.createElement('div')
  statusEl.className = 'game-play-status'
  rightSidebar.appendChild(statusEl)

  const actionsEl = document.createElement('div')
  actionsEl.className = 'game-play-actions'
  rightSidebar.appendChild(actionsEl)

  rightSidebar.appendChild(handEl)

  const historyEl = document.createElement('div')
  historyEl.className = 'game-play-history'
  rightSidebar.appendChild(historyEl)

  const capturedEl = document.createElement('div')
  capturedEl.className = 'game-play-captured'
  rightSidebar.appendChild(capturedEl)

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
  rightSidebar.appendChild(controlsEl)

  const exportEl = document.createElement('div')
  exportEl.className = 'game-play-export'
  const fenBtn = document.createElement('button')
  fenBtn.className = 'btn'
  fenBtn.textContent = 'Copy FEN'
  fenBtn.addEventListener('click', () => {
    if (session) navigator.clipboard.writeText(session.fen).then(() => { fenBtn.textContent = 'Copied'; setTimeout(() => { fenBtn.textContent = 'Copy FEN' }, 1500) })
  })
  exportEl.appendChild(fenBtn)
  rightSidebar.appendChild(exportEl)

  const rulesEl = document.createElement('div')
  rulesEl.className = 'game-play-rules'
  rightSidebar.appendChild(rulesEl)

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
    seat: seatSelect.value,
    theme: themeSelect.value,
    embed: params.embed ? bridge : null,
    onStatus: updateStatus,
  }

  function updateRules(variantKey) {
    const vConfig = getVariantConfig(config.family, variantKey)
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
    params.set('family', config.family)
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

  function populatePieceSetSelect(variantKey) {
    const gallery = getGalleryIndex() || []
    if (gallery.length === 0) {
      console.error('[game-play] Piece gallery loaded 0 entries — fetch may have failed')
      return
    }
    const needed = getVariantPieceKeys(config.family, variantKey)
    const compatible = gallery.filter(s => {
      if (!s.id || !s.pieces) return false
      for (const key of needed) {
        if (!s.pieces[key]) return false
      }
      return true
    })
    const current = pieceSetSelect.value
    pieceSetSelect.innerHTML = ''
    const autoOpt = document.createElement('option')
    autoOpt.value = 'auto'
    autoOpt.textContent = 'Auto (from rules)'
    pieceSetSelect.appendChild(autoOpt)
    for (const s of compatible) {
      const o = document.createElement('option')
      o.value = s.id
      o.textContent = s.name || s.id
      pieceSetSelect.appendChild(o)
    }
    if (compatible.some(s => s.id === current)) {
      pieceSetSelect.value = current
    } else {
      pieceSetSelect.value = 'auto'
      config.pieceSet = 'auto'
    }
  }

  async function restart(changes) {
    config = { ...config, ...changes }
    updateRules(config.variant)
    populatePieceSetSelect(config.variant)
    updateURL()
    session = createPlaySession(config)
    await session.start()
    renderActions()
  }

  familySelect.addEventListener('change', () => {
    family = familySelect.value
    rebuildVariantSelect(family)
    rebuildSeatSelect(family)
    const opts = difficultyOptionsFor(family)
    difficultySelect.innerHTML = ''
    for (const opt of opts) {
      const o = document.createElement('option')
      o.value = opt.value
      o.textContent = opt.label
      if (opt.value === 'medium') o.selected = true
      difficultySelect.appendChild(o)
    }
    const newVariant = pickVariant(family, null)
    variantSelect.value = newVariant
    restart({ family, variant: newVariant, seat: seatSelect.value })
  })
  variantSelect.addEventListener('change', () => restart({ variant: variantSelect.value }))
  opponentSelect.addEventListener('change', () => restart({ opponent: opponentSelect.value }))
  difficultySelect.addEventListener('change', () => restart({ difficulty: difficultySelect.value }))
  seatSelect.addEventListener('change', () => restart({ seat: seatSelect.value }))
  themeSelect.addEventListener('change', () => { config.theme = themeSelect.value; session.setTheme(themeSelect.value); updateURL() })
  pieceSetSelect.addEventListener('change', () => restart({ pieceSet: pieceSetSelect.value }))
  pieceStyleSelect.addEventListener('change', () => { if (session) session.setPieceStyle(pieceStyleSelect.value) })
  animStyleSelect.addEventListener('change', () => { if (session) session.setAnimStyle(animStyleSelect.value) })
  animSpeedSelect.addEventListener('change', () => { if (session) session.setAnimSpeed(animSpeedSelect.value) })
  flipBtn.addEventListener('click', () => { if (session) { session.flip(); } })
  fullscreenBtn.addEventListener('click', () => {
    if (boardArea.requestFullscreen) boardArea.requestFullscreen()
    else if (boardArea.webkitRequestFullscreen) boardArea.webkitRequestFullscreen()
  })
  await restart({ family, variant })
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

function groupByField(items, field) {
  const groups = new Map()
  for (const item of items) {
    const key = item[field] || 'Other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return groups
}

function buildGroupedSelect(parent, label, variants, selected) {
  const group = document.createElement('div')
  group.className = 'control-group'
  const lbl = document.createElement('label')
  lbl.className = 'control-label'
  lbl.textContent = label
  const sel = document.createElement('select')
  const grouped = groupByField(variants, 'group')
  for (const [grpName, items] of grouped) {
    if (grouped.size > 1) {
      const optgroup = document.createElement('optgroup')
      optgroup.label = grpName
      for (const v of items) {
        const o = document.createElement('option')
        o.value = v.key
        o.textContent = v.label
        if (v.key === selected) o.selected = true
        optgroup.appendChild(o)
      }
      sel.appendChild(optgroup)
    } else {
      for (const v of items) {
        const o = document.createElement('option')
        o.value = v.key
        o.textContent = v.label
        if (v.key === selected) o.selected = true
        sel.appendChild(o)
      }
    }
  }
  group.appendChild(lbl)
  group.appendChild(sel)
  parent.appendChild(group)
  return sel
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : '' }

function getVariantPieceKeys(family, variantKey) {
  const vCfg = getVariantConfig(family, variantKey) || {}
  const fen = vCfg.setup || vCfg.fen
  if (typeof fen !== 'string') {
    const keys = new Set(['wK', 'wP', 'bK', 'bP'])
    if (vCfg.placementPieces) {
      const vocab = vCfg.vocabulary || {}
      for (const side of vCfg.placementPieces) {
        for (const type of side) {
          const entry = vocab[type]
          if (entry?.symbols) {
            keys.add('w' + entry.symbols[0])
            keys.add('b' + entry.symbols[1].toUpperCase())
          } else {
            const sym = type[0].toUpperCase()
            keys.add('w' + sym)
            keys.add('b' + sym)
          }
        }
      }
    }
    return keys
  }
  const fenPieces = fen.split(' ')[0].replace(/[\d\/\[\]+,;:.\-]/g, '')
  const chars = new Set(fenPieces.split(''))
  const keys = new Set()
  for (const ch of chars) {
    if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) {
      keys.add('w' + ch)
    } else if (ch === ch.toLowerCase() && ch !== ch.toUpperCase()) {
      keys.add('b' + ch.toUpperCase())
    }
  }
  return keys
}

export { BOARD_THEMES, DIFFICULTIES, FAMILY_INTERACTION, getVariantConfig }
