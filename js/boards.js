import { createGridTopology } from '../packages/topology-grid/index.js'
import { createHexTopology } from '../packages/topology-hex/index.js'
import { createTrackTopology } from '../packages/topology-track/index.js'
import { createPitTopology } from '../packages/topology-pit/index.js'
import { createGraphTopology } from '../packages/topology-graph/index.js'
import { createBoardRenderer } from '../packages/render/index.js'
import { createRng } from '../packages/core/src/rng.js'

const renderer = createBoardRenderer({ padding: 24 })

const PRESETS = {
  grid: [
    { id: 'chess', label: 'Chess (8×8)', config: { rows: 8, cols: 8 } },
    { id: 'go-19', label: 'Go (19×19)', config: { rows: 19, cols: 19 } },
    { id: 'go-13', label: 'Go (13×13)', config: { rows: 13, cols: 13 } },
    { id: 'go-9', label: 'Go (9×9)', config: { rows: 9, cols: 9 } },
    { id: 'draughts', label: 'Draughts (10×10)', config: { rows: 10, cols: 10 } },
    { id: 'reversi', label: 'Reversi (8×8)', config: { rows: 8, cols: 8 } },
    { id: 'xiangqi', label: 'Xiangqi (10×9)', config: { rows: 10, cols: 9 } },
    { id: 'shogi', label: 'Shogi (9×9)', config: { rows: 9, cols: 9 } },
  ],
  hex: [
    { id: 'hex-11', label: 'Hex (11)', config: { size: 11, shape: 'rhombus' } },
    { id: 'hex-7', label: 'Hex (7)', config: { size: 7, shape: 'rhombus' } },
    { id: 'glinski', label: 'Glinski (radius 6)', config: { radius: 6, shape: 'hexagonal' } },
    { id: 'nukes-3', label: 'Nukes (3 rings)', config: { radius: 3, shape: 'hexagonal' } },
    { id: 'nukes-6', label: 'Nukes (6 rings)', config: { radius: 6, shape: 'hexagonal' } },
  ],
  track: [
    { id: 'track-24', label: 'Backgammon (24)', config: { length: 24, circuit: false } },
    { id: 'track-40', label: 'Pachisi (40)', config: { length: 40, circuit: true } },
    { id: 'track-68', label: 'Chaupar (68)', config: { length: 68, circuit: true } },
  ],
  pit: [
    { id: 'kalah-6', label: 'Kalah (6 pits)', config: { pits: 6 } },
    { id: 'kalah-4', label: 'Kalah (4 pits)', config: { pits: 4 } },
    { id: 'oware', label: 'Oware (6 pits)', config: { pits: 6 } },
  ],
  graph: [
    { id: 'morris-9', label: 'Nine Men\'s Morris', config: { variant: 'nine-mens' } },
    { id: 'morris-6', label: 'Six Men\'s Morris', config: { variant: 'six-mens' } },
  ],
}

