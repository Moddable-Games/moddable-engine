import { createTimer } from '../src/timer.js'

describe('timer', () => {
  test('elapsed starts at 0', () => {
    const t = createTimer()
    expect(t.elapsed()).toBe(0)
  })

  test('start + elapsed accumulates time', async () => {
    const t = createTimer()
    t.start()
    await new Promise(r => setTimeout(r, 50))
    expect(t.elapsed()).toBeGreaterThan(30)
  })

  test('pause stops accumulation', async () => {
    const t = createTimer()
    t.start()
    await new Promise(r => setTimeout(r, 50))
    t.pause()
    const e1 = t.elapsed()
    await new Promise(r => setTimeout(r, 50))
    const e2 = t.elapsed()
    expect(e2).toBe(e1)
  })

  test('resume continues from paused state', async () => {
    const t = createTimer()
    t.start()
    await new Promise(r => setTimeout(r, 30))
    t.pause()
    const paused = t.elapsed()
    t.resume()
    await new Promise(r => setTimeout(r, 30))
    expect(t.elapsed()).toBeGreaterThan(paused)
  })

  test('reset sets elapsed to 0', async () => {
    const t = createTimer()
    t.start()
    await new Promise(r => setTimeout(r, 30))
    t.pause()
    t.reset()
    expect(t.elapsed()).toBe(0)
  })

  test('snapshot and restore', async () => {
    const t = createTimer()
    t.start()
    await new Promise(r => setTimeout(r, 50))
    t.pause()
    const snap = t.snapshot()

    const t2 = createTimer()
    t2.restore(snap)
    expect(t2.elapsed()).toBe(snap.accumulated)
  })

  test('checkExpiry fires handler when elapsed exceeds threshold', async () => {
    const t = createTimer()
    let fired = false
    t.onExpiry(30, () => { fired = true })
    t.start()
    await new Promise(r => setTimeout(r, 50))
    t.checkExpiry()
    expect(fired).toBe(true)
  })

  test('checkExpiry does not fire before threshold', () => {
    const t = createTimer()
    let fired = false
    t.onExpiry(1000, () => { fired = true })
    t.checkExpiry()
    expect(fired).toBe(false)
  })
})
