#!/usr/bin/env bash
# ============================================================================
# Kensho Pro 1.2.3.2 — Universal Linux Setup & Desktop Integration Installer
# Supports Ubuntu, Debian, Fedora, RHEL, Arch, openSUSE, Linux Mint, Pop!_OS
#
# Usage:
#   ./install-linux.sh              # Install (system-wide if root, else user)
#   sudo ./install-linux.sh         # System-wide install to /opt/KenshoPro
#   ./install-linux.sh --user       # Rootless user install to ~/.local/share/KenshoPro
#   ./install-linux.sh --uninstall  # Cleanly uninstall Kensho Pro
# ============================================================================
set -e

APP_NAME="Kensho Pro"
APP_ID="in.textportdocx.kenshopro"
LEGACY_APP_ID="in.textportdocx.redlinepro"
VERSION="1.2.3.2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MODE="auto"
ACTION="install"

for arg in "$@"; do
  case "$arg" in
    --user) MODE="user" ;;
    --system) MODE="system" ;;
    --uninstall|--remove) ACTION="uninstall" ;;
    -h|--help)
      echo "Kensho Pro $VERSION Linux Setup Installer"
      echo "Usage: $0 [--user | --system | --uninstall]"
      exit 0
      ;;
  esac
done

if [ "$MODE" = "auto" ]; then
  if [ "$(id -u)" -eq 0 ]; then
    MODE="system"
  else
    MODE="user"
  fi
fi

if [ "$MODE" = "system" ]; then
  INSTALL_DIR="/opt/KenshoPro"
  LEGACY_INSTALL_DIR="/opt/RedlinePro"
  BIN_DIR="/usr/local/bin"
  APPS_DIR="/usr/share/applications"
  ICON_DIR="/usr/share/icons/hicolor/512x512/apps"
  MIME_DIR="/usr/share/mime"
else
  INSTALL_DIR="$HOME/.local/share/KenshoPro"
  LEGACY_INSTALL_DIR="$HOME/.local/share/RedlinePro"
  BIN_DIR="$HOME/.local/bin"
  APPS_DIR="$HOME/.local/share/applications"
  ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
  MIME_DIR="$HOME/.local/share/mime"
fi

if [ "$ACTION" = "uninstall" ]; then
  echo "[Kensho Pro] Uninstalling from $INSTALL_DIR ($MODE mode)..."
  rm -rf "$INSTALL_DIR" "$LEGACY_INSTALL_DIR"
  rm -f "$BIN_DIR/kensho-pro" "$BIN_DIR/kensho-studio" "$BIN_DIR/redline-pro" "$BIN_DIR/redline-studio"
  rm -f "$APPS_DIR/$APP_ID.desktop" "$APPS_DIR/$APP_ID-studio.desktop"
  rm -f "$APPS_DIR/$LEGACY_APP_ID.desktop" "$APPS_DIR/$LEGACY_APP_ID-studio.desktop"
  rm -f "$ICON_DIR/$APP_ID.png" "$ICON_DIR/$LEGACY_APP_ID.png"
  rm -f "$MIME_DIR/packages/$APP_ID.xml" "$MIME_DIR/packages/$LEGACY_APP_ID.xml"
  rm -f "$HOME/.local/share/nautilus/scripts/Compare with Kensho Pro" 2>/dev/null || true
  rm -f "$HOME/.local/share/nemo/scripts/Compare with Kensho Pro" 2>/dev/null || true
  rm -f "$HOME/.local/share/nautilus/scripts/Compare with Redline Pro" 2>/dev/null || true
  rm -f "$HOME/.local/share/nemo/scripts/Compare with Redline Pro" 2>/dev/null || true
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q "$APPS_DIR" 2>/dev/null || true
  command -v update-mime-database >/dev/null 2>&1 && update-mime-database "$MIME_DIR" 2>/dev/null || true
  echo "[Kensho Pro] Uninstallation complete."
  exit 0
fi

# Locate source payload (dist/linux-unpacked, bundled ./linux-unpacked, or current directory)
SRC_DIR=""
if [ -d "$SCRIPT_DIR/dist/linux-unpacked" ]; then
  SRC_DIR="$SCRIPT_DIR/dist/linux-unpacked"
