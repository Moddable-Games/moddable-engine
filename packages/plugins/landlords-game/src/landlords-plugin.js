import { warnUnknownConfigKeys } from '../../../core/index.js'
import BOARDS from '../../../../data/landlords-game-boards.json' with { type: 'json' }

export const CONFIG_KEYS = new Set([
  'board', 'circuits', 'content', 'dice', 'jailFine', 'legacy', 'luxuryValue',
  'playerCount', 'positions', 'setup', 'startingCash', 'ticketsDrawn', 'wages',
])

// The Landlord's Game, Elizabeth Magie 1904, from US Patent 748,626 - the
// board Monopoly was traced from thirty years later.
//
// This models the 1904 ruleset, which is the one with complete rules and no
// card decks: two dice, wages for reaching or passing MOTHER EARTH, and a rule
// per space type. The later boards use Chance decks and broker spaces that are
// not transcribed, so they are declared unsupported rather than approximated.
//
// Not modelled, and declared in the corpus rather than silently missing:
// borrowing against property, player-to-player loans, the rules for a second
// and third player occupying the same lot, and the railroad pass a double
// grants. Each needs state or a negotiation this does not carry.
export function createLandlordsPlugin(variantConfig = {}, context = {}) {
  const defaults = {
    playerCount: 2,
    board: '1904-patent',
    startingCash: 500,
    wages: 100,          // collected on reaching or passing MOTHER EARTH
    jailFine: 50,
    legacy: 100,
    luxuryValue: 60,     // a luxury ticket costs its fee and scores this at the end
    circuits: 5,         // the game ends when every player has been round five times
    ticketsDrawn: 12,    // of the 22 lot tickets, before play begins
    dice: 2,
  }

  const config = { ...defaults, ...variantConfig }
  warnUnknownConfigKeys('landlords', variantConfig, CONFIG_KEYS)

  const boardKey = config.content?.board || config.board
  const spaces = (BOARDS.boards[boardKey]?.spaces || []).slice().sort((a, b) => a.pos - b.pos)
  const size = spaces.length
  const startPos = spaces.find(s => /MOTHER EARTH|WAGES/i.test(s.name))?.pos ?? 1
  const jailPos = spaces.find(s => s.type === 'jail' || /^JAIL$/i.test(s.name))?.pos ?? null

  const at = pos => spaces.find(s => s.pos === pos) || null

  // The dice come from the seeded generator the game was built with, so a game
  // replays identically from its seed. Captured at init because applyMove is
  // handed the move and the state, not the services.
  let rng = null
  const currentPlayer = full => (full && full.__players ? full.__players.currentIndex : 0)

  function rollFor() {
    const die = () => 1 + Math.floor((rng ? rng.next() : 0.5) * 6)
    const values = []
    for (let i = 0; i < config.dice; i++) values.push(die())
    return values
  }

  function isDouble(values) {
    return values.length === 2 && values[0] === values[1]
  }

  // Money moves between players and the Public Treasury; nothing is created
  // except wages and legacies, which come from the Wages box. Kept as one
  // helper so every payment is accounted the same way.
  function pay(state, from, amount, to = null) {
    const cash = [...state.cash]
    const paid = Math.min(cash[from], amount)
    cash[from] -= paid
    if (to !== null && to !== from) cash[to] += paid
    else if (to === null) state.treasury += paid
    return { ...state, cash, shortfall: amount - paid }
  }

  // What landing on a space does. Returns the new slice; the caller has already
  // moved the checker.
  function resolveLanding(slice, player) {
    const space = at(slice.positions[player])
    if (!space) return slice
    let next = { ...slice, cash: [...slice.cash] }

    // The board carries NO TRESPASSING twice: once as its own type, and once
    // as a corner whose role says what it does. Both send the player to jail,
    // and reading only the type meant the corner did nothing at all.
    const sendsToJail = space.type === 'go-to-jail' || space.role === 'go-to-jail'
    if (sendsToJail && jailPos !== null) {
      next.positions = [...next.positions]
      next.positions[player] = jailPos
      next.jailed = { ...next.jailed, [player]: true }
      return next
    }

    switch (space.type) {
      case 'lot': {
        const owner = next.owners[space.pos]
        if (owner === undefined || owner === null) break   // buying is a separate, optional move
        if (owner !== player) next = pay(next, player, space.rent || 0, owner)
        break
      }
      case 'necessity':
      case 'taxes':
        next = pay(next, player, space.tax || 0, null)
        break
      case 'railroad':
        next = pay(next, player, space.fare || 0, null)
        break
      case 'franchise': {
        const holder = next.charters[space.pos]
        if (holder === undefined || holder === null) next.charters = { ...next.charters, [space.pos]: player }
        else if (holder !== player) next = pay(next, player, space.fee || 0, holder)
        break
      }
      case 'legacy':
        next.cash[player] += space.receive || config.legacy
        break
      // corner spaces and the public park ask nothing; luxury is optional and
      // offered as its own move rather than charged on arrival.
      default:
        break
    }
    return next
  }

  function wealth(slice, player) {
    let total = slice.cash[player]
    for (const space of spaces) {
      if (slice.owners[space.pos] === player) total += space.price || 0
    }
    // luxuries already hold their end value, taken from the space
    total += slice.luxuries[player] || 0
    return total
  }

  return {
    sliceName: 'landlords',
    // `applyMove` returns a new slice and does not touch the one it is handed,
    // so the search does not have to hand it a private copy. Proved rather than
    // asserted: `applymove-is-pure.test.js` plays every playable variant and
    // fails if any of them changes the slice it was given.
    pureApplyMove: true,
    pieceTypes: ['checker'],
    vocabulary: { checker: { symbols: { 0: 'r', 1: 'b', 2: 'g', 3: 'y' } } },
    config,
    rules: ['dice.move', 'property.rent', 'treasury'],

    init(pluginConfig, { request } = {}) {
      rng = request ? request('core.rng') : null
      const count = config.playerCount
      return {
        board: Object.fromEntries(spaces.map(s => [s.pos, null])),
        positions: new Array(count).fill(startPos),
        cash: new Array(count).fill(config.startingCash),
        owners: {},              // lot pos -> player
        charters: {},            // franchise pos -> player
        luxuries: new Array(count).fill(0),
        circuits: new Array(count).fill(0),
        jailed: {},
        treasury: 0,
        pending: null,           // the dice from the last roll, for the interface
        _size: size,
        _spaces: spaces.length,
      }
    },

    getLegalMoves(slice, full) {
      const player = currentPlayer(full)
      if (slice.circuits[player] >= config.circuits) return [{ action: 'pass' }]

      if (slice.jailed[player]) {
        const moves = [{ action: 'roll-for-double' }]
        if (slice.cash[player] >= config.jailFine) moves.push({ action: 'pay-fine' })
        return moves
      }

      const space = at(slice.positions[player])
      const moves = [{ action: 'roll' }]

      // Buying and taking a luxury are choices the player makes while standing
      // on the space, so they are moves rather than something that happens to
      // them on arrival.
      if (space?.type === 'lot' && slice.owners[space.pos] == null
          && space.price && slice.cash[player] >= space.price) {
        moves.push({ action: 'buy', pos: space.pos })
      }
      // A luxury costs what the space says in `tax` and scores `endValue` at
      // the end. Reading `fee` here, as the franchise spaces use, meant the
      // move was never offered at all.
      if (space?.type === 'luxury' && space.tax && slice.cash[player] >= space.tax) {
        moves.push({ action: 'take-luxury', pos: space.pos })
      }
      return moves
    },

    validateMove(move, slice, full) {
      if (move.action === 'resign') return true
      return this.getLegalMoves(slice, full).some(m => m.action === move.action && m.pos === move.pos)
    },

    applyMove(move, slice, full) {
      const player = currentPlayer(full)
      let next = { ...slice, cash: [...slice.cash], positions: [...slice.positions] }

      if (move.action === 'pass') return next

      if (move.action === 'buy') {
        const space = at(move.pos)
        next = pay(next, player, space.price || 0, null)
        next.owners = { ...next.owners, [move.pos]: player }
        return next
      }

      if (move.action === 'take-luxury') {
        const space = at(move.pos)
        next = pay(next, player, space.tax || 0, null)
        next.luxuries = [...next.luxuries]
        next.luxuries[player] += space.endValue || config.luxuryValue
        return next
      }

      if (move.action === 'pay-fine') {
        next = pay(next, player, config.jailFine, null)
        next.jailed = { ...next.jailed, [player]: false }
        return next
      }

      const values = rollFor()
      if (move.action === 'roll-for-double') {
        if (isDouble(values)) next.jailed = { ...next.jailed, [player]: false }
        return { ...next, pending: values }
      }

      // An ordinary roll: move, count a circuit and collect wages if MOTHER
      // EARTH was reached or passed, then resolve the space.
      const steps = values.reduce((a, b) => a + b, 0)
      const from = next.positions[player]
      const to = ((from - 1 + steps) % size) + 1
      const passedStart = from + steps > size || to === startPos
      next.positions[player] = to
      if (passedStart) {
        next.cash[player] += config.wages
        next.circuits = [...next.circuits]
        next.circuits[player]++
      }
      next.pending = values
      return resolveLanding(next, player)
    },

    // What the move log says. Without this a turn read only "roll": the dice
    // were rolled inside applyMove and never shown, and the checker moved
    // without saying from where, to where, or what it cost - so a player could
    // watch a whole game and see none of it. The interface has no business
    // knowing about dice, so the plugin says it in words instead.
    describeMove(move, prev, next, seatIndex) {
      if (!next) return null
      // The seat is passed in: describeMove is handed slices, and a slice has
      // no `__players` to read the mover from.
      const seat = Number.isInteger(seatIndex) ? seatIndex : 0
      if (move.action === 'buy') {
        const space = at(move.pos)
        return `buy ${space ? space.name : move.pos} (${space && space.price ? '$' + space.price : 'no price'})`
      }
      if (move.action === 'take-luxury') {
        const space = at(move.pos)
        return `luxury ${space ? space.name : move.pos}`
      }
      if (move.action === 'pay-fine') return `pay fine $${config.jailFine}`
      if (move.action === 'pass') return 'pass'

      const dice = Array.isArray(next.pending) ? next.pending : null
      const roll = dice ? dice.join('+') : '?'
      if (move.action === 'roll-for-double') {
        const freed = prev && prev.jailed && prev.jailed[seat] && !(next.jailed && next.jailed[seat])
        return `roll ${roll} in jail${freed ? ' - out' : ''}`
      }
      if (move.action !== 'roll') return move.action

      const from = prev && Array.isArray(prev.positions) ? prev.positions[seat] : null
      const to = Array.isArray(next.positions) ? next.positions[seat] : null
      const before = prev && Array.isArray(prev.cash) ? prev.cash[seat] : null
      const after = Array.isArray(next.cash) ? next.cash[seat] : null
      const delta = (before !== null && after !== null) ? after - before : 0
      const money = delta === 0 ? '' : ` ${delta > 0 ? '+' : '-'}$${Math.abs(delta)}`
      // NO TRESPASSING moves the checker on again after it lands, so the square
      // it finished on is not the square the dice sent it to. Naming only the
      // last one read as though the dice had done something they had not.
      const steps = dice ? dice.reduce((a, b) => a + b, 0) : null
      const landed = (from !== null && steps !== null) ? ((from - 1 + steps) % size) + 1 : to
      const nameOf = pos => (at(pos) ? at(pos).name : String(pos))
      const trail = (landed !== to && to !== null)
        ? `${landed} ${nameOf(landed)} to ${to} ${nameOf(to)}`
        : `${to} ${nameOf(to)}`
      return `roll ${roll}: ${from} to ${trail}${money}`
    },

    checkWin(slice) {
      const done = slice.circuits.every(c => c >= config.circuits)
      if (!done) return null
      const scores = slice.cash.map((_, p) => wealth(slice, p))
      const best = Math.max(...scores)
      const leaders = scores.map((s, p) => [s, p]).filter(([s]) => s === best)
      return leaders.length === 1 ? leaders[0][1] : 'draw'
    },
  }
}

createLandlordsPlugin.interaction = 'roll'
createLandlordsPlugin.configKeys = CONFIG_KEYS

// Checkers sit on numbered track spaces, and the board is drawn from the
// perimeter board data rather than as a grid of piece images.
