# Guía Maestra: Instalación Completa de la Agencia con NullHub y n8n

Esta es la guía definitiva para montar el stack completo de la agencia en una nueva VPS desde cero.
Todo corre de forma **nativa** (sin Docker Swarm) usando Nginx, PM2 y Systemd.

> **¿Cuándo usar esta guía?** Cuando contratas una nueva VPS y necesitas dejarla lista para
> operar con bots de NullClaw gestionados desde el panel visual de NullHub.

> **Convención:** En esta guía verás `tudominio.com` como placeholder.
> Reemplázalo por tu dominio real (ej: `makeiteasycol.com`) en TODOS los lugares donde aparezca.

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

### B. Configuración Nginx para NullHub (con bypass CORS obligatorio):
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
}
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
   | Campo      | Qué poner |
   |------------|-----------|
   | Canal      | Selecciona **TELEGRAM** |
   | BOT TOKEN  | El token que entrega `@BotFather` |
   | ALLOW FROM | `*` (cualquier usuario puede escribir al bot) |

   **Pantalla 3 — Settings:**
   | Campo           | Qué poner    |
   |-----------------|--------------|
   | MEMORY BACKEND  | `sqlite`     |
   | TUNNEL PROVIDER | `NONE`       |
   | AUTONOMY LEVEL  | `SUPERVISED` |

4. Haz clic en **INSTALL**. NullHub descargará NullClaw, creará la instancia y la arrancará automáticamente.

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
