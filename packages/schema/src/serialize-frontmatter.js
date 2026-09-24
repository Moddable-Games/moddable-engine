// The one frontmatter writer, and the inverse of parse-frontmatter.js.
//
// Written as a single recursive entry writer. It used to be a set of cases, one
// per nesting shape it had met, and a shape it had not met came out as
// `[object Object]`: a xiangqi palace's `regions: [{ rows, cols }]` sits in an
// object inside a list inside a list, and every board that drew one lost it on
// export. Whatever the parser reads, this writes.

export function serializeFrontmatter(meta) {
  const lines = ['---']
  for (const [key, value] of Object.entries(meta)) writeEntry(key, value, lines, '')
  lines.push('---')
  return lines.join('\n')
}

function writeEntry(key, value, lines, pad) {
  if (value === null || value === undefined) return
  if (Array.isArray(value)) {
    writeArray(key, value, lines, pad)
  } else if (isPlainObject(value)) {
    // An empty block is written `{}`. A bare `key:` reads back as nothing, and
    // `plugins: { xiangqi: {} }` is how a variant names its family.
    if (Object.keys(value).length === 0) {
      lines.push(`${pad}${key}: {}`)
      return
    }
    lines.push(`${pad}${key}:`)
    for (const [k, v] of Object.entries(value)) writeEntry(k, v, lines, pad + '  ')
  } else {
    lines.push(`${pad}${key}: ${scalar(value)}`)
  }
}

function writeArray(key, arr, lines, pad) {
  if (arr.length === 0) {
    lines.push(`${pad}${key}: []`)
    return
  }
  // A list of plain values reads best on one line: `players: [white, black]`.
  if (arr.every(item => !isPlainObject(item) && !Array.isArray(item) && flowSafe(item))) {
    lines.push(`${pad}${key}: ${flow(arr)}`)
    return
  }
  lines.push(`${pad}${key}:`)
  for (const item of arr) writeItem(item, lines, pad + '  ')
}

// One list item. A map's first entry shares the dash line and the rest line up
// under it, which is where the parser looks for them.
function writeItem(item, lines, pad) {
  if (!isPlainObject(item)) {
    lines.push(`${pad}- ${Array.isArray(item) || flowSafe(item) ? flow(item) : scalar(item)}`)
    return
  }
  const entries = Object.entries(item).filter(([, v]) => v !== null && v !== undefined)
  if (!entries.length) {
    lines.push(`${pad}- {}`)
    return
  }
  const [firstKey, firstValue] = entries[0]
  const first = []
  writeEntry(firstKey, firstValue, first, '')
  lines.push(`${pad}- ${first[0]}`)
  for (const line of first.slice(1)) lines.push(`${pad}  ${line}`)
  for (const [k, v] of entries.slice(1)) writeEntry(k, v, lines, pad + '  ')
}

// Flow style (`[a, b]`, `{ k: v }`) splits on commas and brackets without
// regard to quotes, so a string holding one cannot be written inside it.
function flowSafe(value) {
  if (typeof value === 'string') return !/[,[\]{}\n]/.test(value)
  if (Array.isArray(value)) return value.every(flowSafe)
  if (isPlainObject(value)) return Object.entries(value).every(([k, v]) => flowSafe(k) && !/:/.test(k) && flowSafe(v))
  return true
}

function flow(value) {
  if (Array.isArray(value)) return `[${value.map(flow).join(', ')}]`
  if (isPlainObject(value)) {
    const inner = Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${flow(v)}`)
    return `{${inner.join(', ')}}`
  }
  return scalar(value)
}

function scalar(value) {
  if (value === true) return 'true'
  if (value === false) return 'false'
  if (value === null) return 'null'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    if (value.includes(':') || value.includes('#') || value.includes('"') ||
        value.includes("'") || value.startsWith('[') || value.startsWith('{') ||
        value.startsWith('- ') || value === '' || /^-?\d/.test(value) ||
        value === 'true' || value === 'false' || value === 'null' || value !== value.trim()) {
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    }
    return value
  }
  if (Array.isArray(value) || isPlainObject(value)) return flow(value)
  return String(value)
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}
