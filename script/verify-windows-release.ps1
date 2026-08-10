param(
  [Parameter(Mandatory = $true)]
  [string] $Dist
)

$ErrorActionPreference = "Stop"

$distPath = (Resolve-Path -LiteralPath $Dist).Path
$signedExtensions = @(".exe", ".dll", ".node", ".pyd")
$executables = @(
  Get-ChildItem -LiteralPath $distPath -File -Recurse |
    Where-Object { $_.Extension -in $signedExtensions }
)

if ($executables.Count -eq 0) {
  throw "No Windows executable code was found in $distPath"
}

$expectedSigner = $env:XIAOXUE_EXPECTED_SIGNER
if (-not $expectedSigner) {
  throw "XIAOXUE_EXPECTED_SIGNER environment variable is required for enterprise releases"
}
$report = @($executables | ForEach-Object {
  $signature = Get-AuthenticodeSignature -LiteralPath $_.FullName

  if ($signature.Status -ne "Valid") {
    throw "Invalid Authenticode signature ($($signature.Status)): $($_.FullName)"
  }

  if ($expectedSigner -and $signature.SignerCertificate.Subject -notlike "*$expectedSigner*") {
    throw "Unexpected signer for $($_.FullName): $($signature.SignerCertificate.Subject)"
  }

  [ordered]@{
    path = [IO.Path]::GetRelativePath($distPath, $_.FullName).Replace("\", "/")
    sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    status = $signature.Status.ToString()
    signer_subject = $signature.SignerCertificate.Subject
    signer_thumbprint = $signature.SignerCertificate.Thumbprint
    timestamp_subject = $signature.TimeStamperCertificate.Subject
  }
})

$report |
  ConvertTo-Json -Depth 4 |
  Set-Content -LiteralPath (Join-Path $distPath "signature-report.json") -Encoding UTF8

$releaseFiles = @(
  Get-ChildItem -LiteralPath $distPath -File -Recurse |
    Where-Object { $_.Extension -in ".exe", ".yml", ".blockmap" } |
    Sort-Object Name
)

if ($releaseFiles.Count -eq 0) {
  throw "No deployable Windows release files were found in $distPath"
}

$checksums = @($releaseFiles | ForEach-Object {
  "$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())  $([IO.Path]::GetRelativePath($distPath, $_.FullName).Replace("\", "/"))"
})
$checksums | Set-Content -LiteralPath (Join-Path $distPath "SHA256SUMS.txt") -Encoding ascii

Write-Host "Verified $($executables.Count) signed executable(s) and recorded $($releaseFiles.Count) release checksum(s)."
