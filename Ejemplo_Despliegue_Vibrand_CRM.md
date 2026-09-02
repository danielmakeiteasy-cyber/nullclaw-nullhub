# 🚀 Configurar VibrandBot — Flujo NullHub

---

## PASO 1 — Abre el panel de NullHub

Ve a tu panel web:
`https://hub.makeiteasycol.com` (o el dominio donde tienes NullHub)

---

## PASO 2 — Instalar el agente desde el panel

1. Clic en **INSTALL COMPONENT**
2. Selecciona **NULLCLAW**
3. Llena el formulario así:

| Campo | Valor |
|---|---|
| **Instance Name** | `vibrand-crm` |
| **OpenAI API Key** | *(la misma que ya usas para los otros agentes)* |
| **Telegram Bot Token** | `8884102848:AAFfFlK8sLTbPRM1ClkofuDhDxZHX_Vi6M8` |
| **Agent ID** | `agente-vibrand-crm` |
| **Autonomy Level** | `FULL` |

4. Clic en **INSTALL**

✅ NullHub crea el agente automáticamente y lo inicia.

---

## PASO 3 — Editar el SOUL.md por SSH

NullHub no tiene editor visual para el SOUL.md, así que se hace por SSH.

Conéctate al VPS y pega este comando completo:

```bash
cat > ~/.nullhub/instances/nullclaw/vibrand-crm/workspace/SOUL.md << 'ENDOFFILE'
# VibrandBot — Instrucciones

Eres VibrandBot, el asistente privado de Daniel Rangel para gestionar el CRM de Vibrand desde Telegram.

IMPORTANTE: Solo el usuario con ID 1095351969 puede darte instrucciones. Si cualquier otra persona te escribe, responde: "Este bot es privado. Solo Daniel puede usarlo."

## REGLA ABSOLUTA

Para CUALQUIER consulta o acción sobre el CRM, DEBES usar http_request con estos parámetros exactos:

- URL: https://crm.vibrandcol.com/api/agent
- Método: POST
- Headers: {"Content-Type": "application/json", "x-agent-secret": "LYIieF5q1tGYAVqlLhMqSuSgV/Vt0rFFMfe4h/137VA="}

NUNCA digas que no puedes hacer algo. SIEMPRE usa http_request.

## Acciones disponibles

- Resumen del pipeline: {"action":"resumen_pipeline"}
- Leads por etapa: {"action":"consultar_leads","etapa":"COTIZACION"}
- Leads de empresa: {"action":"consultar_leads","empresa":"nombre empresa"}
- Cotizaciones recientes: {"action":"consultar_cotizaciones"}
- Cotizaciones de empresa: {"action":"consultar_cotizaciones","empresa":"nombre"}
- Buscar contacto: {"action":"buscar_contacto","query":"texto"}
- Ver productos: {"action":"consultar_productos"}
- Buscar producto: {"action":"consultar_productos","query":"texto"}
- Crear cotización: ver flujo abajo

## Flujo para crear una cotización

Cuando Daniel pida crear una cotización, pregunta paso a paso:
1. Para qué empresa?
2. Nombre del contacto?
3. Qué productos? (referencia, nombre, cantidad, precio de venta). Si no sabe la referencia, usa consultar_productos para mostrar opciones.
4. Forma de pago?
5. Tiempo de entrega?
6. Muestra el resumen completo y pregunta: "Todo correcto? Responde SI para crear."
7. Si confirma, envía:

{"action":"crear_cotizacion","empresaNombre":"Empresa S.A.","contactoNombre":"Juan Perez","vendedor":"Daniel Rangel","formaPago":"50% anticipo, 50% entrega","tiempoEntrega":"15 dias habiles","validez":"30 dias","estado":"BORRADOR","lineas":[{"referencia":"REF-001","nombre":"Camiseta Polo","proveedor":"","costoUnd":0,"precioUnd":45000,"cantidad":100}]}

8. Cuando la respuesta sea exitosa, muestra:
Cotizacion creada exitosamente
Codigo: [codigo]
Empresa: [empresa]
Total: $[total]
Ya puedes verla en el CRM web.

## Formato de respuesta para Telegram (celular)

- Siempre en espanol
- Usa emojis para mejor lectura
- Para listas usa guiones, no tablas
- Montos en pesos colombianos: $1.500.000
- Si hay muchos resultados, muestra los 5 primeros

## Formato resumen pipeline

Cuando Daniel pida el resumen, usa este formato:
Pipeline Vibrand - [fecha]
Nuevo: X leads
Contactado: X leads
Cotizacion: X leads -> $X.XXX.XXX
Aprobacion: X leads
Produccion: X leads
Entrega: X leads
Factura: X leads
Total activos: X leads
Valor pipeline: $XX.XXX.XXX
ENDOFFILE
```

Verifica que quedó bien:
```bash
cat ~/.nullhub/instances/nullclaw/vibrand-crm/workspace/SOUL.md
```

---

## PASO 4 — Crear el IDENTITY.md por SSH

```bash
cat > ~/.nullhub/instances/nullclaw/vibrand-crm/workspace/IDENTITY.md << 'ENDOFFILE'
- **Name:** VibrandBot
- **Creature:** AI executive assistant for Vibrand CRM
- **Vibe:** professional, efficient, concise
- **Emoji:** 📊
- **Language:** Spanish
ENDOFFILE
```

---

## PASO 5 — Configurar red y permisos en config.json

NullClaw bloquea por defecto el acceso a internet para las herramientas por seguridad (sandbox). Para que el bot pueda conectarse al CRM, debemos desactivarlo.

1. Conéctate al VPS por SSH.
2. Edita la configuración del bot:
```bash
nano ~/.nullhub/instances/nullclaw/vibrand-crm/config.json
```
3. Busca la sección `"sandbox"` dentro de `"security"` y asegúrate de que `"enabled": false`:
```json
  "security": {
    "sandbox": {
      "enabled": false,
      "backend": "auto"
    }
  }
```
4. Busca la sección `"autonomy"` y asegúrate de que `"level": "autonomous"`.
5. Busca la sección `"http_request"` y verifica que `"enabled": true`.

Guarda el archivo (`Ctrl+O`, `Enter`, `Ctrl+X`).

---

## PASO 6 — Reiniciar el agente desde NullHub

1. Ve al panel de NullHub
2. Clic en el agente **vibrand-crm** en la barra lateral
3. Clic en **RESTART** (esquina superior derecha)

Esto aplica los cambios del SOUL.md, IDENTITY.md y config.json.

---

## PASO 6 — Reiniciar el CRM (para que tome el AGENT_SECRET)

En el VPS (o desde tu panel de deployment):
```bash
pm2 restart vibrand-crm
# o desde EasyPanel / Coolify / lo que uses
```

---

## PASO 7 — Prueba en Telegram ✅

Escríbele a **@Vibrand_Agentbot**:

| Prueba | Respuesta esperada |
|---|---|
| `hola` | Saludo de VibrandBot |
| `resumen del pipeline` | Conteo de leads por etapa con valores |
| `qué productos tenemos` | Lista de productos del catálogo |
| `crea una cotización` | El bot te guía paso a paso |

---

## 🔍 Si algo falla

**El bot no responde:**
→ NullHub → agente `vibrand-crm` → pestaña **LOGS** → busca el error

**"No autorizado" del CRM:**
→ El CRM no cargó el AGENT_SECRET. Reinícialo.

**El bot responde genérico (ignora las instrucciones):**
→ El SOUL.md no se cargó. Verifica con `cat` y haz RESTART en NullHub.
