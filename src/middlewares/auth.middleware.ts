/**
 * middlewares/auth.middleware.ts — Verificación de JWT y control de roles
 *
 * Exporta dos middlewares:
 *   - requireAuth   : verifica que el token JWT sea válido e inyecta req.user
 *   - requireRole   : después de requireAuth, verifica que el rol sea el permitido
 *
 * Uso en rutas:
 *   router.post("/", requireAuth, requireRole("ADMIN", "STAFF"), createTournament);
 */
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "../models/enums.ts";
import RevokedToken from "../models/revoked-token.model.ts";

interface JwtPayload {
  sub: string;
  role: UserRole;
}

// ─────────────────────────────────────────────────────────────────────────────
// requireAuth — falla con 401 si no hay token o es inválido
// ─────────────────────────────────────────────────────────────────────────────
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ ok: false, message: "Token de autenticación requerido." });
    return;
  }
  const token = authHeader.slice(7);
  // Verificar si el token está revocado
  const revoked = await RevokedToken.findOne({ token });
  if (revoked) {
    return res.status(401).json({ ok: false, message: "Token revocado. Por favor inicia sesión de nuevo." });
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ ok: false, message: "Error de configuración del servidor." });
    return;
  }
  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({ ok: false, message: "Token inválido o expirado." });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// requireRole — falla con 403 si el rol no está permitido
// Debe usarse SIEMPRE después de requireAuth
// ─────────────────────────────────────────────────────────────────────────────
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ ok: false, message: "No autenticado." });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        ok: false,
        message: `Acceso denegado. Se requiere uno de estos roles: ${roles.join(", ")}.`,
      });
      return;
    }

    next();
  };
}
