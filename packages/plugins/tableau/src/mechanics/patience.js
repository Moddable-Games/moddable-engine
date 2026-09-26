// Patience: Klondike, FreeCell and Spider (engine#184). One player, a
// tableau of columns, and cards moved one at a time or in runs until they are
// all home. What separates the three is data:
//
//     game: patience
//     columns: [1, 2, 3, 4, 5, 6, 7]   # cards dealt to each column
//     faceUp: top                      # top: only each column's last card; all: everything
//     build: alternate-colour          # a tableau card takes one a rank lower: alternate-colour | any-suit
//     lift: alternate-colour           # which runs move together: alternate-colour | same-suit | one
//     supermove: true                  # a run is limited to (free cells + 1) x 2^(empty columns)
//     emptyColumn: K                   # K: only a King or a run it heads; any
//     foundations: 4                   # built up by suit from the Ace, one per suit and copy
//     completeRuns: 8                  # instead: a run King down to Ace in one suit leaves the tableau
//     freeCells: 4
//     stock: waste                     # waste: turned onto a waste pile, recycled when empty; columns: one to each column
//     drawCount: 1                     # cards turned from the stock at a time
//     foundationToTableau: true        # a card may come back off a foundation
//
// A move names the card it picks up and where it goes: `{ action: 'move',
// cards: [id], to: 'column 3' }`. The card may head a run, and the run below
// it goes too. A face-down card left on top of a column turns over.

const RED = new Set(['hearts', 'diamonds'])

function settings(ctx) {
  const c = ctx.config
  return {
    columns: c.columns || [],
    faceUp: c.faceUp || 'top',
    build: c.build || 'alternate-colour',
    lift: c.lift || 'alternate-colour',
    supermove: !!c.supermove,
    emptyColumn: c.emptyColumn === undefined ? 'any' : String(c.emptyColumn),
    foundations: Number(c.foundations || 0),
    completeRuns: Number(c.completeRuns || 0),
    freeCells: Number(c.freeCells || 0),
    stock: c.stock || null,
    drawCount: Math.max(1, Number(c.drawCount || 1)),
    back: !!c.foundationToTableau,
  }
}

const rankOf = (ctx, id) => ctx.card(id).rankValue
const suitOf = (ctx, id) => ctx.card(id).suit
const colourOf = (ctx, id) => (RED.has(suitOf(ctx, id)) ? 'red' : 'black')

// Does `upper` go on `lower` in the tableau?
function builds(upper, lower, rule, ctx) {
  if (rankOf(ctx, lower) !== rankOf(ctx, upper) + 1) return false
  if (rule === 'alternate-colour') return colourOf(ctx, upper) !== colourOf(ctx, lower)
  if (rule === 'same-suit') return suitOf(ctx, upper) === suitOf(ctx, lower)
  return true
}

// Is the run from this index to the end of the column one that lifts together?
function liftable(column, from, s, ctx) {
  if (!column[from].up) return false
  if (from === column.length - 1) return true
  if (s.lift === 'one' && !s.supermove) return false
  const rule = s.lift === 'one' ? s.build : s.lift
  for (let k = from; k < column.length - 1; k++) {
    if (!column[k + 1].up || !builds(column[k + 1].id, column[k].id, rule, ctx)) return false
  }
  return true
}

// Where each card is: a column (and how deep), the waste, a cell or a foundation.
function locate(slice, id) {
  for (let c = 0; c < slice.columns.length; c++) {
    const at = slice.columns[c].findIndex(x => x.id === id)
    if (at >= 0) return { where: 'column', index: c, at }
  }
  if (slice.waste.length && slice.waste[slice.waste.length - 1] === id) return { where: 'waste' }
  const cell = slice.cells.indexOf(id)
  if (cell >= 0) return { where: 'cell', index: cell }
  for (const [key, pile] of Object.entries(slice.foundations)) {
    if (pile.length && pile[pile.length - 1] === id) return { where: 'foundation', key }
  }
  return null
}

function foundationKey(slice, id, ctx) {
  // One foundation per suit and copy: the first of this suit that takes it.
  const suit = suitOf(ctx, id)
  const rank = rankOf(ctx, id)
  for (const [key, pile] of Object.entries(slice.foundations)) {
    if (!key.startsWith(`${suit}:`)) continue
    const top = pile.length ? rankOf(ctx, pile[pile.length - 1]) : 0
    if (top === rank - 1) return key
  }
  return null
}