elif [ -d "$SCRIPT_DIR/linux-unpacked" ]; then
  SRC_DIR="$SCRIPT_DIR/linux-unpacked"
elif [ -f "$SCRIPT_DIR/kensho-pro" ] || [ -f "$SCRIPT_DIR/redline-pro" ] || [ -f "$SCRIPT_DIR/main.js" ]; then
  SRC_DIR="$SCRIPT_DIR"
fi

if [ -z "$SRC_DIR" ]; then
  echo "[ERROR] Could not locate unpacked Kensho Pro files in $SCRIPT_DIR."
  echo "Run 'npm run dist:linux:dir' first or run this script from the extracted package."
  exit 1
fi

echo "=================================================================="
echo "  Installing $APP_NAME v$VERSION ($MODE mode)"
echo "  Source:      $SRC_DIR"
echo "  Destination: $INSTALL_DIR"
echo "=================================================================="

mkdir -p "$INSTALL_DIR" "$BIN_DIR" "$APPS_DIR" "$ICON_DIR" "$MIME_DIR/packages"
REAL_SRC="$(cd "$SRC_DIR" && pwd)"
REAL_DST="$(cd "$INSTALL_DIR" && pwd)"
if [ "$REAL_SRC" != "$REAL_DST" ]; then
  cp -a "$SRC_DIR/." "$INSTALL_DIR/"
fi
if [ -f "$SCRIPT_DIR/install-linux.sh" ] && [ "$(cd "$SCRIPT_DIR" && pwd)" != "$REAL_DST" ]; then
  cp -f "$SCRIPT_DIR/install-linux.sh" "$INSTALL_DIR/install-linux.sh"
  chmod +x "$INSTALL_DIR/install-linux.sh"
fi
if [ -f "$SCRIPT_DIR/LICENSE.txt" ] && [ "$(cd "$SCRIPT_DIR" && pwd)" != "$REAL_DST" ]; then
  cp -f "$SCRIPT_DIR/LICENSE.txt" "$INSTALL_DIR/LICENSE.txt"
fi

# Create wrapper launcher script that handles and file arguments
cat > "$INSTALL_DIR/launch-kensho-pro.sh" << 'LAUNCH_EOF'
#!/usr/bin/env bash
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -x "$SELF_DIR/kensho-pro" ]; then
  exec "$SELF_DIR/kensho-pro" "$@"
elif [ -x "$SELF_DIR/Kensho Pro" ]; then
  exec "$SELF_DIR/Kensho Pro" "$@"
elif [ -x "$SELF_DIR/redline-pro" ]; then
  exec "$SELF_DIR/redline-pro" "$@"
elif [ -x "$SELF_DIR/node_modules/.bin/electron" ]; then
  exec "$SELF_DIR/node_modules/.bin/electron" "$SELF_DIR" "$@"
elif command -v electron >/dev/null 2>&1; then
  exec electron "$SELF_DIR" "$@"
else
  echo "Error: Kensho Pro binary or Electron runtime not found in $SELF_DIR" >&2
  exit 1
fi
LAUNCH_EOF
chmod +x "$INSTALL_DIR/launch-kensho-pro.sh"

if [ -f "$INSTALL_DIR/chrome-sandbox" ] && [ "$(id -u)" -eq 0 ]; then
  chown root:root "$INSTALL_DIR/chrome-sandbox" 2>/dev/null || true
  chmod 4755 "$INSTALL_DIR/chrome-sandbox" 2>/dev/null || true
fi

rm -f "$INSTALL_DIR/launch-kensho-studio.sh" "$BIN_DIR/kensho-studio" "$APPS_DIR/$APP_ID-studio.desktop" 2>/dev/null || true
ln -sf "$INSTALL_DIR/launch-kensho-pro.sh" "$BIN_DIR/kensho-pro"

# Install 512x512 application icon
if [ -f "$INSTALL_DIR/build/icon.png" ]; then
  cp -f "$INSTALL_DIR/build/icon.png" "$ICON_DIR/$APP_ID.png"