const THEMES = {
  classic: {
    background: { fill: '#f5e6c8' },
    cells: {
      default: { fill: '#e8dcc8', stroke: '#8b7355', 'stroke-width': '1' },
      light: { fill: '#f0d9b5', stroke: 'none' },
      dark: { fill: '#b58863', stroke: 'none' },
      uniform: { fill: '#dcb35c', stroke: '#b8952e', 'stroke-width': '0.5' },
      pit: { fill: '#4E3320', stroke: '#3A2515', 'stroke-width': '1.5' },
      store: { fill: '#4E3320', stroke: '#3A2515', 'stroke-width': '1.5' },
      node: { fill: '#4a3520', stroke: 'none' },
    },
    lines: { stroke: '#4a3520', 'stroke-width': '2.5' },
    annotations: { default: { fill: '#4a3520', r: '3' } },
  },
  midnight: {
    background: { fill: '#1a1a2e' },
    cells: {
      default: { fill: '#16213e', stroke: '#4a6fa5', 'stroke-width': '1' },
      light: { fill: '#1e2a4a', stroke: 'none' },
      dark: { fill: '#0f1630', stroke: 'none' },
      uniform: { fill: '#16213e', stroke: '#4a6fa5', 'stroke-width': '0.5' },
      pit: { fill: '#0d0d3a', stroke: '#4a6fa5', 'stroke-width': '1.5' },
      store: { fill: '#0d0d3a', stroke: '#4a6fa5', 'stroke-width': '1.5' },
      node: { fill: '#6fb5ff', stroke: 'none' },
    },
    lines: { stroke: '#6fb5ff', 'stroke-width': '2.5' },
    annotations: { default: { fill: '#6fb5ff', r: '3' } },
  },
  parchment: {
    background: { fill: '#faf3e0' },
    cells: {
      default: { fill: '#f0e6c8', stroke: '#a0855b', 'stroke-width': '1' },
      light: { fill: '#faf3e0', stroke: 'none' },
      dark: { fill: '#d4a56a', stroke: 'none' },
      uniform: { fill: '#f0e6c8', stroke: '#a0855b', 'stroke-width': '0.5' },
      pit: { fill: '#5c3d20', stroke: '#3a2815', 'stroke-width': '1.5' },
      store: { fill: '#5c3d20', stroke: '#3a2815', 'stroke-width': '1.5' },
      node: { fill: '#5c4033', stroke: 'none' },
    },
    lines: { stroke: '#5c4033', 'stroke-width': '2.5' },
    annotations: { default: { fill: '#5c4033', r: '3' } },
  },
  wood: {
    background: { fill: '#c8a46e' },
    cells: {
      default: { fill: '#deb887', stroke: '#a0794a', 'stroke-width': '1' },
      light: { fill: '#deb887', stroke: 'none' },
      dark: { fill: '#8b6914', stroke: 'none' },
      uniform: { fill: '#c8a46e', stroke: '#8b6914', 'stroke-width': '0.5' },
      pit: { fill: '#3a2510', stroke: '#2d1f0a', 'stroke-width': '1.5' },
      store: { fill: '#3a2510', stroke: '#2d1f0a', 'stroke-width': '1.5' },
      node: { fill: '#4a3512', stroke: 'none' },
    },
    lines: { stroke: '#4a3512', 'stroke-width': '2.5' },
    annotations: { default: { fill: '#4a3512', r: '3' } },
  },
  green: {
    background: { fill: '#2d5a27' },
    cells: {
      default: { fill: '#3d7a37', stroke: '#1e4a18', 'stroke-width': '1' },
      light: { fill: '#4a8a42', stroke: 'none' },
      dark: { fill: '#2d5a27', stroke: 'none' },
      uniform: { fill: '#3d7a37', stroke: '#1e4a18', 'stroke-width': '0.5' },
      pit: { fill: '#0f2a0c', stroke: '#051505', 'stroke-width': '1.5' },
      store: { fill: '#0f2a0c', stroke: '#051505', 'stroke-width': '1.5' },
      node: { fill: '#c8e6c0', stroke: 'none' },
    },
    lines: { stroke: '#143d10', 'stroke-width': '2.5' },
    annotations: { default: { fill: '#c8e6c0', r: '3' } },
  },
}

let state = {
  topology: 'grid',
  preset: 'chess',
  config: { rows: 8, cols: 8 },
  theme: 'classic',
  labels: 'algebraic',
  seed: Date.now(),
  board: null,
  svg: '',
}

function init() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('topology')) state.topology = params.get('topology')
  if (params.get('preset')) state.preset = params.get('preset')
  if (params.get('seed')) state.seed = parseInt(params.get('seed')) || Date.now()
  if (params.get('theme')) state.theme = params.get('theme')

  bindControls()
  updatePresets()
  updateTopologyOptions()
  generate()
}

function bindControls() {
  document.getElementById('topology-select').addEventListener('change', onTopologyChange)
  document.getElementById('preset-select').addEventListener('change', onPresetChange)
  document.getElementById('theme-select').addEventListener('change', onThemeChange)
  document.getElementById('labels-select').addEventListener('change', onLabelsChange)
  document.getElementById('generate-btn').addEventListener('click', onGenerate)

  document.getElementById('export-svg-btn').addEventListener('click', exportSvg)
  document.getElementById('export-png-btn').addEventListener('click', exportPng)
  document.getElementById('export-json-btn').addEventListener('click', exportJson)
  document.getElementById('import-btn').addEventListener('click', importBoard)
  document.getElementById('copy-btn').addEventListener('click', copyToClipboard)

  document.getElementById('zoom-in-btn').addEventListener('click', () => zoom(1.2))
  document.getElementById('zoom-out-btn').addEventListener('click', () => zoom(0.8))
  document.getElementById('fit-btn').addEventListener('click', fitToView)

  setupSidebarTabs()
}

function setupSidebarTabs() {
  const tabs = document.querySelectorAll('.sidebar-tab')
  const panels = document.querySelectorAll('.sidebar-panel')
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      panels.forEach(p => p.classList.remove('active'))
      tab.classList.add('active')
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active')
    })
  })
}

