import { readFileSync } from 'fs'
import { join } from 'path'
import { measure } from '../../../scripts/rate-puzzles.mjs'

// engine#178 C1: every puzzle records which levels of the engine's own AI
// solve it (scripts/rate-puzzles.mjs). Searches run on a node budget with a
// seed taken from the record's id, so a level either still finds the answer or
// the AI has changed. An AI change that stops a level solving what it solved is
// a regression this suite could not see before.

const data = JSON.parse(readFileSync(join(process.cwd(), 'api', 'puzzles', 'index.json'), 'utf8'))
const rated = [...data.standard, ...data.variants].filter(r => r.ai?.minimax?.solves?.length)

test('the pool is rated', () => {
  expect(rated.length).toBeGreaterThan(1000)
  expect(Object.keys(data.meta.aiRated.byDifficulty).length).toBeGreaterThan(2)
})

test('each puzzle is still solved by the weakest level recorded as solving it', () => {
  const lost = []
  for (const record of rated) {
    const level = record.ai.minimax.solves[0]
    const now = measure(record, 'minimax', [level])
    if (!now.solves.includes(level)) lost.push(`${record.id}: ${level}`)
  }
  expect(lost).toEqual([])
}, 1800000)
