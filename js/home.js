document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.dev-tab')
  const panels = document.querySelectorAll('.dev-panel')

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      panels.forEach(p => p.classList.remove('active'))
      tab.classList.add('active')
      document.getElementById('dev-panel-' + tab.dataset.tab).classList.add('active')
    })
  })

  fetch('https://tools.moddable.games/api/stats?project=rules')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data) return
      const fill = (attr, val) => {
        if (val == null) return
        document.querySelectorAll(`[data-stat="${attr}"]`).forEach(el => { el.textContent = val })
      }
      fill('rules-games', data.games_count || data.totalGames)
      fill('rules-variants', data.rules_variants || data.totalVariants)
    })
    .catch(() => {})
})
