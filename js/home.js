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
})
