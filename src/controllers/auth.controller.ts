/**
 * controllers/auth.controller.ts — Login y registro web
 *
 * Endpoints:
 *   POST /api/auth/register  → Crea un usuario con credenciales web (email + password)
 *   POST /api/auth/login     → Valida credenciales y guarda un JWT en cookie httpOnly
 *   POST /api/auth/bot-login → Valida credenciales del bot y devuelve JWT en body
 *   POST /api/auth/forgot-password → Genera token temporal para recuperar contraseña
 *   POST /api/auth/reset-password  → Cambia la contraseña usando el token temporal
 */
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import User from "../models/user.model.ts";
import RevokedToken from "../models/revoked-token.model.ts";
import { isMailConfigured, sendPasswordResetEmail } from "../services/mail.service.ts";
import { createWebUserService } from "../services/user.service.ts";
import { clearAuthCookie, extractAuthToken, setAuthCookie } from "../utils/auth-token.ts";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
export async function logout(req: Request, res: Response) {
  const token = extractAuthToken(req);
  clearAuthCookie(res);

  if (!token) {
    return res.json({ ok: true, message: "Sesión cerrada correctamente." });
  }

  try {
    const decoded = jwt.decode(token) as jwt.JwtPayload | null;
    if (!decoded?.exp) {
      return res.json({ ok: true, message: "Sesión cerrada correctamente." });
    }

    await RevokedToken.updateOne(
      { token },
      { $setOnInsert: { token, expiresAt: new Date(decoded.exp * 1000) } },
      { upsert: true },
    );

    return res.json({ ok: true, message: "Sesión cerrada correctamente." });
  } catch {
    return res.status(500).json({ ok: false, message: "Error al cerrar sesión." });
  }
}

const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = "30d";
const RESET_TOKEN_EXPIRY_MS = 1000 * 60 * 60;

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

function getBotApiKey() {
  return process.env.BOT_API_KEY?.trim();
}

function getBotTokenHeader(req: Request) {
  const botTokenHeader = req.headers["x-bot-token"];
  return Array.isArray(botTokenHeader) ? botTokenHeader[0] : botTokenHeader;
}

function isAuthorizedBotRequest(req: Request) {
  const botApiKey = getBotApiKey();
  const botToken = getBotTokenHeader(req);

  if (!botApiKey || typeof botToken !== "string") {
    return false;
  }

  return botToken.trim() === botApiKey;
}

async function authenticateWebCredentials(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({
    "webAuth.email": normalizedEmail,
    deletedAt: { $exists: false },
  }).select("+webAuth.passwordHash");

  const invalidMessage = "Credenciales inválidas.";

  if (!user || !user.webAuth?.passwordHash) {
    return { error: invalidMessage } as const;
  }

  const passwordMatch = await bcrypt.compare(password, user.webAuth.passwordHash);
  if (!passwordMatch) {
    return { error: invalidMessage } as const;
  }

  return { user } as const;
}

function signAuthToken(user: { _id: { toString(): string }; role: unknown }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return { ok: false, error: "Error de configuración del servidor.", status: 500 } as const;
  }

  const token = jwt.sign(
    { sub: user._id.toString(), role: user.role },
    secret,
    { expiresIn: TOKEN_EXPIRY },
  );

  return { ok: true, token } as const;
}

function buildAuthenticatedUserPayload(user: {
  _id?: unknown;
  name?: string;
  webAuth?: { email?: string | undefined } | undefined;
  role?: unknown;
}) {
  return {
    ok: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.webAuth?.email,
      role: user.role,
    },
  };
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
    const user = await createWebUserService(req.body as {
      name?: string;
      email?: string;
      password?: string;
      phone?: string;
      identityDocument?: string;
    });

    res.status(201).json({
      ok: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.webAuth?.email,
        identityDocument: user.identityDocument,
        role: user.role,
      },
    });
  } catch (error: any) {
    if (
      error.message === "name, email y password son obligatorios."
      || error.message === "La contraseña debe tener al menos 8 caracteres."
      || error.message === "El documento de identidad es inválido."
    ) {
      res.status(400).json({ ok: false, message: error.message });
      return;
    }

    if (error.message === "Este usuario ya existe.") {
      const message = error.duplicateField === "identityDocument"
        ? "Este documento de identidad ya está registrado."
        : "Este email ya está registrado.";
      res.status(409).json({ ok: false, message });
      return;
    }

    if (error.code === 11000) {
      const message = error.keyPattern?.identityDocument
        ? "Este documento de identidad ya está registrado."
        : "Este email ya está registrado.";
      res.status(409).json({ ok: false, message });
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

    const authResult = await authenticateWebCredentials(email, password);
    if ("error" in authResult) {
      res.status(401).json({ ok: false, message: authResult.error });
      return;
    }

    const signedToken = signAuthToken(authResult.user);
    if (!signedToken.ok) {
      res.status(signedToken.status).json({ ok: false, message: signedToken.error });
      return;
    }

    if (isAuthorizedBotRequest(req)) {
      res.json({
        ...buildAuthenticatedUserPayload(authResult.user),
        token: signedToken.token,
      });
      return;
    }

    setAuthCookie(res, signedToken.token);

    res.json(buildAuthenticatedUserPayload(authResult.user));
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/bot-login
// ─────────────────────────────────────────────────────────────────────────────
export async function botLogin(req: Request, res: Response) {
  if (!getBotApiKey()) {
    res.status(500).json({ ok: false, message: "BOT_API_KEY no está configurado en el servidor." });
    return;
  }

  if (!isAuthorizedBotRequest(req)) {
    res.status(403).json({ ok: false, message: "Acceso restringido al bot." });
    return;
  }

  await login(req, res);
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
