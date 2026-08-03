import { readFileSync, readdirSync } from 'fs'
import path from 'path'

const JS_DIR = path.resolve(process.cwd(), 'js')
const THEME_FILES = new Set(['play-shared.js', 'play-overlays.js'])
const SURFACE_FILES = readdirSync(JS_DIR)
  .filter(f => f.endsWith('.js') && !f.startsWith('__') && !THEME_FILES.has(f))
  .filter(f => f.startsWith('game-play') || f.startsWith('play-'))

describe('engine#78: no hardcoded presentation values in surface code', () => {
  for (const file of SURFACE_FILES) {
    const filePath = path.join(JS_DIR, file)
    const content = readFileSync(filePath, 'utf8')
    const lines = content.split('\n')

    it(`${file}: no hex colour literals outside theme imports`, () => {
      const violations = []
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.trimStart().startsWith('//')) continue
        if (line.includes('import')) continue
        const hexMatches = line.match(/#[0-9a-fA-F]{3,8}\b/g)
        if (hexMatches) {
          violations.push({ line: i + 1, text: line.trim(), matches: hexMatches })
        }
      }
      if (violations.length > 0) {
        const details = violations.map(v => `  L${v.line}: ${v.matches.join(', ')} — ${v.text.slice(0, 80)}`).join('\n')
        fail(`Hex colour literals found (move to theme/registry):\n${details}`)
      }
    })

    it(`${file}: no bare ms duration literals outside theme references`, () => {
      const violations = []
      const durationPattern = /\b\d{2,4}\b/g
      const allowedContexts = ['ANIM_THEME', 'CAPTURE_BURST_THEME', 'setTimeout', 'setInterval', 'length', 'index', 'idx', 'pos', '.from', '.to']
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.trimStart().startsWith('//')) continue
        if (line.includes('ANIM_THEME') || line.includes('CAPTURE_BURST_THEME')) continue
        if (line.includes('duration') && (line.includes('bt.') || line.includes('ANIM'))) continue
        const match = line.match(/duration\s*[:=]\s*(\d{2,4})\b/)
        if (match && !allowedContexts.some(ctx => line.includes(ctx))) {
          violations.push({ line: i + 1, text: line.trim() })
        }
      }
      if (violations.length > 0) {
        const details = violations.map(v => `  L${v.line}: ${v.text.slice(0, 80)}`).join('\n')
        fail(`Bare duration literals found (use ANIM_THEME/CAPTURE_BURST_THEME):\n${details}`)
      }
    })
  }
})