function deal(base, ctx) {
  const s = settings(ctx)
  const pool = [...(base.drawPile || [])]
  const columns = s.columns.map(n => {
    const cards = pool.splice(0, n)
    return cards.map((id, k) => ({ id, up: s.faceUp === 'all' || k === cards.length - 1 }))
  })
  const foundations = {}
  if (s.foundations) {
    const suits = [...new Set(ctx.deck.map(c => c.suit))]
    const copies = Math.max(1, Math.round(s.foundations / suits.length))
    for (const suit of suits) for (let k = 0; k < copies; k++) foundations[`${suit}:${k + 1}`] = []
  }
  return {
    hands: [[]],
    community: [],
    drawPile: [],
    columns,
    stock: pool,
    waste: [],
    cells: Array(s.freeCells).fill(null),
    foundations,
    completed: [],
    finished: null,
    next: 0,
  }
}

// A face-down card left on top of a column turns over, and in a game of
// complete runs a finished run leaves.
function settle(slice, s, ctx) {
  let columns = slice.columns.map(col => (col.length && !col[col.length - 1].up
    ? [...col.slice(0, -1), { ...col[col.length - 1], up: true }]
    : col))
  const completed = [...slice.completed]
  if (s.completeRuns) {
    columns = columns.map(col => {
      if (col.length < 13) return col
      const run = col.slice(-13)
      const whole = run.every((x, k) => x.up && rankOf(ctx, x.id) === 13 - k && suitOf(ctx, x.id) === suitOf(ctx, run[0].id))
      if (!whole) return col
      completed.push(run[0].id)
      const rest = col.slice(0, -13)
      return rest.length && !rest[rest.length - 1].up ? [...rest.slice(0, -1), { ...rest[rest.length - 1], up: true }] : rest
    })
  }
  const next = { ...slice, columns, completed }
  const home = s.completeRuns
    ? completed.length >= s.completeRuns
    : Object.values(next.foundations).every(p => p.length === 13)
  if (home) return { ...next, finished: 0, stuck: false }
  // "The game is lost when no legal moves remain."
  if (!movesFor(next, ctx).length) return { ...next, finished: 'draw', stuck: true }
  return next
}

function runLimit(slice, s, toEmpty) {
  if (!s.supermove) return Infinity
  const freeCells = slice.cells.filter(c => c === null).length
  const empty = slice.columns.filter(c => !c.length).length - (toEmpty ? 1 : 0)
  return (freeCells + 1) * 2 ** Math.max(0, empty)
}

function movesFor(slice, ctx) {
  const s = settings(ctx)
  const out = []
  const sources = []
  slice.columns.forEach((col, c) => {
    col.forEach((card, at) => { if (liftable(col, at, s, ctx)) sources.push({ id: card.id, from: 'column', index: c, length: col.length - at }) })
  })
  if (slice.waste.length) sources.push({ id: slice.waste[slice.waste.length - 1], from: 'waste', length: 1 })
  slice.cells.forEach((id, i) => { if (id) sources.push({ id, from: 'cell', index: i, length: 1 }) })
  if (s.back) {
    for (const pile of Object.values(slice.foundations)) if (pile.length) sources.push({ id: pile[pile.length - 1], from: 'foundation', length: 1 })
  }

  for (const src of sources) {
    slice.columns.forEach((col, c) => {
      if (src.from === 'column' && src.index === c) return
      if (!col.length) {
        if (s.emptyColumn === 'K' && rankOf(ctx, src.id) !== 13) return
        if (src.length > runLimit(slice, s, true)) return
        // A single card already alone in its column gains nothing by moving to another empty one.
        if (src.from === 'column' && src.length === slice.columns[src.index].length) return
        out.push({ action: 'move', cards: [src.id], to: `column ${c + 1}` })
        return
      }
      const top = col[col.length - 1]
      if (!top.up || !builds(src.id, top.id, s.build, ctx)) return
      if (src.length > runLimit(slice, s, false)) return
      out.push({ action: 'move', cards: [src.id], to: `column ${c + 1}` })
    })
    if (src.length === 1 && src.from !== 'foundation' && s.foundations && foundationKey(slice, src.id, ctx)) {
      out.push({ action: 'move', cards: [src.id], to: 'foundation' })
    }
    if (src.length === 1 && src.from !== 'cell' && src.from !== 'foundation' && slice.cells.includes(null)) {
      out.push({ action: 'move', cards: [src.id], to: 'free cell' })
    }
  }

  if (s.stock === 'waste') {
    if (slice.stock.length) out.push({ action: 'draw' })
    else if (slice.waste.length) out.push({ action: 'redeal' })
  }
  if (s.stock === 'columns' && slice.stock.length && slice.columns.every(col => col.length)) out.push({ action: 'deal' })
  return out
}

