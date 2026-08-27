import { interactionModelFor, availableActions, modelForMoves } from './interaction.js'
import { findFamilyPlugin } from './find-plugin.js'
import { getFamilies } from './play.js'

export function createGameController(game, opts = {}) {
  const players = opts.players || {}
  let aiDifficulty = opts.aiDifficulty || 'medium'
  let renderOpts = opts.renderOpts || {}

  const onMove = opts.onMove || null
  const onBeforeMove = opts.onBeforeMove || null
  const onGameEnd = opts.onGameEnd || null
  const onTurnChange = opts.onTurnChange || null
  const onSelect = opts.onSelect || null
  const onRender = opts.onRender || null
  const onUndo = opts.onUndo || null
  const onChoiceNeeded = opts.onChoiceNeeded || null
  const onPendingAction = opts.onPendingAction || null
  const onPendingActionEnd = opts.onPendingActionEnd || null
  const onAnimateMove = opts.onAnimateMove || null

  const aiPickMove = opts.aiPickMove || null

  const family = opts.family || null
  const interaction = opts.interaction || interactionModelFor(family, opts.interactionModel)
  const onActionsChange = opts.onActionsChange || null
  const onDropArmed = opts.onDropArmed || null

  let selected = null
  let lastMove = null
  let undoStack = []
  let redoStack = []
  let flipped = false
  let aiThinking = false
  let gameOver = false
  let destroyed = false
  let chainAnchor = null
  let dropType = null

  function isHuman(playerName) {
    return players[playerName] !== 'ai'
  }

  function isAI(playerName) {
    return players[playerName] === 'ai'
  }

  function currentPlayer() {
    return game.currentPlayer()
  }

  function getLegalMoves() {
    return game.getLegalMoves()
  }

  function getLegalMovesFrom(pos) {
    return getLegalMoves().filter(m => String(m.from) === String(pos))
  }

  function isGameOverCheck() {
    if (gameOver) return true
    return false
  }

  function render() {
    if (destroyed) return
    if (onRender) {
      let movesForDisplay = []
      if (selected !== null) {
        movesForDisplay = getLegalMovesFrom(selected)
      } else if (!gameOver && !aiThinking) {
        const all = getLegalMoves()
        // Determine if moves are "from-less" — placement moves have no from property.
        // This includes: Go stone placement (coord), duck placement (action + to),
        // sittuyin placement, crazyhouse drops (when armed).
        // The routing rule is a property of the move shape, not a list of variant names.
        const hasFrom = all.some(m => m.from !== undefined)
        const actionOnly = all.every(m => m.action && m.from === undefined)
        if (actionOnly) {
          movesForDisplay = dropType
            ? all.filter(m => m.type === dropType)
            : all
        } else if (!hasFrom) {
          // All moves are from-less placements — show all targets
          movesForDisplay = dropType
            ? all.filter(m => m.type === dropType)
            : all
        } else if (dropType) {
          // Drop armed: show targets for the armed type
          movesForDisplay = all.filter(m => m.drop === dropType || m.type === dropType)
        }
      }
      onRender(game, {
        selected,
        lastMove,
        flipped,
        aiThinking,
        gameOver,
        dropType,
        legalMoves: movesForDisplay,
      })
    }
  }

  function handleClick(pos) {
    if (destroyed || gameOver) return
    if (!isHuman(currentPlayer())) return

    const moves = getLegalMoves()

    if (selected === null && chainAnchor === null) {
      const actionHits = moves.filter(m => m.action && m.from === undefined && String(m.to) === String(pos))
      if (actionHits.length > 0) {
        if (dropType) {
          const match = actionHits.find(m => m.type === dropType)
          if (match) { dropType = null; executeMove(match); return }
          dropType = null
          render()
          return
        }
        const uniqueTypes = [...new Set(actionHits.map(m => m.type).filter(Boolean))]
        if (uniqueTypes.length <= 1) {
          executeMove(actionHits[0])
          return
        }
        if (onChoiceNeeded) {
          onChoiceNeeded(uniqueTypes, currentPlayer(), (chosen) => {
            const match = actionHits.find(m => m.type === chosen)
            if (match) executeMove(match)
          })
          return
        }
        executeMove(actionHits[0])
        return
      }
    }

    // The model is chosen from the moves actually on offer, because a family
    // can need more than one over a game. Morris places, then moves.
    const model = modelForMoves(interaction, moves)

    const result = model.handleClick(pos, {
      selected,
      chainAnchor,
      dropType,
      moves,
      playerIndex: getPlayerIndex(),
      getOwnerAt: (p) => ownerAt(p),
    })

    applyInteractionResult(result, moves)
  }

  function applyInteractionResult(result, moves) {
    if (!result) return

    switch (result.type) {
      case 'select': {
        selected = result.pos
        const piece = getPieceAt(result.pos)
        if (onSelect) onSelect(result.pos, piece, modelForMoves(interaction, moves).targetsFor(result.pos, moves))
        render()
        break
      }
      case 'deselect': {
        selected = null
        render()
        break
      }
      case 'choice': {
        if (onChoiceNeeded) {
          onChoiceNeeded(result.choices, currentPlayer(), (chosen) => {
            const move = result.candidates.find(m => m[result.choiceKey] === chosen)
            if (move) executeMove(move)
          })
        } else {
          executeMove(result.candidates[0])
        }
        break
      }
      case 'arm-drop': {
        dropType = result.dropType
        selected = null
        if (onDropArmed) onDropArmed(result.dropType)
        render()
        break
      }
      case 'move': {
        if (result.clearsDrop) dropType = null
        executeMove(result.move)
        break
      }
      case 'reject': {
        if (result.clearsDrop) dropType = null
        render()
        break
      }
      default:
        break
    }
  }

  function handleHandClick(pieceType) {
    if (destroyed || gameOver) return
    if (!isHuman(currentPlayer())) return
    const moves = getLegalMoves()
    const hasActionType = moves.some(m => m.action && m.from === undefined && m.type === pieceType)
    if (hasActionType) {
      dropType = pieceType
      selected = null
      if (onDropArmed) onDropArmed(pieceType)
      render()
      return
    }
    if (!interaction.handleHandClick) return
    applyInteractionResult(interaction.handleHandClick(pieceType, { moves, dropType }), moves)
  }

  function performAction(action) {
    if (destroyed || gameOver) return false
    if (!isHuman(currentPlayer())) return false

    if (action === 'resign') {
      gameOver = true
      const loser = currentPlayer()
      if (onGameEnd) onGameEnd({ result: 'resign', loser })
      render()
      return true
    }

    const moves = getLegalMoves()
    const move = moves.find(m => m.action === action)
    if (!move) return false
    return executeMove(move)
  }

  function getAvailableActions() {
    if (gameOver) return []
    return availableActions(getLegalMoves())
  }

  function getPlayerIndexOf(name) {
    const names = game.playerSystem
      ? game.playerSystem.getAll()
      : game.definition?.players?.names || []
    const idx = names.indexOf(name)
    return idx === -1 ? null : idx
  }

  // Who owns what is in a cell. A cell is not always an object: chess stores a
  // piece with an `owner`, morris and hex store the seat index itself, and some
  // boards store a colour name. Reading `.owner` off a number gives undefined,
  // which is how every morris piece came to have no owner and no piece could be
  // selected to move.
  function ownerAt(pos) {
    const cell = getPieceAt(pos)
    if (cell === null || cell === undefined) return null
    if (typeof cell === 'number') return cell
    if (typeof cell === 'string') return getPlayerIndexOf(cell)
    if (typeof cell.owner === 'number') return cell.owner
    if (typeof cell.owner === 'string') return getPlayerIndexOf(cell.owner)
    return null
  }

  function getPieceAt(pos) {
    const sliceName = findBoardSlice()
    if (!sliceName) return null
    const state = game.getState(sliceName)
    if (!state || !state.board) return null
    // `|| null` again. Morris and hex store a bare seat index in the cell, so
    // every piece belonging to seat 0 read as an empty square and the player
    // could not select one. An empty cell is `null` or `undefined`; zero is a
    // player.
    const cell = state.board[pos]
    return cell === undefined ? null : cell
  }

  function findBoardSlice() {
    if (game.registry && game.registry.getAll) {
      const plugins = game.registry.getAll()
      for (const p of plugins) {
        const state = game.getState(p.sliceName)
        if (state && state.board) return p.sliceName
      }
    }
    for (const name of getFamilies()) {
      const state = game.getState(name)
      if (state && state.board) return name
    }
    return null
  }

  function getPlayerIndex() {
    const names = game.playerSystem
      ? game.playerSystem.getAll()
      : game.definition?.players?.names || []
    return names.indexOf(currentPlayer())
  }

  function executeMove(move) {
    const player = currentPlayer()
    if (onBeforeMove) onBeforeMove(move, player)
    const result = game.execute(move)

    if (!result || !result.ok) return false

    undoStack.push(move)
    redoStack = []
    lastMove = describeLastMove(move)
    selected = null

    if (onMove) onMove(move, player)

    if (result.winner !== null && result.winner !== undefined) {
      gameOver = true
      chainAnchor = null
      if (onGameEnd) onGameEnd(result.winner)
      render()
      return true
    }

    if (result.continueTurn) {
      const nextMoves = getLegalMoves()
      const hasFromMoves = nextMoves.some(m => m.from !== undefined)
      if (hasFromMoves) {
        chainAnchor = move.to !== undefined ? move.to : null
        selected = chainAnchor
      } else {
        chainAnchor = null
        selected = null
      }
      if (onActionsChange) onActionsChange(getAvailableActions())
      render()
      return true
    }

    chainAnchor = null

    if (onTurnChange) onTurnChange(currentPlayer())
    if (onActionsChange) onActionsChange(getAvailableActions())

    const afterRender = () => {
      render()
      checkGameEnd()
      if (!gameOver && isAI(currentPlayer())) {
        scheduleAIMove()
      }
    }

    if (onAnimateMove && move.from !== undefined && move.to !== undefined) {
      onAnimateMove(move, { lastMove, player }, afterRender)
    } else {
      afterRender()
    }

    return true
  }

  function describeLastMove(move) {
    if (move.from !== undefined && move.to !== undefined) {
      return { from: move.from, to: move.to }
    }
    if (move.coord !== undefined) {
      return { from: null, to: move.coord, placed: true }
    }
    if (move.action) {
      return { action: move.action }
    }
    return { from: move.from ?? null, to: move.to ?? null }
  }

  function checkGameEnd() {
    const plugin = findPlugin()
    if (plugin) {
      const slice = game.getState(plugin.sliceName)
      if (slice && slice.phase && slice.phase !== 'play') return
    }

    const moves = getLegalMoves()

    if (plugin && plugin.checkWin) {
      const outcome = plugin.checkWin(game.getState(plugin.sliceName), game.store.getAll())
      if (outcome !== null && outcome !== undefined) {
        gameOver = true
        if (onGameEnd) onGameEnd(outcome)
        return
      }
    }

    if (moves.length === 0) {
      gameOver = true
      if (onGameEnd) onGameEnd('draw')
    }
  }

  function findPlugin() {
    if (!game.registry || !game.registry.getPlugins) return null
    return findFamilyPlugin(game.registry.getPlugins(), family)
  }

  function scheduleAIMove() {
    aiThinking = true
    render()
    setTimeout(doAIMove, 150)
  }

  function doAIMove() {
    if (destroyed || gameOver) { aiThinking = false; render(); return }

    let move = null
    if (aiPickMove) {
      move = aiPickMove(game, { difficulty: aiDifficulty })
    }
    if (!move) {
      const moves = getLegalMoves()
      if (moves.length > 0) {
        move = moves[Math.floor(Math.random() * moves.length)]
      }
    }

    if (!move) { aiThinking = false; render(); return }

    const player = currentPlayer()
    if (onBeforeMove) onBeforeMove(move, player)
    const result = game.execute(move)
    if (!result || !result.ok) { aiThinking = false; render(); return }

    undoStack.push(move)
    redoStack = []
    lastMove = describeLastMove(move)

    if (onMove) onMove(move, player)

    if (result.winner !== null && result.winner !== undefined) {
      gameOver = true
      aiThinking = false
      if (onGameEnd) onGameEnd(result.winner)
      render()
      return
    }

    aiThinking = false
    if (onTurnChange) onTurnChange(currentPlayer())

    const afterAIRender = () => {
      render()
      checkGameEnd()
      if (!gameOver && isAI(currentPlayer())) {
        scheduleAIMove()
      }
    }

    if (onAnimateMove && move.from !== undefined && move.to !== undefined) {
      onAnimateMove(move, { lastMove, player }, afterAIRender)
    } else {
      afterAIRender()
    }
  }

  function undo() {
    if (undoStack.length === 0 || aiThinking) return false
    const move = undoStack.pop()
    game.undo()
    redoStack.push(move)

    if (isAI(currentPlayer()) && undoStack.length > 0) {
      const move2 = undoStack.pop()
      game.undo()
      redoStack.push(move2)
    }

    selected = null
    chainAnchor = null
    dropType = null
    gameOver = false
    lastMove = undoStack.length > 0
      ? describeLastMove(undoStack[undoStack.length - 1])
      : null

    if (onUndo) onUndo()
    render()
    return true
  }

  function forfeit() {
    gameOver = true
    if (onGameEnd) onGameEnd('forfeit')
    render()
  }

  function setDifficulty(level) {
    aiDifficulty = level
  }

  function setFlipped(val) {
    flipped = val
    render()
  }

  function setSelected(pos) {
    selected = pos
    render()
  }

  function getState() {
    return { aiThinking, gameOver, selected, lastMove, flipped, chainAnchor, dropType, undoCount: undoStack.length }
  }

  function destroy() {
    destroyed = true
  }

  render()

  if (isAI(currentPlayer())) {
    scheduleAIMove()
  }

  return {
    handleClick,
    handleHandClick,
    performAction,
    getAvailableActions,
    executeMove,
    undo,
    forfeit,
    setDifficulty,
    setFlipped,
    setSelected,
    getState,
    getLegalMoves,
    currentPlayer,
    render,
    destroy,
    setRenderOpts(next) { renderOpts = { ...renderOpts, ...next } },
  }
}
