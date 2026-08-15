/**
 * Drafts, state round-trip, and the rule vocabulary.
 *
 * The claims under test, all made in engine#115 and in this session's brief:
 *  - a board survives leaving the page and coming back
 *  - what create writes, play reads, and create reads back again
 *  - the draft is not carried in the URL, so switching variant switches variant
 *  - every rule the form offers is a key its plugin actually consumes
 */

import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// The draft store is localStorage-backed. jest's default environment is node,
// which has no localStorage, so give it one before importing the module.
const backing = new Map()
globalThis.localStorage = {
  getItem: k => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => { backing.set(k, String(v)) },
  removeItem: k => { backing.delete(k) },
  clear: () => backing.clear(),
}

const drafts = await import('../create-drafts.js')
const { defaultState, buildResolvedFromState, stateFromResolved, buildSetup, parseSetup } = await import('../create-state.js')
const { FAMILY_RULES, toPluginConfig, defaultRuleValues } = await import('../create-rules.js')
const { defaultPlayers, toPlayerConfig } = await import('../create-players.js')

beforeEach(() => backing.clear())

describe('drafts survive the page', () => {
  test('a saved draft comes back with its board intact', () => {
    const state = defaultState('chess')
    state.placement = { '7,4': 'K', '0,4': 'k', '6,0': 'P' }
    const record = drafts.saveDraft(state, { name: 'My board' })
    expect(record.id).toBeTruthy()

    const back = drafts.getDraft(record.id)
    expect(back.name).toBe('My board')
    expect(back.state.placement).toEqual(state.placement)
  })

  test('the working draft is autosaved separately and is not listed as a named draft', () => {
    drafts.saveWorking(defaultState('chess'))
    drafts.saveDraft(defaultState('chess'), { name: 'Named' })
    const listed = drafts.listDrafts()
    expect(listed).toHaveLength(1)
    expect(listed[0].name).toBe('Named')
    expect(drafts.getWorkingDraft()).toBeTruthy()
  })

  test('draft=1 resolves to the working board, which is what the first Try in Play links used', () => {
    expect(drafts.resolveDraftId('1')).toBeNull()
    drafts.saveWorking(defaultState('chess'))
    expect(drafts.resolveDraftId('1')).toBe(drafts.WORKING_ID)
  })

  test('an unknown draft id resolves to nothing rather than to somebody else’s board', () => {
    drafts.saveDraft(defaultState('chess'), { name: 'A' })
    expect(drafts.resolveDraftId('does-not-exist')).toBeNull()
  })

  test('renaming and deleting take effect', () => {
    const record = drafts.saveDraft(defaultState('chess'), { name: 'Before' })
    drafts.renameDraft(record.id, 'After')
    expect(drafts.getDraft(record.id).name).toBe('After')
    drafts.deleteDraft(record.id)
    expect(drafts.getDraft(record.id)).toBeNull()
  })

  test('named drafts are capped, and the working draft is never evicted', () => {
    drafts.saveWorking(defaultState('chess'))
    for (let i = 0; i < 40; i++) drafts.saveDraft(defaultState('chess'), { name: 'draft ' + i })
    expect(drafts.listDrafts().length).toBeLessThanOrEqual(24)
    expect(drafts.getWorkingDraft()).toBeTruthy()
  })

  test('a corrupt store degrades to empty rather than throwing', () => {
    backing.set('moddable:drafts:v1', '{not json')
    expect(drafts.listDrafts()).toEqual([])
    expect(drafts.getWorkingDraft()).toBeNull()
  })
})

describe('state round-trips through the engine block', () => {
  test('board, setup, piece set and rules all survive create -> resolved -> create', () => {
    const state = defaultState('chess')
    state.topology.rows = 10
    state.topology.cols = 10
    state.pieceSet = 'chessnut'
    state.placement = { '9,4': 'K', '0,4': 'k' }
    state.rules.castling = false
    state.rules.enPassant = false
    state.render.surface = 'slate'

    const resolved = buildResolvedFromState(state)
    expect(resolved.topology).toMatchObject({ type: 'grid', rows: 10, cols: 10 })
    expect(resolved.setup).toBe(buildSetup(state))
    expect(resolved.plugins.chess).toMatchObject({ castling: false, enPassant: false })

    const back = stateFromResolved(resolved, 'chess')
    expect(back.topology.rows).toBe(10)
    expect(back.topology.cols).toBe(10)
    expect(back.placement).toEqual(state.placement)
    expect(back.pieceSet).toBe('chessnut')
    expect(back.render.surface).toBe('slate')
    expect(back.rules.castling).toBe(false)
    expect(back.rules.enPassant).toBe(false)
  })

  test('a custom piece reaches both the vocabulary and the plugin', () => {
    const state = defaultState('chess')
    state.placement = { '4,4': 'Z' }
    state.customPieces = [{ name: 'zebrarider', symbolW: 'Z', symbolB: 'z', spec: { type: 'rider', dirs: 'orthogonal', maxSteps: 3 } }]
    const resolved = buildResolvedFromState(state)
    expect(resolved.vocabulary.zebrarider.symbols).toEqual({ 0: 'Z', 1: 'z' })
    expect(resolved.plugins.chess.pieces.zebrarider).toEqual({ type: 'rider', dirs: 'orthogonal', maxSteps: 3 })
  })

  test('a setup that does not fit is rejected whole', () => {
    expect(parseSetup('q7/8/8', { type: 'grid', rows: 8, cols: 8 })).toBeNull()
    expect(parseSetup('q8/8/8/8/8/8/8/8', { type: 'grid', rows: 8, cols: 8 })).toBeNull()
    expect(parseSetup('q7/8/8/8/8/8/8/4K3', { type: 'grid', rows: 8, cols: 8 }))
      .toEqual({ '0,0': 'q', '7,4': 'K' })
  })
})

