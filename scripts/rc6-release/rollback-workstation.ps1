#!/usr/bin/env pwsh
<#
.SYNOPSIS
  RC6 workstation rollback helper.

.DESCRIPTION
  Clean-up the release artifacts that the workstation release flow produced.
  Intentionally scoped: it only acts on release / test environment items
  (local release worktree, tag, prerelease, checksum, installer artifact).
  It does NOT touch user data, user Skills, registries, configurations,
  chat history, or any path outside this single workstation release scope.

  Git rollback is intentionally constrained:
    - never git reset --hard / never git push --force / never git push --force-with-lease
    - never deletes a remote branch other than the release-specific tag push
    - if a merge into dev is detected, uses `git revert -m 1` (no reset)

.PARAMETER Stage
  - prerelease : delete only the GitHub prerelease and its assets.
  - tag        : delete prerelease + remote+local tag v0.8.0-rc.6.
  - dev-merge  : revert the rc6-release-prep -> dev merge (if already pushed).
  - full       : full workstation cleanup (only when dev has not been merged).
  - (default)  : auto-detect and run the most aggressive safe stage.

.EXAMPLE
  pwsh ./scripts/rc6-release/rollback-workstation.ps1
  pwsh ./scripts/rc6-release/rollback-workstation.ps1 -Stage prerelease
  pwsh ./scripts/rc6-release/rollback-workstation.ps1 -Stage full -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [ValidateSet("auto", "prerelease", "tag", "dev-merge", "full")]
  [string]$Stage = "auto",

  [string]$ReleaseWorktree = "E:\software programming\opencode-dev-rc6-release-20260822",
  [string]$MainRepo        = "E:\software programming\opencode-dev",
  [string]$Tag             = "v0.8.0-rc.6",
  [string]$ReleaseBranch   = "rc6-release-prep",
  [string]$DevBranch       = "dev"
)

$ErrorActionPreference = "Stop"

# --- Guard rails ------------------------------------------------------------

$ForbiddenPaths = @(
  "${env:APPDATA}\xiaoxue",
  "${env:LOCALAPPDATA}\xiaoxue",
  "${env:USERPROFILE}\Documents\xiaoxue"
)

function Test-UserDataPath {
  param([string]$Path)
  foreach ($forbidden in $ForbiddenPaths) {
    if ($Path -like "$forbidden*") { return $true }
  }
  return $false
}

function Test-ForbiddenGitOp {
  param([string[]]$Args)
  $joined = ($Args -join " ").ToLowerInvariant()
  if ($joined -match "reset\s+--hard")         { throw "FORBIDDEN: git reset --hard is not allowed in rollback." }
  if ($joined -match "push\s+(--force|--force-with-lease|-f)") { throw "FORBIDDEN: force push is not allowed in rollback." }
  if ($joined -match "branch\s+-d\s+dev")     { throw "FORBIDDEN: deleting dev branch is not allowed." }
  if ($joined -match "checkout\s+--\s+.")     { throw "FORBIDDEN: git checkout -- <path> is not allowed in rollback." }
  if ($joined -match "clean\s+-fd")           { throw "FORBIDDEN: git clean -fd is not allowed in rollback." }
}

# --- Helpers ----------------------------------------------------------------

function Get-DevMergeSha {
  $devHead = git -C $MainRepo rev-parse $DevBranch 2>$null
  if (-not $devHead) { return $null }
  # Look for an --no-ff merge commit whose first parent is rc6-release-prep
  $candidates = git -C $MainRepo log $DevBranch --merges --pretty="%H %P" 2>$null
  foreach ($line in $candidates) {
    $parts = $line.Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)
    if ($parts.Count -lt 3) { continue }
    $merge = $parts[0]
    $p1 = $parts[1]
    if ($p1 -eq $Tag) {
      # Tag pinned to merge? unusual. Check by description.
      return $merge
    }
  }
  # Try to find merge whose first parent == rc6-release-prep HEAD
  $prepHead = git -C $MainRepo rev-parse $ReleaseBranch 2>$null
  if (-not $prepHead) { return $null }
  foreach ($line in $candidates) {
    $parts = $line.Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)
    if ($parts.Count -lt 3) { continue }
    $merge = $parts[0]
    $p1 = $parts[1]
    if ($p1 -eq $prepHead) { return $merge }
  }
  return $null
}

