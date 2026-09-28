const { test, expect } = require('@playwright/test')

const BASE = process.env.BASE_URL || 'http://localhost:80/MODDABLE/moddable-engine'

// The create page had no browser test at all. engine#118 rebuilt most of it -
// loading any variant losslessly, painting cells, other settings, a piece
// editor with artwork - so each of those is driven here the way a person would.

async function openCreate(page, query = '') {
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  // A fresh page each time: the page keeps the last board in localStorage.
  await page.goto(`${BASE}/create/`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${BASE}/create/${query}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('#board-svg svg', { timeout: 15000 })
  return errors
}

async function exportYaml(page) {
  const download = page.waitForEvent('download')
  await page.click('#export-yaml-btn')
  const file = await download
  const stream = await file.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

test('the page loads and offers every playable family', async ({ page }) => {
  const errors = await openCreate(page)
  const families = await page.$$eval('#family-select option', options => options.map(o => o.value))
  for (const family of ['chess', 'hex', 'mancala', 'morris', 'landlords-game']) expect(families).toContain(family)
  expect(errors).toEqual([])
})

test('a hex variant loads as a template, shows its family and can be tried', async ({ page }) => {
  const errors = await openCreate(page, '?family=hex&variant=standard')
  await expect(page.locator('#family-select')).toHaveValue('hex')
  expect(await page.locator('#board-svg [data-sq]').count()).toBeGreaterThan(20)
  await expect(page.locator('#try-play-btn')).toBeEnabled()
  expect(errors).toEqual([])
})

// "Try in Play" opened the play page on a draft and drew nothing: the page's
// title lookup read a variable that was never declared, a draft has no variant
// file to take a title from, and the throw was caught and logged. No page
// error, no board.
test('a loaded template plays when tried', async ({ page }) => {
  const errors = await openCreate(page, '?family=chess&variant=congo')
  const failures = []
  page.on('console', m => { if (m.type() === 'error' && /load failed/.test(m.text())) failures.push(m.text()) })
  await Promise.all([page.waitForNavigation(), page.click('#try-play-btn')])
  await page.waitForSelector('#game-play-root [data-sq]', { timeout: 15000 })
  expect(await page.locator('#game-play-root [data-sq]').count()).toBe(49)
  expect(failures).toEqual([])
  expect(errors).toEqual([])
})

// The Landlord's Game reads its spaces from a data file the variant names.
// The template and its draft both name the file without its contents, and
// both drew an empty canvas until each fetched it.
test('a board read from a data file draws in the preview and in the draft', async ({ page }) => {
  const errors = await openCreate(page, '?family=landlords-game&variant=1904-original')
  await expect.poll(() => page.locator('#board-svg [data-sq]').count(), { timeout: 15000 }).toBe(44)
  await Promise.all([page.waitForNavigation(), page.click('#try-play-btn')])
  await expect.poll(() => page.locator('#game-play-root [data-sq]').count(), { timeout: 15000 }).toBe(44)
  expect(errors).toEqual([])
})

// Playable is not creatable. A card game plays, and the page has no board to
// build it on: it is not offered, and a link to one says why.
test('only variants that survive the round trip are offered as starting points', async ({ page }) => {
  const errors = await openCreate(page, '?family=standard-52&variant=blackjack')
  await expect(page.locator('#create-status')).toContainText('cannot be built here yet')
  const families = await page.$$eval('#template-family option', os => os.map(o => o.value))
  expect(families).toContain('chess')
  expect(families).not.toContain('standard-52')
  expect(errors).toEqual([])
})

test('a variant the controls do not cover keeps everything in other settings', async ({ page }) => {
  const errors = await openCreate(page, '?family=chess&variant=tandem-chess')
  const settings = await page.$$eval('#extras-panel textarea', areas => areas.map(a => a.value).join('\n'))
  expect(settings).toContain('turnOrder')
  expect(settings).toContain('layerSeats')
  const yaml = await exportYaml(page)
  expect(yaml).toContain('turnOrder:')
  expect(yaml).toContain('capturesTo: partner')
  expect(errors).toEqual([])
})

test('the void brush paints a cell out of the board and into the export', async ({ page }) => {
  const errors = await openCreate(page)
  await page.click('.brush-btn[data-brush="void"]')
  await page.click('#board-svg [data-sq="d4"]')
  const yaml = await exportYaml(page)
  expect(yaml).toMatch(/voids:\s*\n\s*- \[4, 3\]/)
  expect(yaml).toMatch(/zones:\s*\n\s*voids:/)
  expect(errors).toEqual([])
})

test('a piece gets artwork from any set, a Betza movement, and a place in the palette', async ({ page }) => {
  const errors = await openCreate(page)
  await page.fill('#def-name', 'dragon')
  await page.fill('#def-symbol-w', 'D')
  await page.fill('#def-symbol-b', 'd')
  await page.fill('#def-betza', 'NN')
  await page.click('#def-art-w')
  await page.selectOption('#artwork-picker select', 'fluent-emoji')
  await page.click('#artwork-picker .artwork-btn[title="dragon"]')
  await page.click('#def-add-btn')
  const palette = page.locator('#piece-picker .piece-btn img[src*="fluent-emoji/dragon"]')
  await expect(palette.first()).toBeVisible()
  await palette.first().click()
  await page.click('#board-svg [data-sq="d4"]')
  const yaml = await exportYaml(page)
  expect(yaml).toContain('betza: NN')
  expect(yaml).toContain('fluent-emoji/dragon')
  expect(errors).toEqual([])
})
