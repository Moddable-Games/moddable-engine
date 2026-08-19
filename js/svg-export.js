// Shared SVG and PNG export.
//
// A rendered board references its pieces as <image href="../pieces/sets/...">.
// Serialising the live SVG and handing the string to the user produced a file
// with the board and no pieces, because those hrefs are relative to the page,
// not to wherever the file lands. The images have to be inlined as data URLs
// before the SVG leaves the page.
//
// inlineExternalImages already existed in js/play.js, used only by PNG export.
// It is here so both pages and both formats use one copy.

async function inlineExternalImages(svgEl) {
  const images = svgEl.querySelectorAll('image')
  const jobs = [...images].map(async img => {
    const href = img.getAttribute('href') || img.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    if (!href || href.startsWith('data:')) return
    try {
      const resp = await fetch(href)
      if (!resp.ok) throw new Error(String(resp.status))
      const blob = await resp.blob()
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      img.setAttribute('href', dataUrl)
      img.removeAttributeNS('http://www.w3.org/1999/xlink', 'href')
    } catch {
      // Leave the original href. A missing piece is better than a failed export.
    }
  })
  await Promise.all(jobs)
}

// Editing overlays (ghost pieces, move dots, hover highlights) are page state,
// not board content, and must not appear in an exported file.
const TRANSIENT_CLASSES = ['piece-ghost', 'hover-move-dot', 'move-preview-dot']

function prepareClone(svgEl) {
  const clone = svgEl.cloneNode(true)
  for (const cls of TRANSIENT_CLASSES) {
    clone.querySelectorAll('.' + cls).forEach(el => el.remove())
  }
  clone.removeAttribute('style')
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return clone
}

function viewBoxSize(svgEl) {
  const vb = svgEl.getAttribute('viewBox')
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) return { width: parts[2], height: parts[3] }
  }
  const rect = svgEl.getBoundingClientRect ? svgEl.getBoundingClientRect() : { width: 0, height: 0 }
  return {
    width: parseInt(svgEl.getAttribute('width')) || rect.width || 400,
    height: parseInt(svgEl.getAttribute('height')) || rect.height || 400,
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportSvgFile(svgEl, filename) {
  if (!svgEl) return false
  const clone = prepareClone(svgEl)
  await inlineExternalImages(clone)
  const svgString = new XMLSerializer().serializeToString(clone)
  triggerDownload(new Blob([svgString], { type: 'image/svg+xml' }), filename)
  return true
}

export async function exportPngFile(svgEl, filename, scale = 2) {
  if (!svgEl) return false
  const { width: svgW, height: svgH } = viewBoxSize(svgEl)
  const clone = prepareClone(svgEl)
  clone.setAttribute('width', svgW)
  clone.setAttribute('height', svgH)
  await inlineExternalImages(clone)
  const svgString = new XMLSerializer().serializeToString(clone)

  const canvas = document.createElement('canvas')
  canvas.width = svgW * scale
  canvas.height = svgH * scale
  const ctx = canvas.getContext('2d')

  await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => { triggerDownload(blob, filename); resolve() }, 'image/png')
    }
    img.onerror = reject
    img.src = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }))
  })
  return true
}
