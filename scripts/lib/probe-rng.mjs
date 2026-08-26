// A shared, reproducible source of randomness for the scripts that decide
// whether a variant is playable by walking it.
//
// Both probes used to call `Math.random()`. For the manifest generator that
// meant the same input produced different output: four consecutive runs on one
// commit reported placement-chess unplayable once and playable three times,
// and the freshness check that compares the committed manifest to a fresh one
// was intermittently red as a result (engine#145). The manifest is what the
// site offers as playable, so a variant could drop off the published list
// because CI happened to be busy.
//
// Seeding from the variant's own name rather than a counter means a variant's
// walk is the same walk whatever else is in the run, in whatever order, at
// whatever load - so adding a variant does not silently change the verdict on
// its neighbours.
import { createRng } from '../../packages/core/src/rng.js'

export function seedFor(family, variantKey) {
  const text = `${family}/${variantKey}`
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Returns a `pick(list)` that draws reproducibly for this family and variant.
export function probePicker(family, variantKey) {
  const rng = createRng(seedFor(family, variantKey))
  return (list) => list[Math.floor(rng.next() * list.length)]
}
