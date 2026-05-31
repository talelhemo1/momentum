# Production voice RSVP probes (no secrets)
$ErrorActionPreference = "Stop"
$base = "https://moomentum.events"

Write-Host "=== NLPearl webhook GET ==="
$r1 = Invoke-RestMethod -Uri "$base/api/webhooks/nlpearl" -Method GET
$r1 | ConvertTo-Json

Write-Host "`n=== Voice campaign start (no auth, valid guest) ==="
$body = @{
  eventId = "diag-probe"
  scope   = "not_confirmed"
  guests  = @(
    @{
      id     = "g1"
      name   = "Probe"
      phone  = "0501234567"
      status = "pending"
    }
  )
  event = @{ hostName = "Test" }
} | ConvertTo-Json -Depth 6
$r2 = Invoke-RestMethod -Uri "$base/api/guests/voice-campaign/start" -Method POST -ContentType "application/json; charset=utf-8" -Body $body
$r2 | ConvertTo-Json -Depth 6

Write-Host "`n=== Diagnose endpoint (not deployed if 404) ==="
try {
  $r3 = Invoke-WebRequest -Uri "$base/api/guests/voice-campaign/diagnose" -Method GET -UseBasicParsing
  Write-Host "Status:" $r3.StatusCode
  Write-Host $r3.Content
} catch {
  Write-Host "Status:" $_.Exception.Response.StatusCode.value__
}