elif [ -f "$INSTALL_DIR/resources/build/icon.png" ]; then
  cp -f "$INSTALL_DIR/resources/build/icon.png" "$ICON_DIR/$APP_ID.png"
elif [ -f "$SCRIPT_DIR/build/icon.png" ]; then
  cp -f "$SCRIPT_DIR/build/icon.png" "$ICON_DIR/$APP_ID.png"
fi

# Install XDG MIME package definition (.kensho, .redline, .dxf, .gbr, .drl, .ipc)
if [ -f "$INSTALL_DIR/build/linux/$APP_ID.xml" ]; then
  cp -f "$INSTALL_DIR/build/linux/$APP_ID.xml" "$MIME_DIR/packages/$APP_ID.xml"
elif [ -f "$INSTALL_DIR/resources/build/linux/$APP_ID.xml" ]; then
  cp -f "$INSTALL_DIR/resources/build/linux/$APP_ID.xml" "$MIME_DIR/packages/$APP_ID.xml"
elif [ -f "$SCRIPT_DIR/build/linux/$APP_ID.xml" ]; then
  cp -f "$SCRIPT_DIR/build/linux/$APP_ID.xml" "$MIME_DIR/packages/$APP_ID.xml"
fi

# Create Single Unified Application Launcher: Kensho Pro
cat > "$APPS_DIR/$APP_ID.desktop" << DESKTOP_EOF
[Desktop Entry]
Name=Kensho Pro
Comment=Engineering Drawing Compare, PDF Markup Studio, AutoCAD DXF & PCB CAM Workbench
GenericName=CAD, CAM & PDF Engineering Workstation
Exec="$INSTALL_DIR/launch-kensho-pro.sh" %U
Icon=$APP_ID
Terminal=false
Type=Application
Categories=Graphics;Engineering;Office;Science;
MimeType=application/pdf;image/vnd.dxf;application/x-dxf;application/vnd.gerber;application/x-gerber;application/x-excellon;application/x-ipc-d356;application/x-kensho;application/x-redline;
Keywords=PDF;CAD;DXF;Gerber;PCB;CAM;Compare;Kensho;Engineering;
StartupNotify=true
StartupWMClass=Kensho Pro
DESKTOP_EOF
chmod 644 "$APPS_DIR/$APP_ID.desktop"

# Install Nautilus / Nemo File Manager right-click "Compare with Kensho Pro" script for the user
USER_HOME="${SUDO_USER:+$(getent passwd "$SUDO_USER" | cut -d: -f6)}"
USER_HOME="${USER_HOME:-$HOME}"
if [ -n "$USER_HOME" ] && [ -d "$USER_HOME" ]; then
  for fm_dir in "$USER_HOME/.local/share/nautilus/scripts" "$USER_HOME/.local/share/nemo/scripts"; do
    mkdir -p "$fm_dir" 2>/dev/null || true
    rm -f "$fm_dir/Compare with Redline Pro" 2>/dev/null || true
    cat > "$fm_dir/Compare with Kensho Pro" << FM_EOF
#!/usr/bin/env bash
"$INSTALL_DIR/launch-kensho-pro.sh" --compare "\$@" &
FM_EOF
    chmod +x "$fm_dir/Compare with Kensho Pro" 2>/dev/null || true
  done
fi

# Refresh XDG desktop, MIME, and icon caches
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q "$APPS_DIR" 2>/dev/null || true
command -v update-mime-database >/dev/null 2>&1 && update-mime-database "$MIME_DIR" 2>/dev/null || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t -f "$(dirname "$ICON_DIR")" 2>/dev/null || true

echo "=================================================================="
echo "  [SUCCESS] $APP_NAME v$VERSION installed!"
echo "  - Launch command:  $BIN_DIR/kensho-pro"
echo "  - Desktop entry:   $APPS_DIR/$APP_ID.desktop"
echo "  - License file:    $INSTALL_DIR/LICENSE.txt"
echo "  - Uninstall:       $INSTALL_DIR/install-linux.sh --uninstall"
echo "=================================================================="
