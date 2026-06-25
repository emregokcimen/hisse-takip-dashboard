$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$proxy = Join-Path $root "fvt-price-proxy.cjs"

if (-not (Test-Path -LiteralPath $proxy)) {
  throw "fvt-price-proxy.cjs bulunamadi: $proxy"
}

$listener = Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  Write-Host "Fiyat proxy zaten calisiyor: http://127.0.0.1:8766"
} else {
  Start-Process -FilePath "node" -ArgumentList "`"$proxy`"" -WorkingDirectory $root -WindowStyle Hidden
  Write-Host "Fiyat proxy baslatildi: http://127.0.0.1:8766"
}
