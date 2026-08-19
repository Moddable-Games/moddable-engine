export const TRANSFORMS = {
  levelSlug(value) {
    return value === 0 ? 'cantrips' : `level-${value}`
  },
  alphaGroup(value) {
    const first = String(value).charAt(0).toLowerCase()
    if (first <= 'c') return 'a-c'
    if (first <= 'f') return 'd-f'
    if (first <= 'i') return 'g-i'
    if (first <= 'l') return 'j-l'
    if (first <= 'o') return 'm-o'
    if (first <= 'r') return 'p-r'
    if (first <= 'u') return 's-u'
    return 'v-z'
  },
  kebabCase(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  },
  lowercase(value) {
    return String(value).toLowerCase()
  },
}

export function getField(obj, path) {
  if (!path) return undefined
  const arrayMatch = path.match(/^(.+?)\[(\d+)\](.*)$/)
  if (arrayMatch) {
    const [, pre, idx, post] = arrayMatch
    const arr = pre.split('.').reduce((o, k) => o && o[k], obj)
    if (!Array.isArray(arr)) return undefined
    const val = arr[parseInt(idx)]
    if (!post) return val
    const rest = post.startsWith('.') ? post.slice(1) : post
    return rest ? getField(val, rest) : val
  }
  return path.split('.').reduce((o, k) => o && o[k], obj)
}

export function interpolate(template, item) {
  if (!template) return ''
  return template.replace(/\{([^}]+)\}/g, (_, expr) => {
    const parts = expr.split('|')
    const fieldPath = parts[0].trim()
    const transform = parts[1] ? parts[1].trim() : null
    let value = getField(item, fieldPath)
    if (value === undefined || value === null) return ''
    if (transform && TRANSFORMS[transform]) {
      value = TRANSFORMS[transform](value)
    }
    return String(value)
  })
}

export function getCardFields(category, manifest) {
  if (category.cardFields) return category.cardFields
  const cf = manifest.cardFields
  if (!cf) return null
  if (cf[category.id]) return cf[category.id]
  if (cf.title) return cf
  return null
}

export function getCardData(item, category, manifest) {
  const fields = getCardFields(category, manifest)
  const result = { title: '', meta: [], stats: null, tags: null, description: null }

  if (!fields) {
    result.title = item.result || item.name || ''
    return result
  }

  result.title = fields.title
    ? (fields.title.includes('{') ? interpolate(fields.title, item) : getField(item, fields.title) || '')
    : ''

  if (fields.meta) {
    const metas = Array.isArray(fields.meta) ? fields.meta : [fields.meta]
    for (const tpl of metas) {
      const text = interpolate(tpl, item)
      if (text) result.meta.push(text)
    }
  }

  if (fields.stats) {
    result.stats = interpolate(fields.stats, item)
  }

  if (fields.tags) {
    const tagVal = getField(item, fields.tags)
    if (Array.isArray(tagVal)) result.tags = tagVal
  }

  if (fields.description) {
    result.description = getField(item, fields.description) || null
  }

  return result
}
