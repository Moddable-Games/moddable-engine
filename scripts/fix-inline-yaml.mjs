#!/usr/bin/env node
/**
 * Fix inline YAML objects in frontmatter — convert {key: val, ...} to expanded multi-line format.
 * The parse-frontmatter.js parser doesn't handle flow-style inline objects.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const RULES_ROOT = join(process.cwd(), '..', 'moddable-rules', 'games', 'chess', 'content', 'variants')

const files = process.argv.slice(2)
if (files.length === 0) {
  // Find all files with inline objects
  const { readdirSync } = await import('fs')
  const all = readdirSync(RULES_ROOT).filter(f => f.endsWith('.md'))
  for (const f of all) {
    const content = readFileSync(join(RULES_ROOT, f), 'utf8')
    if (/^\s+\w+:.*\{/m.test(content)) files.push(join(RULES_ROOT, f))
  }
}

function expandInlineObject(line, baseIndent) {
  // Match: key: {k1: v1, k2: v2, ...}
  const match = line.match(/^(\s+)(\w+): \{(.+)\}$/)
  if (!match) return null
  const [, indent, key, inner] = match

  // Parse the inner key:value pairs — handle nested arrays and objects
  const pairs = []
  let remaining = inner.trim()
  while (remaining.length > 0) {
    const keyMatch = remaining.match(/^(\w+): /)
    if (!keyMatch) break
    remaining = remaining.slice(keyMatch[0].length)
    const pairKey = keyMatch[1]

    let value
    if (remaining.startsWith('[')) {
      const end = remaining.indexOf(']')
      value = remaining.slice(0, end + 1)
      remaining = remaining.slice(end + 1).replace(/^,\s*/, '')
    } else if (remaining.startsWith('{')) {
      let depth = 0, i = 0
      for (; i < remaining.length; i++) {
        if (remaining[i] === '{') depth++
        if (remaining[i] === '}') { depth--; if (depth === 0) break }
      }
      value = remaining.slice(0, i + 1)
      remaining = remaining.slice(i + 1).replace(/^,\s*/, '')
    } else {
      const end = remaining.indexOf(',')
      if (end === -1) {
        value = remaining.trim()
        remaining = ''
      } else {
        value = remaining.slice(0, end).trim()
        remaining = remaining.slice(end + 1).trim()
      }
    }
    pairs.push([pairKey, value])
  }

  const childIndent = indent + '  '
  const lines = [`${indent}${key}:`]
  for (const [k, v] of pairs) {
    if (v.startsWith('{')) {
      // Recursively expand nested objects
      const expanded = expandInlineObject(`${childIndent}${k}: ${v}`, childIndent)
      if (expanded) {
        lines.push(...expanded)
      } else {
        lines.push(`${childIndent}${k}: ${v}`)
      }
    } else {
      lines.push(`${childIndent}${k}: ${v}`)
    }
  }
  return lines
}

let fixedCount = 0
for (const filePath of files) {
  const content = readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  const newLines = []
  let changed = false

  for (const line of lines) {
    if (/^\s+\w+:.*\{/.test(line)) {
      const expanded = expandInlineObject(line, '')
      if (expanded) {
        newLines.push(...expanded)
        changed = true
        continue
      }
    }
    newLines.push(line)
  }

  if (changed) {
    writeFileSync(filePath, newLines.join('\n'))
    fixedCount++
    console.log(`Fixed: ${filePath.split('/').pop()}`)
  }
}

console.log(`\nFixed ${fixedCount} files`)
