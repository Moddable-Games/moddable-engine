// The menu toggles the pages share: the header navigation on narrow screens,
// the docs pages' table of contents and the board gallery's filters. They
// were inline onclick handlers copied into forty pages.
document.addEventListener('click', (event) => {
  const nav = event.target.closest('.nav-toggle')
  if (nav) {
    nav.classList.toggle('active')
    nav.previousElementSibling?.classList.toggle('open')
    return
  }
  const toc = event.target.closest('.docs-toc-toggle, .filters-toggle')
  if (toc) {
    toc.classList.toggle('active')
    toc.nextElementSibling?.classList.toggle('open')
  }
})
