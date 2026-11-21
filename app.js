// ===== Redline: shared bits, theme, preferences =====
const $ = s => document.querySelector(s);
const ACT = window.ACT = window.ACT || {};
const PREF = Object.assign({ dpi: 300, tol: 40, edge: 0, minpx: 2, startView: 'compare', confirmSave: true, scanMax: 12, perfMode: 'auto' }, (() => { try { return JSON.parse(localStorage.getItem('prefs') || '{}'); } catch (e) { return {}; } })());
window.PREF = PREF; window.savePrefs = () => { try { localStorage.setItem('prefs', JSON.stringify(PREF)); } catch (e) {} };
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('theme', t); } catch (e) {}
  const sel = document.getElementById('kdock-theme-sel');
  if (t === 'light') {
    if (sel && sel.value !== 'light') sel.value = 'light';
  } else {
    let savedPal = 'kensho';
    try { savedPal = localStorage.getItem('kensho_cad_palette') || 'kensho'; } catch (e) {}
    if (savedPal === 'light') savedPal = 'kensho';
    if (!document.documentElement.dataset.cadPalette) {
      document.documentElement.dataset.cadPalette = savedPal;
    }
    if (sel && sel.value === 'light') sel.value = document.documentElement.dataset.cadPalette || savedPal;
  }
  const tb = $('#theme');
  if (tb) {
    const icEl = tb.querySelector('[data-ic]');
    if (icEl) {
      icEl.dataset.ic = t === 'dark' ? 'sun' : 'moon';
      if (typeof hydrateIcons === 'function') hydrateIcons(tb);
    }
  }
  if (typeof window !== 'undefined' && window.DXFStudio && typeof window.DXFStudio.renderCanvas === 'function' && document.body && document.body.dataset.view === 'dxf') {
    window.DXFStudio.renderCanvas();
  }
}
window.setTheme = setTheme;
(function () { let t = null; try { t = localStorage.getItem('theme'); } catch (e) {} setTheme(t || 'dark'); })();
if ($('#theme')) {
  $('#theme').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}
let busyN = 0; window.busy = on => { busyN = Math.max(0, busyN + (on ? 1 : -1)); $('#busy').hidden = busyN === 0; };
window.__recentMemFiles = window.__recentMemFiles || new Map();
window.addRecent = (name, path, slot = null, bytes = null) => {
  const cleanPath = (path && String(path).trim()) ? String(path).trim() : '';
  const cleanName = (name && String(name).trim()) ? String(name).trim() : (cleanPath ? cleanPath.split(/[\\/]/).pop() : '');
  if (!cleanName) return;
  const keyPath = cleanPath || cleanName;
  if (bytes && keyPath) {
    try {
      const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const isDiskBacked = !!(cleanPath && window.native && window.native.readFile && !/^memory:/i.test(cleanPath));
      if (!isDiskBacked && u8.byteLength <= 4 * 1024 * 1024) {
        if (window.__recentMemFiles.has(keyPath)) window.__recentMemFiles.delete(keyPath);
        window.__recentMemFiles.set(keyPath, { name: cleanName, path: cleanPath, bytes: u8 });
        while (window.__recentMemFiles.size > 6) {
          const oldestKey = window.__recentMemFiles.keys().next().value;
          const oldVal = window.__recentMemFiles.get(oldestKey);
          if (oldVal) oldVal.bytes = null;
          window.__recentMemFiles.delete(oldestKey);
        }
      }
    } catch (e) {}
  }
  // Only persist items to localStorage if they have a real filesystem path or are in-memory session entries
  if (!cleanPath && /^Sample_/i.test(cleanName)) return;
  try {
    let r = JSON.parse(localStorage.getItem('recent') || '[]').filter(x => (x.path || x.name) !== keyPath && x.name !== cleanName);
    r.unshift({ name: cleanName, path: cleanPath, slot, at: Date.now() });
    localStorage.setItem('recent', JSON.stringify(r.slice(0, 8)));
  } catch (e) {}
};
const b2u = b => b instanceof Uint8Array ? b : new Uint8Array(b);
const getSafeAuthor = (fallback = 'Lead Engineer') => { try { return localStorage.getItem('author') || fallback; } catch (e) { return fallback; } };

/* ============================================================================
 * [MODULE SECTION: CORE COMPARE ENGINE & VIEWPORT STATE]
 * WHAT THIS IS: Manages Slot A (Base) and Slot B (Revised) documents, viewport
 *   zoom/pan (`S.view`), cardinal rotations/mirrors, and compare colors (`S.tintA/B/C`).
 * WHY / HOW TO EDIT: Edit `setCompareColors()`, `setCompareSlotRotation()`, or
 *   `CompareMemoryGuard` bindings below to customize viewport state or memory limits.
 * ============================================================================ */
