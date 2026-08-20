export function serializeFrontmatter(meta) {
  const lines = ['---']
  serializeObject(meta, lines, 0)
  lines.push('---')
  return lines.join('\n')
}

function serializeObject(obj, lines, indent) {
  const prefix = '  '.repeat(indent)
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value)) {
      serializeArray(key, value, lines, indent)
    } else if (typeof value === 'object') {
      lines.push(`${prefix}${key}:`)
      serializeObject(value, lines, indent + 1)
    } else {
      lines.push(`${prefix}${key}: ${serializeValue(value)}`)
    }
  }
}

function serializeArray(key, arr, lines, indent) {
  const prefix = '  '.repeat(indent)
  if (arr.length === 0) {
    lines.push(`${prefix}${key}: []`)
    return
  }

  if (arr.every(item => typeof item !== 'object' || item === null)) {
    if (arr.every(item => typeof item === 'string' && !item.includes(',') && !item.includes(']'))) {
      lines.push(`${prefix}${key}: [${arr.join(', ')}]`)
    } else {
      lines.push(`${prefix}${key}:`)
      for (const item of arr) {
        lines.push(`${prefix}  - ${serializeValue(item)}`)
      }
    }
    return
  }

  if (arr.every(item => Array.isArray(item))) {
    lines.push(`${prefix}${key}:`)
    for (const item of arr) {
      lines.push(`${prefix}  - [${item.map(serializeValue).join(', ')}]`)
    }
    return
  }

  lines.push(`${prefix}${key}:`)
  for (const item of arr) {
    if (typeof item === 'object' && item !== null) {
      const entries = Object.entries(item)
      if (entries.length > 0) {
        const [firstKey, firstVal] = entries[0]
        if (typeof firstVal === 'object' && firstVal !== null && !Array.isArray(firstVal)) {
          lines.push(`${prefix}  - ${firstKey}:`)
          serializeObject(firstVal, lines, indent + 3)
        } else if (Array.isArray(firstVal)) {
          lines.push(`${prefix}  - ${firstKey}:`)
          for (const v of firstVal) {
            lines.push(`${prefix}      - ${serializeValue(v)}`)
          }
        } else {
          lines.push(`${prefix}  - ${firstKey}: ${serializeValue(firstVal)}`)
        }
        for (let i = 1; i < entries.length; i++) {
          const [k, v] = entries[i]
          if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
            lines.push(`${prefix}    ${k}:`)
            serializeObject(v, lines, indent + 3)
          } else if (Array.isArray(v)) {
            serializeArrayProp(k, v, lines, indent + 2)
          } else {
            lines.push(`${prefix}    ${k}: ${serializeValue(v)}`)
          }
        }
      }
    } else {
      lines.push(`${prefix}  - ${serializeValue(item)}`)
    }
  }
}

function serializeArrayProp(key, arr, lines, indent) {
  const prefix = '  '.repeat(indent)
  if (arr.every(item => typeof item !== 'object')) {
    lines.push(`${prefix}${key}: [${arr.map(serializeValue).join(', ')}]`)
  } else {
    lines.push(`${prefix}${key}:`)
    for (const item of arr) {
      lines.push(`${prefix}  - ${serializeValue(item)}`)
    }
  }
}

function serializeValue(value) {
  if (value === true) return 'true'
  if (value === false) return 'false'
  if (value === null) return 'null'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    if (value.includes(':') || value.includes('#') || value.includes('"') ||
        value.includes("'") || value.startsWith('[') || value.startsWith('{') ||
        value === '' || /^\d/.test(value) || value === 'true' || value === 'false' || value === 'null') {
      return `"${value.replace(/"/g, '\\"')}"`
    }
    return value
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeValue).join(', ')}]`
  }
  return String(value)
}
