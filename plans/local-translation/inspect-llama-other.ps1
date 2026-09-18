# Lists the non-Windows assets of a llama.cpp build, to confirm the archive
# names used for macOS/Linux.
param([string]$Tag = "b11026")
$env:HTTPS_PROXY = 'http://127.0.0.1:7897'
$release = gh api "repos/ggml-org/llama.cpp/releases/tags/$Tag" | ConvertFrom-Json
$release.assets | Where-Object { $_.name -like '*.zip' -and $_.name -notlike '*win*' -and $_.name -notlike '*cudart*' } |
    ForEach-Object { "SELF: $($_.name)  $([math]::Round($_.size / 1MB, 1)) MB" }
