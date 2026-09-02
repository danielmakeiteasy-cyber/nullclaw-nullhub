# Make It Easy - Guía Completa: Nueva VPS desde Cero (Hostinger)

Esta guía contiene **todo el proceso paso a paso** para contratar un VPS en Hostinger, instalar Ubuntu, configurar Docker, n8n, Traefik y dejar el servidor listo para desplegar agentes de la agencia.

> **¿Cuándo usar esta guía?** Cuando tu VPS actual se quede sin recursos (RAM o CPU al tope) y necesites un segundo servidor, o cuando estés montando la agencia por primera vez.

---

## 📋 Requisitos Previos
- Cuenta en [Hostinger](https://www.hostinger.com).
- Tarjeta de crédito/débito o PayPal para el pago.
- Tu API Key de OpenAI (`sk-proj-...`).
- Los tokens de Telegram de los bots que vas a desplegar (obtenidos con [@BotFather](https://t.me/BotFather)).

---

## 🛒 Paso 1: Contratar el VPS en Hostinger

1. Ve a [hostinger.com/vps-hosting](https://www.hostinger.com/vps-hosting).
2. Elige el plan según la cantidad de clientes que manejarás:

   | Plan          | RAM  | Bots estimados | Precio aprox. |
   |---------------|------|----------------|---------------|
   | KVM 1         | 4 GB | Hasta 5 bots   | ~$6 USD/mes   |
   | KVM 2         | 8 GB | Hasta 12 bots  | ~$10 USD/mes  |
   | KVM 4         | 16 GB| Hasta 25 bots  | ~$16 USD/mes  |

   > **Recomendación:** Empieza con KVM 2 (8 GB). Te da margen de sobra para crecer.

3. Completa el pago y espera a que se aprovisione (1-3 minutos).

---

## 🖥️ Paso 2: Configurar el sistema operativo

1. En el panel de Hostinger, ve a **VPS > tu nuevo VPS > Setup**.
2. Selecciona:
   - **Sistema Operativo:** `Ubuntu 22.04 64bit` (o 24.04 si está disponible).
   - **Contraseña de root:** Elige una contraseña fuerte y **guárdala en un lugar seguro**.
   - **Hostname:** Puedes dejarlo por defecto o poner algo como `makeiteasyvps2`.
3. Haz clic en **"Create"** o **"Setup"** y espera a que termine la instalación (1-2 minutos).
4. Una vez listo, copia la **dirección IP** de tu VPS. La encontrarás en el panel de Hostinger.

---

## 🔐 Paso 3: Conectarte por SSH

### Desde Windows (con la terminal de tu computadora):
```bash
ssh root@TU_IP_DEL_VPS
```
*(Reemplaza `TU_IP_DEL_VPS` con la IP que copiaste en el paso anterior).*

Te pedirá la contraseña que configuraste. Escríbela (no se verá en pantalla, es normal) y presiona Enter.

### Desde el Panel de Hostinger (alternativa):
1. Ve a **VPS > tu VPS > SSH Terminal** en el panel de Hostinger.
2. Se abrirá una terminal en el navegador. Ya estarás conectado como `root`.

---

## 🔄 Paso 4: Actualizar el sistema y Configurar Memoria Swap

Una vez conectado a la VPS, lo primero es actualizar todos los paquetes del sistema para evitar vulnerabilidades:

```bash
apt update && apt upgrade -y
```

*(Puede tardar 1-3 minutos. Si te pregunta sobre reiniciar servicios, presiona Enter para aceptar).*

**Crear memoria Swap (El "Salvavidas" de RAM de 2GB)**
Esto previene que la VPS colapse y mate el proceso del bot (OOM Kill) si se satura la memoria física:
```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo "✅ Swap configurada: +2GB de memoria virtual."
```

> [!IMPORTANT]
> **Hostinger NO activa la Swap por defecto.** Si omites este paso, el servidor colapsará cuando los bots empiecen a trabajar. Asegúrate de ver `Swap: 2.0Gi` al ejecutar `free -h`.


---

## 🐳 Paso 5: Instalar Docker

Docker es el motor que contendrá a todos los bots de la agencia.

```bash
# Descargar e instalar Docker automáticamente
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Verificar que se instaló correctamente
docker --version
```
> Deberías ver algo como: `Docker version 27.x.x`

---

## 🐝 Paso 6: Inicializar Docker Swarm y crear la Red

Docker Swarm permite administrar los contenedores como "servicios" que se reinician solos si fallan.

```bash
# Activar modo Swarm (orquestador)
docker swarm init
```
> **Nota:** Si te muestra un error de "múltiples IPs", el mismo mensaje te dará el comando correcto con `--advertise-addr`. Cópialo y pégalo.

```bash
# Crear la red interna donde vivirán todos los bots y servicios
docker network create -d overlay --attachable easypanel
```

---

## 📦 Paso 7: Instalar n8n (Motor de Automatizaciones)

n8n es el cerebro lógico que conecta a los bots con Google Sheets, Calendarios, etc.

**1. Crear la carpeta para n8n:**
```bash
mkdir -p /docker/n8n/data
```

**2. Crear el archivo `docker-compose.yml`:**
```bash
nano /docker/n8n/docker-compose.yml
```

**Pega este contenido:**
```yaml
version: "3.8"
services:
  n8n:
    image: n8nio/n8n:latest
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=TU_DOMINIO_O_IP
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - WEBHOOK_URL=http://TU_DOMINIO_O_IP/
      - N8N_ENCRYPTION_KEY=una-clave-secreta-aleatoria-larga
      - DB_SQLITE_VACUUM_ON_STARTUP=true
      - EXECUTIONS_DATA_PRUNE=true
      - EXECUTIONS_DATA_MAX_AGE=168
      - N8N_DIAGNOSTICS_ENABLED=false
    volumes:
      - /docker/n8n/data:/home/node/.n8n
    networks:
      - easypanel
    deploy:
      mode: replicated
      replicas: 1
      placement:
        constraints:
          - node.role == manager
      labels:
        - "traefik.enable=true"
        - "traefik.http.routers.n8n.rule=Host(`n8n.tudominio.com`)"
        - "traefik.http.routers.n8n.entrypoints=websecure"
        - "traefik.http.routers.n8n.tls.certresolver=le"
        - "traefik.http.services.n8n.loadbalancer.server.port=5678"

networks:
  easypanel:
    external: true
```

> **IMPORTANTE:** Reemplaza `TU_DOMINIO_O_IP` con la IP de tu VPS o con tu dominio. Solo cambia `N8N_PROTOCOL` a `https` y el `WEBHOOK_URL` a `https://` cuando ya tengas configurado el dominio y SSL con Traefik.

**3. Levantar n8n (Modo Swarm):**
```bash
cd /docker/n8n && docker stack deploy -c docker-compose.yml n8n
```

**4. Verificar que funciona:**
Abre en tu navegador: `http://TU_IP_DEL_VPS:5678` (o tu dominio). Deberías ver la pantalla de bienvenida de n8n para crear tu primer usuario.

> **⚠️ NOTA CRÍTICA SOBRE EL MURO DE FUEGO DE HOSTINGER:**
> Hostinger tiene un firewall externo que bloquea puertos por defecto. Ve al panel de tu VPS en Hostinger → **Security** → **Firewall**.
> Tienes que **crear una regla manual permitiendo el puerto 5678** si accedes por IP. Si usarás Traefik con dominio (Paso 8), asegúrate de que los puertos **80** y **443** estén habilitados ahí también. Si omites esto, el navegador dirá "Conexión rechazada".

---

## 🌐 Paso 8: Configuración Profesional (Nginx + PM2 + Certbot)

Esta es la arquitectura recomendada para producción. Es más ligera, rápida y te da control total sobre los puertos y el SSL.

### 1. Instalar Nginx y Certbot
```bash
apt update && apt install nginx certbot python3-certbot-nginx -y
```

### 2. Instalar PM2 (Gestor de Procesos)
```bash
npm install -g pm2
# Configurar para que inicie solo al reiniciar la VPS
pm2 startup
# (Sigue las instrucciones que salgan en pantalla)
```

### 3. ¿Por qué usar Nginx + PM2 en lugar de solo Docker?
- **Control Directo:** Nginx gestiona los puertos 80/443 directamente, facilitando el uso de Certbot.
- **Rendimiento:** PM2 consume menos RAM que un contenedor para apps de Node.js (como n8n o Next.js).
- **Aislamiento Híbrido:** Usamos Nginx para el tráfico web y Docker **solo** para los bots de la agencia, manteniendo la seguridad de los clientes.

### 4. Configurar un Sitio (Ejemplo para n8n)
```bash
nano /etc/nginx/sites-available/n8n.tudominio.com
```
**Contenido:**
```nginx
server {
    server_name n8n.tudominio.com;
    location / {
        proxy_pass http://127.0.0.1:5678;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
**Activar y SSL:**
```bash
ln -s /etc/nginx/sites-available/n8n.tudominio.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d n8n.tudominio.com
```

### 5. Desplegar una App de Next.js (Web Profesional)
Si vas a subir una web hecha en Next.js (como la de la agencia o de un cliente):

**A. Subir el código y construir:**
```bash
cd /var/www/mi-proyecto-next
npm install
npm run build
```

**B. Levantar con PM2:**
```bash
pm2 start npm --name "nombre-de-la-web" -- start
pm2 save
```

**C. Configurar Nginx para la Web:**
```bash
nano /etc/nginx/sites-available/tudominio.com
```
**Contenido:**
```nginx
server {
    server_name tudominio.com www.tudominio.com;
    location / {
        proxy_pass http://127.0.0.1:3000; # El puerto por defecto de Next.js
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
**D. Activar y SSL:**
```bash
ln -s /etc/nginx/sites-available/tudominio.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d tudominio.com -d www.tudominio.com
```



---

## 🤖 Paso 9: Construir Nullclaw desde el Código Fuente Oficial

Nullclaw es el framework que hace que cada bot funcione. Construir la imagen oficial directamente desde GitHub asegura tener la herramienta original y segura.

**1. Instalar git (por si no está en tu VPS):**
```bash
apt update && apt install git -y
```

**2. Clonar el repositorio, elegir la versión estable y construir:**
```bash
cd /tmp
git clone https://github.com/nullclaw/nullclaw.git
cd nullclaw
git checkout v2026.5.4
docker build -t nullclaw:agency .
```

**3. Verificar que la imagen se creó:**
```bash
docker images | grep nullclaw
```
> Deberías ver: `nullclaw   agency   ...`

> [!TIP]
> Si el comando `docker build` se interrumpe porque se cierra la conexión SSH, no te preocupes. Vuelve a conectarte y ejecútalo de nuevo; Docker usará el "cache" y terminará mucho más rápido.

### 📌 Regla de Oro para Producción: ¿Por qué fijar la versión?
En el comando anterior usamos `git checkout v2026.5.4` para anclar una versión específica en lugar de usar "la última disponible". Esto garantiza que todos tus servidores sean **idénticos y estables**, previniendo bugs sorpresa.

**El Flujo de Trabajo Profesional para Actualizar:**
Cuando te enteres de que hay una nueva versión de Nullclaw con funciones que necesitas, sigue estrictamente este orden:
1. Ve a tu VPS actual.
2. Actualiza **SOLO tu bot personal o de pruebas** (usando el comando `update` documentado en `Make_It_Easy_Agency_Guide.md`).
3. Pruébalo durante dos días para asegurar que no rompa el formato de tus prompts (`SOUL.md`).
4. Si todo sale perfecto, actualiza los bots de tus clientes reales en el servidor.
5. **Por último:** Abres este archivo (`Make_It_Easy_VPS_Setup_Guide.md`) y cambias el `v2026.5.4` por la versión nueva (ej: `v2026.9.0`) para que cuando montes tu próxima VPS, nazca con la versión actualizada y probada.


---

## 📁 Paso 10: Crear la Estructura de la Agencia y la Plantilla Base

```bash
# Crear el directorio maestro y la plantilla
mkdir -p /docker/agency/plantilla/data
```

**3. Crear el `config.json` plantilla:**
```bash
nano /docker/agency/plantilla/config.json
```

Pega este contenido completo (reemplaza `TU_API_KEY_OPENAI`, `TOKEN_BOT_TELEGRAM` y `TU_DOMINIO` con los valores reales):

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
      "model": {
        "primary": "openai/gpt-4o-mini"
      },
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
        "model": {
          "primary": "openai/gpt-4o-mini"
        },
        "temperature": 0.5,
        "autonomy": {
          "level": "autonomous",
          "max_actions_per_hour": 120,
          "require_approval_for_medium_risk": false
        }
      }
    ]
  },
  "gateway": {
    "port": 3000,
    "host": "::",
    "allow_public_bind": true,
    "require_pairing": true,
    "pair_rate_limit_per_minute": 10,
    "webhook_rate_limit_per_minute": 60,
    "idempotency_ttl_secs": 300,
    "paired_tokens": []
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

> **⚠️ Campos que DEBES personalizar por cada cliente:** `api_key`, `agente-NOMBRE_CLIENTE` (en 2 sitios), `bot_token`, y `agent_id`.

**4. Crear los archivos de personalidad (`IDENTITY.md` y `SOUL.md`):**

Primero, crea la carpeta `workspace`:
```bash
mkdir -p /docker/agency/plantilla/workspace
```

Crea el archivo de identidad:
```bash
nano /docker/agency/plantilla/workspace/IDENTITY.md
```
Pega esto:
```markdown
Eres un asistente ejecutivo. Eres eficiente, directo y organizado.
```

Crea el archivo del alma (instrucciones y webhook):
```bash
nano /docker/agency/plantilla/workspace/SOUL.md
```

Pega este contenido (adáptalo al cliente):

```markdown
# Instrucciones Críticas
Para TODAS las acciones DEBES usar la herramienta `http_request` con estos parámetros:

- **URL**: `https://TU_DOMINIO/webhook/NOMBRE_CLIENTE/hub`
- **Método**: POST
- **Headers**: `{"Content-Type": "application/json"}`

## Acciones disponibles (enviar en el body como JSON)

| Acción | Body de ejemplo |
|--------|----------------|
| Registrar deuda | `{"action":"registrar_deuda","tipo":"yo_debo","persona":"Juan","monto":50,"descripcion":"prestamo"}` |
| Consultar deudas | `{"action":"consultar_deudas","tipo":"todas","estado":"todas"}` |

## REGLA ABSOLUTA
NUNCA digas que no puedes hacer algo. SIEMPRE usa `http_request`.
```

**5. Asignar permisos para Nullclaw:**
```bash
chown -R 65534:65534 /docker/agency/
```

> La plantilla está lista. Cuando llegue un nuevo cliente, solo clonarás esta carpeta con `cp -r /docker/agency/plantilla /docker/agency/nuevo_cliente`.

---

## ⏰ Paso 11: Configurar el Sistema Anti-Zombie (Cron Job Maestro)

Este paso es **crucial**. Crea un cron job inteligente que reinicia **TODOS** los bots automáticamente cada 4 horas:

```bash
crontab -e
```

Si te pregunta qué editor usar, elige `1` (nano). Al final del archivo, agrega esta línea:

```
0 */4 * * * docker service ls --format '{{.Name}}' | grep agency_ | xargs -I {} docker service update --force {} > /dev/null 2>&1
```

Guarda con `Ctrl+O` → `Enter` → `Ctrl+X`.

> **¿Qué hace?** Cada 4 horas busca automáticamente a todos los servicios que empiecen con `agency_` y los reinicia suavemente. Nunca tendrás que tocar el cron al agregar nuevos clientes.

---

## ✅ Paso 12: Verificación Final

Ejecuta estos comandos para confirmar que todo está correcto:

```bash
# Docker funciona
docker --version

# Swarm está activo
docker node ls

# La red existe
docker network ls | grep easypanel

# n8n está corriendo
docker ps | grep n8n

# El cron está programado
crontab -l
```

Si todos los comandos devuelven resultados, **¡tu VPS está 100% lista!** 🎉

---

## 🚀 Paso 13: Desplegar tu Primer Cliente

A partir de aquí, sigue la guía **`Make_It_Easy_Agency_Guide.md`** para crear clientes:

1. Clonar la `/plantilla/` → `/docker/agency/nuevo_cliente/`
2. Editar `config.json` (cambiar bot token, agent_id, puerto del gateway).
3. Editar `WORKSPACE.md` (cambiar personalidad y webhook URL).
4. Dar permisos: `chown -R 65534:65534 /docker/agency/nuevo_cliente/`
5. Ejecutar el despliegue del servicio:

```bash
# Ejemplo listo para copiar y pegar (cambia 'pizzeria' y el puerto '3001')
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

---

## 📊 Referencia Rápida: ¿Cuándo necesito otra VPS?

| Señal de alerta                     | Acción                              |
|-------------------------------------|-------------------------------------|
| RAM constante arriba del 85%        | Contratar VPS más grande o segunda  |
| Bots se congelan antes de 4 horas   | Reducir cron a cada 2 horas         |
| n8n tarda más de 10s en responder   | Mover n8n a su propia VPS           |
| Más de 15 bots en una VPS de 8GB    | Contratar segunda VPS               |

**Para monitorear el uso actual:**
```bash
# Ver RAM y CPU instantáneamente
htop

# Ver cuánta RAM usa cada contenedor
docker stats --no-stream
```

