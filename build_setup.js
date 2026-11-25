/**
 * Kensho Pro 1.2.3.2 (Build O1R0A7N5G0E002026A1232) — Automated NSIS Setup Installer Builder (build_setup.js)
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
  const bases = [
    process.env.ELECTRON_BUILDER_CACHE || null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache') : null,
    process.env.APPDATA ? path.join(process.env.APPDATA, 'electron-builder', 'Cache') : null,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local', 'electron-builder', 'Cache') : null,
    home ? path.join(home, '.cache', 'electron-builder') : null,
    home ? path.join(home, 'Library', 'Caches', 'electron-builder') : null
  ].filter(Boolean);
  const roots = [];
  for (const b of bases) {
    roots.push(path.join(b, 'nsis'));
    roots.push(b);
    try {
      if (fs.existsSync(b)) {
        for (const ent of fs.readdirSync(b)) {
          if (ent.startsWith('nsis')) roots.push(path.join(b, ent));
        }
      }
    } catch (_) {}
  }
  return Array.from(new Set(roots));
}

function findInElectronBuilderCache() {
  const roots = getCacheRoots();
  for (const nsisRoot of roots) {
    try {
      if (!fs.existsSync(nsisRoot)) continue;
      const entries = fs.readdirSync(nsisRoot).sort().reverse();
      for (const entry of entries) {
        if (entry.startsWith('nsis-resources')) continue;
        const candidates = isWin
          ? [path.join(nsisRoot, entry, 'Bin', 'makensis.exe'), path.join(nsisRoot, entry, 'makensis.exe')]
          : [path.join(nsisRoot, entry, 'linux', 'makensis'), path.join(nsisRoot, entry, 'mac', 'makensis'), path.join(nsisRoot, entry, 'Bin', 'makensis'), path.join(nsisRoot, entry, 'makensis')];
        for (const c of candidates) {
          if (fs.existsSync(c)) return c;
        }
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
  const outExeName = 'KenshoPro-Setup-1.2.3.2.exe';
  const outExe = path.join(ROOT, 'dist', outExeName);
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  ensureWinUnpacked();
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'package_audit.js'), '--verify-dist', path.join('dist', 'win-unpacked'), '--fix'], { cwd: ROOT, stdio: 'inherit' });
  } catch (auditErr) {
    throw new Error('Packaging audit failed for dist/win-unpacked — aborting NSIS build.');
  }

  const makensisBin = ensureMakensis();
  if (makensisBin) {
    console.log(`[build_setup] Using makensis: ${makensisBin}`);
    try {
      const args = buildMakensisArgs(outExeName);
      const nsisEnv = { ...process.env };
      const binDir = path.dirname(makensisBin);
      const parentDir = path.resolve(binDir, '..');
      if (fs.existsSync(path.join(parentDir, 'Stubs'))) nsisEnv.NSISDIR = parentDir;
      else if (fs.existsSync(path.join(binDir, 'Stubs'))) nsisEnv.NSISDIR = binDir;
      execFileSync(makensisBin, args, { cwd: ROOT, stdio: 'inherit', env: nsisEnv });
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
