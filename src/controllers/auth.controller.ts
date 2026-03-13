/**
 * controllers/auth.controller.ts — Login y registro web
 *
 * Endpoints:
 *   POST /api/auth/register  → Crea un usuario con credenciales web (email + password)
 *   POST /api/auth/login     → Valida credenciales y devuelve un JWT
 */
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.model.ts";
import { UserRole, Channel, UserStatus } from "../models/enums.ts";
import RevokedToken from "../models/revoked-token.model.ts";
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
    const existing = await User.findOne({ "webAuth.email": email.toLowerCase().trim() });
    if (existing) {
      res.status(409).json({ ok: false, message: "Este email ya está registrado." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const createData: Record<string, unknown> = {
      name: name.trim(),
      status: UserStatus.NEW,
      role: UserRole.CUSTOMER,           // rol por defecto: cliente
      identities: [{ provider: Channel.WEB, providerId: email.toLowerCase().trim() }],
      webAuth: {
        email: email.toLowerCase().trim(),
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
        email: email.toLowerCase().trim(),
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
    const user = await User.findOne({
      "webAuth.email": email.toLowerCase().trim(),
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
