import { createEventBus } from '../src/event-bus.js'

describe('event-bus', () => {
  let bus

  beforeEach(() => { bus = createEventBus() })

  test('on + emit calls handler with payload', () => {
    const calls = []
    bus.on('test', (p) => calls.push(p))
    bus.emit('test', { x: 1 })
    expect(calls).toEqual([{ x: 1 }])
  })

  test('multiple handlers called in order', () => {
    const order = []
    bus.on('e', () => order.push('a'))
    bus.on('e', () => order.push('b'))
    bus.emit('e')
    expect(order).toEqual(['a', 'b'])
  })

  test('off removes handler', () => {
    const calls = []
    const handler = () => calls.push(1)
    bus.on('e', handler)
    bus.off('e', handler)
    bus.emit('e')
    expect(calls).toEqual([])
  })

  test('on returns unsubscribe function', () => {
    const calls = []
    const unsub = bus.on('e', () => calls.push(1))
    unsub()
    bus.emit('e')
    expect(calls).toEqual([])
  })

  test('once fires only once', () => {
    const calls = []
    bus.once('e', () => calls.push(1))
    bus.emit('e')
    bus.emit('e')
    expect(calls).toEqual([1])
  })

  test('clear removes all handlers for event type', () => {
    const calls = []
    bus.on('e', () => calls.push(1))
    bus.clear('e')
    bus.emit('e')
    expect(calls).toEqual([])
  })

  test('clear with no args removes all handlers', () => {
    const calls = []
    bus.on('a', () => calls.push(1))
    bus.on('b', () => calls.push(2))
    bus.clear()
    bus.emit('a')
    bus.emit('b')
    expect(calls).toEqual([])
  })

  test('emit with no listeners does not throw', () => {
    expect(() => bus.emit('nothing', {})).not.toThrow()
  })
})
