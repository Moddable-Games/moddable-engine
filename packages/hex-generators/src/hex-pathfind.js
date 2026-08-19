import { HexMath } from '../../topologies/hex/index.js'

export function pathfind(hexes, from, to, opts = {}) {
  const impassable = opts.impassable || []

  const hexMap = {}
  for (const h of hexes) hexMap[h.q + ',' + h.r] = h

  const startKey = from.q + ',' + from.r
  const endKey = to.q + ',' + to.r

  if (!hexMap[startKey]) return null
  if (!hexMap[endKey]) return null

  const queue = [startKey]
  const visited = { [startKey]: null }

  while (queue.length > 0) {
    const currentKey = queue.shift()
    if (currentKey === endKey) break

    const [cq, cr] = currentKey.split(',').map(Number)
    const neighbors = HexMath.getNeighbors(cq, cr)

    for (const n of neighbors) {
      const nk = n.q + ',' + n.r
      if (visited[nk] !== undefined) continue
      if (!hexMap[nk]) continue
      if (impassable.includes(hexMap[nk].type)) continue
      visited[nk] = currentKey
      queue.push(nk)
    }
  }

  if (visited[endKey] === undefined) {
    return { reachable: false, from, to, path: null }
  }

  const path = []
  let cur = endKey
  while (cur !== null) {
    const [pq, pr] = cur.split(',').map(Number)
    path.unshift({ q: pq, r: pr, type: hexMap[cur].type })
    cur = visited[cur]
  }

  return { reachable: true, from, to, distance: path.length - 1, path }
}
