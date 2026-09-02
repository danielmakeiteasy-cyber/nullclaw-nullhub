# Make It Easy - Guía de Operaciones de la Agencia

> **Prerrequisito:** Si es un servidor nuevo, primero sigue la guía `Make_It_Easy_VPS_Setup_Guide.md` para dejar la VPS lista.

---

## 🏢 Cómo Funciona la Agencia

Cada cliente vive en su propia "caja fuerte" (contenedor Docker aislado) dentro de **Docker Swarm**. Si un bot falla, los demás siguen funcionando sin enterarse.

### Estructura REAL en el Servidor (VPS)

> [!IMPORTANT]
> Esta es la estructura **correcta** descubierta en producción. Nullclaw NO lee las instrucciones del bot desde `config.json` ni desde un archivo en `/data/`. Las lee desde la carpeta `/workspace/` que él mismo crea automáticamente.

```text
/docker/agency/
├── plantilla/                  # Molde base (no se enciende, solo se clona)
│   └── config.json
│
├── daniel/                     # Cliente activo: Daniel
│   ├── config.json             # Config del bot (tokens, modelo, webhook)
│   └── workspace/              # ← Nullclaw crea esta carpeta automáticamente
│       ├── IDENTITY.md         # ← Nombre y personalidad del bot
│       ├── SOUL.md             # ← Instrucciones, webhooks y comportamiento
│       ├── TOOLS.md            # ← Herramientas disponibles (generado por Nullclaw)
│       ├── AGENTS.md           # ← Config interna de agentes (generado por Nullclaw)
│       ├── USER.md             # ← Info del usuario/cliente (generado por Nullclaw)
│       ├── HEARTBEAT.md        # ← Health check interno (generado por Nullclaw)
│       └── memory.db           # ← Base de datos de memoria de conversaciones
│
└── odontologias/               # Cliente activo: Clínica Dental
    ├── config.json
    └── workspace/
        ├── IDENTITY.md
        ├── SOUL.md
        └── memory.db
```

### ⚠️ El Error Más Común (Leer Obligatorio)

Hay tres errores que hacen que el bot responda genérico sin importar qué pongas:

**Error 1:** Poner las instrucciones en `/data/WORKSPACE.md`.
✅ Lo correcto es poner las instrucciones en `/workspace/SOUL.md`.

**Error 2:** Editar el campo `system_prompt` en el `config.json`.
✅ Lo correcto es editar `IDENTITY.md` y `SOUL.md` en la carpeta `workspace/`.

**Error 3:** Dejar `workspace_path` apuntando a `/nullclaw-data/data`.
✅ Lo correcto es que siempre apunte a `/nullclaw-data/workspace`.

### Principios Clave

**Modelo de IA:** Usamos `openai/gpt-4o-mini`. DeepSeek colapsa con payloads grandes de herramientas, así que lo evitamos.

**Personalidad del Bot:** Se configura en dos archivos dentro de `/workspace/`. El `IDENTITY.md` define el nombre y el emoji. El `SOUL.md` define las instrucciones, el tono y los webhooks de n8n.

**Herramientas:** Usamos la herramienta nativa `http_request` de Nullclaw. Se activa en el `config.json` con `"http_request": { "enabled": true }`.

**Permisos:** Toda carpeta del cliente debe pertenecer al UID `65534` (el usuario interno de Nullclaw). Sin esto, el bot no puede leer ni escribir sus archivos.

**Estabilidad:** Un Cron Job maestro reinicia todos los bots cada 4 horas para evitar congelamientos.

---

## 🚀 Alta de un Nuevo Cliente (Paso a Paso Completo)

Ejemplo: llega un nuevo cliente llamado **Pizzería Napoli**.

### Paso 1 — Clonar la plantilla
```bash
cp -r /docker/agency/plantilla /docker/agency/pizzeria
```

### Paso 2 — Editar `config.json`
Abre el archivo con nano:
```bash
nano /docker/agency/pizzeria/config.json
```

Dentro del archivo cambia **tres cosas**:
- El `id` del agente: cambia `agente-plantilla` → `agente-pizzeria`
- El `bot_token` de Telegram: pega el token que te dio @BotFather
- El `agent_id` de Telegram: cambia `agente-plantilla` → `agente-pizzeria`

