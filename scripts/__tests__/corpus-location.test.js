/**
 * Where the corpus lives, and who gets told.
 *
 * Both of these failures were live on dev and main from 2026-08-29, and
 * neither was visible, because `npm ci` was failing on a lockfile that had
 * drifted from the workspace list and no job ever reached its own logic. When
 * the install was fixed both surfaced in the same run.
 *
 * They are the same bug wearing two hats: a step knows where the corpus is and
 * does not say so, or is told in a vocabulary it does not speak.
 */
import { jest } from '@jest/globals'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

async function gamesDirUnder(env) {
  const saved = process.env
  process.env = { ...saved, ...env }
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]
  jest.resetModules()
  try {
    const mod = await import(`../lib/board-corpus.mjs?corpus-location=${Math.random()}`)
    return mod.GAMES_DIR
  } finally {
    process.env = saved
  }
}

describe('board-corpus resolves the games directory', () => {
  // The engine-wide name, set by all three CI jobs and read by fourteen other
  // corpus readers. board-corpus ignored it, so on a runner - where the two
  // repos sit side by side INSIDE the workspace, not beside it - it walked one
  // level too high and every board in the corpus died on ENOENT.
  it('honours MODDABLE_RULES_DIR, which is the games directory itself', async () => {
    expect(await gamesDirUnder({ MODDABLE_RULES_DIR: '/w/moddable-rules/games' }))
      .toBe('/w/moddable-rules/games')
  })

  // moddable-rules' sync-boards.sh passes this one, and passes the repo root,
  // not the games dir. Breaking it would break board diagram export from the
  // other repo, which is the caller this file was originally written for.
  it('still honours RULES_ROOT, which is the repo root', async () => {
    expect(await gamesDirUnder({ RULES_ROOT: '/w/moddable-rules', MODDABLE_RULES_DIR: undefined }))
      .toBe('/w/moddable-rules/games')
  })

  it('prefers MODDABLE_RULES_DIR when a caller sets both', async () => {
    expect(await gamesDirUnder({ RULES_ROOT: '/elsewhere', MODDABLE_RULES_DIR: '/w/rules/games' }))
      .toBe('/w/rules/games')
  })
})

describe('CI tells every corpus-reading step where the corpus is', () => {
  const ci = readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8')

  // `normalise-puzzles.mjs` reads variant frontmatter through
  // setup-rules-reader. Its step was the only one in the job without the
  // variable, and failed on all 1116 standard puzzles at once.
  it('sets MODDABLE_RULES_DIR on the puzzle normalisation step', () => {
    const step = ci.slice(ci.indexOf('- name: Verify puzzles are normalised'))
    const untilNext = step.slice(0, step.indexOf('- name:', 1))
    expect(untilNext).toContain('MODDABLE_RULES_DIR')
  })

  // Pairing the corpus branch with the branch being built is what stops a
  // rules push from turning engine main red on its own. A literal `ref: dev`
  // is the bug it replaced.
  it('pairs the corpus branch with the branch being built, in every job', () => {
    const refs = ci.match(/^\s+ref: .*/gm) || []
    expect(refs.length).toBe(3)
    for (const ref of refs) {
      expect(ref).toContain("github.base_ref || github.ref_name")
      expect(ref.trim()).not.toBe('ref: dev')
    }
  })
})
