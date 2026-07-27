import { registerVariants } from '../../play/src/variant-registry.js'
import * as draughtsVariants from './src/variants/index.js'

export { createDraughtsPlugin } from './src/draughts-plugin.js'
export * from './src/variants/index.js'

const { UNSUPPORTED, ...variants } = draughtsVariants
registerVariants('draughts', variants)

export { draughtsVariants as variants }
