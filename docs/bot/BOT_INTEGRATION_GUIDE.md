# Guía de integración del bot con el backend

Esta guía deja documentado cómo se autentica el bot, qué variables necesita, qué endpoints usa y qué revisar si vuelve a fallar la comunicación con el backend.

## Objetivo

El bot de WhatsApp consume este backend para:

1. Autenticarse como cliente técnico.
2. Consultar usuarios por canal y providerId.
3. Leer y actualizar estado conversacional.
4. Consumir rutas protegidas reutilizando el JWT obtenido en login.

## Flujo de autenticación del bot

El bot no usa cookies. El contrato actual es este:

1. El bot hace `POST /api/auth/login`.
2. Envía `email` y `password` en el body.
3. Envía además el header `X-Bot-Token` con el valor de `BOT_API_KEY`.
4. Si el `X-Bot-Token` es válido, el backend devuelve `token` en el body.
5. El bot reutiliza ese JWT en `Authorization: Bearer ...` para las siguientes peticiones.

## Variables de entorno requeridas

### En el backend

```env
PORT=3000
JWT_SECRET=tu_secreto_jwt
BOT_API_KEY=tu_clave_tecnica_del_bot
```

### En el bot

```env
BACKEND_URL=http://localhost:3000
BOT_LOGIN_EMAIL=bot@billarenlinea.com
BOT_LOGIN_PASSWORD=tu_clave_segura
BOT_API_KEY=tu_clave_tecnica_del_bot
```

`BOT_API_KEY` debe coincidir exactamente entre backend y bot.

## Endpoint principal usado por el bot

### Login técnico compatible con el bot actual

```http
POST /api/auth/login
Content-Type: application/json
X-Bot-Token: TU_BOT_API_KEY

{
  "email": "bot@billarenlinea.com",
  "password": "TuClaveSegura123"
}
```

### Respuesta esperada

```json
{
  "ok": true,
  "user": {
    "id": "69b8a5ce4548ac1ece4c54e5",
    "name": "bot Billar en linea",
    "email": "bot@billarenlinea.com",
    "role": "ADMIN"
  },
  "token": "jwt_aqui"
}
```

## Endpoint alternativo exclusivo para bot

También existe un endpoint dedicado:

```http
POST /api/auth/bot-login
Content-Type: application/json
X-Bot-Token: TU_BOT_API_KEY
```

Por ahora no es obligatorio migrar el bot a esa ruta porque el contrato actual con `POST /api/auth/login` ya quedó compatible.

## Endpoints que el bot consume o puede consumir

### Buscar usuario por canal y providerId

Ruta pública orientada al bot:

```http
GET /api/users/by-provider/:provider/:providerId
```

Ejemplo:

```http
GET /api/users/by-provider/WHATSAPP/573001234567
```

### Leer estado conversacional de un usuario

```http
GET /api/users/:id/conversation-state?channel=WHATSAPP
```

### Actualizar estado conversacional

Ruta pública orientada al bot:

```http
PUT /api/users/:id/conversation-state
Content-Type: application/json

{
  "channel": "WHATSAPP",
  "currentState": "IDLE",
  "stateData": {}
}
```

## Comportamiento actual del backend

El backend distingue entre cliente web y cliente bot:

### Cliente web

- `POST /api/auth/login` guarda el JWT en cookie `httpOnly`.
- No devuelve `token` en el body.

### Cliente bot

- `POST /api/auth/login` con `X-Bot-Token` válido devuelve `token` en el body.
- Esto mantiene compatibilidad con el cliente actual del bot.

## Implementación actual del bot

La autenticación del bot vive en:

- `src/services/backend-auth.js`

Resumen del comportamiento:

1. Lee `BACKEND_URL`, `BOT_LOGIN_EMAIL`, `BOT_LOGIN_PASSWORD` y `BOT_API_KEY`.
2. Hace login contra el backend.
3. Guarda el JWT en memoria en `cachedJwtToken`.
4. Lo inyecta en `Authorization: Bearer ...` para nuevas peticiones.
5. Si una petición responde `401`, fuerza un login nuevo y reintenta.

## Orden recomendado de arranque

1. Levantar backend.
2. Confirmar que responde en el puerto configurado.
3. Levantar bot.
4. Enviar un mensaje de prueba al bot.

## Checklist de diagnóstico

Si el bot muestra `No fue posible autenticar el bot contra el backend`, revisar esto en orden:

1. El backend está corriendo.
2. `BACKEND_URL` del bot apunta al puerto correcto.
3. `BOT_LOGIN_EMAIL` existe realmente en la base de datos.
4. `BOT_LOGIN_PASSWORD` es correcta.
5. `BOT_API_KEY` existe en el `.env` del backend.
6. `BOT_API_KEY` del bot coincide exactamente con la del backend.
7. El backend fue reiniciado después de cambios en autenticación o `.env`.

## Caso real corregido

Se corrigió un fallo donde el backend sí tenía `BOT_API_KEY` en `.env`, pero el controlador la estaba leyendo demasiado temprano al cargar el módulo. Resultado:

- `POST /api/auth/login` respondía sin `token` para el bot.
- `POST /api/auth/bot-login` respondía con error diciendo que `BOT_API_KEY` no estaba configurado.

La solución fue leer `BOT_API_KEY` en tiempo de request y no en tiempo de importación del módulo.

## Prueba rápida con curl

```bash
curl -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Bot-Token: TU_BOT_API_KEY" \
  --data '{"email":"bot@billarenlinea.com","password":"TuClaveSegura123"}'
```

Si todo está bien, la respuesta debe incluir `token` en el body.

## Decisión actual

La integración queda así:

1. Web con cookie `httpOnly`.
2. Bot con `POST /api/auth/login` + `X-Bot-Token` + JWT en body.
3. Endpoint alternativo disponible: `POST /api/auth/bot-login`.