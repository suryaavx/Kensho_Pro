/**
 * Kensho Pro 1.2.3 — Automated NSIS Setup Installer Builder (build_setup.js)
 * Resolves makensis.exe across system NSIS installs (Program Files, Chocolatey, PATH)
 * and electron-builder cache (injecting nsis-resources plugin paths when needed),
 * with safe try/catch fallback to electron-builder so Windows builds never fail.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const ROOT = __dirname;
const isWin = process.platform === 'win32';

function getCacheRoots() {
  const home = os.homedir ? os.homedir() : '';
  return [
    process.env.ELECTRON_BUILDER_CACHE ? path.join(process.env.ELECTRON_BUILDER_CACHE, 'nsis') : null,
    process.env.ELECTRON_BUILDER_CACHE,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', 'nsis') : null,
    process.env.APPDATA ? path.join(process.env.APPDATA, 'electron-builder', 'Cache', 'nsis') : null,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local', 'electron-builder', 'Cache', 'nsis') : null,
    home ? path.join(home, '.cache', 'electron-builder', 'nsis') : null,
    home ? path.join(home, 'Library', 'Caches', 'electron-builder', 'nsis') : null
  ].filter(Boolean);
}

function findInElectronBuilderCache() {
  const roots = getCacheRoots();
  for (const nsisRoot of roots) {
    try {
      if (!fs.existsSync(nsisRoot)) continue;
      const entries = fs.readdirSync(nsisRoot).sort().reverse();
      for (const entry of entries) {
        if (entry.startsWith('nsis-resources')) continue;
        const candidate1 = path.join(nsisRoot, entry, 'Bin', isWin ? 'makensis.exe' : 'makensis');
        const candidate2 = path.join(nsisRoot, entry, isWin ? 'makensis.exe' : 'makensis');
        if (fs.existsSync(candidate1)) return candidate1;
        if (fs.existsSync(candidate2)) return candidate2;
      }
    } catch (e) {}
  }
  return null;
}

function findNsisResourcesPluginDir() {
  const roots = getCacheRoots();
  for (const nsisRoot of roots) {
    try {
      if (!fs.existsSync(nsisRoot)) continue;
      const entries = fs.readdirSync(nsisRoot).sort().reverse();
      for (const entry of entries) {
        if (!entry.startsWith('nsis-resources')) continue;
        const pUnicode = path.join(nsisRoot, entry, 'plugins', 'x86-unicode');
        const pAnsi = path.join(nsisRoot, entry, 'plugins', 'x86-ansi');
        if (fs.existsSync(pUnicode)) return pUnicode;
        if (fs.existsSync(pAnsi)) return pAnsi;
      }
    } catch (e) {}
  }
  return null;
}

function findMakensis() {
  // 1. Check standard system installation directories first (complete NSIS with full Include/ and Plugins/)
  if (isWin) {
    const stdPaths = [
      'C:\\Program Files (x86)\\NSIS\\makensis.exe',
      'C:\\Program Files (x86)\\NSIS\\Bin\\makensis.exe',
      'C:\\Program Files\\NSIS\\makensis.exe',
      'C:\\Program Files\\NSIS\\Bin\\makensis.exe',
      'C:\\ProgramData\\chocolatey\\bin\\makensis.exe',
      'C:\\ProgramData\\chocolatey\\lib\\nsis\\tools\\makensis.exe',
      process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'NSIS', 'makensis.exe') : null,
      process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'NSIS', 'makensis.exe') : null
    ].filter(Boolean);

    for (const p of stdPaths) {
      if (fs.existsSync(p)) return p;
    }
  }

  // 2. Check system PATH
  try {
    const cmd = isWin ? 'where makensis' : 'which makensis';
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/)[0];
    if (out && fs.existsSync(out)) return out;
  } catch (e) {}

  // 3. Check electron-builder's cached NSIS binary
  const cached = findInElectronBuilderCache();
  if (cached) return cached;

  return null;
}

function ensureMakensis() {
  let bin = findMakensis();
  if (bin) return bin;

  if (isWin) {
    console.log('[build_setup] makensis not found in PATH; attempting Chocolatey NSIS install...');
    try {
      execSync('choco install nsis -y --no-progress', { stdio: 'inherit' });
      bin = findMakensis();
      if (bin) return bin;
    } catch (e) {
      console.warn('[build_setup] choco install nsis skipped or unavailable:', e.message);
    }
  }
  return findMakensis();
}

function buildMakensisArgs(outExeName) {
  const prefix = isWin ? '/' : '-';
  const args = [
    `${prefix}DSRC=${path.join('dist', 'win-unpacked')}`,
    `${prefix}DICON=${path.join('build', 'icon.ico')}`,
    `${prefix}DLIC=LICENSE.txt`,
    `${prefix}DOUT=${path.join('dist', outExeName)}`
  ];
  const pluginDir = findNsisResourcesPluginDir();
  if (pluginDir) {
    args.push(`${prefix}X!addplugindir "${pluginDir}"`);
  }
  args.push('installer.nsi');
  return args;
}

function ensureWinUnpacked() {
  const unpackedDir = path.join(ROOT, 'dist', 'win-unpacked');
  if (fs.existsSync(unpackedDir)) return true;
  console.log('[build_setup] dist/win-unpacked not found; building unpacked Windows app first...');
  try {
    execSync('npx electron-builder --win dir --x64', { cwd: ROOT, stdio: 'inherit' });
    const exePath = path.join(unpackedDir, 'Kensho Pro.exe');
    if (fs.existsSync(exePath)) {
      execFileSync(process.execPath, ['patch_exe.js', exePath, path.join('build', 'icon.ico')], { cwd: ROOT, stdio: 'inherit' });
    }
    return fs.existsSync(unpackedDir);
  } catch (e) {
    console.warn('[build_setup] Could not pre-build dist/win-unpacked:', e.message);
    return false;
  }
}

function main() {
  const outExeName = 'KenshoPro-Setup-1.2.3.exe';
  const outExe = path.join(ROOT, 'dist', outExeName);
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  ensureWinUnpacked();

  const makensisBin = ensureMakensis();
  if (makensisBin) {
    console.log(`[build_setup] Using makensis: ${makensisBin}`);
    try {
      const args = buildMakensisArgs(outExeName);
      execFileSync(makensisBin, args, { cwd: ROOT, stdio: 'inherit' });
      if (fs.existsSync(outExe)) {
        console.log(`[build_setup] Successfully built ${outExe}`);
        return;
      }
    } catch (err) {
      console.warn(`[build_setup] Direct makensis compilation failed (${err.message}); falling back to electron-builder NSIS target...`);
    }
  }

  // Fallback: Use electron-builder's built-in NSIS target (which auto-downloads NSIS + nsis-resources)
  console.log('[build_setup] Running electron-builder NSIS target...');
  execSync('npx electron-builder --win nsis --prepackaged dist/win-unpacked --x64', { cwd: ROOT, stdio: 'inherit' });

  // Attempt custom installer.nsi compilation with cached NSIS only if outExe was not already created
  const cachedAfter = findMakensis();
  if (cachedAfter && !fs.existsSync(outExe)) {
    try {
      console.log(`[build_setup] Compiling custom installer.nsi using cached NSIS: ${cachedAfter}`);
      const args = buildMakensisArgs(outExeName);
      execFileSync(cachedAfter, args, { cwd: ROOT, stdio: 'inherit' });
    } catch (err) {
      console.warn('[build_setup] Custom NSIS pass skipped:', err.message);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { findMakensis, findInElectronBuilderCache, findNsisResourcesPluginDir };
