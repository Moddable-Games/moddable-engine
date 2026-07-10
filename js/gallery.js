import { createSurfaceDOM, getSurfaceRatios } from './piece-surface.js'

const base = document.querySelector('meta[name="base-path"]')?.content || ''
const GALLERY_INDEX_PATH = `${base}/pieces/gallery-index.json`
const SETS_BASE = `${base}/pieces/sets`

let SETS = []

let SETS_MAP = {}

function resolvePieceFiles(set) {
  const files = []
  const pieces = set.pieces || {}
  const sourceId = set.virtual && set.baseSet ? set.baseSet : set.id

  if (set.extends && SETS_MAP[set.extends]) {
    const base = SETS_MAP[set.extends]
    for (const [key, val] of Object.entries(base.pieces || {})) {
      const file = typeof val === 'string' ? val : val.file
      files.push({ key, file, setId: base.id })
    }
  }

  for (const [key, val] of Object.entries(pieces)) {
    if (typeof val === 'string') {
      files.push({ key, file: val, setId: sourceId })
    } else if (val.source && val.file) {
      files.push({ key, file: val.file, setId: val.source, surface: val.surface || null })
    }
  }

  files.sort((a, b) => a.key.localeCompare(b.key))
  return files
}

function getPieceCount(set) {
  let count = set.pieces ? Object.keys(set.pieces).length : 0
  if (set.extends && SETS_MAP[set.extends]) {
    count += Object.keys(SETS_MAP[set.extends].pieces || {}).length
  }
  return count
}

async function init() {
  const res = await fetch(GALLERY_INDEX_PATH)
  SETS = await res.json()

  SETS.forEach(s => { SETS_MAP[s.id] = s })

  SETS.forEach(s => {
    s._svgFiles = resolvePieceFiles(s)
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
      files = files.filter(f => {
        const name = typeof f === 'string' ? f : (f.key || f.file)
        return name.toLowerCase().includes(opts.search)
      })
    }
    if (files.length === 0 && opts.search && !setMatches) continue

    const section = document.createElement('div')
    section.className = 'set-section'

    const header = document.createElement('div')
    header.className = 'set-header'
    header.innerHTML = `
      <h2 class="set-title">${set.name}${set.virtual ? ' <span class="badge badge--virtual">virtual</span>' : ''}</h2>
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
    for (const entry of display) {
      grid.appendChild(createPieceCell(set, entry, opts))
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
    for (const entry of set._svgFiles) {
      const name = typeof entry === 'string' ? entry.replace('.svg', '') : (entry.key || entry.file.replace('.svg', ''))
      if (opts.search && !setMatches && !name.toLowerCase().includes(opts.search)) continue
      if (!pieceMap[name]) pieceMap[name] = []
      pieceMap[name].push({ set, entry })
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

    for (const { set, entry } of items) {
      const cell = createPieceCell(set, entry, opts)
      cell.title = `${set.name} — ${name}`
      cell.querySelector('.piece-label').innerHTML = `<span class="label-set">${set.id}</span>`
      grid.appendChild(cell)
    }

    section.appendChild(grid)
    container.appendChild(section)
  }

  updateStats(filtered)
}

const recolourCache = {}

function getOwnerFromKey(key, owners) {
  const prefix = key[0]
  const map = { r: 'red', b: 'blue', y: 'yellow', g: 'green', w: 'white' }
  return owners[map[prefix]] || null
}

function createPieceCell(set, entry, opts) {
  let file, sourceSetId, key, surface
  if (typeof entry === 'string') {
    file = entry
    sourceSetId = set.id
    key = file.replace('.svg', '')
    surface = null
  } else {
    file = entry.file
    sourceSetId = entry.setId || set.id
    key = entry.key || file.replace('.svg', '')
    surface = entry.surface || null
  }

  const cell = document.createElement('div')
  cell.className = `piece-cell bg-${opts.bg}`
  cell.title = `${key} (${sourceSetId}/${file})`

  const img = document.createElement('img')
  img.alt = key
  img.loading = 'lazy'

  if (set.virtual && set.recolorable && set.owners) {
    const ownerColors = getOwnerFromKey(key, set.owners)
    if (ownerColors) {
      const matchColor = set.recolourMatch || '#fff'
      const cacheKey = `${sourceSetId}/${file}:${ownerColors.fill}`
      if (recolourCache[cacheKey]) {
        img.src = recolourCache[cacheKey]
      } else {
        img.src = ''
        fetch(`${SETS_BASE}/${sourceSetId}/${file}`)
          .then(r => r.text())
          .then(svg => {
            const tinted = svg.replaceAll(matchColor, ownerColors.fill)
            const dataUri = 'data:image/svg+xml,' + encodeURIComponent(tinted)
            recolourCache[cacheKey] = dataUri
            img.src = dataUri
          })
          .catch(() => { img.src = `${SETS_BASE}/${sourceSetId}/${file}` })
      }
    } else {
      img.src = `${SETS_BASE}/${sourceSetId}/${file}`
    }
  } else {
    img.src = `${SETS_BASE}/${sourceSetId}/${file}`
  }

  if (surface === 'disc' && set.surface) {
    const hasColorPrefix = /^[wb][A-Z]/.test(key)
    const owner = hasColorPrefix ? (key[0] === 'w' ? 'white' : 'black') : 'white'
    const colours = set.surface.owners?.[owner] || { fill: '#ccc', stroke: '#888' }
    cell.classList.add('has-surface')

    const result = createSurfaceDOM('disc', opts.size, colours)
    result.wrap.appendChild(img)
    cell.appendChild(result.wrap)
  } else {
    img.width = opts.size
    img.height = opts.size
    cell.appendChild(img)
  }

  const label = document.createElement('span')
  label.className = 'piece-label'
  label.textContent = key
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
