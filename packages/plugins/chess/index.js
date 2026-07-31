import { registerVariants } from '../../play/src/variant-registry.js'
import * as chessVariants from './src/variants/index.js'

export { createChessPlugin } from './src/chess-plugin.js'
export { registerVariant, getVariantConfig, getAllVariants, getVariantGroups } from './src/variant-registry.js'
export * from './src/variants/index.js'
export { createChessPlugin as createMCEChessPlugin, MCE } from './src/mce-adapter.js'
export * as ChessSDK from './src/sdk.js'

registerVariants('chess', chessVariants)