El campo `workspace_path` déjalo exactamente como está: `/nullclaw-data/workspace`. No lo toques.

El bloque `http_request` debe estar presente (sin él, el bot no puede llamar webhooks):
```json
"http_request": {
  "enabled": true,
  "max_response_size": 1000000,
  "timeout_secs": 120,
  "allowed_domains": ["*"]
}
```

> [!IMPORTANT]
> **Seguridad en n8n:** Si tu webhook de n8n requiere usuario y contraseña (Basic Auth), debes incluir el header `Authorization` en el `SOUL.md`. Sin él, el bot recibirá un error 401 y no podrá ejecutar acciones.

### Paso 3 — Asignar permisos y levantar el bot
Antes de editar la personalidad, levantamos el bot una vez para que Nullclaw cree la carpeta `workspace/` automáticamente:

```bash
# Asignar permisos al usuario de Nullclaw
chown -R 65534:65534 /docker/agency/pizzeria/

# Levantar el servicio en Docker Swarm
docker service create \
  --name agency_pizzeria \
  --replicas 1 \
  --restart-condition on-failure \
  --limit-memory 512m \
  --network easypanel \
  --publish 3001:3000 \
  --mount type=bind,source=/docker/agency/pizzeria,target=/nullclaw-data \
  nullclaw:agency
```

Espera 15 segundos y verifica que la carpeta `workspace/` fue creada:
```bash
ls -la /docker/agency/pizzeria/workspace/
```
Deberías ver los archivos: `IDENTITY.md`, `SOUL.md`, `TOOLS.md`, etc.

### Paso 4 — Inicializar los archivos del workspace
Usamos el comando oficial de Nullclaw para asegurarnos de que los archivos existen con el formato correcto:
```bash
docker run -it --rm \
  -v /docker/agency/pizzeria:/nullclaw-data \
  nullclaw:agency workspace reset-md
```
Deberías ver: `Workspace markdown reset complete: rewrote 7 file(s)`.

### Paso 4b — Verificar que `TOOLS.md` tiene `http_request` activo

Este paso es **obligatorio** si el bot va a llamar webhooks de n8n. El archivo `TOOLS.md` lista las herramientas que Nullclaw le da al bot. Si `http_request` no aparece ahí, el bot no puede hacer llamadas externas.

Verifica el contenido:
```bash
cat /docker/agency/pizzeria/workspace/TOOLS.md
```

Busca que tenga una sección como esta:
```
## http_request
enabled: true
```

Si **no aparece** o dice `enabled: false`, el problema está en el `config.json`. Ábrelo y verifica que este bloque esté presente:
```bash
nano /docker/agency/pizzeria/config.json
```

Debe contener:
```json
"autonomy": {
  "level": "autonomous"
},
"security": {
  "sandbox": {
    "enabled": false
  }
},
"http_request": {
  "enabled": true,
  "max_response_size": 1000000,
  "timeout_secs": 120,
  "allowed_domains": ["*"]
}
```

Si lo agregaste o modificaste, reinicia el bot y ejecuta `workspace reset-md` de nuevo para que Nullclaw regenere el `TOOLS.md` con la herramienta activada:
```bash
docker service update --force agency_pizzeria
docker run -it --rm \
  -v /docker/agency/pizzeria:/nullclaw-data \
  nullclaw:agency workspace reset-md
cat /docker/agency/pizzeria/workspace/TOOLS.md
```

> [!IMPORTANT]
> Sin `http_request` activo en el `TOOLS.md`, el bot ignora completamente las instrucciones del `SOUL.md` que dicen "usa http_request". El bot intenta hacerlo pero no tiene la herramienta disponible, así que simplemente no llama al webhook y responde de memoria.

### Paso 5 — Editar `IDENTITY.md` (Nombre y Personalidad)
Este archivo define quién ES el bot:
```bash
nano /docker/agency/pizzeria/workspace/IDENTITY.md
```
Contenido mínimo:
```markdown
- **Name:** Napoli
- **Creature:** AI assistant
- **Vibe:** warm, friendly, helpful
- **Emoji:** 🍕
```

