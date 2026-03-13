import mongoose from "mongoose";
import Match from "../models/match.model.ts";
import { advanceWinner, recordGroupResult } from "./bracket.service.ts";
import { RoundType } from "../models/enums.ts";

// ─────────────────────────────────────────────────────────────────────────────
// SERVICIOS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve todos los partidos de un torneo agrupados por ronda.
 */
export async function getMatchesByTournamentService(tournamentId: string) {
  const oid = new mongoose.Types.ObjectId(tournamentId);
  const matches = await Match.findByTournament(oid);

  // Agrupar por ronda para facilitar el render del bracket en el frontend
  const byRound = matches.reduce<Record<string, object[]>>((acc, match) => {
    const key = `${match.roundOrder}-${match.roundType}`;
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(match);
    return acc;
  }, {});

  return { total: matches.length, byRound, flat: matches };
}

/**
 * Registra el resultado de un partido.
 * - Si es de fase de grupos: actualiza standings del grupo.
 * - Si es de eliminación: avanza al ganador al siguiente partido.
 */
export async function recordMatchResultService(
  matchId: string,
  score1: number,
  score2: number
) {
  const oid = new mongoose.Types.ObjectId(matchId);

  const match = await Match.findById(oid);
  if (!match) throw new Error("Partido no encontrado.");

  if (match.roundType === RoundType.GROUP) {
    const result = await recordGroupResult(oid, score1, score2);
    return { result, isChampion: false };
  }

  const result = await advanceWinner(oid, score1, score2);
  const isChampion = !!(result as { champion?: object }).champion;
  return { result, isChampion };
}

/**
 * Devuelve el detalle de un partido con todos los jugadores populados.
 */
export async function getMatchByIdService(id: string) {
  const match = await Match.findById(id)
    .populate("player1", "name avatarUrl playerCategory")
    .populate("player2", "name avatarUrl playerCategory")
    .populate("winner", "name avatarUrl")
    .populate("group", "name advanceCount")
    .populate("nextMatchId", "roundType matchNumber status")
    .lean();

  if (!match) throw new Error("Partido no encontrado.");
  return match;
}
