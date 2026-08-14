export const BOARD_THEMES = {
  classic: { label: 'Classic', light: '#f0d9b5', dark: '#b58863', highlight: 'rgba(255,255,0,0.4)', lastMove: 'rgba(100,180,255,0.3)', dot: 'rgba(0,0,0,0.25)', ring: 'rgba(0,0,0,0.25)' },
  cosmic: { label: 'Cosmic Dark', light: '#2d3760', dark: '#141c37', highlight: 'rgba(111,181,255,0.35)', lastMove: 'rgba(111,181,255,0.2)', dot: 'rgba(255,255,255,0.25)', ring: 'rgba(255,255,255,0.3)' },
  wood: { label: 'Classic Wood', light: '#deb887', dark: '#8b5e3c', highlight: 'rgba(255,215,0,0.4)', lastMove: 'rgba(139,90,43,0.3)', dot: 'rgba(0,0,0,0.2)', ring: 'rgba(0,0,0,0.25)' },
  marble: { label: 'Marble', light: '#f2f0ec', dark: '#b8b5af', highlight: 'rgba(100,149,237,0.35)', lastMove: 'rgba(100,149,237,0.2)', dot: 'rgba(0,0,0,0.15)', ring: 'rgba(0,0,0,0.2)' },
  neon: { label: 'Neon', light: '#1a1a2e', dark: '#0f0f1a', highlight: 'rgba(0,255,136,0.3)', lastMove: 'rgba(0,200,255,0.25)', dot: 'rgba(0,255,136,0.4)', ring: 'rgba(255,0,128,0.5)' },
  minimal: { label: 'Minimal', light: '#fafafa', dark: '#e8e8e8', highlight: 'rgba(66,133,244,0.3)', lastMove: 'rgba(66,133,244,0.15)', dot: 'rgba(0,0,0,0.12)', ring: 'rgba(0,0,0,0.15)' },
  transparent: { label: 'Transparent', light: 'rgba(128,128,128,0.12)', dark: 'rgba(128,128,128,0.3)', highlight: 'rgba(111,181,255,0.35)', lastMove: 'rgba(111,181,255,0.2)', dot: 'rgba(128,128,128,0.4)', ring: 'rgba(128,128,128,0.45)' },
}

export const DARK_THEMES = ['cosmic', 'neon', 'transparent']

export const ANIM_THEME = {
  speeds: { instant: 0, fast: 120, normal: 220, slow: 400 },
  styles: ['slide', 'arc', 'bounce', 'warp'],
  defaultSpeed: 'normal',
  defaultStyle: 'slide',
  easing: { slide: 'cubic-out', arc: 'ease-in-out', bounce: 'bounce', warp: 'fade' },
}

const _pieceStyles = new Map([
  ['auto', { label: 'Auto', light: null, dark: null }],
  ['gold', { label: 'White & Gold', light: { fill: '#fff', stroke: '#000', detail: '#fff' }, dark: { fill: '#b58863', stroke: '#5c3a1e', detail: '#f5e6d0' } }],
  ['charcoal', { label: 'Cream & Charcoal', light: { fill: '#f5f0e8', stroke: '#333', detail: '#f5f0e8' }, dark: { fill: '#3a3a3a', stroke: '#1a1a1a', detail: '#ccc' } }],
  ['burgundy', { label: 'White & Burgundy', light: { fill: '#fff', stroke: '#000', detail: '#fff' }, dark: { fill: '#6b1a2a', stroke: '#3d0f18', detail: '#e8b4bf' } }],
  ['navy', { label: 'White & Navy', light: { fill: '#fff', stroke: '#000', detail: '#fff' }, dark: { fill: '#1a3a5c', stroke: '#0d1f33', detail: '#a8c4e0' } }],
])

export const PIECE_STYLES = Object.fromEntries(_pieceStyles)

export function registerPieceStyle(key, config) {
  _pieceStyles.set(key, config)
  PIECE_STYLES[key] = config
}

export function getPieceStyle(key) {
  return _pieceStyles.get(key) || _pieceStyles.get('auto')
}

const _captureBurstTheme = {
  particles: 8,
  duration: 400,
  radius: 3,
  spread: 0.6,
  colors: ['#ff6', '#f93'],
  easing: 'ease-out',
}

export const CAPTURE_BURST_THEME = _captureBurstTheme

export function setCaptureBurstTheme(overrides) {
  Object.assign(_captureBurstTheme, overrides)
}

export const RULES_BASE = typeof location !== 'undefined' && location.hostname === 'engine.moddable.games'
  ? 'https://rules.moddable.games/'
  : '../../moddable-rules/'

let _galleryIndex = null
export async function loadGalleryIndex() {
  if (_galleryIndex) return _galleryIndex
  try {
    const resp = await fetch('../pieces/gallery-index.json?v=1.0.14')
    if (!resp.ok) throw new Error(`gallery-index.json: ${resp.status}`)
    _galleryIndex = await resp.json()
  } catch (e) {
    console.warn('[play-shared] Gallery index load failed:', e.message)
    _galleryIndex = []
  }
  return _galleryIndex
}

export function getGalleryIndex() { return _galleryIndex }

let _variantManifest = null
export async function loadVariantManifest() {
  if (_variantManifest) return _variantManifest
  try { _variantManifest = await fetch(RULES_BASE + 'diagrams-manifest.json').then(r => r.json()) }
  catch { _variantManifest = [] }
  return _variantManifest
}

// Variants verified to need no behaviour beyond standard chess rules.
// Each differs from standard only in starting position and/or castling/en-passant flags.
const VERIFIED_DATA_ONLY = new Set([
  'endgame-chess', 'pawns-only', 'peasants-revolt',
  'chigorin',
])

export function getManifestVariants(family, registeredKeys) {
  if (!_variantManifest) return []
  const registered = registeredKeys || new Set()
  return _variantManifest
    .filter(e => e.family === family)
    .filter(e => registered.has(e.variant) || VERIFIED_DATA_ONLY.has(e.variant))
    .map(e => ({ key: e.variant, label: e.variantTitle || e.variant }))
}

let _playabilityManifest = null
export async function loadPlayabilityManifest() {
  if (_playabilityManifest) return _playabilityManifest
  try {
    const resp = await fetch('../play/playability-manifest.json?v=1.0.14')
    if (!resp.ok) throw new Error(resp.status)
    _playabilityManifest = await resp.json()
  } catch {
    _playabilityManifest = []
  }
  return _playabilityManifest
}

export function getPlayabilityManifest() { return _playabilityManifest || [] }

export function getPlayableVariants(family) {
  return getPlayabilityManifest().filter(e => e.family === family && e.playable)
}

export function getAllManifestVariants(family) {
  return getPlayabilityManifest().filter(e => e.family === family)
}

export const PLAYABLE_FAMILIES = ['chess', 'go', 'draughts', 'xiangqi', 'shogi', 'reversi']

export const FAMILY_LABELS = {
  chess: 'Chess',
  go: 'Go',
  draughts: 'Draughts',
  xiangqi: 'Xiangqi',
  shogi: 'Shogi',
  reversi: 'Reversi',
}

const FEN4_OWNERS = { r: 'red', b: 'blue', y: 'yellow', g: 'green' }
const recolourCache = {}

export async function loadRecolouredPieces(pieceSetId, gallery) {
  const setDef = gallery?.find(s => s.id === pieceSetId)
  if (!setDef || !setDef.owners || !setDef.baseSet) return null

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
  return Object.keys(images).length > 0 ? images : null
}
