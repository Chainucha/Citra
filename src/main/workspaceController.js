const { randomUUID } = require('crypto');
const Store = require('electron-store');
const {
  computeAutoGrid, uniformRatios, normalizeRatios,
  cellKey, fillCellMap, rebuildCellMap, flattenCellMap,
} = require('../shared/gridLayoutEngine');

const store = new Store({ name: 'citra' });
const DEFAULT_W = 1600;
const DEFAULT_H = 900;

function makeDefaultLayout() {
  return {
    cols: 0, rows: 0,
    colRatios: [],
    rowRatios: [],
    cellMap: {},
  };
}

function makeDefaultGroup(name = 'Group 1') {
  return { id: randomUUID(), name, layout: makeDefaultLayout() };
}

function legacyPresetToRatios(preset, splitRatio) {
  const presets = {
    'split-h-50': { dir: 'row',    a: 0.5 },
    'split-h-70': { dir: 'row',    a: 0.7 },
    'split-h-30': { dir: 'row',    a: 0.3 },
    'split-v-50': { dir: 'column', a: 0.5 },
    'split-v-70': { dir: 'column', a: 0.7 },
    'split-v-30': { dir: 'column', a: 0.3 },
  };
  const p = presets[preset] || presets['split-h-50'];
  const a = (splitRatio != null) ? splitRatio : p.a;
  if (p.dir === 'row') return { cols: 2, rows: 1, colRatios: [a, 1 - a], rowRatios: [1] };
  return                      { cols: 1, rows: 2, colRatios: [1], rowRatios: [a, 1 - a] };
}

function isLayoutValid(l) {
  if (!l || typeof l !== 'object') return false;
  const { cols, rows, colRatios, rowRatios, cellMap } = l;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 0 || rows < 0) return false;
  if (!Array.isArray(colRatios) || colRatios.length !== cols) return false;
  if (!Array.isArray(rowRatios) || rowRatios.length !== rows) return false;
  if (!cellMap || typeof cellMap !== 'object') return false;
  for (const k of Object.keys(cellMap)) {
    const m = /^(\d+),(\d+)$/.exec(k);
    if (!m) return false;
    const r = +m[1], c = +m[2];
    if (r >= rows || c >= cols) return false;
  }
  return true;
}

function migrateGroup(group, sessionIds) {
  if (group.layout && isLayoutValid(group.layout)) return;
  // Either legacy (no modern layout) or corrupted modern layout — regenerate.
  const isLegacy = !group.layout || !Array.isArray(group.layout.colRatios);
  if (!isLegacy) group.layout = null;

  const N = sessionIds.length;
  if (N === 0) {
    group.layout = makeDefaultLayout();
  } else if (N === 1) {
    group.layout = {
      cols: 1, rows: 1,
      colRatios: [1], rowRatios: [1],
      cellMap: { [cellKey(0, 0)]: sessionIds[0] },
    };
  } else if (N === 2 && isLegacy && group.activePreset) {
    const r = legacyPresetToRatios(group.activePreset, group.splitRatio);
    group.layout = {
      cols: r.cols, rows: r.rows,
      colRatios: r.colRatios, rowRatios: r.rowRatios,
      cellMap: fillCellMap(sessionIds, r.cols, r.rows),
    };
  } else {
    const { cols, rows } = computeAutoGrid(N, DEFAULT_W, DEFAULT_H);
    group.layout = {
      cols, rows,
      colRatios: uniformRatios(cols),
      rowRatios: uniformRatios(rows),
      cellMap: fillCellMap(sessionIds, cols, rows),
    };
  }
  delete group.activePreset;
  delete group.lockLayout;
  delete group.splitRatio;
}

function loadWorkspace() {
  const saved = store.get('workspace');
  if (!saved) {
    const group = makeDefaultGroup();
    return {
      id: randomUUID(),
      name: 'Default',
      sessions: [],
      groups: [group],
      overlayVisible: true,
    };
  }
  saved.sessions = saved.sessions || [];
  saved.sessions.forEach(s => {
    s.hwnd = null; s.pid = null; s.state = 'idle';
    if (typeof s.muted !== 'boolean') s.muted = true;
  });

  if (!Array.isArray(saved.groups) || saved.groups.length === 0) {
    const group = makeDefaultGroup();
    group.activePreset = saved.activePreset || 'split-h-50';
    group.lockLayout   = !!saved.lockLayout;
    saved.groups = [group];
    saved.sessions.forEach(s => { s.groupId = group.id; });
  } else {
    saved.sessions.forEach(s => {
      if (s.groupId && !saved.groups.some(g => g.id === s.groupId)) s.groupId = null;
      if (s.groupId === undefined) s.groupId = null;
    });
  }

  saved.groups.forEach(g => {
    const sessionIds = saved.sessions.filter(s => s.groupId === g.id).map(s => s.id);
    migrateGroup(g, sessionIds);
  });

  delete saved.activePreset;
  delete saved.lockLayout;
  return saved;
}

