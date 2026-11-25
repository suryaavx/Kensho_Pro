/* ============================================================================
 * [MODULE SECTION: PDF MARKUP STUDIO, INLINE TEXT/TABLE EDITOR & PAGE OPS (editor.js)]
 * WHAT THIS IS: Core PDF Studio engine handling high-DPI page rendering, ordered
 *   multi-selection, inline text/table/equation editing, redline markups, and PDF-Lib commits.
 * WHY / HOW TO EDIT: Edit `RE` methods or `ACT` handlers below to add new PDF
 *   annotation types, page transformations, or inline formatting tools.
 * ============================================================================ */
(() => {
const { PDFDocument, StandardFonts, rgb, degrees, LineCapStyle, PDFName, PDFString, PDFHexString, PDFArray, PDFDict, PDFRef } = PDFLib;
const $ = s => document.querySelector(s);
const E = {
  bytes: null, doc: null, n: 0, cur: 0, zoom: 1, tool: 'select',
  ann: {}, annUndo: [], annRedo: [], clip: null,
  sel: null, multiSel: [], wordItems: [], multiSelJoiner: ' ', multiSelKeepOrder: true, hist: [], name: 'document.pdf', pages: new Set(),
  vp: null, img: null, tmp: null, polyPts: [], drag: null, pan: null, erasing: false,
  eraserMode: 'object', eraserCur: null, nextPinNum: 1, toolSettings: {},
  tok: 0, comments: [], selC: null, d: 1, stamp: null, path: null, savedBytes: null,
  redo: [], meas: {}, confirmed: false, customFonts: {}
};
Object.defineProperty(E, 'E', { get: () => E, enumerable: false });
const F = { q: '', hits: [], i: -1, run: 0 };
const st = t => { const el = $('#est'); if (el) el.textContent = t; };
const LOAD = { updateMetadata: false };
const clampEdZoom = z => Math.max(0.05, Math.min(64.0, Number.isFinite(z) && z > 0 ? z : 1.0));
const K = () => clampEdZoom(E.zoom) * 4 / 3, DPR = () => Math.max(1, window.devicePixelRatio || 1);
const BASE = 0.85; // text baseline offset in em
const hexRgb = h => {
  h = String(h || '#000000'); if (/^#[0-9a-f]{3}$/i.test(h)) h = '#' + [...h.slice(1)].map(c => c + c).join('');
  if (!/^#[0-9a-f]{6}$/i.test(h)) h = '#000000';
  return rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
};
const baseName = () => E.name.replace(/\.pdf$/i, '');
function safeText(font, s) { let o = ''; for (const ch of String(s)) { if (ch === '\n') { o += ch; continue; } try { font.encodeText(ch); o += ch; } catch (e) { o += '?'; } } return o; }
function canEncodeAll(font, s) {
  for (const ch of String(s || '')) {
    if (ch === '\n' || ch === '\r') continue;
    try { font.encodeText(ch); } catch (e) { return false; }
  }
  return true;
}

const MULTILINGUAL_FALLBACK_FONTS = '"Noto Sans", "Noto Sans JP", "Noto Sans SC", "Noto Sans TC", "Noto Sans KR", "Noto Sans Arabic", "Noto Sans Hebrew", "Noto Sans Thai", "Noto Sans Bengali", "Noto Sans Devanagari", "Noto Sans Gujarati", "Noto Sans Gurmukhi", "Noto Sans Kannada", "Noto Sans Malayalam", "Noto Sans Oriya", "Noto Sans Tamil", "Noto Sans Telugu", "Hiragino Sans", "Yu Gothic", "Meiryo", "Microsoft YaHei", "PingFang SC", "Microsoft JhengHei", "Malgun Gothic", "Nirmala UI", "Segoe UI", Arial, sans-serif';

async function drawPdfTextOrSprite(doc, page, font, rawText, opts = {}) {
  const str = String(rawText ?? '');
  if (!str) return;
  const sz = opts.size || 10;
  const x = opts.x || 0;
  const y = opts.y || 0;
  const color = opts.color || rgb(0, 0, 0);
  const opacity = opts.opacity != null ? opts.opacity : 1;
  const rotate = opts.rotate;
  if (canEncodeAll(font, str) || typeof document === 'undefined') {
    page.drawText(safeText(font, str), {
      x, y, size: sz, font, color, opacity,
      ...(rotate !== undefined ? { rotate } : {})
    });
    return;
  }
  try {
    const scale = 4;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    const weight = opts.bold ? 'bold ' : (opts.italic ? 'italic ' : '');
    const fontCss = `${weight}${Math.max(8, sz * scale)}px ${MULTILINGUAL_FALLBACK_FONTS}`;
    ctx.font = fontCss;
    const m = ctx.measureText(str);
    const wPx = Math.max(16, Math.ceil((m.width || (str.length * sz * scale * 0.85)) + sz * scale * 0.6));
    const hPx = Math.max(16, Math.ceil(sz * scale * 1.65));
    cv.width = wPx;
    cv.height = hPx;
    const ctx2 = cv.getContext('2d');
    ctx2.clearRect(0, 0, wPx, hPx);
    ctx2.font = fontCss;
    ctx2.textBaseline = 'alphabetic';
    const rC = Math.round((color.red ?? 0) * 255);
    const gC = Math.round((color.green ?? 0) * 255);
    const bC = Math.round((color.blue ?? 0) * 255);
    ctx2.fillStyle = `rgb(${rC},${gC},${bC})`;
    const padX = sz * scale * 0.12;
    const baseLineY = hPx * 0.76;
    ctx2.fillText(str, padX, baseLineY);
    const dataUrl = cv.toDataURL('image/png');
    cv.width = 0; cv.height = 0;
    const b64 = dataUrl.split(',')[1] || '';
    const bin = atob(b64);
    const raw = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
    const pngImg = await doc.embedPng(raw);
    const wPt = wPx / scale;
    const hPt = hPx / scale;
    page.drawImage(pngImg, {
      x: x - (padX / scale),
      y: y - (hPt * 0.24),
      width: wPt,
      height: hPt,
      opacity,
      ...(rotate !== undefined ? { rotate } : {})
    });
  } catch (err) {
    page.drawText(safeText(font, str), {
      x, y, size: sz, font, color, opacity,
      ...(rotate !== undefined ? { rotate } : {})
    });
  }
}

// ---------- Rich Font Catalog & CSS Stack Resolver ----------
const FONT_STACKS = {
  'Helvetica': 'Helvetica, Arial, "Segoe UI", sans-serif',
  'Arial': 'Arial, Helvetica, sans-serif',
  'Arial Narrow': '"Arial Narrow", Arial, Helvetica, sans-serif',
  'Arial Black': '"Arial Black", Impact, Arial, sans-serif',
  'Calibri': 'Calibri, Candara, "Segoe UI", Optima, sans-serif',
  'Calibri Light': '"Calibri Light", Calibri, "Segoe UI Light", sans-serif',
  'Aptos': 'Aptos, Calibri, "Segoe UI", Inter, sans-serif',
  'Segoe UI': '"Segoe UI", Inter, system-ui, sans-serif',
  'Segoe UI Semibold': '"Segoe UI Semibold", "Segoe UI", sans-serif',
  'Verdana': 'Verdana, Geneva, sans-serif',
  'Tahoma': 'Tahoma, Geneva, Verdana, sans-serif',
  'Trebuchet MS': '"Trebuchet MS", "Lucida Grande", sans-serif',
  'Century Gothic': '"Century Gothic", Futura, "Avant Garde", sans-serif',
  'Candara': 'Candara, Calibri, Optima, sans-serif',
  'Corbel': 'Corbel, "Lucida Grande", "Segoe UI", sans-serif',
  'Franklin Gothic Medium': '"Franklin Gothic Medium", "Arial Narrow", Arial, sans-serif',
  'Gill Sans MT': '"Gill Sans MT", "Gill Sans", Calibri, sans-serif',
  'Bahnschrift': 'Bahnschrift, "DIN Alternate", "Franklin Gothic Medium", sans-serif',
  'Impact': 'Impact, Haettenschweiler, "Arial Black", sans-serif',
  'Times': '"Times New Roman", Times, Georgia, serif',
  'Cambria': 'Cambria, Georgia, "Times New Roman", serif',
  'Cambria Math': '"Cambria Math", Cambria, "Latin Modern Math", "STIX Two Math", "Times New Roman", serif',
  'Georgia': 'Georgia, "Times New Roman", Times, serif',
  'Garamond': 'Garamond, Baskerville, "Times New Roman", serif',
  'Palatino': '"Palatino Linotype", "Book Antiqua", Palatino, serif',
  'Book Antiqua': '"Book Antiqua", Palatino, "Palatino Linotype", serif',
  'Bookman Old Style': '"Bookman Old Style", Bookman, Georgia, serif',
  'Constantia': 'Constantia, Georgia, "Times New Roman", serif',
  'Baskerville': 'Baskerville, "Baskerville Old Face", Garamond, serif',
  'Didot': 'Didot, "Bodoni MT", "Times New Roman", serif',
  'Bodoni MT': '"Bodoni MT", Didot, "Times New Roman", serif',
  'Rockwell': 'Rockwell, "Courier Bold", Georgia, serif',
  'Courier': '"Courier New", Courier, monospace',
  'Consolas': 'Consolas, "Liberation Mono", Menlo, Courier, monospace',
  'Cascadia Code': '"Cascadia Code", Consolas, "JetBrains Mono", monospace',
  'Cascadia Mono': '"Cascadia Mono", Consolas, monospace',
  'Lucida Console': '"Lucida Console", Monaco, Consolas, monospace',
  'Monaco': 'Monaco, Consolas, "Lucida Console", monospace',
  'OCR A Extended': '"OCR A Extended", "OCR-A", Consolas, monospace',
  'ISOCPEUR': 'ISOCPEUR, "ISOCTEUR", Consolas, "Segoe UI", monospace',
  'Brush Script MT': '"Brush Script MT", "Segoe Script", cursive',
  'Segoe Script': '"Segoe Script", "Brush Script MT", cursive',
  'Segoe Print': '"Segoe Print", "Bradley Hand", cursive',
  'Lucida Handwriting': '"Lucida Handwriting", "Brush Script MT", cursive',
  'Comic Sans MS': '"Comic Sans MS", "Chalkboard SE", cursive',
  'Copperplate Gothic': '"Copperplate Gothic Light", Copperplate, serif',
  'Papyrus': 'Papyrus, fantasy, serif',
  'Noto Sans JP': '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Meiryo", "MS PGothic", sans-serif',
  'Meiryo': '"Meiryo", "Yu Gothic", "Hiragino Sans", "Noto Sans JP", sans-serif',
  'Yu Gothic': '"Yu Gothic", "Meiryo", "Hiragino Sans", "Noto Sans JP", sans-serif',
  'Noto Sans SC': '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "SimHei", "Heiti SC", sans-serif',
  'Microsoft YaHei': '"Microsoft YaHei", "Noto Sans SC", "PingFang SC", "SimSun", sans-serif',
  'Noto Sans TC': '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "PMingLiU", sans-serif',
  'Noto Sans KR': '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", "Dotum", sans-serif',
  'Malgun Gothic': '"Malgun Gothic", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif',
  'Noto Sans Tamil': '"Noto Sans Tamil", "Latha", "Tamil Sangam MN", "Nirmala UI", sans-serif',
  'Noto Sans Devanagari': '"Noto Sans Devanagari", "Nirmala UI", "Mangal", "Kohinoor Devanagari", sans-serif',
  'Noto Sans Bengali': '"Noto Sans Bengali", "Vrinda", "Bangla Sangam MN", "Nirmala UI", sans-serif',
  'Noto Sans Gujarati': '"Noto Sans Gujarati", "Shruti", "Gujarati Sangam MN", "Nirmala UI", sans-serif',
  'Noto Sans Gurmukhi': '"Noto Sans Gurmukhi", "Raavi", "Gurmukhi MN", "Nirmala UI", sans-serif',
  'Noto Sans Kannada': '"Noto Sans Kannada", "Tunga", "Kannada Sangam MN", "Nirmala UI", sans-serif',
  'Noto Sans Malayalam': '"Noto Sans Malayalam", "Kartika", "Malayalam Sangam MN", "Nirmala UI", sans-serif',
  'Noto Sans Oriya': '"Noto Sans Oriya", "Kalinga", "Oriya Sangam MN", "Nirmala UI", sans-serif',
  'Noto Sans Telugu': '"Noto Sans Telugu", "Gautami", "Telugu Sangam MN", "Nirmala UI", sans-serif',
  'Noto Sans Thai': '"Noto Sans Thai", "Leelawadee UI", "Thonburi", "Tahoma", sans-serif',
  'Noto Sans Hebrew': '"Noto Sans Hebrew", "Arial Hebrew", "Segoe UI", "Tahoma", sans-serif',
  'Noto Sans Arabic': '"Noto Sans Arabic", "Segoe UI", "Tahoma", "Geeza Pro", sans-serif'
};
const cssFam = f => {
  const base = (!f ? FONT_STACKS.Helvetica : (FONT_STACKS[f] || `"${String(f).replace(/"/g, '')}", Helvetica, Arial, sans-serif`));
  return `${base}, ${MULTILINGUAL_FALLBACK_FONTS}`;
};
function getFontOptionsList() {
  const base = Object.keys(FONT_STACKS).map(k => ({ label: k === 'Times' ? 'Times New Roman' : (k === 'Courier' ? 'Courier New' : k), value: k }));
  for (const customName of Object.keys(E.customFonts || {})) {
    base.push({ label: `${customName} (Custom Loaded Font)`, value: customName });
  }
  return base;
}

async function loadCustomFontFile() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.ttf,.otf,.woff,.woff2';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    try {
      const rawName = f.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ').trim() || 'CustomFont';
      const buf = await f.arrayBuffer();
      if (typeof FontFace !== 'undefined') {
        const face = new FontFace(rawName, buf);
        await face.load();
        document.fonts.add(face);
      }
      E.customFonts[rawName] = new Uint8Array(buf);
      const grp = $('#eCustomFontGroup');
      const sel = $('#eFontFam');
      if (sel) {
        if (grp) {
          grp.hidden = false;
          if (![...grp.options].some(o => o.value === rawName)) {
            grp.appendChild(new Option(`${rawName} (Custom)`, rawName));
          }
        } else {
          sel.add(new Option(`${rawName} (Custom)`, rawName));
        }
        sel.value = rawName;
      }
      if (E.sel && E.sel.t === 'text') {
        pushAnnState('Change font family');
        E.sel.fam = rawName;
        overlay();
      }
      st(`Loaded custom font "${rawName}" — ready for text annotations!`);
      if (window.rpToast) window.rpToast(`Loaded custom font: ${rawName}`);
    } catch (err) {
      st('Could not load font file: ' + (err.message || err));
    }
  };
  inp.click();
}

// ---------- Snapshot-Based Annotation Undo / Redo ----------
function cloneAnns(map) {
  const out = {};
  for (const k of Object.keys(map || {})) {
    out[k] = (map[k] || []).map(a => ({
      ...a,
      _loadingImg: false,
      pts: a.pts ? a.pts.map(p => [...p]) : undefined,
      tableSpec: a.tableSpec ? JSON.parse(JSON.stringify(a.tableSpec)) : undefined
    }));
  }
  return out;
}
function pushAnnState(label = 'Edit annotation') {
  E.annUndo.push({
    label,
    ann: cloneAnns(E.ann),
    meas: cloneAnns(E.meas)
  });
  if (E.annUndo.length > 15) E.annUndo.shift();
  E.annRedo = [];
}

function updateDocInspector() {
  const nm = $('#eInfoName'), sub = $('#eInfoSub'), dim = $('#eInfoDim'), pgs = $('#eInfoPages'), sz = $('#eInfoSize'), an = $('#eInfoAnnots');
  if (!nm) return;
  if (!E.bytes || !E.doc) {
    nm.textContent = 'No Document Loaded';
    if (sub) sub.textContent = 'Open or drop a PDF to inspect';
    if (dim) dim.textContent = '—';
    if (pgs) pgs.textContent = '0';
    if (sz) sz.textContent = '—';
    if (an) an.textContent = '0';
    return;
  }
  nm.textContent = E.name || 'document.pdf';
  const kb = E.bytes.length / 1024;
  const sizeStr = kb >= 1024 ? (kb / 1024).toFixed(2) + ' MB' : kb.toFixed(0) + ' KB';
  if (sub) sub.textContent = E.path ? String(E.path) : 'In-Memory Studio Buffer';
  if (pgs) pgs.textContent = String(E.n);
  if (sz) sz.textContent = sizeStr;
  const drawnCount = Object.values(E.ann).reduce((acc, l) => acc + (l ? l.length : 0), 0);
  const measCount = Object.values(E.meas).reduce((acc, l) => acc + (l ? l.length : 0), 0);
  const commCount = (E.comments || []).filter(c => !c.irt).length;
  if (an) an.textContent = String(drawnCount + measCount + commCount);
  if (dim && E.vp) {
    const wMm = (E.vp.width * 25.4 / 72).toFixed(0), hMm = (E.vp.height * 25.4 / 72).toFixed(0);
    const wIn = (E.vp.width / 72).toFixed(1), hIn = (E.vp.height / 72).toFixed(1);
    dim.textContent = `${wMm}×${hMm} mm (${wIn}×${hIn}")`;
  }
}

function syncEditorFloatingBars() {
  if (typeof document === 'undefined') return;
  const ev = $('#eview');
  if (!ev) return;
  const osb = $('#rp-ordered-sel-bar');
  if (osb && !osb.hidden) {
    const ow = osb.offsetWidth || 0;
    if (ow > 0) {
      const half = (ow / 2) + 'px';
      osb.style.setProperty('--osb-half-w', half);
      ev.style.setProperty('--osb-half-w', half);
    }
  }
  const hud = $('#e-floating-hud');
  if (hud && !hud.hidden) {
    const hw = hud.offsetWidth || 0;
    if (hw > 0) {
      const half = (hw / 2) + 'px';
      hud.style.setProperty('--hud-half-w', half);
      ev.style.setProperty('--hud-half-w', half);
    }
  }
}

function syncHudBar() {
  const hud = $('#e-floating-hud');
  if (hud) {
    hud.hidden = !E.doc;
    if (typeof ResizeObserver !== 'undefined' && !hud._roAttached) {
      hud._roAttached = true;
      new ResizeObserver(() => syncEditorFloatingBars()).observe(hud);
    }
  }
  const lbl = $('#eHudPageLabel');
  if (lbl) lbl.textContent = `Page ${E.n ? E.cur + 1 : 0} / ${E.n || 0}`;
  const zp = $('#eZoomPreset');
  if (zp) {
    const customOpt = zp.querySelector('#eZoomCustomOpt');
    if (E.fitMode === 'page') {
      if (customOpt) customOpt.remove();
      zp.value = 'page';
    } else if (E.fitMode === 'width') {
      if (customOpt) customOpt.remove();
      zp.value = 'width';
    } else {
      const zStr = String(Math.round(E.zoom * 100) / 100);
      if ([...zp.options].some(o => o.id !== 'eZoomCustomOpt' && o.value === zStr)) {
        if (customOpt) customOpt.remove();
        zp.value = zStr;
      } else {
        let cOpt = customOpt;
        if (!cOpt) {
          cOpt = document.createElement('option');
          cOpt.id = 'eZoomCustomOpt';
          zp.appendChild(cOpt);
        }
        cOpt.value = zStr;
        cOpt.textContent = Math.round(E.zoom * 100) + '%';
        zp.value = zStr;
      }
    }
  }
  if ($('#eHudSelect')) $('#eHudSelect').classList.toggle('on', E.tool === 'select');
  if ($('#eHudHand')) $('#eHudHand').classList.toggle('on', E.tool === 'hand');
  if ($('#eHudNote')) $('#eHudNote').classList.toggle('on', E.tool === 'cnote');
  if ($('#eHudMeasure')) $('#eHudMeasure').classList.toggle('on', E.tool === 'measure');
  syncEditorFloatingBars();
}

// ---------- dialog (with Engineering Symbol Bar support) ----------
const ENG_SYMBOLS = ['Ω', 'µ', '±', '⌀', '°', 'Δ', '≤', '≥', '×', '÷', '✓', '✗', '©', '®', '™', '→'];
function dialog(title, fields, ok = 'OK') {
  document.querySelectorAll('.rp-modal:not(.rp-side-docked)').forEach(el => { if (el.id) el.hidden = true; else el.remove(); });
  return new Promise(res => {
    $('#dT').textContent = title; const box = $('#dB'); box.innerHTML = ''; const els = {};
    let lastTextEl = null;
    fields.forEach(d => {
      if (d.type === 'html') { const p = document.createElement('div'); p.innerHTML = d.label; box.append(p); return; }
      if (d.type === 'note') { const p = document.createElement('div'); p.className = 'nt'; p.textContent = d.label; box.append(p); return; }
      if (d.type === 'symbols') {
        const bar = document.createElement('div');
        bar.className = 'rp-sym-bar';
        bar.innerHTML = `<small style="color:var(--mute2);margin-right:4px">Insert Symbol:</small>` + ENG_SYMBOLS.map(sym => `<button type="button" class="rp-sym-btn" data-sym="${sym}">${sym}</button>`).join('');
        bar.querySelectorAll('.rp-sym-btn').forEach(btn => {
          btn.onclick = () => {
            const target = lastTextEl || box.querySelector('textarea,input[type=text]');
            if (!target) return;
            const s0 = target.selectionStart ?? target.value.length;
            const s1 = target.selectionEnd ?? target.value.length;
            target.value = target.value.slice(0, s0) + btn.dataset.sym + target.value.slice(s1);
            target.focus();
            target.selectionStart = target.selectionEnd = s0 + btn.dataset.sym.length;
          };
        });
        box.append(bar);
        return;
      }
      const l = document.createElement('label'); l.className = 'fl'; l.append(d.label); let el;
      if (d.type === 'select') {
        el = document.createElement('select');
        d.options.forEach(o => el.add(new Option(o.label || o, o.value ?? o)));
        el.value = d.value ?? el.options[0].value;
      } else if (d.type === 'textarea') {
        el = document.createElement('textarea'); el.rows = d.rows || 4; el.value = d.value || '';
        l.style.flexDirection = 'column'; l.style.alignItems = 'stretch';
        lastTextEl = el;
      } else if (d.type === 'pad') {
        el = makePad(); l.style.flexDirection = 'column'; l.style.alignItems = 'stretch';
      } else {
        el = document.createElement('input'); el.type = d.type || 'text';
        if (el.type === 'checkbox') el.checked = !!d.value; else el.value = d.value ?? '';
        if (d.min != null) el.min = d.min; if (d.max != null) el.max = d.max;
        if (el.type === 'number') el.step = d.step != null ? d.step : 'any';
        if (el.type === 'text') lastTextEl = el;
      }
      el.addEventListener('input', () => { el.dataset.userModified = '1'; });
      el.addEventListener('change', () => { el.dataset.userModified = '1'; });
      els[d.id] = { el, d }; l.append(el); box.append(l);
    });
    $('#dO').textContent = ok; $('#dlg').hidden = false;
    const first = box.querySelector('input,textarea,select'); if (first) { first.focus(); try { if (typeof first.setSelectionRange === 'function' && (first.type === 'text' || first.tagName === 'TEXTAREA')) first.setSelectionRange(0, 0); first.scrollLeft = 0; } catch (e) {} }
    const done = v => {
      if (document.activeElement && $('#dlg').contains(document.activeElement) && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      box.querySelectorAll('canvas').forEach(cv => { cv.width = 0; cv.height = 0; });
      box.innerHTML = '';
      $('#dlg').hidden = true; $('#dlg').onclick = null; $('#dF').onsubmit = null; $('#dC').onclick = null; res(v);
    };
    $('#dC').onclick = () => done(null);
    $('#dlg').onclick = ev => { if (ev.target.id === 'dlg') done(null); };
    $('#dF').onsubmit = ev => {
      ev.preventDefault(); const out = { _modified: {} };
      for (const id in els) {
        const { el, d } = els[id];
        out[id] = d.type === 'checkbox' ? el.checked : d.type === 'number' ? +el.value : d.type === 'pad' ? el.getData() : el.value;
        out._modified[id] = el.dataset.userModified === '1';
      }
      done(out);
    };
  });
}
function makePad() {
  const c = document.createElement('canvas'); c.width = 400; c.height = 150; c.className = 'pad'; const x = c.getContext('2d');
  x.lineWidth = 3; x.lineCap = 'round'; x.strokeStyle = '#111'; let down = false, b = null;
  const pt = e => [e.offsetX * c.width / c.clientWidth, e.offsetY * c.height / c.clientHeight];
  c.onpointerdown = e => { down = true; c.setPointerCapture(e.pointerId); const [px, py] = pt(e); x.beginPath(); x.moveTo(px, py); x.lineTo(px + .1, py); x.stroke(); };
  c.onpointermove = e => { if (!down) return; const [px, py] = pt(e); x.lineTo(px, py); x.stroke(); b = b ? [Math.min(b[0], px), Math.min(b[1], py), Math.max(b[2], px), Math.max(b[3], py)] : [px, py, px, py]; };
  c.onpointerup = () => down = false;
  c.getData = () => { if (!b) return null; const m = 6, x0 = Math.max(0, b[0] - m), y0 = Math.max(0, b[1] - m), w = Math.min(c.width, b[2] + m) - x0, h = Math.min(c.height, b[3] + m) - y0; const t = document.createElement('canvas'); t.width = w; t.height = h; t.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h); const url = t.toDataURL('image/png'); t.width = 0; t.height = 0; return url; };
  return c;
}

// ---------- document load / history ----------
function clearEditorPageCache() {
  E._lastRenderKey = null;
  E._lastRenderDoc = null;
  E._tcCache = null;
  const tl = $('#etl');
  if (tl) { tl._renderedDoc = null; tl._renderedPage = -1; }
  if (E._pageCanvasCache instanceof Map) {
    for (const entry of E._pageCanvasCache.values()) {
      if (entry && entry.canvas) { entry.canvas.width = 0; entry.canvas.height = 0; }
    }
    E._pageCanvasCache.clear();
  }
}
async function reload(light) {
  clearEditorPageCache();
  const prevDoc = E.doc;
  let resolvedDoc = null;
  if (E._cachedDoc && E._cachedDocBytes === E.bytes && !E._cachedDoc._destroyed) {
    resolvedDoc = E._cachedDoc;
  } else {
    const newDoc = await pdfjsLib.getDocument({ data: E.bytes.slice() }).promise;
    resolvedDoc = newDoc;
    E._cachedDoc = newDoc;
    E._cachedDocBytes = E.bytes;
  }
  const newDoc = resolvedDoc;
  E.doc = newDoc;
  if (prevDoc && prevDoc !== newDoc) {
    if (E._renderTask && typeof E._renderTask.cancel === 'function') {
      try { E._renderTask.cancel(); } catch (e) {}
      E._renderTask = null;
    }
    const usedInTabs = window.TABS && Array.isArray(window.TABS.list) && window.TABS.list.some(t => t && t._cachedDoc === prevDoc);
    if (!usedInTabs && typeof prevDoc.destroy === 'function') {
      try { prevDoc._destroyed = true; await prevDoc.destroy(); } catch (e) {}
    }
  }
  E.n = E.doc.numPages;
  E.cur = Math.max(0, Math.min(E.cur, E.n - 1)); if (!light) { E.pages = new Set([E.cur]); E.sel = null; E.selC = null; }
  try { E.comments = readComments(await PDFDocument.load(E.bytes, LOAD)); } catch (e) { E.comments = []; }
  renderComments();
  $('#eN').textContent = E.n; $('#esz').textContent = (E.bytes.length / 1024).toFixed(0) + ' KB · ' + E.n + ' page' + (E.n === 1 ? '' : 's');
  $('#eempty').hidden = true; $('#ewrap').hidden = false;
  if ($('#e-floating-hud')) $('#e-floating-hud').hidden = false;
  await Promise.all([light ? refreshActiveThumbs() : thumbs(), renderPage()]);
  updateDocInspector();
  syncHudBar();
}
async function openBytes(bytes, name, path, keepTab) {
  if (window.TABS && !keepTab) window.TABS.beforeOpen();
  window.busy(true);
  try {
    let u8 = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes);
    if (/\.dxf$/i.test(name || '') && (window.dxfBytesToPDF || (typeof DXFEngine !== 'undefined' && DXFEngine.dxfBytesToPDF))) {
      const fn = window.dxfBytesToPDF || DXFEngine.dxfBytesToPDF;
      u8 = await fn(u8);
      name = String(name).replace(/\.[^.]+$/, '') + '.pdf';
      path = null;
    } else if (/\.(png|jpe?g|webp|bmp|gif)$/i.test(name || '') && window.imageBytesToPDF) {
      u8 = await window.imageBytesToPDF(u8, name);
      name = String(name).replace(/\.[^.]+$/, '') + '.pdf';
      path = null;
    }
    E.bytes = u8; E.name = name || 'document.pdf'; E.path = path || null; E.confirmed = false;
    E.hist = []; E.redo = []; E.ann = {}; E.annUndo = []; E.annRedo = []; E.meas = {};
    if (E.faiManager && typeof E.faiManager.clear === 'function') E.faiManager.clear();
    E.cur = 0; E.fitMode = 'page'; E.lastCur = -1; closeFind();
    await reload(); E.savedBytes = E.bytes; st('Opened ' + E.name); window.addRecent(E.name, path, null, E.bytes); if (window.updateTitle) window.updateTitle();
  } catch (e) {
    if (window.TABS && !keepTab && window.TABS.rollbackOpen) window.TABS.rollbackOpen();
    const isPasswordErr = !!(e && (e.name === 'PasswordException' || /password|encrypt/i.test(e.message || '')));
    if (isPasswordErr) {
      const encMsg = 'This document is password-protected or encrypted. Please decrypt or unlock the file before comparing or markup.';
      st(encMsg);
      if (window.showEncryptedPdfNotice) window.showEncryptedPdfNotice(name);
      else if (window.showToast) window.showToast(encMsg, 4500);
    } else {
      const msg = 'Could not open ' + name + ': ' + (e.message || 'invalid or encrypted PDF');
      st(msg);
      if (window.showToast) window.showToast(msg, 4000);
    }
    if (!E.doc) {
      E.bytes = null;
      if ($('#ewrap')) $('#ewrap').hidden = true;
      if ($('#rp-pdf-ruler')) $('#rp-pdf-ruler').hidden = true;
      if ($('#eempty')) $('#eempty').hidden = false;
      if ($('#e-floating-hud')) $('#e-floating-hud').hidden = true;
    }
  }
  finally { window.busy(false); }
}
async function openFile(f) { if (f) openBytes(await f.arrayBuffer(), f.name, f.path); }
const MAX_HIST_BYTES = 24 * 1024 * 1024;
const push = () => {
  E.hist.push(E.bytes);
  if (E.hist.length > 4) E.hist.shift();
  let totalBytes = E.hist.reduce((acc, b) => acc + (b ? b.byteLength : 0), 0);
  while (E.hist.length > 1 && totalBytes > MAX_HIST_BYTES) {
    const dropped = E.hist.shift();
    totalBytes -= (dropped ? dropped.byteLength : 0);
  }
  E.redo = [];
};
async function edit(fn, msg) {
  if (!E.bytes) { st('Open a PDF first.'); return; }
  try {
    await commit(true);
    const doc = await PDFDocument.load(E.bytes, LOAD), out = (await fn(doc)) || doc, nb = await out.save();
    push(); E.bytes = nb; E.ann = {}; E.annUndo = []; E.annRedo = []; await reload(); if (msg) st(msg);
  } catch (e) { st('Error: ' + (e.message || e)); }
}
async function undo() {
  if (E.annUndo.length) {
    const snap = E.annUndo.pop();
    E.annRedo.push({ label: snap.label, ann: cloneAnns(E.ann), meas: cloneAnns(E.meas) });
    E.ann = snap.ann;
    E.meas = snap.meas;
    E.sel = null;
    if (Array.isArray(E.multiSel)) E.multiSel = [];
    overlay(); updateDocInspector(); st(`Undone: ${snap.label}`);
    return;
  }
  if (E.hist.length) {
    E.redo.push(E.bytes);
    E.bytes = E.hist.pop();
    E.ann = {};
    E.meas = {};
    E.annUndo = [];
    E.annRedo = [];
    E.sel = null;
    if (Array.isArray(E.multiSel)) E.multiSel = [];
    await reload();
    st('Undone page operation');
  } else st('Nothing to undo');
}
async function redo() {
  if (E.annRedo.length) {
    const snap = E.annRedo.pop();
    E.annUndo.push({ label: snap.label, ann: cloneAnns(E.ann), meas: cloneAnns(E.meas) });
    E.ann = snap.ann;
    E.meas = snap.meas;
    E.sel = null;
    if (Array.isArray(E.multiSel)) E.multiSel = [];
    overlay(); updateDocInspector(); st(`Redone: ${snap.label}`);
    return;
  }
  if (E.redo.length) {
    E.hist.push(E.bytes);
    E.bytes = E.redo.pop();
    E.ann = {};
    E.meas = {};
    E.annUndo = [];
    E.annRedo = [];
    E.sel = null;
    if (Array.isArray(E.multiSel)) E.multiSel = [];
    await reload();
    st('Redone page operation');
  } else st('Nothing to redo');
}

// ---------- PDF Studio Engineering Options: Align/Distribute, Snap-to-Grid, Lock Markup, Export Page PNG ----------
function getSelectedAnnsForOps() {
  const list = [];
  const pageAnns = new Set([...(E.ann[E.cur] || []), ...(E.meas[E.cur] || [])]);
  if (Array.isArray(E.selAnns) && E.selAnns.length) {
    for (const item of E.selAnns) {
      if (item && pageAnns.has(item) && list.indexOf(item) === -1) list.push(item);
    }
  }
  if (Array.isArray(E.multiSel) && E.multiSel.length) {
    for (const item of E.multiSel) {
      if (item && pageAnns.has(item) && list.indexOf(item) === -1) list.push(item);
    }
  }
  if (E.sel && list.indexOf(E.sel) === -1) list.push(E.sel);
  return list;
}

function getAnnSimpleBounds(a) {
  if (!a) return null;
  if (typeof annBBox === 'function') {
    const bb = annBBox(a);
    if (bb && bb.length >= 4) return { x: bb[0], y: bb[1], w: Math.max(1, bb[2] - bb[0]), h: Math.max(1, bb[3] - bb[1]) };
  }
  const x = Number.isFinite(a.x) ? a.x : (Number.isFinite(a.x1) ? Math.min(a.x1, a.x2 || a.x1) : 0);
  const y = Number.isFinite(a.y) ? a.y : (Number.isFinite(a.y1) ? Math.min(a.y1, a.y2 || a.y1) : 0);
  const w = Number.isFinite(a.w) ? Math.abs(a.w) : (Number.isFinite(a.x2) ? Math.max(1, Math.abs(a.x2 - (a.x1 || 0))) : 24);
  const h = Number.isFinite(a.h) ? Math.abs(a.h) : (Number.isFinite(a.y2) ? Math.max(1, Math.abs(a.y2 - (a.y1 || 0))) : 16);
  return { x, y, w, h };
}

function alignSelectedAnns(mode = 'left') {
  const items = getSelectedAnnsForOps().filter(a => !a.locked);
  if (items.length < 2) {
    st('Select 2 or more unlocked markups (Multi 1·2·3) to align or distribute.');
    return 0;
  }
  if (typeof pushAnnState === 'function') pushAnnState(`Align ${mode}`);
  const boxes = items.map(a => ({ a, b: getAnnSimpleBounds(a) })).filter(x => x.b);
  if (boxes.length < 2) return 0;

  if (mode === 'left') {
    const target = Math.min(...boxes.map(x => x.b.x));
    boxes.forEach(x => moveAnn(x.a, target - x.b.x, 0));
  } else if (mode === 'right') {
    const target = Math.max(...boxes.map(x => x.b.x + x.b.w));
    boxes.forEach(x => moveAnn(x.a, target - (x.b.x + x.b.w), 0));
  } else if (mode === 'centerH') {
    const minX = Math.min(...boxes.map(x => x.b.x));
    const maxX = Math.max(...boxes.map(x => x.b.x + x.b.w));
    const cx = (minX + maxX) / 2;
    boxes.forEach(x => moveAnn(x.a, cx - (x.b.x + x.b.w / 2), 0));
  } else if (mode === 'top') {
    const target = Math.min(...boxes.map(x => x.b.y));
    boxes.forEach(x => moveAnn(x.a, 0, target - x.b.y));
  } else if (mode === 'bottom') {
    const target = Math.max(...boxes.map(x => x.b.y + x.b.h));
    boxes.forEach(x => moveAnn(x.a, 0, target - (x.b.y + x.b.h)));
  } else if (mode === 'centerV') {
    const minY = Math.min(...boxes.map(x => x.b.y));
    const maxY = Math.max(...boxes.map(x => x.b.y + x.b.h));
    const cy = (minY + maxY) / 2;
    boxes.forEach(x => moveAnn(x.a, 0, cy - (x.b.y + x.b.h / 2)));
  } else if (mode === 'distH' && boxes.length >= 3) {
    const sorted = [...boxes].sort((u, v) => u.b.x - v.b.x);
    const first = sorted[0].b.x;
    const last = sorted[sorted.length - 1].b.x;
    const step = (last - first) / (sorted.length - 1);
    sorted.forEach((x, idx) => moveAnn(x.a, (first + step * idx) - x.b.x, 0));
  } else if (mode === 'distV' && boxes.length >= 3) {
    const sorted = [...boxes].sort((u, v) => u.b.y - v.b.y);
    const first = sorted[0].b.y;
    const last = sorted[sorted.length - 1].b.y;
    const step = (last - first) / (sorted.length - 1);
    sorted.forEach((x, idx) => moveAnn(x.a, 0, (first + step * idx) - x.b.y));
  }
  overlay();
  updateDocInspector();
  st(`Aligned ${boxes.length} markup(s): ${mode}`);
  return boxes.length;
}

function toggleSnapGrid(stepPts = 10) {
  E.snapGrid = !E.snapGrid;
  E.snapGridStep = Math.max(2, Number(stepPts) || 10);
  const btn = typeof $ === 'function' ? $('#eSnapGridBtn') : null;
  if (btn) btn.classList.toggle('on', !!E.snapGrid);
  st(`PDF Studio Snap-to-Grid (${E.snapGridStep}pt): ${E.snapGrid ? 'ON' : 'OFF'}`);
  return !!E.snapGrid;
}

function snapCoordToGrid(v) {
  if (!E.snapGrid || !Number.isFinite(v)) return v;
  const step = E.snapGridStep || 10;
  return Math.round(v / step) * step;
}

function toggleLockSelectedAnn() {
  const items = getSelectedAnnsForOps();
  if (!items.length) {
    st('Select a markup first to lock or unlock it.');
    return false;
  }
  if (typeof pushAnnState === 'function') pushAnnState('Toggle Lock Markup');
  const nextLocked = !items.every(a => !!a.locked);
  items.forEach(a => { a.locked = nextLocked; });
  const btn = typeof $ === 'function' ? $('#eLockAnnBtn') : null;
  if (btn) btn.classList.toggle('on', nextLocked);
  overlay();
  st(`${nextLocked ? 'Locked' : 'Unlocked'} ${items.length} markup(s).`);
  return nextLocked;
}

async function exportCurrentPagePNG() {
  const baseCv = document.getElementById('ecv');
  const ovCv = document.getElementById('eov');
  if (!baseCv || !baseCv.width || !baseCv.height) {
    st('Open a PDF page first to export as PNG.');
    return null;
  }
  const out = document.createElement('canvas');
  out.width = baseCv.width;
  out.height = baseCv.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(baseCv, 0, 0);
  if (ovCv && ovCv.width && ovCv.height) ctx.drawImage(ovCv, 0, 0, out.width, out.height);
  const dataUrl = out.toDataURL('image/png');
  const b64 = (dataUrl.split(',')[1]) || '';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pageNum = (typeof E.cur === 'number' ? E.cur + 1 : 1);
  const baseName = (E.name || 'Document').replace(/\.pdf$/i, '') + `_Page_${pageNum}.png`;
  if (typeof window !== 'undefined' && window.native && window.native.saveFile) {
    const saved = await window.native.saveFile({
      name: baseName,
      bytes,
      filters: [{ name: 'PNG Image (.png)', extensions: ['png'] }]
    });
    if (saved) st(`Exported Page ${pageNum} PNG: ${saved}`);
    return saved;
  }
  return bytes;
}

// ---------- annotations ----------
const _scratchCanvas = document.createElement('canvas');
const _scratchCtx = _scratchCanvas.getContext('2d');
function measureTextBox(a) {
  const c = _scratchCtx;
  const sz = a.size || 14;
  const lh = +(a.lineHeight) || 1.22;
  c.font = `${a.italic ? 'italic ' : ''}${a.bold ? 'bold ' : ''}${sz}px ${cssFam(a.fam)}`;
  const ls = String(a.text || '').split('\n');
  const maxW = Math.max(12, ...ls.map(l => c.measureText(l).width));
  const totalH = Math.max(sz * 1.2, ls.length * sz * lh);
  return [maxW, totalH, ls];
}

function applyDash(c, dash, lw, s) {
  if (dash === 'dashed') c.setLineDash([Math.max(5, lw * 3) * s, Math.max(3, lw * 2) * s]);
  else if (dash === 'dotted') c.setLineDash([Math.max(1.5, lw) * s, Math.max(3, lw * 2) * s]);
  else c.setLineDash([]);
}

function roundRectPath(c, x, y, w, h, r) {
  const rx = Math.min(x, x + w), ry = Math.min(y, y + h);
  const rw = Math.abs(w), rh = Math.abs(h);
  const rad = Math.max(0, Math.min(r || 0, rw / 2, rh / 2));
  c.beginPath();
  if (rad > 0 && typeof c.roundRect === 'function') {
    c.roundRect(rx, ry, rw, rh, rad);
  } else if (rad > 0) {
    c.moveTo(rx + rad, ry);
    c.arcTo(rx + rw, ry, rx + rw, ry + rh, rad);
    c.arcTo(rx + rw, ry + rh, rx, ry + rh, rad);
    c.arcTo(rx, ry + rh, rx, ry, rad);
    c.arcTo(rx, ry, rx + rw, ry, rad);
    c.closePath();
  } else {
    c.rect(rx, ry, rw, rh);
  }
}

function fillRoundRect(c, x, y, w, h, r) {
  roundRectPath(c, x, y, w, h, r);
  c.fill();
}

function strokeRoundRect(c, x, y, w, h, r) {
  roundRectPath(c, x, y, w, h, r);
  c.stroke();
}

function drawAnn(c, a, s) {
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  c.globalAlpha = a.op == null ? 1 : a.op;
  c.strokeStyle = c.fillStyle = a.color || '#000';
  const lw = a.size || 2;
  c.lineWidth = lw * s;
  applyDash(c, a.dash, lw, s);

  if (a._editingInline) { c.restore(); return; }
  switch (a.t) {
    case 'text': {
      c.setLineDash([]);
      const sz = a.size || 14;
      const [tw, th, ls] = measureTextBox(a);
      const pad = a.bgBox ? 5 : 0;
      if (a.bgBox) {
        c.save();
        c.fillStyle = a.bgColor || '#fffbeb';
        fillRoundRect(c, (a.x - pad) * s, (a.y - pad * 0.5) * s, (tw + pad * 2) * s, (th + pad) * s, 6 * s);
        c.strokeStyle = a.color || '#e11d48';
        c.lineWidth = 1.2 * s;
        strokeRoundRect(c, (a.x - pad) * s, (a.y - pad * 0.5) * s, (tw + pad * 2) * s, (th + pad) * s, 6 * s);
        c.restore();
      }
      c.font = `${a.italic ? 'italic ' : ''}${a.bold ? 'bold ' : ''}${sz * s}px ${cssFam(a.fam)}`;
      c.fillStyle = a.color || '#000';
      const align = a.align || 'left';
      const lh = +(a.lineHeight) || 1.22;
      ls.forEach((l, i) => {
        const lineW = c.measureText(l).width;
        const lx = align === 'center' ? (a.x * s + (tw * s - lineW) / 2) : align === 'right' ? (a.x * s + tw * s - lineW) : (a.x * s);
        const ly = (a.y + sz * (BASE + i * lh)) * s;
        if (align === 'justify' && i < ls.length - 1 && l.trim().includes(' ') && lineW < tw * s * 0.95) {
          const words = l.trim().split(/\s+/);
          const wordsW = words.reduce((acc, w) => acc + c.measureText(w).width, 0);
          const gap = (tw * s - wordsW) / Math.max(1, words.length - 1);
          let wx = a.x * s;
          words.forEach(w => { c.fillText(w, wx, ly); wx += c.measureText(w).width + gap; });
        } else {
          c.fillText(l, lx, ly);
        }
        if (a.underline) {
          c.beginPath();
          c.lineWidth = Math.max(1, sz * 0.07) * s;
          c.moveTo(lx, ly + sz * 0.12 * s);
          c.lineTo(lx + lineW, ly + sz * 0.12 * s);
          c.stroke();
        }
        if (a.strike) {
          c.beginPath();
          c.lineWidth = Math.max(1, sz * 0.07) * s;
          c.moveTo(lx, ly - sz * 0.3 * s);
          c.lineTo(lx + lineW, ly - sz * 0.3 * s);
          c.stroke();
        }
      });
      break;
    }
    case 'rect': {
      const rRad = Math.min((a.cornerRadius != null ? a.cornerRadius : 6) * s, Math.abs(a.w * s) * 0.22, Math.abs(a.h * s) * 0.22);
      if (a.fill) { c.save(); c.globalAlpha = (a.op == null ? 1 : a.op) * .28; c.fillStyle = a.bgColor || a.color; fillRoundRect(c, a.x * s, a.y * s, a.w * s, a.h * s, rRad); c.restore(); }
      strokeRoundRect(c, a.x * s, a.y * s, a.w * s, a.h * s, rRad);
      break;
    }
    case 'circle': {
      const rx = Math.abs(a.w) / 2 * s, ry = Math.abs(a.h) / 2 * s;
      const cx = (a.x + a.w / 2) * s, cy = (a.y + a.h / 2) * s;
      c.beginPath();
      c.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      if (a.fill) { c.save(); c.globalAlpha = (a.op == null ? 1 : a.op) * .28; c.fillStyle = a.bgColor || a.color; c.fill(); c.restore(); }
      c.stroke();
      break;
    }
    case 'poly': {
      if (!a.pts || a.pts.length < 2) break;
      c.beginPath();
      a.pts.forEach((p, i) => i ? c.lineTo(p[0] * s, p[1] * s) : c.moveTo(p[0] * s, p[1] * s));
      if (a.closed || a.fill) c.closePath();
      if (a.fill && a.pts.length >= 3) { c.save(); c.globalAlpha = (a.op == null ? 1 : a.op) * .25; c.fillStyle = a.bgColor || a.color; c.fill(); c.restore(); }
      c.stroke();
      break;
    }
    case 'checkmk': {
      c.setLineDash([]);
      c.strokeStyle = a.color || '#059669';
      c.lineWidth = Math.max(2.5, (a.w || 22) * 0.14) * s;
      c.beginPath();
      c.moveTo((a.x + a.w * 0.15) * s, (a.y + a.h * 0.55) * s);
      c.lineTo((a.x + a.w * 0.42) * s, (a.y + a.h * 0.82) * s);
      c.lineTo((a.x + a.w * 0.88) * s, (a.y + a.h * 0.18) * s);
      c.stroke();
      break;
    }
    case 'crossmk': {
      c.setLineDash([]);
      c.strokeStyle = a.color || '#e11d48';
      c.lineWidth = Math.max(2.5, (a.w || 22) * 0.14) * s;
      c.beginPath();
      c.moveTo((a.x + a.w * 0.18) * s, (a.y + a.h * 0.18) * s);
      c.lineTo((a.x + a.w * 0.82) * s, (a.y + a.h * 0.82) * s);
      c.moveTo((a.x + a.w * 0.82) * s, (a.y + a.h * 0.18) * s);
      c.lineTo((a.x + a.w * 0.18) * s, (a.y + a.h * 0.82) * s);
      c.stroke();
      break;
    }
    case 'pin': {
      c.setLineDash([]);
      const pw = (a.w || a.size || 24) * s;
      const ph = (a.h || (a.w ? a.w * 1.25 : 30)) * s;
      const cx = (a.x + (a.w || 24) / 2) * s;
      const headCy = a.y * s + pw * 0.45;
      const tipY = a.y * s + ph;
      const r = pw * 0.44;
      c.fillStyle = a.color || '#f59e0b';
      c.strokeStyle = '#ffffff';
      c.lineWidth = Math.max(1.5, pw * 0.07);
      // Teardrop pin head + needle tip
      c.beginPath();
      c.arc(cx, headCy, r, Math.PI * 0.82, Math.PI * 0.18, false);
      c.lineTo(cx, tipY);
      c.closePath();
      c.fill();
      c.stroke();
      // Pin badge label
      const badgeTxt = String(a.pinNum || '1');
      c.fillStyle = '#ffffff';
      c.font = `bold ${Math.max(8, r * 0.95)}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(badgeTxt, cx, headCy);
      // Optional callout tag next to pin
      if (a.text) {
        c.font = `bold ${Math.max(9, pw * 0.42)}px sans-serif`;
        const tw = c.measureText(a.text).width;
        const padX = 5 * s, boxH = Math.max(14 * s, pw * 0.62);
        const bx = cx + r + 4 * s, by = headCy - boxH / 2;
        c.fillStyle = 'rgba(15, 23, 42, 0.9)';
        fillRoundRect(c, bx, by, tw + padX * 2, boxH, 5 * s);
        c.strokeStyle = a.color || '#f59e0b';
        c.lineWidth = 1.2 * s;
        strokeRoundRect(c, bx, by, tw + padX * 2, boxH, 5 * s);
        c.fillStyle = '#f8fafc';
        c.textAlign = 'left';
        c.fillText(a.text, bx + padX, headCy);
      }
      break;
    }
    case 'highlight': c.setLineDash([]); c.globalAlpha = .35; fillRoundRect(c, a.x * s, a.y * s, a.w * s, a.h * s, 4 * s); break;
    case 'whiteout': c.setLineDash([]); c.fillStyle = '#fff'; fillRoundRect(c, a.x * s, a.y * s, a.w * s, a.h * s, 3 * s); break;
    case 'redact': c.setLineDash([]); c.fillStyle = '#000'; fillRoundRect(c, a.x * s, a.y * s, a.w * s, a.h * s, 4 * s); break;
    case 'line': case 'arrow': {
      c.beginPath(); c.moveTo(a.x1 * s, a.y1 * s); c.lineTo(a.x2 * s, a.y2 * s); c.stroke();
      c.setLineDash([]);
      if (a.t === 'arrow') for (const h of arrowHead(a)) { c.beginPath(); c.moveTo(a.x2 * s, a.y2 * s); c.lineTo(h[0] * s, h[1] * s); c.stroke(); }
      break;
    }
    case 'draw':
      c.beginPath(); a.pts.forEach((p, i) => i ? c.lineTo(p[0] * s, p[1] * s) : c.moveTo(p[0] * s, p[1] * s));
      if (a.pts.length === 1) c.lineTo(a.pts[0][0] * s + .1, a.pts[0][1] * s);
      c.stroke();
      break;
    case 'image':
      c.setLineDash([]);
      if (a.equation && typeof drawEquationVectorOnCtx === 'function') {
        drawEquationVectorOnCtx(c, a, s);
      } else if (a.gdtSpec && typeof drawGDTFrameVectorOnCtx === 'function') {
        drawGDTFrameVectorOnCtx(c, a, s);
      } else if (a.img && typeof a.img === 'object' && ('complete' in a.img || (typeof HTMLCanvasElement !== 'undefined' && a.img instanceof HTMLCanvasElement))) {
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.drawImage(a.img, a.x * s, a.y * s, a.w * s, a.h * s);
      } else if (a.dataUrl && !a._loadingImg) {
        a.img = null;
        a._loadingImg = true;
        loadImg(a.dataUrl).then(im => { a.img = im; a._loadingImg = false; overlay(); }).catch(() => { a._loadingImg = false; });
      }
      break;
    case 'stamp':
      c.setLineDash([]);
      c.lineWidth = 3 * s; strokeRoundRect(c, a.x * s, a.y * s, a.w * s, a.h * s, 7 * s);
      c.font = `bold ${(a.fs || 18) * s}px ${cssFam(a.fam || 'Helvetica')}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(a.text, (a.x + a.w / 2) * s, (a.y + a.h / 2) * s);
      break;
    case 'angle': {
      c.setLineDash([]);
      const pts = a.pts || [];
      if (pts.length < 2) break;
      c.strokeStyle = c.fillStyle = a.color || '#8b5cf6';
      c.lineWidth = (a.size || 2) * s;
      c.beginPath();
      c.moveTo(pts[0][0] * s, pts[0][1] * s);
      c.lineTo(pts[1][0] * s, pts[1][1] * s);
      if (pts[2]) c.lineTo(pts[2][0] * s, pts[2][1] * s);
      c.stroke();
      pts.forEach(([px, py]) => { c.beginPath(); c.arc(px * s, py * s, 3.2 * s, 0, Math.PI * 2); c.fill(); });
      if (pts.length >= 3 && typeof MeasureEngine !== 'undefined' && MeasureEngine.calc3PointAngle) {
        const ang = MeasureEngine.calc3PointAngle({ x: pts[0][0], y: pts[0][1] }, { x: pts[1][0], y: pts[1][1] }, { x: pts[2][0], y: pts[2][1] });
        const vx = pts[1][0] * s, vy = pts[1][1] * s;
        c.beginPath();
        c.arc(vx, vy, 22 * s, ang.startAngle, ang.endAngle, false);
        c.stroke();
        const lbl = ang.degrees.toFixed(2) + '°';
        c.font = `700 ${11.5 * s}px "Segoe UI", system-ui, -apple-system, Consolas, sans-serif`;
        const tw = c.measureText(lbl).width;
        const bw = tw + 12 * s, bh = 18 * s;
        const bx = vx - bw / 2, by = vy - 29 * s;
        c.fillStyle = 'rgba(255, 255, 255, 0.96)';
        fillRoundRect(c, bx, by, bw, bh, 5 * s);
        c.strokeStyle = a.color || '#7c3aed';
        c.lineWidth = 1.3 * s;
        strokeRoundRect(c, bx, by, bw, bh, 5 * s);
        c.fillStyle = a.color || '#5b21b6';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(lbl, vx, by + bh / 2);
      }
      break;
    }
    case 'rad3': {
      c.setLineDash([]);
      const pts = a.pts || [];
      if (!pts.length) break;
      c.strokeStyle = c.fillStyle = a.color || '#0284c7';
      c.lineWidth = (a.size || 2) * s;
      pts.forEach(([px, py]) => { c.beginPath(); c.arc(px * s, py * s, 3.2 * s, 0, Math.PI * 2); c.fill(); });
      if (pts.length >= 3 && typeof MeasureEngine !== 'undefined' && MeasureEngine.calc3PointCircle) {
        const cir = MeasureEngine.calc3PointCircle({ x: pts[0][0], y: pts[0][1] }, { x: pts[1][0], y: pts[1][1] }, { x: pts[2][0], y: pts[2][1] });
        if (cir.valid) {
          c.beginPath();
          c.arc(cir.cx * s, cir.cy * s, cir.r * s, 0, Math.PI * 2);
          c.stroke();
          // Center crosshair
          c.beginPath();
          c.moveTo((cir.cx - 5) * s, cir.cy * s); c.lineTo((cir.cx + 5) * s, cir.cy * s);
          c.moveTo(cir.cx * s, (cir.cy - 5) * s); c.lineTo(cir.cx * s, (cir.cy + 5) * s);
          c.stroke();
          const ptsPerIn = E.calPtsPerInch || 72;
          const isEng = window.CAMState && window.CAMState.unitSystem === 'english';
          const diaStr = isEng
            ? `⌀${(cir.diameter * 1000 / ptsPerIn).toFixed(1)} mil (R${(cir.r * 1000 / ptsPerIn).toFixed(1)})`
            : `⌀${(cir.diameter * 25.4 / ptsPerIn).toFixed(2)} mm (R${(cir.r * 25.4 / ptsPerIn).toFixed(2)})`;
          c.font = `700 ${11.5 * s}px "Segoe UI", system-ui, -apple-system, Consolas, sans-serif`;
          const tw = c.measureText(diaStr).width;
          const lx = cir.cx * s, ly = (cir.cy - cir.r - 12) * s;
          const bw = tw + 12 * s, bh = 18.5 * s;
          c.fillStyle = 'rgba(255, 255, 255, 0.97)';
          fillRoundRect(c, lx - bw / 2, ly - bh / 2, bw, bh, 5 * s);
          c.strokeStyle = a.color || '#0284c7';
          c.lineWidth = 1.3 * s;
          strokeRoundRect(c, lx - bw / 2, ly - bh / 2, bw, bh, 5 * s);
          c.fillStyle = '#0369a1';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(diaStr, lx, ly);
        }
      }
      break;
    }
    case 'fai': {
      c.setLineDash([]);
      const r = ((a.w || 24) / 2) * s;
      const cx = (a.x + (a.w || 24) / 2) * s;
      const cy = (a.y + (a.h || 24) / 2) * s;
      c.fillStyle = 'rgba(254, 242, 242, 0.97)';
      c.strokeStyle = a.color || '#dc2626';
      c.lineWidth = 2 * s;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = a.color || '#dc2626';
      c.font = `700 ${Math.max(9 * s, r * 1.05)}px "Segoe UI", system-ui, Consolas, sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(a.charNo || 1), cx, cy);
      if (a.reqText) {
        c.font = `700 ${10 * s}px "Segoe UI", system-ui, sans-serif`;
        const tw = c.measureText(a.reqText).width;
        const bw = tw + 10 * s, bh = 17 * s;
        const bx = cx + r + 4 * s, by = cy - bh / 2;
        c.fillStyle = 'rgba(15, 23, 42, 0.94)';
        fillRoundRect(c, bx, by, bw, bh, 4.5 * s);
        c.strokeStyle = a.color || '#dc2626';
        c.lineWidth = 1.2 * s;
        strokeRoundRect(c, bx, by, bw, bh, 4.5 * s);
        c.fillStyle = '#f8fafc';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(a.reqText, bx + 5 * s, cy);
      }
      break;
    }
    case 'cal':
    case 'meas': {
      c.setLineDash(a.t === 'cal' ? [4 * s, 3 * s] : []);
      const strokeCol = a.t === 'cal' ? '#d97706' : (a.color || '#0066ff');
      c.strokeStyle = c.fillStyle = strokeCol;
      c.lineWidth = 1.75 * s;
      c.beginPath();
      c.moveTo(a.x1 * s, a.y1 * s);
      c.lineTo(a.x2 * s, a.y2 * s);
      c.stroke();
      c.setLineDash([]);
      [[a.x1, a.y1], [a.x2, a.y2]].forEach(([px, py]) => { c.beginPath(); c.arc(px * s, py * s, 3.2 * s, 0, Math.PI * 2); c.fill(); });
      const len = Math.hypot(a.x2 - a.x1, a.y2 - a.y1), isEng = window.CAMState && window.CAMState.unitSystem === 'english';
      const ptsPerIn = E.calPtsPerInch || 72;
      const t = a.t === 'cal'
        ? `${len.toFixed(1)} pt (Release to Calibrate Scale)`
        : (isEng ? ((len * 1000 / ptsPerIn).toFixed(1) + ' mil (' + (len * 25.4 / ptsPerIn).toFixed(2) + ' mm)') : ((len * 25.4 / ptsPerIn).toFixed(2) + ' mm (' + (len * 1000 / ptsPerIn).toFixed(1) + ' mil)'));
      c.font = `700 ${11.5 * s}px "Segoe UI", system-ui, -apple-system, Consolas, sans-serif`;
      const tw = c.measureText(t).width;
      const mx = (a.x1 + a.x2) / 2 * s;
      const my = (a.y1 + a.y2) / 2 * s - 11 * s;
      const bw = tw + 13 * s, bh = 18.5 * s;
      const bx = mx - bw / 2, by = my - bh / 2;
      c.fillStyle = 'rgba(255, 255, 255, 0.97)';
      fillRoundRect(c, bx, by, bw, bh, 5 * s);
      c.strokeStyle = strokeCol;
      c.lineWidth = 1.3 * s;
      strokeRoundRect(c, bx, by, bw, bh, 5 * s);
      c.fillStyle = a.t === 'cal' ? '#b45309' : '#0044cc';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(t, mx, my);
      break;
    }
    case 'area': {
      const pts = a.pts || [];
      if (!pts.length) break;
      c.setLineDash([5 * s, 3 * s]);
      c.strokeStyle = a.color || '#10b981';
      c.lineWidth = Math.max(1.5, (a.size || 2) * s);
      c.beginPath();
      pts.forEach((p, i) => i ? c.lineTo(p[0] * s, p[1] * s) : c.moveTo(p[0] * s, p[1] * s));
      if (pts.length >= 3) {
        c.closePath();
        c.fillStyle = 'rgba(16, 185, 129, 0.18)';
        c.fill();
      }
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = a.color || '#10b981';
      pts.forEach(([px, py]) => { c.beginPath(); c.arc(px * s, py * s, 3.2 * s, 0, Math.PI * 2); c.fill(); });
      if (pts.length >= 3) {
        let sum = 0, perim = 0, cx = 0, cy = 0;
        for (let i = 0; i < pts.length; i++) {
          const j = (i + 1) % pts.length;
          sum += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
          perim += Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
          cx += pts[i][0]; cy += pts[i][1];
        }
        const areaPt2 = Math.abs(sum) / 2;
        cx = (cx / pts.length) * s; cy = (cy / pts.length) * s;
        const ptsPerIn = E.calPtsPerInch || 72;
        const isEng = window.CAMState && window.CAMState.unitSystem === 'english';
        const areaMM2 = areaPt2 * Math.pow(25.4 / ptsPerIn, 2);
        const areaIn2 = areaPt2 / (ptsPerIn * ptsPerIn);
        const perimMM = perim * (25.4 / ptsPerIn);
        const perimMil = perim * (1000 / ptsPerIn);
        const lbl = isEng
          ? `Area: ${areaIn2.toFixed(3)} in² (${areaMM2.toFixed(1)} mm²) · P: ${perimMil.toFixed(0)} mil`
          : `Area: ${areaMM2.toFixed(1)} mm² (${areaIn2.toFixed(3)} in²) · P: ${perimMM.toFixed(1)} mm`;
        c.font = `700 ${11.2 * s}px "Segoe UI", system-ui, -apple-system, Consolas, sans-serif`;
        const tw = c.measureText(lbl).width;
        const bw = tw + 14 * s, bh = 19 * s;
        c.fillStyle = 'rgba(15, 23, 42, 0.95)';
        fillRoundRect(c, cx - bw / 2, cy - bh / 2, bw, bh, 5 * s);
        c.strokeStyle = a.color || '#10b981';
        c.lineWidth = 1.3 * s;
        strokeRoundRect(c, cx - bw / 2, cy - bh / 2, bw, bh, 5 * s);
        c.fillStyle = '#34d399';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(lbl, cx, cy);
      }
      break;
    }
    case 'crect': c.globalAlpha = .25; c.fillRect(a.x * s, a.y * s, a.w * s, a.h * s); c.globalAlpha = 1; c.setLineDash([5 * s, 4 * s]); c.lineWidth = 1.5 * s; c.strokeRect(a.x * s, a.y * s, a.w * s, a.h * s); break;
    case 'cloud': {
      c.setLineDash([]);
      const pts = [{ x: a.x * s, y: a.y * s }, { x: (a.x + a.w) * s, y: a.y * s }, { x: (a.x + a.w) * s, y: (a.y + a.h) * s }, { x: a.x * s, y: (a.y + a.h) * s }];
      if (typeof MeasureEngine !== "undefined" && MeasureEngine.drawRevisionCloud) {
        MeasureEngine.drawRevisionCloud(c, pts, a.revText || "Δ Rev 2", { color: a.color || "#e11d48", lineWidth: Math.max(1.5, (a.size || 2) * s), scallopSize: 14 * s });
      } else {
        c.strokeRect(a.x * s, a.y * s, a.w * s, a.h * s);
      }
      break;
    }
    case 'leader': {
      const x1 = (a.x1 != null ? a.x1 : a.x) * s, y1 = (a.y1 != null ? a.y1 : a.y) * s;
      const x2 = (a.x2 != null ? a.x2 : a.x + 60) * s, y2 = (a.y2 != null ? a.y2 : a.y - 40) * s;
      if (typeof MeasureEngine !== "undefined" && MeasureEngine.drawLeaderCallout) {
        MeasureEngine.drawLeaderCallout(c, { x: x1, y: y1 }, { x: x2, y: y2 }, a.text || "Callout", { color: a.color || "#e11d48", lineWidth: Math.max(1.5, (a.size || 2) * s) });
      } else {
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      }
      break;
    }
  }
  c.restore();
}
function arrowHead(a) { const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), L = Math.max(8, (a.size || 2) * 4); return [ang + 2.7, ang - 2.7].map(t => [a.x2 + L * Math.cos(t), a.y2 + L * Math.sin(t)]); }
function bbox(a) {
  if (a.t === 'line' || a.t === 'arrow') {
    const x1 = a.x1 != null ? a.x1 : a.x, y1 = a.y1 != null ? a.y1 : a.y;
    return [Math.min(x1, a.x2), Math.min(y1, a.y2), Math.max(12, Math.abs(a.x2 - x1)), Math.max(12, Math.abs(a.y2 - y1))];
  }
  if (a.t === 'meas') {
    const x1 = a.x1 != null ? a.x1 : a.x, y1 = a.y1 != null ? a.y1 : a.y;
    const mx = (x1 + a.x2) / 2, my = (y1 + a.y2) / 2 - 8;
    const minX = Math.min(x1, a.x2, mx - 68), maxX = Math.max(x1, a.x2, mx + 68);
    const minY = Math.min(y1, a.y2, my - 15), maxY = Math.max(y1, a.y2, my + 8);
    return [minX, minY, Math.max(20, maxX - minX), Math.max(20, maxY - minY)];
  }
  if (a.t === 'leader') {
    const x1 = a.x1 != null ? a.x1 : a.x, y1 = a.y1 != null ? a.y1 : a.y;
    const x2 = a.x2 != null ? a.x2 : a.x + 60, y2 = a.y2 != null ? a.y2 : a.y - 40;
    const txt = String(a.text || 'Callout');
    const c = _scratchCtx;
    c.font = '12px sans-serif';
    const lines = txt.split('\n');
    const maxW = Math.max(24, ...lines.map(l => c.measureText(l).width));
    const boxW = maxW + 14, boxH = lines.length * 16 + 14;
    const boxX = x2 > x1 ? x2 : x2 - boxW;
    const boxY = y2 - boxH / 2;
    const minX = Math.min(x1, x2, boxX), maxX = Math.max(x1, x2, boxX + boxW);
    const minY = Math.min(y1, y2, boxY), maxY = Math.max(y1, y2, boxY + boxH);
    return [minX, minY, Math.max(20, maxX - minX), Math.max(20, maxY - minY)];
  }
  if (a.t === 'pin') {
    const pw = a.w || a.size || 24;
    const ph = a.h || Math.round(pw * 1.25);
    if (!a.text) return [a.x, a.y, pw, ph];
    const c = _scratchCtx;
    c.font = `bold ${Math.max(9, pw * 0.42)}px sans-serif`;
    const tw = c.measureText(a.text).width;
    const extraW = (pw * 0.44) + 6 + tw + 12;
    return [a.x, a.y, pw / 2 + extraW, ph];
  }
  if (a.t === 'draw' || a.t === 'poly' || a.t === 'area' || a.t === 'angle' || a.t === 'rad3') { const xs = a.pts.map(p => p[0]), ys = a.pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(10, Math.max(...xs) - Math.min(...xs)), Math.max(10, Math.max(...ys) - Math.min(...ys))]; }
  if (a.t === 'text') {
    const [tw, th] = measureTextBox(a);
    if (a.bgBox) return [a.x - 5, a.y - 2.5, tw + 10, th + 5];
    return [a.x, a.y, tw, th];
  }
  return [a.x, a.y, a.w, a.h];
}
function moveAnn(a, dx, dy) {
  if (!a || a.locked) return;
  if ('x1' in a) {
    a.x1 += dx; a.x2 += dx; a.y1 += dy; a.y2 += dy;
    if (E.snapGrid) {
      const sdx = snapCoordToGrid(a.x1) - a.x1, sdy = snapCoordToGrid(a.y1) - a.y1;
      a.x1 += sdx; a.x2 += sdx; a.y1 += sdy; a.y2 += sdy;
    }
  } else if (a.pts) {
    a.pts.forEach(p => { p[0] += dx; p[1] += dy; });
  } else {
    a.x += dx; a.y += dy;
    if (E.snapGrid) { a.x = snapCoordToGrid(a.x); a.y = snapCoordToGrid(a.y); }
  }
}
function hitHandle(a, x, y) {
  if (!a) return null;
  const [bx, by, bw, bh] = bbox(a), t = 8 / K();
  const corners = { nw: [bx - 4, by - 4], ne: [bx + bw + 4, by - 4], sw: [bx - 4, by + bh + 4], se: [bx + bw + 4, by + bh + 4] };
  for (const [k, [cx, cy]] of Object.entries(corners)) {
    if (Math.abs(x - cx) <= t && Math.abs(y - cy) <= t) return k;
  }
  return null;
}
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function hitAnnAt(a, x, y, rad) {
  const strokeTol = Math.max(rad, (a.size || 2) / 2 + 4 / K());
  if (a.t === 'line' || a.t === 'arrow' || a.t === 'meas') {
    if (distToSeg(x, y, a.x1, a.y1, a.x2, a.y2) <= strokeTol) return true;
    if (a.t === 'meas') {
      const mx = (a.x1 + a.x2) / 2, my = (a.y1 + a.y2) / 2 - 8;
      if (Math.abs(x - mx) <= 55 + rad && Math.abs(y - (my - 3)) <= 12 + rad) return true;
    }
    return false;
  }
  if (a.t === 'leader') {
    const x1 = a.x1 != null ? a.x1 : a.x, y1 = a.y1 != null ? a.y1 : a.y;
    const x2 = a.x2 != null ? a.x2 : a.x + 60, y2 = a.y2 != null ? a.y2 : a.y - 40;
    if (distToSeg(x, y, x1, y1, x2, y2) <= strokeTol) return true;
    const [bx, by, bw, bh] = bbox(a);
    return x >= bx - rad && x <= bx + bw + rad && y >= by - rad && y <= by + bh + rad;
  }
  if (a.t === 'rect' && !a.fill) {
    const x0 = a.x, y0 = a.y, x1 = a.x + a.w, y1 = a.y + a.h;
    return (
      distToSeg(x, y, x0, y0, x1, y0) <= strokeTol ||
      distToSeg(x, y, x1, y0, x1, y1) <= strokeTol ||
      distToSeg(x, y, x1, y1, x0, y1) <= strokeTol ||
      distToSeg(x, y, x0, y1, x0, y0) <= strokeTol
    );
  }
  if (a.t === 'circle' && !a.fill) {
    const rx = Math.max(4, Math.abs(a.w) / 2), ry = Math.max(4, Math.abs(a.h) / 2);
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    const normDist = Math.hypot((x - cx) / rx, (y - cy) / ry);
    const tolNorm = strokeTol / Math.min(rx, ry);
    return Math.abs(normDist - 1) <= Math.max(0.18, tolNorm);
  }
  if (a.t === 'draw' || a.t === 'poly' || a.t === 'area') {
    const pts = a.pts || [];
    if (pts.length === 1) return Math.hypot(x - pts[0][0], y - pts[0][1]) <= strokeTol;
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSeg(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) <= strokeTol) return true;
    }
    if ((a.closed || a.fill) && pts.length >= 3) {
      if (distToSeg(x, y, pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1]) <= strokeTol) return true;
      const [bx, by, bw, bh] = bbox(a);
      if (a.fill && x >= bx - rad && x <= bx + bw + rad && y >= by - rad && y <= by + bh + rad) return true;
    }
    return false;
  }
  const [bx, by, bw, bh] = bbox(a);
  return x >= bx - rad && x <= bx + bw + rad && y >= by - rad && y <= by + bh + rad;
}
function isAnnLayerVisible(a) {
  return !E.activeLayer || E.activeLayer === 'all' || !a || !a.layer || a.layer === E.activeLayer;
}
function hit(x, y, customRad) {
  const list = [...(E.ann[E.cur] || []), ...(E.meas[E.cur] || [])], t = customRad != null ? customRad : 6 / K();
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (!isAnnLayerVisible(a)) continue;
    if (hitAnnAt(a, x, y, t)) {
      if (a.t === 'whiteout' && a.g && E.tool !== 'eraser') {
        const pairedText = list.find( item => item.t === 'text' && item.g === a.g );
        if (pairedText) return pairedText;
      }
      return a;
    }
  }
  return null;
}

function commentBBox(cm) {
  if (!cm || !Array.isArray(cm.rect) || cm.rect.length < 4 || !E.vp) return null;
  const [x1, y1] = E.vp.convertToViewportPoint(cm.rect[0], cm.rect[1]);
  const [x2, y2] = E.vp.convertToViewportPoint(cm.rect[2], cm.rect[3]);
  let bx = Math.min(x1, x2), by = Math.min(y1, y2);
  let bw = Math.abs(x2 - x1), bh = Math.abs(y2 - y1);
  if (cm.sub === 'Text') {
    bw = Math.max(20, bw);
    bh = Math.max(20, bh);
  }
  if (E._commentDrag && E._commentDrag.key === cm.key) {
    bx += E._commentDrag.dx || 0;
    by += E._commentDrag.dy || 0;
  }
  return [bx, by, Math.max(12, bw), Math.max(12, bh)];
}

function hitComment(x, y, customRad) {
  if (!E.vp || !Array.isArray(E.comments)) return null;
  const rad = customRad != null ? customRad : 10 / K();
  const pageComments = E.comments.filter(c => !c.irt && c.page === E.cur);
  // First pass: check Sticky Notes (Text annotations)
  for (let i = pageComments.length - 1; i >= 0; i--) {
    const c = pageComments[i];
    if (c.sub !== 'Text') continue;
    const b = commentBBox(c);
    if (!b) continue;
    const [bx, by, bw, bh] = b;
    if (x >= bx - rad && x <= bx + bw + rad && y >= by - rad && y <= by + bh + rad) return c;
  }
  // Second pass: check Highlight / Underline / Strikeout comments
  for (let i = pageComments.length - 1; i >= 0; i--) {
    const c = pageComments[i];
    if (c.sub === 'Text') continue;
    const b = commentBBox(c);
    if (!b) continue;
    const [bx, by, bw, bh] = b;
    if (x >= bx - rad && x <= bx + bw + rad && y >= by - rad && y <= by + bh + rad) return c;
  }
  return null;
}

function findNoteNearPoint(x, y) {
  if (!E.doc) return null;
  const k = K();
  const noteProx = 28 / k;
  const markupProx = 14 / k;
  let best = null;

  // 1. Check PDF Comments & Sticky Notes on current page
  if (E.vp && Array.isArray(E.comments)) {
    const pageComments = E.comments.filter(c => !c.irt && c.page === E.cur);
    for (let i = pageComments.length - 1; i >= 0; i--) {
      const c = pageComments[i];
      const b = commentBBox(c);
      if (!b) continue;
      const [bx, by, bw, bh] = b;
      const dx = Math.max(bx - x, 0, x - (bx + bw));
      const dy = Math.max(by - y, 0, y - (by + bh));
      const dist = Math.hypot(dx, dy);
      const maxD = c.sub === 'Text' ? noteProx : markupProx;
      if (dist <= maxD) {
        // Give Sticky Notes a slight priority bias over wide text highlights
        const score = dist + (c.sub === 'Text' ? 0 : 4 / k);
        if (!best || score < best.score) {
          best = { kind: 'comment', item: c, box: b, dist, score };
        }
      }
    }
  }

  // 2. Check placed annotations with written notes (Pin, Callout, Cloud, FAI)
  const anns = (E.ann && E.ann[E.cur]) || [];
  for (let i = anns.length - 1; i >= 0; i--) {
    const a = anns[i];
    if (!['pin', 'leader', 'cloud', 'fai'].includes(a.t)) continue;
    const b = bbox(a);
    if (!b) continue;
    const [bx, by, bw, bh] = b;
    const dx = Math.max(bx - x, 0, x - (bx + bw));
    const dy = Math.max(by - y, 0, y - (by + bh));
    const dist = Math.hypot(dx, dy);
    const maxD = (a.t === 'pin' || a.t === 'fai') ? noteProx : markupProx;
    if (dist <= maxD) {
      const score = dist + ((a.t === 'pin' || a.t === 'fai') ? 0 : 3 / k);
      if (!best || score < best.score) {
        best = { kind: 'ann', item: a, box: b, dist, score };
      }
    }
  }
  return best;
}

function drawStickyNoteBadge(c, cm, s) {
  const b = commentBBox(cm);
  if (!b) return;
  const [bx, by, bw, bh] = b;
  const x = bx * s, y = by * s;
  const w = Math.max(20 * s, bw * s), h = Math.max(20 * s, bh * s);
  const isRes = cm.state === 'Completed';
  const isHov = E._hovNoteKey === cm.key;
  const isSel = E.selC === cm.key;
  const replies = (E.comments || []).filter(r => r.irt === cm.key);

  c.save();
  c.setLineDash([]);
  // Hover / Selected outer halo ring
  if (isHov || isSel) {
    c.fillStyle = isSel ? 'rgba(37, 99, 235, 0.22)' : 'rgba(245, 158, 11, 0.26)';
    c.strokeStyle = isSel ? '#2563eb' : '#d97706';
    c.lineWidth = 2 * E.d;
    c.beginPath();
    c.roundRect ? c.roundRect(x - 4 * s, y - 4 * s, w + 8 * s, h + 8 * s, 5 * s) : c.rect(x - 4 * s, y - 4 * s, w + 8 * s, h + 8 * s);
    c.fill();
    c.stroke();
  }

  // Drop shadow
  c.fillStyle = 'rgba(15, 23, 42, 0.28)';
  c.fillRect(x + 1.5 * s, y + 2 * s, w, h);

  // Sticky Note Card Body with folded corner
  const fold = Math.min(w, h) * 0.26;
  c.fillStyle = isRes ? '#10b981' : (cm.color && cm.color !== '#e11d48' ? cm.color : '#fbbf24');
  c.strokeStyle = isRes ? '#065f46' : '#92400e';
  c.lineWidth = Math.max(1.2, 1.3 * E.d);
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + w - fold, y);
  c.lineTo(x + w, y + fold);
  c.lineTo(x + w, y + h);
  c.lineTo(x, y + h);
  c.closePath();
  c.fill();
  c.stroke();

  // Folded dog-ear flap
  c.fillStyle = isRes ? '#059669' : '#d97706';
  c.beginPath();
  c.moveTo(x + w - fold, y);
  c.lineTo(x + w - fold, y + fold);
  c.lineTo(x + w, y + fold);
  c.closePath();
  c.fill();
  c.stroke();

  // Note text lines inside icon
  c.strokeStyle = isRes ? '#ffffff' : '#451a03';
  c.lineWidth = Math.max(1.1, 1.25 * E.d);
  c.lineCap = 'round';
  const lx0 = x + w * 0.2, lx1 = x + w * 0.78, lxShort = x + w * 0.56;
  [0.36, 0.56, 0.75].forEach((ry, idx) => {
    c.beginPath();
    c.moveTo(lx0, y + h * ry);
    c.lineTo(idx === 2 ? lxShort : lx1, y + h * ry);
    c.stroke();
  });

  // Reply count mini-pill if replies exist
  if (replies.length > 0) {
    const rRad = 6.5 * s;
    const rx = x + w, ry = y;
    c.fillStyle = '#2563eb';
    c.strokeStyle = '#ffffff';
    c.lineWidth = 1.2 * E.d;
    c.beginPath();
    c.arc(rx, ry, rRad, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = '#ffffff';
    c.font = `bold ${Math.max(8, 8.5 * s)}px Consolas, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(replies.length), rx, ry + 0.5 * s);
  }
  c.restore();
}
function densifyStrokeForBrush(pts, x, y, hitRad) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    out.push(p0);
    if (i + 1 < pts.length) {
      const p1 = pts[i + 1];
      const segLen = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      if (segLen > 3 && distToSeg(x, y, p0[0], p0[1], p1[0], p1[1]) <= hitRad + 2) {
        const steps = Math.min(40, Math.ceil(segLen / 2.5));
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          out.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]);
        }
      }
    }
  }
  return out;
}
function eraseAtPoint(x, y) {
  const rad = (+$('#eSize').value || 18) / K();
  const mode = ($('#eEraserMode') && $('#eEraserMode').value) || E.eraserMode || 'object';
  let changed = false;
  if (mode === 'brush') {
    const filterList = list => {
      const next = [];
      for (const a of (list || [])) {
        if (a && (a.locked || !isAnnLayerVisible(a))) { next.push(a); continue; }
        if (a.t === 'draw' && Array.isArray(a.pts) && a.pts.length >= 1) {
          const hitRad = rad + (a.size || 2) / 2;
          if (a.pts.length === 1) {
            if (Math.hypot(a.pts[0][0] - x, a.pts[0][1] - y) <= hitRad) {
              changed = true;
              if (E.sel === a) E.sel = null;
            } else {
              next.push(a);
            }
            continue;
          }
          const densePts = densifyStrokeForBrush(a.pts, x, y, hitRad);
          let curSeg = [];
          let anyRemoved = false;
          for (const p of densePts) {
            if (Math.hypot(p[0] - x, p[1] - y) <= hitRad) {
              anyRemoved = true;
              if (curSeg.length >= 2) next.push({ ...a, pts: curSeg });
              curSeg = [];
            } else {
              curSeg.push(p);
            }
          }
          if (anyRemoved) {
            changed = true;
            if (E.sel === a) E.sel = null;
            if (curSeg.length >= 2) next.push({ ...a, pts: curSeg });
          } else {
            next.push(a);
          }
        } else if (hitAnnAt(a, x, y, rad)) {
          changed = true;
          if (E.sel === a) E.sel = null;
        } else {
          next.push(a);
        }
      }
      return next;
    };
    E.ann[E.cur] = filterList(E.ann[E.cur]);
    E.meas[E.cur] = filterList(E.meas[E.cur]);
  } else {
    const target = hit(x, y, rad);
    if (target) {
      changed = true;
      E.ann[E.cur] = (E.ann[E.cur] || []).filter(a => a !== target);
      E.meas[E.cur] = (E.meas[E.cur] || []).filter(a => a !== target);
      if (E.sel === target) E.sel = null;
    }
  }
  return changed;
}
function overlay() {
  const o = $('#eov'); if (!o) return;
  const c = o.getContext('2d'), s = K() * E.d;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.clearRect(0, 0, o.width, o.height);
  (E.ann[E.cur] || []).forEach(a => { if (!E.activeLayer || E.activeLayer === 'all' || !a.layer || a.layer === E.activeLayer) drawAnn(c, a, s); });
  (E.meas[E.cur] || []).forEach(a => drawAnn(c, a, s));
  if (E.tmp) drawAnn(c, E.tmp, s);
  if (E.tool === 'eraser' && E.eraserCur) {
    const r = (+$('#eSize').value || 18) * E.d;
    c.save();
    c.beginPath();
    c.arc(E.eraserCur[0] * s, E.eraserCur[1] * s, Math.max(4, r), 0, Math.PI * 2);
    c.fillStyle = 'rgba(239, 68, 68, 0.14)';
    c.fill();
    c.strokeStyle = '#ef4444';
    c.lineWidth = 1.5 * E.d;
    c.setLineDash([4 * E.d, 3 * E.d]);
    c.stroke();
    c.restore();
  }
  if (E.hov && (E.tool === 'edittext' || E.tool === 'multisel')) {
    c.save();
    c.fillStyle = E.tool === 'multisel' ? 'rgba(225, 29, 72, 0.14)' : 'rgba(26,115,232,.14)';
    c.strokeStyle = E.tool === 'multisel' ? '#e11d48' : '#1a73e8';
    c.lineWidth = 1.5 * E.d;
    const h = E.hov;
    c.fillRect((h.x - 1) * s, (h.base - h.h * .85) * s, (h.w + 2) * s, h.h * 1.15 * s);
    c.strokeRect((h.x - 1) * s, (h.base - h.h * .85) * s, (h.w + 2) * s, h.h * 1.15 * s);
    c.restore();
  }
  // Draw Ordered Multi-Selection (1 -> 2 -> 3 -> 4 in strict selection sequence)
  if (Array.isArray(E.multiSel) && E.multiSel.length > 0) {
    c.save();
    const pageSel = E.multiSel.map((item, idx) => ({ item, orderNum: idx + 1 })).filter(entry => entry.item.page === E.cur);
    // Draw subtle directional connector line showing 1 -> 2 -> 3 -> 4 sequence
    if (pageSel.length >= 2) {
      c.save();
      c.strokeStyle = 'rgba(225, 29, 72, 0.45)';
      c.lineWidth = 1.4 * E.d;
      c.setLineDash([4 * E.d, 3 * E.d]);
      c.beginPath();
      pageSel.forEach(({ item }, i) => {
        const cx = (item.x + item.w / 2) * s;
        const cy = (item.y + item.h / 2) * s;
        if (i === 0) c.moveTo(cx, cy);
        else c.lineTo(cx, cy);
      });
      c.stroke();
      c.restore();
    }
    pageSel.forEach(({ item, orderNum }) => {
      const bx = (item.x - 2) * s;
      const by = (item.y - 2) * s;
      const bw = (item.w + 4) * s;
      const bh = (item.h + 4) * s;
      c.fillStyle = 'rgba(225, 29, 72, 0.16)';
      c.strokeStyle = '#e11d48';
      c.lineWidth = 1.75 * E.d;
      c.setLineDash([]);
      fillRoundRect(c, bx, by, bw, bh, 4 * E.d);
      strokeRoundRect(c, bx, by, bw, bh, 4 * E.d);
      // Numbered order badge (#1, #2, #3, #4)
      const badgeTxt = String(orderNum);
      c.font = `800 ${Math.max(9.5, 10.5 * E.d)}px "Segoe UI", Consolas, sans-serif`;
      const tw = Math.max(14 * E.d, c.measureText(badgeTxt).width + 8 * E.d);
      const th = 15 * E.d;
      const px = bx - 3 * E.d;
      const py = by - th + 2 * E.d;
      c.fillStyle = '#e11d48';
      fillRoundRect(c, px, py, tw, th, 4 * E.d);
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1.1 * E.d;
      strokeRoundRect(c, px, py, tw, th, 4 * E.d);
      c.fillStyle = '#ffffff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(badgeTxt, px + tw / 2, py + th / 2 + 0.5 * E.d);
    });
    c.restore();
  }
  F.hits.forEach((h, k) => { if (h.p !== E.cur) return; c.fillStyle = k === F.i ? 'rgba(255,140,0,.55)' : 'rgba(255,200,0,.35)'; c.fillRect(h.x * s, h.y * s, h.w * s, h.h * s); if (k === F.i) { c.strokeStyle = '#e65100'; c.lineWidth = 2 * E.d; c.strokeRect(h.x * s, h.y * s, h.w * s, h.h * s); } });
  if (E.vp && Array.isArray(E.comments)) {
    E.comments.forEach(m => {
      if (m.irt || m.page !== E.cur) return;
      if (m.sub === 'Text') {
        drawStickyNoteBadge(c, m, s);
      } else if (m.key === E.selC || m.key === E._hovNoteKey) {
        const b = commentBBox(m);
        if (b) {
          c.save();
          c.setLineDash([5 * E.d, 3 * E.d]);
          c.strokeStyle = m.key === E.selC ? '#2563eb' : '#d97706';
          c.lineWidth = 1.8 * E.d;
          c.strokeRect((b[0] - 3) * s, (b[1] - 3) * s, (b[2] + 6) * s, (b[3] + 6) * s);
          c.restore();
        }
      }
    });
  }
  if (E.sel && !E.sel._editingInline) {
    const [x, y, w, h] = bbox(E.sel); c.save(); c.setLineDash([6, 4]); c.strokeStyle = '#38bdf8'; c.lineWidth = 1.75 * E.d;
    strokeRoundRect(c, (x - 4) * s, (y - 4) * s, (w + 8) * s, (h + 8) * s, 6 * s);
    c.setLineDash([]); c.fillStyle = '#38bdf8';
    [[x - 4, y - 4], [x + w + 4, y - 4], [x - 4, y + h + 4], [x + w + 4, y + h + 4]].forEach(([hx, hy]) => {
      fillRoundRect(c, (hx - 3.5) * s, (hy - 3.5) * s, 7 * s, 7 * s, 3.5 * s);
    });
    if (E.sel.tableSpec && !E.inlineTable) {
      const hintTxt = 'Click any cell or double-click to edit table';
      c.font = `bold ${10.5 * s}px "Segoe UI", Arial, sans-serif`;
      const tw = c.measureText(hintTxt).width;
      const bx = x * s, by = Math.max(4 * s, (y - 24) * s);
      c.fillStyle = 'rgba(24, 90, 189, 0.94)';
      fillRoundRect(c, bx, by, tw + 14 * s, 18 * s, 6 * s);
      c.fillStyle = '#ffffff';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(hintTxt, bx + 7 * s, by + 9 * s);
    }
    c.restore();
  }
}
function addAnn(a, skipHistory) {
  if (!skipHistory) pushAnnState(`Add ${a.t}`);
  if (!a.layer && E.activeLayer && E.activeLayer !== 'all') a.layer = E.activeLayer;
  (E.ann[E.cur] = E.ann[E.cur] || []).push(a);
  E.uncommittedAnns = E.uncommittedAnns || [];
  E.uncommittedAnns.push({ bucket: 'ann', page: E.cur, item: a });
  if (a.op == null && ['rect', 'circle', 'poly', 'line', 'arrow', 'draw', 'text', 'cloud', 'leader', 'checkmk', 'crossmk', 'pin'].includes(a.t)) {
    a.op = Math.max(.1, Math.min(1, (+$('#eOp').value || 100) / 100));
  }
  if (['rect', 'circle', 'poly'].includes(a.t) && a.fill == null) {
    a.fill = $('#eFill').checked;
    if ($('#eBgColor')) a.bgColor = $('#eBgColor').value;
  }
  if (['rect', 'circle', 'poly', 'line', 'arrow', 'leader', 'draw'].includes(a.t) && !a.dash && $('#eDash')) {
    a.dash = $('#eDash').value;
  }
  E.sel = a; overlay(); updateDocInspector();
}

// ---------- page view ----------
let _edOvRaf = 0;
function scheduleOverlay() {
  if (_edOvRaf) return;
  _edOvRaf = requestAnimationFrame(() => { _edOvRaf = 0; overlay(); });
}

function downsamplePreservingTrueColor(srcCanvas, dstCanvas) {
  const dw = dstCanvas.width, dh = dstCanvas.height;
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const dCtx = dstCanvas.getContext('2d');
  dCtx.imageSmoothingEnabled = true;
  dCtx.imageSmoothingQuality = 'high';
  dCtx.drawImage(srcCanvas, 0, 0, dw, dh);
  if (sw <= dw * 1.12 || sh <= dh * 1.12 || dw * dh > 1.2e7 || sw * sh > 2.4e7) return;
  try {
    const sData = srcCanvas.getContext('2d').getImageData(0, 0, sw, sh).data;
    const dImg = dCtx.getImageData(0, 0, dw, dh);
    const dData = dImg.data;
    const rx = sw / dw, ry = sh / dh;
    for (let y = 0; y < dh; y++) {
      const sy0 = Math.floor(y * ry), sy1 = Math.min(sh - 1, Math.floor((y + 1) * ry));
      const dRow = y * dw;
      for (let x = 0; x < dw; x++) {
        const sx0 = Math.floor(x * rx), sx1 = Math.min(sw - 1, Math.floor((x + 1) * rx));
        const di = (dRow + x) * 4;
        const avgR = dData[di], avgG = dData[di + 1], avgB = dData[di + 2];
        const avgInk = 255 - (avgR < avgG ? (avgR < avgB ? avgR : avgB) : (avgG < avgB ? avgG : avgB));
        let bestInk = avgInk, bestR = avgR, bestG = avgG, bestB = avgB;
        for (let sy = sy0; sy <= sy1; sy++) {
          const sRow = sy * sw;
          for (let sx = sx0; sx <= sx1; sx++) {
            const si = (sRow + sx) * 4;
            const sr = sData[si], sg = sData[si + 1], sb = sData[si + 2];
            const sMin = sr < sg ? (sr < sb ? sr : sb) : (sg < sb ? sg : sb);
            const sInk = 255 - sMin;
            if (sInk > bestInk) {
              bestInk = sInk;
              bestR = sr;
              bestG = sg;
              bestB = sb;
            }
          }
        }
        if (bestInk > avgInk + 10) {
          dData[di]     = Math.round(avgR * 0.38 + bestR * 0.62);
          dData[di + 1] = Math.round(avgG * 0.38 + bestG * 0.62);
          dData[di + 2] = Math.round(avgB * 0.38 + bestB * 0.62);
        }
      }
    }
    dCtx.putImageData(dImg, 0, 0);
  } catch (e) {}
}

function syncPrintRuler(vp1, logicalWidth) {
  const ruler = $('#rp-pdf-ruler');
  if (!ruler || !vp1) return;
  ruler.hidden = false;
  ruler.style.width = Math.max(240, Math.round(logicalWidth)) + 'px';
  const ticks = $('#rp-pdf-ruler-ticks');
  if (ticks) {
    const inches = Math.max(2, Math.min(24, Math.round(vp1.width / 72)));
    if (ticks._lastIn !== inches) {
      let tHtml = '';
      for (let i = 1; i < inches; i++) tHtml += '<span>' + i + '"</span>';
      ticks.innerHTML = tHtml;
      ticks._lastIn = inches;
    }
  }
}

async function renderPage() {
  if (!E.doc) return;
  if (E._rendering) {
    E._renderQueued = true;
    if (E._renderTask && typeof E._renderTask.cancel === 'function') {
      try { E._renderTask.cancel(); } catch (e) {}
      E._renderTask = null;
    }
    return E._renderPromise;
  }
  E._rendering = true;
  E._renderPromise = (async () => {
    do {
      E._renderQueued = false;
      if (!E.doc) break;
      const tok = ++E.tok, doc = E.doc;
      let off = null;
      try {
        const page = await doc.getPage(E.cur + 1), vp1 = page.getViewport({ scale: 1 }), _az = autoZoom(vp1), k = K();
        let dOv = DPR();
        // Fast-open crisp base canvas (>=2.0x density, 12.5MP smooth cap, 60MP ceiling) without 20MP CPU super-sample stall;
        // deep zoom (down to 1 single word) is rendered at native vector DPI via #ehq viewport tile!
        let d = Math.max(dOv, 2.0);
        if (k > 1.35) d = Math.max(dOv, 2.0 / Math.sqrt(k / 1.35));
        const maxSmoothArea = 1.25e7;
        let area = vp1.width * k * vp1.height * k * d * d;
        if (area > maxSmoothArea) d = Math.max(Math.min(dOv, 1.5), 1.0, d * Math.sqrt(maxSmoothArea / area));
        area = vp1.width * k * vp1.height * k * d * d;
        if (area > 6e7) d *= Math.sqrt(6e7 / area);
        dOv = d;
        const logicalWidth = vp1.width * k, logicalHeight = vp1.height * k;
        const targetW = Math.max(1, Math.round(logicalWidth * d));
        const targetH = Math.max(1, Math.round(logicalHeight * d));
        const renderKey = `${E.cur}|${targetW}x${targetH}|${vp1.rotation || 0}`;
        const cv = $('#ecv'), o = $('#eov');
        const ovW = Math.max(1, Math.round(logicalWidth * dOv));
        const ovH = Math.max(1, Math.round(logicalHeight * dOv));
        if (E._lastRenderDoc === doc && E._lastRenderKey === renderKey && cv && cv.width === targetW && cv.height === targetH) {
          E.vp = vp1; E.d = dOv; E._lastRenderPage = E.cur;
          if (o.width !== ovW || o.height !== ovH) { o.width = ovW; o.height = ovH; }
          cv.style.width = o.style.width = logicalWidth + 'px';
          cv.style.height = o.style.height = logicalHeight + 'px';
          const tl = $('#etl');
          if (tl) { tl.style.width = logicalWidth + 'px'; tl.style.height = logicalHeight + 'px'; tl.style.setProperty('--scale-factor', k); }
          syncPrintRuler(vp1, logicalWidth);
          $('#ePg').value = E.cur + 1; if ($('#eZoomBadge')) $('#eZoomBadge').textContent = Math.round(E.zoom * 100) + '%'; markThumbs(); overlay(); hideSelBar();
          updateDocInspector(); syncHudBar();
          if (typeof schedulePdfVectorSharpen === 'function') schedulePdfVectorSharpen(25);
          if (E.inlineText) syncInlineTextEditorStyle(); if (E.inlineTable) syncInlineTableEditorStyle();
          continue;
        }
        E._pageCanvasCache = E._pageCanvasCache || new Map();
        const cachedPage = E._pageCanvasCache.get(renderKey);
        if (cachedPage && cachedPage.doc === doc && cachedPage.canvas && cachedPage.canvas.width === targetW && cachedPage.canvas.height === targetH) {
          E.vp = vp1; E.d = dOv;
          if (cv.width !== targetW || cv.height !== targetH) { cv.width = targetW; cv.height = targetH; }
          if (o.width !== ovW || o.height !== ovH) { o.width = ovW; o.height = ovH; }
          cv.style.width = o.style.width = logicalWidth + 'px';
          cv.style.height = o.style.height = logicalHeight + 'px';
          syncPrintRuler(vp1, logicalWidth);
          const cvCtx = cv.getContext('2d');
          cvCtx.drawImage(cachedPage.canvas, 0, 0);
          E._lastRenderDoc = doc;
          E._lastRenderPage = E.cur;
          E._lastRenderKey = renderKey;
          const tl = $('#etl');
          if (tl) { tl.style.width = logicalWidth + 'px'; tl.style.height = logicalHeight + 'px'; tl.style.setProperty('--scale-factor', k); }
          $('#ePg').value = E.cur + 1; if ($('#eZoomBadge')) $('#eZoomBadge').textContent = Math.round(E.zoom * 100) + '%'; markThumbs(); overlay(); hideSelBar();
          updateDocInspector(); syncHudBar();
          if (typeof schedulePdfVectorSharpen === 'function') schedulePdfVectorSharpen(25);
          if (E.inlineText) syncInlineTextEditorStyle(); if (E.inlineTable) syncInlineTableEditorStyle();
          if (E.lastCur !== E.cur) { $('#eview').scrollTop = 0; $('#eview').scrollLeft = 0; E.lastCur = E.cur; }
          buildTextLayer(page, vp1, k, tok);
          continue;
        }
        const effScale = k * d;
        const useHiSuperSample = false;
        const renderScale = effScale;
        const vp = page.getViewport({ scale: renderScale });
        if (tok !== E.tok || doc !== E.doc) continue;
        off = document.createElement('canvas');
        off.width = targetW;
        off.height = targetH;
        const x = off.getContext('2d');
        x.imageSmoothingEnabled = true;
        x.imageSmoothingQuality = 'high';
        x.fillStyle = '#fff';
        x.fillRect(0, 0, off.width, off.height);
        if (useHiSuperSample) {
          const hiCanvas = document.createElement('canvas');
          hiCanvas.width = Math.max(1, Math.round(vp.width));
          hiCanvas.height = Math.max(1, Math.round(vp.height));
          const hx = hiCanvas.getContext('2d');
          hx.imageSmoothingEnabled = true;
          hx.imageSmoothingQuality = 'high';
          hx.fillStyle = '#fff';
          hx.fillRect(0, 0, hiCanvas.width, hiCanvas.height);
          const rt = page.render({ canvasContext: hx, viewport: vp });
          E._renderTask = rt;
          try {
            await rt.promise;
          } finally {
            if (E._renderTask === rt) E._renderTask = null;
          }
          if (tok === E.tok && doc === E.doc) {
            downsamplePreservingTrueColor(hiCanvas, off);
          }
          hiCanvas.width = 0;
          hiCanvas.height = 0;
        } else {
          const rt = page.render({ canvasContext: x, viewport: vp });
          E._renderTask = rt;
          await rt.promise;
          if (E._renderTask === rt) E._renderTask = null;
        }
        if (tok !== E.tok || doc !== E.doc) continue;
        E.vp = vp1; E.d = dOv;
        if (cv.width !== off.width || cv.height !== off.height) { cv.width = off.width; cv.height = off.height; }
        if (o.width !== ovW || o.height !== ovH) { o.width = ovW; o.height = ovH; }
        cv.style.width = o.style.width = logicalWidth + 'px';
        cv.style.height = o.style.height = logicalHeight + 'px';
        syncPrintRuler(vp1, logicalWidth);
        const cvCtx = cv.getContext('2d');
        cvCtx.imageSmoothingEnabled = true;
        cvCtx.imageSmoothingQuality = 'high';
        cvCtx.drawImage(off, 0, 0);
        if (E._pageCanvasCache.size >= 10 || E._pageCanvasCache.size >= 12) {
          const [oldK, oldEntry] = E._pageCanvasCache.entries().next().value;
          if (oldEntry && oldEntry.canvas) { oldEntry.canvas.width = 0; oldEntry.canvas.height = 0; }
          E._pageCanvasCache.delete(oldK);
        }
        E._pageCanvasCache.set(renderKey, { doc, canvas: off });
        E._lastRenderDoc = doc;
        E._lastRenderPage = E.cur;
        E._lastRenderKey = renderKey;
        off = null;
        $('#ePg').value = E.cur + 1; if ($('#eZoomBadge')) $('#eZoomBadge').textContent = Math.round(E.zoom * 100) + '%'; markThumbs(); overlay(); hideSelBar();
        updateDocInspector(); syncHudBar();
        if (typeof schedulePdfVectorSharpen === 'function') schedulePdfVectorSharpen(35);
        if (E.inlineText) syncInlineTextEditorStyle(); if (E.inlineTable) syncInlineTableEditorStyle();
        if (E.lastCur !== E.cur) {
          const prevCur = E.lastCur;
          $('#eview').scrollTop = 0; $('#eview').scrollLeft = 0; E.lastCur = E.cur;
          if (prevCur >= 0 && prevCur < doc.numPages) {
            doc.getPage(prevCur + 1).then(pg => { if (E.cur !== prevCur && typeof pg.cleanup === 'function') { try { pg.cleanup(); } catch (e) {} } }).catch(() => {});
          }
        }
        buildTextLayer(page, vp1, k, tok);
      } catch (e) {
        if (tok === E.tok && doc === E.doc && (!e || e.name !== 'RenderingCancelledException')) st('Could not draw the page: ' + (e.message || e));
      } finally {
        if (off) { off.width = 0; off.height = 0; }
      }
    } while (E._renderQueued && E.doc);
    E._rendering = false;
  })();
  return E._renderPromise;
}
function autoZoom(v) {
  if (!E.fitMode) return;
  const ev = $('#eview');
  if (!ev) return;
  const w = ev.clientWidth - 48;
  const h = ev.clientHeight - 116;
  if (w < 60 || h < 60) return;
  const zw = w / (v.width * 4 / 3), zh = h / (v.height * 4 / 3);
  const rawZ = E.fitMode === 'width' ? zw : Math.min(zw, zh);
  E.zoom = clampEdZoom(Math.max(0.1, Math.min(rawZ, E.fitMode === 'width' ? 4 : 3)));
}
function fit(mode) {
  if (!E.doc) return;
  if (typeof cancelEditorHq === 'function') cancelEditorHq();
  E.fitMode = mode === 'width' ? 'width' : 'page';
  const ev = $('#eview');
  if (ev) {
    ev.scrollLeft = 0;
    if (E.fitMode === 'page') ev.scrollTop = 0;
  }
  renderPage();
  syncEditorFloatingBars();
}
const refit = () => { if (E.fitMode) renderPage(); };
addEventListener('resize', () => { if (E.fitMode && document.body.dataset.view === 'edit') { clearTimeout(E.rz); E.rz = setTimeout(renderPage, 100); } });
if (typeof ResizeObserver !== 'undefined' && $('#eview')) {
  let evLastW = 0, evLastH = 0, evBarRaf = 0;
  new ResizeObserver(entries => {
    if (!evBarRaf && typeof requestAnimationFrame === 'function') {
      evBarRaf = requestAnimationFrame(() => { evBarRaf = 0; syncEditorFloatingBars(); });
    }
    for (const en of entries) {
      const w = Math.round(en.contentRect.width), h = Math.round(en.contentRect.height);
      if (w > 0 && h > 0 && (Math.abs(w - evLastW) > 3 || Math.abs(h - evLastH) > 3)) {
        const isInitial = (evLastW === 0 || evLastH === 0);
        const significant = isInitial || Math.abs(w - evLastW) > 4 || Math.abs(h - evLastH) > 90;
        evLastW = w;
        evLastH = h;
        if (significant && E.doc && E.fitMode && document.body.dataset.view === 'edit') {
          clearTimeout(E.rz);
          E.rz = setTimeout(renderPage, 60);
        }
      }
    }
  }).observe($('#eview'));
}
const goto = i => { if (!E.doc) return; if (typeof cancelEditorHq === 'function') cancelEditorHq(); E.cur = Math.max(0, Math.min(E.n - 1, i)); E.pages = new Set([E.cur]); E.sel = null; renderPage(); };
$('#ePrev').onclick = () => goto(E.cur - 1); $('#eNext').onclick = () => goto(E.cur + 1);
$('#ePg').onchange = e => goto((+e.target.value || 1) - 1);
let _zoomRaf = 0;
let _pendingZoomAnchor = null;

function applySmoothZoomStep(newZoom, clientX, clientY, debounceMs = 95) {
  if (!E.doc) return;
  const ev = $('#eview'), wrap = $('#ewrap');
  const prevZoom = clampEdZoom(E.zoom);
  const prevK = prevZoom * 4 / 3;
  const nextZoom = clampEdZoom(newZoom);
  if (Math.abs(nextZoom - prevZoom) < 1e-4 && !E.fitMode) return;
  E.fitMode = null;
  E.zoom = nextZoom;
  E._zooming = true;

  // Immediately hide & cancel stale #ehq vector tile so it never freezes/glitches over #ecv during zoom
  if (typeof cancelEditorHq === 'function') cancelEditorHq();

  if (ev && wrap && E.vp) {
    const evRect = ev.getBoundingClientRect();
    const fx = (clientX != null ? clientX - evRect.left : ev.clientWidth / 2);
    const fy = (clientY != null ? clientY - evRect.top : ev.clientHeight / 2);
    const wrapLeft = wrap.offsetLeft || 0;
    const wrapTop = wrap.offsetTop || 0;
    const docX = _pendingZoomAnchor ? _pendingZoomAnchor.docX : ((ev.scrollLeft + fx - wrapLeft) / prevK);
    const docY = _pendingZoomAnchor ? _pendingZoomAnchor.docY : ((ev.scrollTop + fy - wrapTop) / prevK);
    _pendingZoomAnchor = { docX, docY, fx, fy };
  }

  if (E._renderTask && typeof E._renderTask.cancel === 'function') {
    try { E._renderTask.cancel(); } catch (err) {}
    E._renderTask = null;
  }

  if (!_zoomRaf) {
    _zoomRaf = requestAnimationFrame(() => {
      _zoomRaf = 0;
      if (E.vp) {
        const k = K(), lw = Math.round(E.vp.width * k), lh = Math.round(E.vp.height * k);
        const cv = $('#ecv'), o = $('#eov'), tl = $('#etl');
        if (cv) { cv.style.width = lw + 'px'; cv.style.height = lh + 'px'; }
        // GPU CSS-scale #eov during active zoom instead of reallocating/clearing backing canvas every frame!
        if (o) { o.style.width = lw + 'px'; o.style.height = lh + 'px'; }
        if (tl) { tl.style.width = lw + 'px'; tl.style.height = lh + 'px'; tl.style.setProperty('--scale-factor', k); }
        syncPrintRuler(E.vp, lw);
        if (E.inlineText) syncInlineTextEditorStyle();
        if (E.inlineTable) syncInlineTableEditorStyle();
        if (ev && wrap && _pendingZoomAnchor) {
          const a = _pendingZoomAnchor;
          const maxL = Math.max(0, ev.scrollWidth - ev.clientWidth);
          const maxT = Math.max(0, ev.scrollHeight - ev.clientHeight);
          ev.scrollLeft = Math.max(0, Math.min(maxL, Math.round(wrap.offsetLeft + a.docX * k - a.fx)));
          ev.scrollTop = Math.max(0, Math.min(maxT, Math.round(wrap.offsetTop + a.docY * k - a.fy)));
        }
      }
      if ($('#eZoomBadge')) $('#eZoomBadge').textContent = Math.round(E.zoom * 100) + '%';
      syncHudBar();
      _pendingZoomAnchor = null;
    });
  }

  clearTimeout(E._wheelZoomT);
  E._wheelZoomT = setTimeout(() => {
    E._zooming = false;
    const cv = $('#ecv'), o = $('#eov'), tl = $('#etl');
    // Zero-flicker fast-path for BOTH zoom-in AND zoom-out on an already-rendered page!
    // Eliminates top/bottom scroll jumps & canvas reallocation flashes on zoom-out.
    const isZoomInFast = (E.zoom >= 1.25 && E._lastRenderDoc === E.doc && E._lastRenderPage === E.cur && cv && cv.width > 0 && E.vp);
    if (isZoomInFast || (E._lastRenderDoc === E.doc && E._lastRenderPage === E.cur && cv && cv.width > 0 && E.vp)) {
      const k = K(), lw = Math.round(E.vp.width * k), lh = Math.round(E.vp.height * k);
      const baseDensity = cv.width / Math.max(1, lw);
      const needsCrispRerender = (E.zoom < 1.25 && baseDensity < Math.max(1.25, DPR() * 0.9));
      if (!needsCrispRerender) {
        cv.style.width = lw + 'px'; cv.style.height = lh + 'px';
        if (o) {
          let ovD = Math.max(DPR(), 1.5);
          const ovArea = lw * lh * ovD * ovD;
          if (ovArea > 1.6e7) ovD = Math.max(0.5, ovD * Math.sqrt(1.6e7 / ovArea));
          const nextOvW = Math.max(1, Math.round(lw * ovD)), nextOvH = Math.max(1, Math.round(lh * ovD));
          if (o.width !== nextOvW || o.height !== nextOvH) { o.width = nextOvW; o.height = nextOvH; }
          o.style.width = lw + 'px'; o.style.height = lh + 'px';
          E.d = ovD;
          overlay();
        }
        if (tl) { tl.style.width = lw + 'px'; tl.style.height = lh + 'px'; tl.style.setProperty('--scale-factor', k); }
        if (E.zoom >= 1.20 && typeof sharpenEditorViewport === 'function') {
          sharpenEditorViewport();
        } else if (typeof cancelEditorHq === 'function') {
          cancelEditorHq();
        }
        return;
      }
    }
    renderPage();
  }, debounceMs);
}

$('#eZi').onclick = () => applySmoothZoomStep(clampEdZoom(E.zoom) * 1.25, null, null, 70);
$('#eZo').onclick = () => applySmoothZoomStep(clampEdZoom(E.zoom) / 1.25, null, null, 70);
$('#eFit').onclick = () => fit();
$('#eview').addEventListener('wheel', e => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    applySmoothZoomStep(clampEdZoom(E.zoom) * factor, e.clientX, e.clientY, 110);
  }
}, { passive: false });

// Wire Floating HUD Controls
if ($('#eHudFirst')) $('#eHudFirst').onclick = () => goto(0);
if ($('#eHudPrev')) $('#eHudPrev').onclick = () => goto(E.cur - 1);
if ($('#eHudNext')) $('#eHudNext').onclick = () => goto(E.cur + 1);
if ($('#eHudLast')) $('#eHudLast').onclick = () => goto(E.n - 1);
if ($('#eHudPageLabel')) $('#eHudPageLabel').onclick = () => ACT.eGotoDialog && ACT.eGotoDialog();
if ($('#eHudSelect')) $('#eHudSelect').onclick = () => setTool('select');
if ($('#eHudHand')) $('#eHudHand').onclick = () => setTool('hand');
if ($('#eHudNote')) $('#eHudNote').onclick = () => setTool('cnote');
if ($('#eHudMeasure')) $('#eHudMeasure').onclick = () => setTool('measure');
if ($('#eHudZo')) $('#eHudZo').onclick = () => $('#eZo').click();
if ($('#eHudZi')) $('#eHudZi').onclick = () => $('#eZi').click();
if ($('#eZoomPreset')) {
  $('#eZoomPreset').onchange = e => {
    const v = e.target.value;
    if (v === 'page' || v === 'width') fit(v);
    else applySmoothZoomStep(clampEdZoom(+v || 1), null, null, 50);
  };
}

// ---------- thumbnails ----------
let io;
// ---------- Ultra-HD Viewport Vector Sharpening (#ehq) — Razor-Sharp Even Zoomed Into 1 Word ----------
let _ehqTimer = null, _ehqTok = 0, _ehqTask = null;
function cancelEditorHq() {
  clearTimeout(_ehqTimer);
  _ehqTok++;
  if (_ehqTask && typeof _ehqTask.cancel === 'function') {
    try { _ehqTask.cancel(); } catch (_) {}
  }
  _ehqTask = null;
  const ehq = $('#ehq');
  if (ehq) { ehq.hidden = true; ehq.width = 0; ehq.height = 0; ehq._lastKey = ''; }
}
async function sharpenEditorViewport() {
  const ehq = $('#ehq'), ev = $('#eview'), ew = $('#ewrap'), cv = $('#ecv');
  if (!ehq || !ev || !ew || !cv || !E.doc || !E.vp || ew.hidden || E._zooming) return;
  const k = K(), dpr = Math.min(3.5, Math.max(DPR() * 1.5, 2.5));
  const logicalW = E.vp.width * k, logicalH = E.vp.height * k;
  const curDensity = cv.width / Math.max(1, logicalW);
  // Activate viewport vector tile whenever zoomed in or base canvas density is below ultra-HD target
  if (E.zoom < 1.25 && curDensity >= dpr * 0.90) {
    ehq.hidden = true;
    return;
  }
  const evRect = ev.getBoundingClientRect();
  const ewRect = ew.getBoundingClientRect();
  // Overscan by 120px on each side so small pans/scrolls stay crisp without revealing tile seams
  const pad = 120;
  const visLeft = Math.max(0, evRect.left - ewRect.left - pad);
  const visTop = Math.max(0, evRect.top - ewRect.top - pad);
  const visRight = Math.min(logicalW, evRect.right - ewRect.left + pad);
  const visBottom = Math.min(logicalH, evRect.bottom - ewRect.top + pad);
  const visW = Math.max(0, visRight - visLeft);
  const visH = Math.max(0, visBottom - visTop);
  if (visW < 8 || visH < 8) { ehq.hidden = true; return; }

  // Cap tile backing to 16MP (ultra-HD crisp vector text even at 6400% zoom onto 1 single word!)
  let tileDpr = dpr;
  const rawPx = visW * tileDpr * visH * tileDpr;
  if (rawPx > 16e6) tileDpr *= Math.sqrt(16e6 / rawPx);
  const tw = Math.max(1, Math.round(visW * tileDpr));
  const th = Math.max(1, Math.round(visH * tileDpr));
  const key = `${E.cur}|${k.toFixed(4)}|${Math.round(visLeft)},${Math.round(visTop)}|${tw}x${th}`;
  if (!ehq.hidden && ehq._lastKey === key) return;

  if (_ehqTask && typeof _ehqTask.cancel === 'function') {
    try { _ehqTask.cancel(); } catch (_) {}
    _ehqTask = null;
  }
  const myTok = ++_ehqTok;
  const doc = E.doc;
  try {
    const page = await doc.getPage(E.cur + 1);
    if (myTok !== _ehqTok || doc !== E.doc) return;
    const renderScale = k * tileDpr;
    const vpFull = page.getViewport({ scale: renderScale });
    const off = document.createElement('canvas');
    off.width = tw; off.height = th;
    const octx = off.getContext('2d', { alpha: false });
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, tw, th);
    const ox = -visLeft * tileDpr;
    const oy = -visTop * tileDpr;
    const rt = page.render({ canvasContext: octx, viewport: vpFull, transform: [1, 0, 0, 1, ox, oy] });
    _ehqTask = rt;
    await rt.promise;
    if (_ehqTask === rt) _ehqTask = null;
    if (myTok !== _ehqTok || doc !== E.doc) { off.width = 0; off.height = 0; return; }

    ehq.width = tw; ehq.height = th;
    ehq.style.left = visLeft + 'px';
    ehq.style.top = visTop + 'px';
    ehq.style.width = visW + 'px';
    ehq.style.height = visH + 'px';
    const hctx = ehq.getContext('2d', { alpha: false });
    hctx.drawImage(off, 0, 0);
    off.width = 0; off.height = 0;
    ehq._lastKey = key;
    ehq.hidden = false;
  } catch (_) {}
}
function schedulePdfVectorSharpen(delayMs = 60) {
  clearTimeout(_ehqTimer);
  _ehqTimer = setTimeout(() => { sharpenEditorViewport(); }, delayMs);
}
if (typeof window !== 'undefined') {
  window.sharpenEditorViewport = sharpenEditorViewport;
  if ($('#eview')) {
    $('#eview').addEventListener('scroll', () => {
      if (E.doc && !E._zooming && E.zoom >= 1.25) schedulePdfVectorSharpen(45);
    }, { passive: true });
  }
}

async function thumbs() {
  const box = $('#thumbs');
  if (box) box.querySelectorAll('canvas').forEach(cv => { cv.width = 0; cv.height = 0; });
  box.innerHTML = ''; if (io) io.disconnect(); const doc = E.doc;
  const head = document.createElement('div');
  head.className = 'rp-thumbs-header';
  head.innerHTML = `<span>PAGES (${E.n})</span>`;
  box.append(head);
  const thumbQueue = [];
  let thumbRunning = false;
  const drainThumbQueue = async () => {
    if (thumbRunning) return;
    thumbRunning = true;
    while (thumbQueue.length > 0 && E.doc) {
      if (E._zooming || E._rendering) {
        await new Promise(r => setTimeout(r, 45));
        continue;
      }
      const d = thumbQueue.shift();
      if (!d || !d.isConnected) continue;
      const i = +d.dataset.i;
      const activeDoc = E.doc;
      try {
        const p = await activeDoc.getPage(i + 1), v1 = p.getViewport({ scale: 1 }), s = 104 / v1.width, v = p.getViewport({ scale: s * DPR() }), c = d.querySelector('canvas');
        if (!c) continue;
        c.width = Math.round(v.width); c.height = Math.round(v.height); c.style.width = '104px'; c.style.height = v1.height * s + 'px';
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        await p.render({ canvasContext: ctx, viewport: v }).promise;
        c.dataset.rendered = '1';
        if (i !== E.cur && typeof p.cleanup === 'function') { try { p.cleanup(); } catch (e) {} }
        await new Promise(r => setTimeout(r, 10));
      } catch (e) {}
    }
    thumbRunning = false;
  };
  E._drainThumbs = drainThumbQueue;
  E._thumbQueue = thumbQueue;
  io = new IntersectionObserver(es => {
    es.forEach(en => {
      if (!en.isIntersecting) return;
      const d = en.target;
      io.unobserve(d);
      thumbQueue.push(d);
    });
    drainThumbQueue();
  }, { root: box, rootMargin: '200px' });
  for (let i = 0; i < E.n; i++) {
    const d = document.createElement('div'); d.className = 'th'; d.dataset.i = i; d.draggable = true;
    d.innerHTML = `<canvas width="104" height="134" style="width:104px;height:134px"></canvas><span>Page ${i + 1}</span>`;
    d.onclick = e => {
      if (e.ctrlKey || e.metaKey) { E.pages.has(i) ? E.pages.delete(i) : E.pages.add(i); markThumbs(); }
      else if (e.shiftKey) { const a = Math.min(E.cur, i), b = Math.max(E.cur, i); E.pages = new Set(); for (let j = a; j <= b; j++) E.pages.add(j); markThumbs(); }
      else goto(i);
    };
    d.ondragstart = e => { e.dataTransfer.setData('text/plain', String(i)); if (!E.pages.has(i)) E.pages = new Set([i]); };
    d.ondragover = e => { e.preventDefault(); d.classList.add('over'); }; d.ondragleave = () => d.classList.remove('over');
    d.ondrop = e => { e.preventDefault(); d.classList.remove('over'); reorder([...E.pages].sort((a, b) => a - b), i); };
    box.append(d); io.observe(d);
  }
  markThumbs();
}
async function refreshActiveThumbs() {
  const box = $('#thumbs');
  if (!box || !E.doc) return;
  const cards = [...box.querySelectorAll('.th')];
  if (cards.length !== E.n) return thumbs();
  for (const d of cards) {
    const i = +d.dataset.i;
    const c = d.querySelector('canvas');
    if (c && (!c.dataset.rendered || i === E.cur)) {
      if (E._thumbQueue && !E._thumbQueue.includes(d)) E._thumbQueue.push(d);
    }
  }
  if (E._drainThumbs) await E._drainThumbs();
  markThumbs();
}
function markThumbs() { document.querySelectorAll('.th').forEach(d => { const i = +d.dataset.i; d.classList.toggle('cur', i === E.cur); d.classList.toggle('sel', E.pages.has(i)); }); }
const targets = () => E.pages.size ? [...E.pages].sort((a, b) => a - b) : [E.cur];

// ---------- High-DPI Super-Sampled Sprite Renderer for Custom Fonts, Unicode & Rich Shapes ----------
async function renderAnnToHighResPng(a, scale = 6) {
  const [bx, by, bw, bh] = bbox(a);
  const pad = Math.max(12, (a.size || 14) * 0.8);
  const wPt = Math.max(16, bw + pad * 2);
  const hPt = Math.max(16, bh + pad * 2);
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(wPt * scale);
  cv.height = Math.ceil(hPt * scale);
  const ctx = cv.getContext('2d');
  const shifted = { ...a };
  if ('x1' in shifted) {
    shifted.x1 = a.x1 - (bx - pad);
    shifted.y1 = a.y1 - (by - pad);
    shifted.x2 = a.x2 - (bx - pad);
    shifted.y2 = a.y2 - (by - pad);
  } else if (shifted.pts) {
    shifted.pts = a.pts.map(p => [p[0] - (bx - pad), p[1] - (by - pad)]);
  } else {
    shifted.x = a.x - (bx - pad);
    shifted.y = a.y - (by - pad);
  }
  drawAnn(ctx, shifted, scale);
  const dataUrl = cv.toDataURL('image/png');
  cv.width = 0; cv.height = 0;
  const bin = atob(dataUrl.split(',')[1] || '');
  const raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  return { raw, xPt: bx - pad, yPt: by - pad, wPt, hPt };
}

// ---------- commit annotations into the PDF ----------
async function commit(noReload) {
  if (E.inlineText) commitInlineTextEditor();
  if (E.inlineTable) await commitInlineTableEditor();
  const pageSet = new Set([
    ...Object.keys(E.ann).filter(k => E.ann[k] && E.ann[k].length),
    ...Object.keys(E.meas).filter(k => E.meas[k] && E.meas[k].length)
  ]);
  if (!pageSet.size) return;
  const doc = await PDFDocument.load(E.bytes, LOAD), font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const k of pageSet) {
    const i = +k;
    const list = [...(E.ann[k] || []), ...(E.meas[k] || [])];
    const pj = await E.doc.getPage(i + 1), vp = pj.getViewport({ scale: 1 });
    if (list.some(a => a.t === 'redact' || a.flat)) await rasterize(doc, i, pj, vp, list);
    else await vector(doc, doc.getPage(i), vp, list, font, bold);
  }
  const nb = await doc.save(); push(); E.bytes = nb; E.ann = {}; E.meas = {}; E.annUndo = []; E.annRedo = []; E.sel = null;
  if (!noReload) await reload();
}
async function vector(doc, page, vp, list, font, bold) {
  const FN = { Helvetica: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'], Times: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'], Courier: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'] }, fc = {};
  const getFont = async (fam, b, it) => { const nm = (FN[fam] || FN.Helvetica)[(b ? 1 : 0) + (it ? 2 : 0)]; return fc[nm] || (fc[nm] = await doc.embedFont(StandardFonts[nm])); };
  const P = (x, y) => vp.convertToPdfPoint(x, y), R = degrees(vp.rotation || 0);
  const dashArrOf = a => {
    const lw = a.size || 2;
    if (a.dash === 'dashed') return [Math.max(5, lw * 3), Math.max(3, lw * 2)];
    if (a.dash === 'dotted') return [Math.max(1.5, lw), Math.max(3, lw * 2)];
    return undefined;
  };
  for (const a of list) {
    const col = a.color ? hexRgb(a.color) : rgb(0, 0, 0);
    if (a.t === 'text') {
      const isStdFam = !a.fam || a.fam === 'Helvetica' || a.fam === 'Times' || a.fam === 'Courier';
      const tf = isStdFam ? await getFont(a.fam || 'Helvetica', a.bold, a.italic) : font;
      const plainStd = isStdFam && !a.underline && !a.strike && !a.bgBox && (!a.lineHeight || +a.lineHeight === 1.22) && (!a.align || a.align === 'left') && canEncodeAll(tf, a.text);
      if (plainStd) {
        a.text.split('\n').forEach((l, i) => {
          if (!l) return;
          const [X, Y] = P(a.x, a.y + a.size * (BASE + i * 1.22));
          page.drawText(safeText(tf, l), { x: X, y: Y, size: a.size, font: tf, color: col, opacity: a.op == null ? 1 : a.op, rotate: R });
        });
      } else {
        // Render rich font / custom .ttf / Unicode / underlined / boxed text as 4x Super-Sampled Transparent PNG Sprite
        const spr = await renderAnnToHighResPng(a, 4);
        const pngImg = await doc.embedPng(spr.raw);
        const [X, Y] = P(spr.xPt, spr.yPt + spr.hPt);
        page.drawImage(pngImg, { x: X, y: Y, width: spr.wPt, height: spr.hPt, rotate: R });
      }
    } else if (a.t === 'rect' || a.t === 'highlight' || a.t === 'whiteout') {
      const [x1, y1] = P(a.x, a.y), [x2, y2] = P(a.x + a.w, a.y + a.h), o = { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
      const borderDashArray = dashArrOf(a);
      if (a.t === 'rect') page.drawRectangle({ ...o, borderColor: col, borderWidth: a.size, borderOpacity: a.op == null ? 1 : a.op, ...(borderDashArray ? { borderDashArray } : {}), ...(a.fill ? { color: a.bgColor ? hexRgb(a.bgColor) : col, opacity: .28 * (a.op == null ? 1 : a.op) } : {}) });
      else if (a.t === 'highlight') page.drawRectangle({ ...o, color: col, opacity: .35 });
      else page.drawRectangle({ ...o, color: rgb(1, 1, 1) });
    } else if (a.t === 'circle' || a.t === 'poly' || a.t === 'area' || a.t === 'angle' || a.t === 'rad3' || a.t === 'fai' || a.t === 'checkmk' || a.t === 'crossmk' || a.t === 'pin' || a.t === 'cloud' || a.t === 'leader' || a.t === 'meas') {
      const spr = await renderAnnToHighResPng(a, 4);
      const pngImg = await doc.embedPng(spr.raw);
      const [X, Y] = P(spr.xPt, spr.yPt + spr.hPt);
      page.drawImage(pngImg, { x: X, y: Y, width: spr.wPt, height: spr.hPt, rotate: R });
    } else if (a.t === 'line' || a.t === 'arrow') {
      const dashArray = dashArrOf(a);
      const seg = (p, q, useDash) => { const [X1, Y1] = P(p[0], p[1]), [X2, Y2] = P(q[0], q[1]); page.drawLine({ start: { x: X1, y: Y1 }, end: { x: X2, y: Y2 }, thickness: a.size, color: col, opacity: a.op == null ? 1 : a.op, lineCap: LineCapStyle.Round, ...(useDash && dashArray ? { dashArray } : {}) }); };
      seg([a.x1, a.y1], [a.x2, a.y2], true); if (a.t === 'arrow') arrowHead(a).forEach(h => seg([a.x2, a.y2], h, false));
    } else if (a.t === 'draw') {
      if (a.dash && a.dash !== 'solid') {
        const spr = await renderAnnToHighResPng(a, 4);
        const pngImg = await doc.embedPng(spr.raw);
        const [X, Y] = P(spr.xPt, spr.yPt + spr.hPt);
        page.drawImage(pngImg, { x: X, y: Y, width: spr.wPt, height: spr.hPt, rotate: R });
      } else {
        if (a.pts.length === 1) {
          const [X1, Y1] = P(a.pts[0][0], a.pts[0][1]), [X2, Y2] = P(a.pts[0][0] + 0.1, a.pts[0][1]);
          page.drawLine({ start: { x: X1, y: Y1 }, end: { x: X2, y: Y2 }, thickness: a.size, color: col, opacity: a.op == null ? 1 : a.op, lineCap: LineCapStyle.Round });
        }
        for (let j = 1; j < a.pts.length; j++) { const [X1, Y1] = P(...a.pts[j - 1]), [X2, Y2] = P(...a.pts[j]); page.drawLine({ start: { x: X1, y: Y1 }, end: { x: X2, y: Y2 }, thickness: a.size, color: col, opacity: a.op == null ? 1 : a.op, lineCap: LineCapStyle.Round }); }
      }
    } else if (a.t === 'stamp') {
      const isCustomFam = a.fam && a.fam !== 'Helvetica';
      if (!isCustomFam && canEncodeAll(bold, a.text)) {
        const [x1, y1] = P(a.x, a.y), [x2, y2] = P(a.x + a.w, a.y + a.h); page.drawRectangle({ x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), borderColor: col, borderWidth: 3 });
        const tw = bold.widthOfTextAtSize(safeText(bold, a.text), a.fs), [X, Y] = P(a.x + (a.w - tw) / 2, a.y + a.h / 2 + a.fs * .35); page.drawText(safeText(bold, a.text), { x: X, y: Y, size: a.fs, font: bold, color: col, rotate: R });
      } else {
        const spr = await renderAnnToHighResPng(a, 4);
        const pngImg = await doc.embedPng(spr.raw);
        const [X, Y] = P(spr.xPt, spr.yPt + spr.hPt);
        page.drawImage(pngImg, { x: X, y: Y, width: spr.wPt, height: spr.hPt, rotate: R });
      }
    } else if (a.t === 'image') {
      let exportDataUrl = a.dataUrl;
      if (a.equation && typeof renderMathFormulaToCanvas === 'function') {
        const baseRes = renderMathFormulaToCanvas(a.equation, a.eqSize || 18, a.color || '#0f172a', 1);
        const resizeRatio = (a.w && baseRes.wPt > 0) ? Math.max(0.5, a.w / baseRes.wPt) : 1;
        const hiRes = renderMathFormulaToCanvas(a.equation, (a.eqSize || 18) * resizeRatio, a.color || '#0f172a', 6);
        exportDataUrl = hiRes.cv.toDataURL('image/png');
        hiRes.cv.width = 0; hiRes.cv.height = 0;
        baseRes.cv.width = 0; baseRes.cv.height = 0;
      } else if (a.gdtSpec && typeof renderGDTFrameToCanvas === 'function') {
        const hiGdt = renderGDTFrameToCanvas(a.gdtSpec, 6);
        exportDataUrl = hiGdt.cv.toDataURL('image/png');
        hiGdt.cv.width = 0; hiGdt.cv.height = 0;
      }
      const _b = atob((exportDataUrl || '').split(',')[1] || ''), raw = new Uint8Array(_b.length); for (let _i = 0; _i < _b.length; _i++) raw[_i] = _b.charCodeAt(_i); const img = /jpe?g/.test((exportDataUrl || '').slice(0, 30)) ? await doc.embedJpg(raw) : await doc.embedPng(raw), [X, Y] = P(a.x, a.y + a.h);
      page.drawImage(img, { x: X, y: Y, width: a.w, height: a.h, rotate: R });
    }
  }
}

/**
 * Permanently burns in a security redaction rectangle on `imgOrCanvas` and strips any underlying
 * `PositionedTextItem` overlapping the redaction zone (ported from Rust pdf_studio.rs).
 * Overwrites pixels with zeroes first via `secureZeroSlice` so sensitive CAD/PCB IP is scrubbed from RAM.
 */
function applySecurityRedaction(pageIdx, imgOrCanvas, textItems, rx, ry, rw, rh, reason = 'CONFIDENTIAL') {
  const x0 = Math.max(0, Math.floor(rx || 0));
  const y0 = Math.max(0, Math.floor(ry || 0));
  let scrubbedPixels = 0;

  if (imgOrCanvas) {
    const isCanvas = typeof HTMLCanvasElement !== 'undefined' && imgOrCanvas instanceof HTMLCanvasElement;
    const ctx = isCanvas ? imgOrCanvas.getContext('2d') : null;
    const W = imgOrCanvas.width | 0;
    const H = imgOrCanvas.height | 0;
    const x1 = Math.min(W, Math.ceil((rx || 0) + (rw || 0)));
    const y1 = Math.min(H, Math.ceil((ry || 0) + (rh || 0)));
    const boxW = Math.max(0, x1 - x0);
    const boxH = Math.max(0, y1 - y0);

    if (ctx && boxW > 0 && boxH > 0) {
      const subImg = ctx.getImageData(x0, y0, boxW, boxH);
      if (typeof WorkerEngine !== 'undefined' && WorkerEngine.secureZeroSlice) {
        WorkerEngine.secureZeroSlice(subImg.data);
      } else {
        subImg.data.fill(0);
      }
      for (let i = 3; i < subImg.data.length; i += 4) subImg.data[i] = 255;
      ctx.putImageData(subImg, x0, y0);
      scrubbedPixels = boxW * boxH;
    } else if (imgOrCanvas.data && W > 0 && H > 0 && boxW > 0 && boxH > 0) {
      const data = imgOrCanvas.data;
      const stride = W * 4;
      for (let y = y0; y < y1; y++) {
        const rowStart = y * stride + x0 * 4;
        const rowEnd = y * stride + x1 * 4;
        if (rowEnd <= data.length && rowStart < rowEnd) {
          const rowSlice = data.subarray(rowStart, rowEnd);
          if (typeof WorkerEngine !== 'undefined' && WorkerEngine.secureZeroSlice) {
            WorkerEngine.secureZeroSlice(rowSlice);
          } else {
            rowSlice.fill(0);
          }
          for (let i = rowStart; i < rowEnd; i += 4) {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
            data[i + 3] = 255;
            scrubbedPixels++;
          }
        }
      }
    }
  }

  // Strip any text items whose bounding box intersects the redacted rectangle
  const fx0 = Number(rx) || 0;
  const fy0 = Number(ry) || 0;
  const fx1 = fx0 + (Number(rw) || 0);
  const fy1 = fy0 + (Number(rh) || 0);
  if (Array.isArray(textItems)) {
    for (let i = textItems.length - 1; i >= 0; i--) {
      const t = textItems[i];
      if (!t) continue;
      const tx0 = t.x != null ? t.x : 0;
      const ty0 = t.y != null ? t.y : (t.base != null ? t.base - (t.h || 10) : 0);
      const tx1 = tx0 + (t.w || 0);
      const ty1 = ty0 + (t.h || 10);
      if (!(tx1 < fx0 || tx0 > fx1 || ty1 < fy0 || ty0 > fy1)) {
        textItems.splice(i, 1);
      }
    }
  }

  return scrubbedPixels;
}

/**
 * Cryptographically signs the active PDF Studio document with a SHA-256 signature block.
 */
async function signDocument(signerName = 'QA Lead', signerRole = 'Principal Engineer', reason = 'Engineering Release Sign-Off', timestampIso = '', documentSha256 = '') {
  const ts = timestampIso || new Date().toISOString();
  let docHash = documentSha256;
  if (!docHash && E.bytes && typeof MeasureEngine !== 'undefined' && MeasureEngine.computeDocumentSHA256) {
    docHash = await MeasureEngine.computeDocumentSHA256(E.bytes);
  }
  const annCount = Object.values(E.ann || {}).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0);
  const payload = `${signerName}|${signerRole}|${reason}|${ts}|${docHash || 'LOCAL'}|annotations=${annCount}`;
  let sigHash = docHash || '0000000000000000';
  if (typeof MeasureEngine !== 'undefined' && MeasureEngine.computeDocumentSHA256) {
    sigHash = await MeasureEngine.computeDocumentSHA256(new TextEncoder().encode(payload));
  }
  const block = {
    signerName: String(signerName),
    signerRole: String(signerRole),
    reason: String(reason),
    timestampIso: ts,
    documentSha256: docHash || '',
    signatureHash: sigHash
  };
  E.signature = block;
  return block;
}

async function rasterize(doc, i, pj, vp, list, s = 4) {
  const v = pj.getViewport({ scale: s }), c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await pj.render({ canvasContext: x, viewport: v }).promise;
  list.forEach(a => {
    if (a && a.t === 'redact') {
      applySecurityRedaction(i + 1, c, E.cur === i ? E.titems : null, a.x * s, a.y * s, a.w * s, a.h * s, a.reason || 'REDACTED');
    }
    drawAnn(x, a, s);
  });
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  c.width = 0; c.height = 0;
  const img = await doc.embedPng(new Uint8Array(await blob.arrayBuffer()));
  const np = doc.insertPage(i, [vp.width, vp.height]); np.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height }); doc.removePage(i + 1);
}


// ---------- text layer: select, copy, mark up and edit existing text ----------
function buildTextLayer(page, vp1, k, tok) {
  const tl = $('#etl');
  if (!tl) return;
  tl.style.setProperty('--scale-factor', k);
  tl.style.width = vp1.width * k + 'px';
  tl.style.height = vp1.height * k + 'px';
  E.hov = null;
  if (E._tcCache && E._tcCache.doc === E.doc && E._tcCache.cur === E.cur && E._tcCache.tc) {
    E.titems = E._tcCache.titems;
    E.wordItems = E._tcCache.wordItems || [];
    if (tl._renderedDoc === E.doc && tl._renderedPage === E.cur && tl.childElementCount > 0) {
      return;
    }
    tl.innerHTML = '';
    tl._renderedDoc = E.doc;
    tl._renderedPage = E.cur;
    try { const tlr = pdfjsLib.renderTextLayer({ textContentSource: E._tcCache.tc, container: tl, viewport: page.getViewport({ scale: k }), textDivs: [] }); if (tlr && tlr.promise && typeof tlr.promise.catch === 'function') tlr.promise.catch(() => {}); } catch (e) {}
    return;
  }
  tl.innerHTML = '';
  tl._renderedDoc = null;
  tl._renderedPage = -1;
  E.titems = [];
  page.getTextContent().then(tc => {
    if (tok !== E.tok) return;
    const vp = page.getViewport({ scale: 1 }), fi = {};
    const info = fn => fi[fn] || (fi[fn] = (() => { try { const f = page.commonObjs.get(fn); return { bold: !!f.bold || /bold|black|heavy/i.test(f.name || ''), italic: !!f.italic || /italic|oblique/i.test(f.name || '') }; } catch (e) { return { bold: false, italic: false }; } })());
    E.wordItems = [];
    tc.items.forEach(it => {
      if (!it.str || !it.str.trim()) return;
      const t = pdfjsLib.Util.transform(vp.transform, it.transform);
      const h = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]) || 12;
      const f = info(it.fontName);
      const totalW = (it.width || (it.str.length * h * 0.55)) * vp.scale;
      const fam = (tc.styles[it.fontName] || {}).fontFamily || 'sans-serif';
      const parentItem = { str: it.str, x: t[4], base: t[5], w: totalW, h, fam, bold: f.bold, italic: f.italic };
      E.titems.push(parentItem);
      // Split run into individual word tokens with accurate proportional X offsets & widths
      const totalChars = Math.max(1, it.str.length);
      const wordRe = /\S+/g;
      let m;
      while ((m = wordRe.exec(it.str)) !== null) {
        const wStr = m[0];
        const cStart = m.index;
        const cLen = wStr.length;
        const wx = t[4] + (cStart / totalChars) * totalW;
        const ww = Math.max(4, (cLen / totalChars) * totalW);
        E.wordItems.push({
          str: wStr,
          x: wx,
          base: t[5],
          w: ww,
          h,
          fam,
          bold: f.bold,
          italic: f.italic,
          parentItem,
          charStart: cStart,
          charEnd: cStart + cLen
        });
      }
    });
    E._tcCache = { doc: E.doc, cur: E.cur, tc, titems: E.titems, wordItems: E.wordItems };
    tl._renderedDoc = E.doc;
    tl._renderedPage = E.cur;
    try { const tlr = pdfjsLib.renderTextLayer({ textContentSource: tc, container: tl, viewport: page.getViewport({ scale: k }), textDivs: [] }); if (tlr && tlr.promise && typeof tlr.promise.catch === 'function') tlr.promise.catch(() => {}); } catch (e) {}
  }).catch(() => {});
}
function setPE() {
  const o = $('#eov'), tl = $('#etl'), sel = E.tool === 'select';
  o.style.pointerEvents = sel ? 'none' : 'auto';
  tl.style.pointerEvents = sel ? 'auto' : 'none';
  if (!sel) { try { getSelection().removeAllRanges(); } catch (e) {} }
  hideSelBar();
}
// ---------- Floating Cursor-Proximity Note Preview Card (Shared by PDF Studio & Compare) ----------
const RPNotePreview = (() => {
  let cardEl = null;
  let hideTimer = 0;
  let activeKey = null;
  let pinned = false;
  let hoveringCard = false;

  const escHtml = s => String(s || '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  function ensureCard() {
    if (cardEl && cardEl.isConnected) return cardEl;
    cardEl = document.createElement('div');
    cardEl.id = 'rp-note-hover-card';
    cardEl.className = 'rp-note-hover-card';
    cardEl.hidden = true;
    cardEl.addEventListener('pointerenter', () => {
      hoveringCard = true;
      clearTimeout(hideTimer);
    });
    cardEl.addEventListener('pointerleave', () => {
      hoveringCard = false;
      if (!pinned) scheduleHide(140);
    });
    cardEl.addEventListener('pointerdown', e => e.stopPropagation());
    cardEl.addEventListener('click', e => e.stopPropagation());
    cardEl.addEventListener('dblclick', e => e.stopPropagation());
    document.body.appendChild(cardEl);
    return cardEl;
  }

  function scheduleHide(ms = 160) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (hoveringCard || pinned) return;
      hide(true);
    }, ms);
  }

  function hide(force = false) {
    clearTimeout(hideTimer);
    if (!force && (hoveringCard || pinned)) return;
    pinned = false;
    hoveringCard = false;
    activeKey = null;
    if (cardEl) cardEl.hidden = true;
    if (E._hovNoteKey) {
      E._hovNoteKey = null;
      scheduleOverlay();
    }
  }

  function positionCard(el, anchorRect) {
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 800;
    const cw = el.offsetWidth || 290;
    const ch = el.offsetHeight || 130;
    let left = anchorRect.right + 12;
    if (left + cw > vw - 14) {
      left = anchorRect.left - cw - 12;
    }
    if (left < 10) left = Math.max(10, Math.min(vw - cw - 10, anchorRect.left));
    let top = anchorRect.top - 6;
    if (top + ch > vh - 34) {
      top = vh - ch - 34;
    }
    if (top < 42) top = 42;
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';
  }

  function show(spec, isPinned = false) {
    if (!spec) return hide();
    clearTimeout(hideTimer);
    if (isPinned) pinned = true;
    const el = ensureCard();
    const key = spec.key || (spec.title + '|' + spec.text);
    const sameKey = activeKey === key && !el.hidden;
    activeKey = key;

    if (!sameKey || isPinned) {
      const repliesHtml = (spec.replies && spec.replies.length)
        ? `<div class="rp-nh-replies">${spec.replies.map(r => `
            <div class="rp-nh-reply-item">
              <div class="rp-nh-reply-meta"><b>${escHtml(r.author || 'Reviewer')}</b><span>${escHtml(r.date || '')}</span></div>
              <div class="rp-nh-reply-txt">${escHtml(r.contents || r.text || '')}</div>
            </div>
          `).join('')}</div>`
        : '';

      const actions = spec.actions || [];
      const footHtml = actions.length
        ? `<div class="rp-nh-foot">${actions.map((a, idx) => `<button type="button" class="rp-nh-btn ${a.danger ? 'danger' : ''}" data-nh-idx="${idx}">${escHtml(a.label)}</button>`).join('')}</div>`
        : '';

      const statusBadge = spec.status
        ? `<span class="rp-nh-status ${spec.status === 'Resolved' || spec.status === 'Approved' ? 'ok' : ''}">${escHtml(spec.status)}</span>`
        : '';

      const bodyTxt = (spec.text && String(spec.text).trim())
        ? escHtml(spec.text)
        : `<span class="rp-nh-empty">${escHtml(spec.emptyHint || 'No note text written yet. Click Edit to add details.')}</span>`;

      el.innerHTML = `
        <div class="rp-nh-head">
          <span class="rp-nh-dot" style="background:${escHtml(spec.color || '#f59e0b')}"></span>
          <strong class="rp-nh-title">${escHtml(spec.title || 'Sticky Note')}</strong>
          ${statusBadge}
          ${pinned ? `<button type="button" class="rp-nh-close" title="Close">×</button>` : ''}
        </div>
        ${(spec.author || spec.date || spec.sub) ? `<div class="rp-nh-meta">${escHtml([spec.author, spec.date, spec.sub].filter(Boolean).join(' · '))}</div>` : ''}
        <div class="rp-nh-body">${bodyTxt}</div>
        ${repliesHtml}
        ${footHtml}
      `;
      el.hidden = false;

      el.querySelectorAll('[data-nh-idx]').forEach(btn => {
        btn.onclick = ev => {
          ev.preventDefault();
          ev.stopPropagation();
          const act = actions[+btn.dataset.nhIdx];
          hide(true);
          if (act && typeof act.run === 'function') act.run();
        };
      });
      const closeBtn = el.querySelector('.rp-nh-close');
      if (closeBtn) closeBtn.onclick = () => hide(true);
    }

    if (spec.anchorRect) {
      positionCard(el, spec.anchorRect);
    }
  }

  return { show, hide, scheduleHide, isPinned: () => pinned };
})();
window.RPNotePreview = RPNotePreview;

function showEditorNoteHover(hitInfo, pinCard = false) {
  const cvEl = $('#ecv');
  if (!cvEl || !hitInfo) {
    RPNotePreview.scheduleHide(150);
    return;
  }
  const r = cvEl.getBoundingClientRect();
  const k = K();
  const [bx, by, bw, bh] = hitInfo.box;
  const anchorRect = {
    left: r.left + bx * k,
    top: r.top + by * k,
    right: r.left + (bx + bw) * k,
    bottom: r.top + (by + bh) * k
  };

  if (hitInfo.kind === 'comment') {
    const c = hitInfo.item;
    if (E._hovNoteKey !== c.key) {
      E._hovNoteKey = c.key;
      scheduleOverlay();
    }
    const replies = (E.comments || []).filter(x => x.irt === c.key);
    const typeLabel = c.sub === 'Text' ? 'Sticky Note' : `${c.type || 'Markup'} Note`;
    RPNotePreview.show({
      key: 'cm_' + c.key,
      title: typeLabel,
      color: c.sub === 'Text' ? (c.state === 'Completed' ? '#10b981' : '#f59e0b') : (c.color || '#f59e0b'),
      author: c.author || getAuthor() || 'Reviewer',
      date: c.date || '',
      sub: `Page ${c.page + 1}`,
      status: c.state === 'Completed' ? 'Resolved' : 'Open',
      text: c.contents || '',
      emptyHint: 'Empty note — click Edit to write note text.',
      replies,
      anchorRect,
      actions: [
        { label: 'Edit Note', run: () => editC(c) },
        { label: 'Reply', run: () => replyTo(c) },
        { label: c.state === 'Completed' ? 'Reopen' : 'Resolve', run: () => toggleRes(c) },
        { label: 'Delete', danger: true, run: () => delC(c) }
      ]
    }, pinCard);
    st(`${typeLabel} (${c.author || 'Reviewer'}): ${(c.contents || '(empty)').replace(/\s+/g, ' ').slice(0, 90)}`);
  } else if (hitInfo.kind === 'ann') {
    const a = hitInfo.item;
    if (E._hovNoteKey !== null) {
      E._hovNoteKey = null;
      scheduleOverlay();
    }
    const isPin = a.t === 'pin';
    const isLeader = a.t === 'leader';
    const isCloud = a.t === 'cloud';
    const isFai = a.t === 'fai';
    const title = isPin ? `Inspection Pin #${a.pinNum || 1}` : isLeader ? 'Leader Callout' : isCloud ? 'Revision Cloud' : `FAI Balloon #${a.charNo || 1}`;
    const noteText = isCloud ? (a.revText || '') : isFai ? (a.reqText || '') : (a.text || '');
    RPNotePreview.show({
      key: `ann_${a.t}_${a.pinNum || a.charNo || Math.round(a.x || a.x1 || 0)}_${Math.round(a.y || a.y1 || 0)}`,
      title,
      color: a.color || '#f59e0b',
      author: a.author || getAuthor() || 'Reviewer',
      date: a.date || '',
      sub: `Page ${E.cur + 1}`,
      text: noteText,
      emptyHint: 'No note text written yet — click Edit Note to write.',
      anchorRect,
      actions: [
        {
          label: 'Edit Note',
          run: async () => {
            if (isPin) {
              const res = await dialog(`Edit Inspection Pin #${a.pinNum || 1}`, [
                { type: 'textarea', id: 'v', label: 'Pin Note / Callout Text', rows: 3, value: a.text || '' },
                { type: 'symbols' },
                { type: 'color', id: 'col', label: 'Pin Colour', value: a.color || '#f59e0b' }
              ], 'Save Note');
              if (res) { pushAnnState('Edit pin note'); a.text = res.v || ''; if (res.col) a.color = res.col; overlay(); }
            } else if (isLeader) {
              const res = await dialog('Edit Leader Callout', [{ type: 'textarea', id: 'v', label: 'Callout Note Text', rows: 3, value: a.text || 'Callout' }, { type: 'symbols' }], 'Update');
              if (res && res.v != null) { pushAnnState('Edit callout'); a.text = res.v; overlay(); }
            } else if (isCloud) {
              const res = await dialog('Edit Revision Cloud Label', [{ id: 'v', label: 'Delta Tag / Note', value: a.revText || 'Δ Rev 2' }, { type: 'symbols' }], 'Update');
              if (res && res.v != null) { pushAnnState('Edit revision cloud'); a.revText = res.v; overlay(); }
            }
          }
        },
        {
          label: 'Delete',
          danger: true,
          run: () => { E.sel = a; ACT.eDeleteAnn(); }
        }
      ]
    }, pinCard);
  }
}

const wrapEl = $('#ewrap');
let _wrapDownPt = null;
let _wrapClickTimer = 0;
let _edHoverRaf = 0, _edLastEv = null;
wrapEl.addEventListener('mousemove', e => {
  if (!E.doc) return;
  _edLastEv = { clientX: e.clientX, clientY: e.clientY };
  if (_edHoverRaf) return;
  _edHoverRaf = requestAnimationFrame(() => {
    _edHoverRaf = 0;
    if (!E.doc || !_edLastEv) return;
    const r = $('#ecv').getBoundingClientRect(), px = (_edLastEv.clientX - r.left) / K(), py = (_edLastEv.clientY - r.top) / K();
    if (!E.drag && !E._commentDrag && !E.pan && !E.tmp && !E.erasing) {
      const nearNote = findNoteNearPoint(px, py);
      if (nearNote) {
        showEditorNoteHover(nearNote, false);
      } else if (!RPNotePreview.isPinned()) {
        RPNotePreview.scheduleHide(140);
      }
    }
    if (E.tool !== 'select') return;
    const hdl = E.sel ? hitHandle(E.sel, px, py) : null;
    const hitCm = !hdl ? hitComment(px, py, 12 / K()) : null;
    const h = !!hdl || !!hitCm || !!hit(px, py), o = $('#eov'), want = h ? 'auto' : 'none';
    if (o.style.pointerEvents !== want) o.style.pointerEvents = want;
    o.style.cursor = hdl ? ((hdl === 'nw' || hdl === 'se') ? 'nwse-resize' : 'nesw-resize') : hitCm ? 'pointer' : (h ? 'move' : 'text');
    if ($('#etl')) $('#etl').style.cursor = 'text';
  });
});
wrapEl.addEventListener('pointerdown', e => {
  if (e.target.closest('#rp-inline-text-box') || e.target.closest('#rp-inline-table-box') || e.target.closest('#selbar')) return;
  const hadInline = !!(E.inlineText || E.inlineTable);
  const hadSel = !!E.sel;
  if (E.inlineText && e.target.id !== 'eov') {
    commitInlineTextEditor();
  }
  if (E.inlineTable && e.target.id !== 'eov') {
    commitInlineTableEditor();
  }
  if (RPNotePreview.isPinned()) RPNotePreview.hide(true);
  if (E.tool === 'select' && (e.ctrlKey || e.metaKey || e.altKey) && !e.target.closest('#rp-ordered-sel-bar')) {
    const r = $('#ecv').getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      const px = (e.clientX - r.left) / K(), py = (e.clientY - r.top) / K();
      const hitA = hit(px, py);
      if (hitA) {
        e.preventDefault();
        addOrderedSelectionItem({ kind: 'ann', ann: hitA, page: E.cur }, true);
        return;
      }
      const wHit = wordAt(px, py) || itemAt(px, py);
      if (wHit) {
        e.preventDefault();
        try { getSelection().removeAllRanges(); } catch (_e) {}
        addOrderedSelectionItem({ ...wHit, kind: 'word', page: E.cur }, true);
        return;
      }
    }
  }
  if (E.tool === 'select' && e.target.id !== 'eov') {
    if (E.sel) { E.sel = null; updateContextualToolDock('select'); overlay(); }
    if (E.selC) { E.selC = null; overlay(); renderComments(); }
    hideSelBar();
    _wrapDownPt = { cx: e.clientX, cy: e.clientY, hadInline, hadSel, button: e.button };
  } else {
    _wrapDownPt = null;
  }
});
wrapEl.addEventListener('pointerup', e => {
  if (!_wrapDownPt || _wrapDownPt.button !== 0 || E.tool !== 'select' || !E.doc) return;
  const down = _wrapDownPt;
  _wrapDownPt = null;
  if (down.hadInline || down.hadSel) return;
  if (e.target.closest('#rp-inline-text-box') || e.target.closest('#rp-inline-table-box') || e.target.closest('#selbar')) return;
  const dist = Math.hypot(e.clientX - down.cx, e.clientY - down.cy);
  if (dist > 5) return; // User dragged to select text
  // Only open inline text on single-click if Type Text / Edit Text or directClickToWrite is active;
  // in Select mode, double-click opens inline text editor so single clicks don't spawn unwanted boxes!
  if (!E.directClickToWrite) return;
  clearTimeout(_wrapClickTimer);
  _wrapClickTimer = setTimeout(() => {
    if (selInfo() || E.inlineText || E.sel) return;
    const r = $('#ecv').getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    const px = (e.clientX - r.left) / K(), py = (e.clientY - r.top) / K();
    if (hit(px, py) || hitComment(px, py, 14 / K())) return;
    const it = itemAt(px, py);
    if (it) {
      openInlineTextEditor({ mode: 'pdfItem', item: it });
    } else {
      openInlineTextEditor({ mode: 'new', x: px, y: py });
    }
  }, 15);
});
wrapEl.addEventListener('dblclick', e => {
  clearTimeout(_wrapClickTimer);
  if (!E.doc || E.tool !== 'select' || e.target.closest('#rp-inline-text-box')) return;
  const r = $('#ecv').getBoundingClientRect(), px = (e.clientX - r.left) / K(), py = (e.clientY - r.top) / K();
  const cm = hitComment(px, py, 14 / K());
  if (cm) {
    e.preventDefault();
    editC(cm);
    return;
  }
  const a = hit(px, py);
  if (a && a.t === 'text') {
    e.preventDefault();
    openInlineTextEditor({ mode: 'editAnn', ann: a });
    return;
  }
  if (a && a.t === 'image' && a.equation) {
    e.preventDefault();
    openEquationStudio(a);
    return;
  }
  if (a && a.t === 'image' && a.gdtSpec) {
    e.preventDefault();
    openGDTBuilder(a);
    return;
  }
  if (a && a.t === 'image' && a.tableSpec) {
    e.preventDefault();
    const cellHit = hitTableCell(a, px, py);
    openInlineTableEditor(a, cellHit ? cellHit.row : 0, cellHit ? cellHit.col : 0);
    return;
  }
  const it = itemAt(px, py);
  if (it) {
    e.preventDefault();
    try { getSelection().removeAllRanges(); } catch (err) {}
    hideSelBar();
    openInlineTextEditor({ mode: 'pdfItem', item: it });
  } else {
    e.preventDefault();
    openInlineTextEditor({ mode: 'new', x: px, y: py });
  }
});
function selInfo() { const s = getSelection(); if (!s || s.isCollapsed || !s.rangeCount) return null; const r = s.getRangeAt(0); if (!$('#etl').contains(r.commonAncestorContainer)) return null; const txt = s.toString(); return txt.trim() ? { r, txt } : null; }
function selBoxes() {
  const info = selInfo(); if (!info) return []; const cr = $('#ecv').getBoundingClientRect(), k = K(), lw = cr.width / k, lh = cr.height / k;
  let rects = [...info.r.getClientRects()].filter(q => q.width > 1 && q.height > 1).map(q => ({ x0: (q.left - cr.left) / k, y0: (q.top - cr.top) / k, x1: (q.right - cr.left) / k, y1: (q.bottom - cr.top) / k })).filter(q => (q.x1 - q.x0) < lw * .98 || (q.y1 - q.y0) < lh * .5);
  rects.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0); const out = [];
  for (const q of rects) { const l = out[out.length - 1]; if (l && Math.abs(l.y0 - q.y0) < (l.y1 - l.y0) * .6 && q.x0 <= l.x1 + 2) { l.x1 = Math.max(l.x1, q.x1); l.y0 = Math.min(l.y0, q.y0); l.y1 = Math.max(l.y1, q.y1); } else out.push({ ...q }); }
  return out;
}
function hideSelBar() { const b = $('#selbar'); if (b) b.hidden = true; }
function showSelBar() {
  const info = selInfo(); if (!info || E.tool !== 'select') return hideSelBar(); const b = $('#selbar'), rr = info.r.getBoundingClientRect(); b.hidden = false;
  const bw = b.offsetWidth, bh = b.offsetHeight; b.style.left = Math.max(6, Math.min(innerWidth - bw - 6, rr.left + rr.width / 2 - bw / 2)) + 'px'; b.style.top = (rr.top - bh - 10 > 50 ? rr.top - bh - 10 : rr.bottom + 10) + 'px';
}
$('#etl').addEventListener('mouseup', () => setTimeout(showSelBar, 10));
$('#eview').addEventListener('scroll', () => { hideSelBar(); syncEditorFloatingBars(); }, { passive: true });
async function copySel() { const info = selInfo(); if (!info) return; const t = info.txt.trim(); try { if (window.native && window.native.copyText) await window.native.copyText(t); else await navigator.clipboard.writeText(t); } catch (e) { try { document.execCommand('copy'); } catch (err) {} } st('Copied ' + t.length + ' characters'); hideSelBar(); }
async function markFromSelection(sub, color) {
  const boxes = selBoxes(); if (!boxes.length) return st('Select some text first.'); if (!await ensureAuthor()) return;
  const r = await dialog('Comment (optional)', [{ type: 'textarea', id: 'v', label: '', rows: 3 }], 'Add'); if (!r) return;
  getSelection().removeAllRanges(); hideSelBar(); await addMarkup(E.cur, sub, null, r.v || '', color, boxes);
}
function itemAt(x, y) {
  const L = E.titems || [];
  for (let i = L.length - 1; i >= 0; i--) {
    const t = L[i];
    if (x >= t.x - 4 && x <= t.x + t.w + 6 && y >= t.base - t.h * 1.05 && y <= t.base + t.h * 0.45) return t;
  }
  let best = null, bestD = 14;
  for (let i = L.length - 1; i >= 0; i--) {
    const t = L[i];
    const cx = Math.max(t.x, Math.min(t.x + t.w, x));
    const cy = Math.max(t.base - t.h * 0.9, Math.min(t.base + t.h * 0.25, y));
    const d = Math.hypot(x - cx, y - cy);
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}

// Find the exact individual word token at (x, y) on the PDF page
function wordAt(x, y) {
  let words = E.wordItems || [];
  // Fallback if E.titems was populated directly without wordItems
  if (!words.length && Array.isArray(E.titems) && E.titems.length) {
    words = [];
    for (const it of E.titems) {
      if (!it || !it.str) continue;
      const totalChars = Math.max(1, it.str.length);
      const totalW = it.w || (it.str.length * (it.h || 12) * 0.55);
      const re = /\S+/g;
      let m;
      while ((m = re.exec(it.str)) !== null) {
        const wStr = m[0];
        const cStart = m.index;
        const cLen = wStr.length;
        words.push({
          str: wStr,
          x: it.x + (cStart / totalChars) * totalW,
          base: it.base,
          w: Math.max(4, (cLen / totalChars) * totalW),
          h: it.h || 12,
          fam: it.fam || 'Helvetica',
          bold: !!it.bold,
          italic: !!it.italic,
          parentItem: it
        });
      }
    }
    E.wordItems = words;
  }
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    if (x >= w.x - 3 && x <= w.x + w.w + 3 && y >= w.base - w.h * 1.02 && y <= w.base + w.h * 0.35) return w;
  }
  let best = null, bestD = 12;
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    const cx = Math.max(w.x, Math.min(w.x + w.w, x));
    const cy = Math.max(w.base - w.h * 0.9, Math.min(w.base + w.h * 0.25, y));
    const d = Math.hypot(x - cx, y - cy);
    if (d < bestD) { bestD = d; best = w; }
  }
  return best;
}

// ============================================================================
// ORDERED MULTI-SELECT ENGINE (1 -> 2 -> 3 -> 4 STRICT INSERTION ORDER)
// Never re-sorts or changes the user's click order!
// ============================================================================
function samplePdfTextColors(item) {
  const fallback = {
    fg: (item && (item.pdfColor || item.color)) || '#000000',
    bg: (item && item.pdfBgColor) || '#ffffff'
  };
  if (typeof document === 'undefined' || !item) return fallback;
  if (item.pdfColor && item.pdfBgColor) return { fg: item.pdfColor, bg: item.pdfBgColor };
  try {
    let srcCv = null;
    if (E._pageCanvasCache && E._lastRenderKey) {
      const ce = E._pageCanvasCache.get(E._lastRenderKey);
      if (ce && ce.canvas && ce.canvas.width > 0) srcCv = ce.canvas;
    }
    if (!srcCv) srcCv = document.getElementById('ecv');
    if (!srcCv || !srcCv.width || !srcCv.height || !E.vp || !E.vp.width || !E.vp.height) return fallback;
    const scX = srcCv.width / E.vp.width, scY = srcCv.height / E.vp.height;
    const ih = Number(item.h) || 12;
    const iw = Math.max(4, Number(item.w) || 12);
    const ix = Number(item.x) || 0;
    const iy = item.base != null ? (Number(item.base) - ih * 0.90) : (Number(item.y) || 0);
    const x0 = Math.max(0, Math.min(srcCv.width - 1, Math.floor((ix - 1) * scX)));
    const y0 = Math.max(0, Math.min(srcCv.height - 1, Math.floor(iy * scY)));
    const wPx = Math.max(1, Math.min(srcCv.width - x0, Math.ceil((iw + 2) * scX)));
    const hPx = Math.max(1, Math.min(srcCv.height - y0, Math.ceil((ih * 1.12) * scY)));
    const data = srcCv.getContext('2d').getImageData(x0, y0, wPx, hPx).data;
    const nPx = wPx * hPx;
    if (!nPx) return fallback;

    let maxLum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = data[i] + data[i + 1] + data[i + 2];
      if (lum > maxLum) maxLum = lum;
    }
    let bgR = 0, bgG = 0, bgB = 0, bgCnt = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = data[i] + data[i + 1] + data[i + 2];
      if (lum >= maxLum - 30) {
        bgR += data[i]; bgG += data[i + 1]; bgB += data[i + 2]; bgCnt++;
      }
    }
    bgR = bgCnt ? Math.round(bgR / bgCnt) : 255;
    bgG = bgCnt ? Math.round(bgG / bgCnt) : 255;
    bgB = bgCnt ? Math.round(bgB / bgCnt) : 255;
    const toHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
    const bgHex = (bgR >= 242 && bgG >= 242 && bgB >= 242) ? '#ffffff' : toHex(bgR, bgG, bgB);

    let peakDist = 0;
    for (let i = 0; i < data.length; i += 4) {
      const dist = Math.abs(bgR - data[i]) + Math.abs(bgG - data[i + 1]) + Math.abs(bgB - data[i + 2]);
      if (dist > peakDist) peakDist = dist;
    }
    if (peakDist < 36) {
      if (item.parentItem && item.parentItem !== item) {
        return samplePdfTextColors(item.parentItem);
      }
      return { fg: fallback.fg, bg: bgHex };
    }
    const thresh = peakDist * 0.78;
    let sumR = 0, sumG = 0, sumB = 0, sumW = 0;
    for (let i = 0; i < data.length; i += 4) {
      const dist = Math.abs(bgR - data[i]) + Math.abs(bgG - data[i + 1]) + Math.abs(bgB - data[i + 2]);
      if (dist >= thresh) {
        const w = dist * dist;
        sumR += data[i] * w;
        sumG += data[i + 1] * w;
        sumB += data[i + 2] * w;
        sumW += w;
      }
    }
    let fgR = sumW ? (sumR / sumW) : 0;
    let fgG = sumW ? (sumG / sumW) : 0;
    let fgB = sumW ? (sumB / sumW) : 0;
    const cMax = Math.max(fgR, fgG, fgB), cMin = Math.min(fgR, fgG, fgB);
    let fgHex;
    if (cMax - cMin <= 18 && cMin < 165) {
      fgHex = '#000000';
    } else {
      if (bgR >= 235 && bgG >= 235 && bgB >= 235 && cMin > 0 && cMin < 200) {
        const alpha = Math.max(0.45, (255 - cMin) / 255);
        fgR = Math.max(0, 255 - (255 - fgR) / alpha);
        fgG = Math.max(0, 255 - (255 - fgG) / alpha);
        fgB = Math.max(0, 255 - (255 - fgB) / alpha);
      }
      fgHex = toHex(fgR, fgG, fgB);
    }
    item.pdfColor = fgHex;
    item.pdfBgColor = bgHex;
    if (item.parentItem && !item.parentItem.pdfColor) {
      item.parentItem.pdfColor = fgHex;
      item.parentItem.pdfBgColor = bgHex;
    }
    return { fg: fgHex, bg: bgHex };
  } catch (e) {
    return fallback;
  }
}

function normalizeOrderedEntry(raw) {
  if (!raw) return null;
  const page = raw.page != null ? raw.page : E.cur;
  if (raw.kind === 'ann' || raw.t) {
    const a = raw.ann || raw;
    const [bx, by, bw, bh] = bbox(a);
    const label = a.text || a.revText || a.reqText || (a.t ? a.t.toUpperCase() : 'MARKUP');
    return {
      id: raw.id || `ann_${page}_${Math.round(bx)}_${Math.round(by)}_${label}`,
      kind: 'ann',
      page,
      str: String(label).trim(),
      x: bx,
      y: by,
      base: by + bh * 0.82,
      w: bw,
      h: bh,
      fam: a.fam || 'Helvetica',
      bold: !!a.bold,
      italic: !!a.italic,
      pdfColor: a.color || '#000000',
      pdfBgColor: a.bgColor || '#ffffff',
      ann: a
    };
  }
  const x = Number(raw.x) || 0;
  const h = Number(raw.h) || 12;
  const base = raw.base != null ? Number(raw.base) : ((Number(raw.y) || 0) + h * 0.85);
  const y = raw.y != null ? Number(raw.y) : (base - h * 0.88);
  const w = Math.max(4, Number(raw.w) || (String(raw.str || '').length * h * 0.55));
  const str = String(raw.str || '').trim();
  if (!str) return null;
  const sampled = samplePdfTextColors(raw);
  return {
    id: raw.id || `w_${page}_${Math.round(x * 10)}_${Math.round(base * 10)}_${str}`,
    kind: raw.kind || 'word',
    page,
    str,
    x,
    y,
    base,
    w,
    h,
    fam: raw.fam || 'Helvetica',
    bold: !!raw.bold,
    italic: !!raw.italic,
    pdfColor: raw.pdfColor || sampled.fg || '#000000',
    pdfBgColor: raw.pdfBgColor || sampled.bg || '#ffffff',
    parentItem: raw.parentItem || raw
  };
}

function renumberOrderedSelection() {
  if (!Array.isArray(E.multiSel)) E.multiSel = [];
  // Strictly preserve existing array sequence (1, 2, 3, 4...) without any coordinate sorting!
  E.multiSel.forEach((it, idx) => {
    it.order = idx + 1;
  });
}

function addOrderedSelectionItem(rawItem, toggleIfPresent = true) {
  const entry = normalizeOrderedEntry(rawItem);
  if (!entry) return null;
  if (!Array.isArray(E.multiSel)) E.multiSel = [];
  const existingIdx = E.multiSel.findIndex(it => it.id === entry.id);
  if (existingIdx !== -1) {
    if (toggleIfPresent) {
      E.multiSel.splice(existingIdx, 1);
      renumberOrderedSelection();
      renderOrderedSelectionBar();
      overlay();
      st(`Removed item from Ordered Selection (${E.multiSel.length} item${E.multiSel.length === 1 ? '' : 's'} remaining in exact order).`);
      return null;
    }
    return E.multiSel[existingIdx];
  }
  entry.order = E.multiSel.length + 1;
  E.multiSel.push(entry);
  renumberOrderedSelection();
  renderOrderedSelectionBar();
  overlay();
  st(`Selected #${entry.order}: "${entry.str}" — Order locked (${E.multiSel.map((x, i) => `#${i + 1} ${x.str}`).join(' → ')})`);
  return entry;
}

function removeOrderedSelectionItem(indexOrId) {
  if (!Array.isArray(E.multiSel)) return false;
  const idx = typeof indexOrId === 'number'
    ? indexOrId
    : E.multiSel.findIndex(it => it.id === indexOrId);
  if (idx < 0 || idx >= E.multiSel.length) return false;
  E.multiSel.splice(idx, 1);
  renumberOrderedSelection();
  renderOrderedSelectionBar();
  overlay();
  return true;
}

function moveOrderedSelectionItem(fromIdx, toIdx) {
  if (!Array.isArray(E.multiSel)) return false;
  if (fromIdx < 0 || fromIdx >= E.multiSel.length || toIdx < 0 || toIdx >= E.multiSel.length || fromIdx === toIdx) return false;
  const [moved] = E.multiSel.splice(fromIdx, 1);
  E.multiSel.splice(toIdx, 0, moved);
  renumberOrderedSelection();
  renderOrderedSelectionBar();
  overlay();
  return true;
}

function clearOrderedSelection() {
  E.multiSel = [];
  renderOrderedSelectionBar();
  overlay();
}

function getOrderedSelectionText(joiner = null) {
  if (!Array.isArray(E.multiSel) || !E.multiSel.length) return '';
  const mode = joiner != null ? joiner : (E.multiSelJoiner || ' ');
  // Strictly iterate E.multiSel in 0..N-1 insertion order (1, 2, 3, 4...)
  if (mode === 'numbered') {
    return E.multiSel.map((it, idx) => `${idx + 1}. ${it.str}`).join('\n');
  }
  return E.multiSel.map(it => it.str).join(mode);
}

async function copyOrderedSelection(joiner = null) {
  const txt = getOrderedSelectionText(joiner);
  if (!txt) {
    st('Select words in order (1, 2, 3, 4...) first.');
    return '';
  }
  try {
    if (window.native && window.native.copyText) await window.native.copyText(txt);
    else if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(txt);
  } catch (e) {
    try { document.execCommand('copy'); } catch (_e) {}
  }
  const msg = `Copied ${E.multiSel.length} items in exact 1→${E.multiSel.length} order: "${txt.slice(0, 64)}${txt.length > 64 ? '...' : ''}"`;
  st(msg);
  if (window.rpToast) window.rpToast(msg);
  return txt;
}

function applyOrderedWordsReplacements(newStrings, styleOpts = {}) {
  if (!Array.isArray(E.multiSel) || !E.multiSel.length) return 0;
  pushAnnState(`Edit ${E.multiSel.length} selected items in order`);
  const g = 'g_ord_' + Date.now();
  let count = 0;
  // Apply strictly in 1 -> 2 -> 3 -> 4 order
  E.multiSel.forEach((item, idx) => {
    const newStr = Array.isArray(newStrings)
      ? (idx < newStrings.length ? newStrings[idx] : item.str)
      : item.str;
    const sampled = samplePdfTextColors(item);
    const fam = styleOpts.fam || famOf(item);
    const sz = Number(styleOpts.sz || styleOpts.size) || +(item.h || 12).toFixed(2);
    const col = styleOpts.col || styleOpts.color || item.pdfColor || item.color || sampled.fg || '#000000';
    const bgCol = item.pdfBgColor || sampled.bg || '#ffffff';
    const bold = styleOpts.bold != null ? !!styleOpts.bold : !!item.bold;
    const italic = styleOpts.italic != null ? !!styleOpts.italic : !!item.italic;
    if (item.kind === 'ann' && item.ann) {
      if (newStr != null && ('text' in item.ann)) { item.ann.text = String(newStr); item.str = String(newStr); }
      if (styleOpts.col || styleOpts.color) { item.ann.color = col; item.pdfColor = col; }
      if (styleOpts.fam && item.ann.t === 'text') item.ann.fam = fam;
      if ((styleOpts.sz || styleOpts.size) && item.ann.t === 'text') item.ann.size = sz;
      count++;
      return;
    }
    const targetPage = item.page != null ? item.page : E.cur;
    const pageList = (E.ann[targetPage] = E.ann[targetPage] || []);
    if (item._replacedAnn && pageList.includes(item._replacedAnn)) {
      item._replacedAnn.text = String(newStr ?? '');
      item._replacedAnn.color = col;
      item._replacedAnn.size = sz;
      item._replacedAnn.fam = fam;
      item._replacedAnn.bold = bold;
      item._replacedAnn.italic = italic;
      item._replacedAnn.y = item.base - sz * BASE;
      item.str = String(newStr ?? '');
      item.pdfColor = col;
      count++;
      return;
    }
    pageList.push({
      t: 'whiteout',
      x: item.x - 1.2,
      y: item.base - item.h * 0.88,
      w: item.w + 2.4,
      h: item.h * 1.18,
      color: bgCol,
      size: 1,
      g,
      op: 1,
      flat: !!styleOpts.flat
    });
    if (newStr != null && String(newStr).length > 0) {
      const txtAnn = {
        t: 'text',
        x: item.x,
        y: item.base - sz * BASE,
        text: String(newStr),
        color: col,
        size: sz,
        fam,
        bold,
        italic,
        g,
        op: 1
      };
      pageList.push(txtAnn);
      item._replacedAnn = txtAnn;
      item.str = String(newStr);
      item.pdfColor = col;
    }
    count++;
  });
  renderOrderedSelectionBar();
  overlay();
  updateDocInspector();
  return count;
}

async function editOrderedSelectionInOrder() {
  if (!Array.isArray(E.multiSel) || !E.multiSel.length) {
    return st('Click words 1, 2, 3, 4 in order first.');
  }
  E.multiSel.forEach(it => {
    const s = samplePdfTextColors(it);
    if (!it.pdfColor) it.pdfColor = s.fg;
    if (!it.pdfBgColor) it.pdfBgColor = s.bg;
  });
  const first = E.multiSel[0];
  const detectedFam = famOf(first);
  const initialSz = +(first.h || 12).toFixed(2);
  const initialCol = first.pdfColor || samplePdfTextColors(first).fg || '#000000';
  const orderedPreview = E.multiSel.map((it, idx) => `#${idx + 1}: ${it.str}`).join('  →  ');
  const fields = [
    { type: 'note', label: `Strict Selection Order Locked (${E.multiSel.length} items): ${orderedPreview}` },
    {
      type: 'textarea',
      id: 'v',
      label: `Edit Selected Words in Exact 1 → ${E.multiSel.length} Order (Line 1 = #1, Line 2 = #2, etc.):`,
      rows: Math.min(8, E.multiSel.length + 1),
      value: E.multiSel.map(it => it.str).join('\n')
    },
    { type: 'symbols' },
    { type: 'select', id: 'fam', label: 'Font Family', value: detectedFam, options: getFontOptionsList() },
    { type: 'number', id: 'sz', label: 'Font Size (pt)', value: initialSz, min: 4, max: 140, step: 'any' },
    { type: 'color', id: 'col', label: 'Text Colour (Preserves PDF Colour unless changed)', value: initialCol },
    { type: 'checkbox', id: 'bold', label: 'Bold', value: !!first.bold },
    { type: 'checkbox', id: 'italic', label: 'Italic', value: !!first.italic }
  ];
  const r = await dialog(`Edit ${E.multiSel.length} Selected Items in Exact Order (1 → ${E.multiSel.length})`, fields, 'Apply in Order');
  if (!r) return;
  const mod = r._modified || {};
  const lines = String(r.v ?? '').split('\n');
  const updated = applyOrderedWordsReplacements(lines, {
    fam: mod.fam ? r.fam : null,
    sz: mod.sz ? r.sz : null,
    col: mod.col ? r.col : null,
    bold: mod.bold ? r.bold : null,
    italic: mod.italic ? r.italic : null
  });
  st(`Updated ${updated} items in exact 1→${E.multiSel.length} order.`);
}

async function markOrderedSelection(sub = 'Highlight', color = '#ffe600') {
  if (!Array.isArray(E.multiSel) || !E.multiSel.length) return st('Select words in order first.');
  pushAnnState(`${sub} ${E.multiSel.length} items in order`);
  E.multiSel.forEach(item => {
    const pg = item.page != null ? item.page : E.cur;
    if (sub === 'Highlight') {
      (E.ann[pg] = E.ann[pg] || []).push({
        t: 'highlight',
        x: item.x - 1,
        y: item.y,
        w: item.w + 2,
        h: item.h,
        color,
        op: 0.35
      });
    } else if (sub === 'Underline') {
      (E.ann[pg] = E.ann[pg] || []).push({
        t: 'line',
        x1: item.x,
        y1: item.base + 1.5,
        x2: item.x + item.w,
        y2: item.base + 1.5,
        color,
        size: 1.6,
        op: 1
      });
    } else if (sub === 'StrikeOut') {
      (E.ann[pg] = E.ann[pg] || []).push({
        t: 'line',
        x1: item.x,
        y1: item.base - item.h * 0.32,
        x2: item.x + item.w,
        y2: item.base - item.h * 0.32,
        color,
        size: 1.6,
        op: 1
      });
    } else if (sub === 'Whiteout') {
      (E.ann[pg] = E.ann[pg] || []).push({
        t: 'whiteout',
        x: item.x - 1.5,
        y: item.y - 1,
        w: item.w + 3,
        h: item.h + 2,
        color: '#ffffff',
        size: 1,
        op: 1
      });
    }
  });
  overlay();
  updateDocInspector();
  st(`Applied ${sub} to ${E.multiSel.length} items in exact 1→${E.multiSel.length} order.`);
}

function renderOrderedSelectionBar() {
  if (typeof document === 'undefined') return;
  const ev = $('#eview');
  if (!ev) return;
  let bar = $('#rp-ordered-sel-bar');
  if (!Array.isArray(E.multiSel) || E.multiSel.length === 0) {
    if (bar) bar.hidden = true;
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'rp-ordered-sel-bar';
    bar.className = 'rp-ordered-sel-bar';
    bar.addEventListener('pointerdown', e => e.stopPropagation());
    bar.addEventListener('click', e => e.stopPropagation());
    ev.insertBefore(bar, ev.firstChild);
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => syncEditorFloatingBars()).observe(bar);
    }
  }
  bar.hidden = false;
  const escH = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const curJoin = E.multiSelJoiner || ' ';
  bar.innerHTML = `
    <div class="osb-top">
      <span class="osb-title" title="Strict Click-Order Multi-Selection: Items stay in exact 1 → 2 → 3 → 4 order">
        <span class="osb-badge">1·2·3·4</span>
        <b>Ordered Selection (${E.multiSel.length})</b>
        <small>Order Locked</small>
      </span>
      <div class="osb-actions">
        <label class="osb-join-lbl" title="Separator when copying ordered words">Join:
          <select id="osb-join-sel">
            <option value=" " ${curJoin === ' ' ? 'selected' : ''}>Space (1 2 3 4)</option>
            <option value="\n" ${curJoin === '\n' ? 'selected' : ''}>Newline (Lines)</option>
            <option value=", " ${curJoin === ', ' ? 'selected' : ''}>Comma (1, 2, 3)</option>
            <option value="numbered" ${curJoin === 'numbered' ? 'selected' : ''}>Numbered (1. 2. 3.)</option>
          </select>
        </label>
        <button type="button" class="osb-btn primary" id="osb-copy" title="Copy selected words in exact 1→2→3→4 order">Copy in Order</button>
        <button type="button" class="osb-btn primary" id="osb-edit" title="Edit selected words in exact 1→2→3→4 order">Edit in Order</button>
        <button type="button" class="osb-btn" id="osb-hl" title="Highlight all selected words in order">Highlight</button>
        <button type="button" class="osb-btn" id="osb-ul" title="Underline all selected words in order">Underline</button>
        <button type="button" class="osb-btn" id="osb-st" title="Strikeout all selected words in order">Strike</button>
        <button type="button" class="osb-btn danger" id="osb-del" title="Whiteout / Erase selected items">Erase</button>
        <button type="button" class="osb-btn" id="osb-clear" title="Clear ordered selection (Esc)">✕ Clear</button>
      </div>
    </div>
    <div class="osb-chips" id="osb-chips">
      ${E.multiSel.map((it, idx) => `
        <div class="osb-chip" data-osb-idx="${idx}" title="Selected #${idx + 1}: &quot;${escH(it.str)}&quot; (Click ◀/▶ to adjust order or × to remove)">
          <span class="osb-chip-num">#${idx + 1}</span>
          <span class="osb-chip-txt">${escH(it.str.length > 22 ? it.str.slice(0, 20) + '…' : it.str)}</span>
          ${idx > 0 ? `<button type="button" class="osb-chip-mv" data-mv-from="${idx}" data-mv-to="${idx - 1}" title="Move earlier">◀</button>` : ''}
          ${idx < E.multiSel.length - 1 ? `<button type="button" class="osb-chip-mv" data-mv-from="${idx}" data-mv-to="${idx + 1}" title="Move later">▶</button>` : ''}
          <button type="button" class="osb-chip-rm" data-rm-idx="${idx}" title="Remove #${idx + 1}">×</button>
        </div>
      `).join('<span class="osb-arrow">→</span>')}
    </div>
  `;

  const joinSel = bar.querySelector('#osb-join-sel');
  if (joinSel) {
    joinSel.onchange = () => {
      E.multiSelJoiner = joinSel.value === '\\n' ? '\n' : joinSel.value;
    };
  }
  const bCopy = bar.querySelector('#osb-copy');
  if (bCopy) bCopy.onclick = () => copyOrderedSelection();
  const bEdit = bar.querySelector('#osb-edit');
  if (bEdit) bEdit.onclick = () => editOrderedSelectionInOrder();
  const bHl = bar.querySelector('#osb-hl');
  if (bHl) bHl.onclick = () => markOrderedSelection('Highlight', '#ffe600');
  const bUl = bar.querySelector('#osb-ul');
  if (bUl) bUl.onclick = () => markOrderedSelection('Underline', '#e11d48');
  const bSt = bar.querySelector('#osb-st');
  if (bSt) bSt.onclick = () => markOrderedSelection('StrikeOut', '#e11d48');
  const bDel = bar.querySelector('#osb-del');
  if (bDel) bDel.onclick = () => markOrderedSelection('Whiteout', '#ffffff');
  const bClr = bar.querySelector('#osb-clear');
  if (bClr) bClr.onclick = () => clearOrderedSelection();

  bar.querySelectorAll('.osb-chip-rm').forEach(btn => {
    btn.onclick = () => removeOrderedSelectionItem(+btn.dataset.rmIdx);
  });
  bar.querySelectorAll('.osb-chip-mv').forEach(btn => {
    btn.onclick = () => moveOrderedSelectionItem(+btn.dataset.mvFrom, +btn.dataset.mvTo);
  });
  syncEditorFloatingBars();
}
function itemsIn(boxes) {
  return (E.titems || []).filter(t => boxes.some(b => Math.min(t.x + t.w, b.x1) - Math.max(t.x, b.x0) > 1 && Math.min(t.base + t.h * .25, b.y1) - Math.max(t.base - t.h * .85, b.y0) > t.h * .35))
    .sort((a, b) => Math.abs(a.base - b.base) < a.h * .5 ? a.x - b.x : a.base - b.base);
}
const famOf = t => /serif/.test(t.fam) && !/sans/.test(t.fam) ? 'Times' : /mono/.test(t.fam) ? 'Courier' : 'Helvetica';
async function editItems(items, sub) {
  if (!E.titems || !E.titems.length) return st('Editing text needs an upright page that has real text (not a scan).');
  if (!items.length) return st('Click directly on a piece of text, or select it first.');
  items.forEach(t => {
    const s = samplePdfTextColors(t);
    if (!t.pdfColor) t.pdfColor = s.fg;
    if (!t.pdfBgColor) t.pdfBgColor = s.bg;
  });
  const single = items.length === 1 && sub && items[0].str.includes(sub);
  const detectedFam = famOf(items[0]);
  const initialSz = +(items[0].h || 12).toFixed(2);
  const initialCol = items[0].pdfColor || samplePdfTextColors(items[0]).fg || '#000000';
  const fields = [
    single ? { type: 'textarea', id: 'v', label: 'Replace the selected text with:', rows: 2, value: sub }
      : { type: 'textarea', id: 'v', label: items.length > 1 ? 'Edit the text (one line for each piece of text):' : 'Edit the text:', rows: Math.min(6, items.length + 1), value: items.map(t => t.str).join('\n') },
    { type: 'symbols' },
    { type: 'select', id: 'fam', label: 'Font Family', value: detectedFam, options: getFontOptionsList() },
    { type: 'number', id: 'sz', label: 'Font Size (pt)', value: initialSz, min: 4, max: 140, step: 'any' },
    { type: 'color', id: 'col', label: 'Text colour (Preserves PDF colour unless changed)', value: initialCol },
    { type: 'checkbox', id: 'flat', label: 'Flatten page to raster image (removes underlying text layer)', value: false },
    { type: 'checkbox', id: 'bold', label: 'Bold', value: !!items[0].bold },
    { type: 'checkbox', id: 'italic', label: 'Italic', value: !!items[0].italic }
  ];
  const r = await dialog(single ? 'Replace Selected PDF Text' : 'Edit PDF Text In-Place', fields, 'Apply'); if (!r) return;
  const mod = r._modified || {};
  pushAnnState('In-place PDF text edit');
  const g = 'g' + Date.now(), cm = _scratchCtx, lines = single ? null : r.v.split('\n'); let n = 0;
  items.forEach((t, j) => {
    const s = samplePdfTextColors(t);
    const fam = mod.fam ? (r.fam || famOf(t)) : famOf(t);
    const itemSz = mod.sz ? (r.sz || t.h) : +(t.h || 12).toFixed(2);
    const itemCol = mod.col ? r.col : (t.pdfColor || s.fg || '#000000');
    const bgCol = t.pdfBgColor || s.bg || '#ffffff';
    const isBold = mod.bold ? !!r.bold : !!t.bold;
    const isItalic = mod.italic ? !!r.italic : !!t.italic;
    cm.font = `${isBold ? 'bold ' : ''}${t.h}px ${cssFam(fam)}`; let xs = t.x, newStr;
    if (single) { const idx = t.str.indexOf(sub), pre = t.str.slice(0, idx), suf = t.str.slice(idx + sub.length), all = cm.measureText(t.str).width || 1; xs = t.x + cm.measureText(pre).width * (t.w / all); newStr = r.v + suf; }
    else { newStr = j === items.length - 1 ? lines.slice(j).join(' ') : (lines[j] ?? ''); }
    n++;
    addAnn({ t: 'whiteout', x: xs - 1.5, y: t.base - t.h * .88, w: (t.x + t.w - xs) + 4, h: t.h * 1.2 + 2, color: bgCol, size: 1, g, op: 1, flat: !!r.flat }, true);
    if (newStr) addAnn({ t: 'text', x: xs, y: t.base - itemSz * BASE, text: newStr, color: itemCol, size: itemSz, fam, bold: isBold, italic: isItalic, g, op: 1 }, true);
  });
  try { getSelection().removeAllRanges(); } catch (e) {} hideSelBar(); st(n ? 'Text updated. Press Ctrl+Z to undo or Save to keep.' : 'Nothing was changed.');
}
function editFromSelection() {
  const info = selInfo();
  if (!info) return st('Select some text first.');
  const items = itemsIn(selBoxes()), t = info.txt.trim();
  return editItems(items, items.length === 1 && items[0].str.includes(t) ? t : null);
}
$('#sbCopy').onclick = copySel; $('#sbHl').onclick = () => markFromSelection('Highlight', '#ffe600'); $('#sbUl').onclick = () => markFromSelection('Underline', '#e11d48'); $('#sbSt').onclick = () => markFromSelection('StrikeOut', '#e11d48'); $('#sbEd').onclick = editFromSelection;
if ($('#sbAddOrder')) {
  $('#sbAddOrder').onclick = () => {
    const info = selInfo();
    const boxes = selBoxes();
    if (!info || !boxes.length) return st('Select a word or phrase first.');
    const b0 = boxes[0];
    const x0 = Math.min(...boxes.map(b => b.x0));
    const y0 = Math.min(...boxes.map(b => b.y0));
    const x1 = Math.max(...boxes.map(b => b.x1));
    const y1 = Math.max(...boxes.map(b => b.y1));
    addOrderedSelectionItem({
      kind: 'word',
      page: E.cur,
      str: info.txt.trim(),
      x: x0,
      y: y0,
      base: y1 - (y1 - y0) * 0.15,
      w: Math.max(8, x1 - x0),
      h: Math.max(10, y1 - y0)
    }, false);
    try { getSelection().removeAllRanges(); } catch (_e) {}
    hideSelBar();
  };
}

// ---------- pointer tools & contextual tool-options dock ----------
const TOOLS_SIZE = { cnote: 14, chl: 14, cul: 14, cst: 14, stamp: 18, text: 14, cloud: 2, leader: 2, rect: 2, circle: 2, poly: 2, line: 2, arrow: 2, draw: 3, eraser: 18, pin: 24, checkmk: 22, crossmk: 22, select: 14, hand: 14, edittext: 14, measure: 2, area: 2, angle: 2, rad3: 2, fai: 24, highlight: 14, whiteout: 14, redact: 14, image: 14, sign: 14 };
const TOOLS_DEFAULT_COLOR = { draw: '#e11d48', rect: '#e11d48', circle: '#e11d48', poly: '#e11d48', line: '#e11d48', arrow: '#e11d48', cloud: '#e11d48', leader: '#e11d48', text: '#e11d48', pin: '#f59e0b', checkmk: '#059669', crossmk: '#e11d48', highlight: '#ffe600', chl: '#ffe600', cul: '#e11d48', cst: '#e11d48', cnote: '#ffc400', measure: '#0066ff', area: '#10b981' };

function getToolSetting(t, key, fallback) {
  if (E.toolSettings[t] && E.toolSettings[t][key] != null) return E.toolSettings[t][key];
  return fallback;
}
function saveToolSetting(t, key, val) {
  if (!t) return;
  E.toolSettings[t] = E.toolSettings[t] || {};
  E.toolSettings[t][key] = val;
}

function syncSizePresetsUI(val) {
  const n = Math.round(+val || 0);
  document.querySelectorAll('#ePenPresets .rp-sz-pre').forEach(b => b.classList.toggle('on', +b.dataset.sz === n));
  document.querySelectorAll('#eEraserOpts .rp-er-pre').forEach(b => b.classList.toggle('on', +b.dataset.er === n));
  document.querySelectorAll('#ePinOpts .rp-pin-pre').forEach(b => b.classList.toggle('on', +b.dataset.psz === n));
}

function shouldShowContextualDock(activeTool) {
  const activeTabBtn = document.querySelector('#edit-ribbon-tabs .rp-tab-btn.active');
  const activeTab = activeTabBtn ? activeTabBtn.dataset.etab : 'home';
  if (activeTab && !['home', 'draw', 'stamps', 'all'].includes(activeTab)) return false;
  const t = (activeTool === 'select' && E.sel && E.sel.t) ? E.sel.t : (activeTool || E.tool || 'select');
  return ['draw', 'rect', 'circle', 'line', 'arrow', 'poly', 'cloud', 'leader', 'eraser', 'pin', 'checkmk', 'crossmk'].includes(t);
}

function updateContextualToolDock(activeTool) {
  const t = (activeTool === 'select' && E.sel && E.sel.t) ? E.sel.t : (activeTool || E.tool || 'select');
  const isStroke = ['draw', 'rect', 'circle', 'line', 'arrow', 'poly', 'cloud', 'leader'].includes(t);
  const isShapeFill = ['rect', 'circle', 'poly'].includes(t);
  const isEraser = t === 'eraser';
  const isPinOrTick = ['pin', 'checkmk', 'crossmk'].includes(t);
  const showDock = shouldShowContextualDock(activeTool);

  // Font & Paragraph Set (#eFontSet / #eRowFont / #eRowTextFmt) is ALWAYS visible outside in its own MS Office set!
  if ($('#eRowFont')) $('#eRowFont').hidden = false;
  if ($('#eRowTextFmt')) $('#eRowTextFmt').hidden = false;

  // Contextual Tool Options (#eStyleDock) ONLY appears when Pen, Shape, Eraser, or Pin is active/selected!
  if ($('#eStyleDock')) $('#eStyleDock').hidden = !showDock;
  const _actTab = document.querySelector('#edit-ribbon-tabs .rp-tab-btn.active')?.dataset?.etab || 'home';
  if ($('#eWordStylesGrp') && _actTab === 'home') $('#eWordStylesGrp').hidden = showDock;
  if ($('#ePenPresets')) $('#ePenPresets').hidden = !isStroke;
  if ($('#eEraserOpts')) $('#eEraserOpts').hidden = !isEraser;
  if ($('#ePinOpts')) $('#ePinOpts').hidden = !isPinOrTick;
  if ($('#eColorStrokeCol')) $('#eColorStrokeCol').hidden = isEraser;
  if ($('#eDashWrap')) $('#eDashWrap').hidden = !(['draw', 'rect', 'circle', 'line', 'arrow', 'poly', 'leader'].includes(t));
  if ($('#eFillWrap')) $('#eFillWrap').hidden = !isShapeFill;
  if ($('#eStrokeDec')) $('#eStrokeDec').hidden = isEraser || isPinOrTick;
  if ($('#eStrokeInc')) $('#eStrokeInc').hidden = isEraser || isPinOrTick;

  const lbl = $('#eSizeLbl');
  if (lbl) {
    if (t === 'draw') lbl.textContent = 'Pen (px)';
    else if (isStroke) lbl.textContent = 'Stroke (px)';
    else if (isEraser) lbl.textContent = 'Eraser (px)';
    else if (isPinOrTick) lbl.textContent = 'Badge (px)';
    else lbl.textContent = 'Width (px)';
  }
  const cap = $('#eStyleCap');
  if (cap) {
    const capMap = {
      draw: 'Pen Options (Width, Dash, Colour & Alpha)',
      eraser: 'Eraser Options (Mode & Brush Radius)',
      pin: 'Pin Marker Options (Badge Size & Colour)',
      checkmk: 'Checkmark Options (Size & Colour)',
      crossmk: 'Cross Mark Options (Size & Colour)',
      rect: 'Box Options (Stroke Width, Dash, Fill & Colour)',
      circle: 'Circle Options (Stroke Width, Dash, Fill & Colour)',
      poly: 'Polygon Options (Stroke Width, Dash, Fill & Colour)',
      line: 'Line Options (Width, Dash & Colour)',
      arrow: 'Arrow Options (Width, Dash & Colour)',
      cloud: 'Revision Cloud Options (Width & Colour)',
      leader: 'Callout Options (Width & Colour)'
    };
    cap.title = capMap[t] || 'Active Tool Options';
    cap.textContent = 'Style';
  }
  if ($('#eSize')) syncSizePresetsUI($('#eSize').value);
}

function syncSwatchHighlight(col) {
  const low = String(col || '').toLowerCase();
  document.querySelectorAll('#eSwatches .rp-swatch').forEach(b => b.classList.toggle('on', (b.dataset.col || '').toLowerCase() === low));
}
function getActiveAlign() {
  if ($('#eAlignC') && $('#eAlignC').classList.contains('on')) return 'center';
  if ($('#eAlignR') && $('#eAlignR').classList.contains('on')) return 'right';
  if ($('#eAlignJ') && $('#eAlignJ').classList.contains('on')) return 'justify';
  return 'left';
}
function setActiveAlignUI(al) {
  ['#eAlignL', '#eAlignC', '#eAlignR', '#eAlignJ'].forEach(sel => {
    const b = $(sel);
    if (b) b.classList.toggle('on', b.dataset.align === (al || 'left'));
  });
}
function syncFontSizeUI(ptVal) {
  const v = Math.max(4, Math.min(200, Math.round(+ptVal || 14)));
  if ($('#eFontSize')) $('#eFontSize').value = v;
  if ($('#eFontSizePreset')) {
    const sel = $('#eFontSizePreset');
    const match = [...sel.options].some(o => +o.value === v);
    if (!match) {
      let cust = sel.querySelector('option[data-custom="1"]');
      if (!cust) {
        cust = document.createElement('option');
        cust.dataset.custom = '1';
        sel.appendChild(cust);
      }
      cust.value = String(v);
      cust.textContent = v + ' pt';
    }
    sel.value = String(v);
  }
}
function syncRibbonFromSelectedAnn(a) {
  if (!a) { updateContextualToolDock(E.tool); return; }
  if (a.color) {
    $('#eColor').value = a.color;
    syncSwatchHighlight(a.color);
    if (a.t === 'text' && $('#eTextColor')) $('#eTextColor').value = a.color;
  }
  const sz = a.t === 'stamp' ? (a.fs || 18) : (['pin', 'checkmk', 'crossmk'].includes(a.t) ? (a.w || a.size || 22) : (a.size || 14));
  if (a.t === 'text' || a.t === 'stamp') {
    syncFontSizeUI(sz);
  } else if ($('#eSize')) {
    $('#eSize').value = Math.round(sz);
    syncSizePresetsUI(sz);
  }
  if ($('#eOp')) $('#eOp').value = Math.round((a.op == null ? 1 : a.op) * 100);
  if ($('#eFill')) $('#eFill').checked = !!a.fill;
  if (a.bgColor && $('#eBgColor')) $('#eBgColor').value = a.bgColor;
  if ($('#eDash')) $('#eDash').value = a.dash || 'solid';
  if (a.t === 'text' && $('#eLineSpacing')) $('#eLineSpacing').value = String(a.lineHeight || '1.22');
  if (a.t === 'text') {
    if ($('#eFontFam')) $('#eFontFam').value = a.fam || 'Helvetica';
    if ($('#eBold')) $('#eBold').classList.toggle('on', !!a.bold);
    if ($('#eItalic')) $('#eItalic').classList.toggle('on', !!a.italic);
    if ($('#eUnderline')) $('#eUnderline').classList.toggle('on', !!a.underline);
    if ($('#eStrike')) $('#eStrike').classList.toggle('on', !!a.strike);
    if ($('#eTextBg')) $('#eTextBg').checked = !!a.bgBox;
    setActiveAlignUI(a.align || 'left');
  }
  updateContextualToolDock('select');
}

function setTool(t) {
  if (E.inlineText) commitInlineTextEditor();
  if (E.inlineTable) commitInlineTableEditor();
  // Save current tool's size, color, opacity & dash before switching
  if (E.tool && !['text', 'edittext', 'select', 'hand'].includes(E.tool) && $('#eSize')) {
    saveToolSetting(E.tool, 'size', +$('#eSize').value || TOOLS_SIZE[E.tool] || 2);
  }
  if (E.tool && $('#eColor') && E.tool !== 'eraser') saveToolSetting(E.tool, 'color', $('#eColor').value);
  if (E.tool && $('#eOp') && E.tool !== 'eraser') saveToolSetting(E.tool, 'op', +$('#eOp').value || 100);
  if (E.tool && $('#eDash') && E.tool !== 'eraser') saveToolSetting(E.tool, 'dash', $('#eDash').value || 'solid');

  E.tool = t;
  E.polyPts = [];
  E.tmp = null;
  E.eraserCur = null;
  if (t !== 'select') E.sel = null;
  document.querySelectorAll('.rp-edit-ribbon button[data-t], #tools button, #ctools button, #mtools button[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === t));

  const savedSize = getToolSetting(t, 'size', TOOLS_SIZE[t] != null ? TOOLS_SIZE[t] : 3);
  if (!['text', 'edittext'].includes(t) && $('#eSize')) $('#eSize').value = savedSize;

  const savedCol = getToolSetting(t, 'color', TOOLS_DEFAULT_COLOR[t] || null);
  if (savedCol && $('#eColor')) $('#eColor').value = savedCol;
  const savedOp = getToolSetting(t, 'op', 100);
  if ($('#eOp') && t !== 'eraser') $('#eOp').value = savedOp;
  const savedDash = getToolSetting(t, 'dash', 'solid');
  if ($('#eDash') && t !== 'eraser') $('#eDash').value = savedDash;

  syncSwatchHighlight($('#eColor') ? $('#eColor').value : '#e11d48');
  updateContextualToolDock(t);

  E.img = null; E.stamp = null;
  $('#eov').style.cursor = t === 'select' ? 'default' : t === 'hand' ? 'grab' : (t === 'text' || t === 'edittext') ? 'text' : 'crosshair';
  if (t === 'image') pickImage(); if (t === 'sign') signPad(); if (t === 'stamp') stampPad();
  E.hov = null; setPE(); syncHudBar(); syncEditorToolPill(); overlay();
  if (t === 'text') {
    if (!E.bytes && ops && typeof ops.blank === 'function') {
      ops.blank().then(() => st('Created blank A4 PDF — click anywhere on the page to start typing!'));
    } else {
      st('Type Text active — click anywhere on the PDF page to start typing directly on the page!');
    }
  }
  else if (t === 'multisel') st('Ordered Multi-Select (1·2·3·4) active — click Word 1, Word 2, Word 3, Word 4 in any sequence. Your exact selection order is locked and never re-sorted!');
  else if (t === 'edittext') st('Edit PDF Text active — click on any text on the PDF page to edit it in-place right on the page!');
  else if (t === 'hand') st('Hand tool active — drag anywhere on the page to pan.');
  else if (t === 'draw') {
    if (!E.bytes && ops && typeof ops.blank === 'function') {
      ops.blank().then(() => st(`Created blank A4 PDF — Freehand Pen active (${savedSize}px), drag on the page to draw!`));
    } else {
      st(`Freehand Pen active (${savedSize}px) — drag on the page to draw, or adjust Pen Width in the ribbon.`);
    }
  }
  else if (t === 'poly') st('Polygon/Polyline tool — click points on the page, double-click or press Enter to finish.');
  else if (t === 'area') st('Area Measurement tool — drag a rectangle or click polygon vertices (double-click or Enter to finish).');
  else if (t === 'eraser') st(`Eraser active (${E.eraserMode === 'brush' ? 'Brush Radius' : 'Whole Markup'}, ${savedSize}px) — click or drag over any markup to erase.`);
  else if (t === 'pin') st(`Pin Marker active (${savedSize}px) — click on the page to place a numbered inspection pin.`);
  else if (t === 'checkmk' || t === 'crossmk') st(`Click on the page to place a ${t === 'checkmk' ? 'Checkmark (✓)' : 'Cross (✗)'} (${savedSize}px).`);
  else if (t === 'select') st('Select tool — click an annotation to move/resize/style it, or double-click any text to edit inline.');
}
function syncEditorToolPill() {
  if (typeof document === 'undefined') return;
  const tabRow = $('#edit-ribbon-tabs');
  if (!tabRow) return;
  let pill = $('#ed-active-tool-pill');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'ed-active-tool-pill';
    pill.className = 'rp-tool-pill';
    pill.hidden = true;
    pill.innerHTML = `
      <i data-ic="crosshair"></i>
      <span id="ed-active-tool-name">Tool: Select</span>
      <button type="button" id="ed-finish-tool-btn" class="rp-tool-act-btn act-done" title="Done">Done</button>
      <button type="button" id="ed-rewind-tool-btn" class="rp-tool-act-btn act-rewind" title="Rewind">Rewind</button>
      <button type="button" id="ed-cancel-tool-btn" class="rp-tool-act-btn act-cancel" title="Cancel">Cancel</button>
      <button type="button" id="ed-off-tool-btn" class="rp-tool-act-btn act-off" title="Turn Off Tool">Off</button>
    `;
    const qbar = tabRow.querySelector('.rp-edit-quickbar');
    if (qbar) tabRow.insertBefore(pill, qbar);
    else tabRow.appendChild(pill);
    if (typeof hydrateIcons === 'function') hydrateIcons(pill);
    pill.querySelector('#ed-finish-tool-btn').onclick = () => toolDone();
    pill.querySelector('#ed-rewind-tool-btn').onclick = () => toolRewind();
    pill.querySelector('#ed-cancel-tool-btn').onclick = () => toolCancel();
    pill.querySelector('#ed-off-tool-btn').onclick = () => toolOff();
  }
  const active = E.tool && E.tool !== 'select';
  pill.hidden = !active;
  if (active) {
    const nm = pill.querySelector('#ed-active-tool-name');
    if (nm) nm.textContent = `Active: ${E.tool.toUpperCase()} · Right-click for Done / Rewind / Cancel`;
  }
}

async function toolDone() {
  if (E.inlineText) commitInlineTextEditor();
  if (E.inlineTable) await commitInlineTableEditor();
  if ((E.tool === 'poly' || E.tool === 'area') && E.polyPts && E.polyPts.length >= (E.tool === 'area' ? 3 : 2)) {
    finishPolygonTool();
  } else if (E.tmp) {
    const a = E.tmp;
    E.tmp = null;
    E._lineClickMode = false;
    const [, , w, h] = bbox(a);
    if (a.t === 'meas' && (w > 2 || h > 2)) {
      pushAnnState('Add measurement');
      (E.meas[E.cur] = E.meas[E.cur] || []).push(a);
      E.uncommittedAnns = E.uncommittedAnns || [];
      E.uncommittedAnns.push({ bucket: 'meas', page: E.cur, item: a });
    } else if (w > 2 || h > 2 || a.t === 'draw') {
      delete a.ox; delete a.oy;
      addAnn(a);
    }
  }
  E.uncommittedAnns = E.uncommittedAnns || [];
  const savedCount = E.uncommittedAnns.length;
  E.uncommittedAnns = [];
  E.polyPts = [];
  E.tmp = null;
  E._lineClickMode = false;
  overlay();
  updateDocInspector();
  const msg = savedCount > 0
    ? `✓ Done — Saved ${savedCount} part(s) at checkpoint. Click to start next new line!`
    : `✓ Done — Save point set. Ready to start next new line (or click ⏻ Off to exit tool).`;
  st(msg);
  if (window.rpToast) window.rpToast(msg);
  return savedCount;
}

function toolCancel() {
  if (E.inlineText) {
    cancelInlineTextEditor();
    return true;
  }
  if (E.inlineTable) {
    cancelInlineTableEditor();
    return true;
  }
  E.uncommittedAnns = E.uncommittedAnns || [];
  E.rewindBuffer = E.rewindBuffer || [];
  const hasDraft = (E.polyPts && E.polyPts.length > 0) || !!E.tmp;
  const hasUncommitted = E.uncommittedAnns.length > 0;

  if (hasDraft || hasUncommitted) {
    const removedItems = [...E.uncommittedAnns];
    const removedPts = [...(E.polyPts || [])];
    const removedTmp = E.tmp ? { ...E.tmp } : null;
    E.rewindBuffer.push({
      page: E.cur,
      items: removedItems,
      polyPts: removedPts,
      tmp: removedTmp,
      tool: E.tool
    });

    if (removedItems.length) {
      for (const entry of removedItems) {
        const pg = entry.page != null ? entry.page : E.cur;
        if (entry.bucket === 'meas' && E.meas[pg]) {
          E.meas[pg] = E.meas[pg].filter(x => x !== entry.item);
        } else if (E.ann[pg]) {
          E.ann[pg] = E.ann[pg].filter(x => x !== entry.item);
        }
        if (E.sel === entry.item) E.sel = null;
      }
    }
    E.uncommittedAnns = [];
    E.polyPts = [];
    E.tmp = null;
    E._lineClickMode = false;
    overlay();
    updateDocInspector();
    const msg = '✕ Canceled unsaved part (Deleted work since last Done save point — Right-click → Rewind to bring it back).';
    st(msg);
    if (window.rpToast) window.rpToast(msg);
    return true;
  }

  toolOff();
  return false;
}

function toolRewind() {
  E.rewindBuffer = E.rewindBuffer || [];
  E.uncommittedAnns = E.uncommittedAnns || [];

  // 1. Restore from rewindBuffer if canceled/deleted parts exist
  if (E.rewindBuffer.length > 0) {
    const snap = E.rewindBuffer.pop();
    if (snap.tool && snap.tool !== 'select' && E.tool === 'select') {
      setTool(snap.tool);
    }
    if (snap.items && snap.items.length) {
      for (const entry of snap.items) {
        const pg = entry.page != null ? entry.page : E.cur;
        if (entry.bucket === 'meas') {
          (E.meas[pg] = E.meas[pg] || []).push(entry.item);
        } else {
          (E.ann[pg] = E.ann[pg] || []).push(entry.item);
        }
        E.uncommittedAnns.push(entry);
      }
    }
    if (snap.polyPts && snap.polyPts.length) {
      E.polyPts = [...snap.polyPts];
      E.tmp = { t: E.tool, pts: [...E.polyPts], color: $('#eColor') ? $('#eColor').value : '#e11d48', size: +($('#eSize') ? $('#eSize').value : 2) || 2 };
    }
    overlay();
    updateDocInspector();
    const msg = '↺ Rewind — Restored part back onto PDF page!';
    st(msg);
    if (window.rpToast) window.rpToast(msg);
    return true;
  }

  // 2. Step back last vertex in polyPts if mid-draw
  if (E.polyPts && E.polyPts.length > 0) {
    const prevPts = [...E.polyPts];
    E.polyPts.pop();
    E.rewindBuffer.push({ page: E.cur, items: [], polyPts: prevPts, tool: E.tool });
    if (E.polyPts.length === 0) E.tmp = null;
    else if (E.tmp) E.tmp.pts = [...E.polyPts];
    overlay();
    const msg = `↺ Rewind — Stepped back last point (${E.polyPts.length} remaining).`;
    st(msg);
    if (window.rpToast) window.rpToast(msg);
    return true;
  }

  // 3. Step back last placed annotation/measurement on current page
  const pageAnns = E.ann[E.cur] || [];
  const pageMeas = E.meas[E.cur] || [];
  if (pageAnns.length > 0 || pageMeas.length > 0) {
    let poppedEntry;
    if (pageAnns.length >= pageMeas.length && pageAnns.length > 0) {
      const it = pageAnns.pop();
      if (E.sel === it) E.sel = null;
      poppedEntry = { bucket: 'ann', page: E.cur, item: it };
    } else {
      const it = pageMeas.pop();
      poppedEntry = { bucket: 'meas', page: E.cur, item: it };
    }
    E.uncommittedAnns = E.uncommittedAnns.filter(x => x.item !== poppedEntry.item);
    E.rewindBuffer.push({ page: E.cur, items: [poppedEntry], polyPts: [], tool: E.tool });
    overlay();
    updateDocInspector();
    const msg = '↺ Rewind — Stepped back last part (Right-click → Rewind to bring it back).';
    st(msg);
    if (window.rpToast) window.rpToast(msg);
    return true;
  }

  if (window.rpToast) window.rpToast('Nothing to rewind.');
  return false;
}

function toolOff() {
  if (E.inlineText) commitInlineTextEditor();
  if (E.inlineTable) commitInlineTableEditor();
  E.uncommittedAnns = [];
  E.polyPts = [];
  E.tmp = null;
  E._lineClickMode = false;
  setTool('select');
  if (window.rpToast) window.rpToast('⏻ Active tool turned off — returned to Select mode.');
}

window.edToolDone = toolDone;
window.edToolCancel = toolCancel;
window.edToolRewind = toolRewind;
window.edToolOff = toolOff;

document.querySelectorAll('.rp-edit-ribbon button[data-t], #tools button, #ctools button, #mtools button[data-t]').forEach(b => {
  b.onclick = () => {
    const targetTool = b.dataset.t;
    if (E.tool === targetTool && targetTool !== 'select') {
      toolOff();
    } else {
      setTool(targetTool);
    }
  };
});

function applyFontSizeValue(val, recordUndo = true) {
  const v = Math.max(4, Math.min(200, Math.round(+val || 14)));
  syncFontSizeUI(v);
  saveToolSetting('text', 'size', v);
  if (E.inlineText) {
    E.inlineText.size = v;
    syncInlineTextEditorStyle();
  }
  if (E.sel && (E.sel.t === 'text' || E.sel.t === 'stamp')) {
    if (recordUndo) pushAnnState('Change font size');
    if (E.sel.t === 'stamp') E.sel.fs = v;
    else E.sel.size = v;
    overlay();
  }
}

function applyEditorSizeValue(val, recordUndo = true) {
  const v = Math.max(1, Math.min(200, +val || 1));
  if (E.tool === 'text' || E.tool === 'edittext' || (E.sel && E.sel.t === 'text') || E.inlineText) {
    applyFontSizeValue(v, recordUndo);
    return;
  }
  if ($('#eSize')) $('#eSize').value = v;
  syncSizePresetsUI(v);
  saveToolSetting(E.tool, 'size', v);
  if (E.sel) {
    if (recordUndo) pushAnnState('Change size');
    if (E.sel.t === 'stamp') E.sel.fs = v;
    else if (['pin', 'checkmk', 'crossmk'].includes(E.sel.t)) {
      E.sel.size = v;
      E.sel.w = v;
      E.sel.h = E.sel.t === 'pin' ? Math.round(v * 1.25) : v;
    } else {
      E.sel.size = v;
    }
  }
  overlay();
}

// Wire Swatches, Presets, Eraser Options, Pin Options & MS Office Font Controls
if ($('#eLoadFontBtn')) $('#eLoadFontBtn').onclick = loadCustomFontFile;
if ($('#eFontSizePreset')) {
  $('#eFontSizePreset').onchange = e => applyFontSizeValue(+e.target.value, true);
}
if ($('#eFontSize')) {
  $('#eFontSize').addEventListener('input', e => { if (+e.target.value >= 4) applyFontSizeValue(+e.target.value, false); });
  $('#eFontSize').addEventListener('change', e => { if (+e.target.value >= 4) applyFontSizeValue(+e.target.value, true); });
}
if ($('#eFontDec')) {
  $('#eFontDec').onclick = () => {
    const cur = +($('#eFontSize') ? $('#eFontSize').value : ($('#eSize') ? $('#eSize').value : 14)) || 14;
    const step = cur <= 10 ? 1 : 2;
    applyFontSizeValue(Math.max(4, cur - step), true);
  };
}
if ($('#eFontInc')) {
  $('#eFontInc').onclick = () => {
    const cur = +($('#eFontSize') ? $('#eFontSize').value : ($('#eSize') ? $('#eSize').value : 14)) || 14;
    const step = cur < 10 ? 1 : 2;
    applyFontSizeValue(Math.min(200, cur + step), true);
  };
}
if ($('#eStrokeDec')) {
  $('#eStrokeDec').onclick = () => {
    const cur = +$('#eSize').value || 3;
    applyEditorSizeValue(Math.max(1, cur - 1), true);
  };
}
if ($('#eStrokeInc')) {
  $('#eStrokeInc').onclick = () => {
    const cur = +$('#eSize').value || 3;
    applyEditorSizeValue(Math.min(120, cur + 1), true);
  };
}
if ($('#eClearMeasBtn')) {
  $('#eClearMeasBtn').onclick = () => ACT.clearMeasure && ACT.clearMeasure();
}
if ($('#eTextColor')) {
  let _txtColUndo = false;
  $('#eTextColor').addEventListener('pointerdown', () => { _txtColUndo = false; });
  $('#eTextColor').addEventListener('input', e => {
    const col = e.target.value;
    saveToolSetting('text', 'color', col);
    if (E.inlineText) {
      E.inlineText.color = col;
      syncInlineTextEditorStyle();
    }
    if (E.sel && (E.sel.t === 'text' || E.sel.t === 'stamp')) {
      if (!_txtColUndo) { pushAnnState('Change font colour'); _txtColUndo = true; }
      E.sel.color = col;
      overlay();
    }
  });
  $('#eTextColor').addEventListener('change', () => { _txtColUndo = false; });
}
document.querySelectorAll('#ePenPresets .rp-sz-pre').forEach(btn => {
  btn.onclick = () => applyEditorSizeValue(+btn.dataset.sz, true);
});
document.querySelectorAll('#eEraserOpts .rp-er-pre').forEach(btn => {
  btn.onclick = () => applyEditorSizeValue(+btn.dataset.er, false);
});
document.querySelectorAll('#ePinOpts .rp-pin-pre').forEach(btn => {
  btn.onclick = () => applyEditorSizeValue(+btn.dataset.psz, true);
});
if ($('#eEraserMode')) {
  $('#eEraserMode').onchange = e => {
    E.eraserMode = e.target.value;
    st(`Eraser mode: ${E.eraserMode === 'brush' ? 'Brush Radius (splits freehand strokes)' : 'Whole Markup (removes touched object)'}`);
  };
}
if ($('#eErasePageBtn')) {
  $('#eErasePageBtn').onclick = () => {
    const hasAnns = (E.ann[E.cur] && E.ann[E.cur].length) || (E.meas[E.cur] && E.meas[E.cur].length);
    if (!hasAnns) return st('No markups on this page to clear.');
    pushAnnState('Clear page markups');
    E.ann[E.cur] = [];
    E.meas[E.cur] = [];
    E.sel = null;
    overlay();
    updateDocInspector();
    st('Cleared all markups on current page.');
  };
}
document.querySelectorAll('#eSwatches .rp-swatch').forEach(btn => {
  btn.onclick = () => {
    const col = btn.dataset.col || '#e11d48';
    $('#eColor').value = col;
    syncSwatchHighlight(col);
    saveToolSetting(E.tool, 'color', col);
    if (E.sel) { pushAnnState('Change colour'); E.sel.color = col; overlay(); }
  };
});
let _colUndoPushed = false;
$('#eColor').addEventListener('pointerdown', () => { _colUndoPushed = false; });
$('#eColor').addEventListener('input', e => {
  syncSwatchHighlight(e.target.value);
  saveToolSetting(E.tool, 'color', e.target.value);
  if (E.sel) {
    if (!_colUndoPushed) { pushAnnState('Change colour'); _colUndoPushed = true; }
    E.sel.color = e.target.value;
    overlay();
  }
});
$('#eColor').addEventListener('change', () => { _colUndoPushed = false; });
$('#eSize').addEventListener('input', e => {
  if (+e.target.value > 0) applyEditorSizeValue(+e.target.value, false);
});
$('#eSize').addEventListener('change', e => {
  if (+e.target.value > 0) applyEditorSizeValue(+e.target.value, true);
});
$('#eOp').addEventListener('input', e => {
  const opVal = Math.max(.1, Math.min(1, (+e.target.value || 100) / 100));
  saveToolSetting(E.tool, 'op', Math.round(opVal * 100));
  if (E.sel) { E.sel.op = opVal; overlay(); }
});
$('#eOp').addEventListener('change', e => {
  const opVal = Math.max(.1, Math.min(1, (+e.target.value || 100) / 100));
  saveToolSetting(E.tool, 'op', Math.round(opVal * 100));
  if (E.sel) { pushAnnState('Change opacity'); E.sel.op = opVal; overlay(); }
});
$('#eFill').addEventListener('change', e => {
  if (E.sel && ['rect', 'circle', 'poly'].includes(E.sel.t)) {
    pushAnnState('Toggle fill');
    E.sel.fill = e.target.checked;
    if ($('#eBgColor')) E.sel.bgColor = $('#eBgColor').value;
    overlay();
  }
});
if ($('#eBgColor')) {
  let _bgUndoPushed = false;
  $('#eBgColor').addEventListener('pointerdown', () => { _bgUndoPushed = false; });
  $('#eBgColor').addEventListener('input', e => {
    if (E.inlineText) {
      E.inlineText.bgColor = e.target.value;
      syncInlineTextEditorStyle();
    }
    if (E.sel) {
      if (!_bgUndoPushed) { pushAnnState('Change fill colour'); _bgUndoPushed = true; }
      E.sel.bgColor = e.target.value;
      overlay();
    }
  });
  $('#eBgColor').addEventListener('change', () => { _bgUndoPushed = false; });
}
if ($('#eDash')) {
  $('#eDash').addEventListener('change', e => {
    saveToolSetting(E.tool, 'dash', e.target.value);
    if (E.sel) { pushAnnState('Change line style'); E.sel.dash = e.target.value; overlay(); }
  });
}
if ($('#eFontFam')) {
  $('#eFontFam').addEventListener('change', e => {
    if (E.inlineText) {
      E.inlineText.fam = e.target.value;
      syncInlineTextEditorStyle();
    }
    if (E.sel && (E.sel.t === 'text' || E.sel.t === 'stamp')) {
      pushAnnState('Change font family');
      E.sel.fam = e.target.value;
      overlay();
    }
  });
}
['#eBold', '#eItalic', '#eUnderline', '#eStrike'].forEach(sel => {
  const b = $(sel);
  if (!b) return;
  b.onclick = () => {
    b.classList.toggle('on');
    if (E.inlineText) {
      if (sel === '#eBold') E.inlineText.bold = b.classList.contains('on');
      if (sel === '#eItalic') E.inlineText.italic = b.classList.contains('on');
      if (sel === '#eUnderline') E.inlineText.underline = b.classList.contains('on');
      if (sel === '#eStrike') E.inlineText.strike = b.classList.contains('on');
      syncInlineTextEditorStyle();
    }
    if (E.sel && E.sel.t === 'text') {
      pushAnnState('Change text formatting');
      if (sel === '#eBold') E.sel.bold = b.classList.contains('on');
      if (sel === '#eItalic') E.sel.italic = b.classList.contains('on');
      if (sel === '#eUnderline') E.sel.underline = b.classList.contains('on');
      if (sel === '#eStrike') E.sel.strike = b.classList.contains('on');
      overlay();
    }
  };
});
['#eAlignL', '#eAlignC', '#eAlignR', '#eAlignJ'].forEach(sel => {
  const b = $(sel);
  if (!b) return;
  b.onclick = () => {
    setActiveAlignUI(b.dataset.align);
    if (E.inlineText) {
      E.inlineText.align = b.dataset.align;
      syncInlineTextEditorStyle();
    }
    if (E.sel && E.sel.t === 'text') {
      pushAnnState('Change text alignment');
      E.sel.align = b.dataset.align;
      overlay();
    }
  };
});
if ($('#eTextBg')) {
  $('#eTextBg').addEventListener('change', e => {
    if (E.inlineText) {
      E.inlineText.bgBox = e.target.checked;
      if ($('#eBgColor')) E.inlineText.bgColor = $('#eBgColor').value;
      syncInlineTextEditorStyle();
    }
    if (E.sel && E.sel.t === 'text') {
      pushAnnState('Toggle text box background');
      E.sel.bgBox = e.target.checked;
      if ($('#eBgColor')) E.sel.bgColor = $('#eBgColor').value;
      overlay();
    }
  });
}

function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
async function pickImage() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp';
  inp.onchange = async () => { const f = inp.files[0]; if (!f) return setTool('select'); const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }); E.img = { dataUrl: url, img: await loadImg(url) }; st('Click on the page to place the image.'); };
  inp.click();
}
async function signPad() {
  const r = await dialog('Draw your signature', [{ type: 'pad', id: 'sig', label: '' }, { type: 'note', label: 'Draw with the mouse or touch. It is placed as an image you can move and resize.' }], 'Use');
  if (!r || !r.sig) return setTool('select'); E.img = { dataUrl: r.sig, img: await loadImg(r.sig) }; st('Click on the page to place the signature.');
}

async function openRichTextDialog(initial = {}) {
  const fam = initial.fam || ($('#eFontFam') ? $('#eFontFam').value : 'Helvetica');
  const size = initial.size || (+$('#eSize').value || 14);
  const bold = initial.bold != null ? initial.bold : ($('#eBold') ? $('#eBold').classList.contains('on') : false);
  const italic = initial.italic != null ? initial.italic : ($('#eItalic') ? $('#eItalic').classList.contains('on') : false);
  const underline = initial.underline != null ? initial.underline : ($('#eUnderline') ? $('#eUnderline').classList.contains('on') : false);
  const strike = initial.strike != null ? initial.strike : ($('#eStrike') ? $('#eStrike').classList.contains('on') : false);
  const align = initial.align || getActiveAlign();
  const bgBox = initial.bgBox != null ? initial.bgBox : ($('#eTextBg') ? $('#eTextBg').checked : false);
  const bgColor = initial.bgColor || ($('#eBgColor') ? $('#eBgColor').value : '#fffbeb');
  const color = initial.color || ($('#eColor') ? $('#eColor').value : '#e11d48');

  return await dialog(initial.title || 'Add Rich Text Annotation', [
    { type: 'textarea', id: 'v', label: 'Text Content (Multi-line & Unicode supported):', rows: 4, value: initial.text || '' },
    { type: 'symbols' },
    { type: 'select', id: 'fam', label: 'Font Family', value: fam, options: getFontOptionsList() },
    { type: 'number', id: 'size', label: 'Font Size (pt)', value: size, min: 4, max: 200 },
    { type: 'select', id: 'align', label: 'Text Alignment', value: align, options: [{ label: 'Left Align', value: 'left' }, { label: 'Center Align', value: 'center' }, { label: 'Right Align', value: 'right' }] },
    { type: 'color', id: 'color', label: 'Text Colour', value: color },
    { type: 'checkbox', id: 'bold', label: 'Bold', value: bold },
    { type: 'checkbox', id: 'italic', label: 'Italic', value: italic },
    { type: 'checkbox', id: 'underline', label: 'Underline', value: underline },
    { type: 'checkbox', id: 'strike', label: 'Strikethrough', value: strike },
    { type: 'checkbox', id: 'bgBox', label: 'Draw Background Callout Box', value: bgBox },
    { type: 'color', id: 'bgColor', label: 'Box Background Colour', value: bgColor }
  ], initial.okLabel || 'Add Text');
}

// ---------- Direct On-Page WYSIWYG Inline Text Editor (MS Office / Acrobat Style) ----------
function syncInlineTextEditorStyle() {
  const stObj = E.inlineText;
  const box = $('#rp-inline-text-box');
  const ta = $('#rp-inline-textarea');
  if (!stObj || !box || !ta) return;
  const k = K();
  const pageW = ($('#ecv') && $('#ecv').clientWidth) ? $('#ecv').clientWidth : 800;
  const clampedLeft = Math.max(4, Math.min(pageW - 140, Math.round(stObj.x * k)));
  const clampedTop = Math.max(4, Math.round(stObj.y * k));
  box.style.left = clampedLeft + 'px';
  box.style.top = clampedTop + 'px';
  box.classList.toggle('flip-bar-below', clampedTop < 36);

  const scaledPx = Math.max(10, (stObj.size || 14) * k);
  ta.style.fontFamily = cssFam(stObj.fam || 'Helvetica');
  ta.style.fontSize = scaledPx + 'px';
  ta.style.lineHeight = String(stObj.lineHeight || 1.22);
  ta.style.fontWeight = stObj.bold ? 'bold' : 'normal';
  ta.style.fontStyle = stObj.italic ? 'italic' : 'normal';
  const dec = [];
  if (stObj.underline) dec.push('underline');
  if (stObj.strike) dec.push('line-through');
  ta.style.textDecoration = dec.length ? dec.join(' ') : 'none';
  ta.style.textAlign = stObj.align || 'left';
  ta.style.color = stObj.color || '#111827';
  ta.style.background = stObj.bgBox ? (stObj.bgColor || '#fffbeb') : 'rgba(255, 255, 255, 0.94)';

  // Auto-resize width & height to fit typed lines
  const lines = String(ta.value || ta.placeholder || 'Type here').split('\n');
  const c = _scratchCtx;
  c.font = `${stObj.italic ? 'italic ' : ''}${stObj.bold ? 'bold ' : ''}${scaledPx}px ${cssFam(stObj.fam || 'Helvetica')}`;
  const maxW = Math.max(130, ...lines.map(l => c.measureText(l || ' ').width + 28));
  ta.style.width = Math.ceil(maxW) + 'px';
  ta.style.height = Math.ceil(Math.max(scaledPx * 1.45, lines.length * scaledPx * 1.25 + 10)) + 'px';
}

function openInlineTextEditor(opts = {}) {
  if (E.inlineText) commitInlineTextEditor();
  const wrap = $('#ewrap');
  if (!wrap || !E.doc) return null;

  const mode = opts.mode || 'new'; // 'new' | 'editAnn' | 'pdfItem'
  const ann = opts.ann || null;
  const pdfItem = opts.item || null;

  if (pdfItem) {
    const s = samplePdfTextColors(pdfItem);
    if (!pdfItem.pdfColor) pdfItem.pdfColor = s.fg;
    if (!pdfItem.pdfBgColor) pdfItem.pdfBgColor = s.bg;
  }
  const defaultFam = (pdfItem ? famOf(pdfItem) : (ann ? ann.fam : ($('#eFontFam') ? $('#eFontFam').value : 'Helvetica'))) || 'Helvetica';
  const defaultSize = pdfItem ? +(pdfItem.h || 12).toFixed(2) : (ann ? (ann.size || 14) : (+($('#eFontSize') ? $('#eFontSize').value : 14) || 14));
  const defaultColor = pdfItem ? (pdfItem.pdfColor || '#000000') : (ann ? (ann.color || '#111827') : ($('#eTextColor') ? $('#eTextColor').value : ($('#eColor') ? $('#eColor').value : '#111827')));
  const defaultBold = pdfItem ? !!pdfItem.bold : (ann ? !!ann.bold : ($('#eBold') ? $('#eBold').classList.contains('on') : false));
  const defaultItalic = pdfItem ? !!pdfItem.italic : (ann ? !!ann.italic : ($('#eItalic') ? $('#eItalic').classList.contains('on') : false));
  const defaultUnderline = ann ? !!ann.underline : ($('#eUnderline') ? $('#eUnderline').classList.contains('on') : false);
  const defaultStrike = ann ? !!ann.strike : ($('#eStrike') ? $('#eStrike').classList.contains('on') : false);
  const defaultAlign = ann ? (ann.align || 'left') : getActiveAlign();
  const defaultBgBox = ann ? !!ann.bgBox : ($('#eTextBg') ? $('#eTextBg').checked : false);
  const defaultBgColor = ann ? (ann.bgColor || '#fffbeb') : ($('#eBgColor') ? $('#eBgColor').value : '#fffbeb');
  const defaultLineHeight = ann ? (ann.lineHeight || 1.22) : (+($('#eLineSpacing') ? $('#eLineSpacing').value : 1.22) || 1.22);
  const startX = pdfItem ? pdfItem.x : (ann ? ann.x : (opts.x || 50));
  const startY = pdfItem ? (pdfItem.base - defaultSize * BASE) : (ann ? ann.y : (opts.y || 50));
  const initialText = pdfItem ? pdfItem.str : (ann ? (ann.text || '') : (opts.text || opts.initialText || ''));

  // Sync top MS Office Font ribbon controls to match this text box
  if ($('#eFontFam')) $('#eFontFam').value = defaultFam;
  syncFontSizeUI(defaultSize);
  if ($('#eTextColor')) $('#eTextColor').value = defaultColor;
  if ($('#eBold')) $('#eBold').classList.toggle('on', defaultBold);
  if ($('#eItalic')) $('#eItalic').classList.toggle('on', defaultItalic);
  if ($('#eUnderline')) $('#eUnderline').classList.toggle('on', defaultUnderline);
  if ($('#eStrike')) $('#eStrike').classList.toggle('on', defaultStrike);
  if ($('#eTextBg')) $('#eTextBg').checked = defaultBgBox;
  if ($('#eBgColor')) $('#eBgColor').value = defaultBgColor;
  setActiveAlignUI(defaultAlign);

  // Temporarily hide existing annotation while editing it inline so it doesn't double-render underneath
  if (mode === 'editAnn' && ann) {
    ann._editingInline = true;
    overlay();
  }

  E.inlineText = {
    mode,
    ann,
    pdfItem,
    x: startX,
    y: startY,
    fam: defaultFam,
    size: defaultSize,
    color: defaultColor,
    bold: defaultBold,
    italic: defaultItalic,
    underline: defaultUnderline,
    strike: defaultStrike,
    align: defaultAlign,
    bgBox: defaultBgBox,
    bgColor: defaultBgColor,
    lineHeight: defaultLineHeight
  };

  let box = $('#rp-inline-text-box');
  if (box) box.remove();
  box = document.createElement('div');
  box.id = 'rp-inline-text-box';
  box.className = 'rp-inline-text-box';
  box.innerHTML = `
    <div class="rp-inline-text-bar" id="rp-inline-drag-bar">
      <span class="rp-inline-drag-lbl" title="Drag to reposition text box on page">⠿ ${mode === 'pdfItem' ? 'Edit PDF Text' : 'Type on PDF'}</span>
      <div class="rp-inline-syms">
        ${['Ω', 'µ', '±', '⌀', '°', 'Δ', '✓', '✗'].map(s => `<button type="button" class="rp-inline-sym" data-sym="${s}" title="Insert ${s}">${s}</button>`).join('')}
      </div>
      <button type="button" class="rp-inline-sym" id="rp-inline-eq-btn" title="Open MS Word Equation Builder (Alt+=)" style="font-weight:700;color:#93c5fd">π Eq</button>
      <button type="button" class="rp-inline-ok" id="rp-inline-text-ok" title="Apply Text to PDF Page (Ctrl+Enter)">✓ Done</button>
      <button type="button" class="rp-inline-cancel" id="rp-inline-text-cancel" title="Cancel (Esc)">✕</button>
    </div>
    <textarea id="rp-inline-textarea" rows="1" placeholder="Type text here..."></textarea>
  `;
  wrap.appendChild(box);

  const ta = box.querySelector('#rp-inline-textarea');
  ta.value = initialText;
  syncInlineTextEditorStyle();

  // Prevent pointer events inside the inline box from triggering canvas drawing
  box.addEventListener('pointerdown', ev => ev.stopPropagation());
  box.addEventListener('click', ev => ev.stopPropagation());
  box.addEventListener('dblclick', ev => ev.stopPropagation());

  // Dragging the inline text box via its mini-bar
  const dragBar = box.querySelector('#rp-inline-drag-bar');
  let dragState = null;
  dragBar.addEventListener('pointerdown', ev => {
    if (ev.target.tagName === 'BUTTON') return;
    ev.preventDefault();
    ev.stopPropagation();
    dragState = { sx: ev.clientX, sy: ev.clientY, ox: E.inlineText.x, oy: E.inlineText.y };
    dragBar.setPointerCapture(ev.pointerId);
  });
  dragBar.addEventListener('pointermove', ev => {
    if (!dragState || !E.inlineText) return;
    E.inlineText.x = dragState.ox + (ev.clientX - dragState.sx) / K();
    E.inlineText.y = dragState.oy + (ev.clientY - dragState.sy) / K();
    syncInlineTextEditorStyle();
  });
  dragBar.addEventListener('pointerup', () => {
    dragState = null;
    if (ta) ta.focus();
  });

  // Quick symbol buttons
  box.querySelectorAll('.rp-inline-sym[data-sym]').forEach(btn => {
    btn.onclick = ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const sym = btn.dataset.sym;
      const s0 = ta.selectionStart ?? ta.value.length;
      const s1 = ta.selectionEnd ?? ta.value.length;
      ta.value = ta.value.slice(0, s0) + sym + ta.value.slice(s1);
      syncInlineTextEditorStyle();
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s0 + sym.length;
    };
  });

  if (box.querySelector('#rp-inline-eq-btn')) {
    box.querySelector('#rp-inline-eq-btn').onclick = ev => {
      ev.preventDefault();
      ev.stopPropagation();
      openEquationStudio();
    };
  }
  box.querySelector('#rp-inline-text-ok').onclick = ev => {
    ev.preventDefault();
    ev.stopPropagation();
    commitInlineTextEditor();
  };
  box.querySelector('#rp-inline-text-cancel').onclick = ev => {
    ev.preventDefault();
    ev.stopPropagation();
    cancelInlineTextEditor();
  };

  ta.addEventListener('input', () => syncInlineTextEditorStyle());
  ta.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      cancelInlineTextEditor();
    } else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey || (E.inlineText && E.inlineText.mode === 'pdfItem' && !ev.shiftKey))) {
      ev.preventDefault();
      ev.stopPropagation();
      commitInlineTextEditor();
    }
  });

  setTimeout(() => {
    ta.focus();
    if (mode === 'pdfItem' || mode === 'editAnn') ta.select();
  }, 10);

  st(mode === 'pdfItem'
    ? 'Editing PDF text inline — type replacement text and press Enter or click ✓ Done (use Font bar above to change font/size/color).'
    : 'Typing directly on PDF — use Font bar above to change font/size/style, press Ctrl+Enter or click ✓ Done when finished.');
  return E.inlineText;
}

function commitInlineTextEditor() {
  const stObj = E.inlineText;
  if (!stObj) return false;
  const box = $('#rp-inline-text-box');
  const ta = $('#rp-inline-textarea');
  const rawVal = ta ? ta.value : '';
  const textVal = rawVal.replace(/\r\n/g, '\n').trimEnd();

  if (box) box.remove();
  E.inlineText = null;

  if (stObj.mode === 'editAnn' && stObj.ann) {
    delete stObj.ann._editingInline;
    if (!textVal.trim()) {
      pushAnnState('Delete empty text annotation');
      E.ann[E.cur] = (E.ann[E.cur] || []).filter(a => a !== stObj.ann);
      if (E.sel === stObj.ann) E.sel = null;
      overlay(); updateDocInspector();
      return true;
    }
    pushAnnState('Edit text annotation');
    Object.assign(stObj.ann, {
      x: stObj.x,
      y: stObj.y,
      text: textVal,
      fam: stObj.fam,
      size: stObj.size,
      color: stObj.color,
      bold: !!stObj.bold,
      italic: !!stObj.italic,
      underline: !!stObj.underline,
      strike: !!stObj.strike,
      align: stObj.align || 'left',
      bgBox: !!stObj.bgBox,
      bgColor: stObj.bgColor || '#fffbeb',
      lineHeight: stObj.lineHeight || 1.22
    });
    E.sel = stObj.ann;
    overlay(); updateDocInspector();
    st('Updated text annotation on page.');
    return true;
  }

  if (stObj.mode === 'pdfItem' && stObj.pdfItem) {
    const t = stObj.pdfItem;
    const s = samplePdfTextColors(t);
    const origCol = t.pdfColor || s.fg || '#000000';
    const bgCol = t.pdfBgColor || s.bg || '#ffffff';
    if (textVal === t.str && stObj.fam === famOf(t) && Math.abs(stObj.size - (t.h || 12)) < 0.05 && String(stObj.color || '').toLowerCase() === String(origCol).toLowerCase()) {
      overlay();
      return false;
    }
    pushAnnState('In-place PDF text edit');
    const g = 'g' + Date.now();
    addAnn({ t: 'whiteout', x: t.x - 1.5, y: t.base - t.h * .88, w: t.w + 4, h: t.h * 1.2 + 2, color: bgCol, size: 1, g, op: 1 }, true);
    if (textVal.trim()) {
      addAnn({
        t: 'text',
        x: stObj.x,
        y: stObj.y,
        text: textVal,
        color: stObj.color || origCol,
        size: stObj.size || t.h,
        fam: stObj.fam || famOf(t),
        bold: !!stObj.bold,
        italic: !!stObj.italic,
        underline: !!stObj.underline,
        strike: !!stObj.strike,
        align: stObj.align || 'left',
        bgBox: !!stObj.bgBox,
        bgColor: stObj.bgColor || '#fffbeb',
        lineHeight: stObj.lineHeight || 1.22,
        g,
        op: 1
      }, true);
    }
    overlay(); updateDocInspector();
    st('PDF text updated in-place. Press Ctrl+Z to undo or Save to keep.');
    return true;
  }

  if (!textVal.trim()) {
    overlay();
    return false;
  }
  addAnn({
    t: 'text',
    x: stObj.x,
    y: stObj.y,
    text: textVal,
    color: stObj.color || '#111827',
    size: +stObj.size || 14,
    fam: stObj.fam || 'Helvetica',
    bold: !!stObj.bold,
    italic: !!stObj.italic,
    underline: !!stObj.underline,
    strike: !!stObj.strike,
    align: stObj.align || 'left',
    bgBox: !!stObj.bgBox,
    bgColor: stObj.bgColor || '#fffbeb',
    lineHeight: stObj.lineHeight || 1.22
  });
  st('Placed text on PDF page — click another spot to type more, or switch to Select (V) to move/resize.');
  return true;
}

function cancelInlineTextEditor() {
  const stObj = E.inlineText;
  const box = $('#rp-inline-text-box');
  if (box) box.remove();
  if (stObj && stObj.mode === 'editAnn' && stObj.ann) {
    delete stObj.ann._editingInline;
  }
  E.inlineText = null;
  overlay();
  st('Cancelled text edit.');
}

const ov = $('#eov');
const pt = e => {
  const r = ov.getBoundingClientRect();
  const scaleK = K() || 1;
  return [(e.clientX - r.left) / scaleK, (e.clientY - r.top) / scaleK];
};
ov.onpointerdown = async e => {
  if (e.button === 2) return;
  if (!E.doc) return;
  const [x, y] = pt(e), col = $('#eColor').value, size = +$('#eSize').value || 2, t = E.tool;
  if (t === 'hand' || e.button === 1) {
    const ev = $('#eview');
    E.pan = { sx: e.clientX, sy: e.clientY, sl: ev.scrollLeft, st: ev.scrollTop };
    ov.style.cursor = 'grabbing';
    ov.setPointerCapture(e.pointerId);
    return;
  }
  if (t === 'eraser') {
    E.eraserCur = [x, y];
    pushAnnState('Erase markup');
    const erased = eraseAtPoint(x, y);
    E.erasedAny = erased;
    overlay();
    if (erased) updateDocInspector();
    E.erasing = true;
    ov.setPointerCapture(e.pointerId);
    return;
  }
  if (t === 'fai') {
    if (!E.faiManager && typeof MeasureEngine !== 'undefined' && MeasureEngine.FAIManager) {
      E.faiManager = new MeasureEngine.FAIManager();
    }
    const nearIt = itemAt(x, y);
    const defaultReq = nearIt && nearIt.str ? nearIt.str.trim() : '25.40 ±0.05 mm';
    const r = await dialog('AS9102 First Article Inspection (FAI) Balloon', [
      { id: 'req', label: 'Drawing Requirement / Dimension Text', value: defaultReq },
      { id: 'zone', label: 'Drawing Zone (e.g. B2, C4)', value: 'B2' },
      { id: 'actual', label: 'Actual Measured Value (optional)', value: '' }
    ], 'Place FAI Balloon');
    if (r) {
      const item = E.faiManager
        ? E.faiManager.addBalloon(x, y, E.cur + 1, r.req, r.zone, r.actual)
        : { charNo: (E.nextPinNum++), requirement: r.req };
      const bSz = 24;
      addAnn({ t: 'fai', x: x - bSz / 2, y: y - bSz / 2, w: bSz, h: bSz, size: bSz, charNo: item.charNo, reqText: item.requirement, color: '#dc2626' });
      st(`Placed AS9102 FAI Balloon #${item.charNo} (${item.requirement}) — click "FAI CSV" in Review & Measure to export Form 3 schedule.`);
    }
    return;
  }
  if (t === 'angle' || t === 'rad3') {
    E.polyPts.push([x, y]);
    if (E.polyPts.length === 3) {
      const pts = [...E.polyPts];
      E.polyPts = [];
      E.tmp = null;
      pushAnnState(t === 'angle' ? 'Add 3-point angle' : 'Add 3-point circle/radius');
      const _mAng = { t, pts, color: t === 'angle' ? '#8b5cf6' : '#0284c7', size: 2 };
      (E.meas[E.cur] = E.meas[E.cur] || []).push(_mAng);
      E.uncommittedAnns = E.uncommittedAnns || [];
      E.uncommittedAnns.push({ bucket: 'meas', page: E.cur, item: _mAng });
      overlay(); updateDocInspector();
      st(t === 'angle' ? 'Measured 3-Point Angle (°).' : 'Measured 3-Point Circle Diameter & Radius (⌀ / R).');
    } else {
      E.tmp = { t, pts: [...E.polyPts, [x, y]], color: t === 'angle' ? '#8b5cf6' : '#0284c7', size: 2 };
      overlay();
      st(`${t === 'angle' ? '3-Point Angle' : '3-Point Circle ⌀/R'}: Point ${E.polyPts.length} of 3 placed — click point ${E.polyPts.length + 1}.`);
    }
    return;
  }
  if (t === 'pin') {
    const existingPin = hit(x, y, 14 / K());
    if (existingPin && existingPin.t === 'pin') {
      const r = await dialog(`Edit Inspection Pin #${existingPin.pinNum || 1}`, [
        { type: 'textarea', id: 'v', label: 'Pin Callout Tag / Note', rows: 3, value: existingPin.text || '' },
        { type: 'symbols' },
        { type: 'color', id: 'col', label: 'Pin Colour', value: existingPin.color || '#f59e0b' }
      ], 'Update Pin');
      if (r) { pushAnnState('Edit pin'); existingPin.text = r.v || ''; if (r.col) existingPin.color = r.col; overlay(); }
      return;
    }
    const pSz = Math.max(12, +$('#eSize').value || 24);
    const pH = Math.round(pSz * 1.25);
    const pinNum = E.nextPinNum++;
    const pinCol = (col && col !== '#e11d48') ? col : '#f59e0b';
    const r = await dialog(`Place Inspection Pin #${pinNum}`, [
      { type: 'textarea', id: 'v', label: 'Note / Callout Text (shown when cursor moves near pin):', rows: 3, value: '' },
      { type: 'symbols' },
      { type: 'color', id: 'col', label: 'Pin Colour', value: pinCol }
    ], 'Place Pin');
    if (!r) return;
    const newPin = { t: 'pin', x: x - pSz / 2, y: y - pH, w: pSz, h: pH, size: pSz, pinNum, text: (r.v || '').trim(), author: getAuthor(), date: showDate(pdfDate()), color: r.col || pinCol };
    addAnn(newPin);
    showEditorNoteHover({ kind: 'ann', item: newPin, box: bbox(newPin), dist: 0 }, false);
    st(`Placed Inspection Pin #${pinNum}${newPin.text ? ': "' + newPin.text + '"' : ''} — move cursor near pin to view note.`);
    return;
  }
  if (t === 'checkmk' || t === 'crossmk') {
    const mSz = Math.max(10, +$('#eSize').value || 22);
    addAnn({ t, x: x - mSz / 2, y: y - mSz / 2, w: mSz, h: mSz, color: col || (t === 'checkmk' ? '#059669' : '#e11d48'), size: mSz });
    return;
  }
  if (t === 'poly' || t === 'area') {
    const prev = E.polyPts[E.polyPts.length - 1];
    if (E.polyPts.length >= 3 && Math.hypot(x - E.polyPts[0][0], y - E.polyPts[0][1]) <= 10 / K()) {
      finishPolygonTool();
      return;
    }
    if (!prev || Math.hypot(x - prev[0], y - prev[1]) > 2 / K()) {
      E.polyPts.push([x, y]);
    }
    E._polyDragStart = (E.polyPts.length === 1 && t === 'area') ? [x, y] : null;
    E.tmp = {
      t,
      pts: [...E.polyPts, [x, y]],
      color: col || (t === 'area' ? '#10b981' : '#e11d48'),
      size,
      dash: $('#eDash') ? $('#eDash').value : 'solid',
      fill: t === 'area' ? true : $('#eFill').checked,
      bgColor: $('#eBgColor') ? $('#eBgColor').value : col
    };
    overlay();
    return;
  }
  if (E.inlineTable) {
    await commitInlineTableEditor();
  }
  if (E.inlineText) {
    const hadText = commitInlineTextEditor();
    if (hadText && (t === 'text' || t === 'edittext')) return;
  }
  if (t === 'multisel' || ((t === 'edittext' || t === 'select') && (e.ctrlKey || e.metaKey || e.altKey))) {
    const existingAnn = hit(x, y);
    if (existingAnn) {
      addOrderedSelectionItem({ kind: 'ann', ann: existingAnn, page: E.cur }, true);
      return;
    }
    const wHit = wordAt(x, y) || itemAt(x, y);
    if (wHit) {
      addOrderedSelectionItem({ ...wHit, kind: 'word', page: E.cur }, true);
    } else {
      st('Ordered Multi-Select: Click directly on any word or markup to select #1, #2, #3, #4 in exact order.');
    }
    return;
  }
  if (t === 'edittext') {
    const existingAnn = hit(x, y);
    if (existingAnn && existingAnn.t === 'image' && existingAnn.tableSpec) {
      const cellHit = hitTableCell(existingAnn, x, y);
      openInlineTableEditor(existingAnn, cellHit ? cellHit.row : 0, cellHit ? cellHit.col : 0);
      return;
    }
    if (existingAnn && existingAnn.t === 'text') {
      openInlineTextEditor({ mode: 'editAnn', ann: existingAnn });
      return;
    }
    const it = itemAt(x, y);
    if (it) openInlineTextEditor({ mode: 'pdfItem', item: it });
    else openInlineTextEditor({ mode: 'new', x, y });
    return;
  }
  if (t === 'select') {
    const hdl = E.sel ? hitHandle(E.sel, x, y) : null;
    if (hdl && E.sel) {
      pushAnnState('Resize annotation');
      const [bx, by, bw, bh] = bbox(E.sel);
      E.drag = { x, y, hdl, orig: { ...E.sel, pts: E.sel.pts ? E.sel.pts.map(p => [...p]) : undefined, bx, by, bw, bh } };
      ov.setPointerCapture(e.pointerId);
      return;
    }
    const hitCm = hitComment(x, y, 12 / K());
    if (hitCm) {
      E.sel = null;
      E.selC = hitCm.key;
      const b = commentBBox(hitCm);
      if (b) showEditorNoteHover({ kind: 'comment', item: hitCm, box: b, dist: 0 }, true);
      if (hitCm.sub === 'Text') {
        E._commentDrag = { c: hitCm, key: hitCm.key, startX: x, startY: y, dx: 0, dy: 0, moved: false };
        ov.setPointerCapture(e.pointerId);
      }
      overlay();
      renderComments();
      return;
    }
    E.selC = null;
    E.sel = hit(x, y);
    if (E.sel) {
      pushAnnState('Move annotation');
      E.drag = { x, y, moved: false };
      ov.setPointerCapture(e.pointerId);
      syncRibbonFromSelectedAnn(E.sel);
      if (['pin', 'leader', 'cloud', 'fai'].includes(E.sel.t)) {
        showEditorNoteHover({ kind: 'ann', item: E.sel, box: bbox(E.sel), dist: 0 }, false);
      }
    } else {
      updateContextualToolDock('select');
    }
    overlay(); return;
  }
  if (t === 'text') {
    const existingAnn = hit(x, y);
    if (existingAnn) {
      E.sel = existingAnn;
      pushAnnState('Move annotation');
      E.drag = { x, y, moved: false };
      ov.setPointerCapture(e.pointerId);
      syncRibbonFromSelectedAnn(existingAnn);
      overlay();
      return;
    }
    openInlineTextEditor({ mode: 'new', x, y });
    return;
  }
  if ((t === 'image' || t === 'sign') && E.img) { const w = Math.min(160, E.img.img.width), h = w * E.img.img.height / E.img.img.width; addAnn({ t: 'image', x: x - w / 2, y: y - h / 2, w, h, img: E.img.img, dataUrl: E.img.dataUrl }); E.img = null; setTool('select'); return; }
  if (t === 'calibrate') { E.tmp = { t: 'cal', x1: x, y1: y, x2: x, y2: y, color: '#d97706', size: 1.5 }; ov.setPointerCapture(e.pointerId); return; }
  if (t === 'measure') { E.tmp = { t: 'meas', x1: x, y1: y, x2: x, y2: y, color: '#0066ff', size: 1.5 }; ov.setPointerCapture(e.pointerId); return; }
  if (t === 'cnote') {
    const existingCm = hitComment(x, y, 14 / K());
    if (existingCm) {
      E.selC = existingCm.key;
      overlay();
      await editC(existingCm);
      return;
    }
    if (!await ensureAuthor()) return;
    const r = await dialog('Add Sticky Note', [
      { type: 'textarea', id: 'v', label: 'Note Content (shown when cursor moves near note):', rows: 4 },
      { type: 'symbols' },
      { id: 'author', label: 'Reviewer / Author', value: getAuthor() || 'Reviewer' },
      { type: 'note', label: 'Saved inside the PDF as a standard sticky note annotation. Move your cursor near the note icon at any time to view or edit what you wrote.' }
    ], 'Save Note');
    if (r && r.v && r.v.trim()) {
      if (r.author && r.author.trim()) {
        try { localStorage.setItem('author', r.author.trim()); } catch (err) {}
        if ($('#cAuthor')) $('#cAuthor').value = r.author.trim();
      }
      await addNote(E.cur, x, y, r.v.trim());
      const latest = E.comments && E.comments[E.comments.length - 1];
      if (latest && latest.page === E.cur) {
        E.selC = latest.key;
        const b = commentBBox(latest);
        if (b) showEditorNoteHover({ kind: 'comment', item: latest, box: b, dist: 0 }, false);
      }
    }
    return;
  }
  if (t === 'stamp') { if (!E.stamp) return; const fs = 20, c = _scratchCtx; c.font = `bold ${fs}px Helvetica,Arial,sans-serif`; const w = c.measureText(E.stamp.text).width + 28, h = 34; addAnn({ t: 'stamp', x: x - w / 2, y: y - h / 2, w, h, fs, text: E.stamp.text, color: E.stamp.color }); E.stamp = null; setTool('select'); return; }
  if (t === 'chl' || t === 'cul' || t === 'cst') E.tmp = { t: 'crect', x, y, w: 0, h: 0, ox: x, oy: y, color: col, size: 1, kind: t };
  else if (t === 'draw') {
    E.sel = null;
    const penOp = Math.max(0.1, Math.min(1, (+($('#eOp') && $('#eOp').value) || 100) / 100));
    E.tmp = { t: 'draw', pts: [[x, y]], color: col, size, op: penOp, dash: $('#eDash') ? $('#eDash').value : 'solid' };
    overlay();
  }
  else if (t === 'line' || t === 'arrow' || t === 'leader') {
    if (E._lineClickMode && E.tmp && (E.tmp.t === t)) {
      E.tmp.x2 = x; E.tmp.y2 = y;
      E._lineClickMode = false;
      const finA = E.tmp; E.tmp = null;
      addAnn(finA);
      return;
    }
    E.tmp = { t, x1: x, y1: y, x2: x, y2: y, text: 'Callout', color: col, size, dash: $('#eDash') ? $('#eDash').value : 'solid' };
  }
  else if (['rect', 'circle', 'cloud', 'highlight', 'whiteout', 'redact'].includes(t)) E.tmp = { t, x, y, w: 0, h: 0, ox: x, oy: y, revText: 'Δ Rev 2', color: col, size, dash: $('#eDash') ? $('#eDash').value : 'solid', fill: $('#eFill').checked, bgColor: $('#eBgColor') ? $('#eBgColor').value : col };
  if (E.tmp) ov.setPointerCapture(e.pointerId);
};
ov.onpointermove = e => {
  if (E.pan) {
    const ev = $('#eview');
    ev.scrollLeft = E.pan.sl - (e.clientX - E.pan.sx);
    ev.scrollTop = E.pan.st - (e.clientY - E.pan.sy);
    return;
  }
  const [x, y] = pt(e);
  if (E._commentDrag) {
    const dx = x - E._commentDrag.startX, dy = y - E._commentDrag.startY;
    if (Math.hypot(dx, dy) > 2 / K()) E._commentDrag.moved = true;
    E._commentDrag.dx = dx;
    E._commentDrag.dy = dy;
    scheduleOverlay();
    return;
  }
  if (E.tool === 'eraser') {
    E.eraserCur = [x, y];
    if (E.erasing) {
      if (eraseAtPoint(x, y)) {
        E.erasedAny = true;
        updateDocInspector();
      }
    }
    scheduleOverlay();
    if (E.erasing) return;
  }
  if ((E.tool === 'poly' || E.tool === 'area' || E.tool === 'angle' || E.tool === 'rad3') && E.polyPts.length && E.tmp) {
    if (E.tool === 'area' && E._polyDragStart && e.buttons === 1 && E.polyPts.length === 1) {
      const [sx, sy] = E._polyDragStart;
      if (Math.hypot(x - sx, y - sy) > 8 / K()) {
        E.tmp.pts = [[sx, sy], [x, sy], [x, y], [sx, y]];
        scheduleOverlay();
        return;
      }
    }
    E.tmp.pts = [...E.polyPts, [x, y]];
    scheduleOverlay();
    return;
  }
  if (E.tool === 'multisel') { const wIt = wordAt(x, y) || itemAt(x, y); if (wIt !== E.hov) { E.hov = wIt; scheduleOverlay(); } return; }
  if (E.tool === 'edittext') { const it = itemAt(x, y); if (it !== E.hov) { E.hov = it; scheduleOverlay(); } return; }
  if (E.drag && E.sel) {
    if (E.sel.locked) return;
    E.drag.moved = true;
    if (E.drag.hdl) {
      const o = E.drag.orig, dx = x - E.drag.x, dy = y - E.drag.y, m = E.drag.hdl;
      if (('w' in E.sel) && ('h' in E.sel)) {
        let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
        if (m.includes('w')) x0 += dx;
        if (m.includes('e')) x1 += dx;
        if (m.includes('n')) y0 += dy;
        if (m.includes('s')) y1 += dy;
        E.sel.x = Math.min(x0, x1);
        E.sel.y = Math.min(y0, y1);
        E.sel.w = Math.max(12, Math.abs(x1 - x0));
        E.sel.h = Math.max(12, Math.abs(y1 - y0));
        if (E.sel.t === 'stamp' && o.fs) {
          E.sel.fs = Math.max(8, Math.round(o.fs * (E.sel.h / Math.max(12, o.h))));
        }
      } else if (E.sel.t === 'text') {
        const scale = Math.max(0.3, (o.bh + (m.includes('s') ? dy : -dy)) / Math.max(10, o.bh));
        E.sel.size = Math.max(6, Math.min(200, Math.round((o.size || 14) * scale)));
        if ($('#eSize')) $('#eSize').value = E.sel.size;
      } else if ('x2' in E.sel) {
        if (m === 'nw' || m === 'sw') { E.sel.x1 = x; E.sel.y1 = y; }
        else { E.sel.x2 = x; E.sel.y2 = y; }
      } else if (E.sel.pts && o.pts) {
        let x0 = o.bx, y0 = o.by, x1 = o.bx + o.bw, y1 = o.by + o.bh;
        if (m.includes('w')) x0 += dx;
        if (m.includes('e')) x1 += dx;
        if (m.includes('n')) y0 += dy;
        if (m.includes('s')) y1 += dy;
        const nx = Math.min(x0, x1), ny = Math.min(y0, y1);
        const nw = Math.max(12, Math.abs(x1 - x0)), nh = Math.max(12, Math.abs(y1 - y0));
        const sx = nw / Math.max(1, o.bw), sy = nh / Math.max(1, o.bh);
        E.sel.pts = o.pts.map(p => [nx + (p[0] - o.bx) * sx, ny + (p[1] - o.by) * sy]);
      }
    } else {
      moveAnn(E.sel, x - E.drag.x, y - E.drag.y);
      E.drag = { ...E.drag, x, y };
    }
    scheduleOverlay();
    return;
  }
  const a = E.tmp; if (!a) return;
  if (a.t === 'draw') {
    const lastPt = a.pts[a.pts.length - 1];
    if (!lastPt || Math.hypot(x - lastPt[0], y - lastPt[1]) >= 0.45) {
      a.pts.push([x, y]);
    }
  }
  else if ('x1' in a) { a.x2 = x; a.y2 = y; }
  else {
    let w = Math.abs(x - a.ox), h = Math.abs(y - a.oy);
    if (e.shiftKey && (a.t === 'circle' || a.t === 'rect')) { w = h = Math.max(w, h); }
    a.x = x < a.ox ? a.ox - w : a.ox;
    a.y = y < a.oy ? a.oy - h : a.oy;
    a.w = w; a.h = h;
  }
  scheduleOverlay();
};
ov.onpointerup = async () => {
  if (E.pan) { E.pan = null; ov.style.cursor = E.tool === 'hand' ? 'grab' : 'default'; return; }
  if (E._commentDrag) {
    const cd = E._commentDrag;
    E._commentDrag = null;
    if (cd.moved && cd.c && E.vp) {
      const [bx, by, bw, bh] = commentBBox(cd.c) || [0, 0, 18, 18];
      const nx = bx + cd.dx, ny = by + cd.dy;
      const [X1, Y1] = E.vp.convertToPdfPoint(nx, ny + bh);
      const [X2, Y2] = E.vp.convertToPdfPoint(nx + bw, ny);
      const newRect = [Math.min(X1, X2), Math.min(Y1, Y2), Math.max(X1, X2), Math.max(Y1, Y2)];
      await mutate(doc => {
        const f = findAnnot(doc, cd.key);
        if (!f) return;
        f.d.set(PDFName.of('Rect'), doc.context.obj(newRect));
        f.d.set(PDFName.of('M'), PDFString.of(pdfDate()));
      }, 'Moved note');
    } else {
      overlay();
    }
    return;
  }
  if (E.erasing) { if (!E.erasedAny && E.annUndo.length) E.annUndo.pop(); E.erasing = false; E.erasedAny = false; return; }
  if (E.tool === 'poly' || E.tool === 'area') {
    if (E.tool === 'area' && E._polyDragStart && E.tmp && E.tmp.pts && E.tmp.pts.length === 4 && E.polyPts.length === 1) {
      const pts = E.tmp.pts;
      E.polyPts = [];
      E._polyDragStart = null;
      E.tmp = null;
      pushAnnState('Add area measurement');
      const _mArea = { t: 'area', pts, closed: true, color: $('#eColor').value || '#10b981', size: +$('#eSize').value || 2 };
      (E.meas[E.cur] = E.meas[E.cur] || []).push(_mArea);
      E.uncommittedAnns = E.uncommittedAnns || [];
      E.uncommittedAnns.push({ bucket: 'meas', page: E.cur, item: _mArea });
      overlay(); updateDocInspector();
      return;
    }
    E._polyDragStart = null;
    return; // finished on dblclick or Enter
  }
  if (E.drag) {
    const wasMoved = E.drag.moved;
    const wasHdl = E.drag.hdl;
    const dragPtX = E.drag.x, dragPtY = E.drag.y;
    const origBox = E.drag.orig;
    if (!wasMoved && !wasHdl && E.annUndo.length) E.annUndo.pop();
    E.drag = null;
    if (wasMoved && wasHdl && E.sel && E.sel.t === 'image' && E.sel.tableSpec && origBox && origBox.w > 0 && origBox.h > 0) {
      const sx = E.sel.w / origBox.w, sy = E.sel.h / origBox.h;
      const spec = E.sel.tableSpec;
      if (Array.isArray(spec.colWidths)) spec.colWidths = spec.colWidths.map(cw => Math.max(36, Math.round(cw * sx)));
      spec.rowHeight = Math.max(18, Math.round((spec.rowHeight || 26) * sy));
      await refreshTableAnnotationImage(E.sel);
    } else if (!wasMoved && !wasHdl && E.sel && E.sel.t === 'image' && E.sel.tableSpec) {
      const cellHit = hitTableCell(E.sel, dragPtX, dragPtY);
      openInlineTableEditor(E.sel, cellHit ? cellHit.row : 0, cellHit ? cellHit.col : 0);
      return;
    }
  }
  const a = E.tmp; if (!a) return; E.tmp = null;
  const [, , w, h] = bbox(a);
  if (a.t === 'cal') {
    overlay();
    const lenPt = Math.hypot((a.x2 || 0) - (a.x1 || 0), (a.y2 || 0) - (a.y1 || 0));
    if (lenPt > 2) {
      const isEng = window.CAMState && window.CAMState.unitSystem === 'english';
      const defUnit = isEng ? 'mils' : 'mm';
      const curPtsPerIn = E.calPtsPerInch || 72;
      const estVal = defUnit === 'mils' ? +(lenPt * 1000 / curPtsPerIn).toFixed(1) : +(lenPt * 25.4 / curPtsPerIn).toFixed(2);
      const r = await dialog('Calibrate PDF Drawing Scale', [
        { type: 'note', label: `Reference segment measured ${lenPt.toFixed(2)} PDF points.` },
        { type: 'number', id: 'val', label: 'Known Real-World Distance', value: estVal > 0 ? estVal : (defUnit === 'mils' ? 100 : 25.4), min: 0.0001, step: 0.01 },
        { type: 'select', id: 'unit', label: 'Measurement Unit', value: defUnit, options: [
          { label: 'Millimeters (mm — IPC Metric)', value: 'mm' },
          { label: 'Mils / Thou (mil — IPC English)', value: 'mils' },
          { label: 'Inches (in — IPC English)', value: 'in' }
        ] },
        { type: 'check', id: 'resetNative', label: 'Reset to Default 1:1 PDF Scale (72 pt/in)', value: false }
      ], 'Apply Scale');
      setTool('select');
      if (r) {
        if (r.resetNative) {
          E.calPtsPerInch = 72;
          overlay();
          st('Reset PDF measurement scale to 1:1 (72 pt/in).');
        } else if (parseFloat(r.val) > 0) {
          const val = parseFloat(r.val);
          const inches = r.unit === 'mm' ? (val / 25.4) : r.unit === 'mils' ? (val / 1000) : val;
          if (inches > 0) {
            E.calPtsPerInch = lenPt / inches;
            if (window.setUnitSystem) window.setUnitSystem(r.unit === 'mm' ? 'metric' : 'english', true);
            overlay();
            st(`Calibrated PDF scale: ${val} ${r.unit} (${E.calPtsPerInch.toFixed(2)} pt/in)`);
          }
        }
      }
    }
    return;
  }
  if (a.t === 'meas') {
    if (w > 2 || h > 2) {
      pushAnnState('Add measurement');
      (E.meas[E.cur] = E.meas[E.cur] || []).push(a);
      E.uncommittedAnns = E.uncommittedAnns || [];
      E.uncommittedAnns.push({ bucket: 'meas', page: E.cur, item: a });
    }
    overlay(); updateDocInspector();
    return;
  }
  if (a.t === 'crect') { overlay(); if (w > 3 && h > 3) finishMarkup(a); return; }
  if (a.t === 'leader' && (w > 4 || h > 4)) {
    const r = await dialog('Leader Callout Text', [{ id: 'txt', label: 'Annotation Text', value: 'Check tolerance & clearance' }, { type: 'symbols' }], 'Add Callout');
    if (r && r.txt) { a.text = r.txt; addAnn(a); } else overlay();
    return;
  }
  if ((a.t === 'line' || a.t === 'arrow') && w <= 2 && h <= 2 && !E._lineClickMode) {
    E.tmp = a;
    E._lineClickMode = true;
    overlay();
    return;
  }
  E._lineClickMode = false;
  if (a.t === 'draw') {
    delete a.ox; delete a.oy;
    addAnn(a);
    if (E.tool === 'draw') { E.sel = null; overlay(); }
  } else if (w > 2 || h > 2) { delete a.ox; delete a.oy; addAnn(a); } else overlay();
};
ov.onpointercancel = () => {
  if (E.tmp && E.tmp.t === 'draw' && Array.isArray(E.tmp.pts) && E.tmp.pts.length >= 1) {
    const finDraw = E.tmp;
    E.tmp = null;
    addAnn(finDraw);
    if (E.tool === 'draw') { E.sel = null; overlay(); }
  } else {
    E.tmp = null;
    E.pan = null;
    E.drag = null;
    E.erasing = false;
    overlay();
  }
};

function finishPolygonTool() {
  if ((E.tool !== 'poly' && E.tool !== 'area') || E.polyPts.length < (E.tool === 'area' ? 3 : 2)) {
    E.polyPts = []; E.tmp = null; overlay(); return;
  }
  const pts = [...E.polyPts];
  const toolType = E.tool;
  E.polyPts = [];
  E.tmp = null;
  if (toolType === 'area') {
    pushAnnState('Add area measurement');
    (E.meas[E.cur] = E.meas[E.cur] || []).push({
      t: 'area',
      pts,
      closed: true,
      color: $('#eColor').value || '#10b981',
      size: +$('#eSize').value || 2
    });
    overlay(); updateDocInspector();
  } else {
    addAnn({
      t: 'poly',
      pts,
      closed: pts.length >= 3,
      color: $('#eColor').value,
      size: +$('#eSize').value || 2,
      dash: $('#eDash') ? $('#eDash').value : 'solid',
      fill: $('#eFill').checked,
      bgColor: $('#eBgColor') ? $('#eBgColor').value : $('#eColor').value
    });
  }
}

ov.ondblclick = async e => {
  if (!E.doc) return;
  if (E.tool === 'poly' || E.tool === 'area') {
    e.preventDefault();
    finishPolygonTool();
    return;
  }
  const [x, y] = pt(e);
  const cm = hitComment(x, y, 14 / K());
  if (cm) {
    e.preventDefault();
    E.selC = cm.key;
    overlay();
    await editC(cm);
    return;
  }
  if (!['select', 'text', 'edittext'].includes(E.tool)) return;
  const a = hit(x, y) || E.sel;
  if (!a) return;
  E.sel = a; overlay();
  if (a.t === 'text') {
    openInlineTextEditor({ mode: 'editAnn', ann: a });
  } else if (a.t === 'image' && a.equation) {
    openEquationStudio(a);
  } else if (a.t === 'image' && a.gdtSpec) {
    openGDTBuilder(a);
  } else if (a.t === 'image' && a.tableSpec) {
    const cellHit = hitTableCell(a, x, y);
    openInlineTableEditor(a, cellHit ? cellHit.row : 0, cellHit ? cellHit.col : 0);
  } else if (a.t === 'leader') {
    const r = await dialog('Edit Leader Callout', [{ id: 'v', label: 'Callout Text', value: a.text || 'Callout' }, { type: 'symbols' }], 'Update');
    if (r && r.v) { pushAnnState('Edit callout'); a.text = r.v; overlay(); }
  } else if (a.t === 'cloud') {
    const r = await dialog('Edit Revision Cloud Label', [{ id: 'v', label: 'Delta Tag', value: a.revText || 'Δ Rev 2' }, { type: 'symbols' }], 'Update');
    if (r && r.v != null) { pushAnnState('Edit revision cloud'); a.revText = r.v; overlay(); }
  } else if (a.t === 'stamp') {
    const r = await dialog('Edit Stamp Text', [{ id: 'v', label: 'Stamp Label', value: a.text || 'APPROVED' }], 'Update');
    if (r && r.v) { pushAnnState('Edit stamp'); a.text = r.v; overlay(); }
  } else if (a.t === 'pin') {
    const r = await dialog(`Edit Inspection Pin #${a.pinNum || 1}`, [
      { id: 'v', label: 'Pin Callout Tag / Note', value: a.text || '' },
      { type: 'symbols' },
      { type: 'color', id: 'col', label: 'Pin Colour', value: a.color || '#f59e0b' }
    ], 'Update Pin');
    if (r) { pushAnnState('Edit pin'); a.text = r.v || ''; if (r.col) a.color = r.col; overlay(); }
  }
};
ov.addEventListener('pointerleave', () => {
  if (E.eraserCur) { E.eraserCur = null; overlay(); }
});

// Keyboard Nudge, Polygon Enter, Copy/Paste/Duplicate Selected Annotation
function duplicateSelectedAnn() {
  if (!E.sel) return false;
  const copy = JSON.parse(JSON.stringify(E.sel));
  delete copy.img;
  copy._loadingImg = false;
  if (E.sel.img && typeof E.sel.img === 'object' && ('complete' in E.sel.img || (typeof HTMLCanvasElement !== 'undefined' && E.sel.img instanceof HTMLCanvasElement))) copy.img = E.sel.img;
  copy.locked = false;
  if (copy.t === 'pin') copy.pinNum = E.nextPinNum++;
  moveAnn(copy, 14, 14);
  if (copy.t === 'meas' || copy.t === 'area') {
    pushAnnState('Duplicate measurement');
    (E.meas[E.cur] = E.meas[E.cur] || []).push(copy);
    E.sel = copy; overlay(); updateDocInspector();
  } else {
    addAnn(copy);
  }
  st('Duplicated selected annotation');
  return true;
}
function bringSelToFront() {
  if (!E.sel) return;
  const isMeas = (E.sel.t === 'meas' || E.sel.t === 'area') && E.meas[E.cur] && E.meas[E.cur].includes(E.sel);
  const bucket = isMeas ? E.meas : E.ann;
  if (!bucket[E.cur]) return;
  pushAnnState('Bring to front');
  const list = bucket[E.cur].filter(a => a !== E.sel);
  list.push(E.sel);
  bucket[E.cur] = list;
  overlay();
}
function sendSelToBack() {
  if (!E.sel) return;
  const isMeas = (E.sel.t === 'meas' || E.sel.t === 'area') && E.meas[E.cur] && E.meas[E.cur].includes(E.sel);
  const bucket = isMeas ? E.meas : E.ann;
  if (!bucket[E.cur]) return;
  pushAnnState('Send to back');
  const list = bucket[E.cur].filter(a => a !== E.sel);
  list.unshift(E.sel);
  bucket[E.cur] = list;
  overlay();
}

addEventListener('keydown', e => {
  if (document.body.dataset.view !== 'edit' || !E.doc) return;
  if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) return;

  const c = e.ctrlKey || e.metaKey;
  if (c && e.key.toLowerCase() === 'c' && E.sel && !selInfo()) {
    E.clip = JSON.parse(JSON.stringify(E.sel));
    delete E.clip.img;
    E.clip._loadingImg = false;
    if (E.sel.img && typeof E.sel.img === 'object' && ('complete' in E.sel.img || (typeof HTMLCanvasElement !== 'undefined' && E.sel.img instanceof HTMLCanvasElement))) E.clip.img = E.sel.img;
    st('Copied annotation to clipboard');
    return;
  }
  if (c && e.key.toLowerCase() === 'v' && E.clip) {
    e.preventDefault();
    const copy = JSON.parse(JSON.stringify(E.clip));
    delete copy.img;
    copy._loadingImg = false;
    if (E.clip.img && typeof E.clip.img === 'object' && ('complete' in E.clip.img || (typeof HTMLCanvasElement !== 'undefined' && E.clip.img instanceof HTMLCanvasElement))) copy.img = E.clip.img;
    copy.locked = false;
    moveAnn(copy, 14, 14);
    addAnn(copy);
    st('Pasted annotation');
    return;
  }
  if (!E.sel) return;
  const step = e.shiftKey ? 10 : 1;
  if (e.key === 'ArrowLeft') { e.preventDefault(); pushAnnState('Nudge annotation'); moveAnn(E.sel, -step, 0); overlay(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); pushAnnState('Nudge annotation'); moveAnn(E.sel, step, 0); overlay(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); pushAnnState('Nudge annotation'); moveAnn(E.sel, 0, -step); overlay(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); pushAnnState('Nudge annotation'); moveAnn(E.sel, 0, step); overlay(); }
});

// ---------- page and document operations ----------
async function reorder(moved, j) {
  const all = [...Array(E.n).keys()], rest = all.filter(x => !moved.includes(x)), pos = rest.filter(x => x < j).length, order = [...rest.slice(0, pos), ...moved, ...rest.slice(pos)];
  if (order.every((v, i) => v === all[i])) return;
  E.cur = order.indexOf(moved[0]);
  await edit(async d => { const nd = await PDFDocument.create(), cp = await nd.copyPages(d, order); cp.forEach(p => nd.addPage(p)); const t = d.getTitle(), a = d.getAuthor(); if (t) nd.setTitle(t); if (a) nd.setAuthor(a); return nd; }, 'Pages reordered');
}
async function save(name, bytes, mime, filters) {
  if (window.native) { const p = await window.native.saveFile({ name, bytes, filters }); if (p) st('Saved ' + p); return p; }
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  st('Saved ' + name);
}
async function saveMany(files) {
  if (window.native) { const d = await window.native.saveMany({ files }); if (d) st('Saved ' + files.length + ' files to ' + d); return d; }
  files.forEach(f => {
    const url = URL.createObjectURL(new Blob([f.bytes]));
    const a = document.createElement('a'); a.href = url; a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
}
const PDFF = [{ name: 'PDF', extensions: ['pdf'] }];
function parseRanges(s, n) {
  const out = []; for (const part of s.split(',').map(x => x.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/); let a, b; if (m) { a = +m[1] || 1; b = +m[2] || n; } else if (/^\d+$/.test(part)) a = b = +part; else throw new Error('Bad range: ' + part);
    if (a < 1 || b > n || a > b) throw new Error('Range out of bounds: ' + part); out.push([a - 1, b - 1]);
  } return out;
}
const STD_FONT_MAP = {
  Helvetica: StandardFonts.HelveticaBold,
  Times: StandardFonts.TimesRomanBold,
  Courier: StandardFonts.CourierBold
};
const STD_FONT_REG_MAP = {
  Helvetica: StandardFonts.Helvetica,
  Times: StandardFonts.TimesRoman,
  Courier: StandardFonts.Courier
};

const ops = {
  async rot(delta) { const t = targets(); await edit(d => { t.forEach(i => { const p = d.getPage(i); p.setRotation(degrees(((p.getRotation().angle + delta) % 360 + 360) % 360)); }); }, 'Rotated ' + t.length + ' page(s)'); },
  async flipH() { const t = targets(); await edit(d => { t.forEach(i => { const p = d.getPage(i), { width } = p.getSize(); p.scaleContent(-1, 1); p.translateContent(width, 0); }); }, 'Mirrored ' + t.length + ' page(s) horizontally'); },
  async flipV() { const t = targets(); await edit(d => { t.forEach(i => { const p = d.getPage(i), { height } = p.getSize(); p.scaleContent(1, -1); p.translateContent(0, height); }); }, 'Mirrored ' + t.length + ' page(s) vertically'); },
  async del() { const t = targets(); if (t.length >= E.n) return st('A PDF needs at least one page.'); E.cur = Math.max(0, Math.min(...t) - 1); await edit(d => { [...t].reverse().forEach(i => d.removePage(i)); }, 'Deleted ' + t.length + ' page(s)'); },
  async dup() {
    if (E.sel) { duplicateSelectedAnn(); return; }
    const t = targets(); await edit(async d => { for (let k = t.length - 1; k >= 0; k--) { const [c] = await d.copyPages(d, [t[k]]); d.insertPage(t[k] + 1, c); } }, 'Duplicated page(s)');
  },
  async blank() {
    if (!E.bytes) {
      const nd = await PDFDocument.create();
      nd.addPage([595.28, 841.89]);
      await openBytes(await nd.save(), 'Blank_Sheet.pdf');
      return st('Created new A4 blank sheet');
    }
    const i = E.cur; E.cur = i + 1; await edit(d => { const s = d.getPage(i).getSize(); d.insertPage(i + 1, [s.width, s.height]); }, 'Blank page inserted');
  },
  async extract(path) { const t = targets(); await commit(); const d = await PDFDocument.load(E.bytes, LOAD), nd = await PDFDocument.create(); (await nd.copyPages(d, t)).forEach(p => nd.addPage(p)); return save(baseName() + '_pages.pdf', await nd.save(), 'application/pdf', PDFF); },
  async merge(files) {
    const bufs = []; for (const f of files) bufs.push(new Uint8Array(await f.arrayBuffer()));
    if (!E.bytes) { const nd = await PDFDocument.create(); for (const b of bufs) { const s = await PDFDocument.load(b, LOAD); (await nd.copyPages(s, s.getPageIndices())).forEach(p => nd.addPage(p)); } await openBytes(await nd.save(), 'merged.pdf'); E.savedBytes = null; return st('Merged ' + files.length + ' files'); }
    await edit(async d => { for (const b of bufs) { const s = await PDFDocument.load(b, LOAD); (await d.copyPages(s, s.getPageIndices())).forEach(p => d.addPage(p)); } }, 'Merged ' + files.length + ' file(s) at the end');
  },
  async images(files, mode) {
    const items = []; for (const f of files) { const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }), im = await loadImg(url); items.push({ url, im, type: f.type }); }
    const add = async d => {
      for (const it of items) {
        let bytes, jpg = it.type === 'image/jpeg';
        if (jpg) bytes = Uint8Array.from(atob(it.url.split(',')[1]), c => c.charCodeAt(0)); else { const c = document.createElement('canvas'); c.width = it.im.naturalWidth; c.height = it.im.naturalHeight; c.getContext('2d').drawImage(it.im, 0, 0); const blob = await new Promise(r => c.toBlob(r, 'image/png')); c.width = 0; c.height = 0; bytes = new Uint8Array(await blob.arrayBuffer()); }
        const img = jpg ? await d.embedJpg(bytes) : await d.embedPng(bytes); let W = img.width, H = img.height;
        if (mode === 'a4') { W = 595.28; H = 841.89; const s = Math.min((W - 40) / img.width, (H - 40) / img.height), w = img.width * s, h = img.height * s, p = d.addPage([W, H]); p.drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h }); }
        else { const p = d.addPage([W, H]); p.drawImage(img, { x: 0, y: 0, width: W, height: H }); }
      }
    };
    if (!E.bytes) { const nd = await PDFDocument.create(); await add(nd); await openBytes(await nd.save(), 'images.pdf'); E.savedBytes = null; return st('Created PDF from ' + items.length + ' image(s)'); }
    await edit(add, 'Added ' + items.length + ' image page(s) at the end');
  },
  async split(p) {
    await commit(); const d = await PDFDocument.load(E.bytes, LOAD), files = [];
    const groups = p.mode === 'each' ? [...Array(E.n).keys()].map(i => [[i, i]]) : parseRanges(p.ranges, E.n).map(r => [r]);
    let k = 0; for (const g of groups) { k++; const idx = []; g.forEach(([a, b]) => { for (let i = a; i <= b; i++) idx.push(i); }); const nd = await PDFDocument.create(); (await nd.copyPages(d, idx)).forEach(x => nd.addPage(x)); files.push({ name: `${baseName()}_part${k}.pdf`, bytes: await nd.save() }); }
    return saveMany(files);
  },
  async png(p) {
    await commit(); const t = p.which === 'sel' ? targets() : [...Array(E.n).keys()], files = [];
    for (const i of t) { const pg = await E.doc.getPage(i + 1), v = pg.getViewport({ scale: p.dpi / 72 }), c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: x, viewport: v }).promise; const blob = await new Promise(r => c.toBlob(r, 'image/png')); c.width = 0; c.height = 0; if (i !== E.cur && typeof pg.cleanup === 'function') { try { pg.cleanup(); } catch (e) {} } files.push({ name: `${baseName()}_p${i + 1}.png`, bytes: new Uint8Array(await blob.arrayBuffer()) }); }
    return saveMany(files);
  },
  async wm(p) {
    const t = p.which === 'sel' ? targets() : [...Array(E.n).keys()];
    await edit(async d => {
      const fontEnum = STD_FONT_MAP[p.fam] || StandardFonts.HelveticaBold;
      const font = await d.embedFont(fontEnum), col = hexRgb(p.color);
      for (const i of t) { const pg = d.getPage(i), mb = pg.getMediaBox(), R = ((pg.getRotation().angle % 360) + 360) % 360, th = (p.angle + R) * Math.PI / 180, w = canEncodeAll(font, p.text) ? font.widthOfTextAtSize(safeText(font, p.text), p.size) : (String(p.text || '').length * p.size * 0.75), h = p.size * .7, cx = mb.x + mb.width / 2, cy = mb.y + mb.height / 2;
        await drawPdfTextOrSprite(d, pg, font, p.text, { x: cx - (w / 2 * Math.cos(th) - h / 2 * Math.sin(th)), y: cy - (w / 2 * Math.sin(th) + h / 2 * Math.cos(th)), size: p.size, color: col, opacity: p.opacity / 100, rotate: degrees(p.angle + R), bold: true }); }
    }, 'Watermark added');
  },
  async nums(p) {
    await edit(async d => {
      const fontEnum = STD_FONT_REG_MAP[p.fam] || StandardFonts.Helvetica;
      const font = await d.embedFont(fontEnum), N = d.getPageCount();
      d.getPages().forEach((pg, i) => {
        const txt = safeText(font, p.fmt.replace(/\{n\}/gi, String(i + p.start)).replace(/\{N\}/gi, String(N))), mb = (pg.getCropBox ? pg.getCropBox() : null) || pg.getMediaBox(), R = ((pg.getRotation().angle % 360) + 360) % 360, vw = R % 180 ? mb.height : mb.width, vh = R % 180 ? mb.width : mb.height, w = font.widthOfTextAtSize(txt, p.size);
        const [v, hz] = p.pos.split('-'), vy = v === 'top' ? 36 : vh - 36, vx = hz === 'left' ? 36 : hz === 'right' ? vw - 36 - w : (vw - w) / 2;
        let X, Y;
        if (R === 0) { X = mb.x + vx; Y = mb.y + mb.height - vy; } else if (R === 90) { X = mb.x + vy; Y = mb.y + vx; } else if (R === 180) { X = mb.x + mb.width - vx; Y = mb.y + vy; } else { X = mb.x + mb.width - vy; Y = mb.y + mb.height - vx; }
        pg.drawText(txt, { x: X, y: Y, size: p.size, font, color: rgb(.1, .1, .1), rotate: degrees(R) });
      });
    }, 'Page numbers added');
  },
  async bates(p) {
    const t = p.which === 'sel' ? targets() : [...Array(E.n).keys()];
    await edit(async d => {
      const font = await d.embedFont(StandardFonts.CourierBold), col = hexRgb(p.color || '#1e293b');
      t.forEach((pageIdx, seqIdx) => {
        const pg = d.getPage(pageIdx), mb = pg.getMediaBox(), R = ((pg.getRotation().angle % 360) + 360) % 360;
        const numStr = String((+p.start || 1) + seqIdx).padStart(+p.digits || 6, '0');
        const txt = safeText(font, `${p.prefix || 'DWG-'}${numStr}${p.suffix || ''}`);
        const vw = R % 180 ? mb.height : mb.width, vh = R % 180 ? mb.width : mb.height, w = font.widthOfTextAtSize(txt, p.size || 10);
        const [v, hz] = (p.pos || 'bottom-right').split('-'), vy = v === 'top' ? 28 : vh - 28, vx = hz === 'left' ? 32 : hz === 'right' ? vw - 32 - w : (vw - w) / 2;
        let X, Y;
        if (R === 0) { X = mb.x + vx; Y = mb.y + mb.height - vy; } else if (R === 90) { X = mb.x + vy; Y = mb.y + vx; } else if (R === 180) { X = mb.x + mb.width - vx; Y = mb.y + vy; } else { X = mb.x + mb.width - vy; Y = mb.y + mb.height - vx; }
        pg.drawText(txt, { x: X, y: Y, size: p.size || 10, font, color: col, rotate: degrees(R) });
      });
    }, `Bates numbering applied to ${t.length} page(s)`);
  },
  async resize(p) {
    const SIZES = {
      a4: [595.28, 841.89],
      a3: [841.89, 1190.55],
      letter: [612, 792],
      legal: [612, 1008],
      tabloid: [792, 1224],
      ansic: [1224, 1584],
      ansid: [1584, 2448]
    };
    const t = p.which === 'sel' ? targets() : [...Array(E.n).keys()];
    let [tw, th] = SIZES[p.preset] || SIZES.a4;
    if (p.orient === 'landscape') [tw, th] = [Math.max(tw, th), Math.min(tw, th)];
    else [tw, th] = [Math.min(tw, th), Math.max(tw, th)];
    await edit(d => {
      t.forEach(i => {
        const pg = d.getPage(i), { width, height } = pg.getSize();
        if (p.scaleContent && width > 0 && height > 0) {
          const sx = tw / width, sy = th / height, s = Math.min(sx, sy);
          pg.scaleContent(s, s);
        }
        pg.setSize(tw, th);
      });
    }, `Resized ${t.length} page(s) to ${p.preset.toUpperCase()} (${p.orient})`);
  },
  async text() {
    await commit(); let out = ''; for (let i = 1; i <= E.n; i++) { const pg = await E.doc.getPage(i); const tc = await pg.getTextContent(); if (i - 1 !== E.cur && typeof pg.cleanup === 'function') { try { pg.cleanup(); } catch (e) {} } out += `--- Page ${i} ---\n` + tc.items.map(x => x.str + (x.hasEOL ? '\n' : '')).join('') + '\n\n'; }
    return save(baseName() + '.txt', new TextEncoder().encode(out), 'text/plain', [{ name: 'Text', extensions: ['txt'] }]);
  },
  async meta(p) { await edit(d => { d.setTitle(p.title); d.setAuthor(p.author); d.setSubject(p.subject); d.setKeywords(p.keywords.split(',').map(s => s.trim()).filter(Boolean)); }, 'Properties updated'); },
  async opt() { const before = E.bytes.length; await edit(async d => d, ''); st('Rewritten: ' + (before / 1024).toFixed(0) + ' KB to ' + (E.bytes.length / 1024).toFixed(0) + ' KB'); },
  async send(k) { if (!E.bytes) return st('Open a PDF first.'); await commit(); window.setView('compare'); await window.compareLoadBytes(k, E.bytes, E.name, E.path); }
};
const D = {
  which: { type: 'select', id: 'which', label: 'Pages', options: [{ label: 'All pages', value: 'all' }, { label: 'Selected pages', value: 'sel' }] },
  stdFam: { type: 'select', id: 'fam', label: 'Font Family', value: 'Helvetica', options: [{ label: 'Helvetica (Sans-Serif)', value: 'Helvetica' }, { label: 'Times New Roman (Serif)', value: 'Times' }, { label: 'Courier New (Monospace)', value: 'Courier' }] }
};
const ui = {
  rotL: () => ops.rot(-90), rotR: () => ops.rot(90), del: ops.del, dup: ops.dup, blank: ops.blank, extract: ops.extract, text: ops.text, opt: ops.opt, toA: () => ops.send('A'), toB: () => ops.send('B'),
  async split() { if (!E.bytes) return; const p = await dialog('Split PDF', [{ type: 'select', id: 'mode', label: 'Split', options: [{ label: 'Every page to its own file', value: 'each' }, { label: 'Custom ranges', value: 'ranges' }] }, { id: 'ranges', label: 'Ranges', value: '1-3,4-' }, { type: 'note', label: 'Ranges are used only for Custom ranges. Each range becomes one file. You choose the folder next.' }], 'Split'); if (p) try { await ops.split(p); } catch (e) { st('Error: ' + e.message); } },
  async png() { if (!E.bytes) return; const p = await dialog('Export pages as PNG', [D.which, { type: 'number', id: 'dpi', label: 'Resolution (dpi)', value: 300, min: 72, max: 600 }, { type: 'note', label: 'You choose the folder next.' }], 'Export'); if (p) await ops.png(p); },
  async wm() { if (!E.bytes) return; const p = await dialog('Watermark', [{ id: 'text', label: 'Text', value: 'CONFIDENTIAL' }, D.stdFam, { type: 'number', id: 'size', label: 'Size (pt)', value: 60, min: 8, max: 300 }, { type: 'number', id: 'opacity', label: 'Opacity %', value: 20, min: 1, max: 100 }, { type: 'number', id: 'angle', label: 'Angle (°)', value: 45, min: -180, max: 180 }, { type: 'color', id: 'color', label: 'Colour', value: '#888888' }, D.which], 'Apply'); if (p && p.text) await ops.wm(p); },
  async nums() { if (!E.bytes) return; const p = await dialog('Page numbers', [{ id: 'fmt', label: 'Format', value: 'Page {n} of {N}' }, D.stdFam, { type: 'select', id: 'pos', label: 'Position', options: [{ label: 'Bottom centre', value: 'bottom-center' }, { label: 'Bottom right', value: 'bottom-right' }, { label: 'Bottom left', value: 'bottom-left' }, { label: 'Top centre', value: 'top-center' }, { label: 'Top right', value: 'top-right' }, { label: 'Top left', value: 'top-left' }] }, { type: 'number', id: 'size', label: 'Size (pt)', value: 10, min: 6, max: 40 }, { type: 'number', id: 'start', label: 'First number', value: 1 }], 'Apply'); if (p) await ops.nums(p); },
  async bates() {
    if (!E.bytes) return;
    const p = await dialog('Bates Numbering Stamp', [
      { id: 'prefix', label: 'Prefix', value: 'DWG-' },
      { id: 'suffix', label: 'Suffix (optional)', value: '' },
      { type: 'number', id: 'digits', label: 'Zero-Pad Digits', value: 6, min: 1, max: 12 },
      { type: 'number', id: 'start', label: 'Starting Number', value: 1, min: 1 },
      { type: 'select', id: 'pos', label: 'Stamp Position', options: [{ label: 'Bottom Right', value: 'bottom-right' }, { label: 'Bottom Left', value: 'bottom-left' }, { label: 'Top Right', value: 'top-right' }, { label: 'Top Left', value: 'top-left' }] },
      { type: 'number', id: 'size', label: 'Font Size (pt)', value: 10, min: 6, max: 32 },
      { type: 'color', id: 'color', label: 'Stamp Colour', value: '#1e293b' },
      D.which
    ], 'Apply Bates #');
    if (p) await ops.bates(p);
  },
  async resize() {
    if (!E.bytes) return;
    const p = await dialog('Resize Page Dimensions', [
      { type: 'select', id: 'preset', label: 'Paper Size Preset', value: 'a4', options: [
        { label: 'ISO A4 (210 × 297 mm)', value: 'a4' },
        { label: 'ISO A3 (297 × 420 mm)', value: 'a3' },
        { label: 'US Letter (8.5 × 11 in)', value: 'letter' },
        { label: 'US Legal (8.5 × 14 in)', value: 'legal' },
        { label: 'Tabloid / ANSI B (11 × 17 in)', value: 'tabloid' },
        { label: 'ANSI C Schematic (17 × 22 in)', value: 'ansic' },
        { label: 'ANSI D Blueprint (22 × 34 in)', value: 'ansid' }
      ] },
      { type: 'select', id: 'orient', label: 'Orientation', value: 'portrait', options: [{ label: 'Portrait', value: 'portrait' }, { label: 'Landscape', value: 'landscape' }] },
      { type: 'checkbox', id: 'scaleContent', label: 'Scale page content proportionally to fit new size', value: true },
      D.which
    ], 'Resize Pages');
    if (p) await ops.resize(p);
  },
  async meta() { if (!E.bytes) return; const d = await PDFDocument.load(E.bytes, LOAD); const p = await dialog('Document properties', [{ id: 'title', label: 'Title', value: d.getTitle() || '' }, { id: 'author', label: 'Author', value: d.getAuthor() || '' }, { id: 'subject', label: 'Subject', value: d.getSubject() || '' }, { id: 'keywords', label: 'Keywords', value: d.getKeywords() || '' }], 'Save'); if (p) await ops.meta(p); }
};

// ---------- more operations ----------
const v2u = pg => { const mb = (pg.getCropBox ? pg.getCropBox() : null) || pg.getMediaBox(), R = ((pg.getRotation().angle % 360) + 360) % 360, vw = R % 180 ? mb.height : mb.width, vh = R % 180 ? mb.width : mb.height;
  return { vw, vh, R, f: (vx, vy) => R === 0 ? [mb.x + vx, mb.y + mb.height - vy] : R === 90 ? [mb.x + vy, mb.y + vx] : R === 180 ? [mb.x + mb.width - vx, mb.y + vy] : [mb.x + mb.width - vy, mb.y + mb.height - vx] }; };
const pickSet = which => which === 'sel' ? targets() : [...Array(E.n).keys()];
Object.assign(ops, {
  
  async margins(p) {
    const PRESETS_MM = { normal: 25.4, narrow: 12.7, moderate: 19.05, wide: 38.1 };
    const mMM = p.preset === 'custom' ? (+p.customMM || 20) : (PRESETS_MM[p.preset] || 25.4);
    const padPt = mMM * 72 / 25.4;
    const t = pickSet(p.which);
    await edit(d => {
      t.forEach(i => {
        const pg = d.getPage(i), { width, height } = pg.getSize();
        if (p.mode === 'scale' && width > padPt * 2 && height > padPt * 2) {
          const sx = (width - padPt * 2) / width, sy = (height - padPt * 2) / height, s = Math.min(sx, sy);
          pg.scaleContent(s, s);
          pg.translateContent((width - width * s) / 2, (height - height * s) / 2);
        }
        if (p.drawGuides) {
          pg.drawRectangle({
            x: padPt,
            y: padPt,
            width: Math.max(10, width - padPt * 2),
            height: Math.max(10, height - padPt * 2),
            borderColor: rgb(0.78, 0.83, 0.9),
            borderWidth: 0.6
          });
        }
      });
    }, `Applied MS Word ${p.preset} page margins (${mMM.toFixed(1)} mm)`);
  },
  async pagecolor(p) {
    const PRESET_COLS = {
      cream: '#fdfbf7',
      sky: '#f0f9ff',
      mint: '#f0fdf4',
      slate: '#f1f5f9',
      blueprint: '#0f172a',
      white: '#ffffff'
    };
    const hex = p.preset === 'custom' ? (p.color || '#fdfbf7') : (PRESET_COLS[p.preset] || '#fdfbf7');
    const col = hexRgb(hex);
    const op = Math.max(0.08, Math.min(1, (+p.opacity || 35) / 100));
    const t = pickSet(p.which);
    await edit(d => {
      t.forEach(i => {
        const pg = d.getPage(i), { width, height } = pg.getSize();
        pg.drawRectangle({ x: 0, y: 0, width, height, color: col, opacity: op });
      });
    }, `Applied page background tint (${hex})`);
  },
  async pageborder(p) {
    const t = pickSet(p.which);
    const mPt = (+p.marginMM || 12) * 72 / 25.4;
    const lw = Math.max(0.5, +p.widthPt || 1.5);
    const col = hexRgb(p.color || '#1e3a8a');
    await edit(d => {
      t.forEach(i => {
        const pg = d.getPage(i), { width, height } = pg.getSize();
        const x = mPt, y = mPt, w = Math.max(20, width - mPt * 2), h = Math.max(20, height - mPt * 2);
        const dash = p.style === 'dashed' ? [6, 4] : undefined;
        pg.drawRectangle({ x, y, width: w, height: h, borderColor: col, borderWidth: lw, ...(dash ? { borderDashArray: dash } : {}) });
        if (p.style === 'double') {
          pg.drawRectangle({ x: x + 3.5, y: y + 3.5, width: w - 7, height: h - 7, borderColor: col, borderWidth: Math.max(0.6, lw * 0.6) });
        } else if (p.style === 'engineering') {
          pg.drawRectangle({ x: x + 3, y: y + 3, width: w - 6, height: h - 6, borderColor: col, borderWidth: 0.7 });
          pg.drawRectangle({ x: x + w - 180, y: y + 3, width: 177, height: 42, borderColor: col, borderWidth: 1, color: rgb(0.96, 0.98, 1) });
        }
      });
    }, `Added MS Word ${p.style} page border`);
  },
  
  async titleblock(p) {
    const applyTB = async d => {
      const fBold = await d.embedFont(StandardFonts.HelveticaBold);
      const fReg = await d.embedFont(StandardFonts.Helvetica);
      const fMono = await d.embedFont(StandardFonts.CourierBold);
      const pages = p.which === 'sel' ? targets().map(i => d.getPage(i)) : d.getPages();
      const col = hexRgb(p.color || '#0f172a');
      const accent = hexRgb('#185abd');
      const docHash = (window.RP_MEASURE && window.RP_MEASURE.docHash) || 'A3F8E902B1764D5C';

      pages.forEach((pg, idx) => {
        const { width, height } = pg.getSize();
        const tbW = Math.min(290, width - 36);
        const tbH = 96;
        const bx = width - tbW - 18;
        const by = 18;

        // Outer sheet border frame
        pg.drawRectangle({ x: 18, y: 18, width: width - 36, height: height - 36, borderColor: col, borderWidth: 1.2 });
        // Title block background & grid
        pg.drawRectangle({ x: bx, y: by, width: tbW, height: tbH, color: rgb(0.99, 0.99, 1), borderColor: col, borderWidth: 1.4 });
        pg.drawRectangle({ x: bx, y: by + tbH - 20, width: tbW, height: 20, color: accent });
        pg.drawText(safeText(fBold, p.company || 'KENSHO STUDIO · PRECISION ENGINEERING'), { x: bx + 8, y: by + tbH - 14, size: 9.5, font: fBold, color: rgb(1, 1, 1) });

        // Horizontal dividers
        pg.drawLine({ start: { x: bx, y: by + 52 }, end: { x: bx + tbW, y: by + 52 }, thickness: 0.8, color: col });
        pg.drawLine({ start: { x: bx, y: by + 26 }, end: { x: bx + tbW, y: by + 26 }, thickness: 0.8, color: col });
        // Vertical dividers
        pg.drawLine({ start: { x: bx + tbW * 0.58, y: by }, end: { x: bx + tbW * 0.58, y: by + 52 }, thickness: 0.8, color: col });
        pg.drawLine({ start: { x: bx + tbW * 0.82, y: by + 26 }, end: { x: bx + tbW * 0.82, y: by + 52 }, thickness: 0.8, color: col });

        // Title Row
        pg.drawText('TITLE:', { x: bx + 6, y: by + 67, size: 6.5, font: fBold, color: rgb(0.4, 0.45, 0.52) });
        pg.drawText(safeText(fBold, p.title || 'POWER REGULATION & CONTROL ASSEMBLY'), { x: bx + 6, y: by + 56, size: 9.5, font: fBold, color: col });

        // Middle Row: Drawing No | Scale | Rev
        pg.drawText('DWG NO:', { x: bx + 6, y: by + 44, size: 6.5, font: fBold, color: rgb(0.4, 0.45, 0.52) });
        pg.drawText(safeText(fMono, p.dwgNo || 'DWG-ENG-2026-01'), { x: bx + 6, y: by + 31, size: 9, font: fMono, color: col });

        pg.drawText('SCALE:', { x: bx + tbW * 0.58 + 5, y: by + 44, size: 6.5, font: fBold, color: rgb(0.4, 0.45, 0.52) });
        pg.drawText(safeText(fReg, p.scale || '1:1 (MM)'), { x: bx + tbW * 0.58 + 5, y: by + 31, size: 8.5, font: fReg, color: col });

        pg.drawText('REV:', { x: bx + tbW * 0.82 + 5, y: by + 44, size: 6.5, font: fBold, color: rgb(0.4, 0.45, 0.52) });
        pg.drawText(safeText(fBold, p.rev || 'B'), { x: bx + tbW * 0.82 + 8, y: by + 31, size: 10, font: fBold, color: rgb(0.85, 0.15, 0.2) });

        // Bottom Row: Tol / Material | Engineer / SHA-256 / Sheet
        pg.drawText(safeText(fReg, `TOL: ${p.tol || 'ISO 2768-m (±0.1mm)'}`), { x: bx + 6, y: by + 15, size: 7.5, font: fReg, color: col });
        pg.drawText(safeText(fReg, `ENGR: ${p.author || getAuthor() || 'Lead Eng'} · ${new Date().toLocaleDateString()}`), { x: bx + 6, y: by + 5, size: 7, font: fReg, color: rgb(0.35, 0.4, 0.48) });
        pg.drawText(safeText(fMono, `SHA:${docHash.slice(0, 8)}`), { x: bx + tbW * 0.58 + 5, y: by + 15, size: 7.5, font: fMono, color: accent });
        pg.drawText(safeText(fBold, `SHEET ${idx + 1} OF ${pages.length}`), { x: bx + tbW * 0.58 + 5, y: by + 5, size: 7.5, font: fBold, color: col });
      });
    };
    if (!E.bytes) {
      const nd = await PDFDocument.create();
      nd.addPage([841.89, 595.28]); // A4 Landscape Engineering Sheet
      await applyTB(nd);
      await openBytes(await nd.save(), 'Engineering_Drawing_Sheet.pdf');
      return st('Created new A4 Landscape PDF sheet with ISO/ANSI Engineering Title Block');
    }
    await edit(applyTB, 'Stamped ISO / ANSI Engineering Title Block');
  },
  async coverpage(p) {
    const addCover = async d => {
      const fBold = await d.embedFont(StandardFonts.HelveticaBold);
      const fReg = await d.embedFont(StandardFonts.Helvetica);
      const fItal = await d.embedFont(StandardFonts.HelveticaOblique);
      const W = 595.28, H = 841.89;
      const pg = d.insertPage(0, [W, H]);
      const accent = hexRgb(p.color || '#185abd');
      // MS Word Modern Cover Page Layout
      pg.drawRectangle({ x: 0, y: H - 230, width: W, height: 230, color: accent });
      pg.drawRectangle({ x: 0, y: H - 238, width: W, height: 8, color: rgb(0.9, 0.22, 0.27) });
      pg.drawRectangle({ x: 48, y: 64, width: 4, height: H - 340, color: accent });
      pg.drawText(safeText(fBold, p.title || 'ENGINEERING SPECIFICATION & REPORT'), { x: 48, y: H - 115, size: 22, font: fBold, color: rgb(1, 1, 1) });
      pg.drawText(safeText(fItal, p.subtitle || 'Technical Documentation & Design Verification Package'), { x: 48, y: H - 148, size: 13, font: fItal, color: rgb(0.88, 0.93, 1) });
      pg.drawText(safeText(fBold, 'PREPARED BY:'), { x: 64, y: 210, size: 10, font: fBold, color: accent });
      pg.drawText(safeText(fReg, p.author || getAuthor() || 'Lead Systems Engineer'), { x: 64, y: 192, size: 12, font: fReg, color: rgb(0.1, 0.14, 0.2) });
      pg.drawText(safeText(fBold, 'ORGANIZATION / DEPARTMENT:'), { x: 64, y: 158, size: 10, font: fBold, color: accent });
      pg.drawText(safeText(fReg, p.org || 'Kensho Studio · Precision Engineering'), { x: 64, y: 140, size: 12, font: fReg, color: rgb(0.1, 0.14, 0.2) });
      pg.drawText(safeText(fBold, 'DATE:'), { x: 64, y: 106, size: 10, font: fBold, color: accent });
      pg.drawText(safeText(fReg, p.date || new Date().toLocaleDateString()), { x: 64, y: 88, size: 11, font: fReg, color: rgb(0.25, 0.3, 0.38) });
    };
    if (!E.bytes) {
      const nd = await PDFDocument.create();
      await addCover(nd);
      await openBytes(await nd.save(), 'Document_With_Cover.pdf');
      return st('Created new PDF with MS Word Cover Page');
    }
    E.cur = 0;
    await edit(addCover, 'Inserted MS Word Cover Page at Page 1');
  },
  async table(p = {}) {
    if (!E.bytes) await ops.blank();
    const spec = createTableSpec(p);
    const { dataUrl, wPt, hPt } = renderTableToDataUrl(spec, 4);
    const im = await loadImg(dataUrl);
    const ann = {
      t: 'image',
      x: p.x != null ? +p.x : 54,
      y: p.y != null ? +p.y : 90,
      w: wPt,
      h: hPt,
      img: im,
      dataUrl,
      tableSpec: spec
    };
    addAnn(ann);
    if (p.openInline !== false && typeof document !== 'undefined' && $('#ewrap') && !$('#ewrap').hidden) {
      setTimeout(() => openInlineTableEditor(ann, spec.rows > 1 ? 1 : 0, 0), 25);
    }
    st(`Inserted ${spec.rows}×${spec.cols} editable table onto PDF page — click any cell to type or press Tab between cells.`);
    return ann;
  },
  async reverse() { await edit(async d => { const nd = await PDFDocument.create(), order = d.getPageIndices().reverse(); (await nd.copyPages(d, order)).forEach(p => nd.addPage(p)); const t = d.getTitle(), a = d.getAuthor(); if (t) nd.setTitle(t); if (a) nd.setAuthor(a); return nd; }, 'Page order reversed'); },
  async insertpdf(files) { const f = files[0]; if (!f) return; const i = E.cur, src = await PDFDocument.load(new Uint8Array(await f.arrayBuffer()), LOAD); await edit(async d => { (await d.copyPages(src, src.getPageIndices())).forEach((p, k) => d.insertPage(i + 1 + k, p)); }, 'Inserted ' + src.getPageCount() + ' page(s) after page ' + (i + 1)); },
  async crop(p) {
    const t = pickSet(p.which), k = 72 / 25.4;
    await edit(d => { t.forEach(i => { const pg = d.getPage(i), g = v2u(pg), mb = pg.getMediaBox();
      if (p.reset) { pg.setCropBox(mb.x, mb.y, mb.width, mb.height); return; }
      const l = p.left * k, tp = p.top * k, r = p.right * k, b = p.bottom * k; if (l + r >= g.vw - 10 || tp + b >= g.vh - 10) throw new Error('The margins are larger than the page.');
      const c1 = g.f(l, tp), c2 = g.f(g.vw - r, g.vh - b); pg.setCropBox(Math.min(c1[0], c2[0]), Math.min(c1[1], c2[1]), Math.abs(c2[0] - c1[0]), Math.abs(c2[1] - c1[1])); }); }, p.reset ? 'Crop removed' : 'Pages cropped');
  },
  async hf(p) {
    const t = pickSet(p.which);
    await edit(async d => {
      const fontEnum = STD_FONT_REG_MAP[p.fam] || StandardFonts.Helvetica;
      const font = await d.embedFont(fontEnum), N = d.getPageCount(), date = new Date().toLocaleDateString(), M = p.margin * 72 / 25.4;
      for (const i of t) {
        const pg = d.getPage(i), g = v2u(pg), tok = s => safeText(font, s.replace(/\{n\}/g, i + 1).replace(/\{N\}/g, N).replace(/\{date\}/g, date).replace(/\{file\}/g, E.name));
        [['top', p.hl, p.hc, p.hr], ['bottom', p.fl, p.fc, p.fr]].forEach(([pos, l, c, r]) => [[l, 0], [c, 1], [r, 2]].forEach(([txt, al]) => {
          if (!txt) return; const s = tok(txt), w = font.widthOfTextAtSize(s, p.size), vx = al === 0 ? M : al === 2 ? g.vw - M - w : (g.vw - w) / 2, vy = pos === 'top' ? M + p.size * .8 : g.vh - M, [X, Y] = g.f(vx, vy);
          pg.drawText(s, { x: X, y: Y, size: p.size, font, color: rgb(.1, .1, .1), rotate: degrees(g.R) });
        }));
      }
    }, 'Header and footer added');
  },
  async flatten(p) { const t = pickSet(p.which); await commit(); await edit(async d => { for (const i of t) { const pj = await E.doc.getPage(i + 1), vp = pj.getViewport({ scale: 1 }); await rasterize(d, i, pj, vp, [], p.dpi / 72); if (i !== E.cur && typeof pj.cleanup === 'function') { try { pj.cleanup(); } catch (e) {} } } }, 'Flattened ' + t.length + ' page(s) to images'); },
  async print(p) {
    await commit(); const t = pickSet(p.which), box = $('#printarea'); box.innerHTML = ''; window.busy(true);
    try { for (const i of t) { st('Preparing page ' + (i + 1) + ' for printing...'); const pg = await E.doc.getPage(i + 1), v = pg.getViewport({ scale: p.dpi / 72 }), c = document.createElement('canvas'); c.width = v.width; c.height = v.height; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: x, viewport: v }).promise; if (i !== E.cur && typeof pg.cleanup === 'function') { try { pg.cleanup(); } catch (e) {} } const im = new Image(); im.src = c.toDataURL('image/jpeg', .92); c.width = 0; c.height = 0; try { await im.decode(); } catch (e) {} box.append(im); } }
    catch (e) { st('Print failed: ' + (e.message || e)); return; } finally { window.busy(false); } st('Opening the print dialog...'); window.print(); setTimeout(() => { box.innerHTML = ''; st('Ready'); }, 1500);
  }
});
const sel = f => { if (!E.n) return; E.pages = new Set(f([...Array(E.n).keys()])); markThumbs(); };
const toFile = f => new File([b2u(f.bytes)], f.name, { type: /\.pdf$/i.test(f.name) ? 'application/pdf' : /\.png$/i.test(f.name) ? 'image/png' : 'image/jpeg' });
const pickPdfs = async (title, multi) => (await window.native.openFiles({ title, multi })).map(toFile);
Object.assign(ui, {
  rot180: () => ops.rot(180), flipH: () => ops.flipH(), flipV: () => ops.flipV(), reverse: ops.reverse,
  selAll: () => sel(a => a), selNone: () => sel(() => []), selOdd: () => sel(a => a.filter(i => i % 2 === 0)), selEven: () => sel(a => a.filter(i => i % 2 === 1)), selInv: () => sel(a => a.filter(i => !E.pages.has(i))),
  async merge() { const f = await pickPdfs('Merge PDFs (choose the files to add)', true); if (f.length) await ops.merge(f); },
  async images() { const f = (await window.native.openFiles({ title: 'Choose images', multi: true, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] }] })).map(toFile); if (!f.length) return; const p = await dialog('Images to PDF', [{ type: 'select', id: 'mode', label: 'Page size', options: [{ label: 'A4, image fitted', value: 'a4' }, { label: 'Same size as image', value: 'img' }] }], 'Create'); if (p) await ops.images(f, p.mode); },
  
  async margins() {
    if (!E.bytes) return;
    const p = await dialog('MS Word Page Margins', [
      { type: 'select', id: 'preset', label: 'Margin Preset', value: 'normal', options: [
        { label: 'Normal (25.4 mm / 1.0 in)', value: 'normal' },
        { label: 'Narrow (12.7 mm / 0.5 in)', value: 'narrow' },
        { label: 'Moderate (19.05 mm / 0.75 in)', value: 'moderate' },
        { label: 'Wide (38.1 mm / 1.5 in)', value: 'wide' },
        { label: 'Custom Margin (mm)', value: 'custom' }
      ] },
      { type: 'number', id: 'customMM', label: 'Custom Margin (mm)', value: 20, min: 5, max: 80 },
      { type: 'select', id: 'mode', label: 'Content Adjustment', value: 'scale', options: [
        { label: 'Scale & center page content inside margins', value: 'scale' },
        { label: 'Keep existing content scale (guides only)', value: 'guides' }
      ] },
      { type: 'checkbox', id: 'drawGuides', label: 'Draw subtle print margin boundary frame on page', value: true },
      D.which
    ], 'Apply Margins');
    if (p) await ops.margins(p);
  },
  async pagecolor() {
    if (!E.bytes) return;
    const p = await dialog('MS Word Page Background Colour', [
      { type: 'select', id: 'preset', label: 'Paper Tint Preset', value: 'cream', options: [
        { label: 'Warm Cream / Reader Paper (#fdfbf7)', value: 'cream' },
        { label: 'Soft Sky Blue (#f0f9ff)', value: 'sky' },
        { label: 'Soft Engineering Mint (#f0fdf4)', value: 'mint' },
        { label: 'Light Slate Gray (#f1f5f9)', value: 'slate' },
        { label: 'Custom Colour Picker below', value: 'custom' }
      ] },
      { type: 'color', id: 'color', label: 'Custom Page Colour', value: '#fdfbf7' },
      { type: 'number', id: 'opacity', label: 'Tint Strength / Opacity (%)', value: 35, min: 10, max: 100 },
      D.which
    ], 'Apply Page Colour');
    if (p) await ops.pagecolor(p);
  },
  async pageborder() {
    if (!E.bytes) return;
    const p = await dialog('MS Word Page Borders & Engineering Frame', [
      { type: 'select', id: 'style', label: 'Border Style', value: 'single', options: [
        { label: 'Single Line Border', value: 'single' },
        { label: 'Double Line Formal Border', value: 'double' },
        { label: 'Engineering Drawing Frame + Title Box', value: 'engineering' },
        { label: 'Dashed Cut / Margin Border', value: 'dashed' }
      ] },
      { type: 'number', id: 'marginMM', label: 'Distance from Page Edge (mm)', value: 12, min: 3, max: 50 },
      { type: 'number', id: 'widthPt', label: 'Line Thickness (pt)', value: 1.5, min: 0.5, max: 10 },
      { type: 'color', id: 'color', label: 'Border Colour', value: '#185abd' },
      D.which
    ], 'Add Page Border');
    if (p) await ops.pageborder(p);
  },
  
  async titleblock() {
    const p = await dialog('ISO 7200 / ASME Y14.1 Engineering Title Block', [
      { id: 'company', label: 'Company / Organization', value: 'KENSHO STUDIO · PRECISION ENGINEERING' },
      { id: 'title', label: 'Drawing Title', value: E.name ? E.name.replace(/\.pdf$/i, '').toUpperCase() : 'POWER REGULATION & CONTROL SCHEMATIC' },
      { id: 'dwgNo', label: 'Drawing Number', value: 'DWG-ENG-2026-104' },
      { id: 'rev', label: 'Revision Code', value: 'B' },
      { id: 'scale', label: 'Scale & Units', value: '1:1 (MM)' },
      { id: 'tol', label: 'General Tolerance Standard', value: 'ISO 2768-m (±0.10 mm)' },
      { id: 'author', label: 'Drawn / Verified By', value: getAuthor() || 'Lead Systems Engineer' },
      { type: 'color', id: 'color', label: 'Border Colour', value: '#0f172a' },
      D.which
    ], 'Stamp Title Block');
    if (p) await ops.titleblock(p);
  },
  async coverpage() {
    const p = await dialog('Insert MS Word Cover Page', [
      { id: 'title', label: 'Document Title', value: 'ENGINEERING DESIGN SPECIFICATION' },
      { id: 'subtitle', label: 'Subtitle / Project Name', value: 'Revision 1.0 · Technical Verification & Release Package' },
      { id: 'author', label: 'Author / Prepared By', value: getAuthor() || 'Lead Systems Engineer' },
      { id: 'org', label: 'Organization / Division', value: 'Kensho Studio · Precision Engineering' },
      { id: 'date', label: 'Release Date', value: new Date().toLocaleDateString() },
      { type: 'color', id: 'color', label: 'Cover Theme Colour', value: '#185abd' }
    ], 'Insert Cover Page');
    if (p) await ops.coverpage(p);
  },
  async table() {
    if (E.sel && E.sel.t === 'image' && E.sel.tableSpec) {
      openTableStudio(E.sel);
      return;
    }
    openTableStudio(null);
  },
  async insertpdf() { const f = await pickPdfs('Insert PDF after the current page', false); if (f.length) await ops.insertpdf(f); },
  async crop() { const p = await dialog('Crop pages', [{ type: 'number', id: 'top', label: 'Top margin (mm)', value: 10, min: 0 }, { type: 'number', id: 'right', label: 'Right margin (mm)', value: 10, min: 0 }, { type: 'number', id: 'bottom', label: 'Bottom margin (mm)', value: 10, min: 0 }, { type: 'number', id: 'left', label: 'Left margin (mm)', value: 10, min: 0 }, D.which, { type: 'checkbox', id: 'reset', label: 'Remove crop instead (show the full page again)', value: false }], 'Apply'); if (p) await ops.crop(p); },
  async hf() { const p = await dialog('Header and footer', [{ id: 'hl', label: 'Header left' }, { id: 'hc', label: 'Header centre' }, { id: 'hr', label: 'Header right' }, { id: 'fl', label: 'Footer left', value: '{file}' }, { id: 'fc', label: 'Footer centre', value: 'Page {n} of {N}' }, { id: 'fr', label: 'Footer right', value: '{date}' }, D.stdFam, { type: 'number', id: 'size', label: 'Size (pt)', value: 10, min: 6, max: 40 }, { type: 'number', id: 'margin', label: 'Margin (mm)', value: 10, min: 2, max: 60 }, D.which, { type: 'note', label: 'You can use {n} page number, {N} page count, {date} and {file}.' }], 'Apply'); if (p) await ops.hf(p); },
  async flatten() { const p = await dialog('Flatten pages to images', [D.which, { type: 'select', id: 'dpi', label: 'Quality', value: '300', options: ['150', '200', '300', '400', '600'] }, { type: 'note', label: 'Each page becomes a picture. Comments and form fields are fixed into it and text can no longer be selected. Undo is available.' }], 'Flatten'); if (p) { p.dpi = +p.dpi; await ops.flatten(p); } },
  async print() { const p = await dialog('Print', [D.which, { type: 'select', id: 'dpi', label: 'Quality', value: '300', options: ['150', '200', '300', '400'] }], 'Print'); if (p) { p.dpi = +p.dpi; await ops.print(p); } }
});
const FREE = new Set(['merge', 'images', 'blank', 'coverpage', 'table', 'titleblock']);
ACT.op = async id => { if (!E.bytes && !FREE.has(id)) return st('Open a PDF first.'); try { await ui[id](); } catch (e) { st('Error: ' + (e.message || e)); } };
document.querySelectorAll('#etools [data-op], .rp-edit-ribbon [data-op]').forEach(b => b.onclick = () => ACT.op(b.dataset.op));
if ($('#eNewBlankBtn')) $('#eNewBlankBtn').onclick = () => ACT.op('blank');
if ($('#eInsertTableBtn')) $('#eInsertTableBtn').onclick = () => ACT.op('table');
if ($('#eTitleBlockBtn')) $('#eTitleBlockBtn').onclick = () => ACT.op('titleblock');

// Wire Launchpad Quick Action Cards
if ($('#rp-launch-blank')) $('#rp-launch-blank').onclick = () => ACT.op('blank');
if ($('#rp-launch-merge')) $('#rp-launch-merge').onclick = () => ACT.op('merge');
if ($('#rp-launch-images')) $('#rp-launch-images').onclick = () => ACT.op('images');
if ($('#rp-launch-compare')) $('#rp-launch-compare').onclick = () => window.setView && window.setView('compare');

// ---------- open, save ----------
async function pickEditor() {
  const picked = await window.native.openFiles({
    title: 'Open One or Multiple PDFs, DXFs, or Images in Studio',
    multi: true,
    filters: [
      { name: 'PDF, AutoCAD DXF & Images', extensions: ['pdf', 'dxf', 'png', 'jpg', 'jpeg', 'webp', 'bmp'] },
      { name: 'PDF Documents', extensions: ['pdf'] },
      { name: 'AutoCAD DXF Drawings', extensions: ['dxf'] },
      { name: 'Images (Auto-Convert to PDF)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }
    ]
  });
  if (!picked || !picked.length) return;
  for (let pi = 0; pi < picked.length; pi++) {
    const f = picked[pi];
    if (!f) continue;
    await openPickedEditorEntry(f);
  }
  if (picked.length > 1) st(`Opened ${picked.length} files in PDF Studio tabs.`);
}
async function openPickedEditorEntry(f) {
  if (!f) return;
  if (/\.dxf$/i.test(f.name) && typeof DXFEngine !== 'undefined' && document.body && document.body.dataset.view === 'edit') {
    try {
      const rawBytes = b2u(f.bytes);
      const dxfText = DXFEngine.decodeDXFBytes ? DXFEngine.decodeDXFBytes(rawBytes) : new TextDecoder().decode(rawBytes);
      const parser = new DXFEngine.DXFParser(dxfText).parse();
      const vecBytes = await parser.toVectorPDFBytes({ background: '#ffffff', lineWidth: 1.0, showGrid: false, canvasW: 2200, canvasH: 1600, padding: 48 });
      await openBytes(vecBytes, f.name.replace(/\.dxf$/i, '.pdf'), null);
    } catch (e) {
      st('Could not open DXF (' + f.name + '): ' + (e.message || e));
      if (window.showToast) window.showToast('Could not open DXF (' + f.name + '): ' + (e.message || e), 4000);
    }
    return;
  }
  if ((/\.dxf$/i.test(f.name) || (window.isCAMExt && window.isCAMExt(f.name))) && window.openExternalCADOrCAM) {
    window.setView('compare');
    await window.openExternalCADOrCAM(b2u(f.bytes), f.name, f.path);
    return;
  }
  await openBytes(b2u(f.bytes), f.name, f.path);
}
async function doSave(asNew) {
  if (!E.bytes) return st('Open a PDF first.');
  try {
    await commit();
    if (!asNew && E.path) {
      if (window.PREF.confirmSave && !E.confirmed) { const r = await dialog('Save over the original?', [{ type: 'note', label: E.path + '\n\nThe file will be replaced with the edited version. Use Save as to keep the original.' }], 'Save'); if (!r) return; E.confirmed = true; }
      await window.native.writeFile({ path: E.path, bytes: E.bytes }); E.savedBytes = E.bytes; st('Saved ' + E.path); if (window.updateTitle) window.updateTitle(); return;
    }
    const p = await save(baseName() + '_edited.pdf', E.bytes, 'application/pdf', PDFF);
    if (p) { E.path = p; E.name = String(p).split(/[\\/]/).pop(); E.savedBytes = E.bytes; E.confirmed = true; window.addRecent(E.name, p); if (window.updateTitle) window.updateTitle(); }
  } catch (e) { st('Could not save: ' + (e.message || e)); }
}
$('#eOpen').onclick = pickEditor; $('#eSave').onclick = () => doSave(false); $('#eSaveAs').onclick = () => doSave(true);
$('#eUndo').onclick = undo; $('#eRedo').onclick = redo;
window.isDirty = () => !!E.bytes && (E.bytes !== E.savedBytes || Object.values(E.ann).some(l => l && l.length) || Object.values(E.meas).some(l => l && l.length));

// ---------- find in document ----------
function closeFind() { $('#fbar').hidden = true; F.hits = []; F.q = ''; F.i = -1; F.run++; if (E.doc) overlay(); }
function openFind() { if (!E.doc) return st('Open a PDF first.'); $('#fbar').hidden = false; $('#fq').focus(); $('#fq').select(); }
async function runFind(q) {
  const run = ++F.run; F.q = q; F.hits = []; F.i = -1; $('#fc').textContent = ''; overlay(); if (!q || !E.doc) return;
  const ql = q.toLowerCase(), doc = E.doc; window.busy(true);
  try {
    for (let p = 0; p < E.n; p++) {
      if (run !== F.run) return; const pg = await doc.getPage(p + 1), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
      let pageHitsBefore = F.hits.length;
      for (const it of tc.items) {
        const low = it.str.toLowerCase(); let idx = low.indexOf(ql); if (idx < 0) continue; const t = pdfjsLib.Util.transform(vp.transform, it.transform), h = Math.hypot(t[2], t[3]), w = it.width * vp.scale;
        while (idx >= 0) { const x0 = t[4] + w * idx / Math.max(1, it.str.length), x1 = t[4] + w * (idx + ql.length) / Math.max(1, it.str.length); F.hits.push({ p, x: x0, y: t[5] - h * .8, w: Math.max(2, x1 - x0), h }); idx = low.indexOf(ql, idx + 1); }
      }
      if (F.hits.length === pageHitsBefore && ql.includes(" ")) {
        const joined = tc.items.map(x => x.str).join(" ").toLowerCase();
        if (joined.includes(ql)) {
          const words = ql.split(/\s+/).filter(Boolean);
          for (const it of tc.items) {
            const low = it.str.toLowerCase();
            if (words.some(w => w.length >= 2 && low.includes(w))) {
              const t = pdfjsLib.Util.transform(vp.transform, it.transform), h = Math.hypot(t[2], t[3]), w = it.width * vp.scale;
              F.hits.push({ p, x: t[4], y: t[5] - h * .8, w: Math.max(4, w), h });
            }
          }
        }
      }
      if (p !== E.cur && typeof pg.cleanup === 'function') { try { pg.cleanup(); } catch (e) {} }
      if (F.hits.length && F.i < 0) { F.i = F.hits.findIndex(h => h.p >= E.cur); if (F.i < 0) F.i = 0; showHit(); }
      if (p % 4 === 3) await new Promise(r => setTimeout(r, 0));
    }
    if (run === F.run) $('#fc').textContent = F.hits.length ? (F.i + 1) + ' of ' + F.hits.length : 'No matches';
  } catch (e) {} finally { window.busy(false); }
}
function showHit() { const h = F.hits[F.i]; if (!h) return; $('#fc').textContent = (F.i + 1) + ' of ' + F.hits.length; if (h.p !== E.cur) { E.cur = h.p; E.pages = new Set([h.p]); renderPage().then(scrollHit); } else { overlay(); scrollHit(); } }
function scrollHit() { const h = F.hits[F.i]; if (!h) return; const v = $('#eview'), w = $('#ewrap'); v.scrollTop = w.offsetTop + h.y * K() - v.clientHeight / 2; v.scrollLeft = w.offsetLeft + h.x * K() - v.clientWidth / 2; }
function stepFind(d) { if (!F.hits.length) return; F.i = (F.i + d + F.hits.length) % F.hits.length; showHit(); }
let fdeb; $('#fq').oninput = e => { clearTimeout(fdeb); fdeb = setTimeout(() => runFind(e.target.value), 250); };
$('#fq').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (F.q !== e.target.value) runFind(e.target.value); else stepFind(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') closeFind(); };
$('#fNext').onclick = () => stepFind(1); $('#fPrev').onclick = () => stepFind(-1); $('#fClose').onclick = closeFind; $('#eFind').onclick = openFind;

Object.assign(ACT, {
  tool: t => setTool(t), ePage: d => goto(E.cur + d), eFirst: () => goto(0), eLast: () => goto(E.n - 1), findStep: d => { if (!$('#fbar').hidden || F.hits.length) stepFind(d); else openFind(); },
  eDeleteAnn: () => {
    if (E.inlineTable) cancelInlineTableEditor();
    if (!E.sel && E.selC) {
      const cm = (E.comments || []).find(c => c.key === E.selC);
      if (cm) { E.selC = null; RPNotePreview.hide(true); delC(cm); return true; }
    }
    if (!E.sel) return false;
    if (E.sel.locked) { st('Selected markup is locked. Unlock it first to delete.'); return false; }
    pushAnnState('Delete annotation');
    const l = E.ann[E.cur] || [], lm = E.meas[E.cur] || [], gs = E.sel, same = a => a === gs || (gs.g && a.g === gs.g);
    E.ann[E.cur] = l.filter(a => !same(a));
    E.meas[E.cur] = lm.filter(a => !same(a));
    E.sel = null; overlay(); updateDocInspector();
    return true;
  },
  eEscape: () => {
    if (E.inlineTable) { cancelInlineTableEditor(); return; }
    if ((E.tool === 'poly' || E.tool === 'area') && E.polyPts.length) { E.polyPts = []; E.tmp = null; overlay(); return; }
    if (!$('#fbar').hidden) closeFind();
    else { try { getSelection().removeAllRanges(); } catch (e) {} hideSelBar(); E.sel = null; if (E.tool !== 'select') setTool('select'); else overlay(); }
  },
  eGotoDialog: async () => { if (!E.n) return; const r = await dialog('Go to page', [{ type: 'number', id: 'n', label: 'Page (1-' + E.n + ')', value: E.cur + 1, min: 1, max: E.n }], 'Go'); if (r) goto(r.n - 1); },
  hasAnnSel: () => !!E.sel, reveal: () => E.path && window.native.reveal(E.path), hasPath: () => !!E.path,
  eOpen: pickEditor, eSave: () => doSave(false), eSaveAs: () => doSave(true), eUndo: undo, eRedo: redo, find: openFind, measure: () => setTool('measure'),
  night: () => { document.body.classList.toggle('night'); if ($('#eNightBtn')) $('#eNightBtn').classList.toggle('on', document.body.classList.contains('night')); },
  eFit: () => fit(), eFitWidth: () => fit('width'), eActual: () => { E.fitMode = null; E.zoom = .75; renderPage(); }, editText: () => setTool('edittext'),
  eZoomIn: () => $('#eZi').click(), eZoomOut: () => $('#eZo').click(),
  toggleThumbs: () => {
    const th = $('#thumbs');
    if (!th) return;
    th.classList.toggle('rp-collapsed');
    th.hidden = th.classList.contains('rp-collapsed');
    if ($('#eThumbBtn')) $('#eThumbBtn').classList.toggle('on', !th.hidden);
    refit();
  },
  togglePanel: () => {
    const et = $('#etools');
    if (!et) return;
    const isNowCollapsed = et.classList.toggle('rp-collapsed');
    et.hidden = isNowCollapsed;
    if (!isNowCollapsed) setTab('c');
    if ($('#ePanelBtn')) $('#ePanelBtn').classList.toggle('on', !isNowCollapsed);
    window.dispatchEvent(new Event('resize'));
    refit();
  },
  clearMeasure: () => { pushAnnState('Clear measurements'); E.meas = {}; overlay(); updateDocInspector(); },
  nightOn: () => document.body.classList.contains('night')
});
addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#dlg').hidden) { $('#dC').click(); return; }
  if (e.key === 'Enter' && document.body.dataset.view === 'edit' && (E.tool === 'poly' || E.tool === 'area') && E.polyPts.length >= 2) {
    e.preventDefault();
    finishPolygonTool();
  }
});

// ---------- comments (real PDF annotations) ----------
const CT = { Text: 'Note', Highlight: 'Highlight', Underline: 'Underline', StrikeOut: 'Strikeout', Squiggly: 'Squiggly', FreeText: 'Text box', Square: 'Box', Circle: 'Circle', Line: 'Line', Ink: 'Drawing', Stamp: 'Stamp', Caret: 'Caret', Polygon: 'Polygon', PolyLine: 'Polyline' };
const getAuthor = () => {
  try {
    const saved = localStorage.getItem('author');
    if (saved && saved.trim()) return saved.trim();
  } catch (e) {}
  if ($('#cAuthor') && $('#cAuthor').value && $('#cAuthor').value.trim()) return $('#cAuthor').value.trim();
  return 'Reviewer';
};
const pdfDate = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`; };
const showDate = s => { const m = /D:(\d{4})(\d\d)(\d\d)(\d\d)?(\d\d)?/.exec(s || ''); return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4] || '00'}:${m[5] || '00'}` : ''; };
const dtext = o => (o && o.decodeText) ? o.decodeText() : '';
const akey = (r, pi, i) => r instanceof PDFRef ? r.tag : 'p' + pi + 'i' + i;
function readComments(doc) {
  const out = [];
  doc.getPages().forEach((pg, pi) => {
    const an = pg.node.Annots(); if (!an) return;
    for (let i = 0; i < an.size(); i++) {
      const d = an.lookup(i); if (!(d instanceof PDFDict)) continue;
      const st = d.get(PDFName.of('Subtype')), sub = st && st.asString ? st.asString().slice(1) : ''; if (!CT[sub]) continue;
      const ra = d.lookup(PDFName.of('Rect')), rect = ra && ra.asArray ? ra.asArray().map(n => n.asNumber ? n.asNumber() : 0) : [], irt = d.get(PDFName.of('IRT')), key = akey(an.get(i), pi, i);
      const ca = d.lookup(PDFName.of('C')), colArr = ca && ca.asArray ? ca.asArray().map(n => n.asNumber ? n.asNumber() : 0) : null;
      const hexCol = colArr && colArr.length >= 3 ? '#' + colArr.slice(0, 3).map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('') : '#ffc400';
      out.push({ key, page: pi, sub, type: CT[sub], author: dtext(d.lookup(PDFName.of('T'))), date: showDate(dtext(d.lookup(PDFName.of('M')))), contents: dtext(d.lookup(PDFName.of('Contents'))), state: dtext(d.lookup(PDFName.of('State'))), rect, color: hexCol, irt: irt instanceof PDFRef ? irt.tag : null });
    }
  });
  return out;
}
async function mutate(fn, msg) {
  if (!E.bytes) return;
  try {
    const doc = await PDFDocument.load(E.bytes, LOAD);
    await fn(doc);
    const nb = await doc.save();
    push();
    E.bytes = nb;
    await reload(true);
    if (msg) st(msg);
  } catch (e) { st('Error: ' + (e.message || e)); }
}
async function ensureAuthor() {
  const au = getAuthor();
  if (au) {
    if ($('#cAuthor') && !$('#cAuthor').value) $('#cAuthor').value = au;
    return true;
  }
  const r = await dialog('Your name', [{ id: 'n', label: 'Name for comments', value: 'Reviewer' }, { type: 'note', label: 'It is saved in each comment you add. You can change it in the Comments tab.' }], 'Save');
  if (!r || !r.n.trim()) return false; try { localStorage.setItem('author', r.n.trim()); } catch (e) {} $('#cAuthor').value = r.n.trim(); return true;
}
const newId = () => 'rl-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const rgbArr = h => { const c = hexRgb(h); return [c.red, c.green, c.blue]; };
function baseAnnot(ctx, sub, rect, text, color, apRef) {
  const o = { Type: 'Annot', Subtype: sub, Rect: rect, F: 4, C: rgbArr(color), NM: PDFString.of(newId()), T: PDFHexString.fromText(getAuthor()), M: PDFString.of(pdfDate()), CreationDate: PDFString.of(pdfDate()), Contents: PDFHexString.fromText(text || '') };
  if (apRef) o.AP = { N: apRef }; return o;
}
async function addNote(pi, x, y, text) {
  const vp = (await E.doc.getPage(pi + 1)).getViewport({ scale: 1 }), [X, Y] = vp.convertToPdfPoint(x, y);
  const rawCol = $('#eColor') ? $('#eColor').value : '#ffc400';
  const color = (E.tool === 'cnote' && rawCol && rawCol.toLowerCase() !== '#e11d48') ? rawCol : '#ffc400';
  await mutate(doc => {
    const ctx = doc.context, c = rgbArr(color), ap = ctx.register(ctx.stream(`${c[0]} ${c[1]} ${c[2]} rg 0 0 18 18 re f 0.35 0.2 0.05 RG 0.9 w 0.5 0.5 17 17 re S 4 5 m 14 5 l S 4 9 m 14 9 l S 4 13 m 11 13 l S`, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 18, 18], Resources: {} }));
    const ref = ctx.register(ctx.obj({ ...baseAnnot(ctx, 'Text', [X, Y - 18, X + 18, Y], text, color, ap), Name: 'Comment' })); doc.getPage(pi).node.addAnnot(ref);
  }, 'Note added — move cursor near note icon to view content');
  setTab('c');
}
async function addMarkup(pi, sub, r, text, color, boxesIn) {
  const pj = await E.doc.getPage(pi + 1), vp = pj.getViewport({ scale: 1 }), P = (x, y) => vp.convertToPdfPoint(x, y); let boxes = boxesIn ? boxesIn.map(q => [q.x0, q.y0, q.x1, q.y1]) : [];
  if (!boxesIn && vp.rotation === 0) {
    const tc = await pj.getTextContent();
    for (const it of tc.items) {
      if (!it.str.trim()) continue; const t = pdfjsLib.Util.transform(vp.transform, it.transform); if (Math.abs(t[1]) > .01 || Math.abs(t[2]) > .01) continue;
      const h = Math.hypot(t[2], t[3]), x0 = t[4], x1 = t[4] + it.width * vp.scale, y0 = t[5] - h * .8, y1 = t[5] + h * .2;
      const ox = Math.min(x1, r.x + r.w) - Math.max(x0, r.x), oy = Math.min(y1, r.y + r.h) - Math.max(y0, r.y);
      if (ox > 1 && oy > (y1 - y0) * .4) boxes.push([Math.max(x0, r.x), y0, Math.min(x1, r.x + r.w), y1]);
    }
  }
  if (!boxes.length && r) boxes = [[r.x, r.y, r.x + r.w, r.y + r.h]]; if (!boxes.length) return;
  const quads = boxes.map(([x0, y0, x1, y1]) => [P(x0, y0), P(x1, y0), P(x0, y1), P(x1, y1)]), all = quads.flat();
  const rect = [Math.min(...all.map(p => p[0])), Math.min(...all.map(p => p[1])), Math.max(...all.map(p => p[0])), Math.max(...all.map(p => p[1]))], c = rgbArr(color);
  let body = ''; const f = n => +n.toFixed(2);
  quads.forEach(([tl, tr, bl, br]) => {
    if (sub === 'Highlight') body += `${f(tl[0])} ${f(tl[1])} m ${f(tr[0])} ${f(tr[1])} l ${f(br[0])} ${f(br[1])} l ${f(bl[0])} ${f(bl[1])} l h f\n`;
    else if (sub === 'Underline') body += `${f(bl[0])} ${f(bl[1] + 1)} m ${f(br[0])} ${f(br[1] + 1)} l S\n`;
    else body += `${f((tl[0] + bl[0]) / 2)} ${f((tl[1] + bl[1]) / 2)} m ${f((tr[0] + br[0]) / 2)} ${f((tr[1] + br[1]) / 2)} l S\n`;
  });
  const content = (sub === 'Highlight' ? `/GS gs ${c[0]} ${c[1]} ${c[2]} rg\n` : `${c[0]} ${c[1]} ${c[2]} RG 1.2 w\n`) + body;
  await mutate(doc => {
    const ctx = doc.context, ap = ctx.register(ctx.stream(content, { Type: 'XObject', Subtype: 'Form', BBox: rect, Resources: { ExtGState: { GS: { Type: 'ExtGState', BM: 'Multiply' } } } }));
    const ref = ctx.register(ctx.obj({ ...baseAnnot(ctx, sub, rect, text, color, ap), QuadPoints: quads.flatMap(q => q.flat()) })); doc.getPage(pi).node.addAnnot(ref);
  }, sub === 'Highlight' ? 'Highlight added' : sub === 'Underline' ? 'Underline added' : 'Strikeout added');
  setTab('c');
}
async function finishMarkup(a) {
  if (!await ensureAuthor()) return;
  const r = await dialog('Comment (optional)', [{ type: 'textarea', id: 'v', label: '', rows: 3 }], 'Add'); if (!r) return;
  await addMarkup(E.cur, { chl: 'Highlight', cul: 'Underline', cst: 'StrikeOut' }[a.kind], a, r.v || '', a.color);
}
function findAnnot(doc, key) {
  const pages = doc.getPages();
  for (let pi = 0; pi < pages.length; pi++) { const an = pages[pi].node.Annots(); if (!an) continue; for (let i = 0; i < an.size(); i++) { const r = an.get(i); if (akey(r, pi, i) === key) return { an, i, d: an.lookup(i, PDFDict), ref: r, pi }; } }
  return null;
}
async function replyTo(c, text) {
  if (!await ensureAuthor()) return;
  if (text == null) { const r = await dialog('Reply', [{ type: 'textarea', id: 'v', label: '', rows: 3 }], 'Reply'); if (!r || !r.v) return; text = r.v; }
  await mutate(doc => {
    const f = findAnnot(doc, c.key); if (!f || !(f.ref instanceof PDFRef)) throw new Error('This comment cannot take replies.'); const ctx = doc.context, rc = c.rect.length === 4 ? c.rect : [20, 20, 38, 38];
    const ref = ctx.register(ctx.obj({ ...baseAnnot(ctx, 'Text', [rc[0], rc[1], rc[0] + 18, rc[1] + 18], text, '#ffc400'), IRT: f.ref, RT: 'R' })); doc.getPage(f.pi).node.addAnnot(ref);
  }, 'Reply added');
}
async function editC(c) {
  const r = await dialog('Edit comment', [{ type: 'textarea', id: 'v', label: '', rows: 4, value: c.contents }], 'Save'); if (!r) return;
  await mutate(doc => { const f = findAnnot(doc, c.key); if (!f) return; f.d.set(PDFName.of('Contents'), PDFHexString.fromText(r.v)); f.d.set(PDFName.of('M'), PDFString.of(pdfDate())); }, 'Comment updated');
}
async function toggleRes(c) {
  await mutate(doc => { const f = findAnnot(doc, c.key); if (!f) return; if (c.state === 'Completed') { f.d.delete(PDFName.of('State')); f.d.delete(PDFName.of('StateModel')); } else { f.d.set(PDFName.of('State'), PDFString.of('Completed')); f.d.set(PDFName.of('StateModel'), PDFString.of('Review')); } }, c.state === 'Completed' ? 'Reopened' : 'Marked resolved');
}
async function delC(c) {
  const keys = [c.key, ...E.comments.filter(x => x.irt === c.key).map(x => x.key)];
  await mutate(doc => { doc.getPages().forEach((pg, pi) => { const an = pg.node.Annots(); if (!an) return; for (let i = an.size() - 1; i >= 0; i--) if (keys.includes(akey(an.get(i), pi, i))) an.remove(i); }); }, 'Comment deleted');
}
async function clearComments(skipAsk) {
  if (!skipAsk) { const r = await dialog('Remove all comments', [{ type: 'note', label: 'This removes every note, highlight, underline, strikeout and reply from the PDF. You can undo it right after.' }], 'Remove all'); if (!r) return; }
  await mutate(doc => { doc.getPages().forEach((pg, pi) => { const an = pg.node.Annots(); if (!an) return; for (let i = an.size() - 1; i >= 0; i--) { const d = an.lookup(i); const st = d instanceof PDFDict && d.get(PDFName.of('Subtype')); if (st && st.asString && CT[st.asString().slice(1)]) an.remove(i); } }); }, 'All comments removed');
}
function card(c, reply) {
  const d = document.createElement('div'); d.className = 'cm' + (reply ? ' rp' : '') + (c.state === 'Completed' ? ' done' : '') + (c.key === E.selC ? ' sel' : '');
  const esc = t => String(t).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
  d.innerHTML = `<div class="ch"><b>${reply ? 'Reply' : esc(c.type)}</b> <span>p.${c.page + 1}</span> <span class="au">${esc(c.author || 'Unknown')}</span> <span>${esc(c.date)}</span>${c.state === 'Completed' ? ' <span class="ok">Resolved</span>' : ''}</div><div class="cb">${esc(c.contents) || '<i>(no text)</i>'}</div><div class="ca"></div>`;
  const acts = d.querySelector('.ca'), add = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.onclick = e => { e.stopPropagation(); f(); }; acts.append(b); };
  if (!reply) add('Reply', () => replyTo(c)); add('Edit', () => editC(c)); if (!reply) add(c.state === 'Completed' ? 'Reopen' : 'Resolve', () => toggleRes(c)); add('Delete', () => delC(c));
  d.onclick = () => { E.selC = c.key; if (c.page !== E.cur) goto(c.page); else overlay(); renderComments(); };
  return d;
}
function renderComments() {
  const box = $('#clist'); if (!box) return; box.innerHTML = ''; const hide = $('#cHide').checked, only = $('#cPage').checked, top = E.comments.filter(c => !c.irt);
  const cTabSpan = $('#cTab span'); if (cTabSpan) cTabSpan.textContent = 'Comments (' + top.length + ')'; else $('#cTab').textContent = 'Comments (' + top.length + ')';
  const pBtnSpan = $('#ePanelBtn span'); if (pBtnSpan) pBtnSpan.textContent = top.length ? `Comments (${top.length})` : 'Comments';
  top.filter(c => !(hide && c.state === 'Completed') && (!only || c.page === E.cur)).forEach(c => { box.append(card(c, false)); E.comments.filter(r => r.irt === c.key).forEach(r => box.append(card(r, true))); });
  if (!box.children.length) box.innerHTML = '<p class="note">No notes or comments on this document yet. Click Note (N) in the toolbar and click anywhere on the page.</p>';
  updateDocInspector();
}
function setTab(t) { $('#pTools').hidden = t !== 't'; $('#pComments').hidden = t !== 'c'; $('#cTab').classList.toggle('on', t === 'c'); $('#tTab').classList.toggle('on', t === 't'); }
$('#tTab').onclick = () => setTab('t'); $('#cTab').onclick = () => setTab('c');
$('#cAuthor').value = (() => { try { return localStorage.getItem('author') || ''; } catch (e) { return ''; } })(); $('#cAuthor').onchange = e => { try { localStorage.setItem('author', e.target.value.trim()); } catch (x) {} };
$('#cHide').onchange = $('#cPage').onchange = renderComments;
$('#cClear').onclick = () => E.bytes && clearComments();
function commentRows() { return E.comments.map(c => { const p = c.irt ? E.comments.find(x => x.key === c.irt) : null; return { page: c.page + 1, type: c.irt ? 'Reply' : c.type, author: c.author, date: c.date, status: c.state === 'Completed' ? 'Resolved' : 'Open', text: c.contents, replyTo: p ? '#' + (E.comments.indexOf(p) + 1) : '' }; }); }
function csvText() { const rows = commentRows(), q = v => '"' + String(v).replace(/"/g, '""') + '"'; return 'no,page,type,author,date,status,reply_to,comment\n' + rows.map((r, i) => [i + 1, r.page, r.type, q(r.author), r.date, r.status, r.replyTo, q(r.text)].join(',')).join('\n') + '\n'; }
$('#cCsv').onclick = () => { if (!E.bytes) return; save(baseName() + '_comments.csv', new TextEncoder().encode('\ufeff' + csvText()), 'text/csv', [{ name: 'CSV', extensions: ['csv'] }]); };
$('#cTxt').onclick = () => { if (!E.bytes) return; const s = commentRows().map((r, i) => `#${i + 1}  Page ${r.page}  ${r.type}  ${r.status}\n    ${r.author || 'Unknown'}  ${r.date}${r.replyTo ? '  (reply to ' + r.replyTo + ')' : ''}\n    ${r.text || '(no text)'}\n`).join('\n'); save(baseName() + '_comments.txt', new TextEncoder().encode(s || 'No comments.\n'), 'text/plain', [{ name: 'Text', extensions: ['txt'] }]); };
async function stampPad() {
  const r = await dialog('Stamp', [{ type: 'select', id: 's', label: 'Stamp', options: ['APPROVED', 'REJECTED', 'REVIEWED', 'CHECKED', 'DRAFT', 'FOR COMMENT', 'VOID', 'CONFIDENTIAL', 'AS-BUILT', 'FINAL RELEASE'] }, { type: 'note', label: 'Click on the page to place it. The stamp is drawn into the page when you save.' }], 'Next');
  if (!r) return setTool('select'); const col = { APPROVED: '#0b8a3d', REJECTED: '#d62d2d', REVIEWED: '#1a3cff', CHECKED: '#0b8a3d', DRAFT: '#666666', 'FOR COMMENT': '#d97706', VOID: '#d62d2d', CONFIDENTIAL: '#b91c1c', 'AS-BUILT': '#0284c7', 'FINAL RELEASE': '#059669' }[r.s] || '#1a3cff'; E.stamp = { text: r.s, color: col }; st('Click on the page to place the stamp.');
}

window.editorDrop = async files => { if (!files.length) return; if (!E.bytes) openFile(files[0]); else try { await ops.merge(files); } catch (x) { st('Error: ' + x.message); } };
window.dialog = dialog; setPE();
window.editorShown = () => { if (E.doc) setTimeout(refit, 30); updateDocInspector(); syncHudBar(); };
updateContextualToolDock(E.tool);

// ---------- MS Word Quick Styles & List Formatting for PDF Text ----------
const MS_WORD_PDF_STYLES = {
  normal:  { fam: 'Helvetica', size: 12, bold: false, italic: false, underline: false, color: '#111827', bgBox: false, bgColor: '#fffbeb' },
  h1:      { fam: 'Helvetica', size: 20, bold: true,  italic: false, underline: false, color: '#1e3a8a', bgBox: false, bgColor: '#fffbeb' },
  h2:      { fam: 'Helvetica', size: 16, bold: true,  italic: false, underline: false, color: '#0f172a', bgBox: false, bgColor: '#fffbeb' },
  title:    { fam: 'Calibri', size: 26, bold: true,  italic: false, underline: false, color: '#0f172a', bgBox: false, bgColor: '#fffbeb' },
  subtitle: { fam: 'Calibri', size: 14, bold: false, italic: true,  underline: false, color: '#475569', bgBox: false, bgColor: '#fffbeb' },
  callout: { fam: 'Helvetica', size: 12, bold: true,  italic: false, underline: false, color: '#92400e', bgBox: true,  bgColor: '#fffbeb' }
};

function applyMSWordStylePreset(styleKey) {
  const preset = MS_WORD_PDF_STYLES[styleKey] || MS_WORD_PDF_STYLES.normal;
  document.querySelectorAll('#eQuickStylesRow .rp-word-style-card').forEach(b => b.classList.toggle('on', b.dataset.wstyle === styleKey));
  if ($('#eFontFam')) $('#eFontFam').value = preset.fam;
  syncFontSizeUI(preset.size);
  saveToolSetting('text', 'size', preset.size);
  saveToolSetting('text', 'color', preset.color);
  if ($('#eTextColor')) $('#eTextColor').value = preset.color;
  if ($('#eBold')) $('#eBold').classList.toggle('on', preset.bold);
  if ($('#eItalic')) $('#eItalic').classList.toggle('on', preset.italic);
  if ($('#eUnderline')) $('#eUnderline').classList.toggle('on', preset.underline);
  if ($('#eTextBg')) $('#eTextBg').checked = preset.bgBox;
  if ($('#eBgColor')) $('#eBgColor').value = preset.bgColor;

  if (E.inlineText) {
    Object.assign(E.inlineText, {
      fam: preset.fam,
      size: preset.size,
      bold: preset.bold,
      italic: preset.italic,
      underline: preset.underline,
      color: preset.color,
      bgBox: preset.bgBox,
      bgColor: preset.bgColor
    });
    syncInlineTextEditorStyle();
    const ta = $('#rp-inline-textarea');
    if (ta) ta.focus();
    return;
  }
  if (E.sel && E.sel.t === 'text') {
    pushAnnState('Apply MS Word text style');
    Object.assign(E.sel, {
      fam: preset.fam,
      size: preset.size,
      bold: preset.bold,
      italic: preset.italic,
      underline: preset.underline,
      color: preset.color,
      bgBox: preset.bgBox,
      bgColor: preset.bgColor
    });
    overlay();
    return;
  }
  if (E.tool !== 'text' && E.tool !== 'edittext') {
    setTool('text');
  }
}

function togglePdfTextListFormat(kind) {
  const formatLines = (rawText) => {
    const lines = String(rawText || '').split('\n');
    const stripPrefix = s => s.replace(/^(\s*(?:[•\-\*]|\d+\.)\s+)/, '');
    const allHaveBullet = lines.every(l => !l.trim() || /^\s*•\s+/.test(l));
    const allHaveNum = lines.every((l, i) => !l.trim() || /^\s*\d+\.\s+/.test(l));
    if (kind === 'ul') {
      return lines.map(l => !l.trim() ? l : (allHaveBullet ? stripPrefix(l) : '• ' + stripPrefix(l))).join('\n');
    } else {
      let n = 1;
      return lines.map(l => !l.trim() ? l : (allHaveNum ? stripPrefix(l) : (n++) + '. ' + stripPrefix(l))).join('\n');
    }
  };
  if (E.inlineText) {
    const ta = $('#rp-inline-textarea');
    if (ta) {
      ta.value = formatLines(ta.value || 'List item 1\nList item 2');
      syncInlineTextEditorStyle();
      ta.focus();
    }
    return;
  }
  if (E.sel && E.sel.t === 'text') {
    pushAnnState('Format list on PDF text');
    E.sel.text = formatLines(E.sel.text);
    overlay();
    return;
  }
  st('Select a text box or click on the PDF page with Type Text (T) to use Bullet / Numbered lists.');
}

document.querySelectorAll('#eQuickStylesRow .rp-word-style-card').forEach(btn => {
  btn.onclick = () => applyMSWordStylePreset(btn.dataset.wstyle);
});
if ($('#eListUl')) $('#eListUl').onclick = () => togglePdfTextListFormat('ul');
if ($('#eListOl')) $('#eListOl').onclick = () => togglePdfTextListFormat('ol');


// ============================================================================
// MS WORD EQUATION EDITOR & 2D MATHEMATICAL FORMULA RENDERER (Alt+=)
// ============================================================================
const EQUATION_PRESETS = [
  { name: 'Quadratic Formula', tex: 'x = \\frac{-b ± \\sqrt{b^2 - 4ac}}{2a}' },
  { name: 'Ohm\'s Law & AC Impedance', tex: 'Z = R + jX = \\sqrt{R^2 + (ωL - \\frac{1}{ωC})^2} ∠ θ' },
  { name: 'RC Transient Charging', tex: 'V(t) = V_0 · (1 - e^{-t / (R·C)})' },
  { name: 'Three-Phase Active Power', tex: 'P = \\sqrt{3} · V_L · I_L · cos(φ)' },
  { name: 'Op-Amp Closed-Loop Gain', tex: 'A_v = \\frac{V_{out}}{V_{in}} = -\\frac{R_f}{R_{in}}' },
  { name: 'Shannon–Hartley Capacity', tex: 'C = B · log_2(1 + \\frac{S}{N})' },
  { name: 'Fourier Transform', tex: 'F(ω) = \\int_{-∞}^{∞} f(t) · e^{-jωt} dt' },
  { name: 'Gaussian Distribution', tex: 'f(x) = \\frac{1}{σ\\sqrt{2π}} · e^{-\\frac{(x - μ)^2}{2σ^2}}' },
  { name: 'Binomial Series Summation', tex: '(x + y)^n = \\sum_{k=0}^{n} C(n,k) · x^{n-k} · y^k' },
  { name: 'Fundamental Derivative Limit', tex: '\\frac{df}{dx} = lim_{Δx→0} \\frac{f(x + Δx) - f(x)}{Δx}' },
  { name: 'Maxwell–Faraday Equation', tex: '∇ × E = -\\frac{∂B}{∂t}' },
  { name: 'PCB Microstrip Impedance Z₀', tex: 'Z_0 = \\frac{87}{\\sqrt{ε_r + 1.41}} · ln(\\frac{5.98h}{0.8w + t})' },
  { name: 'Thermal Junction Temp T_J', tex: 'T_J = T_A + P_D · (θ_{JC} + θ_{CA})' },
  { name: 'Euler\'s Identity & Trig', tex: 'e^{jπ} + 1 = 0   |   sin^2(θ) + cos^2(θ) = 1' }
];

const EQ_SYMBOL_TABS = {
  calc: ['∫', '∬', '∮', '∂', '∇', 'Δ', '∑', '∏', '√', '∛', '∞', '±', '∓', '×', '÷', '·', '∠', '⊥', '∥', '°', '‰'],
  greek: ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'λ', 'μ', 'ν', 'ξ', 'π', 'ρ', 'σ', 'τ', 'φ', 'χ', 'ψ', 'ω', 'Γ', 'Δ', 'Θ', 'Λ', 'Π', 'Σ', 'Φ', 'Ψ', 'Ω'],
  rel: ['=', '≠', '≈', '≡', '≤', '≥', '≪', '≫', '∝', '∼', '≅', '∈', '∉', '⊂', '⊆', '∪', '∩', '∀', '∃', '⇒', '⇔', '→', '↔'],
  struct: [
    { label: 'a/b Fraction', ins: '\\frac{a}{b}' },
    { label: '√x Radical', ins: '\\sqrt{x}' },
    { label: '∑ Summation', ins: '\\sum_{i=1}^{n}' },
    { label: '∫ Integral', ins: '\\int_{a}^{b}' },
    { label: 'x² Superscript', ins: 'x^{2}' },
    { label: 'V₀ Subscript', ins: 'V_{0}' },
    { label: 'lim Limit', ins: 'lim_{x→0}' },
    { label: '∂y/∂x Partial', ins: '\\frac{∂y}{∂x}' }
  ]
};

const LATEX_SYM_MAP = {
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\epsilon': 'ε',
  '\\theta': 'θ', '\\lambda': 'λ', '\\mu': 'μ', '\\pi': 'π', '\\rho': 'ρ',
  '\\sigma': 'σ', '\\tau': 'τ', '\\phi': 'φ', '\\omega': 'ω', '\\Delta': 'Δ',
  '\\Sigma': '∑', '\\Pi': '∏', '\\Omega': 'Ω', '\\infty': '∞', '\\pm': '±',
  '\\mp': '∓', '\\times': '×', '\\cdot': '·', '\\div': '÷', '\\leq': '≤',
  '\\geq': '≥', '\\neq': '≠', '\\approx': '≈', '\\equiv': '≡', '\\partial': '∂',
  '\\nabla': '∇', '\\to': '→', '\\rightarrow': '→', '\\leftrightarrow': '↔', '\\angle': '∠'
};

const SUP_DIGITS = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ','x':'ˣ','a':'ᵃ','b':'ᵇ','c':'ᶜ','e':'ᵉ','k':'ᵏ','m':'ᵐ','t':'ᵗ' };
const SUB_DIGITS = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','i':'ᵢ','j':'ⱼ','k':'ₖ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ','v':'ᵥ','x':'ₓ' };

function normalizeLatexSymbols(str) {
  let s = String(str || '');
  for (const [k, v] of Object.entries(LATEX_SYM_MAP)) {
    s = s.replace(new RegExp(k + '(?![a-zA-Z])', 'g'), v);
  }
  return s;
}

function exprToPlainUnicode(str) {
  let s = normalizeLatexSymbols(str);
  s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)');
  s = s.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)');
  s = s.replace(/\\sum_\{([^{}]+)\}\^\{([^{}]+)\}/g, '∑[$1..$2]');
  s = s.replace(/\\int_\{([^{}]+)\}\^\{([^{}]+)\}/g, '∫[$1..$2]');
  s = s.replace(/\^\{([^{}]+)\}/g, (_, p1) => [...p1].map(ch => SUP_DIGITS[ch] || ch).join(''));
  s = s.replace(/\^([0-9a-zA-Z+-])/g, (_, ch) => SUP_DIGITS[ch] || ('^' + ch));
  s = s.replace(/_\{([^{}]+)\}/g, (_, p1) => [...p1].map(ch => SUB_DIGITS[ch] || ch).join(''));
  s = s.replace(/_([0-9a-zA-Z+-])/g, (_, ch) => SUB_DIGITS[ch] || ('_' + ch));
  return s;
}

function parseMathTokens(str) {
  const s = normalizeLatexSymbols(str);
  const nodes = [];
  let i = 0;
  const readBraced = () => {
    if (s[i] !== '{') { const ch = s[i] || ''; i++; return ch; }
    i++;
    let depth = 1, out = '';
    while (i < s.length && depth > 0) {
      if (s[i] === '{') depth++;
      else if (s[i] === '}') { depth--; if (depth === 0) { i++; break; } }
      if (depth > 0) out += s[i++];
    }
    return out;
  };
  while (i < s.length) {
    if (s.startsWith('\\frac', i)) {
      i += 5;
      while (s[i] === ' ') i++;
      const num = parseMathTokens(readBraced());
      while (s[i] === ' ') i++;
      const den = parseMathTokens(readBraced());
      nodes.push({ type: 'frac', num, den });
    } else if (s.startsWith('\\sqrt', i)) {
      i += 5;
      while (s[i] === ' ') i++;
      const body = parseMathTokens(readBraced());
      nodes.push({ type: 'sqrt', body });
    } else if (s.startsWith('\\sum', i) || s.startsWith('\\int', i)) {
      const sym = s.startsWith('\\sum', i) ? '∑' : '∫';
      i += 4;
      let sub = null, sup = null;
      while (i < s.length && (s[i] === '_' || s[i] === '^')) {
        const kind = s[i++];
        const val = parseMathTokens(readBraced());
        if (kind === '_') sub = val; else sup = val;
      }
      nodes.push({ type: 'bigop', sym, sub, sup });
    } else if (s[i] === '^' || s[i] === '_') {
      const kind = s[i++];
      const val = parseMathTokens(readBraced());
      nodes.push({ type: kind === '^' ? 'sup' : 'sub', body: val });
    } else {
      let txt = '';
      while (i < s.length && !s.startsWith('\\frac', i) && !s.startsWith('\\sqrt', i) && !s.startsWith('\\sum', i) && !s.startsWith('\\int', i) && s[i] !== '^' && s[i] !== '_') {
        txt += s[i++];
      }
      if (txt) nodes.push({ type: 'text', text: txt });
    }
  }
  return nodes;
}

const MATH_SERIF_STACK = '"Cambria Math", "STIX Two Math", "Latin Modern Math", "Times New Roman", Georgia, serif';
const MATH_FN_RE = /^(sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|lim|max|min|det|sup|inf|mod|arg|deg|dim|ker|hom)\b/;

function tokenizeMathTextRuns(text) {
  const s = String(text || '');
  const runs = [];
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const fnMatch = rest.match(MATH_FN_RE);
    if (fnMatch) {
      runs.push({ text: fnMatch[0], italic: false });
      i += fnMatch[0].length;
      continue;
    }
    const ch = s[i];
    const isUpright = /[0-9.,+\-=±∓×·÷/()\[\]|<>≤≥≠≈≡∝∼≅∈∉⊂⊆∪∩∀∃⇒⇔→↔∞°‰!?:;\sΔΓΘΛΠΣΦΨΩ∑∏∫∬∮∂∇√∛]/.test(ch);
    if (runs.length && runs[runs.length - 1].italic === !isUpright) {
      runs[runs.length - 1].text += ch;
    } else {
      runs.push({ text: ch, italic: !isUpright });
    }
    i++;
  }
  return runs;
}

function measureMathTextRuns(ctx, text, fontSize) {
  let w = 0;
  for (const r of tokenizeMathTextRuns(text)) {
    ctx.font = `${r.italic ? 'italic ' : ''}500 ${fontSize}px ${MATH_SERIF_STACK}`;
    w += ctx.measureText(r.text).width;
  }
  return w;
}

function drawMathTextRuns(ctx, text, x, baselineY, fontSize) {
  let cx = x;
  for (const r of tokenizeMathTextRuns(text)) {
    ctx.font = `${r.italic ? 'italic ' : ''}500 ${fontSize}px ${MATH_SERIF_STACK}`;
    ctx.fillText(r.text, cx, baselineY);
    cx += ctx.measureText(r.text).width;
  }
  return cx - x;
}

function measureMathNodes(ctx, nodes, fontSize) {
  let width = 0, ascent = fontSize * 0.86, descent = fontSize * 0.32;
  for (const n of nodes) {
    if (n.type === 'text') {
      width += measureMathTextRuns(ctx, n.text, fontSize);
    } else if (n.type === 'frac') {
      const subSz = Math.max(fontSize * 0.78, fontSize * 0.5);
      const mNum = measureMathNodes(ctx, n.num, subSz);
      const mDen = measureMathNodes(ctx, n.den, subSz);
      const w = Math.max(mNum.width, mDen.width) + fontSize * 0.56;
      width += w;
      ascent = Math.max(ascent, mNum.ascent + mNum.descent + fontSize * 0.46);
      descent = Math.max(descent, mDen.ascent + mDen.descent + fontSize * 0.46);
    } else if (n.type === 'sqrt') {
      const mBody = measureMathNodes(ctx, n.body, fontSize * 0.92);
      width += mBody.width + fontSize * 0.78;
      ascent = Math.max(ascent, mBody.ascent + fontSize * 0.3);
      descent = Math.max(descent, mBody.descent + fontSize * 0.14);
    } else if (n.type === 'bigop') {
      const subSz = fontSize * 0.64;
      const mSub = n.sub ? measureMathNodes(ctx, n.sub, subSz) : { width: 0, ascent: 0, descent: 0 };
      const mSup = n.sup ? measureMathNodes(ctx, n.sup, subSz) : { width: 0, ascent: 0, descent: 0 };
      ctx.font = `500 ${fontSize * 1.48}px ${MATH_SERIF_STACK}`;
      const symW = ctx.measureText(n.sym).width;
      width += Math.max(symW, mSub.width, mSup.width) + fontSize * 0.32;
      ascent = Math.max(ascent, fontSize * 1.06 + mSup.ascent + mSup.descent);
      descent = Math.max(descent, fontSize * 0.56 + mSub.ascent + mSub.descent);
    } else if (n.type === 'sup' || n.type === 'sub') {
      const subSz = fontSize * 0.68;
      const m = measureMathNodes(ctx, n.body, subSz);
      width += m.width + fontSize * 0.08;
      if (n.type === 'sup') ascent = Math.max(ascent, fontSize * 0.56 + m.ascent);
      else descent = Math.max(descent, fontSize * 0.36 + m.descent);
    }
  }
  return { width: Math.max(fontSize * 0.65, width), ascent, descent, height: ascent + descent };
}

function drawMathNodes(ctx, nodes, x, baselineY, fontSize, color) {
  let curX = x;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const n of nodes) {
    if (n.type === 'text') {
      curX += drawMathTextRuns(ctx, n.text, curX, baselineY, fontSize);
    } else if (n.type === 'frac') {
      const subSz = fontSize * 0.78;
      const mNum = measureMathNodes(ctx, n.num, subSz);
      const mDen = measureMathNodes(ctx, n.den, subSz);
      const boxW = Math.max(mNum.width, mDen.width) + fontSize * 0.42;
      const barY = baselineY - fontSize * 0.32;
      const numX = curX + (boxW - mNum.width) / 2;
      const denX = curX + (boxW - mDen.width) / 2;
      drawMathNodes(ctx, n.num, numX, barY - mNum.descent - fontSize * 0.1, subSz, color);
      ctx.beginPath();
      ctx.lineWidth = Math.max(0.8, fontSize * 0.068);
      ctx.moveTo(curX + fontSize * 0.07, barY);
      ctx.lineTo(curX + boxW - fontSize * 0.07, barY);
      ctx.stroke();
      drawMathNodes(ctx, n.den, denX, barY + mDen.ascent + fontSize * 0.12, subSz, color);
      curX += boxW + fontSize * 0.14;
    } else if (n.type === 'sqrt') {
      const innerSz = fontSize * 0.92;
      const mBody = measureMathNodes(ctx, n.body, innerSz);
      const radW = fontSize * 0.56;
      const topY = baselineY - mBody.ascent - fontSize * 0.13;
      const botY = baselineY + mBody.descent * 0.48;
      ctx.beginPath();
      ctx.lineWidth = Math.max(0.9, fontSize * 0.072);
      ctx.moveTo(curX + fontSize * 0.03, baselineY - fontSize * 0.24);
      ctx.lineTo(curX + radW * 0.22, baselineY - fontSize * 0.32);
      ctx.lineTo(curX + radW * 0.46, botY);
      ctx.lineTo(curX + radW, topY);
      ctx.lineTo(curX + radW + mBody.width + fontSize * 0.15, topY);
      ctx.stroke();
      drawMathNodes(ctx, n.body, curX + radW + fontSize * 0.06, baselineY, innerSz, color);
      curX += radW + mBody.width + fontSize * 0.22;
    } else if (n.type === 'bigop') {
      const subSz = fontSize * 0.64;
      const mSub = n.sub ? measureMathNodes(ctx, n.sub, subSz) : { width: 0, ascent: 0, descent: 0 };
      const mSup = n.sup ? measureMathNodes(ctx, n.sup, subSz) : { width: 0, ascent: 0, descent: 0 };
      ctx.font = `500 ${fontSize * 1.48}px ${MATH_SERIF_STACK}`;
      const symW = ctx.measureText(n.sym).width;
      const blkW = Math.max(symW, mSub.width, mSup.width);
      ctx.fillText(n.sym, curX + (blkW - symW) / 2, baselineY + fontSize * 0.12);
      if (n.sup) drawMathNodes(ctx, n.sup, curX + (blkW - mSup.width) / 2, baselineY - fontSize * 0.85, subSz, color);
      if (n.sub) drawMathNodes(ctx, n.sub, curX + (blkW - mSub.width) / 2, baselineY + fontSize * 0.68, subSz, color);
      curX += blkW + fontSize * 0.22;
    } else if (n.type === 'sup' || n.type === 'sub') {
      const subSz = fontSize * 0.68;
      const m = measureMathNodes(ctx, n.body, subSz);
      const offY = n.type === 'sup' ? (-fontSize * 0.42) : (fontSize * 0.28);
      drawMathNodes(ctx, n.body, curX + fontSize * 0.02, baselineY + offY, subSz, color);
      curX += m.width + fontSize * 0.08;
    }
  }
}

function drawEquationVectorOnCtx(c, a, s) {
  const texStr = a.equation || 'E = m c^2';
  const baseFontSize = Math.max(8, Number(a.eqSize) || 18);
  const color = a.color || '#0f172a';
  const nodes = parseMathTokens(texStr);
  const m = measureMathNodes(_scratchCtx, nodes, baseFontSize);
  const padX = 10, padY = 8;
  const baseW = Math.max(16, Math.ceil(m.width + padX * 2));
  const baseH = Math.max(16, Math.ceil(m.height + padY * 2));
  const targetW = (a.w || baseW) * s;
  const targetH = (a.h || baseH) * s;
  const sx = targetW / baseW;
  const sy = targetH / baseH;
  c.save();
  c.translate((a.x || 0) * s, (a.y || 0) * s);
  c.scale(sx, sy);
  drawMathNodes(c, nodes, padX, padY + m.ascent, baseFontSize, color);
  c.restore();
}

function renderMathFormulaToCanvas(texStr, fontSize = 18, color = '#0f172a', scale = 6) {
  const nodes = parseMathTokens(texStr || 'E = m c^2');
  const m = measureMathNodes(_scratchCtx, nodes, fontSize);
  const padX = 10, padY = 8;
  const wPt = Math.ceil(m.width + padX * 2);
  const hPt = Math.ceil(m.height + padY * 2);
  const cv = document.createElement('canvas');
  cv.width = Math.max(16, Math.ceil(wPt * scale));
  cv.height = Math.max(16, Math.ceil(hPt * scale));
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);
  drawMathNodes(ctx, nodes, padX, padY + m.ascent, fontSize, color);
  return { cv, wPt, hPt };
}

function openEquationStudio(existingAnn = null) {
  document.querySelectorAll('.rp-modal:not(.rp-side-docked)').forEach(el => { if (el.id) el.hidden = true; else el.remove(); });
  let modal = $('#rp-equation-modal');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'rp-equation-modal';
  modal.className = 'rp-modal';
  const initTex = (existingAnn && existingAnn.equation) ? existingAnn.equation : 'x = \\frac{-b ± \\sqrt{b^2 - 4ac}}{2a}';
  const initSize = (existingAnn && existingAnn.eqSize) ? existingAnn.eqSize : (+($('#eFontSize') ? $('#eFontSize').value : 18) || 18);
  const initCol = (existingAnn && existingAnn.color) ? existingAnn.color : ($('#eTextColor') ? $('#eTextColor').value : '#0f172a');

  modal.innerHTML = `
    <div class="rp-card rp-wide rp-eq-studio-card" style="max-width:min(760px,95vw);gap:12px">
      <div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px">
        <div class="row" style="gap:8px">
          <span class="rp-launchpad-badge" style="margin:0"><i data-ic="equation"></i><span>EQUATION EDITOR</span></span>
          <h3 style="margin:0;font-size:15px">Insert / Edit Mathematical Equation &amp; Engineering Formula</h3>
        </div>
        <button type="button" class="rp-fmt-btn" id="eq-close-top">✕</button>
      </div>

      <div class="row" style="gap:8px;flex-wrap:wrap">
        <label class="f" style="flex:1;min-width:240px">Built-in MS Word Equations:
          <select id="eq-preset-sel" style="flex:1;max-width:none;height:26px;font-weight:600">
            <option value="">-- Choose an Equation Template (14 Built-In) --</option>
            ${EQUATION_PRESETS.map((p, idx) => `<option value="${idx}">${p.name}</option>`).join('')}
          </select>
        </label>
        <label class="f">Font Size (pt) <input type="number" id="eq-size-in" value="${initSize}" min="8" max="96" style="width:54px"></label>
        <label class="f">Colour <input type="color" id="eq-col-in" value="${initCol}" style="width:30px;height:24px"></label>
      </div>

      <div class="rp-eq-palette-box">
        <div class="row" id="eq-sym-tabs" style="gap:4px;margin-bottom:6px">
          <button type="button" class="rp-fmt-btn on" data-eqtab="struct">2D Structures (a/b, √, ∑, ∫)</button>
          <button type="button" class="rp-fmt-btn" data-eqtab="calc">Calculus &amp; Operators</button>
          <button type="button" class="rp-fmt-btn" data-eqtab="greek">Greek Letters (α–Ω)</button>
          <button type="button" class="rp-fmt-btn" data-eqtab="rel">Relations &amp; Arrows</button>
        </div>
        <div id="eq-sym-grid" class="rp-sym-bar" style="margin:0;min-height:36px"></div>
      </div>

      <div class="rp-form-group" style="margin:0">
        <label style="font-size:11.5px;color:var(--mute)">Equation Input (Supports LaTeX structures like <code>\\frac{a}{b}</code>, <code>\\sqrt{x}</code>, <code>\\sum_{i=1}^{n}</code>, <code>\\int_{a}^{b}</code>, <code>x^{2}</code>, <code>V_{in}</code> &amp; Unicode):</label>
        <textarea id="eq-tex-input" rows="2" style="width:100%;font:14px/1.45 Consolas,monospace;padding:8px;border:1px solid var(--line2);border-radius:6px;background:var(--panel2);color:var(--ink)"></textarea>
      </div>

      <div class="rp-eq-preview-wrap">
        <small style="color:var(--mute);font-size:10.5px;text-transform:uppercase;letter-spacing:.05em">Live 2D Mathematical Typesetting Preview (Cambria Math / Times Serif)</small>
        <div id="eq-preview-stage" class="rp-eq-preview-stage"></div>
      </div>

      <div class="rp-btns" style="justify-content:space-between;margin-top:4px">
        <button type="button" id="eq-insert-text-btn" title="Insert as plain Unicode math text into active text box">Insert as Plain Unicode Text</button>
        <div class="row" style="gap:8px">
          <button type="button" id="eq-cancel-btn">Cancel</button>
          <button type="button" class="rp-primary" id="eq-insert-2d-btn">✓ ${existingAnn ? 'Update 2D Equation on Page' : 'Place 2D Equation on PDF Page'}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  if (typeof hydrateIcons === 'function') hydrateIcons(modal);

  const ta = modal.querySelector('#eq-tex-input');
  const stage = modal.querySelector('#eq-preview-stage');
  const szIn = modal.querySelector('#eq-size-in');
  const colIn = modal.querySelector('#eq-col-in');
  const grid = modal.querySelector('#eq-sym-grid');
  ta.value = initTex;

  const renderSymTab = tabKey => {
    grid.innerHTML = '';
    modal.querySelectorAll('#eq-sym-tabs button').forEach(b => b.classList.toggle('on', b.dataset.eqtab === tabKey));
    const list = EQ_SYMBOL_TABS[tabKey] || [];
    list.forEach(item => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rp-sym-btn';
      if (typeof item === 'object') {
        b.textContent = item.label;
        b.style.padding = '0 8px';
        b.style.fontSize = '11.5px';
        b.onclick = () => insertAtCursor(item.ins);
      } else {
        b.textContent = item;
        b.onclick = () => insertAtCursor(item);
      }
      grid.appendChild(b);
    });
  };

  const insertAtCursor = str => {
    const s0 = ta.selectionStart ?? ta.value.length;
    const s1 = ta.selectionEnd ?? ta.value.length;
    ta.value = ta.value.slice(0, s0) + str + ta.value.slice(s1);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s0 + str.length;
    updatePreview();
  };

  const updatePreview = () => {
    stage.innerHTML = '';
    const prevScale = Math.max(3, Math.ceil(DPR() * 2.5));
    const { cv, wPt, hPt } = renderMathFormulaToCanvas(ta.value || 'x = 0', +szIn.value || 18, colIn.value || '#0f172a', prevScale);
    cv.style.width = wPt + 'px';
    cv.style.height = hPt + 'px';
    stage.appendChild(cv);
  };

  modal.querySelectorAll('#eq-sym-tabs button').forEach(b => {
    b.onclick = () => renderSymTab(b.dataset.eqtab);
  });
  modal.querySelector('#eq-preset-sel').onchange = e => {
    const p = EQUATION_PRESETS[+e.target.value];
    if (p) { ta.value = p.tex; updatePreview(); }
  };
  ta.oninput = updatePreview;
  szIn.oninput = updatePreview;
  colIn.oninput = updatePreview;

  const closeModal = () => modal.remove();
  modal.onclick = e => { if (e.target === modal) closeModal(); };
  modal.querySelector('#eq-close-top').onclick = closeModal;
  modal.querySelector('#eq-cancel-btn').onclick = closeModal;

  modal.querySelector('#eq-insert-text-btn').onclick = async () => {
    const uni = exprToPlainUnicode(ta.value);
    closeModal();
    if (E.inlineText && $('#rp-inline-textarea')) {
      const ita = $('#rp-inline-textarea');
      const s0 = ita.selectionStart ?? ita.value.length;
      ita.value = ita.value.slice(0, s0) + uni + ita.value.slice(ita.selectionEnd ?? s0);
      syncInlineTextEditorStyle();
      ita.focus();
      return;
    }
    if (!E.bytes) await ops.blank();
    addAnn({
      t: 'text',
      x: 72,
      y: 120,
      text: uni,
      fam: 'Cambria Math',
      size: +szIn.value || 16,
      color: colIn.value || '#0f172a',
      italic: true
    });
    st('Inserted mathematical formula as Unicode text on PDF page.');
  };

  modal.querySelector('#eq-insert-2d-btn').onclick = async () => {
    const tex = ta.value.trim() || 'E = mc^2';
    const eqSize = Math.max(8, +szIn.value || 18);
    const eqCol = colIn.value || '#0f172a';
    closeModal();
    if (!E.bytes) await ops.blank();
    const { cv, wPt, hPt } = renderMathFormulaToCanvas(tex, eqSize, eqCol, 6);
    const dataUrl = cv.toDataURL('image/png');
    cv.width = 0; cv.height = 0;
    const im = await loadImg(dataUrl);
    if (existingAnn) {
      pushAnnState('Update 2D equation');
      Object.assign(existingAnn, {
        w: wPt,
        h: hPt,
        img: im,
        dataUrl,
        equation: tex,
        eqSize,
        color: eqCol
      });
      overlay();
      st('Updated 2D mathematical equation on PDF page.');
    } else {
      const px = E.inlineText ? E.inlineText.x : 80;
      const py = E.inlineText ? E.inlineText.y : 120;
      if (E.inlineText) cancelInlineTextEditor();
      addAnn({
        t: 'image',
        x: px,
        y: py,
        w: wPt,
        h: hPt,
        img: im,
        dataUrl,
        equation: tex,
        eqSize,
        color: eqCol
      });
      st('Placed 2D MS Word Equation on PDF page — drag to move/resize, or double-click anytime to edit formula!');
    }
  };

  renderSymTab('struct');
  updatePreview();
  setTimeout(() => ta.focus(), 20);
}

if ($('#eEquationBtn')) $('#eEquationBtn').onclick = () => openEquationStudio();
addEventListener('keydown', e => {
  if (document.body.dataset.view === 'edit' && e.altKey && (e.key === '=' || e.key === '+')) {
    e.preventDefault();
    openEquationStudio();
  }
});

function transformActiveOrSelectedText(fn, label = 'Format text') {
  if (E.inlineText && $('#rp-inline-textarea')) {
    const ta = $('#rp-inline-textarea');
    const s0 = ta.selectionStart ?? 0, s1 = ta.selectionEnd ?? 0;
    if (s1 > s0) {
      const sub = fn(ta.value.slice(s0, s1));
      ta.value = ta.value.slice(0, s0) + sub + ta.value.slice(s1);
      ta.selectionStart = s0; ta.selectionEnd = s0 + sub.length;
    } else {
      ta.value = fn(ta.value);
    }
    syncInlineTextEditorStyle();
    ta.focus();
    return true;
  }
  if (E.sel && E.sel.t === 'text') {
    pushAnnState(label);
    E.sel.text = fn(E.sel.text || '');
    overlay();
    return true;
  }
  return false;
}

if ($('#eSubscript')) {
  $('#eSubscript').onclick = () => {
    transformActiveOrSelectedText(txt => [...String(txt)].map(ch => SUB_DIGITS[ch] || ch).join(''), 'Subscript text');
  };
}
if ($('#eSuperscript')) {
  $('#eSuperscript').onclick = () => {
    transformActiveOrSelectedText(txt => [...String(txt)].map(ch => SUP_DIGITS[ch] || ch).join(''), 'Superscript text');
  };
}
let _caseCycle = 0;
if ($('#eChangeCase')) {
  $('#eChangeCase').onclick = () => {
    _caseCycle = (_caseCycle + 1) % 4;
    transformActiveOrSelectedText(txt => {
      const s = String(txt || '');
      if (_caseCycle === 1) return s.toUpperCase();
      if (_caseCycle === 2) return s.toLowerCase();
      if (_caseCycle === 3) return s.replace(/\b\w/g, c => c.toUpperCase());
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    }, 'Change text case');
  };
}
if ($('#eClearFmt')) {
  $('#eClearFmt').onclick = () => {
    applyMSWordStylePreset('normal');
    if (E.inlineText) {
      E.inlineText.underline = false;
      E.inlineText.strike = false;
      E.inlineText.bgBox = false;
      E.inlineText.lineHeight = 1.22;
      syncInlineTextEditorStyle();
    }
    if (E.sel && E.sel.t === 'text') {
      E.sel.underline = false;
      E.sel.strike = false;
      E.sel.bgBox = false;
      E.sel.lineHeight = 1.22;
      overlay();
    }
    st('Cleared text formatting to Normal 12pt.');
  };
}
if ($('#eListCheck')) {
  $('#eListCheck').onclick = () => {
    transformActiveOrSelectedText(txt => {
      const lines = String(txt || 'Checklist item').split('\n');
      const allChecked = lines.every(l => !l.trim() || /^\s*[☑☐]\s+/.test(l));
      return lines.map(l => !l.trim() ? l : (allChecked ? l.replace(/^\s*[☑☐]\s+/, '') : '☑ ' + l.replace(/^\s*([•\-\*]|\d+\.)\s+/, ''))).join('\n');
    }, 'Toggle checklist');
  };
}
if ($('#eIndent')) {
  $('#eIndent').onclick = () => {
    transformActiveOrSelectedText(txt => String(txt || '').split('\n').map(l => '    ' + l).join('\n'), 'Increase indent');
  };
}
if ($('#eOutdent')) {
  $('#eOutdent').onclick = () => {
    transformActiveOrSelectedText(txt => String(txt || '').split('\n').map(l => l.replace(/^ {1,4}/, '')).join('\n'), 'Decrease indent');
  };
}
if ($('#eLineSpacing')) {
  $('#eLineSpacing').onchange = e => {
    const lh = +e.target.value || 1.22;
    if (E.inlineText) {
      E.inlineText.lineHeight = lh;
      syncInlineTextEditorStyle();
    }
    if (E.sel && E.sel.t === 'text') {
      pushAnnState('Change line spacing');
      E.sel.lineHeight = lh;
      overlay();
    }
  };
}


// ============================================================================
// ASME Y14.5 / ISO 1101 GD&T FEATURE CONTROL FRAME BUILDER & SYMBOL LIBRARY
// ============================================================================
function drawGDTFrameVectorOnCtx(c, a, s) {
  const spec = a.gdtSpec || {};
  const comps = (typeof MeasureEngine !== 'undefined' && MeasureEngine.buildGDTControlFrameCompartments)
    ? MeasureEngine.buildGDTControlFrameCompartments(spec)
    : [spec.symbol || '⌖', (spec.diaPrefix || '⌀') + (spec.tolerance || '0.05') + (spec.modifier ? ' ' + spec.modifier : ''), spec.datumA || 'A', spec.datumB || 'B'].filter(Boolean);
  const fs = Math.max(10, +spec.fontSize || 15);
  const boxH = Math.round(fs * 1.9);
  const padX = Math.round(fs * 0.55);
  _scratchCtx.font = `bold ${fs}px "Cambria Math", "Segoe UI Symbol", Arial, sans-serif`;
  const widths = comps.map((comp, idx) => idx === 0 ? boxH : Math.max(boxH, Math.ceil(_scratchCtx.measureText(comp).width + padX * 2)));
  const totalW = widths.reduce((acc, w) => acc + w, 0);
  const pad = 4;
  const baseW = totalW + pad * 2;
  const baseH = boxH + pad * 2;
  const sx = ((a.w || baseW) * s) / baseW;
  const sy = ((a.h || baseH) * s) / baseH;
  c.save();
  c.translate((a.x || 0) * s, (a.y || 0) * s);
  c.scale(sx, sy);
  const col = spec.color || a.color || '#0f172a';
  c.fillStyle = '#ffffff';
  fillRoundRect(c, pad, pad, totalW, boxH, 5);
  c.strokeStyle = col;
  c.lineWidth = 1.6;
  strokeRoundRect(c, pad, pad, totalW, boxH, 5);
  let curX = pad;
  c.fillStyle = col;
  c.font = `bold ${fs}px "Cambria Math", "Segoe UI Symbol", Arial, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  comps.forEach((txt, idx) => {
    const w = widths[idx];
    if (idx > 0) {
      c.beginPath();
      c.moveTo(curX, pad);
      c.lineTo(curX, pad + boxH);
      c.stroke();
    }
    c.fillText(txt, curX + w / 2, pad + boxH / 2 + 0.5);
    curX += w;
  });
  c.restore();
}

function renderGDTFrameToCanvas(spec = {}, scale = 6) {
  const comps = (typeof MeasureEngine !== 'undefined' && MeasureEngine.buildGDTControlFrameCompartments)
    ? MeasureEngine.buildGDTControlFrameCompartments(spec)
    : [spec.symbol || '⌖', (spec.diaPrefix || '⌀') + (spec.tolerance || '0.05') + (spec.modifier ? ' ' + spec.modifier : ''), spec.datumA || 'A', spec.datumB || 'B'].filter(Boolean);
  const fs = Math.max(10, +spec.fontSize || 15);
  const boxH = Math.round(fs * 1.9);
  const padX = Math.round(fs * 0.55);
  _scratchCtx.font = `bold ${fs}px "Cambria Math", "Segoe UI Symbol", Arial, sans-serif`;
  const widths = comps.map((c, idx) => idx === 0 ? boxH : Math.max(boxH, Math.ceil(_scratchCtx.measureText(c).width + padX * 2)));
  const totalW = widths.reduce((a, b) => a + b, 0);
  const pad = 4;
  const wPt = totalW + pad * 2;
  const hPt = boxH + pad * 2;

  const cv = document.createElement('canvas');
  cv.width = Math.ceil(wPt * scale);
  cv.height = Math.ceil(hPt * scale);
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);

  const col = spec.color || '#0f172a';
  ctx.fillStyle = '#ffffff';
  fillRoundRect(ctx, pad, pad, totalW, boxH, 5);
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.6;
  strokeRoundRect(ctx, pad, pad, totalW, boxH, 5);

  let curX = pad;
  ctx.fillStyle = col;
  ctx.font = `bold ${fs}px "Cambria Math", "Segoe UI Symbol", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  comps.forEach((txt, idx) => {
    const w = widths[idx];
    if (idx > 0) {
      ctx.beginPath();
      ctx.moveTo(curX, pad);
      ctx.lineTo(curX, pad + boxH);
      ctx.stroke();
    }
    ctx.fillText(txt, curX + w / 2, pad + boxH / 2 + 0.5);
    curX += w;
  });

  return { cv, wPt, hPt };
}

function openGDTBuilder(existingAnn = null) {
  document.querySelectorAll('.rp-modal:not(.rp-side-docked)').forEach(el => { if (el.id) el.hidden = true; else el.remove(); });
  let modal = $('#rp-gdt-modal');
  if (modal) modal.remove();
  const initSpec = (existingAnn && existingAnn.gdtSpec) || {
    symbol: '⌖',
    diaPrefix: '⌀',
    tolerance: '0.05',
    modifier: 'Ⓜ',
    datumA: 'A',
    datumB: 'B',
    datumC: 'C',
    fontSize: 15,
    color: '#0f172a'
  };
  const syms = (typeof MeasureEngine !== 'undefined' && MeasureEngine.GDT_SYMBOLS) || [
    { sym: '⌖', name: 'Position (⌖)' },
    { sym: '⏥', name: 'Flatness (⏥)' },
    { sym: '⊥', name: 'Perpendicularity (⊥)' },
    { sym: '∥', name: 'Parallelism (∥)' },
    { sym: '◎', name: 'Concentricity (◎)' },
    { sym: '○', name: 'Circularity (○)' },
    { sym: '⌓', name: 'Profile of Surface (⌓)' },
    { sym: '↗', name: 'Circular Runout (↗)' }
  ];

  modal = document.createElement('div');
  modal.id = 'rp-gdt-modal';
  modal.className = 'rp-modal';
  modal.innerHTML = `
    <div class="rp-card rp-wide" style="max-width:min(780px,95vw);gap:12px">
      <div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px">
        <div class="row" style="gap:8px">
          <span class="rp-launchpad-badge" style="margin:0"><i data-ic="gdt"></i><span>GD&amp;T FRAME</span></span>
          <h3 style="margin:0;font-size:15px">Geometric Dimensioning &amp; Tolerancing Feature Control Frame</h3>
        </div>
        <button type="button" class="rp-fmt-btn" id="gdt-close-top">✕</button>
      </div>

      <div class="rp-hud-grid" style="gap:12px">
        <div class="rp-hud-section">
          <h4>1. Characteristic &amp; Tolerance Zone</h4>
          <label class="fl">Geometric Symbol
            <select id="gdt-sym">${syms.map(s => `<option value="${s.sym}" ${s.sym === initSpec.symbol ? 'selected' : ''}>${s.name}</option>`).join('')}</select>
          </label>
          <label class="fl">Zone Prefix
            <select id="gdt-dia">
              <option value="⌀" ${initSpec.diaPrefix === '⌀' ? 'selected' : ''}>⌀ (Cylindrical / Diameter)</option>
              <option value="" ${initSpec.diaPrefix === '' ? 'selected' : ''}>None (Linear / Planar)</option>
              <option value="S⌀" ${initSpec.diaPrefix === 'S⌀' ? 'selected' : ''}>S⌀ (Spherical Diameter)</option>
            </select>
          </label>
          <label class="fl">Tolerance Value <input type="text" id="gdt-tol" value="${initSpec.tolerance}" style="width:90px"></label>
          <label class="fl">Material Modifier
            <select id="gdt-mod">
              <option value="Ⓜ" ${initSpec.modifier === 'Ⓜ' ? 'selected' : ''}>Ⓜ Maximum Material (MMC)</option>
              <option value="Ⓛ" ${initSpec.modifier === 'Ⓛ' ? 'selected' : ''}>Ⓛ Least Material (LMC)</option>
              <option value="Ⓢ" ${initSpec.modifier === 'Ⓢ' ? 'selected' : ''}>Ⓢ Regardless of Feature Size</option>
              <option value="" ${!initSpec.modifier ? 'selected' : ''}>None</option>
            </select>
          </label>
        </div>

        <div class="rp-hud-section">
          <h4>2. Datum Reference Frame &amp; Style</h4>
          <label class="fl">Primary Datum <input type="text" id="gdt-da" value="${initSpec.datumA || ''}" placeholder="A" style="width:70px"></label>
          <label class="fl">Secondary Datum <input type="text" id="gdt-db" value="${initSpec.datumB || ''}" placeholder="B" style="width:70px"></label>
          <label class="fl">Tertiary Datum <input type="text" id="gdt-dc" value="${initSpec.datumC || ''}" placeholder="C" style="width:70px"></label>
          <div class="row" style="justify-content:space-between;margin-top:4px">
            <label class="f">Size (pt) <input type="number" id="gdt-fs" value="${initSpec.fontSize || 15}" min="9" max="48" style="width:52px"></label>
            <label class="f">Colour <input type="color" id="gdt-col" value="${initSpec.color || '#0f172a'}" style="width:30px;height:24px"></label>
          </div>
        </div>
      </div>

      <div class="rp-eq-preview-wrap">
        <small style="color:var(--mute);font-size:10.5px;text-transform:uppercase">Live ASME Y14.5 / ISO 1101 Feature Control Frame Preview</small>
        <div id="gdt-preview-stage" class="rp-eq-preview-stage"></div>
      </div>

      <div class="rp-btns">
        <button type="button" id="gdt-cancel-btn">Cancel</button>
        <button type="button" class="rp-primary" id="gdt-insert-btn">✓ ${existingAnn ? 'Update GD&T Frame' : 'Place GD&T Frame on PDF'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  if (typeof hydrateIcons === 'function') hydrateIcons(modal);

  const readSpec = () => ({
    symbol: modal.querySelector('#gdt-sym').value,
    diaPrefix: modal.querySelector('#gdt-dia').value,
    tolerance: modal.querySelector('#gdt-tol').value.trim() || '0.05',
    modifier: modal.querySelector('#gdt-mod').value,
    datumA: modal.querySelector('#gdt-da').value.trim(),
    datumB: modal.querySelector('#gdt-db').value.trim(),
    datumC: modal.querySelector('#gdt-dc').value.trim(),
    fontSize: +modal.querySelector('#gdt-fs').value || 15,
    color: modal.querySelector('#gdt-col').value || '#0f172a'
  });

  const updatePreview = () => {
    const stage = modal.querySelector('#gdt-preview-stage');
    stage.innerHTML = '';
    const { cv, wPt, hPt } = renderGDTFrameToCanvas(readSpec(), Math.max(3, Math.ceil(DPR() * 2.5)));
    cv.style.width = wPt + 'px';
    cv.style.height = hPt + 'px';
    stage.appendChild(cv);
  };

  ['#gdt-sym', '#gdt-dia', '#gdt-tol', '#gdt-mod', '#gdt-da', '#gdt-db', '#gdt-dc', '#gdt-fs', '#gdt-col'].forEach(sel => {
    modal.querySelector(sel).oninput = updatePreview;
    modal.querySelector(sel).onchange = updatePreview;
  });

  const close = () => modal.remove();
  modal.onclick = e => { if (e.target === modal) close(); };
  modal.querySelector('#gdt-close-top').onclick = close;
  modal.querySelector('#gdt-cancel-btn').onclick = close;

  modal.querySelector('#gdt-insert-btn').onclick = async () => {
    const spec = readSpec();
    close();
    if (!E.bytes) await ops.blank();
    const { cv, wPt, hPt } = renderGDTFrameToCanvas(spec, 6);
    const dataUrl = cv.toDataURL('image/png');
    cv.width = 0; cv.height = 0;
    const im = await loadImg(dataUrl);
    if (existingAnn) {
      pushAnnState('Update GD&T frame');
      Object.assign(existingAnn, { w: wPt, h: hPt, img: im, dataUrl, gdtSpec: spec, color: spec.color });
      overlay();
      st('Updated GD&T Feature Control Frame on PDF page.');
    } else {
      addAnn({ t: 'image', x: 90, y: 140, w: wPt, h: hPt, img: im, dataUrl, gdtSpec: spec, color: spec.color, layer: 'Mechanical' });
      st('Placed ASME Y14.5 GD&T Feature Control Frame on PDF page — double-click anytime to edit!');
    }
  };

  updatePreview();
}

const BUILTIN_ENGINEERING_BLOCKS = [
  { id: 'res', name: 'Resistor (IEEE Zigzag)', cat: 'Electrical', label: 'R = 10kΩ ±1%', sym: 'IEEE-R' },
  { id: 'cap', name: 'Capacitor (Parallel Plate)', cat: 'Electrical', label: 'C = 100µF 25V', sym: 'IEC-C' },
  { id: 'gnd', name: 'Protective Earth / GND', cat: 'Electrical', label: 'GND (0V REF)', sym: 'IEC-GND' },
  { id: 'opamp', name: 'Differential Op-Amp', cat: 'Electrical', label: 'U1: OP-AMP', sym: 'IEEE-AMP' },
  { id: 'surf', name: 'ISO 1302 Surface Finish', cat: 'Mechanical', label: 'Ra 1.6 µm', sym: 'ISO-1302' },
  { id: 'weld', name: 'AWS / ISO Fillet Weld', cat: 'Mechanical', label: '5mm Fillet Weld', sym: 'ISO-2553' },
  { id: 'datum', name: 'ASME Y14.5 Datum [A]', cat: 'Mechanical', label: 'DATUM A', sym: 'ASME-DAT' },
  { id: 'esd', name: 'JEDEC ESD Class 1', cat: 'Compliance', label: 'CAUTION: ESD SENSITIVE', sym: 'JESD-625' },
  { id: 'rohs', name: 'RoHS 3 / Pb-Free Mark', cat: 'Compliance', label: 'RoHS COMPLIANT · Pb-FREE', sym: 'EU-2015/863' },
  { id: 'iso', name: 'IPC-A-610 Class 3 QA', cat: 'Compliance', label: 'IPC-A-610 CLASS 3 VERIFIED', sym: 'IPC-A-610' }
];

function renderEngineeringSymbolToCanvas(blk, scale = 3) {
  const wPt = 136, hPt = 52;
  const cv = document.createElement('canvas');
  cv.width = Math.round(wPt * scale);
  cv.height = Math.round(hPt * scale);
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  fillRoundRect(ctx, 1, 1, wPt - 2, hPt - 2, 6);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.4;
  strokeRoundRect(ctx, 1.5, 1.5, wPt - 3, hPt - 3, 6);

  ctx.strokeStyle = '#0f172a';
  ctx.fillStyle = '#0f172a';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const id = (blk && blk.id ? blk.id.trim() : '');
  const cy = 19;
  if (id === 'res') {
    ctx.beginPath();
    ctx.moveTo(22, cy); ctx.lineTo(42, cy);
    const pts = [[46, cy - 7], [53, cy + 7], [60, cy - 7], [67, cy + 7], [74, cy - 7], [81, cy + 7], [85, cy]];
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(114, cy);
    ctx.stroke();
  } else if (id === 'cap') {
    ctx.beginPath();
    ctx.moveTo(24, cy); ctx.lineTo(62, cy);
    ctx.moveTo(62, cy - 10); ctx.lineTo(62, cy + 10);
    ctx.moveTo(74, cy - 10); ctx.lineTo(74, cy + 10);
    ctx.moveTo(74, cy); ctx.lineTo(112, cy);
    ctx.stroke();
  } else if (id === 'gnd') {
    ctx.beginPath();
    ctx.moveTo(68, 6); ctx.lineTo(68, 17);
    ctx.moveTo(50, 17); ctx.lineTo(86, 17);
    ctx.moveTo(56, 22); ctx.lineTo(80, 22);
    ctx.moveTo(62, 27); ctx.lineTo(74, 27);
    ctx.stroke();
  } else if (id === 'opamp') {
    ctx.beginPath();
    ctx.moveTo(32, 13); ctx.lineTo(52, 13);
    ctx.moveTo(32, 25); ctx.lineTo(52, 25);
    ctx.moveTo(52, 7); ctx.lineTo(52, 31); ctx.lineTo(86, 19); ctx.closePath();
    ctx.moveTo(86, 19); ctx.lineTo(106, 19);
    ctx.stroke();
    ctx.font = 'bold 9px Arial, sans-serif';
    ctx.fillText('+', 55, 16);
    ctx.fillText('−', 55, 26);
  } else if (id === 'surf') {
    ctx.beginPath();
    ctx.moveTo(46, 18); ctx.lineTo(54, 28); ctx.lineTo(68, 8); ctx.lineTo(96, 8);
    ctx.stroke();
    ctx.font = 'bold 9.5px Arial, sans-serif';
    ctx.fillText('1.6', 72, 20);
  } else if (id === 'weld') {
    ctx.beginPath();
    ctx.moveTo(28, 26); ctx.lineTo(42, 18); ctx.lineTo(104, 18);
    ctx.moveTo(64, 18); ctx.lineTo(64, 8); ctx.lineTo(76, 18);
    ctx.stroke();
  } else if (id === 'datum') {
    ctx.strokeRect(56, 6, 24, 16);
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('A', 68, 17.5);
    ctx.beginPath();
    ctx.moveTo(68, 22); ctx.lineTo(68, 28);
    ctx.moveTo(63, 28); ctx.lineTo(73, 28); ctx.lineTo(68, 23); ctx.closePath();
    ctx.fill();
    ctx.moveTo(48, 28); ctx.lineTo(88, 28);
    ctx.stroke();
  } else {
    ctx.font = 'bold 11px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(blk.sym || 'STD-BLK', wPt / 2, 21);
  }

  ctx.textAlign = 'center';
  ctx.font = 'bold 9.5px "Segoe UI", Arial, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(String(blk.label || blk.name || '').slice(0, 26), wPt / 2, hPt - 7);
  return { cv, wPt, hPt };
}

function openBlockLibraryModal() {
  document.querySelectorAll('.rp-modal:not(.rp-side-docked)').forEach(el => { if (el.id) el.hidden = true; else el.remove(); });
  let m = $('#rp-block-lib-modal');
  if (m) m.remove();
  let customBlocks = [];
  try { customBlocks = JSON.parse(localStorage.getItem('rp_custom_blocks') || '[]'); } catch (e) {}

  m = document.createElement('div');
  m.id = 'rp-block-lib-modal';
  m.className = 'rp-modal';
  m.innerHTML = `
    <div class="rp-card rp-wide" style="max-width:min(760px,95vw);gap:12px">
      <div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px">
        <div class="row" style="gap:8px">
          <span class="rp-launchpad-badge" style="margin:0"><i data-ic="blockLib"></i><span>SYMBOL LIBRARY</span></span>
          <h3 style="margin:0;font-size:15px">Engineering Schematic Symbols, GD&amp;T Marks &amp; QA Blocks</h3>
        </div>
        <button type="button" class="rp-fmt-btn" id="bl-close-top">✕</button>
      </div>
      <div class="row" style="gap:8px">
        <input type="text" id="bl-custom-name" placeholder="Custom Block Title (e.g. QC Inspector Sign-Off)" style="flex:1;height:26px">
        <input type="text" id="bl-custom-sym" placeholder="Code / Stamp Text (e.g. PASS REV 2)" style="flex:1;height:26px">
        <button type="button" class="rp-btn-sm" id="bl-save-custom">+ Save Custom Block</button>
      </div>
      <div id="bl-grid" class="rp-about-grid" style="max-height:350px;overflow-y:auto"></div>
      <div class="rp-btns">
        <button type="button" class="rp-primary" id="bl-close-btn">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  if (typeof hydrateIcons === 'function') hydrateIcons(m);

  const renderGrid = () => {
    const all = [...BUILTIN_ENGINEERING_BLOCKS, ...customBlocks];
    const grid = m.querySelector('#bl-grid');
    grid.innerHTML = all.map((b, idx) => `
      <div class="rp-about-item" style="cursor:pointer;justify-content:space-between" data-bidx="${idx}">
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px">
            <h4 style="margin:0">${b.name}</h4>
            <span class="defect-badge added">${b.cat || 'Custom'}</span>
          </div>
          <div class="rp-sym-preview-slot" data-slotidx="${idx}" style="display:flex;justify-content:center;padding:4px;background:var(--panel);border:1px solid var(--line);border-radius:3px;margin:4px 0"></div>
        </div>
        <button type="button" class="rp-btn-sm" style="margin-top:6px;width:100%;justify-content:center">Place on PDF Page</button>
      </div>
    `).join('');

    grid.querySelectorAll('.rp-sym-preview-slot').forEach(slot => {
      const blk = all[+slot.dataset.slotidx];
      if (!blk) return;
      const { cv, wPt, hPt } = renderEngineeringSymbolToCanvas(blk, 2);
      cv.style.width = wPt + 'px';
      cv.style.height = hPt + 'px';
      cv.style.borderRadius = '2px';
      slot.appendChild(cv);
    });

    grid.querySelectorAll('.rp-about-item').forEach(card => {
      card.onclick = async () => {
        const blk = all[+card.dataset.bidx];
        if (!blk) return;
        m.remove();
        if (!E.bytes) await ops.blank();
        const { cv, wPt, hPt } = renderEngineeringSymbolToCanvas(blk, 4);
        const dataUrl = cv.toDataURL('image/png');
        cv.width = 0; cv.height = 0;
        const im = await loadImg(dataUrl);
        addAnn({
          t: 'image',
          x: 90,
          y: 130,
          w: wPt,
          h: hPt,
          img: im,
          dataUrl,
          layer: blk.cat === 'Electrical' ? 'Electrical' : (blk.cat === 'Mechanical' ? 'Mechanical' : 'QA')
        });
        st(`Placed engineering symbol block "${blk.name}" on PDF page.`);
      };
    });
  };

  m.querySelector('#bl-save-custom').onclick = () => {
    const nm = m.querySelector('#bl-custom-name').value.trim();
    const sy = m.querySelector('#bl-custom-sym').value.trim();
    if (!nm || !sy) return;
    customBlocks.push({ id: 'cust_' + Date.now(), name: nm, cat: 'Custom', label: nm, sym: sy });
    try { localStorage.setItem('rp_custom_blocks', JSON.stringify(customBlocks)); } catch (e) {}
    m.querySelector('#bl-custom-name').value = '';
    m.querySelector('#bl-custom-sym').value = '';
    renderGrid();
  };
  const closeBlockModal = () => {
    if (document.activeElement && m.contains(document.activeElement) && typeof document.activeElement.blur === 'function') document.activeElement.blur();
    m.remove();
  };
  m.onclick = e => { if (e.target === m) closeBlockModal(); };
  m.querySelector('#bl-close-top').onclick = closeBlockModal;
  m.querySelector('#bl-close-btn').onclick = closeBlockModal;
  renderGrid();
}

if ($('#eGdtBtn')) $('#eGdtBtn').onclick = () => openGDTBuilder();
if ($('#eSnapGridBtn')) $('#eSnapGridBtn').onclick = () => toggleSnapGrid(10);
if ($('#eLockAnnBtn')) $('#eLockAnnBtn').onclick = () => toggleLockSelectedAnn();
if ($('#eAlignLeftBtn')) $('#eAlignLeftBtn').onclick = () => alignSelectedAnns('left');
if ($('#eAlignCenterBtn')) $('#eAlignCenterBtn').onclick = () => alignSelectedAnns('centerH');
if ($('#eAlignTopBtn')) $('#eAlignTopBtn').onclick = () => alignSelectedAnns('top');
if ($('#eDistHBtn')) $('#eDistHBtn').onclick = () => alignSelectedAnns('distH');
if ($('#eExportPngBtn')) $('#eExportPngBtn').onclick = () => exportCurrentPagePNG();
if ($('#eBlockLibBtn')) $('#eBlockLibBtn').onclick = () => openBlockLibraryModal();
if ($('#eMarkupLayerSel')) {
  $('#eMarkupLayerSel').onchange = e => {
    E.activeLayer = e.target.value;
    overlay();
    st(E.activeLayer === 'all' ? 'Showing all markup discipline layers' : `Active markup layer: ${E.activeLayer}`);
  };
}
if ($('#eFaiExportBtn')) {
  $('#eFaiExportBtn').onclick = () => {
    if (!E.faiManager && typeof MeasureEngine !== 'undefined' && MeasureEngine.FAIManager) {
      E.faiManager = new MeasureEngine.FAIManager();
    }
    if (!E.faiManager || !E.faiManager.items.length) {
      return st('Place at least one FAI Balloon on the drawing first using the "FAI Balloon" tool.');
    }
    const csv = E.faiManager.toAS9102CSV();
    save((baseName() || 'drawing') + '_AS9102_FAI_Schedule.csv', new TextEncoder().encode('\ufeff' + csv), 'text/csv', [{ name: 'CSV', extensions: ['csv'] }]);
  };
}


// ============================================================================
// INTERACTIVE EDITABLE PDF TABLE ENGINE (ON-PAGE CELL EDITOR & TABLE STUDIO)
// ============================================================================
function createTableSpec(p = {}) {
  const rows = Math.max(1, Math.min(30, +(p.rows || (Array.isArray(p.cells) ? p.cells.length : 4)) || 4));
  const cols = Math.max(1, Math.min(12, +(p.cols || (Array.isArray(p.cells) && p.cells[0] ? p.cells[0].length : 4)) || 4));
  const defaultHeaders = ['Parameter', 'Symbol', 'Value', 'Unit', 'Notes', 'Status', 'Tolerance', 'Ref'];
  const parsedHeaders = p.headers != null
    ? String(p.headers).split(',').map(s => s.trim())
    : defaultHeaders;

  const cells = [];
  for (let r = 0; r < rows; r++) {
    const rowArr = [];
    for (let c = 0; c < cols; c++) {
      if (Array.isArray(p.cells) && Array.isArray(p.cells[r]) && p.cells[r][c] != null) {
        rowArr.push(String(p.cells[r][c]));
      } else if (r === 0) {
        rowArr.push(parsedHeaders[c] != null && parsedHeaders[c] !== '' ? parsedHeaders[c] : `Header ${c + 1}`);
      } else {
        rowArr.push('');
      }
    }
    cells.push(rowArr);
  }

  const defaultColW = Math.max(64, Math.min(180, Math.round(440 / cols)));
  const colWidths = Array.isArray(p.colWidths) && p.colWidths.length === cols
    ? p.colWidths.map(w => Math.max(40, +w || defaultColW))
    : Array(cols).fill(defaultColW);

  return {
    rows,
    cols,
    cells,
    colWidths,
    rowHeight: Math.max(20, +p.rowHeight || 28),
    headerColor: p.headerColor || p.color || '#185abd',
    headerTextColor: p.headerTextColor || '#ffffff',
    textColor: p.textColor || '#0f172a',
    borderColor: p.borderColor || '#cbd5e1',
    zebraColor: p.zebraColor || '#f8fafc',
    zebra: p.zebra !== false,
    fontSize: Math.max(8, Math.min(28, +p.fontSize || 11)),
    fontFamily: p.fontFamily || 'Calibri',
    align: p.align || 'left',
    borderRadius: p.borderRadius != null ? +p.borderRadius : 8
  };
}

function renderTableToCanvas(specIn, scale = 4) {
  const spec = createTableSpec(specIn);
  const rows = spec.rows, cols = spec.cols;
  const colWidths = spec.colWidths;
  const rowH = spec.rowHeight || 28;
  const pad = 2;
  const tableW = colWidths.reduce((a, b) => a + b, 0);
  const tableH = rows * rowH;
  const wPt = tableW + pad * 2;
  const hPt = tableH + pad * 2;
  const rad = Math.max(0, Math.min(spec.borderRadius != null ? spec.borderRadius : 8, 16, tableW / 4, tableH / 4));

  const cv = document.createElement('canvas');
  cv.width = Math.max(16, Math.ceil(wPt * scale));
  cv.height = Math.max(16, Math.ceil(hPt * scale));
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);

  // Clip to smooth curved outer table boundary
  ctx.save();
  roundRectPath(ctx, pad, pad, tableW, tableH, rad);
  ctx.clip();

  let curY = pad;
  for (let r = 0; r < rows; r++) {
    let curX = pad;
    const isHdr = r === 0;
    const rowFill = isHdr
      ? (spec.headerColor || '#185abd')
      : (spec.zebra && r % 2 === 1 ? (spec.zebraColor || '#f8fafc') : '#ffffff');
    ctx.fillStyle = rowFill;
    ctx.fillRect(pad, curY, tableW, rowH);

    for (let c = 0; c < cols; c++) {
      const cw = colWidths[c];
      const cellTxt = (spec.cells[r] && spec.cells[r][c] != null) ? String(spec.cells[r][c]) : '';
      if (cellTxt) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(curX + 2, curY + 1, Math.max(1, cw - 4), rowH - 2);
        ctx.clip();
        ctx.fillStyle = isHdr ? (spec.headerTextColor || '#ffffff') : (spec.textColor || '#0f172a');
        const fs = spec.fontSize || 11;
        ctx.font = `${isHdr ? 'bold ' : ''}${fs}px ${cssFam(spec.fontFamily || 'Calibri')}`;
        ctx.textBaseline = 'middle';
        const al = spec.align || 'left';
        ctx.textAlign = al === 'center' ? 'center' : (al === 'right' ? 'right' : 'left');
        const tx = al === 'center' ? (curX + cw / 2) : (al === 'right' ? (curX + cw - 8) : (curX + 8));
        ctx.fillText(cellTxt, tx, curY + rowH / 2 + 0.5);
        ctx.restore();
      }
      curX += cw;
    }
    curY += rowH;
  }

  // Draw interior grid lines
  ctx.strokeStyle = spec.borderColor || '#cbd5e1';
  ctx.lineWidth = 1;
  let gx = pad;
  for (let c = 1; c < cols; c++) {
    gx += colWidths[c - 1];
    ctx.beginPath();
    ctx.moveTo(gx, pad);
    ctx.lineTo(gx, pad + tableH);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    const gy = pad + r * rowH;
    ctx.beginPath();
    ctx.moveTo(pad, gy);
    ctx.lineTo(pad + tableW, gy);
    ctx.stroke();
  }
  ctx.restore();

  // Smooth rounded outer border
  ctx.strokeStyle = spec.borderColor || '#94a3b8';
  ctx.lineWidth = 1.35;
  strokeRoundRect(ctx, pad, pad, tableW, tableH, rad);

  return { cv, wPt, hPt, spec };
}

function renderTableToDataUrl(specIn, scale = 4) {
  const { cv, wPt, hPt, spec } = renderTableToCanvas(specIn, scale);
  const dataUrl = cv.toDataURL('image/png');
  cv.width = 0;
  cv.height = 0;
  return { dataUrl, wPt, hPt, spec };
}

async function refreshTableAnnotationImage(ann) {
  if (!ann || !ann.tableSpec) return;
  const { dataUrl, wPt, hPt, spec } = renderTableToDataUrl(ann.tableSpec, 4);
  const im = await loadImg(dataUrl);
  ann.tableSpec = spec;
  ann.w = wPt;
  ann.h = hPt;
  ann.dataUrl = dataUrl;
  ann.img = im;
  overlay();
  updateDocInspector();
}

function hitTableCell(ann, px, py) {
  if (!ann || !ann.tableSpec) return null;
  const spec = ann.tableSpec;
  const pad = 2;
  const relX = px - ann.x - pad;
  const relY = py - ann.y - pad;
  const rowH = spec.rowHeight || 28;
  const row = Math.max(0, Math.min(spec.rows - 1, Math.floor(relY / rowH)));
  let accX = 0, col = 0;
  for (let c = 0; c < spec.cols; c++) {
    const cw = (spec.colWidths && spec.colWidths[c]) || 110;
    if (relX < accX + cw || c === spec.cols - 1) {
      col = c;
      break;
    }
    accX += cw;
  }
  return { row, col };
}

function syncInlineTableEditorStyle() {
  const stTbl = E.inlineTable;
  const box = $('#rp-inline-table-box');
  if (!stTbl || !box || !stTbl.ann || !stTbl.spec) return;
  const k = K();
  const spec = stTbl.spec;
  const leftPx = Math.round(stTbl.ann.x * k);
  const topPx = Math.round(stTbl.ann.y * k);
  box.style.left = leftPx + 'px';
  box.style.top = topPx + 'px';
  box.classList.toggle('flip-bar-below', topPx < 42);

  const tblEl = box.querySelector('.rp-inline-table-grid');
  if (tblEl) {
    tblEl.style.borderRadius = Math.max(4, Math.round((spec.borderRadius ?? 8) * k)) + 'px';
  }
  const scaledFs = Math.max(9.5, (spec.fontSize || 11) * k);
  const rowHPx = Math.max(20, Math.round((spec.rowHeight || 28) * k));
  box.querySelectorAll('tr[data-r]').forEach(tr => {
    const r = +tr.dataset.r;
    tr.style.height = rowHPx + 'px';
    const isHdr = r === 0;
    tr.style.background = isHdr
      ? (spec.headerColor || '#185abd')
      : (spec.zebra && r % 2 === 1 ? (spec.zebraColor || '#f8fafc') : '#ffffff');
  });
  box.querySelectorAll('input.rp-inline-cell-input').forEach(inp => {
    const r = +inp.dataset.r, c = +inp.dataset.c;
    const isHdr = r === 0;
    const cw = (spec.colWidths && spec.colWidths[c]) || 110;
    inp.style.width = Math.max(36, Math.round(cw * k)) + 'px';
    inp.style.height = rowHPx + 'px';
    inp.style.fontFamily = cssFam(spec.fontFamily || 'Calibri');
    inp.style.fontSize = scaledFs + 'px';
    inp.style.fontWeight = isHdr ? '700' : '400';
    inp.style.color = isHdr ? (spec.headerTextColor || '#ffffff') : (spec.textColor || '#0f172a');
    inp.style.textAlign = spec.align || 'left';
  });
}

function openInlineTableEditor(ann, focusRow = 0, focusCol = 0) {
  if (!ann || !ann.tableSpec) return null;
  if (E.inlineText) commitInlineTextEditor();
  if (E.inlineTable && E.inlineTable.ann !== ann) commitInlineTableEditor();
  const wrap = $('#ewrap');
  if (!wrap || !E.doc) return null;

  const origSpec = JSON.parse(JSON.stringify(ann.tableSpec));
  const workingSpec = createTableSpec(ann.tableSpec);
  ann._editingInline = true;
  E.sel = ann;
  overlay();

  E.inlineTable = {
    ann,
    origSpec,
    spec: workingSpec,
    activeRow: Math.max(0, Math.min(workingSpec.rows - 1, focusRow || 0)),
    activeCol: Math.max(0, Math.min(workingSpec.cols - 1, focusCol || 0))
  };

  let box = $('#rp-inline-table-box');
  if (box) box.remove();
  box = document.createElement('div');
  box.id = 'rp-inline-table-box';
  box.className = 'rp-inline-table-box';
  wrap.appendChild(box);

  box.addEventListener('pointerdown', ev => ev.stopPropagation());
  box.addEventListener('click', ev => ev.stopPropagation());
  box.addEventListener('dblclick', ev => ev.stopPropagation());

  const rebuildGridDOM = () => {
    if (!E.inlineTable) return;
    const sp = E.inlineTable.spec;
    const escAttr = v => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    box.innerHTML = `
      <div class="rp-inline-table-bar" id="rp-inline-table-drag">
        <span class="rp-inline-drag-lbl" title="Drag to reposition table on PDF page">⠿ Table (${sp.rows}×${sp.cols})</span>
        <button type="button" class="rp-inline-sym" data-tbl-act="add-row" title="Add Row Below">+Row</button>
        <button type="button" class="rp-inline-sym" data-tbl-act="del-row" title="Delete Active or Last Row">−Row</button>
        <button type="button" class="rp-inline-sym" data-tbl-act="add-col" title="Add Column Right">+Col</button>
        <button type="button" class="rp-inline-sym" data-tbl-act="del-col" title="Delete Active or Last Column">−Col</button>
        <input type="color" id="rp-inline-tbl-hdr-col" value="${escAttr(sp.headerColor || '#185abd')}" title="Header Fill Colour" style="width:22px;height:20px;padding:0;border:1px solid #64748b;border-radius:5px;cursor:pointer">
        <button type="button" class="rp-inline-sym" data-tbl-act="align" title="Cycle Cell Text Alignment (Left / Center / Right)">⇄ ${sp.align === 'center' ? 'Center' : sp.align === 'right' ? 'Right' : 'Left'}</button>
        <button type="button" class="rp-inline-sym" data-tbl-act="studio" title="Open Full Table Studio Modal" style="color:#93c5fd;font-weight:700">⊞ Studio</button>
        <button type="button" class="rp-inline-ok" id="rp-inline-tbl-ok" title="Apply Table Changes to PDF Page (Ctrl+Enter)">✓ Done</button>
        <button type="button" class="rp-inline-cancel" id="rp-inline-tbl-cancel" title="Cancel Edits (Esc)">✕</button>
      </div>
      <div class="rp-inline-table-grid">
        <table>
          <tbody>
            ${sp.cells.map((rowArr, r) => `
              <tr data-r="${r}">
                ${rowArr.map((val, c) => `
                  <td>
                    <input type="text" class="rp-inline-cell-input ${r === 0 ? 'is-header' : ''}"
                      data-r="${r}" data-c="${c}"
                      value="${escAttr(val)}"
                      placeholder="${r === 0 ? `Header ${c + 1}` : 'Type value...'}" />
                  </td>
                `).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    syncInlineTableEditorStyle();

    // Wire drag bar
    const dragBar = box.querySelector('#rp-inline-table-drag');
    let dragState = null;
    dragBar.addEventListener('pointerdown', ev => {
      if (ev.target.tagName === 'BUTTON' || ev.target.tagName === 'INPUT') return;
      ev.preventDefault();
      ev.stopPropagation();
      dragState = { sx: ev.clientX, sy: ev.clientY, ox: ann.x, oy: ann.y };
      dragBar.setPointerCapture(ev.pointerId);
    });
    dragBar.addEventListener('pointermove', ev => {
      if (!dragState || !E.inlineTable) return;
      ann.x = dragState.ox + (ev.clientX - dragState.sx) / K();
      ann.y = dragState.oy + (ev.clientY - dragState.sy) / K();
      syncInlineTableEditorStyle();
    });
    dragBar.addEventListener('pointerup', () => { dragState = null; });

    // Wire cell inputs
    box.querySelectorAll('input.rp-inline-cell-input').forEach(inp => {
      const r = +inp.dataset.r, c = +inp.dataset.c;
      inp.addEventListener('focus', () => {
        if (E.inlineTable) { E.inlineTable.activeRow = r; E.inlineTable.activeCol = c; }
      });
      inp.addEventListener('input', () => {
        if (E.inlineTable && E.inlineTable.spec.cells[r]) {
          E.inlineTable.spec.cells[r][c] = inp.value;
        }
      });
      inp.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          cancelInlineTableEditor();
        } else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault();
          ev.stopPropagation();
          commitInlineTableEditor();
        } else if (ev.key === 'Enter') {
          ev.preventDefault();
          ev.stopPropagation();
          const nextR = Math.min(sp.rows - 1, r + (ev.shiftKey ? -1 : 1));
          const target = box.querySelector(`input.rp-inline-cell-input[data-r="${Math.max(0, nextR)}"][data-c="${c}"]`);
          if (target) { target.focus(); target.select(); }
        } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
          ev.preventDefault();
          const nextR = Math.max(0, Math.min(sp.rows - 1, r + (ev.key === 'ArrowDown' ? 1 : -1)));
          const target = box.querySelector(`input.rp-inline-cell-input[data-r="${nextR}"][data-c="${c}"]`);
          if (target) { target.focus(); target.select(); }
        } else if (ev.key === 'Tab' && !ev.shiftKey && r === sp.rows - 1 && c === sp.cols - 1) {
          ev.preventDefault();
          // Tab on last cell automatically adds a new row!
          sp.rows++;
          sp.cells.push(Array(sp.cols).fill(''));
          E.inlineTable.activeRow = sp.rows - 1;
          E.inlineTable.activeCol = 0;
          rebuildGridDOM();
        }
      });
    });

    // Wire toolbar actions
    box.querySelectorAll('[data-tbl-act]').forEach(btn => {
      btn.onclick = ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const act = btn.dataset.tblAct;
        if (act === 'add-row') {
          const insAt = Math.min(sp.rows, (E.inlineTable.activeRow || (sp.rows - 1)) + 1);
          sp.cells.splice(insAt, 0, Array(sp.cols).fill(''));
          sp.rows = sp.cells.length;
          E.inlineTable.activeRow = insAt;
          rebuildGridDOM();
        } else if (act === 'del-row') {
          if (sp.rows <= 1) return st('Table must have at least 1 row.');
          const delAt = E.inlineTable.activeRow > 0 ? E.inlineTable.activeRow : sp.rows - 1;
          sp.cells.splice(delAt, 1);
          sp.rows = sp.cells.length;
          E.inlineTable.activeRow = Math.min(sp.rows - 1, delAt);
          rebuildGridDOM();
        } else if (act === 'add-col') {
          if (sp.cols >= 12) return st('Maximum 12 columns reached.');
          const insCol = Math.min(sp.cols, (E.inlineTable.activeCol ?? (sp.cols - 1)) + 1);
          sp.cells.forEach((rowArr, rIdx) => rowArr.splice(insCol, 0, rIdx === 0 ? `Header ${insCol + 1}` : ''));
          sp.colWidths.splice(insCol, 0, sp.colWidths[sp.colWidths.length - 1] || 100);
          sp.cols++;
          E.inlineTable.activeCol = insCol;
          rebuildGridDOM();
        } else if (act === 'del-col') {
          if (sp.cols <= 1) return st('Table must have at least 1 column.');
          const delCol = E.inlineTable.activeCol != null ? E.inlineTable.activeCol : sp.cols - 1;
          sp.cells.forEach(rowArr => rowArr.splice(delCol, 1));
          sp.colWidths.splice(delCol, 1);
          sp.cols--;
          E.inlineTable.activeCol = Math.min(sp.cols - 1, delCol);
          rebuildGridDOM();
        } else if (act === 'align') {
          const order = ['left', 'center', 'right'];
          sp.align = order[(order.indexOf(sp.align || 'left') + 1) % order.length];
          rebuildGridDOM();
        } else if (act === 'studio') {
          const targetAnn = ann;
          commitInlineTableEditor().then(() => openTableStudio(targetAnn));
        }
      };
    });

    const hdrColIn = box.querySelector('#rp-inline-tbl-hdr-col');
    if (hdrColIn) {
      hdrColIn.oninput = ev => {
        sp.headerColor = ev.target.value;
        syncInlineTableEditorStyle();
      };
    }

    box.querySelector('#rp-inline-tbl-ok').onclick = ev => {
      ev.preventDefault();
      ev.stopPropagation();
      commitInlineTableEditor();
    };
    box.querySelector('#rp-inline-tbl-cancel').onclick = ev => {
      ev.preventDefault();
      ev.stopPropagation();
      cancelInlineTableEditor();
    };

    const focusInp = box.querySelector(`input.rp-inline-cell-input[data-r="${E.inlineTable.activeRow}"][data-c="${E.inlineTable.activeCol}"]`)
      || box.querySelector('input.rp-inline-cell-input');
    if (focusInp) {
      setTimeout(() => { focusInp.focus(); focusInp.select(); }, 10);
    }
  };

  rebuildGridDOM();
  st('Editing Table Cells directly on PDF — type in any cell, press Tab/Arrows to navigate, or use +Row/+Col above.');
  return E.inlineTable;
}

async function commitInlineTableEditor() {
  const stTbl = E.inlineTable;
  if (!stTbl) return false;
  const box = $('#rp-inline-table-box');
  if (box) {
    box.querySelectorAll('input.rp-inline-cell-input').forEach(inp => {
      const r = +inp.dataset.r, c = +inp.dataset.c;
      if (stTbl.spec.cells[r]) stTbl.spec.cells[r][c] = inp.value;
    });
    box.remove();
  }
  const ann = stTbl.ann;
  const newSpec = stTbl.spec;
  const origJson = JSON.stringify(stTbl.origSpec);
  const newJson = JSON.stringify(newSpec);
  E.inlineTable = null;
  if (ann) {
    delete ann._editingInline;
    if (origJson !== newJson) {
      const prevSpec = ann.tableSpec;
      ann.tableSpec = stTbl.origSpec;
      pushAnnState('Edit table cells');
      ann.tableSpec = newSpec;
    } else {
      ann.tableSpec = newSpec;
    }
    await refreshTableAnnotationImage(ann);
    st(`Updated ${newSpec.rows}×${newSpec.cols} table on PDF page — click any cell anytime to edit.`);
  }
  return true;
}

function cancelInlineTableEditor() {
  const stTbl = E.inlineTable;
  const box = $('#rp-inline-table-box');
  if (box) box.remove();
  if (stTbl && stTbl.ann) {
    delete stTbl.ann._editingInline;
    stTbl.ann.tableSpec = stTbl.origSpec;
  }
  E.inlineTable = null;
  overlay();
  st('Cancelled table edit.');
}

function openTableStudio(existingAnn = null) {
  if (E.inlineTable) commitInlineTableEditor();
  document.querySelectorAll('.rp-modal:not(.rp-side-docked)').forEach(el => { if (el.id) el.hidden = true; else el.remove(); });
  let modal = $('#rp-table-modal');
  if (modal) modal.remove();

  const spec = createTableSpec(existingAnn && existingAnn.tableSpec ? JSON.parse(JSON.stringify(existingAnn.tableSpec)) : {
    rows: 4,
    cols: 4,
    headers: 'Parameter,Symbol,Value,Unit',
    headerColor: '#185abd'
  });

  modal = document.createElement('div');
  modal.id = 'rp-table-modal';
  modal.className = 'rp-modal';
  const escAttr = v => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  modal.innerHTML = `
    <div class="rp-card rp-wide" style="max-width:min(820px,95vw);gap:12px">
      <div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px">
        <div class="row" style="gap:8px">
          <span class="rp-launchpad-badge" style="margin:0"><i data-ic="table"></i><span>TABLE STUDIO</span></span>
          <h3 style="margin:0;font-size:15px">${existingAnn ? 'Edit Table Cells, Rows, Columns &amp; Style' : 'Insert &amp; Edit Interactive Table on PDF Page'}</h3>
        </div>
        <button type="button" class="rp-fmt-btn" id="tbl-close-top">✕</button>
      </div>

      <div class="row" style="gap:8px;flex-wrap:wrap;justify-content:space-between">
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <button type="button" class="rp-btn-sm" id="tbl-add-row">+ Add Row</button>
          <button type="button" class="rp-btn-sm" id="tbl-del-row">− Remove Row</button>
          <button type="button" class="rp-btn-sm" id="tbl-add-col">+ Add Column</button>
          <button type="button" class="rp-btn-sm" id="tbl-del-col">− Remove Column</button>
          <button type="button" class="rp-btn-sm" id="tbl-clear-cells" title="Clear all body cell text">Clear Cells</button>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <label class="f">Header Fill <input type="color" id="tbl-hdr-col" value="${escAttr(spec.headerColor)}" style="width:32px;height:24px"></label>
          <label class="f">Font Size <input type="number" id="tbl-fs" value="${spec.fontSize}" min="8" max="24" style="width:52px"></label>
          <label class="f">Align
            <select id="tbl-align" style="width:82px">
              <option value="left" ${spec.align === 'left' ? 'selected' : ''}>Left</option>
              <option value="center" ${spec.align === 'center' ? 'selected' : ''}>Center</option>
              <option value="right" ${spec.align === 'right' ? 'selected' : ''}>Right</option>
            </select>
          </label>
          <label class="chk"><input type="checkbox" id="tbl-zebra" ${spec.zebra ? 'checked' : ''}> Zebra Rows</label>
        </div>
      </div>

      <div class="rp-eq-preview-wrap" style="max-height:320px;overflow:auto;padding:10px">
        <small style="color:var(--mute);font-size:10.5px;margin-bottom:4px">Click any cell below to edit headers or values (press Tab / Enter to move between cells — you can also edit directly on the PDF page after placing):</small>
        <div id="tbl-studio-grid-wrap" style="overflow-x:auto"></div>
      </div>

      <div class="rp-btns" style="justify-content:space-between;margin-top:4px">
        <span style="font-size:11.5px;color:var(--mute)">Tip: Double-click or click any placed table on the PDF page anytime to edit cells in-place.</span>
        <div class="row" style="gap:8px">
          <button type="button" id="tbl-cancel-btn">Cancel</button>
          <button type="button" class="rp-primary" id="tbl-insert-btn">✓ ${existingAnn ? 'Update Table on PDF Page' : 'Insert Editable Table on PDF'}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  if (typeof hydrateIcons === 'function') hydrateIcons(modal);

  const gridWrap = modal.querySelector('#tbl-studio-grid-wrap');
  let activeR = spec.rows > 1 ? 1 : 0, activeC = 0;

  const renderModalGrid = () => {
    gridWrap.innerHTML = `
      <table class="btab rp-studio-edit-table" style="width:100%;border-collapse:separate;border-spacing:0;border-radius:10px;overflow:hidden">
        <tbody>
          ${spec.cells.map((rowArr, r) => `
            <tr>
              <td style="width:32px;text-align:center;font-size:10.5px;font-weight:700;color:var(--mute);background:var(--panel2);user-select:none">${r === 0 ? 'HDR' : r}</td>
              ${rowArr.map((val, c) => `
                <td style="padding:0;background:${r === 0 ? escAttr(spec.headerColor) : (spec.zebra && r % 2 === 1 ? '#f8fafc' : '#ffffff')}">
                  <input type="text" class="rp-modal-tbl-cell" data-r="${r}" data-c="${c}"
                    value="${escAttr(val)}"
                    placeholder="${r === 0 ? `Header ${c + 1}` : ''}"
                    style="width:100%;min-width:90px;height:30px;border:0;outline:none;padding:4px 8px;background:transparent;color:${r === 0 ? '#ffffff' : '#0f172a'};font-weight:${r === 0 ? '700' : '400'};text-align:${spec.align}" />
                </td>
              `).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    gridWrap.querySelectorAll('input.rp-modal-tbl-cell').forEach(inp => {
      const r = +inp.dataset.r, c = +inp.dataset.c;
      inp.onfocus = () => { activeR = r; activeC = c; };
      inp.oninput = () => { spec.cells[r][c] = inp.value; };
    });
  };

  modal.querySelector('#tbl-add-row').onclick = () => {
    spec.cells.push(Array(spec.cols).fill(''));
    spec.rows = spec.cells.length;
    renderModalGrid();
  };
  modal.querySelector('#tbl-del-row').onclick = () => {
    if (spec.rows <= 1) return;
    const idx = activeR > 0 && activeR < spec.rows ? activeR : spec.rows - 1;
    spec.cells.splice(idx, 1);
    spec.rows = spec.cells.length;
    activeR = Math.min(spec.rows - 1, activeR);
    renderModalGrid();
  };
  modal.querySelector('#tbl-add-col').onclick = () => {
    if (spec.cols >= 12) return;
    spec.cells.forEach((rowArr, r) => rowArr.push(r === 0 ? `Header ${spec.cols + 1}` : ''));
    spec.colWidths.push(spec.colWidths[spec.colWidths.length - 1] || 100);
    spec.cols++;
    renderModalGrid();
  };
  modal.querySelector('#tbl-del-col').onclick = () => {
    if (spec.cols <= 1) return;
    const idx = activeC >= 0 && activeC < spec.cols ? activeC : spec.cols - 1;
    spec.cells.forEach(rowArr => rowArr.splice(idx, 1));
    spec.colWidths.splice(idx, 1);
    spec.cols--;
    activeC = Math.min(spec.cols - 1, activeC);
    renderModalGrid();
  };
  modal.querySelector('#tbl-clear-cells').onclick = () => {
    for (let r = 1; r < spec.rows; r++) {
      for (let c = 0; c < spec.cols; c++) spec.cells[r][c] = '';
    }
    renderModalGrid();
  };
  modal.querySelector('#tbl-hdr-col').oninput = e => {
    spec.headerColor = e.target.value;
    renderModalGrid();
  };
  modal.querySelector('#tbl-fs').oninput = e => {
    spec.fontSize = Math.max(8, Math.min(24, +e.target.value || 11));
  };
  modal.querySelector('#tbl-align').onchange = e => {
    spec.align = e.target.value;
    renderModalGrid();
  };
  modal.querySelector('#tbl-zebra').onchange = e => {
    spec.zebra = e.target.checked;
    renderModalGrid();
  };

  const close = () => modal.remove();
  modal.onclick = e => { if (e.target === modal) close(); };
  modal.querySelector('#tbl-close-top').onclick = close;
  modal.querySelector('#tbl-cancel-btn').onclick = close;

  modal.querySelector('#tbl-insert-btn').onclick = async () => {
    close();
    if (existingAnn) {
      pushAnnState('Update table');
      existingAnn.tableSpec = spec;
      await refreshTableAnnotationImage(existingAnn);
      E.sel = existingAnn;
      st(`Updated ${spec.rows}×${spec.cols} table on PDF page — click any cell on the page to edit inline.`);
    } else {
      await ops.table({ ...spec, openInline: true });
    }
  };

  renderModalGrid();
  setTimeout(() => {
    const firstBody = gridWrap.querySelector('input.rp-modal-tbl-cell[data-r="1"][data-c="0"]') || gridWrap.querySelector('input.rp-modal-tbl-cell');
    if (firstBody) { firstBody.focus(); firstBody.select(); }
  }, 20);
}

window.RE = { applySecurityRedaction, signDocument, alignSelectedAnns, toggleSnapGrid, snapCoordToGrid, toggleLockSelectedAnn, exportCurrentPagePNG, createTableSpec, renderTableToCanvas, openInlineTableEditor, commitInlineTableEditor, cancelInlineTableEditor, openTableStudio, applySmoothZoomStep,  hitComment, commentBBox, findNoteNearPoint, showEditorNoteHover, RPNotePreview, openGDTBuilder, renderGDTFrameToCanvas, openBlockLibraryModal,  openEquationStudio, renderMathFormulaToCanvas, exprToPlainUnicode,  applyMSWordStylePreset, togglePdfTextListFormat,  reload, hit, hitAnnAt, eraseAtPoint, shouldShowContextualDock, updateContextualToolDock, applyEditorSizeValue, applyFontSizeValue, selInfo, copySel, setTool, overlay, editFromSelection, markFromSelection, editItems, itemsIn, selBoxes, itemAt, E, F, ui, doSave, runFind, redo, v2u, ops, commit, addAnn, dialog, openBytes, goto, reorder, undo, drawAnn, addNote, addMarkup, readComments, replyTo, toggleRes, delC, mutate, findAnnot, clearComments, renderComments, editC, setTab, updateDocInspector, loadCustomFontFile, duplicateSelectedAnn, bringSelToFront, sendSelToBack, openRichTextDialog, openInlineTextEditor, commitInlineTextEditor, cancelInlineTextEditor, clearEditorPageCache, wordAt, samplePdfTextColors, downsamplePreservingTrueColor, addOrderedSelectionItem, removeOrderedSelectionItem, moveOrderedSelectionItem, clearOrderedSelection, getOrderedSelectionText, copyOrderedSelection, applyOrderedWordsReplacements, editOrderedSelectionInOrder, markOrderedSelection, renderOrderedSelectionBar, syncEditorFloatingBars, toolDone, toolCancel, toolRewind, toolOff };
})();
