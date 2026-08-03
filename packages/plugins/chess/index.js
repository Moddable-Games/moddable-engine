import { registerVariants } from '../../play/src/variant-registry.js'
import * as chessVariants from './src/variants/index.js'

export { createChessPlugin } from './src/chess-plugin.js'
export { registerVariant, getVariantConfig, getAllVariants, getVariantGroups } from './src/variant-registry.js'
export * from './src/variants/index.js'

registerVariants('chess', chessVariants)
