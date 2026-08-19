import { getField, interpolate } from './card-data.js'

export function searchEntities(manifest, data, opts = {}) {
  const { query = '', category = null, page = 1, pageSize = 50 } = opts
  const q = query.toLowerCase().trim()

  let results = []

  if (q) {
    for (const cat of manifest.categories) {
      if (category && cat.id !== category) continue
      const catData = data[cat.id] || []
      const dataType = getCategoryDataType(cat, manifest)

      if (dataType === 'oracle' || dataType === 'table') {
        const entries = normalizeOracleEntries(catData)
        const displayField = cat.displayField || 'result'
        const matched = entries.filter(e =>
          resolveDisplay(e, displayField).toLowerCase().includes(q)
        )
        results.push(...matched.map(item => ({ item, category: cat })))
      } else {
        const searchFields = cat.searchFields || ['name']
        const matched = catData.filter(item =>
          searchFields.some(field => {
            const val = getField(item, field)
            return val && String(val).toLowerCase().includes(q)
          })
        )
        results.push(...matched.map(item => ({ item, category: cat })))
      }
    }
  } else if (category) {
    const cat = manifest.categories.find(c => c.id === category)
    if (!cat) return { results: [], total: 0, page, pageSize }
    const catData = data[category] || []
    const dataType = getCategoryDataType(cat, manifest)

    if (dataType === 'oracle' || dataType === 'table') {
      const entries = normalizeOracleEntries(catData)
      results = entries.map(item => ({ item, category: cat }))
    } else {
      results = catData.map(item => ({ item, category: cat }))
    }
  }

  return paginateResults(results, page, pageSize)
}

export function filterByCategory(manifest, data, categoryId) {
  const cat = manifest.categories.find(c => c.id === categoryId)
  if (!cat) return []
  const catData = data[categoryId] || []
  const dataType = getCategoryDataType(cat, manifest)

  if (dataType === 'oracle' || dataType === 'table') {
    return normalizeOracleEntries(catData)
  }
  return catData
}

export function paginateResults(results, page = 1, pageSize = 50) {
  const total = results.length
  const start = (page - 1) * pageSize
  const items = results.slice(start, start + pageSize)
  return { results: items, total, page, pageSize, pages: Math.ceil(total / pageSize) }
}

export function getCategoryDataType(category, manifest) {
  return category.dataType || manifest.dataType || 'entity'
}

export function normalizeOracleEntries(tableData) {
  if (!Array.isArray(tableData)) return []
  return tableData.flatMap(table =>
    (table.entries || []).map((e, i) => {
      const entry = typeof e === 'string' ? { result: e } : { ...e }
      if (entry.min == null) { entry.min = i + 1; entry.max = i + 1 }
      const tableName = table.name || table.id
      if (tableName) entry._tableName = tableName
      return entry
    })
  )
}

export function resolveDisplay(item, displayField) {
  if (!displayField) return item.name || item.result || ''
  if (displayField.includes('{')) {
    return interpolate(displayField, item)
  }
  return getField(item, displayField) || ''
}
