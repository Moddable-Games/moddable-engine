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
    let idx = fromPit
    const totalPositions = totalPits + stores

    for (let i = 0; i < totalPositions; i++) {
      idx = (idx + 1) % totalPositions

      if (skipOwnPit && idx === fromPit) continue

      if (isStore(idx)) {
        const storeOwner = idx - totalPits
        if (skipOpponentStore && storeOwner !== player) continue
        sequence.push(idx)
      } else {
        sequence.push(idx)
      }
    }
    return sequence
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
          cells.push({ key: pitIndex(1, pitsPerSide - 1 - i), center: { x, y: pitRadius + spacing }, shape: 'pit', radius: pitRadius })
        }
        for (let i = 0; i < pitsPerSide; i++) {
          const x = pitsStartX + i * (pitDiameter + spacing) + pitRadius
          cells.push({ key: pitIndex(0, i), center: { x, y: dims.height - pitRadius - spacing }, shape: 'pit', radius: pitRadius })
        }
        if (stores > 0) {
          cells.push({ key: storeIndex(0), center: { x: dims.width - storeRadius - spacing / 2, y: dims.height / 2 }, shape: 'pit', radius: storeRadius })
          cells.push({ key: storeIndex(1), center: { x: storeRadius + spacing / 2, y: dims.height / 2 }, shape: 'pit', radius: storeRadius })
        }
        return cells
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
