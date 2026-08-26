// Djambi, rule by rule. Verified against fr.wikipedia.org/wiki/Djambi and
// chessvariants.com/multiplayer.dir/djambi.html, which agree on every point
// asserted here.
//
// #131 recorded steps 1 and 2 as implemented when neither ran: the corpse rule
// was declared as `hooks: { afterCapture }` against a plugin with no hooks
// system, and the forced placement phase used a `turnLogic` the plugin gated
// to two-player variants. So each rule below is asserted from a built
// position, not inferred from a random playthrough.
import '../index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

const COLS = 9
const MAZE = 40
const at = (row, col) => row * COLS + col

const CORPSE = { type: 'corpse', owner: -1 }
const piece = (type, owner) => ({ type, owner })

function position(cells, currentIndex = 0) {
  const game = createGameForFamily('chess', { variant: 'djambi' })
  const slice = game.getState().slice
  const board = new Array(81).fill(null)
  for (const [square, cell] of Object.entries(cells)) board[Number(square)] = cell
  game.loadState({
    slice: { ...slice, board, _pending: null, halfmoveClock: 0, fullmoveNumber: 1 },
    players: { currentIndex },
  })
  return game
}

// Four chiefs parked out of the way, so nobody is accidentally eliminated and
// the position under test is the only thing the assertions see.
const CHIEFS = {
  [at(0, 0)]: piece('chief', 0),
  [at(0, 8)]: piece('chief', 1),
  [at(8, 0)]: piece('chief', 2),
  [at(8, 8)]: piece('chief', 3),
}

const board = (game) => game.getState().slice.board
const pending = (game) => game.getState().slice._pending
const cellAt = (game, square) => board(game)[square]

describe('djambi opens as a four-player game', () => {
  const start = createGameForFamily('chess', { variant: 'djambi' }).getState().slice.board

  it('is a 9x9 board with four armies of nine', () => {
    expect(start.length).toBe(81)
    expect([0, 1, 2, 3].map(o => start.filter(c => c && c.owner === o).length)).toEqual([9, 9, 9, 9])
  })

  // One chief, one assassin, one reporter, one diplomat, one necromobile and
  // four militants: "Quatre" is the count both sources give.
  it('fields the right nine pieces per army', () => {
    const counts = {}
    for (const cell of start) {
      if (cell && cell.owner === 0) counts[cell.type] = (counts[cell.type] || 0) + 1
    }
    expect(counts).toEqual({
      chief: 1, assassin: 1, reporter: 1, diplomat: 1, necromobile: 1, militant: 4,
    })
  })

  it('leaves the centre empty', () => {
    expect(start[MAZE]).toBeNull()
  })
})

describe('the reporter', () => {
  // "il eclabousse sa victime et la tue en se placant non pas dans la case de
  // sa cible, mais a cote, sur l'une des quatre cases qui ont un cote commun"
  const setup = {
    ...CHIEFS,
    [at(2, 3)]: piece('reporter', 0),
    [at(3, 5)]: piece('militant', 1),   // north of the landing square
    [at(5, 5)]: piece('militant', 2),   // south of it
    [at(4, 6)]: piece('assassin', 3),   // east of it
    [at(4, 4)]: piece('militant', 0),   // west of it, and ours
  }

  // It arrives on the diagonal, so no target is standing in its path.
  it('kills every enemy orthogonally adjacent to where it lands', () => {
    const game = position(setup)
    game.applyMove({ from: at(2, 3), to: at(4, 5) })
    expect(cellAt(game, at(3, 5))).toEqual(CORPSE)
    expect(cellAt(game, at(5, 5))).toEqual(CORPSE)
    expect(cellAt(game, at(4, 6))).toEqual(CORPSE)
  })

  // Neither source says whether the splash catches its own side. The wording
  // in both is about the victim, so this reads it as enemies only - and says
  // so here rather than leaving it to be inferred from the code.
  it('spares its own side', () => {
    const game = position(setup)
    game.applyMove({ from: at(2, 3), to: at(4, 5) })
    expect(cellAt(game, at(4, 4))).toEqual(piece('militant', 0))
  })

  // "Une piece tuee reste dans la case ou elle a ete eclaboussee."
  it('leaves the bodies where they fell, with nothing to place', () => {
    const game = position(setup)
    game.applyMove({ from: at(2, 3), to: at(4, 5) })
    expect(pending(game)).toBeFalsy()
  })

  it('never moves onto a piece', () => {
    const game = position(setup)
    const onto = game.getLegalMoves()
      .filter(m => m.from === at(2, 3) && board(game)[m.to])
    expect(onto).toEqual([])
  })
})

