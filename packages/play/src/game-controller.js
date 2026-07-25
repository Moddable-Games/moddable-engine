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

  let selected = null
  let lastMove = null
  let undoStack = []
  let redoStack = []
  let flipped = false
  let aiThinking = false
  let gameOver = false
  let destroyed = false

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
    return getLegalMoves().filter(m => m.from === pos)
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

    const allMoves = getLegalMoves()

    if (selected !== null) {
      const candidates = allMoves.filter(m => m.from === selected && m.to === pos)

      if (candidates.length > 1 && candidates[0].promotion) {
        if (onChoiceNeeded) {
          const choices = [...new Set(candidates.map(m => m.promotion))]
          onChoiceNeeded(choices, currentPlayer(), (chosen) => {
            const move = candidates.find(m => m.promotion === chosen)
            if (move) executeMove(move)
          })
        } else {
          executeMove(candidates[0])
        }
        return
      }

      if (candidates.length > 0) {
        executeMove(candidates[0])
        return
      }
    }

    const piece = getPieceAt(pos)
    if (piece && piece.owner === getPlayerIndex()) {
      selected = pos
      if (onSelect) onSelect(pos, piece, allMoves.filter(m => m.from === pos))
    } else {
      selected = null
    }
    render()
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
    const names = ['chess', 'go', 'draughts', 'reversi', 'halma', 'hex', 'morris', 'mancala', 'backgammon', 'race', 'shogi', 'xiangqi']
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
    lastMove = { from: move.from, to: move.to }
    selected = null

    if (onMove) onMove(move, player)

    if (result.winner) {
      gameOver = true
      if (onGameEnd) onGameEnd(result.winner)
      render()
      return true
    }

    if (onTurnChange) onTurnChange(currentPlayer())

    render()
    checkGameEnd()

    if (!gameOver && isAI(currentPlayer())) {
      scheduleAIMove()
    }

    return true
  }

  function checkGameEnd() {
    const moves = getLegalMoves()
    if (moves.length === 0) {
      gameOver = true
      if (onGameEnd) onGameEnd('draw')
    }
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
    lastMove = { from: move.from, to: move.to }

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
    gameOver = false
    lastMove = undoStack.length > 0
      ? { from: undoStack[undoStack.length - 1].from, to: undoStack[undoStack.length - 1].to }
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
    return { aiThinking, gameOver, selected, lastMove, flipped, undoCount: undoStack.length }
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
