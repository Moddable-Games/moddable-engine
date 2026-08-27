#!/usr/bin/env node
/**
 * Test tiers, so a one-line change does not cost fifteen minutes.
 *
 *   fast   everything except the four O(variants) suites and the performance
 *          test. What to run while working.
 *   slow   those four. Run before handing over, or when the change touches the
 *          AI, piece mobility or playability.
 *   perf   the nodes-per-second assertion, alone and in band, because it is the
 *          only suite that needs the machine to itself.
 *   all    every tier, in that order.
 *   related tests reachable from the files named after `--`, minus the slow
 *          tier. `npm run test:related -- packages/render/src/serialize-layout.js`
 *
 * The tiers come from `jest.config.js`, so nothing here is a second list that
 * can drift from the first.
 */
import { spawnSync } from 'child_process'
import { SLOW_SUITES, PERF_SUITE } from '../jest.config.js'

const tier = process.argv[2] || 'fast'
const passthrough = process.argv.slice(3)

// Only a run over everything is allowed to publish the project's test count.
// The `all` tier says so; `fast`, `slow`, `perf` and `related` do not, and
// neither does a bare `npx jest`.
const env = {
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, '--experimental-vm-modules'].filter(Boolean).join(' '),
  MODDABLE_PUBLISH_TEST_COUNTS: tier === 'all' ? '1' : '0',
}

const escaped = p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function jest(args, label) {
  console.log(`\n=== ${label} ===`)
  const res = spawnSync('npx', ['jest', ...args, ...passthrough], { stdio: 'inherit', env })
  return res.status === 0
}

// `--findRelatedTests` on its own is not the answer: the dependency graph is
// dense enough that a render or schema file pulls in the four O(variants)
// suites, and the run is slower than the whole fast tier. Related tests minus
// the slow tier is the combination that is actually quick.
const IGNORE_SLOW = [...SLOW_SUITES, PERF_SUITE]
  .flatMap(p => ['--testPathIgnorePatterns', escaped(p)])
  .concat(['--testPathIgnorePatterns', '/node_modules/',
           '--testPathIgnorePatterns', '<rootDir>/e2e/',
           '--testPathIgnorePatterns', '/__fixtures__/'])

const RUN = {
  fast: () => jest(IGNORE_SLOW, 'fast tier'),
  slow: () => jest(SLOW_SUITES, 'slow tier'),
  perf: () => jest([PERF_SUITE, '--runInBand'], 'performance'),
  // `npm run test:related -- path/to/file.js ...`
  related: () => jest([...IGNORE_SLOW, '--findRelatedTests'], 'tests related to the given files'),
}
RUN.all = () => ['fast', 'slow', 'perf'].map(t => RUN[t]()).every(Boolean)

if (!RUN[tier]) {
  console.error(`Unknown tier "${tier}". One of: fast, slow, perf, related, all`)
  process.exit(2)
}
process.exit(RUN[tier]() ? 0 : 1)