describe('the assassin', () => {
  // "il ne peut pas maquiller son crime en replacant le cadavre ou bon lui
  // semble: le cadavre de sa victime prend sa place de depart."
  it('leaves its victim on the square it set out from', () => {
    const game = position({ ...CHIEFS, [at(4, 1)]: piece('assassin', 0), [at(4, 5)]: piece('militant', 1) })
    game.applyMove({ from: at(4, 1), to: at(4, 5) })
    expect(cellAt(game, at(4, 1))).toEqual(CORPSE)
    expect(cellAt(game, at(4, 5))).toEqual(piece('assassin', 0))
    expect(pending(game)).toBeFalsy()
  })
})

describe('the chief and the militant', () => {
  it('kill, and then must put the body somewhere', () => {
    const game = position({ ...CHIEFS, [at(4, 4)]: piece('militant', 0), [at(4, 5)]: piece('assassin', 1) })
    game.applyMove({ from: at(4, 4), to: at(4, 5) })
    expect(pending(game)).toEqual(CORPSE)

    const moves = game.getLegalMoves()
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.every(m => m.action === 'placePiece')).toBe(true)

    game.applyMove({ action: 'placePiece', to: at(2, 2) })
    expect(cellAt(game, at(2, 2))).toEqual(CORPSE)
    expect(pending(game)).toBeFalsy()
  })

  // The single-slot duck-chess blocker this replaces would leave one.
  it('leave two corpses after two kills, not one', () => {
    const game = position({
      ...CHIEFS,
      [at(4, 4)]: piece('militant', 0),
      [at(4, 5)]: piece('assassin', 1),
      [at(6, 6)]: piece('militant', 1),
      [at(6, 7)]: piece('reporter', 2),
    })
    game.applyMove({ from: at(4, 4), to: at(4, 5) })
    game.applyMove({ action: 'placePiece', to: at(2, 2) })
    expect(game.getState().players.currentIndex).toBe(1)

    game.applyMove({ from: at(6, 6), to: at(6, 7) })
    game.applyMove({ action: 'placePiece', to: at(2, 3) })

    const corpses = board(game).filter(c => c && c.type === 'corpse')
    expect(corpses).toHaveLength(2)
  })
})

describe('the diplomat', () => {
  // "C'est un manipulateur, un deplaceur de vivants... elle ne peut pas
  // deplacer les pieces de son camp, ni les mortes."
  it('displaces a living enemy without killing it', () => {
    const game = position({ ...CHIEFS, [at(4, 1)]: piece('diplomat', 0), [at(4, 5)]: piece('militant', 1) })
    game.applyMove({ from: at(4, 1), to: at(4, 5) })
    expect(pending(game)).toEqual(piece('militant', 1))

    game.applyMove({ action: 'placePiece', to: at(2, 2) })
    expect(cellAt(game, at(2, 2))).toEqual(piece('militant', 1))
    expect(board(game).filter(c => c && c.type === 'corpse')).toEqual([])
  })

  it('will not touch its own side or a corpse', () => {
    const game = position({
      ...CHIEFS,
      [at(4, 1)]: piece('diplomat', 0),
      [at(4, 4)]: piece('militant', 0),
      [at(4, 6)]: { ...CORPSE },
    })
    const targets = game.getLegalMoves().filter(m => m.from === at(4, 1)).map(m => m.to)
    expect(targets).not.toContain(at(4, 4))
    expect(targets).not.toContain(at(4, 6))
  })
})

