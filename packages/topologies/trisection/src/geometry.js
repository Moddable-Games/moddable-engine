// The geometry of a hexagon cut into three sectors, one per player (engine#26).
//
// Yalta Chess and San-kwo-k'i share the shape: a hexagon whose centre is joined
// to the midpoint of every side, which cuts it into six quadrilaterals, each
// wrapped round one corner of the hexagon. Two neighbouring quadrilaterals are
// a player's half-board. Divided `size` times along each edge, a quadrilateral
// is a `size` x `size` grid, so a half-board is `2 * size` files by `size`
// ranks: at size 4, the 4 x 8 half of a chessboard and 96 cells in all.
//
// Confirmed for Yalta against the variant's own description ("96 quadrilateral
// cells, three boards of 32 cells, one for each player") and against an
// independent implementation of it (github.com/LordBaryhobal/yalta), which
// builds exactly these six sextants of 4 x 4 around the corners.
//
// Everything here is plain geometry. Which cells are whose, and what a piece
// does on them, is the topology's and the plugin's.
//
//                 seat 2            seat 1
//               (upper left)     (upper right)
//                   H4 ___________ H3
//                    /      S3     \
//                S4 /               \ S2
//                  /                 \
//              H5 <         O         > H2
//                  \                 /
//                S5 \               / S1
//                    \_____________/
//                   H0      S0      H1
//                       seat 0
//
// H are the corners, S the midpoints of the sides, O the centre. Seat s sits
// behind side S(2s), and its back rank runs along that side from H(2s), its
// a-file corner, to H(2s+1), its last-file corner.

export const SECTORS = 3

// Corner j of a hexagon of circumradius 1, in mathematical coordinates (y up).
// H0 is the bottom-left corner, and the corners run anticlockwise.
function corner(j) {
  const angle = (240 + 60 * (((j % 6) + 6) % 6)) * Math.PI / 180
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

// Midpoint of the side from corner j to corner j + 1.
function sideMid(j) {
  return midpoint(corner(j), corner(j + 1))
}

const ORIGIN = { x: 0, y: 0 }

// The four corners of the quadrilateral holding one half of a seat's files,
// as the points at (x, y) = (0,0), (1,0), (0,1), (1,1). `x` runs across the
// files, left to right as the seat sees them; `y` runs up the ranks from the
// back edge to the centre.
//
//   left half  (files a..):  H(2s)   S(2s)     S(2s-1)  O
//   right half (files ..h):  S(2s)   H(2s+1)   O        S(2s+1)
function quadCorners(seat, half) {
  const j = 2 * seat
  return half === 0
    ? [corner(j), sideMid(j), sideMid(j - 1), ORIGIN]
    : [sideMid(j), corner(j + 1), ORIGIN, sideMid(j + 1)]
}

function bilinear([p00, p10, p01, p11], x, y) {
  const a = (1 - x) * (1 - y), b = x * (1 - y), c = (1 - x) * y, d = x * y
  return {
    x: a * p00.x + b * p10.x + c * p01.x + d * p11.x,
    y: a * p00.y + b * p10.y + c * p01.y + d * p11.y,
  }
}

// A point in seat `seat`'s own frame: `file` from 0 to 2 * size, `rank` from
// 0 at the back edge to `size` at the centre lines.
// The middle file line is the edge of both halves, and either computes it.
export function seatPoint(size, seat, file, rank) {
  const half = file <= size ? 0 : 1
  const x = half === 0 ? file / size : (file - size) / size
  return bilinear(quadCorners(seat, half), x, rank / size)
}

// A vertex is known by where it is. Two quadrilaterals that share a line
// compute its points independently, and rounding is what makes them the same
// point rather than two points a hair apart.
export function vertexKey(p) {
  return `${p.x.toFixed(6)},${p.y.toFixed(6)}`
}

// Every cell of the board: its seat, file and rank in that seat's frame, and
// its four corners as vertex keys and as points, in the order
//
//   0: back-left   1: back-right   2: front-right   3: front-left
//
// "Back" is toward the seat's own edge and "left" toward its a-file, so every
// cell is wound the same way round (anticlockwise, y up). Edge k of a cell
// joins corner k to corner k + 1: edge 0 is its back edge, 1 its right, 2 its
// front and 3 its left.
export function buildCells(size) {
  const cells = []
  for (let seat = 0; seat < SECTORS; seat++) {
    for (let rank = 0; rank < size; rank++) {
      for (let file = 0; file < 2 * size; file++) {
        const half = file < size ? 0 : 1
        const quad = quadCorners(seat, half)
        const x0 = (half === 0 ? file : file - size) / size
        const x1 = x0 + 1 / size
        const y0 = rank / size
        const y1 = y0 + 1 / size
        const points = [
          bilinear(quad, x0, y0),
          bilinear(quad, x1, y0),
          bilinear(quad, x1, y1),
          bilinear(quad, x0, y1),
        ]
        const centre = bilinear(quad, (x0 + x1) / 2, (y0 + y1) / 2)
        cells.push({ seat, file, rank, points, centre, corners: points.map(vertexKey) })
      }
    }
  }
  return cells
}

// The outline of the hexagon, and the three lines from the centre to the
// midpoints of the sides between two seats. Drawn over the cells so the
// sectors read as sectors.
export function outline() {
  return {
    corners: [0, 1, 2, 3, 4, 5].map(corner),
    dividers: [1, 3, 5].map(j => [ORIGIN, sideMid(j)]),
  }
}
