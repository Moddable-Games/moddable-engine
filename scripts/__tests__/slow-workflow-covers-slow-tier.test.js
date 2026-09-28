import { readFileSync } from 'fs'
import { join } from 'path'
import { SLOW_SUITES, PERF_SUITE } from '../../jest.config.js'

// engine#201 moved the slow tier off the push path into slow.yml, which names
// each suite as a job. A suite added to SLOW_SUITES and not to the workflow
// would leave every CI run without it, and nothing would say so.
test('slow.yml runs every slow suite and the performance test', () => {
  const workflow = readFileSync(join(process.cwd(), '.github', 'workflows', 'slow.yml'), 'utf8')
  const inWorkflow = new Set([...workflow.matchAll(/suite: (packages\/\S+\.test\.js)/g)].map(m => m[1]))
  expect([...inWorkflow].sort()).toEqual([...SLOW_SUITES, PERF_SUITE].sort())
})
