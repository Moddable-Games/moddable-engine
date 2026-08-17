export function defaultSeatFor(board, cols, playerCount, declared) {
  if (declared != null) return typeof declared === 'number' ? declared : 0
  if (!board || !board.length || !cols || playerCount <= 2) return 0
  const sum = new Array(playerCount).fill(0)
  const n = new Array(playerCount).fill(0)
  for (let i = 0; i < board.length; i++) {
    const o = board[i] && typeof board[i].owner === 'number' ? board[i].owner : -1
    if (o < 0 || o >= playerCount) continue
    sum[o] += Math.floor(i / cols)
    n[o]++
  }
  let best = 0, bestMean = -Infinity
  for (let i = 0; i < playerCount; i++) {
    if (!n[i]) continue
    const mean = sum[i] / n[i]
    if (mean > bestMean + 1e-9) { bestMean = mean; best = i }
  }
  return best
}
