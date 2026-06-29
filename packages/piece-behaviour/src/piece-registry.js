export function createPieceRegistry() {
  const pieces = new Map()

  function register(name, definition) {
    if (!definition.genMoves || typeof definition.genMoves !== 'function') {
      throw new Error(`Piece "${name}" must have a genMoves function`)
    }
    pieces.set(name, { name, ...definition })
  }

  function get(name) {
    return pieces.get(name) || null
  }

  function has(name) {
    return pieces.has(name)
  }

  function getAll() {
    return [...pieces.values()]
  }

  function genMoves(name, topology, from, board, context) {
    const piece = pieces.get(name)
    if (!piece) return []
    return piece.genMoves(topology, from, board, context)
  }

  return { register, get, has, getAll, genMoves }
}
