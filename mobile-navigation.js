(function () {
  const menu = document.querySelector('.mobile-more');
  if (!menu) return;

  const trigger = menu.querySelector('summary');
  function closeMenu() { menu.open = false; }

  document.addEventListener('pointerdown', (event) => {
    if (!menu.contains(event.target)) closeMenu();
  });
  document.addEventListener('focusin', (event) => {
    if (!menu.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.open) {
      closeMenu();
      trigger.focus();
    }
  });
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });
  window.matchMedia('(max-width: 760px)').addEventListener('change', closeMenu);
  window.addEventListener('pageshow', closeMenu);
})();
