/**
 * AI Multi-Ply Verification
 *
 * Plays multiple human moves against the AI and verifies:
 * - The AI responds after every human move
 * - The game doesn't stall mid-game
 * - Both small and large boards work
 *
 * This catches seat-inversion bugs and cache-key issues that
 * single-move tests miss.
 */
const { test, expect } = require('@playwright/test')

const BASE = (process.env.BASE_URL || 'http://localhost:80/MODDABLE/moddable-engine') + '/play/'

function url(family, variant) {
  return `${BASE}?family=${family}&variant=${variant}`
}

async function waitForBoard(page) {
  await page.waitForSelector('[data-sq]', { timeout: 15000 })
}

async function waitForHumanTurn(page, seatLabel, timeout = 20000) {
  await page.waitForFunction(
    (label) => {
      const el = document.querySelector('.game-play-status')
      return el && el.textContent.includes(label) && el.textContent.includes('to move')
    },
    seatLabel,
    { timeout }
  )
}

async function getHistoryLength(page) {
  const el = page.locator('.game-play-history')
  if (await el.count() === 0) return 0
  const text = await el.textContent()
  const moves = text.match(/\d+\./g)
  return moves ? moves.length : 0
}

async function makeHumanMove(page) {
  const occupiedCells = await page.evaluate(() => {
    const svg = document.querySelector('#game-play-root svg')
    if (!svg) return []
    const imgs = svg.querySelectorAll('g[pointer-events="none"] image')
    const cellIds = new Set()
    const cells = svg.querySelectorAll('[data-sq]')
    for (const img of imgs) {
      const ix = parseFloat(img.getAttribute('x') || 0) + parseFloat(img.getAttribute('width') || 0) / 2
      const iy = parseFloat(img.getAttribute('y') || 0) + parseFloat(img.getAttribute('height') || 0) / 2
      for (const cell of cells) {
        const rect = cell.getBBox ? cell.getBBox() : null
        if (!rect) continue
        if (ix >= rect.x && ix <= rect.x + rect.width && iy >= rect.y && iy <= rect.y + rect.height) {
          cellIds.add(cell.getAttribute('data-sq'))
          break
        }
      }
    }
    return [...cellIds]
  })

  for (const id of occupiedCells) {
    // The board re-renders between attempts, which detaches the element this
    // loop is holding. That did not show while every click was forced, because
    // a forced click does not wait for anything. Re-query per attempt, and
    // treat a cell that went away as one to skip rather than a failure: the
    // loop is already trying cells until one of them works.
    const cell = page.locator(`[data-sq="${id}"]`).first()
    try {
      await cell.scrollIntoViewIfNeeded({ timeout: 5000 })
      // A hit target must be clickable on its own merits, so no `force` here.
      await cell.click({ timeout: 10000 })
    } catch (err) {
      if (/not attached|detached|Timeout/i.test(String(err.message))) continue
      throw err
    }
    await page.waitForTimeout(200)

    const indicators = await page.locator('#game-play-root svg circle').count()
    if (indicators > 0) {
      const indicator = page.locator('#game-play-root svg circle').first()
      await indicator.scrollIntoViewIfNeeded({ timeout: 5000 })
      // The indicator is an overlay circle that deliberately carries
      // `pointer-events: none` so the click reaches the cell underneath it, so
      // this one is forced on purpose.
      await indicator.click({ force: true })
      await page.waitForTimeout(200)
      return true
    }
  }
  return false
}

const MULTI_PLY_TESTS = [
  { family: 'chess', variant: 'standard', seat: '0', seatLabel: 'White', plies: 4 },
  { family: 'chess', variant: 'standard', seat: '1', seatLabel: 'Black', plies: 4 },
  { family: 'chess', variant: 'grand', seat: '0', seatLabel: 'White', plies: 3 },
  { family: 'chess', variant: 'grand', seat: '1', seatLabel: 'Black', plies: 3 },
  { family: 'chess', variant: 'turkish-great-chess-iv', seat: '0', seatLabel: 'White', plies: 2, aiWait: 15000 },
  { family: 'chess', variant: 'turkish-great-chess-iv', seat: '1', seatLabel: 'Black', plies: 2, aiWait: 15000 },
]

test.describe('AI multi-ply — AI never stalls', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => { if (msg.type() === 'error') console.log('[BROWSER ERROR]', msg.text()) })
    page.on('pageerror', err => console.log('[PAGE ERROR]', err.message))
  })

  for (const { family, variant, seat, seatLabel, plies, aiWait } of MULTI_PLY_TESTS) {
    test(`${variant} (human=${seatLabel}): AI responds for ${plies} rounds`, async ({ page }) => {
      const wait = aiWait || 5000
      await page.goto(url(family, variant), { waitUntil: 'networkidle' })
      await waitForBoard(page)

      const opponentSelect = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Opponent' }) }).locator('select')
      await opponentSelect.selectOption('ai')

      const seatSelect = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Play as' }) }).locator('select')
      await seatSelect.selectOption(seat)

      // If human is Black, AI moves first — wait for it
      if (seat === '1') {
        await page.waitForTimeout(wait)
      }

      for (let round = 0; round < plies; round++) {
        // Wait for it to be the human's turn
        await waitForHumanTurn(page, seatLabel, wait * 4)

        // Human makes a move
        const moved = await makeHumanMove(page)
        expect(moved).toBe(true)

        // Wait for AI to respond
        await page.waitForTimeout(wait)
      }

      // Verify the game progressed (history should have moves)
      const histLen = await getHistoryLength(page)
      expect(histLen).toBeGreaterThanOrEqual(plies)
    })
  }
})
