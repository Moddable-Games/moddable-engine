/* API explorer — stat loading and mobile nav toggle */

(function () {
  'use strict';

  // Mobile nav toggle
  const toggle = document.querySelector('.nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      this.classList.toggle('active');
      const nav = this.closest('.header-inner').querySelector('.header-nav');
      if (nav) nav.classList.toggle('open');
    });
  }

  // Load live stats from index.json
  fetch('index.json')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.endpoints) return;
      data.endpoints.forEach(function (ep) {
        var key = ep.path.split('/')[2]; // pieces, boards, tiles, puzzles
        var el = document.querySelector('[data-stat="' + key + '"]');
        if (el && ep.count) {
          el.textContent = ep.count.toLocaleString();
        }
      });
    })
    .catch(function () {
      // Stats already show defaults from HTML; no action needed
    });
})();
