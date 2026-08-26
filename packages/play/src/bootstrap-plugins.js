// Composition root for plugin variant and evaluator registration.
// Plugins export their variants and evaluators but don't register themselves,
// avoiding the play ↔ plugins circular dependency.

import { registerVariants } from './variant-registry.js'
import { registerEvaluator } from '../../ai/index.js'

import * as chessVariants from '../../plugins/chess/index.js'
import * as goVariants from '../../plugins/go/index.js'
import { chessEvaluate } from '../../plugins/chess/index.js'
import { goEvaluate } from '../../plugins/go/index.js'
import { draughtsEvaluate } from '../../plugins/draughts/index.js'
import { reversiEvaluate } from '../../plugins/reversi/index.js'
import { shogiEvaluate } from '../../plugins/shogi/index.js'
import { xiangqiEvaluate } from '../../plugins/xiangqi/index.js'

const { longestRun: _goLongestRun, ...goRest } = goVariants

registerVariants('chess', chessVariants)
registerVariants('go', goRest)
registerVariants('draughts', {})
registerVariants('reversi', {})
registerVariants('shogi', {})
registerVariants('xiangqi', {})
registerVariants('mancala', {})
registerVariants('morris', {})
registerVariants('hex', {})

registerEvaluator('chess', chessEvaluate)
registerEvaluator('go', goEvaluate)
registerEvaluator('draughts', draughtsEvaluate)
registerEvaluator('reversi', reversiEvaluate)
registerEvaluator('shogi', shogiEvaluate)
registerEvaluator('xiangqi', xiangqiEvaluate)
