export const schema = {
  type: 'pit',
  required: [],
}

export function createPitTopology(config) {
  // The corpus declares this as `stores`, which is the word an author reaches
  // for; the destructure only ever read `hasStores`, so five boards that
  // declare themselves storeless - oware, ayo, bao, pallanguzhi and the mancala
  // rulebook - silently got stores. Accept both, preferring the explicit one.
  const { pitsPerSide = config.cols || 6, players = 2 } = config
  const hasStores = config.hasStores !== undefined ? config.hasStores
    : config.stores !== undefined ? config.stores
    : true
  const totalPits = pitsPerSide * players
  const stores = hasStores ? players : 0

  function pitIndex(player, pit) {
    return player * pitsPerSide + pit
  }

  function storeIndex(player) {
    if (!hasStores) return -1
    return totalPits + player
  }

  function getOwner(index) {
    if (index >= totalPits) return index - totalPits
    return Math.floor(index / pitsPerSide)
  }

  function isStore(index) {
    return index >= totalPits
  }

  function isPit(index) {
    return index >= 0 && index < totalPits
  }

  function isValid(index) {
    return index >= 0 && index < totalPits + stores
  }

  function sowSequence(fromPit, player, opts = {}) {
    const { skipOpponentStore = true, skipOwnPit = true } = opts
    const sequence = []

    const boardPath = buildBoardPath()
    const startIdx = boardPath.indexOf(fromPit)

    for (let i = 1; i < boardPath.length; i++) {
      const pos = boardPath[(startIdx + i) % boardPath.length]

      if (skipOwnPit && pos === fromPit) continue

      if (isStore(pos)) {
        const storeOwner = pos - totalPits
        if (skipOpponentStore && storeOwner !== player) continue
      }

      sequence.push(pos)
    }
    return sequence
  }

  function buildBoardPath() {
    const path = []
    for (let i = 0; i < pitsPerSide; i++) path.push(i)
    if (hasStores) path.push(storeIndex(0))
    for (let i = pitsPerSide; i < totalPits; i++) path.push(i)
    if (hasStores) path.push(storeIndex(1))
    return path
  }

  function getOpposite(pitIdx) {
    if (!isPit(pitIdx)) return -1
    return totalPits - 1 - pitIdx
  }

  function getPlayerPits(player) {
    const start = player * pitsPerSide
    return Array.from({ length: pitsPerSide }, (_, i) => start + i)
  }

  function neighbours(index) {
    const result = []
    const prev = (index - 1 + totalPits) % totalPits
    const next = (index + 1) % totalPits
    if (isPit(index)) {
      result.push(prev, next)
    }
    return result
  }

  function distance(a, b) {
    if (!isPit(a) || !isPit(b)) return -1
    const forward = ((b - a) + totalPits) % totalPits
    const backward = ((a - b) + totalPits) % totalPits
    return Math.min(forward, backward)
  }

  function toJSON(index) {
    return String(index)
  }

  function fromJSON(str) {
    return parseInt(str, 10)
  }

  function getCount() {
    return totalPits + stores
  }

  function getPitsPerSide() {
    return pitsPerSide
  }

  function getTotalPits() {
    return totalPits
  }

  function getLayout(opts = {}) {
    const { pitRadius = 25, storeRadius = 35, spacing = 15 } = opts
    const pitDiameter = pitRadius * 2
    const storeWidth = storeRadius * 2
    const pitsStartX = storeWidth + spacing * 2

    return {
      getDimensions() {
        const width = storeWidth + spacing * 2 + pitsPerSide * (pitDiameter + spacing) + spacing
        const height = pitDiameter * 2 + spacing * 3 + storeRadius
        return { width, height }
      },
      getCells() {
        const cells = []
        const dims = this.getDimensions()
        for (let i = 0; i < pitsPerSide; i++) {
          const x = pitsStartX + i * (pitDiameter + spacing) + pitRadius
          const cy1 = pitRadius + spacing
          cells.push({ key: pitIndex(1, pitsPerSide - 1 - i), center: { x, y: cy1 }, cellType: 'pit', element: 'ellipse', attrs: { cx: x, cy: cy1, rx: pitRadius, ry: pitRadius * 0.8 } })
        }
        for (let i = 0; i < pitsPerSide; i++) {
          const x = pitsStartX + i * (pitDiameter + spacing) + pitRadius
          const cy2 = dims.height - pitRadius - spacing
          cells.push({ key: pitIndex(0, i), center: { x, y: cy2 }, cellType: 'pit', element: 'ellipse', attrs: { cx: x, cy: cy2, rx: pitRadius, ry: pitRadius * 0.8 } })
        }
        if (stores > 0) {
          const sx0 = dims.width - storeRadius - spacing / 2
          const sy = dims.height / 2
          const sx1 = storeRadius + spacing / 2
          cells.push({ key: storeIndex(0), center: { x: sx0, y: sy }, cellType: 'store', element: 'ellipse', attrs: { cx: sx0, cy: sy, rx: storeRadius, ry: storeRadius * 0.8 } })
          cells.push({ key: storeIndex(1), center: { x: sx1, y: sy }, cellType: 'store', element: 'ellipse', attrs: { cx: sx1, cy: sy, rx: storeRadius, ry: storeRadius * 0.8 } })
        }
        return cells
      },
      defaults: {
        cells: { pit: { fill: '#8B4513', stroke: '#5C3010', 'stroke-width': 2 }, store: { fill: '#8B4513', stroke: '#5C3010', 'stroke-width': 2 } },
      },
    }
  }

  function serializePosition(cellStates) {
    const parts = []
    for (let p = 0; p < players; p++) {
      const pitCounts = []
      for (let i = 0; i < pitsPerSide; i++) {
        const idx = pitIndex(p, i)
        const val = Array.isArray(cellStates) ? cellStates[idx] : (cellStates[idx] ?? 0)
        pitCounts.push(String(val))
      }
      parts.push(pitCounts.join(','))
      if (hasStores) {
        const sIdx = storeIndex(p)
        const storeVal = Array.isArray(cellStates) ? cellStates[sIdx] : (cellStates[sIdx] ?? 0)
        parts.push(String(storeVal))
      }
    }
    return parts.join(';')
  }

  function parsePosition(notation) {
    if (!notation || notation === 'empty') {
      return { pits: new Array(totalPits).fill(0), stores: new Array(players).fill(0) }
    }

    const sections = notation.split(';')
    const pits = new Array(totalPits).fill(0)
    const storesArr = new Array(players).fill(0)

    let sectionIdx = 0
    for (let p = 0; p < players; p++) {
      if (sectionIdx < sections.length) {
        const pitValues = sections[sectionIdx].split(',').map(s => parseInt(s.trim(), 10) || 0)
        for (let i = 0; i < pitsPerSide && i < pitValues.length; i++) {
          pits[pitIndex(p, i)] = pitValues[i]
        }
        sectionIdx++
      }
      if (hasStores && sectionIdx < sections.length) {
        storesArr[p] = parseInt(sections[sectionIdx].trim(), 10) || 0
        sectionIdx++
      }
    }

    return { pits, stores: storesArr }
  }


  return {
    pitIndex,
    storeIndex,
    getOwner,
    isStore,
    isPit,
    isValid,
    sowSequence,
    getOpposite,
    getPlayerPits,
    neighbours,
    distance,
    toJSON,
    fromJSON,
    getCount,
    getPitsPerSide,
    getTotalPits,
    getLayout,
    serializePosition,
    parsePosition,
    pitsPerSide,
    totalPits,
    stores,
    players,
  }
}

