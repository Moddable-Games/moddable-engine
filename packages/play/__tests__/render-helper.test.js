import '../test-helpers/setup-rules-reader.js'
import { renderStateAsSvg } from '../src/render-helper.js'
import { createGameForFamily } from '../src/play.js'
import '../../plugins/chess/index.js'
import '../../plugins/go/index.js'
import '../../plugins/draughts/index.js'

describe('renderStateAsSvg', () => {
  it('renders chess initial position as SVG', () => {
    const svg = renderStateAsSvg('chess')
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('renders go 9x9 as SVG', () => {
    const svg = renderStateAsSvg('go', null, { variant: '9x9' })
    expect(svg).toContain('<svg')
  })

  it('renders draughts as SVG', () => {
    const svg = renderStateAsSvg('draughts')
    expect(svg).toContain('<svg')
  })

  it('renders chess with pieces visible', () => {
    const svg = renderStateAsSvg('chess')
    expect(svg).toContain('class="pieces"')
  })

  it('renders after a move is made', () => {
    const game = createGameForFamily('chess')
    const move = game.getLegalMoves()[0]
    game.applyMove(move)
    const state = game.getState()

    const svg = renderStateAsSvg('chess', state)
    expect(svg).toContain('<svg')
    expect(svg).toContain('class="pieces"')
  })

  it('accepts highlight options', () => {
    const svg = renderStateAsSvg('chess', null, {
      highlights: [{ key: 52, color: '#ff0000' }],
    })
    expect(svg).toContain('#ff0000')
  })

  it('accepts custom padding', () => {
    const svg = renderStateAsSvg('chess', null, { padding: 40 })
    expect(svg).toContain('<svg')
  })
})
