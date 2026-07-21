import { register } from './registry.js'
import { createGridTopology, schema as gridSchema } from './grid/index.js'
import { createHexTopology, schema as hexSchema } from './hex/index.js'
import { createTrackTopology, schema as trackSchema } from './track/index.js'
import { createPitTopology, schema as pitSchema } from './pit/index.js'
import { createGraphTopology, schema as graphSchema } from './graph/index.js'
import { createTableauTopology, schema as tableauSchema } from './tableau/index.js'

register('grid', { factory: createGridTopology, schema: gridSchema })
register('hex', { factory: createHexTopology, schema: hexSchema })
register('track', { factory: createTrackTopology, schema: trackSchema })
register('pit', { factory: createPitTopology, schema: pitSchema })
register('graph', { factory: createGraphTopology, schema: graphSchema })
register('tableau', { factory: createTableauTopology, schema: tableauSchema })

export { register, get, has, create, getAll, getTypes, clear } from './registry.js'
export { createGridTopology, gridSchema }
export { createHexTopology, hexSchema }
export { createTrackTopology, trackSchema }
export { createPitTopology, pitSchema }
export { createGraphTopology, graphSchema }
export { createTableauTopology, tableauSchema }
