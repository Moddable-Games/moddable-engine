import { createRng } from '../packages/core/src/rng.js'
import { rollDiceExpression } from '../packages/component-dice/src/dice-expression.js'
import { loadRpgManifest } from './rpg-manifest-loader.js'

const RULES_BASE = location.hostname === 'engine.moddable.games'
  ? 'https://rules.moddable.games/'
  : '/MODDABLE/moddable-rules/'

// ─── PAGE DIMENSIONS (A4 portrait, unitless coords mapped to mm) ───────────
const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 12
const CONTENT_W = PAGE_W - MARGIN * 2
const CONTENT_H = PAGE_H - MARGIN * 2

// ─── TYPOGRAPHY ─────────────────────────────────────────────────────────────
const FONT = 'Rajdhani, system-ui, sans-serif'
const HEADING_SIZE = 5
const BODY_SIZE = 3.2
const SMALL_SIZE = 2.6
const LABEL_SIZE = 2.4
const LINE_H = 4.5

// ─── TABLE RESOLUTION ──────────────────────────────────────────────────────
async function fetchTableData(tableRef, gameKey) {
  if (tableRef.inline) return tableRef.inline
  const source = tableRef.source || tableRef.file
  const url = RULES_BASE + 'games/' + gameKey + '/' + source
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    return await resp.json()
  } catch { return null }
}

async function resolveTables(tables, gameKey, rng, resolved = {}) {
  if (!tables) return resolved

  for (const [name, ref] of Object.entries(tables)) {
    if (ref.dependsOn && !resolved[ref.dependsOn]) continue

    let arr
    if (ref.sources) {
      // Multi-source: fetch each, resolve path, merge into unified tables array
      arr = []
      for (const src of ref.sources) {
        const srcData = await fetchTableData(src, gameKey)
        if (!srcData) continue
        let srcArr = srcData
        if (src.arrayKey) {
          const parts = src.arrayKey.replace(/\[\*\]/g, '').split('.')
          for (const p of parts) {
            if (!srcArr || typeof srcArr !== 'object') break
            const idxMatch = p.match(/^(.+)\[(\d+)\]$/)
            if (idxMatch) {
              srcArr = srcArr[idxMatch[1]]
              if (Array.isArray(srcArr)) srcArr = srcArr[parseInt(idxMatch[2])]
            } else {
              srcArr = srcArr[p]
            }
          }
        }
        if (src.as) {
          const entries = Array.isArray(srcArr) ? srcArr
            : (srcArr && typeof srcArr === 'object') ? Object.values(srcArr)
            : [srcArr]
          arr.push({ name: src.as, entries })
        } else if (Array.isArray(srcArr)) {
          const filtered = src.tables
            ? srcArr.filter(t => src.tables.includes(t.name))
            : srcArr
          arr.push(...filtered)
        } else if (srcArr && typeof srcArr === 'object' && !Array.isArray(srcArr)) {
          arr.push(...Object.values(srcArr))
        }
      }
    } else {
      const data = ref.inline ? { tables: ref.inline } : await fetchTableData(ref, gameKey)
      if (!data) continue
      arr = data
      if (ref.arrayKey) {
        const parts = ref.arrayKey.replace(/\[\*\]/g, '').split('.')
        for (const p of parts) {
          if (!arr || typeof arr !== 'object') break
          const idxMatch = p.match(/^(.+)\[(\d+)\]$/)
          if (idxMatch) {
            arr = arr[idxMatch[1]]
            if (Array.isArray(arr)) arr = arr[parseInt(idxMatch[2])]
          } else {
            arr = arr[p]
          }
        }
      }
    }
    if (!Array.isArray(arr)) arr = [arr]

    switch (ref.pickMethod) {
      case 'random':
        resolved[name] = rng.nextChoice(arr)
        break
      case 'rollPerTable': {
        const tableNames = ref.tables || arr.filter(t => t.name).map(t => t.name)
        const results = {}
        for (const tName of tableNames) {
          const table = arr.find(t => t.name === tName)
          if (table && table.entries) {
            results[tName] = rng.nextChoice(table.entries)
          }
        }
        resolved[name] = results
        break
      }
      case 'rollMultiple': {
        const count = ref.count || 1
        const picks = []
        for (let i = 0; i < count; i++) picks.push(rng.nextChoice(arr))
        resolved[name] = picks
        break
      }
      case 'assign':
        resolved[name] = arr
        break
      case 'all':
        resolved[name] = arr
        break
      default:
        resolved[name] = rng.nextChoice(arr)
    }
  }

  // Second pass: dependsOn
  for (const [name, ref] of Object.entries(tables)) {
    if (resolved[name]) continue
    if (!ref.dependsOn || !resolved[ref.dependsOn]) continue
    const parentResult = resolved[ref.dependsOn]
    if (ref.arrayKey && ref.arrayKey.includes('[*]')) {
      const field = ref.arrayKey.split('[*].')[1]
      if (field && parentResult && parentResult[field]) {
        const arr = Array.isArray(parentResult[field]) ? parentResult[field] : [parentResult[field]]
        resolved[name] = ref.pickMethod === 'all' ? arr : rng.nextChoice(arr)
      }
    }
  }
  return resolved
}

// ─── FORMULA EVALUATOR ─────────────────────────────────────────────────────
function evaluateFormula(formula, statsMap) {
  if (!formula) return ''
  const str = String(formula).trim()

  // Pure constant: "+2", "30", "0"
  if (str.match(/^[+-]?\d+$/)) return str

  // Special lookup tables we can't compute
  if (str === 'strSizTable' || str.startsWith('class_')) return ''

  // STAT_mod pattern (D&D modifier = floor((stat-10)/2))
  const modMatch = str.match(/^(\w+)_mod$/)
  if (modMatch) {
    const val = statsMap[modMatch[1]]
    if (val === undefined || val === '') return ''
    const mod = Math.floor((val - 10) / 2)
    return mod >= 0 ? `+${mod}` : String(mod)
  }

  // STAT*N pattern (BRP: STR*5)
  const mulMatch = str.match(/^(\w+)\*(\d+)$/)
  if (mulMatch) {
    const val = statsMap[mulMatch[1]]
    if (val === undefined || val === '') return ''
    return String(val * parseInt(mulMatch[2]))
  }

  // N+STAT_mod pattern (10+DEX_mod)
  const addModMatch = str.match(/^(\d+)\+(\w+)_mod$/)
  if (addModMatch) {
    const base = parseInt(addModMatch[1])
    const val = statsMap[addModMatch[2]]
    if (val === undefined || val === '') return ''
    return String(base + Math.floor((val - 10) / 2))
  }

  // Compound: BAB+STR_mod, 10+BAB+STR_mod+DEX_mod
  const parts = str.split('+')
  let sum = 0
  let allResolved = true
  for (const part of parts) {
    const p = part.trim()
    if (p.match(/^\d+$/)) { sum += parseInt(p); continue }
    if (p.endsWith('_mod')) {
      const val = statsMap[p.replace('_mod', '')]
      if (val === undefined || val === '') { allResolved = false; break }
      sum += Math.floor((val - 10) / 2)
    } else if (statsMap[p] !== undefined && statsMap[p] !== '') {
      sum += statsMap[p]
    } else {
      allResolved = false; break
    }
  }
  return allResolved ? String(sum) : ''
}

function buildStatsMap(section, values) {
  const map = {}
  const stats = section.stats || []
  for (let i = 0; i < stats.length; i++) {
    const val = values._stats?.[i]
    if (val !== undefined && val !== '') map[stats[i].label] = parseInt(val)
  }
  return map
}

// ─── RAW TABLE DATA (full arrays for dropdown population) ──────────────────
async function resolveRawTableData(tables, gameKey) {
  const raw = {}
  if (!tables) return raw

  for (const [name, ref] of Object.entries(tables)) {
    let arr

    if (ref.sources) {
      arr = []
      for (const src of ref.sources) {
        const srcData = await fetchTableData(src, gameKey)
        if (!srcData) continue
        let srcArr = srcData
        if (src.arrayKey) {
          const parts = src.arrayKey.replace(/\[\*\]/g, '').split('.')
          for (const p of parts) {
            if (!srcArr || typeof srcArr !== 'object') break
            const idxMatch = p.match(/^(.+)\[(\d+)\]$/)
            if (idxMatch) {
              srcArr = srcArr[idxMatch[1]]
              if (Array.isArray(srcArr)) srcArr = srcArr[parseInt(idxMatch[2])]
            } else {
              srcArr = srcArr[p]
            }
          }
        }
        if (src.as) {
          arr.push({ name: src.as, entries: Array.isArray(srcArr) ? srcArr : [srcArr] })
        } else if (Array.isArray(srcArr)) {
          const filtered = src.tables
            ? srcArr.filter(t => src.tables.includes(t.name))
            : srcArr
          arr.push(...filtered)
        }
      }
    } else if (ref.inline) {
      arr = Array.isArray(ref.inline) ? ref.inline : [ref.inline]
    } else {
      const data = await fetchTableData(ref, gameKey)
      if (!data) continue
      arr = data
      if (ref.arrayKey) {
        const parts = ref.arrayKey.replace(/\[\*\]/g, '').split('.')
        for (const p of parts) {
          if (!arr || typeof arr !== 'object') break
          const idxMatch = p.match(/^(.+)\[(\d+)\]$/)
          if (idxMatch) {
            arr = arr[idxMatch[1]]
            if (Array.isArray(arr)) arr = arr[parseInt(idxMatch[2])]
          } else {
            arr = arr[p]
          }
        }
      }
    }
    if (!Array.isArray(arr)) continue

    if (ref.pickMethod === 'rollPerTable') {
      raw[name] = {}
      const tableNames = ref.tables || arr.filter(t => t.name).map(t => t.name)
      for (const tName of tableNames) {
        const table = arr.find(t => t.name === tName)
        if (table && table.entries) {
          raw[name][tName] = table.entries
        }
      }
    } else if (ref.pickMethod === 'random' || ref.pickMethod === 'all' || ref.pickMethod === 'rollMultiple') {
      raw[name] = arr
    }
  }
  return raw
}

