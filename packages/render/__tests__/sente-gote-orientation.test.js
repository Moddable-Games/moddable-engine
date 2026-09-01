/**
 * The side a setup declares first must be the side drawn at the top.
 *
 * `parseSfenToPosition` called an UPPERCASE symbol gote and gave it the `b`
 * artwork. Uppercase is sente. Every other path in the renderer maps owner 0,
 * which is uppercase, to `w`, and Chu Shogi's own fenMap says `C: wxC`.
 *
 * Only a setup containing a bracket reaches that parser, so the six large
 * shogi variants - the only ones with multi-character piece codes - drew both
 * camps in the other camp's pieces, facing the wrong way, while every
 * single-character board was correct. Same piece set, opposite results, which
 * is what made it look like a piece-set problem and is why it survived.
 *
 * The invariant is cross-path: whatever the first rank of the setup declares,
 * the top of the rendered board must agree with it.
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const RULES = process.env.MODDABLE_RULES_DIR || resolve(ROOT, '../moddable-rules/games')

function firstRankIsUppercase(setup) {
  const rank = setup.split('/')[0]
  const tok = rank.match(/\[([^\]]+)\]|([A-Za-z])/)
  if (!tok) return null
  const sym = tok[1] || tok[2]
  return sym === sym.toUpperCase()
}

function topPrefix(svgPath) {
  const svg = readFileSync(svgPath, 'utf8')
  const imgs = [...svg.matchAll(/<image href="([^"]+)"[^>]*y="([\d.]+)"/g)]
  if (!imgs.length) return null
  let best = null
  for (const m of imgs) {
    const y = Number(m[2])
    if (!best || y < best.y) best = { y, name: m[1].split('/').pop() }
  }
  return best.name[0]
}

const variantsDir = resolve(RULES, 'shogi', 'content', 'variants')
const cases = []
const fourPlayer = []
if (existsSync(variantsDir)) {
  for (const file of readdirSync(variantsDir)) {
    if (!file.endsWith('.md')) continue
    const slug = file.replace('.md', '')
    const snap = resolve(ROOT, 'snapshots', `shogi--${slug}.svg`)
    if (!existsSync(snap)) continue
    const text = readFileSync(resolve(variantsDir, file), 'utf8')
    const m = text.match(/setup: "([^"]+)"/)
    if (!m || !m[1].includes('/')) continue
    // FEN4 has four seats keyed by colour letter, so "uppercase is sente" is
    // not a statement about it. Named rather than silently filtered.
    if (m[1].includes(',')) { fourPlayer.push(slug); continue }
    cases.push([slug, m[1], snap])
  }
}

describe('the side declared first is the side drawn on top', () => {
  it('found shogi boards to check', () => {
    expect(cases.length).toBeGreaterThanOrEqual(10)
  })

  // Piece sets do not agree on how to spell a seat. The mce sets prefix `w`
  // and `b`; the kahu sets prefix `0` and `1`. Both mean the same two seats,
  // so the assertion is about the seat, not the letter.
  const SEAT_OF_PREFIX = { w: 0, b: 1, '0': 0, '1': 1, s: 0, g: 1 }

  it.each(cases.map(([slug]) => slug))('%s draws its first rank at the top', (slug) => {
    const [, setup, snap] = cases.find(c => c[0] === slug)
    const upper = firstRankIsUppercase(setup)
    if (upper === null) return
    const prefix = topPrefix(snap)
    if (prefix === null) return
    const seat = SEAT_OF_PREFIX[prefix]
    if (seat === undefined) return
    // Uppercase is sente, seat 0; lowercase is gote, seat 1.
    expect(seat).toBe(upper ? 0 : 1)
  })

  it('skips only the four-player boards, and says which', () => {
    expect(fourPlayer).toEqual(['four-player-shogi'])
  })

  it('covers the bracketed variants, which are the ones that were wrong', () => {
    const bracketed = cases.filter(([, setup]) => setup.includes('['))
    expect(bracketed.length).toBeGreaterThanOrEqual(5)
  })
})
