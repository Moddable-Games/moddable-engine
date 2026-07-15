import { renderFromEngine, attachPieceImages } from '../packages/render/src/render-engine.js'
import { resolveSurface } from '../packages/schema/src/surfaces.js'
import { resolve as cascadeResolve } from '../packages/schema/src/cascade-resolver.js'

let galleryIndex = null
let placement = {}
let activePiece = null
let pieceHistory = []

async function loadGallery() {
  try { galleryIndex = await fetch('../pieces/gallery-index.json').then(r => r.json()) }
  catch { galleryIndex = [] }
}

function getTopoType() { return document.getElementById('topo-type').value }

function buildResolved() {
  const type = getTopoType()
  const surfaceRef = document.getElementById('surface-select').value
  const surface = resolveSurface(surfaceRef)
  const labels = document.getElementById('labels-select').value === 'true'

  const topology = { type }
  const render = { labels }

  if (type === 'grid') {
    topology.rows = parseInt(document.getElementById('grid-rows').value) || 8
    topology.cols = parseInt(document.getElementById('grid-cols').value) || 8
    render.cellColor = document.getElementById('cellcolor-select').value
  } else if (type === 'hex') {
    topology.radius = parseInt(document.getElementById('hex-radius').value) || 5
  } else if (type === 'graph') {
    topology.structure = document.getElementById('graph-structure').value
    topology.params = { rings: parseInt(document.getElementById('graph-rings').value) || 3 }
  } else if (type === 'track') {
    topology.positions = parseInt(document.getElementById('track-positions').value) || 24
    render.trackStyle = 'triangular-points'
  } else if (type === 'pit') {
    topology.cols = parseInt(document.getElementById('pit-cols').value) || 6
  }

  const pieceSetId = document.getElementById('pieceset-select').value
  const pieces = pieceSetId ? { set: pieceSetId } : undefined
  const setup = Object.keys(placement).length > 0 ? buildFen() : undefined

  const variantEngine = { topology, surface: surfaceRef, render }
  if (setup) variantEngine.setup = setup
  if (pieces) variantEngine.pieces = pieces

  const { resolved } = cascadeResolve({
    surface,
    family: { engine: {}, meta: { label: '' } },
    variant: { engine: variantEngine, meta: { label: 'Custom Variant' } },
  })

  return resolved
}

function buildFen() {
  const type = getTopoType()
  if (type === 'grid') {
    const rows = parseInt(document.getElementById('grid-rows').value) || 8
    const cols = parseInt(document.getElementById('grid-cols').value) || 8
    const fenRows = []
    for (let r = 0; r < rows; r++) {
      let row = ''
      let empty = 0
      for (let c = 0; c < cols; c++) {
        const key = `${r},${c}`
        if (placement[key]) {
          if (empty > 0) { row += empty; empty = 0 }
          row += placement[key]
        } else {
          empty++
        }
      }
      if (empty > 0) row += empty
      fenRows.push(row)
    }
    return fenRows.join('/')
  }
  if (type === 'hex') {
    return Object.entries(placement).map(([k, v]) => `${k}:${v}`).join(',')
  }
  return JSON.stringify(placement)
}

function render() {
  const resolved = buildResolved()
  const container = document.getElementById('board-svg')

  let opts = {}
  if (resolved.pieces?.set && galleryIndex) {
    const result = attachPieceImages(resolved, galleryIndex)
    opts.pieceImages = result.images || {}
    opts.pieceSurfaceMap = result.surfaceMap || {}
    opts.pieceSurface = result.surface || null
  }

  const svg = renderFromEngine(resolved, opts)
  if (svg) {
    container.innerHTML = svg
    bindCellClick()
  } else {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Cannot render this configuration</div>'
  }
}

function bindCellClick() {
  const container = document.getElementById('board-svg')
  container.querySelectorAll('.board-cell').forEach(cell => {
    cell.style.cursor = activePiece ? 'crosshair' : 'default'
    cell.addEventListener('click', () => {
      if (!activePiece) return
      const sq = cell.dataset.sq
      if (!sq) return
      pieceHistory.push({ sq, prev: placement[sq] || null })
      if (placement[sq] === activePiece) {
        delete placement[sq]
      } else {
        placement[sq] = activePiece
      }
      render()
      updateInfoText()
    })
  })
}

function updateInfoText() {
  const count = Object.keys(placement).length
  const text = count > 0
    ? `${count} piece${count !== 1 ? 's' : ''} placed` + (activePiece ? ` · Placing: ${activePiece}` : '')
    : 'Configure board and click cells to place pieces'
  document.getElementById('info-text').textContent = text
}

function populatePieceSets() {
  const select = document.getElementById('pieceset-select')
  if (!galleryIndex || !galleryIndex.length) return
  const families = [...new Set(galleryIndex.map(s => s.family))].sort()
  for (const fam of families) {
    const sets = galleryIndex.filter(s => s.family === fam)
    const group = document.createElement('optgroup')
    group.label = fam.replace(/-/g, ' ')
    for (const s of sets) {
      const opt = document.createElement('option')
      opt.value = s.id
      opt.textContent = s.name || s.id
      group.appendChild(opt)
    }
    select.appendChild(group)
  }
}