### Paso 6 — Editar `SOUL.md` (Instrucciones y Webhooks)
Este es el archivo más importante. Aquí defines QUÉ hace el bot y CÓMO llama a n8n:
```bash
nano /docker/agency/pizzeria/workspace/SOUL.md
```
Contenido:
```markdown
Eres Napoli, el asistente oficial de la Pizzería Napoli. Tu función es
ayudar a los clientes a ver el menú, hacer pedidos y resolver dudas.

Para cualquier acción externa DEBES usar la herramienta http_request:
- URL: https://n8n.makeiteasycol.com/webhook/pizzeria
- Método: POST
- Headers: {"Content-Type": "application/json"}

Si n8n requiere autenticación Basic Auth, agrega:
- Authorization: Basic TU_CODIGO_BASE64_AQUI

Sé siempre amable y confirma cada pedido con un resumen claro.
```

### Paso 7 — Reiniciar para aplicar los cambios
```bash
docker service update --force agency_pizzeria
```

### Paso 8 — Verificar que funciona
```bash
docker service logs agency_pizzeria --tail 20
```
Deberías ver:
```
agente-pizzeria → openai/gpt-4o-mini
telegram polling thread started
```

### Paso 9 — Prueba de identidad (La Prueba Definitiva)
Antes de entregar al cliente, prueba el bot directamente desde la terminal sin depender de Telegram:
```bash
docker run -it --rm \
  -v /docker/agency/pizzeria:/nullclaw-data \
  nullclaw:agency agent -m "quien eres"
```
Si responde como Napoli de la pizzería → ¡Éxito total! 🍕

---

## 📚 Cargar Archivos de Conocimiento (RAG)

Si quieres que el bot sepa información específica del negocio (precios, menú, FAQs), usa la carpeta `data/knowledge/`.

Información **corta** como horarios o la URL del webhook va directo en `SOUL.md`. Información **extensa** como un menú de 50 items o una lista larga de preguntas frecuentes va en archivos de conocimiento para no saturar al bot.

```bash
# 1. Crear la carpeta de conocimiento
mkdir -p /docker/agency/pizzeria/data/knowledge

# 2. Crear los archivos base
touch /docker/agency/pizzeria/data/knowledge/menu.md
touch /docker/agency/pizzeria/data/knowledge/precios.md
touch /docker/agency/pizzeria/data/knowledge/faqs.md

# 3. Llenar cada archivo con información real del negocio
nano /docker/agency/pizzeria/data/knowledge/menu.md
```

Cada vez que modifiques los archivos de conocimiento, aplica los permisos y reinicia:
```bash
chown -R 65534:65534 /docker/agency/pizzeria/data/knowledge
docker service update --force agency_pizzeria
```

---

## 📝 Editar un Cliente Existente

Si necesitas cambiar el comportamiento, personalidad o herramientas de un bot activo:

Para cambiar el **nombre o personalidad** del bot:
```bash
nano /docker/agency/daniel/workspace/IDENTITY.md
```

Para cambiar las **instrucciones, tono o URL del webhook**:
```bash
nano /docker/agency/daniel/workspace/SOUL.md
```

Para cambiar el **token de Telegram o el modelo de IA**:
```bash
nano /docker/agency/daniel/config.json
```

Siempre termina con el reinicio obligatorio (sin esto, los cambios no se aplican):
```bash
docker service update --force agency_daniel
```

---

## 🔄 Reset Completo de un Bot

Útil cuando el bot está confundido con historial viejo o cuando lo vas a entregar a un cliente nuevo:

```bash
# Borrar toda la memoria de conversaciones
rm -f /docker/agency/pizzeria/workspace/memory.db
rm -f /docker/agency/pizzeria/workspace/memory.db-shm
rm -f /docker/agency/pizzeria/workspace/memory.db-wal

# Reiniciar el servicio con pizarrón en blanco
docker service update --force agency_pizzeria
```

---

## 🔍 Comandos del Día a Día

### Monitoreo

Ver todos los clientes activos:
```bash
docker service ls | grep agency_
```

Ver los logs en vivo de un cliente:
```bash
docker service logs agency_daniel -f --tail 50
```

Ver cuánta RAM está usando cada bot:
```bash
docker stats --no-stream
```

Ver la configuración que Nullclaw está leyendo actualmente:
```bash
docker run --rm -v /docker/agency/daniel:/nullclaw-data nullclaw:agency config show
```

Probar la identidad del bot desde la terminal (sin Telegram):
```bash
docker run --rm -v /docker/agency/daniel:/nullclaw-data nullclaw:agency agent -m "quien eres"
```

