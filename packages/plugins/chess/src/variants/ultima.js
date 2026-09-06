/**
 * Ultima (Baroque Chess), Robert Abbott 1962.
 *
 * Rules transcribed from the variant file in moddable-rules, which cites
 * chessvariants.com/other.dir/ultima.html and en.wikipedia.org/wiki/Baroque_chess.
 *
 * One premise: every piece has its own way of taking, and none of them is
 * "move onto it". Movement is a queen slide for everything but the King, and it
 * never captures; what a move takes is decided by where it lands, what it
 * leaves behind, or what it jumps.
 *
 * So the movement is frontmatter and this file is the six capture methods, the
 * freeze, and a win condition that is a capture rather than a mate.
 */

const COLS = 8
const ROWS = 8

const row = (pos) => Math.trunc(pos / COLS)
const col = (pos) => pos % COLS
const at = (r, c) => r * COLS + c
const onBoard = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS

const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
]

const enemyAt = (board, pos, seat) => {
  const cell = board[pos]
  return cell && cell.owner !== seat ? cell : null
}

function neighbours(pos) {
  const out = []
  for (const [dr, dc] of DIRECTIONS) {
    const r = row(pos) + dr
    const c = col(pos) + dc
    if (onBoard(r, c)) out.push({ pos: at(r, c), dr, dc })
  }
  return out
}

function findKing(board, seat) {
  for (let i = 0; i < board.length; i++) {
    const cell = board[i]
    if (cell && cell.owner === seat && cell.type === 'king') return i
  }
  return -1
}

// A piece is frozen while an enemy Immobilizer stands next to it. The one
// exception the rules spell out: a Chameleon next to an enemy Immobilizer
// freezes it back, so neither moves.
function isImmobilized(board, pos) {
  const piece = board[pos]
  if (!piece) return false
  for (const { pos: adj } of neighbours(pos)) {
    const other = board[adj]
    if (!other || other.owner === piece.owner) continue
    if (other.type === 'immobilizer') return true
    if (other.type === 'chameleon' && piece.type === 'immobilizer') return true
  }
  return false
}

// --- the six capture methods -------------------------------------------------

// Withdrawer: moving directly away from a piece it was standing next to takes
// it. The direction of travel and the direction the victim lies in are the same
// line, and the victim is on the far side of where the mover started.
function withdrawalVictim(board, from, to, seat, matches) {
  const dr = Math.sign(row(to) - row(from))
  const dc = Math.sign(col(to) - col(from))
  if (dr === 0 && dc === 0) return null
  const br = row(from) - dr
  const bc = col(from) - dc
  if (!onBoard(br, bc)) return null
  const victim = enemyAt(board, at(br, bc), seat)
  if (!victim || !matches(victim)) return null
  return at(br, bc)
}

// Coordinator: with the mover on one corner of a rectangle and its own King on
// the opposite one, the two remaining corners are taken.
function coordinateVictims(board, to, seat, matches) {
  const king = findKing(board, seat)
  if (king < 0) return []
  const out = []
  for (const corner of [at(row(king), col(to)), at(row(to), col(king))]) {
    if (corner === to || corner === king) continue
    const victim = enemyAt(board, corner, seat)
    if (victim && matches(victim)) out.push(corner)
  }
  return out
}

// Pincer Pawn: anything now sandwiched between the mover and a friendly piece,
// along a rank or a file. Diagonals do not pinch.
function pincerVictims(board, to, seat, matches) {
  const out = []
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const vr = row(to) + dr
    const vc = col(to) + dc
    const ar = row(to) + dr * 2
    const ac = col(to) + dc * 2
    if (!onBoard(vr, vc) || !onBoard(ar, ac)) continue
    const victim = enemyAt(board, at(vr, vc), seat)
    if (!victim || !matches(victim)) continue
    const anchor = board[at(ar, ac)]
    if (anchor && anchor.owner === seat) out.push(at(vr, vc))
  }
  return out
}

// What a Chameleon may take by a given method: only pieces of the type that
// captures that way. Every other piece uses its own method against anything.
const chameleonTargets = {
  withdrawer: (piece) => piece.type === 'withdrawer',
  coordinator: (piece) => piece.type === 'coordinator',
  pincer: (piece) => piece.type === 'pawn',
  leap: (piece) => piece.type === 'longLeaper',
}
const anyPiece = () => true

