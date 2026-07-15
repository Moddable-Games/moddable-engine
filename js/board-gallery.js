const base = document.querySelector('meta[name="base-path"]')?.content || ''
const INDEX_PATH = `${base}/boards/board-index.json`

let BOARDS = []
let state = { search: '', family: 'all', topology: 'all', size: 240 }

async function init() {
  const res = await fetch(INDEX_PATH)
  BOARDS = await res.json()
  renderIntro()
  populateFilters()
  render()
  bindControls()
}

function renderIntro() {
  const families = [...new Set(BOARDS.map(b => b.family))]
  const topos = [...new Set(BOARDS.map(b => b.topology))]
  document.getElementById('gallery-intro').textContent =
    `${BOARDS.length} board diagrams across ${families.length} game families and ${topos.length} topology types. Browse, search, and download any board as SVG or PNG.`
}

function populateFilters() {
  const familyFilter = document.getElementById('family-filter')
  const families = [...new Set(BOARDS.map(b => b.family))].sort()
  for (const f of families) {
    const count = BOARDS.filter(b => b.family === f).length
    const opt = document.createElement('option')
    opt.value = f
    opt.textContent = `${f.replace(/-/g, ' ')} (${count})`
    familyFilter.appendChild(opt)
  }
}

function getFiltered() {
  return BOARDS.filter(b => {
    if (state.family !== 'all' && b.family !== state.family) return false
    if (state.topology !== 'all' && b.topology !== state.topology) return false
    if (state.search) {
      const q = state.search.toLowerCase()
      const haystack = `${b.family} ${b.variant} ${b.familyTitle} ${b.variantTitle} ${b.topology}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

function render() {
  const container = document.getElementById('gallery-container')
  const filtered = getFiltered()
  const stats = document.getElementById('gallery-stats')
  stats.textContent = `Showing ${filtered.length} of ${BOARDS.length} boards`

  if (filtered.length === 0) {
    container.innerHTML = '<div class="gallery-empty">No boards match your filters</div>'
    return
  }

  const size = state.size
  const cards = filtered.map(b => {
    const title = b.variantTitle || b.variant
    const family = b.familyTitle || b.family
    return `<div class="board-card" data-family="${b.family}" data-variant="${b.variant}">
      <div class="board-card-preview" style="width:${size}px;height:${size}px">
        <img src="${b.svg}" alt="${family} — ${title}" loading="lazy">
      </div>
      <div class="board-card-info">
        <span class="board-card-title">${title}</span>
        <span class="board-card-family">${family}</span>
        <span class="board-card-topo">${b.topology}</span>
      </div>
      <div class="board-card-actions">
        <button class="btn-icon" data-action="svg" title="Download SVG">SVG</button>
        <button class="btn-icon" data-action="png" title="Download PNG">PNG</button>
      </div>
    </div>`
  })

  container.innerHTML = `<div class="board-grid">${cards.join('')}</div>`
}

function bindControls() {
  document.getElementById('search-input').addEventListener('input', e => {
    state.search = e.target.value
    render()
  })
  document.getElementById('family-filter').addEventListener('change', e => {
    state.family = e.target.value
    render()
  })
  document.getElementById('topology-filter').addEventListener('change', e => {
    state.topology = e.target.value
    render()
  })
  document.getElementById('size-select').addEventListener('change', e => {
    state.size = parseInt(e.target.value)
    render()
  })

  document.getElementById('gallery-container').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    const card = btn.closest('.board-card')
    const family = card.dataset.family
    const variant = card.dataset.variant
    const board = BOARDS.find(b => b.family === family && b.variant === variant)
    if (!board) return

    if (btn.dataset.action === 'svg') downloadSvg(board)
    if (btn.dataset.action === 'png') downloadPng(board)
  })
}

async function downloadSvg(board) {
  const res = await fetch(board.svg)
  const svg = await res.text()
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${board.family}-${board.variant}.svg`
  a.click()
  URL.revokeObjectURL(url)
}

async function downloadPng(board) {
  const res = await fetch(board.svg)
  const svgText = await res.text()

  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')
  const svgEl = doc.documentElement
  const w = parseFloat(svgEl.getAttribute('width')) || 400
  const h = parseFloat(svgEl.getAttribute('height')) || 400
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = w * scale
  canvas.height = h * scale
  const ctx = canvas.getContext('2d')

  const img = new Image()
  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${board.family}-${board.variant}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
  img.src = URL.createObjectURL(blob)
}

document.addEventListener('DOMContentLoaded', init)
