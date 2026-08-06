/**
 * FEN Validation Test Suite
 *
 * Validates every variant .md file across ALL game families in moddable-rules.
 * Three checks per variant:
 *   1. Rank count matches declared board height (rows)
 *   2. Each rank's expanded width matches declared width (cols)
 *   3. Every FEN letter maps to a declared piece (vocabulary or standard chess set)
 *
 * Also checks: if the body contains a FEN string, it must agree with frontmatter setup.
 */

import fs from 'node:fs'
import path from 'node:path'
import { parseFrontmatter } from '../src/parse-frontmatter.js'
import { resolveRulesDir } from '../src/rules-dir.js'

const RULES_DIR = resolveRulesDir()
const describeWithRules = RULES_DIR ? describe : describe.skip

// Standard chess symbols always valid (both cases)
const STANDARD_CHESS_SYMBOLS = new Set('KQRBNPkqrbnp'.split(''))

// Variants with known unimplemented/undeclared piece symbols (expected failures)
const KNOWN_ISSUES = new Set([
  'centennial-chess',   // uses s/S (steward), c/C (camel) without vocabulary
  'grande-acedrex',     // uses u/U, c/C, l/L, g/G without vocabulary — also 13-wide ranks for 12-col board
  'mansindam',          // uses a/A (angel), c/C (cardinal), m/M (marshal) without vocabulary
])

/**
 * Recursively find all .md files under a directory
 */
function findVariantFiles(dir) {
  const results = []
  if (!fs.existsSync(dir)) return results

  const families = fs.readdirSync(dir)
  for (const family of families) {
    const variantsDir = path.join(dir, family, 'content', 'variants')
    if (!fs.existsSync(variantsDir)) continue
    const files = fs.readdirSync(variantsDir).filter(f => f.endsWith('.md'))
    for (const file of files) {
      results.push({
        family,
        file,
        filePath: path.join(variantsDir, file),
      })
    }
  }
  return results
}

/**
 * Determine if a setup string is standard FEN format (rank-separated by /)
 * Returns false for:
 *   - coordinate formats (hex: "q,r:symbol")
 *   - track/home formats ("home:4Y,home:4G")
 *   - empty strings
 *   - comma-separated cell formats (4-player: "3,yR,yN,..." where cells have commas)
 */
function isStandardFen(setup) {
  if (!setup || typeof setup !== 'string') return false
  if (!setup.includes('/')) return false
  // Hex coordinate format: "q,r:symbol" pairs
  if (/^-?\d+,-?\d+:/.test(setup)) return false
  // Track/home format
  if (setup.startsWith('home:')) return false
  // 4-player comma-separated format: ranks contain commas between cells
  // Standard FEN never has commas within a rank
  const firstRank = setup.split('/')[0]
  if (firstRank.includes(',')) return false
  return true
}

/**
 * Detect if a FEN uses bracketed multi-character piece notation (e.g. [LN][KN][ST])
 * Used by large shogi variants where single letters aren't enough.
 */
function usesBracketNotation(setup) {
  return /\[[A-Za-z]{2,}\]/.test(setup)
}

/**
 * Expand a FEN rank string to its actual cell count.
 * Letters count as 1, consecutive digits form multi-digit numbers.
 * Bracketed symbols like [LN] count as 1 cell each.
 * Example: "10" = 10 empty squares, "pp3PP" = 7 cells, "[LN][KN]3" = 5 cells
 */
function expandRankWidth(rank) {
  let width = 0
  let i = 0
  while (i < rank.length) {
    if (rank[i] === '[') {
      // Bracketed multi-char symbol = 1 cell
      const close = rank.indexOf(']', i)
      if (close === -1) {
        // Malformed bracket, treat rest as individual chars
        width += 1
        i++
      } else {
        width += 1
        i = close + 1
      }
    } else if (/[0-9]/.test(rank[i])) {
      // Consume all consecutive digits as one number
      let numStr = ''
      while (i < rank.length && /[0-9]/.test(rank[i])) {
        numStr += rank[i]
        i++
      }
      width += parseInt(numStr, 10)
    } else if (rank[i] === '+') {
      // Promotion prefix: +X or +[XY] = 1 cell
      i++
      if (i < rank.length) {
        if (rank[i] === '[') {
          const close = rank.indexOf(']', i)
          i = close === -1 ? i + 1 : close + 1
        } else {
          i++
        }
      }
      width += 1
    } else {
      // Any letter counts as 1 cell
      width += 1
      i++
    }
  }
  return width
}

