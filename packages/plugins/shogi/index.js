import { registerVariants } from '../../play/src/variant-registry.js'
import * as shogiVariants from './src/variants/index.js'

export { createShogiPlugin } from './src/shogi-plugin.js'
export * from './src/variants/index.js'

const { UNSUPPORTED, ...variants } = shogiVariants
registerVariants('shogi', variants)

export { shogiVariants as variants }
