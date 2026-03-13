/**
 * routes/match.routes.ts — Rutas de partidos
 *
 * Base: /api/matches
 *
 *   GET  /tournament/:id    → Todos los partidos de un torneo agrupados por ronda
 *   GET  /:id               → Detalle de un partido con jugadores populados
 *   POST /:id/result        → Registrar resultado (auto-detecta si es grupo o eliminación)
 */
import { Router } from "express";
import {
  getMatchesByTournament,
  recordMatchResult,
  getMatchById,
} from "../controllers/match.controller.ts";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.ts";
import { UserRole } from "../models/enums.ts";

const router = Router();

// Todos los partidos de un torneo, organizados por ronda
router.get("/tournament/:id", getMatchesByTournament);

// Detalle de un partido individual
router.get("/:id",            getMatchById);

// Registrar resultado — solo ADMIN o STAFF pueden registrar resultados
router.post("/:id/result",    requireAuth, requireRole(UserRole.ADMIN, UserRole.STAFF), recordMatchResult);

export default router;
