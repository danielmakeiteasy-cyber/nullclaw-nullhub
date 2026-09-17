# Make It Easy - Guía de N8N: Configuración y Solución de Problemas

> Esta guía documenta la configuración real de n8n en el servidor de Make It Easy y los problemas reales encontrados en producción con sus soluciones exactas.

---

## 📁 Ubicación y Arquitectura de N8N

N8N corre como un contenedor Docker independiente gestionado con `docker-compose`, **NO** dentro de Docker Swarm. Está detrás de Nginx que actúa como proxy reverso.

```text
/docker/n8n-k4xc/
└── docker-compose.yml      ← Configuración completa de n8n y Redis
```

El dominio público es: `https://n8n.makeiteasycol.com`

---

## 📄 Archivo `docker-compose.yml` Oficial

Este es el archivo correcto y probado en producción:

```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n
    container_name: n8n-makeiteasy
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true
      - N8N_SECURE_COOKIE=true
      - WEBHOOK_URL=https://n8n.makeiteasycol.com/
      - N8N_EDITOR_BASE_URL=https://n8n.makeiteasycol.com/
      - N8N_PROXY_HOPS=1
      - NODE_ENV=production
      - GENERIC_TIMEZONE=America/Bogota
      - TZ=America/Bogota
    volumes:
      - n8n_data:/home/node/.n8n

  redis:
    image: redis:alpine
    container_name: n8n-redis
    restart: always

volumes:
  n8n_data:
```

### Variables de entorno críticas explicadas:

**`WEBHOOK_URL`** — Le dice a n8n cuál es su URL pública para los webhooks de los flujos. Sin esto, los webhooks no funcionan.

**`N8N_EDITOR_BASE_URL`** — Le dice a n8n cuál es su URL pública para el callback de OAuth2 (Google Calendar, Google Sheets, etc.). Sin esto, la autenticación con Google falla con error `There was a problem generating the authorization URL`.

**`N8N_PROXY_HOPS=1`** — Le indica a n8n que está detrás de un proxy reverso (Nginx) y que debe confiar en el header `X-Forwarded-Proto`. Sin esto, n8n no sabe que está detrás de HTTPS.

---

## 🔧 Comandos de Operación Diaria

### Iniciar n8n:
```bash
cd /docker/n8n-k4xc && docker compose up -d
```

### Detener n8n:
```bash
cd /docker/n8n-k4xc && docker compose down
```

### Ver logs en vivo:
```bash
docker logs n8n-makeiteasy -f
```

### Verificar que n8n está respondiendo:
```bash
curl -s http://127.0.0.1:5678/healthz
```
Debe responder: `{"status":"ok"}`

### Ver uso de recursos:
```bash
docker stats n8n-makeiteasy --no-stream
```

---

## ⚠️ Problemas Reales y Sus Soluciones

### Problema 1: `503 Service Unavailable` — "Database is not ready!"

**Cuándo ocurre:** Justo después de arrancar n8n, especialmente luego de una actualización de Easypanel o después de múltiples reinicios forzados.

**Causa:** N8N está ejecutando migraciones internas de su base de datos SQLite. Durante este proceso, el servidor responde `503` porque la base de datos no está lista para consultas. Esto es **completamente normal**.

**Solución:** Esperar. N8N puede tardar entre 3 y 7 minutos en terminar las migraciones después de una actualización. No tocar nada durante ese tiempo.

Para verificar que terminó:
```bash
# Monitorear el CPU - cuando baje de 100%, las migraciones terminaron
docker stats n8n-makeiteasy --no-stream

# Verificar que responde
curl -s http://127.0.0.1:5678/healthz
```

> [!IMPORTANT]
> La tentación es reiniciar el contenedor cuando ves el 503. **NO lo hagas.** Reiniciar n8n durante las migraciones puede corromper la base de datos y crear el problema que intentas resolver.

---

### Problema 2: `502 Bad Gateway` — N8N no arranca

**Cuándo ocurre:** N8N no responde en el puerto 5678, Nginx no puede contactarlo.

**Diagnóstico:**
```bash
# Verificar si el contenedor está corriendo
docker ps | grep n8n-makeiteasy

# Ver si hay logs de error
docker logs n8n-makeiteasy --tail 30

# Probar conectividad directa
curl -v http://127.0.0.1:5678/healthz
```

**Causa A — Logs vacíos + "Connection reset by peer":** N8N se está inicializando y todavía no abrió el puerto. Espera 2-3 minutos más.

**Causa B — Logs muestran "Database connection timed out" repetidamente:** La base de datos tiene archivos de bloqueo residuales de un crash anterior.

Solución para Causa B:
```bash
cd /docker/n8n-k4xc && docker compose down
docker run --rm -v n8n-k4xc_n8n_data:/data alpine sh -c \
  'rm -f /data/crash.journal /data/database.sqlite-shm /data/database.sqlite-wal'
docker compose up -d
# Esperar 5 minutos
sleep 300 && curl -s http://127.0.0.1:5678/healthz
```