describe('the necromobile', () => {
  // "Il utilise n'importe quel cadavre gisant sur le terrain en prenant sa
  // place, et en la replacant ou lui dicte l'interet du parti."
  it('picks a corpse up and puts it down elsewhere', () => {
    const game = position({ ...CHIEFS, [at(4, 1)]: piece('necromobile', 0), [at(4, 5)]: { ...CORPSE } })
    game.applyMove({ from: at(4, 1), to: at(4, 5) })
    expect(pending(game)).toEqual(CORPSE)

    game.applyMove({ action: 'placePiece', to: at(2, 2) })
    expect(cellAt(game, at(2, 2))).toEqual(CORPSE)
    expect(cellAt(game, at(4, 5))).toEqual(piece('necromobile', 0))
  })

  it('is the only piece that may enter a corpse square', () => {
    const game = position({
      ...CHIEFS,
      [at(4, 1)]: piece('necromobile', 0),
      [at(6, 1)]: piece('militant', 0),
      [at(2, 1)]: piece('assassin', 0),
      [at(4, 5)]: { ...CORPSE },
    })
    const reaching = game.getLegalMoves().filter(m => m.to === at(4, 5))
    expect(reaching.map(m => m.from)).toEqual([at(4, 1)])
  })
})

describe('the centre cell', () => {
  // "Seul un chef de parti peut l'occuper en permanence."
  it('admits no piece but a chief', () => {
    const game = position({ ...CHIEFS, [at(4, 1)]: piece('assassin', 0), [at(0, 4)]: piece('militant', 0) })
    // A chief may of course enter; nobody else may stop there.
    const intruders = game.getLegalMoves()
      .filter(m => m.to === MAZE && !m.action)
      .filter(m => board(game)[m.from].type !== 'chief')
    expect(intruders).toEqual([])
  })

  it('admits a chief', () => {
    const game = position({ ...CHIEFS, [at(4, 0)]: piece('chief', 0), [at(0, 0)]: null })
    const entering = game.getLegalMoves().filter(m => m.to === MAZE)
    expect(entering.length).toBeGreaterThan(0)
  })

  // "ne peuvent pas atteindre un chef etabli dans la case centrale" - and the
  // exemption is the militant's alone. "l'assassin, le reporter, le
  // provocateur" can all still reach it.
  it('protects the chief in it from militants, but from nothing else', () => {
    const game = position({
      ...CHIEFS,
      [MAZE]: piece('chief', 1),
      [at(0, 8)]: null,
      [at(4, 1)]: piece('militant', 0),
      [at(6, 4)]: piece('assassin', 0),
    })
    const reaching = game.getLegalMoves().filter(m => m.to === MAZE).map(m => m.from)
    expect(reaching).toContain(at(6, 4))     // the assassin may
    expect(reaching).not.toContain(at(4, 1)) // the militant may not
  })

  // "il peut rejouer apres chaque intervention des partis adverses" - a turn
  // between each of the others', not two moves in a row.
  it('gives its holder a turn between each of the others', () => {
    const game = position({
      ...CHIEFS,
      [at(0, 0)]: null,
      [MAZE]: piece('chief', 0),
      [at(1, 1)]: piece('militant', 0),
      [at(1, 7)]: piece('militant', 1),
      [at(7, 1)]: piece('militant', 2),
      [at(7, 7)]: piece('militant', 3),
    }, 0)
    const seats = []
    for (let i = 0; i < 6; i++) {
      const moves = game.getLegalMoves()
      if (!moves.length) break
      seats.push(game.getState().players.currentIndex)
      game.applyMove(moves[0])
      if (game.getState().slice._pending) game.applyMove(game.getLegalMoves()[0])
    }
    // 0 holds the centre, so it answers each of the others in turn.
    expect(seats.filter((_, i) => i % 2 === 0).every(s => s === 0)).toBe(true)
    expect(new Set(seats.filter((_, i) => i % 2 === 1)).size).toBeGreaterThan(1)
  })
})

