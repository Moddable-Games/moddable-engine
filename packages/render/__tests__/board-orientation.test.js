// Which side of the board a player's own pieces are drawn on.
//
// A mancala board was drawn with seat 0's pits along the top and seat 1's
// along the bottom. Both rows were present, both were clickable, and every
// test passed - but the status line said South to move while the only pits
// South was allowed to touch were the ones across the far side, and the
// sowing circuit ran off the left end of the top row and continued at a store
// drawn on the right.
import '../../play/src/bootstrap-plugins.js'
import '../../play/test-helpers/setup-rules-reader.js'
import { createGameForFamily, resolveFromDisk } from '../../play/src/play.js'
import { findFamilyPlugin } from '../../play/src/find-plugin.js'
import { boardToSetup } from '../../play/src/serialise.js'
import { renderFromEngine } from '../src/render-engine.js'

function renderVariant(family, variant) {
  const resolved = resolveFromDisk(family, variant)
  const game = createGameForFamily(family, { variant })
  const plugin = findFamilyPlugin(game.raw.registry.getPlugins(), family)
  const setup = boardToSetup(game.getState().slice, resolved.topology || {}, plugin.vocabulary,
    { players: game.raw.playerSystem.getAll() })
  // `_pitsPerSide` is what the plugin settled on after reading the topology,
  // which is not what `config.pitsPerSide` still says: the config keeps the
  // default of six while congkak plays seven a side and toguz-korgool nine.
  const perSide = game.getState().slice._pitsPerSide
  return { svg: renderFromEngine({ ...resolved, vocabulary: plugin.vocabulary, setup }, {}) || '', game, plugin, perSide }
}

// Every hit target with its centre, so a test can ask where something is drawn
// rather than only whether it exists.
function hitTargets(svg) {
  const out = {}
  for (const m of svg.matchAll(/<(?:circle|ellipse|rect|polygon)((?:"[^"]*"|[^>"])*?)\/?>/g)) {
    const raw = m[1]
    const sq = /data-sq="([^"]*)"/.exec(raw)
    if (!sq) continue
    const cx = /\bcx="([\d.-]+)"/.exec(raw)
    const cy = /\bcy="([\d.-]+)"/.exec(raw)
    const x = /\bx="([\d.-]+)"/.exec(raw)
    const y = /\by="([\d.-]+)"/.exec(raw)
    const w = /\bwidth="([\d.-]+)"/.exec(raw)
    const h = /\bheight="([\d.-]+)"/.exec(raw)
    out[sq[1]] = {
      x: cx ? +cx[1] : (x && w ? +x[1] + +w[1] / 2 : null),
      y: cy ? +cy[1] : (y && h ? +y[1] + +h[1] / 2 : null),
    }
  }
  return out
}

const MANCALA_TWO_ROW = ['kalah', 'oware', 'ayo', 'congkak', 'sungka', 'toguz-korgool']

describe('a mancala board puts the player whose turn it is nearest the viewer', () => {
  it.each(MANCALA_TWO_ROW)('%s draws seat 0 along the bottom', (variant) => {
    const { svg, perSide } = renderVariant('mancala', variant)
    const cells = hitTargets(svg)

    const mine = []
    const theirs = []
    for (let i = 0; i < perSide; i++) {
      expect(cells[`pit-${i}`]).toBeDefined()
      expect(cells[`pit-${perSide + i}`]).toBeDefined()
      mine.push(cells[`pit-${i}`])
      theirs.push(cells[`pit-${perSide + i}`])
    }
    // Larger y is further down the page.
    expect(Math.min(...mine.map(c => c.y))).toBeGreaterThan(Math.max(...theirs.map(c => c.y)))
  })

  it.each(MANCALA_TWO_ROW)('%s runs seat 0 left to right, in sowing order', (variant) => {
    const { svg, perSide } = renderVariant('mancala', variant)
    const cells = hitTargets(svg)
    for (let i = 1; i < perSide; i++) {
      expect(cells[`pit-${i}`].x).toBeGreaterThan(cells[`pit-${i - 1}`].x)
      // and the opponent's row back the other way, so the circuit closes
      expect(cells[`pit-${perSide + i}`].x).toBeLessThan(cells[`pit-${perSide + i - 1}`].x)
    }
  })

  it('ends seat 0 next to its own store', () => {
    const { svg, perSide } = renderVariant('mancala', 'kalah')
    const cells = hitTargets(svg)
    expect(cells['store-0']).toBeDefined()
    // The last pit seat 0 sows into before its store is the rightmost one, so
    // the store has to be further right again.
    expect(cells['store-0'].x).toBeGreaterThan(cells[`pit-${perSide - 1}`].x)
    expect(cells['store-1'].x).toBeLessThan(cells['pit-0'].x)
  })
})
