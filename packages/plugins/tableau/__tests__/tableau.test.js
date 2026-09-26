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
