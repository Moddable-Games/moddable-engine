import { readFileSync } from 'fs'
import { join } from 'path'
import { depictionMismatches, buildPieceImages } from '../src/render-engine.js'

// engine#180. Gygax Chess's Dragon is `R`, and in a chess set `R` is a Rook.
// The letter resolved to a real image, so nothing fell back and the stand-in
// check saw nothing: all fifteen pieces were drawn as other pieces while every
// guard passed. A set now says what each image shows, and a piece drawn with
// an image of a different piece is reported.

const gallery = JSON.parse(readFileSync(join(process.cwd(), 'pieces', 'gallery-index.json'), 'utf8'))

function mismatches(set, vocabulary) {
  const resolved = { pieces: { set }, vocabulary }
  const { images } = buildPieceImages(set, gallery, null, false)
  return depictionMismatches(resolved, gallery, images)
}

const GYGAX = {
  dragon: { symbols: { 0: 'R', 1: 'r' } },
  basilisk: { symbols: { 0: 'B', 1: 'b' } },
  paladin: { symbols: { 0: 'P', 1: 'p' } },
  king: { symbols: { 0: 'K', 1: 'k' } },
}

describe('a piece drawn with an image of another piece', () => {
  test('Gygax Chess on a chess set draws its Dragon as a Rook, and is reported', () => {
    const found = mismatches('mce-chess', GYGAX)
    expect(found).toEqual(expect.arrayContaining([
      expect.stringContaining('(rook)'),
      expect.stringContaining('(bishop)'),
      expect.stringContaining('(pawn)'),
    ]))
    // The King is a king in both, so it is not a mismatch.
    expect(found.some(m => m.includes('(king)'))).toBe(false)
  })

  test('on its own sets, every piece is itself', () => {
    expect(mismatches('ryley-gygax-gold-scarlet', GYGAX)).toEqual([])
    expect(mismatches('ryley-gygax', GYGAX)).toEqual([])
  })

  test('ordinary chess on a chess set is clean', () => {
    const chess = { rook: { symbols: { 0: 'R', 1: 'r' } }, bishop: { symbols: { 0: 'B', 1: 'b' } } }
    expect(mismatches('mce-chess', chess)).toEqual([])
  })

  test('a set that says nothing about its images is not guessed at', () => {
    expect(mismatches('kadagaden-xiangqi-wood', GYGAX)).toEqual([])
  })

  test('both Gygax sets say what all fifteen pieces show', () => {
    for (const id of ['ryley-gygax', 'ryley-gygax-gold-scarlet']) {
      const set = gallery.find(s => s.id === id)
      expect(Object.keys(set.depicts)).toHaveLength(15)
    }
  })
})
