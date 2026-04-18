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
export * from "./enums.js";

// Modelos de usuario
export { default as User } from "./user.model.js";
export type { IUser, IUserDocument, IUserModel, IIdentity, IWebAuth, IConsent, IInterest, IConversationState } from "./user.model.js";

// Modelo de productos
export { default as Product } from "./product.model.js";
export type { IProduct, IProductDocument, IProductVariant } from "./product.model.js";

// Modelo de pedidos
export { default as Order } from "./order.model.js";
export type { IOrder, IOrderDocument, IOrderModel, IOrderItem } from "./order.model.js";

// Modelo central de transacciones de pago
export { default as PaymentTransaction } from "./payment-transaction.model.js";
export type {
	IPaymentTransaction,
	IPaymentTransactionDocument,
	IPaymentTransactionModel,
} from "./payment-transaction.model.js";

// Modelo de torneos
export { default as Tournament } from "./tournament.model.js";
export type { ITournament, ITournamentDocument, IPrize } from "./tournament.model.js";

// Modelo de eventos
export { default as Event } from "./event.model.js";
export type { IEvent, IEventDocument, IEventPrize } from "./event.model.js";

// Modelo de posts del blog
export { default as Post } from "./post.model.js";
export type { IPost, IPostDocument } from "./post.model.js";

// Modelo de inscripciones a torneos
export { default as TournamentRegistration } from "./tournament-registration.model.js";
export type { ITournamentRegistration, ITournamentRegistrationDocument, ITournamentRegistrationModel } from "./tournament-registration.model.js";

// Modelo de rifas
export { default as Raffle } from "./raffle.model.js";
export type { IRaffle, IRaffleDocument } from "./raffle.model.js";

// Modelo de números de rifa
export { default as RaffleNumber } from "./raffle-number.model.js";
export type { IRaffleNumber, IRaffleNumberDocument, IRaffleNumberModel } from "./raffle-number.model.js";

// Modelo de boletos de rifa
export { default as RaffleTicket } from "./raffle-ticket.model.js";
export type { IRaffleTicket, IRaffleTicketDocument, IRaffleTicketModel } from "./raffle-ticket.model.js";

// Modelo de transmisiones
export { default as Transmission } from "./transmission-request.model.js";
export type { ITransmission, ITransmissionDocument } from "./transmission-request.model.js";

// Modelo de partidos
export { default as Match } from "./match.model.js";
export type { IMatch, IMatchDocument, IMatchModel } from "./match.model.js";

// Modelo de grupos de torneo
export { default as TournamentGroup } from "./tournament-group.model.js";
export type { ITournamentGroup, ITournamentGroupDocument, IGroupStanding } from "./tournament-group.model.js";
