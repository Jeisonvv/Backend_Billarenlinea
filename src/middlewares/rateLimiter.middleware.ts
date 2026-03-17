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

const BOT_API_KEY = process.env.BOT_API_KEY?.trim();

function isBotRequest(req: Request) {
  const botTokenHeader = req.headers["x-bot-token"];
  const botToken = Array.isArray(botTokenHeader) ? botTokenHeader[0] : botTokenHeader;

  if (!BOT_API_KEY || typeof botToken !== "string") {
    return false;
  }

  return botToken.trim() === BOT_API_KEY;
}

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
  // Si la petición trae la clave técnica del bot, no aplicar rate limit.
  if (isBotRequest(req)) {
    return next();
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
  if (isBotRequest(req)) {
    return next();
  }

  return authLimiterInstance(req, res, next);
};

