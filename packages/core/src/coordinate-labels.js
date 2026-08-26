// File labels for board coordinates, and their inverse.
//
// Every one of these was `String.fromCharCode(97 + c)` at eleven sites across
// three packages, which is correct for 26 columns and silently wrong past
// them. Column 26 produced '{', then '|', '}', '~', and then non-printable
// control characters. `taikyoku-shogi` is 36x36 and ships in the corpus, so its
// last ten files had ids that cannot be used in a DOM id, a URL fragment,
// notation, or a saved game.
//
// The intersection alphabet - Go convention, skipping 'i' so it is not mistaken
// for 'j' or '1' - was a 19-character string indexed directly, so column 19 and
// beyond evaluated `undefined + <number>`, which is NaN. Every cell past the
// nineteenth got the same id.
//
// Both now spill to two letters, bijective base-26 in the spreadsheet style:
// a..z, then aa..az, ba.., and so on. 'a' is 0 rather than 1, so this is not
// plain base-26 and the inverse has to match it exactly. Round-tripped over
// 0..4095 by test.

const LATIN = 'abcdefghijklmnopqrstuvwxyz'
// Go boards skip 'i' by convention.
const INTERSECTION = 'abcdefghjklmnopqrst'

function toLabel(index, alphabet) {
  if (!Number.isInteger(index) || index < 0) return null
  const base = alphabet.length
  let out = ''
  let n = index
  for (;;) {
    out = alphabet[n % base] + out
    n = Math.floor(n / base) - 1
    if (n < 0) break
  }
  return out
}

function fromLabel(label, alphabet) {
  if (typeof label !== 'string' || label.length === 0) return -1
  const base = alphabet.length
  let n = 0
  for (const ch of label) {
    const digit = alphabet.indexOf(ch)
    if (digit === -1) return -1
    n = n * base + (digit + 1)
  }
  return n - 1
}

// 0 -> 'a', 25 -> 'z', 26 -> 'aa', 701 -> 'zz', 702 -> 'aaa'
export function fileLabel(index) {
  return toLabel(index, LATIN)
}

export function fileIndex(label) {
  return fromLabel(label, LATIN)
}

// 0 -> 'a', 18 -> 't', 19 -> 'aa' (the alphabet has no 'i')
export function intersectionLabel(index) {
  return toLabel(index, INTERSECTION)
}

export function intersectionIndex(label) {
  return fromLabel(label, INTERSECTION)
}

// Split a cell id such as 'a1', 'aa12' or 'z8' into its file and rank parts.
// Returns null when the id is not of that shape, so a caller can tell the
// difference between rank 0 and a malformed id.
export function splitCellId(id) {
  const match = /^([a-z]+)(\d+)$/.exec(String(id))
  if (!match) return null
  return { file: match[1], rank: parseInt(match[2], 10) }
}
