#!/usr/bin/env node
/**
 * Kensho Pro — Automated Packaging Auditor & Auto-Fixer (package_audit.js)
 *
 * Guarantees that ZERO runtime or installer files go missing during Windows/Linux packaging.
 *
 * Usage:
 *   node package_audit.js                        # Pre-build audit (read-only)
 *   node package_audit.js --fix                  # Pre-build audit + auto-fix package.json build.files/extraResources/asarUnpack
 *   node package_audit.js --verify-dist <dir>    # Post-pack audit of dist/win-unpacked or dist/linux-unpacked (reads app.asar header)
 *   node package_audit.js --verify-dist <dir> --fix  # Post-pack audit + auto-copy missing extraResources into unpacked dir
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

function normalizeRel(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

/**
 * Dynamically discovers every file referenced at runtime by HTML, main/preload, and worker modules.
 */
function discoverRequiredRuntimeFiles(rootDir = ROOT) {
  const required = new Set([
    'package.json',
    'main.js',
    'preload.js',
    'index.html',
    'splash.html',
    'style.css',
    'version.json',
    'LICENSE.txt',
    'worker.js',
    'lib/pdf.min.js',
    'lib/pdf.worker.min.js',
    'lib/pdf-lib.min.js',
    'build/icon.png',
    'build/icon.ico',
    'build/logo.png',
    'build/linux/in.textportdocx.kenshopro.xml',
    'build/linux/after-install.sh',
    'build/linux/after-remove.sh',
    'install-linux.sh',
    'rust_memory/Cargo.toml',
    'rust_memory/src/lib.rs'
  ]);

  // 1. Scan HTML files for <script src>, <link href>, <img src>
  for (const htmlFile of ['index.html', 'splash.html']) {
    const full = path.join(rootDir, htmlFile);
    if (!fs.existsSync(full)) continue;
    const html = fs.readFileSync(full, 'utf8');
    const attrRe = /(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi;
    let m;
    while ((m = attrRe.exec(html)) !== null) {
      const ref = normalizeRel(m[1].trim());
      if (!ref || /^(https?:|data:|mailto:|javascript:|blob:)/i.test(ref)) continue;
      required.add(ref);
    }
  }

  // 2. Scan main/preload/renderer entry JS files for Worker(), workerSrc, loadFile(), path.join(__dirname, ...)
  for (const jsFile of ['main.js', 'preload.js', 'worker_engine.js', 'app.js', 'editor.js']) {
    const full = path.join(rootDir, jsFile);
    if (!fs.existsSync(full)) continue;
    const src = fs.readFileSync(full, 'utf8');

    const workerRe = /new\s+Worker\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = workerRe.exec(src)) !== null) required.add(normalizeRel(m[1]));

    const pdfWorkerRe = /workerSrc\s*=\s*['"]([^'"]+)['"]/g;
    while ((m = pdfWorkerRe.exec(src)) !== null) required.add(normalizeRel(m[1]));

    const dirJoinRe = /path\.join\(\s*__dirname\s*,([^)]+)\)/g;
    while ((m = dirJoinRe.exec(src)) !== null) {
      const segs = [];
      const segRe = /['"]([^'"]+)['"]/g;
      let sm;
      while ((sm = segRe.exec(m[1])) !== null) segs.push(sm[1]);
      if (segs.length && !m[1].includes('${')) {
        const joined = normalizeRel(segs.join('/'));
        if (joined && !joined.startsWith('..') && !joined.startsWith('dist/')) {
          required.add(joined);
        }
      }
    }
  }

  return Array.from(required).sort();
}

/**
 * Checks whether a relative path is matched by package.json build.files entries.
 */
function isCoveredByBuildFiles(relPath, buildFiles) {
  const norm = normalizeRel(relPath);
  for (const rawEntry of (buildFiles || [])) {
    if (typeof rawEntry !== 'string') continue;
    if (rawEntry.startsWith('!')) continue;
    const entry = normalizeRel(rawEntry);
    if (entry === norm) return true;
    if (entry.endsWith('/**')) {
      const prefix = entry.slice(0, -3);
      if (norm === prefix || norm.startsWith(prefix + '/')) return true;
    } else if (entry.endsWith('/*')) {
      const prefix = entry.slice(0, -2);
      if (norm.startsWith(prefix + '/') && !norm.slice(prefix.length + 1).includes('/')) return true;
    }
  }
  return false;
}

