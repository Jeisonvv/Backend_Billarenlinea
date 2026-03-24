// ─────────────────────────────────────────────────────────────────────────────
// ENUMS COMPARTIDOS
//
// Un enum (enumeración) es una forma de definir un conjunto fijo de valores
// permitidos. En lugar de escribir el string "WHATSAPP" en todo el código
// (propenso a errores de tipeo), usas Channel.WHATSAPP y TypeScript te avisa
// si te equivocas en tiempo de compilación, antes de que el código corra.
//
// Todos los modelos importan sus enums desde este archivo para evitar
// duplicar código y garantizar consistencia.
// ─────────────────────────────────────────────────────────────────────────────

// ── Canales de comunicación ───────────────────────────────────────────────────
// Por qué canal se comunica el usuario con el negocio.
// Se usa en User, Order, TournamentRegistration y RaffleTicket.
export enum Channel {
  WHATSAPP = "WHATSAPP",
  WEB = "WEB",
  INSTAGRAM = "INSTAGRAM",
  FACEBOOK = "FACEBOOK",
}

// ── Fuente de adquisición ─────────────────────────────────────────────────────
// De dónde vino el usuario la PRIMERA vez que nos contactó.
// Sirve para saber qué canales de marketing funcionan mejor.
export enum UserSource {
  WHATSAPP = "WHATSAPP",
  INSTAGRAM = "INSTAGRAM",
  FACEBOOK = "FACEBOOK",
  EVENT = "EVENT",     // Llegó desde un evento presencial (torneo, feria, etc.)
  ORGANIC = "ORGANIC", // Llegó solo, sin campaña específica
  WEB = "WEB",
}

// ── Embudo de ventas ──────────────────────────────────────────────────────────
// En qué etapa del proceso de compra está el usuario.
// El flujo normal es: NEW → INTERESTED → QUOTED → CLIENT
// CHURNED significa que era cliente pero dejó de interactuar.
export enum UserStatus {
  NEW = "NEW",               // Acaba de llegar, no sabemos si le interesa algo
  INTERESTED = "INTERESTED", // Mostró interés en algún producto o torneo
  QUOTED = "QUOTED",         // Le enviamos una cotización o propuesta
  CLIENT = "CLIENT",         // Ya realizó al menos una compra
  CHURNED = "CHURNED",       // Era cliente pero se fue / dejó de responder
}

// ── Estado de una sesión temporal de lead ───────────────────────────────────
// Permite separar la conversación del bot del usuario persistido en CRM.
export enum LeadSessionStatus {
  ACTIVE = "ACTIVE",
  QUALIFIED = "QUALIFIED",
  PROMOTED = "PROMOTED",
  ABANDONED = "ABANDONED",
  EXPIRED = "EXPIRED",
}

// ── Categoría de jugador ──────────────────────────────────────────────────────
// Nivel competitivo del jugador de billar.
// Se usa para filtrar en qué torneos puede participar cada jugador.
export enum PlayerCategory {
  TERCERA = "TERCERA", // Nivel básico / principiante
  SEGUNDA = "SEGUNDA", // Nivel intermedio
  PRIMERA = "PRIMERA", // Nivel avanzado
  ELITE = "ELITE",     // Nivel profesional / competitivo
}

// ── Áreas de interés ──────────────────────────────────────────────────────────
// Con qué parte del negocio ha interactuado el usuario.
// Se registra en el array interests[] del usuario para saber qué le gusta.
export enum InterestType {
  STORE = "STORE",               // Tienda de productos (tacos, bolas, accesorios)
  TRANSMISSION = "TRANSMISSION", // Transmisiones en vivo
  EVENTS = "EVENTS",             // Eventos generales
  RAFFLES = "RAFFLES",           // Rifas y sorteos
  TOURNAMENTS = "TOURNAMENTS",   // Torneos de billar
}

