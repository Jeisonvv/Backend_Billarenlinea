/**
 * routes/auth.routes.ts — Rutas de autenticación
 *
 * Base: /api/auth
 *
 *   POST /register  → Crear cuenta web (email + password)
 *   POST /login     → Iniciar sesión → devuelve JWT
 */
import { Router } from "express";
import { register, login, logout } from "../controllers/auth.controller.ts";
import { authLimiter } from "../middlewares/rateLimiter.middleware.ts";

const router = Router();

// authLimiter aquí para proteger contra fuerza bruta (10 intentos / 15 min)

router.post("/register", authLimiter, register);
router.post("/login",    authLimiter, login);
router.post("/logout", logout);

export default router;
