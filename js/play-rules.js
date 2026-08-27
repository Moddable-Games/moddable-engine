// The panel that tells you what game you are looking at.
//
// It described the board and the win condition and then stopped, so the only
// way to check whether a variant was being played correctly was to go and find
// its rulebook by hand. The corpus is published; linking to it costs one line
// and turns "I think this is wrong" into something anyone can settle.
const RULES_SITE = 'https://rules.moddable.games'

export function rulesUrl(family, variant) {
  if (!family) return null
  const base = `${RULES_SITE}/${encodeURIComponent(family)}/`
  return variant ? `${base}variants/${encodeURIComponent(variant)}/` : base
}

export function renderRulesPanel(el, { board, win, special, rule, description, family, variant } = {}) {
  if (!el) return
  const link = rulesUrl(family, variant)
  const hasContent = board || win || special || rule || description || link
  if (!hasContent) { el.innerHTML = '' ; return }
  const parts = []
  if (board && win) {
    parts.push(`<span class="rules-badge">Board: ${board} · Win: ${win}</span>`)
  } else if (rule) {
    parts.push(`<span class="rules-badge">${rule}</span>`)
  }
  if (special) parts.push(`<p class="rules-desc">${special}</p>`)
  else if (description) parts.push(`<p class="rules-desc">${description}</p>`)
  if (link) {
    parts.push(
      `<p class="rules-desc"><a class="rules-link" href="${link}" target="_blank" rel="noopener">Full rules for this variant</a></p>`
    )
  }
  el.innerHTML = parts.join('')
}
