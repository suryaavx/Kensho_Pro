/* ============================================================================
 * [MODULE SECTION: ELECTRON MAIN PROCESS, CLI ROUTER & NATIVE IPC BRIDGE (main.js)]
 * WHAT THIS IS: Manages the native desktop BrowserWindow, single-instance CLI file
 *   routing (`--compare`, `--edit`, `--dxf`, `--cam`), crash recovery, and file I/O handlers.
 * WHY / HOW TO EDIT: Add new `ipcMain.handle(...)` endpoints here and expose them
 *   in `preload.js` and `pre.js` when adding native OS capabilities.
 * ============================================================================ */
const { app, BrowserWindow, Menu, nativeTheme, dialog, ipcMain, shell, powerSaveBlocker, clipboard } = require('electron');

// Disable all renderer and timer throttling when minimized / occluded
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('js-flags', '--expose-gc');
app.commandLine.appendSwitch('disable-http-cache');
if (process.platform === 'linux') {
  // Ensure portable AppImage, tar.gz, and Ubuntu 24.04+ unprivileged userns environments launch cleanly
  app.commandLine.appendSwitch('no-sandbox');
  if (typeof app.setDesktopName === 'function') {
    try { app.setDesktopName('in.textportdocx.kenshopro.desktop'); } catch (e) {}
  }
}
const fs = require('fs');
const path = require('path');
const url = require('url');
const TD = process.env.REDLINE_TEST_DIR; // test hook: skip dialogs and write here
const TESTING = !!(TD || process.env.REDLINE_SELFTEST);
let win, force = false;

// ---- MODULE 1: Global Main Process Crash & Unhandled Rejection Boundaries ----
const diagnosticLog = [];
function recordMainDiagnostic(kind, errOrReason) {
  const ts = new Date().toISOString();
  const detail = (errOrReason && (errOrReason.stack || errOrReason.message))
    ? String(errOrReason.stack || errOrReason.message)
    : String(errOrReason);
  const entry = `[${ts}] [${kind}] ${detail}`;
  diagnosticLog.push(entry);
  if (diagnosticLog.length > 100) diagnosticLog.shift();

  if (!TESTING && !force && app && typeof app.isReady === 'function' && app.isReady()) {
    try {
      const choice = dialog.showMessageBoxSync(win && !win.isDestroyed() ? win : null, {
        type: 'warning',
        title: 'Kensho Pro System Notice',
        message: 'An unexpected operation occurred and was safely contained.',
        detail: 'Your workspace remains active. Would you like to copy diagnostic details to the clipboard?',
        buttons: ['Continue', 'Copy Diagnostic Details'],
        defaultId: 0,
        cancelId: 0
      });
      if (choice === 1 && clipboard && typeof clipboard.writeText === 'function') {
        clipboard.writeText(diagnosticLog.join('\n\n'));
      }
    } catch (e) {}
  }
}
process.on('uncaughtException', (err) => {
  recordMainDiagnostic('uncaughtException', err);
});
process.on('unhandledRejection', (reason) => {
  recordMainDiagnostic('unhandledRejection', reason);
});

