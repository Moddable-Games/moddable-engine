import { deal, getDeckConfig } from '../../../component-deck/index.js'
import { buildDeck, ordering } from './cards.js'
import { MECHANICS } from './mechanics/index.js'

// One plugin for every game played with components rather than on a board:
// the standard deck, the Bavarian and hanafuda decks, dominoes, mahjong tiles
// and dice (engine#176).
//
// A game's frontmatter says everything that is data - which deck and how many
// copies, how the cards are dealt, which cards outrank which - and names the
// shape of game it is, `game:`, from a small set that each hold one kind of
// play: climbing, trick-taking, and so on. A shape is code, written once and
// shared by every game of that kind, the way the chess plugin holds movement
// that many variants declare. Nothing here is written for one game.
//
//     engine:
//       components: { deck: { type: standard-52 } }
//       deal: { perPlayer: all }
//       plugins:
//         standard-52:
//           game: climbing
//           rankOrder: [3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2]
//
// The state holds cards by id. Which seat can see which of them is the
// plugin's to say (`projectForSeat`), so a seat is handed its own hand and the
// backs of everyone else's, and nothing that crosses a boundary carries a
// card its seat may not see.

export const CONFIG_KEYS = new Set([
  'game', 'deal', 'components', 'playerCount',
  // shared by several shapes
  'rankOrder', 'suitOrder', 'firstLead', 'winner',
  // climbing
  'combinations', 'fiveCardHands', 'straights', 'sequence', 'playTo', 'roles', 'exchange', 'laterLead', 'rounds',
  // settings a player chooses before a game, on the play page
  'options',
  // trick-taking
  'trump', 'leadsWith', 'breaking', 'firstTrickForbids', 'passing', 'bidding', 'partnerships', 'scoring', 'target',
  // war
  'warFaceDown',
  // shedding
  'wild', 'starterSkips',
  // dominoes
  'draw', 'spinner', 'scoreFives',
  // patience
  'columns', 'faceUp', 'build', 'lift', 'supermove', 'emptyColumn', 'foundations', 'completeRuns',
  'freeCells', 'stock', 'drawCount', 'foundationToTableau', 'suitsInPlay',
  // melds: laying (melds on the table), knocking (melds in hand)
  'dealByPlayers', 'rummyDoubles', 'knock', 'bonuses', 'stockFloor', 'cardsEach',
  // a hand per double: trains, branching
  'tilesPerPlayer', 'blankDouble', 'afterStart', 'publicTrain', 'openingArms', 'doubleToes',
  // scorecard dice
  'dice', 'rolls', 'categories', 'bonuses', 'repeat',
  // press-your-luck dice
  'singles', 'triples', 'multiples', 'straight', 'threePairs', 'opening', 'finalRound',
  // present in the corpus and read by nothing here yet
  'variant', 'trading', 'passReset', 'suitRank',
])

// The same number of cards in fewer suits: Spider's two-suit game is four
// copies of spades and hearts rather than two of every suit.
const SUIT_ORDER = ['spades', 'hearts', 'clubs', 'diamonds']
function withSuitsInPlay(spec, suitsInPlay) {
  const n = Number(suitsInPlay)
  if (!n || n >= 4 || spec.type !== 'standard-52') return spec
  return { ...spec, suits: SUIT_ORDER.slice(0, n), count: (spec.count || 1) * (4 / n) }
}

