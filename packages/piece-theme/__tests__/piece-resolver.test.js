import { createPieceResolver } from '../index.js'

describe('piece-theme resolver', () => {
  const stoneManifest = {
    id: 'glass-stones',
    name: 'Glass Stones',
    pieces: {
      stone: { element: 'circle', attrs: { r: 14 } },
    },
    owners: {
      black: { fill: '#1a1a1a', stroke: '#000' },
      white: { fill: '#fafafa', stroke: '#999' },
    },
    fallback: { element: 'circle', attrs: { r: 8 } },
  }

  const chessManifest = {
    id: 'classic-chess',
    name: 'Classic Chess',
    pieces: {
      king: { element: 'text', attrs: { 'font-size': 28 }, text: '♔' },
      queen: { element: 'text', attrs: { 'font-size': 28 }, text: '♕' },
      rook: { element: 'text', attrs: { 'font-size': 24 }, text: '♖' },
      bishop: { element: 'text', attrs: { 'font-size': 24 }, text: '♗' },
      knight: { element: 'text', attrs: { 'font-size': 24 }, text: '♘' },
      pawn: { element: 'text', attrs: { 'font-size': 20 }, text: '♙' },
    },
    owners: {
      white: { fill: '#ffffff', stroke: '#333' },
      black: { fill: '#1c1c1c', stroke: '#888' },
    },
    fallback: { element: 'circle', attrs: { r: 10 } },
  }

  describe('resolve(pieceType, owner)', () => {
    it('returns merged element + attrs + owner style for stone', () => {
      const resolver = createPieceResolver(stoneManifest)
      const result = resolver.resolve('stone', 'black')
      expect(result).toEqual({
        element: 'circle',
        text: null,
        attrs: { r: 14, fill: '#1a1a1a', stroke: '#000' },
      })
    })

    it('returns merged element + attrs + owner style for white stone', () => {
      const resolver = createPieceResolver(stoneManifest)
      const result = resolver.resolve('stone', 'white')
      expect(result).toEqual({
        element: 'circle',
        text: null,
        attrs: { r: 14, fill: '#fafafa', stroke: '#999' },
      })
    })

    it('resolves text-based pieces (chess king)', () => {
      const resolver = createPieceResolver(chessManifest)
      const result = resolver.resolve('king', 'white')
      expect(result).toEqual({
        element: 'text',
        text: '♔',
        attrs: { 'font-size': 28, fill: '#ffffff', stroke: '#333' },
      })
    })

    it('uses fallback for unknown piece type', () => {
      const resolver = createPieceResolver(stoneManifest)
      const result = resolver.resolve('unknown', 'black')
      expect(result).toEqual({
        element: 'circle',
        text: null,
        attrs: { r: 8, fill: '#1a1a1a', stroke: '#000' },
      })
    })

    it('uses empty style for unknown owner', () => {
      const resolver = createPieceResolver(stoneManifest)
      const result = resolver.resolve('stone', 'red')
      expect(result).toEqual({
        element: 'circle',
        text: null,
        attrs: { r: 14 },
      })
    })
  })

  describe('fallback manifest (collection composition)', () => {
    it('falls through to fallback manifest for missing pieces', () => {
      const primary = {
        id: 'partial',
        name: 'Partial Set',
        pieces: { king: { element: 'text', attrs: {}, text: 'K' } },
        owners: { white: { fill: '#fff' } },
      }
      const fallback = {
        id: 'fallback',
        name: 'Fallback',
        pieces: { queen: { element: 'text', attrs: {}, text: 'Q' } },
        owners: { white: { fill: '#eee' }, black: { fill: '#111' } },
        fallback: { element: 'circle', attrs: { r: 6 } },
      }
      const resolver = createPieceResolver(primary, { fallbackManifest: fallback })

      const king = resolver.resolve('king', 'white')
      expect(king.text).toBe('K')
      expect(king.attrs.fill).toBe('#fff')

      const queen = resolver.resolve('queen', 'white')
      expect(queen.text).toBe('Q')
      expect(queen.attrs.fill).toBe('#fff')
    })

    it('falls through to fallback owner style when primary lacks it', () => {
      const primary = {
        id: 'p',
        pieces: { stone: { element: 'circle', attrs: { r: 10 } } },
        owners: { white: { fill: '#fff' } },
      }
      const fallback = {
        id: 'f',
        pieces: {},
        owners: { black: { fill: '#000' } },
      }
      const resolver = createPieceResolver(primary, { fallbackManifest: fallback })
      const result = resolver.resolve('stone', 'black')
      expect(result.attrs.fill).toBe('#000')
    })
  })

  describe('sourceManifests (composable virtual sets)', () => {
    const primary = {
      id: 'fairy-complete',
      pieces: {
        king: { element: 'text', attrs: {}, text: 'K' },
        dabbaba: { source: 'fairy-source', as: 'dabbaba' },
      },
      owners: { white: { fill: '#fff' }, black: { fill: '#000' } },
      fallback: { element: 'circle', attrs: { r: 6 } },
    }
    const fairySource = {
      id: 'fairy-source',
      pieces: {
        dabbaba: { element: 'use', attrs: { href: '#dabbaba' } },
        unicorn: { element: 'use', attrs: { href: '#unicorn' } },
      },
      owners: {},
    }

    it('resolves pieces from sourceManifests via explicit source reference', () => {
      const resolver = createPieceResolver(primary, { sourceManifests: { 'fairy-source': fairySource } })
      const result = resolver.resolve('dabbaba', 'white')
      expect(result.element).toBe('use')
      expect(result.attrs.href).toBe('#dabbaba')
      expect(result.attrs.fill).toBe('#fff')
    })

    it('auto-resolves pieces found in any source manifest', () => {
      const resolver = createPieceResolver(primary, { sourceManifests: { 'fairy-source': fairySource } })
      const result = resolver.resolve('unicorn', 'black')
      expect(result.element).toBe('use')
      expect(result.attrs.href).toBe('#unicorn')
      expect(result.attrs.fill).toBe('#000')
    })

    it('listPieceTypes includes source manifest pieces', () => {
      const resolver = createPieceResolver(primary, { sourceManifests: { 'fairy-source': fairySource } })
      const types = resolver.listPieceTypes()
      expect(types).toContain('king')
      expect(types).toContain('dabbaba')
      expect(types).toContain('unicorn')
    })

    it('primary manifest takes priority over source manifests', () => {
      const resolver = createPieceResolver(primary, { sourceManifests: { 'fairy-source': fairySource } })
      const result = resolver.resolve('king', 'white')
      expect(result.text).toBe('K')
    })
  })

  describe('listPieceTypes()', () => {
    it('returns piece types from manifest', () => {
      const resolver = createPieceResolver(chessManifest)
      expect(resolver.listPieceTypes()).toEqual(['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'])
    })
  })

  describe('listOwners()', () => {
    it('returns owner ids from manifest', () => {
      const resolver = createPieceResolver(stoneManifest)
      expect(resolver.listOwners()).toEqual(['black', 'white'])
    })
  })

  describe('getManifest()', () => {
    it('returns the raw manifest', () => {
      const resolver = createPieceResolver(stoneManifest)
      expect(resolver.getManifest()).toBe(stoneManifest)
    })
  })
})
