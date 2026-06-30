/**
 * Board layout — the physical board as a composable collection of geometric shapes.
 *
 * A board is the bottom SVG layer: frame, surface(s), and dividers.
 * Topologies render on top of boards. A board knows nothing about what
 * topology will sit on it — it only provides geometry and dimensions.
 *
 * Board definition shape:
 * {
 *   width, height,         — overall dimensions (the topology will fit within surface bounds)
 *   frame: { element, attrs, inset },  — outer decorative border (optional)
 *   surfaces: [{ element, attrs }],    — one or more playing area fills
 *   dividers: [{ element, attrs }],    — structural separations (optional)
 *   decorations: [{ element, attrs }], — extra marks: rosettes, text, patterns (optional)
 * }
 *
 * Each item is a raw SVG element description — same contract as topology cells.
 * The renderer emits them verbatim.
 */

export function createBoard(definition) {
  const {
    width,
    height,
    frame = null,
    surfaces = [],
    dividers = [],
    decorations = [],
    filters = [],
    generators = [],
    hooks = {},
  } = definition

  function getDimensions() {
    return { width, height }
  }

  function getSurfaceBounds() {
    if (frame && frame.inset) {
      const i = frame.inset
      return {
        x: i,
        y: i,
        width: width - i * 2,
        height: height - i * 2,
      }
    }
    return { x: 0, y: 0, width, height }
  }

  function getFilters() {
    return filters
  }

  function getElements(state = {}) {
    const elements = []

    if (frame) {
      elements.push({ layer: 'frame', element: frame.element, attrs: frame.attrs })
    }

    for (const surface of surfaces) {
      elements.push({ layer: 'surface', element: surface.element, attrs: surface.attrs })
    }

    for (const divider of dividers) {
      elements.push({ layer: 'divider', element: divider.element, attrs: divider.attrs })
    }

    for (const deco of decorations) {
      elements.push({ layer: 'decoration', element: deco.element, attrs: deco.attrs })
    }

    for (const gen of generators) {
      const generated = gen(state, { width, height })
      if (Array.isArray(generated)) {
        for (const el of generated) elements.push(el)
      }
    }

    if (hooks.afterElements) {
      hooks.afterElements(elements, state)
    }

    return elements
  }

  function hook(name) {
    return hooks[name] || null
  }

  return {
    getDimensions,
    getSurfaceBounds,
    getElements,
    getFilters,
    hook,
    definition,
  }
}
