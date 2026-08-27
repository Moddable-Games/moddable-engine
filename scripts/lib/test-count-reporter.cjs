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
    // A partial run must not overwrite the published figure with its own
    // subset. Only a run over the whole suite is allowed to publish.
    this.partial = Boolean(
      (globalConfig.testPathPattern && globalConfig.testPathPattern !== '') ||
      (globalConfig.testNamePattern && globalConfig.testNamePattern !== '') ||
      (globalConfig.testPathIgnorePatterns || []).some(p => p.includes('__tests__'))
    )
  }

  onRunComplete(_contexts, results) {
    if (this.partial) return
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
