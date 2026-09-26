import { war } from './war.js'
import { climbing } from './climbing.js'
import { trickTaking } from './trick-taking.js'
import { shedding } from './shedding.js'
import { dominoes } from './dominoes.js'
import { scorecard } from './scorecard.js'
import { pressYourLuck } from './press-your-luck.js'
import { trains } from './trains.js'
import { branching } from './branching.js'

// The shapes of game the tableau plugin knows, by the name a game's
// frontmatter gives as `game:`.
export const MECHANICS = {
  war,
  climbing,
  'trick-taking': trickTaking,
  shedding,
  dominoes,
  scorecard,
  'press-your-luck': pressYourLuck,
  trains,
  branching,
}
