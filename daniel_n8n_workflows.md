# 🔧 Flujo n8n — Agente Daniel (Webhook Unificado)

## Arquitectura

```
Telegram → Nullclaw (IA) → webhook POST /daniel/hub → n8n Switch por action → ejecuta → responde JSON
```

**UN SOLO WORKFLOW** en n8n con un **Switch** que enruta por `action`.

---

## Workflow: `WF-Daniel-Asistente-Completo` ⚠️ ACTUALIZADO 2026-09-10

> [!IMPORTANT]
> **Estado real en producción (verificado 2026-09-10):** el workflow es
> `WF-Daniel-Asistente-Completo` (id `2BT6BgWx27TSg64g`, cred Google OAuth
> "CALENDARIO DANIEL PERSONAL"). Incluye la ruta `editar_evento` y los fixes de eventos
> (fin de evento con cruce de medianoche + match por `evento_id`). Detalle completo en
> `REVISION_EVENTOS_NULCLAW_2026-09-10.md`.

### Nodo 1: Webhook Trigger
- **Tipo**: Webhook
- **Method**: POST
- **Path**: `daniel/hub`
- **URL resultante**: `https://n8n.makeiteasycol.com/webhook/daniel/hub`
  ⚠️ La URL vieja `n8n-k4xc.srv1444305.hstgr.cloud` tiene certificado inválido (hostname
  mismatch) — **no usar**. Si el `SOUL.md` del agente la menciona, reemplazarla.
- **Response Mode**: Last Node

### Nodo 2: Switch (Enrutador)
- **Tipo**: Switch
- **Campo a evaluar**: `{{ $json.body.action }}`
- **Rutas**:

| Valor de `action` | Ruta → |
|---|---|
| `registrar_movimiento` | → Nodo Finanzas: Agregar fila |
| `consultar_balance` | → Nodo Finanzas: Leer + Calcular |
| `registrar_deuda` | → Nodo Deudas: Agregar fila |
| `consultar_deudas` | → Nodo Deudas: Leer con filtro |
| `pagar_deuda` | → Nodo Deudas: Buscar + Actualizar |
| `consultar_disponibilidad` | → Nodo Calendar: List Events |
| `agendar_evento` | → Nodo Calendar: Create Event |
| `mover_evento` | → Nodo Calendar: Update Event |
| `editar_evento` | → Nodo Calendar: Update Event (título) |
| `eliminar_evento` | → Nodo Calendar: Delete Event |
| `crear_tarea` | → Nodo Tareas: Agregar fila |
| `listar_tareas` | → Nodo Tareas: Leer con filtro |
| `actualizar_tarea` | → Nodo Tareas: Buscar + Actualizar |
| `eliminar_tarea` | → Nodo Tareas: Buscar + Eliminar |
| `generar_reporte` | → Nodo Reporte: Leer todo + Formatear |

---

## Detalle de cada ruta

### 💰 RUTA: `registrar_movimiento`

```
Switch → Code (preparar datos) → Google Sheets: Append Row (Hoja: Movimientos) → Respond
```

**Code node** (preparar datos):
```javascript
const body = $input.all()[0].json.body;
const now = new Date().toISOString();
return [{
  json: {
    id: Date.now(),
    fecha: body.fecha || new Date().toISOString().split('T')[0],
    tipo: body.tipo,
    categoria: body.categoria,
    subcategoria: body.subcategoria || '',
    monto: body.monto,
    descripcion: body.descripcion || '',
    created_at: now
  }
}];
```

**Google Sheets node**: Append Row en hoja `Movimientos`

**Respond node**:
```json
{
  "status": "ok",
  "message": "Movimiento registrado: {{tipo}} de ${{monto}} en {{categoria}}"
}
```

---

### 💰 RUTA: `consultar_balance`

```
Switch → Google Sheets: Read (Hoja: Movimientos) → Code (calcular) → Respond
```

