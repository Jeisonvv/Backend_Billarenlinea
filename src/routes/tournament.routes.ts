/**
 * routes/tournament.routes.ts — Rutas de torneos
 *
 * Base: /api/tournaments
 *
 * ── CRUD base ─────────────────────────────────────────────────────────────
 *   POST  /                              → Crear torneo
 *   GET   /                              → Listar torneos (filtros: status, format, page, limit)
 *   GET   /:id                           → Detalle completo (inscripciones + grupos)
 *   GET   /:id/registrations             → Lista de inscritos (filtro opcional: ?status=CONFIRMED)
 *
 * ── Bracket de eliminación directa ────────────────────────────────────────
 *   POST  /:id/generate-bracket          → Genera bracket desde inscritos CONFIRMED
 *
 * ── Fase de grupos ────────────────────────────────────────────────────────
 *   POST  /:id/groups                    → Crear grupos manual (body: { groups: [...] })
 *   POST  /:id/auto-groups               → Crear grupos automáticamente (body: { playersPerGroup: 3 })
 *   POST  /:id/generate-bracket-from-groups → Genera bracket eliminatorio desde clasificados
 *
 * ── Notificaciones ────────────────────────────────────────────────────────
 *   POST  /:id/notify-groups             → Prepara info de notificación por grupo (WhatsApp/email)
 */
import { Router } from "express";
import {
  createTournament,
  getTournaments,
  getTournamentById,
  getTournamentRegistrations,
  registerPlayerHandler,
  generateBracketHandler,
  createGroupsHandler,
  autoCreateGroupsHandler,
  generateBracketFromGroupsHandler,
  generateAdjustmentRoundHandler,
  getAdjustmentRoundHandler,
  notifyGroupsHandler,
  getGroupStandingsHandler,
  getBracketHandler,
  getTournamentResultsHandler,
  updateHandicapHandler,
  addGroupsHandler,
  addPlayerToGroupHandler,
  getPendingPaymentsHandler,
} from "../controllers/tournament.controller.ts";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.ts";
import { UserRole } from "../models/enums.ts";

const router = Router();

// Accesos de admin y staff para operaciones de escritura
const adminOrStaff = [requireAuth, requireRole(UserRole.ADMIN, UserRole.STAFF)];

// ── CRUD base ──────────────────────────────────────────────────────────────
router.post("/",                 ...adminOrStaff, createTournament);
router.get("/",                  getTournaments);
router.get("/:id",               getTournamentById);
router.get("/:id/registrations", getTournamentRegistrations);

// ── Inscripciones ──────────────────────────────────────────────────────────
router.post("/:id/register",                        ...adminOrStaff, registerPlayerHandler);
router.patch("/:id/registrations/:userId/handicap", ...adminOrStaff, updateHandicapHandler);

// ── Bracket ────────────────────────────────────────────────────────────────
router.get("/:id/bracket",                              getBracketHandler);
router.get("/:id/results",                              getTournamentResultsHandler);
router.get("/:id/pending-payments",                     ...adminOrStaff, getPendingPaymentsHandler);
router.post("/:id/generate-bracket",                    ...adminOrStaff, generateBracketHandler);

// ── Grupos ─────────────────────────────────────────────────────────────────
router.get("/:id/group-standings",                      getGroupStandingsHandler);
router.post("/:id/groups",                              ...adminOrStaff, createGroupsHandler);
router.post("/:id/add-groups",                          ...adminOrStaff, addGroupsHandler);
router.post("/:id/groups/:groupId/add-player",          ...adminOrStaff, addPlayerToGroupHandler);
router.post("/:id/auto-groups",                         ...adminOrStaff, autoCreateGroupsHandler);
router.get("/:id/adjustment-round",                     getAdjustmentRoundHandler);
router.post("/:id/generate-adjustment-round",           ...adminOrStaff, generateAdjustmentRoundHandler);
router.post("/:id/generate-bracket-from-groups",        ...adminOrStaff, generateBracketFromGroupsHandler);

// ── Notificaciones ─────────────────────────────────────────────────────────
router.post("/:id/notify-groups",                       ...adminOrStaff, notifyGroupsHandler);

export default router;
