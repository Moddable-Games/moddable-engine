// Fixture: a cross-package deep import that bypasses the index.
// no-deep-imports must flag this pattern.
import { createRng } from '../../../../core/src/rng.js'
export const rng = createRng(42)
