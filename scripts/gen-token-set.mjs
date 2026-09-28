#!/usr/bin/env node
/**
 * Draws our own player tokens: one pawn per seat, six seats (engine#200).
 *
 * The Landlord's Game drew its players as coloured circles from a palette kept
 * in the board layout, the one family whose pieces were not from the gallery.
 * Every piece a game shows comes from a set in the gallery, so the tokens are a
 * set of their own, drawn here and regenerated rather than edited.
 *
 * Keys are the seat: `p0` to `p5`, the form a track game writes its tokens in
 * (`pos-22:p0`). The six colours are the ones the board already used.
 *
 * Usage: node scripts/gen-token-set.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SET_ID = 'mce-player-tokens'
const OUT = path.join(ROOT, 'pieces', 'sets', SET_ID)

const SEATS = [
  { fill: '#c0392b', shade: '#7b241c' },
  { fill: '#2471a3', shade: '#154360' },
  { fill: '#1e8449', shade: '#0e4a28' },
  { fill: '#b7950b', shade: '#6e5a07' },
  { fill: '#6c3483', shade: '#3b1c48' },
  { fill: '#117864', shade: '#0a4538' },
]

// A board-game pawn: a round head over a flared base, lit from the upper left.
function pawn({ fill, shade }) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">' +
    '<defs><radialGradient id="g" cx="0.35" cy="0.3" r="0.8">' +
    `<stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.45" stop-color="${fill}"/><stop offset="1" stop-color="${shade}"/>` +
    '</radialGradient></defs>' +
    `<path d="M26 90 Q26 76 40 70 Q44 62 44 56 L56 56 Q56 62 60 70 Q74 76 74 90 Z" fill="url(#g)" stroke="${shade}" stroke-width="3" stroke-linejoin="round"/>` +
    `<circle cx="50" cy="36" r="20" fill="url(#g)" stroke="${shade}" stroke-width="3"/>` +
    `<ellipse cx="50" cy="90" rx="24" ry="4" fill="${shade}"/>` +
    '</svg>\n'
}

fs.mkdirSync(OUT, { recursive: true })
const pieces = {}
SEATS.forEach((colours, seat) => {
  fs.writeFileSync(path.join(OUT, `p${seat}.svg`), pawn(colours))
  pieces[`p${seat}`] = `p${seat}.svg`
})

// The gallery entry, kept in step with what was drawn.
const INDEX = path.join(ROOT, 'pieces', 'gallery-index.json')
const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'))
const entry = {
  id: SET_ID,
  name: 'MCE Player Tokens',
  family: 'landlords-game',
  author: 'Mark Smalley',
  license: 'MIT',
  licenseUrl: 'https://opensource.org/licenses/MIT',
  source: 'https://github.com/Moddable-Games/moddable-engine',
  format: 'svg',
  pieces,
}
const at = index.findIndex(s => s.id === SET_ID)
if (at >= 0) index[at] = entry
else index.push(entry)
fs.writeFileSync(INDEX, JSON.stringify(index, null, 2) + '\n')
console.log(`${Object.keys(pieces).length} tokens in pieces/sets/${SET_ID}`)
