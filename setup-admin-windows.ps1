$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js 22 or newer must be installed first.'
  exit 1
}
$email = (Read-Host 'Enter admin email').Trim()
$secure = Read-Host 'Enter a strong admin password (16+ characters)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
if ($password.Length -lt 16) { throw 'Password must contain 16 or more characters.' }
$inputJson = @{ email = $email; password = $password } | ConvertTo-Json -Compress
$inputJson | & node --experimental-sqlite (Join-Path $PSScriptRoot 'setup-admin.js')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host 'Admin is ready. Sign in at http://localhost:3000/admin'
