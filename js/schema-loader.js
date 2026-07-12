/**
 * Schema Loader — steps 1-3 of the render pipeline.
 *
 * Builds family/variant index from filesystem (or pre-built index).
 * Parses YAML frontmatter from markdown files.
 * Resolves surface reference into full surface object.
 *
 * In browser context, fetches from a known base URL.
 * Can also accept pre-parsed data (for testing or pre-built indexes).
 */

import { resolveSurface } from './surface-resolver.js'
import { resolve as cascadeResolve } from './cascade-resolver.js'
import { loadContent } from './content-loader.js'

// --- Minimal YAML frontmatter parser (browser-compatible) ---

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  return parseYaml(match[1])
}

function parseYaml(text) {
  const result = {}
  const lines = text.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const match = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (!match) { i++; continue }

    const key = match[1]
    const value = match[2].trim()

    if (value === '' || value === '|') {
      // Could be a nested object or multiline — look ahead
      const indent = getIndent(lines[i + 1])
      if (indent > 0) {
        const block = collectBlock(lines, i + 1, indent)
        result[key] = value === '|'
          ? block.lines.join('\n')
          : parseYaml(block.lines.map(l => l.slice(indent)).join('\n'))
        i = block.end
        continue
      }
      result[key] = value === '|' ? '' : null
    } else if (value.startsWith('[') && value.endsWith(']')) {
      result[key] = parseInlineArray(value)
    } else if (value.startsWith('{') && value.endsWith('}')) {
      result[key] = parseInlineObject(value)
    } else if (value === 'true') {
      result[key] = true
    } else if (value === 'false') {
      result[key] = false
    } else if (value === 'null') {
      result[key] = null
    } else if (/^-?\d+(\.\d+)?$/.test(value)) {
      result[key] = Number(value)
    } else if (value.startsWith('"') && value.endsWith('"')) {
      result[key] = value.slice(1, -1)
    } else if (value.startsWith("'") && value.endsWith("'")) {
      result[key] = value.slice(1, -1)
    } else {
      result[key] = value
    }
    i++
  }
  return result
}

function getIndent(line) {
  if (!line) return 0
  const match = line.match(/^(\s+)/)
  return match ? match[1].length : 0
}

function collectBlock(lines, start, indent) {
  const collected = []
  let i = start
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') { collected.push(''); i++; continue }
    if (getIndent(line) < indent) break
    collected.push(line)
    i++
  }
  return { lines: collected, end: i }
}

function parseInlineArray(str) {
  const inner = str.slice(1, -1).trim()
  if (!inner) return []
  return inner.split(',').map(s => {
    const v = s.trim()
    if (v.startsWith('"') || v.startsWith("'")) return v.slice(1, -1)
    if (v === 'true') return true
    if (v === 'false') return false
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
    return v
  })
}

function parseInlineObject(str) {
  const inner = str.slice(1, -1).trim()
  if (!inner) return {}
  const obj = {}
  const pairs = inner.split(',')
  for (const pair of pairs) {
    const [k, v] = pair.split(':').map(s => s.trim())
    if (!k) continue
    const key = k.replace(/['"]/g, '')
    const val = v?.replace(/['"]/g, '') || null
    if (val === 'true') obj[key] = true
    else if (val === 'false') obj[key] = false
    else if (/^-?\d+(\.\d+)?$/.test(val)) obj[key] = Number(val)
    else obj[key] = val
  }
  return obj
}

// --- Loader API ---

export async function loadVariant({ familyPath, variantPath, basePath }) {
  const [familyMd, variantMd] = await Promise.all([
    fetch(basePath + familyPath).then(r => r.text()),
    fetch(basePath + variantPath).then(r => r.text()),
  ])

  const familyFm = parseFrontmatter(familyMd)
  const variantFm = parseFrontmatter(variantMd)

  // Resolve the surface reference
  const surfaceRef = variantFm.engine?.surface || familyFm.engine?.surface
  const surface = resolveSurface(surfaceRef)

  // Run cascade
  const { resolved, errors } = cascadeResolve({
    surface,
    family: { engine: familyFm.engine || {}, meta: { label: familyFm.title || '' } },
    variant: { engine: variantFm.engine || {}, meta: { label: variantFm.title || variantFm.slug || '' } },
  })

  if (errors.length > 0) {
    return { resolved, errors }
  }

  // Load content if needed
  const contentBasePath = basePath + variantPath.replace(/\/[^/]+$/, '/')
  const final = await loadContent(resolved, contentBasePath)

  return { resolved: final, errors: [] }
}

export async function loadFromData({ surface, family, variant, basePath }) {
  const surfaceObj = typeof surface === 'string' ? resolveSurface(surface) : (surface || {})
  const { resolved, errors } = cascadeResolve({
    surface: surfaceObj,
    family: family || {},
    variant: variant || {},
  })

  if (errors.length > 0) return { resolved, errors }

  const final = await loadContent(resolved, basePath)
  return { resolved: final, errors: [] }
}

export { parseFrontmatter, parseYaml }
