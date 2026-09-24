import fs from 'fs'
import { verifyRecord } from './scripts/generate-puzzles.mjs'
import { createGameForVariant } from './packages/play/src/fen.js'
const d = JSON.parse(fs.readFileSync('api/puzzles/index.json','utf8'))
const bad = {}; let n = 0
for (const r of d.variants.filter(r => r.source === 'engine-generated')) {
  n++
  const moverIndex = r.moverIndex ?? (r.position.trim().split(/\s+/)[1] === 'b' ? 1 : 0)
  let moverName = r.moverName
  if (!moverName) { try { moverName = createGameForVariant(r.family, r.variantSlug).raw.playerSystem.getAll()[moverIndex] } catch {} }
  let v; try { v = verifyRecord({ ...r, shape: r.shape || 'win', moverIndex, moverName }) } catch (e) { v = { ok: false, reason: 'throws ' + e.message } }
  if (!v.ok) (bad[r.variantSlug] ||= []).push({ id: r.id, reason: v.reason })
}
const all = Object.values(bad).flat()
console.log('checked', n, 'failing', all.length)
const byReason = {}; for (const b of all) { const k = b.reason.replace(/"[^"]*"/g,'"…"').replace(/\d+/g,'N').slice(0,70); byReason[k] = (byReason[k]||0)+1 }
console.log(byReason)
for (const [k, l] of Object.entries(bad)) console.log(k, l.length, '|', l[0].reason.slice(0, 120))
fs.writeFileSync('/private/tmp/claude-501/scratch/reverify.json', JSON.stringify(bad, null, 1))
