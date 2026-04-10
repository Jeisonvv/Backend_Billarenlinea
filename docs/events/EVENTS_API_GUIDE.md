# API de eventos

Este módulo permite publicar eventos como copas, masters, campeonatos nacionales o departamentales.

## Endpoints

### Públicos

- `GET /api/events` → listar eventos visibles
- `GET /api/events/:id` → ver detalle de un evento

### Solo admin o staff

- `POST /api/events` → crear evento
- `PUT /api/events/:id` → actualizar evento
- `DELETE /api/events/:id` → eliminar evento

## Campos principales

- `name`: nombre del evento
- `description`: descripción opcional
- `type`: `CUP`, `MASTER`, `CHAMPIONSHIP`, `OPEN`, `EXHIBITION`, `OTHER`
- `tier`: `WORLD`, `INTERNATIONAL`, `NATIONAL`, `DEPARTMENTAL`, `REGIONAL`, `LOCAL`
- `status`: `SCHEDULED`, `LIVE`, `FINISHED`, `CANCELLED`
- `organizer`: organizador del evento
- `location`, `city`, `department`, `country`: ubicación
- `startDate`, `endDate`: fechas del evento
- `entryFee`: valor de inscripción de competidores
- `registrationMode`: `NONE`, `EXTERNAL_LINK`, `INTERNAL`
- `registrationUrl`: link externo si ustedes solo informan dónde se inscriben
- `hasGrandstand`: indica si hay palco o zona para espectadores
- `grandstandDetails`: detalle opcional del palco o zona de público
- `ticketingMode`: `NO_TICKETS`, `EXTERNAL_LINK`, `INTERNAL`
- `ticketPrice`: valor de la boletería cuando aplique
- `ticketUrl`: link externo de información o compra de boletas
- `imageUrl`, `streamUrl`, `resultsUrl`: enlaces opcionales
- `featured`: si se destaca en listados
- `prizes`: premios opcionales por posición

## Reglas de negocio

- Si `registrationMode` es `EXTERNAL_LINK`, debes enviar `registrationUrl`.
- Si `ticketingMode` es `EXTERNAL_LINK`, debes enviar `ticketUrl`.
- Si `ticketingMode` es `INTERNAL`, el evento debe tener `hasGrandstand = true`.
- Si defines `ticketPrice`, el evento debe tener `hasGrandstand = true`.
- Si ustedes solo informan sobre el evento, usa links externos en vez de venta interna.

## Ejemplo de creación

```json
{
  "name": "World Master Billar 2026",
  "description": "Evento internacional con jugadores invitados y cuadro principal.",
  "type": "MASTER",
  "tier": "WORLD",
  "status": "SCHEDULED",
  "organizer": "Billar en Linea",
  "location": "Centro de Convenciones",
  "city": "Bogotá",
  "department": "Cundinamarca",
  "country": "Colombia",
  "startDate": "2026-09-10T09:00:00.000Z",
  "endDate": "2026-09-14T23:00:00.000Z",
  "entryFee": 250000,
  "registrationMode": "EXTERNAL_LINK",
  "registrationUrl": "https://federacion-billar.com/world-master-2026/inscripcion",
  "hasGrandstand": true,
  "grandstandDetails": "Palco lateral y gradería general para espectadores.",
  "ticketingMode": "EXTERNAL_LINK",
  "ticketPrice": 80000,
  "ticketUrl": "https://federacion-billar.com/world-master-2026/boletas",
  "imageUrl": "https://...",
  "streamUrl": "https://youtube.com/...",
  "featured": true,
  "prizes": [
    { "position": 1, "description": "Campeón", "amount": 10000000 },
    { "position": 2, "description": "Subcampeón", "amount": 5000000 }
  ]
}
```

## Ejemplo de evento solo informativo

```json
{
  "name": "Campeonato Nacional de Billar 2026",
  "type": "CHAMPIONSHIP",
  "tier": "NATIONAL",
  "status": "SCHEDULED",
  "organizer": "Federación Colombiana de Billar",
  "city": "Cali",
  "department": "Valle del Cauca",
  "country": "Colombia",
  "startDate": "2026-08-02T08:00:00.000Z",
  "endDate": "2026-08-06T20:00:00.000Z",
  "entryFee": 180000,
  "registrationMode": "EXTERNAL_LINK",
  "registrationUrl": "https://federacion-billar.com/nacional-2026/inscripcion",
  "hasGrandstand": true,
  "ticketingMode": "EXTERNAL_LINK",
  "ticketPrice": 30000,
  "ticketUrl": "https://federacion-billar.com/nacional-2026/boletas",
  "featured": false,
  "prizes": []
}
```