function Remove-WorktreeArtifacts {
  if (-not (Test-Path $ReleaseWorktree)) { return }
  Push-Location $ReleaseWorktree

  # Remove ONLY the release artifact outputs inside the workstation worktree.
  $candidates = @(
    "artifacts\录井小雪-0.8.0-rc.6-win32-x64.exe",
    "artifacts\录井小雪-0.8.0-rc.6-win32-x64.exe.sha256",
    "docs\release\rc6\release-prep\RELEASE_HEAD.txt"
  )
  foreach ($rel in $candidates) {
    $full = Join-Path (Get-Location) $rel
    if (Test-Path $full) {
      if (Test-UserDataPath $full) { throw "FORBIDDEN: refusing to delete user-data path $full" }
      if ($PSCmdlet.ShouldProcess($full, "Remove workstation release artifact")) {
        [System.IO.File]::Delete($full)
      }
    }
  }
  Pop-Location
}

function Remove-Prerelease {
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Warning "gh CLI not found; skipping remote prerelease deletion."
    return
  }
  $exists = gh release view $Tag 2>$null
  if (-not $exists) {
    Write-Host "No remote prerelease $Tag to delete."
    return
  }
  if ($PSCmdlet.ShouldProcess("GitHub prerelease $Tag", "gh release delete --yes")) {
    gh release delete $Tag --yes --cleanup-tags 2>$null
    # cleanup-tags may also remove the local+remote tag; if not, fall through to Remove-Tag.
  }
}

function Remove-RcTag {
  $remoteHas = git ls-remote origin "refs/tags/$Tag" 2>$null
  if ($remoteHas) {
    $args = @("push", "origin", ":refs/tags/$Tag")
    Test-ForbiddenGitOp $args
    if ($PSCmdlet.ShouldProcess("origin refs/tags/$Tag", "git push delete tag")) {
      git -C $MainRepo @args 2>$null
    }
  }
  $localHas = git -C $MainRepo tag -l $Tag
  if ($localHas) {
    if ($PSCmdlet.ShouldProcess("local tag $Tag", "git tag -d")) {
      git -C $MainRepo tag -d $Tag 2>$null
    }
  }
}

function Revert-DevMerge {
  $merge = Get-DevMergeSha
  if (-not $merge) {
    Write-Host "No rc6-release-prep -> dev merge detected; nothing to revert."
    return
  }
  $args = @("revert", "-m", "1", "--no-edit", $merge)
  Test-ForbiddenGitOp $args
  if ($PSCmdlet.ShouldProcess("$merge", "git revert -m 1")) {
    git -C $MainRepo @args 2>$null
  }
  $args = @("push", "origin", $DevBranch)
  Test-ForbiddenGitOp $args
  if ($PSCmdlet.ShouldProcess("origin $DevBranch", "git push")) {
    git -C $MainRepo @args 2>$null
  }
}

function Invoke-WorktreeRemove {
  $list = git -C $MainRepo worktree list 2>$null
  if ($list -match [regex]::Escape($ReleaseWorktree)) {
    $args = @("worktree", "remove", $ReleaseWorktree, "--force")
    Test-ForbiddenGitOp $args
    if ($PSCmdlet.ShouldProcess($ReleaseWorktree, "git worktree remove --force")) {
      git -C $MainRepo @args 2>$null
    }
  }
}

# --- Stage dispatch --------------------------------------------------------

$autoStage = $Stage
if ($Stage -eq "auto") {
  $devMerge = Get-DevMergeSha
  if ($devMerge) { $autoStage = "dev-merge" }
  elseif (git ls-remote origin "refs/tags/$Tag" 2>$null) { $autoStage = "tag" }
  elseif (gh release view $Tag 2>$null) { $autoStage = "prerelease" }
  else { $autoStage = "full" }
  Write-Host "Auto-selected stage: $autoStage"
}

switch ($autoStage) {
  "prerelease" {
    Remove-Prerelease
    Remove-WorktreeArtifacts
  }
  "tag" {
    Remove-Prerelease
    Remove-RcTag
    Remove-WorktreeArtifacts
  }
  "dev-merge" {
    Revert-DevMerge
    Remove-RcTag
    Remove-Prerelease
    Remove-WorktreeArtifacts
  }
  "full" {
    $devMerge = Get-DevMergeSha
    if ($devMerge) {
      throw "Refusing full rollback: dev already contains a merge from $ReleaseBranch. Use --stage dev-merge."
    }
    Remove-Prerelease
    Remove-RcTag
    Remove-WorktreeArtifacts
    Invoke-WorktreeRemove
  }
  default { throw "Unknown stage $autoStage" }
}

Write-Host "Rollback stage '$autoStage' complete."
Write-Host "Reminder: this script does NOT delete user Skills, Registry, configs, or chat history."