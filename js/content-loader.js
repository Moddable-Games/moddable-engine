/**
 * Content Loader — steps 7-9 of the render pipeline.
 *
 * Fetches external JSON when content.source exists.
 * Attaches to resolved object as content.data.
 * Schema type tells the renderer how to iterate the data.
 */

export async function loadContent(resolved, basePath) {
  const content = resolved.content
  if (!content) return resolved

  // Already has inline data — nothing to fetch
  if (content.data && !content.source) return resolved

  if (!content.source) return resolved

  const url = resolveContentPath(content.source, basePath)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      return {
        ...resolved,
        content: { ...content, error: `Failed to load ${url}: ${response.status}` },
      }
    }
    const data = await response.json()
    return {
      ...resolved,
      content: { ...content, data },
    }
  } catch (err) {
    return {
      ...resolved,
      content: { ...content, error: `Failed to load ${url}: ${err.message}` },
    }
  }
}

function resolveContentPath(source, basePath) {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return source
  }
  if (source.endsWith('.json') && !source.includes('/')) {
    return '../data/' + source
  }
  const base = basePath?.endsWith('/') ? basePath : (basePath || '') + '/'
  return base + source
}

export { resolveContentPath }
