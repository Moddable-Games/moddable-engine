// Shared cell manipulation utilities for rule implementations.
// Extracted from 7 rule files that had byte-identical copies.

export function getCell(board, pos) {
  if (Array.isArray(board)) return board[pos]
  return board[pos] || null
}

export function setCell(board, pos, value) {
  board[pos] = value
}

export function cloneBoard(board) {
  return Array.isArray(board) ? [...board] : { ...board }
}
