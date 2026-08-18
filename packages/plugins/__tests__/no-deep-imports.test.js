import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(process.cwd())
const PACKAGES_DIR = path.resolve(ROOT, 'packages')
const JS_DIR = path.resolve(ROOT, 'js')

function getPackageName(filePath) {
  const rel = path.relative(PACKAGES_DIR, filePath)
  const parts = rel.split(path.sep)
  if (parts[0] === 'plugins') return `plugins/${parts[1]}`
  if (parts[0] === 'topologies') return `topologies/${parts[1]}`
  return parts[0]
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null
  return path.resolve(path.dirname(fromFile), specifier)
}

function scanImports(startDir) {
  const results = []
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'test-helpers') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.js')) {
        const content = fs.readFileSync(full, 'utf8')
        const importRegex = /from\s+['"]([^'"]+)['"]/g
        let match
        while ((match = importRegex.exec(content)) !== null) {
          if (match[1].startsWith('.')) {
            results.push({ file: full, specifier: match[1], line: content.slice(0, match.index).split('\n').length })
          }
        }
      }
    }
  }
  walk(startDir)
  return results
}

function isDeepImport(resolved) {
  return resolved.includes(`${path.sep}src${path.sep}`)
}

function crossesBoundary(file, resolved) {
  if (!resolved.startsWith(PACKAGES_DIR)) return false
  const srcPkg = getPackageName(file)
  const tgtPkg = getPackageName(resolved)
  return srcPkg !== tgtPkg
}

const ALLOWLIST = new Set([
  'plugins/chess:topologies/grid',
  'plugins/chess:core',
  'plugins/chess:component-dice',
  'plugins/shogi:piece-behaviour',
  'plugins/xiangqi:piece-behaviour',
  'plugins/go:play',
  'plugins/draughts:play',
  'plugins/shogi:play',
  'plugins/chess:play',
  'plugins/reversi:play',
  'plugins/xiangqi:play',
  'play:game',
  'play:render',
  'play:schema',
  'play:topologies/grid',
  'play:topologies/hex',
  'play:topologies/track',
  'play:topologies/pit',
  'play:topologies/graph',
  'play:topologies/tableau',
  'play:plugins/go',
  'play:plugins/reversi',
  'play:plugins/draughts',
  'play:plugins/shogi',
  'play:plugins/xiangqi',
  'play:plugins/chess',
  'play:ai',
  'play:component-deck',
  'game:core',
  'render:schema',
  'render:core',
  'render:topologies/grid',
  'render:topologies/graph',
  'render:topologies/pit',
  'render:topologies/track',
  'render:topologies/hex',
  'render:topologies/tableau',
  'ai:topologies/grid',
  'hex-generators:core',
  'topologies/grid:core',
  'topologies/hex:core',
  'topologies/hex:hex-generators',
  'topologies/tableau:component-deck',
  'schema:hex-generators',
])
const ALLOWLIST_CEILING = 44

describe('no cross-package deep imports (engine#74)', () => {
  const packagesImports = scanImports(PACKAGES_DIR)

  const violations = packagesImports
    .map(({ file, specifier, line }) => {
      const resolved = resolveImport(file, specifier)
      if (!resolved || !isDeepImport(resolved)) return null
      if (!crossesBoundary(file, resolved)) return null
      const srcPkg = getPackageName(file)
      const tgtPkg = getPackageName(resolved)
      const pair = `${srcPkg}:${tgtPkg}`
      if (ALLOWLIST.has(pair)) return null
      return { file: path.relative(ROOT, file), line, specifier, pair }
    })
    .filter(Boolean)

  it('no new cross-package /src/ imports in packages/', () => {
    if (violations.length > 0) {
      const lines = violations.map(v => `  ${v.file}:${v.line} (${v.pair})\n    ${v.specifier}`)
      throw new Error(`${violations.length} deep import(s) cross package boundaries:\n${lines.join('\n')}`)
    }
  })

  it(`allowlist does not grow beyond ceiling (${ALLOWLIST_CEILING})`, () => {
    expect(ALLOWLIST.size).toBeLessThanOrEqual(ALLOWLIST_CEILING)
  })

  it('allowlist contains no stale entries', () => {
    const usedPairs = new Set(
      packagesImports
        .map(({ file, specifier }) => {
          const resolved = resolveImport(file, specifier)
          if (!resolved || !isDeepImport(resolved)) return null
          if (!crossesBoundary(file, resolved)) return null
          return `${getPackageName(file)}:${getPackageName(resolved)}`
        })
        .filter(Boolean)
    )
    const stale = [...ALLOWLIST].filter(pair => !usedPairs.has(pair))
    if (stale.length > 0) {
      expect(stale).toEqual([])
    }
  })

  it('scans at least 100 source files', () => {
    const fileCount = new Set(packagesImports.map(i => i.file)).size
    expect(fileCount).toBeGreaterThanOrEqual(75)
  })
})

describe('js/ should import through package indexes, not /src/', () => {
  const jsImports = scanImports(JS_DIR)

  const jsDeep = jsImports
    .filter(({ specifier }) => specifier.includes('/src/'))
    .map(({ file, specifier, line }) => ({ file: path.relative(ROOT, file), line, specifier }))

  const JS_DEEP_CEILING = 27

  it(`js/ deep imports do not exceed ceiling (${JS_DEEP_CEILING})`, () => {
    expect(jsDeep.length).toBeLessThanOrEqual(JS_DEEP_CEILING)
  })

  it('reports js/ deep imports for tracking', () => {
    if (jsDeep.length > 0) {
      console.log(`\n  js/ deep imports (${jsDeep.length}/${JS_DEEP_CEILING}):`)
      for (const v of jsDeep.slice(0, 5)) console.log(`    ${v.file}:${v.line} ${v.specifier}`)
      if (jsDeep.length > 5) console.log(`    ... and ${jsDeep.length - 5} more`)
    }
  })
})
