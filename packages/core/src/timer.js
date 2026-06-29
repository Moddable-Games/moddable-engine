export function createTimer() {
  let accumulated = 0
  let startedAt = null
  let expiryMs = null
  let expiryHandler = null

  function start() {
    if (startedAt !== null) return
    startedAt = Date.now()
  }

  function pause() {
    if (startedAt === null) return
    accumulated += Date.now() - startedAt
    startedAt = null
  }

  function resume() {
    start()
  }

  function elapsed() {
    if (startedAt === null) return accumulated
    return accumulated + (Date.now() - startedAt)
  }

  function snapshot() {
    return { accumulated: elapsed(), expiryMs }
  }

  function restore(snap) {
    accumulated = snap.accumulated
    expiryMs = snap.expiryMs
    startedAt = null
  }

  function reset() {
    accumulated = 0
    startedAt = null
  }

  function onExpiry(ms, handler) {
    expiryMs = ms
    expiryHandler = handler
  }

  function checkExpiry() {
    if (expiryMs !== null && expiryHandler && elapsed() >= expiryMs) {
      expiryHandler()
      return true
    }
    return false
  }

  return { start, pause, resume, elapsed, snapshot, restore, reset, onExpiry, checkExpiry }
}
