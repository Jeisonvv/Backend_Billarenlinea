import { Router } from "express";
import {
  getTransmissions,
  getTransmission,
  createTransmission,
  updateTransmission,
  deleteTransmission,
} from "../controllers/transmission.controller.ts";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.ts";
import { UserRole } from "../models/enums.ts";

const router = Router();

// Solo usuarios autenticados pueden gestionar transmisiones
router.get("/", requireAuth, getTransmissions);
router.get("/:id", requireAuth, getTransmission);
router.post("/", requireAuth, requireRole(UserRole.ADMIN, UserRole.STAFF), createTransmission);
router.put("/:id", requireAuth, requireRole(UserRole.ADMIN, UserRole.STAFF), updateTransmission);
router.delete("/:id", requireAuth, requireRole(UserRole.ADMIN, UserRole.STAFF), deleteTransmission);

export default router;
