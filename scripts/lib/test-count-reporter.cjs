/**
 * Writes what the suite actually ran to `api/test-counts.json`.
 *
 * The published test count used to come from a regex over README.md, and the
 * line it matched first was inside a dated changelog entry from July. It
 * reported 1367 tests across 104 suites for five weeks while the real numbers
 * were 6267 and 173, and `check:discovery` passed the whole time, because it
 * only checked that the generated files agreed with the scrape rather than that
 * the scrape was true.
 *
 * A number that describes the test suite should be produced by running the test
 * suite. This reporter is attached to the full run, so the figure updates
 * whenever anyone runs `npm test` and cannot be edited into being wrong.
 */
const { writeFileSync, mkdirSync, readdirSync, existsSync } = require('fs')
const { join, resolve } = require('path')

class TestCountReporter {
  constructor(globalConfig, options) {
    this.root = (options && options.root) || process.cwd()

    // Publishing is opt-in, and the reason is a bug this guard already had.
    //
    // The first version tried to WORK OUT whether a run was partial, by
    // sniffing `testPathPattern`, `testNamePattern` and the ignore list. That
    // caught `npx jest <one file>`, which is the case it was tested against, and
    // missed `--testPathIgnorePatterns` entirely, because CLI ignore patterns do
    // not arrive on `globalConfig`. So `npm run test:fast` published its own
    // subset - 5,735 tests across 169 suites - as the project's figure, which is
    // precisely the class of wrong number this reporter exists to prevent.
    //
    // Guessing was the mistake. A run says whether it is the whole suite, and
    // only `npm test` and `npm run test:all` say so. Anything else - a tier, a
    // single file, a watch, an editor integration - stays silent by default and
    // cannot lower the published figure to whatever it happened to run.
    this.mayPublish = process.env.MODDABLE_PUBLISH_TEST_COUNTS === '1'
  }

  onRunComplete(_contexts, results) {
    if (!this.mayPublish) return
    if (results.numFailedTests > 0 || results.numRuntimeErrorTestSuites > 0) return

    const snapDir = resolve(this.root, 'snapshots')
    const snapshots = existsSync(snapDir)
      ? readdirSync(snapDir).filter(f => f.endsWith('.svg')).length
      : 0

    const payload = {
      tests: results.numTotalTests,
      passed: results.numPassedTests,
      skipped: results.numPendingTests,
      suites: results.numTotalTestSuites,
      snapshots,
    }

    const out = resolve(this.root, 'api')
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'test-counts.json'), JSON.stringify(payload, null, 2) + '\n')
  }
}

module.exports = TestCountReporter