/**
 * Pure Node.js ASAR header reader (parses Chromium Pickle header + JSON file tree).
 * Returns a Set of normalized relative file paths stored inside app.asar.
 */
function readAsarFileList(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  try {
    const headerSizeBuf = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, headerSizeBuf, 0, 16, 0);
    if (bytesRead < 16) throw new Error('Invalid ASAR archive (header truncated)');
    // Chromium Pickle layout:
    // [0..3]: size pickle payload size (4)
    // [4..7]: header pickle size
    // [8..11]: header pickle payload size
    // [12..15]: JSON string byte length
    const jsonLen = headerSizeBuf.readUInt32LE(12);
    if (!jsonLen || jsonLen > 64 * 1024 * 1024) {
      throw new Error(`Invalid ASAR header JSON length: ${jsonLen}`);
    }
    const jsonBuf = Buffer.alloc(jsonLen);
    fs.readSync(fd, jsonBuf, 0, jsonLen, 16);
    const header = JSON.parse(jsonBuf.toString('utf8'));
    const files = new Set();
    const walk = (node, prefix) => {
      if (!node || typeof node !== 'object' || !node.files) return;
      for (const [name, child] of Object.entries(node.files)) {
        const cur = prefix ? `${prefix}/${name}` : name;
        if (child && child.files) walk(child, cur);
        else files.add(normalizeRel(cur));
      }
    };
    walk(header, '');
    return files;
  } finally {
    fs.closeSync(fd);
  }
}

function collectFilesRecursive(dir, baseDir = dir, out = new Set()) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFilesRecursive(full, baseDir, out);
    else out.add(normalizeRel(path.relative(baseDir, full)));
  }
  return out;
}

/**
 * Pre-build audit: checks disk presence, package.json build.files / asarUnpack / extraResources,
 * and auto-fixes package.json when fix=true.
 */
function runPreBuildAudit(options = {}) {
  const rootDir = options.rootDir || ROOT;
  const fix = !!options.fix;
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const required = discoverRequiredRuntimeFiles(rootDir);

  const missingOnDisk = [];
  const emptyOnDisk = [];
  const missingInBuildFiles = [];
  const fixesApplied = [];

  for (const rel of required) {
    const full = path.join(rootDir, rel);
    if (!fs.existsSync(full)) {
      missingOnDisk.push(rel);
      continue;
    }
    const st = fs.statSync(full);
    if (st.isFile() && st.size === 0) {
      emptyOnDisk.push(rel);
    }
    if (!isCoveredByBuildFiles(rel, pkg.build && pkg.build.files)) {
      missingInBuildFiles.push(rel);
    }
  }

  let pkgDirty = false;
  if (!pkg.build) pkg.build = {};
  if (!Array.isArray(pkg.build.files)) pkg.build.files = [];

  if (fix && missingInBuildFiles.length) {
    // Insert missing entries before exclusion patterns ("!...")
    const firstNegIdx = pkg.build.files.findIndex(f => typeof f === 'string' && f.startsWith('!'));
    const insertAt = firstNegIdx === -1 ? pkg.build.files.length : firstNegIdx;
    pkg.build.files.splice(insertAt, 0, ...missingInBuildFiles);
    pkgDirty = true;
    fixesApplied.push(`Added ${missingInBuildFiles.length} missing file(s) to package.json build.files: ${missingInBuildFiles.join(', ')}`);
  }

  // Ensure critical unpacked & external assets are configured so electron-builder never strips build/
  const requiredAsarUnpack = ['build/**', 'worker.js', 'lib/**'];
  const curUnpack = Array.isArray(pkg.build.asarUnpack) ? pkg.build.asarUnpack : [];
  const missingUnpack = requiredAsarUnpack.filter(p => !curUnpack.includes(p));
  if (fix && missingUnpack.length) {
    pkg.build.asarUnpack = [...curUnpack, ...missingUnpack];
    pkgDirty = true;
    fixesApplied.push(`Added asarUnpack rules: ${missingUnpack.join(', ')}`);
  }

  const requiredExtra = [
    { from: 'build', to: 'build' },
    { from: 'LICENSE.txt', to: 'LICENSE.txt' }
  ];
  const curExtra = Array.isArray(pkg.build.extraResources) ? pkg.build.extraResources : [];
  const hasExtra = (fromVal, toVal) => curExtra.some(e => e && normalizeRel(e.from) === normalizeRel(fromVal) && normalizeRel(e.to) === normalizeRel(toVal));
  const missingExtra = requiredExtra.filter(r => !hasExtra(r.from, r.to));
  if (fix && missingExtra.length) {
    // Replace single-file XML extraResource if full build/ dir is being added so there are no duplicate copies
    const filtered = curExtra.filter(e => !(e && normalizeRel(e.from) === 'build/linux/in.textportdocx.kenshopro.xml'));
    pkg.build.extraResources = [...filtered, ...missingExtra];
    pkgDirty = true;
    fixesApplied.push(`Added extraResources: ${missingExtra.map(e => `${e.from} -> ${e.to}`).join(', ')}`);
  }

  if (pkgDirty) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  }

  // Verify package-lock.json (if present) matches package.json dependency specs; remove stale lockfile on --fix
  const lockPath = path.join(rootDir, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    let lockStale = false;
    try {
      const lockJson = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const rootEntry = (lockJson.packages && lockJson.packages['']) || {};
      const depsMatch = JSON.stringify(rootEntry.dependencies || {}) === JSON.stringify(pkg.dependencies || {});
      const devMatch = JSON.stringify(rootEntry.devDependencies || {}) === JSON.stringify(pkg.devDependencies || {});
      if (!depsMatch || !devMatch) lockStale = true;
    } catch (_) {
      lockStale = true;
    }
    if (lockStale && fix) {
      fs.unlinkSync(lockPath);
      fixesApplied.push('Removed stale package-lock.json that did not match package.json dependencies');
    }
  }

  // Re-evaluate missingInBuildFiles after auto-fix
  const remainingMissingInPkg = required.filter(rel => !isCoveredByBuildFiles(rel, pkg.build.files));

  const ok = missingOnDisk.length === 0 && emptyOnDisk.length === 0 && remainingMissingInPkg.length === 0;
  return {
    ok,
    checkedCount: required.length,
    missingOnDisk,
    emptyOnDisk,
    missingInBuildFiles: remainingMissingInPkg,
    fixesApplied
  };
}

