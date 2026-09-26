import { createTableauPluginFor } from '../index.js'
import { buildDeck, cardIdOf, ordering } from '../src/cards.js'
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
