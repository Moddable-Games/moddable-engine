export function resolveOrder(rules) {
  const idMap = new Map()
  for (const rule of rules) {
    idMap.set(rule.id, rule)
  }

  const inDegree = new Map()
  const adjList = new Map()

  for (const rule of rules) {
    if (!inDegree.has(rule.id)) inDegree.set(rule.id, 0)
    if (!adjList.has(rule.id)) adjList.set(rule.id, [])

    const deps = rule.requires || []
    for (const dep of deps) {
      if (!idMap.has(dep)) {
        throw new Error(`Rule "${rule.id}" requires "${dep}" which is not in the rule set`)
      }
      if (!adjList.has(dep)) adjList.set(dep, [])
      adjList.get(dep).push(rule.id)
      inDegree.set(rule.id, (inDegree.get(rule.id) || 0) + 1)
    }
  }

  const queue = []
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id)
  }

  const sorted = []
  while (queue.length > 0) {
    const id = queue.shift()
    sorted.push(id)
    for (const dependent of adjList.get(id) || []) {
      const newDegree = inDegree.get(dependent) - 1
      inDegree.set(dependent, newDegree)
      if (newDegree === 0) queue.push(dependent)
    }
  }

  if (sorted.length !== rules.length) {
    const missing = rules.filter(r => !sorted.includes(r.id)).map(r => r.id)
    throw new Error(`Circular dependency detected among rules: ${missing.join(', ')}`)
  }

  return sorted.map(id => idMap.get(id))
}

export function validateTopologyNeeds(rules, topology) {
  for (const rule of rules) {
    const needs = rule.topologyNeeds || []
    for (const method of needs) {
      if (!topology || typeof topology[method] !== 'function') {
        throw new Error(
          `Rule "${rule.id}" requires topology method "${method}" but it is not available`
        )
      }
    }
  }
}
