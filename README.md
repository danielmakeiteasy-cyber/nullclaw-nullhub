# 📚 Índice de Documentación — Make It Easy Agency

Aquí encontrarás todas las guías de la agencia organizadas por metodología.
Lee esto primero antes de abrir cualquier otra guía.

---

## ✅ METODOLOGÍA PRINCIPAL: NullHub (Usar siempre esta primero)

NullHub es la forma recomendada y actual de operar la agencia.
Todo corre de forma nativa en el VPS, se gestiona visualmente desde el navegador
y consume menos recursos que Docker Swarm.

| Guía | Para qué sirve | Cuándo usarla |
|---|---|---|
| 📄 [NullHub_Setup_Guide.md](./NullHub_Setup_Guide.md) | Instala el stack completo en una VPS nueva desde cero (n8n + NullHub + Nginx + SSL) | Cuando contratas una VPS nueva |
| 📄 [NullHub_Agency_Guide.md](./NullHub_Agency_Guide.md) | Alta de nuevos clientes, SOUL.md, operaciones diarias, migración desde Docker | Para el día a día de la agencia |
| 📄 [NullHub_Ejemplo_La_Fogata.md](./NullHub_Ejemplo_La_Fogata.md) | Ejemplo real completo paso a paso con valores concretos | Como referencia visual al seguir la guía |

### Flujo resumido con NullHub:
```
1. VPS nueva → seguir NullHub_Setup_Guide.md (solo la primera vez)
2. Nuevo cliente → INSTALL COMPONENT en NullHub + SOUL.md por SSH
3. Gestión diaria → Panel web en https://hub.tudominio.com
```

---

## 🆘 PLAN B: Docker Swarm (Solo si NullHub falla o no está disponible)

Docker Swarm es la metodología anterior. Úsala **únicamente** si:

- NullHub tiene un bug crítico que impide operar.
- El binario de NullHub no está disponible para descargar.
- Necesitas mantener un cliente antiguo que ya corre en Docker y no quieres migrar todavía.

> ⚠️ **No uses Docker Swarm para clientes nuevos.** NullHub es más eficiente,
> más fácil de gestionar y no requiere conocimientos de Docker.

| Guía | Para qué sirve | Cuándo usarla |
|---|---|---|
| 📄 [Make_It_Easy_VPS_Setup_Guide.md](./Make_It_Easy_VPS_Setup_Guide.md) | Instala el stack con Docker Swarm en una VPS nueva | Solo como plan B en VPS nueva |
| 📄 [Make_It_Easy_Agency_Guide.md](./Make_It_Easy_Agency_Guide.md) | Gestión de agentes con Docker Swarm | Solo para mantener clientes ya corriendo en Docker |

---

## 🔄 ¿Tienes un cliente en Docker y quieres pasarlo a NullHub?

Sigue la sección **"Migrar un Agente Existente"** dentro de la guía
[NullHub_Agency_Guide.md](./NullHub_Agency_Guide.md).

Resumen del proceso:
1. Detén el servicio en Docker Swarm (`docker service scale agency_NOMBRE=0`).
2. Registra el agente en NullHub con nombre temporal.
3. Apunta NullHub a los archivos reales con un enlace simbólico.
4. Listo — el cliente ahora corre en NullHub con sus datos intactos.

---

## 📌 Regla de oro

```
¿Funciona NullHub? → Usa NullHub siempre.
¿NullHub tiene un problema crítico? → Usa Docker Swarm como respaldo temporal.
¿Se resolvió el problema de NullHub? → Vuelve a NullHub.
```
