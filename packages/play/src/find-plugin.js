// One way to find a family's plugin, because there were four.
//
// `sliceName` reads as a free choice and is not: four separate call sites
// looked a plugin up with `p.sliceName === family` and each had to be right on
// its own. The landlords plugin declares `sliceName: 'landlords'` while its
// family is `landlords-game`, so three of the four threw or returned null -
// including `simulator-helper.js`, which is the path the play page takes, so
// the family passed every check in Node and could not be opened in a browser.
//
// engine#140 trap 1 was closed after fixing exactly one of those four.
//
// The rule: prefer an exact `sliceName` match, then a plugin whose family
// matches, then the single plugin that actually implements the game.
export function findFamilyPlugin(plugins, family) {
  if (!plugins || !plugins.length) return null
  if (family) {
    const exact = plugins.find(p => p.sliceName === family)
    if (exact) return exact
    const byFamily = plugins.find(p => p.family === family)
    if (byFamily) return byFamily
  }
  const playable = plugins.filter(p => typeof p.getLegalMoves === 'function')
  if (playable.length === 1) return playable[0]
  return playable[0] || plugins[0] || null
}

// The store key a family's state lives under. Always the plugin's own
// `sliceName`, never the family, because those are not the same thing.
export function familySliceKey(plugins, family) {
  return findFamilyPlugin(plugins, family)?.sliceName || family
}
