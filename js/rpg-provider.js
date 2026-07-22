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

let rpgState = {
  game: null,
  manifest: null,
  category: null,
  data: {},
  table: [],
  searchQuery: '',
}

export async function renderRpgProvider(gameKey) {
  rpgState.game = gameKey
  rpgState.table = []
  rpgState.searchQuery = ''
  rpgState.category = null
  rpgState.data = {}

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
      if (manifest.dataType === 'oracle' || manifest.dataType === 'table') {
        const tables = json.tables || [json]
        rpgState.data[cat.id] = tables.map(t => ({
          ...t,
          entries: (t.entries || []).map((e, i) =>
            typeof e === 'string' ? { result: e, min: i + 1, max: i + 1, roll: i + 1 } : e
          ),
        }))
      } else {
        rpgState.data[cat.id] = Array.isArray(json) ? json : json.data || json.entries || []
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

function selectCategory(catId) {
  rpgState.category = catId
  document.querySelectorAll('.rpg-cat-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.catId === catId)
  })
  renderResults()
}

function renderResults() {
  const container = document.querySelector('.rpg-results')
  if (!container) return

  const manifest = rpgState.manifest
  const query = rpgState.searchQuery.toLowerCase().trim()
  const isOracle = manifest.dataType === 'oracle' || manifest.dataType === 'table'

  let results = []
  let totalCount = 0

  if (query) {
    for (const cat of manifest.categories) {
      const data = rpgState.data[cat.id] || []
      if (isOracle) {
        const entries = data.flatMap(table =>
          (table.entries || []).map(e => ({ ...e, _tableName: table.name || table.id }))
        )
        const matched = entries.filter(e => (e.result || '').toLowerCase().includes(query))
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
    const data = rpgState.data[rpgState.category] || []
    if (isOracle) {
      const entries = data.flatMap(table =>
        (table.entries || []).map(e => ({ ...e, _tableName: table.name || table.id }))
      )
      totalCount = entries.length
      results = entries.slice(0, 30).map(item => ({ item, cat }))
    } else {
      totalCount = data.length
      results = data.slice(0, 30).map(item => ({ item, cat }))
    }
  }

  results = results.slice(0, 50)

  container.innerHTML = ''
  if (results.length === 0) {
    container.innerHTML = '<div class="rpg-no-results">No results</div>'
    return
  }

  if (!query && totalCount > results.length) {
    const hint = document.createElement('div')
    hint.className = 'rpg-results-hint'
    hint.textContent = `Showing ${results.length} of ${totalCount} entries — search to filter`
    container.appendChild(hint)
  }

  for (const { item, cat } of results) {
    const color = deriveColors(cat.color || '#888')
    const row = document.createElement('div')
    row.className = 'rpg-result-row'
    row.style.borderLeft = `3px solid ${color.accent}`

    if (isOracle) {
      const range = item.min === item.max ? `${item.min}` : `${item.min}-${item.max}`
      row.innerHTML = `<span class="rpg-result-range">${range}</span><span class="rpg-result-name">${item.result || ''}</span><span class="rpg-result-cat" style="color:${color.accent}">${cat.label}</span>`
    } else {
      const tag = cat.tag ? getNestedField(item, cat.tag.field) : null
      const tagHtml = tag != null ? `<span class="rpg-result-tag" style="background:${color.bg};color:${color.accent}">${cat.tag.prefix || ''}${tag}</span>` : ''
      row.innerHTML = `<span class="rpg-result-name">${item.name || item.index}</span>${tagHtml}<span class="rpg-result-cat" style="color:${color.accent}">${cat.label}</span>`
    }

    row.addEventListener('click', () => addToTable(item, cat))
    container.appendChild(row)
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

    const isOracle = manifest.dataType === 'oracle' || manifest.dataType === 'table'
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
