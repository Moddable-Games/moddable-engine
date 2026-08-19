/**
 * XML/HTML text and attribute escaping for generated markup.
 *
 * Single source for the escape used by SVG serialisation (packages/render)
 * and by the browser view layers that build markup by string concatenation
 * (js/rpg-chargen.js). Escapes `"` as well as `& < >` so the result is safe
 * in an attribute value, not only in element text.
 */
export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
