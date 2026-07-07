export function createPieceResolver(manifest, opts = {}) {
  const { fallbackManifest = null, sourceManifests = {} } = opts

  function resolve(pieceType, owner) {
    const pieceDef = findPiece(pieceType)
    const ownerStyle = findOwnerStyle(owner)
    return merge(pieceDef, ownerStyle)
  }

  function findPiece(pieceType) {
    if (manifest.pieces && manifest.pieces[pieceType]) {
      const entry = manifest.pieces[pieceType]
      if (entry.source && sourceManifests[entry.source]) {
        const sourcePiece = sourceManifests[entry.source].pieces?.[entry.as || pieceType]
        if (sourcePiece) return sourcePiece
      }
      return entry
    }
    for (const src of Object.values(sourceManifests)) {
      if (src.pieces && src.pieces[pieceType]) return src.pieces[pieceType]
    }
    if (fallbackManifest && fallbackManifest.pieces && fallbackManifest.pieces[pieceType]) {
      return fallbackManifest.pieces[pieceType]
    }
    return manifest.fallback || { element: 'circle', attrs: { r: 10 } }
  }

  function findOwnerStyle(owner) {
    if (manifest.owners && manifest.owners[owner]) {
      return manifest.owners[owner]
    }
    if (fallbackManifest && fallbackManifest.owners && fallbackManifest.owners[owner]) {
      return fallbackManifest.owners[owner]
    }
    return {}
  }

  function merge(pieceDef, ownerStyle) {
    return {
      element: pieceDef.element,
      text: pieceDef.text || null,
      attrs: { ...pieceDef.attrs, ...ownerStyle },
    }
  }

  function listPieceTypes() {
    const types = new Set(Object.keys(manifest.pieces || {}))
    for (const src of Object.values(sourceManifests)) {
      for (const key of Object.keys(src.pieces || {})) types.add(key)
    }
    return [...types]
  }

  function listOwners() {
    return Object.keys(manifest.owners || {})
  }

  function getManifest() {
    return manifest
  }

  return { resolve, listPieceTypes, listOwners, getManifest }
}
