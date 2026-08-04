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
  const svg = page.locator('#game-play-root svg')

  // Get all squares that have pieces (images positioned on them)
  const images = await svg.locator('g[pointer-events="none"] image').all()
  if (images.length === 0) return false

  // Click a piece to select it (should show indicators)
  for (const img of images) {
    const bbox = await img.boundingBox()
    if (!bbox) continue
    await page.mouse.click(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2)
    await page.waitForTimeout(300)

    // Check if indicators appeared (circles = legal move targets)
    const indicators = await svg.locator('circle').count()
    if (indicators > 0) {
      // Click the first indicator to complete the move
      const indicator = svg.locator('circle').first()
      const iBbox = await indicator.boundingBox()
      if (iBbox) {
        await page.mouse.click(iBbox.x + iBbox.width / 2, iBbox.y + iBbox.height / 2)
        await page.waitForTimeout(300)
        return true
      }
    }
  }
  return false
}

const MULTI_PLY_TESTS = [
  { family: 'chess', variant: 'standard', seat: '0', seatLabel: 'White', plies: 4 },
  { family: 'chess', variant: 'standard', seat: '1', seatLabel: 'Black', plies: 4 },
  { family: 'chess', variant: 'grand', seat: '0', seatLabel: 'White', plies: 3 },
  { family: 'chess', variant: 'grand', seat: '1', seatLabel: 'Black', plies: 3 },
  { family: 'chess', variant: 'turkish-great-chess-iv', seat: '0', seatLabel: 'White', plies: 3 },
  { family: 'chess', variant: 'turkish-great-chess-iv', seat: '1', seatLabel: 'Black', plies: 3 },
]

test.describe('AI multi-ply — AI never stalls', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => { if (msg.type() === 'error') console.log('[BROWSER ERROR]', msg.text()) })
    page.on('pageerror', err => console.log('[PAGE ERROR]', err.message))
  })

  for (const { family, variant, seat, seatLabel, plies } of MULTI_PLY_TESTS) {
    test(`${variant} (human=${seatLabel}): AI responds for ${plies} rounds`, async ({ page }) => {
      await page.goto(url(family, variant), { waitUntil: 'networkidle' })
      await waitForBoard(page)

      const opponentSelect = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Opponent' }) }).locator('select')
      await opponentSelect.selectOption('ai')

      const seatSelect = page.locator('.control-group', { has: page.locator('.control-label', { hasText: 'Play as' }) }).locator('select')
      await seatSelect.selectOption(seat)

      // If human is Black, AI moves first — wait for it
      if (seat === '1') {
        await page.waitForTimeout(5000)
      }

      for (let round = 0; round < plies; round++) {
        // Wait for it to be the human's turn
        await waitForHumanTurn(page, seatLabel, 20000)

        // Human makes a move
        const moved = await makeHumanMove(page)
        expect(moved).toBe(true)

        // Wait for AI to respond
        await page.waitForTimeout(5000)
      }

      // Verify the game progressed (history should have moves)
      const histLen = await getHistoryLength(page)
      expect(histLen).toBeGreaterThanOrEqual(plies)
    })
  }
})
