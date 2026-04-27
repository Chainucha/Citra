const { label, color } = window.overlayBridge;
document.getElementById('label').textContent = label;
document.getElementById('dot').style.background = color || '#f59e0b';

const badge = document.getElementById('badge');
badge.addEventListener('mouseenter', () => window.overlayBridge.setInteractive(true));
badge.addEventListener('mouseleave', () => window.overlayBridge.setInteractive(false));

document.getElementById('btn-focus').addEventListener('click', () =>
  window.overlayBridge.focusSession());
