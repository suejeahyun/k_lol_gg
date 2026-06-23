param(
  [string]$BaseUrl = "http://localhost:3000",
  [int]$TimeoutSec = 20,
  [string]$SeasonId = ""
)

$ErrorActionPreference = "Continue"
$base = $BaseUrl.TrimEnd("/")

$routes = @(
  "/api/community/headlines?type=FREE",
  "/api/recruits",
  "/api/seasons/current",
  "/api/stats/top"
)

if ($SeasonId -and $SeasonId.Trim().Length -gt 0) {
  $routes += ("/api/seasons/{0}/current" -f $SeasonId.Trim())
}

$failed = 0

foreach ($route in $routes) {
  $url = $base + $route
  try {
    $res = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec $TimeoutSec -UseBasicParsing
    $code = [int]$res.StatusCode
    if ($code -ge 200 -and $code -lt 300) {
      Write-Host ("[OK] {0} {1}" -f $code, $route)
    } else {
      Write-Host ("[CHECK] {0} {1}" -f $code, $route)
      $failed++
    }
  } catch {
    $code = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      try { $code = [int]$_.Exception.Response.StatusCode } catch { $code = $null }
    }
    $displayCode = "ERR"
    if ($null -ne $code) { $displayCode = $code }
    Write-Host ("[FAIL] {0} {1} - {2}" -f $displayCode, $route, $_.Exception.Message)
    $failed++
  }
}

if ($failed -gt 0) {
  Write-Host ("Smoke test finished with {0} failed/check item(s)." -f $failed)
  exit 1
}

Write-Host "Smoke test finished successfully."
exit 0