/**
 * Pipeline Integration Test — proves the full render pipeline end-to-end.
 *
 * Uses hardcoded spec examples (surface + family + variant) to exercise:
 * surface-resolver → cascade-resolver → render-dispatch → topology renderer
 */

import { resolveSurface } from './surface-resolver.js'
import { resolve as cascadeResolve } from './cascade-resolver.js'
import { renderFromResolved, setDeckRenderer } from './render-adapter.js'
import { renderDeckSvg } from './boards.js'

setDeckRenderer(renderDeckSvg)

// --- Helpers ---

function buildGlinskiSetup() {
  // Same logic as boards.js buildHexPosition — white defined, black mirrored
  const white = [
    ['K', 1, 4], ['Q', -1, 5],
    ['B', 0, 5], ['B', 0, 4], ['B', 0, 3],
    ['N', -2, 5], ['N', 2, 3],
    ['R', -3, 5], ['R', 3, 2],
    ['P', -4, 5], ['P', -3, 4], ['P', -2, 3], ['P', -1, 2],
    ['P', 0, 1], ['P', 1, 1], ['P', 2, 1], ['P', 3, 1], ['P', 4, 1],
  ]
  const pos = {}
  const black = white.map(([p, q, r]) => [p.toLowerCase(), q, -r - q])
  for (const [p, q, r] of white) pos[`${q},${r}`] = p
  for (const [p, q, r] of black) pos[`${q},${r}`] = p
  return pos
}

// --- Test variants (from render-schema-spec examples) ---

