import { builtinBoards } from './builtins.js'
import { createBoard } from './board.js'

export function createBoardRegistry(custom = {}) {
  const factories = { ...builtinBoards, ...custom }

  function create(type, params = {}) {
    const factory = factories[type]
    if (!factory) throw new Error(`Unknown board type: ${type}`)
    return createBoard(factory(params))
  }

  function list() {
    return Object.keys(factories)
  }

  function register(type, factory) {
    factories[type] = factory
  }

  return { create, list, register }
}
