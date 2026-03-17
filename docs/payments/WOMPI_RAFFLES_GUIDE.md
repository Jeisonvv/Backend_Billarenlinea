# Integracion de Rifas con Wompi

Esta guia documenta la integracion actual entre rifas, reservas de numeros y pagos con Wompi en este backend.

Complemento recomendado:

- Ver tambien `WOMPI_FRONTEND_GUIDE.md` en esta misma carpeta para la integracion del frontend con Widget o Checkout Web.

## Resumen

El flujo implementado funciona asi:

1. Se crea una rifa con una cantidad de numeros que debe ser potencia de 10.
2. El backend genera automaticamente todos los numeros de esa rifa.
3. El usuario selecciona numeros y solicita un checkout de Wompi.
4. El backend crea una reserva temporal en estado `RESERVED`.
5. El frontend abre Wompi Widget o Web Checkout usando la configuracion devuelta por el backend.
6. Wompi envia un webhook al backend cuando la transaccion cambia de estado.
7. El backend confirma el pago o libera la reserva segun el estado final.

## Modelos involucrados

### Rifa

Archivo: `src/models/raffle.model.ts`

Responsabilidad:

- Definir la rifa como entidad principal.
- Guardar premio, fecha del sorteo, precio por boleto, total de boletos y ganador.

Puntos importantes:

- `totalTickets` solo permite valores como `10`, `100`, `1000`, `10000`, etc.
- `winnerTicket` se guarda como string para conservar ceros a la izquierda.

### Numero de rifa

Archivo: `src/models/raffle-number.model.ts`

Responsabilidad:

- Guardar cada numero individual de una rifa.
- Relacionar cada numero con una rifa concreta.
- Mantener su estado: `AVAILABLE`, `RESERVED`, `PAID`, `WINNER`.

Ejemplo:

```json
{
  "raffle": "...",
  "number": "023",
  "numericValue": 23,
  "status": "AVAILABLE"
}
```

### Ticket de rifa

Archivo: `src/models/raffle-ticket.model.ts`

Responsabilidad:

- Representar una compra o reserva de uno o varios numeros.
- Guardar el usuario, los numeros elegidos y los datos de pago.
- Relacionar la compra con Wompi cuando aplica.

Campos relevantes para pagos:

- `paymentProvider`
- `paymentStatus`
- `paymentTransactionId`
- `paymentReference`
- `reservedUntil`

## Variables de entorno

Configura estas variables en `.env`:

```env
WOMPI_PUBLIC_KEY=pub_test_xxxxxxxxxxxxxxxxx
WOMPI_INTEGRITY_SECRET=test_integrity_xxxxxxxxxxxxxxxxx
WOMPI_EVENTS_SECRET=test_events_xxxxxxxxxxxxxxxxx
WOMPI_REDIRECT_URL=http://localhost:5173/payments/wompi
RAFFLE_RESERVATION_MINUTES=15
```

Descripcion:

- `WOMPI_PUBLIC_KEY`: llave publica usada por Widget y Checkout Web.
- `WOMPI_INTEGRITY_SECRET`: secreto usado para generar la firma de integridad.
- `WOMPI_EVENTS_SECRET`: secreto usado para validar el checksum del webhook.
- `WOMPI_REDIRECT_URL`: URL del frontend a la que Wompi redirige al finalizar el pago.
- `RAFFLE_RESERVATION_MINUTES`: minutos durante los cuales se bloquean los numeros reservados.

## Endpoints de rifas

Base: `/api/raffles`

### Crear rifa

`POST /api/raffles`

Requiere `ADMIN` o `STAFF`.

Body de ejemplo:

```json
{
  "name": "Sorteo Taco Predator Mayo",
  "description": "Rifa promocional",
  "status": "ACTIVE",
  "prize": "Taco Predator REVO + estuche",
  "ticketPrice": 10000,
  "totalTickets": 100,
  "drawDate": "2026-05-30T20:00:00.000Z"
}
```

Notas:

- Al crear la rifa, el backend genera automaticamente los numeros `00` a `99` si `totalTickets = 100`.

### Listar rifas

`GET /api/raffles`

Query params opcionales:

- `status`
- `page`
- `limit`

### Ver detalle de una rifa

`GET /api/raffles/:id`

Incluye un resumen de numeros:

- `available`
- `reserved`
- `paid`
- `winner`

### Listar todos los numeros de una rifa

`GET /api/raffles/:id/numbers`

Query params opcionales:

- `status`
- `page`
- `limit`

### Listar solo los numeros disponibles

`GET /api/raffles/:id/available-numbers`

## Endpoint de compra directa de boletos

`POST /api/raffles/:id/tickets`

Requiere autenticacion.

Caso cliente normal:

```json
{
  "numbers": ["00", "01", "02"],
  "channel": "WEB",
  "status": "RESERVED"
}
```

Caso admin o staff marcando como pagado:

```json
{
  "userId": "ID_DEL_USUARIO",
  "numbers": ["03", "04", "05"],
  "channel": "WEB",
  "status": "PAID",
  "paymentMethod": "NEQUI",
  "paymentReference": "COMPROBANTE-12345"
}
```

Reglas:

- Un cliente puede comprar varios numeros.
- Un cliente puede hacer varias compras en la misma rifa.
- Un cliente no puede marcar una compra como `PAID`.
- Un cliente no puede comprar para otro usuario.
- Los numeros deben estar disponibles al momento de la compra.

## Endpoint para checkout de Wompi

`POST /api/raffles/:id/wompi/checkout`

Requiere autenticacion.

Body de ejemplo:

