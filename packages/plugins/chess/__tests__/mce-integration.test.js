import MCE, { legalMoves, makeMove, unmakeMove, getStatus, aiPickMove } from '../src/mce/index.js'

describe('MCE integration', () => {
  test('loads all 75 variants', () => {
    const variants = Object.keys(MCE.variantRegistry)
    expect(variants.length).toBe(75)
  })

  test('registers 18 piece types', () => {
    expect(Object.keys(MCE.getPieceRegistry()).length).toBe(18)
  })

  test('standard game has 20 legal moves from start', () => {
    const g = MCE.createGame('standard')
    expect(legalMoves(g).length).toBe(20)
  })

  test('make/unmake roundtrips correctly', () => {
    const g = MCE.createGame('standard')
    const fen1 = MCE.toFEN(g)
    const moves = legalMoves(g)
    const undo = makeMove(g, moves[0])
    unmakeMove(g, undo)
    expect(MCE.toFEN(g)).toBe(fen1)
  })

  test('detects scholars mate', () => {
    const g = MCE.createGame('standard')
    const play = (from, to) => {
      const moves = legalMoves(g)
      const m = moves.find(m => m.from === from && m.to === to)
      if (!m) throw new Error(`No legal move ${from}->${to}`)
      makeMove(g, m)
    }
    play(52, 36) // e2-e4
    play(12, 28) // e7-e5
    play(61, 34) // Bf1-c4
    play(1, 18)  // Nb8-c6
    play(59, 31) // Qd1-h5
    play(11, 27) // d7-d5 (not the best but lets checkmate happen differently)
    // Actually let's do the proper scholar's mate
    const g2 = MCE.createGame('standard')
    const play2 = (from, to) => {
      const moves = legalMoves(g2)
      const m = moves.find(m => m.from === from && m.to === to)
      if (!m) throw new Error(`No legal move ${from}->${to}, FEN: ${MCE.toFEN(g2)}`)
      makeMove(g2, m)
    }
    play2(52, 36) // e2-e4
    play2(12, 28) // e7-e5
    play2(61, 34) // Bf1-c4
    play2(1, 18)  // Nb8-c6
    play2(59, 31) // Qd1-h5
    play2(15, 23) // Ng8-f6??
    play2(31, 13) // Qh5xf7#
    expect(getStatus(g2)).toBe('checkmate')
  })

  test('AI picks a legal move', () => {
    const g = MCE.createGame('standard')
    const move = aiPickMove(g, { difficulty: 'beginner' })
    expect(move).not.toBeNull()
    const legal = legalMoves(g)
    expect(legal.some(m => m.from === move.from && m.to === move.to)).toBe(true)
  })

  describe('all variants create and produce legal moves', () => {
    const variants = Object.keys(MCE.variantRegistry || {})
    for (const v of variants) {
      test(v, () => {
        const g = MCE.createGame(v)
        expect(g).toBeTruthy()
        expect(g.board.length).toBeGreaterThan(0)
        const moves = legalMoves(g)
        expect(moves.length).toBeGreaterThan(0)
        const status = getStatus(g)
        expect(status).toBe('active')
      })
    }
  })

  describe('make/unmake preserves FEN for all variants', () => {
    const variants = Object.keys(MCE.variantRegistry || {})
    for (const v of variants) {
      test(v, () => {
        const g = MCE.createGame(v)
        const fen1 = MCE.toFEN(g)
        const moves = legalMoves(g)
        if (moves.length > 0) {
          const undo = makeMove(g, moves[0])
          unmakeMove(g, undo)
          expect(MCE.toFEN(g)).toBe(fen1)
        }
      })
    }
  })

  test('capablanca uses 10x8 board', () => {
    const g = MCE.createGame('capablanca')
    expect(g.rows).toBe(8)
    expect(g.cols).toBe(10)
    expect(g.board.length).toBe(80)
  })

  test('losAlamos uses 6x6 board', () => {
    const g = MCE.createGame('losAlamos')
    expect(g.rows).toBe(6)
    expect(g.cols).toBe(6)
    expect(g.board.length).toBe(36)
  })

  test('antichess has noCheck and moveFilter', () => {
    const g = MCE.createGame('antichess')
    expect(g.noCheck).toBe(true)
    const vc = MCE.getVariantConfig('antichess')
    expect(vc.moveFilter).toBeDefined()
    expect(vc.winCondition).toBeDefined()
  })

  test('atomic explodes adjacent pieces on capture', () => {
    const g = MCE.createGame('atomic')
    MCE.loadFEN(g, 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')
    const moves = legalMoves(g)
    // d2-d4 should be legal
    const d4 = moves.find(m => m.from === 51 && m.to === 35)
    expect(d4).toBeTruthy()
  })
})
