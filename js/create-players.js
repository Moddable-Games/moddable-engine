// Players and sides for the create page.
//
// The remaining half of engine#115's "Players and sides": `playerCount` was
// offered, names and per-player advancement direction were not. Without a
// direction a third and fourth seat inherit the two-player default, which is
// exactly the failure four-player-shogi shipped with — red advancing into its
// own army and green advancing backwards, because `advancement` was absent and
// `playerIndex === 0 ? -1 : 1` answered for all four seats.

export const DEFAULT_PLAYER_NAMES = {
  chess: ['white', 'black', 'red', 'green'],
  shogi: ['sente', 'gote', 'red', 'blue'],
  go: ['black', 'white'],
  draughts: ['white', 'black'],
  xiangqi: ['red', 'black'],
  reversi: ['black', 'white'],
}

// Which plugins read `config.advancement`, and in what shape. Chess and xiangqi
// take a scalar row direction; shogi takes either a scalar or a [dr, dc] vector,
// which is what a cross-shaped board needs. Anything absent from this table gets
// no direction control, because the key would not be consumed.
export const ADVANCEMENT_SHAPE = {
  chess: 'scalar',
  xiangqi: 'scalar',
  shogi: 'vector',
}

export const MAX_PLAYERS = { chess: 4, shogi: 4, xiangqi: 3, go: 2, draughts: 2, reversi: 2 }

const DIRECTION_VECTORS = {
  up: [-1, 0],
  down: [1, 0],
  right: [0, 1],
  left: [0, -1],
}

const SCALAR_DIRECTIONS = { up: -1, down: 1 }

export function defaultPlayers(family = 'chess') {
  const names = DEFAULT_PLAYER_NAMES[family] || DEFAULT_PLAYER_NAMES.chess
  return {
    count: 2,
    names: names.slice(0, 2),
    advancement: { 0: 'up', 1: 'down' },
  }
}

// Growing the seat count must grow the arrays with it. Leaving them short meant
// seats 3 and 4 had no name and no direction in the saved state, which is the
// same silence that produced four-player-shogi's wrong-way armies.
export function resizePlayers(players, count, family) {
  const fallback = DEFAULT_PLAYER_NAMES[family] || DEFAULT_PLAYER_NAMES.chess
  const names = (players?.names || []).slice(0, count)
  const advancement = {}
  for (let i = 0; i < count; i++) {
    if (!names[i]) names[i] = fallback[i] || `player${i + 1}`
    advancement[i] = players?.advancement?.[i] || defaultDirectionFor(i, count, family)
  }
  return { count, names, advancement }
}

// Two seats face each other. A third and fourth sit on the sides, which is the
// only arrangement any four-army board in the corpus uses.
function defaultDirectionFor(index, count, family) {
  if (count <= 2 || !ADVANCEMENT_SHAPE[family]) return index === 0 ? 'up' : 'down'
  if (ADVANCEMENT_SHAPE[family] !== 'vector') return index % 2 === 0 ? 'up' : 'down'
  return ['up', 'down', 'right', 'left'][index] || 'up'
}

export function directionOptions(family) {
  return ADVANCEMENT_SHAPE[family] === 'vector'
    ? [
        { value: 'up', label: 'Up' },
        { value: 'down', label: 'Down' },
        { value: 'left', label: 'Left' },
        { value: 'right', label: 'Right' },
      ]
    : [
        { value: 'up', label: 'Up' },
        { value: 'down', label: 'Down' },
      ]
}

// Returns { players, config } — the names array for engine.players, and the
// keys to merge into the plugin block. Emits nothing the plugin cannot read:
// two players facing up and down is the default everywhere, so it says nothing.
export function toPlayerConfig(family, players) {
  const count = Math.max(2, Number(players?.count) || 2)
  const fallback = DEFAULT_PLAYER_NAMES[family] || DEFAULT_PLAYER_NAMES.chess
  const names = []
  for (let i = 0; i < count; i++) {
    const given = (players?.names?.[i] || '').trim()
    names.push(given || fallback[i] || `player${i + 1}`)
  }

  const config = {}
  if (count > 2) config.playerCount = count

  const shape = ADVANCEMENT_SHAPE[family]
  if (shape) {
    const advancement = {}
    let differsFromDefault = count > 2
    for (let i = 0; i < count; i++) {
      const dir = players?.advancement?.[i] || (i === 0 ? 'up' : 'down')
      if (shape === 'vector') advancement[i] = DIRECTION_VECTORS[dir] || DIRECTION_VECTORS.up
      else advancement[i] = SCALAR_DIRECTIONS[dir] !== undefined ? SCALAR_DIRECTIONS[dir] : -1
      const expected = i === 0 ? 'up' : 'down'
      if (dir !== expected) differsFromDefault = true
    }
    if (differsFromDefault) config.advancement = advancement
  }

  return { players: names, config }
}

