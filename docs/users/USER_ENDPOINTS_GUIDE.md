# Usuarios y registro

Este proyecto tiene dos endpoints para crear usuarios porque atienden casos de uso distintos, pero ambos comparten la misma lógica interna de validación y creación.

## Cuándo usar cada endpoint

### POST /api/auth/register

Usa este endpoint cuando un cliente se registra por la web.

- Es público.
- Requiere `name`, `email` y `password`.
- Crea una cuenta web con credenciales.
- Guarda `identityDocument` si se envía.
- Aplica las mismas validaciones de duplicados que el alta administrativa.

Ejemplo:

```json
{
  "name": "Juan David Perez",
  "email": "juanperez@email.com",
  "password": "ClaveSegura123",
  "phone": "+573001234567",
  "identityDocument": "1234567890"
}
```

### POST /api/users

Usa este endpoint cuando un admin o staff crea usuarios desde panel, CRM o procesos internos.

- Requiere autenticación.
- Solo lo pueden usar `ADMIN` y `STAFF`.
- Permite crear usuarios más completos o provenientes de otros canales.
- Comparte la misma validación de duplicados por teléfono, identidad de canal y documento.
- Si envías `webAuth.email`, el backend genera un acceso temporal para que el usuario defina su contraseña después.
- Este endpoint ya no acepta `passwordHash` manual.

Ejemplo:

```json
{
  "name": "Juan David Perez",
  "phone": "+573001234567",
  "identityDocument": "1234567890",
  "role": "CUSTOMER",
  "status": "NEW",
  "source": "WEB",
  "identities": [
    {
      "provider": "WEB",
      "providerId": "juanperez@email.com"
    }
  ],
  "webAuth": {
    "email": "juanperez@email.com",
    "emailVerified": false
  }
}
```

Respuesta esperada cuando se genera activación:

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
    "resetUrl": "https://tu-frontend/reset-password?token=...",
    "expiresAt": "2026-03-16T20:30:00.000Z",
    "emailSent": true
  }
}
```

Si el correo no está configurado y no estás en producción, la respuesta puede incluir también `resetToken` para compartirlo manualmente con el usuario.

El correo enviado desde este flujo es de activación de cuenta, no de recuperación por olvido.

## Regla compartida

Aunque existan dos endpoints, la creación real del usuario se resuelve en el servicio de usuarios. Eso evita que un endpoint valide una cosa y el otro otra distinta.

## Duplicados que se bloquean

- `identityDocument`
- `phone`
- `webAuth.email`
- combinaciones de `identities.provider` + `identities.providerId`

## Rifas gratis

Las rifas gratis usan `identityDocument` para asegurar que una persona no participe dos veces con cuentas distintas.