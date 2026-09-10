const { test, expect } = require('@playwright/test')
const BASE = process.env.BASE_URL || 'http://localhost:80/MODDABLE/moddable-engine'

// engine#159. A game on more than one board draws each in its own <g data-layer>,
// which puts the pieces group a grandchild of the svg rather than a child of it.
// The fog and highlight overlay was inserted relative to the svg, so it threw
// "Child to insert before is not a child of this node" and aborted the draw
// half-finished: Alice Chess showed both boards until the first click and one of
// them afterwards, and loading it straight from a URL failed outright.

test('alice loads by url and keeps both boards through a move', async ({ page }) => {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${BASE}/play/?family=chess&variant=alice`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-sq]', { timeout: 15000 })

  const boards = async () => page.evaluate(() =>
    document.querySelectorAll('#game-play-root g[data-layer]').length)
  const sq = async () => page.evaluate(() =>
    document.querySelectorAll('#game-play-root [data-sq]').length)

  expect(await boards()).toBe(2)
  const before = await sq()

  await page.locator('[data-sq="e2"]').first().click()
  await page.waitForTimeout(400)
  expect(await boards()).toBe(2)          // board B must survive the click
  await page.locator('[data-sq="e4"]').first().click()
  await page.waitForTimeout(800)
  expect(await boards()).toBe(2)
  expect(await sq()).toBe(before)
  expect(errors).toEqual([])

  // The rule made visible: a pawn played to e4 does not stay there. It
  // transfers to the matching square on the other board, so the piece belongs
  // to `e4-2` and `e4` is left empty.
  const pieceAt = (id) => page.evaluate((sel) => {
    const cell = document.querySelector(`#game-play-root [data-sq="${sel}"]`)
    if (!cell) return 'no-cell'
    const box = cell.getBoundingClientRect()
    const imgs = [...document.querySelectorAll('#game-play-root image')]
    return imgs.some(im => {
      const b = im.getBoundingClientRect()
      return Math.abs((b.left + b.width / 2) - (box.left + box.width / 2)) < box.width / 2 &&
             Math.abs((b.top + b.height / 2) - (box.top + box.height / 2)) < box.height / 2
    }) ? 'piece' : 'empty'
  }, id)

  expect(await pieceAt('e4')).toBe('empty')
  expect(await pieceAt('e4-2')).toBe('piece')
})

// Reported from the play page: after the first move the highlights appeared on
// the other board. The overlay had been placed inside a layer's group, so
// everything it drew inherited that board's translate - and getBBox reports a
// cell's own coordinates, which ignore the transform, so board B's squares gave
// board A's positions.
test('the selection marker lands on the square that was clicked', async ({ page }) => {
  await page.goto(`${BASE}/play/?family=chess&variant=alice`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-sq]', { timeout: 15000 })
  await page.locator('[data-sq="e2"]').first().click()
  await page.waitForTimeout(300)
  await page.locator('[data-sq="e4"]').first().click()
  await page.waitForTimeout(1200)
  await page.locator('[data-sq="d2"]').first().click()
  await page.waitForTimeout(500)

  const result = await page.evaluate(() => {
    const root = document.querySelector('#game-play-root')
    const cell = root.querySelector('[data-sq="d2"]')
    const cb = cell.getBoundingClientRect()
    const marks = [...root.querySelectorAll('rect')].filter(r => {
      const f = (r.getAttribute('fill') || '').toLowerCase()
      return f && f !== 'none' && !r.hasAttribute('data-sq')
    })
    const near = marks.filter(m => {
      const b = m.getBoundingClientRect()
      return Math.abs((b.left+b.width/2)-(cb.left+cb.width/2)) < cb.width &&
             Math.abs((b.top+b.height/2)-(cb.top+cb.height/2)) < cb.height
    })
    return { markers: marks.length, nearClicked: near.length }
  })
  console.log('MARKERS', JSON.stringify(result))
  expect(result.nearClicked).toBeGreaterThan(0)
})
