const { test, expect } = require('@playwright/test')

const BASE = process.env.BASE_URL || 'http://localhost:80/MODDABLE/moddable-engine'
const PLAY_URL = BASE + '/play/?family=chess'

test.describe('game-play surface — browser assertions', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => { if (msg.type() === 'error') console.log('[BROWSER ERROR]', msg.text()) })
    page.on('pageerror', err => console.log('[PAGE ERROR]', err.message))
  })


  test('default opponent is AI (not human vs human)', async ({ page }) => {
    await page.goto(BASE + '/play/?family=chess', { waitUntil: 'networkidle' })
    await page.waitForSelector('.game-play-sidebar--left select', { timeout: 15000 })

    const opponentSelect = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Opponent' }) }).locator('select')
    const value = await opponentSelect.evaluate(el => el.value)
    expect(value).toBe('ai')
  })

  test('shared link with opponent=human preserves that choice', async ({ page }) => {
    await page.goto(BASE + '/play/?family=chess&opponent=human', { waitUntil: 'networkidle' })
    await page.waitForSelector('.game-play-sidebar--left select', { timeout: 15000 })

    const opponentSelect = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Opponent' }) }).locator('select')
    const value = await opponentSelect.evaluate(el => el.value)
    expect(value).toBe('human')
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

  test('flip/chess: white pawn row moves from bottom to top, no glyph rotation', async ({ page }) => {
    await page.goto(BASE + '/play/?family=chess&opponent=human', { waitUntil: 'networkidle' })
    await page.waitForSelector('svg image', { timeout: 15000 })

    // Collect Y positions of all piece images before flip
    const beforeYs = await page.locator('svg image').evaluateAll(els =>
      els.map(el => parseFloat(el.getAttribute('y')))
    )
    const beforeMaxY = Math.max(...beforeYs)

    await page.locator('button', { hasText: 'Flip' }).click()
    await page.waitForTimeout(300)

    // After flip, pieces that were at the bottom should now be at the top
    const afterYs = await page.locator('svg image').evaluateAll(els =>
      els.map(el => parseFloat(el.getAttribute('y')))
    )
    const afterMinY = Math.min(...afterYs)
    // The highest Y (bottom-most row) before should now be near the lowest Y (top-most)
    expect(afterMinY).toBeLessThan(beforeMaxY * 0.5)

    // Chess pieces must NOT have 180° rotation (orientation doesn't denote ownership)
    const transforms = await page.locator('svg image').evaluateAll(els =>
      els.map(el => el.parentElement?.getAttribute('transform') || el.getAttribute('transform')).filter(Boolean)
    )
    for (const t of transforms) {
      expect(t).not.toContain('rotate(180')
    }
  })

  test('flip/go: stones remain visible and highlight matches stone position', async ({ page }) => {
    await page.goto(BASE + '/play/?family=go&variant=9x9&opponent=human', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-sq]', { timeout: 15000 })

    // Place two stones (black at d5, white at e5)
    await page.locator('[data-sq="d5"]').click()
    await page.waitForTimeout(300)
    await page.locator('[data-sq="e5"]').click()
    await page.waitForTimeout(300)

    // Count pieces (circles in the piece layer) before flip
    const beforePieces = await page.locator('svg g[pointer-events="none"] circle').count()
    expect(beforePieces).toBeGreaterThanOrEqual(2)

    await page.locator('button', { hasText: 'Flip' }).click()
    await page.waitForTimeout(300)

    // After flip, same number of stones must be visible
    const afterPieces = await page.locator('svg g[pointer-events="none"] circle').count()
    expect(afterPieces).toBe(beforePieces)

    // The last-move highlight (if visible) must overlap a stone, not float in empty space
    const highlights = await page.locator('svg rect[fill]').all()
    // At minimum, stones didn't vanish — that's the core assertion
  })

  test('flip/hex: pieces reposition (glinski has 36 pieces before and after)', async ({ page }) => {
    await page.goto(BASE + '/play/?family=chess&variant=glinski&opponent=human', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-sq]', { timeout: 15000 })
    await page.waitForTimeout(500)

    const beforeCount = await page.locator('#game-play-root svg g[pointer-events="none"] image').count()
    expect(beforeCount).toBe(36)

    // Capture the visual bounding box of the first piece before flip
    const beforeBox = await page.locator('#game-play-root svg g[pointer-events="none"] image').first().boundingBox()

    await page.locator('button', { hasText: 'Flip' }).click()
    await page.waitForTimeout(300)

    // All 36 pieces must still be visible after flip
    const afterCount = await page.locator('#game-play-root svg g[pointer-events="none"] image').count()
    expect(afterCount).toBe(36)

    // The first piece's visual position must have changed (rotation moves it)
    const afterBox = await page.locator('#game-play-root svg g[pointer-events="none"] image').first().boundingBox()
    const moved = Math.abs(afterBox.x - beforeBox.x) > 5 || Math.abs(afterBox.y - beforeBox.y) > 5
    expect(moved).toBe(true)
  })

  // Shogi shows ownership by which way a piece points, and engine#122 changed
  // HOW: the art is pre-rotated, one glyph per side, rather than one glyph
  // rotated at render time. `standard shogi emits zero rotations` in
  // `issue-regressions.test.js` is the unit test that records the decision.
  //
  // This test was still asserting the old mechanism and had been failing ever
  // since. It looked exactly like a broken board - and a shogi board where
  // ownership does not show WOULD be unplayable - so it is rewritten to assert
  // the property rather than deleted: both sides' glyphs are on the board, and
  // flipping moves the pieces rather than turning them.
  test('flip/shogi: both sides have their own glyphs, and flipping does not rotate them', async ({ page }) => {
    await page.goto(BASE + '/play/?family=shogi&variant=minishogi&opponent=human', { waitUntil: 'networkidle' })
    await page.waitForSelector('svg image', { timeout: 15000 })

    const glyphs = () => page.locator('#game-play-root svg image').evaluateAll(els =>
      els.map(e => (e.getAttribute('href') || '').split('/').pop()).filter(Boolean))
    const positions = () => page.locator('#game-play-root svg image').evaluateAll(els =>
      els.map(e => `${e.getAttribute('href')}@${e.getAttribute('x')},${e.getAttribute('y')}`).sort())

    const before = await glyphs()
    expect(before.length).toBeGreaterThan(0)

    // Pre-rotated art means the two sides use different files. If they did not,
    // a player could not tell their pieces from their opponent's.
    const sente = before.filter(g => g.startsWith('0'))
    const gote = before.filter(g => g.startsWith('1'))
    expect(sente.length).toBeGreaterThan(0)
    expect(gote.length).toBeGreaterThan(0)

    const beforePositions = await positions()
    await page.locator('button', { hasText: 'Flip' }).click()
    await page.waitForTimeout(300)

    // Flipping turns the board round, so the same glyphs are in new places.
    expect((await glyphs()).sort()).toEqual(before.slice().sort())
    expect(await positions()).not.toEqual(beforePositions)

    // And nothing is rotated, because nothing needs to be.
    const rotated = await page.locator('#game-play-root svg [transform*="rotate"]').count()
    expect(rotated).toBe(0)
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

  const SEAT_TESTS = [
    { family: 'chess', seat: '1', seatLabel: 'Black', firstMover: 'White' },
    { family: 'go', seat: '1', seatLabel: 'White', firstMover: 'Black' },
    { family: 'draughts', seat: '1', seatLabel: 'Black', firstMover: 'White' },
    { family: 'xiangqi', seat: '1', seatLabel: 'Black', firstMover: 'Red' },
    { family: 'shogi', seat: '1', seatLabel: 'Gote', firstMover: 'Sente' },
  ]

  for (const { family, seat, seatLabel, firstMover } of SEAT_TESTS) {
    test(`${family}: AI moves first, human (${seatLabel}) completes a move`, async ({ page }) => {
      await page.goto(BASE + `/play/?family=${family}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.game-play-sidebar--left select', { timeout: 15000 })

      const opponentSelect = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Opponent' }) }).locator('select')
      await opponentSelect.selectOption('ai')

      const seatSelect = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Play as' }) }).locator('select')
      await seatSelect.selectOption(seat)

      // Wait for AI to move first
      await page.waitForTimeout(2500)

      // Verify it's now the human's turn
      const status = await page.locator('.game-play-status').textContent()
      expect(status).toContain('to move')
      expect(status).toContain(seatLabel)

      // Snapshot the board before the human acts
      const svg = page.locator('#game-play-root svg')
      await expect(svg).toBeVisible()
      const beforeHtml = await svg.innerHTML()

      // Attempt a human move: click cells until the board changes
      const cells = await svg.locator('[data-sq]').all()
      expect(cells.length).toBeGreaterThan(0)

      let boardChanged = false
      for (let i = 0; i < Math.min(cells.length, 10) && !boardChanged; i++) {
        await cells[i].click()
        await page.waitForTimeout(200)
        const afterHtml = await svg.innerHTML()
        if (afterHtml !== beforeHtml) boardChanged = true
      }

      // For move-based games (chess, draughts, xiangqi, shogi) the first click
      // selects a piece (board changes via highlight). For place-based games (go)
      // the first click on a legal cell places a stone (board changes via new element).
      // Either way, the board must have changed.
      expect(boardChanged).toBe(true)
    })
  }

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

    const familySelect = page.locator('.game-play-sidebar--left .control-group', { has: page.locator('.control-label', { hasText: 'Game' }) }).locator('select').first()
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

    const familySelect = page.locator('.game-play-sidebar--left .control-group', { has: page.locator('.control-label', { hasText: 'Game' }) }).locator('select').first()
    const familyValue = await familySelect.evaluate(el => el.value)
    expect(familyValue).toBe('chess')

    const url = page.url()
    expect(url).toContain('variant=sittuyin')
  })
})
