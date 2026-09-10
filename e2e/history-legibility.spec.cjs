const { test, expect } = require('@playwright/test')
const BASE = process.env.BASE_URL || 'http://localhost:80/MODDABLE/moddable-engine'

// The move history is scrolled to the bottom after every move, and its entries
// wrap to different heights, so the top of the box always cuts one somewhere.
// Cut with nothing to signal it, that reads as broken letters rather than as
// 'there is more above' - and it sits between the two rows of buttons where it
// is the first thing the eye lands on. This holds the two things that fix it.

test('the move history is legible once it overflows', async ({ page }) => {
  await page.goto(`${BASE}/play/?family=chess&variant=standard`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-sq]', { timeout: 15000 })
  // Play enough that the history overflows its box.
  for (let i = 0; i < 14; i++) {
    const cells = await page.locator('#game-play-root [data-sq]').all()
    for (const c of cells) {
      try { await c.click({ timeout: 400 }) } catch { /* not clickable */ }
      break
    }
    await page.waitForTimeout(120)
  }
  const info = await page.evaluate(() => {
    const el = document.querySelector('.game-play-history')
    if (!el) return null
    const cs = getComputedStyle(el)
    return {
      scrollable: el.scrollHeight > el.clientHeight,
      hasMask: (cs.maskImage || cs.webkitMaskImage || 'none') !== 'none',
      snaps: cs.scrollSnapType !== 'none',
    }
  })
  console.log('HISTORY', JSON.stringify(info))
  expect(info).not.toBeNull()
  expect(info.hasMask).toBe(true)
  expect(info.snaps).toBe(true)
})
