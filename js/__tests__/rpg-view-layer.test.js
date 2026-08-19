/**
 * Guards the js/rpg-* view layers after issue #136 step 6.
 *
 * These two modules are DOM-free, so they can be exercised directly. They must
 * stay thin: everything they do beyond markup and browser caching should come
 * from packages/rpg/src/ and packages/render/src/.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { renderCard } from '../rpg-card-renderer.js'
import { loadRpgManifest } from '../rpg-manifest-loader.js'
import { escapeXml } from '../../packages/render/src/svg-escape.js'

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const MANIFEST = {
  cardFields: {
    spells: { title: '{name}', meta: ['Level {level} {school}'], description: 'desc' },
    monsters: { title: '{name}', meta: ['CR {cr}'], stats: 'HP {hp}', tags: 'traits' },
  },
}
const SPELLS = { id: 'spells' }
const MONSTERS = { id: 'monsters' }

describe('rpg-card-renderer', () => {
  test('renders title, meta and description from package card data', () => {
    const html = renderCard({ name: 'Fireball', level: 3, school: 'evocation', desc: 'Boom' }, SPELLS, MANIFEST)
    expect(html).toBe(
      '<div class="rpg-card-title">Fireball</div>' +
      '<div class="rpg-card-meta">Level 3 evocation</div>' +
      '<div class="rpg-card-desc">Boom</div>'
    )
  })

  test('renders stats and component tags', () => {
    const html = renderCard({ name: 'Dragon', cr: 15, hp: 256, traits: ['flying'] }, MONSTERS, MANIFEST)
    expect(html).toContain('<div class="rpg-card-stats">HP 256</div>')
    expect(html).toContain('<div class="rpg-card-meta">Components: flying</div>')
  })

  test('falls back to a bare title when the manifest declares no card fields', () => {
    expect(renderCard({ result: 'Advance' }, { id: 'oracles' }, {}))
      .toBe('<div class="rpg-card-title">Advance</div>')
  })

  test('applies pipe transforms through the package interpolate', () => {
    const manifest = { cardFields: { title: '{name|kebabCase}' } }
    expect(renderCard({ name: 'Fire Ball' }, { id: 'x' }, manifest))
      .toBe('<div class="rpg-card-title">fire-ball</div>')
  })
})

describe('rpg-manifest-loader', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = originalFetch })

  test('fetches through the package loader, cache-busts, and caches the result', async () => {
    const urls = []
    globalThis.fetch = async (url) => {
      urls.push(url)
      return { ok: true, json: async () => ({ label: 'Cairn' }) }
    }
    const first = await loadRpgManifest('cairn', 'https://rules.example/')
    const second = await loadRpgManifest('cairn', 'https://rules.example/')
    expect(first.label).toBe('Cairn')
    expect(second).toBe(first)
    expect(urls.length).toBe(1)
    expect(urls[0]).toMatch(/^https:\/\/rules\.example\/games\/cairn\/rpg-manifest\.json\?t=\d+$/)
  })

  test('returns null when the fetch rejects', async () => {
    globalThis.fetch = async () => { throw new Error('offline') }
    expect(await loadRpgManifest('missing-game', 'https://rules.example/')).toBeNull()
  })
})

describe('no shadow copies remain in js/rpg-*', () => {
  const FORBIDDEN = [
    'const TRANSFORMS',
    'function interpolate',
    'function getCardFields',
    'function getCategoryDataType',
    'function extractByKey',
    'function resolveDisplay',
    'function resolveLink',
    'function esc(',
  ]
  for (const file of ['rpg-card-renderer.js', 'rpg-manifest-loader.js', 'rpg-provider.js', 'rpg-chargen.js']) {
    test(`${file} redefines none of them`, () => {
      const src = readFileSync(resolve(JS_DIR, file), 'utf8')
      for (const name of FORBIDDEN) expect(src).not.toContain(name)
    })
  }
})

describe('svg-escape', () => {
  test('escapes quotes so values are safe inside an attribute', () => {
    const value = 'How have you "improved" yourself?'
    const attr = `<option value="${escapeXml(value)}">`
    expect(attr.match(/value="([^"]*)"/)[1]).toBe('How have you &quot;improved&quot; yourself?')
  })

  test('escapes ampersands and angle brackets', () => {
    expect(escapeXml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d')
  })
})
