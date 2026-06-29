const DELIMITER = '---'

export function parseFrontmatter(content) {
  const lines = content.split('\n')
  if (lines[0].trim() !== DELIMITER) {
    return { meta: {}, body: content }
  }

  let endIndex = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === DELIMITER) {
      endIndex = i
      break
    }
  }

  if (endIndex === -1) {
    return { meta: {}, body: content }
  }

  const yamlLines = lines.slice(1, endIndex)
  const meta = parseYaml(yamlLines)
  const body = lines.slice(endIndex + 1).join('\n')
  return { meta, body }
}

function parseYaml(lines) {
  return parseBlock(lines, 0, lines.length, 0)
}

function parseBlock(lines, start, end, baseIndent) {
  const result = {}
  let i = start

  while (i < end) {
    const line = lines[i]
    if (line.trim() === '' || line.trim().startsWith('#')) { i++; continue }

    const indent = line.search(/\S/)
    if (indent < baseIndent) break

    const trimmed = line.trim()

    if (trimmed.startsWith('- ')) {
      i++
      continue
    }

    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) { i++; continue }

    const key = trimmed.slice(0, colonIdx).trim()
    const rawValue = trimmed.slice(colonIdx + 1).trim()

    if (rawValue === '' || rawValue === '|' || rawValue === '>') {
      const childIndent = findChildIndent(lines, i + 1, end)
      if (childIndent === -1) {
        result[key] = {}
        i++
        continue
      }

      const blockEnd = findBlockEnd(lines, i + 1, end, childIndent)

      if (isListBlock(lines, i + 1, blockEnd, childIndent)) {
        result[key] = parseList(lines, i + 1, blockEnd, childIndent)
      } else {
        result[key] = parseBlock(lines, i + 1, blockEnd, childIndent)
      }
      i = blockEnd
    } else {
      result[key] = parseValue(rawValue)
      i++
    }
  }

  return result
}

function parseList(lines, start, end, baseIndent) {
  const items = []
  let i = start

  while (i < end) {
    const line = lines[i]
    if (line.trim() === '' || line.trim().startsWith('#')) { i++; continue }

    const indent = line.search(/\S/)
    if (indent < baseIndent) break

    const trimmed = line.trim()
    if (!trimmed.startsWith('- ')) { i++; continue }

    const itemContent = trimmed.slice(2)
    const itemColonIdx = itemContent.indexOf(':')

    if (itemColonIdx === -1 || itemContent.startsWith('[')) {
      items.push(parseValue(itemContent))
      i++
    } else {
      const itemObj = {}
      const firstKey = itemContent.slice(0, itemColonIdx).trim()
      const firstVal = itemContent.slice(itemColonIdx + 1).trim()

      if (firstVal === '' || firstVal === '|' || firstVal === '>') {
        const childIndent = findChildIndent(lines, i + 1, end)
        if (childIndent === -1) {
          itemObj[firstKey] = {}
          i++
        } else {
          const blockEnd = findBlockEnd(lines, i + 1, end, childIndent)
          if (isListBlock(lines, i + 1, blockEnd, childIndent)) {
            itemObj[firstKey] = parseList(lines, i + 1, blockEnd, childIndent)
          } else {
            itemObj[firstKey] = parseBlock(lines, i + 1, blockEnd, childIndent)
          }
          i = blockEnd
        }
      } else {
        itemObj[firstKey] = parseValue(firstVal)
        i++
      }

      const propIndent = indent + 2
      while (i < end) {
        const propLine = lines[i]
        if (propLine.trim() === '' || propLine.trim().startsWith('#')) { i++; continue }
        const pIndent = propLine.search(/\S/)
        if (pIndent < propIndent) break
        if (propLine.trim().startsWith('- ')) break

        const pTrimmed = propLine.trim()
        const pColon = pTrimmed.indexOf(':')
        if (pColon === -1) { i++; continue }

        const pKey = pTrimmed.slice(0, pColon).trim()
        const pRawVal = pTrimmed.slice(pColon + 1).trim()

        if (pRawVal === '' || pRawVal === '|' || pRawVal === '>') {
          const childIndent = findChildIndent(lines, i + 1, end)
          if (childIndent === -1) {
            itemObj[pKey] = {}
            i++
          } else {
            const blockEnd = findBlockEnd(lines, i + 1, end, childIndent)
            if (isListBlock(lines, i + 1, blockEnd, childIndent)) {
              itemObj[pKey] = parseList(lines, i + 1, blockEnd, childIndent)
            } else {
              itemObj[pKey] = parseBlock(lines, i + 1, blockEnd, childIndent)
            }
            i = blockEnd
          }
        } else {
          itemObj[pKey] = parseValue(pRawVal)
          i++
        }
      }

      items.push(itemObj)
    }
  }

  return items
}

function isListBlock(lines, start, end, baseIndent) {
  for (let i = start; i < end; i++) {
    const line = lines[i]
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    const indent = line.search(/\S/)
    if (indent === baseIndent) {
      return line.trim().startsWith('- ')
    }
  }
  return false
}

function findChildIndent(lines, start, end) {
  for (let i = start; i < end; i++) {
    const line = lines[i]
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    return line.search(/\S/)
  }
  return -1
}

function findBlockEnd(lines, start, end, childIndent) {
  for (let i = start; i < end; i++) {
    const line = lines[i]
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    const indent = line.search(/\S/)
    if (indent < childIndent) return i
  }
  return end
}

function parseValue(raw) {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null
  if (raw === '{}') return {}
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10)
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw)
  if ((raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1)
  }
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return parseInlineArray(raw)
  }
  return raw
}

function parseInlineArray(raw) {
  const inner = raw.slice(1, -1).trim()
  if (inner === '') return []
  const items = splitRespectingBrackets(inner)
  return items.map(s => parseValue(s.trim()))
}

function splitRespectingBrackets(str) {
  const results = []
  let depth = 0
  let current = ''
  for (const ch of str) {
    if (ch === '[') { depth++; current += ch }
    else if (ch === ']') { depth--; current += ch }
    else if (ch === ',' && depth === 0) { results.push(current); current = '' }
    else { current += ch }
  }
  if (current) results.push(current)
  return results
}
