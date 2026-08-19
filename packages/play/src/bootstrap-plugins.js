// Composition root for plugin variant and evaluator registration.
// Plugins export their variants and evaluators but don't register themselves,
// avoiding the play ↔ plugins circular dependency.

import { registerVariants } from './variant-registry.js'
import { registerEvaluator } from '../../ai/src/evaluators.js'

import * as chessVariants from '../../plugins/chess/src/variants/index.js'
import * as goVariants from '../../plugins/go/src/variants/index.js'
import { chessEvaluate } from '../../plugins/chess/src/evaluate.js'
import { goEvaluate } from '../../plugins/go/src/evaluate.js'
import { draughtsEvaluate } from '../../plugins/draughts/src/evaluate.js'
import { reversiEvaluate } from '../../plugins/reversi/src/evaluate.js'
import { shogiEvaluate } from '../../plugins/shogi/src/evaluate.js'
import { xiangqiEvaluate } from '../../plugins/xiangqi/src/evaluate.js'

const { longestRun: _goLongestRun, ...goRest } = goVariants

registerVariants('chess', chessVariants)
registerVariants('go', goRest)
registerVariants('draughts', {})
registerVariants('reversi', {})
registerVariants('shogi', {})
registerVariants('xiangqi', {})

registerEvaluator('chess', chessEvaluate)
registerEvaluator('go', goEvaluate)
registerEvaluator('draughts', draughtsEvaluate)
registerEvaluator('reversi', reversiEvaluate)
registerEvaluator('shogi', shogiEvaluate)
registerEvaluator('xiangqi', xiangqiEvaluate)
