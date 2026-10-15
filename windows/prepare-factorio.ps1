$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = $PSScriptRoot
$versionsDir = Join-Path $root 'factorio-server\versions'
$tmp  = Join-Path $env:TEMP 'fsm-prepare'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null

function Get-ExeVersion($exe) {
    $out = & $exe --version 2>&1 | Out-String
    if ($out -match 'Version:\s*(\d+\.\d+\.\d+)') { return $Matches[1] }
    throw "Cannot read version from $exe"
}

function Save-WithProgress($uri, $outFile) {
    $req = [Net.HttpWebRequest]::Create($uri)
    $req.AllowAutoRedirect = $true
    $resp = $req.GetResponse()
    $total = $resp.ContentLength
    $in = $resp.GetResponseStream()
    $out = [IO.File]::Create($outFile)
    try {
        $buf = New-Object byte[] 262144
        $done = 0
        $lastTick = 0
        while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
            $out.Write($buf, 0, $n)
            $done += $n
            if ([Environment]::TickCount - $lastTick -gt 100) {
                $lastTick = [Environment]::TickCount
                $mb = '{0:N1}' -f ($done / 1MB)
                if ($total -gt 0) {
                    $pct = [int](100 * $done / $total)
                    $bar = ('#' * [int]($pct / 4)).PadRight(25, '-')
                    Write-Progress -Activity 'Downloading Factorio headless' -Status "[$bar] $pct%  $mb / $('{0:N1}' -f ($total / 1MB)) MB" -PercentComplete $pct
                } else {
                    Write-Progress -Activity 'Downloading Factorio headless' -Status "$mb MB"
                }
            }
        }
    } finally {
        $out.Close(); $in.Close(); $resp.Close()
        Write-Progress -Activity 'Downloading Factorio headless' -Completed
    }
}

# 1. find the Windows client: zip next to the script, Steam, default paths
$srcBin = $null
$zip = Get-ChildItem $root -Filter *.zip -File | Where-Object {
    $z = [IO.Compression.ZipFile]::OpenRead($_.FullName)
    try { [bool]($z.Entries | Where-Object { $_.FullName -like '*bin/x64/factorio.exe' }) } finally { $z.Dispose() }
} | Select-Object -First 1

if ($zip) {
    Write-Host "Client zip found: $($zip.Name)"
    $x = Join-Path $tmp 'client\bin\x64'
    New-Item -ItemType Directory -Path $x -Force | Out-Null
    $z = [IO.Compression.ZipFile]::OpenRead($zip.FullName)
    try {
        foreach ($e in $z.Entries) {
            foreach ($n in 'factorio.exe','steam_api64.dll') {
                if ($e.FullName -like "*bin/x64/$n") {
                    [IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path $x $n), $true)
                }
            }
        }
    } finally { $z.Dispose() }
    $srcBin = $x
} else {
    $cands = @()
    $steam = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath
    if ($steam) {
        $cands += Join-Path $steam 'steamapps\common\Factorio'
        $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
        if (Test-Path $vdf) {
            foreach ($m in [regex]::Matches((Get-Content $vdf -Raw), '"path"\s+"([^"]+)"')) {
                $cands += Join-Path ($m.Groups[1].Value -replace '\\\\','\') 'steamapps\common\Factorio'
            }
        }
    }
    $cands += "$env:ProgramFiles\Factorio", "${env:ProgramFiles(x86)}\Factorio", "$env:APPDATA\Factorio"
    foreach ($c in $cands) {
        if (Test-Path (Join-Path $c 'bin\x64\factorio.exe')) { $srcBin = Join-Path $c 'bin\x64'; break }
    }
    if (-not $srcBin) {
        $p = Read-Host 'Factorio client not found. Enter the Factorio folder path (with bin\x64)'
        if (Test-Path (Join-Path $p 'bin\x64\factorio.exe')) { $srcBin = Join-Path $p 'bin\x64' }
    }
}
if (-not $srcBin) { throw 'Windows client not found' }
Write-Host "Client bin: $srcBin"

# 2. version
$ver = Get-ExeVersion (Join-Path $srcBin 'factorio.exe')
Write-Host "Client version: $ver"
$dest = Join-Path $versionsDir $ver

# 3. headless linux for the same version
$url = "https://www.factorio.com/get-download/$ver/headless/linux64"
$tar = Join-Path $tmp 'headless.tar.xz'
Write-Host "Downloading $url"
Save-WithProgress $url $tar
Write-Host ('Downloaded {0:N1} MB' -f ((Get-Item $tar).Length / 1MB))

Write-Host 'Extracting...'
$ex = Join-Path $tmp 'headless'
New-Item -ItemType Directory -Path $ex | Out-Null
cmd /c "tar -xf `"$tar`" -C `"$ex`" 2>nul"
if ($LASTEXITCODE -ne 0) {
    Write-Host 'tar cannot read .xz here, using portable 7zr.exe'
    $z7 = Join-Path $tmp '7zr.exe'
    Save-WithProgress 'https://www.7-zip.org/a/7zr.exe' $z7
    & $z7 x $tar "-o$tmp" -y | Out-Null
    if ($LASTEXITCODE -ne 0) { throw '7zr failed' }
    cmd /c "tar -xf `"$(Join-Path $tmp 'headless.tar')`" -C `"$ex`""
    if ($LASTEXITCODE -ne 0) { throw 'tar failed after 7zr' }
}

# 4. assemble factorio-server\versions\<ver> : headless data + Windows bin\x64
Write-Host "Assembling $dest ..."
New-Item -ItemType Directory -Path $versionsDir -Force | Out-Null
if (Test-Path $dest) {
    $running = Get-Process factorio -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$dest*" }
    if ($running) { throw "Factorio $ver is running. Stop all servers in FSM and run this script again." }
    Remove-Item $dest -Recurse -Force
}
Move-Item (Join-Path $ex 'factorio') $dest
Remove-Item (Join-Path $dest 'bin') -Recurse -Force
$bin = Join-Path $dest 'bin\x64'
New-Item -ItemType Directory -Path $bin -Force | Out-Null
foreach ($n in 'factorio.exe','steam_api64.dll') {
    $f = Join-Path $srcBin $n
    if (Test-Path $f) { Copy-Item $f $bin }
    elseif ($n -eq 'steam_api64.dll') { Write-Host "Note: $n not found (only needed for the Steam client build)" }
    else { throw "$n not found in $srcBin" }
}

# 5. check
$v2 = Get-ExeVersion (Join-Path $bin 'factorio.exe')
$base = (Get-Content (Join-Path $dest 'data\base\info.json') -Raw | ConvertFrom-Json).version
Write-Host "exe: $v2, data/base: $base"
if ($v2 -ne $base) { Write-Host 'WARNING: versions differ!' -ForegroundColor Yellow }
Remove-Item $tmp -Recurse -Force
Write-Host "Done. Version $ver is ready. Run start.bat and create a server in the UI."
