(async function () {
  const base = document.querySelector('link[rel="stylesheet"]').href.replace(/css\/families\.css.*/, '');
  const res = await fetch(base + 'api/stats.json');
  if (!res.ok) return;
  const stats = await res.json();
  const family = document.documentElement.dataset.family;
  if (!family) return;

  const fill = (attr, value) => {
    if (value == null) return;
    document.querySelectorAll(`[data-stat="${attr}"]`).forEach(el => {
      el.textContent = value;
    });
  };

  fill('variants', stats.playableByFamily?.[family]);
  fill('total-variants', stats.playableVariants);
  fill('families', stats.playableFamilies);
  fill('variant-plugins', stats.variantPluginsByFamily?.[family]);
  fill('frontmatter-only', stats.frontmatterOnlyByFamily?.[family]);
})();
