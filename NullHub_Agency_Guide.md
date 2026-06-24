# Guía de la Agencia: Operaciones Diarias con NullHub

Esta guía cubre todo lo que necesitas para gestionar los clientes de la agencia usando el panel web **NullHub** en `https://hub.tudominio.com` (reemplaza con tu dominio real).

> **Prerrequisito:** El servidor ya debe tener el stack instalado. Si es una VPS nueva, primero sigue la `NullHub_Setup_Guide.md`.

---

## 🆕 Dar de Alta a un Nuevo Cliente (100% Gráfico)

Para registrar un cliente completamente nuevo (ejemplo: `pizzeria`) que **no tiene carpetas previas en el servidor**:

### Paso 1 — Crear el Bot de Telegram
1. Abre Telegram y escríbele a `@BotFather`.
2. Envía el comando `/newbot` y sigue las instrucciones.
3. Copia el **token** que te entrega (formato: `1234567890:ABCdef...`).

### Paso 2 — Instalar el Agente desde NullHub
1. Ve a `https://hub.makeiteasycol.com` en tu navegador.
2. Haz clic en **INSTALL COMPONENT** → **NULLCLAW**.
3. Completa el asistente:

   **Pantalla 1 - Setup:**
   | Campo | Qué poner |
   |---|---|
   | INSTANCE NAME | Nombre del cliente en minúsculas (ej: `pizzeria`) |
   | VERSION | Dejar la versión más reciente recomendada |
   | PROVIDER | `OpenAI (GPT direct)` |
   | API KEY | La clave de OpenAI del cliente o tu clave de agencia |
   | MODEL | `gpt-4o-mini` (balance ideal de costo y capacidad) |

   **Pantalla 2 - Channels:**
   | Campo | Qué poner |
   |---|---|
   | Canal | Selecciona **TELEGRAM** |
   | BOT TOKEN | El token que te dio `@BotFather` |
   | ALLOW FROM | `*` (cualquier usuario puede hablar con el bot) |

   **Pantalla 3 - Settings:**
   | Campo | Qué poner |
   |---|---|
   | MEMORY BACKEND | `sqlite` |
   | TUNNEL PROVIDER | `NONE` |
   | AUTONOMY LEVEL | `SUPERVISED` |

4. Haz clic en **INSTALL**. El bot se creará y arrancará automáticamente.

### Paso 3 — Crear el Webhook en n8n
1. Abre `https://n8n.makeiteasycol.com`.
2. Crea un **nuevo workflow** con un nodo **Webhook** como primer paso.
3. Configura el nodo Webhook:
   - **HTTP Method:** `POST`
   - **Path:** `pizzeria` (o el nombre del cliente)
   - La URL resultante será: `https://n8n.makeiteasycol.com/webhook/pizzeria`
4. Conecta el webhook con los nodos de automatización del cliente (Google Sheets, Calendar, etc.).
5. Activa el workflow con el toggle **Active** en la esquina superior derecha.

### Paso 4 — Ver y Editar el SOUL.md (Personalidad e Instrucciones)
El `SOUL.md` es el archivo más importante del bot: le dice quién es, cómo actuar y cómo llamar al webhook de n8n.

> ⚠️ **NullHub no tiene editor visual para este archivo en el panel web.**
> El SOUL.md siempre se gestiona por SSH como se muestra a continuación.

Conéctate al VPS por SSH. Reemplaza `pizzeria` con el nombre real del agente:

**Solo VER el contenido actual (sin modificar nada):**
```bash
cat ~/.nullhub/instances/nullclaw/pizzeria/workspace/SOUL.md
```

**Editar el contenido:**
```bash
nano ~/.nullhub/instances/nullclaw/pizzeria/workspace/SOUL.md
```
*Dentro de nano: edita el texto → guarda con `Ctrl+O` → `Enter` → sal con `Ctrl+X`*

Reemplaza el contenido con esto, adaptado al cliente:
```markdown
Eres Napoli, el asistente oficial de la Pizzería Napoli.
Tu trabajo es ayudar a los clientes a ver el menú, hacer pedidos y resolver dudas.

## REGLA ABSOLUTA
Para CUALQUIER acción, DEBES usar la herramienta `http_request` con estos parámetros EXACTOS:

- **URL**: https://n8n.tudominio.com/webhook/pizzeria
- **Método**: POST
- **Headers**: {"Content-Type": "application/json"}

## Acciones disponibles:

| Acción del cliente       | Body JSON que debes enviar                                              |
|--------------------------|-------------------------------------------------------------------------|
| Ver el menú              | `{"action": "consultar_menu"}`                                          |
| Hacer un pedido          | `{"action": "registrar_pedido", "items": ["Pizza"], "total": 35000}`   |
| Consultar estado pedido  | `{"action": "consultar_pedido", "nombre": "Juan"}`                     |

## Tono y comportamiento:
- Sé amigable y cálido.
- Confirma siempre los datos antes de registrar algo.
- Si n8n responde con datos, muéstralos de forma clara.
- NUNCA digas que no puedes hacer algo. Siempre usa http_request.
```

Guarda (`Ctrl+O` → `Enter` → `Ctrl+X`) y luego presiona **RESTART** en el panel de NullHub para aplicar los cambios.

### Paso 5 — Ver y Editar el IDENTITY.md (Nombre y Personalidad)
El `IDENTITY.md` define el nombre visible, la personalidad base y el emoji del bot.

> ⚠️ **NullHub no tiene editor visual para este archivo en el panel web.**
> El IDENTITY.md siempre se gestiona por SSH.

**Solo VER el contenido actual (sin modificar nada):**
```bash
cat ~/.nullhub/instances/nullclaw/pizzeria/workspace/IDENTITY.md
```

