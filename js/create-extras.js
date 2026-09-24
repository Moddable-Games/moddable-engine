// "Other settings" on the create page (engine#118).
//
// The page's controls cover the settings most boards use. Everything else a
// variant can say - a turn order, a pawn configuration, a drawing program, a
// board of several layers - is held in `state.extra`, block by block, and shown
// here as the frontmatter it will be written as. Each setting is one small
// piece of YAML, read by the same parser the rules repo is read with, so what
// is typed here is exactly what the exported file says.
//
// The plugin says which settings it reads (`configKeys`), so the page offers
// those it has no control for, and flags a key the plugin would ignore.

import { parseFrontmatter, serializeFrontmatter } from '../packages/schema/index.js'

const EXTRA_SECTIONS = [
  { block: 'plugin', title: 'Rules', hint: 'Settings the game plugin reads that have no control above.' },
  { block: 'topology', title: 'Board geometry', hint: 'Layers, wrapping, stores and other shape settings.' },
  { block: 'render', title: 'Drawing', hint: 'How the board is drawn, beyond surface and cell style.' },
  { block: 'pieces', title: 'Piece artwork', hint: 'How board symbols map to the piece set.' },
  { block: 'engine', title: 'Game', hint: 'Turn order, vocabulary and other whole-game settings.' },
]

// One setting as the YAML that declares it.
function settingText(key, value) {
  return serializeFrontmatter({ [key]: value }).split('\n').slice(1, -1).join('\n')
}

// A setting typed as YAML, or null if it does not read as exactly one key.
function readSetting(text) {
  let meta
  try { meta = parseFrontmatter(`---\n${text}\n---`).meta } catch { return null }
  const keys = Object.keys(meta || {})
  if (keys.length !== 1) return null
  return { key: keys[0], value: meta[keys[0]] }
}

// `onChange(block, key, value)` sets a setting; `value === undefined` removes it.
export function buildExtrasPanel(container, { extra, family, familyLabel, configKeys, controlledKeys }, onChange) {
  container.innerHTML = ''
  const reads = new Set(configKeys || [])
  const controlled = new Set(controlledKeys || [])

  for (const section of EXTRA_SECTIONS) {
    const entries = Object.entries(extra?.[section.block] || {})
    const suggestions = section.block === 'plugin'
      ? [...reads].filter(k => !controlled.has(k) && !(k in (extra?.plugin || {}))).sort()
      : []

    const group = document.createElement('div')
    group.className = 'extras-section'
    const heading = document.createElement('div')
    heading.className = 'extras-heading'
    heading.textContent = `${section.title}${entries.length ? ` (${entries.length})` : ''}`
    heading.title = section.hint
    group.appendChild(heading)

    for (const [key, value] of entries) {
      group.appendChild(settingRow(section.block, key, value, onChange, section.block === 'plugin' && reads.size && !reads.has(key)
        ? `The ${familyLabel || family} plugin does not read "${key}", so it changes nothing in play.`
        : null))
    }

    group.appendChild(addRow(section.block, suggestions, onChange))
    container.appendChild(group)
  }
}

function settingRow(block, key, value, onChange, warning) {
  const row = document.createElement('div')
  row.className = 'extras-row'

  const text = document.createElement('textarea')
  text.className = 'def-input extras-text'
  text.spellcheck = false
  text.value = settingText(key, value)
  text.rows = Math.min(8, text.value.split('\n').length)
  text.addEventListener('change', () => {
    const read = readSetting(text.value)
    if (!read) { text.classList.add('is-invalid'); return }
    text.classList.remove('is-invalid')
    if (read.key !== key) onChange(block, key, undefined)
    onChange(block, read.key, read.value)
  })
  row.appendChild(text)

  const remove = document.createElement('button')
  remove.className = 'draft-action draft-action--danger'
  remove.textContent = 'Remove'
  remove.title = `Remove ${key}`
  remove.addEventListener('click', () => onChange(block, key, undefined))
  row.appendChild(remove)

  if (warning) {
    const hint = document.createElement('div')
    hint.className = 'rule-hint extras-warning'
    hint.textContent = warning
    row.appendChild(hint)
  }
  return row
}

// A new setting: pick one the plugin reads, or type any key.
function addRow(block, suggestions, onChange) {
  const row = document.createElement('div')
  row.className = 'extras-add'

  const text = document.createElement('textarea')
  text.className = 'def-input extras-text'
  text.spellcheck = false
  text.rows = 1
  text.placeholder = 'key: value'

  if (suggestions.length) {
    const pick = document.createElement('select')
    pick.className = 'def-select'
    const first = document.createElement('option')
    first.value = ''
    first.textContent = 'Add a setting the plugin reads…'
    pick.appendChild(first)
    for (const key of suggestions) {
      const o = document.createElement('option')
      o.value = key
      o.textContent = key
      pick.appendChild(o)
    }
    pick.addEventListener('change', () => {
      if (!pick.value) return
      text.value = `${pick.value}: `
      text.focus()
      pick.value = ''
    })
    row.appendChild(pick)
  }

  row.appendChild(text)
  const add = document.createElement('button')
  add.className = 'btn btn-outline extras-add-btn'
  add.textContent = 'Add'
  add.addEventListener('click', () => {
    const read = readSetting(text.value)
    if (!read) { text.classList.add('is-invalid'); return }
    onChange(block, read.key, read.value)
  })
  row.appendChild(add)
  return row
}