describe('a grid is not necessarily a chessboard', () => {
  test('intersections reach the topology, and suppress the checker fill', () => {
    const state = defaultState('go')
    state.topology = { ...state.topology, rows: 19, cols: 19, layout: 'intersections' }
    state.render.starPoints = true
    const resolved = buildResolvedFromState(state)
    expect(resolved.topology.layout).toBe('intersections')
    expect(resolved.render.cellColor).toBe('none')
    expect(resolved.render.decorations).toEqual([{ type: 'markers', auto: 'star-points', size: 3 }])
  })

  test('a cell grid keeps its cell colouring and declares no layout', () => {
    const resolved = buildResolvedFromState(defaultState('chess'))
    expect(resolved.topology.layout).toBeUndefined()
    expect(resolved.render.cellColor).toBe('checkered')
  })

  test('an intersection board survives the round-trip', () => {
    const state = defaultState('xiangqi')
    state.topology = { ...state.topology, rows: 10, cols: 9, layout: 'intersections' }
    const back = stateFromResolved(buildResolvedFromState(state), 'xiangqi')
    expect(back.topology.layout).toBe('intersections')
    expect(back.topology.rows).toBe(10)
    expect(back.topology.cols).toBe(9)
  })
})

describe('every rule offered is a rule the plugin reads', () => {
  // engine#68's failure class: config that is declared, looks configured, and is
  // never consumed. glinski declared three chess keys that did not exist and its
  // king would have generated zero moves, silently.
  const sources = {}
  for (const family of Object.keys(FAMILY_RULES)) {
    const dir = join(process.cwd(), 'packages', 'plugins', family, 'src')
    sources[family] = readdirSync(dir)
      .filter(f => f.endsWith('.js'))
      .map(f => readFileSync(join(dir, f), 'utf8'))
      .join('\n')
  }

  for (const [family, fields] of Object.entries(FAMILY_RULES)) {
    for (const field of fields) {
      test(`${family}.${field.key} is consumed by the ${family} plugin`, () => {
        expect(sources[family]).toContain(`config.${field.key}`)
      })
    }
  }
})

describe('the emitted plugin config says only what the user changed', () => {
  test('untouched defaults are omitted', () => {
    expect(toPluginConfig('chess', defaultRuleValues('chess'))).toEqual({})
  })

  test('changed values are emitted with their real types', () => {
    const values = { ...defaultRuleValues('chess'), castling: false, torpedo: true }
    expect(toPluginConfig('chess', values)).toEqual({ castling: false, torpedo: true })
  })

  test('a royal-less chess board also turns check detection off', () => {
    const values = { ...defaultRuleValues('chess'), royalType: 'none' }
    expect(toPluginConfig('chess', values)).toEqual({ royalType: 'none', noCheck: true })
  })

  test('the hasami-shogi shape is expressible', () => {
    const values = { ...defaultRuleValues('shogi'), captureRule: 'custodian', winCondition: 'reduced-to-one', royalType: 'none', drops: false }
    expect(toPluginConfig('shogi', values)).toEqual({
      captureRule: 'custodian',
      winCondition: 'reduced-to-one',
      royalType: 'none',
      drops: false,
    })
  })
})

describe('the draft is configuration, not a URL flag', () => {
  const source = readFileSync(join(process.cwd(), 'js', 'game-play.js'), 'utf8')
  const start = source.indexOf('async function start()')
  const raw = source.slice(start, source.indexOf('function currentPlayerIndex()', start))
  // Strip comments: the fix is described in a comment that names the old code.
  const body = raw.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

  test('start() does not read the draft out of the page URL', () => {
    // The regression: updateURL() rebuilds the query string from location.search,
    // so a draft parameter read here survives every restart and every variant
    // change reloads the draft instead of the chosen variant.
    expect(body).not.toMatch(/location\.search/)
    expect(body).toContain('draftId')
  })

  test('updateURL clears the draft parameter when the session has no draft', () => {
    const update = source.slice(source.indexOf('function updateURL()'))
    expect(update).toContain("params.delete('draft')")
  })
})

