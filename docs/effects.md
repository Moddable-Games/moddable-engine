# Effect Types

Three chess variants produce timed square effects. Each effect occupies a board cell
for a fixed number of turns, affecting pieces that occupy or enter that cell.

## Variants and their effects

| Variant key | Effect type | Duration | Trigger | Behaviour |
|---|---|---|---|---|
| `poisonChess` | `poison` | 3 turns | Capture occurs on a square | Non-king pieces landing on the poisoned square are destroyed |
| `medusaChess` | `petrify` | 2 turns | Queen moves | All enemy pieces attacked by the queen become petrified (cannot move) |
| `immunizationChess` | `immune` | 4 turns | Capture occurs | Adjacent enemy pieces become immune to capture |

## Effect data shape

```js
{ sq: Number, type: String, duration: Number, owner: Number|null }
```

- `sq` — board cell index
- `type` — `'poison'` | `'petrify'` | `'immune'`
- `duration` — turns remaining (decrements after each move; removed at 0)
- `owner` — player index who created the effect, or `null` (poison has no owner)

## Where effects are generated

Engine-native path (generic plugin, used by game-play.js):
- `packages/plugins/chess/src/variants/effects.js`

MCE adapter path (legacy, used by chess-play.js):
- `packages/plugins/chess/src/mce/variants/poison-chess.js`
- `packages/plugins/chess/src/mce/variants/medusa-chess.js`
- `packages/plugins/chess/src/mce/variants/immunization-chess.js`

## Effect lifecycle

1. A variant hook (typically `afterMove`) calls `ctx.addEffect(effect)` 
2. The plugin's `applyMove` ticks all existing effects (duration--)
3. Effects with `duration <= 0` are removed
4. The renderer reads `slice.effects` and paints overlays

## Rendering

`js/play-overlays.js` contains the effect registry (line 42-54):

| Type | Stroke | Fill |
|---|---|---|
| `immune` | `rgba(100,200,255,0.7)` | `rgba(100,200,255,0.1)` |
| `petrified` | `rgba(128,128,128,0.8)` | `rgba(128,128,128,0.2)` |
| `poison` | `rgba(100,255,100,0.7)` | `rgba(100,255,100,0.1)` |

Per #78, these colours should move to a theme registry. Unknown effect types must render a visible fallback marker and warn.

## Testing

To see effects in the browser:
1. Navigate to `/play/?mode=game&family=chess`
2. Select variant: Poison Chess, Medusa Chess, or Immunization Chess
3. Make captures (poison/immune) or move the queen (medusa)
4. Coloured overlays appear on affected squares and fade after the listed turn count
