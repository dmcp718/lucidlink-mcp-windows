; LucidLink MCP Windows Installer (NSIS)
; Requires: NSIS 3.x (https://nsis.sourceforge.io/)
; Build:   makensis installer\installer.nsi

!include "MUI2.nsh"
!include "FileFunc.nsh"

; --- Configuration ---
!define APP_NAME "LucidLink MCP"
!define APP_EXE "LucidLinkMCP.exe"
!define APP_VERSION "2.2.0"
!define APP_PUBLISHER "LucidLink"
!define APP_URL "https://www.lucidlink.com"
!define APP_DIR "$LOCALAPPDATA\Programs\LucidLinkMCP"
!define BUILD_DIR "..\build\LucidLinkMCP"

; --- Compression ---
SetCompressor /SOLID lzma
SetCompressorDictSize 64

Name "${APP_NAME} ${APP_VERSION}"
OutFile "..\build\LucidLinkMCP-Setup.exe"
InstallDir "${APP_DIR}"
RequestExecutionLevel user

; --- UI ---
!define MUI_ABORTWARNING

; Installer pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${APP_NAME}"
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; --- Version Info ---
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey "LegalCopyright" "Copyright (c) ${APP_PUBLISHER}"
VIAddVersionKey "FileDescription" "${APP_NAME} Installer"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"

; --- Install Section ---
Section "Install"
    ; Kill any running instance first
    nsExec::ExecToLog 'taskkill /F /IM ${APP_EXE}'
    Sleep 500

    SetOutPath "$INSTDIR"

    ; Copy all files from build output
    File /r "${BUILD_DIR}\*.*"

    ; Create uninstaller
    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ; Start Menu shortcut
    CreateDirectory "$SMPROGRAMS\${APP_NAME}"
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

    ; Registry entries for Add/Remove Programs
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
        "DisplayName" "${APP_NAME}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
        "UninstallString" '"$INSTDIR\Uninstall.exe"'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
        "DisplayVersion" "${APP_VERSION}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
        "Publisher" "${APP_PUBLISHER}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
        "URLInfoAbout" "${APP_URL}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
        "InstallLocation" "$INSTDIR"
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
        "NoModify" 1
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
        "NoRepair" 1

    ; Compute installed size for Add/Remove Programs
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
        "EstimatedSize" $0

    ; Start at login
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" \
        "${APP_NAME}" '"$INSTDIR\${APP_EXE}"'

    ; Reset config marker so the app re-configures IDEs with new install path
    Delete "$APPDATA\LucidLinkMCP\configured.flag"
SectionEnd

; --- Uninstall Section ---
Section "Uninstall"
    ; Kill running process
    nsExec::ExecToLog 'taskkill /F /IM ${APP_EXE}'
    Sleep 500

    ; Remove files
    RMDir /r "$INSTDIR"

    ; Remove Start Menu
    RMDir /r "$SMPROGRAMS\${APP_NAME}"

    ; Remove registry entries
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_NAME}"

    ; Remove config marker
    Delete "$APPDATA\LucidLinkMCP\configured.flag"
    RMDir "$APPDATA\LucidLinkMCP"
SectionEnd