// ─── VALUE RESOLUTION ──────────────────────────────────────────────────────
function resolveGenValue(gen, section, tables, rng) {
  if (!gen) return ''
  if (typeof gen === 'string' && gen.match(/^\d+d\d/)) return rollDiceExpression(gen, rng)
  if (gen === 'assign' && section.genValues) return rng.shuffle(section.genValues)
  if (gen === 'statArray' && section.genValues) return rng.nextChoice(section.genValues)
  if (gen === 'random' && section.options) return rng.nextChoice(section.options)
  if (tables[gen] !== undefined) {
    const val = tables[gen]
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      return val.name || val.result || Object.values(val).filter(v => typeof v === 'string').join(', ')
    }
    return val
  }
  return ''
}

function resolveValues(section, chargen, tables, rng, mode, userValues = null, rawData = null) {
  const values = {}

  if (section.type === 'header') {
    values._title = chargen.title || 'Character'
    if (mode === 'seeded') {
      for (const field of (section.fields || [])) {
        if (field.gen) {
          const val = resolveGenValue(field.gen, field, tables, rng)
          values[field.id] = typeof val === 'object' ? (val?.name || val?.result || JSON.stringify(val)) : String(val)
        }
      }
    }
    if (mode === 'interactive' && userValues) {
      for (const field of (section.fields || [])) {
        if (userValues[field.id]) values[field.id] = userValues[field.id]
      }
    }
  }

  if (section.type === 'stats') {
    if (mode === 'seeded') {
      const stats = section.stats || []
      if (section.gen === 'assign' && section.genValues) {
        values._stats = rng.shuffle(section.genValues)
      } else if (section.gen === 'statArray' && section.genValues) {
        values._stats = rng.nextChoice(section.genValues)
      } else {
        values._stats = stats.map(s => s.gen ? rollDiceExpression(s.gen, rng) : '')
      }
    }
    if (mode === 'interactive' && userValues?._stats) {
      values._stats = userValues._stats
    }
  }

  if (section.type === 'track') {
    if (mode === 'seeded' && section.gen) {
      values._trackValue = rollDiceExpression(section.gen, rng)
    } else if (mode === 'seeded' && section.startValue !== undefined) {
      values._trackValue = section.startValue
    }
    if (mode === 'interactive' && userValues?.['_track_' + section.label] !== undefined) {
      values._trackValue = userValues['_track_' + section.label]
    }
  }

  if (section.type === 'list') {
    if (mode === 'seeded' && section.gen && tables[section.gen]) {
      const tableData = tables[section.gen]
      if (typeof tableData === 'object' && !Array.isArray(tableData)) {
        values._list = {}
        for (const [k, v] of Object.entries(tableData)) {
          values._list[k] = typeof v === 'object' ? (v.result || v.name || JSON.stringify(v)) : String(v)
        }
      } else if (Array.isArray(tableData)) {
        values._listItems = tableData.map(v => typeof v === 'object' ? (v.result || v.name || '') : String(v))
      } else if (tableData && typeof tableData === 'object') {
        // Single random pick — show as one item
        const val = tableData.name || tableData.result || ''
        if (val) values._listItems = [val]
      }
    }
    // For lists with count, pick multiple from raw data in seeded mode
    if (mode === 'seeded' && section.gen && section.count && !values._listItems?.length && !values._list) {
      const rawArr = rawData?.[section.gen]
      if (rawArr && Array.isArray(rawArr)) {
        const allEntries = []
        for (const entry of rawArr) {
          if (entry.entries) {
            for (const item of entry.entries) {
              const val = typeof item === 'object' ? (item.name || item.result || '') : item
              if (val) allEntries.push(val)
            }
          } else {
            const val = typeof entry === 'object' ? (entry.name || entry.result || '') : entry
            if (val) allEntries.push(val)
          }
        }
        if (allEntries.length) {
          const picks = []
          const count = section.count || 4
          for (let i = 0; i < count; i++) {
            picks.push(allEntries[rng.nextInt(0, allEntries.length - 1)])
          }
          values._listItems = picks
        }
      }
    }
    if (mode === 'interactive') {
      const userList = userValues?.['_list_' + (section.label || section.type)]
      if (userList) {
        if (Array.isArray(userList)) {
          values._listItems = userList
        } else if (typeof userList === 'object') {
          values._list = userList
        }
      }
    }
  }

  if (section.type === 'choices') {
    if (mode === 'seeded') {
      if (section.gen === 'random' && section.options) {
        values._choice = rng.nextChoice(section.options)
      } else if (section.source && tables[section.source]) {
        values._choice = tables[section.source]
      }
    }
    if (mode === 'interactive') {
      const userChoice = userValues?.['_choice_' + (section.label || 'Choice')]
      if (userChoice) values._choice = userChoice
    }
  }

  if (section.type === 'assets' && mode === 'interactive') {
    const assetNames = userValues?.['_assets_' + (section.label || 'Assets')]
    if (assetNames) values._assetNames = assetNames
  }

  if (section.type === 'progress' && mode === 'interactive') {
    const prog = userValues?.['_progress_' + (section.label || 'Progress')]
    if (prog) values._progress = prog
  }

  if (section.type === 'list' && section.items && mode === 'interactive') {
    const checked = userValues?.['_checks_' + (section.label || 'List')]
    if (checked) values._checked = checked
  }

  if (section.type === 'skills' && mode === 'interactive' && userValues?._skills) {
    values._skillValues = userValues._skills
  }

  if (section.type === 'inventory' && mode === 'interactive') {
    const inv = userValues?.['_inv_' + (section.label || 'Inventory')]
    if (inv) values._inventory = inv
  }

  if (section.type === 'notes' && mode === 'interactive') {
    const notes = userValues?.['_notes_' + (section.label || 'Notes')]
    if (notes) values._notes = notes
  }

  return values
}

