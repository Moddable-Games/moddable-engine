import { parseFrontmatter } from '../src/parse-frontmatter.js'

describe('parseFrontmatter', () => {
  test('extracts yaml between --- delimiters', () => {
    const content = `---
title: "Standard Chess"
slug: standard
players: 2
---

## Rules here`

    const { meta, body } = parseFrontmatter(content)
    expect(meta.title).toBe('Standard Chess')
    expect(meta.slug).toBe('standard')
    expect(meta.players).toBe(2)
    expect(body.trim()).toBe('## Rules here')
  })

  test('returns empty meta when no frontmatter', () => {
    const content = '## Just markdown\n\nNo frontmatter here.'
    const { meta, body } = parseFrontmatter(content)
    expect(meta).toEqual({})
    expect(body).toBe(content)
  })

  test('parses nested objects', () => {
    const content = `---
title: "Test"
engine:
  topology:
    type: grid
    rows: 8
    cols: 8
---
`
    const { meta } = parseFrontmatter(content)
    expect(meta.engine.topology.type).toBe('grid')
    expect(meta.engine.topology.rows).toBe(8)
    expect(meta.engine.topology.cols).toBe(8)
  })

  test('parses boolean values', () => {
    const content = `---
published: true
draft: false
---
`
    const { meta } = parseFrontmatter(content)
    expect(meta.published).toBe(true)
    expect(meta.draft).toBe(false)
  })

  test('parses inline arrays', () => {
    const content = `---
players: [white, black]
---
`
    const { meta } = parseFrontmatter(content)
    expect(meta.players).toEqual(['white', 'black'])
  })

  test('parses list items', () => {
    const content = `---
positions:
  - start
  - point-1
  - point-2
  - home
---
`
    const { meta } = parseFrontmatter(content)
    expect(meta.positions).toEqual(['start', 'point-1', 'point-2', 'home'])
  })

  test('handles quoted strings with special characters', () => {
    const content = `---
title: "Chess — 8×8"
duration: "10–60 min"
---
`
    const { meta } = parseFrontmatter(content)
    expect(meta.title).toBe('Chess — 8×8')
    expect(meta.duration).toBe('10–60 min')
  })

  test('handles null values', () => {
    const content = `---
value: null
---
`
    const { meta } = parseFrontmatter(content)
    expect(meta.value).toBeNull()
  })

  test('block-form and inline-form quoted keys parse identically', () => {
    const blockForm = `---
symbols:
  "0": F
  "1": f
---
`
    const inlineForm = `---
symbols: {"0": F, "1": f}
---
`
    const unquotedForm = `---
symbols:
  0: F
  1: f
---
`
    const block = parseFrontmatter(blockForm).meta
    const inline = parseFrontmatter(inlineForm).meta
    const unquoted = parseFrontmatter(unquotedForm).meta

    expect(block.symbols).toEqual({ 0: 'F', 1: 'f' })
    expect(inline.symbols).toEqual({ 0: 'F', 1: 'f' })
    expect(unquoted.symbols).toEqual({ 0: 'F', 1: 'f' })
  })

  test('FEN strings as quoted block keys parse without embedded quotes', () => {
    const content = `---
openingBook:
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -":
    - e2e4
    - d2d4
---
`
    const { meta } = parseFrontmatter(content)
    const keys = Object.keys(meta.openingBook)
    expect(keys[0]).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')
    expect(meta.openingBook[keys[0]]).toEqual(['e2e4', 'd2d4'])
  })
})
