/**
 * `api/stats.json` carries a datestamp and `build-discovery.mjs --check`
 * compares byte for byte, so before this the file went stale at midnight on
 * its own and CI went red for a push that changed nothing.
 *
 * The date has to keep meaning something, though. Freezing it would be the
 * other failure: a figure moves, the date does not, and the file lies about
 * when it was measured. Both directions are asserted here.
 */
import { withStableGeneratedDate } from '../lib/stable-generated-date.mjs'

const committed = { generated: '2026-08-31', playableVariants: 203, tests: 6469 }
const asText = JSON.stringify(committed, null, 2) + '\n'

describe('the generated date moves only when a figure moves', () => {
  it('carries the committed date forward when only the clock moved', () => {
    const built = { generated: '2026-09-01', playableVariants: 203, tests: 6469 }
    expect(withStableGeneratedDate(built, asText).generated).toBe('2026-08-31')
  })

  it('takes the new date when a figure actually changed', () => {
    const built = { generated: '2026-09-01', playableVariants: 204, tests: 6469 }
    expect(withStableGeneratedDate(built, asText).generated).toBe('2026-09-01')
  })

  it('leaves every other field exactly as built', () => {
    const built = { generated: '2026-09-01', playableVariants: 203, tests: 6469 }
    const out = withStableGeneratedDate(built, asText)
    expect(out).toEqual({ generated: '2026-08-31', playableVariants: 203, tests: 6469 })
  })

  it('writes a fresh file when there is no committed one', () => {
    const built = { generated: '2026-09-01', playableVariants: 203 }
    expect(withStableGeneratedDate(built, '').generated).toBe('2026-09-01')
  })

  it('rebuilds rather than trusting an unparseable committed file', () => {
    const built = { generated: '2026-09-01', playableVariants: 203 }
    expect(withStableGeneratedDate(built, '{ not json').generated).toBe('2026-09-01')
  })
})