// ─── THEME PALETTE ─────────────────────────────────────────────────────────
function isDarkBackground(hex) {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

function buildPalette(theme) {
  const dark = isDarkBackground(theme.background || '#faf6f0')
  return {
    text: dark ? '#e8e8e8' : '#1a1a1a',
    label: dark ? '#aaa' : '#666',
    muted: dark ? '#777' : '#999',
    stroke: dark ? '#555' : '#333',
    line: dark ? '#444' : '#ccc',
    lineFaint: dark ? '#333' : '#ddd',
    lineLight: dark ? '#2a2a3e' : '#eee',
  }
}

let _palette = null

// ─── SVG HELPERS ───────────────────────────────────────────────────────────
function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function svgText(x, y, text, opts = {}) {
  const size = opts.size || BODY_SIZE
  const font = opts.font || FONT
  const fill = opts.fill || _palette.text
  const anchor = opts.anchor || 'start'
  const weight = opts.weight || 'normal'
  return `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${esc(text)}</text>`
}

function svgRect(x, y, w, h, opts = {}) {
  const fill = opts.fill || 'none'
  const stroke = opts.stroke || _palette.stroke
  const sw = opts.strokeWidth || 0.3
  const rx = opts.rx || 0.5
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" rx="${rx}"/>`
}

function svgLine(x1, y1, x2, y2, opts = {}) {
  const stroke = opts.stroke || _palette.line
  const sw = opts.strokeWidth || 0.2
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"/>`
}

// ─── SECTION RENDERERS ─────────────────────────────────────────────────────

function renderHeader(section, values, y, theme) {
  let svg = ''
  const accent = theme.accent || '#8d2e2e'
  const fieldY = y + HEADING_SIZE + 2

  svg += `<rect x="0" y="${y}" width="${CONTENT_W}" height="${HEADING_SIZE + 1}" fill="${accent}" rx="1"/>`
  svg += svgText(3, y + HEADING_SIZE - 0.5, values._title || 'Character Sheet', { size: HEADING_SIZE - 1, fill: '#fff', weight: 'bold' })

  const startY = fieldY + 2
  const fields = section.fields || []
  const totalWidth = fields.reduce((sum, f) => sum + (f.width || 1), 0)
  const unitW = CONTENT_W / totalWidth
  let x = 0

  for (const field of fields) {
    const w = (field.width || 1) * unitW - 2
    svg += svgText(x + 1, startY, field.label, { size: LABEL_SIZE, fill: _palette.label })
    svg += svgLine(x, startY + 3, x + w, startY + 3)
    const val = values[field.id] || field.default || ''
    if (val) svg += svgText(x + 1, startY + 2.5, val, { size: BODY_SIZE })
    x += (field.width || 1) * unitW
  }

  return { svg, height: startY - y + 6 }
}

function renderStats(section, values, y, theme) {
  let svg = ''
  const accent = theme.accent || '#8d2e2e'
  const stats = section.stats || []
  const layout = section.layout || 'row'

  svg += svgText(0, y + HEADING_SIZE, 'Abilities', { size: HEADING_SIZE - 1, weight: 'bold', fill: accent })
  const startY = y + HEADING_SIZE + 3

  if (layout === 'row') {
    const boxW = Math.min(CONTENT_W / stats.length, 28)
    const boxH = 14
    let x = (CONTENT_W - boxW * stats.length) / 2

    for (let i = 0; i < stats.length; i++) {
      const stat = stats[i]
      const val = values._stats ? values._stats[i] : ''
      svg += svgRect(x, startY, boxW - 1, boxH, { stroke: accent, strokeWidth: 0.4 })
      svg += svgText(x + (boxW - 1) / 2, startY + 3.5, stat.label, { size: LABEL_SIZE, anchor: 'middle', fill: _palette.label, weight: 'bold' })
      if (val !== '' && val !== undefined) {
        svg += svgText(x + (boxW - 1) / 2, startY + 9, String(val), { size: 6, anchor: 'middle', weight: 'bold' })
      } else {
        svg += svgText(x + (boxW - 1) / 2, startY + 9, stat.range || '___', { size: SMALL_SIZE, anchor: 'middle', fill: _palette.muted })
      }
      if (stat.modifier) {
        const mod = val ? Math.floor((val - 10) / 2) : ''
        const modStr = mod !== '' ? (mod >= 0 ? `+${mod}` : String(mod)) : ''
        svg += svgText(x + (boxW - 1) / 2, startY + 12.5, modStr || 'mod', { size: SMALL_SIZE, anchor: 'middle', fill: _palette.label })
      }
      if (stat.secondaryLabel) {
        const sec = val && stat.secondaryFormula ? val + parseInt(stat.secondaryFormula) : ''
        svg += svgText(x + (boxW - 1) / 2, startY + 12.5, sec ? `${stat.secondaryLabel}: ${sec}` : stat.secondaryLabel, { size: SMALL_SIZE, anchor: 'middle', fill: _palette.label })
      }
      x += boxW
    }
    return { svg, height: boxH + HEADING_SIZE + 5 }
  }

  // Grid layout
  const colW = CONTENT_W / 2
  let curY = startY
  for (let i = 0; i < stats.length; i++) {
    const stat = stats[i]
    const col = i % 2
    const row = Math.floor(i / 2)
    const sx = col * colW
    const sy = startY + row * 7
    svg += svgText(sx + 1, sy + 3, stat.label, { size: BODY_SIZE, weight: 'bold' })
    svg += svgRect(sx + 20, sy, 12, 5.5)
    const val = values._stats ? values._stats[i] : ''
    if (val) svg += svgText(sx + 26, sy + 4, String(val), { size: BODY_SIZE, anchor: 'middle' })
    curY = sy + 7
  }

  if (section.derived) {
    const statsMap = buildStatsMap(section, values)
    curY += 3
    svg += svgText(0, curY + BODY_SIZE, 'Derived', { size: LABEL_SIZE, fill: _palette.label, weight: 'bold' })
    curY += LINE_H
    for (const d of section.derived) {
      const computed = evaluateFormula(d.formula, statsMap)
      const suffix = d.suffix || ''
      svg += svgText(1, curY + 3, d.label + ':', { size: BODY_SIZE, fill: _palette.text })
      svg += svgRect(35, curY, 15, 5)
      if (computed) {
        svg += svgText(42.5, curY + 3.8, computed + suffix, { size: BODY_SIZE, anchor: 'middle' })
      }
      curY += 6
    }
  }

  return { svg, height: curY - y + 2 }
}

function renderTrack(section, values, y, theme) {
  let svg = ''
  const accent = theme.accent || '#8d2e2e'
  const label = section.label || 'Track'
  const max = typeof section.max === 'number' ? section.max : 10
  const style = section.style || 'boxes'
  const filled = values._trackValue || 0

  svg += svgText(0, y + BODY_SIZE + 0.5, label, { size: BODY_SIZE, weight: 'bold' })

  const startX = 30
  const boxSize = 4
  const gap = 1.2

  if (style === 'boxes' || style === 'pips') {
    const displayMax = Math.min(max, 30)
    for (let i = 0; i < displayMax; i++) {
      const bx = startX + i * (boxSize + gap)
      if (style === 'pips') {
        const cx = bx + boxSize / 2
        const cy = y + boxSize / 2 + 0.5
        svg += `<circle cx="${cx}" cy="${cy}" r="${boxSize / 2 - 0.3}" fill="${i < filled ? accent : 'none'}" stroke="${accent}" stroke-width="0.3"/>`
      } else {
        svg += svgRect(bx, y + 0.5, boxSize, boxSize, { fill: i < filled ? accent : 'none', stroke: accent, strokeWidth: 0.3 })
      }
    }
    return { svg, height: boxSize + 3 }
  }

  // Numbered style
  const min = section.min || 0
  const range = max - min
  const numW = Math.min((CONTENT_W - startX) / (range + 1), 5.5)
  for (let i = min; i <= max; i++) {
    const nx = startX + (i - min) * numW
    const isCurrent = i === filled
    if (isCurrent) {
      svg += `<circle cx="${nx + numW / 2}" cy="${y + 3}" r="2.5" fill="${accent}"/>`
      svg += svgText(nx + numW / 2, y + 4, String(i), { size: SMALL_SIZE, anchor: 'middle', fill: '#fff', weight: 'bold' })
    } else {
      svg += svgText(nx + numW / 2, y + 4, String(i), { size: SMALL_SIZE, anchor: 'middle', fill: _palette.muted })
    }
  }
  return { svg, height: 7 }
}

function renderInventory(section, values, y, theme) {
  let svg = ''
  const accent = theme.accent || '#8d2e2e'
  const label = section.label || 'Inventory'
  const slots = typeof section.slots === 'number' ? section.slots : 10
  const model = section.model || 'slots'

  svg += svgText(0, y + HEADING_SIZE, label, { size: HEADING_SIZE - 1, weight: 'bold', fill: accent })
  let curY = y + HEADING_SIZE + 3

  if (model === 'location' && section.sections) {
    for (const sub of section.sections) {
      svg += svgText(1, curY + BODY_SIZE, sub.label, { size: BODY_SIZE, weight: 'bold', fill: _palette.label })
      curY += LINE_H
      const count = sub.slots || 2
      for (let i = 0; i < count; i++) {
        svg += svgLine(8, curY + 3, CONTENT_W - 2, curY + 3)
        const item = values._inventory?.[sub.label]?.[i]
        if (item) svg += svgText(9, curY + 2.5, item, { size: BODY_SIZE })
        curY += LINE_H
      }
    }
  } else if (model === 'abstract') {
    const lines = section.lines || 8
    for (let i = 0; i < lines; i++) {
      svg += svgLine(1, curY + 3.5, CONTENT_W - 2, curY + 3.5)
      curY += LINE_H
    }
  } else {
    const displaySlots = Math.min(slots, 20)
    const columns = section.columns || ['Item']
    const hasWeight = columns.includes('Weight') || columns.includes('Slots')
    for (let i = 0; i < displaySlots; i++) {
      svg += svgText(1, curY + BODY_SIZE, `${i + 1}.`, { size: SMALL_SIZE, fill: _palette.muted })
      svg += svgLine(6, curY + 3.5, hasWeight ? CONTENT_W - 18 : CONTENT_W - 2, curY + 3.5)
      if (hasWeight) svg += svgRect(CONTENT_W - 15, curY + 0.5, 13, 4)
      const item = values._inventory?.items?.[i]
      if (item) svg += svgText(7, curY + BODY_SIZE, item, { size: BODY_SIZE })
      curY += LINE_H
    }
  }

  return { svg, height: curY - y + 1 }
}

function renderList(section, values, y, theme) {
  let svg = ''
  const accent = theme.accent || '#8d2e2e'
  const label = section.label || 'List'
  const count = section.count || 6
  const style = section.style || 'lined'

  svg += svgText(0, y + HEADING_SIZE, label, { size: HEADING_SIZE - 1, weight: 'bold', fill: accent })
  let curY = y + HEADING_SIZE + 3

  if (section.columns && Array.isArray(section.columns)) {
    const cols = section.columns
    const perRow = Math.min(cols.length, 4)
    const colW = CONTENT_W / perRow
    const rows = Math.ceil(cols.length / perRow)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < perRow; col++) {
        const idx = row * perRow + col
        if (idx >= cols.length) break
        const cx = col * colW
        svg += svgText(cx + 1, curY + LABEL_SIZE, cols[idx], { size: LABEL_SIZE, fill: _palette.label })
        const val = values._list?.[cols[idx]]
        if (val) svg += svgText(cx + 1, curY + LABEL_SIZE + BODY_SIZE + 1.5, val, { size: BODY_SIZE })
        svg += svgLine(cx + 1, curY + LABEL_SIZE + BODY_SIZE + 3, cx + colW - 2, curY + LABEL_SIZE + BODY_SIZE + 3)
      }
      curY += LABEL_SIZE + BODY_SIZE + 5
    }
    return { svg, height: curY - y + 1 }
  }

  if (section.items && Array.isArray(section.items)) {
    const checked = values._checked || []
    for (let i = 0; i < section.items.length; i++) {
      const isChecked = checked.includes(i)
      svg += svgRect(1, curY + 0.5, 3.5, 3.5, { fill: isChecked ? accent : 'none', strokeWidth: 0.25 })
      svg += svgText(6, curY + BODY_SIZE, section.items[i], { size: BODY_SIZE })
      curY += LINE_H
    }
    return { svg, height: curY - y + 1 }
  }

  for (let i = 0; i < count; i++) {
    if (style === 'checkbox') {
      svg += svgRect(1, curY + 0.5, 3.5, 3.5, { strokeWidth: 0.25 })
      svg += svgLine(6, curY + 3.5, CONTENT_W - 2, curY + 3.5)
    } else if (style === 'numbered') {
      svg += svgText(1, curY + BODY_SIZE, `${i + 1}.`, { size: SMALL_SIZE, fill: _palette.muted })
      svg += svgLine(6, curY + 3.5, CONTENT_W - 2, curY + 3.5)
    } else {
      svg += svgLine(1, curY + 3.5, CONTENT_W - 2, curY + 3.5)
    }
    const val = values._listItems?.[i]
    if (val) svg += svgText(style === 'checkbox' || style === 'numbered' ? 6 : 2, curY + BODY_SIZE, val, { size: BODY_SIZE })
    curY += LINE_H
  }

  return { svg, height: curY - y + 1 }
}

