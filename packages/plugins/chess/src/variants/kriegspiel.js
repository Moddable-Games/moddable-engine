/**
 * Kriegspiel: chess where each player sees only their own pieces.
 *
 * It was `playable: true` with no module at all, which meant it loaded, played
 * and finished as ORDINARY CHESS with both positions fully visible - the one
 * thing the variant is defined by, absent, and absent silently. engine#155.
 *
 * The visibility rule is not in dispute and is the same one dark chess uses.
 * The rulebook, following the standard description: "Each player can see only
 * their own pieces - not the opponent's position or moves."
 *
 * Unlike dark chess this keeps standard FIDE legality rather than king-capture.
 * That is deliberate and it is what the source says: the referee arbitrates
 * against a master board under normal rules, so a move that would leave your
 * own king in check is refused. The engine refusing it is that ruling.
 *
 * WHAT IS STILL MISSING is the referee's announcements, which both players
 * hear: the direction of a check, that a capture happened and on which square,
 * that a pawn try is available, and that the opponent attempted something
 * illegal. Those need a third participant that is neither seat, which is
 * decision 4 of engine#155 and is recorded as an approximation on the variant.
 */
export const kriegspiel = {
  key: 'kriegspiel',
  slug: 'kriegspiel',

  visibility(slice, viewerIndex, { allPositions, getCell }) {
    const knowledge = new Map()
    for (const pos of allPositions()) {
      const cell = getCell(slice.board, pos)
      knowledge.set(pos, cell && cell.owner === viewerIndex ? 'known' : 'unknown')
    }
    return knowledge
  },
}
