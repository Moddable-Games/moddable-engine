export { parseGameDefinition, parseVariantFile, validateMeta, produceDefinition } from './src/schema.js'
export { parseFrontmatter } from './src/parse-frontmatter.js'
export { serializeFrontmatter } from './src/serialize-frontmatter.js'
export { validate } from './src/validate.js'
export { produce } from './src/produce.js'
export { produceLayout } from './src/produce-layout.js'
export { resolveSurface, BUILTIN_SURFACES } from './src/surfaces.js'
export { resolve as cascadeResolve, deepMerge, deriveDefaults } from './src/cascade-resolver.js'
export { buildCrossMap } from './src/cross-map.js'
// Node-only exports (loader, rules-dir) are in ./node.js to avoid
// pulling node:fs/promises into browser bundles via barrel import.
export { unsupportedVariants, unsupportedReason, unsupportedForFamily } from './src/unsupported.js'