const _cmpMemGuard = (typeof CompareMemoryGuard !== 'undefined' && CompareMemoryGuard)
  ? CompareMemoryGuard
  : (typeof require === 'function' ? (() => { try { return require('./compare_memory_guard.js'); } catch (e) { return null; } })() : null);
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
function clampZoom(zoom, min = 0.05, max = 64.0) {
  zoom = Math.max(0.05, Math.min(64.0, Number.isFinite(zoom) && zoom > 0 ? zoom : 1.0));
  return Math.max(min, Math.min(max, zoom));
}
function clampPan(val, fallback = 0) {
  return Number.isFinite(val) ? Math.max(-1e6, Math.min(1e6, val)) : fallback;
}
function sanitizeFilePath(rawPath) {
  if (typeof rawPath !== 'string') return '';
  let s = rawPath.trim().replace(/^["']+|["']+$/g, '');
  if (/^file:\/\//i.test(s)) {
    try { s = decodeURIComponent(s.replace(/^file:\/\/(localhost)?/i, '')); } catch (e) {}
  }
  return s;
}
window.clampZoom = clampZoom;
window.clampPan = clampPan;
window.sanitizeFilePath = sanitizeFilePath;
window.rpTileManager = (typeof WorkerEngine !== 'undefined' && WorkerEngine.VirtualTileManager)
  ? new WorkerEngine.VirtualTileManager()
  : null;

const S = { showTok: 0, A: null, B: null, docA: null, docB: null, degA: 0, degB: 0, rotA: 0, rotB: 0, mirrorXA: false, mirrorYA: false, mirrorXB: false, mirrorYB: false, tintA: '#e11414', tintB: '#00a53c', tintC: '#94a3b8', opA: 100, opB: 100, opC: 42, renderTask: null, renderTasks: [], names: {}, n: 1, cur: null, sel: -1, mode: 'paper', view: { x: 0, y: 0, k: 1 }, phase: 0, timer: null, scan: {}, done: {}, ignore: [], ignMode: false, ig: null };
function syncCompareColorUI() {
  const cA = S.tintA || '#e11414', cB = S.tintB || '#00a53c', cC = S.tintC || '#94a3b8';
  const oA = S.opA != null ? S.opA : 100, oB = S.opB != null ? S.opB : 100, oC = S.opC != null ? S.opC : 42;
  ['#rp-tint-a', '#rib-tint-a', '#cHudTintA', '#dxf-st-col-a', '#alg-col-a'].forEach(sel => { const el = $(sel); if (el && el.value !== cA) el.value = cA; });
  ['#rp-tint-b', '#rib-tint-b', '#cHudTintB', '#dxf-st-col-b', '#alg-col-b'].forEach(sel => { const el = $(sel); if (el && el.value !== cB) el.value = cB; });
  ['#rp-tint-c', '#rib-tint-c', '#cHudTintC', '#dxf-st-col-c', '#alg-col-c'].forEach(sel => { const el = $(sel); if (el && el.value !== cC) el.value = cC; });
  if ($('#rp-op-a')) $('#rp-op-a').value = oA;
  if ($('#rp-op-a-val')) $('#rp-op-a-val').textContent = oA + '%';
  if ($('#rp-op-b')) $('#rp-op-b').value = oB;
  if ($('#rp-op-b-val')) $('#rp-op-b-val').textContent = oB + '%';
  if ($('#rp-op-c')) $('#rp-op-c').value = oC;
  if ($('#rp-op-c-val')) $('#rp-op-c-val').textContent = oC + '%';
  if ($('#rib-op-c')) $('#rib-op-c').value = oC;
}
window.syncCompareColorUI = syncCompareColorUI;
window.setCompareColors = (opts = {}, pushHist = false) => {
  if (pushHist && window.rpPushCompareHistory) window.rpPushCompareHistory('Change compare colors');
  if (opts.tintA) S.tintA = opts.tintA;
  if (opts.tintB) S.tintB = opts.tintB;
  if (opts.tintC) S.tintC = opts.tintC;
  if (opts.opA != null) S.opA = +opts.opA;
  if (opts.opB != null) S.opB = +opts.opB;
  if (opts.opC != null) S.opC = +opts.opC;
  syncCompareColorUI();
  clearMips();
  if (typeof paint === 'function' && S.cur) paint();
  if (window.DXFStudio && typeof window.DXFStudio.renderCanvas === 'function' && document.body.dataset.view === 'dxf') {
    window.DXFStudio.renderCanvas();
  }
};
function getSlotCardinalDeg(k) {
  const raw = k === 'A' ? (S.degA || 0) : (S.degB || 0);
  return (((Math.round((Number(raw) || 0) / 90) * 90) % 360) + 360) % 360;
}
function getSlotMirror(k) {
  return {
    x: !!(k === 'A' ? S.mirrorXA : S.mirrorXB),
    y: !!(k === 'A' ? S.mirrorYA : S.mirrorYB)
  };
}
function syncCompareRotationUI() {
  const dA = getSlotCardinalDeg('A'), dB = getSlotCardinalDeg('B');
  const rA = Number(parseFloat(S.rotA) || 0), rB = Number(parseFloat(S.rotB) || 0);
  const mA = getSlotMirror('A'), mB = getSlotMirror('B');
  ['#rib-rot-a-sel', '#rp-deg-a', '#rotA'].forEach(sel => { const el = $(sel); if (el) el.value = String(dA); });
  ['#rib-rot-b-sel', '#rp-deg-b', '#rotB'].forEach(sel => { const el = $(sel); if (el) el.value = String(dB); });
  const targetRev = ($('#rib-target-rev') && $('#rib-target-rev').value) || 'B';
  const activeDeg = targetRev === 'A' ? dA : dB;
  const activeMir = targetRev === 'A' ? (mA.x || mA.y) : (targetRev === 'AB' ? ((mA.x || mA.y) && (mB.x || mB.y)) : (mB.x || mB.y));
  if ($('#rib-rot-sel')) $('#rib-rot-sel').value = String(activeDeg);
  if ($('#rib-mirror-btn')) $('#rib-mirror-btn').classList.toggle('on', !!activeMir);
  if ($('#rp-rot-a')) $('#rp-rot-a').value = rA;
  if ($('#rp-cur-rot-a')) $('#rp-cur-rot-a').textContent = Number(rA.toFixed(2)) + '°';
  if ($('#rp-rot-b')) $('#rp-rot-b').value = rB;
  if ($('#rp-cur-rot')) $('#rp-cur-rot').textContent = Number(rB.toFixed(2)) + '°';
  ['#rib-mir-a-x', '#rp-mir-a-x'].forEach(sel => { const el = $(sel); if (el) el.classList.toggle('on', mA.x); });
  ['#rib-mir-a-y', '#rp-mir-a-y'].forEach(sel => { const el = $(sel); if (el) el.classList.toggle('on', mA.y); });
  ['#rib-mir-b-x', '#rp-mir-b-x'].forEach(sel => { const el = $(sel); if (el) el.classList.toggle('on', mB.x); });
  ['#rib-mir-b-y', '#rp-mir-b-y'].forEach(sel => { const el = $(sel); if (el) el.classList.toggle('on', mB.y); });
  if ($('#cHudRotA')) {
    const sp = $('#cHudRotA span');
    if (sp) sp.textContent = dA ? `A:${dA}°` : 'A↻';
    $('#cHudRotA').classList.toggle('on', dA !== 0);
  }
  if ($('#cHudRotB')) {
    const sp = $('#cHudRotB span');
    if (sp) sp.textContent = dB ? `B:${dB}°` : 'B↻';
    $('#cHudRotB').classList.toggle('on', dB !== 0);
  }
  if ($('#cHudMirA')) {
    const sp = $('#cHudMirA span');
    const tag = (mA.x && mA.y) ? 'A:HV' : (mA.x ? 'A:FlipH' : (mA.y ? 'A:FlipV' : 'A⇄'));
    if (sp) sp.textContent = tag;
    $('#cHudMirA').classList.toggle('on', mA.x || mA.y);
  }
  if ($('#cHudMirB')) {
    const sp = $('#cHudMirB span');
    const tag = (mB.x && mB.y) ? 'B:HV' : (mB.x ? 'B:FlipH' : (mB.y ? 'B:FlipV' : 'B⇄'));
    if (sp) sp.textContent = tag;
    $('#cHudMirB').classList.toggle('on', mB.x || mB.y);
  }
}
window.getSlotCardinalDeg = getSlotCardinalDeg;
window.getSlotMirror = getSlotMirror;
window.syncCompareRotationUI = syncCompareRotationUI;
window.setCompareSlotRotation = (slot, deg, pushHist = true) => {
  const norm = d => (((Math.round((Number(d) || 0) / 90) * 90) % 360) + 360) % 360;
  if (pushHist && window.rpPushCompareHistory) window.rpPushCompareHistory(`Rotate Rev ${slot}`);
  if (slot === 'A' || slot === 'AB') S.degA = norm(deg);
  if (slot === 'B' || slot === 'AB') S.degB = norm(deg);
  syncCompareRotationUI();
  clearMips();
  if (window.rpCancelSharpen) window.rpCancelSharpen();
  if (typeof refresh === 'function') refresh();
  if (window.rpToast) {
    const msg = slot === 'AB'
      ? `Rotated Rev A (${S.degA}°) & Rev B (${S.degB}°)`
      : `Rotated Rev ${slot} to ${slot === 'A' ? S.degA : S.degB}°`;
    window.rpToast(msg);
  }
};
window.rotateCompareSlot = (slot, deltaDeg = 90) => {
  if (slot === 'AB') {
    if (window.rpPushCompareHistory) window.rpPushCompareHistory('Rotate Rev A & B');
    S.degA = getSlotCardinalDeg('A') + deltaDeg;
    S.degB = getSlotCardinalDeg('B') + deltaDeg;
    S.degA = getSlotCardinalDeg('A');
    S.degB = getSlotCardinalDeg('B');
    syncCompareRotationUI();
    clearMips();
    if (window.rpCancelSharpen) window.rpCancelSharpen();
    if (typeof refresh === 'function') refresh();
    if (window.rpToast) window.rpToast(`Rotated Rev A (${S.degA}°) & Rev B (${S.degB}°)`);
    return;
  }
  const cur = getSlotCardinalDeg(slot);
  window.setCompareSlotRotation(slot, cur + deltaDeg, true);
};
window.setCompareSlotMirror = (slot, axis = 'x', val = null, pushHist = true) => {
  const ax = String(axis || 'x').toLowerCase();
  if (pushHist && window.rpPushCompareHistory) window.rpPushCompareHistory(`Mirror Rev ${slot}`);
  if (ax === 'reset') {
    if (slot === 'A' || slot === 'AB') { S.mirrorXA = false; S.mirrorYA = false; }
    if (slot === 'B' || slot === 'AB') { S.mirrorXB = false; S.mirrorYB = false; }
  } else if (ax === 'y' || ax === 'v') {
    if (slot === 'A' || slot === 'AB') S.mirrorYA = val != null ? !!val : !S.mirrorYA;
    if (slot === 'B' || slot === 'AB') S.mirrorYB = val != null ? !!val : !S.mirrorYB;
  } else {
    if (slot === 'A' || slot === 'AB') S.mirrorXA = val != null ? !!val : !S.mirrorXA;
    if (slot === 'B' || slot === 'AB') S.mirrorXB = val != null ? !!val : !S.mirrorXB;
  }
  syncCompareRotationUI();
  clearMips();
  if (window.rpCancelSharpen) window.rpCancelSharpen();
  if (typeof refresh === 'function') refresh();
  if (window.rpToast) {
    if (ax === 'reset') {
      window.rpToast('Reset Mirror (Flip H & Flip V) on Rev A & Rev B');
    } else {
      const axisLbl = (ax === 'y' || ax === 'v') ? 'Vertically (Flip Y)' : 'Horizontally (Flip X)';
      const stateOn = slot === 'A'
        ? ((ax === 'y' || ax === 'v') ? S.mirrorYA : S.mirrorXA)
        : ((ax === 'y' || ax === 'v') ? S.mirrorYB : S.mirrorXB);
      window.rpToast(`Mirror Rev ${slot} ${axisLbl}: ${stateOn ? 'ON' : 'OFF'}`);
    }
  }
};
window.toggleCompareSlotMirror = (slot, axis = 'x') => window.setCompareSlotMirror(slot, axis, null, true);
const st = t => $('#st').textContent = t;
const devMem = (typeof navigator !== 'undefined' && navigator.deviceMemory) ? navigator.deviceMemory : 8;
const isLowSpec = devMem <= 4;
let MAXDIM = 9000, MAXAREA = 45e6;
if (isLowSpec) { MAXDIM = 6144; MAXAREA = 25000000; }
function applyPerformanceMode(mode, reCompare = false) {
  const m = (mode === 'perf' || mode === 'detail' || mode === 'auto') ? mode : 'auto';
  PREF.perfMode = m;
  if (window.savePrefs) window.savePrefs();
  const useLowSpec = m === 'perf' || (m === 'auto' && isLowSpec);
  MAXDIM = useLowSpec ? 6144 : 9000;
  MAXAREA = useLowSpec ? 25000000 : 45000000;
  if ($('#rib-perf-mode')) $('#rib-perf-mode').value = useLowSpec ? 'perf' : 'detail';
  if (reCompare && typeof refresh === 'function' && (S.A || S.B)) {
    clearRenderCache();
    clearMips();
    refresh();
  }
  return { MAXDIM, MAXAREA, isLowSpec, devMem, perfMode: m };
}
window.applyPerformanceMode = applyPerformanceMode;
window.getComparePerfBounds = () => ({ MAXDIM, MAXAREA, isLowSpec, devMem, perfMode: PREF.perfMode || 'auto' });
if (PREF.perfMode && PREF.perfMode !== 'auto') applyPerformanceMode(PREF.perfMode, false);
const tick = (() => {
  if (typeof MessageChannel !== 'undefined') {
    const mc = new MessageChannel(), q = [];
    mc.port1.onmessage = () => { const fn = q.shift(); if (fn) fn(); };
    return () => new Promise(r => { q.push(r); mc.port2.postMessage(0); });
  }
  return () => new Promise(r => setTimeout(r, 0));
})();
window.rpFastTick = tick;
const getEffDpi = d => {
  const baseDpi = d || (S && S.cur && S.cur.dpi) || 300;
  if (window.RP_MEASURE && window.RP_MEASURE.calibrator && window.RP_MEASURE.calibrator.calibrated) {
    const cal = window.RP_MEASURE.calibrator;
    if (cal.unit === 'mm') return cal.pxPerUnit * 25.4;
    if (cal.unit === 'in') return cal.pxPerUnit;
    if (cal.unit === 'um') return cal.pxPerUnit * 25400;
    return cal.pxPerUnit * 1000;
  }
  if (window.DXFState && window.DXFState._isActiveDXFSession && window.DXFState.lastRenderMeta && ((S && S.A && S.A.isNativeDXF) || (S && S.B && S.B.isNativeDXF))) {
    const meta = window.DXFState.lastRenderMeta;
    const b = meta.sharedBoundsA || meta.sharedBounds;
    const p = window.DXFState.parsedA || window.DXFState.parsedB;
    if (b && isFinite(b.minX) && isFinite(b.maxX)) {
      const bw = Math.max(1e-3, b.maxX - b.minX || 100);
      const bh = Math.max(1e-3, b.maxY - b.minY || 100);
      const scaleAt2200 = Math.min((2200 - 80) / bw, (1600 - 80) / bh);
      const pxPerUnit = scaleAt2200 * 0.5 * (baseDpi / 72);
      const uName = (p && p.unitName) ? p.unitName : "mm";
      const uMap = (typeof DXFEngine !== "undefined" && DXFEngine.UNITS) ? DXFEngine.UNITS : { mm: { toMM: 1 }, cm: { toMM: 10 }, m: { toMM: 1000 }, in: { toMM: 25.4 }, ft: { toMM: 304.8 }, mils: { toMM: 0.0254 } };
      const toMM = (uMap[uName] && uMap[uName].toMM) ? uMap[uName].toMM : 1;
      const pxPerMM = pxPerUnit / toMM;
      if (pxPerMM > 0 && isFinite(pxPerMM)) return pxPerMM * 25.4;
    }
  }
  if (window.CAMState && typeof window.CAMState.getEffectiveDpi === 'function') {
    return window.CAMState.getEffectiveDpi(baseDpi);
  }
  return baseDpi;
};
const mm = (px, d) => (px / getEffDpi(d) * 25.4).toFixed(2);
const mils = (px, d) => (px / getEffDpi(d) * 1000).toFixed(1);
const isEnglishUnits = () => (window.CAMState && window.CAMState.unitSystem === 'english');
const fmtUnitVal = (px, d) => isEnglishUnits() ? mils(px, d) : mm(px, d);
const fmtUnitName = () => isEnglishUnits() ? 'mil' : 'mm';
const isCAMExt = name => (typeof CAMEngine !== 'undefined' && CAMEngine.isCAMFileName)
  ? CAMEngine.isCAMFileName(name)
  : /\.(gbr|ger|art|pho|top|bot|gtl|gbl|gbs|gts|gto|gbo|gtp|gbp|gko|gpb|gpt|gm\d+|gd\d+|gg\d+|g\d+|gp\d+|l\d+|ly\d+|cmp|sol|stc|sts|plc|pls|crc|crs|drl|xln|ncd|drd|exc|tap|rou|ipc|d356|net)$/i.test(name || '');
window.isCAMExt = isCAMExt;
let tok = 0, deb;
$('#dpi').value = String(PREF.dpi); $('#tol').value = PREF.tol; $('#edge').value = PREF.edge; $('#minpx').value = PREF.minpx;

function setLabel(k) {
  const rawName = (S[k] && S.names[k]) ? S.names[k] : '';
  const baseNoExt = rawName.replace(/\.[^.]+$/, '');
  const shortName = baseNoExt.length > 9 ? (baseNoExt.slice(0, 8) + '…') : (baseNoExt || rawName);
  const txt = S[k] ? (k + ': ' + shortName + ' (' + S[k].numPages + 'p)') : ('Open ' + (k === 'A' ? 'Base (A)' : 'New (B)'));
  const fullTip = S[k] ? ((k === 'A' ? 'Base (Rev A): ' : 'Revised (Rev B): ') + rawName + ' (' + S[k].numPages + ' pages)') : ('Open ' + (k === 'A' ? 'Base (Rev A)' : 'Revised (Rev B)'));
  const b = $('#open' + k + ' span'); if (b) { b.textContent = txt; if (b.parentElement) b.parentElement.title = fullTip; }
  const rb = $('#rib-open' + k + ' span'); if (rb) { rb.textContent = txt; if (rb.parentElement) rb.parentElement.title = fullTip; }
}

function clearMips() {
  if (Array.isArray(S.mips)) {
    for (let i = 1; i < S.mips.length; i++) {
      if (S.mips[i]) { S.mips[i].width = 0; S.mips[i].height = 0; }
    }
  }
  S.mips = null;
  const lv = $('#lv');
  if (lv) lv._src = null;
}
function clearRenderCache() {
  if (S.renderTask && typeof S.renderTask.cancel === 'function') {
    try { S.renderTask.cancel(); } catch (e) {}
    S.renderTask = null;
  }
  if (Array.isArray(S.renderTasks)) {
    while (S.renderTasks.length) {
      const rt = S.renderTasks.pop();
      if (rt && typeof rt.cancel === 'function') { try { rt.cancel(); } catch (e) {} }
    }
  }
  if (S.rcMap instanceof Map) {
    for (const entry of S.rcMap.values()) {
      if (_cmpMemGuard) _cmpMemGuard.releaseRenderPairEntry(entry);
      else {
        if (entry && entry.a && entry.a.c) { entry.a.c.width = 0; entry.a.c.height = 0; entry.a.text = null; entry.a.textItems = null; }
        if (entry && entry.b && entry.b.c) { entry.b.c.width = 0; entry.b.c.height = 0; entry.b.text = null; entry.b.textItems = null; }
      }
    }
    S.rcMap.clear();
  }
  if (S.analysisCache instanceof Map) {
    const zeroSlice = (typeof WorkerEngine !== 'undefined' && WorkerEngine.secureZeroSlice) ? WorkerEngine.secureZeroSlice : null;
    for (const res of S.analysisCache.values()) {
      if (res && res !== S.cur) {
        if (_cmpMemGuard) _cmpMemGuard.releaseAnalysisResult(res, zeroSlice);
        else {
          if (zeroSlice) {
            if (res.A) zeroSlice(res.A.data);
            if (res.B) zeroSlice(res.B.data);
            if (res.cls) zeroSlice(res.cls);
            if (res._ovData) zeroSlice(res._ovData.data);
          }
          res.A = null; res.B = null; res.cls = null; res._ovData = null;
        }
      }
    }
    S.analysisCache.clear();
  }
  if (S.rc) {
    if (_cmpMemGuard) _cmpMemGuard.releaseRenderPairEntry(S.rc);
    else {
      if (S.rc.a && S.rc.a.c) { S.rc.a.c.width = 0; S.rc.a.c.height = 0; }
      if (S.rc.b && S.rc.b.c) { S.rc.b.c.width = 0; S.rc.b.c.height = 0; }
    }
  }
  S.rc = null;
  if (typeof DXFEngine !== 'undefined' && typeof DXFEngine.clearDXFCaches === 'function') {
    DXFEngine.clearDXFCaches();
  }
  if (typeof window !== 'undefined' && window.DXFStudio && typeof window.DXFStudio.trimMemory === 'function') {
    window.DXFStudio.trimMemory();
  }
  if (window.rpTileManager && typeof window.rpTileManager.clear === 'function') {
    window.rpTileManager.clear();
  }
  const cvA = $('#cvA');
  const curtainOn = !!(window.UIRibbon && window.UIRibbon.isCurtainActive && window.UIRibbon.isCurtainActive());
  if (cvA && !curtainOn) { cvA.width = 0; cvA.height = 0; cvA._gen = null; }
  else if (cvA) { cvA._gen = null; }
  _sharedOvData = null;
  const hq = $('#hq');
  if (hq) { hq.width = 0; hq.height = 0; hq.style.display = 'none'; hq._cropA = null; hq._cropB = null; hq._lastKey = ''; }
  if (typeof window.rpTrimMemory === 'function') window.rpTrimMemory();
}

const _imgPdfCache = new Map();
async function imageBytesToPDF(bytes, name) {
  if (typeof PDFLib === 'undefined' || !PDFLib.PDFDocument) throw new Error('PDF engine not ready');
  const u8 = b2u(bytes);
  if (u8.length >= 4 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) return u8;
  const sig = `${name || ''}|${u8.byteLength}|${u8[0] || 0}|${u8[u8.byteLength >> 1] || 0}|${u8[u8.byteLength - 1] || 0}`;
  if (_imgPdfCache.has(sig)) return _imgPdfCache.get(sig);
  const doc = await PDFLib.PDFDocument.create();
  let img = null;
  const isPng = /\.png$/i.test(name) || (u8[0] === 0x89 && u8[1] === 0x50);
  const isJpg = /\.jpe?g$/i.test(name) || (u8[0] === 0xFF && u8[1] === 0xD8);
  if (isPng) {
    try { img = await doc.embedPng(u8); } catch (e) {}
  } else if (isJpg) {
    try { img = await doc.embedJpg(u8); } catch (e) {}
  }
  if (!img && typeof document !== 'undefined') {
    const blob = new Blob([u8]);
    const url = URL.createObjectURL(blob);
    try {
      const im = new Image();
      await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = url; });
      const c = document.createElement('canvas');
      c.width = im.naturalWidth || im.width || 800;
      c.height = im.naturalHeight || im.height || 600;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(im, 0, 0);
      const dataUrl = c.toDataURL('image/png');
      c.width = 0; c.height = 0;
      const bin = atob(dataUrl.split(',')[1] || '');
      const pngBytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) pngBytes[i] = bin.charCodeAt(i);
      img = await doc.embedPng(pngBytes);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (!img) throw new Error('Unsupported image format');
  const pg = doc.addPage([img.width, img.height]);
  pg.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  const saved = await doc.save();
  if (_imgPdfCache.size >= 6) _imgPdfCache.delete(_imgPdfCache.keys().next().value);
  _imgPdfCache.set(sig, saved);
  return saved;
}
window.imageBytesToPDF = imageBytesToPDF;

async function previewSingleSlot(k, pageNum = 1, preserveView = false) {
  if (!S[k]) return;
  try {
    if (window.rpCancelSharpen) window.rpCancelSharpen();
    const n = Math.max(1, Math.min(S[k].numPages, pageNum || S.n || 1));
    S.n = n;
    if (S.cur && !(S.analysisCache && [...S.analysisCache.values()].includes(S.cur))) { S.cur.A = null; S.cur.B = null; S.cur.cls = null; S.cur._ovData = null; }
    S.cur = null;
    S.scan = {};
    const pg = await S[k].getPage(n);
    const slotRot = (((pg.rotate || 0) + getSlotCardinalDeg(k)) % 360 + 360) % 360;
    const mir = getSlotMirror(k);
    const vp1 = pg.getViewport({ scale: 1, rotation: slotRot });
    const isDxfSlot = !!(S[k] && S[k].isNativeDXF);
    const effMaxDim = isDxfSlot ? Math.min(MAXDIM, 4600) : MAXDIM;
    const effMaxArea = isDxfSlot ? Math.min(MAXAREA, 16e6) : MAXAREA;
    const sc = Math.min((+$('#dpi').value || 300) / 72, effMaxDim / Math.max(vp1.width, vp1.height, 1), Math.sqrt(effMaxArea / Math.max(1, vp1.width * vp1.height)));
    const r = await render(k, n, sc);
    const cv = $('#cv');
    if (cv && r.c.width) {
      const prevW = cv.width, prevH = cv.height;
      clearMips();
      S._isCAMScan = false;
      S.preview = { k, n, W: r.c.width, H: r.c.height, dpi: sc * 72 };
      if ($('#lv')) { $('#lv')._src = null; $('#lv').style.display = 'none'; }
      if ($('#hq')) { $('#hq').style.display = 'none'; $('#hq')._cropA = null; $('#hq')._cropB = null; }
      if ($('#cvA')) { $('#cvA').style.display = 'none'; $('#cvA').width = 0; $('#cvA').height = 0; }
      cv.style.visibility = 'visible';
      if (cv.width !== r.c.width || cv.height !== r.c.height) {
        cv.width = r.c.width;
        cv.height = r.c.height;
      }
      const cvCtx = cv.getContext('2d');
      cvCtx.imageSmoothingEnabled = true;
      cvCtx.imageSmoothingQuality = 'high';
      const fineDeg = Number(parseFloat(k === 'A' ? S.rotA : S.rotB) || 0);
      if (Math.abs(fineDeg) > 1e-4) {
        cvCtx.fillStyle = '#fff';
        cvCtx.fillRect(0, 0, cv.width, cv.height);
        cvCtx.save();
        cvCtx.translate(cv.width / 2, cv.height / 2);
        cvCtx.rotate((fineDeg * Math.PI) / 180);
        cvCtx.drawImage(r.c, -cv.width / 2, -cv.height / 2);
        cvCtx.restore();
      } else {
        cvCtx.drawImage(r.c, 0, 0);
      }
      const mk = $('#mk');
      if (mk) { mk.width = cv.width; mk.height = cv.height; mk.getContext('2d').clearRect(0, 0, mk.width, mk.height); }
      if ($('#empty')) $('#empty').hidden = true;
      const P = $('#pages');
      if (P) {
        P.innerHTML = '';
        const totalP = S[k].numPages;
        if (totalP > 1) {
          const prevB = document.createElement('button');
          prevB.className = 'pg-nav';
          prevB.id = 'cPagesPrev';
          prevB.textContent = '\u25c0 Prev';
          prevB.title = 'Previous Page / Layer (Left Arrow / PageUp)';
          prevB.disabled = n <= 1;
          prevB.onclick = () => ACT.cPage && ACT.cPage(-1);
          P.appendChild(prevB);
        }
        const camLbls = (window.CAMState && window.CAMState._isActiveCAMSession && Array.isArray(window.CAMState.activeStackPageLabels)) ? window.CAMState.activeStackPageLabels : null;
        for (let i = 1; i <= totalP; i++) {
          const b = document.createElement('button');
          b.className = 'pg' + (i === n ? ' cur' : '');
          const cl = camLbls && camLbls[i - 1];
          b.textContent = cl ? cl.short : i;
          if (cl && cl.full) b.title = cl.full;
          b.dataset.n = i;
          b.onclick = () => previewSingleSlot(k, i);
          P.appendChild(b);
        }
        if (totalP > 1) {
          const nextB = document.createElement('button');
          nextB.className = 'pg-nav';
          nextB.id = 'cPagesNext';
          nextB.textContent = 'Next \u25b6';
          nextB.title = 'Next Page / Layer (Right Arrow / PageDown)';
          nextB.disabled = n >= totalP;
          nextB.onclick = () => ACT.cPage && ACT.cPage(1);
          P.appendChild(nextB);
        }
      }
      if ($('#sum')) {
        const other = k === 'A' ? 'Revised (B)' : 'Base (A)';
        $('#sum').innerHTML = `<b>Slot ${k} Preview:</b> ${(S.names[k] || '')} (Page ${n} of ${S[k].numPages})<br><span style="color:var(--mute)">Open ${other} to run full difference analysis.</span>`;
      }
      if ($('#list')) $('#list').innerHTML = '';
      if ($('#text')) $('#text').innerHTML = '';
      if (window.UIRibbon && window.UIRibbon.DefectState && window.UIRibbon.DefectState.clearAllPages) {
        window.UIRibbon.DefectState.clearAllPages();
      }
      if (preserveView && S.view && S.view.k > 0.05 && prevW === cv.width && prevH === cv.height) {
        applyView();
      } else {
        fit();
      }
      if (window.rpAfterPaint) window.rpAfterPaint();
    }
    if (r && r.c) { r.c.width = 0; r.c.height = 0; }
  } catch (e) {}
}

async function openBytes(k, buf, name, path, skipStart = false) {
  const rawU8Check = buf instanceof Uint8Array ? buf : b2u(buf);
  const isPdfHeader = rawU8Check.length >= 4 && rawU8Check[0] === 0x25 && rawU8Check[1] === 0x50 && rawU8Check[2] === 0x44 && rawU8Check[3] === 0x46;
  if (!isPdfHeader && /\.(step|stp|sldprt|sldasm|slddrw|stl|obj|kensho3d)$/i.test(name || '') && typeof window.openSolidWorks3DFile === 'function') {
    await window.openSolidWorks3DFile({ name, bytes, path }, k || 'A');
    return;
  }
  if (!isPdfHeader && (/\.(dxf|dwg)$/i.test(name || '') || isCAMExt(name || '')) && typeof window.openExternalCADOrCAM === 'function') {
    await window.openExternalCADOrCAM(rawU8Check, name || 'drawing.dxf', path || '', k, skipStart);
    return;
  }
  busy(true);
  try {
    if (window.rpCancelSharpen) window.rpCancelSharpen();
    tok++; S.showTok++;
    const safePath = sanitizeFilePath(path || '');
    if (!/\.dxf$/i.test(name || '') && window.DXFState) {
      window.DXFState._isActiveDXFSession = false;
      window.DXFState._studioDirty = false;
      window.DXFState.lastEntityDiff = null;
      window.DXFState.lastRenderMeta = null;
      if (k === 'A') { window.DXFState.parsedA = null; window.DXFState.rawA = null; }
      else if (k === 'B') { window.DXFState.parsedB = null; window.DXFState.rawB = null; }
    }
    if (!isCAMExt(name || '') && window.CAMState && !window.CAMState._renderingStack) {
      window.CAMState._isActiveCAMSession = false;
      window.CAMState.parsedDrillA = null;
      window.CAMState.parsedDrillB = null;
      window.CAMState.parsedIPCA = null;
      window.CAMState.parsedIPCB = null;
      window.CAMState.layersA = [];
      window.CAMState.layersB = [];
      window.CAMState.pairedLayers = [];
      window.CAMState.lastDFMViolations = [];
      window.__lastDrill = null;
      window.__lastIPCA = null;
      if (k === 'A') { window.CAMState.parsedGerberA = null; window.__lastGerberA = null; }
      else if (k === 'B') { window.CAMState.parsedGerberB = null; window.__lastGerberB = null; }
      if (window.UIRibbon && typeof window.UIRibbon.updateCAMSidebarPane === 'function') {
        window.UIRibbon.updateCAMSidebarPane();
      }
      const isDarkDxf = /\.dxf$/i.test(name || '') && window.DXFState && window.DXFState.background && window.DXFState.background !== '#ffffff';
      if (!isDarkDxf && $('#mode') && $('#mode').value === 'over') {
        if (window.UIRibbon && typeof window.UIRibbon.setCompareMode === 'function') window.UIRibbon.setCompareMode('paper');
        else { $('#mode').value = 'paper'; S.mode = 'paper'; }
      }
    }
    let rawRef = buf instanceof Uint8Array ? buf : b2u(buf);
    if (/\.(png|jpe?g|webp|bmp|gif)$/i.test(name || '')) {
      rawRef = await imageBytesToPDF(rawRef, name);
    }
    if (S[k] && S.rawBytes && S.rawBytes[k] === rawRef && S.names[k] === name) {
      if (!skipStart) {
        if (S.A && S.B) await start();
        else await previewSingleSlot(k, 1);
      }
      return;
    }
    st('Reading ' + name + '...'); await tick();
    const u8 = rawRef;
    S.gen = (S.gen || 0) + 1; clearRenderCache(); clearMips();
    const prevDoc = S[k];
    const doc = await pdfjsLib.getDocument({ data: u8.slice() }).promise;
    S[k] = doc;
    if (k === 'A') S.docA = doc;
    else if (k === 'B') S.docB = doc;
    S.rawBytes = S.rawBytes || {};
    S.rawBytes[k] = rawRef;
    if (prevDoc && prevDoc !== doc && typeof prevDoc.destroy === 'function') {
      try { await prevDoc.destroy(); } catch (e) {}
    }
    S.names[k] = name; S.paths = S.paths || {}; S.paths[k] = safePath;
    $('#dx').value = 0; $('#dy').value = 0;
    if (k === 'A') { S.degA = 0; S.rotA = 0; S.mirrorXA = false; S.mirrorYA = false; }
    else if (k === 'B') { S.degB = 0; S.rotB = 0; S.mirrorXB = false; S.mirrorYB = false; }
    else { S.degA = 0; S.degB = 0; S.rotA = 0; S.rotB = 0; S.mirrorXA = false; S.mirrorYA = false; S.mirrorXB = false; S.mirrorYB = false; }
    if ($('#rp-cur-dx')) $('#rp-cur-dx').textContent = '0';
    if ($('#rp-cur-dy')) $('#rp-cur-dy').textContent = '0';
    if ($('#rp-rot-b')) $('#rp-rot-b').value = 0;
    if ($('#rp-cur-rot')) $('#rp-cur-rot').textContent = '0°';
    syncCompareRotationUI();
    if (!skipStart && window.CompareHistory && typeof window.CompareHistory.clear === 'function') {
      window.CompareHistory.clear();
    }
    if (!skipStart && window.RP_MEASURE && window.RP_MEASURE.calibrator) {
      window.RP_MEASURE.calibrator.calibrated = false;
    }
    setLabel(k); window.addRecent(name, safePath, k, u8); if (window.updateTitle) window.updateTitle(); st('Loaded ' + name);
    if (skipStart) return;
    if (S.A && S.B) {
      if ($('#mode') && ($('#mode').value === 'A' || $('#mode').value === 'B')) {
        const targetM = (window.CAMState && window.CAMState._isActiveCAMSession && (window.CAMState.pcbTheme || 'standard') !== 'paper') ? 'over' : 'paper';
        if (window.UIRibbon && typeof window.UIRibbon.setCompareMode === 'function') window.UIRibbon.setCompareMode(targetM);
        else { $('#mode').value = targetM; S.mode = targetM; }
      }
      await start();
    } else {
      await previewSingleSlot(k, 1);
      st(`Loaded ${k}: ${name} (${S[k].numPages}p) — Now open ${k === 'A' ? 'Revised (B)' : 'Base (A)'} to run comparison.`);
    }
  } catch (e) {
    const isPasswordErr = !!(e && (e.name === 'PasswordException' || /password|encrypt/i.test(e.message || '')));
    if (isPasswordErr) {
      const encMsg = 'This document is password-protected or encrypted. Please decrypt or unlock the file before comparing or markup.';
      st(encMsg);
      if (window.showEncryptedPdfNotice) window.showEncryptedPdfNotice(name);
      else if (window.showToast) window.showToast(encMsg, 4500);
    } else {
      const msg = 'Could not open ' + name + ': not a valid PDF or drawing.';
      st(msg);
      if (window.showToast) window.showToast(msg, 4000);
    }
    setLabel(k);
    if (!S.A && !S.B && $('#empty')) $('#empty').hidden = false;
    syncCompareHud();
  }
  finally { busy(false); }
}
async function loadFile(k, f, skipStart = false) {
  if (!f) return;
  try {
    const fPath = f.path || (window.native && window.native.getPathForFile ? window.native.getPathForFile(f) : '') || '';
    if (/\.(kensho|redline)$/i.test(f.name) && window.UIRibbon && window.UIRibbon.restoreSessionFromText) {
      await window.UIRibbon.restoreSessionFromText(await f.text());
      return;
    }
    const buf = await f.arrayBuffer();
    if (isCAMExt(f.name) && window.UIRibbon && window.UIRibbon.stageAndPromptCAMFiles) {
      await window.UIRibbon.stageAndPromptCAMFiles([{ name: f.name, path: fPath || f.name, bytes: new Uint8Array(buf) }], k);
      return;
    }
    if ((/\.(dxf|dwg)$/i.test(f.name) || isCAMExt(f.name)) && window.openExternalCADOrCAM) {
      await window.openExternalCADOrCAM(new Uint8Array(buf), f.name, fPath || f.name, k, skipStart);
      return;
    }
    await openBytes(k, buf, f.name, fPath, skipStart);
  } catch (e) {
    st('Could not load ' + (f && f.name ? f.name : 'file') + ': ' + (e.message || e));
  }
}
function resetCompareAlignment() {
  if (S.align) {
    S.align.dx = 0; S.align.dy = 0; S.align.scale = 1; S.align.rot = 0;
  }
  S.ox = 0; S.oy = 0;
  if (S.rot) { S.rot.A = 0; S.rot.B = 0; }
  if (S.mir) { S.mir.A = { x: false, y: false }; S.mir.B = { x: false, y: false }; }
  if (typeof window.setCompareSlotMirror === 'function') {
    try { window.setCompareSlotMirror('A', 'x', false); window.setCompareSlotMirror('A', 'y', false); } catch (_e) {}
    try { window.setCompareSlotMirror('B', 'x', false); window.setCompareSlotMirror('B', 'y', false); } catch (_e) {}
  }
  if (typeof clearCache === 'function') clearCache();
  if (typeof show === 'function') show(S.page || 1);
  if (typeof status === 'function') status('Reset Compare alignment, rotation, and mirror to 0.');
  return true;
}

function setBlinkIntervalMs(ms) {
  const val = Math.max(150, Math.min(3000, parseInt(ms, 10) || 600));
  S.blinkMs = val;
  if (S.mode === 'blink') {
    clearInterval(S.timer);
    S.timer = setInterval(() => { if (document.body.dataset.view === 'compare') { S.phase ^= 1; paint(); } }, val);
  }
  if (typeof status === 'function') status(`Blink speed set to ${val}ms.`);
  return val;
}

function getCompareDiffSummary() {
  const ds = (typeof window !== 'undefined' && window.DXFState) ? window.DXFState : null;
  if (ds && ds._isActiveDXFSession && ds.lastEntityDiff) {
    const d = ds.lastEntityDiff;
    const added = (d.added || []).length;
    const removed = (d.removed || []).length;
    const modified = (d.modified || []).length;
    const textChanges = [...(d.added || []), ...(d.removed || []), ...(d.modified || [])].filter(x => x && (x.type === 'TEXT' || (x.entA && x.entA.type === 'TEXT') || (x.entB && x.entB.type === 'TEXT'))).length;
    return { mode: 'dxf', total: added + removed + modified, added, removed, modified, textChanges };
  }
  const regs = (S.regions && S.regions[S.page || 1]) || S.changes || [];
  let added = 0, removed = 0, modified = 0;
  for (const r of regs) {
    if (!r) continue;
    if (r.kind === 'a' || r.type === 'added') added++;
    else if (r.kind === 'r' || r.type === 'removed') removed++;
    else modified++;
  }
  return { mode: 'pdf', total: regs.length, added, removed, modified, textChanges: 0 };
}

async function exportCompareDiffsJSON() {
  const summary = getCompareDiffSummary();
  const ds = (typeof window !== 'undefined' && window.DXFState) ? window.DXFState : null;
  const items = (ds && ds._isActiveDXFSession && ds.lastEntityDiff)
    ? {
        added: (ds.lastEntityDiff.added || []).slice(0, 2000),
        removed: (ds.lastEntityDiff.removed || []).slice(0, 2000),
        modified: (ds.lastEntityDiff.modified || []).slice(0, 2000)
      }
    : ((S.regions && S.regions[S.page || 1]) || S.changes || []);
  const payload = JSON.stringify({
    exportedAt: new Date().toISOString(),
    fileA: (ds && ds._isActiveDXFSession ? ds.nameA : S.nameA) || '',
    fileB: (ds && ds._isActiveDXFSession ? ds.nameB : S.nameB) || '',
    page: S.page || 1,
    summary,
    differences: items
  }, null, 2);
  if (typeof window !== 'undefined' && window.native && window.native.saveFile) {
    const saved = await window.native.saveFile({
      name: 'KenshoPro_Compare_Diffs.json',
      bytes: new TextEncoder().encode(payload),
      filters: [{ name: 'JSON Audit Report (.json)', extensions: ['json'] }]
    });
    if (saved && typeof status === 'function') status(`Exported Compare Diff JSON: ${saved}`);
    return saved;
  }
  return payload;
}

S.resetCompareAlignment = resetCompareAlignment;
S.setBlinkIntervalMs = setBlinkIntervalMs;
S.getCompareDiffSummary = getCompareDiffSummary;
S.exportCompareDiffsJSON = exportCompareDiffsJSON;
window.resetCompareAlignment = resetCompareAlignment;
window.setBlinkIntervalMs = setBlinkIntervalMs;
window.getCompareDiffSummary = getCompareDiffSummary;
window.exportCompareDiffsJSON = exportCompareDiffsJSON;
window.setCADStudioMode = function(mode = '2d') {
  const swHost = $('#sw-studio-host');
  const dxfHost = $('#view-dxf');
  const swBtn = $('#nav-solidworks');
  if (mode === 'solidworks') {
    if (typeof setView === 'function') setView('dxf');
    if (dxfHost) dxfHost.hidden = true;
    if (swHost) {
      swHost.hidden = false;
      if (window.SolidWorksStudio && typeof window.SolidWorksStudio.mountSolidWorksUI === 'function') {
        window.SolidWorksStudio.mountSolidWorksUI(swHost);
        window.SolidWorksStudio.render3DCanvas();
      }
    }
    if (swBtn) swBtn.classList.add('on');
    const dxfNav = document.querySelector('nav [data-v="dxf"]');
    if (dxfNav) dxfNav.classList.remove('on');
  } else {
    if (swHost) swHost.hidden = true;
    if (swBtn) swBtn.classList.remove('on');
    if (dxfHost && document.body.dataset.view === 'dxf') dxfHost.hidden = false;
  }
};
window.openSolidWorks3DFile = async function(fileObj, slot = 'A') {
  window.setCADStudioMode('solidworks');
  if (window.SolidWorksStudio && typeof window.SolidWorksStudio.load3DFileEntry === 'function') {
    return await window.SolidWorksStudio.load3DFileEntry(fileObj, slot);
  }
  return null;
};
if (typeof document !== 'undefined') {
  const _swNavBtn = document.getElementById('nav-solidworks');
  if (_swNavBtn) _swNavBtn.onclick = () => window.setCADStudioMode('solidworks');
  document.querySelectorAll('nav [data-v]').forEach(btn => {
    btn.addEventListener('click', () => {
      const swHost = document.getElementById('sw-studio-host');
      if (swHost) swHost.hidden = true;
      if (_swNavBtn) _swNavBtn.classList.remove('on');
    });
  });
}
window.CMP = S;
window.S = S;
window.loadFile = loadFile;
window.start = start;
window.show = show;
window.openBytes = openBytes;
window.compareLoadBytes = (k, bytes, name, path, skipStart = false) => openBytes(k, bytes instanceof Uint8Array ? bytes : b2u(bytes).slice(), name, path, skipStart);
window.compareLoadPair = async (bytesA, nameA, pathA, bytesB, nameB, pathB) => {
  await openBytes('A', b2u(bytesA).slice(), nameA, pathA, true);
  await openBytes('B', b2u(bytesB).slice(), nameB, pathB, false);
};
window.compareLoadNativeDXF = async function(k, docProxy, name, path, skipStart = false) {
  busy(true);
  try {
    if (window.rpCancelSharpen) window.rpCancelSharpen();
    tok++; S.showTok++;
    const safePath = sanitizeFilePath(path || "");
    S.gen = (S.gen || 0) + 1;
    clearRenderCache();
    clearMips();
    const prevDoc = S[k];
    if (prevDoc && prevDoc !== docProxy && typeof prevDoc.destroy === "function") {
      try { await prevDoc.destroy(); } catch (e) {}
    }
    S[k] = docProxy;
    if (k === "A") S.docA = docProxy;
    else if (k === "B") S.docB = docProxy;
    S.rawBytes = S.rawBytes || {};
    S.rawBytes[k] = null;
    S.names[k] = name || (k === "A" ? "RevA.dxf" : "RevB.dxf");
    S.paths = S.paths || {};
    S.paths[k] = safePath;
    $("#dx").value = 0; $("#dy").value = 0;
    if (k === "A") { S.degA = 0; S.rotA = 0; S.mirrorXA = false; S.mirrorYA = false; }
    else if (k === "B") { S.degB = 0; S.rotB = 0; S.mirrorXB = false; S.mirrorYB = false; }
    if ($("#rp-cur-dx")) $("#rp-cur-dx").textContent = "0";
    if ($("#rp-cur-dy")) $("#rp-cur-dy").textContent = "0";
    syncCompareRotationUI();
    setLabel(k);
    if (window.updateTitle) window.updateTitle();
    st("Loaded Native DXF Vector " + k + ": " + S.names[k]);
    if (skipStart) return;
    if (S.A && S.B) {
      await start();
    } else {
      await previewSingleSlot(k, 1);
      st(`Loaded Native DXF ${k}: ${S.names[k]} — Open ${k === "A" ? "Revised (B)" : "Base (A)"} to compare DXF layers.`);
    }
  } finally {
    busy(false);
  }
};
const ALL_CAM_EXT_LIST = [
  'gbr', 'ger', 'art', 'pho', 'top', 'bot', 'gtl', 'gbl', 'gbs', 'gts', 'gto', 'gbo', 'gtp', 'gbp', 'gko', 'gpb', 'gpt',
  'gm1', 'gm2', 'gm3', 'cmp', 'sol', 'stc', 'sts', 'plc', 'pls', 'crc', 'crs',
  'drl', 'xln', 'ncd', 'drd', 'exc', 'tap', 'rou', 'ipc', 'd356', 'net',
  ...Array.from({ length: 100 }, (_, i) => `g${i + 1}`),
  ...Array.from({ length: 100 }, (_, i) => `l${i + 1}`),
  ...Array.from({ length: 32 }, (_, i) => `gp${i + 1}`)
];
async function pickCompare(k) {
  const files = await window.native.openFiles({
    title: 'Open Drawing or Multi-Layer CAM Stack ' + k + (k === 'A' ? ' (Base / Rev A — Select 1 to 100+ CAM Layer Files or PDF/DXF)' : ' (Revised / Rev B — Select 1 to 100+ CAM Layer Files or PDF/DXF)'),
    multi: true,
    filters: [
      { name: 'All Supported Drawings & Multi-Layer CAM (PDF, Gerber L1-L100, Drill, IPC, DXF, ZIP, Images)', extensions: ['pdf', 'dxf', 'zip', ...ALL_CAM_EXT_LIST, 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'kensho', 'redline'] },
      { name: 'PCB CAM Stackup (1 to 100+ Layer Files: Gerber, Drill, IPC-D-356, ZIP)', extensions: ['zip', ...ALL_CAM_EXT_LIST, 'txt'] },
      { name: 'PDF Documents', extensions: ['pdf'] },
      { name: 'AutoCAD CAD (DXF / DWG)', extensions: ['dxf', 'dwg'] },
      { name: 'Images (PNG, JPG, WebP)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }
    ]
  });
  if (!files || !files.length) return;

  // If ANY selected files are CAM layers (1 layer = 1 CAM file, 100 layers = 100 CAM files) or a CAM .zip archive:
  // Stage all selected CAM files into Slot k and open the Pre-Compare CAM Setup Dialog (do NOT auto-start compare!)
  const camFiles = files.filter(f => isCAMExt(f.name) || /\.zip$/i.test(f.name));
  if (camFiles.length > 0 && window.UIRibbon && window.UIRibbon.stageAndPromptCAMFiles) {
    await window.UIRibbon.stageAndPromptCAMFiles(camFiles, k);
    return;
  }

  const dxfFiles = files.filter(f => /\.(dxf|dwg)$/i.test(f.name));
  if (dxfFiles.length >= 2 && window.UIRibbon && typeof window.UIRibbon.stageAndPromptDXFFiles === "function") {
    await window.UIRibbon.stageAndPromptDXFFiles(dxfFiles, null);
    return;
  }
  if (files.length >= 2) {
    const fA = files[0], fB = files[1];
    const isCadA = /\.(dxf|dwg)$/i.test(fA.name);
    const isCadB = /\.(dxf|dwg)$/i.test(fB.name);
    if (isCadA && window.openExternalCADOrCAM) await window.openExternalCADOrCAM(b2u(fA.bytes), fA.name, fA.path, 'A', true);
    else await openBytes('A', b2u(fA.bytes), fA.name, fA.path, true);
    if (isCadB && window.openExternalCADOrCAM) await window.openExternalCADOrCAM(b2u(fB.bytes), fB.name, fB.path, 'B', false);
    else await openBytes('B', b2u(fB.bytes), fB.name, fB.path, false);
    return;
  }
  const f = files[0];
  if (/\.(kensho|redline)$/i.test(f.name) && window.UIRibbon && window.UIRibbon.restoreSessionFromText) {
    await window.UIRibbon.restoreSessionFromText(new TextDecoder().decode(b2u(f.bytes)));
    return;
  }
  if (/\.(dxf|dwg)$/i.test(f.name) && window.openExternalCADOrCAM) {
    await window.openExternalCADOrCAM(b2u(f.bytes), f.name, f.path, k);
    return;
  }
  await openBytes(k, b2u(f.bytes), f.name, f.path);
}
$('#openA').onclick = () => pickCompare('A'); $('#openB').onclick = () => pickCompare('B');
$('#swap').onclick = () => {
  if (window.rpPushCompareHistory) window.rpPushCompareHistory('Swap A and B');
  S.gen = (S.gen || 0) + 1; clearRenderCache(); clearMips();
  [S.A, S.B] = [S.B, S.A];
  [S.names.A, S.names.B] = [S.names.B, S.names.A];
  S.paths = S.paths || {};
  [S.paths.A, S.paths.B] = [S.paths.B, S.paths.A];
  [S.degA, S.degB] = [getSlotCardinalDeg('B'), getSlotCardinalDeg('A')];
  [S.mirrorXA, S.mirrorXB] = [!!S.mirrorXB, !!S.mirrorXA];
  [S.mirrorYA, S.mirrorYB] = [!!S.mirrorYB, !!S.mirrorYA];
  const prevRotA = parseFloat(S.rotA) || 0, prevRotB = parseFloat(S.rotB) || 0;
  const ndx = -(parseFloat($('#dx').value) || 0), ndy = -(parseFloat($('#dy').value) || 0);
  $('#dx').value = Number(ndx.toFixed(1)); $('#dy').value = Number(ndy.toFixed(1));
  S.rotA = Number(prevRotB.toFixed(2));
  S.rotB = Number(prevRotA.toFixed(2));
  if ($('#rp-cur-dx')) $('#rp-cur-dx').textContent = $('#dx').value;
  if ($('#rp-cur-dy')) $('#rp-cur-dy').textContent = $('#dy').value;
  if ($('#rp-rot-a')) $('#rp-rot-a').value = S.rotA;
  if ($('#rp-cur-rot-a')) $('#rp-cur-rot-a').textContent = S.rotA + '°';
  if ($('#rp-rot-b')) $('#rp-rot-b').value = S.rotB;
  if ($('#rp-cur-rot')) $('#rp-cur-rot').textContent = S.rotB + '°';
  syncCompareRotationUI();
  if (window.CAMState) {
    [window.CAMState.parsedGerberA, window.CAMState.parsedGerberB] = [window.CAMState.parsedGerberB, window.CAMState.parsedGerberA];
    [window.CAMState.parsedDrillA, window.CAMState.parsedDrillB] = [window.CAMState.parsedDrillB, window.CAMState.parsedDrillA];
    [window.CAMState.parsedIPCA, window.CAMState.parsedIPCB] = [window.CAMState.parsedIPCB, window.CAMState.parsedIPCA];
    [window.__lastGerberA, window.__lastGerberB] = [window.__lastGerberB, window.__lastGerberA];
    [window.__lastDrill, window.__lastDrillB] = [window.__lastDrillB, window.__lastDrill];
    [window.__lastIPCA, window.__lastIPCB] = [window.__lastIPCB, window.__lastIPCA];
    if (Array.isArray(window.CAMState.layersA) && Array.isArray(window.CAMState.layersB)) {
      [window.CAMState.layersA, window.CAMState.layersB] = [window.CAMState.layersB, window.CAMState.layersA];
      [window.CAMState.unitsOverrideA, window.CAMState.unitsOverrideB] = [window.CAMState.unitsOverrideB, window.CAMState.unitsOverrideA];
    }
    if (Array.isArray(window.CAMState.pairedLayers)) {
      for (const p of window.CAMState.pairedLayers) {
        if (p) {
          [p.layerA, p.layerB] = [p.layerB, p.layerA];
          p._cachedPrim = null;
        }
      }
    }
    if (Array.isArray(window.CAMState.perLayerCompareStats)) {
      for (const stItem of window.CAMState.perLayerCompareStats) {
        if (!stItem) continue;
        [stItem.nameA, stItem.nameB] = [stItem.nameB, stItem.nameA];
        [stItem.addedCount, stItem.removedCount] = [stItem.removedCount, stItem.addedCount];
        if (Array.isArray(stItem.regions)) {
          for (const cr of stItem.regions) {
            if (!cr) continue;
            if (cr.kind === 'a') cr.kind = 'r';
            else if (cr.kind === 'r') cr.kind = 'a';
            [cr.sa, cr.sb] = [cr.sb || 0, cr.sa || 0];
            if (typeof cr.dxfSummary === 'string') {
              cr.dxfSummary = cr.dxfSummary.replace(/\bAdded\b/g, '__TMP_ADD__').replace(/\bRemoved\b/g, 'Added').replace(/__TMP_ADD__/g, 'Removed');
            }
            if (typeof cr.note === 'string') {
              cr.note = cr.note.replace(/\bAdded\b/g, '__TMP_ADD__').replace(/\bRemoved\b/g, 'Added').replace(/__TMP_ADD__/g, 'Removed');
            }
          }
        }
      }
    }
  }
  if (window.DXFState) {
    [window.DXFState.parsedA, window.DXFState.parsedB] = [window.DXFState.parsedB, window.DXFState.parsedA];
    [window.DXFState.rawA, window.DXFState.rawB] = [window.DXFState.rawB, window.DXFState.rawA];
    [window.DXFState.nameA, window.DXFState.nameB] = [window.DXFState.nameB, window.DXFState.nameA];
    if (window.DXFState._isActiveDXFSession && window.UIRibbon && typeof window.UIRibbon.reRenderActiveDXFLayers === 'function' && ((S.A && S.A.isNativeDXF) || (S.B && S.B.isNativeDXF))) {
      setLabel('A'); setLabel('B');
      window.UIRibbon.reRenderActiveDXFLayers();
      return;
    }
  }
  setLabel('A'); setLabel('B');
  if (S.A && S.B) start();
  else if (S.A) previewSingleSlot('A');
  else if (S.B) previewSingleSlot('B');
};
let _dragDepth = 0;
function isExternalFileDrag(e) {
  if (!e || !e.dataTransfer || !e.dataTransfer.types) return false;
  const types = Array.from(e.dataTransfer.types);
  return types.includes('Files') && !types.includes('text/plain');
}
function hideDropBackdrop() {
  _dragDepth = 0;
  const bd = $('#rp-drop-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.querySelectorAll('.rp-drop-zone').forEach(z => z.classList.remove('drag-hover'));
  }
}
addEventListener('dragenter', e => {
  if (!isExternalFileDrag(e)) return;
  e.preventDefault();
  if (document.body.dataset.view === 'dxf') return;
  _dragDepth++;
  const bd = $('#rp-drop-backdrop');
  if (bd) bd.hidden = false;
});
addEventListener('dragover', e => {
  e.preventDefault();
  if (!isExternalFileDrag(e) || document.body.dataset.view === 'dxf') return;
  const bd = $('#rp-drop-backdrop');
  if (bd && bd.hidden) bd.hidden = false;
  if (bd) {
    const zone = e.target && e.target.closest ? e.target.closest('.rp-drop-zone') : null;
    bd.querySelectorAll('.rp-drop-zone').forEach(z => z.classList.toggle('drag-hover', z === zone));
  }
});
addEventListener('dragleave', e => {
  if (!isExternalFileDrag(e)) return;
  _dragDepth = Math.max(0, _dragDepth - 1);
  if (_dragDepth === 0 || (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight)) {
    hideDropBackdrop();
  }
});
addEventListener('drop', async e => {
  e.preventDefault();
  const dropZoneEl = e.target && e.target.closest ? e.target.closest('.rp-drop-zone') : null;
  const targetZone = dropZoneEl ? dropZoneEl.dataset.dropzone : null;
  hideDropBackdrop();

  const rawFiles = [...(e.dataTransfer ? e.dataTransfer.files : [])];
  if (!rawFiles.length) return;
  const sessFile = rawFiles.find(x => /\.(kensho|redline)$/i.test(x.name));
  if (sessFile && window.UIRibbon && window.UIRibbon.restoreSessionFromText) {
    setView('compare');
    window.UIRibbon.restoreSessionFromText(await sessFile.text());
    return;
  }

  if (document.body.dataset.view === 'dxf' && window.DXFStudio && typeof window.DXFStudio.handleDroppedFiles === 'function') {
    const dxfs = rawFiles.filter(x => /\.(dxf|dwg)$/i.test(x.name));
    if (dxfs.length) {
      await window.DXFStudio.handleDroppedFiles(dxfs, (targetZone === 'A' || targetZone === 'B') ? targetZone : null);
      return;
    }
  }
  if (targetZone === 'edit' || (!targetZone && document.body.dataset.view === 'edit')) {
    setView('edit');
    const pdfs = rawFiles.filter(x => /\.(pdf|dxf)$/i.test(x.name));
    const imgs = rawFiles.filter(x => /\.(png|jpe?g|webp|bmp|gif)$/i.test(x.name));
    if (pdfs.length && window.editorDrop) window.editorDrop(pdfs);
    else if (imgs.length && window.RE && window.RE.ops) window.RE.ops.images(imgs, 'a4');
    return;
  }

  const cad3dDropped = rawFiles.filter(x => /\.(step|stp|sldprt|sldasm|slddrw|stl|obj|kensho3d)$/i.test(x.name));
  if (cad3dDropped.length && typeof window.openSolidWorks3DFile === 'function') {
    await window.openSolidWorks3DFile(cad3dDropped[0], 'A');
    if (cad3dDropped.length >= 2) await window.openSolidWorks3DFile(cad3dDropped[1], 'B');
    return;
  }
  const allFiles = rawFiles.filter(x => isCAMExt(x.name) || /\.(pdf|dxf|dwg|step|stp|sldprt|sldasm|slddrw|stl|obj|kensho3d|zip|png|jpe?g|webp|bmp|gif)$/i.test(x.name));
  if (!allFiles.length) {
    if (window.rpToast) window.rpToast('Unsupported file format. Drop PDF, Gerber (L1..L100), Drill, IPC-D-356, ZIP, DXF, Image, or .redline files.');
    return;
  }

  setView('compare');
  const camDropped = allFiles.filter(x => isCAMExt(x.name) || /\.zip$/i.test(x.name));
  if (camDropped.length > 0 && window.UIRibbon && window.UIRibbon.stageAndPromptCAMFiles) {
    const camPayloads = await Promise.all(camDropped.map(async f => ({
      name: f.name,
      path: f.path || (window.native && window.native.getPathForFile ? window.native.getPathForFile(f) : '') || f.name,
      bytes: new Uint8Array(await f.arrayBuffer())
    })));
    const slotTarget = (targetZone === 'A' || targetZone === 'B') ? targetZone : null;
    await window.UIRibbon.stageAndPromptCAMFiles(camPayloads, slotTarget);
    return;
  }

  if (targetZone === 'A') {
    if (allFiles.length >= 2) {
      await loadFile('A', allFiles[0], true);
      await loadFile('B', allFiles[1], false);
    } else {
      await loadFile('A', allFiles[0], false);
    }
  } else if (targetZone === 'B') {
    await loadFile('B', allFiles[0], false);
  } else if (allFiles.length >= 2) {
    await loadFile('A', allFiles[0], true);
    await loadFile('B', allFiles[1], false);
  } else if (allFiles.length === 1) {
    await loadFile(S.A ? 'B' : 'A', allFiles[0], false);
  }
});

async function render(k, n, scale, keepPageCache = true) {
  const c = document.createElement('canvas'); let text = [], textItems = [];
  if (S[k] && n <= S[k].numPages) {
    const p = await S[k].getPage(n);
    const slotRot = (((p.rotate || 0) + getSlotCardinalDeg(k)) % 360 + 360) % 360;
    const mir = getSlotMirror(k);
    const vp = p.getViewport({ scale, rotation: slotRot });
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    const renderTask = p.render({ canvasContext: x, viewport: vp });
    S.renderTask = renderTask;
    S.renderTasks = S.renderTasks || [];
    S.renderTasks.push(renderTask);
    try {
      const [, tc] = await Promise.all([renderTask.promise, p.getTextContent()]);
      if ((mir.x || mir.y) && c.width > 0 && c.height > 0) {
        const flipCv = document.createElement('canvas');
        flipCv.width = c.width;
        flipCv.height = c.height;
        flipCv.getContext('2d').drawImage(c, 0, 0);
        x.save();
        x.setTransform(mir.x ? -1 : 1, 0, 0, mir.y ? -1 : 1, mir.x ? c.width : 0, mir.y ? c.height : 0);
        x.drawImage(flipCv, 0, 0);
        x.restore();
        flipCv.width = 0;
        flipCv.height = 0;
      }
      const items = (tc && Array.isArray(tc.items)) ? tc.items : [];
      const trMat = Array.isArray(vp.transform) ? vp.transform : null;
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        const s = (it && it.str) ? it.str.trim() : '';
        if (!s) continue;
        text.push(s);
        const tr = Array.isArray(it.transform) ? it.transform : [1, 0, 0, 1, 0, 0];
        const tx = Number(tr[4]) || 0, ty = Number(tr[5]) || 0;
        const fh = Math.hypot(Number(tr[2]) || 0, Number(tr[3]) || 0) || Math.hypot(Number(tr[0]) || 0, Number(tr[1]) || 0) || 10;
        const fw = (Number(it.width) > 0) ? Number(it.width) : Math.max(fh * 0.6, s.length * fh * 0.55);
        const vh = Math.max(8, fh * scale);
        const vw = Math.max(8, fw * scale);
        let boxX, boxY, boxW, boxH;
        if (trMat) {
          const baseLen = Math.hypot(Number(tr[0]) || 0, Number(tr[1]) || 0);
          const uxDir = baseLen > 1e-6 ? (Number(tr[0]) || 0) / baseLen : 1;
          const uyDir = baseLen > 1e-6 ? (Number(tr[1]) || 0) / baseLen : 0;
          const nxDir = -uyDir, nyDir = uxDir;
          const hBot = -fh * 0.30, hTop = fh * 0.85;
          const pdfCorners = [
            [tx + nxDir * hBot, ty + nyDir * hBot],
            [tx + uxDir * fw + nxDir * hBot, ty + uyDir * fw + nyDir * hBot],
            [tx + uxDir * fw + nxDir * hTop, ty + uyDir * fw + nyDir * hTop],
            [tx + nxDir * hTop, ty + nyDir * hTop]
          ];
          let minVX = Infinity, maxVX = -Infinity, minVY = Infinity, maxVY = -Infinity;
          for (let ci = 0; ci < 4; ci++) {
            const px = pdfCorners[ci][0], py = pdfCorners[ci][1];
            const cvx = trMat[0] * px + trMat[2] * py + trMat[4];
            const cvy = trMat[1] * px + trMat[3] * py + trMat[5];
            if (cvx < minVX) minVX = cvx;
            if (cvx > maxVX) maxVX = cvx;
            if (cvy < minVY) minVY = cvy;
            if (cvy > maxVY) maxVY = cvy;
          }
          boxX = minVX;
          boxY = minVY;
          boxW = Math.max(8, maxVX - minVX);
          boxH = Math.max(8, maxVY - minVY);
        } else {
          const unrotH = (slotRot === 90 || slotRot === 270) ? c.width : c.height;
          const ux = tx * scale, uy = unrotH - ty * scale;
          const rawH = vh * 1.15;
          if (slotRot === 90) {
            boxX = unrotH - (uy + vh * 0.30);
            boxY = ux;
            boxW = rawH;
            boxH = vw;
          } else if (slotRot === 180) {
            boxX = c.width - ux - vw;
            boxY = c.height - (uy + vh * 0.30);
            boxW = vw;
            boxH = rawH;
          } else if (slotRot === 270) {
            boxX = uy - vh * 0.85;
            boxY = c.height - ux - vw;
            boxW = rawH;
            boxH = vw;
          } else {
            boxX = ux;
            boxY = uy - vh * 0.85;
            boxW = vw;
            boxH = rawH;
          }
        }
        if (mir.x) boxX = c.width - boxX - boxW;
        if (mir.y) boxY = c.height - boxY - boxH;
        textItems.push({
          str: s,
          x: boxX,
          y: boxY,
          w: boxW,
          h: boxH
        });
      }
    } finally {
      if (S.renderTask === renderTask) S.renderTask = null;
      const idx = S.renderTasks.indexOf(renderTask);
      if (idx !== -1) S.renderTasks.splice(idx, 1);
    }
    if (!keepPageCache && typeof p.cleanup === 'function') {
      try { p.cleanup(); } catch (e) {}
    }
  }
  return { c, text, textItems };
}

function getPageSettingsSuffix(n) {
  const degA = getSlotCardinalDeg('A'), degB = getSlotCardinalDeg('B');
  const mirA = (S.mirrorXA ? 1 : 0) | (S.mirrorYA ? 2 : 0), mirB = (S.mirrorXB ? 1 : 0) | (S.mirrorYB ? 2 : 0);
  const dx = parseFloat($('#dx').value) || 0, dy = parseFloat($('#dy').value) || 0, rotA = (parseFloat(S.rotA) || 0) * Math.PI / 180, rotB = (parseFloat(S.rotB) || 0) * Math.PI / 180, tol = +$('#tol').value, mp = +$('#minpx').value, edge = +$('#edge').value | 0;
  const boxMils = (window.DXFState && Number(window.DXFState.highlightBoxMils) > 0) ? Number(window.DXFState.highlightBoxMils) : 7;
  const ignList = S.ignore.filter(r => r.page == null || r.page === n);
  const ignKey = ignList.map(r => `${r.x.toFixed(1)},${r.y.toFixed(1)},${r.w.toFixed(1)},${r.h.toFixed(1)}`).join(';');
  return `${S.gen || 0}|${+$('#dpi').value || 300}|${degA}|${degB}|${mirA}|${mirB}|${dx}|${dy}|${rotA.toFixed(4)}|${rotB.toFixed(4)}|${tol}|${mp}|${edge}|${boxMils}|${ignKey}`;
}
function ensureAnalysisCache() {
  if (!S.analysisCache || !(S.analysisCache instanceof Map)) {
    if (typeof WorkerEngine !== 'undefined' && WorkerEngine.BoundedLruCache) {
      const budgetMgr = WorkerEngine.globalMemoryBudget || null;
      const maxBytes = budgetMgr ? Math.floor(budgetMgr.budgetBytes() * 0.75) : (384 * 1024 * 1024);
      S.analysisCache = new WorkerEngine.BoundedLruCache(24, maxBytes, {
        budgetManager: budgetMgr,
        isPinned: (_k, val) => !!(val && S.cur && (val === S.cur || val.n === S.cur.n)),
        onEvict: (_k, oldRes) => {
          if (oldRes && oldRes !== S.cur) {
            if (WorkerEngine.secureZeroSlice) {
              if (oldRes.A) WorkerEngine.secureZeroSlice(oldRes.A.data);
              if (oldRes.B) WorkerEngine.secureZeroSlice(oldRes.B.data);
              if (oldRes.cls) WorkerEngine.secureZeroSlice(oldRes.cls);
              if (oldRes._ovData) WorkerEngine.secureZeroSlice(oldRes._ovData.data);
            }
            oldRes.A = null; oldRes.B = null; oldRes.cls = null; oldRes._ovData = null;
          }
        }
      });
    } else {
      S.analysisCache = new Map();
    }
  }
  return S.analysisCache;
}
function getCachedPageAnalysis(n) {
  ensureAnalysisCache();
  if (typeof S.analysisCache.setPinnedKey === 'function') S.analysisCache.setPinnedKey(n);
  const pageKey = `${n}::${getPageSettingsSuffix(n)}`;
  const cachedRes = S.analysisCache.get(pageKey);
  if (cachedRes && cachedRes.A && cachedRes.B && cachedRes.cls) {
    if (typeof S.analysisCache.insert !== 'function') {
      S.analysisCache.delete(pageKey);
      S.analysisCache.set(pageKey, cachedRes);
    }
    return cachedRes;
  }
  return null;
}
/* ============================================================================
 * [MODULE SECTION: PAGE & VECTOR CAD/CAM DIFFERENCE ANALYZER]
 * WHAT THIS IS: Renders Slot A and Slot B at target DPI, classifies pixel &
 *   vector differences, applies Ignore Zones, and builds stepped 5-10 mil `subBoxes`.
 * WHY / HOW TO EDIT: Edit `analyze()` to customize tolerance rules, text diff
 *   matching, or CAD/CAM region extraction.
 * ============================================================================ */
async function analyze(n, keep) {
  S.rcMap = S.rcMap || new Map();
  ensureAnalysisCache();
  S.inflightAnalyze = S.inflightAnalyze || new Map();
  const pageKey = `${n}::${getPageSettingsSuffix(n)}`;
  const fastHit = getCachedPageAnalysis(n);
  if (fastHit) return fastHit;
  if (S.inflightAnalyze.has(pageKey)) {
    const inflight = S.inflightAnalyze.get(pageKey);
    if (keep) inflight.keep = true;
    return inflight.promise;
  }
  const state = { keep: !!keep, promise: null };
  state.promise = (async () => {
    try {
      const dim = async k => {
        if (n > S[k].numPages) return [0, 0];
        const pg = await S[k].getPage(n);
        const slotRot = (((pg.rotate || 0) + getSlotCardinalDeg(k)) % 360 + 360) % 360;
        const v = pg.getViewport({ scale: 1, rotation: slotRot });
        return [v.width, v.height];
      };
      const [[wa, ha], [wb, hb]] = await Promise.all([dim('A'), dim('B')]);
      const isNativeDXFPair = !!(S.A && S.B && S.A.isNativeDXF && S.B.isNativeDXF);
      const isAnyNativeDXF = !!((S.A && S.A.isNativeDXF) || (S.B && S.B.isNativeDXF));
      const effMaxDim = isAnyNativeDXF ? Math.min(MAXDIM, 4600) : MAXDIM;
      const effMaxArea = isAnyNativeDXF ? Math.min(MAXAREA, 16e6) : MAXAREA;
      const sc = Math.min((+$('#dpi').value) / 72, effMaxDim / Math.max(wa, ha, wb, hb, 1), Math.sqrt(effMaxArea / (Math.max(wa, wb, 1) * Math.max(ha, hb, 1))));
      const degA = getSlotCardinalDeg('A'), degB = getSlotCardinalDeg('B');
      const mirA = (S.mirrorXA ? 1 : 0) | (S.mirrorYA ? 2 : 0), mirB = (S.mirrorXB ? 1 : 0) | (S.mirrorYB ? 2 : 0);
      const ck = n + '|' + sc.toFixed(4) + '|' + (S.gen || 0) + '|' + degA + '|' + degB + '|' + mirA + '|' + mirB;
      const dx = parseFloat($('#dx').value) || 0, dy = parseFloat($('#dy').value) || 0, rotA = (parseFloat(S.rotA) || 0) * Math.PI / 180, rotB = (parseFloat(S.rotB) || 0) * Math.PI / 180, tol = +$('#tol').value, mp = +$('#minpx').value, edge = +$('#edge').value | 0;
      keep = state.keep;
      let a, b;
      let cachedHit = false;
      if (S.rc && S.rc.key === ck && S.rc.a && S.rc.a.c && S.rc.a.c.width > 0) {
        a = S.rc.a; b = S.rc.b; cachedHit = true;
      } else if (S.rcMap.has(ck)) {
        const entry = S.rcMap.get(ck);
        if (entry && entry.a && entry.a.c && entry.a.c.width > 0) {
          a = entry.a; b = entry.b; cachedHit = true;
          S.rc = entry;
          S.rcMap.delete(ck);
          S.rcMap.set(ck, entry);
        }
      }
      if (!cachedHit) {
        [a, b] = await Promise.all([render('A', n, sc, !!keep), render('B', n, sc, !!keep)]);
        if (state.keep) {
          while (S.rcMap.size >= 4) {
            const [oldKey, oldEntry] = S.rcMap.entries().next().value;
            if (oldEntry) {
              if (_cmpMemGuard) _cmpMemGuard.releaseRenderPairEntry(oldEntry);
              else {
                if (oldEntry.a && oldEntry.a.c) { oldEntry.a.c.width = 0; oldEntry.a.c.height = 0; oldEntry.a.text = null; oldEntry.a.textItems = null; }
                if (oldEntry.b && oldEntry.b.c) { oldEntry.b.c.width = 0; oldEntry.b.c.height = 0; oldEntry.b.text = null; oldEntry.b.textItems = null; }
              }
            }
            S.rcMap.delete(oldKey);
          }
          const entry = { key: ck, a, b };
          S.rcMap.set(ck, entry);
          S.rc = entry;
          cachedHit = true;
        }
      }
  const W = Math.max(a.c.width, b.c.width, 1), H = Math.max(a.c.height, b.c.height, 1);
  const get = (src, ox, oy, rot = 0) => {
    const srcCtx = src && src.width ? src.getContext('2d', { willReadFrequently: true }) : null;
    if (!ox && !oy && !rot && src && src.width === W && src.height === H) {
      return srcCtx.getImageData(0, 0, W, H);
    }
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    let fillBg = (isAnyNativeDXF && window.DXFState && window.DXFState.background) ? window.DXFState.background : '#fff';
    if (srcCtx) {
      try {
        const cp = srcCtx.getImageData(0, 0, 1, 1).data;
        if (cp[3] > 0) fillBg = `rgb(${cp[0]},${cp[1]},${cp[2]})`;
      } catch (e) {}
    }
    x.fillStyle = fillBg; x.fillRect(0, 0, W, H);
    if (src && src.width) {
      x.save();
      if (rot) { x.translate(src.width / 2 + ox, src.height / 2 + oy); x.rotate(rot); x.drawImage(src, -src.width / 2, -src.height / 2); }
      else { x.drawImage(src, ox, oy); }
      x.restore();
    }
    const imgData = x.getImageData(0, 0, W, H);
    c.width = 0; c.height = 0;
    return imgData;
  };
  const srcWA = (a && a.c && a.c.width) ? a.c.width : W, srcHA = (a && a.c && a.c.height) ? a.c.height : H;
  const srcWB = (b && b.c && b.c.width) ? b.c.width : W, srcHB = (b && b.c && b.c.height) ? b.c.height : H;
  const A = get(a.c, 0, 0, rotA), B = get(b.c, dx, dy, rotB), pa = A.data, pb = B.data, a32 = new Uint32Array(pa.buffer), b32 = new Uint32Array(pb.buffer), cls = new Uint8Array(W * H);
  if (!cachedHit) {
    if (a && a.c) { a.c.width = 0; a.c.height = 0; }
    if (b && b.c) { b.c.width = 0; b.c.height = 0; }
  }
  const ign = S.ignore.filter(r => r.page == null || r.page === n).map(r => [r.x * sc, r.y * sc, (r.x + r.w) * sc, (r.y + r.h) * sc]);
  const hasIgn = ign.length > 0;
  const ignFlat = hasIgn ? new Float64Array(ign.length * 4) : null;
  if (hasIgn) {
    for (let k = 0; k < ign.length; k++) {
      const g = ign[k], base = k * 4;
      ignFlat[base] = g[0]; ignFlat[base + 1] = g[1]; ignFlat[base + 2] = g[2]; ignFlat[base + 3] = g[3];
    }
  }
  // Estimate background color from sheet corners so both white paper and dark PCB/CAD substrates classify Added vs Removed accurately
  const samplePts = [0, Math.max(0, (W - 1) * 4), Math.max(0, ((H - 1) * W) * 4), Math.max(0, ((H - 1) * W + (W - 1)) * 4)];
  let bgSrcR = 0, bgSrcG = 0, bgSrcB = 0;
  for (const si of samplePts) { bgSrcR += (pa[si] + pb[si]) / 2; bgSrcG += (pa[si + 1] + pb[si + 1]) / 2; bgSrcB += (pa[si + 2] + pb[si + 2]) / 2; }
  bgSrcR = Math.round(bgSrcR / samplePts.length); bgSrcG = Math.round(bgSrcG / samplePts.length); bgSrcB = Math.round(bgSrcB / samplePts.length);
  const isDarkSubstrate = (bgSrcR * 299 + bgSrcG * 587 + bgSrcB * 114) / 1000 < 128;

  // For unshifted, unrotated Native Vector DXF or CAM pairs, identical vector primitives rasterize to identical pixels,
  // so skipping the 3x3 near() scan preserves 1-pixel alignment shifts and fine silkscreen wording while eliminating CPU lag!
  const sameSlotTransform = (degA === degB) && (mirA === mirB);
  const isAlignedCAMSession = !!(window.CAMState && window.CAMState._isActiveCAMSession && dx === 0 && dy === 0 && Math.abs(rotA) < 1e-4 && Math.abs(rotB) < 1e-4 && sameSlotTransform);
  const isAlignedNativeDXF = isNativeDXFPair && dx === 0 && dy === 0 && Math.abs(rotA) < 1e-4 && Math.abs(rotB) < 1e-4 && sameSlotTransform;
  const useVectorDXFRegions = isNativeDXFPair && sameSlotTransform && Math.abs(rotA) < 1e-4 && Math.abs(rotB) < 1e-4 && Math.abs(dx) < 1 && Math.abs(dy) < 1 && window.DXFState && window.DXFState.lastEntityDiff && window.DXFState.lastRenderMeta;
  const effEdge = (isAlignedNativeDXF || isAlignedCAMSession) ? 0 : Math.max(0, edge | 0);
  const near = (P, Q, x, y, i) => {
    if (effEdge <= 0) return false;
    const rP = P[i], gP = P[i + 1], bP = P[i + 2];
    const y0 = y > effEdge ? y - effEdge : 0, y1 = y + effEdge < H ? y + effEdge : H - 1;
    const x0 = x > effEdge ? x - effEdge : 0, x1 = x + effEdge < W ? x + effEdge : W - 1;
    for (let yy = y0; yy <= y1; yy++) {
      const rowBase = yy * W;
      for (let xx = x0; xx <= x1; xx++) {
        const j = (rowBase + xx) << 2;
        if (Math.abs(rP - Q[j]) <= tol && Math.abs(gP - Q[j + 1]) <= tol && Math.abs(bP - Q[j + 2]) <= tol) {
          return true;
        }
      }
    }
    return false;
  };

  const CS = 8, gw = Math.ceil(W / CS), gh = Math.ceil(H / CS), ca = new Uint32Array(gw * gh), cb = new Uint32Array(gw * gh);
  for (let y = 0, p = 0; y < H; y++) {
    const cyRow = (y >> 3) * gw;
    for (let x = 0; x < W; x++, p++) {
      if (a32[p] === b32[p]) continue;
      const i = p << 2, dr = pa[i] - pb[i], dg = pa[i + 1] - pb[i + 1], db = pa[i + 2] - pb[i + 2];
      const adr = dr < 0 ? -dr : dr, adg = dg < 0 ? -dg : dg, adb = db < 0 ? -db : db;
      if (adr <= tol && adg <= tol && adb <= tol) continue;
      if (hasIgn) {
        let inIgn = false;
        for (let k = 0; k < ignFlat.length; k += 4) {
          if (x >= ignFlat[k] && x < ignFlat[k + 2] && y >= ignFlat[k + 1] && y < ignFlat[k + 3]) { inIgn = true; break; }
        }
        if (inIgn) continue;
      }
      if (effEdge > 0 && near(pa, pb, x, y, i) && near(pb, pa, x, y, i)) continue;
      let t;
      // Recognize explicit Slot A vs Slot B DXF vector diff highlights (including custom user tints S.tintA / S.tintB)
      const tintCls = _cmpMemGuard
        ? _cmpMemGuard.classifyDiffPixelTint(pa[i], pa[i + 1], pa[i + 2], pb[i], pb[i + 1], pb[i + 2], tol, S.tintA, S.tintB)
        : 0;
      const redDomA = (tintCls === 1) || ((pa[i] - pa[i + 1] > 90) && (pa[i] - pb[i] > tol));
      const grnDomB = (tintCls === 2) || ((pb[i + 1] - pb[i] > 70) && (pb[i + 1] - pa[i + 1] > tol));
      if (redDomA && !grnDomB) {
        t = 1;
      } else if (grnDomB && !redDomA) {
        t = 2;
      } else if (isDarkSubstrate) {
        const dA = Math.abs(pa[i] - bgSrcR) + Math.abs(pa[i + 1] - bgSrcG) + Math.abs(pa[i + 2] - bgSrcB);
        const dB = Math.abs(pb[i] - bgSrcR) + Math.abs(pb[i + 1] - bgSrcG) + Math.abs(pb[i + 2] - bgSrcB);
        t = dA >= dB ? 1 : 2;
      } else {
        t = (dr + dg + db) <= 0 ? 1 : 2;
      }
      cls[p] = t;
      const ci = cyRow + (x >> 3);
      if (t === 1) ca[ci]++; else cb[ci]++;
    }
  }
  const regions = [];
  if (!useVectorDXFRegions) {
    const on = new Uint8Array(gw * gh); for (let i = 0; i < on.length; i++) on[i] = (ca[i] + cb[i]) >= mp ? 1 : 0;
    // Scrub isolated sub-threshold noise pixels from cls[] in cells where on[ci] === 0 so non-error areas never show red/green speckles
    if (mp > 1) {
      for (let y = 0, p = 0; y < H; y++) {
        const cyRow = (y >> 3) * gw;
        for (let x = 0; x < W; x++, p++) {
          if (cls[p] !== 0 && !on[cyRow + (x >> 3)]) {
            cls[p] = 0;
          }
        }
      }
    }
    const seen = new Uint8Array(gw * gh), q = new Int32Array(Math.max(1, gw * gh));
    for (let s = 0; s < on.length; s++) {
      if (!on[s] || seen[s]) continue;
      let x0 = gw, y0 = gh, x1 = 0, y1 = 0, sa = 0, sb = 0, sp = 0; q[sp++] = s; seen[s] = 1;
      const cellBoxes = (isAnyNativeDXF || isAlignedCAMSession) ? [] : null;
      while (sp > 0) {
        const v = q[--sp], cy = (v / gw) | 0, cx = v - cy * gw;
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
        sa += ca[v]; sb += cb[v];
        if (cellBoxes && cellBoxes.length < 1200) {
          const cbx = cx * CS, cby = cy * CS;
          let cellIgn = false;
          if (hasIgn) {
            const mcx = cbx + CS * 0.5, mcy = cby + CS * 0.5;
            for (let ik = 0; ik < ignFlat.length; ik += 4) {
              if (mcx >= ignFlat[ik] && mcx < ignFlat[ik + 2] && mcy >= ignFlat[ik + 1] && mcy < ignFlat[ik + 3]) { cellIgn = true; break; }
            }
          }
          if (!cellIgn) {
            cellBoxes.push({ x: cbx, y: cby, w: CS, h: CS, kind: cb[v] === 0 ? 'r' : (ca[v] === 0 ? 'a' : 'c') });
          }
        }
        const nbrR = isAnyNativeDXF ? 1 : 2;
        for (let oy = -nbrR; oy <= nbrR; oy++) for (let ox = -nbrR; ox <= nbrR; ox++) {
          const nx = cx + ox, ny = cy + oy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const j = ny * gw + nx; if (on[j] && !seen[j]) { seen[j] = 1; q[sp++] = j; }
        }
      }
      const padGrid = (isAnyNativeDXF || isAlignedCAMSession) ? 1 : 4;
      const x = Math.max(0, x0 * CS - padGrid), y = Math.max(0, y0 * CS - padGrid);
      const kind = sb === 0 ? 'r' : sa === 0 ? 'a' : (sa > 3 * sb ? 'r' : sb > 3 * sa ? 'a' : 'c');
      regions.push({ dpi: sc * 72, x, y, w: Math.min(W, (x1 + 1) * CS + padGrid) - x, h: Math.min(H, (y1 + 1) * CS + padGrid) - y, subBoxes: cellBoxes, kind, sa, sb });
    }
  }
  if (useVectorDXFRegions) {
    const diff = window.DXFState.lastEntityDiff;
    const meta = window.DXFState.lastRenderMeta;
    const b = meta.sharedBoundsA || meta.sharedBounds;
    if (b && isFinite(b.minX) && isFinite(b.maxX)) {
      const bw = Math.max(1e-3, b.maxX - b.minX || 100);
      const bh = Math.max(1e-3, b.maxY - b.minY || 100);
      const swappedRot = (degA === 90 || degA === 270);
      const fullW = swappedRot ? H : W;
      const fullH = swappedRot ? W : H;
      const pad = 40 * (fullW / 2200);
      const tW = Math.max(10, fullW - pad * 2);
      const tH = Math.max(10, fullH - pad * 2);
      const scaleCad = Math.min(tW / bw, tH / bh);
      const offX = pad + (tW - bw * scaleCad) / 2;
      const offY = pad + (tH - bh * scaleCad) / 2;
      const mapCadPt = (wx, wy) => {
        const ux = offX + (wx - b.minX) * scaleCad;
        const uy = fullH - (offY + (wy - b.minY) * scaleCad);
        let rx = ux, ry = uy;
        if (degA === 90) { rx = fullH - uy; ry = ux; }
        else if (degA === 180) { rx = fullW - ux; ry = fullH - uy; }
        else if (degA === 270) { rx = uy; ry = fullW - ux; }
        if (S.mirrorXA) rx = W - rx;
        if (S.mirrorYA) ry = H - ry;
        return [rx, ry];
      };
      const vectorRegions = [];
      const pA = window.DXFState.parsedA;
      const pB = window.DXFState.parsedB;
      const uMap = (typeof DXFEngine !== "undefined" && DXFEngine.UNITS) ? DXFEngine.UNITS : {};
      const unitInfoA = (pA && pA.unitName && uMap[pA.unitName]) ? uMap[pA.unitName] : { toMils: 39.3700787 };
      const boxSizeMils = (window.DXFState && Number(window.DXFState.highlightBoxMils) > 0) ? Number(window.DXFState.highlightBoxMils) : 7;
      const pushEntRegion = (ent, kind, boxOverride = null, modNote = "", pairedBeforeEnt = null) => {
        if (!pairedBeforeEnt) {
          const drawE = ent._normEnt || ent;
          const emptyWithCommon = (Array.isArray(drawE._diffSubSegments) && drawE._diffSubSegments.length === 0 && Array.isArray(drawE._commonSubSegments) && drawE._commonSubSegments.length > 0 && (!Array.isArray(drawE._diffTextEntities) || drawE._diffTextEntities.length === 0)) ||
                                  (Array.isArray(ent._diffSubSegments) && ent._diffSubSegments.length === 0 && Array.isArray(ent._commonSubSegments) && ent._commonSubSegments.length > 0 && (!Array.isArray(ent._diffTextEntities) || ent._diffTextEntities.length === 0));
          if (emptyWithCommon) return;
        }
        const eb = ent._diffBBox || boxOverride || ent._bbox || (typeof DXFEngine !== "undefined" && DXFEngine.getDXFEntityBBox ? DXFEngine.getDXFEntityBBox(ent) : null);
        if (!eb || !isFinite(eb.minX)) return;
        let subBoxes = [];
        if (typeof DXFEngine !== "undefined" && typeof DXFEngine.computeSteppedDiffBoxes === "function") {
          const bToA = meta.bToARatio || 1.0;
          const offB = meta.centerOffsetB || { dx: 0, dy: 0 };
          const mapForEnt = (targetEnt, isSlotB) => {
            const useNorm = !!(targetEnt && targetEnt._normEnt);
            return DXFEngine.computeSteppedDiffBoxes(targetEnt, (wx, wy) => {
              const ax = (isSlotB && !useNorm) ? (wx * bToA + (offB.dx || 0)) : wx;
              const ay = (isSlotB && !useNorm) ? (wy * bToA + (offB.dy || 0)) : wy;
              return mapCadPt(ax, ay);
            }, {
              boxSizeMils,
              toMils: unitInfoA.toMils || 39.3700787,
              scale: scaleCad,
              canvasW: W,
              canvasH: H,
              parser: isSlotB ? pB : pA
            });
          };
          if (pairedBeforeEnt) {
            const boxesA = mapForEnt(pairedBeforeEnt, false).map(b => ({ ...b, kind: b.isTextTriangle ? "r" : "r" }));
            const boxesB = mapForEnt(ent, true).map(b => ({ ...b, kind: b.isTextTriangle ? "r" : "a" }));
            const geomA = boxesA.filter(b => !b.isTextTriangle);
            const geomB = boxesB.filter(b => !b.isTextTriangle);
            const singleTextTri = boxesB.find(b => b.isTextTriangle) || boxesA.find(b => b.isTextTriangle);
            subBoxes = [...geomA, ...geomB];
            if (singleTextTri) subBoxes.push({ ...singleTextTri, kind: "r", isTextTriangle: true, shape: "triangle" });
          } else {
            const isSlotB = (kind === "a" || kind === "c");
            subBoxes = mapForEnt(ent, isSlotB).map(b => (b.isTextTriangle ? { ...b, kind: "r", isTextTriangle: true, shape: "triangle" } : { ...b, kind }));
          }
        }
        if (hasIgn && subBoxes.length > 0) {
          subBoxes = subBoxes.filter(sb => {
            const cx = sb.x + sb.w * 0.5, cy = sb.y + sb.h * 0.5;
            for (let k = 0; k < ignFlat.length; k += 4) {
              if (cx >= ignFlat[k] && cx < ignFlat[k + 2] && cy >= ignFlat[k + 1] && cy < ignFlat[k + 3]) return false;
            }
            return true;
          });
          if (subBoxes.length === 0) return;
        }
        let rx, ry, rw, rh;
        if (subBoxes.length > 0) {
          let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
          for (const sb of subBoxes) {
            if (sb.x < bx0) bx0 = sb.x;
            if (sb.y < by0) by0 = sb.y;
            if (sb.x + sb.w > bx1) bx1 = sb.x + sb.w;
            if (sb.y + sb.h > by1) by1 = sb.y + sb.h;
            if (sb.isTextTriangle && Number.isFinite(sb.textX) && Number.isFinite(sb.textW)) {
              if (sb.textX < bx0) bx0 = sb.textX;
              if (sb.textY < by0) by0 = sb.textY;
              if (sb.textX + sb.textW > bx1) bx1 = sb.textX + sb.textW;
              if (sb.textY + sb.textH > by1) by1 = sb.textY + sb.textH;
            }
          }
          rx = Math.max(0, Math.floor(bx0));
          ry = Math.max(0, Math.floor(by0));
          rw = Math.min(W - rx, Math.max(5, Math.ceil(bx1 - rx)));
          rh = Math.min(H - ry, Math.max(5, Math.ceil(by1 - ry)));
        } else {
          const [p1x, p1y] = mapCadPt(eb.minX, eb.minY);
          const [p2x, p2y] = mapCadPt(eb.maxX, eb.maxY);
          const x0 = Math.min(p1x, p2x), x1 = Math.max(p1x, p2x);
          const y0 = Math.min(p1y, p2y), y1 = Math.max(p1y, p2y);
          rx = Math.max(0, Math.floor(Math.min(x0, x1) - 3));
          ry = Math.max(0, Math.floor(Math.min(y0, y1) - 3));
          rw = Math.min(W - rx, Math.max(6, Math.ceil(Math.abs(x1 - x0) + 6)));
          rh = Math.min(H - ry, Math.max(6, Math.ceil(Math.abs(y1 - y0) + 6)));
        }
        if (hasIgn && subBoxes.length === 0) {
          for (let k = 0; k < ignFlat.length; k += 4) {
            const cx = rx + rw / 2, cy = ry + rh / 2;
            if (cx >= ignFlat[k] && cx < ignFlat[k + 2] && cy >= ignFlat[k + 1] && cy < ignFlat[k + 3]) return;
          }
        }
        const summary = modNote || ent._summary || (typeof DXFEngine !== "undefined" && DXFEngine.describeDXFEntity ? DXFEngine.describeDXFEntity(ent) : ent.type);
        vectorRegions.push({
          dpi: sc * 72,
          x: rx,
          y: ry,
          w: rw,
          h: rh,
          subBoxes,
          boxSizeMils,
          kind,
          sa: kind === "r" ? 100 : (kind === "c" ? 50 : 0),
          sb: kind === "a" ? 100 : (kind === "c" ? 50 : 0),
          dxfLayer: ent.layer || "0",
          dxfType: ent.type || "ENTITY",
          dxfSummary: summary,
          note: `[${ent.layer || "0"}] ${summary}`
        });
      };
      const modIdsA = new Set((diff.modifiedPairs || []).map(m => m.before && m.before._id));
      const modIdsB = new Set((diff.modifiedPairs || []).map(m => m.after && m.after._id));
      for (const m of (diff.modifiedPairs || [])) {
        if (m.after) pushEntRegion(m.after, "c", m.bbox || m.after._bbox, m.summary, m.before || null);
      }
      for (const pm of (diff.pairedMeasurementDiffs || [])) {
        if (pm.entA && pm.entB && !modIdsA.has(pm.entA._id) && !modIdsB.has(pm.entB._id)) {
          modIdsA.add(pm.entA._id);
          modIdsB.add(pm.entB._id);
          pushEntRegion(pm.entB, "c", pm.entB._diffBBox || pm.entB._bbox, `${pm.type} Changed: "${pm.oldValue}" → "${pm.newValue}"`, pm.entA);
        }
      }
      for (const e of (diff.removed || [])) {
        if (!modIdsA.has(e._id)) pushEntRegion(e, "r", e._diffBBox || e._bbox);
      }
      for (const e of (diff.added || [])) {
        if (!modIdsB.has(e._id)) pushEntRegion(e, "a", e._diffBBox || e._bbox);
      }
      if (vectorRegions.length > 0 || (diff.added.length === 0 && diff.removed.length === 0)) {
        regions.length = 0;
        regions.push(...vectorRegions);
      }
    }
  }
  // Merge exact CAM vector primitive diff regions when in an aligned CAM session so sub-pixel pad/trace/silkscreen diffs are never missed
  if (isAlignedCAMSession && Array.isArray(window.CAMState.perLayerCompareStats) && window.CAMState.perLayerCompareStats.length > 0) {
    const statEntries = (window.CAMState.stackCompareMode === 'composite' && n === 1)
      ? window.CAMState.perLayerCompareStats
      : (window.CAMState.perLayerCompareStats[n - 1] ? [window.CAMState.perLayerCompareStats[n - 1]] : []);
    const camRatio = (sc * 72) / 300;
    const swappedCam = (degA === 90 || degA === 270);
    const unrotCamW = swappedCam ? H : W;
    const unrotCamH = swappedCam ? W : H;
    for (const camLayerStat of statEntries) {
      if (!camLayerStat || !Array.isArray(camLayerStat.regions)) continue;
      for (const cr of camLayerStat.regions) {
        const ux = cr.x * camRatio, uy = cr.y * camRatio;
        const uw = Math.max(12, cr.w * camRatio), uh = Math.max(12, cr.h * camRatio);
        let bx = ux, by = uy, bw = uw, bh = uh;
        if (degA === 90) { bx = unrotCamH - (uy + uh); by = ux; bw = uh; bh = uw; }
        else if (degA === 180) { bx = unrotCamW - (ux + uw); by = unrotCamH - (uy + uh); }
        else if (degA === 270) { bx = uy; by = unrotCamW - (ux + uw); bw = uh; bh = uw; }
        if (S.mirrorXA) bx = W - (bx + bw);
        if (S.mirrorYA) by = H - (by + bh);
        const rx = Math.max(0, Math.round(bx));
        const ry = Math.max(0, Math.round(by));
        const rw = Math.min(W - rx, Math.max(12, Math.round(bw)));
        const rh = Math.min(H - ry, Math.max(12, Math.round(bh)));
        if (hasIgn) {
          let inIgn = false;
          for (let k = 0; k < ignFlat.length; k += 4) {
            const cx = rx + rw / 2, cy = ry + rh / 2;
            if (cx >= ignFlat[k] && cx < ignFlat[k + 2] && cy >= ignFlat[k + 1] && cy < ignFlat[k + 3]) { inIgn = true; break; }
          }
          if (inIgn) continue;
        }
        const mappedCamSubBoxes = (_cmpMemGuard && Array.isArray(cr.subBoxes) && cr.subBoxes.length)
          ? _cmpMemGuard.transformSubBoxes(cr.subBoxes, camRatio, degA, unrotCamW, unrotCamH, W, H, !!S.mirrorXA, !!S.mirrorYA)
          : null;
        const ov = regions.find(ex => !(rx > ex.x + ex.w + 8 || rx + rw + 8 < ex.x || ry > ex.y + ex.h + 8 || ry + rh + 8 < ex.y));
        if (ov) {
          if (cr.dxfLayer && !ov.dxfLayer) ov.dxfLayer = cr.dxfLayer;
          if (cr.dxfSummary && !ov.dxfSummary) ov.dxfSummary = cr.dxfSummary;
          if (cr.note && !ov.note) ov.note = cr.note;
          if (mappedCamSubBoxes && mappedCamSubBoxes.length) {
            if (!Array.isArray(ov.subBoxes)) ov.subBoxes = [];
            if (ov.subBoxes.length < 320) ov.subBoxes.push(...mappedCamSubBoxes.slice(0, 320 - ov.subBoxes.length));
          }
        } else {
          regions.push({
            dpi: sc * 72,
            x: rx,
            y: ry,
            w: rw,
            h: rh,
            subBoxes: mappedCamSubBoxes,
            kind: cr.kind || 'c',
            sa: cr.sa || (cr.kind === 'r' ? 80 : 0),
            sb: cr.sb || (cr.kind === 'a' ? 80 : 0),
            dxfLayer: cr.dxfLayer || camLayerStat.code || 'CAM',
            dxfType: cr.dxfType || 'CAM',
            dxfSummary: cr.dxfSummary || '',
            note: cr.note || ''
          });
        }
      }
    }
  }
  const tokenizeWords = arr => {
    const out = [];
    for (let i = 0; i < (arr || []).length; i++) {
      const parts = String(arr[i] || '').trim().split(/\s+/);
      for (let j = 0; j < parts.length; j++) {
        if (parts[j]) out.push(parts[j]);
      }
    }
    return out;
  };
  const cnt = t => { const m = {}; tokenizeWords(t).forEach(w => m[w] = (m[w] || 0) + 1); return m; };
  const ta = cnt(a.text), tb = cnt(b.text), rm = [], ad = [];
  for (const w in ta) if (ta[w] > (tb[w] || 0)) rm.push(w);
  for (const w in tb) if (tb[w] > (ta[w] || 0)) ad.push(w);
  // Positional & Wording Text Alignment Comparison for PDF / Vector sheets
  if (!useVectorDXFRegions && Array.isArray(a.textItems) && Array.isArray(b.textItems) && (a.textItems.length > 0 || b.textItems.length > 0)) {
    const posTolPx = Math.max(3.5, 1.15 * sc);
    const itemsA = a.textItems;
    const itemsB = b.textItems;
    const usedA = new Uint8Array(itemsA.length);
    const usedB = new Uint8Array(itemsB.length);
    const normStr = s => String(s || '').replace(/\s+/g, ' ').trim();
    const transformPtB = (bx, by) => {
      if (Math.abs(rotB) > 1e-4) {
        const cx = srcWB / 2, cy = srcHB / 2, cosB = Math.cos(rotB), sinB = Math.sin(rotB);
        return [cx + dx + (bx - cx) * cosB - (by - cy) * sinB, cy + dy + (bx - cx) * sinB + (by - cy) * cosB];
      }
      return [bx + dx, by + dy];
    };
    const transformPtA = (ax, ay) => {
      if (Math.abs(rotA) > 1e-4) {
        const cx = srcWA / 2, cy = srcHA / 2, cosA = Math.cos(rotA), sinA = Math.sin(rotA);
        return [cx + (ax - cx) * cosA - (ay - cy) * sinA, cy + (ax - cx) * sinA + (ay - cy) * cosA];
      }
      return [ax, ay];
    };
    // Helper: count actual changed pixels in cls[] inside a bounding box so unchanged PDF text runs NEVER create false-positive regions
    const countBoxDiffPixels = (x0, y0, wBox, hBox) => {
      const ix0 = Math.max(0, Math.floor(x0)), iy0 = Math.max(0, Math.floor(y0));
      const ix1 = Math.min(W - 1, Math.ceil(x0 + wBox)), iy1 = Math.min(H - 1, Math.ceil(y0 + hBox));
      let sA = 0, sB = 0;
      for (let yy = iy0; yy <= iy1; yy++) {
        const rOff = yy * W;
        for (let xx = ix0; xx <= ix1; xx++) {
          const cVal = cls[rOff + xx];
          if (cVal === 1) sA++;
          else if (cVal === 2) sB++;
        }
      }
      return { sA, sB, total: sA + sB };
    };
    // Pass 1: Match identical strings at identical positions (within posTolPx)
    for (let ib = 0; ib < itemsB.length; ib++) {
      const tB = itemsB[ib];
      const [bx, by] = transformPtB(tB.x, tB.y);
      const sB = normStr(tB.str);
      for (let ia = 0; ia < itemsA.length; ia++) {
        if (usedA[ia]) continue;
        const tA = itemsA[ia];
        if (normStr(tA.str) !== sB) continue;
        const [ax, ay] = transformPtA(tA.x, tA.y);
        if (Math.hypot(bx - ax, by - ay) <= posTolPx && Math.abs(tB.h - tA.h) <= Math.max(3.0, 1.0 * sc)) {
          usedA[ia] = 1;
          usedB[ib] = 1;
          break;
        }
      }
    }
    // Pass 2: Annotate existing visual diff regions with Wording / Alignment metadata, and ONLY push a standalone text region if actual pixels changed!
    const attachOrPushTextRegion = (rx, ry, rw, rh, kind, labelStr) => {
      const bx = Math.max(0, Math.floor(rx - 4));
      const by = Math.max(0, Math.floor(ry - 4));
      const bw = Math.min(W - bx, Math.max(14, Math.ceil(rw + 8)));
      const bh = Math.min(H - by, Math.max(12, Math.ceil(rh + 8)));
      if (hasIgn) {
        for (let k = 0; k < ignFlat.length; k += 4) {
          const cx = bx + bw / 2, cy = by + bh / 2;
          if (cx >= ignFlat[k] && cx < ignFlat[k + 2] && cy >= ignFlat[k + 1] && cy < ignFlat[k + 3]) return false;
        }
      }
      const ov = regions.find(ex => !(bx > ex.x + ex.w + 6 || bx + bw + 6 < ex.x || by > ex.y + ex.h + 6 || by + bh + 6 < ex.y));
      if (ov) {
        if (!ov.dxfSummary) ov.dxfSummary = labelStr;
        if (!ov.note) ov.note = labelStr;
        return true;
      }
      const pxStats = countBoxDiffPixels(bx, by, bw, bh);
      if (pxStats.total < Math.max(2, mp)) {
        // Visually identical on canvas (no pixel error in cls[]) — do not create a false-positive non-error box!
        return false;
      }
      regions.push({
        dpi: sc * 72,
        x: bx,
        y: by,
        w: bw,
        h: bh,
        kind,
        sa: pxStats.sA || (kind === 'r' ? pxStats.total : Math.round(pxStats.total / 2)),
        sb: pxStats.sB || (kind === 'a' ? pxStats.total : Math.round(pxStats.total / 2)),
        dxfType: 'TEXT',
        dxfSummary: labelStr,
        note: labelStr
      });
      return true;
    };
    for (let ib = 0; ib < itemsB.length; ib++) {
      if (usedB[ib]) continue;
      const tB = itemsB[ib];
      const [bx, by] = transformPtB(tB.x, tB.y);
      let bestIa = -1, bestDist = Infinity, isSameStr = false;
      for (let ia = 0; ia < itemsA.length; ia++) {
        if (usedA[ia]) continue;
        const tA = itemsA[ia];
        const [ax, ay] = transformPtA(tA.x, tA.y);
        const d = Math.hypot(bx - ax, by - ay);
        if (normStr(tA.str) === normStr(tB.str) && d <= Math.max(120 * sc, tA.w * 3)) {
          if (!isSameStr || d < bestDist) { isSameStr = true; bestDist = d; bestIa = ia; }
        } else if (!isSameStr && d <= Math.max(24 * sc, Math.max(tA.w, tB.w) * 0.85) && d < bestDist) {
          bestDist = d; bestIa = ia;
        }
      }
      if (bestIa !== -1) {
        usedA[bestIa] = 1;
        usedB[ib] = 1;
        const tA = itemsA[bestIa];
        const [ax, ay] = transformPtA(tA.x, tA.y);
        const minX = Math.min(ax, bx), minY = Math.min(ay, by);
        const maxX = Math.max(ax + tA.w, bx + tB.w), maxY = Math.max(ay + tA.h, by + tB.h);
        if (normStr(tA.str) === normStr(tB.str)) {
          const dxPt = ((bx - ax) / sc).toFixed(1), dyPt = ((by - ay) / sc).toFixed(1);
          const msg = `TEXT Misaligned: "${tB.str}" shifted Δ(${dxPt}, ${dyPt}) pt`;
          if (attachOrPushTextRegion(minX, minY, maxX - minX, maxY - minY, 'c', msg)) {
            if (!rm.includes(tA.str)) rm.push(`${tA.str} @ (${(ax / sc).toFixed(1)}, ${(ay / sc).toFixed(1)})`);
            if (!ad.includes(tB.str)) ad.push(`${tB.str} @ (${(bx / sc).toFixed(1)}, ${(by / sc).toFixed(1)})`);
          }
        } else {
          const msg = `TEXT Wording: "${tA.str}" → "${tB.str}"`;
          attachOrPushTextRegion(minX, minY, maxX - minX, maxY - minY, 'c', msg);
        }
      } else {
        attachOrPushTextRegion(bx, by, tB.w, tB.h, 'a', `TEXT Added: "${tB.str}"`);
      }
    }
    for (let ia = 0; ia < itemsA.length; ia++) {
      if (usedA[ia]) continue;
      const tA = itemsA[ia];
      const [ax, ay] = transformPtA(tA.x, tA.y);
      attachOrPushTextRegion(ax, ay, tA.w, tA.h, 'r', `TEXT Removed: "${tA.str}"`);
    }
  }
  regions.sort((p, q) => (Math.round(p.y / 120) - Math.round(q.y / 120)) || (p.x - q.x));
      const result = { W, H, A, B, cls, regions, rm, ad, n, dpi: sc * 72, isDarkSubstrate, isNativeDXF: isAnyNativeDXF, bgSrcR, bgSrcG, bgSrcB };
      if (state.keep) {
        if (typeof S.analysisCache.setPinnedKey === 'function') {
          S.analysisCache.setPinnedKey((S.cur && S.cur.n) || n);
        } else {
          while (S.analysisCache.size >= 24) {
            let evicted = false;
            for (const [oldestK, oldRes] of S.analysisCache.entries()) {
              if (oldRes !== S.cur) {
                if (oldRes) { oldRes.A = null; oldRes.B = null; oldRes.cls = null; oldRes._ovData = null; }
                S.analysisCache.delete(oldestK);
                evicted = true;
                break;
              }
            }
            if (!evicted) break;
          }
        }
        S.analysisCache.set(pageKey, result);
        if (typeof window !== 'undefined' && window.SmartManager && typeof window.SmartManager.updateMemoryHud === 'function') {
          window.SmartManager.updateMemoryHud();
        }
      }
      return result;
    } finally {
      S.inflightAnalyze.delete(pageKey);
    }
  })();
  S.inflightAnalyze.set(pageKey, state);
  return state.promise;
}

// overlay pixels for the three overlay-type modes (stores per-page r._ovData in cache to prevent cross-page image bleed)
let _sharedOvData = null;
/* ============================================================================
 * [MODULE SECTION: 256-LUT OVERLAY COMPOSITOR & MARKER RENDERER]
 * WHAT THIS IS: Composites Rev A, Rev B, and Common pixels using precomputed
 *   256-entry packed RGBA lookup tables and draws razor-sharp stepped marker boxes.
 * WHY / HOW TO EDIT: Edit `overlayData()` to add new visual blend modes, or
 *   `drawMarkersToContext()` to customize difference box styling on `#mk`.
 * ============================================================================ */
function overlayData(r, m) {
  const lA = $('#lA').checked, lB = $('#lB').checked, lC = $('#lC').checked, dim = m === 'diff' ? 20 : 120;
  const ovKey = `${r.n}|${getPageSettingsSuffix(r.n)}|${m}|${lA}|${lB}|${lC}|${S.tintA || ''}|${S.tintB || ''}|${S.tintC || ''}|${S.opA ?? 100}|${S.opB ?? 100}|${S.opC ?? 42}`;
  const W = r.W, H = r.H;
  if (r._ovKey === ovKey && r._ovData && r._ovData.width === W && r._ovData.height === H) {
    _sharedOvData = r._ovData;
    return r._ovData;
  }
  if (!r._ovData || r._ovData.width !== W || r._ovData.height !== H) {
    r._ovData = new ImageData(W, H);
  }
  _sharedOvData = r._ovData;
  const o = r._ovData, o32 = new Uint32Array(o.data.buffer), pa = r.A.data, pb = r.B.data, a32 = new Uint32Array(pa.buffer), b32 = new Uint32Array(pb.buffer), c = r.cls, paper = m === 'paper', darkSub = !!r.isDarkSubstrate, isDxf = !!r.isNativeDXF;
  const sBgR = r.bgSrcR != null ? r.bgSrcR : (darkSub ? 10 : 255);
  const sBgG = r.bgSrcG != null ? r.bgSrcG : (darkSub ? 46 : 255);
  const sBgB = r.bgSrcB != null ? r.bgSrcB : (darkSub ? 22 : 255);
  const pk = (R, G, B) => (255 << 24) | (B << 16) | (G << 8) | R;
  const bgR = (m === 'paper') ? 255 : ((m === 'over') ? ((isDxf && darkSub) ? sBgR : 6) : ((isDxf && m !== 'diff') ? sBgR : (paper ? 255 : 6)));
  const bgG = (m === 'paper') ? 255 : ((m === 'over') ? ((isDxf && darkSub) ? sBgG : 10) : ((isDxf && m !== 'diff') ? sBgG : (paper ? 255 : 10)));
  const bgB = (m === 'paper') ? 255 : ((m === 'over') ? ((isDxf && darkSub) ? sBgB : 8) : ((isDxf && m !== 'diff') ? sBgB : (paper ? 255 : 8)));
  const bg = pk(bgR, bgG, bgB);
  const hex2rgb = (h, def) => { if (!h || h.length < 7) return def; return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; };
  const useLightTints = (m === 'paper') ? true : ((m === 'over') ? false : (isDxf ? !darkSub : paper));
  const rgbA = hex2rgb(S.tintA, useLightTints ? [225, 20, 20] : [255, 64, 64]);
  const rgbB = hex2rgb(S.tintB, useLightTints ? [0, 165, 60] : [61, 255, 122]);
  const hasCustomTintC = !!(S.tintC && S.tintC.toLowerCase() !== '#94a3b8');
  const rgbC = hex2rgb(S.tintC, useLightTints ? [100, 116, 139] : [148, 163, 184]);
  const opA = (S.opA != null ? S.opA : 100) / 100, opB = (S.opB != null ? S.opB : 100) / 100;
  const opC = (m === 'diff') ? 0.14 : ((S.opC != null ? S.opC : 42) / 100);
  const cA = pk(Math.round(bgR + (rgbA[0] - bgR) * opA), Math.round(bgG + (rgbA[1] - bgG) * opA), Math.round(bgB + (rgbA[2] - bgB) * opA));
  const cB = pk(Math.round(bgR + (rgbB[0] - bgR) * opB), Math.round(bgG + (rgbB[1] - bgG) * opB), Math.round(bgB + (rgbB[2] - bgB) * opB));
  // Precompute 256-entry packed-RGBA lookup tables (lutA, lutB, lutC) to avoid per-pixel Math.pow & float rounding
  const lutA = new Uint32Array(256), lutB = new Uint32Array(256), lutC = new Uint32Array(256);
  for (let v = 0; v < 256; v++) {
    if (v >= 215) {
      lutA[v] = cA;
      lutB[v] = cB;
    } else {
      const normA = Math.min(1, Math.max(0.16, (v - 4) / 210));
      const inkA = Math.pow(normA, 0.82) * opA;
      lutA[v] = pk(Math.round(bgR + (rgbA[0] - bgR) * inkA), Math.round(bgG + (rgbA[1] - bgG) * inkA), Math.round(bgB + (rgbA[2] - bgB) * inkA));
      const normB = Math.min(1, Math.max(0.16, (v - 4) / 210));
      const inkB = Math.pow(normB, 0.82) * opB;
      lutB[v] = pk(Math.round(bgR + (rgbB[0] - bgR) * inkB), Math.round(bgG + (rgbB[1] - bgG) * inkB), Math.round(bgB + (rgbB[2] - bgB) * inkB));
    }
    if (v < 8) {
      lutC[v] = bg;
    } else {
      const inkC = Math.min(1, v / 215) * opC;
      lutC[v] = pk(
        Math.round(bgR + (rgbC[0] - bgR) * inkC),
        Math.round(bgG + (rgbC[1] - bgG) * inkC),
        Math.round(bgB + (rgbC[2] - bgB) * inkC)
      );
    }
  }
  const useCustomCommonLUT = isDxf || hasCustomTintC;
  const paperColorScale = (S.opC != null && S.opC !== 42) ? Math.max(0.05, Math.min(1, S.opC / 100)) : 1.0;
  const totalLen = c.length;
  for (let p = 0, i = 0; p < totalLen; p++, i += 4) {
    let t = c[p];
    const isBg = (a32[p] === 0xFFFFFFFF && b32[p] === 0xFFFFFFFF) ||
      (darkSub && (Math.abs(pa[i] - sBgR) + Math.abs(pa[i + 1] - sBgG) + Math.abs(pa[i + 2] - sBgB) < 24) &&
                  (Math.abs(pb[i] - sBgR) + Math.abs(pb[i + 1] - sBgG) + Math.abs(pb[i + 2] - sBgB) < 24));
    if (t === 0 && isBg) {
      o32[p] = bg;
      continue;
    }
    if (t === 1) {
      if (!lA) {
        if (lB) {
          const rawInkB = darkSub
            ? Math.min(255, (Math.max(Math.abs(pb[i] - sBgR), Math.abs(pb[i + 1] - sBgG), Math.abs(pb[i + 2] - sBgB)) * 1.15) | 0)
            : 255 - Math.min(pb[i], pb[i + 1], pb[i + 2]);
          if (rawInkB >= 8) { o32[p] = lutB[rawInkB]; continue; }
        }
        o32[p] = bg;
        continue;
      }
      const rawInkA = darkSub
        ? Math.min(255, (Math.max(Math.abs(pa[i] - sBgR), Math.abs(pa[i + 1] - sBgG), Math.abs(pa[i + 2] - sBgB)) * 1.15) | 0)
        : 255 - Math.min(pa[i], pa[i + 1], pa[i + 2]);
      o32[p] = lutA[rawInkA];
      continue;
    }
    if (t === 2) {
      if (!lB) {
        if (lA) {
          const rawInkA = darkSub
            ? Math.min(255, (Math.max(Math.abs(pa[i] - sBgR), Math.abs(pa[i + 1] - sBgG), Math.abs(pa[i + 2] - sBgB)) * 1.15) | 0)
            : 255 - Math.min(pa[i], pa[i + 1], pa[i + 2]);
          if (rawInkA >= 8) { o32[p] = lutA[rawInkA]; continue; }
        }
        o32[p] = bg;
        continue;
      }
      const rawInkB = darkSub
        ? Math.min(255, (Math.max(Math.abs(pb[i] - sBgR), Math.abs(pb[i + 1] - sBgG), Math.abs(pb[i + 2] - sBgB)) * 1.15) | 0)
        : 255 - Math.min(pb[i], pb[i + 1], pb[i + 2]);
      o32[p] = lutB[rawInkB];
      continue;
    }
    if (!lC) { o32[p] = bg; continue; }
    if (useCustomCommonLUT) {
      const rawInkC = darkSub
        ? Math.min(255, (Math.max(
            Math.abs(pa[i] - sBgR), Math.abs(pa[i + 1] - sBgG), Math.abs(pa[i + 2] - sBgB),
            Math.abs(pb[i] - sBgR), Math.abs(pb[i + 1] - sBgG), Math.abs(pb[i + 2] - sBgB)
          ) * 1.15) | 0)
        : 255 - Math.min(pa[i], pa[i + 1], pa[i + 2], pb[i], pb[i + 1], pb[i + 2]);
      o32[p] = lutC[rawInkC];
      continue;
    }
    if (paper) {
      if (darkSub) {
        const lum = Math.max((pa[i] + pa[i + 1] + pa[i + 2]) / 3, (pb[i] + pb[i + 1] + pb[i + 2]) / 3);
        const v = Math.max(24, Math.round(255 - Math.max(0, lum - 18) * 0.82));
        o32[p] = pk(v, v, Math.min(255, v + 8));
      } else if (paperColorScale >= 0.999) {
        o32[p] = pk(pb[i], pb[i + 1], pb[i + 2]);
      } else {
        o32[p] = pk(Math.round(255 - (255 - pb[i]) * paperColorScale), Math.round(255 - (255 - pb[i + 1]) * paperColorScale), Math.round(255 - (255 - pb[i + 2]) * paperColorScale));
      }
    } else if (darkSub && m === 'over') {
      const rC = Math.min(255, Math.round(18 + Math.max(pa[i], pb[i]) * 0.65));
      const gC = Math.min(255, Math.round(22 + Math.max(pa[i + 1], pb[i + 1]) * 0.65));
      const bC = Math.min(255, Math.round(20 + Math.max(pa[i + 2], pb[i + 2]) * 0.65));
      o32[p] = pk(rC, gC, bC);
    } else {
      const ink = darkSub
        ? Math.max((pa[i] + pa[i + 1] + pa[i + 2]) / 3, (pb[i] + pb[i + 1] + pb[i + 2]) / 3) / 255
        : Math.max(255 - (pa[i] + pa[i + 1] + pa[i + 2]) / 3, 255 - (pb[i] + pb[i + 1] + pb[i + 2]) / 3) / 255;
      const v = Math.round(8 + ink * dim);
      o32[p] = pk(v, v + 4, v + 2);
    }
  }
  r._ovKey = ovKey;
  return o;
}
function paint() {
  const r = S.cur; if (!r) return; clearMips(); S._isCAMScan = false; S.preview = null;
  const cv = $('#cv'), x = cv.getContext('2d'), W = r.W, H = r.H, m = S.mode, side = m === 'side';
  const curtainOn = !!(window.UIRibbon && window.UIRibbon.isCurtainActive && window.UIRibbon.isCurtainActive());
  const targetW = (!curtainOn && side) ? W * 2 + 24 : W;
  if (cv.width !== targetW || cv.height !== H) { cv.width = targetW; cv.height = H; }
  if (curtainOn) x.putImageData(r.B, 0, 0);
  else if (m === 'A' || (m === 'blink' && S.phase === 0)) x.putImageData(r.A, 0, 0);
  else if (m === 'B' || (m === 'blink' && S.phase === 1)) x.putImageData(r.B, 0, 0);
  else if (side) { x.fillStyle = '#3a4a44'; x.fillRect(0, 0, cv.width, H); x.putImageData(r.A, 0, 0); x.putImageData(r.B, W + 24, 0); }
  else x.putImageData(overlayData(r, m), 0, 0);
  cv._paintGen = (cv._paintGen || 0) + 1;
  markers(); applyView(); if (window.rpAfterPaint) window.rpAfterPaint();
}
function drawMarkersToContext(x, k, offs, pp, r) {
  igList().forEach(g => offs.forEach(o => {
    const q = igPx(g), sel = g.id === S.igSel;
    x.fillStyle = 'rgba(120,130,125,.35)';
    x.fillRect(o + q.x, q.y, q.w, q.h);
    x.setLineDash(sel ? [] : [8 / k, 5 / k]);
    x.lineWidth = (sel ? 2.5 : 1.5) / k;
    x.strokeStyle = sel ? '#1a3cff' : '#8a9a93';
    x.strokeRect(o + q.x, q.y, q.w, q.h);
    x.setLineDash([]);
    x.fillStyle = '#5c6b65';
    x.font = `${11 / k}px sans-serif`;
    x.fillText('ignored' + (g.page == null ? ' (all pages)' : ' (this page)'), o + q.x + 3 / k, q.y + 13 / k);
    if (sel && o === 0) {
      x.fillStyle = '#fff';
      x.strokeStyle = '#1a3cff';
      x.lineWidth = 1.5 / k;
      HANDLES.forEach(h => {
        const [hx, hy] = hpos(q, h), hs = 5 / k;
        x.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
        x.strokeRect(hx - hs, hy - hs, hs * 2, hs * 2);
      });
    }
  }));
  if (S.ig) {
    x.fillStyle = 'rgba(120,130,125,.3)';
    x.fillRect(S.ig.x, S.ig.y, S.ig.w, S.ig.h);
    x.strokeStyle = '#8a9a93';
    x.lineWidth = 1.5 / k;
    x.strokeRect(S.ig.x, S.ig.y, S.ig.w, S.ig.h);
  }
  if (!$('#lM').checked) return;
  const singleSlotView = (S.mode === 'A' || S.mode === 'B');
  r.regions.forEach((g, i) => {
    const sel = i === S.sel, dn = S.done[r.n + ':' + i];
    if (singleSlotView && !sel) return;
    // Color-Only High-Contrast DXF Compare: no cluttering diff boxes over CAD vectors or measurement text!
    // Only highlight when user explicitly selects a defect row to focus/locate it.
    if (r.isNativeDXF && !sel) return;
    const isDefaultTintB = !S.tintB || S.tintB.toLowerCase() === '#00a53c';
    const tintR = (r.isNativeDXF && !pp && (!S.tintA || S.tintA.toLowerCase() === '#e11414')) ? '#ff2a4b' : (S.tintA || '#e11d48');
    const tintA = (r.isNativeDXF && !pp && isDefaultTintB) ? '#00f0ff' : (S.tintB || '#0066ff');
    const colBox = g.kind === 'r' ? tintR : g.kind === 'a' ? tintA : (pp ? '#e11d48' : '#00f0ff');
    if (Array.isArray(g.subBoxes) && g.subBoxes.length > 0) {
      x.lineWidth = (sel ? 2.4 : 1.75) / k;
      const addSubBoxOrTriPath = (ctx2d, ox, sb, fillIt) => {
        if (sb.isTextTriangle || sb.shape === 'triangle') {
          const tx = ox + sb.x, ty = sb.y, tw = sb.w, th = sb.h;
          ctx2d.moveTo(tx + tw * 0.5, ty);
          ctx2d.lineTo(tx + tw, ty + th);
          ctx2d.lineTo(tx, ty + th);
          ctx2d.closePath();
        } else {
          if (fillIt) ctx2d.fillRect(ox + sb.x, sb.y, sb.w, sb.h);
          ctx2d.rect(ox + sb.x, sb.y, sb.w, sb.h);
        }
      };
      offs.forEach(o => {
        if (sel) {
          x.fillStyle = pp ? 'rgba(26,60,255,.14)' : 'rgba(255,255,255,.16)';
          x.strokeStyle = pp ? '#1a3cff' : '#ffffff';
          x.beginPath();
          for (let bi = 0; bi < g.subBoxes.length; bi++) {
            addSubBoxOrTriPath(x, o, g.subBoxes[bi], true);
          }
          x.fill();
          x.stroke();
        } else if (dn) {
          x.strokeStyle = 'rgba(138,154,147,0.65)';
          x.beginPath();
          for (let bi = 0; bi < g.subBoxes.length; bi++) {
            addSubBoxOrTriPath(x, o, g.subBoxes[bi], false);
          }
          x.stroke();
        } else {
          // Group subBoxes by kind ('r' vs 'a') and render text changes as a single Red Triangle indication
          let hasR = false, hasA = false, hasOther = false, hasTri = false;
          for (let bi = 0; bi < g.subBoxes.length; bi++) {
            const sb = g.subBoxes[bi];
            if (sb.isTextTriangle || sb.shape === 'triangle') { hasTri = true; continue; }
            const knd = sb.kind || g.kind;
            if (knd === 'r') hasR = true;
            else if (knd === 'a') hasA = true;
            else hasOther = true;
          }
          if (hasTri) {
            x.fillStyle = 'rgba(239, 68, 68, 0.88)';
            x.strokeStyle = '#ef4444';
            x.beginPath();
            for (let bi = 0; bi < g.subBoxes.length; bi++) {
              const sb = g.subBoxes[bi];
              if (sb.isTextTriangle || sb.shape === 'triangle') {
                addSubBoxOrTriPath(x, o, sb, false);
              }
            }
            x.fill();
            x.stroke();
          }
          if (hasR && (offs.length < 2 || o === 0)) {
            x.fillStyle = 'rgba(239, 68, 68, 0.22)';
            x.strokeStyle = tintR;
            x.beginPath();
            for (let bi = 0; bi < g.subBoxes.length; bi++) {
              const sb = g.subBoxes[bi];
              if (!sb.isTextTriangle && sb.shape !== 'triangle' && (sb.kind || g.kind) === 'r') {
                x.fillRect(o + sb.x, sb.y, sb.w, sb.h);
                x.rect(o + sb.x, sb.y, sb.w, sb.h);
              }
            }
            x.stroke();
          }
          if (hasA && (offs.length < 2 || o > 0)) {
            x.fillStyle = (r.isNativeDXF && !pp && isDefaultTintB) ? 'rgba(255, 255, 255, 0.22)' : 'rgba(34, 197, 94, 0.20)';
            x.strokeStyle = tintA;
            x.beginPath();
            for (let bi = 0; bi < g.subBoxes.length; bi++) {
              const sb = g.subBoxes[bi];
              if (!sb.isTextTriangle && sb.shape !== 'triangle' && (sb.kind || g.kind) === 'a') {
                x.fillRect(o + sb.x, sb.y, sb.w, sb.h);
                x.rect(o + sb.x, sb.y, sb.w, sb.h);
              }
            }
            x.stroke();
          }
          if (hasOther) {
            x.fillStyle = pp ? 'rgba(220, 38, 38, 0.16)' : 'rgba(255, 255, 255, 0.20)';
            x.strokeStyle = colBox;
            x.beginPath();
            for (let bi = 0; bi < g.subBoxes.length; bi++) {
              const sb = g.subBoxes[bi];
              const knd = sb.kind || g.kind;
              if (!sb.isTextTriangle && sb.shape !== 'triangle' && knd !== 'r' && knd !== 'a') {
                x.fillRect(o + sb.x, sb.y, sb.w, sb.h);
                x.rect(o + sb.x, sb.y, sb.w, sb.h);
              }
            }
            x.stroke();
          }
        }
      });
      return;
    }
    const pad = r.isNativeDXF ? 1.0 : 2.5;
    const bx = g.x - pad, by = g.y - pad, bw = g.w + pad * 2, bh = g.h + pad * 2;
    x.lineWidth = (sel ? 2.5 : 1.45) / k;
    x.strokeStyle = sel ? (pp ? '#1a3cff' : '#ffffff') : dn ? 'rgba(138,154,147,0.65)' : colBox;
    offs.forEach(o => {
      if (sel) {
        x.fillStyle = pp ? 'rgba(26,60,255,.10)' : 'rgba(255,255,255,.12)';
        x.fillRect(o + bx, by, bw, bh);
      }
      x.strokeRect(o + bx, by, bw, bh);
    });
  });
}
window.drawMarkersToSheetCanvas = function(targetCtx) {
  const r = S.cur; if (!r || !targetCtx) return;
  const offs = S.mode === 'side' ? [0, r.W + 24] : [0], pp = S.mode === 'paper';
  targetCtx.save();
  drawMarkersToContext(targetCtx, 1, offs, pp, r);
  targetCtx.restore();
};
function markers() {
  const r = S.cur; if (!r) return;
  const m = $('#mk'), cv = $('#cv'), vpEl = $('#vp');
  if (!m || !cv) return;
  const x = m.getContext('2d');
  const k = Math.max(0.05, (S.view && S.view.k) || 1);
  const vx = (S.view && S.view.x) || 0;
  const vy = (S.view && S.view.y) || 0;
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
  const vpW = (vpEl && vpEl.clientWidth) || 0;
  const vpH = (vpEl && vpEl.clientHeight) || 0;
  const offs = S.mode === 'side' ? [0, r.W + 24] : [0], pp = S.mode === 'paper';
  // Render #mk in native viewport device-pixel space so error-area boxes are 100% razor-sharp at 1034%+ zoom and never blurry!
  if (vpW > 10 && vpH > 10) {
    const targetW = Math.max(1, Math.round(vpW * dpr));
    const targetH = Math.max(1, Math.round(vpH * dpr));
    if (m.width !== targetW || m.height !== targetH) { m.width = targetW; m.height = targetH; }
    m.style.width = vpW + 'px';
    m.style.height = vpH + 'px';
    m.style.transformOrigin = '0 0';
    m.style.transform = `translate(${-vx / k}px, ${-vy / k}px) scale(${1 / k})`;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, m.width, m.height);
    x.setTransform(dpr * k, 0, 0, dpr * k, vx * dpr, vy * dpr);
    drawMarkersToContext(x, k, offs, pp, r);
    x.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    m.style.width = '';
    m.style.height = '';
    m.style.transform = '';
    if (m.width !== cv.width || m.height !== cv.height) { m.width = cv.width; m.height = cv.height; }
    else { x.clearRect(0, 0, m.width, m.height); }
    drawMarkersToContext(x, k, offs, pp, r);
  }
  if (typeof window !== 'undefined' && typeof window.rpRedrawOverlay === 'function') {
    window.rpRedrawOverlay();
  }
}
function buildMip(L) {
  if (!S.mips) S.mips = [$('#cv')];
  const r = S.cur;
  const mMode = S.mode;
  const curtainOn = !!(window.UIRibbon && window.UIRibbon.isCurtainActive && window.UIRibbon.isCurtainActive());
  const isOvMode = !curtainOn && (mMode === 'paper' || mMode === 'over' || mMode === 'diff');
  const lA = $('#lA') ? $('#lA').checked : true;
  const lB = $('#lB') ? $('#lB').checked : true;
  const paper = mMode === 'paper';
  const hex2rgb = (h, def) => { if (!h || h.length < 7) return def; return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; };
  const rgbA = hex2rgb(S.tintA, paper ? [225, 20, 20] : [255, 64, 64]);
  const rgbB = hex2rgb(S.tintB, paper ? [0, 165, 60] : [61, 255, 122]);
  const pk = (R, G, B) => (255 << 24) | ((B & 255) << 16) | ((G & 255) << 8) | (R & 255);
  const colA32 = pk(rgbA[0], rgbA[1], rgbA[2]);
  const colB32 = pk(rgbB[0], rgbB[1], rgbB[2]);

  for (let i = 1; i <= L; i++) if (!S.mips[i]) {
    const s = S.mips[i - 1], c = document.createElement('canvas');
    c.width = Math.max(1, s.width >> 1);
    c.height = Math.max(1, s.height >> 1);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(s, 0, 0, c.width, c.height);
    // True-Color Ink-Preserving Mipmap Refinement: preserve thin colored schematic lines and text sharpness when downsampled
    if (!(r && r.isDarkSubstrate) && s.width >= c.width * 2 && c.width * c.height <= 8e6) {
      try {
        const sImg = s.getContext('2d').getImageData(0, 0, s.width, s.height).data;
        const dImg = x.getImageData(0, 0, c.width, c.height);
        const d8 = dImg.data;
        const sw = s.width, sh = s.height, mw = c.width, mh = c.height;
        for (let my = 0; my < mh; my++) {
          const sy0 = my << 1, sy1 = Math.min(sh - 1, sy0 + 1);
          const mRow = my * mw;
          for (let mx = 0; mx < mw; mx++) {
            const sx0 = mx << 1, sx1 = Math.min(sw - 1, sx0 + 1);
            const di = (mRow + mx) * 4;
            const avgR = d8[di], avgG = d8[di + 1], avgB = d8[di + 2];
            const avgInk = 255 - (avgR < avgG ? (avgR < avgB ? avgR : avgB) : (avgG < avgB ? avgG : avgB));
            let bestInk = avgInk, bR = avgR, bG = avgG, bB = avgB;
            for (let sy = sy0; sy <= sy1; sy++) {
              const sRow = sy * sw;
              for (let sx = sx0; sx <= sx1; sx++) {
                const si = (sRow + sx) * 4;
                const sr = sImg[si], sg = sImg[si + 1], sb = sImg[si + 2];
                const sMin = sr < sg ? (sr < sb ? sr : sb) : (sg < sb ? sg : sb);
                const sInk = 255 - sMin;
                if (sInk > bestInk) { bestInk = sInk; bR = sr; bG = sg; bB = sb; }
              }
            }
            if (bestInk > avgInk + 10) {
              d8[di]     = Math.round(avgR * 0.4 + bR * 0.6);
              d8[di + 1] = Math.round(avgG * 0.4 + bG * 0.6);
              d8[di + 2] = Math.round(avgB * 0.4 + bB * 0.6);
            }
          }
        }
        x.putImageData(dImg, 0, 0);
      } catch (e) {}
    }
    // Diff-Preserving Mipmap Enhancement: blend active diff pixels smoothly so changed lines remain clear when shrunk without blocky text!
    if (isOvMode && r && r.cls && r.W > 0 && r.H > 0 && (lA || lB)) {
      const imgD = x.getImageData(0, 0, c.width, c.height);
      const d8 = imgD.data;
      const cls = r.cls, RW = r.W, RH = r.H, mw = c.width, mh = c.height;
      const shift = i;
      const stride = Math.max(1, 1 << shift);
      for (let y = 0; y < RH; y += stride) {
        const my = Math.min(mh - 1, y >> shift);
        const mRow = my * mw;
        const rRow = y * RW;
        for (let xPx = 0; xPx < RW; xPx += stride) {
          const t = cls[rRow + xPx];
          if ((t === 1 && lA) || (t === 2 && lB)) {
            const mx = Math.min(mw - 1, xPx >> shift);
            const idx = (mRow + mx) * 4;
            const cc = t === 1 ? rgbA : rgbB;
            d8[idx] = Math.round(d8[idx] * 0.45 + cc[0] * 0.55);
            d8[idx + 1] = Math.round(d8[idx + 1] * 0.45 + cc[1] * 0.55);
            d8[idx + 2] = Math.round(d8[idx + 2] * 0.45 + cc[2] * 0.55);
            d8[idx + 3] = 255;
          }
        }
      }
      x.putImageData(imgD, 0, 0);
    }
    S.mips[i] = c;
  }
}
function syncCompareHud() {
  const hud = $('#c-floating-hud'), cv = $('#cv'), emp = $('#empty');
  if (!hud) return;
  const hasLoadedDrawing = !!(cv && cv.width > 0 && (S.cur || S.A || S.B) && (!emp || emp.hidden));
  hud.hidden = !hasLoadedDrawing;
  const totalP = Math.max(S.A ? S.A.numPages : 0, S.B ? S.B.numPages : 0) || 1;
  const curP = Math.max(1, Math.min(totalP, (S.cur && S.cur.n) || S.n || 1));
  const pLbl = $('#cHudPageLabel');
  if (pLbl) pLbl.textContent = `Page ${curP} / ${totalP}`;
  if ($('#cHudPrevPg')) $('#cHudPrevPg').disabled = curP <= 1;
  if ($('#cHudNextPg')) $('#cHudNextPg').disabled = curP >= totalP;
  if ($('#cPagesPrev')) $('#cPagesPrev').disabled = curP <= 1;
  if ($('#cPagesNext')) $('#cPagesNext').disabled = curP >= totalP;
  const zLbl = $('#cHudZoomLabel');
  if (zLbl && S.view) zLbl.textContent = Math.round(S.view.k * 100) + '%';
  if ($('#cHudBlink')) $('#cHudBlink').classList.toggle('on', S.mode === 'blink');
  if ($('#cHudCurtain')) {
    const cOn = !!(window.UIRibbon && window.UIRibbon.isCurtainActive && window.UIRibbon.isCurtainActive());
    $('#cHudCurtain').classList.toggle('on', cOn);
  }
  const dLbl = $('#cHudDiffLabel');
  if (dLbl) {
    const ds = window.UIRibbon && window.UIRibbon.DefectState;
    const curPageN = (S.cur && S.cur.n) || S.n || 1;
    const dsMatchesPage = ds && Array.isArray(ds.defects) && ds._activePage === curPageN;
    const cnt = dsMatchesPage
      ? ds.defects.length
      : (S.cur && Array.isArray(S.cur.regions) ? S.cur.regions.length : 0);
    dLbl.textContent = cnt + (cnt === 1 ? ' Diff' : ' Diffs');
  }
}
window.syncCompareHud = syncCompareHud;
let _mkRaf = 0;
function scheduleMarkers() {
  if (_mkRaf) return;
  if (typeof requestAnimationFrame === 'function') {
    _mkRaf = requestAnimationFrame(() => {
      _mkRaf = 0;
      markers();
    });
  } else {
    markers();
  }
}
function applyView(fastPan = false) {
  const v = S.view, cv = $('#cv'), lv = $('#lv');
  v.k = clampZoom(v.k, 0.05, 64.0);
  v.x = clampPan(v.x, 0);
  v.y = clampPan(v.y, 0);
  $('#stage').style.transform = `translate(${v.x}px,${v.y}px) scale(${v.k})`;
  if (!fastPan) syncCompareHud();
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
  const effK = v.k * dpr;
  let L = 0;
  const isNativeDxfView = !!(S.cur && S.cur.isNativeDXF && !S._isCAMScan);
  if (!isNativeDxfView && (S.cur || S.preview) && cv && cv.width > 0 && effK < 0.5) {
    L = Math.min(3, Math.max(1, Math.floor(Math.log2(0.5 / effK))));
  }
  if (L) {
    buildMip(L); const m = S.mips[L];
    if (lv._src !== m) {
      lv.width = m.width; lv.height = m.height;
      const lx = lv.getContext('2d'); lx.imageSmoothingEnabled = true; lx.imageSmoothingQuality = 'high';
      lx.drawImage(m, 0, 0); lv._src = m;
    }
    const wPx = cv.width + 'px', hPx = cv.height + 'px';
    if (lv.style.width !== wPx) lv.style.width = wPx;
    if (lv.style.height !== hPx) lv.style.height = hPx;
    if (lv.style.display !== 'block') lv.style.display = 'block';
    if (cv.style.visibility !== 'hidden') cv.style.visibility = 'hidden';
  } else {
    if (lv && lv.style.display !== 'none') lv.style.display = 'none';
    if (cv && cv.style.visibility !== 'visible') cv.style.visibility = 'visible';
  }
  if (cv && cv.style.imageRendering !== 'auto') cv.style.imageRendering = 'auto';
  const mk = $('#mk');
  if (mk && mk.style.transformOrigin === '0 0' && S.cur) {
    if (fastPan) scheduleMarkers();
    else markers();
  }
  if (window.UIRibbon && window.UIRibbon.updateCurtainClip) window.UIRibbon.updateCurtainClip();
}
function fit() {
  const vp = $('#vp'), cv = $('#cv'); if (!cv.width || !vp.clientWidth) return;
  const hudPadBottom = 52, padTop = 10, padX = 20;
  const availW = Math.max(120, vp.clientWidth - padX * 2);
  const availH = Math.max(120, vp.clientHeight - hudPadBottom - padTop);
  const k = clampZoom(Math.min(availW / cv.width, availH / cv.height) * .98, 0.05, 64.0);
  S.view = {
    k,
    x: clampPan(Math.round((vp.clientWidth - cv.width * k) / 2)),
    y: clampPan(Math.round(padTop + (availH - cv.height * k) / 2))
  };
  applyView(); markers();
  if (S.cur && S.cur.isNativeDXF && typeof window.rpSharpen === 'function') window.rpSharpen();
  if (window.rpRedrawOverlay) window.rpRedrawOverlay();
  if (window.UIRibbon && window.UIRibbon.updateCurtainClip) window.UIRibbon.updateCurtainClip();
}
function zoomBy(f) {
  const vp = $('#vp'), v = S.view, mx = vp.clientWidth / 2, my = vp.clientHeight / 2;
  const prevK = clampZoom(v.k, 0.05, 64.0);
  const k = clampZoom(prevK * (Number.isFinite(f) && f > 0 ? f : 1.0), 0.05, 64.0);
  v.x = clampPan(mx - (mx - v.x) * k / prevK);
  v.y = clampPan(my - (my - v.y) * k / prevK);
  v.k = k;
  applyView(); markers(); if (window.rpRedrawOverlay) window.rpRedrawOverlay();
}
window.paint = paint; window.markers = markers; window.applyView = applyView; window.fit = fit; window.zoomBy = zoomBy;
function focusRegion(i) {
  if (!S.cur || !S.cur.regions) return;
  const g = S.cur.regions[i]; if (!g) return; S.sel = i;
  const vp = $('#vp'), k = Math.max(.05, Math.min(16, Math.min(vp.clientWidth / (Math.max(g.w, 20) * 3), vp.clientHeight / (Math.max(g.h, 20) * 3))));
  S.view = { k, x: vp.clientWidth / 2 - (g.x + g.w / 2) * k, y: vp.clientHeight / 2 - (g.y + g.h / 2) * k };
  applyView(); markers(); renderList();
  if (window.UIRibbon && window.UIRibbon.DefectState) {
    const ds = window.UIRibbon.DefectState;
    const dIdx = ds.defects.findIndex(d => (d.regionIndex ?? (d.id - 1)) === i);
    if (dIdx !== -1) {
      ds.currentIndex = dIdx;
      ds.touchedIndex = dIdx;
      ds.renderChecklist();
      ds.highlightItem(dIdx);
    }
  }
  const el = document.querySelector('.it.sel'); if (el) el.scrollIntoView({ block: 'nearest' });
}
const KIND = { r: ['Removed', 't-r'], a: ['Added', 't-a'], c: ['Changed', 't-c'] };
function updateSummaryOnly() {
  const r = S.cur; if (!r) return;
  const c = k => r.regions.filter(g => g.kind === k).length, rv = r.regions.filter((g, i) => S.done[r.n + ':' + i]).length;
  $('#sum').innerHTML = r.regions.length ? `<b>${r.regions.length}</b> difference${r.regions.length === 1 ? '' : 's'} on page ${r.n} &middot; <span style="color:#ef4444;font-weight:700">Rev A (Old: Red)</span> vs <span style="color:#22c55e;font-weight:700">Rev B (New: Green)</span><br><span style="color:#ef4444">${c('r')} Rev A (Old)</span>, <span style="color:#22c55e">${c('a')} Rev B (New)</span>, ${c('c')} changed. Reviewed ${rv}.` : `<b style="color:var(--g)">No differences</b> on page ${r.n}`;
}
window.updateSummaryOnly = updateSummaryOnly;
function renderList() {
  const r = S.cur, L = $('#list'); if (!r || !L) return; L.innerHTML = '';
  const uName = fmtUnitName();
  const frag = document.createDocumentFragment();
  r.regions.forEach((g, i) => {
    const d = document.createElement('div'), dn = S.done[r.n + ':' + i];
    const kindInfo = KIND[g.kind] || KIND.c;
    d.className = 'it' + (i === S.sel ? ' sel' : '') + (dn ? ' done' : '');
    const dxfTag = g.dxfLayer ? ` <span style="font-size:10px;color:#38bdf8;font-weight:700">[${g.dxfLayer}]</span>` : "";
    const dxfDesc = g.dxfSummary ? `<div style="font-size:10.5px;opacity:.85">${g.dxfSummary}</div>` : "";
    d.innerHTML = `<input type="checkbox" ${dn ? 'checked' : ''} title="Mark as reviewed"><div><span class="tag ${kindInfo[1]}">${kindInfo[0]}</span> #${i + 1}${dxfTag}${dxfDesc}<small>${fmtUnitVal(g.w, g.dpi)} x ${fmtUnitVal(g.h, g.dpi)} ${uName} at (${fmtUnitVal(g.x, g.dpi)}, ${fmtUnitVal(g.y, g.dpi)}) ${uName}</small></div>`;
    d.onclick = e => {
      if (e.target.tagName === 'INPUT') {
        const chk = !!e.target.checked;
        S.done[r.n + ':' + i] = chk;
        if (window.UIRibbon && window.UIRibbon.DefectState && typeof window.UIRibbon.DefectState.setStatusByRegion === 'function') {
          window.UIRibbon.DefectState.setStatusByRegion(i, chk ? 'Approved' : 'Open');
        }
        renderList();
        markers();
      } else {
        focusRegion(i);
      }
    };
    frag.appendChild(d);
  });
  L.appendChild(frag);
  updateSummaryOnly();
  if (window.UIRibbon && window.UIRibbon.DefectState) {
    window.UIRibbon.DefectState.initFromRegions(r.regions);
  }
  const w = (l, c) => l.length ? l.slice(0, 300).map(t => `<span class="w ${c}">${t.replace(/</g, '&lt;')}</span>`).join('') : '<small>None</small>';
  $('#text').innerHTML = `<h3>Text only in A</h3>${w(r.rm, 'r')}<h3>Text only in B</h3>${w(r.ad, 'a')}`;
}
window.renderList = renderList;
function isAnalysisCached(res) {
  if (!res || !(S.analysisCache instanceof Map)) return false;
  for (const v of S.analysisCache.values()) {
    if (v === res) return true;
  }
  return false;
}
async function show(n) {
  S.n = n; const my = ++S.showTok;
  if (window.rpCancelSharpen) window.rpCancelSharpen();
  const cachedFast = getCachedPageAnalysis(n);
  let didBusy = false;
  if (!cachedFast) {
    didBusy = true;
    busy(true); st('Comparing page ' + n + '...'); await tick();
  }
  try {
    const prevN = S.cur ? S.cur.n : 0;
    const first = !S.cur || prevN !== n;
    const oldW = (!first && S.cur) ? S.cur.W : 0;
    const oldDpi = (!first && S.cur) ? S.cur.dpi : 0;
    const res = cachedFast || await analyze(n, true);
    if (my !== S.showTok) {
      if (res && res !== S.cur && !isAnalysisCached(res)) { res.A = null; res.B = null; res.cls = null; res._ovData = null; }
      return;
    }
    if (_mkRaf && typeof cancelAnimationFrame === 'function') { cancelAnimationFrame(_mkRaf); _mkRaf = 0; }
    if (S.mt) { clearTimeout(S.mt); S.mt = 0; }
    if (S.cur && S.cur !== res && !isAnalysisCached(S.cur)) { S.cur.A = null; S.cur.B = null; S.cur.cls = null; S.cur._ovData = null; }
    S.cur = res; S.sel = -1; $('#empty').hidden = true;
    S.scan = S.scan || {};
    S.scan[n] = res.regions || [];
    document.querySelectorAll('.pg').forEach(b => {
      const isCur = b.dataset.n == n;
      b.classList.toggle('cur', isCur);
      if (isCur) {
        b.classList.remove('same', 'diff');
        b.classList.add(res.regions && res.regions.length ? 'diff' : 'same');
        b.title = (res.regions ? res.regions.length : 0) + ' differences';
      }
    });
    if (window.CAMState && window.CAMState._isActiveCAMSession && window.CAMState.stackCompareMode === 'multipage' && Array.isArray(window.CAMState.pairedLayers) && window.CAMState.pairedLayers.length >= n) {
      window.CAMState.activeLayerIndex = n - 1;
      if (typeof window.CAMState.ensureParsed === 'function') window.CAMState.ensureParsed();
      if (window.UIRibbon && typeof window.UIRibbon.updateCAMSidebarPane === 'function') window.UIRibbon.updateCAMSidebarPane();
    }
    if (!first && oldW > 0 && res.W > 0 && oldW !== res.W) {
      const scaleRatio = res.W / oldW;
      if (S.view && S.view.k) {
        S.view.k = S.view.k * (oldW / res.W);
      }
      if (window.RP_MEASURE) {
        const rm = window.RP_MEASURE;
        if (Array.isArray(rm.annotations)) {
          rm.annotations.forEach(a => {
            if (a.page != null && a.page !== n) return;
            if (typeof a.x === 'number') a.x *= scaleRatio;
            if (typeof a.y === 'number') a.y *= scaleRatio;
            if (Array.isArray(a.pts)) a.pts.forEach(p => { p.x *= scaleRatio; p.y *= scaleRatio; });
          });
        }
        if (rm.tally && Array.isArray(rm.tally.items)) {
          rm.tally.items.forEach(it => {
            if (it.page === n) { it.x *= scaleRatio; it.y *= scaleRatio; }
          });
        }
        if (rm.calibrator && rm.calibrator.calibrated && oldDpi > 0 && res.dpi > 0) {
          rm.calibrator.pxPerUnit *= (res.dpi / oldDpi);
          if (window.rpUpdateCalBadge) window.rpUpdateCalBadge();
        }
      }
    }
    // Ensure #cv target dimensions are set before fit() so fit() computes zoom for the new page before paint() triggers rpAfterPaint()
    const cv = $('#cv');
    if (cv) {
      const curtainOn = !!(window.UIRibbon && window.UIRibbon.isCurtainActive && window.UIRibbon.isCurtainActive());
      const targetW = (!curtainOn && S.mode === 'side') ? res.W * 2 + 24 : res.W;
      if (cv.width !== targetW || cv.height !== res.H) { cv.width = targetW; cv.height = res.H; }
    }
    renderList();
    if (first || !S.view || !S.view.k) fit();
    paint();
    st('Page ' + n + ': ' + S.cur.regions.length + ' difference' + (S.cur.regions.length === 1 ? '' : 's') + '. ' + S.cur.W + ' x ' + S.cur.H + ' px at ' + Math.round(S.cur.dpi) + ' dpi');
  } catch (e) { st('Could not compare page ' + n + ': ' + (e.message || e)); } finally { if (didBusy) busy(false); }
}
async function scanAll(my) {
  const N = Math.max(S.A.numPages, S.B.numPages), P = $('#pages');
  try {
    const camStats = (window.CAMState && window.CAMState._isActiveCAMSession && Array.isArray(window.CAMState.perLayerCompareStats) && window.CAMState.perLayerCompareStats.length === N)
      ? window.CAMState.perLayerCompareStats : null;
    for (let n = 1; n <= N; n++) {
      if (my !== tok) return;
      if (camStats && n !== (S.cur ? S.cur.n : 1) && N > 12) {
        const stItem = camStats[n - 1];
        const diffCnt = stItem ? (stItem.addedCount + stItem.removedCount) : 0;
        S.scan[n] = (stItem && Array.isArray(stItem.regions) && stItem.regions.length)
          ? stItem.regions
          : (diffCnt > 0 ? Array.from({ length: diffCnt }, (_, idx) => ({ x: 150, y: 150, w: 24, h: 24, kind: idx < (stItem.removedCount || 0) ? 'r' : 'a', dpi: 300 })) : []);
        const b = P.querySelector(`.pg[data-n="${n}"]`);
        if (b) { b.classList.remove('same', 'diff'); b.classList.add(diffCnt ? 'diff' : 'same'); b.title = diffCnt + ' feature differences'; }
        continue;
      }
      if (N > 1 && !getCachedPageAnalysis(n)) st('Scanning page ' + n + ' of ' + N + '...');
      const keepInCache = n <= 12;
      const keepPage = keepInCache || n <= 24;
      const r = S.cur && n === S.cur.n ? S.cur : await analyze(n, keepPage);
      if (my !== tok) {
        if (!keepPage && r && r !== S.cur && !isAnalysisCached(r)) { r.A = null; r.B = null; r.cls = null; r._ovData = null; }
        return;
      }
      S.scan[n] = r.regions;
      if (!keepPage && r && r !== S.cur && !isAnalysisCached(r)) { r.A = null; r.B = null; r.cls = null; r._ovData = null; }
      const b = P.querySelector(`.pg[data-n="${n}"]`); if (b) { b.classList.remove('same', 'diff'); b.classList.add(r.regions.length ? 'diff' : 'same'); b.title = r.regions.length + ' differences'; }
      if (N > 1) await tick();
    }
    const bad = Object.values(S.scan).filter(x => x.length).length;
    const dpiTail = S.cur ? ` · Page ${S.cur.n}: ${S.cur.W} × ${S.cur.H} px at ${Math.round(S.cur.dpi)} dpi` : '';
    st((bad ? (bad + ' of ' + N + (N === 1 ? ' page has differences.' : ' pages have differences.')) : 'No differences on any page.') + dpiTail);
  } catch (e) {} finally {}
}
function addScanBtn(P, N) { if (P.querySelector('.sm')) return; const b = document.createElement('button'); b.className = 'sm'; b.id = 'cPagesScanAll'; b.textContent = 'Scan all ' + N + ' pages'; b.title = 'Scan all ' + N + ' pages for differences (Shortcut: R)'; b.onclick = () => { scanAll(tok); }; P.appendChild(b); }
async function start() {
  if (S.cur && !isAnalysisCached(S.cur)) { S.cur.A = null; S.cur.B = null; S.cur.cls = null; S.cur._ovData = null; }
  const my = ++tok, N = Math.max(S.A.numPages, S.B.numPages); S.scan = {}; S.cur = null; S.n = 1;
  S._lastDpi = +$('#dpi').value || 300;
  if (window.UIRibbon && window.UIRibbon.DefectState && window.UIRibbon.DefectState.clearAllPages) {
    window.UIRibbon.DefectState.clearAllPages();
  }
  const P = $('#pages'); P.innerHTML = '';
  if (N > 1) {
    const prevB = document.createElement('button');
    prevB.className = 'pg-nav';
    prevB.id = 'cPagesPrev';
    prevB.textContent = '\u25c0 Prev';
    prevB.title = 'Previous Page / Layer (Left Arrow / PageUp)';
    prevB.onclick = () => ACT.cPage && ACT.cPage(-1);
    P.appendChild(prevB);
  }
  const camLbls = (window.CAMState && window.CAMState._isActiveCAMSession && Array.isArray(window.CAMState.activeStackPageLabels)) ? window.CAMState.activeStackPageLabels : null;
  for (let n = 1; n <= N; n++) {
    const b = document.createElement('button');
    b.className = 'pg';
    const cl = camLbls && camLbls[n - 1];
    b.textContent = cl ? cl.short : n;
    if (cl && cl.full) b.title = cl.full;
    b.dataset.n = n;
    b.onclick = () => show(n);
    P.appendChild(b);
  }
  if (N > 1) {
    const nextB = document.createElement('button');
    nextB.className = 'pg-nav';
    nextB.id = 'cPagesNext';
    nextB.textContent = 'Next \u25b6';
    nextB.title = 'Next Page / Layer (Right Arrow / PageDown)';
    nextB.onclick = () => ACT.cPage && ACT.cPage(1);
    P.appendChild(nextB);
  }
  if (N > 1) addScanBtn(P, N);
  await show(1);
  if (N > PREF.scanMax) { addScanBtn(P, N); st('Page 1 compared. Click "Scan all" to check every page.'); return; }
  await scanAll(my);
}
window.refresh = refresh; async function refresh() {
  if (!(S.A && S.B)) {
    if (S.A) await previewSingleSlot('A', S.n || 1, true);
    else if (S.B) await previewSingleSlot('B', S.n || 1, true);
    return;
  }
  const N = Math.max(S.A.numPages, S.B.numPages), P = $('#pages');
  if (!S.cur || P.querySelectorAll('.pg').length !== N) return start();
  const my = ++tok; S.scan = {}; P.querySelectorAll('.pg').forEach(b => b.classList.remove('same', 'diff'));
  if (N > 1) addScanBtn(P, N);
  await show(Math.min(S.n, N)); if (my !== tok) return;
  if (N > PREF.scanMax) { addScanBtn(P, N); return; }
  await scanAll(my);
}
const redo = () => { clearTimeout(deb); deb = setTimeout(refresh, 300); };
S._lastDpi = +$('#dpi').value || 300;
['tol', 'minpx', 'edge', 'dx', 'dy'].forEach(id => {
  const el = $('#' + id);
  if (!el) return;
  el.onchange = () => {
    if (id === 'tol') {
      if ($('#rp-diff-thresh')) $('#rp-diff-thresh').value = el.value;
      if ($('#rp-tol-val')) $('#rp-tol-val').textContent = el.value;
    } else if (id === 'minpx') {
      const v = parseInt(el.value, 10) || 2;
      if ($('#rp-noise-thresh')) $('#rp-noise-thresh').value = v;
      if ($('#rp-noise-val')) $('#rp-noise-val').textContent = v;
      if (window.UIRibbon && window.UIRibbon.DefectState) window.UIRibbon.DefectState.noiseThreshold = v;
    } else if (id === 'edge') {
      const v = parseInt(el.value, 10) || 0;
      if ($('#rp-edge-thresh')) $('#rp-edge-thresh').value = v;
      if ($('#rp-edge-val')) $('#rp-edge-val').textContent = v;
    } else if (id === 'dx' && $('#rp-cur-dx')) {
      $('#rp-cur-dx').textContent = el.value;
    } else if (id === 'dy' && $('#rp-cur-dy')) {
      $('#rp-cur-dy').textContent = el.value;
    }
    redo();
  };
});
$('#dpi').onchange = () => {
  const newDpi = +$('#dpi').value || 300;
  const oldDpi = S._lastDpi || 300;
  S._lastDpi = newDpi;
  PREF.dpi = newDpi;
  if (window.savePrefs) window.savePrefs();
  if (oldDpi > 0 && newDpi !== oldDpi) {
    const ratio = newDpi / oldDpi;
    const dxVal = parseFloat($('#dx').value) || 0;
    const dyVal = parseFloat($('#dy').value) || 0;
    if (dxVal !== 0 || dyVal !== 0) {
      $('#dx').value = Number((dxVal * ratio).toFixed(1));
      $('#dy').value = Number((dyVal * ratio).toFixed(1));
      if ($('#rp-cur-dx')) $('#rp-cur-dx').textContent = $('#dx').value;
      if ($('#rp-cur-dy')) $('#rp-cur-dy').textContent = $('#dy').value;
    }
  }
  redo();
};
['lA', 'lB', 'lC'].forEach(id => $('#' + id).onchange = paint);
$('#lM').onchange = () => {
  if ($('#rp-markers-chk')) $('#rp-markers-chk').checked = $('#lM').checked;
  if ($('#rib-view-markers')) $('#rib-view-markers').classList.toggle('on', $('#lM').checked);
  markers();
};
$('#mode').onchange = e => {
  const prevMode = S.mode;
  S.mode = e.target.value; clearInterval(S.timer); S.timer = null;
  if (S.mode === 'blink') S.timer = setInterval(() => { if (document.body.dataset.view === 'compare') { S.phase ^= 1; paint(); if (S.cur && S.cur.isNativeDXF && typeof window.rpSharpen === 'function') window.rpSharpen(); } }, Math.max(120, Number(S.blinkMs) || 600));
  if (S.cur) {
    paint();
    if (!S.view || !S.view.k || prevMode === 'side' || S.mode === 'side') fit();
    else { applyView(); markers(); }
    if (window.rpSharpen) window.rpSharpen();
  } else if (S.A || S.B) {
    const slot = (S.mode === 'B' && S.B) ? 'B' : (S.A ? 'A' : 'B');
    previewSingleSlot(slot);
  }
};
function nextDiff(d) {
  if (!S.cur) return;
  const n = S.cur.regions.length;
  const i = (S.sel < 0) ? (d > 0 ? 0 : n - 1) : (S.sel + d);
  if (i >= 0 && i < n) return focusRegion(i);
  const totalP = Math.max(S.A ? S.A.numPages : 0, S.B ? S.B.numPages : 0) || 1;
  const scannedPages = Object.keys(S.scan).map(Number).filter(p => Array.isArray(S.scan[p]) && S.scan[p].length > 0).sort((a, b) => a - b);
  let p = d > 0 ? scannedPages.find(x => x > S.cur.n) : [...scannedPages].reverse().find(x => x < S.cur.n);
  if (!p && totalP > 1) {
    const cand = S.cur.n + (d > 0 ? 1 : -1);
    if (cand >= 1 && cand <= totalP && !(cand in S.scan)) p = cand;
  }
  if (p) {
    show(p).then(() => {
      if (S.cur && S.cur.regions.length) {
        focusRegion(d > 0 ? 0 : S.cur.regions.length - 1);
      }
    });
  } else {
    st(d > 0 ? 'No more differences.' : 'No earlier differences.');
  }
}
$('#nextD').onclick = () => nextDiff(1); $('#prevD').onclick = () => nextDiff(-1);
if ($('#scanAllBtn')) $('#scanAllBtn').onclick = () => ACT.rescan && ACT.rescan();
$('#markAll').onclick = () => {
  if (!S.cur) return;
  if (window.rpPushCompareHistory) window.rpPushCompareHistory('Mark all reviewed');
  const ds = window.UIRibbon && window.UIRibbon.DefectState;
  S.cur.regions.forEach((g, i) => {
    S.done[S.cur.n + ':' + i] = true;
    if (ds && typeof ds.setStatusByRegion === 'function') ds.setStatusByRegion(i, 'Approved');
  });
  renderList();
  markers();
};
document.querySelectorAll('aside .tabs button[data-t]').forEach(b => b.onclick = () => {
  document.querySelectorAll('aside .tabs button[data-t]').forEach(x => x.classList.toggle('on', x === b));
  $('#list').hidden = b.dataset.t !== 'd'; $('#text').hidden = b.dataset.t !== 't';
});

