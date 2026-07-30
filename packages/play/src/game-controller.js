import { interactionModelFor, availableActions } from './interaction.js'

export function createGameController(game, opts = {}) {
  const players = opts.players || {}
  let aiDifficulty = opts.aiDifficulty || 'medium'
  let renderOpts = opts.renderOpts || {}

  const onMove = opts.onMove || null
  const onGameEnd = opts.onGameEnd || null
  const onTurnChange = opts.onTurnChange || null
  const onSelect = opts.onSelect || null
  const onRender = opts.onRender || null
  const onUndo = opts.onUndo || null
  const onChoiceNeeded = opts.onChoiceNeeded || null
  const onPendingAction = opts.onPendingAction || null
  const onPendingActionEnd = opts.onPendingActionEnd || null

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
      onRender(game, {
        selected,
        lastMove,
        flipped,
        aiThinking,
        gameOver,
        legalMoves: selected !== null ? getLegalMovesFrom(selected) : [],
      })
    }
  }

  function handleClick(pos) {
    if (destroyed || gameOver) return
    if (!isHuman(currentPlayer())) return

    const moves = getLegalMoves()
    const result = interaction.handleClick(pos, {
      selected,
      chainAnchor,
      dropType,
      moves,
      playerIndex: getPlayerIndex(),
      getOwnerAt: (p) => {
        const piece = getPieceAt(p)
        if (!piece) return null
        return typeof piece.owner === 'number' ? piece.owner : getPlayerIndexOf(piece.owner)
      },
    })

    applyInteractionResult(result, moves)
  }

  function applyInteractionResult(result, moves) {
    if (!result) return

    switch (result.type) {
      case 'select': {
        selected = result.pos
        const piece = getPieceAt(result.pos)
        if (onSelect) onSelect(result.pos, piece, interaction.targetsFor(result.pos, moves))
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
    if (!interaction.handleHandClick) return
    const moves = getLegalMoves()
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

  function getPieceAt(pos) {
    const sliceName = findBoardSlice()
    if (!sliceName) return null
    const state = game.getState(sliceName)
    if (!state || !state.board) return null
    return state.board[pos] || null
  }

  function findBoardSlice() {
    if (game.registry && game.registry.getAll) {
      const plugins = game.registry.getAll()
      for (const p of plugins) {
        const state = game.getState(p.sliceName)
        if (state && state.board) return p.sliceName
      }
    }
    const names = ['chess', 'go', 'draughts', 'shogi', 'xiangqi']
    for (const name of names) {
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
    const result = game.execute(move)

    if (!result || !result.ok) return false

    undoStack.push(move)
    redoStack = []
    lastMove = describeLastMove(move)
    selected = null

    if (onMove) onMove(move, player)

    if (result.winner) {
      gameOver = true
      chainAnchor = null
      if (onGameEnd) onGameEnd(result.winner)
      render()
      return true
    }

    if (result.continueTurn) {
      chainAnchor = move.to !== undefined ? move.to : null
      selected = chainAnchor
      if (onActionsChange) onActionsChange(getAvailableActions())
      render()
      return true
    }

    chainAnchor = null

    if (onTurnChange) onTurnChange(currentPlayer())
    if (onActionsChange) onActionsChange(getAvailableActions())

    render()
    checkGameEnd()

    if (!gameOver && isAI(currentPlayer())) {
      scheduleAIMove()
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
    if (plugin && plugin.checkWin) {
      const outcome = plugin.checkWin(game.getState(plugin.sliceName), game.store.getAll())
      if (outcome !== null && outcome !== undefined) {
        gameOver = true
        if (onGameEnd) onGameEnd(outcome)
        return
      }
    }

    const moves = getLegalMoves()
    if (moves.length === 0) {
      gameOver = true
      if (onGameEnd) onGameEnd('draw')
    }
  }

  function findPlugin() {
    if (!game.registry || !game.registry.getPlugins) return null
    const plugins = game.registry.getPlugins()
    if (family) {
      const match = plugins.find(p => p.sliceName === family)
      if (match) return match
    }
    return plugins[0] || null
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
    } else {
      const moves = getLegalMoves()
      if (moves.length > 0) {
        move = moves[Math.floor(Math.random() * moves.length)]
      }
    }

    if (!move) { aiThinking = false; render(); return }

    const player = currentPlayer()
    const result = game.execute(move)
    if (!result || !result.ok) { aiThinking = false; render(); return }

    undoStack.push(move)
    redoStack = []
    lastMove = describeLastMove(move)

    if (onMove) onMove(move, player)

    if (result.winner) {
      gameOver = true
      aiThinking = false
      if (onGameEnd) onGameEnd(result.winner)
      render()
      return
    }

    aiThinking = false
    if (onTurnChange) onTurnChange(currentPlayer())
    render()
    checkGameEnd()

    if (!gameOver && isAI(currentPlayer())) {
      scheduleAIMove()
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
  }
}
