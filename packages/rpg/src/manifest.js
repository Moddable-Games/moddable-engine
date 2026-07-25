export function resolveDataUrl(manifest, category, rulesBase = 'https://rules.moddable.games') {
  const dataPath = manifest.dataPath || ''
  const file = category.file
  if (!file) return null
  return `${rulesBase}/${dataPath}${file}`
}

export async function loadManifest(gameKey, opts = {}) {
  const { rulesBase = 'https://rules.moddable.games', fetcher = globalThis.fetch } = opts
  const url = `${rulesBase}/games/${gameKey}/rpg-manifest.json`
  const resp = await fetcher(url)
  if (!resp.ok) return null
  return resp.json()
}

export async function loadCategoryData(manifest, opts = {}) {
  const { rulesBase = 'https://rules.moddable.games', fetcher = globalThis.fetch } = opts
  const data = {}
  const dataBase = `${rulesBase}/${manifest.dataPath}`

  const loads = manifest.categories.map(async cat => {
    const url = `${dataBase}${cat.file}`
    try {
      const resp = await fetcher(url)
      const json = await resp.json()
      const dataType = cat.dataType || manifest.dataType || 'entity'

      if (dataType === 'oracle' || dataType === 'table') {
        const raw = cat.arrayKey ? extractByKey(json, cat.arrayKey) : null
        const tables = raw
          ? (Array.isArray(raw) && raw[0] && raw[0].entries ? raw : [{ entries: raw }])
          : json.tables || [json]
        data[cat.id] = tables.map(t => ({
          ...t,
          entries: (t.entries || []).map((e, i) => {
            if (typeof e === 'string') return { result: e, min: i + 1, max: i + 1 }
            if (e.min == null) return { ...e, min: i + 1, max: i + 1 }
            return e
          }),
        }))
      } else {
        const extracted = cat.arrayKey ? extractByKey(json, cat.arrayKey) : null
        data[cat.id] = extracted || (Array.isArray(json) ? json : json.data || json.entries || [])
      }
    } catch {
      data[cat.id] = []
    }
  })

  await Promise.all(loads)
  return data
}

function extractByKey(json, arrayKey) {
  if (!arrayKey) return null
  const bracketMatch = arrayKey.match(/^(.+?)\[(\d+)\]\.(.+)$/)
  if (bracketMatch) {
    const [, pre, idx, post] = bracketMatch
    const arr = pre.split('.').reduce((o, k) => o && o[k], json)
    if (!Array.isArray(arr)) return null
    const obj = arr[parseInt(idx)]
    return obj ? post.split('.').reduce((o, k) => o && o[k], obj) : null
  }
  return arrayKey.split('.').reduce((o, k) => o && o[k], json)
}
