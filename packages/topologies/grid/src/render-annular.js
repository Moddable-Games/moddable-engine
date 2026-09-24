// The ring drawing of a wrapped grid (engine#27). schema/produce-layout-annular.js
// builds the whole program, cells included; rendering it hands it on in the
// shape every layout has.
export function renderAnnularLayout(config = {}) {
  return {
    width: config.width || 0,
    height: config.height || 0,
    elements: config.elements || [],
    cells: config.cells || [],
    labels: config.labels || [],
    defs: [],
  }
}
