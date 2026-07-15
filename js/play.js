import { renderFromEngine, attachPieceImages, fenToPosition } from '../packages/render/src/render-engine.js'
import { getGameConfig, getAllGames, HexSvg, createSeededRng } from '../packages/hex-generators/index.js'
import { getDeckConfig, getRegisteredDecks, createDeck, shuffle, deal, layoutTable } from '../packages/component-deck/index.js'
import { renderDeckSvg, renderMahjongSvg, renderTableauSvg } from '../packages/component-deck/src/renderers.js'
import { renderRpgProvider } from './rpg-provider.js'
import { renderDeckFromResolved, setDeckRenderer, setMahjongRenderer, setTableauRenderer } from '../packages/component-deck/src/render-from-resolved.js'

let galleryIndex = null
async function loadGalleryIndex(basePath = '../pieces/') {
  if (galleryIndex) return galleryIndex
  try { galleryIndex = await fetch(basePath + 'gallery-index.json').then(r => r.json()) }
  catch { galleryIndex = [] }
  return galleryIndex
}

async function renderFromResolved(resolved, container) {
  const topo = resolved.topology || {}
  if (topo.type === 'none' || !topo.type) {
    const components = resolved.components || {}
    const meta = resolved.meta || {}
    if (components.deck || components.dice) {
      const svg = renderDeckFromResolved(resolved)
      if (svg) { container.innerHTML = svg; return }
    }
    container.innerHTML = `<div style="padding:20px;color:#aaa;text-align:center;font-family:system-ui"><p style="font-size:16px;margin-bottom:8px">${meta.label || 'Non-spatial game'}</p><p style="font-size:12px;color:#666">Category: ${meta.category || 'unknown'}</p></div>`
    return
  }
  const gallery = await loadGalleryIndex()
  const pieceResult = gallery ? attachPieceImages(resolved, gallery) : { images: {}, surfaceMap: {}, surface: null }
  let pieceImages = pieceResult.images || {}
  if (resolved._recolouredPieceImages) pieceImages = { ...pieceImages, ...resolved._recolouredPieceImages }
  const svg = renderFromEngine(resolved, {
    pieceImages,
    pieceSurfaceMap: pieceResult.surfaceMap || {},
    pieceSurface: pieceResult.surface || null,
  })
  if (!svg) { container.innerHTML = '<p style="color:#f44">Cannot determine board style</p>'; return }
  container.innerHTML = svg
  const render = resolved.render || {}
  return {
    position: {},
    pieceImages,
    rows: topo.rows,
    cols: topo.cols,
    parsedSetup: render._parsedSetup,
    boardData: resolved.content?.data,
    variant: resolved.content?.board,
    hexPosition: render._position,
    centreMarker: render.centreMarker || render._centreMarker,
    filledArms: render._filledArms || resolved.setup?.arms,
    layers: topo.layers || topo.boards ? {
      fens: Array.isArray(resolved.setup) ? resolved.setup : [],
      labels: topo.layer_labels || [],
    } : null,
  }
}
import { resolveSurface } from '../packages/schema/src/surfaces.js'
import { resolve as cascadeResolve } from '../packages/schema/src/cascade-resolver.js'
import { parseFrontmatter } from '../packages/schema/src/parse-frontmatter.js'

async function loadContent(resolved, basePath) {
  const content = resolved.content
  if (!content || (content.data && !content.source) || !content.source) return resolved
  const url = content.source.startsWith('http') ? content.source
    : content.source.endsWith('.json') && !content.source.includes('/') ? '../data/' + content.source
    : (basePath?.endsWith('/') ? basePath : (basePath || '') + '/') + content.source
  try {
    const data = await fetch(url).then(r => r.ok ? r.json() : null)
    return data ? { ...resolved, content: { ...content, data } } : resolved
  } catch { return resolved }
}

