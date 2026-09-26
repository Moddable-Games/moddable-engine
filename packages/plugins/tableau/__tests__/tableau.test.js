import { createTableauPluginFor } from '../index.js'
import { buildDeck, cardIdOf, ordering } from '../src/cards.js'
import { showScore } from '../src/mechanics/pegging.js'
import { scoreRoll } from '../src/mechanics/rolling-rounds.js'
import { total as blackjackTotal } from '../src/mechanics/house.js'
import { resolveRoll } from '../src/mechanics/shooting.js'
import { bestHand } from '../src/mechanics/holdem.js'
import { koiKoiYaku, goStopScore } from '../src/mechanics/fishing.js'
import { arrangements, isSevenPairs, isThirteenOrphans, placements, doraAfter } from '../src/mechanics/mahjong-hands.js'
import { riichi, riichiPays } from '../src/mechanics/riichi-scoring.js'
import { zungJung, zungJungPays } from '../src/mechanics/zung-jung-scoring.js'
import { hongKong } from '../src/mechanics/mahjong-scoring.js'
import { createGameForFamily, createAI } from '../../../play/index.js'
import '../../../play/src/bootstrap-plugins.js'
import '../../../play/test-helpers/setup-rules-reader.js'

// engine#176. Every game played with a deck, a set of dominoes or dice rather
// than on a board goes through one plugin, and what varies between them is
// frontmatter: the deck, the deal, which cards outrank which, and the shape
// of play (`game:`). These tests hold the shapes to the rules text of the games
// that declare them, and the plugin to the one thing a card game adds to a
// board game: that a seat sees its own hand and nobody else's.

const turn = (i) => ({ __players: { currentIndex: i } })
const noRng = { request: () => null }

