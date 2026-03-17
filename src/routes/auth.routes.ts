/**
 * routes/auth.routes.ts — Rutas de autenticación
 *
 * Base: /api/auth
 *
 *   POST /register  → Crear cuenta web pública (email + password)
 *   POST /login     → Iniciar sesión → devuelve JWT
 *   POST /forgot-password → Solicitar recuperación de contraseña
 *   POST /reset-password  → Confirmar nueva contraseña con token
 */
import { Router } from "express";
import { register, login, logout, forgotPassword, resetPassword } from "../controllers/auth.controller.ts";
import { authLimiter } from "../middlewares/rateLimiter.middleware.ts";

const router = Router();

// authLimiter aquí para proteger contra fuerza bruta (10 intentos / 15 min)

router.post("/register", authLimiter, register);
router.post("/login",    authLimiter, login);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);
router.post("/logout", logout);

export default router;
