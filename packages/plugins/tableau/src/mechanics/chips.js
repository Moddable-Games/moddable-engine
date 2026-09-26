// Play chips (engine#184): the betting games are played for chips, play
// money only, as a component like a deck or dice. A game declares the stake:
//
//     chips: { start: 100, bets: [1, 2, 5, 10, 25] }
//
// and a player can bet any of those they can cover.

export function chipSettings(ctx) {
  const c = ctx.config.chips || {}
  return {
    start: Number(c.start ?? 100),
    bets: (c.bets || [1, 2, 5, 10, 25]).map(Number),
  }
}

// The bets a stack can cover, as the values of a `bet` move.
export function betsFor(stack, ctx) {
  return chipSettings(ctx).bets.filter(b => b <= stack)
}

// Who has the most chips among the seats that play, or a draw.
export function richest(stacks, seats) {
  const top = Math.max(...seats.map(s => stacks[s]))
  const leaders = seats.filter(s => stacks[s] === top)
  return leaders.length === 1 ? leaders[0] : 'draw'
}
