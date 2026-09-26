// The play page for a game played with cards, tiles or dice rather than on a
// board (engine#176). It keeps the shape of the board session in
// game-play.js - start, draw, actions, undo, the status line - so the page
// around it does not need to know which kind it has, but the table is its own:
// there are no squares to click, a seat holds cards the others may not see, and
// a move is a set of cards picked from a hand and then played.
//
// Nothing here is written for one game. What is drawn is the plugin's
// projection of the state for the seat at the bottom, what lies between the
// hands is the plugin's to name (`onTable`), and the buttons are the actions
// the legal moves offer.

import {
  createGameForFamily, definitionFromResolved, createAI, findFamilyPlugin, interactionModelFor,
  settingsFor, applySettings,
} from '../packages/play/index.js'
import { renderTableState, serializeLayout, attachPieceImages } from '../packages/render/index.js'
import { getPlayableVariants, loadGalleryIndex, getGalleryIndex } from './play-shared.js'
import { resolveVariantBoard } from './variant-frontmatter.js'

const AI_DELAY_MS = 450

// What the buttons are for a set of legal moves. A move made of cards - play,
// give - is one button, pressed once the cards are picked; a move that carries
// a value, a bid, is a button per value; anything else is a move on its own.
function cardActions(moves) {
  const out = []
  for (const m of moves) {
    const name = m.action || 'play'
    const label = m.value !== undefined ? `${name} ${m.value}${m.points !== undefined ? ` (${m.points})` : ''}` : name
    if (!out.includes(label)) out.push(label)
  }
  return out
}

// The legal move the picked cards make, if they make one. Order does not
// matter: a pair picked king-first is the same pair.
function moveForSelection(moves, selected, action) {
  const want = [...selected].sort().join(',')
  // Nothing picked is a choice only where a move of no cards exists: rolling
  // every die again.
  if (!want && !moves.some(m => Array.isArray(m.cards) && !m.cards.length && (!action || m.action === action))) return null
  return moves.find(m => Array.isArray(m.cards) && (!action || m.action === action) && [...m.cards].sort().join(',') === want) || null
}

// A button for one of the moves a clicked card could be: what sets it apart
// from the others - the suit an eight names, the end a tile goes on.
function choiceLabel(move) {
  const { action: _a, cards: _c, ...rest } = move
  return Object.values(rest).join(' ') || move.action
}

// When every move is a single card played, a click on a card is the move.
function oneClick(moves) {
  return moves.length > 0 && moves.every(m => m.action === 'play' && Array.isArray(m.cards) && m.cards.length === 1)
}

