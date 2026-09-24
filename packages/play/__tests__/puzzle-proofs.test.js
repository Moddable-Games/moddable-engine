import { readFileSync } from 'fs'
import { join } from 'path'
import { verifyRecord } from '../../../scripts/generate-puzzles.mjs'

// Every engine-generated puzzle is a claim about a variant's rules, and this
// proves each one again against the engine as it is (engine#178). The pool's
// own test checks only that a first move is legal; 218 records passed that
// while being wrong, because the generator had built variants without their
// rule modules and proved Antichess, Three-check and Giveaway puzzles under
// standard chess. A rule change that stops a puzzle being true fails here.

const data = JSON.parse(readFileSync(join(process.cwd(), 'api', 'puzzles', 'index.json'), 'utf8'))
const generated = data.variants.filter(r => r.source === 'engine-generated')

test('there are generated puzzles to prove', () => {
  expect(generated.length).toBeGreaterThan(500)
})

test('every generated puzzle is still true', () => {
  const failing = []
  for (const record of generated) {
    const verdict = verifyRecord(record)
    if (!verdict.ok) failing.push(`${record.id}: ${verdict.reason}`)
  }
  expect(failing).toEqual([])
}, 600000)
