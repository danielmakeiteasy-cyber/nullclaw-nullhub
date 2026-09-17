# Revisión: Agente Daniel + nodos n8n de eventos (crear / mover / editar / eliminar)

**Fecha:** 2026-09-10 · **Instancia:** nullclaw/Daniel · **Workflow:** `WF-Daniel-Asistente-Completo` (id `2BT6BgWx27TSg64g`, webhook `POST /webhook/daniel/hub`)

## Qué estaba pasando

| # | Problema | Causa raíz | Estado |
|---|---|---|---|
| 1 | `agendar_evento` fallaba con 500 → luego "Bad request" en `Create Calendar Event` | Código viejo de `Prep Evento` calculaba hora fin con `(h+1)%24`: un evento a las 23:30 terminaba a las 00:30 **del mismo día** → fin < inicio → Google rechazaba (ejecuciones 692/694 y 699/707) | ✅ Corregido (rollover a día siguiente) |
| 2 | `mover_evento` y `eliminar_evento` fallaban con `Cannot read properties of undefined (reading 'toLowerCase')` en `Find Mover` / `Find Eliminar` (ejecuciones 703/704) | Los nodos buscaban solo por `body.titulo_evento`, pero el SOUL.md del agente envía `evento_id` | ✅ Corregido (match por `evento_id` primero, fallback `titulo_evento`, error descriptivo si no encuentra) |
| 3 | Tras el fix #2, mover/eliminar por `evento_id` devolvían 200 con cuerpo vacío | `Get Events Mover/Eliminar` filtraba con `query: {{ body.titulo_evento || '' }}` → query vacío → 0 eventos → rama moría en silencio | ✅ Corregido (query eliminado; se lista todo y el Find filtra por id) |
| 4 | Los parches en `workflow_entity` no se aplicaban en runtime | **n8n v2.11.2 usa modelo draft/published**: ejecuta la versión de `workflow_history` apuntada por `activeVersionId` | ✅ Parche aplicado a draft Y a versión publicada |

Hallazgos adicionales:
- URL vieja `https://n8n-k4xc.srv1444305.hstgr.cloud` tiene **certificado inválido** (hostname mismatch). El SOUL.md ya apunta a la correcta: `https://n8n.makeiteasycol.com/webhook/daniel/hub`.
- Una solicitud aislada a un webhook inexistente `POST daniel-hub` (9-sep) — probable prueba manual; el path real es `daniel/hub`.
- ⚠️ **PENDIENTE (bloqueante para Telegram): el bot token del agente Daniel está revocado** → `api.telegram.org` responde **401 Unauthorized**. El canal Telegram del agente lleva días en loop de "health check failed" (96 fallos solo en el log actual). El gateway del agente (puerto 3007) está sano; hay que regenerar el token en @BotFather y actualizarlo en `~/.nullhub/instances/nullclaw/Daniel/config.json` → `channels.telegram.accounts.default.bot_token`.

## Nodos modificados (en draft `workflow_entity` + publicado `workflow_history` v`ca3838d9…`)

1. **Prep Evento** — hora fin con cruce de medianoche (23:30 → 00:30 del día siguiente).
2. **Find Mover** — busca por `evento_id` (fallback `titulo_evento`), hora fin con rollover, respuesta de error descriptiva.
3. **Find Eliminar** — misma búsqueda por `evento_id`/`titulo_evento`.
4. **Get Events Mover / Get Events Eliminar** — sin filtro `query`.

Contenedores: `n8n-makeiteasy` reiniciado 2 veces (~20 s de downtime). Backup de la BD previo al parche en `/root/n8n_backup_20260910/` (database.sqlite + wal).

## Verificación end-to-end (10-sep, contra producción)

| Acción | Entrada | Resultado |
|---|---|---|
| crear 23:30 (caso crítico) | `agendar_evento TEST-MEDIANOCHE 2026-09-11 23:30` | ✅ 200 `Evento creado … 23:30:00-05:00` + `event_id` |
| mover | `mover_evento evento_id=… → 2026-09-13 08:15` | ✅ 200 `Evento movido` (verificado en disponibilidad 09-13 08:15–09:15) |
| editar | `editar_evento titulo_evento → nuevo_titulo` | ✅ 200 `Evento editado con éxito` |
| eliminar por id | `eliminar_evento evento_id=…` | ✅ 200 `Evento eliminado exitosamente` |
| eliminar por título | `eliminar_evento titulo_evento=TEST-REVISION-EDITADO` | ✅ 200 (limpió residuo de pruebas del 8-sep) |

Calendario verificado limpio en 09-11, 09-12 y 09-13 (sin eventos de prueba residuales).

## Contrato actual del webhook (para el agente)

