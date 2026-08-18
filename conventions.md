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
