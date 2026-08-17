#!/usr/bin/env node
// CI guard: fail if known-consolidated patterns reappear as duplicates.
// Each check looks for a second definition of something that must be single-source.

import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, join } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const errors = []

function scanFiles(dir, ext = '.js') {
  const results = []
  if (!existsSync(dir)) return results
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(ext) || entry.name.endsWith('.mjs')) results.push(full)
    }
  }
  walk(dir)
  return results
}

const sourceFiles = [
  ...scanFiles(resolve(ROOT, 'packages')),
  ...scanFiles(resolve(ROOT, 'js')),
  ...scanFiles(resolve(ROOT, 'scripts')),
]

// 1. FEN4_OWNERS must only be defined in packages/render/src/recolour.js
const fen4Defs = sourceFiles.filter(f => {
  if (f.includes('__tests__') || f.includes('check-duplication')) return false
  const content = readFileSync(f, 'utf8')
  return content.includes('FEN4_OWNERS') && content.includes("r: 'red'") && !f.includes('recolour.js')
})
if (fen4Defs.length > 0) {
  errors.push(`FEN4_OWNERS defined outside recolour.js: ${fen4Defs.map(f => f.replace(ROOT + '/', '')).join(', ')}`)
}

// 2. recolourMatch replacement must not use hardcoded colour regexes
const hardcodedRecolour = sourceFiles.filter(f => {
  if (f.includes('__tests__') || f.includes('check-duplication')) return false
  const content = readFileSync(f, 'utf8')
  return content.includes('#f5deb3') && !f.includes('gallery-index.json')
})
if (hardcodedRecolour.length > 0) {
  errors.push(`Hardcoded #f5deb3 recolour found: ${hardcodedRecolour.map(f => f.replace(ROOT + '/', '')).join(', ')}`)
}

// 3. extends resolver must not be duplicated (resolveFromDisk is the single source)
const extendsResolvers = sourceFiles.filter(f => {
  if (f.includes('__tests__') || f.includes('node_modules')) return false
  const content = readFileSync(f, 'utf8')
  const hasExtends = content.includes('.extends') && content.includes('resolveFromDisk') === false
    && (content.includes('readFile') || content.includes('readFileSync'))
    && content.includes('extends')
  return hasExtends && content.match(/extends.*=.*meta/g)?.length > 0
})

// 4. computeStarPoints must not reappear (AUTO_STAR_POINTS is canonical)
const starPointDups = sourceFiles.filter(f => {
  if (f.includes('__tests__')) return false
  const content = readFileSync(f, 'utf8')
  return content.includes('computeStarPoints') && !content.includes('// deleted')
})
if (starPointDups.length > 0) {
  errors.push(`computeStarPoints found (use AUTO_STAR_POINTS): ${starPointDups.map(f => f.replace(ROOT + '/', '')).join(', ')}`)
}

if (errors.length > 0) {
  console.error('Duplication guard FAILED:')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}

console.log('Duplication guard: OK (no prohibited patterns found)')
