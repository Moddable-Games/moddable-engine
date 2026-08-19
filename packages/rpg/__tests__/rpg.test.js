import { searchEntities, filterByCategory, paginateResults, getCategoryDataType, resolveDisplay, normalizeOracleEntries } from '../src/entity-search.js'
import { rollOracle, rollRecipe, getOracleEntries } from '../src/oracle-roll.js'
import { getCardData, getCardFields, interpolate, getField, TRANSFORMS } from '../src/card-data.js'
import { resolveLink } from '../src/link-resolver.js'
import { resolveDataUrl, loadCategoryData, loadManifest } from '../src/manifest.js'

const MOCK_MANIFEST = {
  label: 'Test RPG',
  dataPath: 'games/test/data/',
  rulesUrl: 'dist/test/',
  categories: [
    { id: 'spells', label: 'Spells', file: 'spells.json', searchFields: ['name', 'school'], color: '#7b5ea7' },
    { id: 'monsters', label: 'Monsters', file: 'monsters.json', searchFields: ['name'], color: '#c62828',
      tag: { field: 'cr', prefix: 'CR ' },
      linkPath: 'monsters/{name|kebabCase}' },
    { id: 'oracles', label: 'Oracles', file: 'oracles.json', dataType: 'oracle', displayField: 'result', color: '#f59e0b' },
  ],
  cardFields: {
    spells: { title: '{name}', meta: ['Level {level} {school}'], description: 'desc' },
    monsters: { title: '{name}', meta: ['CR {cr}'], stats: 'HP {hp}, AC {ac}', tags: 'traits' },
  },
}

const MOCK_DATA = {
  spells: [
    { name: 'Fireball', level: 3, school: 'evocation', desc: 'A bright streak flashes...' },
    { name: 'Shield', level: 1, school: 'abjuration', desc: 'An invisible barrier...' },
    { name: 'Fire Bolt', level: 0, school: 'evocation', desc: 'A mote of fire...' },
  ],
  monsters: [
    { name: 'Dragon', cr: 15, hp: 256, ac: 19, traits: ['flying', 'breath weapon'] },
    { name: 'Goblin', cr: 0.25, hp: 7, ac: 15, traits: ['nimble escape'] },
  ],
  oracles: [
    { name: 'Action', entries: [
      { result: 'Advance', min: 1, max: 25 },
      { result: 'Bolster', min: 26, max: 50 },
      { result: 'Create', min: 51, max: 75 },
      { result: 'Destroy', min: 76, max: 100 },
    ]},
  ],
}

function createMockRng(values) {
  let idx = 0
  return { nextInt: (min, max) => values[idx++ % values.length] }
}

describe('entity-search', () => {
  test('searchEntities finds by name', () => {
    const result = searchEntities(MOCK_MANIFEST, MOCK_DATA, { query: 'fire' })
    expect(result.total).toBe(2)
    expect(result.results.map(r => r.item.name)).toContain('Fireball')
    expect(result.results.map(r => r.item.name)).toContain('Fire Bolt')
  })

  test('searchEntities filters by category', () => {
    const result = searchEntities(MOCK_MANIFEST, MOCK_DATA, { query: 'fire', category: 'spells' })
    expect(result.total).toBe(2)
  })

  test('searchEntities with no query returns category contents', () => {
    const result = searchEntities(MOCK_MANIFEST, MOCK_DATA, { category: 'monsters' })
    expect(result.total).toBe(2)
  })

  test('searchEntities paginates', () => {
    const result = searchEntities(MOCK_MANIFEST, MOCK_DATA, { category: 'spells', page: 1, pageSize: 2 })
    expect(result.results.length).toBe(2)
    expect(result.pages).toBe(2)
    expect(result.total).toBe(3)
  })

  test('searchEntities searches oracle tables', () => {
    const result = searchEntities(MOCK_MANIFEST, MOCK_DATA, { query: 'destroy' })
    expect(result.total).toBe(1)
    expect(result.results[0].item.result).toBe('Destroy')
  })

  test('filterByCategory returns all items', () => {
    const items = filterByCategory(MOCK_MANIFEST, MOCK_DATA, 'spells')
    expect(items.length).toBe(3)
  })

  test('filterByCategory returns oracle entries normalized', () => {
    const items = filterByCategory(MOCK_MANIFEST, MOCK_DATA, 'oracles')
    expect(items.length).toBe(4)
    expect(items[0].min).toBe(1)
    expect(items[0].result).toBe('Advance')
  })

  test('paginateResults handles edge cases', () => {
    const result = paginateResults([], 1, 10)
    expect(result.total).toBe(0)
    expect(result.pages).toBe(0)
  })
})

