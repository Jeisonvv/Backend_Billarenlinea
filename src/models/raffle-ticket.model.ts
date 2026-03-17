import mongoose, { Document, Model, Schema } from "mongoose";
import { Channel, PaymentMethod, PaymentProvider, PaymentTransactionStatus, RaffleNumberStatus, TicketStatus } from "./enums.ts";
import Raffle from "./raffle.model.ts";
import RaffleNumber, { normalizeRaffleNumberInput } from "./raffle-number.model.ts";
import User from "./user.model.ts";

const DEFAULT_RESERVATION_MINUTES = Number(process.env.RAFFLE_RESERVATION_MINUTES ?? 15);

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Boletos de rifa comprados por un usuario en una transacción.
 *
 * Un RaffleTicket representa UNA COMPRA, que puede incluir
 * uno o varios boletos a la vez.
 *
 * Ejemplo: Juan compra 5 boletos de la rifa "Taco Predator":
 *   {
 *     raffle: ObjectId("rifa-predator"),
 *     user: ObjectId("juan"),
 *     numbers: ["14", "27", "53", "61", "88"],  ← los 5 números que le tocaron
 *     quantity: 5,
 *     unitPrice: 10000,
 *     total: 50000,
 *     status: "PAID"
 *   }
 *
 * Para saber los boletos de Juan en esa rifa:
 *   await RaffleTicket.findNumbersByUserAndRaffle(juan._id, rifa._id)
 *   // → ["14", "27", "53", "61", "88"]
 *
 * Si Juan hace otra compra después, se crea un NUEVO documento RaffleTicket,
 * no se modifica el anterior. Así mantenemos el historial de cada transacción.
 */
export interface IRaffleTicket {
  raffle: mongoose.Types.ObjectId; // A qué rifa pertenecen estos boletos
  user: mongoose.Types.ObjectId;   // Quién compró los boletos

  numbers: string[]; // Array con los números de boleto comprados en esta transacción
  quantity: number;  // Cuántos boletos se compraron (debe coincidir con numbers.length)

  unitPrice: number; // Precio por boleto al momento de comprar (snapshot)
  total: number;     // quantity × unitPrice

  status: TicketStatus; // Estado actual de los boletos

  // Datos del pago
  paymentMethod?: PaymentMethod;
  paymentReference?: string; // Comprobante de pago, número de transferencia, etc.
  paidAt?: Date;             // Cuándo se confirmó el pago
  paymentProvider?: PaymentProvider;
  paymentStatus?: PaymentTransactionStatus;
  paymentTransactionId?: string;
  reservedUntil?: Date;

  channel: Channel; // Por qué canal compró (WhatsApp, web, etc.)

  // true si alguno de los numbers de esta compra fue el número ganador
  // Se actualiza cuando se realiza el sorteo
  isWinner: boolean;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * IRaffleTicketDocument: IRaffleTicket + métodos de mongoose
 */
export interface IRaffleTicketDocument extends IRaffleTicket, Document {}

/**
 * IRaffleTicketModel: tipo del modelo con métodos estáticos
 */
export interface IRaffleTicketModel extends Model<IRaffleTicketDocument> {
  findByUser(
    userId: mongoose.Types.ObjectId,
  ): Promise<IRaffleTicketDocument[]>;

  findByRaffle(
    raffleId: mongoose.Types.ObjectId,
  ): Promise<IRaffleTicketDocument[]>;

