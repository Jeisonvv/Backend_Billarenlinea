# Integracion Frontend con Wompi para Rifas

Esta guia explica como consumir desde frontend la integracion de rifas con Wompi ya implementada en el backend.

## Objetivo

El frontend debe hacer estas tareas:

1. Mostrar rifas activas.
2. Mostrar numeros disponibles de una rifa.
3. Permitir que el usuario seleccione sus numeros.
4. Pedir al backend la configuracion del checkout Wompi.
5. Abrir Wompi Widget o redirigir al checkout.
6. Mostrar al usuario el resultado del pago.

El frontend no debe:

- calcular firmas de integridad
- marcar pagos como aprobados
- decidir si una transaccion fue exitosa
- guardar secretos de Wompi

## Endpoints que consume el frontend

### Listar rifas

`GET /api/raffles`

### Ver detalle de una rifa

`GET /api/raffles/:id`

### Ver numeros disponibles

`GET /api/raffles/:id/available-numbers`

### Crear checkout Wompi

`POST /api/raffles/:id/wompi/checkout`

Requiere token del usuario autenticado.

Body de ejemplo:

```json
{
  "numbers": ["00", "01", "02"]
}
```

## Flujo recomendado en frontend

### Paso 1: mostrar rifas activas

Consulta:

```http
GET /api/raffles?status=ACTIVE
```

Muestra:

- nombre
- premio
- precio por boleto
- fecha del sorteo
- cantidad disponible

### Paso 2: mostrar numeros disponibles de una rifa

Consulta:

```http
GET /api/raffles/:id/available-numbers
```

La respuesta trae los numeros libres de esa rifa.

Ejemplo de render:

- grid de numeros
- boton seleccionar / deseleccionar
- contador de total seleccionado
- total a pagar

### Paso 3: crear checkout Wompi

Cuando el usuario confirme sus numeros:

```http
POST /api/raffles/:id/wompi/checkout
Authorization: Bearer TU_JWT
Content-Type: application/json
```

Body:

```json
{
  "numbers": ["00", "01", "02"]
}
```

La respuesta del backend trae toda la configuracion necesaria para Wompi.

## Ejemplo de respuesta del checkout

```json
{
  "ok": true,
  "data": {
    "ticketId": "67d3f0f4e72d9a0012345678",
    "paymentProvider": "WOMPI",
    "reference": "RAFFLE-ABC123-1710450123-FA12BC34",
    "amountInCents": 3000000,
    "currency": "COP",
    "expirationTime": "2026-03-14T22:00:00.000Z",
    "redirectUrl": "http://localhost:5173/payments/wompi",
    "checkoutUrl": "https://checkout.wompi.co/p/",
    "widgetUrl": "https://checkout.wompi.co/widget.js",
    "publicKey": "pub_test_xxxxxxxxxxxxxxxxx",
    "signature": {
      "integrity": "abcdef1234567890"
    },
    "customerData": {
      "email": "usuario@email.com",
      "fullName": "Usuario Demo",
      "phoneNumberPrefix": "+57",
      "phoneNumber": "3001234567"
    },
    "raffle": {
      "id": "67d3f0f4e72d9a0012345000",
      "name": "Sorteo Taco Predator Mayo",
      "ticketPrice": 10000,
      "numbers": ["00", "01", "02"],
      "total": 30000
    }
  }
}
```

## Opcion 1: abrir Wompi Widget

Incluye el script de Wompi en tu app:

```html
<script src="https://checkout.wompi.co/widget.js"></script>
```

Ejemplo de uso:

```javascript
async function pagarRifa(raffleId, numbers, token) {
  const response = await fetch(`/api/raffles/${raffleId}/wompi/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ numbers }),
  });

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.message || 'No fue posible iniciar el pago');
  }

  const data = result.data;

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

  checkout.open(function (widgetResult) {
    console.log('Resultado inicial del widget:', widgetResult);
  });
}
```

Notas:

- El callback del widget no reemplaza al webhook.
- El resultado final del pago debe venir del backend, no del callback del navegador.

## Opcion 2: redirigir a Web Checkout

Si no quieres usar el widget, puedes construir un formulario HTML y enviarlo a:

`https://checkout.wompi.co/p/`

