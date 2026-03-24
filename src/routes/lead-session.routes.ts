import { Router } from "express";
import {
  ensureLeadSession,
  getLeadSession,
  promoteLeadSession,
  updateLeadSessionData,
  updateLeadSessionState,
} from "../controllers/lead-session.controller.ts";

const router = Router();

// Crea una sesión temporal si no existe o devuelve la existente.
router.post("/", ensureLeadSession);
// Consulta la sesión temporal activa de un contacto por canal e identificador externo.
router.get("/:channel/:providerId", getLeadSession);
// Actualiza el estado conversacional y los datos temporales del flujo del bot.
router.put("/:channel/:providerId/state", updateLeadSessionState);
// Actualiza los datos de negocio capturados del lead sin promoverlo todavía a usuario real.
router.patch("/:channel/:providerId/data", updateLeadSessionData);
// Convierte la sesión temporal en un usuario persistido del sistema.
router.post("/:channel/:providerId/promote", promoteLeadSession);

export default router;