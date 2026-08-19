// View layer: turns the structured card produced by packages/rpg into markup.
// All field resolution, templating and transforms live in packages/rpg/src/card-data.js.
import { getCardData, getCardFields } from '../packages/rpg/src/card-data.js'

export function renderCard(item, category, manifest) {
  if (!getCardFields(category, manifest)) {
    return `<div class="rpg-card-title">${item.result || item.name || ''}</div>`
  }

  const card = getCardData(item, category, manifest)
  const parts = []

  if (card.title) parts.push(`<div class="rpg-card-title">${card.title}</div>`)
  for (const text of card.meta) parts.push(`<div class="rpg-card-meta">${text}</div>`)
  if (card.stats) parts.push(`<div class="rpg-card-stats">${card.stats}</div>`)
  if (card.tags) parts.push(`<div class="rpg-card-meta">Components: ${card.tags.join(', ')}</div>`)
  if (card.description) parts.push(`<div class="rpg-card-desc">${card.description}</div>`)

  return parts.join('')
}
