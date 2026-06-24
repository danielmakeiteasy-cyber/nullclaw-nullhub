# Ejemplo Real: Onboarding Completo de "Restaurante La Fogata"

Esta guía es un ejemplo paso a paso de cómo montar una nueva VPS desde cero y dejar
un bot de Telegram funcional para un cliente real, siguiendo la `NullHub_Setup_Guide.md`.

> **Cliente:** Restaurante La Fogata
> **Bot:** Brasa 🔥 — toma pedidos a domicilio y muestra el menú por Telegram
> **Dominio de la agencia:** `makeiteasycol.com`
> **IP del VPS (ejemplo):** `187.77.196.200`
> **Nombre de la instancia:** `fogata`

---

## 0️⃣ PASO 0: Crear la VPS y Configurar el DNS

### A. Contratar el VPS en Hostinger
1. Ve a [hostinger.com/vps-hosting](https://www.hostinger.com/vps-hosting).
2. Selecciona el plan **KVM 2** (8 GB RAM — suficiente para hasta 12 bots).
3. Sistema operativo: **Ubuntu 22.04 64-bit**.
4. Configura una contraseña de root segura y guárdala.
5. Una vez aprovisionado, copia la IP del VPS. En este ejemplo: `187.77.196.200`.

### B. Agregar registros DNS
En el panel de tu proveedor de dominio (Cloudflare, Hostinger, GoDaddy, etc.)
agrega **dos registros tipo `A`** apuntando a la IP del VPS:

| Nombre (host) | Tipo | Valor IP         | TTL       |
|---------------|------|------------------|-----------|
| `hub`         | A    | `187.77.196.200` | Automático|
| `n8n`         | A    | `187.77.196.200` | Automático|

Esto crea:
- `hub.makeiteasycol.com` → panel de NullHub
- `n8n.makeiteasycol.com` → panel de n8n

> Espera 3-5 minutos para que los DNS se propaguen antes de continuar.

### C. Verificar la propagación y conectarte
Desde tu computadora:
```bash
ping hub.makeiteasycol.com
# Debe responder desde 187.77.196.200 ✅
```

Conectarte al VPS:
```bash
ssh root@187.77.196.200
# Ingresa la contraseña que configuraste en Hostinger
# Ya estás dentro del servidor ✅
```

---

## 🛠️ PASO 1: Preparar el Servidor

Pega todo este bloque en la terminal del VPS y presiona Enter:

```bash
# Actualizar el sistema operativo
apt update && apt upgrade -y

# Crear memoria Swap de 2GB (OBLIGATORIO — evita caídas por falta de RAM)
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Instalar Node.js v20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git curl wget unzip

# Instalar Nginx y Certbot
apt install -y nginx certbot python3-certbot-nginx
```

Cuando termine, verifica que todo instaló correctamente:
```bash
node --version    # → v20.x.x ✅
nginx --version   # → nginx/1.x.x ✅
free -h           # → Swap: 2.0Gi ✅
```

---

## 🐝 PASO 2: Instalar n8n

```bash
# Instalar n8n y PM2 globalmente
npm install -g n8n pm2

# Arrancar n8n en el puerto 5678
pm2 start n8n --name "n8n" -- --port 5678

# Configurar arranque automático al reiniciar el servidor
pm2 startup
```

> ⚠️ **IMPORTANTE:** El comando `pm2 startup` imprime en pantalla un comando largo
> que empieza con `sudo env PATH=...`. Cópialo y ejecútalo exactamente como aparece.

```bash
# Guardar el estado
pm2 save
```

Verificas:
```bash
pm2 status
# Debe mostrar n8n con estado "online" ✅
```

---

## 📥 PASO 3: Instalar NullHub

> ⚠️ NullHub DEBE escuchar únicamente en `127.0.0.1`. Si lo expones en `0.0.0.0`,
> el binario crashea con un error de **Segmentation Fault**. Nginx se encargará de
> exponerlo al exterior de forma segura en el siguiente paso.

```bash
# Descargar el binario oficial de NullHub
# (Revisa si hay versión más nueva en: https://github.com/nullclaw/nullhub/releases)
curl -LO https://github.com/nullclaw/nullhub/releases/download/v2026.4.17/nullhub-linux-x86_64.bin
chmod +x nullhub-linux-x86_64.bin
mv nullhub-linux-x86_64.bin /usr/local/bin/nullhub

# Verificar instalación
nullhub --version
# nullhub v2026.4.17 ✅
```

Crea el servicio de Systemd:
```bash
nano /etc/systemd/system/nullhub.service
```

Pega este contenido **exactamente** (sin cambiar nada):
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

Verifica:
```bash
systemctl status nullhub
# Active: active (running) ✅

curl -I http://127.0.0.1:19800
# HTTP/1.1 200 OK ✅
```

---

## 🌐 PASO 4: Configurar Nginx con SSL

### A. Archivo de configuración para n8n:
```bash
nano /etc/nginx/sites-available/n8n.makeiteasycol.com
```

Pega este contenido:
```nginx
server {
    listen 80;
    server_name n8n.makeiteasycol.com;

    location / {
        proxy_pass http://127.0.0.1:5678;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```
Guarda y sal: `Ctrl+O` → `Enter` → `Ctrl+X`

### B. Archivo de configuración para NullHub:
```bash
nano /etc/nginx/sites-available/hub.makeiteasycol.com
```

Pega este contenido:
```nginx
server {
    listen 80;
    server_name hub.makeiteasycol.com;

    location / {
        proxy_pass http://127.0.0.1:19800;

        # CRÍTICO: Sin estos 3 headers NullHub arroja "VALIDATION FAILED: FORBIDDEN ORIGIN"
        # y bloquea la interfaz gráfica. Nginx simula que las peticiones vienen del localhost.
        proxy_set_header Host "127.0.0.1:19800";
        proxy_set_header Origin "http://127.0.0.1:19800";
        proxy_set_header Referer "http://127.0.0.1:19800";

        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Necesario para los logs en tiempo real (SSE y WebSockets)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_cache off;
    }
}
```
Guarda y sal: `Ctrl+O` → `Enter` → `Ctrl+X`

### C. Activar sitios y obtener certificados SSL:
```bash
# Habilitar ambos sitios en Nginx
ln -s /etc/nginx/sites-available/n8n.makeiteasycol.com /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/hub.makeiteasycol.com /etc/nginx/sites-enabled/

# Verificar que la sintaxis de Nginx es correcta
nginx -t
# nginx: configuration file test is successful ✅

# Aplicar cambios
systemctl restart nginx

# Obtener certificados SSL (uno a la vez)
certbot --nginx -d n8n.makeiteasycol.com
# Successfully deployed certificate ✅

certbot --nginx -d hub.makeiteasycol.com
# Successfully deployed certificate ✅
```

**Verificación final del Paso 4:**
Abre en tu navegador:
- `https://hub.makeiteasycol.com` → 🟢 Dashboard de NullHub con candado 🔒
- `https://n8n.makeiteasycol.com` → 🟢 Pantalla de login de n8n con candado 🔒

**El servidor está listo.** A partir de aquí todo se hace desde el navegador y la terminal solo para editar el SOUL.md.

---

## 🤖 PASO 5: Crear el Agente "fogata" desde NullHub

Abre `https://hub.makeiteasycol.com` en tu navegador.

Haz clic en **INSTALL COMPONENT** → **NULLCLAW** y completa el asistente:

**Pantalla 1 — Setup:**

| Campo         | Valor que escribes                          |
|---------------|---------------------------------------------|
| INSTANCE NAME | `fogata`                                    |
| VERSION       | `v2026.5.29` (selecciona la recomendada)    |
| PROVIDER      | `OpenAI (GPT direct)`                       |
| API KEY       | `sk-proj-TuApiKeyDeOpenAI...`               |
| MODEL         | `gpt-4o-mini`                               |

Clic en **NEXT**

**Pantalla 2 — Channels:**

| Campo      | Valor que escribes                              |
|------------|-------------------------------------------------|
| Canal      | ✅ Marcar **TELEGRAM**                          |
| BOT TOKEN  | `7123456789:AAHbB0LaFogataTokenDeBotFather`     |
| ALLOW FROM | `*`                                             |

Clic en **NEXT**

**Pantalla 3 — Settings:**

| Campo           | Valor        |
|-----------------|--------------|
| MEMORY BACKEND  | `sqlite`     |
| TUNNEL PROVIDER | `NONE`       |
| AUTONOMY LEVEL  | `SUPERVISED` |

Clic en **INSTALL**

El panel de NullHub mostrará:
```
✅ fogata — RUNNING — NullClaw v2026.5.29 — GATEWAY: 127.0.0.1:3000
```

**El bot ya está vivo y escuchando en Telegram.** Solo le falta saber qué debe hacer cuando alguien le escribe.

---

## 🔗 PASO 6: Conectar el Bot con n8n

Esta es la conexión central que permite que el bot ejecute acciones reales
en el negocio del cliente (registrar pedidos, consultar datos, etc.).

### A. Configurar n8n — Crear el workflow y el webhook:

1. Abre `https://n8n.makeiteasycol.com` y crea tu cuenta de usuario la primera vez.
2. Haz clic en **New Workflow**.
3. Agrega un nodo **Webhook** como primer nodo:
   - **HTTP Method:** `POST`
   - **Path:** `fogata`
4. La URL del webhook queda así:
   ```
   https://n8n.makeiteasycol.com/webhook/fogata
   ```
5. Conecta el nodo Webhook con los nodos de acción del cliente
   (Google Sheets para registrar pedidos, Gmail para notificaciones, etc.).
6. **Activa el workflow** con el toggle **Active** en la esquina superior derecha.

> ⚠️ Sin activar el workflow, el webhook no recibe nada aunque todo esté configurado.

### B. Configurar el SOUL.md — El cerebro del bot:

El `SOUL.md` le dice al bot quién es y cómo debe llamar al webhook de n8n.
Se edita por SSH en el VPS:

```bash
nano ~/.nullhub/instances/nullclaw/fogata/workspace/SOUL.md
```

Pega y adapta este contenido al cliente:
```markdown
Eres Brasa, el asistente oficial del Restaurante La Fogata 🔥
Tu trabajo es ayudar a los clientes a consultar el menú y registrar pedidos a domicilio.

## REGLA ABSOLUTA
Para CUALQUIER acción que el cliente solicite, DEBES usar la herramienta `http_request`
con estos parámetros EXACTOS:

- **URL**: https://n8n.makeiteasycol.com/webhook/fogata
- **Método**: POST
- **Headers**: {"Content-Type": "application/json"}

## Acciones disponibles (envíalas como body JSON):

| Acción del cliente       | Body JSON que debes enviar                                                                |
|--------------------------|-------------------------------------------------------------------------------------------|
| Ver el menú              | `{"action": "consultar_menu"}`                                                            |
| Registrar un pedido      | `{"action": "registrar_pedido", "items": ["Bandeja paisa"], "total": 28000, "cliente": "Juan"}` |
| Consultar estado pedido  | `{"action": "estado_pedido", "cliente": "Juan"}`                                          |

## Comportamiento:
- Sé cálido, amigable y usa emojis de comida 🍖🔥
- Confirma siempre el pedido antes de registrarlo.
- Muestra los resultados de n8n de forma clara y organizada.
- NUNCA digas que no puedes hacer algo. Siempre usa http_request.
```
Guarda: `Ctrl+O` → `Enter` → `Ctrl+X`

Vuelve al panel de NullHub y presiona **RESTART** en el agente `fogata`.

### C. Verificar el flujo completo end-to-end:

1. Abre Telegram y escríbele al bot del cliente: *"quiero ver el menú"*
2. En NullHub → pestaña **LOGS** del agente `fogata`:
   verás que el bot procesó el mensaje y llamó al webhook ✅
3. En n8n → sección **Executions**:
   verás la llamada entrante desde el bot y la respuesta enviada ✅
4. El bot responde en Telegram con el menú del restaurante ✅

**🎉 "Restaurante La Fogata" está 100% operativo.**

---

## 📌 Para el Próximo Cliente

El servidor ya está listo y no hay que repetir los Pasos 0 al 4.
Para cada nuevo cliente solo repites:

1. **Paso 5:** Crear el agente en NullHub (2 minutos en el navegador).
2. **Paso 6A:** Crear el workflow en n8n con su webhook.
3. **Paso 6B:** Editar el `SOUL.md` con la personalidad y el webhook del cliente.
4. Presionar **RESTART** en NullHub.
5. Probar en Telegram.

---

## 🩺 Diagnóstico Rápido

| Síntoma | Causa probable | Solución |
|---------|---------------|----------|
| `hub.makeiteasycol.com` da 502 | NullHub detenido | `systemctl restart nullhub` |
| Error `FORBIDDEN ORIGIN` en NullHub | Falta el bypass CORS en Nginx | Verifica los 3 `proxy_set_header` en el archivo de Nginx de NullHub |
| NullHub arranca y se detiene solo | `state.json` con datos corruptos | `mv ~/.nullhub/state.json ~/.nullhub/state.json.bak` y reinicia el servicio |
| El bot no responde en Telegram | Token inválido o bot detenido | Revisa **LOGS** en NullHub y verifica el token en **CONFIG** |
| n8n no recibe el webhook del bot | URL incorrecta o workflow inactivo | Verifica la URL en `SOUL.md` y que el workflow esté **Active** en n8n |
| `n8n.makeiteasycol.com` da 502 | PM2 detenido | `pm2 restart n8n` |
| Certbot falla con error NXDOMAIN | DNS no propagado aún | Espera 5 min y verifica con `ping hub.makeiteasycol.com` |