**Code node** (calcular balance):
```javascript
const body = $('Webhook').item.json.body;
const periodo = body.periodo || 'mes';
const categoria = body.categoria || null;
const rows = $input.all().map(i => i.json);

const now = new Date();
let desde;
switch(periodo) {
  case 'hoy': desde = new Date(now.toISOString().split('T')[0]); break;
  case 'semana': desde = new Date(now - 7*24*60*60*1000); break;
  case 'mes': desde = new Date(now.getFullYear(), now.getMonth(), 1); break;
  case 'anio': desde = new Date(now.getFullYear(), 0, 1); break;
  default: desde = new Date(0);
}

let filtered = rows.filter(r => new Date(r.fecha) >= desde);
if (categoria) filtered = filtered.filter(r => r.categoria === categoria);

const ingresos = filtered.filter(r => r.tipo === 'ingreso').reduce((s,r) => s + Number(r.monto), 0);
const gastos = filtered.filter(r => r.tipo === 'gasto').reduce((s,r) => s + Number(r.monto), 0);

// Agrupar gastos por categoría
const gastosPorCategoria = {};
filtered.filter(r => r.tipo === 'gasto').forEach(r => {
  gastosPorCategoria[r.categoria] = (gastosPorCategoria[r.categoria] || 0) + Number(r.monto);
});

return [{
  json: {
    status: "ok",
    periodo: periodo,
    ingresos: ingresos,
    gastos: gastos,
    balance: ingresos - gastos,
    gastos_por_categoria: gastosPorCategoria,
    total_movimientos: filtered.length
  }
}];
```

---

### 💰 RUTA: `registrar_deuda`

```
Switch → Code (preparar) → Google Sheets: Append Row (Hoja: Deudas) → Respond
```

**Code node**:
```javascript
const body = $input.all()[0].json.body;
return [{
  json: {
    id: Date.now(),
    tipo: body.tipo,
    persona: body.persona,
    monto: body.monto,
    monto_pagado: 0,
    descripcion: body.descripcion || '',
    fecha_compromiso: body.fecha_compromiso || '',
    estado: 'pendiente',
    created_at: new Date().toISOString()
  }
}];
```

---

### 💰 RUTA: `consultar_deudas`

```
Switch → Google Sheets: Read (Hoja: Deudas) → Code (filtrar) → Respond
```

**Code node** (filtrar):
```javascript
const body = $('Webhook').item.json.body;
const tipo = body.tipo || 'todas';
const estado = body.estado || 'pendiente';
let rows = $input.all().map(i => i.json);

if (tipo !== 'todas') rows = rows.filter(r => r.tipo === tipo);
if (estado !== 'todas') rows = rows.filter(r => r.estado === estado);

const total = rows.reduce((s,r) => s + (Number(r.monto) - Number(r.monto_pagado || 0)), 0);

return [{
  json: {
    status: "ok",
    deudas: rows,
    total_pendiente: total,
    cantidad: rows.length
  }
}];
```

---

### 💰 RUTA: `pagar_deuda`

```
Switch → Google Sheets: Read (Hoja: Deudas) → Code (buscar+calcular) → Google Sheets: Update Row → Respond
```

**Code node**:
```javascript
const body = $('Webhook').item.json.body;
const rows = $input.all().map(i => i.json);
const deuda = rows.find(r => 
  r.persona.toLowerCase().includes(body.persona.toLowerCase()) && 
  r.tipo === body.tipo && 
  r.estado !== 'pagada'
);

if (!deuda) return [{ json: { status: "error", message: "No se encontró deuda pendiente para " + body.persona } }];

const nuevoPagado = Number(deuda.monto_pagado || 0) + Number(body.monto_pagado);
const nuevoEstado = nuevoPagado >= Number(deuda.monto) ? 'pagada' : 'parcial';

return [{
  json: {
    ...deuda,
    monto_pagado: nuevoPagado,
    estado: nuevoEstado,
    row_number: rows.indexOf(rows.find(r => r.id === deuda.id)) + 2
  }
}];
```

---

### 📅 RUTA: `consultar_disponibilidad`

