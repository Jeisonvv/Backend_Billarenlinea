# Flujo de prueba en Insomnia

Esta guía documenta cómo probar en Insomnia el flujo completo de creación administrativa de usuario con activación temporal de contraseña.

## Objetivo

Validar que:

1. Un admin o staff puede crear un usuario desde `POST /api/users`.
2. El backend genera un flujo de activación temporal cuando se envía `webAuth.email`.
3. El usuario puede definir su contraseña con `POST /api/auth/reset-password`.
4. Luego puede iniciar sesión normalmente con `POST /api/auth/login`.

## Pre-requisitos

Antes de probar, confirma esto:

1. El backend está corriendo en tu máquina.
2. Tienes un usuario `ADMIN` o `STAFF` con credenciales válidas.
3. Tu base de datos está accesible.
4. Si no tienes SMTP configurado, el backend devolverá `resetToken` en desarrollo para compartirlo manualmente.

## Base URL sugerida

Si corres el backend en local:

```text
http://localhost:3000/api
```

## Flujo recomendado en Insomnia

### 1. Login de admin o staff

#### Request

- Método: `POST`
- URL: `/auth/login`
- Body JSON:

```json
{
  "email": "admin@billar.com",
  "password": "TuClaveSegura123"
}
```

#### Respuesta esperada

```json
{
  "ok": true,
  "token": "jwt_aqui",
  "user": {
    "id": "...",
    "name": "Administrador",
    "email": "admin@billar.com",
    "role": "ADMIN"
  }
}
```

#### Qué hacer con esta respuesta

Copia el valor de `token` porque lo usarás en la creación del usuario.

### 2. Crear usuario desde el endpoint administrativo

#### Request

- Método: `POST`
- URL: `/users`
- Headers:

```text
Authorization: Bearer TU_TOKEN
Content-Type: application/json
```

- Body JSON:

```json
{
  "name": "Juan David Perez",
  "phone": "+573001234567",
  "identityDocument": "1234567890",
  "role": "CUSTOMER",
  "status": "NEW",
  "source": "WEB",
  "webAuth": {
    "email": "juanperez@email.com",
    "emailVerified": false
  }
}
```

#### Importante

No envíes `passwordHash` en este endpoint. El backend ahora lo rechaza porque este flujo usa activación temporal.

#### Respuesta esperada

```json
{
  "ok": true,
  "requiresPasswordSetup": true,
  "data": {
    "_id": "66413a26c9d1bb4e2a9f1010",
    "name": "Juan David Perez",
    "phone": "+573001234567",
    "identityDocument": "1234567890"
  },
  "onboarding": {
    "email": "juanperez@email.com",
    "resetUrl": "http://localhost:5173/reset-password?token=...",
    "expiresAt": "2026-03-16T20:30:00.000Z",
    "emailSent": false,
    "resetToken": "token_temporal"
  }
}
```

### 3. Interpretar la respuesta de onboarding

#### Si `emailSent` es `true`

Significa que el servidor sí envió correo. En ese caso el usuario debe abrir el enlace recibido y definir su contraseña desde el frontend.

#### Si `emailSent` es `false`

Si estás en desarrollo y no tienes SMTP configurado, el backend puede devolver `resetToken`. Ese token lo usas para probar manualmente el siguiente paso en Insomnia.

### 4. Definir la contraseña con el token temporal

#### Request

- Método: `POST`
- URL: `/auth/reset-password`
- Body JSON:

```json
{
  "token": "EL_RESETTOKEN_QUE_DEVOLVIO_API_USERS",
  "password": "NuevaClaveSegura123"
}
```

#### Respuesta esperada

```json
{
  "ok": true,
  "message": "La contraseña fue actualizada correctamente."
}
```

### 5. Probar el login del usuario nuevo

#### Request

- Método: `POST`
- URL: `/auth/login`
- Body JSON:

```json
{
  "email": "juanperez@email.com",
  "password": "NuevaClaveSegura123"
}
```

#### Respuesta esperada

```json
{
  "ok": true,
  "token": "jwt_del_usuario",
  "user": {
    "id": "...",
    "name": "Juan David Perez",
    "email": "juanperez@email.com",
    "role": "CUSTOMER"
  }
}
```

Si este login funciona, el flujo quedó validado de punta a punta.

## Qué valida este flujo

Con esta secuencia en Insomnia validas:

1. Autenticación de admin o staff.
2. Creación administrativa de usuario.
3. Generación de activación temporal.
4. Definición inicial de contraseña.
5. Inicio de sesión final del usuario.

## Casos de error esperables

### Usuario duplicado

Puedes recibir respuestas como:

- `Este documento de identidad ya está registrado.`
- `Este teléfono ya está registrado.`
- `Este email ya está registrado.`

### Token inválido o sin permisos

Si el token no pertenece a un `ADMIN` o `STAFF`, `POST /users` responderá con error de autenticación o autorización.

### passwordHash manual no permitido

Si envías algo como esto:

```json
{
  "webAuth": {
    "email": "juanperez@email.com",
    "passwordHash": "hash_manual"
  }
}
```

la API debe responder con error porque ese flujo ya no está permitido desde el endpoint administrativo.

### Token expirado

Si dejas pasar demasiado tiempo antes de usar `resetToken`, `POST /api/auth/reset-password` responderá que el token es inválido o expiró.

## Recomendación práctica para Insomnia

Puedes crear una carpeta llamada `Usuarios - Onboarding` con estas requests en este orden:

1. `Login Admin`
2. `Crear Usuario Admin`
3. `Reset Password Usuario`
4. `Login Usuario Nuevo`

## Nota sobre tu entorno actual

Según tu `.env`, el SMTP está comentado. Eso significa que en desarrollo lo normal es que el backend no envíe correo y te devuelva el `resetToken` en la respuesta de `POST /api/users` para que lo pruebes manualmente.