const { test, expect } = require('@playwright/test')

const BASE = process.env.BASE_URL || 'http://localhost:80/MODDABLE/moddable-engine'

// The move list sits between two rows of buttons in the right rail. It was an
// unlabelled block of muted text that reserved height whether or not it held
// anything, so an early game showed a black gap where the moves should be.
//
// The first attempt at that faded the box's cut edges, which took the little
// text there was and made it fainter - worse than the problem. This asserts
// what actually fixes it: the list says what it is, says when it is empty, and
// is written in the rail's ordinary text colour rather than its muted one.
test('the move list says what it is, and says when it is empty', async ({ page }) => {
  await page.goto(`${BASE}/play/?family=chess&variant=standard`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-sq]', { timeout: 15000 })

  const before = await page.evaluate(() => {
    const label = document.querySelector('.game-play-history-label')
    const empty = document.querySelector('.game-play-history-empty')
    const list = document.querySelector('.game-play-history')
    const cs = getComputedStyle(list)
    return {
      label: label && label.textContent.trim(),
      emptyShown: !!empty && !empty.hidden && empty.getBoundingClientRect().height > 0,
      emptyText: empty && empty.textContent.trim(),
      masked: (cs.maskImage || cs.webkitMaskImage || 'none') !== 'none',
    }
  })
  expect(before.label).toBe('Moves')
  expect(before.emptyShown).toBe(true)
  expect(before.emptyText).toBe('No moves yet')
  expect(before.masked).toBe(false)

  await page.locator('[data-sq="e2"]').first().click()
  await page.waitForTimeout(250)
  await page.locator('[data-sq="e4"]').first().click()
  await page.waitForTimeout(1200)

  const after = await page.evaluate(() => {
    const empty = document.querySelector('.game-play-history-empty')
    const list = document.querySelector('.game-play-history')
    return {
      text: list.textContent.trim(),
      emptyShown: !!empty && !empty.hidden,
      colour: getComputedStyle(list).color,
      mutedColour: getComputedStyle(document.querySelector('.game-play-history-label')).color,
    }
  })
  // A move was recorded, the empty notice stood down, and the list is not
  // written in the same muted grey as its own label.
  expect(after.text.length).toBeGreaterThan(0)
  expect(after.emptyShown).toBe(false)
  expect(after.colour).not.toBe(after.mutedColour)
})
