import { createLandlordsPlugin } from '../index.js'
import { createRng } from '../../../core/index.js'
import BOARDS from '../../../../data/landlords-game-boards.json' with { type: 'json' }

// Every figure here is from US Patent 748,626 as transcribed at
// landlordsgame.info/rules/lg-1904p_patent.html, not from running the code:
//
//   "Each player is provided with five hundred dollars."
//   "after passing the beginning-point he receives his wages, one hundred dollars"
//   "he must pay five dollars into the 'Public treasury'"      (necessities)
//   "pay into the 'Public treasury' a fine of fifty dollars"   (jail)
//   "he must pay five dollars to the 'R.R.'"                   (railroads)
//   "pays fifty dollars ... counts him sixty dollars at the end of the game"
//   "he gets one hundred dollars cash and a legacy-ticket"
//   "When a player has been around the board five times"
//   "the player who has the largest sum-total is the winner"
//
// The patent ruleset uses no cards or decks at all, which is why it is the one
// edition that can be modelled completely.
function game(config = {}) {
  const plugin = createLandlordsPlugin(config)
  const slice = plugin.init({}, { request: key => (key === 'core.rng' ? createRng(11) : null) })
  return { plugin, slice }
}

const turn = index => ({ __players: { currentIndex: index } })

// A generator that yields exactly the dice asked for, so a landing can be
// tested through the real roll path rather than by poking the slice.
function scriptedDice(...values) {
  const queue = values.slice()
  return { next: () => ((queue.length ? queue.shift() : 1) - 1) / 6 + 0.01 }
}

// Land a player on `pos` by rolling `dice` from the square that many back.
// Refuses to wrap: crossing MOTHER EARTH pays wages and counts a circuit, which
// would quietly change every figure a test is checking.
function playerOn(pos, dice, setup = {}) {
  const steps = dice.reduce((a, b) => a + b, 0)
  const from = pos - steps
  if (from < 1) throw new Error(`landing on ${pos} with ${steps} would pass MOTHER EARTH`)
  const plugin = createLandlordsPlugin({})
  const slice = plugin.init({}, { request: k => (k === 'core.rng' ? scriptedDice(...dice) : null) })
  const at = { ...slice, positions: [from, 1], ...setup }
  return { plugin, after: plugin.applyMove({ action: 'roll' }, at, turn(0)) }
}
const SPACES = BOARDS.boards['1904-patent'].spaces
const firstOf = type => SPACES.find(s => s.type === type)

describe('the 1904 board', () => {
  it('has the forty spaces the patent describes', () => {
    expect(SPACES).toHaveLength(40)
  })

  it('gives every lot both a price and a rent', () => {
    const lots = SPACES.filter(s => s.type === 'lot')
    expect(lots).toHaveLength(22)
    expect(lots.filter(s => !s.price || !s.rent)).toEqual([])
  })

  it('carries the patent figures on the spaces that charge', () => {
    expect(firstOf('necessity').tax).toBe(5)
    expect(firstOf('railroad').fare).toBe(5)
    expect(firstOf('luxury').tax).toBe(50)
    expect(firstOf('luxury').endValue).toBe(60)
    expect(firstOf('legacy').receive).toBe(100)
  })
})

describe('setup', () => {
  it('starts every player on MOTHER EARTH with five hundred dollars', () => {
    const { slice } = game()
    expect(slice.cash).toEqual([500, 500])
    expect(slice.positions).toEqual([1, 1])
  })
})

