// ...existing code...
// ─────────────────────────────────────────────────────────────────────────────
// INDEX DE MODELOS
//
// Este archivo centraliza todas las exportaciones de modelos.
// En lugar de importar desde cada archivo por separado:
//   import User from "./models/user.model";
//   import Order from "./models/order.model";
//   import Raffle from "./models/raffle.model";
//
// Puedes importar todo desde un solo lugar:
//   import { User, Order, Raffle } from "./models";
//
// Esto hace el código más limpio y fácil de mantener.
// ─────────────────────────────────────────────────────────────────────────────

// Enums: valores fijos compartidos entre todos los modelos
export * from "./enums.ts";

// Modelos de usuario
export { default as User } from "./user.model.ts";
export type { IUser, IUserDocument, IUserModel, IIdentity, IWebAuth, IConsent, IInterest, IConversationState } from "./user.model.ts";

// Modelo de productos
export { default as Product } from "./product.model.ts";
export type { IProduct, IProductDocument, IProductVariant } from "./product.model.ts";

// Modelo de pedidos
export { default as Order } from "./order.model.ts";
export type { IOrder, IOrderDocument, IOrderModel, IOrderItem } from "./order.model.ts";

// Modelo de torneos
export { default as Tournament } from "./tournament.model.ts";
export type { ITournament, ITournamentDocument, IPrize } from "./tournament.model.ts";

// Modelo de inscripciones a torneos
export { default as TournamentRegistration } from "./tournament-registration.model.ts";
export type { ITournamentRegistration, ITournamentRegistrationDocument, ITournamentRegistrationModel } from "./tournament-registration.model.ts";

// Modelo de rifas
export { default as Raffle } from "./raffle.model.ts";
export type { IRaffle, IRaffleDocument } from "./raffle.model.ts";

// Modelo de boletos de rifa
export { default as RaffleTicket } from "./raffle-ticket.model.ts";
export type { IRaffleTicket, IRaffleTicketDocument, IRaffleTicketModel } from "./raffle-ticket.model.ts";

// Modelo de transmisiones
export { default as Transmission } from "./transmission-request.model.ts";
export type { ITransmission, ITransmissionDocument } from "./transmission-request.model.ts";

// Modelo de partidos
export { default as Match } from "./match.model.ts";
export type { IMatch, IMatchDocument, IMatchModel } from "./match.model.ts";

// Modelo de grupos de torneo
export { default as TournamentGroup } from "./tournament-group.model.ts";
export type { ITournamentGroup, ITournamentGroupDocument, IGroupStanding } from "./tournament-group.model.ts";
