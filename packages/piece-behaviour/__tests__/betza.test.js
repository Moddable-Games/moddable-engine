import { betzaToSpec } from '../src/betza.js'

// The offset convention these assert against is the corpus's own: forward is
// row -1, and a seat that faces the other way is rotated by the plugin.
const sorted = (offsets) => offsets.map(o => o.join(',')).sort()

describe('betza atoms', () => {
  test('unmodified atoms give their full direction set', () => {
    expect(sorted(betzaToSpec('W').offsets)).toEqual(sorted([[-1, 0], [1, 0], [0, -1], [0, 1]]))
    expect(sorted(betzaToSpec('F').offsets)).toEqual(sorted([[-1, -1], [-1, 1], [1, -1], [1, 1]]))
    expect(betzaToSpec('K').offsets).toHaveLength(8)
    expect(betzaToSpec('N').offsets).toHaveLength(8)
  })

  test('sliders are riders and steppers are leapers', () => {
    expect(betzaToSpec('R').type).toBe('rider')
    expect(betzaToSpec('R').maxSteps).toBeUndefined()
    expect(betzaToSpec('W').type).toBe('leaper')
  })

  test('a step count makes a short slider, which may not jump', () => {
    // Wa Shogi's liberated horse is fRbW2: two squares backward, not a leap to
    // the second one.
    const [forward, back] = betzaToSpec('fRbW2')
    expect(forward).toMatchObject({ type: 'rider', dirs: [[-1, 0]] })
    expect(back).toMatchObject({ type: 'rider', dirs: [[1, 0]], maxSteps: 2 })
  })
})

describe('betza modifiers', () => {
  test('a modifier selects on the offset\'s longer component', () => {
    // The bug this pins: judging a knight's direction by the sign of its row
    // alone calls (-1,-2) forward, and `vN` - the heavenly horse Wa Shogi's
    // liberated horse promotes into - comes out as an ordinary knight.
    expect(sorted(betzaToSpec('vN').offsets)).toEqual(sorted([[-2, -1], [-2, 1], [2, -1], [2, 1]]))
    expect(sorted(betzaToSpec('fN').offsets)).toEqual(sorted([[-2, -1], [-2, 1]]))
    expect(sorted(betzaToSpec('lN').offsets)).toEqual(sorted([[-1, -2], [1, -2]]))
  })

  test('a symmetric offset belongs to both halves it lies between', () => {
    // fF is both forward diagonals, lF both left ones - the same four offsets
    // partitioned two different ways.
    expect(sorted(betzaToSpec('fF').offsets)).toEqual(sorted([[-1, -1], [-1, 1]]))
    expect(sorted(betzaToSpec('lF').offsets)).toEqual(sorted([[-1, -1], [1, -1]]))
  })

  test('v and s abbreviate pairs, and several modifiers are a union', () => {
    expect(sorted(betzaToSpec('vW').offsets)).toEqual(sorted([[-1, 0], [1, 0]]))
    expect(sorted(betzaToSpec('sW').offsets)).toEqual(sorted([[0, -1], [0, 1]]))
    expect(sorted(betzaToSpec('fbW').offsets)).toEqual(sorted(betzaToSpec('vW').offsets))
    expect(sorted(betzaToSpec('frlW').offsets)).toEqual(sorted([[-1, 0], [0, -1], [0, 1]]))
  })

  test('only the legs that face a direction rotate with their seat', () => {
    // Wa Shogi's treacherous fox: a symmetric ferz and alfil beside a vertical
    // wazir and dabbaba. Rotating the first two would map them onto themselves.
    const legs = betzaToSpec('FAvWvD')
    expect(legs.map(l => Boolean(l.directional))).toEqual([false, false, true, true])
  })
})

describe('betza chains a second leg', () => {
  test('[aK] is a two-step area move', () => {
    expect(betzaToSpec('[aK]')).toMatchObject({ type: 'area', steps: 2 })
    expect(betzaToSpec('[aK]').dirs).toHaveLength(8)
  })

  test('the brackets say what is chained', () => {
    // The source is explicit: "DaK would denote a dabbaba move followed by a
    // king move, but D[aK] would denote a piece that can move as a dabbaba, or
    // twice as a king". Only the second form is modelled.
    const [jump, area] = betzaToSpec('D[aK]')
    expect(jump).toMatchObject({ type: 'leaper' })
    expect(area).toMatchObject({ type: 'area' })
    expect(() => betzaToSpec('DaK')).toThrow(/Betza:/)
  })

  test('the Lion is a jump and an area move, not one or the other', () => {
    // NAD[aK]. The jump reaches every square two away bypassing whatever is
    // between; the area move takes two steps and may capture on each.
    const legs = betzaToSpec('NAD[aK]')
    expect(legs.filter(l => l.type === 'leaper')).toHaveLength(3)
    expect(legs.filter(l => l.type === 'area')).toHaveLength(1)
  })

  test('a step count sets the number of legs', () => {
    expect(betzaToSpec('[a3K]')).toMatchObject({ steps: 3 })
  })
})

describe('betza reads the legs Tenjiku needs', () => {
  test('cpp is a range jump kept apart from the ordinary slide', () => {
    // "may jump over any number of pieces ... but only when making a capture".
    // RcppR is a rook that ALSO has this, so it must be two legs.
    const [slide, jump] = betzaToSpec('RcppR')
    expect(slide).toMatchObject({ type: 'rider' })
    expect(jump).toMatchObject({ type: 'rangeCapture' })
    expect(jump.dirs).toEqual(slide.dirs)
  })

  test('m on a chained leg makes the walk quiet, which lets it run further', () => {
    // "mKa3K is up to three king steps that must stop on first capture" - so
    // nothing is taken on the way, and no intermediate square need be recorded.
    expect(betzaToSpec('[mKa3K]')).toMatchObject({ type: 'area', steps: 3, quiet: true })
  })

  test('x captures without moving', () => {
    expect(betzaToSpec('xK')).toMatchObject({ type: 'shoot' })
    expect(betzaToSpec('xK').dirs).toHaveLength(8)
  })

  test('a chain whose legs are different atoms is refused, not guessed', () => {
    expect(() => betzaToSpec('[WaF]')).toThrow(/different atoms/)
  })

  test('a step range bounds a slide at one end or both', () => {
    // Tenjiku's heavenly tetrarch is B(>=2)fbR(>=2)rlR(2<=n<=3)cxK: it cannot
    // move to an adjacent square at all.
    expect(betzaToSpec('B(>=2)')).toMatchObject({ type: 'rider', minSteps: 2 })
    expect(betzaToSpec('R(2<=n<=3)')).toMatchObject({ type: 'rider', minSteps: 2, maxSteps: 3 })
    expect(betzaToSpec('B(>=2)fbR(>=2)rlR(2<=n<=3)cxK')).toHaveLength(4)
  })
})

describe('betza refuses what it cannot read', () => {
  test.each(['pR', 'mK', 'RaK', 'Z', '[aR]', 'K(>=2)'])('%s throws by name', (notation) => {
    expect(() => betzaToSpec(notation)).toThrow(/Betza:/)
  })

  test('a count on a jumping atom is refused rather than approximated', () => {
    expect(() => betzaToSpec('N2')).toThrow(/jumping atom/)
  })

  test('modifiers that leave nothing are refused', () => {
    // A dabbaba has no offset whose longer component is diagonal, so this must
    // not quietly compile to an empty move set.
    expect(() => betzaToSpec('D')).not.toThrow()
    expect(() => betzaToSpec('')).toThrow(/Betza:/)
  })
})
