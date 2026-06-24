param(
  [switch]$IncludeBrowserCache = $true,
  [switch]$IncludePipCache = $true,
  [switch]$IncludeRecycleBin,
  [int]$OlderThanHours = 24,
  [switch]$SkipLargeFiles,
  [switch]$ExecuteWithoutPrompt
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$reportPath = Join-Path $repoRoot "reports\cdrive-report.local.json"

function Invoke-Step([string]$Title, [scriptblock]$Block) {
  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor Cyan
  & $Block
}

function Add-Flag([System.Collections.Generic.List[string]]$Args, [string]$Name, [bool]$Enabled) {
  if ($Enabled) {
    $Args.Add($Name)
  }
}

Set-Location $repoRoot

Invoke-Step "1. Analyze C drive" {
  $args = New-Object "System.Collections.Generic.List[string]"
  $args.Add("-File")
  $args.Add((Join-Path $scriptRoot "analyze-cdrive.ps1"))
  $args.Add("-OutputPath")
  $args.Add($reportPath)
  Add-Flag $args "-SkipLargeFiles" ([bool]$SkipLargeFiles)
  powershell -NoProfile -ExecutionPolicy Bypass @args
}

Invoke-Step "2. Dry-run safe cleanup" {
  $args = New-Object "System.Collections.Generic.List[string]"
  $args.Add("-File")
  $args.Add((Join-Path $scriptRoot "clean-cdrive.ps1"))
  $args.Add("-OlderThanHours")
  $args.Add([string]$OlderThanHours)
  Add-Flag $args "-IncludeBrowserCache" ([bool]$IncludeBrowserCache)
  Add-Flag $args "-IncludePipCache" ([bool]$IncludePipCache)
  Add-Flag $args "-IncludeRecycleBin" ([bool]$IncludeRecycleBin)
  powershell -NoProfile -ExecutionPolicy Bypass @args
}

Write-Host ""
Write-Host "Dry-run finished. No files have been deleted yet." -ForegroundColor Yellow
Write-Host "Review reports\clean-cdrive.log before executing." -ForegroundColor Yellow

$confirmed = $false
if ($ExecuteWithoutPrompt) {
  $confirmed = $true
} else {
  $answer = Read-Host "Type YES to execute the cleanup now"
  $confirmed = ($answer -eq "YES")
}

if (-not $confirmed) {
  Write-Host "Cleanup cancelled. Analysis and dry-run reports are kept under reports\." -ForegroundColor Green
  exit 0
}

Invoke-Step "3. Execute safe cleanup" {
  $args = New-Object "System.Collections.Generic.List[string]"
  $args.Add("-File")
  $args.Add((Join-Path $scriptRoot "clean-cdrive.ps1"))
  $args.Add("-Execute")
  $args.Add("-OlderThanHours")
  $args.Add([string]$OlderThanHours)
  Add-Flag $args "-IncludeBrowserCache" ([bool]$IncludeBrowserCache)
  Add-Flag $args "-IncludePipCache" ([bool]$IncludePipCache)
  Add-Flag $args "-IncludeRecycleBin" ([bool]$IncludeRecycleBin)
  powershell -NoProfile -ExecutionPolicy Bypass @args
}

Invoke-Step "4. Refresh report after cleanup" {
  $args = New-Object "System.Collections.Generic.List[string]"
  $args.Add("-File")
  $args.Add((Join-Path $scriptRoot "analyze-cdrive.ps1"))
  $args.Add("-OutputPath")
  $args.Add($reportPath)
  Add-Flag $args "-SkipLargeFiles" ([bool]$SkipLargeFiles)
  powershell -NoProfile -ExecutionPolicy Bypass @args
}

Write-Host ""
Write-Host "Done. Open index.html or run node server.js to view the report page." -ForegroundColor Green
