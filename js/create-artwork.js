// Choosing artwork for a piece on the create page (engine#118, Tier C).
//
// A piece placed from a gallery set got its artwork from the set, and a piece
// defined by hand got none. So artwork, symbol, side and movement never met:
// an emoji set, keyed by what its images show rather than by board symbols,
// offered nothing to place. A defined piece now takes any image from any set,
// written as `pieces.art` - `{ D: fluent-emoji/dragon }` - which the renderer
// resolves for every page that draws the board.

import { pieceArt } from '../packages/render/index.js'

// The URL an art reference is drawn from, or null.
export function artUrl(gallery, ref) {
  if (!ref || !gallery) return null
  return pieceArt({ _: ref }, gallery)._ || null
}

// Every image a set can draw, its own and what it inherits.
function setImages(gallery, setId) {
  const setDef = gallery?.find(s => s.id === setId)
  if (!setDef) return []
  const ids = new Set(Object.keys(setDef.pieces || {}))
  const base = setDef.extends ? gallery.find(s => s.id === setDef.extends) : null
  for (const id of Object.keys(base?.pieces || {})) ids.add(id)
  return [...ids].sort().map(id => ({ ref: `${setId}/${id}`, id, url: artUrl(gallery, `${setId}/${id}`) })).filter(e => e.url)
}

// A set picker over a grid of its images. `onPick(ref)` is called with the
// chosen `set/piece`.
export function buildArtworkPicker(container, gallery, onPick, { initialSet } = {}) {
  container.innerHTML = ''
  const sets = (gallery || []).filter(s => Object.keys(s.pieces || {}).length)
  const select = document.createElement('select')
  select.className = 'def-select'
  for (const s of sets) {
    const o = document.createElement('option')
    o.value = s.id
    o.textContent = s.name || s.id
    select.appendChild(o)
  }
  if (initialSet && sets.some(s => s.id === initialSet)) select.value = initialSet
  container.appendChild(select)

  const grid = document.createElement('div')
  grid.className = 'artwork-grid'
  container.appendChild(grid)

  const fill = () => {
    grid.innerHTML = ''
    for (const entry of setImages(gallery, select.value)) {
      const btn = document.createElement('button')
      btn.className = 'piece-btn artwork-btn'
      btn.title = entry.id
      const img = document.createElement('img')
      img.src = entry.url
      img.alt = entry.id
      img.width = 32
      img.height = 32
      img.loading = 'lazy'
      btn.appendChild(img)
      btn.addEventListener('click', () => onPick(entry.ref))
      grid.appendChild(btn)
    }
  }
  select.addEventListener('change', fill)
  fill()
}