### Control de Clientes

Pausar un bot (por ejemplo, por falta de pago del cliente):
```bash
docker service scale agency_daniel=0
```

Reactivar un bot pausado:
```bash
docker service scale agency_daniel=1
```

Reiniciar un bot que está congelado:
```bash
docker service update --force agency_daniel
```

Eliminar un cliente definitivamente (borra todo):
```bash
docker service rm agency_pizzeria && rm -rf /docker/agency/pizzeria/
```

### Diagnóstico Rápido

**El bot no responde en Telegram:** Revisa los logs del servicio.
```bash
docker service logs agency_daniel --tail 30
```

**El bot responde genérico (sin identidad):** El `SOUL.md` está vacío o con contenido de plantilla. Ábrelo y edítalo.
```bash
nano /docker/agency/daniel/workspace/SOUL.md
docker service update --force agency_daniel
```

**La carpeta workspace está vacía:** Ejecuta el comando de inicialización oficial.
```bash
docker run --rm -v /docker/agency/daniel:/nullclaw-data nullclaw:agency workspace reset-md
```

**El bot no llama a n8n:** Verifica que la URL y los headers en `SOUL.md` sean correctos. Si n8n pide autenticación, asegúrate de que el header `Authorization: Basic ...` esté incluido.

**El webhook de n8n no recibe nada:** Prueba el webhook directamente desde el servidor.
```bash
curl -sS -X POST https://TU_DOMINIO/webhook/pizzeria \
  -H "Content-Type: application/json" \
  -d '{"action":"test"}'
```

**Dos bots peleando por el mismo token:** Detén el servicio, espera 5 segundos y vuelve a levantarlo.
```bash
docker service scale agency_daniel=0
# Espera 5 segundos
docker service scale agency_daniel=1
```

**Contenedor zombie (CPU al 90%):** Si el servidor se pone lento y `top` muestra `nullclaw` consumiendo 90%+ de CPU, puede ser por dos causas:
1. Dos instancias peleando por el mismo token de Telegram.
2. Un bug en el accept loop del gateway HTTP (versión `dev` del binario). Solución: actualizar Nullclaw (ver sección abajo).

Parche temporal mientras investigas:
```bash
docker service scale agency_daniel=0
# O limitar la CPU sin apagar:
docker service update --limit-cpu 0.10 agency_daniel
```

---

## 🔄 Actualizar Nullclaw

### Verificar si hay actualizaciones
```bash
docker run --rm -v /docker/agency/daniel:/nullclaw-data nullclaw:agency update --check
```

### Aplicar la actualización
```bash
# 1. Descargar e instalar la nueva versión (requiere --user root)
docker run -it --user root --name nullclaw-update nullclaw:agency update --yes

# 2. Guardar la imagen actualizada (restaurando el CMD correcto)
docker commit --change='CMD ["gateway"]' nullclaw-update nullclaw:agency

# 3. Limpiar el contenedor temporal
docker rm nullclaw-update

# 4. Reiniciar todos los servicios con la nueva versión
docker service update --force agency_daniel
docker service update --force agency_odontologias
```

> [!IMPORTANT]
> El paso `--change='CMD ["gateway"]'` es **obligatorio** al hacer `docker commit`. Sin él, la imagen queda con el comando `update` como predeterminado y los contenedores no arrancan correctamente.

### Verificar la versión activa
```bash
docker run --rm nullclaw:agency --version
```

---

## 🔬 Diagnóstico de CPU Alta (Procedimiento Forense)

Si `top` muestra procesos `nullclaw` consumiendo mucha CPU, sigue este procedimiento:

### Paso 1: Identificar los procesos
```bash
top -o %CPU
```

### Paso 2: Ver qué está haciendo el proceso internamente
```bash
sudo strace -f -e trace=epoll_wait,accept4,poll -p <PID> 2>&1 | head -n 50
```
- Si ves `accept4` sin `epoll_wait` → bug del busy-loop → actualizar Nullclaw.
- Si ves `connect` fallando → problema de red o token inválido.

### Paso 3: Ver los logs del contenedor
```bash
docker logs --tail 100 $(docker ps -q --filter ancestor=nullclaw:agency | head -n 1)
```

