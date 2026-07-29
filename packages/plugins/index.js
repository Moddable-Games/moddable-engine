import { register } from './registry.js'
import { createChessPlugin } from './chess/index.js'
import { createDraughtsPlugin } from './draughts/index.js'
import { createGoPlugin } from './go/index.js'
import { createShogiPlugin } from './shogi/index.js'
import { createXiangqiPlugin } from './xiangqi/index.js'

register('chess', { factory: createChessPlugin })
register('draughts', { factory: createDraughtsPlugin })
register('go', { factory: createGoPlugin })
register('shogi', { factory: createShogiPlugin })
register('xiangqi', { factory: createXiangqiPlugin })

export { register, get, has, getAll, getIds, createFactory, clear } from './registry.js'
export {
  createChessPlugin,
  createDraughtsPlugin,
  createGoPlugin,
  createShogiPlugin,
  createXiangqiPlugin,
}
