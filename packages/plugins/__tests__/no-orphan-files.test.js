import fs from 'fs'
import path from 'path'

describe('no known orphan files', () => {
  it('component-deck/src/xorshift.js does not exist (byte-identical copy of core)', () => {
    const orphan = path.resolve(process.cwd(), 'packages/component-deck/src/xorshift.js')
    expect(fs.existsSync(orphan)).toBe(false)
  })
})