### Paso 4: Ejecutar diagnóstico interno
```bash
docker run --rm -v /docker/agency/daniel:/nullclaw-data nullclaw:agency doctor
```


---

## 🎓 Lecciones Aprendidas — Canal WhatsApp con NullHub (Producción Junio 2026)

> Estas lecciones vienen del despliegue real de **Valentina** para **Mariachi Pura Sangre** (Dallas, Texas). Aplican a cualquier bot de WhatsApp gestionado con NullHub nativo (sin Docker).

### ⚠️ Los 5 Errores que Impiden que el Bot Responda

| Error | Síntoma | Solución |
|-------|---------|----------|
| Modelo mal escrito (`gpt-4.1`) | Bot acepta mensajes pero nunca responde | Cambiar a `openai/gpt-4o-mini` en config.json |
| `allowed_domains: []` vacío | Bot no puede llamar a n8n | Cambiar a `allowed_domains: ["*"]` |
| `memory.db` contaminado | Bot ignora SOUL.md y responde genérico | Borrar memory.db y reiniciar |
| Falta IDENTITY.md o SOUL.md | Bot responde como IA genérica | Ambos archivos deben existir en workspace |
| Access token expirado (24h) | Bot responde en NullHub pero NO llega a WhatsApp | Generar nuevo token en Meta Developers |

### 🔑 El Dilema del `app_secret`

El `app_secret` controla quién puede enviarle mensajes al bot:

- **Con `app_secret` configurado** → Meta (mensajes reales de WhatsApp) ✅ pasan. Scripts de prueba sin firma HMAC ❌ son rechazados.
- **Con `app_secret` vacío `""`** → Scripts de prueba ✅ pasan. Mensajes reales de WhatsApp ❌ son rechazados.

**Script PowerShell para pruebas con firma HMAC correcta** (funciona con `app_secret` activo):
```powershell
# test_webhook.ps1
$secret = "TU_APP_SECRET_AQUI"
$payload = Get-Content -Raw "test_webhook.json"
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($secret)
$hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($payload))
$signature = "sha256=" + [BitConverter]::ToString($hash).Replace("-", "").ToLower()
$headers = @{ "Content-Type" = "application/json"; "X-Hub-Signature-256" = $signature }
Invoke-RestMethod -Uri "https://hub.tudominio.com/whatsapp" -Method Post -Headers $headers -Body $payload
```

### 📦 Subir SOUL.md e IDENTITY.md sin Errores de Caracteres

**Método seguro con base64** (evita que los backticks y símbolos especiales rompan el heredoc):
```powershell
# En PowerShell local — convierte el archivo a base64:
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\ruta\SOUL.md'))
```
```bash
# En el servidor VPS — decodifica y escribe:
echo "BASE64_STRING" | base64 -d > /root/.nullhub/instances/nullclaw/INSTANCIA/workspace/SOUL.md
echo "BASE64_STRING" | base64 -d > /root/.nullhub/instances/nullclaw/INSTANCIA/workspace/IDENTITY.md
```

Formato correcto del `IDENTITY.md` (con los 4 campos):
```markdown
- **Name:** Valentina
- **Creature:** AI assistant
- **Vibe:** warm, friendly, helpful
- **Emoji:** 🎺
```

### 🔄 Cómo Reiniciar NullClaw (nullhub restart no implementado aún)

```bash
# Mata el proceso — NullHub lo levanta automáticamente en ~5 segundos
pkill nullclaw

# Verifica que volvió
sleep 5 && pgrep -a nullclaw
```

### 🧹 Limpiar Memoria Contaminada (obligatorio al cambiar SOUL)

```bash
rm /root/.nullhub/instances/nullclaw/INSTANCIA/workspace/memory.db* && echo "OK"
pkill nullclaw
```

### 🔍 Verificar el Estado Completo del Bot (comando de diagnóstico)

```bash
echo "=== ARCHIVOS ===" && ls -la /root/.nullhub/instances/nullclaw/INSTANCIA/workspace/
echo "=== IDENTITY ===" && cat /root/.nullhub/instances/nullclaw/INSTANCIA/workspace/IDENTITY.md
echo "=== SOUL (inicio) ===" && head -5 /root/.nullhub/instances/nullclaw/INSTANCIA/workspace/SOUL.md
echo "=== PROCESO ===" && pgrep -a nullclaw
```