---

### Problema 3: `504 Gateway Time-out` — N8N responde muy lento

**Cuándo ocurre:** Nginx recibe la petición pero n8n no responde a tiempo.

**Causa:** N8N está ocupado con migraciones o su proceso Node.js se congeló.

**Verificar si el proceso está vivo:**
```bash
docker exec n8n-makeiteasy ps
```
Debe mostrar un proceso `node /usr/local/bin/n8n`.

**Verificar CPU:**
```bash
docker stats n8n-makeiteasy --no-stream
```
Si CPU > 200%, está corriendo migraciones. Espera.
Si CPU = 0%, el proceso se congeló. Reinicia:
```bash
cd /docker/n8n-k4xc && docker compose restart
# Esperar 5 minutos antes de probar
```

---

### Problema 4: OAuth2 no funciona — "There was a problem generating the authorization URL"

**Cuándo ocurre:** Al intentar conectar credenciales de Google (Calendar, Sheets, Gmail, etc.).

**Causa:** Falta la variable `N8N_EDITOR_BASE_URL` en el `docker-compose.yml`.

**Solución:** Verificar que el `docker-compose.yml` tenga esta variable:
```
- N8N_EDITOR_BASE_URL=https://n8n.makeiteasycol.com/
```

Si no está, agregarla y reiniciar:
```bash
cd /docker/n8n-k4xc && docker compose down && docker compose up -d
```

---

### Problema 5: N8N no arranca tras actualización de Easypanel

**Cuándo ocurre:** Easypanel se actualiza automáticamente (en este caso a la versión 2.29.0) y después n8n queda inestable.

**Causa:** La actualización de Easypanel puede causar que n8n reinicie abruptamente, dejando archivos de bloqueo y el archivo `crash.journal` en el volumen de datos.

**Diagnóstico completo:**
```bash
# Ver el estado de los archivos de datos
docker run --rm -v n8n-k4xc_n8n_data:/data alpine ls -lah /data

# Verificar integridad de la base de datos
docker run --rm -v n8n-k4xc_n8n_data:/data alpine sh -c \
  "apk add --no-cache sqlite && sqlite3 /data/database.sqlite 'PRAGMA integrity_check;'"
```
Si responde `ok`, la base de datos está intacta. El problema son archivos temporales.

**Solución:**
```bash
cd /docker/n8n-k4xc && docker compose down

# Limpiar archivos de bloqueo y logs de eventos grandes
docker run --rm -v n8n-k4xc_n8n_data:/data alpine sh -c \
  'rm -f /data/crash.journal /data/database.sqlite-shm /data/database.sqlite-wal /data/n8nEventLog-1.log /data/n8nEventLog-2.log /data/n8nEventLog-3.log'

docker compose up -d
# Esperar 5 minutos completos
sleep 300 && curl -s http://127.0.0.1:5678/healthz
```

---

### Problema 6: El servidor tiene `*** System restart required ***`

**Cuándo ocurre:** Visible al hacer SSH al servidor. Indica actualizaciones pendientes del kernel o del sistema.

**Por qué importa:** Un servidor con actualizaciones pendientes del kernel puede tener comportamientos impredecibles en Docker: conexiones SSH que se caen, contenedores que no imprimen logs, procesos zombie.

**Solución:** Reiniciar el servidor desde el panel de Hostinger o con:
```bash
reboot
```

Después del reinicio, esperar 2 minutos y reconectarse por SSH. Luego levantar n8n:
```bash
cd /docker/n8n-k4xc && docker compose up -d
sleep 300 && curl -s http://127.0.0.1:5678/healthz
```

> [!IMPORTANT]
> Después de reiniciar el servidor, Docker puede no estar en el PATH en sesiones SSH nuevas. Si `docker` dice "command not found", ejecuta: `export PATH=$PATH:/usr/bin:/usr/local/bin`

---

### Problema 7: Editas un nodo del workflow pero n8n sigue ejecutando el código viejo

**Cuándo ocurre:** parcheas un nodo (Code, Set, etc.) directamente en la base de datos o el
workflow se comporta como si tus cambios no existieran, aunque el editor muestre el código nuevo.

**Causa (n8n ≥ 2.x, verificado en 2.11.2):** con workflows **publicados**, el trigger ejecuta la
**versión publicada** guardada en la tabla `workflow_history` (la que apunta
`workflow_entity.activeVersionId`), NO el draft de `workflow_entity.nodes`. Si parcheas solo
`workflow_entity`, la UI muestra tu cambio pero producción sigue corriendo el historial viejo.

**Solución:** aplicar el parche en **AMBAS tablas** y luego reiniciar el contenedor:

