#!/usr/bin/env node
/**
 * Renders each GAMES variant via reverseAdapt path (studio truth) and
 * from frontmatter path, then diffs the SVG output.
 * Reports every difference.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENGINE_ROOT = resolve(__dirname, '..')
const RULES_ROOT = process.env.RULES_ROOT || resolve(ENGINE_ROOT, '../moddable-rules')
const GAMES_DIR = resolve(RULES_ROOT, 'games')

const stubEl = () => ({ style: {}, innerHTML: '', value: '', appendChild: () => {}, addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => null, classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false }, setAttribute: () => {}, getAttribute: () => null, dataset: {}, options: [], getBoundingClientRect: () => ({}) })
globalThis.document = { getElementById: () => stubEl(), createElement: () => stubEl(), createElementNS: () => stubEl(), querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} }
globalThis.window = { location: { search: '' }, addEventListener: () => {} }
globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
globalThis.requestAnimationFrame = () => {}
globalThis.URLSearchParams = class { get() { return null } }
globalThis.IntersectionObserver = class { observe() {} disconnect() {} }

const { GAMES } = await import('../js/boards.js')
const { reverseAdapt } = await import('../js/reverse-adapter.js')
const { resolveSurface } = await import('../js/surface-resolver.js')
const { resolve: cascadeResolve } = await import('../js/cascade-resolver.js')
const { buildRenderOpts, attachPieceImages } = await import('../js/render-adapter.js')
const { renderBoard } = await import('../js/board-diagrams.js')
const { parseFrontmatter } = await import('../packages/schema/src/parse-frontmatter.js')

const gallery = JSON.parse(readFileSync(resolve(ENGINE_ROOT, 'pieces/gallery-index.json'), 'utf8'))

const args = process.argv.slice(2)
const familyFilter = args.find(a => !a.startsWith('--'))

let match = 0, differ = 0, fmOnly = 0, gamesOnly = 0
const diffs = []

for (const [gameId, game] of Object.entries(GAMES)) {
  if (familyFilter && !gameId.includes(familyFilter)) continue
  if (game.noRenderer || game.hexGame || game.rpgGame) continue

  for (const [varId, varDef] of Object.entries(game.variants || {})) {
    if (varDef.noRenderer || varDef.static) continue

    // --- GAMES path: render via reverseAdapt ---
    let gamesSvg = null
    try {
      const schema = reverseAdapt(varDef, game, gameId, {})
      const surface = resolveSurface(schema.surface)
      const { resolved } = cascadeResolve({ surface, family: schema.family, variant: schema.variant })
      if (resolved.content?.source) {
        const dp = resolve(ENGINE_ROOT, 'data', resolved.content.source)
        if (existsSync(dp)) resolved.content.data = JSON.parse(readFileSync(dp, 'utf8'))
      }
      const opts = buildRenderOpts(resolved)
      if (opts) {
        attachPieceImages(opts, resolved, gallery)
        gamesSvg = renderBoard(opts)
      }
    } catch(e) {}

    // --- Frontmatter path ---
    const fmFamily = gameId === 'moddable-chess' ? 'moddable-chess' : gameId
    const fmDir = resolve(GAMES_DIR, fmFamily, 'content')
    const varSlug = varId
    const varFile = resolve(fmDir, 'variants', varSlug + '.md')
    
    let fmSvg = null
    if (existsSync(varFile)) {
      try {
        const rbPath = resolve(fmDir, 'rulebook.md')
        let familyEngine = null
        if (existsSync(rbPath)) {
          const { meta } = parseFrontmatter(readFileSync(rbPath, 'utf8'))
          if (meta.engine) familyEngine = meta.engine
        }
        const { meta } = parseFrontmatter(readFileSync(varFile, 'utf8'))
        const variantEngine = meta.engine
        if (familyEngine || variantEngine) {
          const surfaceRef = variantEngine?.surface || familyEngine?.surface || null
          const surface = surfaceRef ? resolveSurface(surfaceRef) : {}
          const { resolved } = cascadeResolve({ surface, family: { engine: familyEngine || {}, meta: {} }, variant: { engine: variantEngine || {}, meta: {} } })
          if (resolved.content?.source) {
            const dp = resolve(ENGINE_ROOT, 'data', resolved.content.source)
            if (existsSync(dp)) resolved.content.data = JSON.parse(readFileSync(dp, 'utf8'))
          }
          const opts = buildRenderOpts(resolved)
          if (opts) {
            attachPieceImages(opts, resolved, gallery)
            fmSvg = renderBoard(opts)
          }
        }
      } catch(e) {}
    }

    if (gamesSvg && fmSvg) {
      if (gamesSvg === fmSvg) {
        match++
      } else {
        differ++
        // Diagnose what's different
        const gLen = gamesSvg.length, fLen = fmSvg.length
        const gPieces = (gamesSvg.match(/<image|<use href|<circle.*r="/g) || []).length
        const fPieces = (fmSvg.match(/<image|<use href|<circle.*r="/g) || []).length
        const gDims = gamesSvg.match(/viewBox="([^"]+)"/)
        const fDims = fmSvg.match(/viewBox="([^"]+)"/)
        const dimsDiff = gDims?.[1] !== fDims?.[1]
        const gColors = [...new Set(gamesSvg.match(/fill="(#[^"]+)"/g) || [])]
        const fColors = [...new Set(fmSvg.match(/fill="(#[^"]+)"/g) || [])]
        const colorDiff = gColors.sort().join(',') !== fColors.sort().join(',')
        
        const reasons = []
        if (dimsDiff) reasons.push(`dims: GAMES=${gDims?.[1]} FM=${fDims?.[1]}`)
        if (colorDiff) reasons.push('colors differ')
        if (gPieces !== fPieces) reasons.push(`pieces: GAMES=${gPieces} FM=${fPieces}`)
        if (reasons.length === 0) reasons.push(`size: GAMES=${gLen} FM=${fLen}`)
        
        diffs.push({ gameId, varId, reasons })
      }
    } else if (gamesSvg && !fmSvg) {
      gamesOnly++
      diffs.push({ gameId, varId, reasons: ['frontmatter produces nothing'] })
    } else if (!gamesSvg && fmSvg) {
      fmOnly++
    }
  }
}

console.log('=== SVG PARITY: GAMES vs FRONTMATTER ===')
console.log(`Identical: ${match}`)
console.log(`Different: ${differ}`)
console.log(`GAMES-only (FM can't render): ${gamesOnly}`)
console.log(`FM-only (GAMES can't render): ${fmOnly}`)
console.log()

// Group diffs by reason
const byReason = {}
for (const d of diffs) {
  const key = d.reasons.join('; ')
  if (!byReason[key]) byReason[key] = []
  byReason[key].push(`${d.gameId}/${d.varId}`)
}

for (const [reason, variants] of Object.entries(byReason).sort((a,b) => b[1].length - a[1].length)) {
  console.log(`${reason} (${variants.length}):`)
  for (const v of variants.slice(0, 8)) console.log(`  ${v}`)
  if (variants.length > 8) console.log(`  ... +${variants.length - 8} more`)
  console.log()
}
