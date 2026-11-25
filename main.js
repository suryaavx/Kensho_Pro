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
app.commandLine.appendSwitch('js-flags', '--expose-gc --max-old-space-size=4096');
if (!process.argv.includes('--disable-gpu')) {
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('force_high_performance_gpu');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('enable-webgl');
  app.commandLine.appendSwitch('use-gl', 'angle');
  if (process.platform === 'win32') {
    // Native D3D11 (or Vulkan via --vulkan) for full-speed NVIDIA GeForce/RTX & AMD Radeon hardware acceleration
    if (process.argv.includes('--vulkan')) {
      app.commandLine.appendSwitch('use-angle', 'vulkan');
      app.commandLine.appendSwitch('enable-features', 'Vulkan,DefaultANGLEVulkan,VulkanFromANGLE');
    } else {
      app.commandLine.appendSwitch('use-angle', 'd3d11');
      app.commandLine.appendSwitch('enable-features', 'D3D11VideoDecoder,CanvasOopRasterization');
    }
  } else {
    // Native Vulkan on Linux (NVIDIA proprietary + AMD RADV/Mesa) with automatic OpenGL fallback
    app.commandLine.appendSwitch('use-angle', 'vulkan');
    app.commandLine.appendSwitch('enable-features', 'Vulkan,DefaultANGLEVulkan,VulkanFromANGLE,CanvasOopRasterization');
  }
}
app.commandLine.appendSwitch('disable-http-cache');
if (process.platform === 'linux') {
  // Security: Keep Chromium OS sandbox enabled by default on Linux.
  // Only allow opt-in disable when explicitly requested via env var in restricted CI/container sandboxes.
  if (process.env.KENSHO_ALLOW_NO_SANDBOX === '1') {
    app.commandLine.appendSwitch('no-sandbox');
  }
  if (typeof app.setDesktopName === 'function') {
    try {
      const _fsTmp = require('fs');
      const _deskName = _fsTmp.existsSync('/usr/share/applications/kensho-pro.desktop')
        ? 'kensho-pro.desktop'
        : 'in.textportdocx.kenshopro.desktop';
      app.setDesktopName(_deskName);
    } catch (e) {}
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

const HAS_SINGLE_INSTANCE_LOCK = TESTING || app.requestSingleInstanceLock();
if (!HAS_SINGLE_INSTANCE_LOCK) app.quit();
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
    authorizeFilePath(f, true);
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
  let allowSplashClose = false;
  const MANDATORY_SPLASH_MS = TESTING ? 0 : 15000;
  const splashShownAt = Date.now();
  if (!TESTING) {
    splashWin = new BrowserWindow({
      width: 480,
      height: 340,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      skipTaskbar: true,
      center: true,
      show: true,
      icon: path.join(__dirname, 'build', 'icon.png'),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, backgroundThrottling: false }
    });
    splashWin.on('close', (ev) => {
      if (!allowSplashClose) ev.preventDefault();
    });
    splashWin.loadFile(path.join(__dirname, 'splash.html')).catch(() => {});
    splashWin.on('closed', () => { splashWin = null; });
  }
  const closeSplashSafely = () => {
    allowSplashClose = true;
    if (splashWin && !splashWin.isDestroyed()) {
      try {
        if (typeof splashWin.setClosable === 'function') splashWin.setClosable(true);
        splashWin.destroy();
      } catch (_e) {
        try { splashWin.close(); } catch (_e2) {}
      }
    }
    splashWin = null;
  };
  win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 980, minHeight: 600, show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b100e' : '#f2f5f3', title: 'Kensho Pro',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js'), spellcheck: false }
  });
  win.setMenuBarVisibility(false);
  // Security: Lock down renderer navigation and route external http/https links to the OS browser
  const appIndexUrl = url.pathToFileURL(path.join(__dirname, 'index.html')).href.toLowerCase();
  win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (typeof targetUrl === 'string' && /^https?:\/\//i.test(targetUrl)) {
      shell.openExternal(targetUrl).catch(() => {});
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (ev, targetUrl) => {
    const clean = String(targetUrl || '').split('#')[0].split('?')[0].toLowerCase();
    if (clean !== appIndexUrl) {
      ev.preventDefault();
      if (typeof targetUrl === 'string' && /^https?:\/\//i.test(targetUrl)) {
        shell.openExternal(targetUrl).catch(() => {});
      }
    }
  });
  if (win.webContents && typeof win.webContents.setBackgroundThrottling === 'function') {
    win.webContents.setBackgroundThrottling(false);
  }
  let mainShown = false;
  let splashTimer = null;
  const finishShowMain = () => {
    if (mainShown) return;
    mainShown = true;
    if (splashTimer) { clearTimeout(splashTimer); splashTimer = null; }
    closeSplashSafely();
    if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  };
  const scheduleShowMainAfterMandatorySplash = () => {
    if (mainShown) return;
    const elapsed = Date.now() - splashShownAt;
    if (splashWin && elapsed < MANDATORY_SPLASH_MS) {
      if (!splashTimer) {
        splashTimer = setTimeout(finishShowMain, Math.max(0, MANDATORY_SPLASH_MS - elapsed));
      }
    } else {
      finishShowMain();
    }
  };
  win.once('ready-to-show', scheduleShowMainAfterMandatorySplash);
  if (TESTING) win.webContents.on('console-message', (e, l, msg, line, src) => { if (l >= 2) console.log('CONSOLE-ERR', String(msg).slice(0, 220), String(src).split('/').pop() + ':' + line); });
  win.webContents.once('did-finish-load', () => { if (!TESTING) handleArgs(process.argv); });
  let isClosingPromptOpen = false;
  win.on('close', async e => {
    if (force) return; e.preventDefault();
    if (isClosingPromptOpen) return;
    isClosingPromptOpen = true;
    try {
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
    } finally {
      if (!force) isClosingPromptOpen = false;
    }
  });
  win.on('closed', () => {
    if (splashTimer) { clearTimeout(splashTimer); splashTimer = null; }
    closeSplashSafely();
    win = null;
  });
  // native Cut / Copy / Paste menu for text boxes (Electron has none by default)
  win.webContents.on('context-menu', (e, p) => {
    if (!p.isEditable) return;
    Menu.buildFromTemplate([{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' }]).popup({ window: win });
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.once('did-finish-load', scheduleShowMainAfterMandatorySplash);
}
if (HAS_SINGLE_INSTANCE_LOCK) {
  app.whenReady().then(create);
}
app.on('window-all-closed', () => {
  try { const { session } = require('electron'); if (session && session.defaultSession) session.defaultSession.clearCache().catch(() => {}); } catch (e) {}
  clearTimeout(cmpT);
  setPowerSaveLock(false);
  try { app.releaseSingleInstanceLock(); } catch (e) {}
  if (process.platform !== 'darwin') {
    app.quit();
    setTimeout(() => { try { app.exit(0); } catch (e) {} }, 500).unref();
  }
});

// ---- MODULE 2: Centralized IPC Sender Authorization & Filesystem Access Control ----
const MAX_IPC_FILE_BYTES = 250 * 1024 * 1024; // 250 MB safety cap
const ALLOWED_ENG_EXT_RE = /\.(pdf|dxf|dwg|step|stp|sldprt|sldasm|slddrw|stl|obj|kensho3d|redline|gbr|ger|art|pho|top|bot|gtl|gbl|gbs|gts|gto|gbo|gtp|gbp|gko|gpb|gpt|gm\d+|gd\d+|gg\d+|g\d+|gp\d+|l\d+|ly\d+|cmp|sol|stc|sts|plc|pls|crc|crs|drl|xln|ncd|drd|exc|tap|rou|ipc|d356|net|txt|zip|png|jpe?g|bmp|gif|webp|svg|csv|json|html)$/i;
const BLOCKED_SYSTEM_PATH_RE = process.platform === 'win32'
  ? /^([a-z]:\\(windows|program files|program files \(x86\)|programdata\\microsoft)|.*\\(\.ssh|\.gnupg|\.aws)(\\|$))/i
  : /^(\/(etc|proc|sys|dev|boot|root|sbin|usr\/sbin)(\/|$)|.*\/(\.ssh|\.gnupg|\.aws)(\/|$))/i;

const authorizedReadPaths = new Set();
const authorizedWritePaths = new Set();
let _authPathsLoaded = false;

function normalizeAuthKey(rawP) {
  const clean = sanitizeFilePath(rawP);
  if (!clean) return '';
  const resolved = path.resolve(clean);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function getAuthStorePath() {
  try { return path.join(app.getPath('userData'), 'authorized-paths.json'); } catch (e) { return ''; }
}

function loadAuthorizedReadPathsOnce() {
  if (_authPathsLoaded) return;
  _authPathsLoaded = true;
  const store = getAuthStorePath();
  if (!store) return;
  try {
    if (fs.existsSync(store)) {
      const arr = JSON.parse(fs.readFileSync(store, 'utf8'));
      if (Array.isArray(arr)) {
        for (const item of arr.slice(-100)) {
          const k = normalizeAuthKey(item);
          if (k && !BLOCKED_SYSTEM_PATH_RE.test(k)) authorizedReadPaths.add(k);
        }
      }
    }
  } catch (e) {}
}

function persistAuthorizedReadPaths() {
  const store = getAuthStorePath();
  if (!store) return;
  try {
    const arr = Array.from(authorizedReadPaths).slice(-100);
    fs.mkdirSync(path.dirname(store), { recursive: true });
    fs.writeFileSync(store, JSON.stringify(arr));
  } catch (e) {}
}

function authorizeFilePath(rawP, allowWrite = false) {
  loadAuthorizedReadPathsOnce();
  const k = normalizeAuthKey(rawP);
  if (!k || BLOCKED_SYSTEM_PATH_RE.test(k)) return;
  authorizedReadPaths.add(k);
  if (allowWrite) authorizedWritePaths.add(k);
  persistAuthorizedReadPaths();
}

function isPathAuthorizedForRead(rawP) {
  loadAuthorizedReadPathsOnce();
  const k = normalizeAuthKey(rawP);
  if (!k || BLOCKED_SYSTEM_PATH_RE.test(k)) return false;
  if (!ALLOWED_ENG_EXT_RE.test(k)) return false;
  if (TD && k.startsWith(normalizeAuthKey(TD))) return true;
  return authorizedReadPaths.has(k);
}

function isPathAuthorizedForWrite(rawP) {
  loadAuthorizedReadPathsOnce();
  const k = normalizeAuthKey(rawP);
  if (!k || BLOCKED_SYSTEM_PATH_RE.test(k)) return false;
  if (!ALLOWED_ENG_EXT_RE.test(k)) return false;
  if (TD && k.startsWith(normalizeAuthKey(TD))) return true;
  return authorizedWritePaths.has(k);
}

function assertTrustedIpcSender(e) {
  if (!e || !e.sender || !win || win.isDestroyed()) {
    throw new Error('Unauthorized IPC sender: window unavailable.');
  }
  if (e.sender.id !== win.webContents.id) {
    throw new Error('Unauthorized IPC sender: webContents mismatch.');
  }
  const frame = e.senderFrame;
  if (!frame || (win.webContents.mainFrame && frame !== win.webContents.mainFrame)) {
    throw new Error('Unauthorized IPC sender: non-main frame blocked.');
  }
  const expectedUrl = url.pathToFileURL(path.join(__dirname, 'index.html')).href.toLowerCase();
  const frameUrl = String(frame.url || '').split('#')[0].split('?')[0].toLowerCase();
  if (frameUrl !== expectedUrl) {
    throw new Error('Unauthorized IPC sender: origin mismatch.');
  }
}

function toSafeBuffer(bytes) {
  if (!bytes || (typeof bytes.byteLength !== 'number' && typeof bytes.length !== 'number')) {
    throw new Error('Invalid binary payload.');
  }
  const len = typeof bytes.byteLength === 'number' ? bytes.byteLength : bytes.length;
  if (len > MAX_IPC_FILE_BYTES) {
    throw new Error('File exceeds maximum allowed size (250 MB).');
  }
  return Buffer.from(bytes);
}

const readOne = rawP => {
  const p = sanitizeFilePath(rawP);
  if (!p || BLOCKED_SYSTEM_PATH_RE.test(p)) throw new Error('Access denied to restricted path.');
  const st = fs.statSync(p);
  if (!st.isFile() || st.size > MAX_IPC_FILE_BYTES) throw new Error('File unavailable or exceeds 250 MB limit.');
  return { name: path.basename(p), path: p, bytes: new Uint8Array(fs.readFileSync(p)) };
};
ipcMain.handle('open-files', async (e, o = {}) => {
  assertTrustedIpcSender(e);
  const r = await dialog.showOpenDialog(win, { title: String(o.title || 'Open').slice(0, 120), properties: ['openFile', ...(o.multi ? ['multiSelections'] : [])], filters: Array.isArray(o.filters) ? o.filters : [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled) return [];
  const out = [];
  for (const p of r.filePaths) {
    try {
      authorizeFilePath(p, true);
      out.push(readOne(p));
    } catch (err) {}
  }
  return out;
});
ipcMain.handle('read-file', (e, p) => {
  assertTrustedIpcSender(e);
  if (typeof p !== 'string' || !isPathAuthorizedForRead(p)) return null;
  try { return readOne(p); } catch (x) { return null; }
});
ipcMain.handle('write-file', (e, payload) => {
  assertTrustedIpcSender(e);
  if (!payload || typeof payload.path !== 'string') throw new Error('Invalid write-file request.');
  const p = sanitizeFilePath(payload.path);
  if (!isPathAuthorizedForWrite(p)) throw new Error('Write access denied: save via Save As dialog first.');
  fs.writeFileSync(p, toSafeBuffer(payload.bytes));
  return p;
});
ipcMain.handle('save-file', async (e, payload) => {
  assertTrustedIpcSender(e);
  if (!payload || typeof payload !== 'object') throw new Error('Invalid save-file request.');
  const name = path.basename(String(payload.name || 'document.pdf'));
  const filters = Array.isArray(payload.filters) ? payload.filters : undefined;
  const buf = toSafeBuffer(payload.bytes);
  let p;
  if (TD) p = path.join(TD, name);
  else {
    const r = await dialog.showSaveDialog(win, { defaultPath: name, filters });
    if (r.canceled || !r.filePath) return null;
    p = r.filePath;
  }
  p = ensureSaveExtension(p, name, filters);
  if (BLOCKED_SYSTEM_PATH_RE.test(p)) throw new Error('Cannot save to restricted system directory.');
  fs.writeFileSync(p, buf);
  authorizeFilePath(p, true);
  return p;
});
ipcMain.handle('save-many', async (e, payload) => {
  assertTrustedIpcSender(e);
  const files = payload && Array.isArray(payload.files) ? payload.files : [];
  if (!files.length || files.length > 500) throw new Error('Invalid file batch.');
  let dir;
  if (TD) dir = TD;
  else { const r = await dialog.showOpenDialog(win, { title: 'Choose a folder to save the files in', properties: ['openDirectory', 'createDirectory'] }); if (r.canceled) return null; dir = r.filePaths[0]; }
  const resolvedDir = path.resolve(dir);
  if (BLOCKED_SYSTEM_PATH_RE.test(resolvedDir)) throw new Error('Cannot save to restricted system directory.');
  for (const f of files) {
    const safeName = path.basename(String(f.name || 'file'));
    const targetPath = path.resolve(resolvedDir, safeName);
    if (!targetPath.startsWith(resolvedDir + path.sep) && targetPath !== resolvedDir) {
      throw new Error('Invalid output filename: ' + safeName);
    }
    fs.writeFileSync(targetPath, toSafeBuffer(f.bytes));
    authorizeFilePath(targetPath, true);
  }
  return dir;
});
// ---- auto-save / crash recovery ----
const recDir = () => path.join(app.getPath('userData'), 'recovery');
function clearRecovery() { try { fs.rmSync(recDir(), { recursive: true, force: true }); } catch (e) {} }
ipcMain.handle('rec-write', (e, list) => {
  assertTrustedIpcSender(e);
  clearRecovery(); if (!Array.isArray(list) || !list.length) return 0; fs.mkdirSync(recDir(), { recursive: true });
  const meta = list.slice(0, 20).map((f, i) => {
    const file = 'r' + i + '.pdf';
    fs.writeFileSync(path.join(recDir(), file), toSafeBuffer(f.bytes));
    return { file, name: path.basename(String(f.name || file)), path: f.path || '', ann: f.ann || {}, meas: f.meas || {}, at: Date.now() };
  });
  fs.writeFileSync(path.join(recDir(), 'list.json'), JSON.stringify(meta)); return meta.length;
});
ipcMain.handle('rec-list', (e) => {
  assertTrustedIpcSender(e);
  try { return JSON.parse(fs.readFileSync(path.join(recDir(), 'list.json'), 'utf8')).map(m => ({ ...m, bytes: fs.readFileSync(path.join(recDir(), path.basename(m.file))) })); } catch (err) { return []; }
});
ipcMain.handle('rec-clear', (e) => { assertTrustedIpcSender(e); clearRecovery(); });
ipcMain.handle('pick-folder', async (e, titleOrOpts) => {
  assertTrustedIpcSender(e);
  const isObj = titleOrOpts && typeof titleOrOpts === 'object';
  const title = String(isObj ? (titleOrOpts.title || 'Select Folder') : (titleOrOpts || 'Select Folder')).slice(0, 120);
  const mode = isObj ? (titleOrOpts.mode || 'pdf') : (/cam|gerber/i.test(title) ? 'cam' : 'pdf');
  const r = await dialog.showOpenDialog(win, { title, properties: ['openDirectory'] }); if (r.canceled) return null;
  const dir = r.filePaths[0];
  const camRe = /\.(gbr|ger|art|pho|top|bot|gtl|gbl|gbs|gts|gto|gbo|gtp|gbp|gko|gpb|gpt|gm\d+|gd\d+|gg\d+|g\d+|gp\d+|l\d+|ly\d+|cmp|sol|stc|sts|plc|pls|crc|crs|drl|xln|ncd|drd|exc|tap|rou|ipc|d356|net)$/i;
  const entries = fs.readdirSync(dir)
    .filter(n => mode === 'cam' ? camRe.test(n) : (mode === 'all' ? (camRe.test(n) || /\.(pdf|dxf|dwg|step|stp|sldprt|sldasm|slddrw|stl|obj|kensho3d)$/i.test(n)) : (mode === 'dxf' ? /\.(dxf|dwg)$/i.test(n) : /\.pdf$/i.test(n))))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map(n => path.join(dir, n))
    .filter(full => { try { return fs.statSync(full).isFile(); } catch (err) { return false; } });
  for (const full of entries) authorizeFilePath(full, false);
  return { dir, files: entries };
});
// ---- MODULE 3: Conversion Resource Quotas & Concurrency Limits ----
const MAX_CONVERSION_INPUT_BYTES = 250 * 1024 * 1024;
const MAX_CONVERSION_OUTPUT_BYTES = 250 * 1024 * 1024;
const MAX_CONCURRENT_CONVERSIONS = 2;
let activeConversions = 0;

function readVerifiedConversionOutput(filePath) {
  const st = fs.statSync(filePath);
  if (!st.isFile() || st.size <= 0) throw new Error('Converted output file is empty.');
  if (st.size > MAX_CONVERSION_OUTPUT_BYTES) throw new Error('Converted output exceeds 250 MB safety limit.');
  return new Uint8Array(fs.readFileSync(filePath));
}

ipcMain.handle('convert-dwg-to-dxf', async (e, payload = {}) => {
  assertTrustedIpcSender(e);
  if (activeConversions >= MAX_CONCURRENT_CONVERSIONS) {
    return { ok: false, error: 'Too many conversions running concurrently. Please wait for the current conversion to finish.' };
  }
  activeConversions++;
  const { path: rawP, bytes, name } = payload || {};
  const osMod = require('os');
  const { execFileSync } = require('child_process');
  const tmpRoot = fs.mkdtempSync(path.join(osMod.tmpdir(), 'kensho_dwg_'));
  const inDir = path.join(tmpRoot, 'in');
  const outDir = path.join(tmpRoot, 'out');
  fs.mkdirSync(inDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  try {
    const baseName = path.basename(String(name || rawP || 'drawing.dwg').replace(/\.dwg$/i, '') + '.dwg').replace(/[^A-Za-z0-9._ -]/g, '_');
    const inFile = path.join(inDir, baseName);
    if (bytes && bytes.length) {
      if (bytes.length > MAX_CONVERSION_INPUT_BYTES) return { ok: false, error: 'Input DWG exceeds 250 MB safety limit.' };
      fs.writeFileSync(inFile, Buffer.from(bytes));
    } else if (rawP && isPathAuthorizedForRead(rawP) && fs.existsSync(sanitizeFilePath(rawP))) {
      const cleanP = sanitizeFilePath(rawP);
      if (fs.statSync(cleanP).size > MAX_CONVERSION_INPUT_BYTES) return { ok: false, error: 'Input DWG exceeds 250 MB safety limit.' };
      fs.copyFileSync(cleanP, inFile);
    } else return { ok: false, error: 'Source DWG file could not be read or is not authorized.' };

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
        return { ok: true, converter: 'dwg2dxf', name: baseName.replace(/\.dwg$/i, '.dxf'), bytes: readVerifiedConversionOutput(outDxf) };
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
        return { ok: true, converter: 'ODAFileConverter', name: baseName.replace(/\.dwg$/i, '.dxf'), bytes: readVerifiedConversionOutput(outDxf) };
      }
    }

    return {
      ok: false,
      error: 'AutoCAD .dwg requires a local offline converter (ODA File Converter or LibreDWG dwg2dxf) on your computer, or save the file as ASCII/Binary .dxf in AutoCAD.'
    };
  } catch (err) {
    recordMainDiagnostic('convert-dwg-to-dxf', err);
    return { ok: false, error: 'DWG conversion failed safely. Please check the file or export as .dxf.' };
  } finally {
    activeConversions = Math.max(0, activeConversions - 1);
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (err) {}
  }
});
ipcMain.handle('convert-solidworks-to-step', async (e, payload = {}) => {
  assertTrustedIpcSender(e);
  if (activeConversions >= MAX_CONCURRENT_CONVERSIONS) {
    return { ok: false, error: 'Too many conversions running concurrently. Please wait for the current conversion to finish.' };
  }
  activeConversions++;
  const { path: rawP, bytes, name } = payload || {};
  const osMod = require('os');
  const { execFileSync } = require('child_process');
  const tmpRoot = fs.mkdtempSync(path.join(osMod.tmpdir(), 'kensho_sw_'));
  try {
    const rawExt = path.extname(String(name || rawP || 'part.sldprt')).toLowerCase();
    const ext = /^\.(sldprt|sldasm|slddrw)$/.test(rawExt) ? rawExt : '.sldprt';
    const base = path.basename(String(name || rawP || 'part.sldprt'), rawExt || ext).replace(/[^A-Za-z0-9._ -]/g, '_');
    const inFile = path.join(tmpRoot, base + ext);
    const outFile = path.join(tmpRoot, base + '.step');
    const cleanRawP = rawP ? sanitizeFilePath(rawP) : '';
    if (bytes && bytes.length) {
      if (bytes.length > MAX_CONVERSION_INPUT_BYTES) return { ok: false, error: 'Input SolidWorks file exceeds 250 MB safety limit.' };
      fs.writeFileSync(inFile, Buffer.from(bytes));
    } else if (cleanRawP && isPathAuthorizedForRead(cleanRawP) && fs.existsSync(cleanRawP)) {
      if (fs.statSync(cleanRawP).size > MAX_CONVERSION_INPUT_BYTES) return { ok: false, error: 'Input SolidWorks file exceeds 250 MB safety limit.' };
      fs.copyFileSync(cleanRawP, inFile);
    } else return { ok: false, error: 'No authorized SolidWorks input file provided.' };

    // 1. Try local FreeCAD headless CLI (freecadcmd) if installed
    const fcBins = ['freecadcmd', 'FreeCADCmd', '/usr/bin/freecadcmd', 'C:\\Program Files\\FreeCAD 0.21\\bin\\FreeCADCmd.exe'];
    const pyScript = path.join(tmpRoot, 'conv.py');
    fs.writeFileSync(pyScript, `import Import, FreeCAD\ndoc = FreeCAD.newDocument()\nImport.insert(${JSON.stringify(inFile)}, doc.Name)\nImport.export(doc.Objects, ${JSON.stringify(outFile)})\n`);
    for (const bin of fcBins) {
      try {
        execFileSync(bin, [pyScript], { timeout: 25000, stdio: 'ignore' });
        if (fs.existsSync(outFile)) {
          return { ok: true, name: base + '.step', bytes: readVerifiedConversionOutput(outFile), converter: 'FreeCAD' };
        }
      } catch (_e) {}
    }

    // 2. Try SolidWorks COM automation on Windows if SolidWorks is installed
    if (process.platform === 'win32') {
      try {
        const swDocType = /^\.sldasm$/i.test(ext) ? 2 : (/^\.slddrw$/i.test(ext) ? 3 : 1);
        const ps = `$sw = New-Object -ComObject SldWorks.Application; $err=0; $warn=0; $doc = $sw.OpenDoc6('${inFile.replace(/'/g, "''")}', ${swDocType}, 1, '', [ref]$err, [ref]$warn); if ($doc) { $doc.Extension.SaveAs('${outFile.replace(/'/g, "''")}', 0, 1, $null, [ref]$err, [ref]$warn) | Out-Null; $sw.CloseDoc($doc.GetTitle()); }`;
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 30000, stdio: 'ignore' });
        if (fs.existsSync(outFile)) {
          return { ok: true, name: base + '.step', bytes: readVerifiedConversionOutput(outFile), converter: 'SolidWorks COM' };
        }
      } catch (_e) {}
    }
    return { ok: false, error: 'Binary SolidWorks (.sldprt/.sldasm) conversion requires SolidWorks or FreeCAD installed locally, or export your part as STEP (.step/.stp) for instant native loading.' };
  } catch (err) {
    recordMainDiagnostic('convert-solidworks-to-step', err);
    return { ok: false, error: 'SolidWorks conversion failed safely. Export your part as STEP (.step/.stp) for native loading.' };
  } finally {
    activeConversions = Math.max(0, activeConversions - 1);
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_e) {}
  }
});

ipcMain.handle('copy-text', (e, text) => {
  assertTrustedIpcSender(e);
  try {
    if (clipboard && typeof clipboard.writeText === 'function') {
      clipboard.writeText(String(text || '').slice(0, 2000000));
      return true;
    }
  } catch (err) {}
  return false;
});
ipcMain.handle('mtime', (e, p) => {
  assertTrustedIpcSender(e);
  if (typeof p !== 'string' || !isPathAuthorizedForRead(p)) return 0;
  try { return fs.statSync(sanitizeFilePath(p)).mtimeMs; } catch (x) { return 0; }
});
ipcMain.handle('get-gpu-info', async (e) => {
  assertTrustedIpcSender(e);
  try {
    const features = typeof app.getGPUFeatureStatus === 'function' ? app.getGPUFeatureStatus() : {};
    const basic = typeof app.getGPUInfo === 'function' ? await app.getGPUInfo('basic') : {};
    return { ok: true, backend: 'OpenGL (ANGLE)', features, basic };
  } catch (err) {
    return { ok: false, error: 'Unable to query GPU info.' };
  }
});
ipcMain.handle('quit', (e) => { assertTrustedIpcSender(e); if (win && !win.isDestroyed()) win.close(); else app.quit(); });
ipcMain.handle('reveal', (e, p) => {
  assertTrustedIpcSender(e);
  if (typeof p !== 'string' || !isPathAuthorizedForRead(p)) return false;
  shell.showItemInFolder(sanitizeFilePath(p));
  return true;
});
ipcMain.handle('open-url', async (e, rawUrl) => {
  assertTrustedIpcSender(e);
  if (typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    await shell.openExternal(parsed.href);
    return true;
  } catch (err) {
    return false;
  }
});

// ---- MODULE 4: SSRF-Hardened Update Endpoint & Strict Manifest Schema ----
const APPROVED_UPDATE_HOSTS = new Set([
  'kensho.textportdocx.in',
  'textportdocx.in',
  'www.textportdocx.in',
  'kenshostudio.com',
  'updates.kenshostudio.com',
  'api.github.com',
  'github.com',
  'raw.githubusercontent.com'
]);

function isPrivateOrLocalHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  return false;
}

function validateApprovedUpdateUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch (e) { return null; }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.port && parsed.port !== '443') return null;
  if (parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase();
  if (isPrivateOrLocalHost(host) || !APPROVED_UPDATE_HOSTS.has(host)) return null;
  return parsed.href;
}

function validateUpdateManifest(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const ver = typeof data.version === 'string' ? data.version.trim() : '';
  if (!/^\d+\.\d+\.\d+(\.\d+)?([+-][A-Za-z0-9._-]+)?$/.test(ver)) return null;
  const safe = { version: ver };
  if (typeof data.notes === 'string') safe.notes = data.notes.slice(0, 4000);
  if (typeof data.releaseDate === 'string') safe.releaseDate = data.releaseDate.slice(0, 64);
  const dlRaw = data.downloadUrl || data.url;
  if (typeof dlRaw === 'string' && dlRaw.trim()) {
    const validDl = validateApprovedUpdateUrl(dlRaw.trim());
    if (!validDl) return null;
    safe.downloadUrl = validDl;
    safe.url = validDl;
  }
  return safe;
}

ipcMain.handle('check-update', async (e, manifestUrl) => {
  assertTrustedIpcSender(e);
  const requested = (typeof manifestUrl === 'string' && manifestUrl.trim())
    ? manifestUrl.trim()
    : 'https://kensho.textportdocx.in/version.json';
  const targetUrl = validateApprovedUpdateUrl(requested);
  if (!targetUrl) {
    return { ok: false, error: 'Blocked unapproved update endpoint (HTTPS on approved Kensho Studio host required).' };
  }
  return new Promise(resolve => {
    try {
      const httpsMod = require('https');
      const appVer = '1.2.3.2+O1R0A7N5G0E002026A1232';
      const req = httpsMod.get(targetUrl + (targetUrl.includes('?') ? '&' : '?') + '_t=' + Date.now(), {
        timeout: 5500,
        headers: { 'User-Agent': 'KenshoPro-Updater/' + appVer, 'Accept': 'application/json' }
      }, res => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const validRedir = validateApprovedUpdateUrl(res.headers.location);
          resolve({ ok: false, status: res.statusCode, error: validRedir ? 'redirect_not_followed' : 'blocked_unapproved_redirect' });
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
            const parsed = JSON.parse(raw);
            const validated = validateUpdateManifest(parsed);
            if (!validated) {
              resolve({ ok: false, error: 'Update manifest failed schema validation.' });
              return;
            }
            resolve({ ok: true, data: validated });
          } catch (err) {
            resolve({ ok: false, error: 'Invalid JSON in version.json' });
          }
        });
      });
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
      req.on('error', () => { resolve({ ok: false, error: 'network_error' }); });
    } catch (err) {
      resolve({ ok: false, error: 'update_check_failed' });
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
