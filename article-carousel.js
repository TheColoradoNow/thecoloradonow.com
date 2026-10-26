(function () {
  'use strict';
  const carousel = document.getElementById('homepage-article-carousel');
  if (!carousel) return;
  const viewport = carousel.querySelector('.article-carousel-viewport');
  const track = carousel.querySelector('.article-carousel-track');
  const toggle = carousel.querySelector('.article-carousel-toggle');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let articles = [];
  let manuallyPaused = false;
  let keyboardBrowsing = false;
  let resizeTimer;

  function updateMotion() {
    carousel.classList.toggle('is-paused', manuallyPaused);
    carousel.classList.toggle('is-static', reducedMotion.matches || keyboardBrowsing);
    toggle.hidden = reducedMotion.matches;
    toggle.textContent = manuallyPaused ? 'Play' : 'Pause';
    toggle.setAttribute('aria-label', manuallyPaused ? 'Resume article carousel' : 'Pause article carousel');
    toggle.setAttribute('aria-pressed', String(manuallyPaused));
  }

  function duplicate(element) {
    const clone = element.cloneNode(true);
    clone.dataset.carouselClone = '';
    clone.setAttribute('aria-hidden', 'true');
    if (clone.matches('a')) clone.tabIndex = -1;
    clone.querySelectorAll('a').forEach(link => { link.tabIndex = -1; });
    return clone;
  }

  function render() {
    track.replaceChildren();
    const seen = new Set();
    const group = document.createElement('div');
    group.className = 'article-carousel-group';
    articles.forEach(article => {
      if (article.id == null || seen.has(String(article.id)) || !String(article.title || '').trim()) return;
      seen.add(String(article.id));
      const link = document.createElement('a');
      link.href = 'article.html?id=' + encodeURIComponent(article.id);
      link.textContent = String(article.title).trim();
      group.appendChild(link);
    });
    carousel.hidden = !group.childElementCount;
    if (carousel.hidden) return;
    track.appendChild(group);
    // Fill a complete viewport before making the second loop, without extra tab stops.
    const originals = [...group.children];
    let copies = 0;
    while (!reducedMotion.matches && group.getBoundingClientRect().width < viewport.clientWidth && copies++ < 100) {
      originals.forEach(link => group.appendChild(duplicate(link)));
    }
    const distance = group.getBoundingClientRect().width;
    track.style.setProperty('--carousel-distance', '-' + distance + 'px');
    track.style.setProperty('--carousel-duration', Math.max(30, distance / 24) + 's');
    track.appendChild(duplicate(group));
    updateMotion();
  }

  toggle.addEventListener('click', () => {
    manuallyPaused = !manuallyPaused;
    if (!manuallyPaused) keyboardBrowsing = false;
    updateMotion();
  });
  viewport.addEventListener('focusin', event => {
    if (!event.target.matches('a:focus-visible')) return;
    keyboardBrowsing = true;
    updateMotion();
    event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  viewport.addEventListener('focusout', event => {
    if (viewport.contains(event.relatedTarget)) return;
    keyboardBrowsing = false;
    viewport.scrollLeft = 0;
    updateMotion();
  });
  reducedMotion.addEventListener('change', () => { render(); });
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // Preserve keyboard focus while readers are browsing headlines.
      if (!viewport.contains(document.activeElement)) render();
    }, 150);
  });
  function receive(rows) { articles = Array.isArray(rows) ? rows : []; render(); }
  window.addEventListener('colorado-now:homepage-articles', event => receive(event.detail));
  if (Array.isArray(window.TheColoradoNow?.homepageArticles)) receive(window.TheColoradoNow.homepageArticles);
})();
