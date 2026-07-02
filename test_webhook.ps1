$secret = "00a84421f6cac337e94a8a6ee492a959"
$payload = Get-Content -Raw "test_webhook.json"

$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($secret)
$hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($payload))
$signature = "sha256=" + [BitConverter]::ToString($hash).Replace("-", "").ToLower()

$headers = @{
    "Content-Type" = "application/json"
    "X-Hub-Signature-256" = $signature
}

try {
    $response = Invoke-RestMethod -Uri "https://hub.makeiteasycol.com/whatsapp" -Method Post -Headers $headers -Body $payload
    Write-Output "RESPUESTA DEL SERVIDOR:"
    $response | ConvertTo-Json
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $body = $_.ErrorDetails.Message
    Write-Output "Error HTTP $statusCode :"
    Write-Output $body
}
