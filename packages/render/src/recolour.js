export const FEN4_OWNERS = { r: 'red', b: 'blue', y: 'yellow', g: 'green', w: 'white' }

const recolourCache = {}

export async function recolourPieceSet(pieceSetId, gallery, fetchFn = fetch) {
  const setDef = gallery?.find(s => s.id === pieceSetId)
  if (!setDef || !setDef.owners || !setDef.baseSet) return null

  const basePath = `../pieces/sets/${setDef.baseSet}/`
  const images = {}
  const owners = setDef.owners
  const matchColor = setDef.recolourMatch || '#fff'

  const fetches = []
  for (const [pieceId, filename] of Object.entries(setDef.pieces || {})) {
    const ownerPrefix = pieceId[0]
    const ownerName = FEN4_OWNERS[ownerPrefix]
    const ownerColors = owners[ownerName]
    if (!ownerColors) continue

    const cacheKey = `${setDef.baseSet}/${filename}:${ownerColors.fill}`
    if (recolourCache[cacheKey]) {
      images[pieceId] = recolourCache[cacheKey]
      continue
    }

    fetches.push(
      fetchFn(basePath + filename).then(r => r.text()).then(svg => {
        const tinted = svg.replaceAll(matchColor, ownerColors.fill)
        const dataUri = 'data:image/svg+xml,' + encodeURIComponent(tinted)
        recolourCache[cacheKey] = dataUri
        images[pieceId] = dataUri
      }).catch(() => {})
    )
  }

  await Promise.all(fetches)
  return Object.keys(images).length > 0 ? images : null
}

export function fen4GetOwner(pieceType) {
  if (pieceType.length >= 2) return FEN4_OWNERS[pieceType[0]] || 'white'
  return pieceType === pieceType.toUpperCase() ? 'white' : 'black'
}
