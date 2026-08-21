param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $Path
)

$ErrorActionPreference = "Stop"

if (-not $Path -or $Path.Count -eq 0) {
  throw "At least one path is required"
}

$localThumbprint = ([string]$env:XIAOXUE_LOCAL_SIGNING_THUMBPRINT).Replace(" ", "").ToUpperInvariant()
$files = @($Path | ForEach-Object { Resolve-Path $_ -ErrorAction SilentlyContinue } | Select-Object -ExpandProperty Path -Unique)

if (-not $files -or $files.Count -eq 0) {
  throw "No files matched the requested paths"
}

if ($localThumbprint) {
  $certificate = Get-Item "Cert:\CurrentUser\My\$localThumbprint" -ErrorAction SilentlyContinue
  if (-not $certificate -or -not $certificate.HasPrivateKey) {
    throw "The local code-signing certificate $localThumbprint is missing or has no private key"
  }
  if ($certificate.NotAfter -le (Get-Date)) {
    throw "The local code-signing certificate $localThumbprint has expired"
  }
  if ($certificate.EnhancedKeyUsageList.ObjectId -notcontains "1.3.6.1.5.5.7.3.3") {
    throw "The local certificate $localThumbprint is not valid for code signing"
  }

  foreach ($file in $files) {
    $magic = @(Get-Content -LiteralPath $file -Encoding Byte -TotalCount 2)
    if ($magic.Count -ne 2 -or $magic[0] -ne 0x4D -or $magic[1] -ne 0x5A) {
      Write-Host "Skipping non-Windows binary: $file"
      continue
    }
    $signing = @{
      LiteralPath = $file
      Certificate = $certificate
      HashAlgorithm = "SHA256"
    }
    # Timestamp the user-facing executable and installer, but avoid hundreds of
    # outbound requests for bundled Python/Node runtime files. Those files are
    # still signed and remain valid for the five-year lifetime of the internal
    # certificate; the timestamped installer remains verifiable afterwards.
    if ($file -notlike "*\win-unpacked\resources\*") {
      $signing.TimestampServer = "http://timestamp.digicert.com"
    }
    $signature = Set-AuthenticodeSignature @signing
    if ($signature.Status -ne "Valid") {
      throw "Local Authenticode signing failed for ${file}: $($signature.Status) $($signature.StatusMessage)"
    }
  }
  exit 0
}

if ($env:GITHUB_ACTIONS -ne "true") {
  Write-Host "Skipping Windows signing because neither local nor GitHub signing is configured"
  exit 0
}

$vars = @{
  endpoint = $env:AZURE_TRUSTED_SIGNING_ENDPOINT
  account = $env:AZURE_TRUSTED_SIGNING_ACCOUNT_NAME
  profile = $env:AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE
}

if ($vars.Values | Where-Object { -not $_ }) {
  if ($env:XIAOXUE_REQUIRE_SIGNING -eq "true") {
    throw "Windows signing is required, but Azure Artifact Signing is not fully configured"
  }
  Write-Host "Skipping Windows signing because Azure Artifact Signing is not configured"
  exit 0
}

$moduleVersion = "0.5.8"
$module = Get-Module -ListAvailable -Name TrustedSigning | Where-Object { $_.Version -eq [version] $moduleVersion }

if (-not $module) {
  try {
    Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser | Out-Null
  }
  catch {
    Write-Host "NuGet package provider install skipped: $($_.Exception.Message)"
  }

  Install-Module -Name TrustedSigning -RequiredVersion $moduleVersion -Force -Repository PSGallery -Scope CurrentUser
}

Import-Module TrustedSigning -RequiredVersion $moduleVersion -Force

$params = @{
  Endpoint                         = $vars.endpoint
  CodeSigningAccountName           = $vars.account
  CertificateProfileName           = $vars.profile
  Files                            = ($files -join ",")
  FileDigest                       = "SHA256"
  TimestampDigest                  = "SHA256"
  TimestampRfc3161                 = "http://timestamp.acs.microsoft.com"
  ExcludeEnvironmentCredential     = $true
  ExcludeWorkloadIdentityCredential = $true
  ExcludeManagedIdentityCredential = $true
  ExcludeSharedTokenCacheCredential = $true
  ExcludeVisualStudioCredential    = $true
  ExcludeVisualStudioCodeCredential = $true
  ExcludeAzureCliCredential        = $false
  ExcludeAzurePowerShellCredential = $true
  ExcludeAzureDeveloperCliCredential = $true
  ExcludeInteractiveBrowserCredential = $true
}

Invoke-TrustedSigning @params
