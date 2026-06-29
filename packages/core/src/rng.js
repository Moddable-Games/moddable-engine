export function createRng(seed) {
  let s = [0, 0, 0, 0]

  function seedState(n) {
    n = n >>> 0 || 1
    s[0] = n
    s[1] = n ^ 0xDEADBEEF
    s[2] = (n << 13) ^ n
    s[3] = (n >>> 7) ^ 0xCAFEBABE
    for (let i = 0; i < 20; i++) nextRaw()
  }

  function nextRaw() {
    let t = s[0] ^ (s[0] << 11)
    s[0] = s[1]
    s[1] = s[2]
    s[2] = s[3]
    s[3] = (s[3] ^ (s[3] >>> 19)) ^ (t ^ (t >>> 8))
    return s[3] >>> 0
  }

  function next() {
    return nextRaw() / 4294967296
  }

  function nextInt(min, max) {
    return min + Math.floor(next() * (max - min + 1))
  }

  function nextChoice(arr) {
    return arr[nextInt(0, arr.length - 1)]
  }

  function shuffle(arr) {
    const result = [...arr]
    for (let i = result.length - 1; i > 0; i--) {
      const j = nextInt(0, i)
      const tmp = result[i]
      result[i] = result[j]
      result[j] = tmp
    }
    return result
  }

  function getSeed() {
    return seed
  }

  function fromSeed(newSeed) {
    seed = newSeed
    seedState(seed)
  }

  if (seed === undefined) {
    seed = (Math.random() * 4294967296) >>> 0
  }
  seedState(seed)

  return { next, nextInt, nextChoice, shuffle, getSeed, fromSeed }
}
