#!/usr/bin/env node
/**
 * Kensho Pro 1.2.3 — Linux Portable (.tar.gz) & Self-Extracting Setup (.run) Builder
 *
 * Works alongside electron-builder (--linux dir / AppImage / deb) to produce:
 *   1. dist/KenshoPro-Portable-1.2.3-linux-x64.tar.gz (Portable bundle with self-contained ./portable-data profile)
 *   2. dist/KenshoPro-Setup-1.2.3-linux-x64.run       (Self-extracting universal Linux setup installer executable)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const ROOT = __dirname;
const DIST_DIR = path.join(ROOT, 'dist');
const UNPACKED_DIR = path.join(DIST_DIR, 'linux-unpacked');
const PORTABLE_TAR = path.join(DIST_DIR, 'KenshoPro-Portable-1.2.3-linux-x64.tar.gz');
const SETUP_RUN = path.join(DIST_DIR, 'KenshoPro-Setup-1.2.3-linux-x64.run');

function createPortableLauncher(targetDir) {
  const launcherPath = path.join(targetDir, 'KenshoPro-Portable.sh');
  const script = [
    '#!/usr/bin/env bash',
    '# Kensho Pro 1.2.3 — Portable Linux Launcher (stores config/session data in ./portable-data)',
    'set -e',
    'SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    'PORTABLE_DATA="$SELF_DIR/portable-data"',
    'mkdir -p "$PORTABLE_DATA"',
    'export XDG_CONFIG_HOME="$PORTABLE_DATA"',
    'if [ -x "$SELF_DIR/kensho-pro" ]; then',
    '  exec "$SELF_DIR/kensho-pro" --no-sandbox --user-data-dir="$PORTABLE_DATA" "$@"',
    'elif [ -x "$SELF_DIR/Kensho Pro" ]; then',
    '  exec "$SELF_DIR/Kensho Pro" --no-sandbox --user-data-dir="$PORTABLE_DATA" "$@"',
    'elif [ -x "$SELF_DIR/redline-pro" ]; then',
    '  exec "$SELF_DIR/redline-pro" --no-sandbox --user-data-dir="$PORTABLE_DATA" "$@"',
    'elif [ -x "$SELF_DIR/node_modules/.bin/electron" ]; then',
    '  exec "$SELF_DIR/node_modules/.bin/electron" "$SELF_DIR" --no-sandbox --user-data-dir="$PORTABLE_DATA" "$@"',
    'elif command -v electron >/dev/null 2>&1; then',
    '  exec electron "$SELF_DIR" --no-sandbox --user-data-dir="$PORTABLE_DATA" "$@"',
    'else',
    '  echo "Error: Kensho Pro binary not found in $SELF_DIR" >&2',
    '  exit 1',
    'fi',
    ''
  ].join('\n');
  fs.writeFileSync(launcherPath, script, { mode: 0o755 });
  return launcherPath;
}

function buildSelfExtractingRunInstaller(tarGzPath, outRunPath) {
  const header = [
    '#!/usr/bin/env bash',
    '# ============================================================================',
    '# Kensho Pro 1.2.3 — Self-Extracting Universal Linux Setup Installer (.run)',
    '# Usage:',
    '#   ./KenshoPro-Setup-1.2.3-linux-x64.run              (Install for current user or root)',
    '#   sudo ./KenshoPro-Setup-1.2.3-linux-x64.run         (System-wide install to /opt/KenshoPro)',
    '#   ./KenshoPro-Setup-1.2.3-linux-x64.run --uninstall  (Cleanly uninstall Kensho Pro)',
    '# ============================================================================',
    'set -e',
    'TMP_EXTRACT="$(mktemp -d /tmp/kenshopro-setup.XXXXXX)"',
    'cleanup() { rm -rf "$TMP_EXTRACT"; }',
    'trap cleanup EXIT',
    'echo "[Kensho Pro Setup] Extracting installation payload..."',
    'ARCHIVE_LINE=$(LC_ALL=C awk "/^__ARCHIVE_BELOW__$/ {print NR + 1; exit 0;}" "$0")',
    'tail -n +"$ARCHIVE_LINE" "$0" | tar -xz -C "$TMP_EXTRACT"',
    'if [ -d "$TMP_EXTRACT/linux-unpacked" ]; then',
    '  chmod +x "$TMP_EXTRACT/linux-unpacked/install-linux.sh"',
    '  "$TMP_EXTRACT/linux-unpacked/install-linux.sh" "$@"',
    'else',
    '  chmod +x "$TMP_EXTRACT/install-linux.sh"',
    '  "$TMP_EXTRACT/install-linux.sh" "$@"',
    'fi',
    'exit 0',
    '__ARCHIVE_BELOW__',
    ''
  ].join('\n');

  const headerBuf = Buffer.from(header, 'utf8');
  const payloadBuf = fs.readFileSync(tarGzPath);
  fs.writeFileSync(outRunPath, Buffer.concat([headerBuf, payloadBuf]), { mode: 0o755 });
  return outRunPath;
}

function buildLinuxSetupAndPortable() {
  if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
  if (!fs.existsSync(UNPACKED_DIR)) {
    if (fs.existsSync(path.join(ROOT, 'node_modules'))) {
      console.log('[build_linux_setup] dist/linux-unpacked not found; building unpacked Linux directory first...');
      execSync('npx electron-builder --linux dir --x64', { cwd: ROOT, stdio: 'inherit' });
    }
    if (!fs.existsSync(UNPACKED_DIR)) {
      throw new Error(`Missing unpacked Linux directory: ${UNPACKED_DIR}. Run "npm run dist:linux:dir" first.`);
    }
  }

  // Copy install-linux.sh, LICENSE.txt, and build/ icons into linux-unpacked so both Portable and Setup have them
  const installShSrc = path.join(ROOT, 'install-linux.sh');
  if (fs.existsSync(installShSrc)) {
    const destSh = path.join(UNPACKED_DIR, 'install-linux.sh');
    fs.copyFileSync(installShSrc, destSh);
    fs.chmodSync(destSh, 0o755);
  }
  const licSrc = path.join(ROOT, 'LICENSE.txt');
  if (fs.existsSync(licSrc)) {
    fs.copyFileSync(licSrc, path.join(UNPACKED_DIR, 'LICENSE.txt'));
  }
  const buildDest = path.join(UNPACKED_DIR, 'build', 'linux');
  fs.mkdirSync(buildDest, { recursive: true });
  if (fs.existsSync(path.join(ROOT, 'build', 'icon.png'))) {
    fs.copyFileSync(path.join(ROOT, 'build', 'icon.png'), path.join(UNPACKED_DIR, 'build', 'icon.png'));
  }
  const mimeXml = path.join(ROOT, 'build', 'linux', 'in.textportdocx.kenshopro.xml');
  if (fs.existsSync(mimeXml)) {
    fs.copyFileSync(mimeXml, path.join(buildDest, 'in.textportdocx.kenshopro.xml'));
  }

  // Create portable launcher inside linux-unpacked
  createPortableLauncher(UNPACKED_DIR);

  // Create Portable .tar.gz
  execFileSync('tar', ['-czf', PORTABLE_TAR, '-C', DIST_DIR, 'linux-unpacked'], { stdio: 'inherit' });
  console.log(`[build_linux_setup] Built Linux Portable archive: ${PORTABLE_TAR} (${(fs.statSync(PORTABLE_TAR).size / (1024 * 1024)).toFixed(2)} MB)`);

  // Create Self-Extracting .run Setup Installer
  buildSelfExtractingRunInstaller(PORTABLE_TAR, SETUP_RUN);
  console.log(`[build_linux_setup] Built Linux Self-Extracting Setup Installer: ${SETUP_RUN} (${(fs.statSync(SETUP_RUN).size / (1024 * 1024)).toFixed(2)} MB)`);

  return { portableTar: PORTABLE_TAR, setupRun: SETUP_RUN };
}

if (require.main === module) {
  try {
    buildLinuxSetupAndPortable();
  } catch (err) {
    console.error('[build_linux_setup] ERROR:', err.message || err);
    process.exit(1);
  }
}

module.exports = {
  createPortableLauncher,
  buildSelfExtractingRunInstaller,
  buildLinuxSetupAndPortable
};