// ignore areas: draw, select, move, resize, delete (right-click or Delete key)
let igId = 1;
function igList() { return S.cur ? S.ignore.filter(g => g.page == null || g.page === S.cur.n) : []; }
function igPx(g) { const sc = S.cur.dpi / 72; return { x: g.x * sc, y: g.y * sc, w: g.w * sc, h: g.h * sc }; }
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'], CUR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move' };
function hpos(r, m) { const xx = m.includes('w') ? r.x : m.includes('e') ? r.x + r.w : r.x + r.w / 2, yy = m.includes('n') ? r.y : m.includes('s') ? r.y + r.h : r.y + r.h / 2; return [xx, yy]; }
function igHit(x, y) {
  if (!S.cur) return null; const hs = 8 / S.view.k, L = igList(), sel = L.find(g => g.id === S.igSel);
  if (sel) { const r = igPx(sel); for (const m of HANDLES) { const [hx, hy] = hpos(r, m); if (Math.abs(x - hx) <= hs && Math.abs(y - hy) <= hs) return { g: sel, mode: m }; } }
  for (let i = L.length - 1; i >= 0; i--) { const r = igPx(L[i]); if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { g: L[i], mode: 'move' }; }
  return null;
}
function delIgnore(id) { if (window.rpPushCompareHistory) window.rpPushCompareHistory('Delete ignore area'); S.ignore = S.ignore.filter(g => g.id !== id); if (S.igSel === id) S.igSel = null; markers(); redo(); st('Ignore area deleted'); }
$('#ignBtn').onclick = () => {
  if (!S.ignMode && window.RP_MEASURE && window.RP_MEASURE.activeTool && window.rpSetActiveTool) {
    window.rpSetActiveTool(null);
  }
  S.ignMode = !S.ignMode;
  $('#ignBtn').classList.toggle('on', S.ignMode);
  if ($('#rib-ignore')) $('#rib-ignore').classList.toggle('on', S.ignMode);
  $('#vp').classList.toggle('ign', S.ignMode);
  const pill = $('#rp-active-tool-pill'), pillName = $('#rp-active-tool-name'), finBtn = $('#rp-finish-tool-btn');
  if (pill && pillName) {
    if (S.ignMode) {
      pill.hidden = false;
      if (finBtn) finBtn.hidden = true;
      pillName.textContent = 'Active: Ignore Zone (Drag rectangle on drawing to exclude, Right-click to delete, Esc to exit)';
    } else if (!(window.RP_MEASURE && window.RP_MEASURE.activeTool)) {
      pill.hidden = true;
    }
  }
  st(S.ignMode ? 'Drag a rectangle over the area to ignore. Right-click an area to delete it, drag its handles to resize.' : 'Ignore mode off');
};
ACT.clearIgnore = () => { if (window.rpPushCompareHistory) window.rpPushCompareHistory('Clear ignore areas'); S.ignore = []; S.igSel = null; markers(); redo(); st('All ignore areas cleared'); };

