# 📊 Google Sheets — Estructura para Agente Daniel

Crea **un Google Spreadsheet** llamado `Daniel_Asistente_DB` con **3 hojas**:

---

## Hoja 1: `Movimientos`

| Columna | Tipo | Ejemplo |
|---------|------|---------|
| A: `id` | Número auto | 1, 2, 3... |
| B: `fecha` | Fecha | 2026-03-25 |
| C: `tipo` | Texto | ingreso / gasto |
| D: `categoria` | Texto | Alimentacion |
| E: `subcategoria` | Texto | Café |
| F: `monto` | Número | 15.50 |
| G: `descripcion` | Texto | Café en Starbucks |
| H: `created_at` | Fecha+Hora | 2026-03-25 09:30:00 |

**Fila 1 = encabezados**. Los datos empiezan en fila 2.

---

## Hoja 2: `Deudas`

| Columna | Tipo | Ejemplo |
|---------|------|---------|
| A: `id` | Número auto | 1, 2, 3... |
| B: `tipo` | Texto | me_deben / yo_debo |
| C: `persona` | Texto | Juan Pérez |
| D: `monto` | Número | 500.00 |
| E: `monto_pagado` | Número | 200.00 |
| F: `descripcion` | Texto | Préstamo para proyecto |
| G: `fecha_compromiso` | Fecha | 2026-04-15 |
| H: `estado` | Texto | pendiente / parcial / pagada |
| I: `created_at` | Fecha+Hora | 2026-03-25 09:30:00 |

---

## Hoja 3: `Tareas`

| Columna | Tipo | Ejemplo |
|---------|------|---------|
| A: `id` | Número auto | 1, 2, 3... |
| B: `titulo` | Texto | Enviar propuesta al cliente |
| C: `descripcion` | Texto | Propuesta de diseño web |
| D: `contexto` | Texto | trabajo / personal |
| E: `prioridad` | Texto | alta / media / baja |
| F: `estado` | Texto | pendiente / en_progreso / completada |
| G: `fecha_limite` | Fecha | 2026-03-28 |
| H: `hora` | Hora | 14:00 |
| I: `recordatorio` | Texto | true / false |
| J: `created_at` | Fecha+Hora | 2026-03-25 09:30:00 |
| K: `completed_at` | Fecha+Hora | (vacío hasta completar) |

---

## ⚙️ Configuración en n8n

1. En n8n, conecta **Google Sheets** con OAuth2 (la misma cuenta que ya usas para Calendar)
2. El Spreadsheet ID lo encuentras en la URL del Sheet: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`
3. Cada nodo de Google Sheets en n8n necesita: **Spreadsheet ID** + **Nombre de la hoja** (Movimientos, Deudas, Tareas)
