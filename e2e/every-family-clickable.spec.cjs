/**
 * Every playable family answers a real click.
 *
 * The families that shipped playable and unplayable were not missed because
 * nobody wrote a browser test. `interaction-matrix.spec.cjs` exists to click
 * boards, and it covered grid and hex, listed by hand. Morris is graph,
 * mancala is pit, landlords is track, and none of the three was in the list.
 * Every one of them shipped broken.
 *
 * So this file has no list. It reads the playability manifest, takes one
 * variant per family, and requires an unforced click to change the board. A
 * new family is covered the day it becomes playable, without anyone
 * remembering to add it.
 */
const { test, expect } = require('@playwright/test')
const { readFileSync } = require('fs')
const { join } = require('path')

const BASE = (process.env.BASE_URL || 'http://localhost:80/MODDABLE/moddable-engine') + '/play/'

const MANIFEST = JSON.parse(
  readFileSync(join(__dirname, '..', 'play', 'playability-manifest.json'), 'utf8')
)

// One variant per family: the cheapest board it ships, so the sweep stays quick.
const FAMILIES = []
for (const entry of MANIFEST) {
  if (!entry.playable) continue
  if (FAMILIES.some(f => f.family === entry.family)) continue
  FAMILIES.push({ family: entry.family, variant: entry.variant })
}

// A floor, because a sweep that finds no families passes silently.
const FAMILY_FLOOR = 10

test.describe('every playable family answers a click', () => {
  test('the manifest names enough families to be worth sweeping', () => {
    expect(FAMILIES.length).toBeGreaterThanOrEqual(FAMILY_FLOOR)
  })

  for (const { family, variant } of FAMILIES) {
    test(`${family}/${variant}`, async ({ page }) => {
      await page.goto(`${BASE}?family=${family}&variant=${variant}&opponent=human`)
      await page.waitForSelector('#game-play-root [data-sq]', { timeout: 20000 })

      const ids = await page.locator('#game-play-root [data-sq]').evaluateAll(
        els => els.map(el => el.getAttribute('data-sq')).filter(Boolean)
      )
      expect(ids.length).toBeGreaterThan(0)

      // Two things get asserted, and they are different questions.
      //
      // First: does a hit target accept a click at all. That is the
      // pointer-events question, and it is asked of a sample.
      //
      // Second: can this family actually be played. The first version of this
      // clicked the first twelve cells and compared the SVG, which was wrong
      // twice over. On a seven-row board the first twelve cells are all the
      // opponent's, and red moves first, so no click could ever have worked.
      // And comparing the SVG cannot tell a move from a selection highlight,
      // because both change the markup. The move log is the unambiguous
      // witness: it only grows when a move is actually made.
      const historyText = () => page.locator('.game-play-history').first().textContent().catch(() => '')

      let accepted = 0
      const refused = []
      for (const id of ids.slice(0, 12)) {
        try {
          await page.locator(`#game-play-root [data-sq="${id}"]`).first().click({ timeout: 4000 })
          accepted++
        } catch (err) {
          refused.push(id)
        }
      }
      expect(refused, `${family}/${variant}: hit targets refused a click`).toEqual([])
      expect(accepted).toBeGreaterThan(0)

      const actions = await page.locator('#game-play-root button, .game-play-actions button').allTextContents()
      const playsFromAButton = actions.some(t => /roll|deal|draw/i.test(t))
      if (playsFromAButton) return

      // One pass, not a pair of nested loops. Trying every cell against every
      // other cell was O(cells squared) and took two minutes on a chess board.
      //
      // Finding the target is the fiddly part, and two earlier attempts got it
      // wrong in opposite directions. Counting every circle on the board
      // treated cannon-shogi's four decorative star points as move indicators.
      // Counting only `g.highlights` missed chess, draughts and xiangqi, whose
      // indicators are drawn elsewhere. Neither guess was needed: an indicator
      // is whatever APPEARED since the board was at rest, and the move is made
      // by clicking the cell underneath it.
      const startLog = ((await historyText()) || '').trim()

      const shapeCentres = () => page.evaluate(() => {
        const svg = document.querySelector('#game-play-root svg')
        if (!svg) return []
        const out = []
        for (const el of svg.querySelectorAll('circle, rect, polygon')) {
          if (el.getAttribute('data-sq')) continue        // that is a hit target, not an indicator
          const box = el.getBBox ? el.getBBox() : null
          if (!box || box.width === 0) continue
          out.push({ x: box.x + box.width / 2, y: box.y + box.height / 2, w: box.width })
        }
        return out
      })

      const cellUnder = (point) => page.evaluate(({ x, y }) => {
        const svg = document.querySelector('#game-play-root svg')
        for (const el of svg.querySelectorAll('[data-sq]')) {
          const b = el.getBBox ? el.getBBox() : null
          if (!b) continue
          if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) {
            return el.getAttribute('data-sq')
          }
        }
        return null
      }, point)

      const atRest = await shapeCentres()
      const restKeys = new Set(atRest.map(s => `${s.x.toFixed(1)},${s.y.toFixed(1)}`))
      let played = false

      for (const from of ids) {
        await page.locator(`#game-play-root [data-sq="${from}"]`).first().click({ timeout: 4000 }).catch(() => {})
        // A one-click family - placement, sowing - has already moved.
        if (((await historyText()) || '').trim() !== startLog) { played = true; break }

        const now = await shapeCentres()
        const appeared = now.filter(s => !restKeys.has(`${s.x.toFixed(1)},${s.y.toFixed(1)}`))
        for (const point of appeared.slice(0, 4)) {
          const target = await cellUnder(point)
          if (!target || target === from) continue
          await page.locator(`#game-play-root [data-sq="${target}"]`).first().click({ timeout: 4000 }).catch(() => {})
          if (((await historyText()) || '').trim() !== startLog) { played = true; break }
        }
        if (played) break
      }

      expect(played, `${family}/${variant}: no sequence of clicks produced a move`).toBe(true)
    })
  }
})
