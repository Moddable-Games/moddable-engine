const base = document.querySelector('meta[name="base-path"]')?.content || ''
const GALLERY_INDEX_PATH = `${base}/pieces/gallery-index.json`
const SETS_BASE = `${base}/pieces/sets`

let SETS = []

function getPieceCount(set) {
  if (set.pieces) return Object.keys(set.pieces).length
  return 0
}

async function init() {
  const res = await fetch(GALLERY_INDEX_PATH)
  SETS = await res.json()

  SETS.forEach(s => {
    s._svgFiles = s.pieces ? Object.values(s.pieces).sort() : []
  })

  renderIntro()
  populateFilters()
  render()
  bindControls()
}

function renderIntro() {
  const totalPieces = SETS.reduce((sum, s) => sum + getPieceCount(s), 0)
  const families = [...new Set(SETS.map(s => s.family))]
  document.getElementById('gallery-intro').textContent =
    `${totalPieces.toLocaleString()} SVGs across ${SETS.length} sets covering ${families.length} game families. Every piece available to the engine — browse by set, compare by piece type, search for any piece across all collections.`
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
    opt.textContent = `${s.name} (${getPieceCount(s)})`
    setFilter.appendChild(opt)
  })
}

function getOptions() {
  return {
    search: document.getElementById('search-input').value.trim().toLowerCase(),
    family: document.getElementById('family-filter').value,
    setId: document.getElementById('set-filter').value,
    view: document.getElementById('view-select').value,
    size: parseInt(document.getElementById('size-select').value),
    bg: document.getElementById('bg-select').value,
  }
}

function render() {
  const opts = getOptions()
  if (opts.view === 'by-piece') {
    renderByPieceType(opts)
  } else {
    renderBySet(opts)
  }
}

function renderBySet(opts) {
  const container = document.getElementById('gallery-container')
  container.innerHTML = ''

  let filtered = SETS
  if (opts.family !== 'all') filtered = filtered.filter(s => s.family === opts.family)
  if (opts.setId !== 'all') filtered = filtered.filter(s => s.id === opts.setId)

  for (const set of filtered) {
    const setMatches = opts.search && (
      set.id.toLowerCase().includes(opts.search) ||
      set.name.toLowerCase().includes(opts.search) ||
      (set.author || '').toLowerCase().includes(opts.search) ||
      set.family.toLowerCase().includes(opts.search)
    )
    let files = set._svgFiles
    if (opts.search && !setMatches) {
      files = files.filter(f => f.toLowerCase().includes(opts.search))
    }
    if (files.length === 0 && opts.search && !setMatches) continue

    const section = document.createElement('div')
    section.className = 'set-section'

    const header = document.createElement('div')
    header.className = 'set-header'
    header.innerHTML = `
      <h2 class="set-title">${set.name}</h2>
      <div class="set-meta-row">
        <span class="set-family-badge">${set.family}</span>
        <span class="set-author">${set.author}</span>
        <span class="set-license-badge">${set.license}</span>
        <span class="set-count">${getPieceCount(set)} pieces</span>
        ${set.playable ? '<span class="badge badge--playable">playable</span>' : ''}
        ${set.recolorable ? '<span class="badge badge--recolorable">recolorable</span>' : ''}
      </div>
    `
    section.appendChild(header)

    const grid = document.createElement('div')
    grid.className = 'piece-grid'
    grid.style.setProperty('--cell-size', `${opts.size + 20}px`)
    grid.style.setProperty('--piece-size', `${opts.size}px`)

    const display = files.length > 0 ? files : set._svgFiles
    for (const file of display) {
      grid.appendChild(createPieceCell(set, file, opts))
    }

    section.appendChild(grid)
    container.appendChild(section)
  }

  updateStats(filtered)
}

function renderByPieceType(opts) {
  const container = document.getElementById('gallery-container')
  container.innerHTML = ''

  let filtered = SETS
  if (opts.family !== 'all') filtered = filtered.filter(s => s.family === opts.family)

  const pieceMap = {}
  for (const set of filtered) {
    const setMatches = opts.search && (
      set.id.toLowerCase().includes(opts.search) ||
      set.name.toLowerCase().includes(opts.search) ||
      (set.author || '').toLowerCase().includes(opts.search) ||
      set.family.toLowerCase().includes(opts.search)
    )
    for (const file of set._svgFiles) {
      const name = file.replace('.svg', '')
      if (opts.search && !setMatches && !name.toLowerCase().includes(opts.search)) continue
      if (!pieceMap[name]) pieceMap[name] = []
      pieceMap[name].push({ set, file })
    }
  }

  const sorted = Object.entries(pieceMap).sort((a, b) => b[1].length - a[1].length)

  for (const [name, items] of sorted) {
    const section = document.createElement('div')
    section.className = 'set-section'

    const header = document.createElement('div')
    header.className = 'set-header'
    header.innerHTML = `<h2 class="set-title">${name} <span class="set-count">${items.length} sets</span></h2>`
    section.appendChild(header)

    const grid = document.createElement('div')
    grid.className = 'piece-grid'
    grid.style.setProperty('--cell-size', `${opts.size + 20}px`)
    grid.style.setProperty('--piece-size', `${opts.size}px`)

    for (const { set, file } of items) {
      const cell = createPieceCell(set, file, opts)
      cell.title = `${set.name} — ${file}`
      cell.querySelector('.piece-label').innerHTML = `<span class="label-set">${set.id}</span>`
      grid.appendChild(cell)
    }

    section.appendChild(grid)
    container.appendChild(section)
  }

  updateStats(filtered)
}

function createPieceCell(set, file, opts) {
  const cell = document.createElement('div')
  cell.className = `piece-cell bg-${opts.bg}`
  cell.title = file

  const img = document.createElement('img')
  img.src = `${SETS_BASE}/${set.id}/${file}`
  img.alt = file.replace('.svg', '')
  img.width = opts.size
  img.height = opts.size
  img.loading = 'lazy'
  cell.appendChild(img)

  const label = document.createElement('span')
  label.className = 'piece-label'
  label.textContent = file.replace('.svg', '')
  cell.appendChild(label)

  return cell
}

function updateStats(filtered) {
  const total = filtered.reduce((sum, s) => sum + getPieceCount(s), 0)
  const families = [...new Set(filtered.map(s => s.family))]
  document.getElementById('gallery-stats').textContent =
    `Showing ${filtered.length} sets · ${total.toLocaleString()} pieces · ${families.length} families`
}

function bindControls() {
  const ids = ['search-input', 'family-filter', 'set-filter', 'view-select', 'size-select', 'bg-select']
  for (const id of ids) {
    const el = document.getElementById(id)
    if (!el) continue
    el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => render())
  }

  document.getElementById('family-filter').addEventListener('change', () => {
    const family = document.getElementById('family-filter').value
    const setFilter = document.getElementById('set-filter')
    setFilter.innerHTML = '<option value="all">All sets</option>'
    const filtered = family === 'all' ? SETS : SETS.filter(s => s.family === family)
    for (const s of filtered) {
      const opt = document.createElement('option')
      opt.value = s.id
      opt.textContent = `${s.name} (${getPieceCount(s)})`
      setFilter.appendChild(opt)
    }
  })
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

init()
