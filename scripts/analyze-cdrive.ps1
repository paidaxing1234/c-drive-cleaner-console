param(
  [string]$Drive = "C:",
  [string]$OutputPath = ".\reports\cdrive-report.local.json",
  [switch]$SkipLargeFiles
)

$ErrorActionPreference = "SilentlyContinue"

function ConvertTo-SizeLabel([double]$Bytes) {
  if ($Bytes -ge 1TB) { return "{0:N2} TB" -f ($Bytes / 1TB) }
  if ($Bytes -ge 1GB) { return "{0:N2} GB" -f ($Bytes / 1GB) }
  if ($Bytes -ge 1MB) { return "{0:N2} MB" -f ($Bytes / 1MB) }
  if ($Bytes -ge 1KB) { return "{0:N2} KB" -f ($Bytes / 1KB) }
  return "{0:N0} B" -f $Bytes
}

function Measure-DirectorySafe([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return [pscustomobject]@{
      path = $Path
      exists = $false
      bytes = 0
      size = "0 B"
      files = 0
      errors = 0
    }
  }

  $bytes = 0L
  $files = 0L
  $errors = 0L

  try {
    $root = (Resolve-Path -LiteralPath $Path).Path
    $stack = New-Object "System.Collections.Generic.Stack[string]"
    $stack.Push($root)

    while ($stack.Count -gt 0) {
      $dir = $stack.Pop()
      try {
        foreach ($file in [System.IO.Directory]::EnumerateFiles($dir)) {
          try {
            $info = [System.IO.FileInfo]::new($file)
            $bytes += $info.Length
            $files++
          } catch {
            $errors++
          }
        }

        foreach ($child in [System.IO.Directory]::EnumerateDirectories($dir)) {
          try {
            $info = [System.IO.DirectoryInfo]::new($child)
            if (($info.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) {
              $stack.Push($child)
            }
          } catch {
            $errors++
          }
        }
      } catch {
        $errors++
      }
    }
  } catch {
    $errors++
  }

  [pscustomobject]@{
    path = $Path
    exists = $true
    bytes = $bytes
    size = ConvertTo-SizeLabel $bytes
    files = $files
    errors = $errors
  }
}

function Get-TopLevelUsage([string]$Root) {
  foreach ($item in Get-ChildItem -LiteralPath $Root -Force -ErrorAction SilentlyContinue) {
    if ($item.PSIsContainer -and (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0)) {
      Measure-DirectorySafe $item.FullName
    } elseif (-not $item.PSIsContainer) {
      [pscustomobject]@{
        path = $item.FullName
        exists = $true
        bytes = $item.Length
        size = ConvertTo-SizeLabel $item.Length
        files = 1
        errors = 0
      }
    }
  }
}

function Get-LargeFiles([string]$Root, [int]$Limit = 40) {
  Get-ChildItem -LiteralPath $Root -Force -Recurse -File -ErrorAction SilentlyContinue |
    Sort-Object Length -Descending |
    Select-Object -First $Limit |
    ForEach-Object {
      [pscustomobject]@{
        path = $_.FullName
        bytes = $_.Length
        size = ConvertTo-SizeLabel $_.Length
        lastWriteTime = $_.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
      }
    }
}

$driveInfo = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$Drive'"
$userProfile = $env:USERPROFILE

$cleanupCandidates = @(
  @{
    name = "User temp"
    path = "$env:LOCALAPPDATA\Temp"
    risk = "low"
    action = "Safe to clean files older than 24 hours"
  },
  @{
    name = "Windows temp"
    path = "$env:SystemRoot\Temp"
    risk = "low"
    action = "Safe to clean files older than 24 hours"
  },
  @{
    name = "Windows update download cache"
    path = "$env:SystemRoot\SoftwareDistribution\Download"
    risk = "medium"
    action = "Clean only after Windows Update is idle"
  },
  @{
    name = "Chrome cache"
    path = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache"
    risk = "low"
    action = "Close Chrome before cleaning"
  },
  @{
    name = "Edge cache"
    path = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache"
    risk = "low"
    action = "Close Edge before cleaning"
  },
  @{
    name = "Explorer thumbnail cache"
    path = "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"
    risk = "low"
    action = "Windows will rebuild thumbnails"
  },
  @{
    name = "pip cache"
    path = "$env:LOCALAPPDATA\pip\Cache"
    risk = "low"
    action = "Can be cleaned with pip cache purge"
  },
  @{
    name = "Generic .cache"
    path = "$userProfile\.cache"
    risk = "medium"
    action = "Mostly developer/model cache; review before deletion"
  },
  @{
    name = "NuGet package cache"
    path = "$userProfile\.nuget\packages"
    risk = "medium"
    action = "Will slow first restore for .NET projects"
  },
  @{
    name = "Recycle Bin"
    path = "$Drive\`$Recycle.Bin"
    risk = "low"
    action = "Clear only after confirming no restore is needed"
  },
  @{
    name = "Downloads"
    path = "$userProfile\Downloads"
    risk = "manual"
    action = "User files; never auto-delete"
  }
)

$candidateUsage = foreach ($candidate in $cleanupCandidates) {
  $usage = Measure-DirectorySafe $candidate.path
  [pscustomobject]@{
    name = $candidate.name
    path = $candidate.path
    risk = $candidate.risk
    action = $candidate.action
    exists = $usage.exists
    bytes = $usage.bytes
    size = $usage.size
    files = $usage.files
    errors = $usage.errors
  }
}

$root = "$Drive\"
$report = [pscustomobject]@{
  generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
  computerName = $env:COMPUTERNAME
  userName = $env:USERNAME
  drive = [pscustomobject]@{
    id = $driveInfo.DeviceID
    sizeBytes = [int64]$driveInfo.Size
    freeBytes = [int64]$driveInfo.FreeSpace
    usedBytes = [int64]($driveInfo.Size - $driveInfo.FreeSpace)
    size = ConvertTo-SizeLabel $driveInfo.Size
    free = ConvertTo-SizeLabel $driveInfo.FreeSpace
    used = ConvertTo-SizeLabel ($driveInfo.Size - $driveInfo.FreeSpace)
    freePercent = [math]::Round(100 * $driveInfo.FreeSpace / $driveInfo.Size, 2)
  }
  topLevel = @(Get-TopLevelUsage $root | Sort-Object bytes -Descending | Select-Object -First 30)
  cleanupCandidates = @($candidateUsage | Sort-Object bytes -Descending)
  largeFiles = $(if ($SkipLargeFiles) { @() } else { @(Get-LargeFiles "$Drive\Users" 40) })
  recommendations = @(
    "Start with user temp, browser cache, thumbnail cache, and pip cache.",
    "C:\Users is the largest area, but it contains real user files and development data.",
    "hiberfil.sys can be removed only by disabling hibernation, which changes Windows behavior.",
    "WSL ext4.vhdx, videos, model weights, and developer caches need manual review."
  )
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8

Write-Host "Report written to $OutputPath"
Write-Host ("Drive {0}: {1} used, {2} free ({3}% free)" -f $report.drive.id, $report.drive.used, $report.drive.free, $report.drive.freePercent)
