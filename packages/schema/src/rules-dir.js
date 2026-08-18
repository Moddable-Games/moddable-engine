import fs from 'node:fs'
import path from 'node:path'

// Tests that read real content need the moddable-rules checkout, whose location
// differs between a developer machine, a sandbox and CI. Hardcoding one path
// meant these suites failed everywhere except one laptop, which in practice
// meant nobody ran them. Resolve in order of specificity and let the caller
// skip cleanly when there is no checkout at all.
export function resolveRulesDir() {
  const candidates = [
    process.env.MODDABLE_RULES_DIR,
    path.resolve(process.cwd(), '../moddable-rules/games'),
    '/Applications/MAMP/htdocs/MODDABLE/moddable-rules/games',
    '/tmp/rules/games',
  ].filter(Boolean)
  return candidates.find(dir => fs.existsSync(dir)) || null
}