```
Switch → Google Calendar: Get Many Events (fecha) → Code (formatear) → Respond
```

**Google Calendar node**:
- Operación: Get Many
- Calendar: (tu calendario principal)
- Time Min: `{{ $json.body.fecha }}T00:00:00`
- Time Max: calcular según `rango_dias`

**Code node**:
```javascript
const eventos = $input.all().map(i => ({
  titulo: i.json.summary,
  inicio: i.json.start?.dateTime || i.json.start?.date,
  fin: i.json.end?.dateTime || i.json.end?.date
}));

return [{
  json: {
    status: "ok",
    fecha: $('Webhook').item.json.body.fecha,
    eventos_existentes: eventos,
    total_eventos: eventos.length,
    mensaje: eventos.length === 0 ? "El día está libre" : `Hay ${eventos.length} evento(s) programado(s)`
  }
}];
```

---

### 📅 RUTA: `agendar_evento`

```
Switch → Code "Prep Evento" → Google Calendar: Create Event → Respond
```

**Contrato** (lo que envía el agente):
```json
{"action":"agendar_evento","titulo":"...","fecha":"YYYY-MM-DD","hora":"HH:MM","descripcion":"..."}
```

**Nodo Code "Prep Evento"** (fix 2026-09-10 — duración 1h con cruce de medianoche):
```javascript
const { titulo, fecha, hora, descripcion } = $json.body;
const [h, m] = (hora || '09:00').split(':').map(Number);
let finH = h + 1, fechaFin = fecha;           // duración fija de 1 hora
if (finH >= 24) {                             // ⚠️ fix: 23:30 → 00:30 del DÍA SIGUIENTE
  finH -= 24;
  const d = new Date(fecha + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  fechaFin = d.toISOString().slice(0, 10);
}
const pad = n => String(n).padStart(2, '0');
return [{ json: {
  summary: titulo,
  start: { dateTime: `${fecha}T${pad(h)}:${pad(m)}:00`, timeZone: 'America/Bogota' },
  end:   { dateTime: `${fechaFin}T${pad(finH)}:${pad(m)}:00`, timeZone: 'America/Bogota' },
  description: descripcion || ''
} }];
```

**Google Calendar node**: operación Create, mapeando `summary`, `start`, `end`, `description`
desde el Code node (no desde el body crudo).

---

### 📅 RUTA: `mover_evento`

```
Switch → Google Calendar: Get Many Events (SIN query) → Code "Find Mover" → Google Calendar: Update Event → Respond
```

**Contrato**: `{"action":"mover_evento","evento_id":"ID","nueva_fecha":"YYYY-MM-DD","nueva_hora":"HH:MM"}`
(fallback: `titulo_evento`). Fix 2026-09-10: el Code busca por `evento_id` **primero** y por
título como fallback; si no encuentra, responde error descriptivo. El nodo Get Many **no**
lleva `query` (un query vacío devuelve 0 eventos y la rama muere en silencio).

---

### 📅 RUTA: `editar_evento`

```
Switch → Google Calendar: Get Many Events (SIN query) → Code "Find Editar" → Google Calendar: Update Event → Respond
```

**Contrato**: `{"action":"editar_evento","titulo_evento":"...","nuevo_titulo":"..."}`
(mismo patrón de búsqueda que `mover_evento`).

---

### 📅 RUTA: `eliminar_evento`

```
Switch → Google Calendar: Get Many Events (SIN query) → Code "Find Eliminar" → Google Calendar: Delete Event → Respond
```

**Contrato**: `{"action":"eliminar_evento","evento_id":"ID"}` (fallback: `titulo_evento`).
Fix 2026-09-10: match por `evento_id` primero, fallback por título, error descriptivo si no
encuentra (antes crasheaba con `undefined.toLowerCase` cuando el agente enviaba `evento_id`).

---

### ✅ RUTA: `crear_tarea`

```
Switch → Code (preparar) → Google Sheets: Append Row (Hoja: Tareas) → Respond
```

