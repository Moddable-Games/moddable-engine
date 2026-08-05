export function renderRulesPanel(el, { board, win, special, rule, description } = {}) {
  if (!el) return
  const hasContent = board || win || special || rule || description
  if (!hasContent) { el.innerHTML = ''; return }
  const parts = []
  if (board && win) {
    parts.push(`<span class="rules-badge">Board: ${board} · Win: ${win}</span>`)
  } else if (rule) {
    parts.push(`<span class="rules-badge">${rule}</span>`)
  }
  if (special) parts.push(`<p class="rules-desc">${special}</p>`)
  else if (description) parts.push(`<p class="rules-desc">${description}</p>`)
  el.innerHTML = parts.join('')
}
