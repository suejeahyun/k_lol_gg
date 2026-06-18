param(
  [string]$ProjectRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
$SoundDir = Join-Path $ProjectRoot "public\sounds\auction"
New-Item -ItemType Directory -Path $SoundDir -Force | Out-Null

$assets = @(
  @{ File = "auction-shuffle-whoosh.wav"; Url = "https://assets.mixkit.co/sfx/download/mixkit-fast-rocket-whoosh-1714.wav"; Name = "Fast rocket whoosh" },
  @{ File = "auction-player-select.wav"; Url = "https://assets.mixkit.co/sfx/download/mixkit-modern-technology-select-3124.wav"; Name = "Modern technology select" },
  @{ File = "auction-player-confirm.wav"; Url = "https://assets.mixkit.co/sfx/download/mixkit-modern-technology-select-3124.wav"; Name = "Modern technology select" },
  @{ File = "auction-tier-step.wav"; Url = "https://assets.mixkit.co/sfx/download/mixkit-retro-game-notification-212.wav"; Name = "Retro game notification" },
  @{ File = "auction-diamond-tension.wav"; Url = "https://assets.mixkit.co/sfx/download/mixkit-cinematic-transition-swoosh-heartbeat-trailer-488.wav"; Name = "Cinematic transition swoosh heartbeat trailer" },
  @{ File = "auction-master-tension.wav"; Url = "https://assets.mixkit.co/sfx/download/mixkit-cinematic-transition-swoosh-heartbeat-trailer-488.wav"; Name = "Cinematic transition swoosh heartbeat trailer" },
  @{ File = "auction-card-flip.wav"; Url = "https://assets.mixkit.co/sfx/download/mixkit-fast-rocket-whoosh-1714.wav"; Name = "Fast rocket whoosh" },
  @{ File = "auction-reveal-impact.wav"; Url = "https://assets.mixkit.co/sfx/download/mixkit-cinematic-whoosh-deep-impact-1143.wav"; Name = "Cinematic whoosh deep impact" }
)

foreach ($asset in $assets) {
  $out = Join-Path $SoundDir $asset.File
  Write-Host "Downloading $($asset.Name) -> $($asset.File)" -ForegroundColor Cyan
  try {
    Invoke-WebRequest -Uri $asset.Url -OutFile $out -UseBasicParsing
    if ((Get-Item $out).Length -lt 1024) {
      throw "Downloaded file is too small: $out"
    }
  } catch {
    Write-Host "Download failed: $($asset.Url)" -ForegroundColor Yellow
    Write-Host "Keeping existing fallback file if present: $out" -ForegroundColor Yellow
  }
}

Write-Host "Done. Check public\sounds\auction." -ForegroundColor Green
