export const schema = {
  type: 'pit',
  required: ['pitsPerSide'],
  parseBoard(board) {
    const match = board.match(/(\d+)\s*[×x]\s*(\d+)/)
    if (!match) return null
    return { type: 'pit', pitsPerSide: parseInt(match[2], 10) }
  },
  matchBoard(board) {
    return /\d+\s*[×x]\s*\d+\s*pits?/i.test(board)
  },
}

export function createPitTopology(config) {
  const { pitsPerSide, players = 2, hasStores = true } = config
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
    pitsPerSide,
    totalPits,
    stores,
    players,
  }
}