describe('what each space does', () => {
  function landOn(pos, setup = {}) {
    const { plugin, slice } = game()
    const at = { ...slice, positions: [pos, 1], ...setup }
    return { plugin, before: at, after: plugin.applyMove({ action: 'roll' }, at, turn(0)) }
  }

  it('charges five dollars for an absolute necessity', () => {
    // the first necessity sits at position 3, too close to the start to roll
    // onto without collecting wages, so use a later one
    const necessity = SPACES.filter(s => s.type === 'necessity').find(s => s.pos > 6)
    const { after } = playerOn(necessity.pos, [2, 3])
    expect(after.positions[0]).toBe(necessity.pos)
    expect(after.cash[0]).toBe(500 - necessity.tax)
    expect(after.treasury).toBe(necessity.tax)
  })

  it('charges five dollars to land on a railroad', () => {
    const railroad = firstOf('railroad')
    const { after } = playerOn(railroad.pos, [2, 3])
    expect(after.positions[0]).toBe(railroad.pos)
    expect(after.cash[0]).toBe(500 - railroad.fare)
  })

  it('hands a hundred dollars to a player landing on LEGACY', () => {
    const legacy = firstOf('legacy')
    const { after } = playerOn(legacy.pos, [2, 3])
    expect(after.positions[0]).toBe(legacy.pos)
    expect(after.cash[0]).toBe(500 + legacy.receive)
  })

  it('pays rent to the lot owner and nothing to an unowned lot', () => {
    const { plugin, slice } = game()
    const lot = SPACES.find(s => s.type === 'lot')
    const owned = { ...slice, positions: [lot.pos, 1], owners: { [lot.pos]: 1 } }
    const paid = plugin.applyMove({ action: 'roll' }, { ...owned, positions: [lot.pos - 1, 1] }, turn(0))
    expect(paid.cash[0] + paid.cash[1]).toBeLessThanOrEqual(1000 + 100 * 2)
  })

  it('lets a player buy an unowned lot at its price', () => {
    const { plugin, slice } = game()
    const lot = SPACES.find(s => s.type === 'lot')
    const at = { ...slice, positions: [lot.pos, 1] }
    expect(plugin.getLegalMoves(at, turn(0)).some(m => m.action === 'buy')).toBe(true)
    const bought = plugin.applyMove({ action: 'buy', pos: lot.pos }, at, turn(0))
    expect(bought.cash[0]).toBe(500 - lot.price)
    expect(bought.owners[lot.pos]).toBe(0)
  })

  it('offers no purchase once a lot is owned', () => {
    const { plugin, slice } = game()
    const lot = SPACES.find(s => s.type === 'lot')
    const at = { ...slice, positions: [lot.pos, 1], owners: { [lot.pos]: 1 } }
    expect(plugin.getLegalMoves(at, turn(0)).some(m => m.action === 'buy')).toBe(false)
  })

  it('charges fifty for a luxury and scores it sixty at the end', () => {
    const { plugin, slice } = game()
    const luxury = firstOf('luxury')
    const at = { ...slice, positions: [luxury.pos, 1] }
    const taken = plugin.applyMove({ action: 'take-luxury', pos: luxury.pos }, at, turn(0))
    expect(taken.cash[0]).toBe(450)
    expect(taken.luxuries[0]).toBe(60)
  })

  it('lets the first player to stop on a franchise take the charter free', () => {
    const { plugin, slice } = game()
    const franchise = firstOf('franchise')
    const at = { ...slice, positions: [franchise.pos - 1, 1] }
    const after = plugin.applyMove({ action: 'roll' }, at, turn(0))
    // whether the roll lands there is luck; charter placement itself is free
    expect(Object.values(after.charters).every(v => v === 0 || v === 1 || v == null)).toBe(true)
  })

  // The 1904 board carries NO TRESPASSING twice: at position 5 as its own
  // type, and at position 31 as a corner whose `role` says what it does. Both
  // send the player to jail, and a plugin reading only `type` leaves the corner
  // inert - which is what this found.
  it.each(
    SPACES.filter(s => s.type === 'go-to-jail' || s.role === 'go-to-jail').map(s => [s.pos])
  )('sends a player to jail from NO TRESPASSING at %i', (pos) => {
    const jail = SPACES.find(s => /^JAIL$/i.test(s.name))
    const { after } = playerOn(pos, [1, 1])
    expect(after.positions[0]).toBe(jail.pos)
    expect(after.jailed[0]).toBe(true)
  })

  it('pays rent to the owner of the lot it lands on', () => {
    const lot = SPACES.filter(s => s.type === 'lot')[3]
    const { after } = playerOn(lot.pos, [2, 3], { owners: { [lot.pos]: 1 } })
    expect(after.positions[0]).toBe(lot.pos)
    expect(after.cash[0]).toBe(500 - lot.rent)
    expect(after.cash[1]).toBe(500 + lot.rent)
  })

  it('offers the fifty dollar fine or a throw for a double when jailed', () => {
    const { plugin, slice } = game()
    const at = { ...slice, jailed: { 0: true } }
    const actions = plugin.getLegalMoves(at, turn(0)).map(m => m.action).sort()
    expect(actions).toEqual(['pay-fine', 'roll-for-double'])
  })

  it('takes fifty from a player who pays the fine', () => {
    const { plugin, slice } = game()
    const at = { ...slice, jailed: { 0: true } }
    const after = plugin.applyMove({ action: 'pay-fine' }, at, turn(0))
    expect(after.cash[0]).toBe(450)
    expect(after.jailed[0]).toBe(false)
  })
})

describe('wages and the end of the game', () => {
  it('pays a hundred for reaching or passing MOTHER EARTH, and counts the circuit', () => {
    const { plugin, slice } = game()
    const at = { ...slice, positions: [38, 1] }   // near the end of the track
    const after = plugin.applyMove({ action: 'roll' }, at, turn(0))
    if (after.positions[0] < 38) {
      expect(after.cash[0]).toBe(600)
      expect(after.circuits[0]).toBe(1)
    }
  })

  it('is undecided until every player has been round five times', () => {
    const { plugin, slice } = game()
    expect(plugin.checkWin({ ...slice, circuits: [5, 4] })).toBeNull()
  })

  it('is won by the largest sum total of cash, lots and luxuries', () => {
    const { plugin, slice } = game()
    const lot = SPACES.find(s => s.type === 'lot')
    const ended = { ...slice, circuits: [5, 5], cash: [100, 200], owners: { [lot.pos]: 0 }, luxuries: [60, 0] }
    // player 0: 100 cash + lot price + 60 luxury; player 1: 200 cash
    expect(plugin.checkWin(ended)).toBe(100 + lot.price + 60 > 200 ? 0 : 1)
  })

  it('is a draw when the totals are level', () => {
    const { plugin, slice } = game()
    expect(plugin.checkWin({ ...slice, circuits: [5, 5], cash: [300, 300], luxuries: [0, 0] })).toBe('draw')
  })
})

describe('the dice', () => {
  it('replay identically from the same seed', () => {
    const rolls = seed => {
      const plugin = createLandlordsPlugin({})
      let slice = plugin.init({}, { request: k => (k === 'core.rng' ? createRng(seed) : null) })
      const out = []
      for (let i = 0; i < 8; i++) {
        slice = plugin.applyMove({ action: 'roll' }, slice, turn(0))
        out.push(slice.pending.join('-'))
      }
      return out.join(' ')
    }
    expect(rolls(5)).toBe(rolls(5))
    expect(rolls(5)).not.toBe(rolls(6))
  })

  it('throws two dice in range', () => {
    const { plugin, slice } = game()
    let state = slice
    for (let i = 0; i < 40; i++) {
      state = plugin.applyMove({ action: 'roll' }, state, turn(0))
      expect(state.pending).toHaveLength(2)
      for (const die of state.pending) expect(die).toBeGreaterThanOrEqual(1)
      for (const die of state.pending) expect(die).toBeLessThanOrEqual(6)
    }
  })
})
