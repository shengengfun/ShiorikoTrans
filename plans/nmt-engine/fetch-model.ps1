param(
    [string]$Dir = "$env:LOCALAPPDATA\ShiorikoTransNmtTest\nllb-200-distilled-600M",
    [string]$Only = ''
)

$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force -Path $Dir | Out-Null

$files = @(
    'config.json',
    'tokenizer.json',
    'onnx/encoder_model_quantized.onnx',
    'onnx/decoder_model_merged_quantized.onnx'
)
if ($Only -ne '') { $files = $Only.Split(',') }

$base = 'https://hf-mirror.com/Xenova/nllb-200-distilled-600M/resolve/main'

foreach ($path in $files) {
    $name = $path.Split('/')[-1]
    $target = Join-Path $Dir $name
    if (Test-Path $target) {
        $size = (Get-Item $target).Length
        if ($size -gt 1000) {
            Write-Output "skip    $name ($size bytes)"
            continue
        }
        Remove-Item $target -Force
    }
    Write-Output "fetch   $path"
    curl.exe -sSL --retry 3 --max-time 3600 -o $target "$base/$path"
    if (Test-Path $target) {
        Write-Output ("done    {0} ({1:N0} bytes)" -f $name, (Get-Item $target).Length)
    } else {
        Write-Output "FAILED  $path"
    }
}

Write-Output ('--- ' + $Dir)
Get-ChildItem $Dir | ForEach-Object { "{0,-44} {1,14:N0}" -f $_.Name, $_.Length }
