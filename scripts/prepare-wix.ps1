param(
  [string]$Destination = (Join-Path $PSScriptRoot '../.tools/wix314')
)

$ErrorActionPreference = 'Stop'
$expectedBytes = 41297555
$expectedSha256 = '6AC824E1642D6F7277D0ED7EA09411A508F6116BA6FAE0AA5F2C7DAA2FF43D31'
$assetPath = 'wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip'
$archive = Join-Path ([IO.Path]::GetTempPath()) 'wix314-binaries.zip'
$sources = @(
  "https://github.com/$assetPath",
  "https://ghfast.top/https://github.com/$assetPath",
  "https://ghproxy.net/https://github.com/$assetPath"
)

function Test-WixArchive {
  if (-not (Test-Path $archive)) {
    return $false
  }
  $file = Get-Item $archive
  if ($file.Length -ne $expectedBytes) {
    return $false
  }
  return (Get-FileHash $archive -Algorithm SHA256).Hash -eq $expectedSha256
}

if (-not (Test-WixArchive)) {
  Remove-Item $archive -Force -ErrorAction SilentlyContinue
  foreach ($source in $sources) {
    Write-Host "Downloading WiX 3.14.1 from $source"
    & curl.exe -L --fail --retry 8 --retry-delay 2 --retry-all-errors `
      $source -o $archive
    if ($LASTEXITCODE -eq 0 -and (Test-WixArchive)) {
      break
    }
    Remove-Item $archive -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-WixArchive)) {
  throw 'WiX 3.14.1 archive failed size or SHA-256 validation.'
}

Remove-Item $Destination -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $archive -DestinationPath $Destination -Force
foreach ($binary in @('candle.exe', 'light.exe')) {
  if (-not (Test-Path (Join-Path $Destination $binary))) {
    throw "WiX archive does not contain $binary."
  }
}

$resolved = (Resolve-Path $Destination).Path
$env:PATH = "$resolved;$env:PATH"
if ($env:GITHUB_PATH) {
  Add-Content -Path $env:GITHUB_PATH -Value $resolved
}
Write-Host "WiX 3.14.1 ready at $resolved"