function buildPiecePicker() {
  const setId = document.getElementById('pieceset-select').value
  const palette = document.getElementById('piece-palette')
  const picker = document.getElementById('piece-picker')
  if (!setId) { palette.style.display = 'none'; activePiece = null; return }
  palette.style.display = ''

  const setDef = galleryIndex?.find(s => s.id === setId)
  if (!setDef || !setDef.pieces) { picker.innerHTML = ''; return }

  picker.innerHTML = ''
  const pieces = Object.entries(setDef.pieces)
  for (const [fenChar, filename] of pieces) {
    const btn = document.createElement('button')
    btn.className = 'piece-btn' + (activePiece === fenChar ? ' active' : '')
    btn.title = fenChar
    btn.textContent = fenChar
    btn.addEventListener('click', () => {
      activePiece = activePiece === fenChar ? null : fenChar
      buildPiecePicker()
      updateInfoText()
      bindCellClick()
    })
    picker.appendChild(btn)
  }
  document.getElementById('active-piece-label').textContent = activePiece ? `(${activePiece})` : ''
}

function exportYaml() {
  const type = getTopoType()
  const surface = document.getElementById('surface-select').value
  const labels = document.getElementById('labels-select').value === 'true'
  const pieceSet = document.getElementById('pieceset-select').value

  let lines = ['---', 'title: Custom Variant', 'engine:']
  lines.push('  topology:')
  lines.push(`    type: ${type}`)

  if (type === 'grid') {
    lines.push(`    rows: ${document.getElementById('grid-rows').value}`)
    lines.push(`    cols: ${document.getElementById('grid-cols').value}`)
  } else if (type === 'hex') {
    lines.push(`    radius: ${document.getElementById('hex-radius').value}`)
  } else if (type === 'graph') {
    lines.push(`    structure: ${document.getElementById('graph-structure').value}`)
    lines.push(`    params:`)
    lines.push(`      rings: ${document.getElementById('graph-rings').value}`)
  } else if (type === 'track') {
    lines.push(`    positions: ${document.getElementById('track-positions').value}`)
  } else if (type === 'pit') {
    lines.push(`    cols: ${document.getElementById('pit-cols').value}`)
  }

  lines.push(`  surface: ${surface}`)
  lines.push('  render:')
  if (type === 'grid') {
    lines.push(`    cellColor: ${document.getElementById('cellcolor-select').value}`)
  }
  if (labels) lines.push('    labels: true')

  if (pieceSet) lines.push(`  pieces:\n    set: ${pieceSet}`)

  const fen = buildFen()
  if (fen && Object.keys(placement).length > 0) {
    lines.push(`  setup: "${fen}"`)
  }

  lines.push('---')

  const yaml = lines.join('\n')
  const blob = new Blob([yaml], { type: 'text/yaml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'variant.md'
  a.click()
  URL.revokeObjectURL(url)
}

function exportSvg() {
  const container = document.getElementById('board-svg')
  const svg = container.querySelector('svg')
  if (!svg) return
  const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'board.svg'
  a.click()
  URL.revokeObjectURL(url)
}

function showTopoOpts() {
  const type = getTopoType()
  document.getElementById('grid-opts').style.display = type === 'grid' ? '' : 'none'
  document.getElementById('hex-opts').style.display = type === 'hex' ? '' : 'none'
  document.getElementById('graph-opts').style.display = type === 'graph' ? '' : 'none'
  document.getElementById('track-opts').style.display = type === 'track' ? '' : 'none'
  document.getElementById('pit-opts').style.display = type === 'pit' ? '' : 'none'
  document.getElementById('cellcolor-group').style.display = type === 'grid' ? '' : 'none'
}

function undo() {
  const last = pieceHistory.pop()
  if (!last) return
  if (last.prev) placement[last.sq] = last.prev
  else delete placement[last.sq]
  render()
  updateInfoText()
}

async function init() {
  await loadGallery()
  populatePieceSets()
  showTopoOpts()
  render()

  document.getElementById('topo-type').addEventListener('change', () => {
    placement = {}; pieceHistory = []
    showTopoOpts(); render(); updateInfoText()
  })

  const rerenderInputs = ['grid-rows', 'grid-cols', 'hex-radius', 'graph-structure',
    'graph-rings', 'track-positions', 'pit-cols', 'surface-select', 'cellcolor-select', 'labels-select']
  for (const id of rerenderInputs) {
    const el = document.getElementById(id)
    if (el) el.addEventListener('change', render)
  }

  document.getElementById('pieceset-select').addEventListener('change', () => {
    buildPiecePicker(); render()
  })
  document.getElementById('export-yaml-btn').addEventListener('click', exportYaml)
  document.getElementById('export-svg-btn').addEventListener('click', exportSvg)
  document.getElementById('bar-undo-btn').addEventListener('click', undo)
  document.getElementById('clear-pieces-btn').addEventListener('click', () => {
    placement = {}; pieceHistory = []; render(); updateInfoText()
  })
}

init()
