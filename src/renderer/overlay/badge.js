// Bootstrap
const { sessionId, label, color } = window.overlayBridge;
document.getElementById('label').textContent = label;
document.getElementById('dot').style.background = color || '#f59e0b';

// Click-through toggling: interactive inside badge, pass-through outside
const badge = document.getElementById('badge');
badge.addEventListener('mouseenter', () => window.overlayBridge.setInteractive(true));
badge.addEventListener('mouseleave', () => window.overlayBridge.setInteractive(false));

// Focus button
document.getElementById('btn-focus').addEventListener('click', () =>
  window.overlayBridge.focusSession());

// Timer
let countdown = null;
let remaining = 0;

function tick() {
  remaining--;
  const m = String(Math.floor(remaining / 60)).padStart(2, '0');
  const s = String(remaining % 60).padStart(2, '0');
  document.getElementById('timer-display').textContent = remaining > 0 ? `${m}:${s}` : 'Done';
  if (remaining <= 0) { clearInterval(countdown); countdown = null; }
}

document.getElementById('btn-timer').addEventListener('click', () => {
  remaining = (remaining > 0 ? remaining : 0) + 30;
  const m = String(Math.floor(remaining / 60)).padStart(2, '0');
  const s = String(remaining % 60).padStart(2, '0');
  document.getElementById('timer-display').textContent = `${m}:${s}`;
  if (!countdown) countdown = setInterval(tick, 1000);
});

document.getElementById('btn-reset').addEventListener('click', () => {
  clearInterval(countdown);
  countdown = null;
  remaining = 0;
  document.getElementById('timer-display').textContent = '--';
});
