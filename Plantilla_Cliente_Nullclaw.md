# 📂 Plantilla Base para Nuevos Clientes (Nullclaw)

> **Ubicación en el servidor:** `/docker/agency/plantilla/`
> **Uso:** Clonar esta carpeta para cada nuevo cliente.

---

## 📄 1. Archivo `config.json`
**Ruta:** `/docker/agency/plantilla/config.json`

> **Nota:** ¡Asegúrate de que `workspace_path` apunte a `/nullclaw-data/workspace` y NO incluyas `system_prompt` aquí!

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
          "level": "full",
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
  "http_request": {
    "enabled": true,
    "max_response_size": 1000000,
    "timeout_secs": 120,
    "allowed_domains": ["*"]
  }
}
```

---

## 🧠 2. Archivos de Personalidad e Instrucciones

En Nullclaw, la personalidad y las reglas no van en el config.json, van en la carpeta `workspace/`.

**A. Archivo de Identidad (`IDENTITY.md`)**
**Ruta:** `/docker/agency/plantilla/workspace/IDENTITY.md`

```markdown
Eres un asistente ejecutivo. Eres eficiente, directo y organizado. 
```

**B. Archivo de Reglas y Lógica (`SOUL.md`)**
**Ruta:** `/docker/agency/plantilla/workspace/SOUL.md`

```markdown
# Instrucciones Críticas
Para TODAS las acciones DEBES usar la herramienta `http_request` con estos parámetros:

- **URL**: `https://TU_DOMINIO/webhook/NOMBRE_CLIENTE/hub`
- **Método**: POST
- **Headers**: `{"Content-Type": "application/json"}`

## Acciones disponibles (enviar en el body como JSON)

| Acción | Body de ejemplo |
|--------|----------------|
| Acción 1 | `{"action":"ejemplo_1","parametro":"valor"}` |
| Acción 2 | `{"action":"ejemplo_2","parametro":"valor"}` |

## Regla Absoluta
NUNCA digas que no puedes hacer algo. SIEMPRE usa `http_request`.
```

---

## 🚀 3. Flujo de Despliegue Rápido (Copiar y Pegar)

Al ingresar un nuevo cliente, ejecuta esto en orden:

```bash
# 1. Crear las carpetas base
mkdir -p /docker/agency/nuevo_cliente/workspace

# 2. Copiar archivos (asumiendo que ya preparaste tu plantilla localmente)
cp -r /docker/agency/plantilla/* /docker/agency/nuevo_cliente/

# 3. Editar config.json (Cambiar API Keys, Tokens y el agent_id)
nano /docker/agency/nuevo_cliente/config.json

# 4. Editar SOUL.md y IDENTITY.md (Poner el webhook de n8n y su personalidad)
nano /docker/agency/nuevo_cliente/workspace/SOUL.md
nano /docker/agency/nuevo_cliente/workspace/IDENTITY.md

# 5. Ajustar Permisos para que Docker pueda leer y escribir (¡CRÍTICO!)
chown -R 65534:65534 /docker/agency/nuevo_cliente/

# 6. Desplegar el Bot (Ajusta el nombre del cliente y el puerto)
docker service create \
  --name agency_nuevo_cliente \
  --replicas 1 \
  --restart-condition on-failure \
  --limit-memory 512m \
  --network easypanel \
  --publish 3005:3000 \
  --mount type=bind,source=/docker/agency/nuevo_cliente,target=/nullclaw-data \
  nullclaw:agency
```