// ---- MODULE 5: Safe File Paths & Extension Preservation ----
function sanitizeFilePath(rawPath, baseDir) {
  if (typeof rawPath !== 'string') return '';
  let cleaned = rawPath.trim().replace(/^["']+|["']+$/g, '');
  if (!cleaned || cleaned.startsWith('-')) return '';
  if (/^file:\/\//i.test(cleaned)) {
    try {
      cleaned = url.fileURLToPath(cleaned);
    } catch (e) {
      cleaned = decodeURIComponent(cleaned.replace(/^file:\/\/(localhost)?/i, ''));
    }
  }
  if (baseDir && !path.isAbsolute(cleaned)) {
    cleaned = path.resolve(baseDir, cleaned);
  }
  return path.normalize(cleaned);
}
function ensureSaveExtension(filePath, defaultName, filters) {
  if (!filePath) return filePath;
  const cleanP = sanitizeFilePath(filePath);
  const curExt = path.extname(cleanP);
  if (curExt) return cleanP;
  const defExt = defaultName ? path.extname(String(defaultName)) : '';
  if (defExt) return cleanP + defExt;
  if (Array.isArray(filters) && filters[0] && Array.isArray(filters[0].extensions) && filters[0].extensions[0]) {
    const ext = String(filters[0].extensions[0]).replace(/^\./, '');
    if (ext && ext !== '*') return `${cleanP}.${ext}`;
  }
  return cleanP;
}

if (!TESTING && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (e, argv, workingDir) => {
  if (force || !win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  handleArgs(argv, workingDir);
});
// Explorer / Linux File Manager "Compare with Kensho Pro": first file goes to A, the next one (within 5 s) to B
let cmpN = 0, cmpT = null;
function sendViewMode(viewMode) {
  try {
    if (!win || win.isDestroyed()) return;
    const safeV = viewMode === 'edit' ? 'edit' : (viewMode === 'dxf' ? 'dxf' : 'compare');
    const isCam = viewMode === 'cam';
    const run = () => {
      if (win && !win.isDestroyed()) {
        win.webContents.executeJavaScript(
          `window.setView && window.setView('${safeV}');` +
          (isCam ? `setTimeout(() => { const b = document.querySelector('[data-tab="tab-cad"], [data-rib-tab="cam"]'); if (b) b.click(); }, 80);` : '')
        ).catch(() => {});
      }
    };
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', run);
    else run();
  } catch (e) {}
}

function handleArgs(argv, baseDir) {
  const args = argv || [];
  const wantsEdit = args.some(a => /^--(view=edit|edit|studio)$/i.test(String(a || '').trim()));
  const wantsDxf = args.some(a => /^--(view=dxf|dxf)$/i.test(String(a || '').trim()));
  const wantsCam = args.some(a => /^--(view=cam|cam)$/i.test(String(a || '').trim()));
  const wantsCompare = args.some(a => /^--(view=compare|compare|batch-ci)$/i.test(String(a || '').trim()));
  const isBatchCI = args.some(a => /^--batch-ci$/i.test(String(a || '').trim()));
  if (wantsEdit) sendViewMode('edit');
  else if (wantsDxf) sendViewMode('dxf');
  else if (wantsCam) sendViewMode('cam');
  else if (wantsCompare) sendViewMode('compare');

  const files = args.slice(1)
    .map(a => sanitizeFilePath(a, baseDir))
    .filter(a => a && /\.(pdf|dxf|dwg|step|stp|sldprt|sldasm|slddrw|stl|obj|kensho3d|gbr|ger|art|pho|top|bot|gtl|gbl|gbs|gts|gto|gbo|gtp|gbp|gko|gpb|gpt|gm\d+|gd\d+|gg\d+|g\d+|gp\d+|l\d+|ly\d+|cmp|sol|stc|sts|plc|pls|crc|crs|drl|xln|ncd|drd|exc|tap|rou|ipc|d356|net|zip|kensho|redline|png|jpe?g|webp|bmp)$/i.test(a) && fs.existsSync(a));
  if (!files.length) return;
  if (wantsCompare && !wantsEdit) {
    files.forEach(f => { sendOpen(f, cmpN % 2 ? 'B' : 'A'); cmpN++; clearTimeout(cmpT); cmpT = setTimeout(() => cmpN = 0, 5000); });
    if (isBatchCI && win && !win.isDestroyed()) {
      setTimeout(() => {
        win.webContents.executeJavaScript('window.UIRibbon && window.UIRibbon.exportQAPackageZip && window.UIRibbon.exportQAPackageZip()').catch(() => {});
      }, 2500);
    }
  }
  else files.forEach(f => sendOpen(f));
}

function sendOpen(rawFile, slot) {
  try {
    if (!win || win.isDestroyed()) return;
    const f = sanitizeFilePath(rawFile);
    if (!f || !fs.existsSync(f)) return;
    const b64 = fs.readFileSync(f).toString('base64');
    const payload = JSON.stringify({ name: path.basename(f), path: f, b64, slot })
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    const run = () => {
      if (win && !win.isDestroyed()) {
        win.webContents.executeJavaScript(`window.openExternal && window.openExternal(${payload})`).catch(() => {});
      }
    };
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', run);
    else run();
  } catch (e) { /* unreadable file: ignore */ }
}

function create() {
  // Keep native Edit roles active for <input>/<textarea> Ctrl+Z/Y/X/C/V/A while hiding the OS menu bar
  const editMenu = Menu.buildFromTemplate([
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    }
  ]);
  Menu.setApplicationMenu(editMenu);
  let splashWin = null;
  const splashShownAt = Date.now();
  if (!TESTING) {
    splashWin = new BrowserWindow({
      width: 520,
      height: 320,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      center: true,
      show: true,
      icon: path.join(__dirname, 'build', 'icon.png'),
      webPreferences: { contextIsolation: true, nodeIntegration: false }
    });
    splashWin.loadFile(path.join(__dirname, 'splash.html')).catch(() => {});
    splashWin.on('closed', () => { splashWin = null; });
  }
  const closeSplashSafely = () => {
    if (splashWin && !splashWin.isDestroyed()) {
      try { splashWin.close(); } catch (_e) {}
    }
    splashWin = null;
  };
  win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 980, minHeight: 600, show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b100e' : '#f2f5f3', title: 'Kensho Pro',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js'), spellcheck: false }
  });
  win.setMenuBarVisibility(false);
  if (win.webContents && typeof win.webContents.setBackgroundThrottling === 'function') {
    win.webContents.setBackgroundThrottling(false);
  }
  win.once('ready-to-show', () => {
    const elapsed = Date.now() - splashShownAt;
    const minDisplayMs = TESTING ? 0 : 650;
    const finishShow = () => {
      closeSplashSafely();
      if (win && !win.isDestroyed()) win.show();
    };
    if (splashWin && elapsed < minDisplayMs) setTimeout(finishShow, minDisplayMs - elapsed);
    else finishShow();
  });
  if (TESTING) win.webContents.on('console-message', (e, l, msg, line, src) => { if (l >= 2) console.log('CONSOLE-ERR', String(msg).slice(0, 220), String(src).split('/').pop() + ':' + line); });
  win.webContents.on('did-finish-load', () => { if (!TESTING) handleArgs(process.argv); });
  win.on('close', async e => {
    if (force) return; e.preventDefault();
    let dirty = false;
    try {
      dirty = await Promise.race([
        win.webContents.executeJavaScript('!!(window.isDirty && window.isDirty())'),
        new Promise(res => setTimeout(() => res(false), 450))
      ]);
    } catch (x) {}
    if (!dirty) {
      force = true;
      clearRecovery();
      setPowerSaveLock(false);
      try {
        await Promise.race([
          win.webContents.executeJavaScript('window.__kenshoCleanupOnClose && window.__kenshoCleanupOnClose()'),
          new Promise(res => setTimeout(res, 250))
        ]);
      } catch (x) {}
      if (win && !win.isDestroyed()) win.close();
      return;
    }
    const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Cancel', 'Close without saving'], defaultId: 0, cancelId: 0, title: 'Unsaved changes', message: 'You have unsaved changes.', detail: 'If you close now they will be lost.' });
    if (r.response === 1) {
      force = true;
      clearRecovery();
      setPowerSaveLock(false);
      try {
        await Promise.race([
          win.webContents.executeJavaScript('window.__kenshoCleanupOnClose && window.__kenshoCleanupOnClose()'),
          new Promise(res => setTimeout(res, 250))
        ]);
      } catch (x) {}
      if (win && !win.isDestroyed()) win.close();
    }
  });
  win.on('closed', () => { win = null; });
  // Route all external http/https window.open and navigation attempts to the OS default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      e.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });
  // native Cut / Copy / Paste menu for text boxes (Electron has none by default)
  win.webContents.on('context-menu', (e, p) => {
    if (!p.isEditable) return;
    Menu.buildFromTemplate([{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' }]).popup({ window: win });
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.once('did-finish-load', () => { if (win && !win.isDestroyed() && !win.isVisible()) win.show(); });
}
app.whenReady().then(create);
app.on('window-all-closed', () => {
  clearTimeout(cmpT);
  setPowerSaveLock(false);
  try { app.releaseSingleInstanceLock(); } catch (e) {}
  if (process.platform !== 'darwin') {
    app.quit();
    setTimeout(() => { try { app.exit(0); } catch (e) {} }, 500).unref();
  }
});

const readOne = rawP => {
  const p = sanitizeFilePath(rawP);
  return { name: path.basename(p), path: p, bytes: new Uint8Array(fs.readFileSync(p)) };
};
ipcMain.handle('open-files', async (e, o = {}) => {
  const r = await dialog.showOpenDialog(win, { title: o.title || 'Open', properties: ['openFile', ...(o.multi ? ['multiSelections'] : [])], filters: o.filters || [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled) return [];
  const out = [];
  for (const p of r.filePaths) { try { out.push(readOne(p)); } catch (err) {} }
  return out;
});
ipcMain.handle('read-file', (e, p) => { try { return readOne(p); } catch (x) { return null; } });
ipcMain.handle('write-file', (e, { path: rawP, bytes }) => {
  const p = sanitizeFilePath(rawP);
  fs.writeFileSync(p, Buffer.from(bytes));
  return p;
});
ipcMain.handle('save-file', async (e, { name, bytes, filters }) => {
  let p;
  if (TD) p = path.join(TD, name);
  else {
    const r = await dialog.showSaveDialog(win, { defaultPath: name, filters });
    if (r.canceled || !r.filePath) return null;
    p = r.filePath;
  }
  p = ensureSaveExtension(p, name, filters);
  fs.writeFileSync(p, Buffer.from(bytes));
  return p;
});
ipcMain.handle('save-many', async (e, { files }) => {
  let dir;
  if (TD) dir = TD;
  else { const r = await dialog.showOpenDialog(win, { title: 'Choose a folder to save the files in', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled) return null; dir = r.filePaths[0]; }
  for (const f of files) fs.writeFileSync(path.join(dir, f.name), Buffer.from(f.bytes));
  return dir;
});
// ---- auto-save / crash recovery ----
const recDir = () => path.join(app.getPath('userData'), 'recovery');
function clearRecovery() { try { fs.rmSync(recDir(), { recursive: true, force: true }); } catch (e) {} }
ipcMain.handle('rec-write', (e, list) => {
  clearRecovery(); if (!list || !list.length) return 0; fs.mkdirSync(recDir(), { recursive: true });
  const meta = list.map((f, i) => {
    const file = 'r' + i + '.pdf';
    fs.writeFileSync(path.join(recDir(), file), Buffer.from(f.bytes));
    return { file, name: f.name, path: f.path, ann: f.ann || {}, meas: f.meas || {}, at: Date.now() };
  });
  fs.writeFileSync(path.join(recDir(), 'list.json'), JSON.stringify(meta)); return meta.length;
});
ipcMain.handle('rec-list', () => {
  try { return JSON.parse(fs.readFileSync(path.join(recDir(), 'list.json'), 'utf8')).map(m => ({ ...m, bytes: fs.readFileSync(path.join(recDir(), m.file)) })); } catch (e) { return []; }
});
ipcMain.handle('rec-clear', () => clearRecovery());
ipcMain.handle('pick-folder', async (e, titleOrOpts) => {
  const isObj = titleOrOpts && typeof titleOrOpts === 'object';
  const title = isObj ? (titleOrOpts.title || 'Select Folder') : (titleOrOpts || 'Select Folder');
  const mode = isObj ? (titleOrOpts.mode || 'pdf') : (/cam|gerber/i.test(String(title)) ? 'cam' : 'pdf');
  const r = await dialog.showOpenDialog(win, { title, properties: ['openDirectory'] }); if (r.canceled) return null;
  const dir = r.filePaths[0];
  const camRe = /\.(gbr|ger|art|pho|top|bot|gtl|gbl|gbs|gts|gto|gbo|gtp|gbp|gko|gpb|gpt|gm\d+|gd\d+|gg\d+|g\d+|gp\d+|l\d+|ly\d+|cmp|sol|stc|sts|plc|pls|crc|crs|drl|xln|ncd|drd|exc|tap|rou|ipc|d356|net)$/i;
  const entries = fs.readdirSync(dir)
    .filter(n => mode === 'cam' ? camRe.test(n) : (mode === 'all' ? (camRe.test(n) || /\.(pdf|dxf|dwg|step|stp|sldprt|sldasm|slddrw|stl|obj|kensho3d)$/i.test(n)) : (mode === 'dxf' ? /\.(dxf|dwg)$/i.test(n) : /\.pdf$/i.test(n))))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map(n => path.join(dir, n))
    .filter(full => { try { return fs.statSync(full).isFile(); } catch (err) { return false; } });
  return { dir, files: entries };
});
ipcMain.handle('convert-dwg-to-dxf', async (e, { path: rawP, bytes, name }) => {
  const osMod = require('os');
  const { execFileSync } = require('child_process');
  const tmpRoot = fs.mkdtempSync(path.join(osMod.tmpdir(), 'kensho_dwg_'));
  const inDir = path.join(tmpRoot, 'in');
  const outDir = path.join(tmpRoot, 'out');
  fs.mkdirSync(inDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  try {
    const baseName = path.basename(String(name || rawP || 'drawing.dwg').replace(/\.dwg$/i, '') + '.dwg');
    const inFile = path.join(inDir, baseName);
    if (bytes && bytes.length) fs.writeFileSync(inFile, Buffer.from(bytes));
    else if (rawP && fs.existsSync(sanitizeFilePath(rawP))) fs.copyFileSync(sanitizeFilePath(rawP), inFile);
    else return { ok: false, error: 'Source DWG file could not be read.' };

    const outDxf = path.join(outDir, baseName.replace(/\.dwg$/i, '.dxf'));
    const tryBin = (bin, args) => {
      try {
        execFileSync(bin, args, { stdio: 'ignore', timeout: 30000, windowsHide: true });
        if (fs.existsSync(outDxf)) return true;
        const found = fs.readdirSync(outDir).find(f => /\.dxf$/i.test(f));
        if (found) { fs.renameSync(path.join(outDir, found), outDxf); return true; }
      } catch (err) {}
      return false;
    };

    // 1. Try LibreDWG dwg2dxf (Linux/Windows/macOS PATH)
    const dwg2dxfBins = process.platform === 'win32'
      ? ['dwg2dxf.exe', 'dwg2dxf', 'C:\\Program Files\\LibreDWG\\dwg2dxf.exe']
      : ['dwg2dxf', '/usr/bin/dwg2dxf', '/usr/local/bin/dwg2dxf', '/opt/homebrew/bin/dwg2dxf'];
    for (const bin of dwg2dxfBins) {
      if (tryBin(bin, ['-o', outDxf, inFile])) {
        return { ok: true, converter: 'dwg2dxf', name: baseName.replace(/\.dwg$/i, '.dxf'), bytes: new Uint8Array(fs.readFileSync(outDxf)) };
      }
    }

    // 2. Try ODA File Converter (Windows/Linux/macOS standard install locations)
    const odaBins = [];
    if (process.platform === 'win32') {
      const pfRoots = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']].filter(Boolean);
      for (const pf of pfRoots) {
        const odaRoot = path.join(pf, 'ODA');
        if (fs.existsSync(odaRoot)) {
          try {
            for (const sub of fs.readdirSync(odaRoot)) {
              const cand = path.join(odaRoot, sub, 'ODAFileConverter.exe');
              if (fs.existsSync(cand)) odaBins.push(cand);
            }
          } catch (err) {}
        }
      }
      odaBins.push('ODAFileConverter.exe');
    } else {
      odaBins.push('ODAFileConverter', '/usr/bin/ODAFileConverter', '/usr/local/bin/ODAFileConverter', '/Applications/ODAFileConverter.app/Contents/MacOS/ODAFileConverter');
    }
    for (const bin of odaBins) {
      if (tryBin(bin, [inDir, outDir, 'ACAD2018', 'DXF', '0', '1', baseName])) {
        return { ok: true, converter: 'ODAFileConverter', name: baseName.replace(/\.dwg$/i, '.dxf'), bytes: new Uint8Array(fs.readFileSync(outDxf)) };
      }
    }

    return {
      ok: false,
      error: 'AutoCAD .dwg requires a local offline converter (ODA File Converter or LibreDWG dwg2dxf) on your computer, or save the file as ASCII/Binary .dxf in AutoCAD.'
    };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (err) {}
  }
});
ipcMain.handle('convert-solidworks-to-step', async (e, { path: rawP, bytes, name }) => {
  const osMod = require('os');
  const { execFileSync } = require('child_process');
  const tmpRoot = fs.mkdtempSync(path.join(osMod.tmpdir(), 'kensho_sw_'));
  try {
    const ext = path.extname(String(name || rawP || 'part.sldprt')) || '.sldprt';
    const base = path.basename(String(name || rawP || 'part.sldprt'), ext);
    const inFile = path.join(tmpRoot, base + ext);
    const outFile = path.join(tmpRoot, base + '.step');
    if (bytes && bytes.length) fs.writeFileSync(inFile, Buffer.from(bytes));
    else if (rawP && fs.existsSync(rawP)) fs.copyFileSync(rawP, inFile);
    else return { ok: false, error: 'No SolidWorks input file provided.' };

    // 1. Try local FreeCAD headless CLI (freecadcmd) if installed
    const fcBins = ['freecadcmd', 'FreeCADCmd', '/usr/bin/freecadcmd', 'C:\\Program Files\\FreeCAD 0.21\\bin\\FreeCADCmd.exe'];
    const pyScript = path.join(tmpRoot, 'conv.py');
    fs.writeFileSync(pyScript, `import Import, FreeCAD\ndoc = FreeCAD.newDocument()\nImport.insert(${JSON.stringify(inFile)}, doc.Name)\nImport.export(doc.Objects, ${JSON.stringify(outFile)})\n`);
    for (const bin of fcBins) {
      try {
        execFileSync(bin, [pyScript], { timeout: 25000, stdio: 'ignore' });
        if (fs.existsSync(outFile)) {
          return { ok: true, name: base + '.step', bytes: new Uint8Array(fs.readFileSync(outFile)), converter: 'FreeCAD' };
        }
      } catch (_e) {}
    }

    // 2. Try SolidWorks COM automation on Windows if SolidWorks is installed
    if (process.platform === 'win32') {
      try {
        const ps = `$sw = New-Object -ComObject SldWorks.Application; $err=0; $warn=0; $doc = $sw.OpenDoc6('${inFile.replace(/'/g, "''")}', 1, 1, '', [ref]$err, [ref]$warn); if ($doc) { $doc.Extension.SaveAs('${outFile.replace(/'/g, "''")}', 0, 1, $null, [ref]$err, [ref]$warn) | Out-Null; $sw.CloseDoc($doc.GetTitle()); }`;
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 30000, stdio: 'ignore' });
        if (fs.existsSync(outFile)) {
          return { ok: true, name: base + '.step', bytes: new Uint8Array(fs.readFileSync(outFile)), converter: 'SolidWorks COM' };
        }
      } catch (_e) {}
    }
    return { ok: false, error: 'Binary SolidWorks (.sldprt/.sldasm) conversion requires SolidWorks or FreeCAD installed locally, or export your part as STEP (.step/.stp) for instant native loading.' };
  } finally {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_e) {}
  }
});

ipcMain.handle('copy-text', (e, text) => {
  try {
    if (clipboard && typeof clipboard.writeText === 'function') {
      clipboard.writeText(String(text || ''));
      return true;
    }
  } catch (err) {}
  return false;
});
ipcMain.handle('mtime', (e, p) => { try { return fs.statSync(p).mtimeMs; } catch (x) { return 0; } });
ipcMain.handle('quit', () => { win.close(); });
ipcMain.handle('reveal', (e, p) => { shell.showItemInFolder(p); });
ipcMain.handle('open-url', async (e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle('check-update', async (e, manifestUrl) => {
  const targetUrl = (typeof manifestUrl === 'string' && /^https?:\/\//i.test(manifestUrl))
    ? manifestUrl
    : 'https://kensho.textportdocx.in/version.json';
  return new Promise(resolve => {
    try {
      const httpsMod = targetUrl.startsWith('https') ? require('https') : require('http');
      const req = httpsMod.get(targetUrl + (targetUrl.includes('?') ? '&' : '?') + '_t=' + Date.now(), {
        timeout: 5500,
        headers: { 'User-Agent': 'KenshoPro-Updater/1.1.0', 'Accept': 'application/json' }
      }, res => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve({ ok: false, status: res.statusCode, redirect: res.headers.location });
          res.resume();
          return;
        }
        if (res.statusCode !== 200) {
          resolve({ ok: false, status: res.statusCode });
          res.resume();
          return;
        }
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { if (raw.length < 65536) raw += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            resolve({ ok: true, data });
          } catch (err) {
            resolve({ ok: false, error: 'Invalid JSON in version.json' });
          }
        });
      });
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
      req.on('error', err => { resolve({ ok: false, error: err.message || 'network_error' }); });
    } catch (err) {
      resolve({ ok: false, error: err.message || 'exception' });
    }
  });
});

// ---- Background execution lock (powerSaveBlocker) & Windows Taskbar Progress ----
let psbId = null;
function setPowerSaveLock(active) {
  try {
    if (active) {
      if (psbId == null || !powerSaveBlocker.isStarted(psbId)) {
        psbId = powerSaveBlocker.start('prevent-app-suspension');
      }
    } else if (psbId != null) {
      if (powerSaveBlocker.isStarted(psbId)) powerSaveBlocker.stop(psbId);
      psbId = null;
    }
  } catch (e) {}
  return psbId != null;
}

function updateTaskbarProgress(frac) {
  try {
    if (!win || win.isDestroyed()) return;
    if (frac == null || frac < 0) {
      win.setProgressBar(-1);
      setPowerSaveLock(false);
    } else {
      const clamped = Math.max(0, Math.min(1, Number(frac) || 0));
      win.setProgressBar(clamped);
      setPowerSaveLock(clamped < 1);
    }
  } catch (e) {}
}

ipcMain.handle('set-progress', (e, frac) => { updateTaskbarProgress(frac); return true; });
ipcMain.handle('set-busy-lock', (e, active) => setPowerSaveLock(!!active));
ipcMain.on('set-progress', (e, frac) => updateTaskbarProgress(frac));
ipcMain.on('set-busy-lock', (e, active) => setPowerSaveLock(!!active));
app.on('will-quit', () => setPowerSaveLock(false));

// Test hook (used only for automated checks): run a script in the page, print the result, save a screenshot, quit.
if (process.env.REDLINE_SELFTEST) app.whenReady().then(() => setTimeout(async () => {
  try {
    const r = await win.webContents.executeJavaScript(fs.readFileSync(process.env.REDLINE_SELFTEST, 'utf8'));
    console.log('SELFTEST', JSON.stringify(r));
    if (process.env.REDLINE_SHOT) fs.writeFileSync(process.env.REDLINE_SHOT, (await win.webContents.capturePage()).toPNG());
  } catch (e) { console.log('SELFTEST-ERROR', e.message); }
  force = true; app.quit();
}, 1500));
