import { readFileSync } from 'fs'
import path from 'path'
import '../../component-deck/index.js'
import { renderFromEngine, attachPieceImages } from '../../render/src/render-engine.js'

const gallery = JSON.parse(readFileSync(path.resolve(process.cwd(), 'pieces/gallery-index.json'), 'utf8'))

// Card artwork reaches the tableau renderer the same way piece artwork reaches
// every other topology: the frontmatter names a set, the gallery resolves it.
function render(resolved) {
  const images = attachPieceImages(resolved, gallery).images || {}
  return renderFromEngine(resolved, { pieceImages: images })
}

describe('topology-tableau render pipeline', () => {
  test('radial layout produces valid SVG with dealt cards', () => {
    const resolved = {
      topology: { type: 'tableau', layout: 'radial', players: 4 },
      surface: { colors: {} },
      render: {},
      pieces: { set: 'letele-cards' },
      components: { deck: { type: 'standard-52' } },
      deal: { minPlayers: 4, maxPlayers: 4, defaultPlayers: 4, perPlayer: 'all', community: 0 },
    }
    const svg = render(resolved)
    expect(svg).not.toBeNull()
    expect(svg).toContain('<svg')
    expect(svg).toContain('data-zone="Player 1')
    expect(svg).toContain('data-zone="Player 2')
    expect(svg).toContain('data-card=')
    expect(svg).toContain('letele-cards')
    expect(svg).toContain('</svg>')
  })

  test('tableau/solitaire layout produces columns and foundations', () => {
    const resolved = {
      topology: { type: 'tableau', layout: 'tableau', columns: 7, cascade: [1, 2, 3, 4, 5, 6, 7], foundations: 4 },
      surface: { colors: {} },
      render: {},
      pieces: { set: 'letele-cards' },
      components: { deck: { type: 'standard-52' } },
      deal: { minPlayers: 1, maxPlayers: 1, defaultPlayers: 1, perPlayer: 0, community: 0, remainder: 'draw', layout: 'tableau', tableau: { columns: 7, cascade: [1, 2, 3, 4, 5, 6, 7] } },
    }
    const svg = render(resolved)
    expect(svg).not.toBeNull()
    expect(svg).toContain('data-zone="Column 1')
    expect(svg).toContain('data-zone="Column 7')
    expect(svg).toContain('Foundation')
    expect(svg).toContain('Stock')
    expect(svg).toContain('data-card=')
  })

  test('wall layout produces mahjong wall and hands', () => {
    const resolved = {
      topology: { type: 'tableau', layout: 'wall', players: 4, wallSegments: 4 },
      surface: { colors: {} },
      render: {},
      pieces: { set: 'mahjong-regular' },
      components: { tiles: { type: 'mahjong-136', total: 136 } },
      deal: { minPlayers: 4, maxPlayers: 4, defaultPlayers: 4, perPlayer: 13, community: 0, remainder: 'wall' },
    }
    const svg = render(resolved)
    expect(svg).not.toBeNull()
    expect(svg).toContain('data-zone="Wall')
    expect(svg).toContain('South (you)')
    expect(svg).toContain('data-card=')
  })

  test('linear layout produces hands and draw pile', () => {
    const resolved = {
      topology: { type: 'tableau', layout: 'linear', players: 2 },
      surface: { colors: {} },
      render: {},
      pieces: { set: 'letele-cards' },
      components: { deck: { type: 'standard-52' } },
      deal: { minPlayers: 2, maxPlayers: 2, defaultPlayers: 2, perPlayer: 'all', community: 0 },
    }
    const svg = render(resolved)
    expect(svg).not.toBeNull()
    expect(svg).toContain('data-zone="Player 1')
    expect(svg).toContain('data-zone="Player 2')
    expect(svg).toContain('data-card=')
  })

  test('poker game config renders 6 players with community cards', () => {
    const resolved = {
      topology: { type: 'tableau', layout: 'radial', players: 6 },
      surface: { name: 'card-table' },
      render: {},
      pieces: { set: 'letele-cards' },
      components: { deck: { type: 'standard-52', jokers: 0 } },
      deal: { minPlayers: 2, maxPlayers: 10, defaultPlayers: 6, perPlayer: 2, community: 5, remainder: 'draw' },
    }
    const svg = render(resolved)
    expect(svg).not.toBeNull()
    expect(svg).toContain('data-zone="Player 1')
    expect(svg).toContain('data-zone="Player 6')
    expect(svg).toContain('Community / Field')
    expect(svg).toContain('Draw pile')
  })
})
