param(
  [switch]$Execute,
  [int]$OlderThanHours = 24,
  [switch]$IncludeRecycleBin,
  [switch]$IncludePipCache,
  [switch]$IncludeBrowserCache,
  [string]$LogPath = ".\reports\clean-cdrive.log"
)

$ErrorActionPreference = "Continue"

function ConvertTo-SizeLabel([double]$Bytes) {
  if ($Bytes -ge 1TB) { return "{0:N2} TB" -f ($Bytes / 1TB) }
  if ($Bytes -ge 1GB) { return "{0:N2} GB" -f ($Bytes / 1GB) }
  if ($Bytes -ge 1MB) { return "{0:N2} MB" -f ($Bytes / 1MB) }
  if ($Bytes -ge 1KB) { return "{0:N2} KB" -f ($Bytes / 1KB) }
  return "{0:N0} B" -f $Bytes
}

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"), $Message
  Write-Host $line
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

function Remove-DirectoryContentsSafe([string]$Path, [datetime]$Before) {
  $result = [pscustomobject]@{ path = $Path; bytes = 0L; files = 0L; errors = 0L }

  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Log "Skip missing path: $Path"
    return $result
  }

  Get-ChildItem -LiteralPath $Path -Force -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $Before } |
    ForEach-Object {
      try {
        $length = $_.Length
        if ($Execute) {
          Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
        }
        $result.bytes += $length
        $result.files++
      } catch {
        $result.errors++
      }
    }

  if ($Execute) {
    Get-ChildItem -LiteralPath $Path -Force -Recurse -Directory -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      ForEach-Object {
        try {
          if (-not (Get-ChildItem -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue)) {
            Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
          }
        } catch {
          $result.errors++
        }
      }
  }

  return $result
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogPath) | Out-Null
Set-Content -LiteralPath $LogPath -Value "" -Encoding UTF8

$mode = if ($Execute) { "EXECUTE" } else { "DRY-RUN" }
$cutoff = (Get-Date).AddHours(-1 * $OlderThanHours)
Write-Log "Mode: $mode"
Write-Log "Only files older than $OlderThanHours hours will be counted or removed."

$targets = @(
  @{ name = "User temp"; path = "$env:LOCALAPPDATA\Temp"; before = $cutoff },
  @{ name = "Windows temp"; path = "$env:SystemRoot\Temp"; before = $cutoff },
  @{ name = "Windows Explorer thumbnail cache"; path = "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"; before = $cutoff; pattern = "thumbcache*" }
)

if ($IncludeBrowserCache) {
  $targets += @(
    @{ name = "Chrome default cache"; path = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache"; before = $cutoff },
    @{ name = "Edge default cache"; path = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache"; before = $cutoff }
  )
}

$totalBytes = 0L
$totalFiles = 0L
$totalErrors = 0L

foreach ($target in $targets) {
  Write-Log "Scan target: $($target.name) -> $($target.path)"
  $result = Remove-DirectoryContentsSafe -Path $target.path -Before $target.before
  $totalBytes += $result.bytes
  $totalFiles += $result.files
  $totalErrors += $result.errors
  Write-Log ("{0}: {1}, {2} files, {3} errors" -f $target.name, (ConvertTo-SizeLabel $result.bytes), $result.files, $result.errors)
}

if ($IncludePipCache) {
  Write-Log "pip cache selected."
  if (Get-Command pip -ErrorAction SilentlyContinue) {
    if ($Execute) {
      Write-Log "Running: pip cache purge"
      pip cache purge | ForEach-Object { Write-Log $_ }
    } else {
      Write-Log "DRY-RUN: would run pip cache purge"
    }
  } else {
    $pipPath = "$env:LOCALAPPDATA\pip\Cache"
    $result = Remove-DirectoryContentsSafe -Path $pipPath -Before $cutoff
    $totalBytes += $result.bytes
    $totalFiles += $result.files
    $totalErrors += $result.errors
    Write-Log ("pip cache directory fallback: {0}, {1} files, {2} errors" -f (ConvertTo-SizeLabel $result.bytes), $result.files, $result.errors)
  }
}

if ($IncludeRecycleBin) {
  if ($Execute) {
    Write-Log "Clearing recycle bin."
    try {
      Clear-RecycleBin -Force -ErrorAction Stop
      Write-Log "Recycle bin cleared."
    } catch {
      Write-Log "Recycle bin failed: $($_.Exception.Message)"
      $totalErrors++
    }
  } else {
    Write-Log "DRY-RUN: would clear recycle bin."
  }
}

Write-Log ("Summary: {0}, {1} files, {2} errors" -f (ConvertTo-SizeLabel $totalBytes), $totalFiles, $totalErrors)

if (-not $Execute) {
  Write-Log "This was a dry run. Add -Execute to actually delete selected safe cache files."
}
