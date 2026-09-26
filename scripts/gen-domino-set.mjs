#!/usr/bin/env node
/**
 * Draws our own domino set, blank to twelve (engine#184).
 *
 * The two sets from Wikimedia stop at six pips. Mexican Train is played with a
 * double-twelve set and Chickenfoot with a double-nine, so the tiles above six
 * had nothing to draw them with. This set is ours, drawn from one layout per
 * number so every tile of it matches, and is regenerated rather than edited.
 *
 * Numbers up to nine sit on a 3x3 grid, as dice and the classic sets place
 * them; ten to twelve on a 3x4 grid. Pips are coloured by number, as
 * double-twelve sets usually are, so a 7 and an 8 can be told apart at a
 * glance.
 *
 * Usage: node scripts/gen-domino-set.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SET_ID = 'mce-dominoes-double12'
const OUT = path.join(ROOT, 'pieces', 'sets', SET_ID)
const MAX = 12

const W = 100, H = 196, HALF = H / 2

// Pip positions as [column, row] on the grid named by `rows`.
const GRID3 = {
  0: [], 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]],
  7: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2], [1, 1]],
  8: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
  9: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
}
const column = (c, rows) => rows.map(r => [c, r])
const GRID4 = {
  10: [...column(0, [0, 1, 2, 3]), ...column(2, [0, 1, 2, 3]), [1, 1], [1, 2]],
  11: [...column(0, [0, 1, 2, 3]), ...column(2, [0, 1, 2, 3]), [1, 0.5], [1, 1.5], [1, 2.5]],
  12: [...column(0, [0, 1, 2, 3]), ...column(1, [0, 1, 2, 3]), ...column(2, [0, 1, 2, 3])],
}

const COLOURS = [
  '#1d1d1d', '#1d1d1d', '#2e7d32', '#c62828', '#6d4c41', '#1565c0', '#f9a825',
  '#8e24aa', '#00897b', '#3949ab', '#ef6c00', '#5d4037', '#546e7a',
]

function half(n, top) {
  const y0 = top ? 0 : HALF
  const pad = 17
  const four = n >= 10
  const layout = four ? GRID4[n] : GRID3[n]
  const rows = four ? 4 : 3
  const stepX = (W - 2 * pad) / 2
  const stepY = (HALF - 2 * pad) / (rows - 1)
  const r = four ? 7.2 : 8.5
  return layout.map(([c, row]) => {
    const cx = pad + c * stepX
    const cy = y0 + pad + row * stepY
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${COLOURS[n]}"/>`
  }).join('')
}

function tile(low, high) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="10" fill="#fbf8f1" stroke="#2b2b2b" stroke-width="3"/>` +
    `<line x1="12" y1="${HALF}" x2="${W - 12}" y2="${HALF}" stroke="#2b2b2b" stroke-width="3"/>` +
    `<circle cx="${W / 2}" cy="${HALF}" r="3.5" fill="#9e9e9e"/>` +
    half(low, true) + half(high, false) +
    '</svg>\n'
}

function back() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="10" fill="#26323a" stroke="#101820" stroke-width="3"/>` +
    `<rect x="12" y="12" width="${W - 24}" height="${H - 24}" rx="6" fill="none" stroke="#51656f" stroke-width="2"/>` +
    '</svg>\n'
}

const art = (a, b) => `domino-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`

fs.mkdirSync(OUT, { recursive: true })
const pieces = {}
for (let a = 0; a <= MAX; a++) {
  for (let b = a; b <= MAX; b++) {
    const key = art(a, b)
    fs.writeFileSync(path.join(OUT, `${key}.svg`), tile(a, b))
    pieces[key] = `${key}.svg`
  }
}
fs.writeFileSync(path.join(OUT, 'domino-back.svg'), back())
pieces['domino-back'] = 'domino-back.svg'

// The gallery entry, kept in step with what was drawn.
const INDEX = path.join(ROOT, 'pieces', 'gallery-index.json')
const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'))
const entry = {
  id: SET_ID,
  name: 'MCE Dominoes (Double-12)',
  family: 'dominoes',
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
console.log(`${Object.keys(pieces).length} files in pieces/sets/${SET_ID}`)
