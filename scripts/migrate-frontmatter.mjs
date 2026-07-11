#!/usr/bin/env node
/**
 * Migrates rendering data from GAMES object into moddable-rules frontmatter.
 *
 * For each variant in GAMES:
 * 1. Runs reverseAdapt to get the schema-format engine data
 * 2. Strips internal fields (_prefixed)
 * 3. Replaces the engine: block in the variant's .md file
 *
 * This is THE migration script. Run it, then run extract-games-rendering.mjs
 * to verify parity. When parity is 100%, GAMES can be deleted.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENGINE_ROOT = resolve(__dirname, '..')
const RULES_ROOT = process.env.RULES_ROOT || resolve(ENGINE_ROOT, '../moddable-rules')
const GAMES_DIR = resolve(RULES_ROOT, 'games')

// DOM stubs
const stubEl = () => ({ style: {}, innerHTML: '', value: '', appendChild: () => {}, addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null, classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false }, setAttribute: () => {}, getAttribute: () => null, dataset: {}, options: [], getBoundingClientRect: () => ({}) })
globalThis.document = { getElementById: () => stubEl(), createElement: () => stubEl(), createElementNS: () => stubEl(), querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} }
globalThis.window = { location: { search: '' }, addEventListener: () => {} }
globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
globalThis.requestAnimationFrame = () => {}
globalThis.URLSearchParams = class { get() { return null } }
globalThis.IntersectionObserver = class { observe() {} disconnect() {} }

const { GAMES } = await import('../js/boards.js')
const { reverseAdapt } = await import('../js/reverse-adapter.js')

function serializeYaml(obj, indent) {
  const pad = ' '.repeat(indent)
  const lines = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    if (k.startsWith('_')) continue
    if (typeof v === 'object' && !Array.isArray(v)) {
      const clean = Object.entries(v).filter(([ek]) => !ek.startsWith('_'))
      if (clean.length === 0) continue
      lines.push(`${pad}${k}:`)
      lines.push(serializeYaml(Object.fromEntries(clean), indent + 2))
    } else if (Array.isArray(v)) {
      if (v.length === 0) continue
      if (typeof v[0] === 'object') {
        lines.push(`${pad}${k}:`)
        for (const item of v) {
          const itemLines = serializeYaml(item, 0).split('\n').filter(l => l.trim())
          lines.push(`${pad}  - ${itemLines[0].trim()}`)
          for (const rest of itemLines.slice(1)) lines.push(`${pad}    ${rest.trim()}`)
        }
      } else {
        const items = v.map(x => typeof x === 'string' && x.includes(' ') ? `"${x}"` : String(x))
        lines.push(`${pad}${k}: [${items.join(', ')}]`)
      }
    } else if (typeof v === 'string') {
      if (v.includes('/') || v.includes(':') || v.includes(',') || v.includes('#') || v.includes('{') || v.includes('"')) {
        lines.push(`${pad}${k}: "${v.replace(/"/g, '\\"')}"`)
      } else {
        lines.push(`${pad}${k}: ${v}`)
      }
    } else if (typeof v === 'boolean') {
      lines.push(`${pad}${k}: ${v}`)
    } else {
      lines.push(`${pad}${k}: ${v}`)
    }
  }
  return lines.join('\n')
}

function buildEngineBlock(schema) {
  const fam = schema.family?.engine || {}
  const vari = schema.variant?.engine || {}
  const engine = {}

  // Topology (merge family + variant)
  const topo = { ...(fam.topology || {}), ...(vari.topology || {}) }
  delete topo._cellMap; delete topo._hexGrid
  if (topo.type) engine.topology = topo

  // Surface — named string only
  if (schema.surface && typeof schema.surface === 'string') {
    engine.surface = schema.surface
  }

  // Render (merge, strip internals)
  const render = { ...(fam.render || {}), ...(vari.render || {}) }
  for (const k of Object.keys(render)) { if (k.startsWith('_')) delete render[k] }
  if (Object.keys(render).length > 0) engine.render = render

  // Pieces (merge, strip internals)
  const pieces = { ...(fam.pieces || {}), ...(vari.pieces || {}) }
  for (const k of Object.keys(pieces)) { if (k.startsWith('_')) delete pieces[k] }
  if (pieces.set || pieces.vocabulary) engine.pieces = pieces

  // Players
  if (vari.players) engine.players = vari.players
  else if (fam.players) engine.players = fam.players

  // Setup
  if (vari.setup !== undefined) engine.setup = vari.setup
  else if (fam.setup !== undefined) engine.setup = fam.setup

  // Content
  if (vari.content) {
    const c = { ...vari.content }
    for (const k of Object.keys(c)) { if (k.startsWith('_')) delete c[k] }
    if (Object.keys(c).length > 0) engine.content = c
  }

  return engine
}

function replaceEngineBlock(content, engineYaml) {
  // Find the frontmatter boundaries
  const secondDash = content.indexOf('\n---', 4)
  if (secondDash === -1) return null

  const frontmatter = content.slice(4, secondDash)
  const body = content.slice(secondDash + 4)

  // Remove existing engine: block (everything from "engine:" to next top-level key or end)
  let cleaned = frontmatter
  const engineStart = cleaned.indexOf('\nengine:')
  if (engineStart !== -1) {
    // Find where the engine block ends (next line starting with a non-space, non-empty char)
    const afterEngine = cleaned.slice(engineStart + 1)
    const lines = afterEngine.split('\n')
    let endIdx = 1 // skip the "engine:" line itself
    while (endIdx < lines.length) {
      const line = lines[endIdx]
      if (line === '' || line.match(/^\s/)) {
        endIdx++
      } else {
        break
      }
    }
    const engineEnd = engineStart + 1 + lines.slice(0, endIdx).join('\n').length
    cleaned = cleaned.slice(0, engineStart) + cleaned.slice(engineEnd)
  }

  // Also handle case where engine: is at the very start
  if (cleaned.startsWith('engine:')) {
    const lines = cleaned.split('\n')
    let endIdx = 1
    while (endIdx < lines.length) {
      const line = lines[endIdx]
      if (line === '' || line.match(/^\s/)) {
        endIdx++
      } else {
        break
      }
    }
    cleaned = lines.slice(endIdx).join('\n')
  }

  // Append the new engine block
  cleaned = cleaned.trimEnd() + '\n' + engineYaml

  return '---\n' + cleaned + '\n---' + body
}

// Main
let updated = 0, skipped = 0, errors = 0

for (const [gameId, game] of Object.entries(GAMES)) {
  if (game.noRenderer || game.hexGame || game.rpgGame) continue

  for (const [varId, varDef] of Object.entries(game.variants || {})) {
    if (varDef.noRenderer || varDef.static) continue
    const varFile = resolve(GAMES_DIR, gameId, 'content', 'variants', varId + '.md')
    if (!existsSync(varFile)) { skipped++; continue }

    let schema
    try { schema = reverseAdapt(varDef, game, gameId, {}) }
    catch (e) { errors++; continue }

    const engine = buildEngineBlock(schema)
    if (Object.keys(engine).length === 0) { skipped++; continue }

    const engineYaml = 'engine:\n' + serializeYaml(engine, 2)
    const content = readFileSync(varFile, 'utf8')
    const newContent = replaceEngineBlock(content, engineYaml)

    if (!newContent) { skipped++; continue }
    writeFileSync(varFile, newContent)
    updated++
  }
}

console.log(`Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`)