describe('players and sides', () => {
  test('two players facing up and down emit nothing, because that is the default everywhere', () => {
    const { players, config } = toPlayerConfig('chess', defaultPlayers('chess'))
    expect(players).toEqual(['white', 'black'])
    expect(config).toEqual({})
  })

  test('names reach engine.players', () => {
    const state = defaultState('chess')
    state.players = { count: 2, names: ['Attackers', 'Defenders'], advancement: { 0: 'up', 1: 'down' } }
    expect(buildResolvedFromState(state).players).toEqual(['Attackers', 'Defenders'])
  })

  test('a four-seat shogi board emits a direction vector per seat', () => {
    // The exact configuration four-player-shogi shipped without, which made red
    // advance into its own army and green advance backwards.
    const { players, config } = toPlayerConfig('shogi', {
      count: 4,
      names: ['red', 'yellow', 'green', 'blue'],
      advancement: { 0: 'right', 1: 'down', 2: 'up', 3: 'left' },
    })
    expect(players).toEqual(['red', 'yellow', 'green', 'blue'])
    expect(config.playerCount).toBe(4)
    expect(config.advancement).toEqual({ 0: [0, 1], 1: [1, 0], 2: [-1, 0], 3: [0, -1] })
  })

  test('chess gets a scalar, because that is what its plugin reads', () => {
    const { config } = toPlayerConfig('chess', {
      count: 4, names: ['a', 'b', 'c', 'd'],
      advancement: { 0: 'up', 1: 'down', 2: 'up', 3: 'down' },
    })
    expect(config.advancement).toEqual({ 0: -1, 1: 1, 2: -1, 3: 1 })
  })

  test('families whose plugin does not read advancement are offered no direction', () => {
    const { config } = toPlayerConfig('go', defaultPlayers('go'))
    expect(config.advancement).toBeUndefined()
  })

  test('players survive the round-trip', () => {
    const state = defaultState('shogi')
    state.players = { count: 4, names: ['red', 'yellow', 'green', 'blue'], advancement: { 0: 'right', 1: 'down', 2: 'up', 3: 'left' } }
    const back = stateFromResolved(buildResolvedFromState(state), 'shogi')
    expect(back.players.count).toBe(4)
    expect(back.players.names).toEqual(['red', 'yellow', 'green', 'blue'])
    expect(back.players.advancement).toEqual({ 0: 'right', 1: 'down', 2: 'up', 3: 'left' })
  })

  test('advancement is emitted for every seat once there are more than two', () => {
    // Leaving a seat out is what the two-player default answers for, and the
    // answer is wrong for any seat that is not at the top or the bottom.
    const { config } = toPlayerConfig('shogi', { count: 3, names: ['a', 'b', 'c'], advancement: { 0: 'up', 1: 'down' } })
    expect(Object.keys(config.advancement)).toEqual(['0', '1', '2'])
  })
})

describe('rules content is never served from a stale cache', () => {
  // A corrected variant could be committed, pulled and served while the page
  // kept playing yesterday's copy, because every engine asset carries a `?v=`
  // string and no moddable-rules fetch carried anything. A `?v=` would not fix
  // it either: the engine's version does not change when a rules file does.
  const frontmatter = readFileSync(join(process.cwd(), 'js', 'variant-frontmatter.js'), 'utf8')
  const shared = readFileSync(join(process.cwd(), 'js', 'play-shared.js'), 'utf8')

  test('every rules fetch forces revalidation', () => {
    const calls = frontmatter.match(/fetch\([^)]*\)/g) || []
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) expect(call).toContain('RULES_FETCH')
  })

  test('the diagrams manifest does too', () => {
    const call = shared.match(/fetch\(RULES_BASE[^)]*\)/)?.[0] || ''
    expect(call).toContain("cache: 'no-cache'")
  })

  test('engine-served assets still carry a version string', () => {
    // The other half of the contract: those are busted by version, not revalidated.
    expect(shared).toMatch(/gallery-index\.json\?v=/)
    expect(shared).toMatch(/playability-manifest\.json\?v=/)
  })
})

describe('animation respects piece rotation', () => {
  // A variant declaring pieceRotations renders each piece as
  //   <g transform="rotate(a cx cy)"><image .../></g>
  // so a transform set on the <image> is applied in the rotated frame. On
  // four-player shogi that sent red's pieces ninety degrees off for the length
  // of the animation, before the re-render snapped them to the right square.
  const source = readFileSync(join(process.cwd(), 'js', 'game-play.js'), 'utf8')
  const body = source.slice(source.indexOf('function animateMove('), source.indexOf('function captureBurst('))

  test('the animation never writes a transform straight onto the image', () => {
    expect(body).not.toMatch(/pieceEl\.setAttribute\('transform'/)
  })

  test('it animates the rotation group and keeps the rotation', () => {
    expect(body).toContain('baseTransform')
    expect(body).toMatch(/\$\{t\} \$\{baseTransform\}/)
  })

  test('every animation style goes through the one helper', () => {
    const writes = body.match(/setAttribute\('transform'/g) || []
    // exactly one: inside setTransform
    expect(writes).toHaveLength(1)
    expect((body.match(/setTransform\(/g) || []).length).toBe(3) // warp, arc, and the slide/bounce frame
  })
})
