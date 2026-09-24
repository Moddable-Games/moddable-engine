import { ordering } from '../cards.js'

// War: "Both players simultaneously reveal the top card of their pile. The
// player whose card has the higher rank takes both cards and places them at
// the bottom of their pile." On a tie, "each player places 3 cards face-down"
// and "reveals 1 card face-up", and "if the face-up cards also tie, War
// repeats". A player "who runs out of cards mid-War ... loses immediately",
// and the player who collects all the cards wins.
//
// There is no decision anywhere in it, so a turn is one move - turning the
// cards over - and it resolves the whole battle however many wars that takes.
//
//     game: war
//     rankOrder: [2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A]   # low to high
//     warFaceDown: 3

export const war = {
  init(base) {
    // Each pile is face down with its top at index 0.
    return { ...base, battle: null, finished: null, next: null }
  },

  legalMoves(slice) {
    return slice.finished === null ? [{ action: 'turn' }] : []
  },

  apply(move, slice, seat, ctx) {
    const { rankOf } = ordering(ctx.config)
    const faceDown = ctx.config.warFaceDown ?? 3
    const piles = slice.hands.map(h => h.slice())
    const laid = [[], []]
    const shown = [[], []]
    let finished = null

    for (;;) {
      if (!piles[0].length || !piles[1].length) {
        finished = piles[0].length ? 0 : 1
        break
      }
      const up = [piles[0].shift(), piles[1].shift()]
      laid[0].push(up[0]); laid[1].push(up[1])
      shown[0].push(up[0]); shown[1].push(up[1])
      const a = rankOf(ctx.card(up[0])), b = rankOf(ctx.card(up[1]))
      if (a !== b) {
        const taker = a > b ? 0 : 1
        piles[taker].push(...laid[0], ...laid[1])
        if (!piles[1 - taker].length) finished = taker
        break
      }
      // War: three down, then the next card up. A player who cannot lay them
      // all has lost; if neither can, the one with fewer cards.
      const short = [0, 1].filter(p => piles[p].length < faceDown + 1)
      if (short.length) {
        if (short.length === 1) finished = 1 - short[0]
        else finished = piles[0].length === piles[1].length ? 'draw' : (piles[0].length > piles[1].length ? 0 : 1)
        break
      }
      for (const p of [0, 1]) {
        for (let i = 0; i < faceDown; i++) laid[p].push(piles[p].shift())
      }
    }

    return {
      ...slice,
      hands: piles,
      battle: { shown, taken: laid[0].length + laid[1].length },
      finished,
      next: null,
    }
  },

  winner(slice) {
    return slice.finished
  },

  // "Neither player looks at their cards": both piles are face down, to
  // everyone. What was turned over is on the table.
  project(slice) {
    return { ...slice, hands: slice.hands.map(h => h.map(() => null)) }
  },

  // The last battle, each player's face-up cards in the order they turned.
  table(view, ctx) {
    if (!view.battle) return []
    return view.battle.shown.map((cards, p) => ({ label: ctx.names[p] || `Player ${p + 1}`, cards }))
  },

  // What the turn showed, once it has been made: "K♠ 4♥", with each war's
  // cards after a slash.
  describe(move, ctx, after) {
    const shown = after?.battle?.shown
    if (!shown) return 'turn'
    const face = (id) => ctx.card(id)?.display || id
    return shown[0].map((id, i) => `${face(id)} ${face(shown[1][i])}`).join(' / ')
  },
}
