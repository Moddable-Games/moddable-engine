// Draft storage for the create page.
//
// Drafts live in localStorage so they survive a tab close, a navigation to the
// play page and back, and a browser restart. sessionStorage was the original
// transport and lost everything the moment the tab went away, which is why a
// board could be played but never recovered.
//
// One record is special: WORKING_ID. The create page autosaves into it on every
// change, so there is always something to restore even if the user never presses
// Save. Pressing Save copies the working record into a named draft.

const KEY = 'moddable:drafts:v1'
const MAX_DRAFTS = 24

export const WORKING_ID = 'working'
export const STATE_VERSION = 1

function readStore() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { drafts: [] }
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.drafts)) return { drafts: [] }
    return parsed
  } catch {
    return { drafts: [] }
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
    return true
  } catch {
    // Quota exceeded or storage disabled. The page keeps working in memory;
    // it just cannot promise the draft survives a reload.
    return false
  }
}

function newId() {
  return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// Named drafts first by recency, then the working draft, which is an
// implementation detail rather than something the user chose to keep.
export function listDrafts() {
  const store = readStore()
  return store.drafts
    .filter(d => d.id !== WORKING_ID)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

export function getDraft(id) {
  if (!id) return null
  return readStore().drafts.find(d => d.id === id) || null
}

export function getWorkingDraft() {
  return getDraft(WORKING_ID)
}

// `draft=1` is the shape the first version of Try in Play used, and links to it
// already exist. Treat it as "whatever I was last working on".
export function resolveDraftId(param) {
  if (!param) return null
  if (param === '1' || param === 'true') {
    const working = getWorkingDraft()
    if (working) return WORKING_ID
    const first = listDrafts()[0]
    return first ? first.id : null
  }
  return getDraft(param) ? param : null
}

export function saveDraft(state, opts = {}) {
  const store = readStore()
  const id = opts.id || newId()
  const existing = store.drafts.find(d => d.id === id)
  const record = {
    id,
    name: opts.name || existing?.name || defaultName(state),
    updatedAt: Date.now(),
    state,
  }
  if (existing) Object.assign(existing, record)
  else store.drafts.push(record)

  // Trim named drafts only. The working record is never evicted.
  const named = store.drafts.filter(d => d.id !== WORKING_ID)
  if (named.length > MAX_DRAFTS) {
    named.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    const keep = new Set(named.slice(0, MAX_DRAFTS).map(d => d.id))
    keep.add(WORKING_ID)
    store.drafts = store.drafts.filter(d => keep.has(d.id))
  }

  const ok = writeStore(store)
  return ok ? record : null
}

export function saveWorking(state) {
  return saveDraft(state, { id: WORKING_ID, name: 'Working board' })
}

export function deleteDraft(id) {
  const store = readStore()
  const before = store.drafts.length
  store.drafts = store.drafts.filter(d => d.id !== id)
  if (store.drafts.length === before) return false
  return writeStore(store)
}

export function renameDraft(id, name) {
  const store = readStore()
  const record = store.drafts.find(d => d.id === id)
  if (!record) return false
  record.name = name
  record.updatedAt = Date.now()
  return writeStore(store)
}

export function defaultName(state) {
  const topo = state?.topology || {}
  const size = topo.type === 'grid' ? `${topo.rows}x${topo.cols}` : topo.type
  const count = Object.keys(state?.placement || {}).length
  return `${size} board, ${count} piece${count === 1 ? '' : 's'}`
}

export function describeDraft(record) {
  const state = record?.state || {}
  const topo = state.topology || {}
  const parts = []
  if (topo.type === 'grid') parts.push(`${topo.rows}x${topo.cols}`)
  else if (topo.type) parts.push(topo.type)
  const count = Object.keys(state.placement || {}).length
  parts.push(`${count} piece${count === 1 ? '' : 's'}`)
  if (state.family && state.family !== 'chess') parts.push(state.family)
  return parts.join(' · ')
}

export function relativeTime(ts, now = Date.now()) {
  if (!ts) return ''
  const secs = Math.max(0, Math.round((now - ts) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

// Whether a working draft is worth restoring. Placed pieces are the obvious
// case, but a board with four named seats, custom rules and no pieces yet is
// also work someone would be annoyed to lose, and was being discarded because
// the only test was the piece count. `defaultFor` is passed in rather than
// imported so this module keeps no dependencies.
export function hasContent(state, defaultFor) {
  if (!state) return false
  if (Object.keys(state.placement || {}).length > 0) return true
  if ((state.customPieces || []).length > 0) return true
  if (typeof defaultFor !== 'function') return false
  const base = defaultFor(state.family || 'chess')
  const shape = s => JSON.stringify({
    family: s.family, title: s.title, pieceSet: s.pieceSet,
    topology: s.topology, players: s.players, rules: s.rules,
  })
  return shape(state) !== shape(base)
}
