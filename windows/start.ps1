$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$confFile = Join-Path $PSScriptRoot 'start.conf'
$versionsDir = Join-Path $PSScriptRoot 'factorio-server\versions'

function Ask($q, $def) {
    $a = Read-Host "$q [$def]"
    if ([string]::IsNullOrWhiteSpace($a)) { return $def }
    return $a.Trim()
}

function Get-LocalIp {
    try {
        $u = New-Object Net.Sockets.UdpClient
        $u.Connect('8.8.8.8', 80)
        $ip = $u.Client.LocalEndPoint.Address.ToString()
        $u.Close()
        return $ip
    } catch { return 'localhost' }
}

function Test-VersionInstalled {
    $found = Get-ChildItem $versionsDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName 'bin\x64\factorio.exe') }
    return [bool]$found
}

function Invoke-Prepare {
    try { & (Join-Path $PSScriptRoot 'prepare-factorio.ps1') }
    catch { Write-Host "Prepare failed: $($_.Exception.Message)" -ForegroundColor Red }
}

function Read-StartConf {
    $c = @{}
    if (Test-Path $confFile) {
        foreach ($line in Get-Content $confFile) {
            if ($line -match '^\s*([A-Z_]+)=(.*)$') { $c[$Matches[1]] = $Matches[2].Trim() }
        }
    }
    return $c
}

function Invoke-Setup {
    Write-Host '=== FSM Setup ==='
    Write-Host ''
    $port = Ask 'Web UI port' '8080'
    while ($port -notmatch '^\d+$' -or [int]$port -lt 1 -or [int]$port -gt 65535) {
        $port = Ask 'Web UI port (1-65535)' '8080'
    }
    $ip = Ask 'IP shown to players and in the banner' (Get-LocalIp)
    Set-Content -Path $confFile -Value @("PORT=$port", "DISPLAY_IP=$ip") -Encoding ASCII
    Write-Host 'Saved start.conf'
    Write-Host ''
}

function Wait-Reconfig {
    Write-Host "Press 'R' to reconfigure or any other key to start..."
    try {
        for ($i = 3; $i -gt 0; $i--) {
            Write-Host -NoNewline ("`r  Starting in [{0}]... " -f $i)
            $end = (Get-Date).AddSeconds(1)
            while ((Get-Date) -lt $end) {
                if ([Console]::KeyAvailable) {
                    $k = [Console]::ReadKey($true)
                    Write-Host ''
                    return ($k.Key -eq 'R')
                }
                Start-Sleep -Milliseconds 50
            }
        }
    } catch { }
    Write-Host ''
    return $false
}

# 1. conf.json
if (-not (Test-Path (Join-Path $PSScriptRoot 'conf.json'))) {
    throw 'conf.json is missing next to start.bat. Extract the archive again.'
}

# 2. Factorio version
if (-not (Test-VersionInstalled)) {
    Write-Host 'No Factorio version is installed.'
    if ((Ask 'Prepare Factorio now? (Y/n)' 'Y') -notmatch '^[nN]') { Invoke-Prepare }
}

# 3. first-run setup or launcher mode
$reconf = $false
if (-not (Test-Path $confFile)) { Invoke-Setup }
else { $reconf = Wait-Reconfig }
if ($reconf) {
    Remove-Item $confFile -Force
    Invoke-Setup
    if ((Ask 'Re-run Factorio preparation? (y/N)' 'N') -match '^[yY]') { Invoke-Prepare }
}

$c = Read-StartConf
$port = if ($c.PORT) { $c.PORT } else { '8080' }
$ip = if ($c.DISPLAY_IP) { $c.DISPLAY_IP } else { Get-LocalIp }

if (-not (Test-VersionInstalled)) {
    Write-Host 'Note: no Factorio version yet, servers cannot be created until you run prepare-factorio.bat' -ForegroundColor Yellow
}

# 4. port check
if (Get-NetTCPConnection -LocalPort ([int]$port) -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $port is already in use. Is another FSM running? Close it or reconfigure (press R at start)."
}

# 5. run
$env:FSM_SERVER_IP = $ip
$dataDir = Join-Path $PSScriptRoot 'fsm-data'
& (Join-Path $PSScriptRoot 'factorio-server-manager.exe') `
    --port $port `
    --servers-root (Join-Path $PSScriptRoot 'factorio-server') `
    --fsm-data-dir $dataDir `
    --locales-dir (Join-Path $dataDir 'locales')