export function createTableauPluginFor(family) {
  function createTableauPlugin(variantConfig = {}, context = {}) {
    const config = { ...variantConfig }
    const definition = context.definition || {}
    const names = definition.players?.names || definition.players || ['player1', 'player2']
    const seats = names.length
    const mechanic = MECHANICS[config.game]
    // Dice are a component with no deck to deal: a game rolls them.
    const components = definition.components || config.components || {}
    const deckSpec = components.deck || (components.dice ? { type: 'standard-dice' } : null)
    const rolled = deckSpec?.type === 'standard-dice'
    const deck = deckSpec && !rolled ? buildDeck(withSuitsInPlay(deckSpec, config.suitsInPlay)) : []
    const byId = new Map(deck.map(c => [c.id, c]))
    const dieFace = rolled ? getDeckConfig('standard-dice').face : null
    // A die is named by its place and what it shows: `die2-5`.
    const card = (id) => {
      if (byId.has(id)) return byId.get(id)
      const die = rolled && /^die(\d+)-(\d+)$/.exec(String(id))
      return die ? dieFace(+die[2], +die[1]) : undefined
    }

    const ctx = { config, seats, names, card, deck }

    function dealState(rng) {
      if (!deck.length) return { hands: Array.from({ length: seats }, () => []), community: [], drawPile: [] }
      const ids = deck.map(c => c.id)
      const shuffled = rng ? rng.shuffle(ids) : ids
      const spec = { ...(config.deal || {}), players: seats }
      const dealt = deal(shuffled, spec)
      return {
        hands: dealt.hands,
        community: dealt.community || [],
        drawPile: dealt.drawPile || [],
        tableau: dealt.tableau,
      }
    }

    const plugin = {
      sliceName: family,
      family,
      pureApplyMove: true,
      config,
      // What a rules-less shape offers: nothing to play. A game whose `game:`
      // names no shape is declared unsupported in its rulebook, and this keeps
      // it from pretending otherwise.
      init(_pluginConfig, { request }) {
        const rng = request('core.rng')
        const dealt = dealState(rng)
        const base = { hands: dealt.hands, community: dealt.community, drawPile: dealt.drawPile }
        if (dealt.tableau) base.tableau = dealt.tableau
        // A game of several hands deals each from a seed drawn here, so that
        // applying a move stays a pure function of the state.
        const seed = rng ? rng.nextInt(1, 2147483646) : 1
        return mechanic ? mechanic.init(base, { ...ctx, seed }) : base
      },

      firstPlayer(slice) {
        return mechanic && mechanic.firstPlayer ? mechanic.firstPlayer(slice, ctx) : null
      },

      getLegalMoves(slice, full) {
        if (!mechanic || (slice.finished !== null && slice.finished !== undefined)) return []
        return mechanic.legalMoves(slice, full.__players.currentIndex, ctx)
      },

      validateMove(move, slice, full) {
        const same = (a, b) => JSON.stringify(normalise(a)) === JSON.stringify(normalise(b))
        return plugin.getLegalMoves(slice, full).some(m => same(m, move))
      },

      applyMove(move, slice, full) {
        return mechanic.apply(move, slice, full.__players.currentIndex, ctx)
      },

      turnEffects(slice) {
        if (!mechanic || slice.next === undefined || slice.next === null) return null
        return { next: slice.next }
      },

      checkWin(slice) {
        if (!mechanic) return null
        const result = mechanic.winner(slice, ctx)
        return result === undefined ? null : result
      },

      // A seat sees its own hand. Everyone else's is only a count of backs,
      // and so is anything the game deals face down.
      projectForSeat(slice, seat) {
        if (mechanic && mechanic.project) return mechanic.project(slice, seat, ctx)
        return {
          ...slice,
          hands: slice.hands.map((hand, i) => (i === seat ? hand : hand.map(() => null))),
          drawPile: slice.drawPile.map(() => null),
        }
      },

      // How a seat that is not a person chooses, from what it can see. A
      // shape with no policy of its own plays at random, from the caller's
      // generator; without one, the first move.
      policy(view, seat, moves, opts = {}) {
        const random = opts.random || (() => 0)
        if (opts.difficulty !== 'beginner' && mechanic && mechanic.policy) {
          const chosen = mechanic.policy(view, seat, moves, ctx, random)
          if (chosen) return chosen
        }
        return moves[Math.floor(random() * moves.length)]
      },

      // How the game ended, in words, where a seat index does not say it: a
      // partnership wins, not the seat that happens to be listed first.
      describeResult(slice, seatNames) {
        if (!mechanic || !mechanic.result) return null
        return mechanic.result(slice, seatNames ? { ...ctx, displayNames: seatNames } : ctx)
      },

      // A line about a seat for the page's sidebar - tricks, bid, score.
      describeSeat(view, seat) {
        return mechanic && mechanic.describeSeat ? mechanic.describeSeat(view, seat, ctx) : null
      },

      // For the renderer and the move log: what a card id is, and what lies
      // face up on the table between the hands, in labelled groups.
      cardOf: card,
      deckType: deckSpec?.type || null,
      onTable(view, seatNames) {
        if (!mechanic || !mechanic.table) return []
        return mechanic.table(view, seatNames ? { ...ctx, names: seatNames } : ctx)
      },
      // A hand laid out in the game's own order, low to high, so a pair sits
      // together and the card that beats the trick is easy to find.
      // A game that follows suit groups the hand by suit first.
      sortForDisplay(ids) {
        const { valueOf, rankOf } = ordering(config)
        const suits = [...new Set(deck.map(c => c.suit))]
        const bySuit = !!(mechanic && mechanic.groupsBySuit)
        const worth = (id) => {
          if (id === null) return -Infinity
          const c = card(id) || {}
          if (c.total !== undefined) return c.total * 10 + c.high
          return bySuit ? suits.indexOf(c.suit) * 100 + rankOf(c) : valueOf(c)
        }
        return [...ids].sort((a, b) => worth(a) - worth(b))
      },
      describeMove(move, after) {
        return mechanic && mechanic.describe ? mechanic.describe(move, ctx, after) : null
      },
    }
    return plugin
  }
  createTableauPlugin.configKeys = CONFIG_KEYS
  createTableauPlugin.interaction = 'cards'
  return createTableauPlugin
}

// Moves compare as sets of cards, not as lists in the order they were picked.
function normalise(move) {
  if (!move || !Array.isArray(move.cards)) return move
  return { ...move, cards: [...move.cards].sort() }
}
