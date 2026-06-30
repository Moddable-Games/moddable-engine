import { floodFill, getGroup, hasPath, findPatterns } from './traversal.js'

export function bindTraversal(topology) {
  const getNeighbours = coord => topology.neighbours(coord)

  topology.floodFill = (start, predicate) =>
    floodFill(start, predicate, getNeighbours)

  topology.getGroup = (start, predicate) =>
    getGroup(start, predicate, getNeighbours)

  topology.hasPath = (startSet, endPredicate, traversePredicate) =>
    hasPath(startSet, endPredicate, traversePredicate, getNeighbours)

  topology.findPatterns = (cells, patterns, getOccupant, player) =>
    findPatterns(cells, patterns, getOccupant, player, getNeighbours)

  return topology
}
