import mongoose, { Document, Schema } from "mongoose";
import { RaffleStatus } from "./enums.ts";
import RaffleNumber, { isPowerOfTen } from "./raffle-number.model.ts";

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rifa organizada por el negocio.
 *
 * Una rifa tiene una cantidad fija de boletos numerados.
 * Los usuarios compran uno o varios boletos (ver RaffleTicket).
 * En la fecha del sorteo se elige un número ganador al azar.
 *
 * Ciclo de vida típico:
 *   DRAFT → ACTIVE (empezar venta) → CLOSED (cerrar venta) → DRAWN (sortear)
 */
export interface IRaffle {
  name: string;
  description?: string;
  status: RaffleStatus;

  prize: string;          // Descripción del premio (ej: "Taco Predator REVO + maletín")
  prizeImageUrl?: string; // Foto del premio

  ticketPrice: number; // Precio por boleto
  totalTickets: number; // Cantidad total de boletos disponibles (10, 100, 1000, 10000, ...)
  soldTickets: number;  // Cuántos boletos han sido PAGADOS hasta ahora

  drawDate: Date; // Fecha y hora en que se realizará el sorteo

  // Se llenan DESPUÉS del sorteo
  winnerTicket?: string;                 // Número del boleto ganador respetando ceros a la izquierda
  winner?: mongoose.Types.ObjectId;      // Usuario ganador (ref a User)

  imageUrl?: string; // Imagen promocional de la rifa

  // Quién creó la rifa (admin o staff)
  createdBy: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * IRaffleDocument: IRaffle + métodos de mongoose + virtuals
 */
export interface IRaffleDocument extends IRaffle, Document {
  // Virtual: boletos que aún están disponibles para comprar
  readonly availableTickets: number;

  // Virtual: true si ya se vendieron todos los boletos
  readonly isSoldOut: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESQUEMA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

const raffleSchema = new Schema<IRaffleDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: String,
    status: {
      type: String,
      enum: Object.values(RaffleStatus),
      default: RaffleStatus.DRAFT, // Empieza como borrador hasta que la actives
    },
    prize: {
      type: String,
      required: true,
    },
    prizeImageUrl: String,
    ticketPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    totalTickets: {
      type: Number,
      required: true,
      min: 10,
      validate: {
        validator: isPowerOfTen,
        message: "totalTickets debe ser una potencia de 10 (10, 100, 1000, ...).",
      },
    },
    soldTickets: {
      type: Number,
      default: 0,
      min: 0,
    },
    drawDate: {
      type: Date,
      required: true,
    },
    winnerTicket: String,
    winner: {
      type: Schema.Types.ObjectId,
      ref: "User", // Referencia al usuario que ganó
    },
    imageUrl: String,
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// ÍNDICES
// ─────────────────────────────────────────────────────────────────────────────

// Para listar rifas activas ordenadas por fecha de sorteo (las más próximas primero)
raffleSchema.index({ status: 1, drawDate: 1 });

raffleSchema.pre("save", function () {
  if (!this.isNew && this.isModified("totalTickets")) {
    throw new Error("No puedes cambiar totalTickets después de crear la rifa.");
  }

  if (this.soldTickets > this.totalTickets) {
    throw new Error("soldTickets no puede ser mayor que totalTickets.");
  }

  this.$locals.wasNew = this.isNew;
});

raffleSchema.post("save", async function (doc) {
  if (!doc.$locals.wasNew) return;

  await RaffleNumber.generateForRaffle(doc._id, doc.totalTickets);
});

// ─────────────────────────────────────────────────────────────────────────────
// VIRTUALS
// ─────────────────────────────────────────────────────────────────────────────

// Boletos disponibles = total - vendidos
// Se calcula en tiempo real para mostrar "quedan X boletos"
raffleSchema.virtual("availableTickets").get(function (this: IRaffleDocument) {
  return this.totalTickets - this.soldTickets;
});

// true si ya no quedan boletos disponibles
raffleSchema.virtual("isSoldOut").get(function (this: IRaffleDocument) {
  return this.soldTickets >= this.totalTickets;
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTACIÓN
// ─────────────────────────────────────────────────────────────────────────────

const Raffle = mongoose.model<IRaffleDocument>("Raffle", raffleSchema);

export default Raffle;
