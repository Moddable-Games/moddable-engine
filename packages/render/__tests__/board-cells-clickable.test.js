// A board can render perfectly and still be unplayable.
//
// Every node on a morris board is drawn inside a wrapping `<g>`, and the
// serialiser stamped `pointer-events="none"` on everything that was not itself
// a hit target - the group included. `pointer-events` inherits, so all
// twenty-four hit targets, which set no value of their own, took the group's
// `none` and stopped answering clicks. The board drew, the pieces drew, the
// SVG carried all twenty-four `board-cell` elements with the right ids at the
// right coordinates, and a player could not place a single man.
//
// Nothing caught it, because every test asked whether the hit targets existed.
// Existing is not the same as being clickable, and the difference is exactly
// one inherited attribute.
//
// This reads the committed snapshots, which `board-snapshots.test.js` holds
// byte-identical to what the renderer produces, and works out what a browser
// would compute for each hit target after inheritance.
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const SNAP_DIR = join(process.cwd(), 'snapshots')
const FILES = readdirSync(SNAP_DIR).filter(f => f.endsWith('.svg'))

// Floors, so a run that parses nothing cannot pass quietly.
const BOARD_FLOOR = 320
const CELL_FLOOR = 5000

const TAG = /<(\/?)([a-zA-Z]+)((?:"[^"]*"|[^>"])*?)(\/?)>/g
const ATTR = /([a-zA-Z-]+)="([^"]*)"/g

// What a browser would end up using for each `board-cell`, given that
// `pointer-events` is inherited from ancestor elements.
function effectivePointerEvents(svg) {
  const out = []
  const stack = [null]
  let m
  TAG.lastIndex = 0
  while ((m = TAG.exec(svg)) !== null) {
    const [, closing, tag, rawAttrs, selfClosing] = m
    if (closing) { if (stack.length > 1) stack.pop(); continue }

    const attrs = {}
    ATTR.lastIndex = 0
    let a
    while ((a = ATTR.exec(rawAttrs)) !== null) attrs[a[1]] = a[2]

    const inherited = stack[stack.length - 1]
    const own = attrs['pointer-events'] || null
    const effective = own || inherited

    if (attrs.class && attrs.class.split(/\s+/).includes('board-cell')) {
      out.push({ sq: attrs['data-sq'] || '(unnamed)', effective })
    }
    if (!selfClosing && tag !== 'svg') stack.push(effective)
  }
  return out
}

describe('every hit target on every committed board answers a click', () => {
  it('reads enough boards to mean something', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(BOARD_FLOOR)
  })

  const found = []
  const dead = []
  for (const file of FILES) {
    const cells = effectivePointerEvents(readFileSync(join(SNAP_DIR, file), 'utf8'))
    for (const cell of cells) {
      found.push(cell)
      if (cell.effective === 'none') dead.push(`${file.replace(/\.svg$/, '')} ${cell.sq}`)
    }
  }

  it('reads enough hit targets to mean something', () => {
    expect(found.length).toBeGreaterThanOrEqual(CELL_FLOOR)
  })

  it('leaves no hit target with pointer-events none, its own or inherited', () => {
    expect(dead.slice(0, 20)).toEqual([])
    expect(dead).toHaveLength(0)
  })

  // A hit target drawn outside the frame cannot be clicked either, and is just
  // as invisible to a test that only counts elements.
  it('draws every hit target inside the board it belongs to', () => {
    const outside = []
    let checked = 0
    for (const file of FILES) {
      const svg = readFileSync(join(SNAP_DIR, file), 'utf8')
      const vb = /viewBox="([\d.\-\s]+)"/.exec(svg)
      if (!vb) continue
      const [minX, minY, w, h] = vb[1].trim().split(/\s+/).map(Number)
      if (!Number.isFinite(w) || !Number.isFinite(h)) continue
      for (const m of svg.matchAll(/<(?:circle|ellipse|rect|polygon)((?:"[^"]*"|[^>"])*?)\/?>/g)) {
        const raw = m[1]
        if (!/class="[^"]*\bboard-cell\b[^"]*"/.test(raw)) continue
        const cx = /\bcx="([\d.-]+)"/.exec(raw)
        const cy = /\bcy="([\d.-]+)"/.exec(raw)
        const x = /\bx="([\d.-]+)"/.exec(raw)
        const y = /\by="([\d.-]+)"/.exec(raw)
        const ew = /\bwidth="([\d.-]+)"/.exec(raw)
        const eh = /\bheight="([\d.-]+)"/.exec(raw)
        const px = cx ? +cx[1] : (x && ew ? +x[1] + +ew[1] / 2 : null)
        const py = cy ? +cy[1] : (y && eh ? +y[1] + +eh[1] / 2 : null)
        if (px === null || py === null) continue
        checked++
        if (px < minX || px > minX + w || py < minY || py > minY + h) {
          const sq = /data-sq="([^"]*)"/.exec(raw)
          outside.push(`${file.replace(/\.svg$/, '')} ${sq ? sq[1] : '(unnamed)'} at ${px},${py} outside ${minX},${minY} ${w}x${h}`)
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(CELL_FLOOR)
    expect(outside.slice(0, 20)).toEqual([])
  })

  // The morris case exactly: the value has to be the cell's own, because an
  // ancestor that opts out of pointer events would otherwise decide for it.
  it('gives every hit target a pointer-events value of its own', () => {
    const inheriting = []
    for (const file of FILES) {
      const svg = readFileSync(join(SNAP_DIR, file), 'utf8')
      for (const m of svg.matchAll(/<[a-zA-Z]+((?:"[^"]*"|[^>"])*?)\/?>/g)) {
        const raw = m[1]
        if (!/class="[^"]*\bboard-cell\b[^"]*"/.test(raw)) continue
        if (!/pointer-events="/.test(raw)) {
          const sq = /data-sq="([^"]*)"/.exec(raw)
          inheriting.push(`${file.replace(/\.svg$/, '')} ${sq ? sq[1] : '(unnamed)'}`)
        }
      }
    }
    expect(inheriting.slice(0, 20)).toEqual([])
  })
})
