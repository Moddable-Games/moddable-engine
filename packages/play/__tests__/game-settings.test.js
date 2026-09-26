import { settingsFor, applySettings } from '../src/game-settings.js'

// engine#184. A variant says what a player may choose before it starts - the
// number of seats its deal allows, and any option its plugin block declares -
// and choosing sets the key the plugin already reads.

const PRESIDENT = {
  players: ['player1', 'player2', 'player3', 'player4'],
  deal: { minPlayers: 4, maxPlayers: 8, defaultPlayers: 4, perPlayer: 'all' },
  plugins: {
    'standard-52': {
      game: 'climbing',
      rounds: 'open',
      options: { rounds: { label: 'Rounds', values: ['open', 3, 5, 10] } },
    },
  },
}

describe('game settings', () => {
  test('a deal with a range of players offers them, and a declared option its values', () => {
    const settings = settingsFor(PRESIDENT, 'standard-52')
    expect(settings.map(s => s.key)).toEqual(['players', 'rounds'])
    expect(settings[0].values).toEqual([4, 5, 6, 7, 8])
    expect(settings[0].value).toBe(4)
    expect(settings[1]).toMatchObject({ label: 'Rounds', values: ['open', 3, 5, 10], value: 'open' })
  })

  test('a fixed number of players offers no choice', () => {
    const big2 = { players: ['a', 'b', 'c', 'd'], deal: { minPlayers: 4, maxPlayers: 4 }, plugins: { 'standard-52': { game: 'climbing' } } }
    expect(settingsFor(big2, 'standard-52')).toEqual([])
  })

  test('choosing seats that many players and sets the key the plugin reads, as the frontmatter wrote it', () => {
    const played = applySettings(PRESIDENT, 'standard-52', { players: '6', rounds: '5' })
    expect(played.players).toEqual(['player1', 'player2', 'player3', 'player4', 'player5', 'player6'])
    expect(played.plugins['standard-52'].rounds).toBe(5)
    expect(played.plugins['standard-52'].game).toBe('climbing')
    // The variant it was given is not edited.
    expect(PRESIDENT.players).toHaveLength(4)
    expect(PRESIDENT.plugins['standard-52'].rounds).toBe('open')
  })

  test('a value the variant does not offer is ignored', () => {
    const played = applySettings(PRESIDENT, 'standard-52', { players: 12, rounds: 7 })
    expect(played.players).toHaveLength(4)
    expect(played.plugins?.['standard-52'].rounds).toBe('open')
  })
})
