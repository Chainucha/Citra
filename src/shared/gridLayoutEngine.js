// src/shared/gridLayoutEngine.js
//
// Pure layout helpers shared by main and the container renderer. No Electron
// imports — must work in both Node and the renderer.

function computeAutoGrid(N, W, H) {
  if (N <= 0) return { cols: 0, rows: 0 };
  if (N === 1) return { cols: 1, rows: 1 };
  const aspect = (W > 0 && H > 0) ? W / H : 16 / 9;
  let best = { cols: 1, rows: N, score: Infinity };
  for (let cols = 1; cols <= N; cols++) {
    const rows = Math.ceil(N / cols);
    const cellAspect = (W / cols) / (H / rows);
    const score = Math.abs(Math.log(cellAspect / aspect));
    if (score < best.score) best = { cols, rows, score };
  }
  return { cols: best.cols, rows: best.rows };
}

function uniformRatios(n) {
  if (n <= 0) return [];
  return Array(n).fill(1 / n);
}

function normalizeRatios(arr, n) {
  const a = Array.isArray(arr) ? arr.slice(0, n) : [];
  while (a.length < n) a.push(0);
  const sum = a.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  if (sum <= 0) return uniformRatios(n);
  return a.map(v => (Number.isFinite(v) && v > 0 ? v : 0) / sum)
          .map(v => v > 0 ? v : 1 / n);
}

function cellKey(r, c) { return `${r},${c}`; }

function cellsRowMajor(cols, rows) {
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ r, c });
  return out;
}

function flattenCellMap(cellMap, cols, rows) {
  const out = [];
  for (const { r, c } of cellsRowMajor(cols, rows)) {
    const id = cellMap?.[cellKey(r, c)];
    if (id) out.push(id);
  }
  return out;
}

// Build a row-major cellMap from a session-id list. Truncates if list longer
// than cols*rows.
function fillCellMap(sessionIds, cols, rows) {
  const map = {};
  const cells = cellsRowMajor(cols, rows);
  for (let i = 0; i < sessionIds.length && i < cells.length; i++) {
    const { r, c } = cells[i];
    map[cellKey(r, c)] = sessionIds[i];
  }
  return map;
}

// Rebuild cellMap when topology changes — preserve relative order via row-major
// flatten/refill. sessionIds (optional) merges in any session not yet placed.
function rebuildCellMap(prevCellMap, prevCols, prevRows, nextCols, nextRows, sessionIds = null) {
  const ordered = flattenCellMap(prevCellMap, prevCols, prevRows);
  if (sessionIds) {
    const seen = new Set(ordered);
    for (const id of sessionIds) if (!seen.has(id)) ordered.push(id);
    // Drop ids not in sessionIds
    const valid = new Set(sessionIds);
    return fillCellMap(ordered.filter(id => valid.has(id)), nextCols, nextRows);
  }
  return fillCellMap(ordered, nextCols, nextRows);
}

module.exports = {
  computeAutoGrid,
  uniformRatios,
  normalizeRatios,
  cellKey,
  cellsRowMajor,
  flattenCellMap,
  fillCellMap,
  rebuildCellMap,
};
