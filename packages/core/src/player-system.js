export function createPlayerSystem(config) {
  const { players } = config
  const sliceName = '__players'

  function initState() {
    return {
      currentIndex: 0,
      passCount: 0,
      turnActions: 0,
      eliminated: [],
      // Seats commanded by another seat: { [commandedIdx]: commanderIdx }.
      // Elimination was modelled here from the start; being eliminated and
      // still having your pieces fight on for whoever killed you was not.
      controlledBy: {},
      // A seat that plays once after every other seat, rather than taking its
      // place in the rotation. Djambi's centre cell grants this.
      interleavedIndex: null,
      lastNormalIndex: 0,
    }
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

  // With an interleaved seat set, the order is not a rotation. That seat plays
  // after each of the others: 0,1,0,2,0,3,0,1 with 0 interleaved. So the
  // rotation runs among everyone else and the interleaved seat is inserted
  // between its steps, which means remembering where the rotation had got to.
  function nextIndex(s) {
    const interleaved = s.interleavedIndex
    if (interleaved === null || interleaved === undefined) {
      return { currentIndex: nextActiveIndex(s.currentIndex, s.eliminated), lastNormalIndex: s.currentIndex }
    }
    if (s.currentIndex !== interleaved) {
      // Someone else has just played; the interleaved seat answers.
      return { currentIndex: interleaved, lastNormalIndex: s.currentIndex }
    }
    // The interleaved seat has just played; the rotation resumes where it was,
    // skipping the interleaved seat since it plays every other turn anyway.
    const len = players.length
    let idx = (s.lastNormalIndex + 1) % len
    let checked = 0
    while ((s.eliminated.includes(idx) || idx === interleaved) && checked < len) {
      idx = (idx + 1) % len
      checked++
    }
    return { currentIndex: idx, lastNormalIndex: s.lastNormalIndex }
  }

  function advance(store) {
    const s = store.get(sliceName)
    store.set(sliceName, {
      ...s,
      ...nextIndex(s),
      passCount: 0,
      turnActions: 0,
    })
  }

  function pass(store) {
    const s = store.get(sliceName)
    store.set(sliceName, {
      ...s,
      ...nextIndex(s),
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

  // One seat commands another's surviving pieces. The pieces keep their own
  // owner so they keep their colour on the board, which is what the physical
  // game does - a captured party fights on in its own livery.
  function setControl(commandedIndex, commanderIndex, store) {
    const s = store.get(sliceName)
    const controlledBy = { ...s.controlledBy }
    controlledBy[commandedIndex] = commanderIndex
    // A seat that already commanded others hands them on with itself.
    for (const [seat, holder] of Object.entries(controlledBy)) {
      if (Number(holder) === commandedIndex) controlledBy[seat] = commanderIndex
    }
    store.set(sliceName, { ...s, controlledBy })
  }

  function controllerOf(playerIndex, store) {
    const s = store.get(sliceName)
    const holder = s.controlledBy?.[playerIndex]
    return holder === undefined ? playerIndex : holder
  }

  // Every seat this one moves for, itself included.
  function seatsCommandedBy(playerIndex, store) {
    const s = store.get(sliceName)
    const seats = [playerIndex]
    for (const [seat, holder] of Object.entries(s.controlledBy || {})) {
      if (Number(holder) === playerIndex) seats.push(Number(seat))
    }
    return seats
  }

  function setInterleaved(playerIndex, store) {
    const s = store.get(sliceName)
    store.set(sliceName, { ...s, interleavedIndex: playerIndex })
  }

  function getInterleaved(store) {
    return store.get(sliceName).interleavedIndex ?? null
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
    setControl,
    controllerOf,
    seatsCommandedBy,
    setInterleaved,
    getInterleaved,
    incrementActions,
    getTurnActions,
  }
}