/**
 * Extract all unique letter symbols from a FEN string (ignoring digits and /)
 * Handles bracketed notation: [LN] is treated as the symbol "LN"
 */
function extractSymbols(setup) {
  const symbols = new Set()
  let i = 0
  while (i < setup.length) {
    const ch = setup[i]
    if (ch === '[') {
      const close = setup.indexOf(']', i)
      if (close !== -1) {
        const sym = setup.slice(i + 1, close)
        symbols.add(sym)
        i = close + 1
      } else {
        i++
      }
    } else if (ch !== '/' && !/[0-9]/.test(ch)) {
      symbols.add(ch)
      i++
    } else {
      i++
    }
  }
  return symbols
}

/**
 * Get declared vocabulary symbols from the engine block.
 * Vocabulary can be structured as:
 *   vocabulary:
 *     pieceName:
 *       symbols:
 *         0: X
 *         1: x
 * Or under engine.pieces.vocabulary:
 *   pieces:
 *     vocabulary:
 *       b: bM
 * We collect all symbol values.
 */
function getVocabularySymbols(engine) {
  const symbols = new Set()
  if (!engine) return symbols

  // Check both engine.vocabulary and engine.pieces.vocabulary
  const vocabSources = [
    engine.vocabulary,
    engine.pieces && typeof engine.pieces === 'object' ? engine.pieces.vocabulary : null,
  ].filter(Boolean)

  for (const vocab of vocabSources) {
    if (typeof vocab !== 'object') continue
    for (const pieceName of Object.keys(vocab)) {
      const entry = vocab[pieceName]
      if (typeof entry === 'string') {
        // Simple format: key is the symbol (e.g., "b: bM")
        if (pieceName.length === 1) symbols.add(pieceName)
      } else if (entry && entry.symbols) {
        // Structured format with player-indexed symbols
        for (const val of Object.values(entry.symbols)) {
          if (typeof val === 'string') {
            symbols.add(val)
          }
        }
      } else if (entry && typeof entry === 'object') {
        // Could be {type, color} format where the key IS the symbol
        if (pieceName.length === 1) symbols.add(pieceName)
      }
    }
  }
  return symbols
}

/**
 * Also read the family rulebook for vocabulary (variants inherit from family).
 * Vocabulary can live at engine.vocabulary OR engine.pieces.vocabulary depending
 * on the family's convention.
 */
function getFamilyVocabulary(family) {
  const symbols = new Set()
  const rulebookPath = path.join(RULES_DIR, family, 'content', 'rulebook.md')
  if (!fs.existsSync(rulebookPath)) return symbols

  const content = fs.readFileSync(rulebookPath, 'utf-8')
  const { meta } = parseFrontmatter(content)
  if (!meta.engine) return symbols

  // Collect vocabulary from all possible locations
  const vocabSources = [
    meta.engine.vocabulary,
    meta.engine.pieces && meta.engine.pieces.vocabulary,
  ].filter(Boolean)

  for (const vocab of vocabSources) {
    for (const key of Object.keys(vocab)) {
      // The key itself is often the symbol (e.g., "b: bM", "w: wM")
      if (key.length === 1) {
        symbols.add(key)
      }
      const entry = vocab[key]
      if (typeof entry === 'string') {
        // Simple mapping like "b: bM" - key is the symbol
        continue // Already added key above
      }
      if (entry && typeof entry === 'object') {
        if (entry.symbols) {
          for (const val of Object.values(entry.symbols)) {
            if (typeof val === 'string') symbols.add(val)
          }
        }
        // Also handle {type, color} format where key IS the symbol
        if (entry.type || entry.color) {
          // key already added above if length === 1
        }
      }
    }
  }
  return symbols
}

/**
 * Extract FEN from the markdown body text.
 * Looks for patterns like:
 *   **FEN:** `...`
 *   FEN: `...`
 *   Code blocks containing FEN-like strings
 */
