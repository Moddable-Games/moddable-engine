const { test, expect } = require('@playwright/test')
const BASE = process.env.BASE_URL || 'http://localhost:80/MODDABLE/moddable-engine'

// A set that inherits from a set that itself inherits showed empty tiles for
// everything it inherited: MCE Congo extends MCE Fairy Complete, which extends
// MCE Chess and draws from four other sets, and the gallery followed one level
// and read each inherited file from the wrong folder. A piece Congo replaced
// was listed twice besides. Every set, every tile.
test('every piece in every set draws, and no set lists a piece twice', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto(`${BASE}/pieces/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.set-section')
  await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach(i => { i.loading = 'eager' }))
  await page.waitForFunction(() => [...document.querySelectorAll('.set-section img')].every(i => !i.src || i.complete), null, { timeout: 90000 })

  const problems = await page.evaluate(() => {
    const out = []
    for (const section of document.querySelectorAll('.set-section')) {
      const name = section.querySelector('.set-title')?.textContent.trim()
      const empty = [...section.querySelectorAll('img')].filter(i => i.src && i.naturalWidth === 0).map(i => i.alt)
      const keys = [...section.querySelectorAll('.piece-label')].map(l => l.textContent)
      const twice = keys.filter((k, i) => keys.indexOf(k) !== i)
      if (empty.length) out.push(`${name}: empty ${empty.join(', ')}`)
      if (twice.length) out.push(`${name}: listed twice ${twice.join(', ')}`)
    }
    return out
  })
  expect(problems).toEqual([])
})
