/**
 * middlewares/rateLimiter.middleware.ts — Límite de peticiones (Rate Limiting)
 *
 * Previene ataques de fuerza bruta y abuso de la API limitando cuántas
 * peticiones puede hacer una misma IP en una ventana de tiempo.
 *
 * Exporta dos limitadores:
 *   - generalLimiter : 100 peticiones / 15 min para la API en general
 *   - authLimiter    : 10 intentos / 15 min para rutas de login/registro
 */

import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
dotenv.config();
import type { NextFunction, Request, Response  } from "express";

const BOT_JWT_TOKEN = process.env.BOT_JWT_TOKEN;

// ── Limitador general ─────────────────────────────────────────────────────────

const limiterInstance = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,                  // máximo 100 peticiones por IP en esa ventana
  standardHeaders: true,     // incluye los headers RateLimit-* en la respuesta
  legacyHeaders: false,      // deshabilita los headers X-RateLimit-* (obsoletos)
  message: {
    ok: false,
    message: "Demasiadas peticiones desde esta IP. Intenta de nuevo en 15 minutos.",
  },
});


export const generalLimiter = (req: Request, res: Response, next: NextFunction) => {
  // Si la petición tiene el JWT del bot, no aplicar rate limit
  const auth = req.headers["authorization"];
  if (auth && typeof auth === "string") {
    const token = auth.replace("Bearer ", "");
    if (token === BOT_JWT_TOKEN) {
      return next();
    } else {
      console.log("[RateLimit] Token recibido:", token);
      console.log("[RateLimit] Token esperado:", BOT_JWT_TOKEN);
    }
  }
  return limiterInstance(req, res, next);
};

// ── Limitador estricto para autenticación ─────────────────────────────────────
// Más restrictivo para dificultar ataques de fuerza bruta contra contraseñas

const authLimiterInstance = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                   // solo 10 intentos de login por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    message: "Demasiados intentos de autenticación. Intenta de nuevo en 15 minutos.",
  },
});

export const authLimiter = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers["authorization"];
  if (authHeader && typeof authHeader === "string") {
    const token = authHeader.replace("Bearer ", "");
    if (token === BOT_JWT_TOKEN) {
      return next();
    } else {
      console.log("[RateLimit-Auth] Token recibido:", token);
      console.log("[RateLimit-Auth] Token esperado:", BOT_JWT_TOKEN);
    }
  }
  return authLimiterInstance(req, res, next);
};

