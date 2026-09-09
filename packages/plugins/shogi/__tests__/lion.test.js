import { createShogiPlugin } from '../index.js'

// engine#174. Chu Shogi's Lion was declared as a flat 24-square leaper. That is
// the right reach and none of the rest of the piece. Wikipedia writes it
// NAD[aK] and describes two separate powers:
//
//   "The lion can take a step in any direction up to twice per turn. It can
//    continue after a capture on the first step, potentially capturing two
//    pieces per turn. It can change directions after the first step."
//
//   "By returning to its starting square with the second step, it can
//    effectively capture a piece on an adjacent square without moving. This is
//    called igui ... It can step to an adjacent empty square and back without
//    capturing anything ... effectively passing a turn (jitto)."
//
//   "The lion can jump anywhere that it could step to on an empty board ...
//    bypassing any intervening piece."
//
// The jump and the two steps are different powers, not two spellings of one:
// the jump ignores what stands between and takes nothing on the way, the steps
// may take a piece on each.

const COLS = 12
const ROWS = 12
const at = (r, c) => r * COLS + c
const request = () => null
const turn = (i = 0) => ({ __players: { currentIndex: i } })

const CHU = { rows: ROWS, cols: COLS, drops: false, promotionZone: 4, royalType: 'king',
  pieceMoves: { lion: { betza: 'NAD[aK]' }, king: { betza: 'K' }, pawn: { betza: 'fW' } } }

function position(cells) {
  const plugin = createShogiPlugin(CHU)
  plugin.init({}, { request })
  const board = new Array(ROWS * COLS).fill(null)
  for (const [index, piece] of Object.entries(cells)) board[index] = piece
  return { plugin, slice: { board, hands: [[], []], _cols: COLS } }
}

const piece = (type, owner = 0) => ({ type, owner })
const CENTRE = at(6, 6)

// Kings parked far away so nothing here is about check.
const kings = { [at(0, 0)]: piece('king'), [at(11, 11)]: piece('king', 1) }

const lionMoves = (plugin, slice) =>
  plugin.getLegalMoves(slice, turn(0)).filter(m => m.from === CENTRE)

describe('the Lion takes two steps', () => {
  it('captures on the first step and again on the second', () => {
    const { plugin, slice } = position({
      ...kings,
      [CENTRE]: piece('lion'),
      [at(6, 7)]: piece('pawn', 1),
      [at(6, 8)]: piece('pawn', 1),
    })
    const move = lionMoves(plugin, slice).find(m => m.to === at(6, 8) && m.via === at(6, 7))
    expect(move).toBeDefined()

    const after = plugin.applyMove(move, slice, turn(0))
    expect(after.board[at(6, 7)]).toBeNull()          // taken on the way
    expect(after.board[at(6, 8)]).toEqual(piece('lion'))
    expect(after.board[CENTRE]).toBeNull()
  })

  it('may change direction between the steps', () => {
    // Two steps reach a knight's square, which no single King step does.
    const { plugin, slice } = position({ ...kings, [CENTRE]: piece('lion') })
    const knightSquare = lionMoves(plugin, slice).find(m => m.to === at(5, 8) && m.via !== undefined)
    expect(knightSquare).toBeDefined()
    expect([at(6, 7), at(5, 7), at(6, 8)]).toContain(knightSquare.via)
  })
})

describe('igui and jitto', () => {
  it('takes an adjacent piece and stays where it was', () => {
    const { plugin, slice } = position({
      ...kings, [CENTRE]: piece('lion'), [at(6, 7)]: piece('pawn', 1),
    })
    const igui = lionMoves(plugin, slice).find(m => m.to === CENTRE && m.via === at(6, 7))
    expect(igui).toBeDefined()

    const after = plugin.applyMove(igui, slice, turn(0))
    expect(after.board[at(6, 7)]).toBeNull()
    expect(after.board[CENTRE]).toEqual(piece('lion'))
  })

  it('may step out to an empty square and back, changing nothing', () => {
    const { plugin, slice } = position({ ...kings, [CENTRE]: piece('lion') })
    const jitto = lionMoves(plugin, slice).find(m => m.to === CENTRE)
    expect(jitto).toBeDefined()
    expect(slice.board[jitto.via]).toBeNull()

    const after = plugin.applyMove(jitto, slice, turn(0))
    expect(after.board[CENTRE]).toEqual(piece('lion'))
    expect(after.board.filter(Boolean)).toHaveLength(3)
  })

  it('cannot pass when every adjacent square is occupied by its own side', () => {
    // "Hence jitto is only possible if at least one adjacent square is empty."
    const cells = { ...kings, [CENTRE]: piece('lion') }
    for (const dr of [-1, 0, 1]) for (const dc of [-1, 0, 1]) {
      if (dr || dc) cells[at(6 + dr, 6 + dc)] = piece('pawn')
    }
    const { plugin, slice } = position(cells)
    expect(lionMoves(plugin, slice).some(m => m.to === CENTRE)).toBe(false)
  })
})

describe('the jump is a different power from the steps', () => {
  it('reaches a square two away with the intervening square blocked', () => {
    // A friendly piece between them stops the stepping route and not the jump.
    const { plugin, slice } = position({
      ...kings, [CENTRE]: piece('lion'), [at(6, 7)]: piece('pawn'),
    })
    const jump = lionMoves(plugin, slice).find(m => m.to === at(6, 8))
    expect(jump).toBeDefined()
    expect(jump.via).toBeUndefined()
  })

  it('takes nothing on the way when it jumps', () => {
    const { plugin, slice } = position({
      ...kings, [CENTRE]: piece('lion'), [at(6, 7)]: piece('pawn', 1),
    })
    const jump = lionMoves(plugin, slice).find(m => m.to === at(6, 8) && m.via === undefined)
    expect(jump).toBeDefined()
    const after = plugin.applyMove(jump, slice, turn(0))
    expect(after.board[at(6, 7)]).toEqual(piece('pawn', 1))
  })
})

