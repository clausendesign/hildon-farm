const menu = document.querySelector('.map-layer-menu');
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('#current-layer-label').textContent = button.textContent.trim();
  menu.open = false;
  menu.querySelector('summary').focus();
}));
document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); } });
