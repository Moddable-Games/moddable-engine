export function renderHandPanel(el, { sides, armed, enabledFor, onArm }) {
  if (!el) return
  el.innerHTML = ''

  for (const side of sides) {
    if (!side.pieces || side.pieces.length === 0) continue
    const row = document.createElement('div')
    row.className = 'hand-row'

    const label = document.createElement('span')
    label.className = 'hand-label'
    label.textContent = side.label + ':'
    row.appendChild(label)

    for (const piece of side.pieces) {
      const btn = document.createElement('button')
      btn.className = 'hand-piece'
      if (armed === piece.id && enabledFor === side.id) btn.classList.add('hand-piece--active')

      if (piece.image) {
        const img = document.createElement('img')
        img.src = piece.image
        img.alt = piece.label || piece.id
        img.className = 'hand-piece-img'
        btn.appendChild(img)
      } else {
        btn.textContent = piece.label || piece.id
      }

      if (piece.count > 1) {
        const badge = document.createElement('span')
        badge.className = 'hand-count'
        badge.textContent = piece.count
        btn.appendChild(badge)
      }

      if (enabledFor === side.id && onArm) {
        btn.addEventListener('click', () => onArm(piece.id, side.id))
      } else {
        btn.disabled = true
      }

      row.appendChild(btn)
    }

    el.appendChild(row)
  }
}
