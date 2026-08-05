const ABILITY_BITS = { knight: 1, bishop: 2, rook: 4, queen: 6 }

function abilitiesOf(type) {
  if (type === 'queen') return 6
  if (type === 'rook') return 4
  if (type === 'bishop') return 2
  if (type === 'knight') return 1
  return 0
}

function typeForAbilities(ab) {
  if (ab >= 7) return 'queen'
  if (ab === 6) return 'queen'
  if (ab === 5) return 'queen'
  if (ab === 4) return 'rook'
  if (ab === 3) return 'queen'
  if (ab === 2) return 'bishop'
  if (ab === 1) return 'knight'
  return null
}

export const absorptionChess = {
  key: 'absorptionChess',

  afterMove(ctx) {
    const { move, captured, board } = ctx
    if (!captured) return
    const piece = board[move.to]
    if (!piece || piece.type === 'king') return
    const currentAb = abilitiesOf(piece.type)
    const victimAb = abilitiesOf(captured.type)
    const newAb = currentAb | victimAb
    if (newAb === currentAb) return
    const newType = typeForAbilities(newAb)
    if (newType && newType !== piece.type) {
      board[move.to] = { type: newType, owner: piece.owner }
    }
  },
}
