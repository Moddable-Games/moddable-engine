export function createPlayerSystem(config) {
  const { players } = config
  const sliceName = '__players'

  function initState() {
    return { currentIndex: 0, passCount: 0, turnActions: 0, phase: null }
  }

  function current(store) {
    const s = store.get(sliceName)
    return players[s.currentIndex]
  }

  function getCurrentIndex(store) {
    return store.get(sliceName).currentIndex
  }

  function advance(store) {
    const s = store.get(sliceName)
    store.set(sliceName, {
      ...s,
      currentIndex: (s.currentIndex + 1) % players.length,
      passCount: 0,
      turnActions: 0,
    })
  }

  function pass(store) {
    const s = store.get(sliceName)
    const newPassCount = s.passCount + 1
    store.set(sliceName, {
      ...s,
      currentIndex: (s.currentIndex + 1) % players.length,
      passCount: newPassCount,
      turnActions: 0,
    })
  }

  function getPassCount(store) {
    return store.get(sliceName).passCount
  }

  function forceTurn(playerId, store) {
    const idx = players.indexOf(playerId)
    if (idx === -1) throw new Error(`Unknown player: ${playerId}`)
    const s = store.get(sliceName)
    store.set(sliceName, { ...s, currentIndex: idx })
  }

  function isCurrentPlayer(playerId, store) {
    return current(store) === playerId
  }

  function getAll() {
    return [...players]
  }

  function getPlayerCount() {
    return players.length
  }

  function incrementActions(store) {
    const s = store.get(sliceName)
    store.set(sliceName, { ...s, turnActions: s.turnActions + 1 })
  }

  function getTurnActions(store) {
    return store.get(sliceName).turnActions
  }

  return {
    sliceName,
    initState,
    current,
    getCurrentIndex,
    advance,
    pass,
    getPassCount,
    forceTurn,
    isCurrentPlayer,
    getAll,
    getPlayerCount,
    incrementActions,
    getTurnActions,
  }
}
