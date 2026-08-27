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

      const before = await page.locator('#game-play-root svg').innerHTML()

      // Some families move on one click, some select first and move second, and
      // some open on an action rather than on the board. What matters here is
      // only that a hit target accepts a click at all: a board where every
      // click is refused is a board nobody can play.
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

      // Where the family plays from the board rather than from a button, some
      // sequence of those clicks has to have done something.
      const actions = await page.locator('#game-play-root button, .game-play-actions button').allTextContents()
      const playsFromAButton = actions.some(t => /roll|deal|draw/i.test(t))
      if (!playsFromAButton) {
        const after = await page.locator('#game-play-root svg').innerHTML()
        expect(after, `${family}/${variant}: no click changed the board`).not.toBe(before)
      }
    })
  }
})