async function loadVariant({ familyPath, variantPath, basePath }) {
  const [familyMd, variantMd] = await Promise.all([
    fetch(basePath + familyPath).then(r => r.text()),
    fetch(basePath + variantPath).then(r => r.text()),
  ])
  const familyFm = parseFrontmatter(familyMd).meta || {}
  const variantFm = parseFrontmatter(variantMd).meta || {}
  const surfaceRef = variantFm.engine?.surface || familyFm.engine?.surface
  const surface = resolveSurface(surfaceRef)
  const { resolved, errors } = cascadeResolve({
    surface,
    family: { engine: familyFm.engine || {}, meta: { label: familyFm.title || '' } },
    variant: { engine: variantFm.engine || {}, meta: { label: variantFm.title || variantFm.slug || '' } },
  })
  if (errors.length > 0) return { resolved, errors }
  const contentBasePath = basePath + variantPath.replace(/\/[^/]+$/, '/')
  const final = await loadContent(resolved, contentBasePath)
  return { resolved: final, errors: [] }
}

setDeckRenderer(renderDeckSvg)
setMahjongRenderer(renderMahjongSvg)
setTableauRenderer(renderTableauSvg)




const FEN4_OWNERS = { r: 'red', b: 'blue', y: 'yellow', g: 'green' }


const recolourCache = {}

async function loadRecolouredPieces(config, gallery) {
  const setDef = gallery?.find(s => s.id === (config.pieceSet4 || 'mce-4player'))
  if (!setDef || !setDef.owners || !setDef.baseSet) return

  const basePath = `../pieces/sets/${setDef.baseSet}/`
  const images = {}
  const owners = setDef.owners
  const matchColor = setDef.recolourMatch || '#fff'

  const fetches = []
  for (const [pieceId, filename] of Object.entries(setDef.pieces || {})) {
    const ownerPrefix = pieceId[0]
    const ownerName = FEN4_OWNERS[ownerPrefix]
    const ownerColors = owners[ownerName]
    if (!ownerColors) continue

    const cacheKey = `${setDef.baseSet}/${filename}:${ownerColors.fill}`
    if (recolourCache[cacheKey]) {
      images[pieceId] = recolourCache[cacheKey]
      continue
    }

    fetches.push(
      fetch(basePath + filename).then(r => r.text()).then(svg => {
        const tinted = svg.replaceAll(matchColor, ownerColors.fill)
        const dataUri = 'data:image/svg+xml,' + encodeURIComponent(tinted)
        recolourCache[cacheKey] = dataUri
        images[pieceId] = dataUri
      }).catch(() => {})
    )
  }

  await Promise.all(fetches)
  config.pieceImages = images
}


// ─── APP STATE ──────────────────────────────────────────────────────────────

let state = readStateFromURL()

const boardDataCache = {}

function readStateFromURL() {
  const params = new URLSearchParams(window.location.search)
  return {
    game: params.get('game') || 'moddable-chess',
    variant: params.get('variant') || 'standard',
    handicap: parseInt(params.get('handicap')) || 0,
    seed: params.get('seed') || String(Math.floor(Math.random() * 9999999999)),
    style: params.get('style') || 'classic',
    players: parseInt(params.get('players')) || 0,
  }
}

function pushState() {
  const params = new URLSearchParams({ game: state.game, variant: state.variant })
  if (state.handicap) params.set('handicap', state.handicap)
  if (state.seed) params.set('seed', state.seed)
  if (state.style && state.style !== 'classic') params.set('style', state.style)
  if (state.players) params.set('players', state.players)
  history.replaceState(null, '', '?' + params.toString())
}

let gamesIndex = {}

async function init() {
  galleryIndex = await fetch('../pieces/gallery-index.json').then(r => r.json()).catch(e => { console.error('Gallery load failed:', e); return null })
  const manifest = await fetch('../../moddable-rules/diagrams-manifest.json').then(r => r.json()).catch(e => { console.error('Manifest load failed:', e); return {} })
  for (const key of Object.keys(manifest)) {
    const [family, variant] = key.split('/')
    if (!gamesIndex[family]) gamesIndex[family] = []
    gamesIndex[family].push(variant)
  }
  populateGames()
  populateVariants()
  bindControls()
  render()
}

function populateGames() {
  const select = document.getElementById('game-select')
  select.innerHTML = ''
  const sorted = Object.keys(gamesIndex).sort()
  for (const id of sorted) {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = id.replace(/-/g, ' ')
    select.appendChild(opt)
  }
  select.value = state.game
}

function populateVariants() {
  const select = document.getElementById('variant-select')
  select.innerHTML = ''
  const variants = gamesIndex[state.game]
  if (!variants) return
  for (const id of variants) {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = id.replace(/-/g, ' ')
    select.appendChild(opt)
  }
  select.value = state.variant
  updateCoverage()
}

