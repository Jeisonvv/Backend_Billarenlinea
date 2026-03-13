import mongoose, { Document, Model, Schema } from "mongoose";
import { MatchStatus, RoundType } from "./enums.ts";

// ─────────────────────────────────────────────────────────────────────────────
// INTERFAZ PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Partido entre dos jugadores dentro de un torneo.
 *
 * Un Match puede representar:
 *   - Un partido de fase de grupos
 *   - Un partido de eliminación directa (cuartos, semifinal, final)
 *   - Un BYE (cuando un jugador avanza sin rival por número impar)
 *
 * La conexión entre partidos se hace con nextMatchId:
 *   Match 1 ──┐
 *              ├──▶ Match 5 (el ganador de 1 y 2 se enfrentan aquí)
 *   Match 2 ──┘
 */
export interface IMatch {
  tournament: mongoose.Types.ObjectId; // A qué torneo pertenece
  group?: mongoose.Types.ObjectId;     // A qué grupo pertenece (solo fase de grupos)

  roundType: RoundType;   // En qué ronda está (FINAL, SEMIFINAL, GROUP, etc.)
  roundOrder: number;     // Número de orden (1 = primera ronda, más alto = más avanzado)
  matchNumber: number;    // Número del partido dentro de la ronda (1, 2, 3...)

  player1?: mongoose.Types.ObjectId; // Primer jugador (undefined hasta que avance el ganador anterior)
  player2?: mongoose.Types.ObjectId; // Segundo jugador (undefined si es BYE)

  score1?: number; // Puntuación del player1 (se llena al registrar resultado)
  score2?: number; // Puntuación del player2

  winner?: mongoose.Types.ObjectId; // Quién ganó (se llena al registrar resultado)

  isBye: boolean; // true = player1 avanza automáticamente sin jugar

  // ID del partido al que va el ganador de este partido.
  // undefined = este partido ES la final
  nextMatchId?: mongoose.Types.ObjectId;

  status: MatchStatus;

  tableNumber?: number; // En qué mesa se juega
  scheduledAt?: Date;   // Cuándo está programado
  completedAt?: Date;   // Cuándo terminó

  notes?: string; // Notas del árbitro o admin

  createdAt: Date;
  updatedAt: Date;
}

export interface IMatchDocument extends IMatch, Document {}

export interface IMatchModel extends Model<IMatchDocument> {
  findByTournament(
    tournamentId: mongoose.Types.ObjectId
  ): Promise<IMatchDocument[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ESQUEMA
// ─────────────────────────────────────────────────────────────────────────────

const matchSchema = new Schema<IMatchDocument, IMatchModel>(
  {
    tournament: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
    },
    group: {
      type: Schema.Types.ObjectId,
      ref: "TournamentGroup",
    },
    roundType: {
      type: String,
      enum: Object.values(RoundType),
      required: true,
    },
    roundOrder: {
      type: Number,
      required: true,
      min: 0, // 0 = ronda de ajuste (previa), 1+ = rondas del bracket
    },
    matchNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    player1: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    player2: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    score1: {
      type: Number,
      min: 0,
    },
    score2: {
      type: Number,
      min: 0,
    },
    winner: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    isBye: {
      type: Boolean,
      default: false,
    },
    nextMatchId: {
      type: Schema.Types.ObjectId,
      ref: "Match",
    },
    status: {
      type: String,
      enum: Object.values(MatchStatus),
      default: MatchStatus.PENDING,
    },
    tableNumber: {
      type: Number,
      min: 1,
    },
    scheduledAt: Date,
    completedAt: Date,
    notes: String,
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

// Consulta más común: todos los partidos de un torneo ordenados por ronda
matchSchema.index({ tournament: 1, roundOrder: 1, matchNumber: 1 });

// Para buscar partidos de un grupo específico
matchSchema.index({ group: 1 });

// Para buscar partidos donde participa un jugador
matchSchema.index({ player1: 1 });
matchSchema.index({ player2: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// MÉTODOS ESTÁTICOS
// ─────────────────────────────────────────────────────────────────────────────

matchSchema.static(
  "findByTournament",
  function (tournamentId: mongoose.Types.ObjectId) {
    return this.find({ tournament: tournamentId })
      .populate("player1", "name avatarUrl")
      .populate("player2", "name avatarUrl")
      .populate("winner", "name avatarUrl")
      .populate("group", "name advanceCount")
      .sort({ roundOrder: 1, matchNumber: 1 });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTACIÓN
// ─────────────────────────────────────────────────────────────────────────────

const Match = mongoose.model<IMatchDocument, IMatchModel>("Match", matchSchema);

export default Match;