function onTopologyChange(e) {
  state.topology = e.target.value
  state.preset = 'custom'
  updatePresets()
  updateTopologyOptions()
  generate()
  updateUrl()
}

function onPresetChange(e) {
  state.preset = e.target.value
  if (state.preset !== 'custom') {
    const preset = PRESETS[state.topology].find(p => p.id === state.preset)
    if (preset) state.config = { ...preset.config }
    syncOptionsFromConfig()
  }
  generate()
  updateUrl()
}

function onThemeChange(e) {
  state.theme = e.target.value
  generate()
  updateUrl()
}

function onLabelsChange(e) {
  state.labels = e.target.value
  generate()
}

function onGenerate() {
  state.seed = Date.now()
  const seedInput = document.querySelector('#topology-options input[data-field="seed"]')
  if (seedInput) seedInput.value = state.seed
  generate()
  updateUrl()
}

function updatePresets() {
  const select = document.getElementById('preset-select')
  select.innerHTML = '<option value="custom">Custom</option>'
  const presets = PRESETS[state.topology] || []
  presets.forEach(p => {
    const opt = document.createElement('option')
    opt.value = p.id
    opt.textContent = p.label
    select.appendChild(opt)
  })
  select.value = state.preset
}

function updateTopologyOptions() {
  const container = document.getElementById('topology-options')
  container.innerHTML = ''

  switch (state.topology) {
    case 'grid':
      container.innerHTML = gridOptions()
      state.config = state.config.rows ? state.config : { rows: 8, cols: 8 }
      break
    case 'hex':
      container.innerHTML = hexOptions()
      if (!state.config.radius && !state.config.size) state.config = { radius: 6, shape: 'hexagonal' }
      break
    case 'track':
      container.innerHTML = trackOptions()
      state.config = state.config.length ? state.config : { length: 24, circuit: false }
      break
    case 'pit':
      container.innerHTML = pitOptions()
      state.config = state.config.pits ? state.config : { pits: 6 }
      break
    case 'graph':
      container.innerHTML = graphOptions()
      state.config = state.config.variant ? state.config : { variant: 'nine-mens' }
      break
  }

  container.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('change', onConfigChange)
  })
}

function gridOptions() {
  const { rows = 8, cols = 8 } = state.config
  return `
    <div class="control-row">
      <div class="control-group">
        <label class="control-label">Rows</label>
        <input type="number" min="1" max="26" value="${rows}" data-field="rows">
      </div>
      <div class="control-group">
        <label class="control-label">Cols</label>
        <input type="number" min="1" max="26" value="${cols}" data-field="cols">
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Seed</label>
      <input type="number" value="${state.seed}" data-field="seed">
    </div>`
}

function hexOptions() {
  const { radius = 6, size = 7, shape = 'hexagonal' } = state.config
  const sizeVal = shape === 'rhombus' ? size : radius
  const sizeField = shape === 'rhombus' ? 'size' : 'radius'
  const sizeLabel = shape === 'rhombus' ? 'Size' : 'Radius'
  return `
    <div class="control-row">
      <div class="control-group">
        <label class="control-label">${sizeLabel}</label>
        <input type="number" min="1" max="20" value="${sizeVal}" data-field="${sizeField}">
      </div>
      <div class="control-group">
        <label class="control-label">Shape</label>
        <select data-field="shape">
          <option value="hexagonal" ${shape === 'hexagonal' ? 'selected' : ''}>Hexagonal</option>
          <option value="rhombus" ${shape === 'rhombus' ? 'selected' : ''}>Rhombus</option>
        </select>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Seed</label>
      <input type="number" value="${state.seed}" data-field="seed">
    </div>`
}

function trackOptions() {
  const { length = 24, circuit = false } = state.config
  return `
    <div class="control-row">
      <div class="control-group">
        <label class="control-label">Length</label>
        <input type="number" min="4" max="100" value="${length}" data-field="length">
      </div>
      <div class="control-group">
        <label class="control-label">Circuit</label>
        <select data-field="circuit">
          <option value="false" ${!circuit ? 'selected' : ''}>Linear</option>
          <option value="true" ${circuit ? 'selected' : ''}>Circuit</option>
        </select>
      </div>
    </div>
    <div class="control-group">
      <label class="control-label">Seed</label>
      <input type="number" value="${state.seed}" data-field="seed">
    </div>`
}

function pitOptions() {
  const { pits = 6 } = state.config
  return `
    <div class="control-group">
      <label class="control-label">Pits per side</label>
      <input type="number" min="3" max="12" value="${pits}" data-field="pits">
    </div>
    <div class="control-group">
      <label class="control-label">Seed</label>
      <input type="number" value="${state.seed}" data-field="seed">
    </div>`
}