  findNumbersByUserAndRaffle(
    userId: mongoose.Types.ObjectId,
    raffleId: mongoose.Types.ObjectId,
  ): Promise<string[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESQUEMA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

const raffleTicketSchema = new Schema<
  IRaffleTicketDocument,
  IRaffleTicketModel
>(
  {
    raffle: {
      type: Schema.Types.ObjectId,
      ref: "Raffle",
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    numbers: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: "Debe haber al menos un número de boleto.",
      },
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: Object.values(TicketStatus),
      default: TicketStatus.RESERVED, // Al comprar empieza reservado hasta confirmar el pago
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
    },
    paymentProvider: {
      type: String,
      enum: Object.values(PaymentProvider),
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PaymentTransactionStatus),
    },
    paymentTransactionId: String,
    paymentReference: String,
    paidAt: Date,
    reservedUntil: Date,
    channel: {
      type: String,
      enum: Object.values(Channel),
      required: true,
    },
    isWinner: {
      type: Boolean,
      default: false, // false hasta que se realice el sorteo
    },
  },
  { timestamps: true },
);

raffleTicketSchema.pre("validate", async function () {
  if (!this.raffle) {
    throw new Error("La rifa es obligatoria.");
  }

  const raffle = await Raffle.findById(this.raffle).select("ticketPrice totalTickets");
  if (!raffle) {
    throw new Error("La rifa no existe.");
  }

  const normalizedNumbers = this.numbers.map((numberValue) => normalizeRaffleNumberInput(numberValue, raffle.totalTickets));
  const uniqueNumbers = new Set(normalizedNumbers);

  if (uniqueNumbers.size !== normalizedNumbers.length) {
    throw new Error("No puedes repetir números dentro de la misma compra.");
  }

  if (raffle.ticketPrice === 0) {
    const participant = await User.findById(this.user)
      .select("_id deletedAt identityDocument")
      .lean();

    if (!participant || participant.deletedAt) {
      throw new Error("El usuario no existe.");
    }

    if (!participant.identityDocument) {
      throw new Error("El usuario debe tener documento de identidad registrado para participar en rifas gratuitas.");
    }

    if (normalizedNumbers.length !== 1) {
      throw new Error("En una rifa gratuita cada usuario solo puede obtener un número.");
    }

    if (this.status !== TicketStatus.PAID) {
      throw new Error("Los boletos de rifas gratuitas deben confirmarse inmediatamente.");
    }

    const matchingUsers = await User.find({
      identityDocument: participant.identityDocument,
      deletedAt: { $exists: false },
    })
      .select("_id")
      .lean();

    const existingFreeTicket = await RaffleTicket.exists({
      _id: { $ne: this._id },
      raffle: this.raffle,
      user: { $in: matchingUsers.map((entry) => entry._id) },
      status: { $ne: TicketStatus.CANCELLED },
    });

    if (existingFreeTicket) {
      throw new Error("Ya existe una participación para este documento de identidad en esta rifa gratuita.");
    }
  }

  const availableCount = await RaffleNumber.countDocuments({
    raffle: this.raffle,
    number: { $in: normalizedNumbers },
    status: RaffleNumberStatus.AVAILABLE,
  });

  if (availableCount !== normalizedNumbers.length) {
    throw new Error("Uno o más números ya no están disponibles.");
  }

  this.numbers = normalizedNumbers;
  this.quantity = normalizedNumbers.length;
  this.unitPrice = raffle.ticketPrice;
  this.total = this.quantity * this.unitPrice;

  if (this.status === TicketStatus.PAID && !this.paidAt) {
    this.paidAt = new Date();
  }

  if (this.status === TicketStatus.RESERVED && !this.reservedUntil) {
    this.reservedUntil = new Date(Date.now() + DEFAULT_RESERVATION_MINUTES * 60 * 1000);
  }
});

raffleTicketSchema.pre("save", async function () {
  if (!this.isNew) return;

  const now = new Date();
  const targetNumberStatus = this.status === TicketStatus.PAID
    ? RaffleNumberStatus.PAID
    : RaffleNumberStatus.RESERVED;

  const updateResult = await RaffleNumber.updateMany(
    {
      raffle: this.raffle,
      number: { $in: this.numbers },
      status: RaffleNumberStatus.AVAILABLE,
    },
    {
      $set: {
        status: targetNumberStatus,
        user: this.user,
        ticket: this._id,
        reservedAt: now,
        ...(this.status === TicketStatus.PAID ? { paidAt: this.paidAt ?? now } : {}),
      },
    },
  );

  if (updateResult.modifiedCount !== this.numbers.length) {
    throw new Error("No fue posible bloquear todos los números solicitados.");
  }

  if (this.status === TicketStatus.PAID) {
    await Raffle.updateOne(
      { _id: this.raffle },
      { $inc: { soldTickets: this.numbers.length } },
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ÍNDICES
// ─────────────────────────────────────────────────────────────────────────────

// Para ver todas las compras de un usuario en una rifa específica
raffleTicketSchema.index({ raffle: 1, user: 1 });

// Para verificar si un número ya fue vendido antes de asignarlo.
// Si alguien intenta comprar el número 14 de la rifa X, buscan en este índice.
raffleTicketSchema.index({ raffle: 1, numbers: 1 });

// Para el historial de rifas de un usuario filtrado por estado
raffleTicketSchema.index({ user: 1, status: 1 });

// Para reconciliar pagos externos y evitar referencias duplicadas
raffleTicketSchema.index({ paymentReference: 1 }, { unique: true, sparse: true });

// Para liberar reservas vencidas y consultar pagos por proveedor
raffleTicketSchema.index({ status: 1, reservedUntil: 1 });
raffleTicketSchema.index({ paymentProvider: 1, paymentTransactionId: 1 }, { sparse: true });

// Para encontrar rápidamente el boleto ganador después del sorteo
raffleTicketSchema.index({ raffle: 1, isWinner: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// MÉTODOS ESTÁTICOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve todos los boletos comprados por un usuario en todas las rifas.
 * Hace populate de la rifa para incluir nombre, premio, fecha del sorteo, etc.
 *
 * Ejemplo:
 *   const tickets = await RaffleTicket.findByUser(user._id);
 *   tickets[0].raffle  // → objeto Raffle completo (nombre, premio, etc.)
 *   tickets[0].numbers // → ["14", "27", "53"] (números comprados en esa transacción)
 */
raffleTicketSchema.statics.findByUser = function (
  userId: mongoose.Types.ObjectId,
): Promise<IRaffleTicketDocument[]> {
  return this.find({ user: userId })
    .populate("raffle") // Trae el objeto Raffle completo
    .sort({ createdAt: -1 }); // Más recientes primero
};

/**
 * Devuelve todos los boletos PAGADOS de una rifa específica.
 * Útil para el admin al momento de realizar el sorteo:
 * ver quién participó y con qué números.
 *
 * Ejemplo:
 *   const tickets = await RaffleTicket.findByRaffle(raffle._id);
 *   // tickets tiene todos los compradores con sus números
 */
raffleTicketSchema.statics.findByRaffle = function (
  raffleId: mongoose.Types.ObjectId,
): Promise<IRaffleTicketDocument[]> {
  return this.find({
    raffle: raffleId,
    status: TicketStatus.PAID, // Solo los pagados (no los reservados sin pagar)
  })
    .populate("user") // Trae el usuario para saber quién es cada comprador
    .sort({ createdAt: 1 }); // Orden cronológico (primero quien compró antes)
};

/**
 * Devuelve TODOS los números que tiene un usuario en una rifa específica.
 * Agrupa todas sus compras y aplana los arrays de numbers en uno solo.
 *
 * Ejemplo:
 *   // Juan hizo 2 compras: [14, 27] y después [53, 61]
 *   const nums = await RaffleTicket.findNumbersByUserAndRaffle(juan._id, rifa._id);
 *   // → ["14", "27", "53", "61"]  (todos sus números juntos)
 *
 * Uso típico: mostrarle al usuario "tus números son: 14, 27, 53, 61"
 */
raffleTicketSchema.statics.findNumbersByUserAndRaffle = async function (
  userId: mongoose.Types.ObjectId,
  raffleId: mongoose.Types.ObjectId,
): Promise<string[]> {
  const tickets = await this.find({
    user: userId,
    raffle: raffleId,
    status: TicketStatus.PAID, // Solo contamos los pagados
  });

  // flatMap aplana el array de arrays en uno solo:
  // [[14, 27], [53, 61]] → [14, 27, 53, 61]
  return tickets.flatMap((t: IRaffleTicketDocument) => t.numbers);
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTACIÓN
// ─────────────────────────────────────────────────────────────────────────────

const RaffleTicket = mongoose.model<
  IRaffleTicketDocument,
  IRaffleTicketModel
>("RaffleTicket", raffleTicketSchema);

export default RaffleTicket;
