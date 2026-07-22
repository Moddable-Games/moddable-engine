import { loadRpgManifest } from './rpg-manifest-loader.js'
import { renderCard } from './rpg-card-renderer.js'
import { resolveLink } from './rpg-link-resolver.js'

const RULES_BASE = 'https://rules.moddable.games'

function deriveColors(hex) {
  return {
    accent: hex,
    bg: `${hex}1f`,
    border: `${hex}59`,
  }
}

const PAGE_SIZE = 50

let rpgState = {
  game: null,
  manifest: null,
  category: null,
  data: {},
  table: [],
  searchQuery: '',
  page: 1,
}

export async function renderRpgProvider(gameKey) {
  rpgState.game = gameKey
  rpgState.table = []
  rpgState.searchQuery = ''
  rpgState.category = null
  rpgState.data = {}
  rpgState.page = 1

  const basePath = location.hostname === 'engine.moddable.games'
    ? 'https://rules.moddable.games/'
    : '/MODDABLE/moddable-rules/'

  const manifest = await loadRpgManifest(gameKey, basePath)
  if (!manifest) return
  rpgState.manifest = manifest

  const container = document.getElementById('board-svg')
  const empty = document.getElementById('board-empty')
  container.innerHTML = ''
  container.classList.add('active')
  empty.style.display = 'none'

  const wrapper = document.createElement('div')
  wrapper.className = 'rpg-provider'
  wrapper.innerHTML = `
    <div class="rpg-controls">
      <div class="rpg-categories"></div>
      <div class="rpg-search-row">
        <input type="text" class="rpg-search" placeholder="Search ${manifest.label}..." />
        <button class="rpg-clear-table" title="Clear table">Clear</button>
      </div>
    </div>
    <div class="rpg-results"></div>
    <div class="rpg-table-label">Table</div>
    <div class="rpg-table"></div>
  `
  container.appendChild(wrapper)

  const catContainer = wrapper.querySelector('.rpg-categories')
  for (const cat of manifest.categories) {
    const color = deriveColors(cat.color || '#b48c50')
    const btn = document.createElement('button')
    btn.className = 'rpg-cat-btn'
    btn.textContent = cat.label
    btn.dataset.catId = cat.id
    btn.style.borderColor = color.border
    btn.style.setProperty('--cat-accent', color.accent)
    btn.addEventListener('click', () => selectCategory(cat.id))
    catContainer.appendChild(btn)
  }

  const searchInput = wrapper.querySelector('.rpg-search')
  searchInput.addEventListener('input', () => {
    rpgState.searchQuery = searchInput.value
    rpgState.page = 1
    renderResults()
  })

  wrapper.querySelector('.rpg-clear-table').addEventListener('click', () => {
    rpgState.table = []
    renderTable()
  })

  loadAllData(basePath)
}

async function loadAllData(basePath) {
  const manifest = rpgState.manifest
  const dataBase = basePath + manifest.dataPath
  const promises = manifest.categories.map(async cat => {
    if (rpgState.data[cat.id]) return
    try {
      const resp = await fetch(dataBase + cat.file)
      const json = await resp.json()
      const dataType = getCategoryDataType(cat, manifest)
      if (dataType === 'oracle' || dataType === 'table') {
        const raw = cat.arrayKey ? extractByKey(json, cat.arrayKey) : null
        const tables = raw ? (Array.isArray(raw) && raw[0] && raw[0].entries ? raw : [{ entries: raw }])
          : json.tables || [json]
        rpgState.data[cat.id] = tables.map(t => ({
          ...t,
          entries: (t.entries || []).map((e, i) => {
            if (typeof e === 'string') return { result: e, min: i + 1, max: i + 1, roll: i + 1 }
            if (e.min == null) return { ...e, min: i + 1, max: i + 1, roll: i + 1 }
            return e
          }),
        }))
      } else {
        const extracted = cat.arrayKey ? extractByKey(json, cat.arrayKey) : null
        rpgState.data[cat.id] = extracted || (Array.isArray(json) ? json : json.data || json.entries || [])
      }
    } catch {
      rpgState.data[cat.id] = []
    }
  })
  await Promise.all(promises)
  rpgState.category = manifest.categories[0].id
  document.querySelectorAll('.rpg-cat-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.catId === rpgState.category)
  })
  renderResults()
}

function getCategoryDataType(category, manifest) {
  return category.dataType || manifest.dataType || 'entity'
}

function extractByKey(json, arrayKey) {
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

function selectCategory(catId) {
  rpgState.category = catId
  rpgState.page = 1
  document.querySelectorAll('.rpg-cat-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.catId === catId)
  })
  renderResults()
}

