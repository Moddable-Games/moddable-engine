import { readFile, readdir, stat } from 'node:fs/promises'
import { join, basename, dirname } from 'node:path'
import { parseFrontmatter } from './parse-frontmatter.js'
import { validate } from './validate.js'
import { produce } from './produce.js'

export async function loadVariantFile(filePath) {
  const content = await readFile(filePath, 'utf-8')
  const { meta, body } = parseFrontmatter(content)
  return { path: filePath, meta, body }
}

export async function loadGameDefinition(filePath, topologySchemas = []) {
  const { meta, body } = await loadVariantFile(filePath)
  const validation = validate(meta, topologySchemas)

  if (!validation.valid) {
    return { ok: false, path: filePath, errors: validation.errors, meta }
  }

  const definition = produce(meta)
  return { ok: true, path: filePath, definition, meta, body }
}

export async function loadFamily(familyDir) {
  const variantsDir = join(familyDir, 'content', 'variants')
  const files = await listMarkdownFiles(variantsDir)
  const results = []

  for (const file of files) {
    const variant = await loadVariantFile(join(variantsDir, file))
    results.push(variant)
  }

  const hubPath = join(familyDir, 'content', 'rulebook.md')
  let hub = null
  try {
    const content = await readFile(hubPath, 'utf-8')
    const { meta, body } = parseFrontmatter(content)
    hub = { path: hubPath, meta, body }
  } catch (e) {
    // No hub file — not an error
  }

  return {
    family: basename(familyDir),
    hub,
    variants: results,
  }
}

export async function loadAllFamilies(gamesDir) {
  const entries = await readdir(gamesDir)
  const families = []

  for (const entry of entries) {
    const entryPath = join(gamesDir, entry)
    const s = await stat(entryPath)
    if (!s.isDirectory()) continue

    const family = await loadFamily(entryPath)
    families.push(family)
  }

  return families
}

export async function scanFrontmatter(gamesDir) {
  const families = await loadAllFamilies(gamesDir)
  const report = {
    familyCount: families.length,
    variantCount: 0,
    fields: new Map(),
    families: [],
  }

  for (const family of families) {
    const familyReport = {
      name: family.family,
      variantCount: family.variants.length,
      hubFields: family.hub ? Object.keys(family.hub.meta) : [],
    }

    report.variantCount += family.variants.length

    for (const variant of family.variants) {
      collectFields(variant.meta, '', report.fields)
    }

    report.families.push(familyReport)
  }

  return {
    ...report,
    fields: Object.fromEntries(report.fields),
  }
}

export async function loadEngineReady(gamesDir, topologySchemas = []) {
  const families = await loadAllFamilies(gamesDir)
  const ready = []
  const notReady = []

  for (const family of families) {
    for (const variant of family.variants) {
      if (variant.meta.engine) {
        const validation = validate(variant.meta, topologySchemas)
        if (validation.valid) {
          ready.push({
            path: variant.path,
            definition: produce(variant.meta),
          })
        } else {
          notReady.push({ path: variant.path, reason: 'invalid', errors: validation.errors })
        }
      } else {
        notReady.push({ path: variant.path, reason: 'no-engine-block' })
      }
    }
  }

  return { ready, notReady }
}

async function listMarkdownFiles(dir) {
  try {
    const entries = await readdir(dir)
    return entries.filter(e => e.endsWith('.md'))
  } catch (e) {
    return []
  }
}

function collectFields(obj, prefix, fieldMap) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (!fieldMap.has(path)) {
      fieldMap.set(path, { count: 0, examples: [] })
    }
    const entry = fieldMap.get(path)
    entry.count++
    if (entry.examples.length < 3 && value !== null && value !== undefined) {
      const example = typeof value === 'object' ? JSON.stringify(value) : String(value)
      if (!entry.examples.includes(example)) {
        entry.examples.push(example)
      }
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      collectFields(value, path, fieldMap)
    }
  }
}
