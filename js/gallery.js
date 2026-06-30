const base = document.querySelector('meta[name="base-path"]')?.content || ''
const GALLERY_INDEX_PATH = `${base}/pieces/gallery-index.json`
const SETS_BASE = `${base}/pieces/sets`

let allSets = []
let activeFamily = 'all'

async function init() {
  const res = await fetch(GALLERY_INDEX_PATH)
  allSets = await res.json()

  buildFilters()
  renderGrid()
}

function buildFilters() {
  const families = new Map()
  for (const set of allSets) {
    const f = set.family || 'other'
    families.set(f, (families.get(f) || 0) + 1)
  }

  const bar = document.querySelector('.filter-bar')
  bar.innerHTML = ''

  const allBtn = createFilterBtn('all', 'All', allSets.length)
  allBtn.classList.add('filter-btn--active')
  bar.appendChild(allBtn)

  const sorted = [...families.entries()].sort((a, b) => b[1] - a[1])
  for (const [family, count] of sorted) {
    bar.appendChild(createFilterBtn(family, capitalise(family), count))
  }
}

function createFilterBtn(family, label, count) {
  const btn = document.createElement('button')
  btn.className = 'filter-btn'
  btn.dataset.family = family
  btn.innerHTML = `${label} <span class="filter-count">${count}</span>`
  btn.addEventListener('click', () => setFilter(family))
  return btn
}

function setFilter(family) {
  activeFamily = family
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('filter-btn--active', btn.dataset.family === family)
  })
  renderGrid()
}

function renderGrid() {
  const grid = document.getElementById('gallery-grid')
  grid.innerHTML = ''

  const filtered = activeFamily === 'all'
    ? allSets
    : allSets.filter(s => s.family === activeFamily)

  for (const set of filtered) {
    grid.appendChild(createCard(set))
  }
}

function createCard(set) {
  const card = document.createElement('div')
  card.className = 'set-card'

  const previewPieces = getPreviewPieces(set)
  const previewHtml = previewPieces.map(key => {
    const file = set.pieces[key]
    if (!file) return ''
    return `<img src="${SETS_BASE}/${set.id}/${file}" alt="${key}" loading="lazy">`
  }).join('')

  const badges = []
  if (set.playable) badges.push('<span class="set-badge set-badge--playable">playable</span>')
  if (set.recolorable) badges.push('<span class="set-badge set-badge--recolorable">recolorable</span>')

  card.innerHTML = `
    <div class="set-preview">${previewHtml}</div>
    <div class="set-info">
      <div class="set-name">${set.name}</div>
      <div class="set-meta">
        <span class="set-family">${set.family}</span>
        <span class="set-author">${set.author}</span>
        <span class="set-license">${set.license}</span>
      </div>
      ${badges.length ? `<div class="set-badges">${badges.join('')}</div>` : ''}
    </div>
  `
  return card
}

function getPreviewPieces(set) {
  const keys = Object.keys(set.pieces || {})
  if (keys.length <= 6) return keys
  const priorityPrefixes = ['wK', 'bK', 'wQ', 'bQ', 'wR', 'bR', 'wN', 'bN', 'wB', 'bB', 'wP', 'bP']
  const selected = []
  for (const p of priorityPrefixes) {
    if (keys.includes(p) && selected.length < 6) selected.push(p)
  }
  if (selected.length < 6) {
    for (const k of keys) {
      if (!selected.includes(k) && selected.length < 6) selected.push(k)
    }
  }
  return selected
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

init()