function updateCoverage() {
  const variants = gamesIndex[state.game]
  if (!variants) return
  const el = document.getElementById('coverage-info')
  if (el) el.textContent = `${variants.length} variants`
}

function bindControls() {

  document.getElementById('game-select').addEventListener('change', e => {
    state.game = e.target.value
    const variants = gamesIndex[state.game]
    state.variant = variants ? variants[0] : ''
    populateVariants()
    pushState()
    render()
  })
  document.getElementById('variant-select').addEventListener('change', e => {
    state.variant = e.target.value
    pushState()
    render()
  })
  document.getElementById('handicap-select').addEventListener('change', e => {
    state.handicap = parseInt(e.target.value) || 0
    pushState()
    render()
  })
  document.getElementById('hex-style-select').addEventListener('change', e => {
    state.style = e.target.value
    pushState()
    render()
  })
  document.getElementById('hex-players-select').addEventListener('change', e => {
    state.players = parseInt(e.target.value) || 0
    pushState()
    render()
  })
  let seedTimer = null
  document.getElementById('hex-seed-input').addEventListener('input', e => {
    clearTimeout(seedTimer)
    seedTimer = setTimeout(() => {
      state.seed = e.target.value || String(Math.floor(Math.random() * 9999999999))
      pushState()
      render()
    }, 300)
  })
  document.getElementById('hex-reseed-btn').addEventListener('click', () => {
    state.seed = String(Math.floor(Math.random() * 9999999999))
    document.getElementById('hex-seed-input').value = state.seed
    pushState()
    render()
  })
  window.addEventListener('resize', () => requestAnimationFrame(fitToView))

  document.getElementById('export-svg-btn').addEventListener('click', exportSvg)
  document.getElementById('export-png-btn').addEventListener('click', exportPng)
}