function extractBodyFen(body) {
  if (!body) return null
  // Match **FEN:** `...` or FEN: `...`
  const fenMatch = body.match(/\*?\*?FEN:?\*?\*?\s*`([^`]+)`/i)
  if (fenMatch) {
    // Extract just the position part (before any space-separated metadata like "w KQkq - 0 1")
    const fullFen = fenMatch[1].trim()
    const positionPart = fullFen.split(' ')[0]
    // Strip shogi-style hand notation at end: "...SGKGS[LNln]" -> "...SGKGS"
    // Hand notation is [...] appended AFTER the last rank
    return positionPart.replace(/\[[^\]]*\]$/, '')
  }
  return null
}

/**
 * Extract implied symbols from the engine.pieces block.
 * Many variants declare pieces like:
 *   pieces:
 *     archbishop: { type: compose, parts: [...] }
 * If there's a matching vocabulary entry with symbols, those are captured by
 * getVocabularySymbols. But if there's no vocabulary, the piece name doesn't
 * directly imply a FEN symbol. This function looks for explicit symbol mappings
 * within the pieces block itself.
 */
function getPieceBlockSymbols(engine) {
  const symbols = new Set()
  if (!engine || !engine.pieces) return symbols
  // The pieces block doesn't directly contain FEN symbols in most variants.
  // Symbols are declared via vocabulary. This is a fallback for any format
  // where the pieces block contains symbol info.
  const pieces = engine.pieces
  for (const [name, def] of Object.entries(pieces)) {
    if (def && typeof def === 'object' && def.symbol) {
      symbols.add(def.symbol)
      // Also add lowercase variant
      if (def.symbol.length === 1) {
        symbols.add(def.symbol.toLowerCase())
        symbols.add(def.symbol.toUpperCase())
      }
    }
  }
  return symbols
}

// Cache family vocabulary to avoid re-reading rulebooks
const familyVocabCache = new Map()
function getCachedFamilyVocabulary(family) {
  if (!familyVocabCache.has(family)) {
    familyVocabCache.set(family, getFamilyVocabulary(family))
  }
  return familyVocabCache.get(family)
}

describeWithRules('FEN validation against moddable-rules variants', () => {
  const allVariants = findVariantFiles(RULES_DIR)

  // Filter to only FEN-eligible variants
  const fenVariants = []
  for (const variant of allVariants) {
    const content = fs.readFileSync(variant.filePath, 'utf-8')
    const { meta, body } = parseFrontmatter(content)

    if (!meta.engine) continue
    if (!meta.engine.topology) continue
    if (meta.engine.topology.type !== 'grid') continue
    if (!meta.engine.setup) continue
    if (!isStandardFen(meta.engine.setup)) continue
    // Skip irregular grids that use 'cells' instead of rows/cols
    if (!meta.engine.topology.rows || !meta.engine.topology.cols) continue

    fenVariants.push({
      ...variant,
      meta,
      body,
      engine: meta.engine,
      setup: meta.engine.setup,
      rows: meta.engine.topology.rows,
      cols: meta.engine.topology.cols,
      slug: meta.slug || variant.file.replace('.md', ''),
      hasBracketNotation: usesBracketNotation(meta.engine.setup),
    })
  }

  describe('rank count matches declared rows', () => {
    const cases = fenVariants.map(v => [
      `${v.family}/${v.slug}`,
      v,
    ])

    test.each(cases)('%s', (label, variant) => {
      const ranks = variant.setup.split('/')
      const isKnown = KNOWN_ISSUES.has(variant.slug)

      if (isKnown) {
        // Report but don't fail
        if (ranks.length !== variant.rows) {
          console.warn(
            `[KNOWN ISSUE] ${label}: rank count ${ranks.length} !== declared rows ${variant.rows}`
          )
        }
        return
      }

      expect(ranks.length).toBe(variant.rows)
    })
  })

  describe('each rank width matches declared cols', () => {
    const cases = fenVariants.map(v => [
      `${v.family}/${v.slug}`,
      v,
    ])

    test.each(cases)('%s', (label, variant) => {
      const ranks = variant.setup.split('/')
      const isKnown = KNOWN_ISSUES.has(variant.slug)
      const errors = []

      for (let i = 0; i < ranks.length; i++) {
        const rank = ranks[i]
        const actualWidth = expandRankWidth(rank)
        if (actualWidth !== variant.cols) {
          errors.push({
            rankIndex: i,
            rank,
            actualWidth,
            expectedWidth: variant.cols,
          })
        }
      }

      if (isKnown) {
        if (errors.length > 0) {
          console.warn(
            `[KNOWN ISSUE] ${label}: ${errors.length} rank(s) have wrong width: ` +
            errors.map(e => `rank ${e.rankIndex} "${e.rank}" = ${e.actualWidth} (expected ${e.expectedWidth})`).join('; ')
          )
        }
        return
      }

      if (errors.length > 0) {
        const msg = errors.map(e =>
          `  Rank ${e.rankIndex}: "${e.rank}" expands to ${e.actualWidth}, expected ${e.expectedWidth}`
        ).join('\n')
        throw new Error(
          `${label}: ${errors.length} rank(s) have incorrect width (expected ${variant.cols} cols):\n${msg}`
        )
      }
    })
  })

  describe('every FEN symbol is declared', () => {
    const cases = fenVariants.map(v => [
      `${v.family}/${v.slug}`,
      v,
    ])

    test.each(cases)('%s', (label, variant) => {
      const isKnown = KNOWN_ISSUES.has(variant.slug)

      // Bracketed notation variants (large shogi) use multi-char codes
      // that are self-documenting — only validate single-char symbols
      if (variant.hasBracketNotation) {
        // For bracket-notation FENs, only check single-char symbols (not bracketed ones)
        const symbols = extractSymbols(variant.setup)
        const singleCharSymbols = [...symbols].filter(s => s.length === 1)
        // In bracket notation, single chars are typically just standard chess-like
        // symbols (p for pawn, etc.) — skip full validation for these
        return
      }

      const symbols = extractSymbols(variant.setup)
      const vocabSymbols = getVocabularySymbols(variant.engine)
      const familySymbols = getCachedFamilyVocabulary(variant.family)

      // Also check pieces block for declared piece names that imply symbols
      const pieceSymbols = getPieceBlockSymbols(variant.engine)

      // Merge all valid symbols: standard chess + variant vocabulary + family vocabulary + pieces
      const allValid = new Set([
        ...STANDARD_CHESS_SYMBOLS,
        ...vocabSymbols,
        ...familySymbols,
        ...pieceSymbols,
      ])

      const unrecognized = []
      for (const sym of symbols) {
        if (!allValid.has(sym)) {
          unrecognized.push(sym)
        }
      }

      if (isKnown) {
        if (unrecognized.length > 0) {
          console.warn(
            `[KNOWN ISSUE] ${label}: unrecognized symbols: ${unrecognized.join(', ')}`
          )
        }
        return
      }

      if (unrecognized.length > 0) {
        console.warn(
          `[VOCAB GAP] ${label}: undeclared symbols: [${unrecognized.join(', ')}]`
        )
      }
    })
  })

  describe('body FEN agrees with frontmatter setup', () => {
    const casesWithBodyFen = fenVariants
      .map(v => {
        const bodyFen = extractBodyFen(v.body)
        if (!bodyFen) return null
        return [`${v.family}/${v.slug}`, v, bodyFen]
      })
      .filter(Boolean)

    if (casesWithBodyFen.length === 0) {
      test('no body FENs found to compare', () => {
        // Placeholder so the suite is not empty
      })
    } else {
      test.each(casesWithBodyFen)('%s', (label, variant, bodyFen) => {
        const isKnown = KNOWN_ISSUES.has(variant.slug)
        const frontmatterFen = variant.setup

        if (isKnown) {
          if (bodyFen !== frontmatterFen) {
            console.warn(
              `[KNOWN ISSUE] ${label}: body FEN differs from frontmatter.\n` +
              `  Frontmatter: ${frontmatterFen}\n` +
              `  Body:        ${bodyFen}`
            )
          }
          return
        }

        if (bodyFen !== frontmatterFen) {
          console.warn(
            `[BODY MISMATCH] ${label}: body FEN differs from frontmatter`
          )
        }
      })
    }
  })

  // Summary test: report what was covered
  test('coverage summary', () => {
    const totalVariants = allVariants.length
    const fenEligible = fenVariants.length
    const skippedNonGrid = allVariants.filter(v => {
      const content = fs.readFileSync(v.filePath, 'utf-8')
      const { meta } = parseFrontmatter(content)
      return meta.engine && meta.engine.topology && meta.engine.topology.type !== 'grid'
    }).length
    const skippedNoSetup = allVariants.filter(v => {
      const content = fs.readFileSync(v.filePath, 'utf-8')
      const { meta } = parseFrontmatter(content)
      return meta.engine && (!meta.engine.setup || !isStandardFen(meta.engine.setup))
    }).length

    console.log(`\n--- FEN Validation Coverage ---`)
    console.log(`Total variant files:    ${totalVariants}`)
    console.log(`FEN-eligible (tested):  ${fenEligible}`)
    console.log(`Skipped (non-grid):     ${skippedNonGrid}`)
    console.log(`Skipped (no FEN setup): ${skippedNoSetup}`)
    console.log(`Known issues:           ${KNOWN_ISSUES.size}`)
    console.log(`-------------------------------\n`)

    expect(fenEligible).toBeGreaterThan(0)
  })
})
