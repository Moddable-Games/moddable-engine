import { unsupportedVariants, unsupportedReason, unsupportedForFamily } from '../src/unsupported.js'

describe('unsupported declarations', () => {
  it('reads a rulebook block as slug -> reason', () => {
    const map = unsupportedVariants({ unsupported: { alice: 'two boards' } })
    expect([...map]).toEqual([['alice', 'two boards']])
  })

  it('reads the block from inside engine, because two rulebooks put it there', () => {
    const map = unsupportedVariants({ engine: { unsupported: { alice: 'two boards' } } })
    expect(map.get('alice')).toBe('two boards')
  })

  it('reads a variant-level string', () => {
    expect(unsupportedReason({ unsupported: 'the relay capture is not modelled' }))
      .toBe('the relay capture is not modelled')
  })

  it('ignores an entry with no reason, so a bare slug cannot silence a variant', () => {
    expect(unsupportedVariants({ unsupported: { alice: '', gygax: '   ' } }).size).toBe(0)
  })

  describe('_family, the part of the reason every variant shares', () => {
    // Tafl's four variants are blocked on the same missing plugin and differ
    // only in board size. Without this the same paragraph is copied four times
    // and the one sentence that distinguishes them is buried at the end of it.
    const meta = {
      unsupported: {
        _family: 'No rules plugin.',
        brandubh: 'The 7x7 form.',
        hnefatafl: 'The 11x11 form.',
      },
    }

    it('prefixes each variant reason with the shared one', () => {
      const map = unsupportedVariants(meta)
      expect(map.get('brandubh')).toBe('No rules plugin. The 7x7 form.')
      expect(map.get('hnefatafl')).toBe('No rules plugin. The 11x11 form.')
    })

    it('is never itself a variant', () => {
      expect(unsupportedVariants(meta).has('_family')).toBe(false)
      expect(unsupportedVariants(meta).size).toBe(2)
    })

    it('stands alone for a variant that adds nothing of its own', () => {
      // `standard:` with no value is null in YAML, and means "the family
      // reason, and nothing further".
      const map = unsupportedVariants({ unsupported: { _family: 'No rules plugin.', standard: null } })
      expect(map.get('standard')).toBe('No rules plugin.')
    })

    it('does nothing on its own', () => {
      expect(unsupportedVariants({ unsupported: { _family: 'No rules plugin.' } }).size).toBe(0)
    })

    it('leaves a block without one exactly as it was', () => {
      expect(unsupportedVariants({ unsupported: { alice: 'two boards' } }).get('alice')).toBe('two boards')
    })
  })

  it('merges rulebook and variant declarations, variant winning', () => {
    const map = unsupportedForFamily(
      { unsupported: { _family: 'No plugin.', a: 'one', b: 'two' } },
      { b: { unsupported: 'measured: it throws on the first move' } },
    )
    expect(map.get('a')).toBe('No plugin. one')
    expect(map.get('b')).toBe('measured: it throws on the first move')
  })
})
