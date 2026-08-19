import { registerVariants } from '../../play/src/variant-registry.js'
import * as chessVariants from './src/variants/index.js'

export { createChessPlugin } from './src/chess-plugin.js'
export { moveToSAN } from './src/san.js'
export * from './src/variants/index.js'

registerVariants('chess', chessVariants)
