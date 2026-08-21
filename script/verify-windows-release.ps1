param(
  [Parameter(Mandatory = $true)]
  [string] $Dist,

  [switch] $AllowUnsigned
)

$ErrorActionPreference = "Stop"

$distPath = (Resolve-Path -LiteralPath $Dist).Path
$signedExtensions = @(".exe", ".dll", ".node", ".pyd")
$executables = @(
  Get-ChildItem -LiteralPath $distPath -File -Recurse |
    Where-Object {
      if ($_.Extension -notin $signedExtensions) { return $false }
      $magic = @(Get-Content -LiteralPath $_.FullName -Encoding Byte -TotalCount 2)
      return $magic.Count -eq 2 -and $magic[0] -eq 0x4D -and $magic[1] -eq 0x5A
    }
)

if ($executables.Count -eq 0) {
  throw "No Windows executable code was found in $distPath"
}

$expectedSigner = $env:XIAOXUE_EXPECTED_SIGNER
if (-not $AllowUnsigned -and -not $expectedSigner) {
  throw "XIAOXUE_EXPECTED_SIGNER environment variable is required for enterprise releases"
}
$report = @($executables | ForEach-Object {
  $signature = Get-AuthenticodeSignature -LiteralPath $_.FullName

  if (-not $AllowUnsigned -and $signature.Status -ne "Valid") {
    throw "Invalid Authenticode signature ($($signature.Status)): $($_.FullName)"
  }

  if (
    -not $AllowUnsigned -and
    $_.Extension -eq ".exe" -and
    $_.DirectoryName -eq $distPath -and
    $signature.SignerCertificate.Subject -notlike "*$expectedSigner*"
  ) {
    throw "Unexpected signer for release executable $($_.FullName): $($signature.SignerCertificate.Subject)"
  }

  [ordered]@{
    path = $_.FullName.Substring($distPath.Length).TrimStart("\", "/").Replace("\", "/")
    sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    status = $signature.Status.ToString()
    expected_publisher = if ($signature.SignerCertificate) {
      $signature.SignerCertificate.Subject -like "*$expectedSigner*"
    } else {
      $false
    }
    signer_subject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
    signer_thumbprint = if ($signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { $null }
    timestamp_subject = if ($signature.TimeStamperCertificate) { $signature.TimeStamperCertificate.Subject } else { $null }
  }
})

$reportName = if ($AllowUnsigned) { "unsigned-report.json" } else { "signature-report.json" }
$report |
  ConvertTo-Json -Depth 4 |
  Set-Content -LiteralPath (Join-Path $distPath $reportName) -Encoding UTF8

$releaseFiles = @(
  Get-ChildItem -LiteralPath $distPath -File -Recurse |
    Where-Object { $_.Extension -in ".exe", ".yml", ".blockmap" } |
    Sort-Object Name
)

if ($releaseFiles.Count -eq 0) {
  throw "No deployable Windows release files were found in $distPath"
}

$checksums = @($releaseFiles | ForEach-Object {
  "$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())  $($_.FullName.Substring($distPath.Length).TrimStart("\", "/").Replace("\", "/"))"
})
$checksums | Set-Content -LiteralPath (Join-Path $distPath "SHA256SUMS.txt") -Encoding UTF8

if ($AllowUnsigned) {
  Write-Warning "Unsigned release candidate only: publication is prohibited. Recorded $($executables.Count) executable(s) and $($releaseFiles.Count) release checksum(s)."
  exit 0
}

Write-Host "Verified $($executables.Count) signed executable(s) and recorded $($releaseFiles.Count) release checksum(s)."
