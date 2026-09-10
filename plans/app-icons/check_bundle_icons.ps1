Add-Type -AssemblyName System.Drawing

$out = Join-Path $env:TEMP 'iconcheck'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$files = @(
    'D:\Project\ShiorikoTrans\target\release\shiorikotrans.exe',
    'D:\Project\ShiorikoTrans\target\release\bundle\nsis\ShiorikoTrans_1.0.2_x64-setup.exe'
)

foreach ($f in $files) {
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($f)
    $name = Split-Path $f -Leaf
    $target = Join-Path $out "$name.png"
    $icon.ToBitmap().Save($target)
    Write-Output "$name -> $($icon.Width)x$($icon.Height) -> $target"
}

foreach ($f in $files) {
    $item = Get-Item $f
    Write-Output ("{0} = {1} MB" -f $item.Name, [math]::Round($item.Length / 1MB, 2))
}
