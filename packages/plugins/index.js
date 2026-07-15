import { register } from './registry.js'
import { createBackgammonPlugin } from './backgammon/index.js'
import { createBig2Plugin } from './big2/index.js'
import { createChessPlugin } from './chess/index.js'
import { createDraughtsPlugin } from './draughts/index.js'
import { createGoPlugin } from './go/index.js'
import { createHalmaPlugin } from './halma/index.js'
import { createHexPlugin } from './hex/index.js'
import { createMancalaPlugin } from './mancala/index.js'
import { createMorrisPlugin } from './morris/index.js'
import { createRacePlugin } from './race/index.js'
import { createReversiPlugin } from './reversi/index.js'
import { createShogiPlugin } from './shogi/index.js'
import { createXiangqiPlugin } from './xiangqi/index.js'

register('backgammon', { factory: createBackgammonPlugin })
register('big2', { factory: createBig2Plugin })
register('chess', { factory: createChessPlugin })
register('draughts', { factory: createDraughtsPlugin })
register('go', { factory: createGoPlugin })
register('halma', { factory: createHalmaPlugin })
register('hex', { factory: createHexPlugin })
register('mancala', { factory: createMancalaPlugin })
register('morris', { factory: createMorrisPlugin })
register('race', { factory: createRacePlugin })
register('reversi', { factory: createReversiPlugin })
register('shogi', { factory: createShogiPlugin })
register('xiangqi', { factory: createXiangqiPlugin })

export { register, get, has, getAll, getIds, createFactory, clear } from './registry.js'
export {
  createBackgammonPlugin,
  createBig2Plugin,
  createChessPlugin,
  createDraughtsPlugin,
  createGoPlugin,
  createHalmaPlugin,
  createHexPlugin,
  createMancalaPlugin,
  createMorrisPlugin,
  createRacePlugin,
  createReversiPlugin,
  createShogiPlugin,
  createXiangqiPlugin,
}
