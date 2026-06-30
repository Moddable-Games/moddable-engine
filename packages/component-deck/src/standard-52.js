export const schema = {
  type: 'standard-52',
  componentType: 'deck',
  required: [],
}

const DEFAULT_SUITS = ['D', 'C', 'H', 'S']
const DEFAULT_RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2']

export function createStandard52Deck(config = {}) {
  const suits = config.suits || DEFAULT_SUITS
  const ranks = config.ranks || DEFAULT_RANKS
  const size = suits.length * ranks.length

  function makeDeck() {
    const deck = []
    for (const s of suits) {
      for (const r of ranks) {
        deck.push(`${s}-${r}`)
      }
    }
    return deck
  }

  function parse(card) {
    const [suit, rank] = card.split('-')
    return { suit, rank }
  }

  function cardRank(card) {
    const { rank } = parse(card)
    return ranks.indexOf(rank)
  }

  function cardSuit(card) {
    const { suit } = parse(card)
    return suits.indexOf(suit)
  }

  function cardValue(card) {
    return cardRank(card) * suits.length + cardSuit(card)
  }

  function compare(a, b) {
    return cardValue(a) - cardValue(b)
  }

  function highCard(cards) {
    return [...cards].sort((a, b) => compare(b, a))[0]
  }

  function beats(played, last) {
    if (played.length !== last.length) return false
    if (played.length === 1) return cardValue(played[0]) > cardValue(last[0])
    return cardValue(highCard(played)) > cardValue(highCard(last))
  }

  function deal(shuffledDeck, playerCount, perPlayer) {
    const actual = perPlayer || Math.floor(shuffledDeck.length / playerCount)
    const hands = []
    for (let i = 0; i < playerCount; i++) {
      hands.push(shuffledDeck.slice(i * actual, (i + 1) * actual))
    }
    return hands
  }

  function isValid(card) {
    const { suit, rank } = parse(card)
    return suits.includes(suit) && ranks.includes(rank)
  }

  return {
    suits,
    ranks,
    size,
    makeDeck,
    parse,
    cardRank,
    cardSuit,
    cardValue,
    compare,
    highCard,
    beats,
    deal,
    isValid,
  }
}