```json
{
  "numbers": ["00", "01", "02"]
}
```

Que hace este endpoint:

1. Libera reservas vencidas.
2. Verifica que la rifa este activa.
3. Verifica que el usuario tenga email.
4. Crea un ticket en estado `RESERVED` con proveedor `WOMPI`.
5. Genera una referencia unica.
6. Calcula la firma de integridad.
7. Devuelve los datos necesarios para abrir Wompi.

Respuesta esperada:

```json
{
  "ok": true,
  "data": {
    "ticketId": "...",
    "paymentProvider": "WOMPI",
    "reference": "RAFFLE-ABC123-...",
    "amountInCents": 3000000,
    "currency": "COP",
    "expirationTime": "2026-03-14T22:00:00.000Z",
    "redirectUrl": "http://localhost:5173/payments/wompi",
    "checkoutUrl": "https://checkout.wompi.co/p/",
    "widgetUrl": "https://checkout.wompi.co/widget.js",
    "publicKey": "pub_test_...",
    "signature": {
      "integrity": "..."
    },
    "customerData": {
      "email": "usuario@email.com",
      "fullName": "Nombre Usuario",
      "phoneNumberPrefix": "+57",
      "phoneNumber": "3001234567"
    },
    "raffle": {
      "id": "...",
      "name": "Sorteo Taco Predator Mayo",
      "ticketPrice": 10000,
      "numbers": ["00", "01", "02"],
      "total": 30000
    }
  }
}
```

## Como usar la respuesta en frontend

Tienes dos opciones:

### Opcion 1: Widget de Wompi

1. Incluye el script:

```html
<script src="https://checkout.wompi.co/widget.js"></script>
```

2. Usa la respuesta del backend para abrir el widget:

```javascript
const checkout = new WidgetCheckout({
  currency: data.currency,
  amountInCents: data.amountInCents,
  reference: data.reference,
  publicKey: data.publicKey,
  signature: {
    integrity: data.signature.integrity,
  },
  redirectUrl: data.redirectUrl,
  expirationTime: data.expirationTime,
  customerData: {
    email: data.customerData.email,
    fullName: data.customerData.fullName,
    phoneNumber: data.customerData.phoneNumber,
    phoneNumberPrefix: data.customerData.phoneNumberPrefix,
  },
});

checkout.open(function (result) {
  console.log(result);
});
```

### Opcion 2: Web Checkout

Puedes construir un formulario `GET` hacia `https://checkout.wompi.co/p/` con:

- `public-key`
- `currency`
- `amount-in-cents`
- `reference`
- `signature:integrity`
- `redirect-url`
- `expiration-time`

## Webhook de Wompi

Endpoint:

`POST /api/payments/wompi/webhook`

Este endpoint:

1. Valida el checksum usando el header `X-Event-Checksum` o el checksum del payload.
2. Solo procesa eventos `transaction.updated`.
3. Busca el ticket por `paymentReference`.
4. Compara el monto reportado con el total reservado.
5. Aplica la transicion segun el estado final de Wompi.

Estados manejados:

- `APPROVED`
- `DECLINED`
- `VOIDED`
- `ERROR`
- `PENDING`

### Si Wompi reporta APPROVED

El backend:

- Marca el ticket como `PAID`.
- Marca los numeros reservados como `PAID`.
- Incrementa `soldTickets` en la rifa.
- Guarda `paymentTransactionId`.

### Si Wompi reporta DECLINED, VOIDED o ERROR

El backend:

- Marca el ticket como `CANCELLED`.
- Libera los numeros de vuelta a `AVAILABLE`.
- Limpia la reserva.

## Reservas vencidas

El backend libera automaticamente reservas vencidas cuando:

- consultas el detalle de una rifa
- consultas numeros de una rifa
- consultas numeros disponibles
- compras boletos
- creas checkout Wompi
- ejecutas el sorteo

Esto evita que numeros queden bloqueados indefinidamente si el usuario abandona el pago.

## Endpoint para ejecutar el sorteo

`POST /api/raffles/:id/draw`

Requiere `ADMIN` o `STAFF`.

Reglas:

- Solo puede sortear sobre numeros `PAID`.
- El backend elige un numero ganador aleatorio.
- Marca ese numero como `WINNER`.
- Marca el ticket correspondiente como `WINNER`.
- Actualiza la rifa con `winnerTicket` y `winner`.

## Seguridad importante

- No confies en la redireccion del frontend para aprobar pagos.
- La fuente de verdad del pago debe ser el webhook.
- El secreto de integridad y el secreto de eventos nunca deben estar en el frontend.
- Usa HTTPS tanto para frontend como para webhook.
- Configura una URL de eventos distinta para sandbox y produccion.

## Flujo recomendado completo

1. Crear rifa.
2. Mostrar numeros disponibles en frontend.
3. Usuario elige numeros.
4. Backend crea checkout Wompi y deja ticket `RESERVED`.
5. Frontend abre Wompi.
6. Wompi notifica el resultado por webhook.
7. Backend aprueba o cancela la reserva.
8. Usuario consulta el estado final desde tu frontend o desde un endpoint de tickets.

## Pendientes recomendados

Aunque la base ya esta lista, estos siguientes pasos siguen siendo recomendables:

1. Crear endpoint para consultar tickets por usuario.
2. Crear endpoint para consultar un ticket por `paymentReference`.
3. Agregar pruebas automatizadas para webhook y expiracion de reservas.
4. Si vas a usar checkout por API directa de Wompi, agregar manejo de `acceptance_token` y `accept_personal_auth` desde frontend y backend.
