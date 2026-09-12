const DEV = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'

export function createStore(initialSlices = {}) {
  const state = { ...initialSlices }
  const owners = new Map()
  const subscribers = new Map()

  function assertSerializable(sliceName, value) {
    try {
      const json = JSON.stringify(value, (key, val) => {
        if (typeof val === 'function') throw new TypeError('Functions are not serialisable')
        return val
      })
      if (json === undefined) throw new TypeError('Value serialises to undefined')
    } catch (e) {
      throw new Error(`State slice "${sliceName}" contains non-serialisable value: ${e.message}`)
    }
  }

  function get(sliceName) {
    return state[sliceName]
  }

  function set(sliceName, newSliceState, caller) {
    if (owners.has(sliceName) && caller && owners.get(sliceName) !== caller) {
      throw new Error(`Slice "${sliceName}" is owned by "${owners.get(sliceName)}", not "${caller}"`)
    }
    if (DEV) assertSerializable(sliceName, newSliceState)
    state[sliceName] = newSliceState
    const subs = subscribers.get(sliceName)
    if (subs) {
      for (const fn of subs) fn(newSliceState)
    }
  }

  function getAll() {
    return { ...state }
  }

  function fromSnapshot(snapshot) {
    for (const key of Object.keys(state)) delete state[key]
    Object.assign(state, snapshot)
  }

  function subscribe(sliceName, fn) {
    if (!subscribers.has(sliceName)) subscribers.set(sliceName, [])
    subscribers.get(sliceName).push(fn)
    return () => {
      const subs = subscribers.get(sliceName)
      const idx = subs.indexOf(fn)
      if (idx !== -1) subs.splice(idx, 1)
    }
  }

  function claimSlice(sliceName, owner) {
    if (owners.has(sliceName)) {
      throw new Error(`Slice "${sliceName}" already claimed by "${owners.get(sliceName)}"`)
    }
    owners.set(sliceName, owner)
  }

  function assertOwner(sliceName, caller) {
    if (!DEV) return
    if (owners.has(sliceName) && owners.get(sliceName) !== caller) {
      throw new Error(`Slice "${sliceName}" is owned by "${owners.get(sliceName)}", not "${caller}"`)
    }
  }


  // A slice that holds something one seat knows and another does not cannot be
  // read the same way by both. engine#155.
  //
  // The boundary is the READ, not the shape of the slice. The alternative -
  // a slice carrying { public, private: { seat1, seat2 } } and asking each
  // consumer to pick - serialises the opponent's hand into every response and
  // relies on the reader not looking at it. That is a leak that ships by
  // default, and no test on this side of a connection can catch it. This way a
  // slice that declares a secret and does not say how to hide it throws
  // instead.
  //
  // `get` and `getAll` are unchanged and still return the truth: the move
  // pipeline hands full state to every plugin and must keep doing so. They are
  // in-process reads. `viewFor` is the only shape that may cross a boundary -
  // a renderer, an API response, a socket frame.
  const projections = new Map()

  function declareSecret(sliceName, project, caller) {
    assertOwner(sliceName, caller)
    if (typeof project !== 'function') {
      throw new Error(`Slice "${sliceName}" declared a secret without a projection - say how a seat sees it`)
    }
    projections.set(sliceName, project)
  }

  function hasSecrets() {
    return projections.size > 0
  }

  function viewOf(seat, sliceName) {
    if (seat === undefined || seat === null) {
      throw new Error(`viewOf("${sliceName}") needs a seat - a view with no viewer is the full state, which is the leak`)
    }
    const project = projections.get(sliceName)
    if (!project) return state[sliceName]
    const seen = project(state[sliceName], seat, { name: sliceName })
    if (DEV) assertSerializable(sliceName, seen)
    return seen
  }

  function viewFor(seat) {
    if (seat === undefined || seat === null) {
      throw new Error('viewFor() needs a seat - a view with no viewer is the full state, which is the leak')
    }
    const seen = {}
    for (const name of Object.keys(state)) seen[name] = viewOf(seat, name)
    return seen
  }

  return { get, set, getAll, fromSnapshot, subscribe, claimSlice, assertOwner, declareSecret, hasSecrets, viewOf, viewFor }
}
