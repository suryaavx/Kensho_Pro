#!/bin/bash
set -e

rm -f /usr/bin/kensho-pro /usr/bin/kensho-studio /usr/bin/redline-pro /usr/bin/redline-studio 2>/dev/null || true
rm -f /usr/share/applications/in.textportdocx.kenshopro-studio.desktop 2>/dev/null || true
rm -f /usr/share/applications/in.textportdocx.redlinepro-studio.desktop 2>/dev/null || true
rm -f /usr/local/bin/kensho-pro /usr/local/bin/kensho-studio /usr/local/bin/redline-pro 2>/dev/null || true
rm -f /usr/share/mime/packages/in.textportdocx.kenshopro.xml 2>/dev/null || true
rm -f /usr/share/mime/packages/in.textportdocx.redlinepro.xml 2>/dev/null || true

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications 2>/dev/null || true
fi
if command -v update-mime-database >/dev/null 2>&1; then
  update-mime-database /usr/share/mime 2>/dev/null || true
fi

exit 0
