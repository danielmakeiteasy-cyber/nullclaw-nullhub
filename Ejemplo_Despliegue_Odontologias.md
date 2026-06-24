# Caso de Éxito: Despliegue Cliente "Odontologías" 🦷

Esta guía documenta el paso a paso **real y verificado** para desplegar el asistente dental.
Incluye todos los errores encontrados y sus soluciones para que no los repitas.

> [!IMPORTANT]
> Este caso documentó el descubrimiento más importante del proyecto: **Nullclaw NO lee las instrucciones del bot desde `config.json` ni desde un archivo `WORKSPACE.md` en `/data/`**. Las lee desde archivos específicos en la carpeta `/workspace/` que él mismo crea.

---

## 📁 Estructura Final Correcta

```text
/docker/agency/odontologias/
├── config.json                     ← Tokens, modelo, webhook habilitado
└── workspace/                      ← ¡Nullclaw crea esto automáticamente!
    ├── IDENTITY.md                 ← Nombre: "Dra. Sofia" + emoji 🦷
    ├── SOUL.md                     ← Instrucciones + URL del webhook
    ├── TOOLS.md                    ← (Generado por Nullclaw)
    ├── AGENTS.md                   ← (Generado por Nullclaw)
    ├── USER.md                     ← (Generado por Nullclaw)
    ├── HEARTBEAT.md                ← (Generado por Nullclaw)
    └── memory.db                   ← Base de datos de conversaciones
```

---

## Paso 1: Preparación del Entorno
Clonamos la plantilla base para crear el espacio de trabajo del cliente.

```bash
cp -r /docker/agency/plantilla /docker/agency/odontologias
```

## Paso 2: Configuración Global (`config.json`)
Editamos los tokens, el ID del agente y el workspace_path.

```bash
nano /docker/agency/odontologias/config.json
```

**El config.json final debe verse así:**
```json
{
  "default_temperature": 0.7,
  "models": {
    "providers": {
      "openai": {
        "api_key": "TU_API_KEY_DE_OPENAI"
      }
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "openai/gpt-4o-mini" }
    },
    "list": [
      {
        "id": "agente-odontologias",
        "workspace_path": "/nullclaw-data/workspace"
      }
    ]
  },
  "channels": {
    "telegram": {
      "accounts": {
        "bot_odontologia": {
          "bot_token": "TU_TOKEN_DE_TELEGRAM",
          "agent_id": "agente-odontologias",
          "allow_from": ["*"]
        }
      }
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

> [!IMPORTANT]
> El campo `workspace_path` DEBE ser `/nullclaw-data/workspace`. Si pones `/nullclaw-data/data`, el bot ignorará todos tus archivos de instrucciones y responderá de forma genérica.

## Paso 3: Asignar Permisos y Primer Arranque
Antes de configurar la personalidad, necesitamos que Nullclaw cree la carpeta `workspace/`:

```bash
# Asignar permisos al UID de Nullclaw
chown -R 65534:65534 /docker/agency/odontologias/

# Levantar el servicio por primera vez
docker service create \
  --name agency_odontologias \
  --replicas 1 \
  --restart-condition on-failure \
  --limit-memory 512m \
  --network easypanel \
  --publish 3004:3000 \
  --mount type=bind,source=/docker/agency/odontologias,target=/nullclaw-data \
  nullclaw:agency
```

Espera 15 segundos y verifica que la carpeta fue creada:
```bash
ls -la /docker/agency/odontologias/workspace/
```
*Deben aparecer los archivos: IDENTITY.md, SOUL.md, TOOLS.md, etc.*

## Paso 4: Inicializar los Archivos del Workspace
Usamos el comando oficial de Nullclaw para generar la estructura correcta:

```bash
docker run -it --rm \
  -v /docker/agency/odontologias:/nullclaw-data \
  nullclaw:agency workspace reset-md
```
*Deberías ver: `Workspace markdown reset complete: rewrote 7 file(s)`*

## Paso 5: Configurar la Identidad (`IDENTITY.md`)
Aquí definimos el nombre y la "esencia" del bot:

```bash
cat << 'EOF' > /docker/agency/odontologias/workspace/IDENTITY.md
- **Name:** Dra. Sofia
- **Creature:** AI dental assistant
- **Vibe:** warm, professional, empathetic
- **Emoji:** 🦷
EOF
```

## Paso 6: Configurar las Instrucciones y Webhooks (`SOUL.md`)
Este es el archivo más importante. Aquí defines el comportamiento y la conexión con n8n:

```bash
cat << 'EOF' > /docker/agency/odontologias/workspace/SOUL.md
Eres Dra. Sofia, la asistente oficial de la Clínica Odontológica.
Tu única función es ayudar a los pacientes a resolver dudas sobre
salud oral y agendar citas.

