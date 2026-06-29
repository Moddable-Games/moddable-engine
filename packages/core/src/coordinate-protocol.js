const REQUIRED_METHODS = ['neighbours', 'isValid', 'toJSON', 'fromJSON', 'distance']

export const CoordinateProtocol = Object.freeze({
  neighbours: 'neighbours',
  isValid: 'isValid',
  toJSON: 'toJSON',
  fromJSON: 'fromJSON',
  distance: 'distance',
})

export function assertImplements(topology) {
  if (!topology || typeof topology !== 'object') {
    throw new Error('Topology must be an object')
  }
  const missing = REQUIRED_METHODS.filter(m => typeof topology[m] !== 'function')
  if (missing.length > 0) {
    throw new Error(`Topology missing required methods: ${missing.join(', ')}`)
  }
}
