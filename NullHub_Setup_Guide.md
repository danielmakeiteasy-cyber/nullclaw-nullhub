# Guía Maestra: Instalación Completa de la Agencia con NullHub y n8n

Esta es la guía definitiva para montar el stack completo de la agencia en una nueva VPS desde cero.
Todo corre de forma **nativa** (sin Docker Swarm) usando Nginx, PM2 y Systemd.

> **¿Cuándo usar esta guía?** Cuando contratas una nueva VPS y necesitas dejarla lista para
> operar con bots de NullClaw gestionados desde el panel visual de NullHub.

> **Convención:** En esta guía verás `tudominio.com` como placeholder.
> Reemplázalo por tu dominio real (ej: `makeiteasycol.com`) en TODOS los lugares donde aparezca.

> **📚 Guías Complementarias (Creación de Agentes):**
> Esta guía abarca la instalación del servidor. Una vez finalices, para crear bots SIEMPRE debes consultar:
> - **📖 `deploy_guide.md` (El Paso a Paso Definitivo):** Te lleva de la mano desde que haces clic en "Instalar" en la interfaz web de NullHub, hasta que entras por consola a configurar el `config.json` (quitando el sandbox) y dándole la personalidad. Es tu manual operativo de batalla.
> - **📄 `Plantilla_Cliente_Nullclaw.md`:** Esta la debes tener a la mano porque contiene la base exacta del archivo `config.json` y la estructura de carpetas (`IDENTITY.md`, `SOUL.md`). Te sirve para copiar y pegar sin tener que escribir el código desde cero.

---

## 🏗️ Arquitectura del Servidor

```text
VPS Hostinger (Ubuntu 22.04)
│
├── Nginx  ←  Proxy inverso en puertos 80/443 (SSL con Certbot)
│   ├── hub.tudominio.com   →  NullHub en 127.0.0.1:19800
│   └── n8n.tudominio.com   →  n8n en 127.0.0.1:5678
│
├── n8n (PM2)  ←  Motor de automatizaciones y webhooks
│   └── Recibe llamadas de los bots y ejecuta acciones (Google Sheets, Calendar, etc.)
│
└── NullHub (Systemd)  ←  Dashboard visual de gestión de agentes
    └── Supervisa los procesos de NullClaw:
        ├── daniel     → puerto 3000
        ├── pizzeria   → puerto 3001
        └── ...

FLUJO DE UN MENSAJE:
  Usuario de Telegram
    → NullClaw (bot) recibe el mensaje por Telegram polling
      → NullClaw llama al webhook de n8n con los datos
        → n8n ejecuta la automatización (registra en Sheets, etc.)
          → n8n responde con el resultado
            → NullClaw responde al usuario en Telegram
```

---

## 0️⃣ PASO 0: Crear la VPS y Configurar el DNS

Antes de conectarte al servidor, debes tener listo lo siguiente:

