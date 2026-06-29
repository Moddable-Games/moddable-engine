export function createHistory() {
  let entries = []
  let cursor = -1

  function record(move, stateBefore, stateAfter) {
    entries = entries.slice(0, cursor + 1)
    const entry = {
      move,
      stateBefore,
      stateAfter,
      timestamp: Date.now(),
      moveNumber: entries.length + 1,
    }
    entries.push(entry)
    cursor = entries.length - 1
    return entry
  }

  function undo(store) {
    if (cursor < 0) return null
    const entry = entries[cursor]
    store.fromSnapshot(entry.stateBefore)
    cursor--
    return entry.move
  }

  function redo(store) {
    if (cursor >= entries.length - 1) return null
    cursor++
    const entry = entries[cursor]
    store.fromSnapshot(entry.stateAfter)
    return entry.move
  }

  function replay(targetEntries, store) {
    if (targetEntries.length === 0) return
    store.fromSnapshot(targetEntries[targetEntries.length - 1].stateAfter)
    entries = [...targetEntries]
    cursor = entries.length - 1
  }

  function getEntries() {
    return [...entries]
  }

  function toJSON() {
    return JSON.stringify({ entries, cursor })
  }

  function fromJSON(str, store) {
    const data = JSON.parse(str)
    entries = data.entries
    cursor = data.cursor
    if (cursor >= 0) {
      store.fromSnapshot(entries[cursor].stateAfter)
    }
  }

  function getCurrent() {
    return cursor >= 0 ? entries[cursor] : null
  }

  function length() {
    return entries.length
  }

  return { record, undo, redo, replay, getEntries, toJSON, fromJSON, getCurrent, length }
}