// ─── Pit render pipeline — ONE parametric renderer for every pit board (#18) ───
//
// The notation is an ordered list of drawing ops (raw elements — pit boards
// are fully data-driven: producePitLayout computes all geometry from resolved
// frontmatter). The pipeline walks the list once, emits structured SVG
// elements, and collects interactive cells from data-sq attributes. It never
// branches on game or variant. Attribute order is insertion order — part of
// the byte-identity contract (snapshot suite must stay byte-identical).
// Game data (pit counts, store sizes, seed setups, colours) NEVER lives
// here — it arrives inside ops from produce-layout / frontmatter.

export function renderPitLayout(config = {}) {
  const elements = []
  const cells = []
  for (const op of config.ops || []) {
    PIT_OP_HANDLERS[op.op](op, elements, cells)
  }
  return { width: config.width || 0, height: config.height || 0, elements, cells, labels: [], defs: [] }
}

const PIT_OP_HANDLERS = {

  element(op, elements, cells) {
    elements.push({ tag: op.tag, attrs: op.attrs, text: op.text, children: op.children })
    if (op.attrs && op.attrs['data-sq'] !== undefined) {
      cells.push({ id: op.attrs['data-sq'], x: op.attrs.cx, y: op.attrs.cy })
    }
  },

  elements(op, elements, cells) {
    for (const item of op.items) {
      elements.push(item)
      if (item.attrs && item.attrs['data-sq'] !== undefined) {
        cells.push({ id: item.attrs['data-sq'], x: item.attrs.cx, y: item.attrs.cy })
      }
    }
  },

  group(op, elements) {
    elements.push({ tag: 'g', attrs: op.attrs, children: op.children })
  },
}
