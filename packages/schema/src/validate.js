const REQUIRED_FIELDS = ['title', 'slug', 'parent', 'players']
const REQUIRED_ENGINE_FIELDS = []

export function validate(meta, topologySchemas = []) {
  const errors = []
  const schemaMap = new Map(topologySchemas.map(s => [s.type, s]))

  for (const field of REQUIRED_FIELDS) {
    if (meta[field] === undefined || meta[field] === null || meta[field] === '') {
      errors.push({ field, message: `required field "${field}" is missing` })
    }
  }

  if (!meta.engine) {
    errors.push({ field: 'engine', message: 'engine block is required for game definitions' })
    return { valid: false, errors }
  }

  const engine = meta.engine

  for (const field of REQUIRED_ENGINE_FIELDS) {
    if (engine[field] === undefined) {
      errors.push({ field: `engine.${field}`, message: `required field "engine.${field}" is missing` })
    }
  }

  if (engine.topology) {
    const topo = engine.topology
    if (!topo.type) {
      errors.push({ field: 'engine.topology.type', message: 'topology type is required' })
    } else if (schemaMap.has(topo.type)) {
      const topoSchema = schemaMap.get(topo.type)
      for (const field of topoSchema.required) {
        if (topo[field] === undefined) {
          errors.push({ field: `engine.topology.${field}`, message: `"${field}" is required for topology type "${topo.type}"` })
        }
      }
    } else if (topologySchemas.length > 0) {
      const known = topologySchemas.map(s => s.type).join(', ')
      errors.push({ field: 'engine.topology.type', message: `unknown topology type "${topo.type}", must be one of: ${known}` })
    }
  }

  if (engine.players !== undefined) {
    if (!Array.isArray(engine.players) || engine.players.length < 1) {
      errors.push({ field: 'engine.players', message: 'engine.players must be a non-empty array' })
    }
  }

  if (engine.pieces !== undefined) {
    if (!Array.isArray(engine.pieces)) {
      errors.push({ field: 'engine.pieces', message: 'engine.pieces must be an array' })
    } else {
      for (let i = 0; i < engine.pieces.length; i++) {
        const piece = engine.pieces[i]
        if (!piece.name) {
          errors.push({ field: `engine.pieces[${i}].name`, message: 'piece must have a name' })
        }
        if (!piece.movement) {
          errors.push({ field: `engine.pieces[${i}].movement`, message: 'piece must have a movement definition' })
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