function graphOptions() {
  const { variant = 'nine-mens' } = state.config
  return `
    <div class="control-group">
      <label class="control-label">Variant</label>
      <select data-field="variant">
        <option value="nine-mens" ${variant === 'nine-mens' ? 'selected' : ''}>Nine Men's Morris</option>
        <option value="six-mens" ${variant === 'six-mens' ? 'selected' : ''}>Six Men's Morris</option>
      </select>
    </div>
    <div class="control-group">
      <label class="control-label">Seed</label>
      <input type="number" value="${state.seed}" data-field="seed">
    </div>`
}

function onConfigChange(e) {
  const field = e.target.dataset.field
  let value = e.target.value
  if (e.target.type === 'number') value = parseInt(value) || 0
  if (value === 'true') value = true
  if (value === 'false') value = false

  if (field === 'seed') {
    state.seed = value
  } else {
    state.config[field] = value
    state.preset = 'custom'
    document.getElementById('preset-select').value = 'custom'
  }

  if (field === 'shape') updateTopologyOptions()
  generate()
  updateUrl()
}

function syncOptionsFromConfig() {
  const container = document.getElementById('topology-options')
  Object.entries(state.config).forEach(([key, val]) => {
    const el = container.querySelector(`[data-field="${key}"]`)
    if (el) el.value = val
  })
}

function createTopology() {
  switch (state.topology) {
    case 'grid':
      return createGridTopology({
        rows: state.config.rows || 8,
        cols: state.config.cols || 8,
      })
    case 'hex': {
      const hexConfig = { shape: state.config.shape || 'hexagonal' }
      if (hexConfig.shape === 'rhombus') {
        hexConfig.size = state.config.size || state.config.radius || 7
      } else {
        hexConfig.radius = state.config.radius || 6
      }
      return createHexTopology(hexConfig)
    }
    case 'track': {
      const len = state.config.length || 24
      const positions = Array.from({ length: len }, (_, i) => `p${i}`)
      return createTrackTopology({
        positions,
        circuit: state.config.circuit || false,
      })
    }
    case 'pit':
      return createPitTopology({
        pitsPerSide: state.config.pits || 6,
      })
    case 'graph':
      return createGraphTopology(getGraphConfig(state.config.variant))
    default:
      return null
  }
}

function getMorrisPositions() {
  const w = 440, h = 440
  const pad = 40
  const variant = state.config.variant || 'nine-mens'

  if (variant === 'six-mens') {
    // Six Men's: nodes encode grid position (a-g = col 1-7, number = row)
    // Only uses columns a,b,c,e,f,g and rows 1-7 (no d column, no center)
    return morrisGridPositions(getGraphConfig('six-mens').nodes, w, h, pad)
  }

  // Nine Men's: same grid-based positioning
  return morrisGridPositions(getGraphConfig('nine-mens').nodes, w, h, pad)
}

function morrisGridPositions(nodes, w, h, pad) {
  const cols = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6 }
  const positions = {}
  const sx = (w - pad * 2) / 6
  const sy = (h - pad * 2) / 6
  for (const node of nodes) {
    const col = cols[node[0]]
    const row = parseInt(node.slice(1)) - 1
    positions[node] = { x: pad + col * sx, y: pad + (6 - row) * sy }
  }
  return positions
}

function getGraphConfig(variant) {
  if (variant === 'six-mens') {
    return {
      nodes: [
        'a1','a4','a7','b2','b4','b6','c3','c4','c5',
        'e3','e4','e5','f2','f4','f6','g1','g4','g7',
      ],
      edges: [
        ['a1','a4'],['a4','a7'],['b2','b4'],['b4','b6'],
        ['c3','c4'],['c4','c5'],['e3','e4'],['e4','e5'],
        ['f2','f4'],['f4','f6'],['g1','g4'],['g4','g7'],
        ['a1','g1'],['b2','f2'],['c3','e3'],
        ['a7','g7'],['b6','f6'],['c5','e5'],
        ['a4','b4'],['b4','c4'],['e4','f4'],['f4','g4'],
      ],
    }
  }
  return {
    nodes: [
      'a1','a4','a7','b2','b4','b6','c3','c4','c5',
      'd1','d2','d3','d5','d6','d7',
      'e3','e4','e5','f2','f4','f6','g1','g4','g7',
    ],
    edges: [
      ['a1','a4'],['a4','a7'],['b2','b4'],['b4','b6'],
      ['c3','c4'],['c4','c5'],['e3','e4'],['e4','e5'],
      ['f2','f4'],['f4','f6'],['g1','g4'],['g4','g7'],
      ['a1','d1'],['d1','g1'],['a7','d7'],['d7','g7'],
      ['b2','d2'],['d2','f2'],['b6','d6'],['d6','f6'],
      ['c3','d3'],['d3','e3'],['c5','d5'],['d5','e5'],
      ['a4','b4'],['b4','c4'],['e4','f4'],['f4','g4'],
    ],
  }
}

