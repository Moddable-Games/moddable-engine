export function renderRulesPanel(el, { rule, description } = {}) {
  if (!el) return
  if (!rule && !description) { el.innerHTML = ''; return }
  const parts = []
  if (rule) parts.push(`<span class="rules-badge">${rule}</span>`)
  if (description) parts.push(`<p class="rules-desc">${description}</p>`)
  el.innerHTML = parts.join('')
}
