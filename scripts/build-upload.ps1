$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$extensionRoot = Join-Path $repoRoot 'extension'
$distRoot = Join-Path $repoRoot 'dist'
New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
Compress-Archive -Path (Join-Path $extensionRoot '*') -DestinationPath (Join-Path $distRoot 'salesforce-flow-search-v1.0.0-upload.zip') -Force
Write-Output 'Created dist/salesforce-flow-search-v1.0.0-upload.zip with manifest.json at the ZIP root.'
