/**
 * routes/raffle.routes.ts — Rutas de rifas
 *
 * Base: /api/raffles
 *
 *   POST /                   → Crear rifa
 *   GET  /                   → Listar rifas
 *   GET  /:id                → Detalle de una rifa
 *   GET  /:id/numbers        → Listar números de la rifa
 *   GET  /:id/number-owners  → Listar números asignados con dueño
 *   GET  /:id/available-numbers → Listar números disponibles
 *   POST /:id/tickets        → Reservar o registrar compra de boletos
 *   POST /:id/draw           → Ejecutar sorteo y marcar ganador
 *   DELETE /:id              → Eliminar rifa y datos relacionados si es seguro
 */
import { Router } from "express";
import {
  createRaffle,
  deleteRaffle,
  drawRaffle,
  getAvailableRaffleNumbers,
  getRaffleById,
  getRaffleNumberOwners,
  getRaffleNumbers,
  getRaffles,
  purchaseRaffleTickets,
} from "../controllers/raffle.controller.js";
import { createWompiCheckout } from "../controllers/payment.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { UserRole } from "../models/enums.js";

const router = Router();
const adminOrStaff = [requireAuth, requireRole(UserRole.ADMIN, UserRole.STAFF)];

router.post("/", ...adminOrStaff, createRaffle);
router.get("/", getRaffles);
router.get("/:id", getRaffleById);
router.get("/:id/numbers", getRaffleNumbers);
router.get("/:id/number-owners", ...adminOrStaff, getRaffleNumberOwners);
router.get("/:id/available-numbers", getAvailableRaffleNumbers);
router.post("/:id/tickets", requireAuth, purchaseRaffleTickets);
router.post("/:id/wompi/checkout", requireAuth, createWompiCheckout);
router.post("/:id/draw", ...adminOrStaff, drawRaffle);
router.delete("/:id", ...adminOrStaff, deleteRaffle);

export default router;