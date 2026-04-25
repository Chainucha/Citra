let currentSessions = [];

window.sunkist.onSessionChanged((updated) => {
  const idx = currentSessions.findIndex(s => s.id === updated.id);
  if (idx >= 0) currentSessions[idx] = updated;
  renderSessions(currentSessions);
});

async function init() {
  const workspace = await window.sunkist.getWorkspace();
  currentSessions = workspace.sessions;
  renderSessions(currentSessions);
}

function renderSessions(sessions) {
  const list = document.getElementById('session-list');
  list.innerHTML = sessions.map(s => `
    <li data-id="${s.id}">
      <span class="dot" style="background:${s.accentColor}"></span>
      <span>${s.name}</span>
      <span class="state">${s.state}</span>
    </li>
  `).join('');
}

document.getElementById('btn-add').addEventListener('click', async () => {
  const name = prompt('Session name:', `Account ${currentSessions.length + 1}`);
  if (!name) return;
  const session = await window.sunkist.addSession(name);
  currentSessions.push(session);
  renderSessions(currentSessions);
});

init();