Para cualquier acción externa DEBES usar la herramienta http_request:
- URL: https://n8n.makeiteasycol.com/webhook/odontologias
- Método: POST
- Headers: {"Content-Type": "application/json"}

Si el webhook requiere autenticación, agrega:
- Authorization: Basic TU_CODIGO_BASE64

Sé siempre empática y profesional. Confirma cada cita agendada
con un resumen claro para el paciente.
EOF
```

## Paso 7: Carga de Conocimiento Dental (RAG)
Creamos los archivos donde el bot consultará información real de la clínica:

```bash
# Crear carpeta
mkdir -p /docker/agency/odontologias/data/knowledge

# Crear archivos base
touch /docker/agency/odontologias/data/knowledge/servicios.md
touch /docker/agency/odontologias/data/knowledge/precios.md
touch /docker/agency/odontologias/data/knowledge/faqs.md

# Editar con información real de la clínica
nano /docker/agency/odontologias/data/knowledge/precios.md
```

## Paso 8: Limpiar Memoria y Reiniciar
Borramos cualquier conversación previa y reiniciamos para que todo quede limpio:

```bash
# Borrar memoria (por si el bot venía con historial de pruebas)
rm -f /docker/agency/odontologias/workspace/memory.db
rm -f /docker/agency/odontologias/workspace/memory.db-shm
rm -f /docker/agency/odontologias/workspace/memory.db-wal

# Aplicar todos los cambios
docker service update --force agency_odontologias
```

## Paso 9: Verificación Definitiva (Prueba de Identidad)
Antes de entregar al cliente, probamos el bot directamente desde la línea de comandos:

```bash
docker run -it --rm \
  -v /docker/agency/odontologias:/nullclaw-data \
  nullclaw:agency agent -m "quien eres y para que clinica trabajas"
```

**Respuesta esperada:**
> *"Soy Dra. Sofia, tu asistente dental. Estoy aquí para ayudarte con dudas sobre salud oral y agendar citas. ¿En qué puedo asistirte hoy? 🦷"*

Si la respuesta es correcta → ¡El bot está listo para producción!

---

## 🐛 Errores Encontrados y Sus Soluciones

### ❌ Error 1: Bot responde genérico ("Soy un asistente de IA...")
**Causa:** El `workspace_path` apuntaba a `/nullclaw-data/data` en lugar de `/nullclaw-data/workspace`.
**Solución:**
```bash
sed -i 's|"workspace_path": "/nullclaw-data/data"|"workspace_path": "/nullclaw-data/workspace"|g' \
  /docker/agency/odontologias/config.json
docker service update --force agency_odontologias
```

### ❌ Error 2: Bot con "bucle de reinicios" y CPU al 90% (Contenedor Zombie)
**Síntoma:** El servidor se pone lento. Al ejecutar `top`, ves procesos `nullclaw` bajo el usuario `nobody` consumiendo 90%+ de CPU.
**Causa:** Puede deberse a dos cosas:
1. Dos instancias (Swarm service + `docker run` manual) peleando por el mismo token de Telegram.
2. Un bug interno de Nullclaw en la versión `dev` (Busy-loop en el gateway HTTP).

**Solución:** Apagar el Swarm service escalando a 0 para calmar la CPU. Si el problema son los tokens, corrígelos. Si es el bug de la versión, actualiza Nullclaw (ver `Make_It_Easy_Agency_Guide.md` para las instrucciones de actualización paso a paso).
```bash
docker service scale agency_odontologias=0
# Hacer pruebas o corregir config.json...
docker service scale agency_odontologias=1
```

### ❌ Error 3: Bot no responde en Telegram pero sí en CLI
**Causa:** Token de Telegram incorrecto en `config.json`.
**Diagnóstico:** Ir a @BotFather → `/mybots` → seleccionar el bot → `API Token` y comparar.

### ❌ Error 4: `system_prompt` en config.json es ignorado
**Causa:** En Nullclaw, el `system_prompt` del config.json NO configura la personalidad del bot en producción. Solo funciona a través de `IDENTITY.md` y `SOUL.md` en la carpeta `workspace/`.
**Solución:** Siempre editar `SOUL.md` en lugar del `system_prompt`.

---

## 🛠️ Comandos de Mantenimiento

### Borrar memoria (Reset conversacional)
```bash
rm -f /docker/agency/odontologias/workspace/memory.db
rm -f /docker/agency/odontologias/workspace/memory.db-shm
rm -f /docker/agency/odontologias/workspace/memory.db-wal
docker service update --force agency_odontologias
```

### Actualizar instrucciones del bot
```bash
nano /docker/agency/odontologias/workspace/SOUL.md
docker service update --force agency_odontologias
```

### Ver config actual del bot
```bash
docker run --rm \
  -v /docker/agency/odontologias:/nullclaw-data \
  nullclaw:agency config show
```
