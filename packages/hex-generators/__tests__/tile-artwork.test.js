import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import '../index.js'
import { getRegisteredGames, getGameConfig } from '../src/game-registry.js'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const SETS_DIR = path.join(REPO_ROOT, 'tiles/sets')

/**
 * Generators build browser-relative paths ('../tiles/sets/nukes/water.png')
 * because they are consumed from /play/ and /boards/. Resolve them back to the
 * repo so a test can ask whether the file is actually there.
 */
function toDiskPath(webPath) {
  return path.join(REPO_ROOT, webPath.replace(/^(\.\.\/)+/, ''))
}

function imageEntries(images) {
  // _perHex is a marker, not a terrain type. Every other value is a path.
  return Object.entries(images || {}).filter(([key]) => key !== '_perHex')
}

const games = getRegisteredGames().map(g => (typeof g === 'string' ? g : g.key || g.id))

describe('hex tile artwork — advertised styles resolve to files that exist', () => {
  it('registers at least the six shipped generators', () => {
    expect(games.length).toBeGreaterThanOrEqual(6)
  })

  describe.each(games)('%s', gameKey => {
    const config = getGameConfig(gameKey)
    const styles = config.styles || []

    it('advertises classic as the flat-colour style with no artwork', () => {
      if (!styles.includes('classic')) return
      expect(config.getImages ? config.getImages('classic') : null).toBeNull()
    })

    const artStyles = styles.filter(s => s !== 'classic')

    if (artStyles.length) {
      it.each(artStyles)('style "%s" maps every terrain type to a file on disk', style => {
        const images = config.getImages ? config.getImages(style) : null
        const entries = imageEntries(images)
        // A style with no terrain map must be driven by per-hex imagePath
        // instead. Advertising a style that resolves to nothing either way is
        // the bug this guard exists to catch.
        if (!entries.length) {
          const hexes = config.generate(config.defaultSize, config.defaultPlayers || 2, 'guard', config.defaultLayout || null)
          expect(hexes.some(h => h.imagePath)).toBe(true)
          return
        }
        const missing = entries
          .filter(([, webPath]) => !fs.existsSync(toDiskPath(webPath)))
          .map(([type, webPath]) => `${type} -> ${webPath}`)
        expect(missing).toEqual([])
      })

      it.each(artStyles)('style "%s" reads artwork from tiles/sets', style => {
        const entries = imageEntries(config.getImages ? config.getImages(style) : null)
        const strays = entries
          .map(([, webPath]) => webPath)
          .filter(webPath => !webPath.replace(/^(\.\.\/)+/, '').startsWith('tiles/sets/'))
        expect(strays).toEqual([])
      })
    }

    it('assigns per-hex artwork only where the file exists', () => {
      const layouts = config.layouts ? config.layouts.map(l => l.value) : [config.defaultLayout || null]
      const missing = new Set()
      for (const layout of layouts) {
        const hexes = config.generate(config.defaultSize, config.defaultPlayers || 2, 'guard', layout)
        for (const hex of hexes) {
          if (!hex.imagePath) continue
          if (!fs.existsSync(toDiskPath(hex.imagePath))) missing.add(hex.imagePath)
        }
      }
      expect([...missing]).toEqual([])
    })
  })
})

describe('tile index', () => {
  const index = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tiles/tile-index.json'), 'utf8'))

  it.each(index.map(set => [set.id, set]))('%s lists only files that exist', (id, set) => {
    const missing = Object.values(set.tiles || {})
      .filter(file => !fs.existsSync(path.join(SETS_DIR, id, file)))
    expect(missing).toEqual([])
  })

  it('covers every set directory under tiles/sets', () => {
    const onDisk = fs.readdirSync(SETS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort()
    const indexed = index.map(s => s.id).sort()
    expect(indexed).toEqual(onDisk)
  })

  it('is mirrored verbatim by the static API copy', () => {
    const api = fs.readFileSync(path.join(REPO_ROOT, 'api/tiles/index.json'), 'utf8')
    const source = fs.readFileSync(path.join(REPO_ROOT, 'tiles/tile-index.json'), 'utf8')
    expect(api).toBe(source)
  })
})