function exportSvg() {
  const container = document.getElementById('board-svg')
  const svg = container.querySelector('svg')
  if (!svg) return
  const svgString = new XMLSerializer().serializeToString(svg)
  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${state.game}-${state.variant}.svg`
  a.click()
  URL.revokeObjectURL(url)
}

async function exportPng() {
  const container = document.getElementById('board-svg')
  const svg = container.querySelector('svg')
  if (!svg) return

  // Get actual dimensions from viewBox (most reliable source)
  const vb = svg.getAttribute('viewBox')
  let svgW, svgH
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number)
    svgW = parts[2]
    svgH = parts[3]
  } else {
    svgW = parseInt(svg.getAttribute('width')) || svg.getBoundingClientRect().width || 400
    svgH = parseInt(svg.getAttribute('height')) || svg.getBoundingClientRect().height || 400
  }

  const scale = 2
  const width = svgW * scale
  const height = svgH * scale

  // Clone and ensure explicit width/height so Image renders at full size
  const clone = svg.cloneNode(true)
  clone.setAttribute('width', svgW)
  clone.setAttribute('height', svgH)
  clone.removeAttribute('style')
  await inlineExternalImages(clone)

  const svgString = new XMLSerializer().serializeToString(clone)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const img = new Image()
  img.onload = () => {
    ctx.drawImage(img, 0, 0, width, height)
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${state.game}-${state.variant}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  img.src = URL.createObjectURL(blob)
}

async function inlineExternalImages(svgEl) {
  const images = svgEl.querySelectorAll('image[href]')
  const promises = [...images].map(async img => {
    const href = img.getAttribute('href')
    if (!href || href.startsWith('data:')) return
    try {
      const resp = await fetch(href)
      const blob = await resp.blob()
      const dataUrl = await new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
      img.setAttribute('href', dataUrl)
    } catch (e) {
      // Leave as-is if fetch fails
    }
  })
  await Promise.all(promises)
}

async function render() {
  if (!state.game || !state.variant) return
  const basePath = '../../moddable-rules/games/'
  const familyPath = state.game + '/content/rulebook.md'
  const variantPath = state.game + '/content/variants/' + state.variant + '.md'

  try {
    const { resolved, errors } = await loadVariant({ familyPath, variantPath, basePath })
    if (errors && errors.length > 0) {
      showSvg('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><text x="200" y="40" text-anchor="middle" font-size="12" fill="#f44">' + errors.join('; ') + '</text></svg>')
      return
    }
    const target = document.getElementById('board-svg')
    if (resolved.players && resolved.players.length > 2 && resolved.pieces?.set) {
      const recolourConfig = { pieceSet4: resolved.pieces.set }
      await loadRecolouredPieces(recolourConfig, galleryIndex)
      if (recolourConfig.pieceImages) {
        resolved._recolouredPieceImages = recolourConfig.pieceImages
      }
    }
    const opts = await renderFromResolved(resolved, target)
    target.classList.add('active')
    document.getElementById('board-empty').style.display = 'none'
    if (opts) {
      if (opts.layers && opts.layers.fens) {
        opts.layerPositions = opts.layers.fens.map(fen =>
          fenToPosition(fen, opts.rows || 8, opts.cols || 8)
        )
      }
      bindBoardHover(opts)
    }
    const topo = resolved.topology || {}
    const rend = resolved.render || {}
    showInfo({
      boardStyle: rend.cellColor || topo.type,
      rows: topo.rows, cols: topo.cols, rings: topo.radius,
      pieceSet: resolved.pieces?.set,
      setup: resolved.setup,
      variantDesc: resolved.meta?.label,
    })
    requestAnimationFrame(fitToView)
  } catch (e) {
    showSvg('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><text x="200" y="40" text-anchor="middle" font-size="12" fill="#f44">' + e.message + '</text></svg>')
  }
}

function renderDeckGame(game, variantDef) {
  const deckType = game.deckGame
  const deckConfig = getDeckConfig(deckType)
  if (!deckConfig) {
    showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#1a1a2e" rx="8"/><text x="200" y="100" text-anchor="middle" font-size="14" fill="#888" font-family="system-ui">Unknown deck: "${deckType}"</text></svg>`)
    return
  }

  const gameKey = variantDef.deckVariant
  const dealSpec = deckConfig.games[gameKey]
  if (!dealSpec) {
    showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#1a1a2e" rx="8"/><text x="200" y="100" text-anchor="middle" font-size="14" fill="#888" font-family="system-ui">No deal spec: "${gameKey}"</text></svg>`)
    return
  }

  const seed = state.seed
  const players = state.players || dealSpec.defaultPlayers
  const activeDealSpec = { ...dealSpec, players }
  const createOpts = deckType === 'standard-dice'
    ? { count: (dealSpec.perPlayer || 0) * players + (dealSpec.community || 0) }
    : dealSpec
  const cards = createDeck(deckType, createOpts)
  const shuffled = shuffle(cards, seed)
  const dealResult = deal(shuffled, activeDealSpec)

  if (deckType === 'standard-dice' && deckConfig.roll) {
    for (let i = 0; i < dealResult.hands.length; i++) {
      dealResult.hands[i] = deckConfig.roll(dealResult.hands[i], seed + i)
    }
    if (dealResult.community.length > 0) {
      dealResult.community = deckConfig.roll(dealResult.community, seed + 99)
    }
  }

  if (dealResult.layout === 'tableau') {
    renderTableauSvg(dealResult, { deckType, deckConfig, variantDef, seed })
    return
  }

  if (activeDealSpec.layout === 'mahjong-wall') {
    renderMahjongSvg(dealResult, { deckType, deckConfig, variantDef, seed, tileSet: activeDealSpec.tileSet || 'mahjong-regular' })
    return
  }

  const cardW = deckType === 'dominoes-28' ? 32 : deckType === 'standard-dice' ? 48 : 44
  const cardH = deckType === 'dominoes-28' ? 60 : deckType === 'standard-dice' ? 48 : 64
  const maxHand = Math.max(...dealResult.hands.map(h => h.length), dealResult.community.length)
  const handWidth = maxHand * (cardW + 4)
  const handHalfW = handWidth / 2
  const handHalfH = cardH / 2
  const separationNeeded = handWidth + 20
  const minRingFromSeparation = separationNeeded / (2 * Math.sin(Math.PI / players))
  const communityWidth = dealResult.community.length * (cardW + 4)
  const hasDrawPile = dealResult.drawPile.length > 0
  const drawPileWidth = hasDrawPile ? cardW + 8 : 0
  const centreZoneHalfW = (communityWidth + drawPileWidth) / 2
  const minRingFromCommunity = centreZoneHalfW + handHalfW + 20
  const minRing = Math.max(minRingFromSeparation, minRingFromCommunity, 150)

  const tableW = (minRing + handHalfW) * 2 + 40
  const tableH = (minRing + handHalfH) * 2 + 60

  const tableLayout = layoutTable(dealResult, {
    players,
    tableWidth: tableW,
    tableHeight: tableH,
    cardW,
    cardH,
    handStyle: 'spread',
  })

  const svg = renderDeckSvg(tableLayout, {
    tableW, tableH, cardW, cardH,
    deckLabel: deckConfig.label,
    gameLabel: variantDef.label,
    deckType,
    seed,
  })

  const notation = encodeDeckState(dealResult, deckType, seed, players)

  showSvg(svg)
  showInfo({
    deckType,
    gameKey,
    seed,
    players,
    cardsPerHand: dealResult.hands[0]?.length || 0,
    community: dealResult.community.length,
    drawPile: dealResult.drawPile.length,
    label: variantDef.label,
    setupDesc: variantDef.setupDesc,
    variantDesc: variantDef.variantDesc,
    deckNotation: notation,
  })
  bindDeckHover()
  requestAnimationFrame(fitToView)
}

