import './packages/play/test-helpers/setup-rules-reader.js'
import fs from 'fs'
import { createGameForVariant, loadFen, toFen } from './packages/play/src/fen.js'
import { createRng } from './packages/core/src/rng.js'
const MAN = JSON.parse(fs.readFileSync('play/playability-manifest.json','utf8')).filter(e=>e.playable)
const sig = m => JSON.stringify(Object.keys(m).sort().map(k=>[k,m[k]]))
const bad = {}
for (const e of MAN) {
  const fam=e.family, v=e.variant
  let reason = null
  try {
    const g = createGameForVariant(fam, v, { rngSeed: 3 }); const rng = createRng(7)
    for (let i=0;i<6;i++){ const L=g.getLegalMoves(); if(!L.length) break; const r=g.applyMove(L[rng.nextInt(0,L.length-1)]); if(r.winner!=null) break }
    const fen = toFen(g)
    const g2 = createGameForVariant(fam, v, { rngSeed: 3 }); loadFen(g2, fen)
    const a = g.getLegalMoves().map(sig).sort().join('|'), b = g2.getLegalMoves().map(sig).sort().join('|')
    if (a !== b) reason = 'moves differ'
    else if (toFen(g2) !== fen) reason = 'fen differs'
  } catch (err) { reason = 'throws ' + err.message.slice(0,60) }
  if (reason) (bad[fam] ||= []).push(v + ': ' + reason)
}
for (const [f, l] of Object.entries(bad)) console.log(f, l.length, l.slice(0,4).join(' ; '))
