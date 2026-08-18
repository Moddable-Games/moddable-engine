# Dead frontmatter keys (#135 item 13)

Keys written by corpus authors that no engine source file reads. Each was checked
against every non-test `.js`/`.mjs` in `packages/`, `js/` and `scripts/`.

| key | corpus uses | files | read by engine? |
|---|---|---|---|
| `notation` | 29 | 29 | yes — recheck |
| `hand` | 19 | 14 | yes — recheck |
| `asymmetric` | 8 | 6 | **no** |
| `unsupported` | 3 | 3 | **no** |
| `missing_squares` | 2 | 2 | **no** |
| `promotion_zone` | 2 | 2 | **no** |
| `cone` | 2 | 1 | **no** |
| `spool` | 2 | 1 | **no** |
| `physical_representation` | 1 | 1 | **no** |
| `loop` | 1 | 1 | yes — recheck |
| `approximations` | 1 | 1 | **no** |
| `setup_phase` | 1 | 1 | **no** |
| `rendering_note` | 1 | 1 | **no** |
| `gating` | 1 | 1 | **no** |
| `dual_king` | 1 | 1 | **no** |
| `faceoff` | 1 | 1 | **no** |
| `setup_status` | 1 | 1 | **no** |

Total: 76 occurrences across 17 keys.

Two behave differently and are worth calling out separately:

- **`notation`** and **`hand`** reach the plugin config (they are non-structural, so
  `resolveMeta` folds them in) and are then read by nothing. They also trip the new
  `Unknown config keys` warning, which is how they surfaced.
- **`unsupported`** is used as prose documentation in family rulebooks, listing
  variants the engine cannot express. That is legitimate metadata, not dead config —
  it just should not sit under `engine:`. Move it out rather than deleting it.

Recommendation: retire the rest. For each, either delete the key from the corpus, or
implement it and add it to that plugin's `KNOWN_KEYS`. Leaving them declared teaches
authors that writing a key is the same as having an effect.