describe('oracle-roll', () => {
  test('rollOracle returns entry matching roll', () => {
    const rng = createMockRng([50])
    const result = rollOracle(MOCK_DATA, 'oracles', rng)
    expect(result.result).toBe('Bolster')
    expect(result.roll).toBe(50)
  })

  test('rollOracle returns null for empty category', () => {
    const rng = createMockRng([1])
    const result = rollOracle(MOCK_DATA, 'nonexistent', rng)
    expect(result).toBeNull()
  })

  test('getOracleEntries normalizes entries', () => {
    const entries = getOracleEntries(MOCK_DATA, 'oracles')
    expect(entries.length).toBe(4)
    expect(entries[0]._tableName).toBe('Action')
  })

  test('rollRecipe rolls multiple tables', () => {
    const multiData = {
      action: [{ name: 'Action', entries: [{ result: 'Advance', min: 1, max: 100 }] }],
      theme: [{ name: 'Theme', entries: [{ result: 'Hope', min: 1, max: 100 }] }],
    }
    const recipe = { name: 'Scene', description: 'A scene', tables: ['action', 'theme'] }
    const rng = createMockRng([50, 50])
    const result = rollRecipe(recipe, multiData, rng)
    expect(result.recipe).toBe('Scene')
    expect(result.results.action.result).toBe('Advance')
    expect(result.results.theme.result).toBe('Hope')
  })
})

