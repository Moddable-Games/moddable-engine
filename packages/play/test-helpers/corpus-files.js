import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { parseFrontmatter } from '../../schema/index.js'

// Where each playable file of a family lives, keyed by the name the game goes
// by. A board family keeps one file per variant:
//
//     content/variants/<slug>.md
//
// A component family - a deck, a set of dice, dominoes, mahjong tiles - keeps
// its games one directory each, a `standard.md` plus any alternates:
//
//     content/games/<game>/<variant>.md
//
// and there the name is the frontmatter `slug:`, not the file's: the cribbage
// directory holds three games that call themselves `cribbage`,
// `three-player-cribbage` and `four-player-cribbage`, which are the names the
// rulebook's `unsupported:` map and the gap guard use (engine#176). Reading
// only the first shape is how forty games came to be tracked by nothing.
export function corpusFiles(rulesRoot, family) {
  const out = new Map()
  const variants = join(rulesRoot, family, 'content', 'variants')
  if (existsSync(variants)) {
    for (const file of readdirSync(variants).filter(f => f.endsWith('.md'))) {
      out.set(file.replace(/\.md$/, ''), join(variants, file))
    }
  }
  const games = join(rulesRoot, family, 'content', 'games')
  if (existsSync(games)) {
    for (const dir of readdirSync(games, { withFileTypes: true }).filter(d => d.isDirectory())) {
      const gameDir = join(games, dir.name)
      for (const file of readdirSync(gameDir).filter(f => f.endsWith('.md'))) {
        const path = join(gameDir, file)
        let slug = null
        try { slug = parseFrontmatter(readFileSync(path, 'utf8')).meta?.slug || null } catch { /* unreadable */ }
        const name = slug || (file === 'standard.md' ? dir.name : `${dir.name}-${file.replace(/\.md$/, '')}`)
        if (!out.has(name)) out.set(name, path)
      }
    }
  }
  return out
}

// The same map, relative to the rules root's `games/` directory, which is the
// shape a browser needs to fetch it.
export function corpusPaths(rulesRoot, family) {
  const prefix = join(rulesRoot, family) + '/'
  return new Map([...corpusFiles(rulesRoot, family)].map(([slug, path]) => [slug, family + '/' + path.slice(prefix.length)]))
}
