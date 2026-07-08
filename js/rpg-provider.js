const RULES_BASE = 'https://rules.moddable.games'

const CAT_COLORS = {
  spells: { accent: '#7b5ea7', bg: 'rgba(123,94,167,0.12)', border: 'rgba(123,94,167,0.35)' },
  monsters: { accent: '#c0392b', bg: 'rgba(192,57,43,0.12)', border: 'rgba(192,57,43,0.35)' },
  classes: { accent: '#2980b9', bg: 'rgba(41,128,185,0.12)', border: 'rgba(41,128,185,0.35)' },
  equipment: { accent: '#7f8c8d', bg: 'rgba(127,140,141,0.12)', border: 'rgba(127,140,141,0.35)' },
  'magic-items': { accent: '#d4ac0d', bg: 'rgba(212,172,13,0.12)', border: 'rgba(212,172,13,0.35)' },
  races: { accent: '#27ae60', bg: 'rgba(39,174,96,0.12)', border: 'rgba(39,174,96,0.35)' },
  conditions: { accent: '#e67e22', bg: 'rgba(230,126,34,0.12)', border: 'rgba(230,126,34,0.35)' },
  action: { accent: '#3498db', bg: 'rgba(52,152,219,0.12)', border: 'rgba(52,152,219,0.35)' },
  theme: { accent: '#9b59b6', bg: 'rgba(155,89,182,0.12)', border: 'rgba(155,89,182,0.35)' },
  'combat-action': { accent: '#e74c3c', bg: 'rgba(231,76,60,0.12)', border: 'rgba(231,76,60,0.35)' },
  'pay-the-price': { accent: '#f39c12', bg: 'rgba(243,156,18,0.12)', border: 'rgba(243,156,18,0.35)' },
  'major-plot-twist': { accent: '#8e44ad', bg: 'rgba(142,68,173,0.12)', border: 'rgba(142,68,173,0.35)' },
  'challenge-rank': { accent: '#16a085', bg: 'rgba(22,160,133,0.12)', border: 'rgba(22,160,133,0.35)' },
}

function getItemLink(gameKey, cat, item) {
  if (gameKey === 'dnd-5e') {
    if (cat.id === 'spells') {
      const lvl = item.level === 0 ? 'cantrips' : `level-${item.level}`
      return `${RULES_BASE}/dnd-5e/spells/${lvl}/`
    }
    if (cat.id === 'monsters') {
      const first = (item.name || '').charAt(0).toLowerCase()
      const group = first <= 'c' ? 'a-c' : first <= 'f' ? 'd-f' : first <= 'i' ? 'g-i' : first <= 'l' ? 'j-l' : first <= 'o' ? 'm-o' : first <= 'r' ? 'p-r' : first <= 'u' ? 's-u' : 'v-z'
      return `${RULES_BASE}/dnd-5e/monsters/${group}/`
    }
    if (cat.id === 'classes') return `${RULES_BASE}/dnd-5e/classes/`
    if (cat.id === 'magic-items') return `${RULES_BASE}/dnd-5e/magic-items/`
    if (cat.id === 'races' || cat.id === 'conditions') return `${RULES_BASE}/dnd-5e/rules/`
    return `${RULES_BASE}/dnd-5e/`
  }
  if (gameKey === 'ironsworn') {
    return `${RULES_BASE}/ironsworn/`
  }
  return null
}

const RPG_CONFIGS = {
  'dnd-5e': {
    label: 'D&D 5e SRD',
    dataPath: '/MODDABLE/moddable-rules/games/dnd-5e/data/',
    categories: [
      { id: 'spells', label: 'Spells', file: 'spells.json', searchFields: ['name', 'school.name'], tagField: 'level', tagPrefix: 'Lvl ' },
      { id: 'monsters', label: 'Monsters', file: 'monsters.json', searchFields: ['name', 'type'], tagField: 'challenge_rating', tagPrefix: 'CR ' },
      { id: 'classes', label: 'Classes', file: 'classes.json', searchFields: ['name'], tagField: null },
      { id: 'equipment', label: 'Equipment', file: 'equipment.json', searchFields: ['name', 'equipment_category.name'], tagField: 'equipment_category.name' },
      { id: 'magic-items', label: 'Magic Items', file: 'magic-items.json', searchFields: ['name'], tagField: 'rarity.name' },
      { id: 'races', label: 'Races', file: 'races.json', searchFields: ['name'], tagField: null },
      { id: 'conditions', label: 'Conditions', file: 'conditions.json', searchFields: ['name'], tagField: null },
    ],
    renderCard: renderDndCard,
  },
  ironsworn: {
    label: 'Ironsworn',
    dataPath: '/MODDABLE/moddable-rules/games/ironsworn/oracles/',
    categories: [
      { id: 'action', label: 'Action', file: 'action.json', isOracle: true },
      { id: 'theme', label: 'Theme', file: 'theme.json', isOracle: true },
      { id: 'combat-action', label: 'Combat', file: 'combat-action.json', isOracle: true },
      { id: 'pay-the-price', label: 'Pay the Price', file: 'pay-the-price.json', isOracle: true },
      { id: 'major-plot-twist', label: 'Plot Twist', file: 'major-plot-twist.json', isOracle: true },
      { id: 'challenge-rank', label: 'Challenge', file: 'challenge-rank.json', isOracle: true },
    ],
    renderCard: renderIronswornCard,
  },
}