```jsonc
// crear
{"action":"agendar_evento","titulo":"…","fecha":"YYYY-MM-DD","hora":"HH:MM","descripcion":"…"}
// mover (evento_id devuelto por crear/consultar; alternativa: titulo_evento)
{"action":"mover_evento","evento_id":"ID","nueva_fecha":"YYYY-MM-DD","nueva_hora":"HH:MM"}
// editar (por título)
{"action":"editar_evento","titulo_evento":"…","nuevo_titulo":"…"}
// eliminar (evento_id o titulo_evento)
{"action":"eliminar_evento","evento_id":"ID"}
```

---

## ✅ RESOLUCIÓN FINAL — Canal Telegram (2026-09-10 ~15:30 UTC)

### Diagnóstico real (corrige la hipótesis inicial de "token revocado")

| Verificación | Resultado |
|---|---|
| Token en config (`8594121073:AAHb…xO4`) vía `getMe` | **200 OK** → `@DanielRang_bot` (id 8594121073) — token VÁLIDO y ya presente en config desde el **3-sep 18:42** |
| `getWebhookInfo` | Sin webhook (long-polling), `pending_update_count: 0` |
| Salida a internet desde la VPS hacia `api.telegram.org` | OK (getMe 200 desde la VPS) |
| Conflicto con n8n (`telegramTrigger`) | Descartado: workflow "chatbot multimensajes redis" con `n8n-nodes-base.telegramTrigger` está **active=0** (no pollea) |
| Conflicto con Docker Swarm viejo | Descartado: servicio `agency_daniel` = **0/0 réplicas** (parado); su config además ya tiene el mismo token nuevo |
| Sonda `getUpdates?timeout=0` ANTES del reinicio | **200 sin conflicto** → NADIE estaba escuchando el bot: el canal Telegram del agente estaba **muerto en memoria** |
| Proceso gateway Daniel | pid 2957980, arrancado **5-sep 06:38** (5.3 días sin reiniciar), `/health` OK pero 0 mensajes procesados en el log |

**Root cause:** el canal Telegram murió en memoria días atrás (loop `channel_manager: telegram issue: health check failed`, sin auto-recuperación en nullclaw v2026.5.29). El "reinicio" de la sesión anterior **nunca se ejecutó**: `nullhub restart` responde *"not yet implemented"* (igual que `stop`/`start` en CLI 2026.4.17) y el `pkill -f "nullclaw.*Daniel"` no matcheaba porque el cmdline del proceso es `/root/.nullhub/bin/nullclaw-v2026.5.29 gateway` (sin "Daniel").

### Fix aplicado

1. Reinicio REAL vía **API HTTP del hub** (la vía correcta):
   ```bash
   nullhub api POST /api/instances/nullclaw/Daniel/restart   # → {"status":"started"}
   ```
2. Nuevo proceso: **pid 3599114**, puerto 3007, `/health` OK.

### Verificación de que el bot ESCUCHA (evidencia objetiva)

Sonda de long-poll contra `getUpdates?timeout=20` desde la VPS:

```
probe0: HTTP 409 "Conflict: terminated by other getUpdates request" (a los 35.6s)
probe1: HTTP 409 "Conflict: terminated by other getUpdates request" (a los 8.6s)
```

El **409 es la prueba** de que el agente está polleando activamente con el token válido (solo un consumidor por bot). Tras el reinicio: **0 líneas nuevas** de "health check failed" en el log.

### Smoke test n8n post-reinicio de contenedor (~15:01)

- `GET https://n8n.makeiteasycol.com/healthz` → **200**
- `POST /webhook/daniel/hub` `{"action":"consultar_disponibilidad","fecha":"2026-09-11"}` → **200**: `eventos: 0`, "El día está completamente libre" (calendario sigue limpio y los fixes publicados siguen activos).

### Estado final

| Componente | Estado |
|---|---|
| Workflow n8n eventos (crear/mover/editar/eliminar) | ✅ Verificado end-to-end hoy |
| Token Telegram en config | ✅ Válido (`@DanielRang_bot`) |
| Canal Telegram del agente | ✅ Polleando activo (probado con 409) |
| Hub reconoce instancia | ✅ `status: running, pid 3599114` (el endpoint interno `/status` tarda en refrescar tras reinicio — cosmético) |

**Prueba pendiente del usuario:** enviar un mensaje a `@DanielRang_bot` desde Telegram (cuenta `1095351969`, única en `allow_from`) y confirmar respuesta.

### Notas operativas (para la próxima)

- Para reiniciar un agente NullHub en CLI 2026.4.17 **NO** usar `nullhub restart|stop|start` (no implementados) ni `pkill -f` (el cmdline no contiene el nombre de la instancia). Usar: `nullhub api POST /api/instances/<component>/<name>/restart`.
- Rutas útiles: `nullhub api GET /api/instances/nullclaw/Daniel/channels` · `/doctor` · `/status` · `nullhub routes --json`.