function getAllResults() {
  const manifest = rpgState.manifest
  const query = rpgState.searchQuery.toLowerCase().trim()
  let results = []

  if (query) {
    for (const cat of manifest.categories) {
      const dataType = getCategoryDataType(cat, manifest)
      const data = rpgState.data[cat.id] || []
      if (dataType === 'oracle' || dataType === 'table') {
        const entries = data.flatMap(table =>
          (table.entries || []).map(e => ({ ...e, _tableName: table.name || table.id }))
        )
        const displayField = cat.displayField || 'result'
        const matched = entries.filter(e => resolveDisplay(e, displayField).toLowerCase().includes(query))
        results.push(...matched.map(item => ({ item, cat })))
      } else {
        const searchFields = cat.searchFields || ['name']
        const matched = data.filter(item =>
          searchFields.some(field => {
            const val = getNestedField(item, field)
            return val && String(val).toLowerCase().includes(query)
          })
        )
        results.push(...matched.map(item => ({ item, cat })))
      }
    }
  } else {
    const cat = manifest.categories.find(c => c.id === rpgState.category)
    const dataType = getCategoryDataType(cat, manifest)
    const data = rpgState.data[rpgState.category] || []
    if (dataType === 'oracle' || dataType === 'table') {
      const entries = data.flatMap(table =>
        (table.entries || []).map(e => ({ ...e, _tableName: table.name || table.id }))
      )
      results = entries.map(item => ({ item, cat }))
    } else {
      results = data.map(item => ({ item, cat }))
    }
  }

  return results
}

function renderResults() {
  const container = document.querySelector('.rpg-results')
  if (!container) return

  const manifest = rpgState.manifest
  const allResults = getAllResults()
  const totalCount = allResults.length
  const pageEnd = rpgState.page * PAGE_SIZE
  const visible = allResults.slice(0, pageEnd)

  container.innerHTML = ''
  if (visible.length === 0) {
    container.innerHTML = '<div class="rpg-no-results">No results</div>'
    return
  }

  for (const { item, cat } of visible) {
    const color = deriveColors(cat.color || '#888')
    const dataType = getCategoryDataType(cat, manifest)
    const row = document.createElement('div')
    row.className = 'rpg-result-row'
    row.style.borderLeft = `3px solid ${color.accent}`

    if (dataType === 'oracle' || dataType === 'table') {
      const range = item.min === item.max ? `${item.min}` : `${item.min}-${item.max}`
      const displayText = resolveDisplay(item, cat.displayField || 'result')
      row.innerHTML = `<span class="rpg-result-range">${range}</span><span class="rpg-result-name">${displayText}</span><span class="rpg-result-cat" style="color:${color.accent}">${cat.label}</span>`
    } else {
      const displayText = resolveDisplay(item, cat.displayField || 'name') || item.index || ''
      const tag = cat.tag ? getNestedField(item, cat.tag.field) : null
      const tagHtml = tag != null ? `<span class="rpg-result-tag" style="background:${color.bg};color:${color.accent}">${cat.tag.prefix || ''}${tag}</span>` : ''
      row.innerHTML = `<span class="rpg-result-name">${displayText}</span>${tagHtml}<span class="rpg-result-cat" style="color:${color.accent}">${cat.label}</span>`
    }

    row.addEventListener('click', () => addToTable(item, cat))
    container.appendChild(row)
  }

  if (pageEnd < totalCount) {
    const remaining = totalCount - pageEnd
    const more = document.createElement('button')
    more.className = 'rpg-show-more'
    more.textContent = `Show more (${remaining} remaining)`
    more.addEventListener('click', () => {
      rpgState.page++
      renderResults()
    })
    container.appendChild(more)
  }
}

function addToTable(item, cat) {
  rpgState.table.unshift({ item, cat, id: Date.now() + Math.random() })
  if (rpgState.table.length > 20) rpgState.table.pop()
  renderTable()
}

function renderTable() {
  const container = document.querySelector('.rpg-table')
  if (!container) return

  const manifest = rpgState.manifest
  container.innerHTML = ''

  if (rpgState.table.length === 0) {
    container.innerHTML = '<div class="rpg-table-empty">Click items above to add cards to the table</div>'
    return
  }

  for (const entry of rpgState.table) {
    const color = deriveColors(entry.cat.color || '#b48c50')
    const card = document.createElement('div')
    card.className = 'rpg-card'
    card.style.borderColor = color.border
    card.style.background = color.bg

    const dataType = getCategoryDataType(entry.cat, manifest)
    const isOracle = dataType === 'oracle' || dataType === 'table'
    const cardItem = isOracle
      ? { ...entry.item, range: entry.item.min === entry.item.max ? `${entry.item.min}` : `${entry.item.min}-${entry.item.max}` }
      : entry.item

    const link = resolveLink(cardItem, entry.cat, manifest, RULES_BASE)
    const linkHtml = link ? `<a class="rpg-card-link" href="${link}" target="_blank" rel="noopener">${entry.cat.label} ↗</a>` : ''
    card.innerHTML = renderCard(cardItem, entry.cat, manifest) + linkHtml

    const removeBtn = document.createElement('button')
    removeBtn.className = 'rpg-card-remove'
    removeBtn.textContent = '×'
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      rpgState.table = rpgState.table.filter(t => t.id !== entry.id)
      renderTable()
    })
    card.appendChild(removeBtn)
    container.appendChild(card)
  }
}

function getNestedField(obj, path) {
  return path.split('.').reduce((o, k) => o && o[k], obj)
}

function resolveDisplay(item, displayField) {
  if (!displayField) return item.name || item.result || ''
  if (displayField.includes('{')) {
    return displayField.replace(/\{([^}]+)\}/g, (_, key) => getNestedField(item, key) || '')
  }
  return getNestedField(item, displayField) || ''
}
