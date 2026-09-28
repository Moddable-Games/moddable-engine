import '../../packages/play/test-helpers/setup-rules-reader.js'
import { createGameForFamily, findFamilyPlugin } from '../../packages/play/index.js'
import { pieceTypesInPlay } from '../play-legend.js'

// Khan's Chess gives each seat its own promotion list. The legend read that
// seat map as a list, threw, and the play page drew no board at all.
describe('pieceTypesInPlay', () => {
  it('reads promotion choices declared per seat', () => {
    const game = createGameForFamily('chess', { variant: 'khans-chess', rngSeed: 1 })
    const plugin = findFamilyPlugin(game.raw.registry.getPlugins(), 'chess')
    expect(Array.isArray(plugin.config.promotionChoices)).toBe(false)
    const types = pieceTypesInPlay(plugin, game.getState().slice)
    expect(types).toContain('khatun')
    expect(types).toContain('queen')
  })

  it('still reads one list shared by every seat', () => {
    const plugin = { config: { promotionChoices: ['queen', 'rook'] } }
    expect(pieceTypesInPlay(plugin, { board: [] })).toEqual(['queen', 'rook'])
  })
})