describe('card-data', () => {
  test('getCardData builds structured card', () => {
    const card = getCardData(MOCK_DATA.spells[0], MOCK_MANIFEST.categories[0], MOCK_MANIFEST)
    expect(card.title).toBe('Fireball')
    expect(card.meta).toContain('Level 3 evocation')
    expect(card.description).toBe('A bright streak flashes...')
  })

  test('getCardData with stats and tags', () => {
    const card = getCardData(MOCK_DATA.monsters[0], MOCK_MANIFEST.categories[1], MOCK_MANIFEST)
    expect(card.title).toBe('Dragon')
    expect(card.stats).toBe('HP 256, AC 19')
    expect(card.tags).toEqual(['flying', 'breath weapon'])
  })

  test('interpolate resolves template fields', () => {
    expect(interpolate('{name} lvl {level}', { name: 'Zap', level: 5 })).toBe('Zap lvl 5')
  })

  test('interpolate applies transforms', () => {
    expect(interpolate('{name|kebabCase}', { name: 'Fire Ball' })).toBe('fire-ball')
    expect(interpolate('{name|lowercase}', { name: 'HELLO' })).toBe('hello')
    expect(interpolate('{level|levelSlug}', { level: 0 })).toBe('cantrips')
    expect(interpolate('{level|levelSlug}', { level: 3 })).toBe('level-3')
  })

  test('getField handles nested paths', () => {
    expect(getField({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42)
  })

  test('getField handles array bracket notation', () => {
    expect(getField({ items: [{ name: 'first' }] }, 'items[0].name')).toBe('first')
  })

  test('TRANSFORMS alphaGroup', () => {
    expect(TRANSFORMS.alphaGroup('Aardvark')).toBe('a-c')
    expect(TRANSFORMS.alphaGroup('Zebra')).toBe('v-z')
    expect(TRANSFORMS.alphaGroup('Magic')).toBe('m-o')
  })
})

describe('link-resolver', () => {
  test('resolveLink with linkPath template', () => {
    const link = resolveLink(
      MOCK_DATA.monsters[0],
      MOCK_MANIFEST.categories[1],
      MOCK_MANIFEST
    )
    expect(link).toBe('https://rules.moddable.games/dist/test/monsters/dragon')
  })

  test('resolveLink falls back to rulesUrl', () => {
    const link = resolveLink(
      MOCK_DATA.spells[0],
      MOCK_MANIFEST.categories[0],
      MOCK_MANIFEST
    )
    expect(link).toBe('https://rules.moddable.games/dist/test/')
  })

  test('resolveLink with custom base', () => {
    const link = resolveLink(
      MOCK_DATA.monsters[0],
      MOCK_MANIFEST.categories[1],
      MOCK_MANIFEST,
      'http://localhost:8080'
    )
    expect(link).toBe('http://localhost:8080/dist/test/monsters/dragon')
  })
})

describe('manifest', () => {
  test('resolveDataUrl builds correct URL', () => {
    const url = resolveDataUrl(MOCK_MANIFEST, MOCK_MANIFEST.categories[0])
    expect(url).toBe('https://rules.moddable.games/games/test/data/spells.json')
  })

  test('resolveDataUrl with custom base', () => {
    const url = resolveDataUrl(MOCK_MANIFEST, MOCK_MANIFEST.categories[0], 'http://localhost')
    expect(url).toBe('http://localhost/games/test/data/spells.json')
  })
})

// ─── Contract for js/rpg-*.js view layers (issue #136 step 6) ──────────────
// These symbols were shadow copies in js/rpg-*.js. They are exported so the
// browser view layers can import them instead of re-declaring them.

describe('view-layer contract', () => {
  test('getCategoryDataType falls back category -> manifest -> entity', () => {
    expect(getCategoryDataType({ dataType: 'oracle' }, {})).toBe('oracle')
    expect(getCategoryDataType({}, { dataType: 'table' })).toBe('table')
    expect(getCategoryDataType({}, {})).toBe('entity')
  })

  test('resolveDisplay applies pipe transforms in templates', () => {
    const item = { name: 'Fire Ball', level: 0 }
    expect(resolveDisplay(item, '{name|kebabCase}')).toBe('fire-ball')
    expect(resolveDisplay(item, '{level|levelSlug}')).toBe('cantrips')
  })

  test('resolveDisplay keeps falsy-but-present values', () => {
    expect(resolveDisplay({ level: 0 }, '{level}')).toBe('0')
  })

  test('resolveDisplay handles plain paths and no displayField', () => {
    expect(resolveDisplay({ name: 'Zap' }, 'name')).toBe('Zap')
    expect(resolveDisplay({ result: 'Advance' }, null)).toBe('Advance')
  })

  test('normalizeOracleEntries falls back to table id for _tableName', () => {
    const entries = normalizeOracleEntries([{ id: 'dungeon-purpose', entries: [{ result: 'Vault' }] }])
    expect(entries[0]._tableName).toBe('dungeon-purpose')
  })

  test('getCardFields resolves category, per-category and flat manifest shapes', () => {
    expect(getCardFields({ cardFields: { title: 'a' } }, {})).toEqual({ title: 'a' })
    expect(getCardFields({ id: 'spells' }, { cardFields: { spells: { title: 'b' } } })).toEqual({ title: 'b' })
    expect(getCardFields({ id: 'x' }, { cardFields: { title: 'c' } })).toEqual({ title: 'c' })
    expect(getCardFields({ id: 'x' }, {})).toBeNull()
  })
})

describe('manifest loading', () => {
  const okFetcher = (payload) => async () => ({ ok: true, json: async () => payload })

  test('loadCategoryData tolerates a category with no arrayKey', async () => {
    const manifest = { dataPath: 'games/test/data/', categories: [{ id: 'spells', file: 'spells.json' }] }
    const data = await loadCategoryData(manifest, {
      rulesBase: 'https://example.test',
      fetcher: okFetcher({ data: [{ name: 'Fireball' }] }),
    })
    expect(data.spells).toEqual([{ name: 'Fireball' }])
  })

  test('loadCategoryData extracts through arrayKey when present', async () => {
    const manifest = { dataPath: 'd/', categories: [{ id: 'spells', file: 's.json', arrayKey: 'tables[0].entries' }] }
    const data = await loadCategoryData(manifest, {
      rulesBase: 'https://example.test',
      fetcher: okFetcher({ tables: [{ entries: [{ name: 'Fireball' }] }] }),
    })
    expect(data.spells).toEqual([{ name: 'Fireball' }])
  })

  test('loadManifest builds the rules URL and returns null on a bad response', async () => {
    const seen = []
    const manifest = await loadManifest('cairn', {
      rulesBase: 'https://rules.example',
      fetcher: async (url) => { seen.push(url); return { ok: true, json: async () => ({ label: 'Cairn' }) } },
    })
    expect(seen[0]).toBe('https://rules.example/games/cairn/rpg-manifest.json')
    expect(manifest.label).toBe('Cairn')

    const missing = await loadManifest('nope', { fetcher: async () => ({ ok: false }) })
    expect(missing).toBeNull()
  })
})
