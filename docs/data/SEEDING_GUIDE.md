# 📋 Documentación — API Billar en Línea

> Backend REST API construida con **Express 5 + TypeScript + MongoDB (Mongoose)**  
> Versión: `1.0.0` | Autor: Jeison Vargas | Licencia: ISC

---

## Tabla de Contenidos

1. [Descripción General](#descripción-general)
2. [Stack Tecnológico](#stack-tecnológico)
3. [Estructura del Proyecto](#estructura-del-proyecto)
4. [Variables de Entorno](#variables-de-entorno)
5. [Instalación y Arranque](#instalación-y-arranque)
6. [Seguridad](#seguridad)
7. [Autenticación JWT](#autenticación-jwt)
8. [Rutas de la API](#rutas-de-la-api)
   - [Auth](#auth---apiauthlogin)
   - [Usuarios](#usuarios---apiusers)
   - [Torneos](#torneos---apitournaments)
   - [Partidos](#partidos---apimatches)
9. [Roles y Permisos](#roles-y-permisos)
10. [Modelos de Datos](#modelos-de-datos)
11. [Enums Compartidos](#enums-compartidos)
12. [Errores Comunes de la API](#errores-comunes-de-la-api)
13. [Testing de Modelos - Guía de Seeding](#🌱-testing-de-modelos---guía-de-seeding)

---

## Descripción General

Sistema de gestión para un negocio de **billar en línea** que administra:

- 👥 **Usuarios** — CRM multicanal (WhatsApp, Web, Instagram, Facebook)
- 🏆 **Torneos** — Fase de grupos + bracket de eliminación directa
- 🎱 **Partidos** — Registro de resultados con avance de bracket automático
- 🛒 **Pedidos y Productos** — Tienda de insumos de billar
- 🎟️ **Rifas** — Gestión de boletos y sorteos
- 📺 **Transmisiones** — Registro de streams en vivo

---

## Stack Tecnológico

| Tecnología | Versión | Uso |
|---|---|---|
| Node.js | ≥ 18 | Runtime |
| TypeScript | ^5.9 | Tipado estático |
| Express | ^5.2 | Framework HTTP |
| Mongoose | ^9.2 | ODM para MongoDB |
| bcryptjs | ^3.0 | Hash de contraseñas |
| jsonwebtoken | ^9.0 | Tokens JWT |
| helmet | latest | Cabeceras de seguridad HTTP |
| express-rate-limit | latest | Límite de peticiones por IP |
| express-mongo-sanitize | latest | Prevención de inyección NoSQL |
| cors | ^2.8 | Control de orígenes |
| morgan | ^1.10 | Logs HTTP |
| dotenv | ^17 | Variables de entorno |
| tsx | latest | Ejecutor TypeScript |

---

## Estructura del Proyecto

```
src/
├── app.ts                          # Punto de entrada, middlewares y rutas
├── config/                         # Configuraciones globales
├── controllers/
│   ├── auth.controller.ts          # Login y registro
│   ├── user.controller.ts          # CRUD de usuarios
│   ├── tournament.controller.ts    # Torneos, inscripciones, brackets
│   └── match.controller.ts         # Partidos y resultados
├── db/
│   └── connection.ts               # Conexión a MongoDB
├── middlewares/
│   ├── auth.middleware.ts          # requireAuth + requireRole (JWT)
│   ├── errorHandler.middleware.ts  # Manejador global de errores
│   └── rateLimiter.middleware.ts   # Límite de peticiones
├── models/
│   ├── enums.ts                    # Enums compartidos por todos los modelos
│   ├── user.model.ts
│   ├── tournament.model.ts
│   ├── tournament-registration.model.ts
│   ├── tournament-group.model.ts
│   ├── match.model.ts
│   ├── product.model.ts
│   ├── order.model.ts
│   ├── raffle.model.ts
│   ├── raffle-ticket.model.ts
│   └── transmission.model.ts
├── routes/
│   ├── auth.routes.ts
│   ├── user.routes.ts
│   ├── tournament.routes.ts
│   └── match.routes.ts
├── services/
│   ├── user.service.ts
│   ├── tournament.service.ts
│   ├── match.service.ts
│   └── bracket.service.ts
├── types/
│   └── express.d.ts                # Extiende Request con req.user
└── utils/
    ├── seedData.ts                 # Script de datos de prueba
    └── verifyData.ts               # Script de verificación
```

---

## Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto (nunca subir a Git):

```dotenv
# Base de datos
MONGODB_URI=mongodb://127.0.0.1:27017/billar_en_linea

# JWT — genera una clave larga y aleatoria para producción
JWT_SECRET=tu_clave_secreta_muy_larga_aqui

# CORS — lista de orígenes permitidos, separados por coma
# En producción: ALLOWED_ORIGINS=https://billarenlinea.com
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Entorno: development | production | test
NODE_ENV=development
```

> ⚠️ **En producción**, cambia `JWT_SECRET` por una clave aleatoria de al menos 64 caracteres y actualiza `ALLOWED_ORIGINS` con tu dominio real.

---

## Instalación y Arranque

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo .env con tus variables
cp .env.example .env   # o créalo manualmente

# 3. Iniciar en modo desarrollo (nodemon + tsx)
npm run dev

# 4. Iniciar en producción
npm start
```

El servidor quedará escuchando en `http://localhost:3000` (o el puerto definido en `PORT`).

---

## Seguridad

La API implementa múltiples capas de protección:

### 1. Cabeceras HTTP (`helmet`)
Agrega automáticamente cabeceras como:
- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`

### 2. CORS restringido
Solo se aceptan peticiones de los orígenes listados en `ALLOWED_ORIGINS`. Las peticiones de otros orígenes reciben un error 403.

### 3. Rate Limiting
| Limitador | Rutas | Límite |
|---|---|---|
| `generalLimiter` | `/api/*` | 100 req / 15 min por IP |
| `authLimiter` | `/api/auth/login`, `/api/auth/register` | 10 intentos / 15 min por IP |

Cuando se supera el límite la API responde `429 Too Many Requests`.

### 4. Sanitización de MongoDB (`express-mongo-sanitize`)
Elimina caracteres `$` y `.` de los datos recibidos en `body`, `params` y `query` para prevenir ataques de **inyección NoSQL**.

### 5. Límite de tamaño del body
El body JSON está limitado a **10 KB** para prevenir ataques de denegación de servicio (DoS).

### 6. Contraseñas con bcrypt
Las contraseñas nunca se almacenan en texto plano. Se usa `bcrypt` con **12 salt rounds**.

### 7. Respuestas de error seguras
En `NODE_ENV=production` los errores 5xx no exponen el stack trace ni detalles internos al cliente.

### 8. Campos sensibles excluidos
`passwordHash`, `resetToken` y `emailVerificationToken` se excluyen de todas las respuestas de la API mediante `select()` en Mongoose.

---

## Autenticación JWT

### Registrar una cuenta

```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "Juan Pérez",
  "email": "juan@ejemplo.com",
  "password": "miPassword123",
  "phone": "+573001234567"
}
```

**Respuesta `201`:**
```json
{
  "ok": true,
  "data": {
    "id": "65f...",
    "name": "Juan Pérez",
    "email": "juan@ejemplo.com",
    "role": "CUSTOMER"
  }
}
```

---

### Iniciar sesión

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "juan@ejemplo.com",
  "password": "miPassword123"
}
```

**Respuesta `200`:**
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "65f...",
    "name": "Juan Pérez",
    "email": "juan@ejemplo.com",
    "role": "CUSTOMER"
  }
}
```

---

### Usar el token en peticiones protegidas

Incluye el token en el header `Authorization` de cada petición a rutas protegidas:

```http
GET /api/users
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

El token expira en **8 horas**. Al expirar, el cliente debe hacer login nuevamente.

---

## Rutas de la API

### Auth — `/api/auth`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/auth/register` | ❌ Público | Crea cuenta web con email y contraseña |
| `POST` | `/api/auth/login` | ❌ Público | Inicia sesión, devuelve JWT |

---

### Usuarios — `/api/users`

> Todas las rutas requieren autenticación. Rol mínimo: **STAFF**.

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| `POST` | `/api/users` | STAFF | Crear usuario |
| `GET` | `/api/users` | STAFF | Listar usuarios (filtros + paginación) |
| `GET` | `/api/users/by-phone/:phone` | STAFF | Buscar usuario por teléfono |
| `GET` | `/api/users/:id` | STAFF | Detalle de un usuario |
| `PATCH` | `/api/users/:id` | STAFF | Actualizar campos parciales |
| `DELETE` | `/api/users/:id` | **ADMIN** | Soft delete |

#### Filtros disponibles en `GET /api/users`

```
?status=CLIENT          → Filtra por UserStatus
?role=STAFF             → Filtra por UserRole
?playerCategory=PRIMERA → Filtra por categoría
?search=juan            → Busca por nombre, teléfono o providerId
?page=1&limit=20        → Paginación (defecto: page=1, limit=20)
```

---

### Torneos — `/api/tournaments`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/tournaments` | STAFF+ | Crear torneo |
| `GET` | `/api/tournaments` | ❌ Público | Listar torneos |
| `GET` | `/api/tournaments/:id` | ❌ Público | Detalle completo del torneo |
| `GET` | `/api/tournaments/:id/registrations` | ❌ Público | Lista de inscritos |
| `POST` | `/api/tournaments/:id/register` | STAFF+ | Inscribir jugador |
| `PATCH` | `/api/tournaments/:id/registrations/:userId/handicap` | STAFF+ | Actualizar hándicap |
| `GET` | `/api/tournaments/:id/bracket` | ❌ Público | Ver bracket |
| `GET` | `/api/tournaments/:id/results` | ❌ Público | Resultados del torneo |
| `GET` | `/api/tournaments/:id/pending-payments` | STAFF+ | Pagos pendientes |
| `POST` | `/api/tournaments/:id/generate-bracket` | STAFF+ | Generar bracket desde inscritos |
| `GET` | `/api/tournaments/:id/group-standings` | ❌ Público | Tabla de posiciones de grupos |
| `POST` | `/api/tournaments/:id/groups` | STAFF+ | Crear grupos manualmente |
| `POST` | `/api/tournaments/:id/add-groups` | STAFF+ | Agregar grupos extra |
| `POST` | `/api/tournaments/:id/groups/:groupId/add-player` | STAFF+ | Agregar jugador a grupo |
| `POST` | `/api/tournaments/:id/auto-groups` | STAFF+ | Crear grupos automáticamente |
| `GET` | `/api/tournaments/:id/adjustment-round` | ❌ Público | Ver ronda de ajuste |
| `POST` | `/api/tournaments/:id/generate-adjustment-round` | STAFF+ | Generar ronda de ajuste |
| `POST` | `/api/tournaments/:id/generate-bracket-from-groups` | STAFF+ | Bracket desde clasificados de grupo |
| `POST` | `/api/tournaments/:id/notify-groups` | STAFF+ | Preparar notificaciones por grupo |

---

### Partidos — `/api/matches`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/matches/tournament/:id` | ❌ Público | Partidos de un torneo por ronda |
| `GET` | `/api/matches/:id` | ❌ Público | Detalle de un partido |
| `POST` | `/api/matches/:id/result` | STAFF+ | Registrar resultado del partido |

#### Body para registrar resultado

```json
{
  "winnerId": "65f...",
  "player1Score": 3,
  "player2Score": 1
}
```

---

## Roles y Permisos

```
CUSTOMER  →  Solo puede ver torneos y partidos públicos
STAFF     →  Puede gestionar torneos, inscribir jugadores y registrar resultados
ADMIN     →  Acceso total + puede eliminar usuarios
```

| Acción | CUSTOMER | STAFF | ADMIN |
|---|:---:|:---:|:---:|
| Ver torneos y partidos | ✅ | ✅ | ✅ |
| Crear/editar torneos | ❌ | ✅ | ✅ |
| Gestionar usuarios | ❌ | ✅ | ✅ |
| Registrar resultados | ❌ | ✅ | ✅ |
| Eliminar usuarios | ❌ | ❌ | ✅ |

---

## Modelos de Datos

### User

| Campo | Tipo | Descripción |
|---|---|---|
| `name` | String | Nombre completo |
| `phone` | String | Teléfono (único) |
| `whatsappId` | String | ID de WhatsApp |
| `email` | String | Email (único) |
| `status` | UserStatus | Estado en el embudo de ventas |
| `role` | UserRole | Rol en el sistema |
| `playerCategory` | PlayerCategory | Nivel competitivo |
| `identities` | IIdentity[] | Identidades por canal |
| `webAuth` | IWebAuth | Credenciales de acceso web |
| `interests` | IInterest[] | Áreas de interés registradas |
| `tags` | String[] | Etiquetas para segmentación |
| `source` | UserSource | Canal de adquisición |
| `deletedAt` | Date | Fecha de soft delete |

### Tournament

Gestiona un torneo completo con fase de grupos opcional y bracket de eliminación directa.

### Match

Registra un partido entre dos jugadores con su resultado. Al guardar el resultado avanza automáticamente el bracket si aplica.

---

## Enums Compartidos

Definidos en [src/models/enums.ts](src/models/enums.ts):

| Enum | Valores |
|---|---|
| `UserRole` | `CUSTOMER`, `STAFF`, `ADMIN` |
| `UserStatus` | `NEW`, `INTERESTED`, `QUOTED`, `CLIENT`, `CHURNED` |
| `PlayerCategory` | `TERCERA`, `SEGUNDA`, `PRIMERA`, `ELITE` |
| `Channel` | `WHATSAPP`, `WEB`, `INSTAGRAM`, `FACEBOOK` |
| `UserSource` | `WHATSAPP`, `INSTAGRAM`, `FACEBOOK`, `EVENT`, `ORGANIC`, `WEB` |
| `InterestType` | `STORE`, `TRANSMISSION`, `EVENTS`, `RAFFLES`, `TOURNAMENTS` |

---

## Errores Comunes de la API

| Código | Significado | Causa típica |
|---|---|---|
| `400` | Bad Request | Faltan campos obligatorios o formato inválido |
| `401` | Unauthorized | No se envió token o el token expiró |
| `403` | Forbidden | El rol del usuario no tiene permiso |
| `404` | Not Found | El recurso con ese ID no existe |
| `409` | Conflict | Duplicado (email, teléfono, inscripción) |
| `429` | Too Many Requests | Se superó el rate limit |
| `500` | Internal Server Error | Error inesperado del servidor |

**Formato de error estándar:**
```json
{
  "ok": false,
  "message": "Descripción legible del error"
}
```

---

# 🌱 Testing de Modelos - Guía de Seeding

Este documento explica cómo hacer pruebas de tus modelos insertando datos ficticios.

## ¿Qué es Seeding?

**Seeding** es el proceso de insertar datos de prueba (ficticios) en tu base de datos para validar que:
- Tus modelos de datos funcionan correctamente ✅
- Las validaciones funcionan como se esperan
- Las relaciones entre colecciones están bien configuradas
- Puedes hacer consultas realistas

## Ejecución Rápida

```bash
# Ejecutar el script de seeding una vez
npm run seed

# Ejecutar el script en modo watch (recompila si cambias el código)
npm run seed:watch
```

## ¿Qué hace el script?

El script [src/utils/seedData.ts](src/utils/seedData.ts) automáticamente:

1. ✅ **Se conecta a MongoDB** usando `MONGODB_URI` de tu `.env`
2. 🧹 **Limpia todas las colecciones** (CUIDADO: elimina datos existentes)
3. 📝 **Crea datos ficticios realistas** para cada modelo:
   - **8 Usuarios** con identidades en múltiples canales (WhatsApp, Web)
   - **6 Productos** con variantes y precios
   - **5 Pedidos** con múltiples ítems
   - **3 Torneos** con premios
   - **6 Inscripciones a torneos**
   - **3 Rifas** con boletos
   - **8 Boletos de rifa** comprados por usuarios
   - **2 Transmisiones en vivo**
4. ✅ **Valida que todo se insertó correctamente**
5. 📊 **Muestra un reporte colorido** con resumen de datos creados

## Modelos Testeados

| Modelo | Cantidad | Status |
|--------|----------|--------|
| User | 8 | ✅ |
| Product | 6 | ✅ |
| Order | 5 | ✅ |
| Tournament | 3 | ✅ |
| TournamentRegistration | 5-6 | ✅ |
| Raffle | 3 | ✅ |
| RaffleTicket | 8 | ✅ |
| Transmission | 2 | ✅ |

## ¿Qué datos se generan?

El script usa [@faker-js/faker](https://fakerjs.dev/) para generar:

- Nombres realistas de personas
- Emails y números de teléfono válidos
- Direcciones completas
- URLs de imágenes
- Descripciones coherentes
- Fechas y timestamps

**Ejemplo de Usuario generado:**
```javascript
{
  name: "John Doe",
  email: "john@example.com",
  phone: "+573001234567",
  identities: [
    {
      provider: "WHATSAPP",
      providerId: "+573001234567"
    }
  ],
  status: "CLIENT",
  playerCategory: "PRIMERA",
  tags: ["vip", "bogota"]
}
```

## Cómo interpretar el output

```bash
✓ Conectado a MongoDB: mongodb://localhost:27017/billar-test
✓ Colecciones limpiadas

→ Creando 8 usuarios...
  ✓ Usuario creado: John Doe (ObjectId)
  ✓ Usuario creado: Jane Smith (ObjectId)
  ...

📊 Resumen de datos creados:
  • Usuarios: 8
  • Productos: 6
  • Pedidos: 5
  • Torneos: 3
  • Inscripciones: 5
  • Rifas: 3
  • Boletos: 8
  • Transmisiones: 2

✓ Todos los modelos funcionan correctamente
✓ Desconectado de MongoDB
```

**Colores en el output:**
- 🟢 Verde: operación exitosa
- 🔴 Rojo: error durante la creación
- 🔵 Cyan: operación en progreso

## ¿Cómo verificar los datos en MongoDB?

Después de ejecutar `npm run seed`, puedes conectarte a MongoDB y:

```javascript
// En MongoDB Compass o shell
use billar_en_linea

// Ver cantidad de documentos
db.users.countDocuments()           // 8
db.products.countDocuments()        // 6
db.orders.countDocuments()          // 5
db.tournaments.countDocuments()     // 3
db.raffles.countDocuments()         // 3
db.raffletickets.countDocuments()   // 8

// Ver un documento de ejemplo
db.users.findOne()
db.orders.findOne()
db.raffles.findOne()
```

## Errors Comunes

### Error: "No está disponible MongoDB"
```
✗ Error de conexión a MongoDB
```
**Solución:** Asegúrate que:
1. MongoDB está corriendo (`mongod` en terminal)
2. `MONGODB_URI` en `.env` es correcto
3. Tienes conexión de red

### Error: "Cannot find module"
```
TypeError: Cannot find module 'mongoose'
```
**Solución:** Instala las dependencias:
```bash
npm install
npm install @faker-js/faker --save-dev
```

### Error: "E11000 duplicate key error" en Tournament Registration
```
E11000 duplicate key error ... user_1_tournament_1
```
**Esto es normal y esperado.** Significa que el script intentó inscribir el mismo usuario al mismo torneo dos veces, lo cual está validado en el modelo. El script maneja este error gracefully.

## Customizar el script

Si quieres cambiar la cantidad de datos generados, edita [src/utils/seedData.ts](src/utils/seedData.ts):

```typescript
// Cambiar estas líneas (por defecto):
const users = await seedUsers(8);           // Cambiar 8
const products = await seedProducts(6);     // Cambiar 6
const orders = await seedOrders(users, products, 5);  // Cambiar 5
const tournaments = await seedTournaments(users, 3);  // Cambiar 3
const raffles = await seedRaffles(users, 3);        // Cambiar 3
await seedRaffleTickets(users, raffles, 8);        // Cambiar 8
```

## ¿Por qué necesito esto?

- ✅ **Validar schemas**: Asegurar que tus modelos JSON Schema funcionan
- ✅ **Testear queries**: Practicar búsquedas complejas con datos reales
- ✅ **Desarrollo frontend**: Tener datos auténticos para UI testing
- ✅ **Debugging**: Entender cómo se estructura la información
- ✅ **Documentación**: Como referencia de qué datos espera cada modelo

## Próximos Pasos

1. ✅ Ejecuta `npm run seed` para crear datos de prueba
2. 🔍 Inspecciona los datos en MongoDB Compass
3. 💻 Crea rutas en `src/routes/` que usen estos datos
4. 🧪 Escribe tests unitarios que verifiquen los modelos
5. 📱 Conecta tu frontend y prueba con datos reales

## Información Técnica

**Stack usado:**
- **TypeScript**: Tipado estático
- **Mongoose**: ODM para MongoDB
- **@faker-js/faker**: Generación de datos ficticios
- **tsx**: Ejecutor de TypeScript mejorado

**Archivos involucrados:**
- Script principal: [src/utils/seedData.ts](src/utils/seedData.ts)
- Configuración DB: [src/db/connection.ts](src/db/connection.ts)
- Modelos: [src/models/](src/models/)
- Enums: [src/models/enums.ts](src/models/enums.ts)

---

📖 Para más información sobre los modelos, revisa[src/models/](src/models/) donde cada modelo tiene comentarios detallados.
