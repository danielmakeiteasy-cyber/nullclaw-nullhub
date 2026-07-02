$token = "EAAPMv6HRiTIBRzrI5lcJpYdffGhl9oiHBNllbpSo4qIX0zUcmqmmCLqigZCLPFeB6ZBDu260ys5Y5KUAwCkE3Yd3cLTWTOEn349uGs0ArDIR9BSphGF9vtxENptZCzcVKBx7PjV9mwqQECiRQUoZCBETjyt1zk3TLweCRGemdGI8MY3jO4N5THIct6ueZBLjvy8tHHX2ZAzZAFzUKnDBXz8DIvWVlEJQXG7z2ZCIEZC7xxBDZAZBYIiCa6msZAQk1NlGyYORrWQyrjnZAVcHYn1FZCsrwy"
$phone_number_id = "1184022858132237"
$to = "573202682664"

$body = @{
    messaging_product = "whatsapp"
    to = $to
    type = "text"
    text = @{ body = "Hola! Soy Valentina 🎺 de Mariachi Pura Sangre. Esta es una prueba directa del token." }
} | ConvertTo-Json -Depth 3

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "https://graph.facebook.com/v18.0/$phone_number_id/messages" -Method Post -Headers $headers -Body $body
    Write-Output "EXITO - Mensaje enviado:"
    $response | ConvertTo-Json
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $errorBody = $_.ErrorDetails.Message
    Write-Output "ERROR HTTP $statusCode :"
    Write-Output $errorBody
}
