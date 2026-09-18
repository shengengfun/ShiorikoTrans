# Lists the assets of a GitHub release (PowerShell mangles inline jq expressions).
param([string]$Tag = "v1.0.11")
$env:HTTPS_PROXY = 'http://127.0.0.1:7897'
$json = gh api "repos/shengengfun/ShiorikoTrans/releases/tags/$Tag" | ConvertFrom-Json
foreach ($asset in $json.assets) {
    "{0}  {1:N2} MB  {2}" -f $asset.name, ($asset.size / 1MB), $asset.state
}
"total assets: $($json.assets.Count)"
"body length: $($json.body.Length)"