Campos necesarios:

- `public-key`
- `currency`
- `amount-in-cents`
- `reference`
- `signature:integrity`
- `redirect-url`
- `expiration-time`

Ejemplo:

```html
<form action="https://checkout.wompi.co/p/" method="GET">
  <input type="hidden" name="public-key" value="PUB_KEY" />
  <input type="hidden" name="currency" value="COP" />
  <input type="hidden" name="amount-in-cents" value="3000000" />
  <input type="hidden" name="reference" value="RAFFLE-ABC123" />
  <input type="hidden" name="signature:integrity" value="FIRMA" />
  <input type="hidden" name="redirect-url" value="http://localhost:5173/payments/wompi" />
  <input type="hidden" name="expiration-time" value="2026-03-14T22:00:00.000Z" />
  <button type="submit">Pagar con Wompi</button>
</form>
```

## Pantalla de retorno

Configura una ruta de frontend como:

`/payments/wompi`

Wompi redirige agregando un parametro `id` de transaccion. Ejemplo:

`http://localhost:5173/payments/wompi?id=1234-1610641025-49201`

Importante:

- Esa redireccion es informativa.
- No debes asumir que el pago esta aprobado solo porque el usuario volvio a tu frontend.
- La fuente de verdad sigue siendo el webhook en backend.

Lo recomendable en esa pantalla es mostrar:

- "Estamos verificando tu pago"
- estado preliminar
- numeros seleccionados si ya los conoces en memoria local
- opcion para refrescar o consultar una orden

## UX recomendada

### Antes del pago

- Muestra claramente los numeros seleccionados.
- Muestra el total en pesos.
- Informa que los numeros quedaran reservados por unos minutos.
- Si vas a pedir aceptacion legal, hazlo antes de abrir Wompi.

### Durante el pago

- Deshabilita botones mientras creas el checkout.
- Muestra loader o estado "Preparando pago".
- Si el backend devuelve error, muestra el mensaje de forma clara.

### Despues del pago

- Si el usuario vuelve por `redirectUrl`, muestra que el pago esta en validacion.
- Si luego consultas tu backend y el ticket sigue `RESERVED`, indica que aun esta pendiente.
- Si el backend confirma `PAID`, muestra compra exitosa y numeros pagados.
- Si el backend lo marca `CANCELLED`, informa que la reserva fue liberada.

## Errores frecuentes que debes contemplar

### Numeros ya no disponibles

Puede pasar si otro usuario los reserva antes.

El backend respondera error al crear el checkout.

Frontend:

- refresca numeros disponibles
- informa al usuario que algunos numeros ya no estan libres

### Reserva vencida

Si el usuario tarda demasiado, la reserva puede expirar.

Frontend:

- informa que debe volver a seleccionar o regenerar el checkout

### Usuario sin email

Wompi requiere email del cliente.

Frontend:

- antes de intentar pagar, valida que el usuario tenga email
- si no lo tiene, redirigelo a completar perfil

## Recomendaciones tecnicas

- Mantener el JWT actualizado para poder crear el checkout.
- No caches indefinidamente los numeros disponibles.
- Refrescar disponibilidad antes de confirmar compra.
- No persistir secretos de Wompi en el frontend.
- Si usas React o Vue, encapsula la llamada del checkout en un hook o servicio dedicado.

## Pendientes utiles para frontend

Cuando quieras mejorar esta integracion, lo siguiente seria util:

1. Crear endpoint para consultar un ticket por referencia.
2. Mostrar estado del ticket en una pantalla de confirmacion.
3. Agregar polling corto mientras llega el webhook.
4. Mostrar historial de boletos comprados por usuario.
