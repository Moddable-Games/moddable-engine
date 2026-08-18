# Djambi action model — implementation spec (#131)

Everything below is mapped onto `packages/plugins/chess/src/variants/duck-chess.js`,
which already implements most of the machinery. Read that file first; this spec is
written as a diff against it.

Rules are quoted verbatim from the French Wikipedia article on the #131 issue thread.
Where the English and French articles disagreed, the French is authoritative and the
disagreement was an artefact of summarisation, not of the sources.

## What duck-chess already gives us

| Djambi needs | duck-chess mechanism | change |
|---|---|---|
| a non-player piece on the board | `board[to] = { type: 'blocker', owner: -1 }`, with `owner: -1` a first-class vocabulary key | rename to `corpse`; keep `owner: -1` |
| corpses block movement and passage | free — once the cell is occupied, rider generation stops at it | none |
| a player-chosen placement as a sub-move | the `blocker` action: `generate` walks `allPositions()` for empty squares, `apply` writes the cell | change `generate`'s predicate per killer |
| a forced second phase | `turnLogic(ctx)` returning `true` plus the `_blockerPhase` flag | one flag per pending action instead of one global |
| the maze granting an extra turn | `turnLogic` returning `true` | condition on chief-in-centre |

## The one structural change

Duck-chess keeps a scalar `_blockerSq` and clears the previous square on each
placement:

```js
const prev = slice._blockerSq
if (prev !== undefined && prev >= 0) board[prev] = null
```

Corpses accumulate. **Delete those two lines and the `_blockerSq` slice key.** The
board already holds corpses as cells; nothing else needs to track them.

## The six pieces

All move as a queen (`{ type: rider, dirs: all }`); the militant is capped at
`maxSteps: 2`. That is already in the frontmatter. What follows is the action layer.

### Chief and Militant — kill, then place the corpse anywhere

> "l'assassin tue, en se plaçant sur sa cible" — the chief and militant do the same,
> but unlike the assassin they may place the corpse where they choose.

Moving onto an enemy square kills. The victim becomes `{ type: 'corpse', owner: -1 }`
and the mover **must** place it on any empty square before the turn ends.

```js
turnLogic(ctx) {
  if (ctx.slice._pendingCorpse !== undefined) return true   // force the placement
  return false
}

actions: {
  placeCorpse: {
    skipsCheckFilter: true,
    continuesTurn: false,
    generate(slice, playerIdx, { allPositions, getCell }) {
      if (slice._pendingCorpse === undefined) return []
      return allPositions()
        .filter(pos => getCell(slice.board, pos) === null)
        .map(pos => ({ action: 'placeCorpse', to: pos }))
    },
    apply(move, { board, slice }) {
      board[move.to] = { type: 'corpse', owner: -1 }
      return { board, sliceKeys: { _pendingCorpse: undefined } }
    },
  },
}
```

`moveFilter` restricts the player to `placeCorpse` while `_pendingCorpse` is set,
exactly as duck-chess restricts to `blocker` during `_blockerPhase`.

### Assassin — kill, corpse forced to the assassin's origin

> "Mais il ne peut pas maquiller son crime en replaçant le cadavre où bon lui semble
> sur le terrain: le cadavre de sa victime prend sa place de départ."

Same action, `generate` returns **exactly one square**: the assassin's `from`. No
choice, so it can be applied inline in `moveApply` rather than as a second phase.
Store the origin in `_pendingCorpseAt` when the killing move is applied.

### Reporter — kills at range, without moving onto the victim

> "il « éclabousse » sa victime et la tue (politiquement) en se plaçant non pas dans
> la case de sa cible, mais à côté, sur l'une des quatre cases qui ont un côté commun."
>
> "Une pièce tuée reste dans la case où elle est a été éclaboussée, sous forme d'un
> cadavre."

The reporter moves to an **empty** square and kills **every enemy orthogonally
adjacent to where it lands** — chessvariants confirms it is all of them, not one.
Each corpse **stays exactly where it died**, so there is no placement phase.