function encodeDeckState(dealResult, deckType, seed, players) {
  const parts = [`${deckType}:${seed}:${players}`]
  for (let i = 0; i < dealResult.hands.length; i++) {
    const ids = dealResult.hands[i].map(c => c.id)
    parts.push(`h${i}=${ids.join(',')}`)
  }
  if (dealResult.community.length > 0) {
    parts.push(`f=${dealResult.community.map(c => c.id).join(',')}`)
  }
  parts.push(`d=${dealResult.drawPile.length}`)
  return parts.join('|')
}

function bindDeckHover() {
  const infoBar = document.getElementById('hex-info-bar')
  const svgContainer = document.getElementById('board-svg')
  infoBar.classList.add('active')
  infoBar.textContent = 'Hover over a card or zone'

  svgContainer.addEventListener('mouseover', e => {
    const card = e.target.closest('[data-card]')
    const zone = e.target.closest('[data-zone]')
    if (card && zone) {
      infoBar.textContent = `${card.dataset.card} · ${zone.dataset.zone}`
    } else if (card) {
      infoBar.textContent = card.dataset.card
    } else if (zone) {
      infoBar.textContent = zone.dataset.zone
    }
  })

  svgContainer.addEventListener('mouseleave', () => {
    infoBar.textContent = 'Hover over a card or zone'
  })
}

function showSvg(svg) {
  const container = document.getElementById('board-svg')
  const empty = document.getElementById('board-empty')
  container.innerHTML = svg
  container.classList.add('active')
  empty.style.display = 'none'
}