function saveWorkspace(workspace, patch = {}) {
  Object.assign(workspace, patch);
  const toSave = {
    ...workspace,
    sessions: workspace.sessions.map(({ hwnd, pid, state, ...rest }) => rest),
  };
  store.set('workspace', toSave);
}

function groupSessionIds(workspace, groupId) {
  return workspace.sessions.filter(s => s.groupId === groupId).map(s => s.id);
}

// Recompute layout for current active sessions.
// Topology = computeAutoGrid(N_active, W, H). Ratios reset to uniform on
// topology change. cellMap preserves relative order via row-major flatten/refill;
// new actives fill empty cells. Called on session start/stop.
function topologyKey(cols, rows) { return `${cols}x${rows}`; }

// Stash current ratios + cellMap into per-topology cache. Called before topology
// change, on user-driven ratio save, and on user-driven cell swap, so a future
// reopen with the same topology can restore both divider positions and pane order.
function snapshotTopology(layout) {
  if (!layout.cols || !layout.rows) return;
  if (!layout.savedRatios) layout.savedRatios = {};
  layout.savedRatios[topologyKey(layout.cols, layout.rows)] = {
    colRatios: layout.colRatios.slice(),
    rowRatios: layout.rowRatios.slice(),
    cellMap: { ...layout.cellMap },
  };
}

function restoreRatiosOrUniform(layout, cols, rows) {
  const cache = layout.savedRatios?.[topologyKey(cols, rows)];
  if (cache && Array.isArray(cache.colRatios) && cache.colRatios.length === cols
           && Array.isArray(cache.rowRatios) && cache.rowRatios.length === rows) {
    return { colRatios: cache.colRatios.slice(), rowRatios: cache.rowRatios.slice() };
  }
  return { colRatios: uniformRatios(cols), rowRatios: uniformRatios(rows) };
}

// Reconcile cached cellMap with current active set: drop stale ids, fill empties
// with active ids missing from cache (row-major). Returns null if no usable cache,
// caller falls back to rebuildCellMap.
function restoreCellMap(layout, cols, rows, activeIds) {
  const cache = layout.savedRatios?.[topologyKey(cols, rows)];
  if (!cache || !cache.cellMap || typeof cache.cellMap !== 'object') return null;
  const valid = new Set(activeIds);
  const restored = {};
  for (const k of Object.keys(cache.cellMap)) {
    const m = /^(\d+),(\d+)$/.exec(k);
    if (!m) continue;
    const r = +m[1], c = +m[2];
    if (r >= rows || c >= cols) continue;
    const id = cache.cellMap[k];
    if (valid.has(id) && !Object.values(restored).includes(id)) restored[k] = id;
  }
  const placed = new Set(Object.values(restored));
  const missing = activeIds.filter(id => !placed.has(id));
  let mi = 0;
  for (let r = 0; r < rows && mi < missing.length; r++) {
    for (let c = 0; c < cols && mi < missing.length; c++) {
      const k = cellKey(r, c);
      if (!restored[k]) restored[k] = missing[mi++];
    }
  }
  return restored;
}

function recomputeLayoutForActive(group, activeIds, hintW = DEFAULT_W, hintH = DEFAULT_H) {
  const layout = group.layout;
  const N = activeIds.length;

  if (N === 0) {
    // Don't wipe savedRatios — preserve user customizations across full close.
    snapshotTopology(layout);
    layout.cols = 0; layout.rows = 0;
    layout.colRatios = []; layout.rowRatios = [];
    layout.cellMap = {};
    return;
  }

  const { cols, rows } = computeAutoGrid(N, hintW, hintH);

  // Drop entries not in active set.
  const valid = new Set(activeIds);
  const filtered = {};
  for (const k of Object.keys(layout.cellMap)) {
    if (valid.has(layout.cellMap[k])) filtered[k] = layout.cellMap[k];
  }

  if (cols === layout.cols && rows === layout.rows) {
    layout.cellMap = filtered;
    // Same topology — fill missing actives into empty cells (row-major).
    const placed = new Set(Object.values(layout.cellMap));
    const missing = activeIds.filter(id => !placed.has(id));
    let mi = 0;
    for (let r = 0; r < rows && mi < missing.length; r++) {
      for (let c = 0; c < cols && mi < missing.length; c++) {
        const k = cellKey(r, c);
        if (!layout.cellMap[k]) layout.cellMap[k] = missing[mi++];
      }
    }
    return;
  }

  // Topology changed — snapshot current, then restore cached cellMap+ratios for
  // the new topology if present, otherwise rebuild and use uniform ratios.
  snapshotTopology(layout);
  const oldCols = layout.cols, oldRows = layout.rows;
  layout.cols = cols;
  layout.rows = rows;
  const restoredCells = restoreCellMap(layout, cols, rows, activeIds);
  layout.cellMap = restoredCells
    ?? rebuildCellMap(filtered, oldCols, oldRows, cols, rows, activeIds);
  const restoredRatios = restoreRatiosOrUniform(layout, cols, rows);
  layout.colRatios = restoredRatios.colRatios;
  layout.rowRatios = restoredRatios.rowRatios;
}

