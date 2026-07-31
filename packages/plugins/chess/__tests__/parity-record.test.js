import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RECORD_PATH = path.resolve(__dirname, '../../../../data/parity-record.json')

describe('parity record schema enforcement', () => {
  const record = JSON.parse(fs.readFileSync(RECORD_PATH, 'utf8'))

  it('every entry has required fields', () => {
    for (const entry of record) {
      expect(entry.variant).toBeTruthy()
      expect(entry.position).toBeTruthy()
      expect(entry.sideToMove).toBeTruthy()
      expect(['unresolved', 'resolved']).toContain(entry.status)
    }
  })

  it('resolved entries must have authority and verdict', () => {
    const resolved = record.filter(e => e.status === 'resolved')
    for (const entry of resolved) {
      expect(entry.authority).toBeTruthy()
      expect(entry.verdict).toBeTruthy()
      expect(['a-wrong', 'b-wrong', 'both-wrong', 'rulebook-ambiguous']).toContain(entry.verdict)
    }
  })

  it('no resolved entry lacks a citation', () => {
    const invalid = record.filter(e => e.status === 'resolved' && (!e.authority || !e.verdict))
    expect(invalid).toEqual([])
  })
})