/**
 * Post-pack audit: verifies that dist/win-unpacked or dist/linux-unpacked actually contains
 * 100% of required runtime files inside resources/app.asar (or resources/app/) AND external resources/.
 */
function runDistVerifyAudit(distDir, options = {}) {
  const rootDir = options.rootDir || ROOT;
  const fix = !!options.fix;
  const absDist = path.resolve(rootDir, distDir);
  if (!fs.existsSync(absDist)) {
    return { ok: false, error: `Unpacked directory does not exist: ${absDist}`, missingInApp: [], missingExtraResources: [], fixesApplied: [] };
  }

  const required = discoverRequiredRuntimeFiles(rootDir);
  const resourcesDir = path.join(absDist, 'resources');
  const asarPath = path.join(resourcesDir, 'app.asar');
  const unpackedAppDir = path.join(resourcesDir, 'app');

  let packagedFiles;
  let sourceKind = '';
  if (fs.existsSync(asarPath)) {
    packagedFiles = readAsarFileList(asarPath);
    sourceKind = 'app.asar';
  } else if (fs.existsSync(unpackedAppDir)) {
    packagedFiles = collectFilesRecursive(unpackedAppDir);
    sourceKind = 'resources/app/';
  } else {
    return { ok: false, error: `Neither resources/app.asar nor resources/app/ found in ${absDist}`, missingInApp: required, missingExtraResources: [], fixesApplied: [] };
  }

  // Also include files unpacked alongside app.asar in app.asar.unpacked/ and extraResources in resources/
  const asarUnpackedDir = path.join(resourcesDir, 'app.asar.unpacked');
  if (fs.existsSync(asarUnpackedDir)) {
    for (const f of collectFilesRecursive(asarUnpackedDir)) packagedFiles.add(f);
  }
  if (fs.existsSync(resourcesDir)) {
    for (const f of collectFilesRecursive(resourcesDir)) {
      if (!f.startsWith('app.asar')) packagedFiles.add(f);
    }
  }

  const fixesApplied = [];
  const missingInApp = [];
  for (const rel of required) {
    if (!packagedFiles.has(normalizeRel(rel))) {
      // If resources/app/ is unpacked (non-asar) and --fix is active, copy missing file directly
      if (fix && sourceKind === 'resources/app/' && fs.existsSync(path.join(rootDir, rel))) {
        const dest = path.join(unpackedAppDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(rootDir, rel), dest);
        fixesApplied.push(`Copied missing app file into resources/app/: ${rel}`);
      } else {
        missingInApp.push(rel);
      }
    }
  }

  // Verify external resources in <distDir>/resources/ so OS icons, splash/installers, and MIME XML always work
  const requiredExternal = [
    'build/icon.png',
    'build/icon.ico',
    'build/logo.png',
    'build/linux/in.textportdocx.kenshopro.xml',
    'LICENSE.txt'
  ];
  const missingExtraResources = [];
  for (const rel of requiredExternal) {
    const destRes = path.join(resourcesDir, rel);
    if (!fs.existsSync(destRes)) {
      const src = path.join(rootDir, rel);
      if (fix && fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(destRes), { recursive: true });
        fs.copyFileSync(src, destRes);
        fixesApplied.push(`Auto-copied missing external resource into resources/: ${rel}`);
      } else {
        missingExtraResources.push(rel);
      }
    }
  }

  const ok = missingInApp.length === 0 && missingExtraResources.length === 0;
  return {
    ok,
    distDir: absDist,
    sourceKind,
    checkedCount: required.length,
    missingInApp,
    missingExtraResources,
    fixesApplied
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  const verifyIdx = args.indexOf('--verify-dist');
  const verifyDir = verifyIdx !== -1 ? args[verifyIdx + 1] : null;

  if (verifyDir) {
    const res = runDistVerifyAudit(verifyDir, { fix });
    console.log(`[package_audit] Post-pack verification (${res.sourceKind || 'unknown'}): ${res.checkedCount || 0} required files checked in ${verifyDir}`);
    for (const f of (res.fixesApplied || [])) console.log(`  [AUTO-FIX] ${f}`);
    if (res.error) console.error(`  [ERROR] ${res.error}`);
    if (res.missingInApp && res.missingInApp.length) {
      console.error(`  [MISSING IN APP PACKAGE] (${res.missingInApp.length}):\n    - ${res.missingInApp.join('\n    - ')}`);
    }
    if (res.missingExtraResources && res.missingExtraResources.length) {
      console.error(`  [MISSING IN resources/] (${res.missingExtraResources.length}):\n    - ${res.missingExtraResources.join('\n    - ')}`);
    }
    if (!res.ok) {
      console.error('[package_audit] FAILED: Packaged build is missing required files. Packaging aborted.');
      process.exit(1);
    }
    console.log('[package_audit] PASS: 100% of required runtime & installer files verified in packaged output.');
    process.exit(0);
  }

  const res = runPreBuildAudit({ fix });
  console.log(`[package_audit] Pre-build audit: ${res.checkedCount} required runtime/installer files verified.`);
  for (const f of res.fixesApplied) console.log(`  [AUTO-FIX] ${f}`);
  if (res.missingOnDisk.length) {
    console.error(`  [MISSING ON DISK] (${res.missingOnDisk.length}):\n    - ${res.missingOnDisk.join('\n    - ')}`);
  }
  if (res.emptyOnDisk.length) {
    console.error(`  [EMPTY 0-BYTE FILE] (${res.emptyOnDisk.length}):\n    - ${res.emptyOnDisk.join('\n    - ')}`);
  }
  if (res.missingInBuildFiles.length) {
    console.error(`  [MISSING IN package.json build.files] (${res.missingInBuildFiles.length}):\n    - ${res.missingInBuildFiles.join('\n    - ')}`);
    console.error('  Tip: Run "node package_audit.js --fix" to automatically add them to package.json.');
  }
  if (!res.ok) {
    console.error('[package_audit] FAILED: Fix missing files before packaging.');
    process.exit(1);
  }
  console.log('[package_audit] PASS: All required files exist on disk and are included in package.json.');
}

module.exports = {
  discoverRequiredRuntimeFiles,
  isCoveredByBuildFiles,
  readAsarFileList,
  runPreBuildAudit,
  runDistVerifyAudit
};
