import { registerVariants } from '../../play/src/variant-registry.js'
import * as xiangqiVariants from './src/variants/index.js'

export { createXiangqiPlugin } from './src/xiangqi-plugin.js'
export * from './src/variants/index.js'

const { UNSUPPORTED, ...variants } = xiangqiVariants
registerVariants('xiangqi', variants)

export { xiangqiVariants as variants }
