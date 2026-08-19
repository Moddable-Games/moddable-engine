const STAR_ARMS = ['N', 'NE', 'SE', 'S', 'SW', 'NW']

// Fallback piece appearance per arm, used only when the resolved piece set has
// no image for the arm. Indexed by STAR_ARMS. Not derivable from the resolved
// engine: nothing in it maps a player colour name to a hex value.
const STAR_ARM_PIECE_KEYS = ['red-circle', 'blue-circle', 'green-circle', 'black-circle', 'purple-circle', 'brown-circle']
const STAR_ARM_COLORS = ['#d32f2f', '#1565c0', '#2e7d32', '#1a1a1a', '#6a1b9a', '#5d4037']

// Star outline (inner hexagon + six tips) as offsets from the lattice centre,
// calibrated at STAR_OUTLINE_REF_SPACING / STAR_OUTLINE_REF_ARM. Both the hole
// lattice and the painted star scale linearly in spacing and in arm size, so
// the table is scaled by (spacing/ref) * (armSize/refArm).
const STAR_OUTLINE_REF_SPACING = 24
const STAR_OUTLINE_REF_ARM = 4
const STAR_HEX_OFFSETS = [[-50.5, -93], [50.5, -93], [104.3, 0], [50.5, 92.9], [-50.5, 92.9], [-104.3, 0]]
const STAR_TIP_OFFSETS = [[0, -180.3], [158, -93], [158, 92.9], [0, 180.3], [-158, 92.9], [-158, -93]]

// Row hole counts for a six-pointed star of arm size n: n arm rows counting up,
// then 2n+1 body rows (central hexagon row + the two side arms), then n arm rows
// counting down. n = 4 gives the classic [1,2,3,4,13,12,11,10,9,10,11,12,13,4,3,2,1].
function starRowWidths(n) {
  const widths = []
  for (let row = 0; row < n; row++) widths.push(row + 1)
  for (let m = 0; m <= 2 * n; m++) {
    const central = n + 1 + Math.min(m, 2 * n - m)
    const armWidth = m < n ? n - m : (m > n ? m - n : 0)
    widths.push(central + 2 * armWidth)
  }
  for (let row = 3 * n + 1; row <= 4 * n; row++) widths.push(4 * n + 1 - row)
  return widths
}

