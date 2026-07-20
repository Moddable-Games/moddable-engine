const manifestCache = {}

export async function loadRpgManifest(gameKey, basePath) {
  if (manifestCache[gameKey]) return manifestCache[gameKey]
  const url = `${basePath}games/${gameKey}/rpg-manifest.json`
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const manifest = await resp.json()
    manifestCache[gameKey] = manifest
    return manifest
  } catch {
    return null
  }
}
