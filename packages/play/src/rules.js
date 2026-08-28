// The rule factories the composition root can offer to plugins, keyed by the
// ids plugins already declare in their `rules: [...]` arrays.
//
// DELIBERATELY NOT YET PASSED TO createGameFromDefinition. See below.
//
// Eight plugins declare 23 rule ids between them. `createGameForFamily` builds
// its game options without a `rules` map, so the registry is registered with
// nothing, `plugin.rules.filter(id => registry.has(id))` returns [], and
// `wrapPluginWithRules` takes its early return. All 23 declarations are
// discarded in silence at game creation (engine#88).
//
// Supplying this map is a one-line change and it is NOT safe on its own, which
// is the finding that produced this file. Measured on draughts, which declares
// `capture.replacement` and also implements capture itself:
//
//   pieces on the board before a capture   24
//   after, unwired                         23   correct
//   after, wired                           24   the captured piece survives
//
// and all 42 draughts tests passed either way.
//
// The cause is not a bug in the wrapper. `capture.replacement` means what it
// says: the moving piece replaces what stood on the destination square. That
// is exactly how chess captures, which is why chess composes it correctly today
// in chess-composed-rules.test.js - a full working proof of the registry, on a
// real family, with eight rules and a rule override. It is NOT how draughts
// captures: a draughts capture is a jump, and the captured piece sits on
// neither the origin nor the destination. So draughts declares a rule that does
// not describe how draughts works, and wiring it would apply the wrong rule
// faithfully.
//
// Wiring therefore has to be per plugin, behind the check that the family's own
// tests still pass a capture-count assertion - not a single flip of a switch.
// draughts needs a `capture.jump` rule, or its declaration removed.
import {
  createCaptureReplacementRule,
  createChainCaptureRule,
  createForcedCaptureRule,
  createPromotionRankReachRule,
  createRepetitionRule,
  createTurnContinuationRule,
} from '../../rule/index.js'

export const RULES = {
  'capture.replacement': createCaptureReplacementRule,
  'chain-capture': createChainCaptureRule,
  'forced-capture': createForcedCaptureRule,
  'promotion.rank-reach': createPromotionRankReachRule,
  'repetition': createRepetitionRule,
  'turn-continuation': createTurnContinuationRule,
}