let rpgState = {
  game: null,
  category: null,
  data: {},
  table: [],
  searchQuery: '',
}

export function renderRpgProvider(gameKey) {
  rpgState.game = gameKey
  rpgState.table = []
  rpgState.searchQuery = ''
  rpgState.category = null

  const config = RPG_CONFIGS[gameKey]
  if (!config) return

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
        <input type="text" class="rpg-search" placeholder="Search ${config.label}..." />
        <button class="rpg-clear-table" title="Clear table">Clear</button>
      </div>
    </div>
    <div class="rpg-results"></div>
    <div class="rpg-table-label">Table</div>
    <div class="rpg-table"></div>
  `
  container.appendChild(wrapper)

  const catContainer = wrapper.querySelector('.rpg-categories')
  for (const cat of config.categories) {
    const color = CAT_COLORS[cat.id] || {}
    const btn = document.createElement('button')
    btn.className = 'rpg-cat-btn'
    btn.textContent = cat.label
    btn.dataset.catId = cat.id
    btn.style.borderColor = color.border || ''
    btn.style.setProperty('--cat-accent', color.accent || '#b48c50')
    btn.addEventListener('click', () => selectCategory(gameKey, cat.id))
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

  loadAllData(gameKey)
}

async function loadAllData(gameKey) {
  const config = RPG_CONFIGS[gameKey]
  const promises = config.categories.map(async cat => {
    if (rpgState.data[cat.id]) return
    try {
      const resp = await fetch(config.dataPath + cat.file)
      const json = await resp.json()
      rpgState.data[cat.id] = cat.isOracle ? json.tables || [json] : json
    } catch {
      rpgState.data[cat.id] = []
    }
  })
  await Promise.all(promises)
  rpgState.category = config.categories[0].id
  document.querySelectorAll('.rpg-cat-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.catId === rpgState.category)
  })
  renderResults()
}

function selectCategory(gameKey, catId) {
  rpgState.category = catId
  document.querySelectorAll('.rpg-cat-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.catId === catId)
  })
  renderResults()
}

function renderResults() {
  const container = document.querySelector('.rpg-results')
  if (!container) return

  const config = RPG_CONFIGS[rpgState.game]
  const query = rpgState.searchQuery.toLowerCase().trim()

  let results = []

  if (query) {
    for (const cat of config.categories) {
      const data = rpgState.data[cat.id] || []
      if (cat.isOracle) {
        const entries = data.flatMap(table =>
          (table.entries || []).map(e => ({ ...e, _tableName: table.name || table.id }))
        )
        const matched = entries.filter(e => (e.result || '').toLowerCase().includes(query))
        results.push(...matched.map(item => ({ item, cat })))
      } else {
        const matched = data.filter(item =>
          (cat.searchFields || ['name']).some(field => {
            const val = getNestedField(item, field)
            return val && String(val).toLowerCase().includes(query)
          })
        )
        results.push(...matched.map(item => ({ item, cat })))
      }
    }
  } else {
    const cat = config.categories.find(c => c.id === rpgState.category)
    const data = rpgState.data[rpgState.category] || []
    if (cat.isOracle) {
      const entries = data.flatMap(table =>
        (table.entries || []).map(e => ({ ...e, _tableName: table.name || table.id }))
      )
      results = entries.slice(0, 30).map(item => ({ item, cat }))
    } else {
      results = data.slice(0, 30).map(item => ({ item, cat }))
    }
  }

  results = results.slice(0, 50)

  container.innerHTML = ''
  if (results.length === 0) {
    container.innerHTML = '<div class="rpg-no-results">No results</div>'
    return
  }

  for (const { item, cat } of results) {
    const color = CAT_COLORS[cat.id] || {}
    const row = document.createElement('div')
    row.className = 'rpg-result-row'
    row.style.borderLeft = `3px solid ${color.accent || '#888'}`

    if (cat.isOracle) {
      const range = item.min === item.max ? `${item.min}` : `${item.min}-${item.max}`
      row.innerHTML = `<span class="rpg-result-range">${range}</span><span class="rpg-result-name">${item.result || ''}</span><span class="rpg-result-cat" style="color:${color.accent}">${cat.label}</span>`
    } else {
      const tag = cat.tagField ? getNestedField(item, cat.tagField) : null
      const tagHtml = tag != null ? `<span class="rpg-result-tag" style="background:${color.bg};color:${color.accent}">${cat.tagPrefix || ''}${tag}</span>` : ''
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

  const config = RPG_CONFIGS[rpgState.game]
  container.innerHTML = ''

  if (rpgState.table.length === 0) {
    container.innerHTML = '<div class="rpg-table-empty">Click items above to add cards to the table</div>'
    return
  }

  for (const entry of rpgState.table) {
    const color = CAT_COLORS[entry.cat.id] || {}
    const card = document.createElement('div')
    card.className = 'rpg-card'
    card.style.borderColor = color.border || 'rgba(180,140,80,0.25)'
    card.style.background = color.bg || 'rgba(40,30,20,0.6)'

    const link = getItemLink(rpgState.game, entry.cat, entry.item)
    const linkHtml = link ? `<a class="rpg-card-link" href="${link}" target="_blank" rel="noopener">${entry.cat.label} ↗</a>` : ''
    card.innerHTML = config.renderCard(entry.item, entry.cat) + linkHtml

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

function renderDndCard(item, cat) {
  if (cat.isOracle) return `<div class="rpg-card-title">${item.result || ''}</div>`

  const name = item.name || item.index
  const parts = [`<div class="rpg-card-title">${name}</div>`]

  if (cat.id === 'spells') {
    parts.push(`<div class="rpg-card-meta">Level ${item.level} ${item.school?.name || ''}</div>`)
    parts.push(`<div class="rpg-card-meta">${item.casting_time} · ${item.range} · ${item.duration}</div>`)
    if (item.components) parts.push(`<div class="rpg-card-meta">Components: ${item.components.join(', ')}</div>`)
    if (item.desc?.[0]) parts.push(`<div class="rpg-card-desc">${item.desc[0]}</div>`)
  } else if (cat.id === 'monsters') {
    parts.push(`<div class="rpg-card-meta">${item.size} ${item.type}, ${item.alignment}</div>`)
    parts.push(`<div class="rpg-card-meta">AC ${item.armor_class?.[0]?.value || '?'} · HP ${item.hit_points} · CR ${item.challenge_rating}</div>`)
    const stats = `STR ${item.strength} DEX ${item.dexterity} CON ${item.constitution} INT ${item.intelligence} WIS ${item.wisdom} CHA ${item.charisma}`
    parts.push(`<div class="rpg-card-stats">${stats}</div>`)
  } else if (cat.id === 'classes') {
    parts.push(`<div class="rpg-card-meta">Hit Die: ${item.hit_die ? 'd' + item.hit_die : '?'}</div>`)
    if (item.proficiency_choices?.[0]) {
      const choices = item.proficiency_choices[0].from?.options?.map(o => o.item?.name).filter(Boolean).join(', ')
      if (choices) parts.push(`<div class="rpg-card-desc">Skills: ${choices}</div>`)
    }
  } else if (cat.id === 'equipment') {
    if (item.equipment_category?.name) parts.push(`<div class="rpg-card-meta">${item.equipment_category.name}</div>`)
    if (item.cost) parts.push(`<div class="rpg-card-meta">${item.cost.quantity} ${item.cost.unit}</div>`)
    if (item.damage) parts.push(`<div class="rpg-card-meta">${item.damage.damage_dice} ${item.damage.damage_type?.name || ''}</div>`)
    if (item.desc?.[0]) parts.push(`<div class="rpg-card-desc">${item.desc[0]}</div>`)
  } else if (cat.id === 'magic-items') {
    if (item.rarity?.name) parts.push(`<div class="rpg-card-meta">${item.rarity.name}</div>`)
    if (item.desc?.[0]) parts.push(`<div class="rpg-card-desc">${item.desc[0]}</div>`)
  } else if (cat.id === 'conditions') {
    if (item.desc?.[0]) parts.push(`<div class="rpg-card-desc">${item.desc[0]}</div>`)
  } else if (cat.id === 'races') {
    if (item.speed) parts.push(`<div class="rpg-card-meta">Speed: ${item.speed} ft</div>`)
    if (item.size_description) parts.push(`<div class="rpg-card-desc">${item.size_description}</div>`)
  } else {
    if (item.desc?.[0]) parts.push(`<div class="rpg-card-desc">${item.desc[0]}</div>`)
  }

  return parts.join('')
}

function renderIronswornCard(item, cat) {
  const range = item.min === item.max ? `${item.min}` : `${item.min}-${item.max}`
  const parts = [
    `<div class="rpg-card-title">${item.result || ''}</div>`,
    `<div class="rpg-card-meta">${item._tableName || cat.label} · Roll: ${range}</div>`,
  ]
  return parts.join('')
}

function getNestedField(obj, path) {
  return path.split('.').reduce((o, k) => o && o[k], obj)
}