export const ultima = {
  key: 'ultima',
  slug: 'ultima',
  hidden: true,

  // No check, no checkmate, no stalemate: the King is taken outright.
  noCheck: true,

  actions: {
    // The Long Leaper's capture is part of its move rather than a consequence
    // of it, so it is generated rather than applied afterwards: jump one enemy,
    // land on the empty square beyond, and carry on in the same line if another
    // enemy stands with a gap behind it.
    leap: {
      skipsCheckFilter: true,
      generate(slice, playerIdx) {
        const board = slice.board
        const moves = []
        for (let from = 0; from < board.length; from++) {
          const piece = board[from]
          if (!piece || piece.owner !== playerIdx) continue
          if (piece.type !== 'longLeaper' && piece.type !== 'chameleon') continue
          if (isImmobilized(board, from)) continue
          const matches = piece.type === 'chameleon' ? chameleonTargets.leap : anyPiece
          for (const [dr, dc] of DIRECTIONS) {
            walkLeaps(board, from, from, dr, dc, playerIdx, matches, [], moves)
          }
        }
        return moves
      },
      apply(move, { board, setCell, getCell }) {
        setCell(board, move.to, getCell(board, move.from))
        setCell(board, move.from, null)
        for (const victim of move.leapt) setCell(board, victim, null)
        return { board, halfmoveClock: 0 }
      },
    },
  },

  moveFilter(moves, state) {
    const board = state.board
    return moves.filter(move => {
      if (move.from !== undefined && isImmobilized(board, move.from)) return false
      if (move.action) return true
      const mover = board[move.from]
      if (!mover) return false
      // Only the King takes by moving onto a piece. Everything else slides to
      // an empty square and takes by consequence.
      if (mover.type !== 'king' && board[move.to]) return false
      return true
    })
  },

  afterMove(ctx) {
    const { board, move, playerIdx, piece } = ctx
    if (!piece || move.action === 'leap') return
    const type = piece.type
    if (type === 'king' || type === 'immobilizer') return

    const victims = []
    const isChameleon = type === 'chameleon'
    const may = (method) => (isChameleon ? chameleonTargets[method] : anyPiece)

    if (isChameleon || type === 'withdrawer') {
      const victim = withdrawalVictim(board, move.from, move.to, playerIdx, may('withdrawer'))
      if (victim !== null) victims.push(victim)
    }
    if (isChameleon || type === 'coordinator') {
      victims.push(...coordinateVictims(board, move.to, playerIdx, may('coordinator')))
    }
    if (isChameleon || type === 'pawn') {
      victims.push(...pincerVictims(board, move.to, playerIdx, may('pincer')))
    }

    for (const victim of new Set(victims)) board[victim] = null
  },

  // "Win by capturing the opponent's King on your turn. There is no check or
  // checkmate." A seat with no King has lost, whoever took it and however.
  winCondition(state, ctx) {
    const seats = ctx && ctx.config && ctx.config.playerCount ? ctx.config.playerCount : 2
    for (let seat = 0; seat < seats; seat++) {
      if (findKing(state.board, seat) < 0) return 1 - seat
    }
    return null
  },
}

// One leap, then any further leap from where it landed. Each victim may be
// taken once in a move; the rules allow several, on the same line or another.
function walkLeaps(board, origin, from, dr, dc, seat, matches, taken, out) {
  const vr = row(from) + dr
  const vc = col(from) + dc
  const lr = row(from) + dr * 2
  const lc = col(from) + dc * 2
  if (!onBoard(vr, vc) || !onBoard(lr, lc)) return
  const victimPos = at(vr, vc)
  const landing = at(lr, lc)
  if (taken.includes(victimPos)) return
  const victim = enemyAt(board, victimPos, seat)
  if (!victim || !matches(victim)) return
  if (board[landing]) return

  const leapt = [...taken, victimPos]
  out.push({ action: 'leap', from: origin, to: landing, leapt })
  for (const [ndr, ndc] of DIRECTIONS) {
    walkLeaps(board, origin, landing, ndr, ndc, seat, matches, leapt, out)
  }
}