export function createCardSession(options = {}) {
  const {
    family, variant, container,
    opponent = 'ai', difficulty = 'medium', seat = '0',
    legendContainer = null, onStatus = null, embed = null,
    settings = {},
  } = options

  let game = null
  let plugin = null
  let ai = null
  let resolved = null
  let images = null
  let humanIdx = 0
  let selected = new Set()
  // The moves one clicked card could be, while the player picks between them.
  let choice = null
  let history = []
  let timer = null
  let over = false

  const names = () => game?.raw?.definition?.players?.names || []
  const current = () => game.getState().players.currentIndex
  const isAi = (i) => !!ai && i !== humanIdx
  const legal = () => (over ? [] : game.getLegalMoves())
  // Seats at one screen take turns at the bottom of the table; against the
  // computer the person's seat is always there.
  const viewSeat = () => (ai ? humanIdx : current())

  async function start() {
    clearTimeout(timer)
    over = false
    history = []
    selected = new Set()
    choice = null
    const entry = getPlayableVariants(family).find(e => e.variant === variant)
    resolved = await resolveVariantBoard(family, {}, variant, entry?.slug || variant, entry?.path)
    const definition = definitionFromResolved(family, variant, applySettings(resolved, family, settings), {})
    game = createGameForFamily(family, { variant, definition, rngSeed: Math.floor(Math.random() * 1000000) })
    plugin = findFamilyPlugin(game.raw.registry.getPlugins(), family)
    ai = opponent === 'ai' ? createAI(family, variant, { difficulty, definition }) : null
    humanIdx = /^\d+$/.test(String(seat)) ? Math.min(parseInt(seat, 10), names().length - 1) : Math.max(0, names().indexOf(seat))

    await loadGalleryIndex()
    images = attachPieceImages(resolved, getGalleryIndex() || []).images || null
    if (legendContainer) legendContainer.innerHTML = ''

    draw()
    status()
    scheduleAi()
  }

  function draw() {
    if (!container || !game) return
    const slice = game.getState().slice
    const seatAtBottom = viewSeat()
    const projected = plugin.projectForSeat(slice, seatAtBottom)
    const hands = projected.hands.map((h, i) => (i === seatAtBottom && plugin.sortForDisplay ? plugin.sortForDisplay(h) : h))
    const view = { ...projected, hands }
    const seatNames = names().map(capitalize)
    const layout = renderTableState({
      view,
      seat: seatAtBottom,
      names: seatNames,
      current: over ? null : current(),
      table: plugin.onTable ? plugin.onTable(projected, seatNames) : [],
      card: plugin.cardOf,
      deckType: plugin.deckType,
      images,
      selected: [...selected],
    })
    container.innerHTML = serializeLayout(layout, { title: resolved?._variantMeta?.title || variant })
    const svg = container.querySelector('svg')
    if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.style.width = '100%'; svg.style.height = 'auto' }
    for (const el of container.querySelectorAll('[data-card-id]')) {
      el.addEventListener('click', () => toggle(el.getAttribute('data-card-id')))
    }
  }

  function toggle(id) {
    if (over || isAi(current())) return
    const moves = legal()
    const result = interactionModelFor(family).handleClick(id, { moves })
    if (result.type === 'move') { apply(result.move); return }
    if (result.type === 'choice') {
      choice = result.candidates
      selected = new Set([id])
      draw()
      if (onStatus) onStatus({ text: 'Choose how to play it', gameOver: false })
      return
    }
    choice = null
    if (result.type === 'reject' && !selected.has(id)) {
      if (onStatus) onStatus({ text: 'That card cannot be played now', gameOver: false })
      return
    }
    if (selected.has(id)) selected.delete(id)
    else selected.add(id)
    draw()
    status()
  }

  function status(lastMove) {
    if (!onStatus || !game) return
    if (over) return
    const who = capitalize(names()[current()] || '')
    const picked = selected.size ? ` · ${selected.size} picked` : ''
    onStatus({ text: `${who} to play${picked}`, gameOver: false, lastMove })
  }

  function apply(move) {
    const seatThatMoved = current()
    const res = game.applyMove(move)
    if (!res || !res.ok) return false
    selected = new Set()
    choice = null
    const notation = (plugin.describeMove && plugin.describeMove(move, game.getState().slice)) || move.action || ''
    history.push({ move, player: names()[seatThatMoved], notation })
    if (embed) embed.post('move', { move, state: summarise() })
    if (res.winner !== undefined && res.winner !== null) {
      over = true
      draw()
      const result = plugin.describeResult ? plugin.describeResult(game.getState().slice, names().map(capitalize)) : null
      const text = result || (res.winner === 'draw' ? 'Draw' : `${capitalize(names()[res.winner] ?? String(res.winner))} wins`)
      if (onStatus) onStatus({ text, gameOver: true, lastMove: notation })
      if (embed) embed.post('gameOver', { winner: res.winner })
      return true
    }
    draw()
    status(notation)
    scheduleAi()
    return true
  }

  function scheduleAi() {
    clearTimeout(timer)
    if (over || !ai || !isAi(current())) return
    timer = setTimeout(() => {
      if (over || !isAi(current())) return
      const move = ai.pickMove(game.getState().slice, current())
      if (move) apply(move)
    }, AI_DELAY_MS)
  }

  function performAction(action) {
    if (over || isAi(current())) return false
    if (choice) {
      const move = choice.find(m => choiceLabel(m) === action)
      if (move) return apply(move)
    }
    const moves = legal()
    const [name, value] = String(action).split(' ')
    if (moves.some(m => m.action === name && Array.isArray(m.cards))) {
      const move = moveForSelection(moves, selected, name)
      if (!move) {
        if (onStatus) onStatus({ text: selected.size ? `Those cards cannot ${name} here` : `Pick the cards to ${name} first`, gameOver: false })
        return false
      }
      return apply(move)
    }
    const move = moves.find(m => m.action === name && (value === undefined || String(m.value) === value))
    return move ? apply(move) : false
  }

  function undo() {
    clearTimeout(timer)
    if (!game) return
    // Back to the last time it was the person's turn, past the computer's.
    do {
      if (!game.undo()) break
      history.pop()
    } while (ai && isAi(current()) && history.length)
    over = false
    selected = new Set()
    choice = null
    draw()
    status()
  }

  // The sidebar's line per seat, from what the person's seat can see.
  function describeSeats() {
    if (!game || !plugin.describeSeat) return []
    const view = plugin.projectForSeat(game.getState().slice, viewSeat())
    const rows = []
    names().forEach((name, seat) => {
      const detail = plugin.describeSeat(view, seat)
      if (detail) rows.push({ name, detail, active: !over && seat === current() })
    })
    return rows
  }

  function summarise() {
    if (!game) return null
    return { family, variant, current: names()[current()], moves: history.length, over }
  }

  const noop = () => {}
  return {
    get controller() { return { performAction } },
    get game() { return game },
    get scoring() { return null },
    get history() { return history },
    get fen() { return '' },
    get setup() { return null },
    get variantMeta() { return resolved?._variantMeta || null },
    get resolved() { return resolved },
    get playerNames() { return names() },
    // What the player may choose before a game: seats, rounds.
    get settings() { return resolved ? settingsFor(resolved, family, settings) : [] },
    start,
    draw,
    summarise,
    describeSeats,
    pass: () => performAction('pass'),
    resign: noop,
    undo,
    actions: () => {
      if (!game || isAi(current())) return []
      if (choice) return choice.map(choiceLabel)
      const moves = legal()
      return oneClick(moves) ? [] : cardActions(moves)
    },
    setTheme: noop,
    setPieceSet: noop,
    setPieceStyle: noop,
    setAnimStyle: noop,
    setAnimSpeed: noop,
    flip: noop,
    markDead: noop,
  }
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : '' }
