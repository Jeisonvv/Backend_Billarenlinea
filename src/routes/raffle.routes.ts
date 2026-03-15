/**
 * routes/raffle.routes.ts — Rutas de rifas
 *
 * Base: /api/raffles
 *
 *   POST /                   → Crear rifa
 *   GET  /                   → Listar rifas
 *   GET  /:id                → Detalle de una rifa
 *   GET  /:id/numbers        → Listar números de la rifa
 *   GET  /:id/available-numbers → Listar números disponibles
 *   POST /:id/tickets        → Reservar o registrar compra de boletos
 *   POST /:id/draw           → Ejecutar sorteo y marcar ganador
 */
import { Router } from "express";
import {
  createRaffle,
  drawRaffle,
  getAvailableRaffleNumbers,
  getRaffleById,
  getRaffleNumbers,
  getRaffles,
  purchaseRaffleTickets,
} from "../controllers/raffle.controller.ts";
import { createWompiCheckout } from "../controllers/payment.controller.ts";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.ts";
import { UserRole } from "../models/enums.ts";

const router = Router();
const adminOrStaff = [requireAuth, requireRole(UserRole.ADMIN, UserRole.STAFF)];

router.post("/", ...adminOrStaff, createRaffle);
router.get("/", getRaffles);
router.get("/:id", getRaffleById);
router.get("/:id/numbers", getRaffleNumbers);
router.get("/:id/available-numbers", getAvailableRaffleNumbers);
router.post("/:id/tickets", requireAuth, purchaseRaffleTickets);
router.post("/:id/wompi/checkout", requireAuth, createWompiCheckout);
router.post("/:id/draw", ...adminOrStaff, drawRaffle);

export default router;