**Editar el contenido:**
```bash
nano ~/.nullhub/instances/nullclaw/pizzeria/workspace/IDENTITY.md
```

Contenido recomendado (adáptalo al cliente):
```markdown
- **Name:** Napoli
- **Creature:** AI assistant
- **Vibe:** warm, friendly, helpful
- **Emoji:** 🍕
```

Guarda (`Ctrl+O` → `Enter` → `Ctrl+X`) y presiona **RESTART** en NullHub para aplicar los cambios.

### Paso 6 — Probar el flujo completo
1. Abre Telegram y escríbele al bot del cliente (ej: "quiero ver el menú").
2. En NullHub → pestaña **LOGS** del agente, verifica que el bot llama a n8n.
3. En n8n → sección **Executions**, verifica que llegó la llamada y que respondió correctamente.

---

## 🔄 Migrar un Agente Existente (Desde Docker Swarm a NullHub)

Si ya tienes un cliente corriendo en Docker Swarm (ej: `daniel` en `/docker/agency/daniel`):

### Paso 1 — Detener el servicio de Docker Swarm
⚠️ **Este paso es obligatorio.** Si no lo haces, habrá dos procesos (Docker y NullHub) conectados al mismo token de Telegram al mismo tiempo, causando que el bot falle o no responda.
```bash
docker service scale agency_daniel=0
```
Espera 10 segundos y verifica que ya no está corriendo:
```bash
docker service ls | grep daniel
# Debe mostrar 0/0 en la columna REPLICAS
```

### Paso 2 — Respaldar la configuración actual
```bash
cp /docker/agency/daniel/config.json /docker/agency/daniel/config.json.bak
```

### Paso 3 — Registrar con nombre temporal en NullHub
Como la carpeta `daniel` ya existe en el disco, el asistente bloqueará ese nombre para evitar sobreescritura accidental. Usa un nombre temporal:
1. En NullHub → **INSTALL COMPONENT** → **NULLCLAW**.
2. Escribe `daniel-temp` como nombre de instancia.
3. Ingresa cualquier API Key y token temporal y haz clic en **INSTALL**.

### Paso 4 — Reemplazar con los datos reales
```bash
# 1. Detener NullHub para editar los archivos sin conflictos
systemctl stop nullhub

# 2. Restaurar el config.json original del cliente
cp /docker/agency/daniel/config.json.bak /docker/agency/daniel/config.json

# 3. Editar state.json: busca "daniel-temp" y cámbialo por "daniel"
nano ~/.nullhub/state.json
# Guarda: Ctrl+O → Enter → Ctrl+X

# 4. Borrar la carpeta temporal que creó el asistente
rm -rf ~/.nullhub/instances/nullclaw/daniel-temp

# 5. Crear enlace simbólico: NullHub apunta a los archivos reales de producción
ln -s /docker/agency/daniel ~/.nullhub/instances/nullclaw/daniel

# 6. Arrancar NullHub nuevamente
systemctl start nullhub
```

Abre NullHub en el navegador y verás que `DANIEL` está activo y corriendo con su configuración real de producción.

---

## 🔍 Operaciones del Día a Día desde el Panel

Al hacer clic en un agente en la barra lateral de NullHub, tienes acceso a:

| Pestaña | Para qué sirve |
|---|---|
| **OVERVIEW** | Estado del agente (running/stopped), versión, puerto, PID, uptime |
| **LOGS** | Tail de logs en tiempo real para ver qué hace el bot y detectar errores |
| **CHAT** | Chat privado con el bot para probar respuestas sin usar Telegram |
| **MEMORY** | Ver y limpiar el historial de conversaciones (`memory.db`) |
| **CONFIG** | Editar el `config.json` del agente directamente desde el navegador |

**Botones de acción (esquina superior derecha):**
- **START:** Enciende el bot.
- **STOP:** Apaga el bot (sin borrar sus archivos).
- **RESTART:** Reinicia el bot y aplica cualquier cambio en los archivos `.md`.
- **DELETE:** Desregistra el agente de NullHub. ⚠️ No borra sus archivos del servidor.

---

## 🧹 Limpiar la Memoria de un Bot

Cuando un bot lleva mucho tiempo activo, su historial puede afectar la calidad de las respuestas. Para resetearlo:

```bash
# Borrar los archivos de memoria SQLite
rm -f ~/.nullhub/instances/nullclaw/pizzeria/workspace/memory.db
rm -f ~/.nullhub/instances/nullclaw/pizzeria/workspace/memory.db-shm
rm -f ~/.nullhub/instances/nullclaw/pizzeria/workspace/memory.db-wal
```

Luego presiona **RESTART** en NullHub. El bot arrancará con el historial en blanco.

---

## 🩺 Tabla de Diagnóstico Rápido

| Problema | Causa probable | Solución |
|---|---|---|
| El bot no responde en Telegram | Token inválido o bot apagado | Revisar **LOGS** en NullHub; verificar que el token en la pestaña **CONFIG** sea correcto |
| El bot no llama al webhook de n8n | URL incorrecta en `SOUL.md` | Abrir `SOUL.md` por SSH y verificar que la URL coincide exactamente con la del nodo Webhook en n8n |
| n8n no recibe nada | Workflow no activado en n8n | En n8n, activar el workflow con el toggle **Active** |
| El bot responde de forma genérica | `SOUL.md` vacío o con plantilla sin editar | Editar `SOUL.md` con instrucciones reales y hacer **RESTART** |
| NullHub no carga (`502 Bad Gateway`) | Servicio detenido | `systemctl restart nullhub` |
| Error `FORBIDDEN ORIGIN` al usar NullHub | Falta el bypass CORS en Nginx | Verificar que el archivo de Nginx de NullHub tiene los 3 `proxy_set_header` del bypass |
