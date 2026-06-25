$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

function Assert-Command($name, $installHint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "$name bulunamadi. $installHint"
  }
}

function Test-Port($port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Test-Http($url, $contains = "") {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) { return $false }
    if ($contains -and ($response.Content -notlike "*$contains*")) { return $false }
    return $true
  } catch {
    return $false
  }
}

function Wait-Http($url, $contains = "", $seconds = 20) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Http $url $contains) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

Assert-Command "node" "Once Node.js LTS kurun: https://nodejs.org/"
Assert-Command "npm" "Node.js kurulumu npm ile birlikte gelmelidir."

if (-not (Test-Path -LiteralPath (Join-Path $root "node_modules\react")) -or -not (Test-Path -LiteralPath (Join-Path $root "node_modules\react-dom"))) {
  Write-Host "React bagimliliklari kuruluyor..."
  npm install
}

if (Test-Port 8766) {
  if (-not (Test-Http "http://127.0.0.1:8766/api/health" "hisse-price-proxy")) {
    throw "8766 portu dolu fakat beklenen fiyat proxy yanit vermiyor. Lutfen yanlis sureci kapatin."
  }
  Write-Host "Fiyat proxy zaten calisiyor: http://127.0.0.1:8766"
} else {
  Start-Process -FilePath "node" -ArgumentList "fvt-price-proxy.cjs" -WorkingDirectory $root -WindowStyle Hidden
  Write-Host "Fiyat proxy baslatildi: http://127.0.0.1:8766"
}

if (Test-Port 8765) {
  if (-not (Test-Http "http://127.0.0.1:8765/" "Matrix Shell")) {
    throw "8765 portu dolu fakat beklenen Matrix Shell yanit vermiyor. Lutfen yanlis sureci kapatin."
  }
  Write-Host "Shell zaten calisiyor: http://127.0.0.1:8765/"
} else {
  Start-Process -FilePath "npx.cmd" -ArgumentList "vite","--config","apps/shell/vite.config.js" -WorkingDirectory $root -WindowStyle Hidden
  Write-Host "Shell baslatildi: http://127.0.0.1:8765/"
}

if (-not (Wait-Http "http://127.0.0.1:8766/api/health" "hisse-price-proxy" 20)) {
  throw "Fiyat proxy hazir hale gelemedi: http://127.0.0.1:8766/api/health"
}

if (-not (Wait-Http "http://127.0.0.1:8765/" "Matrix Shell" 20)) {
  throw "Shell hazir hale gelemedi: http://127.0.0.1:8765/"
}

Start-Process "http://127.0.0.1:8765/"