const TEST_VARIANTS = {
  'chess-standard': {
    label: 'Chess — Standard',
    surface: 'wood-classic',
    family: {
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        render: { cellSize: 40, cellColor: 'checkered' },
        pieces: { set: 'mce-fairy-complete' },
        players: ['white', 'black'],
      },
      meta: { label: 'Chess', category: 'board', tags: ['abstract', 'combinatorial'] },
    },
    variant: {
      engine: { setup: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
      meta: { label: 'Standard', description: 'Standard FIDE rules.', tags: ['classic'] },
    },
  },

  'chess-capablanca': {
    label: 'Chess — Capablanca (10x8)',
    surface: 'wood-classic',
    family: {
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        render: { cellSize: 40, cellColor: 'checkered' },
        pieces: { set: 'mce-fairy-complete' },
        players: ['white', 'black'],
      },
      meta: { label: 'Chess', tags: ['abstract'] },
    },
    variant: {
      engine: {
        topology: { cols: 10 },
        render: { cellSize: 36 },
        setup: 'rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR',
      },
      meta: { label: 'Capablanca', tags: ['large-board', 'fairy'] },
    },
  },

  'go-19x19': {
    label: 'Go — 19x19',
    surface: 'wood-light',
    family: {
      engine: {
        topology: { type: 'grid', rows: 19, cols: 19, layout: 'intersections' },
        render: { cellSize: 20, cellColor: 'uniform' },
        pieces: { set: 'playstrategy-go-classic' },
        players: ['black', 'white'],
      },
      meta: { label: 'Go', tags: ['territory', 'abstract'] },
    },
    variant: {
      engine: {
        setup: '',
        render: {
          decorations: [
            { type: 'markers', style: 'dot', size: 3, auto: 'star-points' },
          ],
        },
      },
      meta: { label: '19x19', tags: [] },
    },
  },

  'go-9x9': {
    label: 'Go — 9x9',
    surface: 'wood-light',
    family: {
      engine: {
        topology: { type: 'grid', rows: 19, cols: 19, layout: 'intersections' },
        render: { cellSize: 20, cellColor: 'uniform' },
      },
      meta: { label: 'Go', tags: ['territory'] },
    },
    variant: {
      engine: {
        topology: { rows: 9, cols: 9 },
        render: {
          cellSize: 32,
          decorations: [
            { type: 'markers', style: 'dot', size: 3, auto: 'star-points' },
          ],
        },
        setup: '',
      },
      meta: { label: '9x9' },
    },
  },

  'hex-standard': {
    label: 'Hex — 11x11',
    surface: 'slate',
    family: {
      engine: {
        topology: { type: 'hex', shape: 'rhombus', orientation: 'pointy' },
        render: { cellSize: 20, cellColor: 'uniform', frame: 'rhombus' },
        players: ['black', 'white'],
      },
      meta: { label: 'Hex', tags: ['connection', 'abstract'] },
    },
    variant: {
      engine: {
        topology: { rows: 11, cols: 11 },
        setup: {},
      },
      meta: { label: 'Standard 11x11' },
    },
  },

  'glinski': {
    label: 'Glinski Hexagonal Chess',
    surface: 'wood-classic',
    family: {
      engine: {
        topology: { type: 'grid', rows: 8, cols: 8 },
        render: { cellSize: 40, cellColor: 'checkered' },
        pieces: { set: 'mce-fairy-complete' },
      },
      meta: { label: 'Chess', tags: ['abstract'] },
    },
    variant: {
      engine: {
        topology: { type: 'hex', shape: 'hexagonal', radius: 5, orientation: 'flat' },
        surface: { colors: { 'cell-mid': '#e8ab6f' } },
        render: { cellSize: 22, cellColor: 'tricolor' },
        setup: buildGlinskiSetup(),
        pieces: { set: 'mce-fairy-complete' },
      },
      meta: { label: 'Glinski', tags: ['hex', 'fairy'] },
    },
  },

  'mancala-kalah': {
    label: 'Mancala — Kalah',
    surface: 'earth',
    family: {
      engine: {
        topology: { type: 'pit', cols: 6, rows: 2, stores: true },
        render: { cellSize: 22 },
        pieces: { set: 'playstrategy-oware' },
        players: ['south', 'north'],
      },
      meta: { label: 'Mancala', tags: ['sowing'] },
    },
    variant: {
      engine: {
        setup: '4,4,4,4,4,4;0;4,4,4,4,4,4;0',
      },
      meta: { label: 'Kalah', tags: ['classic'] },
    },
  },

  'morris-nine': {
    label: 'Nine Men\'s Morris',
    surface: 'slate',
    family: {
      engine: {
        topology: {
          type: 'graph',
          structure: 'concentric-rings',
          params: { rings: 3, midpoints: true, diagonals: false },
        },
        render: { cellSize: 30 },
        players: ['white', 'black'],
      },
      meta: { label: 'Morris', tags: ['abstract'] },
    },
    variant: {
      engine: { setup: {} },
      meta: { label: "Nine Men's Morris" },
    },
  },

  'backgammon': {
    label: 'Backgammon',
    surface: 'parchment',
    family: {
      engine: {
        topology: { type: 'track', positions: 24, shape: 'linear' },
        render: { cellSize: 30, trackStyle: 'triangular-points' },
        players: ['white', 'black'],
      },
      meta: { label: 'Backgammon', tags: ['racing', 'dice'] },
    },
    variant: {
      engine: { setup: '0:2W,5:5B,7:3B,11:5W,12:5B,16:3W,18:5W,23:2B' },
      meta: { label: 'Standard' },
    },
  },

  'tafl-tablut': {
    label: 'Tafl — Tablut',
    surface: 'parchment',
    family: {
      engine: {
        topology: { type: 'grid', rows: 9, cols: 9 },
        render: { cellSize: 40, cellColor: 'uniform', labels: false },
        surface: { colors: { throne: '#8b4513', corner: '#2e7d32' } },
        pieces: {
          set: 'playstrategy-go-classic',
          vocabulary: {
            K: { type: 'king', color: 'white' },
            w: { type: 'stone', color: 'white' },
            b: { type: 'stone', color: 'black' },
          },
        },
        players: ['white', 'black'],
      },
      meta: { label: 'Tafl', tags: ['asymmetric', 'capture'] },
    },
    variant: {
      engine: {
        render: {
          zones: {
            cells: [
              { type: 'throne', at: [[4,4]] },
              { type: 'corner', at: [[0,0], [0,8], [8,0], [8,8]] },
            ],
          },
        },
        setup: '3bbb3/4b4/4w4/b3w3b/bbwwKwwbb/b3w3b/4w4/4b4/3bbb3',
      },
      meta: { label: 'Tablut', tags: ['historical'] },
    },
  },

  'xiangqi': {
    label: 'Xiangqi (Chinese Chess)',
    surface: 'wood-light',
    family: {
      engine: {
        topology: { type: 'grid', rows: 10, cols: 9, layout: 'intersections' },
        render: {
          cellSize: 36,
          cellColor: 'uniform',
          decorations: [
            { type: 'gap', between: [4, 5] },
            { type: 'diagonals', region: { rows: [0, 2], cols: [3, 5] } },
            { type: 'diagonals', region: { rows: [7, 9], cols: [3, 5] } },
          ],
        },
        pieces: {
          set: 'mce-xiangqi-trad',
          fenMap: {
            R: 'wR', r: 'bR', H: 'wN', h: 'bN', E: 'wE', e: 'bE',
            A: 'wA', a: 'bA', K: 'wK', k: 'bK', C: 'wC', c: 'bC',
            P: 'wP', p: 'bP',
          },
        },
        players: ['red', 'black'],
      },
      meta: { label: 'Xiangqi', tags: ['asian', 'capture'] },
    },
    variant: {
      engine: {
        setup: 'RHEAKAEHR/9/1C5C1/P1P1P1P1P/9/9/p1p1p1p1p/1c5c1/9/rheakaehr',
      },
      meta: { label: 'Standard' },
    },
  },

  'card-holdem': {
    label: "Texas Hold'em",
    surface: 'felt-green',
    family: {
      engine: {
        topology: { type: 'none' },
        components: { deck: { type: 'standard-52' } },
      },
      meta: { label: '52 Cards', tags: ['cards'] },
    },
    variant: {
      engine: {
        components: {
          layout: {
            zones: [
              { name: 'hand', type: 'fan', per: 'player' },
              { name: 'community', type: 'grid', rows: 1, cols: 5 },
              { name: 'pot', type: 'pile', position: 'center' },
            ],
          },
        },
        setup: { deal: 2, community: 5, players: 6, seed: 42 },
      },
      meta: { label: "Texas Hold'em", tags: ['betting', 'community-cards'] },
    },
  },

  'dice-yahtzee': {
    label: 'Yahtzee',
    surface: 'felt-green',
    family: {
      engine: {
        topology: { type: 'none' },
        components: { dice: { count: 5, sides: 6, type: 'standard' } },
      },
      meta: { label: 'Standard Dice', tags: ['dice'] },
    },
    variant: {
      engine: {
        components: {
          layout: { type: 'pool' },
        },
        setup: { players: 4, seed: 42 },
      },
      meta: { label: 'Yahtzee', tags: ['press-your-luck', 'scoring'] },
    },
  },
}

// --- Pipeline execution ---

async function runPipeline(key) {
  const spec = TEST_VARIANTS[key]
  if (!spec) return

  // Step 3: Resolve surface
  const surface = resolveSurface(spec.surface)

  // Steps 4-6: Cascade resolve
  const { resolved, errors } = cascadeResolve({
    surface,
    family: spec.family,
    variant: spec.variant,
  })

  // Debug output
  const debug = document.getElementById('debug-output')
  debug.textContent = JSON.stringify({ errors, resolved }, null, 2)

  if (errors.length > 0) {
    document.getElementById('render-target').innerHTML =
      `<p style="color:#f44">Validation errors:<br>${errors.join('<br>')}</p>`
    return
  }

  // Render using existing board-diagrams.js providers via adapter
  const target = document.getElementById('render-target')
  await renderFromResolved(resolved, target)
}

// --- UI setup ---

const select = document.getElementById('variant-select')
for (const [key, spec] of Object.entries(TEST_VARIANTS)) {
  const opt = document.createElement('option')
  opt.value = key
  opt.textContent = spec.label
  select.appendChild(opt)
}

select.addEventListener('change', () => runPipeline(select.value))

// Render first variant on load
runPipeline(Object.keys(TEST_VARIANTS)[0])
