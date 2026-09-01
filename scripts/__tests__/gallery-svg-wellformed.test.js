/**
 * Every gallery SVG must be well-formed XML.
 *
 * Dobutsu Shogi and two mahjong boards were blank cards in the gallery -
 * board and all, not just the pieces. Their artwork was an editor export
 * carrying `sodipodi:` and `osb:` attributes whose xmlns declarations lived on
 * the source file's own <svg> root, which is discarded when the artwork is
 * inlined as a <symbol>. The prefix was then undeclared, the document was
 * malformed, and the browser rendered none of it.
 *
 * Nothing caught it because a malformed SVG is still a file of the right size
 * in the right place with the right name. Only a parser can tell.
 */
import { readdirSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const SVG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../boards/svgs')
const files = readdirSync(SVG_DIR).filter(f => f.endsWith('.svg'))

describe('every board gallery SVG is well-formed', () => {
  it('has boards to check', () => {
    expect(files.length).toBeGreaterThanOrEqual(300)
  })

  it('declares every namespace prefix it uses', () => {
    const broken = []
    for (const f of files) {
      const text = readFileSync(resolve(SVG_DIR, f), 'utf8')
      const used = new Set([...text.matchAll(/\s([\w-]+):[\w-]+=/g)].map(m => m[1]))
      const declared = new Set([...text.matchAll(/xmlns:([\w-]+)=/g)].map(m => m[1]))
      for (const p of used) {
        if (p === 'xml' || p === 'xlink' || declared.has(p)) continue
        broken.push(`${f}: undeclared prefix "${p}:"`)
        break
      }
    }
    expect(broken).toEqual([])
  })
})