describe('losing', () => {
  // "les pieces restantes passent sous le controle du parti qui vient de tuer
  // le chef."
  it('hands a dead party to whoever killed its chief', () => {
    const game = position({
      ...CHIEFS,
      [at(0, 8)]: piece('chief', 1),
      [at(4, 4)]: piece('assassin', 0),
      [at(4, 8)]: piece('militant', 1),
    })
    game.applyMove({ from: at(4, 4), to: at(0, 8) })
    const players = game.getState().players
    expect(players.eliminated).toContain(1)
    expect(players.controlledBy[1]).toBe(0)
  })

  it('lets the killer move the pieces it inherited', () => {
    const game = position({
      ...CHIEFS,
      [at(0, 8)]: piece('chief', 1),
      [at(4, 4)]: piece('assassin', 0),
      [at(4, 8)]: piece('militant', 1),
    })
    game.applyMove({ from: at(4, 4), to: at(0, 8) })
    if (game.getState().slice._pending) game.applyMove(game.getLegalMoves()[0])
    while (game.getState().players.currentIndex !== 0) {
      const moves = game.getLegalMoves()
      if (!moves.length) break
      game.applyMove(moves[0])
      if (game.getState().slice._pending) game.applyMove(game.getLegalMoves()[0])
    }
    const froms = new Set(game.getLegalMoves().filter(m => !m.action).map(m => m.from))
    expect(froms.has(at(4, 8))).toBe(true)
  })

  // "Un chef prive de mobilite est un chef mort. L'encerclement est realise
  // par les morts et les cotes du plateau."
  it('eliminates a chief walled in by corpses', () => {
    const walled = {
      ...CHIEFS,
      [at(0, 8)]: piece('chief', 1),
      [at(0, 7)]: { ...CORPSE },
      [at(1, 8)]: { ...CORPSE },
      [at(4, 4)]: piece('militant', 0),
    }
    const game = position(walled)
    game.applyMove({ from: at(4, 4), to: at(4, 5) })
    expect(game.getState().players.eliminated).toContain(1)
  })

  // Both sources give the same two exemptions.
  it('spares a walled chief whose party still holds a necromobile', () => {
    const game = position({
      ...CHIEFS,
      [at(0, 8)]: piece('chief', 1),
      [at(0, 7)]: { ...CORPSE },
      [at(1, 8)]: { ...CORPSE },
      [at(6, 6)]: piece('necromobile', 1),
      [at(4, 4)]: piece('militant', 0),
    })
    game.applyMove({ from: at(4, 4), to: at(4, 5) })
    expect(game.getState().players.eliminated).not.toContain(1)
  })

  it('spares a walled chief that holds the centre', () => {
    const game = position({
      ...CHIEFS,
      [at(8, 8)]: null,
      [MAZE]: piece('chief', 3),
      [at(3, 4)]: { ...CORPSE },
      [at(5, 4)]: { ...CORPSE },
      [at(4, 3)]: { ...CORPSE },
      [at(4, 5)]: { ...CORPSE },
      [at(0, 4)]: piece('militant', 0),
    })
    game.applyMove({ from: at(0, 4), to: at(0, 5) })
    expect(game.getState().players.eliminated).not.toContain(3)
  })

  it('ends when one chief is left', () => {
    const game = position({
      [at(0, 0)]: piece('chief', 0),
      [at(0, 8)]: piece('chief', 1),
      [at(4, 4)]: piece('assassin', 0),
    })
    game.applyMove({ from: at(4, 4), to: at(0, 8) })
    if (game.getState().slice._pending) game.applyMove(game.getLegalMoves()[0])
    expect(game.checkWin()).toBe(0)
  })
})

describe('nothing is ever destroyed', () => {
  it('gives every corpse the unowned seat', () => {
    const game = position({ ...CHIEFS, [at(4, 4)]: piece('militant', 0), [at(4, 5)]: piece('assassin', 1) })
    game.applyMove({ from: at(4, 4), to: at(4, 5) })
    game.applyMove({ action: 'placePiece', to: at(2, 2) })
    const wrong = board(game).filter(c => c && c.type === 'corpse' && c.owner !== -1)
    expect(wrong).toEqual([])
  })

  it('keeps all 36 pieces accounted for through a long game', () => {
    const game = createGameForFamily('chess', { variant: 'djambi', rngSeed: 7 })
    expect(board(game).filter(Boolean)).toHaveLength(36)
    for (let ply = 0; ply < 250; ply++) {
      const moves = game.getLegalMoves()
      if (!moves.length) break
      const b = board(game)
      const captures = moves.filter(m => !m.action && b[m.to])
      game.applyMove(moves.find(m => m.action === 'placePiece') || captures[0] || moves[ply % moves.length])
      const held = pending(game) ? 1 : 0
      expect(board(game).filter(Boolean).length + held).toBe(36)
      if (game.checkWin() != null) break
    }
  })
})
