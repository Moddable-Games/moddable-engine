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
    const btn = document.createElement('button')
    btn.className = 'rpg-cat-btn'
    btn.textContent = cat.label
    btn.dataset.catId = cat.id
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

  selectCategory(gameKey, config.categories[0].id)
}

async function selectCategory(gameKey, catId) {
  const config = RPG_CONFIGS[gameKey]
  rpgState.category = catId

  document.querySelectorAll('.rpg-cat-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.catId === catId)
  })

  if (!rpgState.data[catId]) {
    const cat = config.categories.find(c => c.id === catId)
    try {
      const resp = await fetch(config.dataPath + cat.file)
      const json = await resp.json()
      rpgState.data[catId] = cat.isOracle ? json.tables || [json] : json
    } catch {
      rpgState.data[catId] = []
    }
  }

  rpgState.searchQuery = ''
  const searchInput = document.querySelector('.rpg-search')
  if (searchInput) searchInput.value = ''
  renderResults()
}

function renderResults() {
  const container = document.querySelector('.rpg-results')
  if (!container) return

  const config = RPG_CONFIGS[rpgState.game]
  const cat = config.categories.find(c => c.id === rpgState.category)
  const data = rpgState.data[rpgState.category] || []
  const query = rpgState.searchQuery.toLowerCase().trim()

  let items
  if (cat.isOracle) {
    items = data.flatMap(table =>
      (table.entries || []).map(e => ({ ...e, _tableName: table.name || table.id }))
    )
    if (query) {
      items = items.filter(e => (e.result || '').toLowerCase().includes(query))
    }
  } else {
    items = query
      ? data.filter(item => {
          return (cat.searchFields || ['name']).some(field => {
            const val = getNestedField(item, field)
            return val && String(val).toLowerCase().includes(query)
          })
        })
      : data.slice(0, 30)
  }

  items = items.slice(0, 40)

  container.innerHTML = ''
  if (items.length === 0) {
    container.innerHTML = '<div class="rpg-no-results">No results</div>'
    return
  }

  for (const item of items) {
    const row = document.createElement('div')
    row.className = 'rpg-result-row'

    if (cat.isOracle) {
      const range = item.min === item.max ? `${item.min}` : `${item.min}-${item.max}`
      row.innerHTML = `<span class="rpg-result-range">${range}</span><span class="rpg-result-name">${item.result || ''}</span>`
    } else {
      const tag = cat.tagField ? getNestedField(item, cat.tagField) : null
      const tagHtml = tag != null ? `<span class="rpg-result-tag">${cat.tagPrefix || ''}${tag}</span>` : ''
      row.innerHTML = `<span class="rpg-result-name">${item.name || item.index}</span>${tagHtml}`
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
    const card = document.createElement('div')
    card.className = 'rpg-card'
    card.innerHTML = config.renderCard(entry.item, entry.cat)

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
