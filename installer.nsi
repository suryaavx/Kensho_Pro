Unicode true
!define APPNAME "Kensho Pro"
!define APPEXE "Kensho Pro.exe"
!define VERSION "1.2.3"
!define PUBLISHER "Kensho Studio"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\KenshoPro"
!define LEGACY_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\RedlinePro"

!ifndef SRC
  !define SRC "dist\win-unpacked"
!endif
!ifndef ICON
  !define ICON "build\icon.ico"
!endif
!ifndef LIC
  !define LIC "LICENSE.txt"
!endif
!ifndef OUT
  !define OUT "dist\KenshoPro-Setup-1.2.3.exe"
!endif

!include "MUI2.nsh"

Name "${APPNAME}"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "Software\${APPNAME}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "Kensho Studio - textportdocx.in"

!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_ABORTWARNING

; Page 1: Welcome Page
!define MUI_WELCOMEPAGE_TITLE "Welcome to Kensho Pro ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "This installs Kensho Pro ${VERSION} (Enterprise Engineering Review, CAD/CAM & PDF Studio).$\r$\n$\r$\nKensho Studio - textportdocx.in.$\r$\n100% Free & Offline for personal and commercial engineering use.$\r$\n$\r$\nNo administrator rights are needed. Click Next to continue."
!insertmacro MUI_PAGE_WELCOME

; Page 2: License Page (EULA Acceptance)
!define MUI_LICENSEPAGE_TEXT_TOP "Please read the Kensho Pro End-User License Agreement (EULA). Press Page Down to see the rest."
!define MUI_LICENSEPAGE_RADIOBUTTONS
!define MUI_LICENSEPAGE_RADIOBUTTONS_TEXT_ACCEPT "I accept the terms of the License Agreement"
!define MUI_LICENSEPAGE_RADIOBUTTONS_TEXT_DECLINE "I do not accept"
!insertmacro MUI_PAGE_LICENSE "${LIC}"

; Page 3: Directory Selection Page
!insertmacro MUI_PAGE_DIRECTORY

; Page 4: Installation Progress Page
!insertmacro MUI_PAGE_INSTFILES

; Page 5: Finish Page (MUI_FINISHPAGE_* must immediately precede MUI_PAGE_FINISH)
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APPEXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Start Kensho Pro now"
!insertmacro MUI_PAGE_FINISH

; Uninstaller Pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

VIProductVersion "1.2.3.0"
VIFileVersion "1.2.3.0"
VIAddVersionKey "ProductName" "${APPNAME} Setup"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "LegalCopyright" "Kensho Studio - textportdocx.in"
VIAddVersionKey "FileDescription" "${APPNAME} ${VERSION} Installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

