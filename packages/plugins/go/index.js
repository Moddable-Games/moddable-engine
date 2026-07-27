import { registerVariants } from '../../play/src/variant-registry.js'
import * as goVariants from './src/variants/index.js'

export { createGoPlugin } from './src/go-plugin.js'
export { scoreGame, estimateScore, emptyRegions, removeDeadStones, countStones } from './src/scoring.js'
export * from './src/variants/index.js'

const { longestRun, ...variants } = goVariants
registerVariants('go', variants)

export { goVariants as variants }
