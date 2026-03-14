/**
 * controllers/auth.controller.ts — Login y registro web
 *
 * Endpoints:
 *   POST /api/auth/register  → Crea un usuario con credenciales web (email + password)
 *   POST /api/auth/login     → Valida credenciales y devuelve un JWT
 *   POST /api/auth/forgot-password → Genera token temporal para recuperar contraseña
 *   POST /api/auth/reset-password  → Cambia la contraseña usando el token temporal
 */
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import User from "../models/user.model.ts";
import { UserRole, Channel, UserStatus } from "../models/enums.ts";
import RevokedToken from "../models/revoked-token.model.ts";
import { isMailConfigured, sendPasswordResetEmail } from "../services/mail.service.ts";
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
export async function logout(req: Request, res: Response) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, message: "Token de autenticación requerido." });
  }
  const token = authHeader.slice(7);
  try {
    // Decodificar el token para obtener la expiración
    const decoded: any = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      return res.status(400).json({ ok: false, message: "Token inválido." });
    }
    const expiresAt = new Date(decoded.exp * 1000);
    await RevokedToken.create({ token, expiresAt });
    return res.json({ ok: true, message: "Sesión cerrada correctamente." });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Error al cerrar sesión." });
  }
}

const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = "30d";
const RESET_TOKEN_EXPIRY_MS = 1000 * 60 * 60;

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createResetToken() {
  const token = randomBytes(32).toString("hex");

  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
  };
}

function buildPasswordResetUrl(token: string) {
  const configuredBaseUrl = process.env.PASSWORD_RESET_URL_BASE?.trim();

  if (configuredBaseUrl) {
    const url = new URL(configuredBaseUrl);
    url.searchParams.set("token", token);
    return url.toString();
  }

  const frontendUrl = process.env.FRONTEND_URL?.trim() ?? process.env.ALLOWED_ORIGINS?.split(",")[0]?.trim();

  if (!frontendUrl) {
    throw new Error("No se encontró FRONTEND_URL o PASSWORD_RESET_URL_BASE para construir el link de recuperación.");
  }

  const url = new URL("/reset-password", frontendUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────────────────────
export async function register(req: Request, res: Response) {
  try {
    const { name, email, password, phone } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      phone?: string;
    };

    if (!name || !email || !password) {
      res.status(400).json({ ok: false, message: "name, email y password son obligatorios." });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ ok: false, message: "La contraseña debe tener al menos 8 caracteres." });
      return;
    }

    // Verificar si el email ya está registrado
    const normalizedEmail = normalizeEmail(email);
    const existing = await User.findOne({ "webAuth.email": normalizedEmail });
    if (existing) {
      res.status(409).json({ ok: false, message: "Este email ya está registrado." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const createData: Record<string, unknown> = {
      name: name.trim(),
      status: UserStatus.NEW,
      role: UserRole.CUSTOMER,           // rol por defecto: cliente
      identities: [{ provider: Channel.WEB, providerId: normalizedEmail }],
      webAuth: {
        email: normalizedEmail,
        passwordHash,
        emailVerified: false,
      },
    };
    if (phone?.trim()) createData.phone = phone.trim();

    const user = await User.create(createData);

    res.status(201).json({
      ok: true,
      data: {
        id: user._id,
        name: user.name,
        email: normalizedEmail,
        role: user.role,
      },
    });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(409).json({ ok: false, message: "Este email ya está registrado." });
      return;
    }
    res.status(500).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────
export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ ok: false, message: "email y password son obligatorios." });
      return;
    }

    // Buscar usuario y TRAER el hash (normalmente excluido)
    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({
      "webAuth.email": normalizedEmail,
      deletedAt: { $exists: false },
    }).select("+webAuth.passwordHash");

    // Mensaje genérico para no revelar si el email existe o no
    const INVALID_MSG = "Credenciales inválidas.";

    if (!user || !user.webAuth?.passwordHash) {
      res.status(401).json({ ok: false, message: INVALID_MSG });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.webAuth.passwordHash);
    if (!passwordMatch) {
      res.status(401).json({ ok: false, message: INVALID_MSG });
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ ok: false, message: "Error de configuración del servidor." });
      return;
    }

    const token = jwt.sign(
      { sub: user._id.toString(), role: user.role },
      secret,
      { expiresIn: TOKEN_EXPIRY },
    );

    res.json({
      ok: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.webAuth.email,
        role: user.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
// ─────────────────────────────────────────────────────────────────────────────
export async function forgotPassword(req: Request, res: Response) {
  try {
    const { email } = req.body as { email?: string };

    if (!email) {
      res.status(400).json({ ok: false, message: "email es obligatorio." });
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const genericMessage = "Si existe una cuenta con ese email, enviaremos instrucciones para recuperar la contraseña.";

    const user = await User.findOne({
      "webAuth.email": normalizedEmail,
      deletedAt: { $exists: false },
    });

    const responsePayload: Record<string, unknown> = {
      ok: true,
      message: genericMessage,
    };

    if (user?.webAuth?.email) {
      const { token, tokenHash, expiresAt } = createResetToken();
      const resetUrl = buildPasswordResetUrl(token);

      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            "webAuth.resetToken": tokenHash,
            "webAuth.resetTokenExpiresAt": expiresAt,
          },
        },
      );

      if (isMailConfigured()) {
        await sendPasswordResetEmail({
          to: user.webAuth.email,
          name: user.name,
          resetUrl,
          expiresAt,
        });
      }

      if (process.env.NODE_ENV !== "production" || !isMailConfigured()) {
        responsePayload.data = {
          resetToken: token,
          expiresAt,
          resetUrl,
          emailSent: isMailConfigured(),
        };
      }
    }

    res.json(responsePayload);
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/reset-password
// ─────────────────────────────────────────────────────────────────────────────
export async function resetPassword(req: Request, res: Response) {
  try {
    const { token, password } = req.body as { token?: string; password?: string };

    if (!token || !password) {
      res.status(400).json({ ok: false, message: "token y password son obligatorios." });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ ok: false, message: "La contraseña debe tener al menos 8 caracteres." });
      return;
    }

    const tokenHash = hashResetToken(token);
    const user = await User.findOne({
      "webAuth.resetToken": tokenHash,
      "webAuth.resetTokenExpiresAt": { $gt: new Date() },
      deletedAt: { $exists: false },
    });

    if (!user) {
      res.status(400).json({ ok: false, message: "El token de recuperación es inválido o expiró." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          "webAuth.passwordHash": passwordHash,
        },
        $unset: {
          "webAuth.resetToken": "",
          "webAuth.resetTokenExpiresAt": "",
        },
      },
    );

    res.json({ ok: true, message: "La contraseña fue actualizada correctamente." });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message });
  }
}