function bindBoardHover(config) {
  const infoBar = document.getElementById('hex-info-bar')
  const svgContainer = document.getElementById('board-svg')
  infoBar.classList.add('active')
  infoBar.textContent = 'Hover over a cell'

  const position = config.position || config.hexPosition || {}
  const parsedSetup = config.parsedSetup || null
  const PIECE_NAMES = {
    K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn',
    k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn',
    A: 'Archbishop', a: 'Archbishop', C: 'Chancellor', c: 'Chancellor',
    D: 'Dabbaba', d: 'Dabbaba', E: 'Elephant', e: 'Elephant',
    F: 'Ferz', f: 'Ferz', G: 'Gold', g: 'Gold',
    H: 'Horse', h: 'Horse', I: 'Immobiliser', i: 'Immobiliser',
    J: 'Giraffe', j: 'Giraffe', L: 'Lance', l: 'Lance',
    M: 'Amazon', m: 'Amazon', O: 'Ogre', o: 'Ogre',
    S: 'Silver', s: 'Silver', T: 'Tower', t: 'Tower',
    U: 'Unicorn', u: 'Unicorn', V: 'Eagle', v: 'Eagle',
    W: 'War Machine', w: 'War Machine', Y: 'Wyvern', y: 'Wyvern',
    Z: 'Zebra', z: 'Zebra',
    man: 'Man', king: 'King', stone: 'Stone', piece: 'Disc',
  }

  const pieceNameOverrides = config.pieceNames || {}
  const centreMarker = config.centreMarker || null
  const nodeNames = config.nodeNames || null

  const layerLabels = config.layers && config.layers.labels || null

  svgContainer.addEventListener('mouseover', e => {
    const cell = e.target.closest('.board-cell')
    if (!cell) return
    const sq = cell.dataset.sq
    const type = cell.dataset.type || ''
    const layerGroup = cell.closest('[data-layer]')
    const layer = layerGroup ? layerGroup.dataset.layer : cell.dataset.layer
    let text = sq
    if (layer !== undefined && layerLabels) {
      text += ` · ${layerLabels[parseInt(layer)]}`
    }
    const overlayInfo = config._overlaySquares?.[sq]
    if (centreMarker && sq === '0,0') text += ' [Throne]'
    else if (overlayInfo) text += ` [${overlayInfo}]`
    else if (type && type !== 'floor' && !(nodeNames && nodeNames[sq])) text += ` [${type}]`
    if (nodeNames && nodeNames[sq]) text += ` — ${nodeNames[sq]}`
    const layerPositions = config.layerPositions || null
    const piece = (layer !== undefined && layerPositions) ? layerPositions[parseInt(layer)]?.[sq] : position[sq]
    if (piece) {
      const p = typeof piece === 'object' ? piece : { type: String(piece) }
      const fen4Prefix = p.type.length === 2 && FEN4_OWNERS[p.type[0]]
      const name = pieceNameOverrides[p.type] || pieceNameOverrides[p.type.toUpperCase()] || (fen4Prefix ? PIECE_NAMES[p.type[1]] : PIECE_NAMES[p.type]) || p.type
      if (p.color) {
        text += ` — ${p.color} ${name}`
      } else if (fen4Prefix) {
        const ownerName = FEN4_OWNERS[p.type[0]]
        text += ` — ${ownerName.charAt(0).toUpperCase() + ownerName.slice(1)} ${name}`
      } else if (p.type !== p.type.toLowerCase()) {
        const upperOwner = state.game === 'xiangqi' ? 'Red' : 'White'
        text += ` — ${upperOwner} ${name}`
      } else if (p.type !== p.type.toUpperCase()) {
        const lowerOwner = state.game === 'xiangqi' ? 'Black' : 'Black'
        text += ` — ${lowerOwner} ${name}`
      } else {
        text += ` — ${name}`
      }
    }
    if (sq.startsWith('h') && type.startsWith('arm-')) {
      const arm = cell.dataset.arm || type.slice(4)
      const armNames = { N: 'North', NE: 'North-East', SE: 'South-East', S: 'South', SW: 'South-West', NW: 'North-West' }
      const armOrder = ['N', 'NE', 'SE', 'S', 'SW', 'NW']
      const armPlayerColors = ['Red', 'Blue', 'Green', 'Black', 'Purple', 'Brown']
      text = `${sq} — ${armNames[arm] || arm} arm`
      const filledArms = config.filledArms || []
      if (filledArms.includes(arm)) {
        const playerIdx = armOrder.indexOf(arm)
        text += ` — ${armPlayerColors[playerIdx]} player`
      }
    } else if (sq.startsWith('h') && type === 'centre') {
      text = `${sq} — centre (empty)`
    }
    if (parsedSetup && sq.startsWith('pit-')) {
      const idx = parseInt(sq.slice(4), 10)
      const count = parsedSetup.pits ? (parsedSetup.pits[idx] || 0) : 0
      text = `Pit ${idx + 1} — ${count} seed${count !== 1 ? 's' : ''}`
    } else if (parsedSetup && sq.startsWith('store-')) {
      const idx = parseInt(sq.slice(6), 10)
      const count = parsedSetup.stores ? (parsedSetup.stores[idx] || 0) : 0
      text = `Store ${idx + 1} — ${count} seed${count !== 1 ? 's' : ''}`
    } else if (parsedSetup && sq.startsWith('point-')) {
      const idx = parseInt(sq.slice(6), 10) - 1
      const dark = parsedSetup.dark ? (parsedSetup.dark[idx] || 0) : 0
      const light = parsedSetup.light ? (parsedSetup.light[idx] || 0) : 0
      text = `Point ${idx + 1}`
      if (dark > 0) text += ` — ${dark} dark`
      if (light > 0) text += ` — ${light} light`
      if (!dark && !light) text += ' — empty'
    } else if (sq.startsWith('pos-') && config.boardData) {
      const posStr = sq.slice(4)
      const suffix = posStr.match(/[ab]$/)
      const posNum = parseInt(posStr, 10)
      const variant = config.variant || '1904-patent'
      const board = config.boardData.boards[variant]
      if (board) {
        const space = board.spaces.find(s => s.pos === posNum)
        if (space && suffix && suffix[0] === 'b' && space.split) {
          const sp = space.split
          text = `#${space.pos}b ${sp.name} [${sp.type}]`
          if (sp.tax) text += ` — Tax $${sp.tax}`
          if (sp.rent) text += ` — Rent $${sp.rent}`
          if (sp.price) text += ` — Price $${sp.price}`
          if (sp.notes) text += ` — ${sp.notes}`
        } else if (space) {
          const id = suffix ? `${space.pos}${suffix[0]}` : `${space.pos}`
          text = `#${id} ${space.name} [${space.type}]`
          if (space.rent) text += ` — Rent $${space.rent}`
          if (space.price) text += ` — Price $${space.price}`
          if (space.tax) text += ` — Tax $${space.tax}`
          if (space.fare) text += ` — Fare $${space.fare}`
          if (space.fee) text += ` — Fee $${space.fee}`
          if (space.receive) text += ` — Receive $${space.receive}`
          if (space.notes) text += ` — ${space.notes}`
        }
      }
    } else if (sq.startsWith('inner-') && config.boardData) {
      const idx = parseInt(sq.slice(6), 10) - 1
      const variant = config.variant || '1904-patent'
      const board = config.boardData.boards[variant]
      if (board && board.naturalOpportunities && board.naturalOpportunities[idx]) {
        const no = board.naturalOpportunities[idx]
        text = `${no.name} — Wages $${no.wages}, Rent $${no.rent}, Re-entry: ${no.reentryName} (#${no.reentry})`
      } else if (board && board.innerSpaces && board.innerSpaces[idx]) {
        const is = board.innerSpaces[idx]
        text = `Inner: ${is.name} [${is.type}]`
        if (is.fare) text += ` — Fare $${is.fare}`
        if (is.notes) text += ` — ${is.notes}`
      }
    }
    if (text.length > 90) text = text.slice(0, 87) + '...'
    infoBar.textContent = text
  })

  svgContainer.addEventListener('mouseleave', () => {
    infoBar.textContent = 'Hover over a cell'
  })
}

