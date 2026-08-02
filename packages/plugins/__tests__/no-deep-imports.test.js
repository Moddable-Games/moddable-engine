import { execSync } from 'child_process'
import path from 'path'

const PACKAGES_DIR = path.resolve(process.cwd(), 'packages')

describe('engine#74: no cross-package deep imports', () => {
  it('no source file imports from another package via /src/ path', () => {
    const result = execSync(
      `grep -rn "from '.*\\.\\./.*/" "${PACKAGES_DIR}" --include="*.js" --exclude-dir=__tests__ --exclude-dir=node_modules --exclude-dir=mce | grep -v "from '\\.\\./" | grep "/src/" || true`,
      { encoding: 'utf8' }
    ).trim()

    if (!result) return

    const violations = result.split('\n').filter(line => {
      const match = line.match(/from '([^']+)'/)
      if (!match) return false
      const importPath = match[1]
      if (!importPath.startsWith('.')) return false
      const segments = importPath.split('/')
      const srcIdx = segments.indexOf('src')
      if (srcIdx < 0) return false
      const upCount = segments.filter(s => s === '..').length
      return upCount >= 3 && importPath.includes('/src/')
    })

    if (violations.length > 0) {
      const lines = violations.map(l => '  ' + l.replace(PACKAGES_DIR + '/', ''))
      fail(
        `Cross-package deep imports (use the package's index.js instead):\n` +
        lines.join('\n')
      )
    }
  })
})