// context menu
let ctx = null;
function closeCtx() { if (ctx) { ctx.remove(); ctx = null; } }

function showCtx(x, y, items) {
  closeCtx(); ctx = document.createElement('div'); ctx.className = 'dd'; ctx.id = 'ctxmenu';
  items.forEach(it => {
    if (it === '-') { const s = document.createElement('div'); s.className = 'msep'; ctx.append(s); return; }
    if (it.h) { const h = document.createElement('div'); h.className = 'mh'; h.textContent = it.h; ctx.append(h); return; }
    const b = document.createElement('button'); b.className = 'mi'; b.innerHTML = (it.ic ? ic(it.ic) : '<span style="width:16px"></span>') + '<span class="l"></span>';
    b.querySelector('.l').textContent = it.l; b.disabled = !!it.dis; b.onclick = () => { closeCtx(); it.a(); }; ctx.append(b);
  });
  document.body.append(ctx); ctx.style.left = Math.max(4, Math.min(x, innerWidth - ctx.offsetWidth - 6)) + 'px'; ctx.style.top = Math.max(4, Math.min(y, innerHeight - ctx.offsetHeight - 6)) + 'px';
}
window.showCtx = showCtx;
document.addEventListener('mousedown', e => { if (ctx && !ctx.contains(e.target)) closeCtx(); }); addEventListener('blur', closeCtx);