This is a `moveApply` hook, not an action:

```js
moveApply(move, { board, slice, playerIdx, topology }) {
  const piece = board[move.to]
  if (!piece || piece.type !== 'reporter') return
  for (const adj of topology.neighbours(move.to, 'orthogonal')) {
    const target = board[adj]
    if (target && target.owner !== playerIdx && target.owner >= 0) {
      board[adj] = { type: 'corpse', owner: -1 }
    }
  }
}
```

Note the `owner >= 0` guard: a corpse must not be re-killed.

### Necromobile — moves a corpse

> "Il utilise n'importe quel cadavre gisant sur le terrain en prenant sa place, et en
> la replaçant où lui dicte l'intérêt du parti."

Moves onto a corpse's square, then relocates that corpse to any free square. Same
two-phase shape as the chief, with `generate` filtered to cells holding
`type === 'corpse'` for the move, and to empty cells for the placement.

### Diplomat — moves a living enemy

> "Il peut agir sur n'importe quelle pièce ennemie en se mettant à sa place; elle ne
> peut pas déplacer les pièces de son camp, ni les mortes."

Identical machinery to the necromobile, with the move's `generate` filtered to cells
holding a **living enemy** (`owner >= 0 && owner !== playerIdx`) and the placement to
empty cells. Kills nothing.

## The maze (centre cell, 4,4)

> "Seul un chef de parti peut l'occuper en permanence."
> "cette case confère des tours de jeu supplémentaires au joueur qui y place son chef
> de parti: il peut rejouer après chaque intervention des partis adverses."

Three separate rules:

1. **Only a chief may end a turn there.** A `moveFilter` rejecting any non-chief move
   whose `to` is the centre. Other pieces pass through freely when it is empty, which
   ordinary rider generation already allows.
2. **Extra turn.** `turnLogic` returns `true` while the mover's chief occupies the
   centre. Combined with (1) this is the "power" mechanic.
3. **Immunity from militants.** A `moveFilter` on the militant's kill: it may not
   target a chief standing on the centre.

## Control transfer — the only genuinely new engine capability

> "Un joueur perd lorsque sa pièce chef de parti est mis hors de combat."
> "les pièces restantes passent sous le contrôle du parti qui vient de tuer le chef."

`packages/core/src/player-system.js` already models elimination: `eliminated: []`,
`nextActiveIndex` skipping eliminated players, `isEliminated`, `activeCount`. What it
lacks is any notion of one player also commanding another's pieces.

Smallest addition that fits the existing shape: a `controlledBy` map on the player
system, `{ [deadPlayerIdx]: livingPlayerIdx }`, set when a chief is killed. Then
legal-move generation for player P includes pieces owned by P **and** by any index
mapping to P. Pieces keep their original `owner` so they keep their colour on the
board, which is what the physical game does.

This is also what the maze's "control of surrounded enemy pieces" needs, so build it
once and use it twice.

## A player also loses by encirclement

A chief with no escape squares is eliminated even without being killed. This is a
`checkWin` addition, not an action, and it interacts with maze immunity: a chief in
the centre **cannot** be eliminated this way.

## Build order

1. Corpses as accumulating blockers (delete the single-slot state). Nothing else works
   without this.
2. Chief and militant kill plus placement. Gets a playable, if incomplete, game.
3. Assassin (forced placement), then reporter (`moveApply`, multi-kill at range).
4. Necromobile and diplomat — same machinery, different `generate` filters.
5. The maze: occupancy restriction, extra turn, militant immunity.
6. Control transfer in the player system, then encirclement loss.

Steps 1 to 5 are the duck-chess pattern with different predicates. Step 6 is the only
one that touches core.

## Test it the way the corpus is tested

`packages/play/__tests__/issue-regressions.test.js` is the right home. Each rule above
is a two-line assertion: set up a position, apply a move, assert the board. The one
that matters most is the corpse accumulation — assert that two kills leave two corpses,
because the single-slot bug it replaces would leave one.
