/**
 * The board gallery's Rules links must point at pages moddable-rules actually
 * built.
 *
 * The engine used to compose these itself as `family/variants/slug/`, which is
 * right for most variants and wrong for every single-variant game - agon's only
 * page is `agon/index.html` - and for the games published under `games/`
 * instead of `variants/`. Twelve links 404ed and nothing noticed, because the
 * gallery checked its own arithmetic rather than the site it links into.
 *
 * So this asks the site. Every URL in the index is resolved against the
 * committed `dist/` tree in moddable-rules; a guessed shape fails here.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { GAMES_DIR, ENGINE_ROOT, loadRulesUrls } from '../lib/board-corpus.mjs'

const RULES_ROOT = resolve(GAMES_DIR, '..')
const DIST_DIR = resolve(RULES_ROOT, 'dist')

const index = JSON.parse(readFileSync(resolve(ENGINE_ROOT, 'boards/board-index.json'), 'utf8'))

describe('board gallery rules links', () => {
  test('the index is not empty', () => {
    expect(index.length).toBeGreaterThan(300)
  })

  test('every rules URL names a page moddable-rules built', () => {
    const broken = index
      .filter(e => e.rulesUrl)
      .filter(e => !existsSync(resolve(DIST_DIR, e.rulesUrl)))
      .map(e => `${e.family}/${e.variant} -> ${e.rulesUrl}`)
    expect(broken).toEqual([])
  })

  test('most boards carry a rules link', () => {
    const linked = index.filter(e => e.rulesUrl).length
    expect(linked / index.length).toBeGreaterThan(0.95)
  })

  test('the index agrees with the corpus about where rules live', () => {
    const rulesUrlFor = loadRulesUrls()
    const disagreements = index
      .filter(e => rulesUrlFor(e.family, e.variant) !== e.rulesUrl)
      .map(e => `${e.family}/${e.variant}: index ${e.rulesUrl || '(none)'} vs corpus ${rulesUrlFor(e.family, e.variant) || '(none)'}`)
    expect(disagreements).toEqual([])
  })

  test('Play links match the variants the play page can actually offer', () => {
    // Two lists, asserted against each other rather than against a rule either
    // one restates. The gallery decides from corpus frontmatter; the play page
    // reads its own manifest. If they ever disagree, one surface is lying.
    const manifest = JSON.parse(
      readFileSync(resolve(ENGINE_ROOT, 'play/playability-manifest.json'), 'utf8')
    )
    const inManifest = new Set(manifest.map(v => `${v.family}/${v.variant}`))
    const inGallery = new Set(index.filter(e => e.playable).map(e => `${e.family}/${e.variant}`))

    const galleryOnly = [...inGallery].filter(k => !inManifest.has(k)).sort()
    const manifestOnly = [...inManifest].filter(k => !inGallery.has(k)).sort()
    expect({ galleryOnly, manifestOnly }).toEqual({ galleryOnly: [], manifestOnly: [] })
  })
})
