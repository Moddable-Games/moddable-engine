import { readFileSync, existsSync, readdirSync } from 'fs'
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

// Every perimeter board file, not one of them. The first version of this guard
// read only the landlords file, and econopoly carries its own copy of the same
// three boards. That is how the same mistake happened twice: a `role` added to
// one copy and not the other, then a `style` added to one copy and not the
// other, each time leaving econopoly's board rendering plain while this test
// stayed green.
const DATA_DIR = join(process.cwd(), 'data')
const THEME = { corner: '#aaaaaa', 'go-to-jail': '#ff0000', 'corner-stroke': '#000000', 'lot-stripe': '#00ff00' }

const FILES = existsSync(DATA_DIR)
  ? readdirSync(DATA_DIR).filter(f => f.endsWith('-boards.json'))
  : []

function boardsIn(file) {
  return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')).boards || {}
}

const boards = FILES.length ? boardsIn(FILES[0]) : null

describe('perimeter boards render the roles they declare', () => {
  it('finds every perimeter board file', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(2)
  })

  // The style selects the board art. A board that declares none renders plain,
  // which is a silent downgrade rather than an error, so it is asserted.
  it.each(FILES)('%s: every board declares a perimeter style', (file) => {
    const undeclared = Object.entries(boardsIn(file))
      .filter(([, board]) => !board.style)
      .map(([key]) => key)
    expect(undeclared).toEqual([])
  })

  it.each(FILES)('%s: renders every declared go-to-jail space', (file) => {
    const all = boardsIn(file)
    const wrong = []
    for (const [key, board] of Object.entries(all)) {
      const declared = (board.spaces || []).filter(
        s => s.role === 'go-to-jail' || s.type === 'go-to-jail').length
      const rendered = JSON.stringify(perimeterOps(THEME, { _board: key, _boardData: { boards: all } }))
      const tinted = (rendered.match(/#ff0000/g) || []).length
      if (declared === 0 || tinted !== declared) wrong.push(`${key}: declared ${declared}, tinted ${tinted}`)
    }
    expect(wrong).toEqual([])
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
