// The docs pages' navigation, written from docs/toc.json into every page.
//
// Each page carried its own copy of the page list, nineteen copies, and its
// own "On this page" list typed by hand beside the headings it pointed at.
// Adding a page meant editing every other one, and a renamed heading left a
// dead link. The page list now comes from one file, and a page's own list from
// its own <h2 id> headings.

import fs from 'fs'
import path from 'path'

const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function pageList(toc, current) {
  return toc.groups.map((group, index) => {
    const items = group.pages.map(([file, label]) => {
      const href = file === 'index.html' ? './' : file
      return `    <li><a href="${href}"${file === current ? ' class="active"' : ''}>${escapeHtml(label)}</a></li>`
    }).join('\n')
    return `  <div class="docs-toc-title${index ? ' docs-toc-title--spaced' : ''}">${escapeHtml(group.title)}</div>\n  <ul class="docs-toc-list">\n${items}\n  </ul>`
  }).join('\n')
}

// A page's own sections: its h2 headings that carry an id.
function sectionList(html) {
  const body = html.slice(html.indexOf('<div class="docs-body">'))
  const items = [...body.matchAll(/<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)]
    .map(([, id, text]) => `    <li><a href="#${id}">${text.replace(/<[^>]+>/g, '').trim()}</a></li>`)
  if (!items.length) return ''
  return `\n  <div class="docs-toc-title docs-toc-title--spaced">On this page</div>\n  <ul class="docs-toc-list">\n${items.join('\n')}\n  </ul>`
}

// The overview's table of every page and what it covers, from the same file.
function guidesTable(toc) {
  const rows = toc.groups.flatMap(group => group.pages
    .filter(([file]) => file !== 'index.html')
    .map(([file, label, covers]) => `      <tr><td><a href="${file}">${escapeHtml(label)}</a></td><td>${escapeHtml(group.title)}</td><td>${escapeHtml(covers || '')}</td></tr>`))
  return `  <table class="docs-table">\n    <thead>\n      <tr><th>Page</th><th>Section</th><th>Covers</th></tr>\n    </thead>\n    <tbody>\n${rows.join('\n')}\n    </tbody>\n  </table>`
}

export function buildDocsToc(root) {
  const toc = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'toc.json'), 'utf8'))
  const listed = toc.groups.flatMap(g => g.pages.map(([file]) => file))
  const pages = fs.readdirSync(path.join(root, 'docs')).filter(f => f.endsWith('.html'))
  const unlisted = pages.filter(f => !listed.includes(f))
  const missing = listed.filter(f => !pages.includes(f))
  if (unlisted.length || missing.length) {
    throw new Error(`docs/toc.json is out of step with docs/: unlisted ${JSON.stringify(unlisted)}, missing ${JSON.stringify(missing)}`)
  }
  const outputs = []
  for (const file of pages) {
    const html = fs.readFileSync(path.join(root, 'docs', file), 'utf8')
    const nav = `<nav class="docs-toc">\n${pageList(toc, file)}${sectionList(html)}\n</nav>`
    const next = html.replace(/<nav class="docs-toc">[\s\S]*?<\/nav>/, nav)
      .replace(/(<!-- docs-guides:start -->)[\s\S]*?(<!-- docs-guides:end -->)/, `$1\n${guidesTable(toc)}\n  $2`)
    if (next === html && !html.includes('<nav class="docs-toc">')) throw new Error(`docs/${file} has no docs-toc nav`)
    outputs.push({ path: `docs/${file}`, content: next })
  }
  return outputs
}
