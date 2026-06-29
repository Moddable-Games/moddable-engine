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

  return { get, set, getAll, fromSnapshot, subscribe, claimSlice, assertOwner }
}
