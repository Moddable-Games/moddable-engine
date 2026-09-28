# Conventions

## Guard Policy (Three Clauses)

Every guard test and CI script in this repo must satisfy all three clauses.
A guard that fails any clause is not trusted and must be fixed before new
work can signal through it.

### 1. Asserts its own scope

A parametrised guard (one that loops over variants, files, or rules) must
assert a committed floor on its case count. A file-list guard must assert
its resolved file list by name so adding a source file forces a decision.

**Why:** A guard that silently drops from 533 to 176 cases and stays green
is not a guard. This happened with visual-loop when one import was removed.

**Shape:**
```js
const VARIANT_FLOOR = 174
expect(variants.length).toBeGreaterThanOrEqual(VARIANT_FLOOR)
```

### 2. Has a negative fixture that must fail

Every guard must have at least one test that injects a known violation and
asserts the guard catches it. For script-based guards (check-duplication,
check-purity), export predicates and unit-test them. For Jest-based guards,
add fixtures under `__fixtures__/violations/`.

**Why:** A guard that cannot fire on injected input is dead code. Two guards
in this repo checked zero lines and could never fire.

### 3. Allowlists are shrink-only (ratchet)

Every allowlist must have a numeric ceiling. The ceiling is the current size
of the allowlist at the time it was introduced. A PR that increases a ceiling
must be rejected. Removing entries is always safe and lowers the ceiling.

**Shape:**
```js
const ALLOWLIST_CEILING = 45
expect(ALLOWLIST.size).toBeLessThanOrEqual(ALLOWLIST_CEILING)
```

---

## Applying the policy

When creating a new guard:
1. Set the floor/ceiling from the measured current state
2. Write at least one negative fixture before merging
3. Assert the case count in the first test of the describe block

When modifying an existing guard:
- If cases shrink, lower the floor (never raise it without justification)
- If allowlist entries are removed, lower the ceiling
- Never add to an allowlist without a corresponding fix plan (issue link)

## Declaring a randomiser

A game that throws something declares what it throws in frontmatter. The engine assumes no randomiser is a d6 and none is uniform. The race plugin reads two shapes:

```yaml
# Lots: two-sided sticks, shells or tetrahedral dice. The number showing
# their marked side is looked up in `scores` (the count itself where absent).
throw: { lots: 6, scores: { 0: 25, 1: 10 }, again: [25, 10, 6] }

# Dice with any faces, summed, or shared among pieces when `split` is set.
throw: { dice: [[1, 2, 5, 6], [1, 2, 5, 6], [1, 2, 5, 6]], split: true }
```

- `again` lists the scores that throw again, after moving; with `bank: true` the extra throw is taken at once and every throw is played afterwards (Nyout).
- Lots are fair and two-sided, so a count of `k` marked sides has binomial probability; each die is fair over its own faces. `chanceOutcomes` reports every outcome that plays differently, with its probability, and a search weighs a throw by them.
- A throw draws from the game's seeded generator, never `Math.random`, so a game replays from its seed. A throw move that names what fell (`value` for lots, `dice` for dice) is played as that fall.