// ── Rol del usuario ───────────────────────────────────────────────────────────
// Qué permisos tiene el usuario dentro del sistema.
export enum UserRole {
  CUSTOMER = "CUSTOMER", // Cliente: solo puede ver y comprar
  STAFF = "STAFF",       // Empleado: puede gestionar pedidos y torneos
  ADMIN = "ADMIN",       // Administrador: acceso total al sistema
}

// ── Categorías de producto ────────────────────────────────────────────────────
// Tipo de producto en la tienda.
export enum ProductCategory {
  CUE = "CUE",               // Tacos de billar
  BALL = "BALL",             // Bolas de billar
  TABLE = "TABLE",           // Mesas de billar
  ACCESSORY = "ACCESSORY",   // Accesorios (tiza, guantes, triángulo, etc.)
  CLOTHING = "CLOTHING",     // Ropa deportiva
  OTHER = "OTHER",           // Otros productos
}

// ── Estados de un pedido ──────────────────────────────────────────────────────
// Por qué estados pasa un pedido desde que el cliente lo hace hasta que lo recibe.
export enum OrderStatus {
  PENDING = "PENDING",         // Pedido creado, esperando confirmación de pago
  PAID = "PAID",               // Pago recibido y confirmado
  PROCESSING = "PROCESSING",   // Preparando el pedido para envío
  SHIPPED = "SHIPPED",         // Ya fue enviado al cliente
  DELIVERED = "DELIVERED",     // El cliente confirmó que lo recibió
  CANCELLED = "CANCELLED",     // Cancelado (por el cliente o por el negocio)
  REFUNDED = "REFUNDED",       // Se realizó devolución del dinero
}

// ── Métodos de pago ───────────────────────────────────────────────────────────
// Formas de pago aceptadas en el negocio.
// Se usa en pedidos, inscripciones a torneos y compra de boletos de rifa.
export enum PaymentMethod {
  CASH = "CASH",           // Efectivo (pago presencial)
  TRANSFER = "TRANSFER",   // Transferencia bancaria
  CARD = "CARD",           // Tarjeta débito o crédito
  NEQUI = "NEQUI",         // Billetera digital Nequi
  DAVIPLATA = "DAVIPLATA", // Billetera digital Daviplata
}

// ── Estados de un torneo ──────────────────────────────────────────────────────
// Ciclo de vida completo de un torneo.
export enum TournamentStatus {
  DRAFT = "DRAFT",               // Borrador, solo visible para admins
  OPEN = "OPEN",                 // Inscripciones abiertas al público
  CLOSED = "CLOSED",             // Inscripciones cerradas, esperando inicio
  IN_PROGRESS = "IN_PROGRESS",   // Torneo en curso
  FINISHED = "FINISHED",         // Torneo finalizado, hay resultados
  CANCELLED = "CANCELLED",       // Torneo cancelado
}

// ── Formatos de torneo ────────────────────────────────────────────────────────
// Cómo se estructura la competencia.
export enum TournamentFormat {
  SINGLE_ELIMINATION = "SINGLE_ELIMINATION", // Eliminación directa: pierde → fuera
  DOUBLE_ELIMINATION = "DOUBLE_ELIMINATION", // Necesitas perder 2 veces para salir
  ROUND_ROBIN = "ROUND_ROBIN",               // Todos juegan contra todos
  SWISS = "SWISS",                           // Sistema suizo: común en billar y ajedrez
}

// ── Estados de inscripción a torneo ───────────────────────────────────────────
// Estado de la inscripción de un jugador específico a un torneo específico.
export enum RegistrationStatus {
  PENDING = "PENDING",       // Inscrito pero sin pago confirmado
  CONFIRMED = "CONFIRMED",   // Pago confirmado, cupo asegurado
  CANCELLED = "CANCELLED",   // Inscripción cancelada
  WAITLIST = "WAITLIST",     // Torneo lleno, está en lista de espera
}

