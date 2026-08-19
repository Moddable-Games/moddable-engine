import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { setRulesReader } from '../src/play.js'
import '../src/bootstrap-plugins.js'

const RULES_ROOT = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')

setRulesReader(
  (family, slug) => {
    const path = slug === 'rulebook'
      ? join(RULES_ROOT, family, 'content', 'rulebook.md')
      : join(RULES_ROOT, family, 'content', 'variants', `${slug}.md`)
    return readFileSync(path, 'utf8')
  },
  (family) => {
    const dir = join(RULES_ROOT, family, 'content', 'variants')
    try {
      return readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace(/\.md$/, ''))
    } catch {
      return []
    }
  }
)