describe('what the Lion threatens', () => {
  // Check is only observable through which moves come back legal: a side in
  // check may play nothing that leaves it there.
  const inCheck = (plugin, slice) => {
    const moves = plugin.getLegalMoves(slice, turn(1))
    const idle = moves.find(m => m.from === at(0, 6))   // the distant pawn
    return moves.length > 0 && idle === undefined
  }

  it('attacks a square two steps away', () => {
    const { plugin, slice } = position({
      [at(0, 0)]: piece('king'),
      [CENTRE]: piece('lion'),
      [at(6, 8)]: piece('king', 1),
      [at(0, 6)]: piece('pawn', 1),
    })
    expect(inCheck(plugin, slice)).toBe(true)
  })

  it('does not attack a square three steps away', () => {
    const { plugin, slice } = position({
      [at(0, 0)]: piece('king'),
      [CENTRE]: piece('lion'),
      [at(6, 9)]: piece('king', 1),
      [at(0, 6)]: piece('pawn', 1),
    })
    expect(inCheck(plugin, slice)).toBe(false)
  })

  it('a stepper with no jump is stopped by its own piece', () => {
    // NAD covers every square at distance two, so a Lion's threat is never
    // blocked - the jump always reaches what the steps reach. The blocking rule
    // in the primitive is for pieces that chain without a jump, which is what
    // Tenjiku's vice general and fire demon are.
    const stepper = { rows: ROWS, cols: COLS, drops: false, promotionZone: 4, royalType: 'king',
      pieceMoves: { walker: { betza: '[aK]' }, king: { betza: 'K' }, pawn: { betza: 'fW' } } }

    const build = (cells) => {
      const plugin = createShogiPlugin(stepper)
      plugin.init({}, { request })
      const board = new Array(ROWS * COLS).fill(null)
      for (const [i, pc] of Object.entries(cells)) board[i] = pc
      return { plugin, slice: { board, hands: [[], []], _cols: COLS } }
    }
    const checked = ({ plugin, slice }) => {
      const moves = plugin.getLegalMoves(slice, turn(1))
      return moves.length > 0 && !moves.some(m => m.from === at(0, 6))
    }

    const base = { [at(0, 0)]: piece('king'), [CENTRE]: piece('walker'),
      [at(6, 8)]: piece('king', 1), [at(0, 6)]: piece('pawn', 1) }

    expect(checked(build(base))).toBe(true)
    expect(checked(build({ ...base, [at(6, 7)]: piece('pawn'), [at(5, 7)]: piece('pawn'), [at(7, 7)]: piece('pawn') }))).toBe(false)
  })
})

// The tests above build their own config, so they prove the engine can play a
// Lion and not that the corpus asks it to. This reads what chu-shogi declares.
describe('chu-shogi declares the Lion this way', () => {
  it('gives its Lion the two-step move, not a flat leaper', async () => {
    await import('../../../play/test-helpers/setup-rules-reader.js')
    const { resolveVariantSync } = await import('../../../play/src/resolve-frontmatter.js')
    const { readFileSync } = await import('fs')
    const { join } = await import('path')

    const rules = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')
    const read = (family, slug) => readFileSync(slug === 'rulebook'
      ? join(rules, family, 'content', 'rulebook.md')
      : join(rules, family, 'content', 'variants', `${slug}.md`), 'utf8')

    const resolved = resolveVariantSync('shogi', 'chu-shogi', read)
    const config = { ...(resolved.plugins && resolved.plugins.shogi), rows: 12, cols: 12 }
    expect(config.pieceMoves && config.pieceMoves.lion).toBeTruthy()

    const plugin = createShogiPlugin(config)
    plugin.init({}, { request })

    const board = new Array(144).fill(null)
    const centre = 6 * 12 + 6
    board[centre] = piece('lion')
    board[0] = piece(config.royalType || 'king')
    board[143] = piece(config.royalType || 'king', 1)
    const slice = { board, hands: [[], []], _cols: 12 }

    const moves = plugin.getLegalMoves(slice, turn(0)).filter(m => m.from === centre)
    expect(moves.some(m => m.via !== undefined)).toBe(true)   // two steps
    expect(moves.some(m => m.to === centre)).toBe(true)       // jitto
  })
})

// engine#174 names undo alongside the move shape, so it is asserted rather
// than assumed. Undo restores a snapshot rather than reversing a move, which
// is why a two-leg move needs nothing special from it - but that is a claim
// about the code, and this is the check.
describe('a two-leg move survives undo', () => {
  it('puts both captured pieces back', async () => {
    await import('../../../play/test-helpers/setup-rules-reader.js')
    const { createGameForFamily } = await import('../../../play/src/play.js')

    const game = await createGameForFamily('shogi', { variant: 'chu-shogi' })
    const before = JSON.stringify(game.getState().slice.board)

    // Play on until a move carrying `via` appears, then take it.
    let played = null
    for (let ply = 0; ply < 40 && !played; ply++) {
      const moves = game.getLegalMoves()
      if (!moves.length) break
      const area = moves.find(m => m.via !== undefined)
      if (area) { game.applyMove(area); played = area; break }
      game.applyMove(moves[ply % moves.length])
    }
    expect(played).not.toBeNull()

    // Unwind everything and the opening position must be back, piece for piece.
    while (game.undo()) { /* to the start */ }
    expect(JSON.stringify(game.getState().slice.board)).toBe(before)
  })
})
