import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { perimeterOps } from '../src/produce-layout-perimeter.js'

// The go-to-jail corner used to be found by reading English prose:
// `space.notes.includes('Go to Jail')`. #138 replaced that with a declared
// `role`, which is right, but the role was added to the copy of the board data
// in moddable-rules while the renderer reads the copy in the engine's own
// data/ directory. The tint silently stopped rendering on two boards and
// nothing failed, because nothing ever asserted it rendered in the first place.
//
// This asserts the declaration reaches the drawing, so a role that is declared
// in the wrong file, or dropped, or renamed, fails here.

const DATA = join(process.cwd(), 'data', 'landlords-game-boards.json')
const THEME = { corner: '#aaaaaa', 'go-to-jail': '#ff0000', 'corner-stroke': '#000000' }

const boards = existsSync(DATA) ? JSON.parse(readFileSync(DATA, 'utf8')).boards : null

describe('perimeter boards render the roles they declare', () => {
  it('the board data is where the renderer looks for it', () => {
    expect(boards).not.toBeNull()
    expect(Object.keys(boards).length).toBeGreaterThan(0)
  })

  // "Every declared role is tinted" is not enough on its own: when the two
  // corner declarations went missing, each board still had its non-corner
  // go-to-jail space, so declared and tinted both fell to 1 and agreed. The
  // count is what the historical boards actually have, so a dropped
  // declaration fails rather than quietly agreeing with itself.
  const GO_TO_JAIL_SPACES = {
    '1904-patent': 2,
    '1906-egc': 2,
    '1932-prosperity': 1,
  }

  it('every board is covered by the expected counts', () => {
    expect(Object.keys(boards).sort()).toEqual(Object.keys(GO_TO_JAIL_SPACES).sort())
  })

  it.each(Object.keys(GO_TO_JAIL_SPACES))('%s: declares and renders every go-to-jail space', (key) => {
    const expected = GO_TO_JAIL_SPACES[key]
    const declared = (boards[key].spaces || []).filter(
      s => s.role === 'go-to-jail' || s.type === 'go-to-jail')
    expect(declared).toHaveLength(expected)

    const rendered = JSON.stringify(perimeterOps(THEME, { _board: key, _boardData: { boards } }))
    expect((rendered.match(/#ff0000/g) || [])).toHaveLength(expected)
  })

  it('no board is still identified by the prose in its notes', () => {
    const src = readFileSync(join(process.cwd(), 'packages', 'schema', 'src', 'produce-layout-perimeter.js'), 'utf8')
    expect(src).not.toMatch(/notes\s*&&\s*\w+\.notes\.includes/)
  })
})
