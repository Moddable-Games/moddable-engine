// Djambi's defining mechanic is that a captured piece does not leave: it
// becomes a corpse that stays on the board and blocks. The variant module
// declared that rule as `hooks: { afterCapture }`, and the chess plugin has no
// hooks system at all - only the go plugin does, and its set has no
// afterCapture either. It also declared a `turnLogic` for the forced placement
// phase, and the plugin gated turnLogic to two-player variants, so a
// four-player game never called that either.
//
// Two declarations, both read by nothing, both for the rule the game is named
// after. Played out, 25 of 36 pieces vanished in 24 plies and not one corpse
// ever reached the board - ordinary chess with Djambi's names on it.
import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

const CELLS = 81
const MAZE = 40

function play(plies = 90) {
  const game = createGameForFamily('chess', { variant: 'djambi', rngSeed: 7 })
  let placementsOffered = 0
  let maxCorpses = 0
  let played = 0
  for (; played < plies; played++) {
    const moves = game.getLegalMoves()
    if (moves.length === 0) break
    const placements = moves.filter(m => m.action === 'placeCorpse')
    if (placements.length) placementsOffered++
    const board = game.getState().slice.board
    const captures = moves.filter(m => m.action === undefined && board[m.to])
    const move = placements[0] || captures[0] || moves[played % moves.length]
    const result = game.applyMove(move)
    if (result && result.ok === false) throw new Error(`rejected at ply ${played}: ${result.reason}`)
    const corpses = game.getState().slice.board.filter(c => c && c.type === 'corpse').length
    if (corpses > maxCorpses) maxCorpses = corpses
    if (game.checkWin() != null) break
  }
  return { game, board: game.getState().slice.board, placementsOffered, maxCorpses, played }
}

const count = (board, fn) => board.filter(c => c && fn(c)).length

describe('djambi opens as a four-player game', () => {
  const board = createGameForFamily('chess', { variant: 'djambi' }).getState().slice.board

  it('is a 9x9 board with four armies of nine', () => {
    expect(board.length).toBe(CELLS)
    const perOwner = [0, 1, 2, 3].map(o => count(board, c => c.owner === o))
    expect(perOwner).toEqual([9, 9, 9, 9])
  })

  it('fields all six piece types and exactly one chief per army', () => {
    const types = [...new Set(board.filter(Boolean).map(c => c.type))].sort()
    expect(types).toEqual(['assassin', 'chief', 'diplomat', 'militant', 'necromobile', 'reporter'])
    const chiefs = [0, 1, 2, 3].map(o => count(board, c => c.owner === o && c.type === 'chief'))
    expect(chiefs).toEqual([1, 1, 1, 1])
  })

  it('leaves the maze empty at the start', () => {
    expect(board[MAZE]).toBeNull()
  })
})

describe('captured pieces become corpses', () => {
  const run = play()

  it('offers the killer a placement after a kill', () => {
    expect(run.placementsOffered).toBeGreaterThan(0)
  })

  // Duck chess keeps one blocker and clears the previous square. Corpses do
  // not do that - they pile up, and the pile is the game.
  it('accumulates them rather than moving a single one about', () => {
    expect(run.maxCorpses).toBeGreaterThan(3)
  })

  // The count that proves nothing is being quietly removed: living pieces plus
  // corpses must always equal the 36 the game started with.
  it('never destroys a piece', () => {
    const living = count(run.board, c => c.owner >= 0)
    const corpses = count(run.board, c => c.type === 'corpse')
    expect(living + corpses).toBe(36)
    expect(corpses).toBeGreaterThan(0)
  })

  // Ordinary generation treats any cell the mover does not own as takeable, so
  // every piece could eat the bodies. Seven reached the board in one run and
  // none survived to the end.
  it('does not let anyone capture a corpse', () => {
    const { game } = run
    const board = game.getState().slice.board
    const corpseSquares = board.map((c, i) => (c && c.type === 'corpse' ? i : -1)).filter(i => i >= 0)
    expect(corpseSquares.length).toBeGreaterThan(0)
    const onto = game.getLegalMoves().filter(m => m.action === undefined && corpseSquares.includes(m.to))
    expect(onto).toEqual([])
  })

  it('gives every corpse the unowned seat', () => {
    const wrong = run.board.filter(c => c && c.type === 'corpse' && c.owner !== -1)
    expect(wrong).toEqual([])
  })
})

describe('the maze', () => {
  it('admits no piece but a chief', () => {
    const { game } = play(40)
    const board = game.getState().slice.board
    const intruders = game.getLegalMoves().filter(m => {
      if (m.action || m.to !== MAZE) return false
      const piece = board[m.from]
      return piece && piece.type !== 'chief'
    })
    expect(intruders).toEqual([])
  })
})
