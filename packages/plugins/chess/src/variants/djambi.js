/**
 * Djambi (Machiavelli) - four-player political strategy.
 *
 * Rules verified against fr.wikipedia.org/wiki/Djambi and
 * chessvariants.com/multiplayer.dir/djambi.html, which agree on every point
 * below. Where they are silent, the file says so rather than guessing.
 *
 * Every piece moves as a queen; the militant is that capped at two squares.
 * That is frontmatter. What is here is the part that is not movement: who
 * kills, what a kill leaves behind, and who ends up commanding it.
 */

const MAZE = 40 // centre of a 9x9 board: 4 * 9 + 4
const CORPSE = { type: 'corpse', owner: -1 }
const COLS = 9

const isCorpse = (cell) => !!cell && cell.owner < 0
const isLiving = (cell) => !!cell && cell.owner >= 0

function orthogonal(pos) {
  const row = Math.trunc(pos / COLS)
  const col = pos % COLS
  const out = []
  if (row > 0) out.push(pos - COLS)
  if (row < COLS - 1) out.push(pos + COLS)
  if (col > 0) out.push(pos - 1)
  if (col < COLS - 1) out.push(pos + 1)
  return out
}

function chiefSeatAt(board, pos) {
  const cell = board[pos]
  return cell && cell.type === 'chief' && cell.owner >= 0 ? cell.owner : null
}

// "Un chef privé de mobilité est un chef mort. L'encerclement est réalisé par
// les morts et les côtés du plateau de jeu." Two documented exemptions: a
// party holding a necromobile can always dig itself out, and a chief in the
// centre cell cannot be eliminated this way.
function isEncircled(board, seat) {
  const chiefPos = board.findIndex(c => c && c.type === 'chief' && c.owner === seat)
  if (chiefPos < 0) return false
  if (chiefPos === MAZE) return false
  if (board.some(c => c && c.owner === seat && c.type === 'necromobile')) return false
  return orthogonal(chiefPos).every(adj => isCorpse(board[adj]))
}