**Code node**:
```javascript
const body = $input.all()[0].json.body;
return [{
  json: {
    id: Date.now(),
    titulo: body.titulo,
    descripcion: body.descripcion || '',
    contexto: body.contexto || 'personal',
    prioridad: body.prioridad || 'media',
    estado: 'pendiente',
    fecha_limite: body.fecha_limite || '',
    hora: body.hora || '',
    recordatorio: body.recordatorio !== false ? 'true' : 'false',
    created_at: new Date().toISOString(),
    completed_at: ''
  }
}];
```

---

### ✅ RUTA: `listar_tareas`

```
Switch → Google Sheets: Read (Hoja: Tareas) → Code (filtrar) → Respond
```

**Code node**:
```javascript
const body = $('Webhook').item.json.body;
let rows = $input.all().map(i => i.json);

if (body.contexto && body.contexto !== 'todas') rows = rows.filter(r => r.contexto === body.contexto);
if (body.estado && body.estado !== 'todas') rows = rows.filter(r => r.estado === body.estado);
if (body.prioridad && body.prioridad !== 'todas') rows = rows.filter(r => r.prioridad === body.prioridad);

return [{
  json: {
    status: "ok",
    tareas: rows.map(r => ({
      titulo: r.titulo,
      contexto: r.contexto,
      prioridad: r.prioridad,
      estado: r.estado,
      fecha_limite: r.fecha_limite,
      hora: r.hora
    })),
    total: rows.length
  }
}];
```

---

### ✅ RUTA: `actualizar_tarea`

```
Switch → Google Sheets: Read (Hoja: Tareas) → Code (buscar) → Google Sheets: Update Row → Respond
```

---

### ✅ RUTA: `eliminar_tarea`

```
Switch → Google Sheets: Read (Hoja: Tareas) → Code (buscar fila) → Google Sheets: Delete Row → Respond
```

---

### 📊 RUTA: `generar_reporte`

```
Switch → [Paralelo: Google Sheets Read Movimientos + Read Deudas + Read Tareas + Google Calendar Get Events] → Code (compilar reporte) → Respond
```

**Code node** (compilar reporte):
```javascript
// Recibe datos de las 3 hojas + calendario
const movimientos = $('Read Movimientos').all().map(i => i.json);
const deudas = $('Read Deudas').all().map(i => i.json);
const tareas = $('Read Tareas').all().map(i => i.json);

const periodo = $('Webhook').item.json.body.periodo || 'semana';
const now = new Date();
let desde;
switch(periodo) {
  case 'semana': desde = new Date(now - 7*24*60*60*1000); break;
  case 'mes': desde = new Date(now.getFullYear(), now.getMonth(), 1); break;
  default: desde = new Date(now.getFullYear(), 0, 1);
}

const movsFiltrados = movimientos.filter(m => new Date(m.fecha) >= desde);
const ingresos = movsFiltrados.filter(m => m.tipo === 'ingreso').reduce((s,m) => s + Number(m.monto), 0);
const gastos = movsFiltrados.filter(m => m.tipo === 'gasto').reduce((s,m) => s + Number(m.monto), 0);

const gastosPorCat = {};
movsFiltrados.filter(m => m.tipo === 'gasto').forEach(m => {
  gastosPorCat[m.categoria] = (gastosPorCat[m.categoria] || 0) + Number(m.monto);
});

const deudasPendientes = deudas.filter(d => d.estado !== 'pagada');
const tareasPendientes = tareas.filter(t => t.estado !== 'completada');

return [{
  json: {
    status: "ok",
    periodo: periodo,
    finanzas: {
      ingresos_total: ingresos,
      gastos_total: gastos,
      balance: ingresos - gastos,
      gastos_por_categoria: gastosPorCat
    },
    deudas: {
      me_deben: deudasPendientes.filter(d => d.tipo === 'me_deben').length,
      yo_debo: deudasPendientes.filter(d => d.tipo === 'yo_debo').length,
      total_pendiente: deudasPendientes.reduce((s,d) => s + (Number(d.monto) - Number(d.monto_pagado || 0)), 0)
    },
    tareas: {
      pendientes_trabajo: tareasPendientes.filter(t => t.contexto === 'trabajo').length,
      pendientes_personal: tareasPendientes.filter(t => t.contexto === 'personal').length,
      prioridad_alta: tareasPendientes.filter(t => t.prioridad === 'alta').length
    }
  }
}];
```

