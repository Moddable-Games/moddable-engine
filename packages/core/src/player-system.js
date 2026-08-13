export function createPlayerSystem(config) {
  const { players } = config
  const sliceName = '__players'

  function initState() {
    return { currentIndex: 0, passCount: 0, turnActions: 0, eliminated: [] }
  }

  function current(store) {
    const s = store.get(sliceName)
    return players[s.currentIndex]
  }

  function getCurrentIndex(store) {
    return store.get(sliceName).currentIndex
  }

  function nextActiveIndex(fromIndex, eliminated) {
    const len = players.length
    let idx = (fromIndex + 1) % len
    let checked = 0
    while (eliminated.includes(idx) && checked < len) {
      idx = (idx + 1) % len
      checked++
    }
    return idx
  }

  function advance(store) {
    const s = store.get(sliceName)
    const next = nextActiveIndex(s.currentIndex, s.eliminated)
    store.set(sliceName, {
      ...s,
      currentIndex: next,
      passCount: 0,
      turnActions: 0,
    })
  }

  function pass(store) {
    const s = store.get(sliceName)
    const next = nextActiveIndex(s.currentIndex, s.eliminated)
    store.set(sliceName, {
      ...s,
      currentIndex: next,
      passCount: s.passCount + 1,
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

  function getActiveCount(store) {
    const s = store.get(sliceName)
    return players.length - s.eliminated.length
  }

  function isEliminated(playerIndex, store) {
    const s = store.get(sliceName)
    return s.eliminated.includes(playerIndex)
  }

  function eliminate(playerIndex, store) {
    const s = store.get(sliceName)
    if (s.eliminated.includes(playerIndex)) return
    store.set(sliceName, {
      ...s,
      eliminated: [...s.eliminated, playerIndex],
    })
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
    getActiveCount,
    isEliminated,
    eliminate,
    incrementActions,
    getTurnActions,
  }
}
