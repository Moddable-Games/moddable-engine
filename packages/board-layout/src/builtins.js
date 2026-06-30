/**
 * Built-in board definitions — parametric, composable, no game names.
 *
 * Each factory takes dimensional params and returns a board definition.
 * The board definition is a plain object describing geometric shapes.
 * Names reference physical form, not game identity.
 */

export function rectangleBoard({ width, height, frameWidth = 16, frameRadius = 6, frameColor = '#3d2b1f', surfaceColor = '#f5e6c8' }) {
  return {
    width,
    height,
    frame: {
      element: 'rect',
      attrs: { x: 0, y: 0, width, height, rx: frameRadius, ry: frameRadius, fill: frameColor },
      inset: frameWidth,
    },
    surfaces: [{
      element: 'rect',
      attrs: {
        x: frameWidth,
        y: frameWidth,
        width: width - frameWidth * 2,
        height: height - frameWidth * 2,
        fill: surfaceColor,
      },
    }],
    dividers: [],
    decorations: [],
  }
}

export function splitBoard({ width, height, frameWidth = 16, frameRadius = 6, frameColor = '#3d2b1f', surfaceColor = '#1a5c3a', barWidth = 24, barColor = null }) {
  const bar = barColor || frameColor
  const halfW = (width - frameWidth * 2 - barWidth) / 2
  return {
    width,
    height,
    frame: {
      element: 'rect',
      attrs: { x: 0, y: 0, width, height, rx: frameRadius, ry: frameRadius, fill: frameColor },
      inset: frameWidth,
    },
    surfaces: [
      {
        element: 'rect',
        attrs: {
          x: frameWidth,
          y: frameWidth,
          width: halfW,
          height: height - frameWidth * 2,
          fill: surfaceColor,
        },
      },
      {
        element: 'rect',
        attrs: {
          x: frameWidth + halfW + barWidth,
          y: frameWidth,
          width: halfW,
          height: height - frameWidth * 2,
          fill: surfaceColor,
        },
      },
    ],
    dividers: [{
      element: 'rect',
      attrs: {
        x: frameWidth + halfW,
        y: 0,
        width: barWidth,
        height,
        fill: bar,
      },
    }],
    decorations: [],
  }
}

export function capsuleBoard({ width, height, frameWidth = 6, outerRadius = 22, innerRadius = 18, frameColor = '#7A5A32', surfaceColor = '#9B7740' }) {
  return {
    width,
    height,
    frame: {
      element: 'rect',
      attrs: {
        x: 0,
        y: 0,
        width,
        height,
        rx: outerRadius,
        ry: outerRadius,
        fill: frameColor,
      },
      inset: frameWidth,
    },
    surfaces: [{
      element: 'rect',
      attrs: {
        x: frameWidth,
        y: frameWidth,
        width: width - frameWidth * 2,
        height: height - frameWidth * 2,
        rx: innerRadius,
        ry: innerRadius,
        fill: surfaceColor,
      },
    }],
    dividers: [],
    decorations: [],
  }
}

export function slabBoard({ width, height, borderWidth = 15, surfaceInset = 0, slabColor = '#dcb35c', surfaceColor = '#d4a843', surfaceRadius = 2 }) {
  const defs = {
    width,
    height,
    frame: null,
    surfaces: [{
      element: 'rect',
      attrs: {
        x: borderWidth,
        y: borderWidth,
        width: width - borderWidth * 2,
        height: height - borderWidth * 2,
        fill: slabColor,
      },
    }],
    dividers: [],
    decorations: [],
  }
  if (surfaceInset > 0) {
    const si = borderWidth + surfaceInset
    defs.surfaces.push({
      element: 'rect',
      attrs: {
        x: si,
        y: si,
        width: width - si * 2,
        height: height - si * 2,
        rx: surfaceRadius,
        ry: surfaceRadius,
        fill: surfaceColor,
      },
    })
  }
  return defs
}

export function feltBoard({ width, height, radius = null, feltColor = '#1a5c3a', edgeColor = '#0d3d1f' }) {
  const r = radius || Math.min(width, height) / 2
  if (radius) {
    return {
      width: r * 2,
      height: r * 2,
      frame: null,
      surfaces: [{
        element: 'circle',
        attrs: { cx: r, cy: r, r, fill: feltColor, stroke: edgeColor, 'stroke-width': 2 },
      }],
      dividers: [],
      decorations: [],
    }
  }
  return {
    width,
    height,
    frame: null,
    surfaces: [{
      element: 'rect',
      attrs: { x: 0, y: 0, width, height, rx: 12, ry: 12, fill: feltColor, stroke: edgeColor, 'stroke-width': 2 },
    }],
    dividers: [],
    decorations: [],
  }
}

export function riverBoard({ width, height, frameWidth = 0, surfaceColor = '#f5e6c8', riverY, riverHeight = 20, riverColor = null }) {
  const rc = riverColor || surfaceColor
  return {
    width,
    height,
    frame: frameWidth > 0 ? {
      element: 'rect',
      attrs: { x: 0, y: 0, width, height, fill: surfaceColor },
      inset: frameWidth,
    } : null,
    surfaces: [{
      element: 'rect',
      attrs: { x: 0, y: 0, width, height, fill: surfaceColor },
    }],
    dividers: [{
      element: 'rect',
      attrs: {
        x: 0,
        y: riverY,
        width,
        height: riverHeight,
        fill: rc,
      },
    }],
    decorations: [],
  }
}

export const builtinBoards = {
  rectangle: rectangleBoard,
  split: splitBoard,
  capsule: capsuleBoard,
  slab: slabBoard,
  felt: feltBoard,
  river: riverBoard,
}
