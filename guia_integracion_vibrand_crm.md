# Caso de Estudio: Integración de NullClaw con Next.js (Vibrand CRM)

Este documento detalla el paso a paso y la arquitectura utilizada para conectar un agente de IA alojado en NullClaw (VPS) con un CRM desarrollado en Next.js, de forma segura y eficiente.

---

## 1. Arquitectura General

El flujo de comunicación es unidireccional para las consultas, donde el agente actúa como el cliente HTTP:

1. **Usuario** envía un mensaje por Telegram ("Dame el resumen de ventas").
2. **NullClaw (Telegram Channel)** recibe el mensaje y lo procesa con el modelo (DeepSeek).
3. **DeepSeek** determina que debe usar la herramienta `http_request`.
4. **Herramienta `http_request`** envía un POST con JSON al CRM (`https://crm.vibrandcol.com/api/agent`).
5. **Next.js CRM** valida el token secreto, consulta la base de datos (Prisma) y devuelve los datos crudos en JSON.
6. **DeepSeek** lee el JSON, le da un formato amigable y envía el mensaje final al usuario por Telegram.

---

## 2. Configuración en el Lado del CRM (Next.js)

Para que el CRM pudiera recibir las peticiones del bot, fue necesario configurar un endpoint seguro y permitir que evadiera las restricciones normales de usuario.

### 2.1. El Endpoint del Agente
Se creó una ruta exclusiva para el bot (`/api/agent`). Esta ruta espera un cuerpo en formato JSON con un campo `action` que dicta la operación a realizar.

**Validación de Seguridad:**
En lugar de manejar cookies de sesión (ya que el bot no es un navegador web normal), se configuró una llave secreta en los headers. El endpoint revisa que el header `x-agent-secret` coincida con la variable de entorno `AGENT_SECRET` del servidor.

### 2.2. Excepción en el Middleware (`proxy.ts`)
El CRM contaba con un middleware que bloqueaba todas las rutas de la API si el usuario no tenía una sesión activa (cookie `vibrand_session`). 

Para evitar que el middleware rechazara al bot con un error `401 Unauthorized`, se añadió una excepción condicional:

```typescript
// Fragmento de src/proxy.ts
if (req.nextUrl.pathname === '/api/agent') {
  // Se omite la validación de la cookie para permitir 
  // la autenticación por token en el propio endpoint.
  return NextResponse.next();
}
```

---

## 3. Configuración en el Lado de NullClaw (VPS)

En el VPS donde corre NullClaw, se requirieron configuraciones específicas para el agente (`vibrand-crm`).

### 3.1. Ajustes del Sistema (`config.json`)
NullClaw viene con varias protecciones de seguridad activadas por defecto. Fue necesario modificarlas editando el archivo `/root/.nullhub/instances/nullclaw/vibrand-crm/config.json`:

1. **Permitir peticiones HTTP:**
   ```json
   "http_request": {
     "enabled": true
   }
   ```
2. **Nivel de Autonomía:**
   Se cambió de `"supervised"` a `"autonomous"` para que el bot no pidiera permiso manual en consola cada vez que necesitaba usar `http_request`.
   ```json
   "autonomy": {
     "level": "autonomous"
   }
   ```
3. **Desactivar el Sandbox (Crucial para velocidad):**
   *Problema:* NullClaw ejecuta herramientas en un contenedor Docker con la red bloqueada (`network: "none"`), causando que el bot se quedara colgado por 30 segundos (timeout) al intentar contactar al CRM.
   *Solución:* Se desactivó el sandbox para permitir la salida a internet.
   ```json
   "security": {
     "sandbox": {
       "enabled": false
     }
   }
   ```

### 3.2. Instrucciones del Bot (`SOUL.md`)
El éxito del agente depende enteramente de la precisión de su "prompt" principal. Se creó un archivo `SOUL.md` estructurado y técnico.

**Elementos Clave del SOUL:**
- **Restricción de Usuario:** Se le ordenó obedecer únicamente al ID de Telegram del dueño (Daniel), protegiendo la información.
- **Instrucción de Herramienta:** Se le obligó a usar `http_request` con los parámetros técnicos (URL, Método, Headers).
- **Diccionario de Acciones:** Se le proporcionó el JSON exacto a enviar para cada intención (ej. `{"action":"resumen_pipeline"}`).
- **Flujo Estructurado:** Para tareas complejas (como Crear Cotización), se le dio una guía paso a paso de lo que debía preguntar antes de construir y enviar el JSON al CRM.

---

## Conclusión

El uso de **NullClaw** + **http_request** + **Token Secreto (Headers)** es el estándar más rápido y seguro para integrar IAs autónomas con aplicaciones web externas, sin necesidad de librerías de terceros (como LangChain), conectores complejos, o bases de datos expuestas.