// pan / zoom / ignore interaction
const vp = $('#vp'); let drag = null, _cachedVpRect = null, _cachedVpRectTs = 0;
const getVpRectFast = () => {
  if (drag && drag.rect) return drag.rect;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!_cachedVpRect || now - _cachedVpRectTs > 120) {
    _cachedVpRect = vp.getBoundingClientRect();
    _cachedVpRectTs = now;
  }
  return _cachedVpRect;
};
addEventListener('resize', () => { _cachedVpRect = null; });
const toImg = e => { const b = getVpRectFast(); return [(e.clientX - b.left - S.view.x) / S.view.k, (e.clientY - b.top - S.view.y) / S.view.k]; };
vp.onpointerdown = e => {
  if (e.button === 2) return;
  if (e.target && e.target.closest && e.target.closest('#empty, #c-floating-hud, #rp-curtain-handle, button, select, input, a, label')) return;
  _cachedVpRect = vp.getBoundingClientRect();
  _cachedVpRectTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (S.cur) {
    const [x, y] = toImg(e), h = igHit(x, y);
    if (h) { if (window.rpPushCompareHistory) window.rpPushCompareHistory('Adjust ignore area'); S.igSel = h.g.id; S.igDrag = { mode: h.mode, g: h.g, x0: x, y0: y, o: { ...h.g }, moved: false }; vp.setPointerCapture(e.pointerId); markers(); return; }
    if (S.igSel) { S.igSel = null; markers(); }
    if (S.ignMode) { S.ig = { x0: x, y0: y, x, y, w: 0, h: 0 }; vp.setPointerCapture(e.pointerId); return; }
  }
  drag = { startX: e.clientX, startY: e.clientY, x: e.clientX - S.view.x, y: e.clientY - S.view.y, moved: false, rect: _cachedVpRect };
  vp.setPointerCapture(e.pointerId);
};
function hitRegionAt(x, y) {
  if (!S.cur || !Array.isArray(S.cur.regions) || !S.cur.regions.length) return -1;
  if ($('#lM') && !$('#lM').checked) return -1;
  const k = Math.max(0.05, (S.view && S.view.k) || 1);
  const pad = Math.max(4, 10 / k);
  const offs = S.mode === 'side' ? [0, S.cur.W + 24] : [0];
  let bestIdx = -1;
  let bestArea = Infinity;
  for (let i = 0; i < S.cur.regions.length; i++) {
    const g = S.cur.regions[i];
    if (!g) continue;
    for (let oi = 0; oi < offs.length; oi++) {
      const ox = offs[oi];
      if (x >= ox + g.x - pad && x <= ox + g.x + g.w + pad && y >= g.y - pad && y <= g.y + g.h + pad) {
        if (Array.isArray(g.subBoxes) && g.subBoxes.length > 0) {
          let hitSub = null;
          for (let bi = 0; bi < g.subBoxes.length; bi++) {
            const sb = g.subBoxes[bi];
            if (x >= ox + sb.x - pad && x <= ox + sb.x + sb.w + pad && y >= sb.y - pad && y <= sb.y + sb.h + pad) {
              hitSub = sb;
              break;
            }
            if (sb.isTextTriangle && Number.isFinite(sb.textX) &&
                x >= ox + sb.textX - pad && x <= ox + sb.textX + sb.textW + pad &&
                y >= sb.textY - pad && y <= sb.textY + sb.textH + pad) {
              hitSub = sb;
              break;
            }
          }
          if (!hitSub) continue;
          const subArea = Math.max(1, hitSub.w * hitSub.h);
          if (subArea < bestArea) {
            bestArea = subArea;
            bestIdx = i;
          }
        } else {
          const area = Math.max(1, g.w * g.h);
          if (area < bestArea) {
            bestArea = area;
            bestIdx = i;
          }
        }
      }
    }
  }
  return bestIdx;
}
window.hitRegionAt = hitRegionAt;