function setLayoutRatios(group, colRatios, rowRatios) {
  const layout = group.layout;
  layout.colRatios = normalizeRatios(colRatios, layout.cols);
  layout.rowRatios = normalizeRatios(rowRatios, layout.rows);
  // Persist user choice so future topology returns restore it.
  snapshotTopology(layout);
}

// Move pane from fromCell to toCell.
// Empty toCell → relocate. Occupied toCell → swap.
function swapLayoutCells(group, fromCell, toCell) {
  const layout = group.layout;
  const a = layout.cellMap[fromCell];
  const b = layout.cellMap[toCell];
  if (!a) return false;
  if (fromCell === toCell) return false;
  if (b) layout.cellMap[fromCell] = b; else delete layout.cellMap[fromCell];
  layout.cellMap[toCell] = a;
  // Persist user pane arrangement so future topology returns restore it.
  snapshotTopology(layout);
  return true;
}

function addSession(workspace, name, groupId) {
  const colors = ['#F59E0B', '#06B6D4', '#8B5CF6', '#10B981'];
  const targetGroupId = (groupId && workspace.groups.some(g => g.id === groupId))
    ? groupId
    : null;
  const session = {
    id: randomUUID(),
    groupId: targetGroupId,
    name,
    browserPath: null,
    url: 'https://universe.flyff.com/play',
    hotkey: null,
    accentColor: colors[workspace.sessions.length % colors.length],
    muted: true,
    hwnd: null,
    pid: null,
    state: 'idle',
  };
  workspace.sessions.push(session);
  return session;
}

function deleteSession(workspace, id) {
  const idx = workspace.sessions.findIndex(s => s.id === id);
  if (idx < 0) return false;
  const { groupId } = workspace.sessions[idx];
  workspace.sessions.splice(idx, 1);
  return true;
}

function setSessionMuted(workspace, id, muted) {
  const session = workspace.sessions.find(s => s.id === id);
  if (!session) return null;
  session.muted = !!muted;
  return session;
}

function renameSession(workspace, id, name) {
  const session = workspace.sessions.find(s => s.id === id);
  if (!session) return null;
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  session.name = trimmed;
  return session;
}

function moveSessionToGroup(workspace, sessionId, groupId, beforeId) {
  const idx = workspace.sessions.findIndex(s => s.id === sessionId);
  if (idx < 0) return null;
  const session = workspace.sessions[idx];
  if (groupId !== null && !workspace.groups.some(g => g.id === groupId)) return null;
  if (session.state !== 'idle') return null;

  session.groupId = groupId;

  // Optional repositioning. If beforeId is provided, splice the session into
  // the array immediately before that anchor; null/undefined leaves order alone.
  if (beforeId !== undefined) {
    const arr = workspace.sessions;
    arr.splice(idx, 1);
    if (beforeId === null) {
      arr.push(session);
    } else {
      const anchor = arr.findIndex(s => s.id === beforeId);
      if (anchor < 0) arr.push(session);
      else arr.splice(anchor, 0, session);
    }
  }
  return session;
}

function addGroup(workspace, name) {
  const group = makeDefaultGroup(name || `Group ${workspace.groups.length + 1}`);
  workspace.groups.push(group);
  return group;
}

function renameGroup(workspace, id, name) {
  const group = workspace.groups.find(g => g.id === id);
  if (!group) return null;
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  group.name = trimmed;
  return group;
}

function deleteGroup(workspace, id) {
  const idx = workspace.groups.findIndex(g => g.id === id);
  if (idx < 0) return false;
  const hasActive = workspace.sessions.some(s => s.groupId === id && s.state !== 'idle');
  if (hasActive) return false;
  workspace.sessions.forEach(s => { if (s.groupId === id) s.groupId = null; });
  workspace.groups.splice(idx, 1);
  return true;
}

function updateGroup(workspace, id, patch) {
  const group = workspace.groups.find(g => g.id === id);
  if (!group) return null;
  if ('name' in patch && patch.name) {
    const trimmed = String(patch.name).trim();
    if (trimmed) group.name = trimmed;
  }
  return group;
}

module.exports = {
  loadWorkspace, saveWorkspace,
  addSession, deleteSession, renameSession, moveSessionToGroup, setSessionMuted,
  addGroup, deleteGroup, renameGroup, updateGroup,
  recomputeLayoutForActive,
  setLayoutRatios, swapLayoutCells,
  groupSessionIds,
};
