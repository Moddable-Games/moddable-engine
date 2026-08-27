// The guard that stops a partial test run publishing its own subset as the
// project's test count, and the reason it is written as an opt-in.
//
// The first version tried to work out whether a run was partial by sniffing
// jest's config for `testPathPattern`, `testNamePattern` and the ignore list.
// It was verified against `npx jest <one file>`, which sets `testPathPattern`,
// and reported as working. It missed `--testPathIgnorePatterns` completely,
// because CLI ignore patterns do not arrive on `globalConfig`, so
// `npm run test:fast` published 5,735 tests across 169 suites as the figure for
// a suite of 6,346 across 174 - exactly the class of wrong public number the
// reporter exists to prevent.
//
// Verifying one of two branches and calling the guard proven is the mistake
// worth not repeating, so both directions are asserted here.
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const Reporter = require('../lib/test-count-reporter.cjs')

const PASSING = {
  numTotalTests: 100, numPassedTests: 98, numPendingTests: 2,
  numTotalTestSuites: 10, numFailedTests: 0, numRuntimeErrorTestSuites: 0,
}

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'counts-'))
  mkdirSync(join(dir, 'snapshots'), { recursive: true })
  writeFileSync(join(dir, 'snapshots', 'a.svg'), '<svg/>')
  return dir
}

function run(dir, env, results = PASSING) {
  const before = process.env.MODDABLE_PUBLISH_TEST_COUNTS
  if (env === undefined) delete process.env.MODDABLE_PUBLISH_TEST_COUNTS
  else process.env.MODDABLE_PUBLISH_TEST_COUNTS = env
  try {
    new Reporter({}, { root: dir }).onRunComplete([], results)
  } finally {
    if (before === undefined) delete process.env.MODDABLE_PUBLISH_TEST_COUNTS
    else process.env.MODDABLE_PUBLISH_TEST_COUNTS = before
  }
  const path = join(dir, 'api', 'test-counts.json')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
}

describe('only a run over the whole suite publishes the test count', () => {
  it('publishes when the run says it is the whole suite', () => {
    const counts = run(scratch(), '1')
    expect(counts).not.toBeNull()
    expect(counts.tests).toBe(100)
    expect(counts.passed).toBe(98)
    expect(counts.suites).toBe(10)
    expect(counts.snapshots).toBe(1)
  })

  it('stays silent when nothing says so, which is every tier and every bare jest run', () => {
    expect(run(scratch(), undefined)).toBeNull()
  })

  it('stays silent when the flag is explicitly off', () => {
    expect(run(scratch(), '0')).toBeNull()
  })

  it('stays silent on a failing run, so a red run cannot lower the figure', () => {
    expect(run(scratch(), '1', { ...PASSING, numFailedTests: 3 })).toBeNull()
  })

  it('stays silent when a suite failed to load at all', () => {
    expect(run(scratch(), '1', { ...PASSING, numRuntimeErrorTestSuites: 1 })).toBeNull()
  })
})

describe('the scripts that set the flag', () => {
  const runner = readFileSync(new URL('../run-tests.mjs', import.meta.url), 'utf8')
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

  it('only the all tier publishes', () => {
    expect(runner).toContain("MODDABLE_PUBLISH_TEST_COUNTS: tier === 'all' ? '1' : '0'")
  })

  it('npm test publishes, because it runs everything', () => {
    expect(pkg.scripts.test).toContain('MODDABLE_PUBLISH_TEST_COUNTS=1')
  })

  it('no partial tier publishes', () => {
    for (const tier of ['test:fast', 'test:slow', 'test:perf', 'test:related']) {
      expect(pkg.scripts[tier]).not.toContain('MODDABLE_PUBLISH_TEST_COUNTS=1')
    }
  })
})