function renderProgress(section, values, y, theme) {
  let svg = ''
  const accent = theme.accent || '#8d2e2e'
  const label = section.label || 'Progress'
  const tracks = section.tracks || 1
  const boxes = section.boxes || 10
  const ticks = section.ticks || 4

  svg += svgText(0, y + HEADING_SIZE, label, { size: HEADING_SIZE - 1, weight: 'bold', fill: accent })
  let curY = y + HEADING_SIZE + 3

  for (let t = 0; t < tracks; t++) {
    const trackData = values._progress?.[t]
    if (section.fields?.includes('title')) {
      svg += svgText(1, curY + BODY_SIZE, 'Title:', { size: LABEL_SIZE, fill: _palette.label })
      svg += svgLine(12, curY + 3.5, CONTENT_W * 0.6, curY + 3.5)
      if (trackData?.title) svg += svgText(13, curY + 2.8, trackData.title, { size: BODY_SIZE })
      if (section.ranks) {
        svg += svgText(CONTENT_W * 0.62, curY + BODY_SIZE, 'Rank:', { size: LABEL_SIZE, fill: _palette.label })
        svg += svgLine(CONTENT_W * 0.72, curY + 3.5, CONTENT_W - 2, curY + 3.5)
        if (trackData?.rank) svg += svgText(CONTENT_W * 0.73, curY + 2.8, trackData.rank, { size: BODY_SIZE })
      }
      curY += LINE_H + 1
    }

    const filledTicks = parseInt(trackData?.ticks) || 0
    const boxW = Math.min((CONTENT_W - 4) / boxes, 16)
    const boxH = boxW * 0.6
    for (let b = 0; b < boxes; b++) {
      const bx = 1 + b * (boxW + 0.5)
      const boxStartTick = b * ticks
      const boxFilledTicks = Math.min(Math.max(filledTicks - boxStartTick, 0), ticks)
      if (boxFilledTicks === ticks) {
        svg += svgRect(bx, curY, boxW, boxH, { fill: accent, strokeWidth: 0.25 })
      } else {
        svg += svgRect(bx, curY, boxW, boxH, { strokeWidth: 0.25 })
        if (boxFilledTicks > 0) {
          const fillW = (boxW / ticks) * boxFilledTicks
          svg += svgRect(bx, curY, fillW, boxH, { fill: accent + '66', strokeWidth: 0 })
        }
      }
      if (ticks > 1) {
        for (let tk = 1; tk < ticks; tk++) {
          const tx = bx + (boxW / ticks) * tk
          svg += svgLine(tx, curY, tx, curY + boxH, { stroke: _palette.lineFaint, strokeWidth: 0.15 })
        }
      }
    }
    curY += boxH + 3
  }

  return { svg, height: curY - y + 1 }
}

function renderSkills(section, values, y, theme) {
  let svg = ''
  const accent = theme.accent || '#8d2e2e'
  const label = section.label || 'Skills'
  const skills = section.skills || []
  const model = section.model || 'proficiency'

  svg += svgText(0, y + HEADING_SIZE, label, { size: HEADING_SIZE - 1, weight: 'bold', fill: accent })
  let curY = y + HEADING_SIZE + 3

  const rowH = 4.2
  const colW = CONTENT_W / 2

  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i]
    const col = i % 2
    const row = Math.floor(i / 2)
    const sx = col * colW
    const sy = curY + row * rowH

    const skillVal = values._skillValues?.[i] || ''
    if (model === 'proficiency') {
      const filled = skillVal ? accent : 'none'
      svg += `<circle cx="${sx + 2}" cy="${sy + 2}" r="1.3" fill="${filled}" stroke="${_palette.stroke}" stroke-width="0.25"/>`
      svg += svgText(sx + 5, sy + BODY_SIZE, `${skill.name} (${skill.stat})`, { size: SMALL_SIZE })
      if (skillVal) svg += svgText(sx + colW - 8, sy + BODY_SIZE, skillVal, { size: SMALL_SIZE, anchor: 'end' })
    } else {
      svg += svgText(sx + 1, sy + BODY_SIZE, skill.name, { size: SMALL_SIZE })
      svg += svgRect(sx + colW - 18, sy, 7, 3.8, { strokeWidth: 0.2 })
      if (skillVal) svg += svgText(sx + colW - 14.5, sy + 3, skillVal, { size: SMALL_SIZE, anchor: 'middle' })
      svg += svgRect(sx + colW - 10, sy, 7, 3.8, { strokeWidth: 0.2 })
    }
  }

  const totalRows = Math.ceil(skills.length / 2)
  return { svg, height: HEADING_SIZE + 3 + totalRows * rowH + 2 }
}

function wrapText(text, maxChars) {
  if (!text) return []
  const wrapped = []
  for (const line of text.split('\n')) {
    if (line.length <= maxChars) { wrapped.push(line); continue }
    const words = line.split(' ')
    let current = ''
    for (const word of words) {
      if ((current + ' ' + word).trim().length > maxChars) {
        if (current) wrapped.push(current)
        current = word
      } else {
        current = (current + ' ' + word).trim()
      }
    }
    if (current) wrapped.push(current)
  }
  return wrapped
}

function renderNotes(section, values, y, theme) {
  let svg = ''
  const accent = theme.accent || '#8d2e2e'
  const label = section.label || 'Notes'
  const lines = section.lines || 4

  svg += svgText(0, y + HEADING_SIZE, label, { size: HEADING_SIZE - 1, weight: 'bold', fill: accent })
  let curY = y + HEADING_SIZE + 3

  const noteText = values._notes || ''
  const maxCharsPerLine = Math.floor(CONTENT_W / (BODY_SIZE * 0.55))
  const noteLines = wrapText(noteText, maxCharsPerLine)

  for (let i = 0; i < lines; i++) {
    svg += svgLine(1, curY + 3.5, CONTENT_W - 2, curY + 3.5)
    if (noteLines[i]) {
      svg += svgText(2, curY + 2.8, noteLines[i], { size: BODY_SIZE })
    }
    curY += LINE_H
  }

  return { svg, height: curY - y + 1 }
}

function renderAssets(section, values, y, theme) {
  let svg = ''
  const accent = theme.accent || '#8d2e2e'
  const label = section.label || 'Assets'
  const count = section.count || 3
  const abilitiesPerAsset = section.abilities_per_asset || 3

  svg += svgText(0, y + HEADING_SIZE, label, { size: HEADING_SIZE - 1, weight: 'bold', fill: accent })
  let curY = y + HEADING_SIZE + 3

  const cardW = (CONTENT_W - (count - 1) * 2) / count
  const cardH = 8 + abilitiesPerAsset * 5

  for (let i = 0; i < count; i++) {
    const cx = i * (cardW + 2)
    svg += svgRect(cx, curY, cardW, cardH, { stroke: accent, strokeWidth: 0.3 })
    const assetName = values._assetNames?.[i]
    const catLabel = section.categories?.[i] || `Asset ${i + 1}`
    svg += svgText(cx + 2, curY + 3.5, assetName || catLabel, { size: LABEL_SIZE, fill: assetName ? _palette.text : _palette.label, weight: assetName ? 'bold' : 'normal' })
    svg += svgLine(cx + 1, curY + 5, cx + cardW - 1, curY + 5, { stroke: _palette.lineFaint })
    for (let a = 0; a < abilitiesPerAsset; a++) {
      const ay = curY + 6 + a * 5
      svg += svgRect(cx + 2, ay + 0.5, 3, 3, { strokeWidth: 0.2 })
      svg += svgLine(cx + 6, ay + 3, cx + cardW - 2, ay + 3, { stroke: _palette.lineLight })
    }
  }

  return { svg, height: cardH + HEADING_SIZE + 5 }
}

