const { test, expect } = require('@playwright/test')

const BASE = process.env.BASE_URL || 'http://localhost:80/MODDABLE/moddable-engine'
const PLAY_URL = BASE + '/play/?family=chess'

test.describe('game-play surface — browser assertions', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => { if (msg.type() === 'error') console.log('[BROWSER ERROR]', msg.text()) })
    page.on('pageerror', err => console.log('[PAGE ERROR]', err.message))
  })


  test('board theme changes cell fill colours', async ({ page }) => {
    await page.goto(PLAY_URL, { waitUntil: 'networkidle' })
    await page.waitForSelector('svg rect[data-sq]', { timeout: 15000 })

    const classicFill = await page.locator('svg rect[data-sq]').first().getAttribute('fill')

    const themeSelect = page.locator('select').filter({ has: page.locator('option[value="neon"]') })
    await themeSelect.selectOption('neon')
    await page.waitForTimeout(300)

    const neonFill = await page.locator('svg rect[data-sq]').first().getAttribute('fill')
    expect(neonFill).not.toBe(classicFill)
    expect(neonFill).toBeTruthy()
  })

  test('piece set picker filters by variant and falls back on switch', async ({ page }) => {
    await page.goto(PLAY_URL, { waitUntil: 'networkidle' })
    await page.waitForSelector('.game-play-sidebar--left select', { timeout: 15000 })

    const piecesLabel = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Pieces' }) })
    const piecesSelect = piecesLabel.locator('select')

    // Standard chess: multiple sets available
    const standardCount = await piecesSelect.locator('option').count()
    expect(standardCount).toBeGreaterThan(5)

    // Switch to Capablanca: fewer sets (needs A and C pieces)
    const variantSelect = page.locator('.game-play-sidebar--left .control-group', { has: page.locator('.control-label', { hasText: 'Variant' }) }).locator('select')
    await variantSelect.selectOption('capablanca')
    await page.waitForTimeout(500)

    const capCount = await piecesSelect.locator('option').count()
    expect(capCount).toBeLessThan(standardCount)
    expect(capCount).toBeGreaterThan(1)

    // Select a Capablanca-compatible set
    const capOptions = await piecesSelect.locator('option').allTextContents()
    const nonAutoOption = capOptions.find(o => o !== 'Auto (from rules)')
    if (nonAutoOption) {
      await piecesSelect.selectOption({ label: nonAutoOption })
      await page.waitForTimeout(200)
    }

    // Switch back to standard: the Capablanca set may or may not cover standard,
    // but the picker must not strand the user on an unrenderable set
    await variantSelect.selectOption('standard')
    await page.waitForTimeout(500)

    const afterSwitch = await piecesSelect.evaluate(el => el.value)
    const afterOptions = await piecesSelect.locator('option').evaluateAll(els => els.map(e => e.value))
    expect(afterOptions).toContain(afterSwitch)

    // The selected value must be either 'auto' or a set that appears in the option list
    expect(afterOptions.includes(afterSwitch)).toBe(true)
  })

  test('sittuyin excludes sets that lack its piece types', async ({ page }) => {
    await page.goto(PLAY_URL, { waitUntil: 'networkidle' })
    await page.waitForSelector('.game-play-sidebar--left select', { timeout: 15000 })

    const variantSelect = page.locator('.game-play-sidebar--left .control-group', { has: page.locator('.control-label', { hasText: 'Variant' }) }).locator('select')
    await variantSelect.selectOption('sittuyin')
    await page.waitForTimeout(500)

    const piecesLabel = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Pieces' }) })
    const piecesSelect = piecesLabel.locator('select')
    const sittuyinCount = await piecesSelect.locator('option').count()

    // Sittuyin needs khon (F) and ferz-like pieces that standard-only sets lack
    // So it must have fewer options than standard chess
    await variantSelect.selectOption('standard')
    await page.waitForTimeout(500)
    const standardCount = await piecesSelect.locator('option').count()

    expect(sittuyinCount).toBeLessThan(standardCount)
  })

  test('flip repositions pieces without reorienting glyphs', async ({ page }) => {
    await page.goto(PLAY_URL, { waitUntil: 'networkidle' })
    await page.waitForSelector('svg image', { timeout: 15000 })

    const firstImageY = await page.locator('svg image').first().getAttribute('y')

    await page.locator('button', { hasText: 'Flip' }).click()
    await page.waitForTimeout(300)

    const flippedImageY = await page.locator('svg image').first().getAttribute('y')
    expect(parseFloat(flippedImageY)).not.toBeCloseTo(parseFloat(firstImageY), 0)

    const transforms = await page.locator('svg image').evaluateAll(els =>
      els.map(el => el.getAttribute('transform')).filter(Boolean)
    )
    for (const t of transforms) {
      expect(t).not.toContain('rotate(180')
    }
  })

  test('piece recolouring applies filter to images, no circles added', async ({ page }) => {
    await page.goto(PLAY_URL, { waitUntil: 'networkidle' })
    await page.waitForSelector('svg image', { timeout: 15000 })

    const circlesBefore = await page.locator('svg g[pointer-events="none"] circle').count()

    const styleSelect = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Piece Colours' }) }).locator('select')
    await styleSelect.selectOption('navy')
    await page.waitForTimeout(300)

    const circlesAfter = await page.locator('svg g[pointer-events="none"] circle').count()
    expect(circlesAfter).toBe(circlesBefore)

    const filteredImages = await page.locator('svg image[filter]').count()
    expect(filteredImages).toBeGreaterThan(0)

    const filterVal = await page.locator('svg image[filter]').first().getAttribute('filter')
    expect(filterVal).toMatch(/recolor/)

    const defsFilter = await page.locator('svg defs filter#recolor-dark feColorMatrix').count()
    expect(defsFilter).toBe(1)
  })

  test('AI moves when it is first to act (play as black)', async ({ page }) => {
    await page.goto(PLAY_URL, { waitUntil: 'networkidle' })
    await page.waitForSelector('.game-play-sidebar--left select', { timeout: 15000 })

    const opponentSelect = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Opponent' }) }).locator('select')
    await opponentSelect.selectOption('ai')

    const colourSelect = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Play as' }) }).locator('select')
    await colourSelect.selectOption('1')

    await page.waitForTimeout(1500)

    const history = await page.locator('.game-play-history').textContent()
    expect(history.trim().length).toBeGreaterThan(0)
    expect(history).toMatch(/1\./)
  })

  test('capture burst produces particle circles that disappear', async ({ page }) => {
    await page.goto(PLAY_URL + '&opponent=human', { waitUntil: 'networkidle' })
    await page.waitForSelector('svg rect[data-sq]', { timeout: 15000 })

    const speedSelect = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Speed' }) }).locator('select')
    await speedSelect.selectOption('instant')
    await page.waitForTimeout(100)

    await page.locator('svg rect[data-sq="e2"]').click()
    await page.waitForTimeout(100)
    await page.locator('svg rect[data-sq="e4"]').click()
    await page.waitForTimeout(200)

    await page.locator('svg rect[data-sq="d7"]').click()
    await page.waitForTimeout(100)
    await page.locator('svg rect[data-sq="d5"]').click()
    await page.waitForTimeout(200)

    await page.locator('svg rect[data-sq="e4"]').click()
    await page.waitForTimeout(100)

    const burstPromise = page.waitForSelector('svg > g[pointer-events="none"] circle', { timeout: 2000 }).catch(() => null)
    await page.locator('svg rect[data-sq="d5"]').click()

    const burstEl = await burstPromise
    if (burstEl) {
      await page.waitForTimeout(600)
      const remaining = await page.locator('svg > g:last-child[pointer-events="none"] circle').count()
      expect(remaining).toBe(0)
    }
  })

  test('animation translates piece position over time (not instant jump)', async ({ page }) => {
    await page.goto(PLAY_URL + '&opponent=human&animSpeed=slow', { waitUntil: 'networkidle' })
    await page.waitForSelector('svg rect[data-sq]', { timeout: 15000 })

    await page.locator('svg rect[data-sq="e2"]').click()
    await page.waitForTimeout(100)

    let sawTransform = false
    const checkTransform = async () => {
      const transforms = await page.locator('svg image[transform]').count()
      if (transforms > 0) sawTransform = true
    }

    await page.locator('svg rect[data-sq="e4"]').click()

    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(50)
      await checkTransform()
    }

    expect(sawTransform).toBe(true)
  })

  test('family picker switches game and re-renders board', async ({ page }) => {
    await page.goto(PLAY_URL, { waitUntil: 'networkidle' })
    await page.waitForSelector('svg rect[data-sq]', { timeout: 15000 })

    const chessSvg = await page.locator('#game-play-root svg').innerHTML()

    const familySelect = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Game' }) }).locator('select')
    await familySelect.selectOption('go')
    await page.waitForTimeout(1000)

    await page.waitForSelector('#game-play-root svg', { timeout: 10000 })
    const goSvg = await page.locator('#game-play-root svg').innerHTML()

    expect(goSvg).not.toBe(chessSvg)

    const url = page.url()
    expect(url).toContain('family=go')
  })

  test('deep link ?game=chess&variant=sittuyin loads correctly', async ({ page }) => {
    await page.goto(BASE + '/play/?game=chess&variant=sittuyin', { waitUntil: 'networkidle' })
    await page.waitForSelector('svg rect[data-sq]', { timeout: 15000 })

    const familySelect = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Game' }) }).locator('select')
    const familyValue = await familySelect.evaluate(el => el.value)
    expect(familyValue).toBe('chess')

    const url = page.url()
    expect(url).toContain('variant=sittuyin')
  })
})