### A. Contratar la VPS en Hostinger
1. Ve a [hostinger.com/vps-hosting](https://www.hostinger.com/vps-hosting).
2. Elige el plan según la cantidad de clientes:

   | Plan  | RAM  | Bots estimados | Precio aprox. |
   |-------|------|----------------|---------------|
   | KVM 1 | 4 GB | Hasta 5 bots   | ~$6 USD/mes   |
   | KVM 2 | 8 GB | Hasta 12 bots  | ~$10 USD/mes  |
   | KVM 4 | 16 GB| Hasta 25 bots  | ~$16 USD/mes  |

   > Recomendación: empieza con **KVM 2 (8 GB)**.

3. Selecciona el sistema operativo: **Ubuntu 22.04 64-bit**.
4. Una vez aprovisionada, copia la **IP pública** del VPS desde el panel de Hostinger.

### B. Configurar los registros DNS
En el panel de tu proveedor de dominio (Cloudflare, Hostinger, GoDaddy, etc.) agrega estos registros tipo `A`:

| Nombre (host) | Tipo | Valor (IP)      | TTL       |
|---------------|------|-----------------|-----------|
| `hub`         | A    | IP de tu VPS    | Automático|
| `n8n`         | A    | IP de tu VPS    | Automático|

> Espera 2-5 minutos para que los DNS se propaguen antes de continuar con el Paso 4.

### C. Conectarte al VPS por SSH
```bash
ssh root@IP_DEL_VPS
```
*(Ingresa la contraseña que configuraste al crear el VPS en Hostinger)*

---

## 🛠️ PASO 1: Preparar el Servidor

Una vez dentro del VPS por SSH, ejecuta todo esto:

```bash
# Actualizar el sistema operativo
apt update && apt upgrade -y

# Crear memoria Swap de 2GB (OBLIGATORIO — evita caídas por falta de RAM)
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Instalar Node.js v20 (requerido por n8n y PM2)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git curl wget unzip

# Instalar Nginx y Certbot (para SSL)
apt install -y nginx certbot python3-certbot-nginx
```

**Verificación obligatoria antes de continuar:**
```bash
node --version    # Debe mostrar v20.x.x
nginx --version   # Debe mostrar nginx/1.x.x
free -h           # En la fila Swap debe mostrar 2.0Gi
```

---

## 🐝 PASO 2: Instalar n8n (Motor de Automatizaciones)

```bash
# Instalar n8n y PM2 globalmente
npm install -g n8n pm2

# Arrancar n8n en el puerto 5678 bajo PM2
pm2 start n8n --name "n8n" -- --port 5678

# Configurar PM2 para que arranque automáticamente con el servidor
pm2 startup
# ⚠️ IMPORTANTE: PM2 imprimirá un comando en pantalla (empieza con "sudo env ...").
#    Cópialo y ejecútalo exactamente como aparece.

# Guardar el estado actual de procesos
pm2 save
```

**Verificación:**
```bash
pm2 status
# n8n debe aparecer con estado "online"
```

---

## 📥 PASO 3: Instalar NullHub (Panel de Gestión de Bots)

> ⚠️ **Advertencia crítica:** NullHub DEBE escuchar únicamente en `127.0.0.1` (localhost).
> Si se expone en `0.0.0.0` (todas las interfaces), el binario crashea con **Segmentation Fault**.
> Nginx se encargará de exponerlo de forma segura al exterior.

```bash
# Descargar el binario de NullHub para Linux x86_64
# Revisa si hay una versión más nueva en: https://github.com/nullclaw/nullhub/releases
curl -LO https://github.com/nullclaw/nullhub/releases/download/v2026.4.17/nullhub-linux-x86_64.bin
chmod +x nullhub-linux-x86_64.bin
mv nullhub-linux-x86_64.bin /usr/local/bin/nullhub

# Verificar instalación
nullhub --version
```

Crear el servicio de Systemd para que NullHub arranque automáticamente:
```bash
nano /etc/systemd/system/nullhub.service
```

Pega este contenido **exactamente** (no cambies nada):
```ini
[Unit]
Description=NullHub Management Dashboard
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/nullhub serve --port 19800 --addr 127.0.0.1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
Guarda y sal: `Ctrl+O` → `Enter` → `Ctrl+X`

```bash
# Activar e iniciar el servicio
systemctl daemon-reload
systemctl enable nullhub
systemctl start nullhub
```

**Verificación:**
```bash
systemctl status nullhub
# Debe mostrar: Active: active (running)

curl -I http://127.0.0.1:19800
# Debe devolver: HTTP/1.1 200 OK
```

---

## 🌐 PASO 4: Configurar Nginx con SSL

> Antes de este paso, verifica que los registros DNS del Paso 0 ya están propagados.
> Prueba con: `ping hub.tudominio.com` — debe responder con la IP de tu VPS.

### A. Configuración Nginx para n8n:
```bash
nano /etc/nginx/sites-available/n8n.tudominio.com
```
*(Reemplaza `n8n.tudominio.com` por tu subdominio real)*

```nginx
server {
    listen 80;
    server_name n8n.tudominio.com;

    location / {
        proxy_pass http://127.0.0.1:5678;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Necesario para que n8n acepte webhooks y conexiones en tiempo real
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### B. Configuración Nginx para NullHub (con bypass CORS y redirección de WhatsApp):
```bash
nano /etc/nginx/sites-available/hub.tudominio.com
```
*(Reemplaza `hub.tudominio.com` por tu subdominio real)*

```nginx
server {
    listen 80;
    server_name hub.tudominio.com;

    location / {
        proxy_pass http://127.0.0.1:19800;

        # CRÍTICO: Sin estos 3 headers, NullHub arroja "VALIDATION FAILED: FORBIDDEN ORIGIN"
        # y bloquea toda la interfaz gráfica. Nginx simula que las peticiones
        # vienen del localhost para que NullHub las acepte.
        proxy_set_header Host "127.0.0.1:19800";
        proxy_set_header Origin "http://127.0.0.1:19800";
        proxy_set_header Referer "http://127.0.0.1:19800";

        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Necesario para logs en tiempo real (SSE y WebSockets)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_cache off;
    }

    # Redirección segura para el Webhook de WhatsApp de Meta
    location /whatsapp {
        proxy_pass http://127.0.0.1:3001/whatsapp;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```

### C. Activar sitios y obtener SSL:
```bash
# Habilitar ambos sitios
ln -s /etc/nginx/sites-available/n8n.tudominio.com /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/hub.tudominio.com /etc/nginx/sites-enabled/

# Verificar que la sintaxis de Nginx es correcta
nginx -t
# Debe decir: configuration file ... test is successful

# Aplicar los cambios
systemctl restart nginx

# Obtener certificados SSL (ejecuta uno a la vez)
certbot --nginx -d n8n.tudominio.com
certbot --nginx -d hub.tudominio.com
```

**Verificación final del Paso 4:**
- Abre `https://n8n.tudominio.com` → debe cargar el login de n8n con candado 🔒
- Abre `https://hub.tudominio.com` → debe cargar el dashboard de NullHub con candado 🔒

---

## 🤖 PASO 5: Crear un Agente desde NullHub (100% Gráfico)

1. Ve a `https://hub.tudominio.com` en tu navegador.
2. Haz clic en **INSTALL COMPONENT** → **NULLCLAW**.
3. Completa el asistente de 3 pasos:

   **Pantalla 1 — Setup:**
   | Campo         | Qué poner |
   |---------------|-----------|
   | INSTANCE NAME | Nombre del cliente en minúsculas y sin espacios (ej: `pizzeria`) |
   | VERSION       | Selecciona la más reciente recomendada |
   | PROVIDER      | `OpenAI (GPT direct)` o `OpenRouter` |
   | API KEY       | La API Key del proveedor de IA |
   | MODEL         | `gpt-4o-mini` (mejor balance de costo y rendimiento) |

    **Pantalla 2 — Channels:**
    
    *Si usas Telegram:*
    | Campo      | Qué poner |
    |------------|-----------|
    | Canal      | Selecciona **TELEGRAM** |
    | BOT TOKEN  | El token que entrega `@BotFather` |
    | ALLOW FROM | `*` (cualquier usuario puede escribir al bot) |

    *Si usas WhatsApp (Meta):*
    | Campo           | Qué poner |
    |-----------------|-----------|
    | Canal           | Selecciona **WHATSAPP** |
    | PROVIDER        | `meta` |
    | PHONE NUMBER ID | El identificador del número de teléfono en Meta |
    | ACCESS TOKEN    | El token de acceso del sistema de Meta (largo) |
    | VERIFY TOKEN    | Un token de verificación único inventado por ti (ej: `mariachi_pura_sangre_verify_token_2026`) |
    | ALLOW FROM      | `*` |

    **Pantalla 3 — Settings:**
    | Campo           | Qué poner    |
    |-----------------|--------------|
    | MEMORY BACKEND  | `sqlite`     |
    | TUNNEL PROVIDER | `NONE`       |
    | AUTONOMY LEVEL  | `SUPERVISED` |

4. Haz clic en **INSTALL**. NullHub descargará NullClaw, creará la instancia y la arrancará automáticamente.

---

## 🔗 PASO 5.5: Configurar el Webhook de WhatsApp en Meta Developers

Para conectar el canal de WhatsApp de Meta con tu agente de NullClaw, realiza los siguientes pasos:

1. Ve a [developers.facebook.com](https://developers.facebook.com) e ingresa a tu App.
2. En la barra lateral, ve a **WhatsApp** → **Configuración**.
3. En la sección **Webhook**, haz clic en **Editar**:
   - **URL de devolución de llamada:** `https://hub.tudominio.com/whatsapp` (Nginx lo redirigirá internamente al puerto `3001/whatsapp` de tu agente de forma cifrada). *Nota: si usas otra instancia con puerto distinto, ajusta la regla en Nginx.*
   - **Token de verificación:** El mismo token de verificación único que pusiste en el Verify Token del agente en NullHub.
4. Haz clic en **Verificar y guardar**.
5. En la lista de campos de Webhook, busca el evento **`messages`** y haz clic en **Suscribirse**. ¡De lo contrario, Meta no enviará las llamadas entrantes!

---

## 🔗 PASO 6: Conectar el Bot con n8n (Conexión Central)

Esta conexión es la que hace que los bots puedan ejecutar acciones reales en el negocio del cliente.

### A. Crear el workflow y webhook en n8n:
1. Abre `https://n8n.tudominio.com`. **La primera vez** te pedirá crear un usuario administrador (nombre, email y contraseña). Hazlo y guarda esas credenciales.
2. Crea un **nuevo workflow**.
3. Agrega un nodo **Webhook** como primer nodo:
   - **HTTP Method:** `POST`
   - **Path:** nombre del cliente (ej: `pizzeria`)
4. La URL resultante será: `https://n8n.tudominio.com/webhook/pizzeria`
5. Conecta el webhook con los nodos de acción (Google Sheets, Gmail, Calendar, etc.).
6. **Activa el workflow** con el toggle **Active** (esquina superior derecha). Sin activarlo, el webhook no recibe nada.

### B. Ver y Editar el SOUL.md del agente:
El `SOUL.md` es el cerebro del bot: le dice quién es y cómo debe llamar al webhook de n8n.

Conéctate al VPS por SSH. Reemplaza `pizzeria` por el nombre real del agente:

**Solo VER el contenido actual (sin modificar nada):**
```bash
cat ~/.nullhub/instances/nullclaw/pizzeria/workspace/SOUL.md
```

**Editar el contenido:**
```bash
nano ~/.nullhub/instances/nullclaw/pizzeria/workspace/SOUL.md
```
*Dentro de nano: edita el texto → guarda con `Ctrl+O` → `Enter` → sal con `Ctrl+X`*

Plantilla base (adáptala al cliente):
```markdown
Eres Napoli, el asistente oficial de Pizzería Napoli.
Ayudas a los clientes a consultar el menú, registrar pedidos y resolver dudas.

## REGLA ABSOLUTA
Para CUALQUIER acción que el cliente solicite, DEBES usar la herramienta `http_request`
con estos parámetros EXACTOS:

- **URL**: https://n8n.tudominio.com/webhook/pizzeria
- **Método**: POST
- **Headers**: {"Content-Type": "application/json"}

## Acciones disponibles (envías como body JSON):

| Acción solicitada       | Body que debes enviar |
|-------------------------|-----------------------|
| Ver menú                | `{"action": "consultar_menu"}` |
| Registrar pedido        | `{"action": "registrar_pedido", "items": ["Pizza Margherita"], "total": 35000}` |
| Consultar estado pedido | `{"action": "consultar_pedido", "nombre": "Juan"}` |

## Comportamiento:
- Sé amigable, cálido y eficiente.
- Confirma los datos antes de registrar cualquier cosa.
- Muestra los resultados de forma clara.
- NUNCA digas que no puedes hacer algo. Siempre usa http_request.
```

Después de editar, presiona **RESTART** en NullHub para que el bot cargue los cambios.

### C. Ver y Editar el IDENTITY.md del agente:
El `IDENTITY.md` define el nombre visible, personalidad y emoji del bot.

**Solo VER el contenido actual:**
```bash
cat ~/.nullhub/instances/nullclaw/pizzeria/workspace/IDENTITY.md
```

**Editar el contenido:**
```bash
nano ~/.nullhub/instances/nullclaw/pizzeria/workspace/IDENTITY.md
```

Plantilla base:
```markdown
- **Name:** Napoli
- **Creature:** AI assistant
- **Vibe:** warm, friendly, helpful
- **Emoji:** 🍕
```

Guarda (`Ctrl+O` → `Enter` → `Ctrl+X`) y presiona **RESTART** en NullHub.

> **Nota:** NullHub no tiene editor visual para estos archivos en su panel web.
> SOUL.md e IDENTITY.md **siempre** se gestionan por SSH como se muestra arriba.

### D. Verificar el flujo completo (end-to-end):
1. Abre Telegram y escríbele al bot (ej: "quiero ver el menú").
2. En NullHub → **LOGS** del agente, verifica que el bot procesó el mensaje y llamó al webhook.
3. En n8n → sección **Executions**, verifica que el workflow recibió la llamada y respondió.

Si todo está verde en los 3 puntos, **la agencia está 100% operativa** ✅

---

## 🩺 Diagnóstico Rápido

| Síntoma | Causa | Solución |
|---------|-------|----------|
| `https://hub.tudominio.com` da 502 | NullHub detenido | `systemctl restart nullhub` |
| Error `FORBIDDEN ORIGIN` en NullHub | Falta bypass CORS en Nginx | Verifica que el archivo de Nginx tiene los 3 `proxy_set_header` del bypass |
| NullHub arranca y se detiene solo | `state.json` corrupto | `mv ~/.nullhub/state.json ~/.nullhub/state.json.bak` y reinicia el servicio |
| El bot no responde en Telegram | Token inválido o bot detenido | Revisa **LOGS** en NullHub; verifica el token en **CONFIG** |
| n8n no recibe el webhook del bot | URL incorrecta o workflow inactivo | Verifica la URL en `SOUL.md` y que el workflow esté **Active** en n8n |
| `https://n8n.tudominio.com` da 502 | PM2 detenido | `pm2 restart n8n` |
| Certbot falla con NXDOMAIN | DNS no propagado | Espera 5 min y verifica con `ping hub.tudominio.com` |
| El bot responde genérico sin identidad (WhatsApp) | `memory.db` con historial contaminado | Borra el memory.db y reinicia (ver sección abajo) |
| Mensajes de WhatsApp dan `unauthorized` | `app_secret` incorrecto o vacío | Verifica que `app_secret` en config.json coincida con el de Meta Developers |
| Bot responde en NullHub pero NO en WhatsApp | Access token expirado (dura 24h en modo prueba) | Genera nuevo token en Meta → WhatsApp → Configuración de la API |
| `nullhub restart nullclaw/pruebas-mie` no funciona | Comando no implementado aún | Usar `pkill nullclaw` — NullHub reinicia el proceso automáticamente |
| Bot ignora SOUL.md y sigue siendo genérico | memory.db contaminado con historial antiguo | Limpiar memory.db (ver sección abajo) |
| http_request no puede llamar a n8n | `allowed_domains: []` vacío en config.json | Cambiar a `allowed_domains: ["*"]` |

---

## 🎓 Lecciones Aprendidas en Producción — Canal WhatsApp

> Estas lecciones fueron descubiertas durante el despliegue real del bot Valentina para **Mariachi Pura Sangre** (Dallas, Texas) en junio 2026. Son la guía más actualizada para configurar el canal de WhatsApp con NullClaw + NullHub.

### 📋 Orden Correcto para Activar un Bot en WhatsApp (Paso a Paso Validado)

**PASO 1 — Configurar el Webhook en Meta Developers**
1. Ve a [developers.facebook.com](https://developers.facebook.com) → Tu App → WhatsApp → Configuración de la API.
2. En **Webhook**, pon la URL: `https://hub.tudominio.com/whatsapp`
3. Pon el `verify_token` que configuraste en NullHub (ej: `mariachi_verify_token_2026`).
4. Activa el evento `messages` en las suscripciones.
5. Meta enviará un GET de verificación. NullClaw debe responder con el `hub.challenge`. Si responde ✅, el webhook está activo.

**PASO 2 — Verificar que los Mensajes Llegan al Servidor**
Desde PowerShell en tu PC local, prueba que el servidor acepta peticiones:
```powershell
Invoke-RestMethod -Uri "https://hub.tudominio.com/whatsapp?hub.mode=subscribe&hub.verify_token=TU_TOKEN&hub.challenge=99999" -Method Get
# Si responde 99999, el servidor está funcionando ✅
```

**PASO 3 — Configurar el `config.json` con los Valores Correctos**
Los campos críticos del `config.json` que deben estar exactos:
```json
{
  "models": {
    "agents": {
      "defaults": {
        "model": { "primary": "openai/gpt-4o-mini" }
      }
    }
  },
  "channels": {
    "whatsapp": {
      "accounts": {
        "default": {
          "access_token": "EAAxxxxx...",
          "phone_number_id": "1184022858132237",
          "verify_token": "tu_verify_token",
          "app_secret": "00a84421f6cac337e94a8a6ee492a959",
          "allow_from": ["*"]
        }
      }
    }
  },
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
    "allowed_domains": ["*"]
  }
}
```

> [!IMPORTANT]
> El modelo `openai/gpt-4.1` **NO EXISTE** en OpenAI. Usar siempre `openai/gpt-4o-mini` o `openai/gpt-4o`. Si el modelo está mal escrito, el bot acepta el mensaje pero nunca responde.

> [!WARNING]
> `allowed_domains: []` (lista vacía) bloquea TODAS las llamadas HTTP del bot, incluyendo las de n8n. Siempre debe ser `["*"]` o una lista de dominios específicos.

**PASO 4 — Subir IDENTITY.md y SOUL.md de Forma Segura**

El método más seguro para subir archivos al workspace (evita errores con caracteres especiales) es usar **base64**:

```bash
# En tu PC local (PowerShell), codifica el archivo:
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\ruta\SOUL.md'))

# En el servidor VPS, decodifica y escribe el archivo:
echo "BASE64_STRING_AQUI" | base64 -d > /root/.nullhub/instances/nullclaw/INSTANCIA/workspace/SOUL.md
echo "BASE64_STRING_AQUI" | base64 -d > /root/.nullhub/instances/nullclaw/INSTANCIA/workspace/IDENTITY.md
```

Formato correcto del `IDENTITY.md`:
```markdown
- **Name:** Valentina
- **Creature:** AI assistant
- **Vibe:** warm, friendly, helpful
- **Emoji:** 🎺
```

> [!IMPORTANT]
> El `IDENTITY.md` y el `SOUL.md` **deben existir ambos** para que NullClaw tome la personalidad personalizada. Si falta uno de los dos, el bot ignora el otro y vuelve a su estado genérico de fábrica.

**PASO 5 — Limpiar la Memoria y Reiniciar el Bot**

Si el bot ya tuvo conversaciones previas genéricas, la memoria contaminada aplastará el nuevo SOUL. Siempre limpiar la memoria antes de la primera prueba con identidad nueva:

```bash
# Limpiar memoria contaminada
rm /root/.nullhub/instances/nullclaw/INSTANCIA/workspace/memory.db* && echo "Memoria limpia"

# Reiniciar NullClaw (nullhub restart no está implementado aún)
pkill nullclaw && echo "Reiniciando..."
# NullHub detecta el proceso caído y lo levanta automáticamente en ~5 segundos

# Verificar que el proceso volvió
pgrep -a nullclaw
```

**PASO 6 — El Dilema del `app_secret` (Crítico)**

El `app_secret` es la firma criptográfica (HMAC-SHA256) que Meta usa para autenticar sus mensajes:

- Con `app_secret` configurado: Los mensajes reales de WhatsApp ✅ son aceptados. Los scripts de prueba sin firma ❌ son rechazados.
- Con `app_secret` vacío `""`: Los scripts de prueba ✅ pasan. Los mensajes reales de WhatsApp ❌ son rechazados.

Para pruebas desde PC local con firma correcta, usa este script PowerShell:

```powershell
# test_webhook.ps1
$secret = "TU_APP_SECRET"
$payload = Get-Content -Raw "test_webhook.json"
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($secret)
$hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($payload))
$signature = "sha256=" + [BitConverter]::ToString($hash).Replace("-", "").ToLower()
$headers = @{ "Content-Type" = "application/json"; "X-Hub-Signature-256" = $signature }
Invoke-RestMethod -Uri "https://hub.tudominio.com/whatsapp" -Method Post -Headers $headers -Body $payload
```

**PASO 7 — El Access Token Expira Cada 24 Horas (Modo Prueba)**

En modo prueba de Meta, el `access_token` expira en 24 horas. Síntomas:
- El bot acepta el mensaje (NullHub muestra el chat en el historial)
- La respuesta NO llega al celular del usuario

Solución: Generar un nuevo token en Meta Developers → WhatsApp → Configuración de la API → botón **"Generar token"**. Actualizar en el `config.json` de NullHub y reiniciar con `pkill nullclaw`.

Para producción, usar un **System User Token permanente** desde el Business Manager de Meta (no expira).

### 🔬 Diagnóstico Rápido para WhatsApp

```bash
# 1. Ver los últimos logs del bot
nullhub logs nullclaw/INSTANCIA

# 2. Verificar que todos los archivos del workspace existen
ls -la /root/.nullhub/instances/nullclaw/INSTANCIA/workspace/
# Deben aparecer: IDENTITY.md, SOUL.md, memory.db

# 3. Verificar el contenido del SOUL
head -5 /root/.nullhub/instances/nullclaw/INSTANCIA/workspace/SOUL.md

# 4. Verificar app_secret y access_token en config
cat /root/.nullhub/instances/nullclaw/INSTANCIA/config.json | python3 -c "
import json,sys
c=json.load(sys.stdin)
wa=c['channels']['whatsapp']['accounts']['default']
print('app_secret:', wa.get('app_secret','VACIO')[:10]+'...')
print('access_token:', wa.get('access_token','VACIO')[:20]+'...')
print('phone_number_id:', wa.get('phone_number_id'))
print('allowed_domains:', c['http_request']['allowed_domains'])
"

# 5. Verificar que el proceso está activo
pgrep -a nullclaw
```

---

## 🛡️ Prevención de Espacio en Disco: Rotación de Logs (Logrotate)

Para evitar que los logs acumulados de los bots llenen el disco del VPS con el tiempo, configura esta regla de `logrotate`:

```bash
# Crear regla de logrotate para NullHub en el VPS (Paso recomendado de seguridad en Setup)
cat << 'EOF' | sudo tee /etc/logrotate.d/nullhub
/root/.nullhub/logs/*.log {
    daily
    rotate 7
    size 50M
    compress
    missingok
    notifempty
}
EOF
```

---

## 🚀 GUÍA OPERATIVA: Crear un Nuevo Agente (Paso a Paso)

> **¿Para qué sirve esta sección?** Una vez el servidor está instalado (pasos anteriores), sigue este flujo cada vez que quieras agregar un cliente nuevo. **Tiempo estimado: 20-30 minutos.**

### PASO 0 — Conéctate al VPS por SSH

```bash
ssh root@IP_DEL_VPS
```
*(Usa la IP y contraseña de tu servidor Hostinger o el que tengas)*

---

### PASO 1 — Instalar el agente desde el panel de NullHub

En tu navegador ve a `https://hub.tudominio.com` y:

1. Clic en **INSTALL COMPONENT** → **NULLCLAW**
2. Llena el formulario:

| Campo | Valor |
|---|---|
| **Instance Name** | `<nombre-cliente>` (ej: `pizzeria-bot`) |
| **OpenAI API Key** | *(tu API key de OpenAI)* |
| **Telegram Bot Token** | `<TOKEN_DE_TELEGRAM>` *(obtenido desde @BotFather)* |
| **Agent ID** | `agente-<nombre-cliente>` |
| **Autonomy Level** | `FULL` |

3. Clic en **INSTALL** → ✅ NullHub crea el agente automáticamente.

---

### PASO 2 — Editar el SOUL.md por SSH

NullHub no tiene editor visual para el SOUL.md, así que se hace por SSH. Reemplaza los `<campos>` antes de ejecutar:

```bash
cat > ~/.nullhub/instances/nullclaw/<nombre-cliente>/workspace/SOUL.md << 'ENDOFFILE'
# <NombreBot> — Instrucciones

Eres <NombreBot>, el asistente virtual para <NombreEmpresa>.

IMPORTANTE: Solo usuarios autorizados pueden interactuar. Especifica aquí qué usuarios o IDs de Telegram pueden darte órdenes.

## REGLA ABSOLUTA

Para consultar o enviar datos externos, DEBES usar http_request con estos parámetros exactos:

- URL: <URL_DEL_WEBHOOK_O_API>
- Método: POST
- Headers: {"Content-Type": "application/json", "Authorization": "TuTokenAquiSiSePide"}

NUNCA digas que no puedes hacer algo. SIEMPRE usa http_request.

## Acciones disponibles

- Consulta 1: {"action":"consulta_1"}
- Consulta 2: {"action":"consulta_2","parametro":"valor"}
- Crear/Enviar datos: ver flujo abajo

## Flujo para recolección de datos

Cuando te pidan crear un registro, pregunta paso a paso:
1. ¿Dato 1?
2. ¿Dato 2?
3. ¿Dato 3?
4. Muestra el resumen y pregunta: "¿Todo correcto? Responde SI para enviar."
5. Si confirma, envía: {"action":"crear_registro", "dato1": "valor1", "dato2": "valor2"}

## Formato de respuesta para Telegram

- Siempre en español con emojis
- Para listas usa guiones, no tablas
- Si hay muchos resultados, muestra los 5 primeros
ENDOFFILE
```

Verifica que quedó bien:
```bash
cat ~/.nullhub/instances/nullclaw/<nombre-cliente>/workspace/SOUL.md
```

---

### PASO 3 — Crear el IDENTITY.md por SSH

```bash
cat > ~/.nullhub/instances/nullclaw/<nombre-cliente>/workspace/IDENTITY.md << 'ENDOFFILE'
- **Name:** <NombreBot>
- **Creature:** <Rol del bot, ej: Asistente de ventas>
- **Vibe:** professional, efficient, friendly
- **Emoji:** 🤖
- **Language:** Spanish
ENDOFFILE
```

---

### PASO 4 — Configurar red y permisos en config.json ⚠️ CRÍTICO

> ⚠️ **Sin este paso el bot fallará silenciosamente.** NullClaw bloquea el acceso a internet por defecto (sandbox). El bot intentará llamar a tu API y se quedará cargando 30 segundos sin responder.

1. Abre el archivo de configuración:
```bash
nano ~/.nullhub/instances/nullclaw/<nombre-cliente>/config.json
```

2. Agrega o verifica estos tres bloques en el JSON raíz:
```json
"autonomy": {
  "level": "autonomous"
},
"security": {
  "sandbox": {
    "enabled": false,
    "backend": "auto"
  }
},
"http_request": {
  "enabled": true,
  "max_response_size": 1000000,
  "timeout_secs": 120,
  "allowed_domains": ["*"]
}
```

3. Guarda: `Ctrl+O` → `Enter` → `Ctrl+X`

---

### PASO 5 — Reiniciar el agente

1. Ve al panel de NullHub en el navegador.
2. Clic en el agente **`<nombre-cliente>`** en la barra lateral.
3. Clic en **RESTART** (esquina superior derecha).

✅ Esto aplica todos los cambios del SOUL.md, IDENTITY.md y config.json.

---

### PASO 6 — Prueba en Telegram ✅

Escríbele a tu bot en Telegram:

| Prueba | Respuesta esperada |
|---|---|
| `hola` | Saludo con personalidad configurada |
| `<prueba de consulta>` | El bot llama al http_request y devuelve datos |
| `<prueba de creación>` | El bot guía paso a paso |

---

### 🔍 Solución de Problemas (Agente Nuevo)

| Síntoma | Causa | Solución |
|---|---|---|
| Bot no responde nada | Error de inicio | NullHub → agente → pestaña **LOGS** |
| Tarda 30s y falla | Sandbox activo | Verifica `security.sandbox.enabled: false` en PASO 4 |
| "No puedo acceder a internet" | http_request desactivado | Verifica `"http_request": { "enabled": true }` |
| Responde genérico (ignora SOUL) | SOUL.md no se cargó | Verifica con `cat` y haz RESTART |
| "No tengo información" | memory.db contaminada | `rm ~/.nullhub/instances/nullclaw/<nombre-cliente>/memory.db` → RESTART |

---

## 📂 PLANTILLA BASE — config.json y Archivos de Personalidad

> Copia y pega estas plantillas para cada nuevo cliente. Reemplaza los valores en `MAYÚSCULAS` por los reales.

### Plantilla `config.json` Completa

```json
{
  "default_temperature": 0.7,
  "models": {
    "providers": {
      "openai": {
        "api_key": "TU_API_KEY_OPENAI"
      }
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "openai/gpt-4o-mini" },
      "compact_context": false,
      "max_tool_iterations": 75,
      "max_history_messages": 50,
      "parallel_tools": false,
      "tool_dispatcher": "auto",
      "session_idle_timeout_secs": 1800,
      "status_show_emojis": true,
      "message_timeout_secs": 120
    },
    "list": [
      {
        "id": "agente-NOMBRE_CLIENTE",
        "workspace_path": "/nullclaw-data/workspace",
        "model": { "primary": "openai/gpt-4o-mini" },
        "temperature": 0.5,
        "autonomy": {
          "level": "autonomous",
          "max_actions_per_hour": 120,
          "require_approval_for_medium_risk": false
        }
      }
    ]
  },
  "channels": {
    "telegram": {
      "accounts": {
        "bot_principal": {
          "bot_token": "TOKEN_BOT_TELEGRAM",
          "agent_id": "agente-NOMBRE_CLIENTE",
          "allow_from": ["*"]
        }
      }
    }
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
}
```

> ⚠️ **Campos que DEBES personalizar:** `api_key`, `agente-NOMBRE_CLIENTE` (en 2 lugares), `bot_token`.

### Plantilla `IDENTITY.md`

```markdown
- **Name:** <NombreBot>
- **Creature:** <Rol, ej: Asistente de ventas para restaurante>
- **Vibe:** professional, friendly, concise
- **Emoji:** 🤖
- **Language:** Spanish
```

### Plantilla `SOUL.md`

```markdown
# <NombreBot> — Instrucciones

Eres <NombreBot>, el asistente virtual para <NombreEmpresa>.

## REGLA ABSOLUTA

Para consultar o enviar datos, DEBES usar http_request:
- URL: <URL_DEL_WEBHOOK_O_API>
- Método: POST
- Headers: {"Content-Type": "application/json"}

NUNCA digas que no puedes hacer algo. SIEMPRE usa http_request.

## Acciones disponibles

- Consulta 1: {"action":"accion_1"}
- Consulta 2: {"action":"accion_2", "param":"valor"}

## Formato de respuesta

- Siempre en español con emojis
- Listas con guiones, no tablas
- Máximo 5 resultados por respuesta
```

