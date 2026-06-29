import { parseFrontmatter } from './parse-frontmatter.js'
import { validate } from './validate.js'
import { produce } from './produce.js'

export function parseGameDefinition(content) {
  const { meta, body } = parseFrontmatter(content)
  const validation = validate(meta)

  if (!validation.valid) {
    return { ok: false, errors: validation.errors, meta }
  }

  const definition = produce(meta)
  return { ok: true, definition, meta, body }
}

export function parseVariantFile(content) {
  const { meta, body } = parseFrontmatter(content)
  return { meta, body }
}

export function validateMeta(meta) {
  return validate(meta)
}

export function produceDefinition(meta) {
  const validation = validate(meta)
  if (!validation.valid) {
    throw new Error(`Invalid meta: ${validation.errors.map(e => e.message).join(', ')}`)
  }
  return produce(meta)
}
