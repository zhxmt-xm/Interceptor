# -*- coding: utf-8 -*-
Unicode true
Name "Interceptor Setup"
OutFile "${OUTPUT_PATH}"
Icon "${ICON_PATH}"
RequestExecutionLevel user
SilentInstall silent
SetCompressor /SOLID lzma
VIProductVersion "${WINDOWS_VERSION}"
VIAddVersionKey /LANG=1033 "ProductName" "Interceptor"
VIAddVersionKey /LANG=1033 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "FileDescription" "Interceptor MSI bootstrapper"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Copyright (c) zhxmt-xm"

Section
  ClearErrors
  InitPluginsDir
  StrCmp $PLUGINSDIR "" failed
  SetOutPath "$PLUGINSDIR"
  IfErrors failed
  File /oname=Interceptor.msi "${MSI_PATH}"
  IfErrors failed
  ExecWait '"$SYSDIR\msiexec.exe" /i "$PLUGINSDIR\Interceptor.msi"' $0
  IfErrors failed
  SetErrorLevel $0
  Quit

  failed:
    MessageBox MB_OK|MB_ICONSTOP "Unable to start Windows Installer. Please use the MSI package."
    SetErrorLevel 1603
SectionEnd