export function produceStarLayout(colors, render, params) {
  const armSize = params.armSize || 4
  const spacing = params.spacing || render.cellSize || 24
  const rowCount = 4 * armSize + 1
  const pieceR = spacing * 0.19
  const rim = spacing * 1.2, margin = spacing * 2.5
  const innerW = spacing * (rowCount - 1) + margin * 2
  const innerH = Math.round(spacing * Math.sqrt(3) / 2 * (rowCount - 1)) + margin * 2 + spacing
  const boardW = innerW + rim * 2, boardH = innerH + rim * 2
  const ox = 0, oy = 0
  const rowH = spacing * Math.sqrt(3) / 2
  const cx = ox + rim + spacing * 2 * armSize + margin, topY = oy + rim + margin + spacing * 0.5
  const rowWidths = starRowWidths(armSize)
  const positions = [], arms = {}
  for (const arm of STAR_ARMS) arms[arm] = []
  for (let row = 0; row < rowCount; row++) {
    const w = rowWidths[row], y = topY + row * rowH, startX = cx - (w - 1) * spacing / 2
    for (let i = 0; i < w; i++) {
      const x = startX + i * spacing, idx = positions.length
      positions.push({ x, y, row, col: i })
      if (row < armSize) arms.N.push(idx)
      else if (row > 3 * armSize) arms.S.push(idx)
      else if (row <= 2 * armSize - 1) { const armWidth = armSize - (row - armSize); if (i < armWidth) arms.NW.push(idx); else if (i >= w - armWidth) arms.NE.push(idx) }
      else if (row >= 2 * armSize + 1) { const armWidth = row - 2 * armSize; if (i < armWidth) arms.SW.push(idx); else if (i >= w - armWidth) arms.SE.push(idx) }
    }
  }
  const s = spacing / STAR_OUTLINE_REF_SPACING * (armSize / STAR_OUTLINE_REF_ARM)
  const midY = topY + 2 * armSize * rowH, polyScale = 1.04
  const hex = STAR_HEX_OFFSETS.map(([dx, dy]) => ({ x: cx + dx * s * polyScale, y: midY + dy * s * polyScale }))
  const tips = STAR_TIP_OFFSETS.map(([dx, dy]) => ({ x: cx + dx * s * polyScale, y: midY + dy * s * polyScale }))
  const holeArm = new Array(positions.length).fill('')
  for (const [armName, idxs] of Object.entries(arms)) { for (const idx of idxs) holeArm[idx] = armName }
  const items = positions.map((hp, i) => ({ x: hp.x, y: hp.y, arm: holeArm[i] }))
  const armFills = STAR_ARMS.map(arm => colors['arm' + arm])
  const armPolys = []
  for (let i = 0; i < STAR_ARMS.length; i++) {
    armPolys.push({ tag: 'polygon', attrs: { points: `${tips[i].x},${tips[i].y} ${hex[i].x},${hex[i].y} ${hex[(i + 1) % STAR_ARMS.length].x},${hex[(i + 1) % STAR_ARMS.length].y}`, fill: armFills[i] } })
  }
  const ops = [
    { op: 'element', tag: 'defs', children: [{ tag: 'filter', attrs: { id: 'board-shadow', x: '-5%', y: '-3%', width: '110%', height: '110%' }, children: [{ tag: 'feDropShadow', attrs: { dx: 0, dy: 4, stdDeviation: 6, 'flood-color': 'rgba(0,0,0,0.35)' } }] }] },
    { op: 'rect', attrs: { x: ox, y: oy, width: boardW, height: boardH, fill: colors['board-body'], rx: 18, filter: 'url(#board-shadow)' } },
    { op: 'rect', attrs: { x: ox + 3, y: oy + 3, width: boardW - 6, height: boardH - 6, fill: colors['board-rim'], rx: 15 } },
    { op: 'rect', attrs: { x: ox + rim, y: oy + rim, width: innerW, height: innerH, fill: colors['board-felt'], rx: 6 } },
    { op: 'element', tag: 'polygon', attrs: { points: hex.map(v => `${v.x},${v.y}`).join(' '), fill: colors.centre } },
    { op: 'elements', items: armPolys },
    { op: 'element', tag: 'polygon', attrs: { points: `${tips[0].x},${tips[0].y} ${tips[4].x},${tips[4].y} ${tips[2].x},${tips[2].y}`, fill: 'none', stroke: colors.outline, 'stroke-width': 1.5 } },
    { op: 'element', tag: 'polygon', attrs: { points: `${tips[3].x},${tips[3].y} ${tips[5].x},${tips[5].y} ${tips[1].x},${tips[1].y}`, fill: 'none', stroke: colors.outline, 'stroke-width': 1.5 } },
    { op: 'nodes', group: { fill: colors.hole, opacity: 0.7 }, items,
      dot: { radius: 2.5 },
      hit: { radius: pieceR, id: (n, i) => `h${i + 1}`, dataType: (n) => n.arm ? 'arm-' + n.arm : 'centre', extraAttrs: (n) => n.arm ? { 'data-arm': n.arm } : null } },
  ]
  const filledArms = render._filledArms || []
  const pieceImages = render._pieceImages || {}
  const pieceSz = pieceR * 1.6
  const pieces = []
  for (let a = 0; a < filledArms.length; a++) {
    const armName = filledArms[a], holeIdxs = arms[armName]
    const colorIdx = STAR_ARMS.indexOf(armName)
    const img = pieceImages[STAR_ARM_PIECE_KEYS[colorIdx]] || null
    const color = STAR_ARM_COLORS[colorIdx] || STAR_ARM_COLORS[a]
    for (const idx of holeIdxs) {
      const hp = positions[idx]
      if (img) pieces.push({ tag: 'image', attrs: { href: img, x: hp.x - pieceSz / 2, y: hp.y - pieceSz / 2, width: pieceSz, height: pieceSz } })
      else pieces.push({ tag: 'circle', attrs: { cx: hp.x, cy: hp.y, r: pieceR - 1, fill: color, stroke: 'rgba(255,255,255,0.6)', 'stroke-width': 1.5 } })
    }
  }
  ops.push({ op: 'elements', items: pieces })
  const labelPad = spacing * 1.0
  const labelDefs = [
    { text: 'N', x: cx, y: tips[0].y - labelPad }, { text: 'S', x: cx, y: tips[3].y + labelPad + 5 },
    { text: 'NE', x: tips[1].x + labelPad, y: tips[1].y + 4 }, { text: 'NW', x: tips[5].x - labelPad, y: tips[5].y + 4 },
    { text: 'SE', x: tips[2].x + labelPad, y: tips[2].y + 4 }, { text: 'SW', x: tips[4].x - labelPad, y: tips[4].y + 4 },
  ]
  ops.push({ op: 'group', attrs: { 'font-family': 'sans-serif', 'font-size': 10, fill: 'rgba(255,255,255,0.7)', 'font-weight': 600, 'text-anchor': 'middle' }, children: labelDefs.map(l => ({ tag: 'text', attrs: { x: l.x, y: l.y }, text: l.text })) })
  return { type: 'graph', config: { ops, width: boardW, height: boardH } }
}
