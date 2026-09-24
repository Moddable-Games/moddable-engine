import { readFileSync } from 'fs'
import { join } from 'path'
import { parseFrontmatter } from '../../packages/schema/index.js'
import { renderFromEngine } from '../../packages/render/index.js'
import { defaultState, paintCell, restoreAllCells, frontmatterFromState, buildResolvedFromState, setTopologyType } from '../create-state.js'

// engine#118 Tier B, "water, voids": a brush that paints cells void, blocked or
// tinted. The issue set the test: "If the void brush can produce rollerball's
// board, the feature is right."

const RULES_ROOT = process.env.MODDABLE_RULES_DIR || join(process.cwd(), '..', 'moddable-rules', 'games')
const variant = (slug) => parseFrontmatter(readFileSync(join(RULES_ROOT, 'chess', 'content', 'variants', `${slug}.md`), 'utf8')).meta.engine
const cellSet = (cells) => new Set((cells || []).map(c => c.join(',')))

// moddable-rules' check-voids.mjs: the drawn holes are the voids and blockers.
function pairsLikeCheckVoids(engine) {
  const drawn = cellSet(engine.render?.zones?.voids)
  const holes = cellSet([...(engine.topology.voids || []), ...(engine.topology.blockers || [])])
  return drawn.size === holes.size && [...drawn].every(c => holes.has(c))
}

describe('the cell brush', () => {
  test("painting the centre of a 7x7 board void gives rollerball's board", () => {
    const state = defaultState('chess')
    state.topology.rows = 7
    state.topology.cols = 7
    for (let r = 2; r <= 4; r++) for (let c = 2; c <= 4; c++) paintCell(state, `${r},${c}`, 'void')

    const engine = frontmatterFromState(state).engine
    expect(cellSet(engine.topology.voids)).toEqual(cellSet(variant('rollerball').topology.voids))
    expect(pairsLikeCheckVoids(engine)).toBe(true)
  })

  test("a blocker is a hole that exists: hole chess's pair holds both", () => {
    const state = defaultState('chess')
    paintCell(state, '0,0', 'void')
    paintCell(state, '3,3', 'blocker')
    const engine = frontmatterFromState(state).engine
    expect(engine.topology.voids).toEqual([[0, 0]])
    expect(engine.topology.blockers).toEqual([[3, 3]])
    expect(pairsLikeCheckVoids(engine)).toBe(true)
  })

  test('painting a cell with what it has clears it, and a void takes the piece off', () => {
    const state = defaultState('chess')
    state.placement['0,0'] = 'R'
    paintCell(state, '0,0', 'void')
    expect(state.placement['0,0']).toBeUndefined()
    paintCell(state, '0,0', 'void')
    expect(state.topology.voids).toBeUndefined()
    expect(frontmatterFromState(state).engine.render.zones).toBeUndefined()
  })

  test('a tint is drawn on exactly the cells painted', () => {
    const state = defaultState('chess')
    paintCell(state, '2,2', { fill: '#6b8fb8', opacity: 0.5 })
    paintCell(state, '2,3', { fill: '#6b8fb8', opacity: 0.5 })
    const engine = frontmatterFromState(state).engine
    expect(engine.render.decorations).toEqual([{ type: 'tint', fill: '#6b8fb8', opacity: 0.5, cells: [[2, 2], [2, 3]] }])
    const svg = renderFromEngine(buildResolvedFromState(state), {})
    expect((svg.match(/fill="#6b8fb8"/g) || []).length).toBe(2)
  })

  test('a hex cell painted void leaves the board by the cells it keeps', () => {
    const state = defaultState('chess')
    setTopologyType(state, 'hex')
    state.topology.radius = 2
    paintCell(state, '0,0', 'void')
    const topology = frontmatterFromState(state).engine.topology
    expect(topology.grid).toHaveLength(18)
    expect(topology.grid.some(([q, r]) => q === 0 && r === 0)).toBe(false)
    restoreAllCells(state)
    expect(frontmatterFromState(state).engine.topology.grid).toBeUndefined()
  })
})
