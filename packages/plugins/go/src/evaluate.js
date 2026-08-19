export function goEvaluate(state, playerIndex) {
  if (!state.board) return 0
  const colours = state.playerColours || ['black', 'white']
  const myColour = colours[playerIndex]
  const oppColour = colours[1 - playerIndex]

  let myStones = 0
  let oppStones = 0
  for (const cell of state.board) {
    if (cell === myColour) myStones++
    else if (cell === oppColour) oppStones++
  }

  const captures = state.captures || {}
  const myCaps = captures[playerIndex] || 0
  const oppCaps = captures[1 - playerIndex] || 0

  return ((myStones - oppStones) + (myCaps - oppCaps) * 2) * 100
}
