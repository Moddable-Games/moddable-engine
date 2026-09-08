const { test, expect } = require('@playwright/test')
const BASE = (process.env.BASE_URL || 'http://localhost:80/MODDABLE/moddable-engine') + '/play/'

// The status line under the board. The old board renderer had one; the
// interactive session never wired it up, so a player could see a piece and have
// no way to learn what it was called. Everything it says is read from the live
// position and the plugin's vocabulary - nothing is written down anywhere.
test.describe('board status line', () => {
  test('names the square and what is standing on it', async ({ page }) => {
    await page.goto(`${BASE}?family=chess&variant=congo&opponent=human`)
    await page.waitForSelector('#game-play-root [data-sq]', { timeout: 20000 })
    await page.waitForTimeout(1200)
    await page.locator('#game-play-root [data-sq="d1"]').first().hover()
    await expect(page.locator('#info-text')).toHaveText(/d1.*Lion/i)
    await page.locator('#game-play-root [data-sq="d4"]').first().hover()
    await expect(page.locator('#info-text')).toHaveText(/d4.*empty/i)
  })

  test('says what a square is to the piece already selected', async ({ page }) => {
    await page.goto(`${BASE}?family=chess&variant=congo&opponent=human`)
    await page.waitForSelector('#game-play-root [data-sq]', { timeout: 20000 })
    await page.waitForTimeout(1200)
    await page.locator('#game-play-root [data-sq="d2"]').first().click()
    await page.waitForTimeout(250)
    await page.locator('#game-play-root [data-sq="d3"]').first().hover()
    await expect(page.locator('#info-text')).toHaveText(/move here/i)
  })

  test('names pieces in a family that is not chess', async ({ page }) => {
    await page.goto(`${BASE}?family=shogi&variant=standard&opponent=human`)
    await page.waitForSelector('#game-play-root [data-sq]', { timeout: 20000 })
    await page.waitForTimeout(1200)
    const cells = await page.locator('#game-play-root [data-sq]').evaluateAll(
      els => els.map(e => e.getAttribute('data-sq')).filter(Boolean))
    let named = 0
    for (const sq of cells.slice(0, 30)) {
      await page.locator(`#game-play-root [data-sq="${sq}"]`).first().hover()
      const text = (await page.locator('#info-text').textContent()) || ''
      if (/·/.test(text) && !/empty/.test(text)) named += 1
    }
    expect(named).toBeGreaterThan(0)
  })
})