describe('cards', () => {
  test('a card named in frontmatter resolves to its id', () => {
    expect(cardIdOf('3-diamonds')).toBe('diamonds_3')
    expect(cardIdOf('Q-spades')).toBe('spades_Q')
    expect(cardIdOf('10H')).toBe('hearts_10')
    expect(cardIdOf('ace-clubs')).toBe('clubs_A')
  })

  test('a deck declared twice is told apart by a suffix on each id', () => {
    const one = buildDeck({ type: 'standard-52', jokers: 0 })
    const two = buildDeck({ type: 'standard-52', jokers: 0, count: 2 })
    expect(one).toHaveLength(52)
    expect(two).toHaveLength(104)
    expect(new Set(two.map(c => c.id)).size).toBe(104)
  })

  test('rankOrder is read low to high, and suits only break ties', () => {
    const { valueOf } = ordering({ rankOrder: [3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A', 2], suitOrder: ['diamonds', 'clubs', 'hearts', 'spades'] })
    expect(valueOf({ rank: '2', suit: 'diamonds' })).toBeGreaterThan(valueOf({ rank: 'A', suit: 'spades' }))
    expect(valueOf({ rank: '3', suit: 'spades' })).toBeGreaterThan(valueOf({ rank: '3', suit: 'diamonds' }))
  })
})

describe('climbing (Big 2)', () => {
  const BIG2 = {
    game: 'climbing',
    rankOrder: [3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A', 2],
    suitOrder: ['diamonds', 'clubs', 'hearts', 'spades'],
    combinations: ['single', 'pair', 'triple', 'five-card'],
    fiveCardHands: ['straight', 'flush', 'full-house', 'four-of-a-kind', 'straight-flush'],
    firstLead: '3-diamonds',
  }
  const definition = { players: ['p1', 'p2', 'p3', 'p4'], components: { deck: { type: 'standard-52', jokers: 0 } } }
  const plugin = createTableauPluginFor('standard-52')(BIG2, { definition })

  function table(hands, trick = null) {
    return { hands, community: [], drawPile: [], trick, passes: 0, finished: null, next: null }
  }
  const combo = (slice, seat, cards) => plugin.applyMove({ action: 'play', cards }, slice, turn(seat)).trick.combo

  test('the whole deck is dealt, thirteen each, and the 3 of Diamonds leads', () => {
    const game = createGameForFamily('standard-52', { variant: 'big2', rngSeed: 3 })
    const slice = game.getState().slice
    expect(slice.hands.map(h => h.length)).toEqual([13, 13, 13, 13])
    const holder = slice.hands.findIndex(h => h.includes('diamonds_3'))
    expect(game.getState().players.currentIndex).toBe(holder)
  })

  test('"must play the same combination type at a higher value, or pass"', () => {
    const lead = table([['hearts_5', 'diamonds_3'], ['spades_5', 'clubs_9', 'clubs_K', 'hearts_K']])
    const afterLead = plugin.applyMove({ action: 'play', cards: ['hearts_5'] }, lead, turn(0))
    const replies = plugin.getLegalMoves(afterLead, turn(1))
    const plays = replies.filter(m => m.action === 'play').map(m => m.cards.join())
    // Singles that beat the 5 of hearts, the 5 of spades among them on suit;
    // the pair of kings is the wrong combination type.
    expect(plays.sort()).toEqual(['clubs_9', 'clubs_K', 'hearts_K', 'spades_5'].sort())
    expect(replies).toContainEqual({ action: 'pass' })
  })

  test('a pair is worth its rank, then its higher suit', () => {
    const s = table([['diamonds_8', 'spades_8', 'diamonds_3'], ['clubs_8', 'hearts_8']])
    const high = combo(s, 0, ['diamonds_8', 'spades_8'])
    const low = combo(s, 1, ['clubs_8', 'hearts_8'])
    expect(high.key[1]).toBeGreaterThan(low.key[1])
    const afterHigh = plugin.applyMove({ action: 'play', cards: ['diamonds_8', 'spades_8'] }, s, turn(0))
    expect(plugin.getLegalMoves(afterHigh, turn(1))).toEqual([{ action: 'pass' }])
  })

  test('five-card hands rank by kind in the order the frontmatter gives', () => {
    const straight = ['hearts_4', 'clubs_5', 'hearts_6', 'spades_7', 'diamonds_8']
    const flush = ['clubs_3', 'clubs_6', 'clubs_9', 'clubs_J', 'clubs_K']
    const s = table([[...straight, 'diamonds_3'], flush])
    const afterStraight = plugin.applyMove({ action: 'play', cards: straight }, s, turn(0))
    expect(afterStraight.trick.combo.kind).toBe('five-card')
    const replies = plugin.getLegalMoves(afterStraight, turn(1))
    expect(replies).toContainEqual({ action: 'play', cards: flush })
  })

  test('a straight runs in the game\'s own order and does not wrap', () => {
    const high = ['clubs_J', 'hearts_Q', 'spades_K', 'diamonds_A', 'clubs_2']
    const wrapped = ['clubs_A', 'hearts_2', 'spades_3', 'diamonds_4', 'clubs_5']
    const moves = (hand) => plugin.getLegalMoves(table([hand]), turn(0)).filter(m => m.cards.length === 5)
    expect(moves(high)).toHaveLength(1)
    expect(moves(wrapped)).toHaveLength(0)
  })

  test('"When all other players pass, the last player who played leads the next trick"', () => {
    let s = table([['hearts_5', 'hearts_6'], ['clubs_3'], ['clubs_4'], ['diamonds_4']])
    s = plugin.applyMove({ action: 'play', cards: ['hearts_5'] }, s, turn(0))
    s = plugin.applyMove({ action: 'pass' }, s, turn(1))
    expect(plugin.turnEffects(s)).toBeNull()
    s = plugin.applyMove({ action: 'pass' }, s, turn(2))
    s = plugin.applyMove({ action: 'pass' }, s, turn(3))
    expect(s.trick).toBeNull()
    expect(plugin.turnEffects(s)).toEqual({ next: 0 })
    // A fresh lead: anything goes, and passing is not offered.
    expect(plugin.getLegalMoves(s, turn(0))).toEqual([{ action: 'play', cards: ['hearts_6'] }])
  })

  test('the first player to empty their hand wins', () => {
    const s = plugin.applyMove({ action: 'play', cards: ['hearts_5'] }, table([['hearts_5'], ['clubs_3']]), turn(0))
    expect(plugin.checkWin(s)).toBe(0)
  })

  test('a seat sees its own hand and only the backs of the others', () => {
    const s = table([['hearts_5', 'hearts_6'], ['clubs_3']])
    const view = plugin.projectForSeat(s, 1)
    expect(view.hands[1]).toEqual(['clubs_3'])
    expect(view.hands[0]).toEqual([null, null])
  })

  test('a game between four policy seats is played out to a winner', () => {
    const game = createGameForFamily('standard-52', { variant: 'big2', rngSeed: 11 })
    const ai = createAI('standard-52', 'big2', { difficulty: 'medium' })
    let result = null
    for (let ply = 0; ply < 600 && !result?.winner; ply++) {
      const seat = game.getState().players.currentIndex
      const move = ai.pickMove(game.getState().slice, seat)
      result = game.applyMove(move)
      expect(result.ok).toBe(true)
    }
    expect(result.winner).toBeDefined()
    const slice = game.getState().slice
    expect(slice.hands.some(h => h.length === 0)).toBe(true)
  })
})

describe('climbing to a finishing order (President)', () => {
  const PRESIDENT = {
    game: 'climbing',
    rankOrder: [3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A', 2],
    combinations: ['single', 'pair', 'triple', 'sequence'],
    sequence: { min: 3 },
    playTo: 'finishing-order',
    roles: [{ place: 1, title: 'President' }, { place: 2, title: 'Vice President' }, { place: -2, title: 'Vice Scum' }, { place: -1, title: 'Scum' }],
    exchange: [{ from: -1, to: 1, count: 2 }, { from: -2, to: 2, count: 1 }],
    laterLead: -1,
    rounds: 3,
  }
  const definition = { players: ['p1', 'p2', 'p3', 'p4'], components: { deck: { type: 'standard-52', jokers: 0 } }, deal: { perPlayer: 'all' } }
  const plugin = createTableauPluginFor('standard-52')({ ...PRESIDENT, deal: { perPlayer: 'all' } }, { definition })
  const fresh = (hands, extra = {}) => ({
    ...plugin.init({ hands: [[], [], [], []], community: [], drawPile: [] }, noRng),
    hands, ...extra,
  })
  const plays = (slice, seat) => plugin.getLegalMoves(slice, turn(seat)).filter(m => m.action === 'play')

  test('a sequence is three or more consecutive ranks in any suits, and beats a lower one of its length', () => {
    const slice = fresh([['hearts_4', 'clubs_5', 'spades_6', 'diamonds_7'], [], [], []])
    const seqs = plays(slice, 0).filter(m => m.cards.length >= 3).map(m => [...m.cards].sort().join(','))
    expect(seqs).toContain(['clubs_5', 'hearts_4', 'spades_6'].join(','))
    expect(seqs).toContain(['clubs_5', 'diamonds_7', 'hearts_4', 'spades_6'].join(','))
    // 4-5-6 on the table: 5-6-7 beats it, and a four-card run does not answer a three.
    const led = plugin.applyMove({ action: 'play', cards: ['hearts_4', 'clubs_5', 'spades_6'] }, fresh([['hearts_4', 'clubs_5', 'spades_6', 'hearts_K'], ['clubs_6', 'hearts_7', 'spades_5', 'clubs_8'], ['clubs_K'], ['diamonds_K']]), turn(0))
    const answers = plays(led, 1).map(m => [...m.cards].sort().join(','))
    expect(answers).toContain(['clubs_6', 'hearts_7', 'spades_5'].join(','))
    expect(answers.every(a => a.split(',').length === 3)).toBe(true)
    expect(answers).not.toContain(['clubs_6', 'hearts_7', 'spades_5', 'clubs_8'].sort().join(','))
  })

  test('an equal rank does not beat, because suits are not ranked', () => {
    const led = plugin.applyMove({ action: 'play', cards: ['hearts_9'] }, fresh([['hearts_9', 'hearts_3'], ['spades_9', 'clubs_3'], ['clubs_4'], ['clubs_5']]), turn(0))
    expect(plays(led, 1).map(m => m.cards[0])).not.toContain('spades_9')
  })

  test('play goes on past the first player out, who takes no further part', () => {
    const slice = fresh([['spades_2'], ['hearts_3', 'hearts_4'], ['clubs_3', 'clubs_4'], ['diamonds_3', 'diamonds_4']])
    const out = plugin.applyMove({ action: 'play', cards: ['spades_2'] }, slice, turn(0))
    expect(out.out).toEqual([0])
    expect(out.finished).toBeNull()
    expect(out.next).toBe(1)
    // The three still in pass on the 2; the next still in after its player leads.
    let s = out
    for (const seat of [1, 2, 3]) s = plugin.applyMove({ action: 'pass' }, s, turn(seat))
    expect(s.trick).toBeNull()
    expect(s.next).toBe(1)
    expect(plugin.getLegalMoves(s, turn(0))).toEqual([])
  })

  test('the round ends when one player still holds cards, and the exchange follows', () => {
    // Seats go out 2, 0, 3; seat 1 is last, the Scum.
    let s = fresh([['hearts_5'], ['spades_3', 'clubs_3', 'hearts_3'], ['spades_A'], ['diamonds_9']])
    s = plugin.applyMove({ action: 'play', cards: ['spades_A'] }, { ...s, next: 2 }, turn(2))
    for (const seat of [3, 0, 1]) s = plugin.applyMove({ action: 'pass' }, s, turn(seat))
    expect(s.next).toBe(3)
    s = plugin.applyMove({ action: 'play', cards: ['diamonds_9'] }, s, turn(3))
    for (const seat of [0, 1]) s = plugin.applyMove({ action: 'pass' }, s, turn(seat))
    expect(s.next).toBe(0)
    s = plugin.applyMove({ action: 'play', cards: ['hearts_5'] }, s, turn(0))

    expect(s.round).toBe(1)
    expect(s.lastRound.order).toEqual([2, 3, 0, 1])
    expect(s.titles).toEqual([0, 0, 1, 0])
    expect(s.roles).toEqual(['Vice Scum', 'Scum', 'President', 'Vice President'])
    expect(s.phase).toBe('exchange')
    // The Scum's two best went to the President already; the President chooses two to return.
    expect(s.hands[2]).toHaveLength(15)
    expect(s.hands[1]).toHaveLength(11)
    expect(s.next).toBe(2)
    const returns = plugin.getLegalMoves(s, turn(2))
    expect(returns.every(m => m.action === 'give' && m.cards.length === 2)).toBe(true)
    const back = returns[0].cards
    s = plugin.applyMove(returns[0], s, turn(2))
    expect(s.hands[1]).toEqual(expect.arrayContaining(back))
    // Then the Vice President returns one to the Vice Scum.
    expect(s.next).toBe(3)
    s = plugin.applyMove(plugin.getLegalMoves(s, turn(3))[0], s, turn(3))
    expect(s.hands.map(h => h.length)).toEqual([13, 13, 13, 13])
    // And the Scum leads the round.
    expect(s.phase).toBe('play')
    expect(s.next).toBe(1)
  })

  test('the best cards are the ones taken from the lower role', () => {
    const { valueOf } = ordering(PRESIDENT)
    let s = fresh([['hearts_5'], ['spades_3', 'clubs_3', 'hearts_3'], ['spades_A'], ['diamonds_9']])
    s = plugin.applyMove({ action: 'play', cards: ['spades_A'] }, { ...s, next: 2 }, turn(2))
    for (const seat of [3, 0, 1]) s = plugin.applyMove({ action: 'pass' }, s, turn(seat))
    s = plugin.applyMove({ action: 'play', cards: ['diamonds_9'] }, s, turn(3))
    for (const seat of [0, 1]) s = plugin.applyMove({ action: 'pass' }, s, turn(seat))
    const before = plugin.applyMove({ action: 'play', cards: ['hearts_5'] }, s, turn(0))
    // Everything the Scum still holds is below the two the President was given.
    const given = before.hands[2].slice(13)
    expect(given).toHaveLength(2)
    const kept = Math.max(...before.hands[1].map(id => valueOf(plugin.cardOf(id))))
    expect(given.every(id => valueOf(plugin.cardOf(id)) >= kept)).toBe(true)
  })

  test('after the chosen number of rounds the most first places wins; open play never ends by itself', () => {
    const play = (settings, stopAt) => {
      const game = createGameForFamily('standard-52', { variant: 'president', rngSeed: 7, settings })
      const ai = createAI('standard-52', 'president', { difficulty: 'medium', definition: game.raw.definition })
      for (let ply = 0; ply < 5000; ply++) {
        const st = game.getState()
        if (st.slice.finished !== null || st.slice.round >= stopAt) break
        expect(game.applyMove(ai.pickMove(st.slice, st.players.currentIndex)).ok).toBe(true)
      }
      return game.getState().slice
    }
    const three = play({ rounds: 3 }, 99)
    expect(three.finished).not.toBeNull()
    expect(three.round).toBeGreaterThanOrEqual(3)
    const top = Math.max(...three.titles)
    expect(three.titles[three.finished]).toBe(top)
    expect(three.titles.filter(n => n === top)).toHaveLength(1)

    const open = play({ rounds: 'open' }, 4)
    expect(open.round).toBe(4)
    expect(open.finished).toBeNull()
  })

  test('four to eight seat themselves, and the deck is shared evenly', () => {
    for (const players of [4, 5, 8]) {
      const game = createGameForFamily('standard-52', { variant: 'president', rngSeed: 2, settings: { players } })
      const hands = game.getState().slice.hands
      expect(hands).toHaveLength(players)
      expect(new Set(hands.map(h => h.length)).size).toBe(1)
      expect(hands[0]).toHaveLength(Math.floor(52 / players))
    }
  })

  test('the first round is led by the holder of the 3 of Clubs', () => {
    const game = createGameForFamily('standard-52', { variant: 'president', rngSeed: 5 })
    const st = game.getState()
    expect(st.slice.hands[st.players.currentIndex]).toContain('clubs_3')
  })
})

describe('war', () => {
  const WAR = { game: 'war', rankOrder: [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A'], warFaceDown: 3 }
  const definition = { players: ['p1', 'p2'], components: { deck: { type: 'standard-52', jokers: 0 } } }
  const plugin = createTableauPluginFor('standard-52')(WAR, { definition })

  test('the deck is split between two players, face down', () => {
    const game = createGameForFamily('standard-52', { variant: 'war', rngSeed: 5 })
    expect(game.getState().slice.hands.map(h => h.length)).toEqual([26, 26])
    const view = plugin.projectForSeat(game.getState().slice, 0)
    // Neither player looks at their own pile in War.
    expect(view.hands.flat().every(c => c === null)).toBe(true)
  })

  test('the higher card takes both', () => {
    const slice = plugin.init({}, noRng)
    const s = { ...slice, hands: [['spades_K', 'clubs_2'], ['hearts_4', 'clubs_3']] }
    const after = plugin.applyMove({ action: 'turn' }, s, turn(0))
    expect(after.hands[0]).toHaveLength(3)
    expect(after.hands[1]).toHaveLength(1)
  })

  test('a tie is a war: three face down, and the next face-up card decides', () => {
    const slice = plugin.init({}, noRng)
    const s = {
      ...slice,
      hands: [
        ['spades_9', 'clubs_2', 'clubs_3', 'clubs_4', 'spades_A', 'hearts_2'],
        ['hearts_9', 'diamonds_2', 'diamonds_3', 'diamonds_4', 'hearts_5', 'hearts_3'],
      ],
    }
    const after = plugin.applyMove({ action: 'turn' }, s, turn(0))
    expect(after.hands[0]).toHaveLength(11)
    expect(after.hands[1]).toHaveLength(1)
  })

  test('a player who cannot finish a war loses it', () => {
    const slice = plugin.init({}, noRng)
    const s = { ...slice, hands: [['spades_9', 'clubs_2'], ['hearts_9', 'diamonds_2', 'diamonds_3', 'diamonds_4', 'hearts_5']] }
    const after = plugin.applyMove({ action: 'turn' }, s, turn(0))
    expect(plugin.checkWin(after)).toBe(1)
  })
})

describe('trick-taking', () => {
  const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A']
  const deck = { type: 'standard-52', jokers: 0 }
  const four = ['north', 'east', 'south', 'west']
  const make = (config, players = four) => createTableauPluginFor('standard-52')({ game: 'trick-taking', rankOrder: RANKS, ...config }, { definition: { players, components: { deck } } })
  const at = (plugin, slice, patch) => ({ ...slice, ...patch })
  const fresh = (plugin) => plugin.init({}, { request: () => ({ shuffle: a => a, nextInt: () => 42 }) })

  test('"Each player must follow suit if possible"', () => {
    const plugin = make({ trump: 'none' })
    const s = at(plugin, fresh(plugin), {
      phase: 'play', trickNo: 1,
      hands: [['hearts_2'], ['hearts_9', 'spades_A'], ['clubs_3'], ['clubs_4']],
      trick: [{ seat: 0, card: 'hearts_K' }],
    })
    expect(plugin.getLegalMoves(s, turn(1))).toEqual([{ action: 'play', cards: ['hearts_9'] }])
    const void_ = at(plugin, s, { hands: [[], ['spades_A', 'clubs_2'], [], []] })
    expect(plugin.getLegalMoves(void_, turn(1))).toHaveLength(2)
  })

  test('the highest card of the led suit wins unless a trump is played, and its winner leads', () => {
    const plugin = make({ trump: 'spades' })
    let s = at(plugin, fresh(plugin), {
      phase: 'play', trickNo: 1, trump: 'spades',
      hands: [['hearts_K', 'clubs_2'], ['hearts_A', 'clubs_3'], ['spades_2', 'clubs_4'], ['hearts_3', 'clubs_5']],
      trick: [],
    })
    s = plugin.applyMove({ action: 'play', cards: ['hearts_K'] }, s, turn(0))
    s = plugin.applyMove({ action: 'play', cards: ['hearts_A'] }, s, turn(1))
    s = plugin.applyMove({ action: 'play', cards: ['spades_2'] }, s, turn(2))
    s = plugin.applyMove({ action: 'play', cards: ['hearts_3'] }, s, turn(3))
    expect(s.lastTrick.winner).toBe(2)
    expect(s.won[2]).toBe(1)
    expect(plugin.turnEffects(s)).toEqual({ next: 2 })
  })

  test('Whist turns the dealer\'s last card for trump', () => {
    const plugin = make({ trump: 'last-card', partnerships: [['north', 'south'], ['east', 'west']], scoring: { type: 'over-book', book: 6 }, target: 5, deal: { perPlayer: 13 } })
    const s = fresh(plugin)
    expect(s.hands.map(h => h.length)).toEqual([13, 13, 13, 13])
    expect(s.hands[s.dealer]).toContain(s.trumpCard)
    expect(s.trump).toBe(plugin.cardOf(s.trumpCard).suit)
    // "The player to the dealer's left leads".
    expect(s.next).toBe((s.dealer + 1) % 4)
  })

  describe('Hearts', () => {
    const HEARTS = {
      trump: 'none', leadsWith: '2-clubs', breaking: 'hearts', firstTrickForbids: ['hearts', 'Q-spades'],
      passing: { count: 3, cycle: ['left', 'right', 'across', 'none'] },
      scoring: { type: 'penalty', points: { hearts: 1, 'Q-spades': 13 }, moon: 26 }, target: 100,
      deal: { perPlayer: 'all' },
    }
    const plugin = make(HEARTS, ['p1', 'p2', 'p3', 'p4'])

    test('three cards pass to the left, unseen by anyone else until they arrive', () => {
      let s = fresh(plugin)
      expect(s.phase).toBe('pass')
      const gives = s.hands.map(h => h.slice(0, 3))
      for (let seat = 0; seat < 4; seat++) {
        const i = (s.dealer + 1 + seat) % 4
        const view = plugin.projectForSeat(s, (i + 1) % 4)
        expect(view.hands[i].every(c => c === null)).toBe(true)
        s = plugin.applyMove({ action: 'give', cards: gives[i] }, s, turn(i))
      }
      expect(s.phase).toBe('play')
      for (let i = 0; i < 4; i++) expect(s.hands[(i + 1) % 4]).toEqual(expect.arrayContaining(gives[i]))
    })

    test('"The player holding the 2 of Clubs leads it"', () => {
      const s = at(plugin, fresh(plugin), { phase: 'play', trickNo: 0, trick: [], hands: [['clubs_2', 'clubs_9', 'hearts_4'], ['clubs_3'], ['spades_Q', 'hearts_5', 'diamonds_2'], ['clubs_5']] })
      expect(plugin.getLegalMoves(s, turn(0))).toEqual([{ action: 'play', cards: ['clubs_2'] }])
    })

    test('no penalty card is discarded to the first trick while anything else is held', () => {
      const s = at(plugin, fresh(plugin), { phase: 'play', trickNo: 0, trick: [{ seat: 0, card: 'clubs_2' }], hands: [[], ['spades_Q', 'hearts_5', 'diamonds_2'], [], []] })
      expect(plugin.getLegalMoves(s, turn(1))).toEqual([{ action: 'play', cards: ['diamonds_2'] }])
    })

    test('"Hearts may not be led until Hearts has been broken", unless only Hearts are held', () => {
      const s = at(plugin, fresh(plugin), { phase: 'play', trickNo: 3, trick: [], broken: false, hands: [['hearts_4', 'clubs_9'], [], [], []] })
      expect(plugin.getLegalMoves(s, turn(0))).toEqual([{ action: 'play', cards: ['clubs_9'] }])
      expect(plugin.getLegalMoves(at(plugin, s, { broken: true }), turn(0))).toHaveLength(2)
      expect(plugin.getLegalMoves(at(plugin, s, { hands: [['hearts_4'], [], [], []] }), turn(0))).toHaveLength(1)
    })

    test('a hand scores the penalty cards each player took, and shooting the moon gives 26 to everyone else', () => {
      const base = at(plugin, fresh(plugin), { phase: 'play', trickNo: 12, scores: [10, 20, 30, 40], trick: [], hands: [['hearts_A'], ['hearts_2'], ['clubs_2'], ['clubs_3']] })
      const play = (s) => [0, 1, 2, 3].reduce((st, i) => plugin.applyMove({ action: 'play', cards: [st.hands[i][0]] }, st, turn(i)), s)
      const normal = play(at(plugin, base, { taken: [3, 0, 13, 8] }))
      // Seat 0 takes the last trick and its two hearts.
      expect(normal.lastHand.delta).toEqual([5, 0, 13, 8])
      const moon = play(at(plugin, base, { taken: [24, 0, 0, 0] }))
      expect(moon.lastHand.delta).toEqual([0, 26, 26, 26])
    })

    test('the lowest score wins once anyone reaches the target', () => {
      const s = at(plugin, fresh(plugin), { phase: 'play', trickNo: 12, scores: [99, 50, 60, 70], taken: [1, 0, 0, 0], trick: [], hands: [['hearts_A'], ['hearts_2'], ['clubs_2'], ['clubs_3']] })
      const end = [0, 1, 2, 3].reduce((st, i) => plugin.applyMove({ action: 'play', cards: [st.hands[i][0]] }, st, turn(i)), s)
      expect(plugin.checkWin(end)).toBe(1)
    })
  })

  describe('Spades', () => {
    const SPADES = {
      trump: 'spades', breaking: 'spades', partnerships: [['north', 'south'], ['east', 'west']],
      bidding: { min: 0, max: 13, nil: true },
      scoring: { type: 'contract', perTrick: 10, bagLimit: 10, bagPenalty: 100, nil: 100 }, target: 500,
      deal: { perPlayer: 13 },
    }
    const plugin = make(SPADES)

    test('each player bids 0 to 13 before play, starting left of the dealer', () => {
      const s = fresh(plugin)
      expect(s.phase).toBe('bid')
      const moves = plugin.getLegalMoves(s, turn(s.next))
      expect(moves.map(m => m.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    })

    test('a made bid scores ten a trick plus a point a bag; a set bid loses ten a trick; nil is its own hundred', () => {
      const s = at(plugin, fresh(plugin), {
        phase: 'play', trickNo: 12, scores: [0, 0], bags: [0, 0], trick: [],
        bids: [4, 3, 0, 5],
        // north, east, south, west: north-south made 4 of 4 with south's nil
        // taking one trick; east-west bid 8 and took 8 before the last.
        won: [4, 3, 1, 4],
        hands: [['spades_A'], ['hearts_2'], ['hearts_3'], ['hearts_4']],
      })
      const end = [0, 1, 2, 3].reduce((st, i) => plugin.applyMove({ action: 'play', cards: [st.hands[i][0]] }, st, turn(i)), s)
      // north wins the last trick: 5 tricks on a bid of 4, and south's nil
      // failed with its trick a bag. east-west took 7 on a bid of 8.
      expect(end.lastHand.delta).toEqual([4 * 10 + 1 - 100, -80])
      expect(end.bags).toEqual([2, 0])
    })
  })

  test('four policy seats play Whist, Hearts and Spades through to a result', () => {
    for (const variant of ['whist', 'hearts', 'spades']) {
      const game = createGameForFamily('standard-52', { variant, rngSeed: 5 })
      const ai = createAI('standard-52', variant, { difficulty: 'medium' })
      let result = null
      for (let ply = 0; ply < 5000 && (result?.winner === undefined || result?.winner === null); ply++) {
        result = game.applyMove(ai.pickMove(game.getState().slice, game.getState().players.currentIndex))
        expect(result.ok).toBe(true)
      }
      expect(typeof result.winner).toBe('number')
    }
  })
})

describe('shedding (Crazy Eights)', () => {
  const plugin = createTableauPluginFor('standard-52')({ game: 'shedding', wild: 8, starterSkips: 8 }, {
    definition: { players: ['a', 'b'], components: { deck: { type: 'standard-52', jokers: 0 } } },
  })
  const table = (hands, top, patch = {}) => ({ hands, community: [], drawPile: ['clubs_2', 'clubs_3'], discard: [top], suit: plugin.cardOf(top).suit, passes: 0, finished: null, next: null, ...patch })

  test('"matches the suit of the top discard, or matches the rank, or is an 8"', () => {
    const s = table([['hearts_4', 'spades_9', 'clubs_K', 'diamonds_2'], []], 'hearts_9')
    const cards = plugin.getLegalMoves(s, turn(0)).map(m => m.cards[0])
    expect(cards.sort()).toEqual(['hearts_4', 'spades_9'])
  })

  test('an eight is always playable and names the suit that must follow', () => {
    const s = table([['diamonds_8', 'clubs_K'], ['clubs_4', 'spades_5']], 'hearts_9')
    const eights = plugin.getLegalMoves(s, turn(0)).filter(m => m.cards[0] === 'diamonds_8')
    expect(eights.map(m => m.suit).sort()).toEqual(['clubs', 'diamonds', 'hearts', 'spades'])
    const after = plugin.applyMove({ action: 'play', cards: ['diamonds_8'], suit: 'spades' }, s, turn(0))
    expect(plugin.getLegalMoves(after, turn(1))).toEqual([{ action: 'play', cards: ['spades_5'] }])
  })

  test('a player who cannot play draws, one card at a time, and keeps the turn', () => {
    const s = table([['clubs_K'], ['spades_5']], 'hearts_9')
    expect(plugin.getLegalMoves(s, turn(0))).toEqual([{ action: 'draw' }])
    const after = plugin.applyMove({ action: 'draw' }, s, turn(0))
    expect(after.hands[0]).toEqual(['clubs_K', 'clubs_2'])
    expect(plugin.turnEffects(after)).toEqual({ next: 0 })
    expect(plugin.getLegalMoves(table([['clubs_K'], []], 'hearts_9', { drawPile: [] }), turn(0))).toEqual([{ action: 'pass' }])
  })

  test('the first player to empty their hand wins', () => {
    const after = plugin.applyMove({ action: 'play', cards: ['hearts_4'] }, table([['hearts_4'], ['spades_5']], 'hearts_9'), turn(0))
    expect(plugin.checkWin(after)).toBe(0)
  })

  test('"If it is an 8, bury it and reveal the next card"', () => {
    const s = plugin.init({}, { request: () => ({ shuffle: a => a, nextInt: () => 1 }) })
    expect(plugin.cardOf(s.discard[0]).rank).not.toBe('8')
  })
})

describe('dominoes', () => {
  const definition = { players: ['south', 'north'], components: { deck: { type: 'dominoes-28' } } }
  const block = createTableauPluginFor('double-six-dominoes')({ game: 'dominoes', draw: false, scoring: { out: 'opponents', blocked: 'others-minus-own' }, deal: { perPlayer: 7 } }, { definition })
  const fives = createTableauPluginFor('double-six-dominoes')({ game: 'dominoes', draw: true, spinner: true, scoreFives: true, scoring: { out: 'opponents', blocked: 'others', roundTo: 5 }, target: 61, deal: { perPlayer: 7 } }, { definition })
  const fresh = (plugin) => plugin.init({}, { request: () => ({ shuffle: a => a, nextInt: () => 3 }) })
  const line = (plugin, patch) => ({ ...fresh(plugin), ...patch })

  test('"The player with the highest double plays it first"', () => {
    const s = fresh(block)
    const holder = s.hands.findIndex(h => h.includes(s.opening))
    expect(block.cardOf(s.opening).isDouble).toBe(true)
    expect(s.next).toBe(holder)
    expect(block.getLegalMoves(s, turn(holder))).toEqual([{ action: 'play', cards: [s.opening], end: 'start' }])
  })

  test('a tile is played by matching one of its halves to an open end', () => {
    const s = line(block, { first: { id: '3_5', low: 3, high: 5, double: false }, hands: [['1_3', '5_6', '2_4'], ['0_0']] })
    const moves = block.getLegalMoves(s, turn(0))
    expect(moves).toEqual([{ action: 'play', cards: ['1_3'], end: 'left' }, { action: 'play', cards: ['5_6'], end: 'right' }])
    const after = block.applyMove(moves[0], s, turn(0))
    expect(after.arms.left[0].out).toBe(1)
  })

  test('Block has no boneyard: a player who cannot play passes, and a blocked game goes to the lowest pips', () => {
    let s = line(block, { first: { id: '3_5', low: 3, high: 5, double: false }, hands: [['0_1'], ['6_6']], drawPile: ['2_2'] })
    expect(block.getLegalMoves(s, turn(0))).toEqual([{ action: 'pass' }])
    s = block.applyMove({ action: 'pass' }, s, turn(0))
    s = block.applyMove({ action: 'pass' }, s, turn(1))
    expect(block.checkWin(s)).toBe(0)
    // "scores the pip totals of all other players minus their own"
    expect(s.lastHand.gain).toBe(12 - 1)
  })

  test('All Fives draws from the boneyard until a tile plays', () => {
    const s = line(fives, { first: { id: '3_5', low: 3, high: 5, double: false }, hands: [['0_1'], ['6_6']], drawPile: ['2_2', '1_3'] })
    expect(fives.getLegalMoves(s, turn(0))).toEqual([{ action: 'draw' }])
  })

  test('the open ends score whenever they total a multiple of five, a double counting both halves', () => {
    // 5-5 opens: ten on the table.
    const open = fives.applyMove({ action: 'play', cards: ['5_5'], end: 'start' }, line(fives, { hands: [['5_5', '0_0'], ['0_5']], opening: '5_5' }), turn(0))
    expect(open.scores[0]).toBe(10)
    // 0-5 on the right: the spinner still counts both halves, 10 + 0.
    const next = fives.applyMove({ action: 'play', cards: ['0_5'], end: 'right' }, open, turn(1))
    expect(next.scores[1]).toBe(10)
  })

  test('a spinner opens its other two sides once both of its first sides are played on', () => {
    const base = line(fives, { first: { id: '4_4', low: 4, high: 4, double: true }, hands: [['1_4'], []] })
    const one = { ...base, arms: { left: [{ id: '2_4', out: 2, double: false }], right: [], up: [], down: [] } }
    expect(fives.getLegalMoves(one, turn(0)).map(m => m.end)).toEqual(['right'])
    const both = { ...base, arms: { left: [{ id: '2_4', out: 2, double: false }], right: [{ id: '3_4', out: 3, double: false }], up: [], down: [] } }
    expect(fives.getLegalMoves(both, turn(0)).map(m => m.end)).toEqual(['up', 'down'])
  })

  test('policy seats play Block and All Fives through to a result', () => {
    for (const variant of ['block', 'all-fives']) {
      const game = createGameForFamily('double-six-dominoes', { variant, rngSeed: 9 })
      const ai = createAI('double-six-dominoes', variant, { difficulty: 'medium' })
      let result = null
      for (let ply = 0; ply < 3000 && (result?.winner === undefined || result?.winner === null); ply++) {
        result = game.applyMove(ai.pickMove(game.getState().slice, game.getState().players.currentIndex))
        expect(result.ok).toBe(true)
      }
      expect(result.winner).not.toBeNull()
    }
  })
})

describe('a hand per double: trains (Mexican Train)', () => {
  const TRAINS = { game: 'trains', publicTrain: true, afterStart: 'holder', tilesPerPlayer: { 2: 5 } }
  const definition = { players: ['p1', 'p2'], components: { deck: { type: 'dominoes-28', maxPips: 12 } } }
  const plugin = createTableauPluginFor('double-six-dominoes')(TRAINS, { definition })
  const base = plugin.init({ hands: [[], []], community: [], drawPile: [] }, noRng)
  // The 12-12 is down; both players have started unless a test says otherwise.
  const table = (hands, extra = {}) => ({ ...base, hands, drawPile: ['1_2', '3_4'], started: [true, true], next: 0, ...extra })
  const moves = (slice, seat) => plugin.getLegalMoves(slice, turn(seat))
  const targets = (slice, seat) => new Set(moves(slice, seat).filter(m => m.action === 'play').map(m => m.train))

  test('the engine is the double-twelve and the game is thirteen hands', () => {
    expect(base.hub).toBe('12_12')
    expect(base.value).toBe(12)
    const game = createGameForFamily('double-six-dominoes', { variant: 'mexican-train', rngSeed: 4 })
    expect(game.getState().slice.hub).toBe('12_12')
  })

  test('a first turn is a run on one\'s own train, ended at will', () => {
    let s = table([['5_12', '5_7', '0_0'], ['11_12']], { started: [false, false] })
    expect(targets(s, 0)).toEqual(new Set([0]))
    s = plugin.applyMove({ action: 'play', cards: ['5_12'], train: 0 }, s, turn(0))
    expect(s.next).toBe(0)
    expect(moves(s, 0)).toEqual(expect.arrayContaining([{ action: 'play', cards: ['5_7'], train: 0 }, { action: 'end' }]))
    s = plugin.applyMove({ action: 'play', cards: ['5_7'], train: 0 }, s, turn(0))
    s = plugin.applyMove({ action: 'end' }, s, turn(0))
    expect(s.started[0]).toBe(true)
    expect(s.next).toBe(1)
  })

  test('after the first turn: one\'s own train and the Mexican Train, and another\'s only once it is marked', () => {
    const s = table([['3_12'], ['4_12']])
    expect(targets(s, 0)).toEqual(new Set([0, 'public']))
    expect(targets({ ...s, markers: [false, true] }, 0)).toEqual(new Set([0, 'public', 1]))
  })

  test('a player who cannot play draws one, may play only it, and otherwise marks their train', () => {
    let s = table([['1_1'], ['2_2']], { drawPile: ['4_5', '6_12'] })
    expect(moves(s, 0)).toEqual([{ action: 'draw' }])
    s = plugin.applyMove({ action: 'draw' }, s, turn(0))
    expect(s.hands[0]).toContain('4_5')
    expect(moves(s, 0)).toEqual([{ action: 'pass' }])
    s = plugin.applyMove({ action: 'pass' }, s, turn(0))
    expect(s.markers[0]).toBe(true)
    expect(s.next).toBe(1)
    // Playing on one's own marked train takes the marker off.
    const back = plugin.applyMove({ action: 'play', cards: ['6_12'], train: 0 }, { ...s, hands: [['6_12', '1_1'], ['2_2']], next: 0 }, turn(0))
    expect(back.markers[0]).toBe(false)
  })

  test('a double earns another tile, and a double left open must be answered next, on its train', () => {
    let s = table([['7_12', '7_7', '3_3'], ['2_7', '9_12']])
    s = plugin.applyMove({ action: 'play', cards: ['7_12'], train: 0 }, s, turn(0))
    s = { ...s, next: 0 }
    s = plugin.applyMove({ action: 'play', cards: ['7_7'], train: 0 }, s, turn(0))
    expect(s.next).toBe(0)
    expect(s.unsatisfied).toEqual([0])
    // Nothing else of seat 0's fits anywhere: it draws, then passes, and the double stays open.
    s = plugin.applyMove({ action: 'draw' }, { ...s, drawPile: ['1_2'] }, turn(0))
    s = plugin.applyMove({ action: 'pass' }, s, turn(0))
    expect(s.next).toBe(1)
    // Seat 1 could start its own train or the Mexican Train with 12-9, but must answer the 7-7.
    expect(moves(s, 1).filter(m => m.action === 'play')).toEqual([{ action: 'play', cards: ['2_7'], train: 0 }])
    s = plugin.applyMove({ action: 'play', cards: ['2_7'], train: 0 }, s, turn(1))
    expect(s.unsatisfied).toEqual([])
  })

  test('the hand ends when a player is out, even on a double, and everyone is charged the pips they hold', () => {
    const s = table([['5_12'], ['6_6', '0_3']], { hand: 0 })
    const after = plugin.applyMove({ action: 'play', cards: ['5_12'], train: 0 }, s, turn(0))
    expect(after.hand).toBe(1)
    expect(after.totals).toEqual([0, 15])
    expect(after.hub).toBe('11_11')
  })
})

describe('a hand per double: branching (Chickenfoot)', () => {
  const BRANCHING = { game: 'branching', openingArms: 4, doubleToes: 3, afterStart: 'next', blankDouble: 50, tilesPerPlayer: { 2: 5 } }
  const definition = { players: ['p1', 'p2'], components: { deck: { type: 'dominoes-28', maxPips: 9 } } }
  const plugin = createTableauPluginFor('double-six-dominoes')(BRANCHING, { definition })
  const base = plugin.init({ hands: [[], []], community: [], drawPile: [] }, noRng)
  const table = (hands, extra = {}) => ({ ...base, hands, drawPile: [], next: 0, ...extra })
  const ends = (slice, seat) => plugin.getLegalMoves(slice, turn(seat)).filter(m => m.action === 'play')

  test('the first double is the 9-9, with four arms, and the game is ten hands', () => {
    expect(base.root).toBe('9_9')
    expect(base.ends).toHaveLength(4)
    expect(base.ends.every(e => e.value === 9 && e.toe)).toBe(true)
  })

  test('all four arms of the opening double are filled before any is extended', () => {
    let s = table([['1_9', '1_5'], ['2_9', '3_9', '4_9', '0_0']])
    s = plugin.applyMove({ action: 'play', cards: ['1_9'], end: 'e0' }, s, turn(0))
    // The 1 now showing cannot be played on while three arms are empty.
    expect(ends(s, 0)).toEqual([])
    expect(ends(s, 1).map(m => m.cards[0]).sort()).toEqual(['2_9', '3_9', '4_9'])
    for (const [seat, id] of [[1, '2_9'], [1, '3_9'], [1, '4_9']]) {
      const end = s.ends.find(e => e.toe).key
      s = plugin.applyMove({ action: 'play', cards: [id], end }, s, turn(seat))
    }
    expect(ends(s, 0).map(m => m.cards[0])).toEqual(['1_5'])
  })

  test('a later double opens a chicken foot of three toes that must all be filled first', () => {
    let s = table([['5_5', '2_8'], ['1_5', '2_5', '3_5', '0_8']], { ends: [{ key: 'a', value: 5, toe: false }, { key: 'b', value: 8, toe: false }], endCount: 2 })
    s = plugin.applyMove({ action: 'play', cards: ['5_5'], end: 'a' }, s, turn(0))
    expect(s.ends.filter(e => e.toe)).toHaveLength(3)
    // Seat 1 holds 8-0 for the open 8, but may only fill toes.
    expect(ends(s, 1).map(m => m.cards[0]).sort()).toEqual(['1_5', '2_5', '3_5'])
  })

  test('the 0-0 left in a hand costs fifty', () => {
    const s = table([['0_4'], ['0_0', '1_1']], { ends: [{ key: 'a', value: 4, toe: false }], endCount: 1 })
    const after = plugin.applyMove({ action: 'play', cards: ['0_4'], end: 'a' }, s, turn(0))
    expect(after.totals).toEqual([0, 52])
    expect(after.root).toBe('8_8')
  })

  test('both games are played out to the lowest total by computer seats', () => {
    for (const variant of ['chickenfoot', 'mexican-train']) {
      const game = createGameForFamily('double-six-dominoes', { variant, rngSeed: 3 })
      const ai = createAI('double-six-dominoes', variant, { difficulty: 'medium', definition: game.raw.definition })
      for (let ply = 0; ply < 20000; ply++) {
        const st = game.getState()
        if (st.slice.finished !== null) break
        expect(game.applyMove(ai.pickMove(st.slice, st.players.currentIndex)).ok).toBe(true)
      }
      const s = game.getState().slice
      expect(s.finished).not.toBeNull()
      expect(s.hand).toBe(variant === 'chickenfoot' ? 9 : 12)
      if (s.finished !== 'draw') expect(s.totals[s.finished]).toBe(Math.min(...s.totals))
    }
  })
})

describe('patience (Klondike, FreeCell, Spider)', () => {
  const one = { players: ['p1'], components: { deck: { type: 'standard-52', jokers: 0 } } }
  const KLONDIKE = { game: 'patience', columns: [1, 2, 3, 4, 5, 6, 7], faceUp: 'top', build: 'alternate-colour', lift: 'alternate-colour', emptyColumn: 'K', foundations: 4, stock: 'waste', drawCount: 1, foundationToTableau: true }
  const FREECELL = { game: 'patience', columns: [7, 7, 7, 7, 6, 6, 6, 6], faceUp: 'all', build: 'alternate-colour', lift: 'one', supermove: true, emptyColumn: 'any', foundations: 4, freeCells: 4 }
  const SPIDER = { game: 'patience', columns: [6, 6, 6, 6, 5, 5, 5, 5, 5, 5], faceUp: 'top', build: 'any-suit', lift: 'same-suit', emptyColumn: 'any', completeRuns: 8, stock: 'columns', suitsInPlay: 4 }
  const make = (config, deck = { type: 'standard-52', jokers: 0 }) => createTableauPluginFor('standard-52')(config, { definition: { ...one, components: { deck } } })
  const klondike = make(KLONDIKE)
  const freecell = make(FREECELL)
  const spider = make(SPIDER, { type: 'standard-52', count: 2, jokers: 0 })
  const up = (...ids) => ids.map(id => ({ id, up: true }))
  const down = (...ids) => ids.map(id => ({ id, up: false }))
  const emptyFoundations = () => ({ 'spades:1': [], 'hearts:1': [], 'clubs:1': [], 'diamonds:1': [] })
  const position = (plugin, columns, extra = {}) => ({
    ...plugin.init({ hands: [[]], community: [], drawPile: [] }, noRng),
    columns, stock: [], waste: [], foundations: emptyFoundations(), completed: [], finished: null, ...extra,
  })
  const moves = (plugin, slice) => plugin.getLegalMoves(slice, turn(0))
  const to = (plugin, slice, id) => moves(plugin, slice).filter(m => m.cards?.[0] === id).map(m => m.to).sort()

  test('Klondike deals seven columns of one to seven, the top card of each face up, and 24 to the stock', () => {
    const game = createGameForFamily('standard-52', { variant: 'klondike', rngSeed: 1 })
    const s = game.getState().slice
    expect(s.columns.map(c => c.length)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(s.columns.every(c => c.filter(x => x.up).length === 1 && c[c.length - 1].up)).toBe(true)
    expect(s.stock).toHaveLength(24)
    // Face-down cards and the stock are not shown to the player.
    const view = klondike.projectForSeat(s, 0)
    expect(view.columns[6].slice(0, 6).every(x => x.id === null)).toBe(true)
    expect(view.stock.every(id => id === null)).toBe(true)
  })

  test('a red card goes on a black card one higher; the same colour does not', () => {
    const s = position(klondike, [up('clubs_8'), up('hearts_7'), up('spades_7'), up('hearts_A')])
    expect(to(klondike, s, 'hearts_7')).toContain('column 1')
    expect(to(klondike, s, 'spades_7')).not.toContain('column 1')
  })

  test('only a King goes into an empty Klondike column, and a run moves whole, turning the card it uncovers', () => {
    let s = position(klondike, [[], [...down('clubs_2'), ...up('spades_K', 'hearts_Q')], up('diamonds_J'), up('clubs_Q')])
    expect(to(klondike, s, 'spades_K')).toEqual(['column 1'])
    expect(to(klondike, s, 'clubs_Q')).toEqual([])
    s = klondike.applyMove({ action: 'move', cards: ['spades_K'], to: 'column 1' }, s, turn(0))
    expect(s.columns[0].map(x => x.id)).toEqual(['spades_K', 'hearts_Q'])
    expect(s.columns[1]).toEqual([{ id: 'clubs_2', up: true }])
  })

  test('foundations build up by suit from the Ace, and Klondike lets a card come back off one', () => {
    let s = position(klondike, [up('spades_A'), up('spades_2'), up('hearts_3')])
    expect(to(klondike, s, 'spades_2')).not.toContain('foundation')
    s = klondike.applyMove({ action: 'move', cards: ['spades_A'], to: 'foundation' }, s, turn(0))
    s = klondike.applyMove({ action: 'move', cards: ['spades_2'], to: 'foundation' }, s, turn(0))
    expect(s.foundations['spades:1']).toEqual(['spades_A', 'spades_2'])
    expect(to(klondike, s, 'spades_2')).toContain('column 3')
  })

  test('Draw 3 turns three to the waste, only the top plays, and the waste turns back over as the stock', () => {
    const draw3 = make({ ...KLONDIKE, drawCount: 3 })
    let s = position(draw3, [up('clubs_K')], { stock: ['hearts_A', 'spades_5', 'diamonds_A', 'clubs_9'] })
    s = draw3.applyMove({ action: 'draw' }, s, turn(0))
    expect(s.waste).toEqual(['hearts_A', 'spades_5', 'diamonds_A'])
    expect(to(draw3, s, 'diamonds_A')).toEqual(['foundation'])
    expect(to(draw3, s, 'hearts_A')).toEqual([])
    s = draw3.applyMove({ action: 'draw' }, s, turn(0))
    expect(moves(draw3, s)).toContainEqual({ action: 'redeal' })
    s = draw3.applyMove({ action: 'redeal' }, s, turn(0))
    expect(s.stock).toEqual(['hearts_A', 'spades_5', 'diamonds_A', 'clubs_9'])
  })

  test('FreeCell moves a run no longer than (free cells + 1) x 2^(empty columns)', () => {
    const run = up('spades_9', 'hearts_8', 'clubs_7', 'diamonds_6')
    const full = (cells) => position(freecell, [up('hearts_10'), run, up('clubs_9'), up('clubs_2'), up('clubs_3'), up('clubs_4'), up('clubs_5'), up('diamonds_K')], { cells })
    // No free cell open and no empty column: one card at a time.
    expect(to(freecell, full(['spades_A', 'spades_2', 'spades_3', 'spades_4']), 'spades_9')).toEqual([])
    // Three open: the run of four from the 9 goes on the red 10.
    expect(to(freecell, full(['spades_A', null, null, null]), 'spades_9')).toEqual(['column 1'])
    // Two open: three at most, so the four cannot move but the three from the 8 can.
    expect(to(freecell, full(['spades_A', 'spades_2', null, null]), 'spades_9')).toEqual([])
    expect(to(freecell, full(['spades_A', 'spades_2', null, null]), 'hearts_8')).toEqual(['column 3'])
    // One open: two at most.
    expect(to(freecell, full(['spades_A', 'spades_2', 'spades_3', null]), 'hearts_8')).toEqual([])
  })

  test('a FreeCell card goes to a free cell and back, and never comes back off a foundation', () => {
    let s = position(freecell, [up('spades_A'), up('hearts_9'), [], [], [], [], [], []], { cells: [null, null, null, null] })
    s = freecell.applyMove({ action: 'move', cards: ['hearts_9'], to: 'free cell' }, s, turn(0))
    expect(s.cells).toEqual(['hearts_9', null, null, null])
    expect(to(freecell, s, 'hearts_9')).toContain('column 2')
    s = freecell.applyMove({ action: 'move', cards: ['spades_A'], to: 'foundation' }, s, turn(0))
    expect(to(freecell, s, 'spades_A')).toEqual([])
  })

  test('FreeCell is lost when no move remains', () => {
    // Every card on the table is black, so nothing builds; the red cards sit in the cells.
    const columns = [up('clubs_4', 'spades_5'), up('clubs_6', 'clubs_5'), up('spades_4', 'spades_7'), up('clubs_8', 'clubs_7'), up('spades_8', 'spades_9'), up('clubs_10', 'clubs_9'), up('spades_10', 'spades_J'), up('clubs_Q', 'clubs_J')]
    const s = position(freecell, columns, { cells: ['hearts_K', 'diamonds_K', 'hearts_Q', null] })
    expect(moves(freecell, s).every(m => m.to === 'free cell')).toBe(true)
    const after = freecell.applyMove({ action: 'move', cards: ['spades_5'], to: 'free cell' }, s, turn(0))
    expect(moves(freecell, after)).toEqual([])
    expect(after.finished).toBe('draw')
    expect(freecell.describeResult(after)).toMatch(/No moves left/)
  })

  test('Spider builds on any suit but lifts only a run of one suit, and a whole run King to Ace leaves', () => {
    let s = position(spider, [up('hearts_8#1'), up('spades_7#1', 'clubs_6#1'), up('diamonds_7#1'), up('spades_7#2', 'spades_6#1'), up('clubs_K#1'), up('clubs_K#2'), up('hearts_K#1'), up('hearts_K#2'), up('diamonds_K#1'), up('diamonds_K#2')], { foundations: {} })
    // A seven and six of different suits do not lift together; the six alone goes on any seven.
    expect(to(spider, s, 'spades_7#1')).toEqual([])
    expect(to(spider, s, 'clubs_6#1')).toEqual(['column 3'])
    // A run in one suit lifts, and lands on an eight of another suit.
    expect(to(spider, s, 'spades_7#2')).toEqual(['column 1'])
    const kingDown = ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'].map(r => `hearts_${r}#1`)
    s = position(spider, [[...down('clubs_9#1'), ...up(...kingDown)], up('hearts_A#1'), up('clubs_K#1'), up('clubs_Q#1'), up('clubs_J#1'), up('clubs_10#1'), up('diamonds_2#1'), up('diamonds_3#1'), up('diamonds_4#1'), up('diamonds_5#1')], { foundations: {} })
    s = spider.applyMove({ action: 'move', cards: ['hearts_A#1'], to: 'column 1' }, s, turn(0))
    expect(s.completed).toEqual(['hearts_K#1'])
    expect(s.columns[0]).toEqual([{ id: 'clubs_9#1', up: true }])
  })

  test('Spider deals one to every column, and only when none is empty', () => {
    const cols = Array.from({ length: 10 }, (_, i) => up(`spades_${['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'][i]}#1`))
    const stock = Array.from({ length: 10 }, (_, i) => `hearts_${['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'][i]}#1`)
    let s = position(spider, cols, { stock, foundations: {} })
    expect(moves(spider, s)).toContainEqual({ action: 'deal' })
    expect(moves(spider, { ...s, columns: [[], ...cols.slice(1)] })).not.toContainEqual({ action: 'deal' })
    s = spider.applyMove({ action: 'deal' }, s, turn(0))
    expect(s.columns.every(c => c.length === 2 && c[1].up)).toBe(true)
    expect(s.stock).toEqual([])
  })

  test('fewer suits keep all 104 cards: two suits are spades and hearts, one is spades', () => {
    const dealt = (suitsInPlay) => {
      const s = createGameForFamily('standard-52', { variant: 'spider-solitaire', rngSeed: 2, settings: { suitsInPlay } }).getState().slice
      const ids = [...s.columns.flat().map(x => x.id), ...s.stock]
      return { count: ids.length, suits: [...new Set(ids.map(id => id.split('_')[0]))].sort() }
    }
    expect(dealt(4)).toEqual({ count: 104, suits: ['clubs', 'diamonds', 'hearts', 'spades'] })
    expect(dealt(2)).toEqual({ count: 104, suits: ['hearts', 'spades'] })
    expect(dealt(1)).toEqual({ count: 104, suits: ['spades'] })
  })

  test('the last card home wins', () => {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const foundations = Object.fromEntries(['spades', 'hearts', 'clubs', 'diamonds'].map(suit => [`${suit}:1`, ranks.map(r => `${suit}_${r}`)]))
    foundations['diamonds:1'] = foundations['diamonds:1'].slice(0, 12)
    const s = position(klondike, [up('diamonds_K'), [], [], [], [], [], []], { foundations })
    const after = klondike.applyMove({ action: 'move', cards: ['diamonds_K'], to: 'foundation' }, s, turn(0))
    expect(after.finished).toBe(0)
    expect(klondike.describeResult(after)).toMatch(/Solved/)
  })
})

describe('melds: laying (Rummy) and knocking (Gin Rummy)', () => {
  const deck = { type: 'standard-52', jokers: 0 }
  const LAYING = { game: 'laying', dealByPlayers: { 2: 10, 3: 7, 4: 7, 5: 6, 6: 6 }, rummyDoubles: true, target: 100 }
  const KNOCKING = { game: 'knocking', knock: 10, stockFloor: 2, target: 100, bonuses: { gin: 25, bigGin: 31, undercut: 25, game: 100, box: 25, shutout: 100 } }
  const rummy = createTableauPluginFor('standard-52')(LAYING, { definition: { players: ['p1', 'p2', 'p3'], components: { deck } } })
  const gin = createTableauPluginFor('standard-52')(KNOCKING, { definition: { players: ['p1', 'p2'], components: { deck } } })
  const rummyBase = rummy.init({ hands: [[], [], []], community: [], drawPile: [] }, noRng)
  const ginBase = gin.init({ hands: [[], []], community: [], drawPile: [] }, noRng)
  const moves = (plugin, slice, seat) => plugin.getLegalMoves(slice, turn(seat))
  const melds = (plugin, slice, seat) => moves(plugin, slice, seat).filter(m => m.action === 'meld').map(m => [...m.cards].sort().join(','))

  test('Rummy deals ten each to two, seven to three or four, six to five or six, and turns up a discard', () => {
    for (const [players, each] of [[2, 10], [4, 7], [6, 6]]) {
      const s = createGameForFamily('standard-52', { variant: 'rummy', rngSeed: 1, settings: { players } }).getState().slice
      expect(s.hands.map(h => h.length)).toEqual(Array(players).fill(each))
      expect(s.discard).toHaveLength(1)
      expect(s.drawPile).toHaveLength(52 - players * each - 1)
    }
  })

  test('sets and runs meld; aces are low, so A-2-3 is a run and Q-K-A is not', () => {
    const hand = ['hearts_A', 'hearts_2', 'hearts_3', 'spades_Q', 'spades_K', 'spades_A', 'clubs_7', 'diamonds_7', 'spades_7']
    const s = { ...rummyBase, hands: [hand, [], []], phase: 'play', next: 0 }
    const found = melds(rummy, s, 0)
    expect(found).toContain(['hearts_2', 'hearts_3', 'hearts_A'].join(','))
    expect(found).toContain(['clubs_7', 'diamonds_7', 'spades_7'].join(','))
    expect(found.some(m => m.includes('spades_Q') && m.includes('spades_A'))).toBe(false)
  })

  test('a card taken from the discard pile may not be discarded on the same turn', () => {
    let s = { ...rummyBase, hands: [['clubs_4', 'hearts_9'], [], []], discard: ['spades_K'], phase: 'draw', next: 0 }
    s = rummy.applyMove({ action: 'take' }, s, turn(0))
    const discards = moves(rummy, s, 0).filter(m => m.action === 'discard').map(m => m.cards[0])
    expect(discards).toEqual(['clubs_4', 'hearts_9'])
  })

  test('a card lays off onto anyone\'s meld', () => {
    const s = { ...rummyBase, hands: [['hearts_9', 'clubs_2'], [], []], melds: [{ cards: ['hearts_6', 'hearts_7', 'hearts_8'], kind: 'run', by: 2 }], phase: 'play', next: 0 }
    const off = moves(rummy, s, 0).filter(m => m.action === 'lay off')
    expect(off.map(m => m.cards[0])).toEqual(['hearts_9'])
    const after = rummy.applyMove(off[0], s, turn(0))
    expect(after.melds[0].cards).toContain('hearts_9')
  })

  test('when the stock runs out the discard pile turns over, without shuffling, as the stock', () => {
    const s = { ...rummyBase, hands: [['clubs_4'], [], []], drawPile: [], discard: ['spades_2', 'spades_3', 'spades_4'], phase: 'draw', next: 0 }
    const after = rummy.applyMove({ action: 'draw' }, s, turn(0))
    // The bottom of the discard pile is now the top of the stock.
    expect(after.hands[0]).toContain('spades_2')
    expect(after.drawPile).toEqual(['spades_3', 'spades_4'])
  })

  test('going out scores the cards left in the other hands, doubled for going rummy', () => {
    const table = (hasMelded) => ({ ...rummyBase, hands: [['clubs_5', 'hearts_5', 'spades_5'], ['diamonds_K', 'clubs_2'], ['hearts_A']], hasMelded, phase: 'play', cleanTurn: !hasMelded[0], next: 0 })
    const once = rummy.applyMove({ action: 'meld', cards: ['clubs_5', 'hearts_5', 'spades_5'] }, table([true, false, false]), turn(0))
    expect(once.scores).toEqual([13, 0, 0])
    const rum = rummy.applyMove({ action: 'meld', cards: ['clubs_5', 'hearts_5', 'spades_5'] }, table([false, false, false]), turn(0))
    expect(rum.scores).toEqual([26, 0, 0])
    expect(rum.lastHand.rummy).toBe(true)
  })

  test('Gin offers the upcard to the non-dealer, then the dealer; if both pass the non-dealer draws from the stock', () => {
    let s = { ...ginBase }
    expect(s.phase).toBe('upcard')
    expect(s.next).toBe(1 - s.dealer)
    s = gin.applyMove({ action: 'pass' }, s, turn(s.next))
    expect(s.next).toBe(s.dealer)
    s = gin.applyMove({ action: 'pass' }, s, turn(s.next))
    expect(s.phase).toBe('draw')
    expect(s.next).toBe(1 - s.dealer)
    expect(moves(gin, s, s.next)).toEqual([{ action: 'draw' }])
  })

  const hand11 = ['hearts_2', 'hearts_3', 'hearts_4', 'clubs_9', 'diamonds_9', 'spades_9', 'clubs_K', 'diamonds_K', 'spades_K', 'clubs_A', 'clubs_Q']
  test('a player may knock with ten or less deadwood, and goes gin with none', () => {
    const s = { ...ginBase, hands: [hand11, ['spades_A']], phase: 'discard', fromDiscard: null, next: 0 }
    const list = moves(gin, s, 0)
    // Discarding the queen leaves the ace, 1 point: a knock. Nothing leaves none.
    expect(list).toContainEqual({ action: 'knock', cards: ['clubs_Q'] })
    expect(list.some(m => m.action === 'gin')).toBe(false)
    const ginHand = [...hand11.slice(0, 9), 'hearts_5', 'clubs_Q']
    expect(moves(gin, { ...s, hands: [ginHand, ['spades_A']] }, 0)).toContainEqual({ action: 'gin', cards: ['clubs_Q'] })
  })

  test('a knock scores the difference, laying off first; an undercut scores the opponent the difference and 25', () => {
    const s = { ...ginBase, hands: [hand11, ['hearts_5', 'clubs_3', 'diamonds_4', 'spades_6', 'hearts_10', 'hearts_J', 'clubs_8', 'diamonds_2', 'spades_3', 'clubs_4']], phase: 'discard', fromDiscard: null, next: 0, scores: [0, 0], boxes: [0, 0] }
    const knocked = gin.applyMove({ action: 'knock', cards: ['clubs_Q'] }, s, turn(0))
    // The 5 of hearts lays off on 2-3-4 of hearts; the rest counts.
    const counted = 3 + 4 + 6 + 10 + 10 + 8 + 2 + 3 + 4
    expect(knocked.scores).toEqual([counted - 1, 0])
    // The knocker keeps a 10 for deadwood; the opponent has melded everything.
    const tens = hand11.map(id => (id === 'clubs_A' ? 'clubs_10' : id))
    const melded = ['spades_A', 'hearts_A', 'diamonds_A', 'hearts_6', 'hearts_7', 'hearts_8', 'hearts_9', 'spades_2', 'clubs_2', 'diamonds_2']
    const undercut = gin.applyMove({ action: 'knock', cards: ['clubs_Q'] }, { ...s, hands: [tens, melded] }, turn(0))
    expect(undercut.scores).toEqual([0, 10 + 25])
  })

  test('the hand is void when the stock is down to two cards and nobody knocked; the same dealer deals', () => {
    const s = { ...ginBase, hands: [['clubs_2', 'clubs_9'], ['hearts_4']], drawPile: ['spades_5', 'spades_6'], phase: 'discard', fromDiscard: null, next: 0, dealer: 1 }
    const after = gin.applyMove({ action: 'discard', cards: ['clubs_9'] }, s, turn(0))
    expect(after.hand).toBe(s.hand + 1)
    expect(after.dealer).toBe(1)
    expect(after.scores).toEqual(s.scores)
  })

  test('both games are played out by computer seats', () => {
    for (const variant of ['rummy', 'gin-rummy']) {
      const game = createGameForFamily('standard-52', { variant, rngSeed: 4 })
      const ai = createAI('standard-52', variant, { difficulty: 'medium', definition: game.raw.definition, rngSeed: 4 })
      for (let ply = 0; ply < 30000; ply++) {
        const st = game.getState()
        if (st.slice.finished !== null) break
        expect(game.applyMove(ai.pickMove(st.slice, st.players.currentIndex)).ok).toBe(true)
      }
      const s = game.getState().slice
      expect(s.finished).not.toBeNull()
      expect(Math.max(...s.scores)).toBeGreaterThanOrEqual(100)
    }
  })
})

describe('partnership melds (Canasta)', () => {
  const CANASTA = { game: 'partnership-melds', partnerships: [['p1', 'p3'], ['p2', 'p4']], target: 5000 }
  const definition = { players: ['p1', 'p2', 'p3', 'p4'], components: { deck: { type: 'standard-52', count: 2, jokers: 2 } } }
  const plugin = createTableauPluginFor('standard-52')(CANASTA, { definition })
  const base = plugin.init({ hands: [[], [], [], []], community: [], drawPile: [] }, noRng)
  const moves = (slice, seat) => plugin.getLegalMoves(slice, turn(seat))
  const playing = (hands, extra = {}) => ({
    ...base, hands, pile: [], frozen: false, melds: [{}, {}], melded: [true, true], red: [[], []], scores: [0, 0], phase: 'play', next: 0,
    turn: { meldedAtStart: 0, hand: hands[0], melds: {}, pending: [], tookPile: false, wasMelded: true, changed: false }, ...extra,
  })

  test('two decks and four jokers make 108 cards, eleven dealt to each, red threes laid out and replaced', () => {
    const s = createGameForFamily('standard-52', { variant: 'canasta', rngSeed: 1 }).getState().slice
    const all = [...s.hands.flat(), ...s.stock, ...s.pile, ...s.red.flat()]
    expect(all).toHaveLength(108)
    expect(new Set(all).size).toBe(108)
    expect(s.hands.map(h => h.length)).toEqual([11, 11, 11, 11])
    expect(s.hands.flat().some(id => /^(hearts|diamonds)_3/.test(id))).toBe(false)
  })

  test('a meld needs two naturals and holds at most three wild cards', () => {
    const hand = ['clubs_7#1', 'hearts_7#1', 'spades_2#1', 'hearts_2#1', 'clubs_2#1', 'joker_1#1', 'diamonds_K#1', 'spades_K#1']
    const melds = moves(playing([hand, [], [], []]), 0).filter(m => m.action === 'meld').map(m => m.cards)
    expect(melds.some(c => c.length === 5 && c.filter(id => id.includes('7')).length === 2)).toBe(true)
    expect(melds.some(c => c.filter(id => /_2#|joker/.test(id)).length > 3)).toBe(false)
    expect(melds.some(c => c.every(id => /_2#|joker/.test(id)))).toBe(false)
  })

  test('first melds must reach the minimum before the player may discard, and can be taken back', () => {
    const hand = ['clubs_5#1', 'hearts_5#1', 'spades_5#1', 'diamonds_9#1', 'clubs_J#1']
    let s = playing([hand, [], [], []], { melded: [false, false] })
    s = plugin.applyMove({ action: 'meld', cards: ['clubs_5#1', 'hearts_5#1', 'spades_5#1'] }, s, turn(0))
    // Three fives are 15, short of 50: no discard until more is laid or it is taken back.
    expect(moves(s, 0).some(m => m.action === 'discard')).toBe(false)
    expect(moves(s, 0)).toContainEqual({ action: 'withdraw' })
    s = plugin.applyMove({ action: 'withdraw' }, s, turn(0))
    expect(s.hands[0]).toEqual(hand)
    expect(moves(s, 0).some(m => m.action === 'discard')).toBe(true)
  })

  test('the pile is taken with two naturals, or a natural and a wild; a frozen pile takes two naturals; a black three blocks it', () => {
    // Each hand keeps cards back, so taking the pile leaves something to discard.
    const draw = (hand, pile, extra = {}) => ({ ...playing([[...hand, 'clubs_5#1', 'hearts_6#1'], [], [], []]), phase: 'draw', pile, ...extra })
    const takes = (s) => moves(s, 0).some(m => m.action === 'take')
    expect(takes(draw(['clubs_9#1', 'hearts_9#1', 'spades_4#1'], ['diamonds_9#1']))).toBe(true)
    expect(takes(draw(['clubs_9#1', 'hearts_2#1', 'spades_4#1'], ['diamonds_9#1']))).toBe(true)
    expect(takes(draw(['clubs_9#1', 'hearts_2#1', 'spades_4#1'], ['spades_2#2', 'diamonds_9#1'], { frozen: true }))).toBe(false)
    expect(takes(draw(['clubs_9#1', 'hearts_9#1', 'spades_4#1'], ['spades_2#2', 'diamonds_9#1'], { frozen: true }))).toBe(true)
    expect(takes(draw(['clubs_3#1', 'spades_3#1', 'spades_4#1'], ['spades_3#2']))).toBe(false)
    // Taking with the last cards in hand would leave nothing to discard without a canasta.
    expect(takes({ ...playing([['clubs_9#1', 'hearts_9#1', 'spades_4#1'], [], [], []]), phase: 'draw', pile: ['diamonds_9#1'] })).toBe(false)
  })

  test('a player may go out only once the side has a canasta', () => {
    const run = ['clubs_Q#1', 'hearts_Q#1', 'spades_Q#1', 'diamonds_Q#1', 'clubs_Q#2', 'hearts_Q#2']
    const without = playing([['spades_Q#2', 'clubs_4#1'], [], [], []], { melds: [{ Q: run.slice(0, 5) }, {}] })
    expect(moves(without, 0).some(m => m.action === 'discard')).toBe(true)
    expect(moves(playing([['clubs_4#1'], [], [], []], { melds: [{ Q: run.slice(0, 5) }, {}] }), 0)).toEqual([])
    const withCanasta = playing([['clubs_4#1'], [], [], []], { melds: [{ Q: [...run, 'spades_Q#2'] }, {}] })
    expect(moves(withCanasta, 0)).toContainEqual({ action: 'discard', cards: ['clubs_4#1'] })
  })

  test('going out scores the melds, the canasta bonus, red threes and 100, less what is left in hand', () => {
    const natural = ['clubs_Q#1', 'hearts_Q#1', 'spades_Q#1', 'diamonds_Q#1', 'clubs_Q#2', 'hearts_Q#2', 'spades_Q#2']
    const s = playing([['clubs_4#1'], ['spades_K#1'], [], []], { melds: [{ Q: natural }, { 9: ['clubs_9#1', 'hearts_9#1', 'spades_2#1'] }], red: [['hearts_3#1'], []] })
    const after = plugin.applyMove({ action: 'discard', cards: ['clubs_4#1'] }, s, turn(0))
    // Seven queens at 10, a natural canasta, one red three, going out.
    expect(after.lastHand.scores[0]).toBe(70 + 500 + 100 + 100)
    // Nines and a two, less the king still held.
    expect(after.lastHand.scores[1]).toBe(10 + 10 + 20 - 10)
  })

  test('a red three counts against a side that never melded', () => {
    const s = playing([['clubs_4#1'], [], [], []], { melds: [{ Q: ['clubs_Q#1', 'hearts_Q#1', 'spades_Q#1', 'diamonds_Q#1', 'clubs_Q#2', 'hearts_Q#2', 'spades_Q#2'] }, {}], melded: [true, false], red: [[], ['hearts_3#1']] })
    const after = plugin.applyMove({ action: 'discard', cards: ['clubs_4#1'] }, s, turn(0))
    expect(after.lastHand.scores[1]).toBe(-100)
  })

  test('a game between four computer seats is played out to a winning side', () => {
    const game = createGameForFamily('standard-52', { variant: 'canasta', rngSeed: 3 })
    const ai = createAI('standard-52', 'canasta', { difficulty: 'medium', definition: game.raw.definition, rngSeed: 3 })
    for (let ply = 0; ply < 60000; ply++) {
      const st = game.getState()
      if (st.slice.finished !== null) break
      expect(game.applyMove(ai.pickMove(st.slice, st.players.currentIndex)).ok).toBe(true)
    }
    const s = game.getState().slice
    expect(s.finished).not.toBeNull()
    expect(Math.max(...s.scores)).toBeGreaterThanOrEqual(5000)
  })
})

describe('trick-taking with an auction (Euchre, Bridge)', () => {
  const EUCHRE = { game: 'trick-taking', rankOrder: [9, 10, 'J', 'Q', 'K', 'A'], partnerships: [['p1', 'p3'], ['p2', 'p4']], auction: 'order-up', bowers: true, goingAlone: true, scoring: { type: 'makers' }, target: 10, deal: { perPlayer: 5 } }
  const BRIDGE = { game: 'trick-taking', rankOrder: [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A'], partnerships: [['p1', 'p3'], ['p2', 'p4']], auction: 'contract', scoring: { type: 'rubber' }, deal: { perPlayer: 13 } }
  const four = ['p1', 'p2', 'p3', 'p4']
  const euchre = createTableauPluginFor('standard-52')(EUCHRE, { definition: { players: four, components: { deck: { type: 'standard-52', jokers: 0, subset: [9, 10, 'J', 'Q', 'K', 'A'] } } } })
  const bridge = createTableauPluginFor('standard-52')(BRIDGE, { definition: { players: four, components: { deck: { type: 'standard-52', jokers: 0 } } } })
  const moves = (plugin, slice, seat) => plugin.getLegalMoves(slice, turn(seat))
  const eBase = euchre.init({ hands: [[], [], [], []], community: [], drawPile: [] }, noRng)
  const bBase = bridge.init({ hands: [[], [], [], []], community: [], drawPile: [] }, noRng)

  test('Euchre deals five each from the nine up and turns up a card', () => {
    const s = createGameForFamily('standard-52', { variant: 'euchre', rngSeed: 1 }).getState().slice
    expect(s.hands.map(h => h.length)).toEqual([5, 5, 5, 5])
    expect([...s.hands.flat(), ...s.drawPile]).toHaveLength(24)
    expect(s.phase).toBe('order')
    expect(s.upcard).toBe(s.drawPile[0])
  })

  test('ordering up makes the upcard trump; the dealer takes it and discards', () => {
    const hands = [['spades_9', 'spades_10', 'hearts_A', 'clubs_K', 'clubs_Q'], ['hearts_9', 'hearts_10', 'hearts_J', 'hearts_Q', 'hearts_K'], ['diamonds_9', 'diamonds_10', 'diamonds_J', 'diamonds_Q', 'diamonds_K'], ['clubs_9', 'clubs_10', 'clubs_J', 'spades_Q', 'spades_K']]
    let s = { ...eBase, hands, dealer: 3, upcard: 'spades_A', drawPile: ['spades_A', 'diamonds_A', 'clubs_A', 'spades_J'], next: 0 }
    s = euchre.applyMove({ action: 'order' }, s, turn(0))
    expect(s.trump).toBe('spades')
    expect(s.phase).toBe('dealer-discard')
    expect(s.hands[3]).toContain('spades_A')
    s = euchre.applyMove({ action: 'discard', cards: ['clubs_9'] }, s, turn(3))
    expect(s.hands[3]).toHaveLength(5)
    expect(s.phase).toBe('play')
    expect(s.next).toBe(0)
  })

  test('the Jack of trump is highest and the Jack of the same colour is a trump', () => {
    const s = { ...eBase, phase: 'play', trump: 'hearts', trick: [{ seat: 0, card: 'hearts_A' }], hands: [[], ['diamonds_J', 'diamonds_9'], [], []], out: null, next: 1 }
    // Hearts were led: the Jack of diamonds is a heart now, so it must follow.
    expect(moves(euchre, s, 1).map(m => m.cards[0])).toEqual(['diamonds_J'])
    const after = euchre.applyMove({ action: 'play', cards: ['diamonds_J'] }, { ...s, trick: [{ seat: 0, card: 'hearts_A' }] }, turn(1))
    const trick = [...after.trick, { seat: 2, card: 'hearts_J' }, { seat: 3, card: 'hearts_K' }]
    const done = euchre.applyMove({ action: 'play', cards: ['hearts_K'] }, { ...after, trick: trick.slice(0, 3), hands: [['clubs_9'], [], [], ['hearts_K', 'clubs_10']], next: 3 }, turn(3))
    expect(done.lastTrick.winner).toBe(2)
  })

  test('the dealer is stuck in the second round, and the turned-down suit cannot be named', () => {
    const s = { ...eBase, round: 2, upcard: 'spades_A', dealer: 3, next: 3 }
    const list = moves(euchre, s, 3)
    expect(list.some(m => m.action === 'pass')).toBe(false)
    expect(list.some(m => String(m.value).startsWith('spades'))).toBe(false)
    expect(moves(euchre, { ...s, next: 1 }, 1).some(m => m.action === 'pass')).toBe(true)
  })

  test('the dealer\'s partner may only order up alone; the partner sits out and the lone player\'s left leads', () => {
    const s = { ...eBase, dealer: 3, upcard: 'spades_A', round: 1, next: 1 }
    expect(moves(euchre, s, 1).filter(m => m.action === 'order')).toEqual([{ action: 'order', value: 'alone' }])
    const alone = euchre.applyMove({ action: 'order', value: 'alone' }, s, turn(1))
    expect(alone.out).toBe(3)
    expect(alone.phase).toBe('play')
    expect(alone.next).toBe(2)
  })

  test('makers score 1 for three or four, 2 for all five, 4 alone; euchred, the defenders score 2', () => {
    // The last trick of the hand, spades trump; the maker is seat 0. Seat 3 plays
    // last, the Jack of spades to take the trick or a low club to lose it.
    const score = (wonBefore, makerTakesLast, alone = false) => {
      const plays = alone ? [[0, 'spades_A'], [1, 'clubs_9']] : [[0, 'spades_A'], [1, 'clubs_9'], [2, 'clubs_10']]
      const last = makerTakesLast ? 'clubs_Q' : 'spades_J'
      const s = { ...eBase, phase: 'play', trump: 'spades', maker: 0, alone, out: alone ? 2 : null, won: wonBefore, trick: plays.map(([seat, card]) => ({ seat, card })), hands: [[], [], alone ? ['hearts_9'] : [], [last]], trickNo: 4, next: 3, scores: [0, 0] }
      return euchre.applyMove({ action: 'play', cards: [last] }, s, turn(3)).lastHand.delta
    }
    expect(score([1, 1, 1, 1], true)).toEqual([1, 0])
    expect(score([2, 0, 2, 0], true)).toEqual([2, 0])
    expect(score([4, 0, 0, 0], true, true)).toEqual([4, 0])
    expect(score([1, 1, 1, 1], false)).toEqual([0, 2])
  })

  test('Bridge bids must rise; only an opponent\'s bid may be doubled and only an opponent\'s double redoubled', () => {
    let s = { ...bBase, dealer: 0, next: 0 }
    s = bridge.applyMove({ action: 'bid', value: '1♥' }, s, turn(0))
    const bids = moves(bridge, s, 1).filter(m => m.action === 'bid').map(m => m.value)
    expect(bids).not.toContain('1♣')
    expect(bids).toContain('1♠')
    expect(moves(bridge, s, 1)).toContainEqual({ action: 'double' })
    s = bridge.applyMove({ action: 'double' }, s, turn(1))
    expect(moves(bridge, s, 2)).toContainEqual({ action: 'redouble' })
    expect(moves(bridge, s, 2).some(m => m.action === 'double')).toBe(false)
  })

  test('three passes end the auction; the declarer is the first of the side to name the strain, and their left leads', () => {
    let s = { ...bBase, dealer: 0, next: 0 }
    for (const [seat, move] of [[0, { action: 'pass' }], [1, { action: 'bid', value: '1♠' }], [2, { action: 'pass' }], [3, { action: 'bid', value: '2♠' }], [0, { action: 'pass' }], [1, { action: 'pass' }], [2, { action: 'pass' }]]) {
      s = bridge.applyMove(move, s, turn(seat))
    }
    expect(s.contract).toMatchObject({ level: 2, strain: '♠', doubled: 1, declarer: 1 })
    expect(s.dummy).toBe(3)
    expect(s.phase).toBe('play')
    expect(s.next).toBe(2)
    // The declarer chooses the dummy's cards.
    expect(bridge.actsFor(s, 3)).toBe(1)
    expect(bridge.actsFor(s, 2)).toBe(null)
  })

  test('four passes throw the hand in', () => {
    let s = { ...bBase, dealer: 0, next: 0, hand: 0 }
    for (const seat of [0, 1, 2, 3]) s = bridge.applyMove({ action: 'pass' }, s, turn(seat))
    expect(s.hand).toBe(1)
    expect(s.phase).toBe('auction')
    expect(s.contract).toBe(null)
  })

  test('rubber scoring: a game below the line, penalties above it, and the rubber bonus', () => {
    const finish = (contract, tricks, rubber) => {
      const won = [0, 0, 0, 0]
      won[contract.declarer] = tricks
      won[(contract.declarer + 1) % 4] = 13 - tricks
      const s = { ...bBase, phase: 'play', contract, declarer: contract.declarer, dummy: (contract.declarer + 2) % 4, trump: 'spades', rubber, won, trick: [{ seat: 0, card: 'clubs_2' }, { seat: 1, card: 'clubs_3' }, { seat: 2, card: 'clubs_4' }], hands: [[], [], [], ['clubs_5']], trickNo: 12, next: 3, scores: [0, 0] }
      const after = bridge.applyMove({ action: 'play', cards: ['clubs_5'] }, s, turn(3))
      return after
    }
    const fresh = () => ({ below: [0, 0], above: [0, 0], games: [0, 0] })
    // 4♠ made exactly, not vulnerable: 120 below, a game.
    const made = finish({ level: 4, strain: '♠', doubled: 1, declarer: 0, side: 0 }, 10, fresh())
    expect(made.rubber.games).toEqual([1, 0])
    expect(made.scores[0]).toBe(120)
    // Down two undoubled, vulnerable: 100 a trick.
    const down = finish({ level: 4, strain: '♠', doubled: 1, declarer: 0, side: 0 }, 8, { below: [0, 0], above: [0, 0], games: [1, 0] })
    expect(down.rubber.above).toEqual([0, 200])
    // Made redoubled: 4 x 30 x 4 below, and 100 for the insult.
    const redoubled = finish({ level: 1, strain: '♠', doubled: 4, declarer: 0, side: 0 }, 7, fresh())
    expect(redoubled.scores[0]).toBe(120 + 100)
    // A second game closes the rubber with 700 when the other side has none.
    const rubber = finish({ level: 3, strain: 'NT', doubled: 1, declarer: 0, side: 0 }, 9, { below: [0, 0], above: [0, 0], games: [1, 0] })
    expect(rubber.finished).not.toBeNull()
    expect(rubber.scores[0]).toBe(100 + 700)
  })

  test('both games are played out by computer seats', () => {
    for (const variant of ['euchre', 'bridge']) {
      const game = createGameForFamily('standard-52', { variant, rngSeed: 2 })
      const ai = createAI('standard-52', variant, { difficulty: 'medium', definition: game.raw.definition, rngSeed: 2 })
      for (let ply = 0; ply < 40000; ply++) {
        const st = game.getState()
        if (st.slice.finished !== null) break
        expect(game.applyMove(ai.pickMove(st.slice, st.players.currentIndex)).ok).toBe(true)
      }
      expect(game.getState().slice.finished).not.toBeNull()
    }
  })
})

describe('lone declarer (Skat)', () => {
  const SKAT = { game: 'lone-declarer', jack: 'U', jackOrder: ['acorns', 'leaves', 'hearts', 'bells'], suitBase: { acorns: 12, leaves: 11, hearts: 10, bells: 9 }, grandBase: 24, rankOrder: ['7', '8', '9', 'O', 'K', '10', 'A'], nullOrder: ['7', '8', '9', '10', 'U', 'O', 'K', 'A'], cardPoints: { A: 11, 10: 10, K: 4, O: 3, U: 2 }, rounds: 1 }
  const plugin = createTableauPluginFor('bavarian-32')(SKAT, { definition: { players: ['p1', 'p2', 'p3'], components: { deck: { type: 'bavarian-32' } } } })
  const base = plugin.init({ hands: [[], [], []], community: [], drawPile: [] }, noRng)
  const moves = (slice, seat) => plugin.getLegalMoves(slice, turn(seat))

  test('ten cards each and two in the skat; middlehand bids first, to forehand', () => {
    const s = createGameForFamily('bavarian-32', { variant: 'skat', rngSeed: 1 }).getState().slice
    expect(s.hands.map(h => h.length)).toEqual([10, 10, 10])
    expect(s.skat).toHaveLength(2)
    expect(s.auction).toMatchObject({ bidder: (s.dealer + 2) % 3, listener: (s.dealer + 1) % 3 })
    expect(moves(s, s.next).filter(m => m.action === 'bid').map(m => m.value).slice(0, 6)).toEqual(['18', '20', '22', '23', '24', '27'])
  })

  test('forehand answers yes or pass; rearhand then bids to the survivor; the last bidder declares', () => {
    let s = { ...base }
    const F = (s.dealer + 1) % 3, M = (s.dealer + 2) % 3, R = s.dealer
    s = plugin.applyMove({ action: 'bid', value: '18' }, s, turn(M))
    expect(moves(s, F)).toEqual([{ action: 'yes' }, { action: 'pass' }])
    s = plugin.applyMove({ action: 'yes' }, s, turn(F))
    s = plugin.applyMove({ action: 'pass' }, s, turn(M))
    expect(s.auction).toMatchObject({ stage: 2, bidder: R, listener: F, value: 18 })
    s = plugin.applyMove({ action: 'bid', value: '20' }, s, turn(R))
    s = plugin.applyMove({ action: 'pass' }, s, turn(F))
    expect(s.phase).toBe('skat')
    expect(s.declarer).toBe(R)
    expect(s.bid).toBe(20)
  })

  test('when nobody bids, forehand plays at 18 or throws the cards in', () => {
    let s = { ...base }
    const F = (s.dealer + 1) % 3, M = (s.dealer + 2) % 3, R = s.dealer
    s = plugin.applyMove({ action: 'pass' }, s, turn(M))
    s = plugin.applyMove({ action: 'pass' }, s, turn(R))
    expect(moves(s, F)).toEqual([{ action: 'bid', value: '18' }, { action: 'pass' }])
    const thrown = plugin.applyMove({ action: 'pass' }, s, turn(F))
    expect(thrown.hand).toBe(1)
    expect(thrown.scores).toEqual([0, 0, 0])
  })

  test('the jacks are the top trumps and follow trump, not their suit; in Null they are ordinary cards', () => {
    const game = { type: 'suit', suit: 'hearts' }
    const s = { ...base, phase: 'play', game, declarer: 0, trick: [{ seat: 0, card: 'bells_A' }], hands: [[], ['bells_U', 'bells_7', 'acorns_9'], []], next: 1 }
    // Bells were led: the Unter of bells is a trump, so the seven must follow.
    expect(moves(s, 1).map(m => m.cards[0])).toEqual(['bells_7'])
    const trump = { ...s, trick: [{ seat: 0, card: 'hearts_A' }] }
    expect(moves(trump, 1).map(m => m.cards[0])).toEqual(['bells_U'])
    const nul = { ...s, game: { type: 'null' } }
    expect(moves(nul, 1).map(m => m.cards[0]).sort()).toEqual(['bells_7', 'bells_U'])
  })

  test('a game is worth its base times matadors plus one, and an overbid game is lost at twice the least multiple that met the bid', () => {
    // The page's example: hearts, with the Unters of acorns and leaves but not hearts: "with 2", 10 x 3 = 30.
    const held = ['acorns_U', 'leaves_U', 'hearts_A', 'hearts_10', 'hearts_K', 'hearts_O', 'hearts_9', 'acorns_A', 'acorns_10', 'leaves_A', 'bells_7', 'bells_8']
    const finish = (bid, declarerTakes) => {
      const taken = [declarerTakes, [], []]
      const s = { ...base, phase: 'play', declarer: 0, bid, game: { type: 'suit', suit: 'hearts', hand: false }, held, skat: ['bells_7', 'bells_8'], taken, tricks: [6, 2, 1], trick: [{ seat: 0, card: 'hearts_7' }, { seat: 1, card: 'leaves_7' }], hands: [[], [], ['acorns_7']], next: 2, scores: [0, 0, 0] }
      return plugin.applyMove({ action: 'play', cards: ['acorns_7'] }, s, turn(2))
    }
    // 61 card points is a win, not schneider: +30.
    const winPile = ['hearts_A', 'hearts_10', 'acorns_A', 'acorns_10', 'leaves_A', 'bells_A', 'bells_10']
    expect(finish(30, winPile).lastHand).toMatchObject({ won: true, delta: 30 })
    // Bid 33 but worth 30: lost at twice 40, the least multiple of 10 that meets 33.
    expect(finish(33, winPile).lastHand).toMatchObject({ won: false, delta: -80 })
  })

  test('a Null declarer who takes a trick loses at once, twice the value', () => {
    const s = { ...base, phase: 'play', declarer: 1, bid: 23, game: { type: 'null', hand: false, ouvert: false }, held: [], trick: [{ seat: 0, card: 'acorns_7' }, { seat: 1, card: 'acorns_A' }], hands: [['leaves_7'], ['leaves_8'], ['acorns_8', 'leaves_9']], next: 2, scores: [0, 0, 0] }
    const after = plugin.applyMove({ action: 'play', cards: ['acorns_8'] }, s, turn(2))
    expect(after.lastHand).toMatchObject({ won: false, delta: -46 })
    expect(after.hand).toBe(1)
  })

  test('a session is as many deals as the players choose, and computer seats play it out', () => {
    const game = createGameForFamily('bavarian-32', { variant: 'skat', rngSeed: 4, settings: { rounds: 2 } })
    const ai = createAI('bavarian-32', 'skat', { difficulty: 'medium', definition: game.raw.definition, rngSeed: 4 })
    for (let ply = 0; ply < 5000; ply++) {
      const st = game.getState()
      if (st.slice.finished !== null) break
      expect(game.applyMove(ai.pickMove(st.slice, st.players.currentIndex)).ok).toBe(true)
    }
    const s = game.getState().slice
    expect(s.finished).not.toBeNull()
    expect(s.hand).toBe(5)
  })
})

describe('called partner (Schafkopf)', () => {
  const SCHAFKOPF = { game: 'called-partner', ober: 'O', unter: 'U', suitOrder: ['acorns', 'leaves', 'hearts', 'bells'], trumpSuit: 'hearts', plainOrder: ['7', '8', '9', 'K', '10', 'A'], wenzOrder: ['7', '8', '9', 'O', 'K', '10', 'A'], cardPoints: { A: 11, 10: 10, K: 4, O: 3, U: 2 }, tariff: { rufer: 1, solo: 5, wenz: 5, schneider: 1, schwarz: 2, laufende: 1 }, laufende: { rufer: 3, solo: 3, wenz: 2 }, runAway: 4, rounds: 1 }
  const plugin = createTableauPluginFor('bavarian-32')(SCHAFKOPF, { definition: { players: ['p1', 'p2', 'p3', 'p4'], components: { deck: { type: 'bavarian-32' } } } })
  const base = plugin.init({ hands: [[], [], [], []], community: [], drawPile: [] }, noRng)
  const moves = (slice, seat) => plugin.getLegalMoves(slice, turn(seat))
  const rufer = { type: 'rufer', called: 'bells' }

  test('eight cards each; forehand speaks first', () => {
    const s = createGameForFamily('bavarian-32', { variant: 'schafkopf', rngSeed: 1 }).getState().slice
    expect(s.hands.map(h => h.length)).toEqual([8, 8, 8, 8])
    expect(s.next).toBe((s.dealer + 1) % 4)
  })

  test('an ace may be called only in a plain suit the caller holds, and not if they hold it; a game must outrank the one standing', () => {
    const hand = ['bells_7', 'bells_K', 'acorns_A', 'acorns_9', 'hearts_7', 'leaves_O', 'leaves_U', 'hearts_A']
    const s = { ...base, hands: [hand, [], [], []], next: 0 }
    const calls = moves(s, 0).filter(m => m.action === 'call').map(m => m.value)
    // Bells: held and the ace is not; acorns: the ace is held; leaves: only an Ober and Unter, which are trumps.
    expect(calls).toEqual(['bells'])
    const afterWenz = { ...s, best: { type: 'wenz', seat: 3 } }
    expect(moves(afterWenz, 0).some(m => m.action === 'call' || m.action === 'wenz')).toBe(false)
    expect(moves(afterWenz, 0).some(m => m.action === 'solo')).toBe(true)
  })

  test('the called ace goes to the first trick its suit is led to, and is not thrown away before', () => {
    const s = { ...base, phase: 'play', game: rufer, declarer: 0, partner: 2, trick: [{ seat: 0, card: 'bells_7' }], hands: [[], [], ['bells_A', 'bells_9', 'acorns_7'], []], next: 2 }
    expect(moves({ ...s, next: 2 }, 2)).toEqual([{ action: 'play', cards: ['bells_A'] }])
    const other = { ...s, trick: [{ seat: 0, card: 'leaves_7' }] }
    expect(moves(other, 2).map(m => m.cards[0]).sort()).toEqual(['acorns_7', 'bells_9'])
  })

  test('with four of the called suit its holder may run away, leading a lower card', () => {
    const hand = ['bells_A', 'bells_9', 'bells_8', 'bells_7', 'acorns_7']
    const s = { ...base, phase: 'play', game: rufer, declarer: 0, partner: 2, trick: [], hands: [[], [], hand, []], next: 2 }
    expect(moves(s, 2).map(m => m.cards[0])).toContain('bells_9')
    const three = { ...s, hands: [[], [], ['bells_A', 'bells_9', 'bells_8', 'acorns_7'], []] }
    expect(moves(three, 2).map(m => m.cards[0])).not.toContain('bells_9')
  })

  test('nobody but the holder knows the partner until the ace is played', () => {
    const s = { ...base, phase: 'play', game: rufer, declarer: 0, partner: 2, revealed: false, trick: [], hands: [['x'], ['x'], ['bells_A'], ['x']], next: 2 }
    expect(plugin.projectForSeat(s, 0).partner).toBe(null)
    expect(plugin.projectForSeat(s, 2).partner).toBe(2)
    const played = plugin.applyMove({ action: 'play', cards: ['bells_A'] }, s, turn(2))
    expect(plugin.projectForSeat(played, 1).partner).toBe(2)
  })

  test('Obers, then Unters, then hearts are trump; in a Wenz only the Unters', () => {
    const s = { ...base, phase: 'play', game: rufer, declarer: 0, partner: 2, trick: [{ seat: 0, card: 'hearts_A' }], hands: [[], ['bells_O', 'bells_7'], [], []], next: 1 }
    expect(moves(s, 1).map(m => m.cards[0])).toEqual(['bells_O'])
    const wenz = { ...s, game: { type: 'wenz' } }
    expect(moves(wenz, 1).map(m => m.cards[0]).sort()).toEqual(['bells_7', 'bells_O'])
  })

  test('a Solo is paid by each defender; a Rufer by each loser to one winner', () => {
    const finish = (game, partner, sideTakes) => {
      const taken = [sideTakes, [], [], []]
      const held = [['acorns_O', 'leaves_O', 'hearts_O'], ['bells_O'], [], []]
      const s = { ...base, phase: 'play', game, declarer: 0, partner, held, taken, tricks: [5, 1, 1, 0], trick: [{ seat: 0, card: 'acorns_7' }, { seat: 1, card: 'acorns_8' }, { seat: 2, card: 'acorns_9' }], hands: [[], [], [], ['leaves_7']], next: 3, scores: [0, 0, 0, 0] }
      return plugin.applyMove({ action: 'play', cards: ['leaves_7'] }, s, turn(3))
    }
    const win = ['acorns_A', 'acorns_10', 'leaves_A', 'leaves_10', 'hearts_A', 'hearts_10', 'bells_A']
    // 72 card points, not schneider; three Obers from the top are three Laufende.
    const solo = finish({ type: 'solo', suit: 'hearts' }, null, win)
    expect(solo.lastHand).toMatchObject({ won: true, value: 5 + 3 })
    expect(solo.scores).toEqual([24, -8, -8, -8])
    const call = finish(rufer, 2, win)
    expect(call.lastHand.value).toBe(1 + 3)
    expect(call.scores).toEqual([4, -4, 4, -4])
  })

  test('computer seats play a session out, and the scores balance', () => {
    const game = createGameForFamily('bavarian-32', { variant: 'schafkopf', rngSeed: 2 })
    const ai = createAI('bavarian-32', 'schafkopf', { difficulty: 'medium', definition: game.raw.definition, rngSeed: 2 })
    for (let ply = 0; ply < 5000; ply++) {
      const st = game.getState()
      if (st.slice.finished !== null) break
      expect(game.applyMove(ai.pickMove(st.slice, st.players.currentIndex)).ok).toBe(true)
    }
    const s = game.getState().slice
    expect(s.finished).not.toBeNull()
    expect(s.scores.reduce((a, b) => a + b, 0)).toBe(0)
  })
})

describe('pegging (Cribbage)', () => {
  const CRIB = { game: 'pegging', cardsEach: 6, toCrib: 2, cribFromDeck: 0, target: 121 }
  const deckDef = { components: { deck: { type: 'standard-52', jokers: 0 } } }
  const plugin = createTableauPluginFor('standard-52')(CRIB, { definition: { players: ['p1', 'p2'], ...deckDef } })
  const ctx = { card: plugin.cardOf }
  const base = plugin.init({ hands: [[], []], community: [], drawPile: [] }, noRng)
  const moves = (slice, seat) => plugin.getLegalMoves(slice, turn(seat))

  test('the show counts fifteens, pairs, runs, flushes and nobs: three fives and the right Jack with a five turned is 29', () => {
    expect(showScore(['hearts_5', 'diamonds_5', 'clubs_5', 'spades_J'], 'spades_5', ctx)).toBe(29)
    // Seven, eight, eight, nine with a king: two fifteens, a pair and a double run.
    expect(showScore(['hearts_7', 'clubs_8', 'diamonds_8', 'spades_9'], 'hearts_K', ctx)).toBe(4 + 2 + 6)
    // Four hearts in hand is a flush, but not in the crib unless the starter matches.
    const hearts = ['hearts_2', 'hearts_4', 'hearts_6', 'hearts_K']
    expect(showScore(hearts, 'clubs_Q', ctx)).toBe(4)
    expect(showScore(hearts, 'clubs_Q', ctx, true)).toBe(0)
    expect(showScore(hearts, 'hearts_Q', ctx, true)).toBe(5)
  })

  test('a Jack turned up is two for his heels to the dealer', () => {
    let s = { ...base, dealer: 0, hands: [['clubs_A', 'clubs_2', 'clubs_3', 'clubs_4', 'clubs_6', 'clubs_7'], ['hearts_A', 'hearts_2', 'hearts_3', 'hearts_4', 'hearts_6', 'hearts_7']], drawPile: ['spades_J'], next: 1 }
    s = plugin.applyMove({ action: 'discard', cards: ['hearts_6', 'hearts_7'] }, s, turn(1))
    s = plugin.applyMove({ action: 'discard', cards: ['clubs_6', 'clubs_7'] }, s, turn(0))
    expect(s.starter).toBe('spades_J')
    expect(s.scores).toEqual([2, 0])
    expect(s.phase).toBe('peg')
    expect(s.next).toBe(1)
  })

  const pegging = (hands, extra = {}) => ({ ...base, phase: 'peg', dealer: 0, starter: 'diamonds_K', kept: hands, hands, count: 0, sequence: [], passed: [], lastPlayer: null, next: 1, scores: [0, 0], ...extra })

  test('fifteen and thirty-one score two, pairs two and six, and a run counts in any order', () => {
    let s = pegging([['hearts_8', 'clubs_8', 'spades_4', 'spades_2'], ['diamonds_7', 'diamonds_8', 'clubs_3', 'clubs_K']])
    s = plugin.applyMove({ action: 'play', cards: ['diamonds_7'] }, s, turn(1))
    s = plugin.applyMove({ action: 'play', cards: ['hearts_8'] }, s, turn(0))
    expect(s.scores).toEqual([2, 0])
    s = plugin.applyMove({ action: 'play', cards: ['diamonds_8'] }, s, turn(1))
    expect(s.scores).toEqual([2, 2])
    s = plugin.applyMove({ action: 'play', cards: ['clubs_8'] }, s, turn(0))
    // Three eights: six. The count is 31: two more.
    expect(s.scores).toEqual([2 + 6 + 2, 2])
    expect(s.count).toBe(0)
    // Four, six, five: the last three are a run of three in any order, and fifteen too.
    const runs = pegging([['spades_4', 'spades_5'], ['hearts_6', 'clubs_K']], { next: 0 })
    let r = plugin.applyMove({ action: 'play', cards: ['spades_4'] }, runs, turn(0))
    r = plugin.applyMove({ action: 'play', cards: ['hearts_6'] }, r, turn(1))
    r = plugin.applyMove({ action: 'play', cards: ['spades_5'] }, r, turn(0))
    expect(r.scores).toEqual([3 + 2, 0])
  })

  test('a player who cannot play says go, and the last to play pegs one', () => {
    let s = pegging([['clubs_K', 'hearts_Q'], ['spades_K', 'diamonds_9', 'hearts_2']], { next: 0 })
    s = plugin.applyMove({ action: 'play', cards: ['clubs_K'] }, s, turn(0))
    s = plugin.applyMove({ action: 'play', cards: ['spades_K'] }, s, turn(1))
    s = plugin.applyMove({ action: 'play', cards: ['hearts_Q'] }, s, turn(0))
    // Thirty on the count: the two would make 32, so seat 1 can only say go.
    expect(moves(s, 1)).toEqual([{ action: 'go' }])
    s = plugin.applyMove({ action: 'go' }, s, turn(1))
    expect(s.scores[0]).toBe(1)
    expect(s.count).toBe(0)
    expect(s.next).toBe(1)
  })

  test('the game ends the moment a score reaches 121', () => {
    const s = pegging([['hearts_5'], ['clubs_K', 'clubs_Q']], { scores: [119, 0], count: 10, sequence: ['spades_10'], next: 0 })
    const after = plugin.applyMove({ action: 'play', cards: ['hearts_5'] }, s, turn(0))
    expect(after.finished).toBe(0)
    expect(after.scores[0]).toBe(121)
  })

  test('three players: five cards, one to the crib each and one from the deck; four players score as partners', () => {
    const three = createGameForFamily('standard-52', { variant: 'three-player-cribbage', rngSeed: 1 }).getState().slice
    expect(three.hands.map(h => h.length)).toEqual([5, 5, 5])
    expect(three.crib).toHaveLength(1)
    const four = createGameForFamily('standard-52', { variant: 'four-player-cribbage', rngSeed: 1 }).getState().slice
    expect(four.scores).toHaveLength(2)
  })

  test('computer seats play each game to 121', () => {
    for (const variant of ['cribbage', 'three-player-cribbage', 'four-player-cribbage']) {
      const game = createGameForFamily('standard-52', { variant, rngSeed: 3 })
      const ai = createAI('standard-52', variant, { difficulty: 'medium', definition: game.raw.definition, rngSeed: 3 })
      for (let ply = 0; ply < 20000; ply++) {
        const st = game.getState()
        if (st.slice.finished !== null) break
        expect(game.applyMove(ai.pickMove(st.slice, st.players.currentIndex)).ok).toBe(true)
      }
      expect(Math.max(...game.getState().slice.scores)).toBeGreaterThanOrEqual(121)
    }
  })
})

describe('bluffing (Liar\'s Dice) and rolling rounds (Bunco)', () => {
  const dice = { players: ['p1', 'p2', 'p3'], components: { dice: { type: 'standard', count: 5 } } }
  const liars = createTableauPluginFor('standard-dice')({ game: 'bluffing', dicePerPlayer: 5, faces: 6 }, { definition: dice })
  const base = liars.init({ hands: [[], [], []], community: [], drawPile: [] }, noRng)
  const moves = (slice, seat) => liars.getLegalMoves(slice, turn(seat))

  test('five dice each, seen only by their owner', () => {
    expect(base.hands.map(h => h.length)).toEqual([5, 5, 5])
    const view = liars.projectForSeat(base, 1)
    expect(view.hands[1].every(id => id !== null)).toBe(true)
    expect(view.hands[0].every(id => id === null)).toBe(true)
  })

  test('a raise is a higher quantity, or the same quantity of a higher face; a challenge needs a bid', () => {
    expect(moves(base, 0).some(m => m.action === 'challenge')).toBe(false)
    const s = liars.applyMove({ action: 'bid', value: '3 fours' }, base, turn(0))
    const bids = moves(s, 1).filter(m => m.action === 'bid').map(m => m.value)
    expect(bids).not.toContain('3 fours')
    expect(bids).not.toContain('3 twos')
    expect(bids).toContain('3 fives')
    expect(bids).toContain('4 ones')
    expect(moves(s, 1)).toContainEqual({ action: 'challenge' })
  })

  test('a challenge counts every die: the bid stands and the challenger loses one, or the bidder does; the loser bids next', () => {
    const hands = [['die0-4', 'die1-4', 'die2-1', 'die3-2', 'die4-6'], ['die5-4', 'die6-3', 'die7-3', 'die8-5', 'die9-5'], ['die10-2', 'die11-2', 'die12-1', 'die13-6', 'die14-6']]
    const s = { ...base, hands, bid: { qty: 3, face: 4, seat: 0 }, next: 1 }
    const held = liars.applyMove({ action: 'challenge' }, s, turn(1))
    expect(held.counts).toEqual([5, 4, 5])
    expect(held.next).toBe(1)
    const failed = liars.applyMove({ action: 'challenge' }, { ...s, bid: { qty: 4, face: 4, seat: 0 } }, turn(1))
    expect(failed.counts).toEqual([4, 5, 5])
    expect(failed.next).toBe(0)
    expect(failed.hands.map(h => h.length)).toEqual([4, 5, 5])
  })

  test('the last player with dice wins', () => {
    const s = { ...base, counts: [1, 0, 1], hands: [['die0-2'], [], ['die10-5']], bid: { qty: 1, face: 3, seat: 2 }, next: 0 }
    const after = liars.applyMove({ action: 'challenge' }, s, turn(0))
    expect(after.finished).toBe(0)
  })

  test('Bunco scores one for each die of the round\'s number, five for three of another, and 21 for three of the round\'s', () => {
    const s = { bunco: 21, triple: 5 }
    expect(scoreRoll([2, 2, 5], 2, s)).toEqual({ points: 2, bunco: false })
    expect(scoreRoll([4, 4, 4], 2, s)).toEqual({ points: 5, bunco: false })
    expect(scoreRoll([2, 2, 2], 2, s)).toEqual({ points: 21, bunco: true })
    expect(scoreRoll([1, 3, 5], 2, s)).toEqual({ points: 0, bunco: false })
  })

  test('twelve players sit at three tables; a round ends at 21 at the head table, winners up and losers down', () => {
    const bunco = createTableauPluginFor('standard-dice')({ game: 'rolling-rounds', dice: 3, rounds: 6, bunco: 21, threeOfAKind: 5, roundEnds: 21 }, { definition: { players: Array.from({ length: 12 }, (_, i) => `p${i}`), components: { dice: { type: 'standard' } } } })
    const s = bunco.init({ hands: [], community: [], drawPile: [] }, noRng)
    expect(s.tables).toEqual([[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]])
    // The head table's first team is one point short; the middle table's second team leads.
    const nearly = { ...s, points: [[20, 3], [1, 9], [5, 5]], active: 0, next: 0 }
    let after = nearly
    for (let k = 0; k < 200 && after.round === 1; k++) after = bunco.applyMove({ action: 'roll' }, { ...after, active: 0, next: after.tables[0][after.roller[0]] }, turn(after.tables[0][after.roller[0]]))
    expect(after.round).toBe(2)
    const headWinners = after.lastRound[0].winner
    expect(after.tables[0]).toEqual(expect.arrayContaining(headWinners))
    // The middle table's winners (5 and 7) moved up to the head table.
    expect(after.tables[0]).toEqual(expect.arrayContaining([5, 7]))
  })

  test('computer seats play both games to a result', () => {
    for (const [variant, settings] of [['liars-dice', {}], ['bunco', { players: 8 }]]) {
      const game = createGameForFamily('standard-dice', { variant, rngSeed: 2, settings })
      const ai = createAI('standard-dice', variant, { difficulty: 'medium', definition: game.raw.definition, rngSeed: 2 })
      for (let ply = 0; ply < 50000; ply++) {
        const st = game.getState()
        if (st.slice.finished !== null) break
        expect(game.applyMove(ai.pickMove(st.slice, st.players.currentIndex)).ok).toBe(true)
      }
      expect(game.getState().slice.finished).not.toBeNull()
    }
  })
})

describe('play chips: house (Blackjack), shooting (Craps), holdem (Poker)', () => {
  const deck = { type: 'standard-52', jokers: 0 }
  const HOUSE = { game: 'house', chips: { start: 100, bets: [1, 2, 5, 10, 25] }, hitSoft17: false, rounds: 10 }
  // One deck, so the cards are named without a copy number.
  const bj = createTableauPluginFor('standard-52')(HOUSE, { definition: { players: ['dealer', 'p1', 'p2'], components: { deck } } })
  const ctx = { card: bj.cardOf }
  const bjBase = bj.init({ hands: [[], [], []], community: [], drawPile: [] }, noRng)
  const table = (boxes, house, shoe, extra = {}) => ({ ...bjBase, phase: 'play', bets: [0, 10, 10], stacks: [0, 90, 90], boxes: [[], ...boxes], house, shoe, insured: [0, 0, 0], active: { seat: 1, box: 0 }, next: 1, revealed: false, ...extra })

  test('an Ace counts eleven unless that busts; Ace and a ten is Blackjack', () => {
    expect(blackjackTotal(['spades_A', 'hearts_6'], ctx)).toEqual({ value: 17, soft: true })
    expect(blackjackTotal(['spades_A', 'hearts_6', 'clubs_9'], ctx)).toEqual({ value: 16, soft: false })
    expect(blackjackTotal(['spades_A', 'hearts_K'], ctx).value).toBe(21)
  })

  test('the house never has a choice, so nobody plays it', () => {
    expect(bj.seatsThatChoose(bjBase)).toEqual([1, 2])
  })

  test('the house draws to 16 and stands on soft 17; a higher hand wins even money', () => {
    const s = table([[{ cards: ['clubs_10', 'clubs_9'], bet: 10, done: false }], [{ cards: ['clubs_8', 'clubs_7'], bet: 10, done: true, outcome: 'bust' }]], ['hearts_10', 'hearts_6'], ['diamonds_A', 'diamonds_5'])
    const after = bj.applyMove({ action: 'stand' }, s, turn(1))
    // Ten and six is sixteen: the house takes the Ace, to a hard 17, and stands.
    expect(after.lastRound.house).toEqual(['hearts_10', 'hearts_6', 'diamonds_A'])
    expect(after.stacks[1]).toBe(90 + 20)
    const soft = table([[{ cards: ['clubs_10', 'clubs_9'], bet: 10, done: false }], []], ['hearts_A', 'hearts_6'], ['diamonds_5'])
    expect(bj.applyMove({ action: 'stand' }, soft, turn(1)).lastRound.house).toEqual(['hearts_A', 'hearts_6'])
  })

  test('doubling doubles the bet for one card; split Aces take one card each; surrender returns half', () => {
    const d = bj.applyMove({ action: 'double' }, table([[{ cards: ['clubs_5', 'clubs_6'], bet: 10, done: false }], []], ['hearts_10', 'hearts_8'], ['diamonds_K']), turn(1))
    expect(d.lastRound.results.find(r => r.seat === 1).outcome).toBe('win')
    expect(d.stacks[1]).toBe(80 + 40)
    const split = bj.applyMove({ action: 'split' }, table([[{ cards: ['clubs_A', 'spades_A'], bet: 10, done: false }], [{ cards: ['clubs_8', 'clubs_7'], bet: 10, done: false }]], ['hearts_10', 'hearts_8'], ['diamonds_K', 'diamonds_9']), turn(1))
    expect(split.boxes[1].map(b => b.cards.length)).toEqual([2, 2])
    expect(split.boxes[1].every(b => b.done)).toBe(true)
    const sur = bj.applyMove({ action: 'surrender' }, table([[{ cards: ['clubs_10', 'clubs_6'], bet: 10, done: false }], [{ cards: ['clubs_8', 'clubs_7'], bet: 10, done: false }]], ['hearts_10', 'hearts_8'], []), turn(1))
    expect(sur.stacks[1]).toBe(95)
  })

  test('Craps: seven or eleven on the come-out wins the Pass Line, two or three wins Don\'t Pass, twelve pushes it', () => {
    const crapsCtx = { config: { shooters: 2, chips: { bets: [5] } } }
    const come = { stacks: [95, 95], turns: [0, 0], shooter: 0, rolls: 0, point: null, line: [{ type: 'pass', amount: 5 }, { type: 'dont', amount: 5 }], odds: [0, 0], seed: 1 }
    expect(resolveRoll(come, 0, [3, 4], crapsCtx).stacks).toEqual([105, 95])
    expect(resolveRoll(come, 0, [1, 2], crapsCtx).stacks).toEqual([95, 105])
    expect(resolveRoll(come, 0, [6, 6], crapsCtx).stacks).toEqual([95, 100])
    const point = resolveRoll(come, 0, [2, 2], crapsCtx)
    expect(point.point).toBe(4)
  })

  test('Craps: making the point pays Pass and its Odds at true odds; a seven-out passes the dice', () => {
    const crapsCtx = { config: { shooters: 2, chips: { bets: [5] } } }
    const onFour = { stacks: [90, 95], turns: [0, 0], shooter: 0, rolls: 3, point: 4, line: [{ type: 'pass', amount: 5 }, { type: 'dont', amount: 5 }], odds: [5, 0], seed: 1 }
    // Pass 5 even money, odds 5 at 2:1 on four.
    expect(resolveRoll(onFour, 0, [1, 3], crapsCtx).stacks).toEqual([90 + 10 + 15, 95])
    const out = resolveRoll(onFour, 0, [3, 4], crapsCtx)
    expect(out.stacks).toEqual([90, 105])
    expect(out.shooter).toBe(1)
    expect(out.turns).toEqual([1, 0])
  })

  test('Poker ranks the best five of seven: straight flush, four of a kind, full house, and the wheel', () => {
    const pctx = { card: bj.cardOf }
    const rank = (ids) => bestHand(ids, pctx)[0]
    expect(rank(['hearts_9', 'hearts_10', 'hearts_J', 'hearts_Q', 'hearts_K', 'clubs_2', 'spades_2'])).toBe(8)
    expect(rank(['hearts_9', 'clubs_9', 'spades_9', 'diamonds_9', 'hearts_K', 'clubs_2', 'spades_3'])).toBe(7)
    expect(rank(['hearts_9', 'clubs_9', 'spades_9', 'diamonds_K', 'hearts_K', 'clubs_2', 'spades_3'])).toBe(6)
    expect(bestHand(['hearts_A', 'clubs_2', 'spades_3', 'diamonds_4', 'hearts_5', 'clubs_9', 'spades_J'], pctx)).toEqual([4, 5])
    // A higher kicker wins between equal pairs.
    const a = bestHand(['hearts_9', 'clubs_9', 'spades_A', 'diamonds_7', 'hearts_4', 'clubs_2', 'spades_3'], pctx)
    const b = bestHand(['diamonds_9', 'spades_9', 'spades_K', 'diamonds_7', 'hearts_4', 'clubs_2', 'spades_3'], pctx)
    expect(a[2]).toBeGreaterThan(b[2])
  })

  test('Poker keeps every chip: side pots go to who contested them, and an uncalled bet goes back', () => {
    for (const players of [2, 3, 6]) {
      const game = createGameForFamily('standard-52', { variant: 'poker', rngSeed: players, settings: { players } })
      const ai = createAI('standard-52', 'poker', { difficulty: 'medium', definition: game.raw.definition, rngSeed: players })
      for (let ply = 0; ply < 100000; ply++) {
        const st = game.getState()
        if (st.slice.finished !== null) break
        expect(game.applyMove(ai.pickMove(st.slice, st.players.currentIndex)).ok).toBe(true)
        const s = game.getState().slice
        if (s.finished === null) expect(s.stacks.reduce((x, y) => x + y, 0) + s.total.reduce((x, y) => x + y, 0)).toBe(players * 1000)
      }
      const end = game.getState().slice
      expect(end.finished).not.toBeNull()
      expect(end.stacks[end.finished]).toBe(players * 1000)
    }
  })

  test('computer seats play Blackjack and Craps sessions out', () => {
    for (const [family, variant] of [['standard-52', 'blackjack'], ['standard-dice', 'craps']]) {
      const game = createGameForFamily(family, { variant, rngSeed: 5 })
      const ai = createAI(family, variant, { difficulty: 'medium', definition: game.raw.definition, rngSeed: 5 })
      for (let ply = 0; ply < 20000; ply++) {
        const st = game.getState()
        if (st.slice.finished !== null) break
        expect(game.applyMove(ai.pickMove(st.slice, st.players.currentIndex)).ok).toBe(true)
      }
      expect(game.getState().slice.finished).not.toBeNull()
    }
  })
})

describe('fishing (Koi-Koi, Hana-Awase, Go-Stop)', () => {
  const deck = { type: 'hanafuda-48' }
  const make = (config, players) => createTableauPluginFor('flower-48')({ game: 'fishing', ...config }, { definition: { players, components: { deck } } })
  const koi = make({ scoring: 'yaku', cardsEach: { 2: 8 }, field: { 2: 8 }, rounds: 12 }, ['p1', 'p2'])
  const ctx = { card: koi.cardOf }
  const yaku = (pile) => Object.fromEntries(koiKoiYaku(pile, ctx))
  const base = koi.init({ hands: [[], []], community: [], drawPile: [] }, noRng)
  const plains = (month, n) => Array.from({ length: n }, (_, k) => `${month}_plain-${k + 1}`)

  test('Koi-Koi yaku: the brights with and without the rain man, the viewings, boar-deer-butterfly, and counting', () => {
    expect(yaku(['pine_crane', 'cherry_curtain', 'pampas_moon', 'willow_rain-man', 'paulownia_phoenix'])).toEqual({ Goko: 10 })
    expect(yaku(['pine_crane', 'cherry_curtain', 'pampas_moon', 'willow_rain-man'])).toEqual({ 'Ame-Shiko': 7 })
    expect(yaku(['pine_crane', 'cherry_curtain', 'pampas_moon', 'paulownia_phoenix'])).toEqual({ Shiko: 8 })
    expect(yaku(['pine_crane', 'cherry_curtain', 'willow_rain-man'])).toEqual({})
    expect(yaku(['pampas_moon', 'chrysanthemum_sake-cup', 'cherry_curtain'])).toEqual({ 'Tsukimi-zake': 5, 'Hanami-zake': 5 })
    expect(yaku(['clover_boar', 'maple_deer', 'peony_butterflies'])).toEqual({ Inoshikacho: 5 })
    // The sake cup is a plain as well as an animal: nine plains and the cup make ten.
    expect(yaku([...plains('pine', 2), ...plains('plum', 2), ...plains('cherry', 2), ...plains('wisteria', 2), 'iris_plain-1', 'chrysanthemum_sake-cup'])).toEqual({ Kasu: 1 })
  })

  test('a played card takes the one it matches, chooses between two, and takes all three', () => {
    const s = { ...base, field: ['pine_crane', 'pine_poetry-ribbon', 'plum_plain-1', 'cherry_plain-1', 'cherry_plain-2', 'cherry_poetry-ribbon'], hands: [['pine_plain-1', 'cherry_curtain', 'iris_bridge'], ['clover_boar']], drawPile: ['paulownia_plain-1'], next: 0 }
    const moves = koi.getLegalMoves(s, turn(0))
    expect(moves.filter(m => m.cards[0] === 'pine_plain-1').map(m => m.to).sort()).toEqual([koi.cardOf('pine_crane').display, koi.cardOf('pine_poetry-ribbon').display].sort())
    const three = koi.applyMove(moves.find(m => m.cards[0] === 'cherry_curtain'), s, turn(0))
    expect(three.piles[0].sort()).toEqual(['cherry_curtain', 'cherry_plain-1', 'cherry_plain-2', 'cherry_poetry-ribbon'].sort())
    const none = koi.applyMove(moves.find(m => m.cards[0] === 'iris_bridge'), s, turn(0))
    expect(none.field).toContain('iris_bridge')
  })

  test('stopping scores the yaku, double at seven or more, and double again after the opponent\'s koi-koi', () => {
    const pile = ['pine_crane', 'cherry_curtain', 'pampas_moon', 'paulownia_phoenix']
    const s = { ...base, phase: 'call', piles: [pile, []], called: [0, 1], lastScore: [8, 0], next: 0, scores: [0, 0] }
    const after = koi.applyMove({ action: 'stop' }, s, turn(0))
    expect(after.scores).toEqual([8 * 2 * 2, 0])
    expect(after.dealer).toBe(0)
  })

  test('with nobody stopping, the dealer scores one and deals again', () => {
    const s = { ...base, dealer: 1, hands: [[], ['iris_bridge']], field: ['pine_crane'], drawPile: [], piles: [[], []], scores: [0, 0], next: 1 }
    const after = koi.applyMove({ action: 'play', cards: ['iris_bridge'], to: 'table' }, s, turn(1))
    expect(after.scores).toEqual([0, 1])
    expect(after.dealer).toBe(1)
    expect(after.round).toBe(1)
  })

  test('Hana-Awase adds the card values, twenty, ten, five and one, and four play as partners', () => {
    const hana = make({ scoring: 'points', cardsEach: { 4: 5 }, field: { 4: 8 }, cardValues: { hikari: 20, tane: 10, tanzaku: 5, kasu: 1 }, partnerships: [['p1', 'p3'], ['p2', 'p4']], rounds: 1 }, ['p1', 'p2', 'p3', 'p4'])
    const hb = hana.init({ hands: [[], [], [], []], community: [], drawPile: [] }, noRng)
    const s = { ...hb, hands: [[], [], [], ['iris_bridge']], field: [], drawPile: [], piles: [['pine_crane'], ['plum_bush-warbler'], ['plum_poetry-ribbon', 'plum_plain-1'], []], scores: [0, 0], next: 3 }
    const after = hana.applyMove({ action: 'play', cards: ['iris_bridge'], to: 'table' }, s, turn(3))
    expect(after.scores).toEqual([20 + 5 + 1, 10])
    expect(after.finished).toBe(0)
  })

  test('Go-Stop scores godori, the grass ribbons and double junk', () => {
    const gs = make({ scoring: 'go-stop' }, ['p1', 'p2'])
    const gctx = { card: gs.cardOf }
    expect(goStopScore(['plum_bush-warbler', 'wisteria_cuckoo', 'pampas_geese'], gctx)).toBe(5)
    expect(goStopScore(['wisteria_red-ribbon', 'iris_red-ribbon', 'clover_red-ribbon'], gctx)).toBe(3)
    // Eight junk and the two double cards make twelve: three points.
    expect(goStopScore([...plains('pine', 2), ...plains('plum', 2), ...plains('cherry', 2), ...plains('iris', 2), 'willow_lightning', 'paulownia_plain-3'], gctx)).toBe(3)
  })

  test('Go-Stop: the drawn fourth of a month after a pair is ttadak, taking a junk card from the other player', () => {
    const gs = make({ scoring: 'go-stop', cardsEach: { 2: 10 }, field: { 2: 8 }, goThreshold: { 2: 7 } }, ['p1', 'p2'])
    const g0 = gs.init({ hands: [[], []], community: [], drawPile: [] }, noRng)
    const s = { ...g0, field: ['pine_crane', 'pine_poetry-ribbon'], hands: [['pine_plain-1', 'iris_bridge'], ['clover_boar']], drawPile: ['pine_plain-2'], piles: [[], ['maple_plain-1']], next: 0 }
    const move = gs.getLegalMoves(s, turn(0)).find(m => m.cards[0] === 'pine_plain-1')
    const after = gs.applyMove(move, s, turn(0))
    expect(after.piles[0]).toEqual(expect.arrayContaining(['pine_crane', 'pine_poetry-ribbon', 'pine_plain-1', 'pine_plain-2', 'maple_plain-1']))
    expect(after.piles[1]).toEqual([])
  })

  test('computer seats play each game out', () => {
    for (const [variant, settings] of [['koi-koi', { rounds: 3 }], ['hana-awase', {}], ['go-stop', { rounds: 3 }]]) {
      const game = createGameForFamily('flower-48', { variant, rngSeed: 4, settings })
      const ai = createAI('flower-48', variant, { difficulty: 'medium', definition: game.raw.definition, rngSeed: 4 })
      for (let ply = 0; ply < 20000; ply++) {
        const st = game.getState()
        if (st.slice.finished !== null) break
        expect(game.applyMove(ai.pickMove(st.slice, st.players.currentIndex)).ok).toBe(true)
      }
      expect(game.getState().slice.finished).not.toBeNull()
    }
  })
})

describe('tableaus (Oicho-Kabu)', () => {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October']
  const plugin = createTableauPluginFor('flower-48')({ game: 'tableaus', chips: { start: 100, bets: [1, 2, 5, 10] }, rounds: 8 }, { definition: { players: ['p1', 'p2', 'p3'], components: { deck: { type: 'hanafuda-48', months } } } })
  const base = plugin.init({ hands: [[], [], []], community: [], drawPile: [] }, noRng)
  // Cards by value: January is 1, ... October is 10.
  const v = { 1: 'pine_crane', 2: 'plum_bush-warbler', 3: 'cherry_curtain', 4: 'wisteria_cuckoo', 5: 'iris_bridge', 6: 'peony_butterflies', 7: 'clover_boar', 8: 'pampas_moon', 9: 'chrysanthemum_sake-cup', 10: 'maple_deer' }
  const v2 = { 1: 'pine_poetry-ribbon', 4: 'wisteria_red-ribbon', 9: 'chrysanthemum_blue-ribbon', 5: 'iris_red-ribbon' }

  test('forty cards, January to October; four tableaus and the dealer\'s card', () => {
    expect(base.deck.length + 5).toBe(40)
    expect(base.tableaus.map(t => t.cards.length)).toEqual([1, 1, 1, 1])
    expect(plugin.projectForSeat(base, 1).own).toEqual([null])
  })

  const settleWith = (tableau, own, deck = []) => {
    const s = { ...base, dealer: 0, stacks: [100, 100, 100], tableaus: [{ cards: tableau, bets: [{ seat: 1, amount: 10 }] }, { cards: [v[3]], bets: [] }, { cards: [v[3]], bets: [] }, { cards: [v[3]], bets: [] }], own, deck, phase: 'dealer', deciding: null, next: 0, round: 0 }
    return plugin.applyMove({ action: 'stand' }, s, turn(0))
  }

  test('the hand nearer nine wins; a tie goes to the dealer', () => {
    // Four and four is 8 against the dealer's 5: the bettor wins.
    expect(settleWith([v[4], v2[4]], [v[2], v[3]]).stacks).toEqual([90, 110, 100])
    // Three and three is 6 against 6: the dealer takes the tie.
    expect(settleWith([v[3], v[3]], [v[2], v[4]]).stacks).toEqual([110, 90, 100])
  })

  test('arashi, three of a value, is paid triple', () => {
    expect(settleWith([v[3], v[3], v[3]], [v[2], v[4]]).stacks).toEqual([70, 130, 100])
  })

  test('a total of three or less must draw and seven or more may not; four to six is the bettor\'s choice', () => {
    const s = { ...base, dealer: 0, tableaus: [{ cards: [v[1]], bets: [{ seat: 1, amount: 5 }] }, { cards: [v[5]], bets: [{ seat: 2, amount: 5 }] }, { cards: [v[7]], bets: [] }, { cards: [v[3]], bets: [] }], deck: [v[2], v[1], v[6], v[7], v[8]], punters: [1, 2], phase: 'bet', next: 2 }
    const after = plugin.applyMove({ action: 'skip' }, { ...s, punters: [1, 2] }, turn(2))
    // Tableau 1: 1 + 2 = 3, drew the 6. Tableau 2: 5 + 1 = 6, its bettor decides.
    expect(after.tableaus[0].cards).toHaveLength(3)
    expect(after.phase).toBe('third')
    expect(after.deciding).toBe(1)
    expect(after.next).toBe(2)
  })

  test('kuppin wins every tableau for the dealer, double; shippin wins its tableau double', () => {
    // The tableau stands on 9; the dealer, showing a 9, is dealt a 1: kuppin.
    const kup = { ...base, dealer: 0, stacks: [100, 100, 100], tableaus: [{ cards: [v[8], v2[1]], bets: [{ seat: 1, amount: 10 }] }, { cards: [v[3]], bets: [] }, { cards: [v[3]], bets: [] }, { cards: [v[3]], bets: [] }], own: [v[9]], deck: [v[1]], phase: 'third', deciding: 0 }
    expect(plugin.applyMove({ action: 'stand' }, kup, turn(1)).stacks).toEqual([120, 80, 100])
    // Four and one on a tableau wins it double, whatever the dealer holds.
    expect(settleWith([v2[4], v2[1]], [v[2], v[6]]).stacks).toEqual([80, 120, 100])
  })

  test('computer seats play a session out and every chip is kept', () => {
    const game = createGameForFamily('flower-48', { variant: 'oicho-kabu', rngSeed: 3 })
    const ai = createAI('flower-48', 'oicho-kabu', { difficulty: 'medium', definition: game.raw.definition, rngSeed: 3 })
    for (let ply = 0; ply < 5000; ply++) {
      const st = game.getState()
      if (st.slice.finished !== null) break
      expect(game.applyMove(ai.pickMove(st.slice, st.players.currentIndex)).ok).toBe(true)
    }
    const s = game.getState().slice
    expect(s.finished).not.toBeNull()
    expect(s.stacks.reduce((a, b) => a + b, 0)).toBe(400)
  })
})

describe('wall (Hong Kong mahjong)', () => {
  const plugin = createTableauPluginFor('mahjong')({ game: 'wall', scoring: 'hong-kong', minimum: 3, rounds: 1 }, { definition: { players: ['east', 'south', 'west', 'north'], components: { deck: { type: 'mahjong-136', flowers: 8 } } } })
  const base = plugin.init({ hands: [[], [], [], []], community: [], drawPile: [] }, noRng)
  const moves = (slice, seat) => plugin.getLegalMoves(slice, turn(seat))
  // Tiles by kind, a copy at a time: t('bamboo_3') is a 3 of bamboo not yet used.
  const used = new Map()
  const t = (kind) => { const n = used.get(kind) || 0; used.set(kind, n + 1); return `${kind}_${n}` }
  const hand = (...ks) => ks.map(t)

  test('a hand reads as four sets and a pair, or seven pairs, or thirteen orphans', () => {
    const ks = ['bamboo_1', 'bamboo_2', 'bamboo_3', 'circles_5', 'circles_5', 'circles_5', 'wind_east', 'wind_east', 'wind_east', 'dragon_red', 'dragon_red', 'dragon_red', 'characters_9', 'characters_9']
    expect(arrangements(ks, 4)).toHaveLength(1)
    expect(arrangements(ks.slice(0, 13).concat(['characters_8']), 4)).toHaveLength(0)
    expect(isSevenPairs(['bamboo_1', 'bamboo_1', 'bamboo_4', 'bamboo_4', 'circles_2', 'circles_2', 'circles_7', 'circles_7', 'wind_east', 'wind_east', 'dragon_red', 'dragon_red', 'characters_3', 'characters_3'])).toBe(true)
    expect(isThirteenOrphans(['bamboo_1', 'bamboo_9', 'circles_1', 'circles_9', 'characters_1', 'characters_9', 'wind_east', 'wind_south', 'wind_west', 'wind_north', 'dragon_red', 'dragon_green', 'dragon_white', 'dragon_white'])).toBe(true)
  })

  test('Hong Kong faan: triplets, one suit, dragons and the winds, to a limit of 13', () => {
    const reading = (sets, pair, extra = {}) => hongKong({ sets, pair, special: null, kinds: [...sets.flatMap(x => (x.type === 'chow' ? [0, 1, 2].map(d => x.kind.replace(/\d$/, n => Number(n) + d)) : [x.kind, x.kind, x.kind])), pair, pair], bonus: [], seatWind: 'south', roundWind: 'east', selfDrawn: false, concealed: false, ...extra })
    const pung = (kind) => ({ type: 'pung', kind, open: true })
    const dragons = reading([pung('dragon_red'), pung('dragon_green'), pung('dragon_white'), pung('bamboo_2')], 'bamboo_5')
    expect(Object.fromEntries(dragons.patterns)).toMatchObject({ 'All in Triplets': 3, 'Mixed One Suit': 3, 'Great Dragons': 8 })
    expect(dragons.value).toBe(13)
    const flush = reading([{ type: 'chow', kind: 'circles_1', open: true }, { type: 'chow', kind: 'circles_4', open: true }, { type: 'chow', kind: 'circles_6', open: true }, { type: 'chow', kind: 'circles_2', open: true }], 'circles_9')
    expect(Object.fromEntries(flush.patterns)).toMatchObject({ 'Common Hand': 1, 'All One Suit': 7 })
    const winds = reading([pung('wind_south'), pung('wind_east'), pung('bamboo_2'), pung('circles_3')], 'characters_5')
    expect(Object.fromEntries(winds.patterns)).toMatchObject({ 'Seat Wind': 1, 'Prevailing Wind': 1 })
  })

  // Each seat holds its own flower, one faan towards the minimum.
  const flowers = [['flower_1'], ['flower_2'], ['flower_3'], ['flower_4']]
  const table = (hands, extra = {}) => ({ ...base, hands, melds: [[], [], [], []], discards: [[], [], [], []], bonus: flowers, wall: [t('bamboo_9'), t('circles_9'), t('characters_9'), t('bamboo_8')], dealer: 0, firstDealer: 0, roundWind: 0, scores: [0, 0, 0, 0], ...extra })

  test('a discard goes first to a player who can win, then to a pung, and a chow only to the next player', () => {
    used.clear()
    const winner = hand('bamboo_1', 'bamboo_1', 'bamboo_1', 'circles_2', 'circles_3', 'circles_4', 'wind_east', 'wind_east', 'wind_east', 'dragon_red', 'dragon_red', 'dragon_red', 'characters_5')
    const punger = hand('characters_5', 'characters_5', 'bamboo_7', 'bamboo_8', 'bamboo_9', 'circles_6', 'circles_7', 'circles_8', 'wind_west', 'wind_west', 'wind_north', 'dragon_green', 'dragon_white')
    const chower = hand('characters_3', 'characters_4', 'bamboo_2', 'bamboo_3', 'bamboo_4', 'circles_1', 'circles_1', 'circles_5', 'wind_south', 'wind_south', 'wind_north', 'dragon_green', 'dragon_white')
    const discarder = hand('characters_5', 'bamboo_5', 'bamboo_5', 'circles_9', 'circles_9', 'circles_7', 'characters_7', 'characters_7', 'characters_1', 'characters_2', 'bamboo_6', 'wind_north', 'dragon_green', 'dragon_green')
    const s = table([discarder, chower, punger, winner])
    const after = plugin.applyMove({ action: 'discard', cards: [discarder[0]], to: 'discard' }, { ...s, phase: 'discard', flags: {}, next: 0 }, turn(0))
    expect(after.phase).toBe('claim')
    expect(after.claim.queue).toEqual([3, 2, 1])
    expect(moves(after, 1)).toContainEqual({ action: 'chow', value: '3-4-5' })
    expect(moves(after, 2).some(m => m.action === 'chow')).toBe(false)
    expect(moves(after, 3)).toContainEqual({ action: 'win' })
  })

  test('a discard win is paid by the discarder; a self-drawn win by everyone, one and a half times', () => {
    used.clear()
    const winning = hand('bamboo_1', 'bamboo_1', 'bamboo_1', 'bamboo_2', 'bamboo_2', 'bamboo_2', 'bamboo_3', 'bamboo_3', 'bamboo_3', 'bamboo_7', 'bamboo_7', 'bamboo_7', 'bamboo_9')
    const s = table([[], [], [], winning], { phase: 'claim', lastDiscard: { tile: t('bamboo_9'), by: 0 }, claim: { queue: [3] }, next: 3 })
    const ron = plugin.applyMove({ action: 'win' }, { ...s, discards: [[s.lastDiscard.tile], [], [], []] }, turn(3))
    const pts = ron.lastHand.points
    expect(ron.scores).toEqual([-pts, 0, 0, pts])
    const tsumo = plugin.applyMove({ action: 'win' }, { ...s, phase: 'discard', hands: [[], [], [], [...winning, s.lastDiscard.tile]], drawn: s.lastDiscard.tile, flags: { selfDrawn: true }, next: 3 }, turn(3))
    const p2 = tsumo.lastHand.points
    expect(tsumo.scores).toEqual([-p2 * 1.5, -p2 * 1.5, -p2 * 1.5, p2 * 4.5])
  })

  test('a pung added to with the fourth tile can be robbed by a player who wins on it', () => {
    used.clear()
    // Seat 1 waits on the 5 of characters between its 4 and 6.
    const robber = hand('bamboo_1', 'bamboo_2', 'bamboo_3', 'circles_2', 'circles_3', 'circles_4', 'wind_east', 'wind_east', 'wind_east', 'characters_4', 'characters_6', 'dragon_red', 'dragon_red')
    const pungTiles = hand('characters_5', 'characters_5', 'characters_5')
    const fourth = t('characters_5')
    const s = table([[fourth, t('bamboo_9')], robber, [], []], { melds: [[{ type: 'pung', kind: 'characters_5', tiles: pungTiles, open: true }], [], [], []], phase: 'discard', flags: { selfDrawn: true }, next: 0 })
    const rob = plugin.applyMove({ action: 'kong', value: 'characters 5' }, s, turn(0))
    expect(rob.phase).toBe('rob')
    expect(rob.next).toBe(1)
    const won = plugin.applyMove({ action: 'win' }, rob, turn(1))
    expect(won.lastHand.patterns.map(p => p[0])).toContain('Robbing Kong')
    expect(won.lastHand.from).toBe(0)
  })


  test('sixteen-tile hands read as five sets and a pair; several may win on one discard; the dealer pays double', () => {
    const tw = createTableauPluginFor('mahjong')({ game: 'wall', scoring: 'taiwanese', minimum: 1, handSize: 16, multipleWinners: true, tai: { base: 1, bonusTile: 1 } }, { definition: { players: ['east', 'south', 'west', 'north'], components: { deck: { type: 'mahjong-136', flowers: 8 } } } })
    const tw0 = tw.init({ hands: [[], [], [], []], community: [], drawPile: [] }, noRng)
    expect(tw0.hands.filter((h, i) => i !== tw0.dealer).every(h => h.length === 16)).toBe(true)
    used.clear()
    // Seats 1 and 2 both wait on the 5 of characters; seat 0, the dealer, discards it.
    const waiting = () => hand('bamboo_1', 'bamboo_2', 'bamboo_3', 'circles_2', 'circles_3', 'circles_4', 'bamboo_7', 'bamboo_8', 'bamboo_9', 'circles_6', 'circles_7', 'circles_8', 'characters_4', 'characters_6', 'dragon_red', 'dragon_red')
    const five = t('characters_5')
    const s = { ...tw0, hands: [[five], waiting(), waiting(), []], melds: [[], [], [], []], discards: [[], [], [], []], bonus: [[], [], [], []], dealer: 0, firstDealer: 0, scores: [0, 0, 0, 0], phase: 'discard', flags: {}, next: 0 }
    let after = tw.applyMove({ action: 'discard', cards: [five], to: 'discard' }, s, turn(0))
    expect(after.claim.queue).toEqual([1, 2])
    after = tw.applyMove({ action: 'win' }, after, turn(1))
    expect(after.phase).toBe('claim')
    after = tw.applyMove({ action: 'win' }, after, turn(2))
    // Each hand is the base tai, 1; the dealer discarded, so pays each winner double.
    expect(after.lastHand.winners.map(w => w.winner)).toEqual([1, 2])
    expect(after.scores).toEqual([-4, 2, 2, 0])
  })

  test('computer seats play an East round out, and every point paid is received', () => {
    const game = createGameForFamily('mahjong', { variant: 'hong-kong', rngSeed: 3 })
    const ai = createAI('mahjong', 'hong-kong', { difficulty: 'medium', definition: game.raw.definition, rngSeed: 3 })
    for (let ply = 0; ply < 40000; ply++) {
      const st = game.getState()
      if (st.slice.finished !== null) break
      expect(game.applyMove(ai.pickMove(st.slice, st.players.currentIndex)).ok).toBe(true)
    }
    const s = game.getState().slice
    expect(s.finished).not.toBeNull()
    expect(s.scores.reduce((a, b) => a + b, 0)).toBe(0)
  })
})

describe('wall (Riichi mahjong)', () => {
  // A reading as wall.js hands it to the scorer. Sets are [type, kind, open?];
  // a chow is named by its lowest tile.
  const tilesOf = ([type, kind]) => (type === 'chow' ? [0, 1, 2].map(d => kind.replace(/\d$/, n => Number(n) + d)) : Array(type === 'kong' ? 4 : 3).fill(kind))
  const reading = (sets, pair, extra = {}) => ({
    sets: sets.map(([type, kind, open]) => ({ type, kind, open: !!open })),
    pair, special: null,
    kinds: [...sets.flatMap(tilesOf), pair, pair],
    seatWind: 'south', roundWind: 'east', selfDrawn: false, concealed: sets.every(x => !x[2]), wait: 'two-sided',
    ...extra,
  })
  const pays = (value, selfDrawn, winnerIsDealer) => (selfDrawn
    ? [riichiPays(value, { selfDrawn, winnerIsDealer, payerIsDealer: true }), riichiPays(value, { selfDrawn, winnerIsDealer, payerIsDealer: false })]
    : riichiPays(value, { selfDrawn, winnerIsDealer, payerIsDealer: false }))
  const names = (v) => v.patterns.map(p => p[0])

  // The EMA Riichi Competition Rules (2016), section 4.3, scoring examples 1 to 10.
  const straight = [['chow', 'characters_1'], ['chow', 'bamboo_1'], ['chow', 'bamboo_4'], ['chow', 'bamboo_7']]
  test('EMA examples 1 and 2: riichi, pinfu and a closed pure straight; mangan self-drawn, 4 han 30 fu on a discard', () => {
    const tsumo = riichi(reading(straight, 'characters_3', { riichi: true, selfDrawn: true }))
    expect(names(tsumo).sort()).toEqual(['Fully concealed hand', 'Pinfu', 'Pure straight', 'Riichi'])
    expect([tsumo.value, tsumo.limit]).toEqual([5, 'Mangan'])
    expect(pays(tsumo, true, false)).toEqual([4000, 2000])
    expect(pays(tsumo, true, true)).toEqual([4000, 4000])
    const ron = riichi(reading(straight, 'characters_3', { riichi: true }))
    expect([ron.value, ron.fu]).toEqual([4, 30])
    // "4-30 is not rounded to mangan payment."
    expect([pays(ron, false, true), pays(ron, false, false)]).toEqual([11600, 7700])
  })

  test('EMA example 3: an open straight with a dora is 2 han, and open pinfu 22 fu rounds to 30', () => {
    const v = riichi(reading([['chow', 'bamboo_1'], ['chow', 'bamboo_1'], ['chow', 'bamboo_4', true], ['chow', 'bamboo_7']], 'characters_3', { dora: 1 }))
    expect(names(v)).toEqual(['Pure straight', 'Dora'])
    expect([v.value, v.fu]).toEqual([2, 30])
    expect([pays(v, false, true), pays(v, false, false)]).toEqual([2900, 2000])
  })

  const pungs = [['pung', 'characters_3'], ['pung', 'circles_2'], ['pung', 'circles_4']]
  test('EMA examples 4 and 5: four concealed pungs self-drawn is yakuman; won on a discard the last pung is open', () => {
    const yakuman = riichi(reading([...pungs, ['pung', 'bamboo_8']], 'bamboo_3', { selfDrawn: true, wait: 'pung' }))
    expect(names(yakuman)).toContain('Four Concealed Pungs')
    expect(pays(yakuman, true, true)).toEqual([16000, 16000])
    expect(pays(yakuman, true, false)).toEqual([16000, 8000])
    const baiman = riichi(reading([...pungs, ['pung', 'bamboo_8', true]], 'bamboo_3', { concealed: true, wait: 'pung', dora: 3 }))
    expect(names(baiman).sort()).toEqual(['All pungs', 'All simples', 'Dora', 'Three concealed pungs'])
    expect([baiman.value, baiman.limit]).toEqual([8, 'Baiman'])
    expect([pays(baiman, false, true), pays(baiman, false, false)]).toEqual([24000, 16000])
  })

  const pairsOf = (...ks) => ({ sets: [], pair: null, special: 'seven-pairs', kinds: ks.flatMap(k => [k, k]), seatWind: 'south', roundWind: 'east', concealed: true, wait: 'pair' })
  test('EMA examples 6 and 7: seven pairs is 25 fu and nothing more; with riichi, ippatsu and all simples a haneman', () => {
    const haneman = riichi({ ...pairsOf('characters_2', 'characters_3', 'characters_5', 'circles_2', 'circles_6', 'bamboo_3', 'bamboo_4'), riichi: true, ippatsu: true, selfDrawn: true })
    expect([haneman.value, haneman.limit]).toEqual([6, 'Haneman'])
    expect(pays(haneman, true, false)).toEqual([6000, 3000])
    const plain = riichi({ ...pairsOf('dragon_red', 'characters_3', 'characters_5', 'circles_2', 'circles_6', 'bamboo_3', 'bamboo_4'), selfDrawn: false })
    expect([plain.value, plain.fu]).toEqual([2, 25])
    expect([pays(plain, false, true), pays(plain, false, false)]).toEqual([2400, 1600])
  })

  test('EMA example 8: twice pure double chow, self-drawn on a dragon pair wait, is 4 han 30 fu', () => {
    const v = riichi(reading([['chow', 'characters_3'], ['chow', 'characters_3'], ['chow', 'circles_1'], ['chow', 'circles_1']], 'dragon_red', { selfDrawn: true, wait: 'pair' }))
    expect(names(v).sort()).toEqual(['Fully concealed hand', 'Twice pure double chows'])
    expect([v.value, v.fu]).toEqual([4, 30])
    expect(pays(v, true, true)).toEqual([3900, 3900])
    expect(pays(v, true, false)).toEqual([3900, 2000])
  })

  test('EMA example 9: an open half flush, East pung for seat and round, outside hand and a dora is a haneman', () => {
    const v = riichi(reading([['chow', 'bamboo_1'], ['chow', 'bamboo_7'], ['pung', 'wind_east', true], ['pung', 'wind_west', true]], 'bamboo_1', { seatWind: 'east', concealed: false, wait: 'pung', dora: 1 }))
    expect(names(v).sort()).toEqual(['Dora', 'Half flush', 'Outside hand', 'Prevalent wind', 'Seat wind'])
    expect(v.limit).toBe('Haneman')
    expect(pays(v, false, true)).toEqual(18000)
  })

  test('EMA example 10: of the waits the winning tile could finish, the one that scores most is taken', () => {
    const r = { sets: [{ type: 'pung', kind: 'wind_north' }, { type: 'chow', kind: 'circles_2' }, { type: 'chow', kind: 'circles_5' }, { type: 'chow', kind: 'circles_7' }], pair: 'circles_1' }
    expect(placements(r, 'circles_7').map(p => p.wait)).toEqual(['two-sided', 'edge'])
    const edge = riichi(reading([['pung', 'wind_north'], ['chow', 'circles_2'], ['chow', 'circles_5'], ['chow', 'circles_7']], 'circles_1', { selfDrawn: true, wait: 'edge' }))
    expect([edge.value, edge.fu, edge.limit]).toEqual([4, 40, 'Mangan'])
    expect(pays(edge, true, false)).toEqual([4000, 2000])
  })

  test('a hand needs a yaku, dora are not one, and Blessing of Man is a mangan not added to anything', () => {
    const bare = [['chow', 'characters_1'], ['chow', 'circles_4'], ['chow', 'bamboo_7'], ['pung', 'circles_9', true]]
    expect(riichi(reading(bare, 'wind_north', { dora: 3, concealed: false, wait: 'closed' }))).toBeNull()
    expect(riichi(reading(bare, 'wind_north', { blessing: 'man', concealed: false, wait: 'closed' })).limit).toBe('Mangan')
    expect(doraAfter('circles_9')).toBe('circles_1')
    expect(doraAfter('wind_north')).toBe('wind_east')
    expect(doraAfter('dragon_red')).toBe('dragon_white')
  })
})

describe('wall (Riichi at the table)', () => {
  const config = {
    game: 'wall', scoring: 'riichi', minimum: 1, rounds: 2, startingPoints: 30000, deadWall: 14, riichi: 1000, riichiWall: 4,
    furiten: true, counters: 300, noten: 3000, dealerKeeps: 'tenpai', swapCalling: false, liability: true, lastDiscard: 'win',
    kongAfterClaim: false, multipleWinners: true,
  }
  const plugin = createTableauPluginFor('mahjong')(config, { definition: { players: ['east', 'south', 'west', 'north'], components: { deck: { type: 'mahjong-136' } } } })
  const base = plugin.init({ hands: [[], [], [], []], community: [], drawPile: [] }, noRng)
  const moves = (slice, seat) => plugin.getLegalMoves(slice, turn(seat))
  const play = (move, slice, seat) => plugin.applyMove(move, slice, turn(seat))
  const used = new Map()
  const t = (kind) => { const n = used.get(kind) || 0; used.set(kind, n + 1); return `${kind}_${n}` }
  const hand = (...ks) => ks.map(t)
  const of = (ids, kind) => ids.find(id => id.startsWith(`${kind}_`))
  const four = (v) => [0, 1, 2, 3].map(() => (typeof v === 'function' ? v() : v))
  // The wall and dead wall are the last copies of kinds, or kinds no test
  // hand holds: the north wind shows, so the east wind is dora.
  const ids = (kind) => [0, 1, 2, 3].map(n => `${kind}_${n}`)
  const table = (hands, extra = {}) => ({
    ...base, hands, melds: four(() => []), discards: four(() => []), discarded: four(() => []), bonus: four(() => []),
    riichi: four(null), furiten: four(false), liable: four(null), uninterrupted: false,
    wall: ['bamboo_8_3', 'characters_7_3', 'characters_7_2', 'characters_8_3', 'characters_8_2'],
    dead: { replacements: ids('circles_9'), indicators: [...ids('wind_north'), 'wind_west_3'], under: [...ids('characters_9'), 'wind_west_2'], kongs: 0 },
    dealer: 0, firstDealer: 0, roundWind: 0, scores: four(30000), pot: 0, counters: 0, phase: 'discard', flags: { selfDrawn: true }, next: 0, lastHand: null, lastDiscard: null,
    ...extra,
  })
  // All simples waiting on the 5 or 8 of circles.
  const tanyao = () => hand('characters_2', 'characters_3', 'characters_4', 'circles_3', 'circles_4', 'circles_5', 'bamboo_5', 'bamboo_6', 'bamboo_7', 'bamboo_2', 'bamboo_2', 'circles_6', 'circles_7')
  // Two pungs and seven odd tiles: nowhere near waiting.
  const quiet = () => hand('dragon_white', 'dragon_white', 'dragon_white', 'wind_south', 'wind_south', 'wind_south', 'characters_6', 'characters_8', 'bamboo_9', 'bamboo_7', 'circles_2', 'circles_7', 'bamboo_1')

  test('the deal keeps fourteen tiles back as a dead wall, and only the first indicator shows', () => {
    expect(base.dead.replacements).toHaveLength(4)
    expect(base.dead.indicators).toHaveLength(5)
    expect(base.wall).toHaveLength(136 - 14 - 53)
    expect(base.scores).toEqual([30000, 30000, 30000, 30000])
    const view = plugin.projectForSeat(base, 1)
    expect(view.dead.indicators[0]).toBe(base.dead.indicators[0])
    expect([...view.dead.indicators.slice(1), ...view.dead.under, ...view.dead.replacements].every(x => x === null)).toBe(true)
  })

  test('a hand without a yaku cannot win on a discard, but can on its own draw', () => {
    used.clear()
    // Closed, waiting on the 3 of bamboo between 2 and 4, a dragon pair: no yaku.
    const waiting = hand('characters_1', 'characters_2', 'characters_3', 'circles_4', 'circles_5', 'circles_6', 'bamboo_7', 'bamboo_8', 'bamboo_9', 'bamboo_2', 'bamboo_4', 'dragon_red', 'dragon_red')
    const three = t('bamboo_3')
    const claim = play({ action: 'discard', cards: [three], to: 'discard' }, table([[three, ...quiet()], waiting, [], []]), 0)
    expect(moves(claim, 1).some(m => m.action === 'win')).toBe(false)
    const own = table([[], [...waiting, three], [], []], { next: 1, drawn: three })
    expect(moves(own, 1)).toContainEqual({ action: 'win' })
  })

  test('furiten: no win on a discard while a wait is in your own discards, or after passing one until you draw', () => {
    used.clear()
    const waiting = tanyao()
    const five = t('circles_5')
    const eight = t('circles_8')
    const s = table([[five, ...hand('characters_1', 'characters_1', 'characters_1', 'bamboo_4', 'bamboo_4', 'bamboo_4', 'dragon_red', 'dragon_red', 'dragon_red', 'circles_1', 'circles_1', 'circles_1', 'wind_south')], [...quiet().slice(0, 12), eight], waiting, hand('bamboo_1', 'bamboo_1', 'bamboo_3', 'bamboo_3', 'bamboo_3', 'characters_5', 'characters_5', 'characters_5', 'dragon_white', 'bamboo_8', 'bamboo_8', 'wind_west', 'dragon_green')])
    const discarded = (d) => s.discarded.map((x, i) => (i === 2 ? d : x))
    const ron = (slice) => moves(play({ action: 'discard', cards: [five], to: 'discard' }, slice, 0), 2).some(m => m.action === 'win')
    expect(ron(s)).toBe(true)
    expect(ron({ ...s, discarded: discarded([t('circles_8')]) })).toBe(false)
    // Seat 2 lets the 5 go; seat 1 draws and throws the 8.
    const passed = play({ action: 'pass' }, play({ action: 'discard', cards: [five], to: 'discard' }, s, 0), 2)
    expect(passed.furiten[2]).toBe(true)
    const again = play({ action: 'discard', cards: [eight], to: 'discard' }, passed, 1)
    expect(again.phase).toBe('claim')
    expect(moves(again, 2).some(m => m.action === 'win')).toBe(false)
    expect(play({ action: 'pass' }, again, 2).furiten[2]).toBe(false)
  })

  test('riichi: the stake goes down once the discard is passed, the hand locks, and a win before the next discard is ippatsu', () => {
    used.clear()
    const white = t('dragon_white')
    const s = table([[...tanyao(), white], hand('wind_south', 'wind_south', 'wind_south', 'characters_6', 'characters_6', 'characters_6', 'bamboo_9', 'bamboo_9', 'bamboo_9', 'bamboo_1', 'bamboo_3', 'dragon_red', 'dragon_red'), hand('characters_1', 'characters_1', 'characters_1', 'bamboo_4', 'bamboo_4', 'bamboo_4', 'wind_south', 'circles_1', 'circles_1', 'circles_1', 'characters_5', 'characters_5', 'characters_5'), []])
    const declare = moves(s, 0).find(m => m.action === 'riichi' && m.cards[0] === white)
    expect(declare).toBeDefined()
    const after = play(declare, s, 0)
    expect(after.scores[0]).toBe(29000)
    expect(after.pot).toBe(1000)
    expect(after.riichi[0]).toEqual({ ippatsu: true, double: false })
    // Locked: the only discard is the tile just drawn.
    const drawn = t('characters_7')
    const locked = { ...after, phase: 'discard', next: 0, hands: after.hands.map((h, i) => (i === 0 ? [...h, drawn] : h)), drawn, flags: { selfDrawn: true } }
    expect(moves(locked, 0).filter(m => m.action === 'discard').map(m => m.cards[0])).toEqual([drawn])
    // Seat 1 throws the 8 of circles: riichi, ippatsu, pinfu, all simples; 4 han 30 fu to the dealer.
    const eight = t('circles_8')
    const thrown = play({ action: 'discard', cards: [eight], to: 'discard' }, { ...after, hands: after.hands.map((h, i) => (i === 1 ? [...h, eight] : h)) }, 1)
    const won = play({ action: 'win' }, thrown, 0)
    expect(won.lastHand.patterns.map(p => p[0])).toEqual(expect.arrayContaining(['Riichi', 'Ippatsu', 'Pinfu', 'All simples']))
    expect(won.scores.slice(0, 2)).toEqual([29000 + 11600 + 1000, 30000 - 11600])
  })

  test('no swap-calling: after a pung the claimed kind stays, after a chow neither it nor the far end goes', () => {
    used.clear()
    const five = t('circles_5')
    const pungHand = hand('circles_5', 'circles_5', 'circles_5', 'characters_2', 'characters_3', 'characters_4', 'bamboo_5', 'bamboo_6', 'bamboo_7', 'bamboo_2', 'bamboo_2', 'dragon_white', 'dragon_white')
    const claim = play({ action: 'discard', cards: [five], to: 'discard' }, table([[five, ...quiet()], [], pungHand, []]), 0)
    const pung = play({ action: 'pung' }, claim, 2)
    const left = pung.hands[2].find(id => id.startsWith('circles_5'))
    expect(moves(pung, 2).some(m => m.action === 'discard' && m.cards[0] === left)).toBe(false)
    used.clear()
    const three = t('circles_3')
    const chowHand = hand('circles_4', 'circles_5', 'circles_6', 'characters_2', 'characters_3', 'characters_4', 'bamboo_5', 'bamboo_6', 'bamboo_7', 'bamboo_2', 'bamboo_2', 'dragon_white', 'dragon_white')
    const offer = play({ action: 'discard', cards: [three], to: 'discard' }, table([[three, ...quiet()], chowHand, [], []]), 0)
    const chow = play({ action: 'chow', value: '3-4-5' }, offer, 1)
    const barred = moves(chow, 1).filter(m => m.action === 'discard').map(m => m.cards[0].replace(/_\d+$/, ''))
    expect(barred).not.toContain('circles_6')
    expect(barred).toContain('dragon_white')
  })

  test('no claim that would leave only tiles barred from discard', () => {
    used.clear()
    const three = t('circles_3')
    const shown = ['bamboo_2', 'bamboo_5', 'characters_4'].map(kind => ({ type: 'pung', kind, tiles: hand(kind, kind, kind), open: true }))
    const s = table([[three, ...quiet()], hand('circles_4', 'circles_5', 'circles_6', 'circles_6'), [], []], { melds: [[], shown, [], []] })
    const claim = play({ action: 'discard', cards: [three], to: 'discard' }, s, 0)
    // 3-4-5 would leave the two 6s, and a 6 is the far end of that chow.
    expect(moves(claim, 1).some(m => m.action === 'chow' && m.value === '3-4-5')).toBe(false)
  })

  test('EMA example 5 at the table: a pung finished by a discard is open, so four pungs are three concealed', () => {
    used.clear()
    const eight = t('bamboo_8')
    const waiting = hand('characters_3', 'characters_3', 'characters_3', 'circles_2', 'circles_2', 'circles_2', 'circles_4', 'circles_4', 'circles_4', 'bamboo_3', 'bamboo_3', 'bamboo_8', 'bamboo_8')
    const s = table([[eight, ...quiet()], waiting, [], []])
    // The 3 of circles shows, so the 4s are dora.
    const claim = play({ action: 'discard', cards: [eight], to: 'discard' }, { ...s, dead: { ...s.dead, indicators: ['circles_3_0', ...s.dead.indicators.slice(1)] } }, 0)
    const won = play({ action: 'win' }, claim, 1)
    expect(won.lastHand.patterns.map(p => p[0]).sort()).toEqual(['All pungs', 'All simples', 'Dora', 'Three concealed pungs'])
    expect(won.lastHand.limit).toBe('Baiman')
    expect(won.scores.slice(0, 2)).toEqual([30000 - 16000, 30000 + 16000])
  })

  test('a drawn hand: the last discard only wins, those not waiting pay those waiting, and a dealer not waiting passes the deal', () => {
    used.clear()
    const red = t('dragon_red')
    const s = table([[red, ...hand('characters_1', 'characters_1', 'characters_1', 'bamboo_4', 'bamboo_4', 'bamboo_4', 'wind_south', 'circles_1', 'circles_2', 'bamboo_1', 'bamboo_3', 'characters_5', 'characters_7')], quiet(), tanyao(), hand('dragon_red', 'dragon_red', 'bamboo_3', 'bamboo_3', 'characters_5', 'characters_5', 'characters_5', 'characters_6', 'bamboo_1', 'bamboo_1', 'wind_west', 'circles_2', 'circles_2')], { wall: [] })
    const over = play({ action: 'discard', cards: [red], to: 'discard' }, s, 0)
    expect(over.lastHand).toMatchObject({ drawn: true, waiting: [2] })
    expect(over.scores).toEqual([29000, 29000, 33000, 29000])
    expect(over.dealer).toBe(1)
    expect(over.counters).toBe(1)
  })

  test('liability: feeding the third dragon set pays all of a self-drawn Big Three Dragons', () => {
    used.clear()
    const red = t('dragon_red')
    const melds = [{ type: 'pung', kind: 'dragon_white', tiles: hand('dragon_white', 'dragon_white', 'dragon_white'), open: true }, { type: 'pung', kind: 'dragon_green', tiles: hand('dragon_green', 'dragon_green', 'dragon_green'), open: true }]
    const s = table([[red], hand('dragon_red', 'dragon_red', 'characters_2', 'characters_3', 'characters_4', 'bamboo_5', 'bamboo_6'), [], []], { melds: [[], melds, [], []] })
    const claim = play({ action: 'discard', cards: [red], to: 'discard' }, s, 0)
    const pung = play({ action: 'pung' }, claim, 1)
    expect(pung.liable[1]).toEqual({ by: 0, yakuman: 'Big Three Dragons' })
    const five = t('bamboo_5')
    const hand1 = [...pung.hands[1].filter(id => !id.startsWith('bamboo_6')), five]
    const won = play({ action: 'win' }, { ...pung, hands: pung.hands.map((h, i) => (i === 1 ? hand1 : h)), drawn: five, flags: { selfDrawn: true } }, 1)
    expect(won.lastHand.patterns.map(p => p[0])).toContain('Big Three Dragons')
    expect(won.scores).toEqual([30000 - 32000, 30000 + 32000, 30000, 30000])
  })

  test('computer seats play the East and South rounds out, and every point is accounted for', () => {
    const game = createGameForFamily('mahjong', { variant: 'riichi', rngSeed: 5 })
    const ai = createAI('mahjong', 'riichi', { difficulty: 'medium', definition: game.raw.definition, rngSeed: 5 })
    let riichis = 0
    for (let ply = 0; ply < 60000; ply++) {
      const st = game.getState()
      if (st.slice.finished !== null) break
      const move = ai.pickMove(st.slice, st.players.currentIndex)
      if (move.action === 'riichi') riichis++
      expect(game.applyMove(move).ok).toBe(true)
    }
    const s = game.getState().slice
    expect(s.finished).not.toBeNull()
    expect(s.scores.reduce((a, b) => a + b, 0) + s.pot).toBe(120000)
    expect(riichis).toBeGreaterThan(0)
  })
})

describe('wall (Zung Jung)', () => {
  const tilesOf = ([type, kind]) => (type === 'chow' ? [0, 1, 2].map(d => kind.replace(/\d$/, n => Number(n) + d)) : Array(type === 'kong' ? 4 : 3).fill(kind))
  const reading = (sets, pair, extra = {}) => ({
    sets: sets.map(([type, kind, open]) => ({ type, kind, open: !!open })), pair, special: null,
    kinds: [...sets.flatMap(tilesOf), pair, pair], seatWind: 'south', roundWind: 'east', selfDrawn: true, concealed: sets.every(x => !x[2]),
    ...extra,
  })
  const score = (...a) => zungJung(reading(...a))
  const names = (v) => v.patterns.map(p => p[0]).sort()

  // "A hand with 'Four Concealed Triplets' is always also a 'Concealed Hand'
  // and an 'All Triplets' hand, so such hand always scores at least 125+5+30=160."
  test('patterns from different series add up, one from each series', () => {
    const v = score([['pung', 'bamboo_2'], ['pung', 'circles_5'], ['pung', 'characters_7'], ['pung', 'bamboo_8']], 'circles_3')
    expect(names(v)).toEqual(['All Triplets', 'Concealed Hand', 'Four Concealed Triplets', 'No Terminals'])
    expect(v.value).toBe(125 + 5 + 30 + 5)
  })

  test('Value Honor is 10 for each set, and the dragons series counts once on top', () => {
    const small = score([['pung', 'dragon_red', true], ['pung', 'dragon_green', true], ['chow', 'bamboo_2'], ['chow', 'circles_4']], 'dragon_white')
    expect(small.patterns.filter(p => p[0] === 'Value Honor')).toHaveLength(2)
    expect(small.value).toBe(40 + 10 + 10)
    const big = score([['pung', 'dragon_red', true], ['pung', 'dragon_green', true], ['pung', 'dragon_white', true], ['chow', 'bamboo_2']], 'circles_5')
    expect(big.value).toBe(130 + 30)
    // The prevailing wind is not recognised; the seat wind is.
    const winds = score([['pung', 'wind_east', true], ['pung', 'wind_south', true], ['chow', 'bamboo_2'], ['chow', 'circles_4']], 'characters_5')
    expect(winds.patterns.filter(p => p[0] === 'Value Honor')).toHaveLength(1)
  })

  test('a hand with no pattern scores 1; the limit is 320, and a listed limit scores alone', () => {
    const chicken = score([['chow', 'bamboo_1', true], ['pung', 'circles_9', true], ['chow', 'characters_4', true], ['chow', 'bamboo_6', true]], 'wind_north', { selfDrawn: false })
    expect([chicken.value, chicken.patterns]).toEqual([1, [['Chicken Hand', 1]]])
    const winds = score([['pung', 'wind_east'], ['pung', 'wind_south'], ['pung', 'wind_west'], ['pung', 'wind_north']], 'dragon_red')
    expect(winds.patterns).toEqual([['Big Four Winds', 400]])
    // Pure One-Suit 80, Four Identical Sequences 480: the single highest.
    expect(score([['chow', 'bamboo_2'], ['chow', 'bamboo_2'], ['chow', 'bamboo_2'], ['chow', 'bamboo_2']], 'bamboo_9').value).toBe(480)
    const compound = score([['pung', 'bamboo_2'], ['pung', 'bamboo_3'], ['pung', 'bamboo_4'], ['pung', 'bamboo_5']], 'bamboo_9')
    expect([compound.value, compound.limit]).toEqual([320, 'Compound Limit Hand'])
  })

  test('a terminals-and-honours triplet hand is Mixed Greater Terminals, not Lesser as well: one per series', () => {
    const v = score([['pung', 'bamboo_1', true], ['pung', 'circles_9', true], ['pung', 'wind_north', true], ['pung', 'characters_1', true]], 'dragon_red')
    expect(names(v)).toEqual(['All Triplets', 'Mixed Greater Terminals'])
    expect(v.value).toBe(130)
  })

  test('seven pairs may repeat a pair, and counts patterns that need no sets', () => {
    const pairs = { sets: [], pair: null, special: 'seven-pairs', kinds: ['circles_2', 'circles_2', 'circles_2', 'circles_2', 'circles_3', 'circles_3', 'circles_4', 'circles_4', 'circles_5', 'circles_5', 'circles_6', 'circles_6', 'circles_7', 'circles_7'], seatWind: 'south', concealed: true, selfDrawn: true }
    expect(names(zungJung(pairs))).toEqual(['No Terminals', 'Pure One-Suit', 'Seven Pairs'])
  })

  // "if the winning hand is 70 points, the two non-responsible players each
  // pay 25 points, and the responsible player pays the remaining 160 points."
  test('the winner collects three times the hand, the responsible discarder paying above 25', () => {
    const v = { value: 70 }
    expect([zungJungPays(v, { responsible: true }), zungJungPays(v, { responsible: false })]).toEqual([160, 25])
    expect(zungJungPays({ value: 20 }, { responsible: true })).toBe(20)
    expect(zungJungPays(v, { responsible: null })).toBe(70)
  })

  const plugin = createTableauPluginFor('mahjong')({ game: 'wall', scoring: 'zung-jung', minimum: 1, rounds: 1, deadWall: 14, dealerKeeps: 'never' }, { definition: { players: ['east', 'south', 'west', 'north'], components: { deck: { type: 'mahjong-136' } } } })
  const base = plugin.init({ hands: [[], [], [], []], community: [], drawPile: [] }, noRng)
  const play = (move, slice, seat) => plugin.applyMove(move, slice, turn(seat))
  const ids = (kind, from, n) => Array.from({ length: n }, (_, i) => `${kind}_${from + i}`)
  const four = (v) => [0, 1, 2, 3].map(() => (typeof v === 'function' ? v() : v))

  test('same-round immunity: the first to throw the winning tile since the winner last discarded pays for it', () => {
    // Seat 1: 1-2-3, 4-5-6 and 7-8 of bamboo, red dragons and a pair of 2s, waiting on the 9.
    const waiting = [...[1, 2, 3, 4, 5, 6, 7, 8].map(r => `bamboo_${r}_0`), ...ids('dragon_red', 0, 3), 'bamboo_2_1', 'bamboo_2_2']
    const s = {
      ...base, hands: [['bamboo_9_1', 'circles_1_0'], waiting, ['bamboo_9_2', 'circles_2_0'], ['bamboo_9_3', 'circles_3_0']], melds: four(() => []), discards: four(() => []), discarded: four(() => []), bonus: four(() => []),
      riichi: four(null), furiten: four(false), liable: four(null), uninterrupted: false, dealer: 0, firstDealer: 0, roundWind: 0, scores: four(0), pot: 0, counters: 0,
      // Seat 1 last threw a wind; since then seat 2 threw a 9 of bamboo, which seat 1 let go.
      log: [{ by: 1, tile: 'wind_west_0' }, { by: 2, tile: 'bamboo_9_2' }, { by: 3, tile: 'circles_9_0' }], phase: 'discard', flags: { selfDrawn: true }, next: 0, lastDiscard: null, lastHand: null,
    }
    const claim = play({ action: 'discard', cards: ['bamboo_9_1'], to: 'discard' }, s, 0)
    const won = play({ action: 'win' }, claim, 1)
    const v = won.lastHand.value
    expect(v).toBeGreaterThan(25)
    expect(won.scores).toEqual([-25, 3 * v, -(3 * v - 50), -25])
    // The deal passes after every hand.
    expect(won.dealer).toBe(1)
  })

  test('four of a kind may stand for two of the seven pairs', () => {
    const hand = [...ids('circles_1', 0, 4), ...ids('circles_5', 0, 2), ...ids('circles_9', 0, 2), ...ids('bamboo_1', 0, 2), ...ids('bamboo_5', 0, 2), ...ids('dragon_red', 0, 2)]
    const s = { ...base, hands: [hand, [], [], []], melds: four(() => []), bonus: four(() => []), discarded: four(() => []), phase: 'discard', flags: { selfDrawn: true }, drawn: hand[13], next: 0 }
    expect(plugin.getLegalMoves(s, turn(0))).toContainEqual({ action: 'win' })
  })

  test('computer seats play a round out, and every point paid is received', () => {
    const game = createGameForFamily('mahjong', { variant: 'zung-jung', rngSeed: 7 })
    const ai = createAI('mahjong', 'zung-jung', { difficulty: 'medium', definition: game.raw.definition, rngSeed: 7 })
    for (let ply = 0; ply < 40000; ply++) {
      const st = game.getState()
      if (st.slice.finished !== null) break
      expect(game.applyMove(ai.pickMove(st.slice, st.players.currentIndex)).ok).toBe(true)
    }
    const s = game.getState().slice
    expect(s.finished).not.toBeNull()
    expect(s.scores.reduce((a, b) => a + b, 0)).toBe(0)
    expect(s.deals).toBe(4)
  })
})

describe('dice', () => {
  const definition = { players: ['a', 'b'], components: { dice: { count: 5 } } }
  const rng = { request: () => ({ shuffle: a => a, nextInt: () => 77 }) }

  describe('scorecard (Yahtzee)', () => {
    const CATS = {
      aces: { count: 1 }, twos: { count: 2 }, threes: { count: 3 }, fours: { count: 4 }, fives: { count: 5 }, sixes: { count: 6 },
      'three-of-a-kind': { ofAKind: 3, score: 'total' }, 'four-of-a-kind': { ofAKind: 4, score: 'total' },
      'full-house': { pattern: [3, 2], score: 25 }, 'small-straight': { straight: 4, score: 30 },
      'large-straight': { straight: 5, score: 40 }, yahtzee: { ofAKind: 5, score: 50 }, chance: { score: 'total' },
    }
    const plugin = createTableauPluginFor('standard-dice')({
      game: 'scorecard', dice: 5, rolls: 3, categories: CATS,
      bonuses: [{ categories: ['aces', 'twos', 'threes', 'fours', 'fives', 'sixes'], atLeast: 63, score: 35 }],
      repeat: { category: 'yahtzee', bonus: 100 },
    }, { definition })
    const rolled = (dice, patch = {}) => ({ ...plugin.init({}, rng), dice, rollsLeft: 2, ...patch })
    const points = (s) => Object.fromEntries(plugin.getLegalMoves(s, turn(0)).filter(m => m.action === 'score').map(m => [m.value, m.points]))

    test('a die is drawn from what it shows', () => {
      expect(plugin.cardOf('die3-5')).toMatchObject({ value: 5, display: '5' })
    })

    test('each category scores the dice as the scorecard says', () => {
      expect(points(rolled([3, 3, 3, 5, 5]))).toMatchObject({ threes: 9, fives: 10, 'three-of-a-kind': 19, 'four-of-a-kind': 0, 'full-house': 25, chance: 19, yahtzee: 0 })
      expect(points(rolled([1, 2, 3, 4, 6]))).toMatchObject({ 'small-straight': 30, 'large-straight': 0 })
      expect(points(rolled([2, 3, 4, 5, 6]))).toMatchObject({ 'small-straight': 30, 'large-straight': 40 })
    })

    test('three rolls a turn, keeping any dice between them', () => {
      let s = plugin.init({}, rng)
      expect(plugin.getLegalMoves(s, turn(0))).toEqual([{ action: 'roll', cards: [] }])
      s = plugin.applyMove({ action: 'roll', cards: [] }, s, turn(0))
      const keep = [`die0-${s.dice[0]}`, `die1-${s.dice[1]}`]
      const kept = plugin.applyMove({ action: 'roll', cards: keep }, s, turn(0))
      expect(kept.dice.slice(0, 2)).toEqual(s.dice.slice(0, 2))
      const last = plugin.applyMove({ action: 'roll', cards: [] }, kept, turn(0))
      expect(last.rollsLeft).toBe(0)
      expect(plugin.getLegalMoves(last, turn(0)).every(m => m.action === 'score')).toBe(true)
    })

    test('each box is filled once, a zero included', () => {
      const s = rolled([1, 1, 2, 2, 3], { cards: [{ yahtzee: 0 }, {}] })
      expect(points(s).yahtzee).toBeUndefined()
      const after = plugin.applyMove({ action: 'score', value: 'sixes', points: 0 }, s, turn(0))
      expect(after.cards[0].sixes).toBe(0)
      expect(plugin.turnEffects(after)).toEqual({ next: 1 })
    })

    test('another Yahtzee after scoring 50 there: 100 more, and the joker rules', () => {
      const s = rolled([4, 4, 4, 4, 4], { cards: [{ yahtzee: 50 }, {}] })
      // The matching upper box is open, so it must be taken.
      expect(points(s)).toEqual({ fours: 20 })
      const after = plugin.applyMove({ action: 'score', value: 'fours', points: 20 }, s, turn(0))
      expect(after.bonus[0]).toBe(100)
      // With it filled, any lower box takes the dice at full value.
      const joker = rolled([4, 4, 4, 4, 4], { cards: [{ yahtzee: 50, fours: 12 }, {}] })
      expect(points(joker)).toMatchObject({ 'full-house': 25, 'large-straight': 40 })
    })

    test('upper boxes totalling 63 earn 35, and the highest total wins', () => {
      const card = { aces: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, 'three-of-a-kind': 20, 'four-of-a-kind': 0, 'full-house': 25, 'small-straight': 30, 'large-straight': 0, yahtzee: 0 }
      const s = rolled([1, 2, 3, 4, 5], { rollsLeft: 0, cards: [card, { ...card, aces: 0 }] })
      let end = plugin.applyMove({ action: 'score', value: 'chance', points: 15 }, s, turn(0))
      end = plugin.applyMove({ action: 'roll', cards: [] }, end, turn(1))
      const chance = plugin.getLegalMoves({ ...end, rollsLeft: 0 }, turn(1)).find(m => m.value === 'chance')
      end = plugin.applyMove(chance, { ...end, rollsLeft: 0 }, turn(1))
      expect(end.totals[0]).toBe(153 + 35)
      expect(plugin.checkWin(end)).toBe(0)
    })
  })

  describe('press your luck (Farkle)', () => {
    const FARKLE = {
      game: 'press-your-luck', dice: 6, singles: { 1: 100, 5: 50 }, triples: { 1: 1000, 2: 200, 3: 300, 4: 400, 5: 500, 6: 600 },
      multiples: { 4: 2, 5: 3, 6: 4 }, straight: 1500, threePairs: 1500, opening: 500, target: 10000, finalRound: true,
    }
    const plugin = createTableauPluginFor('standard-dice')(FARKLE, { definition: { players: ['a', 'b', 'c'], components: { dice: { count: 6 } } } })
    const rolled = (dice, patch = {}) => ({ ...plugin.init({}, rng), dice, ...patch })
    const ids = (dice) => dice.map((v, i) => `die${i}-${v}`)

    test('every die set aside must score', () => {
      const s = rolled([1, 5, 2, 3, 4, 6], { scores: [1000, 0, 0] })
      const sets = plugin.getLegalMoves(s, turn(0)).filter(m => m.action === 'bank').map(m => m.cards.join())
      // The one and the five, alone or together; one of each face is a straight.
      expect(sets.sort()).toEqual(['die0-1', 'die0-1,die1-5', 'die1-5', ids([1, 5, 2, 3, 4, 6]).join()].sort())
    })

    test('a roll that scores nothing is a Farkle: the turn and its points are lost', () => {
      const s = rolled([2, 3, 4, 6, 2, 3], { turn: 800 })
      expect(plugin.getLegalMoves(s, turn(0))).toEqual([{ action: 'farkle' }])
      const after = plugin.applyMove({ action: 'farkle' }, s, turn(0))
      expect(after.scores[0]).toBe(0)
      expect(plugin.turnEffects(after)).toEqual({ next: 1 })
    })

    test('nobody banks below 500 until they are on the board', () => {
      const s = rolled([1, 2, 3, 4, 6, 6], { turn: 300 })
      expect(plugin.getLegalMoves(s, turn(0)).some(m => m.action === 'bank')).toBe(false)
      expect(plugin.getLegalMoves({ ...s, turn: 400 }, turn(0)).some(m => m.action === 'bank')).toBe(true)
    })

    test('four of a kind is twice the three', () => {
      const s = rolled([4, 4, 4, 4, 2, 3], { scores: [1000, 0, 0] })
      const bank = plugin.applyMove({ action: 'bank', cards: ids([4, 4, 4, 4]) }, s, turn(0))
      expect(bank.scores[0]).toBe(1800)
    })

    test('hot dice: all six set aside, all six roll again', () => {
      const s = rolled([1, 1, 1, 5, 5, 5])
      const after = plugin.applyMove({ action: 'roll', cards: ids([1, 1, 1, 5, 5, 5]) }, s, turn(0))
      expect(after.turn).toBe(1500)
      expect(after.dice.filter(v => v !== null)).toHaveLength(6)
    })

    test('reaching 10,000 gives everyone else one more turn, then the highest wins', () => {
      let s = rolled([1, 2, 3, 4, 6, 6], { scores: [9900, 9000, 200] })
      s = plugin.applyMove({ action: 'bank', cards: ['die0-1'] }, s, turn(0))
      expect(plugin.checkWin(s)).toBeNull()
      s = plugin.applyMove({ action: 'bank', cards: ['die0-1'] }, { ...s, dice: [1, 3, 3, 4, 6, 6] }, turn(1))
      expect(plugin.checkWin(s)).toBeNull()
      s = plugin.applyMove({ action: 'farkle' }, s, turn(2))
      expect(plugin.checkWin(s)).toBe(0)
    })
  })

  test('policy seats play Yahtzee and Farkle through to a result', () => {
    for (const variant of ['yahtzee', 'farkle']) {
      const game = createGameForFamily('standard-dice', { variant, rngSeed: 4 })
      const ai = createAI('standard-dice', variant, { difficulty: 'medium' })
      let result = null
      for (let ply = 0; ply < 5000 && (result?.winner === undefined || result?.winner === null); ply++) {
        result = game.applyMove(ai.pickMove(game.getState().slice, game.getState().players.currentIndex))
        expect(result.ok).toBe(true)
      }
      expect(result.winner).not.toBeNull()
    }
  })
})
