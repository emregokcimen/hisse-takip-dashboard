$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

function Assert-Command($name, $installHint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "$name bulunamadı. $installHint"
  }
}

function Run-Step($title, [scriptblock]$action) {
  Write-Host ""
  Write-Host "==> $title" -ForegroundColor Cyan
  & $action
}

Assert-Command "node" "Önce Node.js LTS kurun: https://nodejs.org/"
Assert-Command "npm" "Node.js kurulumu npm ile birlikte gelmelidir."

Run-Step "Node ve npm sürümü kontrol ediliyor" {
  node --version
  npm --version
}

Run-Step "Yerel klasörler hazırlanıyor" {
  foreach ($folder in @("data", "docs", "scripts")) {
    $path = Join-Path $root $folder
    if (-not (Test-Path -LiteralPath $path)) {
      New-Item -ItemType Directory -Path $path | Out-Null
    }
  }
}

Run-Step "npm bağımlılıkları kuruluyor" {
  if (Test-Path -LiteralPath (Join-Path $root "package-lock.json")) {
    npm ci
  } else {
    npm install
  }
}

Run-Step "Node dosyaları syntax kontrolünden geçiriliyor" {
  node -c .\fvt-price-proxy.cjs
  node -c .\src\signal-engine.cjs
  node --check .\scripts\smoke-http.mjs
  node --check .\scripts\smoke-browser.mjs
  if (Test-Path -LiteralPath ".\scripts\smoke-command-palette.mjs") {
    node --check .\scripts\smoke-command-palette.mjs
  }
}

Run-Step "React shell ve dashboard build alınıyor" {
  npm run build
}

Write-Host ""
Write-Host "Kurulum tamamlandı." -ForegroundColor Green
Write-Host "Uygulamayı başlatmak için: .\start-dashboard.cmd"
Write-Host "Web app: http://127.0.0.1:8765/"
Write-Host "Proxy:   http://127.0.0.1:8766/"

