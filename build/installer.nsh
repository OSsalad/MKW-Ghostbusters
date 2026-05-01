; Custom NSIS hooks for MKW Ghostbusters.
;
; On upgrade we want a clean install: kill the running app, then silently
; uninstall the previous version (which removes all old files) before
; extracting the new one. User data in %APPDATA%\mkw-ghost-share is preserved
; because the uninstaller is configured with deleteAppDataOnUninstall=false.

!macro customInit
  nsExec::ExecToLog 'taskkill /f /im "MKW Ghostbusters.exe"'
  Sleep 800

  ; Look up the previous install's uninstaller and run it silently.
  ; HKCU is where electron-builder writes the uninstall key for per-user
  ; (non-elevated) installs (perMachine: false).
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "UninstallString"
  ReadRegStr $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "InstallLocation"
  ${If} $0 != ""
    ExecWait '$0 /S _?=$1'
    Sleep 1200
  ${EndIf}
!macroend

!macro customUnInit
  nsExec::ExecToLog 'taskkill /f /im "MKW Ghostbusters.exe"'
  Sleep 800
!macroend
