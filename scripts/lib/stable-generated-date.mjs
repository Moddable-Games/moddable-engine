/**
 * Keeps `generated` meaning "when these figures last changed", not "when this
 * script last ran".
 *
 * `build-discovery.mjs --check` compares generated output against the
 * committed file byte for byte, and api/stats.json carries a `generated`
 * datestamp taken from the clock. Those two facts together mean the file goes
 * stale at midnight on its own: the numbers are identical, the date is not,
 * the comparison fails, and CI on both branches goes red for a push that
 * changed nothing. It is the same shape as engine#164 - a gate that can go red
 * with no commit behind it - and it teaches the same lesson about the signal.
 *
 * So the date is carried forward whenever every other field matches, and moves
 * only when a figure actually moves.
 */

/**
 * @param candidate  the freshly built stats object, with today's `generated`
 * @param existingText  the committed file's contents, or '' if there is none
 * @returns candidate, with `generated` restored to the committed value when
 *          nothing else differs
 */
export function withStableGeneratedDate(candidate, existingText) {
  if (!existingText) return candidate

  let existing
  try {
    existing = JSON.parse(existingText)
  } catch {
    // An unparseable committed file is not evidence of anything; rebuild it.
    return candidate
  }

  const { generated: _dropCandidate, ...candidateRest } = candidate
  const { generated: existingDate, ...existingRest } = existing
  if (typeof existingDate !== 'string') return candidate

  const same = JSON.stringify(candidateRest) === JSON.stringify(existingRest)
  return same ? { ...candidate, generated: existingDate } : candidate
}
