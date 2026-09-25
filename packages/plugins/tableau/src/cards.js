// Cards as the rules name them, and how a game orders them.
//
// A card is kept in the game's state by its id alone - `spades_A`, `3_5` for a
// domino - and looked up here. The deck is built from the declaration every
// time, so an id always means the same card and a state stays plain data.

import { createDeck } from '../../../component-deck/index.js'

// Build the deck a game declares: `components.deck` in its frontmatter.
// Several copies of a deck are told apart by a suffix on each id.
export function buildDeck(spec = {}) {
  const type = spec.type
  if (!type) throw new Error('A component game needs `components.deck.type`')
  const copies = Math.max(1, spec.count || 1)
  const cards = []
  for (let copy = 0; copy < copies; copy++) {
    for (const card of createDeck(type, spec)) {
      cards.push(copies > 1 ? { ...card, id: `${card.id}#${copy + 1}` } : card)
    }
  }
  return cards
}

// A rank or a suit as a rulebook writes it: `A`, `10`, `J`; `spades`, `S`, `♠`.
const SUIT_NAMES = {
  s: 'spades', spade: 'spades', spades: 'spades', '♠': 'spades',
  h: 'hearts', heart: 'hearts', hearts: 'hearts', '♥': 'hearts',
  d: 'diamonds', diamond: 'diamonds', diamonds: 'diamonds', '♦': 'diamonds',
  c: 'clubs', club: 'clubs', clubs: 'clubs', '♣': 'clubs',
}

export function suitName(text) {
  return SUIT_NAMES[String(text).toLowerCase()] || String(text).toLowerCase()
}

export function rankName(text) {
  const t = String(text).toUpperCase()
  if (t === 'ACE') return 'A'
  if (t === 'KING') return 'K'
  if (t === 'QUEEN') return 'Q'
  if (t === 'JACK') return 'J'
  return t
}

// A card named in frontmatter - `3-diamonds`, `3D`, `Q-spades` - to its id.
export function cardIdOf(text) {
  const s = String(text).trim()
  const dash = s.match(/^(ace|king|queen|jack|[0-9]+|[AKQJ])[-_ ]?(.+)$/i)
  if (!dash) return s
  return `${suitName(dash[2])}_${rankName(dash[1])}`
}

// How a game orders ranks and suits. `rankOrder` is given low to high, as the
// rulebooks write it; a rank a game leaves out is below every rank it names.
export function ordering(config = {}) {
  const ranks = (config.rankOrder || ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']).map(r => rankName(r))
  const suits = (config.suitOrder || []).map(suitName)
  const rankIndex = new Map(ranks.map((r, i) => [r, i]))
  const suitIndex = new Map(suits.map((s, i) => [s, i]))
  const rankOf = (card) => (rankIndex.has(card.rank) ? rankIndex.get(card.rank) : -1)
  const suitOf = (card) => (suitIndex.has(card.suit) ? suitIndex.get(card.suit) : -1)
  return {
    ranks,
    rankOf,
    suitOf,
    // A single card's worth: rank first, suit only to break a tie.
    valueOf: (card) => rankOf(card) * 16 + suitOf(card),
  }
}
