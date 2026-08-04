import { existsSync } from 'fs'
import { join } from 'path'
import '../../plugins/chess/index.js'
import '../../plugins/go/index.js'
import '../../plugins/draughts/index.js'
import '../../plugins/xiangqi/index.js'
import '../../plugins/shogi/index.js'
import { getVariantKeys, getRegisteredFamilies } from '../src/variant-registry.js'

const RULES_ROOT = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')
const MAX_MISSING = 31

describe('variant-rulebook ratchet', () => {
  it(`variants without a matching .md must be <= ${MAX_MISSING}`, () => {
    const missing = []
    for (const family of getRegisteredFamilies()) {
      for (const key of getVariantKeys(family)) {
        if (key === 'standard') continue
        const variantPath = join(RULES_ROOT, family, 'content', 'variants', `${key}.md`)
        if (!existsSync(variantPath)) missing.push(`${family}/${key}`)
      }
    }
    if (missing.length > 0) {
      console.log(`Variants missing rulebook (${missing.length}/${MAX_MISSING} allowed):\n  ${missing.join('\n  ')}`)
    }
    expect(missing.length).toBeLessThanOrEqual(MAX_MISSING)
  })
})
