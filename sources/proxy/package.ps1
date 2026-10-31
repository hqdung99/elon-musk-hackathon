param(
    [string]$OutputPath = (Join-Path $PSScriptRoot "proxy.zip")
)

$ErrorActionPreference = "Stop"

# An explicit allowlist keeps local credentials and Windows dependencies out.
$files = @(
    (Join-Path $PSScriptRoot "function_app.py"),
    (Join-Path $PSScriptRoot "host.json"),
    (Join-Path $PSScriptRoot "requirements.txt")
)

Compress-Archive -LiteralPath $files -DestinationPath $OutputPath -Force
Get-Item -LiteralPath $OutputPath
