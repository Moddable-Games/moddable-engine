// Per-family MCTS rollout and expansion policies, supplied by the plugin.
//
// This used to be a family-name test in sdk.js, which meant a new
// territorial or placement game had no supported way to bring its own playout
// policy: it got generic MCTS or nothing, and the only fix was editing core.
// A plugin now declares them as a static on its factory, alongside `flags`,
// `interaction` and `mcts`:
//
//   createGoPlugin.searchPolicies = ({ random }) => ({
//     rolloutPolicy: createGoPlayoutPolicy(random),
//     expansionPolicy: createGoExpansionPolicy(),
//   })
//
// `context.random` is a seeded generator when the caller supplied an rngSeed,
// so a rollout is reproducible.
//
// The value is a thunk so a policy is only constructed when a search actually
// runs, and so each search gets its own instance.
const searchPolicies = new Map()

export function registerSearchPolicies(family, factory) {
  if (typeof factory === 'function') searchPolicies.set(family, factory)
}

export function searchPoliciesFor(family, context = {}) {
  const factory = searchPolicies.get(family)
  return factory ? factory(context) : null
}