function isGoPreset() {
  return state.preset && state.preset.startsWith('go-')
}

function getLayoutOpts() {
  switch (state.topology) {
    case 'grid': return { tileSize: 44, alternating: !isGoPreset() }
    case 'hex': return { cellSize: 22 }
    case 'track': return { cellSize: 36, style: state.config.circuit ? 'circuit' : 'linear' }
    case 'pit': return { pitRadius: 28, storeRadius: 38, spacing: 16 }
    case 'graph': return { nodeRadius: 14, width: 440, height: 440, positions: getMorrisPositions() }
    default: return {}
  }
}

function generate() {
  const topology = createTopology()
  if (!topology) return

  state.board = topology
  const layout = topology.getLayout(getLayoutOpts())
  const theme = THEMES[state.theme] || THEMES.classic
  const showLabels = state.labels !== 'none'

  state.svg = renderer.render(layout, {
    theme,
    labels: showLabels,
    pieces: {},
    highlights: [],
  })

  const svgContainer = document.getElementById('board-svg')
  const emptyState = document.getElementById('board-empty')
  svgContainer.innerHTML = state.svg
  svgContainer.classList.add('active')
  emptyState.style.display = 'none'

  const cells = layout.getCells()
  document.getElementById('board-info').textContent =
    `${capitalise(state.topology)} · ${cells.length} cells · seed ${state.seed}`
  document.getElementById('board-stats').textContent =
    `${cells.length} cells`
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function updateUrl() {
  const params = new URLSearchParams()
  params.set('topology', state.topology)
  if (state.preset !== 'custom') params.set('preset', state.preset)
  params.set('seed', state.seed)
  if (state.theme !== 'classic') params.set('theme', state.theme)
  Object.entries(state.config).forEach(([k, v]) => {
    if (v !== undefined && v !== null) params.set(k, v)
  })
  history.replaceState({}, '', location.pathname + '?' + params.toString())
}

function exportSvg() {
  if (!state.svg) return
  const blob = new Blob([state.svg], { type: 'image/svg+xml' })
  download(blob, `board-${state.topology}-${state.seed}.svg`)
}

function exportPng() {
  if (!state.svg) return
  const svgBlob = new Blob([state.svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(svgBlob)
  const img = new Image()
  img.onload = () => {
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth * scale
    canvas.height = img.naturalHeight * scale
    const ctx = canvas.getContext('2d')
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    canvas.toBlob(blob => {
      download(blob, `board-${state.topology}-${state.seed}.png`)
    }, 'image/png')
  }
  img.src = url
}

function exportJson() {
  const data = {
    topology: state.topology,
    config: state.config,
    seed: state.seed,
    theme: state.theme,
  }
  const json = JSON.stringify(data, null, 2)
  document.getElementById('export-data').value = json
  const blob = new Blob([json], { type: 'application/json' })
  download(blob, `board-${state.topology}-${state.seed}.json`)
}

function importBoard() {
  const textarea = document.getElementById('import-data')
  const json = textarea.value.trim()
  if (!json) return
  try {
    const data = JSON.parse(json)
    if (data.topology) state.topology = data.topology
    if (data.config) state.config = data.config
    if (data.seed) state.seed = data.seed
    if (data.theme) state.theme = data.theme
    document.getElementById('topology-select').value = state.topology
    document.getElementById('theme-select').value = state.theme
    updatePresets()
    updateTopologyOptions()
    generate()
  } catch (e) {
    textarea.style.borderColor = '#c62828'
    setTimeout(() => { textarea.style.borderColor = '' }, 1500)
  }
}

function copyToClipboard() {
  const textarea = document.getElementById('export-data')
  if (textarea.value) navigator.clipboard.writeText(textarea.value)
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

let currentScale = 1
function zoom(factor) {
  currentScale *= factor
  const svg = document.querySelector('#board-svg svg')
  if (svg) svg.style.transform = `scale(${currentScale})`
}
function fitToView() {
  currentScale = 1
  const svg = document.querySelector('#board-svg svg')
  if (svg) svg.style.transform = ''
}

document.addEventListener('DOMContentLoaded', init)
