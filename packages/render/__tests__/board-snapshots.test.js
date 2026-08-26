// 283 committed SVGs, referenced by no test. Nothing failed when the renderer
// changed and they did not, so 137 of the 140 that still had a counterpart had
// gone stale, and 143 more were left over from before the chess hub was
// renamed and corresponded to nothing at all (engine#142).
//
// `snapshot-boards.mjs --diff` already knew how to compare and already exited
// non-zero on a difference. It was simply never run.
import { execSync } from 'child_process'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const ROOT = process.cwd()
const SNAP_DIR = join(ROOT, 'snapshots')

// A comparison that finds no snapshots passes. So does one that compares three
// of three hundred. Both floors are assertions, not decoration.
const SNAPSHOT_FLOOR = 320
const NULL_RENDER_CEILING = 2

let report = ''
beforeAll(() => {
  report = execSync('node scripts/snapshot-boards.mjs --diff', {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, NODE_OPTIONS: '--experimental-vm-modules' },
  }).toString()
}, 600_000)

function counts() {
  const m = report.match(/Results: (\d+) identical, (\d+) different, (\d+) no snapshot, (\d+) errors/)
  if (!m) throw new Error(`could not read the diff summary from:\n${report.slice(-500)}`)
  return { identical: +m[1], different: +m[2], missing: +m[3], errors: +m[4] }
}

describe('committed board snapshots match what the renderer produces', () => {
  it('compares enough snapshots to mean something', () => {
    expect(readdirSync(SNAP_DIR).filter(f => f.endsWith('.svg')).length)
      .toBeGreaterThanOrEqual(SNAPSHOT_FLOOR)
    expect(counts().identical).toBeGreaterThanOrEqual(SNAPSHOT_FLOOR)
  })

  it('no snapshot differs from the current render', () => {
    const { different } = counts()
    // The script names each one it finds, so a failure says which.
    expect([different, report.match(/ {2}✗ .*DIFFERS/g) || []]).toEqual([0, []])
  })

  it('every renderable variant has a snapshot, and none errors', () => {
    const { missing, errors } = counts()
    expect({ missing, errors }).toEqual({ missing: 0, errors: 0 })
  })

  // The gap #144 fell into: the render tests skip anything returning null and
  // the playability tests skip anything not marked playable, so a variant that
  // is both is checked by nothing. Counting them is what closes it. Both of
  // these are the hexagonal-trisection boards waiting on engine#26; the
  // ceiling only shrinks.
  it('no more variants render null than the two waiting on a renderer', () => {
    const named = report.match(/^ {2}- (.+)$/gm)?.map(l => l.replace('  - ', '')) || []
    expect(named.sort()).toEqual(['chess/yalta-chess', 'xiangqi/san-kwo-ki'])
    expect(named.length).toBeLessThanOrEqual(NULL_RENDER_CEILING)
  })
})

// Byte-comparison catches any change, including the intended ones, and says
// nothing about whether the output is correct. These say something about
// correctness, and survive a deliberate re-capture.
describe('every snapshot is structurally sound', () => {
  const files = readdirSync(SNAP_DIR).filter(f => f.endsWith('.svg'))

  it('found the snapshots', () => {
    expect(files.length).toBeGreaterThanOrEqual(SNAPSHOT_FLOOR)
  })

  // `String(undefined)` is `"undefined"`, so a missing attribute value used to
  // serialise into the SVG as a literal rather than failing. An inline surface
  // declaring only its terrain colours inherited no palette, and a third of
  // the cells on two boards came out `fill="undefined"`.
  it.each(files)('%s has no undefined, NaN or null attribute values', (file) => {
    const svg = readFileSync(join(SNAP_DIR, file), 'utf8')
    const bad = svg.match(/[a-zA-Z-]+="(?:undefined|NaN|null)"/g) || []
    expect(bad).toEqual([])
  })

  // Not "every cell has a fill": on an intersection board the cell is an
  // invisible hit target and the lines are the board, so Go's unfilled circles
  // are correct. Not "every board draws a cell" either: a card or tile game
  // renders a table, hands and a deck, and has no cells at all. What is never
  // correct is a page with nothing drawn on it, which is what a silently
  // failed render looks like.
  it.each(files)('%s draws something', (file) => {
    const svg = readFileSync(join(SNAP_DIR, file), 'utf8')
    const drawn = svg.match(/<(rect|polygon|circle|path|line|image|text|use)\b/g) || []
    expect(drawn.length).toBeGreaterThan(3)
  })

  it.each(files)('%s declares a viewBox with no zero or negative extent', (file) => {
    const svg = readFileSync(join(SNAP_DIR, file), 'utf8')
    const m = svg.match(/viewBox="([^"]+)"/)
    expect(m).not.toBeNull()
    const [, , w, h] = m[1].trim().split(/\s+/).map(Number)
    expect([Number.isFinite(w) && w > 0, Number.isFinite(h) && h > 0]).toEqual([true, true])
  })
})
