param(
  [string] $CertificatePath = (Join-Path $PSScriptRoot "xiaoxue-internal-publisher.cer")
)

$ErrorActionPreference = "Stop"
$expectedThumbprint = "72D0E59840C1B8EA8FCF8B8D263D48827120C977"
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run install-xiaoxue-internal-certificate.cmd as Administrator."
}

$resolved = (Resolve-Path -LiteralPath $CertificatePath).Path
$certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($resolved)
if ($certificate.Thumbprint -ne $expectedThumbprint) {
  throw "Certificate thumbprint mismatch. Expected $expectedThumbprint, got $($certificate.Thumbprint)."
}

Import-Certificate -FilePath $resolved -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
Import-Certificate -FilePath $resolved -CertStoreLocation Cert:\LocalMachine\TrustedPublisher | Out-Null

$root = Get-Item "Cert:\LocalMachine\Root\$expectedThumbprint" -ErrorAction SilentlyContinue
$publisher = Get-Item "Cert:\LocalMachine\TrustedPublisher\$expectedThumbprint" -ErrorAction SilentlyContinue
if (-not $root -or -not $publisher) {
  throw "Certificate import verification failed."
}

Write-Host "Xiaoxue internal publisher certificate installed." -ForegroundColor Green
Write-Host "Certificate thumbprint: $expectedThumbprint"
Write-Host "You may now install the Xiaoxue package signed by this certificate."
