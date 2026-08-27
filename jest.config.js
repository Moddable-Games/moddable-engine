// Four of the 173 suites account for 85% of the run.
//
// Measured on a 2-core box, one worker:
//
//   ai-both-seats           276 s
//   piece-mobility-all      249 s
//   no-repetition           231 s
//   playability-standard    202 s
//   ------------------------------
//   those four              957 s
//   the other 169             ~2 m
//
// They are slow because they are O(playable variants) and each variant runs a
// real search over a real game. That is worth having and it is not worth
// running after every edit. `npm run test:fast` leaves them out and finishes in
// the time it takes to read the diff; `npm test` still runs everything.
//
// The list lives here so the two scripts cannot disagree about what is in it.
export const SLOW_SUITES = [
  'packages/play/__tests__/ai-both-seats.test.js',
  'packages/play/__tests__/piece-mobility-all.test.js',
  'packages/play/__tests__/playability-standard.test.js',
  'packages/ai/__tests__/no-repetition.test.js',
]

// The performance test asserts nodes per second, so it is the one suite that
// needs the machine to itself. It used to force `--runInBand` on the entire
// run in CI, which is why every other suite was also confined to one worker.
export const PERF_SUITE = 'packages/ai/__tests__/performance.test.js'

export default {
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/', '/__fixtures__/'],
  // What the suite ran, written where the discovery build can read it, so the
  // published figure is measured rather than transcribed.
  reporters: ['default', '<rootDir>/scripts/lib/test-count-reporter.cjs'],
}
