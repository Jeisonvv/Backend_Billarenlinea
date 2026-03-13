import mongoose, { Document, Schema } from "mongoose";
import { PlayerCategory, TournamentStatus, TournamentFormat } from "./enums.ts";

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Premio para una posición del torneo.
 *
 * Ejemplo:
 *   { position: 1, description: "Taco Predator + $1.000.000", amount: 1000000 }
 *   { position: 2, description: "Juego de bolas Diamond",     amount: 0 }
 *   { position: 3, description: "Tiza Viking x12",            amount: 0 }
 */
export interface IPrize {
  position: number;    // Número de posición (1 = campeón, 2 = subcampeón, etc.)
  description: string; // Descripción completa del premio
  amount?: number;     // Monto en pesos si hay premio en efectivo (opcional)
}

/**
 * Torneo de billar.
 *
 * Ciclo de vida típico:
 *   DRAFT → OPEN (abres inscripciones) → CLOSED → IN_PROGRESS → FINISHED
 */
export interface ITournament {
  name: string;
  description?: string;
  format: TournamentFormat;       // Cómo se estructura la competencia
  status: TournamentStatus;       // En qué etapa está el torneo

  allowedCategories: PlayerCategory[]; // Qué categorías pueden inscribirse
  maxParticipants: number;             // Cupo máximo de jugadores
  currentParticipants: number;         // Cuántos se han inscrito y confirmado

  entryFee: number; // Costo de inscripción (0 si es gratis)
  prizes: IPrize[]; // Lista de premios por posición

  startDate: Date;             // Cuándo empieza el torneo
  endDate?: Date;              // Cuándo termina (se llena cuando finaliza)
  registrationDeadline: Date;  // Fecha límite para inscribirse

  location?: string;   // Dirección del lugar si es presencial
  streamUrl?: string;  // Link de YouTube/Facebook si hay transmisión
  imageUrl?: string;   // Imagen promocional del torneo

  /**
   * Cuántos jugadores van en cada grupo de la fase inicial.
   * Solo aplica cuando format = GROUPS o GROUPS_AND_ELIMINATION.
   *
   * Ejemplos:
   *   3 → grupos de 3 (cada jugador juega 2 partidos de grupo)
   *   4 → grupos de 4 (cada jugador juega 3 partidos de grupo)  ← lo más común
   *   5 → grupos de 5 (cada jugador juega 4 partidos de grupo)
   *
   * Si no se establece, el servicio usará 3 por defecto.
   */
  playersPerGroup?: number;

  /**
   * Si true, cada jugador tiene un handicap diferente (carambolas requeridas para ganar).
   * Si false, todos los jugadores hacen las mismas carambolas (sin handicap).
   * Default: false
   */
  withHandicap: boolean;

  // Quién creó el torneo (debe ser un admin o staff)
  createdBy: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * ITournamentDocument: ITournament + métodos de mongoose + virtuals
 */
export interface ITournamentDocument extends ITournament, Document {
  // Virtual: true si el torneo ya está lleno (currentParticipants >= maxParticipants)
  readonly isFull: boolean;

  // Virtual: true si las inscripciones están abiertas Y la fecha límite no pasó
  readonly isRegistrationOpen: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-ESQUEMA DE PREMIO
// ─────────────────────────────────────────────────────────────────────────────

const prizeSchema = new Schema<IPrize>(
  {
    position: {
      type: Number,
      required: true,
      min: 1, // La posición mínima es 1 (primer lugar)
    },
    description: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      min: 0,
    },
  },
  { _id: false }, // Sin _id propio para cada premio
);

// ─────────────────────────────────────────────────────────────────────────────
// ESQUEMA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

const tournamentSchema = new Schema<ITournamentDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: String,
    format: {
      type: String,
      enum: Object.values(TournamentFormat),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(TournamentStatus),
      default: TournamentStatus.DRAFT, // Empieza como borrador hasta que lo publiques
    },
    allowedCategories: {
      type: [String],
      enum: Object.values(PlayerCategory),
      default: [], // Vacío = todas las categorías pueden inscribirse
    },
    maxParticipants: {
      type: Number,
      required: true,
      min: 2, // Un torneo necesita al menos 2 participantes
    },
    currentParticipants: {
      type: Number,
      default: 0,
      min: 0,
    },
    entryFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    prizes: {
      type: [prizeSchema],
      default: [],
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: Date,
    registrationDeadline: {
      type: Date,
      required: true,
    },
    location: String,
    streamUrl: String,
    imageUrl: String,
    playersPerGroup: {
      type: Number,
      min: 3,  // Mínimo 3 jugadores por grupo
      max: 5,  // Máximo 5 jugadores por grupo
      // Por defecto no se establece; el servicio asume 4 si no está definido
    },
    withHandicap: {
      type: Boolean,
      default: false, // Por defecto sin handicap (todos hacen las mismas carambolas)
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User", // Referencia al admin/staff que creó el torneo
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

// Para listar torneos próximos o en curso (la query más común en la web)
tournamentSchema.index({ status: 1, startDate: 1 });

// Para filtrar torneos por categoría de jugador cuando un usuario quiere inscribirse
tournamentSchema.index({ allowedCategories: 1, status: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// VIRTUALS
// ─────────────────────────────────────────────────────────────────────────────

// true si el torneo ya llegó al máximo de participantes confirmados
tournamentSchema.virtual("isFull").get(function (this: ITournamentDocument) {
  return this.currentParticipants >= this.maxParticipants;
});

// true si se puede inscribir alguien más:
// - El torneo debe estar en estado OPEN
// - La fecha límite de inscripción no debe haber pasado
// - Se usa con isFull para mostrar "Inscríbete" o "Cupos llenos" en la web
tournamentSchema.virtual("isRegistrationOpen").get(function (
  this: ITournamentDocument,
) {
  const deadlineNotPassed = new Date() <= this.registrationDeadline;
  return this.status === TournamentStatus.OPEN && deadlineNotPassed;
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTACIÓN
// ─────────────────────────────────────────────────────────────────────────────

const Tournament = mongoose.model<ITournamentDocument>(
  "Tournament",
  tournamentSchema,
);

export default Tournament;