function directionFromValue(value, shape) {
  if (shape === 'vector' || Array.isArray(value)) {
    const v = Array.isArray(value) ? value : [value, 0]
    for (const [name, vec] of Object.entries(DIRECTION_VECTORS)) {
      if (vec[0] === v[0] && vec[1] === v[1]) return name
    }
    return 'up'
  }
  return value === 1 ? 'down' : 'up'
}

export function playersFromResolved(resolved, family) {
  const names = Array.isArray(resolved.players)
    ? resolved.players.slice()
    : (resolved.players?.names || []).slice()
  const block = resolved.plugins?.[family] || {}
  const count = Math.max(2, block.playerCount || names.length || 2)
  const shape = ADVANCEMENT_SHAPE[family]
  const advancement = {}
  for (let i = 0; i < count; i++) {
    const declared = block.advancement && typeof block.advancement !== 'function'
      ? block.advancement[i]
      : undefined
    advancement[i] = declared !== undefined
      ? directionFromValue(declared, shape)
      : (i === 0 ? 'up' : 'down')
  }
  const fallback = DEFAULT_PLAYER_NAMES[family] || DEFAULT_PLAYER_NAMES.chess
  const resolvedNames = []
  for (let i = 0; i < count; i++) resolvedNames.push(names[i] || fallback[i] || `player${i + 1}`)
  return { count, names: resolvedNames, advancement }
}

export function buildPlayersPanel(container, family, players, onChange) {
  container.innerHTML = ''
  const max = MAX_PLAYERS[family] || 2
  const shape = ADVANCEMENT_SHAPE[family]

  const countRow = document.createElement('div')
  countRow.className = 'rule-row'
  const countLabel = document.createElement('label')
  countLabel.className = 'control-label'
  countLabel.textContent = 'Number of players'
  countRow.appendChild(countLabel)
  const countSel = document.createElement('select')
  countSel.className = 'def-select'
  for (let n = 2; n <= max; n++) {
    const o = document.createElement('option')
    o.value = String(n)
    o.textContent = String(n)
    countSel.appendChild(o)
  }
  countSel.value = String(Math.min(players.count || 2, max))
  countSel.addEventListener('change', () => onChange('count', Number(countSel.value)))
  countRow.appendChild(countSel)
  if (max === 2) {
    const hint = document.createElement('div')
    hint.className = 'rule-hint'
    hint.textContent = `The ${family} plugin has no multiplayer semantics yet.`
    countRow.appendChild(hint)
  }
  container.appendChild(countRow)

  for (let i = 0; i < (players.count || 2); i++) {
    const row = document.createElement('div')
    row.className = 'rule-row player-row'

    const name = document.createElement('input')
    name.type = 'text'
    name.className = 'def-input'
    name.value = players.names?.[i] || ''
    name.placeholder = `Player ${i + 1}`
    name.addEventListener('change', () => onChange('name', name.value, i))
    row.appendChild(name)

    if (shape) {
      const dir = document.createElement('select')
      dir.className = 'def-select def-select--short'
      for (const opt of directionOptions(family)) {
        const o = document.createElement('option')
        o.value = opt.value
        o.textContent = opt.label
        dir.appendChild(o)
      }
      dir.value = players.advancement?.[i] || (i === 0 ? 'up' : 'down')
      dir.title = 'Which way this player advances'
      dir.addEventListener('change', () => onChange('direction', dir.value, i))
      row.appendChild(dir)
    }

    container.appendChild(row)
  }

  if (shape === 'vector' && (players.count || 2) > 2) {
    const hint = document.createElement('div')
    hint.className = 'rule-hint'
    hint.textContent = 'On a cross-shaped board the side armies advance left and right, not up and down. A seat left on the default advances into its own pieces.'
    container.appendChild(hint)
  }
}
