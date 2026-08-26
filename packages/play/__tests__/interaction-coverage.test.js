// Mancala declared `interaction = 'select'` and no model of that name was
// registered. `interactionModelFor` returned undefined, the controller had no
// model to consult, and not one click on the board did anything - a family
// marked playable that could not be played at all.
//
// It said so, too: `[interaction] Family "mancala" has no interactionModel`
// never fired, because a name WAS declared. It just pointed at nothing.
import '../src/bootstrap-plugins.js'
import '../test-helpers/setup-rules-reader.js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { interactionModelFor, listInteractionModels } from '../src/interaction.js'

const MANIFEST = JSON.parse(
  readFileSync(join(process.cwd(), 'play', 'playability-manifest.json'), 'utf8')
)
const FAMILIES = [...new Set(MANIFEST.filter(e => e.playable).map(e => e.family))]

describe('every playable family has an interaction model that exists', () => {
  it('found the families', () => {
    expect(FAMILIES.length).toBeGreaterThanOrEqual(10)
  })

  it.each(FAMILIES)('%s resolves to a registered model', (family) => {
    const model = interactionModelFor(family)
    expect(typeof model?.handleClick).toBe('function')
    expect(listInteractionModels()).toContain(model.name)
  })

  it('names a model that is not registered rather than returning undefined', () => {
    expect(() => interactionModelFor('chess', 'no-such-model')).toThrow(/not registered/)
  })
})

// A model resolving is not the same as a click reaching a move. That is the
// gap the four new families fell through.
describe('a click on a legal move produces that move', () => {
  it.each(FAMILIES)('%s turns a click into a move', async (family) => {
    const { createGameForFamily } = await import('../src/play.js')
    const variant = MANIFEST.find(e => e.family === family && e.playable).variant
    const game = createGameForFamily(family, { variant })
    const model = interactionModelFor(family)
    const moves = game.getLegalMoves().filter(m => m.action !== 'pass' && m.action !== 'resign')
    expect(moves.length).toBeGreaterThan(0)

    // The cell a player would click for the first legal move.
    const target = moves[0]
    const pos = target.coord !== undefined ? target.coord
      : target.from !== undefined ? target.from
      : target.to
    // Some games open with an action rather than a click - landlords rolls
    // before anyone moves. That is a button, not a board square, so there is
    // nothing to click yet; assert it is a named action instead.
    if (pos === undefined) {
      expect([family, typeof target.action]).toEqual([family, 'string'])
      return
    }

    const ctx = {
      selected: null, chainAnchor: null, dropType: null, moves,
      playerIndex: game.getState().players.currentIndex,
      getOwnerAt: (p) => {
        const board = game.getState().slice.board
        const cell = Array.isArray(board) ? board[p] : board[p]
        if (cell === null || cell === undefined) return null
        if (typeof cell === 'number') return cell
        if (typeof cell === 'string') return cell === 'black' ? 0 : 1
        return cell.owner
      },
    }
    const result = model.handleClick(pos, ctx)
    // Either the click commits the move outright, or it selects the piece that
    // will. A reject or a deselect means the board does not respond.
    expect([family, result.type]).toEqual([family, expect.stringMatching(/^(move|select|choice|arm-drop)$/)])
  })
})
