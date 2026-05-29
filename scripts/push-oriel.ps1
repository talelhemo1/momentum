# Push current branch to ORIEL0680/momentumA (origin).
# Usage:
#   .\scripts\push-oriel.ps1
#   .\scripts\push-oriel.ps1 "Fix RSVP modal copy"
#
# Optional first argument = commit message. If omitted and you have
# uncommitted changes, you'll be prompted.

param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

$status = git status --porcelain
if ($status) {
  if (-not $Message) {
    $Message = Read-Host "Commit message"
  }
  if (-not $Message.Trim()) {
    Write-Error "Commit message required."
    exit 1
  }
  git add -A
  git commit -m $Message
} else {
  Write-Host "No changes to commit — pushing existing commits only."
}

$branch = git rev-parse --abbrev-ref HEAD
git push -u origin $branch

Write-Host ""
Write-Host "Done. Branch: $branch"
Write-Host "https://github.com/ORIEL0680/momentumA/tree/$branch"
