// Composition root for plugin variant registration.
// Plugins export their variants but don't register themselves, avoiding
// the play ↔ plugins circular dependency. Import this module to register
// all built-in plugin variants.

import { registerVariants } from './variant-registry.js'

import * as chessVariants from '../../plugins/chess/src/variants/index.js'
import * as goVariants from '../../plugins/go/src/variants/index.js'

const { longestRun: _goLongestRun, ...goRest } = goVariants

registerVariants('chess', chessVariants)
registerVariants('go', goRest)
registerVariants('draughts', {})
registerVariants('reversi', {})
registerVariants('shogi', {})
registerVariants('xiangqi', {})
