import { registerDeck } from '../deck-registry.js'

const MONTHS = [
  'pine', 'plum', 'cherry', 'wisteria', 'iris',
  'peony', 'clover', 'pampas', 'chrysanthemum',
  'maple', 'willow', 'paulownia'
]
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
const TYPES = ['hikari', 'tane', 'tanzaku', 'kasu']
const TYPE_LABELS = ['bright', 'animal', 'ribbon', 'plain']

// A card's `art` is the gallery key its picture is filed under. Months carry
// more than one plain card, so those keys are numbered; every other key is
// month plus type. The piece set is chosen in frontmatter (engine.pieces.set).
function cardArt(monthIndex, typeIndex, name) {
  const type = TYPES[typeIndex].charAt(0).toUpperCase() + TYPES[typeIndex].slice(1)
  const plain = name.match(/Plain (\d)/)
  return plain
    ? `${MONTH_NAMES[monthIndex]}-${type}-${plain[1]}`
    : `${MONTH_NAMES[monthIndex]}-${type}`
}

const CARD_DEFS = [
  { month: 0, type: 0, name: 'Crane' },
  { month: 0, type: 2, name: 'Poetry Ribbon' },
  { month: 0, type: 3, name: 'Plain 1' },
  { month: 0, type: 3, name: 'Plain 2' },
  { month: 1, type: 1, name: 'Bush Warbler' },
  { month: 1, type: 2, name: 'Poetry Ribbon' },
  { month: 1, type: 3, name: 'Plain 1' },
  { month: 1, type: 3, name: 'Plain 2' },
  { month: 2, type: 0, name: 'Curtain' },
  { month: 2, type: 2, name: 'Poetry Ribbon' },
  { month: 2, type: 3, name: 'Plain 1' },
  { month: 2, type: 3, name: 'Plain 2' },
  { month: 3, type: 1, name: 'Cuckoo' },
  { month: 3, type: 2, name: 'Red Ribbon' },
  { month: 3, type: 3, name: 'Plain 1' },
  { month: 3, type: 3, name: 'Plain 2' },
  { month: 4, type: 1, name: 'Bridge' },
  { month: 4, type: 2, name: 'Red Ribbon' },
  { month: 4, type: 3, name: 'Plain 1' },
  { month: 4, type: 3, name: 'Plain 2' },
  { month: 5, type: 1, name: 'Butterflies' },
  { month: 5, type: 2, name: 'Blue Ribbon' },
  { month: 5, type: 3, name: 'Plain 1' },
  { month: 5, type: 3, name: 'Plain 2' },
  { month: 6, type: 1, name: 'Boar' },
  { month: 6, type: 2, name: 'Red Ribbon' },
  { month: 6, type: 3, name: 'Plain 1' },
  { month: 6, type: 3, name: 'Plain 2' },
  { month: 7, type: 0, name: 'Moon' },
  { month: 7, type: 1, name: 'Geese' },
  { month: 7, type: 3, name: 'Plain 1' },
  { month: 7, type: 3, name: 'Plain 2' },
  { month: 8, type: 1, name: 'Sake Cup' },
  { month: 8, type: 2, name: 'Blue Ribbon' },
  { month: 8, type: 3, name: 'Plain 1' },
  { month: 8, type: 3, name: 'Plain 2' },
  { month: 9, type: 1, name: 'Deer' },
  { month: 9, type: 2, name: 'Blue Ribbon' },
  { month: 9, type: 3, name: 'Plain 1' },
  { month: 9, type: 3, name: 'Plain 2' },
  { month: 10, type: 0, name: 'Rain Man' },
  { month: 10, type: 1, name: 'Swallow' },
  { month: 10, type: 2, name: 'Red Ribbon' },
  { month: 10, type: 3, name: 'Lightning' },
  { month: 11, type: 0, name: 'Phoenix' },
  { month: 11, type: 3, name: 'Plain 1' },
  { month: 11, type: 3, name: 'Plain 2' },
  { month: 11, type: 3, name: 'Plain 3' },
]

registerDeck('hanafuda-48', {
  label: 'Hanafuda 48',
  cardCount: 48,
  cardWidth: 44,
  cardHeight: 64,
  months: MONTHS,
  types: TYPES,

  create(opts = {}) {
    return CARD_DEFS.map((def, i) => ({
      id: `${MONTHS[def.month]}_${def.name.toLowerCase().replace(/\s+/g, '-')}`,
      month: MONTHS[def.month],
      monthIndex: def.month,
      monthName: MONTH_NAMES[def.month],
      type: TYPES[def.type],
      typeLabel: TYPE_LABELS[def.type],
      name: def.name,
      display: `${MONTH_NAMES[def.month]} — ${def.name}`,
      art: cardArt(def.month, def.type, def.name),
    }))
  },
})
