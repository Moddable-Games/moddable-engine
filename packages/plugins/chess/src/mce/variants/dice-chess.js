import MCE from '../engine.js';
MCE.registerVariant('diceChess', {
  label: 'Dice Chess',
  group: 'Alternate Rules',
  rows: 8,
  cols: 8,
  fen: null,
  title: 'Dice Chess',
  description: 'Each turn, a die roll determines which piece type must move: 1=pawn, 2=knight, 3=bishop, 4=rook, 5=queen, 6=king. If no piece of that type can move, the next higher type is tried (wrapping around).',
  rule: 'Board: 8×8 · Win: Checkmate',
  init: function(g) {
    g.diceRoll = Math.floor(Math.random() * 6) + 1;
  },
  afterMove: function(g, move, undo) {
    undo.diceRoll = g.diceRoll;
    g.diceRoll = Math.floor(Math.random() * 6) + 1;
  },
  restoreState: function(g, undo) {
    if (undo.diceRoll !== undefined) g.diceRoll = undo.diceRoll;
  },
  moveFilter: function(g, moves) {
    var typeMap = ['p', 'n', 'b', 'r', 'q', 'k'];
    var roll = g.diceRoll || 1;
    for (var attempt = 0; attempt < 6; attempt++) {
      var idx = ((roll - 1) + attempt) % 6;
      var requiredType = typeMap[idx];
      var filtered = moves.filter(function(m) {
        var piece = g.board[m.from];
        return piece && MCE.pieceType(piece) === requiredType;
      });
      if (filtered.length > 0) return filtered;
    }
    return moves;
  },
  statusText: function(g, helpers) {
    if (helpers.gameOver) return null;
    var diceNames = ['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King'];
    var roll = g.diceRoll || 1;
    var name = diceNames[roll - 1];
    return helpers.nameFor(g.turn) + ' — die roll: ' + roll + ' (' + name + ')';
  },
});