---

## Workflow 2: `WF-Daniel-Reporte-Semanal` (Cron)

### Trigger: Schedule (Cron)
- **Día**: Lunes
- **Hora**: 07:00 AM
- **Timezone**: America/Bogota (o tu zona)

### Flujo:
```
Cron Trigger → HTTP Request POST a /daniel/hub (action: generar_reporte, periodo: semana) → Code (formatear mensaje bonito) → Telegram: Send Message
```

**Code node** (formatear para Telegram):
```javascript
const r = $input.all()[0].json;
const f = r.finanzas;
const d = r.deudas;
const t = r.tareas;

let gastosCat = '';
for (const [cat, monto] of Object.entries(f.gastos_por_categoria || {})) {
  gastosCat += `  • ${cat}: $${monto.toFixed(2)}\n`;
}

const msg = `📊 *REPORTE SEMANAL — Daniel*\n` +
  `━━━━━━━━━━━━━━━━━━━\n\n` +
  `💰 *FINANZAS*\n` +
  `  📈 Ingresos: $${f.ingresos_total.toFixed(2)}\n` +
  `  📉 Gastos: $${f.gastos_total.toFixed(2)}\n` +
  `  💵 Balance: $${f.balance.toFixed(2)}\n\n` +
  `  📋 *Gastos por categoría:*\n${gastosCat}\n` +
  `🤝 *DEUDAS*\n` +
  `  Me deben: ${d.me_deben} persona(s)\n` +
  `  Yo debo: ${d.yo_debo} persona(s)\n` +
  `  Total pendiente: $${d.total_pendiente.toFixed(2)}\n\n` +
  `✅ *TAREAS PENDIENTES*\n` +
  `  🏢 Trabajo: ${t.pendientes_trabajo}\n` +
  `  🏠 Personal: ${t.pendientes_personal}\n` +
  `  🔴 Prioridad alta: ${t.prioridad_alta}\n\n` +
  `━━━━━━━━━━━━━━━━━━━\n` +
  `_Generado automáticamente cada lunes 7AM_`;

return [{ json: { message: msg } }];
```

**Telegram node**: Send Message
- Chat ID: tu chat ID personal
- Text: `{{ $json.message }}`
- Parse Mode: Markdown

---

## Workflow 3: `WF-Daniel-Recordatorios` (Cron cada hora)

### Trigger: Schedule (Cron)
- **Intervalo**: Cada hora
- **Hora activa**: 07:00 - 22:00

### Flujo:
```
Cron → Google Sheets: Read Tareas → Code (filtrar tareas con fecha_limite hoy + recordatorio=true) → IF hay tareas → Telegram: Send Message
```

**Code node**:
```javascript
const hoy = new Date().toISOString().split('T')[0];
const horaActual = new Date().getHours();
const tareas = $input.all().map(i => i.json);

const recordatorios = tareas.filter(t => 
  t.recordatorio === 'true' && 
  t.estado !== 'completada' &&
  t.fecha_limite === hoy
);

if (recordatorios.length === 0) return [];

let msg = '⏰ *RECORDATORIO DE TAREAS*\n\n';
recordatorios.forEach(t => {
  const emoji = t.prioridad === 'alta' ? '🔴' : t.prioridad === 'media' ? '🟡' : '🟢';
  msg += `${emoji} *${t.titulo}*\n`;
  msg += `  ${t.contexto === 'trabajo' ? '🏢' : '🏠'} ${t.contexto}`;
  if (t.hora) msg += ` — ${t.hora}`;
  msg += '\n\n';
});

return [{ json: { message: msg } }];
```
