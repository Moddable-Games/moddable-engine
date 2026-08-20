import { readFile, writeFile } from 'node:fs/promises'
import { parseFrontmatter } from './parse-frontmatter.js'
import { inferEngineBlock } from './infer.js'
import { validate } from './validate.js'
import { serializeFrontmatter } from './serialize-frontmatter.js'

export { serializeFrontmatter }

function extractConfig(opts = {}) {
  const { topologySchemas = [], ...inferConfig } = opts
  if (topologySchemas.length) inferConfig.topologySchemas = topologySchemas
  return { topologySchemas, inferConfig }
}

export function enrichMeta(meta, engineBlock) {
  return { ...meta, engine: engineBlock }
}

export async function enrichFile(filePath, engineBlock, opts = {}) {
  const { topologySchemas, inferConfig } = extractConfig(opts)
  const content = await readFile(filePath, 'utf-8')
  const { meta, body } = parseFrontmatter(content)

  if (meta.engine) {
    return { changed: false, reason: 'already-enriched' }
  }

  const enriched = enrichMeta(meta, engineBlock || inferEngineBlock(meta, inferConfig))
  if (!enriched.engine) {
    return { changed: false, reason: 'cannot-infer' }
  }

  const validation = validate(enriched, topologySchemas)
  if (!validation.valid) {
    return { changed: false, reason: 'invalid', errors: validation.errors }
  }

  const newContent = serializeFrontmatter(enriched) + '\n' + body
  await writeFile(filePath, newContent, 'utf-8')
  return { changed: true, meta: enriched }
}

export async function enrichDryRun(filePath, opts = {}) {
  const { topologySchemas, inferConfig } = extractConfig(opts)
  const content = await readFile(filePath, 'utf-8')
  const { meta, body } = parseFrontmatter(content)

  if (meta.engine) {
    return { wouldChange: false, reason: 'already-enriched' }
  }

  const engineBlock = inferEngineBlock(meta, inferConfig)
  if (!engineBlock) {
    return { wouldChange: false, reason: 'cannot-infer' }
  }

  const enriched = enrichMeta(meta, engineBlock)
  const validation = validate(enriched, topologySchemas)
  if (!validation.valid) {
    return { wouldChange: false, reason: 'invalid', errors: validation.errors }
  }

  const preview = serializeFrontmatter(enriched)
  return { wouldChange: true, preview, meta: enriched }
}
