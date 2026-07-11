/**
 * Built-in surface definitions.
 *
 * Canonical source for all named surfaces. The browser surface-resolver
 * (js/surface-resolver.js) mirrors this data — consolidate later.
 */

export const BUILTIN_SURFACES = {
  'wood-classic': {
    name: 'wood-classic',
    colors: {
      'cell-light': '#f0d9b5',
      'cell-dark': '#b58863',
      'cell-mid': '#d4a76a',
      stroke: 'rgba(0,0,0,0.1)',
      background: '#2c2c2c',
    },
    texture: 'grain',
    gridLine: 'thin',
  },
  'wood-light': {
    name: 'wood-light',
    colors: {
      'cell-light': '#dcb35c',
      'cell-dark': '#c8a43c',
      stroke: '#2a2a2a',
      background: '#3a2a1a',
    },
    texture: 'grain',
    gridLine: 'medium',
  },
  parchment: {
    name: 'parchment',
    colors: {
      'cell-light': '#d9c5a0',
      'cell-dark': '#c4b088',
      stroke: '#8b7355',
      background: '#f5f0e8',
      floor: '#d9c5a0',
      'floor-stroke': '#8b7355',
    },
    texture: 'grain',
    gridLine: 'thin',
  },
  earth: {
    name: 'earth',
    colors: {
      'cell-light': '#9B7740',
      'cell-dark': '#7A5A32',
      stroke: '#3A2515',
      background: '#4E3320',
      'board-outer': '#7A5A32',
      'board-inner': '#9B7740',
      pit: '#4E3320',
      'pit-stroke': '#3A2515',
      seed: '#C8B898',
      'seed-stroke': '#8A7A5A',
    },
    texture: 'carved',
    gridLine: 'none',
  },
  'felt-green': {
    name: 'felt-green',
    colors: {
      'cell-light': '#2e7d32',
      'cell-dark': '#1b5e20',
      stroke: '#1b5e20',
      background: '#1a3a1a',
    },
    texture: 'felt',
    gridLine: 'thin',
  },
  slate: {
    name: 'slate',
    colors: {
      'cell-light': '#e8e8e8',
      'cell-dark': '#c0c0c0',
      'cell-mid': '#d8d8d8',
      stroke: 'rgba(0,0,0,0.3)',
      background: '#f5f5f5',
    },
    texture: 'smooth',
    gridLine: 'thin',
  },
  jungle: {
    name: 'jungle',
    colors: {
      'cell-light': '#7cb342',
      'cell-dark': '#558b2f',
      stroke: '#3d6b1f',
      background: '#1a2e1a',
      floor: '#7cb342',
      'floor-stroke': '#558b2f',
      river: '#4a90c8',
      'river-stroke': '#2a6a9a',
      den: '#4a3520',
      trap: '#c8963c',
    },
    texture: 'none',
    gridLine: 'thin',
  },
  military: {
    name: 'military',
    colors: {
      'cell-light': '#c8b896',
      'cell-dark': '#a09070',
      stroke: '#7a6545',
      background: '#3a3020',
      floor: '#c8b896',
      'floor-stroke': '#7a6545',
      lake: '#4a7ab5',
      'lake-stroke': '#2a5a8a',
    },
    texture: 'canvas',
    gridLine: 'thin',
  },
  cosmic: {
    name: 'cosmic',
    colors: {
      'cell-light': '#1a237e',
      'cell-dark': '#0d1442',
      'cell-mid': '#283593',
      stroke: 'rgba(100,150,255,0.3)',
      background: '#070b1e',
    },
    texture: 'none',
    gridLine: 'glow',
  },
}

export function resolveSurface(ref) {
  if (!ref) return {}

  if (typeof ref === 'string') {
    const surface = BUILTIN_SURFACES[ref]
    if (!surface) return {}
    return { ...surface }
  }

  if (ref.base) {
    const base = BUILTIN_SURFACES[ref.base]
    if (!base) return {}
    const { base: _b, ...overrides } = ref
    const result = { ...base }
    for (const key of Object.keys(overrides)) {
      if (key === 'colors' && base.colors && typeof overrides.colors === 'object') {
        result.colors = { ...base.colors, ...overrides.colors }
      } else if (overrides[key] !== undefined) {
        result[key] = overrides[key]
      }
    }
    return result
  }

  return { ...ref }
}