Section "Install"
  SetShellVarContext current
  SetOverwrite on
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  File "/oname=app.ico" "${ICON}"
  File "/oname=LICENSE.txt" "${LIC}"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Clean up any legacy multi-shortcut entries from previous installations
  Delete "$DESKTOP\Kensho Compare & CAM.lnk"
  Delete "$DESKTOP\Kensho PDF Studio.lnk"
  Delete "$DESKTOP\Kensho DXF Studio.lnk"
  Delete "$SMPROGRAMS\${APPNAME}\Kensho Compare & CAM.lnk"
  Delete "$SMPROGRAMS\${APPNAME}\Kensho PDF Studio.lnk"
  Delete "$SMPROGRAMS\${APPNAME}\Kensho DXF Studio.lnk"

  ; Start Menu & Desktop Shortcuts — Single Unified Application ("Kensho Pro")
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${APPEXE}" "" "$INSTDIR\app.ico"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Uninstall ${APPNAME}.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${APPEXE}" "" "$INSTDIR\app.ico"

  ; Application & Uninstall Registry Metadata
  WriteRegStr HKCU "Software\${APPNAME}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\app.ico"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINSTKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "EstimatedSize" 285000
  WriteRegStr HKCU "${UNINSTKEY}" "URLInfoAbout" "https://kensho.textportdocx.in"
  WriteRegStr HKCU "${UNINSTKEY}" "HelpLink" "https://kensho.textportdocx.in"
  WriteRegStr HKCU "${UNINSTKEY}" "URLUpdateInfo" "https://kensho.textportdocx.in"

  ; Appear in the "Open with" list for PDF, DXF, Gerber, Drill, IPC, and Kensho session files
  WriteRegStr HKCU "Software\Classes\Applications\${APPEXE}" "FriendlyAppName" "${APPNAME}"
  WriteRegStr HKCU "Software\Classes\Applications\${APPEXE}\shell\open\command" "" '"$INSTDIR\${APPEXE}" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${APPEXE}\SupportedTypes" ".pdf" ""
  WriteRegStr HKCU "Software\Classes\Applications\${APPEXE}\SupportedTypes" ".dxf" ""
  WriteRegStr HKCU "Software\Classes\Applications\${APPEXE}\SupportedTypes" ".gbr" ""
  WriteRegStr HKCU "Software\Classes\Applications\${APPEXE}\SupportedTypes" ".drl" ""
  WriteRegStr HKCU "Software\Classes\Applications\${APPEXE}\SupportedTypes" ".ipc" ""
  WriteRegStr HKCU "Software\Classes\Applications\${APPEXE}\SupportedTypes" ".kensho" ""
  WriteRegStr HKCU "Software\Classes\Applications\${APPEXE}\SupportedTypes" ".redline" ""
  WriteRegStr HKCU "Software\Classes\.pdf\OpenWithList\${APPEXE}" "" ""
  WriteRegStr HKCU "Software\Classes\.dxf\OpenWithList\${APPEXE}" "" ""
  WriteRegStr HKCU "Software\Classes\.gbr\OpenWithList\${APPEXE}" "" ""
  WriteRegStr HKCU "Software\Classes\.drl\OpenWithList\${APPEXE}" "" ""
  WriteRegStr HKCU "Software\Classes\.ipc\OpenWithList\${APPEXE}" "" ""
  WriteRegStr HKCU "Software\Classes\.kensho\OpenWithList\${APPEXE}" "" ""
  WriteRegStr HKCU "Software\Classes\.redline\OpenWithList\${APPEXE}" "" ""

  ; Explorer right-click on any PDF: "Edit with Kensho Pro" and "Compare with Kensho Pro" (select 2 PDFs)
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\KenshoEdit" "" "Edit with Kensho Pro"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\KenshoEdit" "Icon" "$INSTDIR\app.ico"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\KenshoEdit\command" "" '"$INSTDIR\${APPEXE}" "%1"'
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\KenshoCompare" "" "Compare with Kensho Pro"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\KenshoCompare" "Icon" "$INSTDIR\app.ico"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\KenshoCompare\command" "" '"$INSTDIR\${APPEXE}" --compare "%1"'

  ; Explorer right-click on .dxf: "Inspect CAD with Kensho Pro"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.dxf\shell\KenshoInspectCAD" "" "Inspect CAD with Kensho Pro"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.dxf\shell\KenshoInspectCAD" "Icon" "$INSTDIR\app.ico"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.dxf\shell\KenshoInspectCAD\command" "" '"$INSTDIR\${APPEXE}" "%1"'

  ; Explorer right-click on .gbr: "Inspect Gerber with Kensho Pro"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.gbr\shell\KenshoInspectGerber" "" "Inspect Gerber with Kensho Pro"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.gbr\shell\KenshoInspectGerber" "Icon" "$INSTDIR\app.ico"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.gbr\shell\KenshoInspectGerber\command" "" '"$INSTDIR\${APPEXE}" "%1"'
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$DESKTOP\Kensho Compare & CAM.lnk"
  Delete "$DESKTOP\Kensho PDF Studio.lnk"
  Delete "$DESKTOP\Kensho DXF Studio.lnk"
  Delete "$DESKTOP\Redline Pro.lnk"
  Delete "$DESKTOP\Redline Compare & CAM.lnk"
  Delete "$DESKTOP\Redline PDF Studio.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  RMDir /r "$SMPROGRAMS\Redline Pro"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "${LEGACY_UNINSTKEY}"
  DeleteRegKey HKCU "Software\${APPNAME}"
  DeleteRegKey HKCU "Software\Redline Pro"
  DeleteRegKey HKCU "Software\Classes\Applications\${APPEXE}"
  DeleteRegKey HKCU "Software\Classes\.pdf\OpenWithList\${APPEXE}"
  DeleteRegKey HKCU "Software\Classes\.dxf\OpenWithList\${APPEXE}"
  DeleteRegKey HKCU "Software\Classes\.gbr\OpenWithList\${APPEXE}"
  DeleteRegKey HKCU "Software\Classes\.drl\OpenWithList\${APPEXE}"
  DeleteRegKey HKCU "Software\Classes\.ipc\OpenWithList\${APPEXE}"
  DeleteRegKey HKCU "Software\Classes\.kensho\OpenWithList\${APPEXE}"
  DeleteRegKey HKCU "Software\Classes\.redline\OpenWithList\${APPEXE}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\KenshoEdit"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\KenshoCompare"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.dxf\shell\KenshoInspectCAD"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.gbr\shell\KenshoInspectGerber"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\RedlineEdit"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.pdf\shell\RedlineCompare"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.dxf\shell\RedlineInspectCAD"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.gbr\shell\RedlineInspectGerber"
  RMDir /r "$INSTDIR"
SectionEnd
