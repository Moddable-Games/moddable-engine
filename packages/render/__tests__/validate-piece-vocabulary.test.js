import { validatePieceVocabulary, buildPieceImages } from '../src/render-engine.js'

// engine#168. The warning asked its own question and got its own answer: it
// looked only at `setDef.pieces`, so every set that inherits reported its whole
// base set as undrawable, and it rebuilt the key as w/b + uppercase, so a
// four-player set keyed `rK` was reported as `bRK`. Forty of the corpus's
// fifty-one warnings were wrong, which is how the real ones went unread.

const gallery = [
  { id: 'base', pieces: { wK: 'wK.svg', bK: 'bK.svg', wA: 'wA.svg', bA: 'bA.svg' } },
  { id: 'derived', extends: 'base', pieces: { wZ: 'wZ.svg', bZ: 'bZ.svg' } },
  { id: 'seats', pieces: { rK: 'rK.svg', yK: 'yK.svg' } },
]

function warningsFor(resolved) {
  const warnings = []
  const original = console.warn
  console.warn = (msg) => warnings.push(msg)
  try {
    const built = buildPieceImages(resolved.pieces.set, gallery, resolved.pieces.fenMap, false)
    validatePieceVocabulary(resolved, gallery, built.images)
  } finally {
    console.warn = original
  }
  return warnings
}

describe('validatePieceVocabulary (engine#168)', () => {
  it('says nothing about a piece the set inherits', () => {
    expect(warningsFor({
      pieces: { set: 'derived' },
      vocabulary: { archbishop: { symbols: { 0: 'A', 1: 'a' } } },
    })).toEqual([])
  })

  it('says nothing about a piece the set declares itself', () => {
    expect(warningsFor({
      pieces: { set: 'derived' },
      vocabulary: { zebra: { symbols: { 0: 'Z', 1: 'z' } } },
    })).toEqual([])
  })

  it('says nothing about a seat-prefixed key the set is actually keyed by', () => {
    expect(warningsFor({
      pieces: { set: 'seats' },
      vocabulary: { king: { symbols: { 0: 'rK', 1: 'yK' } } },
    })).toEqual([])
  })

  it('still warns about a piece nothing in the chain can draw', () => {
    const warnings = warningsFor({
      pieces: { set: 'derived' },
      vocabulary: { griffin: { symbols: { 0: 'Y', 1: 'y' } } },
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('cannot draw 2 symbol(s)')
    expect(warnings[0]).toContain("griffin(0) 'Y'")
  })

  it('still warns when the set is not in the gallery at all', () => {
    const warnings = warningsFor({ pieces: { set: 'nowhere' }, vocabulary: {} })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('not found in gallery')
  })
})