export const djambi = {
  key: 'djambi',
  slug: 'djambi',
  hidden: true,

  moveFilter(moves, state) {
    // A body still in hand is the only thing on offer.
    if (state._pending) return moves.filter(m => m.action === 'placePiece')

    const board = state.board
    return moves.filter(m => {
      if (m.action) return true
      const mover = board[m.from]
      if (!mover) return true
      const target = board[m.to]

      switch (mover.type) {
        // "il se place non pas dans la case de sa cible, mais a cote". The
        // reporter never moves onto anything; it lands on an empty square and
        // the killing happens around it.
        case 'reporter':
          return !target

        // "Il utilise n'importe quel cadavre gisant sur le terrain en prenant
        // sa place." The necromobile is the only piece that touches a body,
        // and it moves one rather than taking it.
        case 'necromobile':
          return !target || isCorpse(target)

        // "Il peut agir sur n'importe quelle piece ennemie en se mettant a sa
        // place; elle ne peut pas deplacer les pieces de son camp, ni les
        // mortes." Displaces, never kills.
        case 'diplomat':
          return !target || (isLiving(target) && target.owner !== mover.owner)

        // "ne peuvent pas atteindre un chef etabli dans la case centrale."
        // The militant is the only piece the centre protects against.
        case 'militant':
          if (target && m.to === MAZE && target.type === 'chief') return false
          return !isCorpse(target)

        default:
          return !isCorpse(target)
      }
    }).filter(m => {
      // "Seul un chef de parti peut l'occuper en permanence." A chief may take
      // the centre whenever it can reach it. Anything else may cross the empty
      // centre but not stop there - except to act on the chief in power, since
      // "l'assassin, le reporter, le provocateur" can all reach a chief there.
      //
      // Known simplification: after such a strike the attacker is left
      // standing on the centre, and neither source says how it is required to
      // leave. Recorded in the variant's `approximations` rather than guessed.
      if (m.action || m.to !== MAZE) return true
      const mover = board[m.from]
      if (!mover) return false
      if (mover.type === 'chief') return true
      const occupant = board[MAZE]
      return isLiving(occupant) && occupant.owner !== mover.owner
    })
  },

  // A kill or a displacement leaves something to put down, and the turn is not
  // over until it is down.
  turnLogic(ctx) {
    return ctx.slice._pending !== undefined && ctx.slice._pending !== null
  },

  afterMove(ctx) {
    const { move, captured, board, slice, playerIdx } = ctx
    const mover = board[move.to]
    if (!mover) return

    // The reporter kills by proximity, so it has no `captured` of its own.
    // "il eclabousse sa victime": every living enemy orthogonally adjacent to
    // where it lands dies, and "une piece tuee reste dans la case ou elle a
    // ete eclaboussee" - the bodies stay put, so there is nothing to place.
    //
    // Whether it also splashes its own pieces is not stated in either source.
    // Enemies only, which is the reading both articles' wording supports.
    if (mover.type === 'reporter') {
      for (const adj of orthogonal(move.to)) {
        const target = board[adj]
        if (isLiving(target) && target.owner !== mover.owner) board[adj] = { ...CORPSE }
      }
      return
    }

    if (!captured) return

    // "le cadavre de sa victime prend sa place de depart" - the assassin
    // cannot dress the scene, so its victim drops where the assassin set out
    // from. No choice, so no second phase.
    if (mover.type === 'assassin') {
      board[move.from] = { ...CORPSE }
      return
    }

    // The diplomat moves the living; the necromobile moves the dead. Both pick
    // up what was on the square and put it down again elsewhere, so both hand
    // back the piece exactly as it was.
    if (mover.type === 'diplomat' || mover.type === 'necromobile') {
      slice._pending = { type: captured.type, owner: captured.owner }
      return
    }

    // Chief and militant kill, and choose where the body goes.
    slice._pending = { ...CORPSE }
  },

  actions: {
    placePiece: {
      skipsCheckFilter: true,
      continuesTurn: false,
      generate(slice, playerIdx, { allPositions, getCell }) {
        if (!slice._pending) return []
        const out = []
        for (const pos of allPositions()) {
          if (getCell(slice.board, pos) !== null) continue
          // Nothing but a chief may be left standing in the centre, so the
          // diplomat cannot park an enemy there and no body can block it.
          if (pos === MAZE) continue
          out.push({ action: 'placePiece', to: pos })
        }
        return out
      },
      apply(move, { board, slice }) {
        board[move.to] = { ...slice._pending }
        return { board, sliceKeys: { _pending: null } }
      },
    },
  },

  // Applied after every move, whether or not it ended anything: who now
  // commands whose pieces, and who plays next.
  turnEffects(state, ctx) {
    const board = state.board
    // Seats already out. Without this the elimination re-fires on every
            // later move, and the dead party's pieces are handed to whoever
            // moved last - control drifted from the killer to a bystander.
    const eliminated = ctx.eliminated || []

    // "cette case confere des tours de jeu supplementaires au joueur qui y
    // place son chef de parti: il peut rejouer apres chaque intervention des
    // partis adverses." Not two moves in a row - one turn between each of the
    // others', which is a change to the order rather than an extra move.
    const inPower = chiefSeatAt(board, MAZE)

    for (const seat of [0, 1, 2, 3]) {
      if (eliminated.includes(seat)) continue
      const hasChief = board.some(c => c && c.type === 'chief' && c.owner === seat)

      // "les pieces restantes passent sous le controle du parti qui vient de
      // tuer le chef."
      if (!hasChief) return { eliminate: seat, controlTo: ctx.currentPlayer, interleave: inPower }

      // "Ses pieces deviennent des zombies, et obeiront aveuglement au chef
      // installe au pouvoir." With nobody in the centre there is no one to
      // obey, so the pieces simply stop.
      if (isEncircled(board, seat)) return { eliminate: seat, controlTo: inPower, interleave: inPower }
    }

    return { interleave: inPower }
  },

  // Answers one question only: is it over.
  winCondition(state) {
    const living = new Set()
    for (const cell of state.board) {
      if (cell && cell.type === 'chief' && cell.owner >= 0) living.add(cell.owner)
    }
    if (living.size === 1) return [...living][0]
    if (living.size === 0) return 'draw'
    return null
  },
}
