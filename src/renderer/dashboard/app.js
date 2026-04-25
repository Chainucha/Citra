// Minimal bootstrap — wired up fully in Task 8
async function init() {
  const workspace = await window.sunkist.getWorkspace();
  renderSessions(workspace.sessions);
}

function renderSessions(sessions) {
  const list = document.getElementById('session-list');
  list.innerHTML = sessions.map(s => `
    <li>
      <span class="dot" style="background:${s.accentColor}"></span>
      <span>${s.name}</span>
    </li>
  `).join('');
}

document.getElementById('btn-add').addEventListener('click', async () => {
  const name = prompt('Session name:', `Account ${Date.now()}`);
  if (!name) return;
  await window.sunkist.addSession(name);
  const workspace = await window.sunkist.getWorkspace();
  renderSessions(workspace.sessions);
});

init();
