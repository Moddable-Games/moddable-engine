import { cascadeResolve, deepMerge } from '../index.js'

// Resolving a variant must not edit the variant. `deepMerge` handed back the
// variant's own nested objects wherever the family had nothing to merge with,
// and deriving defaults then wrote `cellColor` and `labels` into them. The
// create page keeps the block it imported and exports it; it exported defaults
// the file never declared.

describe('cascade purity', () => {
  test('resolving leaves the variant block exactly as it was', () => {
    const engine = { topology: { type: 'grid', rows: 7, cols: 7 }, render: { river: false }, plugins: { xiangqi: { palace: {} } } }
    const before = JSON.stringify(engine)
    const { resolved } = cascadeResolve({
      surface: {},
      family: { engine: {}, meta: {} },
      variant: { engine, meta: { label: 'x' } },
    })
    expect(resolved.render.cellColor).toBe('checkered')
    expect(JSON.stringify(engine)).toBe(before)
  })

  test('the family block is not edited either', () => {
    const family = { render: { labels: false }, topology: { type: 'hex', shape: 'hexagonal' } }
    const before = JSON.stringify(family)
    cascadeResolve({ surface: {}, family: { engine: family, meta: {} }, variant: { engine: {}, meta: { label: 'x' } } })
    expect(JSON.stringify(family)).toBe(before)
  })

  test('a merge shares no plain object with either input', () => {
    const base = { a: { b: 1 } }
    const override = { c: { d: 2 } }
    const out = deepMerge(base, override)
    expect(out.a).not.toBe(base.a)
    expect(out.c).not.toBe(override.c)
    expect(out).toEqual({ a: { b: 1 }, c: { d: 2 } })
  })
})
