export const builtinThemes = {
  classic: {
    id: 'classic',
    name: 'Classic',
    cells: {
      light: { fill: '#f0d9b5' },
      dark: { fill: '#b58863' },
      uniform: { fill: '#dcb35c' },
      default: { fill: '#ddd', stroke: '#999' },
      node: { fill: '#ddd', stroke: '#555' },
      pit: { fill: '#c19a6b' },
      store: { fill: '#8b6914' },
      safe: { fill: '#e8d44d' },
      start: { fill: '#7cb342' },
      home: { fill: '#ef5350' },
    },
    lines: { stroke: '#2a1f0a', 'stroke-width': 1.5 },
    annotations: { default: { fill: '#1a1a1a' } },
    background: { fill: '#8B7355' },
    labels: { fill: '#5c3d1e', 'font-family': 'serif' },
  },

  minimal: {
    id: 'minimal',
    name: 'Minimal',
    cells: {
      light: { fill: '#ffffff' },
      dark: { fill: '#e0e0e0' },
      uniform: { fill: '#f5f5f5' },
      default: { fill: '#fafafa', stroke: '#ccc' },
      node: { fill: '#fafafa', stroke: '#aaa' },
      pit: { fill: '#e8e8e8' },
      store: { fill: '#d0d0d0' },
      safe: { fill: '#fff9c4' },
      start: { fill: '#c8e6c9' },
      home: { fill: '#ffcdd2' },
    },
    lines: { stroke: '#666', 'stroke-width': 1 },
    annotations: { default: { fill: '#333' } },
    background: { fill: '#ffffff' },
    labels: { fill: '#666', 'font-family': 'sans-serif' },
  },

  wood: {
    id: 'wood',
    name: 'Wooden Board',
    cells: {
      light: { fill: '#f0d9b5' },
      dark: { fill: '#b58863' },
      uniform: { fill: '#d4a76a' },
      default: { fill: '#d4a76a', stroke: '#6d4c1d' },
      node: { fill: '#d4a76a', stroke: '#6d4c1d' },
      pit: { fill: '#c19a6b' },
      store: { fill: '#8b6914' },
    },
    lines: { stroke: '#3d2b1f', 'stroke-width': 1.5 },
    annotations: { default: { fill: '#1a1a1a' } },
    background: { fill: '#a0845c' },
    labels: { fill: '#3d2b1f', 'font-family': 'serif' },
  },
}

export function createThemeResolver(customThemes = {}) {
  const themes = { ...builtinThemes, ...customThemes }

  function resolve(themeId) {
    return themes[themeId] || themes.classic
  }

  function list() {
    return Object.keys(themes)
  }

  function get(themeId) {
    return themes[themeId] || null
  }

  function register(themeId, theme) {
    themes[themeId] = { id: themeId, ...theme }
  }

  return { resolve, list, get, register }
}
