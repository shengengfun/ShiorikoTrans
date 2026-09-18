# End-to-end check of the runtime acquisition path: resolve the newest usable
# llama.cpp asset from the release list, download it, extract it with the system
# tar, and report which binary/DLLs came out. Mirrors what llama.rs does.
$ErrorActionPreference = 'Stop'
$env:HTTPS_PROXY = 'http://127.0.0.1:7897'
$work = Join-Path $env:TEMP 'llama-e2e'
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $work | Out-Null

$wanted = '-bin-win-cpu-x64.zip'
$asset = $null
foreach ($release in (gh api 'repos/ggml-org/llama.cpp/releases?per_page=15' | ConvertFrom-Json)) {
    $hit = $release.assets | Where-Object { $_.name.EndsWith($wanted) } | Select-Object -First 1
    if ($hit) { $asset = $hit; break }
}
if (-not $asset) { throw "no asset matching $wanted" }
"SELF: asset $($asset.name) $([math]::Round($asset.size / 1MB, 1)) MB"

$archive = Join-Path $work $asset.name
$sw = [Diagnostics.Stopwatch]::StartNew()
curl.exe -sSL -x http://127.0.0.1:7897 --ssl-no-revoke -o $archive $asset.browser_download_url
$sw.Stop()
$MB = [math]::Round((Get-Item $archive).Length / 1MB, 2)
$rate = if ($sw.Elapsed.TotalSeconds -gt 0) { [math]::Round($MB / $sw.Elapsed.TotalSeconds, 2) } else { 0 }
"SELF: downloaded $MB MB in $([math]::Round($sw.Elapsed.TotalSeconds, 1))s ($rate MB/s)"

tar.exe -xf $archive -C $work
if ($LASTEXITCODE -ne 0) { throw "tar extraction failed with $LASTEXITCODE" }
"SELF: extracted with tar.exe"

$servers = Get-ChildItem $work -Recurse -Filter 'llama-server.exe' | Select-Object -First 3
foreach ($server in $servers) { "SELF: found $($server.FullName.Replace($work, ''))" }
$dlls = (Get-ChildItem $work -Recurse -Filter '*.dll').Count
"SELF: dll count $dlls"