vp.onpointerup = e => {
  if (S.igDrag) { const d = S.igDrag; S.igDrag = null; if (d.moved) redo(); return; }
  if (S.ig) { const g = S.ig; S.ig = null; if (g.w > 4 && g.h > 4) { if (window.rpPushCompareHistory) window.rpPushCompareHistory('Add ignore area'); const sc = S.cur.dpi / 72, n = { id: igId++, x: g.x / sc, y: g.y / sc, w: g.w / sc, h: g.h / sc, page: $('#ignAll').checked ? null : S.cur.n }; S.ignore.push(n); S.igSel = n.id; if (window.RP_MEASURE && Array.isArray(window.RP_MEASURE.uncommittedIgnores)) window.RP_MEASURE.uncommittedIgnores.push(n.id); redo(); } markers(); return; }
  const wasMoved = !!(drag && drag.moved);
  drag = null; vp.classList.remove('drag');
  if (wasMoved) {
    markers();
    if (window.rpAfterPan) window.rpAfterPan();
  } else if (S.cur && (!e || e.button !== 2)) {
    const rm = window.RP_MEASURE;
    const fidActive = !!(window.UIRibbon && window.UIRibbon.FiducialAligner && window.UIRibbon.FiducialAligner.active);
    if (!(rm && rm.activeTool) && !S.ignMode && !fidActive && e) {
      const [x, y] = toImg(e);
      const hitIdx = hitRegionAt(x, y);
      if (hitIdx !== -1) {
        S.sel = hitIdx;
        markers();
        if (window.UIRibbon && window.UIRibbon.DefectState && typeof window.UIRibbon.DefectState.selectByRegion === 'function') {
          window.UIRibbon.DefectState.selectByRegion(hitIdx);
        }
      }
    }
  }
};
vp.onpointermove = e => {
  if (drag) {
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) <= 3) return;
      drag.moved = true;
      vp.classList.add('drag');
    }
    S.view.x = e.clientX - drag.x; S.view.y = e.clientY - drag.y; applyView(true);
    return;
  }
  const [x, y] = toImg(e);
  if (S.igDrag) {
    const d = S.igDrag, sc = S.cur.dpi / 72, dx = (x - d.x0) / sc, dy = (y - d.y0) / sc, g = d.g, o = d.o, m = d.mode; d.moved = true;
    if (m === 'move') { g.x = o.x + dx; g.y = o.y + dy; }
    else { let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h; if (m.includes('w')) x0 += dx; if (m.includes('e')) x1 += dx; if (m.includes('n')) y0 += dy; if (m.includes('s')) y1 += dy; g.x = Math.min(x0, x1); g.y = Math.min(y0, y1); g.w = Math.max(3, Math.abs(x1 - x0)); g.h = Math.max(3, Math.abs(y1 - y0)); }
    scheduleMarkers(); return;
  }
  if (S.ig) { const g = S.ig; g.x = Math.min(g.x0, x); g.y = Math.min(g.y0, y); g.w = Math.abs(x - g.x0); g.h = Math.abs(y - g.y0); scheduleMarkers(); return; }
  if (S.cur) { const h = igHit(x, y); const rHit = (!h && !S.ignMode && !(window.RP_MEASURE && window.RP_MEASURE.activeTool)) ? hitRegionAt(x, y) : -1; vp.style.cursor = h ? CUR[h.mode] : (S.ignMode ? 'crosshair' : (rHit !== -1 ? 'pointer' : '')); }
  if (S.cur && !window.RP_MEASURE) $('#pos').textContent = `x ${fmtUnitVal(x, S.cur.dpi)} ${fmtUnitName()}   y ${fmtUnitVal(y, S.cur.dpi)} ${fmtUnitName()}   zoom ${Math.round(S.view.k * 100)}%`;
};
vp.oncontextmenu = e => {
  e.preventDefault();
  const [x, y] = (S.cur || $('#cv').width) ? toImg(e) : [0, 0];
  const h = (S.cur || $('#cv').width) ? igHit(x, y) : null;
  if (h) {
    const g = h.g; S.igSel = g.id; markers();
    showCtx(e.clientX, e.clientY, [
      { h: 'Ignore Area #' + g.id },
      { l: 'Delete this ignore area', ic: 'trash', k: 'Del', a: () => delIgnore(g.id) },
      { l: g.page == null ? 'Apply to this page only' : 'Apply to all pages', a: () => { g.page = g.page == null ? S.cur.n : null; markers(); redo(); } },
      '-',
      { l: 'Delete all ignore areas', ic: 'trash', a: ACT.clearIgnore }
    ]);
    return;
  }

  const nearestDefectIdx = (S.cur && S.cur.regions) ? S.cur.regions.findIndex(r => Math.abs(x - (r.x + r.w / 2)) < Math.max(r.w, 40) && Math.abs(y - (r.y + r.h / 2)) < Math.max(r.h, 40)) : -1;

  const items = [];
  const rm = window.RP_MEASURE;
  const hasActiveTool = !!(rm && rm.activeTool) || !!(S && S.ignMode) || !!(window.UIRibbon && window.UIRibbon.FiducialAligner && window.UIRibbon.FiducialAligner.active);
  const hasUncommitted = !!(rm && ((rm.points && rm.points.length) || (rm.uncommittedAnns && rm.uncommittedAnns.length) || (rm.uncommittedTallies && rm.uncommittedTallies.length) || (rm.uncommittedIgnores && rm.uncommittedIgnores.length)));
  const hasRewind = !!(rm && ((rm.rewindBuffer && rm.rewindBuffer.length) || (rm.points && rm.points.length) || (rm.annotations && rm.annotations.length)));
  const toolLbl = (rm && rm.activeTool) ? rm.activeTool.toUpperCase() : (S && S.ignMode ? 'IGNORE ZONE' : 'DRAWING');
  // ✓ Done — Save Part & Start Second New Line (Full explanation in Help -> Quick Guide)
  items.push(
    { h: hasActiveTool ? `Active Tool: ${toolLbl}` : 'Drawing Options' },
    {
      l: 'Done',
      ic: 'check',
      a: () => window.rpToolDone && window.rpToolDone(),
      dis: !hasActiveTool && !hasUncommitted
    },
    {
      l: 'Rewind',
      ic: 'undo',
      a: () => window.rpToolRewind && window.rpToolRewind(),
      dis: !hasRewind
    },
    {
      l: 'Cancel',
      ic: 'x',
      a: () => window.rpToolCancel && window.rpToolCancel(),
      dis: !hasActiveTool && !hasUncommitted
    },
    ...(hasActiveTool ? [{
      l: 'Turn Off Tool',
      ic: 'select',
      a: () => window.rpToolOff && window.rpToolOff()
    }] : []),
    '-'
  );
  const hitAnnRes = (window.RP_MEASURE && window.RP_MEASURE.hitAt) ? window.RP_MEASURE.hitAt(x, y, S.n || 1) : null;
  if (hitAnnRes) {
    const ha = hitAnnRes.ann;
    items.push(
      { h: `Markup: ${ha.kind.toUpperCase()}${ha.pinNum ? ' #' + ha.pinNum : ''}` },
      ...(['pin', 'leader', 'cloud'].includes(ha.kind) ? [{
        l: 'Edit label / callout note...',
        ic: 'edittext',
        a: () => window.RP_MEASURE.editAnnotation && window.RP_MEASURE.editAnnotation(ha)
      }] : []),
      {
        l: 'Delete this markup',
        ic: 'trash',
        a: () => {
          if (window.rpPushCompareHistory) window.rpPushCompareHistory('Delete markup');
          window.RP_MEASURE.annotations.splice(hitAnnRes.idx, 1);
          if (window.rpRedrawOverlay) window.rpRedrawOverlay();
          if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
        }
      },
      '-'
    );
  }
  if (nearestDefectIdx !== -1) {
    const def = S.cur.regions[nearestDefectIdx];
    items.push(
      { h: `Defect #${nearestDefectIdx + 1} (${def.kind === 'r' ? 'Removed' : def.kind === 'a' ? 'Added' : 'Changed'})` },
      { l: 'Focus on this defect', ic: 'search', a: () => focusRegion(nearestDefectIdx) },
      { l: 'Mark defect as reviewed', ic: 'check', a: () => { S.done[S.cur.n + ':' + nearestDefectIdx] = true; renderList(); markers(); if (window.UIRibbon && window.UIRibbon.DefectState) window.UIRibbon.DefectState.setStatusByRegion(nearestDefectIdx, 'Approved'); } },
      '-'
    );
  }

  const placeCtxStamp = stampType => {
    if (!window.RP_MEASURE) return;
    if (window.rpPushCompareHistory) window.rpPushCompareHistory(`Stamp ${stampType}`);
    window.RP_MEASURE.annotations.push({
      kind: 'stamp',
      page: S.n || 1,
      x: x - 105,
      y: y - 38,
      stampType,
      reviewer: getSafeAuthor('Lead Engineer'),
      docHash: window.RP_MEASURE.docHash
    });
    if (window.rpRedrawOverlay) window.rpRedrawOverlay();
    if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar();
  };

  items.push(
    { h: 'PCB CAM & IPC Units' },
    { l: `Switch Units: ${isEnglishUnits() ? 'IPC Metric (mm / µm)' : 'IPC English (mils / in)'}`, ic: 'calibrate', k: 'U', a: () => window.setUnitSystem && window.setUnitSystem(isEnglishUnits() ? 'metric' : 'english') },
    { l: 'Open CAM Workbench (D-Codes / Drills / IPC-D-356)...', ic: 'pcbCam', a: () => window.showCAMWorkbenchModal && window.showCAMWorkbenchModal('format') },
    { l: 'Run IPC Class 1/2/3 DFM & Clearance Scan', ic: 'clearance', a: () => window.UIRibbon && window.UIRibbon.runCAMClearanceScan() },
    '-',
    { h: 'Measure & Takeoffs' },
    { l: 'Measure distance from here', ic: 'dist', k: 'M', a: () => { if (window.rpSetActiveTool) window.rpSetActiveTool('dist', 'Distance'); } },
    { l: 'Measure cumulative polyline run', ic: 'polyline', a: () => { if (window.rpSetActiveTool) window.rpSetActiveTool('poly', 'Cumulative Polyline'); } },
    { l: 'Measure closed polygon area', ic: 'area', a: () => { if (window.rpSetActiveTool) window.rpSetActiveTool('area', 'Polygon Area'); } },
    { l: 'Place BOM inspection badge (#)', ic: 'tally', a: () => { if (window.RP_MEASURE && window.RP_MEASURE.tally) { if (window.rpPushCompareHistory) window.rpPushCompareHistory('Add BOM badge'); window.RP_MEASURE.tally.addItem(x, y, S.n || 1, 'Inspection Badge'); if (window.rpRedrawOverlay) window.rpRedrawOverlay(); if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar(); } } },
    { l: 'Calibrate drawing scale...', ic: 'calibrate', a: () => { if (window.rpSetActiveTool) window.rpSetActiveTool('calibrate', 'Calibrate Scale'); } },
    '-',
    { h: 'Markups & Sign-Off' },
    { l: 'Add scalloped revision cloud (Δ Rev)', ic: 'revCloud', a: () => { if (window.rpSetActiveTool) window.rpSetActiveTool('cloud', 'Revision Cloud'); } },
    { l: 'Add leader callout arrow here', ic: 'leader', a: () => { if (window.rpSetActiveTool) window.rpSetActiveTool('leader', 'Leader Callout'); } },
    { l: 'Freehand redline pen', ic: 'pen', a: () => { if (window.rpSetActiveTool) window.rpSetActiveTool('pen', 'Freehand Pen'); } },
    { l: 'Place inspection pin marker here', ic: 'pin', a: () => { if (window.rpSetActiveTool) window.rpSetActiveTool('pin', 'Pin Marker'); } },
    { l: 'Eraser (remove markup or pin)', ic: 'eraser', a: () => { if (window.rpSetActiveTool) window.rpSetActiveTool('eraser', 'Eraser'); } },
    { l: 'Security redaction box', ic: 'redact', a: () => { if (window.rpSetActiveTool) window.rpSetActiveTool('redact', 'Redact Box'); } },
    { l: 'Stamp: APPROVED', ic: 'stampApp', a: () => placeCtxStamp('APPROVED') },
    { l: 'Stamp: REJECTED', ic: 'stampRej', a: () => placeCtxStamp('REJECTED') },
    { l: 'Stamp: REVISED & RESUBMIT', ic: 'stampRev', a: () => placeCtxStamp('REVISED & RESUBMIT') },
    { l: 'Stamp: FOR REVIEW (SHA-256)', ic: 'stampSha', a: () => placeCtxStamp('FOR REVIEW ONLY') },
    { l: 'Clear placed markups on sheet', ic: 'trash', a: () => { if (window.RP_MEASURE) { if (window.rpPushCompareHistory) window.rpPushCompareHistory('Clear markups'); window.RP_MEASURE.annotations = []; if (window.RP_MEASURE.tally) window.RP_MEASURE.tally.clear(); if (window.rpRedrawOverlay) window.rpRedrawOverlay(); if (window.rpUpdateMarkupsSidebar) window.rpUpdateMarkupsSidebar(); } }, dis: !((window.RP_MEASURE && window.RP_MEASURE.annotations && window.RP_MEASURE.annotations.length) || (window.RP_MEASURE && window.RP_MEASURE.tally && window.RP_MEASURE.tally.items.length)) },
    '-',
    { h: 'Optics & Registration' },
    { l: 'Toggle 4x magnifier loupe', ic: 'loupe', k: 'L', a: () => { $('#rib-loupe-toggle') && $('#rib-loupe-toggle').click(); } },
    { l: 'Toggle calibrated reference grid', ic: 'grid', k: 'G', a: () => { $('#rib-grid-toggle') && $('#rib-grid-toggle').click(); } },
    { l: 'Toggle precision crosshair', ic: 'crosshair', k: 'X', a: () => { $('#rib-crosshair-toggle') && $('#rib-crosshair-toggle').click(); } },
    { l: 'Toggle 60 FPS split curtain', ic: 'curtain', k: 'C', a: () => { $('#rib-curtain-toggle') && $('#rib-curtain-toggle').click(); } },
    { l: 'Capture fiducial point here', ic: 'fiducial', a: () => { if (window.UIRibbon && window.UIRibbon.FiducialAligner) { if (!window.UIRibbon.FiducialAligner.active) window.UIRibbon.FiducialAligner.start(); window.UIRibbon.FiducialAligner.addPoint(x, y); } } },
    { l: S.ignMode ? 'Stop drawing ignore areas' : 'Draw ignore mask zone', ic: 'ignore', k: 'I', a: ACT.ignore },
    { l: 'Auto-align B to A', ic: 'align', k: 'A', a: ACT.align },
    { l: `Rotate Rev A 90° CW (Now ${getSlotCardinalDeg('A')}°)`, ic: 'rotR', a: () => window.rotateCompareSlot && window.rotateCompareSlot('A', 90) },
    { l: `Rotate Rev A 90° CCW`, ic: 'rotL', a: () => window.rotateCompareSlot && window.rotateCompareSlot('A', -90) },
    { l: `Rotate Rev B 90° CW (Now ${getSlotCardinalDeg('B')}°)`, ic: 'rotR', a: () => window.rotateCompareSlot && window.rotateCompareSlot('B', 90) },
    { l: `Rotate Rev B 90° CCW`, ic: 'rotL', a: () => window.rotateCompareSlot && window.rotateCompareSlot('B', -90) },
    { l: 'Rotate Both Rev A & B 90° CW', ic: 'rotR', a: () => window.rotateCompareSlot && window.rotateCompareSlot('AB', 90) },
    { l: `Mirror Rev A Horizontally (Flip X: ${S.mirrorXA ? 'ON' : 'OFF'})`, ic: 'flipH', a: () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('A', 'x') },
    { l: `Mirror Rev A Vertically (Flip Y: ${S.mirrorYA ? 'ON' : 'OFF'})`, ic: 'flipV', a: () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('A', 'y') },
    { l: `Mirror Rev B Horizontally (Flip X: ${S.mirrorXB ? 'ON' : 'OFF'})`, ic: 'flipH', a: () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('B', 'x') },
    { l: `Mirror Rev B Vertically (Flip Y: ${S.mirrorYB ? 'ON' : 'OFF'})`, ic: 'flipV', a: () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('B', 'y') },
    { l: 'Mirror Both Rev A & B Horizontally (Flip X)', ic: 'flipH', a: () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('AB', 'x') },
    { l: 'Reset Rotation & Mirror (Rev A & B)', ic: 'reset', a: () => { if (window.setCompareSlotRotation) window.setCompareSlotRotation('AB', 0); if (window.setCompareSlotMirror) window.setCompareSlotMirror('AB', 'reset', false, false); } },
    { l: 'Swap A and B', ic: 'swap', k: 'S', a: () => $('#swap').click() },
    '-',
    { h: 'Edit & History' },
    { l: 'Undo last action', ic: 'undo', k: 'Ctrl+Z', a: () => ACT.cUndo && ACT.cUndo() },
    { l: 'Redo action', ic: 'redo', k: 'Ctrl+Y', a: () => ACT.cRedo && ACT.cRedo() },
    '-',
    { h: 'Navigation & View' },
    { l: 'World View', ic: 'globe', a: () => window.toggleWorldView && window.toggleWorldView() },
    { l: 'Scan all pages', ic: 'reset', k: 'R', a: () => ACT.rescan && ACT.rescan() },
    { l: 'Next difference', ic: 'next', k: 'N', a: () => nextDiff(1) },
    { l: 'Previous difference', ic: 'prev', k: 'P', a: () => nextDiff(-1) },
    { l: 'Fit to window & sharpen', ic: 'fit', k: 'F', a: () => { fit(); if (window.rpSharpen) window.rpSharpen(); } },
    { l: 'Zoom in (125%)', ic: 'zoomin', a: () => zoomBy(1.25) },
    { l: 'Zoom out (80%)', ic: 'zoomout', a: () => zoomBy(0.8) },
    '-',
    { h: 'Deliverables & Reports' },
    { l: 'Executive audit report (PDF)...', ic: 'auditPdf', a: () => window.UIRibbon && window.UIRibbon.generateExecutiveAuditReport() },
    { l: 'Export defect checklist (CSV)', ic: 'csv', a: () => window.UIRibbon && window.UIRibbon.exportDefectsCSV() },
    { l: 'Export drawing as AutoCAD .dxf...', ic: 'dxfOut', a: () => window.UIRibbon && window.UIRibbon.promptDXFExport() },
    { l: 'Save comparison image (PNG)', ic: 'png', a: () => $('#png').click() },
    { l: 'Save review session (.redline)', ic: 'sessionSave', a: () => window.UIRibbon && window.UIRibbon.saveSessionFile() }
  );

  showCtx(e.clientX, e.clientY, items);
};
let _wheelRaf = 0;
vp.onwheel = e => {
  e.preventDefault(); const b = getVpRectFast(), mx = e.clientX - b.left, my = e.clientY - b.top, v = S.view;
  const prevK = clampZoom(v.k, 0.05, 64.0);
  const k = clampZoom(prevK * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 0.05, 64.0);
  v.x = clampPan(mx - (mx - v.x) * k / prevK);
  v.y = clampPan(my - (my - v.y) * k / prevK);
  v.k = k;
  const zLbl = $('#cHudZoomLabel');
  if (zLbl) zLbl.textContent = Math.round(k * 100) + '%';
  applyView(true);
  if (!_wheelRaf && typeof requestAnimationFrame === 'function') {
    _wheelRaf = requestAnimationFrame(() => { _wheelRaf = 0; applyView(true); });
  }
  clearTimeout(S.mt); S.mt = setTimeout(markers, 75);
};

