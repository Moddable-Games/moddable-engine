import '../test-helpers/setup-rules-reader.js'
import { readFileSync } from 'fs'
import { join } from 'path'
import { renderStateAsSvg, cardArtwork } from '../src/render-helper.js'
import { createGameForFamily } from '../src/play.js'
import { findFamilyPlugin } from '../src/find-plugin.js'
import { createDeck } from '../../component-deck/index.js'

const ROOT = join(process.cwd())
const gallery = JSON.parse(readFileSync(join(ROOT, 'pieces', 'gallery-index.json'), 'utf8'))
const images = (svg) => (svg.match(/<image\b/g) || []).length

// engine#196. The SDK drew with a renderer of its own that knew a lettered disc
// and nothing a variant declares: Backgammon came back with no checkers and
// every card, tile and dice game threw. It now draws the way the play page does.
describe('renderStateAsSvg', () => {
  it('draws the chess opening with its piece set', () => {
    const svg = renderStateAsSvg('chess', null, { gallery })
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(images(svg)).toBe(32)
  })

  it('draws the position after a move, not the opening', () => {
    const game = createGameForFamily('chess', { rngSeed: 1 })
    const move = game.getLegalMoves().find(m => m.from === 52 && m.to === 36)
    game.applyMove(move)
    const before = renderStateAsSvg('chess', null, { gallery })
    const after = renderStateAsSvg('chess', game.getState(), { gallery })
    expect(images(after)).toBe(32)
    expect(after).not.toEqual(before)
  })

  it('draws every Backgammon checker the state holds', () => {
    const game = createGameForFamily('backgammon', { variant: 'standard', rngSeed: 1 })
    const board = game.getState().slice.board
    const checkers = Object.values(board).reduce((n, c) => n + (c ? c.count : 0), 0)
    expect(checkers).toBe(30)
    expect(images(renderStateAsSvg('backgammon', game.getState(), { variant: 'standard', gallery }))).toBe(checkers)
  })

  it('draws a card table, showing the seat its own hand', () => {
    const game = createGameForFamily('standard-52', { variant: 'hearts', rngSeed: 1 })
    const plugin = findFamilyPlugin(game.raw.registry.getPlugins(), 'standard-52')
    const hand = plugin.projectForSeat(game.getState().slice, 0).hands[0]
    const svg = renderStateAsSvg('standard-52', game.getState(), { variant: 'hearts', gallery, assetBase: 'https://engine.moddable.games/' })
    const art = cardArtwork('standard-52', { variant: 'hearts', gallery, assetBase: 'https://engine.moddable.games/' })
    for (const id of hand) expect(svg).toContain(art.cardUrl(plugin.cardOf(id)))
  })

  it('reads a hosted family from its host plugin', () => {
    expect(images(renderStateAsSvg('tafl', null, { variant: 'brandubh', gallery }))).toBe(13)
  })

  it('marks cells by id on any board, and by index on a grid', () => {
    const morris = renderStateAsSvg('morris', null, { variant: 'nine-mens-morris', gallery, highlights: ['n1', { key: 'n2', color: '#ff0000' }] })
    expect((morris.match(/class="highlight"/g) || []).length).toBe(2)
    expect(morris).toContain('#ff0000')
    const chess = renderStateAsSvg('chess', null, { gallery, highlights: [{ key: 52, color: '#00ff00' }] })
    expect(chess).toMatch(/<rect[^>]*fill="#00ff00"[^>]*class="highlight"/)
  })

  it('asks for the gallery rather than drawing a board with no pieces', () => {
    expect(() => renderStateAsSvg('chess')).toThrow(/gallery/)
  })

  it('asks for a board data file rather than drawing an empty board', () => {
    expect(() => renderStateAsSvg('landlords-game')).toThrow(/landlords-game-boards\.json/)
    const content = JSON.parse(readFileSync(join(ROOT, 'data', 'landlords-game-boards.json'), 'utf8'))
    const svg = renderStateAsSvg('landlords-game', null, { content, gallery })
    expect((svg.match(/data-sq=/g) || []).length).toBe(44)
  })
})

describe('cardArtwork', () => {
  it('resolves cards and the back through the set the family declares', () => {
    const art = cardArtwork('standard-52', { variant: 'hearts', gallery, assetBase: 'https://engine.moddable.games' })
    const ace = createDeck('standard-52').find(c => c.rank === 'A' && c.suit === 'spades')
    expect(art.cardUrl(ace)).toBe('https://engine.moddable.games/pieces/sets/letele-cards/S-A.svg')
    expect(art.backUrl()).toBe('https://engine.moddable.games/pieces/sets/letele-cards/B-1.svg')
  })
})
