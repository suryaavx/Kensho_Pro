#!/bin/bash
set -e

APP_DIR="/opt/Kensho Pro"
if [ ! -d "$APP_DIR" ] && [ -d "/opt/KenshoPro" ]; then
  APP_DIR="/opt/KenshoPro"
fi

# Configure chrome-sandbox permissions if present
if [ -f "$APP_DIR/chrome-sandbox" ]; then
  chown root:root "$APP_DIR/chrome-sandbox" 2>/dev/null || true
  chmod 4755 "$APP_DIR/chrome-sandbox" 2>/dev/null || true
fi

# Create single unified CLI symlink in /usr/bin/kensho-pro and remove any legacy duplicate studio launcher
if [ -f "$APP_DIR/kensho-pro" ]; then
  ln -sf "$APP_DIR/kensho-pro" /usr/bin/kensho-pro 2>/dev/null || true
  rm -f /usr/bin/kensho-studio /usr/share/applications/in.textportdocx.kenshopro-studio.desktop 2>/dev/null || true
fi

# Install MIME package definition if bundled
if [ -f "$APP_DIR/resources/build/linux/in.textportdocx.kenshopro.xml" ]; then
  mkdir -p /usr/share/mime/packages 2>/dev/null || true
  cp -f "$APP_DIR/resources/build/linux/in.textportdocx.kenshopro.xml" /usr/share/mime/packages/in.textportdocx.kenshopro.xml 2>/dev/null || true
elif [ -f "$APP_DIR/resources/app/build/linux/in.textportdocx.kenshopro.xml" ]; then
  mkdir -p /usr/share/mime/packages 2>/dev/null || true
  cp -f "$APP_DIR/resources/app/build/linux/in.textportdocx.kenshopro.xml" /usr/share/mime/packages/in.textportdocx.kenshopro.xml 2>/dev/null || true
elif [ -f "$APP_DIR/build/linux/in.textportdocx.kenshopro.xml" ]; then
  mkdir -p /usr/share/mime/packages 2>/dev/null || true
  cp -f "$APP_DIR/build/linux/in.textportdocx.kenshopro.xml" /usr/share/mime/packages/in.textportdocx.kenshopro.xml 2>/dev/null || true
fi

# Update desktop & MIME databases
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications 2>/dev/null || true
fi
if command -v update-mime-database >/dev/null 2>&1; then
  update-mime-database /usr/share/mime 2>/dev/null || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor 2>/dev/null || true
fi

exit 0
