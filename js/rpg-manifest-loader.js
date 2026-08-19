// View layer: browser-side caching and cache-busting around the package loader.
// URL construction, fetch and the not-ok check live in packages/rpg/src/manifest.js.
import { loadManifest } from '../packages/rpg/src/manifest.js'

const manifestCache = {}

export async function loadRpgManifest(gameKey, basePath) {
  if (manifestCache[gameKey]) return manifestCache[gameKey]
  try {
    const manifest = await loadManifest(gameKey, {
      rulesBase: basePath.replace(/\/$/, ''),
      fetcher: url => fetch(`${url}?t=${Date.now()}`),
    })
    if (manifest) manifestCache[gameKey] = manifest
    return manifest
  } catch {
    return null
  }
}