export const patience = {
  init(base, ctx) {
    return settle(deal(base, ctx), settings(ctx), ctx)
  },

  firstPlayer() {
    return 0
  },

  legalMoves(slice, seat, ctx) {
    return movesFor(slice, ctx)
  },

  apply(move, slice, seat, ctx) {
    const s = settings(ctx)
    if (move.action === 'draw') {
      const turned = slice.stock.slice(0, s.drawCount)
      return settle({ ...slice, stock: slice.stock.slice(turned.length), waste: [...slice.waste, ...turned], next: 0 }, s, ctx)
    }
    if (move.action === 'redeal') {
      return { ...slice, stock: [...slice.waste], waste: [], next: 0 }
    }
    if (move.action === 'deal') {
      const dealt = slice.stock.slice(0, slice.columns.length)
      const columns = slice.columns.map((col, c) => (dealt[c] ? [...col, { id: dealt[c], up: true }] : col))
      return settle({ ...slice, columns, stock: slice.stock.slice(dealt.length), next: 0 }, s, ctx)
    }

    const id = move.cards[0]
    const from = locate(slice, id)
    let moving
    const next = {
      ...slice,
      columns: slice.columns.map(col => [...col]),
      waste: [...slice.waste],
      cells: [...slice.cells],
      foundations: Object.fromEntries(Object.entries(slice.foundations).map(([k, p]) => [k, [...p]])),
      next: 0,
    }
    if (from.where === 'column') moving = next.columns[from.index].splice(from.at)
    else if (from.where === 'waste') moving = [{ id: next.waste.pop(), up: true }]
    else if (from.where === 'cell') { moving = [{ id, up: true }]; next.cells[from.index] = null }
    else { moving = [{ id: next.foundations[from.key].pop(), up: true }] }

    if (move.to === 'foundation') next.foundations[foundationKey(slice, id, ctx)].push(id)
    else if (move.to === 'free cell') next.cells[next.cells.indexOf(null)] = id
    else {
      const c = Number(String(move.to).replace('column ', '')) - 1
      next.columns[c].push(...moving.map(x => ({ ...x, up: true })))
    }
    return settle(next, s, ctx)
  },

  winner(slice) {
    return slice.finished
  },

  project(slice) {
    return {
      ...slice,
      columns: slice.columns.map(col => col.map(x => (x.up ? x : { id: null, up: false }))),
      stock: slice.stock.map(() => null),
    }
  },

  table(view, ctx) {
    const s = settings(ctx)
    const groups = []
    if (s.stock) groups.push({ label: `Stock ${view.stock.length}`, cards: view.stock.length ? [null] : [], layout: 'pile' })
    if (s.stock === 'waste') groups.push({ label: 'Waste', cards: view.waste.slice(-Math.min(3, s.drawCount)), layout: 'pile', selectable: true })
    if (s.freeCells) groups.push({ label: 'Free cells', cards: view.cells.filter(Boolean), slots: s.freeCells, layout: 'pile', selectable: true })
    if (s.foundations) {
      const tops = Object.values(view.foundations).filter(p => p.length).map(p => p[p.length - 1])
      groups.push({ label: 'Foundations', cards: tops, slots: Object.keys(view.foundations).length, layout: 'pile', selectable: s.back })
    }
    if (s.completeRuns) groups.push({ label: `Completed ${view.completed.length} of ${s.completeRuns}`, cards: view.completed, slots: s.completeRuns, layout: 'pile' })
    view.columns.forEach((col, c) => groups.push({ label: `column ${c + 1}`, cards: col.map(x => x.id), layout: 'column', selectable: true }))
    return groups
  },

  describeSeat(view, seat, ctx) {
    const s = settings(ctx)
    if (s.completeRuns) return `${view.completed.length} of ${s.completeRuns} runs complete`
    const home = Object.values(view.foundations).reduce((n, p) => n + p.length, 0)
    return `${home} of ${ctx.deck.length} cards home`
  },

  result(slice, ctx) {
    if (slice.finished === 0) return 'Solved: every card is home'
    if (slice.stuck) return `No moves left: ${patience.describeSeat(slice, 0, ctx)}`
    return null
  },

  // Home first, then a move that uncovers a face-down card, then the stock.
  // Shuffling a run between columns uncovers nothing, so it is the last resort.
  policy(view, seat, moves) {
    const uncovers = (m) => view.columns.some(col => {
      const at = col.findIndex(x => x.id === m.cards[0])
      return at > 0 && col[at - 1].id === null
    })
    return moves.find(m => m.to === 'foundation')
      || moves.find(m => m.action === 'move' && uncovers(m))
      || moves.find(m => m.action === 'draw' || m.action === 'deal')
      || moves.find(m => m.action === 'redeal')
      || moves[0] || null
  },

  describe(move, ctx) {
    if (move.action !== 'move') return move.action
    const face = ctx.card(move.cards[0])?.display || move.cards[0]
    return `${face} to ${move.to}`
  },
}
