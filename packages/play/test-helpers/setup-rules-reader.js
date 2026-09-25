import { readFileSync } from 'fs'
import { join } from 'path'
import { setRulesReader } from '../src/play.js'
import { corpusFiles } from './corpus-files.js'
import '../src/bootstrap-plugins.js'

const RULES_ROOT = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')

// Built once per family: a component family's games are found by reading each
// file's frontmatter, which is not worth doing on every lookup.
const files = new Map()
function filesOf(family) {
  if (!files.has(family)) files.set(family, corpusFiles(RULES_ROOT, family))
  return files.get(family)
}

setRulesReader(
  (family, slug) => {
    if (slug === 'rulebook') return readFileSync(join(RULES_ROOT, family, 'content', 'rulebook.md'), 'utf8')
    const path = filesOf(family).get(slug) || join(RULES_ROOT, family, 'content', 'variants', `${slug}.md`)
    return readFileSync(path, 'utf8')
  },
  (family) => [...filesOf(family).keys()]
)