function bindHexHover(gameConfig) {
  const infoBar = document.getElementById('hex-info-bar')
  const svgContainer = document.getElementById('board-svg')
  infoBar.classList.add('active')
  infoBar.textContent = 'Hover over a hex'

  const descs = gameConfig.getDescriptions ? gameConfig.getDescriptions() : null

  svgContainer.addEventListener('mouseover', e => {
    const poly = e.target.closest('.hex-cell')
    if (!poly) return
    const id = poly.dataset.id || ''
    const type = poly.dataset.type || ''
    const name = poly.dataset.name || ''
    const q = poly.dataset.q
    const r = poly.dataset.r

    let text = id ? `${id} (${q},${r})` : `(${q},${r})`
    if (name) {
      text += ` — ${name}`
    } else if (descs && descs[type]) {
      text += ` — ${descs[type].name}`
      if (descs[type].desc) text += `: ${descs[type].desc}`
    } else if (type) {
      text += ` — ${type}`
    }
    infoBar.textContent = text
  })

  svgContainer.addEventListener('mouseleave', () => {
    infoBar.textContent = 'Hover over a hex'
  })
}

function showInfo(cfg) {
  const info = document.getElementById('derived-info')
  const variants = gamesIndex[state.game]
  const rows = []
  const mode = cfg.static ? 'static' : 'dynamic'
  rows.push(`<div class="info-row"><span class="info-label">Render</span><span class="info-value info-badge info-badge--${mode}">${mode}</span></div>`)
  if (cfg.hexGame) {
    rows.push(`<div class="info-row"><span class="info-label">Generator</span><span class="info-value">${cfg.hexGame}</span></div>`)
    rows.push(`<div class="info-row"><span class="info-label">Hexes</span><span class="info-value">${cfg.hexCount}</span></div>`)
  } else {
    if (cfg.boardStyle) rows.push(`<div class="info-row"><span class="info-label">Board</span><span class="info-value">${cfg.boardStyle}</span></div>`)
    if (cfg.rows) rows.push(`<div class="info-row"><span class="info-label">Size</span><span class="info-value">${cfg.rows}×${cfg.cols}</span></div>`)
    if (cfg.rings) rows.push(`<div class="info-row"><span class="info-label">Rings</span><span class="info-value">${cfg.rings}</span></div>`)
    const displayPieceSet = cfg.pieceSetOverride || cfg.pieceSet4 || (cfg.pieceSet)
    if (displayPieceSet) rows.push(`<div class="info-row"><span class="info-label">Pieces</span><span class="info-value">${displayPieceSet}</span></div>`)
    if (cfg.fen) rows.push(`<div class="info-row info-row--block"><span class="info-label">Setup</span><span class="info-value info-value--fen">${cfg.fen}</span></div>`)
    else if (cfg.setup) rows.push(`<div class="info-row info-row--block"><span class="info-label">Setup</span><span class="info-value info-value--fen">${cfg.setup}</span></div>`)
    else if (cfg.draughtsSetup) rows.push(`<div class="info-row"><span class="info-label">Setup</span><span class="info-value">${cfg.draughtsSetup.rows} rows each side</span></div>`)
    else if (cfg.fanoronaSetup) rows.push(`<div class="info-row"><span class="info-label">Setup</span><span class="info-value">Standard (22 each)</span></div>`)
    else if (cfg.goHandicap) rows.push(`<div class="info-row"><span class="info-label">Setup</span><span class="info-value">${cfg.goHandicap} handicap stones</span></div>`)
    else if (cfg.asaltoNotation) rows.push(`<div class="info-row info-row--block"><span class="info-label">Setup</span><span class="info-value info-value--fen">${cfg.asaltoNotation}</span></div>`)
    else if (cfg.svgPath) rows.push(`<div class="info-row info-row--block"><span class="info-label">Source</span><span class="info-value info-value--fen">${cfg.svgPath}</span></div>`)
    else if (!cfg.position && !cfg.static) rows.push(`<div class="info-row"><span class="info-label">Setup</span><span class="info-value">Empty board</span></div>`)
    if (cfg.fen || cfg.setup) rows.push(`<div class="info-row"><span class="info-label">Notation</span><span class="info-value">FEN</span></div>`)
    else if (cfg.asaltoNotation) rows.push(`<div class="info-row"><span class="info-label">Notation</span><span class="info-value">Node map</span></div>`)
  }
  if (cfg.deckType) {
    rows.push(`<div class="info-row"><span class="info-label">Deck</span><span class="info-value">${cfg.deckType}</span></div>`)
    rows.push(`<div class="info-row"><span class="info-label">Players</span><span class="info-value">${cfg.players}</span></div>`)
    rows.push(`<div class="info-row"><span class="info-label">Per hand</span><span class="info-value">${cfg.cardsPerHand}</span></div>`)
    if (cfg.community) rows.push(`<div class="info-row"><span class="info-label">Community</span><span class="info-value">${cfg.community}</span></div>`)
    if (cfg.drawPile) rows.push(`<div class="info-row"><span class="info-label">Draw pile</span><span class="info-value">${cfg.drawPile}</span></div>`)
    rows.push(`<div class="info-row"><span class="info-label">Seed</span><span class="info-value">${cfg.seed}</span></div>`)
    if (cfg.deckNotation) rows.push(`<div class="info-row info-row--block"><span class="info-label">State</span><span class="info-value info-value--fen">${cfg.deckNotation}</span></div>`)
  }
  if (cfg.setupDesc) rows.push(`<div class="info-row info-row--block"><span class="info-label">Position</span><span class="info-value">${cfg.setupDesc}</span></div>`)
  if (cfg.variantDesc) rows.push(`<div class="info-row info-row--block"><span class="info-label">Variant</span><span class="info-value">${cfg.variantDesc}</span></div>`)
  info.innerHTML = rows.join('')
}

function fitToView() {
  const svg = document.querySelector('#board-svg svg')
  const container = document.querySelector('.canvas-svg.active')
  if (!svg || !container) return
  const sw = parseFloat(svg.getAttribute('width'))
  const sh = parseFloat(svg.getAttribute('height'))
  const cw = container.clientWidth - 48
  const ch = container.clientHeight - 48
  if (!sw || !sh || !cw || !ch) return
  const scale = Math.min(cw / sw, ch / sh)
  svg.style.transform = `scale(${scale})`
}

if (document.getElementById('game-select')) {
  document.addEventListener('DOMContentLoaded', init)
}

