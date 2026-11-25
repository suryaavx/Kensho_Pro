#!/usr/bin/env bash
# ============================================================================
# Kensho Pro 1.2.3.2 — 1-Click Linux Portable & Setup Package Builder
# Produces:
#   - dist/KenshoPro-Portable-1.2.3.2-x86_64.AppImage    (Single-File Portable)
#   - dist/KenshoPro-Portable-1.2.3.2-linux-x64.tar.gz   (Portable Archive + USB Mode)
#   - dist/KenshoPro-Setup-1.2.3.2-amd64.deb             (Debian / Ubuntu / Mint Setup)
#   - dist/KenshoPro-Setup-1.2.3.2-linux-x64.run         (Universal Linux Setup Installer)
# ============================================================================
set -e
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "============================================================"
echo "  Building Kensho Pro 1.2.3.2 Linux Portable & Setup Suite"
echo "============================================================"

if [ ! -d "node_modules/electron" ] || [ ! -d "node_modules/electron-builder" ]; then
  echo "[1/4] Installing dependencies..."
  if ! npm install --no-audit --no-fund; then
    echo "[WARN] npm install failed with existing lockfile; removing stale package-lock.json and retrying..."
    rm -f package-lock.json
    npm install --no-audit --no-fund
  fi
fi

echo "[2/4] Auditing package files & building unpacked Linux x64 application directory..."
node package_audit.js --fix
npx electron-builder --linux dir --x64
node package_audit.js --verify-dist dist/linux-unpacked --fix

echo "[3/4] Building AppImage (Portable) and .deb (Debian/Ubuntu Setup)..."
npx electron-builder --linux AppImage deb --prepackaged dist/linux-unpacked --x64

echo "[4/4] Building Portable .tar.gz and Universal Self-Extracting .run Setup Installer..."
node build_linux_setup.js

echo ""
echo "============================================================"
echo "  SUCCESS! Linux Portable & Setup artifacts ready in dist/:"
ls -lh dist/KenshoPro-*
echo "============================================================"