function renderChoices(section, values, y, theme) {
  let svg = ''
  const accent = theme.accent || '#8d2e2e'
  const label = section.label || 'Choice'

  svg += svgText(0, y + HEADING_SIZE, label, { size: HEADING_SIZE - 1, weight: 'bold', fill: accent })
  let curY = y + HEADING_SIZE + 3

  const options = section.options || []
  const chosen = values._choice || null

  for (const opt of options) {
    const optLabel = opt.label || opt
    const isChosen = chosen && (chosen.label === optLabel || chosen === optLabel)
    svg += `<circle cx="3" cy="${curY + 2}" r="1.5" fill="${isChosen ? accent : 'none'}" stroke="${accent}" stroke-width="0.3"/>`
    svg += svgText(6, curY + BODY_SIZE, optLabel, { size: BODY_SIZE, weight: isChosen ? 'bold' : 'normal' })
    curY += LINE_H
  }

  return { svg, height: curY - y + 1 }
}

// ─── RENDERER DISPATCH ─────────────────────────────────────────────────────
const SECTION_RENDERERS = {
  header: renderHeader,
  stats: renderStats,
  track: renderTrack,
  inventory: renderInventory,
  list: renderList,
  progress: renderProgress,
  skills: renderSkills,
  notes: renderNotes,
  assets: renderAssets,
  choices: renderChoices,
}

// ─── PAGE BUILDER ──────────────────────────────────────────────────────────
function buildPages(sections, chargen, tables, rng, mode, theme, userValues = null, rawData = null) {
  const pages = []
  let currentPage = []
  let currentY = 0

  for (const section of sections) {
    if (section.condition && mode === 'seeded') continue

    const values = resolveValues(section, chargen, tables, rng, mode, userValues, rawData)
    const renderer = SECTION_RENDERERS[section.type]
    if (!renderer) continue

    const result = renderer(section, values, 0, theme)

    if (currentY + result.height > CONTENT_H && currentPage.length > 0) {
      pages.push(currentPage)
      currentPage = []
      currentY = 0
    }

    currentPage.push({ svg: result.svg, y: currentY, height: result.height })
    currentY += result.height + 2
  }

  if (currentPage.length > 0) pages.push(currentPage)
  return pages
}

