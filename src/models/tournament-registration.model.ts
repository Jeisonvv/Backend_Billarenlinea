import mongoose, { Document, Model, Schema } from "mongoose";
import {
  Channel,
  PaymentMethod,
  PlayerCategory,
  RegistrationStatus,
} from "./enums.ts";

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inscripción de un jugador a un torneo específico.
 *
 * Este modelo es la RELACIÓN entre un usuario y un torneo.
 * Nos permite saber:
 *   - En qué torneos ha participado un usuario
 *   - Cuántos jugadores se inscribieron a un torneo
 *   - Si un jugador ya pagó su inscripción
 *   - En qué posición quedó al final
 *
 * El índice único { user, tournament } garantiza que un jugador
 * no pueda inscribirse dos veces al mismo torneo.
 */
export interface ITournamentRegistration {
  user: mongoose.Types.ObjectId;       // Qué jugador se inscribió
  tournament: mongoose.Types.ObjectId; // A qué torneo se inscribió

  status: RegistrationStatus; // Estado actual de la inscripción
  playerCategory: PlayerCategory; // Categoría del jugador al momento de inscribirse

  // Datos del pago (se llenan cuando el jugador paga la inscripción)
  paymentMethod?: PaymentMethod;
  paymentReference?: string; // Número de transferencia, comprobante, etc.
  paidAt?: Date;             // Cuándo se confirmó el pago

  // Se llena al terminar el torneo con la posición final del jugador
  // undefined = torneo en curso o no ha terminado
  finalPosition?: number;

  /**
   * Handicap del jugador en este torneo: cuántas carambolas debe hacer para ganar.
   *
   * Ejemplos:
   *   handicap = 30 → el jugador necesita anotar 30 carambolas para ganar el partido
   *   handicap = 50 → jugador de mayor nivel, necesita más para ganar
   *
   * Si no se define, se usa el objetivo estándar del torneo.
   */
  handicap?: number;

  channel: Channel; // Por qué canal se inscribió (WhatsApp o web)
  notes?: string;   // Notas adicionales (alergias, solicitudes especiales, etc.)

  createdAt: Date;
  updatedAt: Date;
}

/**
 * ITournamentRegistrationDocument: la interfaz + métodos de mongoose
 */
export interface ITournamentRegistrationDocument
  extends ITournamentRegistration,
    Document {}

/**
 * ITournamentRegistrationModel: tipo del modelo con métodos estáticos
 */
export interface ITournamentRegistrationModel
  extends Model<ITournamentRegistrationDocument> {
  findByUser(
    userId: mongoose.Types.ObjectId,
  ): Promise<ITournamentRegistrationDocument[]>;

  countByTournament(tournamentId: mongoose.Types.ObjectId): Promise<number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESQUEMA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

const tournamentRegistrationSchema = new Schema<
  ITournamentRegistrationDocument,
  ITournamentRegistrationModel
>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tournament: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(RegistrationStatus),
      default: RegistrationStatus.PENDING, // Empieza pendiente hasta confirmar el pago
    },
    playerCategory: {
      type: String,
      enum: Object.values(PlayerCategory),
      required: true, // Obligatorio: necesitamos saber en qué categoría compite
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
    },
    paymentReference: String,
    paidAt: Date,
    finalPosition: {
      type: Number,
      min: 1, // La posición mínima es 1 (primer lugar)
    },
    handicap: {
      type: Number,
      min: 1, // Al menos 1 carambola
    },
    channel: {
      type: String,
      enum: Object.values(Channel),
      required: true,
    },
    notes: String,
  },
  { timestamps: true },
);

// ─────────────────────────────────────────────────────────────────────────────
// ÍNDICES
// ─────────────────────────────────────────────────────────────────────────────

// Índice único compuesto: evita que un mismo usuario se inscriba
// dos veces al mismo torneo. Si intentas crear un duplicado,
// mongoose lanza un error antes de guardar.
tournamentRegistrationSchema.index(
  { user: 1, tournament: 1 },
  { unique: true },
);

// Para listar todas las inscripciones de un torneo filtradas por estado
// (ej: "dame todos los jugadores CONFIRMADOS del torneo X")
tournamentRegistrationSchema.index({ tournament: 1, status: 1 });

// Para ver el historial de torneos de un usuario
tournamentRegistrationSchema.index({ user: 1, status: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// MÉTODOS ESTÁTICOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve todos los torneos en los que ha participado un usuario.
 * Hace populate del torneo para incluir nombre, fecha, formato, etc.
 * Ordenado por más reciente primero.
 *
 * Ejemplo:
 *   const registrations = await TournamentRegistration.findByUser(user._id);
 *   // registrations[0].tournament → objeto Tournament completo
 *   // registrations[0].finalPosition → en qué posición quedó
 */
tournamentRegistrationSchema.statics.findByUser = function (
  userId: mongoose.Types.ObjectId,
): Promise<ITournamentRegistrationDocument[]> {
  return this.find({ user: userId })
    .populate("tournament") // Trae el objeto Tournament completo
    .sort({ createdAt: -1 });
};

/**
 * Cuenta cuántos jugadores CONFIRMADOS tiene un torneo.
 * Se usa para actualizar currentParticipants en el torneo
 * y para verificar si hay cupo antes de inscribir a alguien.
 *
 * Ejemplo:
 *   const count = await TournamentRegistration.countByTournament(tournament._id);
 *   if (count >= tournament.maxParticipants) { // torneo lleno }
 */
tournamentRegistrationSchema.statics.countByTournament = function (
  tournamentId: mongoose.Types.ObjectId,
): Promise<number> {
  return this.countDocuments({
    tournament: tournamentId,
    status: RegistrationStatus.CONFIRMED, // Solo contamos los que pagaron
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTACIÓN
// ─────────────────────────────────────────────────────────────────────────────

const TournamentRegistration = mongoose.model<
  ITournamentRegistrationDocument,
  ITournamentRegistrationModel
>("TournamentRegistration", tournamentRegistrationSchema);

export default TournamentRegistration;
