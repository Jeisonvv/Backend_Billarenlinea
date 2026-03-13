/**
 * controllers/match.controller.ts — HTTP handlers de partidos
 *
 * Responsabilidad única: procesar la petición HTTP y delegar
 * toda la lógica al match.service.
 *
 * Endpoints:
 *   GET  /api/matches/tournament/:id  → getMatchesByTournament
 *   GET  /api/matches/:id             → getMatchById
 *   POST /api/matches/:id/result      → recordMatchResult
 */
import type { Request, Response } from "express";
import {
  getMatchesByTournamentService,
  recordMatchResultService,
  getMatchByIdService,
} from "../services/match.service.ts";

// ─────────────────────────────────────────────────────────────────────────────
// GET /matches/tournament/:id
// Devuelve todos los partidos de un torneo agrupados por ronda
// ─────────────────────────────────────────────────────────────────────────────
export async function getMatchesByTournament(req: Request, res: Response) {
  try {
    const data = await getMatchesByTournamentService(req.params.id as string);
    res.json({ ok: true, data });
  } catch (error: any) {
    console.error("[getMatchesByTournament] ERROR:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /matches/:id/result
// Registra resultado de un partido. Auto-detecta si es de grupos o eliminación.
// Body: { score1: number, score2: number }
// ─────────────────────────────────────────────────────────────────────────────
export async function recordMatchResult(req: Request, res: Response) {
  try {
    const { score1, score2 } = req.body as { score1: number; score2: number };
    if (score1 === undefined || score2 === undefined) {
      return res.status(400).json({ ok: false, message: "Se requieren score1 y score2." });
    }
    const { result, isChampion } = await recordMatchResultService(req.params.id as string, score1, score2);
    res.json({
      ok: true,
      // isChampion es true cuando el partido era la final del torneo
      message: isChampion ? "El torneo ha finalizado. Hay un campeón." : "Resultado registrado. El ganador avanzó al siguiente partido.",
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /matches/:id
// Detalle de un partido con jugadores y siguiente partido populados
// ─────────────────────────────────────────────────────────────────────────────
export async function getMatchById(req: Request, res: Response) {
  try {
    const match = await getMatchByIdService(req.params.id as string);
    res.json({ ok: true, data: match });
  } catch (error: any) {
    const status = error.message === "Partido no encontrado." ? 404 : 500;
    res.status(status).json({ ok: false, message: error.message });
  }
}