function renderPage(pageSections, pageNum, theme) {
  const bg = theme.background || '#faf6f0'
  const borderStyle = theme.borderStyle || 'simple'
  let border = ''
  if (borderStyle === 'ornate') {
    border = `<rect x="4" y="4" width="${PAGE_W - 8}" height="${PAGE_H - 8}" fill="none" stroke="${theme.accent || '#8d2e2e'}33" stroke-width="0.5" rx="2"/>`
  } else if (borderStyle === 'sci-fi') {
    border = `<rect x="4" y="4" width="${PAGE_W - 8}" height="${PAGE_H - 8}" fill="none" stroke="${theme.accent || '#5dade2'}44" stroke-width="0.4" rx="1"/>
<line x1="4" y1="8" x2="${PAGE_W - 4}" y2="8" stroke="${theme.accent || '#5dade2'}33" stroke-width="0.2"/>
<line x1="4" y1="${PAGE_H - 8}" x2="${PAGE_W - 4}" y2="${PAGE_H - 8}" stroke="${theme.accent || '#5dade2'}33" stroke-width="0.2"/>`
  } else {
    border = `<rect x="6" y="6" width="${PAGE_W - 12}" height="${PAGE_H - 12}" fill="none" stroke="${_palette.line}" stroke-width="0.3"/>`
  }

  let content = ''
  for (const section of pageSections) {
    content += `<g transform="translate(${MARGIN}, ${MARGIN + section.y})">${section.svg}</g>\n`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}mm" height="${PAGE_H}mm">
<rect width="${PAGE_W}" height="${PAGE_H}" fill="${bg}"/>
${border}
${content}
<text x="${PAGE_W - MARGIN}" y="${PAGE_H - 4}" font-family="${FONT}" font-size="2" fill="${_palette.muted}" text-anchor="end">Page ${pageNum}</text>
</svg>`
}

// ─── PUBLIC API ────────────────────────────────────────────────────────────
export async function renderCharacterSheet(gameKey, { mode = 'blank', seed = 42, userValues = null } = {}) {
  const manifest = await loadRpgManifest(gameKey, RULES_BASE)
  if (!manifest || !manifest.chargen) return null

  const chargen = manifest.chargen
  const rng = createRng(seed)

  const theme = chargen.theme && typeof chargen.theme === 'object'
    ? chargen.theme
    : { accent: '#8d2e2e', background: '#faf6f0', borderStyle: 'ornate' }

  const tables = mode === 'seeded'
    ? await resolveTables(chargen.tables || {}, gameKey, rng)
    : {}

  const rawData = mode === 'seeded'
    ? await resolveRawTableData(chargen.tables || {}, gameKey)
    : null

  _palette = buildPalette(theme)

  const renderMode = mode === 'interactive' ? 'interactive' : mode
  const sections = chargen.sections || []
  const pages = buildPages(sections, chargen, tables, rng, renderMode, theme, userValues, rawData)

  return pages.map((pageSections, i) => renderPage(pageSections, i + 1, theme))
}

// ─── PLAY PAGE INTEGRATION ─────────────────────────────────────────────────
let chargenState = { game: null, mode: 'blank', seed: 42, page: 0, pages: [] }

export async function renderChargenProvider(gameKey) {
  chargenState.game = gameKey
  chargenState.mode = 'blank'
  chargenState.seed = 42
  chargenState.page = 0
  chargenState.pages = []

  const container = document.getElementById('board-svg')
  const empty = document.getElementById('board-empty')
  const sidebar = document.getElementById('chargen-group')
  container.innerHTML = ''
  container.classList.add('active')
  if (empty) empty.style.display = 'none'

  // Sidebar controls
  sidebar.style.display = ''
  sidebar.innerHTML = `
    <div class="control-group">
      <label class="control-label">Mode</label>
      <div class="chargen-mode">
        <button class="chargen-btn chargen-btn--active" data-mode="blank">Blank</button>
        <button class="chargen-btn" data-mode="create">Create</button>
        <button class="chargen-btn" data-mode="seeded">Random</button>
      </div>
    </div>
    <div class="control-group chargen-seed-group" style="display:none">
      <label class="control-label">Seed</label>
      <div class="control-row">
        <input type="text" class="chargen-seed-input" value="42">
        <button class="btn btn-outline chargen-reseed" title="New seed">&#x21bb;</button>
      </div>
    </div>
    <div class="chargen-fields" style="display:none"></div>
    <div class="control-group chargen-io" style="display:none">
      <label class="control-label">Character Data</label>
      <div class="control-row">
        <button class="btn btn-outline chargen-export">Export JSON</button>
        <button class="btn btn-outline chargen-import">Import JSON</button>
      </div>
    </div>
  `

  // Canvas area with page nav
  const sheetWrapper = document.createElement('div')
  sheetWrapper.className = 'chargen-sheet-wrapper'
  sheetWrapper.innerHTML = `
    <div class="chargen-sheet"></div>
    <div class="chargen-nav" style="display:none">
      <button class="chargen-prev" disabled>&larr; Prev</button>
      <span class="chargen-page-info">Page 1 of 1</span>
      <button class="chargen-next" disabled>Next &rarr;</button>
    </div>
  `
  container.appendChild(sheetWrapper)
  const sheetEl = sheetWrapper.querySelector('.chargen-sheet')
  const navEl = sheetWrapper.querySelector('.chargen-nav')
  const prevBtn = sheetWrapper.querySelector('.chargen-prev')
  const nextBtn = sheetWrapper.querySelector('.chargen-next')
  const pageInfo = sheetWrapper.querySelector('.chargen-page-info')

  prevBtn.addEventListener('click', () => {
    if (chargenState.page > 0) { chargenState.page--; showPage() }
  })
  nextBtn.addEventListener('click', () => {
    if (chargenState.page < chargenState.pages.length - 1) { chargenState.page++; showPage() }
  })

  const modeButtons = sidebar.querySelectorAll('.chargen-btn')
  const seedGroup = sidebar.querySelector('.chargen-seed-group')
  const seedInput = sidebar.querySelector('.chargen-seed-input')
  const reseedBtn = sidebar.querySelector('.chargen-reseed')
  const fieldsEl = sidebar.querySelector('.chargen-fields')
  const ioGroup = sidebar.querySelector('.chargen-io')
  const exportBtn = sidebar.querySelector('.chargen-export')
  const importBtn = sidebar.querySelector('.chargen-import')

  let userValues = null
  let resolvedTables = null
  let rawTableData = null
  let chargenDef = null

  async function generate() {
    sheetEl.innerHTML = '<div class="chargen-loading">Generating...</div>'
    const pages = await renderCharacterSheet(gameKey, {
      mode: chargenState.mode === 'create' ? 'interactive' : chargenState.mode,
      seed: chargenState.seed,
      userValues: chargenState.mode === 'create' ? userValues : null,
    })
    if (!pages || pages.length === 0) {
      sheetEl.innerHTML = '<div class="chargen-error">No chargen block found in manifest for this game.</div>'
      return
    }
    chargenState.pages = pages
    if (chargenState.page >= pages.length) chargenState.page = pages.length - 1
    showPage()
  }

  function showPage() {
    const svg = chargenState.pages[chargenState.page]
    sheetEl.innerHTML = svg || ''
    const svgEl = sheetEl.querySelector('svg')
    if (svgEl) {
      svgEl.style.width = '100%'
      svgEl.style.height = 'auto'
      svgEl.style.maxHeight = 'calc(100vh - 200px)'
      svgEl.style.display = 'block'
      svgEl.style.margin = '0 auto'
    }
    navEl.style.display = chargenState.pages.length > 1 ? '' : 'none'
    pageInfo.textContent = `Page ${chargenState.page + 1} of ${chargenState.pages.length}`
    prevBtn.disabled = chargenState.page === 0
    nextBtn.disabled = chargenState.page >= chargenState.pages.length - 1
  }

  async function initCreateMode() {
    fieldsEl.style.display = ''
    fieldsEl.innerHTML = '<div class="chargen-loading">Loading...</div>'

    try {
      const manifest = await loadRpgManifest(gameKey, RULES_BASE)
      if (!manifest || !manifest.chargen) {
        fieldsEl.innerHTML = '<div class="chargen-error">No chargen data.</div>'
        return
      }

      chargenDef = manifest.chargen
      const rng = createRng(Date.now() >>> 0)
      resolvedTables = await resolveTables(chargenDef.tables || {}, gameKey, rng)
      rawTableData = await resolveRawTableData(chargenDef.tables || {}, gameKey)
      userValues = {}

      fieldsEl.innerHTML = ''
      const sections = chargenDef.sections || []

      for (const section of sections) {
        buildSidebarSection(section, chargenDef, rng)
      }

      generate()
    } catch (e) {
      fieldsEl.innerHTML = `<div class="chargen-error">${e.message}</div>`
    }
  }

  function buildSidebarSection(section, chargen, rng) {
    switch (section.type) {
      case 'header': {
        for (const field of (section.fields || [])) {
          const group = document.createElement('div')
          group.className = 'control-group'

          const tableData = resolvedTables[field.gen]
          const rawData = rawTableData?.[field.gen]
          const isDice = field.gen && field.gen.match(/^\d+d\d/)

          const isFreetextWithRoll = field.id.includes('name') || field.id === 'epithet' || field.id === 'callsign'

          if (isFreetextWithRoll && (rawData || tableData)) {
            // Freeform text + random roll button
            group.innerHTML = `<label class="control-label">${esc(field.label)}</label>
              <div class="control-row">
                <input type="text" data-field="${field.id}" placeholder="${esc(field.label)}">
                <button class="btn btn-outline chargen-roll" data-gen="${field.gen}" title="Roll">&#x21bb;</button>
              </div>`
          } else if (rawData && Array.isArray(rawData)) {
            // Full array available — dropdown (class, race, profession, etc.)
            let opts = `<option value="">-- ${esc(field.label)} --</option>`
            for (const item of rawData) {
              const val = typeof item === 'object' ? (item.name || item.result || '') : item
              opts += `<option value="${esc(val)}">${esc(val)}</option>`
            }
            group.innerHTML = `<label class="control-label">${esc(field.label)}</label><select data-field="${field.id}">${opts}</select>`
          } else if (tableData && typeof tableData === 'object' && !Array.isArray(tableData)) {
            // rollPerTable result — text + reroll
            group.innerHTML = `<label class="control-label">${esc(field.label)}</label>
              <div class="control-row">
                <input type="text" data-field="${field.id}" placeholder="${esc(field.label)}">
                <button class="btn btn-outline chargen-roll" data-gen="${field.gen}" title="Roll">&#x21bb;</button>
              </div>`
          } else if (isDice) {
            group.innerHTML = `<label class="control-label">${esc(field.label)}</label>
              <div class="control-row">
                <input type="text" data-field="${field.id}" placeholder="${field.gen}">
                <button class="btn btn-outline chargen-roll" data-dice="${field.gen}" title="Roll">&#x21bb;</button>
              </div>`
          } else if (field.inputType === 'number') {
            group.innerHTML = `<label class="control-label">${esc(field.label)}</label>
              <div class="control-row">
                <button class="chargen-stat-minus" data-field="${field.id}">-</button>
                <input type="text" inputmode="numeric" data-field="${field.id}" value="${field.default || ''}" data-min="${field.min || 1}" data-max="${field.max || 99}">
                <button class="chargen-stat-plus" data-field="${field.id}">+</button>
              </div>`
          } else {
            group.innerHTML = `<label class="control-label">${esc(field.label)}</label>
              <input type="text" data-field="${field.id}" placeholder="${esc(field.label)}">`
          }
          fieldsEl.appendChild(group)
        }
        break
      }
      case 'stats': {
        const stats = section.stats || []
        const group = document.createElement('div')
        group.className = 'control-group'
        let html = `<label class="control-label">Abilities</label><div class="chargen-stats-grid">`
        for (let i = 0; i < stats.length; i++) {
          const stat = stats[i]
          html += `<div class="chargen-stat">
            <span class="chargen-stat-label">${esc(stat.label)}</span>
            <button class="chargen-stat-minus" data-stat="${i}">-</button>
            <input type="text" inputmode="numeric" data-stat="${i}" value="" placeholder="${stat.range || '?'}">
            <button class="chargen-stat-plus" data-stat="${i}">+</button>
          </div>`
        }
        html += '</div>'
        if (stats.some(s => s.gen) || section.gen === 'assign') {
          html += `<button class="btn btn-outline chargen-roll-all" style="margin-top:6px;width:100%">Roll All</button>`
        }
        group.innerHTML = html
        fieldsEl.appendChild(group)
        break
      }
      case 'track': {
        const max = typeof section.max === 'number' ? section.max : 10
        const group = document.createElement('div')
        group.className = 'control-group'
        let html = `<label class="control-label">${esc(section.label)} <span style="opacity:0.5">/ ${max}</span></label>
          <div class="control-row">
            <button class="chargen-stat-minus" data-track="${section.label}">-</button>
            <input type="text" inputmode="numeric" data-track="${section.label}" value="${section.startValue || ''}" data-min="${section.min || 0}" data-max="${max}">
            <button class="chargen-stat-plus" data-track="${section.label}">+</button>`
        if (section.gen) {
          html += `<button class="btn btn-outline chargen-roll" data-dice="${section.gen}" data-target="track:${section.label}" title="Roll">&#x21bb;</button>`
        }
        html += '</div>'
        group.innerHTML = html
        fieldsEl.appendChild(group)
        break
      }
      case 'choices': {
        const options = section.options || []
        const group = document.createElement('div')
        group.className = 'control-group'
        let opts = `<option value="">-- Choose --</option>`
        for (const opt of options) {
          const label = opt.label || opt
          opts += `<option value="${esc(label)}">${esc(label)}</option>`
        }
        group.innerHTML = `<label class="control-label">${esc(section.label)}</label><select data-choice="${section.label}">${opts}</select>`
        fieldsEl.appendChild(group)
        break
      }
      case 'progress': {
        const tracks = section.tracks || 1
        const boxes = section.boxes || 10
        const ticks = section.ticks || 4
        const maxTicks = boxes * ticks
        const group = document.createElement('div')
        group.className = 'control-group'
        let html = `<label class="control-label">${esc(section.label)}</label>`
        for (let t = 0; t < tracks; t++) {
          html += '<div class="chargen-progress-track">'
          if (section.fields?.includes('title')) {
            html += `<input type="text" data-progress="${section.label}" data-track="${t}" data-prop="title" placeholder="Title ${t + 1}" style="margin-bottom:2px">`
          }
          if (section.ranks) {
            let rankOpts = '<option value="">-- Rank --</option>'
            for (const rank of section.ranks) {
              rankOpts += `<option value="${esc(rank)}">${esc(rank)}</option>`
            }
            html += `<select data-progress="${section.label}" data-track="${t}" data-prop="rank" style="margin-bottom:2px">${rankOpts}</select>`
          }
          html += `<div class="control-row" style="margin-bottom:4px">
            <span style="font-size:10px;color:#888">Ticks:</span>
            <button class="chargen-stat-minus" data-progress="${section.label}" data-track="${t}" data-prop="ticks">-</button>
            <input type="text" inputmode="numeric" data-progress="${section.label}" data-track="${t}" data-prop="ticks" value="0" data-min="0" data-max="${maxTicks}" style="width:36px;text-align:center">
            <button class="chargen-stat-plus" data-progress="${section.label}" data-track="${t}" data-prop="ticks">+</button>
            <span style="font-size:10px;color:#666">/ ${maxTicks}</span>
          </div>`
          html += '</div>'
        }
        group.innerHTML = html
        fieldsEl.appendChild(group)
        break
      }
      case 'assets': {
        const group = document.createElement('div')
        group.className = 'control-group'
        const assetCount = section.count || 3
        let html = `<label class="control-label">${esc(section.label)}</label>`

        // Get all available assets from rawTableData
        const assetRaw = section.gen ? rawTableData?.[section.gen] : null
        let allAssets = []
        if (assetRaw && Array.isArray(assetRaw)) {
          for (const item of assetRaw) {
            if (item.name) allAssets.push(item.name)
            else if (typeof item === 'string') allAssets.push(item)
          }
        }

        for (let i = 0; i < assetCount; i++) {
          const catLabel = section.categories?.[i] || `Asset ${i + 1}`
          html += `<div class="chargen-sub-label">${esc(catLabel)}</div>`
          if (allAssets.length) {
            let opts = `<option value="">-- Choose --</option>`
            for (const name of allAssets) {
              opts += `<option value="${esc(name)}">${esc(name)}</option>`
            }
            html += `<select data-asset="${section.label}" data-idx="${i}" style="margin-bottom:2px">${opts}</select>`
          } else {
            html += `<input type="text" data-asset="${section.label}" data-idx="${i}" placeholder="${esc(catLabel)}" style="margin-bottom:2px">`
          }
        }
        group.innerHTML = html
        fieldsEl.appendChild(group)
        break
      }
      case 'list': {
        if (section.items) {
          // Fixed checkbox lists — render as toggleable checkboxes
          const group = document.createElement('div')
          group.className = 'control-group'
          let html = `<label class="control-label">${esc(section.label)}</label><div class="chargen-checks">`
          for (let i = 0; i < section.items.length; i++) {
            html += `<label class="chargen-check"><input type="checkbox" data-check="${section.label}" data-idx="${i}"> ${esc(section.items[i])}</label>`
          }
          html += '</div>'
          group.innerHTML = html
          fieldsEl.appendChild(group)
          break
        }
        const group = document.createElement('div')
        group.className = 'control-group'
        let html = `<label class="control-label">${esc(section.label)}</label>`

        // Column-style with table gen — each column gets a dropdown
        if (section.columns && section.gen && resolvedTables[section.gen]) {
          const tableData = resolvedTables[section.gen]
          const tableRef = chargenDef.tables?.[section.gen]
          for (const col of section.columns) {
            const fullEntries = rawTableData?.[section.gen]?.[col]
            if (fullEntries && Array.isArray(fullEntries)) {
              let opts = `<option value="">-- ${esc(col)} --</option>`
              for (const entry of fullEntries) {
                const val = typeof entry === 'object' ? (entry.result || entry.name || '') : entry
                opts += `<option value="${esc(val)}">${esc(val)}</option>`
              }
              html += `<select data-list="${section.label}" data-col="${col}" style="margin-bottom:3px">${opts}</select>`
            } else {
              html += `<input type="text" data-list="${section.label}" data-col="${col}" placeholder="${esc(col)}" style="margin-bottom:3px">`
            }
          }
        } else if (section.gen && rawTableData?.[section.gen]) {
          // Non-column list with table backing — dropdowns per slot
          const count = Math.min(section.count || 4, 6)
          const entries = Array.isArray(rawTableData[section.gen]) ? rawTableData[section.gen] : []
          if (entries.length) {
            for (let i = 0; i < count; i++) {
              let opts = `<option value="">-- ${esc(section.label)} ${i + 1} --</option>`
              for (const entry of entries) {
                const val = typeof entry === 'object' ? (entry.name || entry.result || '') : entry
                opts += `<option value="${esc(val)}">${esc(val)}</option>`
              }
              html += `<select data-list="${section.label}" data-idx="${i}" style="margin-bottom:3px">${opts}</select>`
            }
          }
        } else {
          const count = Math.min(section.count || 4, 6)
          for (let i = 0; i < count; i++) {
            html += `<input type="text" data-list="${section.label}" data-idx="${i}" placeholder="${esc(section.label)} ${i + 1}" style="margin-bottom:3px">`
          }
        }
        group.innerHTML = html
        fieldsEl.appendChild(group)
        break
      }
      case 'inventory': {
        const group = document.createElement('div')
        group.className = 'control-group'
        const slots = typeof section.slots === 'number' ? section.slots : (section.lines || 8)
        const count = Math.min(slots, 10)
        let html = `<label class="control-label">${esc(section.label)}</label>`

        // Build item options from gen data if available
        const invRaw = section.gen ? rawTableData?.[section.gen] : null
        let itemOptions = null
        if (invRaw && Array.isArray(invRaw)) {
          const allItems = []
          for (const entry of invRaw) {
            if (entry.entries) {
              for (const item of entry.entries) {
                const val = typeof item === 'object' ? (item.result || item.name || '') : item
                if (val) allItems.push(val)
              }
            } else if (typeof entry === 'object') {
              const val = entry.name || entry.result || ''
              if (val) allItems.push(val)
            } else if (typeof entry === 'string') {
              allItems.push(entry)
            }
          }
          if (allItems.length) itemOptions = [...new Set(allItems)].sort()
        }

        function makeItemInput(dataAttrs, placeholder) {
          if (itemOptions) {
            let opts = `<option value="">-- ${esc(placeholder)} --</option>`
            for (const item of itemOptions) {
              opts += `<option value="${esc(item)}">${esc(item)}</option>`
            }
            return `<select ${dataAttrs} style="margin-bottom:2px">${opts}</select>`
          }
          return `<input type="text" ${dataAttrs} placeholder="${esc(placeholder)}" style="margin-bottom:2px">`
        }

        if (section.model === 'location' && section.sections) {
          for (const sub of section.sections) {
            html += `<div class="chargen-sub-label">${esc(sub.label)}</div>`
            for (let i = 0; i < (sub.slots || 2); i++) {
              html += makeItemInput(`data-inv="${section.label}" data-sub="${sub.label}" data-idx="${i}"`, `${sub.label} ${i + 1}`)
            }
          }
        } else {
          for (let i = 0; i < count; i++) {
            html += makeItemInput(`data-inv="${section.label}" data-idx="${i}"`, `Item ${i + 1}`)
          }
        }
        group.innerHTML = html
        fieldsEl.appendChild(group)
        break
      }
      case 'notes': {
        const group = document.createElement('div')
        group.className = 'control-group'
        const lines = Math.min(section.lines || 4, 6)
        let html = `<label class="control-label">${esc(section.label)}</label>`
        html += `<textarea data-notes="${section.label}" rows="${lines}" placeholder="${esc(section.label)}" style="width:100%;resize:vertical"></textarea>`
        group.innerHTML = html
        fieldsEl.appendChild(group)
        break
      }
      case 'skills': {
        const group = document.createElement('div')
        group.className = 'control-group'
        const skills = section.skills || []
        let html = `<label class="control-label">${esc(section.label)} (${skills.length})</label>`
        if (skills.length > 0) {
          html += '<div class="chargen-skills-list">'
          for (let i = 0; i < skills.length; i++) {
            const skill = skills[i]
            html += `<div class="chargen-skill-row">
              <span class="chargen-skill-name">${esc(skill.name)}</span>
              <input type="text" inputmode="numeric" data-skill="${i}" placeholder="${skill.base || '0'}" style="width:36px;text-align:center">
            </div>`
          }
          html += '</div>'
        }
        group.innerHTML = html
        fieldsEl.appendChild(group)
        break
      }
    }
  }

  function syncFieldsToValues() {
    userValues = {}
    fieldsEl.querySelectorAll('input[data-field], select[data-field]').forEach(el => {
      if (el.value) userValues[el.dataset.field] = el.value
    })
    const statInputs = fieldsEl.querySelectorAll('input[data-stat]')
    if (statInputs.length) {
      userValues._stats = []
      statInputs.forEach(inp => userValues._stats.push(inp.value ? parseInt(inp.value) : ''))
    }
    fieldsEl.querySelectorAll('input[data-track]').forEach(inp => {
      if (inp.value) userValues['_track_' + inp.dataset.track] = parseInt(inp.value)
    })
    fieldsEl.querySelectorAll('select[data-choice]').forEach(sel => {
      if (sel.value) userValues['_choice_' + sel.dataset.choice] = sel.value
    })
    const lists = {}
    fieldsEl.querySelectorAll('input[data-list], select[data-list]').forEach(el => {
      const key = el.dataset.list
      if (!el.value) return
      if (el.dataset.col) {
        if (!lists[key]) lists[key] = {}
        lists[key][el.dataset.col] = el.value
      } else if (el.dataset.idx !== undefined) {
        if (!lists[key]) lists[key] = []
        lists[key][parseInt(el.dataset.idx)] = el.value
      }
    })
    for (const [k, v] of Object.entries(lists)) {
      if (Array.isArray(v)) {
        if (v.some(Boolean)) userValues['_list_' + k] = v
      } else {
        userValues['_list_' + k] = v
      }
    }

    // Inventory
    const invs = {}
    fieldsEl.querySelectorAll('input[data-inv], select[data-inv]').forEach(el => {
      const key = el.dataset.inv
      if (!el.value) return
      if (el.dataset.sub) {
        if (!invs[key]) invs[key] = {}
        if (!invs[key][el.dataset.sub]) invs[key][el.dataset.sub] = []
        invs[key][el.dataset.sub][parseInt(el.dataset.idx)] = el.value
      } else {
        if (!invs[key]) invs[key] = { items: [] }
        invs[key].items[parseInt(el.dataset.idx)] = el.value
      }
    })
    for (const [k, v] of Object.entries(invs)) {
      userValues['_inv_' + k] = v
    }

    // Notes
    fieldsEl.querySelectorAll('textarea[data-notes]').forEach(el => {
      if (el.value) userValues['_notes_' + el.dataset.notes] = el.value
    })

    // Skills
    const skillInputs = fieldsEl.querySelectorAll('input[data-skill]')
    if (skillInputs.length) {
      userValues._skills = []
      skillInputs.forEach(inp => userValues._skills.push(inp.value || ''))
    }

    // Checkboxes (saving throws, debilities, impacts)
    const checks = {}
    fieldsEl.querySelectorAll('input[data-check]').forEach(inp => {
      const key = inp.dataset.check
      if (!checks[key]) checks[key] = []
      if (inp.checked) checks[key].push(parseInt(inp.dataset.idx))
    })
    for (const [k, v] of Object.entries(checks)) {
      if (v.length) userValues['_checks_' + k] = v
    }

    // Assets
    const assets = {}
    fieldsEl.querySelectorAll('select[data-asset], input[data-asset]').forEach(el => {
      const key = el.dataset.asset
      if (!el.value) return
      if (!assets[key]) assets[key] = []
      assets[key][parseInt(el.dataset.idx)] = el.value
    })
    for (const [k, v] of Object.entries(assets)) {
      if (v.some(Boolean)) userValues['_assets_' + k] = v
    }

    // Progress tracks (vows, bonds)
    const progress = {}
    fieldsEl.querySelectorAll('[data-progress]').forEach(el => {
      const key = el.dataset.progress
      const track = parseInt(el.dataset.track)
      const prop = el.dataset.prop
      if (!el.value) return
      if (!progress[key]) progress[key] = {}
      if (!progress[key][track]) progress[key][track] = {}
      progress[key][track][prop] = el.value
    })
    for (const [k, v] of Object.entries(progress)) {
      userValues['_progress_' + k] = v
    }
  }

  // Event delegation on fields panel
  fieldsEl.addEventListener('input', () => { syncFieldsToValues(); generate() })
  fieldsEl.addEventListener('change', () => { syncFieldsToValues(); generate() })

  fieldsEl.addEventListener('click', e => {
    const rollBtn = e.target.closest('.chargen-roll')
    if (rollBtn) {
      const dice = rollBtn.dataset.dice
      const gen = rollBtn.dataset.gen
      const target = rollBtn.dataset.target
      const rng = createRng(Date.now() >>> 0)

      if (target && target.startsWith('track:')) {
        const trackName = target.slice(6)
        const input = fieldsEl.querySelector(`input[data-track="${trackName}"]`)
        if (input && dice) input.value = rollDiceExpression(dice, rng)
      } else if (dice) {
        const input = rollBtn.closest('.control-row')?.querySelector('input')
        if (input) input.value = rollDiceExpression(dice, rng)
      } else if (gen) {
        const input = rollBtn.closest('.control-row')?.querySelector('input')
        if (!input) { /* skip */ }
        else if (rawTableData?.[gen] && Array.isArray(rawTableData[gen])) {
          const arr = rawTableData[gen]
          const pick = arr[rng.nextInt(0, arr.length - 1)]
          input.value = typeof pick === 'object' ? (pick.name || pick.result || '') : pick
        } else if (rawTableData?.[gen] && typeof rawTableData[gen] === 'object') {
          // rollPerTable — pick from first available sub-table
          const subTables = Object.values(rawTableData[gen])
          const combined = subTables.flat()
          if (combined.length) {
            const pick = combined[rng.nextInt(0, combined.length - 1)]
            input.value = typeof pick === 'object' ? (pick.name || pick.result || '') : pick
          }
        } else if (resolvedTables[gen]) {
          const data = resolvedTables[gen]
          if (typeof data === 'object' && !Array.isArray(data)) {
            const entries = Object.values(data)
            const pick = entries[rng.nextInt(0, entries.length - 1)]
            input.value = typeof pick === 'object' ? (pick.name || pick.result || '') : pick
          }
        }
      }
      syncFieldsToValues()
      generate()
    }

    const rollAll = e.target.closest('.chargen-roll-all')
    if (rollAll) {
      const rng = createRng(Date.now() >>> 0)
      const statInputs = fieldsEl.querySelectorAll('input[data-stat]')
      const section = chargenDef?.sections?.find(s => s.type === 'stats')
      if (section) {
        if (section.gen === 'assign' && section.genValues) {
          const shuffled = rng.shuffle([...section.genValues])
          statInputs.forEach((inp, i) => { inp.value = shuffled[i] || '' })
        } else {
          const stats = section.stats || []
          statInputs.forEach((inp, i) => {
            const gen = stats[i]?.gen
            inp.value = gen ? rollDiceExpression(gen, rng) : ''
          })
        }
      }
      syncFieldsToValues()
      generate()
    }

    const minus = e.target.closest('.chargen-stat-minus')
    if (minus) {
      const stat = minus.dataset.stat
      const track = minus.dataset.track
      const field = minus.dataset.field
      const input = stat !== undefined
        ? fieldsEl.querySelector(`input[data-stat="${stat}"]`)
        : track ? fieldsEl.querySelector(`input[data-track="${track}"]`)
        : field ? minus.parentElement.querySelector(`input[data-field="${field}"]`)
        : null
      if (input) {
        const val = parseInt(input.value) || 0
        const min = parseInt(input.dataset.min) || 0
        if (val > min) input.value = val - 1
      }
      syncFieldsToValues()
      generate()
    }

    const plus = e.target.closest('.chargen-stat-plus')
    if (plus) {
      const stat = plus.dataset.stat
      const track = plus.dataset.track
      const field = plus.dataset.field
      const input = stat !== undefined
        ? fieldsEl.querySelector(`input[data-stat="${stat}"]`)
        : track ? fieldsEl.querySelector(`input[data-track="${track}"]`)
        : field ? plus.parentElement.querySelector(`input[data-field="${field}"]`)
        : null
      if (input) {
        const val = parseInt(input.value) || 0
        const max = parseInt(input.dataset.max) || 30
        if (val < max) input.value = val + 1
      }
      syncFieldsToValues()
      generate()
    }
  })

  // Mode switching
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      modeButtons.forEach(b => b.classList.remove('chargen-btn--active'))
      btn.classList.add('chargen-btn--active')
      chargenState.mode = btn.dataset.mode
      seedGroup.style.display = chargenState.mode === 'seeded' ? '' : 'none'
      fieldsEl.style.display = chargenState.mode === 'create' ? '' : 'none'
      ioGroup.style.display = chargenState.mode === 'create' ? '' : 'none'
      if (chargenState.mode === 'create') {
        initCreateMode()
      } else {
        generate()
      }
    })
  })

  seedInput.addEventListener('change', () => {
    chargenState.seed = parseInt(seedInput.value) || 42
    if (chargenState.mode === 'seeded') generate()
  })

  reseedBtn.addEventListener('click', () => {
    chargenState.seed = Math.floor(Math.random() * 999999999)
    seedInput.value = chargenState.seed
    if (chargenState.mode === 'seeded') generate()
  })

  exportBtn.addEventListener('click', () => {
    if (!userValues || !Object.keys(userValues).length) return
    const data = { game: gameKey, version: 1, values: userValues }
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${gameKey}-character.json`
    a.click()
    URL.revokeObjectURL(url)
  })

  importBtn.addEventListener('click', () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.addEventListener('change', async () => {
      const file = input.files[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        if (data.values && typeof data.values === 'object') {
          userValues = data.values
          // Populate sidebar fields from imported values
          fieldsEl.querySelectorAll('input[data-field], select[data-field]').forEach(el => {
            if (userValues[el.dataset.field]) el.value = userValues[el.dataset.field]
          })
          fieldsEl.querySelectorAll('input[data-stat]').forEach((inp, i) => {
            if (userValues._stats?.[i]) inp.value = userValues._stats[i]
          })
          fieldsEl.querySelectorAll('input[data-track]').forEach(inp => {
            const val = userValues['_track_' + inp.dataset.track]
            if (val !== undefined) inp.value = val
          })
          fieldsEl.querySelectorAll('select[data-choice]').forEach(sel => {
            const val = userValues['_choice_' + sel.dataset.choice]
            if (val) sel.value = val
          })
          fieldsEl.querySelectorAll('textarea[data-notes]').forEach(el => {
            const val = userValues['_notes_' + el.dataset.notes]
            if (val) el.value = val
          })
          generate()
        }
      } catch (e) {
        console.error('Import failed:', e)
      }
    })
    input.click()
  })

  await generate()
}
