const base = document.querySelector('meta[name="base-path"]')?.content || ''
const TILE_INDEX_PATH = `${base}/tiles/tile-index.json`
const SETS_BASE = `${base}/tiles/sets`

let SETS = []

function getTileCount(set) {
  return set.tiles ? Object.keys(set.tiles).length : 0
}

async function init() {
  const res = await fetch(TILE_INDEX_PATH)
  SETS = await res.json()
  renderIntro()
  populateFilters()
  render()
  bindControls()
}

function renderIntro() {
  const totalTiles = SETS.reduce((sum, s) => sum + getTileCount(s), 0)
  const families = [...new Set(SETS.map(s => s.family))]
  const shapes = [...new Set(SETS.map(s => s.shape))]
  document.getElementById('gallery-intro').textContent =
    `${totalTiles} tiles across ${SETS.length} sets in ${shapes.length} shapes. Hex terrain, mahjong faces, star systems, and more. Browse by set, filter by shape or family.`
}

function populateFilters() {
  const familyFilter = document.getElementById('family-filter')
  const setFilter = document.getElementById('set-filter')
  const families = [...new Set(SETS.map(s => s.family))].sort()

  families.forEach(f => {
    const count = SETS.filter(s => s.family === f).length
    const opt = document.createElement('option')
    opt.value = f
    opt.textContent = `${capitalise(f)} (${count})`
    familyFilter.appendChild(opt)
  })

  SETS.forEach(s => {
    const opt = document.createElement('option')
    opt.value = s.id
    opt.textContent = `${s.name} (${getTileCount(s)})`
    setFilter.appendChild(opt)
  })
}

function bindControls() {
  document.getElementById('search-input').addEventListener('input', render)
  document.getElementById('shape-filter').addEventListener('change', render)
  document.getElementById('family-filter').addEventListener('change', render)
  document.getElementById('format-filter').addEventListener('change', render)
  document.getElementById('set-filter').addEventListener('change', render)
  document.getElementById('bg-select').addEventListener('change', render)
  document.getElementById('size-select').addEventListener('change', onSizeChange)
}

function onSizeChange() {
  const size = document.getElementById('size-select').value
  document.documentElement.style.setProperty('--piece-size', size + 'px')
  document.documentElement.style.setProperty('--cell-size', (parseInt(size) + 24) + 'px')
}

function getFiltered() {
  const search = document.getElementById('search-input').value.toLowerCase().trim()
  const shape = document.getElementById('shape-filter').value
  const family = document.getElementById('family-filter').value
  const setId = document.getElementById('set-filter').value
  const format = document.getElementById('format-filter').value

  return SETS.filter(s => {
    if (shape !== 'all' && s.shape !== shape) return false
    if (family !== 'all' && s.family !== family) return false
    if (format !== 'all' && s.format !== format) return false
    if (setId !== 'all' && s.id !== setId) return false
    if (search) {
      const inName = s.name.toLowerCase().includes(search)
      const inFamily = s.family.toLowerCase().includes(search)
      const inTiles = Object.keys(s.tiles).some(k => k.toLowerCase().includes(search))
      if (!inName && !inFamily && !inTiles) return false
    }
    return true
  })
}

function render() {
  const filtered = getFiltered()
  const container = document.getElementById('gallery-container')
  const search = document.getElementById('search-input').value.toLowerCase().trim()
  const bg = document.getElementById('bg-select').value

  let totalShown = 0
  let html = ''

  filtered.forEach(set => {
    let tileEntries = Object.entries(set.tiles)
    if (search) {
      tileEntries = tileEntries.filter(([key]) => key.toLowerCase().includes(search))
    }
    if (tileEntries.length === 0 && search) return

    totalShown += tileEntries.length

    html += `<div class="set-section">`
    html += `<div class="set-header">`
    html += `<div class="set-title">${set.name}</div>`
    html += `<div class="set-meta-row">`
    html += `<span class="set-family-badge">${set.family}</span>`
    html += `<span class="set-family-badge">${set.shape}</span>`
    html += `<span class="badge badge--format">${set.format.toUpperCase()}</span>`
    if (set.license) html += `<span class="set-license-badge">${set.license}</span>`
    html += `<span class="set-count">${tileEntries.length} tiles</span>`
    if (set.orientation) html += `<span class="badge">${set.orientation}</span>`
    html += `</div></div>`

    html += `<div class="piece-grid">`
    tileEntries.forEach(([key, file]) => {
      const src = `${SETS_BASE}/${set.id}/${file}`
      html += `<div class="piece-cell bg-${bg} shape-${set.shape}">`
      html += `<img src="${src}" alt="${key}" loading="lazy">`
      html += `<span class="piece-label">${key}</span>`
      html += `</div>`
    })
    html += `</div></div>`
  })

  container.innerHTML = html
  document.getElementById('gallery-stats').textContent =
    `${filtered.length} sets · ${totalShown} tiles shown`
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

document.addEventListener('DOMContentLoaded', init)
