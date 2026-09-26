// Settings a player chooses before a game starts (engine#184).
//
// A variant can be played more than one way by the same rules: President by
// four to eight players, for three rounds or for as long as the table likes.
// The variant says which, as data, and this reads it. Nothing here names a
// game.
//
//   deal: { minPlayers: 4, maxPlayers: 8, defaultPlayers: 4 }   -> Players
//   plugins.<family>.options:
//     rounds: { label: Rounds, values: [open, 3, 5, 10] }      -> Rounds
//
// A declared option is a key the plugin already reads - `rounds` - and
// choosing a value sets that key, so the plugin cannot tell a chosen value
// from one written in the frontmatter.

function pluginBlock(resolved, family) {
  return resolved?.plugins?.[family] || {}
}

// What can be chosen for this variant, and what each is set to now.
export function settingsFor(resolved, family, chosen = {}) {
  const out = []
  const deal = resolved?.deal || pluginBlock(resolved, family).deal || {}
  const min = Number(deal.minPlayers), max = Number(deal.maxPlayers)
  if (Number.isInteger(min) && Number.isInteger(max) && max > min) {
    const values = []
    for (let n = min; n <= max; n++) values.push(n)
    const current = chosen.players ?? (resolved?.players?.length || deal.defaultPlayers || min)
    out.push({ key: 'players', label: 'Players', values, value: Number(current) })
  }
  const block = pluginBlock(resolved, family)
  for (const [key, spec] of Object.entries(block.options || {})) {
    const values = Array.isArray(spec?.values) ? spec.values : []
    if (values.length < 2) continue
    out.push({ key, label: spec.label || key, values, value: chosen[key] ?? block[key] ?? values[0] })
  }
  return out
}

// The variant as it will be played with these choices. A value is matched to
// one the variant declares, so a choice from a page (always text) arrives as
// the number or word the frontmatter wrote.
export function applySettings(resolved, family, chosen = {}) {
  if (!resolved || !Object.keys(chosen).length) return resolved
  const available = settingsFor(resolved, family)
  const next = { ...resolved }
  for (const setting of available) {
    if (!(setting.key in chosen)) continue
    const value = setting.values.find(v => String(v) === String(chosen[setting.key]))
    if (value === undefined) continue
    if (setting.key === 'players') {
      const names = [...(resolved.players || [])]
      next.players = Array.from({ length: value }, (_, i) => names[i] || `player${i + 1}`)
    } else {
      next.plugins = { ...next.plugins, [family]: { ...pluginBlock(next, family), [setting.key]: value } }
    }
  }
  return next
}