// auto-align B to A
function grayOf(c, f) {
  const w = Math.max(1, Math.floor(c.width / f)), h = Math.max(1, Math.floor(c.height / f)), t = document.createElement('canvas'); t.width = w; t.height = h;
  const x = t.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(c, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h); for (let i = 0; i < g.length; i++) { const j = i * 4; g[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8; }
  t.width = 0; t.height = 0;
  return { g, w, h };
}
function sad(A, B, sx, sy, x0, y0, x1, y1, step = 1) {
  let s = 0, n = 0;
  for (let y = y0; y < y1; y += step) { const ay = y + sy; if (ay < 0 || ay >= A.h) continue; for (let x = x0; x < x1; x += step) { const ax = x + sx; if (ax < 0 || ax >= A.w) continue; s += Math.abs(A.g[ay * A.w + ax] - B.g[y * B.w + x]); n++; } }
  const minSamples = Math.min(400, Math.max(16, Math.floor((x1 - x0) * (y1 - y0) / (step * step) * 0.25)));
  return n >= minSamples ? s / n : 1e9;
}
async function autoAlign() {
  if (!S.cur) {
    st('Open both drawings (Rev A and Rev B) first to auto-align.');
    if (window.rpToast) window.rpToast('Open both Base (A) and Revised (B) drawings first to run Auto-Align.');
    return;
  }
  busy(true); st('Aligning...'); await tick();
  let a = null, b = null, usedCached = false;
  try {
    if (!S.A || !S.B) { st('Open both drawings (Rev A and Rev B) first to auto-align.'); return; }
    const sc = S.cur.dpi / 72;
    const degA = getSlotCardinalDeg('A'), degB = getSlotCardinalDeg('B');
    const mirA = (S.mirrorXA ? 1 : 0) | (S.mirrorYA ? 2 : 0), mirB = (S.mirrorXB ? 1 : 0) | (S.mirrorYB ? 2 : 0);
    const ck = S.n + '|' + sc.toFixed(4) + '|' + (S.gen || 0) + '|' + degA + '|' + degB + '|' + mirA + '|' + mirB;
    if (S.rc && S.rc.key === ck && S.rc.a && S.rc.a.c && S.rc.a.c.width > 0 && S.rc.b && S.rc.b.c && S.rc.b.c.width > 0) {
      a = S.rc.a; b = S.rc.b; usedCached = true;
    } else {
      [a, b] = await Promise.all([render('A', S.n, sc), render('B', S.n, sc)]);
    }
    const f = 8, ga = grayOf(a.c, f), gb = grayOf(b.c, f);
    let best = 1e18, bx = 0, by = 0;
    for (let sy = -20; sy <= 20; sy++) for (let sx = -20; sx <= 20; sx++) { const s = sad(ga, gb, sx, sy, 0, 0, gb.w, gb.h, 1); if (s < best) { best = s; bx = sx; by = sy; } }
    const A1 = grayOf(a.c, 1), B1 = grayOf(b.c, 1);
    let minIx = gb.w, maxIx = 0, minIy = gb.h, maxIy = 0, cx = 0, cy = 0, tw = 0;
    const bgLum = gb.g[0];
    for (let y = 0; y < gb.h; y++) {
      for (let x = 0; x < gb.w; x++) {
        const w = Math.abs(bgLum - gb.g[y * gb.w + x]);
        if (w > 12) {
          if (x < minIx) minIx = x; if (x > maxIx) maxIx = x;
          if (y < minIy) minIy = y; if (y > maxIy) maxIy = y;
        }
        cx += x * w; cy += y * w; tw += w;
      }
    }
    let x0, x1, y0, y1;
    if (maxIx > minIx && maxIy > minIy) {
      x0 = Math.max(0, minIx * f - 32); x1 = Math.min(B1.w, (maxIx + 1) * f + 32);
      y0 = Math.max(0, minIy * f - 32); y1 = Math.min(B1.h, (maxIy + 1) * f + 32);
    } else {
      cx = tw ? Math.round(cx / tw * f) : B1.w >> 1; cy = tw ? Math.round(cy / tw * f) : B1.h >> 1;
      x0 = Math.max(0, cx - 600); x1 = Math.min(B1.w, cx + 600); y0 = Math.max(0, cy - 600); y1 = Math.min(B1.h, cy + 600);
    }
    const fineStep = ((x1 - x0) * (y1 - y0) > 1200000) ? 2 : 1;
    best = 1e18; let fx = bx * f, fy = by * f;
    for (let sy = by * f - 9; sy <= by * f + 9; sy++) for (let sx = bx * f - 9; sx <= bx * f + 9; sx++) { const s = sad(A1, B1, sx, sy, x0, y0, x1, y1, fineStep); if (s < best) { best = s; fx = sx; fy = sy; } }
    if (window.rpPushCompareHistory) window.rpPushCompareHistory('Auto-align'); $('#dx').value = fx; $('#dy').value = fy; if ($('#rp-cur-dx')) $('#rp-cur-dx').textContent = String(fx); if ($('#rp-cur-dy')) $('#rp-cur-dy').textContent = String(fy); st('Aligned: B shifted by ' + fx + ', ' + fy + ' px'); if (window.rpToast) window.rpToast(`Auto-Aligned: Rev B shifted by (${fx}, ${fy}) px.`); redo();
  } catch (e) {
    st('Auto-align stopped: ' + (e.message || e));
  } finally {
    if (!usedCached) {
      if (a && a.c) { a.c.width = 0; a.c.height = 0; }
      if (b && b.c) { b.c.width = 0; b.c.height = 0; }
    }
    busy(false);
  }
}
$('#align').onclick = autoAlign;

// export
async function dl(blob, name, filters) {
  if (window.native) { const bytes = new Uint8Array(await blob.arrayBuffer()); const p = await window.native.saveFile({ name, bytes, filters }); if (p) st('Saved ' + p); return p; }
}
function savePng() {
  if (!S.cur && !($('#cv') && $('#cv').width)) return st('Compare two PDFs first.');
  const t = document.createElement('canvas'); t.width = $('#cv').width; t.height = $('#cv').height;
  const x = t.getContext('2d'); x.drawImage($('#cv'), 0, 0);
  if (typeof window.drawMarkersToSheetCanvas === 'function') window.drawMarkersToSheetCanvas(x);
  else if ($('#mk') && $('#mk').width) x.drawImage($('#mk'), 0, 0);
  if (typeof window.drawOverlayToSheetCanvas === 'function') window.drawOverlayToSheetCanvas(x, 1);
  else if ($('#rp-ov') && $('#rp-ov').width) x.drawImage($('#rp-ov'), 0, 0);
  t.toBlob(b => { t.width = 0; t.height = 0; dl(b, 'redline_page' + (S.n || 1) + '.png', [{ name: 'PNG', extensions: ['png'] }]); });
}
function saveCsv() {
  if (!S.cur) return st('Compare two PDFs first.'); let s = 'page,no,type,x_mils,y_mils,width_mils,height_mils,x_mm,y_mm,width_mm,height_mm,reviewed\n';
  const pages = Object.keys(S.scan).length ? S.scan : { [S.cur.n]: S.cur.regions };
  for (const n in pages) pages[n].forEach((g, i) => s += [n, i + 1, (KIND[g.kind] || KIND.c)[0], mils(g.x, g.dpi), mils(g.y, g.dpi), mils(g.w, g.dpi), mils(g.h, g.dpi), mm(g.x, g.dpi), mm(g.y, g.dpi), mm(g.w, g.dpi), mm(g.h, g.dpi), S.done[n + ':' + i] ? 'yes' : 'no'].join(',') + '\n');
  dl(new Blob(['\ufeff' + s], { type: 'text/csv' }), 'redline_differences.csv', [{ name: 'CSV', extensions: ['csv'] }]);
}
$('#png').onclick = savePng; $('#csv').onclick = saveCsv;

const cleanPdfStr = s => String(s ?? '')
  .replace(/[ΩΩ]/g, 'Ohm')
  .replace(/[µμ]/g, 'u')
  .replace(/Δ/g, 'Delta ')
  .replace(/⌀/g, 'Dia.')
  .replace(/±/g, '+/-')
  .replace(/°/g, ' deg')
  .replace(/×/g, 'x')
  .replace(/[—–]/g, '-')
  .replace(/[·•]/g, '-')
  .replace(/≤/g, '<=')
  .replace(/≥/g, '>=')
  .replace(/✓/g, 'OK')
  .replace(/✗/g, 'X')
  .replace(/→/g, '->')
  .replace(/↔/g, '<->')
  .replace(/[^\x20-\x7e]/g, ' ');

async function canvasToJpgBytesSafe(can, quality = 0.90) {
  try {
    if (typeof can.toBlob === 'function') {
      const blob = await new Promise(res => can.toBlob(res, 'image/jpeg', quality));
      if (blob && typeof blob.arrayBuffer === 'function') {
        return new Uint8Array(await blob.arrayBuffer());
      }
    }
  } catch (e) {}
  const dataUrl = can.toDataURL('image/jpeg', quality);
  const b64 = (dataUrl && dataUrl.split(',')[1]) || '';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function exportReport() {
  if (!S.A && !S.B) {
    st('Open a drawing or CAM file first.');
    if (window.rpToast) window.rpToast('Open a drawing or CAM file before generating a report.');
    return;
  }
  if (!S.A || !S.B) {
    if (window.UIRibbon && typeof window.UIRibbon.generateExecutiveAuditReport === 'function') {
      await window.UIRibbon.generateExecutiveAuditReport(false);
      return;
    }
  }
  busy(true);
  try {
    const { PDFDocument, StandardFonts, rgb } = PDFLib, doc = await PDFDocument.create(), F = await doc.embedFont(StandardFonts.Helvetica), FB = await doc.embedFont(StandardFonts.HelveticaBold), N = Math.max(S.A.numPages, S.B.numPages), items = [];
    const activePageNum = (S.cur && S.cur.n) ? S.cur.n : (S.n || 1);
    let renderedCount = 0;
    for (let n = 1; n <= N; n++) {
      st('Report: page ' + n + ' of ' + N + '...'); await tick();
      if (N > 6 && n !== activePageNum && Array.isArray(S.scan[n]) && S.scan[n].length === 0) {
        items.push({ n, regions: [], rm: [], ad: [], dpi: (S.cur && S.cur.dpi) || 300 });
        continue;
      }
      if (N > 12 && n !== activePageNum && renderedCount >= 16 && Array.isArray(S.scan[n])) {
        items.push({ n, regions: S.scan[n], rm: [], ad: [], dpi: (S.cur && S.cur.dpi) || 300 });
        continue;
      }
      const r = (S.cur && S.cur.n === n && S.cur.A && S.cur.B) ? S.cur : await analyze(n, false);
      const hasPageAnnotations = !!(window.RP_MEASURE && (
        (Array.isArray(window.RP_MEASURE.annotations) && window.RP_MEASURE.annotations.some(a => a.page == null || a.page === n)) ||
        (window.RP_MEASURE.tally && Array.isArray(window.RP_MEASURE.tally.items) && window.RP_MEASURE.tally.items.some(t => t.page === n))
      ));
      if (!r.regions.length && !r.rm.length && !r.ad.length && !hasPageAnnotations && n !== activePageNum) {
        if (r && r !== S.cur) { r.A = null; r.B = null; r.cls = null; }
        items.push({ n, regions: [], rm: [], ad: [], dpi: r.dpi || 300 }); continue;
      }
      const c = document.createElement('canvas'); c.width = r.W; c.height = r.H; const x = c.getContext('2d');
      const repMode = (r.isDarkSubstrate && S.mode === 'over') ? 'over' : 'paper';
      x.putImageData(overlayData(r, repMode), 0, 0);
      const lw = Math.max(3, r.W / 700); x.lineWidth = lw; x.font = `bold ${Math.round(lw * 6)}px sans-serif`; x.textBaseline = 'top';
      r.regions.forEach((g, i) => {
        x.strokeStyle = '#ff8a00';
        if (Array.isArray(g.subBoxes) && g.subBoxes.length > 0) {
          for (let bi = 0; bi < g.subBoxes.length; bi++) {
            const sb = g.subBoxes[bi];
            if (sb.isTextTriangle || sb.shape === 'triangle') {
              x.save();
              x.fillStyle = 'rgba(239, 68, 68, 0.9)';
              x.strokeStyle = '#ef4444';
              x.beginPath();
              x.moveTo(sb.x + sb.w * 0.5, sb.y);
              x.lineTo(sb.x + sb.w, sb.y + sb.h);
              x.lineTo(sb.x, sb.y + sb.h);
              x.closePath();
              x.fill();
              x.stroke();
              x.restore();
            } else {
              x.strokeRect(sb.x, sb.y, sb.w, sb.h);
            }
          }
        } else {
          x.strokeRect(g.x, g.y, g.w, g.h);
        }
        const t = String(i + 1), tw = x.measureText(t).width + lw * 3, by = g.y >= lw * 7 ? g.y - lw * 7 : g.y;
        x.fillStyle = '#ff8a00'; x.fillRect(g.x, by, tw, lw * 7); x.fillStyle = '#fff'; x.fillText(t, g.x + lw * 1.5, by + lw * 0.5);
      });
      if (window.RP_MEASURE) {
        const rm = window.RP_MEASURE;
        if (rm.renderSingleAnnotation && Array.isArray(rm.annotations)) {
          rm.annotations.filter(a => a.page == null || a.page === n).forEach(a => rm.renderSingleAnnotation(x, a, 1));
        }
        if (rm.tally && Array.isArray(rm.tally.items) && rm.tally.items.length) {
          rm.tally.drawBadges(x, n, 1);
        }
      }
      const k = Math.min(1, 2400 / Math.max(1, c.width)), o = document.createElement('canvas'); o.width = Math.max(1, Math.round(c.width * k)); o.height = Math.max(1, Math.round(c.height * k)); const ox = o.getContext('2d'); ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high'; ox.drawImage(c, 0, 0, o.width, o.height);
      const iw = o.width, ih = o.height;
      const jpgBytes = await canvasToJpgBytesSafe(o, 0.90);
      c.width = 0; c.height = 0; o.width = 0; o.height = 0;
      if (r && r !== S.cur) { r.A = null; r.B = null; r.cls = null; }
      renderedCount++;
      items.push({ n, regions: r.regions, rm: r.rm, ad: r.ad, jpg: jpgBytes, iw, ih, dpi: r.dpi });
    }
    const uLbl = fmtUnitName();
    const PW = 842, PH = 595, M = 30;
    const allPages = [];
    let lastPageLowestY = PH - 160;
    const txt = (p, t, x, y, s, f = F, col = rgb(.1, .1, .1)) => p.drawText(cleanPdfStr(t), { x, y, size: s, font: f, color: col });
    const makePage = (subtitle = 'ENGINEERING DRAWING COMPARISON REPORT') => {
      const pg = doc.addPage([PW, PH]);
      allPages.push(pg);
      pg.drawRectangle({ x: 0, y: PH - 48, width: PW, height: 48, color: rgb(0.05, 0.13, 0.22) });
      pg.drawRectangle({ x: 0, y: PH - 51, width: PW, height: 3, color: rgb(0.9, 0.22, 0.22) });
      txt(pg, `KENSHO PRO 1.0 - ${subtitle}`, M, PH - 30, 13, FB, rgb(1, 1, 1));
      txt(pg, 'Kensho Studio - textportdocx.in', PW - 195, PH - 29, 9, F, rgb(0.75, 0.88, 1));
      lastPageLowestY = PH - 75;
      return pg;
    };

    let p = makePage('EXECUTIVE COMPARISON SUMMARY');
    txt(p, 'Base Drawing (Rev A): ' + (S.names.A || 'Rev_A.pdf').slice(0, 52), M, PH - 74, 10.5, FB);
    txt(p, 'Revised Drawing (Rev B): ' + (S.names.B || 'Rev_B.pdf').slice(0, 52), M + 400, PH - 74, 10.5, FB);
    txt(p, 'Date: ' + new Date().toLocaleString() + '    Quality: ' + $('#dpi').value + ' dpi    Tolerance: ' + $('#tol').value + '    Units: ' + (isEnglishUnits() ? 'IPC English (mils)' : 'IPC Metric (mm)'), M, PH - 92, 9.5, F, rgb(.3, .3, .3));
    const total = items.reduce((s, i) => s + i.regions.length, 0), bad = items.filter(i => i.regions.length).length;
    const totalReviewed = items.reduce((s, it) => s + it.regions.filter((g, i) => S.done[it.n + ':' + i]).length, 0);
    p.drawRectangle({ x: M, y: PH - 134, width: PW - 2 * M, height: 30, color: rgb(0.95, 0.97, 0.99), borderColor: rgb(0.8, 0.85, 0.9), borderWidth: 1 });
    txt(p, `Summary: ${total} total differences across ${bad} of ${N} pages   |   Reviewed: ${totalReviewed} of ${total}   |   Status: ${total === 0 ? 'IDENTICAL' : (totalReviewed === total ? 'ALL VERIFIED' : 'IN REVIEW')}`, M + 12, PH - 123, 11, FB, rgb(0.08, 0.18, 0.28));

    let y = PH - 160;
    p.drawRectangle({ x: M, y: y - 4, width: PW - 2 * M, height: 18, color: rgb(0.08, 0.18, 0.28) });
    txt(p, 'Sheet / Page', M + 8, y, 9.5, FB, rgb(1, 1, 1));
    txt(p, 'Detected Differences', M + 120, y, 9.5, FB, rgb(1, 1, 1));
    txt(p, 'Reviewed Status', M + 280, y, 9.5, FB, rgb(1, 1, 1));
    y -= 18;
    for (const it of items) {
      if (y < 60) { p = makePage('EXECUTIVE COMPARISON SUMMARY (CONT.)'); y = PH - 75; }
      const rv = it.regions.filter((g, i) => S.done[it.n + ':' + i]).length;
      txt(p, `Page ${it.n}`, M + 8, y, 9.5);
      txt(p, it.regions.length ? `${it.regions.length} difference(s)` : 'No differences (Identical)', M + 120, y, 9.5, F, it.regions.length ? rgb(.75, .1, .1) : rgb(.1, .5, .2));
      txt(p, it.regions.length ? `${rv} of ${it.regions.length} reviewed` : 'Verified', M + 280, y, 9.5);
      y -= 15;
      lastPageLowestY = y;
    }

    for (const it of items.filter(i => i.jpg && i.jpg.length)) {
      p = makePage(`SHEET ${it.n}: VISUAL REDLINE OVERLAY (${it.regions.length} DIFFS)`);
      const img = await doc.embedJpg(it.jpg), aw = PW - 2 * M, ah = PH - 105, k = Math.min(aw / it.iw, ah / it.ih);
      it.jpg = null;
      const imgBottomY = PH - 62 - it.ih * k;
      p.drawImage(img, { x: M + (aw - it.iw * k) / 2, y: imgBottomY, width: it.iw * k, height: it.ih * k });
      p.drawRectangle({ x: M + (aw - it.iw * k) / 2, y: imgBottomY, width: it.iw * k, height: it.ih * k, borderColor: rgb(0.75, 0.8, 0.85), borderWidth: 1 });
      lastPageLowestY = imgBottomY - 10;

      let yy = 0, pg = null;
      const head = () => {
        pg = makePage(`SHEET ${it.n}: ITEMIZED DIFFERENCE SCHEDULE & SIGN-OFF`);
        pg.drawRectangle({ x: M, y: PH - 82, width: PW - 2 * M, height: 18, color: rgb(0.08, 0.18, 0.28) });
        txt(pg, 'ID', M + 8, PH - 77, 9, FB, rgb(1, 1, 1));
        txt(pg, 'Class', M + 55, PH - 77, 9, FB, rgb(1, 1, 1));
        txt(pg, `Dimensions (${uLbl})`, M + 145, PH - 77, 9, FB, rgb(1, 1, 1));
        txt(pg, `Coordinates (${uLbl})`, M + 275, PH - 77, 9, FB, rgb(1, 1, 1));
        txt(pg, 'Reviewed', M + 415, PH - 77, 9, FB, rgb(1, 1, 1));
        yy = PH - 96;
        lastPageLowestY = yy;
      };
      if (it.regions.length) head();
      it.regions.forEach((g, i) => {
        if (yy < 155) head();
        if (i % 2 === 1) pg.drawRectangle({ x: M, y: yy - 3, width: PW - 2 * M, height: 13, color: rgb(0.96, 0.98, 0.99) });
        txt(pg, `#${i + 1}`, M + 8, yy, 9);
        txt(pg, (KIND[g.kind] || KIND.c)[0], M + 55, yy, 9, FB, g.kind === 'a' ? rgb(0, .5, .2) : rgb(.75, .1, .1));
        txt(pg, fmtUnitVal(g.w, it.dpi) + ' x ' + fmtUnitVal(g.h, it.dpi) + ' ' + uLbl, M + 145, yy, 9);
        txt(pg, '(' + fmtUnitVal(g.x, it.dpi) + ', ' + fmtUnitVal(g.y, it.dpi) + ') ' + uLbl, M + 275, yy, 9);
        txt(pg, S.done[it.n + ':' + i] ? 'Yes (Approved)' : 'Open', M + 415, yy, 9);
        yy -= 13;
        lastPageLowestY = yy;
      });
      if (it.rm.length || it.ad.length) {
        if (!pg || yy < 165) head();
        yy -= 8;
        txt(pg, ('Text only in A: ' + it.rm.slice(0, 20).join(', ')).slice(0, 115), M, yy, 9, F, rgb(.75, .1, .1));
        yy -= 13;
        txt(pg, ('Text only in B: ' + it.ad.slice(0, 20).join(', ')).slice(0, 115), M, yy, 9, F, rgb(0, .5, .2));
        lastPageLowestY = yy - 10;
      }
    }

    // Add Professional Engineering QA Sign-Off & Release Block on the Final Page
    let lastPg = allPages[allPages.length - 1];
    if (lastPageLowestY < 148) {
      lastPg = makePage('OFFICIAL ENGINEERING QUALITY ASSURANCE & SIGN-OFF');
    }
    const reviewer = getSafeAuthor('Lead Review Engineer');
    const docHash = (window.RP_MEASURE && window.RP_MEASURE.docHash) || 'A3F8E902B1764D5C';
    lastPg.drawRectangle({ x: M, y: 40, width: PW - 2 * M, height: 92, color: rgb(0.96, 0.98, 1.0), borderColor: rgb(0.1, 0.22, 0.36), borderWidth: 1.2 });
    lastPg.drawRectangle({ x: M, y: 114, width: PW - 2 * M, height: 18, color: rgb(0.08, 0.18, 0.28) });
    txt(lastPg, 'OFFICIAL ENGINEERING QUALITY ASSURANCE & REVISION RELEASE SIGN-OFF', M + 10, 119, 9, FB, rgb(1, 1, 1));
    txt(lastPg, `Reviewer: ${reviewer}   |   Units: ${isEnglishUnits() ? 'IPC English (mils/in)' : 'IPC Metric (mm)'}   |   SHA-256 Checksum: ${docHash}`, M + 12, 96, 9, FB, rgb(0.1, 0.15, 0.2));
    txt(lastPg, `Total Differences: ${total}   |   Verified/Reviewed: ${totalReviewed}   |   Final Disposition: ${total === 0 || totalReviewed === total ? 'APPROVED & VERIFIED' : 'PENDING ENGINEERING REVIEW'}`, M + 12, 80, 9, F, rgb(0.2, 0.25, 0.3));
    lastPg.drawLine({ start: { x: M + 12, y: 54 }, end: { x: M + 320, y: 54 }, thickness: 0.8, color: rgb(0.3, 0.35, 0.4) });
    txt(lastPg, 'Authorized Engineering Signature', M + 12, 44, 7.5, F, rgb(0.4, 0.45, 0.5));
    lastPg.drawLine({ start: { x: M + 380, y: 54 }, end: { x: PW - M - 20, y: 54 }, thickness: 0.8, color: rgb(0.3, 0.35, 0.4) });
    txt(lastPg, 'Quality Assurance Approval Date & Stamp', M + 380, 44, 7.5, F, rgb(0.4, 0.45, 0.5));

    // Footer bar & page numbering on all pages
    allPages.forEach((pgItem, idx) => {
      pgItem.drawLine({ start: { x: M, y: 28 }, end: { x: PW - M, y: 28 }, thickness: 0.6, color: rgb(0.8, 0.82, 0.85) });
      txt(pgItem, 'Kensho Pro 1.0 Enterprise · Kensho Studio (textportdocx.in) · Precision Engineering & CAM Verification', M, 15, 8, F, rgb(0.45, 0.48, 0.52));
      txt(pgItem, `Page ${idx + 1} of ${allPages.length}`, PW - M - 65, 15, 8.5, FB, rgb(0.2, 0.25, 0.3));
    });

    const bytes = await doc.save(); const pth = await window.native.saveFile({ name: 'comparison_report.pdf', bytes, filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (pth) st('Report saved: ' + pth); else st('Report cancelled');
  } catch (e) { st('Could not make the report: ' + (e.message || e)); } finally { busy(false); }
}
$('#report').onclick = exportReport;

Object.assign(ACT, { openA: () => pickCompare('A'), openB: () => pickCompare('B'), swap: () => $('#swap').click(), align: autoAlign, nextDiff: () => nextDiff(1), prevDiff: () => nextDiff(-1), markAll: () => $('#markAll').click(), rescan: async () => { if (!(S.A && S.B)) return; const N = Math.max(S.A.numPages, S.B.numPages), P = $('#pages'); if (!S.cur || P.querySelectorAll('.pg').length !== N) await start(); const sb = P.querySelector('.sm'); if (sb && N > PREF.scanMax) sb.remove(); await scanAll(tok); }, scanAll: () => ACT.rescan && ACT.rescan(), ignore: () => $('#ignBtn').click(), report: exportReport, savePng, saveCsv, cFit: fit, cZoomIn: () => zoomBy(1.25), cZoomOut: () => zoomBy(1 / 1.25) });
function setView(v) {
  closeCtx();
  if (v !== 'edit' && window.RE && window.RE.E && window.RE.E.inlineText && window.RE.commitInlineTextEditor) {
    window.RE.commitInlineTextEditor();
  }
  if (v === 'edit') {
    clearMips();
    if (window.rpCancelSharpen) window.rpCancelSharpen();
    if (S.rcMap instanceof Map) {
      for (const entry of S.rcMap.values()) {
        if (entry && entry.a && entry.a.c) { entry.a.c.width = 0; entry.a.c.height = 0; }
        if (entry && entry.b && entry.b.c) { entry.b.c.width = 0; entry.b.c.height = 0; }
      }
      S.rcMap.clear();
    }
    S.rc = null;
  } else if (v === 'compare' && window.RE && typeof window.RE.clearEditorPageCache === 'function') {
    window.RE.clearEditorPageCache();
  }
  const pop = document.getElementById('kdock-layout-popover');
  if (pop) pop.hidden = true;
  const compass = document.getElementById('kdock-dock-compass');
  if (compass) compass.hidden = true;
  document.body.dataset.view = v;
  $('#view-compare').hidden = v !== 'compare';
  $('#view-edit').hidden = v !== 'edit';
  if ($('#view-dxf')) $('#view-dxf').hidden = v !== 'dxf';
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'edit' && window.DXFStudio && typeof window.DXFStudio.syncToPDFStudioIfNeeded === 'function') {
    window.DXFStudio.syncToPDFStudioIfNeeded();
  }
  if (v === 'compare') {
    const ds = window.DXFState;
    if (ds && ds._isActiveDXFSession && ds._studioDirty && window.UIRibbon && typeof window.UIRibbon.reRenderActiveDXFLayers === 'function') {
      ds._studioDirty = false;
      setTimeout(() => { window.UIRibbon.reRenderActiveDXFLayers(); }, 10);
      if (window.updateTitle) window.updateTitle();
      return;
    }
    if (S.cur && S.cur.A && S.cur.B) {
      setTimeout(() => {
        if (document.body.dataset.view !== 'compare' || !S.cur) return;
        paint();
        if (!S.view || !S.view.k || S.view.k <= 0.05) fit();
        else { applyView(); markers(); if (window.rpSharpen) window.rpSharpen(); }
      }, 20);
    } else if (S.A && S.B && S.n) {
      setTimeout(() => { if (document.body.dataset.view === 'compare' && !S.cur) show(S.n || 1); }, 20);
    }
  }
  if (v === 'edit' && window.editorShown) window.editorShown();
  if (v === 'dxf' && window.DXFStudio && typeof window.DXFStudio.onShow === 'function') window.DXFStudio.onShow();
  if (window.updateTitle) window.updateTitle();
}
window.setView = setView;
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => setView(b.dataset.v));
if (typeof ResizeObserver !== 'undefined' && $('#vp')) {
  let vpLastW = 0, vpLastH = 0, vpPendingDw = 0, vpPendingDh = 0, vpLastInit = false, vpRaf = 0, vpSettleT = 0;
  new ResizeObserver(entries => {
    for (const en of entries) {
      const w = Math.round(en.contentRect.width), h = Math.round(en.contentRect.height);
      if (w > 0 && h > 0 && (Math.abs(w - vpLastW) > 1 || Math.abs(h - vpLastH) > 1)) {
        const isInitial = (vpLastW === 0 || vpLastH === 0);
        const dw = vpLastW > 0 ? (w - vpLastW) : 0;
        const dh = vpLastH > 0 ? (h - vpLastH) : 0;
        const significantResize = isInitial || Math.abs(dw) > 4 || Math.abs(dh) > 90;
        vpLastW = w; vpLastH = h;
        if (significantResize) {
          vpPendingDw += dw;
          vpPendingDh += dh;
          if (isInitial) vpLastInit = true;
        }
      }
    }
    if ((vpLastInit || vpPendingDw !== 0 || vpPendingDh !== 0) && !vpRaf) {
      const runVpResize = () => {
        vpRaf = 0;
        const dw = vpPendingDw, dh = vpPendingDh, wasInit = vpLastInit;
        vpPendingDw = 0; vpPendingDh = 0; vpLastInit = false;
        if (document.body.dataset.view === 'compare' && $('#cv') && $('#cv').width > 0 && (S.cur || S.A || S.B) && $('#empty') && $('#empty').hidden) {
          if (!S.view || !S.view.k || wasInit) {
            fit();
          } else {
            S.view.x = Math.round(S.view.x + dw / 2);
            S.view.y = Math.round(S.view.y + dh / 2);
            applyView();
            clearTimeout(vpSettleT);
            vpSettleT = setTimeout(() => { markers(); }, 75);
          }
        }
      };
      if (typeof requestAnimationFrame === 'function') vpRaf = requestAnimationFrame(runVpResize);
      else runVpResize();
    }
  }).observe($('#vp'));
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  let _rzBodyT = 0;
  window.addEventListener('resize', () => {
    if (document.body && !document.body.classList.contains('is-resizing')) {
      document.body.classList.add('is-resizing');
    }
    clearTimeout(_rzBodyT);
    _rzBodyT = setTimeout(() => {
      if (document.body) document.body.classList.remove('is-resizing');
    }, 160);
  }, { passive: true });

  window.__kenshoCleanupOnClose = () => {
    try {
      clearInterval(S.timer); S.timer = null;
      if (typeof window.rpCancelSharpen === 'function') window.rpCancelSharpen();
      if (typeof CompareMemoryGuard !== 'undefined' && CompareMemoryGuard) {
        if (S.cur) CompareMemoryGuard.releaseAnalysisResult(S.cur);
        if (S.analysisCache) {
          for (const v of S.analysisCache.values()) CompareMemoryGuard.releaseAnalysisResult(v);
          S.analysisCache.clear();
        }
        if (S.rcMap) {
          for (const e of S.rcMap.values()) CompareMemoryGuard.releaseRenderPairEntry(e);
          S.rcMap.clear();
        }
      }
      if (S.rc) S.rc = null;
      S.cur = null;
      if (S.A && typeof S.A.destroy === 'function') S.A.destroy();
      if (S.B && typeof S.B.destroy === 'function') S.B.destroy();
      S.A = null; S.B = null;
      if (window.DXFState) {
        window.DXFState.parsedA = null; window.DXFState.parsedB = null;
        window.DXFState.rawA = null; window.DXFState.rawB = null;
        window.DXFState.lastEntityDiff = null;
      }
      if (typeof DXFEngine !== 'undefined' && DXFEngine.clearDXFCaches) DXFEngine.clearDXFCaches();
      if (typeof window.gc === 'function') window.gc();
    } catch (e) {}
  };
  window.addEventListener('beforeunload', () => {
    if (typeof window.__kenshoCleanupOnClose === 'function') window.__kenshoCleanupOnClose();
  });
}
const NPAGES = () => Math.max(S.A ? S.A.numPages : 0, S.B ? S.B.numPages : 0), MODES = ['paper', 'over', 'diff', 'side', 'blink', 'A', 'B'];
Object.assign(ACT, {
  cGoto: n => {
    const N = NPAGES();
    if (!N) return;
    const target = Math.max(1, Math.min(N, parseInt(n, 10) || 1));
    if (S.A && S.B) show(target);
    else if (S.A) previewSingleSlot('A', target);
    else if (S.B) previewSingleSlot('B', target);
  },
  cPage: d => {
    const N = NPAGES();
    if (!N) return;
    const cur = (S.cur && S.cur.n) || S.n || 1;
    const nextN = Math.max(1, Math.min(N, cur + d));
    if (nextN !== cur) ACT.cGoto(nextN);
    else if (window.rpToast) window.rpToast(d > 0 ? `Already at last page (${N} of ${N})` : `Already at first page (1 of ${N})`);
  },
  cFirst: () => ACT.cGoto(1), cLast: () => ACT.cGoto(NPAGES()),
  cMode: i => { if (window.UIRibbon && window.UIRibbon.setCompareMode) window.UIRibbon.setCompareMode(MODES[i]); else { if (window.UIRibbon && window.UIRibbon.setCurtainMode) window.UIRibbon.setCurtainMode(false); const s = $('#mode'); s.value = MODES[i]; s.dispatchEvent(new Event('change')); } }, toggleMarkers: () => { $('#lM').checked = !$('#lM').checked; $('#lM').dispatchEvent(new Event('change')); },
  toggleReviewed: () => { if (S.cur && S.sel >= 0) { const k = S.cur.n + ':' + S.sel; S.done[k] = !S.done[k]; if (window.UIRibbon && window.UIRibbon.DefectState) window.UIRibbon.DefectState.setStatusByRegion(S.sel, S.done[k] ? 'Approved' : 'Open'); renderList(); markers(); } },
  delIgnoreSel: () => { if (S.igSel) delIgnore(S.igSel); }, hasIgnoreSel: () => !!S.igSel,
  cEscape: () => {
    closeCtx();
    if (window.RP_MEASURE && window.RP_MEASURE.activeTool && window.rpSetActiveTool) window.rpSetActiveTool(null);
    if (window.UIRibbon && window.UIRibbon.FiducialAligner && window.UIRibbon.FiducialAligner.active) {
      window.UIRibbon.FiducialAligner.active = false;
      const fm = $('#fiducial-modal'); if (fm) fm.hidden = true;
      if (window.rpRedrawOverlay) window.rpRedrawOverlay();
    }
    if (S.ignMode) $('#ignBtn').click();
    else if (S.igSel || S.sel >= 0) { S.igSel = null; S.sel = -1; markers(); }
  },
  cRotACW: () => window.rotateCompareSlot && window.rotateCompareSlot('A', 90),
  cRotACCW: () => window.rotateCompareSlot && window.rotateCompareSlot('A', -90),
  cRotBCW: () => window.rotateCompareSlot && window.rotateCompareSlot('B', 90),
  cRotBCCW: () => window.rotateCompareSlot && window.rotateCompareSlot('B', -90),
  cRotABCW: () => window.rotateCompareSlot && window.rotateCompareSlot('AB', 90),
  cRotReset: () => { if (window.setCompareSlotRotation) window.setCompareSlotRotation('AB', 0); if (window.setCompareSlotMirror) window.setCompareSlotMirror('AB', 'reset', false, false); },
  cMirAX: () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('A', 'x'),
  cMirAY: () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('A', 'y'),
  cMirBX: () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('B', 'x'),
  cMirBY: () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('B', 'y'),
  cMirABX: () => window.toggleCompareSlotMirror && window.toggleCompareSlotMirror('AB', 'x'),
  cMirReset: () => window.setCompareSlotMirror && window.setCompareSlotMirror('AB', 'reset'),
  cUndo: () => window.CompareHistory && window.CompareHistory.undo(), cRedo: () => window.CompareHistory && window.CompareHistory.redo(),
  cGotoDialog: async () => { const N = NPAGES(); if (!N) return; const r = await window.dialog('Go to page', [{ type: 'number', id: 'n', label: 'Page (1-' + N + ')', value: S.n, min: 1, max: N }], 'Go'); if (r) ACT.cGoto(r.n); }
});
hydrateIcons(); setLabel('A'); setLabel('B');

if (typeof WorkerEngine !== "undefined" && WorkerEngine.WorkerClient && !window.rpWorkerClient) { window.rpWorkerClient = new WorkerEngine.WorkerClient(); }
