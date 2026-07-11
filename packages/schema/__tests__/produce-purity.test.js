import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const producePath = resolve(__dirname, '../src/produce.js')

describe('produce purity', () => {
  const source = readFileSync(producePath, 'utf8')

  test('no game names in produce', () => {
    const gameNames = /\b(chess|go|shogi|xiangqi|surakarta|pachisi|tafl|mancala|backgammon|fanorona|alquerque|draughts|reversi|halma|morris|landlords|nyout)\b/i
    const match = source.match(gameNames)
    if (match) fail(`produce.js contains game name: "${match[0]}"`)
  })

  test('no topology-specific rendering logic hardcoded in produce', () => {
    const topoSpecific = /\b(createGridTopology|createHexTopology|createTrackTopology|createPitTopology|createGraphTopology|renderLayout)\b/
    const match = source.match(topoSpecific)
    if (match) fail(`produce.js imports topology internals: "${match[0]}" — layout building belongs in the topology packages, not produce`)
  })

  test('no hardcoded coordinate arrays in produce', () => {
    const coordArrays = /\[\s*\[\s*\d+\s*,\s*\d+\s*\]/
    const match = source.match(coordArrays)
    if (match) fail(`produce.js contains hardcoded coordinates: "${match[0]}"`)
  })

  test('no hardcoded game text in produce', () => {
    const gameText = /楚|河|漢|界|rosette|throne|castle|palace|river|promotion/i
    const match = source.match(gameText)
    if (match) fail(`produce.js contains game-specific text: "${match[0]}"`)
  })
})
