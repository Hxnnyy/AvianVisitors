param([switch]$ServicesOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $root
$vars = Join-Path $root 'app/.dev.vars'
if (!(Test-Path $vars)) {
    function New-LocalToken { [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower() }
    @"
ENVIRONMENT=local
LOCAL_AUTH_TOKEN=$(New-LocalToken)
DEVICE_TOKEN=$(New-LocalToken)
INFERENCE_TOKEN=$(New-LocalToken)
RENDERER_TOKEN=$(New-LocalToken)
INFERENCE_URL=http://127.0.0.1:8081
RENDERER_URL=http://127.0.0.1:8082
"@ | Set-Content $vars
    Write-Host 'Created isolated local credentials in app/.dev.vars. Do not use them in production.'
}
$values = @{}
foreach ($line in Get-Content $vars) {
    if ($line -match '^([A-Z_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
}
if ($values['ENVIRONMENT'] -ne 'local') { throw 'Local launcher requires ENVIRONMENT=local in app/.dev.vars' }
$env:INFERENCE_TOKEN = $values['INFERENCE_TOKEN']
$env:RENDERER_TOKEN = $values['RENDERER_TOKEN']
docker compose -f compose.birthday.yaml up --build -d --wait
if ($LASTEXITCODE -ne 0) { throw 'Inference/renderer startup failed; inspect docker compose logs.' }
if ($ServicesOnly) { return }
Set-Location (Join-Path $root 'app')
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'UI build failed' }
npm run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Local migrations failed' }
$env:DEV_API_TOKEN = $values['LOCAL_AUTH_TOKEN']
$vite = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5173','--strictPort' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru -RedirectStandardOutput '.wrangler/vite.log' -RedirectStandardError '.wrangler/vite-error.log'
Write-Host 'Open http://127.0.0.1:5173. Local credentials stay in app/.dev.vars.'
try { npm run worker:dev }
finally { Stop-Process -Id $vite.Id -ErrorAction SilentlyContinue }
