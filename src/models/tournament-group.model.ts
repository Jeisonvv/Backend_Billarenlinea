import mongoose, { Document, Schema } from "mongoose";

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Posición de un jugador dentro de la tabla del grupo.
 * Se actualiza automáticamente al registrar resultados.
 */
export interface IGroupStanding {
  player: mongoose.Types.ObjectId; // Referencia al usuario
  played: number;   // Partidos jugados
  wins: number;     // Victorias
  losses: number;   // Derrotas
  points: number;   // Puntos acumulados (2 por victoria, 0 por derrota)
  position?: number; // Posición en la tabla (1 = primero del grupo)
  handicap?: number; // Carambolas requeridas para ganar (de TournamentRegistration)
}

/**
 * Grupo de la fase inicial de un torneo.
 *
 * En un torneo de 16 jugadores con 4 grupos:
 *   Grupo A: jugadores 1,2,3,4  → los 2 primeros pasan a eliminatorias
 *   Grupo B: jugadores 5,6,7,8  → los 2 primeros pasan a eliminatorias
 *   ...
 *
 * Los partidos del grupo están en la colección Match (group: this._id).
 */
export interface ITournamentGroup {
  tournament: mongoose.Types.ObjectId; // A qué torneo pertenece
  name: string;        // Nombre del grupo: "A", "B", "C", "D"...
  players: mongoose.Types.ObjectId[]; // Jugadores del grupo (refs a User)

  tableNumber?: number; // Mesa asignada al grupo
  startTime?: Date;     // Hora de inicio del grupo

  // Tabla de posiciones del grupo. Se recalcula al registrar cada resultado.
  standings: IGroupStanding[];

  // Cuántos jugadores del grupo avanzan a la fase eliminatoria
  // Por defecto 2 (los 2 primeros del grupo pasan)
  advanceCount: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface ITournamentGroupDocument extends ITournamentGroup, Document {}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-ESQUEMA DE STANDING (posición en tabla)
// ─────────────────────────────────────────────────────────────────────────────

const groupStandingSchema = new Schema<IGroupStanding>(
  {
    player: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    played: { type: Number, default: 0, min: 0 },
    wins: { type: Number, default: 0, min: 0 },
    losses: { type: Number, default: 0, min: 0 },
    points: { type: Number, default: 0, min: 0 },
    position: { type: Number, min: 1 },
    handicap: { type: Number, min: 1 },
  },
  { _id: false } // Sin _id propio por cada standing
);

// ─────────────────────────────────────────────────────────────────────────────
// ESQUEMA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

const tournamentGroupSchema = new Schema<ITournamentGroupDocument>(
  {
    tournament: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      uppercase: true, // Siempre en mayúscula: "A", "B", "C"
    },
    players: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    tableNumber: {
      type: Number,
      min: 1,
    },
    startTime: Date,
    standings: {
      type: [groupStandingSchema],
      default: [],
    },
    advanceCount: {
      type: Number,
      default: 2, // Los 2 primeros del grupo pasan por defecto
      min: 1,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// ÍNDICES
// ─────────────────────────────────────────────────────────────────────────────

// Nombre único por torneo: no puede haber dos grupos "A" en el mismo torneo
tournamentGroupSchema.index({ tournament: 1, name: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTACIÓN
// ─────────────────────────────────────────────────────────────────────────────

const TournamentGroup = mongoose.model<ITournamentGroupDocument>(
  "TournamentGroup",
  tournamentGroupSchema
);

export default TournamentGroup;
