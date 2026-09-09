const { test, expect } = require('@playwright/test')

const BASE = process.env.BASE_URL || 'http://localhost:80/MODDABLE/moddable-engine'

// Four specs listened for pageerror and printed it. A printed error is one
// nobody reads: `Cannot read properties of null (reading 'getAvailableActions')`
// had been appearing in CI logs and local runs without failing anything.
//
// The cause: renderActions guards `if (!session) return`, but the session's own
// actions() reached a controller that does not exist until start() runs. It
// shows on a seat change, which rebuilds the session, and not on a plain load -
// which is why a spec that only loads pages does not catch it, and this one
// changes a seat.

const PAGES = [
  ['play page, no variant', '/play/'],
  ['play page, a family', '/play/?family=chess'],
  ['play page, a variant', '/play/?family=chess&variant=standard'],
  ['play page, a drop game', '/play/?family=shogi&variant=standard'],
  ['board gallery', '/boards/'],
]

for (const [name, path] of PAGES) {
  test(`${name} loads without throwing`, async ({ page }) => {
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    await page.goto(BASE + path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    expect(errors).toEqual([])
  })
}

test('changing seat with an AI opponent does not throw', async ({ page }) => {
  const errors = []
  page.on('pageerror', err => errors.push(err.message))

  await page.goto(`${BASE}/play/?family=chess&variant=standard`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-sq]', { timeout: 15000 })

  const opponent = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Opponent' }) }).locator('select')
  await opponent.selectOption('ai')
  const seat = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Play as' }) }).locator('select')
  await seat.selectOption('1')
  await page.waitForTimeout(6000)

  expect(errors).toEqual([])
})
