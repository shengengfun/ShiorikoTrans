$repos = @(
    'Xenova/opus-mt-ja-zh',
    'Xenova/opus-mt-en-zh',
    'Xenova/opus-mt-zh-en',
    'Xenova/opus-mt-ja-en',
    'Xenova/opus-mt-en-ja',
    'Xenova/opus-mt-ko-zh',
    'Xenova/opus-mt-ru-zh',
    'Xenova/opus-mt-mul-en',
    'Xenova/opus-mt-en-mul',
    'Xenova/nllb-200-distilled-600M'
)

foreach ($r in $repos) {
    $json = curl.exe -sS --max-time 25 "https://hf-mirror.com/api/models/$r?blobs=true"
    try { $j = $json | ConvertFrom-Json } catch { Write-Output "MISSING  $r"; continue }
    if (-not $j.siblings) { Write-Output "MISSING  $r"; continue }
    Write-Output "OK       $r"
    $j.siblings | Where-Object { $_.rfilename -match 'quantized|int8|tokenizer\.json|\.spm$|vocab' } | ForEach-Object {
        Write-Output ("    {0,-54} {1,12:N0}" -f $_.rfilename, $_.size)
    }
}
