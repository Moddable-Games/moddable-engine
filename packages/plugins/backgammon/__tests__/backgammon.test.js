import { createBackgammonPlugin } from '../index.js'
import { createRng } from '../../../core/index.js'
import { boardToSetup } from '../../../play/src/serialise.js'

// Every rule a tables variant switches on in its frontmatter, each shown on a
// position built for it. A position is a plugin whose `setup` is that
// position; the dice are named on the move, as a replayed record names them.

const STANDARD = '0:2W,5:5B,7:3B,11:5W,12:5B,16:3W,18:5W,23:2B'

function build(config = {}, seats = 2) {
  const names = Array.from({ length: seats }, (_, i) => `p${i}`)
  const plugin = createBackgammonPlugin({ setup: STANDARD, ...config }, { definition: { players: { names } } })
  const rng = createRng(7)
  const slice = plugin.init({}, { request: () => rng })
  return { plugin, slice }
}

// Apply a move the way the pipeline does, and fail loudly if it is not legal.
function play(plugin, slice, move) {
  const legal = plugin.getLegalMoves(slice)
  const found = legal.find(m => m.action === move.action && m.from === move.from && m.to === move.to && (move.die === undefined || m.die === move.die))
  if (!found) throw new Error(`illegal ${JSON.stringify(move)}; legal: ${JSON.stringify(legal)}`)
  return plugin.applyMove({ ...found, ...(move.dice ? { dice: move.dice } : {}) }, slice).state
}

// Skip the opening roll: the side to move holds these dice.
function withDice(plugin, slice, dice, seat = slice.toMove) {
  const ready = { ...slice, phase: 'roll', toMove: seat, turns: [1, 1] }
  return play(plugin, ready, { action: 'roll', dice })
}

const steps = (plugin, slice) => plugin.getLegalMoves(slice).map(m => `${m.from}>${m.to}:${m.die}`).sort()

