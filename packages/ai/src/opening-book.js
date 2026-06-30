export function createOpeningBook(bookData = {}) {
  function probe(positionKey, variant = null) {
    if (variant && bookData[variant]) {
      const variantMoves = bookData[variant][positionKey]
      if (variantMoves && Array.isArray(variantMoves) && variantMoves.length > 0) {
        return variantMoves[Math.floor(Math.random() * variantMoves.length)]
      }
    }

    const standard = bookData.standard || bookData
    if (!standard || typeof standard !== 'object') return null

    const moves = standard[positionKey]
    if (!moves || !Array.isArray(moves) || moves.length === 0) return null

    return moves[Math.floor(Math.random() * moves.length)]
  }

  function hasPosition(positionKey, variant = null) {
    const book = variant && bookData[variant] ? bookData[variant] : bookData.standard || bookData
    if (!book || typeof book !== 'object') return false
    return Array.isArray(book[positionKey]) && book[positionKey].length > 0
  }

  function getAllMoves(positionKey, variant = null) {
    const book = variant && bookData[variant] ? bookData[variant] : bookData.standard || bookData
    if (!book || typeof book !== 'object') return []
    return book[positionKey] || []
  }

  function getVariants() {
    return Object.keys(bookData)
  }

  return { probe, hasPosition, getAllMoves, getVariants }
}
