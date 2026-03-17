/**
 * routes/user.routes.ts — Rutas de usuarios
 *
 * Base: /api/users
 *
 *   POST   /            → Crear usuario desde panel/admin/staff
 *   GET    /            → Listar usuarios (filtros: status, role, playerCategory, page, limit)
 *   GET    /:id         → Detalle de un usuario
 *   PATCH  /:id         → Actualizar campos parciales
 *   DELETE /:id         → Soft delete (marca deletedAt, no borra físicamente)
 */
import { Router } from "express";
import {
  createUser,
  getUsers,
  getUserById,
  getUserByPhone,
  updateUser,
  deleteUser,
  getUserByProvider,
  updateConversationState,
} from "../controllers/user.controller.ts";
// Endpoint público para obtener solo el estado conversacional de un canal
import { getConversationStateByUserId } from "../controllers/user.controller.ts";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.ts";
import { UserRole } from "../models/enums.ts";

const router = Router();

// Accesos de admin y staff para operaciones de escritura
const adminOrStaff = [requireAuth, requireRole(UserRole.ADMIN, UserRole.STAFF)];
// Solo admin puede eliminar usuarios
const adminOnly = [requireAuth, requireRole(UserRole.ADMIN)];

router.post("/",               ...adminOrStaff, createUser);

router.get("/",                ...adminOrStaff, getUsers);
router.get("/by-phone/:phone", ...adminOrStaff, getUserByPhone);  // debe ir ANTES de /:id
router.get("/by-provider/:provider/:providerId", getUserByProvider); // endpoint público para el bot
router.get("/:id",             ...adminOrStaff, getUserById);

// Endpoint público para obtener solo el estado conversacional de un canal
router.get("/:id/conversation-state", getConversationStateByUserId);
router.put("/:id/conversation-state", updateConversationState); // endpoint público para el bot
router.patch("/:id",           ...adminOrStaff, updateUser);
router.delete("/:id",          ...adminOnly,    deleteUser);

export default router;
