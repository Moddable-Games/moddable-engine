export function createEventBus() {
  const listeners = new Map()

  function getHandlers(eventType) {
    if (!listeners.has(eventType)) listeners.set(eventType, [])
    return listeners.get(eventType)
  }

  function emit(eventType, payload) {
    const handlers = listeners.get(eventType)
    if (!handlers) return
    for (let i = 0; i < handlers.length; i++) {
      handlers[i](payload)
    }
  }

  function on(eventType, handler) {
    getHandlers(eventType).push(handler)
    return () => off(eventType, handler)
  }

  function off(eventType, handler) {
    const handlers = listeners.get(eventType)
    if (!handlers) return
    const idx = handlers.indexOf(handler)
    if (idx !== -1) handlers.splice(idx, 1)
  }

  function once(eventType, handler) {
    const wrapper = (payload) => {
      off(eventType, wrapper)
      handler(payload)
    }
    on(eventType, wrapper)
  }

  function clear(eventType) {
    if (eventType) {
      listeners.delete(eventType)
    } else {
      listeners.clear()
    }
  }

  return { emit, on, off, once, clear }
}
