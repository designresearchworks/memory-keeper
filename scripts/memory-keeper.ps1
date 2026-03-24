$ErrorActionPreference = "Stop"
$NodeMajor = if ($env:NODE_MAJOR) { $env:NODE_MAJOR } else { "20" }

function Write-Step($Message) {
  Write-Host $Message
}

if (Get-Command node -ErrorAction SilentlyContinue) {
  Write-Step "Node is already installed: $(node --version)"
} else {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Step "Installing Node.js with winget..."
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  } else {
    $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json"
    $release = $index | Where-Object { $_.version -like "v$NodeMajor.*" } | Select-Object -First 1
    if (-not $release) {
      throw "Could not determine the latest Node.js $NodeMajor.x release."
    }

    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
    $msiName = "node-$($release.version)-$arch.msi"
    $msiUrl = "https://nodejs.org/dist/$($release.version)/$msiName"
    $msiPath = Join-Path $env:TEMP $msiName

    Write-Step "Downloading Node.js $($release.version)..."
    Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath

    Write-Step "Installing Node.js $($release.version)..."
    Start-Process msiexec.exe -Wait -Verb RunAs -ArgumentList "/i `"$msiPath`" /passive /norestart"
  }
}

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

Write-Step ""
Write-Step "Installed Node.js: $(node --version)"
Write-Step "Node.js is ready."
Write-Step "Starting Memory Keeper..."
node "$PSScriptRoot\run-memory-keeper.mjs"