// ── Estados de una rifa ───────────────────────────────────────────────────────
// Ciclo de vida de una rifa.
export enum RaffleStatus {
  DRAFT = "DRAFT",         // Borrador, aún no publicada
  ACTIVE = "ACTIVE",       // Activa: se están vendiendo boletos
  CLOSED = "CLOSED",       // Venta cerrada, pendiente del sorteo
  DRAWN = "DRAWN",         // Sorteo realizado, hay ganador
  CANCELLED = "CANCELLED", // Rifa cancelada
}

// ── Estados de un boleto de rifa ──────────────────────────────────────────────
// Estado de un boleto o grupo de boletos comprados por un usuario.
export enum TicketStatus {
  AVAILABLE = "AVAILABLE", // Disponible para ser comprado
  RESERVED = "RESERVED",   // Separado por alguien, esperando pago
  PAID = "PAID",           // Pagado y confirmado (boleto válido para el sorteo)
  WINNER = "WINNER",       // Este boleto resultó ganador del sorteo
  CANCELLED = "CANCELLED", // Reserva o compra cancelada/liberada
}

// ── Estado de un número individual de la rifa ───────────────────────────────
// Cada número existe desde la creación de la rifa y cambia de estado
// a medida que se reserva, se paga o gana.
export enum RaffleNumberStatus {
  AVAILABLE = "AVAILABLE",
  RESERVED = "RESERVED",
  PAID = "PAID",
  WINNER = "WINNER",
}

// ── Proveedor de pagos ──────────────────────────────────────────────────────
export enum PaymentProvider {
  WOMPI = "WOMPI",
}

// ── Estados de una transacción externa de pago ──────────────────────────────
export enum PaymentTransactionStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  DECLINED = "DECLINED",
  VOIDED = "VOIDED",
  ERROR = "ERROR",
}

// ── Estados de una transmisión ────────────────────────────────────────────────
export enum TransmissionStatus {
  SCHEDULED = "SCHEDULED", // Programada para una fecha futura
  LIVE = "LIVE",           // En vivo en este momento
  FINISHED = "FINISHED",   // Ya terminó
  CANCELLED = "CANCELLED", // Cancelada
}

// ── Plataformas de transmisión ────────────────────────────────────────────────
// En qué plataforma se realiza la transmisión en vivo.
export enum TransmissionPlatform {
  YOUTUBE = "YOUTUBE",
  FACEBOOK = "FACEBOOK",
  INSTAGRAM = "INSTAGRAM",
  TIKTOK = "TIKTOK",
  TWITCH = "TWITCH",
}

// ── Estado de un partido ──────────────────────────────────────────────────────
// Por qué estados pasa un partido durante el torneo.
export enum MatchStatus {
  PENDING = "PENDING",       // Programado pero no jugado aún
  IN_PROGRESS = "IN_PROGRESS", // En juego ahora mismo
  COMPLETED = "COMPLETED",   // Terminado, hay resultado
  BYE = "BYE",               // Un jugador avanza sin rival (posición libre)
  CANCELLED = "CANCELLED",   // Partido cancelado
}

// ── Tipo de ronda ─────────────────────────────────────────────────────────────
// En qué parte del torneo se enmarca el partido.
export enum RoundType {
  GROUP      = "GROUP",              // Fase de grupos
  ADJUSTMENT = "ADJUSTMENT",         // Ronda de ajuste (previa al bracket principal)
  ROUND_OF_128 = "ROUND_OF_128",
  ROUND_OF_64  = "ROUND_OF_64",
  ROUND_OF_32  = "ROUND_OF_32",
  ROUND_OF_16  = "ROUND_OF_16",
  QUARTERFINAL = "QUARTERFINAL",     // Cuartos de final (8 jugadores)
  SEMIFINAL    = "SEMIFINAL",        // Semifinal (4 jugadores)
  THIRD_PLACE  = "THIRD_PLACE",      // Partido por el tercer puesto
  FINAL        = "FINAL",            // Gran final
}
