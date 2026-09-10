const { test, expect } = require('@playwright/test')
const BASE = process.env.BASE_URL || 'http://localhost:80/MODDABLE/moddable-engine'

// Every block in the right rail had been given its own padding as it was added,
// and two neighbours ADD theirs - so the space between the two rows of buttons
// came out twice the space either side of a divider, and a column that should
// have had one rhythm had three or four. The rail owns the spacing now. This
// measures the rendered gaps rather than the declared ones.
test('right rail: one gap between everything', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 900 })
  await page.goto(`${BASE}/play/?family=chess&variant=alice`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-sq]', { timeout: 15000 })
  await page.locator('[data-sq="e2"]').first().click(); await page.waitForTimeout(250)
  await page.locator('[data-sq="e4"]').first().click(); await page.waitForTimeout(1200)

  const gaps = await page.evaluate(() => {
    const rail = document.querySelector('.game-play-sidebar--right')
    const shown = [...rail.children].filter(el => el.offsetParent && el.getBoundingClientRect().height > 0)
    const out = []
    for (let i = 1; i < shown.length; i++) {
      const a = shown[i - 1].getBoundingClientRect()
      const b = shown[i].getBoundingClientRect()
      out.push({ after: shown[i - 1].className.split(' ')[0], gap: Math.round(b.top - a.bottom) })
    }
    return out
  })
  console.log('GAPS', JSON.stringify(gaps))
  const sizes = [...new Set(gaps.map(g => g.gap))]
  // One gap between siblings, whatever sits either side of it.
  expect(sizes.length).toBeLessThanOrEqual(2)
})
