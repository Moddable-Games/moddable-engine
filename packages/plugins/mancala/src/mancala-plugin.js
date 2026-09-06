import { warnUnknownConfigKeys } from '../../../core/index.js'

// Every config key this plugin reads. Kept explicit rather than derived from
// `defaults`, which only lists the keys that carry a default value.
export const CONFIG_KEYS = new Set([
  'bonusTurnOnStore', 'captureChainBackwards', 'captureCounts', 'captureRule',
  'chooseDirection', 'cols', 'feedingObligation', 'grandSlamProhibited', 'hasStores',
  'namuaReserve', 'pitsPerSide',
  'playerCount', 'relay', 'rowsPerSide', 'setup', 'skipOpponentStore', 'skipOriginOnWrap',
  'sowIntoOwnStore', 'stores', 'winBy',
])

// Sowing games differ from every other family already here: a move is not a
// piece changing square but a fistful of seeds distributed one per pit around a
// circuit. The whole family is one loop plus a capture test, so the differences
// between kalah, oware and toguz korgool are configuration rather than code.
//
// Every variant in the family is now configuration. Bao was the last holdout
// and needed three axes rather than a branch: two rows a side with a private
// circuit per player, a direction chosen each turn, and a capture that empties
// the facing pit of the enemy inner row into the kichwa. A mancala variant
// played with the wrong capture rule looks like it works and silently is not
// the game, which is what the corpus guard is for.
export function createMancalaPlugin(variantConfig = {}, context = {}) {
  const defaults = {
    pitsPerSide: 6,
    playerCount: 2,
    // Sowing
    sowIntoOwnStore: true,     // kalah, sungka; false for toguz korgool
    skipOpponentStore: true,
    skipOriginOnWrap: false,   // oware and ayo skip the pit they lifted from
    relay: 'none',             // 'none' | 'nonEmpty' (sungka, congkak) | 'next' (pallanguzhi)
    bonusTurnOnStore: false,   // kalah, congkak
    // Capture
    captureRule: 'none',       // 'oppositeOnEmptyOwn' | 'countInEnemy' | 'evenInEnemy' | 'skipOneBeyond'
    captureCounts: [2, 3],     // for countInEnemy
    captureChainBackwards: false,
    grandSlamProhibited: false,
    feedingObligation: false,
    winBy: 'most',
  }

  const config = { ...defaults, ...variantConfig }
  warnUnknownConfigKeys('mancala', variantConfig, CONFIG_KEYS)

  // The topology owns the circuit. `stores` is what the corpus writes and
  // `hasStores` is what createPitTopology reads; accept either here too so the
  // plugin and the topology cannot disagree about the shape of the board.
  const declaredStores = config.hasStores !== undefined ? config.hasStores
    : config.stores !== undefined ? config.stores
    : true

  let topology = null
  let pitsPerSide = config.pitsPerSide
  let hasStores = declaredStores
  let totalPits = pitsPerSide * 2
  // Bao gives each player two rows rather than one. Everything below that says
  // "inner row" is meaningless on a one-row board and is guarded by this.
  let rowsPerSide = config.rowsPerSide || 1
  let cols = config.cols || pitsPerSide

  function storeIndex(player) { return hasStores ? totalPits + player : -1 }
  function isStore(idx) { return hasStores && idx >= totalPits }
  function ownsPit(idx, player) { return idx >= player * pitsPerSide && idx < (player + 1) * pitsPerSide }

  // Which pit faces which across the board.
  //
  // On one row a side the board is a ring and the facing pit is its mirror. On
  // Bao's two rows only the INNER rows face each other, and a player's inner row
  // runs left to right from where they sit - so it runs right to left from the
  // other side, and the mirror is within the row rather than across the whole
  // board.
  function opposite(idx) {
    if (rowsPerSide === 1) return totalPits - 1 - idx
    const player = Math.floor(idx / pitsPerSide)
    const withinSide = idx - player * pitsPerSide
    if (withinSide >= cols) return -1
    return (1 - player) * pitsPerSide + (cols - 1 - withinSide)
  }

  function isInnerPit(idx) {
    if (rowsPerSide === 1) return true
    return (idx - Math.floor(idx / pitsPerSide) * pitsPerSide) < cols
  }

  // The kichwa are the two ends of a player's inner row, and which one a capture
  // is sown into is what chooses the direction of the sowing that follows.
  function kichwaFor(player, direction) {
    const base = player * pitsPerSide
    return direction === 'clockwise' ? base : base + cols - 1
  }

  function innerRowSeeds(cells, player) {
    let n = 0
    for (let i = 0; i < cols; i++) n += cells[player * pitsPerSide + i]
    return n
  }

  // The circuit, in sowing order, for one player. Rebuilt per player because
  // which store is skipped depends on who is sowing.
  function circuitFor(player, direction) {
    // Bao is not one circuit shared by two players: a sow never leaves the
    // sower's own half. The ring runs along the inner row and back along the
    // outer, and the player picks which way round at the start of the turn.
    if (rowsPerSide === 2) {
      const base = player * pitsPerSide
      const ring = []
      for (let i = 0; i < cols; i++) ring.push(base + i)
      for (let i = cols - 1; i >= 0; i--) ring.push(base + cols + i)
      return direction === 'clockwise' ? [ring[0], ...ring.slice(1).reverse()] : ring
    }
    const path = []
    for (let i = 0; i < pitsPerSide; i++) path.push(i)
    if (hasStores) path.push(totalPits)
    for (let i = pitsPerSide; i < totalPits; i++) path.push(i)
    if (hasStores) path.push(totalPits + 1)
    return path.filter(pos => {
      if (!isStore(pos)) return true
      const owner = pos - totalPits
      if (owner !== player) return !config.skipOpponentStore
      return config.sowIntoOwnStore
    })
  }

  function boardFromSetup(setup) {
    const cells = new Array(totalPits + (hasStores ? 2 : 0)).fill(0)
    if (!setup) {
      for (let i = 0; i < totalPits; i++) cells[i] = 4
      return cells
    }
    // "4,4,4,4,4,4;0;4,4,4,4,4,4;0" - pits then store, per player
    const parts = String(setup).split(';')
    let cursor = 0
    for (let p = 0; p < 2; p++) {
      const pits = (parts[cursor++] || '').split(',').map(n => parseInt(n, 10) || 0)
      for (let i = 0; i < pitsPerSide; i++) cells[p * pitsPerSide + i] = pits[i] || 0
      if (hasStores) cells[storeIndex(p)] = parseInt(parts[cursor++], 10) || 0
      else if (parts[cursor] !== undefined && !String(parts[cursor]).includes(',')) cursor++
    }
    return cells
  }

  function currentPlayer(full) {
    return full && full.__players ? full.__players.currentIndex : 0
  }

  function seedsOnSide(cells, player) {
    let n = 0
    for (let i = player * pitsPerSide; i < (player + 1) * pitsPerSide; i++) n += cells[i]
    return n
  }

  // One sow, including any relay laps. Returns the resulting cells, the index
  // the final seed landed in, and whether the sow ended in the sower's store.
  function sow(cells, from, player) {
    const out = [...cells]
    const circuit = circuitFor(player)
    let origin = from
    let landed = from

    for (let lap = 0; lap < 512; lap++) {
      let seeds = out[origin]
      out[origin] = 0
      let pos = circuit.indexOf(origin)
      while (seeds > 0) {
        pos = (pos + 1) % circuit.length
        const target = circuit[pos]
        if (config.skipOriginOnWrap && target === origin) continue
        out[target]++
        seeds--
        landed = target
      }

      // Pallanguzhi lifts the pit AFTER the last seed rather than the pit the
      // last seed fell into, and keeps going while that pit has something in
      // it. The sow ends when it is empty - and that empty pit is what the
      // skip-one capture is measured from.
      if (config.relay === 'next') {
        const nextCell = circuit[(circuit.indexOf(landed) + 1) % circuit.length]
        if (isStore(nextCell) || out[nextCell] === 0) break
        origin = nextCell
        continue
      }

      if (config.relay !== 'nonEmpty') break
      // Relay: landing in an occupied pit lifts it and sows again. Landing in a
      // store, or in a pit that was empty before this seed, ends the turn.
      if (isStore(landed)) break
      if (out[landed] <= 1) break
      origin = landed
    }

    return { cells: out, landed, endedInOwnStore: hasStores && landed === storeIndex(player) }
  }

  // Oware and ayo have no stores on the board: captured seeds are held by the
  // player off to the side. Without somewhere to put them a capture either
  // deletes seeds or never fires, so the slice carries a held count and the
  // store, when there is one, is just a visible version of the same thing.
  function applyCapture(cells, landed, player) {
    const out = [...cells]
    if (isStore(landed)) return { cells: out, captured: 0 }
    const store = storeIndex(player)
    let captured = 0

    if (config.captureRule === 'oppositeOnEmptyOwn') {
      // kalah, sungka, congkak: last seed into an empty pit of your own, with
      // seeds facing it.
      if (ownsPit(landed, player) && out[landed] === 1) {
        const opp = opposite(landed)
        if (out[opp] > 0) {
          captured = out[opp] + (config.relay === 'nonEmpty' ? 0 : out[landed])
          out[opp] = 0
          if (config.relay !== 'nonEmpty') out[landed] = 0
          if (store >= 0) out[store] += captured
        }
      }
    } else if (config.captureRule === 'countInEnemy') {
      // oware, ayo: last seed makes 2 or 3 in an enemy pit, then chain backwards.
      if (!ownsPit(landed, player) && config.captureCounts.includes(out[landed])) {
        const circuit = circuitFor(player)
        let pos = circuit.indexOf(landed)
        const taken = []
        while (pos >= 0) {
          const cell = circuit[pos]
          if (isStore(cell) || ownsPit(cell, player)) break
          if (!config.captureCounts.includes(out[cell])) break
          taken.push(cell)
          if (!config.captureChainBackwards) break
          pos = (pos - 1 + circuit.length) % circuit.length
        }
        for (const cell of taken) { captured += out[cell]; out[cell] = 0 }
        if (store >= 0) out[store] += captured
      }
    } else if (config.captureRule === 'skipOneBeyond') {
      // Pallanguzhi. The sow stopped because the pit after the last seed was
      // empty; skip that pit and take the one beyond it, on either side of the
      // board. Then check again from there, so a run of alternating empty and
      // seeded pits is taken in one turn.
      const circuit = circuitFor(player)
      let pos = circuit.indexOf(landed)
      for (let guard = 0; pos >= 0 && guard < circuit.length; guard++) {
        const gap = circuit[(pos + 1) % circuit.length]
        const beyond = circuit[(pos + 2) % circuit.length]
        if (isStore(gap) || isStore(beyond)) break
        if (out[gap] !== 0) break
        if (out[beyond] === 0) break
        captured += out[beyond]
        out[beyond] = 0
        pos = (pos + 2) % circuit.length
      }
      if (store >= 0) out[store] += captured
    } else if (config.captureRule === 'evenInEnemy') {
      // toguz korgool: last seed makes an even count in an enemy pit.
      if (!ownsPit(landed, player) && out[landed] > 0 && out[landed] % 2 === 0) {
        captured = out[landed]
        out[landed] = 0
        if (store >= 0) out[store] += captured
      }
    }

    return { cells: out, captured }
  }

  // Bao's sow, which differs from every other variant here in that the capture
  // is tested after each individual lap rather than once at the end.
  //
  //   "If the last seed lands in a non-empty pit, pick up all seeds in that pit
  //    and continue sowing."
  //   "If the final seed of a sow lands in a pit directly opposite a non-empty
  //    opponent inner-row pit, capture the opponent's seeds from that pit.
  //    Place captured seeds into your kichwa ... then sow from the kichwa."
  //
  // So a turn is a chain of sowings joined either by a relay or by a capture,
  // and it ends when a lap finishes in a pit that was empty before that seed.
  function sowBao(cells, from, player, direction) {
    const out = [...cells]
    let captured = 0
    let origin = from
    let landed = from

    for (let lap = 0; lap < 512; lap++) {
      const circuit = circuitFor(player, direction)
      let seeds = out[origin]
      out[origin] = 0
      let pos = circuit.indexOf(origin)
      while (seeds > 0) {
        pos = (pos + 1) % circuit.length
        landed = circuit[pos]
        out[landed]++
        seeds--
      }

      const facing = isInnerPit(landed) ? opposite(landed) : -1
      if (facing >= 0 && out[facing] > 0) {
        const taken = out[facing]
        out[facing] = 0
        captured += taken
        const kichwa = kichwaFor(player, direction)
        out[kichwa] += taken
        origin = kichwa
        continue
      }

      if (out[landed] <= 1) break
      origin = landed
    }

    return { cells: out, landed, captured }
  }

  function resolveMove(cells, from, player, direction) {
    if (config.captureRule === 'oppositeInnerRow') {
      const result = sowBao(cells, from, player, direction)
      return { cells: result.cells, landed: result.landed, captured: result.captured, endedInOwnStore: false }
    }
    const sown = sow(cells, from, player)
    const after = applyCapture(sown.cells, sown.landed, player)
    return { cells: after.cells, landed: sown.landed, captured: after.captured, endedInOwnStore: sown.endedInOwnStore }
  }

  function rawMoves(cells, player) {
    const out = []
    for (let i = player * pitsPerSide; i < (player + 1) * pitsPerSide; i++) {
      // `to` is the board coordinate the renderer labels the pit with, so a
      // click can be matched to a move. `pit` stays for the sowing itself.
      if (cells[i] > 0) out.push({ action: 'sow', pit: i, to: `pit-${i}` })
    }
    return out
  }

  // Oware and ayo forbid a move that would strip the opponent bare, and oblige
  // you to feed them when they already are. Both are filters over the raw list
  // rather than special cases inside the sow, so a variant that declares
  // neither behaves exactly as before.
  // Bao is played in two phases. Namua introduces seeds from a reserve, one a
  // turn, into a non-empty pit of the player's own inner row; mtaji begins when
  // both reserves are spent and sows from any non-empty pit. In both, a capture
  // must be played if one is available, and the direction of the sowing is the
  // player's choice each turn.
  function baoMoves(slice, player) {
    const cells = slice.board
    const inNamua = (slice.reserve || [0, 0])[player] > 0
    const base = player * pitsPerSide
    const directions = config.chooseDirection === false ? [undefined] : ['counterclockwise', 'clockwise']
    const out = []

    const from = inNamua
      ? Array.from({ length: cols }, (_, i) => base + i).filter(i => cells[i] > 0)
      : Array.from({ length: pitsPerSide }, (_, i) => base + i).filter(i => cells[i] > 0)

    for (const pit of from) {
      for (const direction of directions) {
        const probe = inNamua ? cells.map((n, i) => (i === pit ? n + 1 : n)) : cells
        const result = sowBao(probe, pit, player, direction)
        out.push({
          action: inNamua ? 'namua' : 'sow',
          pit,
          direction,
          to: `pit-${pit}`,
          captures: result.captured,
        })
      }
    }

    const capturing = out.filter(m => m.captures > 0)
    return capturing.length ? capturing : out
  }

  function legalMoves(cells, player) {
    let moves = rawMoves(cells, player)
    if (!moves.length) return moves
    const opponent = 1 - player

    if (config.feedingObligation && seedsOnSide(cells, opponent) === 0) {
      const feeding = moves.filter(m => seedsOnSide(resolveMove(cells, m.pit, player).cells, opponent) > 0)
      if (feeding.length) moves = feeding
    }

    if (config.grandSlamProhibited) {
      const notSlam = moves.filter(m => {
        const after = resolveMove(cells, m.pit, player)
        return !(after.captured > 0 && seedsOnSide(after.cells, opponent) === 0)
      })
      if (notSlam.length) moves = notSlam
    }

    return moves
  }

  function finalScores(cells, held = [0, 0]) {
    const scores = [0, 0]
    for (let p = 0; p < 2; p++) {
      scores[p] = seedsOnSide(cells, p) + (hasStores ? cells[storeIndex(p)] : held[p])
    }
    return scores
  }

  return {
    sliceName: 'mancala',
    // `applyMove` returns a new slice and does not touch the one it is handed,
    // so the search does not have to hand it a private copy. Proved rather than
    // asserted: `applymove-is-pure.test.js` plays every playable variant and
    // fails if any of them changes the slice it was given.
    pureApplyMove: true,
    pieceTypes: ['seed'],
    vocabulary: { seed: { symbols: { 0: 's', 1: 'S' } } },
    config,
    rules: ['sowing', 'capture.mancala'],

    init(pluginConfig, { request }) {
      topology = request('core.topology')
      if (topology) {
        if (typeof topology.getPitsPerSide === 'function') pitsPerSide = topology.getPitsPerSide()
        if (typeof topology.getTotalPits === 'function') totalPits = topology.getTotalPits()
        if (typeof topology.storeIndex === 'function') hasStores = topology.storeIndex(0) >= 0
      }
      totalPits = pitsPerSide * 2
      const setup = pluginConfig.setup || config.setup || null
      if (topology) {
        if (typeof topology.getRowsPerSide === 'function') rowsPerSide = topology.getRowsPerSide()
        if (typeof topology.getCols === 'function') cols = topology.getCols()
      }
      const state = { board: boardFromSetup(setup), held: [0, 0], _pitsPerSide: pitsPerSide, _hasStores: hasStores, lastLanded: null, lastCaptured: 0 }
      // The reserve each player introduces during namua. Declared rather than
      // derived: it is a property of the ruleset, not of the board.
      if (config.namuaReserve) state.reserve = [config.namuaReserve, config.namuaReserve]
      return state
    },

    validateMove(move, slice, full) {
      const player = currentPlayer(full)
      if (move.action === 'resign') return true
      if (config.captureRule === 'oppositeInnerRow') {
        return baoMoves(slice, player).some(m =>
          m.pit === move.pit && m.action === move.action && m.direction === move.direction)
      }
      if (move.action !== 'sow') return false
      if (!Number.isInteger(move.pit)) return false
      return legalMoves(slice.board, player).some(m => m.pit === move.pit)
    },

    applyMove(move, slice, full) {
      const player = currentPlayer(full)
      let board = slice.board
      let reserve = slice.reserve
      if (move.action === 'namua') {
        board = board.slice()
        board[move.pit]++
        reserve = (slice.reserve || [0, 0]).slice()
        reserve[player]--
      }
      const result = resolveMove(board, move.pit, player, move.direction)
      const held = [...(slice.held || [0, 0])]
      // Bao's captures are not taken off the board: they go into the kichwa and
      // are sown on from there, which is why it can go on for hundreds of plies.
      // Adding them to `held` as well counted every captured seed twice.
      if (!hasStores && config.captureRule !== 'oppositeInnerRow') held[player] += result.captured
      const next = { ...slice, board: result.cells, held, lastLanded: result.landed, lastCaptured: result.captured }
      if (reserve) next.reserve = reserve
      return next
    },

    getLegalMoves(slice, full) {
      const player = currentPlayer(full)
      if (config.captureRule === 'oppositeInnerRow') return baoMoves(slice, player)
      return legalMoves(slice.board, player)
    },

    // A bonus turn is the turn system's business, not the move's, so it is
    // reported rather than applied here.
    continuesTurn(move, slice, full) {
      if (!config.bonusTurnOnStore) return false
      const player = currentPlayer(full)
      return resolveMove(slice.board, move.pit, player).endedInOwnStore
    },

    checkWin(slice, full) {
      const cells = slice.board
      const player = currentPlayer(full)

      // "The game ends when a player is left without seeds in his or her inner
      // row, or when he or she cannot move anymore. In both cases, this player
      // loses" - so Bao is decided by who is left standing, not by a count.
      if (config.captureRule === 'oppositeInnerRow') {
        for (const seat of [0, 1]) {
          if (innerRowSeeds(cells, seat) === 0) return 1 - seat
        }
        if (baoMoves(slice, player).length === 0) return 1 - player
        return null
      }

      const starved = seedsOnSide(cells, 0) === 0 || seedsOnSide(cells, 1) === 0
      if (!starved && legalMoves(cells, player).length > 0) return null

      const scores = finalScores(cells, slice.held)
      if (scores[0] === scores[1]) return 'draw'
      const leader = scores[0] > scores[1] ? 0 : 1
      return config.winBy === 'fewest' ? 1 - leader : leader
    },
  }
}

createMancalaPlugin.interaction = 'select'

// A mancala slice holds seed counts per pit, not pieces on squares. Guards that
// walk `slice.board` and match one piece image per occupied cell do not apply,
// and would otherwise throw rather than skip. Declared here so the guard can
// name what it is skipping instead of inferring it from a missing field.
createMancalaPlugin.configKeys = CONFIG_KEYS
