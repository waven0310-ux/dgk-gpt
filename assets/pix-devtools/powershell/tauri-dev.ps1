# Shared Tauri Dev Launcher (WSL2 -> Windows)
# Usage: called from WSL2 launcher scripts

param(
    [Parameter(Mandatory=$true)]
    [string]$ProjectDir,

    [Parameter(Mandatory=$true)]
    [string]$ProjectName,

    [string]$CacheName = "",
    [int]$Port = 1420,
    [string]$FrontendName = "Vite",
    [int]$RemoteDebugPort = 0
)

if (-not $CacheName) { $CacheName = "$ProjectName-target" }

function Set-OrAddProperty {
    param(
        [Parameter(Mandatory=$true)]
        [object]$Target,
        [Parameter(Mandatory=$true)]
        [string]$Name,
        [Parameter(Mandatory=$true)]
        [object]$Value
    )

    if ($null -eq $Target.PSObject.Properties[$Name]) {
        $Target | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
    } else {
        $Target.$Name = $Value
    }
}

foreach ($p in @(
    (Join-Path $env:USERPROFILE ".cargo\bin"),
    (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links"),
    (Join-Path $env:LOCALAPPDATA "pnpm")
)) {
    if ((Test-Path $p) -and ($env:PATH -notlike "*$p*")) {
        $env:PATH = "$p;$env:PATH"
    }
}

if ($ProjectDir -match '^\\\\wsl') {
    if ($ProjectDir -match '^(\\\\wsl[^\\]*\\[^\\]+)(.*)$') {
        $wslRoot = $Matches[1]
        $relativePath = $Matches[2]
    }

    $mapped = Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayRoot -eq $wslRoot } |
        Select-Object -First 1

    if ($mapped) {
        $driveLetter = $mapped.Name
        Write-Host "Reusing ${driveLetter}: -> $wslRoot" -ForegroundColor Gray
    } else {
        $driveLetter = 90..76 |
            Where-Object { -not (Get-PSDrive -Name ([char]$_) -ErrorAction SilentlyContinue) } |
            Select-Object -First 1 |
            ForEach-Object { [char]$_ }

        if (-not $driveLetter) {
            Write-Host "[ERROR] No available drive letters (Z-L) for WSL2 mount" -ForegroundColor Red
            exit 1
        }

        Write-Host "Mapping $wslRoot -> ${driveLetter}:" -ForegroundColor Yellow
        net use "${driveLetter}:" "$wslRoot" /persistent:no 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Failed to map WSL path (is WSL running?)" -ForegroundColor Red
            exit 1
        }
    }
    $ProjectDir = "${driveLetter}:${relativePath}"
}

Write-Host "=== $ProjectName Tauri Dev (Windows) ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectDir" -ForegroundColor Gray

Set-Location "$ProjectDir"

if (-not (Get-Command cargo-tauri -ErrorAction SilentlyContinue)) {
    Write-Host "Installing tauri-cli via cargo (first time only)..." -ForegroundColor Yellow
    cargo install tauri-cli
}

$targetDir = Join-Path $env:USERPROFILE ".cache\$CacheName"
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}
$env:CARGO_TARGET_DIR = $targetDir
Write-Host "Target: $targetDir" -ForegroundColor Gray

$baseConfigFile = Join-Path $ProjectDir "src-tauri\tauri.conf.json"
if (-not (Test-Path $baseConfigFile)) {
    Write-Host "[ERROR] tauri.conf.json not found: $baseConfigFile" -ForegroundColor Red
    exit 1
}

$configObj = Get-Content -Path $baseConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($null -eq $configObj.build) {
    Set-OrAddProperty -Target $configObj -Name "build" -Value ([pscustomobject]@{})
}
$configObj.build.beforeDevCommand = ""

if ($RemoteDebugPort -gt 0) {
    if ($null -eq $configObj.app) {
        Set-OrAddProperty -Target $configObj -Name "app" -Value ([pscustomobject]@{})
    }

    if ($null -eq $configObj.app.windows -or $configObj.app.windows.Count -eq 0) {
        Set-OrAddProperty -Target $configObj.app -Name "windows" -Value @([pscustomobject]@{})
    }

    $debugArgs = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port=$RemoteDebugPort"
    Set-OrAddProperty -Target $configObj.app.windows[0] -Name "additionalBrowserArgs" -Value $debugArgs
    Set-OrAddProperty -Target $configObj.app.windows[0] -Name "dataDirectory" -Value "devtools-$ProjectName-$RemoteDebugPort"
}

$configFile = Join-Path $env:TEMP "$ProjectName-tauri-dev.json"
($configObj | ConvertTo-Json -Depth 100) | Set-Content -Path $configFile -Encoding UTF8

Write-Host "${FrontendName}: localhost:${Port} (WSL2 mirrored)" -ForegroundColor Green
if ($RemoteDebugPort -gt 0) {
    Write-Host "CDP: http://127.0.0.1:${RemoteDebugPort}/json/version" -ForegroundColor Green
}
Write-Host "Starting Tauri (Rust backend + Windows app)..." -ForegroundColor Green
cargo tauri dev --config $configFile
