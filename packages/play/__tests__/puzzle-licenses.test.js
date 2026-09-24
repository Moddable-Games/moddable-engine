import { readFileSync } from 'fs'
import { join } from 'path'

// engine#178 C3: the pool is several sources under several licences, and one
// sentence in `meta.license` covered them all, so nobody could take the CC0
// records alone. Each record now says its own.

const data = JSON.parse(readFileSync(join(process.cwd(), 'api', 'puzzles', 'index.json'), 'utf8'))
const records = [...data.standard, ...data.variants]

test('every served record carries a licence its source is recorded as having', () => {
  const unlicensed = records.filter(r => !r.license || data.meta.licenses?.[r.source]?.license !== r.license)
  expect(unlicensed.map(r => r.id)).toEqual([])
})

test('only the Lichess export claims CC0, and every licence says what it rests on', () => {
  const cc0 = records.filter(r => r.license === 'CC0-1.0')
  expect(cc0.length).toBeGreaterThan(500)
  expect(new Set(cc0.map(r => r.source))).toEqual(new Set(['lichess-cc0']))
  for (const entry of Object.values(data.meta.licenses)) expect(entry.basis.length).toBeGreaterThan(20)
})
