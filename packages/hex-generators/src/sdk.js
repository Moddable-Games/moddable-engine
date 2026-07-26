import '../index.js'
import { getGameConfig, getRegisteredGames, getAllGames } from './game-registry.js'
import { generateMap } from './generate-map.js'
import { HexSvg } from './hex-svg.js'
import { HexMath } from './hex-math.js'
import { createSeededRng } from '../../core/src/xorshift.js'

export function listGames() {
  return getRegisteredGames().map(key => {
    const config = getGameConfig(key)
    return {
      key,
      label: config.label || key,
      defaultSize: config.defaultSize || 5,
      defaultPlayers: config.defaultPlayers || 2,
      orientation: config.orientation || 'pointy',
      styles: config.styles || ['classic'],
      sizes: config.sizes || null,
      playerCounts: config.playerCounts ? config.playerCounts(config.defaultSize) : null,
    }
  })
}

export function generate(game, opts = {}) {
  const config = getGameConfig(game)
  if (!config) throw new Error(`Unknown hex game: ${game}`)
  const size = opts.size || config.defaultSize || 5
  const players = opts.players || config.defaultPlayers || 2
  const seed = opts.seed || String(Math.floor(Math.random() * 9999999999))
  const rng = createSeededRng(seed)
  const result = config.generate(size, players, seed, rng)
  const hexes = result.hexes || result
  const annotations = result.annotations || null
  return { hexes, annotations, seed, game, size, players }
}

export function renderSvg(game, opts = {}) {
  const config = getGameConfig(game)
  if (!config) throw new Error(`Unknown hex game: ${game}`)
  const result = generate(game, opts)
  const style = opts.style || (config.styles && config.styles[0]) || 'classic'
  const colors = config.getColors ? config.getColors(style) : {}
  const svgOpts = {
    size: opts.hexSize || 30,
    orientation: config.orientation || 'pointy',
    bgColor: opts.bgColor || '#1a1a2e',
    colors,
  }
  const svg = result.annotations
    ? HexSvg.toAnnotatedSVG(result.hexes, result.annotations, svgOpts)
    : HexSvg.toSVG(result.hexes, svgOpts)
  return { svg, ...result }
}

export function getHexInfo(hexes, q, r) {
  const hex = hexes.find(h => h.q === q && h.r === r)
  if (!hex) return null
  const neighbourCoords = HexMath.getNeighbors(q, r)
  const neighbours = neighbourCoords
    .map(n => hexes.find(h => h.q === n.q && h.r === n.r))
    .filter(Boolean)
  return { hex, neighbours, distance: HexMath.axialDistance({ q: 0, r: 0 }, { q, r }) }
}

export {
  getGameConfig,
  getRegisteredGames,
  getAllGames,
  generateMap,
  HexSvg,
  HexMath,
  createSeededRng,
}
