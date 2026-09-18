# Inspects which llama.cpp release actually carries the Windows binaries, so the
# asset pattern used by the app can be verified. PowerShell mangles inline jq
# expressions, so the JSON is parsed here instead.
$env:HTTPS_PROXY = 'http://127.0.0.1:7897'

Write-Output "== /releases/latest =="
$latest = gh api "repos/ggml-org/llama.cpp/releases/latest" | ConvertFrom-Json
"SELF: tag=$($latest.tag_name) assets=$($latest.assets.Count)"
$latest.assets | ForEach-Object { "  asset: $($_.name)" }

Write-Output "== first 5 releases with a win zip =="
$list = gh api "repos/ggml-org/llama.cpp/releases?per_page=10" | ConvertFrom-Json
foreach ($release in $list) {
    $zips = @($release.assets | Where-Object { $_.name -like '*win*' -and $_.name -like '*.zip' })
    "SELF: $($release.tag_name) total=$($release.assets.Count) winzip=$($zips.Count)"
    foreach ($zip in $zips) { "    $($zip.name)  $([math]::Round($zip.size / 1MB, 1)) MB" }
}
