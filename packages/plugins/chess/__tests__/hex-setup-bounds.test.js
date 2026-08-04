/**
 * Hex Setup Bounds Guard
 *
 * Every piece position in a hex variant's setup must exist in
 * topology.getAllCells(). Catches coordinate convention mismatches
 * between setup strings and topology generators.
 */
import '../../chess/index.js'
import '../../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily } from '../../../play/src/play.js'

const HEX_VARIANTS = ['glinski', 'mccooey', 'brusky', 'de-vasa', 'shafran', 'mini-hexchess']

describe('hex setup bounds: every piece within topology', () => {
  for (const variant of HEX_VARIANTS) {
    it(`${variant}: all piece coordinates exist in getAllCells()`, () => {
      const game = createGameForFamily('chess', { variant })
      const state = game.getState()
      const board = state.slice.board
      const topo = game.raw.topology
      const cellSet = new Set(topo.getAllCells().map(String))

      const piecePositions = Object.keys(board).filter(k => board[k] !== null)
      const outOfBounds = piecePositions.filter(p => !cellSet.has(p))

      if (outOfBounds.length > 0) {
        throw new Error(
          `${variant}: ${outOfBounds.length} pieces at coordinates not in topology: ${outOfBounds.join(', ')}`
        )
      }
      expect(piecePositions.length).toBeGreaterThan(0)
    })
  }
})
