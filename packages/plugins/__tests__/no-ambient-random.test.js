import { execSync } from 'child_process'
import path from 'path'

const PLUGINS_DIR = path.resolve(process.cwd(), 'packages/plugins')

describe('engine#74: no Math.random() in plugins', () => {
  it('no plugin source file uses Math.random()', () => {
    const result = execSync(
      `grep -rn "Math\\.random" "${PLUGINS_DIR}" --include="*.js" --exclude-dir=__tests__ --exclude-dir=node_modules --exclude-dir=mce || true`,
      { encoding: 'utf8' }
    ).trim()

    if (result) {
      const lines = result.split('\n').map(l => l.replace(PLUGINS_DIR + '/', ''))
      fail(
        `Math.random() found in plugin source (use core/rng with a seed instead):\n` +
        lines.map(l => `  ${l}`).join('\n')
      )
    }
  })
})