describe('backgammon plugin (engine#150)', () => {
  describe('the opening', () => {
    test('each side rolls one die and the higher plays both', () => {
      const { plugin, slice } = build()
      expect(plugin.getLegalMoves(slice)).toEqual([{ action: 'roll' }])
      const white = play(plugin, slice, { action: 'roll', dice: [5, 2] })
      expect(white.toMove).toBe(0)
      expect(white.dice).toEqual([5, 2])
      const black = play(plugin, slice, { action: 'roll', dice: [2, 5] })
      expect(black.toMove).toBe(1)
      expect(black.dice).toEqual([5, 2])
    })

    test('the loser of the opening roll does not take the turn', () => {
      const { plugin, slice } = build()
      const result = plugin.applyMove({ action: 'roll', dice: [1, 6] }, slice)
      expect(result.continueTurn).toBe(false)
      expect(plugin.turnEffects(result.state)).toEqual({ next: 1 })
    })

    test('the same seed rolls the same game', () => {
      const run = () => {
        const { plugin, slice } = build()
        let s = slice
        const log = []
        for (let i = 0; i < 60 && s.phase !== 'done'; i++) {
          const move = plugin.getLegalMoves(s)[0]
          s = plugin.applyMove(move, s).state
          log.push(plugin.describeMove(move, null, s))
        }
        return log
      }
      expect(run()).toEqual(run())
    })
  })

  describe('moving and hitting', () => {
    test('a roll offers each die to each checker that can use it', () => {
      const { plugin, slice } = build()
      const s = withDice(plugin, slice, [3, 1], 0)
      // White's 24-point is point-1 on the track and it moves up it.
      expect(steps(plugin, s)).toContain('point-1>point-4:3')
      expect(steps(plugin, s)).toContain('point-1>point-2:1')
      // Black holds point-13 with five: closed.
      expect(steps(plugin, s)).not.toContain('point-12>point-13:1')
    })

    test('a doublet is four moves and the turn continues until they are used', () => {
      const { plugin, slice } = build()
      let s = withDice(plugin, slice, [2, 2], 0)
      expect(s.dice).toEqual([2, 2, 2, 2])
      for (let i = 0; i < 3; i++) {
        const r = plugin.applyMove(plugin.getLegalMoves(s)[0], s)
        expect(r.continueTurn).toBe(true)
        s = r.state
      }
      const last = plugin.applyMove(plugin.getLegalMoves(s)[0], s)
      expect(last.continueTurn).toBe(false)
      expect(last.state.toMove).toBe(1)
      expect(plugin.getLegalMoves(last.state)[0]).toEqual({ action: 'roll' })
    })

    test('landing on a blot sends it to the bar, which must be entered first', () => {
      const { plugin, slice } = build({ setup: '0:2W,3:1B,20:2B' })
      let s = withDice(plugin, slice, [3, 5], 0)
      const before = s
      s = play(plugin, s, { from: 'point-1', to: 'point-4', die: 3 })
      expect(s.board['point-4']).toMatchObject({ side: 0, count: 1 })
      expect(s.board['bar-1']).toMatchObject({ side: 1, count: 1 })
      // Written as White counts: from its 24-point to its 21-point, hitting.
      expect(plugin.describeMove({ from: 'point-1', to: 'point-4', die: 3 }, before, s)).toBe('24/21*')
      // Black to roll: nothing moves but the checker on the bar.
      s = { ...s, phase: 'roll', toMove: 1, dice: [] }
      s = play(plugin, s, { action: 'roll', dice: [6, 1] })
      expect(plugin.getLegalMoves(s).every(m => m.from === 'bar-1')).toBe(true)
    })

    test('a checker on the bar that cannot enter forfeits the turn', () => {
      // White holds the two points Black's roll would enter on.
      const { plugin, slice } = build({ setup: '20:2W,21:2W,0:2W,bar:1B,2:2B' })
      const ready = { ...slice, phase: 'roll', toMove: 1, turns: [1, 1] }
      const r = plugin.applyMove({ action: 'roll', dice: [3, 4] }, ready)
      expect(r.continueTurn).toBe(false)
      expect(r.state.toMove).toBe(0)
      expect(plugin.describeMove({ action: 'roll' }, ready, r.state)).toBe('roll 3-4, no move')
    })

    test('both dice must be played when both can be', () => {
      // White's lone checker on point-1: playing the 6 first to point-7 leaves
      // the 5 closed at point-12, so only 5-then-6 uses both dice.
      const { plugin, slice } = build({ setup: '0:1W,6:2B,11:2B,23:2B' })
      const s = withDice(plugin, slice, [6, 5], 0)
      expect(steps(plugin, s)).toEqual(['point-1>point-6:5'])
    })

    test('where only one die can be played, it is the larger', () => {
      // Either die alone is playable, never both: the 6 must be played.
      const { plugin, slice } = build({ setup: '0:1W,7:2B,11:2B,12:2B,23:2B' })
      const s = withDice(plugin, slice, [6, 1], 0)
      expect(steps(plugin, s)).toEqual(['point-1>point-7:6'])
    })
  })

  describe('bearing off', () => {
    test('a checker comes off by the exact die, or from the highest point by a larger one', () => {
      const { plugin, slice } = build({ setup: '20:1W,22:1W,0:1B' })
      const s = withDice(plugin, slice, [6, 2], 0)
      // point-21 is White's 4-point, point-23 its 2-point.
      expect(steps(plugin, s)).toEqual(expect.arrayContaining(['point-21>off:6', 'point-23>off:2']))
      expect(steps(plugin, s)).not.toContain('point-23>off:6')
    })

    test('nothing comes off while a checker is outside home', () => {
      const { plugin, slice } = build({ setup: '10:1W,22:1W,0:1B' })
      const s = withDice(plugin, slice, [2, 1], 0)
      expect(steps(plugin, s).some(m => m.includes('>off'))).toBe(false)
    })

    test('the last checker off wins, a backgammon if the loser has none off and one in the winner\'s home', () => {
      const { plugin, slice } = build({ setup: '23:1W,20:1B,off:14W' })
      let s = withDice(plugin, slice, [1, 3], 0)
      // The last checker off plays the whole roll, and which die took it is
      // not asked.
      expect(steps(plugin, s)).toEqual(['point-24>off:1'])
      s = play(plugin, s, { from: 'point-24', to: 'off', die: 1 })
      expect(s.phase).toBe('done')
      expect(s.result).toMatchObject({ winner: 0, kind: 'backgammon', points: 3 })
      expect(plugin.checkWin(s)).toBe(0)
    })

    test('without backgammons a gammon is the most a game pays', () => {
      const { plugin, slice } = build({ setup: '23:1W,20:1B,off:14W', backgammons: false })
      let s = withDice(plugin, slice, [1, 3], 0)
      s = play(plugin, s, { from: 'point-24', to: 'off' })
      expect(s.result).toMatchObject({ kind: 'gammon', points: 2 })
    })
  })

  describe('the doubling cube', () => {
    test('is offered before rolling, and answered by the other side', () => {
      const { plugin, slice } = build({ doublingCube: true })
      const s = { ...slice, phase: 'roll', toMove: 0 }
      expect(plugin.getLegalMoves(s)).toEqual([{ action: 'roll' }, { action: 'double' }])
      const offered = plugin.applyMove({ action: 'double' }, s)
      expect(offered.continueTurn).toBe(false)
      expect(offered.state.toMove).toBe(1)
      expect(plugin.getLegalMoves(offered.state)).toEqual([{ action: 'take' }, { action: 'drop' }])
    })

    test('a take doubles the stake and hands the cube over; only its owner redoubles', () => {
      const { plugin, slice } = build({ doublingCube: true })
      let s = play(plugin, { ...slice, phase: 'roll', toMove: 0 }, { action: 'double' })
      s = play(plugin, s, { action: 'take' })
      expect(s).toMatchObject({ cube: 2, cubeOwner: 1, toMove: 0, phase: 'roll' })
      expect(plugin.getLegalMoves(s)).toEqual([{ action: 'roll' }])
      expect(plugin.getLegalMoves({ ...s, toMove: 1 })).toEqual([{ action: 'roll' }, { action: 'double' }])
    })

    test('a drop concedes the game at the stake before the double', () => {
      const { plugin, slice } = build({ doublingCube: true })
      let s = play(plugin, { ...slice, phase: 'roll', toMove: 0, cube: 2, cubeOwner: 0 }, { action: 'double' })
      s = play(plugin, s, { action: 'drop' })
      expect(s.result).toMatchObject({ winner: 0, kind: 'dropped', points: 2 })
    })

    test('is not offered where the variant has none', () => {
      const { plugin, slice } = build()
      expect(plugin.getLegalMoves({ ...slice, phase: 'roll' })).toEqual([{ action: 'roll' }])
    })
  })

  describe('Hypergammon', () => {
    test('three checkers a side, counted from the setup, bear off to win', () => {
      const { plugin, slice } = build({ setup: '23:1W,21:1B,22:1B,off:2W' })
      let s = withDice(plugin, slice, [1, 2], 0)
      s = play(plugin, s, { from: 'point-24', to: 'off' })
      expect(plugin.checkWin(s)).toBe(0)
    })
  })

  describe('Acey-Deucey', () => {
    const ACEY = { setup: 'home:15W,home:15B', aceyDeucey: true, gammons: false }

    test('every checker starts off the board and enters as a hit one does', () => {
      const { plugin, slice } = build(ACEY)
      expect(slice.board['bar-0']).toMatchObject({ count: 15 })
      const s = withDice(plugin, slice, [4, 6], 0)
      expect(steps(plugin, s)).toEqual(['bar-0>point-4:4', 'bar-0>point-6:6'])
    })

    test('1-2 is played, then a doublet of the player\'s choosing, then another roll', () => {
      const { plugin, slice } = build(ACEY)
      let s = withDice(plugin, slice, [1, 2], 0)
      s = play(plugin, s, { from: 'bar-0', to: 'point-1', die: 1 })
      const r = plugin.applyMove({ from: 'bar-0', to: 'point-2', die: 2 }, s)
      expect(r.continueTurn).toBe(true)
      s = r.state
      expect(plugin.getLegalMoves(s).map(m => m.action)).toEqual(['choose 1', 'choose 2', 'choose 3', 'choose 4', 'choose 5', 'choose 6'])
      s = play(plugin, s, { action: 'choose 5' })
      expect(s.dice).toEqual([5, 5, 5, 5])
      for (let i = 0; i < 4; i++) s = play(plugin, s, plugin.getLegalMoves(s)[0])
      // The extra roll: the same side rolls again, and may not double on it.
      expect(s.toMove).toBe(0)
      expect(s.phase).toBe('roll')
      expect(plugin.getLegalMoves(s)).toEqual([{ action: 'roll' }])
    })

    test('without the rule, 1-2 is an ordinary roll', () => {
      const { plugin, slice } = build({ setup: 'home:15W,home:15B' })
      let s = withDice(plugin, slice, [1, 2], 0)
      s = play(plugin, s, { from: 'bar-0', to: 'point-1', die: 1 })
      s = play(plugin, s, { from: 'bar-0', to: 'point-2', die: 2 })
      expect(s.toMove).toBe(1)
    })
  })

  describe('Fevga', () => {
    const FEVGA = { setup: '0:15B,12:15W', movement: 'same', start: [12, 0], contact: 'block', firstPast: true, gammons: false }

    test('both sides travel the same way round', () => {
      const { plugin, slice } = build(FEVGA)
      const white = withDice(plugin, slice, [3, 5], 0)
      expect(steps(plugin, white)).toContain('point-13>point-16:3')
      const black = withDice(plugin, slice, [3, 5], 1)
      expect(steps(plugin, black)).toContain('point-1>point-4:3')
    })

    test('a single checker holds a point, and nothing is ever hit', () => {
      const { plugin, slice } = build({ ...FEVGA, firstPast: false, setup: '12:14W,15:1W,0:15B' })
      const s = withDice(plugin, slice, [3, 4], 1)
      // point-16 holds one white checker: closed to Black.
      expect(steps(plugin, s)).not.toContain('point-13>point-16:3')
    })

    test('no second checker leaves the start until the first has passed the opponent\'s', () => {
      const { plugin, slice } = build({ ...FEVGA, setup: '12:14W,16:1W,0:15B' })
      const s = withDice(plugin, slice, [3, 4], 0)
      expect(steps(plugin, s).every(m => m.startsWith('point-17'))).toBe(true)
      const passed = build({ ...FEVGA, setup: '12:14W,2:1W,0:14B,5:1B' })
      const t = withDice(passed.plugin, passed.slice, [3, 4], 0)
      expect(steps(passed.plugin, t).some(m => m.startsWith('point-13'))).toBe(true)
    })
  })

  describe('Nardi', () => {
    const NARDI = { setup: '0:15W,12:15B', movement: 'same', contact: 'block', headLimit: 1, headDoubles: [3, 4, 6], primeLimit: 6, backgammons: false }

    test('one checker leaves the head a turn', () => {
      const { plugin, slice } = build(NARDI)
      let s = withDice(plugin, slice, [5, 2], 0)
      s = play(plugin, s, { from: 'point-1', to: 'point-6', die: 5 })
      expect(steps(plugin, s)).toEqual(['point-6>point-8:2'])
    })

    test('a first roll of 6-6 may take two from the head', () => {
      const { plugin, slice } = build(NARDI)
      let s = play(plugin, { ...slice, phase: 'roll', toMove: 0, turns: [0, 0] }, { action: 'roll', dice: [6, 6] })
      s = play(plugin, s, { from: 'point-1', to: 'point-7', die: 6 })
      expect(steps(plugin, s)).toContain('point-1>point-7:6')
      // Later in the game the exception is gone.
      let later = play(plugin, { ...slice, phase: 'roll', toMove: 0, turns: [3, 3] }, { action: 'roll', dice: [6, 6] })
      later = play(plugin, later, { from: 'point-1', to: 'point-7', die: 6 })
      expect(steps(plugin, later)).not.toContain('point-1>point-7:6')
    })

    test('no six-point block with no opposing checker ahead of it', () => {
      // White holds five in a row in front of all of Black's checkers; the
      // sixth would shut them in.
      const { plugin, slice } = build({ ...NARDI, headLimit: 0, setup: '14:2W,15:2W,16:2W,17:2W,18:2W,20:5W,12:15B' })
      const s = withDice(plugin, slice, [1, 1], 0)
      expect(steps(plugin, s)).not.toContain('point-19>point-20:1')
      expect(steps(plugin, s)).toContain('point-21>point-22:1')
      // With one Black checker already past the block, it may be built.
      const ahead = build({ ...NARDI, headLimit: 0, setup: '14:2W,15:2W,16:2W,17:2W,18:2W,20:5W,12:14B,3:1B' })
      const t = withDice(ahead.plugin, ahead.slice, [1, 1], 0)
      expect(steps(ahead.plugin, t)).toContain('point-19>point-20:1')
    })
  })

  describe('Plakoto', () => {
    const PLAKOTO = { setup: '0:15B,23:15W', start: [23, 0], contact: 'pin', pinStartWins: true, gammons: false }

    test('landing on a blot pins it beneath, and a pinned checker cannot move', () => {
      const { plugin, slice } = build({ ...PLAKOTO, setup: '23:14W,21:1W,0:14B,18:1B' })
      let s = withDice(plugin, slice, [3, 5], 0)
      s = play(plugin, s, { from: 'point-22', to: 'point-19', die: 3 })
      expect(s.board['point-19']).toMatchObject({ side: 0, count: 1, under: 1 })
      expect(s.board['bar-1']).toBeNull()
      const black = withDice(plugin, s, [1, 2], 1)
      expect(steps(plugin, black).some(m => m.startsWith('point-19'))).toBe(false)
      // Nor may Black land on its own pinned checker.
      expect(steps(plugin, black).some(m => m.endsWith('point-19:1') || m.includes('>point-19:'))).toBe(false)
    })

    test('the pinned checker is freed when its captor leaves', () => {
      const { plugin, slice } = build({ ...PLAKOTO, setup: '23:14W,18:1W/B,0:14B' })
      expect(slice.board['point-19']).toMatchObject({ side: 0, count: 1, under: 1 })
      let s = withDice(plugin, slice, [2, 1], 0)
      s = play(plugin, s, { from: 'point-19', to: 'point-17', die: 2 })
      expect(s.board['point-19']).toMatchObject({ side: 1, count: 1 })
      expect(s.board['point-19'].under).toBeUndefined()
    })

    test('pinning the opponent\'s last checker on its starting point wins', () => {
      const { plugin, slice } = build({ ...PLAKOTO, setup: '23:13W,2:1W,0:1B,10:14B' })
      let s = withDice(plugin, slice, [2, 5], 0)
      s = play(plugin, s, { from: 'point-3', to: 'point-1', die: 2 })
      expect(s.result).toMatchObject({ winner: 0, kind: 'pinned', points: 2 })
      expect(plugin.checkWin(s)).toBe(0)
    })

    test('a pinned checker is written beneath its captor for the board', () => {
      const s = { board: { 'point-6': { type: 'checker', owner: 0, side: 0, count: 2, under: 1 } }, off: [0, 0] }
      expect(boardToSetup(s, { type: 'track' })).toBe('5:2W/B,off:0W,off:0B')
    })
  })

  describe('Chouette', () => {
    test('the box plays a rotating captain, and every game settles every player against the box', () => {
      const { plugin, slice } = build({ doublingCube: true, cubeOwner: 'box', games: 2, setup: '23:1W,1:1B,off:14W,off:14B' }, 4)
      expect(slice).toMatchObject({ sides: [0, 1], line: [2, 3], cubeOwner: 0 })
      // The captain (Black) wins the first game: the box pays each of three.
      let s = withDice(plugin, slice, [2, 1], 1)
      s = play(plugin, s, { from: 'point-2', to: 'off', die: 2 })
      expect(s.scores).toEqual([-3, 1, 1, 1])
      expect(s.scores.reduce((a, b) => a + b, 0)).toBe(0)
      // The captain takes the box; the old box joins the back of the queue.
      expect(s).toMatchObject({ game: 2, sides: [1, 2], line: [3, 0], phase: 'opening', toMove: 1 })
      expect(plugin.checkWin(s)).toBeNull()
      expect(plugin.describeSeat(s, 1)).toContain('box')
      // The new box wins the last game, and the session is over.
      s = withDice(plugin, s, [1, 3], 1)
      s = play(plugin, s, { from: 'point-24', to: 'off' })
      expect(s.phase).toBe('done')
      expect(s.scores).toEqual([-4, 4, 0, 0])
      expect(plugin.checkWin(s)).toBe(1)
    })
  })

  describe('chance and the AI', () => {
    test('every fall of the dice is an outcome, and together they are certain', () => {
      const { plugin, slice } = build()
      const opening = plugin.chanceOutcomes({ action: 'roll' }, slice)
      expect(opening).toHaveLength(30)
      expect(opening.reduce((a, o) => a + o.probability, 0)).toBeCloseTo(1)
      const later = plugin.chanceOutcomes({ action: 'roll' }, { ...slice, phase: 'roll' })
      expect(later).toHaveLength(21)
      expect(later.reduce((a, o) => a + o.probability, 0)).toBeCloseTo(1)
      expect(plugin.chanceOutcomes({ from: 'point-1', to: 'point-4', die: 3 }, slice)).toBeNull()
    })

    test('the policy picks a legal move in every phase', () => {
      const { plugin, slice } = build({ doublingCube: true })
      let s = slice
      for (let i = 0; i < 400 && s.phase !== 'done'; i++) {
        const moves = plugin.getLegalMoves(s)
        const move = plugin.policy(s, s.toMove, moves, { difficulty: 'medium' })
        expect(moves).toContainEqual(move)
        s = plugin.applyMove(move, s).state
      }
    })

    test('the policy hits a blot it can reach rather than leave it', () => {
      const { plugin, slice } = build({ setup: '0:2W,11:5W,16:3W,18:5W,3:1B,23:2B,12:5B,7:3B,5:4B' })
      const s = withDice(plugin, slice, [3, 6], 0)
      const move = plugin.policy(s, 0, plugin.getLegalMoves(s), { difficulty: 'medium' })
      expect(move.to).toBe('point-4')
    })
  })
})
