import { HexMath } from '../../topologies/hex/index.js'

export function computeFov(hexes, origin, opts = {}) {
  const range = opts.range || 3
  const blocking = opts.blocking || []

  const hexMap = {}
  for (const h of hexes) hexMap[h.q + ',' + h.r] = h

  if (!hexMap[origin.q + ',' + origin.r]) return null

  const visible = []
  const blocked = []

  for (const h of hexes) {
    const dist = HexMath.axialDistance({ q: origin.q, r: origin.r }, { q: h.q, r: h.r })
    if (dist > range) continue
    if (dist === 0) {
      visible.push({ q: h.q, r: h.r, type: h.type, distance: 0 })
      continue
    }

    let isBlocked = false
    if (blocking.length > 0) {
      const steps = Math.max(
        Math.abs(h.q - origin.q),
        Math.abs(h.r - origin.r),
        Math.abs((h.q + h.r) - (origin.q + origin.r))
      )
      for (let step = 1; step < steps; step++) {
        const t = step / steps
        const lerpQ = origin.q + (h.q - origin.q) * t
        const lerpR = origin.r + (h.r - origin.r) * t
        const key = Math.round(lerpQ) + ',' + Math.round(lerpR)
        if (hexMap[key] && blocking.includes(hexMap[key].type)) {
          isBlocked = true
          break
        }
      }
    }

    if (isBlocked) {
      blocked.push({ q: h.q, r: h.r, type: h.type, distance: dist })
    } else {
      visible.push({ q: h.q, r: h.r, type: h.type, distance: dist })
    }
  }

  return { origin, range, blocking, visible, blocked }
}
