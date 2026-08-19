import { kingCaptureWin } from '../variant-helpers.js'

export const darkChess = {
  key: 'darkChess',
  slug: 'dark-chess',

  visibility(slice, viewerIndex, { allPositions, getCell }) {
    const knowledge = new Map()
    for (const pos of allPositions()) {
      const cell = getCell(slice.board, pos)
      if (cell && cell.owner === viewerIndex) {
        knowledge.set(pos, 'known')
      } else {
        knowledge.set(pos, 'unknown')
      }
    }
    return knowledge
  },

  winCondition: kingCaptureWin,
}
