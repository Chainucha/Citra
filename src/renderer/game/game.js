const PRESETS = {
  'split-h-50': { dir: 'row',    ratio: 0.5 },
  'split-h-70': { dir: 'row',    ratio: 0.7 },
  'split-v-50': { dir: 'column', ratio: 0.5 },
  'split-v-70': { dir: 'column', ratio: 0.7 },
};

let splitRatio = 0.5;
let splitDir   = 'row';
let lastIds    = '';

window.gameBridge.onUpdate(({ sessions, preset, applyRatio }) => {
  const cfg = PRESETS[preset] || { dir: 'row', ratio: 0.5 };
  const newIds = sessions.map(s => s.id).join(',');

  const dirChanged = cfg.dir !== splitDir;
  const needRebuild = newIds !== lastIds || dirChanged || applyRatio;

  if (dirChanged || applyRatio) {
    splitRatio = cfg.ratio;
    splitDir   = cfg.dir;
  }

  if (needRebuild) {
    lastIds = newIds;
    buildLayout(sessions);
  }
});

window.gameBridge.ready();

function buildLayout(sessions) {
  const container = document.getElementById('container');
  const overlay   = document.getElementById('drag-overlay');

  container.style.flexDirection = splitDir;
  container.innerHTML = '';

  if (sessions.length === 0) return;

  const views = sessions.slice(0, 2).map(makeWebview);

  if (views.length === 1) {
    views[0].style.flex = '1';
    container.appendChild(views[0]);
    return;
  }

  views[0].style.flex = String(splitRatio);
  views[1].style.flex = String(1 - splitRatio);

  container.append(views[0], makeDivider(views[0], views[1], container, overlay), views[1]);
}

function makeWebview(session) {
  const wv = document.createElement('webview');
  wv.setAttribute('partition', `persist:${session.id}`);
  wv.setAttribute('src', session.url || 'https://universe.flyff.com/play');
  wv.style.minWidth  = '0';
  wv.style.minHeight = '0';
  if (splitDir === 'row') wv.style.height = '100%';
  else                    wv.style.width  = '100%';
  return wv;
}

function makeDivider(a, b, container, overlay) {
  const isRow = splitDir === 'row';
  const div = document.createElement('div');
  div.className = `divider ${isRow ? 'vertical' : 'horizontal'}`;
  div.innerHTML = '<div class="divider-handle"></div>';

  div.addEventListener('mousedown', e => {
    e.preventDefault();
    overlay.style.cursor = isRow ? 'col-resize' : 'row-resize';
    overlay.classList.add('active');
    div.classList.add('dragging');

    const startPos  = isRow ? e.clientX : e.clientY;
    const startFlex = parseFloat(a.style.flex);

    const onMove = e => {
      const containerSize = isRow ? container.clientWidth : container.clientHeight;
      const divSize       = isRow ? div.offsetWidth : div.offsetHeight;
      const delta         = (isRow ? e.clientX : e.clientY) - startPos;
      const newFlex = Math.max(0.1, Math.min(0.9, startFlex + delta / (containerSize - divSize)));
      a.style.flex  = String(newFlex);
      b.style.flex  = String(1 - newFlex);
      splitRatio    = newFlex;
    };

    const onUp = () => {
      overlay.classList.remove('active');
      div.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  return div;
}
