/**
 * Piece theme resolver.
 *
 * A piece set is a manifest declaring how to render each piece type for each
 * owner (player colour). The resolver takes (pieceType, owner) and returns
 * render data the renderer can consume.
 *
 * Manifest shape:
 * {
 *   id: 'classic',
 *   name: 'Classic Pieces',
 *   pieces: {
 *     stone: { element: 'circle', attrs: { r: 12 } },
 *     king:  { element: 'text', attrs: { 'font-size': 20 }, text: '♔' },
 *   },
 *   owners: {
 *     black: { fill: '#1c1c1c', stroke: '#000' },
 *     white: { fill: '#ffffff', stroke: '#666' },
 *   },
 *   fallback: { element: 'circle', attrs: { r: 10 } },
 * }
 */

export function createPieceResolver(manifest, opts = {}) {
  const { fallbackManifest = null } = opts

  function resolve(pieceType, owner) {
    const pieceDef = findPiece(pieceType)
    const ownerStyle = findOwnerStyle(owner)
    return merge(pieceDef, ownerStyle)
  }

  function findPiece(pieceType) {
    if (manifest.pieces && manifest.pieces[pieceType]) {
      return manifest.pieces[pieceType]
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
    return Object.keys(manifest.pieces || {})
  }

  function listOwners() {
    return Object.keys(manifest.owners || {})
  }

  function getManifest() {
    return manifest
  }

  return { resolve, listPieceTypes, listOwners, getManifest }
}