```bash
# 1. Respaldar SIEMPRE antes de tocar la BD (los 3 archivos JUNTOS: sqlite + wal + shm)
mkdir -p /root/n8n_backup_$(date +%Y%m%d) && cd /root/n8n_backup_$(date +%Y%m%d)
cp /var/lib/docker/volumes/n8n-k4xc_n8n_data/_data/database.sqlite* .

# 2. Actualizar el nodo en workflow_entity Y en la última fila de workflow_history
#    de ese workflow (la apuntada por activeVersionId)

# 3. Reiniciar y VERIFICAR CON UNA EJECUCIÓN REAL (no fiarse solo del editor)
cd /docker/n8n-k4xc && docker compose restart
```

> [!IMPORTANT]
> Al copiar la BD para inspeccionarla, lleva `database.sqlite` + `-wal` + `-shm` **juntos**.
> Si copias solo el `.sqlite`, los cambios recientes viven en el WAL y verás datos viejos.

### Problema 8: Eventos de Google Calendar fallan silenciosamente (crear/mover/eliminar)

**Patrones de bug reales encontrados en producción (agente Daniel, 2026-09-10).** Sirven para
cualquier workflow de calendario:

**Bug 8a — Fin de evento que cruza medianoche:**
```javascript
// ❌ MAL: evento 23:30 → fin 00:30 DEL MISMO día → Google responde "Bad request"
const fin = `${fecha}T${String((hora+1)%24).padStart(2,'0')}:30:00`;

// ✅ BIEN: si la hora+1 pasa de 23:59, el fin rueda al DÍA SIGUIENTE
const [h,m] = hora.split(':').map(Number);
let finH=h, finM=m+30, diaSig=false;          // (o la duración que uses)
if (finM>=60){finM-=60;finH++;}
if (finH>=24){finH-=24;diaSig=true;}
const fechaFin = diaSig ? sumarUnDia(fecha) : fecha;
```

**Bug 8b — Buscar evento solo por título cuando el agente envía `evento_id`:**
```javascript
// ❌ MAL: crash "undefined.toLowerCase" cuando el agente manda evento_id
const ev = eventos.find(e => e.summary.toLowerCase() === body.titulo_evento.toLowerCase());

// ✅ BIEN: match por evento_id primero, fallback a título, y error descriptivo si no hay match
const ev = body.evento_id
  ? eventos.find(e => e.id === body.evento_id)
  : eventos.find(e => (e.summary||'').toLowerCase() === (body.titulo_evento||'').toLowerCase());
if (!ev) return [{ json: { status:"error", mensaje:`Evento no encontrado: ${body.evento_id || body.titulo_evento}` } }];
```

**Bug 8c — `Get Many Events` con `query` vacío devuelve 0 resultados:**
```javascript
// ❌ MAL: query: {{ body.titulo_evento || '' }}  → string vacío → 0 eventos → rama muere en silencio
// ✅ BIEN: quitar el parámetro query y filtrar en el Code node siguiente (patrón 8b)
```

> [!TIP]
> **Contrato webhook recomendado para acciones de calendario:** identifica SIEMPRE los eventos
> por `evento_id` (devuélvelo al crear y al consultar); el título queda como fallback humano.
> `eliminar_evento{evento_id|titulo_evento}` · `mover_evento{evento_id, nueva_fecha, nueva_hora}`.

**Cómo depurar ejecuciones fallidas en la BD (verificado):**

```bash
# El log de eventos por nodo (started/finished/failed, sin stack traces):
/var/lib/docker/volumes/n8n-k4xc_n8n_data/_data/n8nEventLog.log

# Ejecuciones: tabla execution_entity (estado) + execution_data (data = JSON "flattened":
# strings numéricos como "0" son REFERENCIAS por índice a otros nodos, no valores literales.
# Hay que des-referenciarlas recursivamente al leer).
```

## 🔄 Procedimiento de Reset Completo

Si nada funciona y quieres volver a cero (esto **borra todos los flujos y credenciales**):

```bash
cd /docker/n8n-k4xc && docker compose down

# Eliminar el volumen completo
docker volume rm n8n-k4xc_n8n_data

# Volver a crear todo desde cero
docker compose up -d
sleep 120 && curl -s http://127.0.0.1:5678/healthz
```

---

## 🧪 Prueba de Diagnóstico Definitiva

Si n8n no arranca con el volumen de datos, prueba si la imagen misma funciona corriendo sin volumen:

```bash
docker run -d --name n8n-test -p 5679:5678 \
  -e NODE_ENV=production \
  -e GENERIC_TIMEZONE=America/Bogota \
  docker.n8n.io/n8nio/n8n

# Esperar 3 minutos
sleep 180

# Probar con curl verbose para ver la respuesta completa
curl -v http://127.0.0.1:5679/healthz 2>&1

# Limpiar el contenedor de prueba
docker stop n8n-test && docker rm n8n-test
```

**Si responde `{"status":"ok"}`:** La imagen funciona, el problema es el volumen de datos (migraciones lentas o archivos de bloqueo).

**Si no responde:** El problema es la imagen misma. Descarga una versión fresca:
```bash
docker rmi docker.n8n.io/n8nio/n8n
docker pull docker.n8n.io/n8nio/n8n:latest
```
